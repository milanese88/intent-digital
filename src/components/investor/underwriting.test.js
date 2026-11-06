import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMortgagePayment,
  formatCurrency,
  formatPercent,
  formatRatio,
  underwriteRental,
  underwriteFlip,
  underwriteBrrrr
} from './underwriting.js';

test('calculateMortgagePayment: standard 30yr mortgage', () => {
  // $374,250 loan at 7% for 30 years
  const pi = calculateMortgagePayment(374250, 0.07, 30);
  assert.ok(Math.abs(pi - 2489.89) < 0.05, `Expected ~$2,489.89, got ${pi}`);
});

test('calculateMortgagePayment: 0% interest rate', () => {
  // $120,000 loan at 0% for 10 years (120 months) => $1,000/mo
  const pi = calculateMortgagePayment(120000, 0, 10);
  assert.strictEqual(pi, 1000);
});

test('calculateMortgagePayment: 0 loan or 0 term', () => {
  assert.strictEqual(calculateMortgagePayment(0, 0.07, 30), 0);
  assert.strictEqual(calculateMortgagePayment(100000, 0.07, 0), 0);
});

test('formatting helpers', () => {
  assert.strictEqual(formatCurrency(1250), '$1,250');
  assert.strictEqual(formatCurrency(-931.56), '-$932');
  assert.strictEqual(formatCurrency(0), '$0');
  assert.strictEqual(formatCurrency(null), '—');

  assert.strictEqual(formatPercent(0.07), '7.0%');
  assert.strictEqual(formatPercent(-0.08), '-8.0%');
  assert.strictEqual(formatPercent(0.03747), '3.7%');
  assert.strictEqual(formatPercent(null), '—');

  assert.strictEqual(formatRatio(1.254), '1.25');
  assert.strictEqual(formatRatio(null), '—');
});

test('underwriteRental: User Sanity Check Example', () => {
  // Price $499,000, 25% down, 7%, 30 yrs, rent $3,400, insurance $6,000/yr, other defaults
  const res = underwriteRental({
    purchasePrice: 499000,
    downPaymentPct: 0.25,
    interestRatePct: 0.07,
    loanTermYears: 30,
    closingCostsPct: 0.03,
    monthlyRent: 3400,
    vacancyPct: 0.05,
    maintenancePct: 0.05,
    capexPct: 0.05,
    managementPct: 0.00,
    propertyTaxesYr: 499000 * 0.02, // 9,980
    insuranceYr: 6000,
    hoaMo: 0
  });

  assert.strictEqual(res.isComplete, true);
  // Loan = $374,250
  assert.strictEqual(res.loan, 374250);
  // Cash needed = $124,750 down + $14,970 closing = $139,720
  assert.strictEqual(res.cashNeeded, 139720);
  // Effective income/yr = 3,400 * 12 * 0.95 = 38,760
  assert.strictEqual(res.effectiveIncomeYr, 38760);
  // Expenses = 9,980 (taxes) + 6,000 (ins) + 40,800 * 0.10 (4,080) = 20,060
  assert.strictEqual(res.operatingExpensesYr, 20060);
  // NOI = 38,760 - 20,060 = 18,700
  assert.strictEqual(res.noi, 18700);
  // Cap rate = 18,700 / 499,000 = 3.747...% => 3.7%
  assert.ok(Math.abs(res.capRate - 0.03747) < 0.0001);
  assert.strictEqual(formatPercent(res.capRate), '3.7%');
  // Monthly cash flow = (18,700 - 29,878.74) / 12 = -931.56 => -$932
  assert.ok(Math.abs(res.monthlyCashFlow - (-931.56)) < 0.1);
  assert.strictEqual(formatCurrency(res.monthlyCashFlow), '-$932');
  // Verdict
  assert.strictEqual(res.verdict, "Doesn't cash flow at this price.");
});

