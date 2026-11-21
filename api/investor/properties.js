import { getUserFromSession } from '../_lib/session.js';
import { getDb, parseJsonbObject, sendSafeApiError } from '../_lib/db.js';
import { applyPropertyCountyRules } from '../_lib/countyResolver.js';
import {
  fetchBuildingCharacteristicsMap,
  fetchBuildingCharacteristicOne,
  lookupBuildingRecord
} from '../_lib/buildingChars.js';
import { normalizeCompDetails, detailsToLegacyColumns } from '../../src/components/investor/compDetailsModel.js';
import { normalizePriceSource } from '../../src/components/investor/priceSource.js';

const ALLOWED_PROPERTY_TYPES = ['single_family', 'condo', 'townhome', 'multifamily_2_9', 'other'];
const ALLOWED_STATUSES = ['watching', 'analyzing', 'offer_sent', 'under_contract', 'passed', 'owned'];
const ALLOWED_STRATEGIES = ['rental', 'flip', 'brrrr', 'live_in'];

function normalizePropertyJsonb(row) {
  if (!row || typeof row !== 'object') return row;
  const subjectDetails = parseJsonbObject(row.subject_details);
  const asIs = subjectDetails?.as_is && typeof subjectDetails.as_is === 'object' ? subjectDetails.as_is : {};
  const landVal =
    row.land_value != null && row.land_value !== ''
      ? Number(row.land_value)
      : (row.parcel_land_value != null && row.parcel_land_value !== ''
          ? Number(row.parcel_land_value)
          : (subjectDetails.land_value != null ? Number(subjectDetails.land_value) : null));
  const offerVal =
    row.offer_price != null && row.offer_price !== ''
      ? Number(row.offer_price)
      : (subjectDetails.offer_price != null && subjectDetails.offer_price !== ''
          ? Number(subjectDetails.offer_price)
          : null);
  const rawPriceSource = row.price_source ?? subjectDetails.price_source ?? 'list_price';
  const rawConstDetail =
    row.construction_detail ??
    asIs.construction_detail ??
    subjectDetails.construction_detail ??
    null;

  return {
    ...row,
    subject_details: subjectDetails,
    price_source: normalizePriceSource(rawPriceSource),
    offer_price: Number.isFinite(offerVal) && offerVal > 0 ? offerVal : null,
    construction_detail: rawConstDetail && String(rawConstDetail).trim() !== '' ? String(rawConstDetail).trim() : null,
    sketch_areas: subjectDetails.sketch_areas || asIs.sketch_areas || null,
    recent_improvements: subjectDetails.recent_improvements || asIs.recent_improvements || null,
    just_value: row.just_value != null && row.just_value !== '' ? Number(row.just_value) : null,
    land_value: Number.isFinite(landVal) ? landVal : null,
    quality: row.quality !== undefined
      ? row.quality
      : (asIs.quality && asIs.quality !== 'unknown' ? asIs.quality : null),
    boat_dock: row.boat_dock !== undefined ? row.boat_dock : (asIs.boat_dock ?? null),
    boat_dock_sqft: row.boat_dock_sqft !== undefined ? row.boat_dock_sqft : (asIs.boat_dock_sqft ?? null),
    boat_lift: row.boat_lift !== undefined ? row.boat_lift : (asIs.boat_lift ?? null),
    construction_type: row.construction_type !== undefined
      ? row.construction_type
      : (asIs.construction_type && asIs.construction_type !== 'unknown' ? asIs.construction_type : null)
  };
}

async function syncPropertyExtraColumns(sql, cleanEmail, id, data) {
  if (!id) return;
  try {
    await sql`
      UPDATE investor_properties
      SET
        boat_dock = ${data.boat_dock},
        boat_dock_sqft = ${data.boat_dock_sqft},
        construction_type = ${data.construction_type}
      WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
    `;
  } catch (err) {
    if (err?.code !== '42703') throw err;
  }
  try {
    await sql`
      UPDATE investor_properties
      SET
        quality = ${data.quality},
        boat_lift = ${data.boat_lift},
        land_value = ${data.land_value}
      WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
    `;
  } catch (err) {
    if (err?.code !== '42703') throw err;
  }
  try {
    await sql`
      UPDATE investor_properties
      SET
        price_source = ${data.price_source},
        offer_price = ${data.offer_price},
        construction_detail = ${data.construction_detail}
      WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
    `;
  } catch (err) {
    if (err?.code !== '42703') throw err;
  }
}

function attachBuildingCharacteristicsToProperty(prop, bcRow) {
  if (!prop || typeof prop !== 'object') return prop;
  if (!bcRow) {
    return {
      ...prop,
      building_characteristics: prop.building_characteristics || null
    };
  }
  const bcBaths =
    bcRow.full_baths != null
      ? Math.round((Number(bcRow.full_baths) + (Number(bcRow.half_baths) || 0) * 0.5) * 10) / 10
      : null;
  return {
    ...prop,
    building_characteristics: bcRow,
    // Auto-fill missing top-level physical fields from county CAMA (manual edits ALWAYS win)
    sqft: prop.sqft ?? bcRow.living_area_sqft ?? null,
    beds: prop.beds ?? (bcRow.beds != null ? Number(bcRow.beds) : null),
    baths: prop.baths ?? bcBaths,
    year_built: prop.year_built ?? bcRow.year_built ?? null,
    eff_year_built: prop.eff_year_built ?? bcRow.effective_year_built ?? null,
    raw_quality_code: bcRow.raw_quality_code || null,
    raw_quality_desc: bcRow.raw_quality_desc || null,
    raw_condition_code: bcRow.raw_condition_code || null,
    raw_condition_desc: bcRow.raw_condition_desc || null,
    condition_is_default: Boolean(bcRow.condition_is_default)
  };
}

