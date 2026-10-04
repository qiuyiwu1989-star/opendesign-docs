import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ViteDevServer } from 'vite';
import { studioAgentJobsPlugin } from './jobs-plugin';
import { inspectHtml } from '../../src/html';
import { proposeText } from '../../src/studio-model';
const { run }=vi.hoisted(()=>({run:vi.fn()}));
vi.mock('./run',()=>({runTextEdit:run}));
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();jars.clear();});
async function withServer(test:(url:string)=>Promise<void>){
 const directory=await mkdtemp(join(tmpdir(),'studio-jobs-http-'));vi.stubEnv('STUDIO_AGENT_STATE_DIR',directory);vi.stubEnv('ARK_API_KEY','test-only');
 let handler!:(req:IncomingMessage,res:ServerResponse)=>void;
 const server=createServer((req,res)=>handler(req,res));
 const plugin=studioAgentJobsPlugin();
 const configure=plugin.configureServer as (server:ViteDevServer)=>void;
 configure({middlewares:{use:(_path:string,fn:typeof handler)=>{handler=fn;}},httpServer:server} as unknown as ViteDevServer);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await test(`http://127.0.0.1:${(server.address() as {port:number}).port}`);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await (plugin.closeBundle as ()=>Promise<void>)();await rm(directory,{recursive:true,force:true});}
}
const version={id:'v1',label:'test',source:'<h1>原文</h1>'};const targetId=inspectHtml(version.source).targets[0]!.id;
const jars = new Map<string,string>();
const post=async(url:string,path:string,body:unknown,origin=url,jar=url)=>{
 const response=await fetch(url+(path.startsWith('/projects/')?path:'/jobs'+path),{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(jars.has(jar)?{Cookie:jars.get(jar)!}:{})},body:JSON.stringify(body)});
 const cookie=response.headers.get('set-cookie');if(cookie)jars.set(jar,cookie.split(';')[0]!);
 return response;
};
describe('local job HTTP API',()=>{
 it('blocks cross-origin and unknown routes',async()=>withServer(async url=>{
  expect((await post(url,'/start',{},'https://other.example')).status).toBe(403);
  expect((await post(url,'/unknown',{})).status).toBe(404);expect(run).not.toHaveBeenCalled();
 }));
 it('guards list/remove and allows terminal cleanup without exposing content',async()=>withServer(async url=>{
  for(const route of ['/list','/remove']) expect((await post(url,route,{},'https://other.example')).status).toBe(403);
  expect((await post(url,'/remove',{id:'../outside'})).status).toBe(400);
  expect((await post(url,'/remove',{id:crypto.randomUUID()})).status).toBe(404);
  run.mockImplementation(()=>new Promise(()=>{}));
  const {job}=await (await post(url,'/start',{version,targetId,instruction:'PRIVATE'})).json();
  expect((await post(url,'/remove',{id:job.id})).status).toBe(409);
  const listing=await (await post(url,'/list',{})).json();
  expect(Object.keys(listing.jobs[0]).sort()).toEqual(['createdAt','id','status','updatedAt']);
  expect(JSON.stringify(listing)).not.toMatch(/原文|PRIVATE|candidate|requestHash|baseSource/);
  await post(url,'/cancel',{id:job.id});
  expect(await (await post(url,'/remove',{id:job.id})).json()).toEqual({removed:true});
  expect((await post(url,'/query',{id:job.id})).status).toBe(404);
  expect(await (await post(url,'/list',{})).json()).toEqual({jobs:[]});
 }));
 it('isolates two anonymous cookie jars and rejects forged ownership',async()=>withServer(async url=>{
  run.mockImplementation(()=>new Promise(()=>{}));
  const created=await post(url,'/start',{version,targetId,instruction:'改标题'},url,'alice');
  expect(created.headers.get('set-cookie')).toContain('HttpOnly');
  expect(created.headers.get('set-cookie')).toContain('SameSite=Strict');
  const {job}=await created.json();
  expect((await (await post(url,'/list',{},url,'alice')).json()).jobs).toHaveLength(1);
  expect((await (await post(url,'/list',{},url,'bob')).json()).jobs).toEqual([]);
  for(const route of ['/query','/cancel','/remove']) expect((await post(url,route,{id:job.id},url,'bob')).status).toBe(404);
  expect((await post(url,'/list',{owner:'alice'},url,'bob')).status).toBe(400);
  const aliceCookie=jars.get('alice')!;
  jars.set('forged',aliceCookie.slice(0,-1)+(aliceCookie.endsWith('0')?'1':'0'));
  expect((await post(url,'/query',{id:job.id},url,'forged')).status).toBe(404);
  expect((await (await post(url,'/query',{id:job.id},url,'alice')).json()).job.status).toBe('running');
  await post(url,'/cancel',{id:job.id},url,'alice');
 }));
 it('keeps global model concurrency at one across sessions',async()=>withServer(async url=>{
  run.mockImplementation(()=>new Promise(()=>{}));
  const request={version,targetId,instruction:'改标题'};
  const {job:first}=await (await post(url,'/start',request,url,'first')).json();
  const {job:second}=await (await post(url,'/start',request,url,'second')).json();
  let state;
  for(let i=0;i<20;i++){state=await (await post(url,'/query',{id:second.id},url,'second')).json();if(state.job.status!=='running')break;}
  expect(state.job.status).toBe('failed');expect(run).toHaveBeenCalledTimes(1);
  await post(url,'/cancel',{id:first.id},url,'first');
 }));
 it('bounds session manager creation',async()=>withServer(async url=>{
  for(let i=0;i<32;i++)expect((await post(url,'/list',{},url,`session-${i}`)).status).toBe(200);
  expect((await post(url,'/list',{},url,'excess')).status).toBe(429);
  expect((await post(url,'/list',{},url,'session-0')).status).toBe(200);
 }));
 it('creates a job, retrieves candidate and never applies source',async()=>withServer(async url=>{
  run.mockResolvedValue(proposeText(version,targetId,'新标题'));
  const created=await post(url,'/start',{version,targetId,instruction:'改标题'});expect(created.status).toBe(202);
  const {job}=await created.json();let latest;
  for(let i=0;i<20;i++){latest=await (await post(url,'/query',{id:job.id})).json();if(latest.job.status!=='running')break;}
  expect(latest.job.status).toBe('candidate');expect(latest.job.candidate.after).toBe('新标题');expect(version.source).toContain('原文');
 }));
 it('cancels without applying a late result',async()=>withServer(async url=>{
  run.mockImplementation(()=>new Promise(()=>{}));
  const {job}=await (await post(url,'/start',{version,targetId,instruction:'改标题'})).json();
  const cancelled=await (await post(url,'/cancel',{id:job.id})).json();expect(cancelled.job.status).toBe('cancelled');
  expect((await (await post(url,'/query',{id:job.id})).json()).job.status).toBe('cancelled');
 }));
});

