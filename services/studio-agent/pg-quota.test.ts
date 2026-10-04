import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withTestPostgres} from './pg-test-support';
import {PostgresAgentJobs,JobQuotaError,DEFAULT_JOB_QUOTA} from './pg-jobs';
import {rollbackEmptyStudioPostgres} from './pg-core';
import {inspectHtml} from '../../src/html';
const actor={kind:'anonymous' as const,id:'quota-a'};
const version={id:'v1',label:'test',source:'<h1>Original</h1>'};
const request={version,targetId:inspectHtml(version.source).targets[0]!.id,instruction:'Improve'};
describe('public anonymous admission quotas',()=>{
 it('has bounded production defaults',()=>expect(DEFAULT_JOB_QUOTA).toEqual({dailyOwner:30,dailyGlobal:300,pendingOwner:5,pendingGlobal:20}));
 it('counts idempotent starts once even when the quota is exhausted',async()=>withTestPostgres(async pool=>{
  const api=new PostgresAgentJobs(pool,actor,{dailyOwner:1,dailyGlobal:1}),id=randomUUID();
  const [a,b]=await Promise.all([api.start(request,id),api.start(request,id)]);expect(a.id).toBe(b.id);
  expect((await api.start(request,id)).id).toBe(id);
  await expect(api.start(request)).rejects.toBeInstanceOf(JobQuotaError);
  expect((await pool.query('SELECT owner_key,started FROM studio_agent.daily_usage ORDER BY owner_key')).rows).toEqual([{owner_key:'*',started:1},{owner_key:'anonymous:quota-a',started:1}]);
 }));
 it('serializes concurrent owners at the global daily limit',async()=>withTestPostgres(async pool=>{
  const instances=Array.from({length:6},(_,i)=>new PostgresAgentJobs(pool,{kind:'anonymous',id:`owner-${i}`},{dailyGlobal:2}));
  const results=await Promise.allSettled(instances.map(api=>api.start(request)));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
  for(const r of results)if(r.status==='rejected')expect(r.reason).toBeInstanceOf(JobQuotaError);
  expect((await pool.query("SELECT started FROM studio_agent.daily_usage WHERE owner_key='*'")).rows[0].started).toBe(2);
 }));
 it('enforces owner and global pending limits independently without charging rejected starts',async()=>withTestPostgres(async pool=>{
  const a=new PostgresAgentJobs(pool,actor,{pendingOwner:1,pendingGlobal:2});
  const first=await a.start(request);await expect(a.start(request)).rejects.toBeInstanceOf(JobQuotaError);
  const b=new PostgresAgentJobs(pool,{kind:'anonymous',id:'b'},{pendingOwner:1,pendingGlobal:2});await b.start(request);
  const c=new PostgresAgentJobs(pool,{kind:'anonymous',id:'c'},{pendingOwner:1,pendingGlobal:2});await expect(c.start(request)).rejects.toBeInstanceOf(JobQuotaError);
  await a.cancel(first.id);expect((await c.start(request)).status).toBe('queued');
  expect((await pool.query("SELECT started FROM studio_agent.daily_usage WHERE owner_key='*'")).rows[0].started).toBe(3);
 }));
 it('deleting terminal records cannot reset daily counters or enable empty rollback',async()=>withTestPostgres(async pool=>{
  const a=new PostgresAgentJobs(pool,actor,{dailyOwner:1});const job=await a.start(request);
  await a.cancel(job.id);expect(await a.remove(job.id)).toBe(true);expect(await a.list()).toEqual([]);
  const reopened=new PostgresAgentJobs(pool,actor,{dailyOwner:1});await expect(reopened.start(request)).rejects.toBeInstanceOf(JobQuotaError);
  await expect(rollbackEmptyStudioPostgres(pool)).rejects.toThrow('data exists');
  expect((await pool.query('SELECT count(*)::int AS n FROM studio_agent.daily_usage')).rows[0].n).toBe(2);
 }));
 it('uses UTC date boundaries and preserves older usage',async()=>withTestPostgres(async pool=>{
  await pool.query("INSERT INTO studio_agent.daily_usage(day,owner_key,started) VALUES((clock_timestamp() AT TIME ZONE 'UTC')::date-1,'*',300),((clock_timestamp() AT TIME ZONE 'UTC')::date-1,'anonymous:quota-a',30)");
  const api=new PostgresAgentJobs(pool,actor);expect((await api.start(request)).status).toBe('queued');
  expect((await pool.query('SELECT count(*)::int AS n FROM studio_agent.daily_usage')).rows[0].n).toBe(4);
 }));
});
