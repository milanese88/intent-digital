#!/usr/bin/env node
/**
 * scripts/pa/inspect-pa-pdf.mjs
 *
 * Local diagnostic for Property Appraiser record PDFs (never commit the PDFs —
 * /data/ is gitignored). Prints ONLY the sanitized text (owner names, mailing
 * addresses and grantor/grantee names removed) plus the parsed fields and the
 * list of fields reported as "not found".
 *
 * Usage:
 *   node scripts/pa/inspect-pa-pdf.mjs data/pa-samples/360-holly-ln.pdf [more.pdf ...]
 *   node scripts/pa/inspect-pa-pdf.mjs data/pa-samples            # every PDF in the folder
 *   node scripts/pa/inspect-pa-pdf.mjs <file> --json               # parsed JSON only
 */

import fs from 'node:fs';
import path from 'node:path';
import { extractPdfText } from '../../api/_lib/pdfText.js';
import { parsePaRecordText, sanitizeAndStripPii } from '../../src/utils/paRecordParser.js';

const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const targets = args.filter((a) => !a.startsWith('--'));

if (targets.length === 0) {
  console.error('Usage: node scripts/pa/inspect-pa-pdf.mjs <file.pdf|folder> [...] [--json]');
  process.exit(1);
}

const files = targets.flatMap((t) => {
  if (!fs.existsSync(t)) {
    console.error(`Not found: ${t}`);
    return [];
  }
  if (fs.statSync(t).isDirectory()) {
    return fs.readdirSync(t).filter((f) => f.toLowerCase().endsWith('.pdf')).map((f) => path.join(t, f));
  }
  return [t];
});

const fmt = (v) => (v == null || (Array.isArray(v) && v.length === 0) ? 'not found' : v);

for (const file of files) {
  const { text, pageCount } = await extractPdfText(fs.readFileSync(file));
  const parsed = parsePaRecordText(text);
  if (jsonOnly) {
    console.log(JSON.stringify({ file: path.basename(file), ...parsed }, null, 2));
    continue;
  }
  const b = parsed.buildingInfo;
  const f = parsed.features;
  console.log('='.repeat(100));
  console.log(`${path.basename(file)} — ${pageCount} page(s)`);
  console.log('='.repeat(100));
  console.log('--- SANITIZED TEXT (owner / mailing / grantor-grantee removed) ---');
  console.log(sanitizeAndStripPii(text));
  console.log('\n--- PARSED FIELDS ---');
  console.table({
    county: fmt(parsed.county),
    folio: fmt(parsed.folio),
    address: fmt(parsed.address),
    livingSqft: b.livingSqft != null ? `${b.livingSqft} (${b.livingSqftLabel})` : 'not found',
    adjustedBuildingSqft: fmt(b.adjustedBuildingSqft),
    yearBuilt: fmt(b.yearBuilt),
    effectiveYearBuilt: fmt(b.effectiveYearBuilt),
    beds: fmt(b.beds),
    baths: b.baths != null ? `${b.baths} (full ${b.fullBaths ?? '?'} / half ${b.halfBaths ?? '?'})` : 'not found',
    stories: fmt(b.stories),
    construction: b.construction ? `${b.construction} ("${b.constructionRaw}")` : 'not found',
    roofCover: b.roofCover ? `${b.roofCover} ("${b.roofCoverRaw}")` : 'not found',
    roofStructure: b.roofStructure ? `${b.roofStructure} ("${b.roofStructureRaw}")` : 'not found',
    quality: fmt(b.qualityGrade),
    condition: fmt(b.conditionRating),
    pool: f.hasPool == null ? 'not found' : `${f.hasPool}${f.poolYear ? ` · ${f.poolYear}` : ''}${f.poolSqft ? ` · ${f.poolSqft} sf` : ''}`,
    dock: f.hasDock == null ? 'not found' : `${f.hasDock}${f.dockSqft ? ` · ${f.dockSqft} sf` : ''}${f.dockYear ? ` · ${f.dockYear}` : ''}`,
    boatLift: fmt(f.hasBoatLift),
    neighborhoodCode: fmt(parsed.neighborhoodCode),
    legalDescription: parsed.legalDescription ? parsed.legalDescription.slice(0, 80) : 'not found',
    sales: parsed.salesHistory.length
      ? `${parsed.salesHistory.length} (${parsed.salesHistory[parsed.salesHistory.length - 1].saleDate} → ${parsed.salesHistory[0].saleDate})`
      : 'not found',
    values: parsed.valueHistory.length
      ? `${parsed.valueHistory.length} yrs (${parsed.valueHistory[parsed.valueHistory.length - 1].rollYear}–${parsed.valueHistory[0].rollYear})`
      : 'not found',
    subAreas: parsed.subAreas.length ? parsed.subAreas.map((s) => `${s.code}:${s.sqft}`).join(', ') : 'not found'
  });
  if (parsed.salesHistory.length) {
    console.log('\nSales:');
    console.table(parsed.salesHistory.map(({ saleDate, salePrice, deedType, orBook, orPage, instrument }) => ({ saleDate, salePrice, deedType, bookPage: orBook ? `${orBook}/${orPage}` : '', instrument })));
  }
  if (parsed.valueHistory.length) {
    console.log('\nValue history:');
    console.table(parsed.valueHistory.map(({ rollYear, landValue, improvementValue, justValue }) => ({ rollYear, landValue, improvementValue, justValue })));
  }
  console.log(`\nSections recognised: ${parsed.sectionsFound.join(', ') || 'none'}`);
  console.log(`Not found: ${parsed.notFound.join(', ') || '—'}`);
  console.log(`Field sources: ${JSON.stringify(parsed.fieldSources)}\n`);
}

