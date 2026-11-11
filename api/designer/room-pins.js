import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import { parsePinterestPinUrl } from '../../src/utils/pinterest.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // =========================================================================
    // GET: List pins for a specific room
    // =========================================================================
    if (req.method === 'GET') {
      const roomId = req.query?.room_id;
      if (!roomId) {
        return res.status(400).json({ error: 'room_id is required' });
      }

      try {
        const rows = await sql`
          SELECT id, room_id, owner_email, pin_url, pin_id, note, created_at
          FROM room_pins
          WHERE room_id = ${roomId} AND lower(owner_email) = ${cleanEmail}
          ORDER BY created_at ASC;
        `;
        return res.status(200).json({ pins: rows });
      } catch (dbErr) {
        if (dbErr.message && (dbErr.message.includes('relation "room_pins" does not exist') || dbErr.code === '42P01')) {
          return res.status(200).json({ pins: [], migrationPending: true });
        }
        throw dbErr;
      }
    }

    // =========================================================================
    // POST: Add a new pin to a room mood board
    // =========================================================================
    if (req.method === 'POST') {
      const body = req.body || {};
      const roomId = body.room_id;
      const rawUrl = (body.pin_url || '').trim();
      const note = body.note != null && String(body.note).trim() !== '' ? String(body.note).trim() : null;

      if (!roomId) {
        return res.status(400).json({ error: 'room_id is required' });
      }

      const parsed = parsePinterestPinUrl(rawUrl);
      if (!parsed || !parsed.valid) {
        return res.status(400).json({
          error: 'Please enter a valid Pinterest pin URL (e.g. pinterest.com/pin/<id>/ or pin.it short link).'
        });
      }

      // Verify room ownership
      const roomCheck = await sql`
        SELECT id FROM design_rooms
        WHERE id = ${roomId} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (roomCheck.length === 0) {
        return res.status(404).json({ error: 'Room not found or unauthorized' });
      }

      const inserted = await sql`
        INSERT INTO room_pins (
          room_id,
          owner_email,
          pin_url,
          pin_id,
          note
        ) VALUES (
          ${roomId},
          ${cleanEmail},
          ${parsed.pin_url},
          ${parsed.pin_id},
          ${note}
        )
        RETURNING *;
      `;

      return res.status(201).json({ success: true, pin: inserted[0] });
    }

    // =========================================================================
    // DELETE: Remove a pin from a room
    // =========================================================================
    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Pin id is required' });
      }

      const deleted = await sql`
        DELETE FROM room_pins
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING id;
      `;

      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Pin not found or unauthorized' });
      }

      return res.status(200).json({ success: true, id: deleted[0].id });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Error in /api/designer/room-pins:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
