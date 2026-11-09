import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const cleanEmail = (user.email || '').trim().toLowerCase();
    const sql = getDb();

    let body = {};
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    }

    // =========================================================================
    // 1. GET: List trades & vendors with "Assigned to N items" count
    // =========================================================================
    if (req.method === 'GET') {
      let rows = [];
      try {
        // Count items linked by trade_id
        rows = await sql`
          SELECT 
            t.*,
            COALESCE(count(i.id), 0)::int AS items_count
          FROM design_trades t
          LEFT JOIN design_items i ON i.trade_id = t.id
          WHERE lower(t.owner_email) = ${cleanEmail}
          GROUP BY t.id
          ORDER BY t.company ASC;
        `;
      } catch (tradeColErr) {
        // Fallback without trade_id on design_items if migration not yet applied
        console.warn('Query with design_items.trade_id failed, falling back:', tradeColErr.message);
        const baseTrades = await sql`
          SELECT * FROM design_trades
          WHERE lower(owner_email) = ${cleanEmail}
          ORDER BY company ASC;
        `;
        rows = baseTrades.map(t => ({
          ...t,
          items_count: 0
        }));
      }

      return res.status(200).json({ trades: rows });
    }

    // =========================================================================
    // 2. POST: Create a new trade or vendor contact
    // =========================================================================
    if (req.method === 'POST') {
      const {
        role,
        company,
        contact_name,
        phone,
        email,
        license_no,
        insurance_expires,
        notes
      } = body;

      if (!company || !String(company).trim()) {
        return res.status(400).json({ error: 'Company or trade name is required' });
      }

      const cleanRole = role ? String(role).trim() : 'Other';
      const cleanCompany = String(company).trim();
      const cleanContact = contact_name ? String(contact_name).trim() : null;
      const cleanPhone = phone ? String(phone).trim() : null;
      const cleanTradeEmail = email ? String(email).trim() : null;
      const cleanLicense = license_no ? String(license_no).trim() : null;
      const cleanInsurance = insurance_expires ? String(insurance_expires).substring(0, 10) : null;
      const cleanNotes = notes ? String(notes).trim() : null;

      const inserted = await sql`
        INSERT INTO design_trades (
          owner_email,
          role,
          company,
          contact_name,
          phone,
          email,
          license_no,
          insurance_expires,
          notes
        ) VALUES (
          ${cleanEmail},
          ${cleanRole},
          ${cleanCompany},
          ${cleanContact},
          ${cleanPhone},
          ${cleanTradeEmail},
          ${cleanLicense},
          ${cleanInsurance},
          ${cleanNotes}
        )
        RETURNING *;
      `;

      return res.status(201).json({
        trade: {
          ...inserted[0],
          items_count: 0
        }
      });
    }

    // =========================================================================
    // 3. PUT: Update an existing trade or vendor
    // =========================================================================
    if (req.method === 'PUT') {
      const id = req.query?.id || body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Trade id is required' });
      }

      const check = await sql`
        SELECT * FROM design_trades
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (check.length === 0) {
        return res.status(404).json({ error: 'Trade contact not found' });
      }
      const existing = check[0];

      const {
        role,
        company,
        contact_name,
        phone,
        email,
        license_no,
        insurance_expires,
        notes
      } = body;

      const cleanRole = role !== undefined ? (role ? String(role).trim() : 'Other') : existing.role;
      const cleanCompany = company !== undefined ? String(company).trim() : existing.company;
      const cleanContact = contact_name !== undefined ? (contact_name ? String(contact_name).trim() : null) : existing.contact_name;
      const cleanPhone = phone !== undefined ? (phone ? String(phone).trim() : null) : existing.phone;
      const cleanTradeEmail = email !== undefined ? (email ? String(email).trim() : null) : existing.email;
      const cleanLicense = license_no !== undefined ? (license_no ? String(license_no).trim() : null) : existing.license_no;
      const cleanInsurance = insurance_expires !== undefined
        ? (insurance_expires ? String(insurance_expires).substring(0, 10) : null)
        : (existing.insurance_expires ? String(existing.insurance_expires).substring(0, 10) : null);
      const cleanNotes = notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes;

      const updated = await sql`
        UPDATE design_trades SET
          role = ${cleanRole},
          company = ${cleanCompany},
          contact_name = ${cleanContact},
          phone = ${cleanPhone},
          email = ${cleanTradeEmail},
          license_no = ${cleanLicense},
          insurance_expires = ${cleanInsurance},
          notes = ${cleanNotes},
          updated_at = now()
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING *;
      `;

      // Get current items count
      let itemsCount = 0;
      try {
        const countRes = await sql`
          SELECT count(*)::int AS count FROM design_items WHERE trade_id = ${id};
        `;
        itemsCount = countRes[0]?.count || 0;
      } catch {
        itemsCount = 0;
      }

      return res.status(200).json({
        trade: {
          ...updated[0],
          items_count: itemsCount
        }
      });
    }

    // =========================================================================
    // 4. DELETE: Delete trade or vendor contact
    // =========================================================================
    if (req.method === 'DELETE') {
      const id = req.query?.id || body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Trade id is required' });
      }

      const check = await sql`
        SELECT id FROM design_trades
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (check.length === 0) {
        return res.status(404).json({ error: 'Trade contact not found' });
      }

      // Unlink from items if trade_id exists
      try {
        await sql`
          UPDATE design_items
          SET trade_id = NULL
          WHERE trade_id = ${id};
        `;
      } catch (unlinkErr) {
        console.warn('Could not unlink design_items.trade_id:', unlinkErr.message);
      }

      await sql`
        DELETE FROM design_trades
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail};
      `;

      return res.status(200).json({ success: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/designer/trades error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
