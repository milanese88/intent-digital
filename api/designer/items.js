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

    // =========================================================================
    // 1. GET: Fetch items by project_id or room_id
    // =========================================================================
    if (req.method === 'GET') {
      const { project_id, room_id } = req.query || {};
      if (!project_id && !room_id) {
        return res.status(400).json({ error: 'project_id or room_id is required' });
      }

      let rows = [];
      if (room_id) {
        // Verify room belongs to user
        const roomCheck = await sql`
          SELECT id FROM design_rooms
          WHERE id = ${room_id} AND lower(owner_email) = ${cleanEmail}
          LIMIT 1;
        `;
        if (roomCheck.length === 0) {
          return res.status(404).json({ error: 'Room not found' });
        }

        rows = await sql`
          SELECT * FROM design_items
          WHERE room_id = ${room_id} AND lower(owner_email) = ${cleanEmail}
          ORDER BY created_at ASC;
        `;
      } else {
        // Verify project belongs to user
        const projCheck = await sql`
          SELECT id FROM design_projects
          WHERE id = ${project_id} AND lower(owner_email) = ${cleanEmail}
          LIMIT 1;
        `;
        if (projCheck.length === 0) {
          return res.status(404).json({ error: 'Project not found' });
        }

        rows = await sql`
          SELECT * FROM design_items
          WHERE project_id = ${project_id} AND lower(owner_email) = ${cleanEmail}
          ORDER BY created_at ASC;
        `;
      }

      return res.status(200).json({
        items: rows.map(i => ({
          ...i,
          qty: Number(i.qty || 1),
          unit_cost: Number(i.unit_cost || 0),
          total: Number(i.total || ((Number(i.qty || 1)) * (Number(i.unit_cost || 0))))
        }))
      });
    }

    // =========================================================================
    // 2. POST: Create an item
    // =========================================================================
    if (req.method === 'POST') {
      const body = req.body || {};
      const {
        project_id,
        room_id,
        name,
        category,
        spec,
        vendor,
        qty = 1,
        unit_cost = 0,
        status = 'planned',
        notes,
        link_url
      } = body;

      if (!project_id) {
        return res.status(400).json({ error: 'project_id is required' });
      }
      const cleanName = String(name || '').trim();
      if (!cleanName) {
        return res.status(400).json({ error: 'Item name is required' });
      }

      // Verify project belongs to user
      const projCheck = await sql`
        SELECT id FROM design_projects
        WHERE id = ${project_id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (projCheck.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // If room_id provided, verify room belongs to user
      if (room_id) {
        const roomCheck = await sql`
          SELECT id FROM design_rooms
          WHERE id = ${room_id} AND project_id = ${project_id} AND lower(owner_email) = ${cleanEmail}
          LIMIT 1;
        `;
        if (roomCheck.length === 0) {
          return res.status(400).json({ error: 'Invalid room_id for this project' });
        }
      }

      const numQty = Number(qty) || 1;
      const numUnitCost = Number(unit_cost) || 0;
      const numTotal = numQty * numUnitCost;

      const inserted = await sql`
        INSERT INTO design_items (
          project_id,
          room_id,
          owner_email,
          name,
          category,
          spec,
          vendor,
          qty,
          unit_cost,
          total,
          status,
          notes,
          link_url
        ) VALUES (
          ${project_id},
          ${room_id || null},
          ${cleanEmail},
          ${cleanName},
          ${category ? String(category).trim() : null},
          ${spec ? String(spec).trim() : null},
          ${vendor ? String(vendor).trim() : null},
          ${numQty},
          ${numUnitCost},
          ${numTotal},
          ${status ? String(status).trim() : 'planned'},
          ${notes ? String(notes).trim() : null},
          ${link_url ? String(link_url).trim() : null}
        )
        RETURNING *;
      `;

      return res.status(201).json({
        item: {
          ...inserted[0],
          qty: Number(inserted[0].qty || 1),
          unit_cost: Number(inserted[0].unit_cost || 0),
          total: Number(inserted[0].total || numTotal)
        }
      });
    }

    // =========================================================================
    // 3. PUT: Update an item
    // =========================================================================
    if (req.method === 'PUT') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Item id is required' });
      }

      const itemCheck = await sql`
        SELECT * FROM design_items
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (itemCheck.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }
      const existing = itemCheck[0];

      const body = req.body || {};
      const {
        room_id,
        name,
        category,
        spec,
        vendor,
        qty,
        unit_cost,
        status,
        notes,
        link_url
      } = body;

      const cleanName = name !== undefined ? String(name).trim() : existing.name;
      const cleanQty = qty !== undefined ? (Number(qty) || 1) : Number(existing.qty || 1);
      const cleanUnitCost = unit_cost !== undefined ? (Number(unit_cost) || 0) : Number(existing.unit_cost || 0);
      const newTotal = cleanQty * cleanUnitCost;

      const updated = await sql`
        UPDATE design_items SET
          room_id = ${room_id !== undefined ? (room_id || null) : existing.room_id},
          name = ${cleanName},
          category = ${category !== undefined ? (category ? String(category).trim() : null) : existing.category},
          spec = ${spec !== undefined ? (spec ? String(spec).trim() : null) : existing.spec},
          vendor = ${vendor !== undefined ? (vendor ? String(vendor).trim() : null) : existing.vendor},
          qty = ${cleanQty},
          unit_cost = ${cleanUnitCost},
          total = ${newTotal},
          status = ${status !== undefined ? String(status).trim() : existing.status},
          notes = ${notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes},
          link_url = ${link_url !== undefined ? (link_url ? String(link_url).trim() : null) : existing.link_url},
          updated_at = now()
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING *;
      `;

      return res.status(200).json({
        item: {
          ...updated[0],
          qty: Number(updated[0].qty || 1),
          unit_cost: Number(updated[0].unit_cost || 0),
          total: Number(updated[0].total || newTotal)
        }
      });
    }

    // =========================================================================
    // 4. DELETE: Delete an item
    // =========================================================================
    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Item id is required' });
      }

      const itemCheck = await sql`
        SELECT id FROM design_items
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (itemCheck.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      await sql`
        DELETE FROM design_items
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail};
      `;

      return res.status(200).json({ success: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/designer/items error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
