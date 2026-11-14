#!/usr/bin/env node

/**
 * import-building-chars.mjs
 *
 * Prepared ETL importer for Broward County Property Appraiser (BCPA) and
 * Palm Beach County Property Appraiser (PAPA) public-records building-characteristics
 * exports (beds, full baths, half baths), matched strictly by folio / parcel_id.
 *
 * Strictly local CSV / ZIP processing — ZERO web scraping or external HTTP requests.
 *
 * Usage:
 *   node scripts/county/import-building-chars.mjs --print-mapping
 *   node scripts/county/import-building-chars.mjs --county=Broward --file="data/county/bcpa-bldg.csv" --dry-run
 *   node scripts/county/import-building-chars.mjs --county="Palm Beach" --file="data/county/papa-res-bldg.zip"
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const envLocalPath = path.resolve(PROJECT_ROOT, '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

/**
 * Canonical header alias mapping for Broward (BCPA) & Palm Beach (PAPA) public records extracts.
 */
export const BUILDING_CHAR_HEADER_ALIASES = {
  folio: [
    'FOLIO',
    'FOLIO_NUMBER',
    'FOLIO_NUM',
    'PARCEL_ID',
    'PARCELID',
    'PCN',
    'PARCEL_CONTROL_NUMBER',
    'STRAP',
    'PROP_ID'
  ],
  beds: [
    'BEDS',
    'BEDROOMS',
    'BED_CNT',
    'BEDROOM_CNT',
    'NBR_BEDROOMS',
    'NO_BDRMS',
    'NUM_BEDROOMS',
    'TOT_BEDS'
  ],
  full_baths: [
    'FULL_BATHS',
    'FULL_BATH',
    'FULL_BATH_CNT',
    'BATHS_FULL',
    'NBR_FULL_BATHS',
    'BATHS',
    'BATHROOMS',
    'BATH_CNT',
    'TOT_BATHS'
  ],
  half_baths: [
    'HALF_BATHS',
    'HALF_BATH',
    'HALF_BATH_CNT',
    'BATHS_HALF',
    'NBR_HALF_BATHS',
    'H_BATHS'
  ],
  bldg_num: [
    'BLDG_NUM',
    'BLDG_NO',
    'CARD_NUM',
    'BLDG_SEQ',
    'BUILDING_NO'
  ]
};

/**
 * Normalizes a county folio / PCN so punctuated exports (e.g. "50-42-09-04-0280"
 * or "74-43-43-07-01-000-0010") match county_parcels.parcel_id ("504209040280"
 * / "74434307010000010").
 */
export function normalizeCountyFolio(rawFolio, county = 'Broward') {
  if (rawFolio == null) return '';
  const trimmed = String(rawFolio).trim();
  if (!trimmed) return '';
  // Strip dashes, spaces, and dots used in formatted BCPA (12-digit) and PAPA (17-digit) folios
  const compact = trimmed.replace(/[-\s.]/g, '');
  if (/palm/i.test(county) && /^\d+$/.test(compact) && compact.length < 17 && compact.length >= 15) {
    return compact;
  }
  return compact;
}

/**
 * Resolves CSV header indices against BUILDING_CHAR_HEADER_ALIASES.
 */
export function resolveBuildingCharHeaderMapping(rawHeaders = []) {
  const normalized = rawHeaders.map((h) =>
    String(h || '')
      .trim()
      .toUpperCase()
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '')
  );

  const findIndexFor = (aliases) => {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  return {
    normalizedHeaders: normalized,
    folioIdx: findIndexFor(BUILDING_CHAR_HEADER_ALIASES.folio),
    bedsIdx: findIndexFor(BUILDING_CHAR_HEADER_ALIASES.beds),
    fullBathsIdx: findIndexFor(BUILDING_CHAR_HEADER_ALIASES.full_baths),
    halfBathsIdx: findIndexFor(BUILDING_CHAR_HEADER_ALIASES.half_baths),
    bldgNumIdx: findIndexFor(BUILDING_CHAR_HEADER_ALIASES.bldg_num)
  };
}

