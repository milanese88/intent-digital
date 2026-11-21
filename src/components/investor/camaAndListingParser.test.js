import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregatePbcParcelBundle,
  mapPbcGradeToUad,
  mapPbcConditionToUad,
  mapPbcWallToConstruction,
  mapPbcRoofToCanonical,
  mapPbcLandClassToView,
  parseCondoModelGarageBays,
  formatQualityWithRawCode
} from '../../utils/camaBuildingMapper.js';
import { parseListingDetailsText } from '../../utils/listingDetailsParser.js';
import {
  mergeCompWithSavedDetails,
  mergeDetailsWithCountyBuilding,
  resolveSubjectDetailsForMode
} from './compDetailsModel.js';
import { computeAppraisalGrid } from './valuationEngine.js';
import { parseCsvLine, inferRollYearFromFilename } from '../../../scripts/county/import-cama-building.mjs';
import { CANONICAL_MIGRATION_ORDER, MIGRATION_SCHEMA_SIGNATURES } from '../../../scripts/db/_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Exact verified 2026 Palm Beach PAS405E CSV rows for 1901 Embassy Dr & 6857 Blue Bay Cir
const EMBASSY_BUNDLE = {
  pcn: '74434307010000010',
  parcel: parseCsvLine('74434307010000010,PARCEL,,1901,,,EMBASSY,DR,,WEST PALM BEACH,,,33401,0100,SINGLE FAMILY,963489.00,385310.00,.00,434563.00,528926.00,.00,927027.00,1,0,1,1'),
  resbld: [
    parseCsvLine('74434307010000010,RESBLD,0001,0100,SFR,1988,1998,04,03,00,2,17,MSY: CB STUCCO,16,WSF: STUCCO,03,GABLE/HIP,07,CONCRETE TILE,05,DRYWALL,00,N/A,14,CARPETING,15,CERAMIC/QUARRY,3,HTG & AC,4,FORCED AIR DUCT,4,ELECTRIC,R3,QUALITY 3,AV,AVERAGE,.9500,434202,3613,4782,3155')
  ],
  condo: [],
  combld: [],
  oby: [
    parseCsvLine('74434307010000010,OBY,0001,0002,SCE,SCREEN ENCLOSURE,0000,0000,001,6.02,240,1988,000,361')
  ],
  land: [
    parseCsvLine('74434307010000010,LAND,0001,S,SQUARE FOOT,G1,SF-GOLF RATE 1,0140,SFR GOLF COURSE,SF7,0123.0,0000,0000,ABUTS CONDO WTR 100FF,13939,.3200,1,14800,40,528926,')
  ]
};

const BLUE_BAY_BUNDLE = {
  pcn: '00424504060000780',
  parcel: parseCsvLine('00424504060000780,PARCEL,,6857,,,BLUE BAY,CIR,,LAKE WORTH,,,33467,0100,SINGLE FAMILY,579156.00,579156.00,.00,316686.00,262470.00,.00,499377.00,1,0,1,1'),
  resbld: [
    parseCsvLine('00424504060000780,RESBLD,0001,0100,SFR,1998,1998,03,02,00,1,17,MSY: CB STUCCO,00,NONE,03,GABLE/HIP,07,CONCRETE TILE,05,DRYWALL,00,N/A,14,CARPETING,15,CERAMIC/QUARRY,3,HTG & AC,4,FORCED AIR DUCT,4,ELECTRIC,R2,QUALITY 2,AV,AVERAGE,1.1400,315915,2550,3062,2236')
  ],
  condo: [],
  combld: [],
  oby: [
    parseCsvLine('00424504060000780,OBY,0001,0001,WLL,WALL,0000,0000,001,14.84,106,1998,000,771')
  ],
  land: [
    parseCsvLine('00424504060000780,LAND,0001,S,SQUARE FOOT,W1,SF-WATER RATE 1,0130,SFR WATER,PUD,0075.0,0000,0000,(N) .22 AC,9470,.2174,1,11000,24,262470,')
  ]
};

