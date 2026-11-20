import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSubdivisionName,
  deriveSubdivisionCode,
  subdivisionKey,
  isSameSubdivision,
  canonicalizeByCode
} from './subdivision.js';
import {
  parseCompLocationFilters,
  evaluateAndSortCompCandidates
} from '../components/investor/compSearchLogic.js';
import {
  normalizeCompDetails,
  detailsToLegacyColumns,
  computeDetailsProgress,
  mergeCompWithSavedDetails,
  resolveSubjectDetailsForMode
} from '../components/investor/compDetailsModel.js';
import {
  DEFAULT_ADJUSTMENT_LIBRARY,
  computeAppraisalGrid
} from '../components/investor/valuationEngine.js';

test('deriveSubdivisionName cleans NAL S_LEGAL across Broward, Palm Beach, and Martin', () => {
  assert.equal(deriveSubdivisionName('RIVER RIDGE  LOT 107'), 'River Ridge');
  assert.equal(deriveSubdivisionName('LOT 107 RIVER RIDGE PLAT NO 2'), 'River Ridge');
  assert.equal(deriveSubdivisionName('LAKE FOREST SEC 4 38-4 B'), 'Lake Forest');
  assert.equal(deriveSubdivisionName('SAVANNA 166-5 B LOT 26 BLK 3'), 'Savanna');
  assert.equal(deriveSubdivisionName('BOCA LAGO PUD SEC 2 REPLAT LOT 14'), 'Boca Lago');
  assert.equal(deriveSubdivisionName('SEWALLS POINT ESTATES PB 3 PG 14 LOT 8'), 'Sewalls Point Estates');
  assert.equal(deriveSubdivisionName('PALM BEACH COUNTRY ESTATES UNREC LOT 5'), 'Palm Beach Country Estates');
  assert.equal(deriveSubdivisionName('E 1/2 OF NE 1/4 SEC 12 40 41'), null);
  assert.equal(deriveSubdivisionName(''), null);
  assert.equal(deriveSubdivisionName(null), null);
});

test('deriveSubdivisionCode extracts plat code for Martin and Palm Beach only', () => {
  // Martin SS-TT-RR-SSS-BBB-LLLLL-C
  assert.equal(deriveSubdivisionCode('23-40-42-002-000-01070-1', 'Martin'), '23-40-42-002');
  assert.equal(deriveSubdivisionCode('23-40-42-000-000-01070-1', 'Martin'), null); // unplatted 000

  // Palm Beach 17-digit PCN
  assert.equal(deriveSubdivisionCode('74434328060160100', 'Palm Beach'), '74-43-43-28-06');
  assert.equal(deriveSubdivisionCode('52-42-42-19-05-000-0140', 'Palm Beach'), '52-42-42-19-05');
  assert.equal(deriveSubdivisionCode('74434328000160100', 'Palm Beach'), null); // unplatted 00

  // Broward folio is not a plat code
  assert.equal(deriveSubdivisionCode('494234010010', 'Broward'), null);
});

test('isSameSubdivision and canonicalizeByCode match by plat code or normalized name within county', () => {
  const subject = { county: 'Martin', subdivision_name: 'River Ridge', subdivision_code: '23-40-42-002' };
  const sameByCode = { county: 'Martin', subdivision_name: 'River Ridge Ph 2', subdivision_code: '23-40-42-002' };
  const sameByName = { county: 'Martin', subdivision_name: 'RIVER RIDGE ', subdivision_code: null };
  const diffSubdiv = { county: 'Martin', subdivision_name: 'Tequesta Country Club', subdivision_code: '23-40-42-019' };
  const diffCounty = { county: 'Palm Beach', subdivision_name: 'River Ridge', subdivision_code: '23-40-42-002' };

  assert.equal(subdivisionKey('River Ridge '), 'RIVER RIDGE');
  assert.equal(isSameSubdivision(subject, sameByCode), true);
  assert.equal(isSameSubdivision(subject, sameByName), true);
  assert.equal(isSameSubdivision(subject, diffSubdiv), false);
  assert.equal(isSameSubdivision(subject, diffCounty), false);

  const recs = [
    { subdivision_code: '23-40-42-002', subdivision_name: 'River Ridge' },
    { subdivision_code: '23-40-42-002', subdivision_name: 'River Ridge' },
    { subdivision_code: '23-40-42-002', subdivision_name: 'River' },
    { subdivision_code: '23-40-42-002', subdivision_name: null }
  ];
  const updated = canonicalizeByCode(recs);
  assert.equal(updated, 2);
  assert.equal(recs[2].subdivision_name, 'River Ridge');
  assert.equal(recs[3].subdivision_name, 'River Ridge');
});

