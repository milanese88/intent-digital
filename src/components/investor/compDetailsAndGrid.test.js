import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSaleMonthKey,
  normalizeCompDetails,
  computeDetailsProgress,
  formatCountyClues,
  buildCountyHintSuggestions,
  mergeCompWithSavedDetails,
  resolveSubjectDetailsForMode
} from './compDetailsModel.js';
import { computeAppraisalGrid, resolveCompIsIncluded } from './valuationEngine.js';
import {
  normalizeCountyFolio,
  resolveBuildingCharHeaderMapping,
  parseBuildingCharRow
} from '../../../scripts/county/import-building-chars.mjs';
import {
  MIGRATION_UPDATE_MESSAGE,
  isMissingSchemaError,
  sendSafeApiError
} from '../../../api/_lib/db.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  CANONICAL_MIGRATION_ORDER,
  MIGRATIONS_DIR,
  listOrderedMigrationFiles,
  splitSqlStatements
} from '../../../scripts/db/_lib.mjs';

test('Unknown condition, windows, roof, pool, and garage produce $0 adjustment, Needs info chip, and reduced weight', () => {
  const subject = {
    sqft: 1600,
    year_built: 1978,
    subject_details: {
      as_is: {
        beds: 3,
        full_baths: 2,
        half_baths: 0,
        condition: 'c3',
        kitchen_baths_updated: true,
        roof_type: 'barrel_tile',
        roof_year: 2023,
        windows: 'impact',
        pool_type: 'standard',
        screen_enclosure: true,
        garage_type: 'garage',
        garage_bays: 2,
        waterfront_view: 'dry_lot'
      }
    }
  };

  const fullyKnownComp = {
    id: 'comp-known',
    address: '100 NE 20th St',
    sold_price: 550000,
    sold_date: '2026-08-15',
    sqft: 1600,
    distance_mi: 0.25,
    year_built: 1980,
    included: true,
    comp_details_json: {
      beds: 3,
      full_baths: 2,
      half_baths: 0,
      condition: 'c3',
      kitchen_baths_updated: true,
      roof_type: 'barrel_tile',
      roof_year: 2023,
      windows: 'impact',
      pool_type: 'standard',
      screen_enclosure: true,
      garage_type: 'garage',
      garage_baths: 2,
      garage_bays: 2,
      waterfront_view: 'dry_lot'
    }
  };

  const unknownComp = {
    id: 'comp-unknown',
    address: '104 NE 20th St',
    sold_price: 550000,
    sold_date: '2026-08-15',
    sqft: 1600,
    distance_mi: 0.25,
    year_built: 2024, // Even on a 2024 build, windows & roof_year must NOT be inferred!
    included: true,
    condition: 'unknown',
    pool: null,
    garage: null,
    waterfront: false
  };

  const grid = computeAppraisalGrid({
    comps: [fullyKnownComp, unknownComp],
    subject,
    mode: 'as_is'
  });

  const knownCol = grid.comps.find((c) => c.id === 'comp-known');
  const unkCol = grid.comps.find((c) => c.id === 'comp-unknown');

  for (const rowKey of ['condition', 'windows', 'roof', 'pool', 'garage']) {
    assert.equal(unkCol.cells[rowKey].amount, 0, `${rowKey} adjustment must be $0 when Unknown`);
    assert.equal(unkCol.cells[rowKey].needsInfo, true, `${rowKey} must flag needsInfo=true`);
  }

  assert.ok(
    unkCol.weightPct < knownCol.weightPct,
    `Comp with Unknown features (${unkCol.weightPct}%) must get lower weight than known comp (${knownCol.weightPct}%)`
  );
});

test('Comps flagged as $/sf outliers default to OFF in the appraisal grid unless explicitly turned ON', () => {
  const subject = { sqft: 1500, beds: 3, baths: 2 };
  const normalComp = {
    id: 'c1',
    address: '201 Palm Way',
    sold_price: 500000,
    sold_date: '2026-07-01',
    sqft: 1500
  };
  const outlierDefault = {
    id: 'c2',
    address: '205 Waterfront Ln',
    sold_price: 980000,
    sold_date: '2026-07-01',
    sqft: 1500,
    is_outlier: true
  };
  const outlierExplicitlyEnabled = {
    id: 'c3',
    address: '209 Renovated Ct',
    sold_price: 910000,
    sold_date: '2026-07-01',
    sqft: 1500,
    is_outlier: true,
    included: true
  };

  assert.equal(resolveCompIsIncluded(normalComp), true);
  assert.equal(resolveCompIsIncluded(outlierDefault), false);
  assert.equal(resolveCompIsIncluded(outlierExplicitlyEnabled), true);

  const grid = computeAppraisalGrid({
    comps: [normalComp, outlierDefault],
    subject,
    mode: 'as_is'
  });

  const c2 = grid.comps.find((c) => c.id === 'c2');
  assert.equal(c2.isUsed, false);
  assert.equal(grid.usedComps.length, 1);
});

