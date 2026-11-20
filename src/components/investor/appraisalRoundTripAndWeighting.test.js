import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonbObject } from '../../../api/_lib/db.js';
import {
  normalizeCompDetails,
  detailsToLegacyColumns,
  mergeCompWithSavedDetails,
  resolveSubjectDetailsForMode,
  computeDetailsProgress,
  formatCountyClues,
  buildCountyHintSuggestions,
  mapConstClassToConstructionType,
  formatConstructionTypeLabel,
  formatBoatDockLabel
} from './compDetailsModel.js';
import {
  CANONICAL_MIGRATION_ORDER,
  MIGRATION_SCHEMA_SIGNATURES
} from '../../../scripts/db/_lib.mjs';
import {
  computeAppraisalGrid,
  capBathsForBedrooms,
  applyOutlierWeightCap,
  WEIGHT_FORMULA_SUMMARY
} from './valuationEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

test('parseJsonbObject unwraps double-encoded JSONB strings and cleans numeric character-spread keys', () => {
  const original = {
    as_is: { beds: 3, full_baths: 7, condition: 'c4', windows: 'impact', hoa_name: 'River Ridge' },
    after_rehab: { beds: 3, full_baths: 7, condition: 'c2', roof_type: 'barrel_tile', pool_type: 'resort' }
  };
  const doubleEncoded = JSON.stringify(original);
  const tripleEncoded = JSON.stringify(doubleEncoded);

  assert.deepEqual(parseJsonbObject(original), original);
  assert.deepEqual(parseJsonbObject(doubleEncoded), original);
  assert.deepEqual(parseJsonbObject(tripleEncoded), original);
  assert.deepEqual(parseJsonbObject(null), {});
  assert.deepEqual(parseJsonbObject('not-json'), {});

  // Corrupted profile object created by spreading a stringified object ({ "0": "{", "1": "\"", library: ... })
  const corruptedProfile = { '0': '{', '1': '"', '2': 's', library: { bedAdjustment: 15000 }, sizeFactor: 0.5 };
  assert.deepEqual(
    parseJsonbObject(corruptedProfile, { stripNumericKeys: true }),
    { library: { bedAdjustment: 15000 }, sizeFactor: 0.5 }
  );
});

test('API routes never bind JSON.stringify(...) directly into ::jsonb under postgres.js', () => {
  const apiDir = path.join(REPO_ROOT, 'api');
  const offending = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        const src = fs.readFileSync(full, 'utf8');
        if (/\$\{\s*JSON\.stringify\([^)]*\)\s*\}::jsonb/.test(src)) {
          offending.push(path.relative(REPO_ROOT, full));
        }
      }
    }
  }
  walk(apiDir);
  assert.deepEqual(offending, [], `Found JSON.stringify()::jsonb anti-pattern in: ${offending.join(', ')}`);
});

