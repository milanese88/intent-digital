#!/usr/bin/env node

/**
 * import-cama-building.mjs
 *
 * Reusable twice-yearly county CAMA building-characteristics importer.
 * Currently supports Palm Beach County PAPA CAMA PAS405E (CSV / TXT / ZIP).
 * (Martin & Broward CAMA support will plug into this same CLI & table.)
 *
 * Strictly local processing — ZERO web scraping or network calls to county sites.
 * Strictly privacy-safe — skips OWNER and SALE records before column parsing;
 * ZERO owner names or mailing addresses are ever read or stored.
 *
 * Usage:
 *   node scripts/county/import-cama-building.mjs --county=palm-beach --dry-run --limit=2000
 *   node scripts/county/import-cama-building.mjs --county=palm-beach
 *   node scripts/county/import-cama-building.mjs --county=palm-beach --file="data/county/palm-beach/CAMA_CSV_CERT2026/PAS405_CSV_CERT2026_20261027.TXT"
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { aggregatePbcParcelBundle } from '../../src/utils/camaBuildingMapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const envLocalPath = path.resolve(PROJECT_ROOT, '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

const TARGET_VERIFY_FOLIOS = ['74434307010000010', '00424504060000780'];

/**
 * Fast RFC-4180 single-line CSV parser (handles quoted commas and doubled quotes).
 */
export function parseCsvLine(line) {
  const fields = [];
  const len = line.length;
  let i = 0;

  while (i <= len) {
    if (i < len && line[i] === '"') {
      i++;
      let val = '';
      while (i < len) {
        const ch = line[i];
        if (ch === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            val += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          val += ch;
          i++;
        }
      }
      fields.push(val);
      if (i < len && line[i] === ',') i++;
      else break;
    } else {
      const commaIdx = line.indexOf(',', i);
      if (commaIdx === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, commaIdx));
      i = commaIdx + 1;
    }
  }
  return fields;
}

/**
 * Recursively discovers the latest Palm Beach PAS405 data file inside data/county/palm-beach/.
 */
export function findLatestPalmBeachCamaFile(baseDir = path.resolve(PROJECT_ROOT, 'data/county/palm-beach')) {
  if (!fs.existsSync(baseDir)) return null;
  const candidates = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const upper = entry.name.toUpperCase();
        if (upper.includes('PAS405') && !upper.includes('_RPT_') && (upper.endsWith('.TXT') || upper.endsWith('.CSV'))) {
          const stat = fs.statSync(full);
          candidates.push({ full, size: stat.size, mtimeMs: stat.mtimeMs, name: entry.name });
        }
      }
    }
  }
  walk(baseDir);

  if (candidates.length === 0) {
    // Fallback to any .zip containing CAMA/PAS405
    function walkZips(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkZips(full);
        else if (entry.isFile() && /\.zip$/i.test(entry.name) && /(CAMA|PAS405)/i.test(entry.name)) {
          const stat = fs.statSync(full);
          candidates.push({ full, size: stat.size, mtimeMs: stat.mtimeMs, name: entry.name });
        }
      }
    }
    walkZips(baseDir);
  }

  candidates.sort((a, b) => b.name.localeCompare(a.name) || b.mtimeMs - a.mtimeMs);
  return candidates[0]?.full || null;
}

export function inferRollYearFromFilename(filePath) {
  const m = path.basename(filePath).match(/(?:CERT|PRELIM|FINAL|NAL|CAMA)[_-]?(20\d{2})/i)
    || filePath.match(/(?:CERT|PRELIM|FINAL|20\d{2}).*?(20\d{2})/i)
    || path.basename(filePath).match(/(20\d{2})/);
  return m ? Number(m[1]) : new Date().getFullYear();
}

async function* iterateFileLines(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let stream;
  let child = null;

  if (ext === '.zip') {
    child = spawn('unzip', ['-p', filePath, '*PAS405*CERT*.TXT']);
    child.stderr.on('data', () => {});
    child.stdout.setEncoding('latin1');
    stream = child.stdout;
  } else {
    stream = fs.createReadStream(filePath, { encoding: 'latin1', highWaterMark: 1024 * 1024 });
  }

  let carry = '';
  try {
    for await (const chunk of stream) {
      const combined = carry + chunk;
      const parts = combined.split(/\r?\n/);
      carry = parts.pop() ?? '';
      for (const line of parts) {
        if (line) yield line;
      }
    }
    if (carry) {
      yield carry;
    }
  } finally {
    if (child) child.kill();
    else if (typeof stream.destroy === 'function') stream.destroy();
  }
}

