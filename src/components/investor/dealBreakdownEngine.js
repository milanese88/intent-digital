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
  computeWeightedDrawUtilization,
  inferFlipRehabLevel
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
 * Computes individual phase lengths (pre-construction, construction, on-market, total)
 * from milestone dates (buy, demo, permit, completion, list, sell).
 */
export function computeTimelinePhases(milestones = {}) {
  const {
    buyDate,
    demoDate,
    permitDate,
    constructionStartDate,
    completedDate,
    listDate,
    sellDate,
    defaultHoldMonths = 12
  } = milestones;

  const toYm = (dateStr) => {
    if (!dateStr) return null;
    const m = String(dateStr).match(/^(\d{4})-(\d{2})/);
    if (!m) return null;
    return Number(m[1]) * 12 + Number(m[2]);
  };

  const buyYm = toYm(buyDate);
  const workDates = [demoDate, permitDate, constructionStartDate].filter(Boolean);
  const workYmList = workDates.map(toYm).filter((ym) => ym != null);
  const earliestWorkYm = workYmList.length > 0 ? Math.min(...workYmList) : null;
  const completeYm = toYm(completedDate);
  const listYm = toYm(listDate);
  const sellYm = toYm(sellDate);

  let preConstructionMonths = 0;
  let constructionMonths = 0;
  let onMarketMonths = 0;

  if (buyYm && earliestWorkYm && earliestWorkYm >= buyYm) {
    preConstructionMonths = Math.max(1, earliestWorkYm - buyYm);
  }

  const workStartYm = earliestWorkYm || buyYm;
  if (workStartYm && completeYm && completeYm >= workStartYm) {
    constructionMonths = Math.max(1, completeYm - workStartYm);
  } else if (milestones.dealType === 'demo_new_build') {
    constructionMonths = 12; // default 12 mo for new build if completed date not known yet
  } else {
    constructionMonths = 4; // default 4 mo for flip
  }

  const marketStartYm = listYm || completeYm || (workStartYm ? workStartYm + constructionMonths : null);
  if (marketStartYm && sellYm && sellYm >= marketStartYm) {
    onMarketMonths = Math.max(1, sellYm - marketStartYm);
  } else {
    onMarketMonths = 2; // standard 60-day listing to close
  }

  const totalCalculated =
    buyYm && sellYm && sellYm >= buyYm
      ? sellYm - buyYm
      : (preConstructionMonths || 1) + (constructionMonths || 4) + (onMarketMonths || 2);

  return {
    preConstructionMonths: Math.max(0, preConstructionMonths),
    constructionMonths: Math.max(1, constructionMonths),
    onMarketMonths: Math.max(1, onMarketMonths),
    totalHoldMonths: Math.max(1, totalCalculated || defaultHoldMonths),
    hasActualPhases: Boolean(buyYm && (earliestWorkYm || completeYm || sellYm))
  };
}

/**
 * Infers whether a property's county history looks like a Demo -> New Build vs a Flip.
 *
 * Strictly requires genuine new-construction evidence:
 * 1. year_built >= purchase year, OR
 * 2. vacant land purchased (V) and improved residence sold (I), OR
 * 3. living area grew > 30% (before vs after), OR
 * 4. improvement value jumped (>50% and >$100k) while land value stayed stable (requires prior + current roll values).
 * Otherwise classifies as 'flip'.
 */
