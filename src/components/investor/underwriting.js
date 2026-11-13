/**
 * Real Estate Deal Underwriting Calculations
 * Pure JavaScript module: no React, no API dependencies.
 */

import {
  FINANCING_CONFIG,
  CREDIT_SCORE_BANDS,
  getMergedFinancingConfig,
  getFhaLimitForProperty,
  getDefaultMillageForCounty,
  normalizeCreditBand
} from '../../config/financing.js';

// ============================================================================
// 1. ESTIMATED CLOSING & TRANSACTION DEFAULTS
// Clearly labeled estimates in one place for easy modification.
// ============================================================================
export const ESTIMATED_CLOSING_DEFAULTS = {
  // Lender Fees (estimates)
  originationFee: 1200,
  underwritingFee: 900,
  appraisalFee: 650,
  creditReportFee: 75,

  // Florida Statutory Loan Taxes
  // FL doc stamps on mortgage: $0.35 per $100 (0.35% of loan amount)
  flDocStampRate: 0.0035,
  // FL non-recurring intangible tax on mortgage: 2 mills (0.20% of loan amount)
  flIntangibleTaxRate: 0.002,

  // Title & Settlement Fees (estimates)
  lendersTitlePolicy: 600,
  // Standard FL Promulgated Rate estimator: $5.75 per $1,000 up to $100k, then $5.00 per $1,000
  settlementClosingFee: 750,
  recordingFees: 250,

  // Prepaids & Escrows
  prepaidInsuranceMonths: 12,
  prepaidFloodMonths: 12,
  escrowMonths: 3,
  prepaidInterestDays: 15,

  // HOA / Condo Fees (only when HOA is enabled)
  estoppelFee: 250,
  hoaTransferFee: 150,
  capitalContributionFee: 500,

  // Inspection Estimates
  homeInspection: 450,
  fourPointInspection: 150,
  windMitigationInspection: 125,
  surveyFee: 450,
  termiteInspection: 125,

  // Florida Property Tax Estimate (FL resets to ~1.8% - 2.0% of market value post-sale)
  defaultPropertyTaxRate: 0.02,

  // Default Flood Insurance for SFHA properties
  defaultFloodInsuranceYr: 1800,

  // Default HOA dues for condos
  defaultCondoHoaMo: 350
};

// ============================================================================
// 2. LOAN TYPE CONFIGURATIONS
// ============================================================================
export const LOAN_TYPES = {
  cash: {
    key: 'cash',
    label: 'Cash',
    defaultDownPct: 100,
    defaultTermYears: 0,
    defaultPointsPct: 0,
    defaultInterestOnly: false,
    defaultPmiPct: 0,
    defaultRatePct: 0,
    isCash: true
  },
  conventional_investment: {
    key: 'conventional_investment',
    label: 'Conventional (investment)',
    defaultDownPct: 25,
    defaultTermYears: 30,
    defaultPointsPct: 0,
    defaultInterestOnly: false,
    defaultPmiPct: 0,
    defaultRatePct: 7.0,
    isCash: false
  },
  conventional_primary: {
    key: 'conventional_primary',
    label: 'Conventional (primary residence)',
    defaultDownPct: 20,
    defaultTermYears: 30,
    defaultPointsPct: 0,
    defaultInterestOnly: false,
    defaultPmiPct: 0,
    defaultRatePct: 6.5,
    isCash: false
  },
  fha: {
    key: 'fha',
    label: 'FHA (primary residence only)',
    defaultDownPct: 3.5,
    defaultTermYears: 30,
    defaultPointsPct: 0,
    defaultInterestOnly: false,
    defaultPmiPct: 0.55,
    defaultRatePct: 6.25,
    isCash: false,
    note: 'Owner-occupied only (1–4 units). FHA loans cannot be used for purely non-owner-occupied investment properties.'
  },
  dscr: {
    key: 'dscr',
    label: 'DSCR',
    defaultDownPct: 20,
    defaultTermYears: 30,
    defaultPointsPct: 1.0,
    defaultInterestOnly: false,
    defaultPmiPct: 0,
    defaultRatePct: 7.75,
    isCash: false
  },
  hard_money: {
    key: 'hard_money',
    label: 'Hard money',
    defaultDownPct: 20,
    defaultTermYears: 1,
    defaultPointsPct: 2.0,
    defaultInterestOnly: true,
    defaultPmiPct: 0,
    defaultRatePct: 10.5,
    isCash: false
  }
};

export const ALLOWED_CREDIT_TIERS = [
  '760+',
  '740-759',
  '720-739',
  '700-719',
  '680-699',
  '660-679',
  '640-659',
  'below 640'
];

export const DEFAULT_RATE_SHEET = {
  conventional_investment: {
    base_rate: 7.0,
    adjustments: {
      '760+': 0,
      '740-759': 0,
      '720-739': 0,
      '700-719': 0,
      '680-699': 0,
      '660-679': 0,
      '640-659': 0,
      'below 640': 0
    },
    note: "Enter your lender's quotes"
  },
  conventional_primary: {
    base_rate: 6.5,
    adjustments: {
      '760+': 0,
      '740-759': 0,
      '720-739': 0,
      '700-719': 0,
      '680-699': 0,
      '660-679': 0,
      '640-659': 0,
      'below 640': 0
    },
    note: "Enter your lender's quotes"
  },
  fha: {
    base_rate: 6.25,
    adjustments: {
      '760+': 0,
      '740-759': 0,
      '720-739': 0,
      '700-719': 0,
      '680-699': 0,
      '660-679': 0,
      '640-659': 0,
      'below 640': 0
    },
    note: "Enter your lender's quotes"
  },
  dscr: {
    base_rate: 7.75,
    adjustments: {
      '760+': 0,
      '740-759': 0,
      '720-739': 0,
      '700-719': 0,
      '680-699': 0,
      '660-679': 0,
      '640-659': 0,
      'below 640': 0
    },
    note: "Enter your lender's quotes"
  },
  hard_money: {
    base_rate: 10.5,
    adjustments: {
      '760+': 0,
      '740-759': 0,
      '720-739': 0,
      '700-719': 0,
      '680-699': 0,
      '660-679': 0,
      '640-659': 0,
      'below 640': 0
    },
    note: "Enter your lender's quotes"
  }
};

/**
 * Calculates Florida owner title policy estimate using FL promulgated rate.
 * $5.75 per $1,000 up to $100,000 ($575) + $5.00 per $1,000 from $100k to $1M.
 */
export function calculateFloridaOwnerTitlePolicy(purchasePrice) {
  const price = Number(purchasePrice) || 0;
  if (price <= 0) return 0;
  if (price <= 100000) {
    return Math.round((price / 1000) * 5.75);
  }
  const base = 575; // 100 * 5.75
  const excess = price - 100000;
  return Math.round(base + (excess / 1000) * 5.0);
}

/**
 * Calculates Florida statutory loan taxes:
 * - Mortgage Doc Stamps: 0.35% ($0.35 per $100 of loan amount)
 * - Intangible Tax: 0.20% (2 mills of loan amount)
 * Both are $0 for cash purchase.
 */
export function calculateFloridaLoanTaxes(loanAmount, isCash = false) {
  const loan = Number(loanAmount) || 0;
  if (isCash || loan <= 0) {
    return {
      docStamps: 0,
      intangibleTax: 0,
      totalFloridaLoanTaxes: 0
    };
  }

  const docStamps = Math.round(loan * ESTIMATED_CLOSING_DEFAULTS.flDocStampRate);
  const intangibleTax = Math.round(loan * ESTIMATED_CLOSING_DEFAULTS.flIntangibleTaxRate);

  return {
    docStamps,
    intangibleTax,
    totalFloridaLoanTaxes: docStamps + intangibleTax
  };
}

/**
 * Calculates monthly mortgage principal & interest payment.
 * Formula: P&I = L * r / (1 - (1 + r)^(-n))
 * where r = annual rate / 12, n = years * 12.
 * If r == 0, P&I = L / n.
 */
export function calculateMortgagePayment(loanAmount, annualRate, loanTermYears) {
  const L = Number(loanAmount) || 0;
  const years = Number(loanTermYears) || 0;
  const n = years * 12;

  if (L <= 0 || n <= 0) return 0;

  const rate = Number(annualRate) || 0;
  if (rate <= 0) {
    return L / n;
  }

  const r = rate / 12;
  const discountFactor = 1 - Math.pow(1 + r, -n);
  if (discountFactor === 0) return 0;

  return (L * r) / discountFactor;
}

/**
 * Format currency to whole dollars: e.g. "$1,250", "-$931"
 */
export function formatCurrency(val) {
  if (val == null || isNaN(val)) return '—';
  const num = Math.round(Number(val));
  const absFormatted = Math.abs(num).toLocaleString('en-US');
  return num < 0 ? `-$${absFormatted}` : `$${absFormatted}`;
}

/**
 * Format percentage to 1 decimal place: e.g. "7.0%", "-8.0%"
 */
export function formatPercent(val) {
  if (val == null || isNaN(val)) return '—';
  const num = Number(val) * 100;
  return `${num.toFixed(1)}%`;
}

/**
 * Format ratio to 2 decimals: e.g. "1.25"
 */
export function formatRatio(val) {
  if (val == null || isNaN(val)) return '—';
  return Number(val).toFixed(2);
}

/**
 * Calculates itemized Monthly Payment (PITI + HOA + Assessments + PMI).
 */
export function calculateMonthlyPayment(params = {}) {
  const {
    loan = 0,
    interestRatePct = 0, // e.g. 0.07 or 7.0 (handled automatically)
    loanTermYears = 30,
    isInterestOnly = false,
    isCash = false,
    purchasePrice = 0,
    propertyTaxesYr = null,
    insuranceYr = null,
    floodInsuranceYr = null,
    isFloodEnabled = false,
    hoaMo = 0,
    isHoaEnabled = false,
    specialAssessmentsMo = 0,
    pmiPct = 0 // annual % of loan, e.g. 0.0055 or 0.55
  } = params;

  // Rate normalization: if > 1, assume user entered e.g. 7.0 instead of 0.07
  const normalizedRate = Number(interestRatePct) > 1 ? Number(interestRatePct) / 100 : Number(interestRatePct) || 0;
  const normalizedPmi = Number(pmiPct) > 1 ? Number(pmiPct) / 100 : Number(pmiPct) || 0;

  // 1. Principal & Interest (or Interest-Only)
  let monthlyPI = 0;
  if (!isCash && loan > 0) {
    if (isInterestOnly) {
      monthlyPI = (loan * normalizedRate) / 12;
    } else {
      monthlyPI = calculateMortgagePayment(loan, normalizedRate, loanTermYears);
    }
  }

  // 2. Property Taxes: default 2% of price per year
  const taxesYr = propertyTaxesYr != null && propertyTaxesYr !== ''
    ? Number(propertyTaxesYr)
    : purchasePrice * ESTIMATED_CLOSING_DEFAULTS.defaultPropertyTaxRate;
  const taxesMo = taxesYr / 12;

  // 3. Homeowners Insurance
  const insYr = insuranceYr != null && insuranceYr !== '' ? Number(insuranceYr) : 0;
  const insuranceMo = insYr / 12;

  // 4. Flood Insurance (required if SFHA, editable)
  const floodYr = isFloodEnabled && floodInsuranceYr != null && floodInsuranceYr !== ''
    ? Number(floodInsuranceYr)
    : isFloodEnabled ? ESTIMATED_CLOSING_DEFAULTS.defaultFloodInsuranceYr : 0;
  const floodInsuranceMo = floodYr / 12;

  // 5. HOA Dues
  const hoaMonthly = isHoaEnabled ? Number(hoaMo) || 0 : 0;

  // 6. Special Assessments
  const specialAssessmentsMonthly = Number(specialAssessmentsMo) || 0;

  // 7. PMI
  const pmiMo = (!isCash && loan > 0 && normalizedPmi > 0)
    ? (loan * normalizedPmi) / 12
    : 0;

  // Total Monthly Payment (PITI + HOA + Special Assessments + PMI)
  const totalMonthlyPayment = monthlyPI + taxesMo + insuranceMo + floodInsuranceMo + hoaMonthly + specialAssessmentsMonthly + pmiMo;

  return {
    monthlyPI,
    taxesMo,
    taxesYr,
    insuranceMo,
    insuranceYr: insYr,
    floodInsuranceMo,
    floodInsuranceYr: floodYr,
    hoaMonthly,
    specialAssessmentsMonthly,
    pmiMo,
    totalMonthlyPayment
  };
}

