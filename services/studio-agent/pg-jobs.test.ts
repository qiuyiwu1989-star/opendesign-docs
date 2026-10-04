import { describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PostgresAgentJobs,PostgresJobQueue } from './pg-jobs';
import { PostgresProjectRepository } from './pg-projects';
import { withTestPostgres } from './pg-test-support';
import { inspectHtml } from '../../src/html';
import { buildCandidate } from './candidate';
const actor={kind:'anonymous' as const,id:'owner-a'};
const version={id:'v1',label:'test',source:'<h1>Original</h1>'};
const request={version,targetId:inspectHtml(version.source).targets[0]!.id,instruction:'PRIVATE-INSTRUCTION'};
const candidate=buildCandidate(version,request.targetId,'Improved');
describe('durable PostgreSQL job queue',()=>{
 it('claims globally once across competing workers and cleans payload on completion',async()=>withTestPostgres(async pool=>{
  const api=new PostgresAgentJobs(pool,actor);const first=await api.start(request);await api.start(request);
  const q1=new PostgresJobQueue(pool),q2=new PostgresJobQueue(pool);
  const leases=await Promise.all([q1.claim(),q2.claim()]);expect(leases.filter(Boolean)).toHaveLength(1);
  const lease=leases.find(Boolean)!;expect(lease.id).toBe(first.id);expect(await q2.claim()).toBeNull();
  expect(await q1.complete(lease,{...candidate,baseSource:'spoof'})).toBe(false);
  expect(await q1.complete(lease,candidate)).toBe(true);expect(await q1.complete(lease,candidate)).toBe(false);
  expect((await api.get(first.id))?.candidate).toEqual(candidate);
  expect((await pool.query('SELECT payload,lease_token FROM studio_agent.jobs WHERE id=$1',[first.id])).rows[0]).toEqual({payload:null,lease_token:null});
  expect(await q2.claim()).not.toBeNull();
 }));
 it('cancellation rejects late completion and heartbeat, including a fabricated token',async()=>withTestPostgres(async pool=>{
  const api=new PostgresAgentJobs(pool,actor),queue=new PostgresJobQueue(pool);const job=await api.start(request);const lease=(await queue.claim())!;
  expect(await queue.heartbeat({...lease,token:randomUUID()})).toBe(false);
  expect((await api.cancel(job.id))?.status).toBe('cancelled');
  expect(await queue.heartbeat(lease)).toBe(false);expect(await queue.complete(lease,candidate)).toBe(false);expect(await queue.fail(lease,'provider',429)).toBe(false);
  expect((await pool.query('SELECT payload FROM studio_agent.jobs WHERE id=$1',[job.id])).rows[0].payload).toBeNull();
 }));
 it('holds cancelled executor lease until explicit release or expiry',async()=>withTestPostgres(async pool=>{
  const api=new PostgresAgentJobs(pool,actor),queue=new PostgresJobQueue(pool);const job=await api.start(request);await api.start(request);
  const lease=(await queue.claim())!;await api.cancel(job.id);
  expect(await queue.claim()).toBeNull();expect(await queue.heartbeat(lease)).toBe(false);
  await expect(api.remove(job.id)).rejects.toThrow('不能删除');
  expect(await queue.release({...lease,token:randomUUID()})).toBe(false);expect(await queue.claim()).toBeNull();
  expect(await queue.release(lease)).toBe(true);expect(await queue.release(lease)).toBe(false);
  expect(await api.remove(job.id)).toBe(true);
  expect(await queue.claim()).not.toBeNull();
 }));
 it('uses DB time to expire a lease without rerunning it',async()=>withTestPostgres(async pool=>{
  const api=new PostgresAgentJobs(pool,actor),queue=new PostgresJobQueue(pool,10);const job=await api.start(request);const lease=(await queue.claim())!;
  await pool.query('SELECT pg_sleep(0.03)');
  expect(await queue.heartbeat(lease)).toBe(false);expect(await queue.complete(lease,candidate)).toBe(false);
  expect(await queue.expire()).toBe(1);expect((await api.get(job.id))?.status).toBe('interrupted');expect(await queue.claim()).toBeNull();
 }));
 it('retains queued work after API reconstruction and scopes idempotency by owner',async()=>withTestPostgres(async pool=>{
  const a=new PostgresAgentJobs(pool,actor),b=new PostgresAgentJobs(pool,{kind:'anonymous',id:'owner-b'});const id=randomUUID();
  const first=await a.start(request,id);expect(first.status).toBe('queued');await a.close();
  const restored=new PostgresAgentJobs(pool,actor);expect(await restored.start(request,id)).toEqual(first);
  await expect(restored.start({...request,instruction:'changed'},id)).rejects.toThrow('其他请求');
  expect(await b.get(id)).toBeUndefined();expect((await b.start(request,id)).id).toBe(id);
  expect(await a.list()).toHaveLength(1);expect(await b.list()).toHaveLength(1);
  const summary=(await a.list())[0]!;expect(Object.keys(summary).sort()).toEqual(['createdAt','id','status','updatedAt']);
  expect(await b.cancel(id)).toMatchObject({status:'cancelled'});expect((await a.get(id))?.status).toBe('queued');
 }));
 it('binds retries to projects and protects removal while queued/running',async()=>withTestPostgres(async pool=>{
  const api=new PostgresAgentJobs(pool,actor);const id=randomUUID();const project=await new PostgresProjectRepository(pool).create(actor,version.source);
  const binding={owner:actor,projectId:project.id,baseRevision:project.headRevision};
  const boundRequest={...request,version:{...version,id:project.headRevision}};
  await api.start(boundRequest,id,binding);
  await expect(api.start(boundRequest,id,{...binding,projectId:randomUUID()})).rejects.toThrow('其他请求');
  await expect(api.start(boundRequest,randomUUID(),{...binding,owner:{kind:'anonymous',id:'other'}})).rejects.toThrow();
  await expect(api.remove(id)).rejects.toThrow('不能删除');
  await api.cancel(id);expect(await api.remove(id)).toBe(true);expect(await api.remove(id)).toBe(false);
  expect(await api.remove('../escape')).toBe(false);
 }));
 it('rejects bound source or stale project head, while preserving same-id retries',async()=>withTestPostgres(async pool=>{
  const repo=new PostgresProjectRepository(pool),api=new PostgresAgentJobs(pool,actor);
  const project=await repo.create(actor,version.source);const id=randomUUID();
  const binding={owner:actor,projectId:project.id,baseRevision:project.headRevision};
  const boundRequest={...request,version:{...version,id:project.headRevision}};
  await api.start(boundRequest,id,binding);
  await expect(api.start({...boundRequest,version:{...boundRequest.version,source:'<h1>Spoof</h1>'}},randomUUID(),binding)).rejects.toThrow('基准');
  await repo.save(actor,project.id,project.headRevision,'<h1>Manual</h1>');
  expect((await api.start(boundRequest,id,binding)).id).toBe(id);
  await expect(api.start(boundRequest,randomUUID(),binding)).rejects.toThrow('版本已变化');
 }));
 it('graceful interrupt clears active payload and invalidates the token without cancelling queued work',async()=>withTestPostgres(async pool=>{
  const api=new PostgresAgentJobs(pool,actor),queue=new PostgresJobQueue(pool);await api.start(request);const queued=await api.start(request);
  const lease=(await queue.claim())!;expect(await queue.heartbeat(lease)).toBe(true);
  await api.close();expect((await api.get(lease.id))?.status).toBe('running');
  expect(await queue.interrupt(lease)).toBe(true);expect(await queue.interrupt(lease)).toBe(false);
  expect(await queue.complete(lease,candidate)).toBe(false);expect(await queue.heartbeat(lease)).toBe(false);
  expect((await api.get(queued.id))?.status).toBe('queued');expect((await queue.claim())?.id).toBe(queued.id);
 }));
 it('records only sanitized failure codes and frees capacity via explicit cleanup',async()=>withTestPostgres(async pool=>{
  const api=new PostgresAgentJobs(pool,actor,{dailyOwner:200,dailyGlobal:200,pendingOwner:200,pendingGlobal:200}),queue=new PostgresJobQueue(pool);const first=await api.start(request);const lease=(await queue.claim())!;
  expect(await queue.fail(lease,'provider',429)).toBe(true);expect(await api.get(first.id)).toMatchObject({status:'failed',failureCode:'provider',providerStatus:429});
  expect((await pool.query('SELECT payload FROM studio_agent.jobs WHERE id=$1',[first.id])).rows[0].payload).toBeNull();
  for(let i=0;i<99;i++)await api.start(request);
  await expect(api.start(request)).rejects.toThrow('100');expect(await api.remove(first.id)).toBe(true);expect((await api.start(request)).status).toBe('queued');
 }));
});
