import EmbeddedPostgres from 'embedded-postgres';
import pg, {type Pool} from 'pg';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {afterAll} from 'vitest';
import {migrateStudioPostgres} from './pg-core';
let cluster:Promise<{engine:EmbeddedPostgres;root:string;port:number;password:string}>|undefined;
async function start(){
 const root=await mkdtemp(join(tmpdir(),'studio-pg-test-'));
 const socket=createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));
 const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
 const password=randomBytes(24).toString('hex');
 const engine=new EmbeddedPostgres({databaseDir:join(root,'data'),port,user:'postgres',password,persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1','-k',root],onLog:()=>{},onError:()=>{},createPostgresUser:false});
 try{await engine.initialise();await engine.start();return {engine,root,port,password};}catch(error){await engine.stop().catch(()=>{});await rm(root,{recursive:true,force:true});throw error;}
}
afterAll(async()=>{if(cluster){const c=await cluster;await c.engine.stop();await rm(c.root,{recursive:true,force:true});}},30000);
export async function withTestPostgres(test:(pool:Pool)=>Promise<void>):Promise<void>{
 const c=await(cluster??=start());const name='studio_'+randomUUID().replaceAll('-','');
 await c.engine.createDatabase(name);
 const pool=new pg.Pool({host:'127.0.0.1',port:c.port,user:'postgres',password:c.password,database:name,max:8,connectionTimeoutMillis:5000});
 try{await migrateStudioPostgres(pool);await test(pool);}finally{await pool.end();await c.engine.dropDatabase(name);}
}