export function inferDealBreakdownType({
  purchaseYear = null,
  buyYear = null,
  afterYearBuilt = null,
  yearBuilt = null,
  beforeSqft = null,
  afterSqft = null,
  buyViCd = null,
  sellViCd = null,
  prevImpValue = null,
  currImpValue = null,
  prevLandValue = null,
  currLandValue = null,
  explicitType = null
} = {}) {
  if (explicitType === 'flip' || explicitType === 'demo_new_build') return explicitType;

  const pYear = Number(purchaseYear || buyYear) || null;
  const yBuilt = Number(afterYearBuilt || yearBuilt) || null;
  if (pYear && yBuilt && yBuilt >= pYear) {
    return 'demo_new_build';
  }

  const buyVi = String(buyViCd || '').trim().toUpperCase();
  const sellVi = String(sellViCd || '').trim().toUpperCase();
  const bSqft = Number(beforeSqft) || 0;
  const aSqft = Number(afterSqft) || 0;

  // Vacant lot -> improved building (never V -> V land flips)
  if (buyVi === 'V' && (sellVi === 'I' || (!sellVi && aSqft > 0))) {
    return 'demo_new_build';
  }

  // Living area grew > 30%
  if (bSqft > 0 && aSqft > 0 && aSqft > bSqft * 1.3) {
    return 'demo_new_build';
  }

  // Improvement value jumped while land stayed stable (only when both prior & current roll values exist)
  if (
    prevImpValue != null &&
    currImpValue != null &&
    prevLandValue != null &&
    currLandValue != null
  ) {
    const pImp = Number(prevImpValue);
    const cImp = Number(currImpValue);
    const pLand = Number(prevLandValue);
    const cLand = Number(currLandValue);
    if (
      Number.isFinite(pImp) &&
      Number.isFinite(cImp) &&
      Number.isFinite(pLand) &&
      Number.isFinite(cLand) &&
      cImp > Math.max(pImp * 1.5, pImp + 100000) &&
      (pLand <= 0 || cLand <= pLand * 1.35)
    ) {
      return 'demo_new_build';
    }
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

  const afterYearBuilt =
    num(finderRow?.year_built, 0) ||
    num(bc?.year_built, 0) ||
    num(property?.year_built, 0) ||
    num(countyData?.year_built, 0) ||
    null;

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

      // If gap is within 48 months (or prior sale preceded new build completion) and resale is higher,
      // treat prior sale as purchase and latest sale as completed exit.
      const isNewBuildTimeline = afterYearBuilt && Number(prior.sale_year) <= afterYearBuilt && gapMonths <= 60;
      if ((gapMonths <= 48 || isNewBuildTimeline) && Number(latest.sale_price) > Number(prior.sale_price)) {
        purchasePrice = Number(prior.sale_price);
        purchaseYear = Number(prior.sale_year);
        purchaseDate = latest.sale_date && prior.sale_date ? prior.sale_date : buildIsoDateFromYearMonth(prior.sale_year, prior.sale_month);
        buyViCd = prior.vi_cd || null;
        exitPrice = Number(latest.sale_price);
        exitDate = latest.sale_date || buildIsoDateFromYearMonth(latest.sale_year, latest.sale_month);
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

  const knownAfterLivingSqft = Math.round(
    num(finderRow?.living_sqft, 0) ||
    num(bc?.living_area_sqft, 0) ||
    num(property?.sqft, 0) ||
    num(countyData?.living_sqft, 0) ||
    0
  );
  // Placeholder only for the math (clearly flagged so the UI asks the user to enter it)
  const afterLivingSqftIsPlaceholder = knownAfterLivingSqft <= 0;
  const afterLivingSqft = afterLivingSqftIsPlaceholder ? 2000 : knownAfterLivingSqft;
  const beforeLivingSqft = Math.round(
    num(finderRow?.before_living_sqft, 0) ||
    (buyViCd === 'V' ? 0 : (num(countyData?.living_sqft, 0) || afterLivingSqft))
  );
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
    prevImpValue: finderRow?.prev_imp_value ?? null,
    currImpValue: finderRow?.curr_imp_value ?? null,
    prevLandValue: finderRow?.prev_land_value ?? null,
    currLandValue: finderRow?.curr_land_value ?? null,
    explicitType: requestedType || finderRow?.deal_type || null
  });

  const isNewBuild = dealType === 'demo_new_build';
  const defaultHold = isNewBuild
    ? TRANSACTION_AND_HOLDING_DEFAULTS.newBuildHoldMonthsDefault
    : TRANSACTION_AND_HOLDING_DEFAULTS.flipHoldMonthsDefault;
  const holdMonths = finderRow?.hold_months > 0
    ? Number(finderRow.hold_months)
    : computeHoldMonthsBetweenDates(purchaseDate, exitDate, defaultHold);

  const jumpPct = finderRow?.jump_pct != null && Number.isFinite(Number(finderRow.jump_pct))
    ? Number(finderRow.jump_pct)
    : (purchasePrice > 0 && exitPrice > purchasePrice
        ? ((exitPrice - purchasePrice) / purchasePrice) * 100
        : null);
  const flipLevel = inferFlipRehabLevel({ holdMonths, jumpPct });
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
    purchaseSource: finderRow?.purchase_source || (purchasePrice > 0 ? 'county_deed' : 'entered_by_me'),
    exitSource,
    exitPrice: roundDollar(exitPrice),
    exitDate,
    holdMonths: clamp(Math.round(holdMonths), 1, 120),
    beforeYearBuilt,
    afterYearBuilt,
    beforeLivingSqft,
    afterLivingSqft,
    afterLivingSqftIsPlaceholder,
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
  const hasPhases = inputs.timelinePhases && Number(inputs.timelinePhases.totalHoldMonths) > 0;
  const holdMonths = hasPhases
    ? Math.max(1, Math.round(Number(inputs.timelinePhases.totalHoldMonths) + extraHoldMonths))
    : clamp(Math.round(num(inputs.holdMonths, isNewBuild ? 16 : 6) + extraHoldMonths), 1, 120);
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

    if (inputs.timelinePhases?.hasActualPhases) {
      const preM = Math.max(0, Number(inputs.timelinePhases.preConstructionMonths) || 0);
      const buildM = Math.max(0, Number(inputs.timelinePhases.constructionMonths) || (holdMonths - preM));
      const mktM = Math.max(0, Number(inputs.timelinePhases.onMarketMonths) || 0);
      const preInt = purchaseLoanPart * (ratePct / 100) * (preM / 12);
      const buildInt = (purchaseLoanPart + buildLoanPart * drawUtil) * (ratePct / 100) * (buildM / 12);
      const mktInt = (purchaseLoanPart + buildLoanPart) * (ratePct / 100) * (mktM / 12);
      financingInterest = roundDollar(preInt + buildInt + mktInt);
    } else {
      const avgLoanBalance = purchaseLoanPart + buildLoanPart * drawUtil;
      financingInterest = roundDollar(avgLoanBalance * (ratePct / 100) * (holdMonths / 12));
    }
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
      holdMonths,
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
 * Builds the Finder "Analyze an address" row from an address pick + /api/county/parcel payload.
 * Pure and null-tolerant: handles completed new builds, vacant lots, parcels with 0/1/many
 * sales, a missing CAMA record, and both the flat parcel payload and a legacy `{ parcel }` wrapper.
 */
export function buildAnalyzeCandidateRow({ details = {}, parcelData = null, county = null, parcelId = null } = {}) {
  const d = details && typeof details === 'object' ? details : {};
  const pd = parcelData && typeof parcelData === 'object' ? parcelData : {};
  const parcel = pd.parcel && typeof pd.parcel === 'object' ? pd.parcel : pd;
  const bc = pd.building_characteristics && typeof pd.building_characteristics === 'object'
    ? pd.building_characteristics
    : null;
  const pCounty = county || d.parcel_county || d.county || parcel.county || 'Broward';
  const folio = parcelId || d.parcel_id || parcel.parcel_id || null;

  const sales = (Array.isArray(pd.sales) ? pd.sales : [])
    .filter((s) => s && Number(s.sale_year) > 1900 && Number.isFinite(Number(s.sale_price)))
    .sort((a, b) => ((Number(a.sale_year) * 100) + (Number(a.sale_month) || 1)) - ((Number(b.sale_year) * 100) + (Number(b.sale_month) || 1)));

  let bought = null;
  let sold = null;
  let exitSource = 'my_list_price';
  const marketSales = sales.filter((s) => Number(s.sale_price) >= 25000);
  const pool = marketSales.length > 0 ? marketSales : sales;
  if (pool.length >= 2) {
    // Recent developer flip / build is the most recent pair of market transactions
    bought = pool[pool.length - 2];
    sold = pool[pool.length - 1];
    exitSource = 'county_resale';
  } else if (pool.length === 1) {
    bought = pool[0];
  }

  const buyDate = bought ? buildIsoDateFromYearMonth(bought.sale_year, bought.sale_month) : '';
  const sellDate = sold ? buildIsoDateFromYearMonth(sold.sale_year, sold.sale_month) : '';
  const posNum = (...vals) => {
    for (const v of vals) {
      const n = Number(v);
      if (v != null && v !== '' && Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };

  const yearBuilt = posNum(bc?.year_built, parcel.year_built, d.year_built);
  const bcLiving = posNum(bc?.living_area_sqft, bc?.living_sqft);
  const parcelLiving = posNum(parcel.living_sqft);
  const livingSqft = posNum(bcLiving, parcelLiving, d.sqft);
  const poolType = bc?.pool_type && bc.pool_type !== 'none' ? bc.pool_type : null;

  const inferredType = inferDealBreakdownType({
    buyYear: bought ? Number(bought.sale_year) : null,
    afterYearBuilt: yearBuilt,
    beforeSqft: parcelLiving,
    afterSqft: bcLiving || parcelLiving,
    buyViCd: bought?.vi_cd || null,
    sellViCd: sold?.vi_cd || null
  });
  // Analyzing a vacant lot that hasn't resold yet = planning a build (not a land flip)
  const dealType = !sold && String(bought?.vi_cd || '').toUpperCase() === 'V' && !livingSqft
    ? 'demo_new_build'
    : inferredType;

  return {
    id: `analyze-${pCounty}-${folio || 'manual'}`,
    county: pCounty,
    parcel_id: folio,
    address: d.address || parcel.address || '',
    city: d.city || parcel.city || '',
    zip: d.zip || parcel.zip || '',
    deal_type: dealType,
    buy_price: bought ? Math.round(Number(bought.sale_price) || 0) : 0,
    buy_date: buyDate,
    buy_year: bought ? Number(bought.sale_year) : null,
    buy_month: bought ? (Number(bought.sale_month) || 1) : null,
    purchase_source: bought ? 'county_deed' : 'entered_by_me',
    buy_qual: bought?.qual_code || null,
    buy_vi_cd: bought?.vi_cd || null,
    sell_price: sold ? Math.round(Number(sold.sale_price) || 0) : 0,
    sell_date: sellDate,
    exit_source: exitSource,
    sell_qual: sold?.qual_code || null,
    sell_vi_cd: sold?.vi_cd || null,
    hold_months: computeHoldMonthsBetweenDates(buyDate, sellDate, 12),
    living_sqft: livingSqft,
    before_living_sqft: bought?.vi_cd === 'V' ? 0 : (parcelLiving || livingSqft),
    bc_living_sqft: bcLiving,
    year_built: yearBuilt,
    eff_year_built: posNum(bc?.effective_year_built, parcel.eff_year_built),
    land_sqft: posNum(parcel.land_sqft, d.lot_sqft),
    lot_sqft: posNum(parcel.land_sqft, d.lot_sqft),
    has_pool: Boolean(poolType || bc?.pool_year),
    pool_type: poolType,
    pool_year: bc?.pool_year ?? null,
    has_dock: bc?.boat_dock === true,
    beds: posNum(bc?.beds, parcel.beds),
    full_baths: bc?.full_baths ?? parcel.full_baths ?? null,
    half_baths: bc?.half_baths ?? parcel.half_baths ?? null,
    sales: Array.isArray(pd.sales) ? pd.sales : [],
    building_characteristics: bc,
    is_distressed_acquisition: Boolean(bought?.is_distressed)
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
 * Computes the maximum hard renovation / build budget ("Break-even reno") that still
 * leaves a target ROI profit (10% and 15% default targets) after purchase, buy closing,
 * soft costs, holding (tax + insurance + utilities), financing (fixed + marginal draw/points/FL loan taxes),
 * and selling costs (commission + closing + FL 0.70% deed doc stamps).
 */
export function calculateBreakEvenReno(rawInputs = {}) {
  const inputs = {
    ...buildDefaultDealBreakdownInputs({}),
    ...(rawInputs || {})
  };

  const isNewBuild = inputs.dealType === 'demo_new_build';
  const purchasePrice = Math.max(0, num(inputs.purchasePrice, 0));
  const exitPrice = Math.max(0, num(inputs.exitPrice, 0));
  const afterLivingSqft = Math.max(0, num(inputs.afterLivingSqft, 0));

  if (exitPrice <= 0 || purchasePrice <= 0) {
    return {
      breakEvenReno10: 0,
      breakEvenReno15: 0,
      breakEvenReno10PerSqft: null,
      breakEvenReno15PerSqft: null,
      rawBreakEvenReno10: 0,
      rawBreakEvenReno15: 0
    };
  }

  const hasPhases = inputs.timelinePhases && Number(inputs.timelinePhases.totalHoldMonths) > 0;
  const holdMonths = hasPhases
    ? Math.max(1, Math.round(Number(inputs.timelinePhases.totalHoldMonths)))
    : clamp(Math.round(num(inputs.holdMonths, isNewBuild ? 16 : 6)), 1, 120);

  const buyClosingPct = clamp(num(inputs.buyClosingPct, 2.0), 0, 15);
  const buyClosing = roundDollar(purchasePrice * (buyClosingPct / 100));

  const softBreakdown = inputs.softCostsBreakdown || (isNewBuild ? SOFT_COSTS_DEFAULTS.demo_new_build : SOFT_COSTS_DEFAULTS.flip);
  const softCostsPct = inputs.softCostsPct != null
    ? clamp(num(inputs.softCostsPct, sumSoftCostsPct(softBreakdown)), 0, 45)
    : sumSoftCostsPct(softBreakdown);
  const softRate = softCostsPct / 100;

  const millageRate = clamp(num(inputs.millageRate, getDeveloperMillageForCounty(inputs.county)), 0, 50);
  const annualPropertyTax = roundDollar(purchasePrice * (millageRate / 1000));
  const monthlyTax = roundDollar(annualPropertyTax / 12);
  const monthlyInsurance = Math.max(0, roundDollar(num(inputs.monthlyInsurance, isNewBuild ? 650 : 450)));
  const monthlyUtilities = Math.max(0, roundDollar(num(inputs.monthlyUtilities, isNewBuild ? 450 : 350)));
  const holdingCosts = roundDollar((monthlyTax + monthlyInsurance + monthlyUtilities) * holdMonths);

  const sellCommissionPct = clamp(num(inputs.sellCommissionPct, 5.0), 0, 15);
  const sellClosingPct = clamp(num(inputs.sellClosingPct, 1.0), 0, 10);
  const flDocStampsPct = clamp(num(inputs.flDocStampsPct, FL_DEED_DOC_STAMPS_PCT), 0, 3);
  const sellingCosts =
    roundDollar(exitPrice * (sellCommissionPct / 100)) +
    roundDollar(exitPrice * (sellClosingPct / 100)) +
    roundDollar(exitPrice * (flDocStampsPct / 100));

  const financingMode = ['cash', 'hard_money', 'construction_loan'].includes(inputs.financingMode)
    ? inputs.financingMode
    : 'hard_money';

  let fixedFinancing = 0;
  let marginalFinancingRate = 0;

  if (financingMode !== 'cash') {
    const ltc = clamp(num(inputs.ltcPct, financingMode === 'construction_loan' ? 75 : 80), 0, 95) / 100;
    const rate = clamp(num(inputs.interestRatePct, financingMode === 'construction_loan' ? 9.25 : 11.0), 0, 30) / 100;
    const pts = clamp(num(inputs.pointsPct, financingMode === 'construction_loan' ? 1.5 : 2.0), 0, 10) / 100;
    const lenderFees = Math.max(0, roundDollar(num(inputs.lenderFees, financingMode === 'construction_loan' ? 4500 : 2500)));
    const drawUtil = financingMode === 'construction_loan'
      ? (inputs.drawUtilPct != null
          ? clamp(num(inputs.drawUtilPct, 55), 10, 100) / 100
          : computeWeightedDrawUtilization(inputs.drawSchedule))
      : clamp(num(inputs.drawUtilPct, 60), 10, 100) / 100;
    const flLoanTaxRate = (FL_MORTGAGE_DOC_STAMPS_PCT + FL_INTANGIBLE_TAX_PCT) / 100;
    const financeableMult = financingMode === 'construction_loan' ? (1 + softRate) : 1;

    fixedFinancing = lenderFees + ltc * purchasePrice * (rate * (holdMonths / 12) + pts + flLoanTaxRate);
    marginalFinancingRate = ltc * financeableMult * (drawUtil * rate * (holdMonths / 12) + pts + flLoanTaxRate);
  }

  const fixedProjectCost = purchasePrice + buyClosing + holdingCosts + fixedFinancing;
  const marginalRenoMultiplier = 1 + softRate + marginalFinancingRate;
  const netSaleProceeds = exitPrice - sellingCosts;

  const solveForTarget = (targetRoi) => {
    const maxTotalProjectCost = netSaleProceeds / (1 + targetRoi);
    return (maxTotalProjectCost - fixedProjectCost) / marginalRenoMultiplier;
  };

  const raw10 = solveForTarget(0.10);
  const raw15 = solveForTarget(0.15);
  const breakEvenReno10 = Math.max(0, roundDollar(raw10));
  const breakEvenReno15 = Math.max(0, roundDollar(raw15));

  return {
    breakEvenReno10,
    breakEvenReno15,
    breakEvenReno10PerSqft: afterLivingSqft > 0 ? Math.round(breakEvenReno10 / afterLivingSqft) : null,
    breakEvenReno15PerSqft: afterLivingSqft > 0 ? Math.round(breakEvenReno15 / afterLivingSqft) : null,
    rawBreakEvenReno10: roundDollar(raw10),
    rawBreakEvenReno15: roundDollar(raw15)
  };
}

/**
 * Standardized quick profit range & break-even reno estimate for Flip & Build Finder table rows.
 * - Infers flip rehab tier from hold months + price jump % (editable via developerCosts.js or `rehabOverrides`).
 * - Computes low–high profit range across that tier's min–max $/sf instead of one flat negative number.
 * - Computes break-even renovation budget for 10% profit (and 15% target).
 */
export function estimateQuickFinderProfit(row = {}, rehabOverrides = null) {
  const inputs = buildDefaultDealBreakdownInputs({ finderRow: row });
  const isNewBuild = inputs.dealType === 'demo_new_build';

  let tierKey;
  let tier;
  let minRate;
  let maxRate;
  let midRate;

  if (isNewBuild) {
    tierKey = inputs.newBuildQuality || 'standard';
    tier = NEW_BUILD_QUALITY_TIERS[tierKey] || NEW_BUILD_QUALITY_TIERS.standard;
    minRate = Number(rehabOverrides?.[tierKey]?.min ?? tier.minCostPerSqft ?? tier.costPerSqft);
    maxRate = Number(rehabOverrides?.[tierKey]?.max ?? tier.maxCostPerSqft ?? tier.costPerSqft);
  } else {
    const jumpPct = row.jump_pct != null && Number.isFinite(Number(row.jump_pct))
      ? Number(row.jump_pct)
      : (inputs.purchasePrice > 0 && inputs.exitPrice > inputs.purchasePrice
          ? ((inputs.exitPrice - inputs.purchasePrice) / inputs.purchasePrice) * 100
          : null);
    tierKey = inferFlipRehabLevel({ holdMonths: inputs.holdMonths, jumpPct });
    tier = FLIP_REHAB_LEVELS[tierKey] || FLIP_REHAB_LEVELS.medium;
    const ov = rehabOverrides?.[tierKey];
    minRate = ov?.min != null && Number.isFinite(Number(ov.min)) && Number(ov.min) >= 0
      ? Number(ov.min)
      : tier.minCostPerSqft;
    maxRate = ov?.max != null && Number.isFinite(Number(ov.max)) && Number(ov.max) >= minRate
      ? Number(ov.max)
      : Math.max(minRate, tier.maxCostPerSqft);
  }

  midRate = Math.round((minRate + maxRate) / 2);

  const rateField = isNewBuild ? 'newBuildCostPerSqft' : 'flipRehabCostPerSqft';
  const highEval = evaluateSingleScenario({ ...inputs, [rateField]: minRate }, SCENARIO_OFFSETS.likely);
  const midEval = evaluateSingleScenario({ ...inputs, [rateField]: midRate }, SCENARIO_OFFSETS.likely);
  const lowEval = evaluateSingleScenario({ ...inputs, [rateField]: maxRate }, SCENARIO_OFFSETS.likely);

  const breakEven = calculateBreakEvenReno(inputs);

  return {
    estProfitLow: lowEval.metrics.estProfit,
    estProfit: midEval.metrics.estProfit,
    estProfitHigh: highEval.metrics.estProfit,
    roiPctLow: lowEval.metrics.roiPct,
    roiPct: midEval.metrics.roiPct,
    roiPctHigh: highEval.metrics.roiPct,
    annualizedRoiPct: midEval.metrics.annualizedRoiPct,
    rehabLevel: tierKey,
    rehabLevelShortLabel: tier.shortLabel,
    rehabLevelLabel: `${tier.shortLabel} $${minRate}–$${maxRate}/sf`,
    rehabMinPerSqft: minRate,
    rehabMaxPerSqft: maxRate,
    rehabMidPerSqft: midRate,
    breakEvenReno10: breakEven.breakEvenReno10,
    breakEvenReno15: breakEven.breakEvenReno15,
    breakEvenReno10PerSqft: breakEven.breakEvenReno10PerSqft,
    breakEvenReno15PerSqft: breakEven.breakEvenReno15PerSqft,
    rawBreakEvenReno10: breakEven.rawBreakEvenReno10,
    totalInvested: midEval.costs.totalInvested,
    hardCost: midEval.costs.hardCost,
    dealType: inputs.dealType
  };
}

