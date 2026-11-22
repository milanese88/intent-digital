import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTimelinePhases, calculateDealBreakdown } from './dealBreakdownEngine.js';
import { classifyPermitType, FORT_LAUDERDALE_PERMITS_CONFIG } from '../../../scripts/county/import-permits-fort-lauderdale.mjs';

test('PropertyTimeline computeTimelinePhases: computes actual pre-construction, construction, and on-market durations', () => {
  // Case A: Complete milestone sequence for Demo -> New Build
  const phasesA = computeTimelinePhases({
    buyDate: '2022-03-15',
    demoDate: '2022-07-10',
    permitDate: '2022-09-20',
    completedDate: '2023-11-05',
    listDate: '2023-12-01',
    sellDate: '2024-03-28',
    dealType: 'demo_new_build'
  });

  assert.equal(phasesA.hasActualPhases, true);
  // Pre-construction: Mar 2022 to Jul 2022 = 4 months
  assert.equal(phasesA.preConstructionMonths, 4);
  // Construction: Jul 2022 to Nov 2023 = 16 months
  assert.equal(phasesA.constructionMonths, 16);
  // On-market: Dec 2023 to Mar 2024 = 3 months
  assert.equal(phasesA.onMarketMonths, 3);
  // Total hold: Mar 2022 to Mar 2024 = 24 months
  assert.equal(phasesA.totalHoldMonths, 24);

  // Case B: Flip with permits
  const phasesB = computeTimelinePhases({
    buyDate: '2024-01-10',
    permitDate: '2024-02-15',
    completedDate: '2024-06-30',
    sellDate: '2024-08-20',
    dealType: 'flip'
  });

  assert.equal(phasesB.hasActualPhases, true);
  assert.equal(phasesB.preConstructionMonths, 1);
  assert.equal(phasesB.constructionMonths, 4);
  assert.equal(phasesB.onMarketMonths, 2);
  assert.equal(phasesB.totalHoldMonths, 7);

  // Case C: Missing dates uses standard default hold window
  const phasesC = computeTimelinePhases({
    dealType: 'flip',
    defaultHoldMonths: 6
  });
  assert.equal(phasesC.hasActualPhases, false);
  assert.equal(phasesC.constructionMonths, 4);
  assert.equal(phasesC.onMarketMonths, 2);
  assert.equal(phasesC.totalHoldMonths, 7);
});

test('dealBreakdownEngine: applies timeline phases to holding and phased financing interest', () => {
  const inputsWithoutPhases = {
    dealType: 'demo_new_build',
    purchasePrice: 1200000,
    exitPrice: 3200000,
    afterLivingSqft: 4000,
    beforeLivingSqft: 1800,
    holdMonths: 18,
    financingMode: 'construction_loan',
    interestRatePct: 10.0,
    ltcPct: 75,
    drawUtilPct: 50,
    millageRate: 18.5,
    monthlyInsurance: 600,
    monthlyUtilities: 400
  };

  const inputsWithPhases = {
    ...inputsWithoutPhases,
    timelinePhases: {
      hasActualPhases: true,
      preConstructionMonths: 4,
      constructionMonths: 14,
      onMarketMonths: 3,
      totalHoldMonths: 21
    }
  };

  const res1 = calculateDealBreakdown(inputsWithoutPhases);
  const res2 = calculateDealBreakdown(inputsWithPhases);

  // Res2 uses actual 21 months instead of 18
  assert.equal(res2.costs.holdMonths, 21);
  assert.ok(res2.costs.holdingCosts > res1.costs.holdingCosts);
  // Res2 financing interest reflects phased draws (pre-construction + construction + completed)
  assert.ok(res2.costs.financingCosts > 0);
  assert.ok(res2.metrics.estProfit > 0);
});

test('Permits open data: Fort Lauderdale permit type classifier maps all major categories', () => {
  assert.equal(FORT_LAUDERDALE_PERMITS_CONFIG.jurisdiction, 'City of Fort Lauderdale');
  assert.equal(FORT_LAUDERDALE_PERMITS_CONFIG.county, 'Broward');

  assert.equal(classifyPermitType('DEMO', 'TOTAL DEMOLITION OF 1-STORY SFH'), 'demolition');
  assert.equal(classifyPermitType('BUILDING', 'NEW RESIDENCE 2-STORY WITH GARAGE'), 'new_build');
  assert.equal(classifyPermitType('BUILDING', 'ROOM ADDITION MASTER BEDROOM'), 'addition');
  assert.equal(classifyPermitType('BUILDING', 'INTERIOR REMODEL & KITCHEN ALTERATION'), 'remodel');
  assert.equal(classifyPermitType('POOL', 'NEW INGROUND SWIMMING POOL & SCREEN'), 'pool');
  assert.equal(classifyPermitType('ROOF', 'REROOF TILE TO STANDING SEAM METAL'), 'roof');
  assert.equal(classifyPermitType('ELECTRICAL', '200A SERVICE PANEL UPGRADE'), 'mep');
  assert.equal(classifyPermitType('PLUMBING', 'WHOLE HOUSE REPIPE'), 'mep');
  assert.equal(classifyPermitType('MISC', 'CHAIN LINK FENCE 6FT'), 'other');
});
