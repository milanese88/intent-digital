import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import {
  VALID_CONDITIONS,
  normalizeConditionKey,
  normalizeCompDetails,
  detailsToLegacyColumns,
  computeDetailsProgress,
  buildSaleMonthKey,
  mergeCompWithSavedDetails
} from '../../src/components/investor/compDetailsModel.js';
import { upsertUserCompDetails } from './comp-details.js';

function calculateDistanceMi(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);
  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) return null;

  const R = 3958.8; // Earth radius in miles
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(nLat2 - nLat1);
  const dLon = toRad(nLon2 - nLon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(nLat1)) * Math.cos(toRad(nLat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 10) / 10;
}

function parseNullableBool(val) {
  if (val === true || val === 'true') return true;
  if (val === false || val === 'false') return false;
  return null;
}

/**
 * Maps canonical UAD condition ('c1'..'c6') to legacy constraint values ONLY as an
 * emergency fallback if add_comp_details_and_nal_clues.sql has not been applied yet.
 */
function toLegacyCheckCondition(cond) {
  const c = normalizeConditionKey(cond);
  if (c === 'c1' || c === 'c2') return 'fully_renovated';
  if (c === 'c3') return 'updated';
  if (c === 'c4' || c === 'c5' || c === 'c6') return 'as_is';
  return 'unknown';
}

const STRUCTURED_DETAIL_KEYS = [
  'comp_details_json',
  'full_baths',
  'half_baths',
  'kitchen_baths_updated',
  'roof_type',
  'roof_year',
  'windows',
  'pool_type',
  'screen_enclosure',
  'garage_type',
  'garage_bays',
  'waterfront_view',
  'verified'
];

function hasExplicitStructuredPayload(body = {}) {
  return STRUCTURED_DETAIL_KEYS.some((k) => body[k] !== undefined);
}