async function upsertBatch(client, batch) {
  if (!batch.length) return 0;

  const cols = [
    'county',
    'folio',
    'source',
    'roll_year',
    'property_class',
    'building_count',
    'beds',
    'full_baths',
    'half_baths',
    'stories',
    'year_built',
    'effective_year_built',
    'living_area_sqft',
    'total_area_sqft',
    'non_living_area_sqft',
    'construction_type',
    'exterior_wall_code',
    'exterior_wall_desc',
    'roof_type',
    'roof_cover_code',
    'roof_cover_desc',
    'roof_structure_desc',
    'quality_uad',
    'raw_quality_code',
    'raw_quality_desc',
    'condition_uad',
    'raw_condition_code',
    'raw_condition_desc',
    'condition_is_default',
    'pool_type',
    'pool_year',
    'screen_enclosure',
    'screen_enclosure_sqft',
    'boat_dock',
    'boat_dock_sqft',
    'boat_dock_year',
    'boat_lift',
    'boat_lift_year',
    'fireplaces',
    'garage_type',
    'garage_bays',
    'garage_sqft',
    'porch_sqft',
    'patio_sqft',
    'waterfront_view',
    'land_class_code',
    'land_class_desc',
    'condo_model_desc',
    'sub_areas_json',
    'extra_features_json'
  ];

  const arrays = cols.map(() => new Array(batch.length));
  for (let i = 0; i < batch.length; i++) {
    const r = batch[i];
    for (let c = 0; c < cols.length; c++) {
      const k = cols[c];
      if (k === 'sub_areas_json' || k === 'extra_features_json') {
        arrays[c][i] = r[k] != null ? JSON.stringify(r[k]) : null;
      } else {
        arrays[c][i] = r[k] ?? null;
      }
    }
  }

  const sqlText = `
    INSERT INTO building_characteristics (
      county, folio, source, roll_year, property_class, building_count,
      beds, full_baths, half_baths, stories, year_built, effective_year_built,
      living_area_sqft, total_area_sqft, non_living_area_sqft,
      construction_type, exterior_wall_code, exterior_wall_desc,
      roof_type, roof_cover_code, roof_cover_desc, roof_structure_desc,
      quality_uad, raw_quality_code, raw_quality_desc,
      condition_uad, raw_condition_code, raw_condition_desc, condition_is_default,
      pool_type, pool_year, screen_enclosure, screen_enclosure_sqft,
      boat_dock, boat_dock_sqft, boat_dock_year, boat_lift, boat_lift_year,
      fireplaces, garage_type, garage_bays, garage_sqft, porch_sqft, patio_sqft,
      waterfront_view, land_class_code, land_class_desc, condo_model_desc,
      sub_areas_json, extra_features_json, updated_at
    )
    SELECT
      u.county, u.folio, u.source, u.roll_year, u.property_class, u.building_count,
      u.beds, u.full_baths, u.half_baths, u.stories, u.year_built, u.effective_year_built,
      u.living_area_sqft, u.total_area_sqft, u.non_living_area_sqft,
      u.construction_type, u.exterior_wall_code, u.exterior_wall_desc,
      u.roof_type, u.roof_cover_code, u.roof_cover_desc, u.roof_structure_desc,
      u.quality_uad, u.raw_quality_code, u.raw_quality_desc,
      u.condition_uad, u.raw_condition_code, u.raw_condition_desc, u.condition_is_default,
      u.pool_type, u.pool_year, u.screen_enclosure, u.screen_enclosure_sqft,
      u.boat_dock, u.boat_dock_sqft, u.boat_dock_year, u.boat_lift, u.boat_lift_year,
      u.fireplaces, u.garage_type, u.garage_bays, u.garage_sqft, u.porch_sqft, u.patio_sqft,
      u.waterfront_view, u.land_class_code, u.land_class_desc, u.condo_model_desc,
      u.sub_areas_text::jsonb, u.extra_features_text::jsonb, now()
    FROM unnest(
      $1::text[], $2::text[], $3::text[], $4::smallint[], $5::text[], $6::smallint[],
      $7::numeric[], $8::smallint[], $9::smallint[], $10::numeric[], $11::smallint[], $12::smallint[],
      $13::integer[], $14::integer[], $15::integer[],
      $16::text[], $17::text[], $18::text[],
      $19::text[], $20::text[], $21::text[], $22::text[],
      $23::text[], $24::text[], $25::text[],
      $26::text[], $27::text[], $28::text[], $29::boolean[],
      $30::text[], $31::smallint[], $32::boolean[], $33::integer[],
      $34::boolean[], $35::integer[], $36::smallint[], $37::boolean[], $38::smallint[],
      $39::smallint[], $40::text[], $41::smallint[], $42::integer[], $43::integer[], $44::integer[],
      $45::text[], $46::text[], $47::text[], $48::text[],
      $49::text[], $50::text[]
    ) AS u(
      county, folio, source, roll_year, property_class, building_count,
      beds, full_baths, half_baths, stories, year_built, effective_year_built,
      living_area_sqft, total_area_sqft, non_living_area_sqft,
      construction_type, exterior_wall_code, exterior_wall_desc,
      roof_type, roof_cover_code, roof_cover_desc, roof_structure_desc,
      quality_uad, raw_quality_code, raw_quality_desc,
      condition_uad, raw_condition_code, raw_condition_desc, condition_is_default,
      pool_type, pool_year, screen_enclosure, screen_enclosure_sqft,
      boat_dock, boat_dock_sqft, boat_dock_year, boat_lift, boat_lift_year,
      fireplaces, garage_type, garage_bays, garage_sqft, porch_sqft, patio_sqft,
      waterfront_view, land_class_code, land_class_desc, condo_model_desc,
      sub_areas_text, extra_features_text
    )
    ON CONFLICT (county, folio) DO UPDATE SET
      source = EXCLUDED.source,
      roll_year = EXCLUDED.roll_year,
      property_class = EXCLUDED.property_class,
      building_count = EXCLUDED.building_count,
      beds = EXCLUDED.beds,
      full_baths = EXCLUDED.full_baths,
      half_baths = EXCLUDED.half_baths,
      stories = EXCLUDED.stories,
      year_built = EXCLUDED.year_built,
      effective_year_built = EXCLUDED.effective_year_built,
      living_area_sqft = EXCLUDED.living_area_sqft,
      total_area_sqft = EXCLUDED.total_area_sqft,
      non_living_area_sqft = EXCLUDED.non_living_area_sqft,
      construction_type = EXCLUDED.construction_type,
      exterior_wall_code = EXCLUDED.exterior_wall_code,
      exterior_wall_desc = EXCLUDED.exterior_wall_desc,
      roof_type = EXCLUDED.roof_type,
      roof_cover_code = EXCLUDED.roof_cover_code,
      roof_cover_desc = EXCLUDED.roof_cover_desc,
      roof_structure_desc = EXCLUDED.roof_structure_desc,
      quality_uad = EXCLUDED.quality_uad,
      raw_quality_code = EXCLUDED.raw_quality_code,
      raw_quality_desc = EXCLUDED.raw_quality_desc,
      condition_uad = EXCLUDED.condition_uad,
      raw_condition_code = EXCLUDED.raw_condition_code,
      raw_condition_desc = EXCLUDED.raw_condition_desc,
      condition_is_default = EXCLUDED.condition_is_default,
      pool_type = EXCLUDED.pool_type,
      pool_year = EXCLUDED.pool_year,
      screen_enclosure = EXCLUDED.screen_enclosure,
      screen_enclosure_sqft = EXCLUDED.screen_enclosure_sqft,
      boat_dock = EXCLUDED.boat_dock,
      boat_dock_sqft = EXCLUDED.boat_dock_sqft,
      boat_dock_year = EXCLUDED.boat_dock_year,
      boat_lift = EXCLUDED.boat_lift,
      boat_lift_year = EXCLUDED.boat_lift_year,
      fireplaces = EXCLUDED.fireplaces,
      garage_type = EXCLUDED.garage_type,
      garage_bays = EXCLUDED.garage_bays,
      garage_sqft = EXCLUDED.garage_sqft,
      porch_sqft = EXCLUDED.porch_sqft,
      patio_sqft = EXCLUDED.patio_sqft,
      waterfront_view = EXCLUDED.waterfront_view,
      land_class_code = EXCLUDED.land_class_code,
      land_class_desc = EXCLUDED.land_class_desc,
      condo_model_desc = EXCLUDED.condo_model_desc,
      sub_areas_json = EXCLUDED.sub_areas_json,
      extra_features_json = EXCLUDED.extra_features_json,
      updated_at = now()
    WHERE
      building_characteristics.roll_year IS DISTINCT FROM EXCLUDED.roll_year OR
      building_characteristics.living_area_sqft IS DISTINCT FROM EXCLUDED.living_area_sqft OR
      building_characteristics.total_area_sqft IS DISTINCT FROM EXCLUDED.total_area_sqft OR
      building_characteristics.beds IS DISTINCT FROM EXCLUDED.beds OR
      building_characteristics.full_baths IS DISTINCT FROM EXCLUDED.full_baths OR
      building_characteristics.half_baths IS DISTINCT FROM EXCLUDED.half_baths OR
      building_characteristics.year_built IS DISTINCT FROM EXCLUDED.year_built OR
      building_characteristics.effective_year_built IS DISTINCT FROM EXCLUDED.effective_year_built OR
      building_characteristics.construction_type IS DISTINCT FROM EXCLUDED.construction_type OR
      building_characteristics.exterior_wall_desc IS DISTINCT FROM EXCLUDED.exterior_wall_desc OR
      building_characteristics.roof_type IS DISTINCT FROM EXCLUDED.roof_type OR
      building_characteristics.roof_cover_desc IS DISTINCT FROM EXCLUDED.roof_cover_desc OR
      building_characteristics.quality_uad IS DISTINCT FROM EXCLUDED.quality_uad OR
      building_characteristics.raw_quality_code IS DISTINCT FROM EXCLUDED.raw_quality_code OR
      building_characteristics.condition_uad IS DISTINCT FROM EXCLUDED.condition_uad OR
      building_characteristics.raw_condition_code IS DISTINCT FROM EXCLUDED.raw_condition_code OR
      building_characteristics.condition_is_default IS DISTINCT FROM EXCLUDED.condition_is_default OR
      building_characteristics.pool_type IS DISTINCT FROM EXCLUDED.pool_type OR
      building_characteristics.pool_year IS DISTINCT FROM EXCLUDED.pool_year OR
      building_characteristics.screen_enclosure IS DISTINCT FROM EXCLUDED.screen_enclosure OR
      building_characteristics.boat_dock IS DISTINCT FROM EXCLUDED.boat_dock OR
      building_characteristics.boat_dock_sqft IS DISTINCT FROM EXCLUDED.boat_dock_sqft OR
      building_characteristics.boat_lift IS DISTINCT FROM EXCLUDED.boat_lift OR
      building_characteristics.fireplaces IS DISTINCT FROM EXCLUDED.fireplaces OR
      building_characteristics.garage_type IS DISTINCT FROM EXCLUDED.garage_type OR
      building_characteristics.garage_bays IS DISTINCT FROM EXCLUDED.garage_bays OR
      building_characteristics.garage_sqft IS DISTINCT FROM EXCLUDED.garage_sqft OR
      building_characteristics.waterfront_view IS DISTINCT FROM EXCLUDED.waterfront_view OR
      building_characteristics.sub_areas_json IS DISTINCT FROM EXCLUDED.sub_areas_json OR
      building_characteristics.extra_features_json IS DISTINCT FROM EXCLUDED.extra_features_json;
  `;

  const res = await client.query(sqlText, arrays);
  return res.rowCount || batch.length;
}

