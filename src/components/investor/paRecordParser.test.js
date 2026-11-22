import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  sanitizeAndStripPii,
  parsePaRecordText,
  parseFolio,
  parseSalesRow,
  detectSectionHeading,
  classifyRoofCover,
  classifyRoofStructure,
  classifyConstruction
} from '../../utils/paRecordParser.js';
import { itemsToLines, extractPdfText } from '../../../api/_lib/pdfText.js';
import { MARTIN_FIXTURE, BROWARD_FIXTURE, AMBIGUOUS_FIXTURE, OWNER_TOKENS } from './__fixtures__/paRecordFixtures.js';

function assertNoPii(text) {
  for (const tok of OWNER_TOKENS) {
    assert.equal(text.includes(tok), false, `PII token ${tok} leaked`);
  }
}

test('PA parser: owner, mailing, and grantor/grantee cells are stripped while property cells survive', () => {
  for (const fx of [MARTIN_FIXTURE, BROWARD_FIXTURE]) {
    const clean = sanitizeAndStripPii(fx);
    assertNoPii(clean);
    const parsed = parsePaRecordText(fx);
    assertNoPii(JSON.stringify(parsed));
  }
  const m = sanitizeAndStripPii(MARTIN_FIXTURE);
  assert.ok(m.includes('18801 SE RIVER RIDGE RD'));
  assert.ok(m.includes('03/14/2019') === false && m.includes('2019-03-14'), 'sales rows are rebuilt from tokens');
  const b = sanitizeAndStripPii(BROWARD_FIXTURE);
  assert.ok(b.includes('360 HOLLY LN'));
  assert.ok(b.includes('Units/Beds/Baths | 1/3/2'));
});

test('PA parser: Martin (MCPA layout) — 4,307 sf, 1988, 3 bd / 7 ba, wood frame, cement tile, pool 2026 148 sf, dock 362 sf', () => {
  const p = parsePaRecordText(MARTIN_FIXTURE, { sourceDate: '2026-11-21' });
  assert.equal(p.source, 'PA record PDF, 2026-11-21');
  assert.equal(p.county, 'Martin');
  assert.equal(p.folio, '23-40-42-002-000-01070-1');
  assert.equal(p.address, '18801 SE RIVER RIDGE RD');
  assert.equal(p.buildingInfo.livingSqft, 4307);
  assert.equal(p.buildingInfo.livingSqftLabel, 'finished area');
  assert.equal(p.buildingInfo.yearBuilt, 1988);
  assert.equal(p.buildingInfo.beds, 3);
  assert.equal(p.buildingInfo.fullBaths, 7);
  assert.equal(p.buildingInfo.baths, 7);
  assert.equal(p.buildingInfo.construction, 'Wood frame');
  assert.equal(p.buildingInfo.roofCover, 'Cement tile');
  assert.equal(p.buildingInfo.roofStructure, 'Hip');
  assert.equal(p.buildingInfo.stories, 2);
  assert.equal(p.features.hasPool, true);
  assert.equal(p.features.poolYear, 2026);
  assert.equal(p.features.poolSqft, 148);
  assert.equal(p.features.hasDock, true);
  assert.equal(p.features.dockSqft, 362);
  assert.equal(p.features.dockYear, 1998);
  assert.equal(p.neighborhoodCode, '1407');
  assert.equal(p.legalDescription, 'RIVER RIDGE PLAT LOT 107');

  assert.equal(p.salesHistory.length, 3);
  assert.equal(p.salesHistory.at(-1).saleDate, '1986-07-15');
  assert.equal(p.salesHistory.at(-1).salePrice, 385000);
  assert.equal(p.salesHistory[0].deedType, 'WD');
  assert.equal(p.salesHistory[0].orBook, '3045');
  assert.equal(p.salesHistory[0].orPage, '1120');
  assert.equal('rawLine' in p.salesHistory[0], false, 'raw sale lines (could hold names) are never returned');

  assert.deepEqual(p.valueHistory.map((v) => v.rollYear), [2026, 2025, 2010]);
  assert.equal(p.valueHistory[0].landValue, 1450000);
  assert.equal(p.valueHistory[0].improvementValue, 1353500);
  assert.equal(p.valueHistory[0].justValue, 2803500);
  // A pool's "Year Built" (2026) must never become the house's year built
  assert.notEqual(p.buildingInfo.yearBuilt, 2026);
});

