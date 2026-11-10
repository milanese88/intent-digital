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
    // 1. GET: Fetch latest note or all notes
    // =========================================================================
    if (req.method === 'GET') {
      const all = await sql`
        SELECT * FROM learning_notes
        WHERE lower(owner_email) = ${cleanEmail}
        ORDER BY created_at DESC
      `;
      return res.status(200).json({
        latestNote: all[0] || null,
        allNotes: all
      });
    }

    // =========================================================================
    // 2. POST: Create a new learning note
    // =========================================================================
    if (req.method === 'POST') {
      const { title, body, color_bar, link_url, link_label } = req.body || {};
      if (!title || !body) {
        return res.status(400).json({ error: 'Title and body are required' });
      }

      const rows = await sql`
        INSERT INTO learning_notes (
          owner_email,
          title,
          body,
          color_bar,
          link_url,
          link_label
        ) VALUES (
          ${cleanEmail},
          ${title},
          ${body},
          ${color_bar ? JSON.stringify(color_bar) : null},
          ${link_url || null},
          ${link_label || null}
        )
        RETURNING *
      `;

      return res.status(201).json({ note: rows[0] });
    }

    // =========================================================================
    // 3. PUT: Update a learning note
    // =========================================================================
    if (req.method === 'PUT') {
      const { id, title, body, color_bar, link_url, link_label } = req.body || {};
      if (!id) {
        return res.status(400).json({ error: 'Note ID is required' });
      }

      const existing = await sql`
        SELECT * FROM learning_notes 
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Note not found' });
      }

      const rows = await sql`
        UPDATE learning_notes SET
          title = ${title !== undefined ? title : existing[0].title},
          body = ${body !== undefined ? body : existing[0].body},
          color_bar = ${color_bar !== undefined ? (color_bar ? JSON.stringify(color_bar) : null) : existing[0].color_bar},
          link_url = ${link_url !== undefined ? link_url : existing[0].link_url},
          link_label = ${link_label !== undefined ? link_label : existing[0].link_label},
          updated_at = NOW()
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING *
      `;

      return res.status(200).json({ note: rows[0] });
    }

    // =========================================================================
    // 4. DELETE: Delete a learning note
    // =========================================================================
    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Note ID is required' });
      }

      await sql`
        DELETE FROM learning_notes
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
      `;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Error in /api/journal/learning-notes:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
