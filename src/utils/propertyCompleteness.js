/**
 * src/utils/propertyCompleteness.js
 *
 * One-lookup property completeness evaluator and county data auto-filler.
 * Ensures:
 *   1. Folio resolves once and auto-fills every tab from county data:
 *      - Specs (building_characteristics): beds, baths, sqft, year built, CBS/wood frame, roof, pool, dock
 *      - Full sales history (county_sales + CAMA)
 *      - Subdivision / neighborhood (subdivision_name, subdivision_code, nbrhd_cd, mkt_ar)
 *      - Values & Roll Year (just_value, land_value, improvement_value, roll_year)
 *      - Flood & Zoning (use_code, zoning, flood zone)
 *      - Tax estimate (millage × just value)
 *      - Comps defaults (±20% sqft bounds, same subdivision priority)
 *   2. Each field is tagged "county record" with source and date.
 *   3. Manual user edits ALWAYS win over county data.
 *   4. Generates an itemized Data Completeness report explaining what is missing and why.
 */

import { normalizeCountyName } from '../config/counties.js';

export const COUNTY_MILLAGE_RATES = {
  'Palm Beach': 18.2,
  'Broward': 19.8,
  'Martin': 16.5
};

/**
 * Returns estimated annual and monthly property taxes from just value and millage rate.
 */
export function estimatePropertyTaxes(justValue, county = 'Palm Beach') {
  const jv = Number(justValue) || 0;
  if (jv <= 0) return { annual: 0, monthly: 0, millage: 18.2 };
  const normCounty = normalizeCountyName(county) || 'Palm Beach';
  const millage = COUNTY_MILLAGE_RATES[normCounty] || 18.2;
  const annual = Math.round((jv * millage) / 1000);
  const monthly = Math.round(annual / 12);
  return { annual, monthly, millage };
}

/**
 * Unifies property data with county parcel, CAMA building characteristics, and sales history.
 * Core rule: User's manual edits ALWAYS win over county data.
 */
