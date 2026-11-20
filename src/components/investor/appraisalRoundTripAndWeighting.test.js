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
  assert.ok(c.cells.roof.note.includes('Const: Wood frame'));
  assert.ok(c.cells.location_subdivision.note.includes('Nbrhd 892320'));
  assert.ok(c.cells.location_site.note.includes('Boat dock (280 sf)'));
  // Unknown waterfront view must STILL stay $0 + Needs info even when boat_dock is filled
  assert.equal(c.cells.location_site.amount, 0);
  assert.equal(c.cells.location_site.needsInfo, true);
});

test('Migration add_boat_dock_and_construction.sql is registered, idempotent, and contains zero test rows', () => {
  const filename = 'add_boat_dock_and_construction.sql';
  assert.ok(CANONICAL_MIGRATION_ORDER.includes(filename));
  assert.ok(Array.isArray(MIGRATION_SCHEMA_SIGNATURES[filename]?.columns) && MIGRATION_SCHEMA_SIGNATURES[filename].columns.length === 9);

  const sqlPath = path.join(REPO_ROOT, 'migrations', filename);
  const sqlText = fs.readFileSync(sqlPath, 'utf8');
  assert.ok(sqlText.includes('ADD COLUMN IF NOT EXISTS boat_dock'));
  assert.ok(sqlText.includes('ADD COLUMN IF NOT EXISTS boat_dock_sqft'));
  assert.ok(sqlText.includes('ADD COLUMN IF NOT EXISTS construction_type'));
  assert.equal(/\bINSERT\s+INTO\b/i.test(sqlText), false);
});
