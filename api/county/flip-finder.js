import { getUserFromSession } from '../_lib/session.js';
import { getDb, sendSafeApiError } from '../_lib/db.js';
import { fetchBuildingCharacteristicsMap, lookupBuildingRecord } from '../_lib/buildingChars.js';
import { SUPPORTED_COUNTIES, normalizeCountyName } from '../../src/config/counties.js';
import {
  buildIsoDateFromYearMonth,
  computeHoldMonthsBetweenDates,
  estimateQuickFinderProfit
} from '../../src/components/investor/dealBreakdownEngine.js';
import {
  buildCanonicalDealsSql,
  QUALIFYING_BUY_QUAL_CODES,
  QUALIFYING_RESALE_QUAL_CODES,
  DISTRESSED_QUAL_CODES
} from './_flip_query.js';

const MARKET_QUAL_CODES = QUALIFYING_RESALE_QUAL_CODES;
const NEW_BUILD_BUY_CODES = QUALIFYING_BUY_QUAL_CODES;

function haversineMi(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((v) => Number.isFinite(v))) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function medianOf(values = []) {
  const clean = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 1
    ? clean[mid]
    : Math.round((clean[mid - 1] + clean[mid]) / 2);
}

/**
 * Validates and normalizes Flip & Build Finder query parameters.
 */
export function parseFlipFinderParams(query = {}) {
  const rawCounty = String(query.county || 'all').trim();
  let county = 'all';
  if (rawCounty && rawCounty.toLowerCase() !== 'all') {
    const norm = normalizeCountyName(rawCounty);
    if (!norm) {
      return {
        ok: false,
        error: `Invalid county. Allowed: all, ${SUPPORTED_COUNTIES.join(', ')}.`
      };
    }
    county = norm;
  }

  const rawZip = String(query.zip || '').trim();
  const zip = /^\d{5}$/.test(rawZip) ? rawZip : '';
  if (rawZip && !zip) {
    return { ok: false, error: 'ZIP must be a 5-digit code.' };
  }

  const rawRadius = query.radius != null && String(query.radius).trim() !== '' ? Number(query.radius) : null;
  const radius = rawRadius != null && Number.isFinite(rawRadius) && rawRadius > 0
    ? Math.min(25, Math.max(0.5, rawRadius))
    : null;

  const lat = query.lat != null && String(query.lat).trim() !== '' ? Number(query.lat) : null;
  const lng = query.lng != null && String(query.lng).trim() !== '' ? Number(query.lng) : null;

  const rawDealType = String(query.deal_type || 'all').trim().toLowerCase();
  const dealType = ['all', 'flip', 'demo_new_build'].includes(rawDealType) ? rawDealType : 'all';

  const defaultMaxMonths = dealType === 'demo_new_build' ? 48 : 24;
  const maxMonthsRaw = query.max_months != null && query.max_months !== '' ? Number(query.max_months) : defaultMaxMonths;
  const maxMonths = Number.isFinite(maxMonthsRaw) ? Math.min(60, Math.max(1, Math.round(maxMonthsRaw))) : defaultMaxMonths;

  const minGainRaw = query.min_gain_pct != null && query.min_gain_pct !== '' ? Number(query.min_gain_pct) : 25;
  const minGainPct = Number.isFinite(minGainRaw) ? Math.min(500, Math.max(0, minGainRaw)) : 25;

  const minPriceRaw = query.min_price != null && query.min_price !== '' ? Number(query.min_price) : null;
  const maxPriceRaw = query.max_price != null && query.max_price !== '' ? Number(query.max_price) : null;
  const minPrice = minPriceRaw != null && Number.isFinite(minPriceRaw) && minPriceRaw > 0 ? Math.round(minPriceRaw) : null;
  const maxPrice = maxPriceRaw != null && Number.isFinite(maxPriceRaw) && maxPriceRaw > 0 ? Math.round(maxPriceRaw) : null;

  const includeDistressed = ['1', 'true', 'yes'].includes(String(query.include_distressed || '').toLowerCase());
  const includeMyListings = ['1', 'true', 'yes'].includes(String(query.include_my_listings || '').toLowerCase());
  const summaryOnly = ['1', 'true', 'yes'].includes(String(query.summary_only || '').toLowerCase());

  const allowedSorts = [
    'sell_date',
    'buy_price',
    'sell_price',
    'jump_dollars',
    'jump_pct',
    'hold_months',
    'est_profit',
    'break_even_reno_10',
    'break_even_reno_15',
    'address'
  ];
  const sortBy = allowedSorts.includes(String(query.sort_by || '')) ? String(query.sort_by) : 'sell_date';
  const sortDir = String(query.sort_dir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  const limitRaw = query.limit != null && query.limit !== '' ? Number(query.limit) : 50;
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(10, Math.round(limitRaw))) : 50;

  const pageRaw = query.page != null && query.page !== '' ? Number(query.page) : 1;
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.round(pageRaw) : 1;
  const offset = (page - 1) * limit;

  const lookbackMonthsRaw = query.lookback_months != null && query.lookback_months !== '' ? Number(query.lookback_months) : null;
  const lookbackMonths = lookbackMonthsRaw != null && Number.isFinite(lookbackMonthsRaw)
    ? Math.min(60, Math.max(1, Math.round(lookbackMonthsRaw)))
    : null;

  return {
    ok: true,
    params: {
      county,
      zip,
      radius,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      dealType,
      maxMonths,
      minGainPct,
      minPrice,
      maxPrice,
      includeDistressed,
      includeMyListings,
      summaryOnly,
      sortBy,
      sortDir,
      limit,
      page,
      offset,
      lookbackMonths
    }
  };
}

