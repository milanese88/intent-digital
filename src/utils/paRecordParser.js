/**
 * src/utils/paRecordParser.js
 *
 * Privacy-safe, confidence-gated parser for Florida Property Appraiser records
 * (Broward BCPA, Palm Beach PAPA, Martin MCPA) — from PDF-extracted text or pasted text.
 *
 * Input text is expected in reading order with table cells separated by " | "
 * (see api/_lib/pdfText.js). Tabs in pasted text are treated as cell separators.
 *
 * Rules:
 *   1. PRIVACY: owner names, mailing addresses and grantor/grantee names are removed
 *      BEFORE any parsing. Sales rows are rebuilt only from recognised tokens
 *      (date, price, deed type, book/page, instrument #) so names can never survive.
 *   2. CONFIDENCE: a field is only filled when it was found next to an explicit
 *      label / inside its own table section and its value passes validation.
 *      Anything else stays `null` and is listed in `notFound` — never guessed.
 *   3. PROVENANCE: every bundle is stamped `source: "PA record PDF, <date>"`, and
 *      `fieldSources` records which label each value came from.
 *
 * Pure JS — no Node built-ins — so it can be unit-tested and reused anywhere.
 */

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1880;
const MAX_YEAR = CURRENT_YEAR + 1;

/* ------------------------------------------------------------------------- */
/* Text normalisation                                                        */
/* ------------------------------------------------------------------------- */

export function normalizePaText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\t+/g, ' | ')
    .split('\n')
    .map((l) => l.replace(/[ \u2000-\u200b]+/g, ' ').replace(/(\s*\|\s*)+/g, ' | ').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim())
    .join('\n');
}

function splitCells(line) {
  return String(line || '')
    .split(/\s*\|\s*/)
    .map((c) => c.trim())
    .filter(Boolean);
}

