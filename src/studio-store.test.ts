import "fake-indexeddb/auto";
import {describe,expect,it,vi} from "vitest";
import {listStudioTasks,migrateLegacyStudio,parseStudioBackup,saveStudioTask,studioBackup} from "./studio-store";
import type {StudioDraft} from "./studio-model";
const draft=():StudioDraft=>({brief:{title:"任务",audience:"老师",goal:"课堂",materials:"合成材料"},outline:["首页","材料"],versions:[{id:crypto.randomUUID(),label:"初稿",source:"<p>原稿</p>"}]});
describe("Studio task persistence and backups",()=>{
 it("serializes concurrent saves and keeps the winning revision",async()=>{
  const id=crypto.randomUUID(),initial=await saveStudioTask(id,draft(),0);
  const result=await Promise.allSettled([saveStudioTask(id,{...initial.draft,brief:{...initial.draft.brief,title:"窗口 A"}},1),saveStudioTask(id,{...initial.draft,brief:{...initial.draft.brief,title:"窗口 B"}},1)]);
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(result.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((await listStudioTasks()).find(t=>t.id===id)?.revision).toBe(2);
 });
 it("restores backup as an independent task without overwriting original",async()=>{
  const original=await saveStudioTask(crypto.randomUUID(),draft(),0);
  const restored=await saveStudioTask(crypto.randomUUID(),parseStudioBackup(studioBackup(original.draft)),0);
  expect(restored.id).not.toBe(original.id);expect(restored.draft).toEqual(original.draft);
  await saveStudioTask(restored.id,{...restored.draft,brief:{...restored.draft.brief,title:"新副本"}},1);
  expect((await listStudioTasks()).find(t=>t.id===original.id)).toEqual(original);
 });
 it("migrates legacy once and preserves original storage",async()=>{
  const source=draft(),raw=JSON.stringify(source),storage={getItem:()=>raw};
  await Promise.all([migrateLegacyStudio(storage),migrateLegacyStudio(storage)]);
  const rows=await listStudioTasks();expect(rows.filter(t=>t.id==='legacy-v1')).toHaveLength(1);
  expect(rows.find(t=>t.id==='legacy-v1')?.draft).toEqual(source);expect(storage.getItem()).toBe(raw);
 });
 it("rejects malformed, oversized, or duplicate-version backups",()=>{
  expect(()=>parseStudioBackup('{}')).toThrow();
  expect(()=>parseStudioBackup('x'.repeat(5*1024*1024+1))).toThrow('5 MiB');
  const d=draft();d.versions.push(d.versions[0]!);expect(()=>studioBackup(d)).toThrow('标识');
 });
});

it("preserves the stored version when the write fails and permits recovery",async()=>{
 const id=crypto.randomUUID(),initial=await saveStudioTask(id,draft(),0);
 const next={...initial.draft,brief:{...initial.draft.brief,title:"失败后的输入"}};
 const failure=vi.spyOn(IDBObjectStore.prototype,"put").mockImplementationOnce(()=>{throw new DOMException("full","QuotaExceededError");});
 try { await expect(saveStudioTask(id,next,1)).rejects.toThrow("保存失败"); } finally { failure.mockRestore(); }
 expect((await listStudioTasks()).find(t=>t.id===id)).toEqual(initial);
 expect(parseStudioBackup(studioBackup(next))).toEqual(next);
 expect((await saveStudioTask(id,next,1)).revision).toBe(2);
});
