import pg, { type Pool, type PoolClient } from 'pg';
import { PG_JOBS_SCHEMA_SQL } from './pg-jobs';
export async function pgTransaction<T>(pool:Pool, action:(client:PoolClient)=>Promise<T>):Promise<T>{
 const client=await pool.connect();
 try{await client.query('BEGIN');const result=await action(client);await client.query('COMMIT');return result;}
 catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
 finally{client.release();}
}
export function createStudioPostgresPool(connectionString:string):Pool{
 const pool=new pg.Pool({connectionString,max:8,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,statement_timeout:10000});
 pool.on('error',()=>{ /* Do not log credentials or provider connection bodies. Requests report failure. */ });
 return pool;
}
/** Explicit operator action only. HTTP startup verifies, never migrates. */
export async function migrateStudioPostgres(pool:Pool):Promise<void>{
 await pgTransaction(pool,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(871941,1)');
  await client.query(`CREATE SCHEMA IF NOT EXISTS studio_agent;
   CREATE TABLE IF NOT EXISTS studio_agent.schema_version(version integer PRIMARY KEY);
   CREATE TABLE IF NOT EXISTS studio_agent.projects(
    id uuid PRIMARY KEY, owner_kind text NOT NULL CHECK(owner_kind IN ('anonymous','user')),
    owner_id text NOT NULL, document jsonb NOT NULL);
   CREATE INDEX IF NOT EXISTS studio_projects_owner ON studio_agent.projects(owner_kind,owner_id);`);
  await client.query(PG_JOBS_SCHEMA_SQL);
  await client.query('INSERT INTO studio_agent.schema_version(version) VALUES(1) ON CONFLICT DO NOTHING');
 });
}
export async function verifyStudioPostgres(pool:Pool):Promise<void>{
 const result=await pool.query('SELECT version FROM studio_agent.schema_version ORDER BY version');
 if(result.rows.length!==1||result.rows[0]?.version!==1)throw new Error('Studio database schema is not supported');
 await pool.query('SELECT id,owner_kind,owner_id,document FROM studio_agent.projects LIMIT 0');
 await pool.query('SELECT id,status FROM studio_agent.jobs LIMIT 0');
 await pool.query('SELECT day,owner_key,started FROM studio_agent.daily_usage LIMIT 0');
}
/** Empty isolated database rollback only; refuses populated or unrelated schema content. */
export async function rollbackEmptyStudioPostgres(pool:Pool):Promise<void>{
 await pgTransaction(pool,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(871941,1)');
  await client.query('LOCK TABLE studio_agent.projects,studio_agent.jobs,studio_agent.daily_usage IN ACCESS EXCLUSIVE MODE');
  const count=await client.query('SELECT (SELECT count(*) FROM studio_agent.projects)+(SELECT count(*) FROM studio_agent.jobs)+(SELECT count(*) FROM studio_agent.daily_usage) AS total');
  if(Number(count.rows[0].total)!==0)throw new Error('Refusing rollback: Studio data exists');
  await client.query('DROP TABLE studio_agent.daily_usage; DROP TABLE studio_agent.jobs; DROP TABLE studio_agent.projects; DROP TABLE studio_agent.schema_version; DROP SCHEMA studio_agent');
 });
}
