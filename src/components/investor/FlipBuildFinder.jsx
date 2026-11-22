import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Eyebrow, SectionHeading } from '../ui';
import { SUPPORTED_COUNTIES, resolvePropertyCounty } from '../../config/counties.js';
import {
  DEVELOPER_COSTS_AS_OF_DISPLAY,
  FLIP_REHAB_LEVELS,
  FLIP_REHAB_INFERENCE_RULES
} from '../../config/developerCosts.js';
import AddressAutocomplete from './AddressAutocomplete.jsx';
import {
  buildAnalyzeCandidateRow,
  estimateQuickFinderProfit
} from './dealBreakdownEngine.js';

const DEFAULT_REHAB_OVERRIDES = {
  light: { min: FLIP_REHAB_LEVELS.light.minCostPerSqft, max: FLIP_REHAB_LEVELS.light.maxCostPerSqft },
  medium: { min: FLIP_REHAB_LEVELS.medium.minCostPerSqft, max: FLIP_REHAB_LEVELS.medium.maxCostPerSqft },
  full_gut: { min: FLIP_REHAB_LEVELS.full_gut.minCostPerSqft, max: FLIP_REHAB_LEVELS.full_gut.maxCostPerSqft }
};

const PRICE_BANDS = [
  { id: 'all', label: 'Any exit price', min: null, max: null },
  { id: 'under_500k', label: 'Under $500K', min: null, max: 500000 },
  { id: '500k_1m', label: '$500K – $1M', min: 500000, max: 1000000 },
  { id: '1m_2m', label: '$1M – $2M', min: 1000000, max: 2000000 },
  { id: '2m_plus', label: '$2M+', min: 2000000, max: null }
];

function fmtDollar(val, signed = false) {
  if (val == null || isNaN(Number(val))) return '—';
  const n = Math.round(Number(val));
  if (signed) {
    if (n > 0) return `+$${n.toLocaleString('en-US')}`;
    if (n < 0) return `−$${Math.abs(n).toLocaleString('en-US')}`;
    return '$0';
  }
  return n < 0 ? `−$${Math.abs(n).toLocaleString('en-US')}` : `$${n.toLocaleString('en-US')}`;
}

function fmtCompactSignedDollar(val) {
  if (val == null || isNaN(Number(val))) return '—';
  const n = Math.round(Number(val));
  const abs = Math.abs(n);
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  if (abs >= 1000000) {
    return `${sign}$${(abs / 1000000).toFixed(2).replace(/\.00$/, '')}M`;
  }
  if (abs >= 10000) {
    return `${sign}$${Math.round(abs / 1000)}K`;
  }
  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return `${sign}$${abs.toLocaleString('en-US')}`;
}

function fmtBedsBaths(row) {
  const beds = row?.beds != null && Number(row.beds) > 0 ? Number(row.beds) : null;
  let baths = row?.baths != null && Number(row.baths) > 0 ? Number(row.baths) : null;
  if (baths == null && (row?.full_baths != null || row?.half_baths != null)) {
    const total = (Number(row.full_baths) || 0) + (Number(row.half_baths) || 0) * 0.5;
    if (total > 0) baths = total;
  }
  const fmtNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));
  if (beds != null && baths != null) return `${fmtNum(beds)} bd / ${fmtNum(baths)} ba`;
  if (beds != null) return `${fmtNum(beds)} bd`;
  if (baths != null) return `${fmtNum(baths)} ba`;
  return null;
}

