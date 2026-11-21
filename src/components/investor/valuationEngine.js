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
  mergeDetailsWithCountyBuilding,
  computeDetailsProgress,
  formatCountyClues,
  resolveSubjectDetailsForMode,
  formatConstructionTypeLabel,
  formatBoatDockLabel,
  formatQualityWithRawCode,
  buildCountyCodeTooltip,
  mapConstClassToConstructionType,
  getUadQualityMeta,
  mapImpQualToUadQuality,
  ROOF_TYPE_OPTIONS,
  WINDOW_OPTIONS,
  WATERFRONT_VIEW_OPTIONS
} from './compDetailsModel.js';
import { isSameSubdivision } from '../../utils/subdivision.js';
import { normalizeAddress } from '../../utils/addressNorm.js';
import { normalizeCountyName } from '../../config/counties.js';
import { resolvePropertyPricing } from './priceSource.js';

export const MAX_TIME_ADJUSTMENT_PCT = 10; // ±10% cap unless manually overridden

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
  extraBathFunctionalAdjustment: 0, // Baths above bedrooms + 1 (functional utility, $0 default, editable)
  ageAdjustmentPerYear: 1500,      // Year built / effective age ($/yr beyond ±5 yr threshold, tier-scaled)
  ageMinYearsThreshold: 5,
  qualityStepAdjustment: 25000,    // UAD Quality Q1–Q6 per rating step (tier-scaled)
  conditionUpdatedVsAsIs: 22000,   // Minor kitchen refresh + bath update (C3 vs C4)
  conditionRenovatedVsAsIs: 48000, // Full kitchen ($30k) + baths ($18k) (C2 vs C4)
  constructionCbsVsFrameAdjustment: 15000, // CBS / Masonry vs Wood Frame (tier-scaled)
  poolAdjustment: 40000,           // Guide: $30,000 – $50,000 Standard In-Ground Pool
  garageBayAdjustment: 15000,      // Guide: $10,000 – $20,000 / bay
  impactWindowsAdjustment: 25000,  // Guide: $15,000 – $35,000 Full Impact Windows & Doors
  newerRoofAdjustment: 25000,      // Guide: $15,000 – $35,000 Newer Roof (<5 yrs vs older)
  differentSubdivisionAdjustment: 0, // Location row: Same subdivision / Different (default $0, editable in library)
  differentNeighborhoodAdjustment: 0, // Location row: Same subdivision but different NBRHD_CD (default $0, editable)
  waterfrontAdjustment: 75000,     // Dedicated Location / Site / Waterfront adjustment
  boatDockAdjustment: 25000,       // Private boat dock / seawall dockage (tier-scaled)
  boatLiftAdjustment: 15000,       // Boat lift contributory value (tier-scaled)
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
  const effYear = effectiveDate.getFullYear();
  const effMonth = effectiveDate.getMonth() + 1;

  if (soldDateStr instanceof Date && !isNaN(soldDateStr.getTime())) {
    return Math.max(
      0,
      (effYear - soldDateStr.getUTCFullYear()) * 12 + (effMonth - (soldDateStr.getUTCMonth() + 1))
    );
  }

  const raw = String(soldDateStr).trim();

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

const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatYmShort(year, month) {
  if (!year || !month || month < 1 || month > 12) return '';
  return `${SHORT_MONTH_NAMES[month - 1]} ${year}`;
}

function formatYmRange(buckets = []) {
  if (!buckets.length) return '';
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  if (first.year === last.year && first.month === last.month) {
    return formatYmShort(first.year, first.month);
  }
  if (first.year === last.year) {
    return `${SHORT_MONTH_NAMES[first.month - 1]}–${SHORT_MONTH_NAMES[last.month - 1]} ${last.year}`;
  }
  return `${formatYmShort(first.year, first.month)}–${formatYmShort(last.year, last.month)}`;
}

function parseSoldYearMonth(soldDateStr) {
  if (!soldDateStr) return null;
  if (soldDateStr instanceof Date && !isNaN(soldDateStr.getTime())) {
    const year = soldDateStr.getUTCFullYear();
    const month = soldDateStr.getUTCMonth() + 1;
    return { year, month, ym: year * 12 + month };
  }
  const raw = String(soldDateStr).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    if (year > 1900 && month >= 1 && month <= 12) {
      return { year, month, ym: year * 12 + month };
    }
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  return { year, month, ym: year * 12 + month };
}

function roundTimeDollar(val) {
  if (!Number.isFinite(val) || val === 0) return 0;
  return Math.abs(val) >= 100 ? Math.round(val / 100) * 100 : Math.round(val);
}

