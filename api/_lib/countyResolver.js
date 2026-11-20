import {
  SUPPORTED_COUNTIES,
  normalizeCountyName,
  estimateCountyFromCoords
} from '../../src/config/counties.js';

/**
 * Resolves the county for a point from real parcel data: the county of the nearest
 * county_parcels row within `maxMeters` (searched per county so the
 * idx_county_parcels_coords (county, lat, lng) index is used). Falls back to a
 * coarse coordinate band away from county lines.
 *
 * Returns { county, source: 'parcel' | 'coords' | null, distance_m, parcel_id }.
 */
export async function resolveCountyFromPoint(sql, lat, lng, { maxMeters = 400 } = {}) {
  const la = Number(lat);
  const lo = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(la) || !Number.isFinite(lo)) {
    return { county: null, source: null, distance_m: null, parcel_id: null };
  }

  const dLat = maxMeters / 111320;
  const dLng = maxMeters / (111320 * Math.max(0.1, Math.cos((la * Math.PI) / 180)));

  try {
    const rows = await sql`
      SELECT county, parcel_id,
             (6371000 * acos(LEAST(1.0, GREATEST(-1.0,
               cos(radians(${la})) * cos(radians(lat)) * cos(radians(lng) - radians(${lo})) +
               sin(radians(${la})) * sin(radians(lat))
             ))))::float AS distance_m
      FROM county_parcels
      WHERE county = ANY(${SUPPORTED_COUNTIES})
        AND lat BETWEEN ${la - dLat} AND ${la + dLat}
        AND lng BETWEEN ${lo - dLng} AND ${lo + dLng}
      ORDER BY distance_m ASC
      LIMIT 1;
    `;
    if (rows.length > 0 && Number(rows[0].distance_m) <= maxMeters) {
      return {
        county: normalizeCountyName(rows[0].county),
        source: 'parcel',
        distance_m: Math.round(Number(rows[0].distance_m)),
        parcel_id: rows[0].parcel_id
      };
    }
  } catch (err) {
    console.warn('[countyResolver] nearest-parcel lookup skipped:', err?.code || err?.message);
  }

  const estimated = estimateCountyFromCoords(la, lo);
  return { county: estimated, source: estimated ? 'coords' : null, distance_m: null, parcel_id: null };
}

/**
 * Applies county rules to a validated property payload (mutates and returns `data`):
 *  1. A linked parcel is authoritative: county = parcel_county.
 *  2. Otherwise, if county is empty / "Other" / unsupported and coordinates exist,
 *     resolve it from the coordinates.
 * Explicit supported choices (and other real counties like "Miami-Dade") are kept.
 */
export async function applyPropertyCountyRules(sql, data) {
  if (!data) return data;
  const parcelCounty = normalizeCountyName(data.parcel_county);
  if (data.parcel_id && parcelCounty) {
    data.parcel_county = parcelCounty;
    data.county = parcelCounty;
    return data;
  }

  const savedCounty = normalizeCountyName(data.county);
  if (savedCounty) {
    data.county = savedCounty;
    return data;
  }

  const raw = String(data.county || '').trim().toLowerCase();
  const isUnresolved = !raw || raw === 'other' || raw === 'unknown';
  if (isUnresolved && data.lat != null && data.lng != null) {
    const resolved = await resolveCountyFromPoint(sql, data.lat, data.lng);
    if (resolved.county) {
      data.county = resolved.county;
    }
  }
  return data;
}
