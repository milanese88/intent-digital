import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCompAdjustments,
  calculateValuation,
  getConditionMeta,
  DEFAULT_VALUATION_SETTINGS,
  detectSouthFloridaTier,
  computeAppraisalGrid,
  validateWeightsSum,
  normalizeReconciliationWeights
} from './valuationEngine.js';

test('calculateCompAdjustments: basic adjustments & flags', () => {
  const subject = {
    sqft: 1800,
    beds: 3,
    baths: 2,
    pool: true,
    garage: true,
    waterfront: false,
    lot_sqft: 7500,
    year_built: 1980
  };

  const comp = {
    sold_price: 500000,
    sqft: 1600, // subject is 200 sqft larger. comp $/sf = 500000/1600 = 312.5. 200 * 312.5 * 0.5 = +31,250
    beds: 2,    // subject +1 bed -> +10,000
    baths: 2,   // equal -> 0
    pool: false, // subject has pool, comp does not -> +25,000
    garage: false, // subject has garage, comp does not -> +10,000
    waterfront: false, // equal -> 0
    lot_sqft: 6500, // subject +1000 lot sqft * $5 -> +5,000
    year_built: 1970, // subject 10 years newer * $1000 -> +10,000
    sold_date: '2026-05-01',
    distance_mi: 0.3
  };

  const adj = calculateCompAdjustments(comp, subject, DEFAULT_VALUATION_SETTINGS, 0.003);

  assert.strictEqual(adj.sizeAdj, 31250);
  assert.strictEqual(adj.bedAdj, 10000);
  assert.strictEqual(adj.bathAdj, 0);
  assert.strictEqual(adj.poolAdj, 25000);
  assert.strictEqual(adj.garageAdj, 10000);
  assert.strictEqual(adj.waterfrontAdj, 0);
  assert.strictEqual(adj.lotAdj, 5000);
  assert.strictEqual(adj.ageAdj, 10000);

  assert.ok(adj.netAdjustment > 0);
  assert.ok(adj.adjustedPrice > comp.sold_price);
  assert.ok(adj.grossAdjustment >= adj.netAdjustment);
});

test('calculateCompAdjustments: high net (>15%) and high gross (>25%) flags', () => {
  const subject = { sqft: 3000, beds: 5, baths: 4, pool: true };
  const comp = { sold_price: 300000, sqft: 1200, beds: 2, baths: 1, pool: false, distance_mi: 1.5 };

  const adj = calculateCompAdjustments(comp, subject);
  assert.strictEqual(adj.isHighNet, true);
  assert.strictEqual(adj.isHighGross, true);
});

test('calculateValuation: bifurcation of As-Is vs ARV', () => {
  const subject = { sqft: 1500, beds: 3, baths: 2, year_built: 1975 };
  const comps = [
    { id: '1', sold_price: 380000, sqft: 1500, beds: 3, baths: 2, year_built: 1975, condition: 'as_is', distance_mi: 0.2 },
    { id: '2', sold_price: 390000, sqft: 1500, beds: 3, baths: 2, year_built: 1975, condition: 'unknown', distance_mi: 0.3 },
    { id: '3', sold_price: 520000, sqft: 1500, beds: 3, baths: 2, year_built: 1975, condition: 'updated', distance_mi: 0.25 },
    { id: '4', sold_price: 540000, sqft: 1500, beds: 3, baths: 2, year_built: 1975, condition: 'fully_renovated', distance_mi: 0.4 }
  ];

  const res = calculateValuation({ comps, subject });

  assert.ok(res.asIsValuation != null);
  assert.strictEqual(res.asIsValuation.count, 2);
  assert.ok(res.asIsValuation.mid >= 380000 && res.asIsValuation.mid <= 400000);

  assert.ok(res.arvValuation != null);
  assert.strictEqual(res.arvValuation.count, 2);
  assert.ok(res.arvValuation.mid >= 520000 && res.arvValuation.mid <= 550000);
  assert.strictEqual(res.arvStatus, 'CALCULATED');
});

test('calculateValuation: no renovated comps shows Add renovated comps', () => {
  const subject = { sqft: 1500 };
  const comps = [
    { id: '1', sold_price: 380000, sqft: 1500, condition: 'as_is' },
    { id: '2', sold_price: 390000, sqft: 1500, condition: 'unknown' }
  ];

  const res = calculateValuation({ comps, subject, manualArv: 520000 });
  assert.strictEqual(res.arvValuation, null);
  assert.strictEqual(res.arvStatus, 'NEEDS_RENOVATED_COMPS');
  assert.strictEqual(res.arvDisplay, 'Add renovated comps');
  assert.strictEqual(res.isArvUnsupported, true);
});

