import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FINANCING_CONFIG,
  LIVE_IN_PLAN_DISCLAIMER,
  LIVE_IN_TAX_DISCLAIMER,
  getMergedFinancingConfig,
  getFhaLimitForProperty
} from '../../config/financing.js';

import {
  calculateRemainingLoanBalance,
  calculateFloridaHomesteadTaxComparison,
  underwriteLiveInPlan,
  evaluateLiveInFit,
  formatStrategyDisplayLabel,
  formatLiveInChosenExitHeadline
} from './underwriting.js';

test('FINANCING_CONFIG holds exact FHA, county limit, 203(k), and occupancy defaults', () => {
  assert.ok(FINANCING_CONFIG.asOf, 'asOf date is present');
  assert.equal(LIVE_IN_PLAN_DISCLAIMER, 'Estimate for planning — confirm with your lender and CPA.');
  assert.equal(LIVE_IN_TAX_DISCLAIMER, 'estimate — confirm with a CPA');

  assert.equal(FINANCING_CONFIG.fha.minDownPct, 3.5);
  assert.equal(FINANCING_CONFIG.fha.ufmipPct, 1.75);
  assert.equal(FINANCING_CONFIG.fha.annualMipPct, 0.55);
  assert.equal(FINANCING_CONFIG.fha.annualMipHighBalancePct, 0.75);
  assert.equal(FINANCING_CONFIG.fha.highBalanceBaseLoanThreshold, 726200);
  assert.equal(FINANCING_CONFIG.fha.mipForLifeBelowDownPct, 10.0);
  assert.equal(FINANCING_CONFIG.fha.limited203kMaxRehab, 75000);
  assert.equal(FINANCING_CONFIG.fha.occupancyMoveInDays, 60);
  assert.equal(FINANCING_CONFIG.fha.occupancyMinYears, 1);

  const broward1 = getFhaLimitForProperty('Broward', 1);
  assert.equal(broward1.limit, 667000);
  assert.equal(broward1.verify, false);

  const broward2 = getFhaLimitForProperty('Broward', 2);
  assert.equal(broward2.verify, true);

  const pbc1 = getFhaLimitForProperty('Palm Beach', 1);
  assert.equal(pbc1.verify, true);
});

test('getMergedFinancingConfig applies user Buying Profile overrides cleanly', () => {
  const merged = getMergedFinancingConfig({
    credit_tier: '740-759',
    rate_sheet: {
      fha: { base_rate: 5.875, adjustments: { '740-759': 0 } }
    },
    financing_overrides: {
      fha: { ufmipPct: 1.5, limited203kMaxRehab: 80000 },
      fhaLimits: { Broward: { 1: { limit: 690000, verify: false } } },
      defaults: { currentRentMo: 2750 }
    }
  });

  assert.equal(merged.fha.ufmipPct, 1.5);
  assert.equal(merged.fha.limited203kMaxRehab, 80000);
  assert.equal(merged.fhaLimits.Broward[1].limit, 690000);
  assert.equal(merged.defaults.currentRentMo, 2750);
  assert.equal(merged.defaults.fhaInterestRatePct, 5.875);
});

test('calculateFloridaHomesteadTaxComparison computes homestead vs reassessed non-homestead tax difference', () => {
  const comp = calculateFloridaHomesteadTaxComparison({
    purchasePrice: 420000,
    marketValue: 500000,
    millageRate: 19.5,
    county: 'Broward'
  });

  assert.equal(comp.nonHomesteadTaxYr, Math.round((500000 * 19.5) / 1000)); // $9,750/yr
  assert.ok(comp.homesteadTaxYr < comp.nonHomesteadTaxYr);
  assert.equal(comp.annualDiff, comp.nonHomesteadTaxYr - comp.homesteadTaxYr);
  assert.ok(comp.annualDiff > 2000, 'losing homestead + reassessment adds meaningful annual tax');
});

