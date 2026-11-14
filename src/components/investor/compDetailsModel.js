/**
 * Canonical Comp & Subject Property Details Model
 *
 * Shared across client components (VALUE & COMPS, APPRAISAL, Comp/Subject Details Editor)
 * and server API routes (/api/county/comps, /api/investor/comps, /api/investor/comp-details).
 *
 * Enforces:
 * - Strict separation between confirmed facts and county NAL hints.
 * - Full UAD C1–C6 condition ratings + quick picks (Original -> C4, Updated -> C3, Fully renovated -> C2).
 * - Explicit "Unknown" tri-state handling (never inferring impact windows or roof age from year_built).
 * - 9-category completeness progress ("Details: X of 9 filled").
 * - Normalized county sale key (county + folio + YYYY-MM) so comp details filled once
 *   pre-fill across every property and appraisal using that county sale.
 */

export const CONDITION_QUICK_PICKS = [
  { id: 'c4', label: 'Original', uad: 'C4', fullLabel: 'Original (C4)' },
  { id: 'c3', label: 'Updated', uad: 'C3', fullLabel: 'Updated (C3)' },
  { id: 'c2', label: 'Fully renovated', uad: 'C2', fullLabel: 'Fully renovated (C2)' }
];

export const UAD_CONDITION_OPTIONS = [
  {
    id: 'c1',
    uad: 'C1',
    label: 'C1 · New',
    shortLabel: 'New (C1)',
    description: 'Newly constructed, never occupied',
    isRenovated: true
  },
  {
    id: 'c2',
    uad: 'C2',
    label: 'Fully renovated (C2)',
    shortLabel: 'Renovated (C2)',
    description: 'Like-new / full gut or complete modern remodel',
    isRenovated: true
  },
  {
    id: 'c3',
    uad: 'C3',
    label: 'Updated (C3)',
    shortLabel: 'Updated (C3)',
    description: 'Well maintained with updated kitchen/baths',
    isRenovated: true
  },
  {
    id: 'c4',
    uad: 'C4',
    label: 'Original (C4)',
    shortLabel: 'Original (C4)',
    description: 'Adequately maintained, dated/original finishes',
    isRenovated: false
  },
  {
    id: 'c5',
    uad: 'C5',
    label: 'C5 · Needs work',
    shortLabel: 'Fair (C5)',
    description: 'Obvious deferred maintenance, livable',
    isRenovated: false
  },
  {
    id: 'c6',
    uad: 'C6',
    label: 'C6 · Major rehab',
    shortLabel: 'Poor (C6)',
    description: 'Substantial damage or major repairs required',
    isRenovated: false
  },
  {
    id: 'unknown',
    uad: null,
    label: 'Unknown',
    shortLabel: 'Unknown',
    description: 'Condition not yet verified',
    isRenovated: false
  }
];

export const VALID_CONDITIONS = new Set([
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'c6',
  'as_is',
  'original',
  'updated',
  'fully_renovated',
  'unknown'
]);

/**
 * Normalizes legacy condition keys ('as_is', 'updated', 'fully_renovated') and UAD keys ('c1'..'c6')
 * to canonical UAD keys ('c1'..'c6' | 'unknown').
 */
export function normalizeConditionKey(raw) {
  if (raw == null || raw === '') return 'unknown';
  const k = String(raw).trim().toLowerCase();
  if (k === 'unknown') return 'unknown';
  if (k === 'c1') return 'c1';
  if (k === 'c2' || k === 'fully_renovated' || k === 'renovated') return 'c2';
  if (k === 'c3' || k === 'updated') return 'c3';
  if (k === 'c4' || k === 'as_is' || k === 'as-is' || k === 'original') return 'c4';
  if (k === 'c5') return 'c5';
  if (k === 'c6') return 'c6';
  return 'unknown';
}

export function getUadConditionMeta(raw) {
  const canonical = normalizeConditionKey(raw);
  return UAD_CONDITION_OPTIONS.find((opt) => opt.id === canonical) || UAD_CONDITION_OPTIONS[6];
}

export const ROOF_TYPE_OPTIONS = [
  { id: 'shingle', label: 'Shingle' },
  { id: 'barrel_tile', label: 'Barrel tile' },
  { id: 'metal', label: 'Metal' },
  { id: 'flat', label: 'Flat' },
  { id: 'unknown', label: 'Unknown' }
];