test('calculateValuation: manual ARV > 10% above highest adjusted renovated comp gets flagged', () => {
  const subject = { sqft: 1500 };
  const comps = [
    { id: '1', sold_price: 450000, sqft: 1500, condition: 'updated' },
    { id: '2', sold_price: 480000, sqft: 1500, condition: 'fully_renovated' }
  ];

  // Highest adjusted comp is ~$480k. 10% above is $528k.
  // Testing with $550k -> should be flagged
  const resFlagged = calculateValuation({ comps, subject, manualArv: 550000 });
  assert.strictEqual(resFlagged.isArvUnsupported, true);
  assert.ok(resFlagged.arvUnsupportedMessage.includes('Not supported by comps'));

  // Testing with $500k -> within supported range
  const resSupported = calculateValuation({ comps, subject, manualArv: 500000 });
  assert.strictEqual(resSupported.isArvUnsupported, false);
});

test('calculateValuation: confidence score with reasons', () => {
  const subject = { sqft: 1500 };
  // 3 tight, recent comps
  const comps = [
    { id: '1', sold_price: 500000, sqft: 1500, condition: 'fully_renovated', distance_mi: 0.2, sold_date: '2026-08-01' },
    { id: '2', sold_price: 510000, sqft: 1500, condition: 'fully_renovated', distance_mi: 0.3, sold_date: '2026-07-15' },
    { id: '3', sold_price: 495000, sqft: 1500, condition: 'fully_renovated', distance_mi: 0.25, sold_date: '2026-09-01' }
  ];

  const res = calculateValuation({ comps, subject });
  assert.strictEqual(res.confidenceScore, 'High');
  assert.ok(res.confidenceReasons.length >= 3);
  assert.ok(res.arvValuation.low <= res.arvValuation.mid);
  assert.ok(res.arvValuation.mid <= res.arvValuation.high);
});

test('calculateValuation: sanity check against county just value', () => {
  const subject = { sqft: 1500, just_value: 300000, zip: '33311' };
  const comps = [
    { id: '1', sold_price: 400000, sqft: 1500, condition: 'as_is', distance_mi: 0.3 },
    { id: '2', sold_price: 410000, sqft: 1500, condition: 'as_is', distance_mi: 0.4 },
    { id: '3', sold_price: 395000, sqft: 1500, condition: 'as_is', distance_mi: 0.2 }
  ];

  // Ratio is ~400k / 300k = 1.33x
  const zipStatsNormal = { medianRatio: 1.30, p25Ratio: 1.15, p75Ratio: 1.45 };
  const resNormal = calculateValuation({ comps, subject, zipRatioStats: zipStatsNormal });
  assert.strictEqual(resNormal.sanityCheck.status, 'NORMAL');

  // If typical ratio is much lower, e.g. 0.80x - 1.0x -> flag warning
  const zipStatsAbnormal = { medianRatio: 0.85, p25Ratio: 0.75, p75Ratio: 0.95 };
  const resWarning = calculateValuation({ comps, subject, zipRatioStats: zipStatsAbnormal });
  assert.strictEqual(resWarning.sanityCheck.status, 'WARNING');
  assert.ok(resWarning.sanityCheck.message.includes('outside typical'));
});

test('detectSouthFloridaTier: selects submarket tier from unadjusted median comp price', () => {
  assert.strictEqual(detectSouthFloridaTier(420000).key, 'entry');
  assert.strictEqual(detectSouthFloridaTier(680000).key, 'mid');
  assert.strictEqual(detectSouthFloridaTier(1350000).key, 'upper_mid');
  assert.strictEqual(detectSouthFloridaTier(2750000).key, 'luxury');
});

