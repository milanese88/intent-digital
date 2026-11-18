#!/usr/bin/env node

/**
 * Imports official FDLE reporting-agency offense data (CSV) into fdle_agency_stats.
 * FDLE data is strictly agency-level (never "neighborhood").
 *
 * Strictly uses .env.local via scripts/db/_lib.mjs. Supports --dry-run.
 *
 * Usage:
 *   node scripts/location/import-fdle-ucr.mjs --file data/location/fdle-agency-summary.csv --year 2025 [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createEnvLocalSqlClient } from '../db/_lib.mjs';

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const fileIdx = args.indexOf('--file');
  const yearIdx = args.indexOf('--year');

  const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const reportYear = yearIdx >= 0 ? Number(args[yearIdx + 1]) : null;

  if (!filePath || !reportYear) {
    console.error('Usage: node scripts/location/import-fdle-ucr.mjs --file <fdle.csv> --year <YYYY> [--dry-run]');
    process.exit(1);
  }

  const lines = fs
    .readFileSync(path.resolve(filePath), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idxOf = (re) => headers.findIndex((h) => re.test(h));

  const oriIdx = idxOf(/ori|agency_code/);
  const agencyIdx = idxOf(/agency|department/);
  const countyIdx = idxOf(/county/);
  const popIdx = idxOf(/pop/);
  const violentIdx = idxOf(/violent.*count|total.*violent/);
  const propIdx = idxOf(/property.*count|total.*property/);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCsvLine(lines[i]);
    const countyRaw = String(c[countyIdx] || '').trim();
    if (!/broward|palm\s*beach/i.test(countyRaw)) continue;

    const county = /palm/i.test(countyRaw) ? 'Palm Beach' : 'Broward';
    const agencyName = String(c[agencyIdx] || '').trim();
    if (!agencyName) continue;

    const agencyOri = String(c[oriIdx] || `${county}-${agencyName}`)
      .trim()
      .toUpperCase();
    const isSheriff = /sheriff/i.test(agencyName) && !/city|town|village/i.test(agencyName);
    const jurisdictionKey = isSheriff
      ? 'unincorporated'
      : agencyName
          .replace(/police\s*department|pd|public\s*safety/gi, '')
          .trim()
          .toLowerCase();

    const pop = Number(String(c[popIdx] || '').replace(/,/g, '')) || null;
    const violent = Number(String(c[violentIdx] || '').replace(/,/g, '')) || 0;
    const property = Number(String(c[propIdx] || '').replace(/,/g, '')) || 0;

    rows.push({
      agency_ori: agencyOri,
      report_year: reportYear,
      agency_name: agencyName,
      county,
      jurisdiction_key: jurisdictionKey,
      is_unincorporated_sheriff: isSheriff,
      population: pop,
      violent_count: violent,
      property_count: property,
      violent_rate_per_100k: pop && pop > 0 ? Math.round((violent / pop) * 1000000) / 10 : null,
      property_rate_per_100k: pop && pop > 0 ? Math.round((property / pop) * 1000000) / 10 : null,
      source: `Florida Department of Law Enforcement (FDLE) ${reportYear} Offense Summary`
    });
  }

  console.log(`Prepared ${rows.length} Broward/Palm Beach FDLE agency rows for ${reportYear}.`);
  if (isDryRun) return;

  const { sql } = createEnvLocalSqlClient();
  for (const r of rows) {
    await sql`
      INSERT INTO fdle_agency_stats (
        agency_ori, report_year, agency_name, county, jurisdiction_key,
        is_unincorporated_sheriff, population, violent_count, property_count,
        violent_rate_per_100k, property_rate_per_100k, source
      ) VALUES (
        ${r.agency_ori}, ${r.report_year}, ${r.agency_name}, ${r.county}, ${r.jurisdiction_key},
        ${r.is_unincorporated_sheriff}, ${r.population}, ${r.violent_count}, ${r.property_count},
        ${r.violent_rate_per_100k}, ${r.property_rate_per_100k}, ${r.source}
      )
      ON CONFLICT (agency_ori, report_year) DO UPDATE SET
        agency_name = EXCLUDED.agency_name,
        jurisdiction_key = EXCLUDED.jurisdiction_key,
        is_unincorporated_sheriff = EXCLUDED.is_unincorporated_sheriff,
        population = EXCLUDED.population,
        violent_count = EXCLUDED.violent_count,
        property_count = EXCLUDED.property_count,
        violent_rate_per_100k = EXCLUDED.violent_rate_per_100k,
        property_rate_per_100k = EXCLUDED.property_rate_per_100k,
        source = EXCLUDED.source;
    `;
  }

  console.log('FDLE agency stats imported cleanly.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('import-fdle-ucr failed:', err);
    process.exit(1);
  });
}