/**
 * Classifies a matched same-folio sale pair as 'flip' | 'demo_new_build' | null
 * and flags distressed -> market acquisitions separately.
 *
 * New-build classification ONLY triggers when genuine new-construction evidence exists:
 * 1. year_built >= buy_year, OR
 * 2. vacant land purchased (V) -> improved residence sold (I), OR
 * 3. living sf grew > 30% (before vs after), OR
 * 4. improvement value jumped (>50% and >$100k) while land value stayed stable (requires prior + current roll values).
 * Otherwise classifies as 'flip' (never misclassifying existing homes bought below county assessed value).
 */
export function classifySalePair(row, { minGainPct = 25 } = {}) {
  const buyPrice = Number(row.buy_price) || 0;
  const sellPrice = Number(row.sell_price) || 0;
  if (buyPrice <= 0 || sellPrice <= buyPrice) return null;

  const jumpDollars = Math.round(sellPrice - buyPrice);
  const jumpPct = Math.round(((sellPrice - buyPrice) / buyPrice) * 1000) / 10;

  const buyQual = String(row.buy_qual || '').trim();
  const sellQual = String(row.sell_qual || '').trim();
  const buyIsMarket = MARKET_QUAL_CODES.includes(buyQual);
  const buyIsDistressed = DISTRESSED_QUAL_CODES.includes(buyQual);
  const sellIsMarket = MARKET_QUAL_CODES.includes(sellQual);

  const buyYear = Number(row.buy_year) || 0;
  const rawYearBuilt = row.bc_year_built != null ? row.bc_year_built : row.year_built;
  const yearBuilt = rawYearBuilt != null ? Number(rawYearBuilt) : null;
  const beforeSqft = Number(row.before_living_sqft || row.living_sqft) || 0;
  const afterSqft = Number(row.after_living_sqft || row.bc_living_sqft) || 0;

  const buyVi = String(row.buy_vi_cd || '').trim().toUpperCase();
  const sellVi = String(row.sell_vi_cd || '').trim().toUpperCase();

  const isNewYearBuilt = Boolean(yearBuilt && buyYear && yearBuilt >= buyYear);
  const isVacantToImproved = Boolean(buyVi === 'V' && sellVi === 'I');
  const isSqftGrew30Pct = Boolean(beforeSqft > 0 && afterSqft > 0 && afterSqft > beforeSqft * 1.3);

  let isImpValueJumped = false;
  let impJumpVal = 0;
  if (
    row.prev_imp_value != null &&
    row.curr_imp_value != null &&
    row.prev_land_value != null &&
    row.curr_land_value != null
  ) {
    const pImp = Number(row.prev_imp_value);
    const cImp = Number(row.curr_imp_value);
    const pLand = Number(row.prev_land_value);
    const cLand = Number(row.curr_land_value);
    if (
      Number.isFinite(pImp) &&
      Number.isFinite(cImp) &&
      Number.isFinite(pLand) &&
      Number.isFinite(cLand) &&
      cImp > Math.max(pImp * 1.5, pImp + 100000) &&
      (pLand <= 0 || cLand <= pLand * 1.35)
    ) {
      isImpValueJumped = true;
      impJumpVal = Math.round(cImp - pImp);
    }
  }

  const isNewBuildSignal = isNewYearBuilt || isVacantToImproved || isSqftGrew30Pct || isImpValueJumped;

  let dealType = null;
  let newBuildReason = null;

  if (isNewBuildSignal && (sellIsMarket || sellQual === '03')) {
    dealType = 'demo_new_build';
    if (isNewYearBuilt) newBuildReason = `Built ${yearBuilt} (at or after ${buyYear} purchase)`;
    else if (isVacantToImproved) newBuildReason = 'Vacant lot → improved build';
    else if (isSqftGrew30Pct) newBuildReason = `Living area grew >30% (${beforeSqft.toLocaleString()} → ${afterSqft.toLocaleString()} sf)`;
    else if (isImpValueJumped) newBuildReason = `Improvement value jumped +$${impJumpVal.toLocaleString()} while land stayed stable`;
  } else if (sellIsMarket && (buyIsMarket || buyIsDistressed) && jumpPct >= minGainPct) {
    dealType = 'flip';
  }

  if (!dealType) return null;

  return {
    deal_type: dealType,
    is_distressed_acquisition: buyIsDistressed,
    new_build_reason: newBuildReason,
    jump_dollars: jumpDollars,
    jump_pct: jumpPct
  };
}

