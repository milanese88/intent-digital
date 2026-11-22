import { getUserFromSession } from '../_lib/session.js';
import { getDb, sendSafeApiError } from '../_lib/db.js';
import { normalizeAddress, USPS_SUFFIX_MAP } from '../../src/utils/addressNorm.js';
import { SUPPORTED_COUNTIES, normalizeCountyName } from '../../src/config/counties.js';
import { fetchBuildingCharacteristicsMap, lookupBuildingRecord } from '../_lib/buildingChars.js';

export { normalizeAddress, normalizeAddress as normalizeAddressQuery };

const SUFFIX_VALUES = new Set(Object.values(USPS_SUFFIX_MAP));
const TRAILING_DIRECTIONS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);

/**
 * Orders supported counties so the property's own county (if known) is searched first.
 * Unknown / "Other" counties search every supported county.
 */
export function resolveSearchCounties(rawCounty) {
  const preferred = normalizeCountyName(rawCounty);
  if (!preferred) return [...SUPPORTED_COUNTIES];
  return [preferred, ...SUPPORTED_COUNTIES.filter((c) => c !== preferred)];
}

/**
 * Street name without its trailing USPS suffix (and trailing directional), so
 * "SE RIVER RIDGE CT" and "SE RIVER RIDGE RD" share the base "SE RIVER RIDGE".
 * Returns null when there is no suffix to strip or the base would be too short.
 */
