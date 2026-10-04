import { readStudioDraft, STUDIO_KEY, type StudioDraft } from "./studio-model";
export type StudioTask = { id: string; revision: number; updatedAt: string; draft: StudioDraft };
const DATABASE = "opendesign-studio";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    let blocked=false;
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>request.result.createObjectStore("tasks",{keyPath:"id"});
    request.onerror=()=>reject(new Error("Studio 存储无法打开。"));
    request.onblocked=()=>{blocked=true;reject(new Error("Studio 存储被旧窗口占用，请关闭旧窗口重试。"));};
    request.onsuccess=()=>{if(blocked){request.result.close();return;}request.result.onversionchange=()=>request.result.close();resolve(request.result);};
  });
}
export async function listStudioTasks(): Promise<StudioTask[]> {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("tasks","readonly"),request=tx.objectStore("tasks").getAll();
    tx.oncomplete=()=>{db.close();resolve((request.result as StudioTask[]).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id)));};
    tx.onabort=()=>{db.close();reject(new Error("任务读取失败，请重试。"));};
  });
}
// Read, compare and write share one IndexedDB transaction, including across tabs.
export async function saveStudioTask(id: string, draft: StudioDraft, expectedRevision: number): Promise<StudioTask> {
  if(!id || !Number.isSafeInteger(expectedRevision) || expectedRevision<0 || expectedRevision>=Number.MAX_SAFE_INTEGER) throw new Error("任务版本无效。");
  const validated=readStudioDraft(JSON.stringify(draft));
  if(!validated) throw new Error("草稿无效。");
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("tasks","readwrite"),store=tx.objectStore("tasks"),request=store.get(id);
    let record:StudioTask, reason="保存失败，请下载备份并检查浏览器存储空间。";
    request.onsuccess=()=>{
      if((request.result?.revision??0)!==expectedRevision){reason="另一个窗口更新了此任务。当前输入已保留，可保留当前修改为新任务，或取消修改后重新打开任务。";tx.abort();return;}
      record={id,draft:validated,revision:expectedRevision+1,updatedAt:new Date().toISOString()};
      try { store.put(record); } catch { tx.abort(); }
    };
    tx.oncomplete=()=>{db.close();resolve(record);};
    tx.onabort=()=>{db.close();reject(new Error(reason));};
    tx.onerror=()=>{};
  });
}
export async function migrateLegacyStudio(storage: Pick<Storage,"getItem">): Promise<void> {
  if((await listStudioTasks()).some(t=>t.id==="legacy-v1"))return;
  const draft=readStudioDraft(storage.getItem(STUDIO_KEY));
  if(!draft)return;
  try { await saveStudioTask("legacy-v1",draft,0); }
  catch(e){ if(!(await listStudioTasks()).some(t=>t.id==="legacy-v1"))throw e; }
  // Keep the old record intact so an interrupted or older app can still recover it.
}
export function studioBackup(draft:StudioDraft):string {
  const validated=readStudioDraft(JSON.stringify(draft));
  if(!validated)throw new Error("草稿无效。");
  const raw=JSON.stringify({kind:"opendesign-studio-backup",schema:1,draft:validated},null,2);
  if(new TextEncoder().encode(raw).byteLength>5*1024*1024)throw new Error("任务备份超过 5 MiB，请先将需要的版本转入 Docs 单独备份。");
  return raw;
}
export function parseStudioBackup(raw:string):StudioDraft {
  if(new TextEncoder().encode(raw).byteLength>5*1024*1024)throw new Error("备份不能超过 5 MiB。");
  const data=JSON.parse(raw);
  if(data?.kind!=="opendesign-studio-backup"||data.schema!==1)throw new Error("不是支持的 Studio 备份。");
  const draft=readStudioDraft(JSON.stringify(data.draft));
  if(!draft)throw new Error("备份缺少草稿。");
  return draft;
}
