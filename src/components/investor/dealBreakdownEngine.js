/**
 * Deal Breakdown Reverse-Engineering Engine (Flip & Demo -> New Build)
 *
 * Pure, dependency-free calculation engine shared by:
 * - DealBreakdownSection.jsx (live interactive editor)
 * - FlipBuildFinder.jsx & /api/county/flip-finder (standardized table profit estimates)
 * - /api/investor/deal-breakdowns (server-side canonical result persistence)
 * - DealReportPage.jsx (Deal Report PDF section)
 * - Unit tests
 *
 * Every estimate is transparent, editable, and labeled as an estimate.
 */

import {
  DEVELOPER_COSTS_AS_OF,
  FL_DEED_DOC_STAMPS_PCT,
  FL_MORTGAGE_DOC_STAMPS_PCT,
  FL_INTANGIBLE_TAX_PCT,
  FLIP_REHAB_LEVELS,
  NEW_BUILD_QUALITY_TIERS,
  SOFT_COSTS_DEFAULTS,
  SITE_ADDON_ESTIMATES,
  FINANCING_MODES,
  DEFAULT_CONSTRUCTION_DRAW_SCHEDULE,
  TRANSACTION_AND_HOLDING_DEFAULTS,
  SCENARIO_OFFSETS,
  estimateDemoLumpSum,
  getDeveloperMillageForCounty,
  sumSoftCostsPct,
  computeWeightedDrawUtilization
} from '../../config/developerCosts.js';

