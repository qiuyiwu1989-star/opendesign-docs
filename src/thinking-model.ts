export type Thought = { id:string; text:string; x:number; y:number };
export type CanvasContext = { boardId:string; revision:string; elements:unknown[]; selectedIds:string[]; instruction:string; capturedAt:string; pageId?:string; pageName?:string; workName?:string; scope?:string; requestId?:string; snapshot?:string };
export type CanvasProposal = { id:string; baseRevision:string; message:string; notes:Thought[] };
export function sceneRevision(elements:readonly {id:string;version:number;isDeleted:boolean}[]):string {
 return JSON.stringify(elements.map(e=>[e.id,e.version,e.isDeleted]));
}
export function validateProposal(value:unknown):CanvasProposal {
 const p=value as CanvasProposal;
 if(!p||typeof p.id!=='string'||p.id.length>100||typeof p.baseRevision!=='string'||p.baseRevision.length>200000||typeof p.message!=='string'||p.message.length>10000||!Array.isArray(p.notes)||p.notes.length>30)throw new Error('建议格式无效');
 for(const n of p.notes)if(!n||typeof n.id!=='string'||typeof n.text!=='string'||!n.text.trim()||n.text.length>3000||!Number.isFinite(n.x)||!Number.isFinite(n.y)||Math.abs(n.x)>100000||Math.abs(n.y)>100000)throw new Error('建议对象无效');
 return p;
}
export function assertProposalCurrent(p:CanvasProposal,revision:string){if(p.baseRevision!==revision)throw new Error('画布已变化，请重新发起讨论。旧建议未应用。');}
export function thoughtsHtml(texts:string[]):string {
 const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 if(!texts.length)throw new Error('请先选择含文字的对象。');
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>画布构思</title><style>body{font-family:sans-serif;max-width:900px;margin:64px auto;padding:24px;color:#202036}p{white-space:pre-wrap;font-size:24px;line-height:1.7}</style><h1>画布构思</h1>${texts.map(t=>`<p>${esc(t)}</p>`).join('')}</html>`;
}