function validateComp(body, isUpdate = false) {
  const errors = {};

  // Address (required if create, or if address is explicitly provided on update)
  let address = body.address != null ? String(body.address).trim() : '';
  if (!isUpdate || body.address !== undefined) {
    if (!address) {
      errors.address = 'Address is required.';
    }
  }

  // Sold Price: positive number or null
  let sold_price = null;
  if (body.sold_price !== undefined && body.sold_price !== null && String(body.sold_price).trim() !== '') {
    const raw = String(body.sold_price).replace(/[$,]/g, '').trim();
    const num = Number(raw);
    if (isNaN(num) || num < 0) {
      errors.sold_price = 'Sold price must be a valid positive number.';
    } else {
      sold_price = num;
    }
  }

  // Living sqft: positive whole number or null
  let sqft = null;
  if (body.sqft !== undefined && body.sqft !== null && String(body.sqft).trim() !== '') {
    const raw = String(body.sqft).replace(/,/g, '').trim();
    const num = Number(raw);
    if (isNaN(num) || !Number.isInteger(num) || num < 0) {
      errors.sqft = 'Living sqft must be a whole positive number.';
    } else {
      sqft = num;
    }
  }

  // Sold Date: valid date not in the future
  let sold_date = null;
  if (body.sold_date !== undefined && body.sold_date !== null && String(body.sold_date).trim() !== '') {
    const dStr = String(body.sold_date).trim().split('T')[0];
    const d = new Date(dStr);
    if (isNaN(d.getTime())) {
      errors.sold_date = 'Invalid sold date.';
    } else {
      const todayStr = new Date().toISOString().split('T')[0];
      if (dStr > todayStr) {
        errors.sold_date = 'Sold date cannot be in the future.';
      } else {
        sold_date = dStr;
      }
    }
  }

  // Coordinates: lat (-90 to 90), lng (-180 to 180)
  const parseCoord = (val, fieldKey, label, min, max) => {
    if (val === undefined || val === null || String(val).trim() === '') return null;
    const num = Number(val);
    if (isNaN(num) || num < min || num > max) {
      errors[fieldKey] = label + ' must be a valid number between ' + min + ' and ' + max + '.';
      return null;
    }
    return num;
  };
  const lat = parseCoord(body.lat, 'lat', 'Latitude', -90, 90);
  const lng = parseCoord(body.lng, 'lng', 'Longitude', -180, 180);

  const parseNumField = (val, isInt = false) => {
    if (val === undefined || val === null || String(val).trim() === '') return null;
    const num = Number(String(val).replace(/,/g, '').trim());
    if (isNaN(num) || num < 0) return null;
    return isInt ? Math.round(num) : num;
  };

  let beds = parseNumField(body.beds, false);
  let baths = parseNumField(body.baths, false);
  const year_built = parseNumField(body.year_built, true);
  const lot_sqft = parseNumField(body.lot_sqft, true);
  const city = body.city != null && String(body.city).trim() !== '' ? String(body.city).trim() : null;
  const zip = body.zip != null && String(body.zip).trim() !== '' ? String(body.zip).trim() : null;
  const source = body.source != null && String(body.source).trim() !== '' ? String(body.source).trim() : null;
  const parcel_id = body.parcel_id != null && String(body.parcel_id).trim() !== '' ? String(body.parcel_id).trim() : null;
  const parcel_county = body.parcel_county != null && String(body.parcel_county).trim() !== '' ? String(body.parcel_county).trim() : null;

  const rawCond = body.condition != null ? String(body.condition).trim().toLowerCase() : 'unknown';
  let condition = VALID_CONDITIONS.has(rawCond) ? normalizeConditionKey(rawCond) : 'unknown';

  // Nullable feature booleans (null = Unknown; NEVER force undefined to false!)
  let pool = parseNullableBool(body.pool);
  let garage = parseNullableBool(body.garage);
  let waterfront = parseNullableBool(body.waterfront);

  let notes = body.notes != null && String(body.notes).trim() !== '' ? String(body.notes).trim() : null;
  const rawAdjustments = typeof body.adjustments === 'object' && body.adjustments !== null ? { ...body.adjustments } : {};
  const is_outlier = Boolean(body.is_outlier || rawAdjustments.is_outlier);
  if (is_outlier) {
    rawAdjustments.is_outlier = true;
  }

  // Outlier comps default to OFF in the grid unless explicitly included === true
  const included = body.included !== undefined
    ? Boolean(body.included)
    : (is_outlier ? false : true);

  let comp_details_json = {};
  if (hasExplicitStructuredPayload(body) || body.condition !== undefined || body.beds !== undefined || body.baths !== undefined || body.pool !== undefined || body.garage !== undefined || body.waterfront !== undefined) {
    const normalizedDetails = normalizeCompDetails({
      ...body,
      beds,
      baths,
      condition,
      pool,
      garage,
      waterfront,
      notes: notes ?? '',
      source: source ?? ''
    });
    const synced = detailsToLegacyColumns(normalizedDetails);
    beds = synced.beds;
    baths = synced.baths;
    condition = synced.condition;
    pool = synced.pool;
    garage = synced.garage;
    waterfront = synced.waterfront;
    if (normalizedDetails.notes) {
      notes = normalizedDetails.notes;
    }
    comp_details_json = normalizedDetails;
    rawAdjustments.comp_details_json = normalizedDetails;
  }

  return {
    errors,
    data: {
      address,
      city,
      zip,
      lat,
      lng,
      sold_date,
      sold_price,
      sqft,
      beds,
      baths,
      year_built,
      lot_sqft,
      condition,
      pool,
      garage,
      waterfront,
      notes,
      adjustments: rawAdjustments,
      comp_details_json,
      is_outlier,
      included,
      source,
      parcel_id,
      parcel_county
    }
  };
}

/**
 * Batch-enriches investor_comps rows with:
 * 1) DOR NAL clues from county_parcels (eff_year_built, units, imp_qual, const_class, spec_feat_val)
 * 2) User's saved comp_details rows keyed by (county, parcel_id, sale_month_key)
 * 3) Computed 9-field progress ("Details: X of 9 filled")
 */
