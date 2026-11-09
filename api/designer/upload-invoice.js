import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import { put, del } from '@vercel/blob';
import crypto from 'crypto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB limit

/**
 * Strips EXIF APP1 metadata (including GPS coordinates, camera/device info) from JPEG buffers.
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

    const cleanEmail = (user.email || '').trim().toLowerCase();

    let body = {};
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    }

    // =========================================================================
    // DELETE: Delete an invoice blob directly
    // =========================================================================
    if (req.method === 'DELETE') {
      const url = req.query?.url || body?.url;
      const itemId = req.query?.item_id || body?.item_id;

      if (url && String(url).includes('public.blob.vercel-storage.com')) {
        try {
          await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (delErr) {
          console.warn('Failed to delete invoice blob:', delErr.message);
        }
      }

      if (itemId) {
        const sql = getDb();
        try {
          await sql`
            UPDATE design_items
            SET invoice_url = NULL, updated_at = now()
            WHERE id = ${itemId} AND lower(owner_email) = ${cleanEmail};
          `;
        } catch (dbErr) {
          console.warn('Failed to clear item invoice_url:', dbErr.message);
        }
      }

      return res.status(200).json({ success: true });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { data, filename, contentType, item_id, previous_url } = body;

    if (!data) {
      return res.status(400).json({ error: 'Missing file data' });
    }

    // Decode base64
    const base64Data = data.includes(',') ? data.split(',')[1] : data;
    let buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'File size exceeds maximum 10 MB limit' });
    }

    const rawMime = String(contentType || 'application/pdf').toLowerCase();
    const mime = rawMime.split(';')[0].trim();

    let ext = 'pdf';
    let finalMime = 'application/pdf';

    if (mime === 'application/pdf' || /\.(pdf)$/i.test(filename || '')) {
      finalMime = 'application/pdf';
      ext = 'pdf';
    } else if (
      mime === 'image/jpeg' ||
      mime === 'image/jpg' ||
      mime === 'image/png' ||
      mime === 'image/webp' ||
      /\.(jpe?g|png|webp)$/i.test(filename || '')
    ) {
      // Images must be JPEG with metadata stripped
      finalMime = 'image/jpeg';
      ext = 'jpg';
      buffer = stripJpegExif(buffer);
    } else {
      return res.status(400).json({
        error: 'Unsupported file type. Invoices must be application/pdf or image (JPG/PNG/WebP).'
      });
    }

    // Random unguessable path: 24 random hex bytes (48 chars)
    const randomName = crypto.randomBytes(24).toString('hex');
    const pathname = `designer/invoices/${randomName}.${ext}`;

    // Upload to Vercel Blob
    const blob = await put(pathname, buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: finalMime
    });

    // If replacing an existing invoice, delete the old Blob file
    if (previous_url && String(previous_url).includes('public.blob.vercel-storage.com')) {
      try {
        await del(previous_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch (delErr) {
        console.warn('Failed to delete previous invoice blob:', delErr.message);
      }
    }

    // If item_id is provided, also update the item's invoice_url directly
    if (item_id) {
      const sql = getDb();
      try {
        await sql`
          UPDATE design_items
          SET invoice_url = ${blob.url}, updated_at = now()
          WHERE id = ${item_id} AND lower(owner_email) = ${cleanEmail};
        `;
      } catch (dbErr) {
        console.warn('Could not update design_items.invoice_url (migration pending?):', dbErr.message);
      }
    }

    return res.status(200).json({
      url: blob.url,
      filename: `${randomName}.${ext}`,
      size: buffer.length
    });
  } catch (err) {
    console.error('api/designer/upload-invoice error:', err);
    return res.status(500).json({ error: err.message || 'Server error uploading invoice' });
  }
}
