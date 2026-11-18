/**
 * Server-side Coordinate-Based Location Intelligence Engine
 *
 * Strictly zero hard-coded / sample property values.
 * Every value returned carries explicit { source, fetched_at } provenance.
 */

const USER_AGENT = 'IntentDigital-InvestorStudio/1.0';

export function haversineMiles(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 3958.8;
  const toRad = Math.PI / 180;
  const dLat = (Number(lat2) - Number(lat1)) * toRad;
  const dLon = (Number(lon2) - Number(lon1)) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(Number(lat1) * toRad) * Math.cos(Number(lat2) * toRad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function pointInRing(pt, ring) {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(pt, geom) {
  if (!geom || !pt) return false;
  if (geom.type === 'Polygon') {
    if (!pointInRing(pt, geom.coordinates[0])) return false;
    for (let h = 1; h < geom.coordinates.length; h++) {
      if (pointInRing(pt, geom.coordinates[h])) return false;
    }
    return true;
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
  }
  return false;
}

export function normalizeSchoolNumber(raw) {
  if (raw == null) return '';
  const digits = String(raw).trim().replace(/\D/g, '');
  return digits ? digits.padStart(4, '0') : String(raw).trim().toUpperCase();
}

export function formatTractNumber(tractCode) {
  const raw = String(tractCode || '').trim();
  if (!/^\d{6}$/.test(raw)) return raw || null;
  const whole = parseInt(raw.slice(0, 4), 10);
  const dec = raw.slice(4);
  return dec === '00' ? `${whole}` : `${whole}.${dec}`;
}

export function getDistrictSchoolLocator(county, lat = null) {
  const isPalmBeach =
    /palm/i.test(String(county || '')) ||
    (!county && lat != null && Number(lat) >= 26.33);

  if (isPalmBeach) {
    return {
      district_name: 'School District of Palm Beach County',
      district_number: '50',
      locator_label: 'Palm Beach County Find My School',
      locator_url:
        'https://www.palmbeachschools.org/students_parents/school_choice/find_my_school',
      disclaimer: "Boundaries change — confirm with the district's school locator"
    };
  }

  return {
    district_name: 'Broward County Public Schools',
    district_number: '06',
    locator_label: 'Broward Schools Locator',
    locator_url: 'https://www.browardschools.com/schoollocator',
    disclaimer: "Boundaries change — confirm with the district's school locator"
  };
}

/**
 * Queries Mapbox Directions Matrix API (up to 24 destinations per batch)
 * from origin [lng, lat] to obtain driving duration (minutes) and road distance (miles).
 */
async function fetchMapboxDrivingMatrix(originLng, originLat, destinations, mapboxToken, fetchImpl = fetch) {
  if (!mapboxToken || !Array.isArray(destinations) || destinations.length === 0) {
    return [];
  }

  const capped = destinations.slice(0, 24);
  const coordParts = [`${originLng},${originLat}`];
  for (const d of capped) {
    coordParts.push(`${d.lng},${d.lat}`);
  }

  const url = new URL(
    `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordParts.join(';')}`
  );
  url.searchParams.set('sources', '0');
  url.searchParams.set('annotations', 'duration,distance');
  url.searchParams.set('access_token', mapboxToken);

  const res = await fetchImpl(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`Mapbox Matrix HTTP ${res.status}`);
  }

  const json = await res.json();
  const durations = json?.durations?.[0] || [];
  const distances = json?.distances?.[0] || [];

  return capped.map((d, idx) => {
    const sec = durations[idx + 1];
    const meters = distances[idx + 1];
    return {
      ...d,
      drive_minutes: sec != null && Number.isFinite(sec) ? Math.max(1, Math.round(sec / 60)) : null,
      distance_mi:
        meters != null && Number.isFinite(meters)
          ? Math.round((meters / 1609.344) * 10) / 10
          : d.crow_miles != null
            ? Math.round(d.crow_miles * 10) / 10
            : null
    };
  });
}

const POI_CATEGORIES = [
  { id: 'supermarket', label: 'Groceries', limit: 2, maxMiles: 20 },
  { id: 'pharmacy', label: 'Pharmacy', limit: 1, maxMiles: 15 },
  { id: 'hospital', label: 'Hospital', limit: 1, maxMiles: 25 },
  { id: 'train_station', label: 'Rail / Transit', limit: 2, maxMiles: 30 },
  { id: 'airport', label: 'Airport', limit: 1, maxMiles: 45 },
  { id: 'beach', label: 'Beach', limit: 1, maxMiles: 25 }
];

/**
 * 1. GETTING AROUND
 * - Nearest highway junctions from fl_highway_junctions (imported from Geofabrik OSM Florida)
 * - Nearest POIs from Mapbox Search Box Category API with proximity = parcel coordinates
 * - Road distances & drive times from Mapbox Matrix API
 */
export async function fetchGettingAround({
  sql,
  lat,
  lng,
  addressLabel,
  mapboxToken,
  fetchImpl = fetch
}) {
  const fetchedAt = new Date().toISOString();

  // A. Query imported OSM Florida highway junctions within ~25 miles bounding box
  let rawJunctionCandidates = [];
  let junctionsTableImported = false;
  if (sql) {
    try {
      const latDelta = 0.38;
      const lngDelta = 0.42;
      const rows = await sql`
        SELECT osm_id, route, route_type, badge_number, exit_ref, name, lat, lng, source
        FROM fl_highway_junctions
        WHERE lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
          AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
        LIMIT 250;
      `;
      if (rows.length > 0) {
        junctionsTableImported = true;
        const byRoute = new Map();
        for (const r of rows) {
          const crow = haversineMiles(lat, lng, Number(r.lat), Number(r.lng));
          if (crow == null || crow > 25) continue;
          const prev = byRoute.get(r.route);
          if (!prev || crow < prev.crow_miles) {
            byRoute.set(r.route, {
              kind: 'highway',
              route: r.route,
              route_type: r.route_type || 'interstate',
              badge_number: r.badge_number || r.route,
              exit_ref: r.exit_ref || null,
              name: r.name,
              lat: Number(r.lat),
              lng: Number(r.lng),
              crow_miles: crow,
              osm_source: r.source || 'OpenStreetMap (Geofabrik Florida extract)'
            });
          }
        }
        rawJunctionCandidates = Array.from(byRoute.values())
          .sort((a, b) => a.crow_miles - b.crow_miles)
          .slice(0, 5);
      }
    } catch (err) {
      if (err?.code !== '42P01') {
        console.warn('fl_highway_junctions lookup warning:', err.message);
      }
    }
  }

  // B. Query Mapbox Search Box Category API near parcel coordinates
  let rawPoiCandidates = [];
  if (mapboxToken) {
    const catResults = await Promise.all(
      POI_CATEGORIES.map(async (cat) => {
        try {
          const url = new URL(
            `https://api.mapbox.com/search/searchbox/v1/category/${encodeURIComponent(cat.id)}`
          );
          url.searchParams.set('proximity', `${lng},${lat}`);
          url.searchParams.set('limit', String(cat.limit));
          url.searchParams.set('country', 'US');
          url.searchParams.set('language', 'en');
          url.searchParams.set('access_token', mapboxToken);

          const res = await fetchImpl(url.toString(), {
            headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(7000)
          });
          if (!res.ok) return [];
          const data = await res.json();
          const feats = Array.isArray(data?.features) ? data.features : [];
          const picked = [];
          for (const f of feats) {
            const coords = f?.geometry?.coordinates;
            const props = f?.properties || {};
            if (!coords || coords.length < 2 || !props.name) continue;
            const pLng = Number(coords[0]);
            const pLat = Number(coords[1]);
            const crow = haversineMiles(lat, lng, pLat, pLng);
            if (crow == null || crow > cat.maxMiles) continue;
            picked.push({
              kind: 'poi',
              category: cat.label,
              category_id: cat.id,
              name: props.name,
              address: props.address || props.place_formatted || null,
              lat: pLat,
              lng: pLng,
              crow_miles: crow
            });
          }
          return picked;
        } catch {
          return [];
        }
      })
    );
    rawPoiCandidates = catResults.flat();
  }

  // C. Compute exact driving times and road distances via Mapbox Matrix API
  let matrixResolved = [];
  let hasMatrixDriveTimes = false;
  const combinedTargets = [...rawJunctionCandidates, ...rawPoiCandidates];

  if (mapboxToken && combinedTargets.length > 0) {
    try {
      matrixResolved = await fetchMapboxDrivingMatrix(lng, lat, combinedTargets, mapboxToken, fetchImpl);
      hasMatrixDriveTimes = true;
    } catch (err) {
      console.warn('Mapbox Matrix warning:', err.message);
      matrixResolved = combinedTargets.map((item) => ({
        ...item,
        distance_mi: Math.round(item.crow_miles * 10) / 10,
        drive_minutes: null
      }));
    }
  } else {
    matrixResolved = combinedTargets.map((item) => ({
      ...item,
      distance_mi: Math.round(item.crow_miles * 10) / 10,
      drive_minutes: null
    }));
  }

  const highwaySource = hasMatrixDriveTimes
    ? 'OpenStreetMap (Geofabrik Florida) & Mapbox Matrix API'
    : 'OpenStreetMap (Geofabrik Florida)';
  const placesSource = hasMatrixDriveTimes
    ? 'Mapbox Search Box API & Mapbox Matrix API'
    : 'Mapbox Search Box API';

  const highways = matrixResolved
    .filter((i) => i.kind === 'highway')
    .sort((a, b) => (a.drive_minutes ?? 999) - (b.drive_minutes ?? 999) || a.distance_mi - b.distance_mi)
    .map((h) => ({
      route: h.route,
      route_type: h.route_type,
      badge_number: h.badge_number,
      exit_ref: h.exit_ref,
      name: h.name,
      distance_mi: h.distance_mi,
      drive_minutes: h.drive_minutes,
      source: highwaySource,
      fetched_at: fetchedAt
    }));

  const places = matrixResolved
    .filter((i) => i.kind === 'poi')
    .sort((a, b) => (a.drive_minutes ?? 999) - (b.drive_minutes ?? 999) || a.distance_mi - b.distance_mi)
    .map((p) => ({
      category: p.category,
      category_id: p.category_id,
      name: p.name,
      address: p.address,
      distance_mi: p.distance_mi,
      drive_minutes: p.drive_minutes,
      source: placesSource,
      fetched_at: fetchedAt
    }));

  const hasAnyRealData = highways.length > 0 || places.length > 0;
  const sourceParts = [];
  if (highways.length > 0) sourceParts.push('OpenStreetMap (Geofabrik FL)');
  if (places.length > 0) sourceParts.push('Mapbox Search Box');
  if (hasMatrixDriveTimes) sourceParts.push('Mapbox Matrix API');

  const fieldSources = {};
  if (highways.length > 0) {
    fieldSources.highways = { source: highwaySource, fetched_at: fetchedAt };
  }
  if (places.length > 0) {
    fieldSources.places = { source: placesSource, fetched_at: fetchedAt };
  }

  return {
    available: hasAnyRealData,
    address: addressLabel,
    fetched_at: hasAnyRealData ? fetchedAt : null,
    source: hasAnyRealData ? sourceParts.join(' · ') : null,
    highways_imported: junctionsTableImported,
    highways,
    places,
    field_sources: fieldSources
  };
}

/**
 * 2. SCHOOLS
 * - Point-in-polygon against imported official attendance boundaries (Palm Beach / Broward)
 *   joined to FLDOE school grades by (district_number, school_number).
 * - If boundaries aren't loaded for that county yet, returns nearest schools explicitly
 *   labeled "Attendance zone not verified".
 */
export async function fetchSchoolsForPoint({
  sql,
  county,
  lat,
  lng,
  addressLabel,
  mapboxToken,
  fetchImpl = fetch
}) {
  const fetchedAt = new Date().toISOString();
  const normalizedCounty =
    /palm/i.test(String(county || '')) || (!county && Number(lat) >= 26.33)
      ? 'Palm Beach'
      : 'Broward';
  const locator = getDistrictSchoolLocator(normalizedCounty, lat);

  let boundariesLoadedForCounty = false;
  let matchedZones = [];

  if (sql) {
    try {
      const countCheck = await sql`
        SELECT 1 FROM school_attendance_zones
        WHERE county = ${normalizedCounty}
        LIMIT 1;
      `;
      boundariesLoadedForCounty = countCheck.length > 0;

      if (boundariesLoadedForCounty) {
        const candidates = await sql`
          SELECT
            z.level,
            z.district_number,
            z.school_number,
            z.school_name,
            z.school_year AS boundary_year,
            z.geometry_geojson,
            z.source AS boundary_source,
            g.grade,
            g.pct_points,
            g.school_year AS grade_year,
            g.school_type,
            g.source AS grade_source
          FROM school_attendance_zones z
          LEFT JOIN LATERAL (
            SELECT grade, pct_points, school_year, school_type, source
            FROM fldoe_school_grades fg
            WHERE fg.district_number = z.district_number
              AND fg.school_number = z.school_number
            ORDER BY fg.school_year DESC
            LIMIT 1
          ) g ON true
          WHERE z.county = ${normalizedCounty}
            AND ${lat} BETWEEN z.min_lat AND z.max_lat
            AND ${lng} BETWEEN z.min_lng AND z.max_lng;
        `;

        const byLevel = new Map();
        for (const row of candidates) {
          const geom =
            typeof row.geometry_geojson === 'string'
              ? JSON.parse(row.geometry_geojson)
              : row.geometry_geojson;
          if (pointInGeometry([lng, lat], geom) && !byLevel.has(row.level)) {
            const combinedSource = row.grade
              ? `${row.boundary_source} & FLDOE (${row.grade_year})`
              : row.boundary_source;
            byLevel.set(row.level, {
              level: row.level,
              school_number: row.school_number,
              name: row.school_name,
              grade: row.grade || null,
              grade_year: row.grade_year || null,
              pct_points: row.pct_points != null ? Number(row.pct_points) : null,
              school_type: row.school_type || 'Public District',
              zone_verified: true,
              zone_badge: 'Assigned attendance zone',
              source: combinedSource,
              fetched_at: fetchedAt
            });
          }
        }

        for (const lvl of ['elementary', 'middle', 'high']) {
          if (byLevel.has(lvl)) matchedZones.push(byLevel.get(lvl));
        }
      }
    } catch (err) {
      if (err?.code !== '42P01') {
        console.warn('school_attendance_zones lookup warning:', err.message);
      }
    }
  }

  if (matchedZones.length > 0) {
    const gradeYears = Array.from(new Set(matchedZones.map((m) => m.grade_year).filter(Boolean)));
    const mainSource =
      gradeYears.length > 0
        ? `${locator.district_name} GIS Boundaries & FLDOE School Grades (${gradeYears.join(', ')})`
        : `${locator.district_name} GIS Attendance Boundaries`;

    return {
      available: true,
      boundaries_loaded: true,
      zone_verified: true,
      address: addressLabel,
      fetched_at: fetchedAt,
      source: mainSource,
      disclaimer: locator.disclaimer,
      locator_label: locator.locator_label,
      locator_url: locator.locator_url,
      schools: matchedZones,
      field_sources: {
        zones: { source: mainSource, fetched_at: fetchedAt }
      }
    };
  }

  // Fallback when attendance boundaries aren't loaded yet for this county:
  // Check imported FLDOE schools with coordinates first, else Mapbox Search Box nearby schools,
  // explicitly labeled "Attendance zone not verified".
  let nearestSchools = [];
  let fallbackSource = null;

  if (!boundariesLoadedForCounty && sql) {
    try {
      const fldoeCoords = await sql`
        SELECT DISTINCT ON (school_number)
          district_number, school_number, school_name, school_year, grade, pct_points, school_type, lat, lng, source
        FROM fldoe_school_grades
        WHERE county = ${normalizedCounty}
          AND lat IS NOT NULL
          AND lng IS NOT NULL
        ORDER BY school_number, school_year DESC;
      `;
      if (fldoeCoords.length > 0) {
        const withDist = fldoeCoords
          .map((s) => ({
            ...s,
            distance_mi: haversineMiles(lat, lng, Number(s.lat), Number(s.lng))
          }))
          .filter((s) => s.distance_mi != null && s.distance_mi <= 8)
          .sort((a, b) => a.distance_mi - b.distance_mi)
          .slice(0, 4);

        if (withDist.length > 0) {
          const yr = withDist[0].school_year;
          fallbackSource = `FLDOE School Grades (${yr}) · Nearest schools`;
          nearestSchools = withDist.map((s) => ({
            level: s.school_type || 'Nearby School',
            school_number: s.school_number,
            name: s.school_name,
            grade: s.grade || null,
            grade_year: s.school_year || null,
            distance_mi: Math.round(s.distance_mi * 10) / 10,
            zone_verified: false,
            zone_badge: 'Attendance zone not verified',
            source: fallbackSource,
            fetched_at: fetchedAt
          }));
        }
      }
    } catch (err) {
      if (err?.code !== '42P01') {
        console.warn('fldoe_school_grades fallback warning:', err.message);
      }
    }
  }

  if (!boundariesLoadedForCounty && nearestSchools.length === 0 && mapboxToken) {
    try {
      const url = new URL('https://api.mapbox.com/search/searchbox/v1/category/school');
      url.searchParams.set('proximity', `${lng},${lat}`);
      url.searchParams.set('limit', '4');
      url.searchParams.set('country', 'US');
      url.searchParams.set('language', 'en');
      url.searchParams.set('access_token', mapboxToken);

      const res = await fetchImpl(url.toString(), {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(7000)
      });

      if (res.ok) {
        const data = await res.json();
        const feats = Array.isArray(data?.features) ? data.features : [];
        const parsed = [];
        for (const f of feats) {
          const coords = f?.geometry?.coordinates;
          const props = f?.properties || {};
          if (!coords || coords.length < 2 || !props.name) continue;
          const dist = haversineMiles(lat, lng, Number(coords[1]), Number(coords[0]));
          if (dist == null || dist > 10) continue;
          parsed.push({
            level: 'Nearby School',
            school_number: null,
            name: props.name,
            grade: null,
            grade_year: null,
            distance_mi: Math.round(dist * 10) / 10,
            zone_verified: false,
            zone_badge: 'Attendance zone not verified',
            source: 'Mapbox Search Box API (nearest schools)',
            fetched_at: fetchedAt
          });
        }
        if (parsed.length > 0) {
          nearestSchools = parsed.sort((a, b) => a.distance_mi - b.distance_mi).slice(0, 3);
          fallbackSource = 'Mapbox Search Box API (nearest schools — boundaries not imported yet)';
        }
      }
    } catch {
      // leave nearestSchools empty
    }
  }

  if (nearestSchools.length > 0 && fallbackSource) {
    return {
      available: true,
      boundaries_loaded: false,
      zone_verified: false,
      address: addressLabel,
      fetched_at: fetchedAt,
      source: fallbackSource,
      disclaimer: locator.disclaimer,
      locator_label: locator.locator_label,
      locator_url: locator.locator_url,
      schools: nearestSchools,
      field_sources: {
        nearest_schools: { source: fallbackSource, fetched_at: fetchedAt }
      }
    };
  }

  return {
    available: false,
    boundaries_loaded: boundariesLoadedForCounty,
    zone_verified: false,
    address: addressLabel,
    fetched_at: null,
    source: null,
    disclaimer: locator.disclaimer,
    locator_label: locator.locator_label,
    locator_url: locator.locator_url,
    schools: [],
    field_sources: {}
  };
}

const SOCIO_VARS = [
  'NAME',
  'B01002_001E', // Median age
  'B19013_001E', // Median household income
  'B25003_001E', // Occupied units total
  'B25003_002E', // Owner-occupied
  'B25003_003E', // Renter-occupied
  'B25064_001E', // Median gross rent
  'B25002_001E', // Total housing units
  'B25002_003E', // Vacant housing units
  'B15003_001E', // Educational attainment 25+ total
  'B15003_022E', // Bachelor's
  'B15003_023E', // Master's
  'B15003_024E', // Professional
  'B15003_025E'  // Doctorate
];

function buildB01001AgeVars() {
  const vars = ['B01001_001E'];
  for (let i = 3; i <= 25; i++) {
    vars.push(`B01001_${String(i).padStart(3, '0')}E`);
  }
  for (let i = 27; i <= 49; i++) {
    vars.push(`B01001_${String(i).padStart(3, '0')}E`);
  }
  return vars;
}

const AGE_VARS = buildB01001AgeVars();

function parseCensusNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null; // Census uses -666666666 for suppressed medians
  return n;
}

function parseAcsRowToMap(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return null;
  const headers = matrix[0];
  const values = matrix[1];
  const obj = {};
  headers.forEach((h, i) => {
    obj[h] = values[i];
  });
  return obj;
}

function computeAgeCohorts(ageMap) {
  if (!ageMap) return null;
  const total = parseCensusNum(ageMap.B01001_001E);
  if (!total || total <= 0) return null;

  const sumVars = (indices) =>
    indices.reduce((acc, idx) => {
      const val = parseCensusNum(ageMap[`B01001_${String(idx).padStart(3, '0')}E`]);
      return acc + (val || 0);
    }, 0);

  const under18 = sumVars([3, 4, 5, 6, 27, 28, 29, 30]);
  const age18to34 = sumVars([7, 8, 9, 10, 11, 12, 31, 32, 33, 34, 35, 36]);
  const age35to49 = sumVars([13, 14, 15, 37, 38, 39]);
  const age50to64 = sumVars([16, 17, 18, 19, 40, 41, 42, 43]);
  const age65Plus = sumVars([20, 21, 22, 23, 24, 25, 44, 45, 46, 47, 48, 49]);

  const pct = (n) => Math.round((n / total) * 1000) / 10;

  return {
    under_18: pct(under18),
    age_18_34: pct(age18to34),
    age_35_49: pct(age35to49),
    age_50_64: pct(age50to64),
    age_65_plus: pct(age65Plus)
  };
}

function computeSocioStats(socioMap) {
  if (!socioMap) return null;
  const medianAge = parseCensusNum(socioMap.B01002_001E);
  const medianIncome = parseCensusNum(socioMap.B19013_001E);
  const occupiedTotal = parseCensusNum(socioMap.B25003_001E);
  const ownerOccupied = parseCensusNum(socioMap.B25003_002E);
  const renterOccupied = parseCensusNum(socioMap.B25003_003E);
  const medianRent = parseCensusNum(socioMap.B25064_001E);
  const housingTotal = parseCensusNum(socioMap.B25002_001E);
  const vacantUnits = parseCensusNum(socioMap.B25002_003E);
  const eduTotal = parseCensusNum(socioMap.B15003_001E);
  const eduBachPlus =
    (parseCensusNum(socioMap.B15003_022E) || 0) +
    (parseCensusNum(socioMap.B15003_023E) || 0) +
    (parseCensusNum(socioMap.B15003_024E) || 0) +
    (parseCensusNum(socioMap.B15003_025E) || 0);

  return {
    name: socioMap.NAME || null,
    median_age: medianAge != null ? Math.round(medianAge * 10) / 10 : null,
    median_income: medianIncome != null ? Math.round(medianIncome) : null,
    owner_occupied_pct:
      occupiedTotal && occupiedTotal > 0 && ownerOccupied != null
        ? Math.round((ownerOccupied / occupiedTotal) * 1000) / 10
        : null,
    renter_occupied_pct:
      occupiedTotal && occupiedTotal > 0 && renterOccupied != null
        ? Math.round((renterOccupied / occupiedTotal) * 1000) / 10
        : null,
    median_rent: medianRent != null ? Math.round(medianRent) : null,
    bachelors_plus_pct:
      eduTotal && eduTotal > 0 ? Math.round((eduBachPlus / eduTotal) * 1000) / 10 : null,
    vacancy_pct:
      housingTotal && housingTotal > 0 && vacantUnits != null
        ? Math.round((vacantUnits / housingTotal) * 1000) / 10
        : null
  };
}

/**
 * 3. PEOPLE & HOUSING
 * - U.S. Census Geocoder (geocoding.geo.census.gov) -> exact Tract + County + Incorporated Place
 * - U.S. Census ACS 5-Year API -> Tract & County socioeconomics
 * Strictly limited to age, income, owner/renter, rent, education, vacancy (zero race/ethnicity).
 */
export async function fetchPeopleAndHousing({
  lat,
  lng,
  addressLabel,
  censusApiKey = '',
  fetchImpl = fetch
}) {
  const fetchedAt = new Date().toISOString();

  // Step 1: Census Geocoder geographies from coordinates
  const geoUrl = new URL(
    'https://geocoding.geo.census.gov/geocoder/geographies/coordinates'
  );
  geoUrl.searchParams.set('x', String(lng));
  geoUrl.searchParams.set('y', String(lat));
  geoUrl.searchParams.set('benchmark', 'Public_AR_Current');
  geoUrl.searchParams.set('vintage', 'Current_Current');
  geoUrl.searchParams.set('format', 'json');

  const geoRes = await fetchImpl(geoUrl.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(9000)
  });

  if (!geoRes.ok) {
    throw new Error(`Census Geocoder HTTP ${geoRes.status}`);
  }

  const geoJson = await geoRes.json();
  const geographies = geoJson?.result?.geographies || {};
  const tractInfo = geographies['Census Tracts']?.[0];
  const countyInfo = geographies['Counties']?.[0];
  const placeInfo = geographies['Incorporated Places']?.[0] || null;

  if (!tractInfo?.STATE || !tractInfo?.COUNTY || !tractInfo?.TRACT) {
    return {
      available: false,
      address: addressLabel,
      fetched_at: null,
      source: null,
      incorporated_place: null,
      field_sources: {}
    };
  }

  const stateFips = tractInfo.STATE;
  const countyFips = tractInfo.COUNTY;
  const tractCode = tractInfo.TRACT;
  const tractNumber = formatTractNumber(tractCode);
  const countyName = countyInfo?.NAME || 'County';
  const incorporatedPlaceName = placeInfo?.BASENAME || placeInfo?.NAME || null;

  // Step 2: Try newest published ACS 5-year vintage (2024 -> fallback 2023)
  let acsYear = null;
  let tractSocio = null;
  let countySocio = null;
  let tractAge = null;
  let countyAge = null;

  for (const candidateYear of [2024, 2023]) {
    try {
      const makeUrl = (vars, forClause, inClause) => {
        const u = new URL(`https://api.census.gov/data/${candidateYear}/acs/acs5`);
        u.searchParams.set('get', vars.join(','));
        u.searchParams.set('for', forClause);
        if (inClause) u.searchParams.set('in', inClause);
        if (censusApiKey) u.searchParams.set('key', censusApiKey);
        return u.toString();
      };

      const [tSocioRes, cSocioRes, tAgeRes, cAgeRes] = await Promise.all([
        fetchImpl(
          makeUrl(SOCIO_VARS, `tract:${tractCode}`, `state:${stateFips} county:${countyFips}`),
          { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(9000) }
        ),
        fetchImpl(
          makeUrl(SOCIO_VARS, `county:${countyFips}`, `state:${stateFips}`),
          { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(9000) }
        ),
        fetchImpl(
          makeUrl(AGE_VARS, `tract:${tractCode}`, `state:${stateFips} county:${countyFips}`),
          { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(9000) }
        ),
        fetchImpl(
          makeUrl(AGE_VARS, `county:${countyFips}`, `state:${stateFips}`),
          { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(9000) }
        )
      ]);

      if (!tSocioRes.ok || !cSocioRes.ok) {
        continue;
      }

      const [tSocioMat, cSocioMat, tAgeMat, cAgeMat] = await Promise.all([
        tSocioRes.json(),
        cSocioRes.json(),
        tAgeRes.ok ? tAgeRes.json() : Promise.resolve(null),
        cAgeRes.ok ? cAgeRes.json() : Promise.resolve(null)
      ]);

      tractSocio = computeSocioStats(parseAcsRowToMap(tSocioMat));
      countySocio = computeSocioStats(parseAcsRowToMap(cSocioMat));
      tractAge = computeAgeCohorts(parseAcsRowToMap(tAgeMat));
      countyAge = computeAgeCohorts(parseAcsRowToMap(cAgeMat));
      acsYear = candidateYear;
      break;
    } catch {
      // Try prior vintage
    }
  }

  if (!acsYear || !tractSocio) {
    return {
      available: false,
      address: addressLabel,
      fetched_at: null,
      source: null,
      incorporated_place: incorporatedPlaceName,
      field_sources: {}
    };
  }

  const surveyYears = `${acsYear - 4}–${acsYear}`;
  const fullSource = `U.S. Census Bureau ${surveyYears} ACS 5-Year (Tract ${tractNumber} & ${countyName})`;

  const ageDistribution =
    tractAge && countyAge
      ? [
          { label: 'Under 18', tract_pct: tractAge.under_18, county_pct: countyAge.under_18, source: fullSource },
          { label: '18–34', tract_pct: tractAge.age_18_34, county_pct: countyAge.age_18_34, source: fullSource },
          { label: '35–49', tract_pct: tractAge.age_35_49, county_pct: countyAge.age_35_49, source: fullSource },
          { label: '50–64', tract_pct: tractAge.age_50_64, county_pct: countyAge.age_50_64, source: fullSource },
          { label: '65+', tract_pct: tractAge.age_65_plus, county_pct: countyAge.age_65_plus, source: fullSource }
        ]
      : [];

  return {
    available: true,
    address: addressLabel,
    fetched_at: fetchedAt,
    source: fullSource,
    tract_geoid: `${stateFips}${countyFips}${tractCode}`,
    tract_number: tractNumber,
    tract_label: `Census Tract ${tractNumber}`,
    county_name: countyName,
    survey_years: `${surveyYears} ACS 5-Year`,
    incorporated_place: incorporatedPlaceName,
    tract: {
      ...tractSocio,
      source: fullSource,
      fetched_at: fetchedAt
    },
    county: {
      ...(countySocio || {}),
      source: fullSource,
      fetched_at: fetchedAt
    },
    age_distribution: ageDistribution,
    field_sources: {
      geocoder_tract: {
        source: 'U.S. Census Geocoder (Public_AR_Current)',
        fetched_at: fetchedAt
      },
      acs_5yr: {
        source: fullSource,
        fetched_at: fetchedAt
      }
    }
  };
}

