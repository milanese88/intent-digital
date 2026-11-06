import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

/**
 * Calculates the median of an array of numbers
 */
function calculateMedian(numbers) {
  if (!numbers || numbers.length === 0) return null;
  const valid = numbers.filter(n => n != null && !isNaN(n)).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) {
    return valid[mid];
  }
  return Math.round((valid[mid - 1] + valid[mid]) / 2);
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

    const county = req.query?.county ? String(req.query.county).trim() : 'Broward';
    const parcelId = req.query?.parcel_id ? String(req.query.parcel_id).trim() : '';
    const includeDistressed = req.query?.include_distressed === '1' || req.query?.include_distressed === 'true';

    if (!parcelId) {
      return res.status(400).json({ error: 'parcel_id is required' });
    }

    const sql = getDb();

    // 1. Fetch Subject Parcel (strictly non-PII)
    const subjects = await sql`
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
        eff_year_built
      FROM county_parcels
      WHERE county = ${county} AND parcel_id = ${parcelId}
      LIMIT 1;
    `;

    if (subjects.length === 0) {
      return res.status(404).json({ error: 'Subject parcel not found' });
    }

    const subject = subjects[0];
    const subjectSqft = Number(subject.living_sqft) || 0;

    if (subjectSqft <= 0) {
      return res.status(200).json({
        summary: {
          count: 0,
          median_price_per_sqft: null,
          renovated_median_price_per_sqft: null,
          tier: 1,
          tier_label: 'Same neighborhood',
          window_months: 12,
          sqft_min: 0,
          sqft_max: 0
        },
        candidates: []
      });
    }

    // ±25% living_sqft
    const minSqft = Math.round(subjectSqft * 0.75);
    const maxSqft = Math.round(subjectSqft * 1.25);

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;

    // Helper to query distinct candidate parcels for a specific tier and window
    async function queryTierCandidates(tierNum, windowMonths) {
      const qualCondition = includeDistressed
        ? sql`(c.is_market = true OR c.is_distressed = true)`
        : sql`c.is_market = true`;

      let tierWhere;
      if (tierNum === 1) {
        if (!subject.nbrhd_cd) return [];
        tierWhere = sql`p.nbrhd_cd = ${subject.nbrhd_cd}`;
      } else if (tierNum === 2) {
        if (!subject.mkt_ar || !subject.zip) return [];
        tierWhere = sql`p.mkt_ar = ${subject.mkt_ar} AND p.zip = ${subject.zip} AND (p.nbrhd_cd IS NULL OR p.nbrhd_cd <> ${subject.nbrhd_cd || ''})`;
      } else {
        if (!subject.zip) return [];
        tierWhere = sql`p.zip = ${subject.zip} AND (p.mkt_ar IS NULL OR p.mkt_ar <> ${subject.mkt_ar || ''}) AND (p.nbrhd_cd IS NULL OR p.nbrhd_cd <> ${subject.nbrhd_cd || ''})`;
      }

      const rows = await sql`
        SELECT DISTINCT ON (s.county, s.parcel_id)
          s.parcel_id,
          p.address,
          p.city,
          p.zip,
          p.living_sqft,
          p.land_sqft,
          p.year_built,
          p.eff_year_built,
          s.sale_price,
          s.sale_year,
          s.sale_month,
          s.qual_code,
          COALESCE(c.label, 'Transfer') AS code_label,
          COALESCE(c.label, 'Transfer') AS label,
          COALESCE(c.is_distressed, false) AS is_distressed,
          ${tierNum}::int AS tier
        FROM county_sales s
        JOIN county_parcels p ON s.county = p.county AND s.parcel_id = p.parcel_id
        LEFT JOIN county_sale_codes c ON s.qual_code = c.qual_code
        WHERE s.county = ${subject.county}
          AND p.use_code = ${subject.use_code}
          AND s.parcel_id <> ${subject.parcel_id}
          AND ${tierWhere}
          AND p.living_sqft >= ${minSqft}
          AND p.living_sqft <= ${maxSqft}
          AND s.sale_price > 10000
          AND ${qualCondition}
          AND (( ${curYear} - s.sale_year ) * 12 + ( ${curMonth} - COALESCE(s.sale_month, 1) )) BETWEEN 0 AND ${windowMonths}
        ORDER BY s.county, s.parcel_id, s.sale_year DESC, s.sale_month DESC NULLS LAST, s.id DESC;
      `;

      return rows;
    }

    // Run search across tiers (1 -> 2 -> 3), stopping when total count >= 5
    async function runTieredSearch(windowMonths) {
      let combined = [];
      let tierUsed = 1;
      let tierLabel = 'Same neighborhood';

      // Tier 1: same nbrhd_cd
      const t1 = await queryTierCandidates(1, windowMonths);
      combined = [...t1];

      if (combined.length < 5) {
        // Tier 2: same mkt_ar and same zip
        const t2 = await queryTierCandidates(2, windowMonths);
        combined = [...combined, ...t2];
        if (combined.length >= t1.length && t2.length > 0) {
          tierUsed = 2;
          tierLabel = t1.length > 0 ? 'Same neighborhood & market area' : 'Same market area & ZIP';
        }
      }

      if (combined.length < 5) {
        // Tier 3: same zip
        const t3 = await queryTierCandidates(3, windowMonths);
        combined = [...combined, ...t3];
        if (t3.length > 0) {
          tierUsed = 3;
          tierLabel = 'Same ZIP';
        }
      }

      return {
        candidates: combined,
        tierUsed,
        tierLabel,
        windowMonths
      };
    }

    // Step A: Search with 12-month window
    let searchResult = await runTieredSearch(12);

    // Step B: If still under 3 results, repeat with 24-month window
    if (searchResult.candidates.length < 3) {
      searchResult = await runTieredSearch(24);
    }

    // Rank by: tier, then size closeness (abs sqft difference), then most recent sale
    searchResult.candidates.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const diffA = Math.abs(Number(a.living_sqft) - subjectSqft);
      const diffB = Math.abs(Number(b.living_sqft) - subjectSqft);
      if (diffA !== diffB) return diffA - diffB;
      const dateA = Number(a.sale_year) * 12 + (Number(a.sale_month) || 1);
      const dateB = Number(b.sale_year) * 12 + (Number(b.sale_month) || 1);
      return dateB - dateA;
    });

    // Return up to 10 candidates
    const topCandidates = searchResult.candidates.slice(0, 10).map(c => {
      const eff = c.eff_year_built != null ? Number(c.eff_year_built) : null;
      const yb = c.year_built != null ? Number(c.year_built) : null;
      const likely_renovated = eff != null && yb != null && (eff - yb >= 15) && (eff >= curYear - 15);
      const sqft = Number(c.living_sqft) || 1;
      const price = Number(c.sale_price) || 0;
      const price_per_sqft = Math.round(price / sqft);

      return {
        parcel_id: c.parcel_id,
        address: c.address,
        city: c.city,
        zip: c.zip,
        living_sqft: Number(c.living_sqft),
        land_sqft: c.land_sqft != null ? Number(c.land_sqft) : null,
        year_built: yb,
        eff_year_built: eff,
        sale_price: price,
        sale_year: Number(c.sale_year),
        sale_month: c.sale_month != null ? Number(c.sale_month) : null,
        price_per_sqft,
        qual_code: c.qual_code,
        code_label: c.code_label,
        label: c.label,
        is_distressed: Boolean(c.is_distressed),
        likely_renovated,
        tier: c.tier
      };
    });

    // Medians
    const allPps = topCandidates.map(c => c.price_per_sqft);
    const median_price_per_sqft = calculateMedian(allPps);

    const renoPps = topCandidates.filter(c => c.likely_renovated).map(c => c.price_per_sqft);
    const renovated_median_price_per_sqft = calculateMedian(renoPps);

    return res.status(200).json({
      summary: {
        count: topCandidates.length,
        median_price_per_sqft,
        renovated_median_price_per_sqft,
        tier: searchResult.tierUsed,
        tier_label: searchResult.tierLabel,
        window_months: searchResult.windowMonths,
        sqft_min: minSqft,
        sqft_max: maxSqft
      },
      candidates: topCandidates
    });
  } catch (err) {
    console.error('Error in /api/county/comps:', err);
    return res.status(500).json({ error: 'Internal server error while searching county comps' });
  }
}
