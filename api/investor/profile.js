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

export function getDefaultProfile(email = '') {
  return {
    owner_email: email,
    credit_tier: '740-759',
    liquid_cash: 100000,
    reserve_months: 6,
    rate_sheet: DEFAULT_RATE_SHEET,
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

        if (rows.length === 0) {
          return res.status(200).json(getDefaultProfile(cleanEmail));
        }

        const profile = rows[0];
        // Ensure rate_sheet has all loan types populated
        const mergedRateSheet = {
          ...DEFAULT_RATE_SHEET,
          ...(profile.rate_sheet || {})
        };

        return res.status(200).json({
          owner_email: profile.owner_email,
          credit_tier: profile.credit_tier,
          liquid_cash: Number(profile.liquid_cash) || 0,
          reserve_months: Number(profile.reserve_months) || 6,
          rate_sheet: mergedRateSheet,
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

      const rateSheet = typeof body.rate_sheet === 'object' && body.rate_sheet !== null
        ? body.rate_sheet
        : DEFAULT_RATE_SHEET;

      try {
        const rows = await sql`
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

        return res.status(200).json({
          owner_email: rows[0].owner_email,
          credit_tier: rows[0].credit_tier,
          liquid_cash: Number(rows[0].liquid_cash) || 0,
          reserve_months: Number(rows[0].reserve_months) || 6,
          rate_sheet: rows[0].rate_sheet,
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
