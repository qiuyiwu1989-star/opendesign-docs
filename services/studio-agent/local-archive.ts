import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { createHash } from 'node:crypto';
import { acquireStateLock } from './state-lock';
import { validateProject } from './projects';
import { decodeLocalJob } from './jobs';
import { validateArchivePayload } from './archive';
import type { StudioArchivePayload } from './archive-types';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const scope=/^[a-f0-9]{64}$/;
const lockNames=new Set(['writer-lock.sqlite','writer-lock.sqlite-journal','writer-lock.sqlite-wal','writer-lock.sqlite-shm']);
const invalid=()=>new Error('本地归档失败：目录包含未知、无效或不安全的数据。原记录未修改。');
async function directory(path:string):Promise<void>{const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink())throw invalid();}
async function file(path:string,limit:number):Promise<Buffer>{
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=await handle.stat();if(!stat.isFile()||stat.nlink!==1||stat.size>limit)throw invalid();
  const result=await handle.readFile();if(result.length>limit)throw invalid();return result;
 }finally{await handle.close();}
}
/** Offline export only. Does not initialize, normalize or rewrite source records. */
export async function exportLocalArchive(stateDirectory:string):Promise<StudioArchivePayload>{
 let release:(()=>void)|undefined;
 try{
  const root=resolve(stateDirectory);await directory(root);
  // Check before acquiring a lock, which itself is allowed to create its SQLite lock file.
  const keyInfo=await lstat(join(root,'session-signing-key'));
  if(!keyInfo.isFile()||keyInfo.isSymbolicLink()||keyInfo.nlink!==1||keyInfo.size!==32)throw invalid();
  release=await acquireStateLock(root);
  const key=await file(join(root,'session-signing-key'),32);if(key.length!==32)throw invalid();
  const payload:StudioArchivePayload={format:'opendesign-studio-archive',version:1,createdAt:new Date().toISOString(),sessionKeyHash:createHash('sha256').update(key).digest('hex'),projects:[],jobs:[]};
  let total=0;
  const json=async(path:string,limit:number)=>{const bytes=await file(path,limit);total+=bytes.length;if(total>64_000_000)throw invalid();return new TextDecoder('utf-8',{fatal:true}).decode(bytes);};
  const rootEntries=await readdir(root);if(rootEntries.length>20)throw invalid();
  for(const name of rootEntries){
   if(name==='session-signing-key')continue;
   if(lockNames.has(name)){const stat=await lstat(join(root,name));if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>16_000_000)throw invalid();continue;}
   if(name==='projects'){
    const path=join(root,name);await directory(path);const entries=await readdir(path);if(entries.length>10000)throw invalid();
    for(const entry of entries){const id=entry.endsWith('.json')?entry.slice(0,-5):'';if(!uuid.test(id))throw invalid();const raw=JSON.parse(await json(join(path,entry),25_000_000));validateProject(raw,id);payload.projects.push(raw);}
   }else if(name==='sessions'){
    const path=join(root,name);await directory(path);const owners=await readdir(path);if(owners.length>10000)throw invalid();
    for(const owner of owners){if(!scope.test(owner))throw invalid();const ownerPath=join(path,owner);await directory(ownerPath);const entries=await readdir(ownerPath);if(entries.length>100)throw invalid();
     for(const entry of entries){const id=entry.endsWith('.json')?entry.slice(0,-5):'';if(!uuid.test(id))throw invalid();
      const raw=await json(join(ownerPath,entry),2_000_000);if(!decodeLocalJob(raw,id))throw invalid();const record=JSON.parse(raw);
      if(record.status==='running'){record.status='interrupted';record.error='服务已停止，任务已中断。请重新生成。';}
      payload.jobs.push({owner:{kind:'anonymous',id:owner},record});
     }
    }
   }else throw invalid();
  }
  return validateArchivePayload(payload);
 }catch{throw invalid();}finally{release?.();}
}
