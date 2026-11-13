import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

const ALLOWED_STRATEGIES = ['rental', 'flip', 'brrrr', 'live_in'];

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // GET: List saved analyses for a property (newest first)
    if (req.method === 'GET') {
      const propertyId = req.query?.property_id;
      if (!propertyId) {
        return res.status(400).json({ error: 'property_id is required.' });
      }

      // Confirm property belongs to logged-in user
      const prop = await sql`
        SELECT id FROM investor_properties
        WHERE id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (prop.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      const rows = await sql`
        SELECT
          id,
          owner_email,
          property_id,
          strategy,
          inputs,
          results,
          created_at
        FROM investor_analyses
        WHERE property_id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
        ORDER BY created_at DESC
      `;

      return res.status(200).json(rows);
    }

    // POST: Save a new analysis run
    if (req.method === 'POST') {
      const { property_id, strategy, inputs, results } = req.body || {};

      if (!property_id) {
        return res.status(400).json({ error: 'property_id is required.' });
      }

      const cleanStrategy = strategy ? String(strategy).trim().toLowerCase() : '';
      if (!ALLOWED_STRATEGIES.includes(cleanStrategy)) {
        return res.status(400).json({ error: `Strategy must be one of: ${ALLOWED_STRATEGIES.join(', ')}` });
      }

      // Confirm property belongs to logged-in user
      const prop = await sql`
        SELECT id FROM investor_properties
        WHERE id = ${property_id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (prop.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      const safeInputs = typeof inputs === 'object' && inputs !== null ? inputs : {};
      const safeResults = typeof results === 'object' && results !== null ? results : {};

      const rows = await sql`
        INSERT INTO investor_analyses (
          owner_email,
          property_id,
          strategy,
          inputs,
          results
        ) VALUES (
          ${cleanEmail},
          ${property_id},
          ${cleanStrategy},
          ${JSON.stringify(safeInputs)}::jsonb,
          ${JSON.stringify(safeResults)}::jsonb
        )
        RETURNING id, owner_email, property_id, strategy, inputs, results, created_at
      `;

      return res.status(200).json(rows[0]);
    }

    // DELETE: Remove an analysis by id
    if (req.method === 'DELETE') {
      const id = req.body?.id || req.query?.id;
      if (!id) {
        return res.status(400).json({ error: 'Analysis ID is required.' });
      }

      // Verify analysis exists and belongs to user
      const existing = await sql`
        SELECT id, property_id
        FROM investor_analyses
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Analysis not found.' });
      }

      // Confirm parent property belongs to user
      const prop = await sql`
        SELECT id FROM investor_properties
        WHERE id = ${existing[0].property_id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (prop.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      const rows = await sql`
        DELETE FROM investor_analyses
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING id
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Analysis not found.' });
      }

      return res.status(200).json({ success: true, id: rows[0].id });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    if (error?.code === '23514') {
      return res.status(409).json({
        error: 'The database migration "add_live_in_fha_strategy.sql" has not been applied yet. Please apply the SQL migration first.'
      });
    }
    console.error('Investor Analyses API Error:', error);
    return res.status(500).json({ error: error.message || 'Server error processing analysis request.' });
  }
}