/**
 * Calculates itemized Cash to Close.
 */
export function calculateCashToClose(params = {}) {
  const price = Number(params.purchasePrice) || 0;
  const loan = Number(params.loan) || 0;
  const isCash = Boolean(params.isCash || loan <= 0);

  // 1. Earnest Money Deposit (due at contract, counted in total)
  const earnestMoney = params.earnestMoney != null && params.earnestMoney !== ''
    ? Number(params.earnestMoney)
    : Math.max(5000, Math.round(price * 0.01));

  // 2. Down payment
  const downPayment = isCash ? price : Math.max(0, price - loan);

  // 3. Lender Fees
  const pointsPct = Number(params.pointsPct) > 1 ? Number(params.pointsPct) / 100 : Number(params.pointsPct) || 0;
  const pointsCost = isCash ? 0 : Math.round(loan * pointsPct);

  const originationFee = isCash ? 0 : (params.originationFee != null ? Number(params.originationFee) : ESTIMATED_CLOSING_DEFAULTS.originationFee);
  const underwritingFee = isCash ? 0 : (params.underwritingFee != null ? Number(params.underwritingFee) : ESTIMATED_CLOSING_DEFAULTS.underwritingFee);
  const appraisalFee = isCash ? 0 : (params.appraisalFee != null ? Number(params.appraisalFee) : ESTIMATED_CLOSING_DEFAULTS.appraisalFee);
  const creditReportFee = isCash ? 0 : (params.creditReportFee != null ? Number(params.creditReportFee) : ESTIMATED_CLOSING_DEFAULTS.creditReportFee);

  const totalLenderFees = pointsCost + originationFee + underwritingFee + appraisalFee + creditReportFee;

  // 4. Florida Loan Taxes
  const flTaxes = calculateFloridaLoanTaxes(loan, isCash);
  const docStamps = flTaxes.docStamps;
  const intangibleTax = flTaxes.intangibleTax;
  const totalFlLoanTaxes = flTaxes.totalFloridaLoanTaxes;

  // 5. Title & Settlement
  const lendersTitlePolicy = isCash ? 0 : (params.lendersTitlePolicy != null ? Number(params.lendersTitlePolicy) : ESTIMATED_CLOSING_DEFAULTS.lendersTitlePolicy);
  const ownerTitlePaidByBuyer = params.ownerTitlePaidByBuyer !== false; // default true (paid by buyer)
  const ownersTitlePolicy = ownerTitlePaidByBuyer
    ? (params.ownersTitlePolicy != null ? Number(params.ownersTitlePolicy) : calculateFloridaOwnerTitlePolicy(price))
    : 0;
  const settlementFee = params.settlementClosingFee != null ? Number(params.settlementClosingFee) : ESTIMATED_CLOSING_DEFAULTS.settlementClosingFee;
  const recordingFees = params.recordingFees != null ? Number(params.recordingFees) : ESTIMATED_CLOSING_DEFAULTS.recordingFees;

  const totalTitleFees = lendersTitlePolicy + ownersTitlePolicy + settlementFee + recordingFees;

  // 6. Prepaids and Escrow
  const insuranceYr = Number(params.insuranceYr) || 0;
  const floodInsuranceYr = Number(params.floodInsuranceYr) || 0;
  const taxesYr = Number(params.taxesYr) || (price * ESTIMATED_CLOSING_DEFAULTS.defaultPropertyTaxRate);

  const prepaidInsurance = insuranceYr; // 12 months upfront
  const prepaidFlood = params.isFloodEnabled ? floodInsuranceYr : 0; // 12 months upfront if on

  const escrowMonths = params.escrowMonths != null ? Number(params.escrowMonths) : ESTIMATED_CLOSING_DEFAULTS.escrowMonths;
  const escrowReserves = isCash ? 0 : Math.round(escrowMonths * ((taxesYr + insuranceYr + (params.isFloodEnabled ? floodInsuranceYr : 0)) / 12));

  const prepaidInterestDays = params.prepaidInterestDays != null ? Number(params.prepaidInterestDays) : ESTIMATED_CLOSING_DEFAULTS.prepaidInterestDays;
  const interestRate = Number(params.interestRatePct) > 1 ? Number(params.interestRatePct) / 100 : Number(params.interestRatePct) || 0;
  const prepaidInterest = isCash ? 0 : Math.round((loan * interestRate / 365) * prepaidInterestDays);

  const totalPrepaidsEscrow = prepaidInsurance + prepaidFlood + escrowReserves + prepaidInterest;

  // 7. HOA / Condo Fees (only when HOA is enabled)
  const isHoaEnabled = Boolean(params.isHoaEnabled);
  const estoppelFee = isHoaEnabled ? (params.estoppelFee != null ? Number(params.estoppelFee) : ESTIMATED_CLOSING_DEFAULTS.estoppelFee) : 0;
  const hoaTransferFee = isHoaEnabled ? (params.hoaTransferFee != null ? Number(params.hoaTransferFee) : ESTIMATED_CLOSING_DEFAULTS.hoaTransferFee) : 0;
  const capitalContribution = isHoaEnabled ? (params.capitalContributionFee != null ? Number(params.capitalContributionFee) : ESTIMATED_CLOSING_DEFAULTS.capitalContributionFee) : 0;

  const totalHoaFees = estoppelFee + hoaTransferFee + capitalContribution;

  // 8. Inspections
  const homeInspection = params.homeInspection != null ? Number(params.homeInspection) : ESTIMATED_CLOSING_DEFAULTS.homeInspection;
  const fourPointInspection = params.fourPointInspection != null ? Number(params.fourPointInspection) : ESTIMATED_CLOSING_DEFAULTS.fourPointInspection;
  const windMitigation = params.windMitigationInspection != null ? Number(params.windMitigationInspection) : ESTIMATED_CLOSING_DEFAULTS.windMitigationInspection;
  const surveyFee = params.surveyFee != null ? Number(params.surveyFee) : ESTIMATED_CLOSING_DEFAULTS.surveyFee;
  const termiteInspection = params.termiteInspection != null ? Number(params.termiteInspection) : ESTIMATED_CLOSING_DEFAULTS.termiteInspection;

  const totalInspectionFees = homeInspection + fourPointInspection + windMitigation + surveyFee + termiteInspection;

  // 9. Seller Credits
  const sellerCredits = Number(params.sellerCredits) || 0;

  // Total Closing Costs (excluding down payment & minus seller credits)
  const totalClosingCosts = Math.max(0, (totalLenderFees + totalFlLoanTaxes + totalTitleFees + totalPrepaidsEscrow + totalHoaFees + totalInspectionFees) - sellerCredits);

  // Total Cash to Close (Down payment + Closing costs)
  const totalCashToClose = downPayment + totalClosingCosts;

  // Remaining due at closing table (Cash to close minus earnest money deposit already paid)
  const balanceDueAtClosing = Math.max(0, totalCashToClose - earnestMoney);

  return {
    earnestMoney,
    downPayment,
    lenderFees: {
      pointsCost,
      originationFee,
      underwritingFee,
      appraisalFee,
      creditReportFee,
      totalLenderFees
    },
    floridaLoanTaxes: {
      docStamps,
      intangibleTax,
      totalFlLoanTaxes
    },
    titleFees: {
      lendersTitlePolicy,
      ownersTitlePolicy,
      ownerTitlePaidByBuyer,
      settlementFee,
      recordingFees,
      totalTitleFees
    },
    prepaidsEscrow: {
      prepaidInsurance,
      prepaidFlood,
      escrowReserves,
      prepaidInterest,
      totalPrepaidsEscrow
    },
    hoaFees: {
      estoppelFee,
      hoaTransferFee,
      capitalContribution,
      totalHoaFees
    },
    inspections: {
      homeInspection,
      fourPointInspection,
      windMitigation,
      surveyFee,
      termiteInspection,
      totalInspectionFees
    },
    sellerCredits,
    totalClosingCosts,
    totalCashToClose,
    balanceDueAtClosing
  };
}

/**
 * Calculates Total Liquid Cash Needed and compares against buyer's profile.
 * Total Liquid Cash Needed = Cash to Close + Rehab Paid in Cash + Holding Costs + Reserves (reserve_months * totalMonthlyPayment)
 */
export function calculateLiquidCashNeeded(params = {}) {
  const cashToClose = Number(params.cashToClose) || 0;
  const rehabCash = Number(params.rehabCash) || 0;
  const holdingCosts = Number(params.holdingCosts) || 0;
  const reserveMonths = params.reserveMonths != null ? Number(params.reserveMonths) : 6;
  const monthlyPayment = Number(params.monthlyPayment) || 0;

  const reserveCash = Math.round(reserveMonths * monthlyPayment);
  const totalLiquidCashNeeded = cashToClose + rehabCash + holdingCosts + reserveCash;

  const profileLiquidCash = Number(params.profileLiquidCash) || 0;
  const diff = profileLiquidCash - totalLiquidCashNeeded;
  const isCovered = diff >= 0;

  return {
    cashToClose,
    rehabCash,
    holdingCosts,
    reserveMonths,
    reserveCash,
    totalLiquidCashNeeded,
    profileLiquidCash,
    isCovered,
    diff: Math.abs(diff),
    summaryText: isCovered
      ? `Covered with ${formatCurrency(diff)} left`
      : `You need ${formatCurrency(totalLiquidCashNeeded)} · You have ${formatCurrency(profileLiquidCash)} · Short ${formatCurrency(Math.abs(diff))}`
  };
}

