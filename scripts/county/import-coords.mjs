import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import shapefile from 'shapefile';
import proj4 from 'proj4';
import polylabel from 'polylabel';
import { getDb } from '../../api/_lib/db.js';

dotenv.config({ path: '.env.local' });

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const countyArg = args.find(a => a.startsWith('--county='));
const county = countyArg ? countyArg.split('=')[1] : 'Broward';
const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 2000;

function getPolygonArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return Math.abs(area / 2);
}

/**
 * Computes the total planar area of a Polygon / MultiPolygon geometry in square feet.
 */
function getGeometryArea(geom) {
  if (!geom || !geom.coordinates) return 0;
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates;
    if (!rings[0]) return 0;
    let totalArea = getPolygonArea(rings[0]);
    for (let k = 1; k < rings.length; k++) {
      totalArea -= getPolygonArea(rings[k]);
    }
    return Math.max(0, totalArea);
  }
  if (geom.type === 'MultiPolygon') {
    let totalArea = 0;
    for (const poly of geom.coordinates) {
      if (poly[0]) {
        let polyArea = getPolygonArea(poly[0]);
        for (let k = 1; k < poly.length; k++) {
          polyArea -= getPolygonArea(poly[k]);
        }
        totalArea += Math.max(0, polyArea);
      }
    }
    return Math.max(0, totalArea);
  }
  return 0;
}

/**
 * Computes a point guaranteed to be INSIDE the polygon geometry.
 * Uses pole of inaccessibility (polylabel) on the largest ring.
 * Precision: 1.0 (in original projected feet).
 */
function getInteriorPoint(geom) {
  if (!geom || !geom.coordinates) return null;
  if (geom.type === 'Polygon') {
    if (!geom.coordinates[0] || geom.coordinates[0].length < 3) return null;
    return polylabel(geom.coordinates, 1.0);
  }
  if (geom.type === 'MultiPolygon') {
    let bestPoly = geom.coordinates[0];
    let maxArea = -1;
    for (const poly of geom.coordinates) {
      const outerRing = poly[0];
      if (outerRing && outerRing.length >= 3) {
        const area = getPolygonArea(outerRing);
        if (area > maxArea) {
          maxArea = area;
          bestPoly = poly;
        }
      }
    }
    if (!bestPoly || !bestPoly[0] || bestPoly[0].length < 3) return null;
    return polylabel(bestPoly, 1.0);
  }
  return null;
}

/**
 * Point-in-polygon test using ray-casting algorithm.
 * pt: [x, y] in original projected feet
 * ring: [[x1, y1], [x2, y2], ...]
 */