/**
 * 4. SAFETY
 * - FDLE data is reported by law-enforcement agency (never "neighborhood").
 * - Uses Census Incorporated Place (or parcel_jurisdiction) to determine whether the address
 *   is in unincorporated county (e.g. Palm Beach County Sheriff's Office / Broward Sheriff's Office)
 *   or an incorporated city.
 * - If no FDLE agency rows are imported yet, returns { available: false, hidden: true }.
 */
export async function fetchSafetyForAddress({
  sql,
  county,
  incorporatedPlace,
  addressLabel
}) {
  const fetchedAt = new Date().toISOString();
  const normalizedCounty = /palm/i.test(String(county || '')) ? 'Palm Beach' : 'Broward';
  const isUnincorporated = !incorporatedPlace;
  const jurisdictionKey = isUnincorporated
    ? 'unincorporated'
    : String(incorporatedPlace).trim().toLowerCase();

  if (!sql) {
    return {
      available: false,
      hidden: true,
      address: addressLabel,
      fetched_at: null,
      source: null,
      field_sources: {}
    };
  }

  try {
    const rows = isUnincorporated
      ? await sql`
          SELECT *
          FROM fdle_agency_stats
          WHERE county = ${normalizedCounty}
            AND is_unincorporated_sheriff = true
          ORDER BY report_year DESC
          LIMIT 5;
        `
      : await sql`
          SELECT *
          FROM fdle_agency_stats
          WHERE county = ${normalizedCounty}
            AND lower(jurisdiction_key) = ${jurisdictionKey}
          ORDER BY report_year DESC
          LIMIT 5;
        `;

    if (rows.length === 0) {
      return {
        available: false,
        hidden: true,
        address: addressLabel,
        fetched_at: null,
        source: null,
        field_sources: {}
      };
    }

    const latest = rows[0];
    const sourceLabel = `FDLE (${latest.report_year}) · ${latest.agency_name}`;

    return {
      available: true,
      hidden: false,
      address: addressLabel,
      fetched_at: fetchedAt,
      source: sourceLabel,
      agency_name: latest.agency_name,
      agency_ori: latest.agency_ori,
      is_unincorporated: isUnincorporated,
      report_year: Number(latest.report_year),
      population: latest.population != null ? Number(latest.population) : null,
      violent_count: latest.violent_count != null ? Number(latest.violent_count) : null,
      property_count: latest.property_count != null ? Number(latest.property_count) : null,
      violent_rate_per_100k:
        latest.violent_rate_per_100k != null ? Number(latest.violent_rate_per_100k) : null,
      property_rate_per_100k:
        latest.property_rate_per_100k != null ? Number(latest.property_rate_per_100k) : null,
      history: rows
        .slice()
        .reverse()
        .map((r) => ({
          year: Number(r.report_year),
          violent_rate_per_100k:
            r.violent_rate_per_100k != null ? Number(r.violent_rate_per_100k) : null,
          property_rate_per_100k:
            r.property_rate_per_100k != null ? Number(r.property_rate_per_100k) : null,
          source: sourceLabel
        })),
      field_sources: {
        agency_ucr: { source: sourceLabel, fetched_at: fetchedAt }
      }
    };
  } catch (err) {
    if (err?.code !== '42P01') {
      console.warn('fdle_agency_stats lookup warning:', err.message);
    }
    return {
      available: false,
      hidden: true,
      address: addressLabel,
      fetched_at: null,
      source: null,
      field_sources: {}
    };
  }
}
