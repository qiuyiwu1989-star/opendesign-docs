import type { Plugin } from 'vite';
import { validateProposal, type CanvasContext, type CanvasProposal } from '../../src/thinking-model';
/** Development-only bridge. Browser origin must match; CLI calls are loopback-only. */
export function thinkingCanvasPlugin():Plugin {
 const contexts=new Map<string,CanvasContext>(),proposals=new Map<string,CanvasProposal>();
 return {name:'thinking-canvas-local-bridge',apply:'serve',configureServer(server){
 server.middlewares.use('/api/thinking-canvas',(req,res)=>{void(async()=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const reply=(code:number,data:unknown)=>{res.statusCode=code;res.end(JSON.stringify(data));};
  const remote=req.socket.remoteAddress;
  if(!remote||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return reply(403,{error:'Local connections only'});
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return reply(403,{error:'Origin rejected'});
  const url=new URL(req.url??'/', 'http://localhost'); const id=url.searchParams.get('board');
  if(req.method==='GET'&&url.pathname==='/boards')return reply(200,[...contexts.values()].map(c=>({boardId:c.boardId,capturedAt:c.capturedAt,selectedCount:c.selectedIds.length})));
  if(!id||! /^[a-zA-Z0-9-]{1,100}$/.test(id))return reply(400,{error:'board required'});
  if(req.method==='GET'){const item=url.pathname==='/proposal'?proposals.get(id):contexts.get(id);return reply(item?200:404,item??{error:'No context yet'});}
  if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
  if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON required'});
  let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>5000000)return reply(413,{error:'Canvas too large'});}
  try {const data=JSON.parse(body);
   if(url.pathname==='/context'){
    if(data.boardId!==id||typeof data.revision!=='string'||!Array.isArray(data.elements)||!Array.isArray(data.selectedIds)||typeof data.instruction!=='string')return reply(400,{error:'Invalid context'});
    if(!contexts.has(id)&&contexts.size>=50)return reply(429,{error:'Too many boards'});
    contexts.set(id,data);return reply(200,{ok:true});
   }
   if(url.pathname==='/proposal'){
    const p=validateProposal(data);if(contexts.get(id)?.revision!==p.baseRevision)return reply(409,{error:'Canvas changed'});proposals.set(id,p);return reply(200,{ok:true});
   }
   if(url.pathname==='/dismiss'){proposals.delete(id);return reply(200,{ok:true});}
   return reply(404,{error:'Unknown endpoint'});
  }catch{return reply(400,{error:'Invalid request'});}
 })().catch(()=>{res.statusCode=500;res.end('{"error":"Bridge failed"}');});});}};
}
