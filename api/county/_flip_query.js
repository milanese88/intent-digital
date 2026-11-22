/**
 * _flip_query.js
 * Single source of truth for Flip & Build deals across Investor Studio:
 * Used by BOTH the Flip & Build Finder and the Opportunity Map to guarantee they never drift.
 *
 * Rules:
 * 1. Purchase candidates = market sales (01/02/Q) + distressed (12/18/19/38, flagged).
 *    Skip all other transfers (11, U, D, quit-claims) so LAG never pairs with them.
 * 2. Resale candidates = market sales (01/02/Q).
 * 3. New build signals = year_built >= buy_year OR (buy_vi_cd = 'V' AND sell_vi_cd = 'I').
 *    (No living sf multiplier rule).
 * 4. Apply jump >= 25%, max hold (flips 24 / new builds 48), and sell-date window BEFORE choosing;
 *    then keep the most recent qualifying pair per parcel (ORDER BY sell date DESC, book/page).
 */

export const QUALIFYING_BUY_QUAL_CODES = ['01', '02', '12', '18', '19', '38', 'Q'];
export const QUALIFYING_RESALE_QUAL_CODES = ['01', '02', 'Q'];
export const DISTRESSED_QUAL_CODES = ['12', '18', '19', '38'];

/**
 * Builds the canonical deals SQL query fragment.
 */