test('underwriteLiveInPlan computes all 4 phases, duplex 75% rent offset, Conv Refi, Section 121, and 3/5/10yr wealth', () => {
  const res = underwriteLiveInPlan({
    county: 'Broward',
    purchasePrice: 520000,
    units: 2,
    interestRatePct: 6.125,
    creditScoreBand: '740-759',
    closingCostsPct: 3.5,
    sellerCredits: 10000,
    rehabBudget: 40000,
    rehabPaidBy: 'limited_203k',
    valueAfterReno: 680000,
    currentRentMo: 2500,
    otherUnitsRentMo: 2200,
    liveInYears: 2,
    appreciationPctYr: 3.5,
    rentGrowthPctYr: 3.0,
    marketRentMo: 4600,
    vacancyPct: 5,
    repairsPct: 5,
    capexPct: 5,
    managementPct: 8,
    landlordInsuranceYr: 5200,
    mySavings: 45000,
    useConvRefi: true,
    filingStatus: 'single'
  });

  assert.equal(res.isComplete, true);

  // Phase 01: Buy (Limited 203(k) bases 3.5% down on $520k + $40k = $560k)
  assert.equal(res.buy.fhaAcquisitionBasis, 560000);
  assert.equal(res.buy.downPayment, Math.round(560000 * 0.035)); // $19,600
  assert.equal(res.buy.baseLoan, 540400);
  assert.equal(res.buy.ufmipAmount, Math.round(540400 * 0.0175));
  assert.equal(res.buy.annualMipPct, 0.55);
  assert.equal(res.buy.mipForLife, true);
  assert.equal(res.buy.limited203kExceeded, false);
  assert.ok(res.buy.savingsDelta > 0);

  // Phase 02: Live (75% of $2,200 = $1,650/mo offset)
  assert.equal(res.live.creditedOtherUnitsRentMo, 1650);
  assert.equal(
    Math.round(res.live.equityBuiltWhileLiving),
    Math.round(res.live.principalPaidDown + res.live.appreciationWhileLiving)
  );

  // Phase 03: Improve
  assert.equal(res.improve.valueAdded, 160000);
  assert.ok(res.improve.equityPctAtExit >= 0.20, 'has >=20% equity by year 2 for conv refi');

  // Phase 04: Exit A (Rent + Conv Refi drops MIP)
  assert.equal(res.exit.rent.convRefi.eligible, true);
  assert.equal(res.exit.rent.convRefi.applied, true);
  assert.ok(res.exit.rent.convRefi.monthlyMipDropped > 200);
  assert.ok(res.exit.rent.convRefi.newMonthlyPaymentPi > 0);

  // Phase 04: Exit B (Sell 1 yr vs 2 yrs + Section 121)
  assert.equal(res.exit.sell.year1.qualifiesSection121, false);
  assert.equal(res.exit.sell.year2.qualifiesSection121, true);
  assert.equal(res.exit.sell.year2.taxableGain, 0, 'gain under $250k single exclusion is excluded');
  assert.equal(res.exit.sell.taxDisclaimer, 'estimate — confirm with a CPA');

  // Phase 04: Exit C (Keep & buy next)
  assert.ok(res.exit.keepAndBuyNext.deployableCapitalForNext > 0);
  assert.match(res.exit.keepAndBuyNext.oneFhaRuleNote, /One FHA loan at a time/i);

  // Wealth Series (Years 3, 5, 10)
  assert.deepEqual(res.wealthSeries.map((pt) => pt.year), [3, 5, 10]);
  for (const pt of res.wealthSeries) {
    assert.ok(Number.isFinite(pt.rentNetWorth));
    assert.ok(Number.isFinite(pt.sellNetWorth));
    assert.ok(Number.isFinite(pt.keepAndBuyNextNetWorth));
  }
});

