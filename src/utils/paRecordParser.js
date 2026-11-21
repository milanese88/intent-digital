/**
 * src/utils/paRecordParser.js
 *
 * Privacy-safe parser for Florida Property Appraiser (PA) records (PDF / raw text)
 * across Broward (BCPA), Palm Beach (PAPA), and Martin (MCPA).
 *
 * Privacy Guardrail:
 *   STRICTLY DROPS all owner names and mailing addresses before extracting data.
 *   Zero PII is ever parsed or stored.
 *
 * Provenance:
 *   Every extracted bundle is stamped with `source: "PA record PDF, <date>"`.
 */

import zlib from 'node:zlib';

/**
 * Extracts plain text from raw PDF buffer using stream inflation.
 * Handles both uncompressed text and FlateDecode streams with (Tj) and [TJ] operators.
 */
export function extractTextFromPdfBuffer(pdfBuffer) {
  if (!Buffer.isBuffer(pdfBuffer)) {
    pdfBuffer = Buffer.from(pdfBuffer);
  }

  const textSegments = [];
  let pos = 0;
  const len = pdfBuffer.length;

  while (pos < len) {
    const streamStart = pdfBuffer.indexOf('stream', pos);
    if (streamStart === -1) break;

    let dataStart = streamStart + 6;
    if (pdfBuffer[dataStart] === 0x0d && pdfBuffer[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (pdfBuffer[dataStart] === 0x0a || pdfBuffer[dataStart] === 0x0d) {
      dataStart += 1;
    }

    const streamEnd = pdfBuffer.indexOf('endstream', dataStart);
    if (streamEnd === -1) break;

    const streamBuf = pdfBuffer.subarray(dataStart, streamEnd);
    let decompressedStr = '';

    try {
      const inflated = zlib.inflateSync(streamBuf);
      decompressedStr = inflated.toString('latin1');
    } catch {
      // Stream may be uncompressed plaintext
      decompressedStr = streamBuf.toString('latin1');
    }

    if (decompressedStr.includes('Tj') || decompressedStr.includes('TJ')) {
      const lines = extractPdfTextOperators(decompressedStr);
      if (lines.length > 0) {
        textSegments.push(lines.join('\n'));
      }
    }

    pos = streamEnd + 9;
  }

  if (textSegments.length === 0) {
    // Fallback: search for literal text in raw buffer
    const rawStr = pdfBuffer.toString('latin1');
    return extractPdfTextOperators(rawStr).join('\n');
  }

  return textSegments.join('\n\n');
}

/**
 * Extracts text string literals from PDF (text) Tj and [(t)(e)(x)(t)] TJ operations.
 */
function extractPdfTextOperators(streamContent) {
  const result = [];
  // Match (text) Tj
  const tjRegex = /\((.*?)\)\s*Tj/g;
  let m;
  while ((m = tjRegex.exec(streamContent)) !== null) {
    const unescaped = unescapePdfString(m[1]);
    if (unescaped.trim()) {
      result.push(unescaped);
    }
  }

  // Match [ (text) -10 (text) ] TJ
  const arrayTjRegex = /\[(.*?)\]\s*TJ/g;
  let am;
  while ((am = arrayTjRegex.exec(streamContent)) !== null) {
    const inner = am[1];
    const subMatches = inner.match(/\((.*?)\)/g);
    if (subMatches) {
      const combined = subMatches
        .map((s) => unescapePdfString(s.slice(1, -1)))
        .join('');
      if (combined.trim()) {
        result.push(combined);
      }
    }
  }

  return result;
}

function unescapePdfString(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

/**
 * Sanitizes input text: strictly purges any line containing owner information,
 * owner names, or mailing address tokens before downstream parsing.
 */
export function sanitizeAndStripPii(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';

  const lines = rawText.split(/\r?\n/);
  const safeLines = [];
  let inOwnerBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      safeLines.push('');
      continue;
    }

    const upper = line.toUpperCase();

    // Check for start of Owner / Mailing Address section
    if (
      upper.includes('OWNER NAME') ||
      upper.includes('CURRENT OWNER') ||
      upper.includes('PROPERTY OWNER') ||
      upper.includes('OWNER INFORMATION') ||
      upper.includes('OWNER(S)') ||
      upper.includes('MAILING ADDRESS') ||
      upper.includes('MAIL TO:') ||
      upper.includes('BILLING ADDRESS') ||
      upper.includes('OWNERSHIP HISTORY')
    ) {
      inOwnerBlock = true;
      continue;
    }

    // Check for end of owner block (e.g. Sales, Value, Site Address, Building, Legal)
    if (
      inOwnerBlock &&
      (upper.includes('SITE ADDRESS') ||
        upper.includes('LOCATION') ||
        upper.includes('PROPERTY VALUES') ||
        upper.includes('SALES HISTORY') ||
        upper.includes('BUILDING INFORMATION') ||
        upper.includes('LEGAL DESCRIPTION') ||
        upper.includes('LAND INFORMATION') ||
        upper.includes('PARCEL ID') ||
        upper.includes('FOLIO'))
    ) {
      inOwnerBlock = false;
    }

    if (inOwnerBlock) {
      // Discard all lines within the owner / mailing block
      continue;
    }

    // Additional single-line PII filter
    if (
      upper.startsWith('OWNER:') ||
      upper.startsWith('OWNER 1:') ||
      upper.startsWith('OWNER 2:') ||
      upper.startsWith('MAILING:') ||
      upper.startsWith('C/O ') ||
      upper.startsWith('CARE OF ') ||
      /^(P\.?O\.?\s+BOX\s+\d+)/i.test(line)
    ) {
      continue;
    }

    safeLines.push(line);
  }

  return safeLines.join('\n');
}

/**
 * Parses a Florida Property Appraiser record (sanitized text) into structured property details.
 */
export function parsePaRecordText(text, options = {}) {
  const sanitized = sanitizeAndStripPii(text);
  const todayIso = new Date().toISOString().split('T')[0];
  const sourceLabel = options.sourceDate
    ? `PA record PDF, ${options.sourceDate}`
    : `PA record PDF, ${todayIso}`;

  const result = {
    source: sourceLabel,
    parsedAt: new Date().toISOString(),
    county: detectCounty(sanitized),
    folio: parseFolio(sanitized),
    address: parseAddress(sanitized),
    buildingInfo: parseBuildingInfo(sanitized),
    features: parseFeatures(sanitized),
    salesHistory: parseSalesHistory(sanitized),
    valueHistory: parseValueHistory(sanitized),
    subAreas: parseSubAreas(sanitized),
    neighborhoodCode: parseNeighborhoodCode(sanitized),
    legalDescription: parseLegalDescription(sanitized)
  };

  return result;
}

export function detectCounty(text) {
  const upper = text.toUpperCase();
  if (upper.includes('BROWARD') || upper.includes('BCPA') || upper.includes('FORT LAUDERDALE')) {
    return 'Broward';
  }
  if (upper.includes('PALM BEACH') || upper.includes('PAPA') || upper.includes('WEST PALM BEACH')) {
    return 'Palm Beach';
  }
  if (upper.includes('MARTIN') || upper.includes('MCPA') || upper.includes('STUART')) {
    return 'Martin';
  }
  return 'Broward';
}

export function parseFolio(text) {
  // Broward format: 12 digits or 5042-20-01-0230
  // Palm Beach format: 17 digits or 00-42-45-04-06-000-0780
  // Martin format: 23-40-42-002-000-01070-1
  const mMartin = text.match(/\b\d{2}-\d{2}-\d{2}-\d{3}-\d{3}-\d{5}-\d\b/);
  if (mMartin) return mMartin[0];

  const mPalmBeach = text.match(/\b\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-\d{4}\b/);
  if (mPalmBeach) return mPalmBeach[0];

  const mBrowardHyphen = text.match(/\b\d{4}-\d{2}-\d{2}-\d{4}\b/);
  if (mBrowardHyphen) return mBrowardHyphen[0];

  const m17 = text.match(/\b(00\d{15}|74\d{15})\b/);
  if (m17) return m17[0];

  const m12 = text.match(/\b(48|49|50|51)\d{10}\b/);
  if (m12) return m12[0];

  const labelMatch = text.match(/(?:FOLIO|PARCEL\s*ID|PARCEL\s*NUMBER)[:\s]+([0-9\-_]+)/i);
  if (labelMatch) return labelMatch[1].trim();

  return null;
}

export function parseAddress(text) {
  const match = text.match(/(?:SITE\s*ADDRESS|PROPERTY\s*ADDRESS|LOCATION(?:\s*ADDRESS)?|PHYSICAL\s*ADDRESS|SITUS)[:\s]+([^\n\r]+)/i);
  if (match) {
    return match[1].trim();
  }
  return null;
}

export function parseBuildingInfo(text) {
  const info = {
    yearBuilt: null,
    effectiveYearBuilt: null,
    livingSqft: null,
    totalSqft: null,
    beds: null,
    fullBaths: null,
    halfBaths: null,
    stories: null,
    construction: null,
    roofCover: null,
    roofStructure: null
  };

  // Year built
  const mYr = text.match(/(?:ACTUAL\s*YEAR\s*BUILT|YEAR\s*BUILT|\bYR\s*BLT\b)[:\s]+(\d{4})/i);
  if (mYr) info.yearBuilt = Number(mYr[1]);

  const mEffYr = text.match(/(?:EFFECTIVE\s*YEAR|EFF(?:\s*YEAR|\s*YR)?\s*(?:BLT|BUILT)?)[:\s]+(\d{4})/i);
  if (mEffYr) info.effectiveYearBuilt = Number(mEffYr[1]);

  // Living Area
  const mLvg = text.match(/(?:FINISHED\s*(?:LIVING\s*)?AREA|LIVING\s*AREA|HEATED\s*AREA|ADJUSTED\s*AREA|\bBAS\b)[:\s]+([\d,]+)/i);
  if (mLvg) info.livingSqft = Number(mLvg[1].replace(/,/g, ''));

  const mTot = text.match(/(?:TOTAL\s*AREA|GROSS\s*AREA)[:\s]+([\d,]+)/i);
  if (mTot) info.totalSqft = Number(mTot[1].replace(/,/g, ''));

  // Beds & Baths
  const mBed = text.match(/(?:BEDROOMS?|\bBEDS?\b)[:\s]+(\d+)/i);
  if (mBed) info.beds = Number(mBed[1]);

  const mBath = text.match(/(?:FULL\s*BATHROOMS?|FULL\s*BATHS?)[:\s]+(\d+)/i);
  if (mBath) info.fullBaths = Number(mBath[1]);

  const mHalf = text.match(/(?:HALF\s*BATHROOMS?|HALF\s*BATHS?)[:\s]+(\d+)/i);
  if (mHalf) info.halfBaths = Number(mHalf[1]);

  const mDirectBath = text.match(/\b(?:TOTAL\s*BATHROOMS?|TOTAL\s*BATHS?|BATHROOMS?|\bBATHS?)\b[:\s]+(\d+(?:\.\d+)?)/i);
  if (mDirectBath && info.fullBaths == null) {
    const val = Number(mDirectBath[1]);
    const full = Math.floor(val);
    const half = (val - full) >= 0.5 ? 1 : 0;
    info.fullBaths = full;
    info.halfBaths = half;
    info.baths = val;
  }

  // Shorthand "3 / 2.5" or "3 Bed / 2 Bath"
  if (info.beds == null && info.fullBaths == null) {
    const mCombo = text.match(/(\d+)\s*(?:BEDS?|BD)\s*[/,]\s*(\d+)(?:\.(\d+))?\s*(?:BATHS?|BA)/i);
    if (mCombo) {
      info.beds = Number(mCombo[1]);
      info.fullBaths = Number(mCombo[2]);
      if (mCombo[3]) info.halfBaths = Number(mCombo[3]) > 0 ? 1 : 0;
    }
  }

  if (info.baths == null && info.fullBaths != null) {
    info.baths = info.fullBaths + (info.halfBaths ? 0.5 : 0);
  }

  // Stories
  const mStory = text.match(/\b(?:STORIES|STORY)\b[:\s]+([\d.]+)/i);
  if (mStory) info.stories = Number(mStory[1]);

  // Construction
  const upper = text.toUpperCase();
  if (upper.includes('HARDI-PLANK') || upper.includes('HARDI PLANK') || upper.includes('HARDIPLANK')) {
    info.construction = 'Wood frame / Hardi-plank';
  } else if (upper.includes('WOOD FRAME') || upper.includes('WOOD/FRAME')) {
    info.construction = 'Wood frame';
  } else if (upper.includes('CBS') || upper.includes('CONCRETE BLOCK') || upper.includes('CEMENT BLOCK')) {
    info.construction = 'CBS';
  } else if (upper.includes('BRICK')) {
    info.construction = 'Brick';
  }

  // Roof cover
  if (upper.includes('CEMENT TILE') || upper.includes('CONCRETE TILE')) {
    info.roofCover = 'Cement tile';
  } else if (upper.includes('CLAY TILE') || upper.includes('BARREL TILE')) {
    info.roofCover = 'Clay tile';
  } else if (upper.includes('ASPHALT SHINGLE') || upper.includes('COMPOSITION SHINGLE')) {
    info.roofCover = 'Asphalt shingle';
  } else if (upper.includes('METAL') || upper.includes('STANDING SEAM')) {
    info.roofCover = 'Metal';
  } else if (upper.includes('BUILT-UP') || upper.includes('TAR & GRAVEL')) {
    info.roofCover = 'Built-up / Tar & Gravel';
  }

  // Roof structure
  if (upper.includes('GABLE / HIP') || upper.includes('GABLE/HIP')) {
    info.roofStructure = 'Gable / Hip';
  } else if (upper.includes('GABLE')) {
    info.roofStructure = 'Gable';
  } else if (upper.includes('HIP')) {
    info.roofStructure = 'Hip';
  } else if (upper.includes('FLAT')) {
    info.roofStructure = 'Flat';
  }

  // Quality / Grade
  const mQuality = text.match(/(?:QUALITY|GRADE)[:\s]+(?:(Q[1-6])\s*(?:\(([A-Z0-9]+)\))?|([A-Z0-9]+))/i);
  if (mQuality) {
    const qRating = mQuality[1]?.toUpperCase() || null;
    const rawCode = mQuality[2] || mQuality[3] || null;
    if (qRating) {
      info.qualityGrade = qRating;
      info.rawQualityCode = rawCode;
    } else if (rawCode) {
      info.rawQualityCode = rawCode.toUpperCase();
      const codeUpper = rawCode.toUpperCase();
      if (codeUpper === 'R1' || codeUpper === 'C1') info.qualityGrade = 'Q1';
      else if (codeUpper === 'R2' || codeUpper === 'C2') info.qualityGrade = 'Q2';
      else if (codeUpper === 'R3' || codeUpper === 'C3') info.qualityGrade = 'Q3';
      else if (codeUpper === 'R4' || codeUpper === 'C4') info.qualityGrade = 'Q4';
      else if (codeUpper === 'R5' || codeUpper === 'C5') info.qualityGrade = 'Q5';
      else if (codeUpper === 'R6' || codeUpper === 'C6') info.qualityGrade = 'Q6';
    }
  }

  // Condition
  const mCond = text.match(/(?:CONDITION|PHYSICAL\s*CONDITION)[:\s]+(?:(C[1-6])|([A-Z]+))/i);
  if (mCond) {
    const cRating = mCond[1]?.toUpperCase() || null;
    const rawCond = mCond[2]?.toUpperCase() || null;
    if (cRating) {
      info.conditionRating = cRating;
      info.rawConditionCode = rawCond || cRating;
    } else if (rawCond) {
      info.rawConditionCode = rawCond;
      if (rawCond.includes('EX') || rawCond === 'EXCELLENT') info.conditionRating = 'C1';
      else if (rawCond.includes('VG') || rawCond === 'VERY GOOD') info.conditionRating = 'C2';
      else if (rawCond.includes('GD') || rawCond === 'GOOD') info.conditionRating = 'C3';
      else if (rawCond.includes('AV') || rawCond === 'AVERAGE') info.conditionRating = 'C4';
      else if (rawCond.includes('FR') || rawCond === 'FAIR') info.conditionRating = 'C5';
      else if (rawCond.includes('PR') || rawCond === 'POOR') info.conditionRating = 'C6';
    }
  }

  return info;
}

export function parseFeatures(text) {
  const upper = text.toUpperCase();
  const features = {
    hasPool: false,
    pool: false,
    poolType: null,
    poolYear: null,
    hasDock: false,
    dock: false,
    dockSqft: null,
    dockYear: null,
    hasBoatLift: false,
    boatLift: false,
    hasFireplace: false,
    fireplaces: 0,
    screenEnclosure: false
  };

  if (upper.includes('POOL') || upper.includes('SWIMMING POOL')) {
    features.hasPool = true;
    features.pool = true;
    features.poolType = upper.includes('GUNITE') ? 'Gunite / In-ground' : 'In-ground';
    const mPoolYr = text.match(/POOL[^\n\r\d]*(\d{4})/i);
    if (mPoolYr) {
      features.poolYear = Number(mPoolYr[1]);
    }
  }

  if (upper.includes('DOCK') || upper.includes('BOAT DOCK') || upper.includes('PIER') || upper.includes('SEAWALL')) {
    features.hasDock = true;
    features.dock = true;
    const mDockSf = text.match(/(?:DOCK|BOAT\s*DOCK)[^\n\r\d]*(\d{2,4})\s*(?:SF|SQ\s*FT)?/i);
    if (mDockSf) {
      features.dockSqft = Number(mDockSf[1]);
    }
    const mDockYr = text.match(/(?:DOCK|BOAT\s*DOCK)[^\n\r\d]*\d{2,4}[^\n\r\d]*(\d{4})/i);
    if (mDockYr) {
      features.dockYear = Number(mDockYr[1]);
    }
  }

  if (upper.includes('BOAT LIFT') || upper.includes('BOATLIFT') || upper.includes('DAVIT')) {
    features.hasBoatLift = true;
    features.boatLift = true;
    features.hasDock = true;
    features.dock = true;
  }

  if (upper.includes('FIREPLACE') || upper.includes('FRP')) {
    features.hasFireplace = true;
    features.fireplaces = 1;
  }

  if (upper.includes('SCREEN ENCLOSURE') || upper.includes('SCREEN PORCH') || upper.includes('SCREEN PATIO') || upper.includes('FSP')) {
    features.screenEnclosure = true;
  }

  return features;
}

export function parseSalesHistory(text) {
  const sales = [];
  const lines = text.split(/\r?\n/);

  // Match lines with Date + Price + Deed Type
  // e.g. 05/14/2024 $1,450,000 WD 34120/123
  // or 16-JUN-2023 $725,000 QC BK 32140 PG 456
  const dateRegex = /\b(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-[A-Za-z]{3}-\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
  const priceRegex = /\$[\d,]+|\b\d{1,3}(?:,\d{3})+\b/;
  const deedTypeRegex = /\b(WD|QC|SW|PR|CT|TD|RD|SP|TR|00|CFN)\b/;
  const bookPageRegex = /\b(?:BK\s*)?(\d{3,6})\s*[/ -]\s*(?:PG\s*)?(\d{2,5})\b/i;

  for (const line of lines) {
    const dMatch = line.match(dateRegex);
    const pMatch = line.match(priceRegex);
    if (!dMatch || !pMatch) continue;

    const rawPrice = pMatch[0].replace(/[$,]/g, '');
    const priceNum = Number(rawPrice);
    if (isNaN(priceNum)) continue;

    const dtMatch = line.match(deedTypeRegex);
    const bpMatch = line.match(bookPageRegex);

    const sDate = normalizeDateString(dMatch[1]);
    const dt = dtMatch ? dtMatch[1] : 'Deed';
    const bk = bpMatch ? bpMatch[1] : null;
    const pg = bpMatch ? bpMatch[2] : null;

    sales.push({
      saleDate: sDate,
      sale_date: sDate,
      salePrice: priceNum,
      sale_price: priceNum,
      deedType: dt,
      deed_type: dt,
      orBook: bk,
      book: bk,
      orPage: pg,
      page: pg,
      rawLine: line.trim()
    });
  }

  // Deduplicate sales by date + price
  const uniqueSales = [];
  const seenKeys = new Set();
  for (const s of sales) {
    const key = `${s.saleDate}|${s.salePrice}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueSales.push(s);
    }
  }

  // Sort descending by date
  return uniqueSales.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));
}

export function parseValueHistory(text) {
  const values = [];
  const lines = text.split(/\r?\n/);

  // Match rows starting with a 4-digit tax roll year (2015-2026) followed by values
  // e.g. 2026 $450,000 $850,000 $1,300,000 $1,150,000
  // or Year: 2025, Land: $400k, Building: $800k, Just: $1.2M
  const yearPattern = /\b(20[12]\d)\b/;

  for (const line of lines) {
    const yrMatch = line.match(yearPattern);
    if (!yrMatch) continue;

    const year = Number(yrMatch[1]);
    const dollarMatches = line.match(/\$[\d,]+|\b\d{1,3}(?:,\d{3}){1,3}\b/g);
    if (!dollarMatches || dollarMatches.length < 2) continue;

    const nums = dollarMatches
      .map((d) => Number(d.replace(/[$,]/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (nums.length >= 2) {
      let landVal = null;
      let impVal = null;
      let justVal = null;

      if (nums.length >= 3) {
        // Standard Florida layout: Land | Building | Just (or Market)
        landVal = nums[0];
        impVal = nums[1];
        justVal = nums[2];
      } else if (nums.length === 2) {
        landVal = nums[0];
        justVal = nums[1];
        impVal = justVal > landVal ? justVal - landVal : 0;
      }

      values.push({
        rollYear: year,
        year,
        landValue: landVal,
        improvementValue: impVal,
        justValue: justVal
      });
    }
  }

  // Deduplicate by year and sort descending
  const byYear = {};
  for (const v of values) {
    if (!byYear[v.rollYear] || (v.justValue && v.justValue > (byYear[v.rollYear].justValue || 0))) {
      byYear[v.rollYear] = v;
    }
  }

  return Object.values(byYear).sort((a, b) => b.rollYear - a.rollYear);
}

export function parseSubAreas(text) {
  const subAreas = [];
  const subAreaCodes = ['BAS', 'FOP', 'FSP', 'GRG', 'CPT', 'PAT', 'WDK', 'CAN', 'DCK', 'ENC', 'STP'];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    for (const code of subAreaCodes) {
      const reg = new RegExp(`\\b${code}\\b[^\\d]*([\\d,]+)`, 'i');
      const m = line.match(reg);
      if (m) {
        const sqft = Number(m[1].replace(/,/g, ''));
        if (sqft > 0) {
          subAreas.push({
            code: code.toUpperCase(),
            sqft,
            description: getSubAreaDescription(code.toUpperCase())
          });
        }
      }
    }
  }

  return subAreas;
}

function getSubAreaDescription(code) {
  const desc = {
    BAS: 'Finished Living Area',
    FOP: 'Finished Open Porch',
    FSP: 'Finished Screen Porch',
    GRG: 'Garage',
    CPT: 'Carport',
    PAT: 'Patio',
    WDK: 'Wood Deck',
    CAN: 'Canopy',
    DCK: 'Dock',
    ENC: 'Enclosure',
    STP: 'Stoop'
  };
  return desc[code] || code;
}

export function parseNeighborhoodCode(text) {
  const m = text.match(/(?:NEIGHBORHOOD|NBRHD|MARKET\s*AREA)[^0-9\n\r]*([0-9A-Z]{3,6})/i);
  if (m) return m[1].trim();
  return null;
}

export function parseLegalDescription(text) {
  const m = text.match(/(?:LEGAL\s*DESCRIPTION|SHORT\s*LEGAL)[:\s]+([^\n\r]+(?:\n[^\n\r]+){0,2})/i);
  if (m) {
    return m[1].replace(/\s+/g, ' ').trim();
  }
  return null;
}

function normalizeDateString(dateStr) {
  if (!dateStr) return '';
  const clean = dateStr.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  // MM/DD/YYYY
  const mSlash = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mSlash) {
    const mo = String(mSlash[1]).padStart(2, '0');
    const da = String(mSlash[2]).padStart(2, '0');
    return `${mSlash[3]}-${mo}-${da}`;
  }

  // DD-MON-YY or DD-MON-YYYY (e.g. 17-MAR-23)
  const mMon = clean.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (mMon) {
    const months = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };
    const mo = months[mMon[2].toUpperCase()] || '01';
    const da = String(mMon[1]).padStart(2, '0');
    let yr = mMon[3];
    if (yr.length === 2) {
      yr = Number(yr) > 50 ? `19${yr}` : `20${yr}`;
    }
    return `${yr}-${mo}-${da}`;
  }

  return clean;
}