test('PA parser: Broward (BCPA layout) — Eff./Act. year, Units/Beds/Baths, Under Air, values table, sales with CIN', () => {
  const p = parsePaRecordText(BROWARD_FIXTURE);
  assert.equal(p.county, 'Broward');
  assert.equal(p.folio, '504102030600');
  assert.equal(p.address, '360 HOLLY LN');
  assert.equal(p.buildingInfo.yearBuilt, 1963);
  assert.equal(p.buildingInfo.effectiveYearBuilt, 1975);
  assert.equal(p.buildingInfo.beds, 3);
  assert.equal(p.buildingInfo.baths, 2);
  assert.equal(p.buildingInfo.livingSqft, 1862);
  assert.equal(p.buildingInfo.adjustedBuildingSqft, 2145);
  // BCPA summary has no construction / roof fields → must be "not found", not guessed
  assert.equal(p.buildingInfo.construction, null);
  assert.equal(p.buildingInfo.roofCover, null);
  assert.equal(p.buildingInfo.roofStructure, null);
  assert.ok(p.notFound.includes('buildingInfo.construction'));
  assert.ok(p.notFound.includes('buildingInfo.roofStructure'));
  assert.equal(p.features.hasPool, null);
  assert.ok(p.notFound.includes('features.pool'));

  assert.equal(p.valueHistory.length, 2);
  assert.equal(p.valueHistory[0].rollYear, 2026);
  assert.equal(p.valueHistory[0].landValue, 286800);
  assert.equal(p.valueHistory[0].improvementValue, 312450);
  assert.equal(p.valueHistory[0].justValue, 599250);
  assert.equal(p.valueHistory[1].justValue, 570100, 'wrapped/short row accepted only because land + building = just');

  assert.equal(p.salesHistory.length, 2);
  assert.equal(p.salesHistory[0].saleDate, '2021-01-12');
  assert.equal(p.salesHistory[0].salePrice, 505000);
  assert.equal(p.salesHistory[0].deedType, 'WD');
  assert.equal(p.salesHistory[0].instrument, '117045678');
  assert.equal(p.salesHistory[1].orBook, '28412');
  assert.equal(p.salesHistory[1].orPage, '1123');
});

test('PA parser: never guesses — unlabeled text yields "not found" instead of Flat roof / pool / year', () => {
  const p = parsePaRecordText(AMBIGUOUS_FIXTURE);
  assert.equal(p.county, null);
  assert.equal(p.buildingInfo.roofStructure, null, 'the word FLAT outside a roof label is not a roof');
  assert.equal(p.buildingInfo.yearBuilt, null);
  assert.equal(p.buildingInfo.livingSqft, null);
  assert.equal(p.buildingInfo.beds, null);
  assert.equal(p.features.hasPool, null, 'POOL DECK outside an extra-features table is not a pool');
  assert.equal(p.salesHistory.length, 0);
  assert.equal(p.valueHistory.length, 0);
  for (const f of ['buildingInfo.yearBuilt', 'buildingInfo.livingSqft', 'buildingInfo.roofStructure', 'features.pool', 'salesHistory', 'valueHistory']) {
    assert.ok(p.notFound.includes(f), `${f} should be reported as not found`);
  }
});

