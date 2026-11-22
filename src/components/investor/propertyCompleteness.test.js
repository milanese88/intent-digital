import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimatePropertyTaxes,
  mergeCountyDataIntoProperty,
  evaluateDataCompleteness
} from '../../utils/propertyCompleteness.js';
import { parseListingDetailsText } from '../../utils/listingDetailsParser.js';

test('estimatePropertyTaxes: estimates Palm Beach taxes using ~18.2 millage', () => {
  const taxes = estimatePropertyTaxes(2000000, 'Palm Beach');
  assert.equal(taxes.annual, 36400);
  assert.equal(taxes.monthly, 3033);
});

test('estimatePropertyTaxes: estimates Broward taxes using ~19.8 millage', () => {
  const taxes = estimatePropertyTaxes(1000000, 'Broward');
  assert.equal(taxes.annual, 19800);
  assert.equal(taxes.monthly, 1650);
});

test('estimatePropertyTaxes: returns zero for invalid or non-positive values', () => {
  const pbt = estimatePropertyTaxes(0, 'Palm Beach');
  assert.equal(pbt.annual, 0);
  assert.equal(pbt.monthly, 0);
  const brt = estimatePropertyTaxes(null, 'Broward');
  assert.equal(brt.annual, 0);
  assert.equal(brt.monthly, 0);
});

test('mergeCountyDataIntoProperty: auto-fills specs and tags fields as county record', () => {
  const baseProperty = {
    id: 'prop-1',
    address: '301 Cascade Ln',
    city: 'Palm Beach Shores',
    zip: '33404',
    county: 'Palm Beach',
    field_sources: {}
  };

  const countyData = {
    county: 'Palm Beach',
    parcel_id: '54434227040002670',
    just_value: '2140569',
    land_value: '850000',
    use_code: '001',
    subdivision_name: 'INLET BEACH',
    nbrhd_cd: 'PB01',
    building_characteristics: {
      beds: '4',
      full_baths: 3,
      half_baths: 0,
      living_area_sqft: 2607,
      year_built: 2024,
      pool_type: 'standard',
      construction_type: 'cbs',
      roof_cover_desc: 'ROLLED COMPOSIT'
    },
    sales: [
      { sale_price: '2250000', sale_year: 2024, sale_month: 11, qual_code: '01' }
    ]
  };

  const merged = mergeCountyDataIntoProperty(baseProperty, countyData);

  assert.equal(merged.beds, 4);
  assert.equal(merged.baths, 3);
  assert.equal(merged.sqft, 2607);
  assert.equal(merged.year_built, 2024);
  assert.equal(merged.has_pool, true);
  assert.equal(merged.just_value, 2140569);
  assert.equal(merged.subdivision_name, 'INLET BEACH');
  assert.ok(merged.annual_taxes > 0);

  // Verify field tagging
  assert.equal(merged.field_sources.beds.source, 'county record');
  assert.equal(merged.field_sources.living_sqft.source, 'county record');
  assert.equal(merged.field_sources.just_value.source, 'county record');
});

test('mergeCountyDataIntoProperty: enforces manual edit precedence', () => {
  const userEditedProperty = {
    id: 'prop-2',
    address: '100 Ocean Dr',
    beds: 5, // user manually corrected beds
    baths: 4.5,
    sqft: 3200,
    field_sources: {
      beds: { source: 'manual', updated_at: '2026-11-20T12:00:00Z', label: 'Manual entry' },
      sqft: { source: 'manual', updated_at: '2026-11-20T12:00:00Z', label: 'Manual entry' }
    }
  };

  const countyData = {
    county: 'Palm Beach',
    parcel_id: '1234567890',
    building_characteristics: {
      beds: '3', // county says 3, but user said 5
      full_baths: 2,
      half_baths: 0,
      living_area_sqft: 2500 // county says 2500, user said 3200
    }
  };

  const merged = mergeCountyDataIntoProperty(userEditedProperty, countyData);

  assert.equal(merged.beds, 5); // user value preserved
  assert.equal(merged.sqft, 3200); // user value preserved
  assert.equal(merged.field_sources.beds.source, 'manual');
  assert.equal(merged.baths, 2); // baths was not manual, so county filled it
  assert.equal(merged.field_sources.baths.source, 'county record');
});

test('evaluateDataCompleteness: evaluates completeness score and identifies missing items', () => {
  const property = {
    address: '301 Cascade Ln',
    county: 'Palm Beach',
    parcel_id: '54434227040002670',
    beds: 4,
    baths: 3,
    sqft: 2607,
    year_built: 2024,
    construction_type: 'cbs',
    list_price: 2450000,
    just_value: 2140569,
    subdivision_name: 'INLET BEACH',
    sales: [{ sale_price: 2250000 }],
    field_sources: {}
  };

  const completeness = evaluateDataCompleteness(property, { county: 'Palm Beach', sales: [{ sale_price: 2250000 }] });
  assert.ok(completeness.scorePct > 70);
  assert.ok(completeness.missingCount <= 4);
  assert.ok(Array.isArray(completeness.items));

  const bedsItem = completeness.items.find((i) => i.id === 'beds_baths');
  assert.equal(bedsItem.complete, true);
  assert.equal(bedsItem.status, 'complete');
});

test('evaluateDataCompleteness: reports Broward building file missing reason when beds/baths are empty', () => {
  const property = {
    address: '100 Broward Blvd',
    county: 'Broward',
    sqft: 1500,
    field_sources: {}
  };

  const completeness = evaluateDataCompleteness(property, { county: 'Broward' });
  const bedsItem = completeness.items.find((i) => i.id === 'beds_baths');
  assert.equal(bedsItem.complete, false);
  assert.match(bedsItem.missingReason, /Broward building file not loaded yet/);
});

test('parseListingDetailsText: extracts list price alongside beds, baths, and living sqft', () => {
  const listingText = `
    Active Listing · MLS #RX-10928374
    301 Cascade Ln, Palm Beach Shores, FL 33404
    List price: $2,250,000
    4 beds · 3 baths · 2,607 sqft · Built in 2024
    Stunning custom coastal residence with heated pool and CBS construction.
  `;

  const parsed = parseListingDetailsText(listingText);
  assert.equal(parsed.patch.list_price, 2250000);
  assert.equal(parsed.patch.beds, 4);
  assert.equal(parsed.patch.baths, 3);
  assert.equal(parsed.patch.sqft, 2607);
  assert.equal(parsed.patch.year_built, 2024);
  assert.equal(parsed.patch.has_pool, true);
  assert.equal(parsed.patch.construction_type, 'cbs');
});
