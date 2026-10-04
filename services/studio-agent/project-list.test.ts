import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { LocalProjectRepository } from './projects';
import { PostgresProjectRepository } from './pg-projects';
import { withTestPostgres } from './pg-test-support';
import { migrateStudioPostgres } from './pg-core';
import { createStudioAgentServer } from './server';
const owner = {kind:'user',id:'alice'} as const;
const stranger = {kind:'anonymous',id:'alice'} as const;
const ids = [1,2,3,4].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
async function checkRepository(repo: LocalProjectRepository | PostgresProjectRepository) {
  expect(await repo.list(owner)).toEqual({projects:[],nextCursor:null});
  await repo.create(owner,'<p>private source 3</p>',ids[2]);
  await repo.create(stranger,'<p>secret stranger</p>',ids[1]);
  const first = await repo.create(owner,'<p>private source 1</p>',ids[0]);
  await repo.create(owner,'<p>private source 4</p>',ids[3]);
  const page = await repo.list(owner,{limit:1});
  expect(page.projects.map(p=>p.id)).toEqual([ids[0]]);
  expect(Object.keys(page.projects[0]!).sort()).toEqual(['createdAt','headRevision','id','revisionCount','updatedAt']);
  expect(JSON.stringify(page)).not.toContain('private source');
  await repo.save(owner,first.id,first.headRevision,'<p>changed</p>');
  const remaining = await repo.list(owner,{limit:2,cursor:page.nextCursor!});
  expect(remaining.projects.map(p=>p.id)).toEqual([ids[2],ids[3]]);
  expect(remaining.nextCursor).toBeNull();
  expect((await repo.list(owner,{limit:1})).projects[0]!.revisionCount).toBe(2);
  expect((await repo.list(stranger)).projects.map(p=>p.id)).toEqual([ids[1]]);
  await expect(repo.list(stranger,{cursor:page.nextCursor!})).rejects.toThrow('游标');
  for(const input of [{limit:0},{limit:51},{limit:1.5},{limit:'2'},{cursor:''},{cursor:'garbage'},{cursor:'x'.repeat(257)},{owner:'alice'}]) {
    await expect(repo.list(owner,input as never)).rejects.toThrow();
  }
}
async function checkHttp(pool?:Pool) {
  const state=await mkdtemp(join(tmpdir(),'studio-list-http-'));
  const app=createStudioAgentServer({stateDirectory:state,...(pool?{postgresPool:pool}:{})});
  try {
    await app.ready;
    await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
    let cookie='';
    const post=async(path:string,body:unknown,session=true,requestOrigin=origin)=>{
      const res=await fetch(`${origin}/api/studio-agent${path}`,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json',...(session&&cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
      if(session&&res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie')!.split(';')[0]!;
      return res;
    };
    for(const id of ids.slice(0,2))expect((await post('/projects/create',{id,source:'<p>SECRET HTML</p>'})).status).toBe(201);
    const res=await post('/projects/list',{limit:1});expect(res.status).toBe(200);
    const page=await res.json();expect(page.projects.map((p:{id:string})=>p.id)).toEqual([ids[0]]);
    expect(JSON.stringify(page)).not.toContain('SECRET');
    const next=await post('/projects/list',{cursor:page.nextCursor});expect(next.status).toBe(200);
    expect((await next.json()).projects.map((p:{id:string})=>p.id)).toEqual([ids[1]]);
    expect(await(await post('/projects/list',{},false)).json()).toEqual({projects:[],nextCursor:null});
    expect((await post('/projects/list',{cursor:page.nextCursor},false)).status).toBe(422);
    expect((await post('/projects/list',{owner:'alice'})).status).toBe(400);
    expect((await post('/projects/list',{limit:51})).status).toBe(422);
    expect((await post('/projects/list',{},true,'https://foreign.invalid')).status).toBe(403);
  }finally{await app.close();await rm(state,{recursive:true,force:true});}
}
describe('owner-scoped project summary listing',()=>{
  it('JSON: deterministic keyset pagination, save stability, owner isolation and validation',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'studio-list-'));
    try{await checkRepository(new LocalProjectRepository(directory));}finally{await rm(directory,{recursive:true,force:true});}
  });
  it('real PostgreSQL: same list contract and owner isolation',async()=>withTestPostgres(async pool=>{
    await migrateStudioPostgres(pool);await checkRepository(new PostgresProjectRepository(pool));
  }),30000);
  it('JSON HTTP: session-scoped summaries and existing origin/field gates',async()=>checkHttp());
  it('real PostgreSQL HTTP: session-scoped summaries and existing origin/field gates',async()=>withTestPostgres(checkHttp),30000);
});
