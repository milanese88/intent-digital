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
 * - 10-field completeness progress ("Details: X of 10 filled") matching every editor field in order.
 * - Normalized county sale key (county + folio + YYYY-MM) so comp details filled once
 *   pre-fill across every property and appraisal using that county sale.
 */

import {
  formatQualityWithRawCode,
  buildCountyCodeTooltip
} from '../../utils/camaBuildingMapper.js';

export { formatQualityWithRawCode, buildCountyCodeTooltip };

export const FIELD_ORIGIN_LABELS = {
  my_edit: 'my edit',
  county_record: 'county record',
  county_default: 'county default (not inspected)'
};

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

export const UAD_QUALITY_OPTIONS = [
  {
    id: 'q1',
    uad: 'Q1',
    label: 'Q1 · Estate / Unique Custom',
    shortLabel: 'Estate (Q1)',
    rank: 5,
    description: 'Unique custom architectural design & museum-grade finishes'
  },
  {
    id: 'q2',
    uad: 'Q2',
    label: 'Q2 · High-End Custom',
    shortLabel: 'Custom (Q2)',
    rank: 4,
    description: 'High-grade custom or semi-custom construction & millwork'
  },
  {
    id: 'q3',
    uad: 'Q3',
    label: 'Q3 · Above Average',
    shortLabel: 'Above avg (Q3)',
    rank: 3,
    description: 'Upgraded semi-custom or higher-tier production finishes'
  },
  {
    id: 'q4',
    uad: 'Q4',
    label: 'Q4 · Average / Standard',
    shortLabel: 'Average (Q4)',
    rank: 2,
    description: 'Standard residential subdivision construction & finishes'
  },
  {
    id: 'q5',
    uad: 'Q5',
    label: 'Q5 · Economy / Basic',
    shortLabel: 'Basic (Q5)',
    rank: 1,
    description: 'Economy construction with basic stock materials'
  },
  {
    id: 'q6',
    uad: 'Q6',
    label: 'Q6 · Minimal / Low Cost',
    shortLabel: 'Minimal (Q6)',
    rank: 0,
    description: 'Minimal basic build quality'
  },
  {
    id: 'unknown',
    uad: null,
    label: 'Unknown',
    shortLabel: 'Unknown',
    rank: null,
    description: 'Quality rating not yet verified'
  }
];

export function normalizeQualityKey(raw) {
  if (raw == null || raw === '') return 'unknown';
  const k = String(raw).trim().toLowerCase();
  if (k === 'unknown') return 'unknown';
  if (k === 'q1' || k === 'estate') return 'q1';
  if (k === 'q2' || k === 'custom') return 'q2';
  if (k === 'q3' || k === 'above_average' || k === 'above average') return 'q3';
  if (k === 'q4' || k === 'average' || k === 'standard') return 'q4';
  if (k === 'q5' || k === 'economy' || k === 'basic') return 'q5';
  if (k === 'q6' || k === 'minimal' || k === 'low') return 'q6';
  return 'unknown';
}

export function getUadQualityMeta(raw) {
  const canonical = normalizeQualityKey(raw);
  return UAD_QUALITY_OPTIONS.find((opt) => opt.id === canonical) || UAD_QUALITY_OPTIONS[6];
}

/**
 * Maps FDOR NAL IMP_QUAL (1=Minimum .. 6=Superior) to a suggested UAD Q1–Q6 rating.
 * Used strictly as a county roll hint — never silently assumed as confirmed fact.
 */
