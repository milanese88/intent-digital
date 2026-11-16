#!/usr/bin/env node

/**
 * scripts/db/check.mjs
 *
 * Strictly READ-ONLY check against .env.local's Neon PostgreSQL database.
 * Compares every .sql file in migrations/ against schema_migrations (if present)
 * and information_schema / pg_catalog, then reports pending migrations.
 *
 * Usage:
 *   node scripts/db/check.mjs
 *   node scripts/db/check.mjs --sql   # Also prints combined SQL for all pending files
 */

import {
  createEnvLocalSqlClient,
  inspectDatabaseSchema,
  evaluateMigrationsStatus
} from './_lib.mjs';

async function main() {
  const showSql = process.argv.includes('--sql');
  const { sql, host } = createEnvLocalSqlClient();
  const snapshot = await inspectDatabaseSchema(sql);
  const items = evaluateMigrationsStatus(snapshot);

  const applied = items.filter((i) => i.status === 'applied');
  const appliedUnrecorded = items.filter((i) => i.status === 'applied_unrecorded');
  const pending = items.filter((i) => i.status === 'pending');

  console.log(`Database host (.env.local): ${host}`);
  console.log(`Database size:              ${snapshot.dbSizePretty}`);
  console.log(
    `schema_migrations table:    ${snapshot.hasMigrationsTable ? `present (${snapshot.recordedMigrations.size} recorded)` : 'not created yet'}`
  );
  console.log('');

  if (applied.length > 0) {
    console.log(`Applied & recorded (${applied.length}):`);
    for (const item of applied) {
      console.log(`  [✓] ${item.filename}`);
    }
    console.log('');
  }

  if (appliedUnrecorded.length > 0) {
    console.log(`Applied in schema · awaiting backfill into schema_migrations (${appliedUnrecorded.length}):`);
    for (const item of appliedUnrecorded) {
      console.log(`  [~] ${item.filename}`);
    }
    console.log('');
  }

  if (pending.length > 0) {
    console.log(`Pending migrations (${pending.length}):`);
    for (const item of pending) {
      const detail = item.missing.length > 0 ? ` — missing: ${item.missing.join(', ')}` : ' — not recorded in schema_migrations';
      console.log(`  [ ] ${item.filename}${detail}`);
    }
    console.log('');
    console.log(
      `Pending migrations: ${pending.length} (${pending.map((p) => p.filename).join(', ')}) — say apply`
    );
  } else {
    console.log('Pending migrations: 0 (all migrations applied)');
  }

  if (showSql && pending.length > 0) {
    console.log('\n-- ==============================================================================');
    console.log('-- COMBINED IDEMPOTENT SQL FOR PENDING MIGRATIONS');
    console.log('-- ==============================================================================\n');
    for (const item of pending) {
      console.log(`-- >>> BEGIN ${item.filename}`);
      console.log(item.sqlContent.trim());
      console.log(`-- <<< END ${item.filename}\n`);
    }
  }
}

main().catch((err) => {
  console.error('Migration check failed:', err?.message || err);
  process.exit(1);
});

