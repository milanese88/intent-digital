/**
 * Real Estate Valuation & South Florida Appraisal Adjustment Engine
 *
 * Implements:
 * 1. Palm Beach & Broward County Residential Appraisal Adjustment Guide:
 *    - Auto-selected property tiers from unadjusted median comp sale price
 *    - Size-method toggle: 35% of local $/sf vs tier library GLA rate + min variance threshold
 *    - Tier-scaled contributory values (Kitchen/Bath condition, Pool, Windstorm/Roof, Garage, Lot/Waterfront)
 *    - No below-grade basement modules (South Florida slab-on-grade standard)
 *    - Dedicated Location / Lot & Waterfront line separated from GLA and Condition
 * 2. Property Appraisal Mathematics & Calculator Specification Guide:
 *    - Strict CIA (Comp Inferior -> Add, +) & CBS (Comp Better -> Subtract, -) sign logic
 *    - Net Adjustment ($ and %), Gross Adjustment ($ and %), Adjusted Sale Price (ASP)
 *    - Fannie Mae 15% Net / 25% Gross guideline deviation flags
 *    - Weighted Reconciliation Engine enforcing |sum(w_i) - 1.0| < 0.0001
 *    - Configurable market-precision rounding ($500 / $1,000 / $5,000)
 */

export const DEFAULT_VALUATION_SETTINGS = {
  sizeFactor: 0.5,             // legacy factor kept for backwards-compatible callers/tests
  bedAdjustment: 10000,        // $ per bedroom difference
  bathAdjustment: 7500,        // $ per bathroom difference
  poolAdjustment: 25000,       // $ value of swimming pool
  garageAdjustment: 10000,     // $ value of garage
  waterfrontAdjustment: 50000, // $ value of waterfront frontage
  lotSqftAdjustment: 5,        // $ per lot sqft difference
  ageAdjustmentPerYear: 1000,  // $ per year built difference
  timeTrendMonthlyPct: 0.003   // 0.3% per month market trend default
};

export const COMP_CONDITIONS = {
  as_is: { key: 'as_is', label: 'As-is', shortLabel: 'As-is (C4)', rank: 0, isRenovated: false, badgeClass: 'comp-cond-as-is' },
  unknown: { key: 'unknown', label: 'Unknown', shortLabel: 'Unknown', rank: 0, isRenovated: false, badgeClass: 'comp-cond-unknown' },
  updated: { key: 'updated', label: 'Updated', shortLabel: 'Updated (C3)', rank: 1, isRenovated: true, badgeClass: 'comp-cond-updated' },
  fully_renovated: { key: 'fully_renovated', label: 'Fully renovated', shortLabel: 'Renovated (C2)', rank: 2, isRenovated: true, badgeClass: 'comp-cond-fully-renovated' }
};

