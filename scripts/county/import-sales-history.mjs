#!/usr/bin/env node

/**
 * scripts/county/import-sales-history.mjs
 *
 * Fast, bulk historical deed transfer importer for Florida counties.
 * Streams data directly into a temporary PostgreSQL staging table using Postgres COPY,
 * then merges in ONE single transaction into `county_sales`.
 *
 * Supported Sources:
 *   --source=cama  (Palm Beach PAPA CAMA PAS405E TXT files)
 *   --source=sdf   (Florida Department of Revenue SDF CSV/ZIP files)
 *
 * Supported Counties:
 *   --county=palm-beach | broward | martin
 *
 * Features:
 *   - No row-by-row inserts (streams via Postgres COPY FROM STDIN)
 *   - Strictly privacy-safe (zero owner names or mailing addresses)
 *   - Matches (folio, sale_date, price, book, page) to treat SDF + CAMA duplicates as one
 *   - Maps qualification flags to standardized codes ('01' qualified arm's length market, '11' non-market/disqualified)
 *   - Skips transfers under $1,000
 *   - Dry-run by default: reports rows found, already present, to insert, date range, DB growth.
 *   - Run with --apply to commit into county_sales.
 *
 * Usage:
 *   node scripts/county/import-sales-history.mjs --county=palm-beach --source=cama
 *   node scripts/county/import-sales-history.mjs --county=palm-beach --source=cama --apply
 *   node scripts/county/import-sales-history.mjs --county=broward --source=sdf
 *   node scripts/county/import-sales-history.mjs --county=martin --source=sdf
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { parse } from 'csv-parse';
import { parseCamaDate } from '../../api/_lib/camaSales.js';
import { getScriptDb } from '../../api/_lib/db.js';
import { normalizeCountyName } from '../../src/config/counties.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const envLocalPath = path.resolve(PROJECT_ROOT, '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

function formatBytes(bytes) {
  const num = Number(bytes) || 0;
  if (num >= 1024 * 1024 * 1024) return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  if (num >= 1024) return `${(num / 1024).toFixed(2)} KB`;
  return `${num} B`;
}

function findSourceFile(county, source, explicitFile = null) {
  if (explicitFile && fs.existsSync(explicitFile)) return explicitFile;

  const baseCountyDir = path.resolve(PROJECT_ROOT, 'data/county');

  if (source === 'cama') {
    const pbCamaDir = path.resolve(baseCountyDir, 'palm-beach/CAMA_CSV_CERT2026');
    if (fs.existsSync(pbCamaDir)) {
      const candidates = fs.readdirSync(pbCamaDir)
        .filter((f) => /PAS405.*CERT.*\.TXT$/i.test(f) && !f.includes('_RPT_'))
        .sort((a, b) => b.localeCompare(a));
      if (candidates[0]) return path.join(pbCamaDir, candidates[0]);
    }
  }

  // SDF search: check sdf-history/ then root county dir
  const countyAliases = [
    county.toLowerCase(),
    county.toLowerCase().replace(/\s+/g, '-'),
    `${county.toUpperCase()} COUNTY`
  ];

  for (const cName of countyAliases) {
    const cDir = path.resolve(baseCountyDir, cName);
    if (!fs.existsSync(cDir)) continue;

    // Check sdf-history subdirectory first
    const histDir = path.join(cDir, 'sdf-history');
    if (fs.existsSync(histDir)) {
      const histFiles = fs.readdirSync(histDir)
        .filter((f) => /\.(csv|zip|txt)$/i.test(f) && !f.startsWith('.'))
        .sort((a, b) => b.localeCompare(a));
      if (histFiles[0]) return path.join(histDir, histFiles[0]);
    }

    // Check county root for SDF archives
    const rootFiles = fs.readdirSync(cDir)
      .filter((f) => /SDF.*\.(csv|zip|txt)$/i.test(f) && !f.startsWith('.'))
      .sort((a, b) => b.localeCompare(a));
    if (rootFiles[0]) return path.join(cDir, rootFiles[0]);
  }

  return null;
}

export async function run() {
  const args = process.argv.slice(2);
  const countyArg = args.find((a) => a.startsWith('--county='))?.split('=')[1] || 'palm-beach';
  const county = normalizeCountyName(countyArg) || countyArg;
  const sourceArg = args.find((a) => a.startsWith('--source='))?.split('=')[1]?.toLowerCase() || (county === 'Palm Beach' ? 'cama' : 'sdf');
  const isApply = args.includes('--apply');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  const explicitFile = args.find((a) => a.startsWith('--file='))?.split('=')[1] || null;

  const filePath = findSourceFile(county, sourceArg, explicitFile);
  if (!filePath) {
    console.error(`[!] No source file found for county="${county}", source="${sourceArg}".`);
    console.error(`    Place source file in data/county/${county.toLowerCase()}/ (e.g. sdf-history/ or CAMA_CSV_CERT2026/).`);
    process.exit(1);
  }

  const stat = fs.statSync(filePath);
  console.log(`================================================================`);
  console.log(`Historical Sales Importer (Fast Postgres COPY)`);
  console.log(`County:      ${county}`);
  console.log(`Source Type: ${sourceArg.toUpperCase()}`);
  console.log(`File:        ${filePath} (${formatBytes(stat.size)})`);
  console.log(`Mode:        ${isApply ? 'APPLY (writing to database)' : 'DRY RUN (no DB writes)'}`);
  console.log(`================================================================\n`);

  const sql = getScriptDb(undefined, { max: 1 });

  // 1. Get initial database size and county_sales counts
  const [dbSizeRow] = await sql`SELECT pg_database_size(current_database()) AS bytes`;
  const initialDbSize = Number(dbSizeRow?.bytes) || 0;

  const [initialSalesCountRow] = await sql`
    SELECT COUNT(*) AS count FROM county_sales WHERE county = ${county}
  `;
  const initialCountySales = Number(initialSalesCountRow?.count) || 0;

  console.log(`Current Database Size: ${formatBytes(initialDbSize)}`);
  console.log(`Existing Sales (${county}): ${initialCountySales.toLocaleString()}\n`);

  // 2. Create staging table with UNLOGGED performance
  console.log(`[1/4] Initializing staging table...`);
  await sql`
    CREATE UNLOGGED TABLE IF NOT EXISTS staging_historical_sales (
      county text,
      parcel_id text,
      sale_price numeric,
      sale_year integer,
      sale_month integer,
      qual_code text,
      vi_cd text,
      multi_parcel text,
      or_book text,
      or_page text,
      clerk_no text,
      source text
    );
  `;
  await sql`TRUNCATE TABLE staging_historical_sales;`;

  // 3. Stream data using Postgres COPY
  console.log(`[2/4] Streaming source records into staging via Postgres COPY...`);
  const copyStream = await sql`
    COPY staging_historical_sales (
      county, parcel_id, sale_price, sale_year, sale_month, qual_code, vi_cd, multi_parcel, or_book, or_page, clerk_no, source
    ) FROM STDIN WITH (FORMAT text, DELIMITER E'\t', NULL '')
  `.writable();

  let lineCount = 0;
  let parsedSalesCount = 0;
  const startStream = Date.now();

  if (sourceArg === 'cama') {
    // Palm Beach CAMA PAS405 TXT reader
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.includes(',SALE,')) continue;
      lineCount++;

      const parts = line.split(',');
      const cleanFolio = parts[0]?.replace(/[^0-9]/g, '');
      if (!cleanFolio || cleanFolio.length !== 17) continue;

      const remaining = parts.slice(2);
      const TUPLE_LEN = 7;
      for (let i = 0; i + TUPLE_LEN <= remaining.length; i += TUPLE_LEN) {
        const orBook = remaining[i]?.trim();
        const orPage = remaining[i + 1]?.trim();
        const rawDate = remaining[i + 2]?.trim();
        const qual = remaining[i + 4]?.trim();
        const vi = remaining[i + 5]?.trim() || null;
        const rawPrice = remaining[i + 6]?.trim();

        const price = Math.round(parseFloat(rawPrice) || 0);
        if (price < 1000) continue; // Skip transfers under $1,000

        const dateObj = parseCamaDate(rawDate);
        if (!dateObj || !dateObj.year || dateObj.year < 1970) continue;

        // Only qualified arm's-length sales (Q) count as market sales ('01').
        // Non-Q transfers (U, D, etc.) are stored but flagged non-market ('11', is_market = false).
        const qualCode = String(qual || '').toUpperCase() === 'Q' ? '01' : '11';
        const viCd = vi === 'V' ? 'V' : 'I';

        const rowTsv = [
          county,
          cleanFolio,
          price,
          dateObj.year,
          dateObj.month,
          qualCode,
          viCd,
          '', // multi_parcel
          orBook || '',
          orPage || '',
          '', // clerk_no
          'county record'
        ].join('\t') + '\n';

        parsedSalesCount++;
        copyStream.write(rowTsv);
      }

      if (limit && lineCount >= limit) break;
    }
  } else {
    // Florida Department of Revenue SDF reader (CSV or ZIP)
    const isZip = filePath.endsWith('.zip');
    let csvStream;

    if (isZip) {
      const unzipProc = spawn('unzip', ['-p', filePath]);
      csvStream = unzipProc.stdout;
    } else {
      csvStream = fs.createReadStream(filePath);
    }

    const parser = parse({
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true
    });

    csvStream.pipe(parser);

    let headers = null;
    let idxMap = {};

    for await (const row of parser) {
      if (!headers) {
        headers = row.map((h) => h.trim().toUpperCase());
        headers.forEach((h, i) => { idxMap[h] = i; });
        continue;
      }
      lineCount++;

      const parcelId = (row[idxMap.PARCEL_ID] || row[idxMap.PARCELID] || '').replace(/[^0-9A-Za-z]/g, '');
      const rawPrice = parseFloat(row[idxMap.SALE_PRC] || row[idxMap.PRICE] || 0);
      const price = Math.round(rawPrice);
      if (price < 1000 || !parcelId) continue; // Skip transfers under $1,000

      const saleYr = parseInt(row[idxMap.SALE_YR] || row[idxMap.SALEYEAR] || 0, 10);
      const saleMo = parseInt(row[idxMap.SALE_MO] || row[idxMap.SALEMONTH] || 1, 10);
      if (!saleYr || saleYr < 1970) continue;

      const qual = row[idxMap.QUAL_CD] || row[idxMap.QUAL] || '01';
      const vi = row[idxMap.VI_CD] || row[idxMap.VI] || 'I';
      const orBook = row[idxMap.OR_BOOK] || row[idxMap.BOOK] || '';
      const orPage = row[idxMap.OR_PAGE] || row[idxMap.PAGE] || '';
      const clerkNo = row[idxMap.CLERK_NO] || '';
      const multi = row[idxMap.MULTI_PRCL] || '';

      const rowTsv = [
        county,
        parcelId,
        price,
        saleYr,
        saleMo,
        qual,
        vi,
        multi,
        orBook,
        orPage,
        clerkNo,
        'SDF'
      ].join('\t') + '\n';

      parsedSalesCount++;
      copyStream.write(rowTsv);

      if (limit && lineCount >= limit) break;
    }
  }

  copyStream.end();
  await new Promise((resolve, reject) => {
    copyStream.on('finish', resolve);
    copyStream.on('error', reject);
  });

  const streamDuration = ((Date.now() - startStream) / 1000).toFixed(1);
  console.log(`    Streamed ${parsedSalesCount.toLocaleString()} sales (from ${lineCount.toLocaleString()} lines) in ${streamDuration}s.`);

  await sql`ANALYZE staging_historical_sales;`;

  // 4. Run staging analysis (rows already present vs new to insert)
  console.log(`\n[3/4] Analyzing staging table against live county_sales...`);
  
  const [stagingStats] = await sql`
    SELECT 
      COUNT(*) AS total_staging,
      MIN(sale_year) AS min_year,
      MAX(sale_year) AS max_year,
      MIN(sale_price) AS min_price,
      MAX(sale_price) AS max_price
    FROM staging_historical_sales;
  `;

  // Count matches already present in county_sales (same folio + year + month + price + book + page)
  const [alreadyPresentRow] = await sql`
    SELECT COUNT(*) AS count
    FROM staging_historical_sales s
    WHERE EXISTS (
      SELECT 1 FROM county_sales cs
      WHERE cs.county = s.county
        AND cs.parcel_id = s.parcel_id
        AND cs.sale_year = s.sale_year
        AND cs.sale_month = s.sale_month
        AND cs.sale_price = s.sale_price
        AND COALESCE(cs.or_book, '') = COALESCE(s.or_book, '')
        AND COALESCE(cs.or_page, '') = COALESCE(s.or_page, '')
    );
  `;
  const alreadyPresent = Number(alreadyPresentRow?.count) || 0;

  // Count distinct new rows to insert
  const [toInsertRow] = await sql`
    SELECT COUNT(*) AS count
    FROM (
      SELECT DISTINCT ON (s.county, s.parcel_id, s.sale_year, s.sale_month, s.sale_price, COALESCE(s.or_book, ''), COALESCE(s.or_page, ''))
        s.parcel_id
      FROM staging_historical_sales s
      WHERE NOT EXISTS (
        SELECT 1 FROM county_sales cs
        WHERE cs.county = s.county
          AND cs.parcel_id = s.parcel_id
          AND cs.sale_year = s.sale_year
          AND cs.sale_month = s.sale_month
          AND cs.sale_price = s.sale_price
          AND COALESCE(cs.or_book, '') = COALESCE(s.or_book, '')
          AND COALESCE(cs.or_page, '') = COALESCE(s.or_page, '')
      )
    ) t;
  `;
  const toInsert = Number(toInsertRow?.count) || 0;

  // Estimate DB growth: ~140 bytes per row (table row + indexes)
  const estGrowthBytes = toInsert * 140;

  console.log(`\n----------------------------------------------------------------`);
  console.log(`Historical Sales Analysis Report (${county})`);
  console.log(`----------------------------------------------------------------`);
  console.log(`Total valid transfers found (>= $1,000): ${Number(stagingStats?.total_staging).toLocaleString()}`);
  console.log(`Date range in source:                    ${stagingStats?.min_year} – ${stagingStats?.max_year}`);
  console.log(`Price range:                             $${Number(stagingStats?.min_price).toLocaleString()} – $${Number(stagingStats?.max_price).toLocaleString()}`);
  console.log(`Transfers already present in DB:         ${alreadyPresent.toLocaleString()}`);
  console.log(`New transfers ready to insert:           ${toInsert.toLocaleString()}`);
  console.log(`Estimated DB storage growth:             ~${formatBytes(estGrowthBytes)}`);
  console.log(`Current DB size:                         ${formatBytes(initialDbSize)}`);
  console.log(`Estimated DB size after insert:          ~${formatBytes(initialDbSize + estGrowthBytes)}`);
  console.log(`----------------------------------------------------------------\n`);

  if (!isApply) {
    await sql`DROP TABLE IF EXISTS staging_historical_sales;`;
    console.log(`DRY RUN COMPLETE — Zero writes made to county_sales.`);
    console.log(`To commit this import into the live database, run:`);
    console.log(`  node scripts/county/import-sales-history.mjs --county="${county.toLowerCase()}" --source=${sourceArg} --apply\n`);
    process.exit(0);
  }

  // 5. In ONE transaction: insert new rows, drop staging, VACUUM ANALYZE
  console.log(`[4/4] Inserting ${toInsert.toLocaleString()} rows into county_sales in ONE transaction...`);
  const startInsert = Date.now();

  const insertResult = await sql`
    INSERT INTO county_sales (
      county, parcel_id, sale_price, sale_year, sale_month, qual_code, vi_cd, multi_parcel, or_book, or_page, clerk_no, source
    )
    SELECT DISTINCT ON (s.county, s.parcel_id, s.sale_year, s.sale_month, s.sale_price, COALESCE(s.or_book, ''), COALESCE(s.or_page, ''))
      s.county,
      s.parcel_id,
      s.sale_price,
      s.sale_year,
      s.sale_month,
      s.qual_code,
      s.vi_cd,
      s.multi_parcel,
      s.or_book,
      s.or_page,
      s.clerk_no,
      s.source
    FROM staging_historical_sales s
    WHERE NOT EXISTS (
      SELECT 1 FROM county_sales cs
      WHERE cs.county = s.county
        AND cs.parcel_id = s.parcel_id
        AND cs.sale_year = s.sale_year
        AND cs.sale_month = s.sale_month
        AND cs.sale_price = s.sale_price
        AND COALESCE(cs.or_book, '') = COALESCE(s.or_book, '')
        AND COALESCE(cs.or_page, '') = COALESCE(s.or_page, '')
    )
    ON CONFLICT (county, parcel_id, sale_year, sale_month, sale_price, or_book, or_page) DO NOTHING;
  `;

  const insertDuration = ((Date.now() - startInsert) / 1000).toFixed(1);
  console.log(`    Inserted ${toInsert.toLocaleString()} rows in ${insertDuration}s.`);

  await sql`DROP TABLE IF EXISTS staging_historical_sales;`;
  console.log(`    Dropped staging table.`);

  console.log(`    Running VACUUM ANALYZE county_sales...`);
  try {
    await sql`VACUUM (ANALYZE) county_sales;`;
  } catch (vacErr) {
    console.warn('    Note: VACUUM ANALYZE skipped or restricted by pooler:', vacErr.message);
  }

  // Final check
  const [finalSalesCountRow] = await sql`
    SELECT COUNT(*) AS count FROM county_sales WHERE county = ${county}
  `;
  const finalCountySales = Number(finalSalesCountRow?.count) || 0;

  const [finalDbSizeRow] = await sql`SELECT pg_database_size(current_database()) AS bytes`;
  const finalDbSize = Number(finalDbSizeRow?.bytes) || 0;

  console.log(`\n================================================================`);
  console.log(`IMPORT COMPLETE`);
  console.log(`Final ${county} Sales in DB:  ${finalCountySales.toLocaleString()} (+${(finalCountySales - initialCountySales).toLocaleString()})`);
  console.log(`Initial DB Size:              ${formatBytes(initialDbSize)}`);
  console.log(`Final DB Size:                ${formatBytes(finalDbSize)} (Net change: ${formatBytes(finalDbSize - initialDbSize)})`);
  console.log(`================================================================\n`);

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error('Fatal error during import:', err);
    process.exit(1);
  });
}

