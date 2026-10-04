import { projectListQuery, projectListPage, type ProjectListInput, type ProjectListPage } from './projects';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { pgTransaction } from './pg-core';
import { assertProjectAccess, StudioAccessError, type Principal } from './access';
import { projectIdentifier as identifier, validateProjectSource as checkSource, projectSourceHash as hash, validateProject, ProjectRevisionConflict, type StoredProject, type ProjectRevision } from './projects';
import { applyProposal, type TextProposal } from '../../src/studio-model';
import { buildCandidate } from './candidate';

export class ProjectCapacityError extends Error { constructor(){super('项目数量已达上限，现有作品已保留。');this.name='ProjectCapacityError';} }
export type ProjectLimits = { owner: number; global: number };

/** Row-locked PostgreSQL adapter. Authentication and authorized job loading remain caller responsibilities. */
export class PostgresProjectRepository {
  private limits: ProjectLimits;
  constructor(private pool: Pool, limits: Partial<ProjectLimits> = {}) {
    this.limits = { owner: 20, global: 1000, ...limits };
    if(!Object.values(this.limits).every(value=>Number.isSafeInteger(value)&&value>0))throw new Error('Invalid project capacity');
  }
  private async load(client: PoolClient, actor: Principal, id: string): Promise<StoredProject> {
    identifier(id); assertProjectAccess(actor, { id, owner: actor });
    const result = await client.query('SELECT owner_kind, owner_id, document FROM studio_agent.projects WHERE id=$1 FOR UPDATE', [id]);
    const row = result.rows[0]; if (!row) throw new StudioAccessError();
    assertProjectAccess(actor, { id, owner: { kind: row.owner_kind, id: row.owner_id } });
    const project = validateProject(row.document, id);
    assertProjectAccess(actor, { id, owner: project.owner });
    return project;
  }
  private async write(client: PoolClient, project: StoredProject): Promise<void> {
    validateProject(project, project.id);
    const result = await client.query('UPDATE studio_agent.projects SET document=$2::jsonb WHERE id=$1 AND owner_kind=$3 AND owner_id=$4', [project.id, JSON.stringify(project), project.owner.kind, project.owner.id]);
    if (result.rowCount !== 1) throw new StudioAccessError();
  }
  async list(actor: Principal, input: ProjectListInput = {}): Promise<ProjectListPage> {
    const { limit, after } = projectListQuery(actor, input);
    const result = await this.pool.query('SELECT id,document FROM studio_agent.projects WHERE owner_kind=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR id>$3::uuid) ORDER BY id ASC LIMIT $4', [actor.kind, actor.id, after, limit + 1]);
    return projectListPage(actor, result.rows.map(row => validateProject(row.document, row.id)), limit);
  }
  async create(actor: Principal, source: string, requestedId?: string): Promise<StoredProject> {
    const id = requestedId === undefined ? randomUUID() : identifier(requestedId);
    const access = assertProjectAccess(actor, { id, owner: actor }); checkSource(source);
    return pgTransaction(this.pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(734901923)');
      if((await client.query('SELECT 1 FROM studio_agent.projects WHERE id=$1',[id])).rowCount) {
        const existing = await this.load(client,actor,id);
        if(existing.revisions[0]!.source!==source)throw new Error('项目标识已用于其他初稿。');
        return existing;
      }
      const counts=await client.query('SELECT count(*)::int AS total,count(*) FILTER (WHERE owner_kind=$1 AND owner_id=$2)::int AS owned FROM studio_agent.projects',[actor.kind,actor.id]);
      if(counts.rows[0].total>=this.limits.global || counts.rows[0].owned>=this.limits.owner)throw new ProjectCapacityError();
      const revision: ProjectRevision = { id: randomUUID(), parentId: null, source, sourceHash: hash(source), createdAt: new Date().toISOString() };
      const project = { ...access, headRevision: revision.id, revisions: [revision] };
      await client.query('INSERT INTO studio_agent.projects(id,owner_kind,owner_id,document) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO NOTHING', [id, access.owner.kind, access.owner.id, JSON.stringify(project)]);
      const existing = await this.load(client, actor, id);
      if (existing.revisions[0]!.source !== source) throw new Error('项目标识已用于其他初稿。');
      return existing;
    });
  }
  async read(actor: Principal, projectId: string): Promise<StoredProject> {
    return pgTransaction(this.pool, client => this.load(client, actor, projectId));
  }
  async readRevision(actor: Principal, projectId: string, revisionId: string): Promise<ProjectRevision> {
    identifier(revisionId);
    return pgTransaction(this.pool, async client => {
      const project = await this.load(client, actor, projectId), revision = project.revisions.find(item => item.id === revisionId);
      if (!revision) throw new StudioAccessError(); return revision;
    });
  }
  async save(actor: Principal, projectId: string, expectedRevision: string, source: string, operationId?: string): Promise<StoredProject> {
    identifier(expectedRevision); if (operationId !== undefined) identifier(operationId); checkSource(source);
    return pgTransaction(this.pool, async client => {
      const project = await this.load(client, actor, projectId);
      const saved = operationId === undefined ? undefined : project.revisions.find(item => item.savedOperationId === operationId);
      if (saved) {
        if (saved.parentId !== expectedRevision || saved.source !== source) throw new Error('保存操作标识已用于其他修改。');
        return project;
      }
      if (project.headRevision !== expectedRevision) throw new ProjectRevisionConflict();
      if (project.revisions.length >= 20) throw new Error('项目已达 20 个版本，请导出后创建新项目。');
      const revision: ProjectRevision = { id: randomUUID(), parentId: project.headRevision, source, sourceHash: hash(source), createdAt: new Date().toISOString(), ...(operationId === undefined ? {} : { savedOperationId: operationId }) };
      const updated = { ...project, headRevision: revision.id, revisions: [...project.revisions, revision] };
      await this.write(client, updated); return updated;
    });
  }
  /** candidate must come from authorized server-side job storage, never raw request body. */
  async acceptCandidate(actor: Principal, projectId: string, jobId: string, candidate: TextProposal): Promise<ProjectRevision> {
    identifier(jobId);
    return pgTransaction(this.pool, async client => {
      const project = await this.load(client, actor, projectId);
      if (!candidate || typeof candidate !== 'object' || Object.keys(candidate).length !== 5 || !['baseId','baseSource','targetId','before','after'].every(key => Object.hasOwn(candidate, key))) throw new Error('候选格式无效。');
      identifier(candidate.baseId); checkSource(candidate.baseSource);
      const checked = buildCandidate({ id: candidate.baseId, source: candidate.baseSource, label: '' }, candidate.targetId, candidate.after);
      if (checked.before !== candidate.before) throw new Error('候选原文不匹配。');
      const candidateHash = hash(JSON.stringify([checked.baseId, checked.baseSource, checked.targetId, checked.before, checked.after]));
      const accepted = project.revisions.find(item => item.acceptedJobId === jobId);
      if (accepted) {
        if (accepted.candidateHash !== candidateHash) throw new Error('该任务已接受其他候选，不能替换。');
        return accepted;
      }
      const head = project.revisions.at(-1)!;
      if (head.id !== checked.baseId || head.source !== checked.baseSource) throw new ProjectRevisionConflict();
      if (project.revisions.length >= 20) throw new Error('项目已达 20 个版本，请导出后创建新项目。');
      const source = checkSource(applyProposal({ id: head.id, source: head.source, label: '' }, checked));
      const revision: ProjectRevision = { id: randomUUID(), parentId: head.id, source, sourceHash: hash(source), createdAt: new Date().toISOString(), acceptedJobId: jobId, candidateHash };
      await this.write(client, { ...project, headRevision: revision.id, revisions: [...project.revisions, revision] }); return revision;
    });
  }
}
