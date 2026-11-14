/**
 * Real Estate Valuation & South Florida Appraisal Adjustment Engine
 *
 * Implements:
 * 1. Palm Beach & Broward County Residential Appraisal Adjustment Guide:
 *    - Auto-selected property tiers from unadjusted median comp sale price
 *    - Size-method toggle: 35% of local $/sf vs tier library GLA rate + min variance threshold
 *    - Tier-scaled contributory values (UAD C1–C6 Condition, Windows, Roof, Pool, Garage, Waterfront/View & Lot)
 *    - Strict "Unknown" handling: Unknown condition, windows, roof, pool, garage = $0 adjustment,
 *      "Needs info" chip, and reduced reconciliation weight. Never infers impact windows or roof age from year_built.
 *    - $/sf outlier comps default to OFF in the grid unless manually enabled.
 * 2. Property Appraisal Mathematics & Calculator Specification Guide:
 *    - Strict CIA (Comp Inferior -> Add, +) & CBS (Comp Better -> Subtract, -) sign logic
 *    - Net Adjustment ($ and %), Gross Adjustment ($ and %), Adjusted Sale Price (ASP)
 *    - Fannie Mae 15% Net / 25% Gross guideline deviation flags
 *    - Weighted Reconciliation Engine enforcing |sum(w_i) - 1.0| < 0.0001
 *    - Configurable market-precision rounding ($500 / $1,000 / $5,000)
 */

import {
  normalizeConditionKey,
  normalizeCompDetails,
  computeDetailsProgress,
  formatCountyClues,
  resolveSubjectDetailsForMode,
  ROOF_TYPE_OPTIONS,
  WINDOW_OPTIONS,
  WATERFRONT_VIEW_OPTIONS
} from './compDetailsModel.js';

export const DEFAULT_VALUATION_SETTINGS = {
  sizeFactor: 0.5,             // legacy factor kept for backwards-compatible callers/tests
  bedAdjustment: 10000,        // $ per bedroom difference
  bathAdjustment: 7500,        // $ per bathroom difference
  poolAdjustment: 25000,       // $ value of swimming pool
  garageAdjustment: 10000,     // $ value of garage
  waterfrontAdjustment: 50000, // $ value of waterfront frontage
  lotSqftAdjustment: 5,        // $ per lot sqft difference
  ageAdjustmentPerYear: 1000,  // $ per year built difference (legacy helper only)
  timeTrendMonthlyPct: 0.003   // 0.3% per month market trend default
};

export const COMP_CONDITIONS = {
  c1: {
    key: 'c1',
    uad: 'C1',
    label: 'C1 · New',
    shortLabel: 'New (C1)',
    rank: 3,
    isRenovated: true,
    color: '#3F5A3A',
    bg: '#EEF2EA',
    badgeClass: 'comp-cond-fully-renovated'
  },
  c2: {
    key: 'c2',
    uad: 'C2',
    label: 'Fully renovated',
    shortLabel: 'Renovated (C2)',
    rank: 2,
    isRenovated: true,
    color: '#3F5A3A',
    bg: '#EEF2EA',
    badgeClass: 'comp-cond-fully-renovated'
  },
  fully_renovated: {
    key: 'c2',
    uad: 'C2',
    label: 'Fully renovated',
    shortLabel: 'Renovated (C2)',
    rank: 2,
    isRenovated: true,
    color: '#3F5A3A',
    bg: '#EEF2EA',
    badgeClass: 'comp-cond-fully-renovated'
  },
  c3: {
    key: 'c3',
    uad: 'C3',
    label: 'Updated',
    shortLabel: 'Updated (C3)',
    rank: 1,
    isRenovated: true,
    color: '#3F5A3A',
    bg: '#EEF2EA',
    badgeClass: 'comp-cond-updated'
  },
  updated: {
    key: 'c3',
    uad: 'C3',
    label: 'Updated',
    shortLabel: 'Updated (C3)',
    rank: 1,
    isRenovated: true,
    color: '#3F5A3A',
    bg: '#EEF2EA',
    badgeClass: 'comp-cond-updated'
  },
  c4: {
    key: 'c4',
    uad: 'C4',
    label: 'Original',
    shortLabel: 'Original (C4)',
    rank: 0,
    isRenovated: false,
    color: '#34292A',
    bg: '#F2EFEA',
    badgeClass: 'comp-cond-as-is'
  },
  original: {
    key: 'c4',
    uad: 'C4',
    label: 'Original',
    shortLabel: 'Original (C4)',
    rank: 0,
    isRenovated: false,
    color: '#34292A',
    bg: '#F2EFEA',
    badgeClass: 'comp-cond-as-is'
  },
  as_is: {
    key: 'c4',
    uad: 'C4',
    label: 'Original',
    shortLabel: 'Original (C4)',
    rank: 0,
    isRenovated: false,
    color: '#34292A',
    bg: '#F2EFEA',
    badgeClass: 'comp-cond-as-is'
  },
  c5: {
    key: 'c5',
    uad: 'C5',
    label: 'C5 · Fair',
    shortLabel: 'Fair (C5)',
    rank: -1,
    isRenovated: false,
    color: '#41101B',
    bg: 'rgba(65, 16, 27, 0.08)',
    badgeClass: 'comp-cond-as-is'
  },
  c6: {
    key: 'c6',
    uad: 'C6',
    label: 'C6 · Major rehab',
    shortLabel: 'Poor (C6)',
    rank: -2,
    isRenovated: false,
    color: '#41101B',
    bg: 'rgba(65, 16, 27, 0.12)',
    badgeClass: 'comp-cond-as-is'
  },
  unknown: {
    key: 'unknown',
    uad: null,
    label: 'Unknown',
    shortLabel: 'Unknown',
    rank: null,
    isRenovated: false,
    color: '#6B5F58',
    bg: '#F2EFEA',
    badgeClass: 'comp-cond-unknown'
  }
};

export function getConditionMeta(condKey) {
  const k = String(condKey || 'unknown').toLowerCase().trim();
  if (COMP_CONDITIONS[k]) return COMP_CONDITIONS[k];
  const norm = normalizeConditionKey(k);
  return COMP_CONDITIONS[norm] || COMP_CONDITIONS.unknown;
}

export const SOUTH_FLORIDA_TIERS = {
  entry: {
    key: 'entry',
    name: 'Entry-Level / Condo / Townhome',
    shortChip: 'Entry Tier · <$500k',
    submarkets: 'Western Broward & Palm Beach',
    bandLabel: '$300,000 – $500,000',
    minPrice: 0,
    maxPrice: 500000,
    defaultGlaRate: 60,
    glaRangeLabel: '$45 – $75 / sf',
    defaultMinSqftThreshold: 100,
    multiplier: 0.75
  },
  mid: {
    key: 'mid',
    name: 'Mid-Tier Single-Family',
    shortChip: 'Mid-Tier · $500k–$950k',
    submarkets: 'Plantation, Coral Springs, Boynton, Wellington',
    bandLabel: '$500,000 – $950,000',
    minPrice: 500000,
    maxPrice: 950000,
    defaultGlaRate: 100,
    glaRangeLabel: '$75 – $125 / sf',
    defaultMinSqftThreshold: 100,
    multiplier: 1.0
  },
  upper_mid: {
    key: 'upper_mid',
    name: 'Upper-Mid / Non-Waterfront East',
    shortChip: 'Upper-Mid · $950k–$2M',
    submarkets: 'Boca Raton, Parkland, Fort Lauderdale',
    bandLabel: '$950,000 – $2,000,000',
    minPrice: 950000,
    maxPrice: 2000000,
    defaultGlaRate: 160,
    glaRangeLabel: '$125 – $200 / sf',
    defaultMinSqftThreshold: 125,
    multiplier: 1.45
  },
  luxury: {
    key: 'luxury',
    name: 'Luxury / Deepwater / Coastal',
    shortChip: 'Luxury Tier · $2M+',
    submarkets: 'Palm Beach, Las Olas, Highland Beach',
    bandLabel: '$2,000,000+',
    minPrice: 2000000,
    maxPrice: Infinity,
    defaultGlaRate: 325,
    glaRangeLabel: '$225 – $450+ / sf',
    defaultMinSqftThreshold: 175,
    multiplier: 2.25
  }
};

