import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import { put, del } from '@vercel/blob';
import crypto from 'crypto';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const cleanEmail = (user.email || '').trim().toLowerCase();
    const body = req.body || {};
    const { data, filename, contentType, item_id, previous_url } = body;

    if (!data) {
      return res.status(400).json({ error: 'Missing file data' });
    }

    // Decode base64
    const base64Data = data.includes(',') ? data.split(',')[1] : data;
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'File size exceeds maximum 15 MB limit' });
    }

    const rawMime = String(contentType || 'application/pdf').toLowerCase();
    const mime = rawMime.split(';')[0].trim();
    if (!ALLOWED_MIME_TYPES.has(mime) && !/\.(pdf|jpe?g|png|webp)$/i.test(filename || '')) {
      return res.status(400).json({
        error: 'Unsupported file type. Only PDF, JPG, PNG, and WebP invoices are accepted.'
      });
    }

    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const safeFilename = (filename || 'invoice.pdf').replace(/[^a-zA-Z0-9.-]/g, '_');
    const pathname = `designer/invoices/${Date.now()}-${randomSuffix}-${safeFilename}`;

    // Upload to Vercel Blob
    const blob = await put(pathname, buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: mime
    });

    // If there was an old blob url replaced, delete it to keep storage clean
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
        // If column does not exist yet before migration is applied, log quietly
        console.warn('Could not update design_items.invoice_url (migration pending?):', dbErr.message);
      }
    }

    return res.status(200).json({
      url: blob.url,
      filename: safeFilename,
      size: buffer.length
    });
  } catch (err) {
    console.error('api/designer/upload-invoice error:', err);
    return res.status(500).json({ error: err.message || 'Server error uploading invoice' });
  }
}
