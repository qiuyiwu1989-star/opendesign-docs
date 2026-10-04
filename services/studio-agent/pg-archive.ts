import type { Pool, PoolClient } from 'pg';
import { pgTransaction } from './pg-core';
import { validateArchivePayload } from './archive';
import type { StudioArchivePayload } from './archive-types';
import type { JobRecord } from './jobs';
import { assertProjectAccess } from './access';
async function schema(client: PoolClient): Promise<void> {
  const result = await client.query('SELECT version FROM studio_agent.schema_version ORDER BY version');
  if (result.rows.length !== 1 || result.rows[0]?.version !== 1) throw new Error('Unsupported Studio archive schema');
}
/** Snapshot only: callers must stop writers/workers before operator backup. */
export async function exportPostgresArchive(pool: Pool, sessionKeyHash: string): Promise<StudioArchivePayload> {
  return pgTransaction(pool, async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await schema(client);
    const active = await client.query("SELECT 1 FROM studio_agent.jobs WHERE status IN ('queued','running') OR (lease_token IS NOT NULL AND (lease_until IS NULL OR lease_until>clock_timestamp())) LIMIT 1");
    if (active.rowCount) throw new Error('Cannot archive active Studio jobs');
    const projects = await client.query('SELECT id,owner_kind,owner_id,document FROM studio_agent.projects ORDER BY id');
    for (const row of projects.rows) { if(row.document?.id!==row.id)throw new Error('Project archive identity mismatch'); assertProjectAccess({ kind: row.owner_kind, id: row.owner_id }, { id: row.id, owner: row.document?.owner }); }
    const jobs = await client.query('SELECT owner_kind,owner_id,id,project_id,status,request_hash,binding,candidate,failure_code,provider_status,created_at,updated_at FROM studio_agent.jobs ORDER BY owner_kind,owner_id,id');
    const payload: StudioArchivePayload = {
      format: 'opendesign-studio-archive', version: 1, createdAt: new Date().toISOString(), sessionKeyHash,
      projects: projects.rows.map(row => row.document),
      jobs: jobs.rows.map(row => {
        if(row.project_id !== (row.binding?.projectId ?? null))throw new Error('Job archive project mismatch');
        const record: JobRecord = { id: row.id, status: row.status, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), requestHash: row.request_hash };
        if (row.binding !== null) record.binding = row.binding;
        if (row.status === 'candidate') record.candidate = row.candidate;
        if (row.status === 'failed') {
          record.error = '生成未完成，请重试。作品未修改。';
          if (row.failure_code !== null) record.failureCode = row.failure_code;
          if (row.provider_status !== null) record.providerStatus = row.provider_status;
        }
        if (row.status === 'interrupted') record.error = '执行租约已失效，请重新生成。作品未修改。';
        return { owner: { kind: row.owner_kind, id: row.owner_id }, record };
      }),
    };
    return validateArchivePayload(payload);
  });
}
/** Never merges or overwrites: the entire restore is one locked transaction. */
export async function restorePostgresArchive(pool: Pool, value: StudioArchivePayload): Promise<{ projects: number; jobs: number }> {
  const payload = validateArchivePayload(value);
  return pgTransaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock(871941,1)');
    await client.query('LOCK TABLE studio_agent.projects,studio_agent.jobs,studio_agent.schema_version IN ACCESS EXCLUSIVE MODE');
    await schema(client);
    const count = await client.query('SELECT (SELECT count(*) FROM studio_agent.projects)+(SELECT count(*) FROM studio_agent.jobs) AS total');
    if (Number(count.rows[0]?.total) !== 0) throw new Error('Archive restore requires an empty Studio database');
    for (const project of payload.projects) await client.query('INSERT INTO studio_agent.projects(id,owner_kind,owner_id,document) VALUES($1,$2,$3,$4::jsonb)', [project.id, project.owner.kind, project.owner.id, JSON.stringify(project)]);
    for (const { owner, record } of payload.jobs) {
      await client.query(`INSERT INTO studio_agent.jobs(owner_kind,owner_id,id,project_id,status,request_hash,binding,candidate,failure_code,provider_status,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)`,
        [owner.kind, owner.id, record.id, record.binding?.projectId ?? null, record.status, record.requestHash ?? '0'.repeat(64), record.binding ? JSON.stringify(record.binding) : null, record.candidate ? JSON.stringify(record.candidate) : null, record.failureCode ?? null, record.providerStatus ?? null, record.createdAt, record.updatedAt]);
    }
    return { projects: payload.projects.length, jobs: payload.jobs.length };
  });
}
