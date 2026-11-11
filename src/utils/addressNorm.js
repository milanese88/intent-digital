/**
 * Shared Address Normalization Utility for Intent Digital Investor Studio
 *
 * Normalizes property addresses across client and server to match
 * Florida County Property Appraiser and USPS standards.
 */

// USPS Standard Suffix Map
export const USPS_SUFFIX_MAP = {
  AVENUE: 'AVE',
  AVE: 'AVE',
  STREET: 'ST',
  ST: 'ST',
  STR: 'ST',
  TERRACE: 'TER',
  TER: 'TER',
  TERR: 'TER',
  COURT: 'CT',
  CT: 'CT',
  PLACE: 'PL',
  PL: 'PL',
  DRIVE: 'DR',
  DR: 'DR',
  DRV: 'DR',
  ROAD: 'RD',
  RD: 'RD',
  BOULEVARD: 'BLVD',
  BLVD: 'BLVD',
  BOUL: 'BLVD',
  LANE: 'LN',
  LN: 'LN',
  CIRCLE: 'CIR',
  CIR: 'CIR',
  CIRC: 'CIR',
  WAY: 'WAY',
  PARKWAY: 'PKWY',
  PKWY: 'PKWY',
  HIGHWAY: 'HWY',
  HWY: 'HWY',
  TRAIL: 'TRL',
  TRL: 'TRL',
  ALLEY: 'ALY',
  ALY: 'ALY',
  CAUSEWAY: 'CSWY',
  CSWY: 'CSWY'
};

// Compass Directions Map
export const DIRECTION_MAP = {
  NORTHWEST: 'NW',
  NORTHEAST: 'NE',
  SOUTHWEST: 'SW',
  SOUTHEAST: 'SE',
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W'
};

/**
 * Normalizes a raw address string.
 *
 * Returns:
 * - number: House/building number (e.g. '409')
 * - street: Normalized street name (e.g. 'NW 18 AVE')
 * - normalized: Full normalized address ('409 NW 18 AVE')
 * - zip: 5-digit zip code if detected (or null)
 * - city: City name if detected (or null)
 */
export function normalizeAddress(raw) {
  if (!raw || typeof raw !== 'string') {
    return {
      number: '',
      street: '',
      normalized: '',
      zip: null,
      city: null
    };
  }

  let str = raw.trim();

  // 1. Extract 5-digit zip code (at end of string or preceded by FL / comma)
  let zip = null;
  if (/^\d{5}$/.test(str)) {
    zip = str;
    str = '';
  } else {
    const endMatch = str.match(/(?:,\s*|\bFL\b\s*|\bFLORIDA\b\s*|\s+)(\d{5})(?:-\d{4})?\s*$/i);
    if (endMatch) {
      zip = endMatch[1];
      str = str.slice(0, endMatch.index).trim();
    } else {
      const midMatch = str.match(/(?:,\s*|\bFL\b\s*|\bFLORIDA\b\s*)(\d{5})\b/i);
      if (midMatch) {
        zip = midMatch[1];
        str = str.replace(midMatch[0], ' ').trim();
      }
    }
  }

  // 2. Drop unit / apartment text
  str = str.replace(/(?:,\s*)?(?:#|\bapt\.?|\bunit\b|\bste\.?|\bsuite\b|\bbldg\b|\bbuilding\b|\bdept\b|\bfl\b|\bfloor\b|\brm\b|\broom\b|\blot\b|\bspace\b)[\s#-]*[a-z0-9-]+.*$/i, ' ');

  // 3. Drop state mentions
  str = str.replace(/\b(?:FL|FLORIDA)\b/gi, ' ');

  // 4. Handle commas: segment before the first comma is typically the street address
  let city = null;
  if (str.includes(',')) {
    const parts = str.split(',').map(p => p.trim()).filter(Boolean);
    str = parts[0] || '';
    if (parts.length > 1) {
      city = parts[1].replace(/[^a-zA-Z\s]/g, '').trim().toUpperCase();
    }
  }

  // 5. Directional dot normalization (e.g. N.W. -> NW, S.W. -> SW)
  str = str
    .replace(/\bN[\.\s]*W\.?\b/gi, 'NW')
    .replace(/\bN[\.\s]*E\.?\b/gi, 'NE')
    .replace(/\bS[\.\s]*W\.?\b/gi, 'SW')
    .replace(/\bS[\.\s]*E\.?\b/gi, 'SE')
    .replace(/\bNORTHWEST\b/gi, 'NW')
    .replace(/\bNORTHEAST\b/gi, 'NE')
    .replace(/\bSOUTHWEST\b/gi, 'SW')
    .replace(/\bSOUTHEAST\b/gi, 'SE')
    .replace(/\bNORTH\b/gi, 'N')
    .replace(/\bSOUTH\b/gi, 'S')
    .replace(/\bEAST\b/gi, 'E')
    .replace(/\bWEST\b/gi, 'W');

  // 6. Remove punctuation
  str = str.replace(/[,;:\.\#\/\\-]/g, ' ');

  // 7. Tokenize
  const rawTokens = str.trim().split(/\s+/).filter(Boolean);

  // Normalize tokens (directions, ordinals, suffixes)
  const normTokens = rawTokens.map(token => {
    const upper = token.toUpperCase();
    if (DIRECTION_MAP[upper]) return DIRECTION_MAP[upper];
    if (USPS_SUFFIX_MAP[upper]) return USPS_SUFFIX_MAP[upper];

    // Ordinal numbers: 18th -> 18, 1st -> 1, 2nd -> 2, 3rd -> 3
    const ordMatch = upper.match(/^(\d+)(ST|ND|RD|TH)$/);
    if (ordMatch) return ordMatch[1];

    return upper;
  });

  // If city was not determined via comma, check if tokens contain a suffix followed by city words
  if (!city && normTokens.length > 3) {
    let suffixIdx = -1;
    for (let i = 1; i < normTokens.length; i++) {
      if (Object.values(USPS_SUFFIX_MAP).includes(normTokens[i])) {
        // If followed by directional like 'CIR S', suffixIdx includes the directional
        if (i + 1 < normTokens.length && ['N', 'S', 'E', 'W'].includes(normTokens[i + 1])) {
          suffixIdx = i + 1;
        } else {
          suffixIdx = i;
        }
        break;
      }
    }
    if (suffixIdx !== -1 && suffixIdx < normTokens.length - 1) {
      city = normTokens.slice(suffixIdx + 1).join(' ');
      normTokens.splice(suffixIdx + 1);
    }
  }

  // 8. Split house number from street
  let number = '';
  let streetTokens = normTokens;

  if (normTokens.length > 0 && /^\d+/.test(normTokens[0])) {
    number = normTokens[0];
    streetTokens = normTokens.slice(1);
  }

  const street = streetTokens.join(' ').trim();
  const normalized = number ? `${number} ${street}`.trim() : street;

  return {
    number,
    street,
    normalized,
    zip,
    city
  };
}
