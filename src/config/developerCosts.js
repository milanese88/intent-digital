/**
 * Editable South Florida Developer Cost Estimates & Defaults
 *
 * Single source of truth for Flip & Demo -> New Build reverse-engineering estimates.
 * Update values here (and bump `asOf`) as South Florida contractor pricing,
 * lender terms, or county millage schedules shift.
 *
 * Every figure is strictly an editable estimate — never a binding contractor bid.
 */

export const DEVELOPER_COSTS_AS_OF = '2026-11-21';
export const DEVELOPER_COSTS_AS_OF_DISPLAY = 'Nov 21, 2026';
export const DEVELOPER_COSTS_DISCLAIMER =
  'All cost, financing, holding, and profit figures are editable estimates for analysis — confirm with contractor bids, lender quotes, and title.';

export const FL_DEED_DOC_STAMPS_PCT = 0.7; // Statutory Florida deed documentary stamps: $0.70 per $100 (Broward, Palm Beach, Martin)
export const FL_MORTGAGE_DOC_STAMPS_PCT = 0.35; // Statutory FL mortgage doc stamps: $0.35 per $100
export const FL_INTANGIBLE_TAX_PCT = 0.2; // Statutory FL non-recurring intangible tax: 2 mills

export const DEVELOPER_MILLAGE_BY_COUNTY = {
  Broward: 19.5,
  'Palm Beach': 18.2,
  Martin: 15.8,
  default: 19.0
};

/**
 * Flip rehabilitation cost estimates ($/sf of living area) — South Florida
 */
export const FLIP_REHAB_LEVELS = {
  light: {
    id: 'light',
    label: 'Light (Cosmetic)',
    shortLabel: 'Light',
    costPerSqft: 35,
    rangeLabel: '$25–$45/sf',
    description: 'Paint, flooring refresh, lighting, landscaping, minor kitchen/bath updates (estimate)'
  },
  medium: {
    id: 'medium',
    label: 'Medium (Standard Flip)',
    shortLabel: 'Medium',
    costPerSqft: 75,
    rangeLabel: '$55–$95/sf',
    description: 'New kitchen & baths, flooring, interior doors/trim, partial HVAC/electrical (estimate)'
  },
  full_gut: {
    id: 'full_gut',
    label: 'Full Gut (Heavy Rehab)',
    shortLabel: 'Full gut',
    costPerSqft: 135,
    rangeLabel: '$110–$170/sf',
    description: 'Down-to-studs remodel, new roof, impact glass, MEP rewire/repipe, layout changes (estimate)'
  }
};

/**
 * Demo -> New Construction hard build cost estimates ($/sf of new living area) — South Florida
 */
export const NEW_BUILD_QUALITY_TIERS = {
  standard: {
    id: 'standard',
    label: 'Standard Spec',
    shortLabel: 'Standard',
    costPerSqft: 260,
    rangeLabel: '$220–$300/sf',
    description: 'CBS production/spec build, impact windows, tile or shingle roof, builder finishes (estimate)'
  },
  high_end: {
    id: 'high_end',
    label: 'High-End Semi-Custom',
    shortLabel: 'High-end',
    costPerSqft: 385,
    rangeLabel: '$330–$450/sf',
    description: 'Semi-custom CBS, designer kitchen & millwork, metal/barrel tile roof, upgraded glazing (estimate)'
  },
  luxury: {
    id: 'luxury',
    label: 'Luxury Custom / Coastal',
    shortLabel: 'Luxury',
    costPerSqft: 575,
    rangeLabel: '$480–$700/sf',
    description: 'Custom architectural waterfront/estate build, structural steel/glass, museum-grade finishes (estimate)'
  }
};

/**
 * Demolition lump-sum brackets by existing home living sqft (South FL estimate)
 */
export const DEMO_COST_BRACKETS = [
  { maxSqft: 0, cost: 0, label: 'Vacant lot ($0 demo)' },
  { maxSqft: 1500, cost: 18000, label: '≤ 1,500 sf ($18,000 est.)' },
  { maxSqft: 2500, cost: 25000, label: '1,501–2,500 sf ($25,000 est.)' },
  { maxSqft: 3800, cost: 34000, label: '2,501–3,800 sf ($34,000 est.)' },
  { maxSqft: Infinity, cost: 45000, label: '> 3,800 sf ($45,000 est.)' }
];

