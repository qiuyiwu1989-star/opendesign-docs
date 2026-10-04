import { constants } from 'node:fs';
import { mkdir, realpath, lstat, open, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const heldRoots = new Set<string>();

/** One writer process per private local state directory. This is not a business database. */
export async function acquireStateLock(directory: string): Promise<() => void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const root = await realpath(directory);
  if (!(await lstat(root)).isDirectory()) throw new Error('任务数据目录无效。');
  await chmod(root, 0o700);
  if (heldRoots.has(root)) throw new Error('任务数据目录已被占用。');
  heldRoots.add(root);
  let reserved = true;
  try {
  const path = join(root, 'writer-lock.sqlite');
  // NOFOLLOW rejects even dangling symlinks. Close this descriptor before SQLite
  // acquires POSIX locks: closing another descriptor afterward can release them.
  const handle = await open(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  let database: DatabaseSync | undefined;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1) throw new Error('任务锁文件无效。');
    await handle.chmod(0o600);
    const named = await lstat(path);
    if (!named.isFile() || named.dev !== info.dev || named.ino !== info.ino) throw new Error('任务锁文件已变化。');
    await handle.close();
    database = new DatabaseSync(path, { timeout: 0 });
    // Never use WAL: EXCLUSIVE must exclude another connection's writer transaction.
    database.exec('PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE;');
  } catch {
    try { database?.close(); } catch { /* Preserve generic acquisition failure. */ }
    throw new Error('任务数据目录已被占用或锁不可用，请勿同时启动多个写入服务。');
  } finally { await handle.close(); }
  const acquired = database;
  let released = false;
  reserved = false;
  return () => {
    if (released) return;
    released = true;
    try { acquired.exec('ROLLBACK'); } finally { try { acquired.close(); } finally { heldRoots.delete(root); } }
  };
  } finally { if (reserved) heldRoots.delete(root); }
}