function num(val, fallback = 0) {
  if (val === '' || val == null) return fallback;
  const cleaned = typeof val === 'string' ? val.replace(/[$,%\s]/g, '') : val;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function roundDollar(val) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function round1(val) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

/**
 * Formats YYYY-MM or YYYY-MM-DD from sale year + month
 */
export function buildIsoDateFromYearMonth(year, month = 1) {
  const yr = Number(year);
  if (!Number.isFinite(yr) || yr < 1900) return '';
  const mo = Number(month) >= 1 && Number(month) <= 12 ? Math.round(Number(month)) : 1;
  return `${yr}-${String(mo).padStart(2, '0')}-01`;
}

/**
 * Computes months held between two ISO date strings (minimum 1 month if valid).
 */
export function computeHoldMonthsBetweenDates(buyDateStr, exitDateStr, fallbackMonths = 6) {
  if (!buyDateStr || !exitDateStr) return fallbackMonths;
  const parseYm = (str) => {
    const m = String(str).trim().match(/^(\d{4})-(\d{1,2})/);
    if (m) return Number(m[1]) * 12 + Number(m[2]);
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.getUTCFullYear() * 12 + (d.getUTCMonth() + 1);
    return null;
  };
  const startYm = parseYm(buyDateStr);
  const endYm = parseYm(exitDateStr);
  if (startYm == null || endYm == null) return fallbackMonths;
  const diff = endYm - startYm;
  return diff > 0 ? Math.min(120, diff) : fallbackMonths;
}

/**
 * Infers whether a property's county history looks like a Demo -> New Build vs a Flip.
 */
export function inferDealBreakdownType({
  purchaseYear = null,
  afterYearBuilt = null,
  beforeSqft = null,
  afterSqft = null,
  buyViCd = null,
  sellViCd = null,
  explicitType = null
} = {}) {
  if (explicitType === 'flip' || explicitType === 'demo_new_build') return explicitType;
  if (buyViCd === 'V' && sellViCd === 'I') return 'demo_new_build';
  if (purchaseYear && afterYearBuilt && Number(afterYearBuilt) >= Number(purchaseYear)) {
    return 'demo_new_build';
  }
  if (beforeSqft > 0 && afterSqft > 0 && Number(afterSqft) > Number(beforeSqft) * 1.3) {
    return 'demo_new_build';
  }
  return 'flip';
}

/**
 * Auto-fills Deal Breakdown inputs from:
 * - saved property (`property`)
 * - county parcel & sales history (`countyData` incl. `sales` & `building_characteristics`)
 * - OR a Flip & Build Finder row (`finderRow`)
 */
export function buildDefaultDealBreakdownInputs({
  property = null,
  countyData = null,
  finderRow = null,
  dealType: requestedType = null
} = {}) {
  const bc =
    finderRow?.building_characteristics ||
    property?.building_characteristics ||
    countyData?.building_characteristics ||
    null;

  const county =
    finderRow?.county ||
    property?.parcel_county ||
    property?.county ||
    countyData?.county ||
    'Broward';

  // Extract purchase & resale dates/prices from finderRow OR countyData.sales
  let purchasePrice = 0;
  let purchaseDate = '';
  let purchaseYear = null;
  let exitPrice = 0;
  let exitDate = '';
  let exitSource = 'county_resale'; // 'county_resale' | 'my_list_price'
  let buyViCd = finderRow?.buy_vi_cd || null;
  let sellViCd = finderRow?.sell_vi_cd || null;

  if (finderRow) {
    purchasePrice = num(finderRow.buy_price, 0);
    purchaseYear = finderRow.buy_year ? Number(finderRow.buy_year) : null;
    purchaseDate = finderRow.buy_date || buildIsoDateFromYearMonth(finderRow.buy_year, finderRow.buy_month);
    exitPrice = num(finderRow.sell_price, 0);
    exitDate = finderRow.sell_date || buildIsoDateFromYearMonth(finderRow.sell_year, finderRow.sell_month);
    exitSource = finderRow.exit_source === 'my_list_price' ? 'my_list_price' : 'county_resale';
  } else {
    const sales = Array.isArray(countyData?.sales) ? countyData.sales : [];
    const validSales = sales
      .filter((s) => Number(s.sale_price) >= 25000 && Number(s.sale_year) > 1900)
      .sort((a, b) => {
        const ymA = Number(a.sale_year) * 12 + (Number(a.sale_month) || 1);
        const ymB = Number(b.sale_year) * 12 + (Number(b.sale_month) || 1);
        return ymB - ymA; // newest first
      });

    if (validSales.length >= 2) {
      const latest = validSales[0];
      const prior = validSales[1];
      const latestYm = Number(latest.sale_year) * 12 + (Number(latest.sale_month) || 1);
      const priorYm = Number(prior.sale_year) * 12 + (Number(prior.sale_month) || 1);
      const gapMonths = latestYm - priorYm;

      // If user has an entered list price that's newer/higher than latest sale and gap > 24 mo,
      // treat latest sale as purchase and list_price as active resale listing.
      if (gapMonths <= 36 && Number(latest.sale_price) > Number(prior.sale_price)) {
        purchasePrice = Number(prior.sale_price);
        purchaseYear = Number(prior.sale_year);
        purchaseDate = buildIsoDateFromYearMonth(prior.sale_year, prior.sale_month);
        buyViCd = prior.vi_cd || null;
        exitPrice = Number(latest.sale_price);
        exitDate = buildIsoDateFromYearMonth(latest.sale_year, latest.sale_month);
        sellViCd = latest.vi_cd || null;
        exitSource = 'county_resale';
      } else {
        purchasePrice = Number(latest.sale_price);
        purchaseYear = Number(latest.sale_year);
        purchaseDate = buildIsoDateFromYearMonth(latest.sale_year, latest.sale_month);
        buyViCd = latest.vi_cd || null;
        exitPrice = num(property?.list_price, 0);
        exitDate = new Date().toISOString().slice(0, 10);
        exitSource = 'my_list_price';
      }
    } else if (validSales.length === 1) {
      const only = validSales[0];
      purchasePrice = Number(only.sale_price);
      purchaseYear = Number(only.sale_year);
      purchaseDate = buildIsoDateFromYearMonth(only.sale_year, only.sale_month);
      buyViCd = only.vi_cd || null;
      exitPrice = num(property?.list_price, 0);
      exitDate = new Date().toISOString().slice(0, 10);
      exitSource = 'my_list_price';
    } else {
      purchasePrice = num(property?.offer_price || property?.list_price, 0);
      exitPrice = num(property?.list_price, 0);
      exitDate = new Date().toISOString().slice(0, 10);
      exitSource = 'my_list_price';
    }
  }

  const afterLivingSqft = Math.round(
    num(finderRow?.living_sqft, 0) ||
    num(bc?.living_area_sqft, 0) ||
    num(property?.sqft, 0) ||
    num(countyData?.living_sqft, 0) ||
    2000
  );
  const beforeLivingSqft = Math.round(
    num(finderRow?.before_living_sqft, 0) ||
    (buyViCd === 'V' ? 0 : (num(countyData?.living_sqft, 0) || afterLivingSqft))
  );
  const afterYearBuilt =
    num(finderRow?.year_built, 0) ||
    num(bc?.year_built, 0) ||
    num(property?.year_built, 0) ||
    num(countyData?.year_built, 0) ||
    null;
  const beforeYearBuilt =
    num(finderRow?.before_year_built, 0) ||
    (buyViCd === 'V' ? null : afterYearBuilt);
  const lotSqft = Math.round(
    num(finderRow?.land_sqft, 0) ||
    num(property?.lot_sqft, 0) ||
    num(countyData?.land_sqft, 0) ||
    0
  );

  const hasPool = Boolean(
    finderRow?.has_pool ||
    (bc?.pool_type && bc.pool_type !== 'none') ||
    property?.pool === true ||
    (property?.subject_details?.as_is?.pool_type && !['none', 'unknown'].includes(property.subject_details.as_is.pool_type))
  );
  const hasDock = Boolean(
    finderRow?.has_dock ||
    bc?.boat_dock === true ||
    property?.boat_dock === true ||
    property?.subject_details?.as_is?.boat_dock === true
  );

  const dealType = inferDealBreakdownType({
    purchaseYear,
    afterYearBuilt,
    beforeSqft: beforeLivingSqft,
    afterSqft: afterLivingSqft,
    buyViCd,
    sellViCd,
    explicitType: requestedType || finderRow?.deal_type || null
  });

  const isNewBuild = dealType === 'demo_new_build';
  const defaultHold = isNewBuild
    ? TRANSACTION_AND_HOLDING_DEFAULTS.newBuildHoldMonthsDefault
    : TRANSACTION_AND_HOLDING_DEFAULTS.flipHoldMonthsDefault;
  const holdMonths = finderRow?.hold_months > 0
    ? Number(finderRow.hold_months)
    : computeHoldMonthsBetweenDates(purchaseDate, exitDate, defaultHold);

  const flipLevel = 'medium';
  const buildQuality = afterLivingSqft >= 3800 || exitPrice >= 2000000 ? 'luxury' : exitPrice >= 1000000 ? 'high_end' : 'standard';
  const financingMode = isNewBuild ? 'construction_loan' : 'hard_money';
  const finPreset = FINANCING_MODES[financingMode];
  const softPreset = isNewBuild ? SOFT_COSTS_DEFAULTS.demo_new_build : SOFT_COSTS_DEFAULTS.flip;

  // Scale hazard/builder's risk insurance modestly for higher-value projects
  const baseMonthlyIns = isNewBuild
    ? TRANSACTION_AND_HOLDING_DEFAULTS.monthlyInsuranceNewBuild
    : TRANSACTION_AND_HOLDING_DEFAULTS.monthlyInsuranceFlip;
  const scaledMonthlyIns = exitPrice >= 2000000
    ? Math.round(baseMonthlyIns * 1.8)
    : exitPrice >= 1000000
      ? Math.round(baseMonthlyIns * 1.35)
      : baseMonthlyIns;

  return {
    asOf: DEVELOPER_COSTS_AS_OF,
    county,
    parcelId: finderRow?.parcel_id || property?.parcel_id || countyData?.parcel_id || null,
    address: finderRow?.address || property?.address || countyData?.address || '',
    city: finderRow?.city || property?.city || countyData?.city || '',
    zip: finderRow?.zip || property?.zip || countyData?.zip || '',
    dealType,
    purchasePrice: roundDollar(purchasePrice),
    purchaseDate,
    exitSource,
    exitPrice: roundDollar(exitPrice),
    exitDate,
    holdMonths: clamp(Math.round(holdMonths), 1, 120),
    beforeYearBuilt,
    afterYearBuilt,
    beforeLivingSqft,
    afterLivingSqft,
    lotSqft,
    hasPool,
    hasDock,
    isVacantLotPurchase: buyViCd === 'V',

    // Hard cost inputs (all estimates, editable)
    flipRehabLevel: flipLevel,
    flipRehabCostPerSqft: FLIP_REHAB_LEVELS[flipLevel].costPerSqft,
    newBuildQuality: buildQuality,
    newBuildCostPerSqft: NEW_BUILD_QUALITY_TIERS[buildQuality].costPerSqft,
    hardCostOverride: null, // Optional direct lump sum override
    demoCost: isNewBuild ? (buyViCd === 'V' ? 0 : estimateDemoLumpSum(beforeLivingSqft)) : 0,
    includePoolAddon: isNewBuild && hasPool,
    poolAddonCost: isNewBuild ? SITE_ADDON_ESTIMATES.demo_new_build.pool : SITE_ADDON_ESTIMATES.flip.pool,
    includeDockAddon: isNewBuild && hasDock,
    dockAddonCost: isNewBuild ? SITE_ADDON_ESTIMATES.demo_new_build.dock : SITE_ADDON_ESTIMATES.flip.dock,

    // Soft costs % (editable sub-items + total)
    softCostsBreakdown: { ...softPreset },
    softCostsPct: sumSoftCostsPct(softPreset),

    // Financing (cash / hard_money / construction_loan)
    financingMode,
    interestRatePct: finPreset.ratePct,
    pointsPct: finPreset.pointsPct,
    ltcPct: finPreset.ltcPct,
    drawUtilPct: finPreset.rehabDrawUtilPct,
    lenderFees: finPreset.lenderFees,
    drawSchedule: DEFAULT_CONSTRUCTION_DRAW_SCHEDULE.map((s) => ({ ...s })),

    // Buying closing, holding, selling
    buyClosingPct: TRANSACTION_AND_HOLDING_DEFAULTS.buyClosingPct,
    millageRate: getDeveloperMillageForCounty(county),
    monthlyInsurance: scaledMonthlyIns,
    monthlyUtilities: isNewBuild
      ? TRANSACTION_AND_HOLDING_DEFAULTS.monthlyUtilitiesNewBuild
      : TRANSACTION_AND_HOLDING_DEFAULTS.monthlyUtilitiesFlip,
    sellCommissionPct: TRANSACTION_AND_HOLDING_DEFAULTS.sellCommissionPct,
    sellClosingPct: TRANSACTION_AND_HOLDING_DEFAULTS.sellClosingPct,
    flDocStampsPct: FL_DEED_DOC_STAMPS_PCT
  };
}

/**
 * Core project cost & return math for a single set of assumptions (used for Base + Low/High scenarios).
 */
function evaluateSingleScenario(inputs, { hardCostMult = 1.0, extraHoldMonths = 0, exitPriceMult = 1.0 } = {}) {
  const isNewBuild = inputs.dealType === 'demo_new_build';
  const purchasePrice = Math.max(0, num(inputs.purchasePrice, 0));
  const exitPrice = roundDollar(Math.max(0, num(inputs.exitPrice, 0)) * exitPriceMult);
  const holdMonths = clamp(Math.round(num(inputs.holdMonths, isNewBuild ? 16 : 6) + extraHoldMonths), 1, 120);
  const afterLivingSqft = Math.max(0, num(inputs.afterLivingSqft, 0));

  // 1. Buying closing costs
  const buyClosingPct = clamp(num(inputs.buyClosingPct, 2.0), 0, 15);
  const buyClosing = roundDollar(purchasePrice * (buyClosingPct / 100));

  // 2. Hard rehab / construction + demolition + site add-ons
  const demoCost = isNewBuild ? roundDollar(Math.max(0, num(inputs.demoCost, 0))) : 0;
  const baseUnitRate = isNewBuild
    ? Math.max(0, num(inputs.newBuildCostPerSqft, NEW_BUILD_QUALITY_TIERS.standard.costPerSqft))
    : Math.max(0, num(inputs.flipRehabCostPerSqft, FLIP_REHAB_LEVELS.medium.costPerSqft));

  const hasHardOverride = inputs.hardCostOverride != null && inputs.hardCostOverride !== '' && num(inputs.hardCostOverride, -1) >= 0;
  const baseHardBuild = hasHardOverride
    ? num(inputs.hardCostOverride, 0)
    : afterLivingSqft * baseUnitRate;

  const poolAddon = inputs.includePoolAddon ? Math.max(0, num(inputs.poolAddonCost, 0)) : 0;
  const dockAddon = inputs.includeDockAddon ? Math.max(0, num(inputs.dockAddonCost, 0)) : 0;

  const hardBuildCore = roundDollar(baseHardBuild * hardCostMult);
  const hardCost = roundDollar(hardBuildCore + poolAddon + dockAddon);
  const hardCostPerSqft = afterLivingSqft > 0 ? Math.round((hardBuildCore / afterLivingSqft) * 10) / 10 : null;

  // 3. Soft costs (% of hard cost + demo for new build)
  const softBreakdown = inputs.softCostsBreakdown || (isNewBuild ? SOFT_COSTS_DEFAULTS.demo_new_build : SOFT_COSTS_DEFAULTS.flip);
  const softCostsPct = inputs.softCostsPct != null
    ? clamp(num(inputs.softCostsPct, sumSoftCostsPct(softBreakdown)), 0, 45)
    : sumSoftCostsPct(softBreakdown);
  const softBase = hardCost + demoCost;
  const softCosts = roundDollar(softBase * (softCostsPct / 100));

  // 4. Holding costs (property tax at purchase price via millage + insurance + utilities) * months
  const millageRate = clamp(num(inputs.millageRate, getDeveloperMillageForCounty(inputs.county)), 0, 50);
  const annualPropertyTax = roundDollar(purchasePrice * (millageRate / 1000));
  const monthlyTax = roundDollar(annualPropertyTax / 12);
  const monthlyInsurance = Math.max(0, roundDollar(num(inputs.monthlyInsurance, isNewBuild ? 650 : 450)));
  const monthlyUtilities = Math.max(0, roundDollar(num(inputs.monthlyUtilities, isNewBuild ? 450 : 350)));
  const monthlyHoldingTotal = monthlyTax + monthlyInsurance + monthlyUtilities;
  const holdingCosts = roundDollar(monthlyHoldingTotal * holdMonths);

  // 5. Financing (Cash | Hard Money | Construction Loan with draw schedule)
  const financingMode = ['cash', 'hard_money', 'construction_loan'].includes(inputs.financingMode)
    ? inputs.financingMode
    : 'hard_money';

  let loanAmount = 0;
  let purchaseLoanPart = 0;
  let buildLoanPart = 0;
  let downPayment = purchasePrice;
  let financingPoints = 0;
  let financingInterest = 0;
  let financingFees = 0;
  let avgDrawnPct = 0;

  if (financingMode !== 'cash') {
    const ltcPct = clamp(num(inputs.ltcPct, financingMode === 'construction_loan' ? 75 : 80), 0, 95);
    const ratePct = clamp(num(inputs.interestRatePct, financingMode === 'construction_loan' ? 9.25 : 11.0), 0, 30);
    const pointsPct = clamp(num(inputs.pointsPct, financingMode === 'construction_loan' ? 1.5 : 2.0), 0, 10);
    const lenderFees = Math.max(0, roundDollar(num(inputs.lenderFees, financingMode === 'construction_loan' ? 4500 : 2500)));

    const totalFinanceableCost = purchasePrice + demoCost + hardCost + (financingMode === 'construction_loan' ? softCosts : 0);
    loanAmount = roundDollar(totalFinanceableCost * (ltcPct / 100));
    purchaseLoanPart = roundDollar(purchasePrice * (ltcPct / 100));
    buildLoanPart = Math.max(0, loanAmount - purchaseLoanPart);
    downPayment = Math.max(0, totalFinanceableCost - loanAmount);

    const drawUtil = financingMode === 'construction_loan'
      ? (inputs.drawUtilPct != null
          ? clamp(num(inputs.drawUtilPct, 55), 10, 100) / 100
          : computeWeightedDrawUtilization(inputs.drawSchedule))
      : clamp(num(inputs.drawUtilPct, 60), 10, 100) / 100;
    avgDrawnPct = round1(drawUtil * 100);

    const avgLoanBalance = purchaseLoanPart + buildLoanPart * drawUtil;
    financingInterest = roundDollar(avgLoanBalance * (ratePct / 100) * (holdMonths / 12));
    financingPoints = roundDollar(loanAmount * (pointsPct / 100));
    // FL mortgage doc stamps (0.35%) + intangible tax (0.20%) on loan + lender underwriting/draw fees
    const flLoanTaxes = roundDollar(loanAmount * ((FL_MORTGAGE_DOC_STAMPS_PCT + FL_INTANGIBLE_TAX_PCT) / 100));
    financingFees = lenderFees + flLoanTaxes;
  }

  const financingCosts = financingInterest + financingPoints + financingFees;

  // 6. Selling costs (commission + closing + statutory FL deed doc stamps 0.70%)
  const sellCommissionPct = clamp(num(inputs.sellCommissionPct, 5.0), 0, 15);
  const sellClosingPct = clamp(num(inputs.sellClosingPct, 1.0), 0, 10);
  const flDocStampsPct = clamp(num(inputs.flDocStampsPct, FL_DEED_DOC_STAMPS_PCT), 0, 3);

  const commissionCost = roundDollar(exitPrice * (sellCommissionPct / 100));
  const sellerClosingCost = roundDollar(exitPrice * (sellClosingPct / 100));
  const flDocStampsCost = roundDollar(exitPrice * (flDocStampsPct / 100));
  const sellingCosts = commissionCost + sellerClosingCost + flDocStampsCost;

  // 7. Totals & Returns
  const totalProjectCost = purchasePrice + buyClosing + demoCost + hardCost + softCosts + financingCosts + holdingCosts;
  const totalInvested = totalProjectCost + sellingCosts;
  const estProfit = exitPrice > 0 ? exitPrice - totalInvested : -totalProjectCost;

  // Cash needed = out-of-pocket capital (down payment / unfinanced construction + closing + soft if unfinanced + financing + holding)
  const cashNeeded = financingMode === 'cash'
    ? totalProjectCost
    : Math.max(0, totalProjectCost - loanAmount);

  const roiPct = totalProjectCost > 0 ? round1((estProfit / totalProjectCost) * 100) : 0;
  const cashOnCashRoiPct = cashNeeded > 0 ? round1((estProfit / cashNeeded) * 100) : 0;
  const annualizedRoiPct = totalProjectCost > 0 && holdMonths > 0
    ? round1((estProfit / totalProjectCost) * (12 / holdMonths) * 100)
    : 0;
  const annualizedCashRoiPct = cashNeeded > 0 && holdMonths > 0
    ? round1((estProfit / cashNeeded) * (12 / holdMonths) * 100)
    : 0;

  const grossSpread = exitPrice > 0 && purchasePrice > 0 ? exitPrice - purchasePrice : 0;
  const grossSpreadPct = purchasePrice > 0 && exitPrice > 0 ? round1((grossSpread / purchasePrice) * 100) : 0;

  const profitPerSqft = afterLivingSqft > 0 ? roundDollar(estProfit / afterLivingSqft) : null;
  const constructionCostPerSqft = afterLivingSqft > 0
    ? roundDollar((demoCost + hardCost + softCosts) / afterLivingSqft)
    : null;
  const costPerSqftAllIn = afterLivingSqft > 0
    ? roundDollar(totalProjectCost / afterLivingSqft)
    : null;

  return {
    costs: {
      purchasePrice,
      buyClosing,
      demoCost,
      hardBuildCore,
      poolAddon,
      dockAddon,
      hardCost,
      hardCostPerSqft,
      softCosts,
      softCostsPct,
      softBreakdown: {
        architect: roundDollar(softBase * ((num(softBreakdown.architectPct, 0)) / 100)),
        engineering: roundDollar(softBase * ((num(softBreakdown.engineeringPct, 0)) / 100)),
        survey: roundDollar(softBase * ((num(softBreakdown.surveyPct, 0)) / 100)),
        permits: roundDollar(softBase * ((num(softBreakdown.permitsPct, 0)) / 100)),
        impactFees: roundDollar(softBase * ((num(softBreakdown.impactFeesPct, 0)) / 100))
      },
      financingMode,
      loanAmount,
      downPayment,
      financingInterest,
      financingPoints,
      financingFees,
      financingCosts,
      avgDrawnPct,
      annualPropertyTax,
      monthlyTax,
      monthlyInsurance,
      monthlyUtilities,
      monthlyHoldingTotal,
      holdingCosts,
      commissionCost,
      sellerClosingCost,
      flDocStampsCost,
      flDocStampsPct,
      sellingCosts,
      totalProjectCost,
      totalInvested
    },
    metrics: {
      exitPrice,
      holdMonths,
      grossSpread,
      grossSpreadPct,
      estProfit,
      roiPct,
      cashOnCashRoiPct,
      annualizedRoiPct,
      annualizedCashRoiPct,
      cashNeeded,
      profitPerSqft,
      constructionCostPerSqft,
      costPerSqftAllIn
    }
  };
}

/**
 * Full Deal Breakdown calculation:
 * - Likely (base), Low (conservative), and High (optimistic) scenarios
 * - "My version" column applying the user's 70% Rule + Buying Profile (liquid cash, reserves, hard money rate)
 */
export function calculateDealBreakdown(rawInputs = {}, buyingProfile = null) {
  const inputs = {
    ...buildDefaultDealBreakdownInputs({}),
    ...(rawInputs || {})
  };

  const likelyEval = evaluateSingleScenario(inputs, SCENARIO_OFFSETS.likely);
  const lowEval = evaluateSingleScenario(inputs, SCENARIO_OFFSETS.low);
  const highEval = evaluateSingleScenario(inputs, SCENARIO_OFFSETS.high);

  // "My version" column: 70% Rule MAO + user's Buying Profile rates & liquid cash check
  const isNewBuild = inputs.dealType === 'demo_new_build';
  const exitPrice = likelyEval.metrics.exitPrice;
  const totalBuildAndSoft = likelyEval.costs.demoCost + likelyEval.costs.hardCost + likelyEval.costs.softCosts;
  const mao70 = exitPrice > 0
    ? Math.max(0, roundDollar(exitPrice * 0.7 - totalBuildAndSoft))
    : 0;
  const deltaVsActualPurchase = likelyEval.costs.purchasePrice - mao70;
  const actualBelowMao = deltaVsActualPurchase <= 0;

  // Pull user's hard money quote from Buying Profile rate_sheet if set
  const creditTier = buyingProfile?.credit_tier || '740-759';
  const hmSheet = buyingProfile?.rate_sheet?.hard_money;
  let profileRatePct = inputs.financingMode === 'construction_loan'
    ? num(inputs.interestRatePct, FINANCING_MODES.construction_loan.ratePct)
    : FINANCING_MODES.hard_money.ratePct;
  if (!isNewBuild && hmSheet && hmSheet.base_rate != null) {
    const base = Number(hmSheet.base_rate);
    const adj = hmSheet.adjustments?.[creditTier] != null ? Number(hmSheet.adjustments[creditTier]) : 0;
    if (Number.isFinite(base + adj) && base + adj > 0) {
      profileRatePct = round1(base + adj);
    }
  }
  const profilePointsPct = isNewBuild ? 1.5 : 2.0;

  const myVersionInputs = {
    ...inputs,
    purchasePrice: mao70 > 0 ? mao70 : inputs.purchasePrice,
    financingMode: isNewBuild ? 'construction_loan' : 'hard_money',
    interestRatePct: profileRatePct,
    pointsPct: profilePointsPct,
    ltcPct: isNewBuild ? 75 : 80
  };
  const myEval = evaluateSingleScenario(myVersionInputs, SCENARIO_OFFSETS.likely);

  const liquidCash = buyingProfile?.liquid_cash != null && !isNaN(Number(buyingProfile.liquid_cash))
    ? Math.round(Number(buyingProfile.liquid_cash))
    : null;
  const reserveMonths = buyingProfile?.reserve_months != null && !isNaN(Number(buyingProfile.reserve_months))
    ? Number(buyingProfile.reserve_months)
    : 6;
  const reserveHoldback = roundDollar(myEval.costs.monthlyHoldingTotal * reserveMonths);
  const deployableCash = liquidCash != null ? Math.max(0, liquidCash - reserveHoldback) : null;
  const fitsLiquidCash = deployableCash != null ? deployableCash >= myEval.metrics.cashNeeded : null;
  const cashGap = deployableCash != null ? Math.max(0, myEval.metrics.cashNeeded - deployableCash) : null;

  return {
    asOf: DEVELOPER_COSTS_AS_OF,
    inputs,
    costs: likelyEval.costs,
    metrics: likelyEval.metrics,
    scenarios: {
      low: {
        ...SCENARIO_OFFSETS.low,
        ...lowEval.metrics,
        totalInvested: lowEval.costs.totalInvested,
        totalProjectCost: lowEval.costs.totalProjectCost
      },
      likely: {
        ...SCENARIO_OFFSETS.likely,
        ...likelyEval.metrics,
        totalInvested: likelyEval.costs.totalInvested,
        totalProjectCost: likelyEval.costs.totalProjectCost
      },
      high: {
        ...SCENARIO_OFFSETS.high,
        ...highEval.metrics,
        totalInvested: highEval.costs.totalInvested,
        totalProjectCost: highEval.costs.totalProjectCost
      }
    },
    myVersion: {
      mao70,
      actualPurchasePrice: likelyEval.costs.purchasePrice,
      deltaVsActualPurchase,
      actualBelowMao,
      financingLabel: isNewBuild
        ? `Construction loan (${profileRatePct}% · ${profilePointsPct} pts)`
        : `Hard money (${profileRatePct}% · ${profilePointsPct} pts · ${creditTier})`,
      ratePct: profileRatePct,
      pointsPct: profilePointsPct,
      totalProjectCost: myEval.costs.totalProjectCost,
      totalInvested: myEval.costs.totalInvested,
      cashNeeded: myEval.metrics.cashNeeded,
      estProfit: myEval.metrics.estProfit,
      roiPct: myEval.metrics.roiPct,
      annualizedRoiPct: myEval.metrics.annualizedRoiPct,
      profitPerSqft: myEval.metrics.profitPerSqft,
      liquidCash,
      reserveMonths,
      reserveHoldback,
      deployableCash,
      fitsLiquidCash,
      cashGap
    }
  };
}

/**
 * Standardized quick profit estimate for Flip & Build Finder table rows.
 * Uses medium flip rehab or quality-matched new build defaults — labeled "estimate".
 */
export function estimateQuickFinderProfit(row = {}) {
  const inputs = buildDefaultDealBreakdownInputs({ finderRow: row });
  const result = calculateDealBreakdown(inputs, null);
  return {
    estProfit: result.metrics.estProfit,
    roiPct: result.metrics.roiPct,
    annualizedRoiPct: result.metrics.annualizedRoiPct,
    totalInvested: result.costs.totalInvested,
    hardCost: result.costs.hardCost,
    dealType: inputs.dealType
  };
}
