import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import { del } from '@vercel/blob';

const ALLOWED_ROOM_TYPES = [
  'kitchen',
  'bathroom',
  'living',
  'bedroom',
  'dining',
  'exterior',
  'outdoor',
  'office',
  'laundry',
  'other'
];

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // =========================================================================
    // GET: List all rooms for a project
    // =========================================================================
    if (req.method === 'GET') {
      const { project_id } = req.query || {};
      if (!project_id) {
        return res.status(400).json({ error: 'project_id is required' });
      }

      // Verify project ownership
      const projCheck = await sql`
        SELECT id FROM design_projects
        WHERE id = ${project_id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (projCheck.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const rooms = await sql`
        SELECT 
          r.id,
          r.project_id,
          r.owner_email,
          r.room_type,
          r.name,
          r.style,
          r.brief,
          r.palette,
          r.sort_order,
          r.created_at,
          COALESCE(SUM(i.total), 0) AS total_item_cost,
          COUNT(DISTINCT i.id) AS item_count,
          COUNT(DISTINCT img.id) AS image_count
        FROM design_rooms r
        LEFT JOIN design_items i ON i.room_id = r.id
        LEFT JOIN design_room_images img ON img.room_id = r.id
        WHERE r.project_id = ${project_id} AND lower(r.owner_email) = ${cleanEmail}
        GROUP BY r.id
        ORDER BY r.sort_order ASC, r.created_at ASC;
      `;

      return res.status(200).json({
        rooms: rooms.map(r => ({
          ...r,
          total_item_cost: Number(r.total_item_cost || 0),
          item_count: Number(r.item_count || 0),
          image_count: Number(r.image_count || 0)
        }))
      });
    }

    // =========================================================================
    // POST: Create a room
    // =========================================================================
    if (req.method === 'POST') {
      const body = req.body || {};
      const { project_id, name, room_type, style, brief, palette } = body;

      if (!project_id) {
        return res.status(400).json({ error: 'project_id is required' });
      }
      const cleanName = String(name || '').trim();
      if (!cleanName) {
        return res.status(400).json({ error: 'Room name is required' });
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

      let cleanRoomType = String(room_type || 'other').trim().toLowerCase();
      if (!ALLOWED_ROOM_TYPES.includes(cleanRoomType)) {
        cleanRoomType = 'other';
      }

      // Next sort order
      const orderRes = await sql`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
        FROM design_rooms
        WHERE project_id = ${project_id};
      `;
      const nextOrder = Number(orderRes[0]?.next_order || 0);

      const inserted = await sql`
        INSERT INTO design_rooms (
          project_id,
          owner_email,
          name,
          room_type,
          style,
          brief,
          palette,
          sort_order
        ) VALUES (
          ${project_id},
          ${cleanEmail},
          ${cleanName},
          ${cleanRoomType},
          ${style ? String(style).trim() : null},
          ${brief ? String(brief).trim() : null},
          ${JSON.stringify(palette || [])},
          ${nextOrder}
        )
        RETURNING *;
      `;

      return res.status(201).json({
        room: {
          ...inserted[0],
          total_item_cost: 0,
          item_count: 0,
          image_count: 0
        }
      });
    }

    // =========================================================================
    // PUT: Update a room
    // =========================================================================
    if (req.method === 'PUT') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Room id is required' });
      }

      const roomCheck = await sql`
        SELECT id FROM design_rooms
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (roomCheck.length === 0) {
        return res.status(404).json({ error: 'Room not found' });
      }

      const body = req.body || {};
      const { name, room_type, style, brief, palette, sort_order } = body;

      let cleanRoomType = room_type ? String(room_type).trim().toLowerCase() : null;
      if (cleanRoomType && !ALLOWED_ROOM_TYPES.includes(cleanRoomType)) {
        cleanRoomType = 'other';
      }

      const updated = await sql`
        UPDATE design_rooms SET
          name = COALESCE(${name !== undefined ? String(name).trim() : null}, name),
          room_type = COALESCE(${cleanRoomType}, room_type),
          style = ${style !== undefined ? (style ? String(style).trim() : null) : sql`style`},
          brief = ${brief !== undefined ? (brief ? String(brief).trim() : null) : sql`brief`},
          palette = ${palette !== undefined ? JSON.stringify(palette) : sql`palette`},
          sort_order = COALESCE(${sort_order !== undefined ? Number(sort_order) : null}, sort_order)
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING *;
      `;

      return res.status(200).json({ room: updated[0] });
    }

    // =========================================================================
    // PATCH: Reorder rooms
    // =========================================================================
    if (req.method === 'PATCH') {
      const body = req.body || {};
      const { project_id, room_ids } = body;

      if (!project_id || !Array.isArray(room_ids)) {
        return res.status(400).json({ error: 'project_id and room_ids array are required' });
      }

      // Verify project ownership
      const projCheck = await sql`
        SELECT id FROM design_projects
        WHERE id = ${project_id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (projCheck.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      for (let i = 0; i < room_ids.length; i++) {
        await sql`
          UPDATE design_rooms
          SET sort_order = ${i}
          WHERE id = ${room_ids[i]} AND project_id = ${project_id} AND lower(owner_email) = ${cleanEmail};
        `;
      }

      return res.status(200).json({ success: true });
    }

    // =========================================================================
    // DELETE: Delete a room and its photos
    // =========================================================================
    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Room id is required' });
      }

      const roomCheck = await sql`
        SELECT id FROM design_rooms
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (roomCheck.length === 0) {
        return res.status(404).json({ error: 'Room not found' });
      }

      // 1. Delete all images from Vercel Blob
      try {
        const images = await sql`
          SELECT blob_url FROM design_room_images
          WHERE room_id = ${id} AND lower(owner_email) = ${cleanEmail};
        `;
        if (process.env.BLOB_READ_WRITE_TOKEN) {
          for (const img of images) {
            if (img.blob_url) {
              try {
                await del(img.blob_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
              } catch (blobErr) {
                console.warn('Vercel Blob deletion warning:', blobErr.message);
              }
            }
          }
        }
      } catch (imgQueryErr) {
        console.warn('Could not query design_room_images before deleting room:', imgQueryErr.message);
      }

      // 2. Delete pins and room from DB
      try {
        await sql`
          DELETE FROM room_pins
          WHERE room_id = ${id} AND lower(owner_email) = ${cleanEmail};
        `;
      } catch (pinErr) {
        // Safe if table not yet migrated
      }

      await sql`
        DELETE FROM design_rooms
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail};
      `;

      return res.status(200).json({ success: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/designer/rooms error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