async function attachParcelSubdivisionFields(sql, row) {
  const normalized = normalizePropertyJsonb(row);
  if (!normalized || !normalized.parcel_id) return attachBuildingCharacteristicsToProperty(normalized, null);
  const county = normalized.parcel_county || normalized.county || 'Broward';
  const bcRow = await fetchBuildingCharacteristicOne(sql, county, normalized.parcel_id);
  try {
    let pRows;
    try {
      pRows = await sql`
        SELECT s_legal, subdivision_name, subdivision_code, nbrhd_cd, mkt_ar, const_class, imp_qual, eff_year_built, just_value, land_value
        FROM county_parcels
        WHERE county = ${county} AND parcel_id = ${normalized.parcel_id}
        LIMIT 1
      `;
    } catch (colErr) {
      if (colErr?.code !== '42703') throw colErr;
      pRows = await sql`
        SELECT s_legal, subdivision_name, subdivision_code, nbrhd_cd, mkt_ar, const_class, imp_qual, eff_year_built, just_value
        FROM county_parcels
        WHERE county = ${county} AND parcel_id = ${normalized.parcel_id}
        LIMIT 1
      `;
    }
    if (pRows.length > 0) {
      const pr = pRows[0];
      return attachBuildingCharacteristicsToProperty({
        ...normalized,
        s_legal: pr.s_legal ?? null,
        subdivision_name: pr.subdivision_name ?? null,
        subdivision_code: pr.subdivision_code ?? null,
        nbrhd_cd: pr.nbrhd_cd ?? null,
        mkt_ar: pr.mkt_ar ?? null,
        const_class: pr.const_class ?? null,
        imp_qual: pr.imp_qual ?? null,
        eff_year_built: pr.eff_year_built ?? null,
        just_value: pr.just_value != null ? Number(pr.just_value) : normalized.just_value,
        land_value: normalized.land_value ?? (pr.land_value != null ? Number(pr.land_value) : null)
      }, bcRow);
    }
  } catch {
    // Graceful fallback if county_parcels columns aren't available
  }
  return attachBuildingCharacteristicsToProperty(normalized, bcRow);
}

