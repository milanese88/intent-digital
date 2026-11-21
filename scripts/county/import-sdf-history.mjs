/**
 * scripts/county/import-sdf-history.mjs
 *
 * Imports prior-year Florida Department of Revenue (DOR) SDF files (e.g. 2025F, 2024F, 2023F)
 * for Broward (16), Palm Beach (60), and Martin (53) into `county_sales`.
 *
 * Source archives expected in:
 *   data/county/<county>/sdf-history/*.zip or *.csv
 *   e.g.:
 *     data/county/broward/sdf-history/SDF162024F.zip
 *     data/county/palm-beach/sdf-history/SDF602024F.zip
 *     data/county/martin/sdf-history/SDF532024F.zip
 *
 * Deduplication:
 *   Deduplicates against in-memory key AND database on:
 *   (county, parcel_id, sale_year, sale_month, sale_price, or_book, or_page)
 *   via PostgreSQL unique constraint `uq_county_sales`.
 *
 * Usage:
 *   node scripts/county/import-sdf-history.mjs --dry-run
 *   node scripts/county/import-sdf-history.mjs --county=Broward --dry-run
 *   node scripts/county/import-sdf-history.mjs --county=all
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import dotenv from 'dotenv';
import { normalizeCountyName, getCountyConfig } from './_counties.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_DATA_DIR = path.resolve(PROJECT_ROOT, 'data/county');

// Load .env.local
const envLocalPath = path.resolve(PROJECT_ROOT, '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

// DOR residential target land use codes
const RESIDENTIAL_USE_CODES = new Set(['000', '001', '002', '004', '008']);

// Batch size for PostgreSQL inserts
const BATCH_SIZE = 1000;

function formatBytes(bytes) {
  const num = Number(bytes) || 0;
  if (num >= 1024 * 1024 * 1024) {
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
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

function findHistoryFiles(countyDir) {
  const historyDir = path.join(countyDir, 'sdf-history');
  if (!fs.existsSync(historyDir)) return [];
  const entries = fs.readdirSync(historyDir);
  return entries
    .filter((file) => {
      const lower = file.toLowerCase();
      return (lower.endsWith('.zip') || lower.endsWith('.csv')) && !lower.startsWith('.');
    })
    .map((file) => path.join(historyDir, file));
}

async function main() {
  const args = process.argv.slice(2);
  const rawCountyArg = args.find((a) => a.startsWith('--county='))?.split('=')[1] || 'all';
  const isDryRun = args.includes('--dry-run');

  console.log('===============================================================================');
  console.log('INTENT DIGITAL — PRIOR-YEAR DOR SDF HISTORY IMPORT TO POSTGRESQL');
  console.log(`Target: [${rawCountyArg}] | Mode: [${isDryRun ? 'DRY-RUN (Simulate only)' : 'PRODUCTION IMPORT'}]`);
  console.log('===============================================================================');

  const countiesToProcess =
    rawCountyArg === 'all'
      ? ['Broward', 'Palm Beach', 'Martin']
      : [normalizeCountyName(rawCountyArg) || rawCountyArg];

  let pool = null;
  if (!isDryRun) {
    const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('\n[!] Error: SUPABASE_DATABASE_URL / DATABASE_URL not set in .env.local\n');
      process.exit(1);
    }
    const { createScriptPool } = await import('../../api/_lib/db.js');
    pool = createScriptPool(dbUrl);
  }

  const salesColumns = [
    'county',
    'parcel_id',
    'sale_price',
    'sale_year',
    'sale_month',
    'qual_code',
    'vi_cd',
    'multi_parcel',
    'or_book',
    'or_page',
    'clerk_no',
    'source'
  ];
  const salesConflictClause = `ON CONFLICT (county, parcel_id, sale_year, sale_month, sale_price, or_book, or_page) DO NOTHING`;

  let grandTotalParsed = 0;
  let grandTotalResidential = 0;
  let grandTotalUnique = 0;
  let grandTotalInserted = 0;

  for (const countyName of countiesToProcess) {
    const countyConfig = getCountyConfig(countyName);
    if (!countyConfig) {
      console.warn(`[!] Skipping unrecognized county: ${countyName}`);
      continue;
    }

    const countyDirName = countyName.toLowerCase().replace(/\s+/g, '-');
    const countyDir = path.join(DEFAULT_DATA_DIR, countyDirName);
    const historyFiles = findHistoryFiles(countyDir);

    console.log(`\n--- ${countyName.toUpperCase()} (DOR Code: ${countyConfig.dorCode}) ---`);
    console.log(`Directory: ${path.relative(PROJECT_ROOT, path.join(countyDir, 'sdf-history'))}`);

    if (historyFiles.length === 0) {
      console.log(`  [i] No prior-year SDF files found in ${path.relative(PROJECT_ROOT, path.join(countyDir, 'sdf-history'))}`);
      console.log(`      Place prior-year DOR SDF files here (e.g. SDF${countyConfig.dorCode}2024F.zip, SDF${countyConfig.dorCode}2023F.zip).`);
      continue;
    }

    console.log(`  Found ${historyFiles.length} history archive(s):`);
    for (const hf of historyFiles) {
      const sz = (fs.statSync(hf).size / (1024 * 1024)).toFixed(1);
      console.log(`    - ${path.basename(hf)} (${sz} MB)`);
    }

    // In-memory dedupe set for this county session
    const countySalesKeys = new Set();
    const salesBatch = [];

    for (const filePath of historyFiles) {
      const fileName = path.basename(filePath);
      console.log(`\n  Streaming: ${fileName} ...`);
      const { parser, cleanup } = createCsvStream(filePath);

      let headers = null;
      const colMap = {};
      let fileRows = 0;
      let fileResidential = 0;
      let fileNewSales = 0;

      try {
        for await (const row of parser) {
          if (!headers) {
            headers = row.map((h) => h.trim().toUpperCase());
            headers.forEach((h, idx) => {
              colMap[h] = idx;
            });
            continue;
          }

          fileRows++;
          if (fileRows % 50000 === 0) {
            process.stdout.write(`    ...streamed ${(fileRows / 1000).toLocaleString()}k rows\r`);
          }

          const parcelId = row[colMap['PARCEL_ID']]?.trim();
          if (!parcelId) continue;

          const rawUseCode = row[colMap['DOR_UC']]?.trim() || '';
          const normalizedUse = rawUseCode.padStart(3, '0');
          // Filter for residential unless DOR_UC column is absent
          if (colMap['DOR_UC'] !== undefined && !RESIDENTIAL_USE_CODES.has(normalizedUse)) {
            continue;
          }

          const salePrice = Number(row[colMap['SALE_PRC']]) || 0;
          if (salePrice <= 100) continue;

          fileResidential++;

          const saleYr = Number(row[colMap['SALE_YR']]) || null;
          const saleMo = Number(row[colMap['SALE_MO']]) || null;
          const qualCd = row[colMap['QUAL_CD']]?.trim() || '00';
          const viCd = row[colMap['VI_CD']]?.trim() || null;
          const multiPar = row[colMap['MULTI_PAR_SAL']]?.trim() || null;
          const orBook = row[colMap['OR_BOOK']]?.trim() || '';
          const orPage = row[colMap['OR_PAGE']]?.trim() || '';
          const clerkNo = row[colMap['CLERK_NO']]?.trim() || '';

          const saleKey = `${countyName}|${parcelId}|${saleYr}|${saleMo}|${salePrice}|${orBook}|${orPage}`;
          if (countySalesKeys.has(saleKey)) continue;
          countySalesKeys.add(saleKey);
          fileNewSales++;

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
            source: 'SDF_HISTORY'
          };

          if (!isDryRun) {
            salesBatch.push(record);
            if (salesBatch.length >= BATCH_SIZE) {
              const { query, values } = buildBatchInsert('county_sales', salesColumns, salesBatch, salesConflictClause);
              const client = await pool.connect();
              try {
                const res = await client.query(query, values);
                grandTotalInserted += res.rowCount || 0;
              } finally {
                client.release();
              }
              salesBatch.length = 0;
            }
          }
        }

        if (salesBatch.length > 0 && !isDryRun) {
          const { query, values } = buildBatchInsert('county_sales', salesColumns, salesBatch, salesConflictClause);
          const client = await pool.connect();
          try {
            const res = await client.query(query, values);
            grandTotalInserted += res.rowCount || 0;
          } finally {
            client.release();
          }
          salesBatch.length = 0;
        }
      } finally {
        cleanup();
      }

      console.log(`    [✓] Finished ${fileName}: ${fileRows.toLocaleString()} rows read · ${fileResidential.toLocaleString()} residential sales · ${fileNewSales.toLocaleString()} unique`);
      grandTotalParsed += fileRows;
      grandTotalResidential += fileResidential;
      grandTotalUnique += fileNewSales;
    }
  }

  if (pool) {
    await pool.end();
  }

  const estBytes = grandTotalUnique * 260; // ~260 bytes per row with table + 2 B-Tree indexes
  console.log('\n===============================================================================');
  console.log('SDF HISTORY IMPORT SUMMARY:');
  console.log(`  Total Rows Streamed:     ${grandTotalParsed.toLocaleString()}`);
  console.log(`  Residential Sales (> $100): ${grandTotalResidential.toLocaleString()}`);
  console.log(`  Unique Sales Identified: ${grandTotalUnique.toLocaleString()}`);
  if (!isDryRun) {
    console.log(`  New Rows Inserted:       ${grandTotalInserted.toLocaleString()}`);
  } else {
    console.log(`  Est. Net DB Growth:      ~${formatBytes(estBytes)} (~${grandTotalUnique.toLocaleString()} rows)`);
    console.log('  To execute production insert, run without --dry-run after approval.');
  }
  console.log('===============================================================================\n');
}

main().catch((err) => {
  console.error('[!] Fatal error in import-sdf-history:', err);
  process.exit(1);
});
