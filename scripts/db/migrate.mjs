#!/usr/bin/env node

/**
 * scripts/db/migrate.mjs
 *
 * Applies pending SQL migrations in migrations/ in deterministic dependency order
 * against .env.local's database ONLY when explicitly executed, and records them
 * in schema_migrations(filename, applied_at).
 *
 * Also backfills existing applied migrations (verified via information_schema)
 * into schema_migrations so they are tracked without re-running unnecessarily.
 *
 * Usage:
 *   node scripts/db/migrate.mjs --dry-run   # Read-only preview (0 writes)
 *   node scripts/db/migrate.mjs             # Apply pending migrations & record them
 */

import {
  createEnvLocalSqlClient,
  inspectDatabaseSchema,
  evaluateMigrationsStatus,
  splitSqlStatements
} from './_lib.mjs';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const { sql, host } = createEnvLocalSqlClient();

  console.log(`Target database (.env.local): ${host}`);
  if (isDryRun) {
    console.log('Mode: DRY-RUN (read-only — zero writes will be executed)\n');
  }

  const beforeSnapshot = await inspectDatabaseSchema(sql);
  const items = evaluateMigrationsStatus(beforeSnapshot);

  const toBackfill = items.filter((i) => i.status === 'applied_unrecorded');
  const toApply = items.filter((i) => i.status === 'pending');

  if (isDryRun) {
    console.log(`Would ensure table schema_migrations(filename, applied_at) exists.`);
    console.log(`Would backfill ${toBackfill.length} already-applied file(s):`);
    for (const item of toBackfill) {
      console.log(`  [~] ${item.filename}`);
    }
    console.log(`Would apply ${toApply.length} pending migration(s) in order:`);
    for (const item of toApply) {
      const stmts = splitSqlStatements(item.sqlContent);
      console.log(`  [+] ${item.filename} (${stmts.length} SQL statement${stmts.length === 1 ? '' : 's'})`);
    }
    return;
  }

  // 1. Bootstrap schema_migrations table idempotently
  await sql.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // 2. Backfill already-applied baseline migrations into schema_migrations
  for (const item of toBackfill) {
    await sql`
      INSERT INTO schema_migrations (filename)
      VALUES (${item.filename})
      ON CONFLICT (filename) DO NOTHING;
    `;
    console.log(`[BACKFILLED] ${item.filename} (already present in schema)`);
  }

  // 3. Apply pending migrations in canonical order and record each one
  for (const item of toApply) {
    const statements = splitSqlStatements(item.sqlContent);
    console.log(`[APPLYING]   ${item.filename} (${statements.length} statement${statements.length === 1 ? '' : 's'})...`);
    for (const stmt of statements) {
      await sql.query(stmt);
    }
    await sql`
      INSERT INTO schema_migrations (filename, applied_at)
      VALUES (${item.filename}, now())
      ON CONFLICT (filename) DO UPDATE SET applied_at = EXCLUDED.applied_at;
    `;
    console.log(`[APPLIED]    ${item.filename}`);
  }

  // 4. Read-only verification & database size report
  const afterSnapshot = await inspectDatabaseSchema(sql);
  const afterStatus = evaluateMigrationsStatus(afterSnapshot);
  const stillPending = afterStatus.filter((i) => i.status === 'pending');

  console.log('\n===============================================================================');
  console.log('MIGRATION SUMMARY (.env.local)');
  console.log(`- Recorded in schema_migrations: ${afterSnapshot.recordedMigrations.size} / ${afterStatus.length}`);
  console.log(`- Pending migrations remaining:  ${stillPending.length}`);
  console.log(`- Total Neon database size:      ${afterSnapshot.dbSizePretty} (${afterSnapshot.dbSizeBytes.toLocaleString('en-US')} bytes)`);
  console.log('===============================================================================');

  if (stillPending.length > 0) {
    console.error(
      `Warning: ${stillPending.length} migration(s) still report missing objects:`,
      stillPending.map((s) => `${s.filename}: ${s.missing.join(', ')}`)
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Migration execution failed:', err);
  process.exit(1);
});

