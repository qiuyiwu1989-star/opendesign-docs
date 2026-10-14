import {createPortal} from 'react-dom';
import {useEffect,useRef,useState} from 'react';
import type {ThinkingLibrary} from './thinking-workspace';
import {CloudError,cloudSession,cloudLogin,cloudLogout,cloudRead,cloudWrite,downloadCloudBackup,type CloudSession,type CloudWorkspace} from './thinking-cloud';
import './thinking-cloud.css';

type Props={library:ThinkingLibrary;onLoad:(library:ThinkingLibrary)=>void|Promise<void>};
export function ThinkingCloud({library,onLoad}:Props){
 const [open,setOpen]=useState(false),[session,setSession]=useState<CloudSession|null>(null),[cloud,setCloud]=useState<CloudWorkspace|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[loadedRevision,setLoadedRevision]=useState<string|null>(null),[savedLibrary,setSavedLibrary]=useState<ThinkingLibrary|null>(null);
 const current=useRef(library),dialog=useRef<HTMLDialogElement>(null);current.current=library;
 const pending=!!savedLibrary&&savedLibrary!==library;
 useEffect(()=>{if(open){dialog.current?.showModal();}else dialog.current?.close();},[open]);
 async function run(task:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await task();}catch(e){setError(e instanceof Error?e.message:'操作失败，本地作品已保留。');if(e instanceof CloudError&&e.status===401){setSession({authenticated:false});setLoadedRevision(null);setSavedLibrary(null);}}finally{setBusy(false);}}
 async function show(){setOpen(true);await run(async()=>{const next=await cloudSession();setSession(next);if(next.authenticated)setCloud(await cloudRead());});}
 async function login(){await run(async()=>{const next=await cloudLogin(username.trim(),password);setPassword('');setSession(next);setLoadedRevision(null);setSavedLibrary(null);setCloud(await cloudRead());});}
 async function load(){await run(async()=>{const before=current.current;const next=await cloudRead();if(!next.library){setCloud(next);setNotice('云端还没有作品，可以保存这台电脑的作品。');return;}if(current.current!==before)throw Error('读取期间本地内容发生了变化。请停止编辑后再打开云端，当前作品已保留。');await onLoad(next.library);setCloud(next);setLoadedRevision(next.revision);setSavedLibrary(next.library);setNotice('已打开云端作品，原本地内容已备份。继续编辑后，请点击“保存到云端”。');});}
 async function save(){await run(async()=>{if(!cloud)throw Error('请先检查云端状态。');if(cloud.revision!==null&&!loadedRevision)throw Error('请先打开云端作品，之后才能保存修改。');const snapshot=current.current;const next=await cloudWrite(snapshot,loadedRevision);setCloud(next);setLoadedRevision(next.revision);setSavedLibrary(snapshot);setNotice(current.current===snapshot?'已保存到云端。另一台电脑登录同一账号后，点击“打开云端作品”即可继续。':'刚才的版本已保存；本地还有新的修改，请再次保存。');});}
 const canSave=session?.authenticated&&cloud&&(cloud.revision===null||loadedRevision!==null);
 return <><button type="button" onClick={()=>void show()} className="thinking-cloud-trigger">{loadedRevision?(pending?'云端 · 有未上传修改':'云端 · 已保存'):'云端保存'}</button>
 {createPortal(<dialog ref={dialog} className="thinking-cloud-dialog" onCancel={e=>{if(busy)e.preventDefault();else setOpen(false);}} onClose={()=>setOpen(false)}>
 <header><h2>在另一台电脑继续编辑</h2><button type="button" disabled={busy} aria-label="关闭云端保存" onClick={()=>setOpen(false)}>×</button></header>
 <p>登录同一个账号，保存和打开同一份作品。当前采用手动云端保存。</p>
 {!session?.authenticated?<form onSubmit={e=>{e.preventDefault();void login();}}><label>账号<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required disabled={busy}/></label><label>密码<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></label><button className="thinking-cloud-primary" disabled={busy||!username.trim()||!password}>登录</button></form>:<>
 <div className="thinking-cloud-account"><span>已登录：{session.username}</span><button disabled={busy} onClick={()=>void run(async()=>{await cloudLogout();setSession({authenticated:false});setCloud(null);setLoadedRevision(null);setSavedLibrary(null);setNotice('已退出登录，本地作品仍保留。');})}>退出登录</button></div>
 <div className="thinking-cloud-summary"><strong>{cloud?.library?`云端有 ${cloud.library.works.length} 个作品`:'云端尚无作品'}</strong>{cloud?.updatedAt&&<span>保存于 {new Date(cloud.updatedAt).toLocaleString()}</span>}<span>本机有 {library.works.length} 个作品 · {pending?'有未上传的修改':loadedRevision?'已连接云端版本':'尚未打开云端版本'}</span></div>
 {cloud?.library&&<><button disabled={busy} onClick={()=>void load()}>备份本地并打开云端作品</button><p className="thinking-cloud-hint">将切换到云端的全部作品。本机现有作品会先保留备份。</p></>}
 <button className="thinking-cloud-primary" disabled={busy||!canSave} onClick={()=>void save()}>{cloud?.revision===null?'首次保存本机全部作品到云端':'保存到云端'}</button>
 {!canSave&&cloud?.library&&<p className="thinking-cloud-hint">先打开云端作品，再继续编辑和保存，避免覆盖另一台电脑的内容。</p>}
 </>}
 {busy&&<p role="status">正在连接或保存，请稍候…</p>}{notice&&<p role="status" className="thinking-cloud-notice">{notice}</p>}{error&&<p role="alert" className="thinking-cloud-error">{error}</p>}
 <footer><button disabled={busy} onClick={()=>downloadCloudBackup(current.current)}>下载本机全部作品备份</button><small>云端保存包含画布、图片与讨论。独立的 Docs 文档暂不在此同步范围。</small></footer>
 </dialog>,document.body)}</>;
}