/**
 * Underwrite a RENTAL deal.
 */
export function underwriteRental(inputs = {}) {
  const price = Number(inputs.purchasePrice) || 0;
  const loanType = inputs.loanType || (inputs.isCash ? 'cash' : 'conventional_investment');
  const isCash = loanType === 'cash' || inputs.isCash === true;

  const downPct = inputs.downPaymentPct != null
    ? (Number(inputs.downPaymentPct) > 1 ? Number(inputs.downPaymentPct) / 100 : Number(inputs.downPaymentPct))
    : (isCash ? 1.0 : 0.25);

  const rate = inputs.interestRatePct != null
    ? (Number(inputs.interestRatePct) > 1 ? Number(inputs.interestRatePct) / 100 : Number(inputs.interestRatePct))
    : (isCash ? 0 : 0.07);

  const termYears = inputs.loanTermYears != null ? Number(inputs.loanTermYears) : (isCash ? 0 : 30);
  const isInterestOnly = Boolean(inputs.isInterestOnly);

  const rent = inputs.monthlyRent != null && inputs.monthlyRent !== '' ? Number(inputs.monthlyRent) : null;
  const vacancyPct = inputs.vacancyPct != null ? (Number(inputs.vacancyPct) > 1 ? Number(inputs.vacancyPct) / 100 : Number(inputs.vacancyPct)) : 0.05;
  const maintenancePct = inputs.maintenancePct != null ? (Number(inputs.maintenancePct) > 1 ? Number(inputs.maintenancePct) / 100 : Number(inputs.maintenancePct)) : 0.05;
  const capexPct = inputs.capexPct != null ? (Number(inputs.capexPct) > 1 ? Number(inputs.capexPct) / 100 : Number(inputs.capexPct)) : 0.05;
  const mgmtPct = inputs.managementPct != null ? (Number(inputs.managementPct) > 1 ? Number(inputs.managementPct) / 100 : Number(inputs.managementPct)) : 0.00;

  const taxesYr = inputs.propertyTaxesYr != null && inputs.propertyTaxesYr !== ''
    ? Number(inputs.propertyTaxesYr)
    : price * ESTIMATED_CLOSING_DEFAULTS.defaultPropertyTaxRate;

  const insuranceYr = inputs.insuranceYr != null && inputs.insuranceYr !== ''
    ? Number(inputs.insuranceYr)
    : null;

  const isFloodEnabled = Boolean(inputs.isFloodEnabled);
  const floodInsuranceYr = isFloodEnabled
    ? (inputs.floodInsuranceYr != null && inputs.floodInsuranceYr !== '' ? Number(inputs.floodInsuranceYr) : ESTIMATED_CLOSING_DEFAULTS.defaultFloodInsuranceYr)
    : 0;

  const isHoaEnabled = Boolean(inputs.isHoaEnabled);
  const hoaMo = isHoaEnabled ? Number(inputs.hoaMo) || 0 : 0;
  const specialAssessmentsMo = Number(inputs.specialAssessmentsMo) || 0;

  // Loan calculation
  const loan = isCash ? 0 : Math.round(price * (1 - downPct));

  // Monthly Payment
  const monthlyDetails = calculateMonthlyPayment({
    loan,
    interestRatePct: rate,
    loanTermYears: termYears,
    isInterestOnly,
    isCash,
    purchasePrice: price,
    propertyTaxesYr: taxesYr,
    insuranceYr,
    floodInsuranceYr,
    isFloodEnabled,
    hoaMo,
    isHoaEnabled,
    specialAssessmentsMo,
    pmiPct: inputs.pmiPct || 0
  });

  const monthlyPI = monthlyDetails.monthlyPI;
  const debtYr = monthlyPI * 12;

  // Cash to Close
  let closingDetails;
  if (inputs.closingCostsPct != null && inputs.useSimplifiedClosing) {
    // Legacy / simplified formula if explicitly requested
    const closingPct = Number(inputs.closingCostsPct) > 1 ? Number(inputs.closingCostsPct) / 100 : Number(inputs.closingCostsPct);
    const downPayment = price * downPct;
    const closingCosts = price * closingPct;
    closingDetails = {
      totalCashToClose: downPayment + closingCosts,
      downPayment,
      totalClosingCosts: closingCosts
    };
  } else {
    closingDetails = calculateCashToClose({
      purchasePrice: price,
      loan,
      isCash,
      earnestMoney: inputs.earnestMoney,
      pointsPct: inputs.pointsPct,
      originationFee: inputs.originationFee,
      underwritingFee: inputs.underwritingFee,
      appraisalFee: inputs.appraisalFee,
      creditReportFee: inputs.creditReportFee,
      lendersTitlePolicy: inputs.lendersTitlePolicy,
      ownersTitlePolicy: inputs.ownersTitlePolicy,
      ownerTitlePaidByBuyer: inputs.ownerTitlePaidByBuyer,
      settlementClosingFee: inputs.settlementClosingFee,
      recordingFees: inputs.recordingFees,
      insuranceYr: insuranceYr || 0,
      floodInsuranceYr,
      isFloodEnabled,
      taxesYr,
      escrowMonths: inputs.escrowMonths,
      prepaidInterestDays: inputs.prepaidInterestDays,
      interestRatePct: rate,
      isHoaEnabled,
      estoppelFee: inputs.estoppelFee,
      hoaTransferFee: inputs.hoaTransferFee,
      capitalContributionFee: inputs.capitalContributionFee,
      homeInspection: inputs.homeInspection,
      fourPointInspection: inputs.fourPointInspection,
      windMitigationInspection: inputs.windMitigationInspection,
      surveyFee: inputs.surveyFee,
      termiteInspection: inputs.termiteInspection,
      sellerCredits: inputs.sellerCredits
    });
  }

  const downPayment = closingDetails.downPayment;
  const closingCosts = closingDetails.totalClosingCosts;
  const cashNeeded = closingDetails.totalCashToClose;

  // Total Liquid Cash Needed
  const liquidCashDetails = calculateLiquidCashNeeded({
    cashToClose: cashNeeded,
    rehabCash: Number(inputs.rehabBudget) || 0,
    holdingCosts: Number(inputs.holdingCosts) || 0,
    reserveMonths: inputs.reserveMonths != null ? Number(inputs.reserveMonths) : 6,
    monthlyPayment: monthlyDetails.totalMonthlyPayment,
    profileLiquidCash: inputs.profileLiquidCash
  });

  // Missing input checks
  const missingInputs = [];
  if (rent == null || rent <= 0) missingInputs.push('rent');
  if (insuranceYr == null) missingInputs.push('insurance');

  if (missingInputs.length > 0) {
    let hint = 'Add rent to see cash flow';
    if (!missingInputs.includes('rent') && missingInputs.includes('insurance')) {
      hint = 'Add insurance to see cash flow';
    } else if (missingInputs.includes('rent') && missingInputs.includes('insurance')) {
      hint = 'Add rent & insurance to see cash flow';
    }

    return {
      isComplete: false,
      hint,
      verdict: hint,
      loan,
      monthlyPI,
      debtYr,
      cashNeeded,
      downPayment,
      closingCosts,
      closingDetails,
      monthlyDetails,
      liquidCashDetails,
      propertyTaxesYr: taxesYr,
      effectiveIncomeYr: null,
      operatingExpensesYr: null,
      noi: null,
      cashFlowYr: null,
      monthlyCashFlow: null,
      capRate: null,
      cashOnCash: null,
      dscr: null,
      onePercentRule: rent && price > 0 ? rent / price : null
    };
  }

  // Operating Calculations
  const rentAnnual = rent * 12;
  const effectiveIncomeYr = rentAnnual * (1 - vacancyPct);
  const variableExpenses = rentAnnual * (maintenancePct + capexPct + mgmtPct);
  const operatingExpensesYr = taxesYr + (insuranceYr || 0) + floodInsuranceYr + (hoaMo * 12) + (specialAssessmentsMo * 12) + variableExpenses;

  const noi = effectiveIncomeYr - operatingExpensesYr;
  const cashFlowYr = noi - debtYr;
  const monthlyCashFlow = cashFlowYr / 12;

  const capRate = price > 0 ? noi / price : null;
  const cashOnCash = cashNeeded > 0 ? cashFlowYr / cashNeeded : null;
  const dscr = debtYr > 0 ? noi / debtYr : null;
  const onePercentRule = price > 0 ? rent / price : null;

  // Verdict
  let verdict = "Doesn't cash flow at this price.";
  if (cashFlowYr > 0 && cashOnCash >= 0.08) {
    verdict = 'Strong rental at this price.';
  } else if (cashFlowYr > 0) {
    verdict = 'Cash flows, but thin.';
  }

  return {
    isComplete: true,
    hint: null,
    verdict,
    loan,
    monthlyPI,
    debtYr,
    downPayment,
    closingCosts,
    cashNeeded,
    closingDetails,
    monthlyDetails,
    liquidCashDetails,
    propertyTaxesYr: taxesYr,
    effectiveIncomeYr,
    operatingExpensesYr,
    noi,
    cashFlowYr,
    monthlyCashFlow,
    capRate,
    cashOnCash,
    dscr,
    onePercentRule
  };
}

/**
 * Underwrite a FLIP deal.
 */