test('parseCompLocationFilters and evaluateAndSortCompCandidates sort same-subdivision first and compute dual medians', () => {
  assert.deepEqual(parseCompLocationFilters({}), {
    ok: true,
    sameSubdivision: false,
    sameNeighborhood: false
  });
  assert.deepEqual(parseCompLocationFilters({ same_subdivision: '1', same_neighborhood: 'true' }), {
    ok: true,
    sameSubdivision: true,
    sameNeighborhood: true
  });
  assert.equal(parseCompLocationFilters({ same_subdivision: 'invalid' }).ok, false);

  const result = evaluateAndSortCompCandidates([
    { parcel_id: 'other-1', price_per_sqft: 300, similarity_score: 95, same_subdivision: false },
    { parcel_id: 'other-2', price_per_sqft: 310, similarity_score: 90, same_subdivision: false },
    { parcel_id: 'same-1', price_per_sqft: 340, similarity_score: 70, same_subdivision: true },
    { parcel_id: 'same-2', price_per_sqft: 360, similarity_score: 65, same_subdivision: true },
    { parcel_id: 'other-outlier', price_per_sqft: 900, similarity_score: 85, same_subdivision: false }
  ]);

  // Same-subdivision non-outliers sort first, then other non-outliers, then outliers at bottom
  assert.deepEqual(
    result.candidates.map((c) => c.parcel_id),
    ['same-1', 'same-2', 'other-1', 'other-2', 'other-outlier']
  );
  assert.equal(result.same_subdivision_inlier_count, 2);
  assert.equal(result.same_subdivision_median_price_per_sqft, 350);
  assert.equal(result.inlier_count, 4);
  assert.equal(result.median_price_per_sqft, 325);
});

test('hoa_name persists through compDetailsModel without changing the 10-field progress count', () => {
  const norm = normalizeCompDetails({ hoa_name: '  River Ridge HOA  ', condition: 'c3' });
  assert.equal(norm.hoa_name, 'River Ridge HOA');

  const legacy = detailsToLegacyColumns(norm);
  assert.equal(legacy.hoa_name, 'River Ridge HOA');

  const progress = computeDetailsProgress(norm);
  assert.equal(progress.totalCount, 10);
  assert.equal(progress.filledCount, 1); // only condition; HOA is optional

  const merged = mergeCompWithSavedDetails(
    { id: 'c1', address: '100 Main St', parcel_id: '23-40-42-002-000-00100-1', parcel_county: 'Martin' },
    { hoa_name: 'River Ridge POA', condition: 'c2' },
    { subdivision_name: 'River Ridge', subdivision_code: '23-40-42-002', nbrhd_cd: '892320', mkt_ar: '08', s_legal: 'RIVER RIDGE LOT 10' }
  );
  assert.equal(merged.hoa_name, 'River Ridge POA');
  assert.equal(merged.subdivision_name, 'River Ridge');
  assert.equal(merged.subdivision_code, '23-40-42-002');
  assert.equal(merged.nbrhd_cd, '892320');
  assert.equal(merged.mkt_ar, '08');

  const subjectDetails = resolveSubjectDetailsForMode({ hoa_name: 'River Ridge HOA', beds: 3, baths: 2 }, 'as_is');
  assert.equal(subjectDetails.hoa_name, 'River Ridge HOA');
});

