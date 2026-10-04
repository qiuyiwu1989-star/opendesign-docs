import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { acquireStateLock } from './state-lock';
const directories: string[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
async function directory() { const path = await mkdtemp(join(tmpdir(), 'studio-state-lock-')); directories.push(path); return path; }
function holder(path: string): Promise<ChildProcess> {
  const moduleUrl = new URL('./state-lock.ts', import.meta.url).href;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `import {acquireStateLock} from ${JSON.stringify(moduleUrl)}; await acquireStateLock(process.argv[1]); console.log('READY'); setInterval(()=>{},1000);`, path], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Child lock startup timed out')), 5000);
    child.stdout!.once('data', data => { clearTimeout(timer); String(data).includes('READY') ? resolve(child) : reject(new Error('Unexpected child output')); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Child exited early: ${code}`)); });
  });
}
describe('single writer state lock', () => {
  it('rejects a second process and reacquires after SIGKILL', async () => {
    const path = await directory(), child = await holder(path);
    await expect(acquireStateLock(path)).rejects.toThrow('占用');
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    const release = await acquireStateLock(path); release(); release();
  });
  it('normalizes directory aliases and keeps private permissions', async () => {
    const path = await directory(), alias = join(await directory(), 'alias');
    await symlink(path, alias);
    const release = await acquireStateLock(path);
    try {
      await expect(acquireStateLock(alias)).rejects.toThrow('占用');
      expect((await stat(path)).mode & 0o777).toBe(0o700);
      expect((await stat(join(path, 'writer-lock.sqlite'))).mode & 0o777).toBe(0o600);
    } finally { release(); }
  });
  it('rejects symlink lock files without changing their target', async () => {
    const path = await directory(), target = join(await directory(), 'missing');
    await symlink(target, join(path, 'writer-lock.sqlite'));
    await expect(acquireStateLock(path)).rejects.toThrow();
    await expect(stat(target)).rejects.toThrow();
  });
});
