import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeAndStripPii,
  parsePaRecordText,
  parseFolio
} from '../../utils/paRecordParser.js';
import { computeTimelinePhases, calculateDealBreakdown } from './dealBreakdownEngine.js';
import { classifyPermitType, FORT_LAUDERDALE_PERMITS_CONFIG } from '../../../scripts/county/import-permits-fort-lauderdale.mjs';

test('paRecordParser: strictly strips owner names, ownership history, and mailing addresses (Zero PII)', () => {
  const dirtyText = `
BROWARD COUNTY PROPERTY APPRAISER RECORD
FOLIO: 504203060010
SITE ADDRESS: 18801 SE RIVER RIDGE RD, TEQUESTA FL 33469

OWNER INFORMATION:
CURRENT OWNER: JOHN DOE & JANE DOE TRUSTEES
MAILING ADDRESS: 742 EVERGREEN TERRACE, SPRINGFIELD IL 62704
OWNERSHIP HISTORY:
2015-05-12 | DOE JOHN | WD | $1,200,000

BUILDING INFORMATION:
LIVING AREA: 4,307 SF
YEAR BUILT: 1998
BEDS: 3
BATHS: 7.0
CONSTRUCTION: CONCRETE BLOCK (CBS)
ROOF: TILE

PROPERTY VALUES:
2025 | LAND: $850,000 | IMP: $1,450,000 | JUST: $2,300,000
2024 | LAND: $800,000 | IMP: $1,350,000 | JUST: $2,150,000

SALES HISTORY:
03/15/2021 | $2,450,000 | WD | 45678/1234
08/10/2012 | $1,100,000 | WD | 32145/0987
`;

  const sanitized = sanitizeAndStripPii(dirtyText);

  // Assert all PII tokens are completely eradicated
  assert.equal(sanitized.includes('JOHN DOE'), false);
  assert.equal(sanitized.includes('JANE DOE'), false);
  assert.equal(sanitized.includes('742 EVERGREEN'), false);
  assert.equal(sanitized.includes('SPRINGFIELD'), false);
  assert.equal(sanitized.includes('DOE JOHN'), false);

  // Assert essential property details remain intact
  assert.ok(sanitized.includes('18801 SE RIVER RIDGE RD'));
  assert.ok(sanitized.includes('LIVING AREA: 4,307 SF'));
  assert.ok(sanitized.includes('YEAR BUILT: 1998'));
  assert.ok(sanitized.includes('JUST: $2,300,000'));
  assert.ok(sanitized.includes('2,450,000'));
});

test('paRecordParser: parses building specs, features, sales history, sub-areas, and value history', () => {
  const samplePaText = `
PALM BEACH COUNTY PROPERTY APPRAISER (PAPA)
PARCEL ID: 00-43-43-09-02-001-0110
LOCATION ADDRESS: 1901 EMBASSY DR, WEST PALM BEACH FL 33401
SUBDIVISION: PRESIDENTIAL ESTATES
NBRHD CODE: 4309

PROPERTY VALUES:
2025 | $420,000 | $1,180,000 | $1,600,000
2024 | $390,000 | $1,050,000 | $1,440,000
2023 | $350,000 | $950,000 | $1,300,000

BUILDING CHARACTERISTICS:
LIVING AREA: 3,250 SQFT
STORIES: 1.0
YEAR BUILT: 2004
EFF YEAR: 2010
BEDROOMS: 4
BATHS: 3.5
EXTERIOR WALL: CBS / STUCCO
ROOF COVER: BARREL TILE
QUALITY: Q4 (R3)
CONDITION: GOOD

EXTRA FEATURES:
POOL: INGROUND CONCRETE (2012)
DOCK: 420 SF WOOD DOCK WITH BOAT LIFT (2015)
FIREPLACE: 1

SUB-AREAS:
BAS | BASE / LIVING AREA | 3,250 SF
FOP | FINISHED OPEN PORCH | 280 SF
GRG | GARAGE FINISHED | 650 SF

SALES HISTORY:
06/18/2021 | $1,550,000 | WD | 32456/1102
11/04/2014 | $820,000 | WD | 27102/0540
`;

  const parsed = parsePaRecordText(samplePaText);

  assert.equal(parsed.county, 'Palm Beach');
  assert.equal(parsed.folio, '00-43-43-09-02-001-0110');
  assert.ok(parsed.address.includes('1901 EMBASSY DR'));
  assert.match(parsed.source, /^PA record PDF, \d{4}-\d{2}-\d{2}$/);

  // Building info
  assert.equal(parsed.buildingInfo.livingSqft, 3250);
  assert.equal(parsed.buildingInfo.yearBuilt, 2004);
  assert.equal(parsed.buildingInfo.effectiveYearBuilt, 2010);
  assert.equal(parsed.buildingInfo.beds, 4);
  assert.equal(parsed.buildingInfo.baths, 3.5);
  assert.equal(parsed.buildingInfo.fullBaths, 3);
  assert.equal(parsed.buildingInfo.halfBaths, 1);
  assert.equal(parsed.buildingInfo.construction, 'CBS');
  assert.equal(parsed.buildingInfo.roofCover, 'Clay tile');
  assert.equal(parsed.buildingInfo.qualityGrade, 'Q4');
  assert.equal(parsed.buildingInfo.conditionRating, 'C3');

  // Features
  assert.equal(parsed.features.pool, true);
  assert.equal(parsed.features.poolYear, 2012);
  assert.equal(parsed.features.dock, true);
  assert.equal(parsed.features.dockSqft, 420);
  assert.equal(parsed.features.boatLift, true);
  assert.equal(parsed.features.fireplaces, 1);

  // Sub-areas
  assert.equal(parsed.subAreas.length, 3);
  assert.equal(parsed.subAreas[0].code, 'BAS');
  assert.equal(parsed.subAreas[0].sqft, 3250);
  assert.equal(parsed.subAreas[1].code, 'FOP');
  assert.equal(parsed.subAreas[2].code, 'GRG');

  // Value history
  assert.equal(parsed.valueHistory.length, 3);
  assert.equal(parsed.valueHistory[0].year, 2025);
  assert.equal(parsed.valueHistory[0].landValue, 420000);
  assert.equal(parsed.valueHistory[0].improvementValue, 1180000);
  assert.equal(parsed.valueHistory[0].justValue, 1600000);

  // Sales history
  assert.equal(parsed.salesHistory.length, 2);
  assert.equal(parsed.salesHistory[0].sale_price, 1550000);
  assert.equal(parsed.salesHistory[0].sale_date, '2021-06-18');
  assert.equal(parsed.salesHistory[0].deed_type, 'WD');
  assert.equal(parsed.salesHistory[0].book, '32456');
  assert.equal(parsed.salesHistory[0].page, '1102');
});

test('paRecordParser: detects folio formats for Broward, Palm Beach, and Martin', () => {
  assert.equal(parseFolio('PARCEL ID: 504203060010'), '504203060010');
  assert.equal(parseFolio('FOLIO NUMBER 00-43-43-09-02-001-0110'), '00-43-43-09-02-001-0110');
  assert.equal(parseFolio('PARCEL: 23-40-42-002-000-01070-1'), '23-40-42-002-000-01070-1');
});

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
