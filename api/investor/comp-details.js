import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import {
  buildSaleMonthKey,
  normalizeCompDetails,
  detailsToLegacyColumns,
  computeDetailsProgress
} from '../../src/components/investor/compDetailsModel.js';

const ALLOWED_COUNTIES = new Set(['Broward', 'Palm Beach']);

export async function upsertUserCompDetails(sql, cleanEmail, payload = {}) {
  const rawCounty = payload.county || payload.parcel_county || 'Broward';
  const county = /palm/i.test(rawCounty) ? 'Palm Beach' : 'Broward';
  const parcelId = payload.parcel_id ? String(payload.parcel_id).trim() : '';
  if (!parcelId || !ALLOWED_COUNTIES.has(county)) {
    return null;
  }

  const saleDateRaw = payload.sale_date || payload.sold_date || null;
  const saleDateIso =
    saleDateRaw && /^\d{4}-\d{2}-\d{2}/.test(String(saleDateRaw).trim())
      ? String(saleDateRaw).trim().slice(0, 10)
      : null;
  const saleMonthKey =
    payload.sale_month_key != null && String(payload.sale_month_key).trim() !== ''
      ? String(payload.sale_month_key).trim()
      : buildSaleMonthKey(saleDateIso || payload.sale_year, payload.sale_month);

  const norm = normalizeCompDetails(payload);
  const progress = computeDetailsProgress(norm);

  // Do not create empty placeholder rows if nothing was entered
  if (progress.filledCount === 0 && !norm.notes && !norm.verified) {
    return null;
  }

  let savedRow = null;
  try {
    const rows = await sql`
      INSERT INTO comp_details (
        owner_email,
        county,
        parcel_id,
        sale_month_key,
        sale_date,
        beds,
        full_baths,
        half_baths,
        condition,
        kitchen_baths_updated,
        roof_type,
        roof_year,
        windows,
        pool_type,
        screen_enclosure,
        garage_type,
        garage_bays,
        waterfront_view,
        notes,
        source,
        verified,
        updated_at
      ) VALUES (
        ${cleanEmail},
        ${county},
        ${parcelId},
        ${saleMonthKey},
        ${saleDateIso},
        ${norm.beds},
        ${norm.full_baths},
        ${norm.half_baths},
        ${norm.condition},
        ${norm.kitchen_baths_updated},
        ${norm.roof_type},
        ${norm.roof_year},
        ${norm.windows},
        ${norm.pool_type},
        ${norm.screen_enclosure},
        ${norm.garage_type},
        ${norm.garage_bays},
        ${norm.waterfront_view},
        ${norm.notes || null},
        ${norm.source || null},
        ${Boolean(norm.verified)},
        now()
      )
      ON CONFLICT (owner_email, county, parcel_id, sale_month_key)
      DO UPDATE SET
        sale_date = COALESCE(EXCLUDED.sale_date, comp_details.sale_date),
        beds = EXCLUDED.beds,
        full_baths = EXCLUDED.full_baths,
        half_baths = EXCLUDED.half_baths,
        condition = EXCLUDED.condition,
        kitchen_baths_updated = EXCLUDED.kitchen_baths_updated,
        roof_type = EXCLUDED.roof_type,
        roof_year = EXCLUDED.roof_year,
        windows = EXCLUDED.windows,
        pool_type = EXCLUDED.pool_type,
        screen_enclosure = EXCLUDED.screen_enclosure,
        garage_type = EXCLUDED.garage_type,
        garage_bays = EXCLUDED.garage_bays,
        waterfront_view = EXCLUDED.waterfront_view,
        notes = EXCLUDED.notes,
        source = EXCLUDED.source,
        verified = EXCLUDED.verified,
        updated_at = now()
      RETURNING *;
    `;
    savedRow = rows[0] || null;
  } catch (err) {
    // 42P01 = undefined_table (before add_comp_details_and_nal_clues.sql is applied)
    if (err?.code === '42P01') {
      return null;
    }
    throw err;
  }

  // Synchronize any other investor_comps rows owned by this user referencing the same county sale
  try {
    const legacy = detailsToLegacyColumns(norm);
    await sql`
      UPDATE investor_comps
      SET
        beds = ${legacy.beds},
        baths = ${legacy.baths},
        condition = ${legacy.condition},
        pool = ${legacy.pool},
        garage = ${legacy.garage},
        waterfront = ${legacy.waterfront},
        notes = COALESCE(${norm.notes || null}, notes),
        comp_details_json = ${JSON.stringify(norm)}::jsonb
      WHERE lower(owner_email) = ${cleanEmail}
        AND parcel_id = ${parcelId}
        AND COALESCE(parcel_county, 'Broward') = ${county}
        AND (
          ${saleMonthKey} = ''
          OR sold_date IS NULL
          OR to_char(sold_date, 'YYYY-MM') = ${saleMonthKey}
        );
    `;
  } catch {
    // Ignore if investor_comps columns haven't been migrated yet
  }

  return savedRow;
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    if (req.method === 'GET') {
      const parcelId = req.query?.parcel_id ? String(req.query.parcel_id).trim() : '';
      const rawCounty = req.query?.county ? String(req.query.county).trim() : 'Broward';
      const county = /palm/i.test(rawCounty) ? 'Palm Beach' : 'Broward';
      const saleMonthKey = req.query?.sale_date
        ? buildSaleMonthKey(String(req.query.sale_date))
        : (req.query?.sale_month_key ? String(req.query.sale_month_key).trim() : null);

      try {
        let rows;
        if (parcelId) {
          rows = await sql`
            SELECT *
            FROM comp_details
            WHERE lower(owner_email) = ${cleanEmail}
              AND county = ${county}
              AND parcel_id = ${parcelId}
            ORDER BY updated_at DESC;
          `;
          if (saleMonthKey) {
            const exact = rows.find((r) => r.sale_month_key === saleMonthKey);
            const chosen = exact || rows[0] || null;
            if (!chosen) return res.status(200).json({ item: null });
            const details = normalizeCompDetails(chosen);
            return res.status(200).json({
              item: {
                ...chosen,
                comp_details_json: details,
                details_progress: computeDetailsProgress(details)
              }
            });
          }
        } else {
          rows = await sql`
            SELECT *
            FROM comp_details
            WHERE lower(owner_email) = ${cleanEmail}
            ORDER BY updated_at DESC
            LIMIT 200;
          `;
        }

        const items = rows.map((r) => {
          const details = normalizeCompDetails(r);
          return {
            ...r,
            comp_details_json: details,
            details_progress: computeDetailsProgress(details)
          };
        });

        return res.status(200).json({ items });
      } catch (err) {
        if (err?.code === '42P01') {
          return res.status(200).json(parcelId && saleMonthKey ? { item: null } : { items: [] });
        }
        throw err;
      }
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = req.body || {};
      if (!body.parcel_id) {
        return res.status(400).json({ error: 'parcel_id is required to save county sale details.' });
      }

      const saved = await upsertUserCompDetails(sql, cleanEmail, body);
      if (!saved) {
        return res.status(409).json({
          error: 'The database migration "add_comp_details_and_nal_clues.sql" has not been applied yet, or no detail fields were provided.'
        });
      }

      const details = normalizeCompDetails(saved);
      return res.status(200).json({
        ...saved,
        comp_details_json: details,
        details_progress: computeDetailsProgress(details)
      });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('Comp Details API Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

