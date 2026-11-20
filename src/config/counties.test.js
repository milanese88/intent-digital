import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SUPPORTED_COUNTIES,
  normalizeCountyName,
  estimateCountyFromCoords,
  resolvePropertyCounty,
  getPropertyCountyLabel,
  getCountyAppraiserLabel
} from './counties.js';
import { normalizeAddress } from '../utils/addressNorm.js';
import { stripStreetSuffix, resolveSearchCounties } from '../../api/county/search.js';
import { applyPropertyCountyRules } from '../../api/_lib/countyResolver.js';
import { computeSitusNorm, findRollFile, normalizeParcelKey } from '../../scripts/county/_counties.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// 18801 SE River Ridge Ct, Tequesta 33469 (Martin County) — geocoded point saved on the property
const RIVER_RIDGE = { lat: 26.978044, lng: -80.111929 };

test('Martin is a supported county and county text normalizes from parcel/geocoder labels', () => {
  assert.deepEqual(SUPPORTED_COUNTIES, ['Broward', 'Palm Beach', 'Martin']);
  assert.equal(normalizeCountyName('Martin County'), 'Martin');
  assert.equal(normalizeCountyName('MARTIN'), 'Martin');
  assert.equal(normalizeCountyName('53'), 'Martin');
  assert.equal(normalizeCountyName('Palm Beach County'), 'Palm Beach');
  assert.equal(normalizeCountyName('broward'), 'Broward');
  assert.equal(normalizeCountyName('Other'), null);
  assert.equal(normalizeCountyName('Miami-Dade'), null);
  assert.equal(getCountyAppraiserLabel('Martin'), 'Martin County Property Appraiser');
  assert.equal(getCountyAppraiserLabel('Other'), 'County Property Appraiser');
});

test('County from coordinates: River Ridge point is Martin; border zones defer to parcel data', () => {
  assert.equal(estimateCountyFromCoords(RIVER_RIDGE.lat, RIVER_RIDGE.lng), 'Martin');
  assert.equal(estimateCountyFromCoords(27.197, -80.253), 'Martin'); // Stuart
  assert.equal(estimateCountyFromCoords(26.715, -80.054), 'Palm Beach'); // West Palm Beach
  assert.equal(estimateCountyFromCoords(26.1099, -80.1621), 'Broward'); // Fort Lauderdale
  // Ambiguous strips straddling county lines return null (server resolves by nearest parcel)
  assert.equal(estimateCountyFromCoords(26.963, -80.1), null);
  assert.equal(estimateCountyFromCoords(26.335, -80.15), null);
  assert.equal(estimateCountyFromCoords(null, -80.1), null);
});

test('Property county: linked parcel wins, "Other" falls back to coordinates (never hard-coded Broward)', () => {
  const otherProp = { county: 'Other', parcel_county: null, parcel_id: null, ...RIVER_RIDGE };
  assert.equal(resolvePropertyCounty(otherProp), 'Martin');
  assert.equal(getPropertyCountyLabel(otherProp), 'Martin');
  assert.equal(resolvePropertyCounty({ county: 'Palm Beach', parcel_county: 'Martin', ...RIVER_RIDGE }), 'Martin');
  assert.equal(resolvePropertyCounty({ county: 'Other' }), null);
  assert.equal(getPropertyCountyLabel({ county: 'Miami-Dade' }), 'Miami-Dade');
});

test('applyPropertyCountyRules: parcel match is authoritative; Other + coords resolves from nearest parcel', async () => {
  const linked = await applyPropertyCountyRules(null, {
    county: 'Other', parcel_id: '23-40-42-002-000-01070-1', parcel_county: 'martin', ...RIVER_RIDGE
  });
  assert.equal(linked.county, 'Martin');
  assert.equal(linked.parcel_county, 'Martin');

  let queried = false;
  const fakeSql = async () => {
    queried = true;
    return [{ county: 'Martin', parcel_id: '23-40-42-002-000-01070-1', distance_m: 5.1 }];
  };
  const unresolved = await applyPropertyCountyRules(fakeSql, { county: 'Other', parcel_id: null, ...RIVER_RIDGE });
  assert.equal(queried, true);
  assert.equal(unresolved.county, 'Martin');

  const explicit = await applyPropertyCountyRules(fakeSql, { county: 'Miami-Dade', parcel_id: null, lat: 25.77, lng: -80.19 });
  assert.equal(explicit.county, 'Miami-Dade');
});

