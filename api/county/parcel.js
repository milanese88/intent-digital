import { getUserFromSession } from '../_lib/session.js';
import { getDb, sendSafeApiError } from '../_lib/db.js';
import { fetchBuildingCharacteristicOne } from '../_lib/buildingChars.js';
import { fetchPalmBeachCamaSales } from '../_lib/camaSales.js';
import { normalizeCountyName } from '../../src/config/counties.js';
import { formatCountyClues } from '../../src/components/investor/compDetailsModel.js';

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

    const rawCounty = req.query?.county ? String(req.query.county).trim() : 'Broward';
    const county = normalizeCountyName(rawCounty) || rawCounty;
    const parcelId = req.query?.parcel_id ? String(req.query.parcel_id).trim() : '';
    const cleanParcelId = parcelId.replace(/[^0-9A-Za-z]/g, '');
    const candidateFolios = Array.from(new Set([parcelId, cleanParcelId].filter(Boolean)));

    if (!parcelId) {
      return res.status(400).json({ error: 'parcel_id is required' });
    }

    const sql = getDb();

    // 1. Fetch parcel record (strictly non-PII), including NAL clue + land_value columns when migrated
    let parcels;
    try {
      parcels = await sql`
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
          imp_qual,
          const_class,
          spec_feat_val,
          beds,
          full_baths,
          half_baths,
          just_value,
          land_value,
          nbrhd_cd,
          mkt_ar,
          s_legal,
          subdivision_name,
          subdivision_code,
          situs_number,
          situs_street_norm,
          lat,
          lng,
          roll_year,
          imported_at
        FROM county_parcels
        WHERE county = ${county} AND parcel_id = ANY(${candidateFolios})
        LIMIT 1;
      `;
    } catch (colErr) {
      if (colErr?.code === '42703') {
        try {
          parcels = await sql`
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
              imp_qual,
              const_class,
              spec_feat_val,
              beds,
              full_baths,
              half_baths,
              just_value,
              nbrhd_cd,
              mkt_ar,
              s_legal,
              subdivision_name,
              subdivision_code,
              situs_number,
              situs_street_norm,
              lat,
              lng,
              roll_year,
              imported_at
            FROM county_parcels
            WHERE county = ${county} AND parcel_id = ANY(${candidateFolios})
            LIMIT 1;
          `;
        } catch (colErr2) {
          if (colErr2?.code === '42703') {
            parcels = await sql`
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
              WHERE county = ${county} AND parcel_id = ANY(${candidateFolios})
              LIMIT 1;
            `;
          } else {
            throw colErr2;
          }
        }
      } else {
        throw colErr;
      }
    }

    if (parcels.length === 0) {
      return res.status(404).json({ error: 'County parcel not found' });
    }

    const parcel = parcels[0];
    const building_characteristics = await fetchBuildingCharacteristicOne(sql, county, parcelId);
    const county_clues = formatCountyClues({
      ...parcel,
      beds: building_characteristics?.beds ?? parcel.beds ?? null,
      full_baths: building_characteristics?.full_baths ?? parcel.full_baths ?? null,
      half_baths: building_characteristics?.half_baths ?? parcel.half_baths ?? null
    });

    // 2. Fetch sales history with qualification code metadata
    let sales = await sql`
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
        'county record' AS source,
        s.imported_at
      FROM county_sales s
      LEFT JOIN county_sale_codes c ON s.qual_code = c.qual_code
      WHERE s.county = ${county} AND s.parcel_id = ANY(${candidateFolios})
      ORDER BY s.sale_year DESC, s.sale_month DESC NULLS LAST, s.id DESC;
    `;

    // Augment with Palm Beach CAMA SALE history (up to 5 prior deeds)
    if (county === 'Palm Beach') {
      try {
        const camaSales = fetchPalmBeachCamaSales(parcelId);
        if (camaSales.length > 0) {
          const existingKeys = new Set(
            sales.map((s) => `${s.or_book || ''}|${s.or_page || ''}|${s.sale_year || ''}|${s.sale_month || ''}`)
          );
          const additional = camaSales.filter((cs) => {
            const key = `${cs.or_book || ''}|${cs.or_page || ''}|${cs.sale_year || ''}|${cs.sale_month || ''}`;
            return !existingKeys.has(key) && !sales.some((s) => Number(s.sale_year) === Number(cs.sale_year) && Number(s.sale_month) === Number(cs.sale_month) && Math.abs(Number(s.sale_price) - Number(cs.sale_price)) < 100);
          });
          sales = [...sales, ...additional].sort((a, b) => {
            const ymA = (Number(a.sale_year) || 0) * 12 + (Number(a.sale_month) || 1);
            const ymB = (Number(b.sale_year) || 0) * 12 + (Number(b.sale_month) || 1);
            return ymB - ymA;
          });
        }
      } catch (camaErr) {
        console.warn('[CAMA Sales] Non-fatal error reading Palm Beach CAMA sales:', camaErr?.message);
      }
    }

    // 3. Nearest qualified same-street sale (sanity anchor for Appraisal Income/Land check card)
    let nearest_same_street_sale = null;
    if (parcel.situs_street_norm) {
      try {
        const streetRows = await sql`
          SELECT DISTINCT ON (p.parcel_id)
            p.county,
            p.parcel_id,
            p.address,
            p.city,
            p.zip,
            p.living_sqft,
            p.year_built,
            p.situs_number,
            p.lat,
            p.lng,
            s.sale_price,
            s.sale_year,
            s.sale_month,
            s.qual_code
          FROM county_parcels p
          JOIN county_sales s
            ON s.county = p.county
           AND s.parcel_id = p.parcel_id
          WHERE p.county = ${county}
            AND p.situs_street_norm = ${parcel.situs_street_norm}
            AND p.parcel_id <> ALL(${candidateFolios})
            AND s.qual_code IN ('01', '02')
            AND s.sale_price > 10000
          ORDER BY p.parcel_id, s.sale_year DESC, s.sale_month DESC NULLS LAST
          LIMIT 60;
        `;

        if (streetRows.length > 0) {
          const subLat = parcel.lat != null ? Number(parcel.lat) : null;
          const subLng = parcel.lng != null ? Number(parcel.lng) : null;
          const subNum = parcel.situs_number != null ? parseInt(String(parcel.situs_number).replace(/\D/g, ''), 10) : NaN;

          const haversineMi = (lat1, lon1, lat2, lon2) => {
            if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
            const toRad = (deg) => (deg * Math.PI) / 180;
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          };

          const ranked = streetRows
            .map((r) => {
              const dist = haversineMi(subLat, subLng, r.lat != null ? Number(r.lat) : null, r.lng != null ? Number(r.lng) : null);
              const rNum = r.situs_number != null ? parseInt(String(r.situs_number).replace(/\D/g, ''), 10) : NaN;
              const numDiff = !isNaN(subNum) && !isNaN(rNum) ? Math.abs(subNum - rNum) : Number.MAX_SAFE_INTEGER;
              const salePrice = Number(r.sale_price);
              const livingSqft = Number(r.living_sqft) || null;
              const mo = r.sale_month ? String(r.sale_month).padStart(2, '0') : '01';
              return {
                county: r.county,
                parcel_id: r.parcel_id,
                address: r.address,
                city: r.city,
                zip: r.zip,
                sold_price: salePrice,
                sold_date: r.sale_year ? `${r.sale_year}-${mo}-01` : null,
                sale_year: r.sale_year,
                sale_month: r.sale_month,
                sqft: livingSqft,
                ppsf: livingSqft ? Math.round(salePrice / livingSqft) : null,
                distance_mi: dist != null ? Math.round(dist * 100) / 100 : null,
                _distSort: dist != null ? dist : Number.MAX_SAFE_INTEGER,
                _numDiff: numDiff,
                _recencySort: (Number(r.sale_year) || 0) * 100 + (Number(r.sale_month) || 0),
                source: 'county_roll'
              };
            })
            .sort((a, b) => {
              // Prefer recent sales within 24 months when distance is similar; otherwise closest neighbor
              if (Math.abs(a._distSort - b._distSort) > 0.03) return a._distSort - b._distSort;
              if (a._numDiff !== b._numDiff) return a._numDiff - b._numDiff;
              return b._recencySort - a._recencySort;
            });

          const best = ranked[0];
          if (best) {
            delete best._distSort;
            delete best._numDiff;
            delete best._recencySort;
            nearest_same_street_sale = best;
          }
        }
      } catch {
        // Non-fatal: omit same-street anchor if schema/index unavailable
      }
    }

    return res.status(200).json({
      ...parcel,
      building_characteristics,
      county_clues,
      nearest_same_street_sale,
      sales
    });
  } catch (err) {
    return sendSafeApiError(res, err, 'Error in /api/county/parcel', 'Unable to fetch parcel details right now.');
  }
}
