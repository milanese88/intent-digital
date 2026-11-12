/**
 * Pure comp search filter validation, similarity scoring, outlier detection,
 * and county window formatting shared by /api/county/comps and SuggestedCompsPanel.
 */

export const ALLOWED_COMP_MONTHS = [3, 6, 9, 12];
export const DEFAULT_COMP_MONTHS = 6;

export const ALLOWED_COMP_RADII = [0.25, 0.5, 1, 2];
export const DEFAULT_COMP_RADIUS = 0.5;

export const ALLOWED_COMP_SIZE_PCTS = ['20', '30', 'any'];
export const DEFAULT_COMP_SIZE_PCT = '20';

export const DEFAULT_COMP_FILTERS = {
  months: DEFAULT_COMP_MONTHS,
  radius: DEFAULT_COMP_RADIUS,
  sizePct: DEFAULT_COMP_SIZE_PCT,
  includeDistressed: false
};

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Strictly validates query parameters for GET /api/county/comps (whitelisted values only).
 */
export function validateCompSearchParams(query = {}) {
  let months = DEFAULT_COMP_MONTHS;
  if (query.months !== undefined && query.months !== '') {
    if (Array.isArray(query.months)) {
      return { ok: false, error: 'Invalid months parameter. Allowed values: 3, 6, 9, 12.' };
    }
    const rawMonths = String(query.months).trim();
    if (!/^\d+$/.test(rawMonths)) {
      return { ok: false, error: 'Invalid months parameter. Allowed values: 3, 6, 9, 12.' };
    }
    const parsedMonths = Number(rawMonths);
    if (!ALLOWED_COMP_MONTHS.includes(parsedMonths)) {
      return { ok: false, error: 'Invalid months parameter. Allowed values: 3, 6, 9, 12.' };
    }
    months = parsedMonths;
  }

  let radius = DEFAULT_COMP_RADIUS;
  if (query.radius !== undefined && query.radius !== '') {
    if (Array.isArray(query.radius)) {
      return { ok: false, error: 'Invalid radius parameter. Allowed values: 0.25, 0.5, 1, 2.' };
    }
    const rawRadius = String(query.radius).trim();
    if (!/^\d+(\.\d+)?$/.test(rawRadius)) {
      return { ok: false, error: 'Invalid radius parameter. Allowed values: 0.25, 0.5, 1, 2.' };
    }
    const parsedRadius = Number(rawRadius);
    if (!ALLOWED_COMP_RADII.includes(parsedRadius)) {
      return { ok: false, error: 'Invalid radius parameter. Allowed values: 0.25, 0.5, 1, 2.' };
    }
    radius = parsedRadius;
  }

  let sizePct = DEFAULT_COMP_SIZE_PCT;
  if (query.sizePct !== undefined && query.sizePct !== '') {
    if (Array.isArray(query.sizePct)) {
      return { ok: false, error: 'Invalid sizePct parameter. Allowed values: 20, 30, any.' };
    }
    const rawSize = String(query.sizePct).trim().toLowerCase();
    if (!ALLOWED_COMP_SIZE_PCTS.includes(rawSize)) {
      return { ok: false, error: 'Invalid sizePct parameter. Allowed values: 20, 30, any.' };
    }
    sizePct = rawSize;
  }

  let includeDistressed = false;
  if (query.include_distressed !== undefined && query.include_distressed !== '') {
    const rawDist = String(query.include_distressed).trim().toLowerCase();
    if (!['0', '1', 'true', 'false'].includes(rawDist)) {
      return { ok: false, error: 'Invalid include_distressed parameter.' };
    }
    includeDistressed = rawDist === '1' || rawDist === 'true';
  }

  return {
    ok: true,
    params: {
      months,
      radius,
      sizePct,
      includeDistressed
    }
  };
}

/**
 * Safely normalizes stored profile comp_search_filters with whitelisted fallbacks.
 */
