#!/usr/bin/env node

/**
 * backfill-nal-clues.mjs
 *
 * Orchestrates applying migrations/add_comp_details_and_nal_clues.sql and running
 * the batched DOR NAL clues backfill (--backfill-clues) for Broward and Palm Beach,
 * followed by VACUUM (ANALYZE) and a final Neon PostgreSQL storage report (< 1 GB).
 *
 * Usage:
 *   node scripts/county/backfill-nal-clues.mjs --dry-run
 *   node scripts/county/backfill-nal-clues.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const envLocalPath = path.resolve(PROJECT_ROOT, '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

function formatBytes(bytes) {
  const num = Number(bytes) || 0;
  if (num >= 1024 * 1024 * 1024) {
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const migrationPath = path.resolve(PROJECT_ROOT, 'migrations/add_comp_details_and_nal_clues.sql');
  const importScriptPath = path.resolve(__dirname, 'import-roll.mjs');

  if (!isDryRun) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('[!] DATABASE_URL is missing in .env.local');
      process.exit(1);
    }

    const { Pool } = await import('@neondatabase/serverless');
    const pool = new Pool({ connectionString: dbUrl });
    try {
      const sqlText = fs.readFileSync(migrationPath, 'utf8');
      console.log('--- [1/4] Applying migrations/add_comp_details_and_nal_clues.sql ---');
      await pool.query(sqlText);
      console.log('[✓] Schema migration applied cleanly.\n');
    } finally {
      await pool.end();
    }
  } else {
    console.log('--- [DRY-RUN] Skipping DDL migration against Neon ---\n');
  }

  for (const county of ['Broward', 'Palm Beach']) {
    const args = [importScriptPath, `--county=${county}`, '--backfill-clues'];
    if (isDryRun) args.push('--dry-run');
    const res = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: PROJECT_ROOT });
    if (res.status !== 0) {
      process.exit(res.status || 1);
    }
  }

  if (!isDryRun) {
    const { Pool } = await import('@neondatabase/serverless');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await pool.query('VACUUM (ANALYZE) county_parcels;');
      const sizeRes = await pool.query(`
        SELECT
          pg_database_size(current_database()) AS db_bytes,
          pg_total_relation_size('county_parcels') AS parcels_bytes
      `);
      const row = sizeRes.rows[0] || {};
      console.log('===============================================================================');
      console.log('FINAL NEON STORAGE CHECK AFTER VACUUM (ANALYZE):');
      console.log(`- county_parcels total (heap + indexes): ${formatBytes(row.parcels_bytes)}`);
      console.log(`- Total Neon database size:              ${formatBytes(row.db_bytes)} (limit: 1.00 GB)`);
      console.log('===============================================================================');
    } finally {
      await pool.end();
    }
  }
}

main().catch((err) => {
  console.error('Fatal error in backfill-nal-clues:', err);
  process.exit(1);
});