export const WINDOW_OPTIONS = [
  { id: 'impact', label: 'Impact' },
  { id: 'shutters', label: 'Shutters' },
  { id: 'none', label: 'None' },
  { id: 'unknown', label: 'Unknown' }
];

export const POOL_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'standard', label: 'Standard' },
  { id: 'resort', label: 'Resort' },
  { id: 'unknown', label: 'Unknown' }
];

export const GARAGE_OPTIONS = [
  { id: 'none', label: 'None (0)' },
  { id: '1_bay', label: '1 bay', garage_type: 'garage', garage_bays: 1 },
  { id: '2_bay', label: '2 bays', garage_type: 'garage', garage_bays: 2 },
  { id: '3_bay', label: '3+ bays', garage_type: 'garage', garage_bays: 3 },
  { id: 'carport', label: 'Carport', garage_type: 'carport', garage_bays: 0 },
  { id: 'converted', label: 'Converted', garage_type: 'converted', garage_bays: 0 },
  { id: 'unknown', label: 'Unknown', garage_type: 'unknown', garage_bays: null }
];

export const WATERFRONT_VIEW_OPTIONS = [
  { id: 'dry_lot', label: 'Dry lot' },
  { id: 'lake', label: 'Lake' },
  { id: 'golf', label: 'Golf' },
  { id: 'canal_fixed_bridge', label: 'Canal (fixed bridge)' },
  { id: 'ocean_access', label: 'Ocean access' },
  { id: 'unknown', label: 'Unknown' }
];

export const DETAIL_SOURCE_OPTIONS = [
  { id: 'MLS', label: 'MLS' },
  { id: 'listing_photos', label: 'Listing photos' },
  { id: 'agent', label: 'Agent' },
  { id: 'drive_by', label: 'Drive-by' },
  { id: 'county_hint', label: 'County hint' }
];

export const DOR_IMP_QUAL_LABELS = {
  '1': 'Minimum / Low cost',
  '2': 'Below average',
  '3': 'Average',
  '4': 'Above average',
  '5': 'Excellent',
  '6': 'Superior'
};

export const DOR_CONST_CLASS_LABELS = {
  '1': 'Fireproof steel',
  '2': 'Reinforced concrete',
  '3': 'CBS / Masonry',
  '4': 'Wood frame',
  '5': 'Steel frame'
};

/**
 * Builds a normalized YYYY-MM sale month key so county sales (stored as YYYY-MM-01
 * or sale_year + sale_month) and MLS exact closing dates (YYYY-MM-DD) resolve to
 * the exact same county sale in comp_details.
 */
export function buildSaleMonthKey(soldDateOrYear, saleMonth = null) {
  if (typeof soldDateOrYear === 'number' || (typeof soldDateOrYear === 'string' && /^\d{4}$/.test(soldDateOrYear.trim()))) {
    const yr = Number(soldDateOrYear);
    if (!Number.isFinite(yr) || yr < 1900) return '';
    const mo = saleMonth != null && Number(saleMonth) >= 1 && Number(saleMonth) <= 12
      ? String(Number(saleMonth)).padStart(2, '0')
      : '01';
    return `${yr}-${mo}`;
  }

  if (typeof soldDateOrYear === 'string' && soldDateOrYear.trim()) {
    const raw = soldDateOrYear.trim();
    const isoMatch = raw.match(/^(\d{4})-(\d{1,2})/);
    if (isoMatch) {
      const yr = Number(isoMatch[1]);
      const mo = Number(isoMatch[2]);
      if (yr >= 1900 && mo >= 1 && mo <= 12) {
        return `${yr}-${String(mo).padStart(2, '0')}`;
      }
    }
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      const yr = parsed.getUTCFullYear();
      const mo = parsed.getUTCMonth() + 1;
      return `${yr}-${String(mo).padStart(2, '0')}`;
    }
  }

  return '';
}

function parseNullableNumber(val, { integer = false, min = 0, max = 99999 } = {}) {
  if (val === undefined || val === null || val === '') return null;
  const cleaned = typeof val === 'string' ? val.replace(/,/g, '').trim() : val;
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return integer ? Math.round(n) : n;
}

