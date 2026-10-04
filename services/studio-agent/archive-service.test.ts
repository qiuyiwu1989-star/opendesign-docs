import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { createStudioAgentServer } from './server';
import { withTestPostgres } from './pg-test-support';
import { exportLocalArchive } from './local-archive';
import { restorePostgresArchive, exportPostgresArchive } from './pg-archive';
import { buildCandidate } from './candidate';
import { inspectHtml } from '../../src/html';

async function listen(app: ReturnType<typeof createStudioAgentServer>) {
  await app.ready;
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
}
describe('private archive migration HTTP continuity', () => {
  it('preserves anonymous ownership, receipts and recoverable candidates across JSON and two PostgreSQL stores', async () => withTestPostgres(async pool => {
    const state = await mkdtemp(join(tmpdir(), 'studio-archive-http-'));
    let calls = 0;
    let app = createStudioAgentServer({stateDirectory:state,modelConfigured:()=>true,execute:async request => {
      calls++;
      return buildCandidate(request.version,request.targetId,request.instruction==='First edit'?'First accepted title':'Second recovered title');
    }});
    try {
      let url = await listen(app), cookie = '';
      const post = async (path:string,body:unknown,owner=true) => {
        const response = await fetch(`${url}/api/studio-agent${path}`,{method:'POST',headers:{Origin:url,'Content-Type':'application/json',...(owner&&cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
        if(owner&&response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0]!;
        return response;
      };
      const waitCandidate = async (id:string) => {
        for(let i=0;i<100;i++) {
          const response=await post('/jobs/query',{id});expect(response.status).toBe(200);
          const {job}=await response.json();if(job.status==='candidate')return job;
          expect(job.status).toBe('running');await new Promise(resolve=>setTimeout(resolve,5));
        }
        throw new Error('Candidate did not complete');
      };
      const source='<h1>Original title</h1><p>Preserved evidence.</p>';
      const created=await post('/projects/create',{id:randomUUID(),source});expect(created.status).toBe(201);
      const {project}=await created.json();const targetId=inspectHtml(source).targets[0]!.id;
      const first={id:randomUUID(),projectId:project.id,baseRevision:project.headRevision,targetId,instruction:'First edit'};
      expect((await post('/jobs/start',first)).status).toBe(202);await waitCandidate(first.id);
      const accepted=await post('/projects/accept',{projectId:project.id,jobId:first.id});expect(accepted.status).toBe(200);
      const firstReceipt=(await accepted.json()).revision;
      const before=(await(await post('/projects/read',{projectId:project.id})).json()).project;
      const second={id:randomUUID(),projectId:project.id,baseRevision:firstReceipt.id,targetId:inspectHtml(firstReceipt.source).targets[0]!.id,instruction:'Second edit'};
      expect((await post('/jobs/start',second)).status).toBe(202);
      const secondJob=await waitCandidate(second.id);expect(calls).toBe(2);
      await app.close();
      const exported=await exportLocalArchive(state);
      await restorePostgresArchive(pool,exported);
      app=createStudioAgentServer({stateDirectory:state,postgresPool:pool});url=await listen(app);
      expect((await fetch(`${url}/health`)).status).toBe(200);
      expect((await(await post('/projects/read',{projectId:project.id})).json()).project).toEqual(before);
      expect((await(await post('/jobs/query',{id:second.id})).json()).job.candidate).toEqual(secondJob.candidate);
      const retry=await post('/jobs/start',second);expect(retry.status).toBe(202);expect((await retry.json()).job.status).toBe('candidate');
      expect((await post('/jobs/start',{...second,instruction:'Changed request'})).status).not.toBe(202);
      const receipt2=await post('/projects/accept',{projectId:project.id,jobId:second.id});expect(receipt2.status).toBe(200);
      const revision2=(await receipt2.json()).revision;
      expect((await(await post('/projects/accept',{projectId:project.id,jobId:second.id})).json()).revision.id).toBe(revision2.id);
      expect((await(await post('/projects/accept',{projectId:project.id,jobId:first.id})).json()).revision.id).toBe(firstReceipt.id);
      const migrated=(await(await post('/projects/read',{projectId:project.id})).json()).project;
      expect(migrated.revisions).toHaveLength(3);expect(migrated.revisions.slice(0,2)).toEqual(before.revisions);
      expect(migrated.revisions[2].source).toBe(source.replace('Original title','Second recovered title'));
      expect((await post('/projects/read',{projectId:project.id},false)).status).toBe(404);
      expect((await post('/jobs/query',{id:second.id},false)).status).toBe(404);
      await app.close();
      const backup=await exportPostgresArchive(pool,exported.sessionKeyHash);
      await withTestPostgres(async restoredPool=>{
        await restorePostgresArchive(restoredPool,backup);
        app=createStudioAgentServer({stateDirectory:state,postgresPool:restoredPool});url=await listen(app);
        try {
          expect((await(await post('/projects/read',{projectId:project.id})).json()).project).toEqual(migrated);
          expect((await(await post('/jobs/query',{id:second.id})).json()).job.candidate).toEqual(secondJob.candidate);
          expect((await(await post('/projects/accept',{projectId:project.id,jobId:second.id})).json()).revision.id).toBe(revision2.id);
          expect((await post('/projects/read',{projectId:project.id},false)).status).toBe(404);
        } finally { await app.close(); }
      });
    } finally {await app.close();await rm(state,{recursive:true,force:true});}
  }),30000);
});
