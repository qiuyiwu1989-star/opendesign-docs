import { createStudioPostgresPool, migrateStudioPostgres, verifyStudioPostgres, rollbackEmptyStudioPostgres } from './pg-core';
const action = process.argv[2];
const commands = { migrate: migrateStudioPostgres, verify: verifyStudioPostgres, 'rollback-empty': rollbackEmptyStudioPostgres };
if (process.argv.length !== 3 || !action || !Object.hasOwn(commands, action)) {
  console.error('Usage: pg-migrate <migrate|verify|rollback-empty>'); process.exitCode = 2;
} else if (!process.env.STUDIO_AGENT_DATABASE_URL) {
  console.error('Studio database URL is not configured.'); process.exitCode = 2;
} else {
  let pool: ReturnType<typeof createStudioPostgresPool> | undefined;
  try {
    pool = createStudioPostgresPool(process.env.STUDIO_AGENT_DATABASE_URL);
    await commands[action as keyof typeof commands](pool);
    console.log(`Studio database ${action} completed.`);
  } catch {
    // Connection strings, SQL contents and raw driver messages can contain secrets.
    console.error('Studio database operation failed. Check configuration, schema and data before retrying.'); process.exitCode = 1;
  } finally { await pool?.end().catch(() => { process.exitCode = 1; }); }
}
