import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, lstat, chmod, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

export const SESSION_COOKIE = 'studio_local_session';
const lifetime = 30 * 24 * 60 * 60;
/** Anonymous local browser identity only. Not an account or production authentication. */
export class LocalSessionCodec {
  constructor(private readonly key: Buffer, private readonly secure = false) {}
  resolve(cookie?: string): { scope: string; setCookie?: string } {
    const supplied = cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
    if (supplied) {
      const parts = supplied.split('.');
      const [id, issued, signature] = parts;
      if (parts.length === 3 && /^[a-f0-9]{64}$/.test(id ?? '') && /^\d{10}$/.test(issued ?? '') && /^[a-f0-9]{64}$/.test(signature ?? '')) {
        const age = Math.floor(Date.now() / 1000) - Number(issued);
        const expected = this.sign(`${id}.${issued}`);
        if (age >= 0 && age < lifetime && timingSafeEqual(Buffer.from(signature!, 'hex'), Buffer.from(expected, 'hex'))) return { scope: id! };
      }
    }
    const scope = randomBytes(32).toString('hex');
    const payload = `${scope}.${Math.floor(Date.now() / 1000)}`;
    // Local HTTP endpoint only; production HTTPS must use its own identity adapter.
    return { scope, setCookie: `${SESSION_COOKIE}=${payload}.${this.sign(payload)}; Path=/api/studio-agent; Max-Age=${lifetime}; HttpOnly; SameSite=Strict${this.secure ? '; Secure' : ''}` };
  }
  private sign(payload: string) { return createHmac('sha256', this.key).update(`studio-local-v1:${payload}`).digest('hex'); }
}
export async function loadLocalSessionCodec(directory: string, secure = false): Promise<LocalSessionCodec> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory()) throw new Error('Invalid session directory');
  await chmod(directory, 0o700);
  const path = join(directory, 'session-signing-key');
  try {
    const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(randomBytes(32)); } finally { await handle.close(); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== 32) throw new Error('Invalid session key');
    await handle.chmod(0o600);
    return new LocalSessionCodec(await handle.readFile(), secure);
  } finally { await handle.close(); }
}
