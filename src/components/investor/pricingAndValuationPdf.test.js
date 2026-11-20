import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PRICE_SOURCE_OPTIONS,
  normalizePriceSource,
  resolvePropertyPricing
} from './priceSource.js';
import { resolveSubjectDetailsForMode } from './compDetailsModel.js';
import {
  MAX_TIME_ADJUSTMENT_PCT,
  computeMeasuredTimeAdjustment,
  computeAppraisalGrid
} from './valuationEngine.js';
import {
  buildValuationEstimatePdfBytes,
  buildValuationEstimatePdfBase64
} from '../../utils/valuationPdfBuilder.js';
import {
  CANONICAL_MIGRATION_ORDER,
  MIGRATION_SCHEMA_SIGNATURES
} from '../../../scripts/db/_lib.mjs';

test('Price source resolves all 4 modes cleanly, never shows Ask for off-market, and Deal prefers My offer when set', () => {
  assert.strictEqual(PRICE_SOURCE_OPTIONS.length, 4);
  assert.strictEqual(normalizePriceSource('off_market_estimate'), 'off_market_estimate');
  assert.strictEqual(normalizePriceSource('Zillow estimate'), 'off_market_estimate');

  // 18801 SE River Ridge Rd: Off-market estimate $2,803,500
  const riverRidge = resolvePropertyPricing({
    list_price: 2803500,
    price_source: 'off_market_estimate'
  });
  assert.strictEqual(riverRidge.priceSource, 'off_market_estimate');
  assert.strictEqual(riverRidge.headerPriceLabel, 'OFF-MARKET ESTIMATE');
  assert.strictEqual(riverRidge.subjectColumnText, 'Off-market est. $2,803,500');
  assert.strictEqual(riverRidge.unadjustedRowText, '$2,803,500 (Off-market est.)');
  assert.ok(!riverRidge.subjectColumnText.includes('Ask'));
  assert.strictEqual(riverRidge.dealPurchasePrice, 2803500);
  assert.strictEqual(riverRidge.dealPurchaseLabel, 'Off-market estimate');

  // When My offer is set, Deal uses My offer while header stays Off-market estimate
  const withOffer = resolvePropertyPricing({
    list_price: 2803500,
    price_source: 'off_market_estimate',
    offer_price: 2450000
  });
  assert.strictEqual(withOffer.headerPriceLabel, 'OFF-MARKET ESTIMATE');
  assert.strictEqual(withOffer.referencePrice, 2803500);
  assert.strictEqual(withOffer.offerPrice, 2450000);
  assert.strictEqual(withOffer.dealPurchasePrice, 2450000);
  assert.strictEqual(withOffer.dealPurchaseLabel, 'My offer');

  // County value falls back to county just_value when list_price is blank
  const countyMode = resolvePropertyPricing(
    { price_source: 'county_value', list_price: null },
    { just_value: 2344940 }
  );
  assert.strictEqual(countyMode.headerPriceLabel, 'COUNTY VALUE');
  assert.strictEqual(countyMode.referencePrice, 2344940);
  assert.strictEqual(countyMode.dealPurchasePrice, 2344940);
  assert.strictEqual(countyMode.dealPurchaseLabel, 'County value');
});

