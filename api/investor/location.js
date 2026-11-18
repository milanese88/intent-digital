import { getUserFromSession } from '../_lib/session.js';
import { getDb, sendSafeApiError } from '../_lib/db.js';
import {
  fetchGettingAround,
  fetchSchoolsForPoint,
  fetchPeopleAndHousing,
  fetchSafetyForAddress
} from '../_lib/location-engine.js';

const SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ALLOWED_SECTIONS = new Set(['getting_around', 'schools', 'people_housing', 'safety']);

function buildFullAddressLabel(prop) {
  const parts = [
    prop.address,
    prop.city,
    [prop.state || 'FL', prop.zip].filter(Boolean).join(' ')
  ].filter(Boolean);
  return parts.join(', ');
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

    const propertyId = req.query?.property_id ? String(req.query.property_id).trim() : '';
    const forceRefresh = req.query?.refresh === '1' || req.query?.refresh === 'true';
    const requestedSection = req.query?.section ? String(req.query.section).trim() : null;

    if (!propertyId) {
      return res.status(400).json({ error: 'property_id is required.' });
    }

    if (requestedSection && !ALLOWED_SECTIONS.has(requestedSection)) {
      return res.status(400).json({ error: 'Invalid section parameter.' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // 1. Load subject property & verify ownership
    const propRows = await sql`
      SELECT id, address, city, state, zip, county, parcel_id, parcel_county, lat, lng
      FROM investor_properties
      WHERE id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
      LIMIT 1;
    `;

    if (propRows.length === 0) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    const prop = propRows[0];
    let lat = prop.lat != null ? Number(prop.lat) : null;
    let lng = prop.lng != null ? Number(prop.lng) : null;
    const county =
      prop.parcel_county ||
      prop.county ||
      (lat != null && lat >= 26.33 ? 'Palm Beach' : 'Broward');

    // Resolve coordinates from county_parcels if missing on investor_properties
    if ((lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) && prop.parcel_id) {
      const cp = await sql`
        SELECT lat, lng
        FROM county_parcels
        WHERE county = ${county} AND parcel_id = ${prop.parcel_id}
        LIMIT 1;
      `;
      if (cp.length > 0 && cp[0].lat != null && cp[0].lng != null) {
        lat = Number(cp[0].lat);
        lng = Number(cp[0].lng);
      }
    }

    const addressLabel = buildFullAddressLabel(prop);

    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(200).json({
        property_id: prop.id,
        address_label: addressLabel,
        coordinates_available: false,
        getting_around: { available: false, address: addressLabel, fetched_at: null, source: null },
        schools: { available: false, address: addressLabel, fetched_at: null, source: null },
        people_housing: { available: false, address: addressLabel, fetched_at: null, source: null },
        safety: { available: false, hidden: true, address: addressLabel, fetched_at: null, source: null }
      });
    }

    // 2. Check cached snapshot in location_snapshots (unless forceRefresh)
    let existingSnapshot = null;
    try {
      const snapRows = await sql`
        SELECT *
        FROM location_snapshots
        WHERE property_id = ${prop.id}
        LIMIT 1;
      `;
      if (snapRows.length > 0) {
        existingSnapshot = snapRows[0];
      }
    } catch (dbErr) {
      if (dbErr?.code !== '42P01') {
        console.warn('location_snapshots read warning:', dbErr.message);
      }
    }

    if (existingSnapshot && !forceRefresh) {
      const snapLat = Number(existingSnapshot.lat);
      const snapLng = Number(existingSnapshot.lng);
      const coordsMatch =
        Math.abs(snapLat - lat) <= 0.0002 && Math.abs(snapLng - lng) <= 0.0002;
      const ageMs = Date.now() - new Date(existingSnapshot.fetched_at).getTime();

      if (coordsMatch && ageMs < SNAPSHOT_MAX_AGE_MS) {
        return res.status(200).json({
          property_id: prop.id,
          address_label: existingSnapshot.address_label || addressLabel,
          county,
          lat,
          lng,
          cached: true,
          fetched_at: existingSnapshot.fetched_at,
          field_sources: existingSnapshot.field_sources || {},
          getting_around: existingSnapshot.getting_around || { available: false },
          schools: existingSnapshot.schools || { available: false },
          people_housing: existingSnapshot.people_housing || { available: false },
          safety: existingSnapshot.safety || { available: false, hidden: true }
        });
      }
    }

    // 3. Fetch requested section(s) from real coordinate-based sources
    const mapboxToken =
      process.env.MAPBOX_ACCESS_TOKEN ||
      process.env.MAPBOX_TOKEN ||
      process.env.VITE_MAPBOX_TOKEN ||
      '';
    const censusApiKey = process.env.CENSUS_API_KEY || '';

    const shouldRun = (sec) => !requestedSection || !existingSnapshot || requestedSection === sec;

    let gettingAround = existingSnapshot?.getting_around || { available: false };
    let schools = existingSnapshot?.schools || { available: false };
    let peopleHousing = existingSnapshot?.people_housing || { available: false };
    let safety = existingSnapshot?.safety || { available: false, hidden: true };

    const tasks = [];

    if (shouldRun('getting_around')) {
      tasks.push(
        fetchGettingAround({ sql, lat, lng, addressLabel, mapboxToken })
          .then((r) => {
            gettingAround = r;
          })
          .catch((e) => {
            console.warn('fetchGettingAround error:', e.message);
            gettingAround = { available: false, address: addressLabel, fetched_at: null, source: null };
          })
      );
    }

    if (shouldRun('schools')) {
      tasks.push(
        fetchSchoolsForPoint({ sql, county, lat, lng, addressLabel, mapboxToken })
          .then((r) => {
            schools = r;
          })
          .catch((e) => {
            console.warn('fetchSchoolsForPoint error:', e.message);
            schools = { available: false, address: addressLabel, fetched_at: null, source: null };
          })
      );
    }

    if (shouldRun('people_housing') || shouldRun('safety')) {
      tasks.push(
        (async () => {
          if (shouldRun('people_housing')) {
            try {
              peopleHousing = await fetchPeopleAndHousing({
                lat,
                lng,
                addressLabel,
                censusApiKey
              });
            } catch (e) {
              console.warn('fetchPeopleAndHousing error:', e.message);
              peopleHousing = {
                available: false,
                address: addressLabel,
                fetched_at: null,
                source: null
              };
            }
          }

          if (shouldRun('safety')) {
            const incPlace = peopleHousing?.incorporated_place ?? null;
            safety = await fetchSafetyForAddress({
              sql,
              county,
              city: prop.city,
              incorporatedPlace: incPlace,
              addressLabel
            });
          }
        })()
      );
    }

    await Promise.all(tasks);

    const nowIso = new Date().toISOString();
    const mergedFieldSources = {
      ...(existingSnapshot?.field_sources || {}),
      ...(gettingAround?.field_sources ? { getting_around: gettingAround.field_sources } : {}),
      ...(schools?.field_sources ? { schools: schools.field_sources } : {}),
      ...(peopleHousing?.field_sources ? { people_housing: peopleHousing.field_sources } : {}),
      ...(safety?.field_sources ? { safety: safety.field_sources } : {})
    };

    // 4. Persist snapshot in location_snapshots when table is applied
    try {
      await sql`
        INSERT INTO location_snapshots (
          property_id,
          owner_email,
          address_label,
          county,
          lat,
          lng,
          fetched_at,
          field_sources,
          getting_around,
          schools,
          people_housing,
          safety
        ) VALUES (
          ${prop.id},
          ${cleanEmail},
          ${addressLabel},
          ${county},
          ${lat},
          ${lng},
          ${nowIso},
          ${JSON.stringify(mergedFieldSources)}::jsonb,
          ${JSON.stringify(gettingAround)}::jsonb,
          ${JSON.stringify(schools)}::jsonb,
          ${JSON.stringify(peopleHousing)}::jsonb,
          ${JSON.stringify(safety)}::jsonb
        )
        ON CONFLICT (property_id) DO UPDATE SET
          address_label = EXCLUDED.address_label,
          county = EXCLUDED.county,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          fetched_at = EXCLUDED.fetched_at,
          field_sources = EXCLUDED.field_sources,
          getting_around = EXCLUDED.getting_around,
          schools = EXCLUDED.schools,
          people_housing = EXCLUDED.people_housing,
          safety = EXCLUDED.safety;
      `;
    } catch (saveErr) {
      if (saveErr?.code !== '42P01') {
        console.warn('location_snapshots upsert warning:', saveErr.message);
      }
    }

    return res.status(200).json({
      property_id: prop.id,
      address_label: addressLabel,
      county,
      lat,
      lng,
      cached: false,
      fetched_at: nowIso,
      field_sources: mergedFieldSources,
      getting_around: gettingAround,
      schools,
      people_housing: peopleHousing,
      safety
    });
  } catch (err) {
    return sendSafeApiError(
      res,
      err,
      'Error in /api/investor/location',
      'Unable to load property location data right now.'
    );
  }
}

