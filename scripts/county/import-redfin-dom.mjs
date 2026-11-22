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
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getScriptDb } from '../../api/_lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const envLocalPath = path.resolve(PROJECT_ROOT, '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

const SUPPORTED_ZIP_PREFIXES = ['330', '331', '332', '333', '334', '349'];
const DEFAULT_DOWNLOAD_URL = 'https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_data_center/housing_market/monthly/zips_in_top_50_metros.csv';

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

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
  let isTsv = false;
  let lineCount = 0;
  let matchCount = 0;

  for await (const line of rl) {
    lineCount++;
    if (!line.trim()) continue;

    if (!headerMap) {
      isTsv = line.includes('\t');
      const rawHeaders = isTsv ? line.split('\t') : parseCsvLine(line);
      const headers = rawHeaders.map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
      headerMap = new Map();
      headers.forEach((h, idx) => headerMap.set(h, idx));
      continue;
    }

    const cols = isTsv ? line.split('\t') : parseCsvLine(line);

    // ZIP Extraction (supports TSV "Zip Code: 33404" or CSV "33404")
    const rawRegion = cols[headerMap.get('region') ?? headerMap.get('region name') ?? headerMap.get('zip') ?? -1] || '';
    const zipMatch = rawRegion.match(/\b(\d{5})\b/);
    if (!zipMatch) continue;

    const zip = zipMatch[1];
    if (!SUPPORTED_ZIP_PREFIXES.some((p) => zip.startsWith(p))) continue;

    // Check state if present in columns
    const stateColIdx = headerMap.get('state_code') ?? headerMap.get('state') ?? -1;
    if (stateColIdx >= 0) {
      const stateVal = cols[stateColIdx] || '';
      if (stateVal && stateVal !== 'FL' && stateVal !== 'Florida') continue;
    }

    const propertyType = cols[headerMap.get('property_type') ?? headerMap.get('property type') ?? -1] || 'All Residential';
    const periodEnd = cols[headerMap.get('period_end') ?? headerMap.get('period end') ?? -1] || '';

    const medianDomRaw = cols[headerMap.get('median_dom') ?? headerMap.get('median days on market (days)') ?? headerMap.get('median days on market') ?? -1];
    const medianDom = medianDomRaw && medianDomRaw !== 'NA' && !isNaN(Number(medianDomRaw)) ? Math.round(Number(medianDomRaw) * 10) / 10 : null;

    const medianSalePriceRaw = cols[headerMap.get('median_sale_price') ?? headerMap.get('median sale price nsa ($)') ?? headerMap.get('median sale price ($)') ?? -1];
    const medianSalePrice = medianSalePriceRaw && medianSalePriceRaw !== 'NA' && !isNaN(Number(medianSalePriceRaw)) ? Number(medianSalePriceRaw) : null;

    const medianListPriceRaw = cols[headerMap.get('median_list_price') ?? headerMap.get('median new listing price ($)') ?? -1];
    const medianListPrice = medianListPriceRaw && medianListPriceRaw !== 'NA' && !isNaN(Number(medianListPriceRaw)) ? Number(medianListPriceRaw) : null;

    const homesSoldRaw = cols[headerMap.get('homes_sold') ?? headerMap.get('homes sold') ?? -1];
    const homesSold = homesSoldRaw && homesSoldRaw !== 'NA' && !isNaN(Number(homesSoldRaw)) ? parseInt(homesSoldRaw, 10) : null;

    const inventoryRaw = cols[headerMap.get('inventory') ?? -1];
    const inventory = inventoryRaw && inventoryRaw !== 'NA' && !isNaN(Number(inventoryRaw)) ? parseInt(inventoryRaw, 10) : null;

    const monthsSupplyRaw = cols[headerMap.get('months_of_supply') ?? headerMap.get('months of supply') ?? -1];
    const monthsOfSupply = monthsSupplyRaw && monthsSupplyRaw !== 'NA' && !isNaN(Number(monthsSupplyRaw)) ? Math.round(Number(monthsSupplyRaw) * 10) / 10 : null;

    if (!periodEnd) continue;

    matchCount++;
    await onRecord({
      zip,
      periodEnd: periodEnd.slice(0, 10),
      period_end: periodEnd.slice(0, 10),
      propertyType,
      property_type: propertyType,
      medianDom,
      median_dom: medianDom,
      medianSalePrice,
      median_sale_price: medianSalePrice,
      medianListPrice,
      median_list_price: medianListPrice,
      homesSold,
      homes_sold: homesSold,
      inventory,
      monthsOfSupply,
      months_of_supply: monthsOfSupply
    });
  }

  return { lineCount, matchCount };
}

async function main() {
  const { apply, file, url } = parseArgs();
  console.log(`[Redfin DOM Importer] Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);

  const cachedFile = path.resolve(PROJECT_ROOT, 'data/county/redfin/south_florida_zips_market.json');
  let collected = [];

  if (file && fs.existsSync(file)) {
    console.log(`Reading local file: ${file}`);
    const raw = fs.createReadStream(file);
    const readStream = file.endsWith('.gz') ? raw.pipe(zlib.createGunzip()) : raw;
    const stats = await processRedfinStream(readStream, {
      onRecord: (record) => collected.push(record)
    });
    console.log(`Processed ${stats.lineCount} total lines; found ${stats.matchCount} South Florida ZIP records.`);
  } else if (fs.existsSync(cachedFile)) {
    console.log(`Reading cached South Florida extract: ${cachedFile}`);
    collected = JSON.parse(fs.readFileSync(cachedFile, 'utf8'));
    console.log(`Loaded ${collected.length} cached South Florida ZIP records.`);
  } else {
    console.log(`Streaming from Redfin Data Center URL: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP fetch failed: ${res.status} ${res.statusText}`);
    const webStream = (await import('node:stream')).Readable.fromWeb(res.body);
    const readStream = url.endsWith('.gz') ? webStream.pipe(zlib.createGunzip()) : webStream;
    const stats = await processRedfinStream(readStream, {
      onRecord: (record) => collected.push(record)
    });
    console.log(`Processed ${stats.lineCount} total lines; found ${stats.matchCount} South Florida ZIP records.`);

    try {
      fs.mkdirSync(path.dirname(cachedFile), { recursive: true });
      fs.writeFileSync(cachedFile, JSON.stringify(collected));
      console.log(`Cached extract saved to ${cachedFile}`);
    } catch (_) {}
  }

  if (!apply) {
    console.log(`[DRY RUN COMPLETE] Found ${collected.length} records to stage/upsert. Pass --apply to persist.`);
    process.exit(0);
  }

  const sql = getScriptDb();
  console.log(`Upserting ${collected.length} rows into redfin_zip_market...`);

  // Batch insert into redfin_zip_market
  const BATCH_SIZE = 1000;
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
      FROM jsonb_to_recordset(${sql.json(batch)}) AS x(
        zip text,
        period_end text,
        property_type text,
        median_dom numeric,
        median_sale_price numeric,
        median_list_price numeric,
        homes_sold int,
        inventory int,
        months_of_supply numeric
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
    if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE || i + BATCH_SIZE >= collected.length) {
      console.log(`Upserted ${Math.min(i + BATCH_SIZE, collected.length)} / ${collected.length} records...`);
    }
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

