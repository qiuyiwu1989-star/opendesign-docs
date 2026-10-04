import { describe,it,expect } from 'vitest';
import { mkdtemp,rm,readFile,writeFile,mkdir,symlink,readdir,lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { loadLocalSessionCodec } from './session';
import { LocalProjectRepository } from './projects';
import { buildCandidate } from './candidate';
import { inspectHtml } from '../../src/html';
import { acquireStateLock } from './state-lock';
import { exportLocalArchive } from './local-archive';
const owner={kind:'anonymous' as const,id:'a'.repeat(64)};
async function fixture(test:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'studio-export-'));try{await loadLocalSessionCodec(root);await test(root);}finally{await rm(root,{recursive:true,force:true});}}
async function snapshots(root:string){const result:Record<string,string>={};const visit=async(dir:string)=>{for(const n of await readdir(dir)){if(n.startsWith('writer-lock.sqlite'))continue;const p=join(dir,n);const st=await lstat(p);if(st.isDirectory())await visit(p);else result[p]=createHash('sha256').update(await readFile(p)).digest('hex');}};await visit(root);return result;}
describe('offline local archive export',()=>{
 it('preserves source, history, candidate, ownership and hashes without rewriting files',async()=>fixture(async root=>{
  const repo=new LocalProjectRepository(join(root,'projects'));const first=await repo.create(owner,'<h1>Original</h1>\r\n<p>保留</p>');
  const project=await repo.save(owner,first.id,first.headRevision,'<h1>Manual</h1>\r\n<p>保留</p>',randomUUID());
  const base=project.revisions.at(-1)!;const candidate=buildCandidate({id:base.id,source:base.source,label:''},inspectHtml(base.source).targets[0]!.id,'Improved');
  const path=join(root,'sessions',owner.id);await mkdir(path,{recursive:true});const id=randomUUID(),runningId=randomUUID(),date=new Date().toISOString(),requestHash='b'.repeat(64);
  await writeFile(join(path,`${id}.json`),JSON.stringify({id,status:'candidate',createdAt:date,updatedAt:date,candidate,requestHash,binding:{owner,projectId:project.id,baseRevision:base.id}}));
  await writeFile(join(path,`${runningId}.json`),JSON.stringify({id:runningId,status:'running',createdAt:date,updatedAt:date,requestHash}));
  const before=await snapshots(root),key=await readFile(join(root,'session-signing-key'));
  const archive=await exportLocalArchive(root);
  expect(archive.projects).toEqual([project]);expect(archive.jobs.find(j=>j.record.id===id)).toMatchObject({owner,record:{candidate,requestHash}});
  expect(archive.jobs.find(j=>j.record.id===runningId)?.record.status).toBe('interrupted');
  expect(archive.sessionKeyHash).toBe(createHash('sha256').update(key).digest('hex'));
  expect(JSON.stringify(archive)).not.toContain(key.toString('hex'));
  expect(await snapshots(root)).toEqual(before);
 }));
 it.each(['project-extra','revision-extra','job-extra','cancelled-candidate','invalid-failure-code'])('rejects %s without dropping fields or changing original bytes',async kind=>fixture(async root=>{
  if(kind==='project-extra'||kind==='revision-extra'){
   const repo=new LocalProjectRepository(join(root,'projects'));
   const project=await repo.create(owner,'<h1>保留原文</h1>');
   const path=join(root,'projects',`${project.id}.json`);
   const raw=JSON.parse(await readFile(path,'utf8'));
   if(kind==='project-extra')raw.unrecognizedMetadata={mustNotDisappear:true};
   else raw.revisions[0].unrecognizedMetadata={mustNotDisappear:true};
   await writeFile(path,JSON.stringify(raw));
  }else{
   const path=join(root,'sessions',owner.id);await mkdir(path,{recursive:true});
   const id=randomUUID(),date=new Date().toISOString();
   const raw:Record<string,unknown>={id,status:'cancelled',createdAt:date,updatedAt:date};
   if(kind==='job-extra')raw.unrecognizedMetadata={mustNotDisappear:true};
   if(kind==='cancelled-candidate')raw.candidate={unexpected:'must-not-disappear'};
   if(kind==='invalid-failure-code'){raw.status='failed';raw.failureCode='unknown-private-provider-data';}
   await writeFile(join(path,`${id}.json`),JSON.stringify(raw));
  }
  const before=await snapshots(root);
  await expect(exportLocalArchive(root)).rejects.toThrow('归档失败');
  expect(await snapshots(root)).toEqual(before);
 }));
 it('rejects a running writer and never creates a missing source directory',async()=>fixture(async root=>{
  const release=await acquireStateLock(root);try{await expect(exportLocalArchive(root)).rejects.toThrow('归档失败');}finally{release();}
  const missing=join(root,'does-not-exist');await expect(exportLocalArchive(missing)).rejects.toThrow('归档失败');await expect(lstat(missing)).rejects.toMatchObject({code:'ENOENT'});
 }));
 it.each(['root-job','unknown-dir','invalid-job','symlink-dir','symlink-file'])('rejects %s instead of silently omitting records',async kind=>fixture(async root=>{
  const sessions=join(root,'sessions'),path=join(sessions,owner.id);await mkdir(path,{recursive:true});
  if(kind==='root-job')await writeFile(join(root,`${randomUUID()}.json`),'{}');
  if(kind==='unknown-dir')await mkdir(join(root,'unexpected'));
  if(kind==='invalid-job')await writeFile(join(path,`${randomUUID()}.json`),'{invalid');
  if(kind==='symlink-dir'){await rm(sessions,{recursive:true});await symlink(root,sessions);}
  if(kind==='symlink-file')await symlink(join(root,'session-signing-key'),join(path,`${randomUUID()}.json`));
  await expect(exportLocalArchive(root)).rejects.toThrow('归档失败');
 }));
});
