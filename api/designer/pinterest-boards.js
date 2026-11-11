import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import { isValidPinterestBoardUrl, normalizePinterestBoardUrl, deriveBoardTitleFromUrl } from '../../src/utils/pinterest.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // =========================================================================
    // GET: List all Pinterest boards for user
    // =========================================================================
    if (req.method === 'GET') {
      try {
        const rows = await sql`
          SELECT id, owner_email, board_url, title, sort_order, created_at
          FROM pinterest_boards
          WHERE lower(owner_email) = ${cleanEmail}
          ORDER BY sort_order ASC, created_at DESC;
        `;
        return res.status(200).json({ boards: rows });
      } catch (dbErr) {
        // Table might not exist yet before migration is applied
        if (dbErr.message && (dbErr.message.includes('relation "pinterest_boards" does not exist') || dbErr.code === '42P01')) {
          return res.status(200).json({ boards: [], migrationPending: true });
        }
        throw dbErr;
      }
    }

    // =========================================================================
    // POST: Add a new Pinterest board
    // =========================================================================
    if (req.method === 'POST') {
      const body = req.body || {};
      const rawUrl = (body.board_url || '').trim();

      if (!isValidPinterestBoardUrl(rawUrl)) {
        return res.status(400).json({
          error: 'Please enter a valid Pinterest board URL (e.g. pinterest.com/<user>/<board>/ or pin.it short link).'
        });
      }

      const boardUrl = normalizePinterestBoardUrl(rawUrl);
      const title = (body.title || '').trim() || deriveBoardTitleFromUrl(boardUrl);

      // Get highest sort_order
      const maxOrderRow = await sql`
        SELECT COALESCE(MAX(sort_order), -1) AS max_order
        FROM pinterest_boards
        WHERE lower(owner_email) = ${cleanEmail};
      `;
      const nextOrder = Number(maxOrderRow[0]?.max_order ?? -1) + 1;

      const inserted = await sql`
        INSERT INTO pinterest_boards (
          owner_email,
          board_url,
          title,
          sort_order
        ) VALUES (
          ${cleanEmail},
          ${boardUrl},
          ${title},
          ${nextOrder}
        )
        RETURNING *;
      `;

      return res.status(201).json({ success: true, board: inserted[0] });
    }

    // =========================================================================
    // PUT: Reorder boards
    // =========================================================================
    if (req.method === 'PUT') {
      const body = req.body || {};
      const { reorderedIds } = body;

      if (Array.isArray(reorderedIds) && reorderedIds.length > 0) {
        for (let i = 0; i < reorderedIds.length; i++) {
          await sql`
            UPDATE pinterest_boards
            SET sort_order = ${i}
            WHERE id = ${reorderedIds[i]} AND lower(owner_email) = ${cleanEmail};
          `;
        }
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'reorderedIds array required' });
    }

    // =========================================================================
    // DELETE: Remove a Pinterest board
    // =========================================================================
    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Board id required' });
      }

      const deleted = await sql`
        DELETE FROM pinterest_boards
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING id;
      `;

      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Board not found or unauthorized' });
      }

      return res.status(200).json({ success: true, id: deleted[0].id });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Error in /api/designer/pinterest-boards:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
