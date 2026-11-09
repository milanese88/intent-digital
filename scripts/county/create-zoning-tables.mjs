import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../../api/_lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.production.local') });

export const MIGRATION_SQL = `
-- 1. Create site_data_sources table
CREATE TABLE IF NOT EXISTS site_data_sources (
  id SERIAL PRIMARY KEY,
  municipality TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('zoning', 'historic_district', 'historic_site', 'overlay')),
  service_url TEXT NOT NULL,
  code_field TEXT,
  name_field TEXT,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  verified_at DATE DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_site_data_sources_muni ON site_data_sources (municipality, kind);

-- 2. Seed verified sources only
INSERT INTO site_data_sources (municipality, kind, service_url, code_field, name_field, notes, active, verified_at)
VALUES
  ('Fort Lauderdale', 'zoning', 'https://gis.fortlauderdale.gov/server/rest/services/ZoningDistrict/MapServer/0', 'ZONECLASS', 'ZONING_DESC', 'Fort Lauderdale official zoning districts', true, CURRENT_DATE),
  ('Fort Lauderdale', 'historic_district', 'https://gis.fortlauderdale.gov/server/rest/services/HistoricDistrict/MapServer/0', NULL, 'NAME', 'Fort Lauderdale historic districts', true, CURRENT_DATE),
  ('Fort Lauderdale', 'historic_site', 'https://gis.fortlauderdale.gov/server/rest/services/HistoricProperty/MapServer/0', NULL, 'PROPNAME', 'Fort Lauderdale designated historic sites', true, CURRENT_DATE),
  ('Deerfield Beach', 'zoning', 'https://services1.arcgis.com/yJ4j7ns7W6juha0m/arcgis/rest/services/DFB_Zoning/FeatureServer/44', 'ZONECLASS', 'ZONING_DESC', 'Deerfield Beach official zoning districts', true, CURRENT_DATE),
  ('Deerfield Beach', 'overlay', 'https://services1.arcgis.com/yJ4j7ns7W6juha0m/arcgis/rest/services/Special_Architecture_District/FeatureServer/0', NULL, 'DISTRICT', 'Special Architecture District overlay (NOT historic)', true, CURRENT_DATE),
  ('Miramar', 'zoning', 'https://services6.arcgis.com/dAtAhTJ12QXYHJYN/arcgis/rest/services/MiramarZoning/FeatureServer/7', 'ZONECODE', 'ZONING', 'Miramar official zoning districts', true, CURRENT_DATE),
  ('Davie', 'zoning', 'https://gis.davie-fl.gov/gis/rest/services/CommDev/PlanningZoning_Reference_wm/MapServer/19', 'ZONING_CAT', 'LABEL', 'Davie official zoning categories', true, CURRENT_DATE),
  ('Davie', 'historic_district', 'https://gis.davie-fl.gov/gis/rest/services/CommDev/PlanningZoning_Reference_wm/MapServer/12', NULL, 'DISTRICT', 'Davie historic districts', true, CURRENT_DATE),
  ('Unincorporated Broward', 'zoning', 'https://services.arcgis.com/JMAJrTsHNLrSsWf5/arcgis/rest/services/Broward_Municipal_Service_District_Zoning/FeatureServer/2', 'ZONING', 'DESCRIPTION', 'Broward County Municipal Service District zoning', true, CURRENT_DATE)
ON CONFLICT DO NOTHING;

-- 3. Create city_zoning_links table
CREATE TABLE IF NOT EXISTS city_zoning_links (
  municipality TEXT PRIMARY KEY,
  zoning_map_url TEXT,
  code_url TEXT
);

-- Seed public zoning map and code links for all 31 Broward cities + Unincorporated Broward
INSERT INTO city_zoning_links (municipality, zoning_map_url, code_url)
VALUES
  ('Coconut Creek', 'https://coconutcreek.net/planning/zoning-map', 'https://library.municode.com/fl/coconut_creek/codes/code_of_ordinances?nodeId=COOR_CH13LADECO_ARTIIIZODIRE'),
  ('Cooper City', 'https://www.coopercity.gov/planning-zoning/page/zoning-map', 'https://library.municode.com/fl/cooper_city/codes/code_of_ordinances?nodeId=COOR_CH25ZO'),
  ('Coral Springs', 'https://coralsprings.maps.arcgis.com/apps/webappviewer/index.html?id=c799a4e3fa384c259837fbfa4cb96fcb', 'https://library.municode.com/fl/coral_springs/codes/code_of_ordinances?nodeId=COOR_CH25LADERE_ARTVIIIZODIRE'),
  ('Dania Beach', 'https://daniabeachfl.gov/DocumentCenter/View/115/Zoning-Map-PDF', 'https://library.municode.com/fl/dania_beach/codes/code_of_ordinances?nodeId=PTIIICOOR_CH28ZO'),
  ('Davie', 'https://gis.davie-fl.gov/portal/apps/webappviewer/index.html?id=45aa5136894541cb83bf95fa1b66dfdf', 'https://library.municode.com/fl/davie/codes/code_of_ordinances?nodeId=COOR_CH12LADECO_ARTVIIZODIRE'),
  ('Deerfield Beach', 'https://services1.arcgis.com/yJ4j7ns7W6juha0m/arcgis/rest/services/DFB_Zoning/FeatureServer/44', 'https://library.municode.com/fl/deerfield_beach/codes/code_of_ordinances?nodeId=COOR_CH98ZO'),
  ('Fort Lauderdale', 'https://gis.fortlauderdale.gov/portal/apps/webappviewer/index.html?id=d1ff92df0bf74534a74bf2524a87c1be', 'https://library.municode.com/fl/fort_lauderdale/codes/code_of_ordinances?nodeId=COOR_CH47UNDE_ARTIIZODI'),
  ('Hallandale Beach', 'https://www.hallandalebeachfl.gov/DocumentCenter/View/11100/Zoning-Map-PDF', 'https://library.municode.com/fl/hallandale_beach/codes/code_of_ordinances?nodeId=COOR_CH32ZO'),
  ('Hillsboro Beach', 'https://www.townofhillsborobeach.com/DocumentCenter/View/181/Zoning-Map-PDF', 'https://library.municode.com/fl/hillsboro_beach/codes/code_of_ordinances?nodeId=COOR_CH12ZO'),
  ('Hollywood', 'https://hollywoodfl.org/DocumentCenter/View/111/Official-Zoning-Map', 'https://library.municode.com/fl/hollywood/codes/code_of_ordinances?nodeId=COOR_TITXVLAUS_CH157ZOCO'),
  ('Lauderdale By The Sea', 'https://www.lauderdalebythesea-fl.gov/DocumentCenter/View/453/Zoning-Map-PDF', 'https://library.municode.com/fl/lauderdale-by-the-sea/codes/code_of_ordinances?nodeId=COOR_CH30UNDE_ARTVZODIRE'),
  ('Lauderdale Lakes', 'https://www.lauderdalelakes.org/DocumentCenter/View/83/Zoning-District-Map-PDF', 'https://library.municode.com/fl/lauderdale_lakes/codes/code_of_ordinances?nodeId=COOR_CH30UNDE_ARTIVZODI'),
  ('Lauderhill', 'https://www.lauderhill-fl.gov/departments/community-development/planning-zoning', 'https://library.municode.com/fl/lauderhill/codes/code_of_ordinances?nodeId=COOR_LADECO_SCHIVZODIRE'),
  ('Lazy Lake', NULL, NULL),
  ('Lighthouse Point', 'https://www.lighthousepoint.com/DocumentCenter/View/214/Zoning-Map-PDF', 'https://library.municode.com/fl/lighthouse_point/codes/code_of_ordinances?nodeId=COOR_CH42ZO'),
  ('Margate', 'https://www.margatefl.com/DocumentCenter/View/142/Zoning-Map-PDF', 'https://library.municode.com/fl/margate/codes/code_of_ordinances?nodeId=COOR_APXBZO'),
  ('Miramar', 'https://www.miramarfl.gov/DocumentCenter/View/1500/Zoning-Map-PDF', 'https://library.municode.com/fl/miramar/codes/code_of_ordinances?nodeId=COOR_LADECO_CH7ZODIRE'),
  ('North Lauderdale', 'https://www.nlauderdale.org/departments/community_development/planning_and_zoning.php', 'https://library.municode.com/fl/north_lauderdale/codes/code_of_ordinances?nodeId=COOR_APXBZO'),
  ('Oakland Park', 'https://www.oaklandparkfl.gov/DocumentCenter/View/402/Zoning-Map-PDF', 'https://library.municode.com/fl/oakland_park/codes/code_of_ordinances?nodeId=COOR_CH24LADECO_ARTIIIZODI'),
  ('Parkland', 'https://www.cityofparkland.org/DocumentCenter/View/102/Zoning-Map-PDF', 'https://library.municode.com/fl/parkland/codes/code_of_ordinances?nodeId=COOR_LADECO_ART15ZODI'),
  ('Pembroke Park', 'https://www.tompfl.com/DocumentCenter/View/172/Zoning-Map-PDF', 'https://library.municode.com/fl/pembroke_park/codes/code_of_ordinances?nodeId=COOR_CH28ZO'),
  ('Pembroke Pines', 'https://www.ppines.com/DocumentCenter/View/303/Zoning-Map-PDF', 'https://library.municode.com/fl/pembroke_pines/codes/code_of_ordinances?nodeId=COOR_TITXVLAUS_CH155ZOCO'),
  ('Plantation', 'https://www.plantation.org/home/showpublisheddocument/1654/637380182650000000', 'https://library.municode.com/fl/plantation/codes/code_of_ordinances?nodeId=COOR_CH27ZO'),
  ('Pompano Beach', 'https://pompanobeachfl.gov/pages/planning_zoning', 'https://library.municode.com/fl/pompano_beach/codes/code_of_ordinances?nodeId=TITXVLAUS_CH155ZOCO'),
  ('Sea Ranch Lakes', NULL, 'https://library.municode.com/fl/sea_ranch_lakes/codes/code_of_ordinances'),
  ('Southwest Ranches', 'https://www.southwestranches.org/DocumentCenter/View/45/Zoning-Map-PDF', 'https://library.municode.com/fl/southwest_ranches/codes/code_of_ordinances?nodeId=COOR_ART045ZODI'),
  ('Sunrise', 'https://www.sunrisefl.gov/departments-services/community-development/planning-and-zoning', 'https://library.municode.com/fl/sunrise/codes/code_of_ordinances?nodeId=COOR_CH16LADECO_ARTVIZODIRE'),
  ('Tamarac', 'https://www.tamarac.org/DocumentCenter/View/115/Official-Zoning-Map-PDF', 'https://library.municode.com/fl/tamarac/codes/code_of_ordinances?nodeId=COOR_CH10LADECO_ART3ZODI'),
  ('Unincorporated Broward', 'https://services.arcgis.com/JMAJrTsHNLrSsWf5/arcgis/rest/services/Broward_Municipal_Service_District_Zoning/FeatureServer/2', 'https://library.municode.com/fl/broward_county/codes/code_of_ordinances?nodeId=PTIICOOR_CH39ZO'),
  ('West Park', 'https://cityofwestpark.org/DocumentCenter/View/134/Zoning-Map-PDF', 'https://library.municode.com/fl/west_park/codes/code_of_ordinances?nodeId=COOR_CH28ZO'),
  ('Weston', 'https://www.westonfl.org/DocumentCenter/View/202/Zoning-Map-PDF', 'https://library.municode.com/fl/weston/codes/code_of_ordinances?nodeId=COOR_CH124ZO'),
  ('Wilton Manors', 'https://www.wiltonmanors.gov/DocumentCenter/View/45/Zoning-Map-PDF', 'https://library.municode.com/fl/wilton_manors/codes/code_of_ordinances?nodeId=PTIIICOOR_CH085ZODIRE')
ON CONFLICT (municipality) DO UPDATE SET
  zoning_map_url = EXCLUDED.zoning_map_url,
  code_url = EXCLUDED.code_url;

-- 4. Additive columns to parcel_site_info
ALTER TABLE parcel_site_info
  ADD COLUMN IF NOT EXISTS municipality TEXT,
  ADD COLUMN IF NOT EXISTS zoning_code TEXT,
  ADD COLUMN IF NOT EXISTS zoning_desc TEXT,
  ADD COLUMN IF NOT EXISTS zoning_source TEXT CHECK (zoning_source IS NULL OR zoning_source IN ('city_gis', 'manual')),
  ADD COLUMN IF NOT EXISTS zoning_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS historic_district TEXT,
  ADD COLUMN IF NOT EXISTS historic_site BOOLEAN,
  ADD COLUMN IF NOT EXISTS overlays TEXT[],
  ADD COLUMN IF NOT EXISTS historic_checked_at TIMESTAMPTZ;
`;

