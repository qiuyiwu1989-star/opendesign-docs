import 'fake-indexeddb/auto';
import { describe,it,expect,vi } from 'vitest';
import { readRemoteRecord,saveRemoteRecord,protectedRemoteJobIds,type RemoteRecord } from './studio-remote-store';
import { proposeText } from './studio-model';
import { inspectHtml } from './html';
const source='<h1>Original</h1>';
const input=():Omit<RemoteRecord,'revision'|'updatedAt'>=>{
 const projectId=crypto.randomUUID();return {taskId:crypto.randomUUID(),projectId,project:{id:projectId,headRevision:'v1',revisions:[{id:'v1',parentId:null,source,sourceHash:'a'.repeat(64),createdAt:new Date().toISOString()}]},pending:null,candidate:null};
};
describe('remote project local transaction store',()=>{
 it('rejects stale concurrent writers across separate connections',async()=>{
  const record=input();const first=await saveRemoteRecord(record,0);
  const results=await Promise.allSettled([saveRemoteRecord({...record,pending:{kind:'save',id:crypto.randomUUID(),baseRevision:'v1',source:'<h1>One</h1>'}},first.revision),saveRemoteRecord({...record,pending:{kind:'save',id:crypto.randomUUID(),baseRevision:'v1',source:'<h1>Two</h1>'}},first.revision)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const failed=results.find(r=>r.status==='rejected');expect(failed?.status==='rejected'&&String(failed.reason)).toContain('其他窗口');
  expect((await readRemoteRecord(record.taskId))?.revision).toBe(2);
 });
 it('preserves pending operations on fresh read and copies caller values before awaiting',async()=>{
  const record=input();record.pending={kind:'generate',id:crypto.randomUUID(),baseRevision:'v1',targetId:'text-0',instruction:'Improve'};
  const expected=structuredClone(record);const saving=saveRemoteRecord(record,0);
  record.project!.revisions[0]!.source='mutated';record.pending.instruction='mutated';
  const saved=await saving;expect(saved).toMatchObject(expected);
  saved.project!.revisions[0]!.source='modified-return';
  expect(await readRemoteRecord(record.taskId)).toMatchObject(expected);
 });
 it('atomically replaces pending with candidate and caches the project',async()=>{
  const record=input();const jobId=crypto.randomUUID();record.pending={kind:'generate',id:jobId,baseRevision:'v1',targetId:inspectHtml(source).targets[0]!.id,instruction:'Improve'};
  const first=await saveRemoteRecord(record,0);
  const proposal=proposeText({id:'v1',source,label:''},record.pending.targetId,'Better');
  const next={...record,pending:null,candidate:{jobId,proposal}};
  await saveRemoteRecord(next,first.revision);
  const restored=await readRemoteRecord(record.taskId);
  expect(restored?.pending).toBeNull();expect(restored?.candidate).toEqual(next.candidate);expect(restored?.project).toEqual(record.project);
  await expect(saveRemoteRecord({...next,project:{...record.project!,headRevision:'v2',revisions:[{...record.project!.revisions[0]!,id:'v2'}]}},2)).rejects.toThrow('无效');
  expect(await readRemoteRecord(record.taskId)).toEqual(restored);
 });
 it('protects all candidate and pending job IDs while excluding save operation IDs',async()=>{
  const a=input(),b=input(),c=input(),d=input();const ids=Array.from({length:4},()=>crypto.randomUUID());
  a.pending={kind:'generate',id:ids[0]!,baseRevision:'v1',targetId:'text-0',instruction:'Improve'};
  b.pending={kind:'accept',id:crypto.randomUUID(),jobId:ids[1]!,baseRevision:'v1',expectedSource:source};
  c.candidate={jobId:ids[2]!,proposal:proposeText({id:'v1',source,label:''},inspectHtml(source).targets[0]!.id,'Better')};
  d.pending={kind:'save',id:ids[3]!,baseRevision:'v1',source};
  await Promise.all([a,b,c,d].map(r=>saveRemoteRecord(r,0)));
  const protectedIds=await protectedRemoteJobIds();expect(protectedIds).toEqual(expect.arrayContaining(ids.slice(0,3)));expect(protectedIds).not.toContain(ids[3]);
 });
 it('keeps cached project and pending intact when the write fails with quota',async()=>{
  const record=input();const saved=await saveRemoteRecord(record,0);
  const put=vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(()=>{throw new DOMException('private quota details','QuotaExceededError');});
  try {await expect(saveRemoteRecord({...record,pending:{kind:'create',id:crypto.randomUUID(),source}},saved.revision)).rejects.toThrow('本机存储空间');}
  finally{put.mockRestore();}
  expect(await readRemoteRecord(record.taskId)).toEqual(saved);
 });
 it('supports legacy task IDs but rejects invalid project/op IDs and oversized sources',async()=>{
  const r=input();r.taskId='legacy-v1';expect((await saveRemoteRecord(r,0)).taskId).toBe('legacy-v1');
  await expect(saveRemoteRecord({...input(),projectId:'../bad'},0)).rejects.toThrow('无效');
  await expect(saveRemoteRecord({...input(),pending:{kind:'create',id:'bad',source}},0)).rejects.toThrow('无效');
  await expect(saveRemoteRecord({...input(),pending:{kind:'create',id:crypto.randomUUID(),source:'x'.repeat(200001)}},0)).rejects.toThrow('无效');
  const many=input();many.project!.revisions=Array.from({length:21},(_,i)=>({...many.project!.revisions[0]!,id:`v${i}`}));
  await expect(saveRemoteRecord(many,0)).rejects.toThrow('无效');
 });
});
