/**
 * api/_lib/camaSales.js
 *
 * Palm Beach County CAMA PAS405E Historical Sales Provider.
 * Parses up to 5 prior deed transactions per parcel directly from the official
 * PAPA CAMA SALE records (PAS405_CSV_CERT2026).
 *
 * Every sale record returned is strictly non-PII (book, page, date, deed type,
 * qualification flag, vacant/improved code, sale price) and stamped:
 *   source: "county record"
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DEFAULT_CAMA_PATH = path.join(process.cwd(), 'data/county/palm-beach/CAMA_CSV_CERT2026/PAS405_CSV_CERT2026_20261027.TXT');

const MONTH_MAP = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
};

/**
 * Converts CAMA date string (e.g. "03-AUG-26", "18-JUL-24", "01-JAN-86") to ISO YYYY-MM-DD
 */
export function parseCamaDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = MONTH_MAP[m[2].toUpperCase()] || null;
  const rawYr = parseInt(m[3], 10);
  if (!mon || isNaN(day) || isNaN(rawYr)) return null;

  const currentYrShort = new Date().getFullYear() % 100;
  const year = rawYr <= currentYrShort + 1 ? 2000 + rawYr : 1900 + rawYr;
  const iso = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { iso, year, month: mon, day };
}

/**
 * Discovers the CAMA PAS405 file on disk.
 */
export function getPalmBeachCamaFilePath() {
  if (fs.existsSync(DEFAULT_CAMA_PATH)) return DEFAULT_CAMA_PATH;

  const pbDir = path.join(process.cwd(), 'data/county/palm-beach');
  if (fs.existsSync(pbDir)) {
    const findInDir = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            const found = findInDir(full);
            if (found) return found;
          } else if (e.isFile() && /PAS405.*CERT.*\.TXT$/i.test(e.name)) {
            return full;
          }
        }
      } catch {
        // ignore unreadable
      }
      return null;
    };
    const found = findInDir(pbDir);
    if (found) return found;
  }
  return null;
}

/**
 * Parses up to 5 prior deed transactions for a Palm Beach parcel.
 * Uses fast bounded grep (halts on first match).
 *
 * @param {string} folio 17-digit parcel control number (with or without hyphens)
 * @returns {Array<object>} Array of standardized sales objects
 */
export function fetchPalmBeachCamaSales(folio) {
  if (!folio) return [];
  const cleanFolio = String(folio).replace(/[^0-9]/g, '');
  if (!cleanFolio || cleanFolio.length !== 17) return [];

  const filePath = getPalmBeachCamaFilePath();
  if (!filePath) return [];

  let line = '';
  try {
    const cmd = `grep -m 1 "^${cleanFolio},SALE," "${filePath}"`;
    line = execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    // Non-fatal: if folio has no SALE row in CAMA or grep returns 1
    return [];
  }

  if (!line || !line.includes(',SALE,')) return [];

  const parts = line.split(',');
  if (parts.length < 9 || parts[1] !== 'SALE') return [];

  const sales = [];
  let idx = 2;

  // Tuples of 7 fields: (or_book, or_page, sale_date, deed_type, qual_code, vi_cd, sale_price)
  while (idx + 6 < parts.length && sales.length < 5) {
    const orBook = (parts[idx] || '').trim();
    const orPage = (parts[idx + 1] || '').trim();
    const rawDate = (parts[idx + 2] || '').trim();
    const deedType = (parts[idx + 3] || '').trim();
    const qualFlag = (parts[idx + 4] || '').trim(); // 'Q' (Qualified) or 'D'/'U' (Disqualified)
    const viCd = (parts[idx + 5] || '').trim().toUpperCase(); // 'I' (Improved) or 'V' (Vacant)
    const salePrice = Number(parts[idx + 6]) || 0;

    const dateInfo = parseCamaDate(rawDate);
    if (dateInfo && (salePrice > 0 || deedType)) {
      const isMarket = qualFlag.toUpperCase() === 'Q' && ['WD', 'SWD', 'TD'].includes(deedType.toUpperCase());
      const qualCode = qualFlag.toUpperCase() === 'Q' ? '01' : '11';
      const label = qualFlag.toUpperCase() === 'Q' ? 'Qualified market sale' : 'Disqualified / nominal transfer';

      sales.push({
        id: `cama-${cleanFolio}-${dateInfo.iso}-${orBook}-${orPage}`,
        county: 'Palm Beach',
        parcel_id: cleanFolio,
        sale_price: salePrice,
        sale_year: dateInfo.year,
        sale_month: dateInfo.month,
        sale_date: dateInfo.iso,
        qual_code: qualCode,
        label,
        qual_label: label,
        is_market: isMarket,
        is_distressed: false,
        vi_cd: viCd || null,
        or_book: orBook || null,
        or_page: orPage || null,
        clerk_no: '',
        deed_type: deedType || 'WD',
        source: 'county record'
      });
    }

    idx += 7;
  }

  return sales.sort((a, b) => (b.sale_date || '').localeCompare(a.sale_date || ''));
}