/**
 * Parses a single CSV row using the resolved header mapping.
 * Handles combined decimal baths (e.g. 2.5 -> 2 full, 1 half) when no separate half-bath column exists.
 */
export function parseBuildingCharRow(row, mapping, county = 'Broward') {
  if (!Array.isArray(row) || mapping.folioIdx < 0) return null;
  const parcel_id = normalizeCountyFolio(row[mapping.folioIdx], county);
  if (!parcel_id) return null;

  const parseNum = (idx) => {
    if (idx < 0 || row[idx] == null) return null;
    const raw = String(row[idx]).replace(/,/g, '').trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const bedsVal = parseNum(mapping.bedsIdx);
  const rawFull = parseNum(mapping.fullBathsIdx);
  const rawHalf = parseNum(mapping.halfBathsIdx);

  let full_baths = null;
  let half_baths = null;

  if (rawFull != null) {
    if (rawHalf == null && !Number.isInteger(rawFull)) {
      full_baths = Math.floor(rawFull + 1e-6);
      half_baths = rawFull - full_baths >= 0.25 ? 1 : 0;
    } else {
      full_baths = Math.round(rawFull);
      half_baths = rawHalf != null ? Math.round(rawHalf) : 0;
    }
  } else if (rawHalf != null) {
    full_baths = 0;
    half_baths = Math.round(rawHalf);
  }

  const bldg_num = parseNum(mapping.bldgNumIdx) ?? 1;

  if (bedsVal == null && full_baths == null && half_baths == null) {
    return null;
  }

  return {
    parcel_id,
    beds: bedsVal != null ? Math.round(bedsVal * 10) / 10 : null,
    full_baths,
    half_baths,
    bldg_num
  };
}

function createCsvStream(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const parser = parse({
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true
  });

  if (ext === '.zip') {
    const child = spawn('unzip', ['-p', filePath]);
    child.stderr.on('data', () => {});
    child.stdout.pipe(parser);
    return { parser, cleanup: () => child.kill() };
  }

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  stream.pipe(parser);
  return { parser, cleanup: () => stream.destroy() };
}

function printMappingGuide() {
  console.log('===============================================================================');
  console.log('PUBLIC-RECORDS BUILDING CHARACTERISTICS IMPORT MAPPING (BROWARD / PALM BEACH)');
  console.log('===============================================================================');
  console.log('Target table: county_parcels (matched by county + normalized parcel_id)');
  console.log('Columns populated: beds (numeric), full_baths (smallint), half_baths (smallint)\n');
  console.log('Accepted CSV column headers (case-insensitive):');
  for (const [field, aliases] of Object.entries(BUILDING_CHAR_HEADER_ALIASES)) {
    console.log(`  - ${field.padEnd(12)}: ${aliases.join(', ')}`);
  }
  console.log('\nMulti-building parcels (e.g. duplexes / accessory structures):');
  console.log('  - Sums beds, full_baths, and half_baths across residential cards per folio.');
  console.log('\nExample dry-run once public-records CSV/ZIP is placed in data/county/:');
  console.log('  node scripts/county/import-building-chars.mjs --county=Broward --file="data/county/bcpa_building.csv" --dry-run');
  console.log('  node scripts/county/import-building-chars.mjs --county="Palm Beach" --file="data/county/papa_building.csv" --dry-run');
  console.log('===============================================================================');
}

async function runCli() {
  const args = process.argv.slice(2);
  if (args.includes('--print-mapping') || args.includes('--help')) {
    printMappingGuide();
    return;
  }

  const rawCounty = args.find((a) => a.startsWith('--county='))?.split('=')[1] || '';
  const fileArg = args.find((a) => a.startsWith('--file='))?.split('=')[1] || '';
  const isDryRun = args.includes('--dry-run');

  if (!rawCounty || !fileArg) {
    printMappingGuide();
    process.exit(1);
  }

  const county = /palm/i.test(rawCounty) ? 'Palm Beach' : 'Broward';
  const resolvedPath = path.resolve(PROJECT_ROOT, fileArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`[!] File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`Streaming ${path.basename(resolvedPath)} for ${county} (${isDryRun ? 'DRY-RUN' : 'LIVE UPDATE'})...`);

  const byFolio = new Map();
  const { parser, cleanup } = createCsvStream(resolvedPath);
  let mapping = null;
  let totalRows = 0;

  try {
    for await (const row of parser) {
      if (!mapping) {
        mapping = resolveBuildingCharHeaderMapping(row);
        if (mapping.folioIdx < 0) {
          throw new Error(`Could not locate a folio/parcel column in headers: ${row.join(', ')}`);
        }
        if (mapping.bedsIdx < 0 && mapping.fullBathsIdx < 0) {
          throw new Error(`Could not locate beds or baths columns in headers: ${row.join(', ')}`);
        }
        continue;
      }

      totalRows++;
      const parsed = parseBuildingCharRow(row, mapping, county);
      if (!parsed) continue;

      const prev = byFolio.get(parsed.parcel_id);
      if (!prev) {
        byFolio.set(parsed.parcel_id, {
          parcel_id: parsed.parcel_id,
          beds: parsed.beds,
          full_baths: parsed.full_baths,
          half_baths: parsed.half_baths
        });
      } else {
        // Aggregate multi-card residential structures on the same folio
        prev.beds = (prev.beds || 0) + (parsed.beds || 0);
        prev.full_baths = (prev.full_baths || 0) + (parsed.full_baths || 0);
        prev.half_baths = (prev.half_baths || 0) + (parsed.half_baths || 0);
      }
    }
  } finally {
    cleanup();
  }

  console.log(`[✓] Parsed ${totalRows.toLocaleString()} rows -> ${byFolio.size.toLocaleString()} distinct folios.`);

  if (isDryRun) {
    const sample = Array.from(byFolio.values()).slice(0, 5);
    console.log('Sample mapped records:', sample);
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set in .env.local');
  }

  const { Pool } = await import('@neondatabase/serverless');
  const pool = new Pool({ connectionString: dbUrl });
  const records = Array.from(byFolio.values());
  const BATCH_SIZE = 5000;
  let updatedTotal = 0;
  let sinceVacuum = 0;

  try {
    const client = await pool.connect();
    try {
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const chunk = records.slice(i, i + BATCH_SIZE);
        const placeholders = [];
        const values = [county];
        let pIdx = 2;

        for (const r of chunk) {
          placeholders.push(`($${pIdx++}::text, $${pIdx++}::numeric, $${pIdx++}::smallint, $${pIdx++}::smallint)`);
          values.push(r.parcel_id, r.beds, r.full_baths, r.half_baths);
        }

        const res = await client.query(
          `
            UPDATE county_parcels AS p
            SET
              beds = v.beds,
              full_baths = v.full_baths,
              half_baths = v.half_baths
            FROM (VALUES ${placeholders.join(', ')}) AS v(parcel_id, beds, full_baths, half_baths)
            WHERE p.county = $1
              AND p.parcel_id = v.parcel_id
              AND (
                p.beds IS DISTINCT FROM v.beds
                OR p.full_baths IS DISTINCT FROM v.full_baths
                OR p.half_baths IS DISTINCT FROM v.half_baths
              );
          `,
          values
        );

        const changed = res.rowCount || 0;
        updatedTotal += changed;
        sinceVacuum += changed;

        if (sinceVacuum >= 50000) {
          await client.query('VACUUM county_parcels;');
          sinceVacuum = 0;
        }
      }

      await client.query('VACUUM (ANALYZE) county_parcels;');
      const dbSizeRes = await client.query('SELECT pg_database_size(current_database()) AS db_bytes;');
      const dbMb = (Number(dbSizeRes.rows[0]?.db_bytes || 0) / (1024 * 1024)).toFixed(2);
      console.log(`[✓] Updated ${updatedTotal.toLocaleString()} parcels in ${county}. Total DB size: ${dbMb} MB.`);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runCli().catch((err) => {
    console.error('[!] Building characteristics import failed:', err.message);
    process.exit(1);
  });
}

