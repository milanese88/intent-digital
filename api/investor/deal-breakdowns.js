import { getUserFromSession } from '../_lib/session.js';
import { getDb, parseJsonbObject, sendSafeApiError } from '../_lib/db.js';
import { normalizeCountyName } from '../../src/config/counties.js';
import { calculateDealBreakdown } from '../../src/components/investor/dealBreakdownEngine.js';

const ALLOWED_DEAL_TYPES = ['flip', 'demo_new_build'];

function validateDealBreakdownPayload(body = {}) {
  const errors = {};
  const address = body.address != null ? String(body.address).trim() : '';
  if (!address) {
    errors.address = 'Property address is required.';
  }

  const rawType = String(body.deal_type || body.inputs?.dealType || 'flip').trim().toLowerCase();
  const deal_type = ALLOWED_DEAL_TYPES.includes(rawType) ? rawType : null;
  if (!deal_type) {
    errors.deal_type = 'deal_type must be flip or demo_new_build.';
  }

  const rawCounty = body.county || body.inputs?.county || 'Broward';
  const county = normalizeCountyName(rawCounty) || String(rawCounty).trim() || 'Broward';
  const property_id = body.property_id ? String(body.property_id).trim() : null;
  const parcel_id = body.parcel_id ? String(body.parcel_id).trim() : null;
  const city = body.city != null && String(body.city).trim() !== '' ? String(body.city).trim() : null;
  const zip = body.zip != null && String(body.zip).trim() !== '' ? String(body.zip).trim() : null;
  const title = body.title != null && String(body.title).trim() !== '' ? String(body.title).trim().slice(0, 160) : null;
  const notes = body.notes != null && String(body.notes).trim() !== '' ? String(body.notes).trim().slice(0, 4000) : null;

  const rawInputs = body.inputs && typeof body.inputs === 'object' ? { ...body.inputs } : {};
  rawInputs.dealType = deal_type || 'flip';
  rawInputs.county = county;
  rawInputs.address = address;
  if (parcel_id) rawInputs.parcelId = parcel_id;
  if (city) rawInputs.city = city;
  if (zip) rawInputs.zip = zip;

  return {
    errors,
    data: {
      property_id,
      county,
      parcel_id,
      address,
      city,
      zip,
      deal_type,
      title,
      notes,
      inputs: rawInputs
    }
  };
}

function hydrateBreakdownRow(row) {
  if (!row) return null;
  return {
    ...row,
    inputs: parseJsonbObject(row.inputs),
    results: parseJsonbObject(row.results)
  };
}

