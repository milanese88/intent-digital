import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';

/**
 * Normalizes an address string to match Florida County Property Appraiser formats.
 */
export function normalizeAddressQuery(raw) {
  if (!raw || typeof raw !== 'string') {
    return { query: '', zip: null };
  }

  let str = raw.trim();

  // Drop unit/apt text after '#', 'Apt', 'Unit', 'Ste', 'Suite'
  str = str.replace(/(?:#|\bapt\.?|\bunit\b|\bste\.?|\bsuite\b).*$/i, '').trim();

  // Extract 5-digit zip if present at end of string, or preceded by FL / comma
  let zip = null;
  if (/^\d{5}$/.test(str)) {
    zip = str;
    str = '';
  } else {
    const endMatch = str.match(/(?:,\s*|\bFL\s+|\bFlorida\s+|\s)(\d{5})$/i);
    if (endMatch) {
      zip = endMatch[1];
      str = str.replace(/(?:,\s*|\bFL\s+|\bFlorida\s+|\s)\d{5}$/i, '').trim();
    } else {
      const midMatch = str.match(/(?:,\s*|\bFL\s+|\bFlorida\s+)(\d{5})\b/i);
      if (midMatch) {
        zip = midMatch[1];
        str = str.replace(/(?:,\s*|\bFL\s+|\bFlorida\s+)\d{5}\b/i, '').trim();
      }
    }
  }

  // Remove trailing Florida state mentions
  str = str.replace(/,\s*(?:FL|FLORIDA)\b/i, '').replace(/,/g, ' ');

  // Drop ordinal suffixes (e.g. 15th -> 15, 1st -> 1, 2nd -> 2, 3rd -> 3)
  str = str.replace(/\b(\d+)(?:st|nd|rd|th)\b/gi, '$1');

  // Directionals (word boundaries, case insensitive)
  str = str
    .replace(/\bsouthwest\b/gi, 'SW')
    .replace(/\bnorthwest\b/gi, 'NW')
    .replace(/\bsoutheast\b/gi, 'SE')
    .replace(/\bnortheast\b/gi, 'NE')
    .replace(/\bnorth\b/gi, 'N')
    .replace(/\bsouth\b/gi, 'S')
    .replace(/\beast\b/gi, 'E')
    .replace(/\bwest\b/gi, 'W');

  // Street suffixes
  str = str
    .replace(/\bstreet\b/gi, 'ST')
    .replace(/\bavenue\b/gi, 'AVE')
    .replace(/\bterrace\b/gi, 'TER')
    .replace(/\bcourt\b/gi, 'CT')
    .replace(/\bplace\b/gi, 'PL')
    .replace(/\bdrive\b/gi, 'DR')
    .replace(/\bboulevard\b/gi, 'BLVD')
    .replace(/\broad\b/gi, 'RD')
    .replace(/\blane\b/gi, 'LN')
    .replace(/\bcircle\b/gi, 'CIR')
    .replace(/\bway\b/gi, 'WAY')
    .replace(/\bhighway\b/gi, 'HWY');

  // Collapse consecutive spaces and trim
  str = str.replace(/\s+/g, ' ').trim().toUpperCase();

  return { query: str, zip };
}

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

    const rawQ = req.query?.q || '';
    const queryZip = req.query?.zip ? String(req.query.zip).trim() : null;

    const { query: normalizedQuery, zip: extractedZip } = normalizeAddressQuery(rawQ);
    const targetZip = queryZip || extractedZip;

    const sql = getDb();

    // Minimum 4 characters to trigger prefix search
    if (!normalizedQuery || normalizedQuery.length < 4) {
      if (targetZip && /^\d{5}$/.test(targetZip)) {
        const rows = await sql`
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
            just_value
          FROM county_parcels
          WHERE zip = ${targetZip}
          ORDER BY address ASC
          LIMIT 8;
        `;
        return res.status(200).json(rows);
      }
      return res.status(200).json([]);
    }
    const county = req.query?.county ? String(req.query.county).trim() : 'Broward';
    const prefixPattern = `${normalizedQuery.toLowerCase()}%`;

    let rows;
    if (targetZip && /^\d{5}$/.test(targetZip)) {
      rows = await sql`
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
          just_value
        FROM county_parcels
        WHERE county = ${county}
          AND lower(address) LIKE ${prefixPattern}
          AND zip = ${targetZip}
        ORDER BY address ASC
        LIMIT 8;
      `;
    } else {
      rows = await sql`
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
          just_value
        FROM county_parcels
        WHERE county = ${county}
          AND lower(address) LIKE ${prefixPattern}
        ORDER BY address ASC
        LIMIT 8;
      `;
    }

    return res.status(200).json(rows);
  } catch (err) {
    console.error('Error in /api/county/search:', err);
    return res.status(500).json({ error: 'Internal server error while searching county parcels' });
  }
}