test('Save round-trip: every subject and comp detail field survives JSONB serialization, reload, and appears in the appraisal grid', () => {
  const savedSubjectDetails = {
    as_is: normalizeCompDetails({
      beds: 4,
      full_baths: 4,
      half_baths: 1,
      condition: 'c4',
      kitchen_baths_updated: false,
      roof_type: 'barrel_tile',
      roof_year: 2016,
      windows: 'shutters',
      pool_type: 'standard',
      screen_enclosure: true,
      garage_type: 'garage',
      garage_bays: 3,
      waterfront_view: 'canal_fixed_bridge',
      hoa_name: 'River Ridge HOA',
      verified: true
    }),
    after_rehab: normalizeCompDetails({
      beds: 4,
      full_baths: 4,
      half_baths: 1,
      condition: 'c2',
      kitchen_baths_updated: true,
      roof_type: 'metal',
      roof_year: 2026,
      windows: 'impact',
      pool_type: 'resort',
      screen_enclosure: false,
      garage_type: 'garage',
      garage_bays: 3,
      waterfront_view: 'canal_fixed_bridge',
      hoa_name: 'River Ridge HOA',
      verified: true
    })
  };

  // Simulate BOTH a native JSONB object AND a legacy double-encoded string coming back after page reload
  for (const rawSubjectDetails of [savedSubjectDetails, JSON.stringify(savedSubjectDetails)]) {
    const asIsLegacy = detailsToLegacyColumns(savedSubjectDetails.as_is);
    const reloadedProperty = {
      id: 'prop-rr',
      address: '18801 SE River Ridge Rd',
      county: 'Martin',
      parcel_county: 'Martin',
      subdivision_name: 'River Ridge',
      subdivision_code: '23-40-42-002',
      sqft: 4400,
      lot_sqft: 15115,
      ...asIsLegacy,
      subject_details: rawSubjectDetails
    };

    const resolvedAsIs = resolveSubjectDetailsForMode(reloadedProperty, 'as_is');
    const resolvedArv = resolveSubjectDetailsForMode(reloadedProperty, 'arv');

    assert.equal(resolvedAsIs.beds, 4);
    assert.equal(resolvedAsIs.full_baths, 4);
    assert.equal(resolvedAsIs.half_baths, 1);
    assert.equal(resolvedAsIs.condition, 'c4');
    assert.equal(resolvedAsIs.roof_type, 'barrel_tile');
    assert.equal(resolvedAsIs.roof_year, 2016);
    assert.equal(resolvedAsIs.windows, 'shutters');
    assert.equal(resolvedAsIs.pool_type, 'standard');
    assert.equal(resolvedAsIs.screen_enclosure, true);
    assert.equal(resolvedAsIs.garage_bays, 3);
    assert.equal(resolvedAsIs.waterfront_view, 'canal_fixed_bridge');
    assert.equal(resolvedAsIs.hoa_name, 'River Ridge HOA');

    assert.equal(resolvedArv.condition, 'c2');
    assert.equal(resolvedArv.roof_type, 'metal');
    assert.equal(resolvedArv.roof_year, 2026);
    assert.equal(resolvedArv.windows, 'impact');
    assert.equal(resolvedArv.pool_type, 'resort');

    // Simulate comp saved to investor_comps + comp_details and reloaded
    const savedCompDetails = normalizeCompDetails({
      beds: 4,
      full_baths: 3,
      half_baths: 1,
      condition: 'c3',
      kitchen_baths_updated: true,
      roof_type: 'barrel_tile',
      roof_year: 2022,
      windows: 'impact',
      pool_type: 'standard',
      screen_enclosure: false,
      garage_type: 'garage',
      garage_bays: 2,
      waterfront_view: 'lake',
      hoa_name: 'River Ridge HOA',
      source: 'MLS',
      verified: true
    });
    const compLegacy = detailsToLegacyColumns(savedCompDetails);
    const reloadedComp = mergeCompWithSavedDetails(
      {
        id: 'comp-1',
        address: '18480 SE Lakeside Dr',
        parcel_id: '23-40-42-002-000-00480-7',
        parcel_county: 'Martin',
        sold_price: 2500000,
        sold_date: '2026-09-01',
        sqft: 4200,
        lot_sqft: 15507,
        distance_mi: 0.2,
        included: true,
        ...compLegacy,
        comp_details_json: typeof rawSubjectDetails === 'string' ? JSON.stringify(savedCompDetails) : savedCompDetails
      },
      null,
      { subdivision_name: 'River Ridge', subdivision_code: '23-40-42-002' }
    );

    const gridArv = computeAppraisalGrid({
      subject: reloadedProperty,
      comps: [reloadedComp],
      mode: 'arv',
      effectiveDate: new Date('2026-11-20T00:00:00Z')
    });

    assert.equal(gridArv.subjectSummary.windowsLabel, 'Impact');
    assert.equal(gridArv.subjectSummary.roofLabel, 'Metal · Roof 2026');
    assert.equal(gridArv.subjectSummary.poolLabel, 'Resort pool · Open');
    assert.equal(gridArv.subjectSummary.garageLabel, '3-Car');
    assert.equal(gridArv.subjectSummary.locationSiteLabel, 'Canal (fixed bridge)');
    assert.equal(gridArv.subjectSummary.hoaName, 'River Ridge HOA');

    const c = gridArv.comps[0];
    assert.equal(c.cells.bed_bath.spec, '4 bd / 3f 1h ba');
    assert.equal(c.cells.condition.spec, 'Updated (C3)');
    assert.equal(c.cells.windows.spec, 'Impact');
    assert.equal(c.cells.roof.spec, 'Barrel tile · Roof 2022');
    assert.equal(c.cells.pool.spec, 'Standard pool · Open');
    assert.equal(c.cells.garage.spec, '2-Car');
    assert.equal(c.cells.location_site.spec, 'Lake');
    assert.equal(c.cells.location_subdivision.spec, 'Same subdivision');
    assert.ok(c.cells.location_subdivision.note.includes('HOA: River Ridge HOA'));
  }
});

