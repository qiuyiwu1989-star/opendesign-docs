import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { inspectHtml } from '../../src/html';
import { buildCandidate } from './candidate';
import { ArkRequestError } from './ark';
import { LocalAgentJobs } from './jobs';
import type { TextProposal } from '../../src/studio-model';
const version = { id: 'v1', label: 'initial', source: '<h1>Original</h1><p>Keep this</p>' };
const request = { version, targetId: inspectHtml(version.source).targets[0]!.id, instruction: 'PRIVATE-INSTRUCTION' };
const candidate = buildCandidate(version, request.targetId, 'Improved');
const directories: string[] = [];
const services: LocalAgentJobs[] = [];
async function fixture(execute: ConstructorParameters<typeof LocalAgentJobs>[1]) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-agent-jobs-')); directories.push(directory);
  const jobs = new LocalAgentJobs(directory, execute); services.push(jobs); await jobs.initialize();
  return { jobs, directory };
}
function deferred() { let resolve!: (value: TextProposal) => void; const promise = new Promise<TextProposal>(r => { resolve = r; }); return { promise, resolve }; }
async function settled(jobs: LocalAgentJobs, id: string) {
  for (let i = 0; i < 50; i++) {
    const record = await jobs.get(id);
    if (record?.status !== 'running') return record;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  throw new Error('Job did not settle');
}
afterEach(async () => { await Promise.all(services.splice(0).map(job => job.close())); await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('local persistent agent jobs', () => {
  it('binds idempotency to owner/project, snapshots bindings and preserves them after restart', async () => {
    const work = deferred(); const { jobs, directory } = await fixture(() => work.promise);
    const binding = { owner: { kind: 'anonymous' as const, id: 'owner-a' }, projectId: 'project-a', baseRevision: version.id };
    const expected = structuredClone(binding), id = randomUUID();
    const pending = jobs.start(request, id, binding);
    binding.owner.id = 'mutated-after-call';
    const record = await pending;
    expect(record.binding).toEqual(expected);
    expect((await jobs.start(request, id, expected)).binding).toEqual(expected);
    await expect(jobs.start(request, id, { ...expected, projectId: 'project-b' })).rejects.toThrow('其他请求');
    await expect(jobs.start(request, id, { ...expected, owner: { kind: 'anonymous', id: 'owner-b' } })).rejects.toThrow('其他请求');
    await expect(jobs.start(request, id)).rejects.toThrow('其他请求');
    (record.binding!.owner as { id: string }).id = 'modified-return';
    expect((await jobs.get(id))?.binding).toEqual(expected);
    work.resolve(candidate); await settled(jobs, id); await jobs.close();
    const restarted = new LocalAgentJobs(directory, async () => { throw new Error('must not execute'); }); services.push(restarted);
    expect((await restarted.get(id))?.binding).toEqual(expected);
    expect((await restarted.start(request, id, expected)).status).toBe('candidate');
    expect((await restarted.list())[0]).not.toHaveProperty('binding');
  });
  it('rejects malformed binding and mismatched base revision before starting', async () => {
    const { jobs } = await fixture(async () => candidate);
    const binding = { owner: { kind: 'anonymous' as const, id: 'owner-a' }, projectId: 'project-a', baseRevision: version.id };
    await expect(jobs.start(request, undefined, { ...binding, baseRevision: 'other' })).rejects.toThrow('基准版本');
    await expect(jobs.start(request, undefined, { ...binding, projectId: '../escape' })).rejects.toThrow();
    await expect(jobs.start(request, undefined, { ...binding, extra: true } as typeof binding)).rejects.toThrow();
    expect(await jobs.list()).toEqual([]);
  });
  it('keeps legacy unbound fingerprints unchanged across restart', async () => {
    const { jobs, directory } = await fixture(async () => candidate);
    const job = await jobs.start(request); await settled(jobs, job.id); await jobs.close();
    const expectedHash = createHash('sha256').update(JSON.stringify([version.id,version.source,request.targetId,request.instruction])).digest('hex');
    expect(JSON.parse(await readFile(join(directory, `${job.id}.json`),'utf8')).requestHash).toBe(expectedHash);
    const restarted = new LocalAgentJobs(directory, async () => { throw new Error('must not execute'); }); services.push(restarted);
    const replay = await restarted.start(request, job.id);
    expect(replay.status).toBe('candidate'); expect(replay.binding).toBeUndefined();
  });
  it('ignores persisted invalid bindings and candidate revision mismatch', async () => {
    const { jobs, directory } = await fixture(async () => candidate); await jobs.close();
    const ids = [randomUUID(), randomUUID()], date = new Date().toISOString();
    const binding = { owner: { kind: 'anonymous', id: 'owner-a' }, projectId: 'project-a', baseRevision: version.id };
    await writeFile(join(directory, `${ids[0]}.json`), JSON.stringify({ id: ids[0], status: 'candidate', candidate, binding: { ...binding, owner: {kind:'admin',id:'a'} }, createdAt:date, updatedAt:date }));
    await writeFile(join(directory, `${ids[1]}.json`), JSON.stringify({ id: ids[1], status: 'candidate', candidate, binding: { ...binding, baseRevision:'other' }, createdAt:date, updatedAt:date }));
    const restarted = new LocalAgentJobs(directory, async () => candidate); services.push(restarted);
    expect(await restarted.list()).toEqual([]);
  });
  it('reuses a client UUID for concurrent identical starts and rejects changed inputs', async () => {
    const work = deferred(); let calls = 0;
    const { jobs, directory } = await fixture(async () => { calls++; return work.promise; });
    const id = randomUUID();
    const [first, retry] = await Promise.all([jobs.start(request, id), jobs.start(request, id)]);
    expect(first.id).toBe(id); expect(retry).toEqual(first); expect(calls).toBe(1);
    await expect(jobs.start({ ...request, instruction: 'different' }, id)).rejects.toThrow('其他请求');
    await expect(jobs.start({ ...request, version: { ...version, id: 'v2' } }, id)).rejects.toThrow('其他请求');
    await expect(jobs.start({ ...request, version: { ...version, source: version.source + ' ' } }, id)).rejects.toThrow('其他请求');
    const otherTarget = inspectHtml(version.source).targets.find(item => item.tag === 'p')!.id;
    await expect(jobs.start({ ...request, targetId: otherTarget }, id)).rejects.toThrow('其他请求');
    await expect(jobs.start(request, '../outside')).rejects.toThrow('标识无效');
    const raw = await readFile(join(directory, `${id}.json`), 'utf8');
    expect(JSON.parse(raw).requestHash).toMatch(/^[0-9a-f]{64}$/); expect(raw).not.toContain(request.instruction);
    expect(await readdir(directory)).toHaveLength(1);
    work.resolve(candidate); await settled(jobs, id);
  });
  it.each(['candidate', 'failed', 'cancelled', 'interrupted'] as const)('replays %s status after restart without invoking the model', async status => {
    const work = deferred();
    const { jobs, directory } = await fixture(async () => {
      if (status === 'failed') throw new Error('private provider error');
      if (status === 'candidate') return candidate;
      return work.promise;
    });
    const id = randomUUID(); await jobs.start(request, id);
    if (status === 'candidate' || status === 'failed') await settled(jobs, id);
    if (status === 'cancelled') await jobs.cancel(id);
    await jobs.close();
    let calls = 0;
    const restored = new LocalAgentJobs(directory, async () => { calls++; return candidate; }); services.push(restored);
    const result = await restored.start(request, id);
    expect(result.status).toBe(status); expect(result.id).toBe(id); expect(calls).toBe(0);
    expect((await restored.start(request, id)).status).toBe(status);
    expect(await readdir(directory)).toHaveLength(1);
    work.resolve(candidate);
  });
  it('reads legacy records but refuses unsafe reuse when no request hash exists', async () => {
    const { jobs, directory } = await fixture(async () => candidate); await jobs.close();
    const id = randomUUID(), date = new Date().toISOString();
    await writeFile(join(directory, `${id}.json`), JSON.stringify({ id, status: 'candidate', candidate, createdAt: date, updatedAt: date }));
    const restored = new LocalAgentJobs(directory, async () => candidate); services.push(restored);
    expect((await restored.get(id))?.candidate).toEqual(candidate);
    await expect(restored.start(request, id)).rejects.toThrow('其他请求');
  });
  it('restores a completed candidate, stores no instruction, and uses private permissions', async () => {
    const { jobs, directory } = await fixture(async () => candidate);
    const started = await jobs.start(request);
    expect(started.status).toBe('running');
    expect((await settled(jobs, started.id))?.candidate).toEqual(candidate);
    await jobs.close();
    const restored = new LocalAgentJobs(directory, async () => { throw new Error('must not rerun'); }); services.push(restored);
    expect((await restored.get(started.id))?.candidate).toEqual(candidate);
    const raw = await readFile(join(directory, `${started.id}.json`), 'utf8');
    expect(raw).not.toContain('PRIVATE-INSTRUCTION');
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(join(directory, `${started.id}.json`))).mode & 0o777).toBe(0o600);
  });
  it('marks persisted running jobs interrupted on restart without executing', async () => {
    const { jobs, directory } = await fixture(async () => candidate);
    const id = randomUUID(), date = new Date().toISOString();
    await writeFile(join(directory, `${id}.json`), JSON.stringify({ id, status: 'running', createdAt: date, updatedAt: date }));
    await jobs.close();
    let calls = 0;
    const restarted = new LocalAgentJobs(directory, async () => { calls++; return candidate; }); services.push(restarted);
    expect((await restarted.get(id))?.status).toBe('interrupted');
    expect(calls).toBe(0);
    expect(JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8')).status).toBe('interrupted');
  });
  it('cancellation wins against late results and a new job is not affected', async () => {
    const work = deferred(); let signal: AbortSignal | undefined;
    const { jobs } = await fixture(async (_, nextSignal) => { signal = nextSignal; return work.promise; });
    const first = await jobs.start(request);
    expect((await jobs.cancel(first.id))?.status).toBe('cancelled');
    expect(signal?.aborted).toBe(true);
    const second = await jobs.start(request);
    work.resolve(candidate);
    expect((await settled(jobs, second.id))?.status).toBe('candidate');
    expect((await jobs.get(first.id))?.status).toBe('cancelled');
  });
  it('rejects an executor result for a different revision', async () => {
    const { jobs } = await fixture(async () => ({ ...candidate, baseId: 'other-revision' }));
    const job = await jobs.start(request);
    const result = await settled(jobs, job.id);
    expect(result?.status).toBe('failed'); expect(result?.candidate).toBeUndefined();
  });
  it('persists only an allowlisted provider failure code, never its sensitive message', async () => {
    const error = new ArkRequestError('provider', 429); error.message = 'Bearer TOP-SECRET raw response';
    const { jobs, directory } = await fixture(async () => { throw error; });
    const job = await jobs.start(request);
    expect((await settled(jobs, job.id))?.failureCode).toBe('provider');
    expect((await jobs.get(job.id))?.providerStatus).toBe(429);
    expect(await readFile(join(directory, `${job.id}.json`), 'utf8')).not.toMatch(/TOP-SECRET|Bearer|raw response/);
    expect((await jobs.list())[0]).not.toHaveProperty('failureCode');
    await jobs.close(); const restarted = new LocalAgentJobs(directory, async () => candidate); services.push(restarted);
    expect((await restarted.get(job.id))?.failureCode).toBe('provider');
    expect((await restarted.get(job.id))?.providerStatus).toBe(429);
  });
  it('classifies unknown exceptions as execution instead of trusting arbitrary error codes', async () => {
    const { jobs } = await fixture(async () => { throw { code: 'provider', message: 'PRIVATE' }; });
    const job = await jobs.start(request);
    expect((await settled(jobs, job.id))?.failureCode).toBe('execution');
  });
  it('redacts provider error details from persisted records', async () => {
    const { jobs, directory } = await fixture(async () => { throw new Error('Bearer SECRET_API_KEY provider raw response'); });
    const job = await jobs.start(request);
    expect((await settled(jobs, job.id))?.status).toBe('failed');
    expect(await readFile(join(directory, `${job.id}.json`), 'utf8')).not.toMatch(/SECRET|Bearer|provider raw/);
  });
  it('serializes simultaneous starts and rejects a second active task', async () => {
    const work = deferred(); const { jobs } = await fixture(() => work.promise);
    const results = await Promise.allSettled([jobs.start(request), jobs.start(request)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason.message).toContain('已有任务');
    await jobs.close(); work.resolve(candidate);
    const succeeded = results.find(result => result.status === 'fulfilled');
    if (succeeded?.status === 'fulfilled') expect((await jobs.get(succeeded.value.id))?.status).toBe('interrupted');
    await expect(jobs.start(request)).rejects.toThrow('关闭');
  });
  it('ignores malformed, symlinked and mismatched records and disallows traversal', async () => {
    const { jobs, directory } = await fixture(async () => candidate); await jobs.close();
    const bad = randomUUID(), mismatch = randomUUID(), link = randomUUID();
    await writeFile(join(directory, `${bad}.json`), '{broken');
    await writeFile(join(directory, `${mismatch}.json`), JSON.stringify({ id: bad, status: 'candidate' }));
    await symlink(join(directory, `${bad}.json`), join(directory, `${link}.json`));
    const restored = new LocalAgentJobs(directory, async () => candidate); services.push(restored);
    expect(await restored.get(bad)).toBeUndefined(); expect(await restored.get(mismatch)).toBeUndefined(); expect(await restored.get(link)).toBeUndefined();
    expect(await restored.get('../outside')).toBeUndefined(); expect(await restored.cancel('../outside')).toBeUndefined();
    expect(await readdir(directory)).toHaveLength(3);
  });
  it('lists only summaries and rejects running removal, including concurrent removals', async () => {
    const work = deferred(); const { jobs, directory } = await fixture(() => work.promise);
    const job = await jobs.start(request);
    await expect(jobs.remove(job.id)).rejects.toThrow('运行中');
    expect(await jobs.remove('../outside')).toBe(false);
    expect(await jobs.remove(randomUUID())).toBe(false);
    work.resolve(candidate); await settled(jobs, job.id);
    const summaries = await jobs.list();
    expect(summaries).toHaveLength(1);
    expect(Object.keys(summaries[0]!).sort()).toEqual(['createdAt', 'id', 'status', 'updatedAt']);
    expect(JSON.stringify(summaries)).not.toMatch(/Original|Improved|requestHash|baseSource|PRIVATE/);
    summaries[0]!.status = 'running';
    expect((await jobs.list())[0]!.status).toBe('candidate');
    expect(await Promise.all([jobs.remove(job.id), jobs.remove(job.id)])).toEqual([true, false]);
    expect(await readdir(directory)).toHaveLength(0);
    expect(await jobs.get(job.id)).toBeUndefined();
    await jobs.close();
    const restored = new LocalAgentJobs(directory, async () => candidate); services.push(restored);
    expect(await restored.list()).toEqual([]);
  });
  it('explicit terminal cleanup restores capacity at 100 records and survives restart', async () => {
    const { jobs, directory } = await fixture(async () => candidate); await jobs.close();
    const ids = Array.from({ length: 100 }, () => randomUUID()), date = new Date().toISOString();
    await Promise.all(ids.map(id => writeFile(join(directory, `${id}.json`), JSON.stringify({ id, status: 'cancelled', createdAt: date, updatedAt: date }))));
    const restored = new LocalAgentJobs(directory, async () => candidate); services.push(restored);
    await expect(restored.start(request)).rejects.toThrow('100');
    expect(await restored.remove(ids[0]!)).toBe(true);
    const added = await restored.start(request); await settled(restored, added.id);
    expect(await restored.list()).toHaveLength(100);
    await restored.close();
    const restarted = new LocalAgentJobs(directory, async () => candidate); services.push(restarted);
    expect(await restarted.list()).toHaveLength(100);
    expect(await restarted.get(ids[0]!)).toBeUndefined();
    expect((await restarted.get(added.id))?.status).toBe('candidate');
  });
  it('caps persisted records without deleting existing jobs', async () => {
    const { jobs, directory } = await fixture(async () => candidate); await jobs.close();
    await Promise.all(Array.from({ length: 100 }, () => writeFile(join(directory, `${randomUUID()}.json`), '{}')));
    const restored = new LocalAgentJobs(directory, async () => candidate); services.push(restored);
    await expect(restored.start(request)).rejects.toThrow('100');
    expect(await readdir(directory)).toHaveLength(100);
  });
});
