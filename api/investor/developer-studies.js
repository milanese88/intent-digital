import { getUserFromSession } from '../_lib/session.js';
import { getDb, parseJsonbObject, sendSafeApiError } from '../_lib/db.js';
import { normalizeCountyName } from '../../src/config/counties.js';

// Developer studies: group Flip & Build Finder deals under one developer/builder.
// GET    /api/investor/developer-studies            -> { items: [study + deal_count] }
// GET    /api/investor/developer-studies?id=UUID    -> { study, deals }
// POST   { action: 'create_study', name, companies } -> { study }
// POST   { action: 'add_deal', study_id, row }       -> { deal, alreadyAdded }
// PATCH  { study_id, name?, companies?, notes? }     -> { study }
// PATCH  { deal_id, build_cost_override?, note? }    -> { deal }
// DELETE ?id=UUID (study)  |  ?deal_id=UUID (deal)

const MAX_COMPANIES = 40;

function cleanText(v, max = 200) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function cleanCompanies(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const c = cleanText(raw, 160);
    if (!c) continue;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= MAX_COMPANIES) break;
  }
  return out;
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function ymFrom(row, prefix) {
  const direct = toInt(row[`${prefix}_ym`]);
  if (direct) return direct;
  const y = toInt(row[`${prefix}_year`]);
  const m = toInt(row[`${prefix}_month`]);
  return y && m ? y * 12 + m : null;
}

function hydrateDeal(row) {
  if (!row) return null;
  return {
    ...row,
    row_snapshot: parseJsonbObject(row.row_snapshot),
    build_cost_override: row.build_cost_override == null ? null : Number(row.build_cost_override)
  };
}

