/**
 * Subdivision helpers shared by the county backfill script, APIs and UI.
 *
 * Source: DOR NAL S_LEGAL ("short legal"), which is truncated to 30 characters on every
 * county roll, plus the folio/PCN structure for counties that encode the plat in it.
 * No owner or mailing data is involved.
 */

// Words that end the subdivision name inside a legal description
const CUT_MARKERS = [
  'LOTS?', 'LTS?', 'BLKS?', 'BLOCKS?', 'UNITS?', 'TRACTS?', 'PARCELS?', 'PAR', 'BLDGS?', 'BUILDINGS?', 'APTS?',
  'PB', 'PLAT', 'PLATS', 'PL', 'REPLAT', 'RE-PLAT', 'REPL', 'REV', 'REVISED', 'AMD', 'AMENDED', 'AMEN', 'CORR', 'CORRECTED',
  'SEC', 'SECT', 'SECTION', 'PHASE', 'PH', 'PHS', 'ADD', 'ADDN', 'ADDITION', 'UNREC', 'UNRECORDED', 'BEG', 'BEGIN',
  'OR', 'ORB', 'SUB', 'SUBD', 'SUBDIVISION', 'PUD', 'PRD', 'COND', 'CONDO', 'CONDOMINIUM', 'CONDOMINIUMS',
  'NO', 'NUMBER', 'INC', 'DEED', 'IN', 'RESUB', 'RESUBDIVISION', 'DESC', 'LESS', 'PT', 'PORTION', 'POR', 'TOGETHER', 'TOG'
];
const CUT_RE = new RegExp(`\\b(?:${CUT_MARKERS.join('|')})\\b`);

const LEADING_TOKEN_RE = new RegExp(
  '^(?:' +
    // Section-township-range prefix ("02 39 40", "35-48-41")
    '\\d{1,2}[ -]\\d{2}[ -]\\d{2}\\b' +
    // "LOT 452," "LTS 50 & 51" "BLK 31" "UNIT 4B" "PLAT 7" "PH III-B" "SEC 2" "TRACT A" "PARCEL 3"
    '|(?:LOTS?|LTS?|LT|BLKS?|BLOCK|UNITS?|TRACTS?|TR|PARCELS?|PAR|BLDG|PLAT|PL|PH|PHASE|SEC|SECTION|NO)(?:\\.\\s*|\\s+)[A-Z0-9][A-Z0-9-]*(?:\\s*(?:&|AND|,|THRU|-)\\s*(?:\\d[A-Z0-9-]*|[A-Z](?![A-Z])))*' +
  ')[\\s,.;:]*'
);

const TRAILING_NOISE_RE =
  /(?:[\s,.;:&/-]+(?:I{1,3}|IV|VI{0,3}|IX|X{1,3}|\d+(?:ST|ND|RD|TH)|\d+[A-Z]?|[A-Z]|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|FIRST|SECOND|THIRD|FOURTH|FIFTH|AT|THE|OF|AND|&|AMD|S|N|E|W|NE|NW|SE|SW))+$/;

const GENERIC_NAMES = new Set(['', 'THE', 'UNPLATTED', 'UNREC', 'ACREAGE', 'ACRES', 'GOVT', 'GOV', 'TOWNSHIP', 'RANGE', 'COUNTY', 'TOWN OF', 'CITY OF']);

