import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const county = req.query?.county ? String(req.query.county).trim() : 'Broward';
    const parcelId = req.query?.parcel_id ? String(req.query.parcel_id).trim() : '';

    if (!parcelId) {
      return res.status(400).json({ error: 'parcel_id is required' });
    }

    const sql = getDb();

    // 1. Fetch parcel record (strictly non-PII)
    const parcels = await sql`
      SELECT 
        county,
        parcel_id,
        address,
        city,
        zip,
        use_code,
        living_sqft,
        year_built,
        eff_year_built,
        land_sqft,
        units,
        just_value,
        nbrhd_cd,
        mkt_ar,
        lat,
        lng,
        roll_year,
        imported_at
      FROM county_parcels
      WHERE county = ${county} AND parcel_id = ${parcelId}
      LIMIT 1;
    `;

    if (parcels.length === 0) {
      return res.status(404).json({ error: 'County parcel not found' });
    }

    const parcel = parcels[0];

    // 2. Fetch sales history with qualification code metadata
    const sales = await sql`
      SELECT 
        s.id,
        s.county,
        s.parcel_id,
        s.sale_price,
        s.sale_year,
        s.sale_month,
        s.qual_code,
        COALESCE(c.label, 'Unclassified transfer') AS label,
        COALESCE(c.label, 'Unclassified transfer') AS qual_label,
        COALESCE(c.is_market, false) AS is_market,
        COALESCE(c.is_distressed, false) AS is_distressed,
        s.vi_cd,
        s.multi_parcel,
        s.or_book,
        s.or_page,
        s.clerk_no,
        s.source,
        s.imported_at
      FROM county_sales s
      LEFT JOIN county_sale_codes c ON s.qual_code = c.qual_code
      WHERE s.county = ${county} AND s.parcel_id = ${parcelId}
      ORDER BY s.sale_year DESC, s.sale_month DESC NULLS LAST, s.id DESC;
    `;

    return res.status(200).json({
      ...parcel,
      sales
    });
  } catch (err) {
    console.error('Error in /api/county/parcel:', err);
    return res.status(500).json({ error: 'Internal server error while fetching parcel details' });
  }
}
