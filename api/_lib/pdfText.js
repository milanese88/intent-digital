/**
 * api/_lib/pdfText.js
 *
 * Server-side PDF → text extraction using pdfjs-dist (legacy Node build).
 * Works with browser-saved PDFs (CID fonts, ToUnicode maps, object streams,
 * compressed xref) that a hand-rolled zlib/Tj scanner cannot read.
 *
 * Reading order & table rows are preserved:
 *   - text items are grouped into visual lines by their baseline (y),
 *   - items in a line are ordered left → right (x),
 *   - a wide horizontal gap between items becomes a cell separator " | ",
 *     so table rows come out as  "07/15/1986 | WD | $185,000 | 0712/1450".
 *
 * Server-only: never imported by browser code (keeps pdfjs out of the Vite bundle).
 */

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const CELL_SEPARATOR = ' | ';

let pdfjsPromise = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      try {
        const require = createRequire(import.meta.url);
        const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
      } catch {
        // pdfjs falls back to its in-process "fake worker" when workerSrc can't be resolved.
      }
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/**
 * Groups pdfjs text items of a single page into ordered text lines.
 * Exported for unit tests (pure — operates on plain item objects).
 *
 * @param {Array<{str:string, transform:number[], width:number, height:number}>} items
 * @returns {string[]} lines in top → bottom order
 */
export function itemsToLines(items = []) {
  const glyphs = [];
  for (const it of items) {
    if (!it || typeof it.str !== 'string') continue;
    const str = it.str.replace(/\s+/g, ' ');
    if (!str.trim()) continue;
    const t = Array.isArray(it.transform) ? it.transform : [1, 0, 0, 1, 0, 0];
    const x = Number(t[4]) || 0;
    const y = Number(t[5]) || 0;
    const fontH = Math.abs(Number(it.height) || Number(t[3]) || 10) || 10;
    const width = Math.max(0, Number(it.width) || str.length * fontH * 0.5);
    glyphs.push({ str, x, y, width, fontH });
  }
  if (glyphs.length === 0) return [];

  // Sort top → bottom (pdf y grows upward), then left → right.
  glyphs.sort((a, b) => (b.y - a.y) || (a.x - b.x));

  // Cluster into lines: same baseline within ~45% of the font height.
  const lines = [];
  for (const g of glyphs) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - g.y) <= Math.max(2, Math.min(line.fontH, g.fontH) * 0.45)) {
      line.items.push(g);
      line.fontH = Math.max(line.fontH, g.fontH);
    } else {
      lines.push({ y: g.y, fontH: g.fontH, items: [g] });
    }
  }

  return lines.map((line) => {
    const sorted = line.items.sort((a, b) => a.x - b.x);
    let out = '';
    let prevEnd = null;
    for (const g of sorted) {
      if (prevEnd != null) {
        const gap = g.x - prevEnd;
        const charW = g.fontH * 0.5;
        if (gap > charW * 2.2) {
          out = out.replace(/\s+$/, '') + CELL_SEPARATOR;
        } else if (gap > charW * 0.15 && !/\s$/.test(out) && !/^\s/.test(g.str)) {
          out += ' ';
        }
      }
      out += g.str;
      prevEnd = g.x + g.width;
    }
    return out.replace(/\s{2,}/g, ' ').replace(/^(\s*\|\s*)+/, '').replace(/(\s*\|\s*)+$/, '').trim();
  }).filter(Boolean);
}

/**
 * Extracts reading-order text (with " | " table cell separators) from a PDF buffer.
 * @param {Buffer|Uint8Array|ArrayBuffer} pdfBuffer
 * @param {{maxPages?: number}} [options]
 * @returns {Promise<{text: string, pageCount: number}>}
 */
export async function extractPdfText(pdfBuffer, { maxPages = 25 } = {}) {
  const pdfjs = await loadPdfjs();
  const data = pdfBuffer instanceof Uint8Array
    ? new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength).slice()
    : new Uint8Array(pdfBuffer);

  const loadingTask = pdfjs.getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0
  });
  const doc = await loadingTask.promise;
  try {
    const pageCount = doc.numPages;
    const pageTexts = [];
    for (let p = 1; p <= Math.min(pageCount, maxPages); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent({ includeMarkedContent: false });
      pageTexts.push(itemsToLines(content.items).join('\n'));
      page.cleanup();
    }
    return { text: pageTexts.join('\n\n'), pageCount };
  } finally {
    await doc.destroy();
  }
}