export function underwriteFlip(inputs = {}) {
  const price = Number(inputs.purchasePrice) || 0;
  const rehab = Number(inputs.rehabBudget) || 0;
  const arv = inputs.arv != null && inputs.arv !== '' ? Number(inputs.arv) : null;
  const holdingMonths = inputs.holdingMonths != null ? Number(inputs.holdingMonths) : 6;
  const sellingCostsPct = inputs.sellingCostsPct != null
    ? (Number(inputs.sellingCostsPct) > 1 ? Number(inputs.sellingCostsPct) / 100 : Number(inputs.sellingCostsPct))
    : 0.08;

  const loanType = inputs.loanType || (inputs.isCash ? 'cash' : 'hard_money');
  const isCash = loanType === 'cash' || inputs.isCash === true;

  const downPct = inputs.downPaymentPct != null
    ? (Number(inputs.downPaymentPct) > 1 ? Number(inputs.downPaymentPct) / 100 : Number(inputs.downPaymentPct))
    : (isCash ? 1.0 : 0.20);

  const rate = inputs.interestRatePct != null
    ? (Number(inputs.interestRatePct) > 1 ? Number(inputs.interestRatePct) / 100 : Number(inputs.interestRatePct))
    : (isCash ? 0 : 0.105);

  const loan = isCash ? 0 : Math.round(price * (1 - downPct));

  // Monthly financing and carry calculation
  const monthlyDetails = calculateMonthlyPayment({
    loan,
    interestRatePct: rate,
    loanTermYears: inputs.loanTermYears || 1,
    isInterestOnly: inputs.isInterestOnly !== false,
    isCash,
    purchasePrice: price,
    propertyTaxesYr: inputs.propertyTaxesYr,
    insuranceYr: inputs.insuranceYr,
    floodInsuranceYr: inputs.floodInsuranceYr,
    isFloodEnabled: inputs.isFloodEnabled,
    hoaMo: inputs.hoaMo,
    isHoaEnabled: inputs.isHoaEnabled,
    specialAssessmentsMo: inputs.specialAssessmentsMo
  });

  // Cash to close
  let closingDetails;
  if (inputs.buyingClosingCostsPct != null && inputs.useSimplifiedClosing) {
    const buyClosingPct = Number(inputs.buyingClosingCostsPct) > 1 ? Number(inputs.buyingClosingCostsPct) / 100 : Number(inputs.buyingClosingCostsPct);
    const buyClosingCosts = price * buyClosingPct;
    closingDetails = {
      totalCashToClose: price * downPct + buyClosingCosts,
      downPayment: price * downPct,
      totalClosingCosts: buyClosingCosts
    };
  } else {
    closingDetails = calculateCashToClose({
      purchasePrice: price,
      loan,
      isCash,
      pointsPct: inputs.pointsPct,
      earnestMoney: inputs.earnestMoney,
      sellerCredits: inputs.sellerCredits,
      isHoaEnabled: inputs.isHoaEnabled,
      isFloodEnabled: inputs.isFloodEnabled
    });
  }

  const buyClosingCosts = closingDetails.totalClosingCosts;
  const cashToClose = closingDetails.totalCashToClose;

  // Holding Costs: default to monthly payment * holdingMonths if holdingCostMo not specified
  const holdingCostMo = inputs.holdingCostMo != null && inputs.holdingCostMo !== ''
    ? Number(inputs.holdingCostMo)
    : monthlyDetails.totalMonthlyPayment;

  const totalHoldingCost = holdingCostMo * holdingMonths;

  // Total project cost
  const totalCost = price + rehab + buyClosingCosts + totalHoldingCost;

  // Total liquid cash needed
  const liquidCashDetails = calculateLiquidCashNeeded({
    cashToClose,
    rehabCash: rehab, // out-of-pocket rehab
    holdingCosts: totalHoldingCost,
    reserveMonths: inputs.reserveMonths != null ? Number(inputs.reserveMonths) : 6,
    monthlyPayment: monthlyDetails.totalMonthlyPayment,
    profileLiquidCash: inputs.profileLiquidCash
  });

  if (arv == null || arv <= 0) {
    const hint = 'Add ARV to see flip profit';
    return {
      isComplete: false,
      hint,
      verdict: hint,
      totalCost,
      buyClosingCosts,
      totalHoldingCost,
      closingDetails,
      monthlyDetails,
      liquidCashDetails,
      loan,
      maxOffer: null,
      projectedProfit: null,
      roi: null,
      sellingCosts: null
    };
  }

  const sellingCosts = arv * sellingCostsPct;
  const profit = arv - totalCost - sellingCosts;
  const roi = totalCost > 0 ? profit / totalCost : null;
  const maxOffer = (arv * 0.70) - rehab;

  let verdict = 'Loses money at this price.';
  if (price <= maxOffer) {
    verdict = 'Meets the 70% rule.';
  } else if (profit > 0) {
    verdict = 'Profitable, but thinner than the 70% rule.';
  }

  return {
    isComplete: true,
    hint: null,
    verdict,
    totalCost,
    buyClosingCosts,
    totalHoldingCost,
    sellingCosts,
    maxOffer,
    projectedProfit: profit,
    roi,
    loan,
    closingDetails,
    monthlyDetails,
    liquidCashDetails
  };
}

/**
 * Underwrite a BRRRR deal.
 */
export function underwriteBrrrr(inputs = {}) {
  const price = Number(inputs.purchasePrice) || 0;
  const rehab = Number(inputs.rehabBudget) || 0;
  const arv = inputs.arv != null && inputs.arv !== '' ? Number(inputs.arv) : null;

  const loanType = inputs.loanType || (inputs.isCash ? 'cash' : 'hard_money');
  const isCash = loanType === 'cash' || inputs.isCash === true;

  const downPct = inputs.downPaymentPct != null
    ? (Number(inputs.downPaymentPct) > 1 ? Number(inputs.downPaymentPct) / 100 : Number(inputs.downPaymentPct))
    : (isCash ? 1.0 : 0.20);

  const buyRate = inputs.interestRatePct != null
    ? (Number(inputs.interestRatePct) > 1 ? Number(inputs.interestRatePct) / 100 : Number(inputs.interestRatePct))
    : (isCash ? 0 : 0.105);

  const buyLoan = isCash ? 0 : Math.round(price * (1 - downPct));

  // Purchase loan monthly carry
  const buyMonthlyDetails = calculateMonthlyPayment({
    loan: buyLoan,
    interestRatePct: buyRate,
    loanTermYears: inputs.loanTermYears || 1,
    isInterestOnly: inputs.isInterestOnly !== false,
    isCash,
    purchasePrice: price,
    propertyTaxesYr: inputs.propertyTaxesYr,
    insuranceYr: inputs.insuranceYr,
    floodInsuranceYr: inputs.floodInsuranceYr,
    isFloodEnabled: inputs.isFloodEnabled,
    hoaMo: inputs.hoaMo,
    isHoaEnabled: inputs.isHoaEnabled,
    specialAssessmentsMo: inputs.specialAssessmentsMo
  });

  // Purchase Cash to Close
  let closingDetails;
  if (inputs.buyingClosingCostsPct != null && inputs.useSimplifiedClosing) {
    const buyClosingPct = Number(inputs.buyingClosingCostsPct) > 1 ? Number(inputs.buyingClosingCostsPct) / 100 : Number(inputs.buyingClosingCostsPct);
    const buyClosingCosts = price * buyClosingPct;
    closingDetails = {
      totalCashToClose: price * downPct + buyClosingCosts,
      downPayment: price * downPct,
      totalClosingCosts: buyClosingCosts
    };
  } else {
    closingDetails = calculateCashToClose({
      purchasePrice: price,
      loan: buyLoan,
      isCash,
      pointsPct: inputs.pointsPct,
      earnestMoney: inputs.earnestMoney,
      sellerCredits: inputs.sellerCredits,
      isHoaEnabled: inputs.isHoaEnabled,
      isFloodEnabled: inputs.isFloodEnabled
    });
  }

  const buyClosingCosts = closingDetails.totalClosingCosts;
  const cashToClose = closingDetails.totalCashToClose;

  // Refinance Inputs
  const refiLtvPct = inputs.refiLtvPct != null
    ? (Number(inputs.refiLtvPct) > 1 ? Number(inputs.refiLtvPct) / 100 : Number(inputs.refiLtvPct))
    : 0.75;

  const refiRatePct = inputs.refiRatePct != null
    ? (Number(inputs.refiRatePct) > 1 ? Number(inputs.refiRatePct) / 100 : Number(inputs.refiRatePct))
    : 0.07;

  const refiTermYears = inputs.refiTermYears != null ? Number(inputs.refiTermYears) : 30;

  const refiClosingPct = inputs.refiClosingPct != null
    ? (Number(inputs.refiClosingPct) > 1 ? Number(inputs.refiClosingPct) / 100 : Number(inputs.refiClosingPct))
    : 0.02;

  // Rental inputs
  const rent = inputs.monthlyRent != null && inputs.monthlyRent !== '' ? Number(inputs.monthlyRent) : null;
  const vacancyPct = inputs.vacancyPct != null ? (Number(inputs.vacancyPct) > 1 ? Number(inputs.vacancyPct) / 100 : Number(inputs.vacancyPct)) : 0.05;
  const maintenancePct = inputs.maintenancePct != null ? (Number(inputs.maintenancePct) > 1 ? Number(inputs.maintenancePct) / 100 : Number(inputs.maintenancePct)) : 0.05;
  const capexPct = inputs.capexPct != null ? (Number(inputs.capexPct) > 1 ? Number(inputs.capexPct) / 100 : Number(inputs.capexPct)) : 0.05;
  const mgmtPct = inputs.managementPct != null ? (Number(inputs.managementPct) > 1 ? Number(inputs.managementPct) / 100 : Number(inputs.managementPct)) : 0.00;

  const taxesYr = inputs.propertyTaxesYr != null && inputs.propertyTaxesYr !== ''
    ? Number(inputs.propertyTaxesYr)
    : price * ESTIMATED_CLOSING_DEFAULTS.defaultPropertyTaxRate;

  const insuranceYr = inputs.insuranceYr != null && inputs.insuranceYr !== ''
    ? Number(inputs.insuranceYr)
    : null;

  const isFloodEnabled = Boolean(inputs.isFloodEnabled);
  const floodInsuranceYr = isFloodEnabled
    ? (inputs.floodInsuranceYr != null && inputs.floodInsuranceYr !== '' ? Number(inputs.floodInsuranceYr) : ESTIMATED_CLOSING_DEFAULTS.defaultFloodInsuranceYr)
    : 0;

  const isHoaEnabled = Boolean(inputs.isHoaEnabled);
  const hoaMo = isHoaEnabled ? Number(inputs.hoaMo) || 0 : 0;
  const specialAssessmentsMo = Number(inputs.specialAssessmentsMo) || 0;

  // Initial Liquid cash needed to acquire and rehab
  const initialLiquidCashDetails = calculateLiquidCashNeeded({
    cashToClose,
    rehabCash: rehab,
    holdingCosts: Number(inputs.holdingCosts) || (buyMonthlyDetails.totalMonthlyPayment * (inputs.holdingMonths || 6)),
    reserveMonths: inputs.reserveMonths != null ? Number(inputs.reserveMonths) : 6,
    monthlyPayment: buyMonthlyDetails.totalMonthlyPayment,
    profileLiquidCash: inputs.profileLiquidCash
  });

  if (arv == null || arv <= 0) {
    const hint = 'Add ARV to see refinance numbers';
    return {
      isComplete: false,
      hint,
      verdict: hint,
      buyLoan,
      closingDetails,
      buyMonthlyDetails,
      initialLiquidCashDetails,
      refiLoan: null,
      allInCost: null,
      cashLeftInDeal: null,
      postRefiMonthlyCashFlow: null,
      cashOnCash: null,
      isInfiniteCoC: false
    };
  }

  const refiLoan = Math.round(arv * refiLtvPct);
  const refiClosingCosts = Math.round(refiLoan * refiClosingPct);
  const allInCost = price + rehab + buyClosingCosts + refiClosingCosts;
  const cashLeftInDeal = allInCost - refiLoan;

  // Post-refi debt service
  const refiMonthlyPI = calculateMortgagePayment(refiLoan, refiRatePct, refiTermYears);
  const refiDebtYr = refiMonthlyPI * 12;

  // Post-refi monthly payment details
  const postRefiMonthlyDetails = calculateMonthlyPayment({
    loan: refiLoan,
    interestRatePct: refiRatePct,
    loanTermYears: refiTermYears,
    isInterestOnly: false,
    isCash: false,
    purchasePrice: arv, // taxes might adjust to ARV post-refi
    propertyTaxesYr: taxesYr,
    insuranceYr,
    floodInsuranceYr,
    isFloodEnabled,
    hoaMo,
    isHoaEnabled,
    specialAssessmentsMo
  });

  // Missing rental inputs check
  if (rent == null || rent <= 0 || insuranceYr == null) {
    let hint = 'Add rent & insurance to see post-refi cash flow';
    if (rent != null && rent > 0) hint = 'Add insurance to see post-refi cash flow';
    else if (insuranceYr != null) hint = 'Add rent to see post-refi cash flow';

    let verdict = 'Leaves ' + formatCurrency(Math.max(0, cashLeftInDeal)) + ' in the deal.';
    if (allInCost > 0 && cashLeftInDeal <= 0.10 * allInCost) {
      verdict = 'Most of your cash comes back out.';
    }

    return {
      isComplete: false,
      hint,
      verdict,
      buyLoan,
      closingDetails,
      buyMonthlyDetails,
      initialLiquidCashDetails,
      refiLoan,
      allInCost,
      cashLeftInDeal,
      postRefiMonthlyCashFlow: null,
      cashOnCash: null,
      isInfiniteCoC: false,
      postRefiMonthlyDetails
    };
  }

  // Operating calculations post-refi
  const rentAnnual = rent * 12;
  const effectiveIncomeYr = rentAnnual * (1 - vacancyPct);
  const variableExpenses = rentAnnual * (maintenancePct + capexPct + mgmtPct);
  const operatingExpensesYr = taxesYr + insuranceYr + floodInsuranceYr + (hoaMo * 12) + (specialAssessmentsMo * 12) + variableExpenses;

  const noi = effectiveIncomeYr - operatingExpensesYr;
  const cashFlowYr = noi - refiDebtYr;
  const postRefiMonthlyCashFlow = cashFlowYr / 12;

  let cashOnCash = null;
  let isInfiniteCoC = false;
  if (cashLeftInDeal <= 0) {
    isInfiniteCoC = true;
  } else {
    cashOnCash = cashFlowYr / cashLeftInDeal;
  }

  // Verdict
  let verdict = 'Leaves ' + formatCurrency(cashLeftInDeal) + ' in the deal.';
  if (allInCost > 0 && cashLeftInDeal <= 0.10 * allInCost) {
    verdict = 'Most of your cash comes back out.';
  }

  return {
    isComplete: true,
    hint: null,
    verdict,
    buyLoan,
    closingDetails,
    buyMonthlyDetails,
    initialLiquidCashDetails,
    refiLoan,
    allInCost,
    cashLeftInDeal,
    postRefiMonthlyCashFlow,
    cashOnCash,
    isInfiniteCoC,
    noi,
    operatingExpensesYr,
    refiDebtYr,
    postRefiMonthlyDetails
  };
}