async function loadOwnedStudy(sql, id, email) {
  const rows = await sql`
    SELECT * FROM developer_studies
    WHERE id = ${id} AND lower(owner_email) = ${email}
    LIMIT 1;
  `;
  return rows[0] || null;
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const sql = getDb();
    const email = (user.email || '').trim().toLowerCase();

    if (req.method === 'GET') {
      const id = cleanText(req.query?.id, 64);
      try {
        if (id) {
          const study = await loadOwnedStudy(sql, id, email);
          if (!study) return res.status(404).json({ error: 'Study not found.' });
          const deals = await sql`
            SELECT * FROM developer_study_deals
            WHERE study_id = ${id} AND lower(owner_email) = ${email}
            ORDER BY sell_ym DESC NULLS LAST, created_at DESC;
          `;
          return res.status(200).json({ study, deals: deals.map(hydrateDeal) });
        }
        const items = await sql`
          SELECT s.*, COALESCE(d.deal_count, 0)::int AS deal_count
          FROM developer_studies s
          LEFT JOIN (
            SELECT study_id, count(*) AS deal_count
            FROM developer_study_deals
            GROUP BY study_id
          ) d ON d.study_id = s.id
          WHERE lower(s.owner_email) = ${email}
          ORDER BY s.updated_at DESC
          LIMIT 100;
        `;
        return res.status(200).json({ items });
      } catch (err) {
        if (err?.code === '42P01') {
          return res.status(200).json({ items: [], deals: [], schemaNeedsUpdate: true });
        }
        throw err;
      }
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = String(body.action || '').trim();

      if (action === 'create_study') {
        const name = cleanText(body.name, 160);
        if (!name) return res.status(400).json({ error: 'Developer name is required.' });
        const companies = cleanCompanies(body.companies);
        const rows = await sql`
          INSERT INTO developer_studies (owner_email, name, companies, notes, updated_at)
          VALUES (${email}, ${name}, ${companies}, ${cleanText(body.notes, 4000)}, now())
          RETURNING *;
        `;
        return res.status(201).json({ study: { ...rows[0], deal_count: 0 } });
      }

      if (action === 'add_deal') {
        const studyId = cleanText(body.study_id, 64);
        const row = body.row && typeof body.row === 'object' ? body.row : null;
        if (!studyId || !row) return res.status(400).json({ error: 'study_id and row are required.' });
        const study = await loadOwnedStudy(sql, studyId, email);
        if (!study) return res.status(404).json({ error: 'Study not found.' });

        const county = normalizeCountyName(row.county) || cleanText(row.county, 40);
        const parcelId = cleanText(row.parcel_id, 64);
        if (!county || !parcelId) return res.status(400).json({ error: 'This deal is missing its county or parcel id.' });

        const buyYm = ymFrom(row, 'buy');
        const sellYm = ymFrom(row, 'sell');
        // Keep the snapshot small: only plain values, no nested blobs
        const snapshot = {};
        for (const [k, v] of Object.entries(row)) {
          if (v == null || typeof v === 'object') continue;
          snapshot[k] = v;
        }

        const existing = await sql`
          SELECT * FROM developer_study_deals
          WHERE study_id = ${studyId} AND county = ${county} AND parcel_id = ${parcelId}
            AND buy_ym IS NOT DISTINCT FROM ${buyYm} AND sell_ym IS NOT DISTINCT FROM ${sellYm}
          LIMIT 1;
        `;
        if (existing[0]) {
          return res.status(200).json({ deal: hydrateDeal(existing[0]), alreadyAdded: true });
        }

        const rows = await sql`
          INSERT INTO developer_study_deals (
            study_id, owner_email, county, parcel_id, buy_ym, sell_ym, deal_type, address, zip, row_snapshot, updated_at
          ) VALUES (
            ${studyId}, ${email}, ${county}, ${parcelId}, ${buyYm}, ${sellYm},
            ${cleanText(row.deal_type, 40)}, ${cleanText(row.address, 200)}, ${cleanText(row.zip, 10)},
            ${sql.json(snapshot)}, now()
          )
          RETURNING *;
        `;
        await sql`UPDATE developer_studies SET updated_at = now() WHERE id = ${studyId};`;
        return res.status(201).json({ deal: hydrateDeal(rows[0]), alreadyAdded: false });
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};

      if (body.deal_id) {
        const dealId = cleanText(body.deal_id, 64);
        const current = await sql`
          SELECT * FROM developer_study_deals
          WHERE id = ${dealId} AND lower(owner_email) = ${email}
          LIMIT 1;
        `;
        if (!current[0]) return res.status(404).json({ error: 'Deal not found.' });

        let override = current[0].build_cost_override;
        if (Object.prototype.hasOwnProperty.call(body, 'build_cost_override')) {
          const raw = body.build_cost_override;
          if (raw === null || raw === '') {
            override = null;
          } else {
            const n = Number(String(raw).replace(/[$,\s]/g, ''));
            if (!Number.isFinite(n) || n < 0 || n > 100000000) {
              return res.status(400).json({ error: 'Build cost must be a dollar amount.' });
            }
            override = Math.round(n);
          }
        }
        const note = Object.prototype.hasOwnProperty.call(body, 'note') ? cleanText(body.note, 2000) : current[0].note;

        const rows = await sql`
          UPDATE developer_study_deals
          SET build_cost_override = ${override}, note = ${note}, updated_at = now()
          WHERE id = ${dealId}
          RETURNING *;
        `;
        await sql`UPDATE developer_studies SET updated_at = now() WHERE id = ${rows[0].study_id};`;
        return res.status(200).json({ deal: hydrateDeal(rows[0]) });
      }

      const studyId = cleanText(body.study_id, 64);
      if (!studyId) return res.status(400).json({ error: 'study_id or deal_id is required.' });
      const study = await loadOwnedStudy(sql, studyId, email);
      if (!study) return res.status(404).json({ error: 'Study not found.' });

      const name = Object.prototype.hasOwnProperty.call(body, 'name') ? cleanText(body.name, 160) : study.name;
      if (!name) return res.status(400).json({ error: 'Developer name is required.' });
      const companies = Object.prototype.hasOwnProperty.call(body, 'companies') ? cleanCompanies(body.companies) : study.companies;
      const notes = Object.prototype.hasOwnProperty.call(body, 'notes') ? cleanText(body.notes, 4000) : study.notes;

      const rows = await sql`
        UPDATE developer_studies
        SET name = ${name}, companies = ${companies}, notes = ${notes}, updated_at = now()
        WHERE id = ${studyId}
        RETURNING *;
      `;
      return res.status(200).json({ study: rows[0] });
    }

    if (req.method === 'DELETE') {
      const dealId = cleanText(req.query?.deal_id, 64);
      if (dealId) {
        const rows = await sql`
          DELETE FROM developer_study_deals
          WHERE id = ${dealId} AND lower(owner_email) = ${email}
          RETURNING study_id;
        `;
        if (!rows[0]) return res.status(404).json({ error: 'Deal not found.' });
        await sql`UPDATE developer_studies SET updated_at = now() WHERE id = ${rows[0].study_id};`;
        return res.status(200).json({ ok: true });
      }
      const id = cleanText(req.query?.id, 64);
      if (!id) return res.status(400).json({ error: 'id or deal_id is required.' });
      const rows = await sql`
        DELETE FROM developer_studies
        WHERE id = ${id} AND lower(owner_email) = ${email}
        RETURNING id;
      `;
      if (!rows[0]) return res.status(404).json({ error: 'Study not found.' });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return sendSafeApiError(res, err, 'Developer studies API');
  }
}
