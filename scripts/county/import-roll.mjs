#!/usr/bin/env node

/**
 * import-roll.mjs
 * 
 * Production ETL script to import Florida Department of Revenue (FDOR) property rolls
 * into Neon PostgreSQL for Intent Digital.
 * 
 * Scope:
 * - Only imports residential parcels (DOR Use Codes 000, 001, 002, 004, 008).
 * - Imports SDF sales transactions + NAL historical sales (deduplicated).
 * - Skips $0 and $100-or-less transfers (nominal/non-market).
 * - Zero PII: Owner names, mailing addresses, fiduciary and exemption data are never stored.
 * - Supports --dry-run to simulate and verify counts before touching the database.
 * 
 * Usage:
 *   node scripts/county/import-roll.mjs --county=Broward [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

// Batch size for PostgreSQL inserts (500 rows per batch = ~8.5k parameters, safely under Postgres 65k limit)
const BATCH_SIZE = 500;

/**
 * Fast streaming CSV parser that handles quoted values without full memory buffering.
 */
function parseDelimitedLine(line, delimiter = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;
  const len = line.length;

  for (let i = 0; i < len; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < len && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Creates a stream from a .zip or flat file using native child process for minimal memory footprint.
 */
function createInputStream(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.zip') {
    const child = spawn('unzip', ['-p', filePath]);
    child.stderr.on('data', () => {});
    return { stream: child.stdout, cleanup: () => child.kill() };
  }
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  return { stream, cleanup: () => stream.destroy() };
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
  const countyArg = args.find(a => a.startsWith('--county='))?.split('=')[1] || 'Broward';
  const isDryRun = args.includes('--dry-run');

  console.log(`===============================================================================`);
  console.log(`INTENT DIGITAL — COUNTY ROLL IMPORT TO NEON POSTGRESQL`);
  console.log(`Target County: [${countyArg}] | Execution Mode: [${isDryRun ? 'DRY-RUN (Simulate only)' : 'PRODUCTION IMPORT'}]`);
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
      // Test connectivity
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

  // Locate County NAL and SDF files in data/county/
  const files = fs.readdirSync(DEFAULT_DATA_DIR);
  const countyPattern = countyArg.toLowerCase();
  
  const nalFile = files.find(f => f.toLowerCase().includes(countyPattern) && f.toUpperCase().includes('NAL'));
  const sdfFile = files.find(f => f.toLowerCase().includes(countyPattern) && f.toUpperCase().includes('SDF'));

  if (!nalFile || !sdfFile) {
    console.error(`\n[!] Missing roll file(s) for ${countyArg} in ${DEFAULT_DATA_DIR}`);
    if (!nalFile) console.error(`  - Missing NAL file for ${countyArg}`);
    if (!sdfFile) console.error(`  - Missing SDF file for ${countyArg}`);
    process.exit(1);
  }

  const nalPath = path.join(DEFAULT_DATA_DIR, nalFile);
  const sdfPath = path.join(DEFAULT_DATA_DIR, sdfFile);

  console.log(`\nFound Source Archives:`);
  console.log(`  - NAL: ${nalFile} (${(fs.statSync(nalPath).size / (1024 * 1024)).toFixed(1)} MB)`);
  console.log(`  - SDF: ${sdfFile} (${(fs.statSync(sdfPath).size / (1024 * 1024)).toFixed(1)} MB)\n`);

  // Tracking counters
  let totalNalRows = 0;
  let totalResidentialParcels = 0;
  let parcelsImported = 0;

  let totalSdfRows = 0;
  let totalSdfResidentialSales = 0;
  let sdfSalesImported = 0;

  let totalNalSalesKept = 0;
  let nalSalesImported = 0;

  const parcelBatch = [];
  const salesBatch = [];

  // In-memory set for sales deduplication during dry-run or pre-batching
  // Key: county|parcel_id|sale_year|sale_month|sale_price|or_book|or_page
  const uniqueSalesKeys = new Set();

  const parcelColumns = [
    'county', 'parcel_id', 'address', 'city', 'zip', 'use_code',
    'living_sqft', 'year_built', 'eff_year_built', 'land_sqft', 'units',
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
      just_value = EXCLUDED.just_value,
      nbrhd_cd = EXCLUDED.nbrhd_cd,
      mkt_ar = EXCLUDED.mkt_ar,
      roll_year = EXCLUDED.roll_year,
      imported_at = now()
  `;

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
  console.log(`--- [1/2] Processing Sales Data File (SDF) ---`);
  const { stream: sdfStream, cleanup: sdfCleanup } = createInputStream(sdfPath);
  const rlSdf = readline.createInterface({ input: sdfStream, crlfDelay: Infinity });

  let sdfHeaders = null;
  let sdfMap = {};

  try {
    for await (const line of rlSdf) {
      if (!line || !line.trim()) continue;

      if (!sdfHeaders) {
        sdfHeaders = parseDelimitedLine(line).map(h => h.trim().replace(/^["']|["']$/g, '').toUpperCase());
        sdfMap = {
          parcel_id: sdfHeaders.indexOf('PARCEL_ID'),
          use_code: sdfHeaders.indexOf('DOR_UC'),
          sale_prc: sdfHeaders.indexOf('SALE_PRC'),
          sale_yr: sdfHeaders.indexOf('SALE_YR'),
          sale_mo: sdfHeaders.indexOf('SALE_MO'),
          qual_cd: sdfHeaders.indexOf('QUAL_CD'),
          vi_cd: sdfHeaders.indexOf('VI_CD'),
          multi_par: sdfHeaders.indexOf('MULTI_PAR_SAL'),
          or_book: sdfHeaders.indexOf('OR_BOOK'),
          or_page: sdfHeaders.indexOf('OR_PAGE'),
          clerk_no: sdfHeaders.indexOf('CLERK_NO')
        };
        continue;
      }

      totalSdfRows++;
      if (totalSdfRows % 50000 === 0) {
        process.stdout.write(`  ...streamed ${(totalSdfRows / 1000).toLocaleString()}k SDF rows\r`);
      }

      const cols = parseDelimitedLine(line).map(c => c.trim().replace(/^["']|["']$/g, ''));
      const rawUseCode = cols[sdfMap.use_code] || '';
      const normalizedUse = rawUseCode.padStart(3, '0');

      // Keep only target residential
      if (!RESIDENTIAL_USE_CODES.has(normalizedUse)) continue;

      const salePrice = Number(cols[sdfMap.sale_prc]) || 0;
      // Skip $0 and $100-or-less sales
      if (salePrice <= 100) continue;

      totalSdfResidentialSales++;

      const parcelId = cols[sdfMap.parcel_id];
      const saleYr = Number(cols[sdfMap.sale_yr]) || null;
      const saleMo = Number(cols[sdfMap.sale_mo]) || null;
      const qualCd = cols[sdfMap.qual_cd] || '00';
      const viCd = cols[sdfMap.vi_cd] || null;
      const multiPar = cols[sdfMap.multi_par] || null;
      const orBook = cols[sdfMap.or_book] || '';
      const orPage = cols[sdfMap.or_page] || '';
      const clerkNo = cols[sdfMap.clerk_no] || '';

      const saleKey = `${countyArg}|${parcelId}|${saleYr}|${saleMo}|${salePrice}|${orBook}|${orPage}`;
      if (uniqueSalesKeys.has(saleKey)) continue;
      uniqueSalesKeys.add(saleKey);

      const record = {
        county: countyArg,
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
  console.log(`      Total Rows Read: ${totalSdfRows.toLocaleString()}`);
  console.log(`      Residential Sales (> $100): ${totalSdfResidentialSales.toLocaleString()}`);
  console.log(`      Unique SDF Sales Queued/Imported: ${sdfSalesImported.toLocaleString()}\n`);

  // ==========================================================================
  // PHASE 2: STREAM NAL PARCELS & HISTORICAL SALES (SALE_PRC1 & SALE_PRC2)
  // ==========================================================================
  console.log(`--- [2/2] Processing Real Property Roll (NAL) ---`);
  const { stream: nalStream, cleanup: nalCleanup } = createInputStream(nalPath);
  const rlNal = readline.createInterface({ input: nalStream, crlfDelay: Infinity });

  let nalHeaders = null;
  let nalMap = {};

  try {
    for await (const line of rlNal) {
      if (!line || !line.trim()) continue;

      if (!nalHeaders) {
        nalHeaders = parseDelimitedLine(line).map(h => h.trim().replace(/^["']|["']$/g, '').toUpperCase());
        nalMap = {
          parcel_id: nalHeaders.indexOf('PARCEL_ID'),
          address: nalHeaders.indexOf('PHY_ADDR1'),
          city: nalHeaders.indexOf('PHY_CITY'),
          zip: nalHeaders.indexOf('PHY_ZIPCD'),
          use_code: nalHeaders.indexOf('DOR_UC'),
          living_sqft: nalHeaders.indexOf('TOT_LVG_AREA'),
          year_built: nalHeaders.indexOf('ACT_YR_BLT'),
          eff_year_built: nalHeaders.indexOf('EFF_YR_BLT'),
          land_sqft: nalHeaders.indexOf('LND_SQFOOT'),
          units: nalHeaders.indexOf('NO_RES_UNTS'),
          just_value: nalHeaders.indexOf('JV'),
          nbrhd_cd: nalHeaders.indexOf('NBRHD_CD'),
          mkt_ar: nalHeaders.indexOf('MKT_AR'),
          roll_year: nalHeaders.indexOf('ASMNT_YR'),

          // Sale 1
          sale_prc1: nalHeaders.indexOf('SALE_PRC1'),
          sale_yr1: nalHeaders.indexOf('SALE_YR1'),
          sale_mo1: nalHeaders.indexOf('SALE_MO1'),
          qual_cd1: nalHeaders.indexOf('QUAL_CD1'),
          vi_cd1: nalHeaders.indexOf('VI_CD1'),
          multi_par1: nalHeaders.indexOf('MULTI_PAR_SAL1'),
          or_book1: nalHeaders.indexOf('OR_BOOK1'),
          or_page1: nalHeaders.indexOf('OR_PAGE1'),
          clerk_no1: nalHeaders.indexOf('CLERK_NO1'),

          // Sale 2
          sale_prc2: nalHeaders.indexOf('SALE_PRC2'),
          sale_yr2: nalHeaders.indexOf('SALE_YR2'),
          sale_mo2: nalHeaders.indexOf('SALE_MO2'),
          qual_cd2: nalHeaders.indexOf('QUAL_CD2'),
          vi_cd2: nalHeaders.indexOf('VI_CD2'),
          multi_par2: nalHeaders.indexOf('MULTI_PAR_SAL2'),
          or_book2: nalHeaders.indexOf('OR_BOOK2'),
          or_page2: nalHeaders.indexOf('OR_PAGE2'),
          clerk_no2: nalHeaders.indexOf('CLERK_NO2')
        };
        continue;
      }

      totalNalRows++;
      if (totalNalRows % 50000 === 0) {
        process.stdout.write(`  ...streamed ${(totalNalRows / 1000).toLocaleString()}k NAL rows\r`);
      }

      const cols = parseDelimitedLine(line).map(c => c.trim().replace(/^["']|["']$/g, ''));
      const rawUseCode = cols[nalMap.use_code] || '';
      const normalizedUse = rawUseCode.padStart(3, '0');

      // Keep only target residential
      if (!RESIDENTIAL_USE_CODES.has(normalizedUse)) continue;

      totalResidentialParcels++;

      const parcelId = cols[nalMap.parcel_id];
      const address = cols[nalMap.address] || null;
      const city = cols[nalMap.city] || null;
      const rawZip = cols[nalMap.zip] || '';
      const zip = rawZip ? rawZip.substring(0, 5) : null;
      const livingSqft = cols[nalMap.living_sqft] ? parseInt(cols[nalMap.living_sqft], 10) || null : null;
      const yearBuilt = cols[nalMap.year_built] ? parseInt(cols[nalMap.year_built], 10) || null : null;
      const effYearBuilt = cols[nalMap.eff_year_built] ? parseInt(cols[nalMap.eff_year_built], 10) || null : null;
      const landSqft = cols[nalMap.land_sqft] ? parseInt(cols[nalMap.land_sqft], 10) || null : null;
      
      let units = cols[nalMap.units] ? parseInt(cols[nalMap.units], 10) || null : null;
      if (units === null && (normalizedUse === '001' || normalizedUse === '004')) {
        units = 1;
      }

      const justValue = cols[nalMap.just_value] ? parseFloat(cols[nalMap.just_value]) || null : null;
      const nbrhdCd = cols[nalMap.nbrhd_cd] || null;
      const mktAr = cols[nalMap.mkt_ar] || null;
      const rollYear = cols[nalMap.roll_year] ? parseInt(cols[nalMap.roll_year], 10) || 2026 : 2026;

      const parcelRecord = {
        county: countyArg,
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
        just_value: justValue,
        nbrhd_cd: nbrhdCd,
        mkt_ar: mktAr,
        lat: null,
        lng: null,
        roll_year: rollYear
      };

      if (!isDryRun) {
        parcelBatch.push(parcelRecord);
        if (parcelBatch.length >= BATCH_SIZE) {
          const inserted = await flushBatch('county_parcels', parcelColumns, parcelBatch, parcelConflictClause);
          parcelsImported += inserted;
          parcelBatch.length = 0;
        }
      } else {
        parcelsImported++;
      }

      // Check NAL Sale 1
      const prc1 = Number(cols[nalMap.sale_prc1]) || 0;
      if (prc1 > 100) {
        const yr1 = Number(cols[nalMap.sale_yr1]) || null;
        const mo1 = Number(cols[nalMap.sale_mo1]) || null;
        const book1 = cols[nalMap.or_book1] || '';
        const page1 = cols[nalMap.or_page1] || '';
        const clerk1 = cols[nalMap.clerk_no1] || '';
        const qual1 = cols[nalMap.qual_cd1] || '00';
        const vi1 = cols[nalMap.vi_cd1] || null;
        const multi1 = cols[nalMap.multi_par1] || null;

        const key1 = `${countyArg}|${parcelId}|${yr1}|${mo1}|${prc1}|${book1}|${page1}`;
        if (!uniqueSalesKeys.has(key1)) {
          uniqueSalesKeys.add(key1);
          totalNalSalesKept++;

          const sale1Record = {
            county: countyArg,
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
      const prc2 = Number(cols[nalMap.sale_prc2]) || 0;
      if (prc2 > 100) {
        const yr2 = Number(cols[nalMap.sale_yr2]) || null;
        const mo2 = Number(cols[nalMap.sale_mo2]) || null;
        const book2 = cols[nalMap.or_book2] || '';
        const page2 = cols[nalMap.or_page2] || '';
        const clerk2 = cols[nalMap.clerk_no2] || '';
        const qual2 = cols[nalMap.qual_cd2] || '00';
        const vi2 = cols[nalMap.vi_cd2] || null;
        const multi2 = cols[nalMap.multi_par2] || null;

        const key2 = `${countyArg}|${parcelId}|${yr2}|${mo2}|${prc2}|${book2}|${page2}`;
        if (!uniqueSalesKeys.has(key2)) {
          uniqueSalesKeys.add(key2);
          totalNalSalesKept++;

          const sale2Record = {
            county: countyArg,
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
      const inserted = await flushBatch('county_parcels', parcelColumns, parcelBatch, parcelConflictClause);
      parcelsImported += inserted;
      parcelBatch.length = 0;
    }
    if (salesBatch.length > 0 && !isDryRun) {
      const inserted = await flushBatch('county_sales', salesColumns, salesBatch, salesConflictClause);
      nalSalesImported += inserted;
      salesBatch.length = 0;
    }
  } finally {
    nalCleanup();
  }

  console.log(`\n  [✓] NAL Stream Finished:`);
  console.log(`      Total Rows Read: ${totalNalRows.toLocaleString()}`);
  console.log(`      Residential Parcels: ${totalResidentialParcels.toLocaleString()}`);
  console.log(`      Parcels Queued/Imported: ${parcelsImported.toLocaleString()}`);
  console.log(`      Distinct NAL Older Sales (> $100): ${nalSalesImported.toLocaleString()}\n`);

  // ==========================================================================
  // FINAL REPORT & STORAGE SIZING
  // ==========================================================================
  console.log(`===============================================================================`);
  console.log(`IMPORT SUMMARY REPORT: ${countyArg.toUpperCase()} COUNTY`);
  console.log(`===============================================================================`);
  console.log(`Execution Mode: ${isDryRun ? 'DRY-RUN (Simulated — No DB Changes Made)' : 'REAL IMPORT'}`);
  console.log(`- Target Residential Parcels: ${totalResidentialParcels.toLocaleString()} (use codes 000, 001, 002, 004, 008)`);
  console.log(`- Total Unique Sales (> $100): ${uniqueSalesKeys.size.toLocaleString()}`);
  console.log(`  * From SDF:                 ${sdfSalesImported.toLocaleString()}`);
  console.log(`  * From NAL (deduplicated):  ${nalSalesImported.toLocaleString()}`);

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
    console.log(`- county_parcels (${totalResidentialParcels.toLocaleString()} rows): ~${formatBytes(estParcelBytes)} (table + 3 B-Tree indexes)`);
    console.log(`- county_sales   (${uniqueSalesKeys.size.toLocaleString()} rows): ~${formatBytes(estSalesBytes)} (table + 2 B-Tree indexes)`);
    console.log(`- county_sale_codes (33 reference rows): < 0.1 MB`);
    console.log(`-------------------------------------------------------------------------------`);
    console.log(`>> TOTAL ESTIMATED DATABASE FOOTPRINT: ~${formatBytes(estTotalBytes)}`);
    console.log(`===============================================================================\n`);
  }
}

main().catch(err => {
  console.error('\nFatal error executing county roll import:', err);
  process.exit(1);
});