test('Weighting falls sharply with high gross adjustment (>25%), >±20% size mismatch, older sale, unverified status, and missing details', () => {
  const effectiveDate = new Date('2026-11-20T00:00:00Z');
  const subject = {
    address: '18801 SE River Ridge Rd',
    sqft: 5107,
    lot_sqft: 15115,
    beds: 4,
    baths: 4,
    condition: 'c3',
    windows: 'impact',
    pool_type: 'standard',
    garage_type: 'garage',
    garage_bays: 2,
    waterfront_view: 'canal_fixed_bridge'
  };

  // River Ridge scenario: Comp 1 is a reasonable match (~11% gross), Comp 2 has ~85%+ gross adj + 38% size diff,
  // Comp 3 has >40% gross adj + 54% size diff + >6 mo old
  const grid = computeAppraisalGrid({
    subject,
    mode: 'as_is',
    effectiveDate,
    comps: [
      {
        id: 'good-comp',
        address: '18163 SE Ridgeview Dr',
        sold_price: 4000000,
        sold_date: '2026-07-01',
        sqft: 4500, // 12% diff (within ±20%)
        lot_sqft: 15500,
        distance_mi: 0.3,
        beds: 4,
        baths: 4,
        condition: 'c3',
        windows: 'impact',
        pool_type: 'standard',
        garage_type: 'garage',
        garage_bays: 2,
        waterfront_view: 'canal_fixed_bridge',
        verified: true,
        included: true
      },
      {
        id: 'huge-gross-comp',
        address: '18480 SE Lakeside Dr',
        sold_price: 925000,
        sold_date: '2026-09-01', // newer & closer!
        sqft: 3176, // 38% smaller!
        lot_sqft: 15507,
        distance_mi: 0.2,
        beds: 5,
        baths: 3,
        condition: 'c3',
        windows: 'impact',
        pool_type: 'standard',
        garage_type: 'garage',
        garage_bays: 2,
        waterfront_view: 'lake',
        verified: false,
        included: true
      },
      {
        id: 'tiny-stale-comp',
        address: '18815 SE River Ridge Rd',
        sold_price: 2300000,
        sold_date: '2026-04-01', // 7 mo old (>6 mo)
        sqft: 2369, // 54% smaller!
        lot_sqft: 16945,
        distance_mi: 0.0, // right next door!
        condition: 'unknown',
        included: true
      }
    ]
  });

  const good = grid.comps.find((c) => c.id === 'good-comp');
  const hugeGross = grid.comps.find((c) => c.id === 'huge-gross-comp');
  const tinyStale = grid.comps.find((c) => c.id === 'tiny-stale-comp');

  // Good comp must get overwhelming weight; >25% gross / >20% size comps must get very low weight
  assert.ok(good.weightPct > 90, `Expected good comp >90% weight, got ${good.weightPct}%`);
  assert.ok(hugeGross.grossAdjustmentPct > 25);
  assert.ok(hugeGross.weightPct < 5, `Expected >25% gross comp <5% weight, got ${hugeGross.weightPct}%`);
  assert.ok(tinyStale.weightPct < 5, `Expected 54% size-diff stale comp <5% weight, got ${tinyStale.weightPct}%`);

  // Size mismatch flags and check guidance
  assert.equal(good.isPoorSizeComp, false);
  assert.equal(hugeGross.isPoorSizeComp, true);
  assert.equal(hugeGross.sizeFlagLabel, 'Size differs 38% — poor comp');
  assert.equal(tinyStale.isPoorSizeComp, true);
  assert.equal(tinyStale.sizeFlagLabel, 'Size differs 54% — poor comp');

  const sizeCheck = grid.checks.find((chk) => chk.id === 'size_similarity');
  assert.ok(sizeCheck && sizeCheck.status !== 'pass');
  assert.ok(sizeCheck.detail.includes('±20%'));

  // Tooltip exposes formula & per-comp breakdown; reasons explain low weight
  assert.equal(grid.weightFormulaSummary, WEIGHT_FORMULA_SUMMARY);
  assert.ok(hugeGross.weightTooltip.includes('Formula:'));
  assert.ok(hugeGross.weightReasons.some((r) => r.includes('gross adj (>25%)')));
  assert.ok(tinyStale.weightReasons.some((r) => r.includes('Size differs 54%')));

  // Verified comp beats identical unverified comp
  const verGrid = computeAppraisalGrid({
    subject: { sqft: 2000, condition: 'c3', windows: 'impact', roof_type: 'tile', pool_type: 'none', garage_type: 'garage', garage_bays: 2, waterfront_view: 'dry_lot' },
    effectiveDate,
    comps: [
      { id: 'ver', sold_price: 500000, sold_date: '2026-09-01', sqft: 2000, distance_mi: 0.3, condition: 'c3', windows: 'impact', roof_type: 'barrel_tile', roof_year: 2022, pool_type: 'none', garage_type: 'garage', garage_bays: 2, waterfront_view: 'dry_lot', verified: true, included: true },
      { id: 'unver', sold_price: 500000, sold_date: '2026-09-01', sqft: 2000, distance_mi: 0.3, condition: 'c3', windows: 'impact', roof_type: 'barrel_tile', roof_year: 2022, pool_type: 'none', garage_type: 'garage', garage_bays: 2, waterfront_view: 'dry_lot', verified: false, included: true }
    ]
  });
  assert.ok(verGrid.comps[0].weightPct > verGrid.comps[1].weightPct);
});

test('Waterfront & View vs Lot Size sign logic: unknown view stays $0 + Needs info, larger comp lot subtracts on Lot Size row', () => {
  const subject = {
    sqft: 5107,
    lot_sqft: 15115,
    waterfront_view: 'canal_fixed_bridge',
    condition: 'c4'
  };

  const grid = computeAppraisalGrid({
    subject,
    mode: 'as_is',
    effectiveDate: new Date('2026-11-20T00:00:00Z'),
    comps: [
      {
        id: 'unknown-view-bigger-lot-1',
        sold_price: 4000000,
        sold_date: '2026-06-01',
        sqft: 3954,
        lot_sqft: 17598, // +2,483 sf larger than subject -> -$12,500 (CBS)
        waterfront_view: 'unknown',
        included: true
      },
      {
        id: 'unknown-view-bigger-lot-2',
        sold_price: 2300000,
        sold_date: '2026-04-01',
        sqft: 2369,
        lot_sqft: 16945, // +1,830 sf larger than subject -> -$9,000 (CBS)
        waterfront_view: 'unknown',
        included: true
      },
      {
        id: 'lake-view-smaller-lot',
        sold_price: 2500000,
        sold_date: '2026-09-01',
        sqft: 4800,
        lot_sqft: 12115, // 3,000 sf smaller than subject -> +$15,000 (CIA)
        waterfront_view: 'lake', // inferior to subject Canal (fixed bridge) -> positive (CIA)
        included: true
      }
    ]
  });

  const [c1, c2, c3] = grid.comps;

  // Unknown view MUST be $0 + Needs info on location_site (never guess!)
  assert.equal(c1.cells.location_site.amount, 0);
  assert.equal(c1.cells.location_site.needsInfo, true);
  assert.equal(c1.cells.location_site.spec, 'Unknown');

  assert.equal(c2.cells.location_site.amount, 0);
  assert.equal(c2.cells.location_site.needsInfo, true);
  assert.equal(c2.cells.location_site.spec, 'Unknown');

  // Lot Size row carries the exact -$12,500 and -$9,000 CBS deductions with explicit math note
  assert.equal(c1.cells.lot_size.amount, -12500);
  assert.equal(c1.cells.lot_size.direction, 'subtract');
  assert.ok(c1.cells.lot_size.note.includes('2,483 sf'));

  assert.equal(c2.cells.lot_size.amount, -9000);
  assert.equal(c2.cells.lot_size.direction, 'subtract');
  assert.ok(c2.cells.lot_size.note.includes('1,830 sf'));

  // Known inferior view (Lake vs Canal) adds (+) on location_site; smaller comp lot adds (+) on lot_size
  assert.ok(c3.cells.location_site.amount > 0);
  assert.equal(c3.cells.location_site.direction, 'add');
  assert.equal(c3.cells.location_site.needsInfo, false);
  assert.equal(c3.cells.lot_size.amount, 15000);
  assert.equal(c3.cells.lot_size.direction, 'add');
});