test('underwriteRental: Strong rental verdict and missing inputs', () => {
  // Incomplete
  const missingRent = underwriteRental({ purchasePrice: 400000, insuranceYr: 3000 });
  assert.strictEqual(missingRent.isComplete, false);
  assert.strictEqual(missingRent.hint, 'Add rent to see cash flow');

  // Strong rental: high rent, low price
  const strong = underwriteRental({
    purchasePrice: 200000,
    monthlyRent: 2500,
    insuranceYr: 2000,
    downPaymentPct: 0.25,
    interestRatePct: 0.07,
    loanTermYears: 30
  });
  assert.strictEqual(strong.isComplete, true);
  assert.ok(strong.monthlyCashFlow > 0);
  assert.ok(strong.cashOnCash >= 0.08);
  assert.strictEqual(strong.verdict, 'Strong rental at this price.');
});

test('underwriteFlip: 70% rule, profit, and loss', () => {
  // ARV $500,000, Rehab $50,000 -> Max offer = 500,000 * 0.70 - 50,000 = $300,000
  const meets70 = underwriteFlip({
    purchasePrice: 280000,
    rehabBudget: 50000,
    arv: 500000,
    buyingClosingCostsPct: 0.02,
    holdingMonths: 6,
    holdingCostMo: 1000,
    sellingCostsPct: 0.08
  });
  assert.strictEqual(meets70.isComplete, true);
  assert.strictEqual(meets70.maxOffer, 300000);
  assert.ok(meets70.projectedProfit > 0);
  assert.strictEqual(meets70.verdict, 'Meets the 70% rule.');

  // Thinner than 70% rule: price $320,000
  const thin = underwriteFlip({
    purchasePrice: 320000,
    rehabBudget: 50000,
    arv: 500000,
    buyingClosingCostsPct: 0.02,
    holdingMonths: 6,
    holdingCostMo: 1000,
    sellingCostsPct: 0.08
  });
  assert.strictEqual(thin.isComplete, true);
  assert.ok(thin.projectedProfit > 0);
  assert.strictEqual(thin.verdict, 'Profitable, but thinner than the 70% rule.');

  // Loses money
  const loses = underwriteFlip({
    purchasePrice: 450000,
    rehabBudget: 50000,
    arv: 500000,
    buyingClosingCostsPct: 0.02,
    holdingMonths: 6,
    holdingCostMo: 1000,
    sellingCostsPct: 0.08
  });
  assert.ok(loses.projectedProfit < 0);
  assert.strictEqual(loses.verdict, 'Loses money at this price.');
});

test('underwriteBrrrr: cash left and cash back out', () => {
  // Price $200k, Rehab $50k, ARV $350k, Refi LTV 75% ($262,500)
  // Buy closing 2% ($4,000), Refi closing 2% of new loan ($5,250)
  // All in = 200,000 + 50,000 + 4,000 + 5,250 = $259,250
  // Cash left in deal = 259,250 - 262,500 = -$3,250 (cash back out!)
  const cashOut = underwriteBrrrr({
    purchasePrice: 200000,
    rehabBudget: 50000,
    arv: 350000,
    buyingClosingCostsPct: 0.02,
    refiLtvPct: 0.75,
    refiRatePct: 0.07,
    refiTermYears: 30,
    refiClosingPct: 0.02,
    monthlyRent: 2800,
    insuranceYr: 3000
  });

  assert.strictEqual(cashOut.isComplete, true);
  assert.strictEqual(cashOut.refiLoan, 262500);
  assert.strictEqual(cashOut.allInCost, 259250);
  assert.strictEqual(cashOut.cashLeftInDeal, -3250);
  assert.strictEqual(cashOut.isInfiniteCoC, true);
  assert.strictEqual(cashOut.verdict, 'Most of your cash comes back out.');

  // Deal leaving substantial cash
  const leavesCash = underwriteBrrrr({
    purchasePrice: 300000,
    rehabBudget: 50000,
    arv: 350000,
    buyingClosingCostsPct: 0.02,
    refiLtvPct: 0.75,
    refiRatePct: 0.07,
    refiTermYears: 30,
    refiClosingPct: 0.02,
    monthlyRent: 2500,
    insuranceYr: 3000
  });
  assert.strictEqual(leavesCash.isComplete, true);
  assert.ok(leavesCash.cashLeftInDeal > 0.10 * leavesCash.allInCost);
  assert.strictEqual(leavesCash.verdict, `Leaves ${formatCurrency(leavesCash.cashLeftInDeal)} in the deal.`);
});