test('Measured time adjustment uses actual ZIP period trend (positive, flat, negative), never extrapolates pre-series sales, and caps at ±10%', () => {
  const effectiveDate = new Date(2026, 10, 20); // Nov 20, 2026

  // Simulated ZIP 33469 series starting Jan 2025 through Aug 2026 (flat/mild +4% measured)
  const zip33469Data = {
    summary: {
      zip: '33469',
      mode_label: 'ZIP 33469',
      complete_through: 'Aug 2026',
      median_ppsf_last_6m: 520,
      monthly_trend_pct: 0.7
    },
    monthly: [
      { year: 2025, month: 1, is_complete: true, sales_count: 10, median_price_per_sqft: 500 },
      { year: 2025, month: 2, is_complete: true, sales_count: 10, median_price_per_sqft: 500 },
      { year: 2025, month: 3, is_complete: true, sales_count: 10, median_price_per_sqft: 500 },
      { year: 2025, month: 4, is_complete: true, sales_count: 10, median_price_per_sqft: 500 },
      { year: 2025, month: 5, is_complete: true, sales_count: 10, median_price_per_sqft: 500 },
      { year: 2025, month: 6, is_complete: true, sales_count: 10, median_price_per_sqft: 500 },
      { year: 2025, month: 10, is_complete: true, sales_count: 10, median_price_per_sqft: 540 },
      { year: 2025, month: 11, is_complete: true, sales_count: 10, median_price_per_sqft: 540 },
      { year: 2026, month: 3, is_complete: true, sales_count: 10, median_price_per_sqft: 520 },
      { year: 2026, month: 8, is_complete: true, sales_count: 10, median_price_per_sqft: 520 }
    ],
    quarterly: []
  };

  // 1. 18797 SE River Ridge Rd: sold 2024-11-20 for $3,100,000 (predates 2025-01)
  // Must measure earliest Jan–Jun 2025 ($500/sf) -> Mar–Aug 2026 ($520/sf) = +4.0% (+$124,000), NOT 24mo*0.7% (+$520,800)!
  const comp18797 = computeMeasuredTimeAdjustment({
    soldDate: '2024-11-20',
    soldPrice: 3100000,
    monthsSinceSale: 24,
    zipMarketData: zip33469Data,
    fallbackMonthlyTrendPct: 0.7,
    zipTrendSource: 'ZIP 33469'
  });
  assert.strictEqual(comp18797.appliedPct, 4);
  assert.strictEqual(comp18797.amount, 124000);
  assert.ok(comp18797.amount < 200000, 'Must NOT extrapolate 24 months into +$520,800');
  assert.ok(comp18797.note.includes('ZIP 33469'));
  assert.strictEqual(comp18797.wasCapped, false);

  // 2. Negative measured trend: sold Nov 2025 ($540/sf) -> Aug 2026 ($520/sf) = -3.7%
  const negativeComp = computeMeasuredTimeAdjustment({
    soldDate: '2025-11-15',
    soldPrice: 2000000,
    monthsSinceSale: 12,
    zipMarketData: zip33469Data,
    zipTrendSource: 'ZIP 33469'
  });
  assert.ok(negativeComp.appliedPct < 0, 'Negative market trend must yield negative time adjustment');
  assert.ok(negativeComp.amount < 0);

  // 3. Flat measured trend: 0%
  const flatData = {
    summary: { zip: '33469', complete_through: 'Aug 2026', median_ppsf_last_6m: 500 },
    monthly: [
      { year: 2025, month: 6, is_complete: true, sales_count: 10, median_price_per_sqft: 500 },
      { year: 2026, month: 8, is_complete: true, sales_count: 10, median_price_per_sqft: 500 }
    ]
  };
  const flatComp = computeMeasuredTimeAdjustment({
    soldDate: '2025-06-15',
    soldPrice: 2000000,
    monthsSinceSale: 17,
    zipMarketData: flatData,
    zipTrendSource: 'ZIP 33469'
  });
  assert.strictEqual(flatComp.appliedPct, 0);
  assert.strictEqual(flatComp.amount, 0);

  // 4. Hard ±10% cap (unless overridden)
  const surgingData = {
    summary: { zip: '33469', complete_through: 'Aug 2026', median_ppsf_last_6m: 600 },
    monthly: [
      { year: 2025, month: 1, is_complete: true, sales_count: 10, median_price_per_sqft: 500 },
      { year: 2026, month: 8, is_complete: true, sales_count: 10, median_price_per_sqft: 600 }
    ]
  };
  const capped = computeMeasuredTimeAdjustment({
    soldDate: '2025-01-15',
    soldPrice: 3100000,
    monthsSinceSale: 22,
    zipMarketData: surgingData,
    zipTrendSource: 'ZIP 33469'
  });
  assert.strictEqual(capped.measuredPct, 20);
  assert.strictEqual(capped.appliedPct, MAX_TIME_ADJUSTMENT_PCT);
  assert.strictEqual(capped.wasCapped, true);
  assert.strictEqual(capped.amount, 310000); // exactly +10% of $3.1M

  // 5. Override bypasses ±10% cap inside computeAppraisalGrid
  const grid = computeAppraisalGrid({
    subject: { sqft: 4307, zip: '33469', price_source: 'off_market_estimate', list_price: 2803500 },
    comps: [
      {
        id: 'c1',
        address: '18797 SE River Ridge Rd',
        sold_price: 3100000,
        sqft: 4500,
        sold_date: '2025-01-15',
        included: true,
        adjustments: { overrides: { time: 400000 } }
      }
    ],
    zipMarketData: surgingData,
    zipTrendSource: 'ZIP 33469',
    effectiveDate
  });
  assert.strictEqual(grid.comps[0].cells.time.computedAmount, 310000);
  assert.strictEqual(grid.comps[0].cells.time.amount, 400000);
  assert.strictEqual(grid.comps[0].cells.time.isOverridden, true);
  assert.ok(grid.timeTrendSource.includes('ZIP 33469'));
});