test('Palm Beach CAMA mapper maps 1901 Embassy Dr and 6857 Blue Bay Cir accurately with zero PII', () => {
  const embassy = aggregatePbcParcelBundle(EMBASSY_BUNDLE, { rollYear: 2026 });
  assert.equal(embassy.county, 'Palm Beach');
  assert.equal(embassy.folio, '74434307010000010');
  assert.equal(embassy.beds, 4);
  assert.equal(embassy.full_baths, 3);
  assert.equal(embassy.half_baths, 0);
  assert.equal(embassy.stories, 2);
  assert.equal(embassy.year_built, 1988);
  assert.equal(embassy.effective_year_built, 1998);
  assert.equal(embassy.living_area_sqft, 3155);
  assert.equal(embassy.total_area_sqft, 4782);
  assert.equal(embassy.non_living_area_sqft, 1627);
  assert.equal(embassy.construction_type, 'cbs');
  assert.equal(embassy.exterior_wall_desc, 'MSY: CB STUCCO / WSF: STUCCO');
  assert.equal(embassy.roof_type, 'barrel_tile');
  assert.equal(embassy.roof_structure_desc, 'GABLE/HIP');
  assert.equal(embassy.quality_uad, 'q3');
  assert.equal(embassy.raw_quality_code, 'R3');
  assert.equal(embassy.condition_uad, 'c4');
  assert.equal(embassy.raw_condition_code, 'AV');
  assert.equal(embassy.condition_is_default, true);
  assert.equal(embassy.screen_enclosure, true);
  assert.equal(embassy.screen_enclosure_sqft, 240);
  assert.equal(embassy.waterfront_view, 'golf');
  assert.equal('owner_name' in embassy, false);
  assert.equal('mailing_address' in embassy, false);

  const blueBay = aggregatePbcParcelBundle(BLUE_BAY_BUNDLE, { rollYear: 2026 });
  assert.equal(blueBay.beds, 3);
  assert.equal(blueBay.full_baths, 2);
  assert.equal(blueBay.living_area_sqft, 2236);
  assert.equal(blueBay.total_area_sqft, 3062);
  assert.equal(blueBay.quality_uad, 'q4');
  assert.equal(blueBay.raw_quality_code, 'R2');
  assert.equal(blueBay.condition_is_default, true);
  assert.equal(blueBay.waterfront_view, 'lake');
});