test('underwriteLiveInPlan enforces 0.75% high-balance MIP above $726,200 and flags >$75k Limited 203(k)', () => {
  const res = underwriteLiveInPlan({
    county: 'Broward',
    purchasePrice: 820000,
    units: 2,
    creditScoreBand: '500-579', // 10% min down -> MIP 11 years, baseLoan = 820k + 90k = 910k * 0.9 = $819k (> $726,200)
    rehabBudget: 90000,
    rehabPaidBy: 'limited_203k',
    valueAfterReno: 980000,
    marketRentMo: 6200
  });

  assert.equal(res.buy.downPaymentPct, 10);
  assert.equal(res.buy.mipForLife, false);
  assert.equal(res.buy.mipDurationYears, 11);
  assert.equal(res.buy.annualMipPct, 0.75);
  assert.equal(res.buy.limited203kExceeded, true);
  assert.ok(calculateRemainingLoanBalance(500000, 0.06, 30, 360) === 0);
});

test('evaluateLiveInFit flags FHA limit, condo, HOA, flood zone, C5-C6 condition, and 2-4 unit bonus', () => {
  // 1. Clean Broward SFR under $667,000
  const sfrOk = evaluateLiveInFit({
    county: 'Broward',
    asking_price: 540000,
    property_type: 'sfr',
    units: 1,
    flood_zone: 'X'
  });
  assert.equal(sfrOk.fits, true);
  assert.equal(sfrOk.status, 'good');

  // 2. Over Broward 1-unit limit ($667,000)
  const overLimit = evaluateLiveInFit({
    county: 'Broward',
    asking_price: 710000,
    property_type: 'sfr',
    units: 1
  });
  assert.equal(overLimit.fits, false);
  assert.equal(overLimit.badgeLabel, 'Over FHA limit');

  // 3. Condo in flood zone AE with C5 condition notes -> fits=true, caution flags present
  const condoCaution = evaluateLiveInFit({
    county: 'Palm Beach',
    asking_price: 380000,
    use_code: '04',
    flood_zone: 'AE',
    condition_notes: 'C5 dated kitchen and roof leak'
  });
  assert.equal(condoCaution.fits, true);
  assert.equal(condoCaution.status, 'caution');
  const keys = condoCaution.reasons.map((r) => r.key);
  assert.ok(keys.includes('condo_approval'));
  assert.ok(keys.includes('hoa_rental_restrictions'));
  assert.ok(keys.includes('flood_zone'));
  assert.ok(keys.includes('condition_203k'));
  assert.equal(condoCaution.fhaLimitInfo.verify, true);

  // 4. Duplex under Broward 2-unit limit -> bonus!
  const duplex = evaluateLiveInFit({
    county: 'Broward',
    asking_price: 780000,
    use_code: '08',
    units: 2
  });
  assert.equal(duplex.fits, true);
  assert.equal(duplex.hasBonus, true);
  assert.ok(duplex.reasons.some((r) => r.key === 'multifamily_bonus'));

  // 5. 6-unit apartment -> ineligible for FHA
  const sixPlex = evaluateLiveInFit({
    county: 'Broward',
    asking_price: 950000,
    units: 6
  });
  assert.equal(sixPlex.fits, false);
});

test('underwriteLiveInPlan handles empty marketRentMo cleanly ("Add market rent") without inventing exit cash flow', () => {
  const res = underwriteLiveInPlan({
    county: 'Broward',
    purchasePrice: 480000,
    units: 1,
    rehabBudget: 0,
    valueAfterReno: 480000,
    marketRentMo: ''
  });

  assert.equal(res.isComplete, true);
  assert.equal(res.hasMarketRent, false);
  assert.equal(res.exit.rent.hasMarketRent, false);
  assert.equal(res.exit.rent.monthlyCashFlow, null);
  assert.equal(res.exit.rent.cashOnCash, null);
  assert.equal(res.exit.rent.dscr, null);
  assert.equal(res.monthlyCashFlow, null);
  assert.match(res.verdict, /Add market rent/i);

  // Wealth series leaves rent-dependent trajectories null while computing Sell (B)
  for (const pt of res.wealthSeries) {
    assert.equal(pt.rentNetWorth, null);
    assert.equal(pt.keepAndBuyNextNetWorth, null);
    assert.ok(Number.isFinite(pt.sellNetWorth));
  }
});

