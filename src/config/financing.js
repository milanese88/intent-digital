/**
 * Single Source of Truth for FHA & Live-In Plan Financing Rules, Rates, and Limits.
 * Update values here (and bump `asOf`) as HUD/FHA, IRS, or county schedules change.
 * Individual users can also override these defaults inside "My Buying Profile".
 */

export const LIVE_IN_PLAN_DISCLAIMER = 'Estimate for planning — confirm with your lender and CPA.';
export const LIVE_IN_TAX_DISCLAIMER = 'estimate — confirm with a CPA';

export const CREDIT_SCORE_BANDS = [
  { id: '760+', label: '760+ (Excellent)', minScore: 760, fhaEligible: true, minDownPct: 3.5 },
  { id: '740-759', label: '740–759', minScore: 740, fhaEligible: true, minDownPct: 3.5 },
  { id: '720-739', label: '720–739', minScore: 720, fhaEligible: true, minDownPct: 3.5 },
  { id: '700-719', label: '700–719', minScore: 700, fhaEligible: true, minDownPct: 3.5 },
  { id: '680-699', label: '680–699', minScore: 680, fhaEligible: true, minDownPct: 3.5 },
  { id: '660-679', label: '660–679', minScore: 660, fhaEligible: true, minDownPct: 3.5 },
  { id: '640-659', label: '640–659', minScore: 640, fhaEligible: true, minDownPct: 3.5 },
  { id: '580-639', label: '580–639 (FHA 3.5% min)', minScore: 580, fhaEligible: true, minDownPct: 3.5 },
  { id: '500-579', label: '500–579 (FHA 10% min)', minScore: 500, fhaEligible: true, minDownPct: 10.0 }
];

export const FINANCING_CONFIG = {
  asOf: '2026-11-13',
  asOfDisplay: 'Nov 13, 2026',
  disclaimer: LIVE_IN_PLAN_DISCLAIMER,
  taxDisclaimer: LIVE_IN_TAX_DISCLAIMER,

  fha: {
    minDownPct: 3.5,                 // 580+ credit score minimum down payment (%)
    minCreditScoreFor35Down: 580,
    lowCreditDownPct: 10.0,          // 500–579 credit score minimum down payment (%)
    minEligibleCreditScore: 500,
    ufmipPct: 1.75,                  // Upfront Mortgage Insurance Premium (%), financed into loan
    ufmipFinanced: true,
    annualMipPct: 0.55,              // Annual MIP (%) when base loan <= $726,200
    annualMipHighBalancePct: 0.75,   // Annual MIP (%) when base loan > $726,200
    highBalanceBaseLoanThreshold: 726200,
    mipForLifeBelowDownPct: 10.0,    // MIP stays for life of loan when down payment < 10%
    mipYearsAt10PctOrMoreDown: 11,   // 11 years when >= 10% down
    otherUnitRentCreditFactor: 0.75, // 75% of market/lease rent from units 2–4 offsets housing payment
    maxSellerConcessionPct: 6.0,     // FHA max seller credits (% of purchase price) toward closing costs
    limited203kMaxRehab: 75000,      // HUD Limited 203(k) max total rehabilitation cost ($)
    occupancyMoveInDays: 60,         // Must occupy as primary residence within 60 days of closing
    occupancyMinYears: 1,            // Must intend to occupy as primary residence for >= 1 year
    loanTermYears: 30
  },

  /**
   * FHA Maximum Base Loan Limits per County and Unit Count (1–4 units).
   * Broward 1-unit = $667,000 (verified).
   * Palm Beach 1–4 units and Broward 2–4 units are flagged `verify: true` ("verify")
   * so they display a verify tag until confirmed against HUD's current schedule.
   */
  fhaLimits: {
    Broward: {
      1: { limit: 667000, verify: false },
      2: { limit: 853850, verify: true },
      3: { limit: 1032100, verify: true },
      4: { limit: 1282650, verify: true }
    },
    'Palm Beach': {
      1: { limit: 667000, verify: true },
      2: { limit: 853850, verify: true },
      3: { limit: 1032100, verify: true },
      4: { limit: 1282650, verify: true }
    }
  },

  defaults: {
    fhaInterestRatePct: 6.25,
    closingCostsPct: 3.5,
    currentRentMo: 2400,
    liveInYears: 2,
    appreciationPctYr: 3.5,
    rentGrowthPctYr: 3.0,
    vacancyPct: 5.0,
    repairsPct: 5.0,
    capexPct: 5.0,
    managementPct: 8.0,
    homeownerInsuranceYr: 4200,
    landlordInsuranceYr: 4800,
    floodInsuranceYr: 2400,
    sellingCostsPct: 7.5,
    convRefiMinEquityPct: 20.0,
    convRefiMaxLtvPct: 80.0,
    convRefiRatePct: 6.5,
    convRefiClosingCostsPct: 2.0,
    nextPropertyDownPct: 20.0,
    nextPropertyClosingPct: 3.0
  },

  /**
   * Florida Ad Valorem Property Tax & Homestead Rules
   * Millage rate is expressed in mills ($ per $1,000 of taxable value).
   */
  floridaTax: {
    millageByCounty: {
      Broward: 19.5,
      'Palm Beach': 18.2,
      default: 19.5
    },
    // Florida Homestead: first $25k applies to all levies (incl. school); second $25k ($50k–$75k value)
    // applies to non-school levies (~65% of total millage -> ~$41,250 effective exemption).
    homesteadFirstExemption: 25000,
    homesteadSecondExemption: 25000,
    nonSchoolMillageShare: 0.65,
    saveOurHomesAnnualCapPct: 3.0,
    nonHomesteadAnnualCapPct: 10.0
  },

  /**
   * IRS Section 121 Primary Residence Capital Gain Exclusion (2 of last 5 years)
   */
  section121: {
    minYearsLived: 2,
    lookbackYears: 5,
    singleMaxExclusion: 250000,
    marriedMaxExclusion: 500000,
    illustrativeCapitalGainsTaxRatePct: 15.0
  }
};

