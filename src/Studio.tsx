import { useEffect, useMemo, useRef, useState } from "react";
import { inspectHtml } from "./html";
import { applyProposal, createStructure, outlineFor, proposeText, type StudioDraft, type TextProposal } from "./studio-model";
import { listStudioTasks, migrateLegacyStudio, parseStudioBackup, saveStudioTask, studioBackup, type StudioTask } from "./studio-store";
import type { HandoffItem, ImportResult } from "./handoff";
import { AgentJobRequestError, agentJobRequest, waitAgentJob, validateJobCandidate } from "./studio-agent-client";
import { StudioBriefSummary } from "./StudioBriefSummary";
import { StudioBriefPanel } from "./StudioBriefPanel";
import { StudioCanvasPreview } from "./StudioCanvasPreview";
import { StudioRemoteWorkspace } from "./StudioRemoteWorkspace";
import { StudioJobHistory } from "./StudioJobHistory";
import "./studio.css";
import { StudioObjectWorkspace } from "./StudioObjectWorkspace";
const agentEnabled = import.meta.env.VITE_STUDIO_AGENT_ENABLED === "true";
const empty = ():StudioDraft => ({ brief:{title:"",audience:"",goal:"",materials:""},outline:[],versions:[] });
const errorText=(e:unknown)=>e instanceof Error?e.message:"操作失败，请重试。";
type Props={onClose:()=>void;onCreate:(items:HandoffItem[])=>Promise<ImportResult>};
export function Studio({onClose,onCreate}:Props){
  const dialog=useRef<HTMLDialogElement>(null),upload=useRef<HTMLInputElement>(null),dirty=useRef(false);
  const [tasks,setTasks]=useState<StudioTask[]>([]),[active,setActive]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [storageNotice,setStorageNotice]=useState("");
  const [remoteMode,setRemoteMode]=useState(false);
  const [pendingLeave,setPendingLeave]=useState<{action:()=>void}|null>(null);
  const requestLeave=(action:()=>void)=>{if(dirty.current)setPendingLeave({action});else action();};
  const close=()=>{if(!busy)requestLeave(onClose);};
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();let alive=true;
    void (async()=>{let notice="";try{await migrateLegacyStudio(localStorage);}catch(e){notice=errorText(e);}try{const rows=await listStudioTasks();if(alive){setTasks(rows);setActive(rows[0]?.id??"");setError(notice);}}catch(e){if(alive)setError(errorText(e));}finally{if(alive)setLoading(false);}})();
    const warn=(e:BeforeUnloadEvent)=>{if(dirty.current)e.preventDefault();};window.addEventListener("beforeunload",warn);
    return()=>{alive=false;previous?.focus();window.removeEventListener("beforeunload",warn);};},[]);
  const saved=(task:StudioTask)=>setTasks(rows=>[task,...rows.filter(t=>t.id!==task.id)]);
  const create=async(draft:StudioDraft)=>{setBusy(true);setError("");try{const task=await saveStudioTask(crypto.randomUUID(),draft,0);saved(task);dirty.current=false;setRemoteMode(false);setActive(task.id);}catch(e){setError(errorText(e));}finally{setBusy(false);}};
  const importBackup=async(file:File)=>{setBusy(true);try{if(file.size>5*1024*1024)throw new Error("备份不能超过 5 MiB。");const raw=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());await create(parseStudioBackup(raw));}catch(err){setError(errorText(err));}finally{setBusy(false);}};
  const selected=tasks.find(t=>t.id===active);
  return <dialog className="studio-dialog" ref={dialog} aria-labelledby="studio-title" onCancel={e=>{e.preventDefault();close();}}>
    <header className="studio-topbar"><div><span className="studio-brand">OpenDesign / Studio</span><h2 id="studio-title">创作工作区</h2></div><p>免费 · 本地草稿保存在浏览器 · {agentEnabled ? "AI 局部修改试用" : "尚未接入 AI"}</p><button disabled={busy} onClick={close} aria-label="关闭 Studio">返回 Docs ↗</button></header>
    {agentEnabled&&<StudioJobHistory disabled={busy}/>}
    {error&&<p role="alert">{error}</p>}
    {storageNotice&&<p role="status">{storageNotice}<button onClick={()=>setStorageNotice("")}>关闭提示</button></p>}
    {pendingLeave&&<section role="alert" className="studio-diff"><p>还有未保存的输入。离开后普通输入不会保存，已保存版本和 AI 生成记录会保留。</p><button autoFocus onClick={()=>setPendingLeave(null)}>返回继续编辑</button><button onClick={()=>{const action=pendingLeave.action;setPendingLeave(null);action();}}>放弃未保存输入并继续</button></section>}
    {loading?<p role="status">正在读取任务…</p>:<div className="studio-workspace">
      <fieldset disabled={busy} className="studio-task-tools"><legend>我的创作</legend>
        <label>当前任务<select value={active} onChange={e=>{const id=e.target.value;requestLeave(()=>{void (async()=>{setBusy(true);try{const rows=await listStudioTasks();setTasks(rows);dirty.current=false;setRemoteMode(false);setActive(id);}catch(e){setError(errorText(e));}finally{setBusy(false);}})();});}}><option value="" disabled>选择任务</option>{tasks.map(t=><option key={t.id} value={t.id}>{t.draft.brief.title||"未命名任务"} · {t.id.slice(0,8)}</option>)}</select></label>
        <button onClick={()=>requestLeave(()=>void create(empty()))}>新建任务</button>
        <button onClick={()=>upload.current?.click()}>从备份创建任务</button>
        {agentEnabled&&selected?.draft.versions.length&&!remoteMode?<button onClick={()=>requestLeave(()=>setRemoteMode(true))}>打开云端副本</button>:null}
        {agentEnabled&&selected?.draft.versions.length&&!remoteMode?<p className="studio-sidebar-note">创建云端副本会将当前作品上传以便 AI 修改；原本地作品保留。</p>:null}
        <p className="studio-sidebar-note">任务保存在当前浏览器。下载备份，可在其他设备继续。</p>
      </fieldset>
      <input ref={upload} hidden type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)requestLeave(()=>void importBackup(file));}}/>
      <main className="studio-main">{selected?remoteMode?<StudioRemoteWorkspace key={selected.id} task={selected} onBack={()=>requestLeave(()=>setRemoteMode(false))} onCreate={onCreate} onBusy={setBusy} onDirty={value=>{dirty.current=value;}}/>:<StudioTaskEditor key={`${selected.id}:${selected.revision}`} task={selected} busy={busy} setBusy={setBusy} onSaved={saved} onStorageNotice={setStorageNotice} onFork={create} onDirty={value=>{dirty.current=value;}} onCreate={onCreate} onClose={onClose}/>:<div className="studio-empty"><span className="studio-eyebrow">从一个想法开始</span><h3>把需求整理成一份方案</h3><p>填写目标、确认大纲，再把结构草稿带入 Docs 完善设计。</p><button className="primary" onClick={()=>void create(empty())}>创建第一个任务</button><p>已有草稿？从左侧恢复任务备份。</p></div>}</main>
    </div>}
  </dialog>;
}
function StudioTaskEditor({task,busy,setBusy,onSaved,onStorageNotice,onFork,onDirty,onCreate,onClose}:Props&{task:StudioTask;busy:boolean;setBusy:(v:boolean)=>void;onSaved:(t:StudioTask)=>void;onStorageNotice:(message:string)=>void;onFork:(draft:StudioDraft)=>Promise<void>;onDirty:(v:boolean)=>void}){
  const [stored,setStored]=useState(task),[draft,setDraft]=useState(task.draft),[outlineText,setOutlineText]=useState(task.draft.outline.join("\n"));
  const [target,setTarget]=useState(""),[replacement,setReplacement]=useState(""),[proposal,setProposal]=useState<TextProposal|null>(null),[error,setError]=useState("");
  const [agentInstruction,setAgentInstruction]=useState("");
  const [briefDirty,setBriefDirty]=useState(false);
  const [objectMode,setObjectMode]=useState(false);
  const [agentNotice,setAgentNotice]=useState("");
  const [jobStarting,setJobStarting]=useState(false);
  const pendingKey=`opendesign-agent-job:${task.id}`;
  const [pendingJob,setPendingJob]=useState<string|null>(()=>{try{return localStorage.getItem(pendingKey);}catch{return null;}});
  const pendingJobRef=useRef(pendingJob);
  const rememberJob=(id:string)=>{localStorage.setItem(pendingKey,id);pendingJobRef.current=id;setPendingJob(id);};
  const forgetJob=()=>{localStorage.removeItem(pendingKey);pendingJobRef.current=null;setPendingJob(null);};
  const agentAbort=useRef<AbortController|null>(null);
  useEffect(()=>()=>agentAbort.current?.abort(),[]);
  const current=draft.versions.at(-1),targets=useMemo(()=>current?inspectHtml(current.source).targets:[],[current]);
  const outline=outlineText.split("\n").map(t=>t.trim()).filter(Boolean);
  const contentUnsaved=JSON.stringify(draft)!==JSON.stringify(stored.draft)||outlineText!==stored.draft.outline.join("\n")||replacement!==(targets.find(t=>t.id===target)?.text||"");
  const unsaved=contentUnsaved||briefDirty;
  useEffect(()=>{if(!objectMode)onDirty(unsaved||!!agentInstruction.trim());},[unsaved,agentInstruction,onDirty,objectMode]);
  const run=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);try{await fn();setError("");}catch(e){setError(errorText(e));}finally{setBusy(false);}};
  const receiveJob=async(id:string,controller:AbortController)=>{
    if(!current)throw new Error("请先创建结构草稿。");
    const job=await waitAgentJob(id,controller.signal);
    controller.signal.throwIfAborted();
    const candidate=validateJobCandidate(job,current);
    const checked=proposeText(current,candidate.targetId,candidate.after);
    setTarget(checked.targetId);setReplacement(checked.after);setProposal(checked);setAgentInstruction("");
    setAgentNotice("候选待确认。刷新后可恢复查询，尚未修改作品。");
  };
  const resumeJob=()=>void run(async()=>{
    if(!pendingJob||!current)return;
    const controller=new AbortController();agentAbort.current=controller;setAgentNotice("正在恢复生成任务…");
    try{await receiveJob(pendingJob,controller);}catch(e){if(controller.signal.aborted){setAgentNotice("查询已停止，任务记录保留。");return;}throw e;}finally{agentAbort.current=null;}
  });
  const cancelJob=async()=>{
    const id=pendingJobRef.current;if(!id)return;
    const wasRunning=!!agentAbort.current;
    try{
      try{await agentJobRequest('cancel',{id});}catch(e){if(!(e instanceof AgentJobRequestError&&e.status===404))throw e;}
      agentAbort.current?.abort();
      if(wasRunning){setProposal(null);setReplacement(targets.find(t=>t.id===target)?.text||"");}
      try{forgetJob();}catch{onStorageNotice("服务端生成已取消或记录已不存在，但本机记录未能清理。作品未修改，请稍后重试放弃生成记录。");return;}setAgentNotice("已放弃生成记录，作品未修改。");
    }catch(e){if(wasRunning)setError(errorText(e));else throw e;}
  };
  const persist=async(next:StudioDraft)=>{const updated=await saveStudioTask(stored.id,next,stored.revision);setStored(updated);setDraft(updated.draft);onSaved(updated);};
  const clear=()=>{setProposal(null);setTarget("");setReplacement("");};
  const append=async(source:string,label:string)=>{if(draft.versions.length>=20)throw new Error("此任务已达 20 个版本，请下载备份或新建任务。");await persist({...draft,versions:[...draft.versions,{id:crypto.randomUUID(),source,label}]});clear();};
  const backupDraft=()=>{
    if(outline.length>12||outline.some(t=>t.length>80))throw new Error("请将大纲调整到 12 页以内，再下载备份。");
    return {...draft,outline};
  };
  const [backup,setBackup]=useState<{url:string;name:string}|null>(null);
  useEffect(()=>()=>{if(backup)URL.revokeObjectURL(backup.url);},[backup]);
  useEffect(()=>{setBackup(null);},[draft,outlineText]);
  if(objectMode&&current)return <StudioObjectWorkspace source={current.source} onDirty={onDirty} onBusy={setBusy} onBack={()=>{setObjectMode(false);onDirty(false);}} onSave={async source=>{await append(source,"对象排版修改");setObjectMode(false);onDirty(false);}}/>;
  return <>
    {error&&<p role="alert">{error}</p>}
    {agentNotice&&<p role="status">{agentNotice}</p>}
    {busy&&agentAbort.current&&<p role="status">正在生成局部修改候选… <button disabled={!pendingJob||jobStarting} onClick={()=>void cancelJob()}>取消生成</button></p>}
    {agentEnabled&&pendingJob&&!busy&&!proposal&&<section aria-label="上次生成任务"><p>有一项生成记录可恢复查询。</p><button disabled={unsaved} onClick={resumeJob}>恢复生成结果</button><button onClick={()=>void run(cancelJob)}>放弃生成记录</button></section>}
    <fieldset disabled={busy} className="studio-editor-fields">
    <div className="studio-task-heading"><div><span className="studio-eyebrow">创作任务</span><h3>{draft.brief.title||"未命名任务"}</h3></div><p role="status">{unsaved||agentInstruction.trim()?"有未保存输入":"任务已保存在本机"}</p></div>
    {error&&<button disabled={briefDirty} onClick={()=>void run(async()=>{
      let next=backupDraft();
      if(current&&replacement!==(targets.find(t=>t.id===target)?.text||"")){
        if(next.versions.length>=20)throw new Error("版本已满，请先复制未保存文字，再备份任务。");
        const source=applyProposal(current,proposeText(current,target,replacement));
        next={...next,versions:[...next.versions,{id:crypto.randomUUID(),source,label:"冲突或失败后的独立副本"}]};
      }
      await onFork(next);
    })}>保留当前修改为新任务</button>}
    <details className="studio-backup"><summary>任务备份</summary><button disabled={briefDirty} onClick={()=>{try{const data=studioBackup(backupDraft());setBackup({url:URL.createObjectURL(new Blob([data],{type:"application/json"})),name:"opendesign-studio-backup.json"});setError("");}catch(e){setError(errorText(e));}}}>准备任务备份</button>
    {backup&&<p><a href={backup.url} download={backup.name}>下载任务备份</a> · 包含需求、大纲和已应用版本；未确认的替换文字不在备份中。</p>}</details>
    <ol className="studio-steps" aria-label="创作进度"><li aria-current={!current&&!draft.outline.length?"step":undefined}>01 · 明确需求</li><li aria-current={!current&&draft.outline.length?"step":undefined}>02 · 确认大纲</li><li aria-current={current?"step":undefined}>03 · 完善草稿</li></ol>
    {!current?<>
      <StudioBriefPanel brief={draft.brief} onChange={brief=>setDraft({...draft,brief})}/>
      <button onClick={()=>void run(async()=>{const next=outlineFor(draft.brief);await persist({...draft,outline:next});setOutlineText(next.join("\n"));})}>整理大纲</button>
      {draft.outline.length>0&&<section className="studio-outline"><label>确认大纲（每行一页，2–12 页）<textarea rows={6} value={outlineText} onChange={e=>setOutlineText(e.target.value)}/></label><p>标题可以调整。目标与材料将按标题匹配，其他页留待完善。</p><button className="primary" onClick={()=>void run(async()=>{const source=createStructure(draft.brief,outline);await persist({...draft,outline,versions:[{id:crypto.randomUUID(),source,label:"结构初稿"}]});setOutlineText(outline.join("\n"));})}>确认并创建结构草稿</button></section>}
      <button onClick={()=>void run(async()=>{if(outline.length>12||outline.some(t=>t.length>40))throw new Error("大纲最多 12 页，每页标题不超过 40 字。");await persist({...draft,outline});setOutlineText(outline.join("\n"));})}>保存需求与大纲</button>
    </>:<>
      <StudioBriefSummary brief={draft.brief} onDirty={setBriefDirty} disabled={busy||contentUnsaved||!!proposal||!!pendingJob||!!agentInstruction.trim()} onSave={async brief=>{
        setBusy(true);
        try{await persist({...draft,brief});}finally{setBusy(false);}
      }}/>
      {briefDirty&&<p role="status">需求有未保存修改，请先保存或取消，再继续编辑页面。</p>}
      <fieldset disabled={briefDirty} className="studio-editor-fields">
      <StudioCanvasPreview source={current.source} previewSource={proposal?applyProposal(current,proposal):current.source} selectedId={target} disabled={busy||unsaved||!!agentInstruction.trim()} onSelect={id=>{if(unsaved||busy)return;setTarget(id);setReplacement(targets.find(t=>t.id===id)?.text||"");setProposal(null);}}/>
      <button disabled={unsaved||!!proposal||!!pendingJob||!!agentInstruction.trim()} onClick={()=>setObjectMode(true)}>在 Studio 中编辑排版与对象</button>
      <p className="studio-version-label">当前第 {draft.versions.length} 版 · {current.label}</p>
      <section className="studio-edit-section"><h3>局部修改</h3><p>选择一处文字，预览前后差异后再应用。其他内容保持原样。</p>
        <label>修改位置<select value={target} onChange={e=>{if(unsaved){setError("请先确认或取消当前文字修改，再切换修改位置。");return;}setTarget(e.target.value);setReplacement(targets.find(t=>t.id===e.target.value)?.text||"");setProposal(null);}}><option value="">选择一处文字</option>{targets.map((t,i)=><option key={t.id} value={t.id}>{i+1}. {t.text.slice(0,65)}</option>)}</select></label>
        {agentEnabled&&<section aria-label="AI 局部修改"><label>希望如何修改？<textarea maxLength={2000} value={agentInstruction} onChange={e=>{setAgentInstruction(e.target.value);setAgentNotice("");}} placeholder="例如：标题更清晰，保留原意"/></label>
          <p>生成时会上传当前作品用于校验与恢复，并向火山方舟发送选中文字和修改要求。候选确认后才应用，本地草稿仍保存在当前浏览器。</p>
          <button disabled={!target||!agentInstruction.trim()||unsaved||!!proposal||!!pendingJob} onClick={()=>void run(async()=>{
            const controller=new AbortController();agentAbort.current=controller;setJobStarting(true);setAgentNotice("正在创建生成任务…");
            try {
              const id=crypto.randomUUID();
              try{rememberJob(id);}catch{throw new Error("无法保存任务恢复记录，未启动生成。");}
              const job=await agentJobRequest('start',{id,version:current,targetId:target,instruction:agentInstruction});
              if(job.id!==id)throw new Error("生成任务标识不一致。");
              setJobStarting(false);
              setAgentNotice("正在生成。页面刷新后可恢复查询。");
              await receiveJob(job.id,controller);
            } catch(e) { if(controller.signal.aborted){setAgentNotice("已停止等待，作品未修改。修改要求已保留。");return;}throw e; } finally {agentAbort.current=null;setJobStarting(false);}
          })}>生成 AI 修改候选</button>{agentInstruction&&<button onClick={()=>{setAgentInstruction("");setAgentNotice("");}}>清空修改要求</button>}</section>}
        <label>替换内容<textarea maxLength={3000} rows={4} value={replacement} onChange={e=>{setReplacement(e.target.value);setProposal(null);}}/></label>
        <button onClick={()=>{try{setProposal(proposeText(current,target,replacement));setError("");}catch(e){setError(errorText(e));}}}>预览修改</button>
        {unsaved&&!proposal&&<button onClick={()=>{setReplacement(targets.find(t=>t.id===target)?.text||"");setError("");}}>取消未确认文字</button>}
        {proposal&&<div className="studio-diff"><h4>原文</h4><p>{proposal.before}</p><h4>修改后</h4><p>{proposal.after}</p><button onClick={()=>void run(async()=>{await append(applyProposal(current,proposal),"局部文字修改");try{forgetJob();}catch{onStorageNotice("作品版本已保存，但本机生成记录未能清理。重新打开任务后可能仍显示恢复入口；请放弃该记录后重试清理，不必再次应用修改。");}})}>确认应用这一处</button><button onClick={()=>{try{if(pendingJob)forgetJob();setProposal(null);setReplacement(targets.find(t=>t.id===target)?.text||"");setAgentNotice("");}catch{setError("无法清理本机生成记录，候选已保留，请重试取消修改。");}}}>取消修改</button></div>}
      </section>
      <details><summary>草稿版本</summary>{draft.versions.map((v,i)=><p key={v.id}>第 {i+1} 版 · {v.label} {v.id!==current.id&&<button onClick={()=>void run(async()=>{if(unsaved||agentInstruction.trim())throw new Error("请先确认或取消当前文字修改，并处理或清空 AI 修改要求，再恢复版本。");await append(v.source,`恢复第 ${i+1} 版`);})}>恢复为新版本</button>}</p>)}</details>
      <div className="studio-delivery"><button className="primary" onClick={()=>void run(async()=>{if(unsaved||agentInstruction.trim())throw new Error("请先确认或取消当前文字修改，并处理或清空 AI 修改要求，再转入 Docs。");const result=await onCreate([{name:`${draft.brief.title}.html`,source:current.source,label:"Studio 结构草稿"}]);if(result.ok)onClose();else throw new Error("未转入 Docs，Studio 草稿仍保留。请处理文档提示后重试。");})}>创建 Docs 编辑副本</button>
      <p>创建独立副本，继续排版与导出。已有文档保持原样。</p></div>
      </fieldset>
    </>}
    </fieldset>
  </>;
}
