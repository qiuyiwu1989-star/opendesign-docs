import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { inspectHtml } from '../../src/html';
import { buildCandidate } from './candidate';
import { LocalProjectRepository, ProjectRevisionConflict } from './projects';
import { principalFromVerifiedSession, StudioAccessError, type Principal } from './access';
const owner = principalFromVerifiedSession({ kind: 'user', userId: 'owner-a' });
const anonymous = principalFromVerifiedSession({ kind: 'anonymous', sessionId: 'owner-a' });
const other = principalFromVerifiedSession({ kind: 'user', userId: 'owner-b' });
const source = '<!DOCTYPE html>\r\n<!-- 中文保留 -->\n<h1 class=\'title\'>原始标题 &amp; 图像</h1>\n<style>h1 { color: red; }</style>';
const directories: string[] = [];
async function setup() { const directory = await mkdtemp(join(tmpdir(), 'studio-projects-')); directories.push(directory); return { directory, repository: new LocalProjectRepository(directory) }; }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
describe('local owner-scoped project repository', () => {
  it('round trips exact HTML, immutable history and private permissions across instances', async () => {
    const { directory, repository } = await setup();
    const first = await repository.create(owner, source);
    const saved = await repository.save(owner, first.id, first.headRevision, source.replace('原始标题', '新标题'));
    expect(saved.revisions[0]).toEqual(first.revisions[0]);
    expect(saved.revisions[1]?.parentId).toBe(first.headRevision);
    const reopened = new LocalProjectRepository(directory);
    expect(await reopened.read(owner, first.id)).toEqual(saved);
    expect((await reopened.readRevision(owner, first.id, first.headRevision)).source).toBe(source);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(join(directory, `${first.id}.json`))).mode & 0o777).toBe(0o600);
    expect(await readdir(directory)).toEqual([`${first.id}.json`]);
  });
  it('rejects another user and anonymous session with identical identity string', async () => {
    const { repository } = await setup(); const first = await repository.create(owner, source);
    for (const actor of [other, anonymous]) {
      await expect(repository.read(actor, first.id)).rejects.toThrow(StudioAccessError);
      await expect(repository.readRevision(actor, first.id, first.headRevision)).rejects.toThrow(StudioAccessError);
      await expect(repository.save(actor, first.id, first.headRevision, '<h1>bad</h1>')).rejects.toThrow(StudioAccessError);
    }
    expect(await repository.read(owner, first.id)).toEqual(first);
    const anonymousProject = await repository.create(anonymous, source);
    await expect(repository.read(owner, anonymousProject.id)).rejects.toThrow(StudioAccessError);
  });
  it('allows only one concurrent compare-save across separate instances', async () => {
    const { repository, directory } = await setup(); const first = await repository.create(owner, source);
    const secondInstance = new LocalProjectRepository(directory);
    const results = await Promise.allSettled([repository.save(owner, first.id, first.headRevision, '<p>A</p>'), secondInstance.save(owner, first.id, first.headRevision, '<p>B</p>')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(result => result.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toBeInstanceOf(ProjectRevisionConflict);
    const read = await repository.read(owner, first.id);
    expect(read.revisions).toHaveLength(2); expect(read.revisions[0]?.source).toBe(source);
  });
  it('does not allow a revision belonging to a different project', async () => {
    const { repository } = await setup(); const first = await repository.create(owner, source), second = await repository.create(owner, source);
    await expect(repository.readRevision(owner, first.id, second.headRevision)).rejects.toThrow(StudioAccessError);
    await expect(repository.save(owner, first.id, second.headRevision, source)).rejects.toThrow(ProjectRevisionConflict);
  });
  it('rejects invalid sources and ids without changing existing history', async () => {
    const { repository } = await setup(); const first = await repository.create(owner, source);
    for (const invalid of ['', ' ', 'x'.repeat(200001), '\ud800']) {
      await expect(repository.create(owner, invalid)).rejects.toThrow();
      await expect(repository.save(owner, first.id, first.headRevision, invalid)).rejects.toThrow();
    }
    for (const id of ['../outside', '/tmp/file', '', 'not-uuid']) {
      await expect(repository.read(owner, id)).rejects.toThrow(StudioAccessError);
      await expect(repository.save(owner, id, first.headRevision, source)).rejects.toThrow(StudioAccessError);
      await expect(repository.readRevision(owner, first.id, id)).rejects.toThrow(StudioAccessError);
    }
    await expect(repository.create({ kind: 'admin', id: 'x' } as unknown as Principal, source)).rejects.toThrow(StudioAccessError);
    expect(await repository.read(owner, first.id)).toEqual(first);
    expect((await repository.create(owner, 'x'.repeat(200000))).revisions[0]?.source.length).toBe(200000);
  });
  it('rejects corrupted records without overwriting them', async () => {
    const { directory, repository } = await setup(); const first = await repository.create(owner, source);
    const path = join(directory, `${first.id}.json`), corrupted = JSON.stringify({ ...first, headRevision: randomUUID() });
    await writeFile(path, corrupted);
    await expect(repository.save(owner, first.id, first.headRevision, source)).rejects.toThrow();
    expect(await readFile(path, 'utf8')).toBe(corrupted);
    await writeFile(path, JSON.stringify({ ...first, revisions: [{ ...first.revisions[0], source: '<p>Tampered</p>' }] }));
    await expect(repository.read(owner, first.id)).rejects.toThrow('源码校验');
  });
  it('does not follow project file symlinks', async () => {
    const { directory, repository } = await setup(); const first = await repository.create(owner, source), linkId = randomUUID();
    await symlink(join(directory, `${first.id}.json`), join(directory, `${linkId}.json`));
    await expect(repository.read(owner, linkId)).rejects.toThrow();
    expect(await repository.read(owner, first.id)).toEqual(first);
  });
  it('bounds history to twenty revisions without deleting old versions', async () => {
    const { repository } = await setup(); let project = await repository.create(owner, source); const firstId = project.headRevision;
    for (let index = 1; index < 20; index++) project = await repository.save(owner, project.id, project.headRevision, `<p>${index}</p>`);
    await expect(repository.save(owner, project.id, project.headRevision, '<p>21</p>')).rejects.toThrow('20');
    expect((await repository.readRevision(owner, project.id, firstId)).source).toBe(source);
    expect((await repository.read(owner, project.id)).revisions).toHaveLength(20);
  });
});

function proposal(id: string, html = source, after = '清晰标题') {
  return buildCandidate({ id, source: html, label: '' }, inspectHtml(html).targets.find(target => target.tag === 'h1')!.id, after);
}
describe('atomic candidate acceptance', () => {
  it('replays acceptance after later saves and restart without appending again', async () => {
    const { repository, directory } = await setup(), project = await repository.create(owner, source), jobId = randomUUID();
    const candidate = proposal(project.headRevision);
    const accepted = await repository.acceptCandidate(owner, project.id, jobId, candidate);
    expect(accepted.source).toBe(source.replace('原始标题 &amp; 图像', '清晰标题'));
    expect(accepted.acceptedJobId).toBe(jobId);
    await repository.save(owner, project.id, accepted.id, '<p>Later manual change</p>');
    const reopened = new LocalProjectRepository(directory);
    expect(await reopened.acceptCandidate(owner, project.id, jobId, candidate)).toEqual(accepted);
    expect((await reopened.read(owner, project.id)).revisions).toHaveLength(3);
    await expect(reopened.acceptCandidate(owner, project.id, jobId, proposal(project.headRevision, source, '另一标题'))).rejects.toThrow('其他候选');
    expect((await reopened.read(owner, project.id)).revisions).toHaveLength(3);
  });
  it('serializes different candidates on one base revision and duplicates of one job', async () => {
    const { repository, directory } = await setup(), project = await repository.create(owner, source);
    const second = new LocalProjectRepository(directory), candidate = proposal(project.headRevision), jobId = randomUUID();
    const copies = await Promise.all([repository.acceptCandidate(owner, project.id, jobId, candidate), second.acceptCandidate(owner, project.id, jobId, candidate)]);
    expect(copies[0]).toEqual(copies[1]);
    const another = await repository.create(owner, source), base = proposal(another.headRevision);
    const results = await Promise.allSettled([repository.acceptCandidate(owner, another.id, randomUUID(), base), second.acceptCandidate(owner, another.id, randomUUID(), { ...base, after: '另一个候选' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(result => result.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toBeInstanceOf(ProjectRevisionConflict);
    expect((await repository.read(owner, another.id)).revisions).toHaveLength(2);
  });
  it('rejects cross-owner and tampered candidates without receipt or source change', async () => {
    const { repository, directory } = await setup(), project = await repository.create(owner, source);
    const candidate = proposal(project.headRevision), path = join(directory, `${project.id}.json`), before = await readFile(path, 'utf8');
    for (const actor of [other, anonymous]) await expect(repository.acceptCandidate(actor, project.id, randomUUID(), candidate)).rejects.toThrow(StudioAccessError);
    for (const tampered of [
      { ...candidate, before: 'forged' }, { ...candidate, baseId: randomUUID() },
      { ...candidate, baseSource: source + ' ' }, { ...candidate, targetId: 'missing' },
      { ...candidate, after: 'x'.repeat(41) }, { ...candidate, owner },
    ]) await expect(repository.acceptCandidate(owner, project.id, randomUUID(), tampered)).rejects.toThrow();
    await expect(repository.acceptCandidate(owner, project.id, '../bad', candidate)).rejects.toThrow();
    expect(await readFile(path, 'utf8')).toBe(before);
  });
  it('enforces capacity but allows an existing receipt replay at capacity', async () => {
    const { repository } = await setup(); let project = await repository.create(owner, source);
    const candidate = proposal(project.headRevision), jobId = randomUUID();
    const accepted = await repository.acceptCandidate(owner, project.id, jobId, candidate);
    for (let i = 2; i < 20; i++) project = await repository.save(owner, project.id, i === 2 ? accepted.id : project.headRevision, source);
    expect(await repository.acceptCandidate(owner, project.id, jobId, candidate)).toEqual(accepted);
    await expect(repository.acceptCandidate(owner, project.id, randomUUID(), proposal(project.headRevision))).rejects.toThrow('20');
    expect((await repository.read(owner, project.id)).revisions).toHaveLength(20);
  });
  it('rejects duplicated or malformed persisted acceptance receipts', async () => {
    const { repository, directory } = await setup(), project = await repository.create(owner, source), jobId = randomUUID();
    const accepted = await repository.acceptCandidate(owner, project.id, jobId, proposal(project.headRevision));
    const next = await repository.save(owner, project.id, accepted.id, source), path = join(directory, `${project.id}.json`);
    await writeFile(path, JSON.stringify({ ...next, revisions: next.revisions.map((revision, index) => index === 2 ? { ...revision, acceptedJobId: jobId, candidateHash: accepted.candidateHash } : revision) }));
    await expect(repository.read(owner, project.id)).rejects.toThrow('接受记录');
    await writeFile(path, JSON.stringify({ ...next, revisions: next.revisions.map((revision, index) => index === 1 ? { ...revision, candidateHash: 'bad' } : revision) }));
    await expect(repository.read(owner, project.id)).rejects.toThrow('接受记录');
  });
});

describe('retry-safe project creation and saves', () => {
  it('replays concurrent creation and restart with original source after later saves', async () => {
    const { repository, directory } = await setup(), id = randomUUID();
    const results = await Promise.all([repository.create(owner, source, id), new LocalProjectRepository(directory).create(owner, source, id)]);
    expect(results[0]).toEqual(results[1]);
    const latest = await repository.save(owner, id, results[0]!.headRevision, '<p>Later</p>');
    const reopened = new LocalProjectRepository(directory);
    expect(await reopened.create(owner, source, id)).toEqual(latest);
    await expect(reopened.create(other, source, id)).rejects.toThrow(StudioAccessError);
    await expect(reopened.create(anonymous, source, id)).rejects.toThrow(StudioAccessError);
    await expect(reopened.create(owner, '<p>Changed initial</p>', id)).rejects.toThrow('其他初稿');
    await expect(reopened.create(owner, source, '../outside')).rejects.toThrow();
    expect(await reopened.read(owner, id)).toEqual(latest);
  });
  it('replays a save operation after restart and newer head without appending', async () => {
    const { repository, directory } = await setup(), project = await repository.create(owner, source), operationId = randomUUID();
    const saved = await repository.save(owner, project.id, project.headRevision, '<p>Saved</p>', operationId);
    expect(saved.revisions.at(-1)?.savedOperationId).toBe(operationId);
    const latest = await repository.save(owner, project.id, saved.headRevision, '<p>Newer</p>');
    const reopened = new LocalProjectRepository(directory);
    expect(await reopened.save(owner, project.id, project.headRevision, '<p>Saved</p>', operationId)).toEqual(latest);
    await expect(reopened.save(owner, project.id, project.headRevision, '<p>Tampered</p>', operationId)).rejects.toThrow('其他修改');
    await expect(reopened.save(owner, project.id, saved.headRevision, '<p>Saved</p>', operationId)).rejects.toThrow('其他修改');
    await expect(reopened.save(other, project.id, project.headRevision, '<p>Saved</p>', operationId)).rejects.toThrow(StudioAccessError);
    expect((await reopened.read(owner, project.id)).revisions).toHaveLength(3);
  });
  it('serializes duplicate saves and still rejects competing CAS writes', async () => {
    const { repository, directory } = await setup(), project = await repository.create(owner, source), operationId = randomUUID();
    const otherRepo = new LocalProjectRepository(directory);
    const duplicates = await Promise.all([repository.save(owner, project.id, project.headRevision, '<p>Saved</p>', operationId), otherRepo.save(owner, project.id, project.headRevision, '<p>Saved</p>', operationId)]);
    expect(duplicates[0]).toEqual(duplicates[1]);
    await expect(repository.save(owner, project.id, project.headRevision, '<p>Competing</p>', randomUUID())).rejects.toThrow(ProjectRevisionConflict);
    expect((await repository.read(owner, project.id)).revisions).toHaveLength(2);
  });
});
