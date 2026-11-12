import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

export const ALLOWED_CREDIT_TIERS = [
  '760+',
  '740-759',
  '720-739',
  '700-719',
  '680-699',
  '660-679',
  '640-659',
  'below 640'
];

export const DEFAULT_RATE_SHEET = {
  conventional_investment: {
    base_rate: 7.0,
    adjustments: {
      '760+': 0,
      '740-759': 0,
      '720-739': 0,
      '700-719': 0,
      '680-699': 0,
      '660-679': 0,
      '640-659': 0,
      'below 640': 0
    },
    note: "Enter your lender's quotes"
  },
  conventional_primary: {
    base_rate: 6.5,
    adjustments: {
      '760+': 0,
      '740-759': 0,
      '720-739': 0,
      '700-719': 0,
      '680-699': 0,
      '660-679': 0,
      '640-659': 0,
      'below 640': 0
    },
    note: "Enter your lender's quotes"
  },
  fha: {
    base_rate: 6.25,
    adjustments: {
      '760+': 0,
      '740-759': 0,
      '720-739': 0,
      '700-719': 0,
      '680-699': 0,
      '660-679': 0,
      '640-659': 0,
      'below 640': 0
    },
    note: "Enter your lender's quotes"
  },
  dscr: {
    base_rate: 7.75,
    adjustments: {
      '760+': 0,
      '740-759': 0,
      '720-739': 0,
      '700-719': 0,
      '680-699': 0,
      '660-679': 0,
      '640-659': 0,
      'below 640': 0
    },
    note: "Enter your lender's quotes"
  },
  hard_money: {
    base_rate: 10.5,
    adjustments: {
      '760+': 0,
      '740-759': 0,
      '720-739': 0,
      '700-719': 0,
      '680-699': 0,
      '660-679': 0,
      '640-659': 0,
      'below 640': 0
    },
    note: "Enter your lender's quotes"
  }
};

export const DEFAULT_VALUATION_DEFAULTS = {
  sizeFactor: 0.5,
  bedAdjustment: 10000,
  bathAdjustment: 7500,
  poolAdjustment: 25000,
  garageAdjustment: 10000,
  waterfrontAdjustment: 50000,
  lotSqftAdjustment: 5,
  ageAdjustmentPerYear: 1000,
  timeTrendMonthlyPct: 0.003
};