// ============================================================================
// 8. LIVE-IN PLAN (FHA) UNDERWRITING & FIT SCREENING
// ============================================================================

/**
 * Remaining principal balance on a standard amortizing loan after `monthsPaid` payments.
 */
export function calculateRemainingLoanBalance(principal, annualRateDecimal, termYears = 30, monthsPaid = 0) {
  const p = Number(principal) || 0;
  if (p <= 0) return 0;
  const totalMonths = Math.max(1, Math.round((Number(termYears) || 30) * 12));
  const k = Math.max(0, Math.min(totalMonths, Math.round(Number(monthsPaid) || 0)));
  if (k <= 0) return p;
  if (k >= totalMonths) return 0;

  let rateDec = Number(annualRateDecimal) || 0;
  if (rateDec > 1) rateDec = rateDec / 100;
  if (rateDec <= 0) {
    return p * (1 - k / totalMonths);
  }

  const r = rateDec / 12;
  const compoundTotal = Math.pow(1 + r, totalMonths);
  const compoundPaid = Math.pow(1 + r, k);
  return p * ((compoundTotal - compoundPaid) / (compoundTotal - 1));
}

/**
 * Compare Florida Homesteaded primary-residence property tax against
 * Non-Homestead rental property tax (reassessed at full market value from millage rate).
 */
export function calculateFloridaHomesteadTaxComparison({
  marketValue = 0,
  purchasePrice = 0,
  millageRate = null,
  county = 'Broward',
  config = FINANCING_CONFIG
} = {}) {
  const cfg = config?.floridaTax ? config : getMergedFinancingConfig(config);
  const resolvedMillage =
    Number(millageRate) > 0
      ? Number(millageRate)
      : getDefaultMillageForCounty(county, cfg);

  const homesteadBase = Math.max(0, Number(purchasePrice) || Number(marketValue) || 0);
  const reassessedBase = Math.max(0, Number(marketValue) || Number(purchasePrice) || 0);

  const firstExemption = Math.min(
    homesteadBase,
    cfg.floridaTax?.homesteadFirstExemption ?? 25000
  );
  const secondExemption = Math.min(
    cfg.floridaTax?.homesteadSecondExemption ?? 25000,
    Math.max(0, homesteadBase - 50000)
  );
  const nonSchoolShare = cfg.floridaTax?.nonSchoolMillageShare ?? 0.65;
  const schoolShare = Math.max(0, 1 - nonSchoolShare);

  const taxableSchool = Math.max(0, homesteadBase - firstExemption);
  const taxableNonSchool = Math.max(0, homesteadBase - firstExemption - secondExemption);

  const homesteadTaxYr = Math.round(
    (taxableSchool * (resolvedMillage * schoolShare) +
      taxableNonSchool * (resolvedMillage * nonSchoolShare)) /
      1000
  );
  const nonHomesteadTaxYr = Math.round((reassessedBase * resolvedMillage) / 1000);

  return {
    millageRate: resolvedMillage,
    homesteadAssessedValue: homesteadBase,
    reassessedMarketValue: reassessedBase,
    homesteadTaxYr,
    homesteadTaxMo: homesteadTaxYr / 12,
    nonHomesteadTaxYr,
    nonHomesteadTaxMo: nonHomesteadTaxYr / 12,
    annualDiff: nonHomesteadTaxYr - homesteadTaxYr,
    monthlyDiff: (nonHomesteadTaxYr - homesteadTaxYr) / 12
  };
}

/**
 * Underwrite the 4-phase "Live-in plan (FHA)" strategy:
 *   01 Buy -> 02 Live -> 03 Improve -> 04 Exit (A: Rent, B: Sell 1yr vs 2yr, C: Keep & buy next)
 *   + Net Worth wealth trajectory at Years 3, 5, and 10.
 */
