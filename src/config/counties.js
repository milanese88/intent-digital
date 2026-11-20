/**
 * Shared county registry for Investor Studio (client + server).
 *
 * The county of a property must come from (1) its linked county parcel, or (2) its
 * coordinates. Server code resolves coordinates against real parcel data
 * (api/_lib/countyResolver.js); `estimateCountyFromCoords` below is only a coarse,
 * data-derived fallback that deliberately returns null near county lines.
 */

export const SUPPORTED_COUNTIES = ['Broward', 'Palm Beach', 'Martin'];

export const COUNTY_META = {
  Broward: { name: 'Broward', dorCode: '16', appraiser: 'Broward County Property Appraiser' },
  'Palm Beach': { name: 'Palm Beach', dorCode: '60', appraiser: 'Palm Beach County Property Appraiser' },
  Martin: { name: 'Martin', dorCode: '53', appraiser: 'Martin County Property Appraiser' }
};

/**
 * Maps free-form county text ("Martin County", "palm beach", "PALM BEACH COUNTY",
 * DOR code "53") to a supported county name, or null when unsupported / "Other".
 */
export function normalizeCountyName(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === '16' || /\bbroward\b/.test(s)) return 'Broward';
  if (s === '60' || /\bpalm\s*beach\b/.test(s)) return 'Palm Beach';
  if (s === '53' || /\bmartin\b/.test(s)) return 'Martin';
  return null;
}

export function isSupportedCounty(raw) {
  return normalizeCountyName(raw) != null;
}

/**
 * Coarse latitude/longitude bands derived from parcel extents in county_parcels:
 *   Broward     lat 25.957 – 26.354
 *   Palm Beach  lat 26.321 – 26.971 (lng -80.885 – -80.032)
 *   Martin      lat 26.957 – 27.264 (lng -80.677 – -80.081)
 * The overlap zones around the Broward/Palm Beach line (26.32–26.36) and the
 * Palm Beach/Martin line (26.955–26.972) are ambiguous and return null, so callers
 * must rely on a parcel match there.
 */
export function estimateCountyFromCoords(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (lo > -79.9 || lo < -80.95) return null;
  if (la >= 25.957 && la < 26.318) return 'Broward';
  if (la >= 26.36 && la < 26.954) return 'Palm Beach';
  if (la >= 26.973 && la <= 27.27 && lo >= -80.7) return 'Martin';
  // West of -80.3 the Palm Beach / Martin line sits near 27.0
  if (la >= 26.954 && la < 26.995 && lo < -80.3) return 'Palm Beach';
  return null;
}

/**
 * Resolves a property's county: linked parcel county first, then the saved county
 * (if supported), then a coarse coordinate estimate. Returns null if unknown.
 */
export function resolvePropertyCounty(property) {
  if (!property) return null;
  return (
    normalizeCountyName(property.parcel_county) ||
    normalizeCountyName(property.county) ||
    estimateCountyFromCoords(property.lat, property.lng)
  );
}

/** Display label for a county ("Martin"), falling back to the raw saved value. */
export function getPropertyCountyLabel(property, fallback = '—') {
  const resolved = resolvePropertyCounty(property);
  if (resolved) return resolved;
  const raw = property?.county ? String(property.county).trim() : '';
  return raw || fallback;
}

/** "Martin County Property Appraiser" (or a generic label when unknown). */
export function getCountyAppraiserLabel(county) {
  const name = normalizeCountyName(county);
  return name ? COUNTY_META[name].appraiser : 'County Property Appraiser';
}

