import React, { useState, useEffect } from 'react';
import { getUseCodeLabel, toTitleCase, formatNiceAddress } from './AddressAutocomplete.jsx';

/**
 * Formats currency values
 */
function formatCurrency(val) {
  if (val == null || isNaN(Number(val))) return '—';
  return `$${Math.round(Number(val)).toLocaleString('en-US')}`;
}

/**
 * Formats sale date (month/year)
 */
function formatSaleDate(month, year) {
  if (!year) return '—';
  if (!month) return String(year);
  const mStr = String(month).padStart(2, '0');
  return `${mStr}/${year}`;
}

export default function CountyRecordCard({ property, onPropertyUpdate, showToast }) {
  const [countyData, setCountyData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // "Find county record" modal state
  const [isFindModalOpen, setIsFindModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [linkingParcelId, setLinkingParcelId] = useState(null);

  // Discrepancy updating state
  const [updatingField, setUpdatingField] = useState(null);

  // Fetch full county parcel record if property has parcel_id
  const fetchCountyRecord = async (county, parcelId) => {
    if (!parcelId) {
      setCountyData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/county/parcel?county=${encodeURIComponent(county || 'Broward')}&parcel_id=${encodeURIComponent(parcelId)}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('County record not found on roll.');
        }
        throw new Error(`Failed to load county record (HTTP ${res.status}).`);
      }
      const data = await res.json();
      setCountyData(data);
    } catch (err) {
      console.error('Error fetching county parcel:', err);
      setError(err.message || 'Unable to load county record.');
      setCountyData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (property?.parcel_id) {
      fetchCountyRecord(property.parcel_county || property.county || 'Broward', property.parcel_id);
    } else {
      setCountyData(null);
      setError(null);
    }
  }, [property?.id, property?.parcel_id, property?.parcel_county]);

  // Open "Find county record" modal prefilled with property address + zip
  const handleOpenFindModal = () => {
    const prefill = `${property.address || ''} ${property.zip || ''}`.trim();
    setSearchQuery(prefill);
    setSearchResults([]);
    setSearchError(null);
    setIsFindModalOpen(true);
    if (prefill.length >= 3) {
      executeCountySearch(prefill);
    }
  };

  const executeCountySearch = async (q) => {
    if (!q || q.trim().length < 3) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/county/search?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) {
        throw new Error('Search failed');
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setSearchResults(list);
      if (list.length === 0) {
        setSearchError('No matching county records found. Try searching by house number and street name.');
      }
    } catch (err) {
      setSearchError('Error connecting to county search.');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleLinkRecord = async (match) => {
    setLinkingParcelId(match.parcel_id);
    try {
      const res = await fetch('/api/investor/properties', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: property.id,
          parcel_id: match.parcel_id,
          parcel_county: match.county || 'Broward'
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to link county record.');
      }

      const updated = await res.json();
      if (onPropertyUpdate) {
        onPropertyUpdate(updated);
      }
      if (showToast) {
        showToast('County record linked');
      }
      setIsFindModalOpen(false);
      fetchCountyRecord(match.county || 'Broward', match.parcel_id);
    } catch (err) {
      console.error('Failed to link parcel:', err);
      alert(err.message || 'Error linking county record.');
    } finally {
      setLinkingParcelId(null);
    }
  };

  // Update a single property field to match the county's value
  const handleUseCountyValue = async (field, value, label) => {
    setUpdatingField(field);
    try {
      const payload = {
        id: property.id,
        [field]: value
      };

      const res = await fetch('/api/investor/properties', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update property.');
      }

      const updated = await res.json();
      if (onPropertyUpdate) {
        onPropertyUpdate(updated);
      }
      if (showToast) {
        showToast(`Updated ${label} to county value`);
      }
    } catch (err) {
      console.error('Failed to update value:', err);
      if (showToast) {
        showToast('Failed to update value');
      }
    } finally {
      setUpdatingField(null);
    }
  };

  // Discrepancy checks
  const discrepancies = [];
  if (countyData) {
    // Living area (sqft)
    if (
      countyData.living_sqft &&
      property.sqft &&
      Number(countyData.living_sqft) !== Number(property.sqft)
    ) {
      discrepancies.push({
        field: 'sqft',
        label: 'living area',
        countyValue: countyData.living_sqft,
        text: `County says ${Number(countyData.living_sqft).toLocaleString()} sf (you entered ${Number(property.sqft).toLocaleString()})`
      });
    }

    // Lot area (lot_sqft)
    if (
      countyData.land_sqft &&
      property.lot_sqft &&
      Number(countyData.land_sqft) !== Number(property.lot_sqft)
    ) {
      discrepancies.push({
        field: 'lot_sqft',
        label: 'lot size',
        countyValue: countyData.land_sqft,
        text: `County says ${Number(countyData.land_sqft).toLocaleString()} sf lot (you entered ${Number(property.lot_sqft).toLocaleString()})`
      });
    }

    // Year built
    if (
      countyData.year_built &&
      property.year_built &&
      Number(countyData.year_built) !== Number(property.year_built)
    ) {
      discrepancies.push({
        field: 'year_built',
        label: 'year built',
        countyValue: countyData.year_built,
        text: `County says built in ${countyData.year_built} (you entered ${property.year_built})`
      });
    }
  }

  // If property has no parcel_id linked:
  if (!property.parcel_id) {
    return (
      <div
        id="county-record-card"
        className="investor-county-card"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(52, 41, 42, 0.1)',
          borderRadius: '12px',
          padding: '24px 28px',
          boxShadow: '0 4px 16px rgba(52, 41, 42, 0.03)',
          marginBottom: '36px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3
              style={{
                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                fontSize: '22px',
                fontWeight: 400,
                color: 'var(--espresso, #34292A)',
                margin: '0 0 4px 0'
              }}
            >
              County record
            </h3>
            <span
              style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '11.5px',
                color: 'rgba(52, 41, 42, 0.55)',
                letterSpacing: '0.02em'
              }}
            >
              {property?.parcel_county || property?.county || 'Broward'} County Property Appraiser · 2026 roll
            </span>
          </div>

          <button
            type="button"
            onClick={handleOpenFindModal}
            className="investor-search-btn"
            style={{
              padding: '9px 18px',
              fontSize: '11px',
              letterSpacing: '0.08em',
              fontWeight: 600,
              backgroundColor: 'var(--secondary-color, #41101B)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            FIND COUNTY RECORD
          </button>
        </div>

        <div
          style={{
            backgroundColor: '#FAF8F5',
            borderRadius: '8px',
            padding: '16px 18px',
            border: '1px dashed rgba(52, 41, 42, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px', opacity: 0.6 }}>🏛️</span>
            <span
              style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '13px',
                color: 'rgba(52, 41, 42, 0.7)'
              }}
            >
              No official county parcel linked to this property yet. Link it to see assessment values, land use, and historical sales.
            </span>
          </div>
          <button
            type="button"
            onClick={handleOpenFindModal}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--secondary-color, #41101B)',
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '12.5px',
              fontWeight: 600,
              textDecoration: 'underline',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Find match →
          </button>
        </div>

        {/* Find County Record Modal */}
        {isFindModalOpen && renderFindModal()}
      </div>
    );
  }

  // Year built display string
  const yearBuiltDisplay = (() => {
    if (!countyData?.year_built) return '—';
    if (countyData.eff_year_built && countyData.eff_year_built !== countyData.year_built) {
      return `${countyData.year_built} (effective ${countyData.eff_year_built})`;
    }
    return String(countyData.year_built);
  })();

  function renderFindModal() {
    return (
      <div
        className="investor-panel-overlay"
        onClick={() => setIsFindModalOpen(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '620px',
            boxShadow: '0 20px 48px rgba(30, 21, 9, 0.25)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh'
          }}
        >
          {/* Modal Header */}
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(52, 41, 42, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#FAF8F5'
            }}
          >
            <div>
              <h3
                style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '22px',
                  color: 'var(--espresso, #34292A)',
                  margin: 0
                }}
              >
                Find County Record
              </h3>
              <p
                style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '12px',
                  color: 'rgba(52, 41, 42, 0.6)',
                  margin: '4px 0 0 0'
                }}
              >
                Search Broward County residential property roll by address or folio
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsFindModalOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                lineHeight: 1,
                cursor: 'pointer',
                color: 'rgba(52, 41, 42, 0.4)'
              }}
            >
              ×
            </button>
          </div>

          {/* Search Input */}
          <div style={{ padding: '20px 24px 12px' }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeCountySearch(searchQuery);
              }}
              style={{ display: 'flex', gap: '10px' }}
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. 924 SW 15th Ter, Fort Lauderdale"
                className="investor-form-input"
                style={{ flex: 1 }}
                autoFocus
              />
              <button
                type="submit"
                disabled={searchLoading}
                className="investor-search-btn"
                style={{
                  padding: '10px 20px',
                  fontSize: '11px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap'
                }}
              >
                {searchLoading ? 'SEARCHING...' : 'SEARCH'}
              </button>
            </form>
          </div>

          {/* Results List */}
          <div style={{ padding: '0 24px 24px', overflowY: 'auto', flex: 1 }}>
            {searchLoading && (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(52, 41, 42, 0.6)', fontSize: '13px' }}>
                Searching county records...
              </div>
            )}

            {searchError && !searchLoading && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(52, 41, 42, 0.65)', fontSize: '13px' }}>
                {searchError}
              </div>
            )}

            {!searchLoading && searchResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                {searchResults.map((match) => {
                  const isLinking = linkingParcelId === match.parcel_id;
                  const niceAddr = formatNiceAddress(match.address);
                  const cityZip = `${toTitleCase(match.city)}, FL ${match.zip || ''}`.trim();
                  const typeLabel = getUseCodeLabel(match.use_code);
                  const sqftStr = match.living_sqft ? `${Number(match.living_sqft).toLocaleString()} sf` : '—';
                  const builtStr = match.year_built ? `Built ${match.year_built}` : '';

                  return (
                    <div
                      key={match.parcel_id}
                      style={{
                        border: '1px solid rgba(52, 41, 42, 0.12)',
                        borderRadius: '8px',
                        padding: '14px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '14px',
                        backgroundColor: '#ffffff',
                        transition: 'border-color 0.15s ease'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--espresso, #34292A)' }}>
                            {niceAddr}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              letterSpacing: '0.04em',
                              color: 'var(--secondary-color, #41101B)',
                              backgroundColor: 'rgba(189, 211, 226, 0.28)',
                              border: '1px solid rgba(133, 157, 206, 0.35)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {match.county || 'Broward'}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.65)' }}>
                          {cityZip} · <span style={{ fontWeight: 500 }}>{typeLabel}</span> · {sqftStr} {builtStr ? `· ${builtStr}` : ''}
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.45)', marginTop: '4px', fontFamily: 'monospace' }}>
                          FOLIO: {match.parcel_id}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleLinkRecord(match)}
                        disabled={isLinking}
                        style={{
                          padding: '8px 16px',
                          fontSize: '11px',
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          backgroundColor: 'var(--secondary-color, #41101B)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: isLinking ? 'wait' : 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {isLinking ? 'LINKING...' : 'LINK RECORD'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="county-record-card"
      className="investor-county-card"
      style={{
        background: '#ffffff',
        border: '1px solid rgba(52, 41, 42, 0.1)',
        borderRadius: '12px',
        padding: '26px 28px',
        boxShadow: '0 4px 16px rgba(52, 41, 42, 0.03)',
        marginBottom: '36px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}
    >
      {/* 1. Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: '22px',
              fontWeight: 400,
              color: 'var(--espresso, #34292A)',
              margin: '0 0 4px 0'
            }}
          >
            County record
          </h3>
          <span
            style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '11.5px',
              color: 'rgba(52, 41, 42, 0.55)',
              letterSpacing: '0.02em'
            }}
          >
            {countyData?.county || property.parcel_county || 'Broward'} County Property Appraiser · {countyData?.roll_year || 2026} roll
          </span>
        </div>

        <button
          type="button"
          onClick={handleOpenFindModal}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(52, 41, 42, 0.55)',
            fontSize: '11.5px',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontWeight: 500,
            textDecoration: 'underline',
            cursor: 'pointer',
            padding: 0
          }}
        >
          Change folio / re-link
        </button>
      </div>

      {loading && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(52, 41, 42, 0.6)', fontSize: '13px' }}>
          Loading county data...
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: '16px', backgroundColor: '#FFF7F7', borderRadius: '8px', color: '#B03823', fontSize: '12.5px' }}>
          {error}
        </div>
      )}

      {!loading && countyData && (
        <>
          {/* 2. Discrepancy Note (Quiet Banner with "Use county value" link) */}
          {discrepancies.length > 0 && (
            <div
              style={{
                backgroundColor: 'rgba(189, 211, 226, 0.18)',
                border: '1px solid rgba(133, 157, 206, 0.35)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              {discrepancies.map((disc) => (
                <div
                  key={disc.field}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: '12.5px',
                    color: 'var(--espresso, #34292A)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#2D5584', fontWeight: 600 }}>ℹ</span>
                    <span>{disc.text}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUseCountyValue(disc.field, disc.countyValue, disc.label)}
                    disabled={updatingField === disc.field}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--secondary-color, #41101B)',
                      fontWeight: 600,
                      fontSize: '12px',
                      textDecoration: 'underline',
                      cursor: updatingField === disc.field ? 'wait' : 'pointer',
                      padding: 0
                    }}
                  >
                    {updatingField === disc.field ? 'Updating...' : 'Use county value'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 3. Small Labeled Values Grid: 6 tiles */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '16px',
              padding: '16px 0',
              borderTop: '1px solid rgba(52, 41, 42, 0.08)',
              borderBottom: '1px solid rgba(52, 41, 42, 0.08)'
            }}
          >
            {/* FOLIO */}
            <div>
              <div className="investor-stat-label" style={{ marginBottom: '4px' }}>
                FOLIO
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '14.5px',
                  fontWeight: 600,
                  color: 'var(--espresso, #1E1509)',
                  letterSpacing: '0.02em'
                }}
              >
                {countyData.parcel_id || '—'}
              </div>
            </div>

            {/* LAND USE */}
            <div>
              <div className="investor-stat-label" style={{ marginBottom: '4px' }}>
                LAND USE
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--espresso, #1E1509)'
                }}
              >
                {getUseCodeLabel(countyData.use_code)}
              </div>
            </div>

            {/* LIVING AREA */}
            <div>
              <div className="investor-stat-label" style={{ marginBottom: '4px' }}>
                LIVING AREA
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '14.5px',
                  fontWeight: 600,
                  color: 'var(--espresso, #1E1509)'
                }}
              >
                {countyData.living_sqft ? `${Number(countyData.living_sqft).toLocaleString()} sf` : '—'}
              </div>
            </div>

            {/* LOT */}
            <div>
              <div className="investor-stat-label" style={{ marginBottom: '4px' }}>
                LOT
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '14.5px',
                  fontWeight: 600,
                  color: 'var(--espresso, #1E1509)'
                }}
              >
                {countyData.land_sqft ? `${Number(countyData.land_sqft).toLocaleString()} sf` : '—'}
              </div>
            </div>

            {/* YEAR BUILT */}
            <div>
              <div className="investor-stat-label" style={{ marginBottom: '4px' }}>
                YEAR BUILT
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--espresso, #1E1509)'
                }}
              >
                {yearBuiltDisplay}
              </div>
            </div>

            {/* COUNTY MARKET VALUE */}
            <div>
              <div className="investor-stat-label" style={{ marginBottom: '4px' }}>
                COUNTY MARKET VALUE
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: 'var(--espresso, #1E1509)'
                }}
              >
                {formatCurrency(countyData.just_value)}
              </div>
            </div>
          </div>

          {/* 4. Sales on record list */}
          <div>
            <div
              style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(52, 41, 42, 0.6)',
                marginBottom: '12px'
              }}
            >
              Sales on record
            </div>

            {countyData.sales && countyData.sales.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {countyData.sales.map((sale) => {
                  const dateStr = formatSaleDate(sale.sale_month, sale.sale_year);
                  const priceStr = formatCurrency(sale.sale_price);

                  return (
                    <div
                      key={sale.id || `${sale.sale_year}-${sale.sale_month}-${sale.sale_price}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        backgroundColor: '#FAF8F5',
                        borderRadius: '8px',
                        border: '1px solid rgba(52, 41, 42, 0.06)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--espresso, #1E1509)',
                            minWidth: '70px'
                          }}
                        >
                          {dateStr}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                            fontSize: '16px',
                            fontWeight: 600,
                            color: 'var(--espresso, #34292A)'
                          }}
                        >
                          {priceStr}
                        </span>
                      </div>

                      {/* Pill */}
                      <div>
                        {sale.is_market ? (
                          <span
                            style={{
                              backgroundColor: '#EBF5ED',
                              color: '#1E6B37',
                              border: '1px solid rgba(30, 107, 55, 0.25)',
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 600,
                              letterSpacing: '0.02em'
                            }}
                          >
                            Market sale
                          </span>
                        ) : sale.is_distressed ? (
                          <span
                            style={{
                              backgroundColor: '#FDF0ED',
                              color: '#B03823',
                              border: '1px solid rgba(176, 56, 35, 0.25)',
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 600,
                              letterSpacing: '0.02em'
                            }}
                          >
                            Distressed
                          </span>
                        ) : (
                          <span
                            title={sale.label || sale.qual_label || `Qualification code ${sale.qual_code}`}
                            style={{
                              backgroundColor: 'rgba(52, 41, 42, 0.06)',
                              color: 'rgba(52, 41, 42, 0.75)',
                              border: '1px solid rgba(52, 41, 42, 0.12)',
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 500,
                              cursor: 'help'
                            }}
                          >
                            Code {sale.qual_code || '—'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '13px',
                  color: 'rgba(52, 41, 42, 0.55)',
                  fontStyle: 'italic',
                  padding: '6px 0'
                }}
              >
                No sales recorded in 2025–2026.
              </div>
            )}
          </div>
        </>
      )}

      {/* Find County Record Modal */}
      {isFindModalOpen && renderFindModal()}
    </div>
  );
}
