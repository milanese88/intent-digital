import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

const ALLOWED_PROJECT_TYPES = ['client', 'investor', 'concept', 'coursework'];
const ALLOWED_STATUSES = ['concept', 'in_design', 'in_progress', 'complete', 'on_hold'];

const ROOM_TYPE_MAP = {
  'Kitchen': 'kitchen',
  'Primary bath': 'bathroom',
  'Guest bath': 'bathroom',
  'Living room': 'living',
  'Bedrooms': 'bedroom',
  'Front of house': 'exterior'
};

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // =========================================================================
    // GET: List all projects OR single project by id OR check by investor_property_id
    // =========================================================================
    if (req.method === 'GET') {
      const id = req.query?.id;
      const investorPropertyId = req.query?.investor_property_id;

      // GET one by investor_property_id
      if (investorPropertyId) {
        const rows = await sql`
          SELECT p.*, ip.address as investor_property_address, ip.city as investor_property_city
          FROM design_projects p
          LEFT JOIN investor_properties ip ON ip.id = p.investor_property_id
          WHERE p.investor_property_id = ${investorPropertyId} AND lower(p.owner_email) = ${cleanEmail}
          LIMIT 1
        `;
        return res.status(200).json({ project: rows[0] || null });
      }

      // GET one by id
      if (id) {
        const projects = await sql`
          SELECT 
            p.*,
            ip.address as investor_property_address,
            ip.city as investor_property_city,
            ip.lat as investor_property_lat,
            ip.lng as investor_property_lng
          FROM design_projects p
          LEFT JOIN investor_properties ip ON ip.id = p.investor_property_id
          WHERE p.id = ${id} AND lower(p.owner_email) = ${cleanEmail}
          LIMIT 1
        `;

        if (projects.length === 0) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const rooms = await sql`
          SELECT * FROM design_rooms
          WHERE project_id = ${id} AND lower(owner_email) = ${cleanEmail}
          ORDER BY sort_order ASC, created_at ASC
        `;

        const itemTotals = await sql`
          SELECT 
            COUNT(id) AS item_count,
            COALESCE(SUM(total), 0) AS total_item_cost
          FROM design_items
          WHERE project_id = ${id} AND lower(owner_email) = ${cleanEmail}
        `;

        return res.status(200).json({
          project: projects[0],
          rooms,
          item_count: Number(itemTotals[0]?.item_count || 0),
          total_item_cost: Number(itemTotals[0]?.total_item_cost || 0)
        });
      }

      // GET list of all projects with room count and item totals
      const projects = await sql`
        SELECT 
          p.id,
          p.owner_email,
          p.name,
          p.location,
          p.project_type,
          p.status,
          p.style,
          p.target_budget,
          p.contingency_pct,
          p.investor_property_id,
          p.cover_url,
          p.notes,
          p.created_at,
          p.updated_at,
          ip.address as investor_property_address,
          ip.city as investor_property_city,
          ip.lat as investor_property_lat,
          ip.lng as investor_property_lng,
          COUNT(DISTINCT r.id) AS room_count,
          COUNT(DISTINCT i.id) AS item_count,
          COALESCE(SUM(i.total), 0) AS total_item_cost
        FROM design_projects p
        LEFT JOIN investor_properties ip ON ip.id = p.investor_property_id
        LEFT JOIN design_rooms r ON r.project_id = p.id
        LEFT JOIN design_items i ON i.project_id = p.id
        WHERE lower(p.owner_email) = ${cleanEmail}
        GROUP BY p.id, ip.address, ip.city, ip.lat, ip.lng
        ORDER BY p.updated_at DESC, p.created_at DESC
      `;

      return res.status(200).json({ projects });
    }

    // =========================================================================
    // POST: Create a new project
    // =========================================================================
    if (req.method === 'POST') {
      const body = req.body || {};
      const name = body.name != null ? String(body.name).trim() : '';
      if (!name) {
        return res.status(400).json({ error: 'Project name is required' });
      }

      const location = body.location != null && String(body.location).trim() !== '' ? String(body.location).trim() : null;
      let project_type = body.project_type != null && String(body.project_type).trim() !== '' ? String(body.project_type).trim().toLowerCase() : 'concept';
      if (!ALLOWED_PROJECT_TYPES.includes(project_type)) {
        project_type = 'concept';
      }

      let status = body.status != null && String(body.status).trim() !== '' ? String(body.status).trim().toLowerCase() : 'concept';
      if (!ALLOWED_STATUSES.includes(status)) {
        status = 'concept';
      }

      const style = body.style != null && String(body.style).trim() !== '' ? String(body.style).trim() : null;

      let target_budget = null;
      if (body.target_budget != null && String(body.target_budget).trim() !== '') {
        const tb = Number(String(body.target_budget).replace(/[$,]/g, '').trim());
        if (!isNaN(tb) && tb >= 0) target_budget = tb;
      }

      let contingency_pct = 10;
      if (body.contingency_pct != null && String(body.contingency_pct).trim() !== '') {
        const cp = Number(String(body.contingency_pct).replace(/[%,]/g, '').trim());
        if (!isNaN(cp) && cp >= 0) contingency_pct = cp;
      }

      let investor_property_id = null;
      if (body.investor_property_id && String(body.investor_property_id).trim() !== '') {
        const propId = String(body.investor_property_id).trim();
        const propCheck = await sql`
          SELECT id FROM investor_properties
          WHERE id = ${propId} AND lower(owner_email) = ${cleanEmail}
          LIMIT 1
        `;
        if (propCheck.length === 0) {
          return res.status(400).json({ error: 'Selected investor property does not exist or does not belong to you.' });
        }
        investor_property_id = propId;
      }

      const cover_url = body.cover_url != null && String(body.cover_url).trim() !== '' ? String(body.cover_url).trim() : null;
      const notes = body.notes != null && String(body.notes).trim() !== '' ? String(body.notes).trim() : null;

      const inserted = await sql`
        INSERT INTO design_projects (
          owner_email,
          name,
          location,
          project_type,
          status,
          style,
          target_budget,
          contingency_pct,
          investor_property_id,
          cover_url,
          notes
        ) VALUES (
          ${cleanEmail},
          ${name},
          ${location},
          ${project_type},
          ${status},
          ${style},
          ${target_budget},
          ${contingency_pct},
          ${investor_property_id},
          ${cover_url},
          ${notes}
        )
        RETURNING *
      `;

      const project = inserted[0];

      // Quick-start initial rooms if provided
      const initialRooms = Array.isArray(body.initial_rooms) ? body.initial_rooms : [];
      if (initialRooms.length > 0) {
        for (let idx = 0; idx < initialRooms.length; idx++) {
          const roomName = String(initialRooms[idx]).trim();
          if (!roomName) continue;
          const rType = ROOM_TYPE_MAP[roomName] || 'other';
          await sql`
            INSERT INTO design_rooms (
              project_id,
              owner_email,
              room_type,
              name,
              sort_order
            ) VALUES (
              ${project.id},
              ${cleanEmail},
              ${rType},
              ${roomName},
              ${idx}
            )
          `;
        }
      }

      return res.status(201).json({ project });
    }

    // =========================================================================
    // PUT: Update an existing project
    // =========================================================================
    if (req.method === 'PUT') {
      const body = req.body || {};
      const id = req.query?.id || body.id;
      if (!id) {
        return res.status(400).json({ error: 'Project ID is required' });
      }

      // Check ownership
      const existing = await sql`
        SELECT * FROM design_projects
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        LIMIT 1
      `;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const name = body.name != null ? String(body.name).trim() : existing[0].name;
      if (!name) {
        return res.status(400).json({ error: 'Project name cannot be empty' });
      }

      const location = body.location !== undefined ? (body.location ? String(body.location).trim() : null) : existing[0].location;

      let project_type = body.project_type !== undefined ? String(body.project_type).trim().toLowerCase() : existing[0].project_type;
      if (!ALLOWED_PROJECT_TYPES.includes(project_type)) {
        project_type = existing[0].project_type;
      }

      let status = body.status !== undefined ? String(body.status).trim().toLowerCase() : existing[0].status;
      if (!ALLOWED_STATUSES.includes(status)) {
        status = existing[0].status;
      }

      const style = body.style !== undefined ? (body.style ? String(body.style).trim() : null) : existing[0].style;

      let target_budget = existing[0].target_budget;
      if (body.target_budget !== undefined) {
        if (body.target_budget == null || String(body.target_budget).trim() === '') {
          target_budget = null;
        } else {
          const tb = Number(String(body.target_budget).replace(/[$,]/g, '').trim());
          if (!isNaN(tb) && tb >= 0) target_budget = tb;
        }
      }

      let contingency_pct = existing[0].contingency_pct;
      if (body.contingency_pct !== undefined) {
        const cp = Number(String(body.contingency_pct).replace(/[%,]/g, '').trim());
        if (!isNaN(cp) && cp >= 0) contingency_pct = cp;
      }

      let investor_property_id = existing[0].investor_property_id;
      if (body.investor_property_id !== undefined) {
        if (!body.investor_property_id || String(body.investor_property_id).trim() === '') {
          investor_property_id = null;
        } else {
          const propId = String(body.investor_property_id).trim();
          const propCheck = await sql`
            SELECT id FROM investor_properties
            WHERE id = ${propId} AND lower(owner_email) = ${cleanEmail}
            LIMIT 1
          `;
          if (propCheck.length === 0) {
            return res.status(400).json({ error: 'Selected investor property does not exist or does not belong to you.' });
          }
          investor_property_id = propId;
        }
      }

      const cover_url = body.cover_url !== undefined ? (body.cover_url ? String(body.cover_url).trim() : null) : existing[0].cover_url;
      const notes = body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing[0].notes;

      const updated = await sql`
        UPDATE design_projects SET
          name = ${name},
          location = ${location},
          project_type = ${project_type},
          status = ${status},
          style = ${style},
          target_budget = ${target_budget},
          contingency_pct = ${contingency_pct},
          investor_property_id = ${investor_property_id},
          cover_url = ${cover_url},
          notes = ${notes}
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING *
      `;

      return res.status(200).json({ project: updated[0] });
    }

    // =========================================================================
    // DELETE: Delete a project (cascades to rooms, room images, items)
    // =========================================================================
    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Project ID is required' });
      }

      const deleted = await sql`
        DELETE FROM design_projects
        WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
        RETURNING id
      `;

      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Project not found or already deleted' });
      }

      return res.status(200).json({ success: true, deleted_id: deleted[0].id });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('API /api/designer/projects error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