function parseTriBoolean(val) {
  if (val === true || val === 'true' || val === 'yes' || val === 'Y' || val === '1' || val === 1) return true;
  if (val === false || val === 'false' || val === 'no' || val === 'N' || val === '0' || val === 0) return false;
  return null;
}

/**
 * Splits legacy decimal baths (e.g. 2.5 -> full_baths: 2, half_baths: 1) when explicit
 * full_baths / half_baths are not yet provided.
 */
export function splitBathsToFullAndHalf(bathsVal, explicitFull = null, explicitHalf = null) {
  const fullParsed = parseNullableNumber(explicitFull, { integer: true, min: 0, max: 30 });
  const halfParsed = parseNullableNumber(explicitHalf, { integer: true, min: 0, max: 20 });

  if (fullParsed != null || halfParsed != null) {
    const f = fullParsed ?? 0;
    const h = halfParsed ?? 0;
    return {
      full_baths: fullParsed != null ? fullParsed : (halfParsed != null ? 0 : null),
      half_baths: halfParsed != null ? halfParsed : 0,
      baths: Math.round((f + h * 0.5) * 10) / 10
    };
  }

  const total = parseNullableNumber(bathsVal, { integer: false, min: 0, max: 30 });
  if (total == null) {
    return { full_baths: null, half_baths: null, baths: null };
  }

  const full = Math.floor(total + 1e-6);
  const rem = total - full;
  const half = rem >= 0.25 ? 1 : 0;
  return {
    full_baths: full,
    half_baths: half,
    baths: Math.round((full + half * 0.5) * 10) / 10
  };
}

/**
 * Normalizes a raw details object or comp entity into the canonical Comp/Subject Details shape.
 * Never infers impact windows or roof age from year_built.
 */