test('Boat dock (Y/N, sf), Construction (CBS / wood frame / other), and Neighborhood code round-trip into appraisal grid & county hints', () => {
  // 1. Normalization & invariants for boat_dock + boat_dock_sqft + construction_type
  const withDock = normalizeCompDetails({ boat_dock: true, boat_dock_sqft: '350', construction_type: 'CBS' });
  assert.equal(withDock.boat_dock, true);
  assert.equal(withDock.boat_dock_sqft, 350);
  assert.equal(withDock.construction_type, 'cbs');
  assert.equal(formatBoatDockLabel(withDock), 'Boat dock (350 sf)');
  assert.equal(formatConstructionTypeLabel(withDock.construction_type), 'CBS / Masonry');

  // Turning boat_dock off clears boat_dock_sqft; providing boat_dock_sqft with null boat_dock implies boat_dock = true
  const noDock = normalizeCompDetails({ boat_dock: false, boat_dock_sqft: 350, construction_type: 'Wood Frame' });
  assert.equal(noDock.boat_dock, false);
  assert.equal(noDock.boat_dock_sqft, null);
  assert.equal(noDock.construction_type, 'wood_frame');
  assert.equal(formatBoatDockLabel(noDock), 'No dock');
  assert.equal(formatConstructionTypeLabel(noDock.construction_type), 'Wood frame');

  const impliedDock = normalizeCompDetails({ boat_dock: null, boat_dock_sqft: 420, construction_type: 'steel' });
  assert.equal(impliedDock.boat_dock, true);
  assert.equal(impliedDock.boat_dock_sqft, 420);
  assert.equal(impliedDock.construction_type, 'other');

  // Adding boat_dock & construction_type keeps the 10-field completeness counter intact
  const progress = computeDetailsProgress(withDock);
  assert.equal(progress.totalCount, 10);

  // 2. DOR CONST_CLASS -> Construction hint mapping
  assert.equal(mapConstClassToConstructionType('2'), 'cbs');
  assert.equal(mapConstClassToConstructionType('3'), 'cbs');
  assert.equal(mapConstClassToConstructionType('4'), 'wood_frame');
  assert.equal(mapConstClassToConstructionType('5'), 'other');
  assert.equal(mapConstClassToConstructionType(null), 'unknown');

  const clues = formatCountyClues({ const_class: '3', year_built: 1995, eff_year_built: 1995 });
  const { suggestions } = buildCountyHintSuggestions(normalizeCompDetails({}), clues);
  assert.equal(suggestions.construction_type, 'cbs');

  // 3. Round-trip into computeAppraisalGrid (subjectSummary + comp notes + NBRHD_CD)
  const subjectAsIs = normalizeCompDetails({
    beds: 4,
    full_baths: 4,
    condition: 'c3',
    roof_type: 'barrel_tile',
    roof_year: 2020,
    windows: 'impact',
    waterfront_view: 'canal_fixed_bridge',
    boat_dock: true,
    boat_dock_sqft: 400,
    construction_type: 'cbs',
    hoa_name: 'River Ridge HOA'
  });
  const subjLegacy = detailsToLegacyColumns(subjectAsIs);
  const subject = {
    id: 'subj-rr',
    address: '18801 SE River Ridge Rd',
    county: 'Martin',
    parcel_county: 'Martin',
    sqft: 4307,
    lot_sqft: 15115,
    subdivision_name: 'River Ridge',
    subdivision_code: '23-40-42-002',
    nbrhd_cd: '892320',
    ...subjLegacy,
    subject_details: { as_is: subjectAsIs }
  };

  const compDetails = normalizeCompDetails({
    beds: 4,
    full_baths: 3,
    condition: 'c3',
    roof_type: 'metal',
    roof_year: 2023,
    windows: 'impact',
    waterfront_view: 'unknown',
    boat_dock: true,
    boat_dock_sqft: 280,
    construction_type: 'wood_frame',
    verified: true
  });
  const compLegacy = detailsToLegacyColumns(compDetails);
  const comp = mergeCompWithSavedDetails(
    {
      id: 'comp-rr-1',
      address: '18480 SE Lakeside Dr',
      parcel_county: 'Martin',
      sold_price: 2500000,
      sold_date: '2026-09-01',
      sqft: 4200,
      lot_sqft: 15500,
      included: true,
      ...compLegacy,
      comp_details_json: compDetails
    },
    null,
    { subdivision_name: 'River Ridge', subdivision_code: '23-40-42-002', nbrhd_cd: '892320' }
  );

  const grid = computeAppraisalGrid({
    subject,
    comps: [comp],
    mode: 'as_is',
    effectiveDate: new Date('2026-11-20T00:00:00Z')
  });

  assert.equal(grid.subjectSummary.constructionLabel, 'CBS / Masonry');
  assert.equal(grid.subjectSummary.boatDockLabel, 'Boat dock (400 sf)');
  assert.equal(grid.subjectSummary.nbrhdCd, '892320');

  const c = grid.comps[0];
  assert.equal(c.constructionLabel, 'Wood frame');
  assert.equal(c.boatDockLabel, 'Boat dock (280 sf)');
  assert.equal(c.nbrhdCd, '892320');
  assert.equal(c.cells.construction.spec, 'Wood frame');
  assert.ok(c.cells.construction.amount > 0, 'Subject CBS vs Comp Wood frame should add (CIA)');
  assert.equal(c.cells.boat_dock.spec, 'Boat dock (280 sf)');
  assert.ok(c.cells.location_subdivision.note.includes('Nbrhd 892320'));
  // Unknown waterfront view must STILL stay $0 + Needs info even when boat_dock is filled
  assert.equal(c.cells.location_site.amount, 0);
  assert.equal(c.cells.location_site.needsInfo, true);
});

