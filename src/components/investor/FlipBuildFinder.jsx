import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Eyebrow, SectionHeading } from '../ui';
import { SUPPORTED_COUNTIES } from '../../config/counties.js';
import { DEVELOPER_COSTS_AS_OF_DISPLAY } from '../../config/developerCosts.js';
import AddressAutocomplete from './AddressAutocomplete.jsx';
import {
  inferDealBreakdownType,
  computeHoldMonthsBetweenDates,
  buildIsoDateFromYearMonth
} from './dealBreakdownEngine.js';

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
  const requestSeqRef = useRef(0);

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
      const pCounty = details.parcel_county || details.county || 'Broward';
      let parcelId = details.parcel_id || null;
      let parcelData = null;

      if (!parcelId) {
        // Try searching county parcels by address text
        const searchRes = await fetch(`/api/county/search?q=${encodeURIComponent(details.address)}&county=${encodeURIComponent(pCounty === 'all' ? '' : pCounty)}`);
        if (searchRes.ok) {
          const searchJson = await searchRes.json();
          const firstHit = searchJson?.results?.[0];
          if (firstHit?.parcel_id) {
            parcelId = firstHit.parcel_id;
          }
        }
      }

      if (parcelId) {
        const parcelRes = await fetch(`/api/county/parcel?county=${encodeURIComponent(pCounty)}&parcel_id=${encodeURIComponent(parcelId)}`);
        if (parcelRes.ok) {
          parcelData = await parcelRes.json();
        }
      }

      const parcel = parcelData?.parcel || {};
      const bChars = parcelData?.building_characteristics || null;
      const sales = Array.isArray(parcelData?.sales) ? parcelData.sales : [];

      // Sort sales ascending by year and month
      const sortedSales = [...sales].sort((a, b) => {
        const ymA = (Number(a.sale_year) || 0) * 100 + (Number(a.sale_month) || 1);
        const ymB = (Number(b.sale_year) || 0) * 100 + (Number(b.sale_month) || 1);
        return ymA - ymB;
      });

      let boughtSale = null;
      let soldSale = null;
      let exitSource = 'county_resale';

      if (sortedSales.length >= 2) {
        // Pick earlier sale as bought and latest sale as sold
        boughtSale = sortedSales[0];
        soldSale = sortedSales[sortedSales.length - 1];
        exitSource = 'county_resale';
      } else if (sortedSales.length === 1) {
        // Only 1 sale: bought is that sale, sold is user-entered list price ("Listed" mode)
        boughtSale = sortedSales[0];
        soldSale = null;
        exitSource = 'my_list_price';
      } else {
        // 0 sales in our data: user types purchase price + date manually ("entered by me")
        boughtSale = null;
        soldSale = null;
        exitSource = 'my_list_price';
      }

      const buyPrice = boughtSale ? Math.round(Number(boughtSale.sale_price) || 0) : 0;
      const buyDate = boughtSale ? buildIsoDateFromYearMonth(boughtSale.sale_year, boughtSale.sale_month) : '';
      const purchaseSource = boughtSale ? 'county_deed' : 'entered_by_me';

      const sellPrice = soldSale ? Math.round(Number(soldSale.sale_price) || 0) : 0;
      const sellDate = soldSale ? buildIsoDateFromYearMonth(soldSale.sale_year, soldSale.sale_month) : '';

      const buyYear = boughtSale?.sale_year || (buyDate ? Number(buyDate.slice(0, 4)) : null);
      const yearBuilt = bChars?.year_built || parcel.year_built || details.year_built || null;
      const livingSqft = bChars?.living_sqft || parcel.living_sqft || details.sqft || null;
      const lotSqft = parcel.land_sqft || details.lot_sqft || null;
      const hasPool = Boolean(bChars?.has_pool || (parcel.spec_feat_val && parcel.spec_feat_val > 0));
      const hasDock = Boolean(bChars?.has_dock);

      const inferredType = inferDealBreakdownType({
        buyYear,
        yearBuilt,
        afterYearBuilt: yearBuilt,
        beforeSqft: parcel.living_sqft,
        afterSqft: bChars?.living_sqft || parcel.living_sqft,
        buyViCd: boughtSale?.vi_cd,
        sellViCd: soldSale?.vi_cd,
        justValue: parcel.just_value,
        landValue: parcel.land_value,
        buyPrice
      });

      const candidateRow = {
        id: `analyze-${pCounty}-${parcelId || Date.now()}`,
        county: pCounty,
        parcel_id: parcelId || null,
        address: details.address || parcel.address || '',
        city: details.city || parcel.city || '',
        zip: details.zip || parcel.zip || '',
        deal_type: inferredType,
        buy_price: buyPrice,
        buy_date: buyDate,
        purchase_source: purchaseSource,
        buy_qual: boughtSale?.qual_code || null,
        buy_vi_cd: boughtSale?.vi_cd || null,
        sell_price: sellPrice,
        sell_date: sellDate,
        exit_source: exitSource,
        sell_qual: soldSale?.qual_code || null,
        sell_vi_cd: soldSale?.vi_cd || null,
        hold_months: computeHoldMonthsBetweenDates(buyDate, sellDate, 12),
        living_sqft: livingSqft,
        bc_living_sqft: bChars?.living_sqft || null,
        year_built: yearBuilt,
        eff_year_built: parcel.eff_year_built || null,
        lot_sqft: lotSqft,
        has_pool: hasPool,
        has_dock: hasDock,
        sales: sales,
        building_characteristics: bChars,
        is_distressed_acquisition: Boolean(boughtSale?.is_distressed)
      };

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
          gap: '8px',
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
              : `Showing ${items.length} of ${summary?.totalMatching ?? items.length} matched deals`}
          </span>
          <span style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '11px',
            color: 'rgba(52, 41, 42, 0.62)'
          }}>
            Est. profit uses editable South FL defaults (as of {DEVELOPER_COSTS_AS_OF_DISPLAY}) · Click any row to customize
          </span>
        </div>

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
                <th style={{ padding: '12px 12px', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('est_profit')}>
                  Est. Profit {renderSortArrow('est_profit')}
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '36px 24px', backgroundColor: '#FAF8F5' }}>
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
              {items.map((row) => {
                const isNewBuild = row.deal_type === 'demo_new_build';
                const isMyListing = row.exit_source === 'my_list_price';
                const profitPositive = Number(row.est_profit) >= 0;

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
                    {/* Address & Badges */}
                    <td style={{ padding: '13px 16px', minWidth: '240px' }}>
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

                      <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.64)' }}>
                        {[
                          [row.city, row.zip].filter(Boolean).join(' '),
                          row.county,
                          row.living_sqft ? `${Number(row.living_sqft).toLocaleString()} sf` : null,
                          row.year_built ? `Built ${row.year_built}` : null,
                          row.has_pool ? 'Pool' : null,
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

                    {/* Est. Profit */}
                    <td style={{ padding: '13px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{
                        fontWeight: 700,
                        color: profitPositive ? '#1F5C3D' : '#991B1B'
                      }}>
                        {fmtDollar(row.est_profit, true)}
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.62)' }}>
                        {row.est_roi_pct != null ? `${Number(row.est_roi_pct).toFixed(1)}% ROI` : '—'} ·{' '}
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

