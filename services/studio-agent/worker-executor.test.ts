import { fork, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectHtml } from '../../src/html';
import { proposeText } from '../../src/studio-model';
import { createWorkerExecutor, runInWorker } from './worker-executor';
const version = { id: 'v1', source: '<h1>原标题</h1>', label: '' };
const targetId = inspectHtml(version.source).targets[0]!.id;
const request = { version, targetId, instruction: '修改标题' };
const candidate = proposeText(version, targetId, '新标题');
const dirs: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture(body: string, timeoutMs = 1000) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-worker-')); dirs.push(directory);
  const workerPath = join(directory, 'fixture.mjs');
  await writeFile(workerPath, `process.on('message', async message => { ${body} });`);
  let child: ChildProcess | undefined;
  const execute = createWorkerExecutor({ workerPath, timeoutMs, killGraceMs: 30, forkProcess: (path, args, options) => { child = fork(path, args, options); return child; } });
  return { execute, child: () => child! };
}
describe('isolated candidate worker process', () => {
  it('returns a verified candidate and terminates the child before resolving', async () => {
    const work = await fixture(`process.send(${JSON.stringify({ type: 'candidate', candidate })}); setInterval(()=>{},1000);`);
    expect(await work.execute(request)).toEqual(candidate);
    expect(work.child().exitCode !== null || work.child().signalCode !== null).toBe(true);
  });
  it('redacts crash details and reaps an exited process', async () => {
    const work = await fixture(`console.error('SECRET_PROVIDER_BODY'); process.exit(7);`);
    await expect(work.execute(request)).rejects.toThrow('Worker 意外退出');
    expect(work.child().exitCode).toBe(7);
  });
  it('times out and SIGKILLs a worker ignoring SIGTERM', async () => {
    const work = await fixture(`process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);`, 180);
    await expect(work.execute(request)).rejects.toMatchObject({ code: 'timeout' });
    expect(work.child().signalCode).toBe('SIGKILL');
  });
  it('aborts running work and ignores any delayed candidate', async () => {
    const work = await fixture(`process.on('SIGTERM',()=>{}); setTimeout(()=>process.send(${JSON.stringify({ type: 'candidate', candidate })}),400); setInterval(()=>{},1000);`);
    const controller = new AbortController(), promise = work.execute(request, controller.signal);
    setTimeout(() => controller.abort(new Error('PRIVATE_REASON')), 150);
    await expect(promise).rejects.toMatchObject({ code: 'cancelled' });
    expect(work.child().signalCode).toBe('SIGKILL');
  });
  it('does not fork for an already aborted signal', async () => {
    const forkProcess = vi.fn(), controller = new AbortController(); controller.abort();
    await expect(createWorkerExecutor({ forkProcess })(request, controller.signal)).rejects.toMatchObject({ code: 'cancelled' });
    expect(forkProcess).not.toHaveBeenCalled();
  });
  it.each([null, { type: 'candidate', candidate: { ...candidate, targetId: 'other' } }, { type: 'failure', failureCode: 'SECRET_KEY' }, { type: 'failure', failureCode: 'provider', error: 'SECRET_BODY' }])('rejects invalid IPC and never reflects its content %#', async message => {
    const work = await fixture(`process.send(${JSON.stringify(message)}); setInterval(()=>{},1000);`);
    await expect(work.execute(request)).rejects.toMatchObject({ code: 'invalid_output' });
    expect(work.child().exitCode !== null || work.child().signalCode !== null).toBe(true);
  });
  it('preserves only allowlisted provider error metadata', async () => {
    const work = await fixture(`process.send({type:'failure',failureCode:'provider',providerStatus:429});`);
    await expect(work.execute(request)).rejects.toMatchObject({ code: 'provider', status: 429 });
  });
  it('loads the real TypeScript worker with server-only configuration failure', async () => {
    vi.stubEnv('ARK_API_KEY', '');
    await expect(runInWorker(request)).rejects.toMatchObject({ code: 'configuration' });
  });
});