/**
 * Normalize county string ('Broward County', 'broward', 'Palm Beach County', etc.)
 */
export function normalizeCountyKey(countyRaw) {
  const s = String(countyRaw || '').trim().toLowerCase();
  if (s.includes('palm')) return 'Palm Beach';
  if (s.includes('broward') || !s) return 'Broward';
  return 'Broward';
}

/**
 * Map a Buying Profile credit_tier ('below 640', '740-759', etc.) to a Live-in credit band
 */
export function normalizeCreditBand(bandRaw) {
  if (!bandRaw) return '740-759';
  const trimmed = String(bandRaw).trim();
  if (trimmed === 'below 640') return '580-639';
  if (CREDIT_SCORE_BANDS.some((b) => b.id === trimmed)) return trimmed;
  return '740-759';
}

/**
 * Sanitize user-editable financing overrides stored in investor_profile
 */
export function sanitizeFinancingOverrides(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};

  const numInRange = (val, min, max) => {
    if (val === '' || val == null) return undefined;
    const n = Number(val);
    if (!Number.isFinite(n) || n < min || n > max) return undefined;
    return n;
  };

  if (raw.fha && typeof raw.fha === 'object') {
    const fha = {};
    const minDown = numInRange(raw.fha.minDownPct, 0, 50);
    if (minDown !== undefined) fha.minDownPct = minDown;

    const lowCreditDown = numInRange(raw.fha.lowCreditDownPct, 0, 50);
    if (lowCreditDown !== undefined) fha.lowCreditDownPct = lowCreditDown;

    const ufmip = numInRange(raw.fha.ufmipPct, 0, 10);
    if (ufmip !== undefined) fha.ufmipPct = ufmip;

    const annualMip = numInRange(raw.fha.annualMipPct, 0, 5);
    if (annualMip !== undefined) fha.annualMipPct = annualMip;

    const highMip = numInRange(raw.fha.annualMipHighBalancePct, 0, 5);
    if (highMip !== undefined) fha.annualMipHighBalancePct = highMip;

    const highThresh = numInRange(raw.fha.highBalanceBaseLoanThreshold, 100000, 3000000);
    if (highThresh !== undefined) fha.highBalanceBaseLoanThreshold = Math.round(highThresh);

    const kMax = numInRange(raw.fha.limited203kMaxRehab, 5000, 500000);
    if (kMax !== undefined) fha.limited203kMaxRehab = Math.round(kMax);

    const occDays = numInRange(raw.fha.occupancyMoveInDays, 1, 365);
    if (occDays !== undefined) fha.occupancyMoveInDays = Math.round(occDays);

    const occYrs = numInRange(raw.fha.occupancyMinYears, 1, 10);
    if (occYrs !== undefined) fha.occupancyMinYears = occYrs;

    if (Object.keys(fha).length > 0) out.fha = fha;
  }

  if (raw.fhaLimits && typeof raw.fhaLimits === 'object') {
    const limitsOut = {};
    for (const county of ['Broward', 'Palm Beach']) {
      const cSrc = raw.fhaLimits[county];
      if (cSrc && typeof cSrc === 'object') {
        const unitMap = {};
        for (const u of [1, 2, 3, 4]) {
          const entry = cSrc[u] ?? cSrc[String(u)];
          if (entry != null) {
            const rawLim = typeof entry === 'object' ? entry.limit : entry;
            const lim = numInRange(rawLim, 100000, 5000000);
            if (lim !== undefined) {
              const defaultVerify = FINANCING_CONFIG.fhaLimits[county][u].verify;
              const verifiedOverride = typeof entry === 'object' && typeof entry.verify === 'boolean'
                ? entry.verify
                : defaultVerify;
              unitMap[u] = { limit: Math.round(lim), verify: verifiedOverride };
            }
          }
        }
        if (Object.keys(unitMap).length > 0) limitsOut[county] = unitMap;
      }
    }
    if (Object.keys(limitsOut).length > 0) out.fhaLimits = limitsOut;
  }

  if (raw.defaults && typeof raw.defaults === 'object') {
    const defs = {};
    const curRent = numInRange(raw.defaults.currentRentMo, 0, 50000);
    if (curRent !== undefined) defs.currentRentMo = Math.round(curRent);

    const closePct = numInRange(raw.defaults.closingCostsPct, 0, 15);
    if (closePct !== undefined) defs.closingCostsPct = closePct;

    const refiRate = numInRange(raw.defaults.convRefiRatePct, 0, 20);
    if (refiRate !== undefined) defs.convRefiRatePct = refiRate;

    if (Object.keys(defs).length > 0) out.defaults = defs;
  }

  if (raw.floridaTax && typeof raw.floridaTax === 'object' && raw.floridaTax.millageByCounty) {
    const mOut = {};
    for (const county of ['Broward', 'Palm Beach']) {
      const m = numInRange(raw.floridaTax.millageByCounty[county], 1, 45);
      if (m !== undefined) mOut[county] = m;
    }
    if (Object.keys(mOut).length > 0) {
      out.floridaTax = { millageByCounty: mOut };
    }
  }

  return out;
}