test('Subject defaults to Q4 quality (never Q5), never defaults construction to CBS, and land-heavy 18801 uses improvement $/sf GLA rate', () => {
  // Unknown subject quality & construction -> Q4 quality, unknown construction (NEVER CBS, NEVER Q5!)
  const unknownSubj = resolveSubjectDetailsForMode({ address: '100 Main St' }, 'as_is');
  assert.strictEqual(unknownSubj.quality, 'q4');
  assert.strictEqual(unknownSubj.construction_type, 'unknown');

  const unknownArvSubj = resolveSubjectDetailsForMode({ address: '100 Main St' }, 'arv');
  assert.strictEqual(unknownArvSubj.quality, 'q4');
  assert.notStrictEqual(unknownArvSubj.quality, 'q5');
  assert.strictEqual(unknownArvSubj.construction_type, 'unknown');

  // 18801 SE River Ridge Rd: Wood frame / Hardi-plank + 64% land value -> $196/sf GLA rate (not $340/sf!)
  const grid = computeAppraisalGrid({
    subject: {
      address: '18801 SE River Ridge Ct',
      sqft: 4307,
      just_value: 2344940,
      land_value: 1500000,
      list_price: 2803500,
      price_source: 'off_market_estimate',
      construction_detail: 'Wood frame / Hardi-plank'
    },
    comps: [
      {
        id: 'c1',
        address: '18797 SE River Ridge Rd',
        sold_price: 3100000,
        sqft: 4500,
        sold_date: '2026-05-01',
        included: true,
        construction_type: 'cbs',
        quality: 'q4'
      }
    ],
    sizeMethod: 'auto'
  });

  assert.strictEqual(grid.subjectDetails.quality, 'q4');
  assert.strictEqual(grid.subjectDetails.construction_type, 'wood_frame');
  assert.strictEqual(grid.subjectSummary.constructionLabel, 'Wood frame / Hardi-plank');
  assert.strictEqual(grid.sizeMethod, 'improvement_value');
  assert.strictEqual(grid.isLandHeavySubject, true);
  assert.strictEqual(grid.effectiveRates.glaRate, 196); // (2344940 - 1500000) / 4307 = 196/sf!
  assert.strictEqual(grid.subjectSummary.priceColumnText, 'Off-market est. $2,803,500');
  assert.strictEqual(grid.sanityAnchors.referencePriceAnchor.price, 2803500);
});

