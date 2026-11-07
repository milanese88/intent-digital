import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export function formatMonthYear(year, month) {
  if (!year || !month) return null;
  const m = Number(month);
  const y = Number(year);
  if (m >= 1 && m <= 12) {
    return `${MONTH_NAMES[m - 1]} ${y}`;
  }
  return `${y}`;
}

export function calculateMedian(numbers) {
  if (!numbers || numbers.length === 0) return null;
  const valid = numbers.filter(n => n != null && !isNaN(n)).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) {
    return valid[mid];
  }
  return Math.round((valid[mid - 1] + valid[mid]) / 2);
}

// Map property type string to DOR Use Code
export function mapTypeToUseCode(typeStr) {
  const t = String(typeStr || '').trim().toLowerCase();
  switch (t) {
    case 'single_family':
    case 'single-family':
    case '001':
      return { code: '001', label: 'Single-family' };
    case 'condo':
    case 'condominium':
    case '004':
      return { code: '004', label: 'Condo' };
    case 'multifamily':
    case 'multifamily_2_9':
    case '008':
      return { code: '008', label: 'Multifamily (2–9 units)' };
    default:
      return { code: '001', label: 'Single-family' };
  }
}

/**
 * Computes ZIP market series, quarterly rollups, and trailing summary metrics.
 */