test('Migration add_boat_dock_and_construction.sql and add_appraisal_v2_columns.sql are registered, idempotent, and have zero test rows', () => {
  const filename = 'add_boat_dock_and_construction.sql';
  assert.ok(CANONICAL_MIGRATION_ORDER.includes(filename));
  assert.ok(Array.isArray(MIGRATION_SCHEMA_SIGNATURES[filename]?.columns) && MIGRATION_SCHEMA_SIGNATURES[filename].columns.length === 9);

  const sqlPath = path.join(REPO_ROOT, 'migrations', filename);
  const sqlText = fs.readFileSync(sqlPath, 'utf8');
  assert.ok(sqlText.includes('ADD COLUMN IF NOT EXISTS boat_dock'));
  assert.ok(sqlText.includes('ADD COLUMN IF NOT EXISTS boat_dock_sqft'));
  assert.ok(sqlText.includes('ADD COLUMN IF NOT EXISTS construction_type'));
  assert.equal(/\bINSERT\s+INTO\b/i.test(sqlText), false);

  const v2File = 'add_appraisal_v2_columns.sql';
  assert.ok(CANONICAL_MIGRATION_ORDER.includes(v2File));
  assert.ok(Array.isArray(MIGRATION_SCHEMA_SIGNATURES[v2File]?.columns) && MIGRATION_SCHEMA_SIGNATURES[v2File].columns.length === 8);
  const v2Sql = fs.readFileSync(path.join(REPO_ROOT, 'migrations', v2File), 'utf8');
  assert.ok(v2Sql.includes('ADD COLUMN IF NOT EXISTS land_value'));
  assert.ok(v2Sql.includes('ADD COLUMN IF NOT EXISTS quality'));
  assert.ok(v2Sql.includes('ADD COLUMN IF NOT EXISTS boat_lift'));
  assert.equal(/\bINSERT\s+INTO\b/i.test(v2Sql), false);
});

test('Appraisal Grid v2 #1: Confidence is strictly LOW with explicit reasons when >60% single-comp weight, CV > 25%, or most comps > 25% gross', () => {
  const effectiveDate = new Date('2026-11-20T00:00:00Z');
  const baseSubject = {
    sqft: 3000,
    condition: 'c3',
    windows: 'impact',
    roof_type: 'barrel_tile',
    roof_year: 2022,
    pool_type: 'standard',
    garage_type: 'garage',
    garage_bays: 2,
    waterfront_view: 'dry_lot'
  };

  // Case A: One comp carries >60% of weight via custom weights (otherwise clean comps)
  const cleanComps = [
    { id: 'a1', address: '101 Oak Dr', sold_price: 900000, sold_date: '2026-09-01', sqft: 3000, distance_mi: 0.2, condition: 'c3', windows: 'impact', roof_type: 'barrel_tile', roof_year: 2022, pool_type: 'standard', garage_type: 'garage', garage_bays: 2, waterfront_view: 'dry_lot', verified: true, included: true },
    { id: 'a2', address: '105 Oak Dr', sold_price: 910000, sold_date: '2026-09-01', sqft: 3000, distance_mi: 0.2, condition: 'c3', windows: 'impact', roof_type: 'barrel_tile', roof_year: 2022, pool_type: 'standard', garage_type: 'garage', garage_bays: 2, waterfront_view: 'dry_lot', verified: true, included: true },
    { id: 'a3', address: '109 Oak Dr', sold_price: 895000, sold_date: '2026-09-01', sqft: 3000, distance_mi: 0.2, condition: 'c3', windows: 'impact', roof_type: 'barrel_tile', roof_year: 2022, pool_type: 'standard', garage_type: 'garage', garage_bays: 2, waterfront_view: 'dry_lot', verified: true, included: true }
  ];
  const balancedGrid = computeAppraisalGrid({ subject: baseSubject, comps: cleanComps, effectiveDate });
  assert.equal(balancedGrid.confidenceScore, 'High');
  assert.equal(balancedGrid.lowConfidenceReasons.length, 0);

  const concentratedGrid = computeAppraisalGrid({
    subject: baseSubject,
    comps: cleanComps,
    customWeights: { a1: 70, a2: 15, a3: 15 },
    effectiveDate
  });
  assert.equal(concentratedGrid.confidenceScore, 'Low');
  assert.ok(concentratedGrid.lowConfidenceReasons.some((r) => r.includes('70.0%') && r.includes('>60%')));

  // Case B: Wide spread (CV > 25%) forces LOW confidence with reason
  const wideSpreadGrid = computeAppraisalGrid({
    subject: baseSubject,
    comps: [
      { ...cleanComps[0], id: 's1', sold_price: 600000 },
      { ...cleanComps[1], id: 's2', sold_price: 1000000 },
      { ...cleanComps[2], id: 's3', sold_price: 1350000 }
    ],
    customWeights: { s1: 34, s2: 33, s3: 33 },
    effectiveDate
  });
  assert.ok(wideSpreadGrid.cvPct > 25, `Expected CV > 25%, got ${wideSpreadGrid.cvPct}%`);
  assert.equal(wideSpreadGrid.confidenceScore, 'Low');
  assert.ok(wideSpreadGrid.lowConfidenceReasons.some((r) => r.includes('CV (>25%)')));

  // Case C: Most comps (2 of 3) exceed 25% gross adjustment forces LOW confidence with reason
  const highGrossGrid = computeAppraisalGrid({
    subject: baseSubject,
    comps: [
      { ...cleanComps[0], id: 'g1', sold_price: 900000, adjustments: { overrides: { condition: 260000 } } }, // 28.9% gross
      { ...cleanComps[1], id: 'g2', sold_price: 900000, adjustments: { overrides: { condition: -250000 } } }, // 27.8% gross
      { ...cleanComps[2], id: 'g3', sold_price: 900000 }
    ],
    customWeights: { g1: 30, g2: 30, g3: 40 },
    effectiveDate
  });
  assert.equal(highGrossGrid.confidenceScore, 'Low');
  assert.ok(highGrossGrid.lowConfidenceReasons.some((r) => r.includes('2 of 3 comps exceed 25% gross')));
});

