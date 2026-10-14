import {validateBrief,type ProjectBrief} from './thinking-project';
import {pageBounds,type PageBounds} from './thinking-page-bounds';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';
export const WORKSPACE_KEY='opendesign-thinking-workspaces-v2';
export const LEGACY_KEY='opendesign-thinking-canvas-v1';
export type Scene={pageBounds?:PageBounds;elements:readonly ExcalidrawElement[];files:BinaryFiles;appState:{viewBackgroundColor:string}};
export type Discussion={id:string;question:string;reply?:string;createdAt:string};
export type ThinkingPage={id:string;name:string;scene:Scene;discussions:Discussion[]};
export type ThinkingWork={id:string;name:string;pages:ThinkingPage[];activePage:string;project?:ProjectBrief};
export type ThinkingLibrary={version:2;activeWork:string;works:ThinkingWork[]};
export const blankScene=():Scene=>({pageBounds:{x:0,y:0,width:1600,height:900},elements:[],files:{},appState:{viewBackgroundColor:'#ffffff'}});
export function createWork(name='未命名作品',scene=blankScene()):ThinkingWork{const page={id:crypto.randomUUID(),name:'总览',scene,discussions:[]};return{id:crypto.randomUUID(),name,pages:[page],activePage:page.id};}
export function validateLibrary(value:unknown):ThinkingLibrary{
 const x=value as ThinkingLibrary;
 if(!x||x.version!==2||!Array.isArray(x.works)||!x.works.length||x.works.length>40)throw Error('作品备份格式无效');
 const ids=new Set<string>();
 for(const w of x.works){if(!w||typeof w.id!=='string'||ids.has(w.id)||typeof w.name!=='string'||w.name.length>120||!Array.isArray(w.pages)||!w.pages.length||w.pages.length>100)throw Error('作品结构无效');ids.add(w.id);if(w.project&&!validateBrief(w.project))throw Error('项目流程数据无效');
 const pages=new Set<string>();for(const p of w.pages){if(!p||typeof p.id!=='string'||pages.has(p.id)||typeof p.name!=='string'||p.name.length>120||!p.scene||!Array.isArray(p.scene.elements)||!p.scene.files||typeof p.scene.files!=='object'||!p.scene.appState||typeof p.scene.appState.viewBackgroundColor!=='string'||!Array.isArray(p.discussions))throw Error('页面结构无效');pages.add(p.id);if(p.scene.pageBounds){const b=p.scene.pageBounds;if(![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0)throw Error('页面范围无效');}
 for(const e of p.scene.elements)if(!e||typeof e.id!=='string'||typeof e.type!=='string'||!Number.isFinite(e.x)||!Number.isFinite(e.y))throw Error('画布对象无效');
 for(const d of p.discussions)if(!d||typeof d.id!=='string'||typeof d.question!=='string'||typeof d.createdAt!=='string'||(d.reply!==undefined&&typeof d.reply!=='string'))throw Error('讨论记录无效');
 }if(!pages.has(w.activePage))throw Error('当前页面无效');}
 if(!ids.has(x.activeWork))throw Error('当前作品无效');return x;
}
export function loadLibrary(storage:Pick<Storage,'getItem'|'setItem'>):ThinkingLibrary{
 const raw=storage.getItem(WORKSPACE_KEY);if(raw){const library=validateLibrary(JSON.parse(raw));for(const w of library.works)for(const p of w.pages)p.scene.pageBounds=pageBounds(p.scene);return library;}
 const legacy=storage.getItem(LEGACY_KEY);let scene=blankScene();
 if(legacy){const old=JSON.parse(legacy);if(!Array.isArray(old.elements)||!old.files)throw Error('旧画布无法读取，原记录已保留，请先导出检查。');storage.setItem('opendesign-thinking-canvas-v1-migration-backup',legacy);scene={...scene,...old,pageBounds:pageBounds(old)};}
 const w=createWork(legacy?'我的画布':'未命名作品',scene);return validateLibrary({version:2,activeWork:w.id,works:[w]});
}
export function movePage(work:ThinkingWork,id:string,to:number):ThinkingWork{const pages=[...work.pages],from=pages.findIndex(p=>p.id===id);if(from<0)return work;const [page]=pages.splice(from,1);pages.splice(Math.max(0,Math.min(to,pages.length)),0,page!);return{...work,pages};}
export function duplicatePage(work:ThinkingWork,id:string):ThinkingWork{const i=work.pages.findIndex(p=>p.id===id);if(i<0)return work;const page=structuredClone(work.pages[i]!);page.id=crypto.randomUUID();page.name=(page.name+' 副本').slice(0,120);page.discussions=[];const pages=[...work.pages];pages.splice(i+1,0,page);return{...work,pages,activePage:page.id};}
export function restoreCopy(library:ThinkingLibrary,raw:string):ThinkingLibrary{if(raw.length>120000000)throw Error('备份过大');const imported=validateLibrary(JSON.parse(raw));const works=imported.works.map(w=>{const copy=structuredClone(w);copy.id=crypto.randomUUID();copy.name=(copy.name+'（恢复副本）').slice(0,120);return copy;});return validateLibrary({...library,works:[...library.works,...works],activeWork:works[0]!.id});}

export function insertPageAfter(work:ThinkingWork,afterId=work.activePage):ThinkingWork { if(work.pages.length>=100)return work; const page:ThinkingPage={id:crypto.randomUUID(),name:`第 ${work.pages.length+1} 页`,scene:blankScene(),discussions:[]};const index=work.pages.findIndex(p=>p.id===afterId);const pages=[...work.pages];pages.splice(index<0?pages.length:index+1,0,page);return {...work,pages,activePage:page.id};}