export function sanitizeProfileCompFilters(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_COMP_FILTERS };
  }
  const numMonths = Number(raw.months);
  const months = ALLOWED_COMP_MONTHS.includes(numMonths) ? numMonths : DEFAULT_COMP_MONTHS;

  const numRadius = Number(raw.radius);
  const radius = ALLOWED_COMP_RADII.includes(numRadius) ? numRadius : DEFAULT_COMP_RADIUS;

  const strSize = String(raw.sizePct ?? '').trim().toLowerCase();
  const sizePct = ALLOWED_COMP_SIZE_PCTS.includes(strSize) ? strSize : DEFAULT_COMP_SIZE_PCT;

  const includeDistressed = Boolean(raw.includeDistressed);

  return {
    months,
    radius,
    sizePct,
    includeDistressed
  };
}

/**
 * Computes living_sqft min/max bounds for a subject property and sizePct ('20' | '30' | 'any').
 */
export function computeSqftBounds(subjectSqft, sizePct = DEFAULT_COMP_SIZE_PCT) {
  const sqft = Number(subjectSqft) || 0;
  if (sqft <= 0 || sizePct === 'any') {
    return { minSqft: null, maxSqft: null };
  }
  const pct = Number(sizePct) / 100;
  return {
    minSqft: Math.round(sqft * (1 - pct)),
    maxSqft: Math.round(sqft * (1 + pct))
  };
}

/**
 * Computes age in months counted back from effectiveDate using county sale year & month.
 */
export function computeMonthsAgo(saleYear, saleMonth, effectiveDate = new Date()) {
  const yr = Number(saleYear);
  if (!yr || isNaN(yr)) return 0;
  const mo = saleMonth != null && Number(saleMonth) >= 1 && Number(saleMonth) <= 12
    ? Number(saleMonth)
    : 1;
  const curYear = effectiveDate.getFullYear();
  const curMonth = effectiveDate.getMonth() + 1;
  return Math.max(0, (curYear - yr) * 12 + (curMonth - mo));
}

/**
 * Formats comp sale month/year with age, e.g. "Sold Jul 2026 · 4 mo ago".
 */
export function formatSoldDateWithAge(saleMonth, saleYear, monthsAgo = null, effectiveDate = new Date()) {
  if (!saleYear) return '—';
  const m = Number(saleMonth);
  const baseStr = m >= 1 && m <= 12
    ? `Sold ${MONTH_NAMES[m - 1]} ${saleYear}`
    : `Sold ${saleYear}`;

  const age = monthsAgo != null && !isNaN(Number(monthsAgo))
    ? Math.max(0, Math.round(Number(monthsAgo)))
    : computeMonthsAgo(saleYear, saleMonth, effectiveDate);

  const ageStr = age === 0 ? 'this mo' : `${age} mo ago`;
  return `${baseStr} · ${ageStr}`;
}

/**
 * Computes inclusive year-month bounds [start, end] for a trailing window counted back from effectiveDate.
 */
export function computeMonthWindowRange(months, effectiveDate = new Date()) {
  const endYear = effectiveDate.getFullYear();
  const endMonth = effectiveDate.getMonth() + 1; // 1..12
  const endIndex = endYear * 12 + (endMonth - 1);
  const startIndex = endIndex - Number(months);
  const startYear = Math.floor(startIndex / 12);
  const startMonth = (startIndex % 12) + 1;

  return {
    startYear,
    startMonth,
    endYear,
    endMonth,
    startMonthIndex: startYear * 12 + startMonth,
    endMonthIndex: endYear * 12 + endMonth
  };
}

function parseMonthYearString(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const mIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === parts[0].toLowerCase());
  const yr = Number(parts[1]);
  if (mIdx === -1 || !yr || isNaN(yr)) return null;
  return { year: yr, month: mIdx + 1 };
}

/**
 * Formats the county completeness & active window coverage note:
 * e.g. "County data complete through Aug 2026 — a 6-month window currently covers May–Sep 2026 sales."
 */