test('computeAppraisalGrid: matches Specification Guide §3.3 worked CIA/CBS grid example', () => {
  // Worked Example from Specification Guide §3.3:
  // Subject: 2,200 sf, 2-car garage, in-ground pool
  // Rates: $85/sf GLA, $15,000/garage bay, $25,000 pool
  const subject = {
    address: '100 Las Olas Way',
    sqft: 2200,
    pool: true,
    garage_bays: 2,
    condition: 'as_is'
  };

  const comps = [
    {
      id: 'c1',
      address: 'Comp 1',
      sold_price: 460000,
      sqft: 2000,
      garage_bays: 2,
      pool: false,
      condition: 'as_is',
      included: true
    },
    {
      id: 'c2',
      address: 'Comp 2',
      sold_price: 515000,
      sqft: 2400,
      garage_bays: 3,
      pool: true,
      condition: 'as_is',
      included: true
    }
  ];

  const grid = computeAppraisalGrid({
    comps,
    subject,
    mode: 'as_is',
    sizeMethod: 'library',
    library: {
      tierScaleEnabled: false,
      glaRates: { entry: 85, mid: 85, upper_mid: 85, luxury: 85 },
      glaMinThresholds: { entry: 100, mid: 100, upper_mid: 100, luxury: 100 },
      garageBayAdjustment: 15000,
      poolAdjustment: 25000,
      monthlyMarketTrendPct: 0,
      roundingIncrement: 1000
    }
  });

  const [c1, c2] = grid.comps;

  // Comp 1: CIA (+$17,000 GLA, $0 garage, +$25,000 pool) -> Net +$42,000 (9.1%), ASP $502,000
  assert.strictEqual(c1.cells.gla.amount, 17000);
  assert.strictEqual(c1.cells.gla.direction, 'add');
  assert.strictEqual(c1.cells.garage.amount, 0);
  assert.strictEqual(c1.cells.pool.amount, 25000);
  assert.strictEqual(c1.cells.pool.direction, 'add');
  assert.strictEqual(c1.netAdjustment, 42000);
  assert.strictEqual(c1.grossAdjustment, 42000);
  assert.strictEqual(c1.netAdjustmentPct, 9.1);
  assert.strictEqual(c1.adjustedPrice, 502000);

  // Comp 2: CBS (-$17,000 GLA, -$15,000 garage, $0 pool) -> Net -$32,000 (6.2%), ASP $483,000
  assert.strictEqual(c2.cells.gla.amount, -17000);
  assert.strictEqual(c2.cells.gla.direction, 'subtract');
  assert.strictEqual(c2.cells.garage.amount, -15000);
  assert.strictEqual(c2.cells.garage.direction, 'subtract');
  assert.strictEqual(c2.cells.pool.amount, 0);
  assert.strictEqual(c2.netAdjustment, -32000);
  assert.strictEqual(c2.grossAdjustment, 32000);
  assert.strictEqual(c2.netAdjustmentPct, 6.2);
  assert.strictEqual(c2.adjustedPrice, 483000);

  assert.strictEqual(grid.weightValidation.valid, true);
  assert.ok(grid.reconciledValue >= 483000 && grid.reconciledValue <= 502000);
});

test('computeAppraisalGrid: enforces GLA minimum threshold, 35% local $/sf vs library, and strict weight sum = 100%', () => {
  const subject = { sqft: 1850, condition: 'as_is' };
  const comps = [
    // Within 100 sf threshold (1800 vs 1850 = 50 sf) -> $0 GLA adjustment!
    { id: 'c1', sold_price: 600000, sqft: 1800, condition: 'as_is', included: true },
    // Beyond 100 sf threshold (1650 vs 1850 = +200 sf)
    { id: 'c2', sold_price: 580000, sqft: 1650, condition: 'updated', included: true },
    // OFF comp -> excluded from reconciliation weight
    { id: 'c3', sold_price: 550000, sqft: 1500, condition: 'as_is', included: false }
  ];

  const localGrid = computeAppraisalGrid({ comps, subject, mode: 'as_is', sizeMethod: 'local_35' });
  const libGrid = computeAppraisalGrid({ comps, subject, mode: 'as_is', sizeMethod: 'library' });

  // Comp 1 is within 100 sf -> $0 GLA
  assert.strictEqual(localGrid.comps[0].cells.gla.amount, 0);
  assert.ok(localGrid.comps[0].cells.gla.note.includes('threshold'));

  // Local 35% rate != Mid-Tier library rate ($100/sf)
  assert.notStrictEqual(localGrid.effectiveRates.glaRate, libGrid.effectiveRates.glaRate);
  assert.strictEqual(libGrid.effectiveRates.glaRate, 100);

  // OFF comp gets 0% weight
  assert.strictEqual(localGrid.comps[2].weightPct, 0);

  // Invalid custom weights (sum = 80%) blocks reconciledValue per Spec Guide §6.1
  const invalidWeightsGrid = computeAppraisalGrid({
    comps,
    subject,
    customWeights: { c1: 50, c2: 30 }
  });
  assert.strictEqual(invalidWeightsGrid.weightValidation.valid, false);
  assert.strictEqual(invalidWeightsGrid.reconciledValue, null);

  // Valid custom weights (sum = 100%) enables reconciledValue
  const validWeightsGrid = computeAppraisalGrid({
    comps,
    subject,
    customWeights: { c1: 60, c2: 40 }
  });
  assert.strictEqual(validWeightsGrid.weightValidation.valid, true);
  assert.ok(validWeightsGrid.reconciledValue > 0);

  // normalizeReconciliationWeights guarantees |sum - 1.0| < 0.0001
  const norm = normalizeReconciliationWeights([50, 30]);
  assert.strictEqual(validateWeightsSum(norm).valid, true);
});

