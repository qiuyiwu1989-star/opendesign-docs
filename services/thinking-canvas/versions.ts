import {mkdir,readdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {validateLibrary,type ThinkingWork} from '../../src/thinking-workspace';
import type {ThinkingVersion} from '../../src/thinking-versions';
const valid=(s:string)=>/^[a-zA-Z0-9-]{1,100}$/.test(s);
type Record={meta:ThinkingVersion;source:ThinkingWork;html?:string};
export async function saveVersion(root:string,workId:string,data:{source:ThinkingWork;parentId?:string;html?:string}):Promise<ThinkingVersion>{
 if(!valid(workId)||data.source?.id!==workId)throw Error('Invalid work');
 validateLibrary({version:2,activeWork:workId,works:[data.source]});
 const dir=join(root,workId);await mkdir(dir,{recursive:true});
 if(data.parentId){if(!valid(data.parentId))throw Error('Invalid parent');const parent=JSON.parse(await readFile(join(dir,data.parentId+'.json'),'utf8')) as Record;if(parent.meta.parentId)throw Error('Parent must be original');if(typeof data.html!=='string'||!data.html.startsWith('<!doctype html>'))throw Error('Missing HTML');if(parent.source.pages.map(p=>p.id).join()!==data.source.pages.map(p=>p.id).join())throw Error('Page order changed');}
 else if(data.html)throw Error('Original cannot have HTML');
 const meta:ThinkingVersion={id:randomUUID(),workId,parentId:data.parentId??null,title:data.parentId?'保持原意版':'原稿快照',createdAt:new Date().toISOString(),pageCount:data.source.pages.length,changes:data.parentId?['保留全部页面及原有顺序','保留原文、原图与对象位置；修复图中文字的换行标记','增加逐页播放、总览与打印；未增加论点或案例']:['生成时的完整原稿，包含图片、对象与讨论记录']};
 const record:Record={meta,source:data.source,...(data.html?{html:data.html}:{})};const tmp=join(dir,meta.id+'.tmp');await writeFile(tmp,JSON.stringify(record),{flag:'wx',mode:0o600});await rename(tmp,join(dir,meta.id+'.json'));return meta;
}
export async function versionRoute(root:string,req:IncomingMessage,res:ServerResponse,url:URL,id:string){
 const reply=(code:number,value:unknown)=>{res.statusCode=code;res.end(JSON.stringify(value));};
 if(!valid(id))return reply(400,{error:'Invalid work'});
 try{
 if(req.method==='POST'){if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON required'});let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>120_000_000)return reply(413,{error:'Version too large'});}return reply(201,await saveVersion(root,id,JSON.parse(raw)));}
 if(req.method!=='GET')return reply(405,{error:'Method not allowed'});
 const version=url.searchParams.get('version');const dir=join(root,id);
 if(!version){const names=await readdir(dir).catch(()=>[] as string[]);const rows=await Promise.all(names.filter(n=>n.endsWith('.json')).map(async n=>(JSON.parse(await readFile(join(dir,n),'utf8')) as Record).meta));return reply(200,rows.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));}
 if(!valid(version))return reply(400,{error:'Invalid version'});const record=JSON.parse(await readFile(join(dir,version+'.json'),'utf8')) as Record;
 if(url.searchParams.get('format')==='source'){res.setHeader('Content-Disposition','attachment; filename="canvas-version.json"');return reply(200,{version:2,activeWork:id,works:[record.source]});}
 if(url.searchParams.get('format')==='html'&&record.html){res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"sandbox allow-scripts allow-modals; default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'self'");res.end(record.html);return;}
 return reply(200,record.meta);
 }catch{return reply(400,{error:'Version unavailable or invalid'});}
}