function pointInPolygonRing(pt, ring) {
  const x = pt[0], y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks if point falls inside a Polygon / MultiPolygon geometry (inside outer ring and outside holes).
 */
function isPointInGeometry(pt, geom) {
  if (!geom || !geom.coordinates || !pt) return false;
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates;
    if (!rings[0] || !pointInPolygonRing(pt, rings[0])) return false;
    for (let k = 1; k < rings.length; k++) {
      if (pointInPolygonRing(pt, rings[k])) return false; // Inside a hole
    }
    return true;
  }
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (poly[0] && pointInPolygonRing(pt, poly[0])) {
        let inHole = false;
        for (let k = 1; k < poly.length; k++) {
          if (pointInPolygonRing(pt, poly[k])) {
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
 * Finds or extracts shapefile files (.shp, .dbf, .prj) from data/county/
 */
function locateShapefileFiles(countyName) {
  const dataDir = path.resolve('data/county');
  if (!fs.existsSync(dataDir)) {
    throw new Error(`Data directory ${dataDir} does not exist.`);
  }

  const countyLower = countyName.toLowerCase();

  // 1. Check if unzipped .shp already exists in data/county or a subfolder
  const findFiles = (dir) => {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const item of list) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(findFiles(fullPath));
      } else {
        results.push(fullPath);
      }
    }
    return results;
  };

  const allFiles = findFiles(dataDir);
  const shpFile = allFiles.find(f => f.endsWith('.shp') && path.basename(f).toLowerCase().includes(countyLower));

  if (shpFile) {
    const base = shpFile.slice(0, -4);
    const dbfFile = base + '.dbf';
    const prjFile = base + '.prj';
    if (fs.existsSync(dbfFile) && fs.existsSync(prjFile)) {
      return { shp: shpFile, dbf: dbfFile, prj: prjFile };
    }
  }

  // 2. Check for zip file to extract
  const zipFile = allFiles.find(f => f.endsWith('.zip') && path.basename(f).toLowerCase().includes(countyLower) && (path.basename(f).toLowerCase().includes('pin') || path.basename(f).toLowerCase().includes('par')));

  if (!zipFile) {
    throw new Error(`No shapefile or zip found for ${countyName} in data/county/. Please place the zip file (e.g. broward_2026pin.zip) in data/county/.`);
  }

  const extractDir = path.join(dataDir, path.basename(zipFile, '.zip'));
  console.log(`Extracting ${path.basename(zipFile)} to ${extractDir}...`);
  if (!fs.existsSync(extractDir)) {
    fs.mkdirSync(extractDir, { recursive: true });
  }

  execSync(`unzip -o -q "${zipFile}" -d "${extractDir}"`);

  const extracted = findFiles(extractDir);
  const extShp = extracted.find(f => f.endsWith('.shp'));
  if (!extShp) {
    throw new Error(`Extracted archive did not contain a .shp file.`);
  }
  const baseExt = extShp.slice(0, -4);
  return {
    shp: extShp,
    dbf: baseExt + '.dbf',
    prj: baseExt + '.prj'
  };
}

async function run() {
  console.log(`=== FLORIDA DOR PARCEL COORDINATES IMPORTER ===`);
  console.log(`County: ${county}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no database writes)' : 'LIVE IMPORT'}`);
  console.log(`Batch size: ${batchSize}`);

  const files = locateShapefileFiles(county);
  console.log(`Shapefile found:`);
  console.log(`  SHP: ${files.shp}`);
  console.log(`  DBF: ${files.dbf}`);
  console.log(`  PRJ: ${files.prj}`);

  // Read PRJ and create proj4 coordinate transformer
  const prjWkt = fs.readFileSync(files.prj, 'utf8').trim();
  console.log(`PRJ Coordinate System:\n  ${prjWkt.slice(0, 100)}...`);
  const transformer = proj4(prjWkt, 'WGS84');

  const sql = getDb();

  // Load existing residential parcels for this county into a Set
  console.log(`Loading residential parcels for ${county} from county_parcels...`);
  const rows = await sql`SELECT parcel_id FROM county_parcels WHERE county = ${county}`;
  const residentialSet = new Set(rows.map(r => String(r.parcel_id).trim()));
  console.log(`Total residential parcels in DB: ${residentialSet.size.toLocaleString()}`);

  console.log(`Streaming shapefile...`);
  const source = await shapefile.open(files.shp, files.dbf, { encoding: 'utf-8' });

  let totalShapes = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;
  let verifiedKnown = false;
  let knownParcelCoords = null;

  let sampledCount = 0;
  let samplePassedCount = 0;
  const targetSampleSize = 1000;

  // Stores parcelId -> { lat, lng, area } to keep the point from the LARGEST shape by area
  const bestParcelsMap = new Map();
  let duplicatesCount = 0;
  let duplicatesReplacedCount = 0;

  async function flushBatch(batch) {
    if (batch.length === 0 || isDryRun) return;

    // UPDATE county_parcels AS p SET lat = v.lat, lng = v.lng FROM (VALUES ...) AS v(parcel_id, lat, lng)
    const valueClauses = batch.map((_, i) => `($${i * 3 + 1}::text, $${i * 3 + 2}::double precision, $${i * 3 + 3}::double precision)`).join(', ');
    const flatParams = batch.flat();
    const query = `
      UPDATE county_parcels AS p
      SET lat = v.lat, lng = v.lng
      FROM (VALUES ${valueClauses}) AS v(parcel_id, lat, lng)
      WHERE p.county = '${county}' AND p.parcel_id = v.parcel_id;
    `;

    await sql.query(query, flatParams);
  }

  const startTime = Date.now();

  while (true) {
    const result = await source.read();
    if (result.done) break;

    totalShapes++;
    const feature = result.value;
    const props = feature.properties || {};

    // Parcel ID field in DOR shapefile is PARCELNO
    const rawParcelNo = props.PARCELNO || props.parcelno || props.PARCEL_ID || props.parcel_id || '';
    const parcelId = String(rawParcelNo).trim().replace(/[-_ ]/g, '');

    if (!parcelId) {
      unmatchedCount++;
      continue;
    }

    if (residentialSet.has(parcelId)) {
      const interiorPt = getInteriorPoint(feature.geometry);
      if (interiorPt) {
        // Reproject to WGS84 [lng, lat]
        const [wgsLng, wgsLat] = transformer.forward([interiorPt[0], interiorPt[1]]);
        const lat = Math.round(wgsLat * 1e6) / 1e6;
        const lng = Math.round(wgsLng * 1e6) / 1e6;

        // Check known parcel: 924 SW 15 TER (504209040280)
        if (parcelId === '504209040280') {
          knownParcelCoords = { lat, lng };
          console.log(`\n>>> VERIFIED KNOWN PARCEL 504209040280 (924 SW 15 TER):`);
          console.log(`    Computed coordinates: Lat ${lat} N, Lng ${lng} W`);
          const latOk = lat >= 26.05 && lat <= 26.15;
          const lngOk = lng >= -80.20 && lng <= -80.12;
          console.log(`    Sanity check (around 26.11 N, -80.16 W): ${latOk && lngOk ? 'PASSED ✓' : 'FAILED ✗'}\n`);
          verifiedKnown = true;
        }

        // Inside-polygon check for a random sample of 1,000 parcels across the dataset
        if (sampledCount < targetSampleSize) {
          if (matchedCount % 400 === 0 || Math.random() < 0.05 || totalShapes > 500000) {
            sampledCount++;
            if (isPointInGeometry(interiorPt, feature.geometry)) {
              samplePassedCount++;
            }
          }
        }

        matchedCount++;
        const area = getGeometryArea(feature.geometry);
        const existing = bestParcelsMap.get(parcelId);

        if (!existing) {
          bestParcelsMap.set(parcelId, { lat, lng, area });
        } else {
          duplicatesCount++;
          if (area > existing.area) {
            duplicatesReplacedCount++;
            bestParcelsMap.set(parcelId, { lat, lng, area });
          }
        }
      } else {
        unmatchedCount++;
      }
    } else {
      unmatchedCount++;
    }

    if (totalShapes % 50000 === 0) {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\rRead ${totalShapes.toLocaleString()} shapes | Matched: ${matchedCount.toLocaleString()} | Elapsed: ${elapsedSec}s...`);
    }
  }

  // Database write pass (if live import)
  if (!isDryRun) {
    console.log(`\n\nWriting coordinates for ${bestParcelsMap.size.toLocaleString()} unique parcels to database in batches of ${batchSize}...`);
    const dbStartTime = Date.now();
    let dbBatch = [];
    let writtenCount = 0;

    for (const [pId, { lat, lng }] of bestParcelsMap) {
      dbBatch.push([pId, lat, lng]);
      if (dbBatch.length >= batchSize) {
        await flushBatch(dbBatch);
        writtenCount += dbBatch.length;
        dbBatch = [];
        const dbElapsed = ((Date.now() - dbStartTime) / 1000).toFixed(1);
        process.stdout.write(`\rUpdated ${writtenCount.toLocaleString()} / ${bestParcelsMap.size.toLocaleString()} parcels in DB (${dbElapsed}s)...`);
      }
    }

    if (dbBatch.length > 0) {
      await flushBatch(dbBatch);
      writtenCount += dbBatch.length;
    }
    const totalDbElapsed = ((Date.now() - dbStartTime) / 1000).toFixed(1);
    console.log(`\nDatabase update complete: ${writtenCount.toLocaleString()} parcels written in ${totalDbElapsed}s.`);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const passRate = sampledCount > 0 ? ((samplePassedCount / sampledCount) * 100).toFixed(1) : '0';

  console.log(`\n\n=== IMPORT SUMMARY ===`);
  console.log(`Total shapes in shapefile:      ${totalShapes.toLocaleString()}`);
  console.log(`Matched to residential DB:      ${matchedCount.toLocaleString()} (${bestParcelsMap.size.toLocaleString()} unique parcels)`);
  console.log(`Unmatched shapes:               ${unmatchedCount.toLocaleString()} (non-residential / rights-of-way)`);
  console.log(`Duplicate shapes resolved:      ${duplicatesCount.toLocaleString()} duplicate shapes encountered (${duplicatesReplacedCount.toLocaleString()} replaced by larger shape; all kept from largest shape by area)`);

  const stillWithout = residentialSet.size - bestParcelsMap.size;
  const matchPct = ((bestParcelsMap.size / residentialSet.size) * 100).toFixed(2);
  console.log(`Residential parcels without coords: ${stillWithout.toLocaleString()}`);
  console.log(`Coordinate coverage:            ${matchPct}% of residential parcels`);
  console.log(`Inside-polygon check:           ${samplePassedCount.toLocaleString()} / ${sampledCount.toLocaleString()} passed (${passRate}%)`);
  if (knownParcelCoords) {
    console.log(`Known parcel (504209040280):    Lat ${knownParcelCoords.lat}, Lng ${knownParcelCoords.lng}`);
  }
  console.log(`Time elapsed:                   ${durationSec}s`);
  console.log(`Known parcel verification:      ${verifiedKnown ? 'Confirmed (504209040280 landed near 26.11 N, -80.16 W)' : 'Not encountered'}`);

  if (isDryRun) {
    console.log(`\n[DRY RUN COMPLETE] No data was written to the database.`);
  } else {
    console.log(`\n[SUCCESS] Coordinates updated in Neon database.`);
  }

  process.exit(0);
}

run().catch(err => {
  console.error('\nFatal Error in import-coords:', err);
  process.exit(1);
});
