import {randomUUID} from 'node:crypto';
import {inspectHtml} from '../src/html';
if(!process.argv.includes('--live'))throw new Error('Explicit --live required: this creates a synthetic project and calls the model once.');
const origin='https://doc.opendesign.cc';
let cookie='';
const post=async(path:string,body:unknown,owned=true,requestOrigin=origin)=>{
 const response=await fetch(`${origin}/api/studio-agent${path}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:requestOrigin,...(owned&&cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 const set=response.headers.get('set-cookie');if(owned&&set){if(!/; Secure(?:;|$)/i.test(set)||!/; HttpOnly(?:;|$)/i.test(set)||!/SameSite=Strict/i.test(set))throw new Error('Cookie attributes failed');cookie=set.split(';')[0]!;}
 return response;
};
const json=async(path:string,body:unknown)=>{const r=await post(path,body);if(!r.ok)throw new Error(`HTTP ${r.status} at ${path}`);return r.json();};
let stage='origin-check';
try{
 if((await post('/jobs/list',{},false,'https://invalid.example')).status!==403)throw new Error('Foreign origin allowed');
 stage='create';const source='<h1>企业试点提案</h1><p>先在一个团队试行四周，再根据交付质量和处理时间评估效果。</p>';
 const {project}=await json('/projects/create',{id:randomUUID(),source});
 if((await post('/projects/read',{projectId:project.id},false)).status!==404)throw new Error('Owner isolation failed');
 stage='generate';const id=randomUUID();const request={id,projectId:project.id,baseRevision:project.headRevision,targetId:inspectHtml(source).targets[0]!.id,instruction:'将标题改得更明确，突出四周企业试点，控制在20字以内。仅修改标题。'};
 await json('/jobs/start',request);
 let job;
 for(let i=0;i<180;i++){job=(await json('/jobs/query',{id})).job;if(!['queued','running'].includes(job.status))break;await new Promise(r=>setTimeout(r,1000));}
 if(job?.status!=='candidate')throw new Error(`Model did not complete: ${job?.status}/${job?.failureCode??''}`);
 stage='accept';const accepted=await json('/projects/accept',{projectId:project.id,jobId:id});const again=await json('/projects/accept',{projectId:project.id,jobId:id});
 const restored=(await json('/projects/read',{projectId:project.id})).project;
 if(restored.revisions.length!==2||accepted.revision.id!==again.revision.id||restored.headRevision!==accepted.revision.id||!accepted.revision.source.includes('<p>先在一个团队试行四周，再根据交付质量和处理时间评估效果。</p>')||accepted.revision.source===source)throw new Error('Roundtrip failed');
 console.log(JSON.stringify({ok:true,origin,projectId:project.id,jobId:id,versionCount:2,realModel:true,foreignOriginBlocked:true,anonymousIsolation:true,secureCookie:true,sourcePreserved:true,repeatedAcceptIdempotent:true}));
}catch(error){console.log(JSON.stringify({ok:false,stage,error:error instanceof Error?error.message:'Unknown'}));process.exitCode=1;}