export function normalizeCompDetails(raw = {}, { treatLegacyUneditedCountyBooleansAsUnknown = false } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const nested = src.comp_details_json && typeof src.comp_details_json === 'object'
    ? src.comp_details_json
    : (src.comp_details && typeof src.comp_details === 'object' ? src.comp_details : {});

  const pick = (key) => (nested[key] !== undefined ? nested[key] : src[key]);

  // Detect old county-added comps before comp_details existed where pool/garage/waterfront
  // defaulted to false because of Boolean(undefined) even though nothing was filled in.
  const hasExplicitNestedDetails = Object.keys(nested).length > 0;
  const isUneditedCountyRow =
    treatLegacyUneditedCountyBooleansAsUnknown &&
    !hasExplicitNestedDetails &&
    src.source === 'Property appraiser' &&
    (!src.condition || src.condition === 'unknown') &&
    src.beds == null &&
    src.baths == null &&
    src.pool === false &&
    src.garage === false &&
    src.waterfront === false;

  const beds = parseNullableNumber(pick('beds'), { integer: false, min: 0, max: 30 });
  const bathSplit = splitBathsToFullAndHalf(
    pick('baths'),
    pick('full_baths'),
    pick('half_baths')
  );

  const condition = normalizeConditionKey(pick('condition'));
  const kitchen_baths_updated = parseTriBoolean(pick('kitchen_baths_updated'));

  const rawRoofType = String(pick('roof_type') || 'unknown').trim().toLowerCase();
  const roof_type = ['shingle', 'barrel_tile', 'metal', 'flat'].includes(rawRoofType)
    ? rawRoofType
    : 'unknown';
  const roof_year = parseNullableNumber(pick('roof_year'), { integer: true, min: 1900, max: 2100 });

  // Windows: never infer from year_built
  let windows = String(pick('windows') || '').trim().toLowerCase();
  if (!['impact', 'shutters', 'none'].includes(windows)) {
    if (src.impact_windows === true) windows = 'impact';
    else if (src.impact_windows === false) windows = 'none';
    else windows = 'unknown';
  }

  // Pool
  let pool_type = String(pick('pool_type') || '').trim().toLowerCase();
  if (!['none', 'standard', 'resort'].includes(pool_type)) {
    if (!isUneditedCountyRow && src.pool === true) pool_type = 'standard';
    else if (!isUneditedCountyRow && src.pool === false) pool_type = 'none';
    else pool_type = 'unknown';
  }
  const screen_enclosure = parseTriBoolean(pick('screen_enclosure'));

  // Garage
  let garage_type = String(pick('garage_type') || '').trim().toLowerCase();
  let garage_bays = parseNullableNumber(pick('garage_bays'), { integer: true, min: 0, max: 10 });

  if (!['garage', 'carport', 'converted', 'none'].includes(garage_type)) {
    if (garage_bays != null) {
      garage_type = garage_bays > 0 ? 'garage' : 'none';
    } else if (typeof src.garage === 'number') {
      garage_bays = Math.max(0, Math.round(src.garage));
      garage_type = garage_bays > 0 ? 'garage' : 'none';
    } else if (!isUneditedCountyRow && src.garage === true) {
      garage_type = 'garage';
      garage_bays = 2;
    } else if (!isUneditedCountyRow && src.garage === false) {
      garage_type = 'none';
      garage_bays = 0;
    } else {
      garage_type = 'unknown';
      garage_bays = null;
    }
  } else if (garage_type === 'garage' && garage_bays == null) {
    garage_bays = 2;
  } else if (garage_type !== 'garage') {
    garage_bays = garage_type === 'none' ? 0 : (garage_bays ?? 0);
  }

  // Waterfront & view
  let waterfront_view = String(pick('waterfront_view') || '').trim().toLowerCase();
  if (!['dry_lot', 'lake', 'golf', 'canal_fixed_bridge', 'ocean_access'].includes(waterfront_view)) {
    if (!isUneditedCountyRow && src.waterfront === true) waterfront_view = 'canal_fixed_bridge';
    else if (!isUneditedCountyRow && src.waterfront === false) waterfront_view = 'dry_lot';
    else waterfront_view = 'unknown';
  }

  const rawNotes = pick('notes');
  const notes = rawNotes != null && String(rawNotes).trim() !== '' ? String(rawNotes).trim() : '';

  const rawSource = pick('detail_source') ?? pick('source');
  const sourceStr = rawSource != null ? String(rawSource).trim() : '';
  const allowedSources = new Set(['MLS', 'listing_photos', 'agent', 'drive_by', 'county_hint']);
  const source = allowedSources.has(sourceStr) ? sourceStr : (sourceStr || '');

  const verifiedBool = parseTriBoolean(pick('verified'));
  const verified = verifiedBool === true;

  return {
    beds,
    full_baths: bathSplit.full_baths,
    half_baths: bathSplit.half_baths,
    baths: bathSplit.baths,
    condition,
    kitchen_baths_updated,
    roof_type,
    roof_year,
    windows,
    pool_type,
    screen_enclosure,
    garage_type,
    garage_bays,
    waterfront_view,
    notes,
    source,
    verified
  };
}

/**
 * Converts normalized details back into legacy top-level columns + comp_details_json
 * so investor_comps and investor_properties stay 100% consistent everywhere.
 */
export function detailsToLegacyColumns(details = {}) {
  const norm = normalizeCompDetails(details);

  const poolBool =
    norm.pool_type === 'standard' || norm.pool_type === 'resort'
      ? true
      : norm.pool_type === 'none'
        ? false
        : null;

  const garageBool =
    norm.garage_type === 'garage' && (norm.garage_bays ?? 0) > 0
      ? true
      : norm.garage_type === 'none' || norm.garage_type === 'carport' || norm.garage_type === 'converted'
        ? false
        : null;

  const waterfrontBool =
    ['lake', 'canal_fixed_bridge', 'ocean_access'].includes(norm.waterfront_view)
      ? true
      : ['dry_lot', 'golf'].includes(norm.waterfront_view)
        ? false
        : null;

  return {
    beds: norm.beds,
    baths: norm.baths,
    condition: norm.condition,
    roof_year: norm.roof_year,
    pool: poolBool,
    garage: garageBool,
    waterfront: waterfrontBool,
    comp_details_json: norm
  };
}

/**
 * Computes the 9-field completeness progress ("Details: 6 of 9 filled"):
 * 1. Beds
 * 2. Baths (full / half)
 * 3. Condition (UAD)
 * 4. Kitchen & baths updated (Y/N)
 * 5. Roof (type or roof year)
 * 6. Windows (impact / shutters / none)
 * 7. Pool (none / standard / resort)
 * 8. Garage (bays / carport / converted / none)
 * 9. Waterfront & view (dry lot / lake / golf / canal / ocean access)
 */
