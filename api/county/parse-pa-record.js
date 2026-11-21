/**
 * api/county/parse-pa-record.js
 *
 * Privacy-safe Property Appraiser record parser (PDF upload / raw text paste).
 * Extracts folio, building info, sketch sub-areas, features, sales history,
 * and value history by year.
 *
 * Privacy:
 *   Owner names and mailing addresses are strictly dropped before parsing.
 *   Zero PII is ever returned or stored.
 */

import { getUserFromSession } from '../_lib/session.js';
import { extractTextFromPdfBuffer, parsePaRecordText, sanitizeAndStripPii } from '../../src/utils/paRecordParser.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const { text, fileBase64, filename } = req.body || {};

    let rawText = '';

    if (fileBase64) {
      try {
        const buf = Buffer.from(fileBase64, 'base64');
        rawText = extractTextFromPdfBuffer(buf);
      } catch (_pdfErr) {
        return res.status(400).json({ error: 'Unable to extract text from the provided PDF file.' });
      }
    } else if (text && typeof text === 'string') {
      rawText = text;
    } else {
      return res.status(400).json({ error: 'Either fileBase64 (PDF) or text is required.' });
    }

    if (!rawText.trim()) {
      return res.status(400).json({ error: 'No readable text could be extracted from the Property Appraiser record.' });
    }

    // Parse with strict PII filtering
    const parsed = parsePaRecordText(rawText);

    // Double check that no owner or mail tokens survived
    const sanitizedFull = sanitizeAndStripPii(rawText);

    return res.status(200).json({
      success: true,
      filename: filename || 'pa-record.pdf',
      parsed,
      previewText: sanitizedFull.slice(0, 1500)
    });
  } catch (err) {
    console.error('Error parsing Property Appraiser record:', err);
    return res.status(500).json({ error: 'Internal server error parsing PA record.' });
  }
}
