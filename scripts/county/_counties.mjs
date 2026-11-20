/**
 * scripts/county/_counties.mjs
 *
 * Shared county registry + roll-file discovery for the Florida DOR county pipeline
 * (inspect-roll, import-roll, import-coords, tag-municipality).
 *
 * Roll files may live directly in data/county/ (e.g. "Broward 16 Final NAL 2026.zip")
 * or in a per-county subfolder (e.g. data/county/martin/NAL53F202601.csv). Files are
 * matched by county name OR by the DOR file-name convention NAL{CO_NO}F{YEAR}.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parse } from 'csv-parse';

export const COUNTY_REGISTRY = {
  Broward: {
    name: 'Broward',
    dorCode: '16',
    slug: 'broward',
    knownParcel: {
      id: '504209040280',
      addressIncludes: '924 SW 15 TER',
      addr: '924 SW 15 TER, Fort Lauderdale',
      minLat: 26.05, maxLat: 26.15, minLng: -80.20, maxLng: -80.12,
      target: '26.11 N, -80.16 W'
    }
  },
  'Palm Beach': {
    name: 'Palm Beach',
    dorCode: '60',
    slug: 'palm-beach',
    knownParcel: {
      id: '74434307010000010',
      addressIncludes: '1901 EMBASSY',
      addr: '1901 EMBASSY DR, West Palm Beach',
      minLat: 26.68, maxLat: 26.78, minLng: -80.12, maxLng: -80.04,
      target: '26.73 N, -80.08 W'
    }
  },
  Martin: {
    name: 'Martin',
    dorCode: '53',
    slug: 'martin',
    knownParcel: {
      id: '23-40-42-002-000-01070-1',
      addressIncludes: '18801 SE RIVER RIDGE',
      addr: '18801 SE RIVER RIDGE RD, Tequesta / Jupiter (Martin)',
      minLat: 26.93, maxLat: 27.00, minLng: -80.16, maxLng: -80.08,
      target: '26.96 N, -80.12 W'
    }
  }
};

/**
 * Martin County Property Appraiser municipal levy (tax district) codes, as recorded in
 * the DOR NAL TAX_AUTH_CD column. Every other Martin code is an unincorporated MSTU district.
 */
export const MARTIN_MUNICIPAL_TAX_CODES = {
  '3100': 'Stuart',
  '4300': 'Jupiter Island',
  '2200': "Sewall's Point",
  '1400': 'Ocean Breeze',
  '8018': 'Indiantown'
};
export const MARTIN_UNINCORPORATED = 'Unincorporated Martin';

export function normalizeCountyName(raw) {
  const s = String(raw || '').trim();
  if (/palm/i.test(s)) return 'Palm Beach';
  if (/martin/i.test(s)) return 'Martin';
  if (/broward/i.test(s)) return 'Broward';
  return s;
}

export function getCountyConfig(raw) {
  return COUNTY_REGISTRY[normalizeCountyName(raw)] || null;
}

/** Strips separators so dashed (Martin) and undashed parcel IDs compare equal. */
export function normalizeParcelKey(id) {
  return String(id || '').trim().replace(/[-_ .]/g, '').toUpperCase();
}

function listFilesRecursive(dir, depth = 2) {
  if (!fs.existsSync(dir)) return [];
  let out = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (depth > 0) out = out.concat(listFilesRecursive(full, depth - 1));
    } else {
      out.push(full);
    }
  }
  return out;
}

/**
 * Finds a county NAL or SDF roll file (.zip / .csv / .txt) in data/county or a subfolder.
 */
export function findRollFile(dataDir, countyRaw, kind) {
  const county = getCountyConfig(countyRaw);
  const countyName = county?.name || String(countyRaw || '');
  const token = countyName.toLowerCase().replace(/[\s_'-]+/g, '');
  const upperKind = String(kind).toUpperCase();
  const dorPattern = county ? new RegExp(`^${upperKind}${county.dorCode}F\\d{4}`, 'i') : null;
  const validExt = new Set(['.zip', '.csv', '.txt']);

  const candidates = listFilesRecursive(dataDir).filter((f) => validExt.has(path.extname(f).toLowerCase()));
  const match = candidates.find((f) => {
    const base = path.basename(f);
    const compact = base.toLowerCase().replace(/[\s_'-]+/g, '');
    if (!base.toUpperCase().includes(upperKind)) return false;
    if (compact.includes(token)) return true;
    return dorPattern ? dorPattern.test(base) : false;
  });
  return match || null;
}

/** RFC-4180 streaming parser for a flat CSV or a single-file .zip archive. */
export function createRollCsvStream(filePath) {
  const parser = parse({ relax_column_count: true, relax_quotes: true, skip_empty_lines: true });
  if (path.extname(filePath).toLowerCase() === '.zip') {
    const child = spawn('unzip', ['-p', filePath]);
    child.stderr.on('data', () => {});
    child.stdout.pipe(parser);
    return { parser, cleanup: () => child.kill() };
  }
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  stream.pipe(parser);
  return { parser, cleanup: () => stream.destroy() };
}

