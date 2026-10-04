import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { withTestPostgres } from './pg-test-support';
import { migrateStudioPostgres } from './pg-core';
import { PostgresProjectRepository } from './pg-projects';
import { principalFromVerifiedSession, StudioAccessError } from './access';
import { ProjectRevisionConflict } from './projects';
import { buildCandidate } from './candidate';
import { inspectHtml } from '../../src/html';
vi.setConfig({ testTimeout: 30000 });
const owner = principalFromVerifiedSession({ kind: 'user', userId: 'alice' });
const other = principalFromVerifiedSession({ kind: 'user', userId: 'bob' });
const anonymous = principalFromVerifiedSession({ kind: 'anonymous', sessionId: 'alice' });
const source = '<!DOCTYPE html>\r\n<!--keep-->\n<h1 class=\'title\'>原始标题</h1><p>保留 &amp; 源码</p>';
const candidateFor = (id: string, after = '清晰标题') => buildCandidate({ id, source, label: '' }, inspectHtml(source).targets[0]!.id, after);

describe('PostgreSQL projects with real transactions', () => {
  it('creates concurrently once and replays original create after save', async () => withTestPostgres(async pool => {
    await migrateStudioPostgres(pool); const a = new PostgresProjectRepository(pool), b = new PostgresProjectRepository(pool), id = randomUUID();
    const [first, retry] = await Promise.all([a.create(owner, source, id), b.create(owner, source, id)]);
    expect(first).toEqual(retry);
    const updated = await a.save(owner, id, first.headRevision, '<p>后续</p>');
    expect(await b.create(owner, source, id)).toEqual(updated);
    expect((await b.readRevision(owner, id, first.headRevision)).source).toBe(source);
    await expect(b.create(other, source, id)).rejects.toThrow(StudioAccessError);
    await expect(b.create(owner, '<p>替换初稿</p>', id)).rejects.toThrow('其他初稿');
    expect((await pool.query('SELECT count(*)::int AS n FROM studio_agent.projects')).rows[0].n).toBe(1);
  }));
  it('serializes independent clients CAS and idempotent save receipts', async () => withTestPostgres(async pool => {
    await migrateStudioPostgres(pool); const a = new PostgresProjectRepository(pool), b = new PostgresProjectRepository(pool), project = await a.create(owner, source);
    const results = await Promise.allSettled([a.save(owner, project.id, project.headRevision, '<p>A</p>', randomUUID()), b.save(owner, project.id, project.headRevision, '<p>B</p>', randomUUID())]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(result => result.status === 'rejected'); expect(failure?.status === 'rejected' && failure.reason).toBeInstanceOf(ProjectRevisionConflict);
    const current = await a.read(owner, project.id), operation = randomUUID();
    const [saved, duplicate] = await Promise.all([a.save(owner, project.id, current.headRevision, source, operation), b.save(owner, project.id, current.headRevision, source, operation)]);
    expect(saved).toEqual(duplicate); expect(saved.revisions).toHaveLength(3);
    await expect(a.save(owner, project.id, current.headRevision, '<p>Changed</p>', operation)).rejects.toThrow('其他修改');
  }));
  it('accepts one candidate once across concurrent callers and repository restart', async () => withTestPostgres(async pool => {
    await migrateStudioPostgres(pool); const a = new PostgresProjectRepository(pool), b = new PostgresProjectRepository(pool), p = await a.create(owner, source), job = randomUUID(), candidate = candidateFor(p.headRevision);
    const [accepted, retry] = await Promise.all([a.acceptCandidate(owner, p.id, job, candidate), b.acceptCandidate(owner, p.id, job, candidate)]);
    expect(accepted).toEqual(retry); expect(accepted.source).toBe(source.replace('原始标题', '清晰标题'));
    await a.save(owner, p.id, accepted.id, '<p>later</p>');
    expect(await new PostgresProjectRepository(pool).acceptCandidate(owner, p.id, job, candidate)).toEqual(accepted);
    await expect(b.acceptCandidate(owner, p.id, job, candidateFor(p.headRevision, '别的标题'))).rejects.toThrow('其他候选');
    expect((await a.read(owner, p.id)).revisions).toHaveLength(3);
  }));
  it('only accepts one of two different candidates based on the same revision', async () => withTestPostgres(async pool => {
    await migrateStudioPostgres(pool); const a = new PostgresProjectRepository(pool), p = await a.create(owner, source);
    const results = await Promise.allSettled([a.acceptCandidate(owner, p.id, randomUUID(), candidateFor(p.headRevision)), new PostgresProjectRepository(pool).acceptCandidate(owner, p.id, randomUUID(), candidateFor(p.headRevision, '不同候选'))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await a.read(owner, p.id)).revisions).toHaveLength(2);
  }));
  it('rolls back denied owners and invalid candidates without modifying history', async () => withTestPostgres(async pool => {
    await migrateStudioPostgres(pool); const repo = new PostgresProjectRepository(pool), p = await repo.create(owner, source), candidate = candidateFor(p.headRevision);
    for (const actor of [other, anonymous]) {
      await expect(repo.read(actor, p.id)).rejects.toThrow(StudioAccessError);
      await expect(repo.save(actor, p.id, p.headRevision, '<p>bad</p>')).rejects.toThrow(StudioAccessError);
      await expect(repo.acceptCandidate(actor, p.id, randomUUID(), candidate)).rejects.toThrow(StudioAccessError);
    }
    await expect(repo.acceptCandidate(owner, p.id, randomUUID(), { ...candidate, before: 'tampered' })).rejects.toThrow();
    expect(await repo.read(owner, p.id)).toEqual(p);
    // Force a failure at UPDATE after the row lock and computation, then prove both source and receipt roll back.
    await pool.query("CREATE FUNCTION studio_agent.reject_project_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$");
    await pool.query('CREATE TRIGGER fail_update BEFORE UPDATE ON studio_agent.projects FOR EACH ROW EXECUTE FUNCTION studio_agent.reject_project_update()');
    const job = randomUUID(); await expect(repo.acceptCandidate(owner, p.id, job, candidate)).rejects.toThrow();
    await pool.query('DROP TRIGGER fail_update ON studio_agent.projects');
    expect(await repo.read(owner, p.id)).toEqual(p);
    expect((await repo.acceptCandidate(owner, p.id, job, candidate)).acceptedJobId).toBe(job);
  }));
  it('enforces source/id/20-version limits without a partial update', async () => withTestPostgres(async pool => {
    await migrateStudioPostgres(pool); const repo = new PostgresProjectRepository(pool); let p = await repo.create(owner, source);
    await expect(repo.read(owner, '../escape')).rejects.toThrow();
    await expect(repo.save(owner, p.id, p.headRevision, 'x'.repeat(200001))).rejects.toThrow();
    for (let i = 1; i < 20; i++) p = await repo.save(owner, p.id, p.headRevision, source);
    await expect(repo.save(owner, p.id, p.headRevision, '<p>21</p>')).rejects.toThrow('20');
    await expect(repo.acceptCandidate(owner, p.id, randomUUID(), candidateFor(p.headRevision))).rejects.toThrow('20');
    expect(await repo.read(owner, p.id)).toEqual(p);
  }));
});

it('enforces owner/global creation capacity atomically while preserving same-id replay', async()=>withTestPostgres(async pool=>{
 const repo=new PostgresProjectRepository(pool,{owner:2,global:3}),id=randomUUID();
 const original=await repo.create(owner,source,id);
 const races=await Promise.allSettled([repo.create(owner,source),new PostgresProjectRepository(pool,{owner:2,global:3}).create(owner,source)]);
 expect(races.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 await expect(repo.create(owner,source)).rejects.toMatchObject({name:'ProjectCapacityError'});
 const updated=await repo.save(owner,id,original.headRevision,'<p>Later</p>');
 expect(await repo.create(owner,source,id)).toEqual(updated);
 await expect(repo.create(owner,'<p>Changed initial</p>',id)).rejects.toThrow('其他初稿');
 await expect(repo.create(other,source,id)).rejects.toThrow(StudioAccessError);
 const otherProject=await repo.create(other,source);
 await expect(repo.create(anonymous,source)).rejects.toMatchObject({name:'ProjectCapacityError'});
 expect(await repo.create(other,source,otherProject.id)).toEqual(otherProject);
 expect((await pool.query('SELECT count(*)::int AS n FROM studio_agent.projects')).rows[0].n).toBe(3);
}));
