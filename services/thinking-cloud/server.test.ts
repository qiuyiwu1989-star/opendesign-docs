import {describe,it,expect} from 'vitest';
import {mkdtemp,rm,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import type {Server} from 'node:http';
import {createCloudServer,hashPassword} from './server';
import {createWork} from '../../src/thinking-workspace';
const origin='https://canvas.example';
async function start(dir:string){const server=await createCloudServer({origin,username:'owner',passwordHash:hashPassword('test-only-password'),dataDir:dir});server.listen(0,'127.0.0.1');await once(server,'listening');return{server,url:`http://127.0.0.1:${(server.address() as {port:number}).port}`};}
async function close(s:Server){await new Promise<void>((resolve,reject)=>s.close(e=>e?reject(e):resolve()));}
async function login(url:string){const response=await fetch(url+'/api/thinking-cloud/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username:'owner',password:'test-only-password'})});expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');expect(response.headers.get('set-cookie')).toContain('Secure');return response.headers.get('set-cookie')!.split(';')[0]!;}
describe('private cloud workspace',()=>{
 it('excludes another instance and process, releases after close',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'thinking-lock-'));let running:Server|undefined;
  try{
   ({server:running}=await start(dir));await expect(start(dir)).rejects.toThrow('占用');
   const moduleUrl=new URL('./server.ts',import.meta.url).href;
   const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',`import {createCloudServer,hashPassword} from ${JSON.stringify(moduleUrl)}; try { await createCloudServer({origin:'https://canvas.example',username:'owner',passwordHash:hashPassword('test-only-password'),dataDir:process.argv[1]});process.exit(2); } catch(e) { console.log(e.message);process.exit(e.message.includes('占用')?0:3); }`,dir],{stdio:['ignore','pipe','pipe']});
   const [code]=await once(child,'exit');expect(code).toBe(0);
   await close(running);running=undefined;
   ({server:running}=await start(dir));
  }finally{if(running)await close(running);await rm(dir,{recursive:true,force:true});}
 });

 it('refuses corrupt existing storage rather than treating it as empty',async()=>{const dir=await mkdtemp(join(tmpdir(),'thinking-corrupt-'));try{await writeFile(join(dir,'workspace.json'),'{}');await expect(start(dir)).rejects.toThrow('Invalid persisted workspace');}finally{await rm(dir,{recursive:true,force:true});}});
 it('requires authentication, exact origin, and invalidates logout sessions',async()=>{const dir=await mkdtemp(join(tmpdir(),'thinking-auth-'));const {server,url}=await start(dir);try{
  expect((await fetch(url+'/api/thinking-cloud/workspace')).status).toBe(401);
  expect((await fetch(url+'/api/thinking-canvas/versions?board=private')).status).toBe(401);
  const cookie=await login(url);
  expect((await fetch(url+'/api/thinking-cloud/workspace',{method:'PUT',headers:{cookie,origin:'https://evil.example','content-type':'application/json'},body:'{}'})).status).toBe(403);
  expect((await fetch(url+'/api/thinking-cloud/workspace',{headers:{cookie:'__Host-thinking_session=forged'}})).status).toBe(401);
  expect((await fetch(url+'/api/thinking-cloud/logout',{method:'POST',headers:{cookie,origin}})).status).toBe(200);
  expect((await fetch(url+'/api/thinking-cloud/workspace',{headers:{cookie}})).status).toBe(401);
 }finally{await close(server);await rm(dir,{recursive:true,force:true});}});
 it('CAS rejects concurrent stale writers and retains persisted history across restart',async()=>{const dir=await mkdtemp(join(tmpdir(),'thinking-cas-'));let {server,url}=await start(dir);try{
  const cookie=await login(url);const work=createWork();const library={version:2,activeWork:work.id,works:[work]};
  const put=(expectedRevision:string|null)=>fetch(url+'/api/thinking-cloud/workspace',{method:'PUT',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({expectedRevision,library})});
  const responses=await Promise.all([put(null),put(null)]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);const initial=await responses.find(r=>r.status===200)!.json();
  expect((await put(initial.revision)).status).toBe(200);expect(await readdir(join(dir,'history'))).toHaveLength(2);
  await close(server);({server,url}=await start(dir));
  expect((await fetch(url+'/api/thinking-cloud/workspace',{headers:{cookie}})).status).toBe(401);
  const fresh=await login(url);const stored=await (await fetch(url+'/api/thinking-cloud/workspace',{headers:{cookie:fresh}})).json();expect(stored.library).toEqual(library);expect(stored.revision).not.toBe(initial.revision);
 }finally{await close(server);await rm(dir,{recursive:true,force:true});}});
 it('throttles repeated invalid authentication',async()=>{const dir=await mkdtemp(join(tmpdir(),'thinking-rate-'));const {server,url}=await start(dir);try{for(let i=0;i<10;i++)expect((await fetch(url+'/api/thinking-cloud/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username:'owner',password:'wrong'})})).status).toBe(401);expect((await fetch(url+'/api/thinking-cloud/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).status).toBe(429);}finally{await close(server);await rm(dir,{recursive:true,force:true});}});
});
