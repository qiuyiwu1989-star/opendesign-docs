import { describe,it,expect,vi } from 'vitest';
import { withTestPostgres } from './pg-test-support';
import { PostgresAgentJobs,PostgresJobQueue } from './pg-jobs';
import { processNextPostgresJob } from './pg-worker';
import { inspectHtml } from '../../src/html';
import { buildCandidate } from './candidate';
import { ArkRequestError } from './ark';
import type { TextProposal } from '../../src/studio-model';
const actor={kind:'anonymous' as const,id:'worker-test'};
const version={id:'v1',label:'test',source:'<h1>Original</h1>'};
const request={version,targetId:inspectHtml(version.source).targets[0]!.id,instruction:'Improve'};
const candidate=buildCandidate(version,request.targetId,'Improved');
function waiting(){let entered!:()=>void;const ready=new Promise<void>(r=>entered=r);return {ready,execute:async(_r:unknown,signal:AbortSignal)=>{entered();return new Promise<TextProposal>((resolve)=>{signal.addEventListener('abort',()=>resolve(candidate),{once:true});});}};}
describe('PostgreSQL worker',()=>{
 it('executes one queued job and leaves model failure diagnostic without source writes',async()=>withTestPostgres(async pool=>{
  const jobs=new PostgresAgentJobs(pool,actor),signal=new AbortController().signal;
  const a=await jobs.start(request);expect(await processNextPostgresJob(pool,async()=>candidate,signal)).toBe(true);
  expect((await jobs.get(a.id))?.candidate).toEqual(candidate);
  const b=await jobs.start(request);await processNextPostgresJob(pool,async()=>{throw new ArkRequestError('provider',429);},signal);
  expect(await jobs.get(b.id)).toMatchObject({status:'failed',failureCode:'provider',providerStatus:429});
  expect(await processNextPostgresJob(pool,async()=>candidate,signal)).toBe(false);
 }));
 it('shutdown aborts active execution and marks interrupted while retaining queued jobs',async()=>withTestPostgres(async pool=>{
  const jobs=new PostgresAgentJobs(pool,actor);const first=await jobs.start(request),second=await jobs.start(request);
  const work=waiting(),controller=new AbortController();const running=processNextPostgresJob(pool,work.execute,controller.signal);
  await work.ready;controller.abort();await running;
  expect((await jobs.get(first.id))?.status).toBe('interrupted');expect((await jobs.get(second.id))?.status).toBe('queued');
 }));
 it('observes persisted cancellation on heartbeat and rejects the late candidate',async()=>withTestPostgres(async pool=>{
  const jobs=new PostgresAgentJobs(pool,actor),job=await jobs.start(request),work=waiting();
  const running=processNextPostgresJob(pool,work.execute,new AbortController().signal);await work.ready;
  await jobs.cancel(job.id);await running;
  expect((await jobs.get(job.id))?.status).toBe('cancelled');expect((await jobs.get(job.id))?.candidate).toBeUndefined();
 }));
 it('keeps the cancelled executor exclusive until it has fully exited',async()=>withTestPostgres(async pool=>{
  const api=new PostgresAgentJobs(pool,actor),queue=new PostgresJobQueue(pool);
  const first=await api.start(request),second=await api.start(request);
  let entered!:()=>void,aborted!:()=>void,finish!:()=>void;
  const ready=new Promise<void>(r=>entered=r),cancelled=new Promise<void>(r=>aborted=r),exit=new Promise<void>(r=>finish=r);
  const running=processNextPostgresJob(pool,async(_r,signal)=>{entered();signal.addEventListener('abort',aborted,{once:true});await exit;return candidate;},new AbortController().signal);
  await ready;await api.cancel(first.id);expect(await queue.claim()).toBeNull();await cancelled;
  // Abort delivery alone is not proof that the executor exited.
  expect(await queue.claim()).toBeNull();finish();await running;
  expect((await queue.claim())?.id).toBe(second.id);expect((await api.get(first.id))?.status).toBe('cancelled');
 }));
 it('marks running work interrupted after heartbeat failure instead of leaving an unleased running record',async()=>withTestPostgres(async pool=>{
  const api=new PostgresAgentJobs(pool,actor),job=await api.start(request),work=waiting();
  const heartbeat=vi.spyOn(PostgresJobQueue.prototype,'heartbeat').mockRejectedValueOnce(new Error('temporary transport failure'));
  try{
   await processNextPostgresJob(pool,work.execute,new AbortController().signal);
   expect((await api.get(job.id))?.status).toBe('interrupted');
   const row=(await pool.query('SELECT payload,lease_token FROM studio_agent.jobs WHERE id=$1',[job.id])).rows[0];
   expect(row).toEqual({payload:null,lease_token:null});
  }finally{heartbeat.mockRestore();}
 }));
 it('aborts on expired lease and does not requeue or commit',async()=>withTestPostgres(async pool=>{
  const jobs=new PostgresAgentJobs(pool,actor),job=await jobs.start(request),work=waiting();
  const running=processNextPostgresJob(pool,work.execute,new AbortController().signal);await work.ready;
  await pool.query("UPDATE studio_agent.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);await running;
  expect((await jobs.get(job.id))?.candidate).toBeUndefined();
  expect(await processNextPostgresJob(pool,async()=>{throw new Error('must not rerun');},new AbortController().signal)).toBe(false);
  expect((await jobs.get(job.id))?.status).toBe('interrupted');
 }));
});
