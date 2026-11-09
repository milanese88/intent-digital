import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import { put, del } from '@vercel/blob';
import crypto from 'crypto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGES_PER_ROOM = 60;

const ALLOWED_KINDS = ['mood', 'before', 'after', 'plan', 'render'];
const ALLOWED_SIZES = ['small', 'wide', 'large'];

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);

/**
 * Strips EXIF APP1 metadata (including GPS coordinates, device info) from JPEG buffers.
 */
function stripJpegExif(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
    return buffer;
  }
  const chunks = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF) break;
    const marker = buffer[offset + 1];
    // SOS (Start of Scan 0xDA) or EOI (End of Image 0xD9)
    if (marker === 0xDA || marker === 0xD9) {
      chunks.push(buffer.subarray(offset));
      break;
    }
    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
    // 0xE1 is APP1 (EXIF / GPS metadata)
    if (marker === 0xE1) {
      // Exclude APP1 segment
    } else {
      chunks.push(buffer.subarray(offset, offset + 2 + length));
    }
    offset += 2 + length;
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // =========================================================================
    // 1. GET: Fetch images for a room
    // =========================================================================
    if (req.method === 'GET') {
      const { room_id, kind } = req.query || {};
      if (!room_id) {
        return res.status(400).json({ error: 'room_id is required' });
      }

      // Verify room belongs to logged-in user
      const roomCheck = await sql`
        SELECT id FROM design_rooms
        WHERE id = ${room_id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (roomCheck.length === 0) {
        return res.status(404).json({ error: 'Room not found' });
      }

      let rows = [];
      // Try query with size column; if column doesn't exist yet, fall back seamlessly
      try {
        if (kind && ALLOWED_KINDS.includes(kind)) {
          rows = await sql`
            SELECT id, room_id, owner_email, blob_url, kind, caption, sort_order, size, created_at
            FROM design_room_images
            WHERE room_id = ${room_id} AND kind = ${kind} AND lower(owner_email) = ${cleanEmail}
            ORDER BY sort_order ASC, created_at ASC;
          `;
        } else {
          rows = await sql`
            SELECT id, room_id, owner_email, blob_url, kind, caption, sort_order, size, created_at
            FROM design_room_images
            WHERE room_id = ${room_id} AND lower(owner_email) = ${cleanEmail}
            ORDER BY sort_order ASC, created_at ASC;
          `;
        }
      } catch (_err) {
        // Fallback without size column
        if (kind && ALLOWED_KINDS.includes(kind)) {
          rows = await sql`
            SELECT id, room_id, owner_email, blob_url, kind, caption, sort_order, 'small' AS size, created_at
            FROM design_room_images
            WHERE room_id = ${room_id} AND kind = ${kind} AND lower(owner_email) = ${cleanEmail}
            ORDER BY sort_order ASC, created_at ASC;
          `;
        } else {
          rows = await sql`
            SELECT id, room_id, owner_email, blob_url, kind, caption, sort_order, 'small' AS size, created_at
            FROM design_room_images
            WHERE room_id = ${room_id} AND lower(owner_email) = ${cleanEmail}
            ORDER BY sort_order ASC, created_at ASC;
          `;
        }
      }

      return res.status(200).json({ images: rows.map(r => ({ ...r, size: r.size || 'small' })) });
    }

    // =========================================================================
    // 2. POST: Upload an image
    // =========================================================================
    if (req.method === 'POST') {
      const body = req.body || {};
      const { room_id, kind, filename, contentType, data, caption, size } = body;

      if (!room_id || !data) {
        return res.status(400).json({ error: 'room_id and photo data are required' });
      }

      // Verify room belongs to logged-in user
      const roomCheck = await sql`
        SELECT id FROM design_rooms
        WHERE id = ${room_id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (roomCheck.length === 0) {
        return res.status(404).json({ error: 'Room not found' });
      }

      let cleanKind = String(kind || 'mood').toLowerCase();
      if (!ALLOWED_KINDS.includes(cleanKind)) {
        cleanKind = 'mood';
      }

      let cleanSize = String(size || 'small').toLowerCase();
      if (!ALLOWED_SIZES.includes(cleanSize)) {
        cleanSize = 'small';
      }

      // Check room image count limit
      const countRes = await sql`
        SELECT count(*)::int AS count 
        FROM design_room_images 
        WHERE room_id = ${room_id};
      `;
      const currentCount = countRes[0]?.count || 0;
      if (currentCount >= MAX_IMAGES_PER_ROOM) {
        return res.status(400).json({
          error: `Maximum limit of ${MAX_IMAGES_PER_ROOM} images reached for this room.`
        });
      }

      // Decode base64
      const base64Data = data.includes(',') ? data.split(',')[1] : data;
      let buffer = Buffer.from(base64Data, 'base64');

      if (buffer.length > MAX_FILE_SIZE) {
        return res.status(400).json({ error: 'File size exceeds maximum 10 MB limit' });
      }

      const rawMime = String(contentType || 'image/jpeg').toLowerCase();
      const mime = rawMime.split(';')[0].trim();
      if (!ALLOWED_MIME_TYPES.has(mime) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(filename || '')) {
        return res.status(400).json({
          error: 'Unsupported file type. Only JPG, PNG, WebP, and HEIC files are accepted.'
        });
      }

      // Strip location metadata (EXIF GPS) if JPEG
      if (mime === 'image/jpeg' || mime === 'image/jpg') {
        buffer = stripJpegExif(buffer);
      }

      const randomSuffix = crypto.randomBytes(6).toString('hex');
      const safeFilename = (filename || 'image.jpg').replace(/[^a-zA-Z0-9.-]/g, '_');
      const pathname = `designer/rooms/${room_id}/${Date.now()}-${randomSuffix}-${safeFilename}`;

      // Upload server-side to Vercel Blob
      const blob = await put(pathname, buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: mime
      });

      const cleanCaption = caption ? String(caption).trim() : null;

      // Next sort order for this kind in this room
      const orderRes = await sql`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
        FROM design_room_images
        WHERE room_id = ${room_id} AND kind = ${cleanKind};
      `;
      const nextOrder = Number(orderRes[0]?.next_order || 0);

      // Attempt insert with size column first, fallback if not migrated yet
      let insertedRow;
      try {
        const rows = await sql`
          INSERT INTO design_room_images (
            room_id,
            owner_email,
            blob_url,
            kind,
            caption,
            sort_order,
            size
          ) VALUES (
            ${room_id},
            ${cleanEmail},
            ${blob.url},
            ${cleanKind},
            ${cleanCaption},
            ${nextOrder},
            ${cleanSize}
          )
          RETURNING *;
        `;
        insertedRow = rows[0];
      } catch (insertErr) {
        if (insertErr.code === '42703' || String(insertErr.message).includes('size')) {
          // Column size does not exist yet; insert without size
          const rows = await sql`
            INSERT INTO design_room_images (
              room_id,
              owner_email,
              blob_url,
              kind,
              caption,
              sort_order
            ) VALUES (
              ${room_id},
              ${cleanEmail},
              ${blob.url},
              ${cleanKind},
              ${cleanCaption},
              ${nextOrder}
            )
            RETURNING *;
          `;
          insertedRow = { ...rows[0], size: cleanSize };
        } else {
          throw insertErr;
        }
      }

      return res.status(201).json({
        ...insertedRow,
        size: insertedRow.size || cleanSize
      });
    }

    // =========================================================================
    // 3. PATCH: Update caption, size, or order
    // =========================================================================
    if (req.method === 'PATCH') {
      const body = req.body || {};
      const { id, caption, size, sort_order } = body;

      if (!id) {
        return res.status(400).json({ error: 'Image id is required' });
      }

      const imgCheck = await sql`
        SELECT * FROM design_room_images
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (imgCheck.length === 0) {
        return res.status(404).json({ error: 'Image not found' });
      }

      let cleanSize = size ? String(size).toLowerCase() : null;
      if (cleanSize && !ALLOWED_SIZES.includes(cleanSize)) {
        cleanSize = 'small';
      }

      let updatedRow;
      try {
        const rows = await sql`
          UPDATE design_room_images SET
            caption = ${caption !== undefined ? (caption ? String(caption).trim() : null) : sql`caption`},
            size = COALESCE(${cleanSize}, size),
            sort_order = COALESCE(${sort_order !== undefined ? Number(sort_order) : null}, sort_order)
          WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
          RETURNING *;
        `;
        updatedRow = rows[0];
      } catch (_patchErr) {
        // If size column doesn't exist yet, patch without size
        const rows = await sql`
          UPDATE design_room_images SET
            caption = ${caption !== undefined ? (caption ? String(caption).trim() : null) : sql`caption`},
            sort_order = COALESCE(${sort_order !== undefined ? Number(sort_order) : null}, sort_order)
          WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
          RETURNING *;
        `;
        updatedRow = { ...rows[0], size: cleanSize || 'small' };
      }

      return res.status(200).json({
        ...updatedRow,
        size: updatedRow.size || cleanSize || 'small'
      });
    }

    // =========================================================================
    // 4. DELETE: Remove image and its Vercel Blob file
    // =========================================================================
    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Image id is required' });
      }

      const imgCheck = await sql`
        SELECT * FROM design_room_images
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (imgCheck.length === 0) {
        return res.status(404).json({ error: 'Image not found' });
      }
      const image = imgCheck[0];

      // Delete from Vercel Blob
      try {
        if (image.blob_url && process.env.BLOB_READ_WRITE_TOKEN) {
          await del(image.blob_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
        }
      } catch (blobErr) {
        console.warn('Vercel Blob deletion warning:', blobErr.message);
      }

      // Delete row from DB
      await sql`
        DELETE FROM design_room_images
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail};
      `;

      return res.status(200).json({ success: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/designer/room-images error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