test('PA parser helpers: folio formats, sales rows, headings, classifiers', () => {
  assert.equal(parseFolio('Property ID: 5041 02 03 0600'), '504102030600');
  assert.equal(parseFolio('Folio 504102030600'), '504102030600');
  assert.equal(parseFolio('PCN 00-43-43-09-02-001-0110'), '00-43-43-09-02-001-0110');
  assert.equal(parseFolio('Parcel ID 23-40-42-002-000-01070-1'), '23-40-42-002-000-01070-1');

  assert.equal(parseSalesRow('Sale Date | Sale Price | Deed Type'), null);
  assert.equal(parseSalesRow('2019 roof permit 1,200'), null, 'no full date → not a sale');
  const s = parseSalesRow('07/15/1986 | QUIT CLAIM DEED | $100 | Book 712 Page 1450');
  assert.equal(s.saleDate, '1986-07-15');
  assert.equal(s.salePrice, 100);
  assert.equal(s.deedType, 'QCD');
  assert.equal(s.orBook, '712');
  assert.equal(s.orPage, '1450');

  assert.equal(detectSectionHeading('Sales History for this Parcel'), 'sales');
  assert.equal(detectSectionHeading('Property Assessment Values'), 'values');
  assert.equal(detectSectionHeading('Extra Features'), 'features');
  assert.equal(detectSectionHeading('Land Value | $400,000'), null);

  assert.equal(classifyRoofCover('CONC TILE'), 'Cement tile');
  assert.equal(classifyRoofCover('HIP'), null);
  assert.equal(classifyRoofStructure('GABLE/HIP'), 'Gable / Hip');
  assert.equal(classifyConstruction('CB STUCCO'), 'CBS');
  assert.equal(classifyConstruction('WOOD FRAME/STUCCO'), 'Wood frame');
  assert.equal(classifyConstruction('UNKNOWN'), null);
});

test('pdfText.itemsToLines: groups by baseline, orders left→right, marks wide gaps as table cells', () => {
  const item = (str, x, y, width) => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10 });
  const lines = itemsToLines([
    item('Sale Price', 160, 700, 45),
    item('Sale Date', 40, 700, 42),
    item('07/15/1986', 40, 685, 48),
    item('$385,000', 160, 685.6, 40),
    item('Year', 40, 650, 20),
    item('Built', 62, 650, 22)
  ]);
  assert.deepEqual(lines, ['Sale Date | Sale Price', '07/15/1986 | $385,000', 'Year Built']);
});

// Minimal uncompressed PDF writer (Helvetica, absolute-positioned text) for an end-to-end pdfjs test.
function buildPdf(items) {
  const content = items
    .map(([text, x, y]) => `BT /F1 10 Tf ${x} ${y} Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`)
    .join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

test('pdfText.extractPdfText (pdfjs-dist): end-to-end PDF → table rows → parsed fields, owner removed', async () => {
  const pdf = buildPdf([
    ['Martin County Property Appraiser', 40, 760],
    ['Owner Information', 40, 740], ['PLACEHOLDER-OWNER-A', 40, 726],
    ['Building Information', 40, 700],
    ['Year Built', 40, 685], ['Finished Area', 160, 685], ['Bedrooms', 300, 685],
    ['1988', 40, 670], ['4,307', 160, 670], ['3', 300, 670],
    ['Sales History', 40, 640],
    ['Sale Date', 40, 625], ['Sale Price', 160, 625], ['Grantor', 300, 625], ['Deed Type', 440, 625],
    ['07/15/1986', 40, 610], ['$385,000', 160, 610], ['PLACEHOLDER-GRANTOR', 300, 610], ['WD', 440, 610]
  ]);
  const { text, pageCount } = await extractPdfText(pdf);
  assert.equal(pageCount, 1);
  assert.ok(text.includes('Year Built | Finished Area | Bedrooms'), text);
  assert.ok(text.includes('1988 | 4,307 | 3'), text);

  const parsed = parsePaRecordText(text);
  assertNoPii(JSON.stringify(parsed));
  assertNoPii(sanitizeAndStripPii(text));
  assert.equal(parsed.county, 'Martin');
  assert.equal(parsed.buildingInfo.yearBuilt, 1988);
  assert.equal(parsed.buildingInfo.livingSqft, 4307);
  assert.equal(parsed.buildingInfo.beds, 3);
  assert.equal(parsed.salesHistory.length, 1);
  assert.equal(parsed.salesHistory[0].saleDate, '1986-07-15');
  assert.equal(parsed.salesHistory[0].salePrice, 385000);
});

test('PA sample PDFs are never committed (data/ is gitignored)', () => {
  const gitignore = fs.readFileSync('.gitignore', 'utf8');
  assert.match(gitignore, /^\/data\/$/m);
});

