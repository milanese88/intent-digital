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

    // 1. Fetch user progress records
    const progressRows = await sql`
      SELECT id, activity, item_key, answer, correct, created_at
      FROM learning_progress
      WHERE lower(owner_email) = ${cleanEmail}
      ORDER BY created_at DESC
    `;

    const dayStreak = calculateStreak(progressRows.map(r => r.created_at));

    const termsLearned = new Set(
      progressRows.filter(r => r.activity === 'term').map(r => r.item_key)
    );
    const principlesLearned = new Set(
      progressRows.filter(r => r.activity === 'principle').map(r => r.item_key)
    );
    const dealsReviewedCount = progressRows.filter(r => r.activity === 'deal').length;

    // Monthly counts
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const startOfMonth = new Date(curYear, curMonth, 1);

    const monthlyRows = progressRows.filter(r => new Date(r.created_at) >= startOfMonth);
    const monthlyStats = {
      termsThisMonth: new Set(monthlyRows.filter(r => r.activity === 'term').map(r => r.item_key)).size,
      dealsThisMonth: monthlyRows.filter(r => r.activity === 'deal').length,
      principlesThisMonth: new Set(monthlyRows.filter(r => r.activity === 'principle').map(r => r.item_key)).size
    };

    // Today answers map
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

    // 2. Fetch Watched & Saved ZIPs
    const locs = await sql`SELECT DISTINCT zip FROM investor_locations WHERE lower(owner_email) = ${cleanEmail} AND zip IS NOT NULL`;
    const props = await sql`SELECT DISTINCT zip FROM investor_properties WHERE lower(owner_email) = ${cleanEmail} AND zip IS NOT NULL`;
    let targetZips = Array.from(new Set([...locs.map(l => l.zip), ...props.map(p => p.zip)].filter(Boolean)));
    if (targetZips.length === 0) targetZips = ['33305', '33334', '33315'];

    // 3. Deal of the Day Selection
    // Market sales in watched/saved ZIPs
    const marketSales = await sql`
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
    `;

    // Date-seeded index
    const dateSeed = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
    let dealOfTheDay = null;

    if (marketSales.length > 0) {
      // Requirement 3: Prefer normal flip questions (within ±40% of ARV) 3 out of 4 times.
      // 1 out of 4 times (dealOffset % 4 === 3), prefer an outlier (>40% above or below ARV).
      const wantOutlier = (dealOffset % 4 === 3);

      let chosenSale = null;
      let chosenComps = [];
      let chosenPctDiff = 0;
      let chosenArv = 0;
      let chosenRenoMedianPps = 0;
      let firstQualified = null;

      const maxScans = Math.min(marketSales.length, 30);
      for (let i = 0; i < maxScans; i++) {
        const candidateIdx = (dateSeed + dealOffset + i) % marketSales.length;
        const candidate = marketSales[candidateIdx];
        const cLat = Number(candidate.lat);
        const cLng = Number(candidate.lng);

        const nearbyComps = await sql`
          SELECT 
            s.sale_price,
            p.living_sqft,
            p.land_sqft,
            p.year_built,
            p.eff_year_built,
            p.lat,
            p.lng,
            ( 3958.8 * acos(
                least(1.0, greatest(-1.0, 
                  cos(radians(${cLat})) * cos(radians(p.lat)) * cos(radians(p.lng) - radians(${cLng})) + 
                  sin(radians(${cLat})) * sin(radians(p.lat))
                ))
            ) ) AS distance_mi
          FROM county_sales s
          JOIN county_parcels p ON p.parcel_id = s.parcel_id
          WHERE s.qual_code IN ('01', '02')
            AND p.use_code IN ('001', '01')
            AND p.parcel_id != ${candidate.parcel_id}
            AND p.lat BETWEEN ${cLat - 0.018} AND ${cLat + 0.018}
            AND p.lng BETWEEN ${cLng - 0.018} AND ${cLng + 0.018}
            AND p.eff_year_built IS NOT NULL
            AND p.year_built IS NOT NULL
            AND (p.eff_year_built - p.year_built >= 15)
            AND (p.eff_year_built >= ${curYear - 15})
            AND s.sale_price > 100000
            AND p.living_sqft > 600
          ORDER BY s.sale_year DESC, s.sale_month DESC
          LIMIT 20;
        `;

        const within1Mi = nearbyComps.filter(c => Number(c.distance_mi) <= 1.0);
        if (within1Mi.length >= 4) {
          const sqft = Number(candidate.living_sqft) || 1500;
          const price = Number(candidate.sale_price) || 0;
          const compPpsList = within1Mi.map(c => Math.round(Number(c.sale_price) / (Number(c.living_sqft) || 1)));
          const renoMedianPps = calculateMedian(compPpsList);
          const arv = Math.round(renoMedianPps * sqft);
          const pctDiff = arv > 0 ? (price - arv) / arv : 0;
          const isOutlier = Math.abs(pctDiff) > 0.40;

          const candidateRecord = {
            candidate,
            comps: within1Mi,
            pctDiff,
            arv,
            renoMedianPps,
            isOutlier
          };

          if (!firstQualified) {
            firstQualified = candidateRecord;
          }

          if (wantOutlier && isOutlier) {
            chosenSale = candidate;
            chosenComps = within1Mi;
            chosenPctDiff = pctDiff;
            chosenArv = arv;
            chosenRenoMedianPps = renoMedianPps;
            break;
          } else if (!wantOutlier && !isOutlier) {
            chosenSale = candidate;
            chosenComps = within1Mi;
            chosenPctDiff = pctDiff;
            chosenArv = arv;
            chosenRenoMedianPps = renoMedianPps;
            break;
          }
        }
      }

      if (!chosenSale && firstQualified) {
        chosenSale = firstQualified.candidate;
        chosenComps = firstQualified.comps;
        chosenPctDiff = firstQualified.pctDiff;
        chosenArv = firstQualified.arv;
        chosenRenoMedianPps = firstQualified.renoMedianPps;
      }

      if (chosenSale) {
        const sqft = Number(chosenSale.living_sqft) || 1500;
        const lotSqft = Number(chosenSale.land_sqft) || null;
        const price = Number(chosenSale.sale_price) || 0;
        const pps = Math.round(price / sqft);

        // ZIP median $/sf
        const zipSales = await sql`
          SELECT s.sale_price, p.living_sqft
          FROM county_sales s
          JOIN county_parcels p ON p.parcel_id = s.parcel_id
          WHERE p.zip = ${chosenSale.zip} AND s.qual_code IN ('01', '02') AND p.living_sqft > 600
          LIMIT 40;
        `;
        const zipPpsList = zipSales.map(z => Math.round(Number(z.sale_price) / (Number(z.living_sqft) || 1)));
        const zipMedianPps = calculateMedian(zipPpsList) || pps;

        // Comps median $/sf
        const renoMedianPps = chosenRenoMedianPps || pps;
        const arv = chosenArv || Math.round(renoMedianPps * sqft);
        const yb = Number(chosenSale.year_built) || 1975;
        const rehabRate = yb < 1980 ? 45 : 35;
        const rehabTotal = Math.round(rehabRate * sqft);
        const maxOffer = Math.round(arv * 0.70 - rehabTotal);
        const spread = price - maxOffer;

        // Comps median lot size (from county_parcels.land_sqft)
        const compLots = chosenComps.map(c => Number(c.land_sqft)).filter(Boolean);
        const compsMedianLotSqft = calculateMedian(compLots) || 0;

        // Outlier checks: >40% above ARV or >40% below ARV
        const pctDiff = chosenPctDiff;
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
    }

    // 4. Guess the Value Selection
    // Pick from saved properties or parcels in watched ZIPs with >= 5 comps
    let guessProperty = null;
    const userProperties = await sql`
      SELECT id, address, city, zip, sqft, year_built, lot_sqft, lat, lng, list_price
      FROM investor_properties
      WHERE lower(owner_email) = ${cleanEmail}
      ORDER BY created_at DESC
    `;

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
    } else {
      // Pick parcel from county
      const randomParcels = await sql`
        SELECT parcel_id as id, address, city, zip, living_sqft as sqft, year_built, land_sqft as lot_sqft, lat, lng
        FROM county_parcels
        WHERE zip = ANY(${targetZips})
          AND use_code IN ('001', '01')
          AND living_sqft BETWEEN 1000 AND 3200
          AND lat IS NOT NULL
        LIMIT 20;
      `;
      if (randomParcels.length > 0) {
        subjectParcel = randomParcels[(dateSeed + guessOffset) % randomParcels.length];
      }
    }

    if (subjectParcel) {
      const sLat = Number(subjectParcel.lat) || 26.15;
      const sLng = Number(subjectParcel.lng) || -80.14;
      const sqft = Number(subjectParcel.sqft) || 1500;

      // Find nearby comps
      const nearbySales = await sql`
        SELECT s.sale_price, p.living_sqft
        FROM county_sales s
        JOIN county_parcels p ON p.parcel_id = s.parcel_id
        WHERE s.qual_code IN ('01', '02')
          AND p.use_code IN ('001', '01')
          AND p.lat BETWEEN ${sLat - 0.02} AND ${sLat + 0.02}
          AND p.lng BETWEEN ${sLng - 0.02} AND ${sLng + 0.02}
          AND s.sale_price > 100000
        LIMIT 25;
      `;

      const compPpsList = nearbySales.map(c => Math.round(Number(c.sale_price) / (Number(c.living_sqft) || 1)));
      const medianCompPps = calculateMedian(compPpsList) || 420;
      const compValue = Math.round((medianCompPps * sqft) / 1000) * 1000;

      // 3 options: target value, +12%, -12% shuffled
      const highVal = Math.round((compValue * 1.12) / 1000) * 1000;
      const lowVal = Math.round((compValue * 0.88) / 1000) * 1000;

      // Deterministic shuffle
      const rawOptions = [
        { id: 'correct', value: compValue, isCorrect: true },
        { id: 'high', value: highVal, isCorrect: false },
        { id: 'low', value: lowVal, isCorrect: false }
      ];

      // Shuffle based on seed
      const shuffleOrder = [(dateSeed + guessOffset) % 3, (dateSeed + guessOffset + 1) % 3, (dateSeed + guessOffset + 2) % 3];
      const shuffled = [rawOptions[shuffleOrder[0]], rawOptions[shuffleOrder[1]], rawOptions[shuffleOrder[2]]];

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
        compsCount: nearbySales.length,
        options: shuffled,
        isAnswered,
        userAnswer,
        wasCorrect
      };
    }

    // 5. Load 40 Terms and 40 Principles
    const learningPath = path.resolve(process.cwd(), 'src/content/learning.json');
    let learningContent = { terms: [], principles: [] };
    try {
      learningContent = JSON.parse(fs.readFileSync(learningPath, 'utf8'));
    } catch (e) {
      console.warn('Could not read learning.json:', e.message);
    }

    // Live data tie-ins for terms
    const liveTieIns = {};
    const analyses = await sql`
      SELECT a.*, p.address as property_address
      FROM investor_analyses a
      JOIN investor_properties p ON p.id = a.property_id
      WHERE lower(a.owner_email) = ${cleanEmail}
      ORDER BY a.created_at DESC
      LIMIT 5;
    `;

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

    // 6. Next Cal.com Consultation
    let nextBooking = null;
    const calApiKey = process.env.CAL_COM_API_KEY || process.env.CAL_API_KEY;
    if (calApiKey) {
      try {
        const calRes = await fetch('https://api.cal.com/v2/bookings?status=upcoming', {
          headers: {
            'Authorization': `Bearer ${calApiKey}`,
            'cal-api-version': '2024-08-13'
          },
          signal: AbortSignal.timeout(3000)
        });
        if (calRes.ok) {
          const calJson = await calRes.json();
          const bookings = calJson?.data || [];
          if (Array.isArray(bookings) && bookings.length > 0) {
            const sorted = bookings.sort((a, b) => new Date(a.start) - new Date(b.start));
            const b = sorted[0];
            nextBooking = {
              id: b.id,
              start: b.start,
              title: b.title || 'Client Consultation',
              attendee: b.attendees?.[0]?.name || b.responses?.name || 'Client'
            };
          }
        }
      } catch (calErr) {
        console.warn('Cal.com bookings fetch skipped gracefully in learning lab:', calErr.message);
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
