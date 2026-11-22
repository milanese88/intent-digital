import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { parseOpportunityMapParams } from '../../../api/county/opportunity-map.js';
import { processRedfinStream } from '../../../scripts/county/import-redfin-dom.mjs';
import { CANONICAL_MIGRATION_ORDER, MIGRATION_SCHEMA_SIGNATURES } from '../../../scripts/db/_lib.mjs';

test('parseOpportunityMapParams parses layers, deal types, price bands, and bounding box cleanly', () => {
  // Defaults
  const def = parseOpportunityMapParams({});
  assert.equal(def.layer, 'profit');
  assert.equal(def.dealType, 'all');
  assert.equal(def.county, 'all');
  assert.equal(def.priceBand, 'all');
  assert.equal(def.lookbackMonths, 24);
  assert.equal(def.minBeds, 0);
  assert.equal(def.bbox, null);
  assert.equal(def.includeDots, false);

  // Custom parameters
  const custom = parseOpportunityMapParams({
    layer: 'months',
    deal_type: 'demo_new_build',
    county: 'palm-beach',
    price_band: '1m_2m',
    lookback_months: '12',
    sqft_band: '2500_4000',
    beds: '3',
    zip: '33404',
    bbox: '-80.20,26.70,-80.00,26.85'
  });

  assert.equal(custom.layer, 'months');
  assert.equal(custom.dealType, 'demo_new_build');
  assert.equal(custom.county, 'Palm Beach');
  assert.equal(custom.priceBand, '1m_2m');
  assert.equal(custom.lookbackMonths, 12);
  assert.equal(custom.sqftBand, '2500_4000');
  assert.equal(custom.minBeds, 3);
  assert.equal(custom.zip, '33404');
  assert.ok(custom.bbox);
  assert.equal(custom.bbox.minLng, -80.20);
  assert.equal(custom.bbox.minLat, 26.70);
  assert.equal(custom.bbox.maxLng, -80.00);
  assert.equal(custom.bbox.maxLat, 26.85);
  assert.equal(custom.includeDots, true);
});

test('processRedfinStream parses South Florida records and skips out-of-state records', async () => {
  const tsvData = [
    'period_begin\tperiod_end\tperiod_duration\tregion_type\tregion\tstate\tstate_code\tproperty_type\tmedian_sale_price\tmedian_list_price\tmedian_dom\thomes_sold\tinventory\tmonths_of_supply',
    '2026-09-01\t2026-09-30\t30\tzip code\tZip Code: 33404\tFlorida\tFL\tAll Residential\t550000\t580000\t38.0\t24\t72\t3.0',
    '2026-09-01\t2026-09-30\t30\tzip code\tZip Code: 90210\tCalifornia\tCA\tAll Residential\t2500000\t2800000\t45.0\t10\t40\t4.0',
    '2026-09-01\t2026-09-30\t30\tzip code\tZip Code: 33004\tFlorida\tFL\tSingle Family Residential\t480000\t510000\t29.5\t18\t54\t3.0',
    '2026-09-01\t2026-09-30\t30\tzip code\tZip Code: 32801\tFlorida\tFL\tAll Residential\t390000\t410000\t32.0\t15\t45\t3.0' // Orlando 32801 (not South FL)
  ].join('\n');

  const stream = Readable.from([tsvData]);
  const collected = [];

  const stats = await processRedfinStream(stream, {
    onRecord: (record) => {
      collected.push(record);
    }
  });

  assert.equal(stats.matchCount, 2); // 33404 and 33004
  assert.equal(collected.length, 2);

  const pb = collected.find((r) => r.zip === '33404');
  assert.ok(pb);
  assert.equal(pb.medianDom, 38.0);
  assert.equal(pb.medianSalePrice, 550000);
  assert.equal(pb.homesSold, 24);
  assert.equal(pb.inventory, 72);

  const broward = collected.find((r) => r.zip === '33004');
  assert.ok(broward);
  assert.equal(broward.medianDom, 29.5);
});

test('South Florida ZCTA GeoJSON dataset is valid and complete', () => {
  const geoPath = path.resolve(process.cwd(), 'src/content/geo/south-florida-zcta.json');
  assert.ok(fs.existsSync(geoPath), 'south-florida-zcta.json must exist');

  const geoJson = JSON.parse(fs.readFileSync(geoPath, 'utf8'));
  assert.equal(geoJson.type, 'FeatureCollection');
  assert.ok(Array.isArray(geoJson.features));
  assert.ok(geoJson.features.length >= 100, 'must have at least 100 South Florida ZIP polygons');

  const sample = geoJson.features.find((f) => f.properties?.zip === '33404');
  assert.ok(sample, 'must include ZIP 33404 (Riviera Beach / Palm Beach Shores)');
  assert.ok(['Polygon', 'MultiPolygon'].includes(sample.geometry?.type));
  assert.ok(sample.geometry.coordinates.length > 0);
});

test('migration add_opportunity_map_and_redfin.sql is registered, idempotent, and has zero test rows', () => {
  const repoRoot = path.resolve(process.cwd());
  const sqlPath = path.join(repoRoot, 'migrations/add_opportunity_map_and_redfin.sql');
  assert.ok(fs.existsSync(sqlPath), 'migration file must exist');

  const sqlText = fs.readFileSync(sqlPath, 'utf8');

  assert.ok(CANONICAL_MIGRATION_ORDER.includes('add_opportunity_map_and_redfin.sql'));
  const sig = MIGRATION_SCHEMA_SIGNATURES['add_opportunity_map_and_redfin.sql'];
  assert.ok(sig?.tables?.includes('redfin_zip_market'));
  assert.ok(sig?.indexes?.includes('idx_redfin_zip_market_lookup'));
  assert.ok(sig?.indexes?.includes('idx_redfin_zip_market_dom'));

  assert.match(sqlText, /CREATE TABLE IF NOT EXISTS redfin_zip_market/i);
  assert.match(sqlText, /CREATE INDEX IF NOT EXISTS idx_redfin_zip_market_lookup/i);
  assert.match(sqlText, /CREATE INDEX IF NOT EXISTS idx_redfin_zip_market_dom/i);
  assert.doesNotMatch(sqlText, /\bINSERT\s+INTO\b/i, 'migration must contain zero test rows');
  assert.doesNotMatch(sqlText, /\bowner_name\b|\bmailing_address\b/i, 'strictly non-PII');
});
