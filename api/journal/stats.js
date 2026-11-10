import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

function getWeekMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
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
    // POST: Update Instagram Tracker state
    // =========================================================================
    if (req.method === 'POST') {
      const { dayIndex, ticked } = req.body || {};
      const currentMonday = getWeekMonday();

      const userRows = await sql`
        SELECT journal_metadata FROM admin_user WHERE id = ${user.id} LIMIT 1
      `;
      const metadata = userRows[0]?.journal_metadata || {};
      const weeklyTrackers = metadata.weekly_instagram || {};
      const currentWeekDays = new Set(weeklyTrackers[currentMonday] || []);

      if (dayIndex !== undefined) {
        if (ticked) {
          currentWeekDays.add(dayIndex);
        } else {
          currentWeekDays.delete(dayIndex);
        }
      }

      weeklyTrackers[currentMonday] = Array.from(currentWeekDays).sort((a, b) => a - b);
      metadata.weekly_instagram = weeklyTrackers;

      await sql`
        UPDATE admin_user 
        SET journal_metadata = ${JSON.stringify(metadata)}
        WHERE id = ${user.id}
      `;

      return res.status(200).json({
        success: true,
        weekMonday: currentMonday,
        tickedDays: weeklyTrackers[currentMonday]
      });
    }

    // =========================================================================
    // GET: Aggregate stats for The Studio Journal
    // =========================================================================
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1. Masthead info
    const startDate = user.created_at ? new Date(user.created_at) : new Date('2026-07-24');
    const diffDays = Math.max(1, Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24)));
    const firstName = (user.full_name || 'Florencia').split(' ')[0];

    // 2. Next Cal.com booking (using existing CAL_COM_API_KEY)
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
            // Sort by start date ascending
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
        console.warn('Cal.com bookings fetch skipped gracefully:', calErr.message);
      }
    }

    // 3. Instagram weekly tracker
    const currentMonday = getWeekMonday();
    const userRows = await sql`
      SELECT journal_metadata FROM admin_user WHERE id = ${user.id} LIMIT 1
    `;
    const metadata = userRows[0]?.journal_metadata || {};
    const weeklyTrackers = metadata.weekly_instagram || {};
    const tickedDays = weeklyTrackers[currentMonday] || [];

    // 4. Designer Hub: Projects over target budget
    const projectCostRows = await sql`
      SELECT 
        p.id, 
        p.name, 
        p.target_budget,
        COALESCE(SUM(i.total), 0) as total_expenses
      FROM design_projects p
      LEFT JOIN design_items i ON i.project_id = p.id
      WHERE lower(p.owner_email) = ${cleanEmail}
      GROUP BY p.id, p.name, p.target_budget
    `;

    const projectsOverTarget = projectCostRows.filter(p => {
      const target = Number(p.target_budget) || 0;
      const total = Number(p.total_expenses) || 0;
      return target > 0 && total > target;
    });

    // 5. Designer Hub: Most recently worked on project + room mosaic
    const recentProjects = await sql`
      SELECT p.*
      FROM design_projects p
      WHERE lower(p.owner_email) = ${cleanEmail}
      ORDER BY p.updated_at DESC
      LIMIT 1
    `;

    let latestProject = null;
    if (recentProjects.length > 0) {
      const p = recentProjects[0];
      const rooms = await sql`
        SELECT r.id, r.name, r.room_type, r.palette, r.created_at
        FROM design_rooms r
        WHERE r.project_id = ${p.id}
        ORDER BY r.sort_order ASC, r.created_at ASC
      `;

      const moodImages = await sql`
        SELECT i.blob_url, i.caption, i.room_id, r.name as room_name
        FROM design_room_images i
        JOIN design_rooms r ON r.id = i.room_id
        WHERE r.project_id = ${p.id}
        ORDER BY i.created_at DESC
        LIMIT 6
      `;

      const projectItems = await sql`
        SELECT count(*) as count, COALESCE(SUM(total), 0) as total_spent
        FROM design_items
        WHERE project_id = ${p.id}
      `;

      latestProject = {
        ...p,
        roomsCount: rooms.length,
        itemsCount: parseInt(projectItems[0]?.count || '0', 10),
        totalSpent: Number(projectItems[0]?.total_spent) || 0,
        rooms,
        moodImages
      };
    }

    // 6. Investor Studio: Pinned "Studying" property or most recently updated
    let studyingProperty = null;
    let propRows = await sql`
      SELECT p.*, psi.flood_zone, psi.zoning_code, ipp.blob_url as cover_photo_url
      FROM investor_properties p
      LEFT JOIN parcel_site_info psi 
        ON psi.county = COALESCE(p.parcel_county, p.county, 'Broward') 
       AND psi.parcel_id = p.parcel_id
      LEFT JOIN LATERAL (
        SELECT blob_url FROM investor_property_photos
        WHERE property_id = p.id
        ORDER BY is_cover DESC, sort_order ASC, created_at ASC
        LIMIT 1
      ) ipp ON true
      WHERE lower(p.owner_email) = ${cleanEmail}
        AND p.is_studying = true
      ORDER BY p.updated_at DESC
      LIMIT 1
    `;

    if (propRows.length === 0) {
      propRows = await sql`
        SELECT p.*, psi.flood_zone, psi.zoning_code, ipp.blob_url as cover_photo_url
        FROM investor_properties p
        LEFT JOIN parcel_site_info psi 
          ON psi.county = COALESCE(p.parcel_county, p.county, 'Broward') 
         AND psi.parcel_id = p.parcel_id
        LEFT JOIN LATERAL (
          SELECT blob_url FROM investor_property_photos
          WHERE property_id = p.id
          ORDER BY is_cover DESC, sort_order ASC, created_at ASC
          LIMIT 1
        ) ipp ON true
        WHERE lower(p.owner_email) = ${cleanEmail}
        ORDER BY p.updated_at DESC
        LIMIT 1
      `;
    }

    if (propRows.length > 0) {
      const prop = propRows[0];
      const compRows = await sql`
        SELECT 
          round(avg(sold_price)) as avg_comp,
          count(*) as comp_count
        FROM investor_comps
        WHERE property_id = ${prop.id}
      `;
      studyingProperty = {
        ...prop,
        avgComp: compRows[0]?.avg_comp ? Number(compRows[0].avg_comp) : null,
        compCount: parseInt(compRows[0]?.comp_count || '0', 10)
      };
    }

    return res.status(200).json({
      daysSinceStart: diffDays,
      firstName,
      nextBooking,
      instagramTracker: {
        weekMonday: currentMonday,
        tickedDays
      },
      projectsOverTargetCount: projectsOverTarget.length,
      projectsOverTarget,
      latestProject,
      studyingProperty
    });
  } catch (error) {
    console.error('Error in /api/journal/stats:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
