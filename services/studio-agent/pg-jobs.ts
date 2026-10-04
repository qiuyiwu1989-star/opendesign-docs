import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { assertJobAccess, type JobBinding, type Principal } from './access';
import { buildCandidate, selectionContext } from './candidate';
import type { EditRequest } from './run';
import type { TextProposal } from '../../src/studio-model';
import { RunningJobRemovalError, type JobRecord, type JobFailureCode } from './jobs';
import { ProjectRevisionConflict } from './projects';

export const PG_JOBS_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS studio_agent;
CREATE TABLE IF NOT EXISTS studio_agent.jobs (
 owner_kind text NOT NULL CHECK (owner_kind IN ('anonymous','user')),
 owner_id text NOT NULL,
 id uuid NOT NULL,
 project_id uuid REFERENCES studio_agent.projects(id),
 status text NOT NULL CHECK(status IN ('queued','running','candidate','failed','cancelled','interrupted')),
 request_hash text NOT NULL,
 payload jsonb,
 binding jsonb,
 candidate jsonb,
 failure_code text,
 provider_status integer,
 lease_token uuid,
 lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_kind,owner_id,id)
);
CREATE TABLE IF NOT EXISTS studio_agent.daily_usage (
 day date NOT NULL, owner_key text NOT NULL, started integer NOT NULL CHECK(started>=0), PRIMARY KEY(day,owner_key)
);
CREATE INDEX IF NOT EXISTS jobs_pending_idx ON studio_agent.jobs(status,created_at);
`;
export type PostgresJobRecord = Omit<JobRecord,'status'> & {status:JobRecord['status']|'queued'};
export type Lease = {owner:Principal;id:string;token:string;request:EditRequest};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codes=new Set(['provider','network','timeout','configuration','invalid_output','cancelled','execution']);
const ownerValues=(owner:Principal)=>[owner.kind,owner.id];
function validOwner(owner:Principal):Principal {
 if(!owner||!['anonymous','user'].includes(owner.kind)||typeof owner.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(owner.id))throw new Error('任务身份无效。');
 return {kind:owner.kind,id:owner.id};
}
async function transaction<T>(pool:Pool, work:(client:PoolClient)=>Promise<T>):Promise<T>{
 const client=await pool.connect();try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
function record(row:Record<string,any>):PostgresJobRecord{
 return {id:row.id,status:row.status,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),requestHash:row.request_hash,
 ...(row.binding?{binding:row.binding}:{}),...(row.status==='candidate'?{candidate:row.candidate}:{}),
 ...(row.status==='failed'?{error:'生成未完成，请重试。作品未修改。',failureCode:codes.has(row.failure_code)?row.failure_code:'execution',...(row.failure_code==='provider'&&Number.isInteger(row.provider_status)&&row.provider_status>=100&&row.provider_status<=599?{providerStatus:row.provider_status}:{})}:{}),
 ...(row.status==='interrupted'?{error:'执行租约已失效，请重新生成。作品未修改。'}:{})};
}
export type JobQuota = {dailyOwner:number;dailyGlobal:number;pendingOwner:number;pendingGlobal:number};
export const DEFAULT_JOB_QUOTA:Readonly<JobQuota> = Object.freeze({dailyOwner:30,dailyGlobal:300,pendingOwner:5,pendingGlobal:20});
export class JobQuotaError extends Error {
 constructor(){super('免费生成额度或排队数量已达上限，请稍后重试。');this.name='JobQuotaError';}
}
/** Owner-scoped durable queue API. Worker execution is deliberately separate. */
export class PostgresAgentJobs {
 private actor:Principal;
 private quota:JobQuota;
 constructor(private pool:Pool,actor:Principal,quota:Partial<JobQuota>={}){this.actor=validOwner(actor);this.quota={...DEFAULT_JOB_QUOTA,...quota};if(Object.values(this.quota).some(n=>!Number.isSafeInteger(n)||n<1))throw new Error('Invalid quota');}
 async initialize():Promise<void>{/* Schema is owned by the explicit migration entrypoint. */}
 async close():Promise<void>{/* API shutdown does not cancel durable queued/running work. */}
 async start(request:EditRequest,id:string= randomUUID(),binding?:JobBinding):Promise<PostgresJobRecord>{
  if(!uuid.test(id)||!request||typeof request.instruction!=='string'||!request.instruction.trim()||request.instruction.length>2000)throw new Error('任务请求无效。');
  selectionContext(request.version,request.targetId);
  const input=structuredClone(request);
  const bound=binding===undefined?undefined:assertJobAccess(this.actor,{id:binding.projectId,owner:this.actor},binding,input.version.id);
  if(bound&&!uuid.test(bound.projectId))throw new Error('项目标识无效。');
  const hash=createHash('sha256').update(JSON.stringify([this.actor.kind,this.actor.id,input.version.id,input.version.source,input.targetId,input.instruction,bound??null])).digest('hex');
  // Imported JSON jobs used a binding-aware hash without the owner prefix. The
  // database lookup is still owner-scoped; accepting either preserves retries.
  const legacyInput:unknown[]=[input.version.id,input.version.source,input.targetId,input.instruction];
  if(bound)legacyInput.push(bound);
  const legacyHash=createHash('sha256').update(JSON.stringify(legacyInput)).digest('hex');
  return transaction(this.pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`studio-agent-owner:${this.actor.kind}:${this.actor.id}`]);
   const existing=await c.query('SELECT * FROM studio_agent.jobs WHERE owner_kind=$1 AND owner_id=$2 AND id=$3',[...ownerValues(this.actor),id]);
   if(existing.rows[0]){if(existing.rows[0].request_hash!==hash&&existing.rows[0].request_hash!==legacyHash)throw new Error('任务标识已用于其他请求。');return record(existing.rows[0]);}
   if(bound){
    const result=await c.query('SELECT owner_kind,owner_id,document FROM studio_agent.projects WHERE id=$1 FOR SHARE',[bound.projectId]);
    const project=result.rows[0];
    if(!project||project.owner_kind!==this.actor.kind||project.owner_id!==this.actor.id)throw new Error('项目不可访问。');
    const doc=project.document;
    const base=Array.isArray(doc?.revisions)?doc.revisions.find((r:{id:string})=>r.id===bound.baseRevision):undefined;
    if(!base||base.source!==input.version.source)throw new Error('项目基准版本不匹配。');
    if(doc.headRevision!==bound.baseRevision)throw new ProjectRevisionConflict();
   }
   const count=await c.query('SELECT count(*)::int AS n FROM studio_agent.jobs WHERE owner_kind=$1 AND owner_id=$2',ownerValues(this.actor));
   if(count.rows[0].n>=100)throw new Error('任务已达100条，请清理终态记录。');
   // Separate from claim's lock: all admissions share one atomic global budget check.
   await c.query('SELECT pg_advisory_xact_lock(734901922)');
   const day=(await c.query("SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text AS day")).rows[0].day;
   const ownerKey=`${this.actor.kind}:${this.actor.id}`;
   const usage=await c.query('SELECT owner_key,started FROM studio_agent.daily_usage WHERE day=$1 AND owner_key=ANY($2::text[])',[day,['*',ownerKey]]);
   const totals=new Map(usage.rows.map(r=>[r.owner_key,r.started as number]));
   const pending=await c.query("SELECT count(*)::int AS global_count,count(*) FILTER (WHERE owner_kind=$1 AND owner_id=$2)::int AS owner_count FROM studio_agent.jobs WHERE status IN ('queued','running')",ownerValues(this.actor));
   if((totals.get('*')??0)>=this.quota.dailyGlobal||(totals.get(ownerKey)??0)>=this.quota.dailyOwner||pending.rows[0].global_count>=this.quota.pendingGlobal||pending.rows[0].owner_count>=this.quota.pendingOwner)throw new JobQuotaError();
   await c.query('INSERT INTO studio_agent.daily_usage(day,owner_key,started) SELECT $1,unnest($2::text[]),1 ON CONFLICT(day,owner_key) DO UPDATE SET started=studio_agent.daily_usage.started+1',[day,['*',ownerKey]]);
   const result=await c.query(`INSERT INTO studio_agent.jobs(owner_kind,owner_id,id,project_id,status,request_hash,payload,binding) VALUES($1,$2,$3,$4,'queued',$5,$6,$7) RETURNING *`,[...ownerValues(this.actor),id,bound?.projectId??null,hash,input,bound??null]);
   return record(result.rows[0]);
  });
 }
 async get(id:string):Promise<PostgresJobRecord|undefined>{if(!uuid.test(id))return;const r=await this.pool.query('SELECT * FROM studio_agent.jobs WHERE owner_kind=$1 AND owner_id=$2 AND id=$3',[...ownerValues(this.actor),id]);return r.rows[0]?record(r.rows[0]):undefined;}
 async list():Promise<Pick<PostgresJobRecord,'id'|'status'|'createdAt'|'updatedAt'>[]>{const r=await this.pool.query('SELECT id,status,created_at,updated_at FROM studio_agent.jobs WHERE owner_kind=$1 AND owner_id=$2 ORDER BY updated_at DESC,id',ownerValues(this.actor));return r.rows.map(v=>({id:v.id,status:v.status,createdAt:new Date(v.created_at).toISOString(),updatedAt:new Date(v.updated_at).toISOString()}));}
 async cancel(id:string):Promise<PostgresJobRecord|undefined>{
  if(!uuid.test(id))return;
  await this.pool.query(`UPDATE studio_agent.jobs SET status='cancelled',payload=NULL,updated_at=clock_timestamp() WHERE owner_kind=$1 AND owner_id=$2 AND id=$3 AND status IN ('queued','running')`,[...ownerValues(this.actor),id]);return this.get(id);
 }
 async remove(id:string):Promise<boolean>{
  if(!uuid.test(id))return false;
  return transaction(this.pool,async c=>{
   const r=await c.query('SELECT status,(lease_token IS NOT NULL AND lease_until>clock_timestamp()) AS leased FROM studio_agent.jobs WHERE owner_kind=$1 AND owner_id=$2 AND id=$3 FOR UPDATE',[...ownerValues(this.actor),id]);
   if(!r.rows[0])return false;if(['queued','running'].includes(r.rows[0].status)||r.rows[0].leased)throw new RunningJobRemovalError();
   await c.query('DELETE FROM studio_agent.jobs WHERE owner_kind=$1 AND owner_id=$2 AND id=$3',[...ownerValues(this.actor),id]);return true;
  });
 }
}
const expireSql=`UPDATE studio_agent.jobs SET status='interrupted',payload=NULL,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE status='running' AND lease_until<=clock_timestamp()`;
const leaseWhere=`owner_kind=$1 AND owner_id=$2 AND id=$3 AND lease_token=$4 AND status='running' AND lease_until>clock_timestamp()`;
const leaseValues=(l:Lease)=>[...ownerValues(validOwner(l.owner)),l.id,l.token];
export class PostgresJobQueue {
 constructor(private pool:Pool,private leaseMs=60000){if(!Number.isSafeInteger(leaseMs)||leaseMs<1)throw new Error('Invalid lease duration');}
 async expire():Promise<number>{return (await this.pool.query(expireSql)).rowCount??0;}
 async claim():Promise<Lease|null>{
  return transaction(this.pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(734901921)');await c.query(expireSql);
   if((await c.query("SELECT 1 FROM studio_agent.jobs WHERE lease_token IS NOT NULL AND lease_until>clock_timestamp() LIMIT 1")).rowCount)return null;
   const found=await c.query("SELECT * FROM studio_agent.jobs WHERE status='queued' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1");
   const row=found.rows[0];if(!row)return null;
   const token=randomUUID();await c.query("UPDATE studio_agent.jobs SET status='running',lease_token=$4,lease_until=clock_timestamp()+($5 * interval '1 millisecond'),updated_at=clock_timestamp() WHERE owner_kind=$1 AND owner_id=$2 AND id=$3",[row.owner_kind,row.owner_id,row.id,token,this.leaseMs]);
   return {owner:validOwner({kind:row.owner_kind,id:row.owner_id}),id:row.id,token,request:row.payload};
  });
 }
 async heartbeat(lease:Lease):Promise<boolean>{return (await this.pool.query(`UPDATE studio_agent.jobs SET lease_until=clock_timestamp()+($5 * interval '1 millisecond'),updated_at=clock_timestamp() WHERE ${leaseWhere}`,[...leaseValues(lease),this.leaseMs])).rowCount===1;}
 async complete(lease:Lease,candidate:TextProposal):Promise<boolean>{
  return transaction(this.pool,async c=>{
   const result=await c.query(`SELECT payload FROM studio_agent.jobs WHERE ${leaseWhere} FOR UPDATE`,leaseValues(lease));const row=result.rows[0];if(!row)return false;
   const request=row.payload as EditRequest;
   if(!candidate||candidate.baseId!==request.version.id||candidate.baseSource!==request.version.source||candidate.targetId!==request.targetId)return false;
   let checked:TextProposal;try{checked=buildCandidate(request.version,request.targetId,candidate.after);if(checked.before!==candidate.before)return false;}catch{return false;}
   return (await c.query(`UPDATE studio_agent.jobs SET status='candidate',candidate=$5,payload=NULL,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE ${leaseWhere}`,[...leaseValues(lease),checked])).rowCount===1;
  });
 }
 /** Release only after the executor has actually stopped, including cancelled jobs. */
 async release(lease:Lease):Promise<boolean>{return (await this.pool.query(`UPDATE studio_agent.jobs SET status=CASE WHEN status='running' THEN 'interrupted' ELSE status END,payload=NULL,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE owner_kind=$1 AND owner_id=$2 AND id=$3 AND lease_token=$4`,leaseValues(lease))).rowCount===1;}
 async interrupt(lease:Lease):Promise<boolean>{return (await this.pool.query(`UPDATE studio_agent.jobs SET status='interrupted',payload=NULL,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE ${leaseWhere}`,leaseValues(lease))).rowCount===1;}
 async fail(lease:Lease,code:JobFailureCode='execution',providerStatus?:number):Promise<boolean>{
  const safeCode=codes.has(code)?code:'execution';const status=safeCode==='provider'&&typeof providerStatus==='number'&&Number.isInteger(providerStatus)&&providerStatus>=100&&providerStatus<=599?providerStatus:null;
  return (await this.pool.query(`UPDATE studio_agent.jobs SET status='failed',failure_code=$5,provider_status=$6,payload=NULL,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE ${leaseWhere}`,[...leaseValues(lease),safeCode,status])).rowCount===1;
 }
}