async function runCli() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/county/import-cama-building.mjs --county=palm-beach [--file=...] [--roll-year=2026] [--dry-run] [--limit=N]');
    return;
  }

  const rawCounty = (args.find((a) => a.startsWith('--county='))?.split('=')[1] || 'palm-beach').toLowerCase();
  if (!rawCounty.includes('palm')) {
    console.error(`[!] County "${rawCounty}" is not yet enabled. Supported right now: palm-beach.`);
    process.exit(1);
  }

  const fileArg = args.find((a) => a.startsWith('--file='))?.split('=')[1] || '';
  const resolvedPath = fileArg
    ? path.resolve(PROJECT_ROOT, fileArg)
    : findLatestPalmBeachCamaFile();

  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    console.error('[!] Could not locate Palm Beach CAMA PAS405 file under data/county/palm-beach/.');
    process.exit(1);
  }

  const rollYearArg = args.find((a) => a.startsWith('--roll-year='))?.split('=')[1];
  const rollYear = rollYearArg ? Number(rollYearArg) : inferRollYearFromFilename(resolvedPath);
  const isDryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limit = limitArg ? Number(limitArg) : Infinity;

  const BATCH_SIZE = 4000;
  const startTime = Date.now();
  console.log('===============================================================================');
  console.log(`PALM BEACH CAMA BUILDING IMPORTER (${isDryRun ? 'DRY-RUN' : 'LIVE UPSERT -> .env.local'})`);
  console.log(`File:      ${path.relative(PROJECT_ROOT, resolvedPath)}`);
  console.log(`Roll year: ${rollYear} | Source: papa_cama_pas405e | Owner records: SKIPPED`);
  console.log('===============================================================================');

  let pool = null;
  let client = null;
  if (!isDryRun) {
    const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('SUPABASE_DATABASE_URL (or DATABASE_URL) is not set in .env.local');
    }
    const { createScriptPool } = await import('../../api/_lib/db.js');
    pool = createScriptPool(dbUrl);
    client = await pool.connect();
  }

  let linesRead = 0;
  let ownerSkipped = 0;
  let saleSkipped = 0;
  let totalPcns = 0;
  let importedCount = 0;
  let skippedNonRes = 0;
  let resbldCount = 0;
  let condoCount = 0;
  let combldCount = 0;
  let defaultAvCondCount = 0;
  let realSignalCondCount = 0;
  let batch = [];
  const samplePreview = [];

  let curPcn = null;
  let curBundle = null;

  async function flushBundle(bundle) {
    if (!bundle) return;
    totalPcns++;
    const rec = aggregatePbcParcelBundle(bundle, { rollYear, source: 'papa_cama_pas405e' });
    if (!rec) {
      skippedNonRes++;
      return;
    }
    if (rec.property_class === 'RESBLD') resbldCount++;
    else if (rec.property_class === 'CONDO') condoCount++;
    else if (rec.property_class === 'COMBLD') combldCount++;

    if (rec.raw_condition_code) {
      if (rec.condition_is_default) defaultAvCondCount++;
      else realSignalCondCount++;
    }

    if (samplePreview.length < 3 || TARGET_VERIFY_FOLIOS.includes(rec.folio)) {
      samplePreview.push(rec);
    }

    batch.push(rec);
    importedCount++;

    if (!isDryRun && batch.length >= BATCH_SIZE) {
      await upsertBatch(client, batch);
      batch = [];
      if (importedCount % 50000 < BATCH_SIZE) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  ... ${importedCount.toLocaleString()} residential parcels upserted (${linesRead.toLocaleString()} lines, ${elapsed}s)`);
      }
    } else if (isDryRun && batch.length >= BATCH_SIZE) {
      batch = [];
    }
  }

  try {
    for await (const line of iterateFileLines(resolvedPath)) {
      linesRead++;

      const c1 = line.indexOf(',');
      if (c1 <= 0) continue;
      const c2 = line.indexOf(',', c1 + 1);
      if (c2 <= c1) continue;

      const rt = line.slice(c1 + 1, c2).trim().toUpperCase();
      if (rt === 'OWNER') {
        ownerSkipped++;
        continue; // NEVER parse owner records
      }
      if (rt === 'SALE') {
        saleSkipped++;
        continue;
      }

      const pcn = line.slice(0, c1).trim();
      if (!pcn) continue;

      if (pcn !== curPcn) {
        if (curBundle) {
          await flushBundle(curBundle);
          if (importedCount >= limit) break;
        }
        curPcn = pcn;
        curBundle = { pcn, parcel: null, resbld: [], condo: [], combld: [], oby: [], land: [] };
      }

      if (rt === 'PARCEL') {
        curBundle.parcel = parseCsvLine(line);
      } else if (rt === 'RESBLD') {
        curBundle.resbld.push(parseCsvLine(line));
      } else if (rt === 'CONDO') {
        curBundle.condo.push(parseCsvLine(line));
      } else if (rt === 'COMBLD') {
        curBundle.combld.push(parseCsvLine(line));
      } else if (rt === 'OBY') {
        curBundle.oby.push(parseCsvLine(line));
      } else if (rt === 'LAND') {
        curBundle.land.push(parseCsvLine(line));
      }
    }

    if (curBundle && importedCount < limit) {
      await flushBundle(curBundle);
    }

    if (!isDryRun && batch.length > 0) {
      await upsertBatch(client, batch);
      batch = [];
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n-------------------------------------------------------------------------------');
    console.log(`[✓] Stream complete in ${elapsedSec}s`);
    console.log(`    Lines read:         ${linesRead.toLocaleString()} (OWNER skipped: ${ownerSkipped.toLocaleString()}, SALE skipped: ${saleSkipped.toLocaleString()})`);
    console.log(`    Total PCNs seen:    ${totalPcns.toLocaleString()} (non-residential skipped: ${skippedNonRes.toLocaleString()})`);
    console.log(`    Residential rows:   ${importedCount.toLocaleString()} (RESBLD: ${resbldCount.toLocaleString()} | CONDO: ${condoCount.toLocaleString()} | COMBLD: ${combldCount.toLocaleString()})`);
    console.log(`    Condition codes:    AV default (not inspected): ${defaultAvCondCount.toLocaleString()} | Real signals (GD/VG/EX/FR/PR/VP): ${realSignalCondCount.toLocaleString()}`);

    if (!isDryRun && client) {
      console.log('\nRunning VACUUM (ANALYZE) building_characteristics...');
      await client.query('VACUUM (ANALYZE) building_characteristics;');

      const [countRes, tableSizeRes, dbSizeRes, verifyRes] = await Promise.all([
        client.query("SELECT count(*)::int AS cnt FROM building_characteristics WHERE county = 'Palm Beach';"),
        client.query("SELECT pg_size_pretty(pg_total_relation_size('building_characteristics')) AS pretty, pg_total_relation_size('building_characteristics') AS bytes;"),
        client.query('SELECT pg_size_pretty(pg_database_size(current_database())) AS pretty, pg_database_size(current_database()) AS bytes;'),
        client.query(
          `SELECT folio, property_class, beds, full_baths, half_baths, stories, year_built, effective_year_built,
                  living_area_sqft, total_area_sqft, construction_type, exterior_wall_desc,
                  roof_type, roof_cover_desc, quality_uad, raw_quality_code,
                  condition_uad, raw_condition_code, condition_is_default,
                  pool_type, screen_enclosure, screen_enclosure_sqft, waterfront_view
           FROM building_characteristics
           WHERE county = 'Palm Beach' AND folio = ANY($1::text[])
           ORDER BY folio;`,
          [TARGET_VERIFY_FOLIOS]
        )
      ]);

      console.log('===============================================================================');
      console.log(`DB ROW COUNT (Palm Beach):   ${Number(countRes.rows[0]?.cnt || 0).toLocaleString()}`);
      console.log(`TABLE SIZE (incl. indexes):  ${tableSizeRes.rows[0]?.pretty} (${Number(tableSizeRes.rows[0]?.bytes || 0).toLocaleString()} bytes)`);
      console.log(`TOTAL DATABASE SIZE:         ${dbSizeRes.rows[0]?.pretty} (${Number(dbSizeRes.rows[0]?.bytes || 0).toLocaleString()} bytes)`);
      console.log('===============================================================================');
      console.log('\nTarget parcel verification (DB rows):');
      for (const row of verifyRes.rows) {
        console.log(' ', JSON.stringify(row));
      }
    } else {
      console.log('\nDry-run sample preview:');
      for (const s of samplePreview.slice(0, 5)) {
        console.log(' ', JSON.stringify(s));
      }
    }
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runCli().catch((err) => {
    console.error('[!] CAMA building import failed:', err);
    process.exit(1);
  });
}
