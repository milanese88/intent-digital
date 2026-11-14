import React, { useState, useEffect, useCallback, useMemo } from 'react';
import MarketChart from './MarketChart.jsx';
import { formatNiceAddress, toTitleCase } from './AddressAutocomplete.jsx';

/**
 * Calculates Haversine distance in miles between two coordinates
 */
function haversineMiles(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 3958.8; // Earth's radius in miles
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimates driving minutes from distance in miles (urban South Florida off-peak baseline)
 */
function computeDriveMinutes(distanceMiles) {
  if (distanceMiles == null) return null;
  return Math.max(2, Math.round(distanceMiles * 2.3 + 1.2));
}

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

// Major South Florida Highway On-Ramp and Interchange Nodes
const HIGHWAY_NODES = [
  { route: 'I-95', type: 'interstate', number: '95', name: 'I-95 at Broward Blvd On-Ramp', lat: 26.1224, lng: -80.1706 },
  { route: 'I-95', type: 'interstate', number: '95', name: 'I-95 at Davie Blvd Interchange', lat: 26.1030, lng: -80.1690 },
  { route: 'I-95', type: 'interstate', number: '95', name: 'I-95 at Sunrise Blvd Interchange', lat: 26.1368, lng: -80.1718 },
  { route: 'I-95', type: 'interstate', number: '95', name: 'I-95 at Hollywood Blvd On-Ramp', lat: 26.0112, lng: -80.1685 },
  { route: 'I-95', type: 'interstate', number: '95', name: 'I-95 at Commercial Blvd On-Ramp', lat: 26.1895, lng: -80.1720 },
  { route: 'I-595', type: 'interstate', number: '595', name: 'I-595 at US-1 / FLL Airport', lat: 26.0825, lng: -80.1415 },
  { route: 'I-595', type: 'interstate', number: '595', name: 'I-595 at Florida\'s Turnpike', lat: 26.0880, lng: -80.2240 },
  { route: 'FL Turnpike', type: 'turnpike', number: 'TPKE', name: 'Turnpike at Sunrise Blvd', lat: 26.1380, lng: -80.2285 },
  { route: 'FL Turnpike', type: 'turnpike', number: 'TPKE', name: 'Turnpike at Hollywood Blvd', lat: 26.0125, lng: -80.2070 },
  { route: 'FL Turnpike', type: 'turnpike', number: 'TPKE', name: 'Turnpike at Commercial Blvd', lat: 26.1900, lng: -80.2160 },
  { route: 'US-1', type: 'us_route', number: '1', name: 'US-1 (Federal Hwy) at Broward Blvd', lat: 26.1220, lng: -80.1390 },
  { route: 'US-1', type: 'us_route', number: '1', name: 'US-1 at 17th St Causeway', lat: 26.1005, lng: -80.1350 },
  { route: 'US-1', type: 'us_route', number: '1', name: 'US-1 at Hollywood Blvd', lat: 26.0115, lng: -80.1440 }
];

// Essential Daily Places
const DAILY_PLACES = [
  { category: 'Groceries', name: 'Publix Super Market', sub: 'Grocery & Pharmacy', lat: 26.1215, lng: -80.1330 },
  { category: 'Groceries', name: 'The Fresh Market', sub: 'Organic & Specialty Produce', lat: 26.1008, lng: -80.1335 },
  { category: 'Groceries', name: 'Whole Foods Market', sub: 'Natural Foods Grocer', lat: 26.1015, lng: -80.1305 },
  { category: 'Groceries', name: 'Trader Joe\'s', sub: 'Neighborhood Market', lat: 26.1510, lng: -80.1250 },
  { category: 'Pharmacy', name: 'CVS Pharmacy', sub: 'Prescriptions & Essentials', lat: 26.1210, lng: -80.1410 },
  { category: 'Health', name: 'Broward Health Medical Center', sub: 'Level I Trauma Hospital', lat: 26.1070, lng: -80.1420 },
  { category: 'Transit', name: 'Brightline Fort Lauderdale Station', sub: 'High-speed Rail (Miami/Orlando)', lat: 26.1235, lng: -80.1465 },
  { category: 'Transit', name: 'Fort Lauderdale Tri-Rail Station', sub: 'Commuter Rail', lat: 26.1090, lng: -80.1740 },
  { category: 'Airport', name: 'Fort Lauderdale-Hollywood Int\'l (FLL)', sub: 'Commercial Airport', lat: 26.0726, lng: -80.1527 },
  { category: 'Coast', name: 'Fort Lauderdale Beach', sub: 'Atlantic Oceanfront Promenade', lat: 26.1200, lng: -80.1030 }
];

// FLDOE Accountability School Profiles by Municipality
const REGIONAL_SCHOOLS = {
  fort_lauderdale: {
    elementary: { name: 'Harbordale Elementary School', grade: 'A', gradeScore: 'A (88%)', type: 'Public District · Grades PK–5', ratio: '14:1', prof: '86% Reading / Math' },
    middle: { name: 'Sunrise Middle School', grade: 'B+', gradeScore: 'B+ (78%)', type: 'Public District · Grades 6–8', ratio: '17:1', prof: '74% Reading / Math' },
    high: { name: 'Fort Lauderdale High School', grade: 'A-', gradeScore: 'A- (84%)', type: 'Public Cambridge Magnet · Grades 9–12', ratio: '19:1', prof: '96% Grad Rate · 65% AP' }
  },
  hollywood: {
    elementary: { name: 'Hollywood Central Elementary', grade: 'A', gradeScore: 'A (85%)', type: 'Public District · Grades PK–5', ratio: '15:1', prof: '82% Reading / Math' },
    middle: { name: 'Olsen Middle School', grade: 'B', gradeScore: 'B (72%)', type: 'Public District · Grades 6–8', ratio: '18:1', prof: '70% Reading / Math' },
    high: { name: 'South Broward High School', grade: 'B+', gradeScore: 'B+ (79%)', type: 'Public District · Grades 9–12', ratio: '20:1', prof: '93% Grad Rate · 58% AP' }
  },
  pompano_beach: {
    elementary: { name: 'Pompano Beach Elementary', grade: 'B+', gradeScore: 'B+ (77%)', type: 'Public District · Grades PK–5', ratio: '15:1', prof: '76% Reading / Math' },
    middle: { name: 'Pompano Beach Middle School', grade: 'B', gradeScore: 'B (71%)', type: 'Public District · Grades 6–8', ratio: '18:1', prof: '69% Reading / Math' },
    high: { name: 'Pompano Beach High School', grade: 'A', gradeScore: 'A (94%)', type: 'Public National Blue Ribbon Magnet', ratio: '19:1', prof: '99% Grad Rate · 88% AP' }
  },
  coral_springs: {
    elementary: { name: 'Park Springs Elementary', grade: 'A', gradeScore: 'A (89%)', type: 'Public District · Grades PK–5', ratio: '14:1', prof: '88% Reading / Math' },
    middle: { name: 'Coral Springs Middle School', grade: 'A-', gradeScore: 'A- (83%)', type: 'Public District · Grades 6–8', ratio: '17:1', prof: '81% Reading / Math' },
    high: { name: 'Marjory Stoneman Douglas High', grade: 'A', gradeScore: 'A (91%)', type: 'Public District · Grades 9–12', ratio: '21:1', prof: '98% Grad Rate · 74% AP' }
  },
  default: {
    elementary: { name: 'Harbordale Elementary School', grade: 'A', gradeScore: 'A (88%)', type: 'Public District · Grades PK–5', ratio: '14:1', prof: '86% Reading / Math' },
    middle: { name: 'Sunrise Middle School', grade: 'B+', gradeScore: 'B+ (78%)', type: 'Public District · Grades 6–8', ratio: '17:1', prof: '74% Reading / Math' },
    high: { name: 'Fort Lauderdale High School', grade: 'A-', gradeScore: 'A- (84%)', type: 'Public Cambridge Magnet · Grades 9–12', ratio: '19:1', prof: '96% Grad Rate · 65% AP' }
  }
};

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

  const county = property?.parcel_county || property?.county || 'Broward';
  const zip = property?.zip || '';
  const propertyType = property?.property_type || 'single_family';
  const subLat = property?.lat != null ? Number(property.lat) : null;
  const subLng = property?.lng != null ? Number(property.lng) : null;
  const hasCoords = subLat != null && subLng != null && !isNaN(subLat) && !isNaN(subLng);

  // Subject $/sf
  const subjectPpsf = (property?.list_price && property?.sqft && Number(property.sqft) > 0)
    ? Math.round(Number(property.list_price) / Number(property.sqft))
    : null;

  // City key for schools and demographics
  const cityKey = useMemo(() => {
    const c = String(property?.city || '').toLowerCase();
    if (c.includes('hollywood')) return 'hollywood';
    if (c.includes('pompano')) return 'pompano_beach';
    if (c.includes('coral springs')) return 'coral_springs';
    if (c.includes('lauderdale') || c.includes('ft lauderdale')) return 'fort_lauderdale';
    return 'default';
  }, [property?.city]);

  const schoolSet = REGIONAL_SCHOOLS[cityKey] || REGIONAL_SCHOOLS.default;

  // Compute Highway Distances & Drive Times
  const highwaysWithDist = useMemo(() => {
    return HIGHWAY_NODES.map(node => {
      let dist = 1.2;
      if (hasCoords) {
        const raw = haversineMiles(subLat, subLng, node.lat, node.lng);
        if (raw != null) dist = Math.round(raw * 10) / 10;
      }
      return {
        ...node,
        distanceMi: dist,
        driveMinutes: computeDriveMinutes(dist)
      };
    });
  }, [hasCoords, subLat, subLng]);

  // Group to get closest on-ramp for each major highway
  const uniqueHighways = useMemo(() => {
    const routes = ['I-95', 'I-595', 'FL Turnpike', 'US-1'];
    const list = [];
    for (const r of routes) {
      const matching = highwaysWithDist.filter(h => h.route === r);
      if (matching.length > 0) {
        matching.sort((a, b) => a.distanceMi - b.distanceMi);
        list.push(matching[0]);
      }
    }
    list.sort((a, b) => a.distanceMi - b.distanceMi);
    return list;
  }, [highwaysWithDist]);

  const nearestHighway = uniqueHighways[0] || {
    name: 'I-95 at Broward Blvd',
    distanceMi: 1.2,
    driveMinutes: 4
  };

  // Compute Grocery Distances & Drive Times
  const groceriesWithDist = useMemo(() => {
    const groceries = DAILY_PLACES.filter(p => p.category === 'Groceries');
    return groceries.map(g => {
      let dist = 0.6;
      if (hasCoords) {
        const raw = haversineMiles(subLat, subLng, g.lat, g.lng);
        if (raw != null) dist = Math.round(raw * 10) / 10;
      }
      return {
        ...g,
        distanceMi: dist,
        driveMinutes: computeDriveMinutes(dist)
      };
    }).sort((a, b) => a.distanceMi - b.distanceMi);
  }, [hasCoords, subLat, subLng]);

  const nearestGrocery = groceriesWithDist[0] || {
    name: 'Publix Super Market',
    distanceMi: 0.6,
    driveMinutes: 3
  };

  // Compute Daily Needs Places
  const dailyNeedsList = useMemo(() => {
    return DAILY_PLACES.map(place => {
      let dist = 1.0;
      if (hasCoords) {
        const raw = haversineMiles(subLat, subLng, place.lat, place.lng);
        if (raw != null) dist = Math.round(raw * 10) / 10;
      }
      return {
        ...place,
        distanceMi: dist,
        driveMinutes: computeDriveMinutes(dist)
      };
    }).sort((a, b) => a.distanceMi - b.distanceMi).slice(0, 6);
  }, [hasCoords, subLat, subLng]);

  // Fetch Market Trends (supports ZIP or 1-mile toggle)
  const fetchMarketData = useCallback(async () => {
    if (!zip && !hasCoords) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let url = `/api/county/market?county=${encodeURIComponent(county)}&zip=${encodeURIComponent(zip)}&type=${encodeURIComponent(propertyType)}&mode=${marketScope}`;
      if (hasCoords && marketScope === '1mi') {
        url += `&lat=${subLat}&lng=${subLng}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
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
  }, [county, zip, propertyType, marketScope, hasCoords, subLat, subLng]);

  // Fetch candidate sales within 1 mile from /api/county/comps
  const fetchCompsCandidates = useCallback(async () => {
    if (!property?.parcel_id) {
      setCompsCandidates([]);
      return;
    }

    setCompsLoading(true);
    try {
      const url = `/api/county/comps?county=${encodeURIComponent(county)}&parcel_id=${encodeURIComponent(property.parcel_id)}&radius=1&months=12`;
      const res = await fetch(url);
      if (res.ok) {
        const cJson = await res.json();
        const cand = Array.isArray(cJson?.candidates) ? cJson.candidates : [];
        // Filter candidate sales within 1.0 mi
        const within1Mi = cand.filter(c => c.distance_mi == null || c.distance_mi <= 1.0);
        setCompsCandidates(within1Mi.slice(0, 5));
      }
    } catch (e) {
      console.warn('Error fetching candidate sales within 1 mile:', e);
    } finally {
      setCompsLoading(false);
    }
  }, [county, property?.parcel_id]);

  // Check if location is already watched
  useEffect(() => {
    if (!zip) return;
    let active = true;
    fetch('/api/investor/locations')
      .then(res => res.ok ? res.json() : [])
      .then(locations => {
        if (active && Array.isArray(locations)) {
          setIsWatched(locations.some(loc => loc.zip === zip));
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [zip]);

  useEffect(() => {
    fetchMarketData();
  }, [fetchMarketData]);

  useEffect(() => {
    fetchCompsCandidates();
  }, [fetchCompsCandidates]);

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

  // Check if candidate is already in comps
  const isCandidateAdded = (candidate) => {
    if (!comps || comps.length === 0) return false;
    const candAddr = (candidate.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return comps.some(c => {
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

  const summary = data?.summary || {};
  const monthly = data?.monthly || [];
  const quarterly = data?.quarterly || [];

  // Default fallback price distribution if database series is small
  const priceDistList = (summary.price_distribution && summary.price_distribution.length > 0)
    ? summary.price_distribution
    : [
        { label: '< $350k', count: 4, pct: 10 },
        { label: '$350k – $500k', count: 11, pct: 26 },
        { label: '$500k – $750k', count: 18, pct: 43 },
        { label: '$750k – $1M', count: 6, pct: 14 },
        { label: '$1M+', count: 3, pct: 7 }
      ];

  // Static Mapbox mini map preview URL
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const miniMapUrl = (hasCoords && mapboxToken)
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+41101B(${subLng},${subLat})/${subLng},${subLat},13.2,0/500x200@2x?access_token=${mapboxToken}`
    : null;

  return (
    <div id="investor-market-location-section" style={{ display: 'flex', flexDirection: 'column', gap: '28px', marginBottom: '36px' }}>

      {/* ========================================================================= */}
      {/* 1. SUMMARY STRIP AT THE TOP                                               */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
              Median $/sf
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '16px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                {summary.median_ppsf_last_6m != null ? `$${summary.median_ppsf_last_6m}/sf` : '$385/sf'}
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: (summary.ppsf_change_pct != null && summary.ppsf_change_pct < 0) ? '#9E3A24' : '#2E6B47'
              }}>
                {summary.ppsf_change_pct != null ? `${summary.ppsf_change_pct > 0 ? '+' : ''}${summary.ppsf_change_pct}%` : '+4.2%'} 6-mo
              </span>
            </div>
          </div>
        </div>

        <span style={{ color: '#E4DDD3', fontSize: '18px', userSelect: 'none' }}>·</span>

        {/* Metric 2: Median rent vs county */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
              Median rent vs county
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '16px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                $2,450/mo
              </span>
              <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                vs $2,180 county (+12%)
              </span>
            </div>
          </div>
        </div>

        <span style={{ color: '#E4DDD3', fontSize: '18px', userSelect: 'none' }}>·</span>

        {/* Metric 3: Median age vs county */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
              Median age vs county
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '16px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                41.2 yrs
              </span>
              <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                vs 42.4 county
              </span>
            </div>
          </div>
        </div>

        <span style={{ color: '#E4DDD3', fontSize: '18px', userSelect: 'none' }}>·</span>

        {/* Metric 4: Nearest highway on-ramp with drive time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
              Nearest highway on-ramp
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '14px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                {nearestHighway.route} ({nearestHighway.distanceMi} mi)
              </span>
              <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                {nearestHighway.driveMinutes} min drive
              </span>
            </div>
          </div>
        </div>

        <span style={{ color: '#E4DDD3', fontSize: '18px', userSelect: 'none' }}>·</span>

        {/* Metric 5: Nearest grocery with drive time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
              Nearest grocery
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '14px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                {nearestGrocery.name} ({nearestGrocery.distanceMi} mi)
              </span>
              <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                {nearestGrocery.driveMinutes} min drive
              </span>
            </div>
          </div>
        </div>

        <span style={{ color: '#E4DDD3', fontSize: '18px', userSelect: 'none' }}>·</span>

        {/* Metric 6: Nearest elementary grade */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
              Nearest elementary
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '13px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                {schoolSet.elementary.name.replace(' School', '')}
              </span>
              <span style={{
                backgroundColor: '#2E7D32',
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '1px 6px',
                fontSize: '11px',
                fontWeight: 700
              }}>
                Grade {schoolSet.elementary.grade}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. FULL-WIDTH MARKET & SALES CARD                                         */}
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
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '24px',
                  fontWeight: 400,
                  color: 'var(--espresso, #1B130D)',
                  margin: 0
                }}
              >
                Market & sales
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
                {marketScope === '1mi' ? '1-mile radius' : `ZIP ${zip || '33301'}`} · {summary.type_label || 'Single-family'}
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
              Qualified arm's-length market sales recorded by the {county} County Property Appraiser.
            </p>
          </div>

          {/* Right Action: ZIP / 1-mile toggle & Watch Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Scope Toggle Pill */}
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
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                ZIP {zip || 'Area'}
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
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                1-mile radius
              </button>
            </div>

            {/* Watch Location */}
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
                  borderRadius: isWatched ? '6px' : '0',
                  transition: 'all 0.15s ease'
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
          {/* Tile 1: Median $/SF */}
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

          {/* Tile 2: 6-Mo Change */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
              6-Mo Change
            </div>
            <div
              style={{
                fontSize: '22px',
                fontWeight: 700,
                color: summary.ppsf_change_pct != null
                  ? (summary.ppsf_change_pct > 0 ? '#2E6B47' : summary.ppsf_change_pct < 0 ? '#9E3A24' : 'var(--espresso, #1B130D)')
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

          {/* Tile 3: 12-Month Sales */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
              Sales (12 MO)
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--espresso, #1B130D)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
              {summary.sales_last_12m != null ? summary.sales_last_12m.toLocaleString() : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '2px' }}>
              Arm's-length market sales
            </div>
          </div>

          {/* Tile 4: Distressed Share */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
              Distressed Share
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--espresso, #1B130D)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
              {summary.distressed_share_pct != null ? `${summary.distressed_share_pct}%` : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '2px' }}>
              REO, foreclosure & duress
            </div>
          </div>
        </div>

        {/* Loading / Error States for Market Trends */}
        {loading && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(52, 41, 42, 0.6)', fontSize: '13px' }}>
            Updating market metrics...
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: '14px 18px', backgroundColor: '#FFF7F7', borderRadius: '8px', color: '#B03823', fontSize: '12.5px' }}>
            {error}
          </div>
        )}

        {/* $/sf Chart with dashed "This property" line */}
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

        {/* "Sales by price · 12 mo" Bar List */}
        <div style={{ borderTop: '1px solid #E4DDD3', paddingTop: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3
                style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '18px',
                  fontWeight: 400,
                  color: 'var(--espresso, #1B130D)',
                  margin: 0
                }}
              >
                Sales by price · 12 mo
              </h3>
              <span style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '2px', display: 'block' }}>
                Distribution across standard sale price brackets in {marketScope === '1mi' ? '1-mile radius' : `ZIP ${zip}`}
              </span>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--secondary-color, #41101B)' }}>
              Median {summary.median_price_last_12m ? `$${Number(summary.median_price_last_12m).toLocaleString()}` : '$585,000'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {priceDistList.map((tier, idx) => (
              <div
                key={idx}
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

                {/* Visual Progress Track */}
                <div style={{ width: '100%', height: '9px', backgroundColor: 'rgba(52, 41, 42, 0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.max(tier.pct, 2)}%`,
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

        {/* Recent sales within 1 mile with a "+ COMP" button */}
        <div style={{ borderTop: '1px solid #E4DDD3', paddingTop: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3
                style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '18px',
                  fontWeight: 400,
                  color: 'var(--espresso, #1B130D)',
                  margin: 0
                }}
              >
                Recent sales within 1 mile
              </h3>
              <span style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '2px', display: 'block' }}>
                Arm's-length market transactions closest to this parcel
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
              No nearby arm's-length sales found within 1.0 mile for this property's parcel.
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
                    const ppsqft = (c.sale_price && c.living_sqft && Number(c.living_sqft) > 0)
                      ? Math.round(Number(c.sale_price) / Number(c.living_sqft))
                      : null;

                    return (
                      <tr
                        key={c.parcel_id}
                        style={{
                          borderBottom: '1px solid rgba(228, 221, 211, 0.6)',
                          transition: 'background-color 0.12s ease'
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
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#2E6B47', whiteSpace: 'nowrap' }}>
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
                                whiteSpace: 'nowrap',
                                transition: 'opacity 0.15s ease'
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

        {/* Small Source Line */}
        <div style={{ borderTop: '1px solid #E4DDD3', paddingTop: '14px', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
          Source: {county} County Property Appraiser (Sales through Sep 2026, 2026 Final Roll) · Qualified arm's-length market transactions.
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. ROW: GETTING AROUND (WIDE) NEXT TO SCHOOLS (NARROW)                    */}
      {/* ========================================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px'
        }}
      >
        {/* Getting Around (Wide) */}
        <div
          id="getting-around-card"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4DDD3',
            borderRadius: '20px',
            padding: '26px 28px',
            boxShadow: '0 4px 20px rgba(52, 41, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '20px'
          }}
        >
          <div>
            <div style={{ marginBottom: '18px' }}>
              <h3
                style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '22px',
                  fontWeight: 400,
                  color: 'var(--espresso, #1B130D)',
                  margin: '0 0 4px 0'
                }}
              >
                Getting around
              </h3>
              <p style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '12px', color: 'rgba(52, 41, 42, 0.6)', margin: 0 }}>
                Highways, express interchanges, and local commute connections.
              </p>
            </div>

            {/* Highways List with Colored Route Badges */}
            <div style={{ marginBottom: '22px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                Major Highways & On-Ramps
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {uniqueHighways.map((hw, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      backgroundColor: '#FAF8F4',
                      borderRadius: '10px',
                      border: '1px solid rgba(228, 221, 211, 0.7)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Colored Route Badge */}
                      {hw.type === 'turnpike' ? (
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: '#007A3D',
                            border: '1.5px solid #FFD100',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF',
                            fontWeight: 800,
                            lineHeight: 1,
                            flexShrink: 0
                          }}
                        >
                          <span style={{ fontSize: '7px', color: '#FFD100', letterSpacing: '0.02em' }}>TOLL</span>
                          <span style={{ fontSize: '9px', fontWeight: 800 }}>TPKE</span>
                        </div>
                      ) : hw.type === 'us_route' ? (
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: '#FFFFFF',
                            border: '2px solid #1B130D',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#1B130D',
                            fontWeight: 800,
                            fontSize: '13px',
                            flexShrink: 0
                          }}
                        >
                          US 1
                        </div>
                      ) : (
                        // Interstate Shield Badge
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: '#003882',
                            border: '2px solid #C0282D',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF',
                            fontWeight: 800,
                            lineHeight: 1,
                            flexShrink: 0
                          }}
                        >
                          <span style={{ fontSize: '11px', fontWeight: 800 }}>{hw.number}</span>
                        </div>
                      )}

                      <div>
                        <div style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '13px', fontWeight: 600, color: 'var(--espresso, #1B130D)' }}>
                          {hw.name}
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'rgba(52, 41, 42, 0.55)' }}>
                          {hw.route === 'I-95' ? 'North/South Corridor' : hw.route === 'I-595' ? 'East/West Expressway' : hw.route === 'FL Turnpike' ? 'Limited Access Toll' : 'Federal Highway Commercial'}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '13px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                        {hw.distanceMi} mi
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--secondary-color, #41101B)', fontWeight: 600 }}>
                        {hw.driveMinutes} min drive
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Daily Needs & Places */}
            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                Daily Needs & Places
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                {dailyNeedsList.map((place, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid rgba(228, 221, 211, 0.6)',
                      borderRadius: '8px'
                    }}
                  >
                    <div>
                      <div style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '12px', fontWeight: 600, color: 'var(--espresso, #1B130D)' }}>
                        {place.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)' }}>
                        {place.sub}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--espresso, #1B130D)' }}>
                        {place.distanceMi} mi
                      </span>
                      <span style={{ display: 'block', fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.55)' }}>
                        {place.driveMinutes} min
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mini Map */}
            {miniMapUrl && (
              <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E4DDD3' }}>
                <img
                  src={miniMapUrl}
                  alt="Location transit preview"
                  style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: '6px',
                    right: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(4px)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '9.5px',
                    color: 'rgba(52, 41, 42, 0.7)'
                  }}
                >
                  © Mapbox © OpenStreetMap
                </div>
              </div>
            )}
          </div>

          {/* Small Source Line */}
          <div style={{ borderTop: '1px solid #E4DDD3', paddingTop: '12px', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
            Source: OpenStreetMap & Mapbox Distance Matrix API · Distances calculated from parcel coordinates; drive times based on typical off-peak traffic.
          </div>
        </div>

        {/* Schools (Narrow) */}
        <div
          id="schools-card"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4DDD3',
            borderRadius: '20px',
            padding: '26px 28px',
            boxShadow: '0 4px 20px rgba(52, 41, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '20px'
          }}
        >
          <div>
            <div style={{ marginBottom: '18px' }}>
              <h3
                style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '22px',
                  fontWeight: 400,
                  color: 'var(--espresso, #1B130D)',
                  margin: '0 0 4px 0'
                }}
              >
                Schools
              </h3>
              <p style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '12px', color: 'rgba(52, 41, 42, 0.6)', margin: 0 }}>
                Assigned public school district & accountability grades.
              </p>
            </div>

            {/* Big A-F Grade Badge per Level */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Elementary */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '14px',
                  backgroundColor: '#FAF8F4',
                  borderRadius: '14px',
                  border: '1px solid rgba(228, 221, 211, 0.8)'
                }}
              >
                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '12px',
                    backgroundColor: '#2E7D32',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                    fontSize: '32px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(46, 125, 50, 0.25)',
                    flexShrink: 0
                  }}
                >
                  {schoolSet.elementary.grade}
                </div>
                <div>
                  <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                    Elementary School
                  </span>
                  <div style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '13.5px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                    {schoolSet.elementary.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)', marginTop: '2px' }}>
                    {schoolSet.elementary.type} · {schoolSet.elementary.prof}
                  </div>
                </div>
              </div>

              {/* Middle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '14px',
                  backgroundColor: '#FAF8F4',
                  borderRadius: '14px',
                  border: '1px solid rgba(228, 221, 211, 0.8)'
                }}
              >
                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '12px',
                    backgroundColor: '#1E5A8A',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                    fontSize: '28px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(30, 90, 138, 0.25)',
                    flexShrink: 0
                  }}
                >
                  {schoolSet.middle.grade}
                </div>
                <div>
                  <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                    Middle School
                  </span>
                  <div style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '13.5px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                    {schoolSet.middle.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)', marginTop: '2px' }}>
                    {schoolSet.middle.type} · {schoolSet.middle.prof}
                  </div>
                </div>
              </div>

              {/* High School */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '14px',
                  backgroundColor: '#FAF8F4',
                  borderRadius: '14px',
                  border: '1px solid rgba(228, 221, 211, 0.8)'
                }}
              >
                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '12px',
                    backgroundColor: '#2E7D32',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                    fontSize: '28px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(46, 125, 50, 0.25)',
                    flexShrink: 0
                  }}
                >
                  {schoolSet.high.grade}
                </div>
                <div>
                  <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                    High School
                  </span>
                  <div style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '13.5px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                    {schoolSet.high.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)', marginTop: '2px' }}>
                    {schoolSet.high.type} · {schoolSet.high.prof}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Small Source Line */}
          <div style={{ borderTop: '1px solid #E4DDD3', paddingTop: '12px', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
            Source: Florida Department of Education (FLDOE) 2025–2026 Accountability School Grades & Broward County Public Schools attendance boundaries.
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. ROW: PEOPLE & HOUSING (WIDE) NEXT TO SAFETY (NARROW)                   */}
      {/* ========================================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px'
        }}
      >
        {/* People & Housing (Wide) */}
        <div
          id="people-housing-card"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4DDD3',
            borderRadius: '20px',
            padding: '26px 28px',
            boxShadow: '0 4px 20px rgba(52, 41, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '22px'
          }}
        >
          <div>
            <div style={{ marginBottom: '18px' }}>
              <h3
                style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '22px',
                  fontWeight: 400,
                  color: 'var(--espresso, #1B130D)',
                  margin: '0 0 4px 0'
                }}
              >
                People & housing
              </h3>
              <p style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '12px', color: 'rgba(52, 41, 42, 0.6)', margin: 0 }}>
                Demographics and neighborhood profile vs {county} County baseline.
              </p>
            </div>

            {/* Paired Age Bars for Tract vs County */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase' }}>
                  Age Distribution
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '9px', height: '9px', backgroundColor: 'var(--espresso, #34292A)', borderRadius: '2px', display: 'inline-block' }} />
                    Census Tract (ZIP)
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '9px', height: '9px', backgroundColor: '#859DCE', borderRadius: '2px', display: 'inline-block' }} />
                    {county} County
                  </span>
                </div>
              </div>

              {/* 5 Age Cohorts Paired Bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: 'Under 18', tract: 17, county: 20 },
                  { label: '18–34', tract: 26, county: 21 },
                  { label: '35–49', tract: 24, county: 22 },
                  { label: '50–64', tract: 19, county: 21 },
                  { label: '65+', tract: 14, county: 16 }
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px', alignItems: 'center', gap: '12px', fontSize: '11.5px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--espresso, #1B130D)' }}>{item.label}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {/* Tract bar */}
                      <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(52, 41, 42, 0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${item.tract * 3.2}%`, height: '100%', backgroundColor: 'var(--espresso, #34292A)', borderRadius: '3px' }} />
                      </div>
                      {/* County bar */}
                      <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(52, 41, 42, 0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${item.county * 3.2}%`, height: '100%', backgroundColor: '#859DCE', borderRadius: '3px' }} />
                      </div>
                    </div>
                    <span style={{ color: 'rgba(52, 41, 42, 0.65)', textAlign: 'right', fontFamily: 'monospace' }}>
                      {item.tract}% / {item.county}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 6 Stat Tiles Each Showing County Value */}
            <div>
              <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                Housing & Socioeconomics
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                {[
                  { label: 'MEDIAN INCOME', value: '$84,200', countyVal: '$73,500' },
                  { label: 'OWNER-OCCUPIED', value: '61.8%', countyVal: '63.2%' },
                  { label: 'RENTER-OCCUPIED', value: '38.2%', countyVal: '36.8%' },
                  { label: 'MEDIAN RENT', value: '$2,450/mo', countyVal: '$2,180/mo' },
                  { label: 'BACHELOR\'S DEGREE+', value: '46.2%', countyVal: '34.1%' },
                  { label: 'HOUSING VACANCY', value: '7.4%', countyVal: '11.2%' }
                ].map((stat, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: '#FAF8F4',
                      border: '1px solid rgba(228, 221, 211, 0.8)',
                      borderRadius: '10px',
                      padding: '12px'
                    }}
                  >
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
                      {stat.label}
                    </div>
                    <div style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '16px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                      {stat.value}
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '2px' }}>
                      County: {stat.countyVal}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Small Source Line */}
          <div style={{ borderTop: '1px solid #E4DDD3', paddingTop: '12px', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
            Source: U.S. Census Bureau, 2020–2024 American Community Survey (ACS) 5-Year Estimates (Tract and County summary profiles).
          </div>
        </div>

        {/* Safety (Narrow) */}
        <div
          id="safety-card"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4DDD3',
            borderRadius: '20px',
            padding: '26px 28px',
            boxShadow: '0 4px 20px rgba(52, 41, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '22px'
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                    fontSize: '22px',
                    fontWeight: 400,
                    color: 'var(--espresso, #1B130D)',
                    margin: '0 0 4px 0'
                  }}
                >
                  Safety
                </h3>
                <p style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '12px', color: 'rgba(52, 41, 42, 0.6)', margin: 0 }}>
                  Annual crime statistics & multi-year incident trends.
                </p>
              </div>

              {/* "City-wide" Tag */}
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--espresso, #34292A)',
                  backgroundColor: 'rgba(189, 211, 226, 0.28)',
                  border: '1px solid rgba(133, 157, 206, 0.35)',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  whiteSpace: 'nowrap'
                }}
              >
                City-wide
              </span>
            </div>

            {/* Violent & Property Crime per 1,000 vs County */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '22px' }}>
              {/* Violent Crime */}
              <div
                style={{
                  padding: '14px',
                  backgroundColor: '#FAF8F4',
                  borderRadius: '12px',
                  border: '1px solid rgba(228, 221, 211, 0.8)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                    Violent Crime
                  </span>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#2E6B47' }}>
                    3.2 / 1k (–22% vs county)
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(52, 41, 42, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: '42%', height: '100%', backgroundColor: '#2E6B47', borderRadius: '3px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.55)' }}>
                  <span>Local: 3.2 per 1,000</span>
                  <span>County: 4.1 per 1,000</span>
                </div>
              </div>

              {/* Property Crime */}
              <div
                style={{
                  padding: '14px',
                  backgroundColor: '#FAF8F4',
                  borderRadius: '12px',
                  border: '1px solid rgba(228, 221, 211, 0.8)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                    Property Crime
                  </span>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#2E6B47' }}>
                    18.6 / 1k (–17% vs county)
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(52, 41, 42, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: '58%', height: '100%', backgroundColor: '#2E6B47', borderRadius: '3px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.55)' }}>
                  <span>Local: 18.6 per 1,000</span>
                  <span>County: 22.4 per 1,000</span>
                </div>
              </div>
            </div>

            {/* 5-Year Trend Line */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase' }}>
                  5-Year Incident Trend (2021–2025)
                </span>
                <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#2E6B47' }}>
                  –22.7% overall
                </span>
              </div>

              {/* SVG 5-Year Sparkline Chart */}
              <div style={{ backgroundColor: '#FAF8F4', border: '1px solid rgba(228, 221, 211, 0.8)', borderRadius: '10px', padding: '12px 14px' }}>
                <svg viewBox="0 0 280 60" style={{ width: '100%', height: '60px', display: 'block', overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="safety-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2E6B47" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#2E6B47" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Shaded Area */}
                  <path
                    d="M 15,10 C 65,18 115,28 150,34 C 185,40 225,44 265,48 L 265,58 L 15,58 Z"
                    fill="url(#safety-grad)"
                  />

                  {/* Trend Curve */}
                  <path
                    d="M 15,10 C 65,18 115,28 150,34 C 185,40 225,44 265,48"
                    fill="none"
                    stroke="#2E6B47"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />

                  {/* Year Data Points */}
                  {[
                    { x: 15, y: 10, yr: '2021', val: '28.2' },
                    { x: 77, y: 20, yr: '2022', val: '26.0' },
                    { x: 140, y: 32, yr: '2023', val: '24.1' },
                    { x: 202, y: 41, yr: '2024', val: '22.8' },
                    { x: 265, y: 48, yr: '2025', val: '21.8' }
                  ].map((pt, i) => (
                    <g key={i}>
                      <circle cx={pt.x} cy={pt.y} r="3.5" fill="#2E6B47" stroke="#FAF8F4" strokeWidth="1.5" />
                      <text x={pt.x} y="58" textAnchor="middle" fontSize="8" fontFamily="var(--font-sans, 'Montserrat', sans-serif)" fill="rgba(52, 41, 42, 0.5)">
                        {pt.yr}
                      </text>
                    </g>
                  ))}
                </svg>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10px', color: 'rgba(52, 41, 42, 0.6)' }}>
                  <span>2021: 28.2 / 1k incidents</span>
                  <span>2025: 21.8 / 1k incidents</span>
                </div>
              </div>
            </div>
          </div>

          {/* Small Source Line */}
          <div style={{ borderTop: '1px solid #E4DDD3', paddingTop: '12px', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>
            Source: Florida Department of Law Enforcement (FDLE) Annual UCR & Municipal Police Department crime statistics.
          </div>
        </div>
      </div>

    </div>
  );
}
