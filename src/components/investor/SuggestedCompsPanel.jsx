import React, { useState, useEffect, useCallback } from 'react';
import { formatNiceAddress, toTitleCase, forwardGeocodeMapbox } from './AddressAutocomplete.jsx';

/**
 * Formats sale date to "Sold MMM YYYY" (e.g. "Sold Sep 2026")
 */
function formatSoldDate(month, year) {
  if (!year) return '—';
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = Number(month);
  if (m >= 1 && m <= 12) {
    return `Sold ${monthNames[m - 1]} ${year}`;
  }
  return `Sold ${year}`;
}

export default function SuggestedCompsPanel({
  property,
  comps = [],
  onCompAdded,
  onOpenFindModal,
  showToast
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [includeDistressed, setIncludeDistressed] = useState(false);
  const [addingParcelId, setAddingParcelId] = useState(null);

  // Fetch suggested comps from /api/county/comps
  const fetchSuggestedComps = useCallback(async () => {
    if (!property?.parcel_id) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const county = property.parcel_county || property.county || 'Broward';
      const pId = property.parcel_id;
      const url = `/api/county/comps?county=${encodeURIComponent(county)}&parcel_id=${encodeURIComponent(pId)}${includeDistressed ? '&include_distressed=1' : ''}`;

      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Please sign in to view county comps.');
        }
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const resData = await res.json();
      setData(resData);
    } catch (err) {
      console.error('Error fetching suggested county comps:', err);
      setError(err.message || 'Unable to load suggested comps.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [property?.parcel_id, property?.parcel_county, property?.county, includeDistressed]);

  useEffect(() => {
    fetchSuggestedComps();
  }, [fetchSuggestedComps]);

  // Handle adding candidate to investor comps
  const handleAddCandidate = async (candidate) => {
    if (!property?.id || addingParcelId) return;

    setAddingParcelId(candidate.parcel_id);
    const niceAddress = formatNiceAddress(candidate.address);
    const titleCity = toTitleCase(candidate.city);
    const zip = candidate.zip || property.zip || '';

    // 1st of the sale month
    const monthNum = candidate.sale_month ? Number(candidate.sale_month) : 1;
    const monthStr = String(monthNum).padStart(2, '0');
    const soldDate = `${candidate.sale_year}-${monthStr}-01`;

    try {
      let lat = candidate.lat != null ? Number(candidate.lat) : null;
      let lng = candidate.lng != null ? Number(candidate.lng) : null;

      // Fall back to Mapbox only if parcel coordinates are missing
      if (lat == null || lng == null) {
        const geoQuery = `${niceAddress}, ${titleCity}, FL ${zip}`.trim();
        const coords = await forwardGeocodeMapbox(geoQuery);
        lat = coords.lat;
        lng = coords.lng;
      }

      const payload = {
        property_id: property.id,
        address: niceAddress,
        city: titleCity,
        zip: zip || null,
        lat,
        lng,
        sold_date: soldDate,
        sold_price: Number(candidate.sale_price),
        sqft: Number(candidate.living_sqft),
        year_built: candidate.year_built ? Number(candidate.year_built) : null,
        source: 'Property appraiser',
        included: true,
        parcel_id: candidate.parcel_id,
        parcel_county: property.parcel_county || property.county || 'Broward'
      };

      const res = await fetch('/api/investor/comps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'Failed to add comp.');
      }

      if (onCompAdded) {
        onCompAdded(resJson);
      }
      if (showToast) {
        showToast('Comp added');
      }
    } catch (err) {
      console.error('Error adding comp:', err);
      if (showToast) {
        showToast(err.message || 'Error adding comp');
      }
    } finally {
      setAddingParcelId(null);
    }
  };

  // Check if a candidate is already in investor comps by parcel_id or address match
  const isCandidateAdded = (candidate) => {
    if (!comps || comps.length === 0) return false;
    const candAddressClean = (candidate.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const candNiceClean = formatNiceAddress(candidate.address).toLowerCase().replace(/[^a-z0-9]/g, '');

    return comps.some(c => {
      if (c.parcel_id && c.parcel_id === candidate.parcel_id) return true;
      if (c.address) {
        const compAddressClean = c.address.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (compAddressClean === candAddressClean || compAddressClean === candNiceClean) {
          return true;
        }
      }
      return false;
    });
  };

  // State A: Property has NO parcel_id linked
  if (!property?.parcel_id) {
    return (
      <div
        className="investor-suggested-comps-card"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(52, 41, 42, 0.1)',
          borderRadius: '12px',
          padding: '18px 22px',
          boxShadow: '0 4px 16px rgba(52, 41, 42, 0.03)',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px', opacity: 0.65 }}>📍</span>
          <span
            style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '13px',
              color: 'rgba(52, 41, 42, 0.75)'
            }}
          >
            Link the county record to see suggested comps
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            if (onOpenFindModal) {
              onOpenFindModal();
            } else {
              const el = document.getElementById('county-record-card');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
                const btn = el.querySelector('button');
                if (btn) btn.click();
              }
            }
          }}
          className="investor-search-btn"
          style={{
            padding: '8px 16px',
            fontSize: '11px',
            letterSpacing: '0.08em',
            fontWeight: 600
          }}
        >
          FIND COUNTY RECORD
        </button>
      </div>
    );
  }

  const summary = data?.summary || {};
  const candidates = data?.candidates || [];

  // Summary medians text
  const medianText = summary.median_price_per_sqft != null
    ? `Median $${summary.median_price_per_sqft}/sf`
    : null;
  const renoMedianText = summary.renovated_median_price_per_sqft != null
    ? `Renovated median $${summary.renovated_median_price_per_sqft}/sf`
    : null;
  const combinedMedianLine = [medianText, renoMedianText].filter(Boolean).join(' · ');

  // Small gray subtitle line (e.g. "Same neighborhood · last 12 months · 828–1,380 sf")
  const sqftRangeStr = (summary.sqft_min != null && summary.sqft_max != null)
    ? `${summary.sqft_min.toLocaleString()}–${summary.sqft_max.toLocaleString()} sf`
    : null;
  const subtitleLine = [
    summary.tier_label || 'Same neighborhood',
    `last ${summary.window_months || 12} months`,
    sqftRangeStr
  ].filter(Boolean).join(' · ');

  return (
    <div
      className="investor-suggested-comps-card"
      style={{
        background: '#ffffff',
        border: '1px solid rgba(52, 41, 42, 0.1)',
        borderRadius: '12px',
        padding: '22px 24px',
        boxShadow: '0 4px 16px rgba(52, 41, 42, 0.03)',
        marginBottom: '24px'
      }}
    >
      {/* Header & Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '14px'
        }}
      >
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: '20px',
              fontWeight: 500,
              color: 'var(--espresso, #34292A)',
              margin: '0 0 4px 0'
            }}
          >
            Suggested from county records
          </h3>
          <div
            style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '11.5px',
              color: 'rgba(52, 41, 42, 0.55)',
              letterSpacing: '0.01em'
            }}
          >
            {subtitleLine}
          </div>
        </div>

        {/* Small Toggle: "Include distressed sales" */}
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '12px',
            color: 'var(--espresso, #34292A)',
            cursor: 'pointer',
            userSelect: 'none',
            backgroundColor: '#FAF8F5',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(52, 41, 42, 0.1)'
          }}
        >
          <input
            type="checkbox"
            checked={includeDistressed}
            onChange={(e) => setIncludeDistressed(e.target.checked)}
            style={{
              accentColor: 'var(--secondary-color, #41101B)',
              cursor: 'pointer'
            }}
          />
          <span>Include distressed sales</span>
        </label>
      </div>

      {/* Summary Medians Line */}
      {combinedMedianLine && !loading && candidates.length > 0 && (
        <div
          style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--secondary-color, #41101B)',
            backgroundColor: 'rgba(189, 211, 226, 0.18)',
            border: '1px solid rgba(133, 157, 206, 0.3)',
            padding: '7px 14px',
            borderRadius: '6px',
            display: 'inline-block',
            marginBottom: '16px'
          }}
        >
          {combinedMedianLine}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(52, 41, 42, 0.6)', fontSize: '13px' }}>
          Finding matching county sales nearby...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{ padding: '12px 16px', backgroundColor: '#FFF7F7', borderRadius: '6px', color: '#B03823', fontSize: '12.5px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && candidates.length === 0 && (
        <div style={{ padding: '20px 0', color: 'rgba(52, 41, 42, 0.6)', fontSize: '13px', fontStyle: 'italic' }}>
          No qualifying arm's-length county sales recorded within ±25% size in this area.
        </div>
      )}

      {/* Candidates List */}
      {!loading && candidates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {candidates.map((c) => {
            const niceAddress = formatNiceAddress(c.address);
            const soldDateStr = formatSoldDate(c.sale_month, c.sale_year);
            const priceStr = `$${Number(c.sale_price).toLocaleString()}`;
            const sqftStr = `${Number(c.living_sqft).toLocaleString()} sf`;
            const ppsStr = `$${c.price_per_sqft}/sf`;
            const ybStr = c.year_built ? `Built ${c.year_built}` : '';
            const alreadyAdded = isCandidateAdded(c);
            const isAdding = addingParcelId === c.parcel_id;

            return (
              <div
                key={c.parcel_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '11px 14px',
                  backgroundColor: '#FAF8F5',
                  borderRadius: '8px',
                  border: '1px solid rgba(52, 41, 42, 0.08)',
                  gap: '12px',
                  flexWrap: 'wrap',
                  transition: 'background-color 0.15s ease'
                }}
              >
                {/* Left Info: Address, date, size, $/sf, year, pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: 'var(--espresso, #1E1509)',
                      minWidth: '160px'
                    }}
                  >
                    {niceAddress}
                  </span>

                  {/* Distance pill (e.g. "0.3 mi") */}
                  {c.distance_mi != null && (
                    <span
                      title={`Approx. ${c.distance_mi} miles from subject property`}
                      style={{
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--secondary-color, #41101B)',
                        backgroundColor: 'rgba(189, 211, 226, 0.28)',
                        border: '1px solid rgba(133, 157, 206, 0.45)',
                        padding: '1px 7px',
                        borderRadius: '10px',
                        letterSpacing: '0.02em',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {c.distance_mi} mi
                    </span>
                  )}

                  <span
                    style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '12px',
                      color: 'rgba(52, 41, 42, 0.65)'
                    }}
                  >
                    {soldDateStr}
                  </span>

                  <span
                    style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '15.5px',
                      fontWeight: 600,
                      color: 'var(--espresso, #34292A)'
                    }}
                  >
                    {priceStr}
                  </span>

                  <span
                    style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '12px',
                      color: 'rgba(52, 41, 42, 0.7)'
                    }}
                  >
                    {sqftStr}
                  </span>

                  <span
                    style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--secondary-color, #41101B)'
                    }}
                  >
                    {ppsStr}
                  </span>

                  {ybStr && (
                    <span
                      style={{
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '12px',
                        color: 'rgba(52, 41, 42, 0.6)'
                      }}
                    >
                      {ybStr}
                    </span>
                  )}

                  {/* Likely Renovated Pill */}
                  {c.likely_renovated && (
                    <span
                      title={`Effective year built is ${c.eff_year_built} (actual ${c.year_built})`}
                      style={{
                        backgroundColor: 'rgba(133, 157, 206, 0.2)',
                        color: '#2D5584',
                        border: '1px solid rgba(133, 157, 206, 0.4)',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '10.5px',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                        cursor: 'help'
                      }}
                    >
                      Renovated?
                    </span>
                  )}

                  {/* Distressed Pill */}
                  {c.is_distressed && (
                    <span
                      style={{
                        backgroundColor: '#FDF0ED',
                        color: '#B03823',
                        border: '1px solid rgba(176, 56, 35, 0.3)',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '10.5px',
                        fontWeight: 600,
                        letterSpacing: '0.02em'
                      }}
                    >
                      Distressed
                    </span>
                  )}
                </div>

                {/* Right Action Button: "+ ADD" or "✓ Added" */}
                <div>
                  {alreadyAdded ? (
                    <button
                      type="button"
                      disabled
                      style={{
                        padding: '6px 14px',
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        backgroundColor: 'rgba(52, 41, 42, 0.08)',
                        color: 'rgba(52, 41, 42, 0.55)',
                        border: '1px solid rgba(52, 41, 42, 0.12)',
                        borderRadius: '6px',
                        cursor: 'default',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      ✓ Added
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAddCandidate(c)}
                      disabled={isAdding}
                      style={{
                        padding: '6px 14px',
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        backgroundColor: 'var(--secondary-color, #41101B)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isAdding ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'opacity 0.15s ease'
                      }}
                    >
                      {isAdding ? 'ADDING...' : '+ ADD'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Note under list */}
      <div
        style={{
          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
          fontSize: '11.5px',
          color: 'rgba(52, 41, 42, 0.55)',
          fontStyle: 'italic',
          marginTop: '14px',
          lineHeight: 1.4
        }}
      >
        County sales show month only. Beds and baths aren't in county records — add them in the comp if you need them.
      </div>
    </div>
  );
}
