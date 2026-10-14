import {useState} from 'react';
import type {ThinkingWork} from './thinking-workspace';
import {ThinkingPreview} from './ThinkingPreview';
export function ThinkingProjects({works,onOpen,onNew,onClose}:{works:ThinkingWork[];onOpen:(id:string)=>void;onNew:(name:string)=>void;onClose:()=>void}){
 const [name,setName]=useState(''),[creating,setCreating]=useState(false);
 return <div className="thinking-projects" role="dialog" aria-label="我的项目"><header><button onClick={onClose}>← 我的 Docs</button><h1>我的项目</h1><button onClick={()=>setCreating(!creating)}>新建项目</button></header><p>把想法、提纲和文档放在同一个项目里，继续上次的创作。</p>{creating&&<form onSubmit={e=>{e.preventDefault();if(name.trim()){onNew(name.trim());setName('');setCreating(false);}}}><label>项目名称<input autoFocus maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="这次想完成什么？"/></label><button disabled={!name.trim()||works.length>=40}>创建项目</button><button type="button" onClick={()=>setCreating(false)}>取消</button></form>}<div className="thinking-project-grid">{works.map(w=><button key={w.id} onClick={()=>onOpen(w.id)}><ThinkingPreview scene={w.pages[0]!.scene} label={w.name}/><strong>{w.name}</strong><span>{w.pages.length} 页画布 · {w.project?.outlineConfirmedAt?'提纲已确认':w.project?.intentConfirmedAt?'提纲待确认':'意图待对齐'}</span></button>)}</div></div>;
}
