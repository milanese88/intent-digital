/**
 * api/investor/permits.js
 *
 * REST API for property permits (manual and open data).
 * Supports listing, adding, and deleting permits.
 * Strictly non-PII.
 */

import { getUserFromSession } from '../_lib/session.js';
import { getDb, sendSafeApiError } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();

    // GET /api/investor/permits?property_id=...&folio=...
    if (req.method === 'GET') {
      const propertyId = req.query?.property_id ? String(req.query.property_id).trim() : null;
      const folio = req.query?.folio ? String(req.query.folio).trim() : null;
      const cleanEmail = (user.email || '').trim().toLowerCase();

      try {
        let rows = [];
        if (propertyId && folio) {
          rows = await sql`
            SELECT 
              id, property_id, county, folio, permit_number, permit_type,
              issue_date, final_date, job_value, status, description, source,
              created_at, updated_at
            FROM property_permits
            WHERE lower(owner_email) = ${cleanEmail}
              AND (property_id = ${propertyId} OR folio = ${folio})
            ORDER BY issue_date DESC NULLS LAST, created_at DESC;
          `;
        } else if (propertyId) {
          rows = await sql`
            SELECT 
              id, property_id, county, folio, permit_number, permit_type,
              issue_date, final_date, job_value, status, description, source,
              created_at, updated_at
            FROM property_permits
            WHERE lower(owner_email) = ${cleanEmail}
              AND property_id = ${propertyId}
            ORDER BY issue_date DESC NULLS LAST, created_at DESC;
          `;
        } else if (folio) {
          rows = await sql`
            SELECT 
              id, property_id, county, folio, permit_number, permit_type,
              issue_date, final_date, job_value, status, description, source,
              created_at, updated_at
            FROM property_permits
            WHERE lower(owner_email) = ${cleanEmail}
              AND folio = ${folio}
            ORDER BY issue_date DESC NULLS LAST, created_at DESC;
          `;
        } else {
          rows = await sql`
            SELECT 
              id, property_id, county, folio, permit_number, permit_type,
              issue_date, final_date, job_value, status, description, source,
              created_at, updated_at
            FROM property_permits
            WHERE lower(owner_email) = ${cleanEmail}
            ORDER BY issue_date DESC NULLS LAST, created_at DESC
            LIMIT 100;
          `;
        }
        return res.status(200).json({ permits: rows });
      } catch (err) {
        if (err?.code === '42P01') {
          // Table not yet migrated; return empty list gracefully
          return res.status(200).json({ permits: [] });
        }
        return sendSafeApiError(res, err, 'Error reading permits');
      }
    }

    // POST /api/investor/permits
    if (req.method === 'POST') {
      const body = req.body || {};
      const propertyId = body.property_id || null;
      const folio = body.folio || null;
      const county = body.county || 'Broward';
      const permitType = String(body.permit_type || 'other').trim();
      const permitNumber = body.permit_number ? String(body.permit_number).trim() : null;
      const issueDate = body.issue_date || null;
      const finalDate = body.final_date || null;
      const jobValue = body.job_value != null && !isNaN(Number(body.job_value)) ? Math.round(Number(body.job_value)) : null;
      const status = body.status || (finalDate ? 'completed' : 'issued');
      const description = body.description ? String(body.description).trim() : null;
      const source = body.source || 'manual';

      try {
        const rows = await sql`
          INSERT INTO property_permits (
            owner_email,
            property_id,
            county,
            folio,
            permit_number,
            permit_type,
            issue_date,
            final_date,
            job_value,
            status,
            description,
            source
          ) VALUES (
            ${user.email},
            ${propertyId},
            ${county},
            ${folio},
            ${permitNumber},
            ${permitType},
            ${issueDate},
            ${finalDate},
            ${jobValue},
            ${status},
            ${description},
            ${source}
          )
          RETURNING *;
        `;

        return res.status(201).json({ permit: rows[0] });
      } catch (err) {
        if (err?.code === '42P01') {
          // Friendly message via sendSafeApiError
          return sendSafeApiError(res, err, 'Permits table requires migration');
        }
        return sendSafeApiError(res, err, 'Error creating permit');
      }
    }

    // DELETE /api/investor/permits?id=...
    if (req.method === 'DELETE') {
      const permitId = req.query?.id ? String(req.query.id).trim() : null;
      if (!permitId) {
        return res.status(400).json({ error: 'Permit id is required.' });
      }

      try {
        await sql`
          DELETE FROM property_permits
          WHERE id = ${permitId}::uuid AND owner_email = ${user.email};
        `;
        return res.status(200).json({ success: true });
      } catch (err) {
        return sendSafeApiError(res, err, 'Error deleting permit');
      }
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    return sendSafeApiError(res, err, 'Permits handler error');
  }
}
