#!/usr/bin/env node
/**
 * import-redfin-dom.mjs
 * Streams Redfin Data Center ZIP-level Market Tracker (zip_code_market_tracker.tsv000.gz)
 * and extracts median days on market (DOM) and inventory velocity for South Florida ZIPs.
 *
 * Usage:
 *   node scripts/county/import-redfin-dom.mjs --dry-run
 *   node scripts/county/import-redfin-dom.mjs --apply
 *   node scripts/county/import-redfin-dom.mjs --file=/path/to/zip_code_market_tracker.tsv000.gz --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { getScriptDb } from '../../api/_lib/db.js';

const SUPPORTED_ZIP_PREFIXES = ['330', '333', '334', '349'];
const DEFAULT_DOWNLOAD_URL = 'https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/zip_code_market_tracker.tsv000.gz';

function parseArgs() {
  const args = process.argv.slice(2);
  let apply = false;
  let file = null;
  let url = DEFAULT_DOWNLOAD_URL;

  for (const arg of args) {
    if (arg === '--apply') apply = true;
    if (arg === '--dry-run') apply = false;
    if (arg.startsWith('--file=')) file = arg.slice(7);
    if (arg.startsWith('--url=')) url = arg.slice(6);
  }

  return { apply, file, url };
}

export async function processRedfinStream(stream, { onRecord = () => {} } = {}) {
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let headerMap = null;
  let lineCount = 0;
  let matchCount = 0;

  for await (const line of rl) {
    lineCount++;
    if (!line.trim()) continue;

    if (!headerMap) {
      const headers = line.split('\t').map((h) => h.trim().toLowerCase());
      headerMap = new Map();
      headers.forEach((h, idx) => headerMap.set(h, idx));
      continue;
    }

    const cols = line.split('\t');
    const stateCode = cols[headerMap.get('state_code') || 0] || '';
    if (stateCode !== 'FL') continue;

    const rawRegion = cols[headerMap.get('region') || 0] || '';
    // Format is typically "Zip Code: 33404"
    const zipMatch = rawRegion.match(/\b(\d{5})\b/);
    if (!zipMatch) continue;

    const zip = zipMatch[1];
    if (!SUPPORTED_ZIP_PREFIXES.some((p) => zip.startsWith(p))) continue;

    const propertyType = cols[headerMap.get('property_type') || 0] || 'All Residential';
    const periodEnd = cols[headerMap.get('period_end') || 0];
    const medianDomRaw = cols[headerMap.get('median_dom') || 0];
    const medianDom = medianDomRaw && !isNaN(Number(medianDomRaw)) ? Math.round(Number(medianDomRaw) * 10) / 10 : null;

    const medianSalePriceRaw = cols[headerMap.get('median_sale_price') || 0];
    const medianSalePrice = medianSalePriceRaw && !isNaN(Number(medianSalePriceRaw)) ? Number(medianSalePriceRaw) : null;

    const medianListPriceRaw = cols[headerMap.get('median_list_price') || 0];
    const medianListPrice = medianListPriceRaw && !isNaN(Number(medianListPriceRaw)) ? Number(medianListPriceRaw) : null;

    const homesSoldRaw = cols[headerMap.get('homes_sold') || 0];
    const homesSold = homesSoldRaw && !isNaN(Number(homesSoldRaw)) ? parseInt(homesSoldRaw, 10) : null;

    const inventoryRaw = cols[headerMap.get('inventory') || 0];
    const inventory = inventoryRaw && !isNaN(Number(inventoryRaw)) ? parseInt(inventoryRaw, 10) : null;

    const monthsSupplyRaw = cols[headerMap.get('months_of_supply') || 0];
    const monthsOfSupply = monthsSupplyRaw && !isNaN(Number(monthsSupplyRaw)) ? Math.round(Number(monthsSupplyRaw) * 10) / 10 : null;

    if (!periodEnd) continue;

    matchCount++;
    await onRecord({
      zip,
      periodEnd,
      propertyType,
      medianDom,
      medianSalePrice,
      medianListPrice,
      homesSold,
      inventory,
      monthsOfSupply
    });
  }

  return { lineCount, matchCount };
}

async function main() {
  const { apply, file, url } = parseArgs();
  console.log(`[Redfin DOM Importer] Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);

  let readStream;
  if (file && fs.existsSync(file)) {
    console.log(`Reading local file: ${file}`);
    const raw = fs.createReadStream(file);
    readStream = file.endsWith('.gz') ? raw.pipe(zlib.createGunzip()) : raw;
  } else {
    console.log(`Streaming from Redfin Data Center URL: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP fetch failed: ${res.status} ${res.statusText}`);
    const nodeStream = res.body;
    readStream = nodeStream.pipeThrough ? nodeStream : (await import('node:stream')).Readable.fromWeb(res.body).pipe(zlib.createGunzip());
  }

  const collected = [];
  const stats = await processRedfinStream(readStream, {
    onRecord: (record) => {
      collected.push(record);
    }
  });

  console.log(`Processed ${stats.lineCount} total lines; found ${stats.matchCount} South Florida ZIP records.`);

  if (!apply) {
    console.log(`[DRY RUN COMPLETE] Found ${collected.length} records to stage/upsert. Pass --apply to persist.`);
    process.exit(0);
  }

  const sql = getScriptDb();
  console.log(`Upserting ${collected.length} rows into redfin_zip_market...`);

  // Batch insert into redfin_zip_market
  const BATCH_SIZE = 500;
  for (let i = 0; i < collected.length; i += BATCH_SIZE) {
    const batch = collected.slice(i, i + BATCH_SIZE);
    await sql`
      INSERT INTO redfin_zip_market (
        zip, period_end, property_type, median_dom, median_sale_price,
        median_list_price, homes_sold, inventory, months_of_supply, updated_at
      )
      SELECT
        x.zip,
        x.period_end::date,
        x.property_type,
        x.median_dom::numeric,
        x.median_sale_price::numeric,
        x.median_list_price::numeric,
        x.homes_sold::int,
        x.inventory::int,
        x.months_of_supply::numeric,
        NOW()
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        zip text,
        period_end text,
        property_type text,
        median_dom text,
        median_sale_price text,
        median_list_price text,
        homes_sold text,
        inventory text,
        months_of_supply text
      )
      ON CONFLICT (zip, period_end, property_type)
      DO UPDATE SET
        median_dom = EXCLUDED.median_dom,
        median_sale_price = EXCLUDED.median_sale_price,
        median_list_price = EXCLUDED.median_list_price,
        homes_sold = EXCLUDED.homes_sold,
        inventory = EXCLUDED.inventory,
        months_of_supply = EXCLUDED.months_of_supply,
        updated_at = NOW();
    `;
  }

  console.log(`[APPLY COMPLETE] Successfully imported ${collected.length} Redfin market records.`);
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith('import-redfin-dom.mjs')) {
  main().catch((err) => {
    console.error('Fatal import error:', err);
    process.exit(1);
  });
}