test('Appraisal Grid v2 #2: New rows (Year built/eff. age, Quality Q1–Q6, Construction, Boat dock/lift) apply library rates & flag Needs info when unknown', () => {
  const subject = {
    sqft: 3200,
    year_built: 1988,
    eff_year_built: 2010,
    quality: 'q2',
    condition: 'c3',
    construction_type: 'cbs',
    boat_dock: true,
    boat_dock_sqft: 350,
    boat_lift: true
  };
  const knownComp = {
    id: 'k1',
    address: '200 River Rd',
    sold_price: 800000, // Mid-tier -> multiplier 1.0
    sold_date: '2026-09-01',
    sqft: 3200,
    year_built: 1995,
    eff_year_built: 2000, // 10 yr older than subject eff 2010 -> +10 * $1,500 = +$15,000
    quality: 'q3',        // 1 step below Q2 -> +$25,000
    condition: 'c3',
    construction_type: 'wood_frame', // inferior to CBS -> +$15,000
    boat_dock: false,     // no dock & no lift vs subject dock + lift -> +$25,000 + $15,000 = +$40,000
    included: true
  };
  const unknownComp = {
    id: 'u1',
    address: '204 River Rd',
    sold_price: 800000,
    sold_date: '2026-09-01',
    sqft: 3200,
    imp_qual: '4',      // County clue only -> stays $0 + Needs info!
    const_class: '3',   // County clue only -> stays $0 + Needs info!
    included: true
  };

  const grid = computeAppraisalGrid({
    subject,
    comps: [knownComp, unknownComp],
    library: { tierScaleEnabled: false, monthlyMarketTrendPct: 0 },
    effectiveDate: new Date('2026-11-20T00:00:00Z')
  });

  const kc = grid.comps.find((c) => c.id === 'k1');
  assert.equal(kc.cells.age.amount, 15000);
  assert.equal(kc.cells.age.spec, '1995 (eff. 2000)');
  assert.equal(kc.cells.quality.amount, 25000);
  assert.equal(kc.cells.quality.spec, 'Above avg (Q3)');
  assert.equal(kc.cells.construction.amount, 15000);
  assert.equal(kc.cells.construction.spec, 'Wood frame');
  assert.equal(kc.cells.boat_dock.amount, 40000);
  assert.equal(kc.cells.boat_dock.spec, 'No dock');

  const uc = grid.comps.find((c) => c.id === 'u1');
  for (const rowKey of ['age', 'quality', 'construction', 'boat_dock']) {
    assert.equal(uc.cells[rowKey].amount, 0, `${rowKey} must be $0 when unknown`);
    assert.equal(uc.cells[rowKey].needsInfo, true, `${rowKey} must flag needsInfo when unknown`);
  }
  assert.ok(uc.cells.quality.note.includes('County clue:'));
  assert.ok(uc.cells.construction.note.includes('County clue:'));
});

