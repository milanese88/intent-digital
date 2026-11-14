import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import { getCountyFreshness } from './freshness.js';
import {
  validateCompSearchParams,
  computeSqftBounds,
  computeMonthsAgo,
  computeMonthWindowRange,
  formatCountyWindowNote,
  computeCompSimilarityScore,
  evaluateAndSortCompCandidates
} from '../../src/components/investor/compSearchLogic.js';
import {
  buildSaleMonthKey,
  formatCountyClues,
  normalizeCompDetails,
  computeDetailsProgress
} from '../../src/components/investor/compDetailsModel.js';

const ALLOWED_COUNTIES = new Set(['Broward', 'Palm Beach']);
const MAX_CANDIDATES = 20;

/**
 * Calculates exact Haversine distance in miles between two lat/lng points
 */
function haversineDistanceMiles(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 3958.8; // Earth's radius in miles
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

    const rawCounty = req.query?.county ? String(req.query.county).trim() : 'Broward';
    if (!ALLOWED_COUNTIES.has(rawCounty)) {
      return res.status(400).json({ error: 'Invalid county parameter. Allowed values: Broward, Palm Beach.' });
    }
    const county = rawCounty;

    const parcelId = req.query?.parcel_id ? String(req.query.parcel_id).trim() : '';
    if (!parcelId) {
      return res.status(400).json({ error: 'parcel_id is required' });
    }

    const validation = validateCompSearchParams(req.query || {});
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const { months, radius, sizePct, includeDistressed } = validation.params;

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();
    const now = new Date();

    // Fetch subject parcel & cached county freshness in parallel
    const [subjects, freshnessMap] = await Promise.all([
      sql`
        SELECT
          county,
          parcel_id,
          address,
          city,
          zip,
          use_code,
          living_sqft,
          nbrhd_cd,
          mkt_ar,
          year_built,
          eff_year_built,
          units,
          lat,
          lng
        FROM county_parcels
        WHERE county = ${county} AND parcel_id = ${parcelId}
        LIMIT 1;
      `,
      getCountyFreshness().catch(() => null)
    ]);

    if (subjects.length === 0) {
      return res.status(404).json({ error: 'Subject parcel not found' });
    }

    const subject = subjects[0];
    const subjectSqft = Number(subject.living_sqft) || 0;
    const subLat = subject.lat != null ? Number(subject.lat) : null;
    const subLng = subject.lng != null ? Number(subject.lng) : null;
    const hasCoordinates = subLat != null && subLng != null && !isNaN(subLat) && !isNaN(subLng);

    const countyFreshness = freshnessMap?.[county] || null;
    const dataNote = formatCountyWindowNote({
      months,
      countyFreshness,
      effectiveDate: now
    });
    const tierLabel = hasCoordinates ? `Within ${radius} mi` : 'Same neighborhood';

    if (subjectSqft <= 0 && sizePct !== 'any') {
      return res.status(200).json({
        summary: {
          count: 0,
          inlier_count: 0,
          outlier_count: 0,
          total_matching: 0,
          median_price_per_sqft: null,
          renovated_median_price_per_sqft: null,
          tier: 1,
          tier_label: tierLabel,
          has_coordinates: hasCoordinates,
          radius_mi: radius,
          window_months: months,
          size_pct: sizePct,
          sqft_min: null,
          sqft_max: null,
          data_note: dataNote
        },
        candidates: []
      });
    }

    const { minSqft, maxSqft } = computeSqftBounds(subjectSqft, sizePct);
    const {
      startYear,
      startMonth,
      endYear,
      endMonth
    } = computeMonthWindowRange(months, now);

    // Push qual_code & (sale_year, sale_month) directly into idx_county_sales_comps
    const allowedQualCodes = includeDistressed
      ? ['01', '02', '12', '18', '19', '38']
      : ['01', '02'];

    const dateCondition = startYear === endYear
      ? sql`s.sale_year = ${startYear} AND COALESCE(s.sale_month, 1) BETWEEN ${startMonth} AND ${endMonth}`
      : sql`(
          (s.sale_year = ${startYear} AND s.sale_month >= ${startMonth})
          OR (s.sale_year = ${endYear} AND COALESCE(s.sale_month, 1) <= ${endMonth})
          OR (s.sale_year > ${startYear} AND s.sale_year < ${endYear})
        )`;

    const sqftCondition = minSqft != null && maxSqft != null
      ? sql`p.living_sqft >= ${minSqft} AND p.living_sqft <= ${maxSqft}`
      : sql`p.living_sqft > 0`;

    let locationWhere = null;
    if (hasCoordinates) {
      const deltaLat = radius / 69.0;
      const cosLat = Math.max(0.1, Math.cos((subLat * Math.PI) / 180));
      const deltaLng = radius / (69.0 * cosLat);
      const minLat = subLat - deltaLat;
      const maxLat = subLat + deltaLat;
      const minLng = subLng - deltaLng;
      const maxLng = subLng + deltaLng;
      locationWhere = sql`p.lat BETWEEN ${minLat} AND ${maxLat} AND p.lng BETWEEN ${minLng} AND ${maxLng}`;
    } else if (subject.nbrhd_cd) {
      locationWhere = sql`p.nbrhd_cd = ${subject.nbrhd_cd}`;
    } else if (subject.zip) {
      locationWhere = sql`p.zip = ${subject.zip}`;
    }

    let rows = [];
    if (locationWhere) {
      try {
        rows = await sql`
          SELECT DISTINCT ON (s.county, s.parcel_id)
            s.parcel_id,
            p.address,
            p.city,
            p.zip,
            p.living_sqft,
            p.land_sqft,
            p.year_built,
            p.eff_year_built,
            p.units,
            p.imp_qual,
            p.const_class,
            p.spec_feat_val,
            p.beds AS county_beds,
            p.full_baths AS county_full_baths,
            p.half_baths AS county_half_baths,
            p.lat,
            p.lng,
            s.sale_price,
            s.sale_year,
            s.sale_month,
            s.qual_code,
            COALESCE(c.label, 'Transfer') AS code_label,
            COALESCE(c.label, 'Transfer') AS label,
            COALESCE(c.is_distressed, false) AS is_distressed
          FROM county_sales s
          JOIN county_parcels p ON s.county = p.county AND s.parcel_id = p.parcel_id
          LEFT JOIN county_sale_codes c ON s.qual_code = c.qual_code
          WHERE s.county = ${subject.county}
            AND p.use_code = ${subject.use_code}
            AND s.parcel_id <> ${subject.parcel_id}
            AND ${locationWhere}
            AND ${sqftCondition}
            AND s.sale_price > 10000
            AND s.qual_code = ANY(${allowedQualCodes})
            AND ${dateCondition}
          ORDER BY s.county, s.parcel_id, s.sale_year DESC, s.sale_month DESC NULLS LAST, s.id DESC;
        `;
      } catch (colErr) {
        // Fallback before add_comp_details_and_nal_clues.sql is applied
        if (colErr?.code === '42703') {
          rows = await sql`
            SELECT DISTINCT ON (s.county, s.parcel_id)
              s.parcel_id,
              p.address,
              p.city,
              p.zip,
              p.living_sqft,
              p.land_sqft,
              p.year_built,
              p.eff_year_built,
              p.units,
              p.lat,
              p.lng,
              s.sale_price,
              s.sale_year,
              s.sale_month,
              s.qual_code,
              COALESCE(c.label, 'Transfer') AS code_label,
              COALESCE(c.label, 'Transfer') AS label,
              COALESCE(c.is_distressed, false) AS is_distressed
            FROM county_sales s
            JOIN county_parcels p ON s.county = p.county AND s.parcel_id = p.parcel_id
            LEFT JOIN county_sale_codes c ON s.qual_code = c.qual_code
            WHERE s.county = ${subject.county}
              AND p.use_code = ${subject.use_code}
              AND s.parcel_id <> ${subject.parcel_id}
              AND ${locationWhere}
              AND ${sqftCondition}
              AND s.sale_price > 10000
              AND s.qual_code = ANY(${allowedQualCodes})
              AND ${dateCondition}
            ORDER BY s.county, s.parcel_id, s.sale_year DESC, s.sale_month DESC NULLS LAST, s.id DESC;
          `;
        } else {
          throw colErr;
        }
      }
    }

    // Score strictly within radius (never auto-widen silently)
    const matched = [];
    for (const row of rows) {
      let rawDist = null;
      let distance_mi = null;

      if (hasCoordinates && row.lat != null && row.lng != null) {
        rawDist = haversineDistanceMiles(subLat, subLng, Number(row.lat), Number(row.lng));
        if (rawDist == null || rawDist > radius) {
          continue;
        }
        distance_mi = Math.round(rawDist * 100) / 100;
      } else if (hasCoordinates) {
        continue;
      }

      const sqft = Number(row.living_sqft) || 0;
      const price = Number(row.sale_price) || 0;
      if (sqft <= 0 || price <= 0) continue;

      const saleYear = Number(row.sale_year);
      const saleMonth = row.sale_month != null ? Number(row.sale_month) : null;
      const months_ago = computeMonthsAgo(saleYear, saleMonth, now);

      const eff = row.eff_year_built != null ? Number(row.eff_year_built) : null;
      const yb = row.year_built != null ? Number(row.year_built) : null;
      // Requirement 2: "Likely renovated" hint when effective year built is >= 15 years newer than actual year built
      const likely_renovated = eff != null && yb != null && (eff - yb) >= 15;
      const price_per_sqft = Math.round(price / sqft);

      const county_clues = formatCountyClues({
        year_built: yb,
        eff_year_built: eff,
        units: row.units,
        imp_qual: row.imp_qual,
        const_class: row.const_class,
        spec_feat_val: row.spec_feat_val,
        beds: row.county_beds,
        full_baths: row.county_full_baths,
        half_baths: row.county_half_baths
      });

      const similarity_score = computeCompSimilarityScore({
        monthsAgo: months_ago,
        rawDistanceMi: rawDist,
        livingSqft: sqft,
        subjectSqft
      });

      matched.push({
        parcel_id: row.parcel_id,
        address: row.address,
        city: row.city,
        zip: row.zip,
        living_sqft: sqft,
        land_sqft: row.land_sqft != null ? Number(row.land_sqft) : null,
        year_built: yb,
        eff_year_built: eff,
        units: county_clues.units,
        imp_qual: county_clues.impQualCode,
        const_class: county_clues.constClassCode,
        spec_feat_val: county_clues.specFeatVal,
        county_clues,
        lat: row.lat != null ? Number(row.lat) : null,
        lng: row.lng != null ? Number(row.lng) : null,
        distance_mi: distance_mi != null ? Math.round(distance_mi * 10) / 10 : null,
        raw_distance_mi: distance_mi,
        sale_price: price,
        sale_year: saleYear,
        sale_month: saleMonth,
        months_ago,
        price_per_sqft,
        similarity_score,
        qual_code: row.qual_code,
        code_label: row.code_label,
        label: row.label,
        is_distressed: Boolean(row.is_distressed),
        likely_renovated,
        tier: 1
      });
    }

    // Sort all matched sales by similarity_score descending first, then cap to MAX_CANDIDATES
    matched.sort((a, b) => b.similarity_score - a.similarity_score);
    const totalMatching = matched.length;
    const candidatePool = matched.slice(0, MAX_CANDIDATES).map(({ raw_distance_mi: _unused, ...rest }) => rest);

    // Flag $/sf outliers, exclude from median, and sort outliers to the bottom
    const evaluated = evaluateAndSortCompCandidates(candidatePool);

    // Attach user's reusable saved comp_details (keyed by county + folio + sale_month_key)
    let savedByKey = new Map();
    let savedByFolio = new Map();
    if (evaluated.candidates.length > 0) {
      const candidateParcelIds = evaluated.candidates.map((c) => c.parcel_id).filter(Boolean);
      try {
        const detailRows = await sql`
          SELECT *
          FROM comp_details
          WHERE lower(owner_email) = ${cleanEmail}
            AND county = ${subject.county}
            AND parcel_id = ANY(${candidateParcelIds})
          ORDER BY updated_at DESC;
        `;
        for (const dr of detailRows) {
          const exactKey = `${dr.parcel_id}|${dr.sale_month_key || ''}`;
          if (!savedByKey.has(exactKey)) savedByKey.set(exactKey, dr);
          if (!savedByFolio.has(dr.parcel_id)) savedByFolio.set(dr.parcel_id, dr);
        }
      } catch (err) {
        if (err?.code !== '42P01') {
          console.warn('comp_details lookup in /api/county/comps skipped:', err.message);
        }
      }
    }

    const enrichedCandidates = evaluated.candidates.map((cand) => {
      const monthKey = buildSaleMonthKey(cand.sale_year, cand.sale_month);
      const savedRow = savedByKey.get(`${cand.parcel_id}|${monthKey}`) || savedByFolio.get(cand.parcel_id) || null;
      if (!savedRow) {
        return {
          ...cand,
          saved_comp_details: null,
          details_filled_count: 0,
          details_progress: null
        };
      }
      const norm = normalizeCompDetails(savedRow);
      const progress = computeDetailsProgress(norm);
      return {
        ...cand,
        saved_comp_details: norm,
        details_filled_count: progress.filledCount,
        details_progress: progress
      };
    });

    return res.status(200).json({
      summary: {
        count: enrichedCandidates.length,
        inlier_count: evaluated.inlier_count,
        outlier_count: evaluated.outlier_count,
        total_matching: totalMatching,
        median_price_per_sqft: evaluated.median_price_per_sqft,
        renovated_median_price_per_sqft: evaluated.renovated_median_price_per_sqft,
        tier: 1,
        tier_label: tierLabel,
        has_coordinates: hasCoordinates,
        radius_mi: radius,
        window_months: months,
        size_pct: sizePct,
        sqft_min: minSqft,
        sqft_max: maxSqft,
        data_note: dataNote
      },
      candidates: enrichedCandidates
    });
  } catch (err) {
    console.error('Error in /api/county/comps:', err);
    return res.status(500).json({ error: 'Internal server error while searching county comps' });
  }
}
