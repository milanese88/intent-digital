let cachedData = null;
let cacheExpiresAt = 0;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const now = Date.now();
  if (cachedData && now < cacheExpiresAt) {
    return res.status(200).json(cachedData);
  }

  try {
    const fredUrl = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(fredUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'IntentDigital-InvestorStudio/1.0'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`FRED returned status ${response.status}`);
    }

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');

    let latestRate = null;
    let latestWeek = null;

    // Scan backwards from the end of the CSV to find the most recent valid numeric rate
    for (let i = lines.length - 1; i >= 1; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length >= 2) {
        const dateStr = parts[0].trim();
        const valStr = parts[1].trim();
        const num = parseFloat(valStr);
        if (!isNaN(num) && num > 0) {
          latestRate = num;
          latestWeek = dateStr;
          break;
        }
      }
    }

    if (latestRate == null) {
      throw new Error('No valid rate found in FRED CSV data');
    }

    cachedData = {
      rate: latestRate,
      formattedRate: `${latestRate.toFixed(2)}%`,
      week: latestWeek,
      source: 'Freddie Mac',
      cached_at: new Date().toISOString()
    };
    cacheExpiresAt = now + CACHE_DURATION_MS;

    return res.status(200).json(cachedData);
  } catch (err) {
    console.warn('Failed to fetch FRED 30-year mortgage reference rate:', err.message);
    // If we have an older stale cache, return it rather than failing
    if (cachedData) {
      return res.status(200).json({ ...cachedData, stale: true });
    }
    return res.status(200).json({ rate: null, error: err.message });
  }
}