function normLabel(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[#:.()\[\],]/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------------- */
/* Section headings                                                          */
/* ------------------------------------------------------------------------- */

const SECTION_PATTERNS = [
  { key: 'owner', re: /^(property\s+)?owner(s|\s*\(s\))?(\s+(name|names|information|info|of\s+record))?$/i },
  { key: 'owner', re: /^(mailing|mail)\s+address$/i },
  { key: 'owner', re: /^ownership(\s+history)?$/i },
  { key: 'sales', re: /^(sales?|transfer|deed)\s+(history|information|data)(\s+for\s+this\s+parcel)?$/i },
  { key: 'sales', re: /^sales?$/i },
  { key: 'values', re: /^(property\s+)?(assessment|value|valuation|market\s+value|tax\s+roll)\s+(history|values|information|summary)$/i },
  { key: 'values', re: /^(property|certified|historical|assessed)\s+values?$/i },
  { key: 'values', re: /^values?(\s+history)?$/i },
  { key: 'building', re: /^(residential\s+|commercial\s+)?(building|bldg)s?(\s+(information|characteristics|details|data|summary|description|\d+(\s+of\s+\d+)?))?$/i },
  { key: 'building', re: /^(structural|structure)\s+(elements|details|information)$/i },
  { key: 'features', re: /^(extra|special|miscellaneous|misc\.?|other)\s+(features?|improvements?|items)(\s+.*)?$/i },
  { key: 'features', re: /^(yard\s+items|xfob|outbuildings)$/i },
  { key: 'subareas', re: /^(building\s+)?(sub\s*-?\s*areas?|area\s+types?|sketch\s+areas?|area\s+summary|sketch)(\s+.*)?$/i },
  { key: 'land', re: /^land(\s+(information|calculations|lines|data|details|summary))?$/i },
  { key: 'legal', re: /^(abbreviated\s+|full\s+|short\s+)?legal(\s+description)?$/i },
  { key: 'other', re: /^(exemptions?|tax(es)?(\s+.*)?|permits?(\s+.*)?|special\s+assessments?|millage.*|map|photos?|notes?|disclaimer.*|property\s+summary|parcel\s+summary)$/i }
];

/** Returns the section key if `line` is a section heading, else null. */
export function detectSectionHeading(line) {
  const cells = splitCells(line);
  if (cells.length === 0 || cells.length > 2) return null;
  const text = cells.join(' ').replace(/:\s*$/, '').trim();
  if (text.length > 60) return null;
  for (const { key, re } of SECTION_PATTERNS) {
    if (re.test(text)) return key;
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* Known labels (used both to parse and to end owner/mailing blocks)          */
/* ------------------------------------------------------------------------- */

const LABELS = {
  folio: ['folio', 'folio number', 'folio #', 'parcel id', 'parcel number', 'parcel', 'property id', 'pcn', 'parcel control number', 'pin'],
  address: ['physical address', 'site address', 'situs address', 'situs', 'property address', 'location address', 'property location'],
  livingSqft: [
    'finished area', 'total finished area', 'finished sq ft', 'finished square feet', 'finished sf',
    'heated area', 'total heated area', 'heated sq ft', 'heated/cooled area',
    'living area', 'total living area', 'living sq ft', 'living sf',
    'under air', 'under air sq ft', 'under air s f', 'under air square footage', 'under air sf',
    'conditioned area', 'total under air'
  ],
  adjBldgSqft: ['adj bldg s f', 'adj bldg s f card/sketch', 'adj bldg sf', 'adjusted building sf', 'adj bldg s f card sketch'],
  yearBuilt: ['year built', 'actual year built', 'act year built', 'yr built', 'yr blt', 'year blt', 'built'],
  effYearBuilt: ['effective year built', 'eff year built', 'effective year', 'eff year', 'eff yr', 'eff yr built', 'effective age year'],
  effActYear: ['eff/act year built', 'eff/act yr built', 'eff/act year'],
  unitsBedsBaths: ['units/beds/baths', 'units/bed/bath'],
  beds: ['bedrooms', 'bedroom', 'beds', 'bed rooms', 'number of bedrooms', 'no of bedrooms'],
  baths: ['baths', 'bathrooms', 'total baths', 'total bathrooms', 'number of baths'],
  fullBaths: ['full baths', 'full bath', 'full bathrooms', 'baths full'],
  halfBaths: ['half baths', 'half bath', 'half bathrooms', 'baths half'],
  stories: ['stories', 'story', 'no of stories', 'number of stories', 'floors', 'story height'],
  construction: ['exterior wall', 'exterior walls', 'ext wall', 'ext walls', 'exterior wall type', 'construction', 'construction type', 'frame', 'frame type', 'structural frame', 'structure type', 'wall type', 'exterior'],
  roofCover: ['roof cover', 'roof covering', 'roof cover type', 'roof material', 'roofing', 'roof'],
  roofStructure: ['roof structure', 'roof type', 'roof shape', 'roof frame', 'roof style'],
  quality: ['quality', 'quality grade', 'grade', 'construction quality', 'quality code'],
  condition: ['condition', 'physical condition', 'condition code'],
  neighborhood: ['neighborhood', 'neighborhood code', 'nbhd', 'nbhd code', 'nbrhd', 'nbrhd code', 'neighborhood cd'],
  legal: ['legal description', 'abbreviated legal description', 'legal desc', 'short legal', 'legal'],
  misc: [
    'millage', 'millage code', 'use', 'use code', 'property use', 'land use', 'dor use code', 'property class', 'zoning',
    'subdivision', 'acres', 'acreage', 'lot size', 'tax district', 'account', 'account number', 'account #', 'municipality',
    'city', 'homestead', 'exemptions', 'land value', 'building value', 'just value', 'market value', 'assessed value',
    'taxable value', 'section/township/range', 'map number', 'units'
  ]
};

const ALL_KNOWN_LABELS = Object.values(LABELS).flat().map(normLabel);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelMatches(cellText, labelList) {
  const raw = String(cellText || '');
  const n = normLabel(raw);
  for (const l of labelList) {
    const nl = normLabel(l);
    if (n === nl) return { label: l, remainder: '' };
    if (n.startsWith(nl + ' ')) {
      // Label followed by its value in the same cell ("Year Built: 1988" / "Year Built 1988")
      const words = nl.split(/[ /]+/).filter(Boolean).map(escapeRe);
      const re = new RegExp(`^\\s*${words.join('[\\s./:()#,\\-]*')}[\\s.:#)\\-]*`, 'i');
      const remainder = raw.replace(re, '').trim();
      if (remainder && remainder !== raw.trim()) return { label: l, remainder };
    }
  }
  return null;
}

function isKnownLabelCell(cellText) {
  const n = normLabel(cellText).replace(/\s*:$/, '');
  if (!n) return false;
  if (detectSectionHeading(cellText)) return true;
  return ALL_KNOWN_LABELS.some((l) => n === l || n.startsWith(l + ' '));
}

/* ------------------------------------------------------------------------- */
/* PII stripping                                                             */
/* ------------------------------------------------------------------------- */

const OWNER_CELL_RE = /^(property\s+)?owners?(\s*\(s\))?(\s+(name|names|information|info|of\s+record))?\b|^current\s+owner|^ownership\b|^(mailing|mail)\s*(address|to)\b|^billing\s+address|^in\s+care\s+of\b|^c\/o\b|^care\s+of\b|^grantor\b\s*:|^grantee\b\s*:|^seller\b\s*:|^buyer\b\s*:/i;

/**
 * Removes owner names, mailing addresses and grantor/grantee names.
 * Works at cell level so two-column layouts keep their non-PII column.
 */
export function sanitizeAndStripPii(rawText) {
  const text = normalizePaText(rawText);
  if (!text) return '';

  const out = [];
  let inOwnerBlock = false;
  let section = null;

  for (const line of text.split('\n')) {
    if (!line.trim()) {
      out.push('');
      continue;
    }

    const heading = detectSectionHeading(line);
    if (heading) {
      section = heading;
      inOwnerBlock = heading === 'owner';
      if (heading !== 'owner') out.push(line);
      continue;
    }

    // Sales tables: rebuild rows from recognised tokens only (drops grantor/grantee names)
    if (section === 'sales') {
      const safe = buildSafeSalesLine(line);
      if (safe) out.push(safe);
      continue;
    }

    const cells = splitCells(line);
    const kept = [];
    let dropping = inOwnerBlock;
    let strayCells = 0;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (OWNER_CELL_RE.test(cell)) {
        dropping = true;
        inOwnerBlock = true;
        continue;
      }
      if (isKnownLabelCell(cell)) {
        dropping = false;
        kept.push(cell);
        // keep exactly one value cell after a label while an owner block is open
        if (inOwnerBlock && i + 1 < cells.length && !isKnownLabelCell(cells[i + 1]) && !OWNER_CELL_RE.test(cells[i + 1])) {
          kept.push(cells[i + 1]);
          i++;
        }
        continue;
      }
      if (dropping || inOwnerBlock) {
        strayCells++;
        continue;
      }
      kept.push(cell);
    }

    // An owner block stays open while lines still carry unlabeled (name/address) cells
    if (inOwnerBlock && strayCells === 0 && kept.length > 0 && !cells.some((c) => OWNER_CELL_RE.test(c))) {
      inOwnerBlock = false;
    }

    // Single-line PII fallbacks
    if (kept.length === 0) continue;
    const joined = kept.join(' | ');
    if (/^(P\.?\s*O\.?\s+BOX\s+\d+)/i.test(joined)) continue;
    out.push(joined);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ------------------------------------------------------------------------- */
/* Token recognisers                                                          */
/* ------------------------------------------------------------------------- */

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 };

function validYear(y) {
  return Number.isInteger(y) && y >= MIN_YEAR && y <= MAX_YEAR;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Finds the first date in a string; returns { iso, index, length } or null. */
export function findDate(str) {
  const s = String(str || '');
  const patterns = [
    { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, f: (m) => [Number(m[1]), Number(m[2]), Number(m[3])] },
    { re: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/, f: (m) => [Number(m[3]), Number(m[1]), Number(m[2])] },
    { re: /\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b/, f: (m) => [Number(m[3]) > (CURRENT_YEAR % 100) + 1 ? 1900 + Number(m[3]) : 2000 + Number(m[3]), Number(m[1]), Number(m[2])] },
    { re: /\b(\d{1,2})-([A-Za-z]{3,4})-(\d{2,4})\b/, f: (m) => { const y = m[3].length === 2 ? (Number(m[3]) > (CURRENT_YEAR % 100) + 1 ? 1900 : 2000) + Number(m[3]) : Number(m[3]); return [y, MONTHS[m[2].toUpperCase()], Number(m[1])]; } },
    { re: /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/, f: (m) => [Number(m[3]), MONTHS[m[1].slice(0, 3).toUpperCase()], Number(m[2])] },
    { re: /\b(\d{1,2})\/(\d{4})\b/, f: (m) => [Number(m[2]), Number(m[1]), 1] }
  ];
  let best = null;
  for (const { re, f } of patterns) {
    const m = s.match(re);
    if (!m) continue;
    const [y, mo, d] = f(m);
    if (!validYear(y) || !mo || mo < 1 || mo > 12 || !d || d < 1 || d > 31) continue;
    if (!best || m.index < best.index) {
      best = { iso: `${y}-${pad2(mo)}-${pad2(d)}`, index: m.index, length: m[0].length };
    }
  }
  return best;
}

function parseMoney(str) {
  const m = String(str || '').match(/^\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?\s*$/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseSqftValue(str) {
  const m = String(str || '').match(/^\s*(\d{1,3}(?:,\d{3})+|\d{2,6})\s*(?:s\.?\s*f\.?|sq\.?\s*f(?:ee)?t\.?|square\s+feet)?\s*$/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return n >= 100 && n <= 60000 ? n : null;
}

function parseYearValue(str) {
  const m = String(str || '').match(/^\s*(\d{4})\s*$/);
  if (!m) return null;
  const y = Number(m[1]);
  return validYear(y) ? y : null;
}

function parseSmallInt(str, max = 30) {
  const m = String(str || '').match(/^\s*(\d{1,2})\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= max ? n : null;
}

function parseBathValue(str) {
  const m = String(str || '').match(/^\s*(\d{1,2})(?:\.(\d))?\s*$/);
  if (!m) return null;
  const n = Number(`${m[1]}.${m[2] || 0}`);
  return n >= 0 && n <= 30 ? n : null;
}

const DEED_TYPES = [
  [/\bspecial\s+warranty\s+deed\b|\bSWD\b|\bSPWD\b|\bSP\s*WD\b/i, 'SWD'],
  [/\bwarranty\s+deed\b|\bwar+(anty)?\s*deed\b|\bWTY\s*DEED\b|\bWD\b|\bWRD\b|\bWDE\b/i, 'WD'],
  [/\bquit\s*-?\s*claim(\s+deed)?\b|\bQCD?\b/i, 'QCD'],
  [/\bcert(ificate)?\.?\s+of\s+title\b|\bCET\b|\bCOT\b|\bCT\b/i, 'CT'],
  [/\btrustee'?s?\s+deed\b|\bTRD\b|\bTD\b/i, 'TD'],
  [/\btax\s+deed\b|\bTXD\b/i, 'TAX'],
  [/\bpersonal\s+rep(resentative)?'?s?\.?\s+deed\b|\bPRD?\b/i, 'PRD'],
  [/\bguardian'?s?\s+deed\b|\bGD\b/i, 'GD'],
  [/\bcorrective\s+deed\b|\bCD\b|\bCORR\b/i, 'CD'],
  [/\bagreement\s+for\s+deed\b|\bAFD\b|\bAD\b/i, 'AFD'],
  [/\bdeed\s+in\s+lieu\b|\bDIL\b/i, 'DIL'],
  [/\bfee\s+simple\s+deed\b|\bFSD\b/i, 'FSD'],
  [/\bdeed\b|\bDD\b/i, 'DEED']
];

function findDeedType(str) {
  for (const [re, code] of DEED_TYPES) {
    if (re.test(str)) return code;
  }
  return null;
}

/**
 * Builds a PII-free sales row from a raw line: keeps only date, price, deed type,
 * book/page, instrument number and qualification flag. Header rows are reduced
 * to recognised header words. Everything else (names) is discarded.
 */
function buildSafeSalesLine(line) {
  const row = parseSalesRow(line);
  if (row) {
    return [
      row.saleDate,
      `$${row.salePrice.toLocaleString('en-US')}`,
      row.deedType,
      row.orBook ? `${row.orBook}/${row.orPage}` : null,
      row.instrument ? `Instr ${row.instrument}` : null,
      row.qualified != null ? (row.qualified ? 'Qualified' : 'Unqualified') : null
    ].filter(Boolean).join(' | ');
  }
  const words = splitCells(line).filter((c) => /^(sale\s*)?(date|price|amount|type|deed(\s*type)?|instrument|instr|doc(ument)?\s*(#|no|number)?|cin|book|page|book\/page|or\s*book\/page|qual(ified|ification)?|v\/i|vacant\/improved|reason|code)$/i.test(c));
  return words.length >= 2 ? words.join(' | ') : null;
}

/** Parses one sales-table row. Requires a valid date AND a price. Returns null otherwise. */
export function parseSalesRow(line) {
  let work = String(line || '');
  const date = findDate(work);
  if (!date) return null;
  work = work.slice(0, date.index) + ' ' + work.slice(date.index + date.length);

  // Book/Page (e.g. 12345/678, 1234-0567, Book 1234 Page 567)
  let orBook = null;
  let orPage = null;
  const bp = work.match(/\bbook\s*:?\s*(\d{2,6})\s*,?\s*page\s*:?\s*(\d{1,5})\b/i) ||
    work.match(/\b(?:OR\s*)?(\d{3,6})\s*[\/-]\s*(\d{1,5})\b/);
  if (bp) {
    orBook = bp[1];
    orPage = bp[2];
    work = work.replace(bp[0], ' ');
  }

  // Instrument / CIN (long numeric id)
  let instrument = null;
  const ins = work.match(/\b(?:CIN|instr(?:ument)?\.?|doc(?:ument)?\.?\s*(?:#|no\.?|num(?:ber)?)?)\s*:?\s*#?\s*(\d{6,13})\b/i) ||
    work.match(/(?:^|\|)\s*(\d{8,13})\s*(?:\||$)/);
  if (ins) {
    instrument = ins[1];
    work = work.replace(ins[0], ' | ');
  }

  // Price: prefer "$" amounts, else comma-grouped numbers
  let salePrice = null;
  const dollar = work.match(/\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?/);
  const grouped = work.match(/(?:^|[\s|])(\d{1,3}(?:,\d{3})+)(?:\.\d{2})?(?=[\s|]|$)/);
  if (dollar) salePrice = Number(dollar[1].replace(/,/g, ''));
  else if (grouped) salePrice = Number(grouped[1].replace(/,/g, ''));
  if (salePrice == null || !Number.isFinite(salePrice) || salePrice < 0 || salePrice > 500000000) return null;

  const deedType = findDeedType(work);
  let qualified = null;
  if (/\bunqualified\b|\bdisqualified\b|\bnon-?qual/i.test(work)) qualified = false;
  else if (/\bqualified\b/i.test(work)) qualified = true;

  return {
    saleDate: date.iso,
    sale_date: date.iso,
    salePrice,
    sale_price: salePrice,
    deedType: deedType || null,
    deed_type: deedType || null,
    orBook,
    book: orBook,
    orPage,
    page: orPage,
    instrument,
    qualified
  };
}

/* ------------------------------------------------------------------------- */
/* Line model + section map                                                   */
/* ------------------------------------------------------------------------- */

function buildLineModel(text) {
  const lines = [];
  let section = 'header';
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const heading = detectSectionHeading(line);
    if (heading) {
      section = heading;
      lines.push({ text: line, cells: splitCells(line), section, isHeading: true });
      continue;
    }
    lines.push({ text: line, cells: splitCells(line), section, isHeading: false });
  }
  return lines;
}

/**
 * Finds a labelled value. Looks at: remainder of the label cell, the next cell,
 * and the cell at the same column index on the next line (stacked header/value tables).
 */
function findLabeledValue(lines, labelList, validate, { sections = null, rejectRe = null } = {}) {
  for (let li = 0; li < lines.length; li++) {
    const L = lines[li];
    if (L.isHeading) continue;
    if (sections && !sections.includes(L.section)) continue;
    if (rejectRe && rejectRe.test(L.text)) continue;
    for (let ci = 0; ci < L.cells.length; ci++) {
      const hit = labelMatches(L.cells[ci], labelList);
      if (!hit) continue;
      const candidates = [];
      if (hit.remainder) candidates.push(hit.remainder);
      if (ci + 1 < L.cells.length) candidates.push(L.cells[ci + 1]);
      const next = lines[li + 1];
      const nextOk = next && !next.isHeading && next.section === L.section && !(rejectRe && rejectRe.test(next.text));
      if (nextOk && next.cells.length === L.cells.length) candidates.push(next.cells[ci]);
      else if (nextOk && L.cells.length === 1 && next.cells.length >= 1) candidates.push(next.cells[0]);
      for (const c of candidates) {
        const v = validate(c);
        if (v != null) return { value: v, label: hit.label, raw: c };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* Classifiers (only applied to explicitly labelled values)                   */
/* ------------------------------------------------------------------------- */

export function classifyConstruction(value) {
  const u = String(value || '').toUpperCase();
  if (!u.trim()) return null;
  if (/HARDI|FIBER\s*CEMENT/.test(u)) return 'Wood frame / Hardi-plank';
  if (/WOOD\s*FRAME|FRAME\s*-?\s*WOOD|^FRAME\b|\bWD\s*FR|\bWOOD\b|\bFRAME\b(?!.*(BLOCK|MASONRY|CONC))/.test(u)) return 'Wood frame';
  if (/\bCBS\b|CONC(RETE)?\s*BLOCK|CEMENT\s*BLOCK|\bMASONRY\b|\bBLOCK\b|\bC\.?B\.?S\.?\b|\bCONC\b|STUCCO/.test(u)) return 'CBS';
  if (/STEEL|METAL\s*FRAME/.test(u)) return 'Steel frame';
  if (/BRICK/.test(u)) return 'Brick';
  return null;
}

export function classifyRoofCover(value) {
  const u = String(value || '').toUpperCase();
  if (!u.trim()) return null;
  if (/CEMENT\s*TILE|CONC(RETE)?\s*TILE|CONC\s*TL|CEM\s*TL/.test(u)) return 'Cement tile';
  if (/CLAY|BARREL|SPANISH/.test(u)) return 'Clay tile';
  if (/\bTILE\b/.test(u)) return 'Tile';
  if (/SHINGLE|ASPH|COMP(OSITION)?/.test(u)) return 'Asphalt shingle';
  if (/METAL|STANDING\s*SEAM|ALUM|STEEL/.test(u)) return 'Metal';
  if (/BUILT\s*-?\s*UP|TAR|GRAVEL|ROLL|MEMBRANE|MODIFIED\s*BIT|TPO|RUBBER/.test(u)) return 'Built-up / Membrane';
  if (/SLATE/.test(u)) return 'Slate';
  return null;
}

export function classifyRoofStructure(value) {
  const u = String(value || '').toUpperCase();
  if (!u.trim()) return null;
  if (/GABLE.*HIP|HIP.*GABLE/.test(u)) return 'Gable / Hip';
  if (/\bHIP\b/.test(u)) return 'Hip';
  if (/\bGABLE\b/.test(u)) return 'Gable';
  if (/\bFLAT\b/.test(u)) return 'Flat';
  if (/MANSARD/.test(u)) return 'Mansard';
  if (/SHED/.test(u)) return 'Shed';
  return null;
}

function classifyQuality(value) {
  const s = String(value || '').toUpperCase().trim();
  const q = s.match(/\bQ([1-6])\b/);
  const raw = s.match(/\b([RC][1-7])\b/);
  if (q) return { grade: `Q${q[1]}`, raw: raw ? raw[1] : null };
  if (raw) {
    const n = Math.min(6, Number(raw[1].slice(1)));
    return { grade: `Q${n}`, raw: raw[1] };
  }
  return null;
}

function classifyCondition(value) {
  const s = String(value || '').toUpperCase().trim();
  const c = s.match(/\bC([1-6])\b/);
  if (c) return { rating: `C${c[1]}`, raw: s };
  const map = [
    [/\bEXCELLENT\b|^EX$/, 'C1'], [/\bVERY\s+GOOD\b|^VG$/, 'C2'], [/\bGOOD\b|^GD$/, 'C3'],
    [/\bAVERAGE\b|^AV$|^AVG$/, 'C4'], [/\bFAIR\b|^FR$/, 'C5'], [/\bPOOR\b|^PR$/, 'C6']
  ];
  for (const [re, r] of map) if (re.test(s)) return { rating: r, raw: s };
  return null;
}

/* ------------------------------------------------------------------------- */
/* County / folio / address                                                   */
/* ------------------------------------------------------------------------- */

export function detectCounty(text) {
  const u = String(text || '').toUpperCase();
  if (/BROWARD\s+COUNTY\s+PROPERTY\s+APPRAISER|BCPA\.NET|\bBCPA\b|WEB\.BCPA/.test(u)) return 'Broward';
  if (/MARTIN\s+COUNTY\s+PROPERTY\s+APPRAISER|PA\.MARTIN\.FL\.US|\bMCPA\b|MARTIN\s+COUNTY,?\s+(FL|FLORIDA)/.test(u)) return 'Martin';
  if (/PALM\s+BEACH\s+COUNTY\s+PROPERTY\s+APPRAISER|PBCPAO|PBCGOV|\bPAPA\b/.test(u)) return 'Palm Beach';
  if (/\b\d{2}-\d{2}-\d{2}-\d{3}-\d{3}-\d{5}-\d\b/.test(u)) return 'Martin';
  if (/\b\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-\d{4}\b/.test(u)) return 'Palm Beach';
  if (/\b(4[7-9]|5[0-2])\d{10}\b/.test(u)) return 'Broward';
  if (/\bBROWARD\b/.test(u)) return 'Broward';
  if (/\bMARTIN\s+COUNTY\b/.test(u)) return 'Martin';
  if (/\bPALM\s+BEACH\s+COUNTY\b/.test(u)) return 'Palm Beach';
  return null;
}

export function parseFolio(text) {
  const t = String(text || '');
  const mMartin = t.match(/\b\d{2}-\d{2}-\d{2}-\d{3}-\d{3}-\d{5}-\d\b/);
  if (mMartin) return mMartin[0];
  const mPB = t.match(/\b\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-\d{4}\b/);
  if (mPB) return mPB[0];
  // BCPA displays folios grouped: "5041 02 03 0600" / "5041-02-03-0600"
  const mBcpaGrouped = t.match(/\b((?:4[7-9]|5[0-2])\d{2})[\s-](\d{2})[\s-](\d{2})[\s-](\d{4})\b/);
  if (mBcpaGrouped) return mBcpaGrouped.slice(1).join('');
  const labeled = t.match(/(?:folio|parcel\s*id|parcel\s*number|property\s*id|pcn)\s*(?:number|#|no\.?)?\s*[:|]?\s*(\d{12}|\d{17})\b/i);
  if (labeled) return labeled[1];
  const m12 = t.match(/\b(?:4[7-9]|5[0-2])\d{10}\b/);
  if (m12) return m12[0];
  const m17 = t.match(/\b\d{17}\b/);
  if (m17) return m17[0];
  return null;
}

function validateAddress(v) {
  const s = String(v || '').trim();
  if (!/^\d{1,6}\s+[A-Za-z0-9]/.test(s)) return null;
  if (s.length > 80) return null;
  return s;
}

/* ------------------------------------------------------------------------- */
/* Building info                                                              */
/* ------------------------------------------------------------------------- */

export function parseBuildingInfo(text, linesArg = null, sources = {}) {
  const lines = linesArg || buildLineModel(text);
  const info = {
    yearBuilt: null,
    effectiveYearBuilt: null,
    livingSqft: null,
    livingSqftLabel: null,
    adjustedBuildingSqft: null,
    beds: null,
    fullBaths: null,
    halfBaths: null,
    baths: null,
    stories: null,
    construction: null,
    constructionRaw: null,
    roofCover: null,
    roofCoverRaw: null,
    roofStructure: null,
    roofStructureRaw: null,
    qualityGrade: null,
    rawQualityCode: null,
    conditionRating: null,
    rawConditionCode: null
  };

  const nonSales = ['header', 'building', 'other'];
  // Feature rows (pool/dock/etc.) carry their own "Year Built" / area — never let them fill house fields.
  const FEATURE_ROW_RE = /\b(pool|spa|dock|pier|boat|lift|davit|seawall|fence|patio|deck|shed|screen|enclosure|driveway|tiki|canopy|carport|slab|paving|sprinkler|gazebo)\b/i;
  const record = (field, hit) => {
    if (hit) sources[`buildingInfo.${field}`] = hit.label;
  };

  // BCPA "Eff./Act. Year Built: 1990/1985"
  const effAct = findLabeledValue(lines, LABELS.effActYear, (v) => {
    const m = String(v).match(/^\s*(\d{4})\s*\/\s*(\d{4})\s*$/);
    if (!m) return null;
    const eff = Number(m[1]);
    const act = Number(m[2]);
    return validYear(eff) && validYear(act) ? { eff, act } : null;
  }, { sections: nonSales, rejectRe: FEATURE_ROW_RE });
  if (effAct) {
    info.yearBuilt = effAct.value.act;
    info.effectiveYearBuilt = effAct.value.eff;
    record('yearBuilt', effAct);
    record('effectiveYearBuilt', effAct);
  }

  if (info.yearBuilt == null) {
    const yb = findLabeledValue(lines, LABELS.yearBuilt, parseYearValue, { sections: nonSales, rejectRe: FEATURE_ROW_RE });
    if (yb) { info.yearBuilt = yb.value; record('yearBuilt', yb); }
  }
  if (info.effectiveYearBuilt == null) {
    const ey = findLabeledValue(lines, LABELS.effYearBuilt, parseYearValue, { sections: nonSales, rejectRe: FEATURE_ROW_RE });
    if (ey) { info.effectiveYearBuilt = ey.value; record('effectiveYearBuilt', ey); }
  }

  const lv = findLabeledValue(lines, LABELS.livingSqft, parseSqftValue, { sections: nonSales, rejectRe: FEATURE_ROW_RE });
  if (lv) {
    info.livingSqft = lv.value;
    info.livingSqftLabel = lv.label;
    record('livingSqft', lv);
  }
  const adj = findLabeledValue(lines, LABELS.adjBldgSqft, (v) => {
    const m = String(v).match(/^\s*(\d{1,3}(?:,\d{3})+|\d{3,6})(?:\s*[,/]\s*(\d{1,3}(?:,\d{3})+|\d{3,6}))?\s*$/);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  }, { sections: nonSales, rejectRe: FEATURE_ROW_RE });
  if (adj) { info.adjustedBuildingSqft = adj.value; record('adjustedBuildingSqft', adj); }

  // BCPA "Units/Beds/Baths 1/3/2"
  const ubb = findLabeledValue(lines, LABELS.unitsBedsBaths, (v) => {
    const m = String(v).match(/^\s*(\d{1,3})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2}(?:\.\d)?)\s*$/);
    return m ? { units: Number(m[1]), beds: Number(m[2]), baths: Number(m[3]) } : null;
  }, { sections: nonSales, rejectRe: FEATURE_ROW_RE });
  if (ubb) {
    info.beds = ubb.value.beds;
    info.baths = ubb.value.baths;
    info.fullBaths = Math.floor(ubb.value.baths);
    info.halfBaths = ubb.value.baths % 1 >= 0.5 ? 1 : 0;
    record('beds', ubb);
    record('baths', ubb);
  }

  if (info.beds == null) {
    const b = findLabeledValue(lines, LABELS.beds, (v) => parseSmallInt(v, 30), { sections: nonSales, rejectRe: FEATURE_ROW_RE });
    if (b) { info.beds = b.value; record('beds', b); }
  }
  if (info.baths == null) {
    const fb = findLabeledValue(lines, LABELS.fullBaths, (v) => parseSmallInt(v, 30), { sections: nonSales, rejectRe: FEATURE_ROW_RE });
    const hb = findLabeledValue(lines, LABELS.halfBaths, (v) => parseSmallInt(v, 30), { sections: nonSales, rejectRe: FEATURE_ROW_RE });
    if (fb) { info.fullBaths = fb.value; record('fullBaths', fb); }
    if (hb) { info.halfBaths = hb.value; record('halfBaths', hb); }
    if (fb) {
      info.baths = fb.value + (hb ? hb.value * 0.5 : 0);
    } else {
      const tb = findLabeledValue(lines, LABELS.baths, parseBathValue, { sections: nonSales, rejectRe: FEATURE_ROW_RE });
      if (tb) {
        info.baths = tb.value;
        info.fullBaths = Math.floor(tb.value);
        info.halfBaths = tb.value % 1 >= 0.5 ? 1 : 0;
        record('baths', tb);
      }
    }
  }

  const st = findLabeledValue(lines, LABELS.stories, (v) => {
    const m = String(v).match(/^\s*(\d(?:\.\d)?)\s*$/);
    return m && Number(m[1]) > 0 && Number(m[1]) <= 6 ? Number(m[1]) : null;
  }, { sections: nonSales, rejectRe: FEATURE_ROW_RE });
  if (st) { info.stories = st.value; record('stories', st); }

  const con = findLabeledValue(lines, LABELS.construction, (v) => (classifyConstruction(v) ? String(v).trim() : null), { sections: nonSales, rejectRe: FEATURE_ROW_RE });
  if (con) {
    info.construction = classifyConstruction(con.value);
    info.constructionRaw = con.value;
    record('construction', con);
  }

  const rc = findLabeledValue(lines, LABELS.roofCover, (v) => (classifyRoofCover(v) ? String(v).trim() : null), { sections: nonSales, rejectRe: FEATURE_ROW_RE });
  if (rc) {
    info.roofCover = classifyRoofCover(rc.value);
    info.roofCoverRaw = rc.value;
    record('roofCover', rc);
  }

  const rs = findLabeledValue(lines, LABELS.roofStructure, (v) => (classifyRoofStructure(v) ? String(v).trim() : null), { sections: nonSales, rejectRe: FEATURE_ROW_RE });
  if (rs) {
    info.roofStructure = classifyRoofStructure(rs.value);
    info.roofStructureRaw = rs.value;
    record('roofStructure', rs);
  }

  const q = findLabeledValue(lines, LABELS.quality, (v) => classifyQuality(v), { sections: nonSales, rejectRe: FEATURE_ROW_RE });
  if (q) {
    info.qualityGrade = q.value.grade;
    info.rawQualityCode = q.value.raw;
    record('qualityGrade', q);
  }
  const c = findLabeledValue(lines, LABELS.condition, (v) => classifyCondition(v), { sections: nonSales, rejectRe: FEATURE_ROW_RE });
  if (c) {
    info.conditionRating = c.value.rating;
    info.rawConditionCode = c.value.raw;
    record('conditionRating', c);
  }

  return info;
}

/* ------------------------------------------------------------------------- */
/* Extra features (pool / dock / lift / fireplace)                            */
/* ------------------------------------------------------------------------- */

function mapHeader(cells, defs) {
  const map = {};
  cells.forEach((c, idx) => {
    const n = normLabel(c);
    for (const [key, re] of Object.entries(defs)) {
      if (map[key] == null && re.test(n)) {
        map[key] = idx;
        break;
      }
    }
  });
  return map;
}

const FEATURE_HEADER_DEFS = {
  year: /^(year|yr|eff year|year built|yr blt|actual year|act yr)\b/,
  area: /^(area|units|size|sq ?ft|sf|square feet|dimensions?|qty|quantity|total area|measure)\b/,
  desc: /^(desc|description|feature|item|type|code description)\b/
};

function readFeatureRow(L, header) {
  const cells = L.cells;
  let year = null;
  let area = null;
  if (header && header.cellCount === cells.length) {
    if (header.map.year != null) year = parseYearValue(cells[header.map.year]);
    if (header.map.area != null) {
      const a = String(cells[header.map.area]).match(/(\d{1,3}(?:,\d{3})+|\d+)/);
      area = a ? Number(a[1].replace(/,/g, '')) : null;
    }
    return { year, area, mapped: true };
  }
  // Heuristic: explicit "SF" amounts are areas; a single 4-digit year-range number is a year.
  const text = L.text;
  const sf = text.match(/(\d{1,3}(?:,\d{3})+|\d{1,5})\s*(?:s\.?\s*f\.?\b|sq\.?\s*f(?:ee)?t\b|square\s+feet)/i);
  if (sf) area = Number(sf[1].replace(/,/g, ''));
  const numbers = (text.replace(sf ? sf[0] : '', ' ').match(/\b\d{1,3}(?:,\d{3})+\b|\b\d+\b/g) || []).map((n) => Number(n.replace(/,/g, '')));
  const years = numbers.filter((n) => validYear(n));
  if (years.length === 1) year = years[0];
  if (area == null) {
    const others = numbers.filter((n) => !validYear(n) && n >= 10);
    if (others.length === 1 && years.length <= 1) area = others[0];
  }
  return { year, area, mapped: false };
}

export function parseFeatures(text, linesArg = null, sources = {}) {
  const lines = linesArg || buildLineModel(text);
  const features = {
    hasPool: null,
    pool: null,
    poolType: null,
    poolYear: null,
    poolSqft: null,
    hasDock: null,
    dock: null,
    dockSqft: null,
    dockYear: null,
    hasBoatLift: null,
    boatLift: null,
    boatLiftYear: null,
    hasFireplace: null,
    fireplaces: null,
    screenEnclosure: null
  };

  const featureLines = lines.filter((L) => !L.isHeading && (L.section === 'features' || L.section === 'building'));
  let header = null;

  for (const L of featureLines) {
    const n = normLabel(L.text);
    const mapped = mapHeader(L.cells, FEATURE_HEADER_DEFS);
    if (L.section === 'features' && (mapped.year != null || mapped.area != null) && mapped.desc != null && !/\d{3,}/.test(L.text)) {
      header = { map: mapped, cellCount: L.cells.length };
      continue;
    }

    const isPool = /\b(swimming\s+)?pool\b/.test(n) && !/\b(enclos|screen|cage|deck|heater|fence|patio|bath|house|equip)/.test(n);
    const isDock = /\b(boat\s+)?dock\b|\bpier\b|\bboat\s+slip\b/.test(n);
    const isLift = /\bboat\s*lift\b|\bdavit\b/.test(n) || (/\blift\b/.test(n) && L.section === 'features');
    const isScreen = /\bscreen(ed)?\s+(enclosure|encl|porch|room|cage)\b|\bpool\s+enclos/.test(n);
    const isFireplace = /\bfireplace|\bfire\s+place|\bfp\b/.test(n);

    // A "Pool: Yes/No" style label in the building section is also explicit
    if (L.section === 'building' && !isPool && !isDock && !isFireplace && !isScreen) continue;

    if (isPool && features.hasPool == null) {
      const r = readFeatureRow(L, header);
      if (/\bpool\b\s*[:|]?\s*(no|none|n)\b/i.test(L.text)) {
        features.hasPool = false;
        features.pool = false;
      } else {
        features.hasPool = true;
        features.pool = true;
        features.poolYear = r.year;
        features.poolSqft = r.area;
        if (/gunite|concrete|in-?ground/i.test(L.text)) features.poolType = 'In-ground';
      }
      sources['features.pool'] = L.section === 'features' ? 'Extra features' : 'Building';
    }
    if (isDock && (features.hasDock == null || features.dockSqft == null)) {
      const r = readFeatureRow(L, header);
      features.hasDock = true;
      features.dock = true;
      features.dockSqft = features.dockSqft ?? r.area;
      features.dockYear = features.dockYear ?? r.year;
      sources['features.dock'] = 'Extra features';
      if (/\bboat\s*lift\b|\bdavit\b/i.test(L.text)) {
        features.hasBoatLift = true;
        features.boatLift = true;
      }
    }
    if (isLift && !isDock && features.hasBoatLift !== true) {
      const r = readFeatureRow(L, header);
      features.hasBoatLift = true;
      features.boatLift = true;
      features.boatLiftYear = r.year;
      sources['features.boatLift'] = 'Extra features';
    }
    if (isScreen) {
      features.screenEnclosure = true;
    }
    if (isFireplace) {
      features.hasFireplace = true;
      const cnt = L.text.match(/fire\s*places?\s*[:|]?\s*(\d{1,2})\b/i);
      features.fireplaces = (features.fireplaces || 0) + (cnt ? Number(cnt[1]) : 1);
    }
  }

  return features;
}

/* ------------------------------------------------------------------------- */
/* Sales history                                                              */
/* ------------------------------------------------------------------------- */

export function parseSalesHistory(text, linesArg = null) {
  const lines = linesArg || buildLineModel(text);
  const sales = [];
  const seen = new Set();
  for (const L of lines) {
    if (L.isHeading || L.section !== 'sales') continue;
    const row = parseSalesRow(L.text);
    if (!row) continue;
    const key = `${row.saleDate}|${row.salePrice}|${row.orBook || ''}|${row.orPage || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sales.push(row);
  }
  return sales.sort((a, b) => b.saleDate.localeCompare(a.saleDate));
}

/* ------------------------------------------------------------------------- */
/* Value history                                                              */
/* ------------------------------------------------------------------------- */

const VALUE_HEADER_DEFS = {
  year: /^(tax\s+)?(year|yr|roll\s+year)\b/,
  land: /^(total\s+)?land(\s+value)?\b(?!\s*use)/,
  imp: /^(building|bldg|improvement|impr|improvements|building\/improvement|bldg\/impr)\b/,
  xf: /^(extra\s+feature|xfob|misc|other\s+improvement)/,
  just: /^(just|market|just\/market|total\s+market|total\s+just|total\s+value)\b/,
  assessed: /^(assessed|assessed\/soh|soh|capped|school\s+assessed)\b/,
  taxable: /^(taxable|county\s+taxable)\b/
};

function moneyCells(cells) {
  return cells.map((c) => parseMoney(c));
}

function approxEqual(a, b, tolPct = 0.03) {
  if (a == null || b == null) return false;
  if (b === 0) return a === 0;
  return Math.abs(a - b) / Math.abs(b) <= tolPct;
}

export function parseValueHistory(text, linesArg = null) {
  const lines = linesArg || buildLineModel(text);
  const byYear = new Map();
  let header = null;

  for (const L of lines) {
    if (L.isHeading || L.section !== 'values') continue;

    const mapped = mapHeader(L.cells, VALUE_HEADER_DEFS);
    if (mapped.year != null && (mapped.land != null || mapped.just != null || mapped.imp != null) && !/\$|\d{2},\d{3}/.test(L.text)) {
      header = { map: mapped, cellCount: L.cells.length };
      continue;
    }

    const yearCell = L.cells[0] ? L.cells[0].match(/^(\d{4})\b/) : null;
    if (!yearCell) continue;
    const year = Number(yearCell[1]);
    if (!validYear(year) || year < 1950) continue;

    // Labelled cells ("Land: $400,000 | Imp: $800,000 | Just: $1,200,000")
    const labelled = {};
    for (const c of L.cells.slice(1)) {
      const m = c.match(/^([A-Za-z\/ ]+):\s*(.+)$/);
      if (!m) continue;
      const key = Object.entries(VALUE_HEADER_DEFS).find(([, re]) => re.test(normLabel(m[1])))?.[0];
      const val = parseMoney(m[2]);
      if (key && val != null) labelled[key] = val;
    }

    let land = null;
    let imp = null;
    let just = null;
    let confident = false;

    if (Object.keys(labelled).length >= 2) {
      land = labelled.land ?? null;
      imp = labelled.imp ?? null;
      just = labelled.just ?? null;
      confident = true;
    } else if (header && header.cellCount === L.cells.length) {
      const vals = moneyCells(L.cells);
      land = header.map.land != null ? vals[header.map.land] : null;
      imp = header.map.imp != null ? vals[header.map.imp] : null;
      just = header.map.just != null ? vals[header.map.just] : null;
      confident = land != null || imp != null || just != null;
    } else {
      // No reliable header: accept only when Land + Improvement ≈ Just
      const vals = moneyCells(L.cells.slice(1)).filter((v) => v != null);
      if (vals.length >= 3 && approxEqual(vals[0] + vals[1], vals[2])) {
        [land, imp, just] = vals;
        confident = true;
      } else if (header && vals.length >= 3) {
        // header present but cell counts differ (wrapped cells) — map money values by header order
        const order = Object.entries(header.map)
          .filter(([k]) => k !== 'year')
          .sort((a, b) => a[1] - b[1])
          .map(([k]) => k);
        const assigned = {};
        order.forEach((k, i) => { if (vals[i] != null) assigned[k] = vals[i]; });
        const sumOk = assigned.land != null && assigned.imp != null && assigned.just != null &&
          (approxEqual(assigned.land + assigned.imp, assigned.just) ||
            (assigned.xf != null && approxEqual(assigned.land + assigned.imp + assigned.xf, assigned.just)));
        if (sumOk) {
          land = assigned.land;
          imp = assigned.imp;
          just = assigned.just;
          confident = true;
        }
      }
    }

    if (!confident) continue;
    if (imp == null && land != null && just != null && just >= land) imp = just - land;
    if (!byYear.has(year)) {
      byYear.set(year, { rollYear: year, year, landValue: land, improvementValue: imp, justValue: just });
    }
  }

  return Array.from(byYear.values()).sort((a, b) => b.rollYear - a.rollYear);
}

/* ------------------------------------------------------------------------- */
/* Sub-areas                                                                  */
/* ------------------------------------------------------------------------- */

const SUBAREA_HEADER_DEFS = {
  code: /^(code|sub\s*area|subarea|type|area\s+type|abbr)\b/,
  desc: /^(desc|description)\b/,
  finished: /^(finished|heated|living|living\s+area|under\s+air|adjusted|adj|effective)\b/,
  gross: /^(gross|area|total|sq\s*ft|sf|actual|square\s+feet)\b/
};

const SUBAREA_DESCRIPTIONS = {
  BAS: 'Base / finished living area', FUS: 'Finished upper story', FOP: 'Finished open porch',
  FSP: 'Finished screen porch', FEP: 'Finished enclosed porch', FGR: 'Finished garage', GRG: 'Garage',
  UOP: 'Unfinished open porch', USP: 'Unfinished screen porch', CPT: 'Carport', PAT: 'Patio',
  WDK: 'Wood deck', CAN: 'Canopy', UST: 'Unfinished storage', FST: 'Finished storage', BAL: 'Balcony'
};

export function parseSubAreas(text, linesArg = null) {
  const lines = linesArg || buildLineModel(text);
  const out = [];
  let header = null;
  for (const L of lines) {
    if (L.isHeading || L.section !== 'subareas') continue;
    const mapped = mapHeader(L.cells, SUBAREA_HEADER_DEFS);
    if ((mapped.finished != null || mapped.gross != null) && !/\d{2,}/.test(L.text)) {
      header = { map: mapped, cellCount: L.cells.length };
      continue;
    }
    const codeIdx = L.cells.findIndex((c) => /^[A-Z]{3}\d?$/.test(c));
    if (codeIdx < 0) continue;
    const code = L.cells[codeIdx];
    let gross = null;
    let finished = null;
    if (header && header.cellCount === L.cells.length) {
      if (header.map.gross != null) gross = parseMoney(L.cells[header.map.gross]);
      if (header.map.finished != null) finished = parseMoney(L.cells[header.map.finished]);
    } else {
      const nums = L.cells.slice(codeIdx + 1).map((c) => parseMoney(c.replace(/\s*(sf|sq\.?\s*ft)\.?$/i, ''))).filter((v) => v != null);
      if (nums.length === 1) gross = nums[0];
      else continue; // ambiguous multi-number row without header
    }
    if ((gross == null || gross <= 0) && (finished == null || finished <= 0)) continue;
    const descCell = L.cells.find((c, i) => i !== codeIdx && /[a-z]/i.test(c) && parseMoney(c) == null);
    out.push({
      code,
      description: descCell || SUBAREA_DESCRIPTIONS[code] || code,
      sqft: gross ?? finished,
      grossSqft: gross,
      finishedSqft: finished
    });
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Neighborhood / legal / address                                             */
/* ------------------------------------------------------------------------- */

export function parseNeighborhoodCode(text, linesArg = null) {
  const lines = linesArg || buildLineModel(text);
  const hit = findLabeledValue(lines, LABELS.neighborhood, (v) => {
    const s = String(v).trim();
    return /^[A-Z0-9][A-Z0-9.\-]{1,11}$/i.test(s) && /\d/.test(s) ? s : null;
  });
  return hit ? hit.value : null;
}

export function parseLegalDescription(text, linesArg = null) {
  const lines = linesArg || buildLineModel(text);
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L.isHeading && L.section === 'legal') {
      const parts = [];
      for (let j = i + 1; j < lines.length && parts.length < 4; j++) {
        if (lines[j].isHeading) break;
        parts.push(lines[j].cells.join(' '));
      }
      const v = parts.join(' ').replace(/\s+/g, ' ').trim();
      if (v.length >= 6) return v.slice(0, 400);
    }
    for (let ci = 0; ci < L.cells.length; ci++) {
      const hit = labelMatches(L.cells[ci], LABELS.legal);
      if (!hit) continue;
      const v = (hit.remainder || L.cells[ci + 1] || '').trim();
      if (v.length >= 6 && /[A-Za-z]/.test(v)) return v.slice(0, 400);
    }
  }
  return null;
}

export function parseAddress(text, linesArg = null) {
  const lines = linesArg || buildLineModel(text);
  const hit = findLabeledValue(lines, LABELS.address, validateAddress, { sections: ['header', 'building', 'land', 'other', 'legal'] });
  return hit ? hit.value : null;
}

/* ------------------------------------------------------------------------- */
/* Orchestrator                                                               */
/* ------------------------------------------------------------------------- */

const REPORTED_FIELDS = [
  'folio', 'county', 'address',
  'buildingInfo.livingSqft', 'buildingInfo.yearBuilt', 'buildingInfo.effectiveYearBuilt',
  'buildingInfo.beds', 'buildingInfo.baths', 'buildingInfo.stories',
  'buildingInfo.construction', 'buildingInfo.roofCover', 'buildingInfo.roofStructure',
  'buildingInfo.qualityGrade', 'buildingInfo.conditionRating',
  'features.pool', 'features.dock', 'features.boatLift',
  'salesHistory', 'valueHistory', 'subAreas', 'neighborhoodCode', 'legalDescription'
];

function getPath(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

/**
 * Parses a Florida Property Appraiser record (raw or extracted text) into structured,
 * PII-free property details. Unconfident fields are null and listed in `notFound`.
 */
export function parsePaRecordText(text, options = {}) {
  const sanitized = sanitizeAndStripPii(text);
  const lines = buildLineModel(sanitized);
  const todayIso = new Date().toISOString().split('T')[0];
  const sourceLabel = `PA record PDF, ${options.sourceDate || todayIso}`;
  const fieldSources = {};

  const buildingInfo = parseBuildingInfo(sanitized, lines, fieldSources);
  const features = parseFeatures(sanitized, lines, fieldSources);
  const subAreas = parseSubAreas(sanitized, lines);

  // Living area from finished sub-areas only when no explicit label was found
  const finishedSum = subAreas.reduce((acc, s) => acc + (Number(s.finishedSqft) || 0), 0);
  buildingInfo.livingSqftFromSubAreas = finishedSum > 0 ? finishedSum : null;
  if (buildingInfo.livingSqft == null && finishedSum > 0) {
    buildingInfo.livingSqft = finishedSum;
    buildingInfo.livingSqftLabel = 'Sum of finished sub-areas';
    fieldSources['buildingInfo.livingSqft'] = 'Sum of finished sub-areas';
  }

  const result = {
    source: sourceLabel,
    parsedAt: new Date().toISOString(),
    county: detectCounty(sanitized),
    folio: parseFolio(sanitized),
    address: parseAddress(sanitized, lines),
    buildingInfo,
    features,
    salesHistory: parseSalesHistory(sanitized, lines),
    valueHistory: parseValueHistory(sanitized, lines),
    subAreas,
    neighborhoodCode: parseNeighborhoodCode(sanitized, lines),
    legalDescription: parseLegalDescription(sanitized, lines),
    fieldSources,
    sectionsFound: Array.from(new Set(lines.filter((l) => l.isHeading).map((l) => l.section)))
  };

  result.notFound = REPORTED_FIELDS.filter((p) => {
    const v = getPath(result, p);
    return v == null || (Array.isArray(v) && v.length === 0);
  });

  return result;
}
