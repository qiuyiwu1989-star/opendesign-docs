import { applyProposal, proposeText, type TextProposal } from './studio-model';
/** Local cache and pending remote operations. Separate from document/version storage. */
export type RemoteRevision = { id: string; parentId: string | null; source: string; sourceHash: string; createdAt: string; acceptedJobId?: string; savedOperationId?: string };
export type RemoteProject = { id: string; headRevision: string; revisions: RemoteRevision[] };
export type RemoteOperation =
  | { kind: 'create'; id: string; source: string }
  | { kind: 'save'; id: string; baseRevision: string; source: string }
  | { kind: 'accept'; id: string; jobId: string; baseRevision: string; expectedSource: string }
  | { kind: 'generate'; id: string; baseRevision: string; targetId: string; instruction: string };
export type RemoteRecord = { taskId: string; revision: number; projectId: string; project: RemoteProject | null; pending: RemoteOperation | null; candidate: { jobId: string; proposal: TextProposal } | null; updatedAt: string };
type RecordInput = Omit<RemoteRecord, 'revision' | 'updatedAt'>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = () => new Error('远程草稿记录无效，原记录未修改。');
const storageError = () => new Error('无法保存远程草稿，请保留当前页面并检查本机存储空间。');
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const source = (value: unknown): value is string => typeof value === 'string' && value.length <= 200000;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function validateInput(input: RecordInput): RecordInput {
  if (!object(input) || !identifier(input.taskId) || typeof input.projectId !== 'string' || !uuid.test(input.projectId)) throw invalid();
  let project: RemoteProject | null = null;
  if (input.project !== null) {
    const p = input.project;
    if (!object(p) || p.id !== input.projectId || !identifier(p.headRevision) || !Array.isArray(p.revisions) || !p.revisions.length || p.revisions.length > 20) throw invalid();
    const revisions = p.revisions.map(r => {
      if (!object(r) || !identifier(r.id) || !(r.parentId === null || identifier(r.parentId)) || !source(r.source) || typeof r.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(r.sourceHash) || typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt)) || (r.acceptedJobId !== undefined && (typeof r.acceptedJobId !== 'string' || !uuid.test(r.acceptedJobId))) || (r.savedOperationId !== undefined && (typeof r.savedOperationId !== 'string' || !uuid.test(r.savedOperationId)))) throw invalid();
      return { id:r.id, parentId:r.parentId, source:r.source, sourceHash:r.sourceHash, createdAt:r.createdAt, ...(r.acceptedJobId === undefined ? {} : {acceptedJobId:r.acceptedJobId}), ...(r.savedOperationId === undefined ? {} : {savedOperationId:r.savedOperationId}) };
    });
    if (new Set(revisions.map(r => r.id)).size !== revisions.length || !revisions.some(r => r.id === p.headRevision)) throw invalid();
    project = { id:p.id, headRevision:p.headRevision, revisions };
  }
  let pending: RemoteOperation | null = null;
  if (input.pending !== null) {
    const p = input.pending;
    if (!object(p) || typeof p.id !== 'string' || !uuid.test(p.id)) throw invalid();
    if (p.kind === 'create' && source(p.source)) pending = {kind:p.kind,id:p.id,source:p.source};
    else if (p.kind === 'save' && identifier(p.baseRevision) && source(p.source)) pending = {kind:p.kind,id:p.id,baseRevision:p.baseRevision,source:p.source};
    else if (p.kind === 'accept' && typeof p.jobId === 'string' && uuid.test(p.jobId) && identifier(p.baseRevision) && source(p.expectedSource)) pending = {kind:p.kind,id:p.id,jobId:p.jobId,baseRevision:p.baseRevision,expectedSource:p.expectedSource};
    else if (p.kind === 'generate' && identifier(p.baseRevision) && identifier(p.targetId) && typeof p.instruction === 'string' && !!p.instruction.trim() && p.instruction.length <= 2000) pending = {kind:p.kind,id:p.id,baseRevision:p.baseRevision,targetId:p.targetId,instruction:p.instruction};
    else throw invalid();
  }
  let candidate: RemoteRecord['candidate'] = null;
  if (input.candidate !== null) {
    const c = input.candidate;
    const head = project?.revisions.find(r => r.id === project.headRevision);
    if (!object(c) || typeof c.jobId !== 'string' || !uuid.test(c.jobId) || !object(c.proposal) || !head || typeof c.proposal.after !== 'string' || typeof c.proposal.targetId !== 'string') throw invalid();
    try { proposeText({id:head.id,source:head.source,label:''},c.proposal.targetId,c.proposal.after); applyProposal({id:head.id,source:head.source,label:''},c.proposal); } catch { throw invalid(); }
    const p = c.proposal;
    candidate = {jobId:c.jobId,proposal:{baseId:p.baseId,baseSource:p.baseSource,targetId:p.targetId,before:p.before,after:p.after}};
  }
  return { taskId:input.taskId,projectId:input.projectId,project,pending,candidate };
}
function validateRecord(value: unknown): RemoteRecord {
  if (!object(value) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw invalid();
  return { ...validateInput(value as RecordInput), revision:value.revision as number, updatedAt:value.updatedAt };
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open('opendesign-studio-remote',1); } catch { reject(storageError()); return; }
    let blocked = false;
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('records')) request.result.createObjectStore('records',{keyPath:'taskId'}); };
    request.onerror = () => reject(storageError());
    request.onblocked = () => {blocked=true;reject(storageError());};
    request.onsuccess = () => {
      if(blocked){request.result.close();return;}
      request.result.onversionchange = () => request.result.close(); resolve(request.result);
    };
  });
}
export async function readRemoteRecord(taskId: string): Promise<RemoteRecord | null> {
  if (!identifier(taskId)) throw invalid();
  const db = await open();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('records','readonly');
    const request = tx.objectStore('records').get(taskId);
    tx.oncomplete = () => { db.close(); try { resolve(request.result === undefined ? null : validateRecord(request.result)); } catch { reject(invalid()); } };
    tx.onabort = () => {db.close();reject(storageError());};
  });
}

