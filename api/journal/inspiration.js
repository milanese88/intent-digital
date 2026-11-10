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
    // 1. GET: Fetch today's inspiration image OR list all for library manager
    // =========================================================================
    if (req.method === 'GET') {
      const { mode, action, current_id } = req.query || {};

      // TODAY'S INSPIRATION MODE
      if (mode === 'today') {
        // If clicking "NEW IMAGE" button, pick a different active image
        if (action === 'next') {
          let rows;
          if (current_id) {
            rows = await sql`
              SELECT * FROM inspiration_images
              WHERE lower(owner_email) = ${cleanEmail}
                AND active = true
                AND id != ${current_id}
              ORDER BY last_shown ASC NULLS FIRST, random()
              LIMIT 1
            `;
          }
          if (!rows || rows.length === 0) {
            rows = await sql`
              SELECT * FROM inspiration_images
              WHERE lower(owner_email) = ${cleanEmail}
                AND active = true
              ORDER BY random()
              LIMIT 1
            `;
          }

          if (rows.length > 0) {
            const selected = rows[0];
            await sql`
              UPDATE inspiration_images 
              SET last_shown = CURRENT_DATE 
              WHERE id = ${selected.id}
            `;
            return res.status(200).json({ image: selected });
          }
          return res.status(200).json({ image: null });
        }

        // Default Today: Check if an image was already shown today
        let todayRows = await sql`
          SELECT * FROM inspiration_images
          WHERE lower(owner_email) = ${cleanEmail}
            AND active = true
            AND last_shown = CURRENT_DATE
          LIMIT 1
        `;

        if (todayRows.length > 0) {
          return res.status(200).json({ image: todayRows[0] });
        }

        // If none shown today, pick least recently shown (least recently shown first)
        const candidates = await sql`
          SELECT * FROM inspiration_images
          WHERE lower(owner_email) = ${cleanEmail}
            AND active = true
          ORDER BY last_shown ASC NULLS FIRST, created_at ASC
          LIMIT 1
        `;

        if (candidates.length > 0) {
          const selected = candidates[0];
          await sql`
            UPDATE inspiration_images 
            SET last_shown = CURRENT_DATE 
            WHERE id = ${selected.id}
          `;
          return res.status(200).json({ image: selected });
        }

        return res.status(200).json({ image: null });
      }

      // LIBRARY MANAGER MODE: Return all images
      const images = await sql`
        SELECT * FROM inspiration_images
        WHERE lower(owner_email) = ${cleanEmail}
        ORDER BY created_at DESC
      `;
      return res.status(200).json({ images });
    }

    // =========================================================================
    // 2. POST: Save to mood board OR create new inspiration image
    // =========================================================================
    if (req.method === 'POST') {
      const { action } = req.body || {};

      // SUB-ACTION: SAVE TO MOOD BOARD (pick project + room -> adds to design_room_images)
      if (action === 'save_to_moodboard') {
        const { room_id, image_url, caption } = req.body || {};
        if (!room_id || !image_url) {
          return res.status(400).json({ error: 'room_id and image_url are required' });
        }

        // Verify room belongs to owner
        const rooms = await sql`
          SELECT r.id, r.name, p.name as project_name 
          FROM design_rooms r
          JOIN design_projects p ON p.id = r.project_id
          WHERE r.id = ${room_id} AND lower(r.owner_email) = ${cleanEmail}
          LIMIT 1
        `;
        if (rooms.length === 0) {
          return res.status(404).json({ error: 'Room not found or unauthorized' });
        }

        const roomImage = await sql`
          INSERT INTO design_room_images (
            room_id,
            owner_email,
            blob_url,
            kind,
            caption
          ) VALUES (
            ${room_id},
            ${cleanEmail},
            ${image_url},
            'mood',
            ${caption || null}
          )
          RETURNING *
        `;

        return res.status(201).json({ 
          success: true, 
          room_image: roomImage[0],
          room_name: rooms[0].name,
          project_name: rooms[0].project_name
        });
      }

      // CREATE NEW INSPIRATION IMAGE
      const { url, title, credit, alt, notice, try_it, palette, active } = req.body || {};
      if (!url || !alt || !notice || !try_it) {
        return res.status(400).json({ error: 'url, alt, notice, and try_it are required' });
      }

      const rows = await sql`
        INSERT INTO inspiration_images (
          owner_email,
          url,
          title,
          credit,
          alt,
          notice,
          try_it,
          palette,
          source,
          active
        ) VALUES (
          ${cleanEmail},
          ${url},
          ${title || null},
          ${credit || null},
          ${alt},
          ${notice},
          ${try_it},
          ${JSON.stringify(palette || [])},
          'upload',
          ${active !== false}
        )
        RETURNING *
      `;

      return res.status(201).json({ image: rows[0] });
    }

    // =========================================================================
    // 3. PUT: Update an inspiration image (edit notice, try-it, alt, toggle active)
    // =========================================================================
    if (req.method === 'PUT') {
      const { id, title, credit, alt, notice, try_it, palette, active } = req.body || {};
      if (!id) {
        return res.status(400).json({ error: 'Image ID is required' });
      }

      const existing = await sql`
        SELECT * FROM inspiration_images 
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Image not found' });
      }

      const rows = await sql`
        UPDATE inspiration_images SET
          title = ${title !== undefined ? title : existing[0].title},
          credit = ${credit !== undefined ? credit : existing[0].credit},
          alt = ${alt !== undefined ? alt : existing[0].alt},
          notice = ${notice !== undefined ? notice : existing[0].notice},
          try_it = ${try_it !== undefined ? try_it : existing[0].try_it},
          palette = ${palette !== undefined ? JSON.stringify(palette) : JSON.stringify(existing[0].palette)},
          active = ${active !== undefined ? Boolean(active) : existing[0].active}
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING *
      `;

      return res.status(200).json({ image: rows[0] });
    }

    // =========================================================================
    // 4. DELETE: Remove an inspiration image
    // =========================================================================
    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Image ID is required' });
      }

      const existing = await sql`
        SELECT * FROM inspiration_images 
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Image not found' });
      }

      // If uploaded to blob, delete from blob storage
      const url = existing[0].url;
      if (url && url.includes('public.blob.vercel-storage.com')) {
        try {
          await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (e) {
          console.warn('Failed to delete image blob:', e.message);
        }
      }

      await sql`
        DELETE FROM inspiration_images
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
      `;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Error in /api/journal/inspiration:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
