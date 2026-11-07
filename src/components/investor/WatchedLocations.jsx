import React, { useState, useEffect, useCallback } from 'react';
import MarketChart from './MarketChart.jsx';

/**
 * Individual Watched Location Card
 */
function WatchedLocationCard({
  location,
  onRemove,
  onOpenZipSearch
}) {
  const [propertyType, setPropertyType] = useState('single_family'); // 'single_family' | 'condo'
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const county = location.county || 'Broward';
  const zip = location.zip;

  // Fetch market trends for this location and selected property type
  useEffect(() => {
    let isMounted = true;
    async function fetchTrends() {
      if (!zip) return;
      setLoading(true);
      setError(null);
      try {
        const url = `/api/county/market?county=${encodeURIComponent(county)}&zip=${encodeURIComponent(zip)}&type=${encodeURIComponent(propertyType)}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error('Failed to load market data');
        }
        const data = await res.json();
        if (isMounted) {
          setMarketData(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Error');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchTrends();
    return () => { isMounted = false; };
  }, [county, zip, propertyType]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onRemove(location.id);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const summary = marketData?.summary || {};
  const monthly = marketData?.monthly || [];

  return (
    <div
      className="investor-watched-location-card"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid rgba(52, 41, 42, 0.1)',
        borderRadius: '12px',
        padding: '20px 22px',
        boxShadow: '0 4px 16px rgba(52, 41, 42, 0.02)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '14px',
        transition: 'all 0.15s ease'
      }}
    >
      {/* Header */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div>
            <h4
              style={{
                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                fontSize: '20px',
                fontWeight: 400,
                color: 'var(--espresso, #34292A)',
                margin: '0 0 4px 0',
                letterSpacing: '-0.01em'
              }}
            >
              {location.name || `ZIP ${zip}`}
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  color: 'rgba(52, 41, 42, 0.75)'
                }}
              >
                ZIP {zip}
              </span>
              <span style={{ fontSize: '10px', color: 'rgba(52, 41, 42, 0.35)' }}>•</span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: 'var(--secondary-color, #41101B)',
                  backgroundColor: 'rgba(189, 211, 226, 0.28)',
                  border: '1px solid rgba(133, 157, 206, 0.35)',
                  padding: '1px 6px',
                  borderRadius: '4px'
                }}
              >
                {county}
              </span>
            </div>
          </div>

          {/* Property Type Toggle (SF vs Condo) */}
          <div
            style={{
              display: 'inline-flex',
              backgroundColor: '#FAF8F5',
              padding: '2px',
              borderRadius: '6px',
              border: '1px solid rgba(52, 41, 42, 0.08)'
            }}
          >
            <button
              type="button"
              onClick={() => setPropertyType('single_family')}
              style={{
                background: propertyType === 'single_family' ? '#ffffff' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '10.5px',
                fontWeight: 600,
                color: propertyType === 'single_family' ? 'var(--espresso, #34292A)' : 'rgba(52, 41, 42, 0.5)',
                boxShadow: propertyType === 'single_family' ? '0 1px 3px rgba(52, 41, 42, 0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.1s ease'
              }}
            >
              Single-family
            </button>
            <button
              type="button"
              onClick={() => setPropertyType('condo')}
              style={{
                background: propertyType === 'condo' ? '#ffffff' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '10.5px',
                fontWeight: 600,
                color: propertyType === 'condo' ? 'var(--espresso, #34292A)' : 'rgba(52, 41, 42, 0.5)',
                boxShadow: propertyType === 'condo' ? '0 1px 3px rgba(52, 41, 42, 0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.1s ease'
              }}
            >
              Condo
            </button>
          </div>
        </div>

        {/* Sparkline */}
        <div style={{ marginTop: '14px', marginBottom: '8px' }}>
          {loading ? (
            <div
              style={{
                height: '48px',
                backgroundColor: 'rgba(52, 41, 42, 0.03)',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                color: 'rgba(52, 41, 42, 0.4)'
              }}
            >
              Loading trend...
            </div>
          ) : error ? (
            <div style={{ height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#B03823' }}>
              Data unavailable
            </div>
          ) : (
            <MarketChart
              monthly={monthly}
              isSparkline={true}
              height={48}
              accentColor="#859DCE"
              primaryColor="#34292A"
            />
          )}
        </div>

        {/* Three Headline Stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            backgroundColor: '#FAF8F5',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(52, 41, 42, 0.05)',
            textAlign: 'center'
          }}
        >
          {/* Median $/SF */}
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase' }}>
              MEDIAN $/SF
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--espresso, #34292A)', marginTop: '2px', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
              {summary.median_ppsf_last_6m != null ? `$${summary.median_ppsf_last_6m}` : '—'}
            </div>
          </div>

          {/* 6-Mo Change */}
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase' }}>
              6-MO CHANGE
            </div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 600,
                marginTop: '2px',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                color: summary.ppsf_change_pct != null
                  ? (summary.ppsf_change_pct > 0 ? '#2E6B47' : summary.ppsf_change_pct < 0 ? '#9E3A24' : 'var(--espresso, #34292A)')
                  : 'rgba(52, 41, 42, 0.45)'
              }}
            >
              {summary.ppsf_change_pct != null
                ? `${summary.ppsf_change_pct > 0 ? '+' : ''}${summary.ppsf_change_pct}%`
                : '—'}
            </div>
          </div>

          {/* Sales 12 Mo */}
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase' }}>
              SALES (12 MO)
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--espresso, #34292A)', marginTop: '2px', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
              {summary.sales_last_12m != null ? summary.sales_last_12m.toLocaleString() : '—'}
            </div>
          </div>
        </div>

        {/* Distressed sub-line */}
        <div
          style={{
            fontSize: '11px',
            color: 'rgba(52, 41, 42, 0.55)',
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>
            Distressed: {summary.distressed_share_pct != null ? `${summary.distressed_share_pct}% of sales` : '—'}
          </span>
          {onOpenZipSearch && (
            <button
              type="button"
              onClick={() => onOpenZipSearch(zip)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '11px',
                color: 'var(--secondary-color, #41101B)',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Search ZIP →
            </button>
          )}
        </div>
      </div>

      {/* Remove Location Confirmation Footer */}
      <div
        style={{
          borderTop: '1px solid rgba(52, 41, 42, 0.06)',
          paddingTop: '8px',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center'
        }}
      >
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: '11px',
              color: 'rgba(52, 41, 42, 0.45)',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Remove location
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
            <span style={{ color: 'rgba(52, 41, 42, 0.7)' }}>Remove?</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '11px',
                color: '#B03823',
                fontWeight: 600,
                cursor: isDeleting ? 'wait' : 'pointer',
                textDecoration: 'underline'
              }}
            >
              {isDeleting ? 'Removing...' : 'Yes, remove'}
            </button>
            <span style={{ color: 'rgba(52, 41, 42, 0.3)' }}>·</span>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '11px',
                color: 'rgba(52, 41, 42, 0.55)',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * WatchedLocations Section Component
 */
export default function WatchedLocations({
  showToast,
  onSelectZip
}) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // Form State
  const [zipInput, setZipInput] = useState('');
  const [countyInput, setCountyInput] = useState('Broward');
  const [nameInput, setNameInput] = useState('');
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Load locations
  const fetchLocations = useCallback(async () => {
    try {
      const res = await fetch('/api/investor/locations');
      if (res.ok) {
        const data = await res.json();
        setLocations(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load watched locations:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Handle Add Form Submission
  const handleAddLocation = async (e) => {
    e.preventDefault();
    const cleanZip = zipInput.trim();
    if (!/^\d{5}$/.test(cleanZip)) {
      setFormError('Please enter a valid 5-digit Florida ZIP code.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/api/investor/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zip: cleanZip,
          county: countyInput,
          name: nameInput.trim() || undefined
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save location');
      }

      const created = await res.json();
      setLocations(prev => {
        if (prev.some(loc => loc.id === created.id)) return prev;
        return [...prev, created];
      });

      if (showToast) {
        showToast(`Watching ZIP ${cleanZip}`);
      }

      // Reset form
      setZipInput('');
      setNameInput('');
      setIsAdding(false);
    } catch (err) {
      setFormError(err.message || 'Error saving location.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Location Removal
  const handleRemoveLocation = async (id) => {
    try {
      const res = await fetch(`/api/investor/locations?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setLocations(prev => prev.filter(l => l.id !== id));
        if (showToast) {
          showToast('Location removed');
        }
      }
    } catch (err) {
      console.error('Failed to remove location:', err);
      if (showToast) {
        showToast('Failed to remove location');
      }
    }
  };

  return (
    <section style={{ marginTop: '54px', marginBottom: '40px' }}>
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: 'clamp(28px, 3.4vw, 36px)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              color: 'var(--espresso, #34292A)',
              margin: '0 0 6px 0'
            }}
          >
            Locations you're watching
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '13px',
              color: 'rgba(52, 41, 42, 0.65)',
              margin: 0
            }}
          >
            Track local price-per-square-foot dynamics, market velocity, and distress levels across your target ZIP codes.
          </p>
        </div>

        {/* + ADD A LOCATION Button */}
        {!isAdding && (
          <button
            type="button"
            onClick={() => { setIsAdding(true); setFormError(null); }}
            className="investor-search-btn"
            style={{
              padding: '10px 18px',
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
            + ADD A LOCATION
          </button>
        )}
      </div>

      {/* Inline Add Form */}
      {isAdding && (
        <form
          onSubmit={handleAddLocation}
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgba(52, 41, 42, 0.12)',
            borderRadius: '12px',
            padding: '20px 24px',
            marginBottom: '28px',
            boxShadow: '0 8px 24px rgba(52, 41, 42, 0.04)',
            maxWidth: '680px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4
              style={{
                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                fontSize: '18px',
                fontWeight: 500,
                color: 'var(--espresso, #34292A)',
                margin: 0
              }}
            >
              Watch a new ZIP code
            </h4>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: 'rgba(52, 41, 42, 0.4)',
                padding: '0 4px'
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '14px',
              marginBottom: '16px'
            }}
          >
            {/* ZIP Code */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'rgba(52, 41, 42, 0.65)',
                  marginBottom: '6px'
                }}
              >
                ZIP Code *
              </label>
              <input
                type="text"
                maxLength={5}
                placeholder="e.g. 33312"
                value={zipInput}
                onChange={(e) => setZipInput(e.target.value.replace(/\D/g, ''))}
                autoFocus
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(52, 41, 42, 0.2)',
                  fontSize: '14px',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* County */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'rgba(52, 41, 42, 0.65)',
                  marginBottom: '6px'
                }}
              >
                County
              </label>
              <select
                value={countyInput}
                onChange={(e) => setCountyInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(52, 41, 42, 0.2)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="Broward">Broward County</option>
                <option value="Palm Beach">Palm Beach County</option>
              </select>
            </div>

            {/* Optional Name */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'rgba(52, 41, 42, 0.65)',
                  marginBottom: '6px'
                }}
              >
                Custom Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Plantation or Downtown WPB"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(52, 41, 42, 0.2)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {formError && (
            <div style={{ color: '#B03823', fontSize: '12px', marginBottom: '14px' }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              style={{
                padding: '8px 16px',
                fontSize: '11px',
                letterSpacing: '0.06em',
                fontWeight: 600,
                backgroundColor: 'transparent',
                color: 'rgba(52, 41, 42, 0.65)',
                border: '1px solid rgba(52, 41, 42, 0.15)',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '8px 20px',
                fontSize: '11px',
                letterSpacing: '0.06em',
                fontWeight: 600,
                backgroundColor: 'var(--secondary-color, #41101B)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: submitting ? 'wait' : 'pointer'
              }}
            >
              {submitting ? 'SAVING...' : 'SAVE LOCATION'}
            </button>
          </div>
        </form>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ padding: '36px 0', textAlign: 'center', color: 'rgba(52, 41, 42, 0.55)', fontSize: '13px' }}>
          Loading your watched locations...
        </div>
      )}

      {/* Empty State */}
      {!loading && locations.length === 0 && !isAdding && (
        <div
          style={{
            backgroundColor: '#FAF8F5',
            border: '1px dashed rgba(52, 41, 42, 0.2)',
            borderRadius: '12px',
            padding: '36px 24px',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.7 }}>📍</div>
          <h4
            style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: '19px',
              fontWeight: 400,
              color: 'var(--espresso, #34292A)',
              margin: '0 0 6px 0'
            }}
          >
            You're not watching any locations yet
          </h4>
          <p
            style={{
              fontSize: '12.5px',
              color: 'rgba(52, 41, 42, 0.6)',
              margin: '0 0 16px 0',
              maxWidth: '440px',
              marginLeft: 'auto',
              marginRight: 'auto'
            }}
          >
            Add a target ZIP code above to track monthly price per sqft trends, 6-month momentum, and distressed deal volume.
          </p>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            style={{
              padding: '8px 16px',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              backgroundColor: 'var(--secondary-color, #41101B)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            + ADD YOUR FIRST LOCATION
          </button>
        </div>
      )}

      {/* Locations Grid */}
      {!loading && locations.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: '20px'
          }}
        >
          {locations.map(loc => (
            <WatchedLocationCard
              key={loc.id}
              location={loc}
              onRemove={handleRemoveLocation}
              onOpenZipSearch={onSelectZip}
            />
          ))}
        </div>
      )}
    </section>
  );
}
