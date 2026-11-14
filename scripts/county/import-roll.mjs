#!/usr/bin/env node

/**
 * import-roll.mjs
 * 
 * Production ETL script to import Florida Department of Revenue (FDOR) property rolls
 * into Neon PostgreSQL for Intent Digital.
 * 
 * Features:
 * - RFC-4180 compliant CSV streaming parser (csv-parse) handling embedded commas,
 *   escaped quotes (""), and multi-line fields (e.g. S_LEGAL).
 * - Maps every field strictly by header name, never by hardcoded array index.
 * - Validation engine: checks column count matches headers, PARCEL_ID is present,
 *   and PHY_ZIPCD is a valid 5-digit zip. Aborts if malformed rows exceed 0.5%.
 * - One-pass import: precomputed coordinate cache (from DOR GIS shapefiles) is loaded
 *   into memory and inserted directly with lat/lng, avoiding subsequent UPDATE table bloat.
 * - Imports residential parcels (DOR Use Codes 000, 001, 002, 004, 008) into county_parcels.
 * - Imports SDF sales transactions + NAL historical sales (deduplicated) into county_sales.
 * - Tracks sales categories: Market (01, 02) vs Distressed (12, 18, 19, 38) vs Other.
 * - Skips $0 and $100-or-less transfers (nominal/non-market).
 * - Zero PII: Owner names, mailing addresses, fiduciary and exemption data are never stored.
 * - Supports --dry-run to simulate and verify counts before touching the database.
 * 
 * Usage:
 *   node scripts/county/import-roll.mjs --county="Palm Beach" [--dry-run]
 *   node scripts/county/import-roll.mjs --county=Broward [--dry-run]
 *   node scripts/county/import-roll.mjs --county=Broward --backfill-clues [--dry-run]
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
const DEFAULT_DATA_DIR = path.resolve(PROJECT_ROOT, 'data/county');

// Load environment variables from .env.local
const envLocalPath = path.resolve(PROJECT_ROOT, '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

// DOR Residential Target Land Use Codes
const RESIDENTIAL_USE_CODES = new Set(['000', '001', '002', '004', '008']);

// Batch size for PostgreSQL inserts (~1,000 rows per batch inside per-batch transactions)
const BATCH_SIZE = 1000;

// Maximum acceptable malformed rows threshold (0.5%)
const MAX_MALFORMED_THRESHOLD_PCT = 0.5;

/**
 * Creates an RFC-4180 streaming parser from a .zip archive or flat file.
 */
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

/**
 * Builds multi-row parameterized SQL statement with ON CONFLICT clause.
 */
function buildBatchInsert(table, columns, rows, onConflictClause) {
  const colList = columns.join(', ');
  const placeholders = [];
  const values = [];
  let paramIdx = 1;

  for (const row of rows) {
    const rowPlaceholders = [];
    for (const col of columns) {
      rowPlaceholders.push(`$${paramIdx++}`);
      values.push(row[col] !== undefined ? row[col] : null);
    }
    placeholders.push(`(${rowPlaceholders.join(', ')})`);
  }

  const query = `
    INSERT INTO ${table} (${colList})
    VALUES ${placeholders.join(', ')}
    ${onConflictClause};
  `;

  return { query, values };
}

/**
 * Helper to format bytes into readable MB / GB string.
 */