async function enrichCompsWithCluesAndSavedDetails(sql, cleanEmail, rawRows = []) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) return [];

  const parcelIds = Array.from(
    new Set(rawRows.map((r) => (r.parcel_id ? String(r.parcel_id).trim() : '')).filter(Boolean))
  );

  const parcelMap = new Map();
  const savedExactMap = new Map();
  const savedFolioMap = new Map();

  if (parcelIds.length > 0) {
    // 1. Fetch county_parcels clues
    try {
      const pRows = await sql`
        SELECT
          county,
          parcel_id,
          year_built,
          eff_year_built,
          units,
          imp_qual,
          const_class,
          spec_feat_val,
          beds,
          full_baths,
          half_baths
        FROM county_parcels
        WHERE parcel_id = ANY(${parcelIds});
      `;
      for (const pr of pRows) {
        parcelMap.set(`${pr.county}|${pr.parcel_id}`, pr);
        if (!parcelMap.has(pr.parcel_id)) parcelMap.set(pr.parcel_id, pr);
      }
    } catch (err) {
      if (err?.code === '42703') {
        try {
          const pRowsFallback = await sql`
            SELECT county, parcel_id, year_built, eff_year_built, units
            FROM county_parcels
            WHERE parcel_id = ANY(${parcelIds});
          `;
          for (const pr of pRowsFallback) {
            parcelMap.set(`${pr.county}|${pr.parcel_id}`, pr);
            if (!parcelMap.has(pr.parcel_id)) parcelMap.set(pr.parcel_id, pr);
          }
        } catch {
          // ignore
        }
      }
    }

    // 2. Fetch user's reusable comp_details rows
    try {
      const dRows = await sql`
        SELECT *
        FROM comp_details
        WHERE lower(owner_email) = ${cleanEmail}
          AND parcel_id = ANY(${parcelIds})
        ORDER BY updated_at DESC;
      `;
      for (const dr of dRows) {
        const exactKey = `${dr.county}|${dr.parcel_id}|${dr.sale_month_key || ''}`;
        const folioKey = `${dr.county}|${dr.parcel_id}`;
        if (!savedExactMap.has(exactKey)) savedExactMap.set(exactKey, dr);
        if (!savedFolioMap.has(folioKey)) savedFolioMap.set(folioKey, dr);
      }
    } catch (err) {
      if (err?.code !== '42P01') {
        console.warn('comp_details enrichment skipped:', err.message);
      }
    }
  }

  return rawRows.map((row) => {
    const adj = row.adjustments && typeof row.adjustments === 'object' ? row.adjustments : {};
    const fallbackJson =
      row.comp_details_json && typeof row.comp_details_json === 'object' && Object.keys(row.comp_details_json).length > 0
        ? row.comp_details_json
        : (adj.comp_details_json && typeof adj.comp_details_json === 'object' ? adj.comp_details_json : {});

    const county = row.parcel_county ? (/palm/i.test(row.parcel_county) ? 'Palm Beach' : 'Broward') : 'Broward';
    const pid = row.parcel_id ? String(row.parcel_id).trim() : '';
    const saleMonthKey = buildSaleMonthKey(
      row.sold_date ? (row.sold_date instanceof Date ? row.sold_date.toISOString() : String(row.sold_date)) : ''
    );

    const countyParcel = pid ? (parcelMap.get(`${county}|${pid}`) || parcelMap.get(pid) || null) : null;
    const savedRow = pid
      ? (savedExactMap.get(`${county}|${pid}|${saleMonthKey}`) || savedFolioMap.get(`${county}|${pid}`) || null)
      : null;

    const merged = mergeCompWithSavedDetails(
      {
        ...row,
        comp_details_json: fallbackJson,
        is_outlier: Boolean(row.is_outlier || adj.is_outlier)
      },
      savedRow,
      countyParcel
    );

    return merged;
  });
}

