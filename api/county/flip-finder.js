import { getUserFromSession } from '../_lib/session.js';
import { getDb, sendSafeApiError } from '../_lib/db.js';
import { fetchBuildingCharacteristicsMap, lookupBuildingRecord } from '../_lib/buildingChars.js';
import { SUPPORTED_COUNTIES, normalizeCountyName } from '../../src/config/counties.js';
import {
  buildIsoDateFromYearMonth,
  computeHoldMonthsBetweenDates,
  estimateQuickFinderProfit
} from '../../src/components/investor/dealBreakdownEngine.js';

const MARKET_QUAL_CODES = ['01', '02'];
const DISTRESSED_QUAL_CODES = ['12', '18', '19', '38'];
const NEW_BUILD_BUY_CODES = ['01', '02', '03', '12', '18', '19', '38'];

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

  const limitRaw = query.limit != null && query.limit !== '' ? Number(query.limit) : 100;
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(10, Math.round(limitRaw))) : 100;

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
          WHERE s.sale_price >= 25000
            AND s.sale_year IS NOT NULL
            AND s.qual_code = ANY(${NEW_BUILD_BUY_CODES})
          WINDOW w AS (PARTITION BY s.county, s.parcel_id ORDER BY s.sale_year, s.sale_month)
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
            AND s.sale_price >= 25000
            AND s.sale_year IS NOT NULL
            AND s.qual_code = ANY(${NEW_BUILD_BUY_CODES})
          WINDOW w AS (PARTITION BY s.county, s.parcel_id ORDER BY s.sale_year, s.sale_month)
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
    const effectiveMaxMonths = dealType === 'demo_new_build' ? maxMonths : Math.max(maxMonths, 48);

    // Streaming window LAG() query on idx_county_sales_flip_finder (<200ms all counties, <90ms single county/ZIP):
    // - Without ZIP/radius: scans county_sales index-only FIRST (0 heap fetches, 0 temp spill), then PK-joins county_parcels.
    // - With ZIP/radius: scopes county_parcels via idx_county_parcels_zip / idx_county_parcels_coords, then merge-joins county_sales.
    const rawPairs = hasSpatialScope
      ? await sql`
          WITH scoped_parcels AS (
            SELECT
              p.county,
              p.parcel_id,
              p.address,
              p.city,
              p.zip,
              p.use_code,
              p.living_sqft,
              p.land_sqft,
              p.year_built,
              p.eff_year_built,
              p.just_value,
              p.land_value,
              p.lat,
              p.lng,
              p.beds AS parcel_beds,
              p.full_baths AS parcel_full_baths,
              p.half_baths AS parcel_half_baths
            FROM county_parcels p
            WHERE ${parcelWhere}
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
            WHERE s.sale_price >= 25000
              AND s.sale_year IS NOT NULL
              AND s.qual_code = ANY(${NEW_BUILD_BUY_CODES})
            WINDOW w AS (PARTITION BY s.county, s.parcel_id ORDER BY s.sale_year, s.sale_month)
          ),
          matched_pairs AS (
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
              os.ym AS sell_ym
            FROM ordered_sales os
            WHERE os.buy_price IS NOT NULL
              AND os.sale_price >= 50000
              AND os.qual_code IN ('01', '02', '03')
              AND os.sale_price > os.buy_price
              AND os.ym > os.buy_ym
              AND (os.ym - os.buy_ym) <= ${effectiveMaxMonths}
              ${minSellYmClause}
              ${priceBandMin}
              ${priceBandMax}
            ORDER BY os.county, os.parcel_id, os.ym DESC, os.buy_ym DESC
          )
          SELECT
            mp.county,
            mp.parcel_id,
            p.address,
            p.city,
            p.zip,
            p.use_code,
            p.living_sqft,
            p.land_sqft,
            p.year_built,
            p.eff_year_built,
            p.just_value,
            p.land_value,
            p.lat,
            p.lng,
            p.parcel_beds,
            p.parcel_full_baths,
            p.parcel_half_baths,
            mp.buy_price,
            mp.buy_year,
            mp.buy_month,
            mp.buy_qual,
            mp.buy_vi_cd,
            mp.sell_price,
            mp.sell_year,
            mp.sell_month,
            mp.sell_qual,
            mp.sell_vi_cd,
            mp.hold_months
          FROM matched_pairs mp
          JOIN scoped_parcels p
            ON p.county = mp.county AND p.parcel_id = mp.parcel_id
          ORDER BY mp.sell_ym DESC, mp.sell_price DESC
          LIMIT 600;
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
              AND s.sale_price >= 25000
              AND s.sale_year IS NOT NULL
              AND s.qual_code = ANY(${NEW_BUILD_BUY_CODES})
            WINDOW w AS (PARTITION BY s.county, s.parcel_id ORDER BY s.sale_year, s.sale_month)
          ),
          matched_pairs AS (
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
              os.ym AS sell_ym
            FROM ordered_sales os
            WHERE os.buy_price IS NOT NULL
              AND os.sale_price >= 50000
              AND os.qual_code IN ('01', '02', '03')
              AND os.sale_price > os.buy_price
              AND os.ym > os.buy_ym
              AND (os.ym - os.buy_ym) <= ${effectiveMaxMonths}
              ${minSellYmClause}
              ${priceBandMin}
              ${priceBandMax}
            ORDER BY os.county, os.parcel_id, os.ym DESC, os.buy_ym DESC
          )
          SELECT
            mp.county,
            mp.parcel_id,
            p.address,
            p.city,
            p.zip,
            p.use_code,
            p.living_sqft,
            p.land_sqft,
            p.year_built,
            p.eff_year_built,
            p.just_value,
            p.land_value,
            p.lat,
            p.lng,
            p.beds AS parcel_beds,
            p.full_baths AS parcel_full_baths,
            p.half_baths AS parcel_half_baths,
            mp.buy_price,
            mp.buy_year,
            mp.buy_month,
            mp.buy_qual,
            mp.buy_vi_cd,
            mp.sell_price,
            mp.sell_year,
            mp.sell_month,
            mp.sell_qual,
            mp.sell_vi_cd,
            mp.hold_months
          FROM matched_pairs mp
          JOIN county_parcels p
            ON p.county = mp.county AND p.parcel_id = mp.parcel_id
          ORDER BY mp.sell_ym DESC, mp.sell_price DESC
          LIMIT 600;
        `;

    // Batch-enrich with building_characteristics (42P01-safe) AND fetch sales date range in parallel
    const folios = rawPairs.map((r) => r.parcel_id).filter(Boolean);
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

    const [bcMap, salesRangeRows] = await Promise.all([
      fetchBuildingCharacteristicsMap(sql, folios),
      salesRangePromise
    ]);

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

    const results = [];
    let distressedExcludedCount = 0;
    let filteredByHoldMonths = 0;
    let filteredByMinGain = 0;
    let filteredByDealType = 0;

    for (const row of rawPairs) {
      if (useRadiusBox) {
        const dist = haversineMi(centerLat, centerLng, Number(row.lat), Number(row.lng));
        if (dist == null || dist > radius) continue;
        row._distance_mi = Math.round(dist * 10) / 10;
      }

      const bc = lookupBuildingRecord(bcMap, row.county, row.parcel_id);
      const cls = classifySalePair(
        {
          ...row,
          bc_living_sqft: bc?.living_area_sqft ?? null,
          bc_year_built: bc?.year_built ?? null
        },
        { minGainPct }
      );
      if (!cls) {
        // Did it fail minGainPct?
        const buyP = Number(row.buy_price) || 0;
        const sellP = Number(row.sell_price) || 0;
        if (buyP > 0 && sellP > buyP) {
          const gainPct = ((sellP - buyP) / buyP) * 100;
          if (gainPct < minGainPct) {
            filteredByMinGain++;
          }
        }
        continue;
      }

      // Check max hold based on deal type:
      // Flips strictly respect maxMonths (default 24).
      // Demo -> new builds allow up to 48 months (or maxMonths if explicitly set higher).
      const isNewBuild = cls.deal_type === 'demo_new_build';
      const allowedHoldMonths = isNewBuild
        ? (dealType === 'demo_new_build' ? maxMonths : Math.max(maxMonths, 48))
        : maxMonths;

      if (Number(row.hold_months) > allowedHoldMonths) {
        filteredByHoldMonths++;
        continue;
      }

      if (cls.is_distressed_acquisition && !includeDistressed) {
        distressedExcludedCount++;
        continue;
      }

      if (dealType !== 'all' && cls.deal_type !== dealType) {
        filteredByDealType++;
        continue;
      }

      const livingSqft = Number(bc?.living_area_sqft) || Number(row.living_sqft) || null;
      const buyDate = buildIsoDateFromYearMonth(row.buy_year, row.buy_month);
      const sellDate = buildIsoDateFromYearMonth(row.sell_year, row.sell_month);

      const beds = bc?.beds != null
        ? Number(bc.beds)
        : (row.parcel_beds != null ? Number(row.parcel_beds) : null);
      const fullBaths = bc?.full_baths != null
        ? Number(bc.full_baths)
        : (row.parcel_full_baths != null ? Number(row.parcel_full_baths) : null);
      const halfBaths = bc?.half_baths != null
        ? Number(bc.half_baths)
        : (row.parcel_half_baths != null ? Number(row.parcel_half_baths) : null);
      const baths = computeBathsTotal(fullBaths, halfBaths);
      const poolType = bc?.pool_type && bc.pool_type !== 'none' ? bc.pool_type : null;
      const poolYear = bc?.pool_year != null ? Number(bc.pool_year) : null;
      const hasPool = Boolean(poolType || poolYear);

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
        year_built: bc?.year_built ?? (row.year_built != null ? Number(row.year_built) : null),
        eff_year_built: bc?.effective_year_built ?? (row.eff_year_built != null ? Number(row.eff_year_built) : null),
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
        deal_type: cls.deal_type,
        is_distressed_acquisition: cls.is_distressed_acquisition,
        new_build_reason: cls.new_build_reason,
        jump_dollars: cls.jump_dollars,
        jump_pct: cls.jump_pct,
        has_pool: hasPool,
        pool_type: poolType,
        pool_year: poolYear,
        has_dock: Boolean(bc?.boat_dock === true),
        beds: beds != null && beds > 0 ? beds : null,
        full_baths: fullBaths,
        half_baths: halfBaths,
        baths,
        quality_uad: bc?.quality_uad || null,
        raw_quality_code: bc?.raw_quality_code || null,
        bc_source: bc ? 'county_cama' : null,
        building_characteristics: bc || null
      };

      attachQuickEstimates(candidate);
      results.push(candidate);
    }

    // Optional: include user's own manually entered listings from investor_properties (ZERO scraping!)
    if (includeMyListings) {
      try {
        const myProps = await sql`
          SELECT
            p.id,
            p.address,
            p.city,
            p.zip,
            COALESCE(p.parcel_county, p.county, 'Broward') AS county,
            p.parcel_id,
            p.list_price,
            p.sqft,
            p.lot_sqft,
            p.beds,
            p.baths,
            p.year_built,
            p.lat,
            p.lng,
            p.pool,
            p.boat_dock,
            p.updated_at
          FROM investor_properties p
          WHERE lower(p.owner_email) = ${cleanEmail}
            AND p.parcel_id IS NOT NULL
            AND p.list_price IS NOT NULL
            AND p.list_price >= 50000;
        `;

        if (myProps.length > 0) {
          const propFolios = myProps.map((p) => p.parcel_id).filter(Boolean);
          const [priorSales, propBcMap] = await Promise.all([
            sql`
              SELECT DISTINCT ON (county, parcel_id)
                county, parcel_id, sale_price, sale_year, sale_month, qual_code, vi_cd
              FROM county_sales
              WHERE parcel_id = ANY(${propFolios})
                AND sale_price >= 25000
                AND sale_year IS NOT NULL
              ORDER BY county, parcel_id, sale_year DESC, sale_month DESC NULLS LAST;
            `,
            fetchBuildingCharacteristicsMap(sql, propFolios)
          ]);
          const priorMap = new Map(priorSales.map((s) => [`${s.county}|${s.parcel_id}`, s]));
          const todayIso = new Date().toISOString().slice(0, 10);

          for (const prop of myProps) {
            const pCounty = normalizeCountyName(prop.county) || prop.county;
            if (county !== 'all' && pCounty !== county) continue;
            if (zip && !useRadiusBox && String(prop.zip || '').trim() !== zip) continue;
            if (useRadiusBox) {
              const dist = haversineMi(centerLat, centerLng, Number(prop.lat), Number(prop.lng));
              if (dist == null || dist > radius) continue;
            }

            const prior = priorMap.get(`${pCounty}|${prop.parcel_id}`);
            if (!prior) continue;

            const buyPrice = Math.round(Number(prior.sale_price));
            const listPrice = Math.round(Number(prop.list_price));
            if (minPrice != null && listPrice < minPrice) continue;
            if (maxPrice != null && listPrice > maxPrice) continue;

            const buyDate = buildIsoDateFromYearMonth(prior.sale_year, prior.sale_month);
            const holdMonths = computeHoldMonthsBetweenDates(buyDate, todayIso, 6);
            if (holdMonths > maxMonths) continue;

            const jumpDollars = listPrice - buyPrice;
            const jumpPct = buyPrice > 0 ? Math.round((jumpDollars / buyPrice) * 1000) / 10 : 0;
            const bc = lookupBuildingRecord(propBcMap, pCounty, prop.parcel_id);
            const propYearBuilt = Number(prop.year_built || bc?.year_built || 0) || null;
            const propLivingSqft = Number(prop.sqft || bc?.living_area_sqft) || null;
            const isNewBuild = Boolean(
              (propYearBuilt && Number(prior.sale_year) && propYearBuilt >= Number(prior.sale_year)) ||
              (String(prior.vi_cd || '').trim().toUpperCase() === 'V' && propLivingSqft > 0)
            );
            const rowType = isNewBuild ? 'demo_new_build' : 'flip';
            if (!isNewBuild && jumpPct < minGainPct) continue;
            if (dealType !== 'all' && rowType !== dealType) continue;

            const beds = prop.beds != null
              ? Number(prop.beds)
              : (bc?.beds != null && Number(bc.beds) > 0 ? Number(bc.beds) : null);
            const fullBaths = bc?.full_baths != null ? Number(bc.full_baths) : null;
            const halfBaths = bc?.half_baths != null ? Number(bc.half_baths) : null;
            const baths = prop.baths != null ? Number(prop.baths) : computeBathsTotal(fullBaths, halfBaths);
            const poolType = bc?.pool_type && bc.pool_type !== 'none' ? bc.pool_type : null;
            const poolYear = bc?.pool_year != null ? Number(bc.pool_year) : null;

            const listingRow = {
              id: `my-listing|${prop.id}`,
              property_id: prop.id,
              county: pCounty,
              parcel_id: prop.parcel_id,
              address: prop.address,
              city: prop.city,
              zip: prop.zip,
              living_sqft: propLivingSqft,
              land_sqft: Number(prop.lot_sqft) || null,
              year_built: propYearBuilt,
              lat: prop.lat != null ? Number(prop.lat) : null,
              lng: prop.lng != null ? Number(prop.lng) : null,
              buy_price: buyPrice,
              buy_year: Number(prior.sale_year),
              buy_month: Number(prior.sale_month) || 1,
              buy_date: buyDate,
              buy_qual: prior.qual_code,
              buy_vi_cd: prior.vi_cd || null,
              sell_price: listPrice,
              sell_date: todayIso,
              exit_source: 'my_list_price',
              hold_months: holdMonths,
              deal_type: rowType,
              is_distressed_acquisition: DISTRESSED_QUAL_CODES.includes(String(prior.qual_code || '').trim()),
              new_build_reason: isNewBuild ? 'Entered listing after lot/prior purchase' : null,
              jump_dollars: jumpDollars,
              jump_pct: jumpPct,
              has_pool: Boolean(prop.pool === true || poolType || poolYear),
              pool_type: poolType,
              pool_year: poolYear,
              has_dock: Boolean(prop.boat_dock === true || bc?.boat_dock === true),
              beds,
              full_baths: fullBaths,
              half_baths: halfBaths,
              baths,
              bc_source: bc ? 'county_cama' : null,
              building_characteristics: bc || null
            };
            attachQuickEstimates(listingRow);
            results.push(listingRow);
          }
        }
      } catch (propErr) {
        console.warn('Could not merge user entered listings into Flip Finder:', propErr.message);
      }
    }

    // Sort cleanly
    const dir = sortDir === 'asc' ? 1 : -1;
    results.sort((a, b) => {
      if (sortBy === 'sell_date') {
        return String(a.sell_date || '').localeCompare(String(b.sell_date || '')) * dir;
      }
      if (sortBy === 'address') {
        return String(a.address || '').localeCompare(String(b.address || '')) * dir;
      }
      if (sortBy === 'break_even_reno_10') {
        const diff = (Number(a.break_even_reno_10) || 0) - (Number(b.break_even_reno_10) || 0);
        if (diff !== 0) return diff * dir;
        return ((Number(a.raw_break_even_reno_10) || 0) - (Number(b.raw_break_even_reno_10) || 0)) * dir;
      }
      return ((Number(a[sortBy]) || 0) - (Number(b[sortBy]) || 0)) * dir;
    });

    const totalMatching = results.length;
    const flipCount = results.filter((r) => r.deal_type === 'flip').length;
    const newBuildCount = results.filter((r) => r.deal_type === 'demo_new_build').length;
    const medianJumpDollars = medianOf(results.map((r) => r.jump_dollars));
    const medianJumpPct = results.length > 0 ? Math.round((medianOf(results.map((r) => r.jump_pct)) || 0) * 10) / 10 : null;
    const medianHoldMonths = medianOf(results.map((r) => r.hold_months));

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
      rawPairsFound: rawPairs.length,
      filteredByHoldMonths,
      filteredByMinGain,
      filteredByDistressed: distressedExcludedCount,
      filteredByDealType,
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
        includeMyListings
      },
      availableSalesRange
    };

    return res.status(200).json({
      summary: {
        totalMatching,
        returnedCount: Math.min(limit, results.length),
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
      items: results.slice(0, limit)
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
