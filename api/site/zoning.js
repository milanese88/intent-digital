import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

const USER_AGENT = 'IntentDigital-InvestorStudio/1.0';

/**
 * Helper to point-query an ArcGIS REST endpoint with an 8-second timeout.
 */
async function queryArcGisPoint(serviceUrl, lng, lat, outFields = '*') {
  const queryUrl = new URL(serviceUrl.endsWith('/') ? `${serviceUrl}query` : `${serviceUrl}/query`);
  queryUrl.searchParams.set('geometry', `${lng},${lat}`);
  queryUrl.searchParams.set('geometryType', 'esriGeometryPoint');
  queryUrl.searchParams.set('inSR', '4326');
  queryUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  queryUrl.searchParams.set('outFields', outFields);
  queryUrl.searchParams.set('returnGeometry', 'false');
  queryUrl.searchParams.set('f', 'json');

  const res = await fetch(queryUrl.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${serviceUrl}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || 'ArcGIS query error');
  }

  return data.features || [];
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();

    // PATCH: Save manual zoning code
    if (req.method === 'PATCH') {
      const { county: rawCounty, parcel_id, zoning_code, zoning_desc } = req.body || {};
      const county = /palm/i.test(rawCounty || '') ? 'Palm Beach' : 'Broward';

      if (!parcel_id || !zoning_code) {
        return res.status(400).json({ error: 'parcel_id and zoning_code are required.' });
      }

      const cleanCode = String(zoning_code).trim().toUpperCase();
      const cleanDesc = zoning_desc ? String(zoning_desc).trim() : null;

      const updated = await sql`
        INSERT INTO parcel_site_info (
          county,
          parcel_id,
          zoning_code,
          zoning_desc,
          zoning_source,
          zoning_checked_at
        ) VALUES (
          ${county},
          ${parcel_id},
          ${cleanCode},
          ${cleanDesc},
          'manual',
          NOW()
        )
        ON CONFLICT (county, parcel_id) DO UPDATE SET
          zoning_code = EXCLUDED.zoning_code,
          zoning_desc = EXCLUDED.zoning_desc,
          zoning_source = 'manual',
          zoning_checked_at = NOW()
        RETURNING *;
      `;

      return res.status(200).json({
        success: true,
        zoning_code: cleanCode,
        zoning_desc: cleanDesc,
        zoning_source: 'manual',
        zoning_checked_at: updated[0].zoning_checked_at
      });
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET', 'PATCH']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    // GET: Query zoning & historic info
    const { county: rawCounty, parcel_id, refresh } = req.query || {};
    const county = /palm/i.test(rawCounty || '') ? 'Palm Beach' : 'Broward';
    const forceRefresh = refresh === '1' || refresh === 'true';

    if (!parcel_id) {
      return res.status(400).json({ error: 'parcel_id is required.' });
    }

    // 1. Determine municipality from parcel_jurisdiction
    let municipality = 'Unknown';
    try {
      const jRows = await sql`
        SELECT municipality 
        FROM parcel_jurisdiction 
        WHERE county = ${county} AND parcel_id = ${parcel_id} 
        LIMIT 1;
      `;
      if (jRows.length > 0) {
        municipality = jRows[0].municipality;
      }
    } catch (e) {
      // Fallback
    }

    // 2. Fetch external zoning map and code links
    let links = { zoning_map_url: null, code_url: null };
    try {
      const linkRows = await sql`
        SELECT zoning_map_url, code_url 
        FROM city_zoning_links 
        WHERE municipality = ${municipality} 
        LIMIT 1;
      `;
      if (linkRows.length > 0) {
        links = linkRows[0];
      }
    } catch (e) {
      // ignore
    }

    // 3. Check 90-day cached row in parcel_site_info
    let cachedRow = null;
    try {
      const cRows = await sql`
        SELECT 
          municipality,
          zoning_code,
          zoning_desc,
          zoning_source,
          zoning_checked_at,
          historic_district,
          historic_site,
          overlays,
          historic_checked_at
        FROM parcel_site_info
        WHERE county = ${county} AND parcel_id = ${parcel_id}
        LIMIT 1;
      `;
      if (cRows.length > 0) {
        cachedRow = cRows[0];
      }
    } catch (e) {
      // table column might be missing if migration pending
    }

    const now = Date.now();
    const zoningCheckedTime = cachedRow?.zoning_checked_at ? new Date(cachedRow.zoning_checked_at).getTime() : 0;
    const isZoningCached = (now - zoningCheckedTime) < (90 * 24 * 60 * 60 * 1000);

    // If cached within 90 days and not forced to refresh, return cached
    if (cachedRow && isZoningCached && !forceRefresh) {
      return res.status(200).json({
        available: !!cachedRow.zoning_code,
        municipality,
        zoning_code: cachedRow.zoning_code,
        zoning_desc: cachedRow.zoning_desc,
        zoning_source: cachedRow.zoning_source,
        zoning_checked_at: cachedRow.zoning_checked_at,
        historic_district: cachedRow.historic_district,
        historic_site: !!cachedRow.historic_site,
        overlays: cachedRow.overlays || [],
        historic_checked_at: cachedRow.historic_checked_at,
        zoning_map_url: links.zoning_map_url,
        code_url: links.code_url,
        cached: true
      });
    }

    // 4. Query active data sources for this municipality
    let sources = [];
    try {
      sources = await sql`
        SELECT id, kind, service_url, code_field, name_field, notes
        FROM site_data_sources
        WHERE municipality = ${municipality} AND active = true;
      `;
    } catch (e) {
      // ignore
    }

    const hasZoningSource = sources.some(s => s.kind === 'zoning');
    const hasHistoricSource = sources.some(s => s.kind === 'historic_district' || s.kind === 'historic_site');

    // If no zoning source online for this city, return available: false + manual data
    if (!hasZoningSource) {
      return res.status(200).json({
        available: false,
        municipality,
        zoning_code: cachedRow?.zoning_code || null,
        zoning_desc: cachedRow?.zoning_desc || null,
        zoning_source: cachedRow?.zoning_source || null,
        zoning_checked_at: cachedRow?.zoning_checked_at || null,
        historic_district: cachedRow?.historic_district || null,
        historic_site: !!cachedRow?.historic_site,
        overlays: cachedRow?.overlays || [],
        has_historic_layer: hasHistoricSource,
        zoning_map_url: links.zoning_map_url,
        code_url: links.code_url,
        cached: false
      });
    }

    // 5. Look up parcel coordinates
    const pCoords = await sql`
      SELECT lat, lng 
      FROM county_parcels 
      WHERE county = ${county} AND parcel_id = ${parcel_id} 
      LIMIT 1;
    `;

    if (pCoords.length === 0 || pCoords[0].lat == null || pCoords[0].lng == null) {
      return res.status(200).json({
        available: false,
        municipality,
        error: 'Parcel coordinates not available for point-intersect query.',
        zoning_code: cachedRow?.zoning_code || null,
        zoning_desc: cachedRow?.zoning_desc || null,
        zoning_source: cachedRow?.zoning_source || null,
        zoning_map_url: links.zoning_map_url,
        code_url: links.code_url
      });
    }

    const lng = Number(pCoords[0].lng);
    const lat = Number(pCoords[0].lat);

    // 6. Point query each active source
    let foundZoningCode = null;
    let foundZoningDesc = null;
    let foundHistoricDistrict = null;
    let foundHistoricSite = false;
    const foundOverlays = [];

    await Promise.all(
      sources.map(async (src) => {
        try {
          const feats = await queryArcGisPoint(src.service_url, lng, lat);
          if (feats.length > 0) {
            const attr = feats[0].attributes || {};
            if (src.kind === 'zoning') {
              foundZoningCode = attr[src.code_field] || null;
              foundZoningDesc = attr[src.name_field] || null;
            } else if (src.kind === 'historic_district') {
              foundHistoricDistrict = attr[src.name_field] || 'Historic District';
            } else if (src.kind === 'historic_site') {
              foundHistoricSite = true;
            } else if (src.kind === 'overlay') {
              const name = attr[src.name_field] || src.notes || 'Special Overlay District';
              foundOverlays.push(name);
            }
          }
        } catch (srcErr) {
          console.warn(`Query failed for ${municipality} ${src.kind}:`, srcErr.message);
        }
      })
    );

    // If manual entry was preserved and city GIS returned nothing, keep manual
    const finalZoningCode = foundZoningCode || cachedRow?.zoning_code || null;
    const finalZoningDesc = foundZoningDesc || cachedRow?.zoning_desc || null;
    const finalZoningSource = foundZoningCode ? 'city_gis' : (cachedRow?.zoning_source || null);
    const checkedTimestamp = new Date().toISOString();

    // 7. Save to parcel_site_info
    try {
      await sql`
        INSERT INTO parcel_site_info (
          county,
          parcel_id,
          municipality,
          zoning_code,
          zoning_desc,
          zoning_source,
          zoning_checked_at,
          historic_district,
          historic_site,
          overlays,
          historic_checked_at
        ) VALUES (
          ${county},
          ${parcel_id},
          ${municipality},
          ${finalZoningCode},
          ${finalZoningDesc},
          ${finalZoningSource},
          ${checkedTimestamp},
          ${foundHistoricDistrict},
          ${foundHistoricSite},
          ${foundOverlays},
          ${checkedTimestamp}
        )
        ON CONFLICT (county, parcel_id) DO UPDATE SET
          municipality = EXCLUDED.municipality,
          zoning_code = COALESCE(EXCLUDED.zoning_code, parcel_site_info.zoning_code),
          zoning_desc = COALESCE(EXCLUDED.zoning_desc, parcel_site_info.zoning_desc),
          zoning_source = COALESCE(EXCLUDED.zoning_source, parcel_site_info.zoning_source),
          zoning_checked_at = EXCLUDED.zoning_checked_at,
          historic_district = EXCLUDED.historic_district,
          historic_site = EXCLUDED.historic_site,
          overlays = EXCLUDED.overlays,
          historic_checked_at = EXCLUDED.historic_checked_at;
      `;
    } catch (dbErr) {
      console.warn('Could not cache to parcel_site_info:', dbErr.message);
    }

    return res.status(200).json({
      available: !!finalZoningCode,
      municipality,
      zoning_code: finalZoningCode,
      zoning_desc: finalZoningDesc,
      zoning_source: finalZoningSource,
      zoning_checked_at: checkedTimestamp,
      historic_district: foundHistoricDistrict,
      historic_site: foundHistoricSite,
      overlays: foundOverlays,
      has_historic_layer: hasHistoricSource,
      historic_checked_at: checkedTimestamp,
      zoning_map_url: links.zoning_map_url,
      code_url: links.code_url,
      cached: false
    });
  } catch (err) {
    console.error('Error in /api/site/zoning:', err);
    return res.status(500).json({ error: 'Internal server error checking zoning.' });
  }
}