export function computeDetailsProgress(rawDetails = {}, options = {}) {
  const d = normalizeCompDetails(rawDetails, options);

  const checks = [
    { key: 'beds', label: 'Beds', filled: d.beds != null },
    { key: 'baths', label: 'Baths', filled: d.full_baths != null || d.baths != null },
    { key: 'condition', label: 'Condition', filled: d.condition !== 'unknown' },
    { key: 'kitchen_baths', label: 'Kitchen & baths', filled: typeof d.kitchen_baths_updated === 'boolean' },
    { key: 'roof', label: 'Roof', filled: d.roof_type !== 'unknown' || d.roof_year != null },
    { key: 'windows', label: 'Windows', filled: d.windows !== 'unknown' },
    { key: 'pool', label: 'Pool', filled: d.pool_type !== 'unknown' },
    { key: 'garage', label: 'Garage', filled: d.garage_type !== 'unknown' },
    { key: 'waterfront_view', label: 'Waterfront & view', filled: d.waterfront_view !== 'unknown' }
  ];

  const filledCount = checks.filter((c) => c.filled).length;
  const totalCount = 9;
  const missingLabels = checks.filter((c) => !c.filled).map((c) => c.label);

  return {
    filledCount,
    totalCount,
    pct: Math.round((filledCount / totalCount) * 100),
    label: `Details: ${filledCount} of ${totalCount} filled`,
    missingLabels,
    isComplete: filledCount === totalCount
  };
}

/**
 * Formats DOR NAL county clues from a county_parcels record:
 * - "Likely renovated" when eff_year_built - year_built >= 15 (showing both years)
 * - "Extra features $X" when spec_feat_val > 0, "No extra features" when 0
 * - Units count (e.g. "1 unit" / "2 units")
 * - Improvement quality & construction class labels when available
 *
 * Strictly treated as hints to pre-fill suggestions — NOT confirmed facts.
 */
export function formatCountyClues(parcel = {}) {
  if (!parcel || typeof parcel !== 'object') {
    return {
      hasAnyClue: false,
      yearBuilt: null,
      effYearBuilt: null,
      likelyRenovated: false,
      likelyRenovatedLabel: null,
      specFeatVal: null,
      extraFeaturesLabel: null,
      units: null,
      unitsLabel: null,
      impQualCode: null,
      impQualLabel: null,
      constClassCode: null,
      constClassLabel: null,
      beds: null,
      full_baths: null,
      half_baths: null
    };
  }

  const yb = parcel.year_built != null && Number(parcel.year_built) > 1800 ? Number(parcel.year_built) : null;
  const eff = parcel.eff_year_built != null && Number(parcel.eff_year_built) > 1800 ? Number(parcel.eff_year_built) : null;
  const likelyRenovated = yb != null && eff != null && (eff - yb) >= 15;
  const likelyRenovatedLabel = likelyRenovated
    ? `Likely renovated (built ${yb} · eff. ${eff})`
    : null;

  const rawSpec = parcel.spec_feat_val;
  const specFeatVal = rawSpec !== undefined && rawSpec !== null && rawSpec !== '' && !isNaN(Number(rawSpec))
    ? Math.max(0, Math.round(Number(rawSpec)))
    : null;

  let extraFeaturesLabel = null;
  if (specFeatVal != null) {
    extraFeaturesLabel = specFeatVal > 0
      ? `Extra features $${specFeatVal.toLocaleString('en-US')}`
      : 'No extra features';
  }

  const units = parcel.units != null && Number(parcel.units) > 0 ? Math.round(Number(parcel.units)) : null;
  const unitsLabel = units != null ? `${units} ${units === 1 ? 'unit' : 'units'}` : null;

  const impQualCode = parcel.imp_qual != null && String(parcel.imp_qual).trim() !== ''
    ? String(parcel.imp_qual).trim()
    : null;
  const impQualLabel = impQualCode ? (DOR_IMP_QUAL_LABELS[impQualCode] || `Quality ${impQualCode}`) : null;

  const constClassCode = parcel.const_class != null && String(parcel.const_class).trim() !== ''
    ? String(parcel.const_class).trim()
    : null;
  const constClassLabel = constClassCode ? (DOR_CONST_CLASS_LABELS[constClassCode] || `Class ${constClassCode}`) : null;

  const beds = parcel.beds != null && !isNaN(Number(parcel.beds)) ? Number(parcel.beds) : null;
  const full_baths = parcel.full_baths != null && !isNaN(Number(parcel.full_baths)) ? Math.round(Number(parcel.full_baths)) : null;
  const half_baths = parcel.half_baths != null && !isNaN(Number(parcel.half_baths)) ? Math.round(Number(parcel.half_baths)) : null;

  const hasAnyClue = Boolean(
    likelyRenovatedLabel ||
    extraFeaturesLabel ||
    unitsLabel ||
    impQualLabel ||
    constClassLabel ||
    beds != null ||
    full_baths != null
  );

  return {
    hasAnyClue,
    yearBuilt: yb,
    effYearBuilt: eff,
    likelyRenovated,
    likelyRenovatedLabel,
    specFeatVal,
    extraFeaturesLabel,
    units,
    unitsLabel,
    impQualCode,
    impQualLabel,
    constClassCode,
    constClassLabel,
    beds,
    full_baths,
    half_baths
  };
}

