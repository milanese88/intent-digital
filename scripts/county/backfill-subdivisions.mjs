#!/usr/bin/env node

/**
 * backfill-subdivisions.mjs
 *
 * Fills county_parcels.s_legal, subdivision_name and subdivision_code from the DOR NAL
 * files on disk (Broward 16, Palm Beach 60, Martin 53). nbrhd_cd / mkt_ar are already
 * stored by import-roll.mjs. Reads only PARCEL_ID, DOR_UC, S_LEGAL, PHY_ADDR1 —
 * never owner names or mailing addresses.
 *
 * Names: derived per parcel from S_LEGAL (truncated to 30 chars by DOR), then
 * canonicalized per plat code (Palm Beach / Martin): parcels whose own name is missing
 * or a truncated prefix take the most common name in their plat.
 *
 * Usage:
 *   node scripts/county/backfill-subdivisions.mjs --dry-run [--county=Martin] [--samples=20]
 *   node scripts/county/backfill-subdivisions.mjs [--county=all] [--batch=5000]
 *
 * Writes are batched (UPDATE ... FROM json_to_recordset), only touch rows whose values
 * change, VACUUM county_parcels every ~100k updated rows to recycle dead tuples, and
 * finish with VACUUM (ANALYZE).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { findRollFile, createRollCsvStream, normalizeCountyName } from './_counties.mjs';
import { deriveSubdivisionName, deriveSubdivisionCode, canonicalizeByCode } from '../../src/utils/subdivision.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data/county');
const envLocalPath = path.join(PROJECT_ROOT, '.env.local');
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath, quiet: true });

const RESIDENTIAL = new Set(['000', '001', '002', '004', '008']);
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const countyArg = (args.find((a) => a.startsWith('--county=')) || '--county=all').split('=')[1];
const batchSize = Math.max(500, Number((args.find((a) => a.startsWith('--batch=')) || '--batch=5000').split('=')[1]) || 5000);
const sampleCount = Number((args.find((a) => a.startsWith('--samples=')) || '--samples=20').split('=')[1]) || 20;
const VACUUM_EVERY = 100000;

const counties = countyArg === 'all'
  ? ['Broward', 'Palm Beach', 'Martin']
  : [normalizeCountyName(countyArg)].filter(Boolean);
if (counties.length === 0) {
  console.error(`Unsupported --county=${countyArg}`);
  process.exit(1);
}

async function readCounty(county) {
  const nalPath = findRollFile(DATA_DIR, county, 'NAL');
  if (!nalPath) throw new Error(`NAL file for ${county} not found under data/county/`);
  const { parser, cleanup } = createRollCsvStream(nalPath);
  const records = [];
  let headers = null;
  const idx = {};
  try {
    for await (const row of parser) {
      if (!headers) {
        headers = row.map((h) => h.trim().toUpperCase());
        for (const k of ['PARCEL_ID', 'DOR_UC', 'S_LEGAL', 'PHY_ADDR1']) idx[k] = headers.indexOf(k);
        if (idx.PARCEL_ID === -1 || idx.S_LEGAL === -1) throw new Error(`${county} NAL lacks PARCEL_ID / S_LEGAL`);
        continue;
      }
      const use = (row[idx.DOR_UC] || '').trim().padStart(3, '0');
      if (!RESIDENTIAL.has(use)) continue;
      const parcelId = (row[idx.PARCEL_ID] || '').trim();
      if (!parcelId) continue;
      const legal = (row[idx.S_LEGAL] || '').replace(/\s+/g, ' ').trim() || null;
      records.push({
        parcel_id: parcelId,
        situs: (row[idx.PHY_ADDR1] || '').trim(),
        s_legal: legal,
        subdivision_name: deriveSubdivisionName(legal),
        subdivision_code: deriveSubdivisionCode(parcelId, county)
      });
    }
  } finally {
    cleanup();
  }
  return { nalPath, records };
}

function estimateBytes(records) {
  // varlena: 1-byte header for short text; NULLs cost only the null-bitmap bit
  let bytes = 0;
  for (const r of records) {
    for (const v of [r.s_legal, r.subdivision_name, r.subdivision_code]) {
      if (v) bytes += Buffer.byteLength(v) + 1;
    }
  }
  return bytes;
}

async function main() {
  console.log(`=== SUBDIVISION BACKFILL (${isDryRun ? 'DRY RUN — no database writes' : 'LIVE'}) — ${counties.join(', ')} ===`);
  let sql = null;
  if (!isDryRun) {
    const { getScriptDb } = await import('../../api/_lib/db.js');
    sql = getScriptDb();
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'county_parcels'
        AND column_name IN ('s_legal', 'subdivision_name', 'subdivision_code')`;
    if (cols.length < 3) {
      console.error('county_parcels is missing s_legal / subdivision_name / subdivision_code — apply migrations/add_subdivision_and_hoa_fields.sql first.');
      await sql.end({ timeout: 5 });
      process.exit(1);
    }
  }

  let grandBytes = 0;
  let grandRows = 0;
  let updatedSinceVacuum = 0;
  for (const county of counties) {
    const t0 = Date.now();
    const { nalPath, records } = await readCounty(county);
    const canonicalized = canonicalizeByCode(records);
    const named = records.filter((r) => r.subdivision_name).length;
    const coded = records.filter((r) => r.subdivision_code).length;
    const distinctNames = new Set(records.map((r) => r.subdivision_name).filter(Boolean)).size;
    const distinctCodes = new Set(records.map((r) => r.subdivision_code).filter(Boolean)).size;
    const bytes = estimateBytes(records);
    grandBytes += bytes;
    grandRows += records.length;

    console.log(`\n--- ${county} (${path.relative(DATA_DIR, nalPath)}) ---`);
    console.log(`Residential parcels: ${records.length.toLocaleString()} | with S_LEGAL: ${records.filter((r) => r.s_legal).length.toLocaleString()}`);
    console.log(`subdivision_name: ${named.toLocaleString()} (${((100 * named) / Math.max(1, records.length)).toFixed(1)}%), ${distinctNames.toLocaleString()} distinct; ${canonicalized.toLocaleString()} filled/expanded from their plat`);
    console.log(`subdivision_code: ${coded.toLocaleString()} (${((100 * coded) / Math.max(1, records.length)).toFixed(1)}%), ${distinctCodes.toLocaleString()} distinct plats`);
    console.log(`Raw new column data: ~${(bytes / 1048576).toFixed(1)} MB`);

    if (isDryRun) {
      const step = Math.max(1, Math.floor(records.length / sampleCount));
      console.log(`${sampleCount} sample parcels (folio | situs | legal -> subdivision_name | code):`);
      for (let i = 0; i < sampleCount && i * step < records.length; i++) {
        const r = records[i * step + Math.min(step - 1, 3)];
        console.log(`  ${r.parcel_id} | ${r.situs} | ${r.s_legal ?? ''} -> ${r.subdivision_name ?? '(none)'} | ${r.subdivision_code ?? '—'}`);
      }
      continue;
    }

    let updated = 0;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map((r) => ({
        parcel_id: r.parcel_id,
        s_legal: r.s_legal,
        subdivision_name: r.subdivision_name,
        subdivision_code: r.subdivision_code
      }));
      const res = await sql`
        UPDATE county_parcels AS p
        SET s_legal = x.s_legal,
            subdivision_name = x.subdivision_name,
            subdivision_code = x.subdivision_code
        FROM json_to_recordset(${sql.json(batch)}::json)
          AS x(parcel_id text, s_legal text, subdivision_name text, subdivision_code text)
        WHERE p.county = ${county}
          AND p.parcel_id = x.parcel_id
          AND (p.s_legal IS DISTINCT FROM x.s_legal
            OR p.subdivision_name IS DISTINCT FROM x.subdivision_name
            OR p.subdivision_code IS DISTINCT FROM x.subdivision_code);
      `;
      const n = res.count ?? 0;
      updated += n;
      updatedSinceVacuum += n;
      if (updatedSinceVacuum >= VACUUM_EVERY) {
        await sql.unsafe('VACUUM county_parcels');
        updatedSinceVacuum = 0;
      }
      if ((i / batchSize) % 20 === 0 || i + batchSize >= records.length) {
        console.log(`  ${Math.min(i + batchSize, records.length).toLocaleString()} / ${records.length.toLocaleString()} processed, ${updated.toLocaleString()} rows updated (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      }
    }
    console.log(`${county}: ${updated.toLocaleString()} rows updated in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }

  console.log(`\nTotal: ${grandRows.toLocaleString()} parcels, ~${(grandBytes / 1048576).toFixed(1)} MB of new column data`);
  if (!isDryRun) {
    console.log('Running VACUUM (ANALYZE) county_parcels...');
    await sql.unsafe('VACUUM (ANALYZE) county_parcels');
    const size = await sql`
      SELECT pg_size_pretty(pg_total_relation_size('county_parcels')) AS parcels,
             pg_size_pretty(pg_database_size(current_database())) AS db`;
    console.log(`county_parcels: ${size[0].parcels} | database: ${size[0].db}`);
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('Fatal error in backfill-subdivisions:', err?.message || err);
  process.exit(1);
});
