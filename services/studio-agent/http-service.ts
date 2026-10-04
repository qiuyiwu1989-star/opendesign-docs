import type { Pool } from 'pg';
import { PostgresProjectRepository, ProjectCapacityError } from './pg-projects';
import { PostgresAgentJobs, JobQuotaError } from './pg-jobs';
import { verifyStudioPostgres } from './pg-core';
import { acquireStateLock } from './state-lock';
import { LocalProjectRepository, ProjectRevisionConflict } from './projects';
import { type Principal, bindJob, assertJobAccess, StudioAccessError } from './access';
import { loadLocalSessionCodec } from './session';
import { anonymousIdentityResolver, validatedPrincipal, principalKey, localJobsDirectory, type IdentityResolver } from './identity';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TextProposal } from '../../src/studio-model';
import { resolve, join } from 'node:path';
import { LocalAgentJobs, RunningJobRemovalError } from './jobs';
import { runTextEdit, type EditRequest } from './run';

export type StudioAgentServiceOptions = {
  postgresPool?: Pool;
  publicOrigin?: string;
  stateDirectory?: string;
  execute?: (request: EditRequest, signal: AbortSignal) => Promise<TextProposal>;
  modelConfigured?: () => boolean;
};
/** Local anonymous service only; preserves the development origin/loopback boundary. */
export function createStudioAgentService(options: StudioAgentServiceOptions = {}, testIdentityResolver?: IdentityResolver) {
    if (testIdentityResolver && process.env.NODE_ENV !== 'test') throw new Error('Identity injection is test-only');
    let publicOrigin: URL | undefined;
    if(options.publicOrigin !== undefined) {
      try { publicOrigin = new URL(options.publicOrigin); } catch { throw new Error('Invalid public origin'); }
      if(publicOrigin.protocol!=='https:' || publicOrigin.username || publicOrigin.password || publicOrigin.origin!==options.publicOrigin || publicOrigin.pathname!=='/' || publicOrigin.search || publicOrigin.hash) throw new Error('Invalid public origin');
      if(!options.postgresPool)throw new Error('Public Studio requires PostgreSQL');
    }
    const pendingRequests = new Set<Promise<void>>();
    let closed = false;
    let closing: Promise<void> | undefined;
    const configured = options.modelConfigured ?? (() => Boolean(options.postgresPool || process.env.ARK_API_KEY));
    const execute = options.execute ?? ((request: EditRequest, signal: AbortSignal) => runTextEdit(request, {apiKey:process.env.ARK_API_KEY ?? ''}, signal));
    const root = resolve(options.stateDirectory ?? process.env.STUDIO_AGENT_STATE_DIR ?? '.local/studio-agent');
    let release: (() => void) | undefined;
    const sessions = acquireStateLock(root).then(async unlock => {
      release = unlock;
      try { if(options.postgresPool)await verifyStudioPostgres(options.postgresPool); return await loadLocalSessionCodec(root,Boolean(publicOrigin)); } catch (error) {release();release=undefined;throw error;}
    });
    const ready = sessions.then(() => {}); ready.catch(() => {});
    const projects = options.postgresPool ? new PostgresProjectRepository(options.postgresPool) : new LocalProjectRepository(join(root, 'projects'));
    let modelActive = false;
    const executions = new Set<Promise<TextProposal>>();
    const managers = new Map<string, Promise<LocalAgentJobs | PostgresAgentJobs>>();
    const jobsFor = (actor: Principal): Promise<LocalAgentJobs | PostgresAgentJobs> => {
      if(options.postgresPool)return Promise.resolve(new PostgresAgentJobs(options.postgresPool,actor));
      const scope = principalKey(actor);
      const existing = managers.get(scope); if (existing) return existing;
      if (managers.size >= 32) throw new Error('Session capacity reached');
      const jobs = new LocalAgentJobs(join(...localJobsDirectory(root, actor)), async (request,signal) => {
        if (modelActive) throw new Error('Local model concurrency reached');
        if (!configured()) throw new Error('Model not configured');
        modelActive = true;
        const execution = Promise.resolve().then(() => execute(request,signal));
        executions.add(execution);
        try { return await execution; }
        finally { modelActive = false; executions.delete(execution); }
      });
      const ready = jobs.initialize().then(() => jobs);
      managers.set(scope, ready);
      ready.catch(() => { managers.delete(scope); });
      return ready;
    };
    const close = (): Promise<void> => {
      closed = true;
      return closing ??= (async () => {
        await Promise.allSettled([...pendingRequests]);
        await sessions.catch(() => {});
        try {await Promise.all([...managers.values()].map(async manager => (await manager).close()));}
        finally {
          // Real workers terminate on abort; bound waiting for broken/custom executors.
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([Promise.allSettled([...executions]),new Promise<void>(resolve => {timer=setTimeout(resolve,2000);})]);
          } finally {if(timer)clearTimeout(timer);release?.();release=undefined;}
        }
      })();
    };
    const processRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      const json=(status:number,value:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
      if (closed) {json(503,{error:'任务服务已关闭。'});return;}
      const host=req.headers.host;
      if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'') || !host || (publicOrigin ? host!==publicOrigin.host || req.headers.origin!==publicOrigin.origin : !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || req.headers.origin!==`http://${host}`)) {json(403,{error:'仅允许本机同源请求。'});return;}
      if(req.method!=='POST'||req.headers['content-type']?.split(';')[0]?.trim().toLowerCase()!=='application/json'){json(400,{error:'请求格式无效。'});return;}
      const action=req.url;
      if(!['/jobs/start','/jobs/query','/jobs/cancel','/jobs/list','/jobs/remove','/projects/create','/projects/list','/projects/read','/projects/save','/projects/accept'].includes(action??'')){json(404,{error:'接口不存在。'});return;}
      try {await ready;} catch {json(503,{error:'任务服务初始化失败或数据目录已被占用。'});return;}
      const chunks:Buffer[]=[];let size=0,finished=false;
      const timer=setTimeout(()=>{if(!finished){finished=true;json(408,{error:'读取请求超时。'});req.destroy();}},10000);
      try {
        for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>250000){finished=true;json(413,{error:'请求过大。'});return;}chunks.push(bytes);}
        clearTimeout(timer);if(finished)return;finished=true;
        const body:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
        if(!body||typeof body!=='object'||Array.isArray(body)){json(400,{error:'请求无效。'});return;}
        if (['owner','ownerId','userId','scope','sessionId','projectOwner'].some(key => Object.hasOwn(body,key))) {json(400,{error:'不能指定任务归属。'});return;}
        const identity = await (testIdentityResolver ?? anonymousIdentityResolver(await sessions))(req.headers.cookie);
        const actor = validatedPrincipal(identity);
        if (!options.postgresPool && !managers.has(principalKey(actor)) && managers.size >= 32) {json(429,{error:'本机匿名会话数量已达上限，请重启开发服务后重试。'});return;}
        if (closed) {json(503,{error:'任务服务已关闭。'});return;}
        const jobs = await jobsFor(actor);
        if (identity.setCookie) res.setHeader('Set-Cookie',identity.setCookie);
        const input = body as Record<string, unknown>;
        const fields = (allowed: string[]) => {
          if(Object.keys(input).some(key=>!allowed.includes(key))) throw new Error('Invalid fields');
        };
        const field = (key: string): string => {if(typeof input[key]!=='string')throw new Error('Missing field');return input[key] as string;};
        if(action==='/projects/list') {
          fields(['limit','cursor']);
          json(200,await projects.list(actor,input));return;
        }
        if(action==='/projects/create') {
          fields(['source','id']);
          json(201,{project:await projects.create(actor,field('source'),Object.hasOwn(input,'id')?field('id'):undefined)});return;
        }
        if(action==='/projects/read') {
          fields(['projectId']);
          json(200,{project:await projects.read(actor,field('projectId'))});return;
        }
        if(action==='/projects/save') {
          fields(['projectId','expectedRevision','source','operationId']);
          json(200,{project:await projects.save(actor,field('projectId'),field('expectedRevision'),field('source'),Object.hasOwn(input,'operationId')?field('operationId'):undefined)});return;
        }
        if(action==='/projects/accept') {
          fields(['projectId','jobId']);
          const project = await projects.read(actor,field('projectId'));
          const jobId=field('jobId');
          const accepted=project.revisions.find(revision=>revision.acceptedJobId===jobId);
          if(accepted){json(200,{projectId:project.id,revision:accepted});return;}
          const job = await jobs.get(jobId);
          if(!job?.binding)throw new StudioAccessError();
          const base = await projects.readRevision(actor,project.id,job.binding.baseRevision);
          assertJobAccess(actor,{id:project.id,owner:project.owner},job.binding,base.id);
          if(job.status!=='candidate'||!job.candidate) {json(409,{error:'候选尚不可确认。'});return;}
          if(job.candidate.baseId!==base.id||job.candidate.baseSource!==base.source)throw new StudioAccessError();
          const revision=await projects.acceptCandidate(actor,project.id,job.id,job.candidate);
          json(200,{projectId:project.id,revision});return;
        }
        if(action==='/jobs/start'){
          if(!configured()){json(503,{error:'服务端尚未配置模型。'});return;}
          const requestedId=(body as {id?:unknown}).id;
          if(requestedId!==undefined&&typeof requestedId!=='string'){json(400,{error:'任务标识无效。'});return;}
          if(Object.hasOwn(input,'projectId')) {
            fields(['id','projectId','baseRevision','targetId','instruction']);
            const project = await projects.read(actor,field('projectId'));
            const base = await projects.readRevision(actor,project.id,field('baseRevision'));
            const binding = bindJob(actor,{id:project.id,owner:project.owner},{projectId:project.id,baseRevision:base.id});
            if(project.headRevision!==base.id && !(requestedId && await jobs.get(requestedId)))throw new ProjectRevisionConflict();
            const record=await jobs.start({version:{id:base.id,source:base.source,label:'项目版本'},targetId:field('targetId'),instruction:field('instruction')},requestedId,binding);
            json(202,{job:record});return;
          }
          // Browser-only legacy drafts remain isolated by session; they cannot use project acceptance.
          fields(['id','version','targetId','instruction']);
          const record=await jobs.start(body as EditRequest,requestedId);json(202,{job:record});return;
        }
        if(action==='/jobs/list'){json(200,{jobs:await jobs.list()});return;}
        const id=(body as {id?:unknown}).id;
        if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id)){json(400,{error:'任务标识无效。'});return;}
        if(action==='/jobs/remove'){const removed=await jobs.remove(id);json(removed?200:404,removed?{removed:true}:{error:'生成任务不存在。'});return;}
        const job=action==='/jobs/cancel'?await jobs.cancel(id):await jobs.get(id);
        if(!job){json(404,{error:'生成任务不存在。'});return;}
        json(200,{job});
      } catch (error) {
        if(!res.destroyed&&!res.writableEnded) {
          const status=error instanceof JobQuotaError||error instanceof ProjectCapacityError?429:error instanceof StudioAccessError?404:error instanceof ProjectRevisionConflict||error instanceof RunningJobRemovalError?409:422;
          json(status,{error:error instanceof ProjectCapacityError?'项目数量已达上限，现有作品已保留。':error instanceof JobQuotaError?'今日或排队额度已用尽，请稍后再试。原作品已保留。':error instanceof StudioAccessError?'项目或任务不可访问。':error instanceof ProjectRevisionConflict?'项目版本已变化，请重新读取。':error instanceof RunningJobRemovalError?'排队或运行中的任务不能删除，请先取消。':'任务操作失败，请检查输入或稍后重试。'});
        }
      }
      finally{clearTimeout(timer);}
    };
    const handle = (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      const pending = processRequest(req,res);
      pendingRequests.add(pending);
      void pending.then(() => pendingRequests.delete(pending), () => pendingRequests.delete(pending));
      return pending;
    };
    const health = async () => {await ready;if(closed)throw new Error('Service closed');if(options.postgresPool)await options.postgresPool.query('SELECT 1');};
    return { handle, close, ready, health };
}