test('Appraisal grid Location row defaults to $0 and respects library differentSubdivisionAdjustment & per-comp override', () => {
  assert.equal(DEFAULT_ADJUSTMENT_LIBRARY.differentSubdivisionAdjustment, 0);

  const subject = {
    address: '18801 SE River Ridge Rd',
    county: 'Martin',
    parcel_county: 'Martin',
    subdivision_name: 'River Ridge',
    subdivision_code: '23-40-42-002',
    hoa_name: 'River Ridge HOA',
    sqft: 2000,
    beds: 3,
    baths: 2,
    condition: 'c4'
  };

  const baseComps = [
    {
      id: 'same',
      address: '18815 SE River Ridge Rd',
      parcel_county: 'Martin',
      subdivision_name: 'River Ridge',
      subdivision_code: '23-40-42-002',
      hoa_name: 'River Ridge HOA',
      sold_price: 600000,
      sold_date: '2026-09-01',
      sqft: 2000,
      beds: 3,
      baths: 2,
      condition: 'c4',
      included: true
    },
    {
      id: 'diff',
      address: '100 Tequesta Dr',
      parcel_county: 'Martin',
      subdivision_name: 'Tequesta Country Club',
      subdivision_code: '23-40-42-019',
      hoa_name: 'Tequesta Estates HOA',
      sold_price: 600000,
      sold_date: '2026-09-01',
      sqft: 2000,
      beds: 3,
      baths: 2,
      condition: 'c4',
      included: true
    }
  ];

  // Default library ($0 for different subdivision)
  const defaultGrid = computeAppraisalGrid({
    subject,
    comps: baseComps,
    effectiveDate: new Date('2026-09-01T00:00:00Z')
  });
  assert.equal(defaultGrid.subjectSummary.subdivisionName, 'River Ridge');
  assert.equal(defaultGrid.subjectSummary.hoaName, 'River Ridge HOA');
  assert.equal(defaultGrid.comps[0].cells.location_subdivision.spec, 'Same subdivision');
  assert.equal(defaultGrid.comps[0].cells.location_subdivision.amount, 0);
  assert.equal(defaultGrid.comps[1].cells.location_subdivision.spec, 'Different');
  assert.equal(defaultGrid.comps[1].cells.location_subdivision.amount, 0);
  assert.equal(
    defaultGrid.comps[1].cells.location_subdivision.note,
    'Tequesta Country Club · HOA: Tequesta Estates HOA'
  );

  // Custom library adjustment (-$15,000 for comps outside subject subdivision)
  const customGrid = computeAppraisalGrid({
    subject,
    comps: baseComps,
    library: { differentSubdivisionAdjustment: -15000 },
    effectiveDate: new Date('2026-09-01T00:00:00Z')
  });
  assert.equal(customGrid.comps[0].cells.location_subdivision.amount, 0);
  assert.equal(customGrid.comps[1].cells.location_subdivision.amount, -15000);
  assert.equal(customGrid.comps[1].cells.location_subdivision.direction, 'subtract');

  // Per-comp manual override takes precedence over library
  const overriddenGrid = computeAppraisalGrid({
    subject,
    comps: [
      baseComps[0],
      {
        ...baseComps[1],
        adjustments: { overrides: { location_subdivision: 20000 } }
      }
    ],
    library: { differentSubdivisionAdjustment: -15000 },
    effectiveDate: new Date('2026-09-01T00:00:00Z')
  });
  assert.equal(overriddenGrid.comps[1].cells.location_subdivision.amount, 20000);
  assert.equal(overriddenGrid.comps[1].cells.location_subdivision.isOverridden, true);
});
