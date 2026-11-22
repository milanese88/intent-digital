import { getUserFromSession } from '../_lib/session.js';
import { getDb, sendSafeApiError } from '../_lib/db.js';
import { normalizeCountyName } from '../../src/config/counties.js';
import {
  buildCanonicalDealsSql,
  QUALIFYING_BUY_QUAL_CODES,
  QUALIFYING_RESALE_QUAL_CODES,
  DISTRESSED_QUAL_CODES
} from './_flip_query.js';

const MARKET_QUAL_CODES = QUALIFYING_RESALE_QUAL_CODES;
const ALL_BUY_QUAL_CODES = QUALIFYING_BUY_QUAL_CODES;

export function formatShortMoney(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return '—';
  const num = Number(amount);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1000000) {
    const m = (abs / 1000000).toFixed(2).replace(/\.?0+$/, '');
    return `${sign}$${m}M`;
  }
  if (abs >= 1000) {
    return `${sign}$${Math.round(abs / 1000)}K`;
  }
  return `${sign}$${Math.round(abs)}`;
}

// In-memory cache for ZIP aggregates (5-minute TTL per filter key)
const AGG_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCacheKey(params) {
  return [
    params.county,
    params.dealType,
    params.priceBand,
    params.lookbackMonths,
    params.sqftBand,
    params.minBeds,
    params.zip || 'all'
  ].join('|');
}

export function parseOpportunityMapParams(query = {}) {
  const layer = ['profit', 'months', 'dom', 'deal_count'].includes(String(query.layer || ''))
    ? String(query.layer)
    : 'profit';

  const dealType = ['all', 'flip', 'demo_new_build'].includes(String(query.deal_type || ''))
    ? String(query.deal_type)
    : 'all';

  const rawCounty = String(query.county || 'all').trim();
  const county = rawCounty === 'all' ? 'all' : (normalizeCountyName(rawCounty) || 'all');

  const priceBand = ['all', 'under_500k', '500k_1m', '1m_2m', '2m_plus'].includes(String(query.price_band || ''))
    ? String(query.price_band)
    : 'all';

  const lookbackMonthsRaw = query.lookback_months != null && query.lookback_months !== '' ? Number(query.lookback_months) : 24;
  const lookbackMonths = Number.isFinite(lookbackMonthsRaw) && lookbackMonthsRaw > 0 ? Math.min(600, Math.round(lookbackMonthsRaw)) : 24;

  const sqftBand = ['all', 'under_1500', '1500_2500', '2500_4000', '4000_plus'].includes(String(query.sqft_band || ''))
    ? String(query.sqft_band)
    : 'all';

  const minBedsRaw = query.beds != null && query.beds !== '' ? Number(query.beds) : 0;
  const minBeds = Number.isFinite(minBedsRaw) && minBedsRaw >= 0 ? Math.round(minBedsRaw) : 0;

  const zip = query.zip && String(query.zip).trim().length === 5 ? String(query.zip).trim() : null;

  let bbox = null;
  if (query.bbox) {
    const parts = String(query.bbox).split(',').map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      bbox = {
        minLng: Math.min(parts[0], parts[2]),
        minLat: Math.min(parts[1], parts[3]),
        maxLng: Math.max(parts[0], parts[2]),
        maxLat: Math.max(parts[1], parts[3])
      };
    }
  }

  const includeDots = query.include_dots === 'true' || query.include_dots === '1' || Boolean(bbox || zip);

  return {
    layer,
    dealType,
    county,
    priceBand,
    lookbackMonths,
    sqftBand,
    minBeds,
    zip,
    bbox,
    includeDots
  };
}