async function fetchUserBuyingProfile(sql, cleanEmail) {
  try {
    const rows = await sql`
      SELECT liquid_cash, reserve_months, credit_tier, rate_sheet
      FROM investor_profile
      WHERE lower(owner_email) = ${cleanEmail}
      LIMIT 1;
    `;
    if (rows[0]) {
      return {
        ...rows[0],
        rate_sheet: parseJsonbObject(rows[0].rate_sheet)
      };
    }
  } catch {
    // Non-fatal fallback
  }
  return null;
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // GET: list saved breakdowns (by id, property_id, parcel_id, or all for owner)
    if (req.method === 'GET') {
      const id = req.query?.id ? String(req.query.id).trim() : null;
      const propertyId = req.query?.property_id ? String(req.query.property_id).trim() : null;
      const parcelId = req.query?.parcel_id ? String(req.query.parcel_id).trim() : null;
      const rawCounty = req.query?.county ? String(req.query.county).trim() : null;
      const county = rawCounty ? (normalizeCountyName(rawCounty) || rawCounty) : null;

      try {
        if (id) {
          const rows = await sql`
            SELECT *
            FROM deal_breakdowns
            WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
            LIMIT 1;
          `;
          if (rows.length === 0) return res.status(404).json({ error: 'Deal breakdown not found.' });
          return res.status(200).json({ item: hydrateBreakdownRow(rows[0]) });
        }

        let rows;
        if (propertyId && parcelId) {
          rows = await sql`
            SELECT *
            FROM deal_breakdowns
            WHERE lower(owner_email) = ${cleanEmail}
              AND (property_id = ${propertyId} OR (parcel_id = ${parcelId} AND (${county}::text IS NULL OR county = ${county})))
            ORDER BY updated_at DESC
            LIMIT 50;
          `;
        } else if (propertyId) {
          rows = await sql`
            SELECT *
            FROM deal_breakdowns
            WHERE lower(owner_email) = ${cleanEmail}
              AND property_id = ${propertyId}
            ORDER BY updated_at DESC
            LIMIT 50;
          `;
        } else if (parcelId) {
          rows = await sql`
            SELECT *
            FROM deal_breakdowns
            WHERE lower(owner_email) = ${cleanEmail}
              AND parcel_id = ${parcelId}
              AND (${county}::text IS NULL OR county = ${county})
            ORDER BY updated_at DESC
            LIMIT 50;
          `;
        } else {
          rows = await sql`
            SELECT *
            FROM deal_breakdowns
            WHERE lower(owner_email) = ${cleanEmail}
            ORDER BY updated_at DESC
            LIMIT 100;
          `;
        }

        return res.status(200).json({
          items: rows.map(hydrateBreakdownRow)
        });
      } catch (err) {
        if (err?.code === '42P01') {
          return res.status(200).json({
            items: [],
            schemaNeedsUpdate: true
          });
        }
        throw err;
      }
    }

    // POST: Create a saved Deal Breakdown
    if (req.method === 'POST') {
      const { errors, data } = validateDealBreakdownPayload(req.body || {});
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: Object.values(errors)[0], errors });
      }

      // Verify ownership if linked to a saved property
      if (data.property_id) {
        const owns = await sql`
          SELECT id FROM investor_properties
          WHERE id = ${data.property_id} AND lower(owner_email) = ${cleanEmail}
          LIMIT 1;
        `;
        if (owns.length === 0) {
          return res.status(404).json({ error: 'Linked property not found.' });
        }
      }

      const profile = await fetchUserBuyingProfile(sql, cleanEmail);
      const computed = calculateDealBreakdown(data.inputs, profile);
      const resultsPayload = {
        asOf: computed.asOf,
        costs: computed.costs,
        metrics: computed.metrics,
        scenarios: computed.scenarios,
        myVersion: computed.myVersion
      };

      const rows = await sql`
        INSERT INTO deal_breakdowns (
          owner_email,
          property_id,
          county,
          parcel_id,
          address,
          city,
          zip,
          deal_type,
          title,
          inputs,
          results,
          notes,
          updated_at
        ) VALUES (
          ${cleanEmail},
          ${data.property_id},
          ${data.county},
          ${data.parcel_id},
          ${data.address},
          ${data.city},
          ${data.zip},
          ${data.deal_type},
          ${data.title},
          ${sql.json(computed.inputs)},
          ${sql.json(resultsPayload)},
          ${data.notes},
          now()
        )
        RETURNING *;
      `;

      return res.status(201).json(hydrateBreakdownRow(rows[0]));
    }

    // PUT: Update an existing saved Deal Breakdown
    if (req.method === 'PUT') {
      const id = req.body?.id || req.query?.id;
      if (!id) {
        return res.status(400).json({ error: 'Deal breakdown id is required for update.' });
      }

      const { errors, data } = validateDealBreakdownPayload(req.body || {});
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: Object.values(errors)[0], errors });
      }

      const profile = await fetchUserBuyingProfile(sql, cleanEmail);
      const computed = calculateDealBreakdown(data.inputs, profile);
      const resultsPayload = {
        asOf: computed.asOf,
        costs: computed.costs,
        metrics: computed.metrics,
        scenarios: computed.scenarios,
        myVersion: computed.myVersion
      };

      const rows = await sql`
        UPDATE deal_breakdowns
        SET
          property_id = COALESCE(${data.property_id}, property_id),
          county = ${data.county},
          parcel_id = COALESCE(${data.parcel_id}, parcel_id),
          address = ${data.address},
          city = ${data.city},
          zip = ${data.zip},
          deal_type = ${data.deal_type},
          title = ${data.title},
          inputs = ${sql.json(computed.inputs)},
          results = ${sql.json(resultsPayload)},
          notes = ${data.notes},
          updated_at = now()
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING *;
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Deal breakdown not found.' });
      }
      return res.status(200).json(hydrateBreakdownRow(rows[0]));
    }

    // DELETE: Remove a saved Deal Breakdown
    if (req.method === 'DELETE') {
      const id = req.body?.id || req.query?.id;
      if (!id) {
        return res.status(400).json({ error: 'Deal breakdown id is required for delete.' });
      }

      const rows = await sql`
        DELETE FROM deal_breakdowns
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING id;
      `;
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Deal breakdown not found.' });
      }
      return res.status(200).json({ success: true, id: rows[0].id });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    return sendSafeApiError(
      res,
      err,
      'Deal Breakdown API Error',
      'Unable to save or load deal breakdown right now.'
    );
  }
}