/**
 * Reusable last-12-months ZIP summary helper for Learning Lab & Finder header.
 * Uses streaming window LAG() over idx_county_sales_flip_finder (<150ms).
 */
export async function computeZipFlipSummary(sql, { zip = '', county = 'all', lookbackMonths = 12 } = {}) {
  const t0 = Date.now();
  const cleanZip = /^\d{5}$/.test(String(zip || '').trim()) ? String(zip).trim() : '';
  const normCounty = county && county !== 'all' ? normalizeCountyName(county) : null;

  const now = new Date();
  const curYm = now.getFullYear() * 12 + (now.getMonth() + 1);
  // Lookback window anchored to most recent available county sales year-month when roll lags wall clock
  const maxYmRows = await sql`
    SELECT MAX(sale_year * 12 + COALESCE(sale_month, 1))::int AS max_ym
    FROM county_sales
    WHERE sale_year IS NOT NULL;
  `;
  const anchorYm = maxYmRows[0]?.max_ym ? Number(maxYmRows[0].max_ym) : curYm;
  const minSellYm = anchorYm - Math.max(1, Number(lookbackMonths) || 12) + 1;

  const salesCountyClause = normCounty
    ? sql`s.county = ${normCounty}`
    : sql`s.county = ANY(${SUPPORTED_COUNTIES})`;
  const parcelCountyClause = normCounty
    ? sql`p.county = ${normCounty}`
    : sql`p.county = ANY(${SUPPORTED_COUNTIES})`;

  const pairs = cleanZip
    ? await sql`
        WITH scoped_parcels AS (
          SELECT county, parcel_id, year_built, living_sqft, zip
          FROM county_parcels p
          WHERE ${parcelCountyClause} AND p.zip = ${cleanZip}
        ),
        ordered_sales AS (
          SELECT
            s.county,
            s.parcel_id,
            s.sale_price,
            s.sale_year,
            COALESCE(s.sale_month, 1) AS sale_month,
            (s.sale_year * 12 + COALESCE(s.sale_month, 1)) AS ym,
            s.qual_code,
            s.vi_cd,
            LAG(s.sale_price) OVER w AS buy_price,
            LAG(s.sale_year) OVER w AS buy_year,
            LAG(COALESCE(s.sale_month, 1)) OVER w AS buy_month,
            LAG(s.sale_year * 12 + COALESCE(s.sale_month, 1)) OVER w AS buy_ym,
            LAG(s.qual_code) OVER w AS buy_qual,
            LAG(s.vi_cd) OVER w AS buy_vi_cd
          FROM scoped_parcels p
          JOIN county_sales s
            ON s.county = p.county AND s.parcel_id = p.parcel_id
          WHERE s.sale_price >= 1000
            AND s.sale_year IS NOT NULL
            AND s.qual_code = ANY(${NEW_BUILD_BUY_CODES})
          WINDOW w AS (PARTITION BY s.county, s.parcel_id ORDER BY s.sale_year ASC, s.sale_month ASC, s.or_book ASC, s.or_page ASC)
        )
        SELECT DISTINCT ON (os.county, os.parcel_id)
          os.county,
          os.parcel_id,
          os.buy_price,
          os.buy_year,
          os.buy_month,
          os.buy_qual,
          os.buy_vi_cd,
          os.sale_price AS sell_price,
          os.sale_year AS sell_year,
          os.sale_month AS sell_month,
          os.qual_code AS sell_qual,
          os.vi_cd AS sell_vi_cd,
          (os.ym - os.buy_ym) AS hold_months,
          p.year_built,
          p.living_sqft
        FROM ordered_sales os
        JOIN scoped_parcels p
          ON p.county = os.county AND p.parcel_id = os.parcel_id
        WHERE os.buy_price IS NOT NULL
          AND os.ym >= ${minSellYm}
          AND os.sale_price >= 50000
          AND os.qual_code IN ('01', '02', '03')
          AND os.sale_price > os.buy_price
          AND os.ym > os.buy_ym
          AND (os.ym - os.buy_ym) <= 24
        ORDER BY os.county, os.parcel_id, os.ym DESC, os.buy_ym DESC;
      `
    : await sql`
        WITH ordered_sales AS (
          SELECT
            s.county,
            s.parcel_id,
            s.sale_price,
            s.sale_year,
            COALESCE(s.sale_month, 1) AS sale_month,
            (s.sale_year * 12 + COALESCE(s.sale_month, 1)) AS ym,
            s.qual_code,
            s.vi_cd,
            LAG(s.sale_price) OVER w AS buy_price,
            LAG(s.sale_year) OVER w AS buy_year,
            LAG(COALESCE(s.sale_month, 1)) OVER w AS buy_month,
            LAG(s.sale_year * 12 + COALESCE(s.sale_month, 1)) OVER w AS buy_ym,
            LAG(s.qual_code) OVER w AS buy_qual,
            LAG(s.vi_cd) OVER w AS buy_vi_cd
          FROM county_sales s
          WHERE ${salesCountyClause}
            AND s.sale_price >= 1000
            AND s.sale_year IS NOT NULL
            AND s.qual_code = ANY(${NEW_BUILD_BUY_CODES})
          WINDOW w AS (PARTITION BY s.county, s.parcel_id ORDER BY s.sale_year ASC, s.sale_month ASC, s.or_book ASC, s.or_page ASC)
        ),
        matched_pairs AS (
          SELECT DISTINCT ON (county, parcel_id)
            county,
            parcel_id,
            buy_price,
            buy_year,
            buy_month,
            buy_qual,
            buy_vi_cd,
            sale_price AS sell_price,
            sale_year AS sell_year,
            sale_month AS sell_month,
            qual_code AS sell_qual,
            vi_cd AS sell_vi_cd,
            (ym - buy_ym) AS hold_months
          FROM ordered_sales
          WHERE buy_price IS NOT NULL
            AND ym >= ${minSellYm}
            AND sale_price >= 50000
            AND qual_code IN ('01', '02', '03')
            AND sale_price > buy_price
            AND ym > buy_ym
            AND (ym - buy_ym) <= 24
          ORDER BY county, parcel_id, ym DESC, buy_ym DESC
        )
        SELECT
          mp.*,
          p.year_built,
          p.living_sqft
        FROM matched_pairs mp
        JOIN county_parcels p
          ON p.county = mp.county AND p.parcel_id = mp.parcel_id;
      `;

  let flipCount = 0;
  let newBuildCount = 0;
  let distressedFlaggedCount = 0;
  const jumps = [];
  const jumpPcts = [];
  const holds = [];

  for (const r of pairs) {
    const cls = classifySalePair(r, { minGainPct: 25 });
    if (!cls) continue;
    if (cls.is_distressed_acquisition) {
      distressedFlaggedCount++;
      continue;
    }
    if (cls.deal_type === 'demo_new_build') newBuildCount++;
    else flipCount++;
    jumps.push(cls.jump_dollars);
    jumpPcts.push(cls.jump_pct);
    holds.push(Number(r.hold_months));
  }

  return {
    zip: cleanZip || null,
    county: normCounty || 'All counties',
    lookbackMonths: Number(lookbackMonths) || 12,
    flipCount,
    newBuildCount,
    totalCount: flipCount + newBuildCount,
    distressedFlaggedCount,
    medianJumpDollars: medianOf(jumps),
    medianJumpPct: jumpPcts.length > 0 ? Math.round((medianOf(jumpPcts) || 0) * 10) / 10 : null,
    medianHoldMonths: medianOf(holds),
    queryMs: Date.now() - t0
  };
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

    const parsed = parseFlipFinderParams(req.query || {});
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }

    const {
      county,
      zip,
      radius,
      lat: reqLat,
      lng: reqLng,
      dealType,
      maxMonths,
      minGainPct,
      minPrice,
      maxPrice,
      includeDistressed,
      includeMyListings,
      summaryOnly,
      sortBy,
      sortDir,
      limit,
      page,
      offset,
      lookbackMonths
    } = parsed.params;

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();
    const t0 = Date.now();

    if (summaryOnly) {
      const summary = await computeZipFlipSummary(sql, {
        zip,
        county,
        lookbackMonths: lookbackMonths || 12
      });
      return res.status(200).json({ summary });
    }

    // Resolve radius center if radius is requested (from explicit lat/lng or ZIP centroid)
    let centerLat = reqLat;
    let centerLng = reqLng;
    if (radius != null && (centerLat == null || centerLng == null) && zip) {
      const centroidRows = await sql`
        SELECT AVG(lat)::double precision AS lat, AVG(lng)::double precision AS lng
        FROM county_parcels
        WHERE zip = ${zip} AND lat IS NOT NULL AND lng IS NOT NULL;
      `;
      if (centroidRows[0]?.lat != null && centroidRows[0]?.lng != null) {
        centerLat = Number(centroidRows[0].lat);
        centerLng = Number(centroidRows[0].lng);
      }
    }

    const useRadiusBox = radius != null && centerLat != null && centerLng != null;
    const hasSpatialScope = useRadiusBox || Boolean(zip);

    const salesCountyClause = county !== 'all'
      ? sql`s.county = ${county}`
      : sql`s.county = ANY(${SUPPORTED_COUNTIES})`;

    let parcelWhere = county !== 'all'
      ? sql`p.county = ${county}`
      : sql`p.county = ANY(${SUPPORTED_COUNTIES})`;

    if (useRadiusBox) {
      const dLat = radius / 69.0;
      const cosLat = Math.max(0.1, Math.cos((centerLat * Math.PI) / 180));
      const dLng = radius / (69.0 * cosLat);
      parcelWhere = sql`${parcelWhere}
        AND p.lat BETWEEN ${centerLat - dLat} AND ${centerLat + dLat}
        AND p.lng BETWEEN ${centerLng - dLng} AND ${centerLng + dLng}`;
    } else if (zip) {
      parcelWhere = sql`${parcelWhere} AND p.zip = ${zip}`;
    }

    // Optional lookback filter on later sale date
    let minSellYmClause = sql``;
    if (lookbackMonths != null) {
      const maxYmRows = await sql`
        SELECT MAX(sale_year * 12 + COALESCE(sale_month, 1))::int AS max_ym
        FROM county_sales WHERE sale_year IS NOT NULL;
      `;
      const anchorYm = Number(maxYmRows[0]?.max_ym || 0);
      if (anchorYm > 0) {
        minSellYmClause = sql`AND os.ym >= ${anchorYm - lookbackMonths + 1}`;
      }
    }

    const priceBandMin = minPrice != null ? sql`AND os.sale_price >= ${minPrice}` : sql``;
    const priceBandMax = maxPrice != null ? sql`AND os.sale_price <= ${maxPrice}` : sql``;
    const newBuildMaxMonths = dealType === 'demo_new_build' ? maxMonths : Math.max(maxMonths, 48);
    const flipMaxMonths = maxMonths;
    const effectiveMaxMonths = Math.max(newBuildMaxMonths, flipMaxMonths);

    const dealTypeSqlClause = dealType === 'all'
      ? sql``
      : sql`AND cd.deal_type = ${dealType}`;

    const distressedSqlClause = includeDistressed
      ? sql``
      : sql`AND cd.is_distressed_acquisition = false`;

    const orderSqlClause = sortBy === 'sell_date'
      ? (sortDir === 'asc' ? sql`ORDER BY fd.sell_ym ASC, fd.sell_or_book ASC` : sql`ORDER BY fd.sell_ym DESC, fd.sell_or_book DESC`)
      : sortBy === 'buy_price'
        ? (sortDir === 'asc' ? sql`ORDER BY fd.buy_price ASC` : sql`ORDER BY fd.buy_price DESC`)
        : sortBy === 'sell_price'
          ? (sortDir === 'asc' ? sql`ORDER BY fd.sell_price ASC` : sql`ORDER BY fd.sell_price DESC`)
          : sortBy === 'jump_dollars'
            ? (sortDir === 'asc' ? sql`ORDER BY fd.jump_dollars ASC` : sql`ORDER BY fd.jump_dollars DESC`)
            : sortBy === 'jump_pct'
              ? (sortDir === 'asc' ? sql`ORDER BY fd.jump_pct ASC` : sql`ORDER BY fd.jump_pct DESC`)
              : sortBy === 'hold_months'
                ? (sortDir === 'asc' ? sql`ORDER BY fd.hold_months ASC` : sql`ORDER BY fd.hold_months DESC`)
                : sortBy === 'address'
                  ? (sortDir === 'asc' ? sql`ORDER BY fd.address ASC` : sql`ORDER BY fd.address DESC`)
                  : (sortDir === 'asc' ? sql`ORDER BY fd.sell_ym ASC` : sql`ORDER BY fd.sell_ym DESC`);

    const salesRangePromise = (county !== 'all'
      ? sql`
          SELECT
            MIN(sale_year * 100 + COALESCE(sale_month, 1))::int AS min_ym,
            MAX(sale_year * 100 + COALESCE(sale_month, 1))::int AS max_ym,
            COUNT(*)::int AS count
          FROM county_sales
          WHERE county = ${county} AND sale_year IS NOT NULL;
        `
      : sql`
          SELECT
            MIN(sale_year * 100 + COALESCE(sale_month, 1))::int AS min_ym,
            MAX(sale_year * 100 + COALESCE(sale_month, 1))::int AS max_ym,
            COUNT(*)::int AS count
          FROM county_sales
          WHERE sale_year IS NOT NULL;
        `
    ).catch(() => []);

    const dealsCte = buildCanonicalDealsSql(sql, {
      county,
      zip: zip || null,
      lookbackMonths,
      minGainPct,
      flipMaxMonths,
      newBuildMaxMonths,
      minPrice,
      maxPrice,
      dealType,
      includeDistressed
    });

    const queryPromise = sql`
      ${dealsCte},
      summary_stats AS (
        SELECT
          COUNT(*)::int AS total_matching,
          COUNT(*) FILTER (WHERE deal_type = 'flip')::int AS flip_count,
          COUNT(*) FILTER (WHERE deal_type = 'demo_new_build')::int AS new_build_count,
          COUNT(*) FILTER (WHERE is_distressed_acquisition)::int AS distressed_count,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY jump_dollars)::numeric) AS median_jump_dollars,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY jump_pct)::numeric, 1) AS median_jump_pct,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hold_months)::numeric, 1) AS median_hold_months
        FROM canonical_deals
      ),
      paged_deals AS (
        SELECT *
        FROM canonical_deals fd
        ${orderSqlClause}
        LIMIT ${limit} OFFSET ${offset}
      )
      SELECT
        (SELECT row_to_json(s) FROM summary_stats s) AS summary,
        COALESCE((SELECT json_agg(p) FROM paged_deals p), '[]'::json) AS items;
    `;

    const [dbResult, salesRangeRows] = await Promise.all([
      queryPromise,
      salesRangePromise
    ]);

    const rawQueryResult = dbResult[0] || {};
    const rawSummary = rawQueryResult.summary || {};
    const rawItems = Array.isArray(rawQueryResult.items) ? rawQueryResult.items : [];

    const computeBathsTotal = (fullB, halfB) => {
      if (fullB == null && halfB == null) return null;
      const f = Number(fullB) || 0;
      const h = Number(halfB) || 0;
      const total = f + h * 0.5;
      return total > 0 ? total : null;
    };

    const attachQuickEstimates = (targetRow) => {
      const quickEst = estimateQuickFinderProfit(targetRow);
      targetRow.est_profit = quickEst.estProfit;
      targetRow.est_profit_low = quickEst.estProfitLow;
      targetRow.est_profit_high = quickEst.estProfitHigh;
      targetRow.est_roi_pct = quickEst.roiPct;
      targetRow.est_roi_pct_low = quickEst.roiPctLow;
      targetRow.est_roi_pct_high = quickEst.roiPctHigh;
      targetRow.est_annualized_roi_pct = quickEst.annualizedRoiPct;
      targetRow.rehab_level = quickEst.rehabLevel;
      targetRow.rehab_level_short_label = quickEst.rehabLevelShortLabel;
      targetRow.rehab_level_label = quickEst.rehabLevelLabel;
      targetRow.rehab_min_per_sqft = quickEst.rehabMinPerSqft;
      targetRow.rehab_max_per_sqft = quickEst.rehabMaxPerSqft;
      targetRow.rehab_mid_per_sqft = quickEst.rehabMidPerSqft;
      targetRow.break_even_reno_10 = quickEst.breakEvenReno10;
      targetRow.break_even_reno_15 = quickEst.breakEvenReno15;
      targetRow.break_even_reno_10_per_sqft = quickEst.breakEvenReno10PerSqft;
      targetRow.break_even_reno_15_per_sqft = quickEst.breakEvenReno15PerSqft;
      targetRow.raw_break_even_reno_10 = quickEst.rawBreakEvenReno10;
      return targetRow;
    };

    const items = [];
    for (const row of rawItems) {
      if (useRadiusBox) {
        const dist = haversineMi(centerLat, centerLng, Number(row.lat), Number(row.lng));
        if (dist == null || dist > radius) continue;
        row._distance_mi = Math.round(dist * 10) / 10;
      }

      const livingSqft = Number(row.bc_living_sqft) || Number(row.living_sqft) || null;
      const buyDate = buildIsoDateFromYearMonth(row.buy_year, row.buy_month);
      const sellDate = buildIsoDateFromYearMonth(row.sell_year, row.sell_month);

      const beds = row.bc_beds != null ? Number(row.bc_beds) : (row.parcel_beds != null ? Number(row.parcel_beds) : null);
      const fullBaths = row.bc_full_baths != null ? Number(row.bc_full_baths) : (row.parcel_full_baths != null ? Number(row.parcel_full_baths) : null);
      const halfBaths = row.bc_half_baths != null ? Number(row.bc_half_baths) : (row.parcel_half_baths != null ? Number(row.parcel_half_baths) : null);
      const baths = computeBathsTotal(fullBaths, halfBaths);
      const poolType = row.bc_pool_type && row.bc_pool_type !== 'none' ? row.bc_pool_type : null;
      const poolYear = row.bc_pool_year != null ? Number(row.bc_pool_year) : null;
      const hasPool = Boolean(poolType || poolYear);

      let newBuildReason = null;
      if (row.deal_type === 'demo_new_build') {
        const yb = Number(row.bc_year_built || row.year_built);
        if (yb && Number(row.buy_year) && yb >= Number(row.buy_year)) {
          newBuildReason = `Built ${yb} (at or after ${row.buy_year} purchase)`;
        } else if (row.buy_vi_cd === 'V' && row.sell_vi_cd === 'I') {
          newBuildReason = 'Vacant lot → improved build';
        } else if (Number(row.living_sqft) > 0 && Number(row.bc_living_sqft) > Number(row.living_sqft) * 1.3) {
          newBuildReason = `Living area grew >30% (${Number(row.living_sqft).toLocaleString()} → ${Number(row.bc_living_sqft).toLocaleString()} sf)`;
        } else {
          newBuildReason = 'Demo → new build';
        }
      }

      const candidate = {
        id: `${row.county}|${row.parcel_id}|${buyDate}|${sellDate}`,
        county: row.county,
        parcel_id: row.parcel_id,
        address: row.address,
        city: row.city,
        zip: row.zip,
        use_code: row.use_code,
        living_sqft: livingSqft,
        before_living_sqft: Number(row.living_sqft) || livingSqft,
        land_sqft: row.land_sqft != null ? Number(row.land_sqft) : null,
        year_built: row.bc_year_built ?? (row.year_built != null ? Number(row.year_built) : null),
        eff_year_built: row.eff_year_built != null ? Number(row.eff_year_built) : null,
        just_value: row.just_value != null ? Number(row.just_value) : null,
        lat: row.lat != null ? Number(row.lat) : null,
        lng: row.lng != null ? Number(row.lng) : null,
        distance_mi: row._distance_mi ?? null,
        buy_price: Math.round(Number(row.buy_price)),
        buy_year: Number(row.buy_year),
        buy_month: Number(row.buy_month) || 1,
        buy_date: buyDate,
        buy_qual: row.buy_qual,
        buy_vi_cd: row.buy_vi_cd || null,
        sell_price: Math.round(Number(row.sell_price)),
        sell_year: Number(row.sell_year),
        sell_month: Number(row.sell_month) || 1,
        sell_date: sellDate,
        sell_qual: row.sell_qual,
        sell_vi_cd: row.sell_vi_cd || null,
        exit_source: 'county_resale',
        hold_months: Number(row.hold_months),
        deal_type: row.deal_type,
        is_distressed_acquisition: Boolean(row.is_distressed_acquisition),
        new_build_reason: newBuildReason,
        jump_dollars: Math.round(Number(row.jump_dollars)),
        jump_pct: Number(row.jump_pct),
        has_pool: hasPool,
        pool_type: poolType,
        pool_year: poolYear,
        has_dock: Boolean(row.bc_boat_dock === true),
        beds: beds != null && beds > 0 ? beds : null,
        full_baths: fullBaths,
        half_baths: halfBaths,
        baths,
        quality_uad: row.bc_quality_uad || null,
        raw_quality_code: row.bc_raw_quality_code || null,
        bc_source: row.bc_year_built ? 'county_cama' : null
      };

      attachQuickEstimates(candidate);
      items.push(candidate);
    }

    const totalMatching = rawSummary.total_matching || 0;
    const flipCount = rawSummary.flip_count || 0;
    const newBuildCount = rawSummary.new_build_count || 0;
    const distressedExcludedCount = rawSummary.distressed_count || 0;
    const medianJumpDollars = Number(rawSummary.median_jump_dollars || 0);
    const medianJumpPct = Number(rawSummary.median_jump_pct || 0);
    const medianHoldMonths = Number(rawSummary.median_hold_months || 0);

    const minYm = salesRangeRows[0]?.min_ym;
    const maxYm = salesRangeRows[0]?.max_ym;
    const formatYmToMonthYear = (ym) => {
      if (!ym) return '—';
      const yr = Math.floor(ym / 100);
      const mo = ym % 100;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[mo - 1] || 'Jan'} ${yr}`;
    };

    const availableSalesRange = {
      minYm,
      maxYm,
      minDate: formatYmToMonthYear(minYm),
      maxDate: formatYmToMonthYear(maxYm),
      totalSales: salesRangeRows[0]?.count ? Number(salesRangeRows[0].count) : 0,
      county: county !== 'all' ? county : 'All counties'
    };

    const diagnostics = {
      rawPairsFound: totalMatching,
      activeFilters: {
        county,
        zip: zip || null,
        radius: radius || null,
        dealType,
        maxMonths,
        minGainPct,
        minPrice,
        maxPrice,
        includeDistressed,
        includeMyListings,
        page,
        limit
      },
      availableSalesRange
    };

    return res.status(200).json({
      summary: {
        totalMatching,
        returnedCount: items.length,
        flipCount,
        newBuildCount,
        distressedExcludedCount,
        medianJumpDollars,
        medianJumpPct,
        medianHoldMonths,
        availableSalesRange,
        diagnostics,
        queryMs: Date.now() - t0
      },
      items,
      pagination: {
        page,
        limit,
        total: totalMatching,
        totalPages: Math.max(1, Math.ceil(totalMatching / limit))
      }
    });
  } catch (err) {
    return sendSafeApiError(
      res,
      err,
      'Flip & Build Finder API Error',
      'Unable to search flips and new builds right now.'
    );
  }
}
