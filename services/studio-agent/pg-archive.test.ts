import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { withTestPostgres } from './pg-test-support';
import { exportPostgresArchive, restorePostgresArchive } from './pg-archive';
import { PostgresProjectRepository } from './pg-projects';
import { PostgresAgentJobs, PostgresJobQueue } from './pg-jobs';
import { principalFromVerifiedSession, bindJob } from './access';
import { buildCandidate } from './candidate';
import { inspectHtml } from '../../src/html';
import type { Pool } from 'pg';
vi.setConfig({ testTimeout: 30000 });
const owner = principalFromVerifiedSession({ kind: 'anonymous', sessionId: 'archive-owner' });
const keyHash = 'a'.repeat(64);
const source = '<!DOCTYPE html>\r\n<!--preserve--><h1>原始标题</h1><p>正文 &amp; 原貌</p>';
async function fixture(pool: Pool) {
  const projects = new PostgresProjectRepository(pool), project = await projects.create(owner, source);
  const jobs = new PostgresAgentJobs(pool, owner), queue = new PostgresJobQueue(pool);
  const request = { version: { id: project.headRevision, source, label: '' }, targetId: inspectHtml(source).targets[0]!.id, instruction: 'PRIVATE_MATERIAL_NOT_ARCHIVED' };
  const job = await jobs.start(request, randomUUID(), bindJob(owner, { id: project.id, owner }, { projectId: project.id, baseRevision: project.headRevision }));
  return { projects, project, jobs, queue, request, job };
}
describe('PostgreSQL private archive', () => {
  it('restores exact sources, immutable history, owners, job and acceptance receipts', async () => withTestPostgres(async sourcePool => {
    const f = await fixture(sourcePool), lease = await f.queue.claim();
    const candidate = buildCandidate(f.request.version, f.request.targetId, '清晰标题');
    await f.queue.complete(lease!, candidate); await f.projects.acceptCandidate(owner, f.project.id, f.job.id, candidate);
    const archive = await exportPostgresArchive(sourcePool, keyHash);
    expect(JSON.stringify(archive)).not.toContain(f.request.instruction);
    expect(JSON.stringify(archive)).not.toMatch(/lease_token|lease_until|"payload"/);
    await withTestPostgres(async targetPool => {
      expect(await restorePostgresArchive(targetPool, archive)).toEqual({ projects: 1, jobs: 1 });
      const restored = await exportPostgresArchive(targetPool, keyHash);
      expect(restored.projects).toEqual(archive.projects); expect(restored.jobs).toEqual(archive.jobs);
      const repository = new PostgresProjectRepository(targetPool);
      expect((await repository.readRevision(owner, f.project.id, f.project.headRevision)).source).toBe(source);
      expect((await repository.acceptCandidate(owner, f.project.id, f.job.id, candidate)).id).toBe(archive.projects[0]!.headRevision);
    });
  }));
  it('refuses queued, running and cancelled-but-leased export', async () => withTestPostgres(async pool => {
    const f = await fixture(pool);
    await expect(exportPostgresArchive(pool, keyHash)).rejects.toThrow('active');
    const lease = await f.queue.claim(); await expect(exportPostgresArchive(pool, keyHash)).rejects.toThrow('active');
    await f.jobs.cancel(f.job.id); await expect(exportPostgresArchive(pool, keyHash)).rejects.toThrow('active');
    await pool.query('UPDATE studio_agent.jobs SET lease_until=NULL WHERE id=$1', [f.job.id]);
    await expect(exportPostgresArchive(pool, keyHash)).rejects.toThrow('active');
    await pool.query("UPDATE studio_agent.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [f.job.id]);
    expect((await exportPostgresArchive(pool, keyHash)).jobs[0]?.record.status).toBe('cancelled');
    await f.queue.release(lease!); expect((await exportPostgresArchive(pool, keyHash)).jobs[0]?.record.status).toBe('cancelled');
  }));
  it('refuses nonempty restore without changing existing data', async () => withTestPostgres(async pool => {
    const f = await fixture(pool); await f.jobs.cancel(f.job.id);
    const before = await exportPostgresArchive(pool, keyHash);
    await expect(restorePostgresArchive(pool, before)).rejects.toThrow('empty');
    const after = await exportPostgresArchive(pool, keyHash); expect(after.projects).toEqual(before.projects); expect(after.jobs).toEqual(before.jobs);
  }));
  it('rolls project and job inserts back together on a database write failure', async () => withTestPostgres(async sourcePool => {
    const f = await fixture(sourcePool); await f.jobs.cancel(f.job.id); const archive = await exportPostgresArchive(sourcePool, keyHash);
    await withTestPostgres(async pool => {
      await pool.query("CREATE FUNCTION studio_agent.fail_restore() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$");
      await pool.query('CREATE TRIGGER fail_restore BEFORE INSERT ON studio_agent.jobs FOR EACH ROW EXECUTE FUNCTION studio_agent.fail_restore()');
      await expect(restorePostgresArchive(pool, archive)).rejects.toThrow();
      expect((await pool.query('SELECT count(*)::int AS n FROM studio_agent.projects')).rows[0].n).toBe(0);
      expect((await pool.query('SELECT count(*)::int AS n FROM studio_agent.jobs')).rows[0].n).toBe(0);
      await pool.query('DROP TRIGGER fail_restore ON studio_agent.jobs');
      expect(await restorePostgresArchive(pool, archive)).toEqual({ projects: 1, jobs: 1 });
    });
  }));
  it('restores missing fingerprints as unmatchable zero hashes and rejects wrong schema', async () => withTestPostgres(async sourcePool => {
    const f = await fixture(sourcePool); await f.jobs.cancel(f.job.id); const archive = await exportPostgresArchive(sourcePool, keyHash);
    delete archive.jobs[0]!.record.requestHash;
    await withTestPostgres(async pool => {
      await restorePostgresArchive(pool, archive);
      expect((await pool.query('SELECT request_hash FROM studio_agent.jobs')).rows[0].request_hash).toBe('0'.repeat(64));
      await expect(new PostgresAgentJobs(pool, owner).start(f.request, f.job.id, f.job.binding)).rejects.toThrow();
    });
    await withTestPostgres(async pool => {
      await pool.query('INSERT INTO studio_agent.schema_version VALUES(99)');
      await expect(restorePostgresArchive(pool, archive)).rejects.toThrow('schema');
      expect((await pool.query('SELECT count(*)::int AS n FROM studio_agent.projects')).rows[0].n).toBe(0);
    });
  }));
});

it('rejects relational columns inconsistent with archived document identities', async () => withTestPostgres(async pool => {
  const f = await fixture(pool); await f.jobs.cancel(f.job.id);
  await pool.query("UPDATE studio_agent.projects SET document=jsonb_set(document,'{id}',to_jsonb($2::text)) WHERE id=$1", [f.project.id, randomUUID()]);
  await expect(exportPostgresArchive(pool, keyHash)).rejects.toThrow('identity mismatch');
  await pool.query('UPDATE studio_agent.projects SET document=$2::jsonb WHERE id=$1', [f.project.id, JSON.stringify(f.project)]);
  await pool.query('UPDATE studio_agent.jobs SET project_id=NULL WHERE id=$1', [f.job.id]);
  await expect(exportPostgresArchive(pool, keyHash)).rejects.toThrow('project mismatch');
}));