export function buildCanonicalDealsSql(sql, {
  county = 'all',
  zip = null,
  lookbackMonths = 24,
  minGainPct = 25,
  flipMaxMonths = 24,
  newBuildMaxMonths = 48,
  minPrice = null,
  maxPrice = null,
  minBeds = 0,
  sqftBand = 'all',
  dealType = 'all',
  includeDistressed = false,
  bbox = null
} = {}) {
  const countyClause = county && county !== 'all'
    ? sql`AND s.county = ${county}`
    : sql``;

  const zipClause = zip
    ? sql`AND p.zip = ${zip}`
    : sql``;

  const bboxClause = bbox
    ? sql`AND p.lng >= ${bbox.minLng} AND p.lng <= ${bbox.maxLng} AND p.lat >= ${bbox.minLat} AND p.lat <= ${bbox.maxLat}`
    : sql``;

  const lookbackClause = lookbackMonths && Number.isFinite(lookbackMonths) && lookbackMonths > 0 && lookbackMonths < 600
    ? sql`AND (rp.sell_year * 12 + rp.sell_month) >= (2026 * 12 + 10 - ${lookbackMonths})`
    : sql``;

  const priceBandMin = minPrice != null ? sql`AND cs.sell_price >= ${minPrice}` : sql``;
  const priceBandMax = maxPrice != null ? sql`AND cs.sell_price <= ${maxPrice}` : sql``;

  const minBedsClause = minBeds > 0
    ? sql`AND COALESCE(bc.beds, p.beds, 0) >= ${minBeds}`
    : sql``;

  const sqftClause = sqftBand === 'under_1500'
    ? sql`AND COALESCE(bc.living_area_sqft, p.living_sqft, 0) < 1500`
    : sqftBand === '1500_2500'
      ? sql`AND COALESCE(bc.living_area_sqft, p.living_sqft, 0) >= 1500 AND COALESCE(bc.living_area_sqft, p.living_sqft, 0) <= 2500`
      : sqftBand === '2500_4000'
        ? sql`AND COALESCE(bc.living_area_sqft, p.living_sqft, 0) >= 2500 AND COALESCE(bc.living_area_sqft, p.living_sqft, 0) <= 4000`
        : sqftBand === '4000_plus'
          ? sql`AND COALESCE(bc.living_area_sqft, p.living_sqft, 0) > 4000`
          : sql``;

  const dealTypeClause = dealType && dealType !== 'all'
    ? sql`AND qd.deal_type = ${dealType}`
    : sql``;

  const distressedClause = includeDistressed
    ? sql``
    : sql`AND qd.is_distressed_acquisition = false`;

  return sql`
    WITH candidate_sales AS (
      SELECT
        s.county,
        s.parcel_id,
        s.sale_year AS sell_year,
        COALESCE(s.sale_month, 1) AS sell_month,
        (s.sale_year * 12 + COALESCE(s.sale_month, 1)) AS sell_ym,
        s.sale_price AS sell_price,
        s.qual_code AS sell_qual,
        s.vi_cd AS sell_vi_cd,
        s.or_book AS sell_or_book,
        s.or_page AS sell_or_page,
        LAG(s.sale_year * 12 + COALESCE(s.sale_month, 1)) OVER w AS buy_ym,
        LAG(s.sale_year) OVER w AS buy_year,
        LAG(COALESCE(s.sale_month, 1)) OVER w AS buy_month,
        LAG(s.sale_price) OVER w AS buy_price,
        LAG(s.qual_code) OVER w AS buy_qual,
        LAG(s.vi_cd) OVER w AS buy_vi_cd,
        LAG(s.or_book) OVER w AS buy_or_book,
        LAG(s.or_page) OVER w AS buy_or_page
      FROM county_sales s
      WHERE s.sale_price >= 1000
        AND s.sale_year IS NOT NULL
        AND s.qual_code = ANY(${QUALIFYING_BUY_QUAL_CODES})
        ${countyClause}
      WINDOW w AS (
        PARTITION BY s.county, s.parcel_id
        ORDER BY s.sale_year ASC, s.sale_month ASC, s.or_book ASC, s.or_page ASC
      )
    ),
    raw_pairs AS (
      SELECT
        cs.county,
        cs.parcel_id,
        cs.sell_year,
        cs.sell_month,
        cs.sell_ym,
        cs.sell_price,
        cs.sell_qual,
        cs.sell_vi_cd,
        cs.sell_or_book,
        cs.sell_or_page,
        cs.buy_year,
        cs.buy_month,
        cs.buy_ym,
        cs.buy_price,
        cs.buy_qual,
        cs.buy_vi_cd,
        cs.buy_or_book,
        cs.buy_or_page,
        (cs.sell_ym - cs.buy_ym)::int AS hold_months,
        (cs.sell_price - cs.buy_price)::numeric AS jump_dollars,
        ROUND(((cs.sell_price - cs.buy_price)::numeric / cs.buy_price::numeric) * 100, 1) AS jump_pct,
        p.address,
        p.city,
        p.zip,
        p.subdivision_name AS subdivision,
        p.lat,
        p.lng,
        p.use_code,
        COALESCE(bc.living_area_sqft, p.living_sqft) AS living_sqft,
        COALESCE(bc.beds, p.beds) AS beds,
        COALESCE(bc.full_baths, p.full_baths) AS full_baths,
        COALESCE(bc.half_baths, p.half_baths) AS half_baths,
        COALESCE(bc.year_built, p.year_built) AS year_built,
        bc.pool_type AS bc_pool_type,
        bc.pool_year AS bc_pool_year,
        bc.boat_dock AS bc_boat_dock,
        CASE
          WHEN (
            (COALESCE(bc.year_built, p.year_built) IS NOT NULL AND cs.buy_year IS NOT NULL AND COALESCE(bc.year_built, p.year_built) >= cs.buy_year)
            OR (cs.buy_vi_cd = 'V' AND cs.sell_vi_cd = 'I')
          ) THEN 'demo_new_build'
          ELSE 'flip'
        END AS deal_type,
        CASE WHEN cs.buy_qual = ANY(${DISTRESSED_QUAL_CODES}) THEN true ELSE false END AS is_distressed_acquisition
      FROM candidate_sales cs
      JOIN county_parcels p ON p.county = cs.county AND p.parcel_id = cs.parcel_id
      LEFT JOIN building_characteristics bc ON bc.county = cs.county AND bc.folio = cs.parcel_id
      WHERE cs.buy_price IS NOT NULL
        AND cs.buy_price >= 1000
        AND cs.sell_price > cs.buy_price
        AND cs.sell_qual = ANY(${QUALIFYING_RESALE_QUAL_CODES})
        AND (
          cs.sell_ym > cs.buy_ym
          OR (cs.sell_ym = cs.buy_ym AND (COALESCE(cs.sell_or_book, '') != COALESCE(cs.buy_or_book, '') OR COALESCE(cs.sell_or_page, '') != COALESCE(cs.buy_or_page, '')))
        )
        AND p.zip IS NOT NULL
        AND length(trim(p.zip)) = 5
        ${zipClause}
        ${bboxClause}
        ${priceBandMin}
        ${priceBandMax}
        ${minBedsClause}
        ${sqftClause}
    ),
    qualifying_deals AS (
      SELECT
        rp.*,
        CASE WHEN rp.living_sqft > 0 THEN ROUND(rp.jump_dollars / rp.living_sqft, 1) ELSE NULL END AS jump_per_sqft
      FROM raw_pairs rp
      WHERE rp.jump_pct >= ${minGainPct}
        AND (
          (rp.deal_type = 'flip' AND rp.hold_months <= ${flipMaxMonths}::int)
          OR (rp.deal_type = 'demo_new_build' AND rp.hold_months <= ${newBuildMaxMonths}::int)
        )
        ${lookbackClause}
    ),
    canonical_deals AS (
      -- Choose the most recent qualifying deal per parcel (by sell date DESC, recording order)
      SELECT DISTINCT ON (qd.county, qd.parcel_id) qd.*
      FROM qualifying_deals qd
      WHERE 1=1
        ${dealTypeClause}
        ${distressedClause}
      ORDER BY qd.county, qd.parcel_id, qd.sell_ym DESC, qd.sell_or_book DESC, qd.sell_or_page DESC
    )
  `;
}
