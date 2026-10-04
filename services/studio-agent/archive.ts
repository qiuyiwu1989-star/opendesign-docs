import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, link, unlink, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { assertJobAccess, assertProjectAccess, type Principal } from './access';
import { buildCandidate } from './candidate';
import { validateProject, projectIdentifier, projectSourceHash } from './projects';
import type { JobRecord } from './jobs';
import { applyProposal } from '../../src/studio-model';
import type { StudioArchivePayload, StudioArchive, ArchiveJob } from './archive-types';

export const ARCHIVE_MAX_BYTES=64*1024*1024;
const digest=/^[a-f0-9]{64}$/;
const terminal=['candidate','failed','cancelled','interrupted'];
const codes=['provider','network','timeout','configuration','invalid_output','cancelled','execution'];
const invalid=():never=>{throw new Error('Studio archive is invalid or exceeds supported limits.');};
function obj(value:unknown,required:string[],optional:string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const row=value as Record<string,unknown>;
 if(!required.every(k=>Object.hasOwn(row,k))||Object.keys(row).some(k=>!required.includes(k)&&!optional.includes(k)))return invalid();
 return row;
}
function date(value:unknown):string{if(typeof value!=='string'||value.length>30||!Number.isFinite(Date.parse(value)))return invalid();return value;}
function canonical(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;
 const text=JSON.stringify(value);if(text===undefined)return invalid();return text;
}
export const archiveFingerprint=(payload:StudioArchivePayload):string=>createHash('sha256').update(canonical(payload)).digest('hex');
const identity=(owner:Principal)=>`${owner.kind}:${owner.id}`;
/** Validate every record and relation before a transaction is allowed to import anything. */
export function validateArchivePayload(value:unknown):StudioArchivePayload{
 try {
  const data=obj(value,['format','version','createdAt','sessionKeyHash','projects','jobs']);
  if(data.format!=='opendesign-studio-archive'||data.version!==1||typeof data.sessionKeyHash!=='string'||!digest.test(data.sessionKeyHash)||!Array.isArray(data.projects)||data.projects.length>1000||!Array.isArray(data.jobs)||data.jobs.length>3200)return invalid();
  const projects=data.projects.map(raw=>{
   const row=obj(raw,['id','owner','headRevision','revisions']);
   const project=validateProject(raw,projectIdentifier(row.id));
   if(canonical(project)!==canonical(raw))return invalid();
   return project;
  });
  const byId=new Map(projects.map(p=>[p.id,p]));if(byId.size!==projects.length)return invalid();
  const seen=new Set<string>(),counts=new Map<string,number>();
  const jobs:ArchiveJob[]=data.jobs.map(raw=>{
   const item=obj(raw,['owner','record']);
   const owner=assertProjectAccess(item.owner as Principal,{id:'archive',owner:item.owner}).owner;
   const r=obj(item.record,['id','status','createdAt','updatedAt'],['requestHash','binding','candidate','error','failureCode','providerStatus']);
   const id=projectIdentifier(r.id);
   if(r.error!==undefined&&typeof r.error!=='string')return invalid();
   if(typeof r.status!=='string'||!terminal.includes(r.status))return invalid();
   const record:JobRecord={id,status:r.status as JobRecord['status'],createdAt:date(r.createdAt),updatedAt:date(r.updatedAt)};
   const key=`${identity(owner)}:${id}`;if(seen.has(key))return invalid();seen.add(key);
   const count=(counts.get(identity(owner))??0)+1;if(count>100)return invalid();counts.set(identity(owner),count);
   if(r.requestHash!==undefined){if(typeof r.requestHash!=='string'||!digest.test(r.requestHash))return invalid();record.requestHash=r.requestHash;}
   if(r.binding!==undefined){
    const b=obj(r.binding,['owner','projectId','baseRevision']);
    const project=byId.get(projectIdentifier(b.projectId));if(!project)return invalid();
    const base=project.revisions.find(v=>v.id===b.baseRevision);if(!base)return invalid();
    record.binding=assertJobAccess(owner,{id:project.id,owner:project.owner},b,base.id);
   }
   if(r.status==='candidate'){
    const c=obj(r.candidate,['baseId','baseSource','targetId','before','after']);
    if(typeof c.baseId!=='string'||typeof c.baseSource!=='string'||typeof c.targetId!=='string'||typeof c.after!=='string')return invalid();
    const checked=buildCandidate({id:c.baseId,source:c.baseSource,label:''},c.targetId,c.after);
    if(checked.before!==c.before||canonical(checked)!==canonical(c))return invalid();
    if(record.binding){const base=byId.get(record.binding.projectId)!.revisions.find(v=>v.id===record.binding!.baseRevision)!;if(base.id!==checked.baseId||base.source!==checked.baseSource)return invalid();}
    record.candidate=checked;
   }else if(r.candidate!==undefined)return invalid();
   if(r.status==='failed'){
    record.error='生成未完成，请重试。作品未修改。';
    if(r.failureCode!==undefined){if(typeof r.failureCode!=='string'||!codes.includes(r.failureCode))return invalid();record.failureCode=r.failureCode as NonNullable<JobRecord['failureCode']>;}
    if(r.providerStatus!==undefined){if(record.failureCode!=='provider'||!Number.isInteger(r.providerStatus)||Number(r.providerStatus)<100||Number(r.providerStatus)>599)return invalid();record.providerStatus=Number(r.providerStatus);}
   }else{if(r.failureCode!==undefined||r.providerStatus!==undefined)return invalid();if(r.status==='interrupted')record.error='任务已中断，请重新生成。作品未修改。';}
   return {owner,record};
  });
  // Receipts survive job cleanup, but a retained candidate must agree with its receipt.
  const jobsById=new Map(jobs.map(j=>[`${identity(j.owner)}:${j.record.id}`,j.record]));
  for(const project of projects)for(const revision of project.revisions){
   if(!revision.acceptedJobId)continue;
   const job=jobsById.get(`${identity(project.owner)}:${revision.acceptedJobId}`);if(!job)continue;
   const c=job.candidate;
   if(job.binding?.projectId!==project.id||!c||c.baseId!==revision.parentId||projectSourceHash(JSON.stringify([c.baseId,c.baseSource,c.targetId,c.before,c.after]))!==revision.candidateHash)return invalid();
   if(applyProposal({id:c.baseId,source:c.baseSource,label:''},c)!==revision.source)return invalid();
  }
  const payload:StudioArchivePayload={format:'opendesign-studio-archive',version:1,createdAt:date(data.createdAt),sessionKeyHash:data.sessionKeyHash,projects:projects.sort((a,b)=>a.id.localeCompare(b.id)),jobs:jobs.sort((a,b)=>identity(a.owner).localeCompare(identity(b.owner))||a.record.id.localeCompare(b.record.id))};
  if(Buffer.byteLength(JSON.stringify(payload))>ARCHIVE_MAX_BYTES-200)return invalid();
  return payload;
 }catch{ return invalid(); }
}
export async function readSessionKeyHash(directory:string):Promise<string>{
 const handle=await open(join(directory,'session-signing-key'),constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const stat=await handle.stat();if(!stat.isFile()||stat.nlink!==1||stat.size!==32)throw new Error('Existing Studio session key is required.');return createHash('sha256').update(await handle.readFile()).digest('hex');}finally{await handle.close();}
}
/** Private no-clobber publication: a crash cannot replace a previous good archive. */
export async function writeArchiveFile(path:string,input:StudioArchivePayload):Promise<void>{
 const payload=validateArchivePayload(input),file:StudioArchive={payload,sha256:archiveFingerprint(payload)};
 const destination=resolve(path),temporary=join(dirname(destination),`.studio-archive-${randomUUID()}.tmp`);
 let handle;
 try{handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);await handle.writeFile(JSON.stringify(file));await handle.sync();await handle.close();handle=undefined;await link(temporary,destination);}
 finally{await handle?.close();await unlink(temporary).catch(()=>{});}
}
export async function readArchiveFile(path:string):Promise<StudioArchivePayload>{
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=await handle.stat();if(!stat.isFile()||stat.nlink!==1||stat.size>ARCHIVE_MAX_BYTES)return invalid();
  const file=obj(JSON.parse(await handle.readFile('utf8')),['payload','sha256']);
  // Verify stored bytes' logical content before sanitizing descriptive error strings.
  if(typeof file.sha256!=='string'||!digest.test(file.sha256)||archiveFingerprint(file.payload as StudioArchivePayload)!==file.sha256)return invalid();
  return validateArchivePayload(file.payload);
 }finally{await handle.close();}
}
export async function requireExistingStateDirectory(path:string):Promise<void>{
 if(!(await lstat(path)).isDirectory())throw new Error('Existing Studio state directory is required.');
}