export async function runMigration() {
  const sql = getDb();
  console.log('Applying Step 3.3 migration...');

  await sql`
    CREATE TABLE IF NOT EXISTS site_data_sources (
      id SERIAL PRIMARY KEY,
      municipality TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('zoning', 'historic_district', 'historic_site', 'overlay')),
      service_url TEXT NOT NULL,
      code_field TEXT,
      name_field TEXT,
      notes TEXT,
      active BOOLEAN DEFAULT true,
      verified_at DATE DEFAULT CURRENT_DATE
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_site_data_sources_muni ON site_data_sources (municipality, kind)
  `;

  await sql`
    INSERT INTO site_data_sources (municipality, kind, service_url, code_field, name_field, notes, active, verified_at)
    VALUES
      ('Fort Lauderdale', 'zoning', 'https://gis.fortlauderdale.gov/server/rest/services/ZoningDistrict/MapServer/0', 'ZONECLASS', 'ZONING_DESC', 'Fort Lauderdale official zoning districts', true, CURRENT_DATE),
      ('Fort Lauderdale', 'historic_district', 'https://gis.fortlauderdale.gov/server/rest/services/HistoricDistrict/MapServer/0', NULL, 'NAME', 'Fort Lauderdale historic districts', true, CURRENT_DATE),
      ('Fort Lauderdale', 'historic_site', 'https://gis.fortlauderdale.gov/server/rest/services/HistoricProperty/MapServer/0', NULL, 'PROPNAME', 'Fort Lauderdale designated historic sites', true, CURRENT_DATE),
      ('Deerfield Beach', 'zoning', 'https://services1.arcgis.com/yJ4j7ns7W6juha0m/arcgis/rest/services/DFB_Zoning/FeatureServer/44', 'ZONECLASS', 'ZONING_DESC', 'Deerfield Beach official zoning districts', true, CURRENT_DATE),
      ('Deerfield Beach', 'overlay', 'https://services1.arcgis.com/yJ4j7ns7W6juha0m/arcgis/rest/services/Special_Architecture_District/FeatureServer/0', NULL, 'DISTRICT', 'Special Architecture District overlay (NOT historic)', true, CURRENT_DATE),
      ('Miramar', 'zoning', 'https://services6.arcgis.com/dAtAhTJ12QXYHJYN/arcgis/rest/services/MiramarZoning/FeatureServer/7', 'ZONECODE', 'ZONING', 'Miramar official zoning districts', true, CURRENT_DATE),
      ('Davie', 'zoning', 'https://gis.davie-fl.gov/gis/rest/services/CommDev/PlanningZoning_Reference_wm/MapServer/19', 'ZONING_CAT', 'LABEL', 'Davie official zoning categories', true, CURRENT_DATE),
      ('Davie', 'historic_district', 'https://gis.davie-fl.gov/gis/rest/services/CommDev/PlanningZoning_Reference_wm/MapServer/12', NULL, 'DISTRICT', 'Davie historic districts', true, CURRENT_DATE),
      ('Unincorporated Broward', 'zoning', 'https://services.arcgis.com/JMAJrTsHNLrSsWf5/arcgis/rest/services/Broward_Municipal_Service_District_Zoning/FeatureServer/2', 'ZONING', 'DESCRIPTION', 'Broward County Municipal Service District zoning', true, CURRENT_DATE)
    ON CONFLICT DO NOTHING
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS city_zoning_links (
      municipality TEXT PRIMARY KEY,
      zoning_map_url TEXT,
      code_url TEXT
    )
  `;

  await sql`
    INSERT INTO city_zoning_links (municipality, zoning_map_url, code_url)
    VALUES
      ('Coconut Creek', 'https://coconutcreek.net/planning/zoning-map', 'https://library.municode.com/fl/coconut_creek/codes/code_of_ordinances?nodeId=COOR_CH13LADECO_ARTIIIZODIRE'),
      ('Cooper City', 'https://www.coopercity.gov/planning-zoning/page/zoning-map', 'https://library.municode.com/fl/cooper_city/codes/code_of_ordinances?nodeId=COOR_CH25ZO'),
      ('Coral Springs', 'https://coralsprings.maps.arcgis.com/apps/webappviewer/index.html?id=c799a4e3fa384c259837fbfa4cb96fcb', 'https://library.municode.com/fl/coral_springs/codes/code_of_ordinances?nodeId=COOR_CH25LADERE_ARTVIIIZODIRE'),
      ('Dania Beach', 'https://daniabeachfl.gov/DocumentCenter/View/115/Zoning-Map-PDF', 'https://library.municode.com/fl/dania_beach/codes/code_of_ordinances?nodeId=PTIIICOOR_CH28ZO'),
      ('Davie', 'https://gis.davie-fl.gov/portal/apps/webappviewer/index.html?id=45aa5136894541cb83bf95fa1b66dfdf', 'https://library.municode.com/fl/davie/codes/code_of_ordinances?nodeId=COOR_CH12LADECO_ARTVIIZODIRE'),
      ('Deerfield Beach', 'https://services1.arcgis.com/yJ4j7ns7W6juha0m/arcgis/rest/services/DFB_Zoning/FeatureServer/44', 'https://library.municode.com/fl/deerfield_beach/codes/code_of_ordinances?nodeId=COOR_CH98ZO'),
      ('Fort Lauderdale', 'https://gis.fortlauderdale.gov/portal/apps/webappviewer/index.html?id=d1ff92df0bf74534a74bf2524a87c1be', 'https://library.municode.com/fl/fort_lauderdale/codes/code_of_ordinances?nodeId=COOR_CH47UNDE_ARTIIZODI'),
      ('Hallandale Beach', 'https://www.hallandalebeachfl.gov/DocumentCenter/View/11100/Zoning-Map-PDF', 'https://library.municode.com/fl/hallandale_beach/codes/code_of_ordinances?nodeId=COOR_CH32ZO'),
      ('Hillsboro Beach', 'https://www.townofhillsborobeach.com/DocumentCenter/View/181/Zoning-Map-PDF', 'https://library.municode.com/fl/hillsboro_beach/codes/code_of_ordinances?nodeId=COOR_CH12ZO'),
      ('Hollywood', 'https://hollywoodfl.org/DocumentCenter/View/111/Official-Zoning-Map', 'https://library.municode.com/fl/hollywood/codes/code_of_ordinances?nodeId=COOR_TITXVLAUS_CH157ZOCO'),
      ('Lauderdale By The Sea', 'https://www.lauderdalebythesea-fl.gov/DocumentCenter/View/453/Zoning-Map-PDF', 'https://library.municode.com/fl/lauderdale-by-the-sea/codes/code_of_ordinances?nodeId=COOR_CH30UNDE_ARTVZODIRE'),
      ('Lauderdale Lakes', 'https://www.lauderdalelakes.org/DocumentCenter/View/83/Zoning-District-Map-PDF', 'https://library.municode.com/fl/lauderdale_lakes/codes/code_of_ordinances?nodeId=COOR_CH30UNDE_ARTIVZODI'),
      ('Lauderhill', 'https://www.lauderhill-fl.gov/departments/community-development/planning-zoning', 'https://library.municode.com/fl/lauderhill/codes/code_of_ordinances?nodeId=COOR_LADECO_SCHIVZODIRE'),
      ('Lazy Lake', NULL, NULL),
      ('Lighthouse Point', 'https://www.lighthousepoint.com/DocumentCenter/View/214/Zoning-Map-PDF', 'https://library.municode.com/fl/lighthouse_point/codes/code_of_ordinances?nodeId=COOR_CH42ZO'),
      ('Margate', 'https://www.margatefl.com/DocumentCenter/View/142/Zoning-Map-PDF', 'https://library.municode.com/fl/margate/codes/code_of_ordinances?nodeId=COOR_APXBZO'),
      ('Miramar', 'https://www.miramarfl.gov/DocumentCenter/View/1500/Zoning-Map-PDF', 'https://library.municode.com/fl/miramar/codes/code_of_ordinances?nodeId=COOR_LADECO_CH7ZODIRE'),
      ('North Lauderdale', 'https://www.nlauderdale.org/departments/community_development/planning_and_zoning.php', 'https://library.municode.com/fl/north_lauderdale/codes/code_of_ordinances?nodeId=COOR_APXBZO'),
      ('Oakland Park', 'https://www.oaklandparkfl.gov/DocumentCenter/View/402/Zoning-Map-PDF', 'https://library.municode.com/fl/oakland_park/codes/code_of_ordinances?nodeId=COOR_CH24LADECO_ARTIIIZODI'),
      ('Parkland', 'https://www.cityofparkland.org/DocumentCenter/View/102/Zoning-Map-PDF', 'https://library.municode.com/fl/parkland/codes/code_of_ordinances?nodeId=COOR_LADECO_ART15ZODI'),
      ('Pembroke Park', 'https://www.tompfl.com/DocumentCenter/View/172/Zoning-Map-PDF', 'https://library.municode.com/fl/pembroke_park/codes/code_of_ordinances?nodeId=COOR_CH28ZO'),
      ('Pembroke Pines', 'https://www.ppines.com/DocumentCenter/View/303/Zoning-Map-PDF', 'https://library.municode.com/fl/pembroke_pines/codes/code_of_ordinances?nodeId=COOR_TITXVLAUS_CH155ZOCO'),
      ('Plantation', 'https://www.plantation.org/home/showpublisheddocument/1654/637380182650000000', 'https://library.municode.com/fl/plantation/codes/code_of_ordinances?nodeId=COOR_CH27ZO'),
      ('Pompano Beach', 'https://pompanobeachfl.gov/pages/planning_zoning', 'https://library.municode.com/fl/pompano_beach/codes/code_of_ordinances?nodeId=TITXVLAUS_CH155ZOCO'),
      ('Sea Ranch Lakes', NULL, 'https://library.municode.com/fl/sea_ranch_lakes/codes/code_of_ordinances'),
      ('Southwest Ranches', 'https://www.southwestranches.org/DocumentCenter/View/45/Zoning-Map-PDF', 'https://library.municode.com/fl/southwest_ranches/codes/code_of_ordinances?nodeId=COOR_ART045ZODI'),
      ('Sunrise', 'https://www.sunrisefl.gov/departments-services/community-development/planning-and-zoning', 'https://library.municode.com/fl/sunrise/codes/code_of_ordinances?nodeId=COOR_CH16LADECO_ARTVIZODIRE'),
      ('Tamarac', 'https://www.tamarac.org/DocumentCenter/View/115/Official-Zoning-Map-PDF', 'https://library.municode.com/fl/tamarac/codes/code_of_ordinances?nodeId=COOR_CH10LADECO_ART3ZODI'),
      ('Unincorporated Broward', 'https://services.arcgis.com/JMAJrTsHNLrSsWf5/arcgis/rest/services/Broward_Municipal_Service_District_Zoning/FeatureServer/2', 'https://library.municode.com/fl/broward_county/codes/code_of_ordinances?nodeId=PTIICOOR_CH39ZO'),
      ('West Park', 'https://cityofwestpark.org/DocumentCenter/View/134/Zoning-Map-PDF', 'https://library.municode.com/fl/west_park/codes/code_of_ordinances?nodeId=COOR_CH28ZO'),
      ('Weston', 'https://www.westonfl.org/DocumentCenter/View/202/Zoning-Map-PDF', 'https://library.municode.com/fl/weston/codes/code_of_ordinances?nodeId=COOR_CH124ZO'),
      ('Wilton Manors', 'https://www.wiltonmanors.gov/DocumentCenter/View/45/Zoning-Map-PDF', 'https://library.municode.com/fl/wilton_manors/codes/code_of_ordinances?nodeId=PTIIICOOR_CH085ZODIRE')
    ON CONFLICT (municipality) DO UPDATE SET
      zoning_map_url = EXCLUDED.zoning_map_url,
      code_url = EXCLUDED.code_url
  `;

  await sql`
    ALTER TABLE parcel_site_info
      ADD COLUMN IF NOT EXISTS municipality TEXT,
      ADD COLUMN IF NOT EXISTS zoning_code TEXT,
      ADD COLUMN IF NOT EXISTS zoning_desc TEXT,
      ADD COLUMN IF NOT EXISTS zoning_source TEXT CHECK (zoning_source IS NULL OR zoning_source IN ('city_gis', 'manual')),
      ADD COLUMN IF NOT EXISTS zoning_checked_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS historic_district TEXT,
      ADD COLUMN IF NOT EXISTS historic_site BOOLEAN,
      ADD COLUMN IF NOT EXISTS overlays TEXT[],
      ADD COLUMN IF NOT EXISTS historic_checked_at TIMESTAMPTZ
  `;

  console.log('Step 3.3 migration successfully applied!');
}

if (process.argv.includes('--apply')) {
  runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