export async function getMarketTrends({ county = 'Broward', zip, type = 'single_family' }) {
  const cleanCounty = /palm/i.test(county) ? 'Palm Beach' : 'Broward';
  const rawZip = String(zip || '').trim();
  if (!/^\d{5}$/.test(rawZip)) {
    throw new Error('A valid 5-digit zip parameter is required.');
  }

  const { code: useCode, label: typeLabel } = mapTypeToUseCode(type);
  const sql = getDb();

  // Query sales joined with parcels and sale codes for this county, zip and property type
  const rows = await sql`
    SELECT 
      s.sale_year,
      s.sale_month,
      s.sale_price,
      p.living_sqft,
      COALESCE(c.is_market, false) AS is_market,
      COALESCE(c.is_distressed, false) AS is_distressed
    FROM county_sales s
    JOIN county_parcels p ON s.county = p.county AND s.parcel_id = p.parcel_id
    LEFT JOIN county_sale_codes c ON s.qual_code = c.qual_code
    WHERE s.county = ${cleanCounty}
      AND p.zip = ${rawZip}
      AND p.use_code = ${useCode}
      AND s.sale_year IS NOT NULL
      AND s.sale_month IS NOT NULL
      AND s.sale_month BETWEEN 1 AND 12
      AND s.sale_price > 100
    ORDER BY s.sale_year ASC, s.sale_month ASC;
  `;

  // Group sales into year-month buckets
  const monthGroups = new Map();
  for (const r of rows) {
    const yr = Number(r.sale_year);
    const mo = Number(r.sale_month);
    const key = `${yr}-${String(mo).padStart(2, '0')}`;
    if (!monthGroups.has(key)) {
      monthGroups.set(key, {
        key,
        year: yr,
        month: mo,
        sales: []
      });
    }
    monthGroups.get(key).sales.push(r);
  }

  // Determine continuous calendar range
  let minDateKey = null;
  let maxDateKey = null;
  if (monthGroups.size > 0) {
    const keys = Array.from(monthGroups.keys()).sort();
    minDateKey = keys[0];
    maxDateKey = keys[keys.length - 1];
  } else {
    minDateKey = '2025-01';
    maxDateKey = '2026-09';
  }

  if (maxDateKey < '2026-09') {
    maxDateKey = '2026-09';
  }

  // Generate continuous monthly series
  const monthly = [];
  const [minY, minM] = minDateKey.split('-').map(Number);
  const [maxY, maxM] = maxDateKey.split('-').map(Number);

  let curY = minY;
  let curM = minM;
  while (curY < maxY || (curY === maxY && curM <= maxM)) {
    const key = `${curY}-${String(curM).padStart(2, '0')}`;
    const bucket = monthGroups.get(key);
    const bucketSales = bucket ? bucket.sales : [];
    const marketSales = bucketSales.filter(s => s.is_market);
    const marketCount = marketSales.length;

    // Hide medians if fewer than 3 market sales
    let medianPrice = null;
    let medianPpsf = null;

    if (marketCount >= 3) {
      medianPrice = calculateMedian(marketSales.map(s => Number(s.sale_price)));
      const ppsfSales = marketSales.filter(s => Number(s.living_sqft) > 0);
      if (ppsfSales.length >= 3) {
        medianPpsf = calculateMedian(
          ppsfSales.map(s => Math.round(Number(s.sale_price) / Number(s.living_sqft)))
        );
      }
    }

    monthly.push({
      key,
      year: curY,
      month: curM,
      label: formatMonthYear(curY, curM),
      sales_count: marketCount,
      median_price: medianPrice,
      median_price_per_sqft: medianPpsf
    });

    curM++;
    if (curM > 12) {
      curM = 1;
      curY++;
    }
  }

  // Generate quarterly rollups
  const quarterMap = new Map();
  for (const r of rows) {
    if (!r.is_market) continue;
    const yr = Number(r.sale_year);
    const mo = Number(r.sale_month);
    const q = Math.ceil(mo / 3);
    const qKey = `${yr}-Q${q}`;
    if (!quarterMap.has(qKey)) {
      quarterMap.set(qKey, {
        key: qKey,
        year: yr,
        quarter: q,
        label: `Q${q} ${yr}`,
        sales: []
      });
    }
    quarterMap.get(qKey).sales.push(r);
  }

  const quarterly = [];
  const sortedQKeys = Array.from(quarterMap.keys()).sort();
  for (const qKey of sortedQKeys) {
    const item = quarterMap.get(qKey);
    const count = item.sales.length;
    let medPrice = null;
    let medPpsf = null;

    if (count >= 3) {
      medPrice = calculateMedian(item.sales.map(s => Number(s.sale_price)));
      const ppsfList = item.sales.filter(s => Number(s.living_sqft) > 0);
      if (ppsfList.length >= 3) {
        medPpsf = calculateMedian(
          ppsfList.map(s => Math.round(Number(s.sale_price) / Number(s.living_sqft)))
        );
      }
    }

    quarterly.push({
      key: item.key,
      year: item.year,
      quarter: item.quarter,
      label: item.label,
      sales_count: count,
      median_price: medPrice,
      median_price_per_sqft: medPpsf
    });
  }

  // SUMMARY METRICS (trailing periods based on roll's latest complete month: Sep 2026)
  let anchorYear = 2026;
  let anchorMonth = 9;

  for (const r of rows) {
    if (r.is_market && (r.sale_year > anchorYear || (r.sale_year === anchorYear && r.sale_month > anchorMonth))) {
      anchorYear = r.sale_year;
      anchorMonth = r.sale_month;
    }
  }

  function isInRange(y, m, startYear, startMonth, endYear, endMonth) {
    const val = y * 12 + m;
    const start = startYear * 12 + startMonth;
    const end = endYear * 12 + endMonth;
    return val >= start && val <= end;
  }

  // Last 6 months: Apr 2026 to Sep 2026
  const last6StartYear = anchorMonth >= 6 ? anchorYear : anchorYear - 1;
  const last6StartMonth = anchorMonth >= 6 ? anchorMonth - 5 : anchorMonth + 7;

  // Same 6 months a year earlier: Apr 2025 to Sep 2025
  const prev6StartYear = last6StartYear - 1;
  const prev6StartMonth = last6StartMonth;
  const prev6EndYear = anchorYear - 1;
  const prev6EndMonth = anchorMonth;

  // Last 12 months: Oct 2025 to Sep 2026
  const last12StartYear = anchorMonth >= 12 ? anchorYear : anchorYear - 1;
  const last12StartMonth = anchorMonth >= 12 ? anchorMonth - 11 : anchorMonth + 1;

  const last6Sales = rows.filter(r => 
    r.is_market && isInRange(r.sale_year, r.sale_month, last6StartYear, last6StartMonth, anchorYear, anchorMonth)
  );
  const prev6Sales = rows.filter(r => 
    r.is_market && isInRange(r.sale_year, r.sale_month, prev6StartYear, prev6StartMonth, prev6EndYear, prev6EndMonth)
  );

  const last12MarketSales = rows.filter(r => 
    r.is_market && isInRange(r.sale_year, r.sale_month, last12StartYear, last12StartMonth, anchorYear, anchorMonth)
  );
  const last12DistressedSales = rows.filter(r => 
    r.is_distressed && isInRange(r.sale_year, r.sale_month, last12StartYear, last12StartMonth, anchorYear, anchorMonth)
  );

  const medianPriceLast6 = calculateMedian(last6Sales.map(r => Number(r.sale_price)));
  const medianPricePrev6 = calculateMedian(prev6Sales.map(r => Number(r.sale_price)));

  const ppsfLast6List = last6Sales.filter(r => Number(r.living_sqft) > 0).map(r => Math.round(Number(r.sale_price) / Number(r.living_sqft)));
  const ppsfPrev6List = prev6Sales.filter(r => Number(r.living_sqft) > 0).map(r => Math.round(Number(r.sale_price) / Number(r.living_sqft)));

  const medianPpsfLast6 = calculateMedian(ppsfLast6List);
  const medianPpsfPrev6 = calculateMedian(ppsfPrev6List);

  // % change: null if either period has fewer than 10 sales
  let priceChangePct = null;
  if (last6Sales.length >= 10 && prev6Sales.length >= 10 && medianPricePrev6 && medianPricePrev6 > 0 && medianPriceLast6 != null) {
    priceChangePct = Math.round(((medianPriceLast6 - medianPricePrev6) / medianPricePrev6) * 1000) / 10;
  }

  let ppsfChangePct = null;
  if (ppsfLast6List.length >= 10 && ppsfPrev6List.length >= 10 && medianPpsfPrev6 && medianPpsfPrev6 > 0 && medianPpsfLast6 != null) {
    ppsfChangePct = Math.round(((medianPpsfLast6 - medianPpsfPrev6) / medianPpsfPrev6) * 1000) / 10;
  }

  const total12Sales = last12MarketSales.length + last12DistressedSales.length;
  const distressedSharePct = total12Sales > 0
    ? Math.round((last12DistressedSales.length / total12Sales) * 1000) / 10
    : null;

  const summary = {
    county: cleanCounty,
    zip: rawZip,
    property_type: type,
    type_label: typeLabel,
    use_code: useCode,
    latest_month: formatMonthYear(anchorYear, anchorMonth),
    sales_last_12m: last12MarketSales.length,
    median_price_last_6m: medianPriceLast6,
    median_price_prev_6m: medianPricePrev6,
    price_change_pct: priceChangePct,
    median_ppsf_last_6m: medianPpsfLast6,
    median_ppsf_prev_6m: medianPpsfPrev6,
    ppsf_change_pct: ppsfChangePct,
    distressed_sales_last_12m: last12DistressedSales.length,
    distressed_share_pct: distressedSharePct,
    counts: {
      last_6m_market_sales: last6Sales.length,
      prev_6m_market_sales: prev6Sales.length
    }
  };

  return {
    summary,
    monthly,
    quarterly
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

    const county = req.query?.county || 'Broward';
    const zip = req.query?.zip || '';
    const type = req.query?.type || 'single_family';

    const result = await getMarketTrends({ county, zip, type });
    return res.status(200).json(result);
  } catch (err) {
    console.error('Error in /api/county/market:', err);
    return res.status(err.message.includes('valid 5-digit zip') ? 400 : 500).json({ error: err.message || 'Failed to compute market trends for ZIP' });
  }
}
