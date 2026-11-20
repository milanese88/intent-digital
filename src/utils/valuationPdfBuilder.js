/**
 * Pure-JS Multi-Page Valuation Estimate PDF Builder (%PDF-1.4)
 *
 * Generates a valid, self-contained Letter PDF (with a Letter Landscape page
 * for the Full Adjustment Grid) ready for direct upload to Vercel Blob ("Save to property")
 * or immediate browser download without external dependencies.
 *
 * Strictly non-PII: NEVER includes parcel owner names or mailing addresses.
 * Every page displays page numbers ("Page X of Y") and the exact footer:
 * "Valuation estimate for my own analysis — not an appraisal."
 */

import { VALUATION_REPORT_FOOTER } from '../config/legal.js';
import { resolvePropertyPricing } from '../components/investor/priceSource.js';

const PORTRAIT_W = 612;
const PORTRAIT_H = 792;
const LANDSCAPE_W = 792;
const LANDSCAPE_H = 612;

// Intent Digital Design Tokens (RGB 0..1)
const C_CREAM = [250 / 255, 248 / 255, 245 / 255];      // #FAF8F5 Toasted Cream
const C_GANACHE = [52 / 255, 41 / 255, 42 / 255];       // #34292A Pantone Ganache
const C_QUIETUDE = [189 / 255, 211 / 255, 226 / 255];   // #BDD3E2 Quietude
const C_PERIWINKLE = [133 / 255, 157 / 255, 206 / 255]; // #859DCE Periwinkle
const C_WHITE = [1, 1, 1];
const C_MUTED = [108 / 255, 95 / 255, 90 / 255];
const C_BORDER = [224 / 255, 217 / 255, 209 / 255];
const C_POSITIVE = [63 / 255, 90 / 255, 58 / 255];
const C_BURGUNDY = [65 / 255, 16 / 255, 27 / 255];
const C_SOFT_ROW = [245 / 255, 241 / 255, 236 / 255];

function fmtRgb(rgb) {
  return rgb.map((n) => n.toFixed(3)).join(' ');
}

/**
 * Escapes text into a WinAnsi-encoded PDF literal string.
 * Maps common Unicode punctuation cleanly into WinAnsi single-byte codes or ASCII.
 */
function encodePdfText(raw) {
  const str = String(raw ?? '')
    .replace(/\u2014/g, '\x97') // em-dash — (WinAnsi 0x97)
    .replace(/\u2013/g, '\x96') // en-dash – (WinAnsi 0x96)
    .replace(/\u2212/g, '-')    // minus sign −
    .replace(/\u00B7/g, '\xB7') // middle dot · (WinAnsi 0xB7)
    .replace(/\u00B1/g, '\xB1') // ± (WinAnsi 0xB1)
    .replace(/\u00F7/g, '\xF7') // ÷ (WinAnsi 0xF7)
    .replace(/\u00D7/g, '\xD7') // × (WinAnsi 0xD7)
    .replace(/\u2192/g, '->')   // →
    .replace(/\u2264/g, '<=')   // ≤
    .replace(/\u2265/g, '>=')   // ≥
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, '\x95') // bullet • (WinAnsi 0x95)
    .replace(/\r?\n/g, ' ');

  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 0x5c) {
      out += '\\\\';
    } else if (code === 0x28) {
      out += '\\(';
    } else if (code === 0x29) {
      out += '\\)';
    } else if (code >= 32 && code <= 126) {
      out += str[i];
    } else if (code >= 128 && code <= 255) {
      out += `\\${code.toString(8).padStart(3, '0')}`;
    } else {
      out += ' ';
    }
  }
  return out;
}

function fmtMoney(val) {
  if (val == null || isNaN(Number(val)) || Number(val) <= 0) return '—';
  return `$${Math.round(Number(val)).toLocaleString('en-US')}`;
}

function fmtSignedMoney(val) {
  const n = Math.round(Number(val) || 0);
  if (n > 0) return `+$${n.toLocaleString('en-US')}`;
  if (n < 0) return `-$${Math.abs(n).toLocaleString('en-US')}`;
  return '$0';
}