export function getConditionMeta(condKey) {
  const k = String(condKey || 'unknown').toLowerCase().trim();
  return COMP_CONDITIONS[k] || COMP_CONDITIONS.unknown;
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
  conditionUpdatedVsAsIs: 22000,   // Minor kitchen refresh + bath update
  conditionRenovatedVsAsIs: 48000, // Full kitchen ($30k) + baths ($18k)
  poolAdjustment: 40000,           // Guide: $30,000 – $50,000 Standard In-Ground Pool
  garageBayAdjustment: 15000,      // Guide: $10,000 – $20,000 / bay
  impactWindowsAdjustment: 25000,  // Guide: $15,000 – $35,000 Full Impact Windows & Doors
  newerRoofAdjustment: 25000,      // Guide: $15,000 – $35,000 Newer Tile/Metal (<5 yrs vs >15 yrs)
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

function parseConditionRankFromSubject(subjectConditionText, mode = 'as_is') {
  if (mode === 'arv') {
    return { rank: 2, label: 'Renovated (ARV · C2)' };
  }
  const raw = String(subjectConditionText || '').toLowerCase();
  if (raw.includes('renovated') || raw.includes('new') || raw.includes('turnkey') || raw.includes('c1') || raw.includes('c2')) {
    return { rank: 2, label: 'Renovated (C2)' };
  }
  if (raw.includes('updated') || raw.includes('good') || raw.includes('remodeled') || raw.includes('c3')) {
    return { rank: 1, label: 'Updated (C3)' };
  }
  return { rank: 0, label: subjectConditionText ? `${subjectConditionText} (As-is)` : 'As-is (C4)' };
}

function getGarageBays(entity, defaultWhenTrue = 2) {
  if (entity?.garage_bays != null && entity.garage_bays !== '') {
    return Math.max(0, Number(entity.garage_bays) || 0);
  }
  if (typeof entity?.garage === 'number') {
    return Math.max(0, entity.garage);
  }
  return entity?.garage ? defaultWhenTrue : 0;
}

function hasNewerRoofOrImpact(entity, mode = 'as_is', isSubject = false) {
  const currentYear = new Date().getFullYear();
  const roofYr = Number(entity?.roof_year) || 0;
  const recentRoof = roofYr > 0 && (currentYear - roofYr) <= 7;
  const explicitImpact = Boolean(entity?.impact_windows || entity?.adjustments?.impact_windows);
  if (isSubject && mode === 'arv' && entity?.arvIncludesWindstorm !== false) {
    return {
      impact: Boolean(entity?.impact_windows ?? true),
      recentRoof: Boolean(recentRoof || entity?.arvIncludesRoof !== false)
    };
  }
  return {
    impact: explicitImpact,
    recentRoof
  };
}

function computeMonthsSinceSale(soldDateStr) {
  if (!soldDateStr) return 0;
  const saleD = new Date(soldDateStr);
  if (isNaN(saleD.getTime())) return 0;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - saleD.getFullYear()) * 12 + (now.getMonth() - saleD.getMonth()));
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
  zipRatioStats = null
} = {}) {
  const library = mergeAdjustmentLibrary(rawLibrary);

  // Valid comps with a sale price
  const validComps = comps.filter((c) => c && Number(c.sold_price) > 0);
  const usedCompsRaw = validComps.filter((c) => c.included !== false);

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
    garageBay: scaleAmt(library.garageBayAdjustment),
    impactWindows: scaleAmt(library.impactWindowsAdjustment),
    newerRoof: scaleAmt(library.newerRoofAdjustment),
    waterfront: scaleAmt(library.waterfrontAdjustment),
    lotSqftRate: Number(library.lotSqftRate) || 5,
    lotMinThreshold: Number(library.lotMinThreshold) || 500,
    monthlyTrendPct: zipTrendMonthlyPct != null
      ? Number(zipTrendMonthlyPct) * 100
      : (Number(library.monthlyMarketTrendPct) || 0.25)
  };

  // Subject normalized attributes
  const subjectSqft = Number(subject?.sqft) || 0;
  const subjectBeds = subject?.beds != null && subject?.beds !== '' ? Number(subject.beds) : null;
  const subjectBaths = subject?.baths != null && subject?.baths !== '' ? Number(subject.baths) : null;
  const subjectCond = parseConditionRankFromSubject(subject?.condition, mode);
  const subjectHasPool = Boolean(subject?.pool);
  const subjectGarageBays = getGarageBays(subject, 2);
  const subjectHasWaterfront = Boolean(subject?.waterfront);
  const subjectLotSqft = Number(subject?.lot_sqft) || 0;
  const subjectWindRoof = hasNewerRoofOrImpact(subject, mode, true);

  const conditionValueForRank = (rank) => {
    if (rank >= 2) return effectiveRates.condRenovatedVsAsIs;
    if (rank === 1) return effectiveRates.condUpdatedVsAsIs;
    return 0;
  };

  // Evaluate every comp (preserving order)
  const evaluatedComps = comps.map((comp) => {
    const isUsed = comp.included !== false && Number(comp.sold_price) > 0;
    const soldPrice = Number(comp.sold_price) || 0;
    const compSqft = Number(comp.sqft) || 0;
    const compPpsf = soldPrice > 0 && compSqft > 0 ? Math.round(soldPrice / compSqft) : null;
    const monthsSinceSale = computeMonthsSinceSale(comp.sold_date);
    const condMeta = getConditionMeta(comp.condition);
    const overrides = (comp.adjustments && typeof comp.adjustments === 'object' && comp.adjustments.overrides)
      ? comp.adjustments.overrides
      : {};

    const resolveCell = (rowKey, computedAmount, compSpecLabel, note = '') => {
      const hasOverride = overrides[rowKey] != null && overrides[rowKey] !== '' && !isNaN(Number(overrides[rowKey]));
      const amount = hasOverride ? Math.round(Number(overrides[rowKey])) : Math.round(computedAmount);
      return {
        key: rowKey,
        amount,
        computedAmount: Math.round(computedAmount),
        isOverridden: hasOverride,
        direction: amount > 0 ? 'add' : amount < 0 ? 'subtract' : 'neutral',
        spec: compSpecLabel,
        note
      };
    };

    // 1. Time / Market Conditions
    const monthlyDecimal = effectiveRates.monthlyTrendPct / 100;
    const rawTimeAdj = soldPrice > 0 && monthsSinceSale > 0
      ? Math.round((soldPrice * monthlyDecimal * monthsSinceSale) / 100) * 100
      : 0;
    const timeCell = resolveCell(
      'time',
      rawTimeAdj,
      comp.sold_date ? `${monthsSinceSale} mo ago` : 'Date n/a'
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
      withinGlaThreshold && sqftDiff !== 0 ? `<${effectiveRates.minGlaThreshold} sf threshold` : ''
    );

    // 3. Bedrooms & Bathrooms (Full + Half bath awareness)
    const compBeds = comp.beds != null && comp.beds !== '' ? Number(comp.beds) : null;
    const compBaths = comp.baths != null && comp.baths !== '' ? Number(comp.baths) : null;
    let rawBedBathAdj = 0;
    if (subjectBeds != null && compBeds != null) {
      rawBedBathAdj += (subjectBeds - compBeds) * effectiveRates.bed;
    }
    if (subjectBaths != null && compBaths != null) {
      const bathDiff = subjectBaths - compBaths;
      const sign = bathDiff >= 0 ? 1 : -1;
      const absDiff = Math.abs(bathDiff);
      const fullCount = Math.floor(absDiff + 1e-6);
      const hasHalf = Math.abs(absDiff - fullCount - 0.5) < 0.26;
      rawBedBathAdj += sign * (fullCount * effectiveRates.fullBath + (hasHalf ? effectiveRates.halfBath : 0));
    }
    const bedBathSpec = [
      compBeds != null ? `${compBeds} bd` : null,
      compBaths != null ? `${compBaths} ba` : null
    ].filter(Boolean).join(' / ') || '—';
    const bedBathCell = resolveCell('bed_bath', rawBedBathAdj, bedBathSpec);

    // 4. Condition (Kitchen & Bath UAD C-Rating parity)
    const rawCondAdj = conditionValueForRank(subjectCond.rank) - conditionValueForRank(condMeta.rank);
    const conditionCell = resolveCell('condition', rawCondAdj, condMeta.shortLabel);

    // 5. Pool & Outdoor Living
    const compHasPool = Boolean(comp.pool);
    const rawPoolAdj = ((subjectHasPool ? 1 : 0) - (compHasPool ? 1 : 0)) * effectiveRates.pool;
    const poolCell = resolveCell('pool', rawPoolAdj, compHasPool ? 'In-ground pool' : 'No pool');

    // 6. Garage Capacity (Per-bay differential)
    const compGarageBays = getGarageBays(comp, 2);
    const rawGarageAdj = (subjectGarageBays - compGarageBays) * effectiveRates.garageBay;
    const garageCell = resolveCell(
      'garage',
      rawGarageAdj,
      compGarageBays > 0 ? `${compGarageBays}-Car` : 'None'
    );

    // 7. Windstorm & Roof (South Florida Insurance Mitigation)
    const compWindRoof = hasNewerRoofOrImpact(comp, 'as_is', false);
    const impactDiff = (subjectWindRoof.impact ? 1 : 0) - (compWindRoof.impact ? 1 : 0);
    const roofDiff = (subjectWindRoof.recentRoof ? 1 : 0) - (compWindRoof.recentRoof ? 1 : 0);
    const rawWindRoofAdj = impactDiff * effectiveRates.impactWindows + roofDiff * effectiveRates.newerRoof;
    const compWindSpec = [
      compWindRoof.impact ? 'Impact' : 'Std glass',
      compWindRoof.recentRoof ? 'Newer roof' : (comp.year_built ? `Built ${comp.year_built}` : 'Std roof')
    ].join(' · ');
    const windstormCell = resolveCell('windstorm', rawWindRoofAdj, compWindSpec);

    // 8. Location / Site & Water Frontage (Dedicated row per Guide Section 6)
    const compHasWaterfront = Boolean(comp.waterfront);
    const compLotSqft = Number(comp.lot_sqft) || 0;
    const lotDiff = subjectLotSqft > 0 && compLotSqft > 0 ? subjectLotSqft - compLotSqft : 0;
    const lotAdjPart = Math.abs(lotDiff) >= effectiveRates.lotMinThreshold
      ? Math.round((lotDiff * effectiveRates.lotSqftRate) / 500) * 500
      : 0;
    const waterAdjPart = ((subjectHasWaterfront ? 1 : 0) - (compHasWaterfront ? 1 : 0)) * effectiveRates.waterfront;
    const siteSpec = [
      compHasWaterfront ? 'Waterfront' : 'Dry lot',
      compLotSqft > 0 ? `${compLotSqft.toLocaleString()} sf` : null
    ].filter(Boolean).join(' · ');
    const locationSiteCell = resolveCell('location_site', lotAdjPart + waterAdjPart, siteSpec);

    const cells = {
      time: timeCell,
      gla: glaCell,
      bed_bath: bedBathCell,
      condition: conditionCell,
      pool: poolCell,
      garage: garageCell,
      windstorm: windstormCell,
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

    // Auto-weight score (higher for closer, more recent, lower gross %, and condition match)
    const distMi = comp.distance_mi != null && !isNaN(Number(comp.distance_mi)) ? Number(comp.distance_mi) : 0.5;
    const wRecency = 1 / (1 + monthsSinceSale / 6);
    const wDistance = 1 / (1 + distMi / 0.5);
    const wGross = 1 / (1 + grossAdjustmentPct / 12);
    const modeMatchesCondition = mode === 'arv' ? condMeta.isRenovated : !condMeta.isRenovated;
    const wConditionParity = modeMatchesCondition ? 1.25 : 0.8;
    const rawAutoScore = isUsed ? Math.max(0.01, wRecency * wDistance * wGross * wConditionParity) : 0;

    return {
      ...comp,
      isUsed,
      soldPrice,
      compSqft,
      compPpsf,
      monthsSinceSale,
      distanceMi: distMi,
      conditionMeta: condMeta,
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
        : ((avgDist ?? 0) <= 1.0 && (avgMonths ?? 0) <= 12 ? 'pass' : 'warn'),
      label: 'Proximity & Sale Recency',
      detail: usedEvaluated.length === 0
        ? 'No active comps selected'
        : `Avg ${(avgDist ?? 0).toFixed(2)} mi distance · ${(avgMonths ?? 0).toFixed(1)} mo since sale`
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

  return {
    mode,
    sizeMethod,
    tier,
    library,
    effectiveRates,
    medianUnadjustedPrice,
    localMedianPpsf: localMedianPpsf ? Math.round(localMedianPpsf) : null,
    subjectSummary: {
      address: subject?.address || 'Subject Property',
      listPrice: Number(subject?.list_price) > 0 ? Number(subject.list_price) : null,
      justValue: subjectJustValue > 0 ? subjectJustValue : null,
      sqft: subjectSqft,
      beds: subjectBeds,
      baths: subjectBaths,
      conditionLabel: subjectCond.label,
      poolLabel: subjectHasPool ? 'In-ground pool' : 'No pool',
      garageLabel: subjectGarageBays > 0 ? `${subjectGarageBays}-Car` : 'None',
      windstormLabel: [
        subjectWindRoof.impact ? 'Impact' : 'Std glass',
        subjectWindRoof.recentRoof ? 'Newer roof' : (subject?.roof_year ? `Roof ${subject.roof_year}` : 'Std roof')
      ].join(' · '),
      locationSiteLabel: [
        subjectHasWaterfront ? 'Waterfront' : 'Dry lot',
        subjectLotSqft > 0 ? `${subjectLotSqft.toLocaleString()} sf` : null
      ].filter(Boolean).join(' · ')
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

  // 5. Pool Adjustment
  const subjectHasPool = Boolean(subject.pool);
  const compHasPool = Boolean(comp.pool);
  const poolDiff = (subjectHasPool ? 1 : 0) - (compHasPool ? 1 : 0);
  const poolAdj = Math.round(poolDiff * (Number(settings.poolAdjustment) || 25000));

  // 6. Garage Adjustment
  const subjectHasGarage = Boolean(subject.garage);
  const compHasGarage = Boolean(comp.garage);
  const garageDiff = (subjectHasGarage ? 1 : 0) - (compHasGarage ? 1 : 0);
  const garageAdj = Math.round(garageDiff * (Number(settings.garageAdjustment) || 10000));

  // 7. Waterfront Adjustment
  const subjectHasWaterfront = Boolean(subject.waterfront);
  const compHasWaterfront = Boolean(comp.waterfront);
  const waterfrontDiff = (subjectHasWaterfront ? 1 : 0) - (compHasWaterfront ? 1 : 0);
  const waterfrontAdj = Math.round(waterfrontDiff * (Number(settings.waterfrontAdjustment) || 50000));

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
  const includedComps = comps.filter(c => c.included !== false && c.sold_price && Number(c.sold_price) > 0);

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
