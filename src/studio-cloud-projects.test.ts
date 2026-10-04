import { afterEach, describe, expect, it, vi } from 'vitest';
import { listCloudProjects, readCloudProject, validateCloudProject, validateCloudProjectPage } from './studio-cloud-projects';
const id = '00000000-0000-4000-8000-000000000001';
const summary = { id, headRevision: 'r1', createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z', revisionCount: 1 };
const project = { id, headRevision: 'r1', revisions: [{ id: 'r1', parentId: null, source: '<p>test</p>', sourceHash: 'a'.repeat(64), createdAt: summary.createdAt }] };
afterEach(() => vi.unstubAllGlobals());
describe('cloud project discovery boundaries', () => {
  it('accepts empty final page, strips extra metadata, rejects duplicate ids and stalled cursors', () => {
    expect(validateCloudProjectPage({ projects: [], nextCursor: null })).toEqual({ projects: [], nextCursor: null });
    expect(validateCloudProjectPage({ projects: [{ ...summary, owner: 'private' }], nextCursor: 'abc' }).projects).toEqual([summary]);
    for (const value of [{ projects: [summary, summary], nextCursor: null }, { projects: [], nextCursor: 'abc' }, { projects: [summary], nextCursor: 'abc' }, { projects: [{ ...summary, revisionCount: 0 }], nextCursor: null }, { projects: [{ ...summary, updatedAt: 'invalid' }], nextCursor: null }]) {
      expect(() => validateCloudProjectPage(value, 20, 'abc')).toThrow();
    }
    expect(() => validateCloudProjectPage({ projects: [summary], nextCursor: null }, 0)).toThrow();
  });
  it('validates source, version chain and identity before opening', () => {
    expect(validateCloudProject(project, id)).toEqual(project);
    for (const p of [{ ...project, id: 'other' }, { ...project, headRevision: 'missing' }, { ...project, revisions: [{ ...project.revisions[0], source: 10 }] }, { ...project, revisions: [project.revisions[0], { ...project.revisions[0], id: 'r2', parentId: 'wrong' }], headRevision: 'r2' }]) expect(() => validateCloudProject(p, id)).toThrow();
  });
  it('posts bounded opaque pagination requests with browser credentials', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ projects: [summary], nextCursor: 'abc' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ projects: [], nextCursor: null }) });
    vi.stubGlobal('fetch', fetcher);
    const page = await listCloudProjects();
    await listCloudProjects(page.nextCursor!);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/studio-agent/projects/list');
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', credentials: 'same-origin', body: JSON.stringify({ limit: 20, cursor: 'abc' }) });
    await expect(listCloudProjects('not a cursor')).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('fresh read failure never opens cached/listed content and does not echo server body', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ secret: 'do not echo' }) });
    vi.stubGlobal('fetch', fetcher);
    await expect(readCloudProject(id)).rejects.toThrow('当前浏览器身份无法访问');
    expect(fetcher.mock.calls[0]?.[1].body).toBe(JSON.stringify({ projectId: id }));
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ project: { ...project, id: 'different' } }) });
    await expect(readCloudProject(id)).rejects.toThrow('响应无效');
  });
  it('passes cancellation through, surfaces network/malformed failures without empty success', async () => {
    const controller = new AbortController(); controller.abort();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => { init.signal!.throwIfAborted(); return {} as Response; }));
    await expect(listCloudProjects(undefined, controller.signal)).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    await expect(listCloudProjects()).rejects.toThrow('network');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(listCloudProjects()).rejects.toThrow('响应无效');
  });
});
