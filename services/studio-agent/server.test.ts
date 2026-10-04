import { mkdtemp,rm,writeFile,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe,it,expect } from 'vitest';
import { createWorkerExecutor } from './worker-executor';
import { createStudioAgentServer } from './server';
import { inspectHtml } from '../../src/html';
import { proposeText,type TextProposal } from '../../src/studio-model';
const version={id:'v1',label:'test',source:'<h1>Original</h1>'};
const targetId=inspectHtml(version.source).targets[0]!.id;
async function listen(app:ReturnType<typeof createStudioAgentServer>){
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 return `http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
}
describe('standalone local service lifecycle',()=>{
 it('serves health, guards requests, and restores session jobs after awaited close/restart',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'studio-server-'));let calls=0;
  let app=createStudioAgentServer({stateDirectory:directory,modelConfigured:()=>true,execute:async()=>{calls++;return proposeText(version,targetId,'Improved');}});
  try{
   let url=await listen(app);let cookie='';
   const post=async(path:string,body:unknown,origin=url)=>{
    const response=await fetch(`${url}/api/studio-agent${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
    const next=response.headers.get('set-cookie');if(next)cookie=next.split(';')[0]!;return response;
   };
   expect(await(await fetch(`${url}/health`)).json()).toEqual({ok:true});
   expect((await fetch(`${url}/unknown`)).status).toBe(404);
   expect((await post('/jobs/list',{},'https://other.example')).status).toBe(403);
   const started=await post('/jobs/start',{version,targetId,instruction:'Improve title'});expect(started.status).toBe(202);
   const {job}=await started.json();let current;
   for(let i=0;i<30;i++){current=await(await post('/jobs/query',{id:job.id})).json();if(current.job.status!=='running')break;}
   expect(current.job.status).toBe('candidate');expect(calls).toBe(1);
   await app.close();expect(app.server.listening).toBe(false);await app.close();
   app=createStudioAgentServer({stateDirectory:directory,modelConfigured:()=>true,execute:async()=>{throw new Error('must not execute');}});
   url=await listen(app);
   const restored=await(await post('/jobs/query',{id:job.id})).json();expect(restored.job.candidate.after).toBe('Improved');
   expect((await(await post('/jobs/list',{})).json()).jobs).toHaveLength(1);
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
 });
 it('rejects a second writer and reports unhealthy until its lock can be acquired',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'studio-server-lock-'));
  const first=createStudioAgentServer({stateDirectory:directory});await first.ready;
  const second=createStudioAgentServer({stateDirectory:directory});
  try{
   await expect(second.ready).rejects.toThrow();
   const url=await listen(second);
   expect((await fetch(`${url}/health`)).status).toBe(503);
   const response=await fetch(`${url}/api/studio-agent/jobs/list`,{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:'{}'});
   expect(response.status).toBe(503);
  }finally{await second.close();await first.close();await rm(directory,{recursive:true,force:true});}
 });
 it('awaited shutdown leaves no real worker child process',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'studio-server-child-'));
  const pidPath=join(directory,'child-pid');const workerPath=join(directory,'idle-worker.cjs');
  await writeFile(workerPath,`require('node:fs').writeFileSync(${JSON.stringify(pidPath)},String(process.pid));process.on('message',()=>{});setInterval(()=>{},1000);`);
  const app=createStudioAgentServer({stateDirectory:join(directory,'state'),modelConfigured:()=>true,execute:createWorkerExecutor({workerPath,killGraceMs:50})});
  try{
   const url=await listen(app);
   const response=await fetch(`${url}/api/studio-agent/jobs/start`,{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({version,targetId,instruction:'Improve'})});
   expect(response.status).toBe(202);await response.json();
   let pid=0;
   for(let i=0;i<100;i++){try{pid=Number(await readFile(pidPath,'utf8'));break;}catch{await new Promise(resolve=>setTimeout(resolve,10));}}
   expect(pid).toBeGreaterThan(0);await app.close();
   expect(()=>process.kill(pid,0)).toThrow();
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
 });
 it('awaited shutdown aborts active generation and persists interrupted status',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'studio-server-stop-'));let signal:AbortSignal|undefined;
  let app=createStudioAgentServer({stateDirectory:directory,modelConfigured:()=>true,execute:async(_request,next)=>{signal=next;return new Promise<TextProposal>((_resolve,reject)=>next.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));}});
  try{
   let url=await listen(app);
   const response=await fetch(`${url}/api/studio-agent/jobs/start`,{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({version,targetId,instruction:'Improve'})});
   const cookie=response.headers.get('set-cookie')!.split(';')[0]!;const {job}=await response.json();
   await app.close();expect(signal?.aborted).toBe(true);
   app=createStudioAgentServer({stateDirectory:directory,modelConfigured:()=>false});url=await listen(app);
   const restored=await fetch(`${url}/api/studio-agent/jobs/query`,{method:'POST',headers:{Origin:url,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({id:job.id})});
   expect((await restored.json()).job.status).toBe('interrupted');
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
 });
});

it('rejects unsafe public origins and public file storage before starting', () => {
  for (const publicOrigin of ['http://doc.example','https://user:pass@doc.example','https://doc.example/path','https://doc.example/','https://doc.example?x=1','https://doc.example#hash','not-a-url']) {
    expect(() => createStudioAgentServer({ publicOrigin })).toThrow('origin');
  }
  expect(() => createStudioAgentServer({ publicOrigin:'https://doc.example' })).toThrow('PostgreSQL');
});