function weightedBucketValue(buckets, field) {
  const valid = buckets.filter((b) => Number(b?.[field]) > 0);
  if (valid.length === 0) return null;
  let wSum = 0;
  let totalWeight = 0;
  for (const b of valid) {
    const w = Number(b.sales_count) > 0 ? Number(b.sales_count) : 1;
    wSum += Number(b[field]) * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? wSum / totalWeight : calculateMedian(valid.map((b) => Number(b[field])));
}

/**
 * Computes a market-conditions (time) adjustment strictly from measured ZIP/neighborhood
 * sales trends over the comp's actual holding period (allowing flat or negative trends)
 * and enforces a hard ±10% cap unless the user overrides the cell.
 *
 * When a sale predates the earliest measured county roll month, measures strictly from
 * the earliest measured 6-month baseline to the latest complete 6-month window (never
 * linearly extrapolating a short-term slope across unmeasured months).
 */
export function computeMeasuredTimeAdjustment({
  soldDate,
  soldPrice = 0,
  monthsSinceSale = 0,
  zipMarketData = null,
  fallbackMonthlyTrendPct = 0.25,
  zipTrendSource = null,
  maxCapPct = MAX_TIME_ADJUSTMENT_PCT
} = {}) {
  const price = Number(soldPrice) || 0;
  const cap = Number(maxCapPct) > 0 ? Number(maxCapPct) : MAX_TIME_ADJUSTMENT_PCT;

  if (!soldDate || price <= 0 || monthsSinceSale <= 0) {
    return {
      amount: 0,
      measuredPct: 0,
      appliedPct: 0,
      wasCapped: false,
      source: zipTrendSource || null,
      periodLabel: null,
      note: ''
    };
  }

  const parsedSale = parseSoldYearMonth(soldDate);
  const summary = zipMarketData?.summary || null;
  const rawMonthly = Array.isArray(zipMarketData?.monthly) ? zipMarketData.monthly : [];
  const rawQuarterly = Array.isArray(zipMarketData?.quarterly) ? zipMarketData.quarterly : [];

  const scopeLabel =
    zipTrendSource ||
    summary?.mode_label ||
    (summary?.zip ? `ZIP ${summary.zip}` : null);

  // Path 1: Measured series from /api/county/market
  if (zipMarketData && (rawMonthly.length > 0 || rawQuarterly.length > 0 || summary)) {
    const completeMonths = rawMonthly
      .filter((m) => m && m.is_complete !== false && Number(m.year) > 1900 && Number(m.month) >= 1 && Number(m.month) <= 12)
      .map((m) => ({ ...m, ym: Number(m.year) * 12 + Number(m.month) }))
      .sort((a, b) => a.ym - b.ym);

    const ppsfMonths = completeMonths.filter((m) => Number(m.median_price_per_sqft) > 0);
    const priceMonths = completeMonths.filter((m) => Number(m.median_price) > 0);
    const usePpsf = ppsfMonths.length >= 2 || Number(summary?.median_ppsf_last_6m) > 0;
    const metricField = usePpsf ? 'median_price_per_sqft' : 'median_price';
    const metricMonths = usePpsf ? ppsfMonths : priceMonths;

    const latestCompleteYm = completeMonths.length > 0
      ? completeMonths[completeMonths.length - 1].ym
      : null;

    if (parsedSale && latestCompleteYm != null && parsedSale.ym >= latestCompleteYm) {
      return {
        amount: 0,
        measuredPct: 0,
        appliedPct: 0,
        wasCapped: false,
        source: scopeLabel ? `${scopeLabel} measured ${usePpsf ? '$/sf' : 'median price'}` : 'Measured market trend',
        periodLabel: null,
        note: `${scopeLabel || 'Market'}: sold in latest measured month (0%)`
      };
    }

    // Latest 6-month baseline (ending at last complete month) using the SAME weightedBucketValue estimator
    // as salePeriodValue so overlapping windows compare apples-to-apples without estimator bias
    const latest6Buckets = latestCompleteYm != null
      ? metricMonths.filter((m) => m.ym >= latestCompleteYm - 5 && m.ym <= latestCompleteYm)
      : metricMonths.slice(-6);
    const latestValue =
      weightedBucketValue(latest6Buckets, metricField) ??
      (usePpsf && Number(summary?.median_ppsf_last_6m) > 0 ? Number(summary.median_ppsf_last_6m) : null) ??
      (!usePpsf && Number(summary?.median_price_last_6m) > 0 ? Number(summary.median_price_last_6m) : null);

    const latestPeriodLabel =
      latest6Buckets.length > 0
        ? formatYmRange(latest6Buckets)
        : (summary?.complete_through ? `through ${summary.complete_through}` : 'latest 6 mo');

    let salePeriodValue = null;
    let salePeriodLabel = null;
    let predatesSeries = false;

    if (parsedSale && metricMonths.length > 0) {
      const earliestMetricYm = metricMonths[0].ym;

      if (parsedSale.ym < earliestMetricYm) {
        // Comp predates earliest measured month -> use earliest measured 6-month window (NO linear extrapolation)
        predatesSeries = true;
        const earliest6 = metricMonths.filter((m) => m.ym >= earliestMetricYm && m.ym <= earliestMetricYm + 5);
        salePeriodValue = weightedBucketValue(earliest6, metricField);
        salePeriodLabel = formatYmRange(earliest6);
      } else {
        // Sale occurred inside measured series -> ±2 month window around sale month
        const aroundSale = metricMonths.filter((m) => Math.abs(m.ym - parsedSale.ym) <= 2);
        if (aroundSale.length > 0) {
          salePeriodValue = weightedBucketValue(aroundSale, metricField);
          salePeriodLabel = formatYmRange(aroundSale);
        } else {
          // Fallback to matching or adjacent quarter
          const saleQ = Math.ceil(parsedSale.month / 3);
          const saleQIdx = parsedSale.year * 4 + saleQ;
          const validQuarters = rawQuarterly
            .filter((q) => Number(q?.[metricField]) > 0 && Number(q.year) > 1900 && Number(q.quarter) >= 1)
            .map((q) => ({ ...q, qIdx: Number(q.year) * 4 + Number(q.quarter) }))
            .sort((a, b) => Math.abs(a.qIdx - saleQIdx) - Math.abs(b.qIdx - saleQIdx));
          if (validQuarters.length > 0 && Math.abs(validQuarters[0].qIdx - saleQIdx) <= 1) {
            salePeriodValue = Number(validQuarters[0][metricField]);
            salePeriodLabel = validQuarters[0].label || `${validQuarters[0].year} Q${validQuarters[0].quarter}`;
          }
        }
      }
    }

    // Secondary measured fallback: summary YoY 6m-vs-prev-6m (only when monthly buckets sparse; NEVER extrapolate >12 mo)
    if (!(salePeriodValue > 0 && latestValue > 0)) {
      const summaryPct =
        summary?.ppsf_change_pct != null && !isNaN(Number(summary.ppsf_change_pct))
          ? Number(summary.ppsf_change_pct)
          : (summary?.price_change_pct != null && !isNaN(Number(summary.price_change_pct))
              ? Number(summary.price_change_pct)
              : null);
      if (summaryPct != null) {
        const clampedMonths = Math.min(monthsSinceSale, 12);
        const rawMeasuredPct = Math.round(((summaryPct * clampedMonths) / 12) * 10) / 10;
        const appliedPct = Math.round(Math.max(-cap, Math.min(cap, rawMeasuredPct)) * 10) / 10;
        const wasCapped = Math.abs(rawMeasuredPct) > cap + 1e-6;
        const amount = roundTimeDollar(price * (appliedPct / 100));
        const sign = appliedPct > 0 ? '+' : '';
        const srcName = scopeLabel || 'ZIP trend';
        const note = wasCapped
          ? `${srcName} measured ${rawMeasuredPct > 0 ? '+' : ''}${rawMeasuredPct.toFixed(1)}% → capped ${sign}${appliedPct.toFixed(0)}%`
          : `${srcName} measured ${sign}${appliedPct.toFixed(1)}% (12-mo YoY)`;
        return {
          amount,
          measuredPct: rawMeasuredPct,
          appliedPct,
          wasCapped,
          source: `${srcName} measured 12-mo YoY`,
          periodLabel: '12-mo YoY',
          note
        };
      }

      // Insufficient measured ZIP sales -> flat 0% (never invent appreciation)
      return {
        amount: 0,
        measuredPct: 0,
        appliedPct: 0,
        wasCapped: false,
        source: scopeLabel ? `${scopeLabel} (insufficient sales — flat 0%)` : 'Insufficient market data (0%)',
        periodLabel: null,
        note: `${scopeLabel || 'Market'}: insufficient sales (0% flat)`
      };
    }

    const rawMeasuredPct = Math.round((((latestValue - salePeriodValue) / salePeriodValue) * 100) * 10) / 10;
    const appliedPct = Math.round(Math.max(-cap, Math.min(cap, rawMeasuredPct)) * 10) / 10;
    const wasCapped = Math.abs(rawMeasuredPct) > cap + 1e-6;
    const amount = roundTimeDollar(price * (appliedPct / 100));

    const metricLabel = usePpsf ? '$/sf' : 'price';
    const srcName = scopeLabel || 'ZIP';
    const signApplied = appliedPct > 0 ? '+' : appliedPct < 0 ? '\u2212' : '';
    const signRaw = rawMeasuredPct > 0 ? '+' : rawMeasuredPct < 0 ? '\u2212' : '';
    const periodText = salePeriodLabel && latestPeriodLabel
      ? `${predatesSeries ? 'earliest ' : ''}${salePeriodLabel} \u2192 ${latestPeriodLabel}`
      : '';
    const pctText = appliedPct === 0
      ? '0.0% (flat)'
      : wasCapped
        ? `${signRaw}${Math.abs(rawMeasuredPct).toFixed(1)}% \u2192 capped ${signApplied}${Math.abs(appliedPct).toFixed(0)}%`
        : `${signApplied}${Math.abs(appliedPct).toFixed(1)}%`;

    return {
      amount,
      measuredPct: rawMeasuredPct,
      appliedPct,
      wasCapped,
      source: `${srcName} measured ${metricLabel}${summary?.complete_through ? ` (through ${summary.complete_through})` : ''}`,
      periodLabel: periodText || null,
      note: `${srcName} ${pctText}${periodText ? ` (${periodText})` : ''}`
    };
  }

  // Path 2: Fallback linear monthly rate (when full zipMarketData series is not supplied), still strictly capped at ±10%
  const ratePct = Number(fallbackMonthlyTrendPct);
  if (!Number.isFinite(ratePct) || ratePct === 0) {
    return {
      amount: 0,
      measuredPct: 0,
      appliedPct: 0,
      wasCapped: false,
      source: scopeLabel || 'Library default',
      periodLabel: null,
      note: ''
    };
  }

  const rawLinearPct = ratePct * monthsSinceSale;
  const appliedPct = Math.max(-cap, Math.min(cap, rawLinearPct));
  const wasCapped = Math.abs(rawLinearPct) > cap + 1e-6;
  const amount = roundTimeDollar(price * (appliedPct / 100));
  const trendSign = ratePct > 0 ? '+' : '';
  const appliedSign = appliedPct > 0 ? '+' : appliedPct < 0 ? '\u2212' : '';

  return {
    amount,
    measuredPct: Math.round(rawLinearPct * 10) / 10,
    appliedPct: Math.round(appliedPct * 10) / 10,
    wasCapped,
    source: scopeLabel || 'Library monthly trend',
    periodLabel: `${monthsSinceSale} mo`,
    note: wasCapped
      ? `${trendSign}${ratePct}%/mo → capped ${appliedSign}${Math.abs(appliedPct).toFixed(0)}%`
      : `${trendSign}${ratePct}%/mo`
  };
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

export const WEIGHT_FORMULA_SUMMARY =
  'Weight ∝ Gross Adj Factor (steep cliff >25% gross) × Size Parity (steep penalty >±20% GLA diff) × Recency (penalty >6 mo) × Distance × Verified (×0.75 if unverified) × Detail Completeness (×0.86 per missing feature) × Condition Parity, normalized to 100% (outlier comps >40% from median $/sf capped at 25% max weight when ON).';

export const OUTLIER_MAX_WEIGHT_FRACTION = 0.25;

function formatWaterfrontOnlyLabel(details) {
  const wfObj = WATERFRONT_VIEW_OPTIONS.find((o) => o.id === details.waterfront_view && o.id !== 'unknown');
  return wfObj ? wfObj.label : 'Unknown';
}

function formatAgeSpecLabel(yearBuilt, effYearBuilt) {
  const yb = yearBuilt != null && Number(yearBuilt) > 1800 ? Math.round(Number(yearBuilt)) : null;
  const eff = effYearBuilt != null && Number(effYearBuilt) > 1800 ? Math.round(Number(effYearBuilt)) : null;
  if (yb != null && eff != null && eff !== yb) return `${yb} (eff. ${eff})`;
  if (yb != null) return `Built ${yb}`;
  if (eff != null) return `Eff. ${eff}`;
  return 'Unknown';
}

/**
 * Caps credited baths at bedrooms + 1 so excess baths are treated as functional utility
 * ($0 by default, editable in adjustment library) and flags "unusual bed/bath ratio".
 */
export function capBathsForBedrooms(details = {}) {
  const beds = details?.beds != null && !isNaN(Number(details.beds)) ? Number(details.beds) : null;
  const rawFull = details?.full_baths != null && !isNaN(Number(details.full_baths)) ? Number(details.full_baths) : null;
  const rawHalf = details?.half_baths != null && !isNaN(Number(details.half_baths)) ? Number(details.half_baths) : null;
  const totalBaths = rawFull != null
    ? Math.round((rawFull + (rawHalf ?? 0) * 0.5) * 10) / 10
    : (details?.baths != null && !isNaN(Number(details.baths)) ? Math.round(Number(details.baths) * 10) / 10 : null);

  if (beds == null || totalBaths == null) {
    return {
      beds,
      totalBaths,
      maxCredited: beds != null ? beds + 1 : null,
      creditedFull: rawFull,
      creditedHalf: rawFull != null ? (rawHalf ?? 0) : null,
      creditedTotal: totalBaths,
      excessBaths: 0,
      isUnusualRatio: false
    };
  }

  const maxCredited = Math.max(1, beds + 1);
  if (totalBaths <= maxCredited + 1e-6) {
    return {
      beds,
      totalBaths,
      maxCredited,
      creditedFull: rawFull,
      creditedHalf: rawFull != null ? (rawHalf ?? 0) : null,
      creditedTotal: totalBaths,
      excessBaths: 0,
      isUnusualRatio: false
    };
  }

  const excessBaths = Math.round((totalBaths - maxCredited) * 10) / 10;
  const fullAvail = rawFull != null ? rawFull : Math.floor(totalBaths + 1e-6);
  const halfAvail = rawFull != null ? (rawHalf ?? 0) : (totalBaths - fullAvail >= 0.25 ? 1 : 0);
  const creditedFull = Math.min(fullAvail, Math.floor(maxCredited + 1e-6));
  const remCap = Math.max(0, maxCredited - creditedFull);
  const creditedHalf = Math.min(halfAvail, Math.floor(remCap / 0.5 + 1e-6));
  const creditedTotal = Math.round((creditedFull + creditedHalf * 0.5) * 10) / 10;

  return {
    beds,
    totalBaths,
    maxCredited,
    creditedFull,
    creditedHalf,
    creditedTotal,
    excessBaths,
    isUnusualRatio: true
  };
}

/**
 * Computes county improvement value (just_value - land_value), land share %, and improvement $/sf.
 */
export function computeParcelImprovementMetrics(entity = {}) {
  const justVal = Number(entity?.just_value);
  const landVal = Number(entity?.land_value);
  const sqft = Number(entity?.sqft || entity?.living_sqft);
  if (!Number.isFinite(justVal) || justVal <= 0 || !Number.isFinite(landVal) || landVal <= 0) {
    return null;
  }
  const improvementVal = Math.max(0, justVal - landVal);
  const landSharePct = Math.round((landVal / justVal) * 1000) / 10;
  const impPpsf = sqft > 0 && improvementVal > 0 ? Math.round(improvementVal / sqft) : null;
  return {
    justVal: Math.round(justVal),
    landVal: Math.round(landVal),
    improvementVal: Math.round(improvementVal),
    landSharePct,
    impPpsf
  };
}

/**
 * Enforces a maximum fractional weight (default 25%) on outlier comps when enabled,
 * redistributing excess weight proportionally across non-outlier comps so weights sum strictly to 1.0.
 */
export function applyOutlierWeightCap(usedComps = [], rawWeights = [], cap = OUTLIER_MAX_WEIGHT_FRACTION) {
  const n = usedComps.length;
  if (n === 0) return { weights: [], cappedIds: new Set(), cannotCapAllOutliers: false };

  const weights = normalizeReconciliationWeights(rawWeights);
  const outlierIdx = [];
  const normalIdx = [];
  usedComps.forEach((c, i) => {
    if (c.isOutlier) outlierIdx.push(i);
    else normalIdx.push(i);
  });

  if (outlierIdx.length === 0) {
    return { weights, cappedIds: new Set(), cannotCapAllOutliers: false };
  }

  // If only outliers are enabled and fewer than 4 exist, summing to 100% while capping each at 25% is infeasible
  if (normalIdx.length === 0 && outlierIdx.length * cap < 1 - 1e-6) {
    return { weights, cappedIds: new Set(), cannotCapAllOutliers: true };
  }

  const capped = new Set();
  const cappedIds = new Set();

  for (let iter = 0; iter < 12; iter++) {
    let excess = 0;
    for (const i of outlierIdx) {
      if (!capped.has(i) && weights[i] > cap + 1e-9) {
        excess += weights[i] - cap;
        weights[i] = cap;
        capped.add(i);
        cappedIds.add(usedComps[i].id);
      }
    }
    if (excess <= 1e-9) break;

    const recipients = normalIdx.length > 0
      ? normalIdx
      : outlierIdx.filter((i) => !capped.has(i));
    if (recipients.length === 0) break;

    const recipSum = recipients.reduce((s, i) => s + weights[i], 0);
    if (recipSum > 0) {
      for (const i of recipients) {
        weights[i] += excess * (weights[i] / recipSum);
      }
    } else {
      const share = excess / recipients.length;
      for (const i of recipients) {
        weights[i] += share;
      }
    }
  }

  // Final strict normalization check preserving outlier caps
  const total = weights.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1) > 1e-9) {
    const adjustIdx = normalIdx.length > 0 ? normalIdx[normalIdx.length - 1] : (n - 1);
    weights[adjustIdx] = Math.max(0, weights[adjustIdx] + (1 - total));
  }

  return { weights, cappedIds, cannotCapAllOutliers: false };
}

