import {createServer,type IncomingMessage} from 'node:http';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,open,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateLibrary} from '../../src/thinking-workspace';
import {acquireStateLock} from '../studio-agent/state-lock';
import {versionRoute} from '../thinking-canvas/versions';

export type Config={origin:string;username:string;passwordHash:string;dataDir:string;secureCookies?:boolean;sessionMs?:number};
type Workspace={revision:string|null;library:unknown|null;updatedAt?:string};
const MAX=120_000_000;
export function hashPassword(password:string,salt=randomBytes(16).toString('hex')){return `scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`;}
function validPasswordHash(hash:string){return /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash);}
function matches(password:string,hash:string){const [,salt,key]=hash.split('$');const calculated=scryptSync(password,salt!,64);return timingSafeEqual(calculated,Buffer.from(key!,'hex'));}
async function atomicWrite(path:string,body:string){const tmp=path+'.'+randomUUID()+'.tmp';const file=await open(tmp,'wx',0o600);try{await file.writeFile(body);await file.sync();}finally{await file.close();}await rename(tmp,path);const directory=await open(resolve(path,'..'),'r');try{await directory.sync();}finally{await directory.close();}}
class HttpError extends Error{constructor(public status:number,message:string){super(message);}}
async function json(req:IncomingMessage,max=MAX):Promise<any>{if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'JSON required');let size=0;const chunks:Buffer[]=[];for await(const raw of req){const chunk=Buffer.from(raw);size+=chunk.length;if(size>max)throw new HttpError(413,'Request too large');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'Invalid JSON');}}
export async function createCloudServer(config:Config){
 if(!validPasswordHash(config.passwordHash)||!config.username)throw Error('Configure username and scrypt password hash');
 if(new URL(config.origin).origin!==config.origin)throw Error('Origin must be an exact URL origin');
 if(config.secureCookies!==false&&!config.origin.startsWith('https://'))throw Error('HTTPS origin required');
 await mkdir(config.dataDir,{recursive:true,mode:0o700});await mkdir(join(config.dataDir,'history'),{recursive:true,mode:0o700});
 const path=join(config.dataDir,'workspace.json');
 const read=async():Promise<Workspace>=>{try{const stored=JSON.parse(await readFile(path,'utf8')) as Workspace;if(typeof stored.revision!=='string'||!stored.revision||typeof stored.updatedAt!=='string')throw Error('Invalid persisted workspace');validateLibrary(stored.library);return stored;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {revision:null,library:null};throw e;}};
 await read(); // Fail closed on a corrupt existing workspace.
 const releaseLock=await acquireStateLock(config.dataDir);
 const sessions=new Map<string,number>();const attempts=new Map<string,{count:number;until:number}>();let queue=Promise.resolve();
 const cookieName=config.secureCookies===false?'thinking_session':'__Host-thinking_session';
 const cookie=(token:string,age:number)=>`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${config.secureCookies===false?'':'; Secure'}`;
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json; charset=utf-8');
  const reply=(code:number,value:unknown)=>{res.statusCode=code;res.end(JSON.stringify(value));};
  try{
   const url=new URL(req.url??'/',config.origin);const route=url.pathname;
   const mutation=!['GET','HEAD','OPTIONS'].includes(req.method??'');
   if(mutation&&req.headers.origin!==config.origin)throw new HttpError(403,'Origin rejected');
   const now=Date.now();for(const [key,expiry] of sessions)if(expiry<=now)sessions.delete(key);
   const token=(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
   const authenticated=!!token&&(sessions.get(token)??0)>now;
   if(route==='/api/thinking-cloud/session'&&req.method==='GET')return reply(200,authenticated?{authenticated:true,username:config.username}:{authenticated:false});
   if(route==='/api/thinking-cloud/login'&&req.method==='POST'){
    // Global account limit as well as socket peer limit: reverse proxy addresses cannot bypass throttling.
    const peer=req.socket.remoteAddress??'unknown';for(const [key,item]of attempts)if(item.until<=now)attempts.delete(key);
    if([peer,'account'].some(k=>(attempts.get(k)?.count??0)>=10))throw new HttpError(429,'Too many login attempts; retry in 15 minutes');
    const body=await json(req,8192);if(typeof body?.username!=='string'||typeof body?.password!=='string')throw new HttpError(400,'Credentials required');
    const correct=matches(body.password,config.passwordHash)&&body.username===config.username;
    if(!correct){for(const k of [peer,'account']){const item=attempts.get(k)??{count:0,until:now+900000};item.count++;attempts.set(k,item);}throw new HttpError(401,'Invalid credentials');}
    const newToken=randomBytes(32).toString('hex');if(token)sessions.delete(token);if(sessions.size>=100)sessions.delete(sessions.keys().next().value!);const life=config.sessionMs??604800000;sessions.set(newToken,now+life);res.setHeader('Set-Cookie',cookie(newToken,Math.floor(life/1000)));return reply(200,{authenticated:true,username:config.username});
   }
   if(!authenticated)throw new HttpError(401,'Sign in required');
   if(route==='/api/thinking-cloud/logout'&&req.method==='POST'){sessions.delete(token!);res.setHeader('Set-Cookie',cookie('',0));return reply(200,{authenticated:false});}
   if(route==='/api/thinking-cloud/workspace'&&req.method==='GET')return reply(200,await read());
   if(route==='/api/thinking-cloud/workspace'&&req.method==='PUT'){
    const body=await json(req);if(!(body?.expectedRevision===null||typeof body?.expectedRevision==='string'))throw new HttpError(400,'expectedRevision required');
    try{validateLibrary(body.library);}catch{throw new HttpError(400,'Invalid workspace');}
    let release!:()=>void;const previous=queue;queue=new Promise<void>(r=>{release=r;});await previous;
    try{
     const current=await read();if(current.revision!==body.expectedRevision)return reply(409,{error:'conflict',revision:current.revision});
     const next:Workspace={revision:randomUUID(),updatedAt:new Date().toISOString(),library:body.library};const serialized=JSON.stringify(next);
     const history=await open(join(config.dataDir,'history',next.revision+'.json'),'wx',0o600);try{await history.writeFile(serialized);await history.sync();}finally{await history.close();}
     const historyDir=await open(join(config.dataDir,'history'),'r');try{await historyDir.sync();}finally{await historyDir.close();}
     await atomicWrite(path,serialized);return reply(200,next);
    }finally{release();}
   }
   if(route==='/api/thinking-canvas/versions')return await versionRoute(join(config.dataDir,'versions'),req,res,url,url.searchParams.get('board')??'');
   return reply(404,{error:'Not found'});
  }catch(e){if(!res.writableEnded)reply(e instanceof HttpError?e.status:500,{error:e instanceof HttpError?e.message:'Storage unavailable'});}
 });
 server.once('close',releaseLock);
 server.once('error',releaseLock); // Bind failure must not leave the directory reserved.
 server.requestTimeout=120000;server.headersTimeout=15000;
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const server=await createCloudServer({origin:process.env.THINKING_CLOUD_ORIGIN??'',username:process.env.THINKING_CLOUD_USERNAME??'',passwordHash:process.env.THINKING_CLOUD_PASSWORD_HASH??'',dataDir:process.env.THINKING_CLOUD_DATA_DIR??'/var/lib/opendesign-thinking'});
 server.listen(Number(process.env.THINKING_CLOUD_PORT??5206),'127.0.0.1',()=>console.log('Thinking cloud listening on loopback'));
}