/** Reuse the original operation journal when rediscovering a cloud project. */
export async function findRemoteRecord(projectId: string): Promise<RemoteRecord | null> {
  if (!uuid.test(projectId)) throw invalid();
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const request = tx.objectStore('records').getAll();
    tx.oncomplete = () => {
      db.close();
      try {
        const matches = request.result.map(validateRecord).filter(record => record.projectId === projectId);
        // Never silently abandon a pending save/accept when a duplicate cache exists.
        matches.sort((a, b) => Number(!!b.pending) - Number(!!a.pending) || Number(!!b.candidate) - Number(!!a.candidate) || a.taskId.localeCompare(b.taskId));
        resolve(matches[0] ?? null);
      } catch { reject(invalid()); }
    };
    tx.onabort = () => { db.close(); reject(storageError()); };
  });
}
export async function saveRemoteRecord(record: RecordInput, expectedRevision: number): Promise<RemoteRecord> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) throw invalid();
  const input = validateInput(record); // Copy all nested values before the first await.
  const db = await open();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('records','readwrite');
    const store = tx.objectStore('records');
    let failure: Error = storageError();
    const next: RemoteRecord = {...input,revision:expectedRevision+1,updatedAt:new Date().toISOString()};
    const request = store.get(input.taskId);
    request.onsuccess = () => {
      try {
        const current = request.result === undefined ? null : validateRecord(request.result);
        if ((current?.revision ?? 0) !== expectedRevision) {failure=new Error('远程草稿已被其他窗口修改，请重新载入后再试。');tx.abort();return;}
        store.put(next);
      } catch (error) {failure=error instanceof DOMException ? storageError() : invalid();tx.abort();}
    };
    tx.oncomplete = () => {db.close();resolve(structuredClone(next));};
    tx.onabort = () => {db.close();reject(failure);};
  });
}

export async function protectedRemoteJobIds(): Promise<string[]> {
  const db = await open();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('records','readonly');
    const request = tx.objectStore('records').getAll();
    tx.oncomplete = () => {
      db.close();
      try {
        const ids = new Set<string>();
        for (const value of request.result) {
          const r = validateRecord(value);
          if (r.candidate) ids.add(r.candidate.jobId);
          if (r.pending?.kind === 'accept') ids.add(r.pending.jobId);
          if (r.pending?.kind === 'generate') ids.add(r.pending.id);
        }
        resolve([...ids]);
      } catch {reject(invalid());}
    };
    tx.onabort = () => {db.close();reject(storageError());};
  });
}
