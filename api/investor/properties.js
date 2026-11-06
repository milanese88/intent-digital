import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    const properties = await sql`
      SELECT 
        id,
        owner_email,
        address,
        city,
        state,
        zip,
        county,
        lat,
        lng,
        property_type,
        units,
        beds,
        baths,
        sqft,
        lot_sqft,
        year_built,
        list_price,
        status,
        strategy,
        condition,
        roof_year,
        listing_url,
        notes,
        created_at,
        updated_at
      FROM investor_properties
      WHERE lower(owner_email) = ${cleanEmail}
      ORDER BY created_at DESC
    `;

    return res.status(200).json(properties);
  } catch (error) {
    console.error('Error fetching investor properties:', error);
    return res.status(500).json({ error: 'Server error fetching investor properties' });
  }
}
