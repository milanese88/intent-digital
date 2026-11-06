import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

const ALLOWED_PROPERTY_TYPES = ['single_family', 'condo', 'townhome', 'multifamily_2_9', 'other'];
const ALLOWED_STATUSES = ['watching', 'analyzing', 'offer_sent', 'under_contract', 'passed', 'owned'];
const ALLOWED_STRATEGIES = ['rental', 'flip', 'brrrr'];

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

  return {
    errors,
    data: {
      address,
      city,
      state,
      zip,
      county,
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

    // GET: List all properties for current owner
    if (req.method === 'GET') {
      const properties = await sql`
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
          created_at,
          updated_at
        FROM investor_properties
        WHERE lower(owner_email) = ${cleanEmail}
        ORDER BY created_at DESC
      `;

      return res.status(200).json(properties);
    }

    // POST: Create a new property
    if (req.method === 'POST') {
      const { errors, data } = validateProperty(req.body || {});
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: Object.values(errors)[0], errors });
      }

      const rows = await sql`
        INSERT INTO investor_properties (
          owner_email,
          address,
          city,
          state,
          zip,
          county,
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

      return res.status(200).json(rows[0]);
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

      const rows = await sql`
        UPDATE investor_properties
        SET
          address = ${data.address},
          city = ${data.city},
          state = ${data.state},
          zip = ${data.zip},
          county = ${data.county},
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
          notes = ${data.notes}
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING *
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      return res.status(200).json(rows[0]);
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
    console.error('Investor Properties API Error:', error);
    return res.status(500).json({ error: error.message || 'Server error processing request.' });
  }
}
