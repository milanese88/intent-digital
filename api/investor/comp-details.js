import { getUserFromSession } from '../_lib/session.js';
import { getDb, isMissingSchemaError, sendSafeApiError, MIGRATION_UPDATE_MESSAGE } from '../_lib/db.js';
import {
  buildSaleMonthKey,
  normalizeCompDetails,
  detailsToLegacyColumns,
  computeDetailsProgress
} from '../../src/components/investor/compDetailsModel.js';
import { normalizeCountyName } from '../../src/config/counties.js';


export async function upsertUserCompDetails(sql, cleanEmail, payload = {}, options = {}) {
  const rawCounty = payload.county || payload.parcel_county || 'Broward';
  const county = normalizeCountyName(rawCounty);
  const parcelId = payload.parcel_id ? String(payload.parcel_id).trim() : '';
  if (!parcelId || !county) {
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
  const hasExtraAttr =
    Boolean(norm.hoa_name) ||
    norm.boat_dock !== null ||
    norm.boat_dock_sqft != null ||
    norm.boat_lift !== null ||
    (norm.construction_type && norm.construction_type !== 'unknown') ||
    (norm.quality && norm.quality !== 'unknown');
  if (progress.filledCount === 0 && !norm.notes && !norm.verified && !hasExtraAttr) {
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
        boat_dock,
        boat_dock_sqft,
        construction_type,
        hoa_name,
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
        ${norm.boat_dock},
        ${norm.boat_dock_sqft},
        ${norm.construction_type !== 'unknown' ? norm.construction_type : null},
        ${norm.hoa_name || null},
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
        boat_dock = EXCLUDED.boat_dock,
        boat_dock_sqft = EXCLUDED.boat_dock_sqft,
        construction_type = EXCLUDED.construction_type,
        hoa_name = EXCLUDED.hoa_name,
        notes = EXCLUDED.notes,
        source = EXCLUDED.source,
        verified = EXCLUDED.verified,
        updated_at = now()
      RETURNING *;
    `;
    savedRow = rows[0] || null;
  } catch (err) {
    // Graceful fallback before add_boat_dock_and_construction.sql is applied
    if (err?.code === '42703') {
      try {
        const rows = await sql`
          INSERT INTO comp_details (
            owner_email, county, parcel_id, sale_month_key, sale_date,
            beds, full_baths, half_baths, condition, kitchen_baths_updated,
            roof_type, roof_year, windows, pool_type, screen_enclosure,
            garage_type, garage_bays, waterfront_view, hoa_name, notes,
            source, verified, updated_at
          ) VALUES (
            ${cleanEmail}, ${county}, ${parcelId}, ${saleMonthKey}, ${saleDateIso},
            ${norm.beds}, ${norm.full_baths}, ${norm.half_baths}, ${norm.condition}, ${norm.kitchen_baths_updated},
            ${norm.roof_type}, ${norm.roof_year}, ${norm.windows}, ${norm.pool_type}, ${norm.screen_enclosure},
            ${norm.garage_type}, ${norm.garage_bays}, ${norm.waterfront_view}, ${norm.hoa_name || null}, ${norm.notes || null},
            ${norm.source || null}, ${Boolean(norm.verified)}, now()
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
            hoa_name = EXCLUDED.hoa_name,
            notes = EXCLUDED.notes,
            source = EXCLUDED.source,
            verified = EXCLUDED.verified,
            updated_at = now()
          RETURNING *;
        `;
        savedRow = rows[0] || null;
      } catch (fbErr) {
        if (isMissingSchemaError(fbErr) && !options.throwOnMissingTable) {
          console.warn('[DB Schema Update Needed] comp_details upsert skipped:', MIGRATION_UPDATE_MESSAGE, fbErr?.message);
          return null;
        }
        throw fbErr;
      }
    } else if (isMissingSchemaError(err) && !options.throwOnMissingTable) {
      console.warn('[DB Schema Update Needed] comp_details upsert skipped:', MIGRATION_UPDATE_MESSAGE, err?.message);
      return null;
    } else {
      throw err;
    }
  }

  // Best-effort sync of appraisal v2 columns (quality, boat_lift) on comp_details
  if (savedRow?.id) {
    try {
      await sql`
        UPDATE comp_details
        SET
          quality = ${norm.quality !== 'unknown' ? norm.quality : null},
          boat_lift = ${norm.boat_lift}
        WHERE id = ${savedRow.id};
      `;
      savedRow.quality = norm.quality !== 'unknown' ? norm.quality : null;
      savedRow.boat_lift = norm.boat_lift;
    } catch (v2Err) {
      if (v2Err?.code !== '42703') throw v2Err;
    }
  }

  // Synchronize any other investor_comps rows owned by this user referencing the same county sale
  try {
    const legacy = detailsToLegacyColumns(norm);
    try {
      await sql`
        UPDATE investor_comps
        SET
          beds = ${legacy.beds},
          baths = ${legacy.baths},
          condition = ${legacy.condition},
          pool = ${legacy.pool},
          garage = ${legacy.garage},
          waterfront = ${legacy.waterfront},
          boat_dock = ${legacy.boat_dock},
          boat_dock_sqft = ${legacy.boat_dock_sqft},
          construction_type = ${legacy.construction_type},
          hoa_name = ${legacy.hoa_name},
          notes = COALESCE(${norm.notes || null}, notes),
          comp_details_json = ${sql.json(norm)}
        WHERE lower(owner_email) = ${cleanEmail}
          AND parcel_id = ${parcelId}
          AND COALESCE(parcel_county, 'Broward') = ${county}
          AND (
            ${saleMonthKey} = ''
            OR sold_date IS NULL
            OR to_char(sold_date, 'YYYY-MM') = ${saleMonthKey}
          );
      `;
    } catch (syncColErr) {
      if (syncColErr?.code !== '42703') throw syncColErr;
      await sql`
        UPDATE investor_comps
        SET
          beds = ${legacy.beds},
          baths = ${legacy.baths},
          condition = ${legacy.condition},
          pool = ${legacy.pool},
          garage = ${legacy.garage},
          waterfront = ${legacy.waterfront},
          hoa_name = ${legacy.hoa_name},
          notes = COALESCE(${norm.notes || null}, notes),
          comp_details_json = ${sql.json(norm)}
        WHERE lower(owner_email) = ${cleanEmail}
          AND parcel_id = ${parcelId}
          AND COALESCE(parcel_county, 'Broward') = ${county}
          AND (
            ${saleMonthKey} = ''
            OR sold_date IS NULL
            OR to_char(sold_date, 'YYYY-MM') = ${saleMonthKey}
          );
      `;
    }
    try {
      await sql`
        UPDATE investor_comps
        SET
          quality = ${legacy.quality},
          boat_lift = ${legacy.boat_lift}
        WHERE lower(owner_email) = ${cleanEmail}
          AND parcel_id = ${parcelId}
          AND COALESCE(parcel_county, 'Broward') = ${county}
          AND (
            ${saleMonthKey} = ''
            OR sold_date IS NULL
            OR to_char(sold_date, 'YYYY-MM') = ${saleMonthKey}
          );
      `;
    } catch (v2SyncErr) {
      if (v2SyncErr?.code !== '42703') throw v2SyncErr;
    }
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
      const county = normalizeCountyName(rawCounty) || 'Broward';
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

      let saved;
      try {
        saved = await upsertUserCompDetails(sql, cleanEmail, body, { throwOnMissingTable: true });
      } catch (err) {
        return sendSafeApiError(res, err, 'Comp Details API Error', 'Unable to save comp details right now.');
      }

      if (!saved) {
        return res.status(400).json({
          error: 'Enter at least one detail field, HOA name, or note before saving.'
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
    return sendSafeApiError(res, err, 'Comp Details API Error', 'Unable to process comp details right now.');
  }
}