test('County NAL clues format Likely renovated (both years), Extra features, and units, and act as hints only', () => {
  const clues = formatCountyClues({
    year_built: 1968,
    eff_year_built: 1995,
    spec_feat_val: 18500,
    units: 2,
    imp_qual: '4',
    const_class: '3'
  });

  assert.equal(clues.likelyRenovated, true);
  assert.equal(clues.likelyRenovatedLabel, 'Likely renovated (built 1968 · eff. 1995)');
  assert.equal(clues.extraFeaturesLabel, 'Extra features $18,500');
  assert.equal(clues.unitsLabel, '2 units');

  const zeroClues = formatCountyClues({
    year_built: 1985,
    eff_year_built: 1990,
    spec_feat_val: 0,
    units: 1
  });
  assert.equal(zeroClues.likelyRenovated, false);
  assert.equal(zeroClues.extraFeaturesLabel, 'No extra features');
  assert.equal(zeroClues.unitsLabel, '1 unit');

  const { suggestions } = buildCountyHintSuggestions({}, clues);
  assert.equal(suggestions.condition, 'c3');
  assert.equal(suggestions.source, 'county_hint');
  assert.equal(suggestions.verified, false);
});

test('Details progress counts all 10 form fields separately (including Roof type + Roof year + Screen enclosure) and pre-fills across properties', () => {
  assert.equal(buildSaleMonthKey('2026-07-18'), '2026-07');
  assert.equal(buildSaleMonthKey(2026, 7), '2026-07');

  // Exact scenario reported: Roof type filled, Roof year empty, Windows Unknown -> 8 of 10 filled · Missing: Roof year, Windows
  const roofYearMissingCase = computeDetailsProgress({
    beds: 3,
    full_baths: 2,
    half_baths: 0,
    condition: 'c3',
    kitchen_baths_updated: true,
    roof_type: 'shingle',
    roof_year: null,
    windows: 'unknown',
    pool_type: 'none',
    garage_type: 'garage',
    garage_bays: 2,
    waterfront_view: 'dry_lot'
  });
  assert.equal(roofYearMissingCase.filledCount, 8);
  assert.equal(roofYearMissingCase.totalCount, 10);
  assert.equal(roofYearMissingCase.label, 'Details: 8 of 10 filled');
  assert.deepEqual(roofYearMissingCase.missingLabels, ['Roof year', 'Windows']);

  // Pool = standard with unknown screen enclosure flags Screen enclosure as missing
  const poolNeedsScreenCase = computeDetailsProgress({
    beds: 3,
    full_baths: 2,
    condition: 'c3',
    kitchen_baths_updated: true,
    roof_type: 'shingle',
    roof_year: 2021,
    windows: 'impact',
    pool_type: 'standard',
    screen_enclosure: null,
    garage_type: 'none',
    waterfront_view: 'dry_lot'
  });
  assert.equal(poolNeedsScreenCase.filledCount, 9);
  assert.deepEqual(poolNeedsScreenCase.missingLabels, ['Screen enclosure']);

  const savedRow = {
    county: 'Broward',
    parcel_id: '504209040280',
    sale_month_key: '2026-07',
    beds: 3,
    full_baths: 2,
    half_baths: 1,
    condition: 'c2',
    kitchen_baths_updated: true,
    roof_type: 'metal',
    roof_year: 2022,
    windows: 'impact',
    pool_type: 'unknown',
    garage_type: 'unknown',
    waterfront_view: 'unknown',
    source: 'MLS',
    verified: true
  };

  const progress = computeDetailsProgress(savedRow);
  assert.equal(progress.filledCount, 7);
  assert.equal(progress.totalCount, 10);
  assert.equal(progress.label, 'Details: 7 of 10 filled');

  const newPropertyComp = {
    id: 'comp-prop-b',
    parcel_id: '504209040280',
    parcel_county: 'Broward',
    sold_date: '2026-07-01',
    sold_price: 620000,
    sqft: 1480
  };

  const merged = mergeCompWithSavedDetails(newPropertyComp, savedRow, {
    year_built: 1956,
    eff_year_built: 1978,
    spec_feat_val: 2020,
    units: 1
  });

  assert.equal(merged.beds, 3);
  assert.equal(merged.baths, 2.5);
  assert.equal(merged.condition, 'c2');
  assert.equal(merged.details_progress.label, 'Details: 7 of 10 filled');
  assert.equal(merged.county_clues.likelyRenovatedLabel, 'Likely renovated (built 1956 · eff. 1978)');
});

