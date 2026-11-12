import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCompSearchParams,
  sanitizeProfileCompFilters,
  computeSqftBounds,
  computeMonthsAgo,
  formatSoldDateWithAge,
  formatCountyWindowNote,
  computeCompSimilarityScore,
  evaluateAndSortCompCandidates,
  getNextMonthsExpansion,
  getNextRadiusExpansion
} from './compSearchLogic.js';

test('validateCompSearchParams: enforces defaults and whitelisted values only', () => {
  // Defaults: 6 months, 0.5 mi, ±20%, includeDistressed false
  const def = validateCompSearchParams({});
  assert.strictEqual(def.ok, true);
  assert.deepStrictEqual(def.params, {
    months: 6,
    radius: 0.5,
    sizePct: '20',
    includeDistressed: false
  });

  // Valid explicit choices
  const valid = validateCompSearchParams({
    months: '9',
    radius: '0.25',
    sizePct: 'any',
    include_distressed: '1'
  });
  assert.strictEqual(valid.ok, true);
  assert.deepStrictEqual(valid.params, {
    months: 9,
    radius: 0.25,
    sizePct: 'any',
    includeDistressed: true
  });

  // Non-whitelisted values must fail validation
  assert.strictEqual(validateCompSearchParams({ months: '24' }).ok, false);
  assert.strictEqual(validateCompSearchParams({ months: '5' }).ok, false);
  assert.strictEqual(validateCompSearchParams({ radius: '3' }).ok, false);
  assert.strictEqual(validateCompSearchParams({ radius: '0.75' }).ok, false);
  assert.strictEqual(validateCompSearchParams({ sizePct: '25' }).ok, false);
  assert.strictEqual(validateCompSearchParams({ sizePct: '100; DROP TABLE' }).ok, false);
});

test('computeSqftBounds: matches ±20%, ±30%, and Any bounds', () => {
  // 1,288 sf at ±20% -> 1,030–1,546 sf
  assert.deepStrictEqual(computeSqftBounds(1288, '20'), { minSqft: 1030, maxSqft: 1546 });
  assert.deepStrictEqual(computeSqftBounds(1288, '30'), { minSqft: 902, maxSqft: 1674 });
  assert.deepStrictEqual(computeSqftBounds(1288, 'any'), { minSqft: null, maxSqft: null });
});

test('formatSoldDateWithAge & formatCountyWindowNote: match effective date Nov 2026 examples', () => {
  const effNov2026 = new Date(2026, 10, 12); // Nov 12, 2026 local

  assert.strictEqual(computeMonthsAgo(2026, 7, effNov2026), 4);
  assert.strictEqual(
    formatSoldDateWithAge(7, 2026, null, effNov2026),
    'Sold Jul 2026 · 4 mo ago'
  );

  const freshness = {
    complete_through: 'Aug 2026',
    latest_sale_month: 'Sep 2026',
    latest_sale_year: 2026,
    latest_sale_month_num: 9
  };

  assert.strictEqual(
    formatCountyWindowNote({ months: 6, countyFreshness: freshness, effectiveDate: effNov2026 }),
    'County data complete through Aug 2026 — a 6-month window currently covers May–Sep 2026 sales.'
  );

  assert.strictEqual(
    formatCountyWindowNote({ months: 12, countyFreshness: freshness, effectiveDate: effNov2026 }),
    'County data complete through Aug 2026 — a 12-month window currently covers Nov 2025–Sep 2026 sales.'
  );
});

test('computeCompSimilarityScore: balances recency, distance, and size difference rather than distance alone', () => {
  // Slightly closer (0.25 mi) but stale (10 mo) and 19% size diff
  const staleClose = computeCompSimilarityScore({
    rawDistanceMi: 0.25,
    monthsAgo: 10,
    livingSqft: 1620,
    subjectSqft: 2000
  });

  // Slightly farther (0.30 mi) but fresh (2 mo) and nearly identical size (1,980 vs 2,000 sf)
  const freshSimilar = computeCompSimilarityScore({
    rawDistanceMi: 0.30,
    monthsAgo: 2,
    livingSqft: 1980,
    subjectSqft: 2000
  });

  assert.ok(freshSimilar > staleClose);
});

test('evaluateAndSortCompCandidates: 1.5xIQR (>=6 results) flags outlier, excludes from median, sorts to bottom', () => {
  const candidates = [
    { parcel_id: 'outlier_high', price_per_sqft: 820, similarity_score: 0.92, likely_renovated: true },
    { parcel_id: 'c1', price_per_sqft: 390, similarity_score: 0.70, likely_renovated: false },
    { parcel_id: 'c2', price_per_sqft: 400, similarity_score: 0.85, likely_renovated: false },
    { parcel_id: 'c3', price_per_sqft: 410, similarity_score: 0.80, likely_renovated: true },
    { parcel_id: 'c4', price_per_sqft: 415, similarity_score: 0.65, likely_renovated: false },
    { parcel_id: 'c5', price_per_sqft: 420, similarity_score: 0.75, likely_renovated: false },
    { parcel_id: 'c6', price_per_sqft: 430, similarity_score: 0.60, likely_renovated: false }
  ];

  const res = evaluateAndSortCompCandidates(candidates);
  assert.strictEqual(res.inlier_count, 6);
  assert.strictEqual(res.outlier_count, 1);

  // Median of [390, 400, 410, 415, 420, 430] is (410 + 415)/2 = 412.5 -> 413 (820 excluded!)
  assert.strictEqual(res.median_price_per_sqft, 413);

  // Renovated median excludes the 820 outlier -> 410
  assert.strictEqual(res.renovated_median_price_per_sqft, 410);

  // Outlier sorted to bottom despite highest similarity_score (0.92)
  const last = res.candidates[res.candidates.length - 1];
  assert.strictEqual(last.parcel_id, 'outlier_high');
  assert.strictEqual(last.is_outlier, true);
  assert.strictEqual(last.outlier_reason, '$/sf far above nearby sales — possibly waterfront or renovated');

  // Non-outliers sorted by similarity_score descending
  assert.strictEqual(res.candidates[0].parcel_id, 'c2');
});

test('evaluateAndSortCompCandidates: >40% from median rule when fewer than 6 results', () => {
  const fourResults = [
    { parcel_id: 'a', price_per_sqft: 300, similarity_score: 0.7 },
    { parcel_id: 'b', price_per_sqft: 310, similarity_score: 0.8 },
    { parcel_id: 'c', price_per_sqft: 320, similarity_score: 0.6 },
    { parcel_id: 'd', price_per_sqft: 520, similarity_score: 0.9 } // >40% above raw median (315 * 1.4 = 441)
  ];

  const res = evaluateAndSortCompCandidates(fourResults);
  assert.strictEqual(res.inlier_count, 3);
  assert.strictEqual(res.outlier_count, 1);
  assert.strictEqual(res.median_price_per_sqft, 310);
  assert.strictEqual(res.candidates[3].parcel_id, 'd');
  assert.strictEqual(res.candidates[3].is_outlier, true);
});

test('sanitizeProfileCompFilters & expansion step helpers', () => {
  assert.strictEqual(getNextMonthsExpansion(6), 9);
  assert.strictEqual(getNextMonthsExpansion(12), null);
  assert.strictEqual(getNextRadiusExpansion(0.5), 1);
  assert.strictEqual(getNextRadiusExpansion(2), null);

  assert.deepStrictEqual(
    sanitizeProfileCompFilters({ months: 99, radius: 1, sizePct: '30', includeDistressed: 1 }),
    { months: 6, radius: 1, sizePct: '30', includeDistressed: true }
  );
});
