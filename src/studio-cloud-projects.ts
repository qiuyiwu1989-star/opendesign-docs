import type { RemoteProject, RemoteRevision } from './studio-remote-store';
export type CloudProjectSummary = { id: string; headRevision: string; createdAt: string; updatedAt: string; revisionCount: number };
export type CloudProjectPage = { projects: CloudProjectSummary[]; nextCursor: string | null };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const cursorValue = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(v);
const invalid = () => new Error('云端作品响应无效，请重新读取。');
export function validateCloudProjectPage(value: unknown, limit = 20, cursor?: string): CloudProjectPage {
  if (!object(value) || !Array.isArray(value.projects) || value.projects.length > limit || !(value.nextCursor === null || cursorValue(value.nextCursor)) || value.nextCursor === cursor || (value.nextCursor !== null && !value.projects.length)) throw invalid();
  const projects = value.projects.map(p => {
    if (!object(p) || !uuid(p.id) || !identifier(p.headRevision) || !date(p.createdAt) || !date(p.updatedAt) || !Number.isInteger(p.revisionCount) || (p.revisionCount as number) < 1 || (p.revisionCount as number) > 20) throw invalid();
    return { id: p.id, headRevision: p.headRevision, createdAt: p.createdAt, updatedAt: p.updatedAt, revisionCount: p.revisionCount as number };
  });
  if (new Set(projects.map(p => p.id)).size !== projects.length) throw invalid();
  return { projects, nextCursor: value.nextCursor };
}
export function validateCloudProject(value: unknown, id: string): RemoteProject {
  if (!object(value) || value.id !== id || !identifier(value.headRevision) || !Array.isArray(value.revisions) || !value.revisions.length || value.revisions.length > 20) throw invalid();
  const revisions: RemoteRevision[] = value.revisions.map(r => {
    if (!object(r) || !identifier(r.id) || !(r.parentId === null || identifier(r.parentId)) || typeof r.source !== 'string' || r.source.length > 200000 || typeof r.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(r.sourceHash) || !date(r.createdAt) || (r.acceptedJobId !== undefined && !uuid(r.acceptedJobId)) || (r.savedOperationId !== undefined && !uuid(r.savedOperationId))) throw invalid();
    return { id: r.id, parentId: r.parentId, source: r.source, sourceHash: r.sourceHash, createdAt: r.createdAt, ...(r.acceptedJobId ? { acceptedJobId: r.acceptedJobId as string } : {}), ...(r.savedOperationId ? { savedOperationId: r.savedOperationId as string } : {}) };
  });
  if (new Set(revisions.map(r => r.id)).size !== revisions.length || revisions.at(-1)!.id !== value.headRevision || revisions.some((r, i) => i > 0 && r.parentId !== revisions[i - 1]!.id)) throw invalid();
  return { id, headRevision: value.headRevision, revisions };
}
async function request(action: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(30000);
  const response = await fetch(`/api/studio-agent/projects/${action}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error(response.status === 404 ? '当前浏览器身份无法访问此云端作品。清除 Cookie 或身份到期可能导致访问失效。' : response.status === 400 ? '列表已失效，请刷新云端作品后重试。' : '暂时无法读取云端作品，请稍后重试。');
  return response.json();
}
export async function listCloudProjects(cursor?: string, signal?: AbortSignal): Promise<CloudProjectPage> {
  if (cursor !== undefined && !cursorValue(cursor)) throw invalid();
  return validateCloudProjectPage(await request('list', { limit: 20, ...(cursor ? { cursor } : {}) }, signal), 20, cursor);
}
export async function readCloudProject(id: string, signal?: AbortSignal): Promise<RemoteProject> {
  if (!uuid(id)) throw invalid();
  const result = await request('read', { projectId: id }, signal);
  if (!object(result)) throw invalid();
  return validateCloudProject(result.project, id);
}