export function underwriteLiveInPlan(inputs = {}, rawConfig = FINANCING_CONFIG) {
  const cfg = rawConfig?.fha ? rawConfig : getMergedFinancingConfig(rawConfig);

  const purchasePrice = Math.max(0, Number(inputs.purchasePrice) || 0);
  if (purchasePrice <= 0) {
    return {
      isComplete: false,
      hint: 'Enter a purchase price to model your Live-in plan (FHA).',
      verdict: null
    };
  }

  const county = inputs.county || 'Broward';
  const units = Math.min(4, Math.max(1, Math.round(Number(inputs.units) || 1)));
  const creditScoreBand = normalizeCreditBand(inputs.creditScoreBand || '740-759');
  const bandMeta =
    CREDIT_SCORE_BANDS.find((b) => b.id === creditScoreBand) || CREDIT_SCORE_BANDS[1];

  const requiredMinDownPct =
    bandMeta.minScore < (cfg.fha.minCreditScoreFor35Down || 580)
      ? cfg.fha.lowCreditDownPct
      : cfg.fha.minDownPct;

  const requestedDownPct =
    inputs.downPaymentPct != null && inputs.downPaymentPct !== ''
      ? Number(inputs.downPaymentPct)
      : requiredMinDownPct;
  const downPaymentPct = Math.max(requiredMinDownPct, Math.min(90, Number.isFinite(requestedDownPct) ? requestedDownPct : requiredMinDownPct));

  const interestRatePct =
    inputs.interestRatePct != null && inputs.interestRatePct !== ''
      ? Math.max(0, Number(inputs.interestRatePct))
      : cfg.defaults.fhaInterestRatePct;

  const closingCostsPct =
    inputs.closingCostsPct != null && inputs.closingCostsPct !== ''
      ? Math.max(0, Number(inputs.closingCostsPct))
      : cfg.defaults.closingCostsPct;

  const sellerCreditsRaw = Math.max(0, Number(inputs.sellerCredits) || 0);
  const rehabBudget = Math.max(0, Number(inputs.rehabBudget) || 0);
  const rehabPaidBy = ['cash', 'limited_203k', 'standard_203k'].includes(inputs.rehabPaidBy)
    ? inputs.rehabPaidBy
    : 'cash';
  const is203k = rehabPaidBy === 'limited_203k' || rehabPaidBy === 'standard_203k';

  const valueAfterRenoInput = Number(inputs.valueAfterReno);
  const valueAfterReno =
    Number.isFinite(valueAfterRenoInput) && valueAfterRenoInput > 0
      ? valueAfterRenoInput
      : rehabBudget > 0
      ? purchasePrice + rehabBudget
      : purchasePrice;

  const valuePctAbovePurchase =
    purchasePrice > 0 ? ((valueAfterReno - purchasePrice) / purchasePrice) * 100 : 0;
  const over15PctZeroRehabWarning =
    rehabBudget <= 0 && purchasePrice > 0 && valueAfterReno > purchasePrice * 1.15;

  const currentRentMo =
    inputs.currentRentMo != null && inputs.currentRentMo !== ''
      ? Math.max(0, Number(inputs.currentRentMo))
      : cfg.defaults.currentRentMo;

  const otherUnitsRentMo = units >= 2 ? Math.max(0, Number(inputs.otherUnitsRentMo) || 0) : 0;
  const liveInYears = Number(inputs.liveInYears) === 1 ? 1 : 2;

  const appreciationPctYr =
    inputs.appreciationPctYr != null && inputs.appreciationPctYr !== ''
      ? Number(inputs.appreciationPctYr)
      : cfg.defaults.appreciationPctYr;

  const rentGrowthPctYr =
    inputs.rentGrowthPctYr != null && inputs.rentGrowthPctYr !== ''
      ? Number(inputs.rentGrowthPctYr)
      : cfg.defaults.rentGrowthPctYr;

  const hasMarketRent =
    inputs.marketRentMo !== '' &&
    inputs.marketRentMo != null &&
    Number.isFinite(Number(inputs.marketRentMo)) &&
    Number(inputs.marketRentMo) > 0;
  const marketRentMo = hasMarketRent ? Math.max(0, Number(inputs.marketRentMo)) : 0;
  const vacancyPct =
    inputs.vacancyPct != null && inputs.vacancyPct !== ''
      ? Math.max(0, Number(inputs.vacancyPct))
      : cfg.defaults.vacancyPct;
  const repairsPct =
    inputs.repairsPct != null && inputs.repairsPct !== ''
      ? Math.max(0, Number(inputs.repairsPct))
      : cfg.defaults.repairsPct;
  const capexPct =
    inputs.capexPct != null && inputs.capexPct !== ''
      ? Math.max(0, Number(inputs.capexPct))
      : cfg.defaults.capexPct;
  const managementPct =
    inputs.managementPct != null && inputs.managementPct !== ''
      ? Math.max(0, Number(inputs.managementPct))
      : cfg.defaults.managementPct;

  const homeownerInsuranceYr =
    inputs.homeownerInsuranceYr != null && inputs.homeownerInsuranceYr !== ''
      ? Math.max(0, Number(inputs.homeownerInsuranceYr))
      : cfg.defaults.homeownerInsuranceYr;

  const landlordInsuranceYr =
    inputs.landlordInsuranceYr != null && inputs.landlordInsuranceYr !== ''
      ? Math.max(0, Number(inputs.landlordInsuranceYr))
      : cfg.defaults.landlordInsuranceYr;

  const floodInsuranceYr = Math.max(0, Number(inputs.floodInsuranceYr) || 0);
  const hoaMonthly = Math.max(0, Number(inputs.hoaMonthly) || 0);
  const mySavings =
    inputs.mySavings != null && inputs.mySavings !== '' ? Math.max(0, Number(inputs.mySavings)) : null;

  const millageRate =
    inputs.millageRate != null && Number(inputs.millageRate) > 0
      ? Number(inputs.millageRate)
      : getDefaultMillageForCounty(county, cfg);

  const taxComparison = calculateFloridaHomesteadTaxComparison({
    marketValue: valueAfterReno,
    purchasePrice,
    millageRate,
    county,
    config: cfg
  });

  const nonHomesteadTaxYr =
    inputs.propertyTaxNonHomesteadYr != null &&
    inputs.propertyTaxNonHomesteadYr !== '' &&
    inputs.propertyTaxNonHomesteadOverride === true
      ? Math.max(0, Number(inputs.propertyTaxNonHomesteadYr))
      : taxComparison.nonHomesteadTaxYr;

  const filingStatus = inputs.filingStatus === 'married' ? 'married' : 'single';
  const useConvRefi = Boolean(inputs.useConvRefi);
  const convRefiRatePct =
    inputs.convRefiRatePct != null && Number(inputs.convRefiRatePct) > 0
      ? Number(inputs.convRefiRatePct)
      : cfg.defaults.convRefiRatePct;

  // --------------------------------------------------------------------------
  // PHASE 01: BUY
  // --------------------------------------------------------------------------
  const fhaLimitInfo = getFhaLimitForProperty(county, units, cfg);
  const fhaAcquisitionBasis = is203k ? purchasePrice + rehabBudget : purchasePrice;
  const downPayment = Math.round(fhaAcquisitionBasis * (downPaymentPct / 100));
  const baseLoan = Math.max(0, Math.round(fhaAcquisitionBasis - downPayment));
  const ufmipPct = cfg.fha.ufmipPct;
  const ufmipAmount = cfg.fha.ufmipFinanced ? Math.round(baseLoan * (ufmipPct / 100)) : 0;
  const totalLoanAmount = baseLoan + ufmipAmount;

  const annualMipPct =
    baseLoan > cfg.fha.highBalanceBaseLoanThreshold
      ? cfg.fha.annualMipHighBalancePct
      : cfg.fha.annualMipPct;
  const mipForLife = downPaymentPct < cfg.fha.mipForLifeBelowDownPct;
  const mipDurationYears = mipForLife ? null : cfg.fha.mipYearsAt10PctOrMoreDown;

  const closingCosts = Math.round(purchasePrice * (closingCostsPct / 100));
  const maxSellerCreditsAllowed = Math.round(
    purchasePrice * ((cfg.fha.maxSellerConcessionPct || 6) / 100)
  );
  const effectiveSellerCredits = Math.min(closingCosts, maxSellerCreditsAllowed, sellerCreditsRaw);
  const sellerCreditsCapped = sellerCreditsRaw > effectiveSellerCredits;

  const cashToCloseAtTable = downPayment + Math.max(0, closingCosts - effectiveSellerCredits);
  const cashRehabOutOfPocket = is203k ? 0 : rehabBudget;
  const totalOutOfPocketCash = cashToCloseAtTable + cashRehabOutOfPocket;

  const overFhaLimit = baseLoan > fhaLimitInfo.limit;
  const overFhaLimitBy = Math.max(0, baseLoan - fhaLimitInfo.limit);
  const limited203kExceeded =
    rehabPaidBy === 'limited_203k' && rehabBudget > cfg.fha.limited203kMaxRehab;

  const savingsDelta = mySavings != null ? mySavings - totalOutOfPocketCash : null;

  const phase01Buy = {
    purchasePrice,
    fhaAcquisitionBasis,
    downPaymentPct,
    requiredMinDownPct,
    downPayment,
    baseLoan,
    ufmipPct,
    ufmipAmount,
    totalLoanAmount,
    annualMipPct,
    mipForLife,
    mipDurationYears,
    closingCostsPct,
    closingCosts,
    sellerCreditsRequested: sellerCreditsRaw,
    effectiveSellerCredits,
    maxSellerCreditsAllowed,
    sellerCreditsCapped,
    cashToCloseAtTable,
    cashRehabOutOfPocket,
    totalOutOfPocketCash,
    mySavings,
    savingsDelta,
    fhaLimitInfo,
    overFhaLimit,
    overFhaLimitBy,
    limited203kExceeded,
    occupancyMoveInDays: cfg.fha.occupancyMoveInDays,
    occupancyMinYears: cfg.fha.occupancyMinYears
  };

  // --------------------------------------------------------------------------
  // PHASE 02: LIVE (1 or 2 years as Primary Residence)
  // --------------------------------------------------------------------------
  const loanTermYears = cfg.fha.loanTermYears || 30;
  const monthlyPi = calculateMortgagePayment(totalLoanAmount, interestRatePct / 100, loanTermYears);
  const monthlyMip = (baseLoan * (annualMipPct / 100)) / 12;
  const homesteadTaxMo = taxComparison.homesteadTaxMo;
  const liveInInsuranceMo = (homeownerInsuranceYr + floodInsuranceYr) / 12;
  const grossMonthlyHousing =
    monthlyPi + monthlyMip + homesteadTaxMo + liveInInsuranceMo + hoaMonthly;

  const otherUnitCreditFactor = cfg.fha.otherUnitRentCreditFactor ?? 0.75;
  const creditedOtherUnitsRentMo = units >= 2 ? otherUnitsRentMo * otherUnitCreditFactor : 0;
  const netLiveInMonthlyCost = grossMonthlyHousing - creditedOtherUnitsRentMo;
  const vsCurrentRentMo = netLiveInMonthlyCost - currentRentMo;

  let rentComparisonLabel = 'Matches your current rent';
  if (Math.abs(vsCurrentRentMo) >= 1) {
    rentComparisonLabel =
      vsCurrentRentMo > 0
        ? `Costs ${formatCurrency(vsCurrentRentMo)}/mo more than renting`
        : `Costs ${formatCurrency(Math.abs(vsCurrentRentMo))}/mo less than renting`;
  }

  const monthsLived = liveInYears * 12;
  const loanBalanceAfterLiveIn = calculateRemainingLoanBalance(
    totalLoanAmount,
    interestRatePct / 100,
    loanTermYears,
    monthsLived
  );
  const principalPaidDown = Math.max(0, totalLoanAmount - loanBalanceAfterLiveIn);

  const valueAtEndOfLiveIn =
    valueAfterReno * Math.pow(1 + appreciationPctYr / 100, liveInYears);
  const appreciationWhileLiving = valueAtEndOfLiveIn - valueAfterReno;
  const equityBuiltWhileLiving = principalPaidDown + appreciationWhileLiving;

  const phase02Live = {
    liveInYears,
    monthlyPi,
    monthlyMip,
    homesteadTaxMo,
    liveInInsuranceMo,
    hoaMonthly,
    grossMonthlyHousing,
    units,
    otherUnitsRentMo,
    otherUnitCreditFactor,
    creditedOtherUnitsRentMo,
    netLiveInMonthlyCost,
    currentRentMo,
    vsCurrentRentMo,
    rentComparisonLabel,
    loanBalanceAfterLiveIn,
    principalPaidDown,
    valueAtEndOfLiveIn,
    appreciationWhileLiving,
    equityBuiltWhileLiving
  };

  // --------------------------------------------------------------------------
  // PHASE 03: IMPROVE
  // --------------------------------------------------------------------------
  const valueAdded = valueAfterReno - purchasePrice;
  const netForcedEquity = valueAdded - rehabBudget;
  const equityAfterRenoDay1 = valueAfterReno - totalLoanAmount;
  const equityPctAfterRenoDay1 = valueAfterReno > 0 ? equityAfterRenoDay1 / valueAfterReno : 0;
  const equityAtExit = valueAtEndOfLiveIn - loanBalanceAfterLiveIn;
  const equityPctAtExit = valueAtEndOfLiveIn > 0 ? equityAtExit / valueAtEndOfLiveIn : 0;

  const phase03Improve = {
    rehabBudget,
    rehabPaidBy,
    is203k,
    financedRehabAmount: is203k ? Math.round(rehabBudget * (1 - downPaymentPct / 100)) : 0,
    cashRehabAmount: is203k ? Math.round(rehabBudget * (downPaymentPct / 100)) : rehabBudget,
    valueAfterReno,
    valuePctAbovePurchase,
    over15PctZeroRehabWarning,
    valueAdded,
    netForcedEquity,
    equityAfterRenoDay1,
    equityPctAfterRenoDay1,
    equityAtExit,
    equityPctAtExit
  };

  // --------------------------------------------------------------------------
  // PHASE 04: EXIT SCENARIOS (A: Rent, B: Sell 1yr vs 2yr, C: Keep & buy next)
  // --------------------------------------------------------------------------

  // --- Scenario A: Rent after live-in period ---
  const exitGrossRentMo = marketRentMo * Math.pow(1 + rentGrowthPctYr / 100, liveInYears);
  const exitGrossRentYr = exitGrossRentMo * 12;
  const vacancyLossYr = exitGrossRentYr * (vacancyPct / 100);
  const effectiveGrossIncomeYr = exitGrossRentYr - vacancyLossYr;
  const repairsYr = exitGrossRentYr * (repairsPct / 100);
  const capexYr = exitGrossRentYr * (capexPct / 100);
  const managementYr = exitGrossRentYr * (managementPct / 100);

  // Reassessed non-homestead tax at exit (or manual override)
  const exitReassessedTaxYr = inputs.propertyTaxNonHomesteadOverride
    ? nonHomesteadTaxYr
    : Math.round((valueAtEndOfLiveIn * millageRate) / 1000);

  const rentalOperatingExpensesExVacancyYr =
    repairsYr +
    capexYr +
    managementYr +
    exitReassessedTaxYr +
    landlordInsuranceYr +
    floodInsuranceYr +
    hoaMonthly * 12;

  const rentalNoiYr = effectiveGrossIncomeYr - rentalOperatingExpensesExVacancyYr;

  // Keep FHA loan path
  const fhaDebtServiceMo = monthlyPi + monthlyMip;
  const fhaDebtServiceYr = fhaDebtServiceMo * 12;
  const fhaMonthlyCashFlow = (rentalNoiYr - fhaDebtServiceYr) / 12;
  const fhaCashOnCash =
    totalOutOfPocketCash > 0 ? (rentalNoiYr - fhaDebtServiceYr) / totalOutOfPocketCash : null;
  const fhaDscr = fhaDebtServiceYr > 0 ? rentalNoiYr / fhaDebtServiceYr : null;

  // Optional Conventional Refinance at >=20% equity (80% max LTV, drops MIP)
  const convMinEquityDec = (cfg.defaults.convRefiMinEquityPct || 20) / 100;
  const convMaxLtvDec = (cfg.defaults.convRefiMaxLtvPct || 80) / 100;
  const convRefiEligible = equityPctAtExit >= convMinEquityDec;
  const equityNeededForRefi = Math.max(
    0,
    loanBalanceAfterLiveIn / (1 - convMinEquityDec) - valueAtEndOfLiveIn
  );

  const convMaxLoan = Math.round(valueAtEndOfLiveIn * convMaxLtvDec);
  const convRefiClosingCosts = Math.round(
    convMaxLoan * ((cfg.defaults.convRefiClosingCostsPct || 2) / 100)
  );
  // If 80% LTV exceeds payoff + refi costs, borrower receives cash out; otherwise rate/term at payoff + costs (capped at 80% LTV)
  const convLoanAmount = convRefiEligible
    ? Math.max(Math.round(loanBalanceAfterLiveIn + convRefiClosingCosts), convMaxLoan)
    : convMaxLoan;
  const convCashOut = convRefiEligible
    ? Math.max(0, Math.round(convMaxLoan - loanBalanceAfterLiveIn - convRefiClosingCosts))
    : 0;
  const convActualLoan = convRefiEligible ? convMaxLoan : Math.round(loanBalanceAfterLiveIn);
  const convNewPiMo = calculateMortgagePayment(
    convActualLoan,
    convRefiRatePct / 100,
    loanTermYears
  );
  const convDebtServiceYr = convNewPiMo * 12;
  const convMonthlyCashFlow = (rentalNoiYr - convDebtServiceYr) / 12;
  const netCashLeftAfterRefi = Math.max(0, totalOutOfPocketCash - convCashOut);
  const convCashOnCash =
    netCashLeftAfterRefi > 0 ? (rentalNoiYr - convDebtServiceYr) / netCashLeftAfterRefi : null;
  const convIsInfiniteCoC = convRefiEligible && netCashLeftAfterRefi === 0 && convMonthlyCashFlow >= 0;
  const convDscr = convDebtServiceYr > 0 ? rentalNoiYr / convDebtServiceYr : null;

  const activeRefiApplied = useConvRefi && convRefiEligible;

  const exitARent = {
    hasMarketRent,
    marketRentTodayMo: hasMarketRent ? marketRentMo : null,
    exitGrossRentMo: hasMarketRent ? exitGrossRentMo : null,
    exitReassessedTaxYr,
    rentalNoiYr: hasMarketRent ? rentalNoiYr : null,
    activeMode: activeRefiApplied ? 'conv_refi' : 'keep_fha',
    monthlyCashFlow: hasMarketRent
      ? activeRefiApplied
        ? convMonthlyCashFlow
        : fhaMonthlyCashFlow
      : null,
    cashOnCash: hasMarketRent ? (activeRefiApplied ? convCashOnCash : fhaCashOnCash) : null,
    isInfiniteCoC: hasMarketRent ? (activeRefiApplied ? convIsInfiniteCoC : false) : false,
    dscr: hasMarketRent ? (activeRefiApplied ? convDscr : fhaDscr) : null,
    fhaPath: {
      monthlyDebtService: fhaDebtServiceMo,
      monthlyCashFlow: hasMarketRent ? fhaMonthlyCashFlow : null,
      cashOnCash: hasMarketRent ? fhaCashOnCash : null,
      dscr: hasMarketRent ? fhaDscr : null
    },
    convRefi: {
      eligible: convRefiEligible,
      applied: activeRefiApplied,
      equityPctAtExit,
      equityNeededForRefi,
      ratePct: convRefiRatePct,
      newLoanAmount: convActualLoan,
      refiClosingCosts: convRefiClosingCosts,
      newMonthlyPaymentPi: convNewPiMo,
      monthlyMipDropped: monthlyMip,
      cashOut: convCashOut,
      monthlyCashFlow: hasMarketRent ? convMonthlyCashFlow : null,
      cashOnCash: hasMarketRent ? convCashOnCash : null,
      isInfiniteCoC: hasMarketRent ? convIsInfiniteCoC : false,
      dscr: hasMarketRent ? convDscr : null
    }
  };

  // --- Scenario B: Sell after 1 yr vs. after 2 yrs ---
  const sellingCostsPct = cfg.defaults.sellingCostsPct || 7.5;
  const adjustedBasis =
    purchasePrice + rehabBudget + Math.max(0, closingCosts - effectiveSellerCredits);
  const exclusionLimit =
    filingStatus === 'married'
      ? cfg.section121.marriedMaxExclusion
      : cfg.section121.singleMaxExclusion;

  const buildSellYear = (yr) => {
    const salePrice = Math.round(valueAfterReno * Math.pow(1 + appreciationPctYr / 100, yr));
    const sellingCosts = Math.round(salePrice * (sellingCostsPct / 100));
    const loanPayoff = Math.round(
      calculateRemainingLoanBalance(totalLoanAmount, interestRatePct / 100, loanTermYears, yr * 12)
    );
    const netProceeds = salePrice - sellingCosts - loanPayoff;
    const profitBeforeTax = netProceeds - totalOutOfPocketCash;
    const capitalGain = Math.max(0, salePrice - sellingCosts - adjustedBasis);
    const qualifiesSection121 = yr >= cfg.section121.minYearsLived;
    const excludedGain = qualifiesSection121 ? Math.min(capitalGain, exclusionLimit) : 0;
    const taxableGain = Math.max(0, capitalGain - excludedGain);
    const estimatedCapGainsTax = Math.round(
      taxableGain * ((cfg.section121.illustrativeCapitalGainsTaxRatePct || 15) / 100)
    );
    const profitAfterEstTax = profitBeforeTax - estimatedCapGainsTax;

    return {
      years: yr,
      salePrice,
      sellingCostsPct,
      sellingCosts,
      loanPayoff,
      netProceeds,
      capitalGain,
      qualifiesSection121,
      exclusionLimit,
      excludedGain,
      taxableGain,
      estimatedCapGainsTax,
      profitBeforeTax,
      profitAfterEstTax
    };
  };

  const exitBSell = {
    year1: buildSellYear(1),
    year2: buildSellYear(2),
    filingStatus,
    singleMaxExclusion: cfg.section121.singleMaxExclusion,
    marriedMaxExclusion: cfg.section121.marriedMaxExclusion,
    taxDisclaimer: cfg.taxDisclaimer || 'estimate — confirm with a CPA'
  };

  // --- Scenario C: Keep & buy next ---
  const remainingSavingsAfterClose =
    mySavings != null ? Math.max(0, mySavings - totalOutOfPocketCash) : 0;
  const monthlySavingsVsRent = Math.max(0, currentRentMo - netLiveInMonthlyCost);
  const savingsAccumulatedWhileLiving = Math.round(monthlySavingsVsRent * monthsLived);
  const tappableEquityCashOut = convRefiEligible ? convCashOut : 0;
  const deployableCapitalForNext =
    remainingSavingsAfterClose + savingsAccumulatedWhileLiving + tappableEquityCashOut;

  const nextPurchaseCashPct =
    (cfg.defaults.nextPropertyDownPct || 20) + (cfg.defaults.nextPropertyClosingPct || 3);
  const estimatedNextPurchasingPower =
    nextPurchaseCashPct > 0
      ? Math.floor(deployableCapitalForNext / (nextPurchaseCashPct / 100))
      : 0;

  const exitCKeepAndBuyNext = {
    property1EquityAtExit: Math.round(equityAtExit),
    remainingSavingsAfterClose,
    savingsAccumulatedWhileLiving,
    tappableEquityCashOut,
    deployableCapitalForNext,
    nextPropertyDownPct: cfg.defaults.nextPropertyDownPct || 20,
    nextPropertyClosingPct: cfg.defaults.nextPropertyClosingPct || 3,
    estimatedNextPurchasingPower,
    oneFhaRuleNote:
      'One FHA loan at a time in most cases — Property #2 typically uses a Conventional (5% primary or 20–25% investment) or DSCR loan.'
  };

  // --------------------------------------------------------------------------
  // WEALTH CHART: Net Worth Created from this Strategy at Years 3, 5, and 10
  // --------------------------------------------------------------------------
  const horizons = [3, 5, 10];
  const selectedSellExit = liveInYears >= 2 ? exitBSell.year2 : exitBSell.year1;
  const netProceedsAfterTaxAtSell = selectedSellExit.netProceeds - selectedSellExit.estimatedCapGainsTax;

  const computeScenarioANetWorthAtYear = (horizonYr, forceConvRefi = activeRefiApplied) => {
    const valAtH = valueAfterReno * Math.pow(1 + appreciationPctYr / 100, horizonYr);
    let loanBalAtH = 0;
    if (forceConvRefi && convRefiEligible) {
      loanBalAtH = calculateRemainingLoanBalance(
        convActualLoan,
        convRefiRatePct / 100,
        loanTermYears,
        (horizonYr - liveInYears) * 12
      );
    } else {
      loanBalAtH = calculateRemainingLoanBalance(
        totalLoanAmount,
        interestRatePct / 100,
        loanTermYears,
        horizonYr * 12
      );
    }
    const equityAtH = valAtH - loanBalAtH;

    // Accumulate annual rental cash flows from year `liveInYears` to `horizonYr`
    let cumulativeRentalCf = forceConvRefi && convRefiEligible ? convCashOut : 0;
    for (let y = liveInYears; y < horizonYr; y++) {
      const yrsIntoRental = y - liveInYears;
      const grossY = exitGrossRentYr * Math.pow(1 + rentGrowthPctYr / 100, yrsIntoRental);
      const egiY = grossY * (1 - vacancyPct / 100);
      const varExpY = grossY * ((repairsPct + capexPct + managementPct) / 100);
      // Non-homestead FL assessment grows up to 10%/yr cap
      const taxGrowthRate = Math.min(0.10, Math.max(0, appreciationPctYr / 100));
      const fixedExpY =
        exitReassessedTaxYr * Math.pow(1 + taxGrowthRate, yrsIntoRental) +
        (landlordInsuranceYr + floodInsuranceYr + hoaMonthly * 12) * Math.pow(1.025, yrsIntoRental);
      const noiY = egiY - varExpY - fixedExpY;
      const debtY =
        forceConvRefi && convRefiEligible ? convDebtServiceYr : fhaDebtServiceYr;
      cumulativeRentalCf += noiY - debtY;
    }

    return Math.round(equityAtH + cumulativeRentalCf - totalOutOfPocketCash);
  };

  const computeScenarioBNetWorthAtYear = (horizonYr) => {
    // Sold at end of liveInYears; after-tax cash proceeds compound conservatively at 4%/yr (cash/treasuries)
    const yearsAfterSale = Math.max(0, horizonYr - liveInYears);
    const grownProceeds = netProceedsAfterTaxAtSell * Math.pow(1.04, yearsAfterSale);
    return Math.round(grownProceeds - totalOutOfPocketCash);
  };

  const computeScenarioCNetWorthAtYear = (horizonYr) => {
    // Property #1 held (with conv refi if eligible) + accessible capital redeployed into Property #2
    const prop1NetWorth = computeScenarioANetWorthAtYear(horizonYr, convRefiEligible);
    const yearsSinceExit = Math.max(0, horizonYr - liveInYears);
    const prop2Price = estimatedNextPurchasingPower;
    if (prop2Price < 100000 || yearsSinceExit <= 0) {
      return prop1NetWorth;
    }
    const prop2DownAndClose = deployableCapitalForNext;
    const prop2Loan = Math.round(prop2Price * (1 - (cfg.defaults.nextPropertyDownPct || 20) / 100));
    const prop2ValAtH = prop2Price * Math.pow(1 + appreciationPctYr / 100, yearsSinceExit);
    const prop2BalAtH = calculateRemainingLoanBalance(
      prop2Loan,
      convRefiRatePct / 100,
      30,
      yearsSinceExit * 12
    );
    // Incremental net wealth created by redeploying capital into Property #2 (equity - capital deployed)
    const prop2IncrementalWealth = (prop2ValAtH - prop2BalAtH) - prop2DownAndClose;
    return Math.round(prop1NetWorth + Math.max(0, prop2IncrementalWealth));
  };

  const wealthSeries = horizons.map((year) => ({
    year,
    rentNetWorth: hasMarketRent ? computeScenarioANetWorthAtYear(year) : null,
    sellNetWorth: computeScenarioBNetWorthAtYear(year),
    keepAndBuyNextNetWorth: hasMarketRent ? computeScenarioCNetWorthAtYear(year) : null
  }));

  // Verdict summary for header / saved analyses
  const exitCfSign =
    hasMarketRent && exitARent.monthlyCashFlow >= 0 ? '+' : '';
  const verdict = hasMarketRent
    ? `${formatCurrency(netLiveInMonthlyCost)}/mo while living · ${exitCfSign}${formatCurrency(
        exitARent.monthlyCashFlow
      )}/mo exit cash flow`
    : `${formatCurrency(netLiveInMonthlyCost)}/mo while living · Exit cash flow: Add market rent`;

  return {
    isComplete: true,
    hint: null,
    verdict,
    hasMarketRent,
    over15PctZeroRehabWarning,
    valuePctAbovePurchase,
    disclaimer: cfg.disclaimer,
    asOfDisplay: cfg.asOfDisplay,
    taxComparison,
    buy: phase01Buy,
    live: phase02Live,
    improve: phase03Improve,
    exit: {
      rent: exitARent,
      sell: exitBSell,
      keepAndBuyNext: exitCKeepAndBuyNext
    },
    wealthSeries,
    // Compatibility fields for InvestorStudio Deal Snapshot Band
    cashToClose: {
      liquidCashNeeded: totalOutOfPocketCash
    },
    monthlyPayment: {
      totalPiti: grossMonthlyHousing
    },
    monthlyCashFlow: exitARent.monthlyCashFlow,
    dscr: exitARent.dscr,
    cashOnCash: exitARent.cashOnCash
  };
}

