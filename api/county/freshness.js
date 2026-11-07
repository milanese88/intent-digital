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

export async function getCountyFreshness() {
  const now = Date.now();
  if (cachedFreshness && now < cacheExpiry) {
    return cachedFreshness;
  }

  const sql = getDb();

  // Query latest month with meaningful sales (>= 10) per county
  const latestSales = await sql`
    SELECT 
      county,
      sale_year,
      sale_month
    FROM (
      SELECT 
        county,
        sale_year,
        sale_month,
        ROW_NUMBER() OVER (PARTITION BY county ORDER BY sale_year DESC, sale_month DESC) as rn
      FROM county_sales
      WHERE sale_year IS NOT NULL AND sale_month IS NOT NULL
      GROUP BY county, sale_year, sale_month
      HAVING count(*) >= 10
    ) sub
    WHERE rn = 1;
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

  const freshnessData = {
    'Broward': {
      county: 'Broward',
      roll_year: rollMap['Broward'] || 2026,
      latest_sale_month: 'Sep 2026',
      label: 'County data through Sep 2026 · 2026 final roll'
    },
    'Palm Beach': {
      county: 'Palm Beach',
      roll_year: rollMap['Palm Beach'] || 2026,
      latest_sale_month: 'Sep 2026',
      label: 'County data through Sep 2026 · 2026 final roll'
    }
  };

  for (const row of latestSales) {
    const county = row.county;
    const yr = Number(row.sale_year);
    const mo = Number(row.sale_month);
    const monthStr = formatMonthYear(yr, mo) || 'Sep 2026';
    const rollYr = rollMap[county] || 2026;

    freshnessData[county] = {
      county,
      roll_year: rollYr,
      latest_sale_month: monthStr,
      label: `County data through ${monthStr} · ${rollYr} final roll`
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
