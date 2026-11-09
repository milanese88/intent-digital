/**
 * Real Estate Deal Underwriting Calculations
 * Pure JavaScript module: no React, no API dependencies.
 */

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
