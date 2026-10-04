import { createHash, randomUUID } from 'node:crypto';
import { mkdir, chmod, lstat, open, rename, unlink, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyProposal, type TextProposal } from '../../src/studio-model';
import { buildCandidate } from './candidate';
import { assertProjectAccess, StudioAccessError, type Principal } from './access';

export type ProjectRevision = Readonly<{ id: string; parentId: string | null; source: string; sourceHash: string; createdAt: string; acceptedJobId?: string; candidateHash?: string; savedOperationId?: string }>;
export type StoredProject = Readonly<{ id: string; owner: Principal; headRevision: string; revisions: readonly ProjectRevision[] }>;
export class ProjectRevisionConflict extends Error {
  constructor() { super('项目版本已变化，请重新读取后保存。'); this.name = 'ProjectRevisionConflict'; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const queues = new Map<string, Promise<unknown>>();
const hash = (source: string) => createHash('sha256').update(source, 'utf8').digest('hex');
const identifier = (id: unknown): string => { if (typeof id !== 'string' || !uuid.test(id)) throw new StudioAccessError(); return id; };
const checkSource = (source: unknown): string => {
  if (typeof source !== 'string' || !source.trim() || source.length > 200000) throw new Error('HTML 源码须为 1–200000 字符。');
  // Reject lone surrogates so the stored hash and source share an exact UTF-8 representation.
  if (Buffer.from(source, 'utf8').toString('utf8') !== source) throw new Error('HTML 源码不是有效的 Unicode。');
  return source;
};
function validateProject(value: unknown, id: string): StoredProject {
  if (!value || typeof value !== 'object') throw new Error('项目记录无效。');
  const data = value as StoredProject;
  if (data.id !== id || !Array.isArray(data.revisions) || data.revisions.length < 1 || data.revisions.length > 20) throw new Error('项目记录无效。');
  const access = assertProjectAccess(data.owner, { id: data.id, owner: data.owner });
  const seen = new Set<string>(), acceptedJobs = new Set<string>(), savedOperations = new Set<string>();
  const revisions = data.revisions.map((item, index): ProjectRevision => {
    if (!item || identifier(item.id) !== item.id || seen.has(item.id) || item.parentId !== (index ? data.revisions[index - 1]!.id : null) ||
      typeof item.createdAt !== 'string' || item.createdAt.length > 30 || !Number.isFinite(Date.parse(item.createdAt))) throw new Error('项目版本记录无效。');
    const source = checkSource(item.source);
    if (hash(source) !== item.sourceHash) throw new Error('项目源码校验失败。');
    const receipt: { acceptedJobId?: string; candidateHash?: string; savedOperationId?: string } = {};
    if (item.acceptedJobId !== undefined || item.candidateHash !== undefined) {
      if (index === 0 || typeof item.acceptedJobId !== 'string' || !uuid.test(item.acceptedJobId) || acceptedJobs.has(item.acceptedJobId) ||
          typeof item.candidateHash !== 'string' || !/^[0-9a-f]{64}$/.test(item.candidateHash)) throw new Error('候选接受记录无效。');
      acceptedJobs.add(item.acceptedJobId); receipt.acceptedJobId = item.acceptedJobId; receipt.candidateHash = item.candidateHash;
    }
    if (item.savedOperationId !== undefined) {
      if (index === 0 || item.acceptedJobId !== undefined || !uuid.test(identifier(item.savedOperationId)) || savedOperations.has(item.savedOperationId)) throw new Error('保存操作记录无效。');
      savedOperations.add(item.savedOperationId); receipt.savedOperationId = item.savedOperationId;
    }
    seen.add(item.id);
    return { ...receipt, id: item.id, parentId: item.parentId, source, sourceHash: item.sourceHash, createdAt: item.createdAt };
  });
  if (data.headRevision !== revisions.at(-1)!.id) throw new Error('项目头版本无效。');
  return { ...access, headRevision: data.headRevision, revisions };
}

export type ProjectListInput = { limit?: number; cursor?: string };
export type ProjectSummary = { id: string; headRevision: string; createdAt: string; updatedAt: string; revisionCount: number };
export type ProjectListPage = { projects: ProjectSummary[]; nextCursor: string | null };
const ownerDigest = (actor: Principal) => hash(JSON.stringify([actor.kind, actor.id]));
/** Opaque owner-bound keyset cursor. It is not an authorization credential. UUID order
 * is immutable across saves; newly inserted earlier IDs require restarting the list. */
export function projectListQuery(actor: Principal, input: ProjectListInput = {}): { limit: number; after: string | null } {
  assertProjectAccess(actor, { id: 'list', owner: actor });
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['limit', 'cursor'].includes(key))) throw new Error('列表参数无效。');
  const limit = input.limit === undefined ? 20 : input.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('列表数量须为 1–50。');
  if (input.cursor === undefined) return { limit, after: null };
  if (typeof input.cursor !== 'string' || input.cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw new Error('列表游标无效。');
  let value: unknown;
  try { value = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')); } catch { throw new Error('列表游标无效。'); }
  if (!Array.isArray(value) || value.length !== 3 || value[0] !== 1 || value[1] !== ownerDigest(actor) || typeof value[2] !== 'string' || !uuid.test(value[2])) throw new Error('列表游标无效。');
  return { limit, after: value[2] };
}
export function projectListPage(actor: Principal, items: StoredProject[], limit: number): ProjectListPage {
  const selected = items.slice(0, limit);
  const projects = selected.map(project => {
    assertProjectAccess(actor, { id: project.id, owner: project.owner });
    return { id: project.id, headRevision: project.headRevision, createdAt: project.revisions[0]!.createdAt, updatedAt: project.revisions.at(-1)!.createdAt, revisionCount: project.revisions.length };
  });
  return { projects, nextCursor: items.length > limit ? Buffer.from(JSON.stringify([1, ownerDigest(actor), selected.at(-1)!.id])).toString('base64url') : null };
}

/** Local-only repository. Instances in this process share a directory lock.
 * No cross-process locking, authentication, DB transaction or production durability claim.
 * Head and complete immutable history are replaced atomically in a single private file.
 */
export class LocalProjectRepository {
  private directory: string;
  constructor(directory: string) { this.directory = resolve(directory); }
  private serialized<T>(action: () => Promise<T>): Promise<T> {
    const result = (queues.get(this.directory) ?? Promise.resolve()).then(action);
    const settled = result.catch(() => {}); queues.set(this.directory, settled);
    void settled.then(() => { if (queues.get(this.directory) === settled) queues.delete(this.directory); });
    return result;
  }
  private async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (!(await lstat(this.directory)).isDirectory()) throw new Error('项目存储目录无效。');
    await chmod(this.directory, 0o700);
  }
  private async load(actor: Principal, id: string): Promise<StoredProject> {
    identifier(id);
    // Validate principal before touching project storage.
    assertProjectAccess(actor, { id, owner: actor });
    const path = join(this.directory, `${id}.json`);
    let handle;
    try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StudioAccessError(); throw error; }
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 25_000_000) throw new Error('项目文件无效。');
      const raw = JSON.parse(await handle.readFile('utf8')) as StoredProject;
      assertProjectAccess(actor, { id: raw.id, owner: raw.owner });
      return validateProject(raw, id);
    } finally { await handle.close(); }
  }
  private async write(project: StoredProject): Promise<void> {
    const temporary = join(this.directory, `${project.id}.${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(project), 'utf8');
      await handle.sync(); await handle.close(); handle = undefined;
      await rename(temporary, join(this.directory, `${project.id}.json`));
    } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
  }
  async list(actor: Principal, input: ProjectListInput = {}): Promise<ProjectListPage> {
    const { limit, after } = projectListQuery(actor, input);
    return this.serialized(async () => {
      await this.initialize();
      const ids = (await readdir(this.directory)).filter(name => name.endsWith('.json') && uuid.test(name.slice(0, -5))).map(name => name.slice(0, -5)).filter(id => after === null || id > after).sort();
      const items: StoredProject[] = [];
      for (const id of ids) {
        try { items.push(await this.load(actor, id)); }
        catch (error) { if (error instanceof StudioAccessError) continue; throw error; }
        if (items.length > limit) break;
      }
      return projectListPage(actor, items, limit);
    });
  }
  async create(actor: Principal, source: string, requestedId?: string): Promise<StoredProject> {
    return this.serialized(async () => {
      const id = requestedId === undefined ? randomUUID() : identifier(requestedId), access = assertProjectAccess(actor, { id, owner: actor });
      checkSource(source); await this.initialize();
      if (requestedId !== undefined) {
        let exists = true;
        try { await lstat(join(this.directory, `${id}.json`)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') exists = false; else throw error; }
        if (exists) {
          const existing = await this.load(actor, id);
          if (existing.revisions[0]!.source !== source) throw new Error('项目标识已用于其他初稿。');
          return structuredClone(existing);
        }
      }
      const revision: ProjectRevision = { id: randomUUID(), parentId: null, source, sourceHash: hash(source), createdAt: new Date().toISOString() };
      const project: StoredProject = { ...access, headRevision: revision.id, revisions: [revision] };
      await this.write(project); return structuredClone(project);
    });
  }
  async read(actor: Principal, projectId: string): Promise<StoredProject> {
    return this.serialized(async () => { await this.initialize(); return structuredClone(await this.load(actor, projectId)); });
  }
  async readRevision(actor: Principal, projectId: string, revisionId: string): Promise<ProjectRevision> {
    return this.serialized(async () => {
      identifier(revisionId); await this.initialize();
      const project = await this.load(actor, projectId), revision = project.revisions.find(item => item.id === revisionId);
      if (!revision) throw new StudioAccessError();
      return structuredClone(revision);
    });
  }
  /** Candidate must be retrieved from authorized server job storage, not HTTP body.
   * Job/project ownership and terminal status are checked by the service before calling.
   * This method atomically binds the acceptance receipt to the appended source revision.
   */
  async acceptCandidate(actor: Principal, projectId: string, jobId: string, candidate: TextProposal): Promise<ProjectRevision> {
    return this.serialized(async () => {
      identifier(jobId); await this.initialize();
      const project = await this.load(actor, projectId);
      if (!candidate || typeof candidate !== 'object' || Object.keys(candidate).length !== 5 ||
          !['baseId','baseSource','targetId','before','after'].every(key => Object.hasOwn(candidate, key))) throw new Error('候选格式无效。');
      identifier(candidate.baseId); checkSource(candidate.baseSource);
      const checked = buildCandidate({ id: candidate.baseId, source: candidate.baseSource, label: '' }, candidate.targetId, candidate.after);
      if (candidate.before !== checked.before) throw new Error('候选原文不匹配。');
      const candidateHash = hash(JSON.stringify([checked.baseId, checked.baseSource, checked.targetId, checked.before, checked.after]));
      const accepted = project.revisions.find(revision => revision.acceptedJobId === jobId);
      if (accepted) {
        if (accepted.candidateHash !== candidateHash) throw new Error('该任务已接受其他候选，不能替换。');
        return structuredClone(accepted);
      }
      const head = project.revisions.at(-1)!;
      if (head.id !== checked.baseId || head.source !== checked.baseSource) throw new ProjectRevisionConflict();
      if (project.revisions.length >= 20) throw new Error('项目已达 20 个版本，请导出后创建新项目。');
      const source = checkSource(applyProposal({ id: head.id, source: head.source, label: '' }, checked));
      const revision: ProjectRevision = { id: randomUUID(), parentId: head.id, source, sourceHash: hash(source), createdAt: new Date().toISOString(), acceptedJobId: jobId, candidateHash };
      await this.write({ ...project, headRevision: revision.id, revisions: [...project.revisions, revision] });
      return structuredClone(revision);
    });
  }
  async save(actor: Principal, projectId: string, expectedRevision: string, source: string, operationId?: string): Promise<StoredProject> {
    return this.serialized(async () => {
      identifier(expectedRevision); if (operationId !== undefined) identifier(operationId); checkSource(source); await this.initialize();
      const project = await this.load(actor, projectId);
      if (operationId !== undefined) {
        const saved = project.revisions.find(revision => revision.savedOperationId === operationId);
        if (saved) {
          if (saved.parentId !== expectedRevision || saved.source !== source) throw new Error('保存操作标识已用于其他修改。');
          return structuredClone(project);
        }
      }
      if (project.headRevision !== expectedRevision) throw new ProjectRevisionConflict();
      if (project.revisions.length >= 20) throw new Error('项目已达 20 个版本，请导出后创建新项目。');
      const revision: ProjectRevision = { id: randomUUID(), parentId: project.headRevision, source, sourceHash: hash(source), createdAt: new Date().toISOString(), ...(operationId === undefined ? {} : { savedOperationId: operationId }) };
      const updated: StoredProject = { ...project, headRevision: revision.id, revisions: [...project.revisions, revision] };
      await this.write(updated); return structuredClone(updated);
    });
  }
}

// Shared validation primitives for repository adapters; Local behavior is unchanged.
export { identifier as projectIdentifier, checkSource as validateProjectSource, hash as projectSourceHash, validateProject };
