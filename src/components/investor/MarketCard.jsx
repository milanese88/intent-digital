import React, { useState, useEffect, useCallback } from 'react';
import MarketChart from './MarketChart.jsx';
import LocationSection from './LocationSection.jsx';
import {
  sanitizeGettingAroundCard,
  sanitizeSchoolsCard,
  sanitizePeopleHousingCard
} from './locationCardGuards.js';
import { formatNiceAddress, toTitleCase } from './AddressAutocomplete.jsx';
import { resolvePropertyCounty, getCountyAppraiserLabel } from '../../config/counties.js';

/**
 * Format sale date to "MMM YYYY" (e.g. "Aug 2026")
 */
function formatSoldMonthYear(month, year) {
  if (!year) return '—';
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = Number(month);
  if (m >= 1 && m <= 12) {
    return `${monthNames[m - 1]} ${year}`;
  }
  return String(year);
}

function buildPropertyAddressLine(property) {
  if (!property) return '';
  const stateZip = [property.state || 'FL', property.zip].filter(Boolean).join(' ');
  return [property.address, property.city, stateZip].filter(Boolean).join(', ');
}

export default function MarketCard({
  property,
  comps = [],
  onCompAdded,
  showToast
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [marketScope, setMarketScope] = useState('zip'); // 'zip' or '1mi'

  // Nearby candidate sales within 1 mile
  const [compsCandidates, setCompsCandidates] = useState([]);
  const [compsLoading, setCompsLoading] = useState(false);
  const [addingParcelId, setAddingParcelId] = useState(null);

  // Watch ZIP status
  const [isWatched, setIsWatched] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);

  // Real coordinate-based Location Snapshot state
  const [locationData, setLocationData] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [refreshingSection, setRefreshingSection] = useState(null);

  const subLat = property?.lat != null ? Number(property.lat) : null;
  const subLng = property?.lng != null ? Number(property.lng) : null;
  const hasCoords = subLat != null && subLng != null && !Number.isNaN(subLat) && !Number.isNaN(subLng);
  // County from the linked parcel / saved county, else coordinates (server resolves
  // ambiguous border points against parcel data and returns summary.county).
  const propertyCounty = resolvePropertyCounty(property);
  const [apiCounty, setApiCounty] = useState(null);
  const county = propertyCounty || apiCounty || '';
  const zip = property?.zip || '';
  const propertyType = property?.property_type || 'single_family';
  const propertyAddress = buildPropertyAddressLine(property);

  // Subject $/sf
  const subjectPpsf =
    property?.list_price && property?.sqft && Number(property.sqft) > 0
      ? Math.round(Number(property.list_price) / Number(property.sqft))
      : null;

  // Fetch Market Trends (supports ZIP or 1-mile toggle)
  const fetchMarketData = useCallback(async () => {
    if (!zip && !hasCoords) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let url = `/api/county/market?county=${encodeURIComponent(propertyCounty || '')}&zip=${encodeURIComponent(zip)}&type=${encodeURIComponent(propertyType)}&mode=${marketScope}`;
      if (hasCoords) {
        url += `&lat=${subLat}&lng=${subLng}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const resData = await res.json();
      setData(resData);
      if (resData?.summary?.county) setApiCounty(resData.summary.county);
    } catch (err) {
      console.error('Error fetching market trends:', err);
      setError(err.message || 'Unable to load market trends');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [propertyCounty, zip, propertyType, marketScope, hasCoords, subLat, subLng]);

  // Fetch candidate sales within 1 mile from /api/county/comps
  const fetchCompsCandidates = useCallback(async () => {
    if (!property?.parcel_id) {
      setCompsCandidates([]);
      return;
    }

    setCompsLoading(true);
    try {
      const url = `/api/county/comps?county=${encodeURIComponent(property.parcel_county || county)}&parcel_id=${encodeURIComponent(property.parcel_id)}&radius=1&months=12`;
      const res = await fetch(url);
      if (res.ok) {
        const cJson = await res.json();
        const cand = Array.isArray(cJson?.candidates) ? cJson.candidates : [];
        const within1Mi = cand.filter((c) => c.distance_mi == null || c.distance_mi <= 1.0);
        setCompsCandidates(within1Mi.slice(0, 5));
      }
    } catch (e) {
      console.warn('Error fetching candidate sales within 1 mile:', e);
    } finally {
      setCompsLoading(false);
    }
  }, [county, property?.parcel_id, property?.parcel_county]);

  // Fetch real Location Snapshot for this property
  const fetchLocationSnapshot = useCallback(
    async ({ forceRefresh = false, section = null } = {}) => {
      if (!property?.id) {
        setLocationData(null);
        return;
      }

      if (forceRefresh) {
        setRefreshingSection(section || 'all');
      } else {
        setLocationLoading(true);
      }

      try {
        const params = new URLSearchParams({ property_id: property.id });
        if (forceRefresh) params.set('refresh', '1');
        if (section) params.set('section', section);

        const res = await fetch(`/api/investor/location?${params.toString()}`);
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        setLocationData(json);
        if (forceRefresh && showToast) {
          showToast('Location data refreshed');
        }
      } catch (err) {
        console.warn('Location snapshot fetch warning:', err.message);
        if (!forceRefresh) {
          setLocationData(null);
        } else if (showToast) {
          showToast(err.message || 'Unable to refresh location data');
        }
      } finally {
        setLocationLoading(false);
        setRefreshingSection(null);
      }
    },
    [property?.id, showToast]
  );

  // Check if location is already watched
  useEffect(() => {
    if (!zip) return undefined;
    let active = true;
    fetch('/api/investor/locations')
      .then((res) => (res.ok ? res.json() : []))
      .then((locations) => {
        if (active && Array.isArray(locations)) {
          setIsWatched(locations.some((loc) => loc.zip === zip));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [zip]);

  useEffect(() => {
    fetchMarketData();
  }, [fetchMarketData]);

  useEffect(() => {
    fetchCompsCandidates();
  }, [fetchCompsCandidates]);

  useEffect(() => {
    fetchLocationSnapshot({ forceRefresh: false });
  }, [fetchLocationSnapshot]);

  // Handle adding candidate sale to comps
  const handleAddCandidateComp = async (candidate) => {
    if (!property?.id || addingParcelId) return;

    setAddingParcelId(candidate.parcel_id);
    const niceAddress = formatNiceAddress(candidate.address);
    const titleCity = toTitleCase(candidate.city);
    const z = candidate.zip || property.zip || '';

    const monthNum = candidate.sale_month ? Number(candidate.sale_month) : 1;
    const monthStr = String(monthNum).padStart(2, '0');
    const soldDate = `${candidate.sale_year}-${monthStr}-01`;

    try {
      const payload = {
        property_id: property.id,
        address: niceAddress,
        city: titleCity,
        zip: z || null,
        lat: candidate.lat != null ? Number(candidate.lat) : null,
        lng: candidate.lng != null ? Number(candidate.lng) : null,
        sold_date: soldDate,
        sold_price: Number(candidate.sale_price),
        sqft: Number(candidate.living_sqft),
        year_built: candidate.year_built ? Number(candidate.year_built) : null,
        source: 'Property appraiser',
        included: true,
        parcel_id: candidate.parcel_id,
        parcel_county: candidate.county || county
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

  // Check if candidate is already in comps
  const isCandidateAdded = (candidate) => {
    if (!comps || comps.length === 0) return false;
    const candAddr = (candidate.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return comps.some((c) => {
      if (candidate.parcel_id && c.parcel_id && candidate.parcel_id === c.parcel_id) return true;
      const cAddr = (c.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return cAddr && candAddr && (cAddr.includes(candAddr) || candAddr.includes(cAddr));
    });
  };

  // Toggle watch location
  const handleToggleWatch = async () => {
    if (watchLoading || isWatched || !zip) return;
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
        const errObj = await res.json().catch(() => ({}));
        throw new Error(errObj.error || 'Failed to watch ZIP');
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

  const summary = data?.summary || {};
  const monthly = data?.monthly || [];
  const quarterly = data?.quarterly || [];
  const priceDistList = Array.isArray(summary.price_distribution) ? summary.price_distribution : [];

  // Sanitized Location values for the top summary strip (never invented fallbacks)
  const safeGettingAround = sanitizeGettingAroundCard(locationData?.getting_around, propertyAddress);
  const safeSchools = sanitizeSchoolsCard(locationData?.schools, propertyAddress, county, subLat);
  const safePeople = sanitizePeopleHousingCard(locationData?.people_housing, propertyAddress);

  const topHighway = safeGettingAround.available ? safeGettingAround.highways[0] || null : null;
  const topGrocery = safeGettingAround.available
    ? safeGettingAround.places.find((p) => p.category_id === 'supermarket' || p.category === 'Groceries') || null
    : null;
  const topSchool = safeSchools.available ? safeSchools.schools[0] || null : null;

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

  return (
    <div
      id="investor-market-location-section"
      style={{ display: 'flex', flexDirection: 'column', gap: '28px', marginBottom: '36px' }}
    >
      {/* ========================================================================= */}
      {/* 1. SUMMARY STRIP AT THE TOP (REAL SOURCED METRICS ONLY)                   */}
      {/* ========================================================================= */}
      <div
        id="market-summary-strip"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E4DDD3',
          borderRadius: '16px',
          padding: '16px 22px',
          boxShadow: '0 2px 12px rgba(52, 41, 42, 0.03)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}
      >
        {/* Metric 1: Median $/sf with 6-mo change */}
        <div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: 'rgba(52, 41, 42, 0.55)',
              textTransform: 'uppercase',
              display: 'block'
            }}
          >
            Median $/sf
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
            <span
              style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '16px',
                fontWeight: 700,
                color: 'var(--espresso, #1B130D)'
              }}
            >
              {summary.median_ppsf_last_6m != null ? `$${summary.median_ppsf_last_6m}/sf` : '—'}
            </span>
            {summary.ppsf_change_pct != null && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: summary.ppsf_change_pct < 0 ? '#8A2A1E' : '#3F5A3A'
                }}
              >
                {summary.ppsf_change_pct > 0 ? '+' : ''}
                {summary.ppsf_change_pct}% 6-mo
              </span>
            )}
          </div>
        </div>

        <span style={{ color: '#E4DDD3', fontSize: '18px', userSelect: 'none' }}>&middot;</span>

        {/* Metric 2: Median rent vs county (from Census ACS only) */}
        <div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: 'rgba(52, 41, 42, 0.55)',
              textTransform: 'uppercase',
              display: 'block'
            }}
          >
            Tract median rent
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
            <span
              style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--espresso, #1B130D)'
              }}
            >
              {safePeople.available && safePeople.tract?.median_rent != null
                ? `$${safePeople.tract.median_rent.toLocaleString()}/mo`
                : '—'}
            </span>
            {safePeople.available && safePeople.county?.median_rent != null && (
              <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                vs ${safePeople.county.median_rent.toLocaleString()} county
              </span>
            )}
          </div>
        </div>

        <span style={{ color: '#E4DDD3', fontSize: '18px', userSelect: 'none' }}>&middot;</span>

        {/* Metric 3: Median age vs county (from Census ACS only) */}
        <div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: 'rgba(52, 41, 42, 0.55)',
              textTransform: 'uppercase',
              display: 'block'
            }}
          >
            Median age
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
            <span
              style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--espresso, #1B130D)'
              }}
            >
              {safePeople.available && safePeople.tract?.median_age != null
                ? `${safePeople.tract.median_age} yrs`
                : '—'}
            </span>
            {safePeople.available && safePeople.county?.median_age != null && (
              <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                vs {safePeople.county.median_age} county
              </span>
            )}
          </div>
        </div>

        <span style={{ color: '#E4DDD3', fontSize: '18px', userSelect: 'none' }}>&middot;</span>

        {/* Metric 4: Nearest highway on-ramp (only if OSM junctions imported) */}
        <div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: 'rgba(52, 41, 42, 0.55)',
              textTransform: 'uppercase',
              display: 'block'
            }}
          >
            Nearest highway on-ramp
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
            <span
              style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--espresso, #1B130D)'
              }}
            >
              {topHighway
                ? `${topHighway.route}${topHighway.distance_mi != null ? ` (${topHighway.distance_mi} mi)` : ''}`
                : '—'}
            </span>
            {topHighway?.drive_minutes != null && (
              <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                {topHighway.drive_minutes} min drive
              </span>
            )}
          </div>
        </div>

        <span style={{ color: '#E4DDD3', fontSize: '18px', userSelect: 'none' }}>&middot;</span>

        {/* Metric 5: Nearest grocery (only from Mapbox Search Box + Matrix) */}
        <div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: 'rgba(52, 41, 42, 0.55)',
              textTransform: 'uppercase',
              display: 'block'
            }}
          >
            Nearest grocery
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
            <span
              style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--espresso, #1B130D)'
              }}
            >
              {topGrocery
                ? `${topGrocery.name}${topGrocery.distance_mi != null ? ` (${topGrocery.distance_mi} mi)` : ''}`
                : '—'}
            </span>
            {topGrocery?.drive_minutes != null && (
              <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                {topGrocery.drive_minutes} min drive
              </span>
            )}
          </div>
        </div>

        {topSchool && (
          <>
            <span style={{ color: '#E4DDD3', fontSize: '18px', userSelect: 'none' }}>&middot;</span>
            <div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  color: 'rgba(52, 41, 42, 0.55)',
                  textTransform: 'uppercase',
                  display: 'block'
                }}
              >
                {topSchool.zone_verified ? 'Assigned school' : 'Nearest school'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--espresso, #1B130D)'
                  }}
                >
                  {topSchool.name}
                </span>
                {topSchool.grade && (
                  <span
                    style={{
                      backgroundColor: '#3F5A3A',
                      color: '#FFFFFF',
                      borderRadius: '6px',
                      padding: '1px 6px',
                      fontSize: '11px',
                      fontWeight: 700
                    }}
                  >
                    Grade {topSchool.grade}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. FULL-WIDTH MARKET & SALES CARD (REAL COUNTY ROLL DATA)                 */}
      {/* ========================================================================= */}
      <div
        id="market-sales-card"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E4DDD3',
          borderRadius: '20px',
          padding: '28px 32px',
          boxShadow: '0 4px 20px rgba(52, 41, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}
      >
        {/* Card Header & Scope Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2
                style={{
                  fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                  fontSize: '24px',
                  fontWeight: 400,
                  color: 'var(--espresso, #1B130D)',
                  margin: 0
                }}
              >
                Market &amp; sales
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--espresso, #34292A)',
                  backgroundColor: 'rgba(189, 211, 226, 0.28)',
                  border: '1px solid rgba(133, 157, 206, 0.35)',
                  padding: '3px 9px',
                  borderRadius: '6px'
                }}
              >
                {summary.mode === '1mi' ? '1-mile radius' : zip ? `ZIP ${zip}` : county} &middot;{' '}
                {summary.type_label || 'Single-family'}
              </span>
            </div>
            <p
              style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12.5px',
                color: 'rgba(52, 41, 42, 0.6)',
                margin: '6px 0 0 0'
              }}
            >
              Qualified arm&rsquo;s-length market sales recorded by the {(summary.counties_in_results?.length > 1 ? summary.counties_in_results : [county]).map((c) => getCountyAppraiserLabel(c)).join(' and ')}.
            </p>
          </div>

          {/* Right Action: ZIP / 1-mile toggle & Watch Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                display: 'inline-flex',
                backgroundColor: '#FAF8F4',
                border: '1px solid #E4DDD3',
                borderRadius: '24px',
                padding: '3px'
              }}
            >
              <button
                type="button"
                onClick={() => setMarketScope('zip')}
                style={{
                  background: marketScope === 'zip' ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '12px',
                  fontWeight: marketScope === 'zip' ? 600 : 500,
                  color: marketScope === 'zip' ? 'var(--espresso, #1B130D)' : 'rgba(52, 41, 42, 0.65)',
                  boxShadow: marketScope === 'zip' ? '0 2px 6px rgba(0, 0, 0, 0.05)' : 'none',
                  cursor: 'pointer'
                }}
              >
                {zip ? `ZIP ${zip}` : 'ZIP'}
              </button>
              <button
                type="button"
                onClick={() => setMarketScope('1mi')}
                style={{
                  background: marketScope === '1mi' ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '12px',
                  fontWeight: marketScope === '1mi' ? 600 : 500,
                  color: marketScope === '1mi' ? 'var(--espresso, #1B130D)' : 'rgba(52, 41, 42, 0.65)',
                  boxShadow: marketScope === '1mi' ? '0 2px 6px rgba(0, 0, 0, 0.05)' : 'none',
                  cursor: 'pointer'
                }}
              >
                1-mile radius
              </button>
            </div>

            {zip && (
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
                  padding: isWatched ? '6px 12px' : '0',
                  borderRadius: isWatched ? '6px' : '0'
                }}
              >
                {isWatched ? '✓ Watching' : watchLoading ? 'Saving...' : '+ Watch ZIP'}
              </button>
            )}
          </div>
        </div>

        {/* 4 Stat Tiles */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '14px',
            backgroundColor: '#FAF8F4',
            padding: '18px 22px',
            borderRadius: '14px',
            border: '1px solid #E4DDD3'
          }}
        >
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
              Median $/SF
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--espresso, #1B130D)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
              {summary.median_ppsf_last_6m != null ? `$${summary.median_ppsf_last_6m}` : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '2px' }}>
              Last 6 months
            </div>
          </div>

          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
              6-Mo Change
            </div>
            <div
              style={{
                fontSize: '22px',
                fontWeight: 700,
                color:
                  summary.ppsf_change_pct != null
                    ? summary.ppsf_change_pct > 0
                      ? '#3F5A3A'
                      : summary.ppsf_change_pct < 0
                        ? '#8A2A1E'
                        : 'var(--espresso, #1B130D)'
                    : 'rgba(52, 41, 42, 0.45)',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
              }}
            >
              {summary.ppsf_change_pct != null
                ? `${summary.ppsf_change_pct > 0 ? '+' : ''}${summary.ppsf_change_pct}%`
                : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '2px' }}>
              vs. same period prior yr
            </div>
          </div>

          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
              Sales (12 MO)
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--espresso, #1B130D)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
              {summary.sales_last_12m != null ? summary.sales_last_12m.toLocaleString() : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '2px' }}>
              Arm&rsquo;s-length market sales
            </div>
          </div>

          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
              Distressed Share
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--espresso, #1B130D)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
              {summary.distressed_share_pct != null ? `${summary.distressed_share_pct}%` : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '2px' }}>
              REO, foreclosure &amp; duress
            </div>
          </div>
        </div>

        {loading && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(52, 41, 42, 0.6)', fontSize: '13px' }}>
            Updating market metrics...
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: '14px 18px', backgroundColor: '#FFF7F7', borderRadius: '8px', color: '#8A2A1E', fontSize: '12.5px' }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <div>
            <MarketChart
              monthly={monthly}
              quarterly={quarterly}
              subjectPpsf={subjectPpsf}
              height={210}
              isSparkline={false}
              accentColor="#859DCE"
              primaryColor="#34292A"
            />
          </div>
        )}

        {/* "Sales by price · 12 mo" Bar List (shown only when real distribution exists) */}
        {priceDistList.length > 0 && (
          <div style={{ borderTop: '1px solid #E4DDD3', paddingTop: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                    fontSize: '18px',
                    fontWeight: 400,
                    color: 'var(--espresso, #1B130D)',
                    margin: 0
                  }}
                >
                  Sales by price &middot; 12 mo
                </h3>
                <span style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '2px', display: 'block' }}>
                  Distribution across sale price brackets in {marketScope === '1mi' ? '1-mile radius' : `ZIP ${zip}`}
                </span>
              </div>
              {summary.median_price_last_12m != null && (
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--secondary-color, #41101B)' }}>
                  Median ${Number(summary.median_price_last_12m).toLocaleString()}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {priceDistList.map((tier, idx) => (
                <div
                  key={tier.label || idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 1fr 100px',
                    alignItems: 'center',
                    gap: '14px',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '12px'
                  }}
                >
                  <span style={{ color: 'var(--espresso, #1B130D)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {tier.label}
                  </span>
                  <div style={{ width: '100%', height: '9px', backgroundColor: 'rgba(52, 41, 42, 0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.max(Number(tier.pct) || 0, 2)}%`,
                        height: '100%',
                        backgroundColor: idx === 2 ? 'var(--burgundy)' : 'var(--espresso)',
                        borderRadius: 'var(--radius-pill)',
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>
                  <span style={{ color: 'rgba(52, 41, 42, 0.65)', textAlign: 'right', fontWeight: 500 }}>
                    {tier.count} sales ({tier.pct}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent sales within 1 mile with "+ COMP" */}
        <div style={{ borderTop: '1px solid #E4DDD3', paddingTop: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3
                style={{
                  fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                  fontSize: '18px',
                  fontWeight: 400,
                  color: 'var(--espresso, #1B130D)',
                  margin: 0
                }}
              >
                Recent sales within 1 mile
              </h3>
              <span style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '2px', display: 'block' }}>
                Arm&rsquo;s-length market transactions closest to this parcel
              </span>
            </div>
            <span style={{ fontSize: '11.5px', color: 'rgba(52, 41, 42, 0.5)' }}>
              Showing {compsCandidates.length} closest verified sales
            </span>
          </div>

          {compsLoading && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(52, 41, 42, 0.6)', fontSize: '13px' }}>
              Loading recent sales within 1 mile...
            </div>
          )}

          {!compsLoading && compsCandidates.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(52, 41, 42, 0.55)', fontSize: '13px', fontStyle: 'italic' }}>
              No nearby arm&rsquo;s-length sales found within 1.0 mile for this property&rsquo;s parcel.
            </div>
          )}

          {!compsLoading && compsCandidates.length > 0 && (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E4DDD3', color: 'rgba(52, 41, 42, 0.6)', textAlign: 'left', fontSize: '10.5px', letterSpacing: '0.06em' }}>
                    <th style={{ padding: '8px 10px', fontWeight: 600 }}>ADDRESS</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600 }}>SOLD DATE</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>PRICE</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>SQFT</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>$/SQFT</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>DIST</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'center', width: '90px' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {compsCandidates.map((c) => {
                    const alreadyAdded = isCandidateAdded(c);
                    const isAddingThis = addingParcelId === c.parcel_id;
                    const ppsqft =
                      c.sale_price && c.living_sqft && Number(c.living_sqft) > 0
                        ? Math.round(Number(c.sale_price) / Number(c.living_sqft))
                        : null;

                    return (
                      <tr
                        key={c.parcel_id}
                        style={{
                          borderBottom: '1px solid rgba(228, 221, 211, 0.6)'
                        }}
                      >
                        <td style={{ padding: '12px 10px', color: 'var(--espresso, #1B130D)', fontWeight: 600 }}>
                          {formatNiceAddress(c.address)}
                        </td>
                        <td style={{ padding: '12px 10px', color: 'rgba(52, 41, 42, 0.7)' }}>
                          {formatSoldMonthYear(c.sale_month, c.sale_year)}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                          ${Number(c.sale_price).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: 'rgba(52, 41, 42, 0.8)' }}>
                          {Number(c.living_sqft).toLocaleString()} sf
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--secondary-color, #41101B)' }}>
                          {ppsqft ? `$${ppsqft}` : '—'}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: 'rgba(52, 41, 42, 0.65)' }}>
                          {c.distance_mi != null ? `${c.distance_mi} mi` : '< 1 mi'}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          {alreadyAdded ? (
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#3F5A3A', whiteSpace: 'nowrap' }}>
                              ✓ Added
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddCandidateComp(c)}
                              disabled={isAddingThis}
                              style={{
                                backgroundColor: 'var(--secondary-color, #41101B)',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '4px 10px',
                                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                fontSize: '11px',
                                fontWeight: 700,
                                letterSpacing: '0.04em',
                                cursor: isAddingThis ? 'wait' : 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {isAddingThis ? '...' : '+ COMP'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {data && (
          <div style={{ borderTop: '1px solid #E4DDD3', paddingTop: '14px', fontSize: '11px', color: 'rgba(52, 41, 42, 0.55)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
            Data for: {propertyAddress || `ZIP ${zip}`} &middot; Source: {(data?.summary?.counties_in_results?.length > 1 ? data.summary.counties_in_results : [county]).map((c) => getCountyAppraiserLabel(c)).join(' and ')} (2026 Final Roll &amp; recorded qualified sales).
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3 & 4. REAL COORDINATE-BASED LOCATION CARDS                               */}
      {/* ========================================================================= */}
      <LocationSection
        propertyAddress={propertyAddress}
        county={county}
        lat={subLat}
        lng={subLng}
        mapboxToken={mapboxToken}
        locationData={locationData}
        loading={locationLoading}
        refreshingSection={refreshingSection}
        onRefreshSection={(sec) => fetchLocationSnapshot({ forceRefresh: true, section: sec })}
      />
    </div>
  );
}
