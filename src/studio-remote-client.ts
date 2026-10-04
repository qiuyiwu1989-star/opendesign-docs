import { AgentJobRequestError, agentJobRequest, validateJobCandidate, waitAgentJob } from './studio-agent-client';
import { readRemoteRecord, saveRemoteRecord, type RemoteRecord, type RemoteProject, type RemoteOperation } from './studio-remote-store';
import { applyProposal } from './studio-model';

export class RemoteRequestError extends Error {
  constructor(public readonly status:number){super(status===404?'此会话无法访问服务端项目。请保留本地任务，检查是否清除了 Cookie。':status===409?'服务端版本已变化，当前操作未覆盖新版本。':status===503?'服务端尚未配置模型。':'服务端操作未完成，请恢复查询，不要重复创建项目。');}
}
export class RemoteSyncError extends Error {
  constructor(){super('服务端可能已保存，但本机同步尚未完成。操作记录已保留，请点击恢复操作。');}
}
async function api(path:string,body:unknown):Promise<any>{
  const res=await fetch(`/api/studio-agent/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw new RemoteRequestError(res.status);
  return res.json();
}
function projectValue(value:unknown,id:string):RemoteProject {
  const p=value as RemoteProject;
  if(!p||p.id!==id||!Array.isArray(p.revisions)||!p.revisions.length||p.revisions.length>20||p.headRevision!==p.revisions.at(-1)?.id)throw new Error('服务端项目响应无效。');
  return p;
}
async function required(taskId:string){const record=await readRemoteRecord(taskId);if(!record)throw new Error('请先创建服务端副本。');return record;}
const head=(r:RemoteRecord)=>{const version=r.project?.revisions.at(-1);if(!version)throw new Error('服务端项目尚未同步。');return version;};
export const loadRemote=readRemoteRecord;
async function commit(record:RemoteRecord,changes:Partial<RemoteRecord>):Promise<RemoteRecord>{
  try{return await saveRemoteRecord({...record,...changes},record.revision);}catch{if(record.pending)throw new RemoteSyncError();throw new Error('服务端项目已读取，但本机缓存更新失败，请重新刷新项目。');}
}
async function begin(record:RemoteRecord,pending:RemoteOperation){
  if(record.pending)throw new Error('请先恢复未完成操作。');
  return saveRemoteRecord({...record,pending},record.revision);
}
export async function createRemote(taskId:string,source:string):Promise<RemoteRecord>{
  if(await readRemoteRecord(taskId))throw new Error('已有服务端副本或创建记录，请恢复操作。');
  const id=crypto.randomUUID();
  await saveRemoteRecord({taskId,projectId:id,project:null,candidate:null,pending:{kind:'create',id,source}},0);
  return resumeRemote(taskId);
}
export async function resumeRemote(taskId:string):Promise<RemoteRecord>{
  const record=await required(taskId),op=record.pending;
  if(!op)return record;
  if(op.kind==='generate'){
    const base=head(record);
    try {
      await agentJobRequest('start',{id:op.id,projectId:record.projectId,baseRevision:op.baseRevision,targetId:op.targetId,instruction:op.instruction});
      const job=await waitAgentJob(op.id,new AbortController().signal);
      if(job.status!=='candidate'){
        await commit(record,{pending:null,candidate:null});
        throw new Error('生成未完成，作品未修改。请重新填写要求后再试。');
      }
      const proposal=validateJobCandidate(job,{id:base.id,source:base.source,label:'服务端版本'});
      return commit(record,{pending:null,candidate:{jobId:job.id,proposal}});
    }catch(error){
      if(error instanceof AgentJobRequestError&&[400,409,422].includes(error.status))await commit(record,{pending:null});
      throw error;
    }
  }
  let project:RemoteProject;
  try {
    if(op.kind==='create'){
      project=projectValue((await api('projects/create',{id:record.projectId,source:op.source})).project,record.projectId);
      if(project.revisions[0]?.source!==op.source)throw new Error('项目创建回执不匹配。');
    }else if(op.kind==='save'){
      project=projectValue((await api('projects/save',{projectId:record.projectId,expectedRevision:op.baseRevision,source:op.source,operationId:op.id})).project,record.projectId);
      if(!project.revisions.some(v=>v.savedOperationId===op.id&&v.parentId===op.baseRevision&&v.source===op.source))throw new Error('保存回执不匹配。');
    }else {
      const accepted=await api('projects/accept',{projectId:record.projectId,jobId:op.jobId});
      if(accepted.projectId!==record.projectId||accepted.revision?.acceptedJobId!==op.jobId||accepted.revision?.parentId!==op.baseRevision||accepted.revision?.source!==op.expectedSource)throw new Error('候选确认回执不匹配。');
      project=projectValue((await api('projects/read',{projectId:record.projectId})).project,record.projectId);
      if(!project.revisions.some(v=>v.id===accepted.revision.id&&v.source===op.expectedSource))throw new Error('已确认版本尚未同步。');
    }
  }catch(error){
    // A conflict response proves this operation was not committed. Keep the candidate for comparison.
    if(error instanceof RemoteRequestError&&error.status===409)await commit(record,{pending:null});
    throw error;
  }
  return commit(record,{project,pending:null,candidate:null});
}
export async function refreshRemote(taskId:string):Promise<RemoteRecord>{
  const record=await required(taskId);if(record.pending)throw new Error('请先恢复未完成操作。');
  const project=projectValue((await api('projects/read',{projectId:record.projectId})).project,record.projectId);
  const candidate=record.candidate?.proposal.baseId===project.headRevision?record.candidate:null;
  return commit(record,{project,candidate});
}
export async function generateRemote(taskId:string,targetId:string,instruction:string):Promise<RemoteRecord>{
  const record=await required(taskId);if(record.candidate)throw new Error('请先确认或放弃当前候选。');
  const base=head(record);
  await begin(record,{kind:'generate',id:crypto.randomUUID(),baseRevision:base.id,targetId,instruction});
  return resumeRemote(taskId);
}
export async function acceptRemote(taskId:string):Promise<RemoteRecord>{
  const record=await required(taskId);if(!record.candidate)throw new Error('没有可确认的候选。');
  if(record.project!.revisions.length>=20)throw new Error('项目已达20个版本，请先创建 Docs 副本保存作品。');
  const base=head(record),candidate=record.candidate;
  const expectedSource=applyProposal({id:base.id,source:base.source,label:'服务端版本'},candidate.proposal);
  await begin(record,{kind:'accept',id:crypto.randomUUID(),jobId:candidate.jobId,baseRevision:base.id,expectedSource});
  return resumeRemote(taskId);
}
export async function discardRemoteCandidate(taskId:string):Promise<RemoteRecord>{
  const record=await required(taskId);if(record.pending)throw new Error('请先恢复未完成操作。');
  return saveRemoteRecord({...record,candidate:null},record.revision);
}
export async function saveRemote(taskId:string,source:string):Promise<RemoteRecord>{
  const record=await required(taskId);if(record.candidate)throw new Error('请先确认或放弃当前候选。');
  if(record.project!.revisions.length>=20)throw new Error('项目已达20个版本，请先创建 Docs 副本保存作品。');
  await begin(record,{kind:'save',id:crypto.randomUUID(),baseRevision:head(record).id,source});
  return resumeRemote(taskId);
}
