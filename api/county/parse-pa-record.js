/**
 * api/county/parse-pa-record.js
 *
 * Privacy-safe Property Appraiser record parser (PDF upload / raw text paste).
 * PDF text is extracted with pdfjs-dist (reading order + table rows preserved),
 * then owner names / mailing addresses / grantor-grantee names are stripped
 * BEFORE any field parsing. Fields the parser isn't confident about come back
 * as null and are listed in `parsed.notFound`.
 */

import { getUserFromSession } from '../_lib/session.js';
import { extractPdfText } from '../_lib/pdfText.js';
import { parsePaRecordText, sanitizeAndStripPii } from '../../src/utils/paRecordParser.js';

const MAX_PDF_BYTES = 8 * 1024 * 1024;

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
    let pageCount = null;

    if (fileBase64) {
      const buf = Buffer.from(String(fileBase64), 'base64');
      if (buf.length === 0 || buf.length > MAX_PDF_BYTES) {
        return res.status(400).json({ error: 'PDF must be between 1 byte and 8 MB.' });
      }
      if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return res.status(400).json({ error: 'The uploaded file is not a PDF.' });
      }
      try {
        const extracted = await extractPdfText(buf);
        rawText = extracted.text;
        pageCount = extracted.pageCount;
      } catch (pdfErr) {
        console.error('PA record PDF extraction failed:', pdfErr?.message);
        return res.status(400).json({ error: 'Unable to read text from this PDF. Try "Paste PA Text" instead.' });
      }
    } else if (text && typeof text === 'string') {
      rawText = text;
    } else {
      return res.status(400).json({ error: 'Either fileBase64 (PDF) or text is required.' });
    }

    if (!rawText.trim()) {
      return res.status(400).json({
        error: 'No readable text found. The PDF may be a scanned image — try "Paste PA Text" instead.'
      });
    }

    const parsed = parsePaRecordText(rawText);
    const sanitizedFull = sanitizeAndStripPii(rawText);

    return res.status(200).json({
      success: true,
      filename: filename || 'pa-record.pdf',
      pageCount,
      parsed,
      previewText: sanitizedFull.slice(0, 4000)
    });
  } catch (err) {
    console.error('Error parsing Property Appraiser record:', err?.message);
    return res.status(500).json({ error: 'Internal server error parsing PA record.' });
  }
}
