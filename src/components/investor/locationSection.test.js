import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

import { UNAVAILABLE_CARD_TEXT } from './locationCardGuards.js';
import {
  pointInGeometry,
  fetchSchoolsForPoint,
  fetchPeopleAndHousing
} from '../../../api/_lib/location-engine.js';
import { queryFemaNFHL } from '../../../api/site/flood.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Compile the real LocationSection.jsx via Vite's Oxc JSX transform so node --test renders actual JSX
async function loadLocationSectionComponent() {
  const jsxPath = path.join(__dirname, 'LocationSection.jsx');
  const guardsUrl = pathToFileURL(path.join(__dirname, 'locationCardGuards.js')).href;
  const reactUrl = import.meta.resolve('react');
  const jsxRuntimeUrl = import.meta.resolve('react/jsx-runtime');
  const rawJsx = fs.readFileSync(jsxPath, 'utf8');
  const transformed = await transformWithOxc(rawJsx, jsxPath, { lang: 'jsx' });
  const rewritten = transformed.code
    .replace(/from\s+['"]\.\/locationCardGuards\.js['"]/g, `from ${JSON.stringify(guardsUrl)}`)
    .replace(/from\s+['"]react['"]/g, `from ${JSON.stringify(reactUrl)}`)
    .replace(/from\s+['"]react\/jsx-runtime['"]/g, `from ${JSON.stringify(jsxRuntimeUrl)}`);
  const dataUrl = `data:text/javascript;base64,${Buffer.from(rewritten, 'utf8').toString('base64')}`;
  const mod = await import(dataUrl);
  return mod.default;
}

const LocationSection = await loadLocationSectionComponent();

test('Location cards NEVER render any value without a valid source + fetched_at, and never show source lines when unfetched', () => {
  const propAddr = '6857 Blue Bay Cir, Lake Worth, FL 33467';
  const ts = '2026-11-17T18:00:00.000Z';

  // Case A: Cards and items missing `source` -> must strip every unsourced value
  const htmlUnsourced = renderToStaticMarkup(
    React.createElement(LocationSection, {
      propertyAddress: propAddr,
      county: 'Palm Beach',
      lat: 26.574508,
      lng: -80.158868,
      locationData: {
        getting_around: {
          available: true,
          address: propAddr,
          fetched_at: ts,
          source: '', // Missing card source!
          highways: [
            { route: 'I-95', name: 'Unsourced Ramp 99', distance_mi: 1.9, drive_minutes: 5, source: '' }
          ],
          places: [
            { category: 'Groceries', name: 'Unsourced Grocer 88', distance_mi: 0.7, drive_minutes: 3, source: null }
          ]
        },
        schools: {
          available: true,
          address: propAddr,
          fetched_at: ts,
          source: null, // Missing source!
          schools: [
            { level: 'elementary', name: 'Unsourced Elementary 77', grade: 'A', grade_year: '2025-2026', source: '' }
          ]
        },
        people_housing: {
          available: true,
          address: propAddr,
          fetched_at: ts,
          source: 'U.S. Census ACS',
          tract_label: 'Census Tract 77.64',
          survey_years: '2019–2023 ACS 5-Year',
          // Card has source, but tract object lacks source -> must still block!
          tract: { median_income: 98765, median_rent: 3333, source: '' }
        },
        safety: {
          available: true,
          hidden: false,
          address: propAddr,
          fetched_at: ts,
          source: '', // Missing source!
          agency_name: "Palm Beach County Sheriff's Office",
          report_year: 2025,
          violent_rate_per_100k: 345.6
        }
      }
    })
  );

  // Fails immediately if ANY unsourced value leaked into the markup
  for (const forbidden of [
    'Unsourced Ramp 99',
    'Unsourced Grocer 88',
    'Unsourced Elementary 77',
    '98,765',
    '98765',
    '3,333',
    '345.6',
    'id="safety-card"',
    'data-testid="location-card-provenance"'
  ]) {
    assert.equal(
      htmlUnsourced.includes(forbidden),
      false,
      `Expected unsourced value "${forbidden}" NOT to render in LocationSection markup`
    );
  }

  // Unavailable message appears on Getting around, Schools, and People & housing
  const unavailableOccurrences = htmlUnsourced.split(UNAVAILABLE_CARD_TEXT).length - 1;
  assert.equal(unavailableOccurrences, 3);

  // Case B: Card has valid source, one item is sourced, one rogue item lacks source -> rogue item stripped
  const htmlMixedItems = renderToStaticMarkup(
    React.createElement(LocationSection, {
      propertyAddress: propAddr,
      county: 'Palm Beach',
      lat: 26.574508,
      lng: -80.158868,
      locationData: {
        getting_around: {
          available: true,
          address: propAddr,
          fetched_at: ts,
          source: 'Mapbox Search Box · Mapbox Matrix API',
          highways: [],
          places: [
            {
              category: 'Groceries',
              name: 'Publix at Woods Walk Plaza',
              distance_mi: 1.4,
              drive_minutes: 4,
              source: 'Mapbox Search Box API & Mapbox Matrix API'
            },
            {
              category: 'Pharmacy',
              name: 'Mystery Unsourced Pharmacy',
              distance_mi: 0.9,
              drive_minutes: 2,
              source: ''
            }
          ]
        }
      }
    })
  );

  assert.equal(htmlMixedItems.includes('Publix at Woods Walk Plaza'), true);
  assert.equal(htmlMixedItems.includes('Mystery Unsourced Pharmacy'), false);
});

test('Location cards render full provenance, Refresh buttons, Palm Beach school locator, Census tract/years (no race), and covering FDLE agency', () => {
  const propAddr = '6857 Blue Bay Cir, Lake Worth, FL 33467';
  const ts = '2026-11-17T18:00:00.000Z';

  const html = renderToStaticMarkup(
    React.createElement(LocationSection, {
      propertyAddress: propAddr,
      county: 'Palm Beach',
      lat: 26.574508,
      lng: -80.158868,
      locationData: {
        getting_around: {
          available: true,
          address: propAddr,
          fetched_at: ts,
          source: 'OpenStreetMap (Geofabrik FL) · Mapbox Search Box · Mapbox Matrix API',
          highways: [
            {
              route: 'FL Turnpike',
              name: 'FL Turnpike Exit 93 · Lake Worth Rd',
              distance_mi: 1.8,
              drive_minutes: 5,
              source: 'OpenStreetMap (Geofabrik Florida) & Mapbox Matrix API'
            }
          ],
          places: [
            {
              category: 'Groceries',
              name: 'Publix Super Market at Woods Walk',
              distance_mi: 1.4,
              drive_minutes: 4,
              source: 'Mapbox Search Box API & Mapbox Matrix API'
            }
          ]
        },
        schools: {
          available: true,
          zone_verified: false,
          address: propAddr,
          fetched_at: ts,
          source: 'FLDOE School Grades (2025-2026) · Nearest schools',
          schools: [
            {
              level: 'Elementary',
              name: 'Discovery Key Elementary',
              grade: 'A',
              grade_year: '2025-2026',
              distance_mi: 1.1,
              zone_verified: false,
              source: 'FLDOE School Grades (2025-2026)'
            }
          ]
        },
        people_housing: {
          available: true,
          address: propAddr,
          fetched_at: ts,
          source: 'U.S. Census Bureau 2019–2023 ACS 5-Year (Tract 77.64 & Palm Beach County)',
          tract_label: 'Census Tract 77.64',
          tract_number: '77.64',
          county_name: 'Palm Beach County',
          survey_years: '2019–2023 ACS 5-Year',
          tract: {
            median_age: 44.6,
            median_income: 96400,
            owner_occupied_pct: 81.2,
            renter_occupied_pct: 18.8,
            median_rent: 2620,
            bachelors_plus_pct: 42.5,
            vacancy_pct: 5.8,
            // Injected race field must NEVER be rendered
            race_white_pct: 61.9,
            source: 'U.S. Census Bureau 2019–2023 ACS 5-Year'
          },
          county: {
            median_age: 45.4,
            median_income: 81200,
            source: 'U.S. Census Bureau 2019–2023 ACS 5-Year'
          },
          age_distribution: [
            {
              label: 'Under 18',
              tract_pct: 21.4,
              county_pct: 19.1,
              source: 'U.S. Census Bureau 2019–2023 ACS 5-Year'
            }
          ]
        },
        safety: {
          available: true,
          hidden: false,
          address: propAddr,
          fetched_at: ts,
          source: "FDLE (2025) · Palm Beach County Sheriff's Office",
          agency_name: "Palm Beach County Sheriff's Office",
          is_unincorporated: true,
          report_year: 2025,
          violent_rate_per_100k: 298.4,
          property_rate_per_100k: 1640.2
        }
      }
    })
  );

  // All 4 cards show "Data for: <address> · as of <date> · <source>" and Refresh buttons
  const provMatches = html.match(/Data for: 6857 Blue Bay Cir, Lake Worth, FL 33467 · as of /g) || [];
  assert.equal(provMatches.length, 4);
  const refreshMatches = html.match(/>Refresh</g) || [];
  assert.equal(refreshMatches.length, 4);

  // Schools requirements
  assert.equal(html.includes('FLDOE 2025-2026'), true);
  assert.equal(html.includes('Attendance zone not verified'), true);
  assert.equal(html.includes("Boundaries change — confirm with the district&#x27;s school locator"), true);
  assert.equal(html.includes('palmbeachschools.org'), true);

  // People & housing requirements (tract + survey years, zero race/ethnicity)
  assert.equal(html.includes('Census Tract 77.64'), true);
  assert.equal(html.includes('2019–2023 ACS 5-Year'), true);
  assert.equal(html.includes('61.9'), false);

  // Safety requirements (reporting agency + year)
  assert.equal(html.includes("Palm Beach County Sheriff&#x27;s Office"), true);
  assert.equal(html.includes('2025 FDLE Agency Summary'), true);
});

test('MarketCard.jsx and LocationSection.jsx contain zero hard-coded Broward/sample location constants', () => {
  const marketCardSrc = fs.readFileSync(path.join(__dirname, 'MarketCard.jsx'), 'utf8');
  const locationSecSrc = fs.readFileSync(path.join(__dirname, 'LocationSection.jsx'), 'utf8');
  const combined = `${marketCardSrc}\n${locationSecSrc}`;

  for (const banned of [
    'HIGHWAY_NODES',
    'DAILY_PLACES',
    'REGIONAL_SCHOOLS',
    'Harbordale Elementary',
    'Sunrise Middle School',
    'Broward Health Medical Center',
    '$84,200',
    '$2,450/mo',
    '41.2 yrs',
    '3.2 / 1k',
    '18.6 / 1k',
    '$385/sf'
  ]) {
    assert.equal(
      combined.includes(banned),
      false,
      `Found banned hard-coded sample string "${banned}" in MarketCard/LocationSection`
    );
  }
});

test('Location engine pointInGeometry, Census tract parser, and FEMA NFHL Palm Beach mirror fallback work cleanly', async () => {
  const poly = {
    type: 'Polygon',
    coordinates: [
      [
        [-80.2, 26.5],
        [-80.1, 26.5],
        [-80.1, 26.6],
        [-80.2, 26.6],
        [-80.2, 26.5]
      ]
    ]
  };
  assert.equal(pointInGeometry([-80.158868, 26.574508], poly), true);
  assert.equal(pointInGeometry([-80.14, 26.12], poly), false);

  // Mocked Census Geocoder + ACS 5-year test for 6857 Blue Bay Cir (unincorporated Palm Beach)
  const mockFetchCensus = async (url) => {
    if (url.includes('geocoding.geo.census.gov')) {
      return {
        ok: true,
        json: async () => ({
          result: {
            geographies: {
              'Census Tracts': [{ STATE: '12', COUNTY: '099', TRACT: '007764' }],
              Counties: [{ NAME: 'Palm Beach County' }],
              'Incorporated Places': [] // Unincorporated!
            }
          }
        })
      };
    }
    if (url.includes('B19013_001E')) {
      return {
        ok: true,
        json: async () => [
          [
            'NAME', 'B01002_001E', 'B19013_001E', 'B25003_001E', 'B25003_002E', 'B25003_003E',
            'B25064_001E', 'B25002_001E', 'B25002_003E', 'B15003_001E',
            'B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E'
          ],
          [
            'Census Tract 77.64', '43.5', '94500', '1000', '800', '200',
            '2550', '1100', '55', '2000', '500', '250', '50', '40'
          ]
        ]
      };
    }
    return { ok: false, json: async () => null };
  };

  const censusRes = await fetchPeopleAndHousing({
    lat: 26.574508,
    lng: -80.158868,
    addressLabel: '6857 Blue Bay Cir, Lake Worth, FL 33467',
    fetchImpl: mockFetchCensus
  });
  assert.equal(censusRes.available, true);
  assert.equal(censusRes.tract_label, 'Census Tract 77.64');
  assert.equal(censusRes.incorporated_place, null);
  assert.equal(censusRes.tract.median_income, 94500);
  assert.equal(censusRes.tract.owner_occupied_pct, 80);
  assert.equal(censusRes.tract.vacancy_pct, 5);

  // Mocked Schools fallback when boundaries aren't loaded yet -> labels "Attendance zone not verified"
  const schoolsRes = await fetchSchoolsForPoint({
    sql: null,
    county: 'Palm Beach',
    lat: 26.574508,
    lng: -80.158868,
    addressLabel: '6857 Blue Bay Cir, Lake Worth, FL 33467',
    mapboxToken: 'pk.test',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [-80.162, 26.579] },
            properties: { name: 'Discovery Key Elementary School' }
          }
        ]
      })
    })
  });
  assert.equal(schoolsRes.available, true);
  assert.equal(schoolsRes.zone_verified, false);
  assert.equal(schoolsRes.schools[0].zone_badge, 'Attendance zone not verified');

  // FEMA NFHL mirror fallback test: hazards.fema.gov throws ECONNRESET -> msc.fema.gov succeeds for Palm Beach!
  let hazardsAttempted = 0;
  const femaRes = await queryFemaNFHL(-80.158868, 26.574508, async (url) => {
    if (url.includes('hazards.fema.gov')) {
      hazardsAttempted++;
      throw new Error('read ECONNRESET');
    }
    if (url.includes('/28/query')) {
      return {
        ok: true,
        json: async () => ({
          features: [
            { attributes: { FLD_ZONE: 'X', ZONE_SUBTY: 'AREA OF MINIMAL FLOOD HAZARD', SFHA_TF: 'F', STATIC_BFE: -9999 } }
          ]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        features: [{ attributes: { FIRM_PAN: '12099C0780F', EFF_DATE: 1507161600000 } }]
      })
    };
  });

  assert.ok(hazardsAttempted >= 1);
  assert.equal(femaRes.flood_zone, 'X');
  assert.equal(femaRes.flood_panel, '12099C0780F');
  assert.equal(femaRes.flood_source, 'FEMA NFHL');
});
