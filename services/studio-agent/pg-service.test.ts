import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { createStudioAgentServer } from './server';
import { PostgresJobQueue } from './pg-jobs';
import { withTestPostgres } from './pg-test-support';
import { inspectHtml } from '../../src/html';
import { buildCandidate } from './candidate';
async function listen(app: ReturnType<typeof createStudioAgentServer>) {
  await app.ready;
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
}
describe('PostgreSQL HTTP project and queue lifecycle', () => {
  it('retains queued work across API restart, accepts once, and isolates anonymous sessions', async () => withTestPostgres(async pool => {
    const state = await mkdtemp(join(tmpdir(), 'studio-pg-http-'));
    const execute = async (): Promise<never> => { throw new Error('API process must not execute queued jobs'); };
    let app = createStudioAgentServer({ stateDirectory: state, postgresPool: pool, execute });
    try {
      let url = await listen(app), cookie = '';
      const post = async (path: string, body: unknown, owner = true) => {
        const response = await fetch(`${url}/api/studio-agent${path}`, {method:'POST',headers:{Origin:url,'Content-Type':'application/json',...(owner && cookie ? {Cookie:cookie} : {})},body:JSON.stringify(body)});
        if (owner && response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]!;
        return response;
      };
      const health = await fetch(`${url}/health`); expect(health.status).toBe(200); expect(await health.json()).toEqual({ok:true});
      const source = '<h1>Original proposal</h1><p>Keep this evidence.</p>';
      const created = await post('/projects/create',{id:randomUUID(),source}); expect(created.status).toBe(201);
      const {project} = await created.json(); expect(cookie).toBeTruthy();
      const id = randomUUID(), targetId = inspectHtml(source).targets[0]!.id;
      const started = await post('/jobs/start',{id,projectId:project.id,baseRevision:project.headRevision,targetId,instruction:'Make the title clearer'});
      expect(started.status).toBe(202); expect((await started.json()).job.status).toBe('queued');
      await app.close();
      app = createStudioAgentServer({stateDirectory:state,postgresPool:pool,execute}); url = await listen(app);
      expect((await fetch(`${url}/health`)).status).toBe(200);
      const resumed = await post('/jobs/query',{id}); expect(resumed.status).toBe(200); expect((await resumed.json()).job.status).toBe('queued');
      expect((await post('/projects/read',{projectId:project.id},false)).status).toBe(404);
      expect((await post('/jobs/query',{id},false)).status).toBe(404);
      const queue = new PostgresJobQueue(pool), lease = await queue.claim(); expect(lease?.id).toBe(id);
      const candidate = buildCandidate({id:project.headRevision,source,label:'test'},targetId,'A clearer proposal');
      expect(await queue.complete(lease!,candidate)).toBe(true);
      expect((await(await post('/jobs/query',{id})).json()).job.candidate).toEqual(candidate);
      expect((await post('/projects/accept',{projectId:project.id,jobId:id},false)).status).toBe(404);
      const accepted = await post('/projects/accept',{projectId:project.id,jobId:id}); expect(accepted.status).toBe(200);
      const receipt = await accepted.json();
      const repeated = await post('/projects/accept',{projectId:project.id,jobId:id}); expect(repeated.status).toBe(200);
      expect((await repeated.json()).revision.id).toBe(receipt.revision.id);
      const read = await post('/projects/read',{projectId:project.id}); expect(read.status).toBe(200);
      const stored = (await read.json()).project;
      expect(stored.revisions).toHaveLength(2); expect(stored.headRevision).toBe(receipt.revision.id);
      expect(stored.revisions[1].source).toBe(source.replace('Original proposal','A clearer proposal'));
      expect(stored.revisions[0].source).toBe(source);
      expect((await post('/jobs/remove',{id})).status).toBe(200);
      const recovered=await post('/projects/accept',{projectId:project.id,jobId:id});
      expect(recovered.status).toBe(200);expect((await recovered.json()).revision.id).toBe(receipt.revision.id);
      expect((await post('/projects/accept',{projectId:project.id,jobId:id},false)).status).toBe(404);
    } finally { await app.close(); await rm(state,{recursive:true,force:true}); }
  }), 30000);
});
