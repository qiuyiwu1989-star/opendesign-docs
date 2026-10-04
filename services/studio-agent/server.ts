import { realpathSync } from 'node:fs';
import { createStudioPostgresPool } from './pg-core';
import { runInWorker } from './worker-executor';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createStudioAgentService, type StudioAgentServiceOptions } from './http-service';

export function createStudioAgentServer(options: StudioAgentServiceOptions = {}) {
  const service = createStudioAgentService({...options,execute:options.execute ?? runInWorker});
  const server = createServer((req,res) => {
    const json = (status: number, body: unknown) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body)); };
    if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) {json(403,{error:'Local only'});return;}
    if(req.method==='GET' && req.url==='/health') {void service.health().then(()=>json(200,{ok:true}),()=>json(503,{ok:false}));return;}
    const prefix='/api/studio-agent';
    if(!req.url?.startsWith(`${prefix}/`)) {json(404,{error:'Not found'});return;}
    req.url=req.url.slice(prefix.length);
    void service.handle(req,res).catch(() => {if(!res.destroyed&&!res.writableEnded)json(500,{error:'Service unavailable'});});
  });
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => closing ??= (async () => {
    const stopped = new Promise<void>((resolve,reject) => {
      if(!server.listening){resolve();return;}
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    await Promise.all([service.close(),stopped]);
  })();
  return { server, close, ready:service.ready };
}

if(process.argv[1] && import.meta.url===pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  const port=Number(process.env.STUDIO_AGENT_PORT ?? 5198);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid local service port');
  const postgresPool=process.env.STUDIO_AGENT_DATABASE_URL ? createStudioPostgresPool(process.env.STUDIO_AGENT_DATABASE_URL) : undefined;
  const app=createStudioAgentServer({...postgresPool?{postgresPool}:{},...(process.env.STUDIO_AGENT_PUBLIC_ORIGIN!==undefined?{publicOrigin:process.env.STUDIO_AGENT_PUBLIC_ORIGIN}:{})});
  let poolClosing:Promise<void>|undefined;
  const close=async()=>{try{await app.close();}finally{if(postgresPool)await(poolClosing??=postgresPool.end());}};
  let stopping=false;
  void app.ready.then(() => {if(stopping)return;app.server.listen(port,'127.0.0.1',()=>console.log(`Studio Agent local service http://127.0.0.1:${port}`));}).catch(async () => {console.error('Studio Agent initialization failed.');process.exitCode=1;await close();});
  const stop=()=>{stopping=true;void close().catch(()=>{process.exitCode=1;});};
  app.server.once('error',()=>{console.error('Studio Agent could not listen.');process.exitCode=1;stop();});
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