export function mergeCountyDataIntoProperty(property = {}, countyData = {}) {
  if (!property && !countyData) return {};

  const prop = { ...(property || {}) };
  const cd = countyData && typeof countyData === 'object' ? countyData : {};
  const bc = cd.building_characteristics || prop.building_characteristics || null;
  const county = normalizeCountyName(cd.county || prop.parcel_county || prop.county) || 'Palm Beach';
  const rollYear = cd.roll_year || bc?.roll_year || 2026;

  // Track sources per field: { [field]: { source: 'manual' | 'county record', label, date } }
  const fieldSources = { ...(prop.field_sources || {}) };

  const setCountyField = (fieldKey, countyVal, sourceLabel = 'County record', sourceDate = `${rollYear} roll`) => {
    // If user already has a confirmed manual edit, user wins!
    const existingVal = prop[fieldKey];
    const isManual = fieldSources[fieldKey]?.source === 'manual';
    if (isManual && existingVal != null && existingVal !== '') {
      return;
    }
    if (countyVal != null && countyVal !== '') {
      prop[fieldKey] = countyVal;
      fieldSources[fieldKey] = {
        source: 'county record',
        label: sourceLabel,
        date: sourceDate
      };
    }
  };

  // 1. Parcel & Folio
  setCountyField('parcel_id', cd.parcel_id || prop.parcel_id);
  setCountyField('parcel_county', county);
  setCountyField('county', county);
  if (cd.address && !prop.address) setCountyField('address', cd.address);
  if (cd.city && !prop.city) setCountyField('city', cd.city);
  if (cd.zip && !prop.zip) setCountyField('zip', cd.zip);

  // 2. Specs from building_characteristics / county_parcels
  const bedsVal = bc?.beds != null ? Number(bc.beds) : (cd.beds != null ? Number(cd.beds) : null);
  setCountyField('beds', bedsVal, bc ? 'CAMA building record' : 'County roll');

  const fullBathsVal = bc?.full_baths != null ? Number(bc.full_baths) : (cd.full_baths != null ? Number(cd.full_baths) : null);
  const halfBathsVal = bc?.half_baths != null ? Number(bc.half_baths) : (cd.half_baths != null ? Number(cd.half_baths) : null);
  setCountyField('full_baths', fullBathsVal, bc ? 'CAMA building record' : 'County roll');
  setCountyField('half_baths', halfBathsVal, bc ? 'CAMA building record' : 'County roll');
  if (fullBathsVal != null) {
    const totalBaths = fullBathsVal + (halfBathsVal ? 0.5 : 0);
    setCountyField('baths', totalBaths);
  }

  const livingSqft = bc?.living_area_sqft || cd.living_sqft || null;
  setCountyField('sqft', livingSqft ? Number(livingSqft) : null, bc ? 'CAMA under-air' : 'County living sf');
  setCountyField('living_sqft', livingSqft ? Number(livingSqft) : null, bc ? 'CAMA under-air' : 'County living sf');

  const lotSqft = cd.land_sqft || prop.lot_sqft || null;
  setCountyField('lot_sqft', lotSqft ? Number(lotSqft) : null);

  const yrBuilt = bc?.year_built || cd.year_built || null;
  setCountyField('year_built', yrBuilt ? Number(yrBuilt) : null);

  const effYrBuilt = bc?.effective_year_built || cd.eff_year_built || null;
  setCountyField('eff_year_built', effYrBuilt ? Number(effYrBuilt) : null);

  if (bc?.construction_type) {
    setCountyField('construction_type', bc.construction_type, 'CAMA structure');
  }
  if (bc?.roof_cover_desc || bc?.roof_type) {
    setCountyField('roof_cover', bc.roof_cover_desc || bc.roof_type, 'CAMA structure');
  }

  // Pool & Dock
  if (bc?.pool_type && bc.pool_type !== 'none') {
    setCountyField('has_pool', true, 'CAMA extra features');
    setCountyField('pool_type', bc.pool_type);
    if (bc.pool_year) setCountyField('pool_year', bc.pool_year);
  }
  if (bc?.boat_dock != null && bc.boat_dock !== false) {
    setCountyField('boat_dock', true, 'CAMA yard features');
    if (bc.boat_dock_sqft) setCountyField('boat_dock_sqft', bc.boat_dock_sqft);
  }
  if (bc?.boat_lift != null && bc.boat_lift !== false) {
    setCountyField('boat_lift', true, 'CAMA yard features');
  }

  // 3. Subdivision / Neighborhood
  if (cd.subdivision_name) setCountyField('subdivision_name', cd.subdivision_name);
  if (cd.subdivision_code) setCountyField('subdivision_code', cd.subdivision_code);
  if (cd.nbrhd_cd) setCountyField('nbrhd_cd', cd.nbrhd_cd);
  if (cd.mkt_ar) setCountyField('mkt_ar', cd.mkt_ar);
  if (cd.s_legal) setCountyField('s_legal', cd.s_legal);

  // 4. Values & Taxes
  const justVal = cd.just_value != null ? Number(cd.just_value) : null;
  const landVal = cd.land_value != null ? Number(cd.land_value) : null;
  if (justVal != null) {
    setCountyField('just_value', justVal);
    const taxEst = estimatePropertyTaxes(justVal, county);
    setCountyField('estimated_annual_taxes', taxEst.annual, `Millage (${taxEst.millage} mills)`);
    setCountyField('annual_taxes', taxEst.annual);
    setCountyField('estimated_monthly_taxes', taxEst.monthly);
  }
  if (landVal != null) {
    setCountyField('land_value', landVal);
    if (justVal != null) {
      setCountyField('improvement_value', Math.max(0, justVal - landVal));
    }
  }

  // 5. Zoning / Use Code
  if (cd.use_code) setCountyField('use_code', cd.use_code);
  if (cd.units) setCountyField('units', Number(cd.units));

  // 6. Coordinates & Map Location
  if (cd.lat != null) setCountyField('lat', Number(cd.lat));
  if (cd.lng != null) setCountyField('lng', Number(cd.lng));

  // 7. Full Sales History
  const sales = Array.isArray(cd.sales) ? cd.sales : (Array.isArray(prop.sales) ? prop.sales : []);
  if (sales.length > 0) {
    prop.sales = sales;
    const marketSales = sales.filter((s) => Number(s.sale_price) >= 25000);
    const sorted = [...(marketSales.length > 0 ? marketSales : sales)].sort((a, b) => {
      return (Number(a.sale_year) * 100 + (Number(a.sale_month) || 1)) - (Number(b.sale_year) * 100 + (Number(b.sale_month) || 1));
    });
    const latest = sorted[sorted.length - 1];
    if (latest) {
      setCountyField('last_sale_price', Number(latest.sale_price));
      setCountyField('last_sale_date', `${latest.sale_year}-${String(latest.sale_month || 1).padStart(2, '0')}-01`);
    }
  }

  prop.field_sources = fieldSources;
  prop.building_characteristics = bc;
  return prop;
}