test('Appraisal Grid v2 #3: Waterfront / land-heavy properties (>50% land) default to median improvement value $/sf GLA rate with transparent source', () => {
  // 18801 SE River Ridge Rd actual Martin NAL values: JV $2,344,940, LND_VAL $1,500,000 (64% land), 4,307 sf -> $196/sf imp
  const riverRidgeSubject = {
    address: '18801 SE River Ridge Rd',
    sqft: 4307,
    just_value: 2344940,
    land_value: 1500000
  };
  const comps = [
    { id: 'rr1', address: '18815 SE River Ridge Rd', sold_price: 2300000, sold_date: '2026-08-01', sqft: 4000, just_value: 2100000, land_value: 1300000, included: true }, // imp $800k / 4000 = $200/sf
    { id: 'rr2', address: '18480 SE Lakeside Dr', sold_price: 2500000, sold_date: '2026-09-01', sqft: 4200, just_value: 2200000, land_value: 1400000, included: true }     // imp $800k / 4200 = $190/sf
  ];

  // Default sizeMethod ('auto') automatically picks improvement_value because land is 64% > 50%
  const autoGrid = computeAppraisalGrid({ subject: riverRidgeSubject, comps });
  assert.equal(autoGrid.isLandHeavySubject, true);
  assert.equal(autoGrid.subjectLandSharePct, 64);
  assert.equal(autoGrid.sizeMethod, 'improvement_value');
  // Median of [196, 200, 190] = $196/sf
  assert.equal(autoGrid.improvementGlaRate, 196);
  assert.equal(autoGrid.effectiveRates.glaRate, 196);
  assert.ok(autoGrid.glaRateSource.includes('$196/sf'));
  assert.ok(autoGrid.glaRateSource.includes('64%'));

  // Non-land-heavy property (30% land) keeps local_35 default
  const inlandSubject = { sqft: 2000, just_value: 600000, land_value: 180000 };
  const inlandComps = [
    { id: 'in1', sold_price: 600000, sqft: 2000, just_value: 580000, land_value: 170000, included: true }
  ];
  const inlandGrid = computeAppraisalGrid({ subject: inlandSubject, comps: inlandComps });
  assert.equal(inlandGrid.isLandHeavySubject, false);
  assert.equal(inlandGrid.sizeMethod, 'local_35');
});

test('Appraisal Grid v2 #4: Bath adjustment caps credited baths at bedrooms + 1, flags unusual bed/bath ratio, and respects editable functional bath rate', () => {
  const capRes = capBathsForBedrooms({ beds: 3, full_baths: 7, half_baths: 0 });
  assert.equal(capRes.isUnusualRatio, true);
  assert.equal(capRes.maxCredited, 4);
  assert.equal(capRes.creditedFull, 4);
  assert.equal(capRes.excessBaths, 3);

  const subject = { sqft: 4307, beds: 3, full_baths: 7, half_baths: 0 };
  const comp = { id: 'c-b', sold_price: 800000, sqft: 4307, beds: 3, full_baths: 4, half_baths: 0, included: true };

  // Default extraBathFunctionalAdjustment = $0 -> subject's 3 excess baths add $0
  const defaultGrid = computeAppraisalGrid({
    subject,
    comps: [comp],
    library: { tierScaleEnabled: false, monthlyMarketTrendPct: 0 }
  });
  assert.equal(defaultGrid.subjectSummary.isUnusualBedBathRatio, true);
  assert.equal(defaultGrid.comps[0].cells.bed_bath.amount, 0);
  assert.ok(defaultGrid.checks.some((chk) => chk.id === 'bed_bath_ratio'));

  // Comp with 3 bd / 6 ba also gets flagged "Unusual bed/bath ratio"
  const compExcessGrid = computeAppraisalGrid({
    subject: { sqft: 4307, beds: 3, full_baths: 3, half_baths: 0 },
    comps: [{ id: 'c-ex', sold_price: 800000, sqft: 4307, beds: 3, full_baths: 6, half_baths: 0, included: true }],
    library: { tierScaleEnabled: false, fullBathAdjustment: 13000, monthlyMarketTrendPct: 0 }
  });
  // Comp capped at 4 baths vs subject 3 baths -> -$13,000 (1 bath diff, NOT 3 baths!)
  assert.equal(compExcessGrid.comps[0].cells.bed_bath.amount, -13000);
  assert.equal(compExcessGrid.comps[0].cells.bed_bath.flag, 'Unusual bed/bath ratio');

  // Editable extraBathFunctionalAdjustment = $5,000 credits 3 excess baths = +$15,000
  const customExtraGrid = computeAppraisalGrid({
    subject,
    comps: [comp],
    library: { tierScaleEnabled: false, extraBathFunctionalAdjustment: 5000, monthlyMarketTrendPct: 0 }
  });
  assert.equal(customExtraGrid.comps[0].cells.bed_bath.amount, 15000);
});

test('Appraisal Grid v2 #5: Location row flags same subdivision + different NBRHD_CD as "Different appraisal neighborhood" with adjustable amount', () => {
  const subject = {
    county: 'Martin',
    parcel_county: 'Martin',
    subdivision_name: 'River Ridge',
    subdivision_code: '23-40-42-002',
    nbrhd_cd: '892320',
    sqft: 4307
  };
  const sameBoth = {
    id: 'loc1',
    parcel_county: 'Martin',
    subdivision_name: 'River Ridge',
    subdivision_code: '23-40-42-002',
    nbrhd_cd: '892320',
    sold_price: 2500000,
    sqft: 4307,
    included: true
  };
  const sameSubDiffNbrhd = {
    id: 'loc2',
    parcel_county: 'Martin',
    subdivision_name: 'River Ridge',
    subdivision_code: '23-40-42-002',
    nbrhd_cd: '892325',
    sold_price: 2500000,
    sqft: 4307,
    included: true
  };

  const grid = computeAppraisalGrid({
    subject,
    comps: [sameBoth, sameSubDiffNbrhd],
    library: { differentNeighborhoodAdjustment: -25000, monthlyMarketTrendPct: 0 }
  });

  const c1 = grid.comps.find((c) => c.id === 'loc1');
  const c2 = grid.comps.find((c) => c.id === 'loc2');

  assert.equal(c1.cells.location_subdivision.flag, null);
  assert.equal(c1.cells.location_subdivision.amount, 0);

  assert.equal(c2.cells.location_subdivision.spec, 'Same subdivision');
  assert.equal(c2.cells.location_subdivision.flag, 'Different appraisal neighborhood');
  assert.equal(c2.cells.location_subdivision.amount, -25000);
  assert.ok(grid.checks.some((chk) => chk.id === 'different_appraisal_neighborhood'));
});