/**
 * Produces non-binding draft field suggestions from county clues ONLY for the editor UI
 * when a field has not been filled yet. Always sets source='county_hint' and verified=false.
 */
export function buildCountyHintSuggestions(currentDetails = {}, countyClues = {}) {
  const norm = normalizeCompDetails(currentDetails);
  const suggestions = {};
  const appliedHints = [];

  if (countyClues?.likelyRenovated && norm.condition === 'unknown') {
    suggestions.condition = 'c3';
    appliedHints.push({
      field: 'condition',
      label: `Condition → Updated (C3) from ${countyClues.likelyRenovatedLabel}`
    });
  }

  if (countyClues?.specFeatVal === 0 && norm.pool_type === 'unknown') {
    suggestions.pool_type = 'none';
    appliedHints.push({
      field: 'pool_type',
      label: 'Pool → None (county roll shows $0 extra features)'
    });
  }

  // County public records beds/baths if imported later via import-building-chars.mjs
  if (countyClues?.beds != null && norm.beds == null) {
    suggestions.beds = Number(countyClues.beds);
    appliedHints.push({
      field: 'beds',
      label: `Beds → ${countyClues.beds} from county building file`
    });
  }
  if ((countyClues?.full_baths != null || countyClues?.half_baths != null) && norm.full_baths == null) {
    suggestions.full_baths = countyClues.full_baths != null ? Number(countyClues.full_baths) : 0;
    suggestions.half_baths = countyClues.half_baths != null ? Number(countyClues.half_baths) : 0;
    appliedHints.push({
      field: 'baths',
      label: `Baths → ${suggestions.full_baths} full / ${suggestions.half_baths} half from county building file`
    });
  }

  if (appliedHints.length > 0) {
    suggestions.source = norm.source || 'county_hint';
    suggestions.verified = false;
  }

  return {
    suggestions,
    appliedHints
  };
}

/**
 * Merges a saved comp_details table row onto a comp object so comps filled once
 * are pre-filled on every property and appraisal that uses that county sale.
 */
