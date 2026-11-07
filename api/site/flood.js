import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

const FEMA_ZONE_LAYER_URL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query';
const FEMA_PANEL_LAYER_URL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/3/query';

/**
 * Computes plain-English flood description and display label based on FEMA zone attributes.
 */
export function getFloodZoneDetails(zone, subtype, sfha, bfe) {
  const z = String(zone || '').trim().toUpperCase();
  const sub = String(subtype || '').trim().toUpperCase();
  const isSfha = sfha === true || sfha === 'T' || sfha === 'true' || ['A', 'AE', 'AH', 'AO', 'AR', 'A99', 'V', 'VE'].includes(z);
  const is500Year = z === 'X' && (sub.includes('0.2') || sub.includes('500') || sub.includes('0.2 PCT'));

  // Label construction (e.g. "AE · BFE 7 ft", "VE", "X shaded", "X")
  let label = z || 'Unknown';
  if (is500Year) {
    label = 'X shaded';
  } else if (bfe != null && !isNaN(Number(bfe)) && Number(bfe) > 0) {
    label = `${z} · BFE ${Math.round(Number(bfe))} ft`;
  }

  // Plain-English description
  let description = 'Flood risk determination available on official FIRM map.';
  let riskLevel = 'minimal';

  if (isSfha) {
    riskLevel = 'high';
    description = 'High-risk flood area. Flood insurance is typically required with a mortgage, and new construction must be elevated to the base flood elevation plus local freeboard.';
  } else if (is500Year) {
    riskLevel = 'moderate';
    description = 'Moderate flood risk.';
  } else if (z === 'X') {
    riskLevel = 'minimal';
    description = 'Minimal flood risk.';
  }

  return {
    label,
    riskLevel,
    description,
    isSfha
  };
}

/**
 * Queries FEMA NFHL REST endpoints server-side with an 8-second timeout.
 */
export async function queryFemaNFHL(lng, lat) {
  const lonNum = Number(lng);
  const latNum = Number(lat);

  if (isNaN(lonNum) || isNaN(latNum)) {
    throw new Error('Valid lat and lng numeric coordinates are required to query FEMA.');
  }

  const zoneUrl = new URL(FEMA_ZONE_LAYER_URL);
  zoneUrl.searchParams.set('geometry', `${lonNum},${latNum}`);
  zoneUrl.searchParams.set('geometryType', 'esriGeometryPoint');
  zoneUrl.searchParams.set('inSR', '4326');
  zoneUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  zoneUrl.searchParams.set('outFields', 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE');
  zoneUrl.searchParams.set('returnGeometry', 'false');
  zoneUrl.searchParams.set('f', 'json');

  const panelUrl = new URL(FEMA_PANEL_LAYER_URL);
  panelUrl.searchParams.set('geometry', `${lonNum},${latNum}`);
  panelUrl.searchParams.set('geometryType', 'esriGeometryPoint');
  panelUrl.searchParams.set('inSR', '4326');
  panelUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  panelUrl.searchParams.set('outFields', 'FIRM_PAN,EFF_DATE');
  panelUrl.searchParams.set('returnGeometry', 'false');
  panelUrl.searchParams.set('f', 'json');

  const fetchOptions = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(8000)
  };

  const [resZone, resPanel] = await Promise.all([
    fetch(zoneUrl.toString(), fetchOptions).then(r => {
      if (!r.ok) throw new Error(`FEMA Zone query failed: ${r.status}`);
      return r.json();
    }),
    fetch(panelUrl.toString(), fetchOptions).then(r => {
      if (!r.ok) throw new Error(`FEMA Panel query failed: ${r.status}`);
      return r.json();
    })
  ]);

  const zoneFeature = resZone?.features?.[0]?.attributes || {};
  const panelFeature = resPanel?.features?.[0]?.attributes || {};

  const floodZone = zoneFeature.FLD_ZONE || 'X';
  const floodSubtype = zoneFeature.ZONE_SUBTY || null;
  const floodSfha = zoneFeature.SFHA_TF === 'T';
  const rawBfe = zoneFeature.STATIC_BFE;
  const floodBfe = (rawBfe != null && !isNaN(Number(rawBfe)) && Number(rawBfe) > -9990) ? Number(rawBfe) : null;
  const floodPanel = panelFeature.FIRM_PAN || null;
  const floodEffectiveDate = panelFeature.EFF_DATE ? new Date(panelFeature.EFF_DATE).toISOString().slice(0, 10) : null;

  return {
    flood_zone: floodZone,
    flood_subtype: floodSubtype,
    flood_sfha: floodSfha,
    flood_bfe: floodBfe,
    flood_panel: floodPanel,
    flood_effective_date: floodEffectiveDate,
    flood_source: 'FEMA NFHL',
    flood_checked_at: new Date().toISOString()
  };
}

