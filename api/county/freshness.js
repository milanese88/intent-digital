import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

// 10-minute in-memory cache to keep response times sub-millisecond
let cachedFreshness = null;
let cacheExpiry = 0;

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

/**
 * Computes county freshness and last complete month based on the 70% trailing 12-month rule.
 */
export async function getCountyFreshness() {
  const now = Date.now();
  if (cachedFreshness && now < cacheExpiry) {
    return cachedFreshness;
  }

  const sql = getDb();

  const minFreshnessYear = new Date().getFullYear() - 2;

  // Query monthly market sale counts for recent years using idx_county_sales_comps
  const monthlyCounts = await sql`
    SELECT 
      s.county,
      s.sale_year,
      s.sale_month,
      count(*)::int as count
    FROM county_sales s
    JOIN county_sale_codes c ON s.qual_code = c.qual_code
    WHERE c.is_market = true
      AND s.qual_code IN ('01', '02')
      AND s.sale_year >= ${minFreshnessYear}
      AND s.sale_month IS NOT NULL
      AND s.sale_month BETWEEN 1 AND 12
      AND s.sale_price > 100
    GROUP BY s.county, s.sale_year, s.sale_month
    ORDER BY s.county, s.sale_year ASC, s.sale_month ASC;
  `;

  // Query roll_year per county (defaults to 2026)
  const rollYears = await sql`
    SELECT county, COALESCE(MAX(roll_year), 2026) as roll_year
    FROM county_parcels
    GROUP BY county;
  `;

  const rollMap = {};
  for (const r of rollYears) {
    rollMap[r.county] = Number(r.roll_year) || 2026;
  }

  // Group by county
  const countyMonths = new Map();
  for (const r of monthlyCounts) {
    if (!countyMonths.has(r.county)) {
      countyMonths.set(r.county, []);
    }
    countyMonths.get(r.county).push({
      year: Number(r.sale_year),
      month: Number(r.sale_month),
      count: Number(r.count)
    });
  }

  const freshnessData = {
    'Broward': {
      county: 'Broward',
      roll_year: rollMap['Broward'] || 2026,
      latest_sale_month: 'Sep 2026',
      complete_through: 'Aug 2026',
      label: 'County data through Sep 2026 (complete through Aug 2026) · 2026 final roll'
    },
    'Palm Beach': {
      county: 'Palm Beach',
      roll_year: rollMap['Palm Beach'] || 2026,
      latest_sale_month: 'Sep 2026',
      complete_through: 'Aug 2026',
      label: 'County data through Sep 2026 (complete through Aug 2026) · 2026 final roll'
    }
  };

  for (const [county, list] of countyMonths.entries()) {
    if (list.length === 0) continue;

    let latestY = null;
    let latestM = null;
    let completeY = null;
    let completeM = null;

    // Filter out negligible months (e.g. 2 stray sales in Oct)
    const validList = list.filter(item => item.count >= 10);

    for (let i = 0; i < validList.length; i++) {
      const cur = validList[i];
      latestY = cur.year;
      latestM = cur.month;

      // 12-month previous average
      const prev12 = validList.slice(Math.max(0, i - 12), i);
      if (prev12.length >= 6) {
        const avg = prev12.reduce((acc, p) => acc + p.count, 0) / prev12.length;
        // Month is complete if >= 70% of trailing 12-mo average
        if (cur.count >= 0.70 * avg) {
          completeY = cur.year;
          completeM = cur.month;
        }
      } else {
        completeY = cur.year;
        completeM = cur.month;
      }
    }

    const rollYr = rollMap[county] || 2026;
    const latestStr = formatMonthYear(latestY, latestM) || 'Sep 2026';
    const completeStr = formatMonthYear(completeY, completeM) || 'Aug 2026';

    freshnessData[county] = {
      county,
      roll_year: rollYr,
      latest_sale_year: latestY,
      latest_sale_month_num: latestM,
      latest_sale_month: latestStr,
      complete_year: completeY,
      complete_month_num: completeM,
      complete_through: completeStr,
      label: `County data through ${latestStr} (complete through ${completeStr}) · ${rollYr} final roll`
    };
  }

  cachedFreshness = freshnessData;
  cacheExpiry = now + 10 * 60 * 1000; // 10 minutes

  return freshnessData;
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

    const freshnessData = await getCountyFreshness();
    return res.status(200).json(freshnessData);
  } catch (err) {
    console.error('Error in /api/county/freshness:', err);
    return res.status(500).json({ error: 'Failed to fetch county freshness data' });
  }
}