export function getDefaultProfile(email = '') {
  return {
    owner_email: email,
    credit_tier: '740-759',
    liquid_cash: 100000,
    reserve_months: 6,
    rate_sheet: DEFAULT_RATE_SHEET,
    valuation_defaults: DEFAULT_VALUATION_DEFAULTS,
    is_default: true
  };
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // GET: Retrieve buying profile
    if (req.method === 'GET') {
      try {
        let profile;
        try {
          const rows = await sql`
            SELECT
              owner_email,
              credit_tier,
              liquid_cash,
              reserve_months,
              rate_sheet,
              valuation_defaults,
              updated_at
            FROM investor_profile
            WHERE lower(owner_email) = ${cleanEmail}
            LIMIT 1
          `;
          if (rows.length > 0) profile = rows[0];
        } catch (colErr) {
          if (colErr.code === '42703') {
            const rows = await sql`
              SELECT
                owner_email,
                credit_tier,
                liquid_cash,
                reserve_months,
                rate_sheet,
                updated_at
              FROM investor_profile
              WHERE lower(owner_email) = ${cleanEmail}
              LIMIT 1
            `;
            if (rows.length > 0) profile = rows[0];
          } else {
            throw colErr;
          }
        }

        if (!profile) {
          return res.status(200).json(getDefaultProfile(cleanEmail));
        }

        // Ensure rate_sheet and valuation_defaults have all defaults populated
        const mergedRateSheet = {
          ...DEFAULT_RATE_SHEET,
          ...(profile.rate_sheet || {})
        };
        const mergedValuationDefaults = {
          ...DEFAULT_VALUATION_DEFAULTS,
          ...(profile.valuation_defaults || {})
        };

        return res.status(200).json({
          owner_email: profile.owner_email,
          credit_tier: profile.credit_tier,
          liquid_cash: Number(profile.liquid_cash) || 0,
          reserve_months: Number(profile.reserve_months) || 6,
          rate_sheet: mergedRateSheet,
          valuation_defaults: mergedValuationDefaults,
          updated_at: profile.updated_at
        });
      } catch (dbErr) {
        console.warn('investor_profile query failed, returning default profile:', dbErr.message);
        return res.status(200).json(getDefaultProfile(cleanEmail));
      }
    }

    // PUT: Update buying profile
    if (req.method === 'PUT') {
      const body = req.body || {};
      const creditTier = body.credit_tier && ALLOWED_CREDIT_TIERS.includes(body.credit_tier)
        ? body.credit_tier
        : '740-759';

      const liquidCash = body.liquid_cash != null && !isNaN(Number(body.liquid_cash))
        ? Math.max(0, Number(body.liquid_cash))
        : 0;

      const reserveMonths = body.reserve_months != null && !isNaN(Number(body.reserve_months))
        ? Math.max(0, Math.round(Number(body.reserve_months)))
        : 6;

      const valuationDefaults = typeof body.valuation_defaults === 'object' && body.valuation_defaults !== null
        ? body.valuation_defaults
        : DEFAULT_VALUATION_DEFAULTS;

      try {
        let rows;
        try {
          rows = await sql`
            INSERT INTO investor_profile (
              owner_email,
              credit_tier,
              liquid_cash,
              reserve_months,
              rate_sheet,
              valuation_defaults,
              updated_at
            ) VALUES (
              ${cleanEmail},
              ${creditTier},
              ${liquidCash},
              ${reserveMonths},
              ${JSON.stringify(rateSheet)}::jsonb,
              ${JSON.stringify(valuationDefaults)}::jsonb,
              CURRENT_TIMESTAMP
            )
            ON CONFLICT (owner_email) DO UPDATE SET
              credit_tier = EXCLUDED.credit_tier,
              liquid_cash = EXCLUDED.liquid_cash,
              reserve_months = EXCLUDED.reserve_months,
              rate_sheet = EXCLUDED.rate_sheet,
              valuation_defaults = EXCLUDED.valuation_defaults,
              updated_at = CURRENT_TIMESTAMP
            RETURNING
              owner_email,
              credit_tier,
              liquid_cash,
              reserve_months,
              rate_sheet,
              valuation_defaults,
              updated_at
          `;
        } catch (colErr) {
          if (colErr.code === '42703') {
            rows = await sql`
              INSERT INTO investor_profile (
                owner_email,
                credit_tier,
                liquid_cash,
                reserve_months,
                rate_sheet,
                updated_at
              ) VALUES (
                ${cleanEmail},
                ${creditTier},
                ${liquidCash},
                ${reserveMonths},
                ${JSON.stringify(rateSheet)}::jsonb,
                CURRENT_TIMESTAMP
              )
              ON CONFLICT (owner_email) DO UPDATE SET
                credit_tier = EXCLUDED.credit_tier,
                liquid_cash = EXCLUDED.liquid_cash,
                reserve_months = EXCLUDED.reserve_months,
                rate_sheet = EXCLUDED.rate_sheet,
                updated_at = CURRENT_TIMESTAMP
              RETURNING
                owner_email,
                credit_tier,
                liquid_cash,
                reserve_months,
                rate_sheet,
                updated_at
            `;
            if (rows[0]) rows[0].valuation_defaults = valuationDefaults;
          } else {
            throw colErr;
          }
        }

        return res.status(200).json({
          owner_email: rows[0].owner_email,
          credit_tier: rows[0].credit_tier,
          liquid_cash: Number(rows[0].liquid_cash) || 0,
          reserve_months: Number(rows[0].reserve_months) || 6,
          rate_sheet: rows[0].rate_sheet,
          valuation_defaults: rows[0].valuation_defaults || valuationDefaults,
          updated_at: rows[0].updated_at
        });
      } catch (dbErr) {
        console.warn('investor_profile update failed (table may not exist yet):', dbErr.message);
        // Fall back to returning the formatted profile so UI continues functioning
        return res.status(200).json({
          owner_email: cleanEmail,
          credit_tier: creditTier,
          liquid_cash: liquidCash,
          reserve_months: reserveMonths,
          rate_sheet: rateSheet,
          valuation_defaults: valuationDefaults,
          updated_at: new Date().toISOString(),
          table_pending: true
        });
      }
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Investor Profile API error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