test('Valuation Estimate PDF builder generates valid multi-page %PDF-1.4 with landscape grid, exact footer, page numbers, and ZERO owner names', () => {
  const subject = {
    address: '18801 SE River Ridge Ct',
    city: 'Tequesta',
    state: 'FL',
    zip: '33469',
    county: 'Martin',
    parcel_id: '23-40-42-002-000-01070-1',
    sqft: 4307,
    lot_sqft: 32670,
    year_built: 1995,
    just_value: 2344940,
    land_value: 1500000,
    list_price: 2803500,
    price_source: 'off_market_estimate',
    construction_type: 'wood_frame',
    construction_detail: 'Wood frame / Hardi-plank',
    subdivision_name: 'River Ridge',
    nbrhd_cd: '892320',
    hoa_name: 'River Ridge POA',
    sketch_areas: 'DWELL 2,688 + 416 · DWELL_U 569 · ADDN 598 + 36',
    owner_name: 'DO_NOT_LEAK_OWNER_NAME',
    owner_email: 'private-secret@example.com',
    mailing_address: '999 SECRET MAILBOX'
  };

  const grid = computeAppraisalGrid({
    subject,
    comps: [
      {
        id: 'c1',
        address: '18797 SE River Ridge Rd',
        sold_price: 3100000,
        sqft: 4500,
        sold_date: '2025-08-15',
        distance_mi: 0.1,
        included: true,
        subdivision_name: 'River Ridge',
        nbrhd_cd: '892320'
      }
    ]
  });

  const pdfBytes = buildValuationEstimatePdfBytes({
    property: subject,
    countyData: {
      parcel_id: '23-40-42-002-000-01070-1',
      county: 'Martin',
      roll_year: 2026,
      just_value: 2344940,
      land_value: 1500000
    },
    grid
  });

  const pdfText = Buffer.from(pdfBytes).toString('latin1');
  assert.ok(pdfText.startsWith('%PDF-1.4\n'), 'Must start with valid %PDF-1.4 header');
  assert.ok(pdfText.includes('xref\n'), 'Must include xref table');
  assert.ok(pdfText.trim().endsWith('%%EOF'), 'Must end with %%EOF');

  // Portrait + Landscape MediaBoxes present
  assert.ok(pdfText.includes('/MediaBox [0 0 612 792]'), 'Must include Letter portrait pages');
  assert.ok(pdfText.includes('/MediaBox [0 0 792 612]'), 'Must include Letter landscape grid page');
  assert.ok(pdfText.includes('/Count 7'), 'Must produce 7 pages');

  // Exact footer on every single page + page numbers
  const footerMatches = pdfText.match(/Valuation estimate for my own analysis \\227 not an appraisal\./g) || [];
  assert.strictEqual(footerMatches.length, 7, 'Exact footer must appear on all 7 pages');
  assert.ok(pdfText.includes('Page 1 of 7'));
  assert.ok(pdfText.includes('Page 7 of 7'));

  // Required sections & non-Ask pricing & construction
  assert.ok(pdfText.includes('OFF-MARKET ESTIMATE'));
  assert.ok(pdfText.includes('Off-market est. $2,803,500'));
  assert.ok(pdfText.includes('Wood frame / Hardi-plank'));
  assert.ok(pdfText.includes('DWELL 2,688 + 416'));

  // Strictly ZERO owner names or mailing addresses
  assert.ok(!pdfText.includes('DO_NOT_LEAK_OWNER_NAME'));
  assert.ok(!pdfText.includes('private-secret@example.com'));
  assert.ok(!pdfText.includes('999 SECRET MAILBOX'));

  const dataUri = buildValuationEstimatePdfBase64({ property: subject, grid });
  assert.ok(dataUri.startsWith('data:application/pdf;base64,'));
});

test('Migration add_price_source_and_subject_meta.sql is registered, idempotent, and contains zero test rows', () => {
  const filename = 'add_price_source_and_subject_meta.sql';
  assert.ok(CANONICAL_MIGRATION_ORDER.includes(filename));
  assert.ok(MIGRATION_SCHEMA_SIGNATURES[filename]);
  const sqlText = fs.readFileSync(path.resolve(process.cwd(), 'migrations', filename), 'utf8');
  assert.ok(/ADD COLUMN IF NOT EXISTS price_source/i.test(sqlText));
  assert.ok(/ADD COLUMN IF NOT EXISTS offer_price/i.test(sqlText));
  assert.ok(/ADD COLUMN IF NOT EXISTS construction_detail/i.test(sqlText));
  assert.ok(!/\bINSERT\s+INTO\b/i.test(sqlText), 'Migration must contain zero test rows');
});

