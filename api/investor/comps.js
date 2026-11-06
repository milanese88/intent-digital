import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

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

  // Optional fields
  const parseNumField = (val, isInt = false) => {
    if (val === undefined || val === null || String(val).trim() === '') return null;
    const num = Number(String(val).replace(/,/g, '').trim());
    if (isNaN(num) || num < 0) return null;
    return isInt ? Math.round(num) : num;
  };

  const beds = parseNumField(body.beds, false);
  const baths = parseNumField(body.baths, false);
  const year_built = parseNumField(body.year_built, true);
  const city = body.city != null && String(body.city).trim() !== '' ? String(body.city).trim() : null;
  const zip = body.zip != null && String(body.zip).trim() !== '' ? String(body.zip).trim() : null;
  const source = body.source != null && String(body.source).trim() !== '' ? String(body.source).trim() : null;
  const included = body.included !== undefined ? Boolean(body.included) : true;

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
      included,
      source
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

    // GET: List comps for a property, or all comps for user if no property_id
    if (req.method === 'GET') {
      const propertyId = req.query?.property_id;

      if (propertyId) {
        // FIRST confirm property_id belongs to the logged-in user
        const prop = await sql`
          SELECT id, lat, lng FROM investor_properties
          WHERE id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
          LIMIT 1
        `;
        if (prop.length === 0) {
          return res.status(404).json({ error: 'Property not found.' });
        }

        const comps = await sql`
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
            created_at
          FROM investor_comps
          WHERE property_id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
          ORDER BY sold_date DESC NULLS LAST, created_at DESC
        `;

        return res.status(200).json(comps);
      }

      // No property_id: return all comps for the logged-in user
      const allComps = await sql`
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
          created_at
        FROM investor_comps
        WHERE lower(owner_email) = ${cleanEmail}
        ORDER BY sold_date DESC NULLS LAST, created_at DESC
      `;

      return res.status(200).json(allComps);
    }

    // POST: Create a new comp
    if (req.method === 'POST') {
      const propertyId = req.body?.property_id;
      if (!propertyId) {
        return res.status(400).json({ error: 'property_id is required.' });
      }

      // FIRST confirm property_id belongs to the logged-in user
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

      // Calculate distance_mi if both property and comp have lat/lng
      let distance_mi = null;
      if (prop[0].lat != null && prop[0].lng != null && data.lat != null && data.lng != null) {
        distance_mi = calculateDistanceMi(prop[0].lat, prop[0].lng, data.lat, data.lng);
      }

      const rows = await sql`
        INSERT INTO investor_comps (
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
          distance_mi,
          included,
          source
        ) VALUES (
          ${cleanEmail},
          ${propertyId},
          ${data.address},
          ${data.city},
          ${data.zip},
          ${data.lat},
          ${data.lng},
          ${data.sold_date},
          ${data.sold_price},
          ${data.sqft},
          ${data.beds},
          ${data.baths},
          ${data.year_built},
          ${distance_mi},
          ${data.included},
          ${data.source}
        )
        RETURNING *
      `;

      return res.status(200).json(rows[0]);
    }

    // PUT: Update an existing comp
    if (req.method === 'PUT') {
      const id = req.body?.id || req.query?.id;
      if (!id) {
        return res.status(400).json({ error: 'Comp ID is required for update.' });
      }

      // Check comp exists and belongs to logged-in user
      const existing = await sql`
        SELECT id, property_id, lat, lng, address, city, zip, sold_date, sold_price, sqft, beds, baths, year_built, distance_mi, included, source
        FROM investor_comps
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Comp not found.' });
      }

      const currentComp = existing[0];
      const propertyId = req.body?.property_id || currentComp.property_id;

      // FIRST confirm property_id belongs to the logged-in user
      const prop = await sql`
        SELECT id, lat, lng FROM investor_properties
        WHERE id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (prop.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      // If this is an 'included' toggle only
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
        return res.status(200).json(rows[0]);
      }

      const { errors, data } = validateComp(req.body || {}, true);
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: Object.values(errors)[0], errors });
      }

      const finalAddress = data.address || currentComp.address;
      const finalCity = data.city !== undefined ? data.city : currentComp.city;
      const finalZip = data.zip !== undefined ? data.zip : currentComp.zip;
      const finalLat = data.lat !== undefined ? data.lat : currentComp.lat;
      const finalLng = data.lng !== undefined ? data.lng : currentComp.lng;
      const finalSoldDate = data.sold_date !== undefined ? data.sold_date : currentComp.sold_date;
      const finalSoldPrice = data.sold_price !== undefined ? data.sold_price : currentComp.sold_price;
      const finalSqft = data.sqft !== undefined ? data.sqft : currentComp.sqft;
      const finalBeds = data.beds !== undefined ? data.beds : currentComp.beds;
      const finalBaths = data.baths !== undefined ? data.baths : currentComp.baths;
      const finalYearBuilt = data.year_built !== undefined ? data.year_built : currentComp.year_built;
      const finalIncluded = data.included !== undefined ? data.included : currentComp.included;
      const finalSource = data.source !== undefined ? data.source : currentComp.source;

      // Calculate distance_mi if both property and comp have lat/lng
      let finalDistance = null;
      if (prop[0].lat != null && prop[0].lng != null && finalLat != null && finalLng != null) {
        finalDistance = calculateDistanceMi(prop[0].lat, prop[0].lng, finalLat, finalLng);
      }

      const rows = await sql`
        UPDATE investor_comps
        SET
          address = ${finalAddress},
          city = ${finalCity},
          zip = ${finalZip},
          lat = ${finalLat},
          lng = ${finalLng},
          sold_date = ${finalSoldDate},
          sold_price = ${finalSoldPrice},
          sqft = ${finalSqft},
          beds = ${finalBeds},
          baths = ${finalBaths},
          year_built = ${finalYearBuilt},
          distance_mi = ${finalDistance},
          included = ${finalIncluded},
          source = ${finalSource}
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING *
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Comp not found.' });
      }

      return res.status(200).json(rows[0]);
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

      // FIRST confirm the property_id belongs to the logged-in user
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
