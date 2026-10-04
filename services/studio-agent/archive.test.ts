import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile, writeFile, stat, symlink, link, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { validateArchivePayload, archiveFingerprint, readArchiveFile, writeArchiveFile, readSessionKeyHash } from './archive';
import type { StudioArchivePayload } from './archive-types';
import { projectSourceHash } from './projects';
import { buildCandidate } from './candidate';
import { inspectHtml } from '../../src/html';
import { applyProposal } from '../../src/studio-model';
function fixture():StudioArchivePayload{
 const source='<h1>课程目标</h1><p>保留证据。</p>',owner={kind:'anonymous' as const,id:'a'.repeat(64)};
 const id=randomUUID(),base={id:randomUUID(),parentId:null,source,sourceHash:projectSourceHash(source),createdAt:new Date().toISOString()};
 const jobId=randomUUID(),candidate=buildCandidate({id:base.id,source,label:''},inspectHtml(source).targets[0]!.id,'用证据进行判断');
 const nextSource=applyProposal({id:base.id,source,label:''},candidate);
 const revision={id:randomUUID(),parentId:base.id,source:nextSource,sourceHash:projectSourceHash(nextSource),createdAt:base.createdAt,acceptedJobId:jobId,candidateHash:projectSourceHash(JSON.stringify([candidate.baseId,candidate.baseSource,candidate.targetId,candidate.before,candidate.after]))};
 return {format:'opendesign-studio-archive',version:1,createdAt:base.createdAt,sessionKeyHash:'b'.repeat(64),projects:[{id,owner,headRevision:revision.id,revisions:[base,revision]}],jobs:[{owner,record:{id:jobId,status:'candidate',createdAt:base.createdAt,updatedAt:base.createdAt,requestHash:'c'.repeat(64),binding:{owner,projectId:id,baseRevision:base.id},candidate}}]};
}
async function temporary(test:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'studio-archive-'));try{await test(root);}finally{await rm(root,{recursive:true,force:true});}}
describe('private Studio archive validation and publication',()=>{
 it('preserves source, history, ownership, candidate and receipt through private file roundtrip',()=>temporary(async root=>{
  const original=fixture(),path=join(root,'backup.json');await writeArchiveFile(path,original);
  expect(await readArchiveFile(path)).toEqual(original);expect((await stat(path)).mode&0o777).toBe(0o600);
  expect((await readFile(path,'utf8')).includes('session-signing-key')).toBe(false);
 }));
 it('rejects checksum changes and corrupt source hashes, even with a recomputed checksum',()=>temporary(async root=>{
  const original=fixture(),path=join(root,'backup.json');await writeArchiveFile(path,original);
  const file=JSON.parse(await readFile(path,'utf8'));file.payload.projects[0].revisions[0].source='<h1>Changed</h1>';
  await writeFile(path,JSON.stringify(file));await expect(readArchiveFile(path)).rejects.toThrow();
  file.sha256=archiveFingerprint(file.payload);await writeFile(path,JSON.stringify(file));await expect(readArchiveFile(path)).rejects.toThrow();
 }));
 it('refuses overwrite, leaves prior bytes untouched and cleans temporary output',()=>temporary(async root=>{
  const path=join(root,'backup.json');await writeArchiveFile(path,fixture());const before=await readFile(path);
  await expect(writeArchiveFile(path,fixture())).rejects.toThrow();expect(await readFile(path)).toEqual(before);expect(await readdir(root)).toEqual(['backup.json']);
 }));
 it('rejects symlink and hardlink archives and session keys',()=>temporary(async root=>{
  const archive=join(root,'backup.json');await writeArchiveFile(archive,fixture());const alias=join(root,'alias.json');await symlink(archive,alias);await expect(readArchiveFile(alias)).rejects.toThrow();
  await rm(alias);await link(archive,alias);await expect(readArchiveFile(archive)).rejects.toThrow();
  const key=join(root,'session-signing-key'),real=join(root,'key');await writeFile(real,Buffer.alloc(32,1));await symlink(real,key);await expect(readSessionKeyHash(root)).rejects.toThrow();
  await rm(key);await link(real,key);await expect(readSessionKeyHash(root)).rejects.toThrow();
 }));
 it('rejects duplicate identifiers, missing binding projects, wrong owners and unfinished jobs',()=>{
  const duplicate=fixture();duplicate.jobs.push(duplicate.jobs[0]!);expect(()=>validateArchivePayload(duplicate)).toThrow();
  const missing=fixture();missing.projects=[];expect(()=>validateArchivePayload(missing)).toThrow();
  const owner=fixture();owner.jobs[0]!.owner={kind:'anonymous',id:'other'};expect(()=>validateArchivePayload(owner)).toThrow();
  const running=fixture();running.jobs[0]!.record.status='running';expect(()=>validateArchivePayload(running)).toThrow();
 });
 it('rejects a receipt whose resulting source differs from the candidate',()=>{
  const archive=fixture(),project=archive.projects[0]!,last=project.revisions[1]!;
  const source='<h1>A different edit</h1><p>保留证据。</p>';
  archive.projects[0]={...project,revisions:[project.revisions[0]!,{...last,source,sourceHash:projectSourceHash(source)}]};
  expect(()=>validateArchivePayload(archive)).toThrow();
 });
 it('retains receipts after job cleanup and refuses unknown project fields',()=>{
  const archive=fixture();archive.jobs=[];expect(validateArchivePayload(archive).projects).toEqual(archive.projects);
  Object.assign(archive.projects[0]!,{hidden:'must not be silently dropped'});expect(()=>validateArchivePayload(archive)).toThrow();
 });
});