/**
 * Handler for GET /api/site/flood
 * Returns flood hazard data for parcel_id/county or coordinates.
 * Cached in parcel_site_info for 90 days.
 */
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

    const { county: rawCounty, parcel_id: rawParcelId, lat: queryLat, lng: queryLng, refresh } = req.query || {};
    const county = /palm/i.test(rawCounty || '') ? 'Palm Beach' : 'Broward';
    const parcelId = rawParcelId ? String(rawParcelId).trim() : null;
    const forceRefresh = refresh === '1' || refresh === 'true';

    const sql = getDb();

    // 1. Check cached row in parcel_site_info if county & parcel_id provided
    if (parcelId && !forceRefresh) {
      try {
        const cached = await sql`
          SELECT 
            county,
            parcel_id,
            flood_zone,
            flood_subtype,
            flood_sfha,
            flood_bfe,
            flood_panel,
            flood_effective_date::text,
            flood_source,
            flood_checked_at
          FROM parcel_site_info
          WHERE county = ${county} AND parcel_id = ${parcelId}
          LIMIT 1;
        `;

        if (cached.length > 0) {
          const row = cached[0];
          const checkedTime = row.flood_checked_at ? new Date(row.flood_checked_at).getTime() : 0;
          const ageDays = (Date.now() - checkedTime) / (1000 * 60 * 60 * 24);

          // Cached within 90 days
          if (ageDays < 90) {
            const details = getFloodZoneDetails(row.flood_zone, row.flood_subtype, row.flood_sfha, row.flood_bfe);
            return res.status(200).json({
              ...row,
              ...details,
              cached: true
            });
          }
        }
      } catch (dbErr) {
        // Table might not exist yet if awaiting migration
        if (dbErr.code !== '42P01') {
          console.warn('Error reading from parcel_site_info:', dbErr.message);
        }
      }
    }

    // 2. Resolve coordinates: from query parameters or from county_parcels
    let lat = queryLat != null && queryLat !== '' ? Number(queryLat) : null;
    let lng = queryLng != null && queryLng !== '' ? Number(queryLng) : null;

    if ((lat == null || lng == null || isNaN(lat) || isNaN(lng)) && parcelId) {
      const pRows = await sql`
        SELECT lat, lng 
        FROM county_parcels 
        WHERE county = ${county} AND parcel_id = ${parcelId}
        LIMIT 1;
      `;
      if (pRows.length > 0 && pRows[0].lat != null && pRows[0].lng != null) {
        lat = Number(pRows[0].lat);
        lng = Number(pRows[0].lng);
      }
    }

    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        error: 'Parcel coordinates (lat/lng) are missing or not yet indexed. Unable to query FEMA flood zones.'
      });
    }

    // 3. Query FEMA NFHL REST service
    let femaResult;
    try {
      femaResult = await queryFemaNFHL(lng, lat);
    } catch (femaErr) {
      console.error('FEMA NFHL query error:', femaErr.message);
      return res.status(200).json({
        unavailable: true,
        error: 'FEMA flood hazard service is currently unavailable or timed out. Please try again later.'
      });
    }

    // 4. Save to parcel_site_info if parcelId is known
    let savedRow = {
      county,
      parcel_id: parcelId,
      ...femaResult
    };

    if (parcelId) {
      try {
        const upsert = await sql`
          INSERT INTO parcel_site_info (
            county,
            parcel_id,
            flood_zone,
            flood_subtype,
            flood_sfha,
            flood_bfe,
            flood_panel,
            flood_effective_date,
            flood_source,
            flood_checked_at
          ) VALUES (
            ${county},
            ${parcelId},
            ${femaResult.flood_zone},
            ${femaResult.flood_subtype},
            ${femaResult.flood_sfha},
            ${femaResult.flood_bfe},
            ${femaResult.flood_panel},
            ${femaResult.flood_effective_date},
            ${femaResult.flood_source},
            ${femaResult.flood_checked_at}
          )
          ON CONFLICT (county, parcel_id) DO UPDATE SET
            flood_zone = EXCLUDED.flood_zone,
            flood_subtype = EXCLUDED.flood_subtype,
            flood_sfha = EXCLUDED.flood_sfha,
            flood_bfe = EXCLUDED.flood_bfe,
            flood_panel = EXCLUDED.flood_panel,
            flood_effective_date = EXCLUDED.flood_effective_date,
            flood_source = EXCLUDED.flood_source,
            flood_checked_at = EXCLUDED.flood_checked_at
          RETURNING *;
        `;
        if (upsert.length > 0) {
          savedRow = upsert[0];
        }
      } catch (dbErr) {
        if (dbErr.code !== '42P01') {
          console.warn('Could not save to parcel_site_info:', dbErr.message);
        }
      }
    }

    const details = getFloodZoneDetails(
      savedRow.flood_zone,
      savedRow.flood_subtype,
      savedRow.flood_sfha,
      savedRow.flood_bfe
    );

    return res.status(200).json({
      ...savedRow,
      ...details,
      cached: false
    });
  } catch (err) {
    console.error('Unhandled error in /api/site/flood:', err);
    return res.status(500).json({ error: 'Internal server error checking flood hazard.' });
  }
}