test('Appraisal Grid v2 #6: Outlier comps (>40% from median $/sf) default to OFF and are strictly capped at 25% weight when ON', () => {
  const subject = { sqft: 3000, condition: 'c3' };
  const normal1 = { id: 'n1', address: '10 Palm Rd', sold_price: 1500000, sold_date: '2026-06-01', sqft: 3000, distance_mi: 0.8, condition: 'c3', included: true }; // $500/sf
  const normal2 = { id: 'n2', address: '12 Palm Rd', sold_price: 1560000, sold_date: '2026-06-01', sqft: 3000, distance_mi: 0.8, condition: 'c3', included: true }; // $520/sf
  // Outlier: $900/sf (+73% above $520/sf median!), super recent + 0.05 mi + verified -> would win >50% raw score if uncapped!
  const outlierUnset = { id: 'out-off', address: '14 Palm Rd', sold_price: 2700000, sold_date: '2026-10-15', sqft: 3000, distance_mi: 0.05, condition: 'c3', verified: true };

  // 1. Default OFF when included is not explicitly set
  const defaultOffGrid = computeAppraisalGrid({
    subject,
    comps: [normal1, normal2, outlierUnset],
    effectiveDate: new Date('2026-11-20T00:00:00Z')
  });
  const offComp = defaultOffGrid.comps.find((c) => c.id === 'out-off');
  assert.equal(offComp.isOutlier, true);
  assert.equal(offComp.isUsed, false);
  assert.equal(offComp.weightPct, 0);

  // 2. When explicitly toggled ON (included: true), weight is strictly capped at <= 25% and sum stays 100%
  const outlierOn = { ...outlierUnset, id: 'out-on', included: true };
  const onGrid = computeAppraisalGrid({
    subject,
    comps: [normal1, normal2, outlierOn],
    effectiveDate: new Date('2026-11-20T00:00:00Z')
  });
  const onComp = onGrid.comps.find((c) => c.id === 'out-on');
  assert.equal(onComp.isOutlier, true);
  assert.equal(onComp.isUsed, true);
  assert.ok(onComp.weightPct <= 25, `Expected outlier weight <= 25%, got ${onComp.weightPct}%`);
  assert.equal(onComp.isWeightCapped, true);
  assert.equal(onGrid.weightValidation.valid, true);
  assert.equal(onGrid.weightValidation.sumPct, 100);

  // Direct unit check on applyOutlierWeightCap
  const capped = applyOutlierWeightCap(
    [{ id: 'o', isOutlier: true }, { id: 'a', isOutlier: false }, { id: 'b', isOutlier: false }],
    [0.8, 0.1, 0.1],
    0.25
  );
  assert.equal(capped.weights[0], 0.25);
  assert.ok(Math.abs(capped.weights[1] - 0.375) < 0.001);
  assert.ok(Math.abs(capped.weights[2] - 0.375) < 0.001);
});

test('Appraisal Grid v2 #7: Income/land sanity anchors compute County Just Value ÷ 0.85 and Nearest same-street sale', () => {
  const subject = {
    address: '18801 SE River Ridge Rd',
    sqft: 4307,
    just_value: 2344940,
    land_value: 1500000,
    nearest_same_street_sale: {
      address: '18815 SE RIVER RIDGE RD',
      sold_price: 2300000,
      sold_date: '2026-04-01',
      sqft: 2369,
      distance_mi: 0.03
    }
  };
  const comps = [
    { id: 'c1', address: '18480 SE Lakeside Dr', sold_price: 2500000, sold_date: '2026-09-01', sqft: 4200, distance_mi: 0.2, included: true },
    { id: 'c2', address: '18825 SE River Ridge Road', sold_price: 2650000, sold_date: '2026-08-01', sqft: 4100, distance_mi: 0.08, included: true }
  ];

  const grid = computeAppraisalGrid({ subject, comps, effectiveDate: new Date('2026-11-20T00:00:00Z') });
  const { countyJustValueAnchor, nearestSameStreetSale } = grid.sanityAnchors;

  // County Just Value ÷ 0.85 = $2,758,753 -> rounded to nearest $5k ($2,760,000)
  assert.equal(countyJustValueAnchor.justValue, 2344940);
  assert.equal(countyJustValueAnchor.rawImpliedMarketValue, 2758753);
  assert.equal(countyJustValueAnchor.impliedMarketValue, 2760000);
  assert.equal(countyJustValueAnchor.landValue, 1500000);
  assert.equal(countyJustValueAnchor.improvementValue, 844940);
  assert.equal(countyJustValueAnchor.landSharePct, 64);
  assert.equal(countyJustValueAnchor.improvementPpsf, 196);

  // Nearest same-street sale picks 18815 SE RIVER RIDGE RD (0.03 mi vs 0.08 mi)
  assert.ok(nearestSameStreetSale);
  assert.equal(nearestSameStreetSale.address, '18815 SE RIVER RIDGE RD');
  assert.equal(nearestSameStreetSale.soldPrice, 2300000);
  assert.equal(nearestSameStreetSale.distanceMi, 0.03);
  assert.ok(typeof nearestSameStreetSale.deltaPctVsReconciled === 'number');
});