function fmtShortMonthYear(isoDate) {
  if (!isoDate) return '—';
  const match = String(isoDate).match(/^(\d{4})-(\d{2})/);
  if (!match) return isoDate;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[monthIdx] || 'Jan'} ${year}`;
}

const INPUT_STYLE = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '10px',
  border: '1px solid rgba(52, 41, 42, 0.2)',
  backgroundColor: '#FAF8F5',
  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
  fontSize: '12.5px',
  color: '#34292A',
  boxSizing: 'border-box'
};

const LABEL_STYLE = {
  display: 'block',
  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'rgba(52, 41, 42, 0.6)',
  marginBottom: '4px'
};

export default function FlipBuildFinder({
  initialZip = '',
  onSelectRow = null,
  onOpenLearningLabLesson = null
}) {
  const [county, setCounty] = useState('all');
  const [dealType, setDealType] = useState('all');
  const [zip, setZip] = useState(initialZip || '');
  const [radius, setRadius] = useState('');
  const [priceBand, setPriceBand] = useState('all');
  const [maxMonths, setMaxMonths] = useState(24);
  const [minGainPct, setMinGainPct] = useState(25);
  const [includeMyListings, setIncludeMyListings] = useState(false);
  const [includeDistressed, setIncludeDistressed] = useState(false);
  const [sortBy, setSortBy] = useState('sell_date');
  const [sortDir, setSortDir] = useState('desc');

  const [searchAddress, setSearchAddress] = useState('');
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [resolveError, setResolveError] = useState('');

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRehabEditor, setShowRehabEditor] = useState(false);
  const [rehabOverrides, setRehabOverrides] = useState(() => ({
    light: { ...DEFAULT_REHAB_OVERRIDES.light },
    medium: { ...DEFAULT_REHAB_OVERRIDES.medium },
    full_gut: { ...DEFAULT_REHAB_OVERRIDES.full_gut }
  }));
  const requestSeqRef = useRef(0);

  const hasCustomRehabOverrides = useMemo(() => {
    return ['light', 'medium', 'full_gut'].some((k) => {
      return (
        Number(rehabOverrides[k]?.min) !== DEFAULT_REHAB_OVERRIDES[k].min ||
        Number(rehabOverrides[k]?.max) !== DEFAULT_REHAB_OVERRIDES[k].max
      );
    });
  }, [rehabOverrides]);

  const handleUpdateRehabRate = (levelKey, bound, rawVal) => {
    const parsed = Number(rawVal);
    const clean = Number.isFinite(parsed) && parsed >= 0 ? Math.min(1000, Math.round(parsed)) : 0;
    setRehabOverrides((prev) => ({
      ...prev,
      [levelKey]: {
        ...prev[levelKey],
        [bound]: clean
      }
    }));
  };

  const handleResetRehabRates = () => {
    setRehabOverrides({
      light: { ...DEFAULT_REHAB_OVERRIDES.light },
      medium: { ...DEFAULT_REHAB_OVERRIDES.medium },
      full_gut: { ...DEFAULT_REHAB_OVERRIDES.full_gut }
    });
  };

  const displayItems = useMemo(() => {
    if (!hasCustomRehabOverrides) return items;
    const recomputed = items.map((row) => {
      if (row.deal_type === 'demo_new_build') return row;
      const est = estimateQuickFinderProfit(row, rehabOverrides);
      return {
        ...row,
        est_profit_low: est.estProfitLow,
        est_profit: est.estProfit,
        est_profit_high: est.estProfitHigh,
        est_roi_pct_low: est.roiPctLow,
        est_roi_pct: est.roiPct,
        est_roi_pct_high: est.roiPctHigh,
        est_annualized_roi_pct: est.annualizedRoiPct,
        rehab_level: est.rehabLevel,
        rehab_level_short_label: est.rehabLevelShortLabel,
        rehab_level_label: est.rehabLevelLabel,
        rehab_min_per_sqft: est.rehabMinPerSqft,
        rehab_max_per_sqft: est.rehabMaxPerSqft,
        rehab_mid_per_sqft: est.rehabMidPerSqft
      };
    });
    if (sortBy === 'est_profit') {
      const dir = sortDir === 'asc' ? 1 : -1;
      recomputed.sort((a, b) => ((Number(a.est_profit) || 0) - (Number(b.est_profit) || 0)) * dir);
    }
    return recomputed;
  }, [items, hasCustomRehabOverrides, rehabOverrides, sortBy, sortDir]);

  // Sync if initialZip changes from Learning Lab shortcut
  useEffect(() => {
    if (initialZip && /^\d{5}$/.test(initialZip)) {
      setZip(initialZip);
    }
  }, [initialZip]);

  const fetchFinder = useCallback(async (overrides = {}) => {
    const reqId = ++requestSeqRef.current;
    const fCounty = overrides.county ?? county;
    const fDealType = overrides.dealType ?? dealType;
    const fZip = (overrides.zip ?? zip).trim();
    const fRadius = overrides.radius ?? radius;
    const fPriceBand = overrides.priceBand ?? priceBand;
    const fMaxMonths = overrides.maxMonths ?? maxMonths;
    const fMinGainPct = overrides.minGainPct ?? minGainPct;
    const fIncludeMyListings = overrides.includeMyListings ?? includeMyListings;
    const fIncludeDistressed = overrides.includeDistressed ?? includeDistressed;
    const fSortBy = overrides.sortBy ?? sortBy;
    const fSortDir = overrides.sortDir ?? sortDir;

    if (fZip && !/^\d{5}$/.test(fZip)) {
      setError('Enter a 5-digit ZIP code or leave ZIP blank.');
      return;
    }

    const band = PRICE_BANDS.find((b) => b.id === fPriceBand) || PRICE_BANDS[0];
    const params = new URLSearchParams();
    params.set('county', fCounty);
    params.set('deal_type', fDealType);
    if (fZip) params.set('zip', fZip);
    if (fZip && fRadius) params.set('radius', String(fRadius));
    if (band.min != null) params.set('min_price', String(band.min));
    if (band.max != null) params.set('max_price', String(band.max));
    params.set('max_months', String(fMaxMonths));
    params.set('min_gain_pct', String(fMinGainPct));
    if (fIncludeMyListings) params.set('include_my_listings', '1');
    if (fIncludeDistressed) params.set('include_distressed', '1');
    params.set('sort_by', fSortBy);
    params.set('sort_dir', fSortDir);
    params.set('limit', '100');

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/county/flip-finder?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (reqId !== requestSeqRef.current) return;
      if (!res.ok) {
        throw new Error(json.error || `Finder request failed (HTTP ${res.status}).`);
      }
      setItems(Array.isArray(json.items) ? json.items : []);
      setSummary(json.summary || null);
    } catch (err) {
      if (reqId !== requestSeqRef.current) return;
      setError(err.message || 'Unable to load Flip & Build Finder results.');
    } finally {
      if (reqId === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [
    county,
    dealType,
    zip,
    radius,
    priceBand,
    maxMonths,
    minGainPct,
    includeMyListings,
    includeDistressed,
    sortBy,
    sortDir
  ]);

  useEffect(() => {
    fetchFinder();
  }, [county, dealType, radius, priceBand, maxMonths, minGainPct, includeMyListings, includeDistressed, sortBy, sortDir]);

  const handleSort = (colKey) => {
    if (sortBy === colKey) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(colKey);
      setSortDir(colKey === 'address' ? 'asc' : 'desc');
    }
  };

  const handleDealTypeChange = (newDealType) => {
    setDealType(newDealType);
    if (newDealType === 'demo_new_build' && maxMonths === 24) {
      setMaxMonths(48);
    }
  };

  const handleAnalyzeAddress = async (details) => {
    if (!details || !details.address) return;
    setResolvingAddress(true);
    setResolveError('');
    try {
      let pCounty = resolvePropertyCounty(details);
      let parcelId = details.parcel_id || null;
      let parcelData = null;

      if (!parcelId) {
        // Try searching county parcels by address text across counties
        const searchRes = await fetch(`/api/county/search?q=${encodeURIComponent(details.address)}&county=${encodeURIComponent(pCounty || '')}`);
        if (searchRes.ok) {
          const searchJson = await searchRes.json();
          const firstHit = searchJson?.results?.[0];
          if (firstHit?.parcel_id) {
            parcelId = firstHit.parcel_id;
            if (firstHit.county) pCounty = firstHit.county;
          }
        }
      }

      if (parcelId) {
        const parcelRes = await fetch(`/api/county/parcel?county=${encodeURIComponent(pCounty || 'Broward')}&parcel_id=${encodeURIComponent(parcelId)}`);
        if (parcelRes.ok) {
          parcelData = await parcelRes.json();
          if (parcelData?.county) {
            pCounty = parcelData.county;
          } else if (parcelData?.parcel?.county) {
            pCounty = parcelData.parcel.county;
          }
        }
      }

      // Pure + null-tolerant (new builds, vacant lots, no-sale parcels, missing CAMA)
      const candidateRow = buildAnalyzeCandidateRow({ details, parcelData, county: pCounty, parcelId });

      if (onSelectRow) {
        onSelectRow(candidateRow);
      }
    } catch (err) {
      setResolveError(err.message || 'Unable to resolve parcel for address.');
    } finally {
      setResolvingAddress(false);
    }
  };

  const handleZipSubmit = (e) => {
    e.preventDefault();
    fetchFinder();
  };

  const handleResetFilters = () => {
    setCounty('all');
    setDealType('all');
    setZip('');
    setRadius('');
    setPriceBand('all');
    setMaxMonths(24);
    setMinGainPct(25);
    setIncludeMyListings(false);
    setIncludeDistressed(false);
    setSortBy('sell_date');
    setSortDir('desc');
    fetchFinder({
      county: 'all',
      dealType: 'all',
      zip: '',
      radius: '',
      priceBand: 'all',
      maxMonths: 24,
      minGainPct: 25,
      includeMyListings: false,
      includeDistressed: false,
      sortBy: 'sell_date',
      sortDir: 'desc'
    });
  };

  const renderSortArrow = (colKey) => {
    if (sortBy !== colKey) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
    return <span style={{ marginLeft: '4px', color: '#859DCE' }}>{sortDir === 'desc' ? '↓' : '↑'}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', marginTop: '28px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div>
          <Eyebrow style={{ marginBottom: '6px' }}>
            COUNTY DEED INTELLIGENCE · READ-ONLY
          </Eyebrow>
          <SectionHeading level="h2" style={{ marginBottom: '6px' }}>
            Flip &amp; Build Finder
          </SectionHeading>
          <p style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '13px',
            color: 'rgba(52, 41, 42, 0.72)',
            margin: 0,
            maxWidth: '720px',
            lineHeight: 1.55
          }}>
            Spot real developer flips (two market sales within {maxMonths} months with ≥{minGainPct}% price jump) and demo → new builds directly from county deeds. Click any row to reverse-engineer the full Deal Breakdown.
          </p>
        </div>

        {typeof onOpenLearningLabLesson === 'function' && (
          <Button
            variant="secondary"
            onClick={() => onOpenLearningLabLesson('how_flippers_builders_make_money')}
          >
            Lesson: How flippers &amp; builders make money →
          </Button>
        )}
      </div>

      {/* 1. Analyze an Address Card */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1.5px solid #34292A',
          borderRadius: '18px',
          padding: '20px 22px',
          boxShadow: '0 4px 18px rgba(52, 41, 42, 0.06)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#34292A'
              }}
            >
              ANALYZE AN ADDRESS · INSTANT FLIP &amp; NEW BUILD BREAKDOWN
            </span>
            <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'rgba(52, 41, 42, 0.72)' }}>
              Enter any address to pull its county deed history, CAMA building specs, and open its Deal Breakdown.
            </p>
          </div>
          {resolvingAddress && (
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#859DCE' }}>
              Resolving parcel &amp; deeds…
            </span>
          )}
        </div>

        <AddressAutocomplete
          id="finder-address-analyze"
          value={searchAddress}
          onChange={(val) => setSearchAddress(val)}
          onSelect={handleAnalyzeAddress}
          placeholder="Start typing an address, e.g. 18801 SE River Ridge Rd or 1901 Embassy Dr…"
        />

        {resolveError && (
          <div
            role="alert"
            style={{
              marginTop: '10px',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(65, 16, 27, 0.08)',
              color: '#41101B',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            {resolveError}
          </div>
        )}
      </div>

      {/* Filter Card */}
      <form
        onSubmit={handleZipSubmit}
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid rgba(52, 41, 42, 0.12)',
          borderRadius: '18px',
          padding: '20px 22px',
          boxShadow: '0 4px 18px rgba(52, 41, 42, 0.04)'
        }}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px',
          alignItems: 'end'
        }}>
          <div>
            <label htmlFor="ff-county" style={LABEL_STYLE}>County</label>
            <select
              id="ff-county"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              style={INPUT_STYLE}
            >
              <option value="all">All counties</option>
              {SUPPORTED_COUNTIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ff-type" style={LABEL_STYLE}>Deal Type</label>
            <select
              id="ff-type"
              value={dealType}
              onChange={(e) => handleDealTypeChange(e.target.value)}
              style={INPUT_STYLE}
            >
              <option value="all">Flips + New builds</option>
              <option value="flip">Flips only</option>
              <option value="demo_new_build">Demo → New builds</option>
            </select>
          </div>

          <div>
            <label htmlFor="ff-zip" style={LABEL_STYLE}>ZIP Code</label>
            <input
              id="ff-zip"
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
              placeholder="e.g. 33401"
              style={INPUT_STYLE}
            />
          </div>

          <div>
            <label htmlFor="ff-radius" style={LABEL_STYLE}>Radius from ZIP</label>
            <select
              id="ff-radius"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              disabled={!zip || zip.length < 5}
              style={{
                ...INPUT_STYLE,
                opacity: !zip || zip.length < 5 ? 0.55 : 1,
                cursor: !zip || zip.length < 5 ? 'not-allowed' : 'pointer'
              }}
            >
              <option value="">Exact ZIP</option>
              <option value="1">1 mile</option>
              <option value="3">3 miles</option>
              <option value="5">5 miles</option>
              <option value="10">10 miles</option>
              <option value="15">15 miles</option>
            </select>
          </div>

          <div>
            <label htmlFor="ff-price" style={LABEL_STYLE}>Exit Price Band</label>
            <select
              id="ff-price"
              value={priceBand}
              onChange={(e) => setPriceBand(e.target.value)}
              style={INPUT_STYLE}
            >
              {PRICE_BANDS.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ff-months" style={LABEL_STYLE}>Max Hold</label>
            <select
              id="ff-months"
              value={maxMonths}
              onChange={(e) => setMaxMonths(Number(e.target.value))}
              style={INPUT_STYLE}
            >
              <option value={12}>≤ 12 months</option>
              <option value={18}>≤ 18 months</option>
              <option value={24}>≤ 24 months</option>
              <option value={36}>≤ 36 months</option>
              <option value={48}>≤ 48 months (New builds)</option>
              <option value={60}>≤ 60 months</option>
            </select>
          </div>

          <div>
            <label htmlFor="ff-gain" style={LABEL_STYLE}>Min Price Jump</label>
            <select
              id="ff-gain"
              value={minGainPct}
              onChange={(e) => setMinGainPct(Number(e.target.value))}
              style={INPUT_STYLE}
            >
              <option value={15}>≥ 15%</option>
              <option value={25}>≥ 25% (default)</option>
              <option value={40}>≥ 40%</option>
              <option value={60}>≥ 60%</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button type="submit" variant="primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Searching…' : 'Apply'}
            </Button>
          </div>
        </div>

        {/* Toggle Row */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '14px',
          marginTop: '14px',
          paddingTop: '14px',
          borderTop: '1px solid rgba(52, 41, 42, 0.08)'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'center' }}>
            {/* Sold only vs Include my entered listings */}
            <div style={{
              display: 'inline-flex',
              borderRadius: '999px',
              backgroundColor: '#FAF8F5',
              border: '1px solid rgba(52, 41, 42, 0.16)',
              padding: '3px'
            }}>
              <button
                type="button"
                onClick={() => setIncludeMyListings(false)}
                style={{
                  border: 'none',
                  borderRadius: '999px',
                  padding: '5px 12px',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: !includeMyListings ? '#34292A' : 'transparent',
                  color: !includeMyListings ? '#FAF8F5' : '#34292A'
                }}
              >
                Sold deeds only
              </button>
              <button
                type="button"
                onClick={() => setIncludeMyListings(true)}
                style={{
                  border: 'none',
                  borderRadius: '999px',
                  padding: '5px 12px',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: includeMyListings ? '#34292A' : 'transparent',
                  color: includeMyListings ? '#FAF8F5' : '#34292A'
                }}
              >
                + Include my entered listings
              </button>
            </div>

            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '12px',
              color: '#34292A',
              cursor: 'pointer',
              userSelect: 'none'
            }}>
              <input
                type="checkbox"
                checked={includeDistressed}
                onChange={(e) => setIncludeDistressed(e.target.checked)}
                style={{ accentColor: '#34292A', cursor: 'pointer' }}
              />
              <span>Show distressed → market buys (flagged separately)</span>
            </label>
          </div>

          <button
            type="button"
            onClick={handleResetFilters}
            style={{
              background: 'none',
              border: 'none',
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '11.5px',
              fontWeight: 600,
              color: 'rgba(52, 41, 42, 0.65)',
              textDecoration: 'underline',
              cursor: 'pointer'
            }}
          >
            Reset filters
          </button>
        </div>
      </form>

      {/* Summary KPI Band (Ganache 30%) */}
      {summary && (
        <div style={{
          backgroundColor: '#34292A',
          color: '#FAF8F5',
          borderRadius: '18px',
          padding: '20px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '16px',
          alignItems: 'center'
        }}>
          <div>
            <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#BDD3E2' }}>
              MATCHING DEALS
            </span>
            <div style={{ fontFamily: 'var(--font-display, "Cormorant Garamond", Georgia, serif)', fontSize: '30px', lineHeight: 1.15 }}>
              {summary.totalMatching?.toLocaleString('en-US') || 0}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(250, 248, 245, 0.72)' }}>
              {summary.flipCount || 0} flips · {summary.newBuildCount || 0} new builds
            </div>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#BDD3E2' }}>
              MEDIAN PRICE JUMP
            </span>
            <div style={{ fontFamily: 'var(--font-display, "Cormorant Garamond", Georgia, serif)', fontSize: '30px', lineHeight: 1.15 }}>
              {summary.medianJumpDollars != null ? fmtDollar(summary.medianJumpDollars, true) : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(250, 248, 245, 0.72)' }}>
              {summary.medianJumpPct != null ? `+${summary.medianJumpPct}% median gain` : 'No matching pairs'}
            </div>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#BDD3E2' }}>
              MEDIAN HOLD
            </span>
            <div style={{ fontFamily: 'var(--font-display, "Cormorant Garamond", Georgia, serif)', fontSize: '30px', lineHeight: 1.15 }}>
              {summary.medianHoldMonths != null ? `${summary.medianHoldMonths} mo` : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(250, 248, 245, 0.72)' }}>
              Between deed dates
            </div>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#BDD3E2' }}>
              DATA HYGIENE
            </span>
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#FAF8F5', marginTop: '4px' }}>
              {!includeDistressed && summary.distressedExcludedCount > 0
                ? `${summary.distressedExcludedCount} distressed → market hidden`
                : includeDistressed
                  ? 'Distressed buys flagged'
                  : 'Arms-length market deeds'}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(250, 248, 245, 0.65)', marginTop: '2px' }}>
              Read-only query · {summary.queryMs != null ? `${summary.queryMs} ms` : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '14px 18px',
          borderRadius: '12px',
          backgroundColor: 'rgba(185, 28, 28, 0.08)',
          border: '1px solid rgba(185, 28, 28, 0.25)',
          color: '#7F1D1D',
          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
          fontSize: '13px'
        }}>
          {error}
        </div>
      )}

      {/* Results Table */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid rgba(52, 41, 42, 0.12)',
        borderRadius: '18px',
        overflow: 'hidden',
        boxShadow: '0 4px 18px rgba(52, 41, 42, 0.04)'
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(52, 41, 42, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          backgroundColor: '#FAF8F5'
        }}>
          <span style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#34292A'
          }}>
            {loading
              ? 'Scanning county sales…'
              : `Showing ${displayItems.length} of ${summary?.totalMatching ?? displayItems.length} matched deals`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '11px',
              color: 'rgba(52, 41, 42, 0.62)'
            }}>
              Editable South FL defaults (as of {DEVELOPER_COSTS_AS_OF_DISPLAY})
            </span>
            <button
              type="button"
              onClick={() => setShowRehabEditor((prev) => !prev)}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                border: hasCustomRehabOverrides ? '1px solid #859DCE' : '1px solid rgba(52, 41, 42, 0.25)',
                backgroundColor: hasCustomRehabOverrides ? 'rgba(189, 211, 226, 0.45)' : '#FFFFFF',
                color: '#34292A',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '10.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {showRehabEditor ? 'Hide rehab $/sf' : hasCustomRehabOverrides ? 'Edit rehab $/sf (custom)' : 'Edit rehab $/sf'}
            </button>
          </div>
        </div>

        {/* Collapsible Editable Flip Rehab $/sf Assumptions */}
        {showRehabEditor && (
          <div style={{
            padding: '14px 20px',
            backgroundColor: '#FAF8F5',
            borderBottom: '1px solid rgba(52, 41, 42, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '10.5px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#34292A'
              }}>
                Flip Rehab Estimates ($/sf) · Inferred from Hold Months &amp; Price Jump %
              </span>
              {hasCustomRehabOverrides && (
                <button
                  type="button"
                  onClick={handleResetRehabRates}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#34292A',
                    textDecoration: 'underline',
                    cursor: 'pointer'
                  }}
                >
                  Reset to defaults
                </button>
              )}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px'
            }}>
              {[
                {
                  key: 'light',
                  title: 'Light',
                  rule: `≤${FLIP_REHAB_INFERENCE_RULES.lightMaxHoldMonths} mo (jump ≤${FLIP_REHAB_INFERENCE_RULES.fullGutMinJumpPct}%)`
                },
                {
                  key: 'medium',
                  title: 'Medium',
                  rule: `${FLIP_REHAB_INFERENCE_RULES.lightMaxHoldMonths + 1}–${FLIP_REHAB_INFERENCE_RULES.mediumMaxHoldMonths} mo (jump ≤${FLIP_REHAB_INFERENCE_RULES.fullGutMinJumpPct}%)`
                },
                {
                  key: 'full_gut',
                  title: 'Full gut',
                  rule: `>${FLIP_REHAB_INFERENCE_RULES.mediumMaxHoldMonths} mo or jump >${FLIP_REHAB_INFERENCE_RULES.fullGutMinJumpPct}%`
                }
              ].map((tier) => (
                <div
                  key={tier.key}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid rgba(52, 41, 42, 0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '12px', color: '#34292A' }}>{tier.title}</span>
                    <span style={{ fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.6)' }}>{tier.rule}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>$</span>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      aria-label={`${tier.title} min $/sf`}
                      value={rehabOverrides[tier.key]?.min ?? 0}
                      onChange={(e) => handleUpdateRehabRate(tier.key, 'min', e.target.value)}
                      style={{ ...INPUT_STYLE, padding: '5px 8px', width: '72px' }}
                    />
                    <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.6)' }}>to $</span>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      aria-label={`${tier.title} max $/sf`}
                      value={rehabOverrides[tier.key]?.max ?? 0}
                      onChange={(e) => handleUpdateRehabRate(tier.key, 'max', e.target.value)}
                      style={{ ...INPUT_STYLE, padding: '5px 8px', width: '72px' }}
                    />
                    <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.6)' }}>/sf</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '12.5px',
            color: '#34292A'
          }}>
            <thead>
              <tr style={{
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid rgba(52, 41, 42, 0.12)',
                textAlign: 'left',
                fontSize: '10.5px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(52, 41, 42, 0.65)'
              }}>
                <th style={{ padding: '12px 16px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('address')}>
                  Address &amp; Type {renderSortArrow('address')}
                </th>
                <th style={{ padding: '12px 12px', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('buy_price')}>
                  Bought {renderSortArrow('buy_price')}
                </th>
                <th style={{ padding: '12px 12px', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('sell_price')}>
                  Sold / Listed {renderSortArrow('sell_price')}
                </th>
                <th style={{ padding: '12px 12px', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('jump_dollars')}>
                  $ Jump {renderSortArrow('jump_dollars')}
                </th>
                <th style={{ padding: '12px 12px', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('hold_months')}>
                  Months {renderSortArrow('hold_months')}
                </th>
                <th
                  style={{ padding: '12px 12px', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  onClick={() => handleSort('break_even_reno_10')}
                  title="Max renovation budget leaving 10% profit (and 15% target) after purchase, closing, soft, holding, financing & selling costs"
                >
                  Break-even reno {renderSortArrow('break_even_reno_10')}
                </th>
                <th style={{ padding: '12px 12px', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('est_profit')}>
                  Est. Profit {renderSortArrow('est_profit')}
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading && displayItems.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '36px 24px', backgroundColor: '#FAF8F5' }}>
                    <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
                      <div style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '999px',
                        backgroundColor: 'rgba(52, 41, 42, 0.08)',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: '#34292A',
                        marginBottom: '10px'
                      }}>
                        0 Results for Current Filters
                      </div>

                      <h3 style={{
                        margin: '0 0 8px 0',
                        fontFamily: 'var(--font-heading, "Instrument Serif", Georgia, serif)',
                        fontSize: '24px',
                        fontWeight: 400,
                        color: '#34292A'
                      }}>
                        No completed flips or new builds found
                      </h3>

                      {summary?.availableSalesRange && (
                        <div style={{
                          padding: '12px 16px',
                          borderRadius: '12px',
                          backgroundColor: '#FFFFFF',
                          border: '1px solid rgba(52, 41, 42, 0.12)',
                          marginBottom: '16px',
                          textAlign: 'left',
                          fontSize: '12px',
                          color: '#34292A',
                          lineHeight: 1.5
                        }}>
                          <div style={{ fontWeight: 700, marginBottom: '4px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                            <span>Available Sales in Database:</span>
                            <span style={{ color: '#859DCE' }}>
                              {summary.availableSalesRange.minDate} – {summary.availableSalesRange.maxDate} ({summary.availableSalesRange.totalSales.toLocaleString()} sales across {summary.availableSalesRange.county})
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '11.5px', color: 'rgba(52, 41, 42, 0.72)' }}>
                            The county_sales table currently holds ~1 year of roll sales ({summary.availableSalesRange.minDate} to {summary.availableSalesRange.maxDate}). Because flips and new builds take 12–36+ months, the earlier acquisition deed (2023–2024) is missing until prior-year DOR SDF history (2023F, 2024F, 2025F) is imported.
                          </p>
                        </div>
                      )}

                      {summary?.diagnostics && (
                        (summary.diagnostics.filteredByHoldMonths > 0 ||
                          summary.diagnostics.filteredByMinGain > 0 ||
                          summary.diagnostics.filteredByDistressed > 0 ||
                          summary.diagnostics.filteredByDealType > 0) && (
                          <div style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid rgba(52, 41, 42, 0.12)',
                            marginBottom: '16px',
                            textAlign: 'left',
                            fontSize: '11.5px',
                            color: '#34292A'
                          }}>
                            <strong style={{ display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '10px', color: 'rgba(52, 41, 42, 0.6)' }}>
                              Candidate Sales Pairs Eliminated by Filters:
                            </strong>
                            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {summary.diagnostics.filteredByHoldMonths > 0 && (
                                <li><strong>{summary.diagnostics.filteredByHoldMonths} pairs</strong> had hold times longer than {maxMonths} months</li>
                              )}
                              {summary.diagnostics.filteredByMinGain > 0 && (
                                <li><strong>{summary.diagnostics.filteredByMinGain} pairs</strong> had price gains below {minGainPct}%</li>
                              )}
                              {summary.diagnostics.filteredByDistressed > 0 && (
                                <li><strong>{summary.diagnostics.filteredByDistressed} pairs</strong> were distressed acquisitions (hidden)</li>
                              )}
                              {summary.diagnostics.filteredByDealType > 0 && (
                                <li><strong>{summary.diagnostics.filteredByDealType} pairs</strong> did not match deal type &ldquo;{dealType}&rdquo;</li>
                              )}
                            </ul>
                          </div>
                        )
                      )}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                        {maxMonths < 48 && (
                          <button
                            type="button"
                            onClick={() => setMaxMonths(48)}
                            style={{
                              padding: '7px 13px',
                              borderRadius: '999px',
                              border: '1px solid #34292A',
                              backgroundColor: '#FFFFFF',
                              color: '#34292A',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Widen hold to 48 months
                          </button>
                        )}
                        {minGainPct > 15 && (
                          <button
                            type="button"
                            onClick={() => setMinGainPct(15)}
                            style={{
                              padding: '7px 13px',
                              borderRadius: '999px',
                              border: '1px solid #34292A',
                              backgroundColor: '#FFFFFF',
                              color: '#34292A',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Lower price jump to 15%
                          </button>
                        )}
                        {!includeDistressed && (
                          <button
                            type="button"
                            onClick={() => setIncludeDistressed(true)}
                            style={{
                              padding: '7px 13px',
                              borderRadius: '999px',
                              border: '1px solid #34292A',
                              backgroundColor: '#FFFFFF',
                              color: '#34292A',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Show distressed buys
                          </button>
                        )}
                        {zip && (
                          <button
                            type="button"
                            onClick={() => setZip('')}
                            style={{
                              padding: '7px 13px',
                              borderRadius: '999px',
                              border: '1px solid #34292A',
                              backgroundColor: '#FFFFFF',
                              color: '#34292A',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Clear ZIP filter ({zip})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          style={{
                            padding: '7px 13px',
                            borderRadius: '999px',
                            border: '1px solid rgba(52, 41, 42, 0.3)',
                            backgroundColor: '#FAF8F5',
                            color: '#34292A',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Reset all filters
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {displayItems.map((row) => {
                const isNewBuild = row.deal_type === 'demo_new_build';
                const isMyListing = row.exit_source === 'my_list_price';
                const bedsBathsLabel = fmtBedsBaths(row);
                const poolLabel = row.has_pool
                  ? (row.pool_year ? `Pool (${row.pool_year})` : 'Pool')
                  : null;

                const profitLow = row.est_profit_low != null ? Number(row.est_profit_low) : Number(row.est_profit);
                const profitHigh = row.est_profit_high != null ? Number(row.est_profit_high) : Number(row.est_profit);
                const profitColor = profitLow >= 0
                  ? '#1F5C3D'
                  : profitHigh > 0
                    ? '#34292A'
                    : '#991B1B';
                const profitRangeText = profitLow !== profitHigh
                  ? `${fmtCompactSignedDollar(profitLow)} to ${fmtCompactSignedDollar(profitHigh)}`
                  : fmtDollar(profitHigh, true);
                const profitTooltip = [
                  `Est. profit range: ${fmtDollar(profitLow, true)} to ${fmtDollar(profitHigh, true)}`,
                  row.est_roi_pct_low != null && row.est_roi_pct_high != null
                    ? `Est. ROI: ${Number(row.est_roi_pct_low).toFixed(1)}% to ${Number(row.est_roi_pct_high).toFixed(1)}%`
                    : null,
                  row.rehab_level_label ? `Inferred scope: ${row.rehab_level_label}` : null
                ].filter(Boolean).join(' · ');

                const be10 = row.break_even_reno_10 != null ? Number(row.break_even_reno_10) : null;
                const be15 = row.break_even_reno_15 != null ? Number(row.break_even_reno_15) : null;
                const be10Sf = row.break_even_reno_10_per_sqft;
                const be15Sf = row.break_even_reno_15_per_sqft;

                return (
                  <tr
                    key={row.id}
                    onClick={() => onSelectRow && onSelectRow(row)}
                    style={{
                      borderBottom: '1px solid rgba(52, 41, 42, 0.08)',
                      cursor: 'pointer',
                      transition: 'background-color 0.14s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FAF8F5'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
                  >
                    {/* Address & Badges + building_characteristics specs */}
                    <td style={{ padding: '13px 16px', minWidth: '250px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                        <span style={{ fontWeight: 700, color: '#34292A', fontSize: '13px' }}>
                          {row.address || `Folio ${row.parcel_id}`}
                        </span>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '9.5px',
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          backgroundColor: isNewBuild ? '#34292A' : 'rgba(189, 211, 226, 0.5)',
                          color: isNewBuild ? '#FAF8F5' : '#34292A',
                          border: isNewBuild ? '1px solid #34292A' : '1px solid rgba(133, 157, 206, 0.65)'
                        }}>
                          {isNewBuild ? 'Demo → New Build' : 'Flip'}
                        </span>
                        {row.is_distressed_acquisition && (
                          <span
                            title={`Acquisition qual code ${row.buy_qual} (distressed/REO/court deed) — flagged separately from arms-length flips`}
                            style={{
                              padding: '2px 7px',
                              borderRadius: '999px',
                              fontSize: '9.5px',
                              fontWeight: 700,
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase',
                              backgroundColor: 'rgba(217, 119, 6, 0.14)',
                              color: '#92400E',
                              border: '1px solid rgba(217, 119, 6, 0.4)'
                            }}
                          >
                            Distressed buy
                          </span>
                        )}
                        {isMyListing && (
                          <span style={{
                            padding: '2px 7px',
                            borderRadius: '999px',
                            fontSize: '9.5px',
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            backgroundColor: 'rgba(133, 157, 206, 0.22)',
                            color: '#34292A',
                            border: '1px solid #859DCE'
                          }}>
                            My listing
                          </span>
                        )}
                      </div>

                      <div
                        style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.68)' }}
                        title={row.bc_source === 'county_cama' ? 'Includes county CAMA building_characteristics (beds, baths, living sf, pool)' : undefined}
                      >
                        {[
                          [row.city, row.zip].filter(Boolean).join(' '),
                          row.county,
                          bedsBathsLabel,
                          row.living_sqft ? `${Number(row.living_sqft).toLocaleString()} sf` : null,
                          row.year_built ? `Built ${row.year_built}` : null,
                          poolLabel,
                          row.has_dock ? 'Dock' : null,
                          row.distance_mi != null ? `${row.distance_mi} mi` : null
                        ].filter(Boolean).join(' · ')}
                      </div>

                      {row.new_build_reason && (
                        <div style={{ fontSize: '10.5px', color: '#4B5563', marginTop: '2px', fontStyle: 'italic' }}>
                          {row.new_build_reason}
                        </div>
                      )}
                    </td>

                    {/* Bought */}
                    <td style={{ padding: '13px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700 }}>{fmtDollar(row.buy_price)}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.58)' }}>
                        {fmtShortMonthYear(row.buy_date)}
                      </div>
                    </td>

                    {/* Sold / Listed */}
                    <td style={{ padding: '13px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700 }}>{fmtDollar(row.sell_price)}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.58)' }}>
                        {isMyListing ? 'My entered list' : fmtShortMonthYear(row.sell_date)}
                      </div>
                    </td>

                    {/* $ Jump */}
                    <td style={{ padding: '13px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700, color: '#1F5C3D' }}>
                        {fmtDollar(row.jump_dollars, true)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                        +{Number(row.jump_pct || 0).toFixed(1)}%
                      </div>
                    </td>

                    {/* Months */}
                    <td style={{ padding: '13px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {row.hold_months} mo
                    </td>

                    {/* Break-even reno (10% profit / 15% target) */}
                    <td
                      style={{ padding: '13px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}
                      title={`Max renovation budget leaving 10% ROI profit: ${fmtDollar(be10)}${be10Sf != null ? ` ($${be10Sf}/sf)` : ''} · 15% target: ${fmtDollar(be15)}${be15Sf != null ? ` ($${be15Sf}/sf)` : ''}`}
                    >
                      <div style={{
                        fontWeight: 700,
                        color: be10 != null && be10 > 0 ? '#34292A' : 'rgba(52, 41, 42, 0.5)'
                      }}>
                        {be10 != null ? fmtDollar(be10) : '—'}
                        {be10 != null && be10 > 0 && be10Sf != null && (
                          <span style={{ fontWeight: 600, fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.62)', marginLeft: '4px' }}>
                            (${be10Sf}/sf)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.6)' }}>
                        {be10 != null && be10 > 0
                          ? `15% target: ${fmtDollar(be15)}${be15Sf != null ? ` ($${be15Sf}/sf)` : ''}`
                          : 'Spread tight for 10%'}
                      </div>
                    </td>

                    {/* Est. Profit (low–high range) */}
                    <td
                      style={{ padding: '13px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}
                      title={profitTooltip}
                    >
                      <div style={{
                        fontWeight: 700,
                        color: profitColor
                      }}>
                        {profitRangeText}
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.62)' }}>
                        {row.rehab_level_label || (row.est_roi_pct != null ? `${Number(row.est_roi_pct).toFixed(1)}% ROI` : '—')}{' '}
                        <span style={{
                          padding: '0px 5px',
                          borderRadius: '999px',
                          backgroundColor: 'rgba(189, 211, 226, 0.45)',
                          color: '#34292A',
                          fontSize: '9px',
                          fontWeight: 700,
                          textTransform: 'uppercase'
                        }}>
                          est.
                        </span>
                      </div>
                    </td>

                    {/* Action */}
                    <td style={{ padding: '13px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectRow) onSelectRow(row);
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '999px',
                          border: '1px solid #34292A',
                          backgroundColor: '#FAF8F5',
                          color: '#34292A',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          cursor: 'pointer'
                        }}
                      >
                        Break down →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

