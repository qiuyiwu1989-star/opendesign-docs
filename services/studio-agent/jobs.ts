import { randomUUID, createHash } from 'node:crypto';
import { mkdir, chmod, readdir, lstat, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { TextProposal } from '../../src/studio-model';
import type { EditRequest } from './run';
import { ArkRequestError } from './ark';
import { assertJobAccess, type JobBinding } from './access';
import { buildCandidate, selectionContext } from './candidate';

const failureCodes = ['provider', 'network', 'timeout', 'configuration', 'invalid_output', 'cancelled', 'execution'] as const;
export type JobFailureCode = typeof failureCodes[number];
const validProviderStatus = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599;
const validFailureCode = (value: unknown): value is JobFailureCode => typeof value === 'string' && (failureCodes as readonly string[]).includes(value);
export type JobRecord = { id: string; status: 'queued' | 'running' | 'candidate' | 'failed' | 'cancelled' | 'interrupted'; createdAt: string; updatedAt: string; candidate?: TextProposal; error?: string; requestHash?: string; binding?: JobBinding; failureCode?: JobFailureCode; providerStatus?: number };
export type JobSummary = Pick<JobRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'>;
export class RunningJobRemovalError extends Error {
  constructor() { super('运行中的任务不能删除，请先取消。'); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const failed = '生成未完成，请重试。作品未修改。';
const interrupted = '服务已重启或关闭，任务已中断。请重新生成。';
const clone = <T>(value: T): T => structuredClone(value);

// Structural validation only. The HTTP layer must supply an already-authorized binding.
function validatedBinding(value: unknown): JobBinding {
  if (!value || typeof value !== 'object') throw new Error('任务归属无效。');
  const binding = value as JobBinding;
  return clone(assertJobAccess(binding.owner, { id: binding.projectId, owner: binding.owner }, value, binding.baseRevision));
}
function validatedCandidate(candidate: TextProposal): TextProposal {
  if (!candidate || typeof candidate !== 'object') throw new Error('候选无效。');
  const checked = buildCandidate({ id: candidate.baseId, source: candidate.baseSource, label: '' }, candidate.targetId, candidate.after);
  if (checked.before !== candidate.before) throw new Error('候选原文不匹配。');
  return checked;
}
function decode(raw: string, id: string): JobRecord | undefined {
  try {
    const value = JSON.parse(raw);
    if (!value || value.id !== id || !['running','candidate','failed','cancelled','interrupted'].includes(value.status) ||
      ![value.createdAt,value.updatedAt].every(date => typeof date === 'string' && date.length <= 30 && Number.isFinite(Date.parse(date)))) return;
    const record: JobRecord = { id, status: value.status, createdAt: value.createdAt, updatedAt: value.updatedAt };
    if (value.requestHash !== undefined) {
      if (typeof value.requestHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.requestHash)) return;
      record.requestHash = value.requestHash;
    }
    if (value.binding !== undefined) record.binding = validatedBinding(value.binding);
    if (record.status === 'candidate') {
      record.candidate = validatedCandidate(value.candidate);
      if (record.binding && record.binding.baseRevision !== record.candidate.baseId) return;
    }
    if (record.status === 'failed') {
      record.error = failed;
      if (validFailureCode(value.failureCode)) record.failureCode = value.failureCode;
      if (record.failureCode === 'provider' && validProviderStatus(value.providerStatus)) record.providerStatus = value.providerStatus;
    }
    if (record.status === 'interrupted') record.error = interrupted;
    return record;
  } catch { return; }
}

/** Single-process local development persistence. No instructions or provider errors are stored. */
export class LocalAgentJobs {
  private records = new Map<string, JobRecord>();
  private active: { id: string; controller: AbortController } | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private initialized = false;
  private closed = false;
  private fileCount = 0;
  private occupiedIds = new Set<string>();
  constructor(private directory: string, private execute: (request: EditRequest, signal: AbortSignal) => Promise<TextProposal>) {}
  private serialized<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }
  private async persist(record: JobRecord): Promise<void> {
    const path = join(this.directory, `${record.id}.json`);
    const temp = join(this.directory, `${record.id}.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(record), { mode: 0o600, flag: 'wx' });
      await rename(temp, path);
      this.records.set(record.id, record);
    } finally { await unlink(temp).catch(() => {}); }
  }
  async initialize(): Promise<void> {
    return this.serialized(async () => {
      if (this.initialized) return;
      if (this.closed) throw new Error('任务服务已关闭。');
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      if (!(await lstat(this.directory)).isDirectory()) throw new Error('任务存储目录无效。');
      await chmod(this.directory, 0o700);
      const files = (await readdir(this.directory)).filter(name => name.endsWith('.json') && uuid.test(name.slice(0, -5)));
      if (files.length > 100) throw new Error('本机任务记录超过 100 条，请先清理已完成任务；无效记录需归档任务目录。');
      this.fileCount = files.length;
      this.occupiedIds = new Set(files.map(name => name.slice(0, -5)));
      for (const name of files) {
        const path = join(this.directory, name), stat = await lstat(path);
        if (!stat.isFile() || stat.size > 2_000_000) continue;
        const record = decode(await readFile(path, 'utf8'), name.slice(0, -5));
        if (!record) continue;
        if (record.status === 'running') {
          record.status = 'interrupted'; record.error = interrupted; record.updatedAt = new Date().toISOString();
        }
        // Rewriting also removes unknown fields and restricts existing file permissions.
        await this.persist(record);
      }
      this.initialized = true;
    });
  }
  async start(request: EditRequest, requestedId?: string, binding?: JobBinding): Promise<JobRecord> {
    const checkedBinding = binding === undefined ? undefined : validatedBinding(binding);
    if (checkedBinding && checkedBinding.baseRevision !== request?.version?.id) throw new Error('任务基准版本不匹配。');
    await this.initialize();
    return this.serialized(async () => {
      if (this.closed) throw new Error('任务服务已关闭。');
      if (!request || typeof request.instruction !== 'string' || !request.instruction.trim() || request.instruction.length > 2000) throw new Error('修改要求无效。');
      selectionContext(request.version, request.targetId);
      if (requestedId !== undefined && (typeof requestedId !== 'string' || !uuid.test(requestedId))) throw new Error('任务标识无效。');
      const input = clone(request);
      const fingerprint: unknown[] = [input.version.id, input.version.source, input.targetId, input.instruction];
      if (checkedBinding) fingerprint.push(checkedBinding);
      const requestHash = createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
      const id = requestedId ?? randomUUID();
      const existing = this.records.get(id);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new Error('任务标识已用于其他请求，请创建新任务。');
        return clone(existing);
      }
      if (this.occupiedIds.has(id)) throw new Error('任务标识已被已有记录占用，请创建新任务。');
      if (this.active) throw new Error('已有任务正在生成，请等待完成或取消后再试。');
      if (this.fileCount >= 100) throw new Error('本机任务已达 100 条，请先清理已完成任务；无效记录需归档任务目录。');
      const now = new Date().toISOString();
      const record: JobRecord = { id, requestHash, status: 'running', createdAt: now, updatedAt: now, ...(checkedBinding ? { binding: checkedBinding } : {}) };
      await this.persist(record); this.fileCount++; this.occupiedIds.add(id);
      const controller = new AbortController();
      this.active = { id: record.id, controller };
      void Promise.resolve().then(() => this.execute(input, controller.signal)).then(
        candidate => {
          if (!candidate || candidate.baseId !== input.version.id || candidate.baseSource !== input.version.source || candidate.targetId !== input.targetId) return this.finish(record.id);
          return this.finish(record.id, candidate);
        },
        error => this.finish(record.id, undefined, error instanceof ArkRequestError && validFailureCode(error.code) ? error.code : 'execution', error instanceof ArkRequestError ? error.status : undefined),
      ).catch(() => { /* No provider or filesystem error is exposed to clients. */ });
      return clone(record);
    });
  }
  private async finish(id: string, candidate?: TextProposal, failureCode: JobFailureCode = 'execution', providerStatus?: number): Promise<void> {
    return this.serialized(async () => {
      if (this.active?.id !== id) return;
      const previous = this.records.get(id)!;
      const record: JobRecord = { ...previous, updatedAt: new Date().toISOString(), status: 'failed', error: failed, failureCode };
      if (failureCode === 'provider' && validProviderStatus(providerStatus)) record.providerStatus = providerStatus;
      try {
        if (candidate) { record.candidate = validatedCandidate(candidate); record.status = 'candidate'; delete record.error; delete record.failureCode; delete record.providerStatus; }
      } catch { /* Invalid tool output is a generic failure. */ }
      try { await this.persist(record); }
      catch { this.records.set(id, { ...previous, status: 'failed', error: failed, failureCode: 'execution', updatedAt: record.updatedAt }); }
      finally { this.active = undefined; }
    });
  }
  async get(id: string): Promise<JobRecord | undefined> {
    await this.initialize();
    return this.serialized(async () => uuid.test(id) ? clone(this.records.get(id)) : undefined);
  }
  async list(): Promise<JobSummary[]> {
    await this.initialize();
    return this.serialized(async () => [...this.records.values()]
      .map(({ id, status, createdAt, updatedAt }) => ({ id, status, createdAt, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)));
  }
  async remove(id: string): Promise<boolean> {
    await this.initialize();
    return this.serialized(async () => {
      if (this.closed) throw new Error('任务服务已关闭。');
      if (!uuid.test(id)) return false;
      const record = this.records.get(id);
      if (!record) return false;
      if (record.status === 'running' || this.active?.id === id) throw new RunningJobRemovalError();
      // Disk removal precedes memory/count updates; failures preserve the existing record.
      await unlink(join(this.directory, `${id}.json`));
      this.records.delete(id);
      if (this.occupiedIds.delete(id)) this.fileCount--;
      return true;
    });
  }
  async cancel(id: string): Promise<JobRecord | undefined> {
    await this.initialize();
    return this.serialized(async () => {
      if (!uuid.test(id)) return;
      const previous = this.records.get(id);
      if (!previous || this.active?.id !== id) return clone(previous);
      const record: JobRecord = { ...previous, status: 'cancelled', updatedAt: new Date().toISOString() };
      await this.persist(record);
      const controller = this.active.controller; this.active = undefined; controller.abort();
      return clone(record);
    });
  }
  async close(): Promise<void> {
    return this.serialized(async () => {
      this.closed = true;
      if (!this.active) return;
      const { id, controller } = this.active;
      this.active = undefined; controller.abort();
      const previous = this.records.get(id)!;
      await this.persist({ ...previous, status: 'interrupted', updatedAt: new Date().toISOString(), error: interrupted });
    });
  }
}

export { decode as decodeLocalJob };
