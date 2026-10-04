import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { it, expect } from 'vitest';
async function availablePort() {
  const server = createServer(); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
async function terminate(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
  try { await exited; } finally { clearTimeout(timer); }
}
it('starts server and rejects unconfigured worker through current-style bundle symlinks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-entrypoints-'));
  let server: ChildProcess | undefined, worker: ChildProcess | undefined;
  try {
    const output = join(directory, 'release');
    await build({ entryPoints: ['services/studio-agent/server.ts', 'services/studio-agent/pg-worker.ts'], outdir: output, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
    const current = join(directory, 'current'); await symlink(output, current);
    const env = { ...process.env }; delete env.ARK_API_KEY; delete env.STUDIO_AGENT_DATABASE_URL; delete env.STUDIO_AGENT_PUBLIC_ORIGIN;
    const port = await availablePort();
    server = spawn(process.execPath, [join(current, 'server.mjs')], { env: { ...env, STUDIO_AGENT_PORT: String(port), STUDIO_AGENT_STATE_DIR: join(directory, 'state') }, stdio: ['ignore', 'pipe', 'pipe'] });
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null || server.signalCode !== null) break;
      try { const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(300) }); if (response.ok) { expect(await response.json()).toEqual({ ok: true }); healthy = true; break; } } catch { /* retry bounded startup */ }
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    expect(healthy).toBe(true); await terminate(server);
    worker = spawn(process.execPath, [join(current, 'pg-worker.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = ''; worker.stderr!.on('data', chunk => { stderr += String(chunk); });
    const timer = setTimeout(() => worker!.kill('SIGKILL'), 3000);
    const [code, signal] = await once(worker, 'exit'); clearTimeout(timer);
    expect(signal).toBeNull(); expect(code).not.toBe(0); expect(stderr).toContain('Worker requires database and model configuration');
  } finally { if (server) await terminate(server); if (worker) await terminate(worker); await rm(directory, { recursive: true, force: true }); }
}, 15000);