test('Find county record: SE-style address normalizes and matches the roll situs across a suffix difference', () => {
  const norm = normalizeAddress('18801 Southeast River Ridge Court, Tequesta 33469');
  assert.equal(norm.normalized, '18801 SE RIVER RIDGE CT');
  assert.equal(norm.number, '18801');
  assert.equal(norm.zip, '33469');
  assert.equal(normalizeAddress('18801 SE River Ridge Ct, Tequesta 33469').normalized, '18801 SE RIVER RIDGE CT');

  // Martin roll situs is "18801 SE RIVER RIDGE RD" — same number + street name, different suffix
  const situs = computeSitusNorm('18801 SE RIVER RIDGE RD');
  assert.deepEqual(situs, { situs_number: '18801', situs_street_norm: 'SE RIVER RIDGE RD' });
  const base = stripStreetSuffix(norm.street);
  assert.equal(base, 'SE RIVER RIDGE');
  assert.ok(situs.situs_street_norm.startsWith(`${base} `));

  assert.equal(stripStreetSuffix('NW 18 AVE'), 'NW 18');
  assert.equal(stripStreetSuffix('SE CT'), null); // never reduce to a bare directional
  assert.equal(stripStreetSuffix('OCEAN'), null);
  assert.deepEqual(computeSitusNorm('409 NW 18TH AVE'), { situs_number: '409', situs_street_norm: 'NW 18 AVE' });
});

test('County search order: "Other"/unknown searches every supported county; known county goes first', () => {
  assert.deepEqual(resolveSearchCounties('Other'), ['Broward', 'Palm Beach', 'Martin']);
  assert.deepEqual(resolveSearchCounties(null), ['Broward', 'Palm Beach', 'Martin']);
  assert.deepEqual(resolveSearchCounties('Martin'), ['Martin', 'Broward', 'Palm Beach']);
});

test('Martin pipeline helpers: dashed folios match PIN shapefile keys and roll files are found in data/county/martin', () => {
  assert.equal(normalizeParcelKey('23-40-42-002-000-01070-1'), normalizeParcelKey('234042002000010701'));
  const dataDir = path.join(ROOT, 'data/county');
  if (fs.existsSync(path.join(dataDir, 'martin'))) {
    assert.ok(String(findRollFile(dataDir, 'Martin', 'NAL')).endsWith('NAL53F202601.csv'));
    assert.ok(String(findRollFile(dataDir, 'Martin', 'SDF')).endsWith('SDF53F202601.csv'));
  }
});

test('Radius / ZIP market and comps queries cross county lines (no single-county filter)', () => {
  const market = read('api/county/market.js');
  assert.equal(market.includes('s.county = ${cleanCounty}'), false);
  assert.ok(market.includes('s.county = ANY(${SUPPORTED_COUNTIES})'));
  assert.equal(/\/palm\/i\.test\(county\) \? 'Palm Beach' : 'Broward'/.test(market), false);

  const comps = read('api/county/comps.js');
  assert.equal(comps.includes('WHERE s.county = ${subject.county}\n            AND p.use_code'), false);
  assert.ok(comps.includes('s.county = ANY(${SUPPORTED_COUNTIES}) AND p.county = ANY(${SUPPORTED_COUNTIES})'));
  assert.ok(comps.includes("county: row.county || subject.county"));

  const search = read('api/county/search.js');
  assert.equal(search.includes(": ['Broward', 'Palm Beach']"), false);
  assert.ok(search.includes('county = ANY(${counties})'));
  // Address match must use lower(address) (populated for every county), never the partially
  // populated situs_street_norm column — otherwise Broward/Palm Beach lookups silently miss.
  assert.equal(search.includes('situs_street_norm ='), false);
  assert.ok(search.includes('lower(address) = '));

  const marketCard = read('src/components/investor/MarketCard.jsx');
  assert.equal(marketCard.includes("subLat >= 26.33 ? 'Palm Beach' : 'Broward'"), false);
  const autocomplete = read('src/components/investor/AddressAutocomplete.jsx');
  assert.equal(autocomplete.includes("else county = 'Other';"), false);
});

