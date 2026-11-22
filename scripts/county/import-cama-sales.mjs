#!/usr/bin/env node

/**
 * scripts/county/import-cama-sales.mjs
 *
 * Imports historical deed transfer records from Palm Beach County PAPA CAMA PAS405E
 * into `county_sales`.
 *
 * Each SALE row in PAS405 stores up to 5 prior transactions per parcel:
 *   (or_book, or_page, sale_date, deed_type, qual_code, vi_cd, sale_price)
 *
 * Strictly privacy-safe — ZERO owner names or mailing addresses exist in SALE records.
 * 100% idempotent — uses PostgreSQL `ON CONFLICT (county, parcel_id, sale_year, sale_month, sale_price, or_book, or_page) DO NOTHING`.
 *
 * Usage:
 *   node scripts/county/import-cama-sales.mjs --dry-run --limit=5000
 *   node scripts/county/import-cama-sales.mjs --folios=54434227040002670,54434227040002680
 *   node scripts/county/import-cama-sales.mjs --market-only
 *   node scripts/county/import-cama-sales.mjs --all
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { parseCamaDate } from '../../api/_lib/camaSales.js';
import { getScriptDb } from '../../api/_lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const envLocalPath = path.resolve(PROJECT_ROOT, '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

function findCamaFile() {
  const defaultPath = path.resolve(PROJECT_ROOT, 'data/county/palm-beach/CAMA_CSV_CERT2026/PAS405_CSV_CERT2026_20261027.TXT');
  if (fs.existsSync(defaultPath)) return defaultPath;

  const pbDir = path.resolve(PROJECT_ROOT, 'data/county/palm-beach');
  if (!fs.existsSync(pbDir)) return null;

  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        const found = walk(full);
        if (found) return found;
      } else if (e.isFile() && /PAS405.*CERT.*\.TXT$/i.test(e.name)) {
        return full;
      }
    }
    return null;
  }
  return walk(pbDir);
}

export async function run() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const marketOnly = args.includes('--market-only');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  const foliosArg = args.find((a) => a.startsWith('--folios='));
  const targetFolios = foliosArg
    ? new Set(foliosArg.split('=')[1].split(',').map((s) => s.replace(/[^0-9]/g, '')))
    : null;

  const filePath = findCamaFile();
  if (!filePath) {
    console.error('Error: PAS405 file not found in data/county/palm-beach/');
    process.exit(1);
  }

  console.log(`=== Palm Beach CAMA Sales Importer ===`);
  console.log(`Source file: ${filePath}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no DB writes)' : 'LIVE DATABASE'}`);
  if (marketOnly) console.log(`Filter: Market qualified (Q) only`);
  if (targetFolios) console.log(`Target folios: ${Array.from(targetFolios).join(', ')}`);
  if (limit) console.log(`Limit: ${limit} SALE lines`);

  const sql = getScriptDb();
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineCount = 0;
  let parsedSales = 0;
  let insertedCount = 0;
  let batch = [];
  const BATCH_SIZE = 1000;

  async function flushBatch() {
    if (batch.length === 0 || isDryRun) {
      batch = [];
      return;
    }
    const current = batch;
    batch = [];

    // Format for bulk insert with ON CONFLICT DO NOTHING
    try {
      await sql`
        INSERT INTO county_sales ${sql(
          current,
          'county', 'parcel_id', 'sale_price', 'sale_year', 'sale_month',
          'qual_code', 'vi_cd', 'or_book', 'or_page', 'source'
        )}
        ON CONFLICT (county, parcel_id, sale_year, sale_month, sale_price, or_book, or_page)
        DO NOTHING;
      `;
      insertedCount += current.length;
    } catch (err) {
      console.warn('Batch insert error (continuing):', err.message);
    }
  }

  const start = Date.now();

  for await (const line of rl) {
    if (!line.includes(',SALE,')) continue;
    lineCount++;

    const parts = line.split(',');
    const folio = parts[0]?.trim();
    if (!folio || folio.length !== 17) continue;

    if (targetFolios && !targetFolios.has(folio)) continue;

    const remaining = parts.slice(2);
    const TUPLE_LEN = 7;
    for (let i = 0; i + TUPLE_LEN <= remaining.length; i += TUPLE_LEN) {
      const orBook = remaining[i]?.trim();
      const orPage = remaining[i + 1]?.trim();
      const rawDate = remaining[i + 2]?.trim();
      const qual = remaining[i + 4]?.trim();
      const vi = remaining[i + 5]?.trim() || null;
      const rawPrice = remaining[i + 6]?.trim();

      const price = parseFloat(rawPrice);
      if (isNaN(price) || price < 100) continue;

      const dateObj = parseCamaDate(rawDate);
      if (!dateObj) continue;

      const isMarket = qual === 'Q';
      if (marketOnly && !isMarket) continue;

      parsedSales++;
      batch.push({
        county: 'Palm Beach',
        parcel_id: folio,
        sale_price: Math.round(price),
        sale_year: dateObj.year,
        sale_month: dateObj.month,
        qual_code: isMarket ? '01' : '02',
        vi_cd: vi === 'V' ? 'V' : 'I',
        or_book: orBook || null,
        or_page: orPage || null,
        source: 'county record'
      });

      if (batch.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    if (limit && lineCount >= limit) break;
  }

  await flushBatch();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s:`);
  console.log(`  SALE lines scanned: ${lineCount.toLocaleString()}`);
  console.log(`  Valid transactions: ${parsedSales.toLocaleString()}`);
  console.log(`  Rows flushed:       ${insertedCount.toLocaleString()}`);

  if (targetFolios) {
    const check = await sql`
      SELECT parcel_id, sale_price, sale_year, sale_month, qual_code, vi_cd, or_book, or_page, source
      FROM county_sales
      WHERE parcel_id = ANY(${Array.from(targetFolios)})
      ORDER BY parcel_id, sale_year DESC;
    `;
    console.log('\nVerified rows in DB:');
    console.table(check);
  }

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error('Fatal error in import-cama-sales:', err);
    process.exit(1);
  });
}
