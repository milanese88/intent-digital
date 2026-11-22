import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { evaluateLiveInFit, isVacantLandParcel } from './underwriting.js';
import { resolveCurrentUseCode, getUseCodeLabel } from './useCodes.js';
import { buildAnalyzeCandidateRow, buildDefaultDealBreakdownInputs, calculateDealBreakdown } from './dealBreakdownEngine.js';

// ---- Realistic /api/county/parcel payloads (flat shape, as the API returns) ----
const CASCADE = {
  details: { address: '309 Cascade Ln', city: 'Palm Beach Shores', zip: '33404', county: 'Palm Beach', parcel_id: '54434227040002680' },
  parcelData: {
    county: 'Palm Beach', parcel_id: '54434227040002680', address: '309 CASCADE LN', city: 'PALM BEACH SHORES', zip: '33404',
    use_code: '001', living_sqft: 3500, year_built: 2025, eff_year_built: 2025, land_sqft: 8499, units: 1,
    just_value: '2020536', land_value: null, beds: null, full_baths: null, half_baths: null,
    building_characteristics: {
      county: 'Palm Beach', folio: '54434227040002680', beds: '4', full_baths: 3, half_baths: 1, year_built: 2025,
      effective_year_built: 2025, living_area_sqft: 3500, pool_type: 'standard', pool_year: 2025, boat_dock: null
    },
    sales: [{ id: '101781', sale_price: '2850000', sale_year: 2026, sale_month: 8, qual_code: '02', vi_cd: 'I', is_market: true, is_distressed: false }]
  }
};

const VACANT = {
  details: { address: '9761 Chora Tunel Way', city: 'Lake Worth', zip: '33467', county: 'Palm Beach', parcel_id: '00424430150000010' },
  parcelData: {
    county: 'Palm Beach', parcel_id: '00424430150000010', address: '9761 CHORA TUNEL WAY', use_code: '000',
    living_sqft: null, year_built: null, land_sqft: null, building_characteristics: null,
    sales: [{ id: '1', sale_price: '250000', sale_year: 2025, sale_month: 3, qual_code: '01', vi_cd: 'V' }]
  }
};

const FLIP = {
  details: { address: '181 SW 2 Ct', city: 'Deerfield Beach', zip: '33441', county: 'Broward', parcel_id: '484201030510' },
  parcelData: {
    county: 'Broward', parcel_id: '484201030510', address: '181 SW 2 CT', use_code: '001', living_sqft: 1429, year_built: 1992,
    land_sqft: 7499, building_characteristics: null,
    sales: [
      { id: '5730', sale_price: '200000', sale_year: 2026, sale_month: 1, qual_code: '01', vi_cd: 'I' },
      { id: '5729', sale_price: '460000', sale_year: 2026, sale_month: 9, qual_code: '01', vi_cd: 'I' }
    ]
  }
};

const NO_SALES = {
  details: { address: '123 Nowhere Rd', county: 'Martin' },
  parcelData: null
};

let smoke = null;
test('SSR smoke bundle builds (DealBreakdownSection / PropertyTimeline / FlipBuildFinder)', async () => {
  const outDir = path.resolve('node_modules/.cache/investor-smoke');
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync(process.execPath, [
    path.resolve('node_modules/vite/bin/vite.js'), 'build', '--ssr', 'scripts/smoke/investor-render-entry.jsx',
    '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'
  ], { stdio: 'pipe' });
  smoke = await import(pathToFileURL(path.join(outDir, 'investor-render-entry.js')).href);
  assert.equal(typeof smoke.renderScenario, 'function');
});

for (const [name, scenario] of [['309 Cascade Ln (new build, 1 sale, CAMA)', CASCADE], ['vacant lot', VACANT], ['flip (2 sales)', FLIP], ['no sales / no parcel', NO_SALES]]) {
  test(`Analyze an address renders without crashing: ${name}`, () => {
    assert.ok(smoke, 'smoke bundle must build first');
    const out = smoke.renderScenario(scenario);
    assert.ok(out.breakdownHtml.length > 1000);
    assert.ok(out.timelineHtml.length > 200);
  });
}

