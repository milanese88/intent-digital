import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import { put, del } from '@vercel/blob';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_PHOTOS_PER_PROPERTY = 30;

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

    // 1. GET: Fetch all photos for a property
    if (req.method === 'GET') {
      const { property_id } = req.query || {};
      if (!property_id) {
        return res.status(400).json({ error: 'property_id is required.' });
      }

      // Verify property belongs to user
      const propCheck = await sql`
        SELECT id FROM investor_properties 
        WHERE id = ${property_id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (propCheck.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      const rows = await sql`
        SELECT 
          id,
          property_id,
          blob_url,
          caption,
          sort_order,
          is_cover,
          created_at
        FROM investor_property_photos
        WHERE property_id = ${property_id} AND lower(owner_email) = ${cleanEmail}
        ORDER BY is_cover DESC, sort_order ASC, created_at ASC;
      `;

      return res.status(200).json({ photos: rows });
    }

    // 2. POST: Upload a photo
    if (req.method === 'POST') {
      const body = req.body || {};
      const { property_id, filename, contentType, data, caption, is_cover } = body;

      if (!property_id || !data) {
        return res.status(400).json({ error: 'property_id and photo data are required.' });
      }

      // Check ownership
      const propCheck = await sql`
        SELECT id FROM investor_properties 
        WHERE id = ${property_id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (propCheck.length === 0) {
        return res.status(404).json({ error: 'Property not found.' });
      }

      // Check max count
      const countRes = await sql`
        SELECT count(*)::int AS count 
        FROM investor_property_photos 
        WHERE property_id = ${property_id};
      `;
      const currentCount = countRes[0]?.count || 0;
      if (currentCount >= MAX_PHOTOS_PER_PROPERTY) {
        return res.status(400).json({
          error: `Maximum limit of ${MAX_PHOTOS_PER_PROPERTY} photos reached for this property.`
        });
      }

      // Decode base64 data
      const base64Data = data.includes(',') ? data.split(',')[1] : data;
      let buffer = Buffer.from(base64Data, 'base64');

      if (buffer.length > MAX_FILE_SIZE) {
        return res.status(400).json({ error: 'File size exceeds maximum 10 MB limit.' });
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

      const safeFilename = (filename || 'photo.jpg').replace(/[^a-zA-Z0-9.-]/g, '_');
      const pathname = `investor/properties/${property_id}/${Date.now()}-${safeFilename}`;

      // Upload server-side to Vercel Blob using existing BLOB_READ_WRITE_TOKEN
      const blob = await put(pathname, buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: mime
      });

      const makeCover = is_cover === true || currentCount === 0;

      if (makeCover) {
        // Demote existing covers
        await sql`
          UPDATE investor_property_photos 
          SET is_cover = false 
          WHERE property_id = ${property_id};
        `;
      }

      const cleanCaption = caption ? String(caption).trim() : null;

      const inserted = await sql`
        INSERT INTO investor_property_photos (
          property_id,
          owner_email,
          blob_url,
          caption,
          sort_order,
          is_cover
        ) VALUES (
          ${property_id},
          ${cleanEmail},
          ${blob.url},
          ${cleanCaption},
          ${currentCount},
          ${makeCover}
        )
        RETURNING *;
      `;

      return res.status(201).json(inserted[0]);
    }

    // 3. PATCH: Update caption, cover status, or order
    if (req.method === 'PATCH') {
      const { id, caption, is_cover, sort_order } = req.body || {};
      if (!id) {
        return res.status(400).json({ error: 'Photo id is required.' });
      }

      const photoRes = await sql`
        SELECT * FROM investor_property_photos 
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (photoRes.length === 0) {
        return res.status(404).json({ error: 'Photo not found.' });
      }
      const photo = photoRes[0];

      if (is_cover === true) {
        // Reset all other photos for this property
        await sql`
          UPDATE investor_property_photos 
          SET is_cover = false 
          WHERE property_id = ${photo.property_id};
        `;
      }

      const updated = await sql`
        UPDATE investor_property_photos SET
          caption = COALESCE(${caption !== undefined ? (caption ? String(caption).trim() : null) : null}, caption),
          is_cover = COALESCE(${is_cover !== undefined ? Boolean(is_cover) : null}, is_cover),
          sort_order = COALESCE(${sort_order !== undefined ? Number(sort_order) : null}, sort_order)
        WHERE id = ${id}
        RETURNING *;
      `;

      return res.status(200).json(updated[0]);
    }

    // 4. DELETE: Remove photo
    if (req.method === 'DELETE') {
      const { id } = req.query || {};
      if (!id) {
        return res.status(400).json({ error: 'Photo id is required.' });
      }

      const photoRes = await sql`
        SELECT * FROM investor_property_photos 
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (photoRes.length === 0) {
        return res.status(404).json({ error: 'Photo not found.' });
      }
      const photo = photoRes[0];

      // Remove from Vercel Blob
      try {
        if (photo.blob_url && process.env.BLOB_READ_WRITE_TOKEN) {
          await del(photo.blob_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
        }
      } catch (blobErr) {
        console.warn('Vercel Blob deletion warning:', blobErr.message);
      }

      // Delete from DB
      await sql`
        DELETE FROM investor_property_photos 
        WHERE id = ${id};
      `;

      // If deleted was cover, promote next photo
      if (photo.is_cover) {
        await sql`
          UPDATE investor_property_photos
          SET is_cover = true
          WHERE id = (
            SELECT id FROM investor_property_photos 
            WHERE property_id = ${photo.property_id}
            ORDER BY sort_order ASC, created_at ASC
            LIMIT 1
          );
        `;
      }

      return res.status(200).json({ success: true, id });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('Error in /api/investor/photos:', err);
    return res.status(500).json({ error: 'Internal server error handling photos.' });
  }
}