test('Subject property switches cleanly between As-is and After-rehab (ARV) details in the appraisal grid', () => {
  const subject = {
    sqft: 1500,
    subject_details: {
      as_is: normalizeCompDetails({
        beds: 3,
        full_baths: 1,
        half_baths: 0,
        condition: 'c5',
        windows: 'none',
        pool_type: 'none',
        garage_type: 'carport',
        waterfront_view: 'dry_lot'
      }),
      after_rehab: normalizeCompDetails({
        beds: 3,
        full_baths: 2,
        half_baths: 0,
        condition: 'c2',
        windows: 'impact',
        pool_type: 'none',
        garage_type: 'carport',
        waterfront_view: 'dry_lot'
      })
    }
  };

  const asIsResolved = resolveSubjectDetailsForMode(subject, 'as_is');
  const arvResolved = resolveSubjectDetailsForMode(subject, 'arv');

  assert.equal(asIsResolved.condition, 'c5');
  assert.equal(asIsResolved.full_baths, 1);
  assert.equal(asIsResolved.windows, 'none');

  assert.equal(arvResolved.condition, 'c2');
  assert.equal(arvResolved.full_baths, 2);
  assert.equal(arvResolved.windows, 'impact');
});

test('Prepared building-characteristics importer normalizes BCPA/PAPA folios and maps headers cleanly', () => {
  assert.equal(normalizeCountyFolio('50-42-09-04-0280', 'Broward'), '504209040280');
  assert.equal(normalizeCountyFolio('74-43-43-07-01-000-0010', 'Palm Beach'), '74434307010000010');

  const mapping = resolveBuildingCharHeaderMapping(['FOLIO_NUMBER', 'BEDROOMS', 'FULL_BATHS', 'HALF_BATHS']);
  const parsed = parseBuildingCharRow(['50-42-09-04-0280', '4', '2', '1'], mapping, 'Broward');
  assert.deepEqual(parsed, {
    parcel_id: '504209040280',
    beds: 4,
    full_baths: 2,
    half_baths: 1,
    bldg_num: 1
  });
});

test('sendSafeApiError maps 42P01 and 42703 to friendly migration message and never leaks raw DB errors', () => {
  const makeMockRes = () => {
    const out = { statusCode: null, body: null };
    return {
      status(code) {
        out.statusCode = code;
        return this;
      },
      json(payload) {
        out.body = payload;
        return out;
      },
      out
    };
  };

  const colErr = Object.assign(new Error('column "condition" of relation "investor_comps" does not exist'), {
    code: '42703'
  });
  assert.equal(isMissingSchemaError(colErr), true);

  const origConsoleError = console.error;
  console.error = () => {};
  try {
    const res1 = makeMockRes();
    sendSafeApiError(res1, colErr, 'test 42703', 'Fallback error');
    assert.equal(res1.out.statusCode, 503);
    assert.equal(res1.out.body.error, MIGRATION_UPDATE_MESSAGE);
    assert.equal(res1.out.body.error, 'This feature needs a database update — ask to apply migrations.');
    assert.ok(!JSON.stringify(res1.out.body).includes('investor_comps'));

    const tblErr = Object.assign(new Error('relation "comp_details" does not exist'), {
      code: '42P01'
    });
    const res2 = makeMockRes();
    sendSafeApiError(res2, tblErr, 'test 42P01', 'Fallback error');
    assert.equal(res2.out.statusCode, 503);
    assert.equal(res2.out.body.error, 'This feature needs a database update — ask to apply migrations.');

    const genericDbErr = Object.assign(new Error('syntax error at or near "SELECT"'), {
      code: '42601'
    });
    const res3 = makeMockRes();
    sendSafeApiError(res3, genericDbErr, 'test 42601', 'Unable to save comp right now.');
    assert.equal(res3.out.statusCode, 500);
    assert.equal(res3.out.body.error, 'Unable to save comp right now.');
    assert.ok(!JSON.stringify(res3.out.body).includes('syntax error'));
  } finally {
    console.error = origConsoleError;
  }
});

test('Migration runner orders dependencies cleanly and splits DO $$ blocks intact across all SQL files', () => {
  const files = listOrderedMigrationFiles();
  assert.ok(files.length >= 18);
  assert.equal(files[0], '000_schema_migrations.sql');

  const valIdx = files.indexOf('add_valuation_and_backtest.sql');
  const fhaIdx = files.indexOf('add_live_in_fha_strategy.sql');
  const compDetailsIdx = files.indexOf('add_comp_details_and_nal_clues.sql');
  assert.ok(valIdx > 0 && fhaIdx > valIdx && compDetailsIdx > valIdx);

  for (const f of files) {
    assert.ok(
      CANONICAL_MIGRATION_ORDER.includes(f) || f.endsWith('.sql'),
      `Expected ${f} to be valid SQL migration`
    );
    const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    const statements = splitSqlStatements(raw);
    assert.ok(statements.length >= 1, `Expected >= 1 statement in ${f}`);
  }
});