describe('project-bound job HTTP flow',()=>{
 async function create(url:string,jar=url){const response=await post(url,'/projects/create',{source:version.source},url,jar);expect(response.status).toBe(201);return (await response.json()).project;}
 async function candidate(url:string,project:{id:string;headRevision:string},id=crypto.randomUUID()){
  run.mockImplementation(async(request)=>proposeText(request.version,request.targetId,'项目新标题'));
  const request={id,projectId:project.id,baseRevision:project.headRevision,targetId,instruction:'改标题'};
  const response=await post(url,'/start',request);expect(response.status).toBe(202);
  let job=(await response.json()).job;
  for(let i=0;i<20&&job.status==='running';i++)job=(await (await post(url,'/query',{id})).json()).job;
  expect(job.status).toBe('candidate');return {job,request};
 }
 it('binds server-owned source, accepts once and replays after a later revision',async()=>withServer(async url=>{
  const project=await create(url);const {job,request}=await candidate(url,project);
  expect(job.binding.projectId).toBe(project.id);expect(job.binding.baseRevision).toBe(project.headRevision);
  expect(run.mock.calls[0]![0].version.source).toBe(version.source);
  const accepted=await post(url,'/projects/accept',{projectId:project.id,jobId:job.id});expect(accepted.status).toBe(200);
  const {revision}=await accepted.json();expect(revision.source).toBe('<h1>项目新标题</h1>');
  expect((await post(url,'/projects/save',{projectId:project.id,expectedRevision:revision.id,source:'<h1>手动修改</h1>'})).status).toBe(200);
  expect((await (await post(url,'/projects/accept',{projectId:project.id,jobId:job.id})).json()).revision).toEqual(revision);
  expect((await post(url,'/start',request)).status).toBe(202);expect(run).toHaveBeenCalledTimes(1);
  const loaded=(await (await post(url,'/projects/read',{projectId:project.id})).json()).project;
  expect(loaded.revisions).toHaveLength(3);expect(loaded.revisions.at(-1).source).toBe('<h1>手动修改</h1>');
 }));
 it('rejects stale acceptance and stale new generation without overwriting edits',async()=>withServer(async url=>{
  const project=await create(url);const {job,request}=await candidate(url,project);
  await post(url,'/projects/save',{projectId:project.id,expectedRevision:project.headRevision,source:'<h1>先保存的修改</h1>'});
  expect((await post(url,'/projects/accept',{projectId:project.id,jobId:job.id})).status).toBe(409);
  expect((await post(url,'/start',{...request,id:crypto.randomUUID()})).status).toBe(409);
  const loaded=(await (await post(url,'/projects/read',{projectId:project.id})).json()).project;
  expect(loaded.revisions).toHaveLength(2);expect(loaded.revisions.at(-1).source).toBe('<h1>先保存的修改</h1>');
 }));
 it('rejects other owners, cross-project jobs, client candidate/source/owner injection and legacy acceptance',async()=>withServer(async url=>{
  const project=await create(url);const {job,request}=await candidate(url,project);const other=await create(url);
  for(const [route,body] of [
   ['/projects/read',{projectId:project.id}],
   ['/projects/save',{projectId:project.id,expectedRevision:project.headRevision,source:'<h1>attack</h1>'}],
   ['/projects/accept',{projectId:project.id,jobId:job.id}],
   ['/start',request],
  ] as const)expect((await post(url,route,body,url,'other-owner')).status).toBe(404);
  expect((await post(url,'/projects/accept',{projectId:other.id,jobId:job.id})).status).toBe(404);
  expect((await post(url,'/projects/accept',{projectId:project.id,jobId:job.id,candidate:{after:'attack'}})).status).toBe(422);
  expect((await post(url,'/start',{...request,version})).status).toBe(422);
  expect((await post(url,'/projects/create',{source:version.source,owner:{kind:'user',id:'admin'}})).status).toBe(400);
  const legacy=(await (await post(url,'/start',{version,targetId,instruction:'legacy'})).json()).job;
  expect((await post(url,'/projects/accept',{projectId:project.id,jobId:legacy.id})).status).toBe(404);
 }));
});

