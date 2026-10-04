import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createStudioAgentService } from './http-service';
import type { Principal } from './access';
import { inspectHtml } from '../../src/html';
import type { Pool } from 'pg';
import { withTestPostgres } from './pg-test-support';
import { migrateStudioPostgres } from './pg-core';
import { localJobsDirectory } from './identity';

async function verifyIsolation(postgresPool?: Pool) {
  const root = await mkdtemp(join(tmpdir(), 'identity-http-'));
  let actor: Principal = { kind: 'anonymous', id: 'a'.repeat(64) };
  let fail = false;
  const service = createStudioAgentService({ ...(postgresPool ? { postgresPool } : {}), stateDirectory: root, modelConfigured: () => true,
    execute: async () => { throw new Error('synthetic executor'); } }, () => {
    if (fail) throw new Error('invalid verified session');
    return { principal: actor };
  });
  await service.ready;
  const server = createServer((req, res) => { void service.handle(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const post = async (path: string, body: unknown) => {
    const response = await fetch(base + path, { method: 'POST', headers: { origin: base, 'content-type': 'application/json', 'x-user-id': 'forged' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try {
    const created = await post('/projects/create', { source: '<html><body><h1>Hello</h1></body></html>' });
    expect(created.status).toBe(201);
    const project = created.body.project;
    const id = randomUUID();
    // Legacy jobs exercise the same owner namespace even without a project binding.
    expect((await post('/jobs/start', { id, version: { id: randomUUID(), source: '<p>Hello</p>', label: 'test' }, targetId: inspectHtml('<p>Hello</p>').targets[0]!.id, instruction: 'test' })).status).toBe(202);
    const originalJobs = await post('/jobs/list', {});
    expect(originalJobs.body.jobs).toHaveLength(1);
    actor = { kind: 'user', id: actor.id };
    expect((await post('/projects/list', {})).body.projects).toEqual([]);
    expect((await post('/jobs/list', {})).body.jobs).toEqual([]);
    for (const path of ['/projects/read', '/projects/save', '/projects/accept']) {
      const body = path.endsWith('/save') ? { projectId: project.id, expectedRevision: project.headRevision, source: '<p>changed</p>' }
        : path.endsWith('/accept') ? { projectId: project.id, jobId: id } : { projectId: project.id };
      expect((await post(path, body)).status).toBe(404);
    }
    expect((await post('/jobs/start', { projectId: project.id, baseRevision: project.headRevision, targetId: 'x', instruction: 'test' })).status).toBe(404);
    for (const path of ['/jobs/query', '/jobs/cancel', '/jobs/remove']) expect((await post(path, { id })).status).toBe(404);
    const userProject = await post('/projects/create', { source: '<p>User</p>' });
    expect(userProject.status).toBe(201);
    expect(userProject.body.project.owner).toEqual(actor);
    const userJobId = randomUUID();
    expect((await post('/jobs/start', { id: userJobId, projectId: userProject.body.project.id, baseRevision: userProject.body.project.headRevision, targetId: inspectHtml('<p>User</p>').targets[0]!.id, instruction: 'edit' })).status).toBe(202);
    expect((await post('/jobs/query', { id: userJobId })).status).toBe(200);
    actor = { kind: 'anonymous', id: actor.id };
    expect((await post('/jobs/query', { id: userJobId })).status).toBe(404);
    expect((await post('/projects/read', { projectId: project.id })).status).toBe(200);
    expect((await post('/projects/read', { projectId: userProject.body.project.id })).status).toBe(404);
    expect((await post('/jobs/list', {})).body.jobs.length).toBe(originalJobs.body.jobs.length);
    fail = true;
    expect((await post('/projects/list', {})).status).toBe(422);
  } finally {
    await service.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
}

it('isolates identical anonymous/user IDs across all local HTTP routes', () => verifyIsolation());
it('isolates identical anonymous/user IDs across all PostgreSQL HTTP routes', () => withTestPostgres(async pool => {
  await migrateStudioPostgres(pool);
  await verifyIsolation(pool);
}), 30000);

it('does not allow test identity injection outside test mode', () => {
  vi.stubEnv('NODE_ENV', 'production');
  try { expect(() => createStudioAgentService({}, () => ({ principal: { kind: 'user', id: 'injected' } }))).toThrow('test-only'); }
  finally { vi.unstubAllEnvs(); }
});

it('default resolver ignores client identity headers and keeps signed anonymous ownership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'identity-default-'));
  const service = createStudioAgentService({ stateDirectory: root });
  await service.ready;
  const server = createServer((req, res) => { void service.handle(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const response = await fetch(base + '/projects/create', { method: 'POST', headers: {
      origin: base, 'content-type': 'application/json', 'x-user-id': 'administrator',
      'x-forwarded-user': 'administrator', authorization: 'Bearer unverified',
    }, body: JSON.stringify({ source: '<p>Anonymous</p>' }) });
    expect(response.status).toBe(201);
    const { project } = await response.json();
    expect(project.owner.kind).toBe('anonymous');
    expect(project.owner.id).toMatch(/^[a-f0-9]{64}$/);
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    const read = await fetch(base + '/projects/read', { method: 'POST', headers: {
      origin: base, 'content-type': 'application/json', cookie, 'x-user-id': 'different-user',
    }, body: JSON.stringify({ projectId: project.id }) });
    expect(read.status).toBe(200);
    expect((await read.json()).project.owner).toEqual(project.owner);
  } finally {
    await service.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});


it('supports maximum-length user IDs with fixed-length namespaced job directories', async () => {
  const actor: Principal = { kind: 'user', id: 'u'.repeat(128) };
  const directory = localJobsDirectory('/state', actor);
  expect(directory).toEqual(localJobsDirectory('/state', actor));
  expect(directory[1]).toBe('users');
  expect(directory[2]).toMatch(/^[a-f0-9]{64}$/);
  const sameId = 'a'.repeat(64);
  expect(localJobsDirectory('/state', { kind: 'user', id: sameId }))
    .not.toEqual(localJobsDirectory('/state', { kind: 'anonymous', id: sameId }));
  const root = await mkdtemp(join(tmpdir(), 'identity-max-'));
  const service = createStudioAgentService({ stateDirectory: root }, () => ({ principal: actor }));
  await service.ready;
  const server = createServer((req, res) => { void service.handle(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const response = await fetch(base + '/jobs/list', { method: 'POST', headers: {
      origin: base, 'content-type': 'application/json',
    }, body: '{}' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jobs: [] });
  } finally {
    await service.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
