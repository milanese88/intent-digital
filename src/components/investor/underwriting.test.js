import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMortgagePayment,
  calculateFloridaLoanTaxes,
  calculateFloridaOwnerTitlePolicy,
  calculateMonthlyPayment,
  calculateCashToClose,
  calculateLiquidCashNeeded,
  formatCurrency,
  formatPercent,
  formatRatio,
  underwriteRental,
  underwriteFlip,
  underwriteBrrrr,
  ESTIMATED_CLOSING_DEFAULTS,
  LOAN_TYPES
} from './underwriting.js';

test('calculateMortgagePayment: standard 30yr mortgage ($374,250 loan at 7% for 30 years -> ~$2,490)', () => {
  const pi = calculateMortgagePayment(374250, 0.07, 30);
  assert.ok(Math.abs(pi - 2489.89) < 0.05, `Expected ~$2,489.89, got ${pi}`);
  assert.strictEqual(Math.round(pi), 2490);
});

test('calculateMortgagePayment: 0% interest rate', () => {
  const pi = calculateMortgagePayment(120000, 0, 10);
  assert.strictEqual(pi, 1000);
});

test('calculateMortgagePayment: 0 loan or 0 term', () => {
  assert.strictEqual(calculateMortgagePayment(0, 0.07, 30), 0);
  assert.strictEqual(calculateMortgagePayment(100000, 0.07, 0), 0);
});

test('Florida Loan Taxes: price $499,000, 25% down -> loan $374,250 -> doc stamps $1,310, intangible tax $749', () => {
  const loan = 499000 * 0.75; // $374,250
  assert.strictEqual(loan, 374250);

  const flTaxes = calculateFloridaLoanTaxes(loan, false);
  // Doc stamps: 374,250 * 0.0035 = 1,309.875 -> 1,310
  assert.strictEqual(flTaxes.docStamps, 1310);
  // Intangible tax: 374,250 * 0.002 = 748.50 -> 749
  assert.strictEqual(flTaxes.intangibleTax, 749);
  assert.strictEqual(flTaxes.totalFloridaLoanTaxes, 1310 + 749);
});

test('Florida Loan Taxes: Cash purchase -> both Florida loan taxes $0', () => {
  const flTaxes = calculateFloridaLoanTaxes(0, true);
  assert.strictEqual(flTaxes.docStamps, 0);
  assert.strictEqual(flTaxes.intangibleTax, 0);
  assert.strictEqual(flTaxes.totalFloridaLoanTaxes, 0);

  // Even if a non-zero loan was accidentally passed, isCash = true forces $0
  const flTaxesForced = calculateFloridaLoanTaxes(374250, true);
  assert.strictEqual(flTaxesForced.docStamps, 0);
  assert.strictEqual(flTaxesForced.intangibleTax, 0);
  assert.strictEqual(flTaxesForced.totalFloridaLoanTaxes, 0);
});

test('calculateMonthlyPayment: itemized PITI + HOA + flood + PMI', () => {
  // $374,250 loan at 7%, price $499,000, taxes 2% ($9,980/yr), ins $2,400/yr, flood $1,800/yr, HOA $350/mo, PMI $0
  const payment = calculateMonthlyPayment({
    loan: 374250,
    interestRatePct: 7.0,
    loanTermYears: 30,
    isInterestOnly: false,
    isCash: false,
    purchasePrice: 499000,
    propertyTaxesYr: 9980,
    insuranceYr: 2400,
    floodInsuranceYr: 1800,
    isFloodEnabled: true,
    hoaMo: 350,
    isHoaEnabled: true,
    specialAssessmentsMo: 50,
    pmiPct: 0
  });

  assert.ok(Math.abs(payment.monthlyPI - 2489.89) < 0.1);
  assert.strictEqual(Math.round(payment.taxesMo), Math.round(9980 / 12)); // 832
  assert.strictEqual(payment.insuranceMo, 200); // 2400 / 12
  assert.strictEqual(payment.floodInsuranceMo, 150); // 1800 / 12
  assert.strictEqual(payment.hoaMonthly, 350);
  assert.strictEqual(payment.specialAssessmentsMonthly, 50);
  assert.strictEqual(payment.pmiMo, 0);

  const expectedTotal = payment.monthlyPI + payment.taxesMo + 200 + 150 + 350 + 50;
  assert.ok(Math.abs(payment.totalMonthlyPayment - expectedTotal) < 0.01);
});

test('calculateMonthlyPayment: Interest-only hard money loan', () => {
  // $300,000 loan at 10.5% interest-only -> 300,000 * 0.105 / 12 = $2,625/mo
  const payment = calculateMonthlyPayment({
    loan: 300000,
    interestRatePct: 10.5,
    loanTermYears: 1,
    isInterestOnly: true,
    isCash: false,
    purchasePrice: 400000,
    propertyTaxesYr: 8000,
    insuranceYr: 2400
  });

  assert.strictEqual(payment.monthlyPI, 2625);
});