function fmtShortDate(dStr) {
  if (!dStr) return '—';
  const d = new Date(dStr);
  if (isNaN(d.getTime())) return String(dStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function truncateText(str, maxChars) {
  const s = String(str ?? '').trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(1, maxChars - 1))}...`;
}

function wrapLines(text, maxChars) {
  const clean = String(text ?? '').trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\r?\n/);
  const lines = [];
  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let cur = '';
    for (const w of words) {
      if (!cur) {
        cur = w;
      } else if (cur.length + 1 + w.length <= maxChars) {
        cur += ` ${w}`;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

function createPage(width = PORTRAIT_W, height = PORTRAIT_H) {
  const ops = [];
  // Paint Toasted Cream page backdrop
  ops.push(`${fmtRgb(C_CREAM)} rg 0 0 ${width} ${height} re f`);

  const rect = (x, yTop, w, h, { fill = null, stroke = null, lineWidth = 0.75 } = {}) => {
    const yBottom = height - yTop - h;
    let cmd = 'q ';
    if (fill) cmd += `${fmtRgb(fill)} rg `;
    if (stroke) cmd += `${fmtRgb(stroke)} RG ${lineWidth} w `;
    cmd += `${x.toFixed(1)} ${yBottom.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re `;
    cmd += fill && stroke ? 'B ' : fill ? 'f ' : 'S ';
    cmd += 'Q';
    ops.push(cmd);
  };

  const line = (x1, yTop1, x2, yTop2, color = C_BORDER, lineWidth = 0.75) => {
    const y1 = height - yTop1;
    const y2 = height - yTop2;
    ops.push(`q ${fmtRgb(color)} RG ${lineWidth} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S Q`);
  };

  // Font keys: F1=Helvetica, F2=Helvetica-Bold, F3=Times-Roman, F4=Times-Bold
  const text = (str, x, yTop, { font = 'F1', size = 10, color = C_GANACHE, align = 'left' } = {}) => {
    const safe = encodePdfText(str);
    const approxCharW = size * (font === 'F3' || font === 'F4' ? 0.48 : 0.52);
    const estWidth = String(str ?? '').length * approxCharW;
    let drawX = x;
    if (align === 'right') drawX = x - estWidth;
    else if (align === 'center') drawX = x - estWidth / 2;
    const yBase = height - yTop - size * 0.82;
    ops.push(`BT /${font} ${size} Tf ${fmtRgb(color)} rg 1 0 0 1 ${drawX.toFixed(1)} ${yBase.toFixed(1)} Tm (${safe}) Tj ET`);
  };

  return { width, height, ops, rect, line, text };
}

function drawPageHeader(page, sectionEyebrow, title, rightMeta) {
  const m = 42;
  page.rect(0, 0, page.width, 54, { fill: C_GANACHE });
  page.rect(0, 54, page.width, 3, { fill: C_QUIETUDE });
  page.text(sectionEyebrow.toUpperCase(), m, 13, { font: 'F2', size: 7.5, color: C_QUIETUDE });
  page.text(title, m, 25, { font: 'F3', size: 17, color: C_CREAM });
  if (rightMeta) {
    page.text(truncateText(rightMeta, 55), page.width - m, 29, {
      font: 'F1',
      size: 8.5,
      color: C_CREAM,
      align: 'right'
    });
  }
}

function drawFooter(page, pageNum, totalPages) {
  const m = 42;
  const footerY = page.height - 30;
  page.line(m, footerY - 6, page.width - m, footerY - 6, C_BORDER, 0.75);
  page.text(VALUATION_REPORT_FOOTER, m, footerY, { font: 'F1', size: 8, color: C_MUTED });
  page.text(`Page ${pageNum} of ${totalPages}`, page.width - m, footerY, {
    font: 'F2',
    size: 8,
    color: C_GANACHE,
    align: 'right'
  });
}

const PDF_GRID_ROWS = [
  { key: 'time', label: 'Sale Date / Time' },
  { key: 'gla', label: 'Living Area (GLA)' },
  { key: 'age', label: 'Year Built / Eff. Age' },
  { key: 'bed_bath', label: 'Beds & Baths' },
  { key: 'quality', label: 'Quality (UAD)' },
  { key: 'condition', label: 'Condition (UAD)' },
  { key: 'construction', label: 'Construction' },
  { key: 'windows', label: 'Windows' },
  { key: 'roof', label: 'Roof' },
  { key: 'pool', label: 'Pool & Outdoor' },
  { key: 'garage', label: 'Garage & Parking' },
  { key: 'location_subdivision', label: 'Location / Subdiv.' },
  { key: 'location_site', label: 'Waterfront & View' },
  { key: 'boat_dock', label: 'Boat Dock / Lift' },
  { key: 'lot_size', label: 'Lot Size' }
];

function getSubjectRowText(rowKey, summary, grid) {
  switch (rowKey) {
    case 'time':
      return 'Current baseline';
    case 'gla':
      return summary.sqft ? `${Number(summary.sqft).toLocaleString()} sf (@$${grid.effectiveRates?.glaRate || 0}/sf)` : '—';
    case 'age':
      return summary.ageLabel || '—';
    case 'bed_bath':
      return summary.bedBathLabel || '—';
    case 'quality':
      return summary.qualityLabel || '—';
    case 'condition':
      return summary.conditionLabel || '—';
    case 'construction':
      return summary.constructionDetail || summary.constructionLabel || 'Unknown';
    case 'windows':
      return summary.windowsLabel || '—';
    case 'roof':
      return summary.roofLabel || '—';
    case 'pool':
      return summary.poolLabel || '—';
    case 'garage':
      return summary.garageLabel || '—';
    case 'location_subdivision':
      return [summary.subdivisionName, summary.nbrhdCd ? `N:${summary.nbrhdCd}` : null].filter(Boolean).join(' · ') || '—';
    case 'location_site':
      return summary.locationSiteLabel || '—';
    case 'boat_dock':
      return summary.boatDockLabel || 'Unknown';
    case 'lot_size':
      return summary.lotSizeLabel || '—';
    default:
      return '—';
  }
}

/**
 * Builds a complete multi-page binary PDF (Uint8Array) for the Valuation Estimate report.
 */
export function buildValuationEstimatePdfBytes({
  property = {},
  countyData = null,
  grid = {},
  countyFreshness = null,
  hasRenovationBudget = false,
  generatedAt = new Date()
} = {}) {
  const pricing = resolvePropertyPricing(property, countyData);
  const summary = grid?.subjectSummary || {};
  const comps = Array.isArray(grid?.comps) ? grid.comps : [];
  const usedComps = Array.isArray(grid?.usedComps) ? grid.usedComps : [];
  const checks = Array.isArray(grid?.checks) ? grid.checks : [];
  const anchors = grid?.sanityAnchors || {};

  const address = property.address || summary.address || 'Subject Property';
  const cityStateZip = [
    property.city || countyData?.city,
    property.state || 'FL',
    property.zip || countyData?.zip
  ].filter(Boolean).join(', ');
  const folio = property.parcel_id || countyData?.parcel_id || 'Not linked';
  const countyName = property.parcel_county || property.county || countyData?.county || 'Florida';
  const reportDateStr = generatedAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const estValue = grid?.reconciledValue || null;
  const rangeStr = grid?.rangeLow && grid?.rangeHigh
    ? `${fmtMoney(grid.rangeLow)} – ${fmtMoney(grid.rangeHigh)}`
    : '—';
  const deltaPctVsRef =
    estValue && pricing.referencePrice
      ? Math.round(((estValue - pricing.referencePrice) / pricing.referencePrice) * 1000) / 10
      : null;

  const pages = [];

  // =========================================================================
  // PAGE 1: COVER (Letter Portrait)
  // =========================================================================
  {
    const p = createPage(PORTRAIT_W, PORTRAIT_H);
    const m = 48;

    // Editorial dark top banner
    p.rect(0, 0, PORTRAIT_W, 210, { fill: C_GANACHE });
    p.rect(0, 210, PORTRAIT_W, 6, { fill: C_QUIETUDE });

    p.text('VALUATION ESTIMATE · SALES COMPARISON ANALYSIS', m, 42, {
      font: 'F2',
      size: 9,
      color: C_QUIETUDE
    });
    p.text(truncateText(address, 42), m, 66, {
      font: 'F3',
      size: 28,
      color: C_CREAM
    });
    p.text(`${cityStateZip}${countyName ? ` · ${countyName} County` : ''}`, m, 108, {
      font: 'F1',
      size: 11.5,
      color: C_CREAM
    });

    p.text(`Folio / Parcel ID: ${folio}`, m, 142, { font: 'F1', size: 9.5, color: C_QUIETUDE });
    p.text(`Report Date: ${reportDateStr}`, m, 158, { font: 'F1', size: 9.5, color: C_QUIETUDE });
    if (summary.subdivisionName || summary.nbrhdCd) {
      const locLine = [
        summary.subdivisionName ? `Subdivision: ${summary.subdivisionName}` : null,
        summary.nbrhdCd ? `Neighborhood: ${summary.nbrhdCd}` : null,
        summary.hoaName ? `HOA: ${summary.hoaName}` : null
      ].filter(Boolean).join('  ·  ');
      p.text(truncateText(locLine, 85), m, 176, { font: 'F1', size: 9, color: C_CREAM });
    }

    // Main KPI cards
    const cardY = 248;
    const cardW = (PORTRAIT_W - m * 2 - 16) / 2;

    // Left card: Estimated Current Value
    p.rect(m, cardY, cardW, 134, { fill: C_GANACHE, stroke: C_GANACHE });
    p.text(
      grid?.mode === 'arv' && hasRenovationBudget ? 'ESTIMATED AFTER-REPAIR VALUE (ARV)' : 'ESTIMATED CURRENT VALUE',
      m + 18,
      cardY + 18,
      { font: 'F2', size: 8, color: C_QUIETUDE }
    );
    p.text(estValue ? fmtMoney(estValue) : 'Incomplete', m + 18, cardY + 38, {
      font: 'F3',
      size: 30,
      color: C_CREAM
    });
    p.text(`Range: ${rangeStr}`, m + 18, cardY + 80, { font: 'F1', size: 9.5, color: C_CREAM });
    p.text(
      `${grid?.reconciledPpsf ? `$${grid.reconciledPpsf}/sf` : '—'} · ${usedComps.length} active ${usedComps.length === 1 ? 'comp' : 'comps'}`,
      m + 18,
      cardY + 98,
      { font: 'F1', size: 9.5, color: C_QUIETUDE }
    );

    // Right card: Reference price (Off-market estimate / List price / My offer / County value)
    const rx = m + cardW + 16;
    p.rect(rx, cardY, cardW, 134, { fill: C_WHITE, stroke: C_BORDER });
    p.text(pricing.headerPriceLabel, rx + 18, cardY + 18, { font: 'F2', size: 8, color: C_MUTED });
    p.text(pricing.referencePrice ? fmtMoney(pricing.referencePrice) : 'Not set', rx + 18, cardY + 38, {
      font: 'F3',
      size: 30,
      color: C_GANACHE
    });
    if (deltaPctVsRef != null) {
      const sign = deltaPctVsRef > 0 ? '+' : '';
      p.text(
        `Est. value is ${sign}${deltaPctVsRef.toFixed(1)}% vs ${pricing.shortLabel.toLowerCase()}`,
        rx + 18,
        cardY + 80,
        { font: 'F2', size: 9.5, color: deltaPctVsRef >= 0 ? C_POSITIVE : C_BURGUNDY }
      );
    }
    if (pricing.offerPrice && pricing.priceSource !== 'my_offer') {
      p.text(`My Offer: ${fmtMoney(pricing.offerPrice)}`, rx + 18, cardY + 98, {
        font: 'F1',
        size: 9.5,
        color: C_GANACHE
      });
    } else if (pricing.referencePrice && summary.sqft > 0) {
      p.text(`$${Math.round(pricing.referencePrice / summary.sqft)}/sf (${Number(summary.sqft).toLocaleString()} sf)`, rx + 18, cardY + 98, {
        font: 'F1',
        size: 9.5,
        color: C_MUTED
      });
    }

    // Confidence Panel
    const confY = 406;
    p.rect(m, confY, PORTRAIT_W - m * 2, 118, { fill: C_WHITE, stroke: C_BORDER });
    p.text('CONFIDENCE & DISPERSION SUMMARY', m + 18, confY + 16, { font: 'F2', size: 8, color: C_MUTED });
    p.text(`${grid?.confidenceScore || 'Low'} Confidence · ${grid?.confidencePct ?? 0}%`, m + 18, confY + 34, {
      font: 'F4',
      size: 16,
      color: grid?.confidenceScore === 'High' ? C_POSITIVE : C_BURGUNDY
    });
    p.text(
      `Adjusted $/sf Spread (CV): ${Number(grid?.cvPct || 0).toFixed(1)}%  ·  Avg Gross Adj: ${Number(grid?.avgGrossPct || 0).toFixed(1)}%  ·  Max Single-Comp Weight: ${Number(grid?.maxCompWeightPct || 0).toFixed(1)}%`,
      m + 18,
      confY + 58,
      { font: 'F1', size: 9, color: C_GANACHE }
    );
    const lowReasons = Array.isArray(grid?.lowConfidenceReasons) ? grid.lowConfidenceReasons : [];
    if (lowReasons.length > 0) {
      let ry = confY + 76;
      for (const reason of lowReasons.slice(0, 3)) {
        p.text(`• ${truncateText(reason, 86)}`, m + 18, ry, { font: 'F1', size: 8.5, color: C_BURGUNDY });
        ry += 12;
      }
    } else {
      p.text('All primary USPAP / Fannie Mae concentration & dispersion gates passed.', m + 18, confY + 80, {
        font: 'F1',
        size: 9,
        color: C_POSITIVE
      });
    }

    // Snapshot summary strip
    const snapY = 548;
    p.rect(m, snapY, PORTRAIT_W - m * 2, 118, { fill: C_SOFT_ROW, stroke: C_BORDER });
    p.text('SUBJECT SNAPSHOT', m + 18, snapY + 14, { font: 'F2', size: 8, color: C_MUTED });
    const snapPairs = [
      ['Living Area', summary.sqft ? `${Number(summary.sqft).toLocaleString()} sf` : '—'],
      ['Lot Size', summary.lotSizeLabel || '—'],
      ['Year Built / Eff.', summary.ageLabel || '—'],
      ['Beds / Baths', summary.bedBathLabel || '—'],
      ['Construction', summary.constructionDetail || summary.constructionLabel || 'Unknown'],
      ['Quality / Cond.', `${summary.qualityLabel || '—'} · ${summary.conditionLabel || '—'}`]
    ];
    snapPairs.forEach(([lbl, val], idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const sx = m + 18 + col * 248;
      const sy = snapY + 34 + row * 26;
      p.text(lbl, sx, sy, { font: 'F2', size: 8, color: C_MUTED });
      p.text(truncateText(val, 36), sx + 88, sy, { font: 'F1', size: 9, color: C_GANACHE });
    });

    p.text('Prepared for personal investment analysis — strictly non-PII (no owner names).', m, 696, {
      font: 'F1',
      size: 8.5,
      color: C_MUTED
    });

    pages.push(p);
  }

  // =========================================================================
  // PAGE 2: SUBJECT PROPERTY & COUNTY RECORD (Letter Portrait)
  // =========================================================================
  {
    const p = createPage(PORTRAIT_W, PORTRAIT_H);
    const m = 42;
    drawPageHeader(p, 'Section 01 · Subject Record', 'Subject Property & County Record', address);

    let y = 74;
    const rows = [
      ['Property Address', `${address}, ${cityStateZip}`],
      ['County / Folio', `${countyName} County · Folio ${folio}`],
      ['Living Area (Heated / Finished)', summary.sqft ? `${Number(summary.sqft).toLocaleString()} sf` : '—'],
      ['Sketch Areas', summary.sketchAreas || 'Not recorded'],
      ['Year Built / Effective Year', summary.ageLabel || '—'],
      ['Construction', summary.constructionDetail || summary.constructionLabel || 'Unknown'],
      ['Lot Size', summary.lotSizeLabel || '—'],
      ['Beds / Baths', summary.bedBathLabel || '—'],
      ['UAD Quality / Condition', `${summary.qualityLabel || '—'} · ${summary.conditionLabel || '—'}`],
      ['Roof & Windows', `${summary.roofLabel || 'Unknown'} · Windows: ${summary.windowsLabel || 'Unknown'}`],
      ['Pool & Outdoor', summary.poolLabel || 'Unknown'],
      ['Boat Dock / Lift', summary.boatDockLabel || 'Unknown'],
      ['Garage / Parking', summary.garageLabel || 'Unknown'],
      ['Waterfront & View', summary.locationSiteLabel || 'Unknown'],
      ['Neighborhood Code (NBRHD_CD)', summary.nbrhdCd || countyData?.nbrhd_cd || '—'],
      ['Subdivision / HOA', [summary.subdivisionName || '—', summary.hoaName ? `HOA: ${summary.hoaName}` : null].filter(Boolean).join(' · ')],
      ['County Just Value', summary.justValue ? fmtMoney(summary.justValue) : '—'],
      [
        'Land vs Improvement Split',
        summary.landValue != null && summary.improvementValue != null
          ? `Land ${fmtMoney(summary.landValue)} (${Math.round(summary.landSharePct || 0)}%) · Improvement ${fmtMoney(summary.improvementValue)}`
          : '—'
      ],
      ['Legal Description (Short)', truncateText(property.s_legal || countyData?.s_legal || '—', 72)]
    ];

    p.rect(m, y, PORTRAIT_W - m * 2, 22, { fill: C_GANACHE });
    p.text('COUNTY RECORD & VERIFIED SUBJECT SPECIFICATIONS', m + 12, y + 6, { font: 'F2', size: 8.5, color: C_CREAM });
    y += 22;

    rows.forEach(([label, val], idx) => {
      const rowH = 24;
      p.rect(m, y, PORTRAIT_W - m * 2, rowH, {
        fill: idx % 2 === 0 ? C_WHITE : C_SOFT_ROW,
        stroke: C_BORDER,
        lineWidth: 0.4
      });
      p.text(label, m + 10, y + 7, { font: 'F2', size: 8.5, color: C_MUTED });
      p.text(truncateText(val, 64), m + 185, y + 7, { font: 'F1', size: 9, color: C_GANACHE });
      y += rowH;
    });

    // Recent improvements box
    y += 16;
    p.rect(m, y, PORTRAIT_W - m * 2, 92, { fill: C_WHITE, stroke: C_BORDER });
    p.text('RECENT IMPROVEMENTS & PROPERTY HIGHLIGHTS', m + 12, y + 10, { font: 'F2', size: 8.5, color: C_GANACHE });
    const impLines = wrapLines(
      summary.recentImprovements || 'No recent improvements logged. Add updates in Investor Studio -> Edit Property.',
      84
    );
    let iy = y + 28;
    for (const ln of impLines.slice(0, 4)) {
      p.text(ln, m + 12, iy, { font: 'F1', size: 9, color: C_GANACHE });
      iy += 13;
    }

    pages.push(p);
  }

  // =========================================================================
  // PAGE 3: COMPARABLE SALES TABLE & MAP COORDINATES SUMMARY (Letter Portrait)
  // =========================================================================
  {
    const p = createPage(PORTRAIT_W, PORTRAIT_H);
    const m = 42;
    drawPageHeader(p, 'Section 02 · Comparable Sales', 'Comparable Sales Summary', `${usedComps.length} of ${comps.length} comps active`);

    let y = 76;
    p.rect(m, y, PORTRAIT_W - m * 2, 46, { fill: C_SOFT_ROW, stroke: C_BORDER });
    p.text('SPATIAL & SELECTION OVERVIEW', m + 12, y + 9, { font: 'F2', size: 8, color: C_MUTED });
    const avgDistStr = grid?.avgDist != null ? `${grid.avgDist.toFixed(2)} mi avg distance` : 'Distance n/a';
    const avgMoStr = grid?.avgMonths != null ? `${grid.avgMonths.toFixed(1)} mo avg age` : 'Age n/a';
    const medPpsfStr = grid?.localMedianPpsf ? `Median unadjusted $${grid.localMedianPpsf}/sf` : 'Median $/sf n/a';
    p.text(`${avgDistStr}  ·  ${avgMoStr}  ·  ${medPpsfStr}  ·  Tier: ${grid?.tier?.shortChip || 'Auto'}`, m + 12, y + 25, {
      font: 'F1',
      size: 9,
      color: C_GANACHE
    });
    y += 62;

    // Table header
    const cols = [
      { label: '#', x: m + 4, w: 22 },
      { label: 'Address', x: m + 26, w: 146 },
      { label: 'Sold', x: m + 174, w: 48 },
      { label: 'Price', x: m + 224, w: 66 },
      { label: 'SF', x: m + 292, w: 38 },
      { label: '$/sf', x: m + 332, w: 38 },
      { label: 'Dist', x: m + 372, w: 34 },
      { label: 'Status', x: m + 408, w: 38 },
      { label: 'Adj. Price', x: m + 448, w: 78 }
    ];

    p.rect(m, y, PORTRAIT_W - m * 2, 22, { fill: C_GANACHE });
    for (const c of cols) {
      p.text(c.label, c.x, y + 6, { font: 'F2', size: 8, color: C_CREAM });
    }
    y += 22;

    if (comps.length === 0) {
      p.rect(m, y, PORTRAIT_W - m * 2, 34, { fill: C_WHITE, stroke: C_BORDER });
      p.text('No comparable sales have been attached to this property yet.', m + 12, y + 11, {
        font: 'F1',
        size: 9.5,
        color: C_MUTED
      });
    } else {
      comps.slice(0, 14).forEach((comp, idx) => {
        const rowH = 34;
        p.rect(m, y, PORTRAIT_W - m * 2, rowH, {
          fill: idx % 2 === 0 ? C_WHITE : C_SOFT_ROW,
          stroke: C_BORDER,
          lineWidth: 0.4
        });
        p.text(`C${idx + 1}`, cols[0].x, y + 7, { font: 'F2', size: 8.5, color: C_GANACHE });
        p.text(truncateText((comp.address || '').split(',')[0], 26), cols[1].x, y + 6, { font: 'F2', size: 8.5, color: C_GANACHE });
        const subMeta = [
          comp.subdivision_name ? truncateText(comp.subdivision_name, 16) : null,
          comp.nbrhdCd ? `N:${comp.nbrhdCd}` : null,
          comp.isOutlier ? 'Outlier' : null
        ].filter(Boolean).join(' · ');
        if (subMeta) {
          p.text(truncateText(subMeta, 30), cols[1].x, y + 18, { font: 'F1', size: 7.5, color: C_MUTED });
        }
        p.text(fmtShortDate(comp.sold_date), cols[2].x, y + 7, { font: 'F1', size: 8, color: C_GANACHE });
        p.text(fmtMoney(comp.soldPrice), cols[3].x, y + 7, { font: 'F1', size: 8, color: C_GANACHE });
        p.text(comp.compSqft ? comp.compSqft.toLocaleString() : '—', cols[4].x, y + 7, { font: 'F1', size: 8, color: C_GANACHE });
        p.text(comp.compPpsf ? `$${comp.compPpsf}` : '—', cols[5].x, y + 7, { font: 'F1', size: 8, color: C_GANACHE });
        p.text(comp.distance_mi != null ? `${comp.distance_mi}m` : '—', cols[6].x, y + 7, { font: 'F1', size: 8, color: C_GANACHE });
        p.text(comp.isUsed ? `${comp.weightPct.toFixed(0)}%` : 'OFF', cols[7].x, y + 7, {
          font: 'F2',
          size: 8,
          color: comp.isUsed ? C_POSITIVE : C_MUTED
        });
        p.text(comp.adjustedPrice ? fmtMoney(comp.adjustedPrice) : '—', cols[8].x, y + 7, {
          font: 'F2',
          size: 8.5,
          color: C_GANACHE
        });
        p.text(`Gross ${comp.grossAdjustmentPct.toFixed(1)}%`, cols[8].x, y + 19, {
          font: 'F1',
          size: 7.5,
          color: comp.isHighGross ? C_BURGUNDY : C_MUTED
        });
        y += rowH;
      });
    }

    pages.push(p);
  }

  // =========================================================================
  // PAGE 4 (+ overflow): FULL ADJUSTMENT GRID (Letter LANDSCAPE 792 x 612)
  // =========================================================================
  {
    const compsPerPage = 4;
    const chunks = [];
    for (let i = 0; i < Math.max(1, comps.length); i += compsPerPage) {
      chunks.push(comps.slice(i, i + compsPerPage));
    }

    chunks.forEach((chunk, chunkIdx) => {
      const p = createPage(LANDSCAPE_W, LANDSCAPE_H);
      const m = 32;
      drawPageHeader(
        p,
        'Section 03 · Full Adjustment Grid (Landscape)',
        chunks.length > 1 ? `Sales Comparison Grid (${chunkIdx + 1} of ${chunks.length})` : 'Sales Comparison Adjustment Grid',
        `GLA rate: $${grid?.effectiveRates?.glaRate || 0}/sf · ${grid?.timeTrendSource || ''}`
      );

      const featureW = 108;
      const subjectW = 148;
      const availW = LANDSCAPE_W - m * 2 - featureW - subjectW;
      const compColW = Math.floor(availW / Math.max(1, chunk.length));
      let y = 66;

      // Grid Header Row
      const headerH = 44;
      p.rect(m, y, featureW, headerH, { fill: C_SOFT_ROW, stroke: C_BORDER });
      p.text('FEATURE', m + 6, y + 16, { font: 'F2', size: 8, color: C_GANACHE });

      const subX = m + featureW;
      p.rect(subX, y, subjectW, headerH, { fill: C_GANACHE, stroke: C_GANACHE });
      p.text('SUBJECT', subX + 6, y + 6, { font: 'F2', size: 7.5, color: C_QUIETUDE });
      p.text(truncateText(address.split(',')[0], 26), subX + 6, y + 17, { font: 'F2', size: 8.2, color: C_CREAM });
      p.text(truncateText(summary.priceColumnText || 'Subject anchor', 32), subX + 6, y + 29, { font: 'F1', size: 7.2, color: C_QUIETUDE });

      chunk.forEach((comp, cIdx) => {
        const cx = subX + subjectW + cIdx * compColW;
        const globalIdx = chunkIdx * compsPerPage + cIdx + 1;
        p.rect(cx, y, compColW, headerH, { fill: comp.isUsed ? C_WHITE : C_SOFT_ROW, stroke: C_BORDER });
        p.text(`COMP ${globalIdx} · ${comp.isUsed ? 'USED' : 'OFF'}`, cx + 6, y + 6, {
          font: 'F2',
          size: 7.5,
          color: comp.isUsed ? C_POSITIVE : C_MUTED
        });
        p.text(truncateText((comp.address || '').split(',')[0], 21), cx + 6, y + 17, { font: 'F2', size: 8, color: C_GANACHE });
        p.text(`${comp.distance_mi != null ? `${comp.distance_mi} mi` : '—'} · ${fmtShortDate(comp.sold_date)}`, cx + 6, y + 29, {
          font: 'F1',
          size: 7.5,
          color: C_MUTED
        });
      });
      y += headerH;

      // Unadjusted Sale Price Row
      const priceH = 22;
      p.rect(m, y, featureW, priceH, { fill: C_SOFT_ROW, stroke: C_BORDER, lineWidth: 0.5 });
      p.text('Unadjusted Price', m + 6, y + 6, { font: 'F2', size: 8, color: C_GANACHE });
      p.rect(subX, y, subjectW, priceH, { fill: C_GANACHE, stroke: C_GANACHE });
      p.text(truncateText(summary.unadjustedRowText || '—', 32), subX + 6, y + 6, { font: 'F2', size: 7.3, color: C_CREAM });
      chunk.forEach((comp, cIdx) => {
        const cx = subX + subjectW + cIdx * compColW;
        p.rect(cx, y, compColW, priceH, { fill: C_SOFT_ROW, stroke: C_BORDER, lineWidth: 0.5 });
        p.text(`${fmtMoney(comp.soldPrice)}${comp.compPpsf ? ` ($${comp.compPpsf}/sf)` : ''}`, cx + 6, y + 6, {
          font: 'F2',
          size: 8,
          color: C_GANACHE
        });
      });
      y += priceH;

      // 15 Feature Adjustment Rows
      const rowH = 23;
      PDF_GRID_ROWS.forEach((row, rIdx) => {
        p.rect(m, y, featureW, rowH, { fill: rIdx % 2 === 0 ? C_WHITE : C_SOFT_ROW, stroke: C_BORDER, lineWidth: 0.4 });
        p.text(row.label, m + 6, y + 7, { font: 'F2', size: 7.5, color: C_GANACHE });

        p.rect(subX, y, subjectW, rowH, { fill: C_GANACHE, stroke: C_GANACHE, lineWidth: 0.4 });
        p.text(truncateText(getSubjectRowText(row.key, summary, grid), 23), subX + 6, y + 7, {
          font: 'F1',
          size: 7.5,
          color: C_CREAM
        });

        chunk.forEach((comp, cIdx) => {
          const cx = subX + subjectW + cIdx * compColW;
          const cell = comp.cells?.[row.key] || { spec: '—', amount: 0 };
          p.rect(cx, y, compColW, rowH, { fill: rIdx % 2 === 0 ? C_WHITE : C_SOFT_ROW, stroke: C_BORDER, lineWidth: 0.4 });
          const specStr = cell.needsInfo ? `${cell.spec} (Needs info)` : cell.spec;
          p.text(truncateText(specStr, 17), cx + 5, y + 7, { font: 'F1', size: 7.2, color: C_MUTED });
          const amtColor = cell.amount > 0 ? C_POSITIVE : cell.amount < 0 ? C_BURGUNDY : C_MUTED;
          p.text(fmtSignedMoney(cell.amount), cx + compColW - 5, y + 7, {
            font: 'F2',
            size: 7.5,
            color: amtColor,
            align: 'right'
          });
        });
        y += rowH;
      });

      // Summary Rows: Net, Gross, Adjusted Price, Weight
      const sumRows = [
        {
          label: 'Net Adj. (<=15%)',
          subVal: '—',
          compVal: (c) => `${fmtSignedMoney(c.netAdjustment)} (${c.netAdjustmentPct.toFixed(1)}%)`,
          isAlert: (c) => c.isHighNet
        },
        {
          label: 'Gross Adj. (<=25%)',
          subVal: '—',
          compVal: (c) => `${fmtMoney(c.grossAdjustment)} (${c.grossAdjustmentPct.toFixed(1)}%)`,
          isAlert: (c) => c.isHighGross
        },
        {
          label: 'Adjusted Price',
          subVal: estValue ? fmtMoney(estValue) : '—',
          compVal: (c) => `${fmtMoney(c.adjustedPrice)}${c.adjustedPpsf ? ` ($${c.adjustedPpsf}/sf)` : ''}`,
          isAlert: () => false,
          bold: true
        },
        {
          label: 'Weight',
          subVal: `Sum ${Number(grid?.weightValidation?.sumPct || 0).toFixed(1)}%`,
          compVal: (c) => (c.isUsed ? `${c.weightPct.toFixed(1)}%` : 'OFF · 0%'),
          isAlert: () => false
        }
      ];

      sumRows.forEach((sr) => {
        const sH = 21;
        p.rect(m, y, featureW, sH, { fill: C_SOFT_ROW, stroke: C_BORDER, lineWidth: 0.6 });
        p.text(sr.label, m + 6, y + 6, { font: 'F2', size: 7.5, color: C_GANACHE });
        p.rect(subX, y, subjectW, sH, { fill: C_GANACHE, stroke: C_GANACHE });
        p.text(sr.subVal, subX + 6, y + 6, { font: 'F2', size: 8, color: C_QUIETUDE });
        chunk.forEach((comp, cIdx) => {
          const cx = subX + subjectW + cIdx * compColW;
          p.rect(cx, y, compColW, sH, { fill: sr.bold ? C_WHITE : C_SOFT_ROW, stroke: C_BORDER, lineWidth: 0.6 });
          p.text(truncateText(sr.compVal(comp), 24), cx + 6, y + 6, {
            font: 'F2',
            size: 7.8,
            color: sr.isAlert(comp) ? C_BURGUNDY : C_GANACHE
          });
        });
        y += sH;
      });

      pages.push(p);
    });
  }

  // =========================================================================
  // PAGE 5: RECONCILIATION WEIGHTS, CHECKS & SANITY ANCHORS (Letter Portrait)
  // =========================================================================
  {
    const p = createPage(PORTRAIT_W, PORTRAIT_H);
    const m = 42;
    drawPageHeader(p, 'Section 04 · Reconciliation & Checks', 'Reconciliation, Checks & Sanity Anchors', address);

    let y = 74;

    // 1. Sanity Anchors
    p.rect(m, y, PORTRAIT_W - m * 2, 22, { fill: C_GANACHE });
    p.text('INDEPENDENT SANITY ANCHORS (NOT INCLUDED IN WEIGHTS)', m + 12, y + 6, { font: 'F2', size: 8.5, color: C_CREAM });
    y += 22;

    const jv = anchors.countyJustValueAnchor;
    const street = anchors.nearestSameStreetSale;
    const refAnchor = anchors.referencePriceAnchor;

    const anchorItems = [
      {
        title: 'County Just Value ÷ 0.85',
        value: jv ? fmtMoney(jv.impliedMarketValue) : 'Not linked',
        detail: jv
          ? `Just value ${fmtMoney(jv.justValue)}${jv.landSharePct != null ? ` · Land ${Math.round(jv.landSharePct)}%` : ''}${jv.deltaPctVsReconciled != null ? ` · Grid ${jv.deltaPctVsReconciled > 0 ? '+' : ''}${jv.deltaPctVsReconciled}% vs anchor` : ''}`
          : 'Link county parcel to compute FL DOR 85% proxy.'
      },
      {
        title: 'Nearest Same-Street Sale',
        value: street ? `${fmtMoney(street.soldPrice)}${street.ppsf ? ` ($${street.ppsf}/sf)` : ''}` : 'None found',
        detail: street
          ? `${street.address} · Sold ${fmtShortDate(street.soldDate)}${street.sqft ? ` · ${street.sqft.toLocaleString()} sf` : ''}`
          : 'No qualified same-street sale found on county roll or comps.'
      },
      {
        title: pricing.shortLabel,
        value: refAnchor ? fmtMoney(refAnchor.price) : 'Not set',
        detail: refAnchor
          ? `${refAnchor.ppsf ? `$${refAnchor.ppsf}/sf · ` : ''}${refAnchor.deltaPctVsReconciled != null ? `Est. current value is ${refAnchor.deltaPctVsReconciled > 0 ? '+' : ''}${refAnchor.deltaPctVsReconciled}% vs ${pricing.shortLabel.toLowerCase()}` : 'Subject reference price'}`
          : 'No reference price recorded.'
      }
    ];

    anchorItems.forEach((a, idx) => {
      p.rect(m, y, PORTRAIT_W - m * 2, 36, { fill: idx % 2 === 0 ? C_WHITE : C_SOFT_ROW, stroke: C_BORDER, lineWidth: 0.4 });
      p.text(a.title, m + 10, y + 7, { font: 'F2', size: 8.5, color: C_MUTED });
      p.text(a.value, m + 180, y + 6, { font: 'F4', size: 10.5, color: C_GANACHE });
      p.text(truncateText(a.detail, 86), m + 10, y + 20, { font: 'F1', size: 8, color: C_GANACHE });
      y += 36;
    });

    y += 14;
    // 2. Reconciliation Weights
    p.rect(m, y, PORTRAIT_W - m * 2, 22, { fill: C_GANACHE });
    p.text(`RECONCILIATION WEIGHTS (SUM = ${Number(grid?.weightValidation?.sumPct || 0).toFixed(1)}%)`, m + 12, y + 6, {
      font: 'F2',
      size: 8.5,
      color: C_CREAM
    });
    y += 22;

    if (usedComps.length === 0) {
      p.rect(m, y, PORTRAIT_W - m * 2, 26, { fill: C_WHITE, stroke: C_BORDER });
      p.text('No active comps weighted.', m + 10, y + 8, { font: 'F1', size: 8.5, color: C_MUTED });
      y += 26;
    } else {
      usedComps.slice(0, 6).forEach((c, idx) => {
        p.rect(m, y, PORTRAIT_W - m * 2, 28, { fill: idx % 2 === 0 ? C_WHITE : C_SOFT_ROW, stroke: C_BORDER, lineWidth: 0.4 });
        p.text(`C${idx + 1} · ${truncateText((c.address || '').split(',')[0], 30)}`, m + 10, y + 6, { font: 'F2', size: 8.5, color: C_GANACHE });
        p.text(`${fmtMoney(c.adjustedPrice)}  ×  ${c.weightPct.toFixed(1)}%`, PORTRAIT_W - m - 10, y + 6, {
          font: 'F2',
          size: 8.5,
          color: C_BURGUNDY,
          align: 'right'
        });
        const reasons = (c.weightReasons || []).slice(0, 3).join(' · ') || 'No major weight penalties';
        p.text(truncateText(`${c.distanceMi} mi · ${c.monthsSinceSale} mo · ${c.grossAdjustmentPct.toFixed(1)}% gross · ${reasons}`, 88), m + 10, y + 17, {
          font: 'F1',
          size: 7.5,
          color: C_MUTED
        });
        y += 28;
      });
    }

    y += 14;
    // 3. Guideline Checks
    p.rect(m, y, PORTRAIT_W - m * 2, 22, { fill: C_GANACHE });
    p.text('USPAP & FANNIE MAE GUIDELINE CHECKS', m + 12, y + 6, { font: 'F2', size: 8.5, color: C_CREAM });
    y += 22;

    checks.slice(0, 9).forEach((chk, idx) => {
      if (y > PORTRAIT_H - 72) return;
      p.rect(m, y, PORTRAIT_W - m * 2, 28, { fill: idx % 2 === 0 ? C_WHITE : C_SOFT_ROW, stroke: C_BORDER, lineWidth: 0.4 });
      const stLabel = chk.status === 'pass' ? 'PASS' : chk.status === 'fail' ? 'FAIL' : 'WARN';
      const stColor = chk.status === 'pass' ? C_POSITIVE : chk.status === 'fail' ? C_BURGUNDY : C_MUTED;
      p.text(stLabel, m + 10, y + 6, { font: 'F2', size: 7.5, color: stColor });
      p.text(truncateText(chk.label, 48), m + 46, y + 6, { font: 'F2', size: 8.2, color: C_GANACHE });
      p.text(truncateText(chk.detail, 86), m + 46, y + 17, { font: 'F1', size: 7.5, color: C_MUTED });
      y += 28;
    });

    pages.push(p);
  }

  // =========================================================================
  // PAGE 6: NOTES (Letter Portrait)
  // =========================================================================
  {
    const p = createPage(PORTRAIT_W, PORTRAIT_H);
    const m = 42;
    drawPageHeader(p, 'Section 05 · Analyst Notes', 'Property & Comparable Notes', address);

    let y = 78;
    p.rect(m, y, PORTRAIT_W - m * 2, 22, { fill: C_GANACHE });
    p.text('SUBJECT PROPERTY NOTES', m + 12, y + 6, { font: 'F2', size: 8.5, color: C_CREAM });
    y += 22;

    const propNotesLines = wrapLines(
      property.notes || 'No subject property notes have been added yet.',
      84
    );
    const propBoxH = Math.max(64, Math.min(220, propNotesLines.length * 14 + 22));
    p.rect(m, y, PORTRAIT_W - m * 2, propBoxH, { fill: C_WHITE, stroke: C_BORDER });
    let ny = y + 12;
    for (const ln of propNotesLines.slice(0, 14)) {
      p.text(ln, m + 12, ny, { font: 'F1', size: 9, color: C_GANACHE });
      ny += 14;
    }
    y += propBoxH + 18;

    p.rect(m, y, PORTRAIT_W - m * 2, 22, { fill: C_GANACHE });
    p.text('COMPARABLE SALE NOTES', m + 12, y + 6, { font: 'F2', size: 8.5, color: C_CREAM });
    y += 22;

    const compsWithNotes = comps.filter((c) => c.notes || c.compDetails?.notes);
    if (compsWithNotes.length === 0) {
      p.rect(m, y, PORTRAIT_W - m * 2, 46, { fill: C_WHITE, stroke: C_BORDER });
      p.text('No individual comparable notes recorded.', m + 12, y + 16, { font: 'F1', size: 9, color: C_MUTED });
    } else {
      compsWithNotes.slice(0, 8).forEach((c, idx) => {
        if (y > PORTRAIT_H - 90) return;
        const txt = c.compDetails?.notes || c.notes || '';
        const lines = wrapLines(txt, 82).slice(0, 3);
        const h = 22 + lines.length * 13;
        p.rect(m, y, PORTRAIT_W - m * 2, h, { fill: idx % 2 === 0 ? C_WHITE : C_SOFT_ROW, stroke: C_BORDER, lineWidth: 0.4 });
        p.text(`${truncateText(c.address, 48)} (${fmtShortDate(c.sold_date)})`, m + 12, y + 6, {
          font: 'F2',
          size: 8.5,
          color: C_GANACHE
        });
        let cy = y + 20;
        for (const ln of lines) {
          p.text(ln, m + 12, cy, { font: 'F1', size: 8.5, color: C_MUTED });
          cy += 13;
        }
        y += h;
      });
    }

    pages.push(p);
  }

  // =========================================================================
  // PAGE 7: SOURCES & DATES (Letter Portrait)
  // =========================================================================
  {
    const p = createPage(PORTRAIT_W, PORTRAIT_H);
    const m = 42;
    drawPageHeader(p, 'Section 06 · Provenance', 'Data Sources, Dates & Methodology', address);

    let y = 78;
    const sourceRows = [
      ['Report Generated', reportDateStr],
      ['County Property Appraiser Roll', `${countyName} County DOR NAL / SDF (${countyData?.roll_year ? `Tax Roll ${countyData.roll_year}` : 'Current roll'})`],
      ['County Sales Complete Through', countyFreshness?.complete_through || 'Latest verified complete county month'],
      ['County Parcel Imported', countyData?.imported_at ? fmtShortDate(countyData.imported_at) : 'Current import'],
      ['Living Area Basis', 'FL DOR TOT_LVG_AREA (heated / finished living area, excluding garages & open porches)'],
      ['GLA Rate Source', grid?.glaRateSource || 'South Florida tier adjustment library'],
      ['Time Adjustment Trend Source', grid?.timeTrendSource || 'Measured ZIP sales trend (capped ±10%)'],
      ['Price Source Basis', `${pricing.label}${pricing.referencePrice ? ` (${fmtMoney(pricing.referencePrice)})` : ''}`],
      ['Privacy & PII Policy', 'Strictly non-PII: parcel owner names and mailing addresses are never imported or displayed.']
    ];

    p.rect(m, y, PORTRAIT_W - m * 2, 22, { fill: C_GANACHE });
    p.text('DATA SOURCES & RECORD DATES', m + 12, y + 6, { font: 'F2', size: 8.5, color: C_CREAM });
    y += 22;

    sourceRows.forEach(([lbl, val], idx) => {
      const wrapped = wrapLines(val, 58).slice(0, 2);
      const h = Math.max(26, wrapped.length * 13 + 12);
      p.rect(m, y, PORTRAIT_W - m * 2, h, { fill: idx % 2 === 0 ? C_WHITE : C_SOFT_ROW, stroke: C_BORDER, lineWidth: 0.4 });
      p.text(lbl, m + 10, y + 8, { font: 'F2', size: 8.5, color: C_MUTED });
      let vy = y + 8;
      for (const ln of wrapped) {
        p.text(ln, m + 185, vy, { font: 'F1', size: 8.8, color: C_GANACHE });
        vy += 13;
      }
      y += h;
    });

    y += 18;
    p.rect(m, y, PORTRAIT_W - m * 2, 92, { fill: C_SOFT_ROW, stroke: C_PERIWINKLE });
    p.text('METHODOLOGY & LIMITING CONDITIONS', m + 14, y + 12, { font: 'F2', size: 8.5, color: C_GANACHE });
    const discLines = wrapLines(
      'This document is a private sales-comparison valuation estimate prepared strictly for the user\'s own investment analysis. Adjustments follow CIA (Comp Inferior -> Add) and CBS (Comp Better -> Subtract) conventions, cap market-condition time adjustments at +/-10% unless overridden, and weight comparable sales by gross adjustment %, size parity, recency, proximity, verification, and completeness. It is NOT a formal USPAP-compliant real estate appraisal.',
      84
    );
    let dy = y + 28;
    for (const ln of discLines.slice(0, 5)) {
      p.text(ln, m + 14, dy, { font: 'F1', size: 8.5, color: C_GANACHE });
      dy += 12;
    }

    pages.push(p);
  }

  // Stamp running footer & page numbers on every page
  const totalPages = pages.length;
  pages.forEach((page, i) => {
    drawFooter(page, i + 1, totalPages);
  });

  // =========================================================================
  // Assemble valid %PDF-1.4 binary with exact byte offsets in xref table
  // =========================================================================
  const objects = [];
  const addObj = (bodyStr) => {
    objects.push(bodyStr);
    return objects.length; // 1-based PDF object number
  };

  const fontIds = {
    F1: addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    F2: addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    F3: addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>'),
    F4: addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>')
  };

  // Reserve Pages object id (will fill after creating Page objects)
  const pagesObjId = addObj('');
  const pageObjIds = [];

  for (const pg of pages) {
    const streamContent = `${pg.ops.join('\n')}\n`;
    const streamLen = new TextEncoder().encode(streamContent).length;
    const contentId = addObj(`<< /Length ${streamLen} >>\nstream\n${streamContent}endstream`);
    const pageId = addObj(
      `<< /Type /Page /Parent ${pagesObjId} 0 R /MediaBox [0 0 ${pg.width} ${pg.height}] /Resources << /Font << /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R /F3 ${fontIds.F3} 0 R /F4 ${fontIds.F4} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageObjIds.push(pageId);
  }

  objects[pagesObjId - 1] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`;
  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`);

  const encoder = new TextEncoder();
  const chunks = [];
  let offset = 0;

  const pushStr = (s) => {
    const bytes = encoder.encode(s);
    chunks.push(bytes);
    offset += bytes.length;
  };

  pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    pushStr(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
  }

  const xrefOffset = offset;
  pushStr(`xref\n0 ${objects.length + 1}\n`);
  pushStr('0000000000 65535 f \n');
  for (let i = 1; i < offsets.length; i++) {
    pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const pdfBytes = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of chunks) {
    pdfBytes.set(c, pos);
    pos += c.length;
  }
  return pdfBytes;
}

/**
 * Encodes the generated Valuation Estimate PDF as a data:application/pdf;base64 string
 * for 1-click upload to /api/investor/documents.
 */
export function buildValuationEstimatePdfBase64(params) {
  const bytes = buildValuationEstimatePdfBytes(params);
  if (typeof Buffer !== 'undefined') {
    return `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`;
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:application/pdf;base64,${btoa(binary)}`;
}
