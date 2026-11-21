import { getUserFromSession } from '../_lib/session.js';
import { getDb, parseJsonbObject, sendSafeApiError } from '../_lib/db.js';
import {
  fetchBuildingCharacteristicsMap,
  fetchBuildingCharacteristicOne,
  lookupBuildingRecord
} from '../_lib/buildingChars.js';
import { resolvePropertyCounty, normalizeCountyName } from '../../src/config/counties.js';
import { normalizePriceSource } from '../../src/components/investor/priceSource.js';
import { buildSaleMonthKey, mergeCompWithSavedDetails } from '../../src/components/investor/compDetailsModel.js';
import { getMarketTrends } from '../county/market.js';
import { getCountyFreshness } from '../county/freshness.js';

function haversineMiles(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((v) => Number.isFinite(v))) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const propertyId = req.query?.property_id || req.query?.propertyId;
    const analysisId = req.query?.analysis_id || req.query?.analysisId;

    if (!propertyId) {
      return res.status(400).json({ error: 'property_id is required' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // 1. Verify property ownership (Admin-only, 404 for other owners)
    const properties = await sql`
      SELECT *
      FROM investor_properties
      WHERE id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
      LIMIT 1;
    `;

    if (properties.length === 0) {
      return res.status(404).json({ error: 'Property not found or unauthorized' });
    }

    const rawProperty = properties[0];
    const parsedSubjectDetails = parseJsonbObject(rawProperty.subject_details);
    const asIsDetails = parsedSubjectDetails?.as_is && typeof parsedSubjectDetails.as_is === 'object'
      ? parsedSubjectDetails.as_is
      : {};
    const property = {
      ...rawProperty,
      subject_details: parsedSubjectDetails,
      price_source: normalizePriceSource(rawProperty.price_source ?? parsedSubjectDetails.price_source ?? 'list_price'),
      offer_price: rawProperty.offer_price != null
        ? Number(rawProperty.offer_price)
        : (parsedSubjectDetails.offer_price != null ? Number(parsedSubjectDetails.offer_price) : null),
      construction_detail: rawProperty.construction_detail || asIsDetails.construction_detail || parsedSubjectDetails.construction_detail || null,
      sketch_areas: parsedSubjectDetails.sketch_areas || asIsDetails.sketch_areas || null,
      recent_improvements: parsedSubjectDetails.recent_improvements || asIsDetails.recent_improvements || null
    };

    // 2. Fetch all saved analyses for this property (newest first)
    const analyses = await sql`
      SELECT id, owner_email, property_id, strategy, inputs, results, created_at
      FROM investor_analyses
      WHERE property_id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
      ORDER BY created_at DESC;
    `;

    // Determine selected analysis
    let selectedAnalysis = null;
    if (analysisId) {
      selectedAnalysis = analyses.find(a => a.id === analysisId) || null;
    }
    if (!selectedAnalysis && analyses.length > 0) {
      selectedAnalysis = analyses[0];
    }

    // 3. Fetch county parcel record (strictly non-PII, ZERO owner names or mailing addresses)
    let countyData = null;
    const county = resolvePropertyCounty(property) || 'Broward';
    if (property.parcel_id) {
      let parcels = [];
      try {
        parcels = await sql`
          SELECT 
            county, parcel_id, address, city, zip, use_code,
            living_sqft, year_built, eff_year_built, land_sqft, units, just_value, land_value,
            spec_feat_val, imp_qual, const_class,
            s_legal, subdivision_name, subdivision_code, nbrhd_cd, mkt_ar,
            situs_number, situs_street_norm, lat, lng, roll_year, imported_at
          FROM county_parcels
          WHERE county = ${county} AND parcel_id = ${property.parcel_id}
          LIMIT 1;
        `;
      } catch {
        parcels = await sql`
          SELECT 
            county, parcel_id, address, city, zip, use_code,
            living_sqft, year_built, eff_year_built, land_sqft, units, just_value,
            nbrhd_cd, mkt_ar, lat, lng, roll_year, imported_at
          FROM county_parcels
          WHERE county = ${county} AND parcel_id = ${property.parcel_id}
          LIMIT 1;
        `;
      }
      if (parcels.length > 0) {
        const parcel = parcels[0];
        const sales = await sql`
          SELECT 
            s.id, s.county, s.parcel_id, s.sale_price, s.sale_year, s.sale_month,
            s.qual_code, COALESCE(c.label, 'Unclassified transfer') AS qual_label,
            COALESCE(c.is_market, false) AS is_market,
            COALESCE(c.is_distressed, false) AS is_distressed,
            s.vi_cd, s.multi_parcel, s.source
          FROM county_sales s
          LEFT JOIN county_sale_codes c ON s.qual_code = c.qual_code
          WHERE s.county = ${county} AND s.parcel_id = ${property.parcel_id}
          ORDER BY s.sale_year DESC, s.sale_month DESC NULLS LAST, s.id DESC
          LIMIT 10;
        `;

        // Nearest qualified same-street sale (non-PII sanity anchor)
        let nearest_same_street_sale = null;
        if (parcel.situs_street_norm) {
          try {
            const streetRows = await sql`
              SELECT DISTINCT ON (p.parcel_id)
                p.county, p.parcel_id, p.address, p.city, p.zip, p.living_sqft,
                p.year_built, p.situs_number, p.lat, p.lng,
                s.sale_price, s.sale_year, s.sale_month, s.qual_code
              FROM county_parcels p
              JOIN county_sales s ON s.county = p.county AND s.parcel_id = p.parcel_id
              LEFT JOIN county_sale_codes c ON c.qual_code = s.qual_code
              WHERE p.county = ${county}
                AND p.situs_street_norm = ${parcel.situs_street_norm}
                AND p.parcel_id <> ${property.parcel_id}
                AND s.sale_price >= 50000
                AND COALESCE(c.is_market, false) = true
                AND s.sale_year IS NOT NULL
              ORDER BY p.parcel_id, s.sale_year DESC, s.sale_month DESC NULLS LAST
              LIMIT 40;
            `;
            if (streetRows.length > 0) {
              const pLat = parcel.lat != null ? Number(parcel.lat) : null;
              const pLng = parcel.lng != null ? Number(parcel.lng) : null;
              const pNum = parcel.situs_number ? parseInt(String(parcel.situs_number).replace(/\D/g, ''), 10) : NaN;
              const ranked = streetRows
                .map((r) => {
                  const rLat = r.lat != null ? Number(r.lat) : null;
                  const rLng = r.lng != null ? Number(r.lng) : null;
                  const dist = pLat != null && pLng != null && rLat != null && rLng != null
                    ? haversineMiles(pLat, pLng, rLat, rLng)
                    : null;
                  const rNum = r.situs_number ? parseInt(String(r.situs_number).replace(/\D/g, ''), 10) : NaN;
                  const numDiff = !isNaN(pNum) && !isNaN(rNum) ? Math.abs(pNum - rNum) : Number.MAX_SAFE_INTEGER;
                  const mo = r.sale_month != null ? String(r.sale_month).padStart(2, '0') : '01';
                  const sqft = Number(r.living_sqft) || null;
                  const price = Math.round(Number(r.sale_price));
                  return {
                    county: r.county,
                    parcel_id: r.parcel_id,
                    address: r.address,
                    sold_price: price,
                    sold_date: `${r.sale_year}-${mo}-01`,
                    sqft,
                    ppsf: sqft ? Math.round(price / sqft) : null,
                    distance_mi: dist,
                    source: 'county_roll',
                    _distSort: dist != null ? dist : Number.MAX_SAFE_INTEGER,
                    _numDiff: numDiff,
                    _recencySort: (Number(r.sale_year) || 0) * 100 + (Number(r.sale_month) || 0)
                  };
                })
                .sort((a, b) => {
                  if (Math.abs(a._distSort - b._distSort) > 0.03) return a._distSort - b._distSort;
                  if (a._numDiff !== b._numDiff) return a._numDiff - b._numDiff;
                  return b._recencySort - a._recencySort;
                });
              if (ranked[0]) {
                const { _distSort, _numDiff, _recencySort, ...best } = ranked[0];
                nearest_same_street_sale = best;
              }
            }
          } catch {
            // non-fatal
          }
        }

        const subjectBuildingChars = await fetchBuildingCharacteristicOne(sql, county, property.parcel_id);

        countyData = {
          ...parcel,
          just_value: parcel.just_value != null ? Number(parcel.just_value) : null,
          land_value: parcel.land_value != null ? Number(parcel.land_value) : null,
          building_characteristics: subjectBuildingChars,
          nearest_same_street_sale,
          sales
        };

        // Mirror key county parcel & CAMA building fields onto property so computeAppraisalGrid sees full context
        property.building_characteristics = subjectBuildingChars;
        if (property.just_value == null && countyData.just_value != null) property.just_value = countyData.just_value;
        if (property.land_value == null && countyData.land_value != null) property.land_value = countyData.land_value;
        if (!property.subdivision_name && countyData.subdivision_name) property.subdivision_name = countyData.subdivision_name;
        if (!property.subdivision_code && countyData.subdivision_code) property.subdivision_code = countyData.subdivision_code;
        if (!property.nbrhd_cd && countyData.nbrhd_cd) property.nbrhd_cd = countyData.nbrhd_cd;
        if (!property.s_legal && countyData.s_legal) property.s_legal = countyData.s_legal;
        if (!property.imp_qual && countyData.imp_qual) property.imp_qual = countyData.imp_qual;
        if (!property.const_class && countyData.const_class) property.const_class = countyData.const_class;
        if (!property.eff_year_built && (subjectBuildingChars?.effective_year_built || countyData.eff_year_built)) {
          property.eff_year_built = subjectBuildingChars?.effective_year_built || countyData.eff_year_built;
        }
        if (!property.sqft && subjectBuildingChars?.living_area_sqft) property.sqft = subjectBuildingChars.living_area_sqft;
      }
    }

    // 4. Fetch comps associated with this property (fully enriched with comp_details + county_parcels)
    let comps = [];
    try {
      const rawComps = await sql`
        SELECT *
        FROM investor_comps
        WHERE property_id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
        ORDER BY included DESC, sold_date DESC NULLS LAST, created_at DESC;
      `;

      const parcelIds = [...new Set(rawComps.map((c) => c.parcel_id).filter(Boolean))];
      const parcelMap = new Map();
      if (parcelIds.length > 0) {
        try {
          const pRows = await sql`
            SELECT
              county, parcel_id, year_built, eff_year_built, spec_feat_val, units,
              imp_qual, const_class, just_value, land_value,
              s_legal, subdivision_name, subdivision_code, nbrhd_cd, mkt_ar
            FROM county_parcels
            WHERE parcel_id = ANY(${parcelIds})
          `;
          for (const pr of pRows) {
            parcelMap.set(`${normalizeCountyName(pr.county) || pr.county}::${pr.parcel_id}`, pr);
          }
        } catch {
          // non-fatal
        }
      }

      const savedDetailsMap = new Map();
      if (parcelIds.length > 0) {
        try {
          const dRows = await sql`
            SELECT *
            FROM comp_details
            WHERE lower(owner_email) = ${cleanEmail}
              AND parcel_id = ANY(${parcelIds})
          `;
          for (const dr of dRows) {
            const key = `${normalizeCountyName(dr.county) || dr.county}::${dr.parcel_id}::${buildSaleMonthKey(dr.sale_date)}`;
            savedDetailsMap.set(key, dr);
          }
        } catch {
          // non-fatal
        }
      }

      const buildingMap = parcelIds.length > 0
        ? await fetchBuildingCharacteristicsMap(sql, parcelIds)
        : new Map();

      comps = rawComps.map((c) => {
        const parsedAdj = parseJsonbObject(c.adjustments);
        const parsedDet = parseJsonbObject(c.comp_details_json);
        const cCounty = normalizeCountyName(c.parcel_county || county) || county;
        const pKey = c.parcel_id ? `${cCounty}::${c.parcel_id}` : null;
        const parcelRow = pKey ? parcelMap.get(pKey) || null : null;
        const dKey = c.parcel_id && c.sold_date ? `${cCounty}::${c.parcel_id}::${buildSaleMonthKey(c.sold_date)}` : null;
        const savedRow = dKey ? savedDetailsMap.get(dKey) || null : null;
        const bcRow = c.parcel_id ? lookupBuildingRecord(buildingMap, cCounty, c.parcel_id) : null;
        const hydrated = {
          ...c,
          adjustments: parsedAdj,
          comp_details_json: Object.keys(parsedDet).length > 0 ? parsedDet : parseJsonbObject(parsedAdj.comp_details_json)
        };
        return mergeCompWithSavedDetails(hydrated, savedRow, parcelRow, bcRow);
      });
    } catch (compsErr) {
      console.warn('Could not load comps:', compsErr.message);
    }

    // 5. Fetch uploaded property photos
    let photos = [];
    try {
      photos = await sql`
        SELECT id, property_id, blob_url, caption, sort_order, is_cover, created_at
        FROM investor_property_photos
        WHERE property_id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
        ORDER BY is_cover DESC, sort_order ASC, created_at ASC;
      `;
    } catch (photoErr) {
      console.warn('Could not load photos:', photoErr.message);
    }

    // 6. Fetch user's investor profile (for cash to close, liquidity & valuation defaults/saved appraisals)
    let profile = {
      liquid_cash: 100000,
      reserve_months: 6,
      credit_tier: '740-759'
    };
    try {
      const profiles = await sql`
        SELECT *
        FROM investor_profile
        WHERE lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (profiles.length > 0) {
        profile = {
          ...profiles[0],
          valuation_defaults: parseJsonbObject(profiles[0].valuation_defaults)
        };
      }
    } catch (profErr) {
      console.warn('investor_profile note:', profErr.message);
    }

    // 7. Market statistics & complete months trend for property's ZIP
    let marketStats = {
      salesCount: 0,
      medianPpsf: null,
      distressedCount: 0,
      distressedSharePct: 0,
      monthlyTrend: []
    };
    let marketTrends = null;
    let countyFreshness = null;

    try {
      const freshnessMap = await getCountyFreshness();
      countyFreshness = freshnessMap[county] || null;
    } catch {
      // non-fatal
    }

    const zipToQuery = String(property.zip || countyData?.zip || '').trim();
    if (/^\d{5}$/.test(zipToQuery)) {
      try {
        marketTrends = await getMarketTrends({
          county,
          zip: zipToQuery,
          type: property.property_type || 'single_family'
        });
      } catch (mtErr) {
        console.warn('Could not compute getMarketTrends for report:', mtErr.message);
      }

      try {
        const statsRow = await sql`
          SELECT 
            count(*)::int as count,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY (s.sale_price / NULLIF(p.living_sqft, 0))) as median_ppsf,
            count(*) FILTER (WHERE c.is_distressed = true)::int as distressed_count
          FROM county_sales s
          JOIN county_parcels p ON s.county = p.county AND s.parcel_id = p.parcel_id
          LEFT JOIN county_sale_codes c ON s.qual_code = c.qual_code
          WHERE p.county = ${county} 
            AND p.zip = ${zipToQuery}
            AND s.sale_price >= 50000
            AND p.living_sqft > 400
            AND s.sale_year >= 2025;
        `;

        if (statsRow.length > 0) {
          const count = Number(statsRow[0].count) || 0;
          const distressed = Number(statsRow[0].distressed_count) || 0;
          marketStats.salesCount = count;
          marketStats.medianPpsf = statsRow[0].median_ppsf ? Math.round(Number(statsRow[0].median_ppsf)) : null;
          marketStats.distressedCount = distressed;
          marketStats.distressedSharePct = count > 0 ? Math.round((distressed / count) * 1000) / 10 : 0;
        }

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        const trendRows = await sql`
          SELECT 
            s.sale_year,
            s.sale_month,
            count(*)::int as count,
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (s.sale_price / NULLIF(p.living_sqft, 0))))::int as median_ppsf
          FROM county_sales s
          JOIN county_parcels p ON s.county = p.county AND s.parcel_id = p.parcel_id
          WHERE p.county = ${county} 
            AND p.zip = ${zipToQuery}
            AND s.sale_price >= 50000
            AND p.living_sqft > 400
            AND s.sale_year >= 2025
            AND NOT (s.sale_year = ${currentYear} AND s.sale_month = ${currentMonth})
          GROUP BY s.sale_year, s.sale_month
          ORDER BY s.sale_year DESC, s.sale_month DESC
          LIMIT 6;
        `;

        marketStats.monthlyTrend = trendRows.map(r => ({
          year: r.sale_year,
          month: r.sale_month,
          label: `${String(r.sale_month).padStart(2, '0')}/${r.sale_year}`,
          count: r.count,
          medianPpsf: r.median_ppsf
        })).reverse();
      } catch (marketErr) {
        console.warn('Could not compute market stats:', marketErr.message);
      }
    }

    return res.status(200).json({
      property,
      analyses,
      selectedAnalysis,
      countyData,
      comps,
      photos,
      profile,
      marketStats,
      marketTrends,
      countyFreshness
    });

  } catch (err) {
    return sendSafeApiError(res, err, 'Error generating deal report data', 'Unable to generate deal report right now. Please try again.');
  }
}
