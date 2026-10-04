import type { TextProposal, StudioVersion } from './studio-model';
export type AgentJob = {id:string;status:'queued'|'running'|'candidate'|'failed'|'cancelled'|'interrupted';candidate?:TextProposal};
export class AgentJobRequestError extends Error {constructor(public status:number){super(status===503?'服务端尚未配置模型。':status===404?'生成记录已不存在。':'生成任务操作失败，请稍后重试。');}}
export async function agentJobRequest(action:'start'|'query'|'cancel',body:unknown,signal?:AbortSignal):Promise<AgentJob>{
  const res=await fetch(`/api/studio-agent/jobs/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),...(signal?{signal}:{} )});
  if(!res.ok)throw new AgentJobRequestError(res.status);
  const data=await res.json() as {job?:AgentJob};
  if(!data.job||typeof data.job.id!=='string'||!['queued','running','candidate','failed','cancelled','interrupted'].includes(data.job.status))throw new Error('生成任务响应无效。');
  return data.job;
}
export async function waitAgentJob(id:string,signal:AbortSignal):Promise<AgentJob>{
  for(let i=0;i<180;i++){
    signal.throwIfAborted();
    const job=await agentJobRequest('query',{id},signal);
    if(job.status!=='running'&&job.status!=='queued')return job;
    await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},1000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  }
  throw new Error('等待超时。任务记录已保留，可恢复查询。');
}
export function validateJobCandidate(job:AgentJob,version:StudioVersion):TextProposal{
  if(job.status==='interrupted')throw new Error('服务重启中断了上次生成，请重新生成。');
  if(job.status==='cancelled')throw new Error('生成已取消，作品未修改。');
  if(job.status!=='candidate'||!job.candidate)throw new Error('未生成可用候选，请重新尝试。');
  const p=job.candidate;
  if(p.baseId!==version.id||p.baseSource!==version.source||typeof p.targetId!=='string'||typeof p.after!=='string')throw new Error('草稿版本已变化，旧候选未应用。请放弃此候选后重新生成。');
  return p;
}