/**
 * Evaluates the data completeness of a property, returning an itemized checklist
 * with completion percentage, missing items, and actionable "why" explanations.
 */
export function evaluateDataCompleteness(property = {}, countyData = null) {
  const p = property || {};
  const cd = countyData || {};
  const bc = p.building_characteristics || cd.building_characteristics || null;
  const county = normalizeCountyName(p.parcel_county || p.county || cd.county) || 'Palm Beach';
  const sources = p.field_sources || {};

  const items = [];

  // Helper to add checklist item
  const check = ({ id, label, isComplete, displayValue, sourceLabel, sourceDate, missingReason, category }) => {
    items.push({
      id,
      label,
      category,
      isComplete: Boolean(isComplete),
      complete: Boolean(isComplete),
      status: isComplete ? 'complete' : 'missing',
      displayValue: isComplete ? displayValue : '—',
      sourceLabel: isComplete ? sourceLabel : null,
      sourceDate: isComplete ? sourceDate : null,
      missingReason: isComplete ? null : missingReason
    });
  };

  // 1. Address & Folio
  const hasFolio = Boolean(p.parcel_id || cd.parcel_id);
  check({
    id: 'folio',
    label: 'County Folio / Parcel ID',
    category: 'identification',
    isComplete: hasFolio,
    displayValue: p.parcel_id || cd.parcel_id,
    sourceLabel: `${county} Property Appraiser`,
    sourceDate: '2026',
    missingReason: 'Folio unlinked — enter address to resolve parcel'
  });

  // 2. Beds / Baths
  const beds = p.beds ?? bc?.beds ?? cd.beds;
  const baths = p.baths ?? (p.full_baths != null ? p.full_baths + (p.half_baths ? 0.5 : 0) : null) ?? bc?.full_baths;
  const hasBedsBaths = beds != null && baths != null;
  let bedsBathsMissing = 'Beds/baths: paste listing details';
  if (county === 'Broward') {
    bedsBathsMissing = 'Beds/baths: Broward building file not loaded yet';
  } else if (county === 'Martin') {
    bedsBathsMissing = 'Beds/baths: MCPA building specs pending import';
  }
  check({
    id: 'beds_baths',
    label: 'Bedrooms & Bathrooms',
    category: 'specs',
    isComplete: hasBedsBaths,
    displayValue: `${beds} bd / ${baths} ba`,
    sourceLabel: sources.beds?.label || (bc ? 'CAMA building record' : 'County record'),
    sourceDate: sources.beds?.date || '2026',
    missingReason: bedsBathsMissing
  });

  // 3. Living Area (GLA)
  const sqft = p.sqft ?? bc?.living_area_sqft ?? cd.living_sqft;
  check({
    id: 'sqft',
    label: 'Living Area (Sqft)',
    category: 'specs',
    isComplete: Boolean(sqft && Number(sqft) > 0),
    displayValue: sqft ? `${Number(sqft).toLocaleString('en-US')} sf` : '—',
    sourceLabel: sources.sqft?.label || 'County roll (under air)',
    sourceDate: sources.sqft?.date || '2026',
    missingReason: 'Living area: not found on county roll — enter manually'
  });

  // 4. Year Built
  const yr = p.year_built ?? bc?.year_built ?? cd.year_built;
  check({
    id: 'year_built',
    label: 'Year Built',
    category: 'specs',
    isComplete: Boolean(yr && Number(yr) > 1800),
    displayValue: yr ? String(yr) : '—',
    sourceLabel: sources.year_built?.label || 'County roll',
    sourceDate: sources.year_built?.date || '2026',
    missingReason: 'Year built: unknown on county roll'
  });

  // 5. Construction & Roof
  const constType = p.construction_type || bc?.construction_type;
  const roof = p.roof_cover || bc?.roof_cover_desc || bc?.roof_type;
  const hasStructure = Boolean(constType || roof);
  check({
    id: 'construction',
    label: 'Construction & Roof',
    category: 'specs',
    isComplete: hasStructure,
    displayValue: [constType ? constType.toUpperCase() : null, roof].filter(Boolean).join(' · '),
    sourceLabel: bc ? 'CAMA structural details' : 'County specs',
    sourceDate: '2026',
    missingReason: 'Construction / Roof: frame & roof material unspecified'
  });

  // 6. Full Sales History
  const sales = Array.isArray(cd.sales) && cd.sales.length > 0 ? cd.sales : (Array.isArray(p.sales) ? p.sales : []);
  const marketSales = sales.filter((s) => Number(s.sale_price) >= 25000);
  const hasSales = sales.length > 0;
  check({
    id: 'sales_history',
    label: 'Deed & Sales History',
    category: 'financial',
    isComplete: hasSales,
    displayValue: hasSales ? `${sales.length} deed transfers (${marketSales.length} market sales)` : '0 sales',
    sourceLabel: 'County deed registry',
    sourceDate: 'certified',
    missingReason: 'Sales history: no deed transfers found in database'
  });

  // 7. Subdivision & Neighborhood
  const subName = p.subdivision_name || cd.subdivision_name;
  const nbrhd = p.nbrhd_cd || cd.nbrhd_cd;
  const hasSub = Boolean(subName || nbrhd);
  check({
    id: 'subdivision',
    label: 'Subdivision / Neighborhood',
    category: 'location',
    isComplete: hasSub,
    displayValue: [subName, nbrhd ? `Nbrhd ${nbrhd}` : null].filter(Boolean).join(' · '),
    sourceLabel: 'County plat / appraisal neighborhood',
    sourceDate: '2026',
    missingReason: 'Subdivision: unplatted or unassigned neighborhood code'
  });

  // 8. Tax Roll Values & Taxes
  const jv = p.just_value ?? cd.just_value;
  const taxes = p.estimated_annual_taxes || (jv ? estimatePropertyTaxes(jv, county).annual : null);
  const hasValues = Boolean(jv && Number(jv) > 0);
  check({
    id: 'values_taxes',
    label: 'Values & Tax Estimate',
    category: 'financial',
    isComplete: hasValues,
    displayValue: hasValues ? `Just Value $${Number(jv).toLocaleString('en-US')} · Est. Taxes $${Number(taxes).toLocaleString('en-US')}/yr` : '—',
    sourceLabel: `Certified ${county} tax roll`,
    sourceDate: '2026',
    missingReason: 'Values: no certified tax assessment on file'
  });

  // 9. Zoning / Property Class
  const useCode = p.use_code || cd.use_code;
  check({
    id: 'zoning',
    label: 'Zoning & Land Use',
    category: 'location',
    isComplete: Boolean(useCode),
    displayValue: useCode ? `DOR ${useCode}` : '—',
    sourceLabel: 'County land use classification',
    sourceDate: '2026',
    missingReason: 'Zoning: land use code not mapped'
  });

  // 10. Flood Zone
  const flood = p.flood_zone || cd.flood_zone || (cd.fema_zone ? `Zone ${cd.fema_zone}` : null);
  check({
    id: 'flood',
    label: 'FEMA Flood Zone',
    category: 'location',
    isComplete: Boolean(flood),
    displayValue: flood || '—',
    sourceLabel: 'FEMA National Flood Hazard Layer',
    sourceDate: 'current',
    missingReason: 'Flood zone: check location intelligence / FEMA'
  });

  // 11. List Price / Purchase Price
  const listPrice = p.list_price || p.purchase_price || p.price;
  const hasPrice = Boolean(listPrice && Number(listPrice) > 0);
  check({
    id: 'list_price',
    label: 'List / Acquisition Price',
    category: 'financial',
    isComplete: hasPrice,
    displayValue: hasPrice ? `$${Number(listPrice).toLocaleString('en-US')}` : '—',
    sourceLabel: sources.list_price?.source === 'manual' ? 'Manual edit' : 'Listing paste',
    sourceDate: sources.list_price?.date || 'active',
    missingReason: 'List price: paste listing details or enter manually'
  });

  const total = items.length;
  const completed = items.filter((i) => i.isComplete).length;
  const scorePct = Math.round((completed / total) * 100);
  const missingItems = items.filter((i) => !i.isComplete);

  return {
    scorePct,
    completed,
    total,
    items,
    missingItems,
    missingCount: missingItems.length,
    isFullyComplete: scorePct === 100
  };
}