test('Palm Beach CAMA mapper handles 00 beds as NULL, PL1/PL3 pools, DOK/BOL, FRP, 8400 garage, and CONDO model bays', () => {
  const zeroBedRes = parseCsvLine('00000000000000001,RESBLD,0001,0100,SFR,1985,1995,00,02,01,1,05,WSF: WOOD SIDING,00,NONE,03,GABLE/HIP,03,ASPHALT/COMPOSI,05,DRYWALL,00,N/A,14,CARPETING,15,CERAMIC/QUARRY,3,HTG & AC,4,FORCED AIR DUCT,4,ELECTRIC,C2,CUSTOM 2,GD,GOOD,1.0,500000,2000,2600,2100');
  const detGarCard = parseCsvLine('00000000000000001,RESBLD,0002,8400,DETACHED GAR,1990,1990,00,00,00,1,17,MSY: CB STUCCO,00,NONE,03,GABLE/HIP,03,ASPHALT/COMPOSI,00,NONE,00,N/A,00,NONE,00,NONE,0,NONE,0,NONE,0,NONE,DG2,DET GAR 2,AV,AVERAGE,1.0,20000,480,480,0');
  const poolResortOby = parseCsvLine('00000000000000001,OBY,0001,0001,PL3,POOL LUXURY,0000,0000,001,48000,1,2022,000,48000');
  const dockOby = parseCsvLine('00000000000000001,OBY,0001,0002,DOK,DOCK,0000,0000,001,45,362,2021,000,16290');
  const liftOby = parseCsvLine('00000000000000001,OBY,0001,0003,BOL,BOAT LIFT,0000,0000,001,12000,1,2021,000,12000');
  const fireOby = parseCsvLine('00000000000000001,OBY,0001,0004,FRP,FIREPLACE,0000,0000,002,4500,1,1985,000,9000');

  const rec = aggregatePbcParcelBundle({
    pcn: '00000000000000001',
    parcel: parseCsvLine('00000000000000001,PARCEL,,10,,,RIVER,RD,,JUPITER,,,33477,0100,SINGLE FAMILY'),
    resbld: [zeroBedRes, detGarCard],
    condo: [],
    combld: [],
    oby: [poolResortOby, dockOby, liftOby, fireOby],
    land: [parseCsvLine('00000000000000001,LAND,0001,S,SF,O1,OCEAN,0121,INTRACOASTAL')]
  });

  assert.equal(rec.beds, null, '00 beds must map to NULL rather than 0');
  assert.equal(rec.full_baths, 2);
  assert.equal(rec.half_baths, 1);
  assert.equal(rec.construction_type, 'wood_frame');
  assert.equal(rec.roof_type, 'shingle');
  assert.equal(rec.quality_uad, 'q2');
  assert.equal(rec.raw_quality_code, 'C2');
  assert.equal(rec.condition_uad, 'c3');
  assert.equal(rec.condition_is_default, false, 'GD is a real condition signal, not default');
  assert.equal(rec.pool_type, 'resort');
  assert.equal(rec.pool_year, 2022);
  assert.equal(rec.boat_dock, true);
  assert.equal(rec.boat_dock_sqft, 362);
  assert.equal(rec.boat_lift, true);
  assert.equal(rec.fireplaces, 2);
  assert.equal(rec.garage_type, 'garage');
  assert.equal(rec.garage_sqft, 480);
  assert.equal(rec.waterfront_view, 'ocean_access');

  // Condo townhome with "JUNIPER/ 2C.G." -> 2 garage bays
  const condoRec = aggregatePbcParcelBundle({
    pcn: '00404327050000010',
    parcel: parseCsvLine('00404327050000010,PARCEL,,100,,,ARDEN,LN,,LOXAHATCHEE,,,33470,0110,TOWNHOUSE'),
    resbld: [],
    condo: [parseCsvLine('00404327050000010,CONDO,0040432705,ARDEN PUD POD I SOUTH,,0001,0110,TOWNHOUSE,2022,C1,JUNIPER/ 2C.G.,01,03,02.5,1952,375000,0')],
    combld: [],
    oby: [],
    land: []
  });
  assert.equal(condoRec.property_class, 'CONDO');
  assert.equal(condoRec.beds, 3);
  assert.equal(condoRec.full_baths, 2);
  assert.equal(condoRec.half_baths, 1);
  assert.equal(condoRec.living_area_sqft, 1952);
  assert.equal(condoRec.garage_type, 'garage');
  assert.equal(condoRec.garage_bays, 2);

  // Spot-check mapping helpers
  assert.equal(mapPbcGradeToUad('C5'), 'q1');
  assert.equal(mapPbcGradeToUad('R5'), 'q2');
  assert.equal(mapPbcGradeToUad('R3'), 'q3');
  assert.equal(mapPbcGradeToUad('R2'), 'q4');
  assert.equal(mapPbcGradeToUad('R1'), 'q5');
  assert.equal(mapPbcGradeToUad('E1'), 'q6');
  assert.deepEqual(mapPbcConditionToUad('AV'), { condition_uad: 'c4', condition_is_default: true });
  assert.deepEqual(mapPbcConditionToUad('GD'), { condition_uad: 'c3', condition_is_default: false });
  assert.deepEqual(mapPbcConditionToUad('VG'), { condition_uad: 'c2', condition_is_default: false });
  assert.deepEqual(mapPbcConditionToUad('FR'), { condition_uad: 'c5', condition_is_default: false });
  assert.deepEqual(mapPbcConditionToUad('VP'), { condition_uad: 'c6', condition_is_default: false });
  assert.equal(mapPbcWallToConstruction('MSY: CB STUCCO'), 'cbs');
  assert.equal(mapPbcWallToConstruction('WSF: HARDI-PLANK'), 'wood_frame');
  assert.equal(mapPbcRoofToCanonical('CONCRETE TILE'), 'barrel_tile');
  assert.equal(mapPbcRoofToCanonical('METAL STANDING SEAM'), 'metal');
  assert.equal(mapPbcLandClassToView('0131', 'INTRACOASTAL CANAL'), 'canal_fixed_bridge');
  assert.equal(parseCondoModelGarageBays('GREENW./1CG/GOLF'), 1);
});