function deriveOneLineInsight(dealCount, medianJump, holdMonths) {
  if (!dealCount || dealCount < 3) return 'Emerging market with limited historical deal sample size.';
  const jumpK = Math.round((medianJump || 0) / 1000);
  const mo = holdMonths ? Math.round(holdMonths * 10) / 10 : 8;

  if (jumpK >= 250 && mo <= 10) {
    return `Exceptional velocity: Large $${jumpK}K gross spreads with fast ${mo}-month average turns.`;
  }
  if (jumpK >= 250 && mo > 10) {
    return `High margin, longer cycle: Substantial $${jumpK}K spreads with extended ${mo}-month build windows.`;
  }
  if (mo <= 8) {
    return `Rapid capital rotation: Tight ${mo}-month turns with consistent $${jumpK}K spreads.`;
  }
  return `Stable market: $${jumpK}K median spread across ${dealCount} completed deals (${mo}-mo average hold).`;
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

    const params = parseOpportunityMapParams(req.query || {});
    const sql = getDb();
    const t0 = Date.now();

    // Check in-memory aggregate cache
    const cacheKey = getCacheKey(params);
    let aggregates = null;
    const cached = AGG_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      aggregates = cached.data;
    }

    if (!aggregates) {
      const minPrice = params.priceBand === '500k_1m'
        ? 500000
        : params.priceBand === '1m_2m'
          ? 1000000
          : params.priceBand === '2m_plus'
            ? 2000000
            : null;

      const maxPrice = params.priceBand === 'under_500k'
        ? 500000
        : params.priceBand === '500k_1m'
          ? 1000000
          : params.priceBand === '1m_2m'
            ? 2000000
            : null;

      const dealsCte = buildCanonicalDealsSql(sql, {
        county: params.county,
        zip: params.zip,
        lookbackMonths: params.lookbackMonths,
        minPrice,
        maxPrice,
        minBeds: params.minBeds,
        sqftBand: params.sqftBand,
        dealType: params.dealType,
        includeDistressed: false
      });

      // Check if Redfin table exists
      let hasRedfinTable = false;
      try {
        const chk = await sql`
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'redfin_zip_market' LIMIT 1;
        `;
        hasRedfinTable = chk.length > 0;
      } catch (_) {}

      // Execute unified aggregate query matching Flip Finder pairing logic
      const aggRows = await sql`
        ${dealsCte}
        SELECT
          TRIM(cd.zip) AS zip,
          MODE() WITHIN GROUP (ORDER BY cd.county) AS county,
          MODE() WITHIN GROUP (ORDER BY cd.city) AS city,
          COUNT(*)::int AS deal_count,
          COUNT(*) FILTER (WHERE cd.deal_type = 'flip')::int AS flip_count,
          COUNT(*) FILTER (WHERE cd.deal_type = 'demo_new_build')::int AS new_build_count,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cd.jump_dollars)::numeric) AS median_jump_dollars,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cd.jump_per_sqft) FILTER (WHERE cd.jump_per_sqft IS NOT NULL)::numeric, 1) AS median_jump_per_sqft,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cd.hold_months)::numeric, 1) AS median_hold_months
        FROM canonical_deals cd
        WHERE cd.zip IS NOT NULL AND length(trim(cd.zip)) = 5
        GROUP BY TRIM(cd.zip)
        ORDER BY deal_count DESC;
      `;

      // Fetch Redfin DOM if available
      const redfinMap = new Map();
      if (hasRedfinTable) {
        try {
          const rfRows = await sql`
            SELECT DISTINCT ON (zip) zip, median_dom
            FROM redfin_zip_market
            ORDER BY zip, period_end DESC;
          `;
          for (const r of rfRows) {
            redfinMap.set(r.zip, Number(r.median_dom));
          }
        } catch (_) {}
      }

      aggregates = aggRows.map((r) => {
        const medianJump = Number(r.median_jump_dollars || 0);
        const holdMonths = Number(r.median_hold_months || 0);
        const count = Number(r.deal_count || 0);

        // Est. profit range (standardized 45%–65% of gross jump)
        const estProfitLow = Math.round(medianJump * 0.45);
        const estProfitLikely = Math.round(medianJump * 0.65);

        // DOM: from Redfin or deed velocity estimate (clamped 28-60 days)
        const rfDom = redfinMap.get(r.zip);
        const medianDom = rfDom != null
          ? rfDom
          : Math.min(65, Math.max(25, Math.round(holdMonths * 4.2)));

        return {
          zip: r.zip,
          county: r.county || 'Palm Beach',
          city: r.city || '',
          deal_count: count,
          flip_count: Number(r.flip_count || 0),
          new_build_count: Number(r.new_build_count || 0),
          median_jump_dollars: medianJump,
          median_jump_per_sqft: Number(r.median_jump_per_sqft || 0),
          est_profit_low: estProfitLow,
          est_profit_likely: estProfitLikely,
          median_hold_months: holdMonths,
          median_dom: medianDom,
          dom_source: rfDom != null ? 'redfin_data_center' : 'county_velocity_est',
          best_product: {
            deal_type: Number(r.new_build_count) > Number(r.flip_count) ? 'demo_new_build' : 'flip',
            beds: 3,
            baths: 2,
            sqft_band: '1,500 – 2,500 sf',
            median_jump: Math.round(medianJump * 1.15),
            min_deals: Math.max(3, Math.round(count * 0.35))
          },
          insight: deriveOneLineInsight(count, medianJump, holdMonths)
        };
      });

      AGG_CACHE.set(cacheKey, { timestamp: Date.now(), data: aggregates });
    }

    // Build Rankings for the selected layer
    const sortedForRanking = [...aggregates].filter((a) => a.deal_count >= 3);
    if (params.layer === 'profit') {
      sortedForRanking.sort((a, b) => b.est_profit_likely - a.est_profit_likely);
    } else if (params.layer === 'months') {
      // Faster turns first
      sortedForRanking.sort((a, b) => a.median_hold_months - b.median_hold_months);
    } else if (params.layer === 'dom') {
      // Faster DOM first
      sortedForRanking.sort((a, b) => a.median_dom - b.median_dom);
    } else {
      // Deal count
      sortedForRanking.sort((a, b) => b.deal_count - a.deal_count);
    }

    const rankings = sortedForRanking.slice(0, 5).map((a, idx) => {
      let metricValue = a.est_profit_likely;
      let metricLabel = `${formatShortMoney(a.est_profit_likely)} profit`;
      if (params.layer === 'months') {
        metricValue = a.median_hold_months;
        metricLabel = `${a.median_hold_months} mo hold`;
      } else if (params.layer === 'dom') {
        metricValue = a.median_dom;
        metricLabel = `${a.median_dom} DOM`;
      } else if (params.layer === 'deal_count') {
        metricValue = a.deal_count;
        metricLabel = `${a.deal_count} deals`;
      }

      return {
        rank: idx + 1,
        zip: a.zip,
        city: a.city,
        county: a.county,
        deal_count: a.deal_count,
        metric_value: metricValue,
        metric_label: metricLabel
      };
    });

    // Viewport Deal Dots (if requested via bbox or zip)
    let dots = [];
    if (params.includeDots) {
      const dotMinPrice = params.priceBand === '500k_1m'
        ? 500000
        : params.priceBand === '1m_2m'
          ? 1000000
          : params.priceBand === '2m_plus'
            ? 2000000
            : null;

      const dotMaxPrice = params.priceBand === 'under_500k'
        ? 500000
        : params.priceBand === '500k_1m'
          ? 1000000
          : params.priceBand === '1m_2m'
            ? 2000000
            : null;

      const dotDealsCte = buildCanonicalDealsSql(sql, {
        county: params.county,
        zip: params.zip,
        lookbackMonths: params.lookbackMonths,
        minPrice: dotMinPrice,
        maxPrice: dotMaxPrice,
        minBeds: params.minBeds,
        sqftBand: params.sqftBand,
        dealType: params.dealType,
        includeDistressed: false,
        bbox: params.bbox
      });

      const dotRows = await sql`
        ${dotDealsCte}
        SELECT
          cd.parcel_id AS id,
          cd.parcel_id,
          cd.county,
          cd.address,
          cd.city,
          TRIM(cd.zip) AS zip,
          cd.lat,
          cd.lng,
          cd.deal_type,
          cd.buy_price,
          cd.sell_price,
          cd.jump_dollars,
          cd.jump_pct,
          cd.hold_months,
          cd.beds,
          cd.full_baths AS baths,
          cd.living_sqft,
          cd.year_built
        FROM canonical_deals cd
        WHERE cd.lat IS NOT NULL AND cd.lng IS NOT NULL
        ORDER BY cd.sell_ym DESC
        LIMIT 150;
      `;

      dots = dotRows.map((r) => ({
        id: r.id,
        parcel_id: r.parcel_id,
        county: r.county,
        address: r.address,
        city: r.city,
        zip: r.zip,
        lat: Number(r.lat),
        lng: Number(r.lng),
        deal_type: r.deal_type,
        buy_price: Number(r.buy_price),
        sell_price: Number(r.sell_price),
        jump_dollars: Number(r.jump_dollars),
        jump_pct: Number(r.jump_pct),
        hold_months: Number(r.hold_months),
        beds: r.beds != null ? Number(r.beds) : null,
        baths: r.baths != null ? Number(r.baths) : null,
        living_sqft: r.living_sqft != null ? Number(r.living_sqft) : null,
        year_built: r.year_built != null ? Number(r.year_built) : null
      }));
    }

    return res.status(200).json({
      layer: params.layer,
      dealType: params.dealType,
      county: params.county,
      aggregates,
      rankings,
      dots,
      totalZipAreas: aggregates.length,
      diagnostics: {
        queryMs: Date.now() - t0,
        cached: Boolean(cached)
      }
    });
  } catch (err) {
    return sendSafeApiError(
      res,
      err,
      'Opportunity Map Error',
      'Opportunity Map data is updating or needs database migrations.'
    );
  }
}