export function estimateDemoLumpSum(beforeSqft = 0) {
  const sf = Number(beforeSqft) || 0;
  if (sf <= 0) return 0;
  const bracket = DEMO_COST_BRACKETS.find((b) => sf <= b.maxSqft);
  return bracket ? bracket.cost : 25000;
}

/**
 * Soft cost % breakdown (applied to hard rehab / construction cost)
 */
export const SOFT_COSTS_DEFAULTS = {
  flip: {
    architectPct: 0.5,
    engineeringPct: 1.0,
    surveyPct: 0.5,
    permitsPct: 3.0,
    impactFeesPct: 1.0 // Total default: 6.0%
  },
  demo_new_build: {
    architectPct: 5.0,
    engineeringPct: 2.5,
    surveyPct: 1.5,
    permitsPct: 2.5,
    impactFeesPct: 2.5 // Total default: 14.0%
  }
};

/**
 * Optional site amenity add-on estimates (auto-hinted when pool/dock present, always editable)
 */
export const SITE_ADDON_ESTIMATES = {
  flip: {
    pool: 12000, // Pool resurface / equipment refresh estimate
    dock: 10000 // Dock decking / piling repair estimate
  },
  demo_new_build: {
    pool: 65000, // New in-ground gunite pool + deck estimate
    dock: 45000 // New private dock / seawall cap + lift allowance estimate
  }
};

/**
 * Default construction draw schedule (5 stages -> ~55% weighted avg balance drawn over build)
 */
export const DEFAULT_CONSTRUCTION_DRAW_SCHEDULE = [
  { id: 'site_demo', label: 'Site prep / Demo', pctOfBuild: 10, startMonthFrac: 0.05 },
  { id: 'foundation_shell', label: 'Foundation & CBS Shell', pctOfBuild: 25, startMonthFrac: 0.2 },
  { id: 'dry_in_mep', label: 'Roof, Impact & MEP Rough', pctOfBuild: 30, startMonthFrac: 0.45 },
  { id: 'finishes', label: 'Interior Finishes & Millwork', pctOfBuild: 25, startMonthFrac: 0.7 },
  { id: 'co_punch', label: 'CO, Landscape & Punch', pctOfBuild: 10, startMonthFrac: 0.9 }
];

/**
 * Computes weighted average percentage of the construction loan drawn across the hold period.
 */
export function computeWeightedDrawUtilization(drawSchedule = DEFAULT_CONSTRUCTION_DRAW_SCHEDULE) {
  if (!Array.isArray(drawSchedule) || drawSchedule.length === 0) return 0.55;
  let totalPct = 0;
  let weightedTime = 0;
  for (const stage of drawSchedule) {
    const pct = Math.max(0, Number(stage?.pctOfBuild) || 0);
    const startFrac = Math.min(1, Math.max(0, Number(stage?.startMonthFrac) || 0));
    const activeDurationFrac = 1 - startFrac;
    totalPct += pct;
    weightedTime += pct * activeDurationFrac;
  }
  if (totalPct <= 0) return 0.55;
  return Math.round((weightedTime / totalPct) * 1000) / 1000;
}

/**
 * Financing templates (Cash | Hard Money | Construction Loan)
 */
export const FINANCING_MODES = {
  cash: {
    id: 'cash',
    label: 'All Cash',
    ratePct: 0,
    pointsPct: 0,
    ltcPct: 0,
    rehabDrawUtilPct: 0,
    lenderFees: 0
  },
  hard_money: {
    id: 'hard_money',
    label: 'Hard Money',
    ratePct: 11.0,
    pointsPct: 2.0,
    ltcPct: 80, // % of purchase + rehab financed
    rehabDrawUtilPct: 60, // Avg % of rehab holdback drawn over hold
    lenderFees: 2500
  },
  construction_loan: {
    id: 'construction_loan',
    label: 'Construction Loan',
    ratePct: 9.25,
    pointsPct: 1.5,
    ltcPct: 75, // % of land + demo + hard + soft cost financed
    rehabDrawUtilPct: Math.round(computeWeightedDrawUtilization(DEFAULT_CONSTRUCTION_DRAW_SCHEDULE) * 100), // ~55%
    lenderFees: 4500,
    drawSchedule: DEFAULT_CONSTRUCTION_DRAW_SCHEDULE
  }
};

