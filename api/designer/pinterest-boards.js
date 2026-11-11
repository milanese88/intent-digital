import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import {
  validateAndParsePinterestBoardUrl,
  resolvePinterestShortLink,
  deriveBoardTitleFromUrl
} from '../../src/utils/pinterest.js';

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
          SELECT id, owner_email, board_url, title, kind, sort_order, created_at
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
        // Column 'kind' might not exist yet on existing table before ALTER TABLE migration
        if (dbErr.message && (dbErr.message.includes('column "kind" does not exist') || dbErr.code === '42703')) {
          const fallbackRows = await sql`
            SELECT id, owner_email, board_url, title, sort_order, created_at
            FROM pinterest_boards
            WHERE lower(owner_email) = ${cleanEmail}
            ORDER BY sort_order ASC, created_at DESC;
          `;
          return res.status(200).json({
            boards: fallbackRows.map(r => {
              const parsed = validateAndParsePinterestBoardUrl(r.board_url);
              return {
                ...r,
                kind: parsed.valid ? parsed.kind : 'board'
              };
            })
          });
        }
        throw dbErr;
      }
    }

    // =========================================================================
    // POST: Add a new Pinterest board or section
    // =========================================================================
    if (req.method === 'POST') {
      const body = req.body || {};
      const rawUrl = (body.board_url || '').trim();

      const validation = validateAndParsePinterestBoardUrl(rawUrl);
      if (!validation.valid) {
        return res.status(400).json({
          error: validation.error || 'Please enter a valid Pinterest board URL.'
        });
      }

      let boardUrl = validation.normalizedUrl;
      let kind = validation.kind || 'board';

      // If it's a short link (pin.it), resolve it via Location header
      if (validation.isShortLink) {
        const resolved = await resolvePinterestShortLink(rawUrl);
        if (resolved) {
          const resolvedParsed = validateAndParsePinterestBoardUrl(resolved);
          if (!resolvedParsed.valid) {
            return res.status(400).json({
              error: resolvedParsed.error || 'Could not validate resolved Pinterest URL.'
            });
          }
          boardUrl = resolvedParsed.normalizedUrl;
          kind = resolvedParsed.kind || 'board';
        }
      }

      const title = (body.title || '').trim() || deriveBoardTitleFromUrl(boardUrl);

      // Get highest sort_order
      const maxOrderRow = await sql`
        SELECT COALESCE(MAX(sort_order), -1) AS max_order
        FROM pinterest_boards
        WHERE lower(owner_email) = ${cleanEmail};
      `;
      const nextOrder = Number(maxOrderRow[0]?.max_order ?? -1) + 1;

      try {
        const inserted = await sql`
          INSERT INTO pinterest_boards (
            owner_email,
            board_url,
            title,
            kind,
            sort_order
          ) VALUES (
            ${cleanEmail},
            ${boardUrl},
            ${title},
            ${kind},
            ${nextOrder}
          )
          RETURNING *;
        `;
        return res.status(201).json({ success: true, board: inserted[0] });
      } catch (insertErr) {
        // Fallback if 'kind' column has not been added via ALTER TABLE yet
        if (insertErr.code === '42703' || (insertErr.message && insertErr.message.includes('column "kind" does not exist'))) {
          const fallback = await sql`
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
          return res.status(201).json({ success: true, board: { ...fallback[0], kind } });
        }
        throw insertErr;
      }
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