export const DEFAULT_ADJUSTMENT_LIBRARY = {
  localPpsfFactor: 0.35, // 35% of local $/sf marginal GLA adjustment
  tierScaleEnabled: true,
  glaRates: {
    entry: 60,
    mid: 100,
    upper_mid: 160,
    luxury: 325
  },
  glaMinThresholds: {
    entry: 100,
    mid: 100,
    upper_mid: 125,
    luxury: 175
  },
  // Base Mid-Tier ($500k–$950k) contributory amounts in Palm Beach & Broward
  bedAdjustment: 10000,
  fullBathAdjustment: 13000,       // Guide: $8,000 – $18,000 / bath
  halfBathAdjustment: 6000,        // Guide: $4,000 – $8,000 / half bath
  conditionUpdatedVsAsIs: 22000,   // Minor kitchen refresh + bath update (C3 vs C4)
  conditionRenovatedVsAsIs: 48000, // Full kitchen ($30k) + baths ($18k) (C2 vs C4)
  poolAdjustment: 40000,           // Guide: $30,000 – $50,000 Standard In-Ground Pool
  garageBayAdjustment: 15000,      // Guide: $10,000 – $20,000 / bay
  impactWindowsAdjustment: 25000,  // Guide: $15,000 – $35,000 Full Impact Windows & Doors
  newerRoofAdjustment: 25000,      // Guide: $15,000 – $35,000 Newer Roof (<5 yrs vs older)
  waterfrontAdjustment: 75000,     // Dedicated Location / Site / Waterfront adjustment
  lotSqftRate: 5,                  // $/sf for lot size variance beyond ±500 sf
  lotMinThreshold: 500,
  monthlyMarketTrendPct: 0.25,     // 0.25% per month default market trend
  roundingIncrement: 'auto'        // 'auto' ($1,000 under $1M, $5,000 $1M+), 500, 1000, 5000, or 1
};

export function mergeAdjustmentLibrary(rawLibrary = {}) {
  const src = rawLibrary && typeof rawLibrary === 'object' ? rawLibrary : {};
  return {
    ...DEFAULT_ADJUSTMENT_LIBRARY,
    ...src,
    glaRates: {
      ...DEFAULT_ADJUSTMENT_LIBRARY.glaRates,
      ...(src.glaRates || {})
    },
    glaMinThresholds: {
      ...DEFAULT_ADJUSTMENT_LIBRARY.glaMinThresholds,
      ...(src.glaMinThresholds || {})
    }
  };
}

/**
 * Selects the South Florida submarket tier automatically from the unadjusted
 * median sale price of comparable sales (Guide Section 6).
 */
export function detectSouthFloridaTier(medianCompSalePrice, fallbackSubjectPrice = null) {
  const refPrice = Number(medianCompSalePrice) > 0
    ? Number(medianCompSalePrice)
    : (Number(fallbackSubjectPrice) > 0 ? Number(fallbackSubjectPrice) : 650000);

  if (refPrice < 500000) return SOUTH_FLORIDA_TIERS.entry;
  if (refPrice < 950000) return SOUTH_FLORIDA_TIERS.mid;
  if (refPrice < 2000000) return SOUTH_FLORIDA_TIERS.upper_mid;
  return SOUTH_FLORIDA_TIERS.luxury;
}

/**
 * Rounds reconciled market value per formal appraisal standards:
 * Under $1M -> nearest $1,000 (or $500); $1M+ -> nearest $5,000.
 */
export function roundAppraisalValue(rawValue, roundingSetting = 'auto') {
  const num = Number(rawValue);
  if (!Number.isFinite(num) || num <= 0) return 0;

  let step = 1000;
  if (roundingSetting === 'auto') {
    step = num >= 1000000 ? 5000 : 1000;
  } else {
    const parsed = Number(roundingSetting);
    step = Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
  }
  return Math.round(num / step) * step;
}

/**
 * Enforces |sum(w_i) - 1.0| < 0.0001 on fractional weights (or sumPct == 100 within 0.01%).
 */
export function validateWeightsSum(weightsFractional = []) {
  if (!Array.isArray(weightsFractional) || weightsFractional.length === 0) {
    return { valid: false, sum: 0, diff: 1 };
  }
  const sum = weightsFractional.reduce((acc, w) => acc + (Number(w) || 0), 0);
  const diff = Math.abs(sum - 1.0);
  return {
    valid: diff < 0.0001,
    sum,
    diff
  };
}

/**
 * Normalizes an array of non-negative weights so their sum is strictly 1.0000
 * (and integer/1-decimal percentages sum cleanly to 100.0%).
 */
export function normalizeReconciliationWeights(rawWeights = []) {
  const n = rawWeights.length;
  if (n === 0) return [];

  const clean = rawWeights.map((w) => Math.max(0, Number(w) || 0));
  const total = clean.reduce((a, b) => a + b, 0);

  if (total <= 0) {
    const equal = 1 / n;
    return clean.map((_, idx) => (idx === n - 1 ? 1 - equal * (n - 1) : equal));
  }

  const normalized = clean.map((w) => w / total);
  const sumExceptLast = normalized.slice(0, n - 1).reduce((a, b) => a + b, 0);
  normalized[n - 1] = Math.max(0, 1 - sumExceptLast);
  return normalized;
}

export function computeMonthsSinceSale(soldDateStr, effectiveDate = new Date()) {
  if (!soldDateStr) return 0;
  const raw = String(soldDateStr).trim();
  const effYear = effectiveDate.getFullYear();
  const effMonth = effectiveDate.getMonth() + 1;

  // Parse ISO YYYY-MM(-DD) directly to avoid UTC midnight -> local timezone month shift
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (isoMatch) {
    const saleYear = Number(isoMatch[1]);
    const saleMonth = Number(isoMatch[2]);
    if (saleYear > 1900 && saleMonth >= 1 && saleMonth <= 12) {
      return Math.max(0, (effYear - saleYear) * 12 + (effMonth - saleMonth));
    }
  }

  const saleD = new Date(raw);
  if (isNaN(saleD.getTime())) return 0;
  return Math.max(
    0,
    (effYear - saleD.getUTCFullYear()) * 12 + (effMonth - (saleD.getUTCMonth() + 1))
  );
}

function formatBathDisplay(details) {
  if (details.full_baths != null && details.half_baths != null && details.half_baths > 0) {
    return `${details.full_baths}f ${details.half_baths}h ba`;
  }
  if (details.full_baths != null) {
    return `${details.full_baths} ba`;
  }
  if (details.baths != null) {
    return `${details.baths} ba`;
  }
  return null;
}

function formatWindowsLabel(windowsKey) {
  const found = WINDOW_OPTIONS.find((o) => o.id === windowsKey);
  return found ? found.label : 'Unknown';
}

function formatRoofSpecLabel(details) {
  const typeObj = ROOF_TYPE_OPTIONS.find((o) => o.id === details.roof_type && o.id !== 'unknown');
  const yrStr = details.roof_year != null ? `${details.roof_year}` : null;
  if (!typeObj && !yrStr) return 'Unknown';
  return [typeObj ? typeObj.label : null, yrStr ? `Roof ${yrStr}` : null].filter(Boolean).join(' · ');
}

function formatPoolSpecLabel(details) {
  if (details.pool_type === 'unknown') return 'Unknown';
  if (details.pool_type === 'none') return 'No pool';
  const base = details.pool_type === 'resort' ? 'Resort pool' : 'Standard pool';
  if (details.screen_enclosure === true) return `${base} · Screen`;
  if (details.screen_enclosure === false) return `${base} · Open`;
  return base;
}

function formatGarageSpecLabel(details) {
  if (details.garage_type === 'unknown') return 'Unknown';
  if (details.garage_type === 'none') return 'None';
  if (details.garage_type === 'carport') return 'Carport';
  if (details.garage_type === 'converted') return 'Converted';
  const bays = details.garage_bays ?? 2;
  return bays > 0 ? `${bays}-Car` : 'None';
}

function formatWaterfrontSpecLabel(details, lotSqft) {
  const wfObj = WATERFRONT_VIEW_OPTIONS.find((o) => o.id === details.waterfront_view && o.id !== 'unknown');
  const lotPart = lotSqft > 0 ? `${lotSqft.toLocaleString()} sf` : null;
  if (!wfObj && !lotPart) return 'Unknown';
  return [wfObj ? wfObj.label : 'View n/a', lotPart].filter(Boolean).join(' · ');
}

/**
 * Determines whether a comp is included (USED) in reconciliation.
 * Comps flagged as $/sf outliers default to OFF unless explicitly included === true.
 */
export function resolveCompIsIncluded(comp) {
  if (!comp) return false;
  if (comp.included === true) return true;
  if (comp.included === false) return false;
  return comp.is_outlier ? false : true;
}

