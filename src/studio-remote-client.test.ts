import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as store from './studio-remote-store';
import type { RemoteProject, RemoteRevision } from './studio-remote-store';
import { createRemote, resumeRemote, acceptRemote, saveRemote, RemoteSyncError } from './studio-remote-client';
import { inspectHtml } from './html';
import { applyProposal, proposeText } from './studio-model';
const source = '<h1>原始标题</h1><p>保留正文</p>';
const revision = (text: string, parentId: string | null = null): RemoteRevision => ({ id: crypto.randomUUID(), parentId, source: text, sourceHash: createHash('sha256').update(text).digest('hex'), createdAt: new Date().toISOString() });
const project = (id = crypto.randomUUID()): RemoteProject => { const first = revision(source); return { id, headRevision: first.id, revisions: [first] }; };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const body = (init?: RequestInit) => JSON.parse(init?.body as string);
async function seed(withCandidate = false) {
  const taskId = crypto.randomUUID(), p = project(), head = p.revisions[0]!;
  const proposal = proposeText({ ...head, label: '' }, inspectHtml(source).targets[0]!.id, '清晰的新标题');
  const candidate = withCandidate ? { jobId: crypto.randomUUID(), proposal } : null;
  const record = await store.saveRemoteRecord({ taskId, projectId: p.id, project: p, pending: null, candidate }, 0);
  return { taskId, p, head, candidate, record };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('remote client with real IndexedDB operation journal', () => {
  it('persists a pending create before sending any network request', async () => {
    const taskId = crypto.randomUUID();
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const sent = body(init), persisted = await store.readRemoteRecord(taskId);
      expect(persisted?.pending).toEqual({ kind: 'create', id: sent.id, source });
      expect(persisted?.projectId).toBe(sent.id);
      return json({ project: project(sent.id) });
    }); vi.stubGlobal('fetch', fetch);
    const result = await createRemote(taskId, source);
    expect(fetch).toHaveBeenCalledTimes(1); expect(result.pending).toBeNull(); expect(result.project?.revisions[0]?.source).toBe(source);
  });
  it('does not send a request when the initial journal write fails', async () => {
    const taskId = crypto.randomUUID(), fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    vi.spyOn(store, 'saveRemoteRecord').mockRejectedValueOnce(new Error('Disk full'));
    await expect(createRemote(taskId, source)).rejects.toThrow('Disk full');
    expect(fetch).not.toHaveBeenCalled(); expect(await store.readRemoteRecord(taskId)).toBeNull();
  });
  it('recovers a lost create response using the same preallocated project id', async () => {
    const taskId = crypto.randomUUID(); let created: RemoteProject | undefined;
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const sent = body(init);
      if (!created) { created = project(sent.id); throw new TypeError('Response lost after server write'); }
      expect(sent.id).toBe(created.id); return json({ project: created });
    }); vi.stubGlobal('fetch', fetch);
    await expect(createRemote(taskId, source)).rejects.toThrow('Response lost');
    const pending = await store.readRemoteRecord(taskId); expect(pending?.pending?.kind).toBe('create');
    const recovered = await resumeRemote(taskId);
    expect(recovered.project).toEqual(created); expect(recovered.pending).toBeNull(); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('retains acceptance when follow-up read fails and replays the same job id', async () => {
    const { taskId, p, head, candidate } = await seed(true);
    const accepted = { ...revision(applyProposal({ ...head, label: '' }, candidate!.proposal), head.id), acceptedJobId: candidate!.jobId };
    const next = { ...p, headRevision: accepted.id, revisions: [...p.revisions, accepted] };
    let reads = 0; const acceptedIds: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/accept')) {
        expect((await store.readRemoteRecord(taskId))?.pending?.kind).toBe('accept');
        acceptedIds.push(body(init).jobId); return json({ projectId: p.id, revision: accepted });
      }
      if (++reads === 1) throw new TypeError('Read disconnected');
      return json({ project: next });
    }));
    await expect(acceptRemote(taskId)).rejects.toThrow('Read disconnected');
    const stalled = await store.readRemoteRecord(taskId); expect(stalled?.pending?.kind).toBe('accept'); expect(stalled?.project).toEqual(p);
    const recovered = await resumeRemote(taskId);
    expect(acceptedIds).toEqual([candidate!.jobId, candidate!.jobId]); expect(recovered.project).toEqual(next); expect(recovered.pending).toBeNull(); expect(recovered.candidate).toBeNull();
  });
  it('retains pending after server success when local cache commit fails', async () => {
    const { taskId, p, head } = await seed(); let next: RemoteProject | undefined;
    const originalSave = store.saveRemoteRecord;
    vi.spyOn(store, 'saveRemoteRecord').mockImplementation(async (value, expected) => {
      if (value.pending === null) throw new Error('Cache write failed');
      return originalSave(value, expected);
    });
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      const sent = body(init);
      next = next ?? { ...p, revisions: [...p.revisions, { ...revision(sent.source, head.id), savedOperationId: sent.operationId }], headRevision: '' };
      next.headRevision = next.revisions.at(-1)!.id; return json({ project: next });
    }));
    await expect(saveRemote(taskId, '<h1>Saved</h1>')).rejects.toBeInstanceOf(RemoteSyncError);
    const stalled = await store.readRemoteRecord(taskId); expect(stalled?.pending?.kind).toBe('save'); expect(stalled?.project).toEqual(p);
    vi.mocked(store.saveRemoteRecord).mockRestore();
    expect((await resumeRemote(taskId)).project).toEqual(next); expect((await store.readRemoteRecord(taskId))?.pending).toBeNull();
  });
  it('clears a confirmed 409 operation while preserving cached source and candidate', async () => {
    const { taskId, p, candidate } = await seed(true);
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Conflict' }, 409)));
    await expect(acceptRemote(taskId)).rejects.toMatchObject({ status: 409 });
    const after = await store.readRemoteRecord(taskId);
    expect(after?.pending).toBeNull(); expect(after?.project).toEqual(p); expect(after?.candidate).toEqual(candidate);
  });
  it('reuses operation id and base revision when retrying a lost save response', async () => {
    const { taskId, p, head } = await seed(); const requests: Record<string, string>[] = []; let saved: RemoteProject;
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      const sent = body(init); requests.push(sent);
      const pending = (await store.readRemoteRecord(taskId))?.pending;
      expect(pending?.kind).toBe('save'); expect(pending?.id).toBe(sent.operationId);
      if (requests.length === 1) {
        const accepted = { ...revision(sent.source, head.id), savedOperationId: sent.operationId };
        saved = { ...p, headRevision: accepted.id, revisions: [...p.revisions, accepted] };
        throw new TypeError('Save response lost');
      }
      return json({ project: saved });
    }));
    await expect(saveRemote(taskId, '<h1>手动保存</h1>')).rejects.toThrow('Save response lost');
    const recovered = await resumeRemote(taskId);
    expect(requests[0]).toEqual(requests[1]); expect(recovered.project?.revisions).toHaveLength(2); expect(recovered.pending).toBeNull();
  });
});

it('rejects save and accept at twenty revisions without journaling or network calls', async () => {
  const taskId = crypto.randomUUID(), p = project();
  for (let index = 1; index < 20; index++) {
    const next = revision(`<h1>第 ${index + 1} 版</h1><p>保留正文</p>`, p.headRevision);
    p.revisions.push(next); p.headRevision = next.id;
  }
  const initial = await store.saveRemoteRecord({ taskId, projectId: p.id, project: p, pending: null, candidate: null }, 0);
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(saveRemote(taskId, '<h1>不能添加</h1>')).rejects.toThrow('20');
  expect(await store.readRemoteRecord(taskId)).toEqual(initial);
  const head = p.revisions.at(-1)!;
  const candidate = { jobId: crypto.randomUUID(), proposal: proposeText({ ...head, label: '' }, inspectHtml(head.source).targets[0]!.id, '候选标题') };
  const withCandidate = await store.saveRemoteRecord({ ...initial, candidate }, initial.revision);
  await expect(acceptRemote(taskId)).rejects.toThrow('20');
  expect(await store.readRemoteRecord(taskId)).toEqual(withCandidate);
  expect((await store.readRemoteRecord(taskId))?.pending).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
