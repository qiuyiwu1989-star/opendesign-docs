import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { PostgresJobQueue } from './pg-jobs';
import { ArkRequestError } from './ark';
import { runInWorker } from './worker-executor';
import { createStudioPostgresPool, verifyStudioPostgres } from './pg-core';
import type { EditRequest } from './run';
import type { TextProposal } from '../../src/studio-model';
export type PostgresJobExecutor = (request:EditRequest,signal:AbortSignal)=>Promise<TextProposal>;

/** Claims at most one job. Shutdown interrupts it; lease loss never writes a late result. */
export async function processNextPostgresJob(pool:Pool,execute:PostgresJobExecutor,signal:AbortSignal):Promise<boolean>{
 if(signal.aborted)return false;
 const queue=new PostgresJobQueue(pool);
 const lease=await queue.claim();if(!lease)return false;
 const controller=new AbortController();
 let stopped=false;
 const stop=()=>{stopped=true;controller.abort();};
 signal.addEventListener('abort',stop,{once:true});
 if(signal.aborted)stop();
 let pulse:Promise<void>|undefined;
 const timer=setInterval(()=>{
  if(pulse||stopped)return;
  pulse=queue.heartbeat(lease).then(ok=>{if(!ok)stop();},()=>stop()).finally(()=>{pulse=undefined;});
 },1000);
 try{
  if(stopped){await queue.interrupt(lease);return true;}
  try{
   const candidate=await execute(lease.request,controller.signal);
   if(signal.aborted)await queue.interrupt(lease);
   else if(!stopped){if(!await queue.complete(lease,candidate))await queue.fail(lease,'execution');}
  }catch(error){
   if(signal.aborted)await queue.interrupt(lease);
   else if(!stopped)await queue.fail(lease,error instanceof ArkRequestError?error.code:'execution',error instanceof ArkRequestError?error.status:undefined);
  }
 }finally{
  clearInterval(timer);signal.removeEventListener('abort',stop);
  await pulse;
  await queue.release(lease);
 }
 return true;
}
function pause(signal:AbortSignal):Promise<void>{return new Promise(resolve=>{
 if(signal.aborted){resolve();return;}
 const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};
 const timer=setTimeout(done,500);signal.addEventListener('abort',done,{once:true});
});}
export async function runPostgresWorker(pool:Pool,signal:AbortSignal,execute:PostgresJobExecutor=runInWorker):Promise<void>{
 await verifyStudioPostgres(pool);
 while(!signal.aborted){if(!await processNextPostgresJob(pool,execute,signal))await pause(signal);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(resolve(process.argv[1]))).href){
 const connection=process.env.STUDIO_AGENT_DATABASE_URL;
 if(!connection||!process.env.ARK_API_KEY)throw new Error('Worker requires database and model configuration');
 const pool=createStudioPostgresPool(connection);const controller=new AbortController();
 const stop=()=>controller.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);
 void runPostgresWorker(pool,controller.signal).catch(()=>{console.error('Studio worker stopped after a service failure.');process.exitCode=1;}).finally(async()=>{
  process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);await pool.end();
 });
}