function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])([a-z']*)/g, (_m, a, b) => a.toUpperCase() + b)
    .replace(/\bMc([a-z])/g, (_m, a) => `Mc${a.toUpperCase()}`)
    .replace(/'S\b/g, "'s");
}

/**
 * Derives a readable subdivision / development name from a NAL S_LEGAL string.
 * e.g. "LOT 107 RIVER RIDGE PLAT NO 2" -> "River Ridge"; "LAKE FOREST SEC 4 38-4 B" -> "Lake Forest".
 * Returns null for metes-and-bounds / acreage legals without a recognizable name.
 */
export function deriveSubdivisionName(legal) {
  if (legal == null) return null;
  const original = String(legal).replace(/\s+/g, ' ').trim().toUpperCase();
  if (!original) return null;
  // DOR truncates S_LEGAL at 30 characters, so the last word may be cut off
  const truncated = original.length >= 30;

  // An unterminated "(" (e.g. "FALLS OF JENSEN BEACH (") marks the end of the name
  const openParen = original.lastIndexOf('(');
  const unterminated = openParen > 0 && original.indexOf(')', openParen) === -1;
  let s = (unterminated ? original.slice(0, openParen) : original)
    .replace(/\([^)]*\)/g, ' ') // "(THE)", "(R)"
    .replace(/#\s*\S*/g, ' NO ') // "#11" -> treated like "NO 11"
    .replace(/^(?:REVISED |AMENDED |AMD |REV )?(?:PLAT|REPLAT|RESUBDIVISION|RESUB) OF /, '')
    .replace(/\bP\.\s*U\.\s*D\.?/g, ' PUD ')
    .replace(/\bS\/D\b/g, ' SUBD ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip leading lot/block/plat/section tokens ("LOT 452, NEWFIELD ...", "02 39 40 PALM CITY ...")
  for (let i = 0; i < 6; i++) {
    const next = s.replace(LEADING_TOKEN_RE, '').trim();
    if (next === s) break;
    s = next;
  }

  let cut = unterminated;
  const cutPoints = [];
  const marker = s.match(CUT_RE);
  if (marker) cutPoints.push(marker.index);
  const platRef = s.match(/\b\d+\s*-\s*\d+\s*B?\b/); // Broward plat book-page "38-4 B"
  if (platRef) cutPoints.push(platRef.index);
  const fraction = s.match(/\b(?:[NSEW]{1,2}\s+)?\d+\/\d+\b/); // "E 1/2", "N 75/100"
  if (fraction) cutPoints.push(fraction.index);
  const digitsRun = s.match(/\b\d{3,}\b/); // long numbers (OR book refs, distances)
  if (digitsRun && digitsRun.index > 0) cutPoints.push(digitsRun.index);
  if (cutPoints.length > 0) {
    const at = Math.min(...cutPoints);
    if (at > 0) {
      s = s.slice(0, at);
      cut = true;
    } else if (at === 0) {
      return null;
    }
  }

  s = s.replace(/[,;:.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (truncated && !cut) {
    // Drop a probably-partial last word ("...NORTH RIVER SHO" -> "...NORTH RIVER")
    const words = s.split(' ');
    if (words.length > 1) s = words.slice(0, -1).join(' ');
  }
  for (let i = 0; i < 4; i++) {
    const next = s.replace(TRAILING_NOISE_RE, '').replace(/[\s&,/-]+$/, '').trim();
    if (next === s) break;
    s = next;
  }
  s = s.replace(/^(?:&|AND|OF|AT)\s+/, '').replace(/[\s&,/-]+$/, '').trim();

  const letters = s.replace(/[^A-Z]/g, '');
  // Leading numbers are allowed only for named buildings ("4111 SOUTH OCEAN DRIVE CONDO")
  const wordCount = (s.match(/\b[A-Z]{2,}\b/g) || []).length;
  if (letters.length < 3 || GENERIC_NAMES.has(s) || (/^\d/.test(s) && wordCount < 2)) return null;
  return titleCase(s);
}

/**
 * Plat / subdivision code from the folio where the county encodes it:
 *  - Palm Beach PCN (17 digits): MM RR TT SS BB BBB LLLL -> municipality-range-township-section-subdivision
 *    ("74434328060160100" -> "74-43-43-28-06"); subdivision "00" = unplatted -> null
 *  - Martin (SS-TT-RR-SSS-BBB-LLLLL-C): section-township-range-subdivision
 *    ("23-40-42-002-000-01070-1" -> "23-40-42-002"); subdivision "000" = unplatted -> null
 *  - Broward: not derived (folio sub-area digits are not a plat code)
 */
export function deriveSubdivisionCode(parcelId, county) {
  const raw = String(parcelId || '').trim();
  if (!raw) return null;
  const c = String(county || '').toLowerCase();
  if (c.includes('palm')) {
    const d = raw.replace(/\D/g, '');
    if (d.length !== 17) return null;
    const sub = d.slice(8, 10);
    if (sub === '00') return null;
    return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}-${sub}`;
  }
  if (c.includes('martin')) {
    const parts = raw.split('-');
    if (parts.length < 5 || !/^\d{3}$/.test(parts[3] || '') || parts[3] === '000') return null;
    return parts.slice(0, 4).join('-');
  }
  return null;
}

/** Normalized comparison key ("River Ridge" == "RIVER RIDGE "). */
export function subdivisionKey(name) {
  const s = String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  return s || null;
}

/**
 * Whether a comp is in the subject's subdivision: same plat code when both have one,
 * else same derived name.
 */
export function isSameSubdivision(subject, comp) {
  if (!subject || !comp) return false;
  if (subject.county && comp.county && subject.county !== comp.county) return false;
  if (subject.subdivision_code && comp.subdivision_code) {
    return subject.subdivision_code === comp.subdivision_code ||
      (subdivisionKey(subject.subdivision_name) != null && subdivisionKey(subject.subdivision_name) === subdivisionKey(comp.subdivision_name));
  }
  const a = subdivisionKey(subject.subdivision_name);
  return a != null && a === subdivisionKey(comp.subdivision_name);
}

/** Most common name per plat code; ties go to the longest (least truncated) name. */
export function canonicalizeByCode(records) {
  const byCode = new Map();
  for (const r of records) {
    if (!r.subdivision_code || !r.subdivision_name) continue;
    if (!byCode.has(r.subdivision_code)) byCode.set(r.subdivision_code, new Map());
    const m = byCode.get(r.subdivision_code);
    m.set(r.subdivision_name, (m.get(r.subdivision_name) || 0) + 1);
  }
  const canonical = new Map();
  for (const [code, names] of byCode) {
    const best = [...names].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
    canonical.set(code, best[0]);
  }
  let changed = 0;
  for (const r of records) {
    const canon = r.subdivision_code ? canonical.get(r.subdivision_code) : null;
    if (!canon) continue;
    const own = r.subdivision_name;
    if (!own || (canon !== own && canon.toUpperCase().startsWith(own.toUpperCase()))) {
      r.subdivision_name = canon;
      changed++;
    }
  }
  return changed;
}
