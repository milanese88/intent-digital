import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import { del } from '@vercel/blob';

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
          total: Number(i.total != null ? i.total : ((Number(i.qty || 1)) * (Number(i.unit_cost || 0)))),
          paid: Number(i.paid != null ? i.paid : 0),
          due_date: i.due_date ? String(i.due_date).substring(0, 10) : null,
          invoice_url: i.invoice_url || null
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
        link_url,
        paid = 0,
        due_date = null,
        invoice_url = null,
        product_id = null,
        trade_id = null
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
      const numPaid = Number(paid) || 0;
      const cleanDueDate = due_date ? String(due_date).substring(0, 10) : null;
      const cleanInvoiceUrl = invoice_url ? String(invoice_url).trim() : null;

      const cleanProductId = product_id || null;
      const cleanTradeId = trade_id || null;

      let insertedRow;
      try {
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
            link_url,
            paid,
            due_date,
            invoice_url,
            product_id,
            trade_id
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
            ${link_url ? String(link_url).trim() : null},
            ${numPaid},
            ${cleanDueDate},
            ${cleanInvoiceUrl},
            ${cleanProductId},
            ${cleanTradeId}
          )
          RETURNING *;
        `;
        insertedRow = inserted[0];
      } catch (insertErr) {
        // Fallback without trade_id if migration pending
        console.warn('Insert with trade_id failed, falling back:', insertErr.message);
        try {
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
              link_url,
              paid,
              due_date,
              invoice_url,
              product_id
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
              ${link_url ? String(link_url).trim() : null},
              ${numPaid},
              ${cleanDueDate},
              ${cleanInvoiceUrl},
              ${cleanProductId}
            )
            RETURNING *;
          `;
          insertedRow = { ...inserted[0], trade_id: cleanTradeId };
        } catch (innerErr) {
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
          insertedRow = {
            ...inserted[0],
            paid: numPaid,
            due_date: cleanDueDate,
            invoice_url: cleanInvoiceUrl,
            product_id: cleanProductId,
            trade_id: cleanTradeId
          };
        }
      }

      return res.status(201).json({
        item: {
          ...insertedRow,
          qty: Number(insertedRow.qty || 1),
          unit_cost: Number(insertedRow.unit_cost || 0),
          total: Number(insertedRow.total || numTotal),
          paid: Number(insertedRow.paid != null ? insertedRow.paid : numPaid),
          due_date: insertedRow.due_date ? String(insertedRow.due_date).substring(0, 10) : cleanDueDate,
          invoice_url: insertedRow.invoice_url || cleanInvoiceUrl
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
        link_url,
        paid,
        due_date,
        invoice_url,
        product_id,
        trade_id
      } = body;

      const cleanName = name !== undefined ? String(name).trim() : existing.name;
      const cleanQty = qty !== undefined ? (Number(qty) || 1) : Number(existing.qty || 1);
      const cleanUnitCost = unit_cost !== undefined ? (Number(unit_cost) || 0) : Number(existing.unit_cost || 0);
      const newTotal = cleanQty * cleanUnitCost;
      const cleanPaid = paid !== undefined ? (Number(paid) || 0) : Number(existing.paid != null ? existing.paid : 0);
      const cleanDueDate = due_date !== undefined ? (due_date ? String(due_date).substring(0, 10) : null) : (existing.due_date ? String(existing.due_date).substring(0, 10) : null);
      const cleanInvoiceUrl = invoice_url !== undefined ? (invoice_url ? String(invoice_url).trim() : null) : (existing.invoice_url || null);

      const cleanProductId = product_id !== undefined ? (product_id || null) : existing.product_id;
      const cleanTradeId = trade_id !== undefined ? (trade_id || null) : existing.trade_id;

      // If invoice_url is being replaced or removed, delete previous blob from storage
      if (existing.invoice_url && cleanInvoiceUrl !== existing.invoice_url && String(existing.invoice_url).includes('public.blob.vercel-storage.com')) {
        try {
          await del(existing.invoice_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (delErr) {
          console.warn('Failed to delete previous invoice blob on item update:', delErr.message);
        }
      }

      let updatedRow;
      try {
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
            paid = ${cleanPaid},
            due_date = ${cleanDueDate},
            invoice_url = ${cleanInvoiceUrl},
            product_id = ${cleanProductId},
            trade_id = ${cleanTradeId},
            updated_at = now()
          WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
          RETURNING *;
        `;
        updatedRow = updated[0];
      } catch (updateErr) {
        console.warn('Update with trade_id failed, falling back:', updateErr.message);
        try {
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
              paid = ${cleanPaid},
              due_date = ${cleanDueDate},
              invoice_url = ${cleanInvoiceUrl},
              product_id = ${cleanProductId},
              updated_at = now()
            WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
            RETURNING *;
          `;
          updatedRow = { ...updated[0], trade_id: cleanTradeId };
        } catch (innerErr) {
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
          updatedRow = {
            ...updated[0],
            paid: cleanPaid,
            due_date: cleanDueDate,
            invoice_url: cleanInvoiceUrl,
            product_id: cleanProductId,
            trade_id: cleanTradeId
          };
        }
      }

      return res.status(200).json({
        item: {
          ...updatedRow,
          qty: Number(updatedRow.qty || 1),
          unit_cost: Number(updatedRow.unit_cost || 0),
          total: Number(updatedRow.total || newTotal),
          paid: Number(updatedRow.paid != null ? updatedRow.paid : cleanPaid),
          due_date: updatedRow.due_date ? String(updatedRow.due_date).substring(0, 10) : cleanDueDate,
          invoice_url: updatedRow.invoice_url || cleanInvoiceUrl
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
        SELECT id, invoice_url FROM design_items
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (itemCheck.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // If item had an invoice stored in Vercel Blob, delete it
      if (itemCheck[0].invoice_url && String(itemCheck[0].invoice_url).includes('public.blob.vercel-storage.com')) {
        try {
          await del(itemCheck[0].invoice_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (delErr) {
          console.warn('Failed to delete item invoice blob:', delErr.message);
        }
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
