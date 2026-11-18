#!/usr/bin/env node

/**
 * Imports:
 *  1) Official School Attendance Boundary GeoJSON layers for Palm Beach County
 *     and Broward County Public Schools into school_attendance_zones.
 *  2) Official FLDOE School Grades CSV into fldoe_school_grades.
 *
 * Strictly uses .env.local via scripts/db/_lib.mjs. Supports --dry-run.
 *
 * Usage:
 *   node scripts/location/import-schools-and-grades.mjs \
 *     --boundaries data/location/pbc-elementary.geojson --county "Palm Beach" --level elementary --year "2025-2026"
 *
 *   node scripts/location/import-schools-and-grades.mjs \
 *     --grades data/location/SchoolGrades26.csv --year "2025-2026"
 */

import fs from 'node:fs';
import path from 'node:path';
import { createEnvLocalSqlClient } from '../db/_lib.mjs';
import { normalizeSchoolNumber } from '../../api/_lib/location-engine.js';

function computeGeometryBbox(geom) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  const visitRing = (ring) => {
    for (const pt of ring) {
      const [lng, lat] = pt;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  };

  if (geom?.type === 'Polygon') {
    geom.coordinates.forEach(visitRing);
  } else if (geom?.type === 'MultiPolygon') {
    geom.coordinates.forEach((poly) => poly.forEach(visitRing));
  }

  if (!Number.isFinite(minLat)) return null;
  return { minLat, maxLat, minLng, maxLng };
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

async function importBoundaries({ filePath, county, level, year, isDryRun, sql }) {
  const normCounty = /palm/i.test(county) ? 'Palm Beach' : 'Broward';
  const districtNumber = normCounty === 'Palm Beach' ? '50' : '06';
  const sourceName =
    normCounty === 'Palm Beach'
      ? 'School District of Palm Beach County GIS Attendance Boundaries'
      : 'Broward County Public Schools GIS Attendance Boundaries';

  const geo = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  const features = Array.isArray(geo?.features) ? geo.features : [];
  const rows = [];

  for (const f of features) {
    const props = f.properties || {};
    const bbox = computeGeometryBbox(f.geometry);
    if (!bbox) continue;

    const rawNum =
      props.SCH_NUM ||
      props.SCHOOL_NUM ||
      props.SCHOOL_NO ||
      props.SCH_CODE ||
      props.LOC_NUMBER ||
      props.COST_CENTER ||
      props.MSID ||
      '';
    const schoolNumber = normalizeSchoolNumber(rawNum);
    const schoolName = String(
      props.SCH_NAME || props.SCHOOL_NAME || props.NAME || props.FACILITY || ''
    ).trim();

    if (!schoolNumber || !schoolName) continue;

    rows.push({
      county: normCounty,
      level,
      district_number: districtNumber,
      school_number: schoolNumber,
      school_name: schoolName,
      school_year: year || null,
      min_lat: bbox.minLat,
      max_lat: bbox.maxLat,
      min_lng: bbox.minLng,
      max_lng: bbox.maxLng,
      geometry_geojson: f.geometry,
      source: sourceName
    });
  }

  console.log(`Prepared ${rows.length} ${normCounty} ${level} attendance zones.`);
  if (isDryRun) return;

  for (const r of rows) {
    await sql`
      INSERT INTO school_attendance_zones (
        county, level, district_number, school_number, school_name, school_year,
        min_lat, max_lat, min_lng, max_lng, geometry_geojson, source
      ) VALUES (
        ${r.county}, ${r.level}, ${r.district_number}, ${r.school_number}, ${r.school_name}, ${r.school_year},
        ${r.min_lat}, ${r.max_lat}, ${r.min_lng}, ${r.max_lng}, ${JSON.stringify(r.geometry_geojson)}::jsonb, ${r.source}
      )
      ON CONFLICT (county, level, school_number) DO UPDATE SET
        school_name = EXCLUDED.school_name,
        school_year = EXCLUDED.school_year,
        min_lat = EXCLUDED.min_lat,
        max_lat = EXCLUDED.max_lat,
        min_lng = EXCLUDED.min_lng,
        max_lng = EXCLUDED.max_lng,
        geometry_geojson = EXCLUDED.geometry_geojson,
        source = EXCLUDED.source;
    `;
  }
}

async function importFldoeGrades({ filePath, year, isDryRun, sql }) {
  const lines = fs
    .readFileSync(path.resolve(filePath), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  const headerIdx = lines.findIndex((l) => /district/i.test(l) && /school/i.test(l));
  if (headerIdx < 0) {
    throw new Error('Could not find District/School header row in FLDOE CSV.');
  }

  const headers = parseCsvLine(lines[headerIdx]).map((h) => h.toLowerCase());
  const col = (re) => headers.findIndex((h) => re.test(h));

  const distIdx = col(/district\s*number|^dist/);
  const schNumIdx = col(/school\s*number|^sch.*num/);
  const schNameIdx = col(/school\s*name/);
  const gradeIdx = col(/grade\s*20|current.*grade|^grade$/);
  const pctIdx = col(/percent.*total.*points|pct.*points/);
  const charterIdx = col(/charter/);
  const typeIdx = col(/school\s*type|^type/);

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const distRaw = String(cells[distIdx] || '').trim().padStart(2, '0');
    if (distRaw !== '06' && distRaw !== '50') continue; // Broward (06) & Palm Beach (50)

    const county = distRaw === '50' ? 'Palm Beach' : 'Broward';
    const schoolNumber = normalizeSchoolNumber(cells[schNumIdx]);
    const schoolName = String(cells[schNameIdx] || '').trim();
    const grade = gradeIdx >= 0 ? String(cells[gradeIdx] || '').trim().toUpperCase() || null : null;
    const pctPoints =
      pctIdx >= 0 && cells[pctIdx] !== '' && !Number.isNaN(Number(cells[pctIdx]))
        ? Number(cells[pctIdx])
        : null;
    const charter = charterIdx >= 0 ? /^y/i.test(String(cells[charterIdx] || '').trim()) : false;
    const schoolType = typeIdx >= 0 ? String(cells[typeIdx] || '').trim() || null : null;

    if (!schoolNumber || !schoolName) continue;
    rows.push({
      district_number: distRaw,
      school_number: schoolNumber,
      school_year: year,
      county,
      school_name: schoolName,
      grade,
      pct_points: pctPoints,
      school_type: schoolType,
      charter,
      source: `Florida Department of Education (FLDOE) ${year} School Grades`
    });
  }

  console.log(`Prepared ${rows.length} Broward & Palm Beach FLDOE school grade rows for ${year}.`);
  if (isDryRun) return;

  const BATCH = 300;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await sql`
      INSERT INTO fldoe_school_grades (
        district_number, school_number, school_year, county, school_name,
        grade, pct_points, school_type, charter, source
      )
      SELECT * FROM json_to_recordset(${JSON.stringify(slice)}::json)
        AS x(
          district_number text,
          school_number text,
          school_year text,
          county text,
          school_name text,
          grade text,
          pct_points numeric,
          school_type text,
          charter boolean,
          source text
        )
      ON CONFLICT (district_number, school_number, school_year) DO UPDATE SET
        school_name = EXCLUDED.school_name,
        grade = EXCLUDED.grade,
        pct_points = EXCLUDED.pct_points,
        school_type = EXCLUDED.school_type,
        charter = EXCLUDED.charter,
        source = EXCLUDED.source;
    `;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : null;
  };

  const boundariesFile = getArg('--boundaries');
  const gradesFile = getArg('--grades');
  const county = getArg('--county') || 'Palm Beach';
  const level = getArg('--level') || 'elementary';
  const year = getArg('--year') || '2025-2026';

  if (!boundariesFile && !gradesFile) {
    console.error(
      'Usage: node scripts/location/import-schools-and-grades.mjs [--boundaries <file.geojson> --county "Palm Beach" --level elementary] [--grades <SchoolGrades.csv> --year "2025-2026"] [--dry-run]'
    );
    process.exit(1);
  }

  const { sql } = isDryRun ? { sql: null } : createEnvLocalSqlClient();

  if (boundariesFile) {
    await importBoundaries({ filePath: boundariesFile, county, level, year, isDryRun, sql });
  }
  if (gradesFile) {
    await importFldoeGrades({ filePath: gradesFile, year, isDryRun, sql });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('import-schools-and-grades failed:', err);
    process.exit(1);
  });
}
