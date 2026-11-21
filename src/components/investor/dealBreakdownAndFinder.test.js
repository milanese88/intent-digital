import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEVELOPER_COSTS_AS_OF,
  DEVELOPER_COSTS_DISCLAIMER,
  FLIP_REHAB_LEVELS,
  NEW_BUILD_QUALITY_TIERS,
  SOFT_COSTS_DEFAULTS,
  FL_DEED_DOC_STAMPS_PCT,
  DEFAULT_CONSTRUCTION_DRAW_SCHEDULE,
  estimateDemoLumpSum,
  sumSoftCostsPct,
  computeWeightedDrawUtilization,
  getDeveloperMillageForCounty
} from '../../config/developerCosts.js';
import {
  buildDefaultDealBreakdownInputs,
  calculateDealBreakdown,
  estimateQuickFinderProfit,
  computeHoldMonthsBetweenDates,
  inferDealBreakdownType
} from './dealBreakdownEngine.js';
import {
  parseFlipFinderParams,
  classifySalePair
} from '../../../api/county/flip-finder.js';
import {
  CANONICAL_MIGRATION_ORDER,
  MIGRATION_SCHEMA_SIGNATURES
} from '../../../scripts/db/_lib.mjs';

test('developerCosts config: as-of date, FL 0.70% doc stamps, demo brackets, soft costs, draw schedule', () => {
  assert.match(DEVELOPER_COSTS_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(DEVELOPER_COSTS_DISCLAIMER, /estimate/i);
  assert.equal(FL_DEED_DOC_STAMPS_PCT, 0.70);

  assert.ok(FLIP_REHAB_LEVELS.light.costPerSqft < FLIP_REHAB_LEVELS.medium.costPerSqft);
  assert.ok(FLIP_REHAB_LEVELS.medium.costPerSqft < FLIP_REHAB_LEVELS.full_gut.costPerSqft);

  assert.ok(NEW_BUILD_QUALITY_TIERS.standard.costPerSqft < NEW_BUILD_QUALITY_TIERS.high_end.costPerSqft);
  assert.ok(NEW_BUILD_QUALITY_TIERS.high_end.costPerSqft < NEW_BUILD_QUALITY_TIERS.luxury.costPerSqft);

  assert.equal(estimateDemoLumpSum(1200), 18000);
  assert.equal(estimateDemoLumpSum(2000), 25000);
  assert.equal(estimateDemoLumpSum(3000), 34000);
  assert.equal(estimateDemoLumpSum(4800), 45000);

  const flipSoft = sumSoftCostsPct(SOFT_COSTS_DEFAULTS.flip);
  const buildSoft = sumSoftCostsPct(SOFT_COSTS_DEFAULTS.demo_new_build);
  assert.ok(flipSoft > 0 && flipSoft < buildSoft);

  const util = computeWeightedDrawUtilization(DEFAULT_CONSTRUCTION_DRAW_SCHEDULE);
  assert.ok(util > 0.4 && util < 0.7, `expected weighted draw utilization ~52%, got ${util}`);

  assert.equal(getDeveloperMillageForCounty('Broward'), 19.5);
  assert.equal(getDeveloperMillageForCounty('Palm Beach'), 18.2);
  assert.equal(getDeveloperMillageForCounty('Martin'), 15.8);
});

test('dealBreakdownEngine: auto-fills from county sales + building_characteristics and falls back to entered list price', () => {
  const inputsFromResale = buildDefaultDealBreakdownInputs({
    property: {
      id: 'prop-1',
      address: '123 Coral Way',
      city: 'Boca Raton',
      zip: '33432',
      county: 'Palm Beach',
      sqft: 2400,
      lot_sqft: 9500,
      year_built: 1984
    },
    countyData: {
      county: 'Palm Beach',
      parcel_id: '06-43-47-19-01-001-0010',
      sales: [
        { sale_price: 920000, sale_year: 2026, sale_month: 4, qual_code: '01', vi_cd: 'I' },
        { sale_price: 540000, sale_year: 2025, sale_month: 6, qual_code: '01', vi_cd: 'I' }
      ],
      building_characteristics: {
        living_area_sqft: 2550,
        year_built: 1984,
        pool_type: 'in_ground',
        boat_dock: true
      }
    }
  });

  assert.equal(inputsFromResale.dealType, 'flip');
  assert.equal(inputsFromResale.purchasePrice, 540000);
  assert.equal(inputsFromResale.exitPrice, 920000);
  assert.equal(inputsFromResale.exitSource, 'county_resale');
  assert.equal(inputsFromResale.holdMonths, 10);
  assert.equal(inputsFromResale.afterLivingSqft, 2550);
  assert.equal(inputsFromResale.hasPool, true);
  assert.equal(inputsFromResale.hasDock, true);
  assert.equal(inputsFromResale.millageRate, 18.2);

  // When only 1 county sale exists, uses user's entered list price (no scraping)
  const inputsFromList = buildDefaultDealBreakdownInputs({
    property: {
      address: '456 Palm Ave',
      county: 'Broward',
      list_price: 895000,
      sqft: 1900,
      year_built: 2026
    },
    countyData: {
      county: 'Broward',
      sales: [
        { sale_price: 380000, sale_year: 2025, sale_month: 2, qual_code: '01', vi_cd: 'V' }
      ]
    }
  });

  assert.equal(inputsFromList.dealType, 'demo_new_build');
  assert.equal(inputsFromList.purchasePrice, 380000);
  assert.equal(inputsFromList.exitPrice, 895000);
  assert.equal(inputsFromList.exitSource, 'my_list_price');
  assert.equal(inputsFromList.isVacantLotPurchase, true);
  assert.equal(inputsFromList.demoCost, 0);
});

test('dealBreakdownEngine: Flip math, FL 0.70% doc stamps, millage holding tax, scenarios & 70% Rule My Version', () => {
  const inputs = {
    county: 'Broward',
    dealType: 'flip',
    purchasePrice: 400000,
    exitPrice: 700000,
    holdMonths: 6,
    beforeLivingSqft: 1800,
    afterLivingSqft: 1800,
    flipRehabLevel: 'medium',
    flipRehabCostPerSqft: 75,
    softCostsPct: 6,
    financingMode: 'hard_money',
    interestRatePct: 11.0,
    pointsPct: 2.0,
    ltcPct: 80,
    drawUtilPct: 60,
    lenderFees: 2500,
    buyClosingPct: 2.0,
    millageRate: 19.5,
    monthlyInsurance: 450,
    monthlyUtilities: 350,
    sellCommissionPct: 5.0,
    sellClosingPct: 1.0,
    flDocStampsPct: 0.70
  };

  const buyingProfile = {
    liquid_cash: 250000,
    reserve_months: 6,
    credit_tier: '740-759',
    rate_sheet: {
      hard_money: { base_rate: 10.5, adjustments: { '740-759': 0.25 } }
    }
  };

  const res = calculateDealBreakdown(inputs, buyingProfile);

  // Hard rehab = 1800 * 75 = $135,000; Soft 6% = $8,100
  assert.equal(res.costs.hardCost, 135000);
  assert.equal(res.costs.demoCost, 0);
  assert.equal(res.costs.softCosts, 8100);

  // FL deed doc stamps = 0.70% of $700,000 = $4,900
  assert.equal(res.costs.flDocStampsCost, 4900);
  assert.equal(res.costs.commissionCost, 35000);
  assert.equal(res.costs.sellerClosingCost, 7000);
  assert.equal(res.costs.sellingCosts, 46900);

  // Property tax at purchase price via millage: $400,000 * 19.5 / 1000 = $7,800/yr => $650/mo
  assert.equal(res.costs.annualPropertyTax, 7800);
  assert.equal(res.costs.monthlyTax, 650);
  assert.equal(res.costs.monthlyHoldingTotal, 650 + 450 + 350);
  assert.equal(res.costs.holdingCosts, 1450 * 6);

  // Scenarios strictly ordered Low < Likely < High
  assert.ok(res.scenarios.low.estProfit < res.scenarios.likely.estProfit);
  assert.ok(res.scenarios.likely.estProfit < res.scenarios.high.estProfit);

  // 70% Rule MAO = 700,000 * 0.70 - (135,000 + 8,100) = 490,000 - 143,100 = 346,900
  assert.equal(res.myVersion.mao70, 346900);
  assert.equal(res.myVersion.actualBelowMao, false);
  assert.equal(res.myVersion.deltaVsActualPurchase, 400000 - 346900);
  assert.equal(res.myVersion.ratePct, 10.8); // round1(10.5 + 0.25 = 10.75 => 10.8)
  assert.equal(res.myVersion.liquidCash, 250000);
  assert.equal(typeof res.myVersion.fitsLiquidCash, 'boolean');

  // Cash mode produces $0 financing cost
  const cashRes = calculateDealBreakdown({ ...inputs, financingMode: 'cash' }, buyingProfile);
  assert.equal(cashRes.costs.financingCosts, 0);
  assert.equal(cashRes.metrics.cashNeeded, cashRes.costs.totalProjectCost);
});

test('dealBreakdownEngine: Demo -> New Build math with demolition, pool/dock add-ons, and construction loan draws', () => {
  const inputs = {
    county: 'Palm Beach',
    dealType: 'demo_new_build',
    purchasePrice: 950000,
    exitPrice: 3650000,
    holdMonths: 18,
    beforeLivingSqft: 2200,
    afterLivingSqft: 4000,
    newBuildQuality: 'high_end',
    newBuildCostPerSqft: 385,
    demoCost: 25000,
    includePoolAddon: true,
    poolAddonCost: 95000,
    includeDockAddon: true,
    dockAddonCost: 65000,
    softCostsPct: 15,
    financingMode: 'construction_loan',
    interestRatePct: 9.25,
    pointsPct: 1.5,
    ltcPct: 75,
    drawUtilPct: 52,
    lenderFees: 4500,
    buyClosingPct: 2.0,
    millageRate: 18.2,
    monthlyInsurance: 950,
    monthlyUtilities: 450,
    sellCommissionPct: 5.0,
    sellClosingPct: 1.0,
    flDocStampsPct: 0.70
  };

  const res = calculateDealBreakdown(inputs, null);
  assert.equal(res.costs.demoCost, 25000);
  // Hard core = 4000 * 385 = 1,540,000 + pool 95k + dock 65k = 1,700,000
  assert.equal(res.costs.hardBuildCore, 1540000);
  assert.equal(res.costs.hardCost, 1700000);
  assert.equal(res.costs.hardCostPerSqft, 385);
  assert.equal(res.metrics.constructionCostPerSqft, Math.round((25000 + 1700000 + 258750) / 4000));
  // Soft 15% of (1,700,000 + 25,000) = 258,750
  assert.equal(res.costs.softCosts, 258750);
  assert.ok(res.costs.financingCosts > 0);
  assert.ok(res.costs.loanAmount > 0);
  assert.equal(res.costs.flDocStampsCost, Math.round(3650000 * 0.007));
  assert.ok(res.metrics.estProfit > 0);
  assert.ok(res.metrics.profitPerSqft > 0);

  const quick = estimateQuickFinderProfit({
    county: 'Palm Beach',
    buy_price: 950000,
    sell_price: 3650000,
    hold_months: 18,
    living_sqft: 4000,
    before_living_sqft: 2200,
    deal_type: 'demo_new_build',
    year_built: 2026,
    buy_year: 2025
  });
  assert.equal(quick.dealType, 'demo_new_build');
  assert.equal(typeof quick.estProfit, 'number');
  assert.ok(Number.isFinite(quick.roiPct));
});

test('flip-finder: parameter validation and sale-pair classification (flips, distressed flag, new builds)', () => {
  const def = parseFlipFinderParams({});
  assert.equal(def.ok, true);
  assert.equal(def.params.county, 'all');
  assert.equal(def.params.maxMonths, 24);
  assert.equal(def.params.minGainPct, 25);
  assert.equal(def.params.includeDistressed, false);
  assert.equal(def.params.includeMyListings, false);

  const badZip = parseFlipFinderParams({ zip: '334' });
  assert.equal(badZip.ok, false);

  const badCounty = parseFlipFinderParams({ county: 'Miami-Dade' });
  assert.equal(badCounty.ok, false);

  // Standard market flip (+50% gain)
  const marketFlip = classifySalePair({
    buy_price: 400000,
    sell_price: 600000,
    buy_year: 2025,
    buy_qual: '01',
    sell_qual: '01',
    buy_vi_cd: 'I',
    sell_vi_cd: 'I',
    year_built: 1985,
    living_sqft: 1800
  }, { minGainPct: 25 });
  assert.equal(marketFlip.deal_type, 'flip');
  assert.equal(marketFlip.is_distressed_acquisition, false);
  assert.equal(marketFlip.jump_dollars, 200000);
  assert.equal(marketFlip.jump_pct, 50);

  // Below threshold rejected
  const smallGain = classifySalePair({
    buy_price: 400000,
    sell_price: 450000,
    buy_year: 2025,
    buy_qual: '01',
    sell_qual: '01',
    year_built: 1985
  }, { minGainPct: 25 });
  assert.equal(smallGain, null);

  // Distressed -> market flip flagged separately
  const distressedFlip = classifySalePair({
    buy_price: 300000,
    sell_price: 550000,
    buy_year: 2025,
    buy_qual: '18',
    sell_qual: '01',
    year_built: 1978
  }, { minGainPct: 25 });
  assert.equal(distressedFlip.deal_type, 'flip');
  assert.equal(distressedFlip.is_distressed_acquisition, true);

  // Demo -> New Build by year_built >= buy_year
  const nbYear = classifySalePair({
    buy_price: 650000,
    sell_price: 2250000,
    buy_year: 2025,
    buy_qual: '01',
    sell_qual: '01',
    year_built: 2026
  });
  assert.equal(nbYear.deal_type, 'demo_new_build');
  assert.match(nbYear.new_build_reason, /Built 2026/);

  // Demo -> New Build by Vacant -> Improved (V -> I)
  const nbVacant = classifySalePair({
    buy_price: 500000,
    sell_price: 1900000,
    buy_year: 2025,
    buy_qual: '01',
    sell_qual: '01',
    buy_vi_cd: 'V',
    sell_vi_cd: 'I',
    year_built: 2024
  });
  assert.equal(nbVacant.deal_type, 'demo_new_build');
  assert.match(nbVacant.new_build_reason, /Vacant lot/);

  // Demo -> New Build by living sf growth > 30%
  const nbSqft = classifySalePair({
    buy_price: 500000,
    sell_price: 1400000,
    buy_year: 2025,
    buy_qual: '01',
    sell_qual: '01',
    year_built: 1990,
    living_sqft: 1600,
    bc_living_sqft: 2450
  });
  assert.equal(nbSqft.deal_type, 'demo_new_build');
  assert.match(nbSqft.new_build_reason, />30%/);

  // Demo -> New Build by improvement value jump > 1.5x purchase price
  const nbImpJump = classifySalePair({
    buy_price: 400000,
    sell_price: 1600000,
    buy_year: 2024,
    buy_qual: '01',
    sell_qual: '01',
    year_built: 1980,
    living_sqft: 1800,
    just_value: 1200000,
    land_value: 300000 // imp_value = 900,000 > 400,000 * 1.5
  });
  assert.equal(nbImpJump.deal_type, 'demo_new_build');
  assert.match(nbImpJump.new_build_reason, /Improvement value jumped/);

  // FlipFinder params: default max_months is 48 for demo_new_build and 24 for flips
  const paramsFlip = parseFlipFinderParams({ deal_type: 'flip' });
  assert.equal(paramsFlip.params.maxMonths, 24);
  const paramsBuild = parseFlipFinderParams({ deal_type: 'demo_new_build' });
  assert.equal(paramsBuild.params.maxMonths, 48);

  assert.equal(computeHoldMonthsBetweenDates('2025-03-01', '2026-01-01'), 10);
  assert.equal(inferDealBreakdownType({ purchaseYear: 2025, afterYearBuilt: 2026 }), 'demo_new_build');
  assert.equal(inferDealBreakdownType({ buyPrice: 400000, justValue: 1200000, landValue: 300000 }), 'demo_new_build');
});

test('migration add_deal_breakdowns.sql & Learning Lab lesson integrity', () => {
  const repoRoot = path.resolve(process.cwd());
  const sqlText = fs.readFileSync(path.join(repoRoot, 'migrations/add_deal_breakdowns.sql'), 'utf8');

  assert.ok(CANONICAL_MIGRATION_ORDER.includes('add_deal_breakdowns.sql'));
  assert.ok(MIGRATION_SCHEMA_SIGNATURES['add_deal_breakdowns.sql']?.tables?.includes('deal_breakdowns'));
  assert.ok(MIGRATION_SCHEMA_SIGNATURES['add_deal_breakdowns.sql']?.indexes?.includes('idx_county_sales_flip_finder'));

  assert.match(sqlText, /CREATE TABLE IF NOT EXISTS deal_breakdowns/i);
  assert.match(sqlText, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sqlText, /CREATE INDEX IF NOT EXISTS idx_county_sales_flip_finder/i);
  assert.doesNotMatch(sqlText, /\bINSERT\s+INTO\b/i, 'migration must contain zero test rows');
  assert.doesNotMatch(sqlText, /\bowner_name\b|\bmailing_address\b/i, 'migration must not store owner names or mailing addresses');

  const learningJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/content/learning.json'), 'utf8'));
  const lesson = (learningJson.terms || []).find((t) => t.id === 'how_flippers_builders_make_money');
  assert.ok(lesson, 'Learning Lab must include how_flippers_builders_make_money lesson');
  assert.equal(lesson.title, 'How flippers and builders make money');
});
