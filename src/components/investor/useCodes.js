/**
 * Florida DOR use-code helpers (shared by AddressAutocomplete, tests and the Finder).
 */

/**
 * Use code reflecting the CURRENT building: a parcel still coded vacant ('000' / '0000')
 * but with living area or a year built in the latest NAL / CAMA data is treated as the
 * improved residential type (1 unit → single-family, 2–9 → multifamily).
 */
export function resolveCurrentUseCode(parcel = {}) {
  const code = String(parcel?.use_code || '').trim();
  const bc = parcel?.building_characteristics || {};
  const living = Math.max(
    Number(parcel?.bc_living_sqft) || 0,
    Number(bc.living_area_sqft) || 0,
    Number(parcel?.living_sqft) || 0
  );
  const built = Number(parcel?.bc_year_built) || Number(bc.year_built) || Number(parcel?.year_built) || 0;
  const vacantCode = code === '000' || code === '0000';
  if (vacantCode && (living > 0 || built > 1800)) {
    const units = Number(parcel?.units) || 1;
    return units >= 2 && units <= 9 ? '008' : '001';
  }
  return code;
}

/**
 * Maps Florida DOR Use Code to a human-readable land use label
 */
export function getUseCodeLabel(useCode) {
  const code = String(useCode || '').trim();
  switch (code) {
    case '001':
      return 'Single-family';
    case '004':
      return 'Condo';
    case '008':
      return 'Multifamily (2–9 units)';
    case '002':
      return 'Mobile home';
    case '000':
      return 'Vacant residential';
    case '003':
      return 'Multifamily (10+ units)';
    default:
      return code ? `Use code ${code}` : 'Residential';
  }
}

/**
 * Maps Florida DOR Use Code to Investor Studio property types:
 * 001 Single-family, 004 Condo, 008 Multifamily 2–9 units, 002 and 000 Other
 */
export function mapUseCodeToPropertyType(useCode) {
  const code = String(useCode || '').trim();
  switch (code) {
    case '001':
      return 'single_family';
    case '004':
      return 'condo';
    case '008':
      return 'multifamily_2_9';
    case '002':
    case '000':
    default:
      return 'other';
  }
}


/** Back-compat name (plain re-export, not a React hook). */
export { mapUseCodeToPropertyType as useCodeToPropertyType };
