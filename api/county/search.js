import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import { normalizeAddress } from '../../src/utils/addressNorm.js';

export { normalizeAddress, normalizeAddress as normalizeAddressQuery };

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

    // Standardize address using shared normalizer
    const norm = normalizeAddress(rawQ);
    const targetZip = queryZip || norm.zip;
    const targetNumber = norm.number || '';
    const targetStreet = norm.street || '';
    const targetNormalized = norm.normalized || '';

    const sql = getDb();

    // 1. Enforce 5-second statement timeout to prevent hanging queries
    try {
      await sql`SET LOCAL statement_timeout = '5000ms';`;
    } catch {
      // Some serverless connection poolers ignore SET LOCAL; continue safely
    }

    // Determine counties to search
    const counties = (queryCounty && queryCounty !== 'all') 
      ? [queryCounty] 
      : ['Broward', 'Palm Beach'];

    // Check if new normalized columns exist
    let hasNormColumns = false;
    try {
      const colCheck = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'county_parcels' AND column_name = 'situs_street_norm';
      `;
      hasNormColumns = colCheck.length > 0;
    } catch {
      hasNormColumns = false;
    }

    // Helper to send formatted response
    const sendResponse = (status, results, matchType, requiresConfirmation, message) => {
      const decorated = results.map(r => ({
        ...r,
        matchType,
        requiresConfirmation
      }));
      if (req.query?.format === 'array') {
        return res.status(status).json(decorated);
      }
      return res.status(status).json({
        results: decorated,
        matchType,
        requiresConfirmation,
        normalizedQuery: targetNormalized || rawQ,
        message
      });
    };

    // =========================================================================
    // STEP 0: FOLIO / PARCEL ID LOOKUP (if query is purely digits or parcel folio)
    // =========================================================================
    const cleanFolio = String(rawQ).replace(/[^0-9]/g, '');
    if (cleanFolio.length >= 10 && cleanFolio.length <= 13) {
      for (const county of counties) {
        const rows = await sql`
          SELECT county, parcel_id, address, city, zip, use_code,
                 living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng
          FROM county_parcels
          WHERE county = ${county} AND parcel_id = ${cleanFolio}
          LIMIT 1;
        `;
        if (rows.length > 0) {
          return sendResponse(200, rows, 'exact', false, 'Found exact folio match');
        }
      }
    }

    // =========================================================================
    // STEP 1: EXACT MATCH (House Number + Normalized Street [+ Zip])
    // =========================================================================
    let exactResults = [];
    if (targetNumber && targetStreet) {
      for (const county of counties) {
        let rows = [];
        if (hasNormColumns) {
          if (targetZip) {
            rows = await sql`
              SELECT county, parcel_id, address, city, zip, use_code,
                     living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng
              FROM county_parcels
              WHERE county = ${county}
                AND situs_number = ${targetNumber}
                AND situs_street_norm = ${targetStreet}
                AND zip = ${targetZip}
              LIMIT 2;
            `;
          }
          if (rows.length === 0) {
            rows = await sql`
              SELECT county, parcel_id, address, city, zip, use_code,
                     living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng
              FROM county_parcels
              WHERE county = ${county}
                AND situs_number = ${targetNumber}
                AND situs_street_norm = ${targetStreet}
              LIMIT 2;
            `;
          }
        } else {
          // Fallback to existing text_pattern_ops index on lower(address)
          const lowerAddr = targetNormalized.toLowerCase();
          if (targetZip) {
            rows = await sql`
              SELECT county, parcel_id, address, city, zip, use_code,
                     living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng
              FROM county_parcels
              WHERE county = ${county}
                AND lower(address) = ${lowerAddr}
                AND zip = ${targetZip}
              LIMIT 2;
            `;
          }
          if (rows.length === 0) {
            rows = await sql`
              SELECT county, parcel_id, address, city, zip, use_code,
                     living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng
              FROM county_parcels
              WHERE county = ${county}
                AND lower(address) = ${lowerAddr}
              LIMIT 2;
            `;
          }
        }

        if (rows.length > 0) {
          exactResults.push(...rows);
        }
      }

      if (exactResults.length > 0) {
        const payload = exactResults.slice(0, 5);
        return sendResponse(
          200,
          payload,
          'exact',
          false,
          `Found ${payload.length} exact match${payload.length > 1 ? 'es' : ''}`
        );
      }
    }

    // =========================================================================
    // STEP 2: FALLBACK 1 (Same Number, Street LIKE Prefix, Same Zip - Limit 5)
    // =========================================================================
    let prefixResults = [];
    if (targetNumber && targetStreet.length >= 2) {
      // Try specific street prefix first (e.g. "NW 18%"), then first-word prefix (e.g. "NW%")
      const prefixesToTry = [targetStreet];
      const firstWord = targetStreet.split(' ')[0];
      if (firstWord && firstWord !== targetStreet && firstWord.length >= 2) {
        prefixesToTry.push(firstWord);
      }

      for (const prefix of prefixesToTry) {
        for (const county of counties) {
          let rows = [];
          if (hasNormColumns) {
            const pattern = `${prefix}%`;
            if (targetZip) {
              rows = await sql`
                SELECT county, parcel_id, address, city, zip, use_code,
                       living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng
                FROM county_parcels
                WHERE county = ${county}
                  AND situs_number = ${targetNumber}
                  AND situs_street_norm LIKE ${pattern}
                  AND zip = ${targetZip}
                ORDER BY situs_street_norm ASC
                LIMIT 5;
              `;
            } else {
              rows = await sql`
                SELECT county, parcel_id, address, city, zip, use_code,
                       living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng
                FROM county_parcels
                WHERE county = ${county}
                  AND situs_number = ${targetNumber}
                  AND situs_street_norm LIKE ${pattern}
                ORDER BY situs_street_norm ASC
                LIMIT 5;
              `;
            }
          } else {
            const pattern = `${targetNumber.toLowerCase()} ${prefix.toLowerCase()}%`;
            if (targetZip) {
              rows = await sql`
                SELECT county, parcel_id, address, city, zip, use_code,
                       living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng
                FROM county_parcels
                WHERE county = ${county}
                  AND lower(address) LIKE ${pattern}
                  AND zip = ${targetZip}
                ORDER BY address ASC
                LIMIT 5;
              `;
            } else {
              rows = await sql`
                SELECT county, parcel_id, address, city, zip, use_code,
                       living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng
                FROM county_parcels
                WHERE county = ${county}
                  AND lower(address) LIKE ${pattern}
                ORDER BY address ASC
                LIMIT 5;
              `;
            }
          }

          if (rows.length > 0) {
            prefixResults.push(...rows);
          }
        }

        // If we found matches with the more specific prefix, stop searching broader prefixes
        if (prefixResults.length > 0) {
          break;
        }
      }

      if (prefixResults.length > 0) {
        const payload = prefixResults.slice(0, 5);
        return sendResponse(
          200,
          payload,
          'fallback_prefix',
          true,
          'Is this it? Similar addresses found nearby:'
        );
      }
    }

    // =========================================================================
    // STEP 3: FALLBACK 2 (Nearest Parcel Within 60m via Existing Coords Index)
    // =========================================================================
    if (lat != null && !isNaN(lat) && lng != null && !isNaN(lng)) {
      let coordsResults = [];
      const latDelta = 0.0006; // ~66m latitude
      const lngDelta = 0.0007; // ~70m longitude at Florida latitude

      for (const county of counties) {
        const rows = await sql`
          SELECT county, parcel_id, address, city, zip, use_code,
                 living_sqft, year_built, eff_year_built, land_sqft, units, just_value, lat, lng,
                 ROUND((6371000 * acos(LEAST(1.0, GREATEST(-1.0,
                   cos(radians(${lat})) * cos(radians(lat)) * cos(radians(lng) - radians(${lng})) +
                   sin(radians(${lat})) * sin(radians(lat))
                 ))))::numeric, 1) as distance_m
          FROM county_parcels
          WHERE county = ${county}
            AND lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
            AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
          ORDER BY distance_m ASC
          LIMIT 3;
        `;

        const nearby = rows.filter(r => Number(r.distance_m) <= 60);
        if (nearby.length > 0) {
          coordsResults.push(...nearby);
        }
      }

      if (coordsResults.length > 0) {
        coordsResults.sort((a, b) => Number(a.distance_m) - Number(b.distance_m));
        const payload = coordsResults.slice(0, 3);
        return sendResponse(
          200,
          payload,
          'fallback_coords',
          true,
          'Is this it? Nearest parcel based on map coordinates:'
        );
      }
    }

    // =========================================================================
    // STEP 4: NO MATCH FOUND
    // =========================================================================
    const failureMsg = `No match found for ${targetNormalized || rawQ} — try editing the address or pick from the map.`;
    return sendResponse(200, [], 'none', false, failureMsg);

  } catch (err) {
    console.error('Error in /api/county/search:', err);
    if (err.code === '57014' || (err.message && err.message.includes('statement_timeout'))) {
      return res.status(504).json({
        error: 'Search timed out after 5 seconds. Please refine your search query or pick from the map.',
        timeout: true
      });
    }
    return res.status(500).json({ error: 'Internal server error while searching county parcels' });
  }
}
