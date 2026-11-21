/**
 * County CAMA Building Characteristics Mapper (Palm Beach PAPA PAS405E; extensible for Martin/Broward)
 *
 * Pure, dependency-free mapping and aggregation utilities shared by:
 * - scripts/county/import-cama-building.mjs (CLI importer)
 * - src/components/investor/compDetailsModel.js & valuationEngine.js (auto-fill & formatting)
 * - Unit tests
 *
 * Strict privacy guarantee: NEVER reads, parses, or emits owner names or mailing addresses.
 */

export const PBC_ACCESSORY_RESBLD_CLASSES = new Set(['8400', '8500', '8600', '8601', '8602']);
export const PBC_POOL_CODES = new Set(['PL1', 'PL2', 'PL3', 'POL', 'SPC']);
export const PBC_DOCK_CODES = new Set(['DOK', 'BOL', 'BOH', 'BOS']);
export const PBC_FIREPLACE_CODES = new Set(['FRP', 'OFP']);
export const PBC_GARAGE_OBY_CODES = new Set(['GAR', 'FGR', 'CRP']);
export const PBC_PORCH_OBY_CODES = new Set(['FOP', 'FEP', 'FSP', 'UOP', 'UEP', 'SNR']);
export const PBC_PATIO_OBY_CODES = new Set(['PAT', 'ROF', 'DCK', 'WDK']);
export const PBC_SCREEN_CODES = new Set(['SCE', 'ENC']);

const FEATURE_CODES_TO_STORE = new Set([
  ...PBC_POOL_CODES,
  ...PBC_DOCK_CODES,
  ...PBC_FIREPLACE_CODES,
  ...PBC_GARAGE_OBY_CODES,
  ...PBC_PORCH_OBY_CODES,
  ...PBC_PATIO_OBY_CODES,
  ...PBC_SCREEN_CODES,
  'SPA',
  'CAB',
  'CPH',
  'POH',
  'ELV'
]);

const LAND_VIEW_PRIORITY = {
  ocean_access: 4,
  canal_fixed_bridge: 3,
  lake: 2,
  golf: 1
};

function cleanStr(val) {
  if (val == null) return '';
  return String(val).trim();
}