export function mergeCompWithSavedDetails(comp = {}, savedRow = null, countyParcel = null) {
  const cluesSource = {
    year_built: countyParcel?.year_built ?? comp.year_built ?? null,
    eff_year_built: countyParcel?.eff_year_built ?? comp.eff_year_built ?? null,
    spec_feat_val: countyParcel?.spec_feat_val ?? comp.spec_feat_val ?? null,
    units: countyParcel?.units ?? comp.units ?? null,
    imp_qual: countyParcel?.imp_qual ?? comp.imp_qual ?? null,
    const_class: countyParcel?.const_class ?? comp.const_class ?? null,
    beds: countyParcel?.beds ?? null,
    full_baths: countyParcel?.full_baths ?? null,
    half_baths: countyParcel?.half_baths ?? null
  };

  const county_clues = formatCountyClues(cluesSource);

  let normalizedDetails;
  if (savedRow && typeof savedRow === 'object') {
    normalizedDetails = normalizeCompDetails({
      ...comp,
      comp_details_json: {
        ...(comp.comp_details_json || {}),
        beds: savedRow.beds ?? comp.beds,
        full_baths: savedRow.full_baths,
        half_baths: savedRow.half_baths,
        condition: savedRow.condition ?? comp.condition,
        kitchen_baths_updated: savedRow.kitchen_baths_updated,
        roof_type: savedRow.roof_type,
        roof_year: savedRow.roof_year,
        windows: savedRow.windows,
        pool_type: savedRow.pool_type,
        screen_enclosure: savedRow.screen_enclosure,
        garage_type: savedRow.garage_type,
        garage_bays: savedRow.garage_bays,
        waterfront_view: savedRow.waterfront_view,
        notes: savedRow.notes ?? comp.notes,
        source: savedRow.source ?? comp.source,
        verified: savedRow.verified
      }
    });
  } else {
    normalizedDetails = normalizeCompDetails(comp, {
      treatLegacyUneditedCountyBooleansAsUnknown: true
    });
  }

  const legacyCols = detailsToLegacyColumns(normalizedDetails);
  const progress = computeDetailsProgress(normalizedDetails);

  return {
    ...comp,
    ...legacyCols,
    notes: normalizedDetails.notes || comp.notes || null,
    eff_year_built: cluesSource.eff_year_built,
    spec_feat_val: cluesSource.spec_feat_val,
    units: cluesSource.units,
    imp_qual: cluesSource.imp_qual,
    const_class: cluesSource.const_class,
    county_clues,
    details_progress: progress
  };
}

/**
 * Resolves Subject property details for a given mode ('as_is' | 'arv').
 * Falls back cleanly to top-level property fields when subject_details hasn't been customized yet.
 */
export function resolveSubjectDetailsForMode(subject = {}, mode = 'as_is') {
  const subjectDetailsObj = subject?.subject_details && typeof subject.subject_details === 'object'
    ? subject.subject_details
    : {};

  const asIsRaw = subjectDetailsObj.as_is && typeof subjectDetailsObj.as_is === 'object'
    ? subjectDetailsObj.as_is
    : null;
  const afterRehabRaw = subjectDetailsObj.after_rehab && typeof subjectDetailsObj.after_rehab === 'object'
    ? subjectDetailsObj.after_rehab
    : null;

  const liveOverrides = subject?.appraisal_overrides && typeof subject.appraisal_overrides === 'object'
    ? subject.appraisal_overrides
    : {};

  // Base fallback from top-level subject columns
  const baseAsIs = normalizeCompDetails({
    beds: subject?.beds,
    baths: subject?.baths,
    full_baths: subject?.full_baths,
    half_baths: subject?.half_baths,
    condition: subject?.condition || 'c4',
    roof_year: subject?.roof_year,
    roof_type: subject?.roof_type,
    windows: subject?.windows ?? (subject?.impact_windows === true ? 'impact' : subject?.impact_windows === false ? 'none' : 'unknown'),
    pool: subject?.pool,
    pool_type: subject?.pool_type,
    screen_enclosure: subject?.screen_enclosure,
    garage: subject?.garage,
    garage_type: subject?.garage_type,
    garage_bays: subject?.garage_bays,
    waterfront: subject?.waterfront,
    waterfront_view: subject?.waterfront_view,
    notes: subject?.notes,
    ...(asIsRaw || {}),
    ...(mode !== 'arv' ? liveOverrides : {})
  });

  if (mode !== 'arv') {
    return baseAsIs;
  }

  // For ARV ('after_rehab'): inherit physical layout from as_is unless overridden in after_rehab,
  // and default target condition to Fully renovated (C2) unless user picked another target condition.
  if (afterRehabRaw && Object.keys(afterRehabRaw).length > 0) {
    return normalizeCompDetails({
      ...baseAsIs,
      ...afterRehabRaw,
      ...liveOverrides,
      condition: (liveOverrides.condition || afterRehabRaw.condition) && (liveOverrides.condition || afterRehabRaw.condition) !== 'unknown'
        ? (liveOverrides.condition || afterRehabRaw.condition)
        : 'c2'
    });
  }

  return normalizeCompDetails({
    ...baseAsIs,
    condition: 'c2',
    kitchen_baths_updated: baseAsIs.kitchen_baths_updated ?? true,
    ...liveOverrides
  });
}
