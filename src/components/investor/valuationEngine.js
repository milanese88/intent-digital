/**
 * Real Estate Valuation Engine
 * 
 * Provides rigorous, appraisal-grade comparable sales adjustment grids,
 * As-Is vs ARV bifurcated valuation, confidence scoring, range calculation,
 * and county just-value sanity check comparison.
 */

export const DEFAULT_VALUATION_SETTINGS = {
  sizeFactor: 0.5,           // (subject sf - comp sf) * comp $/sf * 0.5
  bedAdjustment: 10000,      // $ per bedroom difference
  bathAdjustment: 7500,      // $ per bathroom difference
  poolAdjustment: 25000,     // $ value of swimming pool
  garageAdjustment: 10000,   // $ value of garage
  waterfrontAdjustment: 50000, // $ value of waterfront frontage
  lotSqftAdjustment: 5,      // $ per lot sqft difference
  ageAdjustmentPerYear: 1000, // $ per year built difference
  timeTrendMonthlyPct: 0.003 // 0.3% per month market trend default
};

export const COMP_CONDITIONS = {
  as_is: { key: 'as_is', label: 'As-is', isRenovated: false, badgeClass: 'comp-cond-as-is' },
  updated: { key: 'updated', label: 'Updated', isRenovated: true, badgeClass: 'comp-cond-updated' },
  fully_renovated: { key: 'fully_renovated', label: 'Fully renovated', isRenovated: true, badgeClass: 'comp-cond-fully-renovated' },
  unknown: { key: 'unknown', label: 'Unknown', isRenovated: false, badgeClass: 'comp-cond-unknown' }
};

export function getConditionMeta(condKey) {
  const k = String(condKey || 'unknown').toLowerCase();
  return COMP_CONDITIONS[k] || COMP_CONDITIONS.unknown;
}

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
  let monthsSinceSale = 0;
  if (comp.sold_date) {
    const saleD = new Date(comp.sold_date);
    const now = new Date();
    if (!isNaN(saleD.getTime())) {
      monthsSinceSale = Math.max(0, (now.getFullYear() - saleD.getFullYear()) * 12 + (now.getMonth() - saleD.getMonth()));
    }
  }
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

  // Weight Calculation:
  // Weight by recency (decay with months), distance (closer is better), and low adjustment (lower gross % is better)
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
 * Calculates full valuation metrics from comps:
 * - As-Is Value from As-is / Unknown comps
 * - ARV from Updated / Fully renovated comps only
 * - Confidence Score (High / Medium / Low) with explicit reasons
 * - Range (low–mid–high)
 * - Comparison against manual ARV
 * - Sanity check against County Just Value
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

  // Compute adjustments for each comp
  const analyzedComps = includedComps.map(c => {
    const adj = calculateCompAdjustments(c, subject, userSettings, zipTrendMonthlyPct);
    const condMeta = getConditionMeta(c.condition);
    return {
      ...c,
      valuation: adj,
      conditionMeta: condMeta
    };
  });

  // Bifurcate Comps: As-Is vs Renovated
  const asIsComps = analyzedComps.filter(c => !c.conditionMeta.isRenovated);
  const renovatedComps = analyzedComps.filter(c => c.conditionMeta.isRenovated);

  // Helper: compute weighted valuation and range for a group of comps
  const computeGroupValuation = (group) => {
    if (group.length === 0) return null;

    let weightedSum = 0;
    let weightSum = 0;
    const adjustedPrices = [];
    const ppsqfts = [];

    group.forEach(c => {
      const p = c.valuation.adjustedPrice;
      const w = c.valuation.totalWeight;
      weightedSum += p * w;
      weightSum += w;
      adjustedPrices.push(p);

      const sq = Number(c.sqft) || Number(subject.sqft) || 1;
      ppsqfts.push(c.sold_price / sq);
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

  // ARV Status and Validation
  let arvStatus = 'CALCULATED'; // 'CALCULATED' | 'NEEDS_RENOVATED_COMPS'
  let arvDisplay = arvValuation ? arvValuation.mid : null;
  let isArvUnsupported = false;
  let arvUnsupportedMessage = null;

  if (!arvValuation || renovatedComps.length === 0) {
    arvStatus = 'NEEDS_RENOVATED_COMPS';
    arvDisplay = 'Add renovated comps';
  }

  // Check manually entered ARV
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

  // Primary Valuation for Confidence Scoring & Sanity Check
  // Use ARV valuation if available, else As-Is valuation, else median
  const activeValuation = arvValuation || asIsValuation;
  const activeComps = activeValuation ? activeValuation.comps : analyzedComps;

  // Confidence Score Calculation (High / Medium / Low)
  let confidenceScore = 'Low';
  const confidenceReasons = [];

  if (activeComps.length >= 3) {
    // 1. Comp count
    confidenceReasons.push(`${activeComps.length} comparable sales analyzed`);

    // 2. Spread ($/sqft Coefficient of Variation)
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

    // 3. Distance
    const avgDistance = activeComps.reduce((acc, c) => acc + (c.valuation.distanceMi || 0.5), 0) / activeComps.length;
    if (avgDistance <= 0.5) {
      confidenceReasons.push(`Close proximity (avg ${avgDistance.toFixed(2)} mi)`);
    } else if (avgDistance <= 1.0) {
      confidenceReasons.push(`Average distance ${avgDistance.toFixed(2)} mi`);
    } else {
      confidenceReasons.push(`Distant comps (avg ${avgDistance.toFixed(2)} mi)`);
    }

    // 4. Recency
    const avgMonths = activeComps.reduce((acc, c) => acc + (c.valuation.monthsSinceSale || 0), 0) / activeComps.length;
    if (avgMonths <= 6) {
      confidenceReasons.push(`Recent transactions (avg ${avgMonths.toFixed(1)} mo)`);
    } else {
      confidenceReasons.push(`Older transactions (avg ${avgMonths.toFixed(1)} mo)`);
    }

    // 5. Adjustments
    const avgGrossAdj = activeComps.reduce((acc, c) => acc + (c.valuation.grossAdjustmentPct || 0), 0) / activeComps.length;
    if (avgGrossAdj <= 15) {
      confidenceReasons.push(`Low adjustments required (avg ${avgGrossAdj.toFixed(1)}% gross)`);
    } else {
      confidenceReasons.push(`Higher adjustments required (avg ${avgGrossAdj.toFixed(1)}% gross)`);
    }

    // Rating synthesis
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

  // Sanity Check against County Just Value
  let sanityCheck = {
    evaluated: false,
    status: 'UNKNOWN', // 'NORMAL' | 'WARNING' | 'UNKNOWN'
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