describe('HTTP project retry identifiers',()=>{
 it('accepts client create/save ids, replays safely and rejects mutation or another owner',async()=>withServer(async url=>{
  const id=crypto.randomUUID(),operationId=crypto.randomUUID();
  const response=await post(url,'/projects/create',{id,source:version.source});expect(response.status).toBe(201);
  const {project}=await response.json();expect(project.id).toBe(id);
  const save={projectId:id,expectedRevision:project.headRevision,source:'<h1>Saved</h1>',operationId};
  const saved=await (await post(url,'/projects/save',save)).json();expect(saved.project.revisions).toHaveLength(2);
  const later=await (await post(url,'/projects/save',{projectId:id,expectedRevision:saved.project.headRevision,source:'<h1>Later</h1>'})).json();
  expect((await (await post(url,'/projects/save',save)).json()).project).toEqual(later.project);
  expect((await (await post(url,'/projects/create',{id,source:version.source})).json()).project).toEqual(later.project);
  expect((await post(url,'/projects/create',{id,source:'<h1>Other</h1>'})).status).toBe(422);
  expect((await post(url,'/projects/create',{id,source:version.source},url,'other-owner')).status).toBe(404);
  expect((await post(url,'/projects/save',{...save,source:'<p>Changed</p>'})).status).toBe(422);
  expect((await post(url,'/projects/save',{...save,operationId:crypto.randomUUID()})).status).toBe(409);
  expect((await post(url,'/projects/save',{...save,operationId:23})).status).toBe(422);
  expect((await post(url,'/projects/create',{id:23,source:version.source})).status).toBe(422);
  expect((await (await post(url,'/projects/read',{projectId:id})).json()).project.revisions).toHaveLength(3);
 }));
});