export function formatCountyWindowNote({ months = DEFAULT_COMP_MONTHS, countyFreshness = null, effectiveDate = new Date() } = {}) {
  const { startYear, startMonth, endYear, endMonth } = computeMonthWindowRange(months, effectiveDate);

  const completeThrough = countyFreshness?.complete_through || 'Aug 2026';

  let latestY = countyFreshness?.latest_sale_year || null;
  let latestM = countyFreshness?.latest_sale_month_num || null;
  if (!latestY || !latestM) {
    const parsed = parseMonthYearString(countyFreshness?.latest_sale_month || 'Sep 2026');
    latestY = parsed ? parsed.year : endYear;
    latestM = parsed ? parsed.month : endMonth;
  }

  // Effective upper bound of recorded county sales inside the window
  const endIdx = endYear * 12 + endMonth;
  const latestIdx = latestY * 12 + latestM;
  const coveredEndIdx = Math.min(endIdx, latestIdx);
  const coveredEndYear = Math.floor((coveredEndIdx - 1) / 12);
  const coveredEndMonth = ((coveredEndIdx - 1) % 12) + 1;

  const startIdx = startYear * 12 + startMonth;
  if (startIdx > coveredEndIdx) {
    const latestLabel = `${MONTH_NAMES[latestM - 1]} ${latestY}`;
    return `County data complete through ${completeThrough} — latest recorded county sales are from ${latestLabel}.`;
  }

  let spanLabel;
  if (startYear === coveredEndYear && startMonth === coveredEndMonth) {
    spanLabel = `${MONTH_NAMES[startMonth - 1]} ${startYear}`;
  } else if (startYear === coveredEndYear) {
    spanLabel = `${MONTH_NAMES[startMonth - 1]}–${MONTH_NAMES[coveredEndMonth - 1]} ${coveredEndYear}`;
  } else {
    spanLabel = `${MONTH_NAMES[startMonth - 1]} ${startYear}–${MONTH_NAMES[coveredEndMonth - 1]} ${coveredEndYear}`;
  }

  return `County data complete through ${completeThrough} — a ${months}-month window currently covers ${spanLabel} sales.`;
}

/**
 * Similarity score in [0, 1] combining distance (40%), recency (35%), and living area closeness (25%).
 */
export function computeCompSimilarityScore({
  monthsAgo = 0,
  rawDistanceMi = null,
  livingSqft = 0,
  subjectSqft = 0
} = {}) {
  const sDistance = rawDistanceMi != null && !isNaN(Number(rawDistanceMi))
    ? 1 / (1 + Math.max(0, Number(rawDistanceMi)) / 0.35)
    : 0.5;
  const sRecency = 1 / (1 + Math.max(0, Number(monthsAgo) || 0) / 6);
  const sizeDiffPct = subjectSqft > 0 && livingSqft > 0
    ? Math.abs(Number(livingSqft) - Number(subjectSqft)) / Number(subjectSqft)
    : 0.2;
  const sSize = 1 / (1 + sizeDiffPct / 0.15);

  const combined = 0.40 * sDistance + 0.35 * sRecency + 0.25 * sSize;
  return Math.round(combined * 10000) / 10000;
}

export function calculateExactMedian(numbers = []) {
  const valid = numbers
    .filter((n) => n != null && !isNaN(Number(n)))
    .map(Number)
    .sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) return valid[mid];
  return (valid[mid - 1] + valid[mid]) / 2;
}