/**
 * Full South Florida Sales Comparison & Reconciliation Grid Engine.
 * Evaluates all comps (USED and OFF), computes CIA/CBS directional cells,
 * enforces Net <= 15% / Gross <= 25% checks, and reconciles weighted value.
 */
export function computeAppraisalGrid({
  comps = [],
  subject = {},
  mode = 'as_is',          // 'as_is' | 'arv'
  sizeMethod = 'local_35', // 'local_35' | 'library'
  library: rawLibrary = {},
  customWeights = null,    // optional { [compId]: number (percentage 0..100) }
  zipTrendMonthlyPct = null,
  zipTrendSource = null,
  zipRatioStats = null,
  effectiveDate = new Date()
} = {}) {
  const library = mergeAdjustmentLibrary(rawLibrary);
  const effYear = effectiveDate.getFullYear();

  // Valid comps with a sale price
  const validComps = comps.filter((c) => c && Number(c.sold_price) > 0);
  const usedCompsRaw = validComps.filter((c) => resolveCompIsIncluded(c));

  // Median unadjusted sale price & local $/sf from USED comps (fallback to all valid comps)
  const pricePool = (usedCompsRaw.length > 0 ? usedCompsRaw : validComps)
    .map((c) => Number(c.sold_price))
    .filter((n) => n > 0);
  const medianUnadjustedPrice = calculateMedian(pricePool);

  const ppsfPool = (usedCompsRaw.length > 0 ? usedCompsRaw : validComps)
    .map((c) => {
      if (Number(c.price_per_sqft) > 0) return Number(c.price_per_sqft);
      if (Number(c.sold_price) > 0 && Number(c.sqft) > 0) return Number(c.sold_price) / Number(c.sqft);
      return null;
    })
    .filter((n) => n != null && n > 0);
  const localMedianPpsf = calculateMedian(ppsfPool);

  // Auto-detect South Florida Tier (Guide Section 6)
  const tier = detectSouthFloridaTier(medianUnadjustedPrice, subject?.list_price);
  const tierScale = library.tierScaleEnabled !== false ? tier.multiplier : 1.0;

  // Determine GLA $/sf rate & minimum threshold
  const libraryGlaRate = Number(library.glaRates?.[tier.key]) || tier.defaultGlaRate;
  const minGlaThreshold = Number(library.glaMinThresholds?.[tier.key]) ?? tier.defaultMinSqftThreshold;
  const localFactor = Number(library.localPpsfFactor) > 0 ? Number(library.localPpsfFactor) : 0.35;

  const activeGlaRate = sizeMethod === 'local_35' && localMedianPpsf > 0
    ? Math.round(localMedianPpsf * localFactor)
    : Math.round(libraryGlaRate);

  // Scaled contributory library line items (rounded to nearest $500)
  const scaleAmt = (val) => Math.round((Number(val) * tierScale) / 500) * 500;
  const effectiveRates = {
    glaRate: activeGlaRate,
    minGlaThreshold,
    bed: scaleAmt(library.bedAdjustment),
    fullBath: scaleAmt(library.fullBathAdjustment),
    halfBath: scaleAmt(library.halfBathAdjustment),
    condUpdatedVsAsIs: scaleAmt(library.conditionUpdatedVsAsIs),
    condRenovatedVsAsIs: scaleAmt(library.conditionRenovatedVsAsIs),
    pool: scaleAmt(library.poolAdjustment),
    screenEnclosure: scaleAmt(6000),
    garageBay: scaleAmt(library.garageBayAdjustment),
    impactWindows: scaleAmt(library.impactWindowsAdjustment),
    shutters: Math.round((scaleAmt(library.impactWindowsAdjustment) * 0.4) / 500) * 500,
    newerRoof: scaleAmt(library.newerRoofAdjustment),
    waterfront: scaleAmt(library.waterfrontAdjustment),
    lotSqftRate: Number(library.lotSqftRate) || 5,
    lotMinThreshold: Number(library.lotMinThreshold) || 500,
    monthlyTrendPct: zipTrendMonthlyPct != null && !isNaN(Number(zipTrendMonthlyPct))
      ? Math.round(Number(zipTrendMonthlyPct) * 10000) / 100
      : (library.monthlyMarketTrendPct != null && !isNaN(Number(library.monthlyMarketTrendPct))
          ? Number(library.monthlyMarketTrendPct)
          : 0.25)
  };

  // Resolve Subject Details for active mode ('as_is' vs 'arv')
  const subjectDetails = resolveSubjectDetailsForMode(subject, mode);
  const subjectSqft = Number(subject?.sqft) || 0;
  const subjectLotSqft = Number(subject?.lot_sqft) || 0;
  const subjectCondMeta = getConditionMeta(subjectDetails.condition);

  // Contributory value functions (only called when BOTH subject and comp values are known)
  const conditionContributory = (condKey) => {
    const k = normalizeConditionKey(condKey);
    if (k === 'c1') return Math.round((effectiveRates.condRenovatedVsAsIs * 1.25) / 500) * 500;
    if (k === 'c2') return effectiveRates.condRenovatedVsAsIs;
    if (k === 'c3') return effectiveRates.condUpdatedVsAsIs;
    if (k === 'c4') return 0;
    if (k === 'c5') return -Math.round((effectiveRates.condUpdatedVsAsIs * 0.6) / 500) * 500;
    if (k === 'c6') return -effectiveRates.condRenovatedVsAsIs;
    return 0;
  };

  const windowsContributory = (winKey) => {
    if (winKey === 'impact') return effectiveRates.impactWindows;
    if (winKey === 'shutters') return effectiveRates.shutters;
    return 0;
  };

  const roofAgeContributory = (roofYear) => {
    if (roofYear == null) return 0;
    const age = Math.max(0, effYear - Number(roofYear));
    if (age <= 5) return effectiveRates.newerRoof;
    if (age <= 12) return Math.round((effectiveRates.newerRoof * 0.45) / 500) * 500;
    return 0;
  };

  const roofMaterialContributory = (roofType) => {
    if (roofType === 'metal' || roofType === 'barrel_tile') {
      return Math.round((effectiveRates.newerRoof * 0.35) / 500) * 500;
    }
    return 0;
  };

  const poolBaseContributory = (poolType) => {
    if (poolType === 'resort') return Math.round((effectiveRates.pool * 1.45) / 500) * 500;
    if (poolType === 'standard') return effectiveRates.pool;
    return 0;
  };

  const garageContributory = (details) => {
    if (details.garage_type === 'garage') {
      return Math.max(0, Number(details.garage_bays ?? 2)) * effectiveRates.garageBay;
    }
    if (details.garage_type === 'carport') {
      return Math.round((effectiveRates.garageBay * 0.45) / 500) * 500;
    }
    if (details.garage_type === 'converted') {
      return Math.round((effectiveRates.garageBay * 0.35) / 500) * 500;
    }
    return 0;
  };

  const waterfrontContributory = (wfView) => {
    if (wfView === 'ocean_access') return Math.round((effectiveRates.waterfront * 1.8) / 500) * 500;
    if (wfView === 'canal_fixed_bridge') return effectiveRates.waterfront;
    if (wfView === 'lake') return Math.round((effectiveRates.waterfront * 0.5) / 500) * 500;
    if (wfView === 'golf') return Math.round((effectiveRates.waterfront * 0.35) / 500) * 500;
    return 0;
  };

  // Evaluate every comp (preserving order)
  const evaluatedComps = comps.map((comp) => {
    const isUsed = resolveCompIsIncluded(comp) && Number(comp.sold_price) > 0;
    const soldPrice = Number(comp.sold_price) || 0;
    const compSqft = Number(comp.sqft) || 0;
    const compPpsf = soldPrice > 0 && compSqft > 0 ? Math.round(soldPrice / compSqft) : null;
    const monthsSinceSale = computeMonthsSinceSale(comp.sold_date, effectiveDate);
    const isOlderThan6Months = Boolean(comp.sold_date && monthsSinceSale > 6);

    const compDetails = normalizeCompDetails(comp, {
      treatLegacyUneditedCountyBooleansAsUnknown: true
    });
    const detailsProgress = computeDetailsProgress(compDetails);
    const countyClues = comp.county_clues || formatCountyClues(comp);
    const condMeta = getConditionMeta(compDetails.condition);

    const overrides = (comp.adjustments && typeof comp.adjustments === 'object' && comp.adjustments.overrides)
      ? comp.adjustments.overrides
      : {};

    const resolveCell = (rowKey, computedAmount, compSpecLabel, { note = '', needsInfo = false } = {}) => {
      const hasOverride = overrides[rowKey] != null && overrides[rowKey] !== '' && !isNaN(Number(overrides[rowKey]));
      const amount = hasOverride ? Math.round(Number(overrides[rowKey])) : Math.round(computedAmount);
      return {
        key: rowKey,
        amount,
        computedAmount: Math.round(computedAmount),
        isOverridden: hasOverride,
        needsInfo: Boolean(needsInfo && !hasOverride),
        direction: amount > 0 ? 'add' : amount < 0 ? 'subtract' : 'neutral',
        spec: compSpecLabel,
        note
      };
    };

    // 1. Time / Market Conditions (monthly ZIP trend applies to every comp)
    const monthlyDecimal = effectiveRates.monthlyTrendPct / 100;
    const exactTimeAdj = soldPrice > 0 && monthsSinceSale > 0
      ? soldPrice * monthlyDecimal * monthsSinceSale
      : 0;
    const rawTimeAdj = Math.abs(exactTimeAdj) >= 100
      ? Math.round(exactTimeAdj / 100) * 100
      : Math.round(exactTimeAdj);
    const trendSign = effectiveRates.monthlyTrendPct > 0 ? '+' : '';
    const timeCell = resolveCell(
      'time',
      rawTimeAdj,
      comp.sold_date ? (monthsSinceSale === 0 ? 'this mo' : `${monthsSinceSale} mo ago`) : 'Date n/a',
      {
        note: comp.sold_date && monthsSinceSale > 0 && effectiveRates.monthlyTrendPct !== 0
          ? `${trendSign}${effectiveRates.monthlyTrendPct}%/mo`
          : ''
      }
    );

    // 2. Gross Living Area (GLA) with South Florida minimum threshold
    const sqftDiff = subjectSqft > 0 && compSqft > 0 ? subjectSqft - compSqft : 0;
    const withinGlaThreshold = subjectSqft > 0 && compSqft > 0 && Math.abs(sqftDiff) < effectiveRates.minGlaThreshold;
    const rawGlaAdj = (subjectSqft > 0 && compSqft > 0 && !withinGlaThreshold)
      ? Math.round((sqftDiff * effectiveRates.glaRate) / 100) * 100
      : 0;
    const glaCell = resolveCell(
      'gla',
      rawGlaAdj,
      compSqft > 0 ? `${compSqft.toLocaleString()} sf` : '—',
      {
        note: withinGlaThreshold && sqftDiff !== 0 ? `<${effectiveRates.minGlaThreshold} sf threshold` : ''
      }
    );

    // 3. Bedrooms & Bathrooms (Full + Half bath awareness)
    const compBeds = compDetails.beds;
    const subBeds = subjectDetails.beds;
    const compBathUnknown = compDetails.full_baths == null && compDetails.baths == null;
    const compBedBathAllUnknown = compBeds == null && compBathUnknown;

    let rawBedBathAdj = 0;
    if (subBeds != null && compBeds != null) {
      rawBedBathAdj += (subBeds - compBeds) * effectiveRates.bed;
    }
    if (subjectDetails.full_baths != null && compDetails.full_baths != null) {
      rawBedBathAdj += (subjectDetails.full_baths - compDetails.full_baths) * effectiveRates.fullBath;
      rawBedBathAdj += ((subjectDetails.half_baths ?? 0) - (compDetails.half_baths ?? 0)) * effectiveRates.halfBath;
    } else if (subjectDetails.baths != null && compDetails.baths != null) {
      const bathDiff = subjectDetails.baths - compDetails.baths;
      const sign = bathDiff >= 0 ? 1 : -1;
      const absDiff = Math.abs(bathDiff);
      const fullCount = Math.floor(absDiff + 1e-6);
      const hasHalf = Math.abs(absDiff - fullCount - 0.5) < 0.26;
      rawBedBathAdj += sign * (fullCount * effectiveRates.fullBath + (hasHalf ? effectiveRates.halfBath : 0));
    }

    const bedBathSpec = [
      compBeds != null ? `${compBeds} bd` : null,
      formatBathDisplay(compDetails)
    ].filter(Boolean).join(' / ') || 'Unknown';

    const bedBathCell = resolveCell('bed_bath', rawBedBathAdj, bedBathSpec, {
      needsInfo: compBedBathAllUnknown
    });

    // 4. Condition (UAD C1–C6): Unknown = $0 adjustment + "Needs info" chip + weight reduced
    const isConditionUnknown = compDetails.condition === 'unknown';
    const rawCondAdj = (!isConditionUnknown && subjectDetails.condition !== 'unknown')
      ? conditionContributory(subjectDetails.condition) - conditionContributory(compDetails.condition)
      : 0;
    const condNote = !isConditionUnknown && typeof compDetails.kitchen_baths_updated === 'boolean'
      ? (compDetails.kitchen_baths_updated ? 'K&B updated' : 'Orig. K&B')
      : '';
    const conditionCell = resolveCell(
      'condition',
      rawCondAdj,
      isConditionUnknown ? 'Unknown' : condMeta.shortLabel,
      { note: condNote, needsInfo: isConditionUnknown }
    );

    // 5. Windows (impact / shutters / none): Unknown = $0 adjustment + "Needs info" chip + weight reduced
    // Never infer impact windows from year_built!
    const isWindowsUnknown = compDetails.windows === 'unknown';
    const rawWindowsAdj = (!isWindowsUnknown && subjectDetails.windows !== 'unknown')
      ? windowsContributory(subjectDetails.windows) - windowsContributory(compDetails.windows)
      : 0;
    const windowsCell = resolveCell(
      'windows',
      rawWindowsAdj,
      isWindowsUnknown ? 'Unknown' : formatWindowsLabel(compDetails.windows),
      {
        note: !isWindowsUnknown && subjectDetails.windows === 'unknown' ? 'Set subject windows' : '',
        needsInfo: isWindowsUnknown
      }
    );

    // 6. Roof (type + roof year): Unknown = $0 adjustment + "Needs info" chip + weight reduced
    // Never infer roof age from year_built!
    const isRoofUnknown = compDetails.roof_type === 'unknown' && compDetails.roof_year == null;
    let rawRoofAdj = 0;
    if (!isRoofUnknown) {
      if (subjectDetails.roof_year != null && compDetails.roof_year != null) {
        rawRoofAdj += roofAgeContributory(subjectDetails.roof_year) - roofAgeContributory(compDetails.roof_year);
      }
      if (subjectDetails.roof_type !== 'unknown' && compDetails.roof_type !== 'unknown') {
        rawRoofAdj += roofMaterialContributory(subjectDetails.roof_type) - roofMaterialContributory(compDetails.roof_type);
      }
    }
    const roofCell = resolveCell(
      'roof',
      rawRoofAdj,
      isRoofUnknown ? 'Unknown' : formatRoofSpecLabel(compDetails),
      {
        note: !isRoofUnknown && compDetails.roof_year == null ? 'Roof yr not set' : '',
        needsInfo: isRoofUnknown
      }
    );

    // 7. Pool & Outdoor: Unknown = $0 adjustment + "Needs info" chip + weight reduced
    const isPoolUnknown = compDetails.pool_type === 'unknown';
    let rawPoolAdj = 0;
    if (!isPoolUnknown && subjectDetails.pool_type !== 'unknown') {
      rawPoolAdj += poolBaseContributory(subjectDetails.pool_type) - poolBaseContributory(compDetails.pool_type);
      if (
        typeof subjectDetails.screen_enclosure === 'boolean' &&
        typeof compDetails.screen_enclosure === 'boolean' &&
        (subjectDetails.pool_type !== 'none' || compDetails.pool_type !== 'none')
      ) {
        const subEnc = subjectDetails.pool_type !== 'none' && subjectDetails.screen_enclosure ? 1 : 0;
        const compEnc = compDetails.pool_type !== 'none' && compDetails.screen_enclosure ? 1 : 0;
        rawPoolAdj += (subEnc - compEnc) * effectiveRates.screenEnclosure;
      }
    }
    const poolCell = resolveCell(
      'pool',
      rawPoolAdj,
      isPoolUnknown ? 'Unknown' : formatPoolSpecLabel(compDetails),
      { needsInfo: isPoolUnknown }
    );

    // 8. Garage & Parking: Unknown = $0 adjustment + "Needs info" chip + weight reduced
    const isGarageUnknown = compDetails.garage_type === 'unknown';
    const rawGarageAdj = (!isGarageUnknown && subjectDetails.garage_type !== 'unknown')
      ? garageContributory(subjectDetails) - garageContributory(compDetails)
      : 0;
    const garageCell = resolveCell(
      'garage',
      rawGarageAdj,
      isGarageUnknown ? 'Unknown' : formatGarageSpecLabel(compDetails),
      { needsInfo: isGarageUnknown }
    );

    // 9. Location / Waterfront & View / Lot Size
    const isWaterfrontUnknown = compDetails.waterfront_view === 'unknown';
    const compLotSqft = Number(comp.lot_sqft) || 0;
    const lotDiff = subjectLotSqft > 0 && compLotSqft > 0 ? subjectLotSqft - compLotSqft : 0;
    const lotAdjPart = Math.abs(lotDiff) >= effectiveRates.lotMinThreshold
      ? Math.round((lotDiff * effectiveRates.lotSqftRate) / 500) * 500
      : 0;
    const waterAdjPart = (!isWaterfrontUnknown && subjectDetails.waterfront_view !== 'unknown')
      ? waterfrontContributory(subjectDetails.waterfront_view) - waterfrontContributory(compDetails.waterfront_view)
      : 0;
    const locationSiteCell = resolveCell(
      'location_site',
      lotAdjPart + waterAdjPart,
      formatWaterfrontSpecLabel(compDetails, compLotSqft),
      { needsInfo: isWaterfrontUnknown && compLotSqft <= 0 }
    );

    const cells = {
      time: timeCell,
      gla: glaCell,
      bed_bath: bedBathCell,
      condition: conditionCell,
      windows: windowsCell,
      roof: roofCell,
      pool: poolCell,
      garage: garageCell,
      location_site: locationSiteCell
    };

    const cellList = Object.values(cells);
    const netAdjustment = cellList.reduce((sum, cell) => sum + cell.amount, 0);
    const grossAdjustment = cellList.reduce((sum, cell) => sum + Math.abs(cell.amount), 0);
    const adjustedPrice = soldPrice > 0 ? soldPrice + netAdjustment : 0;
    const adjustedPpsf = adjustedPrice > 0 && (subjectSqft > 0 || compSqft > 0)
      ? Math.round(adjustedPrice / (subjectSqft || compSqft))
      : null;

    const netAdjustmentPct = soldPrice > 0 ? (Math.abs(netAdjustment) / soldPrice) * 100 : 0;
    const grossAdjustmentPct = soldPrice > 0 ? (grossAdjustment / soldPrice) * 100 : 0;
    const isHighNet = netAdjustmentPct > 15;
    const isHighGross = grossAdjustmentPct > 25;

    // Count unknown core features (condition, windows, roof, pool, garage) -> reduce weight
    const unknownFeatureKeys = [
      isConditionUnknown ? 'condition' : null,
      isWindowsUnknown ? 'windows' : null,
      isRoofUnknown ? 'roof' : null,
      isPoolUnknown ? 'pool' : null,
      isGarageUnknown ? 'garage' : null
    ].filter(Boolean);
    const unknownFeatureCount = unknownFeatureKeys.length;
    const wCompleteness = Math.pow(0.80, unknownFeatureCount);

    // Auto-weight score (higher for closer, more recent, lower gross %, condition match, and verified features;
    // comps older than 6 months and comps with unknown features have reduced reconciliation weight)
    const distMi = comp.distance_mi != null && !isNaN(Number(comp.distance_mi)) ? Number(comp.distance_mi) : 0.5;
    const wRecency = (1 / (1 + monthsSinceSale / 6)) * (isOlderThan6Months ? 0.55 : 1.0);
    const wDistance = 1 / (1 + distMi / 0.5);
    const wGross = 1 / (1 + grossAdjustmentPct / 12);
    const wConditionParity = isConditionUnknown
      ? 0.85
      : ((mode === 'arv' ? condMeta.isRenovated : !condMeta.isRenovated) ? 1.25 : 0.8);
    const rawAutoScore = isUsed
      ? Math.max(0.005, wRecency * wDistance * wGross * wConditionParity * wCompleteness)
      : 0;

    return {
      ...comp,
      isUsed,
      isOutlier: Boolean(comp.is_outlier || comp.adjustments?.is_outlier),
      outlierReason: comp.outlier_reason || comp.adjustments?.outlier_reason || null,
      soldPrice,
      compSqft,
      compPpsf,
      monthsSinceSale,
      isOlderThan6Months,
      distanceMi: distMi,
      conditionMeta: condMeta,
      compDetails,
      detailsProgress,
      countyClues,
      unknownFeatureKeys,
      unknownFeatureCount,
      cells,
      netAdjustment,
      grossAdjustment,
      adjustedPrice,
      adjustedPpsf,
      netAdjustmentPct: Math.round(netAdjustmentPct * 10) / 10,
      grossAdjustmentPct: Math.round(grossAdjustmentPct * 10) / 10,
      isHighNet,
      isHighGross,
      rawAutoScore,
      autoWeight: 0,
      weight: 0,
      weightPct: 0
    };
  });

  // Compute auto-weights normalized across USED comps
  const usedEvaluated = evaluatedComps.filter((c) => c.isUsed);
  const autoNormalized = normalizeReconciliationWeights(usedEvaluated.map((c) => c.rawAutoScore));
  usedEvaluated.forEach((c, idx) => {
    c.autoWeight = autoNormalized[idx] || 0;
  });

  // Apply customWeights if provided, else use autoWeight
  const hasCustomWeights = customWeights && typeof customWeights === 'object' &&
    usedEvaluated.some((c) => customWeights[c.id] != null && customWeights[c.id] !== '');

  if (hasCustomWeights && usedEvaluated.length > 0) {
    usedEvaluated.forEach((c) => {
      const pct = customWeights[c.id] != null ? Math.max(0, Number(customWeights[c.id]) || 0) : Math.round(c.autoWeight * 1000) / 10;
      c.weightPct = Math.round(pct * 10) / 10;
      c.weight = pct / 100;
    });
  } else if (usedEvaluated.length > 0) {
    // Round display percentages cleanly so they sum to 100.0%
    let runningPct = 0;
    usedEvaluated.forEach((c, idx) => {
      if (idx === usedEvaluated.length - 1) {
        c.weightPct = Math.max(0, Math.round((100 - runningPct) * 10) / 10);
      } else {
        c.weightPct = Math.round(c.autoWeight * 1000) / 10;
        runningPct += c.weightPct;
      }
      c.weight = c.weightPct / 100;
    });
  }

  const weightValidation = usedEvaluated.length > 0
    ? validateWeightsSum(usedEvaluated.map((c) => c.weight))
    : { valid: false, sum: 0, diff: 1 };

  // Reconciled Value, Range & $/sf
  let rawReconciledValue = null;
  let reconciledValue = null;
  let rangeLow = null;
  let rangeHigh = null;
  let reconciledPpsf = null;

  if (usedEvaluated.length > 0 && weightValidation.valid) {
    rawReconciledValue = usedEvaluated.reduce((acc, c) => acc + c.adjustedPrice * c.weight, 0);
    reconciledValue = roundAppraisalValue(rawReconciledValue, library.roundingIncrement);

    const sortedAdjusted = usedEvaluated.map((c) => c.adjustedPrice).sort((a, b) => a - b);
    rangeLow = roundAppraisalValue(sortedAdjusted[0], library.roundingIncrement);
    rangeHigh = roundAppraisalValue(sortedAdjusted[sortedAdjusted.length - 1], library.roundingIncrement);

    if (subjectSqft > 0 && reconciledValue > 0) {
      reconciledPpsf = Math.round(reconciledValue / subjectSqft);
    }
  }

  // Confidence Score & Bar (0-100) + Guideline Checks
  const renovatedUsedCount = usedEvaluated.filter((c) => c.conditionMeta.isRenovated).length;
  const highNetComps = usedEvaluated.filter((c) => c.isHighNet);
  const highGrossComps = usedEvaluated.filter((c) => c.isHighGross);
  const compsMissingInfo = usedEvaluated.filter((c) => c.unknownFeatureCount > 0);

  const usedSqfts = usedEvaluated.map((c) => c.compSqft).filter((s) => s > 0);
  const isBracketedGla = subjectSqft > 0 && usedSqfts.length >= 2 &&
    Math.min(...usedSqfts) <= subjectSqft && Math.max(...usedSqfts) >= subjectSqft;

  const avgDist = usedEvaluated.length > 0
    ? usedEvaluated.reduce((a, c) => a + c.distanceMi, 0) / usedEvaluated.length
    : null;
  const avgMonths = usedEvaluated.length > 0
    ? usedEvaluated.reduce((a, c) => a + c.monthsSinceSale, 0) / usedEvaluated.length
    : null;
  const avgGrossPct = usedEvaluated.length > 0
    ? usedEvaluated.reduce((a, c) => a + c.grossAdjustmentPct, 0) / usedEvaluated.length
    : null;

  // $/sf dispersion (CV) on adjusted prices
  const adjPpsfList = usedEvaluated
    .map((c) => (c.compSqft > 0 ? c.adjustedPrice / c.compSqft : null))
    .filter((v) => v != null && v > 0);
  let cvPct = 0;
  if (adjPpsfList.length >= 2) {
    const mean = adjPpsfList.reduce((a, b) => a + b, 0) / adjPpsfList.length;
    const variance = adjPpsfList.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / adjPpsfList.length;
    cvPct = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
  }

  // Compute numeric confidencePct (0..100)
  let confidencePct = 20;
  if (usedEvaluated.length === 0) {
    confidencePct = 0;
  } else {
    confidencePct = 35;
    if (usedEvaluated.length >= 3) confidencePct += 25;
    else if (usedEvaluated.length === 2) confidencePct += 12;

    if (highNetComps.length === 0 && highGrossComps.length === 0) confidencePct += 15;
    else if (highGrossComps.length === 0) confidencePct += 7;

    if (cvPct <= 10) confidencePct += 10;
    else if (cvPct <= 18) confidencePct += 5;

    if (avgDist != null && avgDist <= 0.6) confidencePct += 8;
    else if (avgDist != null && avgDist <= 1.0) confidencePct += 4;

    if (avgMonths != null && avgMonths <= 6) confidencePct += 7;
    else if (avgMonths != null && avgMonths <= 12) confidencePct += 3;

    // Slight confidence deduction if comps still have all 5 features unknown
    const avgUnknowns = usedEvaluated.reduce((a, c) => a + c.unknownFeatureCount, 0) / usedEvaluated.length;
    if (avgUnknowns >= 4) confidencePct -= 8;
    else if (avgUnknowns >= 2.5) confidencePct -= 4;

    if (mode === 'arv' && renovatedUsedCount === 0) {
      confidencePct = Math.min(confidencePct, 42);
    }
    if (!weightValidation.valid) {
      confidencePct = Math.min(confidencePct, 30);
    }
    confidencePct = Math.max(8, Math.min(98, Math.round(confidencePct)));
  }

  const confidenceScore = confidencePct >= 75 ? 'High' : confidencePct >= 50 ? 'Medium' : 'Low';

  // County Just Value Check
  const subjectJustValue = Number(subject?.just_value) || 0;
  let justValueCheck = null;
  if (subjectJustValue > 0 && reconciledValue > 0) {
    const ratio = reconciledValue / subjectJustValue;
    const lowBound = zipRatioStats?.p25Ratio ? zipRatioStats.p25Ratio * 0.85 : 0.95;
    const highBound = zipRatioStats?.p75Ratio ? zipRatioStats.p75Ratio * 1.15 : (mode === 'arv' ? 1.85 : 1.55);
    const inRange = ratio >= lowBound && ratio <= highBound;
    justValueCheck = {
      id: 'just_value',
      status: inRange ? 'pass' : 'warn',
      label: 'County Just Value Sanity Check',
      detail: `${ratio.toFixed(2)}× county just value ($${Math.round(subjectJustValue).toLocaleString()})${inRange ? ' — within South FL market band' : ' — verify condition/lot premium'}`
    };
  }

  // Structured USPAP / Fannie Mae Checks
  const checks = [
    {
      id: 'comp_count',
      status: usedEvaluated.length >= 3 ? 'pass' : usedEvaluated.length > 0 ? 'warn' : 'fail',
      label: 'Minimum 3 Comparable Sales',
      detail: usedEvaluated.length >= 3
        ? `${usedEvaluated.length} active comps USED in reconciliation`
        : `${usedEvaluated.length} of 3 recommended comps USED`
    },
    {
      id: 'comp_details_completeness',
      status: usedEvaluated.length > 0 && compsMissingInfo.length === 0 ? 'pass' : 'warn',
      label: 'Verified Comp Features',
      detail: usedEvaluated.length === 0
        ? 'Add comps and confirm condition, windows, roof, pool & garage'
        : compsMissingInfo.length === 0
          ? 'Condition, windows, roof, pool & garage confirmed on all USED comps'
          : `${compsMissingInfo.length} USED ${compsMissingInfo.length === 1 ? 'comp has' : 'comps have'} "Needs info" features ($0 adj · weight reduced)`
    },
    {
      id: 'fannie_mae_net_gross',
      status: usedEvaluated.length === 0
        ? 'warn'
        : (highNetComps.length === 0 && highGrossComps.length === 0 ? 'pass' : 'warn'),
      label: 'Net ≤ 15% · Gross ≤ 25% Guideline',
      detail: usedEvaluated.length === 0
        ? 'Add comps to evaluate adjustment ratios'
        : (highNetComps.length === 0 && highGrossComps.length === 0
          ? `All USED comps within Fannie Mae limits (avg ${(avgGrossPct || 0).toFixed(1)}% gross)`
          : `${highNetComps.length > 0 ? `${highNetComps.length} >15% net` : ''}${highNetComps.length > 0 && highGrossComps.length > 0 ? ' · ' : ''}${highGrossComps.length > 0 ? `${highGrossComps.length} >25% gross` : ''} — reduce weight on dissimilar comps`)
    },
    {
      id: 'gla_bracketing',
      status: usedSqfts.length < 2 ? 'warn' : (isBracketedGla ? 'pass' : 'warn'),
      label: 'GLA Bracketing & Min Threshold',
      detail: subjectSqft <= 0
        ? 'Enter subject living sqft to verify GLA bracketing'
        : usedSqfts.length < 2
          ? 'Need ≥ 2 comps to bracket subject living area'
          : isBracketedGla
            ? `Comps bracket ${subjectSqft.toLocaleString()} sf (${Math.min(...usedSqfts).toLocaleString()}–${Math.max(...usedSqfts).toLocaleString()} sf · ±${effectiveRates.minGlaThreshold} sf min)`
            : `Subject ${subjectSqft.toLocaleString()} sf lies outside comp range (${Math.min(...usedSqfts).toLocaleString()}–${Math.max(...usedSqfts).toLocaleString()} sf)`
    },
    {
      id: 'recency_proximity',
      status: usedEvaluated.length === 0
        ? 'warn'
        : ((avgDist ?? 0) <= 1.0 && usedEvaluated.every((c) => !c.isOlderThan6Months) ? 'pass' : 'warn'),
      label: 'Proximity & Sale Recency',
      detail: usedEvaluated.length === 0
        ? 'No active comps selected'
        : (() => {
            const olderCount = usedEvaluated.filter((c) => c.isOlderThan6Months).length;
            const base = `Avg ${(avgDist ?? 0).toFixed(2)} mi distance · ${(avgMonths ?? 0).toFixed(1)} mo since sale`;
            return olderCount > 0
              ? `${base} · ${olderCount} ${olderCount === 1 ? 'comp' : 'comps'} >6 mo (weight reduced)`
              : base;
          })()
    },
    ...(mode === 'arv'
      ? [{
          id: 'arv_renovated_support',
          status: renovatedUsedCount >= 2 ? 'pass' : renovatedUsedCount === 1 ? 'warn' : 'fail',
          label: 'Renovated Comp Support (ARV)',
          detail: renovatedUsedCount >= 2
            ? `${renovatedUsedCount} renovated/updated comps anchor post-repair value`
            : renovatedUsedCount === 1
              ? '1 renovated comp USED — add 1+ more C2/updated sale for stronger ARV support'
              : '0 renovated comps marked — tag Updated/Renovated comps or add renovated sales'
        }]
      : []),
    {
      id: 'weights_sum',
      status: usedEvaluated.length > 0 && weightValidation.valid ? 'pass' : 'fail',
      label: 'Reconciliation Weights = 100%',
      detail: usedEvaluated.length === 0
        ? 'Enable at least 1 comp to assign weights'
        : weightValidation.valid
          ? `Weights sum strictly to ${(weightValidation.sum * 100).toFixed(1)}% (|∑w − 1| < 0.0001)`
          : `Weights currently sum to ${(weightValidation.sum * 100).toFixed(1)}% — normalize to 100%`
    },
    ...(justValueCheck ? [justValueCheck] : [])
  ];

  const subjectDetailsProgress = computeDetailsProgress(subjectDetails);

  return {
    mode,
    sizeMethod,
    tier,
    library,
    effectiveRates,
    zipTrendSource,
    medianUnadjustedPrice,
    localMedianPpsf: localMedianPpsf ? Math.round(localMedianPpsf) : null,
    subjectDetails,
    subjectDetailsProgress,
    subjectSummary: {
      address: subject?.address || 'Subject Property',
      listPrice: Number(subject?.list_price) > 0 ? Number(subject.list_price) : null,
      justValue: subjectJustValue > 0 ? subjectJustValue : null,
      sqft: subjectSqft,
      beds: subjectDetails.beds,
      baths: subjectDetails.baths,
      bedBathLabel: [
        subjectDetails.beds != null ? `${subjectDetails.beds} bd` : null,
        formatBathDisplay(subjectDetails)
      ].filter(Boolean).join(' / ') || 'Add beds/baths',
      conditionLabel: subjectDetails.condition === 'unknown'
        ? 'Unknown'
        : (mode === 'arv' && subjectDetails.condition === 'c2' ? 'Renovated (ARV · C2)' : subjectCondMeta.shortLabel),
      windowsLabel: formatWindowsLabel(subjectDetails.windows),
      roofLabel: formatRoofSpecLabel(subjectDetails),
      poolLabel: formatPoolSpecLabel(subjectDetails),
      garageLabel: formatGarageSpecLabel(subjectDetails),
      locationSiteLabel: formatWaterfrontSpecLabel(subjectDetails, subjectLotSqft),
      detailsProgress: subjectDetailsProgress
    },
    comps: evaluatedComps,
    usedComps: usedEvaluated,
    renovatedUsedCount,
    weightValidation: {
      ...weightValidation,
      sumPct: Math.round(weightValidation.sum * 1000) / 10,
      hasCustomWeights: Boolean(hasCustomWeights)
    },
    reconciledValue,
    rawReconciledValue,
    rangeLow,
    rangeHigh,
    reconciledPpsf,
    confidencePct,
    confidenceScore,
    cvPct: Math.round(cvPct * 10) / 10,
    avgGrossPct: avgGrossPct != null ? Math.round(avgGrossPct * 10) / 10 : null,
    avgDist: avgDist != null ? Math.round(avgDist * 100) / 100 : null,
    avgMonths: avgMonths != null ? Math.round(avgMonths * 10) / 10 : null,
    checks
  };
}