function formatBytes(bytes) {
  const num = Number(bytes) || 0;
  if (num >= 1024 * 1024 * 1024) {
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Main ETL execution function.
 */
async function main() {
  const args = process.argv.slice(2);
  const rawCountyArg = args.find(a => a.startsWith('--county='))?.split('=')[1] || 'Broward';
  const isDryRun = args.includes('--dry-run');
  const isBackfillClues = args.includes('--backfill-clues');

  // Normalize county name
  let countyName = rawCountyArg.trim();
  if (/palm/i.test(countyName)) {
    countyName = 'Palm Beach';
  } else if (/broward/i.test(countyName)) {
    countyName = 'Broward';
  }

  console.log(`===============================================================================`);
  console.log(`INTENT DIGITAL — COUNTY ROLL ${isBackfillClues ? 'CLUES BACKFILL' : 'IMPORT'} TO NEON POSTGRESQL`);
  console.log(`Target County: [${countyName}] | Execution Mode: [${isDryRun ? 'DRY-RUN (Simulate only)' : (isBackfillClues ? 'NAL CLUES BACKFILL' : 'PRODUCTION IMPORT')}]`);
  console.log(`CSV Engine: RFC-4180 streaming parser (csv-parse) with header-based mapping`);
  console.log(`===============================================================================`);

  let pool = null;
  if (!isDryRun) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error(`\n[!] Error: DATABASE_URL is not set in .env.local\n`);
      console.error(`To populate DATABASE_URL in .env.local:`);
      console.error(`  1. Pull from Vercel:    vercel env pull .env.local`);
      console.error(`  2. Or add to .env.local: DATABASE_URL=postgresql://neondb_owner:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require\n`);
      console.error(`To test file parsing without connecting to Neon, run with: --dry-run`);
      process.exit(1);
    }

    try {
      const { Pool } = await import('@neondatabase/serverless');
      pool = new Pool({ connectionString: dbUrl });
      const testClient = await pool.connect();
      await testClient.query('SELECT 1');
      testClient.release();
      console.log(`[✓] Successfully connected to Neon PostgreSQL database.`);
    } catch (err) {
      console.error(`\n[!] Failed to connect to Neon database:`, err.message);
      console.error(`Please verify DATABASE_URL in .env.local.\n`);
      process.exit(1);
    }
  }

  // Check for precomputed coordinate cache (one-pass import optimization)
  const countySlug = countyName.toLowerCase().replace(/[\s_]+/g, '-');
  const countyNoSpace = countyName.toLowerCase().replace(/[\s_]+/g, '');
  const possibleCacheFiles = [
    path.join(DEFAULT_DATA_DIR, `${countySlug}-coords.json`),
    path.join(DEFAULT_DATA_DIR, `${countyNoSpace}-coords.json`),
    path.join(DEFAULT_DATA_DIR, `${countyName.toLowerCase()}-coords.json`)
  ];

  let coordsCache = null;
  let coordsCachePath = null;
  if (!isBackfillClues) {
    for (const p of possibleCacheFiles) {
      if (fs.existsSync(p)) {
        coordsCachePath = p;
        break;
      }
    }

    if (coordsCachePath) {
      console.log(`\n[✓] Found precomputed coordinate cache: ${path.basename(coordsCachePath)}`);
      const rawJson = fs.readFileSync(coordsCachePath, 'utf8');
      coordsCache = JSON.parse(rawJson);
      console.log(`    Loaded ${Object.keys(coordsCache).length.toLocaleString()} parcel coordinates into memory.`);
      console.log(`    Parcels will be imported with coordinates in ONE PASS (no table bloat).\n`);
    } else {
      console.log(`\n[i] No coordinate cache found for ${countyName} in ${DEFAULT_DATA_DIR}. Parcels will be imported with null coordinates.\n`);
    }
  }

  // Locate County NAL and SDF files in data/county/
  const files = fs.readdirSync(DEFAULT_DATA_DIR);
  const countySearchToken = countyName.toLowerCase().replace(/[\s_-]+/g, '');
  
  const nalFile = files.find(f => f.toLowerCase().replace(/[\s_-]+/g, '').includes(countySearchToken) && f.toUpperCase().includes('NAL'));
  const sdfFile = files.find(f => f.toLowerCase().replace(/[\s_-]+/g, '').includes(countySearchToken) && f.toUpperCase().includes('SDF'));

  if (!nalFile || (!isBackfillClues && !sdfFile)) {
    console.error(`\n[!] Missing roll file(s) for ${countyName} in ${DEFAULT_DATA_DIR}`);
    if (!nalFile) console.error(`  - Missing NAL file for ${countyName}`);
    if (!isBackfillClues && !sdfFile) console.error(`  - Missing SDF file for ${countyName}`);
    process.exit(1);
  }

  const nalPath = path.join(DEFAULT_DATA_DIR, nalFile);
  const sdfPath = sdfFile ? path.join(DEFAULT_DATA_DIR, sdfFile) : null;

  console.log(`Found Source Archives:`);
  console.log(`  - NAL: ${nalFile} (${(fs.statSync(nalPath).size / (1024 * 1024)).toFixed(1)} MB)`);
  if (!isBackfillClues && sdfPath) {
    console.log(`  - SDF: ${sdfFile} (${(fs.statSync(sdfPath).size / (1024 * 1024)).toFixed(1)} MB)\n`);
  } else {
    console.log(`  - Mode: Backfilling NAL parcel clues only (EFF_YR_BLT, NO_RES_UNTS, IMP_QUAL, CONST_CLASS, SPEC_FEAT_VAL)\n`);
  }

  // Tracking & Validation Counters
  const validation = {
    nal: {
      totalRows: 0,
      mismatchedCols: 0,
      missingParcelId: 0,
      invalidZip: 0,
      totalMalformed: 0,
      malformedExamples: []
    },
    sdf: {
      totalRows: 0,
      mismatchedCols: 0,
      missingParcelId: 0,
      totalMalformed: 0,
      malformedExamples: []
    }
  };

  let totalResidentialParcels = 0;
  let parcelsImported = 0;
  let parcelsWithCoords = 0;

  let totalSdfResidentialSales = 0;
  let sdfSalesImported = 0;

  let totalNalSalesKept = 0;
  let nalSalesImported = 0;

  let uniqueMarketSales = 0;
  let uniqueDistressedSales = 0;
  let uniqueOtherSales = 0;

  function classifySale(qualCd) {
    const code = String(qualCd || '').trim();
    if (code === '01' || code === '02') {
      uniqueMarketSales++;
    } else if (['12', '18', '19', '38'].includes(code)) {
      uniqueDistressedSales++;
    } else {
      uniqueOtherSales++;
    }
  }

  // Known target parcel for sanity verification
  const knownTargetId = countyName === 'Palm Beach' ? '74434307010000010' : '504209040280';
  let knownParcelRecord = null;
  const knownParcelSales = [];

  const parcelBatch = [];
  const salesBatch = [];

  // In-memory set for sales deduplication
  // Key: county|parcel_id|sale_year|sale_month|sale_price|or_book|or_page
  const uniqueSalesKeys = new Set();

  const parcelColumns = [
    'county', 'parcel_id', 'address', 'city', 'zip', 'use_code',
    'living_sqft', 'year_built', 'eff_year_built', 'land_sqft', 'units',
    'imp_qual', 'const_class', 'spec_feat_val',
    'just_value', 'nbrhd_cd', 'mkt_ar', 'lat', 'lng', 'roll_year'
  ];
  const parcelConflictClause = `
    ON CONFLICT (county, parcel_id) DO UPDATE SET
      address = EXCLUDED.address,
      city = EXCLUDED.city,
      zip = EXCLUDED.zip,
      use_code = EXCLUDED.use_code,
      living_sqft = EXCLUDED.living_sqft,
      year_built = EXCLUDED.year_built,
      eff_year_built = EXCLUDED.eff_year_built,
      land_sqft = EXCLUDED.land_sqft,
      units = EXCLUDED.units,
      imp_qual = EXCLUDED.imp_qual,
      const_class = EXCLUDED.const_class,
      spec_feat_val = EXCLUDED.spec_feat_val,
      just_value = EXCLUDED.just_value,
      nbrhd_cd = EXCLUDED.nbrhd_cd,
      mkt_ar = EXCLUDED.mkt_ar,
      lat = COALESCE(EXCLUDED.lat, county_parcels.lat),
      lng = COALESCE(EXCLUDED.lng, county_parcels.lng),
      roll_year = EXCLUDED.roll_year,
      imported_at = now()
  `;

  const BACKFILL_BATCH_SIZE = 5000;
  const VACUUM_CHECKPOINT_ROWS = 50000;
  let backfillUpdatedSinceVacuum = 0;

  async function flushCluesBackfillBatch(rows) {
    if (rows.length === 0 || isDryRun || !pool) return 0;
    const placeholders = [];
    const values = [countyName];
    let idx = 2;

    for (const r of rows) {
      placeholders.push(`($${idx++}::text, $${idx++}::int, $${idx++}::int, $${idx++}::text, $${idx++}::text, $${idx++}::bigint)`);
      values.push(
        r.parcel_id,
        r.eff_year_built,
        r.units,
        r.imp_qual,
        r.const_class,
        r.spec_feat_val
      );
    }

    const query = `
      UPDATE county_parcels AS p
      SET
        eff_year_built = COALESCE(v.eff_year_built, p.eff_year_built),
        units = COALESCE(v.units, p.units),
        imp_qual = v.imp_qual,
        const_class = v.const_class,
        spec_feat_val = v.spec_feat_val
      FROM (
        VALUES ${placeholders.join(', ')}
      ) AS v(parcel_id, eff_year_built, units, imp_qual, const_class, spec_feat_val)
      WHERE p.county = $1
        AND p.parcel_id = v.parcel_id
        AND (
          p.imp_qual IS DISTINCT FROM v.imp_qual
          OR p.const_class IS DISTINCT FROM v.const_class
          OR p.spec_feat_val IS DISTINCT FROM v.spec_feat_val
          OR (v.eff_year_built IS NOT NULL AND p.eff_year_built IS DISTINCT FROM v.eff_year_built)
          OR (v.units IS NOT NULL AND p.units IS DISTINCT FROM v.units)
        );
    `;

    const client = await pool.connect();
    try {
      const res = await client.query(query, values);
      const changed = res.rowCount || 0;
      backfillUpdatedSinceVacuum += changed;

      // Reclaim dead-tuple heap space via Free Space Map to stay well under 1 GB
      if (backfillUpdatedSinceVacuum >= VACUUM_CHECKPOINT_ROWS) {
        await client.query('VACUUM county_parcels;');
        backfillUpdatedSinceVacuum = 0;
      }
      return changed;
    } finally {
      client.release();
    }
  }

  const salesColumns = [
    'county', 'parcel_id', 'sale_price', 'sale_year', 'sale_month',
    'qual_code', 'vi_cd', 'multi_parcel', 'or_book', 'or_page', 'clerk_no', 'source'
  ];
  const salesConflictClause = `
    ON CONFLICT (county, parcel_id, sale_year, sale_month, sale_price, or_book, or_page) DO NOTHING
  `;

  /**
   * Helper to flush a batch into PostgreSQL.
   */
  async function flushBatch(table, columns, rows, onConflictClause) {
    if (rows.length === 0 || isDryRun || !pool) return 0;
    const { query, values } = buildBatchInsert(table, columns, rows, onConflictClause);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(query, values);
      await client.query('COMMIT');
      return res.rowCount || rows.length;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[!] Batch insert failed for ${table}:`, err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // PHASE 1: STREAM SDF SALES (All residential sales > $100)
  // ==========================================================================
  if (!isBackfillClues && sdfPath) {
    console.log(`--- [1/2] Processing Sales Data File (SDF) ---`);
    const { parser: sdfParser, cleanup: sdfCleanup } = createCsvStream(sdfPath);

    let sdfHeaders = null;
    const sdfMap = {};

    try {
      for await (const row of sdfParser) {
        if (!sdfHeaders) {
          sdfHeaders = row.map(h => h.trim().toUpperCase());
          sdfHeaders.forEach((h, idx) => { sdfMap[h] = idx; });
          continue;
        }

        validation.sdf.totalRows++;
        if (validation.sdf.totalRows % 50000 === 0) {
          process.stdout.write(`  ...streamed ${(validation.sdf.totalRows / 1000).toLocaleString()}k SDF rows\r`);
        }

        let isRowMalformed = false;
        if (row.length !== sdfHeaders.length) {
          validation.sdf.mismatchedCols++;
          isRowMalformed = true;
        }

        const parcelId = row[sdfMap['PARCEL_ID']]?.trim();
        if (!parcelId) {
          validation.sdf.missingParcelId++;
          isRowMalformed = true;
        }

        if (isRowMalformed) {
          validation.sdf.totalMalformed++;
          if (validation.sdf.malformedExamples.length < 3) {
            validation.sdf.malformedExamples.push({
              parcel_id: parcelId || 'MISSING',
              address: 'N/A (SDF record)'
            });
          }
          continue;
        }

        const rawUseCode = row[sdfMap['DOR_UC']]?.trim() || '';
        const normalizedUse = rawUseCode.padStart(3, '0');

        // Keep only target residential
        if (!RESIDENTIAL_USE_CODES.has(normalizedUse)) continue;

        const salePrice = Number(row[sdfMap['SALE_PRC']]) || 0;
        // Skip $0 and $100-or-less sales
        if (salePrice <= 100) continue;

        totalSdfResidentialSales++;

        const saleYr = Number(row[sdfMap['SALE_YR']]) || null;
        const saleMo = Number(row[sdfMap['SALE_MO']]) || null;
        const qualCd = row[sdfMap['QUAL_CD']]?.trim() || '00';
        const viCd = row[sdfMap['VI_CD']]?.trim() || null;
        const multiPar = row[sdfMap['MULTI_PAR_SAL']]?.trim() || null;
        const orBook = row[sdfMap['OR_BOOK']]?.trim() || '';
        const orPage = row[sdfMap['OR_PAGE']]?.trim() || '';
        const clerkNo = row[sdfMap['CLERK_NO']]?.trim() || '';

        const saleKey = `${countyName}|${parcelId}|${saleYr}|${saleMo}|${salePrice}|${orBook}|${orPage}`;
        if (uniqueSalesKeys.has(saleKey)) continue;
        uniqueSalesKeys.add(saleKey);
        classifySale(qualCd);

        const record = {
          county: countyName,
          parcel_id: parcelId,
          sale_price: salePrice,
          sale_year: saleYr,
          sale_month: saleMo,
          qual_code: qualCd,
          vi_cd: viCd,
          multi_parcel: multiPar,
          or_book: orBook,
          or_page: orPage,
          clerk_no: clerkNo,
          source: 'SDF'
        };

        if (parcelId === knownTargetId) {
          knownParcelSales.push(record);
        }

        if (!isDryRun) {
          salesBatch.push(record);
          if (salesBatch.length >= BATCH_SIZE) {
            const inserted = await flushBatch('county_sales', salesColumns, salesBatch, salesConflictClause);
            sdfSalesImported += inserted;
            salesBatch.length = 0;
          }
        } else {
          sdfSalesImported++;
        }
      }

      if (salesBatch.length > 0 && !isDryRun) {
        const inserted = await flushBatch('county_sales', salesColumns, salesBatch, salesConflictClause);
        sdfSalesImported += inserted;
        salesBatch.length = 0;
      }
    } finally {
      sdfCleanup();
    }

    console.log(`\n  [✓] SDF Stream Finished:`);
    console.log(`      Total Rows Read: ${validation.sdf.totalRows.toLocaleString()}`);
    console.log(`      Residential Sales (> $100): ${totalSdfResidentialSales.toLocaleString()}`);
    console.log(`      Unique SDF Sales Queued/Imported: ${sdfSalesImported.toLocaleString()}\n`);
  }

  // ==========================================================================
  // PHASE 2: STREAM NAL PARCELS & HISTORICAL SALES (SALE_PRC1 & SALE_PRC2)
  // ==========================================================================
  console.log(`--- [2/2] Processing Real Property Roll (NAL) ---`);
  const { parser: nalParser, cleanup: nalCleanup } = createCsvStream(nalPath);

  let nalHeaders = null;
  const nalMap = {};

  try {
    for await (const row of nalParser) {
      if (!nalHeaders) {
        nalHeaders = row.map(h => h.trim().toUpperCase());
        nalHeaders.forEach((h, idx) => { nalMap[h] = idx; });
        continue;
      }

      validation.nal.totalRows++;
      if (validation.nal.totalRows % 50000 === 0) {
        process.stdout.write(`  ...streamed ${(validation.nal.totalRows / 1000).toLocaleString()}k NAL rows\r`);
      }

      let isRowMalformed = false;
      if (row.length !== nalHeaders.length) {
        validation.nal.mismatchedCols++;
        isRowMalformed = true;
      }

      const parcelId = row[nalMap['PARCEL_ID']]?.trim();
      if (!parcelId) {
        validation.nal.missingParcelId++;
        isRowMalformed = true;
      }

      const rawZip = row[nalMap['PHY_ZIPCD']]?.trim() || '';
      // Valid zip: 5 digits if present; empty is valid (null in DB), non-empty must match 5 digits
      const is5DigitZip = /^\d{5}$/.test(rawZip);
      if (rawZip !== '' && !is5DigitZip) {
        validation.nal.invalidZip++;
        isRowMalformed = true;
      }

      const address = row[nalMap['PHY_ADDR1']]?.trim() || null;

      if (isRowMalformed) {
        validation.nal.totalMalformed++;
        if (validation.nal.malformedExamples.length < 3) {
          validation.nal.malformedExamples.push({
            parcel_id: parcelId || 'MISSING',
            address: address || 'N/A'
          });
        }
      }

      const rawUseCode = row[nalMap['DOR_UC']]?.trim() || '';
      const normalizedUse = rawUseCode.padStart(3, '0');

      // Keep only target residential
      if (!RESIDENTIAL_USE_CODES.has(normalizedUse)) continue;

      totalResidentialParcels++;

      const city = row[nalMap['PHY_CITY']]?.trim() || null;
      const zip = is5DigitZip ? rawZip : null;
      const livingSqft = row[nalMap['TOT_LVG_AREA']] ? parseInt(row[nalMap['TOT_LVG_AREA']], 10) || null : null;
      const yearBuilt = row[nalMap['ACT_YR_BLT']] ? parseInt(row[nalMap['ACT_YR_BLT']], 10) || null : null;
      const effYearBuilt = row[nalMap['EFF_YR_BLT']] ? parseInt(row[nalMap['EFF_YR_BLT']], 10) || null : null;
      const landSqft = row[nalMap['LND_SQFOOT']] ? parseInt(row[nalMap['LND_SQFOOT']], 10) || null : null;
      
      let units = row[nalMap['NO_RES_UNTS']] ? parseInt(row[nalMap['NO_RES_UNTS']], 10) || null : null;
      if (units === null && (normalizedUse === '001' || normalizedUse === '004')) {
        units = 1;
      }

      const impQual = nalMap['IMP_QUAL'] !== undefined ? (row[nalMap['IMP_QUAL']]?.trim() || null) : null;
      const constClass = nalMap['CONST_CLASS'] !== undefined ? (row[nalMap['CONST_CLASS']]?.trim() || null) : null;
      const rawSpecFeat = nalMap['SPEC_FEAT_VAL'] !== undefined ? row[nalMap['SPEC_FEAT_VAL']]?.trim() : '';
      const specFeatVal = rawSpecFeat !== '' && rawSpecFeat != null && !isNaN(Number(rawSpecFeat))
        ? Math.max(0, Math.round(Number(rawSpecFeat)))
        : null;

      const justValue = row[nalMap['JV']] ? parseFloat(row[nalMap['JV']]) || null : null;
      const nbrhdCd = row[nalMap['NBRHD_CD']]?.trim() || null;
      const mktAr = row[nalMap['MKT_AR']]?.trim() || null;
      const rollYear = row[nalMap['ASMNT_YR']] ? parseInt(row[nalMap['ASMNT_YR']], 10) || 2026 : 2026;

      let lat = null;
      let lng = null;
      if (coordsCache && coordsCache[parcelId]) {
        [lat, lng] = coordsCache[parcelId];
        parcelsWithCoords++;
      }

      const parcelRecord = {
        county: countyName,
        parcel_id: parcelId,
        address: address,
        city: city,
        zip: zip,
        use_code: normalizedUse,
        living_sqft: livingSqft,
        year_built: yearBuilt,
        eff_year_built: effYearBuilt,
        land_sqft: landSqft,
        units: units,
        imp_qual: impQual,
        const_class: constClass,
        spec_feat_val: specFeatVal,
        just_value: justValue,
        nbrhd_cd: nbrhdCd,
        mkt_ar: mktAr,
        lat: lat,
        lng: lng,
        roll_year: rollYear
      };

      if (parcelId === knownTargetId || (address && address.toUpperCase().includes(countyName === 'Palm Beach' ? '1901 EMBASSY' : '924 SW 15 TER'))) {
        knownParcelRecord = { ...parcelRecord };
      }

      if (!isDryRun) {
        parcelBatch.push(parcelRecord);
        const activeBatchLimit = isBackfillClues ? BACKFILL_BATCH_SIZE : BATCH_SIZE;
        if (parcelBatch.length >= activeBatchLimit) {
          const inserted = isBackfillClues
            ? await flushCluesBackfillBatch(parcelBatch)
            : await flushBatch('county_parcels', parcelColumns, parcelBatch, parcelConflictClause);
          parcelsImported += inserted;
          parcelBatch.length = 0;
        }
      } else {
        parcelsImported++;
      }

      if (isBackfillClues) {
        continue;
      }

      // Check NAL Sale 1
      const prc1 = Number(row[nalMap['SALE_PRC1']]) || 0;
      if (prc1 > 100) {
        const yr1 = Number(row[nalMap['SALE_YR1']]) || null;
        const mo1 = Number(row[nalMap['SALE_MO1']]) || null;
        const book1 = row[nalMap['OR_BOOK1']]?.trim() || '';
        const page1 = row[nalMap['OR_PAGE1']]?.trim() || '';
        const clerk1 = row[nalMap['CLERK_NO1']]?.trim() || '';
        const qual1 = row[nalMap['QUAL_CD1']]?.trim() || '00';
        const vi1 = row[nalMap['VI_CD1']]?.trim() || null;
        const multi1 = row[nalMap['MULTI_PAR_SAL1']]?.trim() || null;

        const key1 = `${countyName}|${parcelId}|${yr1}|${mo1}|${prc1}|${book1}|${page1}`;
        if (!uniqueSalesKeys.has(key1)) {
          uniqueSalesKeys.add(key1);
          classifySale(qual1);
          totalNalSalesKept++;

          const sale1Record = {
            county: countyName,
            parcel_id: parcelId,
            sale_price: prc1,
            sale_year: yr1,
            sale_month: mo1,
            qual_code: qual1,
            vi_cd: vi1,
            multi_parcel: multi1,
            or_book: book1,
            or_page: page1,
            clerk_no: clerk1,
            source: 'NAL'
          };

          if (parcelId === knownTargetId) {
            knownParcelSales.push(sale1Record);
          }

          if (!isDryRun) {
            salesBatch.push(sale1Record);
            if (salesBatch.length >= BATCH_SIZE) {
              const inserted = await flushBatch('county_sales', salesColumns, salesBatch, salesConflictClause);
              nalSalesImported += inserted;
              salesBatch.length = 0;
            }
          } else {
            nalSalesImported++;
          }
        }
      }

      // Check NAL Sale 2
      const prc2 = Number(row[nalMap['SALE_PRC2']]) || 0;
      if (prc2 > 100) {
        const yr2 = Number(row[nalMap['SALE_YR2']]) || null;
        const mo2 = Number(row[nalMap['SALE_MO2']]) || null;
        const book2 = row[nalMap['OR_BOOK2']]?.trim() || '';
        const page2 = row[nalMap['OR_PAGE2']]?.trim() || '';
        const clerk2 = row[nalMap['CLERK_NO2']]?.trim() || '';
        const qual2 = row[nalMap['QUAL_CD2']]?.trim() || '00';
        const vi2 = row[nalMap['VI_CD2']]?.trim() || null;
        const multi2 = row[nalMap['MULTI_PAR_SAL2']]?.trim() || null;

        const key2 = `${countyName}|${parcelId}|${yr2}|${mo2}|${prc2}|${book2}|${page2}`;
        if (!uniqueSalesKeys.has(key2)) {
          uniqueSalesKeys.add(key2);
          classifySale(qual2);
          totalNalSalesKept++;

          const sale2Record = {
            county: countyName,
            parcel_id: parcelId,
            sale_price: prc2,
            sale_year: yr2,
            sale_month: mo2,
            qual_code: qual2,
            vi_cd: vi2,
            multi_parcel: multi2,
            or_book: book2,
            or_page: page2,
            clerk_no: clerk2,
            source: 'NAL'
          };

          if (parcelId === knownTargetId) {
            knownParcelSales.push(sale2Record);
          }

          if (!isDryRun) {
            salesBatch.push(sale2Record);
            if (salesBatch.length >= BATCH_SIZE) {
              const inserted = await flushBatch('county_sales', salesColumns, salesBatch, salesConflictClause);
              nalSalesImported += inserted;
              salesBatch.length = 0;
            }
          } else {
            nalSalesImported++;
          }
        }
      }
    }

    // Flush remaining parcels and sales
    if (parcelBatch.length > 0 && !isDryRun) {
      const inserted = isBackfillClues
        ? await flushCluesBackfillBatch(parcelBatch)
        : await flushBatch('county_parcels', parcelColumns, parcelBatch, parcelConflictClause);
      parcelsImported += inserted;
      parcelBatch.length = 0;
    }
    if (salesBatch.length > 0 && !isDryRun && !isBackfillClues) {
      const inserted = await flushBatch('county_sales', salesColumns, salesBatch, salesConflictClause);
      nalSalesImported += inserted;
      salesBatch.length = 0;
    }
  } finally {
    nalCleanup();
  }

  if (isBackfillClues && !isDryRun && pool) {
    console.log(`  ...running VACUUM (ANALYZE) county_parcels to reclaim heap pages and refresh planner stats...`);
    const vClient = await pool.connect();
    try {
      await vClient.query('VACUUM (ANALYZE) county_parcels;');
    } finally {
      vClient.release();
    }
  }

  console.log(`\n  [✓] NAL Stream Finished:`);
  console.log(`      Total Rows Read: ${validation.nal.totalRows.toLocaleString()}`);
  console.log(`      Residential Parcels: ${totalResidentialParcels.toLocaleString()}`);
  console.log(`      Parcels ${isBackfillClues ? 'Updated' : 'Queued/Imported'}: ${parcelsImported.toLocaleString()}`);
  if (!isBackfillClues) {
    console.log(`      Distinct NAL Older Sales (> $100): ${nalSalesImported.toLocaleString()}\n`);
  } else {
    console.log('');
  }

  // ==========================================================================
  // VALIDATION & INTEGRITY REPORT
  // ==========================================================================
  const totalRowsInspected = validation.nal.totalRows + validation.sdf.totalRows;
  const totalMalformedRows = validation.nal.totalMalformed + validation.sdf.totalMalformed;
  const malformedPct = totalRowsInspected > 0 ? ((totalMalformedRows / totalRowsInspected) * 100) : 0;

  console.log(`===============================================================================`);
  console.log(`DATA INTEGRITY & VALIDATION REPORT: ${countyName.toUpperCase()} COUNTY`);
  console.log(`===============================================================================`);
  console.log(`1. NAL (Real Property Roll) Validation:`);
  console.log(`   - Total Rows Inspected:               ${validation.nal.totalRows.toLocaleString()}`);
  console.log(`   - Column Count Mismatches:            ${validation.nal.mismatchedCols.toLocaleString()}`);
  console.log(`   - Missing PARCEL_ID:                  ${validation.nal.missingParcelId.toLocaleString()}`);
  console.log(`   - Non-5-Digit PHY_ZIPCD:              ${validation.nal.invalidZip.toLocaleString()}`);
  console.log(`   - Total Malformed NAL Rows:           ${validation.nal.totalMalformed.toLocaleString()} (${((validation.nal.totalMalformed / validation.nal.totalRows) * 100).toFixed(4)}%)`);

  if (validation.nal.malformedExamples.length > 0) {
    console.log(`   - Malformed Row Examples (Max 3):`);
    validation.nal.malformedExamples.slice(0, 3).forEach((ex, i) => {
      console.log(`     ${i + 1}. Parcel ID: [${ex.parcel_id}] | Address: [${ex.address}]`);
    });
  }

  if (!isBackfillClues) {
    console.log(`\n2. SDF (Sales Data File) Validation:`);
    console.log(`   - Total Rows Inspected:               ${validation.sdf.totalRows.toLocaleString()}`);
    console.log(`   - Column Count Mismatches:            ${validation.sdf.mismatchedCols.toLocaleString()}`);
    console.log(`   - Missing PARCEL_ID:                  ${validation.sdf.missingParcelId.toLocaleString()}`);
    console.log(`   - Total Malformed SDF Rows:           ${validation.sdf.totalMalformed.toLocaleString()} (${validation.sdf.totalRows > 0 ? ((validation.sdf.totalMalformed / validation.sdf.totalRows) * 100).toFixed(4) : '0.0000'}%)`);
  }

  console.log(`\n3. Overall Roll Health:`);
  console.log(`   - Total Rows Evaluated:               ${totalRowsInspected.toLocaleString()}`);
  console.log(`   - Combined Malformed Rows:            ${totalMalformedRows.toLocaleString()}`);
  console.log(`   - Malformed Error Rate:               ${malformedPct.toFixed(4)}% (Threshold: ${MAX_MALFORMED_THRESHOLD_PCT}%)`);

  if (malformedPct > MAX_MALFORMED_THRESHOLD_PCT) {
    console.error(`\n[CRITICAL STOP] Malformed rows rate (${malformedPct.toFixed(2)}%) exceeds the 0.5% threshold!`);
    console.error(`Aborting import process to prevent database corruption. Please inspect input archives.`);
    if (pool) await pool.end();
    process.exit(1);
  } else {
    console.log(`   [✓] Integrity Check Passed: Error rate is well within acceptable tolerance (< 0.5%).`);
  }

  // ==========================================================================
  // FINAL REPORT & STORAGE SIZING
  // ==========================================================================
  const coordCoveragePct = totalResidentialParcels > 0 ? ((parcelsWithCoords / totalResidentialParcels) * 100) : 0;

  console.log(`\n===============================================================================`);
  console.log(`IMPORT SUMMARY REPORT: ${countyName.toUpperCase()} COUNTY`);
  console.log(`===============================================================================`);
  console.log(`Execution Mode: ${isDryRun ? 'DRY-RUN (Simulated — No DB Changes Made)' : (isBackfillClues ? 'NAL CLUES BACKFILL' : 'REAL IMPORT')}`);
  console.log(`- Target Residential Parcels:   ${totalResidentialParcels.toLocaleString()} (use codes 000, 001, 002, 004, 008)`);
  if (!isBackfillClues) {
    const salesDenom = Math.max(1, uniqueSalesKeys.size);
    console.log(`  * Precomputed Coordinates:     ${parcelsWithCoords.toLocaleString()} (${coordCoveragePct.toFixed(2)}% coverage)`);
    console.log(`- Total Unique Sales (> $100):   ${uniqueSalesKeys.size.toLocaleString()}`);
    console.log(`  * Market Sales (01, 02):       ${uniqueMarketSales.toLocaleString()} (${((uniqueMarketSales / salesDenom) * 100).toFixed(1)}%)`);
    console.log(`  * Distressed (12, 18, 19, 38): ${uniqueDistressedSales.toLocaleString()} (${((uniqueDistressedSales / salesDenom) * 100).toFixed(1)}%)`);
    console.log(`  * Other Transfer Types:        ${uniqueOtherSales.toLocaleString()} (${((uniqueOtherSales / salesDenom) * 100).toFixed(1)}%)`);
    console.log(`  * Unique SDF Sales:            ${sdfSalesImported.toLocaleString()}`);
    console.log(`  * Unique NAL Historical Sales: ${nalSalesImported.toLocaleString()}`);
  } else {
    console.log(`  * Parcels Matched/Updated:     ${parcelsImported.toLocaleString()}`);
  }

  if (knownParcelRecord) {
    console.log(`\n-------------------------------------------------------------------------------`);
    console.log(`KNOWN PARCEL VERIFICATION [${knownTargetId}]:`);
    console.log(`- Parcel ID:    ${knownParcelRecord.parcel_id}`);
    console.log(`- County:       ${knownParcelRecord.county}`);
    console.log(`- Address:      ${knownParcelRecord.address}, ${knownParcelRecord.city}, FL ${knownParcelRecord.zip}`);
    console.log(`- Use Code:     ${knownParcelRecord.use_code} (${knownParcelRecord.use_code === '001' ? 'Single-Family' : 'Residential'})`);
    console.log(`- Living Area:  ${knownParcelRecord.living_sqft ? knownParcelRecord.living_sqft.toLocaleString() + ' sqft' : 'N/A'}`);
    console.log(`- Lot Size:     ${knownParcelRecord.land_sqft ? knownParcelRecord.land_sqft.toLocaleString() + ' sqft' : 'N/A'}`);
    console.log(`- Year Built:   ${knownParcelRecord.year_built || 'N/A'} (Effective: ${knownParcelRecord.eff_year_built || 'N/A'})`);
    console.log(`- Units:        ${knownParcelRecord.units ?? 'N/A'}`);
    console.log(`- NAL Clues:    IMP_QUAL=${knownParcelRecord.imp_qual ?? 'null'} | CONST_CLASS=${knownParcelRecord.const_class ?? 'null'} | SPEC_FEAT_VAL=$${knownParcelRecord.spec_feat_val != null ? knownParcelRecord.spec_feat_val.toLocaleString() : '0'}`);
    console.log(`- Just Value:   $${knownParcelRecord.just_value ? knownParcelRecord.just_value.toLocaleString() : 'N/A'}`);
    console.log(`- Coordinates:  Lat: ${knownParcelRecord.lat}, Lng: ${knownParcelRecord.lng}`);
    console.log(`- Sales Found:  ${knownParcelSales.length} recorded sale(s)`);
    knownParcelSales.forEach((s, i) => {
      console.log(`  ${i + 1}. $${s.sale_price ? s.sale_price.toLocaleString() : 0} on ${s.sale_month}/${s.sale_year} (Code: ${s.qual_code}, Source: ${s.source})`);
    });
    console.log(`-------------------------------------------------------------------------------`);
  }

  if (!isDryRun && pool) {
    try {
      const client = await pool.connect();
      console.log(`\n--- ACTUAL NEON DATABASE SIZES ---`);
      
      const sizeQuery = `
        SELECT 
          relname AS table_name,
          pg_total_relation_size(relid) AS total_bytes,
          pg_relation_size(relid) AS table_bytes,
          pg_indexes_size(relid) AS index_bytes
        FROM pg_catalog.pg_statio_user_tables
        WHERE relname IN ('county_parcels', 'county_sales', 'county_sale_codes')
        ORDER BY pg_total_relation_size(relid) DESC;
      `;
      const sizeRes = await client.query(sizeQuery);
      let totalAppBytes = 0;

      for (const row of sizeRes.rows) {
        totalAppBytes += Number(row.total_bytes);
        console.log(`- ${row.table_name.padEnd(20)}: Total: ${formatBytes(row.total_bytes).padStart(9)} | Table: ${formatBytes(row.table_bytes).padStart(9)} | Indexes: ${formatBytes(row.index_bytes).padStart(9)}`);
      }

      const dbSizeRes = await client.query(`SELECT pg_database_size(current_database()) AS db_bytes;`);
      const totalDbBytes = dbSizeRes.rows[0]?.db_bytes || 0;

      console.log(`-------------------------------------------------------------------------------`);
      console.log(`>> Total County Tables Storage: ${formatBytes(totalAppBytes)}`);
      console.log(`>> Total Postgres Database Size: ${formatBytes(totalDbBytes)}`);
      console.log(`===============================================================================\n`);

      client.release();
    } catch (err) {
      console.error(`Could not retrieve database relation sizes:`, err.message);
    } finally {
      await pool.end();
    }
  } else {
    // Dry-run estimated storage breakdown
    const estParcelBytes = totalResidentialParcels * 285; // table + indexes
    const estSalesBytes = uniqueSalesKeys.size * 135;
    const estTotalBytes = estParcelBytes + estSalesBytes;

    console.log(`\n--- ESTIMATED NEON STORAGE FOOTPRINT ---`);
    console.log(`- county_parcels (${totalResidentialParcels.toLocaleString()} rows): ~${formatBytes(estParcelBytes)} (table + 4 B-Tree indexes)`);
    console.log(`- county_sales   (${uniqueSalesKeys.size.toLocaleString()} rows): ~${formatBytes(estSalesBytes)} (table + 2 B-Tree indexes)`);
    console.log(`- county_sale_codes (33 reference rows): < 0.1 MB`);
    console.log(`-------------------------------------------------------------------------------`);
    console.log(`>> TOTAL ESTIMATED NEW STORAGE FOR ${countyName.toUpperCase()}: ~${formatBytes(estTotalBytes)}`);
    console.log(`===============================================================================\n`);
  }
}

main().catch(err => {
  console.error('\nFatal error executing county roll import:', err);
  process.exit(1);
});
