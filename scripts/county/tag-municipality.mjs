import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getDb } from '../../api/_lib/db.js';

// Load environment variables from .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const isDryRun = process.argv.includes('--dry-run');

/**
 * Standard ray-casting point-in-polygon algorithm.
 * coordinates: [lng, lat]
 */
function pointInRing(pt, ring) {
  let inside = false;
  const x = pt[0];
  const y = pt[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if point is inside a GeoJSON Polygon or MultiPolygon geometry.
 * Respects outer boundaries and holes.
 */
function pointInGeometry(pt, geom) {
  if (geom.type === 'Polygon') {
    if (pointInRing(pt, geom.coordinates[0])) {
      for (let h = 1; h < geom.coordinates.length; h++) {
        if (pointInRing(pt, geom.coordinates[h])) {
          return false; // Point falls inside a hole
        }
      }
      return true;
    }
    return false;
  }

  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (pointInRing(pt, poly[0])) {
        let inHole = false;
        for (let h = 1; h < poly.length; h++) {
          if (pointInRing(pt, poly[h])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
    return false;
  }

  return false;
}

/**
 * Prepares pre-computed bounding boxes for fast spatial indexing
 */
function preparePolygons(geojson) {
  const prepared = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (!geom) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const examineRings = (rings) => {
      for (const ring of rings) {
        for (const coord of ring) {
          if (coord[0] < minX) minX = coord[0];
          if (coord[0] > maxX) maxX = coord[0];
          if (coord[1] < minY) minY = coord[1];
          if (coord[1] > maxY) maxY = coord[1];
        }
      }
    };

    if (geom.type === 'Polygon') {
      examineRings(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        examineRings(poly);
      }
    }

    const rawName = String(feature.properties?.NAME || '').trim();
    // Normalize unincorporated names
    let muniName = rawName;
    if (
      !rawName ||
      rawName.toLowerCase() === 'unincorporated' ||
      rawName.toLowerCase().includes('regional facility') ||
      rawName.toLowerCase().includes('indian reservation')
    ) {
      muniName = 'Unincorporated Broward';
    }

    prepared.push({
      name: muniName,
      bbox: [minX, minY, maxX, maxY],
      geom
    });
  }

  // Prioritize incorporated cities over Unincorporated Broward if there's any boundary overlap
  prepared.sort((a, b) => {
    if (a.name === 'Unincorporated Broward' && b.name !== 'Unincorporated Broward') return 1;
    if (a.name !== 'Unincorporated Broward' && b.name === 'Unincorporated Broward') return -1;
    return 0;
  });

  return prepared;
}

/**
 * Find municipality for given longitude and latitude
 */
function findMunicipality(lng, lat, preparedPolygons) {
  if (lng == null || lat == null || isNaN(lng) || isNaN(lat)) {
    return { name: 'Unknown', matched: false };
  }

  const pt = [lng, lat];

  for (const item of preparedPolygons) {
    const [minX, minY, maxX, maxY] = item.bbox;
    // Bounding box test
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) {
      continue;
    }

    // Precise polygon test
    if (pointInGeometry(pt, item.geom)) {
      return { name: item.name, matched: true };
    }
  }

  return { name: 'Unknown', matched: false };
}

async function main() {
  console.log(`Starting Broward municipality tagging (${isDryRun ? 'DRY RUN' : 'REAL RUN'})...`);

  const geojsonPath = path.resolve(__dirname, '../../data/county/broward-municipalities.geojson');
  if (!fs.existsSync(geojsonPath)) {
    console.error(`Error: GeoJSON file not found at ${geojsonPath}`);
    process.exit(1);
  }

  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  console.log(`Loaded ${geojson.features.length} municipal polygon features.`);

  const preparedPolygons = preparePolygons(geojson);
  const uniqueCities = new Set(preparedPolygons.map(p => p.name).filter(n => n !== 'Unincorporated Broward'));
  console.log(`Indexed ${uniqueCities.size} unique incorporated cities + Unincorporated Broward.`);

  // Sanity check folio 504209040280 (924 SW 15 TER, Fort Lauderdale)
  const sanityCheck = findMunicipality(-80.162125, 26.109897, preparedPolygons);
  console.log(`\nSanity Check: Folio 504209040280 (-80.162125, 26.109897) -> ${sanityCheck.name}`);
  if (sanityCheck.name !== 'Fort Lauderdale') {
    console.error(`FATAL: Sanity check failed! Expected Fort Lauderdale, got ${sanityCheck.name}`);
    process.exit(1);
  }

  const sql = getDb();

  console.log('\nFetching all Broward parcels with coordinates from county_parcels...');
  const parcels = await sql`
    SELECT parcel_id, lat, lng
    FROM county_parcels
    WHERE county = 'Broward';
  `;
  console.log(`Fetched ${parcels.length.toLocaleString()} parcels.`);

  const muniCounts = {};
  let unmatchedCount = 0;
  let missingCoordsCount = 0;
  const taggedRows = [];

  const startTime = Date.now();

  for (let i = 0; i < parcels.length; i++) {
    const p = parcels[i];
    if (p.lat == null || p.lng == null) {
      missingCoordsCount++;
      const muni = 'Unknown';
      muniCounts[muni] = (muniCounts[muni] || 0) + 1;
      taggedRows.push({ county: 'Broward', parcel_id: p.parcel_id, municipality: muni });
      continue;
    }

    const { name, matched } = findMunicipality(Number(p.lng), Number(p.lat), preparedPolygons);
    if (!matched) {
      unmatchedCount++;
    }

    muniCounts[name] = (muniCounts[name] || 0) + 1;
    taggedRows.push({ county: 'Broward', parcel_id: p.parcel_id, municipality: name });
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Point-in-polygon classification completed in ${durationSec}s.`);

  console.log('\n======================================================');
  console.log('BROWARD MUNICIPALITY PARCEL COUNTS');
  console.log('======================================================');

  const sortedMunis = Object.entries(muniCounts).sort((a, b) => b[1] - a[1]);
  for (const [muni, count] of sortedMunis) {
    const pct = ((count / parcels.length) * 100).toFixed(2);
    console.log(` - ${muni.padEnd(28)}: ${count.toLocaleString().padStart(8)} (${pct}%)`);
  }

  console.log('------------------------------------------------------');
  console.log(`Total Parcels               : ${parcels.length.toLocaleString()}`);
  console.log(`Parcels missing coordinates : ${missingCoordsCount.toLocaleString()}`);
  console.log(`Parcels outside any polygon : ${unmatchedCount.toLocaleString()} (classified as Unknown)`);
  console.log('======================================================\n');

  if (isDryRun) {
    console.log('DRY RUN complete. No rows written to the database.');
    return;
  }

  // REAL RUN: Batch INSERT / UPSERT into parcel_jurisdiction
  console.log('Executing real database insertion into parcel_jurisdiction...');
  const BATCH_SIZE = 2500;
  let inserted = 0;

  for (let i = 0; i < taggedRows.length; i += BATCH_SIZE) {
    const batch = taggedRows.slice(i, i + BATCH_SIZE);

    // Build parameterized values string
    // Neon postgres supports bulk unnest or multi-row insert
    await sql`
      INSERT INTO parcel_jurisdiction (county, parcel_id, municipality)
      SELECT * FROM json_to_recordset(${JSON.stringify(batch)}::json)
        AS x(county text, parcel_id text, municipality text)
      ON CONFLICT (county, parcel_id) DO UPDATE SET
        municipality = EXCLUDED.municipality
      WHERE parcel_jurisdiction.municipality IS DISTINCT FROM EXCLUDED.municipality;
    `;

    inserted += batch.length;
    if (inserted % 50000 === 0 || inserted === taggedRows.length) {
      console.log(`Saved ${inserted.toLocaleString()} / ${taggedRows.length.toLocaleString()} parcels...`);
    }
  }

  console.log('Real tagging run complete!');
}

main().catch(err => {
  console.error('Error running tag-municipality:', err);
  process.exit(1);
});