test('underwriteLiveInPlan flags >15% valueAfterReno above purchase price when renovation budget is $0', () => {
  const okZeroRehab = underwriteLiveInPlan({
    county: 'Broward',
    purchasePrice: 500000,
    rehabBudget: 0,
    valueAfterReno: 560000 // +12% -> no warning
  });
  assert.equal(okZeroRehab.over15PctZeroRehabWarning, false);

  const highZeroRehab = underwriteLiveInPlan({
    county: 'Broward',
    purchasePrice: 500000,
    rehabBudget: 0,
    valueAfterReno: 590000 // +18% with $0 reno -> warning!
  });
  assert.equal(highZeroRehab.over15PctZeroRehabWarning, true);
  assert.equal(highZeroRehab.improve.over15PctZeroRehabWarning, true);

  const highWithRehab = underwriteLiveInPlan({
    county: 'Broward',
    purchasePrice: 500000,
    rehabBudget: 55000,
    valueAfterReno: 620000 // +24% WITH $55k reno -> no zero-rehab warning
  });
  assert.equal(highWithRehab.over15PctZeroRehabWarning, false);
});

test('formatStrategyDisplayLabel and formatLiveInChosenExitHeadline render LIVE-IN (FHA) and chosen exit key numbers', () => {
  assert.equal(formatStrategyDisplayLabel('live_in'), 'LIVE-IN (FHA)');
  assert.equal(formatStrategyDisplayLabel('rental'), 'RENTAL');
  assert.equal(formatStrategyDisplayLabel('flip'), 'FLIP');
  assert.equal(formatStrategyDisplayLabel('brrrr'), 'BRRRR');

  const baseInputs = {
    county: 'Broward',
    purchasePrice: 500000,
    units: 1,
    rehabBudget: 35000,
    rehabPaidBy: 'cash',
    valueAfterReno: 640000,
    liveInYears: 2,
    marketRentMo: 4200,
    mySavings: 95000
  };

  const resA = underwriteLiveInPlan({ ...baseInputs, preferredExit: 'rent' });
  const headlineA = formatLiveInChosenExitHeadline({
    inputs: { ...baseInputs, preferredExit: 'rent' },
    results: resA
  });
  assert.match(headlineA, /^Exit A \(Rent\) · [+-]?\$[\d,]+\/mo cash flow$/);
  assert.equal(resA.chosenExitSummary, headlineA);

  const resB = underwriteLiveInPlan({ ...baseInputs, preferredExit: 'sell' });
  const headlineB = formatLiveInChosenExitHeadline({
    inputs: { ...baseInputs, preferredExit: 'sell' },
    results: resB
  });
  assert.match(headlineB, /^Exit B \(Sell Yr 2\) · [+-]?\$[\d,]+ profit$/);
  assert.equal(resB.chosenExitSummary, headlineB);

  const resC = underwriteLiveInPlan({ ...baseInputs, preferredExit: 'keep' });
  const headlineC = formatLiveInChosenExitHeadline({
    inputs: { ...baseInputs, preferredExit: 'keep' },
    results: resC
  });
  assert.match(headlineC, /^Exit C \(Keep & buy #2\) · \$[\d,]+ for #2$/);
  assert.equal(resC.chosenExitSummary, headlineC);

  const resEmptyRent = underwriteLiveInPlan({ ...baseInputs, marketRentMo: '', preferredExit: 'rent' });
  assert.equal(
    formatLiveInChosenExitHeadline({
      inputs: { ...baseInputs, marketRentMo: '', preferredExit: 'rent' },
      results: resEmptyRent
    }),
    'Exit A (Rent) · Add market rent'
  );
});


