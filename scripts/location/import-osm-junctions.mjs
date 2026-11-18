#!/usr/bin/env node

/**
 * Imports Florida highway motorway junctions from a Geofabrik Florida OSM extract
 * (exported to GeoJSON via ogr2ogr or osmium) into fl_highway_junctions.
 *
 * Strictly uses .env.local via scripts/db/_lib.mjs. Supports --dry-run.
 *
 * Example:
 *   node scripts/location/import-osm-junctions.mjs --file data/location/fl-junctions.geojson --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { createEnvLocalSqlClient } from '../db/_lib.mjs';

function parseRouteMeta(props = {}) {
  const rawRef = String(
    props.highway_ref || props.route_ref || props.destination_ref || props.ref_route || ''
  ).trim();
  const rawName = String(props.name || props.destination || props['exit_to'] || '').trim();
  const combined = `${rawRef} ${rawName}`.toUpperCase();

  if (/\bI[- ]?95\b/.test(combined)) {
    return { route: 'I-95', route_type: 'interstate', badge_number: '95' };
  }
  if (/\bI[- ]?595\b/.test(combined)) {
    return { route: 'I-595', route_type: 'interstate', badge_number: '595' };
  }
  if (/\bI[- ]?75\b/.test(combined)) {
    return { route: 'I-75', route_type: 'interstate', badge_number: '75' };
  }
  if (/\bI[- ]?4\b/.test(combined)) {
    return { route: 'I-4', route_type: 'interstate', badge_number: '4' };
  }
  if (/\bI[- ]?10\b/.test(combined)) {
    return { route: 'I-10', route_type: 'interstate', badge_number: '10' };
  }
  if (/TURNPIKE|\bSR[- ]?91\b|\bTPKE\b/.test(combined)) {
    return { route: 'FL Turnpike', route_type: 'turnpike', badge_number: 'TPKE' };
  }
  if (/SAWGRASS|\bSR[- ]?869\b/.test(combined)) {
    return { route: 'Sawgrass Expy', route_type: 'turnpike', badge_number: '869' };
  }
  return null;
}

export function extractJunctionRow(feature, idx = 0) {
  const geom = feature?.geometry;
  if (!geom || geom.type !== 'Point' || !Array.isArray(geom.coordinates)) return null;
  const [lng, lat] = geom.coordinates.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const props = feature.properties || {};
  const meta = parseRouteMeta(props);
  if (!meta) return null;

  const rawOsmId = props.osm_id || props['@id'] || feature.id || idx + 1;
  const osmId = Number(String(rawOsmId).replace(/\D/g, '')) || idx + 1;
  const exitRef = props.ref ? String(props.ref).trim() : null;
  const baseName = String(props.name || props.destination || props['exit_to'] || '').trim();
  const label = baseName
    ? `${meta.route}${exitRef ? ` Exit ${exitRef}` : ''} · ${baseName}`
    : `${meta.route}${exitRef ? ` Exit ${exitRef}` : ' On-Ramp'}`;

  return {
    osm_id: osmId,
    route: meta.route,
    route_type: meta.route_type,
    badge_number: meta.badge_number,
    exit_ref: exitRef,
    name: label,
    lat,
    lng,
    source: 'OpenStreetMap (Geofabrik Florida extract)'
  };
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null;

  if (!filePath) {
    console.error('Usage: node scripts/location/import-osm-junctions.mjs --file <fl-junctions.geojson> [--dry-run]');
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  const geojson = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const features = Array.isArray(geojson?.features) ? geojson.features : [];

  const dedup = new Map();
  features.forEach((f, idx) => {
    const row = extractJunctionRow(f, idx);
    if (row) dedup.set(row.osm_id, row);
  });

  const rows = Array.from(dedup.values());
  console.log(`Parsed ${rows.length} Florida highway junction nodes from ${path.basename(resolved)}.`);

  if (isDryRun) {
    console.log('DRY RUN — zero database writes.');
    return;
  }

  const { sql, host } = createEnvLocalSqlClient();
  console.log(`Importing into ${host}...`);

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await sql`
      INSERT INTO fl_highway_junctions (
        osm_id, route, route_type, badge_number, exit_ref, name, lat, lng, source
      )
      SELECT * FROM json_to_recordset(${JSON.stringify(slice)}::json)
        AS x(
          osm_id bigint,
          route text,
          route_type text,
          badge_number text,
          exit_ref text,
          name text,
          lat double precision,
          lng double precision,
          source text
        )
      ON CONFLICT (osm_id) DO UPDATE SET
        route = EXCLUDED.route,
        route_type = EXCLUDED.route_type,
        badge_number = EXCLUDED.badge_number,
        exit_ref = EXCLUDED.exit_ref,
        name = EXCLUDED.name,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        source = EXCLUDED.source;
    `;
  }

  console.log(`Imported ${rows.length} motorway junctions cleanly.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('import-osm-junctions failed:', err);
    process.exit(1);
  });
}
