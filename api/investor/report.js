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

    const propertyId = req.query?.property_id || req.query?.propertyId;
    const analysisId = req.query?.analysis_id || req.query?.analysisId;

    if (!propertyId) {
      return res.status(400).json({ error: 'property_id is required' });
    }

    const sql = getDb();
    const cleanEmail = (user.email || '').trim().toLowerCase();

    // 1. Verify property ownership (Admin-only, 404 for other owners)
    const properties = await sql`
      SELECT *
      FROM investor_properties
      WHERE id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
      LIMIT 1;
    `;

    if (properties.length === 0) {
      return res.status(404).json({ error: 'Property not found or unauthorized' });
    }

    const property = properties[0];

    // 2. Fetch all saved analyses for this property (newest first)
    const analyses = await sql`
      SELECT id, owner_email, property_id, strategy, inputs, results, created_at
      FROM investor_analyses
      WHERE property_id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
      ORDER BY created_at DESC;
    `;

    // Determine selected analysis
    let selectedAnalysis = null;
    if (analysisId) {
      selectedAnalysis = analyses.find(a => a.id === analysisId) || null;
    }
    if (!selectedAnalysis && analyses.length > 0) {
      selectedAnalysis = analyses[0];
    }

    // 3. Fetch county parcel record (strictly non-PII, no owner names or mailing addresses)
    let countyData = null;
    const county = property.parcel_county || property.county || 'Broward';
    if (property.parcel_id) {
      const parcels = await sql`
        SELECT 
          county, parcel_id, address, city, zip, use_code,
          living_sqft, year_built, eff_year_built, land_sqft, units, just_value,
          nbrhd_cd, mkt_ar, lat, lng, roll_year, imported_at
        FROM county_parcels
        WHERE county = ${county} AND parcel_id = ${property.parcel_id}
        LIMIT 1;
      `;
      if (parcels.length > 0) {
        const sales = await sql`
          SELECT 
            s.id, s.county, s.parcel_id, s.sale_price, s.sale_year, s.sale_month,
            s.qual_code, COALESCE(c.label, 'Unclassified transfer') AS qual_label,
            COALESCE(c.is_market, false) AS is_market,
            COALESCE(c.is_distressed, false) AS is_distressed,
            s.vi_cd, s.multi_parcel, s.source
          FROM county_sales s
          LEFT JOIN county_sale_codes c ON s.qual_code = c.qual_code
          WHERE s.county = ${county} AND s.parcel_id = ${property.parcel_id}
          ORDER BY s.sale_year DESC, s.sale_month DESC NULLS LAST, s.id DESC
          LIMIT 10;
        `;
        countyData = {
          ...parcels[0],
          sales
        };
      }
    }

    // 4. Fetch comps associated with this property
    let comps = [];
    try {
      comps = await sql`
        SELECT 
          id, property_id, address, city, zip, lat, lng,
          sold_date, sold_price, sqft, beds, baths, year_built,
          price_per_sqft, distance_mi, included, source, parcel_id, parcel_county, created_at
        FROM investor_comps
        WHERE property_id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
        ORDER BY included DESC, sold_date DESC NULLS LAST, created_at DESC;
      `;
    } catch (compsErr) {
      console.warn('Could not load comps:', compsErr.message);
    }

    // 5. Fetch uploaded property photos
    let photos = [];
    try {
      photos = await sql`
        SELECT id, property_id, blob_url, caption, sort_order, is_cover, created_at
        FROM investor_property_photos
        WHERE property_id = ${propertyId} AND lower(owner_email) = ${cleanEmail}
        ORDER BY is_cover DESC, sort_order ASC, created_at ASC;
      `;
    } catch (photoErr) {
      console.warn('Could not load photos:', photoErr.message);
    }

    // 6. Fetch user's investor profile (for cash to close & liquidity analysis)
    let profile = {
      liquid_cash: 100000,
      reserve_months: 6,
      credit_tier: '740-759'
    };
    try {
      const profiles = await sql`
        SELECT owner_email, credit_tier, liquid_cash, reserve_months, rate_sheet, updated_at
        FROM investor_profile
        WHERE lower(owner_email) = ${cleanEmail}
        LIMIT 1;
      `;
      if (profiles.length > 0) {
        profile = profiles[0];
      }
    } catch (profErr) {
      console.warn('investor_profile note:', profErr.message);
    }

    // 7. Market statistics & complete months trend for property's ZIP
    let marketStats = {
      salesCount: 0,
      medianPpsf: null,
      distressedCount: 0,
      distressedSharePct: 0,
      monthlyTrend: []
    };

    if (property.zip) {
      try {
        const statsRow = await sql`
          SELECT 
            count(*)::int as count,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY (s.sale_price / NULLIF(p.living_sqft, 0))) as median_ppsf,
            count(*) FILTER (WHERE c.is_distressed = true)::int as distressed_count
          FROM county_sales s
          JOIN county_parcels p ON s.county = p.county AND s.parcel_id = p.parcel_id
          LEFT JOIN county_sale_codes c ON s.qual_code = c.qual_code
          WHERE p.county = ${county} 
            AND p.zip = ${property.zip}
            AND s.sale_price >= 50000
            AND p.living_sqft > 400
            AND s.sale_year >= 2025;
        `;

        if (statsRow.length > 0) {
          const count = Number(statsRow[0].count) || 0;
          const distressed = Number(statsRow[0].distressed_count) || 0;
          marketStats.salesCount = count;
          marketStats.medianPpsf = statsRow[0].median_ppsf ? Math.round(Number(statsRow[0].median_ppsf)) : null;
          marketStats.distressedCount = distressed;
          marketStats.distressedSharePct = count > 0 ? Math.round((distressed / count) * 1000) / 10 : 0;
        }

        // Monthly trend for complete months (last 6 months, excluding current incomplete month)
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 1-12

        const trendRows = await sql`
          SELECT 
            s.sale_year,
            s.sale_month,
            count(*)::int as count,
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (s.sale_price / NULLIF(p.living_sqft, 0))))::int as median_ppsf
          FROM county_sales s
          JOIN county_parcels p ON s.county = p.county AND s.parcel_id = p.parcel_id
          WHERE p.county = ${county} 
            AND p.zip = ${property.zip}
            AND s.sale_price >= 50000
            AND p.living_sqft > 400
            AND s.sale_year >= 2025
            AND NOT (s.sale_year = ${currentYear} AND s.sale_month = ${currentMonth})
          GROUP BY s.sale_year, s.sale_month
          ORDER BY s.sale_year DESC, s.sale_month DESC
          LIMIT 6;
        `;

        marketStats.monthlyTrend = trendRows.map(r => ({
          year: r.sale_year,
          month: r.sale_month,
          label: `${String(r.sale_month).padStart(2, '0')}/${r.sale_year}`,
          count: r.count,
          medianPpsf: r.median_ppsf
        })).reverse();
      } catch (marketErr) {
        console.warn('Could not compute market stats:', marketErr.message);
      }
    }

    return res.status(200).json({
      property,
      analyses,
      selectedAnalysis,
      countyData,
      comps,
      photos,
      profile,
      marketStats
    });

  } catch (err) {
    console.error('Error generating deal report data:', err);
    return res.status(500).json({ error: 'Internal server error fetching deal report' });
  }
}