export function quantileSorted(sorted = [], p = 0.5) {
  if (!sorted || sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] !== undefined ? sorted[base + 1] : sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

/**
 * Flags $/sf outliers, computes non-outlier medians, and sorts non-outliers by similarity
 * score descending with outliers placed at the bottom.
 *
 * Rules:
 * - >= 6 results: outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
 * - 3..5 results ("fewer than 6 results"): > 40% away from median
 * - < 3 results: no outlier flagging (too few data points)
 */
export function evaluateAndSortCompCandidates(candidates = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      candidates: [],
      median_price_per_sqft: null,
      renovated_median_price_per_sqft: null,
      inlier_count: 0,
      outlier_count: 0
    };
  }

  const ppsValues = candidates
    .map((c) => Number(c.price_per_sqft))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  const rawMedian = calculateExactMedian(ppsValues);
  const canDetectOutliers = ppsValues.length >= 3 && rawMedian != null && rawMedian > 0;

  let lowerFence = -Infinity;
  let upperFence = Infinity;
  let useMedianPctRule = false;

  if (canDetectOutliers) {
    if (ppsValues.length < 6) {
      useMedianPctRule = true;
    } else {
      const q1 = quantileSorted(ppsValues, 0.25);
      const q3 = quantileSorted(ppsValues, 0.75);
      const iqr = q3 - q1;
      if (iqr > 0) {
        lowerFence = q1 - 1.5 * iqr;
        upperFence = q3 + 1.5 * iqr;
      } else {
        // Degenerate zero-IQR case (e.g. identical $/sf values + 1 extreme comp)
        useMedianPctRule = true;
      }
    }
  }

  const annotated = candidates.map((c) => {
    const pps = Number(c.price_per_sqft) || 0;
    let isOutlier = false;

    if (canDetectOutliers && pps > 0) {
      if (useMedianPctRule) {
        isOutlier = Math.abs(pps - rawMedian) / rawMedian > 0.40;
      } else {
        isOutlier = pps < lowerFence || pps > upperFence;
      }
    }

    let outlierReason = null;
    if (isOutlier) {
      if (pps >= rawMedian) {
        outlierReason = '$/sf far above nearby sales — possibly waterfront or renovated';
      } else if (c.is_distressed) {
        outlierReason = '$/sf far below nearby sales — distressed transfer or major repairs';
      } else {
        outlierReason = '$/sf far below nearby sales — possibly major repairs or non-typical sale';
      }
    }

    return {
      ...c,
      is_outlier: isOutlier,
      outlier_reason: outlierReason
    };
  });

  // Ensure at least 1 inlier remains if a pathological 3-comp distribution flagged all
  let inliers = annotated.filter((c) => !c.is_outlier);
  let finalAnnotated = annotated;
  if (inliers.length === 0 && annotated.length > 0) {
    finalAnnotated = annotated.map((c) => ({ ...c, is_outlier: false, outlier_reason: null }));
    inliers = finalAnnotated;
  }

  const outlierCount = finalAnnotated.length - inliers.length;

  const inlierMedianRaw = calculateExactMedian(inliers.map((c) => c.price_per_sqft));
  const medianPricePerSqft = inlierMedianRaw != null ? Math.round(inlierMedianRaw) : null;

  const renoInlierPps = inliers.filter((c) => c.likely_renovated).map((c) => c.price_per_sqft);
  const renoMedianRaw = calculateExactMedian(renoInlierPps);
  const renovatedMedianPricePerSqft = renoMedianRaw != null ? Math.round(renoMedianRaw) : null;

  // Sort non-outliers first, then descending similarity_score (tie-break: lower distance, more recent)
  const sorted = [...finalAnnotated].sort((a, b) => {
    if (a.is_outlier !== b.is_outlier) {
      return a.is_outlier ? 1 : -1;
    }
    const simDiff = (Number(b.similarity_score) || 0) - (Number(a.similarity_score) || 0);
    if (Math.abs(simDiff) > 1e-6) return simDiff;

    if (a.distance_mi != null && b.distance_mi != null && a.distance_mi !== b.distance_mi) {
      return a.distance_mi - b.distance_mi;
    }
    return (Number(a.months_ago) || 0) - (Number(b.months_ago) || 0);
  });

  return {
    candidates: sorted,
    median_price_per_sqft: medianPricePerSqft,
    renovated_median_price_per_sqft: renovatedMedianPricePerSqft,
    inlier_count: inliers.length,
    outlier_count: outlierCount
  };
}

export function getNextMonthsExpansion(currentMonths) {
  const idx = ALLOWED_COMP_MONTHS.indexOf(Number(currentMonths));
  if (idx === -1 || idx >= ALLOWED_COMP_MONTHS.length - 1) return null;
  return ALLOWED_COMP_MONTHS[idx + 1];
}

export function getNextRadiusExpansion(currentRadius) {
  const idx = ALLOWED_COMP_RADII.indexOf(Number(currentRadius));
  if (idx === -1 || idx >= ALLOWED_COMP_RADII.length - 1) return null;
  return ALLOWED_COMP_RADII[idx + 1];
}
