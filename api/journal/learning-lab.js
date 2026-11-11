import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import fs from 'fs';
import path from 'path';

function formatAddress(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(w => {
      if (w === 'ne' || w === 'nw' || w === 'se' || w === 'sw') return w.toUpperCase();
      if (w === 'ave' || w === 'ave.') return 'Ave';
      if (w === 'st' || w === 'st.') return 'St';
      if (w === 'rd' || w === 'rd.') return 'Rd';
      if (w === 'blvd' || w === 'blvd.') return 'Blvd';
      if (w === 'ct' || w === 'ct.') return 'Ct';
      if (w === 'ter' || w === 'ter.') return 'Ter';
      if (w === 'dr' || w === 'dr.') return 'Dr';
      if (w === 'ln' || w === 'ln.') return 'Ln';
      if (w === 'way') return 'Way';
      if (w === 'pl' || w === 'pl.') return 'Pl';
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

function calculateMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = arr.filter(n => n != null && !isNaN(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function calculateStreak(dates) {
  if (!dates || dates.length === 0) return 0;
  const uniqueDayStrings = Array.from(
    new Set(dates.map(d => new Date(d).toISOString().split('T')[0]))
  ).sort().reverse();

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (!uniqueDayStrings.includes(todayStr) && !uniqueDayStrings.includes(yesterdayStr)) {
    return 0;
  }

  let streak = 0;
  let checkDate = new Date();
  if (!uniqueDayStrings.includes(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const checkStr = checkDate.toISOString().split('T')[0];
    if (uniqueDayStrings.includes(checkStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function haversineMi(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Module-level caches for fast sub-50ms warm responses
let cachedLearningContent = null;
function getLearningContent() {
  if (cachedLearningContent) return cachedLearningContent;
  try {
    const learningPath = path.resolve(process.cwd(), 'src/content/learning.json');
    cachedLearningContent = JSON.parse(fs.readFileSync(learningPath, 'utf8'));
  } catch (e) {
    console.warn('Could not read learning.json:', e.message);
    cachedLearningContent = { terms: [], principles: [] };
  }
  return cachedLearningContent;
}

let cachedCalBooking = null;
let cachedCalBookingExpiry = 0;
async function getNextCalBooking() {
  const now = Date.now();
  if (cachedCalBooking !== null && now < cachedCalBookingExpiry) {
    return cachedCalBooking;
  }
  const calApiKey = process.env.CAL_COM_API_KEY || process.env.CAL_API_KEY;
  if (!calApiKey) {
    cachedCalBooking = null;
    cachedCalBookingExpiry = now + 10 * 60 * 1000;
    return null;
  }
  try {
    const calRes = await fetch('https://api.cal.com/v2/bookings?status=upcoming', {
      headers: {
        'Authorization': `Bearer ${calApiKey}`,
        'cal-api-version': '2024-08-13'
      },
      signal: AbortSignal.timeout(2500)
    });
    if (calRes.ok) {
      const calJson = await calRes.json();
      const bookings = calJson?.data || [];
      if (Array.isArray(bookings) && bookings.length > 0) {
        const sorted = bookings.sort((a, b) => new Date(a.start) - new Date(b.start));
        const b = sorted[0];
        cachedCalBooking = {
          id: b.id,
          start: b.start,
          title: b.title || 'Client Consultation',
          attendee: b.attendees?.[0]?.name || b.responses?.name || 'Client'
        };
        cachedCalBookingExpiry = now + 10 * 60 * 1000;
        return cachedCalBooking;
      }
    }
  } catch (calErr) {
    console.warn('Cal.com bookings fetch skipped gracefully:', calErr.message);
  }
  cachedCalBooking = null;
  cachedCalBookingExpiry = now + 5 * 60 * 1000;
  return null;
}

// Cache deals pool by (targetZipsKey, dateSeed) with 1-hour TTL
const dealsPoolCache = new Map();

async function getDealsPool(sql, targetZips, curYear, dateSeed) {
  const cacheKey = `${targetZips.slice().sort().join(',')}_${dateSeed}`;
  const now = Date.now();
  const cached = dealsPoolCache.get(cacheKey);
  if (cached && now < cached.expiry) {
    return cached.pool;
  }

  // Fetch sales in target ZIPs and renovated comps in Broward bounding box in parallel
  const [sales, renoComps] = await Promise.all([
    sql`
      SELECT 
        s.id as sale_id,
        s.sale_price,
        s.sale_year,
        s.sale_month,
        p.parcel_id,
        p.address,
        p.city,
        p.zip,
        p.living_sqft,
        p.land_sqft,
        p.year_built,
        p.eff_year_built,
        p.lat,
        p.lng
      FROM county_sales s
      JOIN county_parcels p ON p.parcel_id = s.parcel_id
      WHERE s.qual_code IN ('01', '02')
        AND p.use_code IN ('001', '01')
        AND p.zip = ANY(${targetZips})
        AND p.living_sqft BETWEEN 800 AND 3800
        AND s.sale_price BETWEEN 140000 AND 3500000
        AND p.lat IS NOT NULL
        AND p.lng IS NOT NULL
      ORDER BY s.sale_year DESC, s.sale_month DESC, s.id DESC
      LIMIT 60;
    `,
    sql`
      SELECT 
        s.sale_price,
        p.parcel_id,
        p.zip,
        p.living_sqft,
        p.land_sqft,
        p.year_built,
        p.eff_year_built,
        p.lat,
        p.lng
      FROM county_sales s
      JOIN county_parcels p ON p.parcel_id = s.parcel_id
      WHERE s.qual_code IN ('01', '02')
        AND p.use_code IN ('001', '01')
        AND p.lat BETWEEN 26.04 AND 26.28
        AND p.lng BETWEEN -80.24 AND -80.05
        AND p.eff_year_built IS NOT NULL
        AND p.year_built IS NOT NULL
        AND (p.eff_year_built - p.year_built >= 15)
        AND (p.eff_year_built >= ${curYear - 15})
        AND s.sale_price > 100000
        AND p.living_sqft > 600
      ORDER BY s.sale_year DESC, s.sale_month DESC
      LIMIT 150;
    `
  ]);

  const normalDeals = [];
  const outlierDeals = [];
  const allQualified = [];

  for (const candidate of sales) {
    const cLat = Number(candidate.lat);
    const cLng = Number(candidate.lng);
    const nearby = [];
    for (const r of renoComps) {
      if (r.parcel_id === candidate.parcel_id) continue;
      const d = haversineMi(cLat, cLng, Number(r.lat), Number(r.lng));
      if (d <= 1.0) {
        nearby.push({ ...r, distance_mi: d });
      }
    }
    if (nearby.length >= 3) {
      const sqft = Number(candidate.living_sqft) || 1500;
      const price = Number(candidate.sale_price) || 0;
      const compPpsList = nearby.map(c => Math.round(Number(c.sale_price) / (Number(c.living_sqft) || 1)));
      const renoMedianPps = calculateMedian(compPpsList);
      const arv = Math.round(renoMedianPps * sqft);
      const pctDiff = arv > 0 ? (price - arv) / arv : 0;
      const isOutlier = Math.abs(pctDiff) > 0.40;
      const record = { candidate, comps: nearby, pctDiff, arv, renoMedianPps, isOutlier };
      allQualified.push(record);
      if (isOutlier) outlierDeals.push(record);
      else normalDeals.push(record);
    }
  }

  const pool = { sales, renoComps, normalDeals, outlierDeals, allQualified };
  dealsPoolCache.set(cacheKey, { pool, expiry: now + 60 * 60 * 1000 });
  return pool;
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // =========================================================================
    // POST: Record activity progress
    // =========================================================================
    if (req.method === 'POST') {
      const { activity, item_key, answer, correct } = req.body || {};
      if (!activity || !item_key) {
        return res.status(400).json({ error: 'activity and item_key are required' });
      }

      const validActivities = ['deal', 'term', 'principle', 'guess'];
      if (!validActivities.includes(activity)) {
        return res.status(400).json({ error: `Activity must be one of: ${validActivities.join(', ')}` });
      }

      const inserted = await sql`
        INSERT INTO learning_progress (
          owner_email,
          activity,
          item_key,
          answer,
          correct
        ) VALUES (
          ${cleanEmail},
          ${activity},
          ${String(item_key)},
          ${answer != null ? String(answer) : null},
          ${correct !== undefined && correct !== null ? Boolean(correct) : null}
        )
        RETURNING *
      `;

      return res.status(201).json({ success: true, record: inserted[0] });
    }

    // =========================================================================
    // GET: Aggregate all Learning Lab data
    // =========================================================================
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const dealOffset = parseInt(req.query?.deal_offset || '0', 10) || 0;
    const guessOffset = parseInt(req.query?.guess_offset || '0', 10) || 0;

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const startOfMonth = new Date(curYear, curMonth, 1);
    const dateSeed = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));

    // Parallel fetch: user progress, user locations, user properties, user analyses, Cal.com
    const [progressRows, locs, props, userProperties, analyses, nextBooking] = await Promise.all([
      sql`
        SELECT id, activity, item_key, answer, correct, created_at
        FROM learning_progress
        WHERE lower(owner_email) = ${cleanEmail}
        ORDER BY created_at DESC
      `,
      sql`SELECT DISTINCT zip FROM investor_locations WHERE lower(owner_email) = ${cleanEmail} AND zip IS NOT NULL`,
      sql`SELECT DISTINCT zip FROM investor_properties WHERE lower(owner_email) = ${cleanEmail} AND zip IS NOT NULL`,
      sql`
        SELECT id, address, city, zip, sqft, year_built, lot_sqft, lat, lng, list_price
        FROM investor_properties
        WHERE lower(owner_email) = ${cleanEmail}
        ORDER BY created_at DESC
      `,
      sql`
        SELECT a.*, p.address as property_address
        FROM investor_analyses a
        JOIN investor_properties p ON p.id = a.property_id
        WHERE lower(a.owner_email) = ${cleanEmail}
        ORDER BY a.created_at DESC
        LIMIT 5;
      `,
      getNextCalBooking()
    ]);

    // Progress metrics
    const dayStreak = calculateStreak(progressRows.map(r => r.created_at));
    const termsLearned = new Set(
      progressRows.filter(r => r.activity === 'term').map(r => r.item_key)
    );
    const principlesLearned = new Set(
      progressRows.filter(r => r.activity === 'principle').map(r => r.item_key)
    );
    const dealsReviewedCount = progressRows.filter(r => r.activity === 'deal').length;

    const monthlyRows = progressRows.filter(r => new Date(r.created_at) >= startOfMonth);
    const monthlyStats = {
      termsThisMonth: new Set(monthlyRows.filter(r => r.activity === 'term').map(r => r.item_key)).size,
      dealsThisMonth: monthlyRows.filter(r => r.activity === 'deal').length,
      principlesThisMonth: new Set(monthlyRows.filter(r => r.activity === 'principle').map(r => r.item_key)).size
    };

    const todayStr = now.toISOString().split('T')[0];
    const todayAnswers = {};
    for (const r of progressRows) {
      const rowDayStr = new Date(r.created_at).toISOString().split('T')[0];
      if (rowDayStr === todayStr) {
        todayAnswers[r.item_key] = {
          answer: r.answer,
          correct: r.correct
        };
      }
    }

    // Determine target ZIPs
    let targetZips = Array.from(new Set([...locs.map(l => l.zip), ...props.map(p => p.zip)].filter(Boolean)));
    if (targetZips.length === 0) targetZips = ['33305', '33334', '33315'];

    // Get deal and comps pool (cached or single parallel batch)
    const pool = await getDealsPool(sql, targetZips, curYear, dateSeed);

    // Deal of the Day Selection: prefer normal flip questions 3 out of 4 times (1 out of 4 prefer outlier)
    const wantOutlier = (dealOffset % 4 === 3);
    let chosen = null;
    if (wantOutlier && pool.outlierDeals.length > 0) {
      const idx = (dateSeed + dealOffset) % pool.outlierDeals.length;
      chosen = pool.outlierDeals[idx];
    } else if (!wantOutlier && pool.normalDeals.length > 0) {
      const idx = (dateSeed + dealOffset) % pool.normalDeals.length;
      chosen = pool.normalDeals[idx];
    }

    if (!chosen && pool.allQualified.length > 0) {
      const idx = (dateSeed + dealOffset) % pool.allQualified.length;
      chosen = pool.allQualified[idx];
    }

    let dealOfTheDay = null;
    if (chosen) {
      const chosenSale = chosen.candidate;
      const chosenComps = chosen.comps;
      const sqft = Number(chosenSale.living_sqft) || 1500;
      const lotSqft = Number(chosenSale.land_sqft) || null;
      const price = Number(chosenSale.sale_price) || 0;
      const pps = Math.round(price / sqft);

      // Compute zip median pps from pool.sales
      const zipSales = pool.sales.filter(s => s.zip === chosenSale.zip);
      let zipMedianPps = pps;
      if (zipSales.length >= 3) {
        zipMedianPps = calculateMedian(zipSales.map(z => Math.round(Number(z.sale_price) / (Number(z.living_sqft) || 1))));
      } else {
        zipMedianPps = chosen.renoMedianPps || pps;
      }

      const renoMedianPps = chosen.renoMedianPps || pps;
      const arv = chosen.arv || Math.round(renoMedianPps * sqft);
      const yb = Number(chosenSale.year_built) || 1975;
      const rehabRate = yb < 1980 ? 45 : 35;
      const rehabTotal = Math.round(rehabRate * sqft);
      const maxOffer = Math.round(arv * 0.70 - rehabTotal);
      const spread = price - maxOffer;

      const compLots = chosenComps.map(c => Number(c.land_sqft)).filter(Boolean);
      const compsMedianLotSqft = calculateMedian(compLots) || 0;

      const pctDiff = chosen.pctDiff;
      const pctDiffPercent = Math.round(pctDiff * 100);
      const pctDiffAbs = Math.abs(pctDiffPercent);

      const isLandValue = pctDiff > 0.40;
      const isBelowMarket = pctDiff < -0.40;
      const isOutlier = isLandValue || isBelowMarket;
      const dealType = isLandValue ? 'land_value' : (isBelowMarket ? 'below_market' : 'normal');

      const isAnswered = Boolean(todayAnswers[chosenSale.sale_id]);
      const userAnswer = todayAnswers[chosenSale.sale_id]?.answer;

      let stampLabel = 'Deal of the day';
      let eyebrow = 'DEAL OF THE DAY · REAL MARKET SALE';
      let question = `If you were a flipper, would you have bought it at $${price.toLocaleString()}?`;
      let options = [
        { id: 'YES', label: 'YES' },
        { id: 'NO', label: 'NO' }
      ];
      let correctAnswer = spread <= 0 ? 'YES' : 'NO';
      let flipperVerdict = spread <= 0 ? 'YES' : 'NO';
      let diagnosis = spread <= 0
        ? `Purchased for $${Math.abs(spread).toLocaleString()} under the 70% rule ceiling ($${maxOffer.toLocaleString()}). Likely acquired by a disciplined investor or cash flipper.`
        : `Purchased for $${spread.toLocaleString()} over the 70% rule ceiling ($${maxOffer.toLocaleString()}). Likely bought by an end-user or retail buyer willing to pay full market value.`;

      if (isLandValue) {
        stampLabel = 'Lesson: land value';
        eyebrow = 'LESSON: LAND VALUE · OUTLIER ANALYSIS';
        question = `This sold for ${pctDiffAbs}% above what renovated homes nearby sell for. What was the buyer most likely paying for?`;
        options = [
          { id: 'house', label: 'The house' },
          { id: 'land', label: 'The land or location (waterfront, big lot, teardown)' }
        ];
        correctAnswer = 'land';
        diagnosis = `Comps by square foot don't capture waterfront, lot size, or teardown value. The subject property sits on a lot of ${lotSqft ? lotSqft.toLocaleString() + ' sqft' : 'significant size'} compared to nearby renovated comps' median of ${compsMedianLotSqft ? compsMedianLotSqft.toLocaleString() + ' sqft' : 'typical lots'}. When buyers pay well above renovated replacement pricing, they are purchasing prime land, deep water frontage, or redevelopment rights rather than existing improvements.`;
      } else if (isBelowMarket) {
        stampLabel = 'Lesson: below-market sale';
        eyebrow = 'LESSON: BELOW-MARKET SALE · OUTLIER ANALYSIS';
        question = `This sold for ${pctDiffAbs}% below what renovated homes nearby sell for. What was the buyer most likely taking advantage of?`;
        options = [
          { id: 'retail', label: 'A typical retail open-market purchase' },
          { id: 'distress', label: 'Distressed seller, condition, family sale, or off-market deal' }
        ];
        correctAnswer = 'distress';
        diagnosis = `Sales closing more than 40% below renovated comp levels typically reflect distressed sellers facing foreclosure, severe deferred maintenance/structural condition issues, non-arm's length family transfers, or direct off-market wholesaler assignments. County qualification codes (like Florida code 01 arms-length vs code 02 or disqualified transfers) help investors filter true open-market transactions from distress or estate sales.`;
      }

      dealOfTheDay = {
        saleId: chosenSale.sale_id,
        parcelId: chosenSale.parcel_id,
        address: formatAddress(chosenSale.address),
        city: formatAddress(chosenSale.city),
        zip: chosenSale.zip,
        sqft,
        lotSqft,
        compsMedianLotSqft,
        yearBuilt: yb,
        soldPrice: price,
        soldMonth: chosenSale.sale_month,
        soldYear: chosenSale.sale_year,
        pps,
        zipMedianPps,
        renoCompsCount: chosenComps.length,
        renoMedianPps,
        arv,
        rehabRate,
        rehabTotal,
        maxOffer,
        spread,
        isAnswered,
        userAnswer,
        dealType,
        isOutlier,
        pctDiff: pctDiffPercent,
        pctDiffAbs,
        stampLabel,
        eyebrow,
        question,
        options,
        correctAnswer,
        flipperVerdict,
        diagnosis
      };
    }

    // Guess the Value Selection
    let guessProperty = null;
    let subjectParcel = null;

    if (userProperties.length > 0) {
      const uProp = userProperties[(dateSeed + guessOffset) % userProperties.length];
      subjectParcel = {
        id: uProp.id,
        address: uProp.address,
        city: uProp.city,
        zip: uProp.zip,
        sqft: Number(uProp.sqft) || 1600,
        yearBuilt: Number(uProp.year_built) || 1978,
        lotSqft: Number(uProp.lot_sqft) || 7500,
        lat: uProp.lat != null ? Number(uProp.lat) : 26.15,
        lng: uProp.lng != null ? Number(uProp.lng) : -80.14
      };
    } else if (pool.sales.length > 0) {
      const s = pool.sales[(dateSeed + guessOffset) % pool.sales.length];
      subjectParcel = {
        id: s.parcel_id,
        address: s.address,
        city: s.city,
        zip: s.zip,
        sqft: Number(s.living_sqft) || 1500,
        yearBuilt: Number(s.year_built) || 1976,
        lotSqft: Number(s.land_sqft) || 7500,
        lat: Number(s.lat) || 26.15,
        lng: Number(s.lng) || -80.14
      };
    }

    if (subjectParcel) {
      const sLat = Number(subjectParcel.lat) || 26.15;
      const sLng = Number(subjectParcel.lng) || -80.14;
      const sqft = Number(subjectParcel.sqft) || 1500;

      // Find nearby sales from pool.sales
      const nearbySales = pool.sales.filter(s => {
        if (s.parcel_id === subjectParcel.id) return false;
        const d = haversineMi(sLat, sLng, Number(s.lat), Number(s.lng));
        return d <= 1.5;
      });

      const compPpsList = (nearbySales.length >= 3 ? nearbySales : pool.sales).map(c =>
        Math.round(Number(c.sale_price) / (Number(c.living_sqft) || 1))
      );
      const medianCompPps = calculateMedian(compPpsList) || 420;
      const compValue = Math.round((medianCompPps * sqft) / 1000) * 1000;

      const highVal = Math.round((compValue * 1.12) / 1000) * 1000;
      const lowVal = Math.round((compValue * 0.88) / 1000) * 1000;

      const rawOptions = [
        { id: 'correct', value: compValue, isCorrect: true },
        { id: 'high', value: highVal, isCorrect: false },
        { id: 'low', value: lowVal, isCorrect: false }
      ];

      const shuffleOrder = [
        (dateSeed + guessOffset) % 3,
        (dateSeed + guessOffset + 1) % 3,
        (dateSeed + guessOffset + 2) % 3
      ];
      const shuffled = [
        rawOptions[shuffleOrder[0]],
        rawOptions[shuffleOrder[1]],
        rawOptions[shuffleOrder[2]]
      ];

      const guessKey = `guess_${subjectParcel.id}`;
      const isAnswered = Boolean(todayAnswers[guessKey]);
      const userAnswer = todayAnswers[guessKey]?.answer;
      const wasCorrect = todayAnswers[guessKey]?.correct;

      guessProperty = {
        itemKey: guessKey,
        address: formatAddress(subjectParcel.address),
        city: formatAddress(subjectParcel.city),
        zip: subjectParcel.zip,
        sqft,
        yearBuilt: subjectParcel.yearBuilt || 1976,
        lotSqft: subjectParcel.lotSqft || 7500,
        medianCompPps,
        compValue,
        compsCount: nearbySales.length || pool.sales.length,
        options: shuffled,
        isAnswered,
        userAnswer,
        wasCorrect
      };
    }

    // Static learning content from memory cache
    const learningContent = getLearningContent();

    // Live data tie-ins for terms from top analysis
    const liveTieIns = {};
    if (analyses.length > 0) {
      const topAnalysis = analyses[0];
      const propAddr = formatAddress(topAnalysis.property_address || 'Saved property');
      const inputs = topAnalysis.inputs || {};
      const results = topAnalysis.results || {};

      if (results.maxOffer) {
        liveTieIns['seventy_rule'] = `Your ${propAddr} analysis: Max offer $${Math.round(results.maxOffer).toLocaleString()} vs purchase price $${Math.round(inputs.purchasePrice || 0).toLocaleString()}`;
      }
      if (inputs.arv) {
        liveTieIns['arv'] = `Your ${propAddr} analysis: Estimated ARV $${Number(inputs.arv).toLocaleString()}`;
      }
      if (results.closingDetails) {
        liveTieIns['doc_stamps'] = `Your ${propAddr} closing breakdown: Doc stamps & title fees itemized under purchase closing costs`;
      }
      if (inputs.loanType) {
        liveTieIns['hard_money'] = `Your ${propAddr} financing: Underwritten as ${String(inputs.loanType).replace(/_/g, ' ').toUpperCase()}`;
      }
      if (results.roi) {
        liveTieIns['cash_on_cash'] = `Your ${propAddr} underwriting: Projected ROI ${Math.round(results.roi * 100)}%`;
      }
    }

    return res.status(200).json({
      progress: {
        dayStreak,
        termsLearnedCount: termsLearned.size,
        dealsReviewedCount,
        principlesLearnedCount: principlesLearned.size,
        monthlyStats,
        learnedKeys: Array.from(new Set([...termsLearned, ...principlesLearned])),
        todayAnswers
      },
      dealOfTheDay,
      guessProperty,
      terms: learningContent.terms || [],
      principles: learningContent.principles || [],
      liveTieIns,
      nextBooking
    });
  } catch (error) {
    console.error('Error in /api/journal/learning-lab:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
