/**
 * Real Estate Deal Underwriting Calculations
 * Pure JavaScript module: no React, no API dependencies.
 */

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
 * Underwrite a RENTAL deal.
 */
export function underwriteRental(inputs = {}) {
  const price = Number(inputs.purchasePrice) || 0;
  const downPct = inputs.downPaymentPct != null ? Number(inputs.downPaymentPct) : 0.25;
  const rate = inputs.interestRatePct != null ? Number(inputs.interestRatePct) : 0.07;
  const termYears = inputs.loanTermYears != null ? Number(inputs.loanTermYears) : 30;
  const closingPct = inputs.closingCostsPct != null ? Number(inputs.closingCostsPct) : 0.03;

  const rent = inputs.monthlyRent != null && inputs.monthlyRent !== '' ? Number(inputs.monthlyRent) : null;
  const vacancyPct = inputs.vacancyPct != null ? Number(inputs.vacancyPct) : 0.05;
  const maintenancePct = inputs.maintenancePct != null ? Number(inputs.maintenancePct) : 0.05;
  const capexPct = inputs.capexPct != null ? Number(inputs.capexPct) : 0.05;
  const mgmtPct = inputs.managementPct != null ? Number(inputs.managementPct) : 0.00;

  const taxesYr = inputs.propertyTaxesYr != null && inputs.propertyTaxesYr !== ''
    ? Number(inputs.propertyTaxesYr)
    : price * 0.02;
  const insuranceYr = inputs.insuranceYr != null && inputs.insuranceYr !== ''
    ? Number(inputs.insuranceYr)
    : null;
  const hoaMo = Number(inputs.hoaMo) || 0;

  // Loan & Debt
  const loan = price * (1 - downPct);
  const monthlyPI = calculateMortgagePayment(loan, rate, termYears);
  const debtYr = monthlyPI * 12;

  // Cash Needed
  const downPayment = price * downPct;
  const closingCosts = price * closingPct;
  const cashNeeded = downPayment + closingCosts;

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
  const operatingExpensesYr = taxesYr + (insuranceYr || 0) + (hoaMo * 12) + variableExpenses;

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
  const buyClosingPct = inputs.buyingClosingCostsPct != null ? Number(inputs.buyingClosingCostsPct) : 0.02;
  const holdingMonths = inputs.holdingMonths != null ? Number(inputs.holdingMonths) : 6;
  const holdingCostMo = Number(inputs.holdingCostMo) || 0;
  const sellingCostsPct = inputs.sellingCostsPct != null ? Number(inputs.sellingCostsPct) : 0.08;

  const buyClosingCosts = price * buyClosingPct;
  const totalHoldingCost = holdingCostMo * holdingMonths;
  const totalCost = price + rehab + buyClosingCosts + totalHoldingCost;

  if (arv == null || arv <= 0) {
    const hint = 'Add ARV to see flip profit';
    return {
      isComplete: false,
      hint,
      verdict: hint,
      totalCost,
      buyClosingCosts,
      totalHoldingCost,
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
    roi
  };
}

/**
 * Underwrite a BRRRR deal.
 */
export function underwriteBrrrr(inputs = {}) {
  const price = Number(inputs.purchasePrice) || 0;
  const rehab = Number(inputs.rehabBudget) || 0;
  const arv = inputs.arv != null && inputs.arv !== '' ? Number(inputs.arv) : null;
  const buyClosingPct = inputs.buyingClosingCostsPct != null ? Number(inputs.buyingClosingCostsPct) : 0.02;

  const refiLtvPct = inputs.refiLtvPct != null ? Number(inputs.refiLtvPct) : 0.75;
  const refiRatePct = inputs.refiRatePct != null ? Number(inputs.refiRatePct) : 0.07;
  const refiTermYears = inputs.refiTermYears != null ? Number(inputs.refiTermYears) : 30;
  const refiClosingPct = inputs.refiClosingPct != null ? Number(inputs.refiClosingPct) : 0.02;

  // Rental inputs
  const rent = inputs.monthlyRent != null && inputs.monthlyRent !== '' ? Number(inputs.monthlyRent) : null;
  const vacancyPct = inputs.vacancyPct != null ? Number(inputs.vacancyPct) : 0.05;
  const maintenancePct = inputs.maintenancePct != null ? Number(inputs.maintenancePct) : 0.05;
  const capexPct = inputs.capexPct != null ? Number(inputs.capexPct) : 0.05;
  const mgmtPct = inputs.managementPct != null ? Number(inputs.managementPct) : 0.00;

  const taxesYr = inputs.propertyTaxesYr != null && inputs.propertyTaxesYr !== ''
    ? Number(inputs.propertyTaxesYr)
    : price * 0.02;
  const insuranceYr = inputs.insuranceYr != null && inputs.insuranceYr !== ''
    ? Number(inputs.insuranceYr)
    : null;
  const hoaMo = Number(inputs.hoaMo) || 0;

  const buyClosingCosts = price * buyClosingPct;

  if (arv == null || arv <= 0) {
    const hint = 'Add ARV to see refinance numbers';
    return {
      isComplete: false,
      hint,
      verdict: hint,
      refiLoan: null,
      allInCost: null,
      cashLeftInDeal: null,
      postRefiMonthlyCashFlow: null,
      cashOnCash: null,
      isInfiniteCoC: false
    };
  }

  const refiLoan = arv * refiLtvPct;
  const refiClosingCosts = refiLoan * refiClosingPct;
  const allInCost = price + rehab + buyClosingCosts + refiClosingCosts;
  const cashLeftInDeal = allInCost - refiLoan;

  // Post-refi debt service
  const refiMonthlyPI = calculateMortgagePayment(refiLoan, refiRatePct, refiTermYears);
  const refiDebtYr = refiMonthlyPI * 12;

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
      refiLoan,
      allInCost,
      cashLeftInDeal,
      postRefiMonthlyCashFlow: null,
      cashOnCash: null,
      isInfiniteCoC: false
    };
  }

  // Operating calculations post-refi
  const rentAnnual = rent * 12;
  const effectiveIncomeYr = rentAnnual * (1 - vacancyPct);
  const variableExpenses = rentAnnual * (maintenancePct + capexPct + mgmtPct);
  const operatingExpensesYr = taxesYr + insuranceYr + (hoaMo * 12) + variableExpenses;

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
    refiLoan,
    allInCost,
    cashLeftInDeal,
    postRefiMonthlyCashFlow,
    cashOnCash,
    isInfiniteCoC,
    noi,
    operatingExpensesYr,
    refiDebtYr
  };
}