async function selectCompsQuery(sql, cleanEmail, propertyId = null) {
  try {
    if (propertyId) {
      return await sql`
        SELECT
          id,
          owner_email,
          property_id,
          address,
          city,
          zip,
          lat,
          lng,
          sold_date,
          sold_price,
          sqft,
          beds,
          baths,
          year_built,
          price_per_sqft,
          distance_mi,
          included,
          source,
          parcel_id,
          parcel_county,
          COALESCE(condition, 'unknown') AS condition,
          pool,
          garage,
          waterfront,
          lot_sqft,
          notes,
          COALESCE(adjustments, '{}'::jsonb) AS adjustments,
          COALESCE(comp_details_json, '{}'::jsonb) AS comp_details_json,
          COALESCE(is_outlier, false) AS is_outlier,
          created_at
        FROM investor_comps
        WHERE property_id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
        ORDER BY sold_date DESC NULLS LAST, created_at DESC
      `;
    }
    return await sql`
      SELECT
        id,
        owner_email,
        property_id,
        address,
        city,
        zip,
        lat,
        lng,
        sold_date,
        sold_price,
        sqft,
        beds,
        baths,
        year_built,
        price_per_sqft,
        distance_mi,
        included,
        source,
        parcel_id,
        parcel_county,
        COALESCE(condition, 'unknown') AS condition,
        pool,
        garage,
        waterfront,
        lot_sqft,
        notes,
        COALESCE(adjustments, '{}'::jsonb) AS adjustments,
        COALESCE(comp_details_json, '{}'::jsonb) AS comp_details_json,
        COALESCE(is_outlier, false) AS is_outlier,
        created_at
      FROM investor_comps
      WHERE lower(owner_email) = ${cleanEmail}
      ORDER BY sold_date DESC NULLS LAST, created_at DESC
    `;
  } catch (colErr) {
    if (colErr?.code !== '42703') throw colErr;
    // Fallback before comp_details_json / is_outlier columns exist
    try {
      if (propertyId) {
        return await sql`
          SELECT
            id, owner_email, property_id, address, city, zip, lat, lng,
            sold_date, sold_price, sqft, beds, baths, year_built,
            price_per_sqft, distance_mi, included, source,
            parcel_id, parcel_county,
            COALESCE(condition, 'unknown') AS condition,
            pool, garage, waterfront, lot_sqft, notes,
            COALESCE(adjustments, '{}'::jsonb) AS adjustments,
            created_at
          FROM investor_comps
          WHERE property_id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
          ORDER BY sold_date DESC NULLS LAST, created_at DESC
        `;
      }
      return await sql`
        SELECT
          id, owner_email, property_id, address, city, zip, lat, lng,
          sold_date, sold_price, sqft, beds, baths, year_built,
          price_per_sqft, distance_mi, included, source,
          parcel_id, parcel_county,
          COALESCE(condition, 'unknown') AS condition,
          pool, garage, waterfront, lot_sqft, notes,
          COALESCE(adjustments, '{}'::jsonb) AS adjustments,
          created_at
        FROM investor_comps
        WHERE lower(owner_email) = ${cleanEmail}
        ORDER BY sold_date DESC NULLS LAST, created_at DESC
      `;
    } catch (baseErr) {
      if (baseErr?.code !== '42703') throw baseErr;
      const raw = propertyId
        ? await sql`
            SELECT id, owner_email, property_id, address, city, zip, lat, lng,
              sold_date, sold_price, sqft, beds, baths, year_built,
              price_per_sqft, distance_mi, included, source, created_at
            FROM investor_comps
            WHERE property_id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
            ORDER BY sold_date DESC NULLS LAST, created_at DESC
          `
        : await sql`
            SELECT id, owner_email, property_id, address, city, zip, lat, lng,
              sold_date, sold_price, sqft, beds, baths, year_built,
              price_per_sqft, distance_mi, included, source, created_at
            FROM investor_comps
            WHERE lower(owner_email) = ${cleanEmail}
            ORDER BY sold_date DESC NULLS LAST, created_at DESC
          `;
      return raw.map((r) => ({
        ...r,
        parcel_id: null,
        parcel_county: null,
        condition: 'unknown',
        pool: null,
        garage: null,
        waterfront: null,
        lot_sqft: null,
        notes: null,
        adjustments: {},
        comp_details_json: {},
        is_outlier: false
      }));
    }
  }
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // GET: List comps for a property, or all comps for user if no property_id
    if (req.method === 'GET') {
      const propertyId = req.query?.property_id;

      if (propertyId) {
        const prop = await sql`
          SELECT id, lat, lng FROM investor_properties
          WHERE id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
          LIMIT 1
        `;
        if (prop.length === 0) {
          return res.status(404).json({ error: 'Property not found.' });
        }

        const rawComps = await selectCompsQuery(sql, cleanEmail, propertyId);
        const enriched = await enrichCompsWithCluesAndSavedDetails(sql, cleanEmail, rawComps);
        return res.status(200).json(enriched);
      }

      const allRaw = await selectCompsQuery(sql, cleanEmail, null);
      const enrichedAll = await enrichCompsWithCluesAndSavedDetails(sql, cleanEmail, allRaw);
      return res.status(200).json(enrichedAll);
    }

    // POST: Create a new comp
    if (req.method === 'POST') {
      const propertyId = req.body?.property_id;
      if (!propertyId) {
        return res.status(400).json({ error: 'property_id is required.' });
      }

      const prop = await sql`
        SELECT id, lat, lng FROM investor_properties
        WHERE id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (prop.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      const { errors, data } = validateComp(req.body || {});
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: Object.values(errors)[0], errors });
      }

      let distance_mi = null;
      if (prop[0].lat != null && prop[0].lng != null && data.lat != null && data.lng != null) {
        distance_mi = calculateDistanceMi(prop[0].lat, prop[0].lng, data.lat, data.lng);
      }

      let rows;
      try {
        rows = await sql`
          INSERT INTO investor_comps (
            owner_email, property_id, address, city, zip, lat, lng,
            sold_date, sold_price, sqft, beds, baths, year_built, distance_mi,
            included, source, parcel_id, parcel_county, condition,
            pool, garage, waterfront, lot_sqft, notes,
            adjustments, comp_details_json, is_outlier
          ) VALUES (
            ${cleanEmail}, ${propertyId}, ${data.address}, ${data.city}, ${data.zip}, ${data.lat}, ${data.lng},
            ${data.sold_date}, ${data.sold_price}, ${data.sqft}, ${data.beds}, ${data.baths}, ${data.year_built}, ${distance_mi},
            ${data.included}, ${data.source}, ${data.parcel_id}, ${data.parcel_county}, ${data.condition},
            ${data.pool}, ${data.garage}, ${data.waterfront}, ${data.lot_sqft}, ${data.notes},
            ${JSON.stringify(data.adjustments)}::jsonb,
            ${JSON.stringify(data.comp_details_json || {})}::jsonb,
            ${data.is_outlier}
          )
          RETURNING *
        `;
      } catch (insErr) {
        if (insErr?.code === '42703' || insErr?.code === '23514') {
          const safeCond = toLegacyCheckCondition(data.condition);
          rows = await sql`
            INSERT INTO investor_comps (
              owner_email, property_id, address, city, zip, lat, lng,
              sold_date, sold_price, sqft, beds, baths, year_built, distance_mi,
              included, source, parcel_id, parcel_county, condition,
              pool, garage, waterfront, lot_sqft, notes, adjustments
            ) VALUES (
              ${cleanEmail}, ${propertyId}, ${data.address}, ${data.city}, ${data.zip}, ${data.lat}, ${data.lng},
              ${data.sold_date}, ${data.sold_price}, ${data.sqft}, ${data.beds}, ${data.baths}, ${data.year_built}, ${distance_mi},
              ${data.included}, ${data.source}, ${data.parcel_id}, ${data.parcel_county}, ${safeCond},
              ${data.pool}, ${data.garage}, ${data.waterfront}, ${data.lot_sqft}, ${data.notes},
              ${JSON.stringify(data.adjustments)}::jsonb
            )
            RETURNING *
          `;
          if (rows[0]) {
            rows[0].condition = data.condition;
            rows[0].comp_details_json = data.comp_details_json || {};
            rows[0].is_outlier = data.is_outlier;
          }
        } else {
          throw insErr;
        }
      }

      // Persist reusable comp_details if county folio + filled details were provided
      if (data.parcel_id && data.comp_details_json && computeDetailsProgress(data.comp_details_json).filledCount > 0) {
        await upsertUserCompDetails(sql, cleanEmail, {
          county: data.parcel_county || 'Broward',
          parcel_id: data.parcel_id,
          sold_date: data.sold_date,
          comp_details_json: data.comp_details_json
        }).catch(() => null);
      }

      const enriched = await enrichCompsWithCluesAndSavedDetails(sql, cleanEmail, rows);
      return res.status(200).json(enriched[0]);
    }

    // PUT: Update an existing comp
    if (req.method === 'PUT') {
      const id = req.body?.id || req.query?.id;
      if (!id) {
        return res.status(400).json({ error: 'Comp ID is required for update.' });
      }

      const existing = await sql`
        SELECT *
        FROM investor_comps
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Comp not found.' });
      }

      const currentComp = existing[0];
      const propertyId = req.body?.property_id || currentComp.property_id;

      const prop = await sql`
        SELECT id, lat, lng FROM investor_properties
        WHERE id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (prop.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      // Fast path: 'included' toggle only
      if (req.body?.included !== undefined && Object.keys(req.body).length <= 2) {
        const rows = await sql`
          UPDATE investor_comps
          SET included = ${Boolean(req.body.included)}
          WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
          RETURNING *
        `;
        if (rows.length === 0) {
          return res.status(404).json({ error: 'Comp not found.' });
        }
        const enriched = await enrichCompsWithCluesAndSavedDetails(sql, cleanEmail, rows);
        return res.status(200).json(enriched[0]);
      }

      const body = req.body || {};
      const currentAdj = currentComp.adjustments && typeof currentComp.adjustments === 'object' ? currentComp.adjustments : {};
      const currentDetailsJson =
        currentComp.comp_details_json && typeof currentComp.comp_details_json === 'object' && Object.keys(currentComp.comp_details_json).length > 0
          ? currentComp.comp_details_json
          : (currentAdj.comp_details_json && typeof currentAdj.comp_details_json === 'object' ? currentAdj.comp_details_json : {});

      // Merge partial update cleanly over existing comp + comp_details_json
      const mergedInput = {
        address: body.address !== undefined ? body.address : currentComp.address,
        city: body.city !== undefined ? body.city : currentComp.city,
        zip: body.zip !== undefined ? body.zip : currentComp.zip,
        lat: body.lat !== undefined ? body.lat : currentComp.lat,
        lng: body.lng !== undefined ? body.lng : currentComp.lng,
        sold_date: body.sold_date !== undefined
          ? body.sold_date
          : (currentComp.sold_date instanceof Date ? currentComp.sold_date.toISOString().slice(0, 10) : currentComp.sold_date),
        sold_price: body.sold_price !== undefined ? body.sold_price : currentComp.sold_price,
        sqft: body.sqft !== undefined ? body.sqft : currentComp.sqft,
        beds: body.beds !== undefined ? body.beds : currentComp.beds,
        baths: body.baths !== undefined ? body.baths : currentComp.baths,
        year_built: body.year_built !== undefined ? body.year_built : currentComp.year_built,
        lot_sqft: body.lot_sqft !== undefined ? body.lot_sqft : currentComp.lot_sqft,
        included: body.included !== undefined ? body.included : currentComp.included,
        source: body.source !== undefined ? body.source : currentComp.source,
        parcel_id: body.parcel_id !== undefined ? body.parcel_id : currentComp.parcel_id,
        parcel_county: body.parcel_county !== undefined ? body.parcel_county : currentComp.parcel_county,
        condition: body.condition !== undefined ? body.condition : (currentDetailsJson.condition || currentComp.condition || 'unknown'),
        pool: body.pool !== undefined ? body.pool : currentComp.pool,
        garage: body.garage !== undefined ? body.garage : currentComp.garage,
        waterfront: body.waterfront !== undefined ? body.waterfront : currentComp.waterfront,
        notes: body.notes !== undefined ? body.notes : currentComp.notes,
        is_outlier: body.is_outlier !== undefined ? body.is_outlier : Boolean(currentComp.is_outlier || currentAdj.is_outlier),
        adjustments: body.adjustments !== undefined ? body.adjustments : currentAdj,
        comp_details_json: {
          ...currentDetailsJson,
          ...(body.comp_details_json && typeof body.comp_details_json === 'object' ? body.comp_details_json : {}),
          ...(body.condition !== undefined ? { condition: body.condition } : {}),
          ...(body.beds !== undefined ? { beds: body.beds } : {}),
          ...(body.full_baths !== undefined ? { full_baths: body.full_baths } : {}),
          ...(body.half_baths !== undefined ? { half_baths: body.half_baths } : {}),
          ...(body.kitchen_baths_updated !== undefined ? { kitchen_baths_updated: body.kitchen_baths_updated } : {}),
          ...(body.roof_type !== undefined ? { roof_type: body.roof_type } : {}),
          ...(body.roof_year !== undefined ? { roof_year: body.roof_year } : {}),
          ...(body.windows !== undefined ? { windows: body.windows } : {}),
          ...(body.pool_type !== undefined ? { pool_type: body.pool_type } : {}),
          ...(body.screen_enclosure !== undefined ? { screen_enclosure: body.screen_enclosure } : {}),
          ...(body.garage_type !== undefined ? { garage_type: body.garage_type } : {}),
          ...(body.garage_bays !== undefined ? { garage_bays: body.garage_bays } : {}),
          ...(body.waterfront_view !== undefined ? { waterfront_view: body.waterfront_view } : {}),
          ...(body.verified !== undefined ? { verified: body.verified } : {}),
          ...(body.detail_source !== undefined ? { source: body.detail_source } : {})
        }
      };

      const { errors, data } = validateComp(mergedInput, true);
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: Object.values(errors)[0], errors });
      }

      let finalDistance = null;
      if (prop[0].lat != null && prop[0].lng != null && data.lat != null && data.lng != null) {
        finalDistance = calculateDistanceMi(prop[0].lat, prop[0].lng, data.lat, data.lng);
      }

      let rows;
      try {
        rows = await sql`
          UPDATE investor_comps
          SET
            address = ${data.address},
            city = ${data.city},
            zip = ${data.zip},
            lat = ${data.lat},
            lng = ${data.lng},
            sold_date = ${data.sold_date},
            sold_price = ${data.sold_price},
            sqft = ${data.sqft},
            beds = ${data.beds},
            baths = ${data.baths},
            year_built = ${data.year_built},
            distance_mi = ${finalDistance},
            included = ${data.included},
            source = ${data.source},
            parcel_id = ${data.parcel_id},
            parcel_county = ${data.parcel_county},
            condition = ${data.condition},
            pool = ${data.pool},
            garage = ${data.garage},
            waterfront = ${data.waterfront},
            lot_sqft = ${data.lot_sqft},
            notes = ${data.notes},
            adjustments = ${JSON.stringify(data.adjustments)}::jsonb,
            comp_details_json = ${JSON.stringify(data.comp_details_json || {})}::jsonb,
            is_outlier = ${data.is_outlier}
          WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
          RETURNING *
        `;
      } catch (updErr) {
        if (updErr?.code === '42703' || updErr?.code === '23514') {
          const safeCond = toLegacyCheckCondition(data.condition);
          rows = await sql`
            UPDATE investor_comps
            SET
              address = ${data.address},
              city = ${data.city},
              zip = ${data.zip},
              lat = ${data.lat},
              lng = ${data.lng},
              sold_date = ${data.sold_date},
              sold_price = ${data.sold_price},
              sqft = ${data.sqft},
              beds = ${data.beds},
              baths = ${data.baths},
              year_built = ${data.year_built},
              distance_mi = ${finalDistance},
              included = ${data.included},
              source = ${data.source},
              parcel_id = ${data.parcel_id},
              parcel_county = ${data.parcel_county},
              condition = ${safeCond},
              pool = ${data.pool},
              garage = ${data.garage},
              waterfront = ${data.waterfront},
              lot_sqft = ${data.lot_sqft},
              notes = ${data.notes},
              adjustments = ${JSON.stringify(data.adjustments)}::jsonb
            WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
            RETURNING *
          `;
          if (rows[0]) {
            rows[0].condition = data.condition;
            rows[0].comp_details_json = data.comp_details_json || {};
            rows[0].is_outlier = data.is_outlier;
          }
        } else {
          throw updErr;
        }
      }

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Comp not found.' });
      }

      // Persist reusable comp_details per county sale (folio + sale month) when edited
      const isAdjustmentOnlyUpdate =
        body.adjustments !== undefined &&
        Object.keys(body).every((k) => ['id', 'property_id', 'adjustments'].includes(k));

      if (!isAdjustmentOnlyUpdate && data.parcel_id && data.comp_details_json) {
        await upsertUserCompDetails(sql, cleanEmail, {
          county: data.parcel_county || 'Broward',
          parcel_id: data.parcel_id,
          sold_date: data.sold_date,
          comp_details_json: data.comp_details_json
        }).catch(() => null);
      }

      const enriched = await enrichCompsWithCluesAndSavedDetails(sql, cleanEmail, rows);
      return res.status(200).json(enriched[0]);
    }

    // DELETE: Delete a comp
    if (req.method === 'DELETE') {
      const id = req.body?.id || req.query?.id;
      if (!id) {
        return res.status(400).json({ error: 'Comp ID is required for delete.' });
      }

      const existing = await sql`
        SELECT id, property_id
        FROM investor_comps
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Comp not found.' });
      }

      const prop = await sql`
        SELECT id FROM investor_properties
        WHERE id = ${existing[0].property_id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (prop.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      const rows = await sql`
        DELETE FROM investor_comps
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING id
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Comp not found.' });
      }

      return res.status(200).json({ success: true, id: rows[0].id });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Investor Comps API Error:', error);
    return res.status(500).json({ error: error.message || 'Server error processing comps request.' });
  }
}
