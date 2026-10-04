import { inspectHtml } from '../../src/html';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect, vi } from 'vitest';
import { createStudioAgentServer } from './server';
import { withTestPostgres } from './pg-test-support';
vi.setConfig({testTimeout:30000});
it('accepts only explicit HTTPS same-origin proxy headers and allows over 32 PG identities', async()=>withTestPostgres(async pool=>{
 const root=await mkdtemp(join(tmpdir(),'studio-public-'));
 const origin='https://doc.example';
 const app=createStudioAgentServer({postgresPool:pool,stateDirectory:root,publicOrigin:origin});
 try{
  await app.ready;await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(app.server.address() as {port:number}).port}/api/studio-agent/jobs/list`;
  const post=(host:string,requestOrigin:string,extra:Record<string,string>={},route=url,payload:unknown={})=>new Promise<{status:number;cookie:string}>((resolve,reject)=>{const req=request(route,{method:'POST',headers:{Host:host,Origin:requestOrigin,'Content-Type':'application/json',...extra}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode!,cookie:res.headers['set-cookie']?.[0]??''}));});req.on('error',reject);req.end(JSON.stringify(payload));});
  for(const headers of [['doc.example','https://evil.example'],['evil.example',origin],['doc.example','http://doc.example']])expect((await post(headers[0]!,headers[1]!)).status).toBe(403);
  expect((await post('localhost',origin,{'X-Forwarded-Host':'doc.example','X-Forwarded-Proto':'https'})).status).toBe(403);
  for(let i=0;i<34;i++){
   const response=await post('doc.example',origin);expect(response.status).toBe(200);
   expect(response.cookie).toContain('; Secure');expect(response.cookie).toContain('HttpOnly; SameSite=Strict');
  }
 await pool.query("INSERT INTO studio_agent.daily_usage(day,owner_key,started) VALUES((clock_timestamp() AT TIME ZONE 'UTC')::date,'*',300)");
 const source='<h1>Original</h1>';
 expect((await post('doc.example',origin,{},url.replace('/jobs/list','/jobs/start'),{version:{id:'v1',source,label:''},targetId:inspectHtml(source).targets[0]!.id,instruction:'Improve'})).status).toBe(429);
 expect((await pool.query('SELECT count(*)::int AS n FROM studio_agent.jobs')).rows[0].n).toBe(0);
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
}));
