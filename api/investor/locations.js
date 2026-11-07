import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // GET: List all watched locations for the current user
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT 
          id,
          owner_email,
          name,
          city,
          zip,
          county,
          notes,
          created_at
        FROM investor_locations
        WHERE lower(owner_email) = ${cleanEmail}
        ORDER BY created_at ASC;
      `;
      return res.status(200).json(rows);
    }

    // POST: Add a new watched location
    if (req.method === 'POST') {
      const body = req.body || {};
      const rawZip = String(body.zip || '').trim();
      if (!/^\d{5}$/.test(rawZip)) {
        return res.status(400).json({ error: 'A valid 5-digit ZIP code is required.' });
      }

      const rawCounty = body.county ? String(body.county).trim() : 'Broward';
      const cleanCounty = /palm/i.test(rawCounty) ? 'Palm Beach' : 'Broward';

      const rawCity = body.city ? String(body.city).trim() : null;
      let cleanName = body.name ? String(body.name).trim() : '';
      if (!cleanName) {
        cleanName = rawCity ? `${rawCity} (${rawZip})` : `ZIP ${rawZip}`;
      }

      const cleanNotes = body.notes ? String(body.notes).trim() : null;

      // Check if already watching this ZIP
      const existing = await sql`
        SELECT * FROM investor_locations
        WHERE lower(owner_email) = ${cleanEmail}
          AND zip = ${rawZip}
          AND (county = ${cleanCounty} OR county IS NULL)
        LIMIT 1;
      `;

      if (existing.length > 0) {
        return res.status(200).json(existing[0]);
      }

      const inserted = await sql`
        INSERT INTO investor_locations (
          owner_email,
          name,
          city,
          zip,
          county,
          notes
        ) VALUES (
          ${cleanEmail},
          ${cleanName},
          ${rawCity},
          ${rawZip},
          ${cleanCounty},
          ${cleanNotes}
        )
        RETURNING *;
      `;

      return res.status(201).json(inserted[0]);
    }

    // DELETE: Remove a watched location
    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Location id is required.' });
      }

      const deleted = await sql`
        DELETE FROM investor_locations
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING id;
      `;

      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Location not found or unauthorized.' });
      }

      return res.status(200).json({ ok: true, id: deleted[0].id });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('Error in /api/investor/locations:', err);
    return res.status(500).json({ error: 'Failed to process watched location request' });
  }
}
