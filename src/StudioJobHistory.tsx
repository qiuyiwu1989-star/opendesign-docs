import { useState } from 'react';
import { protectedRemoteJobIds } from './studio-remote-store';
type Summary={id:string;status:string;createdAt:string;updatedAt:string};
const pendingIds=()=>Object.keys(localStorage).filter(k=>k.startsWith('opendesign-agent-job:')).map(k=>localStorage.getItem(k)??'');
const labels:Record<string,string>={queued:'排队中',running:'生成中',candidate:'候选已生成',failed:'失败',cancelled:'已取消',interrupted:'已中断'};
export function StudioJobHistory({disabled}:{disabled:boolean}){
 const [rows,setRows]=useState<Summary[]>([]),[opened,setOpened]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState<string|null>(null),[protectedIds,setProtectedIds]=useState<string[]>([]);
 const refresh=async()=>{
  const res=await fetch('/api/studio-agent/jobs/list',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  if(!res.ok)throw new Error('无法读取本机生成记录。');
  const data=await res.json() as {jobs:Summary[]};
  if(!Array.isArray(data.jobs))throw new Error('记录格式无效。');
  const protectedJobs=[...pendingIds(),...await protectedRemoteJobIds()];
  setRows(data.jobs);
  setProtectedIds(protectedJobs);
 };
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作失败。');}finally{setBusy(false);}};
 return <section className="studio-job-history" aria-label="本机生成记录"><button disabled={disabled||busy} onClick={()=>{setOpened(!opened);if(!opened)void run(refresh);}}>本机生成记录{opened?' · 收起':''}</button>
 {opened&&<><p>显示当前浏览器会话的生成记录，最多 100 条。清理不删除已保存作品；待恢复记录请先在对应任务中处理。清除 Cookie 或会话到期后，将无法从此列表访问旧记录。</p>{error&&<p role="alert">{error}</p>}<button disabled={busy||disabled} onClick={()=>void run(refresh)}>刷新记录</button><span> 共 {rows.length} 条</span>
 {rows.map(row=><div key={row.id}><span>{labels[row.status]??'未知状态'} · {new Date(row.createdAt).toLocaleString()} · {row.id.slice(0,8)}</span><button disabled={!!error||busy||disabled||(row.status==='running'||row.status==='queued')||protectedIds.includes(row.id)} onClick={()=>setConfirm(row.id)}>清理记录</button>
 {confirm===row.id&&<span>确认移除这条生成记录？ <button disabled={busy||disabled} onClick={()=>void run(async()=>{if(row.status==='queued'||row.status==='running')throw new Error('排队或生成中的记录不能清理，请先取消。');if([...pendingIds(),...await protectedRemoteJobIds()].includes(row.id))throw new Error('请先在对应任务中处理待恢复候选。');const res=await fetch('/api/studio-agent/jobs/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id})});if(!res.ok)throw new Error(res.status===409?'排队或生成中的记录不能清理。':'清理失败，请刷新后重试。');setConfirm(null);await refresh();})}>确认清理</button><button disabled={busy} onClick={()=>setConfirm(null)}>保留</button></span>}</div>)}
 {!rows.length&&!busy&&<p>暂无生成记录。</p>}</>}
 </section>;
}
