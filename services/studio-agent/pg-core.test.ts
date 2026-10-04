import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';
import { withTestPostgres } from './pg-test-support';
import { migrateStudioPostgres, verifyStudioPostgres, rollbackEmptyStudioPostgres } from './pg-core';
import { PostgresProjectRepository } from './pg-projects';
import { principalFromVerifiedSession } from './access';
vi.setConfig({ testTimeout: 30000 });
describe('explicit PostgreSQL schema operations', () => {
  it('replays migration without duplicating schema version or losing project data', async () => withTestPostgres(async pool => {
    const repo = new PostgresProjectRepository(pool), actor = principalFromVerifiedSession({ kind: 'user', userId: 'test-owner' });
    const project = await repo.create(actor, '<h1>Keep</h1>');
    await Promise.all([migrateStudioPostgres(pool), migrateStudioPostgres(pool)]);
    await verifyStudioPostgres(pool);
    expect(await repo.read(actor, project.id)).toEqual(project);
    expect((await pool.query('SELECT version FROM studio_agent.schema_version')).rows).toEqual([{ version: 1 }]);
  }));
  it('refuses populated rollback and preserves data', async () => withTestPostgres(async pool => {
    const repo = new PostgresProjectRepository(pool), actor = principalFromVerifiedSession({ kind: 'anonymous', sessionId: 'session' });
    const project = await repo.create(actor, '<h1>Keep</h1>');
    await expect(rollbackEmptyStudioPostgres(pool)).rejects.toThrow('data exists');
    expect(await repo.read(actor, project.id)).toEqual(project); await verifyStudioPostgres(pool);
  }));
  it('rolls back an empty schema and can migrate again', async () => withTestPostgres(async pool => {
    await rollbackEmptyStudioPostgres(pool);
    expect((await pool.query("SELECT to_regnamespace('studio_agent') AS schema")).rows[0].schema).toBeNull();
    await migrateStudioPostgres(pool); await verifyStudioPostgres(pool);
  }));
  it('refuses rollback with unrelated objects and rolls all attempted drops back', async () => withTestPostgres(async pool => {
    await pool.query('CREATE TABLE studio_agent.unrelated (value text); INSERT INTO studio_agent.unrelated VALUES (\'keep\')');
    await expect(rollbackEmptyStudioPostgres(pool)).rejects.toThrow();
    expect((await pool.query('SELECT value FROM studio_agent.unrelated')).rows).toEqual([{ value: 'keep' }]);
    await verifyStudioPostgres(pool);
  }));
  it('rejects unsupported schema versions', async () => withTestPostgres(async pool => {
    await pool.query('INSERT INTO studio_agent.schema_version VALUES (99)');
    await expect(verifyStudioPostgres(pool)).rejects.toThrow('not supported');
  }));
});

it('runs the bundled migration CLI against an isolated real database', async () => withTestPostgres(async pool => {
  const directory = await mkdtemp(join(tmpdir(), 'pg-cli-bundle-')), outfile = join(directory, 'pg-migrate.mjs');
  try {
    await build({ entryPoints: ['services/studio-agent/pg-migrate.ts'], outfile, bundle: true, platform: 'node', format: 'esm', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
    const options = pool.options, url = new URL(`postgresql://${options.host}:${options.port}/${options.database}`);
    url.username = options.user!; url.password = options.password as string;
    const execute = promisify(execFile);
    for (const action of ['verify', 'migrate', 'rollback-empty', 'migrate']) {
      const result = await execute(process.execPath, [outfile, action], { env: { ...process.env, STUDIO_AGENT_DATABASE_URL: url.href } });
      expect(result.stdout).toBe(`Studio database ${action} completed.\n`); expect(result.stderr).toBe('');
    }
    await verifyStudioPostgres(pool);
  } finally { await rm(directory, { recursive: true, force: true }); }
}));
