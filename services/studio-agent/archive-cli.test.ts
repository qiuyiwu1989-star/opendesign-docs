import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, stat, writeFile, realpath, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runArchiveCli } from './archive-cli';
import { readArchiveFile } from './archive';
import { loadLocalSessionCodec } from './session';
import { LocalProjectRepository } from './projects';
import { LocalAgentJobs } from './jobs';
import { bindJob, principalFromVerifiedSession } from './access';
import { buildCandidate } from './candidate';
import { inspectHtml } from '../../src/html';
import { acquireStateLock } from './state-lock';
import { withTestPostgres } from './pg-test-support';
import type { Pool } from 'pg';
vi.setConfig({ testTimeout: 30000 });
const directories: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'studio-archive-cli-'))); directories.push(directory);
  const root = join(directory, 'state'), codec = await loadLocalSessionCodec(root), scope = codec.resolve().scope;
  const actor = principalFromVerifiedSession({ kind: 'anonymous', sessionId: scope });
  const repository = new LocalProjectRepository(join(root, 'projects'));
  const source = '<!DOCTYPE html>\r\n<!--PRIVATE_SOURCE--><h1>原始标题</h1><p>保留 &amp; 原貌</p>';
  const project = await repository.create(actor, source);
  const request = { version: { id: project.headRevision, source, label: '' }, targetId: inspectHtml(source).targets[0]!.id, instruction: 'PRIVATE_INSTRUCTION' };
  const candidate = buildCandidate(request.version, request.targetId, '修改标题');
  const jobs = new LocalAgentJobs(join(root, 'sessions', scope), async () => candidate);
  const job = await jobs.start(request, randomUUID(), bindJob(actor, { id: project.id, owner: actor }, { projectId: project.id, baseRevision: project.headRevision }));
  for (let i = 0; i < 100; i++) { if ((await jobs.get(job.id))?.status === 'candidate') break; await new Promise(resolve => setTimeout(resolve, 2)); }
  expect((await jobs.get(job.id))?.status).toBe('candidate');
  await repository.acceptCandidate(actor, project.id, job.id, candidate); await jobs.close();
  return { directory, root, project, source, archive: join(directory, 'private.archive.json') };
}
function environment(pool: Pool): NodeJS.ProcessEnv {
  const options = pool.options, url = new URL(`postgresql://${options.host}:${options.port}/${options.database}`);
  url.username = options.user!; url.password = options.password as string;
  return { ...process.env, STUDIO_AGENT_DATABASE_URL: url.href, NODE_NO_WARNINGS: '1' };
}
describe('operator archive CLI against real isolated PostgreSQL', () => {
  it('exports local, inspects bundled CLI, restores matching identity and backs up PostgreSQL', async () => withTestPostgres(async pool => {
    const f = await fixture(), log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runArchiveCli(['export-local', f.archive, '--state-dir', f.root]);
    expect((await stat(f.archive)).mode & 0o777).toBe(0o600);
    const original = await readArchiveFile(f.archive);
    expect(original.projects).toHaveLength(1); expect(original.jobs).toHaveLength(1);
    const bundle = join(f.directory, 'archive-cli.mjs');
    await build({ entryPoints: ['services/studio-agent/archive-cli.ts'], outfile: bundle, bundle: true, platform: 'node', format: 'esm', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
    const execute = promisify(execFile), env = environment(pool);
    const cliAlias = join(f.directory, 'archive-link.mjs'); await symlink(bundle, cliAlias);
    const inspection = await execute(process.execPath, [cliAlias, 'inspect', f.archive], { env });
    expect(JSON.parse(inspection.stdout)).toMatchObject({ action: 'inspect', projects: 1, jobs: 1 });
    expect(inspection.stdout).not.toMatch(/PRIVATE_SOURCE|PRIVATE_INSTRUCTION|postgresql:/);
    const wrongRoot = join(f.directory, 'wrong-state'); await loadLocalSessionCodec(wrongRoot);
    await expect(runArchiveCli(['restore-postgres', f.archive, '--state-dir', wrongRoot], env)).rejects.toThrow('key');
    expect((await pool.query('SELECT count(*)::int AS n FROM studio_agent.projects')).rows[0].n).toBe(0);
    const restore = await execute(process.execPath, [bundle, 'restore-postgres', f.archive, '--state-dir', f.root], { env });
    expect(JSON.parse(restore.stdout)).toMatchObject({ action: 'restore-postgres', projects: 1, jobs: 1 });
    await expect(runArchiveCli(['restore-postgres', f.archive, '--state-dir', f.root], env)).rejects.toThrow('empty');
    const backup = join(f.directory, 'postgres.archive.json');
    await runArchiveCli(['backup-postgres', backup, '--state-dir', f.root], env);
    const archived = await readArchiveFile(backup);
    expect(archived.projects).toEqual(original.projects); expect(archived.jobs).toEqual(original.jobs); expect(archived.sessionKeyHash).toBe(original.sessionKeyHash);
    expect(log.mock.calls.flat().join(' ')).not.toMatch(/PRIVATE_SOURCE|PRIVATE_INSTRUCTION|postgresql:/);
  }));
  it('refuses an existing output and an online root without changing source bytes', async () => {
    const f = await fixture(); vi.spyOn(console, 'log').mockImplementation(() => {});
    const projectPath = join(f.root, 'projects', `${f.project.id}.json`), before = await readFile(projectPath);
    await writeFile(f.archive, 'EXISTING_OUTPUT');
    await expect(runArchiveCli(['export-local', f.archive, '--state-dir', f.root])).rejects.toThrow();
    expect(await readFile(f.archive, 'utf8')).toBe('EXISTING_OUTPUT'); expect(await readFile(projectPath)).toEqual(before);
    const disguised = join(f.root, '..backup.json');
    await expect(runArchiveCli(['export-local', disguised, '--state-dir', f.root])).rejects.toThrow();
    await expect(stat(disguised)).rejects.toMatchObject({ code: 'ENOENT' });
    const alias = join(f.directory, 'state-alias'); await symlink(f.root, alias);
    const symlinkDestination = join(alias, 'archive.json');
    await expect(runArchiveCli(['export-local', symlinkDestination, '--state-dir', f.root])).rejects.toThrow();
    await expect(stat(join(f.root, 'archive.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    const release = await acquireStateLock(f.root), unused = join(f.directory, 'online.archive.json');
    try { await expect(runArchiveCli(['export-local', unused, '--state-dir', f.root])).rejects.toThrow(); }
    finally { release(); }
    await expect(stat(unused)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(projectPath)).toEqual(before);
  });
});