/**
 * Evaluate whether a saved property or county search result fits the "Live-in plan (FHA)" strategy.
 * Checks:
 *  1. Price under county + unit FHA limit (1–4 units eligible; 5+ units or land ineligible)
 *  2. Condo -> "check FHA condo approval"
 *  3. HOA -> "check rental restrictions (min lease term / no rentals first 1–2 yrs)"
 *  4. Flood zone -> insurance flag
 *  5. Condition C5–C6 -> "may need 203(k) to pass FHA appraisal"
 *  6. 2–4 units -> house-hack bonus
 */
export function evaluateLiveInFit(property = {}, rawConfig = FINANCING_CONFIG) {
  if (!property || typeof property !== 'object') {
    return {
      fits: false,
      status: 'ineligible',
      badgeLabel: 'No data',
      reasons: [],
      fhaLimitInfo: getFhaLimitForProperty('Broward', 1, FINANCING_CONFIG)
    };
  }

  const cfg = rawConfig?.fha ? rawConfig : getMergedFinancingConfig(rawConfig);
  const county = property.county || property.parcel_county || 'Broward';
  const useCodeStr = String(property.use_code || '').trim();
  const useNum = /^\d+$/.test(useCodeStr) ? parseInt(useCodeStr, 10) : null;
  const usePrefix = useCodeStr.slice(0, 2);
  const propType = String(property.property_type || '').toLowerCase();

  // Determine unit count
  let rawUnits = Number(property.units);
  if (!Number.isFinite(rawUnits) || rawUnits <= 0) {
    rawUnits = propType === 'multifamily_2_9' || useNum === 8 || usePrefix === '08' ? 2 : 1;
  }

  const isVacantLand =
    propType === 'land' ||
    (useCodeStr !== '' && (useNum === 0 || useNum === 10 || usePrefix === '00' || usePrefix === '10'));
  const isFivePlusUnits = rawUnits > 4 || useNum === 3 || usePrefix === '03';

  const clampedUnits = Math.min(4, Math.max(1, Math.round(rawUnits)));
  const fhaLimitInfo = getFhaLimitForProperty(county, clampedUnits, cfg);

  const price =
    Number(property.asking_price) ||
    Number(property.list_price) ||
    Number(property.just_value) ||
    Number(property.assessed_value) ||
    0;

  const reasons = [];
  let fits = true;

  if (isVacantLand) {
    fits = false;
    reasons.push({
      key: 'land',
      type: 'blocker',
      text: 'Vacant land — standard FHA live-in requires an existing habitable 1–4 unit home'
    });
  } else if (isFivePlusUnits) {
    fits = false;
    reasons.push({
      key: 'units_over_4',
      type: 'blocker',
      text: `${rawUnits >= 5 ? `${rawUnits} units` : '5+ units'} — FHA residential financing is capped at 1–4 units`
    });
  }

  // 1. Price vs FHA limit
  const verifySuffix = fhaLimitInfo.verify ? ' (verify limit)' : '';
  if (price > 0) {
    if (price <= fhaLimitInfo.limit) {
      reasons.push({
        key: 'fha_limit',
        type: 'pass',
        verify: fhaLimitInfo.verify,
        text: `Under ${fhaLimitInfo.countyKey} ${clampedUnits}-unit FHA limit (${formatCurrency(fhaLimitInfo.limit)})${verifySuffix}`
      });
    } else {
      fits = false;
      reasons.push({
        key: 'fha_limit_exceeded',
        type: 'blocker',
        verify: fhaLimitInfo.verify,
        text: `Price (${formatCurrency(price)}) exceeds ${fhaLimitInfo.countyKey} ${clampedUnits}-unit FHA limit (${formatCurrency(fhaLimitInfo.limit)})${verifySuffix}`
      });
    }
  } else {
    reasons.push({
      key: 'fha_limit_unknown_price',
      type: 'caution',
      verify: fhaLimitInfo.verify,
      text: `Confirm price is under ${fhaLimitInfo.countyKey} ${clampedUnits}-unit FHA limit (${formatCurrency(fhaLimitInfo.limit)})${verifySuffix}`
    });
  }

  // 2. 2–4 units bonus
  if (!isFivePlusUnits && rawUnits >= 2 && rawUnits <= 4) {
    reasons.push({
      key: 'multifamily_bonus',
      type: 'bonus',
      text: `${rawUnits} units — house-hack bonus (75% of other-unit rent can help offset payment)`
    });
  }

  // 3. Condo check
  const isCondo =
    propType === 'condo' ||
    useNum === 4 ||
    useNum === 5 ||
    usePrefix === '04' ||
    usePrefix === '05';
  if (isCondo) {
    reasons.push({
      key: 'condo_approval',
      type: 'caution',
      text: 'Condo — check FHA condo approval'
    });
  }

  // 4. HOA rental restrictions check
  const notesCombined = [
    property.condition_notes,
    property.notes,
    property.condition,
    Array.isArray(property.distress_flags) ? property.distress_flags.join(' ') : ''
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const hasHoa =
    property.has_hoa === true ||
    Number(property.hoa_monthly) > 0 ||
    propType === 'townhouse' ||
    propType === 'townhome' ||
    isCondo ||
    /\bhoa\b/.test(notesCombined);

  if (hasHoa && property.has_hoa !== false) {
    reasons.push({
      key: 'hoa_rental_restrictions',
      type: 'caution',
      text: 'HOA — check rental restrictions (min lease term / no rentals first 1–2 yrs)'
    });
  }

  // 5. Flood zone check
  const floodZoneRaw = String(property.flood_zone || '').trim().toUpperCase();
  const isHighRiskFlood =
    property.is_sfha === true ||
    property.flood_sfha === true ||
    (/^(A|V)/.test(floodZoneRaw) && !floodZoneRaw.startsWith('AREA'));

  if (isHighRiskFlood) {
    reasons.push({
      key: 'flood_zone',
      type: 'caution',
      text: `Flood zone${floodZoneRaw ? ` (${floodZoneRaw})` : ''} — mandatory flood insurance required`
    });
  }

  // 6. Condition C5–C6 check
  const isC5OrC6 =
    /\bc[56]\b/i.test(notesCombined) ||
    /\b(uninhabitable|major rehab|tear[- ]?down|needs 203k|structural|fire damage|roof leak)\b/i.test(
      notesCombined
    );

  if (isC5OrC6) {
    reasons.push({
      key: 'condition_203k',
      type: 'caution',
      text: 'Condition C5–C6 — may need 203(k) to pass FHA appraisal'
    });
  }

  const hasCautions = reasons.some((r) => r.type === 'caution');
  let badgeLabel = 'Live-in fit';
  if (!fits) {
    if (isVacantLand) badgeLabel = 'Land · Non-FHA';
    else if (isFivePlusUnits) badgeLabel = '5+ units · Non-FHA';
    else badgeLabel = 'Over FHA limit';
  }

  return {
    fits,
    status: !fits ? 'ineligible' : hasCautions ? 'caution' : 'good',
    badgeLabel,
    hasBonus: reasons.some((r) => r.type === 'bonus'),
    reasons,
    fhaLimitInfo
  };
}
