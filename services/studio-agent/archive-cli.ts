import { realpathSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname, basename, sep, join as joinResolved } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStudioPostgresPool, verifyStudioPostgres } from './pg-core';
import { exportLocalArchive } from './local-archive';
import { exportPostgresArchive, restorePostgresArchive } from './pg-archive';
import { readArchiveFile, writeArchiveFile, readSessionKeyHash, requireExistingStateDirectory, archiveFingerprint } from './archive';
import { acquireStateLock } from './state-lock';

/** Operator-only tool; never mounted as an HTTP endpoint. No secrets or HTML in logs. */
export async function runArchiveCli(args:string[],env:NodeJS.ProcessEnv=process.env):Promise<void>{
 const [action,path,flag,stateDirectory]=args;
 const actions=['inspect','export-local','backup-postgres','restore-postgres'];
 if(!action||!actions.includes(action)||!path||path.startsWith('--')||
  (action==='inspect'?args.length!==2:args.length!==4||flag!=='--state-dir'||!stateDirectory))throw new Error('Invalid archive command');
 let pool:ReturnType<typeof createStudioPostgresPool>|undefined,release:(()=>void)|undefined;
 try{
  if(action==='inspect'){
   const payload=await readArchiveFile(path);
   console.log(JSON.stringify({action,projects:payload.projects.length,jobs:payload.jobs.length,createdAt:payload.createdAt,sha256:archiveFingerprint(payload)}));return;
  }
  const root=resolve(stateDirectory!);await requireExistingStateDirectory(root);
  if(action==='export-local'||action==='backup-postgres'){
   const target=joinResolved(await realpath(dirname(resolve(path))),basename(path));
   const child=relative(await realpath(root),target);
   if(child===''||(!(child==='..'||child.startsWith(`..${sep}`))&&!isAbsolute(child)))throw new Error('Archive destination must be outside the state directory');
  }
  if(action==='export-local'){
   const payload=await exportLocalArchive(root);await writeArchiveFile(path,payload);
   console.log(JSON.stringify({action,projects:payload.projects.length,jobs:payload.jobs.length,sha256:archiveFingerprint(payload)}));return;
  }
  if(!env.STUDIO_AGENT_DATABASE_URL)throw new Error('Studio database URL is not configured');
  release=await acquireStateLock(root);
  const sessionKeyHash=await readSessionKeyHash(root);
  pool=createStudioPostgresPool(env.STUDIO_AGENT_DATABASE_URL);await verifyStudioPostgres(pool);
  if(action==='backup-postgres'){
   const payload=await exportPostgresArchive(pool,sessionKeyHash);await writeArchiveFile(path,payload);
   console.log(JSON.stringify({action,projects:payload.projects.length,jobs:payload.jobs.length,sha256:archiveFingerprint(payload)}));
  }else{
   const payload=await readArchiveFile(path);
   if(payload.sessionKeyHash!==sessionKeyHash)throw new Error('The archive and existing session key do not match');
   const result=await restorePostgresArchive(pool,payload);
   console.log(JSON.stringify({action,...result,sha256:archiveFingerprint(payload)}));
  }
 }finally{try{await pool?.end();}finally{release?.();}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(resolve(process.argv[1]))).href){
 try{await runArchiveCli(process.argv.slice(2));}
 catch{
  console.error('Studio archive operation failed. Verify arguments, offline state, archive checksum, matching session key and an empty destination database. Existing records were not overwritten.');
  process.exitCode=1;
 }
}