test('calculateCashToClose: itemized costs and buyer/seller title toggle', () => {
  const price = 499000;
  const loan = 374250;

  const ctcBuyerTitle = calculateCashToClose({
    purchasePrice: price,
    loan,
    isCash: false,
    ownerTitlePaidByBuyer: true,
    insuranceYr: 2400,
    taxesYr: 9980,
    sellerCredits: 2000
  });

  assert.strictEqual(ctcBuyerTitle.downPayment, 124750);
  assert.strictEqual(ctcBuyerTitle.floridaLoanTaxes.docStamps, 1310);
  assert.strictEqual(ctcBuyerTitle.floridaLoanTaxes.intangibleTax, 749);
  assert.ok(ctcBuyerTitle.titleFees.ownersTitlePolicy > 0);
  assert.strictEqual(ctcBuyerTitle.sellerCredits, 2000);
  assert.ok(ctcBuyerTitle.totalCashToClose > ctcBuyerTitle.downPayment);

  // Toggle owner title policy to seller-paid
  const ctcSellerTitle = calculateCashToClose({
    purchasePrice: price,
    loan,
    isCash: false,
    ownerTitlePaidByBuyer: false,
    insuranceYr: 2400,
    taxesYr: 9980,
    sellerCredits: 2000
  });

  assert.strictEqual(ctcSellerTitle.titleFees.ownersTitlePolicy, 0);
  assert.strictEqual(
    ctcBuyerTitle.totalCashToClose - ctcSellerTitle.totalCashToClose,
    ctcBuyerTitle.titleFees.ownersTitlePolicy
  );
});

test('calculateLiquidCashNeeded: covers vs short summary', () => {
  // Needed: $150k cash to close + $30k rehab + $10k holding + 6 months reserves ($3k/mo = $18k) = $208k
  const needed = calculateLiquidCashNeeded({
    cashToClose: 150000,
    rehabCash: 30000,
    holdingCosts: 10000,
    reserveMonths: 6,
    monthlyPayment: 3000,
    profileLiquidCash: 250000
  });

  assert.strictEqual(needed.totalLiquidCashNeeded, 208000);
  assert.strictEqual(needed.isCovered, true);
  assert.strictEqual(needed.summaryText, 'Covered with $42,000 left');

  // Short scenario: buyer has $150k but needs $208k -> Short $58k
  const short = calculateLiquidCashNeeded({
    cashToClose: 150000,
    rehabCash: 30000,
    holdingCosts: 10000,
    reserveMonths: 6,
    monthlyPayment: 3000,
    profileLiquidCash: 150000
  });

  assert.strictEqual(short.isCovered, false);
  assert.strictEqual(
    short.summaryText,
    'You need $208,000 · You have $150,000 · Short $58,000'
  );
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

test('underwriteRental: legacy compatibility with useSimplifiedClosing', () => {
  const res = underwriteRental({
    purchasePrice: 499000,
    downPaymentPct: 0.25,
    interestRatePct: 0.07,
    loanTermYears: 30,
    closingCostsPct: 0.03,
    useSimplifiedClosing: true,
    monthlyRent: 3400,
    vacancyPct: 0.05,
    maintenancePct: 0.05,
    capexPct: 0.05,
    managementPct: 0.00,
    propertyTaxesYr: 499000 * 0.02,
    insuranceYr: 6000,
    hoaMo: 0
  });

  assert.strictEqual(res.isComplete, true);
  assert.strictEqual(res.loan, 374250);
  assert.strictEqual(res.cashNeeded, 139720);
  assert.strictEqual(res.effectiveIncomeYr, 38760);
  assert.strictEqual(res.operatingExpensesYr, 20060);
  assert.strictEqual(res.noi, 18700);
  assert.ok(Math.abs(res.capRate - 0.03747) < 0.0001);
  assert.strictEqual(formatPercent(res.capRate), '3.7%');
  assert.ok(Math.abs(res.monthlyCashFlow - (-931.56)) < 0.1);
  assert.strictEqual(formatCurrency(res.monthlyCashFlow), '-$932');
  assert.strictEqual(res.verdict, "Doesn't cash flow at this price.");
});

test('underwriteRental: Strong rental verdict and missing inputs', () => {
  const missingRent = underwriteRental({ purchasePrice: 400000, insuranceYr: 3000 });
  assert.strictEqual(missingRent.isComplete, false);
  assert.strictEqual(missingRent.hint, 'Add rent to see cash flow');

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

test('underwriteFlip: 70% rule, profit, and loss with simplified closing', () => {
  const meets70 = underwriteFlip({
    purchasePrice: 280000,
    rehabBudget: 50000,
    arv: 500000,
    buyingClosingCostsPct: 0.02,
    useSimplifiedClosing: true,
    holdingMonths: 6,
    holdingCostMo: 1000,
    sellingCostsPct: 0.08
  });
  assert.strictEqual(meets70.isComplete, true);
  assert.strictEqual(meets70.maxOffer, 300000);
  assert.ok(meets70.projectedProfit > 0);
  assert.strictEqual(meets70.verdict, 'Meets the 70% rule.');
});

test('underwriteBrrrr: cash left and cash back out', () => {
  const res = underwriteBrrrr({
    purchasePrice: 200000,
    rehabBudget: 50000,
    arv: 350000,
    buyingClosingCostsPct: 0.02,
    useSimplifiedClosing: true,
    refiLtvPct: 0.75,
    refiRatePct: 0.07,
    refiTermYears: 30,
    refiClosingPct: 0.02,
    monthlyRent: 2800,
    insuranceYr: 2000,
    propertyTaxesYr: 4000,
    hoaMo: 0
  });

  assert.strictEqual(res.isComplete, true);
  assert.strictEqual(res.refiLoan, 262500);
  // All in: 200k + 50k + 4k (2% of 200k) + 5,250 (2% of 262,500) = 259,250
  assert.strictEqual(res.allInCost, 259250);
  // Cash left: 259,250 - 262,500 = -3,250 (cash back out)
  assert.strictEqual(res.cashLeftInDeal, -3250);
  assert.strictEqual(res.isInfiniteCoC, true);
  assert.strictEqual(res.verdict, 'Most of your cash comes back out.');
});