function validateProperty(body) {
  const errors = {};

  // Address (required)
  const address = body.address != null ? String(body.address).trim() : '';
  if (!address) {
    errors.address = 'Address is required.';
  }

  // City, ZIP, County, State
  const city = body.city != null && String(body.city).trim() !== '' ? String(body.city).trim() : null;
  const zip = body.zip != null && String(body.zip).trim() !== '' ? String(body.zip).trim() : null;
  const county = body.county != null && String(body.county).trim() !== '' ? String(body.county).trim() : null;
  const state = 'FL';

  // Coordinates: lat (-90 to 90), lng (-180 to 180)
  const parseCoord = (val, fieldKey, label, min, max) => {
    if (val == null || String(val).trim() === '') return null;
    const num = Number(val);
    if (isNaN(num) || num < min || num > max) {
      errors[fieldKey] = `${label} must be a valid number between ${min} and ${max}.`;
      return null;
    }
    return num;
  };
  const lat = parseCoord(body.lat, 'lat', 'Latitude', -90, 90);
  const lng = parseCoord(body.lng, 'lng', 'Longitude', -180, 180);

  // Property Type
  let property_type = body.property_type != null && String(body.property_type).trim() !== '' ? String(body.property_type).trim().toLowerCase() : null;
  if (property_type && !ALLOWED_PROPERTY_TYPES.includes(property_type)) {
    errors.property_type = `Property type must be one of: ${ALLOWED_PROPERTY_TYPES.join(', ')}`;
  }

  // Units (default 1)
  let units = 1;
  if (body.units != null && String(body.units).trim() !== '') {
    const u = Number(String(body.units).replace(/,/g, '').trim());
    if (isNaN(u) || !Number.isInteger(u) || u < 1) {
      errors.units = 'Units must be a whole number of at least 1.';
    } else {
      units = u;
    }
  }

  // Helper for numeric fields
  const parseNumField = (val, fieldKey, label, isInt = false) => {
    if (val == null || String(val).trim() === '') return null;
    const clean = String(val).replace(/[$,]/g, '').trim();
    if (!clean) return null;
    const num = Number(clean);
    if (isNaN(num) || num < 0) {
      errors[fieldKey] = `${label} must be a valid positive number.`;
      return null;
    }
    if (isInt && !Number.isInteger(num)) {
      errors[fieldKey] = `${label} must be a whole number.`;
      return null;
    }
    return num;
  };

  const beds = parseNumField(body.beds, 'beds', 'Beds');
  const baths = parseNumField(body.baths, 'baths', 'Baths');
  const sqft = parseNumField(body.sqft, 'sqft', 'Living sqft', true);
  const lot_sqft = parseNumField(body.lot_sqft, 'lot_sqft', 'Lot sqft', true);
  const list_price = parseNumField(body.list_price, 'list_price', 'List price');

  // Year fields: between 1900 and next year
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear + 1;

  const year_built = parseNumField(body.year_built, 'year_built', 'Year built', true);
  if (year_built != null && (year_built < 1900 || year_built > maxYear)) {
    errors.year_built = `Year built must be between 1900 and ${maxYear}.`;
  }

  const roof_year = parseNumField(body.roof_year, 'roof_year', 'Roof year', true);
  if (roof_year != null && (roof_year < 1900 || roof_year > maxYear)) {
    errors.roof_year = `Roof year must be between 1900 and ${maxYear}.`;
  }

  // Status
  let status = body.status != null && String(body.status).trim() !== '' ? String(body.status).trim().toLowerCase() : 'watching';
  if (!ALLOWED_STATUSES.includes(status)) {
    errors.status = `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`;
  }

  // Strategy
  let strategy = body.strategy != null && String(body.strategy).trim() !== '' ? String(body.strategy).trim().toLowerCase() : null;
  if (strategy && !ALLOWED_STRATEGIES.includes(strategy)) {
    errors.strategy = `Strategy must be one of: ${ALLOWED_STRATEGIES.join(', ')}`;
  }

  // Condition & Notes
  const condition = body.condition != null && String(body.condition).trim() !== '' ? String(body.condition).trim() : null;
  const notes = body.notes != null && String(body.notes).trim() !== '' ? String(body.notes).trim() : null;

  // Listing URL: must start with http:// or https:// or be empty
  let listing_url = body.listing_url != null && String(body.listing_url).trim() !== '' ? String(body.listing_url).trim() : null;
  if (listing_url && !/^https?:\/\//i.test(listing_url)) {
    errors.listing_url = 'Listing URL must start with http:// or https://';
  }

  // Parcel ID & Parcel County
  const parcel_id = body.parcel_id != null && String(body.parcel_id).trim() !== '' ? String(body.parcel_id).trim() : null;
  const parcel_county = body.parcel_county != null && String(body.parcel_county).trim() !== '' ? String(body.parcel_county).trim() : null;

  // Rehab Budget fields (from Designer Hub)
  const rehab_budget = parseNumField(body.rehab_budget, 'rehab_budget', 'Rehab budget');
  const rehab_budget_source = body.rehab_budget_source != null && String(body.rehab_budget_source).trim() !== '' ? String(body.rehab_budget_source).trim() : null;
  const rehab_budget_updated_at = body.rehab_budget_updated_at != null && String(body.rehab_budget_updated_at).trim() !== '' ? new Date(body.rehab_budget_updated_at).toISOString() : null;
  const is_studying = body.is_studying !== undefined ? Boolean(body.is_studying) : false;

  // Optional HOA fields for Live-in fit rental restriction check & manual HOA / association name
  const has_hoa =
    body.has_hoa === true || body.has_hoa === 'true'
      ? true
      : body.has_hoa === false || body.has_hoa === 'false'
      ? false
      : null;
  const hoa_monthly = parseNumField(body.hoa_monthly, 'hoa_monthly', 'HOA monthly');
  const rawHoaName =
    body.hoa_name !== undefined
      ? body.hoa_name
      : (body.subject_details?.as_is?.hoa_name ?? null);
  const hoa_name =
    rawHoaName != null && String(rawHoaName).trim() !== ''
      ? String(rawHoaName).trim().slice(0, 140)
      : null;

  // Optional subject_details (as_is & after_rehab) + nullable amenity booleans
  const parseTriBool = (v) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null);
  let pool = parseTriBool(body.pool);
  let garage = parseTriBool(body.garage);
  let waterfront = parseTriBool(body.waterfront);

  let boat_dock = parseTriBool(
    body.boat_dock !== undefined ? body.boat_dock : body.subject_details?.as_is?.boat_dock
  );
  let boat_lift = parseTriBool(
    body.boat_lift !== undefined ? body.boat_lift : body.subject_details?.as_is?.boat_lift
  );
  let boat_dock_sqft = parseNumField(
    body.boat_dock_sqft !== undefined ? body.boat_dock_sqft : body.subject_details?.as_is?.boat_dock_sqft,
    'boat_dock_sqft',
    'Boat dock sqft',
    true
  );
  if (boat_dock === false) {
    boat_dock_sqft = null;
    boat_lift = false;
  }
  if (boat_dock === null && ((boat_dock_sqft != null && boat_dock_sqft > 0) || boat_lift === true)) {
    boat_dock = true;
  }

  const rawConstruction =
    body.construction_type !== undefined
      ? body.construction_type
      : body.subject_details?.as_is?.construction_type;
  const rawConstructionDetail =
    body.construction_detail !== undefined
      ? body.construction_detail
      : (body.subject_details?.as_is?.construction_detail ?? body.subject_details?.construction_detail ?? null);
  const construction_detail =
    rawConstructionDetail != null && String(rawConstructionDetail).trim() !== ''
      ? String(rawConstructionDetail).trim().slice(0, 140)
      : null;
  const normConstruction = normalizeCompDetails({
    construction_type: rawConstruction,
    construction_detail: construction_detail ?? ''
  }).construction_type;
  let construction_type = normConstruction !== 'unknown' ? normConstruction : null;

  const rawPriceSource =
    body.price_source !== undefined
      ? body.price_source
      : (body.subject_details?.price_source ?? 'list_price');
  const price_source = normalizePriceSource(rawPriceSource);
  const offer_price = parseNumField(
    body.offer_price !== undefined ? body.offer_price : body.subject_details?.offer_price,
    'offer_price',
    'My offer price'
  );

  const rawSketchAreas =
    body.sketch_areas !== undefined
      ? body.sketch_areas
      : (body.subject_details?.sketch_areas ?? body.subject_details?.as_is?.sketch_areas ?? null);
  const sketch_areas =
    rawSketchAreas != null && String(rawSketchAreas).trim() !== ''
      ? String(rawSketchAreas).trim().slice(0, 400)
      : null;

  const rawRecentImp =
    body.recent_improvements !== undefined
      ? body.recent_improvements
      : (body.subject_details?.recent_improvements ?? body.subject_details?.as_is?.recent_improvements ?? null);
  const recent_improvements =
    rawRecentImp != null && String(rawRecentImp).trim() !== ''
      ? String(rawRecentImp).trim().slice(0, 600)
      : null;

  const rawQuality =
    body.quality !== undefined
      ? body.quality
      : body.subject_details?.as_is?.quality;
  const normQuality = normalizeCompDetails({ quality: rawQuality }).quality;
  let quality = normQuality !== 'unknown' ? normQuality : null;

  const land_value = parseNumField(
    body.land_value !== undefined ? body.land_value : body.subject_details?.land_value,
    'land_value',
    'Land value'
  );

  let subject_details = {};
  const hasPricingOrMeta =
    price_source !== 'list_price' ||
    offer_price != null ||
    construction_detail != null ||
    sketch_areas != null ||
    recent_improvements != null;

  if (body.subject_details && typeof body.subject_details === 'object') {
    const nextSubjectDetails = {
      price_source,
      ...(offer_price != null ? { offer_price } : {}),
      ...(construction_detail != null ? { construction_detail } : {}),
      ...(sketch_areas != null ? { sketch_areas } : {}),
      ...(recent_improvements != null ? { recent_improvements } : {})
    };
    if (body.subject_details.as_is && typeof body.subject_details.as_is === 'object') {
      nextSubjectDetails.as_is = normalizeCompDetails({
        ...body.subject_details.as_is,
        ...(body.hoa_name !== undefined ? { hoa_name: hoa_name ?? '' } : {}),
        ...(body.boat_dock !== undefined ? { boat_dock } : {}),
        ...(body.boat_dock_sqft !== undefined ? { boat_dock_sqft } : {}),
        ...(body.boat_lift !== undefined ? { boat_lift } : {}),
        ...(body.construction_type !== undefined ? { construction_type: construction_type ?? 'unknown' } : {}),
        ...(body.construction_detail !== undefined ? { construction_detail: construction_detail ?? '' } : {}),
        ...(body.sketch_areas !== undefined ? { sketch_areas: sketch_areas ?? '' } : {}),
        ...(body.recent_improvements !== undefined ? { recent_improvements: recent_improvements ?? '' } : {}),
        ...(body.quality !== undefined ? { quality: quality ?? 'unknown' } : {})
      });
      const legacy = detailsToLegacyColumns(nextSubjectDetails.as_is);
      if (pool === null && legacy.pool !== null) pool = legacy.pool;
      if (garage === null && legacy.garage !== null) garage = legacy.garage;
      if (waterfront === null && legacy.waterfront !== null) waterfront = legacy.waterfront;
      if (boat_dock === null && legacy.boat_dock !== null) boat_dock = legacy.boat_dock;
      if (boat_dock_sqft == null && legacy.boat_dock_sqft != null) boat_dock_sqft = legacy.boat_dock_sqft;
      if (boat_lift === null && legacy.boat_lift !== null) boat_lift = legacy.boat_lift;
      if (construction_type == null && legacy.construction_type != null) construction_type = legacy.construction_type;
      if (quality == null && legacy.quality != null) quality = legacy.quality;
    } else if (boat_dock !== null || boat_dock_sqft != null || boat_lift !== null || construction_type != null || construction_detail != null || quality != null) {
      nextSubjectDetails.as_is = normalizeCompDetails({
        beds,
        baths,
        condition: condition || 'c4',
        quality: quality ?? 'unknown',
        roof_year,
        pool,
        garage,
        waterfront,
        boat_dock,
        boat_dock_sqft,
        boat_lift,
        construction_type: construction_type ?? 'unknown',
        construction_detail: construction_detail ?? '',
        sketch_areas: sketch_areas ?? '',
        recent_improvements: recent_improvements ?? '',
        hoa_name: hoa_name ?? ''
      });
    }
    if (body.subject_details.after_rehab && typeof body.subject_details.after_rehab === 'object') {
      nextSubjectDetails.after_rehab = normalizeCompDetails({
        ...body.subject_details.after_rehab,
        ...(body.hoa_name !== undefined ? { hoa_name: hoa_name ?? '' } : {}),
        ...(body.construction_type !== undefined &&
          (!body.subject_details.after_rehab.construction_type || body.subject_details.after_rehab.construction_type === 'unknown')
          ? { construction_type: construction_type ?? 'unknown' }
          : {}),
        ...(body.construction_detail !== undefined && !body.subject_details.after_rehab.construction_detail
          ? { construction_detail: construction_detail ?? '' }
          : {}),
        ...(body.quality !== undefined &&
          (!body.subject_details.after_rehab.quality || body.subject_details.after_rehab.quality === 'unknown')
          ? { quality: quality ?? 'unknown' }
          : {})
      });
    }
    if (land_value != null) {
      nextSubjectDetails.land_value = land_value;
    }
    subject_details = nextSubjectDetails;
  } else if (boat_dock !== null || boat_dock_sqft != null || boat_lift !== null || construction_type != null || quality != null || land_value != null || hasPricingOrMeta) {
    subject_details = {
      price_source,
      ...(offer_price != null ? { offer_price } : {}),
      ...(construction_detail != null ? { construction_detail } : {}),
      ...(sketch_areas != null ? { sketch_areas } : {}),
      ...(recent_improvements != null ? { recent_improvements } : {}),
      ...(land_value != null ? { land_value } : {}),
      as_is: normalizeCompDetails({
        beds,
        baths,
        condition: condition || 'c4',
        quality: quality ?? 'unknown',
        roof_year,
        pool,
        garage,
        waterfront,
        boat_dock,
        boat_dock_sqft,
        boat_lift,
        construction_type: construction_type ?? 'unknown',
        construction_detail: construction_detail ?? '',
        sketch_areas: sketch_areas ?? '',
        recent_improvements: recent_improvements ?? '',
        hoa_name: hoa_name ?? ''
      })
    };
  }

  return {
    errors,
    data: {
      address,
      city,
      state,
      zip,
      county,
      lat,
      lng,
      property_type,
      units,
      beds,
      baths,
      sqft,
      lot_sqft,
      year_built,
      list_price,
      price_source,
      offer_price,
      status,
      strategy,
      condition,
      roof_year,
      listing_url,
      notes,
      parcel_id,
      parcel_county,
      rehab_budget,
      rehab_budget_source,
      rehab_budget_updated_at,
      is_studying,
      has_hoa,
      hoa_monthly,
      hoa_name,
      pool,
      garage,
      waterfront,
      boat_dock,
      boat_dock_sqft,
      boat_lift,
      construction_type,
      construction_detail,
      sketch_areas,
      recent_improvements,
      quality,
      land_value,
      subject_details
    }
  };
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // GET: Single property (?id=...) or list all properties for current owner
    if (req.method === 'GET') {
      const id = req.query?.id;
      if (id) {
        let rows = [];
        try {
          rows = await sql`
            SELECT 
              p.id,
              p.owner_email,
              p.address,
              p.city,
              p.state,
              p.zip,
              p.county,
              p.lat,
              p.lng,
              p.property_type,
              p.units,
              p.beds,
              p.baths,
              p.sqft,
              p.lot_sqft,
              p.year_built,
              p.list_price,
              p.status,
              p.strategy,
              p.condition,
              p.roof_year,
              p.listing_url,
              p.notes,
              p.parcel_id,
              p.parcel_county,
              psi.flood_zone,
              psi.flood_subtype,
              psi.flood_sfha,
              psi.flood_bfe,
              psi.zoning_code,
              psi.zoning_desc,
              p.rehab_budget,
              p.rehab_budget_source,
              p.rehab_budget_updated_at,
              p.has_hoa,
              p.hoa_monthly,
              p.hoa_name,
              cp.s_legal,
              cp.subdivision_name,
              cp.subdivision_code,
              cp.nbrhd_cd,
              cp.mkt_ar,
              cp.const_class,
              cp.imp_qual,
              cp.eff_year_built,
              cp.just_value,
              cp.land_value AS parcel_land_value,
              p.pool,
              p.garage,
              p.waterfront,
              p.boat_dock,
              p.boat_dock_sqft,
              p.boat_lift,
              p.construction_type,
              p.quality,
              p.land_value,
              COALESCE(p.subject_details, '{}'::jsonb) AS subject_details,
              COALESCE(p.is_studying, false) AS is_studying,
              ipp.blob_url AS cover_photo_url,
              p.created_at,
              p.updated_at
            FROM investor_properties p
            LEFT JOIN parcel_site_info psi 
              ON psi.county = COALESCE(p.parcel_county, p.county, 'Broward') 
             AND psi.parcel_id = p.parcel_id
            LEFT JOIN county_parcels cp
              ON cp.county = COALESCE(p.parcel_county, p.county, 'Broward')
             AND cp.parcel_id = p.parcel_id
            LEFT JOIN LATERAL (
              SELECT blob_url FROM investor_property_photos
              WHERE property_id = p.id
              ORDER BY is_cover DESC, sort_order ASC, created_at ASC
              LIMIT 1
            ) ipp ON true
            WHERE p.id = ${id} AND lower(p.owner_email) = ${cleanEmail}
            LIMIT 1
          `;
        } catch (fullErr) {
          console.warn('Single property query with subject_details failed, falling back:', fullErr.message);
          try {
            rows = await sql`
              SELECT 
                p.id, p.owner_email, p.address, p.city, p.state, p.zip, p.county,
                p.lat, p.lng, p.property_type, p.units, p.beds, p.baths, p.sqft,
                p.lot_sqft, p.year_built, p.list_price, p.status, p.strategy,
                p.condition, p.roof_year, p.listing_url, p.notes,
                p.parcel_id, p.parcel_county,
                psi.flood_zone, psi.flood_subtype, psi.flood_sfha, psi.flood_bfe,
                psi.zoning_code, psi.zoning_desc,
                p.rehab_budget, p.rehab_budget_source, p.rehab_budget_updated_at,
                p.has_hoa, p.hoa_monthly,
                p.pool, p.garage, p.waterfront,
                COALESCE(p.before_offer_checklist->'subject_details', '{}'::jsonb) AS subject_details,
                COALESCE(p.is_studying, false) AS is_studying,
                ipp.blob_url AS cover_photo_url,
                p.created_at, p.updated_at
              FROM investor_properties p
              LEFT JOIN parcel_site_info psi 
                ON psi.county = COALESCE(p.parcel_county, p.county, 'Broward') 
               AND psi.parcel_id = p.parcel_id
              LEFT JOIN LATERAL (
                SELECT blob_url FROM investor_property_photos
                WHERE property_id = p.id
                ORDER BY is_cover DESC, sort_order ASC, created_at ASC
                LIMIT 1
              ) ipp ON true
              WHERE p.id = ${id} AND lower(p.owner_email) = ${cleanEmail}
              LIMIT 1
            `;
          } catch (colErr) {
            console.warn('Single property query without parcel columns failed, falling back:', colErr.message);
            rows = await sql`
              SELECT 
                id,
                owner_email,
                address,
                city,
                state,
                zip,
                county,
                lat,
                lng,
                property_type,
                units,
                beds,
                baths,
                sqft,
                lot_sqft,
                year_built,
                list_price,
                status,
                strategy,
                condition,
                roof_year,
                listing_url,
                notes,
                NULL::text AS parcel_id,
                NULL::text AS parcel_county,
                NULL::text AS flood_zone,
                NULL::text AS flood_subtype,
                NULL::boolean AS flood_sfha,
                NULL::numeric AS flood_bfe,
                NULL::text AS zoning_code,
                NULL::text AS zoning_desc,
                NULL::numeric AS rehab_budget,
                NULL::text AS rehab_budget_source,
                NULL::timestamptz AS rehab_budget_updated_at,
                COALESCE(is_studying, false) AS is_studying,
                NULL::text AS cover_photo_url,
                created_at,
                updated_at
              FROM investor_properties
              WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
              LIMIT 1
            `;
          }
        }

        if (rows.length === 0) {
          return res.status(404).json({ error: 'Property not found.' });
        }

        const singleNorm = normalizePropertyJsonb(rows[0]);
        const singleBc = singleNorm.parcel_id
          ? await fetchBuildingCharacteristicOne(sql, singleNorm.parcel_county || singleNorm.county, singleNorm.parcel_id)
          : null;
        return res.status(200).json(attachBuildingCharacteristicsToProperty(singleNorm, singleBc));
      }

      let properties = [];
      try {
        // Tier 1: Full joined query with site info and cover photo
        properties = await sql`
          SELECT 
            p.id,
            p.owner_email,
            p.address,
            p.city,
            p.state,
            p.zip,
            p.county,
            p.lat,
            p.lng,
            p.property_type,
            p.units,
            p.beds,
            p.baths,
            p.sqft,
            p.lot_sqft,
            p.year_built,
            p.list_price,
            p.status,
            p.strategy,
            p.condition,
            p.roof_year,
            p.listing_url,
            p.notes,
            p.parcel_id,
            p.parcel_county,
            psi.flood_zone,
            psi.flood_subtype,
            psi.flood_sfha,
            psi.flood_bfe,
            psi.zoning_code,
            psi.zoning_desc,
            p.rehab_budget,
            p.rehab_budget_source,
            p.rehab_budget_updated_at,
            p.has_hoa,
            p.hoa_monthly,
            p.hoa_name,
            cp.s_legal,
            cp.subdivision_name,
            cp.subdivision_code,
            cp.nbrhd_cd,
            cp.mkt_ar,
            cp.const_class,
            cp.imp_qual,
            cp.eff_year_built,
            cp.just_value,
            cp.land_value AS parcel_land_value,
            p.pool,
            p.garage,
            p.waterfront,
            p.boat_dock,
            p.boat_dock_sqft,
            p.boat_lift,
            p.construction_type,
            p.quality,
            p.land_value,
            COALESCE(p.subject_details, '{}'::jsonb) AS subject_details,
            COALESCE(p.is_studying, false) AS is_studying,
            ipp.blob_url AS cover_photo_url,
            p.created_at,
            p.updated_at
          FROM investor_properties p
          LEFT JOIN parcel_site_info psi 
            ON psi.county = COALESCE(p.parcel_county, p.county, 'Broward') 
           AND psi.parcel_id = p.parcel_id
          LEFT JOIN county_parcels cp
            ON cp.county = COALESCE(p.parcel_county, p.county, 'Broward')
           AND cp.parcel_id = p.parcel_id
          LEFT JOIN LATERAL (
            SELECT blob_url FROM investor_property_photos
            WHERE property_id = p.id
            ORDER BY is_cover DESC, sort_order ASC, created_at ASC
            LIMIT 1
          ) ipp ON true
          WHERE lower(p.owner_email) = ${cleanEmail}
          ORDER BY p.created_at DESC
        `;
      } catch (joinErr) {
        console.warn('Property query with subject_details failed, falling back:', joinErr.message);
        try {
          // Tier 2: Joined query without subject_details (works before add_comp_details_and_nal_clues.sql is applied)
          properties = await sql`
            SELECT 
              p.id, p.owner_email, p.address, p.city, p.state, p.zip, p.county,
              p.lat, p.lng, p.property_type, p.units, p.beds, p.baths, p.sqft,
              p.lot_sqft, p.year_built, p.list_price, p.status, p.strategy,
              p.condition, p.roof_year, p.listing_url, p.notes,
              p.parcel_id, p.parcel_county,
              psi.flood_zone, psi.flood_subtype, psi.flood_sfha, psi.flood_bfe,
              psi.zoning_code, psi.zoning_desc,
              p.rehab_budget, p.rehab_budget_source, p.rehab_budget_updated_at,
              p.has_hoa, p.hoa_monthly,
              p.pool, p.garage, p.waterfront,
              COALESCE(p.before_offer_checklist->'subject_details', '{}'::jsonb) AS subject_details,
              COALESCE(p.is_studying, false) AS is_studying,
              ipp.blob_url AS cover_photo_url,
              p.created_at, p.updated_at
            FROM investor_properties p
            LEFT JOIN parcel_site_info psi 
              ON psi.county = COALESCE(p.parcel_county, p.county, 'Broward') 
             AND psi.parcel_id = p.parcel_id
            LEFT JOIN LATERAL (
              SELECT blob_url FROM investor_property_photos
              WHERE property_id = p.id
              ORDER BY is_cover DESC, sort_order ASC, created_at ASC
              LIMIT 1
            ) ipp ON true
            WHERE lower(p.owner_email) = ${cleanEmail}
            ORDER BY p.created_at DESC
          `;
        } catch (parcelErr) {
          console.warn('Property query without joins failed, falling back to base columns:', parcelErr.message);
          // Tier 3: base table columns only (works even on oldest schema)
          properties = await sql`
            SELECT 
              id,
              owner_email,
              address,
              city,
              state,
              zip,
              county,
              lat,
              lng,
              property_type,
              units,
              beds,
              baths,
              sqft,
              lot_sqft,
              year_built,
              list_price,
              status,
              strategy,
              condition,
              roof_year,
              listing_url,
              notes,
              NULL::text AS parcel_id,
              NULL::text AS parcel_county,
              NULL::text AS flood_zone,
              NULL::text AS flood_subtype,
              NULL::boolean AS flood_sfha,
              NULL::numeric AS flood_bfe,
              NULL::text AS zoning_code,
              NULL::text AS zoning_desc,
              NULL::numeric AS rehab_budget,
              NULL::text AS rehab_budget_source,
              NULL::timestamptz AS rehab_budget_updated_at,
              COALESCE(is_studying, false) AS is_studying,
              NULL::text AS cover_photo_url,
              created_at,
              updated_at
            FROM investor_properties
            WHERE lower(owner_email) = ${cleanEmail}
            ORDER BY created_at DESC
          `;
        }
      }

      const bcMap = await fetchBuildingCharacteristicsMap(
        sql,
        properties.map((p) => p.parcel_id).filter(Boolean)
      );
      return res.status(200).json(
        properties.map((p) => {
          const norm = normalizePropertyJsonb(p);
          const bcRow = norm.parcel_id
            ? lookupBuildingRecord(bcMap, norm.parcel_county || norm.county, norm.parcel_id)
            : null;
          return attachBuildingCharacteristicsToProperty(norm, bcRow);
        })
      );
    }

    // POST: Create a new property
    if (req.method === 'POST') {
      const { errors, data } = validateProperty(req.body || {});
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: Object.values(errors)[0], errors });
      }

      // County comes from the linked parcel, else from coordinates (never a hard-coded list)
      await applyPropertyCountyRules(sql, data);

      let rows;
      try {
        rows = await sql`
          INSERT INTO investor_properties (
            owner_email,
            address,
            city,
            state,
            zip,
            county,
            lat,
            lng,
            property_type,
            units,
            beds,
            baths,
            sqft,
            lot_sqft,
            year_built,
            list_price,
            status,
            strategy,
            condition,
            roof_year,
            listing_url,
            notes,
            parcel_id,
            parcel_county,
            has_hoa,
            hoa_monthly,
            hoa_name
          ) VALUES (
            ${cleanEmail},
            ${data.address},
            ${data.city},
            ${data.state},
            ${data.zip},
            ${data.county},
            ${data.lat},
            ${data.lng},
            ${data.property_type},
            ${data.units},
            ${data.beds},
            ${data.baths},
            ${data.sqft},
            ${data.lot_sqft},
            ${data.year_built},
            ${data.list_price},
            ${data.status},
            ${data.strategy},
            ${data.condition},
            ${data.roof_year},
            ${data.listing_url},
            ${data.notes},
            ${data.parcel_id},
            ${data.parcel_county},
            ${data.has_hoa},
            ${data.hoa_monthly},
            ${data.hoa_name}
          )
          RETURNING *
        `;
      } catch (colErr) {
        if (colErr?.code === '23514') throw colErr;
        console.warn('Insert with parcel/HOA columns failed, falling back to base columns:', colErr.message);
        rows = await sql`
          INSERT INTO investor_properties (
            owner_email,
            address,
            city,
            state,
            zip,
            county,
            lat,
            lng,
            property_type,
            units,
            beds,
            baths,
            sqft,
            lot_sqft,
            year_built,
            list_price,
            status,
            strategy,
            condition,
            roof_year,
            listing_url,
            notes
          ) VALUES (
            ${cleanEmail},
            ${data.address},
            ${data.city},
            ${data.state},
            ${data.zip},
            ${data.county},
            ${data.lat},
            ${data.lng},
            ${data.property_type},
            ${data.units},
            ${data.beds},
            ${data.baths},
            ${data.sqft},
            ${data.lot_sqft},
            ${data.year_built},
            ${data.list_price},
            ${data.status},
            ${data.strategy},
            ${data.condition},
            ${data.roof_year},
            ${data.listing_url},
            ${data.notes}
          )
          RETURNING *
        `;
        if (rows[0]) {
          rows[0].parcel_id = data.parcel_id || null;
          rows[0].parcel_county = data.parcel_county || null;
          rows[0].hoa_name = data.hoa_name || null;
        }
      }

      if (rows[0]?.id) {
        if (Object.keys(data.subject_details || {}).length > 0) {
          try {
            await sql`
              UPDATE investor_properties
              SET subject_details = ${sql.json(data.subject_details)}
              WHERE id = ${rows[0].id} AND lower(owner_email) = ${cleanEmail}
            `;
            rows[0].subject_details = data.subject_details;
          } catch {
            // ignore if subject_details column pending
          }
        }
        await syncPropertyExtraColumns(sql, cleanEmail, rows[0].id, data);
        rows[0].boat_dock = data.boat_dock;
        rows[0].boat_dock_sqft = data.boat_dock_sqft;
        rows[0].boat_lift = data.boat_lift;
        rows[0].construction_type = data.construction_type;
        rows[0].construction_detail = data.construction_detail;
        rows[0].price_source = data.price_source;
        rows[0].offer_price = data.offer_price;
        rows[0].sketch_areas = data.sketch_areas;
        rows[0].recent_improvements = data.recent_improvements;
        rows[0].quality = data.quality;
        rows[0].land_value = data.land_value;
      }

      const enriched = await attachParcelSubdivisionFields(sql, rows[0]);
      return res.status(200).json(enriched);
    }

    // PUT: Update an existing property
    if (req.method === 'PUT') {
      const id = req.body?.id || req.query?.id;
      if (!id) {
        return res.status(400).json({ error: 'Property ID is required for update.' });
      }

      const { errors, data } = validateProperty(req.body || {});
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: Object.values(errors)[0], errors });
      }

      // County comes from the linked parcel, else from coordinates (never a hard-coded list)
      await applyPropertyCountyRules(sql, data);

      let rows;
      try {
        rows = await sql`
          UPDATE investor_properties
          SET
            address = ${data.address},
            city = ${data.city},
            state = ${data.state},
            zip = ${data.zip},
            county = ${data.county},
            lat = ${data.lat},
            lng = ${data.lng},
            property_type = ${data.property_type},
            units = ${data.units},
            beds = ${data.beds},
            baths = ${data.baths},
            sqft = ${data.sqft},
            lot_sqft = ${data.lot_sqft},
            year_built = ${data.year_built},
            list_price = ${data.list_price},
            status = ${data.status},
            strategy = ${data.strategy},
            condition = ${data.condition},
            roof_year = ${data.roof_year},
            listing_url = ${data.listing_url},
            notes = ${data.notes},
            parcel_id = ${data.parcel_id},
            parcel_county = ${data.parcel_county},
            rehab_budget = ${data.rehab_budget},
            rehab_budget_source = ${data.rehab_budget_source},
            rehab_budget_updated_at = ${data.rehab_budget_updated_at},
            has_hoa = ${data.has_hoa},
            hoa_monthly = ${data.hoa_monthly},
            hoa_name = ${data.hoa_name},
            pool = ${data.pool},
            garage = ${data.garage},
            waterfront = ${data.waterfront},
            subject_details = ${sql.json(data.subject_details || {})},
            is_studying = ${data.is_studying}
          WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
          RETURNING *
        `;
      } catch (colErr) {
        if (colErr?.code === '23514') throw colErr;
        console.warn('Update with subject_details columns failed, falling back:', colErr.message);
        try {
          rows = await sql`
            UPDATE investor_properties
            SET
              address = ${data.address},
              city = ${data.city},
              state = ${data.state},
              zip = ${data.zip},
              county = ${data.county},
              lat = ${data.lat},
              lng = ${data.lng},
              property_type = ${data.property_type},
              units = ${data.units},
              beds = ${data.beds},
              baths = ${data.baths},
              sqft = ${data.sqft},
              lot_sqft = ${data.lot_sqft},
              year_built = ${data.year_built},
              list_price = ${data.list_price},
              status = ${data.status},
              strategy = ${data.strategy},
              condition = ${data.condition},
              roof_year = ${data.roof_year},
              listing_url = ${data.listing_url},
              notes = ${data.notes},
              parcel_id = ${data.parcel_id},
              parcel_county = ${data.parcel_county},
              rehab_budget = ${data.rehab_budget},
              rehab_budget_source = ${data.rehab_budget_source},
              rehab_budget_updated_at = ${data.rehab_budget_updated_at},
              has_hoa = ${data.has_hoa},
              hoa_monthly = ${data.hoa_monthly},
              pool = ${data.pool},
              garage = ${data.garage},
              waterfront = ${data.waterfront},
              before_offer_checklist = jsonb_set(
                COALESCE(before_offer_checklist, '{}'::jsonb),
                '{subject_details}',
                ${sql.json(data.subject_details || {})},
                true
              ),
              is_studying = ${data.is_studying}
            WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
            RETURNING *
          `;
          if (rows[0]) {
            rows[0].subject_details = data.subject_details || {};
          }
        } catch {
          rows = await sql`
            UPDATE investor_properties
            SET
              address = ${data.address},
              city = ${data.city},
              state = ${data.state},
              zip = ${data.zip},
              county = ${data.county},
              lat = ${data.lat},
              lng = ${data.lng},
              property_type = ${data.property_type},
              units = ${data.units},
              beds = ${data.beds},
              baths = ${data.baths},
              sqft = ${data.sqft},
              lot_sqft = ${data.lot_sqft},
              year_built = ${data.year_built},
              list_price = ${data.list_price},
              status = ${data.status},
              strategy = ${data.strategy},
              condition = ${data.condition},
              roof_year = ${data.roof_year},
              listing_url = ${data.listing_url},
              notes = ${data.notes},
              is_studying = ${data.is_studying}
            WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
            RETURNING *
          `;
          if (rows[0]) {
            rows[0].parcel_id = data.parcel_id || null;
            rows[0].parcel_county = data.parcel_county || null;
            rows[0].rehab_budget = data.rehab_budget || null;
            rows[0].rehab_budget_source = data.rehab_budget_source || null;
            rows[0].rehab_budget_updated_at = data.rehab_budget_updated_at || null;
            rows[0].hoa_name = data.hoa_name || null;
            rows[0].subject_details = data.subject_details || {};
          }
        }
      }

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      await syncPropertyExtraColumns(sql, cleanEmail, id, data);
      rows[0].boat_dock = data.boat_dock;
      rows[0].boat_dock_sqft = data.boat_dock_sqft;
      rows[0].boat_lift = data.boat_lift;
      rows[0].construction_type = data.construction_type;
      rows[0].construction_detail = data.construction_detail;
      rows[0].price_source = data.price_source;
      rows[0].offer_price = data.offer_price;
      rows[0].sketch_areas = data.sketch_areas;
      rows[0].recent_improvements = data.recent_improvements;
      rows[0].quality = data.quality;
      rows[0].land_value = data.land_value;

      const enriched = await attachParcelSubdivisionFields(sql, rows[0]);
      return res.status(200).json(enriched);
    }

    // PATCH: Partial update (for discrepancy sync or linking folio)
    if (req.method === 'PATCH') {
      const id = req.body?.id || req.query?.id;
      if (!id) {
        return res.status(400).json({ error: 'Property ID is required for update.' });
      }

      // Fetch current property
      const current = await sql`
        SELECT * FROM investor_properties
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (current.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      const parsedCurrentSubjectDetails = parseJsonbObject(current[0].subject_details);
      const parsedChecklist = parseJsonbObject(current[0].before_offer_checklist);
      const prevSubjectDetails =
        Object.keys(parsedCurrentSubjectDetails).length > 0
          ? parsedCurrentSubjectDetails
          : parseJsonbObject(parsedChecklist.subject_details);

      const merged = {
        ...current[0],
        ...req.body,
        subject_details: req.body?.subject_details !== undefined
          ? {
              ...prevSubjectDetails,
              ...parseJsonbObject(req.body.subject_details)
            }
          : prevSubjectDetails
      };
      const { errors, data } = validateProperty(merged);
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: Object.values(errors)[0], errors });
      }

      // County comes from the linked parcel, else from coordinates (never a hard-coded list)
      await applyPropertyCountyRules(sql, data);

      let rows;
      try {
        rows = await sql`
          UPDATE investor_properties
          SET
            address = ${data.address},
            city = ${data.city},
            state = ${data.state},
            zip = ${data.zip},
            county = ${data.county},
            lat = ${data.lat},
            lng = ${data.lng},
            property_type = ${data.property_type},
            units = ${data.units},
            beds = ${data.beds},
            baths = ${data.baths},
            sqft = ${data.sqft},
            lot_sqft = ${data.lot_sqft},
            year_built = ${data.year_built},
            list_price = ${data.list_price},
            status = ${data.status},
            strategy = ${data.strategy},
            condition = ${data.condition},
            roof_year = ${data.roof_year},
            listing_url = ${data.listing_url},
            notes = ${data.notes},
            parcel_id = ${data.parcel_id},
            parcel_county = ${data.parcel_county},
            rehab_budget = ${data.rehab_budget},
            rehab_budget_source = ${data.rehab_budget_source},
            rehab_budget_updated_at = ${data.rehab_budget_updated_at},
            has_hoa = ${data.has_hoa},
            hoa_monthly = ${data.hoa_monthly},
            hoa_name = ${data.hoa_name},
            pool = ${data.pool},
            garage = ${data.garage},
            waterfront = ${data.waterfront},
            subject_details = ${sql.json(data.subject_details || {})},
            is_studying = ${data.is_studying}
          WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
          RETURNING *
        `;
      } catch (colErr) {
        if (colErr?.code === '23514') throw colErr;
        console.warn('Patch with subject_details column failed, storing in before_offer_checklist fallback:', colErr.message);
        try {
          rows = await sql`
            UPDATE investor_properties
            SET
              address = ${data.address},
              city = ${data.city},
              state = ${data.state},
              zip = ${data.zip},
              county = ${data.county},
              lat = ${data.lat},
              lng = ${data.lng},
              property_type = ${data.property_type},
              units = ${data.units},
              beds = ${data.beds},
              baths = ${data.baths},
              sqft = ${data.sqft},
              lot_sqft = ${data.lot_sqft},
              year_built = ${data.year_built},
              list_price = ${data.list_price},
              status = ${data.status},
              strategy = ${data.strategy},
              condition = ${data.condition},
              roof_year = ${data.roof_year},
              listing_url = ${data.listing_url},
              notes = ${data.notes},
              parcel_id = ${data.parcel_id},
              parcel_county = ${data.parcel_county},
              rehab_budget = ${data.rehab_budget},
              rehab_budget_source = ${data.rehab_budget_source},
              rehab_budget_updated_at = ${data.rehab_budget_updated_at},
              has_hoa = ${data.has_hoa},
              hoa_monthly = ${data.hoa_monthly},
              pool = ${data.pool},
              garage = ${data.garage},
              waterfront = ${data.waterfront},
              before_offer_checklist = jsonb_set(
                COALESCE(before_offer_checklist, '{}'::jsonb),
                '{subject_details}',
                ${sql.json(data.subject_details || {})},
                true
              ),
              is_studying = ${data.is_studying}
            WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
            RETURNING *
          `;
          if (rows[0]) {
            rows[0].subject_details = data.subject_details || {};
          }
        } catch {
          rows = await sql`
            UPDATE investor_properties
            SET
              address = ${data.address},
              city = ${data.city},
              state = ${data.state},
              zip = ${data.zip},
              county = ${data.county},
              lat = ${data.lat},
              lng = ${data.lng},
              property_type = ${data.property_type},
              units = ${data.units},
              beds = ${data.beds},
              baths = ${data.baths},
              sqft = ${data.sqft},
              lot_sqft = ${data.lot_sqft},
              year_built = ${data.year_built},
              list_price = ${data.list_price},
              status = ${data.status},
              strategy = ${data.strategy},
              condition = ${data.condition},
              roof_year = ${data.roof_year},
              listing_url = ${data.listing_url},
              notes = ${data.notes},
              is_studying = ${data.is_studying}
            WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
            RETURNING *
          `;
          if (rows[0]) {
            rows[0].parcel_id = data.parcel_id || null;
            rows[0].parcel_county = data.parcel_county || null;
            rows[0].rehab_budget = data.rehab_budget || null;
            rows[0].rehab_budget_source = data.rehab_budget_source || null;
            rows[0].rehab_budget_updated_at = data.rehab_budget_updated_at || null;
            rows[0].hoa_name = data.hoa_name || null;
            rows[0].subject_details = data.subject_details || {};
          }
        }
      }

      if (rows[0]?.id) {
        await syncPropertyExtraColumns(sql, cleanEmail, id, data);
        rows[0].boat_dock = data.boat_dock;
        rows[0].boat_dock_sqft = data.boat_dock_sqft;
        rows[0].boat_lift = data.boat_lift;
        rows[0].construction_type = data.construction_type;
        rows[0].construction_detail = data.construction_detail;
        rows[0].price_source = data.price_source;
        rows[0].offer_price = data.offer_price;
        rows[0].sketch_areas = data.sketch_areas;
        rows[0].recent_improvements = data.recent_improvements;
        rows[0].quality = data.quality;
        rows[0].land_value = data.land_value;
      }

      const enriched = await attachParcelSubdivisionFields(sql, rows[0]);
      return res.status(200).json(enriched);
    }

    // DELETE: Delete a property
    if (req.method === 'DELETE') {
      const id = req.body?.id || req.query?.id;
      if (!id) {
        return res.status(400).json({ error: 'Property ID is required for delete.' });
      }

      const rows = await sql`
        DELETE FROM investor_properties
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING id
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      return res.status(200).json({ success: true, id: rows[0].id });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    return sendSafeApiError(res, error, 'Investor Properties API Error', 'Unable to process property request right now. Please try again.');
  }
}