// ============================================================================
// Backwards-Compatible Legacy Valuation Functions (used by backtest & existing tests)
// ============================================================================

/**
 * Calculates itemized adjustment grid for a single comparable sale against subject property.
 */
export function calculateCompAdjustments(comp, subject = {}, userSettings = {}, zipTrendMonthlyPct = 0.003) {
  const settings = { ...DEFAULT_VALUATION_SETTINGS, ...(userSettings || {}) };

  const compSoldPrice = Number(comp.sold_price) || 0;
  const compSqft = Number(comp.sqft) || 0;
  const subjectSqft = Number(subject.sqft) || 0;

  // 1. Size Adjustment: (subject sf − comp sf) × comp $/sf × size factor (default 0.5)
  const compPpsqft = compSoldPrice > 0 && compSqft > 0 ? compSoldPrice / compSqft : 0;
  const sizeDiff = subjectSqft > 0 && compSqft > 0 ? subjectSqft - compSqft : 0;
  const sizeFactor = settings.sizeFactor != null ? Number(settings.sizeFactor) : 0.5;
  const sizeAdj = Math.round(sizeDiff * compPpsqft * sizeFactor);

  // 2. Time Adjustment: market trend per month from the ZIP's complete months
  const monthsSinceSale = computeMonthsSinceSale(comp.sold_date);
  const monthlyRate = zipTrendMonthlyPct != null ? Number(zipTrendMonthlyPct) : settings.timeTrendMonthlyPct;
  const timeAdj = Math.round(compSoldPrice * (monthlyRate * monthsSinceSale));

  // 3. Beds Adjustment
  const subjectBeds = Number(subject.beds) || 0;
  const compBeds = Number(comp.beds) || 0;
  const bedDiff = subjectBeds > 0 && compBeds > 0 ? subjectBeds - compBeds : 0;
  const bedAdj = Math.round(bedDiff * (Number(settings.bedAdjustment) || 10000));

  // 4. Baths Adjustment
  const subjectBaths = Number(subject.baths) || 0;
  const compBaths = Number(comp.baths) || 0;
  const bathDiff = subjectBaths > 0 && compBaths > 0 ? subjectBaths - compBaths : 0;
  const bathAdj = Math.round(bathDiff * (Number(settings.bathAdjustment) || 7500));

  // 5. Pool Adjustment (only when both booleans are explicitly known)
  let poolAdj = 0;
  if (typeof subject.pool === 'boolean' && typeof comp.pool === 'boolean') {
    const poolDiff = (subject.pool ? 1 : 0) - (comp.pool ? 1 : 0);
    poolAdj = Math.round(poolDiff * (Number(settings.poolAdjustment) || 25000));
  }

  // 6. Garage Adjustment (only when both booleans are explicitly known)
  let garageAdj = 0;
  if (typeof subject.garage === 'boolean' && typeof comp.garage === 'boolean') {
    const garageDiff = (subject.garage ? 1 : 0) - (comp.garage ? 1 : 0);
    garageAdj = Math.round(garageDiff * (Number(settings.garageAdjustment) || 10000));
  }

  // 7. Waterfront Adjustment (only when both booleans are explicitly known)
  let waterfrontAdj = 0;
  if (typeof subject.waterfront === 'boolean' && typeof comp.waterfront === 'boolean') {
    const waterfrontDiff = (subject.waterfront ? 1 : 0) - (comp.waterfront ? 1 : 0);
    waterfrontAdj = Math.round(waterfrontDiff * (Number(settings.waterfrontAdjustment) || 50000));
  }

  // 8. Lot Sqft Adjustment
  const subjectLot = Number(subject.lot_sqft) || 0;
  const compLot = Number(comp.lot_sqft) || 0;
  const lotDiff = subjectLot > 0 && compLot > 0 ? subjectLot - compLot : 0;
  const lotAdj = Math.round(lotDiff * (Number(settings.lotSqftAdjustment) || 5));

  // 9. Age (Year Built) Adjustment
  const subjectYear = Number(subject.year_built) || 0;
  const compYear = Number(comp.year_built) || 0;
  const ageDiff = subjectYear > 0 && compYear > 0 ? subjectYear - compYear : 0;
  const ageAdj = Math.round(ageDiff * (Number(settings.ageAdjustmentPerYear) || 1000));

  // Totals & Percentages
  const netAdjustment = sizeAdj + timeAdj + bedAdj + bathAdj + poolAdj + garageAdj + waterfrontAdj + lotAdj + ageAdj;
  const grossAdjustment = Math.abs(sizeAdj) + Math.abs(timeAdj) + Math.abs(bedAdj) + Math.abs(bathAdj) +
                          Math.abs(poolAdj) + Math.abs(garageAdj) + Math.abs(waterfrontAdj) + Math.abs(lotAdj) + Math.abs(ageAdj);

  const adjustedPrice = Math.round(compSoldPrice + netAdjustment);
  const netAdjustmentPct = compSoldPrice > 0 ? (Math.abs(netAdjustment) / compSoldPrice) * 100 : 0;
  const grossAdjustmentPct = compSoldPrice > 0 ? (grossAdjustment / compSoldPrice) * 100 : 0;

  // Appraisal Standards Flags: Flag comps over 15% net / 25% gross
  const isHighNet = netAdjustmentPct > 15;
  const isHighGross = grossAdjustmentPct > 25;

  // Weight Calculation
  const distMi = comp.distance_mi != null && !isNaN(Number(comp.distance_mi)) ? Number(comp.distance_mi) : 0.5;
  const wRecency = 1 / (1 + (monthsSinceSale / 6));
  const wDistance = 1 / (1 + (distMi / 0.5));
  const wAdjustment = 1 / (1 + (grossAdjustmentPct / 10));
  const totalWeight = Math.max(0.01, wRecency * wDistance * wAdjustment);

  return {
    sizeAdj,
    timeAdj,
    bedAdj,
    bathAdj,
    poolAdj,
    garageAdj,
    waterfrontAdj,
    lotAdj,
    ageAdj,
    netAdjustment,
    grossAdjustment,
    adjustedPrice,
    netAdjustmentPct: Math.round(netAdjustmentPct * 10) / 10,
    grossAdjustmentPct: Math.round(grossAdjustmentPct * 10) / 10,
    isHighNet,
    isHighGross,
    monthsSinceSale,
    distanceMi: distMi,
    totalWeight
  };
}