test('Palm Beach AV condition is labeled "county default (not inspected)" and NEVER creates grid adjustments unless confirmed', () => {
  const embassyBc = aggregatePbcParcelBundle(EMBASSY_BUNDLE, { rollYear: 2026 });
  const blueBayBc = aggregatePbcParcelBundle(BLUE_BAY_BUNDLE, { rollYear: 2026 });
  const goodCondBc = {
    ...blueBayBc,
    folio: '00424504060000999',
    condition_uad: 'c3',
    raw_condition_code: 'GD',
    raw_condition_desc: 'GOOD',
    condition_is_default: false
  };

  // Subject has confirmed C2 condition; Comp 1 has Palm Beach AV (unconfirmed); Comp 2 has real GD (C3) signal
  const subjectConfirmed = {
    address: '1901 Embassy Dr',
    sqft: 3155,
    year_built: 1988,
    building_characteristics: embassyBc,
    subject_details: {
      as_is: {
        condition: 'c2',
        manual_fields: { condition: true }
      }
    }
  };

  const compAvDefault = mergeCompWithSavedDetails(
    {
      id: 'comp-av',
      address: '6857 Blue Bay Cir',
      sold_price: 620000,
      sold_date: '2026-08-01',
      sqft: 2236,
      included: true
    },
    null,
    null,
    blueBayBc
  );

  const compRealGd = mergeCompWithSavedDetails(
    {
      id: 'comp-gd',
      address: '6860 Blue Bay Cir',
      sold_price: 640000,
      sold_date: '2026-08-15',
      sqft: 2236,
      included: true
    },
    null,
    null,
    goodCondBc
  );

  assert.equal(compAvDefault.condition, 'unknown', 'AV default must stay unknown until confirmed');
  assert.equal(compAvDefault.field_origins.condition, 'county_default');
  assert.equal(compRealGd.condition, 'c3', 'Real GD signal auto-fills C3');
  assert.equal(compRealGd.field_origins.condition, 'county_record');

  const grid = computeAppraisalGrid({
    subject: subjectConfirmed,
    comps: [compAvDefault, compRealGd],
    mode: 'as_is'
  });

  const cAv = grid.comps.find((c) => c.id === 'comp-av');
  const cGd = grid.comps.find((c) => c.id === 'comp-gd');

  assert.equal(cAv.cells.condition.amount, 0, 'Unconfirmed county AV must produce $0 condition adjustment');
  assert.equal(cAv.cells.condition.needsInfo, true);
  assert.match(cAv.cells.condition.note, /county default \(not inspected\)/i);

  assert.ok(cGd.cells.condition.amount > 0, 'Real GD (C3) signal against confirmed C2 subject creates CIA (+) adjustment');
  assert.equal(cGd.cells.condition.needsInfo, false);

  // Also test when Subject itself has unconfirmed AV default -> subject condition stays unknown & creates $0 adjustments
  const subjectAvUnconfirmed = {
    address: '1901 Embassy Dr',
    sqft: 3155,
    building_characteristics: embassyBc
  };
  const resolvedSubj = resolveSubjectDetailsForMode(subjectAvUnconfirmed, 'as_is');
  assert.equal(resolvedSubj.condition, 'unknown');
  assert.equal(resolvedSubj.field_origins.condition, 'county_default');

  const gridUnconfirmedSubj = computeAppraisalGrid({
    subject: subjectAvUnconfirmed,
    comps: [compRealGd],
    mode: 'as_is'
  });
  assert.match(gridUnconfirmedSubj.subjectSummary.conditionDefaultNote, /county default \(not inspected\)/i);
  assert.equal(gridUnconfirmedSubj.comps[0].cells.condition.amount, 0);
});

test('Quality shows raw county code everywhere and manual edits ALWAYS win over county data', () => {
  const embassyBc = aggregatePbcParcelBundle(EMBASSY_BUNDLE, { rollYear: 2026 });

  // Case 1: Pure county auto-fill -> Q3 · R3, tagged county_record
  const autoMerged = mergeDetailsWithCountyBuilding({}, embassyBc);
  assert.equal(autoMerged.details.quality, 'q3');
  assert.equal(autoMerged.details.beds, 4);
  assert.equal(autoMerged.details.construction_type, 'cbs');
  assert.equal(autoMerged.field_origins.quality, 'county_record');
  assert.equal(autoMerged.field_origins.beds, 'county_record');
  assert.equal(autoMerged.field_origins.construction_type, 'county_record');
  assert.equal(formatQualityWithRawCode('q3', 'R3'), 'Q3 (R3)');

  // Case 2: User manually overrides quality to Q2 & beds to 5 -> my_edit ALWAYS wins; untouched fields stay county_record
  const editedMerged = mergeDetailsWithCountyBuilding(
    {
      quality: 'q2',
      beds: 5,
      manual_fields: { quality: true, beds: true }
    },
    embassyBc
  );
  assert.equal(editedMerged.details.quality, 'q2');
  assert.equal(editedMerged.details.beds, 5);
  assert.equal(editedMerged.details.roof_type, 'barrel_tile');
  assert.equal(editedMerged.field_origins.quality, 'my_edit');
  assert.equal(editedMerged.field_origins.beds, 'my_edit');
  assert.equal(editedMerged.field_origins.roof_type, 'county_record');

  // Verify raw county code appears in grid labels on both subject and comp
  const grid = computeAppraisalGrid({
    subject: {
      address: '1901 Embassy Dr',
      sqft: 3155,
      building_characteristics: embassyBc,
      subject_details: {
        as_is: {
          quality: 'q2',
          manual_fields: { quality: true }
        }
      }
    },
    comps: [
      {
        id: 'c1',
        address: '1905 Embassy Dr',
        sold_price: 950000,
        sold_date: '2026-09-01',
        sqft: 3100,
        included: true,
        building_characteristics: embassyBc
      }
    ],
    mode: 'as_is'
  });

  assert.match(grid.subjectSummary.qualityLabel, /Q2/);
  assert.match(grid.subjectSummary.qualityLabel, /county R3/);
  assert.match(grid.comps[0].cells.quality.spec, /Q3/);
  assert.match(grid.comps[0].cells.quality.spec, /R3/);
  assert.ok(grid.comps[0].cells.quality.amount > 0, 'Subject Q2 vs Comp Q3 creates positive CIA quality adjustment');
});