/**
 * Merge user's Buying Profile financing overrides onto FINANCING_CONFIG
 */
export function getMergedFinancingConfig(profile = null) {
  const rawOverrides =
    profile?.financing_overrides ||
    profile?.valuation_defaults?.financing_overrides ||
    {};
  const clean = sanitizeFinancingOverrides(rawOverrides);

  const mergedLimits = {
    Broward: {
      ...FINANCING_CONFIG.fhaLimits.Broward,
      ...(clean.fhaLimits?.Broward || {})
    },
    'Palm Beach': {
      ...FINANCING_CONFIG.fhaLimits['Palm Beach'],
      ...(clean.fhaLimits?.['Palm Beach'] || {})
    }
  };

  // Pull FHA quote from Buying Profile rate_sheet if configured
  let profileFhaRate = FINANCING_CONFIG.defaults.fhaInterestRatePct;
  if (profile?.rate_sheet?.fha) {
    const fhaSheet = profile.rate_sheet.fha;
    const base = fhaSheet.base_rate != null ? Number(fhaSheet.base_rate) : profileFhaRate;
    const tier = profile.credit_tier || '740-759';
    const adj = fhaSheet.adjustments?.[tier] != null ? Number(fhaSheet.adjustments[tier]) : 0;
    if (Number.isFinite(base + adj) && base + adj > 0) {
      profileFhaRate = Number((base + adj).toFixed(3));
    }
  }

  return {
    ...FINANCING_CONFIG,
    fha: {
      ...FINANCING_CONFIG.fha,
      ...(clean.fha || {})
    },
    fhaLimits: mergedLimits,
    defaults: {
      ...FINANCING_CONFIG.defaults,
      fhaInterestRatePct: profileFhaRate,
      ...(clean.defaults || {})
    },
    floridaTax: {
      ...FINANCING_CONFIG.floridaTax,
      millageByCounty: {
        ...FINANCING_CONFIG.floridaTax.millageByCounty,
        ...(clean.floridaTax?.millageByCounty || {})
      }
    },
    section121: {
      ...FINANCING_CONFIG.section121
    }
  };
}

/**
 * Look up the FHA base loan limit & verification status for a county and unit count (1–4).
 */
export function getFhaLimitForProperty(countyRaw, unitsRaw = 1, config = FINANCING_CONFIG) {
  const cfg = config || FINANCING_CONFIG;
  const countyKey = normalizeCountyKey(countyRaw);
  const clampedUnits = Math.min(4, Math.max(1, Math.round(Number(unitsRaw) || 1)));
  const countyTable = cfg.fhaLimits?.[countyKey] || FINANCING_CONFIG.fhaLimits.Broward;
  const entry = countyTable[clampedUnits] || countyTable[1] || { limit: 667000, verify: true };
  const isUnmappedCounty = Boolean(
    countyRaw &&
    !String(countyRaw).toLowerCase().includes('broward') &&
    !String(countyRaw).toLowerCase().includes('palm')
  );

  return {
    countyKey: isUnmappedCounty ? String(countyRaw).trim() : countyKey,
    units: clampedUnits,
    limit: Number(entry.limit) || 667000,
    verify: isUnmappedCounty ? true : Boolean(entry.verify)
  };
}

/**
 * Get default millage rate (mills per $1,000) for a county.
 */
export function getDefaultMillageForCounty(countyRaw, config = FINANCING_CONFIG) {
  const cfg = config || FINANCING_CONFIG;
  const countyKey = normalizeCountyKey(countyRaw);
  return cfg.floridaTax?.millageByCounty?.[countyKey] ?? cfg.floridaTax?.millageByCounty?.default ?? 19.5;
}

