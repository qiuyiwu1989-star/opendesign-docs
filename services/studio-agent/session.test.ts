import { mkdtemp, rm, stat, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadLocalSessionCodec } from './session';
describe('local anonymous session', () => {
  it('persists signing identity across restart and preserves unowned records', async () => {
    const dir = await mkdtemp(join(tmpdir(),'studio-session-'));
    try {
      await writeFile(join(dir,'legacy.json'), '{"status":"candidate"}');
      const first = await loadLocalSessionCodec(dir);
      const issued = first.resolve(); const cookie = issued.setCookie!.split(';')[0]!;
      expect(first.resolve(cookie)).toEqual({scope:issued.scope});
      const restarted = await loadLocalSessionCodec(dir);
      expect(restarted.resolve(cookie)).toEqual({scope:issued.scope});
      expect(restarted.resolve(cookie+'broken').scope).not.toBe(issued.scope);
      expect((await stat(join(dir,'session-signing-key'))).mode & 0o777).toBe(0o600);
      expect((await stat(dir)).mode & 0o777).toBe(0o700);
      expect(await readdir(dir)).toEqual(expect.arrayContaining(['legacy.json','session-signing-key']));
    } finally { await rm(dir,{recursive:true,force:true}); }
  });
});

it('sets Secure only for the configured HTTPS deployment', async () => {
  const dir = await mkdtemp(join(tmpdir(),'studio-session-secure-'));
  try {
    const secure = await loadLocalSessionCodec(dir, true), issued = secure.resolve();
    expect(issued.setCookie).toContain('; Secure'); expect(issued.setCookie).toContain('HttpOnly; SameSite=Strict');
    expect((await loadLocalSessionCodec(dir)).resolve().setCookie).not.toContain('; Secure');
    expect((await loadLocalSessionCodec(dir, true)).resolve(issued.setCookie!.split(';')[0])).toEqual({ scope: issued.scope });
  } finally { await rm(dir,{recursive:true,force:true}); }
});