/**
 * Holding, closing, and selling defaults (all editable estimates)
 */
export const TRANSACTION_AND_HOLDING_DEFAULTS = {
  buyClosingPct: 2.0,
  sellCommissionPct: 5.0,
  sellClosingPct: 1.0,
  flDocStampsPct: FL_DEED_DOC_STAMPS_PCT, // 0.70% statutory FL deed doc stamps
  flipHoldMonthsDefault: 6,
  newBuildHoldMonthsDefault: 16,
  monthlyInsuranceFlip: 450,
  monthlyInsuranceNewBuild: 650,
  monthlyUtilitiesFlip: 350,
  monthlyUtilitiesNewBuild: 450
};

/**
 * Scenario sensitivity offsets (Low / Likely / High)
 */
export const SCENARIO_OFFSETS = {
  low: {
    key: 'low',
    label: 'Low (Conservative)',
    hardCostMult: 1.15, // +15% cost overrun
    extraHoldMonths: 2, // +2 months delay
    exitPriceMult: 0.95, // -5% resale price
    summary: '+15% build cost · +2 mo hold · −5% exit price'
  },
  likely: {
    key: 'likely',
    label: 'Likely (Base)',
    hardCostMult: 1.0,
    extraHoldMonths: 0,
    exitPriceMult: 1.0,
    summary: 'Your entered assumptions'
  },
  high: {
    key: 'high',
    label: 'High (Optimistic)',
    hardCostMult: 0.9, // -10% tighter bid
    extraHoldMonths: -1, // -1 month faster exit
    exitPriceMult: 1.03, // +3% resale price
    summary: '−10% build cost · −1 mo hold · +3% exit price'
  }
};

export const DEVELOPER_COSTS_CONFIG = {
  asOf: DEVELOPER_COSTS_AS_OF,
  asOfDisplay: DEVELOPER_COSTS_AS_OF_DISPLAY,
  disclaimer: DEVELOPER_COSTS_DISCLAIMER,
  flDocStampsPct: FL_DEED_DOC_STAMPS_PCT,
  flMortgageDocStampsPct: FL_MORTGAGE_DOC_STAMPS_PCT,
  flIntangibleTaxPct: FL_INTANGIBLE_TAX_PCT,
  millageByCounty: DEVELOPER_MILLAGE_BY_COUNTY,
  flipRehabLevels: FLIP_REHAB_LEVELS,
  newBuildQualityTiers: NEW_BUILD_QUALITY_TIERS,
  demoBrackets: DEMO_COST_BRACKETS,
  softCosts: SOFT_COSTS_DEFAULTS,
  siteAddons: SITE_ADDON_ESTIMATES,
  financingModes: FINANCING_MODES,
  drawSchedule: DEFAULT_CONSTRUCTION_DRAW_SCHEDULE,
  transactionAndHolding: TRANSACTION_AND_HOLDING_DEFAULTS,
  scenarios: SCENARIO_OFFSETS
};

export function getDeveloperMillageForCounty(countyRaw) {
  const s = String(countyRaw || '').trim().toLowerCase();
  if (s.includes('palm')) return DEVELOPER_MILLAGE_BY_COUNTY['Palm Beach'];
  if (s.includes('martin')) return DEVELOPER_MILLAGE_BY_COUNTY.Martin;
  if (s.includes('broward')) return DEVELOPER_MILLAGE_BY_COUNTY.Broward;
  return DEVELOPER_MILLAGE_BY_COUNTY.default;
}

export function sumSoftCostsPct(softObj = {}) {
  const keys = ['architectPct', 'engineeringPct', 'surveyPct', 'permitsPct', 'impactFeesPct'];
  const total = keys.reduce((acc, k) => acc + Math.max(0, Number(softObj?.[k]) || 0), 0);
  return Math.round(total * 100) / 100;
}