function parseIntOrNull(val, { min = 1, max = 9999999 } = {}) {
  const s = cleanStr(val);
  if (!s) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function parseFloatOrNull(val, { min = 0.01, max = 999 } = {}) {
  const s = cleanStr(val);
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Checks whether a Palm Beach DOR property use code is residential (01xx through 08xx).
 */
export function isResidentialPbcUseCode(useCode) {
  const c = cleanStr(useCode);
  return /^0[1-8]\d\d$/.test(c);
}

/**
 * Empirically calibrated Palm Beach CAMA Grade -> UAD Q1–Q6 mapping.
 * Preserves raw county code (R1–R6, C1–C7, etc.) alongside the UAD tier.
 */
export function mapPbcGradeToUad(rawCode) {
  const c = cleanStr(rawCode).toUpperCase();
  if (!c) return null;
  if (['C3', 'C4', 'C5', 'C6', 'C7', '7', '7+', '7-', '8', '8+', '8-'].includes(c)) return 'q1';
  if (['R5', 'R6', 'C1', 'C2', '6', '6+', '6-', '5', '5+', '5-'].includes(c) || c.startsWith('B')) return 'q2';
  if (['R3', 'R4', '4', '4+', '4-'].includes(c)) return 'q3';
  if (['R2', '3', '3+', '3-', 'C'].includes(c) || c.startsWith('A') || c.startsWith('D')) return 'q4';
  if (['R1', '2', '2+', '2-', 'E3', 'E4', 'E5', 'E6', 'E7', '1+'].includes(c)) return 'q5';
  if (['1', '1-', 'E1', 'E2'].includes(c)) return 'q6';
  return null;
}

/**
 * Palm Beach CAMA Condition -> UAD C2–C6 + condition_is_default flag.
 *
 * CRITICAL RULE:
 * 99% of Palm Beach County residential cards are coded 'AV' (AVERAGE) as a mass-appraisal
 * default, NOT a real interior/exterior inspection. We store condition_uad = 'c4' with
 * condition_is_default = true so the UI labels it "county default (not inspected)" and
 * NEVER allows an unconfirmed county AV/C4 to create condition adjustments in the grid.
 * Only GD / VG / EX / FR / PR / P- / VP / V- / UN count as real condition signals.
 */
export function mapPbcConditionToUad(rawCode) {
  const c = cleanStr(rawCode).toUpperCase();
  if (!c) return { condition_uad: null, condition_is_default: false };
  if (c === 'EX' || c === 'VG') return { condition_uad: 'c2', condition_is_default: false };
  if (c === 'GD') return { condition_uad: 'c3', condition_is_default: false };
  if (c === 'AV') return { condition_uad: 'c4', condition_is_default: true };
  if (c === 'FR' || c === 'PR' || c === 'P-') return { condition_uad: 'c5', condition_is_default: false };
  if (c === 'VP' || c === 'V-' || c === 'UN') return { condition_uad: 'c6', condition_is_default: false };
  return { condition_uad: null, condition_is_default: false };
}

/**
 * Maps Palm Beach exterior wall / frame description to canonical construction_type
 * ('cbs' | 'wood_frame' | 'other' | null).
 */
export function mapPbcWallToConstruction(desc) {
  const u = cleanStr(desc).toUpperCase();
  if (!u || u === 'NONE' || u === 'N/A' || u === 'UNKNOWN') return null;
  if (
    u.startsWith('MSY:') ||
    u.includes('CONC') ||
    u.includes('CB STUCCO') ||
    u.includes('MASONRY') ||
    u.includes('STONE') ||
    (u.includes('BRICK') && !u.includes('WSF'))
  ) {
    return 'cbs';
  }
  if (
    u.startsWith('WSF:') ||
    u.includes('WOOD') ||
    u.includes('SIDING') ||
    u.includes('PLYWD') ||
    u.includes('FRAME') ||
    u.includes('CEMENT FIBER') ||
    u.includes('HARDI')
  ) {
    return 'wood_frame';
  }
  return 'other';
}

/**
 * Maps Palm Beach roof cover description to canonical roof_type
 * ('barrel_tile' | 'shingle' | 'metal' | 'flat' | null).
 */
export function mapPbcRoofToCanonical(desc) {
  const u = cleanStr(desc).toUpperCase();
  if (!u || u === 'NONE' || u === 'N/A') return null;
  if (u.includes('TILE')) return 'barrel_tile';
  if (u.includes('SHING') || u.includes('ASPH') || u.includes('COMPOSI')) return 'shingle';
  if (u.includes('METAL') || u.includes('ALUM') || u.includes('STEEL') || u.includes('COPPER')) return 'metal';
  if (u.includes('BUILT-UP') || u.includes('ROLLED') || u.includes('FLAT') || u.includes('TAR') || u.includes('POURED')) {
    return 'flat';
  }
  return null;
}

/**
 * Maps explicit Palm Beach LAND class codes to canonical waterfront_view.
 * Leaves non-water / standard dry-lot codes null so we never falsely assert dry_lot.
 */
export function mapPbcLandClassToView(code, desc = '') {
  const c = cleanStr(code);
  const d = cleanStr(desc).toUpperCase();
  if (['0118', '0119', '0120', '0121', '0122'].includes(c)) return 'ocean_access';
  if (['0131', '0132', '0133'].includes(c)) return 'canal_fixed_bridge';
  if (c === '0130') return 'lake';
  if (c === '0140') return 'golf';
  if (d.includes('OCEAN') || d === 'INTRACOASTAL' || d.includes('INTRACOASTAL WATER')) return 'ocean_access';
  if (d.includes('INTRACOASTAL CANAL') || d.includes('RIVER')) return 'canal_fixed_bridge';
  if (d.includes('GOLF COURSE')) return 'golf';
  return null;
}

/**
 * Extracts garage bay count from CONDO townhome model descriptions such as
 * "JUNIPER/ 2C.G." or "GREENW./1CG/GOLF".
 */
export function parseCondoModelGarageBays(modelDesc) {
  const s = cleanStr(modelDesc).toUpperCase();
  if (!s) return null;
  const m = s.match(/(?:^|[\s/,_-])([1-4])\s*C\.?\s*G\.?(?:$|[\s/,_-])/);
  if (!m) return null;
  const bays = parseInt(m[1], 10);
  return bays >= 1 && bays <= 4 ? bays : null;
}

/**
 * Formats a UAD quality label alongside the raw county grade code everywhere in the UI
 * (e.g. "Above avg (Q3 · R3)" or "Custom (Q2 · county R3)" when manually overridden).
 */
export function formatQualityWithRawCode(qualityMetaOrId, rawCode, { isManualOverride = false, short = true } = {}) {
  const code = cleanStr(rawCode).toUpperCase();
  const qId = typeof qualityMetaOrId === 'string'
    ? qualityMetaOrId.trim().toLowerCase()
    : (qualityMetaOrId?.id || 'unknown');
  const uad = typeof qualityMetaOrId === 'object' && qualityMetaOrId?.uad
    ? qualityMetaOrId.uad
    : (/^q[1-6]$/.test(qId) ? qId.toUpperCase() : null);

  if (!uad || qId === 'unknown') {
    return code ? `Unknown (county ${code})` : 'Unknown';
  }

  const baseLabel = typeof qualityMetaOrId === 'object' && qualityMetaOrId
    ? (short ? qualityMetaOrId.shortLabel : qualityMetaOrId.label)
    : uad;

  if (!code) return baseLabel;

  // Insert raw code neatly inside "(Q3)" -> "(Q3 · R3)" or "(Q2 · county R3)" when overridden
  const codePart = isManualOverride ? `county ${code}` : code;
  if (baseLabel.includes(`(${uad})`)) {
    return baseLabel.replace(`(${uad})`, `(${uad} · ${codePart})`);
  }
  return `${baseLabel} (${codePart})`;
}

/**
 * Builds a rich hover tooltip showing the original county code, description, roll year,
 * and provenance ("county record" vs "my edit").
 */
export function buildCountyCodeTooltip({
  label = 'County code',
  rawCode = null,
  rawDesc = null,
  origin = null,
  rollYear = null,
  isDefaultCondition = false
} = {}) {
  const parts = [];
  if (rawCode) {
    parts.push(`${label}: ${rawCode}${rawDesc ? ` (${rawDesc})` : ''}`);
  }
  if (isDefaultCondition) {
    parts.push('County default (not inspected) — ignored in grid adjustments until confirmed');
  } else if (origin === 'my_edit') {
    parts.push('Source: my edit (overrides county record)');
  } else if (origin === 'county_record') {
    parts.push(`Source: county record${rollYear ? ` (${rollYear} CAMA roll)` : ''}`);
  }
  return parts.join(' · ');
}

/**
 * Aggregates all CAMA records for a single Palm Beach PCN into a building_characteristics row.
 * Returns null if the parcel has no residential building data.
 *
 * Expected bundle shape:
 * {
 *   pcn: string,
 *   parcel: string[] | null,
 *   resbld: string[][],
 *   condo: string[][],
 *   combld: string[][],
 *   oby: string[][],
 *   land: string[][]
 * }
 */
export function aggregatePbcParcelBundle(bundle, { rollYear = 2026, source = 'papa_cama_pas405e' } = {}) {
  if (!bundle || !bundle.pcn) return null;
  const folio = cleanStr(bundle.pcn).replace(/[-\s.]/g, '');
  if (!folio) return null;

  const parcel = bundle.parcel || null;
  const useCode = parcel && parcel.length > 13 ? cleanStr(parcel[13]) : '';
  const resbld = Array.isArray(bundle.resbld) ? bundle.resbld : [];
  const condo = Array.isArray(bundle.condo) ? bundle.condo : [];
  const combld = Array.isArray(bundle.combld) ? bundle.combld : [];
  const oby = Array.isArray(bundle.oby) ? bundle.oby : [];
  const land = Array.isArray(bundle.land) ? bundle.land : [];

  const dwellingRes = resbld.filter((r) => !PBC_ACCESSORY_RESBLD_CLASSES.has(cleanStr(r[3])));
  const detGarCards = resbld.filter((r) => cleanStr(r[3]) === '8400');

  // Keep residential parcels: any RESBLD, any CONDO, or COMBLD with residential use code (01xx-08xx)
  const hasRes = dwellingRes.length > 0;
  const hasCondo = condo.length > 0;
  const hasResCom = combld.length > 0 && isResidentialPbcUseCode(useCode);

  if (!hasRes && !hasCondo && !hasResCom) {
    return null;
  }

  const record = {
    county: 'Palm Beach',
    folio,
    source,
    roll_year: Number(rollYear) || 2026,
    property_class: null,
    building_count: 1,
    beds: null,
    full_baths: null,
    half_baths: null,
    stories: null,
    year_built: null,
    effective_year_built: null,
    living_area_sqft: null,
    total_area_sqft: null,
    non_living_area_sqft: null,
    construction_type: null,
    exterior_wall_code: null,
    exterior_wall_desc: null,
    roof_type: null,
    roof_cover_code: null,
    roof_cover_desc: null,
    roof_structure_desc: null,
    quality_uad: null,
    raw_quality_code: null,
    raw_quality_desc: null,
    condition_uad: null,
    raw_condition_code: null,
    raw_condition_desc: null,
    condition_is_default: false,
    pool_type: null,
    pool_year: null,
    screen_enclosure: null,
    screen_enclosure_sqft: null,
    boat_dock: null,
    boat_dock_sqft: null,
    boat_dock_year: null,
    boat_lift: null,
    boat_lift_year: null,
    fireplaces: null,
    garage_type: null,
    garage_bays: null,
    garage_sqft: null,
    porch_sqft: null,
    patio_sqft: null,
    waterfront_view: null,
    land_class_code: null,
    land_class_desc: null,
    condo_model_desc: null,
    sub_areas_json: null,
    extra_features_json: null
  };

  if (hasRes) {
    record.property_class = 'RESBLD';
    record.building_count = dwellingRes.length;

    // Primary dwelling card = largest living area (tie-break: largest total area, then first card)
    const primary = dwellingRes.reduce((best, cur) => {
      const bestLiv = parseIntOrNull(best[41], { min: 0 }) ?? 0;
      const curLiv = parseIntOrNull(cur[41], { min: 0 }) ?? 0;
      if (curLiv !== bestLiv) return curLiv > bestLiv ? cur : best;
      const bestTot = parseIntOrNull(best[40], { min: 0 }) ?? 0;
      const curTot = parseIntOrNull(cur[40], { min: 0 }) ?? 0;
      return curTot > bestTot ? cur : best;
    }, dwellingRes[0]);

    let sumBeds = 0;
    let sumFullBaths = 0;
    let sumHalfBaths = 0;
    let sumLiving = 0;
    let sumTotal = 0;

    for (const card of dwellingRes) {
      sumBeds += parseIntOrNull(card[7], { min: 0, max: 99 }) ?? 0;
      sumFullBaths += parseIntOrNull(card[8], { min: 0, max: 99 }) ?? 0;
      sumHalfBaths += parseIntOrNull(card[9], { min: 0, max: 99 }) ?? 0;
      sumLiving += parseIntOrNull(card[41], { min: 0 }) ?? 0;
      sumTotal += parseIntOrNull(card[40], { min: 0 }) ?? 0;
    }

    // Critical 2026 live-data rule: 00 bedrooms means unrecorded -> store NULL (never "0 bd")
    record.beds = sumBeds > 0 ? sumBeds : null;
    if (sumFullBaths > 0 || sumHalfBaths > 0) {
      record.full_baths = sumFullBaths;
      record.half_baths = sumHalfBaths;
    }

    record.stories = parseFloatOrNull(primary[10], { min: 0.5, max: 50 });
    record.year_built = parseIntOrNull(primary[5], { min: 1850, max: 2100 });
    record.effective_year_built = parseIntOrNull(primary[6], { min: 1850, max: 2100 });

    record.living_area_sqft = sumLiving > 0 ? sumLiving : null;
    record.total_area_sqft = sumTotal > 0 ? sumTotal : null;
    if (record.living_area_sqft != null && record.total_area_sqft != null) {
      record.non_living_area_sqft = Math.max(0, record.total_area_sqft - record.living_area_sqft);
    }

    // Exterior walls (Wall 1 + optional Wall 2)
    const wall1Code = cleanStr(primary[11]);
    const wall1Desc = cleanStr(primary[12]);
    const wall2Code = cleanStr(primary[13]);
    const wall2Desc = cleanStr(primary[14]);
    const hasWall1 = wall1Code && wall1Code !== '00' && wall1Desc && wall1Desc.toUpperCase() !== 'NONE';
    const hasWall2 = wall2Code && wall2Code !== '00' && wall2Desc && wall2Desc.toUpperCase() !== 'NONE';

    if (hasWall1) {
      record.exterior_wall_code = wall1Code;
      record.exterior_wall_desc = hasWall2 ? `${wall1Desc} / ${wall2Desc}` : wall1Desc;
      record.construction_type = mapPbcWallToConstruction(wall1Desc);
    } else if (hasWall2) {
      record.exterior_wall_code = wall2Code;
      record.exterior_wall_desc = wall2Desc;
      record.construction_type = mapPbcWallToConstruction(wall2Desc);
    }

    // Roof structure & cover (no roof year exists in PAS405E)
    const roofStructDesc = cleanStr(primary[16]);
    if (roofStructDesc && roofStructDesc.toUpperCase() !== 'NONE' && roofStructDesc.toUpperCase() !== 'N/A') {
      record.roof_structure_desc = roofStructDesc;
    }
    const roofCoverCode = cleanStr(primary[17]);
    const roofCoverDesc = cleanStr(primary[18]);
    if (roofCoverCode && roofCoverCode !== '00' && roofCoverDesc && roofCoverDesc.toUpperCase() !== 'NONE') {
      record.roof_cover_code = roofCoverCode;
      record.roof_cover_desc = roofCoverDesc;
      record.roof_type = mapPbcRoofToCanonical(roofCoverDesc);
    }

    // Grade / Quality
    const rawQualCode = cleanStr(primary[33]).toUpperCase();
    const rawQualDesc = cleanStr(primary[34]);
    if (rawQualCode) {
      record.raw_quality_code = rawQualCode;
      record.raw_quality_desc = rawQualDesc || null;
      record.quality_uad = mapPbcGradeToUad(rawQualCode);
    }

    // Condition (with AV default flag!)
    const rawCondCode = cleanStr(primary[35]).toUpperCase();
    const rawCondDesc = cleanStr(primary[36]);
    if (rawCondCode) {
      const mappedCond = mapPbcConditionToUad(rawCondCode);
      record.raw_condition_code = rawCondCode;
      record.raw_condition_desc = rawCondDesc || null;
      record.condition_uad = mappedCond.condition_uad;
      record.condition_is_default = mappedCond.condition_is_default;
    }
  } else if (hasCondo) {
    record.property_class = 'CONDO';
    record.building_count = condo.length;
    const primary = condo[0];

    let sumBeds = 0;
    let sumFull = 0;
    let sumHalf = 0;
    let sumLiving = 0;

    for (const c of condo) {
      sumBeds += parseIntOrNull(c[12], { min: 0, max: 99 }) ?? 0;
      const bathRaw = parseFloatOrNull(c[13], { min: 0, max: 99 }) ?? 0;
      const fullPart = Math.floor(bathRaw + 1e-6);
      const explicitHalf = c.length > 16 ? parseIntOrNull(c[16], { min: 0, max: 20 }) : null;
      const halfPart = explicitHalf != null
        ? explicitHalf
        : (bathRaw - fullPart >= 0.25 ? 1 : 0);
      sumFull += fullPart;
      sumHalf += halfPart;
      sumLiving += parseIntOrNull(c[14], { min: 0 }) ?? 0;
    }

    record.beds = sumBeds > 0 ? sumBeds : null;
    if (sumFull > 0 || sumHalf > 0) {
      record.full_baths = sumFull;
      record.half_baths = sumHalf;
    }
    record.year_built = parseIntOrNull(primary[8], { min: 1850, max: 2100 });
    record.living_area_sqft = sumLiving > 0 ? sumLiving : null;
    record.total_area_sqft = record.living_area_sqft;
    record.non_living_area_sqft = 0;

    const modelDesc = cleanStr(primary[10]);
    if (modelDesc) {
      record.condo_model_desc = modelDesc;
      const parsedBays = parseCondoModelGarageBays(modelDesc);
      if (parsedBays != null) {
        record.garage_type = 'garage';
        record.garage_bays = parsedBays;
      }
    }
  } else if (hasResCom) {
    record.property_class = 'COMBLD';
    record.building_count = combld.length;
    const primary = combld.reduce((best, cur) => {
      const bArea = parseIntOrNull(best[22], { min: 0 }) ?? 0;
      const cArea = parseIntOrNull(cur[22], { min: 0 }) ?? 0;
      return cArea > bArea ? cur : best;
    }, combld[0]);

    const totalArea = combld.reduce((sum, cm) => sum + (parseIntOrNull(cm[22], { min: 0 }) ?? 0), 0);
    record.year_built = parseIntOrNull(primary[5], { min: 1850, max: 2100 });
    record.effective_year_built = parseIntOrNull(primary[6], { min: 1850, max: 2100 });
    record.stories = parseFloatOrNull(primary[8], { min: 0.5, max: 80 });
    record.living_area_sqft = totalArea > 0 ? totalArea : null;
    record.total_area_sqft = record.living_area_sqft;

    const wallCode = cleanStr(primary[9]);
    const wallDesc = cleanStr(primary[10]);
    const frameDesc = cleanStr(primary[14]);
    const combinedWall = [wallDesc, frameDesc].filter((x) => x && x.toUpperCase() !== 'NONE').join(' / ');
    if (combinedWall) {
      record.exterior_wall_code = wallCode || null;
      record.exterior_wall_desc = combinedWall;
      record.construction_type = mapPbcWallToConstruction(frameDesc || wallDesc) || mapPbcWallToConstruction(wallDesc);
    }

    const rawQualCode = cleanStr(primary[17]).toUpperCase();
    const rawQualDesc = cleanStr(primary[18]);
    if (rawQualCode) {
      record.raw_quality_code = rawQualCode;
      record.raw_quality_desc = rawQualDesc || null;
      record.quality_uad = mapPbcGradeToUad(rawQualCode);
    }
  }

  // Process detached garage RESBLD 8400 cards
  let detachedGarageSqft = 0;
  const subAreas = [];
  if (record.living_area_sqft) {
    subAreas.push({ code: 'LIVING', desc: 'Living Area (Under Air)', sqft: record.living_area_sqft });
  }
  if (record.non_living_area_sqft && record.non_living_area_sqft > 0) {
    subAreas.push({ code: 'NON_LIVING', desc: 'Non-Living Under Roof (Garage/Porch)', sqft: record.non_living_area_sqft });
  }
  for (const dg of detGarCards) {
    const area = parseIntOrNull(dg[40], { min: 1 }) ?? parseIntOrNull(dg[41], { min: 1 }) ?? 0;
    if (area > 0) {
      detachedGarageSqft += area;
      subAreas.push({ code: 'DET_GAR', desc: 'Detached Garage (Card 8400)', sqft: area });
    }
  }

  // Process OBY (Extra Features: Pools, Screen Enclosures, Docks, Boat Lifts, Fireplaces, Detached Garages, Porches/Patios)
  let porchSqft = 0;
  let patioSqft = 0;
  let screenSqft = 0;
  let dockSqft = 0;
  let fireplacesCount = 0;
  let obyGarageSqft = 0;
  let obyCarportSqft = 0;
  const extraFeatures = [];

  for (const o of oby) {
    const code = cleanStr(o[4]).toUpperCase();
    if (!code) continue;
    const desc = cleanStr(o[5]);
    const units = parseIntOrNull(o[8], { min: 1, max: 99 }) ?? 1;
    const area = parseIntOrNull(o[10], { min: 1 }) ?? null;
    const year = parseIntOrNull(o[11], { min: 1900, max: 2100 });

    if (PBC_POOL_CODES.has(code)) {
      if (code === 'PL3') {
        record.pool_type = 'resort';
      } else if (!record.pool_type) {
        record.pool_type = 'standard';
      }
      if (year && (!record.pool_year || year > record.pool_year)) {
        record.pool_year = year;
      }
    } else if (PBC_SCREEN_CODES.has(code)) {
      record.screen_enclosure = true;
      if (area && area > 1) screenSqft += area;
    } else if (code === 'DOK') {
      record.boat_dock = true;
      if (area && area > 1) dockSqft += area;
      if (year && (!record.boat_dock_year || year > record.boat_dock_year)) {
        record.boat_dock_year = year;
      }
    } else if (code === 'BOL') {
      record.boat_dock = true;
      record.boat_lift = true;
      if (year && (!record.boat_lift_year || year > record.boat_lift_year)) {
        record.boat_lift_year = year;
      }
    } else if (code === 'BOH' || code === 'BOS') {
      record.boat_dock = true;
      if (area && area > 1) dockSqft += area;
    } else if (PBC_FIREPLACE_CODES.has(code)) {
      fireplacesCount += units;
    } else if (code === 'GAR' || code === 'FGR') {
      if (area && area > 1) obyGarageSqft += area;
      else obyGarageSqft += 250;
    } else if (code === 'CRP') {
      if (area && area > 1) obyCarportSqft += area;
      else obyCarportSqft += 200;
    } else if (PBC_PORCH_OBY_CODES.has(code)) {
      if (area && area > 1) porchSqft += area;
    } else if (PBC_PATIO_OBY_CODES.has(code)) {
      if (area && area > 1) patioSqft += area;
    }

    if (FEATURE_CODES_TO_STORE.has(code)) {
      const entry = { code, desc: desc || code };
      if (area && area > 1) entry.sqft = area;
      if (year) entry.year = year;
      extraFeatures.push(entry);
    }
  }

  if (screenSqft > 0) record.screen_enclosure_sqft = screenSqft;
  if (dockSqft > 0) record.boat_dock_sqft = dockSqft;
  if (fireplacesCount > 0) record.fireplaces = fireplacesCount;
  if (porchSqft > 0) record.porch_sqft = porchSqft;
  if (patioSqft > 0) record.patio_sqft = patioSqft;

  const totalDetachedGarageSqft = detachedGarageSqft + obyGarageSqft;
  if (totalDetachedGarageSqft > 0) {
    record.garage_type = 'garage';
    record.garage_sqft = totalDetachedGarageSqft;
  } else if (obyCarportSqft > 0 && !record.garage_type) {
    record.garage_type = 'carport';
    record.garage_sqft = obyCarportSqft;
  }

  // Process LAND view / waterfront codes (pick highest priority view if multiple land lines)
  let bestView = null;
  let bestViewPriority = 0;
  let bestLandCode = null;
  let bestLandDesc = null;

  for (const l of land) {
    const lCode = cleanStr(l[7]);
    const lDesc = cleanStr(l[8]);
    const mappedView = mapPbcLandClassToView(lCode, lDesc);
    if (mappedView) {
      const prio = LAND_VIEW_PRIORITY[mappedView] || 0;
      if (prio > bestViewPriority) {
        bestView = mappedView;
        bestViewPriority = prio;
        bestLandCode = lCode || null;
        bestLandDesc = lDesc || null;
      }
    }
  }
  if (bestView) {
    record.waterfront_view = bestView;
    record.land_class_code = bestLandCode;
    record.land_class_desc = bestLandDesc;
  }

  // Only persist sub_areas_json when itemized extra cards exist (living/total/non_living already live in typed integer columns)
  if (detGarCards.length > 0 && subAreas.length > 0) {
    record.sub_areas_json = subAreas;
  }
  if (extraFeatures.length > 0) {
    record.extra_features_json = extraFeatures;
  }

  return record;
}
