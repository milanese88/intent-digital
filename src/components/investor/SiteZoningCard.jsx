import React, { useState, useEffect } from 'react';

/**
 * Format a date string (YYYY-MM-DD or ISO) into "MMM D, YYYY"
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get styling colors for a flood zone pill based on risk level
 */
export function getFloodPillStyle(riskLevel, isSfha) {
  if (riskLevel === 'high' || isSfha) {
    return {
      background: 'rgba(217, 83, 79, 0.12)',
      color: '#9E2A2B',
      border: '1px solid rgba(217, 83, 79, 0.3)'
    };
  }
  if (riskLevel === 'moderate') {
    return {
      background: 'rgba(240, 173, 78, 0.18)',
      color: '#8A5D1A',
      border: '1px solid rgba(240, 173, 78, 0.4)'
    };
  }
  // Minimal risk (Zone X)
  return {
    background: 'rgba(189, 211, 226, 0.3)',
    color: '#34292A',
    border: '1px solid rgba(133, 157, 206, 0.4)'
  };
}

export default function SiteZoningCard({ property, showToast }) {
  const [floodData, setFloodData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const county = property?.parcel_county || property?.county || 'Broward';
  const parcelId = property?.parcel_id || null;
  const lat = property?.lat || null;
  const lng = property?.lng || null;

  const fetchFloodInfo = async (forceRefresh = false) => {
    if (!parcelId && (lat == null || lng == null)) {
      setFloodData(null);
      return;
    }

    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      if (county) params.set('county', county);
      if (parcelId) params.set('parcel_id', parcelId);
      if (lat != null) params.set('lat', String(lat));
      if (lng != null) params.set('lng', String(lng));
      if (forceRefresh) params.set('refresh', '1');

      const res = await fetch(`/api/site/flood?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load flood information (HTTP ${res.status}).`);
      }
      const data = await res.json();
      if (data.unavailable) {
        setError(data.error || 'FEMA flood hazard service is currently unavailable.');
      } else {
        setFloodData(data);
        if (forceRefresh && showToast) {
          showToast('Flood hazard data refreshed from FEMA');
        }
      }
    } catch (err) {
      console.error('Error fetching flood data:', err);
      setError(err.message || 'Unable to retrieve flood zone.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (parcelId || (lat != null && lng != null)) {
      fetchFloodInfo(false);
    } else {
      setFloodData(null);
      setError(null);
    }
  }, [parcelId, county, lat, lng]);

  const pillStyle = floodData
    ? getFloodPillStyle(floodData.riskLevel, floodData.isSfha)
    : { background: 'rgba(52, 41, 42, 0.06)', color: '#34292A', border: '1px solid rgba(52, 41, 42, 0.12)' };

  return (
    <div
      style={{
        backgroundColor: '#FAF8F5',
        border: '1px solid rgba(52, 41, 42, 0.12)',
        borderRadius: '12px',
        padding: '24px 28px',
        marginBottom: '28px',
        boxShadow: '0 4px 20px rgba(52, 41, 42, 0.04)',
        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '22px',
          borderBottom: '1px solid rgba(52, 41, 42, 0.08)',
          paddingBottom: '16px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                fontSize: '24px',
                fontWeight: 600,
                color: 'var(--espresso, #34292A)',
                margin: 0,
                letterSpacing: '-0.01em'
              }}
            >
              Site &amp; zoning
            </h2>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: 'rgba(52, 41, 42, 0.06)',
                color: 'var(--espresso, #34292A)',
                padding: '2px 8px',
                borderRadius: '50px',
                letterSpacing: '0.04em'
              }}
            >
              FEMA NFHL
            </span>
          </div>
          <p
            style={{
              fontSize: '12px',
              color: 'rgba(52, 41, 42, 0.65)',
              margin: '4px 0 0 0'
            }}
          >
            Authoritative FEMA flood hazard determination, municipal zoning, and historic district overlays.
          </p>
        </div>

        {/* Refresh Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => fetchFloodInfo(true)}
            disabled={loading || refreshing}
            style={{
              background: 'none',
              border: '1px solid rgba(52, 41, 42, 0.18)',
              borderRadius: '6px',
              padding: '5px 12px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--espresso, #34292A)',
              cursor: loading || refreshing ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.15s ease'
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                animation: refreshing ? 'spin 1s linear infinite' : 'none'
              }}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshing ? 'Checking...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* FLOOD SECTION */}
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(52, 41, 42, 0.55)',
            marginBottom: '10px'
          }}
        >
          FLOOD HAZARD (FEMA NFHL)
        </div>

        {loading ? (
          <div
            style={{
              padding: '16px',
              backgroundColor: 'rgba(52, 41, 42, 0.03)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'rgba(52, 41, 42, 0.65)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span
              style={{
                width: '12px',
                height: '12px',
                border: '2px solid rgba(52, 41, 42, 0.2)',
                borderTopColor: 'var(--espresso, #34292A)',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'spin 0.8s linear infinite'
              }}
            />
            Checking official FEMA National Flood Hazard Layer...
          </div>
        ) : error ? (
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: 'rgba(217, 83, 79, 0.08)',
              border: '1px solid rgba(217, 83, 79, 0.2)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#843534',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => fetchFloodInfo(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#843534',
                fontWeight: 600,
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: '11px'
              }}
            >
              Retry
            </button>
          </div>
        ) : !parcelId && (lat == null || lng == null) ? (
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: 'rgba(52, 41, 42, 0.03)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'rgba(52, 41, 42, 0.65)'
            }}
          >
            Link this property to a county parcel record or enter coordinates to determine its FEMA flood zone.
          </div>
        ) : floodData ? (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(52, 41, 42, 0.09)',
              borderRadius: '10px',
              padding: '18px 20px'
            }}
          >
            {/* Zone Pill & Plain-English interpretation */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                flexWrap: 'wrap',
                marginBottom: '16px'
              }}
            >
              <div
                style={{
                  ...pillStyle,
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '14px',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap'
                }}
              >
                Zone {floodData.label}
              </div>

              <div style={{ flex: 1, minWidth: '220px' }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    lineHeight: 1.5,
                    color: 'var(--espresso, #34292A)',
                    fontWeight: 500
                  }}
                >
                  {floodData.description}
                </p>
                {floodData.flood_subtype && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'rgba(52, 41, 42, 0.6)',
                      marginTop: '4px'
                    }}
                  >
                    FEMA classification: {floodData.flood_subtype}
                  </div>
                )}
              </div>
            </div>

            {/* Metadata Grid: Panel, Effective Date, Checked At, Links */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '14px',
                paddingTop: '14px',
                borderTop: '1px solid rgba(52, 41, 42, 0.08)',
                fontSize: '12px'
              }}
            >
              <div>
                <span style={{ color: 'rgba(52, 41, 42, 0.55)', display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  FIRM PANEL
                </span>
                <span style={{ fontWeight: 600, color: 'var(--espresso, #34292A)', marginTop: '2px', display: 'inline-block' }}>
                  {floodData.flood_panel || '—'}
                </span>
              </div>

              <div>
                <span style={{ color: 'rgba(52, 41, 42, 0.55)', display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  EFFECTIVE DATE
                </span>
                <span style={{ fontWeight: 600, color: 'var(--espresso, #34292A)', marginTop: '2px', display: 'inline-block' }}>
                  {formatDate(floodData.flood_effective_date)}
                </span>
              </div>

              <div>
                <span style={{ color: 'rgba(52, 41, 42, 0.55)', display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  LAST CHECKED
                </span>
                <span style={{ fontWeight: 600, color: 'var(--espresso, #34292A)', marginTop: '2px', display: 'inline-block' }}>
                  Checked {formatDate(floodData.flood_checked_at)}
                </span>
              </div>

              <div>
                <span style={{ color: 'rgba(52, 41, 42, 0.55)', display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  OFFICIAL DETERMINATION
                </span>
                <a
                  href={`https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(`${property?.address || ''} ${property?.city || ''} FL ${property?.zip || ''}`.trim())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#859DCE',
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '2px'
                  }}
                >
                  FEMA Map Service Center
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Advisory note */}
            <div
              style={{
                marginTop: '14px',
                fontSize: '11px',
                color: 'rgba(52, 41, 42, 0.55)',
                fontStyle: 'italic',
                lineHeight: 1.4
              }}
            >
              Flood zones can change when new maps are adopted. Confirm with the city or an elevation certificate.
            </div>
          </div>
        ) : null}
      </div>

      {/* PLACEHOLDER SECTIONS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          borderTop: '1px solid rgba(52, 41, 42, 0.08)',
          paddingTop: '18px'
        }}
      >
        {/* ZONING */}
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'rgba(52, 41, 42, 0.02)',
            border: '1px dashed rgba(52, 41, 42, 0.15)',
            borderRadius: '8px'
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(52, 41, 42, 0.5)',
              marginBottom: '4px'
            }}
          >
            ZONING
          </div>
          <span style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.45)', fontStyle: 'italic' }}>
            Coming soon
          </span>
        </div>

        {/* HISTORIC DISTRICT */}
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'rgba(52, 41, 42, 0.02)',
            border: '1px dashed rgba(52, 41, 42, 0.15)',
            borderRadius: '8px'
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(52, 41, 42, 0.5)',
              marginBottom: '4px'
            }}
          >
            HISTORIC DISTRICT
          </div>
          <span style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.45)', fontStyle: 'italic' }}>
            Coming soon
          </span>
        </div>

        {/* SETBACKS */}
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'rgba(52, 41, 42, 0.02)',
            border: '1px dashed rgba(52, 41, 42, 0.15)',
            borderRadius: '8px'
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(52, 41, 42, 0.5)',
              marginBottom: '4px'
            }}
          >
            SETBACKS
          </div>
          <span style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.45)', fontStyle: 'italic' }}>
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