test('FlipBuildFinder renders and the error boundary shows a friendly card', () => {
  assert.match(smoke.renderFinder(), /ANALYZE AN ADDRESS/i);
  const html = smoke.renderBoundaryFallback();
  assert.match(html.replace(/<!-- -->/g, ''), /Couldn.t load this Deal Breakdown/);
  assert.match(html, /Details logged/);
});

test('buildAnalyzeCandidateRow: reads the flat /api/county/parcel payload and CAMA for 309 Cascade Ln', () => {
  const row = buildAnalyzeCandidateRow(CASCADE);
  assert.equal(row.parcel_id, '54434227040002680');
  assert.equal(row.living_sqft, 3500);
  assert.equal(row.year_built, 2025);
  assert.equal(row.lot_sqft, 8499);
  assert.equal(row.beds, 4);
  assert.equal(row.has_pool, true);
  assert.equal(row.buy_price, 2850000);
  assert.equal(row.buy_date, '2026-08-01');
  assert.equal(row.exit_source, 'my_list_price');
  assert.equal(row.sell_price, 0);

  const vacant = buildAnalyzeCandidateRow(VACANT);
  assert.equal(vacant.deal_type, 'demo_new_build');
  assert.equal(vacant.living_sqft, null);
  assert.equal(vacant.before_living_sqft, 0);

  const flip = buildAnalyzeCandidateRow(FLIP);
  assert.equal(flip.deal_type, 'flip');
  assert.equal(flip.exit_source, 'county_resale');
  assert.equal(flip.hold_months, 8);

  const none = buildAnalyzeCandidateRow(NO_SALES);
  assert.equal(none.purchase_source, 'entered_by_me');
  assert.equal(none.buy_price, 0);
  assert.equal(none.parcel_id, null);
});

test('Deal Breakdown inputs tolerate missing data and flag the living-sf placeholder', () => {
  const inputs = buildDefaultDealBreakdownInputs({ finderRow: buildAnalyzeCandidateRow(NO_SALES) });
  assert.equal(inputs.afterLivingSqftIsPlaceholder, true);
  const res = calculateDealBreakdown(inputs, null);
  assert.ok(Number.isFinite(res.metrics.estProfit));
  const cascade = buildDefaultDealBreakdownInputs({ finderRow: buildAnalyzeCandidateRow(CASCADE) });
  assert.equal(cascade.afterLivingSqftIsPlaceholder, false);
  assert.equal(cascade.afterLivingSqft, 3500);
});

test('Live-in fit / land tag uses current building data, not a stale vacant use code', () => {
  // 001 single-family was previously mis-tagged as land because it shares the "00" prefix
  const cascadeSearchRow = { county: 'Palm Beach', use_code: '001', living_sqft: 3500, year_built: 2025, units: 1, just_value: 2020536 };
  assert.equal(isVacantLandParcel(cascadeSearchRow), false);
  const fit = evaluateLiveInFit(cascadeSearchRow);
  assert.equal(fit.reasons.some((r) => r.key === 'land'), false);
  assert.notEqual(fit.badgeLabel, 'Land · Non-FHA');

  // Stale '000' vacant code but the roll / CAMA now shows a 3,500 sf house built 2025
  const staleVacant = { use_code: '000', living_sqft: 0, bc_living_sqft: 3500, bc_year_built: 2025, units: 1 };
  assert.equal(isVacantLandParcel(staleVacant), false);
  assert.equal(resolveCurrentUseCode(staleVacant), '001');
  assert.equal(getUseCodeLabel(resolveCurrentUseCode(staleVacant)), 'Single-family');

  // Genuinely vacant lot stays land
  const lot = { use_code: '000', living_sqft: null, year_built: null };
  assert.equal(isVacantLandParcel(lot), true);
  assert.equal(evaluateLiveInFit(lot).reasons.some((r) => r.key === 'land'), true);
  assert.equal(isVacantLandParcel({ use_code: '0000' }), true);
  assert.equal(isVacantLandParcel({ use_code: '004' }), false);
  assert.equal(isVacantLandParcel({ use_code: '008' }), false);
});