export function mapImpQualToUadQuality(impQual) {
  const code = impQual != null ? String(impQual).trim() : '';
  if (code === '6') return 'q1';
  if (code === '5') return 'q2';
  if (code === '4') return 'q3';
  if (code === '3') return 'q4';
  if (code === '2') return 'q5';
  if (code === '1') return 'q6';
  return 'unknown';
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

export const CONSTRUCTION_TYPE_OPTIONS = [
  { id: 'cbs', label: 'CBS / Masonry' },
  { id: 'wood_frame', label: 'Wood frame' },
  { id: 'other', label: 'Other' },
  { id: 'unknown', label: 'Unknown' }
];

export function normalizeConstructionType(raw) {
  if (raw == null) return 'unknown';
  const s = String(raw).trim().toLowerCase();
  if (!s || s === 'unknown') return 'unknown';
  if (s === 'cbs' || s.includes('cbs') || s.includes('masonry') || s.includes('concrete') || s === 'block') return 'cbs';
  if (s === 'wood_frame' || s === 'wood' || s.includes('wood') || s.includes('frame') || s.includes('hardi')) return 'wood_frame';
  if (s === 'other' || s.includes('steel') || s.includes('metal') || s.includes('manufactured')) return 'other';
  return 'unknown';
}

export function mapConstClassToConstructionType(constClass) {
  const code = constClass != null ? String(constClass).trim() : '';
  if (code === '2' || code === '3') return 'cbs';
  if (code === '4') return 'wood_frame';
  if (code === '1' || code === '5') return 'other';
  return 'unknown';
}

export function formatConstructionTypeLabel(constructionType) {
  const key = normalizeConstructionType(constructionType);
  const found = CONSTRUCTION_TYPE_OPTIONS.find((o) => o.id === key);
  return found ? found.label : 'Unknown';
}

export function formatBoatDockLabel(details = {}) {
  const hasDock = details?.boat_dock;
  const hasLift = details?.boat_lift;
  const dockSqft = details?.boat_dock_sqft != null && Number(details.boat_dock_sqft) > 0
    ? Math.round(Number(details.boat_dock_sqft))
    : null;
  if (hasDock === true) {
    const base = dockSqft ? `Boat dock (${dockSqft.toLocaleString()} sf)` : 'Boat dock';
    return hasLift === true ? `${base} · Lift` : base;
  }
  if (hasDock === false) return 'No dock';
  if (hasLift === true) return 'Boat lift';
  return null;
}

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

function unwrapJsonObj(val) {
  let cur = val;
  for (let i = 0; i < 4 && typeof cur === 'string'; i++) {
    const trimmed = cur.trim();
    if (!trimmed) return {};
    try {
      cur = JSON.parse(trimmed);
    } catch {
      return {};
    }
  }
  return cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : {};
}

/**
 * Normalizes a raw details object or comp entity into the canonical Comp/Subject Details shape.
 * Never infers impact windows or roof age from year_built.
 */
export function normalizeCompDetails(raw = {}, { treatLegacyUneditedCountyBooleansAsUnknown = false } = {}) {
  const src = raw && typeof raw === 'object' ? raw : unwrapJsonObj(raw);
  const parsedNested = unwrapJsonObj(src.comp_details_json);
  const nested = Object.keys(parsedNested).length > 0
    ? parsedNested
    : unwrapJsonObj(src.comp_details);

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
  const quality = normalizeQualityKey(pick('quality'));
  const kitchen_baths_updated = parseTriBoolean(pick('kitchen_baths_updated'));
  const eff_year_built = parseNullableNumber(pick('eff_year_built'), { integer: true, min: 1850, max: 2100 });

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
  const rawScreenEnclosure = parseTriBoolean(pick('screen_enclosure'));
  const screen_enclosure = pool_type === 'none' && rawScreenEnclosure === null
    ? false
    : rawScreenEnclosure;

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

  // Boat dock (Y/N + optional sf) & boat lift (Y/N/unknown)
  const rawBoatDock = parseTriBoolean(pick('boat_dock'));
  const rawBoatLift = parseTriBoolean(pick('boat_lift'));
  const rawBoatDockSqft = parseNullableNumber(pick('boat_dock_sqft'), { integer: true, min: 0, max: 50000 });
  const boat_dock = rawBoatDock !== null
    ? rawBoatDock
    : ((rawBoatDockSqft != null && rawBoatDockSqft > 0) || rawBoatLift === true ? true : null);
  const boat_dock_sqft = boat_dock === false ? null : (rawBoatDockSqft != null && rawBoatDockSqft > 0 ? rawBoatDockSqft : null);
  const boat_lift = boat_dock === false ? false : rawBoatLift;

  // Construction (CBS / wood frame / other / unknown) + optional county detail label (e.g. "Wood frame / Hardi-plank")
  const rawConstructionDetail = pick('construction_detail');
  const construction_detail = rawConstructionDetail != null && String(rawConstructionDetail).trim() !== ''
    ? String(rawConstructionDetail).trim().slice(0, 140)
    : '';
  let construction_type = normalizeConstructionType(pick('construction_type'));
  if (construction_type === 'unknown' && construction_detail) {
    const inferredFromDetail = normalizeConstructionType(construction_detail);
    if (inferredFromDetail !== 'unknown') {
      construction_type = inferredFromDetail;
    }
  }

  const rawSketchAreas = pick('sketch_areas');
  const sketch_areas = rawSketchAreas != null && String(rawSketchAreas).trim() !== ''
    ? String(rawSketchAreas).trim().slice(0, 400)
    : '';

  const rawRecentImprovements = pick('recent_improvements');
  const recent_improvements = rawRecentImprovements != null && String(rawRecentImprovements).trim() !== ''
    ? String(rawRecentImprovements).trim().slice(0, 600)
    : '';

  const rawNotes = pick('notes');
  const notes = rawNotes != null && String(rawNotes).trim() !== '' ? String(rawNotes).trim() : '';

  const rawHoaName = pick('hoa_name');
  const hoa_name = rawHoaName != null && String(rawHoaName).trim() !== '' ? String(rawHoaName).trim() : '';

  const rawSource = pick('detail_source') ?? pick('source');
  const sourceStr = rawSource != null ? String(rawSource).trim() : '';
  const allowedSources = new Set(['MLS', 'listing_photos', 'agent', 'drive_by', 'county_hint']);
  const source = allowedSources.has(sourceStr) ? sourceStr : (sourceStr || '');

  const verifiedBool = parseTriBoolean(pick('verified'));
  const verified = verifiedBool === true;

  const rawManualFields = pick('manual_fields');
  const manual_fields =
    rawManualFields && typeof rawManualFields === 'object' && !Array.isArray(rawManualFields)
      ? Object.fromEntries(
          Object.entries(rawManualFields)
            .filter(([k, v]) => typeof k === 'string' && v === true)
            .map(([k]) => [k, true])
        )
      : null;

  return {
    beds,
    full_baths: bathSplit.full_baths,
    half_baths: bathSplit.half_baths,
    baths: bathSplit.baths,
    condition,
    quality,
    eff_year_built,
    kitchen_baths_updated,
    roof_type,
    roof_year,
    windows,
    pool_type,
    screen_enclosure,
    garage_type,
    garage_bays,
    waterfront_view,
    boat_dock,
    boat_dock_sqft,
    boat_lift,
    construction_type,
    construction_detail,
    sketch_areas,
    recent_improvements,
    hoa_name,
    notes,
    source,
    verified,
    ...(manual_fields ? { manual_fields } : {})
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
    quality: norm.quality !== 'unknown' ? norm.quality : null,
    roof_year: norm.roof_year,
    pool: poolBool,
    garage: garageBool,
    waterfront: waterfrontBool,
    boat_dock: norm.boat_dock,
    boat_dock_sqft: norm.boat_dock_sqft,
    boat_lift: norm.boat_lift,
    construction_type: norm.construction_type !== 'unknown' ? norm.construction_type : null,
    construction_detail: norm.construction_detail || null,
    hoa_name: norm.hoa_name || null,
    comp_details_json: norm
  };
}

/**
 * Computes the 10-field completeness progress ("Details: X of 10 filled") matching
 * every field on the Comp / Subject Details Editor in top-to-bottom form order:
 * 1. Beds
 * 2. Baths (full / half)
 * 3. Condition (UAD)
 * 4. Kitchen & baths updated (Y/N)
 * 5. Roof type
 * 6. Roof year
 * 7. Windows (impact / shutters / none)
 * 8. Pool (none, or standard/resort + screen enclosure Y/N)
 * 9. Garage (bays / carport / converted / none)
 * 10. Waterfront & view (dry lot / lake / golf / canal / ocean access)
 */
export function computeDetailsProgress(rawDetails = {}, options = {}) {
  const d = normalizeCompDetails(rawDetails, options);

  const poolFilled = d.pool_type === 'none'
    ? true
    : (d.pool_type !== 'unknown' && typeof d.screen_enclosure === 'boolean');
  const poolLabel = d.pool_type === 'unknown' ? 'Pool' : 'Screen enclosure';

  const checks = [
    { key: 'beds', label: 'Beds', filled: d.beds != null },
    { key: 'baths', label: 'Baths', filled: d.full_baths != null || d.baths != null },
    { key: 'condition', label: 'Condition', filled: d.condition !== 'unknown' },
    { key: 'kitchen_baths', label: 'Kitchen & baths', filled: typeof d.kitchen_baths_updated === 'boolean' },
    { key: 'roof_type', label: 'Roof type', filled: d.roof_type !== 'unknown' },
    { key: 'roof_year', label: 'Roof year', filled: d.roof_year != null },
    { key: 'windows', label: 'Windows', filled: d.windows !== 'unknown' },
    { key: 'pool', label: poolLabel, filled: poolFilled },
    { key: 'garage', label: 'Garage', filled: d.garage_type !== 'unknown' },
    { key: 'waterfront_view', label: 'Waterfront & view', filled: d.waterfront_view !== 'unknown' }
  ];

  const filledCount = checks.filter((c) => c.filled).length;
  const totalCount = checks.length;
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

  if (countyClues?.constClassCode && norm.construction_type === 'unknown') {
    const mappedConst = mapConstClassToConstructionType(countyClues.constClassCode);
    if (mappedConst !== 'unknown') {
      suggestions.construction_type = mappedConst;
      appliedHints.push({
        field: 'construction_type',
        label: `Construction → ${formatConstructionTypeLabel(mappedConst)} from county roll (${countyClues.constClassLabel || countyClues.constClassCode})`
      });
    }
  }

  if (countyClues?.impQualCode && norm.quality === 'unknown') {
    const mappedQual = mapImpQualToUadQuality(countyClues.impQualCode);
    if (mappedQual !== 'unknown') {
      suggestions.quality = mappedQual;
      appliedHints.push({
        field: 'quality',
        label: `Quality → ${getUadQualityMeta(mappedQual).shortLabel} from county roll (${countyClues.impQualLabel || countyClues.impQualCode})`
      });
    }
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
 * Converts a building_characteristics county CAMA row into structured auto-fill defaults
 * plus preserved metadata (raw quality/condition codes, condition_is_default, living/total area, etc.).
 *
 * CRITICAL RULE:
 * When condition_is_default === true (e.g. Palm Beach 'AV' on 99% of rows), condition is NOT
 * included in active auto-fill values — it stays 'unknown' until manually confirmed so an
 * uninspected county default never creates appraisal grid condition adjustments.
 */
export function buildingRecordToCountyDefaults(bcRow = null) {
  if (!bcRow || typeof bcRow !== 'object') {
    return { values: {}, meta: null };
  }

  const beds = parseNullableNumber(bcRow.beds, { integer: false, min: 0.5, max: 30 });
  const fullBaths = parseNullableNumber(bcRow.full_baths, { integer: true, min: 0, max: 30 });
  const halfBaths = parseNullableNumber(bcRow.half_baths, { integer: true, min: 0, max: 20 });
  const hasBaths = fullBaths != null || (halfBaths != null && halfBaths > 0);
  const effYear = parseNullableNumber(bcRow.effective_year_built, { integer: true, min: 1850, max: 2100 });
  const yearBuilt = parseNullableNumber(bcRow.year_built, { integer: true, min: 1850, max: 2100 });

  const qualityUad = normalizeQualityKey(bcRow.quality_uad);
  const conditionUad = normalizeConditionKey(bcRow.condition_uad);
  const conditionIsDefault = Boolean(bcRow.condition_is_default);

  const constType = normalizeConstructionType(bcRow.construction_type);
  const constDetail = bcRow.exterior_wall_desc ? String(bcRow.exterior_wall_desc).trim() : '';

  const rawRoof = String(bcRow.roof_type || '').trim().toLowerCase();
  const roofType = ['shingle', 'barrel_tile', 'metal', 'flat'].includes(rawRoof) ? rawRoof : 'unknown';

  const rawPool = String(bcRow.pool_type || '').trim().toLowerCase();
  const poolType = ['standard', 'resort'].includes(rawPool) ? rawPool : 'unknown';
  const screenEnclosure = bcRow.screen_enclosure === true ? true : null;

  const rawGar = String(bcRow.garage_type || '').trim().toLowerCase();
  const garageType = ['garage', 'carport'].includes(rawGar) ? rawGar : 'unknown';
  const garageBays = parseNullableNumber(bcRow.garage_bays, { integer: true, min: 0, max: 10 });

  const rawView = String(bcRow.waterfront_view || '').trim().toLowerCase();
  const waterfrontView = ['dry_lot', 'lake', 'golf', 'canal_fixed_bridge', 'ocean_access'].includes(rawView)
    ? rawView
    : 'unknown';

  const boatDock = bcRow.boat_dock === true ? true : null;
  const boatDockSqft = boatDock === true
    ? parseNullableNumber(bcRow.boat_dock_sqft, { integer: true, min: 1, max: 50000 })
    : null;
  const boatLift = bcRow.boat_lift === true ? true : null;

  const livingSqft = parseNullableNumber(bcRow.living_area_sqft, { integer: true, min: 1, max: 500000 });
  const totalSqft = parseNullableNumber(bcRow.total_area_sqft, { integer: true, min: 1, max: 500000 });
  const nonLivingSqft = parseNullableNumber(bcRow.non_living_area_sqft, { integer: true, min: 0, max: 500000 });

  const values = {};
  if (beds != null) values.beds = beds;
  if (hasBaths) {
    values.full_baths = fullBaths ?? 0;
    values.half_baths = halfBaths ?? 0;
  }
  if (effYear != null) values.eff_year_built = effYear;
  if (qualityUad !== 'unknown') values.quality = qualityUad;
  // ONLY real condition signals (GD/VG/EX/FR/PR/VP/UN) auto-fill condition; NEVER uninspected AV default!
  if (conditionUad !== 'unknown' && !conditionIsDefault) {
    values.condition = conditionUad;
  }
  if (constType !== 'unknown') values.construction_type = constType;
  if (constDetail) values.construction_detail = constDetail;
  if (roofType !== 'unknown') values.roof_type = roofType;
  if (poolType !== 'unknown') values.pool_type = poolType;
  if (screenEnclosure === true) values.screen_enclosure = true;
  if (garageType !== 'unknown') {
    values.garage_type = garageType;
    if (garageBays != null) values.garage_bays = garageBays;
  }
  if (waterfrontView !== 'unknown') values.waterfront_view = waterfrontView;
  if (boatDock === true) {
    values.boat_dock = true;
    if (boatDockSqft != null) values.boat_dock_sqft = boatDockSqft;
  }
  if (boatLift === true) {
    values.boat_lift = true;
    values.boat_dock = true;
  }

  const meta = {
    source: bcRow.source || 'county_cama',
    roll_year: bcRow.roll_year != null ? Number(bcRow.roll_year) : null,
    property_class: bcRow.property_class || null,
    building_count: bcRow.building_count != null ? Number(bcRow.building_count) : 1,
    stories: bcRow.stories != null && !isNaN(Number(bcRow.stories)) ? Number(bcRow.stories) : null,
    year_built: yearBuilt,
    effective_year_built: effYear,
    living_area_sqft: livingSqft,
    total_area_sqft: totalSqft,
    non_living_area_sqft: nonLivingSqft,
    raw_quality_code: bcRow.raw_quality_code ? String(bcRow.raw_quality_code).trim().toUpperCase() : null,
    raw_quality_desc: bcRow.raw_quality_desc ? String(bcRow.raw_quality_desc).trim() : null,
    county_quality_uad: qualityUad !== 'unknown' ? qualityUad : null,
    raw_condition_code: bcRow.raw_condition_code ? String(bcRow.raw_condition_code).trim().toUpperCase() : null,
    raw_condition_desc: bcRow.raw_condition_desc ? String(bcRow.raw_condition_desc).trim() : null,
    county_condition_uad: conditionUad !== 'unknown' ? conditionUad : null,
    condition_is_default: conditionIsDefault,
    exterior_wall_code: bcRow.exterior_wall_code || null,
    exterior_wall_desc: constDetail || null,
    roof_cover_code: bcRow.roof_cover_code || null,
    roof_cover_desc: bcRow.roof_cover_desc || null,
    roof_structure_desc: bcRow.roof_structure_desc || null,
    pool_year: parseNullableNumber(bcRow.pool_year, { integer: true, min: 1900, max: 2100 }),
    screen_enclosure_sqft: parseNullableNumber(bcRow.screen_enclosure_sqft, { integer: true, min: 1, max: 50000 }),
    boat_dock_year: parseNullableNumber(bcRow.boat_dock_year, { integer: true, min: 1900, max: 2100 }),
    boat_lift_year: parseNullableNumber(bcRow.boat_lift_year, { integer: true, min: 1900, max: 2100 }),
    fireplaces: parseNullableNumber(bcRow.fireplaces, { integer: true, min: 1, max: 20 }),
    garage_sqft: parseNullableNumber(bcRow.garage_sqft, { integer: true, min: 1, max: 50000 }),
    porch_sqft: parseNullableNumber(bcRow.porch_sqft, { integer: true, min: 1, max: 50000 }),
    patio_sqft: parseNullableNumber(bcRow.patio_sqft, { integer: true, min: 1, max: 50000 }),
    land_class_code: bcRow.land_class_code || null,
    land_class_desc: bcRow.land_class_desc || null,
    condo_model_desc: bcRow.condo_model_desc || null,
    sub_areas_json: Array.isArray(bcRow.sub_areas_json) ? bcRow.sub_areas_json : null,
    extra_features_json: Array.isArray(bcRow.extra_features_json) ? bcRow.extra_features_json : null
  };

  return { values, meta };
}

function hasPopulatedFieldValue(details, field) {
  if (!details || typeof details !== 'object') return false;
  switch (field) {
    case 'beds':
      return details.beds != null;
    case 'baths':
      return details.full_baths != null || details.baths != null;
    case 'condition':
      return Boolean(details.condition && details.condition !== 'unknown');
    case 'quality':
      return Boolean(details.quality && details.quality !== 'unknown');
    case 'eff_year_built':
      return details.eff_year_built != null;
    case 'kitchen_baths_updated':
      return typeof details.kitchen_baths_updated === 'boolean';
    case 'construction_type':
      return Boolean(details.construction_type && details.construction_type !== 'unknown');
    case 'construction_detail':
      return Boolean(details.construction_detail && String(details.construction_detail).trim() !== '');
    case 'roof_type':
      return Boolean(details.roof_type && details.roof_type !== 'unknown');
    case 'roof_year':
      return details.roof_year != null;
    case 'windows':
      return Boolean(details.windows && details.windows !== 'unknown');
    case 'pool_type':
      return Boolean(details.pool_type && details.pool_type !== 'unknown');
    case 'screen_enclosure':
      return typeof details.screen_enclosure === 'boolean';
    case 'garage':
      return Boolean(details.garage_type && details.garage_type !== 'unknown');
    case 'waterfront_view':
      return Boolean(details.waterfront_view && details.waterfront_view !== 'unknown');
    case 'boat_dock':
      return typeof details.boat_dock === 'boolean';
    case 'boat_dock_sqft':
      return details.boat_dock_sqft != null;
    case 'boat_lift':
      return typeof details.boat_lift === 'boolean';
    case 'hoa_name':
      return Boolean(details.hoa_name && String(details.hoa_name).trim() !== '');
    default:
      return false;
  }
}

/**
 * Merges manual user details with county building_characteristics records.
 *
 * Invariants:
 * 1. Manual edits ALWAYS win over county data and are tagged 'my_edit'.
 * 2. Unedited fields present in building_characteristics auto-fill and are tagged 'county_record'.
 * 3. Palm Beach 'AV' condition (condition_is_default === true) NEVER auto-fills active condition;
 *    unless the user explicitly confirms condition, it stays 'unknown' and is tagged 'county_default'.
 */
export function mergeDetailsWithCountyBuilding(manualInput = {}, bcRow = null) {
  const manual = normalizeCompDetails(manualInput);
  const { values: countyVals, meta: countyMeta } = buildingRecordToCountyDefaults(bcRow);
  const explicitManualMap = manual.manual_fields && typeof manual.manual_fields === 'object'
    ? manual.manual_fields
    : null;

  const fieldOrigins = {};
  const mergedPatch = {};

  const isFieldManual = (fieldKey, countyHasValue) => {
    if (explicitManualMap) {
      if (explicitManualMap[fieldKey] === true) return true;
      // Non-county fields (or legacy values when county has nothing) still count as my_edit if populated
      if (!countyHasValue && hasPopulatedFieldValue(manual, fieldKey)) return true;
      return false;
    }
    return hasPopulatedFieldValue(manual, fieldKey);
  };

  // Beds
  const countyHasBeds = countyVals.beds != null;
  if (isFieldManual('beds', countyHasBeds)) {
    mergedPatch.beds = manual.beds;
    if (manual.beds != null) fieldOrigins.beds = 'my_edit';
  } else if (countyHasBeds) {
    mergedPatch.beds = countyVals.beds;
    fieldOrigins.beds = 'county_record';
  }

  // Baths
  const countyHasBaths = countyVals.full_baths != null;
  if (isFieldManual('baths', countyHasBaths)) {
    mergedPatch.full_baths = manual.full_baths;
    mergedPatch.half_baths = manual.half_baths;
    mergedPatch.baths = manual.baths;
    if (hasPopulatedFieldValue(manual, 'baths')) fieldOrigins.baths = 'my_edit';
  } else if (countyHasBaths) {
    mergedPatch.full_baths = countyVals.full_baths;
    mergedPatch.half_baths = countyVals.half_baths ?? 0;
    mergedPatch.baths = null;
    fieldOrigins.baths = 'county_record';
  }

  // Condition (CRITICAL AV default rule!)
  const countyHasRealCond = Boolean(countyVals.condition && countyVals.condition !== 'unknown');
  const countyHasDefaultCond = Boolean(countyMeta?.condition_is_default && countyMeta?.raw_condition_code);
  if (isFieldManual('condition', countyHasRealCond || countyHasDefaultCond)) {
    mergedPatch.condition = manual.condition;
    if (manual.condition !== 'unknown') fieldOrigins.condition = 'my_edit';
    else if (countyHasDefaultCond) fieldOrigins.condition = 'county_default';
  } else if (countyHasRealCond) {
    mergedPatch.condition = countyVals.condition;
    fieldOrigins.condition = 'county_record';
  } else if (countyHasDefaultCond) {
    // Store/keep 'unknown' so AV/C4 NEVER creates condition adjustments unless user confirms!
    mergedPatch.condition = 'unknown';
    fieldOrigins.condition = 'county_default';
  }

  // Quality (auto-fill from county grade, user manual override ALWAYS wins)
  const countyHasQuality = Boolean(countyVals.quality && countyVals.quality !== 'unknown');
  if (isFieldManual('quality', countyHasQuality)) {
    mergedPatch.quality = manual.quality;
    if (manual.quality !== 'unknown') fieldOrigins.quality = 'my_edit';
  } else if (countyHasQuality) {
    mergedPatch.quality = countyVals.quality;
    fieldOrigins.quality = 'county_record';
  }

  // Effective year built
  const countyHasEffYr = countyVals.eff_year_built != null;
  if (isFieldManual('eff_year_built', countyHasEffYr)) {
    mergedPatch.eff_year_built = manual.eff_year_built;
    if (manual.eff_year_built != null) fieldOrigins.eff_year_built = 'my_edit';
  } else if (countyHasEffYr) {
    mergedPatch.eff_year_built = countyVals.eff_year_built;
    fieldOrigins.eff_year_built = 'county_record';
  }

  // Construction type + detail
  const countyHasConst = Boolean(countyVals.construction_type && countyVals.construction_type !== 'unknown');
  if (isFieldManual('construction_type', countyHasConst)) {
    mergedPatch.construction_type = manual.construction_type;
    if (manual.construction_type !== 'unknown') fieldOrigins.construction_type = 'my_edit';
  } else if (countyHasConst) {
    mergedPatch.construction_type = countyVals.construction_type;
    fieldOrigins.construction_type = 'county_record';
  }

  const countyHasConstDetail = Boolean(countyVals.construction_detail);
  if (isFieldManual('construction_detail', countyHasConstDetail)) {
    mergedPatch.construction_detail = manual.construction_detail;
    if (manual.construction_detail) fieldOrigins.construction_detail = 'my_edit';
  } else if (countyHasConstDetail && (!isFieldManual('construction_type', countyHasConst) || !manual.construction_detail)) {
    mergedPatch.construction_detail = countyVals.construction_detail;
    fieldOrigins.construction_detail = 'county_record';
  }

  // Roof type
  const countyHasRoofType = Boolean(countyVals.roof_type && countyVals.roof_type !== 'unknown');
  if (isFieldManual('roof_type', countyHasRoofType)) {
    mergedPatch.roof_type = manual.roof_type;
    if (manual.roof_type !== 'unknown') fieldOrigins.roof_type = 'my_edit';
  } else if (countyHasRoofType) {
    mergedPatch.roof_type = countyVals.roof_type;
    fieldOrigins.roof_type = 'county_record';
  }

  // Pool type
  const countyHasPool = Boolean(countyVals.pool_type && countyVals.pool_type !== 'unknown');
  if (isFieldManual('pool_type', countyHasPool)) {
    mergedPatch.pool_type = manual.pool_type;
    if (manual.pool_type !== 'unknown') fieldOrigins.pool_type = 'my_edit';
  } else if (countyHasPool) {
    mergedPatch.pool_type = countyVals.pool_type;
    fieldOrigins.pool_type = 'county_record';
  }

  // Screen enclosure
  const countyHasScreen = countyVals.screen_enclosure === true;
  if (isFieldManual('screen_enclosure', countyHasScreen)) {
    mergedPatch.screen_enclosure = manual.screen_enclosure;
    if (typeof manual.screen_enclosure === 'boolean') fieldOrigins.screen_enclosure = 'my_edit';
  } else if (countyHasScreen) {
    mergedPatch.screen_enclosure = true;
    fieldOrigins.screen_enclosure = 'county_record';
  }

  // Garage
  const countyHasGarage = Boolean(countyVals.garage_type && countyVals.garage_type !== 'unknown');
  if (isFieldManual('garage', countyHasGarage)) {
    mergedPatch.garage_type = manual.garage_type;
    mergedPatch.garage_bays = manual.garage_bays;
    if (manual.garage_type !== 'unknown') fieldOrigins.garage = 'my_edit';
  } else if (countyHasGarage) {
    mergedPatch.garage_type = countyVals.garage_type;
    mergedPatch.garage_bays = countyVals.garage_bays ?? (countyVals.garage_type === 'garage' ? 2 : 0);
    fieldOrigins.garage = 'county_record';
  }

  // Waterfront & view
  const countyHasView = Boolean(countyVals.waterfront_view && countyVals.waterfront_view !== 'unknown');
  if (isFieldManual('waterfront_view', countyHasView)) {
    mergedPatch.waterfront_view = manual.waterfront_view;
    if (manual.waterfront_view !== 'unknown') fieldOrigins.waterfront_view = 'my_edit';
  } else if (countyHasView) {
    mergedPatch.waterfront_view = countyVals.waterfront_view;
    fieldOrigins.waterfront_view = 'county_record';
  }

  // Boat dock, dock sqft, boat lift
  const countyHasDock = countyVals.boat_dock === true;
  if (isFieldManual('boat_dock', countyHasDock)) {
    mergedPatch.boat_dock = manual.boat_dock;
    if (typeof manual.boat_dock === 'boolean') fieldOrigins.boat_dock = 'my_edit';
  } else if (countyHasDock) {
    mergedPatch.boat_dock = true;
    fieldOrigins.boat_dock = 'county_record';
  }

  const countyHasDockSqft = countyVals.boat_dock_sqft != null;
  if (isFieldManual('boat_dock_sqft', countyHasDockSqft)) {
    mergedPatch.boat_dock_sqft = manual.boat_dock_sqft;
    if (manual.boat_dock_sqft != null) fieldOrigins.boat_dock_sqft = 'my_edit';
  } else if (countyHasDockSqft && mergedPatch.boat_dock !== false) {
    mergedPatch.boat_dock_sqft = countyVals.boat_dock_sqft;
    fieldOrigins.boat_dock_sqft = 'county_record';
  }

  const countyHasLift = countyVals.boat_lift === true;
  if (isFieldManual('boat_lift', countyHasLift)) {
    mergedPatch.boat_lift = manual.boat_lift;
    if (typeof manual.boat_lift === 'boolean') fieldOrigins.boat_lift = 'my_edit';
  } else if (countyHasLift && mergedPatch.boat_dock !== false) {
    mergedPatch.boat_lift = true;
    fieldOrigins.boat_lift = 'county_record';
  }

  // User-only fields (never in PAS405E): mark as my_edit when populated
  for (const userOnlyField of ['kitchen_baths_updated', 'roof_year', 'windows', 'hoa_name']) {
    if (hasPopulatedFieldValue(manual, userOnlyField)) {
      fieldOrigins[userOnlyField] = 'my_edit';
    }
  }

  const resolved = normalizeCompDetails({
    ...manual,
    ...mergedPatch
  });

  return {
    details: resolved,
    field_origins: fieldOrigins,
    county_building_meta: countyMeta
  };
}

/**
 * Merges a saved comp_details table row AND optional county building_characteristics row
 * onto a comp object so comps auto-fill from county data while manual edits ALWAYS win.
 */
export function mergeCompWithSavedDetails(comp = {}, savedRow = null, countyParcel = null, buildingRecord = null) {
  const bcRow = buildingRecord || comp.building_characteristics || null;
  const cluesSource = {
    year_built: countyParcel?.year_built ?? bcRow?.year_built ?? comp.year_built ?? null,
    eff_year_built: countyParcel?.eff_year_built ?? bcRow?.effective_year_built ?? comp.eff_year_built ?? null,
    spec_feat_val: countyParcel?.spec_feat_val ?? comp.spec_feat_val ?? null,
    units: countyParcel?.units ?? comp.units ?? null,
    imp_qual: countyParcel?.imp_qual ?? comp.imp_qual ?? null,
    const_class: countyParcel?.const_class ?? comp.const_class ?? null,
    beds: bcRow?.beds ?? countyParcel?.beds ?? null,
    full_baths: bcRow?.full_baths ?? countyParcel?.full_baths ?? null,
    half_baths: bcRow?.half_baths ?? countyParcel?.half_baths ?? null
  };

  const county_clues = formatCountyClues(cluesSource);

  let manualNormalized;
  if (savedRow && typeof savedRow === 'object') {
    const compJson = unwrapJsonObj(comp.comp_details_json);
    const savedManualFields = compJson.manual_fields || null;
    manualNormalized = normalizeCompDetails({
      ...comp,
      comp_details_json: {
        ...compJson,
        beds: savedRow.beds ?? comp.beds,
        full_baths: savedRow.full_baths,
        half_baths: savedRow.half_baths,
        condition: savedRow.condition ?? comp.condition,
        quality: savedRow.quality !== undefined ? savedRow.quality : comp.quality,
        kitchen_baths_updated: savedRow.kitchen_baths_updated,
        roof_type: savedRow.roof_type,
        roof_year: savedRow.roof_year,
        windows: savedRow.windows,
        pool_type: savedRow.pool_type,
        screen_enclosure: savedRow.screen_enclosure,
        garage_type: savedRow.garage_type,
        garage_bays: savedRow.garage_bays,
        waterfront_view: savedRow.waterfront_view,
        boat_dock: savedRow.boat_dock !== undefined ? savedRow.boat_dock : comp.boat_dock,
        boat_dock_sqft: savedRow.boat_dock_sqft !== undefined ? savedRow.boat_dock_sqft : comp.boat_dock_sqft,
        boat_lift: savedRow.boat_lift !== undefined ? savedRow.boat_lift : comp.boat_lift,
        construction_type: savedRow.construction_type !== undefined ? savedRow.construction_type : comp.construction_type,
        hoa_name: savedRow.hoa_name ?? comp.hoa_name ?? '',
        notes: savedRow.notes ?? comp.notes,
        source: savedRow.source ?? comp.source,
        verified: savedRow.verified,
        ...(savedManualFields ? { manual_fields: savedManualFields } : {})
      }
    });
  } else {
    manualNormalized = normalizeCompDetails(comp, {
      treatLegacyUneditedCountyBooleansAsUnknown: true
    });
  }

  const {
    details: normalizedDetails,
    field_origins,
    county_building_meta
  } = mergeDetailsWithCountyBuilding(manualNormalized, bcRow);

  const legacyCols = detailsToLegacyColumns(normalizedDetails);
  const progress = computeDetailsProgress(normalizedDetails);

  // Living area: sum of finished sub-areas from county CAMA when comp.sqft is missing
  const resolvedSqft =
    comp.sqft != null && Number(comp.sqft) > 0
      ? Number(comp.sqft)
      : (county_building_meta?.living_area_sqft ?? comp.sqft ?? null);
  const resolvedYearBuilt =
    comp.year_built != null && Number(comp.year_built) > 1800
      ? Number(comp.year_built)
      : (county_building_meta?.year_built ?? countyParcel?.year_built ?? comp.year_built ?? null);

  return {
    ...comp,
    ...legacyCols,
    sqft: resolvedSqft,
    year_built: resolvedYearBuilt,
    hoa_name: normalizedDetails.hoa_name || savedRow?.hoa_name || comp.hoa_name || null,
    notes: normalizedDetails.notes || comp.notes || null,
    s_legal: countyParcel?.s_legal ?? comp.s_legal ?? null,
    subdivision_name: countyParcel?.subdivision_name ?? comp.subdivision_name ?? null,
    subdivision_code: countyParcel?.subdivision_code ?? comp.subdivision_code ?? null,
    nbrhd_cd: countyParcel?.nbrhd_cd ?? comp.nbrhd_cd ?? null,
    mkt_ar: countyParcel?.mkt_ar ?? comp.mkt_ar ?? null,
    just_value: countyParcel?.just_value != null ? Number(countyParcel.just_value) : (comp.just_value != null ? Number(comp.just_value) : null),
    land_value: countyParcel?.land_value != null ? Number(countyParcel.land_value) : (comp.land_value != null ? Number(comp.land_value) : null),
    eff_year_built: normalizedDetails.eff_year_built ?? cluesSource.eff_year_built,
    spec_feat_val: cluesSource.spec_feat_val,
    units: cluesSource.units,
    imp_qual: cluesSource.imp_qual,
    const_class: cluesSource.const_class,
    building_characteristics: bcRow || null,
    county_building_meta,
    field_origins,
    raw_quality_code: county_building_meta?.raw_quality_code ?? comp.raw_quality_code ?? null,
    raw_quality_desc: county_building_meta?.raw_quality_desc ?? comp.raw_quality_desc ?? null,
    raw_condition_code: county_building_meta?.raw_condition_code ?? comp.raw_condition_code ?? null,
    raw_condition_desc: county_building_meta?.raw_condition_desc ?? comp.raw_condition_desc ?? null,
    condition_is_default: Boolean(county_building_meta?.condition_is_default ?? comp.condition_is_default),
    county_clues,
    details_progress: progress
  };
}

/**
 * Resolves Subject property details for a given mode ('as_is' | 'arv').
 * Integrates county building_characteristics auto-fill with manual edits ALWAYS winning:
 * - Default subject quality is Q4 when unknown (never Q5), unless county CAMA provides a mapped grade.
 * - Subject construction comes from confirmed value or county CAMA / CONST_CLASS (never defaults to CBS).
 * - Palm Beach AV condition (condition_is_default = true) stays 'unknown' unless manually confirmed.
 */
export function resolveSubjectDetailsForMode(subject = {}, mode = 'as_is') {
  const subjectDetailsObj = unwrapJsonObj(subject?.subject_details);

  const parsedAsIs = unwrapJsonObj(subjectDetailsObj.as_is);
  const asIsRaw = Object.keys(parsedAsIs).length > 0 ? parsedAsIs : null;
  const parsedAfterRehab = unwrapJsonObj(subjectDetailsObj.after_rehab);
  const afterRehabRaw = Object.keys(parsedAfterRehab).length > 0 ? parsedAfterRehab : null;

  const liveOverrides = unwrapJsonObj(subject?.appraisal_overrides);
  const bcRow = subject?.building_characteristics || null;
  const { meta: bcMeta } = buildingRecordToCountyDefaults(bcRow);

  // Determine whether the user has explicitly set/confirmed subject condition
  const explicitSubjectCond = normalizeConditionKey(
    (mode !== 'arv' ? liveOverrides.condition : null) ??
    asIsRaw?.condition ??
    subject?.condition
  );
  const hasManualCondFlag = Boolean(asIsRaw?.manual_fields?.condition || (mode !== 'arv' && liveOverrides.condition));
  const shouldKeepAvConditionUnconfirmed = Boolean(
    bcMeta?.condition_is_default &&
    !hasManualCondFlag &&
    (explicitSubjectCond === 'unknown' || (!asIsRaw?.condition && !subject?.condition))
  );

  // Base manual/stored subject input (prior to county CAMA merge)
  const rawBaseInput = {
    beds: subject?.beds,
    baths: subject?.baths,
    full_baths: subject?.full_baths,
    half_baths: subject?.half_baths,
    condition: shouldKeepAvConditionUnconfirmed
      ? 'unknown'
      : (bcRow ? (subject?.condition || 'unknown') : (subject?.condition || 'c4')),
    eff_year_built: subject?.eff_year_built,
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
    boat_dock: subject?.boat_dock,
    boat_dock_sqft: subject?.boat_dock_sqft,
    boat_lift: subject?.boat_lift,
    construction_type: subject?.construction_type,
    construction_detail: subject?.construction_detail || subjectDetailsObj?.construction_detail || '',
    quality: subject?.quality,
    sketch_areas: subjectDetailsObj?.sketch_areas || subject?.sketch_areas || '',
    recent_improvements: subjectDetailsObj?.recent_improvements || subject?.recent_improvements || '',
    hoa_name: subject?.hoa_name,
    notes: subject?.notes,
    ...(asIsRaw || {}),
    ...(mode !== 'arv' ? liveOverrides : {})
  };

  // Merge manual input with county CAMA building_characteristics (manual ALWAYS wins!)
  const mergedAsIs = mergeDetailsWithCountyBuilding(rawBaseInput, bcRow);
  const fieldOrigins = { ...mergedAsIs.field_origins };

  // Fallback quality: explicit / CAMA county grade -> DOR IMP_QUAL (Q1–Q4) -> default Q4 (never Q5)
  let resolvedAsIsQuality = mergedAsIs.details.quality;
  if (resolvedAsIsQuality === 'unknown') {
    const countyMappedQuality = mapImpQualToUadQuality(subject?.imp_qual);
    resolvedAsIsQuality =
      countyMappedQuality !== 'unknown' && countyMappedQuality !== 'q5' && countyMappedQuality !== 'q6'
        ? countyMappedQuality
        : 'q4';
  }

  // Fallback construction: explicit / CAMA exterior wall -> DOR CONST_CLASS (never default to CBS)
  let resolvedAsIsConst = mergedAsIs.details.construction_type;
  if (resolvedAsIsConst === 'unknown') {
    const countyConstType = mapConstClassToConstructionType(subject?.const_class);
    if (countyConstType !== 'unknown') {
      resolvedAsIsConst = countyConstType;
    }
  }

  // Fallback condition when no CAMA record at all and nothing set -> keep legacy 'c4' default for non-CAMA subjects
  let resolvedAsIsCondition = mergedAsIs.details.condition;
  if (!bcRow && resolvedAsIsCondition === 'unknown') {
    resolvedAsIsCondition = 'c4';
  }

  const baseAsIs = {
    ...normalizeCompDetails({
      ...mergedAsIs.details,
      quality: resolvedAsIsQuality,
      construction_type: resolvedAsIsConst,
      condition: resolvedAsIsCondition
    }),
    field_origins: fieldOrigins,
    county_building_meta: mergedAsIs.county_building_meta
  };

  if (mode !== 'arv') {
    return baseAsIs;
  }

  // For ARV ('after_rehab'): inherit physical layout from as_is unless overridden in after_rehab,
  // default target condition to Fully renovated (C2), and keep quality >= Q4 default (never Q5 when unset).
  if (afterRehabRaw && Object.keys(afterRehabRaw).length > 0) {
    const explicitArvQuality = normalizeQualityKey(liveOverrides.quality ?? afterRehabRaw.quality);
    const resolvedArvQuality = explicitArvQuality !== 'unknown' ? explicitArvQuality : baseAsIs.quality;
    const explicitArvConst = normalizeConstructionType(liveOverrides.construction_type ?? afterRehabRaw.construction_type);
    const resolvedArvConst = explicitArvConst !== 'unknown' ? explicitArvConst : baseAsIs.construction_type;
    const arvOrigins = { ...fieldOrigins };
    if (explicitArvQuality !== 'unknown') arvOrigins.quality = 'my_edit';
    if (explicitArvConst !== 'unknown') arvOrigins.construction_type = 'my_edit';
    arvOrigins.condition = 'my_edit';

    return {
      ...normalizeCompDetails({
        ...baseAsIs,
        ...afterRehabRaw,
        ...liveOverrides,
        quality: resolvedArvQuality,
        construction_type: resolvedArvConst,
        construction_detail: liveOverrides.construction_detail || afterRehabRaw.construction_detail || baseAsIs.construction_detail,
        condition: (liveOverrides.condition || afterRehabRaw.condition) && (liveOverrides.condition || afterRehabRaw.condition) !== 'unknown'
          ? (liveOverrides.condition || afterRehabRaw.condition)
          : 'c2'
      }),
      field_origins: arvOrigins,
      county_building_meta: mergedAsIs.county_building_meta
    };
  }

  return {
    ...normalizeCompDetails({
      ...baseAsIs,
      condition: 'c2',
      kitchen_baths_updated: baseAsIs.kitchen_baths_updated ?? true,
      ...liveOverrides,
      quality: normalizeQualityKey(liveOverrides.quality) !== 'unknown'
        ? normalizeQualityKey(liveOverrides.quality)
        : baseAsIs.quality
    }),
    field_origins: { ...fieldOrigins, condition: 'my_edit' },
    county_building_meta: mergedAsIs.county_building_meta
  };
}