export function stripStreetSuffix(street) {
  const tokens = String(street || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  let end = tokens.length;
  if (TRAILING_DIRECTIONS.has(tokens[end - 1]) && end - 1 >= 2 && SUFFIX_VALUES.has(tokens[end - 2])) {
    end -= 1;
  }
  if (!SUFFIX_VALUES.has(tokens[end - 1])) return null;
  const base = tokens.slice(0, end - 1).join(' ');
  // Require at least one non-directional word (avoid matching just "SE")
  const meaningful = tokens.slice(0, end - 1).filter((t) => !TRAILING_DIRECTIONS.has(t));
  return meaningful.length > 0 && base.length >= 3 ? base : null;
}

function sortByPreference(rows, counties, lat, lng) {
  const rank = new Map(counties.map((c, i) => [c, i]));
  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const dist = (r) => {
    if (!hasCoords || r.lat == null || r.lng == null) return Number.POSITIVE_INFINITY;
    const dy = (Number(r.lat) - lat) * 111320;
    const dx = (Number(r.lng) - lng) * 111320 * Math.cos((lat * Math.PI) / 180);
    return Math.sqrt(dx * dx + dy * dy);
  };
  return [...rows].sort((a, b) => {
    const da = dist(a);
    const db = dist(b);
    if (da !== db) return da - db;
    return (rank.get(a.county) ?? 99) - (rank.get(b.county) ?? 99);
  });
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const rawQ = req.query?.q || '';
    const queryZip = req.query?.zip ? String(req.query.zip).trim() : null;
    const queryCounty = req.query?.county ? String(req.query.county).trim() : null;
    const lat = req.query?.lat ? parseFloat(req.query.lat) : null;
    const lng = req.query?.lng ? parseFloat(req.query.lng) : null;
    const hasCoords = lat != null && !isNaN(lat) && lng != null && !isNaN(lng);

    // Standardize address using shared normalizer
    const norm = normalizeAddress(rawQ);
    const targetZip = /^\d{5}$/.test(String(queryZip || '')) ? queryZip : norm.zip;
    const targetNumber = norm.number || '';
    const targetStreet = norm.street || '';
    const targetNormalized = norm.normalized || '';
    const streetBase = stripStreetSuffix(targetStreet);

    const sql = getDb();

    // 1. Enforce 5-second statement timeout to prevent hanging queries
    try {
      await sql`SET LOCAL statement_timeout = '5000ms';`;
    } catch {
      // Some serverless connection poolers ignore SET LOCAL; continue safely
    }

    // Counties to search: the property's county first, then every other supported county
    // ("Other" / unknown / "all" searches all supported counties).
    const counties = resolveSearchCounties(queryCounty === 'all' ? null : queryCounty);

    // Helper to send formatted response (enriched with current CAMA building data so the
    // dropdown / live-in fit never relies on a stale vacant-land use code)
    const sendResponse = async (status, results, matchType, requiresConfirmation, message) => {
      let bcMap = new Map();
      if (results.length > 0) {
        try {
          bcMap = await fetchBuildingCharacteristicsMap(sql, results.map((r) => r.parcel_id));
        } catch {
          bcMap = new Map();
        }
      }
      const decorated = results.map(r => {
        const bc = lookupBuildingRecord(bcMap, r.county, r.parcel_id);
        return {
          ...r,
          bc_living_sqft: bc?.living_area_sqft != null ? Number(bc.living_area_sqft) : null,
          bc_year_built: bc?.year_built != null ? Number(bc.year_built) : null,
          bc_beds: bc?.beds != null ? Number(bc.beds) : null,
          bc_property_class: bc?.property_class || null,
          matchType,
          requiresConfirmation
        };
      });
      if (req.query?.format === 'array') {
        return res.status(status).json(decorated);
      }
      return res.status(status).json({
        results: decorated,
        matchType,
        requiresConfirmation,
        normalizedQuery: targetNormalized || rawQ,
        searchedCounties: counties,
        message
      });
    };

    // Same house number + street condition, optionally zip-filtered, across all searched counties.
    // Always uses idx_county_parcels_addr_pattern (county, lower(address) text_pattern_ops) via
    // county = ANY(): it is populated for every county, whereas situs_number/situs_street_norm
    // are only filled for some counties (mixing the two would silently miss Broward/Palm Beach).
    const queryByStreet = async ({ streetEq = null, streetLike = null, zip = null, limit = 5 }) => {
      const addrCond = streetEq != null
        ? sql`lower(address) = ${`${targetNumber} ${streetEq}`.toLowerCase()}`
        : sql`lower(address) LIKE ${`${targetNumber} ${streetLike}`.toLowerCase()}`;
      const zipCond = zip ? sql`AND zip = ${zip}` : sql``;
      return sql`
        SELECT county, parcel_id, address, city, zip, use_code,
               living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng
        FROM county_parcels
        WHERE county = ANY(${counties})
          AND ${addrCond}
          ${zipCond}
        ORDER BY address ASC
        LIMIT ${limit};
      `;
    };

    // =========================================================================
    // STEP 0: FOLIO / PARCEL ID LOOKUP (digits-only folios, or dashed Martin folios)
    // =========================================================================
    const rawTrim = String(rawQ).trim();
    const cleanFolio = rawTrim.replace(/[^0-9]/g, '');
    const looksLikeFolio = /^[0-9][0-9\s.-]+$/.test(rawTrim) && cleanFolio.length >= 10 && cleanFolio.length <= 20;
    if (looksLikeFolio) {
      const rows = await sql`
        SELECT county, parcel_id, address, city, zip, use_code,
               living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng
        FROM county_parcels
        WHERE county = ANY(${counties})
          AND parcel_id = ANY(${[...new Set([cleanFolio, rawTrim])]})
        LIMIT 3;
      `;
      if (rows.length > 0) {
        return await sendResponse(200, sortByPreference(rows, counties, lat, lng).slice(0, 1), 'exact', false, 'Found exact folio match');
      }
    }

    // =========================================================================
    // STEP 1: EXACT MATCH (House Number + Normalized Street [+ Zip])
    // =========================================================================
    if (targetNumber && targetStreet) {
      let exactResults = [];
      if (targetZip) {
        exactResults = await queryByStreet({ streetEq: targetStreet, zip: targetZip, limit: 5 });
      }
      if (exactResults.length === 0) {
        exactResults = await queryByStreet({ streetEq: targetStreet, limit: 5 });
      }

      if (exactResults.length > 0) {
        const payload = sortByPreference(exactResults, counties, lat, lng).slice(0, 5);
        // Same address in more than one county (or multiple units) needs confirmation
        const ambiguous = payload.length > 1;
        return await sendResponse(
          200,
          payload,
          'exact',
          ambiguous,
          `Found ${payload.length} exact match${payload.length > 1 ? 'es' : ''}`
        );
      }
    }

    // =========================================================================
    // STEP 2: SAME NUMBER + SAME STREET NAME, DIFFERENT SUFFIX (e.g. CT vs RD)
    // County situs zips can be blank (Martin), so retry without the zip filter.
    // =========================================================================
    if (targetNumber && streetBase) {
      let rows = [];
      if (targetZip) {
        rows = await queryByStreet({ streetLike: `${streetBase} %`, zip: targetZip, limit: 5 });
      }
      if (rows.length === 0) {
        rows = await queryByStreet({ streetLike: `${streetBase} %`, limit: 5 });
      }
      if (rows.length > 0) {
        const payload = sortByPreference(rows, counties, lat, lng).slice(0, 5);
        return await sendResponse(
          200,
          payload,
          'fallback_suffix',
          true,
          'Is this it? Same house number and street name with a different suffix on the county roll:'
        );
      }
    }

    // =========================================================================
    // STEP 3: FALLBACK PREFIX (Same Number, Street LIKE Prefix [, Same Zip])
    // =========================================================================
    if (targetNumber && targetStreet.length >= 2) {
      let prefixResults = [];
      // Specific street prefix first (with zip, then without), then first-word prefix (zip only)
      const attempts = [
        { streetLike: `${targetStreet}%`, zip: targetZip },
        ...(targetZip ? [{ streetLike: `${targetStreet}%`, zip: null }] : [])
      ];
      const firstWord = targetStreet.split(' ')[0];
      if (firstWord && firstWord !== targetStreet && firstWord.length >= 2 && targetZip) {
        attempts.push({ streetLike: `${firstWord}%`, zip: targetZip });
      }

      for (const attempt of attempts) {
        prefixResults = await queryByStreet({ ...attempt, limit: 5 });
        if (prefixResults.length > 0) break;
      }

      if (prefixResults.length > 0) {
        const payload = sortByPreference(prefixResults, counties, lat, lng).slice(0, 5);
        return await sendResponse(
          200,
          payload,
          'fallback_prefix',
          true,
          'Is this it? Similar addresses found nearby:'
        );
      }
    }

    // =========================================================================
    // STEP 4: NEAREST PARCEL WITHIN 60m OF THE MAP POINT (all supported counties)
    // =========================================================================
    if (hasCoords) {
      const latDelta = 0.0006; // ~66m latitude
      const lngDelta = 0.0007; // ~70m longitude at Florida latitude

      const rows = await sql`
        SELECT county, parcel_id, address, city, zip, use_code,
               living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng,
               ROUND((6371000 * acos(LEAST(1.0, GREATEST(-1.0,
                 cos(radians(${lat})) * cos(radians(lat)) * cos(radians(lng) - radians(${lng})) +
                 sin(radians(${lat})) * sin(radians(lat))
               ))))::numeric, 1) as distance_m
        FROM county_parcels
        WHERE county = ANY(${counties})
          AND lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
          AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
        ORDER BY distance_m ASC
        LIMIT 3;
      `;

      const nearby = rows.filter(r => Number(r.distance_m) <= 60);
      if (nearby.length > 0) {
        return await sendResponse(
          200,
          nearby.slice(0, 3),
          'fallback_coords',
          true,
          'Is this it? Nearest parcel based on map coordinates:'
        );
      }
    }

    // =========================================================================
    // STEP 5: NO MATCH FOUND
    // =========================================================================
    const failureMsg = `No match found for ${targetNormalized || rawQ} in ${counties.join(', ')} county records — try editing the address or pick from the map.`;
    return await sendResponse(200, [], 'none', false, failureMsg);

  } catch (err) {
    if (err.code === '57014' || (err.message && err.message.includes('statement_timeout'))) {
      console.error('Timeout in /api/county/search:', err);
      return res.status(504).json({
        error: 'Search timed out after 5 seconds. Please refine your search query or pick from the map.',
        timeout: true
      });
    }
    return sendSafeApiError(res, err, 'Error in /api/county/search', 'Unable to search county parcels right now.');
  }
}