test('Paste listing details parser extracts beds, baths, sf, year, construction, roof, impact glass, pool, water access, boat lift, and HOA', () => {
  const listingBlurb = `
    Stunning waterfront residence! 4 Bedrooms, 3 Full, 1 Half Baths · 3,155 Sq Ft Living Area
    Lot Size: 0.32 Acres · Year Built: 1988 · CBS Construction
    2022 Concrete Tile Roof · Full Hurricane Impact Windows & Doors
    Resort-style pool with spa & screened patio · 3-Car Garage · 2 Fireplaces
    Direct Ocean Access with no fixed bridges, 362 sq ft private boat dock & 16,000 lb boat lift!
    Completely renovated kitchen and baths.
    Community: River Ridge Estates
    HOA Fee: $1,050/quarter
  `;

  const parsed = parseListingDetailsText(listingBlurb);
  assert.equal(parsed.fields.beds, 4);
  assert.equal(parsed.fields.full_baths, 3);
  assert.equal(parsed.fields.half_baths, 1);
  assert.equal(parsed.fields.sqft, 3155);
  assert.equal(parsed.fields.lot_sqft, Math.round(0.32 * 43560));
  assert.equal(parsed.fields.year_built, 1988);
  assert.equal(parsed.fields.construction_type, 'cbs');
  assert.equal(parsed.fields.roof_type, 'barrel_tile');
  assert.equal(parsed.fields.roof_year, 2022);
  assert.equal(parsed.fields.windows, 'impact');
  assert.equal(parsed.fields.pool_type, 'resort');
  assert.equal(parsed.fields.screen_enclosure, true);
  assert.equal(parsed.fields.waterfront_view, 'ocean_access');
  assert.equal(parsed.fields.boat_dock, true);
  assert.equal(parsed.fields.boat_dock_sqft, 362);
  assert.equal(parsed.fields.boat_lift, true);
  assert.equal(parsed.fields.garage_type, 'garage');
  assert.equal(parsed.fields.garage_bays, 3);
  assert.equal(parsed.fields.hoa_monthly, 350, 'Quarterly $1,050 converts cleanly to $350/mo');
  assert.equal(parsed.fields.hoa_name, 'River Ridge Estates');
  assert.equal(parsed.fields.condition, 'c2');
  assert.equal(parsed.fields.fireplaces, 2);
  assert.ok(parsed.items.length >= 14);
});

test('Migration add_building_characteristics.sql is registered, idempotent, RLS-enabled, and strictly non-PII', () => {
  assert.ok(CANONICAL_MIGRATION_ORDER.includes('add_building_characteristics.sql'));
  assert.ok(MIGRATION_SCHEMA_SIGNATURES['add_building_characteristics.sql']);

  const sqlPath = path.join(PROJECT_ROOT, 'migrations/add_building_characteristics.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  assert.match(sqlContent, /CREATE TABLE IF NOT EXISTS building_characteristics/i);
  assert.match(sqlContent, /PRIMARY KEY \(county, folio\)/i);
  assert.match(sqlContent, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sqlContent, /condition_is_default boolean/i);
  assert.equal(/INSERT INTO/i.test(sqlContent), false, 'Migration must have zero test rows');
  assert.equal(/owner_name|mailing_addr|mail_addr/i.test(sqlContent), false, 'No owner names or mailing addresses allowed');

  // Importer CSV helper sanity
  assert.deepEqual(parseCsvLine('a,"b, c","d""e",f'), ['a', 'b, c', 'd"e', 'f']);
  assert.equal(inferRollYearFromFilename('PAS405_CSV_CERT2026_20261027.TXT'), 2026);
});
