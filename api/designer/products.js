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
    if (marker === 0xDA || marker === 0xD9) {
      chunks.push(buffer.subarray(offset));
      break;
    }
    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
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
    const sql = getDb();

    let body = {};
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    }

    // =========================================================================
    // 1. IMAGE UPLOAD HANDLER: POST with action 'upload_image' or data
    // =========================================================================
    if (req.method === 'POST' && (body.action === 'upload_image' || (body.data && !body.name))) {
      const { data, filename, contentType, previous_url } = body;
      if (!data) {
        return res.status(400).json({ error: 'Missing image data' });
      }

      const base64Data = data.includes(',') ? data.split(',')[1] : data;
      let buffer = Buffer.from(base64Data, 'base64');

      if (buffer.length > MAX_FILE_SIZE) {
        return res.status(400).json({ error: 'Image file size exceeds 10 MB limit' });
      }

      const rawMime = String(contentType || 'image/jpeg').toLowerCase();
      if (!rawMime.startsWith('image/')) {
        return res.status(400).json({ error: 'Only image files are accepted for products' });
      }

      // Metadata stripping on JPEG
      buffer = stripJpegExif(buffer);

      // Random unguessable path: 24 random hex bytes (48 chars)
      const randomName = crypto.randomBytes(24).toString('hex');
      const pathname = `designer/products/${randomName}.jpg`;

      const blob = await put(pathname, buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: 'image/jpeg'
      });

      // If replacing an existing image, delete the old Blob file
      if (previous_url && String(previous_url).includes('public.blob.vercel-storage.com')) {
        try {
          await del(previous_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (delErr) {
          console.warn('Failed to delete previous product image blob:', delErr.message);
        }
      }

      return res.status(200).json({
        url: blob.url,
        filename: `${randomName}.jpg`,
        size: buffer.length
      });
    }

    // =========================================================================
    // 2. GET: List products with search/filters & "used in N items" count
    // =========================================================================
    if (req.method === 'GET') {
      const { search, category, room_type, favorites_only } = req.query || {};

      let rows = [];
      try {
        // Query with Stage 4 columns (favorite, room_types) and items_count
        rows = await sql`
          SELECT 
            p.*,
            COALESCE(count(i.id), 0)::int AS items_count
          FROM design_products p
          LEFT JOIN design_items i ON i.product_id = p.id
          WHERE lower(p.owner_email) = ${cleanEmail}
          GROUP BY p.id
          ORDER BY p.favorite DESC NULLS LAST, p.created_at DESC;
        `;
      } catch (colErr) {
        // Fallback without favorite or room_types if migration not yet applied
        console.warn('Query with Stage 4 product columns failed, using base query fallback:', colErr.message);
        const baseRows = await sql`
          SELECT 
            p.*,
            COALESCE(count(i.id), 0)::int AS items_count
          FROM design_products p
          LEFT JOIN design_items i ON i.product_id = p.id
          WHERE lower(p.owner_email) = ${cleanEmail}
          GROUP BY p.id
          ORDER BY p.created_at DESC;
        `;
        rows = baseRows.map(r => ({
          ...r,
          favorite: false,
          room_types: []
        }));
      }

      // In-memory filtering for fine-grained multi-field search and chip matches
      let filtered = rows;

      if (search && String(search).trim()) {
        const q = String(search).trim().toLowerCase();
        filtered = filtered.filter(p => {
          const name = (p.name || '').toLowerCase();
          const vendor = (p.vendor || '').toLowerCase();
          const finish = (p.finish || '').toLowerCase();
          const notes = (p.notes || '').toLowerCase();
          const sku = (p.sku || '').toLowerCase();
          const spec = (p.spec || '').toLowerCase();
          return name.includes(q) || vendor.includes(q) || finish.includes(q) || notes.includes(q) || sku.includes(q) || spec.includes(q);
        });
      }

      if (category && category !== 'all' && category !== 'All') {
        const catLower = String(category).toLowerCase();
        filtered = filtered.filter(p => (p.category || '').toLowerCase() === catLower);
      }

      if (room_type && room_type !== 'all' && room_type !== 'All') {
        const rtLower = String(room_type).toLowerCase();
        filtered = filtered.filter(p => {
          const types = Array.isArray(p.room_types) ? p.room_types : [];
          return types.some(t => String(t).toLowerCase() === rtLower);
        });
      }

      if (favorites_only === 'true' || favorites_only === true) {
        filtered = filtered.filter(p => p.favorite === true);
      }

      return res.status(200).json({ products: filtered });
    }

    // =========================================================================
    // 3. POST: Create a new product
    // =========================================================================
    if (req.method === 'POST') {
      const {
        name,
        category,
        vendor,
        sku,
        spec,
        finish,
        unit_cost,
        unit,
        lead_time,
        room_types,
        link_url,
        notes,
        image_url,
        favorite
      } = body;

      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Product name is required' });
      }

      const cleanName = String(name).trim();
      const cleanCat = category ? String(category).trim().toLowerCase() : null;
      const cleanVendor = vendor ? String(vendor).trim() : null;
      const cleanSku = sku ? String(sku).trim() : null;
      const cleanSpec = spec ? String(spec).trim() : null;
      const cleanFinish = finish ? String(finish).trim() : null;
      const cleanUnit = unit ? String(unit).trim() : null;
      const cleanLeadTime = lead_time ? String(lead_time).trim() : null;
      const cleanLinkUrl = link_url ? String(link_url).trim() : null;
      const cleanNotes = notes ? String(notes).trim() : null;
      const cleanImageUrl = image_url ? String(image_url).trim() : null;
      const numCost = unit_cost != null && unit_cost !== '' ? Number(unit_cost) : null;
      const isFav = favorite === true;
      const cleanRoomTypes = Array.isArray(room_types) ? room_types.map(r => String(r).trim().toLowerCase()) : [];

      let insertedRow;
      try {
        const inserted = await sql`
          INSERT INTO design_products (
            owner_email,
            name,
            category,
            vendor,
            sku,
            spec,
            unit_cost,
            unit,
            finish,
            lead_time,
            image_url,
            link_url,
            notes,
            favorite,
            room_types
          ) VALUES (
            ${cleanEmail},
            ${cleanName},
            ${cleanCat},
            ${cleanVendor},
            ${cleanSku},
            ${cleanSpec},
            ${numCost},
            ${cleanUnit},
            ${cleanFinish},
            ${cleanLeadTime},
            ${cleanImageUrl},
            ${cleanLinkUrl},
            ${cleanNotes},
            ${isFav},
            ${cleanRoomTypes}
          )
          RETURNING *;
        `;
        insertedRow = inserted[0];
      } catch (insertErr) {
        // Fallback without favorite and room_types if migration pending
        console.warn('Insert with Stage 4 columns failed, falling back to base columns:', insertErr.message);
        const inserted = await sql`
          INSERT INTO design_products (
            owner_email,
            name,
            category,
            vendor,
            sku,
            spec,
            unit_cost,
            unit,
            finish,
            lead_time,
            image_url,
            link_url,
            notes
          ) VALUES (
            ${cleanEmail},
            ${cleanName},
            ${cleanCat},
            ${cleanVendor},
            ${cleanSku},
            ${cleanSpec},
            ${numCost},
            ${cleanUnit},
            ${cleanFinish},
            ${cleanLeadTime},
            ${cleanImageUrl},
            ${cleanLinkUrl},
            ${cleanNotes}
          )
          RETURNING *;
        `;
        insertedRow = {
          ...inserted[0],
          favorite: isFav,
          room_types: cleanRoomTypes
        };
      }

      return res.status(201).json({
        product: {
          ...insertedRow,
          items_count: 0
        }
      });
    }

    // =========================================================================
    // 4. PUT: Update an existing product (or toggle favorite)
    // =========================================================================
    if (req.method === 'PUT') {
      const id = req.query?.id || body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Product id is required' });
      }

      const check = await sql`
        SELECT * FROM design_products
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (check.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      const existing = check[0];

      // Quick toggle favorite handler
      if (req.query?.action === 'toggle_favorite' || body?.action === 'toggle_favorite') {
        const newFav = !existing.favorite;
        try {
          const updated = await sql`
            UPDATE design_products
            SET favorite = ${newFav}, updated_at = now()
            WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
            RETURNING *;
          `;
          return res.status(200).json({ product: { ...updated[0], favorite: newFav } });
        } catch (favErr) {
          return res.status(200).json({ product: { ...existing, favorite: newFav } });
        }
      }

      const {
        name,
        category,
        vendor,
        sku,
        spec,
        finish,
        unit_cost,
        unit,
        lead_time,
        room_types,
        link_url,
        notes,
        image_url,
        favorite
      } = body;

      const cleanName = name !== undefined ? String(name).trim() : existing.name;
      const cleanCat = category !== undefined ? (category ? String(category).trim().toLowerCase() : null) : existing.category;
      const cleanVendor = vendor !== undefined ? (vendor ? String(vendor).trim() : null) : existing.vendor;
      const cleanSku = sku !== undefined ? (sku ? String(sku).trim() : null) : existing.sku;
      const cleanSpec = spec !== undefined ? (spec ? String(spec).trim() : null) : existing.spec;
      const cleanFinish = finish !== undefined ? (finish ? String(finish).trim() : null) : existing.finish;
      const cleanUnit = unit !== undefined ? (unit ? String(unit).trim() : null) : existing.unit;
      const cleanLeadTime = lead_time !== undefined ? (lead_time ? String(lead_time).trim() : null) : existing.lead_time;
      const cleanLinkUrl = link_url !== undefined ? (link_url ? String(link_url).trim() : null) : existing.link_url;
      const cleanNotes = notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes;
      const cleanImageUrl = image_url !== undefined ? (image_url ? String(image_url).trim() : null) : existing.image_url;
      const numCost = unit_cost !== undefined ? (unit_cost != null && unit_cost !== '' ? Number(unit_cost) : null) : existing.unit_cost;
      const isFav = favorite !== undefined ? (favorite === true) : (existing.favorite === true);
      const cleanRoomTypes = room_types !== undefined
        ? (Array.isArray(room_types) ? room_types.map(r => String(r).trim().toLowerCase()) : [])
        : (Array.isArray(existing.room_types) ? existing.room_types : []);

      // If replacing or removing image, clean up old blob
      if (existing.image_url && cleanImageUrl !== existing.image_url && String(existing.image_url).includes('public.blob.vercel-storage.com')) {
        try {
          await del(existing.image_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (delErr) {
          console.warn('Failed to delete previous product image blob:', delErr.message);
        }
      }

      let updatedRow;
      try {
        const updated = await sql`
          UPDATE design_products SET
            name = ${cleanName},
            category = ${cleanCat},
            vendor = ${cleanVendor},
            sku = ${cleanSku},
            spec = ${cleanSpec},
            unit_cost = ${numCost},
            unit = ${cleanUnit},
            finish = ${cleanFinish},
            lead_time = ${cleanLeadTime},
            image_url = ${cleanImageUrl},
            link_url = ${cleanLinkUrl},
            notes = ${cleanNotes},
            favorite = ${isFav},
            room_types = ${cleanRoomTypes},
            updated_at = now()
          WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
          RETURNING *;
        `;
        updatedRow = updated[0];
      } catch (updateErr) {
        console.warn('Update with Stage 4 columns failed, falling back:', updateErr.message);
        const updated = await sql`
          UPDATE design_products SET
            name = ${cleanName},
            category = ${cleanCat},
            vendor = ${cleanVendor},
            sku = ${cleanSku},
            spec = ${cleanSpec},
            unit_cost = ${numCost},
            unit = ${cleanUnit},
            finish = ${cleanFinish},
            lead_time = ${cleanLeadTime},
            image_url = ${cleanImageUrl},
            link_url = ${cleanLinkUrl},
            notes = ${cleanNotes},
            updated_at = now()
          WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
          RETURNING *;
        `;
        updatedRow = {
          ...updated[0],
          favorite: isFav,
          room_types: cleanRoomTypes
        };
      }

      // Get current items count
      const countRes = await sql`
        SELECT count(*)::int AS count FROM design_items WHERE product_id = ${id};
      `;
      const itemsCount = countRes[0]?.count || 0;

      return res.status(200).json({
        product: {
          ...updatedRow,
          items_count: itemsCount
        }
      });
    }

    // =========================================================================
    // 5. DELETE: Delete product, unlink items, and clean up Blob photo
    // =========================================================================
    if (req.method === 'DELETE') {
      const id = req.query?.id || body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Product id is required' });
      }

      const check = await sql`
        SELECT id, image_url FROM design_products
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (check.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      const existing = check[0];

      // Unlink existing items (keeps items, unlinks product_id)
      try {
        await sql`
          UPDATE design_items
          SET product_id = NULL
          WHERE product_id = ${id};
        `;
      } catch (unlinkErr) {
        console.warn('Could not explicitly unlink design_items before product delete:', unlinkErr.message);
      }

      // If product had an image stored in Vercel Blob, delete it
      if (existing.image_url && String(existing.image_url).includes('public.blob.vercel-storage.com')) {
        try {
          await del(existing.image_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (delErr) {
          console.warn('Failed to delete product image blob on delete:', delErr.message);
        }
      }

      // Delete product row
      await sql`
        DELETE FROM design_products
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail};
      `;

      return res.status(200).json({ success: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/designer/products error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
