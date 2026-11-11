import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import { put, del } from '@vercel/blob';
import crypto from 'crypto';

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // 1. GET: Fetch all documents for a property
    if (req.method === 'GET') {
      const propertyId = req.query?.property_id || req.query?.propertyId;
      if (!propertyId) {
        return res.status(400).json({ error: 'property_id is required' });
      }

      // Check property ownership
      const propCheck = await sql`
        SELECT id FROM investor_properties 
        WHERE id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (propCheck.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
      }

      let documents = [];
      try {
        documents = await sql`
          SELECT id, property_id, title, doc_type, blob_url, file_size, created_at
          FROM investor_property_documents
          WHERE property_id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
          ORDER BY created_at DESC;
        `;
      } catch (tableErr) {
        // Table may not yet be created if migration has not been applied
        console.warn('investor_property_documents table query note:', tableErr.message);
        documents = [];
      }

      return res.status(200).json({ documents });
    }

    // 2. POST: Upload a document (PDF) to Vercel Blob and save record
    if (req.method === 'POST') {
      const { property_id, title, data, filename } = req.body || {};

      if (!property_id || !data) {
        return res.status(400).json({ error: 'property_id and file data are required' });
      }

      // Verify property ownership
      const propCheck = await sql`
        SELECT id FROM investor_properties 
        WHERE id = ${property_id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (propCheck.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // Parse base64 PDF data
      let base64Data = data;
      if (data.includes(',')) {
        base64Data = data.split(',')[1];
      }
      const buffer = Buffer.from(base64Data, 'base64');
      const fileSize = buffer.length;

      // Generate random unguessable path
      const randomKey = crypto.randomBytes(16).toString('hex');
      const safeTitle = (title || 'deal-report').replace(/[^a-zA-Z0-9_-]/g, '_');
      const blobPath = `deals/reports/${property_id}/${randomKey}-${safeTitle}.pdf`;

      // Upload to Vercel Blob
      const blob = await put(blobPath, buffer, {
        access: 'public',
        contentType: 'application/pdf',
        addRandomSuffix: false
      });

      let insertedDoc = {
        id: crypto.randomUUID(),
        property_id,
        title: title || 'Deal Report',
        doc_type: 'deal_report',
        blob_url: blob.url,
        file_size: fileSize,
        created_at: new Date().toISOString()
      };

      try {
        const rows = await sql`
          INSERT INTO investor_property_documents (
            owner_email,
            property_id,
            title,
            doc_type,
            blob_url,
            file_size
          ) VALUES (
            ${cleanEmail},
            ${property_id},
            ${title || 'Deal Report'},
            'deal_report',
            ${blob.url},
            ${fileSize}
          )
          RETURNING id, property_id, title, doc_type, blob_url, file_size, created_at;
        `;
        if (rows.length > 0) {
          insertedDoc = rows[0];
        }
      } catch (insertErr) {
        console.warn('Document uploaded to blob, database insert warning:', insertErr.message);
      }

      return res.status(200).json({ document: insertedDoc });
    }

    // 3. DELETE: Remove document by id (removes from Blob and database)
    if (req.method === 'DELETE') {
      const id = req.body?.id || req.query?.id;
      if (!id) {
        return res.status(400).json({ error: 'Document ID is required' });
      }

      let existing = [];
      try {
        existing = await sql`
          SELECT id, blob_url
          FROM investor_property_documents
          WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
          LIMIT 1;
        `;
      } catch (queryErr) {
        console.warn('investor_property_documents delete check:', queryErr.message);
      }

      if (existing.length > 0 && existing[0].blob_url) {
        try {
          await del(existing[0].blob_url);
        } catch (blobDelErr) {
          console.warn('Failed to delete blob:', blobDelErr.message);
        }

        await sql`
          DELETE FROM investor_property_documents
          WHERE id = ${id} AND lower(owner_email) = ${cleanEmail};
        `;
      }

      return res.status(200).json({ success: true, id });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Documents API Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error processing document' });
  }
}