/**
 * Calculates full valuation metrics from comps (As-Is vs ARV bifurcation).
 */
export function calculateValuation({
  comps = [],
  subject = {},
  userSettings = {},
  zipTrendMonthlyPct = 0.003,
  zipRatioStats = null,
  manualArv = null
}) {
  const includedComps = comps.filter(c => resolveCompIsIncluded(c) && c.sold_price && Number(c.sold_price) > 0);

  const analyzedComps = includedComps.map(c => {
    const adj = calculateCompAdjustments(c, subject, userSettings, zipTrendMonthlyPct);
    const condMeta = getConditionMeta(c.condition);
    return {
      ...c,
      valuation: adj,
      conditionMeta: condMeta
    };
  });

  const asIsComps = analyzedComps.filter(c => !c.conditionMeta.isRenovated);
  const renovatedComps = analyzedComps.filter(c => c.conditionMeta.isRenovated);

  const computeGroupValuation = (group) => {
    if (group.length === 0) return null;

    let weightedSum = 0;
    let weightSum = 0;
    const adjustedPrices = [];

    group.forEach(c => {
      const p = c.valuation.adjustedPrice;
      const w = c.valuation.totalWeight;
      weightedSum += p * w;
      weightSum += w;
      adjustedPrices.push(p);
    });

    const mid = weightSum > 0 ? Math.round((weightedSum / weightSum) / 100) * 100 : Math.round(calculateMedian(adjustedPrices) || 0);
    adjustedPrices.sort((a, b) => a - b);
    const low = adjustedPrices[0];
    const high = adjustedPrices[adjustedPrices.length - 1];

    return {
      count: group.length,
      mid,
      low,
      high,
      highestCompAdjusted: high,
      comps: group
    };
  };

  const asIsValuation = computeGroupValuation(asIsComps);
  const arvValuation = computeGroupValuation(renovatedComps);

  let arvStatus = 'CALCULATED';
  let arvDisplay = arvValuation ? arvValuation.mid : null;
  let isArvUnsupported = false;
  let arvUnsupportedMessage = null;

  if (!arvValuation || renovatedComps.length === 0) {
    arvStatus = 'NEEDS_RENOVATED_COMPS';
    arvDisplay = 'Add renovated comps';
  }

  const numManualArv = Number(manualArv);
  if (numManualArv > 0) {
    if (arvValuation && arvValuation.highestCompAdjusted > 0) {
      const threshold = arvValuation.highestCompAdjusted * 1.10;
      if (numManualArv > threshold) {
        isArvUnsupported = true;
        const diffPct = Math.round(((numManualArv - arvValuation.highestCompAdjusted) / arvValuation.highestCompAdjusted) * 100);
        arvUnsupportedMessage = `Entered ARV ($${numManualArv.toLocaleString()}) is ${diffPct}% above highest adjusted renovated comp ($${arvValuation.highestCompAdjusted.toLocaleString()}). Not supported by comps.`;
      }
    } else if (arvStatus === 'NEEDS_RENOVATED_COMPS') {
      isArvUnsupported = true;
      arvUnsupportedMessage = 'No renovated comps added to support this ARV value.';
    }
  }

  const activeValuation = arvValuation || asIsValuation;
  const activeComps = activeValuation ? activeValuation.comps : analyzedComps;

  let confidenceScore = 'Low';
  const confidenceReasons = [];

  if (activeComps.length >= 3) {
    confidenceReasons.push(`${activeComps.length} comparable sales analyzed`);

    const ppsqfts = activeComps.map(c => Number(c.sqft) > 0 ? Number(c.sold_price) / Number(c.sqft) : null).filter(Boolean);
    let cv = 0;
    if (ppsqfts.length > 0) {
      const mean = ppsqfts.reduce((a, b) => a + b, 0) / ppsqfts.length;
      const variance = ppsqfts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / ppsqfts.length;
      const stdDev = Math.sqrt(variance);
      cv = mean > 0 ? (stdDev / mean) * 100 : 0;
    }

    if (cv <= 12) {
      confidenceReasons.push(`Tight $/sqft spread (${cv.toFixed(1)}% CV)`);
    } else if (cv <= 20) {
      confidenceReasons.push(`Moderate $/sqft spread (${cv.toFixed(1)}% CV)`);
    } else {
      confidenceReasons.push(`High $/sqft dispersion (${cv.toFixed(1)}% CV)`);
    }

    const avgDistance = activeComps.reduce((acc, c) => acc + (c.valuation.distanceMi || 0.5), 0) / activeComps.length;
    if (avgDistance <= 0.5) {
      confidenceReasons.push(`Close proximity (avg ${avgDistance.toFixed(2)} mi)`);
    } else if (avgDistance <= 1.0) {
      confidenceReasons.push(`Average distance ${avgDistance.toFixed(2)} mi`);
    } else {
      confidenceReasons.push(`Distant comps (avg ${avgDistance.toFixed(2)} mi)`);
    }

    const avgMonths = activeComps.reduce((acc, c) => acc + (c.valuation.monthsSinceSale || 0), 0) / activeComps.length;
    if (avgMonths <= 6) {
      confidenceReasons.push(`Recent transactions (avg ${avgMonths.toFixed(1)} mo)`);
    } else {
      confidenceReasons.push(`Older transactions (avg ${avgMonths.toFixed(1)} mo)`);
    }

    const avgGrossAdj = activeComps.reduce((acc, c) => acc + (c.valuation.grossAdjustmentPct || 0), 0) / activeComps.length;
    if (avgGrossAdj <= 15) {
      confidenceReasons.push(`Low adjustments required (avg ${avgGrossAdj.toFixed(1)}% gross)`);
    } else {
      confidenceReasons.push(`Higher adjustments required (avg ${avgGrossAdj.toFixed(1)}% gross)`);
    }

    if (activeComps.length >= 3 && cv <= 14 && avgDistance <= 0.75 && avgMonths <= 8 && avgGrossAdj <= 20) {
      confidenceScore = 'High';
    } else if (activeComps.length >= 3 && avgDistance <= 1.25 && avgGrossAdj <= 28) {
      confidenceScore = 'Medium';
    } else {
      confidenceScore = 'Low';
    }
  } else {
    confidenceScore = 'Low';
    confidenceReasons.push(`Only ${activeComps.length} comp(s) included (minimum 3 required for high confidence)`);
  }

  let sanityCheck = {
    evaluated: false,
    status: 'UNKNOWN',
    message: null,
    ratio: null,
    medianRatio: null,
    p25: null,
    p75: null
  };

  const subjectJustValue = Number(subject.just_value);
  const midValueToTest = activeValuation ? activeValuation.mid : (numManualArv || null);

  if (subjectJustValue > 0 && midValueToTest > 0 && zipRatioStats && zipRatioStats.medianRatio > 0) {
    const subjectRatio = midValueToTest / subjectJustValue;
    const { medianRatio, p25Ratio, p75Ratio } = zipRatioStats;
    const isNormal = subjectRatio >= (p25Ratio * 0.85) && subjectRatio <= (p75Ratio * 1.15);

    sanityCheck = {
      evaluated: true,
      status: isNormal ? 'NORMAL' : 'WARNING',
      ratio: Math.round(subjectRatio * 100) / 100,
      medianRatio: Math.round(medianRatio * 100) / 100,
      p25: Math.round(p25Ratio * 100) / 100,
      p75: Math.round(p75Ratio * 100) / 100,
      message: isNormal
        ? `Valuation is ${subjectRatio.toFixed(2)}x county just value ($${Math.round(subjectJustValue).toLocaleString()}), within typical ${subject.zip || 'area'} range (${p25Ratio.toFixed(2)}x–${p75Ratio.toFixed(2)}x).`
        : `Valuation is ${subjectRatio.toFixed(2)}x county just value ($${Math.round(subjectJustValue).toLocaleString()}), outside typical ${subject.zip || 'area'} range (${p25Ratio.toFixed(2)}x–${p75Ratio.toFixed(2)}x). Independent verification recommended.`
    };
  }

  return {
    comps: analyzedComps,
    asIsValuation,
    arvValuation,
    arvStatus,
    arvDisplay,
    isArvUnsupported,
    arvUnsupportedMessage,
    confidenceScore,
    confidenceReasons,
    sanityCheck
  };
}

export function calculateMedian(numbers) {
  if (!numbers || numbers.length === 0) return null;
  const valid = numbers.filter(n => n != null && !isNaN(n)).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) return valid[mid];
  return (valid[mid - 1] + valid[mid]) / 2;
}
