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

export default function SiteZoningCard({ property, onPropertyUpdate, showToast, onSiteDataChange }) {
  // Flood state
  const [floodData, setFloodData] = useState(null);
  const [floodLoading, setFloodLoading] = useState(false);
  const [floodRefreshing, setFloodRefreshing] = useState(false);
  const [floodError, setFloodError] = useState(null);

  // Zoning & Historic state
  const [zoningData, setZoningData] = useState(null);
  const [zoningLoading, setZoningLoading] = useState(false);
  const [zoningRefreshing, setZoningRefreshing] = useState(false);
  const [_zoningError, setZoningError] = useState(null);

  // Manual zoning entry input
  const [manualCode, setManualCode] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const county = property?.parcel_county || property?.county || 'Broward';
  const parcelId = property?.parcel_id || null;
  const lat = property?.lat || null;
  const lng = property?.lng || null;

  // 1. Fetch Flood Hazard Info
  const fetchFloodInfo = async (forceRefresh = false) => {
    if (!parcelId && (lat == null || lng == null)) {
      setFloodData(null);
      return;
    }

    if (forceRefresh) {
      setFloodRefreshing(true);
    } else {
      setFloodLoading(true);
    }
    setFloodError(null);

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
        setFloodError(data.error || 'FEMA flood hazard service is currently unavailable.');
      } else {
        setFloodData(data);
        if (forceRefresh && showToast) {
          showToast('Flood hazard data refreshed from FEMA');
        }
      }
    } catch (err) {
      console.error('Error fetching flood data:', err);
      setFloodError(err.message || 'Unable to retrieve flood zone.');
    } finally {
      setFloodLoading(false);
      setFloodRefreshing(false);
    }
  };

  // 2. Fetch Zoning & Historic Info
  const fetchZoningInfo = async (forceRefresh = false) => {
    if (!parcelId) {
      setZoningData(null);
      return;
    }

    if (forceRefresh) {
      setZoningRefreshing(true);
    } else {
      setZoningLoading(true);
    }
    setZoningError(null);

    try {
      const params = new URLSearchParams();
      params.set('county', county);
      params.set('parcel_id', parcelId);
      if (forceRefresh) params.set('refresh', '1');

      const res = await fetch(`/api/site/zoning?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load zoning information (HTTP ${res.status}).`);
      }
      const data = await res.json();
      setZoningData(data);
      if (data.zoning_code) {
        setManualCode(data.zoning_code);
      }
      if (forceRefresh && showToast) {
        showToast('Zoning & historic records refreshed');
      }
    } catch (err) {
      console.error('Error fetching zoning data:', err);
      setZoningError(err.message || 'Unable to retrieve zoning records.');
    } finally {
      setZoningLoading(false);
      setZoningRefreshing(false);
    }
  };

  // Save manual zoning code
  const handleSaveManualZoning = async (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    setSavingManual(true);
    try {
      const res = await fetch('/api/site/zoning', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          county,
          parcel_id: parcelId,
          zoning_code: manualCode.trim().toUpperCase()
        })
      });

      if (!res.ok) {
        throw new Error(`Failed to save zoning code (HTTP ${res.status}).`);
      }

      const updated = await res.json();
      setZoningData(prev => ({
        ...prev,
        zoning_code: updated.zoning_code,
        zoning_source: 'manual',
        zoning_checked_at: updated.zoning_checked_at
      }));
      setShowManualInput(false);
      if (showToast) {
        showToast(`Saved zoning code: ${updated.zoning_code}`);
      }
      if (onPropertyUpdate && property) {
        onPropertyUpdate({ ...property, zoning_code: updated.zoning_code });
      }
    } catch (err) {
      console.error('Error saving manual zoning:', err);
      if (showToast) {
        showToast(err.message || 'Error saving zoning code');
      }
    } finally {
      setSavingManual(false);
    }
  };

  useEffect(() => {
    if (parcelId || (lat != null && lng != null)) {
      fetchFloodInfo(false);
      fetchZoningInfo(false);
    } else {
      setFloodData(null);
      setZoningData(null);
      setFloodError(null);
      setZoningError(null);
    }
  }, [parcelId, county, lat, lng]);

  useEffect(() => {
    if (onSiteDataChange) {
      onSiteDataChange({ floodData, zoningData });
    }
  }, [floodData, zoningData]);

  const floodPillStyle = floodData
    ? getFloodPillStyle(floodData.riskLevel, floodData.isSfha)
    : { background: 'rgba(52, 41, 42, 0.06)', color: '#34292A', border: '1px solid rgba(52, 41, 42, 0.12)' };

  const municipality = zoningData?.municipality || property?.city || 'Unknown';
  const hasZoningCode = !!zoningData?.zoning_code;
  const isCityGis = zoningData?.zoning_source === 'city_gis';
  const isManual = zoningData?.zoning_source === 'manual';

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
            {municipality && municipality !== 'Unknown' && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: 'rgba(52, 41, 42, 0.07)',
                  color: 'var(--espresso, #34292A)',
                  padding: '3px 10px',
                  borderRadius: '50px',
                  letterSpacing: '0.04em'
                }}
              >
                {municipality}
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: '12px',
              color: 'rgba(52, 41, 42, 0.65)',
              margin: '4px 0 0 0'
            }}
          >
            Authoritative FEMA flood hazard determination, municipal zoning, and historic preservation status.
          </p>
        </div>

        {/* Global Refresh Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => {
              fetchFloodInfo(true);
              fetchZoningInfo(true);
            }}
            disabled={floodLoading || floodRefreshing || zoningLoading || zoningRefreshing}
            style={{
              background: 'none',
              border: '1px solid rgba(52, 41, 42, 0.18)',
              borderRadius: '6px',
              padding: '5px 12px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--espresso, #34292A)',
              cursor: floodLoading || floodRefreshing || zoningLoading || zoningRefreshing ? 'wait' : 'pointer',
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
                animation: floodRefreshing || zoningRefreshing ? 'spin 1s linear infinite' : 'none'
              }}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {floodRefreshing || zoningRefreshing ? 'Checking...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* 1. FLOOD SECTION */}
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

        {floodLoading ? (
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
        ) : floodError ? (
          <div
            style={{
              padding: '12px 16px',
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
            <span>{floodError}</span>
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
                  ...floodPillStyle,
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

            {/* Metadata Grid */}
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

            <div
              style={{
                marginTop: '12px',
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

      {/* 2. ZONING SECTION */}
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
          MUNICIPAL ZONING
        </div>

        {zoningLoading ? (
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
            Querying {municipality} zoning district...
          </div>
        ) : hasZoningCode ? (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(52, 41, 42, 0.09)',
              borderRadius: '10px',
              padding: '18px 20px'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    backgroundColor: 'rgba(52, 41, 42, 0.08)',
                    color: 'var(--espresso, #34292A)',
                    border: '1px solid rgba(52, 41, 42, 0.2)',
                    padding: '5px 14px',
                    borderRadius: '6px',
                    fontWeight: 800,
                    fontSize: '15px',
                    letterSpacing: '0.04em'
                  }}
                >
                  {zoningData.zoning_code}
                </span>

                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: isCityGis ? 'rgba(133, 157, 206, 0.18)' : 'rgba(240, 173, 78, 0.18)',
                    color: isCityGis ? '#2A4374' : '#8A5D1A',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    letterSpacing: '0.04em'
                  }}
                >
                  {isCityGis ? 'City GIS' : 'Entered by you'}
                </span>

                <button
                  type="button"
                  onClick={() => setShowManualInput(!showManualInput)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(52, 41, 42, 0.55)',
                    fontSize: '11px',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: '2px 4px'
                  }}
                >
                  {showManualInput ? 'Cancel' : 'Edit code'}
                </button>
              </div>

              {/* Links */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px' }}>
                {zoningData.zoning_map_url && (
                  <a
                    href={zoningData.zoning_map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#859DCE', fontWeight: 600, textDecoration: 'none' }}
                  >
                    Open city zoning map ↗
                  </a>
                )}
                {zoningData.code_url && (
                  <a
                    href={zoningData.code_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#859DCE', fontWeight: 600, textDecoration: 'none' }}
                  >
                    Online zoning code ↗
                  </a>
                )}
              </div>
            </div>

            {/* Description */}
            {zoningData.zoning_desc && (
              <p
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '13px',
                  color: 'var(--espresso, #34292A)',
                  fontWeight: 500,
                  lineHeight: 1.4
                }}
              >
                {zoningData.zoning_desc}
              </p>
            )}

            {/* Manual edit form if toggled */}
            {showManualInput && (
              <form
                onSubmit={handleSaveManualZoning}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '10px',
                  paddingTop: '12px',
                  borderTop: '1px solid rgba(52, 41, 42, 0.08)'
                }}
              >
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  placeholder="Enter zoning code (e.g. RS-5)"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(52, 41, 42, 0.25)',
                    fontSize: '12px',
                    fontWeight: 600,
                    width: '180px'
                  }}
                />
                <button
                  type="submit"
                  disabled={savingManual}
                  style={{
                    backgroundColor: 'var(--secondary-color, #41101B)',
                    color: '#FAF8F5',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: savingManual ? 'wait' : 'pointer'
                  }}
                >
                  {savingManual ? 'Saving...' : 'Save'}
                </button>
              </form>
            )}

            <div
              style={{
                fontSize: '11px',
                color: 'rgba(52, 41, 42, 0.55)',
                paddingTop: '10px',
                borderTop: '1px solid rgba(52, 41, 42, 0.06)'
              }}
            >
              Checked {formatDate(zoningData.zoning_checked_at)}
            </div>
          </div>
        ) : (
          /* When city has no online zoning layer */
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px dashed rgba(52, 41, 42, 0.18)',
              borderRadius: '10px',
              padding: '16px 20px',
              fontSize: '12px'
            }}
          >
            <p style={{ margin: '0 0 10px 0', color: 'rgba(52, 41, 42, 0.8)', lineHeight: 1.5 }}>
              Zoning isn't published online for <strong>{municipality}</strong>.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {zoningData?.zoning_map_url && (
                <a
                  href={zoningData.zoning_map_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#859DCE', fontWeight: 600, textDecoration: 'none' }}
                >
                  Open city zoning map ↗
                </a>
              )}
              {zoningData?.code_url && (
                <a
                  href={zoningData.code_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#859DCE', fontWeight: 600, textDecoration: 'none' }}
                >
                  Online zoning code ↗
                </a>
              )}
            </div>

            {/* Manual entry inline form */}
            <form onSubmit={handleSaveManualZoning} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                placeholder={`Enter ${municipality} zoning code`}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(52, 41, 42, 0.25)',
                  fontSize: '12px',
                  fontWeight: 600,
                  width: '210px'
                }}
              />
              <button
                type="submit"
                disabled={savingManual || !manualCode.trim()}
                style={{
                  backgroundColor: 'var(--secondary-color, #41101B)',
                  color: '#FAF8F5',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: savingManual || !manualCode.trim() ? 'default' : 'pointer',
                  opacity: !manualCode.trim() ? 0.6 : 1
                }}
              >
                {savingManual ? 'Saving...' : 'Save code'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* 3. HISTORIC STATUS */}
      <div style={{ marginBottom: '20px' }}>
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
          HISTORIC STATUS
        </div>

        {zoningLoading ? (
          <div style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.65)' }}>Checking historic status...</div>
        ) : zoningData?.historic_district || zoningData?.historic_site ? (
          /* Inside historic district or designated site */
          <div
            style={{
              padding: '14px 18px',
              backgroundColor: 'rgba(240, 173, 78, 0.14)',
              border: '1px solid rgba(240, 173, 78, 0.35)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#8A5D1A',
              lineHeight: 1.5,
              fontWeight: 500
            }}
          >
            <strong>
              In the {zoningData.historic_district || 'designated'} historic district.
            </strong>{' '}
            Demolition and exterior changes need city historic approval — check before planning a demo.
          </div>
        ) : zoningData?.has_historic_layer ? (
          /* City has a historic layer, but parcel is not in it */
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(52, 41, 42, 0.08)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--espresso, #34292A)'
            }}
          >
            Not in a mapped historic district.
          </div>
        ) : (
          /* City has no online historic layer */
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(52, 41, 42, 0.03)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'rgba(52, 41, 42, 0.7)'
            }}
          >
            Historic status isn't published online for {municipality} — check with the city.
          </div>
        )}
      </div>

      {/* 4. OVERLAYS (if any) */}
      {zoningData?.overlays && zoningData.overlays.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
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
            SPECIAL OVERLAYS
          </div>

          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(52, 41, 42, 0.1)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--espresso, #34292A)'
            }}
          >
            {zoningData.overlays.map((ov, idx) => (
              <div key={idx} style={{ marginBottom: idx < zoningData.overlays.length - 1 ? '6px' : 0 }}>
                <strong>{ov}:</strong> Additional design rules may apply.
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer Footer */}
      <div
        style={{
          borderTop: '1px solid rgba(52, 41, 42, 0.08)',
          paddingTop: '14px',
          fontSize: '11px',
          color: 'rgba(52, 41, 42, 0.5)',
          fontStyle: 'italic',
          lineHeight: 1.4
        }}
      >
        Zoning and historic data come from city GIS and may not reflect recent changes, variances or pending applications. Confirm with the city before buying.
      </div>
    </div>
  );
}
