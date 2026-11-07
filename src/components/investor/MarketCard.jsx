import React, { useState, useEffect, useCallback } from 'react';
import MarketChart from './MarketChart.jsx';

export default function MarketCard({
  property,
  showToast
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [freshness, setFreshness] = useState(null);

  const [isWatched, setIsWatched] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);

  const county = property?.parcel_county || property?.county || 'Broward';
  const zip = property?.zip || '';
  const propertyType = property?.property_type || 'single_family';

  // Calculate subject $/sf
  const subjectPpsf = (property?.list_price && property?.sqft && Number(property.sqft) > 0)
    ? Math.round(Number(property.list_price) / Number(property.sqft))
    : null;

  // Check if location is already watched
  const checkWatched = useCallback(async () => {
    if (!zip) return;
    try {
      const res = await fetch('/api/investor/locations');
      if (res.ok) {
        const locations = await res.json();
        const found = Array.isArray(locations) && locations.some(loc => loc.zip === zip);
        setIsWatched(found);
      }
    } catch (e) {
      // Ignore
    }
  }, [zip]);

  // Fetch freshness label
  const fetchFreshness = useCallback(async () => {
    try {
      const res = await fetch('/api/county/freshness');
      if (res.ok) {
        const fData = await res.json();
        setFreshness(fData);
      }
    } catch (e) {
      // Ignore
    }
  }, []);

  // Fetch market trends
  const fetchMarketData = useCallback(async () => {
    if (!zip || !/^\d{5}$/.test(zip)) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = `/api/county/market?county=${encodeURIComponent(county)}&zip=${encodeURIComponent(zip)}&type=${encodeURIComponent(propertyType)}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Sign in to view ZIP market trends.');
        }
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const resData = await res.json();
      setData(resData);
    } catch (err) {
      console.error('Error fetching market trends:', err);
      setError(err.message || 'Unable to load market trends');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [county, zip, propertyType]);

  useEffect(() => {
    fetchMarketData();
    checkWatched();
    fetchFreshness();
  }, [fetchMarketData, checkWatched, fetchFreshness]);

  const handleToggleWatch = async () => {
    if (watchLoading || isWatched) return;
    setWatchLoading(true);

    try {
      const cityName = property?.city || '';
      const payload = {
        zip,
        county,
        name: cityName ? `${cityName} (${zip})` : `ZIP ${zip}`,
        city: cityName
      };

      const res = await fetch('/api/investor/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to watch ZIP');
      }

      setIsWatched(true);
      if (showToast) {
        showToast(`Watching ZIP ${zip}`);
      }
    } catch (err) {
      console.error('Error adding watched location:', err);
      if (showToast) {
        showToast(err.message || 'Error watching ZIP');
      }
    } finally {
      setWatchLoading(false);
    }
  };

  if (!zip) return null;

  const summary = data?.summary || {};
  const monthly = data?.monthly || [];
  const quarterly = data?.quarterly || [];

  const freshnessLabel = freshness?.[county]?.label || `${county} data through Sep 2026 · 2026 final roll`;

  return (
    <div
      id="market-trends-card"
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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3
              style={{
                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                fontSize: '22px',
                fontWeight: 400,
                color: 'var(--espresso, #34292A)',
                margin: 0
              }}
            >
              Market trends
            </h3>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--espresso, #34292A)',
                backgroundColor: 'rgba(189, 211, 226, 0.28)',
                border: '1px solid rgba(133, 157, 206, 0.35)',
                padding: '2px 8px',
                borderRadius: '4px'
              }}
            >
              ZIP {zip} · {summary.type_label || 'Single-family'}
            </span>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '11.5px',
              color: 'rgba(52, 41, 42, 0.55)',
              display: 'block',
              marginTop: '4px'
            }}
          >
            {freshnessLabel}
          </span>
        </div>

        {/* Watch Button / Status */}
        <button
          type="button"
          onClick={handleToggleWatch}
          disabled={watchLoading || isWatched}
          style={{
            background: isWatched ? 'rgba(52, 41, 42, 0.05)' : 'none',
            border: isWatched ? '1px solid rgba(52, 41, 42, 0.12)' : 'none',
            color: isWatched ? 'rgba(52, 41, 42, 0.65)' : 'var(--secondary-color, #41101B)',
            fontSize: '11.5px',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontWeight: 600,
            textDecoration: isWatched ? 'none' : 'underline',
            cursor: isWatched ? 'default' : 'pointer',
            padding: isWatched ? '4px 10px' : '0',
            borderRadius: isWatched ? '6px' : '0',
            transition: 'all 0.15s ease'
          }}
        >
          {isWatched ? '✓ Watching ZIP' : watchLoading ? 'Saving...' : '+ Watch this ZIP'}
        </button>
      </div>

      {loading && (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'rgba(52, 41, 42, 0.6)', fontSize: '13px' }}>
          Loading ZIP {zip} market metrics...
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: '16px', backgroundColor: '#FFF7F7', borderRadius: '8px', color: '#B03823', fontSize: '12.5px' }}>
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Key Metrics Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '14px',
              backgroundColor: '#FAF8F5',
              padding: '16px 20px',
              borderRadius: '10px',
              border: '1px solid rgba(52, 41, 42, 0.06)'
            }}
          >
            {/* Median $/SF */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Median $/SF
              </div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--espresso, #34292A)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
                {summary.median_ppsf_last_6m != null ? `$${summary.median_ppsf_last_6m}` : '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                Last 6 months
              </div>
            </div>

            {/* 6-Mo Change */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
                6-Mo Change
              </div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: summary.ppsf_change_pct != null
                    ? (summary.ppsf_change_pct > 0 ? '#2E6B47' : summary.ppsf_change_pct < 0 ? '#9E3A24' : 'var(--espresso, #34292A)')
                    : 'rgba(52, 41, 42, 0.45)',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
                }}
              >
                {summary.ppsf_change_pct != null
                  ? `${summary.ppsf_change_pct > 0 ? '+' : ''}${summary.ppsf_change_pct}%`
                  : '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                vs. same 6 mo last year
              </div>
            </div>

            {/* 12-Month Sales */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Sales (12 MO)
              </div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--espresso, #34292A)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
                {summary.sales_last_12m != null ? summary.sales_last_12m.toLocaleString() : '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                Arm's-length market sales
              </div>
            </div>

            {/* Distressed Share */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Distressed Share
              </div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--espresso, #34292A)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
                {summary.distressed_share_pct != null ? `${summary.distressed_share_pct}%` : '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                Foreclosures / REO / Duress
              </div>
            </div>
          </div>

          {/* SVG Market Chart */}
          <div style={{ marginTop: '8px' }}>
            <MarketChart
              monthly={monthly}
              quarterly={quarterly}
              subjectPpsf={subjectPpsf}
              height={200}
              isSparkline={false}
              accentColor="#859DCE"
              primaryColor="#34292A"
            />
          </div>
        </>
      )}
    </div>
  );
}
