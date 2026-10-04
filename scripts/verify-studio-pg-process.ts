/** Opt-in live-model smoke. Uses only an isolated temporary cluster and state directory. */
import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import { createServer } from 'node:net';
import { spawn,execFileSync,type ChildProcess } from 'node:child_process';
import { inspectHtml } from '../src/html';

if(!process.argv.includes('--live-key-from-5199'))throw new Error('Explicit live smoke flag required');
let stage='credential-check';
async function port(){const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const p=(s.address() as {port:number}).port;await new Promise<void>(r=>s.close(()=>r()));return p;}
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const children=new Set<ChildProcess>();
async function stop(child:ChildProcess){
 if(child.exitCode!==null||child.signalCode!==null){children.delete(child);return;}
 await new Promise<void>(r=>{const timeout=setTimeout(()=>child.kill('SIGKILL'),3000);child.once('exit',()=>{clearTimeout(timeout);r();});child.kill('SIGTERM');});children.delete(child);
}
function launch(file:string,env:NodeJS.ProcessEnv,args:string[]=[]){const child=spawn(process.execPath,[resolve('dist-studio-agent',file),...args],{env,stdio:'ignore'});children.add(child);return child;}
async function waitExit(child:ChildProcess){await new Promise<void>((r,j)=>{child.once('error',()=>j(new Error('spawn-failed')));child.once('exit',code=>code===0?r():j(new Error('child-failed')));});children.delete(child);}
let engine:EmbeddedPostgres|undefined;let root:string|undefined;
try{
 const pids=execFileSync('lsof',['-t','-iTCP:5199','-sTCP:LISTEN'],{encoding:'utf8'}).trim().split(/\s+/);
 if(pids.length!==1||!/^\d+$/.test(pids[0]!))throw new Error('listener-not-unique');
 const processEnvironment=execFileSync('ps',['eww','-p',pids[0]!,'-o','command='],{encoding:'utf8'});
 const key=processEnvironment.match(/(?:^|\s)ARK_API_KEY=([^\s]+)/)?.[1];
 if(!key)throw new Error('listener-has-no-key');
 root=await mkdtemp(join(tmpdir(),'studio-pg-process-'));
 const dbPort=await port(),apiPort=await port(),password=randomBytes(24).toString('hex');
 stage='cluster-start';
 engine=new EmbeddedPostgres({databaseDir:join(root,'data'),port:dbPort,user:'postgres',password,persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1','-k',root],onLog:()=>{},onError:()=>{},createPostgresUser:false});
 await engine.initialise();await engine.start();await engine.createDatabase('studio_smoke');
 const env={...process.env,ARK_API_KEY:key,STUDIO_AGENT_DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${dbPort}/studio_smoke`,STUDIO_AGENT_STATE_DIR:join(root,'state'),STUDIO_AGENT_PORT:String(apiPort)};
 stage='explicit-migrate';await waitExit(launch('pg-migrate.mjs',env,['migrate']));
 const url=`http://127.0.0.1:${apiPort}`;
 async function waitHealth(){for(let i=0;i<100;i++){try{if((await fetch(`${url}/health`)).ok)return;}catch{}await delay(50);}throw new Error('health-timeout');}
 let api=launch('server.mjs',env);await waitHealth();let cookie='';
 async function post(path:string,body:unknown){const response=await fetch(`${url}/api/studio-agent${path}`,{method:'POST',headers:{Origin:url,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});const next=response.headers.get('set-cookie');if(next)cookie=next.split(';')[0]!;if(!response.ok)throw new Error(`http-${response.status}`);return response.json();}
 stage='create-project';
 const source='<h1>服务交接试点</h1><p>先在一个团队试行四周，再根据交付质量和处理时间评估效果。</p>';
 const {project}=await post('/projects/create',{id:randomUUID(),source});
 const id=randomUUID();stage='enqueue-without-worker';
 const {job}=await post('/jobs/start',{id,projectId:project.id,baseRevision:project.headRevision,targetId:inspectHtml(source).targets[0]!.id,instruction:'把标题改得更明确，突出四周试点。仅修改标题。'});
 if(job.status!=='queued')throw new Error('not-queued');
 stage='api-restart';await stop(api);api=launch('server.mjs',env);await waitHealth();
 const restored=await post('/jobs/query',{id});if(restored.job.status!=='queued')throw new Error('queue-not-preserved');
 console.log(JSON.stringify({phase:'api-restart',queuedPreserved:true,isolated:true}));
 stage='live-worker';launch('pg-worker.mjs',env);
 let terminal:any;
 for(let i=0;i<300;i++){terminal=(await post('/jobs/query',{id})).job;if(!['queued','running'].includes(terminal.status))break;await delay(500);}
 if(terminal?.status!=='candidate'){console.log(JSON.stringify({phase:'live-worker',status:terminal?.status,failureCode:terminal?.failureCode,providerStatus:terminal?.providerStatus}));throw new Error('candidate-unavailable');}
 stage='accept-repeat';const accepted=await post('/projects/accept',{projectId:project.id,jobId:id});const repeated=await post('/projects/accept',{projectId:project.id,jobId:id});
 const final=(await post('/projects/read',{projectId:project.id})).project;
 if(final.revisions.length!==2||accepted.revision.id!==repeated.revision.id)throw new Error('accept-not-idempotent');
 const latest=final.revisions.at(-1);if(!latest.source.includes('<p>先在一个团队试行四周，再根据交付质量和处理时间评估效果。</p>')||latest.source===source)throw new Error('source-check-failed');
 console.log(JSON.stringify({phase:'complete',model:'real-ark',apiAndWorkerSeparate:true,queuedSurvivesApiRestart:true,accepted:true,repeatedAcceptSameRevision:true,revisionCount:2,unselectedSourcePreserved:true}));
}catch{
 console.log(JSON.stringify({phase:'failed',stage}));process.exitCode=1;
}finally{
 await Promise.all([...children].map(stop));
 if(engine)await engine.stop().catch(()=>{});
 if(root)await rm(root,{recursive:true,force:true});
 console.log(JSON.stringify({phase:'cleanup',childrenRemaining:children.size,temporaryClusterRemoved:true}));
}
