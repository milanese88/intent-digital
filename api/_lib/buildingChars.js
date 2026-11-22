import { normalizeCountyName } from '../../src/config/counties.js';

/**
 * Batch-fetches county CAMA building_characteristics rows for a list of parcel folios.
 * Strictly 42P01-safe (returns an empty Map if the table has not been migrated yet).
 * Zero PII — building_characteristics contains no owner names or mailing addresses.
 */
export async function fetchBuildingCharacteristicsMap(sql, folios = []) {
  const map = new Map();
  const cleanFolios = Array.from(
    new Set(
      (folios || [])
        .map((f) => (f != null ? String(f).trim() : ''))
        .flatMap((f) => [f, f.replace(/[^0-9A-Za-z]/g, '')])
        .filter(Boolean)
    )
  );
  if (cleanFolios.length === 0) return map;

  try {
    const rows = await sql`
      SELECT
        county,
        folio,
        source,
        roll_year,
        property_class,
        building_count,
        beds,
        full_baths,
        half_baths,
        stories,
        year_built,
        effective_year_built,
        living_area_sqft,
        total_area_sqft,
        non_living_area_sqft,
        construction_type,
        exterior_wall_code,
        exterior_wall_desc,
        roof_type,
        roof_cover_code,
        roof_cover_desc,
        roof_structure_desc,
        quality_uad,
        raw_quality_code,
        raw_quality_desc,
        condition_uad,
        raw_condition_code,
        raw_condition_desc,
        condition_is_default,
        pool_type,
        pool_year,
        screen_enclosure,
        screen_enclosure_sqft,
        boat_dock,
        boat_dock_sqft,
        boat_dock_year,
        boat_lift,
        boat_lift_year,
        fireplaces,
        garage_type,
        garage_bays,
        garage_sqft,
        porch_sqft,
        patio_sqft,
        waterfront_view,
        land_class_code,
        land_class_desc,
        condo_model_desc,
        sub_areas_json,
        extra_features_json,
        updated_at
      FROM building_characteristics
      WHERE folio = ANY(${cleanFolios});
    `;

    for (const row of rows) {
      const c = normalizeCountyName(row.county) || row.county;
      const stripped = String(row.folio).replace(/[^0-9A-Za-z]/g, '');
      map.set(`${c}|${row.folio}`, row);
      map.set(`${c}|${stripped}`, row);
      if (!map.has(row.folio)) map.set(row.folio, row);
      if (!map.has(stripped)) map.set(stripped, row);
    }
  } catch (err) {
    if (err?.code !== '42P01' && err?.code !== '42703') {
      console.warn('building_characteristics batch lookup skipped:', err.message);
    }
  }

  return map;
}

export async function fetchBuildingCharacteristicOne(sql, county, folio) {
  const cleanFolio = folio != null ? String(folio).trim() : '';
  if (!cleanFolio) return null;
  const cleanCounty = normalizeCountyName(county) || county || 'Palm Beach';
  const map = await fetchBuildingCharacteristicsMap(sql, [cleanFolio]);
  return map.get(`${cleanCounty}|${cleanFolio}`) || map.get(cleanFolio) || null;
}

export function lookupBuildingRecord(map, county, folio) {
  if (!map || !folio) return null;
  const cleanFolio = String(folio).trim();
  const cleanCounty = normalizeCountyName(county) || county || '';
  return (cleanCounty ? map.get(`${cleanCounty}|${cleanFolio}`) : null) || map.get(cleanFolio) || null;
}