/**
 * Determines whether a comp is included (USED) in reconciliation.
 * Comps flagged as $/sf outliers (>40% from median) default to OFF unless explicitly included === true.
 */
export function resolveCompIsIncluded(comp, { isComputedOutlier = false } = {}) {
  if (!comp) return false;
  if (comp.included === true) return true;
  if (comp.included === false) return false;
  return (comp.is_outlier || comp.adjustments?.is_outlier || isComputedOutlier) ? false : true;
}

/**
 * Full South Florida Sales Comparison & Reconciliation Grid Engine.
 * Evaluates all comps (USED and OFF), computes CIA/CBS directional cells,
 * enforces Net <= 15% / Gross <= 25% checks, and reconciles weighted value.
 */
export function computeAppraisalGrid({
  comps = [],
  subject = {},
  mode = 'as_is',       // 'as_is' | 'arv'
  sizeMethod = 'auto',  // 'auto' | 'improvement_value' | 'local_35' | 'library'
  library: rawLibrary = {},
  customWeights = null, // optional { [compId]: number (percentage 0..100) }
  zipMarketData = null, // optional full /api/county/market payload { summary, monthly, quarterly }
  zipTrendMonthlyPct = null,
  zipTrendSource = null,
  zipRatioStats = null,
  effectiveDate = new Date()
} = {}) {
  const library = mergeAdjustmentLibrary(rawLibrary);
  const effYear = effectiveDate.getFullYear();
  const subjectPricing = resolvePropertyPricing(subject);

  // Valid comps with a sale price
  const validComps = comps.filter((c) => c && Number(c.sold_price) > 0);

  // Dynamic $/sf outlier detection (>40% from median $/sf across >=3 valid comps)
  const allValidPpsf = validComps
    .map((c) => {
      if (Number(c.price_per_sqft) > 0) return Number(c.price_per_sqft);
      if (Number(c.sold_price) > 0 && Number(c.sqft) > 0) return Number(c.sold_price) / Number(c.sqft);
      return null;
    })
    .filter((n) => n != null && n > 0);
  const allGridMedianPpsf = allValidPpsf.length >= 3 ? calculateMedian(allValidPpsf) : null;

  const computedOutlierMap = new Map();
  for (const c of validComps) {
    const cPpsf = Number(c.price_per_sqft) > 0
      ? Number(c.price_per_sqft)
      : (Number(c.sold_price) > 0 && Number(c.sqft) > 0 ? Number(c.sold_price) / Number(c.sqft) : null);
    const isPersistedOutlier = Boolean(c.is_outlier || c.adjustments?.is_outlier);
    let isComputedPpsfOutlier = false;
    let computedReason = null;
    if (allGridMedianPpsf && cPpsf && Math.abs(cPpsf - allGridMedianPpsf) / allGridMedianPpsf > 0.4) {
      isComputedPpsfOutlier = true;
      const pct = Math.round(((cPpsf - allGridMedianPpsf) / allGridMedianPpsf) * 100);
      computedReason = `$/sf ($${Math.round(cPpsf)}/sf) is ${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'} median ($${Math.round(allGridMedianPpsf)}/sf)`;
    }
    computedOutlierMap.set(c, {
      isOutlier: isPersistedOutlier || isComputedPpsfOutlier,
      isComputedPpsfOutlier,
      reason: c.outlier_reason || c.adjustments?.outlier_reason || computedReason
    });
  }

  const usedCompsRaw = validComps.filter((c) => {
    const outInfo = computedOutlierMap.get(c);
    return resolveCompIsIncluded(c, { isComputedOutlier: Boolean(outInfo?.isComputedPpsfOutlier) });
  });

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

  // County Improvement Value $/sf (for waterfront / land-heavy properties where land > 50% of market value)
  const subjectImpMetrics = computeParcelImprovementMetrics(subject);
  const isLandHeavySubject = Boolean(subjectImpMetrics && subjectImpMetrics.landSharePct > 50);

  const impPoolSources = [];
  if (subjectImpMetrics?.impPpsf > 0) {
    impPoolSources.push({ role: 'subject', impPpsf: subjectImpMetrics.impPpsf });
  }
  const impCompPool = usedCompsRaw.length > 0 ? usedCompsRaw : validComps;
  let impCompCount = 0;
  for (const c of impCompPool) {
    const cm = computeParcelImprovementMetrics(c);
    if (cm?.impPpsf > 0) {
      impPoolSources.push({ role: 'comp', impPpsf: cm.impPpsf });
      impCompCount++;
    }
  }
  const improvementGlaRate = impPoolSources.length > 0
    ? Math.round(calculateMedian(impPoolSources.map((x) => x.impPpsf)))
    : null;
  const improvementGlaSampleLabel = [
    subjectImpMetrics?.impPpsf > 0 ? 'subject' : null,
    impCompCount > 0 ? `${impCompCount} ${impCompCount === 1 ? 'comp' : 'comps'}` : null
  ].filter(Boolean).join(' + ');

  // Auto-detect South Florida Tier (Guide Section 6)
  const tier = detectSouthFloridaTier(medianUnadjustedPrice, subjectPricing.referencePrice || subject?.list_price);
  const tierScale = library.tierScaleEnabled !== false ? tier.multiplier : 1.0;

  // Determine GLA $/sf rate, active method & transparent source label
  const libraryGlaRate = Number(library.glaRates?.[tier.key]) || tier.defaultGlaRate;
  const minGlaThreshold = Number(library.glaMinThresholds?.[tier.key]) ?? tier.defaultMinSqftThreshold;
  const localFactor = Number(library.localPpsfFactor) > 0 ? Number(library.localPpsfFactor) : 0.35;

  let effectiveSizeMethod = sizeMethod;
  if (!['improvement_value', 'local_35', 'library'].includes(effectiveSizeMethod)) {
    effectiveSizeMethod = isLandHeavySubject && improvementGlaRate > 0 ? 'improvement_value' : 'local_35';
  }
  if (effectiveSizeMethod === 'improvement_value' && !(improvementGlaRate > 0)) {
    effectiveSizeMethod = localMedianPpsf > 0 ? 'local_35' : 'library';
  }

  let activeGlaRate;
  let glaRateSource;
  if (effectiveSizeMethod === 'improvement_value' && improvementGlaRate > 0) {
    activeGlaRate = improvementGlaRate;
    const landPart = subjectImpMetrics
      ? ` · land is ${Math.round(subjectImpMetrics.landSharePct)}% of county market value`
      : '';
    glaRateSource = `Median county improvement $/sf ($${improvementGlaRate}/sf from ${improvementGlaSampleLabel || 'county roll'}${landPart})`;
  } else if (effectiveSizeMethod === 'local_35' && localMedianPpsf > 0) {
    activeGlaRate = Math.round(localMedianPpsf * localFactor);
    glaRateSource = `${Math.round(localFactor * 100)}% of local median comp $/sf ($${Math.round(localMedianPpsf)}/sf)`;
  } else {
    activeGlaRate = Math.round(libraryGlaRate);
    glaRateSource = `South FL ${tier.name} library rate ($${Math.round(libraryGlaRate)}/sf)`;
  }

  // Scaled contributory library line items (rounded to nearest $500)
  const scaleAmt = (val) => Math.round((Number(val) * tierScale) / 500) * 500;
  const effectiveRates = {
    glaRate: activeGlaRate,
    minGlaThreshold,
    agePerYear: Math.round((Number(library.ageAdjustmentPerYear ?? 1500) * tierScale) / 100) * 100,
    ageMinYearsThreshold: Number(library.ageMinYearsThreshold ?? 5),
    bed: scaleAmt(library.bedAdjustment),
    fullBath: scaleAmt(library.fullBathAdjustment),
    halfBath: scaleAmt(library.halfBathAdjustment),
    extraBathFunctional: Math.round(Number(library.extraBathFunctionalAdjustment) || 0),
    qualityStep: scaleAmt(library.qualityStepAdjustment ?? 25000),
    condUpdatedVsAsIs: scaleAmt(library.conditionUpdatedVsAsIs),
    condRenovatedVsAsIs: scaleAmt(library.conditionRenovatedVsAsIs),
    constructionCbsVsFrame: scaleAmt(library.constructionCbsVsFrameAdjustment ?? 15000),
    pool: scaleAmt(library.poolAdjustment),
    screenEnclosure: scaleAmt(6000),
    garageBay: scaleAmt(library.garageBayAdjustment),
    impactWindows: scaleAmt(library.impactWindowsAdjustment),
    shutters: Math.round((scaleAmt(library.impactWindowsAdjustment) * 0.4) / 500) * 500,
    newerRoof: scaleAmt(library.newerRoofAdjustment),
    differentSubdivision: Math.round(Number(library.differentSubdivisionAdjustment) || 0),
    differentNeighborhood: Math.round(Number(library.differentNeighborhoodAdjustment) || 0),
    waterfront: scaleAmt(library.waterfrontAdjustment),
    boatDock: scaleAmt(library.boatDockAdjustment ?? 25000),
    boatLift: scaleAmt(library.boatLiftAdjustment ?? 15000),
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
  const subjectQualMeta = getUadQualityMeta(subjectDetails.quality);
  const subjectBathCap = capBathsForBedrooms(subjectDetails);
  const subjectYearBuilt = subject?.year_built != null && Number(subject.year_built) > 1800
    ? Math.round(Number(subject.year_built))
    : null;
  const subjectEffYear = (subjectDetails.eff_year_built ?? subject?.eff_year_built) != null &&
    Number(subjectDetails.eff_year_built ?? subject?.eff_year_built) > 1800
    ? Math.round(Number(subjectDetails.eff_year_built ?? subject?.eff_year_built))
    : null;
  const subjectAnchorYear = subjectEffYear ?? subjectYearBuilt;

  const constructionContributory = (constKey) => {
    if (constKey === 'cbs') return effectiveRates.constructionCbsVsFrame;
    if (constKey === 'other') return Math.round((effectiveRates.constructionCbsVsFrame * 0.5) / 500) * 500;
    return 0;
  };

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
    const outInfo = computedOutlierMap.get(comp) || {
      isOutlier: Boolean(comp.is_outlier || comp.adjustments?.is_outlier),
      isComputedPpsfOutlier: false,
      reason: comp.outlier_reason || comp.adjustments?.outlier_reason || null
    };
    const isUsed = resolveCompIsIncluded(comp, { isComputedOutlier: outInfo.isComputedPpsfOutlier }) && Number(comp.sold_price) > 0;
    const soldPrice = Number(comp.sold_price) || 0;
    const compSqft = Number(comp.sqft) || 0;
    const compPpsf = soldPrice > 0 && compSqft > 0 ? Math.round(soldPrice / compSqft) : null;
    const monthsSinceSale = computeMonthsSinceSale(comp.sold_date, effectiveDate);
    const isOlderThan6Months = Boolean(comp.sold_date && monthsSinceSale > 6);

    const baseCompDetails = normalizeCompDetails(comp, {
      treatLegacyUneditedCountyBooleansAsUnknown: true
    });
    const compMerged = comp.building_characteristics
      ? mergeDetailsWithCountyBuilding(baseCompDetails, comp.building_characteristics)
      : {
          details: baseCompDetails,
          field_origins: comp.field_origins || {},
          county_building_meta: comp.county_building_meta || null
        };
    const compDetails = compMerged.details;
    const compFieldOrigins = compMerged.field_origins || comp.field_origins || {};
    const compBcMeta = compMerged.county_building_meta || comp.county_building_meta || null;
    const compRawQualCode = compBcMeta?.raw_quality_code || comp.raw_quality_code || null;
    const compRawQualDesc = compBcMeta?.raw_quality_desc || comp.raw_quality_desc || null;
    const compRawCondCode = compBcMeta?.raw_condition_code || comp.raw_condition_code || null;
    const compRawCondDesc = compBcMeta?.raw_condition_desc || comp.raw_condition_desc || null;
    const compCondIsDefault = Boolean(compBcMeta?.condition_is_default ?? comp.condition_is_default);
    const detailsProgress = computeDetailsProgress(compDetails);
    const countyClues = comp.county_clues || formatCountyClues(comp);
    const condMeta = getConditionMeta(compDetails.condition);
    const qualMeta = getUadQualityMeta(compDetails.quality);
    const compBathCap = capBathsForBedrooms(compDetails);

    const overrides = (comp.adjustments && typeof comp.adjustments === 'object' && comp.adjustments.overrides)
      ? comp.adjustments.overrides
      : {};

    const resolveCell = (rowKey, computedAmount, compSpecLabel, { note = '', needsInfo = false, flag = null, tooltip = null, origin = null } = {}) => {
      const hasOverride = overrides[rowKey] != null && overrides[rowKey] !== '' && !isNaN(Number(overrides[rowKey]));
      const amount = hasOverride ? Math.round(Number(overrides[rowKey])) : Math.round(computedAmount);
      return {
        key: rowKey,
        amount,
        computedAmount: Math.round(computedAmount),
        isOverridden: hasOverride,
        needsInfo: Boolean(needsInfo && !hasOverride),
        flag: flag || null,
        tooltip: tooltip || null,
        origin: origin || null,
        direction: amount > 0 ? 'add' : amount < 0 ? 'subtract' : 'neutral',
        spec: compSpecLabel,
        note
      };
    };

    // 1. Time / Market Conditions (measured ZIP/neighborhood trend over actual period, capped at ±10% unless overridden)
    const timeCalc = computeMeasuredTimeAdjustment({
      soldDate: comp.sold_date,
      soldPrice,
      monthsSinceSale,
      zipMarketData,
      fallbackMonthlyTrendPct: effectiveRates.monthlyTrendPct,
      zipTrendSource: zipTrendSource || zipMarketData?.summary?.mode_label || (subject?.zip ? `ZIP ${subject.zip}` : null)
    });
    const timeCell = resolveCell(
      'time',
      timeCalc.amount,
      comp.sold_date ? (monthsSinceSale === 0 ? 'this mo' : `${monthsSinceSale} mo ago`) : 'Date n/a',
      {
        note: timeCalc.note,
        flag: timeCalc.wasCapped ? `Capped ±${MAX_TIME_ADJUSTMENT_PCT}%` : null
      }
    );

    // 2. Gross Living Area (GLA) with South Florida minimum threshold & ±20% size check
    const sqftDiff = subjectSqft > 0 && compSqft > 0 ? subjectSqft - compSqft : 0;
    const sizeDiffPctExact = subjectSqft > 0 && compSqft > 0
      ? (Math.abs(compSqft - subjectSqft) / subjectSqft) * 100
      : 0;
    const sizeDiffPct = Math.round(sizeDiffPctExact);
    const isPoorSizeComp = subjectSqft > 0 && compSqft > 0 && sizeDiffPctExact > 20;
    const sizeFlagLabel = isPoorSizeComp ? `Size differs ${sizeDiffPct}% — poor comp` : null;
    const withinGlaThreshold = subjectSqft > 0 && compSqft > 0 && Math.abs(sqftDiff) < effectiveRates.minGlaThreshold;
    const rawGlaAdj = (subjectSqft > 0 && compSqft > 0 && !withinGlaThreshold)
      ? Math.round((sqftDiff * effectiveRates.glaRate) / 100) * 100
      : 0;
    const glaNote = withinGlaThreshold && sqftDiff !== 0
      ? `<${effectiveRates.minGlaThreshold} sf threshold`
      : (sizeFlagLabel || '');
    const glaCell = resolveCell(
      'gla',
      rawGlaAdj,
      compSqft > 0 ? `${compSqft.toLocaleString()} sf` : '—',
      {
        note: glaNote
      }
    );

    // 3. Year Built / Effective Age (CIA/CBS using eff_year_built || year_built, ±5 yr min threshold)
    const compYearBuilt = comp?.year_built != null && Number(comp.year_built) > 1800
      ? Math.round(Number(comp.year_built))
      : null;
    const compEffYear = (compDetails.eff_year_built ?? comp?.eff_year_built) != null &&
      Number(compDetails.eff_year_built ?? comp?.eff_year_built) > 1800
      ? Math.round(Number(compDetails.eff_year_built ?? comp?.eff_year_built))
      : null;
    const compAnchorYear = compEffYear ?? compYearBuilt;
    const isAgeUnknown = compAnchorYear == null;
    const yearDiff = subjectAnchorYear != null && compAnchorYear != null
      ? subjectAnchorYear - compAnchorYear
      : 0;
    const ageWithinThreshold = subjectAnchorYear != null && compAnchorYear != null &&
      Math.abs(yearDiff) < effectiveRates.ageMinYearsThreshold;
    const rawAgeAdj = (subjectAnchorYear != null && compAnchorYear != null && !ageWithinThreshold)
      ? Math.round((yearDiff * effectiveRates.agePerYear) / 500) * 500
      : 0;
    const ageNote = isAgeUnknown
      ? ''
      : subjectAnchorYear == null
        ? 'Set subject year built'
        : ageWithinThreshold && yearDiff !== 0
          ? `Within ±${effectiveRates.ageMinYearsThreshold} yr threshold`
          : yearDiff !== 0
            ? `${yearDiff > 0 ? `${yearDiff} yr older` : `${Math.abs(yearDiff)} yr newer`} @ $${effectiveRates.agePerYear.toLocaleString()}/yr`
            : `Eff. age ${Math.max(0, effYear - compAnchorYear)} yr`;
    const ageCell = resolveCell(
      'age',
      rawAgeAdj,
      formatAgeSpecLabel(compYearBuilt, compEffYear),
      {
        note: ageNote,
        needsInfo: isAgeUnknown
      }
    );

    // 4. Bedrooms & Bathrooms (Full + Half bath awareness, baths credited capped at bedrooms + 1)
    const compBeds = compDetails.beds;
    const subBeds = subjectDetails.beds;
    const compBathUnknown = compDetails.full_baths == null && compDetails.baths == null;
    const compBedBathAllUnknown = compBeds == null && compBathUnknown;

    let rawBedBathAdj = 0;
    if (subBeds != null && compBeds != null) {
      rawBedBathAdj += (subBeds - compBeds) * effectiveRates.bed;
    }
    if (subjectBathCap.creditedFull != null && compBathCap.creditedFull != null) {
      rawBedBathAdj += (subjectBathCap.creditedFull - compBathCap.creditedFull) * effectiveRates.fullBath;
      rawBedBathAdj += ((subjectBathCap.creditedHalf ?? 0) - (compBathCap.creditedHalf ?? 0)) * effectiveRates.halfBath;
    } else if (subjectBathCap.creditedTotal != null && compBathCap.creditedTotal != null) {
      const bathDiff = subjectBathCap.creditedTotal - compBathCap.creditedTotal;
      const sign = bathDiff >= 0 ? 1 : -1;
      const absDiff = Math.abs(bathDiff);
      const fullCount = Math.floor(absDiff + 1e-6);
      const hasHalf = Math.abs(absDiff - fullCount - 0.5) < 0.26;
      rawBedBathAdj += sign * (fullCount * effectiveRates.fullBath + (hasHalf ? effectiveRates.halfBath : 0));
    }
    // Excess functional baths above beds + 1 ($0 by default, editable in library)
    if (
      (subjectBathCap.excessBaths > 0 || compBathCap.excessBaths > 0) &&
      effectiveRates.extraBathFunctional !== 0
    ) {
      rawBedBathAdj += Math.round((subjectBathCap.excessBaths - compBathCap.excessBaths) * effectiveRates.extraBathFunctional);
    }

    const bedBathSpec = [
      compBeds != null ? `${compBeds} bd` : null,
      formatBathDisplay(compDetails)
    ].filter(Boolean).join(' / ') || 'Unknown';

    const bedBathFlag = compBathCap.isUnusualRatio
      ? 'Unusual bed/bath ratio'
      : null;
    const bedBathNote = compBathCap.isUnusualRatio
      ? `Credited ${compBathCap.creditedTotal} of ${compBathCap.totalBaths} ba (cap: beds+1 · ${compBathCap.excessBaths} functional @ $${effectiveRates.extraBathFunctional.toLocaleString()})`
      : (subjectBathCap.isUnusualRatio && compBathCap.creditedTotal != null
          ? `Subject baths capped at ${subjectBathCap.maxCredited} (beds+1)`
          : '');

    const bedBathCell = resolveCell('bed_bath', rawBedBathAdj, bedBathSpec, {
      note: bedBathNote,
      flag: bedBathFlag,
      needsInfo: compBedBathAllUnknown
    });

    // 5. Quality (UAD Q1–Q6): show raw county code (R1–R6 / C1–C7) next to Q rating everywhere;
    // Unknown = $0 adjustment + "Needs info" chip (county IMP_QUAL clue shown as hint only)
    const isQualityUnknown = compDetails.quality === 'unknown';
    const rawQualityAdj = (!isQualityUnknown && subjectDetails.quality !== 'unknown' && subjectQualMeta.rank != null && qualMeta.rank != null)
      ? (subjectQualMeta.rank - qualMeta.rank) * effectiveRates.qualityStep
      : 0;
    const compImpQualSuggested = mapImpQualToUadQuality(comp.imp_qual ?? countyClues?.impQualCode);
    const compQualityOrigin = compFieldOrigins.quality || null;
    const compQualitySpec = isQualityUnknown
      ? 'Unknown'
      : formatQualityWithRawCode(qualMeta, compRawQualCode, {
          isManualOverride: Boolean(compRawQualCode && compQualityOrigin === 'my_edit' && compDetails.quality !== compBcMeta?.county_quality_uad)
        });
    const compQualityTooltip = buildCountyCodeTooltip({
      label: 'County grade',
      rawCode: compRawQualCode,
      rawDesc: compRawQualDesc,
      origin: compQualityOrigin,
      rollYear: compBcMeta?.roll_year
    });
    const qualityNote = isQualityUnknown
      ? (compImpQualSuggested !== 'unknown'
          ? `County clue: ${getUadQualityMeta(compImpQualSuggested).shortLabel}`
          : '')
      : (subjectDetails.quality === 'unknown'
          ? 'Set subject quality'
          : (compQualityOrigin === 'county_record'
              ? 'county record'
              : compQualityOrigin === 'my_edit' && compRawQualCode
                ? 'my edit'
                : ''));
    const qualityCell = resolveCell(
      'quality',
      rawQualityAdj,
      compQualitySpec,
      {
        note: qualityNote,
        needsInfo: isQualityUnknown,
        tooltip: compQualityTooltip || null,
        origin: compQualityOrigin
      }
    );

    // 6. Condition (UAD C1–C6):
    // Unknown = $0 adjustment + "Needs info" chip + weight reduced.
    // Palm Beach AV default (condition_is_default = true) stays 'unknown' unless manually confirmed ->
    // labeled "county default (not inspected)" and NEVER creates condition adjustments.
    const isConditionUnknown = compDetails.condition === 'unknown';
    const compConditionOrigin = compFieldOrigins.condition || null;
    const isUnconfirmedDefaultCond = isConditionUnknown && compCondIsDefault;
    const rawCondAdj = (!isConditionUnknown && subjectDetails.condition !== 'unknown')
      ? conditionContributory(subjectDetails.condition) - conditionContributory(compDetails.condition)
      : 0;
    const compCondTooltip = buildCountyCodeTooltip({
      label: 'County condition',
      rawCode: compRawCondCode,
      rawDesc: compRawCondDesc,
      origin: compConditionOrigin,
      rollYear: compBcMeta?.roll_year,
      isDefaultCondition: isUnconfirmedDefaultCond
    });
    const condNote = isUnconfirmedDefaultCond
      ? `${compRawCondCode || 'AV'} · county default (not inspected)`
      : !isConditionUnknown
        ? [
            typeof compDetails.kitchen_baths_updated === 'boolean'
              ? (compDetails.kitchen_baths_updated ? 'K&B updated' : 'Orig. K&B')
              : null,
            compConditionOrigin === 'county_record' && compRawCondCode
              ? `county record (${compRawCondCode})`
              : null,
            subjectDetails.condition === 'unknown'
              ? 'Confirm subject condition'
              : null
          ].filter(Boolean).join(' · ')
        : '';
    const conditionCell = resolveCell(
      'condition',
      rawCondAdj,
      isConditionUnknown ? 'Unknown' : condMeta.shortLabel,
      {
        note: condNote,
        needsInfo: isConditionUnknown,
        tooltip: compCondTooltip || null,
        origin: compConditionOrigin
      }
    );

    // 7. Construction (CBS / wood frame / other): Unknown = $0 + "Needs info" (county CONST_CLASS shown as clue)
    const isConstructionUnknown = !compDetails.construction_type || compDetails.construction_type === 'unknown';
    const subjectConstKnown = Boolean(subjectDetails.construction_type && subjectDetails.construction_type !== 'unknown');
    const rawConstructionAdj = (!isConstructionUnknown && subjectConstKnown)
      ? constructionContributory(subjectDetails.construction_type) - constructionContributory(compDetails.construction_type)
      : 0;
    const compConstClue = mapConstClassToConstructionType(comp.const_class ?? countyClues?.constClassCode);
    const compConstructionLabel = !isConstructionUnknown
      ? formatConstructionTypeLabel(compDetails.construction_type)
      : (compConstClue !== 'unknown' ? formatConstructionTypeLabel(compConstClue) : null);
    const constructionNote = isConstructionUnknown
      ? (compConstClue !== 'unknown' ? `County clue: ${formatConstructionTypeLabel(compConstClue)}` : '')
      : (!subjectConstKnown ? 'Set subject construction' : '');
    const constructionCell = resolveCell(
      'construction',
      rawConstructionAdj,
      isConstructionUnknown ? 'Unknown' : formatConstructionTypeLabel(compDetails.construction_type),
      {
        note: constructionNote,
        needsInfo: isConstructionUnknown
      }
    );

    // 8. Windows (impact / shutters / none): Unknown = $0 adjustment + "Needs info" chip + weight reduced
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

    // 9. Roof (type + roof year): Unknown = $0 adjustment + "Needs info" chip + weight reduced
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
    const roofNote = !isRoofUnknown && compDetails.roof_year == null ? 'Roof yr not set' : '';
    const roofCell = resolveCell(
      'roof',
      rawRoofAdj,
      isRoofUnknown ? 'Unknown' : formatRoofSpecLabel(compDetails),
      {
        note: roofNote,
        needsInfo: isRoofUnknown
      }
    );

    // 10. Pool & Outdoor: Unknown = $0 adjustment + "Needs info" chip + weight reduced
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

    // 11. Garage & Parking: Unknown = $0 adjustment + "Needs info" chip + weight reduced
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

    // 12. Location — Same subdivision / Different + flag when subdivision matches but NBRHD_CD differs
    const subCountyNorm = normalizeCountyName(subject?.parcel_county || subject?.county);
    const compCountyNorm = normalizeCountyName(comp?.parcel_county || comp?.county);
    const subLocRef = {
      county: subCountyNorm,
      subdivision_name: subject?.subdivision_name || null,
      subdivision_code: subject?.subdivision_code || null
    };
    const compLocRef = {
      county: compCountyNorm,
      subdivision_name: comp?.subdivision_name || null,
      subdivision_code: comp?.subdivision_code || null
    };
    const hasSubjectSubdiv = Boolean(subLocRef.subdivision_name || subLocRef.subdivision_code);
    const hasCompSubdiv = Boolean(compLocRef.subdivision_name || compLocRef.subdivision_code);
    const sameSubdiv = hasSubjectSubdiv && hasCompSubdiv
      ? isSameSubdivision(subLocRef, compLocRef)
      : null;

    const subNbrhdCd = subject?.nbrhd_cd ? String(subject.nbrhd_cd).trim() : null;
    const compNbrhdCd = comp.nbrhd_cd ? String(comp.nbrhd_cd).trim() : null;
    const sameNbrhd = subNbrhdCd && compNbrhdCd
      ? (subCountyNorm && compCountyNorm && subCountyNorm !== compCountyNorm ? false : subNbrhdCd === compNbrhdCd)
      : null;
    const sameSubdivDifferentNbrhd = Boolean(sameSubdiv === true && sameNbrhd === false);

    const rawSubdivAdj = sameSubdiv === false
      ? effectiveRates.differentSubdivision
      : sameSubdivDifferentNbrhd
        ? effectiveRates.differentNeighborhood
        : 0;
    const subdivSpec = sameSubdiv === true
      ? 'Same subdivision'
      : sameSubdiv === false
        ? 'Different'
        : 'Unknown';
    const compHoa = compDetails.hoa_name || comp.hoa_name || '';
    const subdivNote = [
      sameSubdivDifferentNbrhd ? `Different appraisal neighborhood (${compNbrhdCd} vs ${subNbrhdCd})` : null,
      compLocRef.subdivision_name,
      !sameSubdivDifferentNbrhd && compNbrhdCd ? `Nbrhd ${compNbrhdCd}` : null,
      compHoa ? `HOA: ${compHoa}` : null
    ]
      .filter(Boolean)
      .join(' · ');
    const locationSubdivisionCell = resolveCell(
      'location_subdivision',
      rawSubdivAdj,
      subdivSpec,
      {
        note: subdivNote,
        flag: sameSubdivDifferentNbrhd ? 'Different appraisal neighborhood' : null
      }
    );

    // 13. Waterfront & View (strictly $0 + "Needs info" when comp view is Unknown — never guess)
    const isWaterfrontUnknown = compDetails.waterfront_view === 'unknown';
    const waterAdjPart = (!isWaterfrontUnknown && subjectDetails.waterfront_view !== 'unknown')
      ? waterfrontContributory(subjectDetails.waterfront_view) - waterfrontContributory(compDetails.waterfront_view)
      : 0;
    const waterfrontNote = isWaterfrontUnknown
      ? 'View unknown ($0)'
      : (subjectDetails.waterfront_view === 'unknown' ? 'Set subject view to adjust' : '');
    const locationSiteCell = resolveCell(
      'location_site',
      waterAdjPart,
      isWaterfrontUnknown ? 'Unknown' : formatWaterfrontOnlyLabel(compDetails),
      {
        note: waterfrontNote,
        needsInfo: isWaterfrontUnknown
      }
    );

    // 14. Boat Dock / Lift: Unknown = $0 + "Needs info" chip
    const isBoatDockUnknown = compDetails.boat_dock === null;
    const subjectBoatDockKnown = subjectDetails.boat_dock !== null;
    let rawBoatDockAdj = 0;
    if (!isBoatDockUnknown && subjectBoatDockKnown) {
      const subHasDock = subjectDetails.boat_dock === true ? 1 : 0;
      const compHasDock = compDetails.boat_dock === true ? 1 : 0;
      rawBoatDockAdj += (subHasDock - compHasDock) * effectiveRates.boatDock;

      const subLiftBool = subjectDetails.boat_dock === false ? false : subjectDetails.boat_lift;
      const compLiftBool = compDetails.boat_dock === false ? false : compDetails.boat_lift;
      if (typeof subLiftBool === 'boolean' && typeof compLiftBool === 'boolean') {
        rawBoatDockAdj += ((subLiftBool ? 1 : 0) - (compLiftBool ? 1 : 0)) * effectiveRates.boatLift;
      }
    }
    const compBoatDockLabel = formatBoatDockLabel(compDetails);
    const boatDockNote = isBoatDockUnknown
      ? ''
      : !subjectBoatDockKnown
        ? 'Set subject dock/lift'
        : (compDetails.boat_dock === true && compDetails.boat_lift === null ? 'Lift unknown' : '');
    const boatDockCell = resolveCell(
      'boat_dock',
      rawBoatDockAdj,
      isBoatDockUnknown ? 'Unknown' : (compBoatDockLabel || 'Unknown'),
      {
        note: boatDockNote,
        needsInfo: isBoatDockUnknown
      }
    );

    // 15. Lot Size (separate row so site area never masquerades as a waterfront/view adjustment)
    // CIA/CBS sign: subjectLotSqft - compLotSqft -> larger comp lot is superior (CBS -> subtract -)
    const compLotSqft = Number(comp.lot_sqft) || 0;
    const lotDiff = subjectLotSqft > 0 && compLotSqft > 0 ? subjectLotSqft - compLotSqft : 0;
    const lotWithinThreshold = subjectLotSqft > 0 && compLotSqft > 0 && Math.abs(lotDiff) < effectiveRates.lotMinThreshold;
    const lotAdjPart = (subjectLotSqft > 0 && compLotSqft > 0 && !lotWithinThreshold)
      ? Math.round((lotDiff * effectiveRates.lotSqftRate) / 500) * 500
      : 0;
    const lotDiffSign = lotDiff > 0 ? '+' : '\u2212';
    const lotNote = (subjectLotSqft > 0 && compLotSqft > 0)
      ? (lotWithinThreshold
          ? `Within \u00B1${effectiveRates.lotMinThreshold.toLocaleString()} sf threshold`
          : `${lotDiffSign}${Math.abs(Math.round(lotDiff)).toLocaleString()} sf @ $${effectiveRates.lotSqftRate}/sf`)
      : '';
    const lotSizeCell = resolveCell(
      'lot_size',
      lotAdjPart,
      compLotSqft > 0 ? `${Math.round(compLotSqft).toLocaleString()} sf` : 'Unknown',
      {
        note: lotNote,
        needsInfo: compLotSqft <= 0
      }
    );

    const cells = {
      time: timeCell,
      gla: glaCell,
      age: ageCell,
      bed_bath: bedBathCell,
      quality: qualityCell,
      condition: conditionCell,
      construction: constructionCell,
      windows: windowsCell,
      roof: roofCell,
      pool: poolCell,
      garage: garageCell,
      location_subdivision: locationSubdivisionCell,
      location_site: locationSiteCell,
      boat_dock: boatDockCell,
      lot_size: lotSizeCell
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

    // Count unknown core features (condition, windows, roof, pool, garage, waterfront) -> reduce weight
    const unknownFeatureKeys = [
      isConditionUnknown ? 'condition' : null,
      isWindowsUnknown ? 'windows' : null,
      isRoofUnknown ? 'roof' : null,
      isPoolUnknown ? 'pool' : null,
      isGarageUnknown ? 'garage' : null,
      isWaterfrontUnknown ? 'waterfront' : null
    ].filter(Boolean);
    const unknownFeatureCount = unknownFeatureKeys.length;

    // Auto-weight score:
    // Monotonically falls as gross adjustment % rises (with steep cliff >25% Fannie Mae limit),
    // penalizes >±20% GLA size mismatch, older sales (>6 mo), unverified comps, and missing details.
    const wGrossBase = 1 / (1 + Math.pow(grossAdjustmentPct / 12, 1.5));
    const wGross = isHighGross
      ? wGrossBase * Math.pow(25 / grossAdjustmentPct, 2)
      : wGrossBase;

    const wSizeBase = 1 / (1 + sizeDiffPctExact / 25);
    const wSize = isPoorSizeComp
      ? wSizeBase * Math.pow(20 / sizeDiffPctExact, 1.5)
      : wSizeBase;

    const distMi = comp.distance_mi != null && !isNaN(Number(comp.distance_mi)) ? Number(comp.distance_mi) : 0.5;
    const wRecency = (1 / (1 + monthsSinceSale / 6)) * (isOlderThan6Months ? 0.55 : 1.0);
    const wDistance = 1 / (1 + distMi / 0.75);
    const isVerified = Boolean(compDetails.verified);
    const wVerified = isVerified ? 1.0 : 0.75;
    const wCompleteness = Math.pow(0.86, unknownFeatureCount);
    const wConditionParity = isConditionUnknown
      ? 0.9
      : ((mode === 'arv' ? condMeta.isRenovated : !condMeta.isRenovated) ? 1.12 : 0.88);

    const rawAutoScore = isUsed
      ? Math.max(0.00001, wGross * wSize * wRecency * wDistance * wVerified * wCompleteness * wConditionParity)
      : 0;

    const weightReasons = [];
    if (outInfo.isOutlier) weightReasons.push('Outlier (>40% median $/sf · 25% cap)');
    if (isHighGross) weightReasons.push(`${grossAdjustmentPct.toFixed(1)}% gross adj (>25%)`);
    if (isPoorSizeComp) weightReasons.push(`Size differs ${sizeDiffPct}% (>±20%)`);
    if (isOlderThan6Months) weightReasons.push(`${monthsSinceSale} mo old (>6 mo)`);
    if (!isVerified) weightReasons.push('Unverified');
    if (unknownFeatureCount > 0) {
      weightReasons.push(`${unknownFeatureCount} ${unknownFeatureCount === 1 ? 'detail' : 'details'} missing`);
    }

    const weightBreakdown = {
      wGross: Math.round(wGross * 10000) / 10000,
      wSize: Math.round(wSize * 1000) / 1000,
      wRecency: Math.round(wRecency * 1000) / 1000,
      wDistance: Math.round(wDistance * 1000) / 1000,
      wVerified,
      wCompleteness: Math.round(wCompleteness * 1000) / 1000,
      wConditionParity
    };

    const weightTooltip = [
      `Formula: ${WEIGHT_FORMULA_SUMMARY}`,
      `This comp: Gross ${grossAdjustmentPct.toFixed(1)}% (×${wGross.toFixed(3)}) · Size ${sizeDiffPct}% diff (×${wSize.toFixed(2)}) · Age ${monthsSinceSale} mo (×${wRecency.toFixed(2)}) · Dist ${distMi} mi (×${wDistance.toFixed(2)}) · ${isVerified ? 'Verified (×1.00)' : 'Unverified (×0.75)'} · ${unknownFeatureCount} missing (×${wCompleteness.toFixed(2)}) · Cond (×${wConditionParity.toFixed(2)})${outInfo.isOutlier ? ' · Outlier max 25%' : ''}`
    ].join('\n');

    return {
      ...comp,
      isUsed,
      isOutlier: outInfo.isOutlier,
      isComputedPpsfOutlier: outInfo.isComputedPpsfOutlier,
      outlierReason: outInfo.reason,
      isWeightCapped: false,
      soldPrice,
      compSqft,
      compPpsf,
      sizeDiffPct,
      sizeDiffPctExact: Math.round(sizeDiffPctExact * 10) / 10,
      isPoorSizeComp,
      sizeFlagLabel,
      isUnusualBedBathRatio: compBathCap.isUnusualRatio,
      bathCap: compBathCap,
      sameSubdivDifferentNbrhd,
      monthsSinceSale,
      isOlderThan6Months,
      distanceMi: distMi,
      conditionMeta: condMeta,
      qualityMeta: qualMeta,
      compDetails,
      fieldOrigins: compFieldOrigins,
      rawQualityCode: compRawQualCode,
      rawQualityDesc: compRawQualDesc,
      rawConditionCode: compRawCondCode,
      rawConditionDesc: compRawCondDesc,
      conditionIsDefault: compCondIsDefault,
      detailsProgress,
      countyClues,
      sameSubdivision: sameSubdiv,
      sameNeighborhood: sameNbrhd,
      nbrhdCd: compNbrhdCd,
      boatDockLabel: compBoatDockLabel,
      constructionLabel: compConstructionLabel,
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
      weightBreakdown,
      weightReasons,
      weightTooltip,
      autoWeight: 0,
      weight: 0,
      weightPct: 0
    };
  });

  // Compute auto-weights normalized across USED comps with 25% max cap on outlier comps
  const usedEvaluated = evaluatedComps.filter((c) => c.isUsed);
  const {
    weights: cappedAutoWeights,
    cappedIds: autoCappedIds,
    cannotCapAllOutliers
  } = applyOutlierWeightCap(
    usedEvaluated,
    usedEvaluated.map((c) => c.rawAutoScore),
    OUTLIER_MAX_WEIGHT_FRACTION
  );
  usedEvaluated.forEach((c, idx) => {
    c.autoWeight = cappedAutoWeights[idx] || 0;
  });

  // Apply customWeights if provided, else use capped autoWeight
  const hasCustomWeights = customWeights && typeof customWeights === 'object' &&
    usedEvaluated.some((c) => customWeights[c.id] != null && customWeights[c.id] !== '');

  const hasNonOutlierUsed = usedEvaluated.some((c) => !c.isOutlier);

  if (hasCustomWeights && usedEvaluated.length > 0) {
    usedEvaluated.forEach((c) => {
      let pct = customWeights[c.id] != null
        ? Math.max(0, Number(customWeights[c.id]) || 0)
        : Math.round(c.autoWeight * 1000) / 10;
      if (c.isOutlier && hasNonOutlierUsed && pct > OUTLIER_MAX_WEIGHT_FRACTION * 100) {
        pct = OUTLIER_MAX_WEIGHT_FRACTION * 100;
        c.isWeightCapped = true;
      }
      c.weightPct = Math.round(pct * 10) / 10;
      c.weight = c.weightPct / 100;
    });
  } else if (usedEvaluated.length > 0) {
    // Round display percentages cleanly to 1 decimal while preserving 25% outlier cap & sum === 100.0%
    const roundedPcts = usedEvaluated.map((c) => {
      let p = Math.round(c.autoWeight * 1000) / 10;
      if (c.isOutlier && !cannotCapAllOutliers && p > 25) {
        p = 25;
      }
      return p;
    });
    const sumRounded = Math.round(roundedPcts.reduce((a, b) => a + b, 0) * 10) / 10;
    const residual = Math.round((100 - sumRounded) * 10) / 10;
    if (Math.abs(residual) > 0) {
      // Apply rounding residual to a non-outlier comp when possible so outlier stays strictly <= 25.0%
      let targetIdx = usedEvaluated.length - 1;
      for (let i = usedEvaluated.length - 1; i >= 0; i--) {
        if (!usedEvaluated[i].isOutlier) {
          targetIdx = i;
          break;
        }
      }
      roundedPcts[targetIdx] = Math.max(0, Math.round((roundedPcts[targetIdx] + residual) * 10) / 10);
    }
    usedEvaluated.forEach((c, idx) => {
      c.weightPct = roundedPcts[idx];
      c.weight = c.weightPct / 100;
      if (autoCappedIds.has(c.id)) {
        c.isWeightCapped = true;
      }
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
  const poorSizeComps = usedEvaluated.filter((c) => c.isPoorSizeComp);
  const maxSizeDiffPct = poorSizeComps.length > 0
    ? Math.max(...poorSizeComps.map((c) => c.sizeDiffPct))
    : 0;
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

  // Compute numeric confidencePct (0..100) + strict LOW confidence gates with reasons
  const maxCompWeightPct = usedEvaluated.length > 0
    ? Math.max(...usedEvaluated.map((c) => Number(c.weightPct) || 0))
    : 0;
  const maxWeightComp = usedEvaluated.find((c) => Number(c.weightPct) === maxCompWeightPct) || null;
  const mostCompsHighGross = usedEvaluated.length > 0 && highGrossComps.length > usedEvaluated.length / 2;
  const lowConfidenceReasons = [];

  let confidencePct = 20;
  if (usedEvaluated.length === 0) {
    confidencePct = 0;
    lowConfidenceReasons.push('No active comparable sales enabled');
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

    // Slight confidence deduction if comps still have missing core features
    const avgUnknowns = usedEvaluated.reduce((a, c) => a + c.unknownFeatureCount, 0) / usedEvaluated.length;
    if (avgUnknowns >= 4) confidencePct -= 8;
    else if (avgUnknowns >= 2.5) confidencePct -= 4;

    if (maxCompWeightPct > 60) {
      const compLabel = maxWeightComp?.address ? maxWeightComp.address.split(',')[0] : 'One comp';
      lowConfidenceReasons.push(
        `${compLabel} carries ${maxCompWeightPct.toFixed(1)}% of weight (>60%)`
      );
    }
    if (usedEvaluated.length >= 2 && cvPct > 25) {
      lowConfidenceReasons.push(
        `Adjusted $/sf spread is ${cvPct.toFixed(1)}% CV (>25%)`
      );
    }
    if (mostCompsHighGross) {
      lowConfidenceReasons.push(
        `${highGrossComps.length} of ${usedEvaluated.length} comps exceed 25% gross adjustment`
      );
    }
    if (cannotCapAllOutliers) {
      lowConfidenceReasons.push('Only $/sf outlier comps are enabled');
    }
    if (mode === 'arv' && renovatedUsedCount === 0) {
      lowConfidenceReasons.push('0 renovated comps enabled for ARV');
    }
    if (!weightValidation.valid) {
      lowConfidenceReasons.push('Reconciliation weights do not sum to 100%');
    }

    if (lowConfidenceReasons.length > 0) {
      const hardCap = !weightValidation.valid ? 30 : 38;
      confidencePct = Math.min(confidencePct, hardCap);
    }

    confidencePct = Math.max(8, Math.min(98, Math.round(confidencePct)));
  }

  const confidenceScore = lowConfidenceReasons.length > 0
    ? 'Low'
    : (confidencePct >= 75 ? 'High' : confidencePct >= 50 ? 'Medium' : 'Low');

  // County Just Value & Income/Land Check Sanity Anchors
  const subjectJustValue = Number(subject?.just_value) || 0;
  const rawJustValueDiv85 = subjectJustValue > 0 ? Math.round(subjectJustValue / 0.85) : null;
  const justValueDiv85 = rawJustValueDiv85 != null
    ? roundAppraisalValue(rawJustValueDiv85, library.roundingIncrement)
    : null;
  const countyJustValueAnchor = subjectJustValue > 0
    ? {
        justValue: Math.round(subjectJustValue),
        rawImpliedMarketValue: rawJustValueDiv85,
        impliedMarketValue: justValueDiv85,
        landValue: subjectImpMetrics?.landVal ?? null,
        improvementValue: subjectImpMetrics?.improvementVal ?? null,
        landSharePct: subjectImpMetrics?.landSharePct ?? null,
        improvementPpsf: subjectImpMetrics?.impPpsf ?? null,
        deltaPctVsReconciled:
          reconciledValue && rawJustValueDiv85
            ? Math.round(((reconciledValue - rawJustValueDiv85) / rawJustValueDiv85) * 100)
            : null
      }
    : null;

  // Nearest same-street sale anchor (combining grid comps + county roll same-street sale)
  const subAddrNorm = normalizeAddress(subject?.address || '');
  const subHouseNum = subAddrNorm.number ? parseInt(subAddrNorm.number.replace(/\D/g, ''), 10) : NaN;
  const sameStreetCandidates = [];

  if (subAddrNorm.street) {
    for (const c of evaluatedComps) {
      if (!(c.soldPrice > 0) || !c.address) continue;
      const cNorm = normalizeAddress(c.address);
      if (!cNorm.street || cNorm.street !== subAddrNorm.street) continue;
      if (subject?.parcel_id && c.parcel_id && String(c.parcel_id) === String(subject.parcel_id)) continue;
      if (subAddrNorm.number && cNorm.number === subAddrNorm.number) continue;
      const cNum = cNorm.number ? parseInt(cNorm.number.replace(/\D/g, ''), 10) : NaN;
      const numDiff = !isNaN(subHouseNum) && !isNaN(cNum) ? Math.abs(subHouseNum - cNum) : Number.MAX_SAFE_INTEGER;
      sameStreetCandidates.push({
        address: c.address,
        soldPrice: Math.round(c.soldPrice),
        soldDate: c.sold_date || null,
        sqft: c.compSqft > 0 ? Math.round(c.compSqft) : null,
        ppsf: c.compPpsf || null,
        distanceMi: c.distance_mi != null && !isNaN(Number(c.distance_mi)) ? Number(c.distance_mi) : null,
        source: 'comp',
        _distSort: c.distance_mi != null && !isNaN(Number(c.distance_mi)) ? Number(c.distance_mi) : Number.MAX_SAFE_INTEGER,
        _numDiff: numDiff,
        _monthsSort: c.monthsSinceSale ?? 999
      });
    }
  }

  const countyStreetRaw = subject?.nearest_same_street_sale;
  if (countyStreetRaw && Number(countyStreetRaw.sold_price) > 0 && countyStreetRaw.address) {
    const cNorm = normalizeAddress(countyStreetRaw.address);
    const cNum = cNorm.number ? parseInt(cNorm.number.replace(/\D/g, ''), 10) : NaN;
    const numDiff = !isNaN(subHouseNum) && !isNaN(cNum) ? Math.abs(subHouseNum - cNum) : Number.MAX_SAFE_INTEGER;
    const salePrice = Math.round(Number(countyStreetRaw.sold_price));
    const sqft = Number(countyStreetRaw.sqft || countyStreetRaw.living_sqft) || null;
    const dist = countyStreetRaw.distance_mi != null && !isNaN(Number(countyStreetRaw.distance_mi))
      ? Number(countyStreetRaw.distance_mi)
      : null;
    sameStreetCandidates.push({
      address: countyStreetRaw.address,
      soldPrice: salePrice,
      soldDate: countyStreetRaw.sold_date || null,
      sqft: sqft ? Math.round(sqft) : null,
      ppsf: countyStreetRaw.ppsf || (sqft ? Math.round(salePrice / sqft) : null),
      distanceMi: dist,
      source: 'county_roll',
      _distSort: dist != null ? dist : Number.MAX_SAFE_INTEGER,
      _numDiff: numDiff,
      _monthsSort: computeMonthsSinceSale(countyStreetRaw.sold_date, effectiveDate)
    });
  }

  let nearestSameStreetSale = null;
  if (sameStreetCandidates.length > 0) {
    sameStreetCandidates.sort((a, b) => {
      if (Math.abs(a._distSort - b._distSort) > 0.03) return a._distSort - b._distSort;
      if (a._numDiff !== b._numDiff) return a._numDiff - b._numDiff;
      return a._monthsSort - b._monthsSort;
    });
    const best = sameStreetCandidates[0];
    nearestSameStreetSale = {
      address: best.address,
      soldPrice: best.soldPrice,
      soldDate: best.soldDate,
      sqft: best.sqft,
      ppsf: best.ppsf,
      distanceMi: best.distanceMi,
      source: best.source,
      deltaPctVsReconciled:
        reconciledValue && best.soldPrice
          ? Math.round(((reconciledValue - best.soldPrice) / best.soldPrice) * 100)
          : null
    };
  }

  const referencePriceAnchor = subjectPricing.referencePrice > 0
    ? {
        priceSource: subjectPricing.priceSource,
        label: subjectPricing.shortLabel,
        price: subjectPricing.referencePrice,
        ppsf: subjectSqft > 0 ? Math.round(subjectPricing.referencePrice / subjectSqft) : null,
        deltaPctVsReconciled:
          reconciledValue && subjectPricing.referencePrice
            ? Math.round(((reconciledValue - subjectPricing.referencePrice) / subjectPricing.referencePrice) * 1000) / 10
            : null
      }
    : null;

  const sanityAnchors = {
    countyJustValueAnchor,
    nearestSameStreetSale,
    referencePriceAnchor
  };

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
      detail: `${ratio.toFixed(2)}× county just value ($${Math.round(subjectJustValue).toLocaleString()} · JV÷0.85 = $${(justValueDiv85 || rawJustValueDiv85).toLocaleString()})${inRange ? ' — within South FL market band' : ' — verify condition/lot premium'}`
    };
  }

  const unusualRatioComps = usedEvaluated.filter((c) => c.isUnusualBedBathRatio);
  const diffNbrhdComps = usedEvaluated.filter((c) => c.sameSubdivDifferentNbrhd);

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
    ...(maxCompWeightPct > 60
      ? [{
          id: 'weight_concentration',
          status: 'fail',
          label: 'Single-Comp Weight Concentration',
          detail: `${maxWeightComp?.address ? maxWeightComp.address.split(',')[0] : 'One comp'} carries ${maxCompWeightPct.toFixed(1)}% (>60% max) — Confidence lowered to Low`
        }]
      : []),
    ...(usedEvaluated.length >= 2 && cvPct > 25
      ? [{
          id: 'spread_cv',
          status: 'fail',
          label: 'Wide Adjusted $/sf Dispersion',
          detail: `Spread is ${cvPct.toFixed(1)}% CV (>25%) — Confidence lowered to Low`
        }]
      : []),
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
    ...(subjectBathCap.isUnusualRatio || unusualRatioComps.length > 0
      ? [{
          id: 'bed_bath_ratio',
          status: 'warn',
          label: 'Unusual Bed / Bath Ratio',
          detail: [
            subjectBathCap.isUnusualRatio
              ? `Subject (${subjectBathCap.beds} bd / ${subjectBathCap.totalBaths} ba) capped at ${subjectBathCap.maxCredited} baths`
              : null,
            unusualRatioComps.length > 0
              ? `${unusualRatioComps.length} USED ${unusualRatioComps.length === 1 ? 'comp exceeds' : 'comps exceed'} beds+1 baths`
              : null
          ].filter(Boolean).join(' · ') + ' — extra baths credited at $' + effectiveRates.extraBathFunctional.toLocaleString() + ' (editable)'
        }]
      : []),
    ...(diffNbrhdComps.length > 0
      ? [{
          id: 'different_appraisal_neighborhood',
          status: 'warn',
          label: 'Different Appraisal Neighborhood',
          detail: `${diffNbrhdComps.length} same-subdivision ${diffNbrhdComps.length === 1 ? 'comp has' : 'comps have'} a different NBRHD_CD — review Location adjustment`
        }]
      : []),
    {
      id: 'fannie_mae_net_gross',
      status: usedEvaluated.length === 0
        ? 'warn'
        : mostCompsHighGross
          ? 'fail'
          : (highNetComps.length === 0 && highGrossComps.length === 0 ? 'pass' : 'warn'),
      label: 'Net ≤ 15% · Gross ≤ 25% Guideline',
      detail: usedEvaluated.length === 0
        ? 'Add comps to evaluate adjustment ratios'
        : (highNetComps.length === 0 && highGrossComps.length === 0
          ? `All USED comps within Fannie Mae limits (avg ${(avgGrossPct || 0).toFixed(1)}% gross)`
          : `${highNetComps.length > 0 ? `${highNetComps.length} >15% net` : ''}${highNetComps.length > 0 && highGrossComps.length > 0 ? ' · ' : ''}${highGrossComps.length > 0 ? `${highGrossComps.length} >25% gross` : ''} — reduce weight on dissimilar comps`)
    },
    {
      id: 'size_similarity',
      status: subjectSqft <= 0 || usedEvaluated.length === 0
        ? 'warn'
        : poorSizeComps.length === 0
          ? 'pass'
          : poorSizeComps.length === usedEvaluated.length
            ? 'fail'
            : 'warn',
      label: 'Size Match (±20% Living Area)',
      detail: subjectSqft <= 0
        ? 'Enter subject living sqft to verify ±20% comp size similarity'
        : usedEvaluated.length === 0
          ? 'Add comps within ±20% of subject living area'
          : poorSizeComps.length === 0
            ? `All USED comps within ±20% of ${subjectSqft.toLocaleString()} sf subject`
            : `${poorSizeComps.length} of ${usedEvaluated.length} USED ${poorSizeComps.length === 1 ? 'comp differs' : 'comps differ'} >20% from ${subjectSqft.toLocaleString()} sf subject (up to ${maxSizeDiffPct}%) — weight reduced. Switch the comps filter to ±20% size and widen the radius to find closer matches.`
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

  // Build transparent time trend source summary
  const timeTrendSource = (() => {
    if (zipMarketData?.summary) {
      const scope = zipTrendSource || zipMarketData.summary.mode_label || (zipMarketData.summary.zip ? `ZIP ${zipMarketData.summary.zip}` : 'Market');
      const through = zipMarketData.summary.complete_through ? `through ${zipMarketData.summary.complete_through}` : 'measured series';
      return `${scope} measured $/sf (${through} · capped ±${MAX_TIME_ADJUSTMENT_PCT}%)`;
    }
    if (zipTrendSource) {
      return `${zipTrendSource} (capped ±${MAX_TIME_ADJUSTMENT_PCT}%)`;
    }
    return `Library default (${effectiveRates.monthlyTrendPct > 0 ? '+' : ''}${effectiveRates.monthlyTrendPct}%/mo · capped ±${MAX_TIME_ADJUSTMENT_PCT}%)`;
  })();

  const resolvedSubjectConstDetail =
    subjectDetails.construction_detail ||
    subject?.construction_detail ||
    subject?.subject_details?.construction_detail ||
    null;

  const subjectFieldOrigins = subjectDetails.field_origins || {};
  const subjectBcMeta = subjectDetails.county_building_meta || null;
  const subjectRawQualCode = subjectBcMeta?.raw_quality_code || subject?.raw_quality_code || null;
  const subjectRawQualDesc = subjectBcMeta?.raw_quality_desc || subject?.raw_quality_desc || null;
  const subjectRawCondCode = subjectBcMeta?.raw_condition_code || subject?.raw_condition_code || null;
  const subjectRawCondDesc = subjectBcMeta?.raw_condition_desc || subject?.raw_condition_desc || null;
  const subjectCondIsDefault = Boolean(
    subjectBcMeta?.condition_is_default && subjectDetails.condition === 'unknown'
  );
  const subjectQualityLabel = subjectDetails.quality === 'unknown'
    ? 'Unknown'
    : formatQualityWithRawCode(subjectQualMeta, subjectRawQualCode, {
        isManualOverride: Boolean(
          subjectRawQualCode &&
          subjectFieldOrigins.quality === 'my_edit' &&
          subjectDetails.quality !== subjectBcMeta?.county_quality_uad
        )
      });
  const subjectQualityTooltip = buildCountyCodeTooltip({
    label: 'County grade',
    rawCode: subjectRawQualCode,
    rawDesc: subjectRawQualDesc,
    origin: subjectFieldOrigins.quality,
    rollYear: subjectBcMeta?.roll_year
  });
  const subjectConditionTooltip = buildCountyCodeTooltip({
    label: 'County condition',
    rawCode: subjectRawCondCode,
    rawDesc: subjectRawCondDesc,
    origin: subjectFieldOrigins.condition,
    rollYear: subjectBcMeta?.roll_year,
    isDefaultCondition: subjectCondIsDefault
  });

  return {
    mode,
    sizeMethod: effectiveSizeMethod,
    requestedSizeMethod: sizeMethod,
    glaRateSource,
    improvementGlaRate,
    improvementGlaSampleLabel: improvementGlaSampleLabel || null,
    subjectLandSharePct: subjectImpMetrics?.landSharePct ?? null,
    isLandHeavySubject,
    tier,
    library,
    effectiveRates,
    zipTrendSource,
    timeTrendSource,
    timeAdjustmentCapPct: MAX_TIME_ADJUSTMENT_PCT,
    medianUnadjustedPrice,
    localMedianPpsf: localMedianPpsf ? Math.round(localMedianPpsf) : null,
    subjectDetails,
    subjectDetailsProgress,
    subjectSummary: {
      address: subject?.address || 'Subject Property',
      listPrice: Number(subject?.list_price) > 0 ? Number(subject.list_price) : null,
      pricing: subjectPricing,
      priceSource: subjectPricing.priceSource,
      priceSourceLabel: subjectPricing.shortLabel,
      headerPriceLabel: subjectPricing.headerPriceLabel,
      priceColumnText: subjectPricing.subjectColumnText,
      unadjustedRowText: subjectPricing.unadjustedRowText,
      offerPrice: subjectPricing.offerPrice,
      justValue: subjectJustValue > 0 ? subjectJustValue : null,
      landValue: subjectImpMetrics?.landVal ?? null,
      improvementValue: subjectImpMetrics?.improvementVal ?? null,
      landSharePct: subjectImpMetrics?.landSharePct ?? null,
      sqft: subjectSqft,
      yearBuilt: subjectYearBuilt,
      effYearBuilt: subjectEffYear,
      ageLabel: formatAgeSpecLabel(subjectYearBuilt, subjectEffYear),
      beds: subjectDetails.beds,
      baths: subjectDetails.baths,
      bathCap: subjectBathCap,
      isUnusualBedBathRatio: subjectBathCap.isUnusualRatio,
      bedBathLabel: [
        subjectDetails.beds != null ? `${subjectDetails.beds} bd` : null,
        formatBathDisplay(subjectDetails)
      ].filter(Boolean).join(' / ') || 'Add beds/baths',
      qualityLabel: subjectQualityLabel,
      qualityTooltip: subjectQualityTooltip || null,
      rawQualityCode: subjectRawQualCode,
      rawQualityDesc: subjectRawQualDesc,
      conditionLabel: subjectDetails.condition === 'unknown'
        ? 'Unknown'
        : (mode === 'arv' && subjectDetails.condition === 'c2' ? 'Renovated (ARV · C2)' : subjectCondMeta.shortLabel),
      conditionDefaultNote: subjectCondIsDefault
        ? `${subjectRawCondCode || 'AV'} · county default (not inspected)`
        : null,
      conditionTooltip: subjectConditionTooltip || null,
      conditionIsDefault: subjectCondIsDefault,
      fieldOrigins: subjectFieldOrigins,
      windowsLabel: formatWindowsLabel(subjectDetails.windows),
      roofLabel: formatRoofSpecLabel(subjectDetails),
      constructionDetail: resolvedSubjectConstDetail,
      constructionLabel: (() => {
        if (resolvedSubjectConstDetail) return resolvedSubjectConstDetail;
        const ct =
          subjectDetails.construction_type && subjectDetails.construction_type !== 'unknown'
            ? subjectDetails.construction_type
            : mapConstClassToConstructionType(subject?.const_class);
        return ct !== 'unknown' ? formatConstructionTypeLabel(ct) : null;
      })(),
      sketchAreas: subjectDetails.sketch_areas || subject?.sketch_areas || subject?.subject_details?.sketch_areas || null,
      recentImprovements: subjectDetails.recent_improvements || subject?.recent_improvements || subject?.subject_details?.recent_improvements || null,
      poolLabel: formatPoolSpecLabel(subjectDetails),
      garageLabel: formatGarageSpecLabel(subjectDetails),
      subdivisionName: subject?.subdivision_name || null,
      subdivisionCode: subject?.subdivision_code || null,
      nbrhdCd: subject?.nbrhd_cd || null,
      hoaName: subject?.hoa_name || subjectDetails.hoa_name || null,
      locationSubdivisionLabel: subject?.subdivision_name || 'Not set',
      locationSiteLabel: formatWaterfrontOnlyLabel(subjectDetails),
      boatDockLabel: formatBoatDockLabel(subjectDetails),
      lotSqft: subjectLotSqft,
      lotSizeLabel: subjectLotSqft > 0 ? `${Math.round(subjectLotSqft).toLocaleString()} sf` : 'Add lot sf',
      detailsProgress: subjectDetailsProgress
    },
    weightFormulaSummary: WEIGHT_FORMULA_SUMMARY,
    poorSizeCompsCount: poorSizeComps.length,
    hasNonOutlierUsed,
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
    lowConfidenceReasons,
    maxCompWeightPct: Math.round(maxCompWeightPct * 10) / 10,
    cvPct: Math.round(cvPct * 10) / 10,
    avgGrossPct: avgGrossPct != null ? Math.round(avgGrossPct * 10) / 10 : null,
    avgDist: avgDist != null ? Math.round(avgDist * 100) / 100 : null,
    avgMonths: avgMonths != null ? Math.round(avgMonths * 10) / 10 : null,
    sanityAnchors,
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
