import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button } from '../ui';
import zctaGeoJson from '../../content/geo/south-florida-zcta.json';

// Brand Color Palette (tokens.css: cream, espresso, burgundy, beige, borders)
const COLORS = {
  cream: '#FAF8F4',
  espresso: '#1B130D',
  burgundy: '#3A1418',
  beige: '#F2EEE8',
  border: '#E4DDD3',
  white: '#FFFFFF',
  lowData: 'rgba(228, 221, 211, 0.45)'
};

// v3 look: rose flips vs espresso new builds, floating panels over a full-width map
const DOT_FLIP = '#B5707D';
const SERIF = "var(--font-instrument, 'Instrument Serif', Georgia, serif)";
const SANS = "var(--font-body, 'Montserrat', sans-serif)";
const FLOAT = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E4DDD3',
  boxShadow: '0 6px 24px rgba(27, 19, 13, 0.08)'
};
const LABEL_STYLE = { fontFamily: SANS, fontSize: '9.5px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7A6E64' };
const SHORT_LAYER = { profit: 'Profit', months: 'Speed', dom: 'Days on market', deal_count: 'Deals' };
const SHORT_DEAL = { all: 'All', flip: 'Flips', demo_new_build: 'Builds' };

// 5-Step Burgundy Scale: Level 1 (lowest/slowest) to Level 5 (highest/fastest)
const BURGUNDY_SCALE = [
  '#F5EFF0', // Step 1: Lightest
  '#DBB8BE', // Step 2
  '#A35C69', // Step 3
  '#6E2231', // Step 4
  '#3A1418'  // Step 5: Darkest Burgundy
];

const LAYERS = [
  { id: 'profit', label: 'Est. Profit', unit: '$', desc: 'Likely net profit per completed deal' },
  { id: 'months', label: 'Months Buy → Sell', unit: 'mo', desc: 'Hold period between recorded deeds' },
  { id: 'dom', label: 'Days on Market', unit: 'd', desc: 'Days on market data: Redfin' },
  { id: 'deal_count', label: 'Deal Count', unit: '', desc: 'Total paired flips & new builds' }
];

const DEAL_TYPES = [
  { id: 'all', label: 'Both Deals' },
  { id: 'flip', label: 'Flips Only' },
  { id: 'demo_new_build', label: 'New Builds Only' }
];

const COUNTIES = [
  { id: 'all', label: 'All Counties' },
  { id: 'Palm Beach', label: 'Palm Beach' },
  { id: 'Broward', label: 'Broward' },
  { id: 'Martin', label: 'Martin' }
];

const PRICE_BANDS = [
  { id: 'all', label: 'Any Exit Price' },
  { id: 'under_500k', label: 'Under $500K' },
  { id: '500k_1m', label: '$500K – $1M' },
  { id: '1m_2m', label: '$1M – $2M' },
  { id: '2m_plus', label: '$2M+' }
];

const LOOKBACK_OPTIONS = [
  { id: 24, label: 'Last 24 Months' },
  { id: 12, label: 'Last 12 Months' },
  { id: 600, label: 'All Time' }
];

const SF_BANDS = [
  { id: 'all', label: 'Any Living SF' },
  { id: 'under_1500', label: '< 1,500 sf' },
  { id: '1500_2500', label: '1,500 – 2,500 sf' },
  { id: '2500_4000', label: '2,500 – 4,000 sf' },
  { id: '4000_plus', label: '4,000+ sf' }
];

const BED_OPTIONS = [
  { id: 0, label: 'Any Beds' },
  { id: 2, label: '2+ Beds' },
  { id: 3, label: '3+ Beds' },
  { id: 4, label: '4+ Beds' },
  { id: 5, label: '5+ Beds' }
];

export function formatShortMoney(amount) {
  if (amount == null || isNaN(amount)) return '—';
  const num = Number(amount);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1000000) {
    const m = (abs / 1000000).toFixed(2).replace(/\.?0+$/, '');
    return `${sign}$${m}M`;
  }
  if (abs >= 1000) {
    return `${sign}$${Math.round(abs / 1000)}K`;
  }
  return `${sign}$${Math.round(abs)}`;
}

function fmtDollar(n) {
  return formatShortMoney(n);
}

const SOUTH_FLORIDA_BOUNDS = [[-80.45, 25.95], [-80.00, 27.20]];
const COUNTY_BOUNDS = {
  all: SOUTH_FLORIDA_BOUNDS,
  broward: [[-80.38, 25.96], [-80.06, 26.35]],
  'palm beach': [[-80.32, 26.32], [-80.01, 26.98]],
  martin: [[-80.50, 26.96], [-80.06, 27.25]]
};

export default function OpportunityMap({
  onOpenFinder = null,
  onOpenDealBreakdown = null
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [mapError, setMapError] = useState(null);

  // Filters & Layer Selection
  const [activeLayer, setActiveLayer] = useState('profit');
  const [activeDealType, setActiveDealType] = useState('all');
  const [selectedCounty, setSelectedCounty] = useState('all');
  const [priceBand, setPriceBand] = useState('all');
  const [lookbackMonths, setLookbackMonths] = useState(24);
  const [sqftBand, setSqftBand] = useState('all');
  const [minBeds, setMinBeds] = useState(0);

  // Data states
  const [aggregates, setAggregates] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [dots, setDots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedZip, setSelectedZip] = useState(null);
  const [hoveredZip, setHoveredZip] = useState(null);
  const [viewportBbox, setViewportBbox] = useState(null);
  const [error, setError] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rankOpen, setRankOpen] = useState(true);

  
  // Lookup map of aggregates by ZIP
  const aggByZip = useMemo(() => {
    const map = new Map();
    for (const a of aggregates) {
      map.set(a.zip, a);
    }
    return map;
  }, [aggregates]);

  const selectedArea = useMemo(() => {
    if (!selectedZip) return null;
    return aggByZip.get(selectedZip) || null;
  }, [selectedZip, aggByZip]);

  // Compute 5 quantiles / breaks for the active layer
  const layerQuantiles = useMemo(() => {
    const valid = aggregates
      .filter((a) => a.deal_count >= 3)
      .map((a) => {
        if (activeLayer === 'profit') return a.est_profit_likely;
        if (activeLayer === 'months') return a.median_hold_months;
        if (activeLayer === 'dom') return a.median_dom;
        return a.deal_count;
      })
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);

    if (valid.length < 5) {
      return [10, 20, 30, 40];
    }

    return [
      valid[Math.floor(valid.length * 0.2)],
      valid[Math.floor(valid.length * 0.4)],
      valid[Math.floor(valid.length * 0.6)],
      valid[Math.floor(valid.length * 0.8)]
    ];
  }, [aggregates, activeLayer]);

  // Fetch Aggregates from backend
  const fetchAggregates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        layer: activeLayer,
        deal_type: activeDealType,
        county: selectedCounty,
        price_band: priceBand,
        lookback_months: String(lookbackMonths),
        sqft_band: sqftBand,
        beds: String(minBeds),
        include_dots: 'true'
      });

      if (viewportBbox) {
        qs.set('bbox', `${viewportBbox.minLng},${viewportBbox.minLat},${viewportBbox.maxLng},${viewportBbox.maxLat}`);
      } else if (selectedZip) {
        qs.set('zip', selectedZip);
      }

      const res = await fetch(`/api/county/opportunity-map?${qs.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setAggregates(data.aggregates || []);
      setRankings(data.rankings || []);
      if (Array.isArray(data.dots)) {
        setDots(data.dots);
      }
    } catch (err) {
      console.error('Failed to load Opportunity Map data:', err);
      setError(err.message || 'Unable to load Opportunity Map.');
    } finally {
      setLoading(false);
    }
  }, [activeLayer, activeDealType, selectedCounty, priceBand, lookbackMonths, sqftBand, minBeds, viewportBbox, selectedZip]);

  useEffect(() => {
    fetchAggregates();
  }, [fetchAggregates]);

  // Store ref for callback so Mapbox listeners don't re-instantiate map on callback change
  const onOpenDealBreakdownRef = useRef(onOpenDealBreakdown);
  useEffect(() => {
    onOpenDealBreakdownRef.current = onOpenDealBreakdown;
  }, [onOpenDealBreakdown]);

  // Initialize map (MapLibre + OpenFreeMap)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/positron', // OpenFreeMap: free, no key
      center: [-80.12, 26.45], // South Florida regional center
      zoom: 9.5,
      attributionControl: { compact: true } // OpenStreetMap credit (required)
    });

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    let styleLoaded = false;
    map.on('error', (e) => {
      const msg = e?.error?.message || String(e?.error || e);
      const status = e?.error?.status;
      console.warn('Mapbox GL runtime error:', status, msg);
      // Surface basemap failures on screen (bad/restricted token, blocked request)
      if (!styleLoaded) {
        setMapError(status === 401 || status === 403
          ? `The map provider refused the request on ${window.location.hostname} (HTTP ${status}).`
          : `Basemap failed to load: ${msg}`);
      }
    });
    map.once('style.load', () => { styleLoaded = true; setMapError(null); });
    const loadTimeout = setTimeout(() => {
      if (!styleLoaded) setMapError(`Basemap did not load after 15 seconds on ${window.location.hostname}. The map tile service may be down or blocked.`);
    }, 15000);

    const setupLayers = () => {
      try {
        const style = map.getStyle();
        const layers = style?.layers || [];

        // Adjust basemap theme to Intent Digital standards (matching InvestorMap.jsx)
        for (const layer of layers) {
          const id = layer.id;

          // Hide cluttered POI icons, transit, and business labels
          if (id.includes('poi') || id.includes('transit') || id.includes('business') ||
              id.includes('railway') || id.includes('aeroway') || id.includes('highway-name') ||
              id.includes('shield') || id.includes('landuse') || id.includes('building') ||
              id.includes('boundary') || id.includes('housenumber')) {
            try { map.setLayoutProperty(id, 'visibility', 'none'); } catch (_) {}
          }

          // Water: soft muted blue-gray (#CBD5E1) — crystal clear coastlines, Atlantic ocean & waterways
          if (layer.type === 'fill' && id.includes('water')) {
            try { map.setPaintProperty(id, 'fill-color', '#DCE0DF'); } catch (_) {}
          }

          // Parks & green spaces: soft sage
          if (layer.type === 'fill' && (id.includes('park') || id.includes('national-park') || id.includes('green') || id.includes('landcover'))) {
            try { map.setPaintProperty(id, 'fill-color', '#ECE6DC'); } catch (_) {}
          }

          // Land & background: warm cream (#F2ECE4)
          if (layer.type === 'background') {
            try { map.setPaintProperty(id, 'background-color', '#F5F1EA'); } catch (_) {}
          }

          // Roads: clean white
          if (layer.type === 'line' && (id.includes('road') || id.includes('street') || id.includes('motorway') || id.includes('highway'))) {
            if (!id.includes('case') && !id.includes('casing')) {
              try { map.setPaintProperty(id, 'line-color', '#FFFFFF'); } catch (_) {}
            }
          }

          // Text labels: muted brown-gray with cream halo
          if (layer.type === 'symbol') {
            try {
              map.setPaintProperty(id, 'text-color', '#5E4E42');
              map.setPaintProperty(id, 'text-halo-color', '#FAF8F5');
              map.setPaintProperty(id, 'text-halo-width', 1.2);
            } catch (_) {}
          }
        }

        // Find the first symbol layer so ZCTA polygons are inserted UNDER labels
        const firstSymbolLayer = layers.find((l) => l.type === 'symbol');
        const beforeId = firstSymbolLayer ? firstSymbolLayer.id : undefined;

        // Add ZCTA GeoJSON source
        if (!map.getSource('zcta-boundaries')) {
          map.addSource('zcta-boundaries', {
            type: 'geojson',
            data: zctaGeoJson
          });
        }

        // Add ZCTA Fill layer (choropleth) UNDERNEATH city labels
        if (!map.getLayer('zcta-fills')) {
          map.addLayer({
            id: 'zcta-fills',
            type: 'fill',
            source: 'zcta-boundaries',
            paint: {
              'fill-color': COLORS.lowData,
              'fill-opacity': 0.72
            }
          }, beforeId);
        }

        // Add ZCTA Line layer (borders) UNDERNEATH city labels
        if (!map.getLayer('zcta-lines')) {
          map.addLayer({
            id: 'zcta-lines',
            type: 'line',
            source: 'zcta-boundaries',
            paint: {
              'line-color': '#FFFFFF',
              'line-width': 1,
              'line-opacity': 0.9
            }
          }, beforeId);
        }

        // Add Deal Dots Source
        if (!map.getSource('deal-dots')) {
          map.addSource('deal-dots', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          });
        }

        // Add Deal Dots Layer (Flip = burgundy, New Build = espresso)
        if (!map.getLayer('deal-dots-layer')) {
          map.addLayer({
            id: 'deal-dots-layer',
            type: 'circle',
            source: 'deal-dots',
            paint: {
              'circle-color': [
                'case',
                ['==', ['get', 'deal_type'], 'demo_new_build'],
                COLORS.espresso,
                DOT_FLIP
              ],
              // Small at region view, grows when zooming in; bigger spread = bigger dot
              'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                8, ['interpolate', ['linear'], ['get', 'jump_dollars'], 50000, 2, 1000000, 4.5],
                11, ['interpolate', ['linear'], ['get', 'jump_dollars'], 50000, 3.5, 1000000, 8],
                14, ['interpolate', ['linear'], ['get', 'jump_dollars'], 50000, 6, 1000000, 13]
              ],
              'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 0.75, 12, 1.5],
              'circle-stroke-color': '#FFFFFF',
              'circle-opacity': 0.92
            }
          }, beforeId);
        }

        // Fit bounds to South Florida / selected county initially
        const initialBounds = COUNTY_BOUNDS[selectedCounty?.toLowerCase()] || SOUTH_FLORIDA_BOUNDS;
        try {
          map.fitBounds(initialBounds, { padding: 24, duration: 0 });
        } catch (_) {}
        map.resize();
        setMapLoaded(true);
      } catch (err) {
        console.error('OpportunityMap setupLayers error:', err);
        setMapLoaded(true);
      }
    };

    map.on('load', setupLayers);

    // Hover on ZCTA
    map.on('mousemove', 'zcta-fills', (e) => {
      if (e.features && e.features.length > 0) {
        const feat = e.features[0];
        const zip = feat.properties?.zip || feat.properties?.ZCTA5;
        if (zip) {
          setHoveredZip(zip);
          map.getCanvas().style.cursor = 'pointer';
        }
      }
    });

    map.on('mouseleave', 'zcta-fills', () => {
      map.getCanvas().style.cursor = '';
      setHoveredZip(null);
    });

    // Click on ZCTA
    map.on('click', 'zcta-fills', (e) => {
      if (e.features && e.features.length > 0) {
        const feat = e.features[0];
        const zip = feat.properties?.zip || feat.properties?.ZCTA5;
        if (zip) {
          setSelectedZip(zip);
        }
      }
    });

    // Click on Deal Dot
    map.on('mouseenter', 'deal-dots-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'deal-dots-layer', () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('click', 'deal-dots-layer', (e) => {
      if (e.features && e.features.length > 0) {
        const dot = e.features[0].properties;
        if (onOpenDealBreakdownRef.current) {
          onOpenDealBreakdownRef.current(dot);
        }
      }
    });

    // Viewport change (debounced)
    let moveTimeout = null;
    map.on('moveend', () => {
      clearTimeout(moveTimeout);
      moveTimeout = setTimeout(() => {
        const b = map.getBounds();
        setViewportBbox({
          minLng: b.getWest(),
          minLat: b.getSouth(),
          maxLng: b.getEast(),
          maxLat: b.getNorth()
        });
      }, 350);
    });

    // ResizeObserver to automatically resize map when container mounts / changes size
    let ro = null;
    if (typeof window !== 'undefined' && window.ResizeObserver && mapContainerRef.current) {
      ro = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      });
      ro.observe(mapContainerRef.current);
    }

    const handleWindowResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };
    window.addEventListener('resize', handleWindowResize);
    document.addEventListener('visibilitychange', handleWindowResize);

    return () => {
      clearTimeout(loadTimeout);
      window.removeEventListener('resize', handleWindowResize);
      document.removeEventListener('visibilitychange', handleWindowResize);
      if (ro) ro.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Fit bounds when selectedCounty changes or map finishes loading
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const bounds = COUNTY_BOUNDS[selectedCounty?.toLowerCase()] || SOUTH_FLORIDA_BOUNDS;
    try {
      map.fitBounds(bounds, { padding: 32, duration: 650 });
      map.resize();
    } catch (_) {}
  }, [selectedCounty, mapLoaded]);

  // Ensure map is resized upon becoming loaded
  useEffect(() => {
    if (mapLoaded && mapRef.current) {
      mapRef.current.resize();
    }
  }, [mapLoaded]);

  // Update Polygon Colors when layer or aggregates change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getLayer('zcta-fills')) return;

    if (aggregates.length === 0) {
      map.setPaintProperty('zcta-fills', 'fill-color', COLORS.lowData);
      return;
    }

    const [q1, q2, q3, q4] = layerQuantiles;

    // Build Mapbox match expression for fill-color
    const colorRules = ['match', ['get', 'zip']];

    for (const a of aggregates) {
      if (a.deal_count < 3) {
        colorRules.push(a.zip, COLORS.lowData);
        continue;
      }

      let val = a.est_profit_likely;
      if (activeLayer === 'months') val = a.median_hold_months;
      if (activeLayer === 'dom') val = a.median_dom;
      if (activeLayer === 'deal_count') val = a.deal_count;

      let color = BURGUNDY_SCALE[2];
      // For months / DOM, faster (lower number) is darker burgundy
      if (activeLayer === 'months' || activeLayer === 'dom') {
        if (val <= q1) color = BURGUNDY_SCALE[4]; // fastest = dark
        else if (val <= q2) color = BURGUNDY_SCALE[3];
        else if (val <= q3) color = BURGUNDY_SCALE[2];
        else if (val <= q4) color = BURGUNDY_SCALE[1];
        else color = BURGUNDY_SCALE[0]; // slowest = light
      } else {
        if (val >= q4) color = BURGUNDY_SCALE[4]; // highest profit/deals = dark
        else if (val >= q3) color = BURGUNDY_SCALE[3];
        else if (val >= q2) color = BURGUNDY_SCALE[2];
        else if (val >= q1) color = BURGUNDY_SCALE[1];
        else color = BURGUNDY_SCALE[0];
      }

      colorRules.push(a.zip, color);
    }

    // Default fallback color
    colorRules.push(COLORS.lowData);

    try {
      map.setPaintProperty('zcta-fills', 'fill-color', colorRules);
    } catch (e) {
      console.warn('Could not update map paint expression:', e);
    }
  }, [mapLoaded, aggregates, activeLayer, layerQuantiles]);

  // Update Polygon Borders on hover and selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getLayer('zcta-lines')) return;

    try {
      const activeZip = selectedZip || '';
      const hoverZip = hoveredZip || '';

      map.setPaintProperty('zcta-lines', 'line-width', [
        'case',
        ['==', ['get', 'zip'], activeZip],
        3.0,
        ['==', ['get', 'zip'], hoverZip],
        2.0,
        0.8
      ]);

      map.setPaintProperty('zcta-lines', 'line-opacity', [
        'case',
        ['==', ['get', 'zip'], activeZip],
        1.0,
        ['==', ['get', 'zip'], hoverZip],
        0.9,
        0.45
      ]);
    } catch (_) {}
  }, [mapLoaded, selectedZip, hoveredZip]);

  // Update Deal Dots Layer GeoJSON
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getSource('deal-dots')) return;

    const features = dots
      .filter((d) => Number.isFinite(d.lng) && Number.isFinite(d.lat))
      .map((d) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
        properties: { ...d }
      }));

    map.getSource('deal-dots').setData({
      type: 'FeatureCollection',
      features
    });
  }, [mapLoaded, dots]);

  // Zoom to selected ZIP area
  const handleSelectRankItem = (item) => {
    setSelectedZip(item.zip);
    const map = mapRef.current;
    if (!map) return;

    // Find centroid in GeoJSON
    const feat = zctaGeoJson.features.find((f) => f.properties?.zip === item.zip || f.properties?.ZCTA5 === item.zip);
    if (feat && feat.geometry) {
      let coords = feat.geometry.coordinates;
      while (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
        coords = coords[0];
      }
      if (coords && coords.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        coords.forEach((pt) => bounds.extend(pt));
        map.fitBounds(bounds, { padding: 80, maxZoom: 12.5, duration: 900 });
      }
    }
  };

  const activeFilterChips = [
    selectedCounty !== 'all' && { key: 'county', label: COUNTIES.find((c) => c.id === selectedCounty)?.label, clear: () => setSelectedCounty('all') },
    priceBand !== 'all' && { key: 'price', label: PRICE_BANDS.find((p) => p.id === priceBand)?.label, clear: () => setPriceBand('all') },
    lookbackMonths !== 24 && { key: 'window', label: LOOKBACK_OPTIONS.find((o) => o.id === lookbackMonths)?.label, clear: () => setLookbackMonths(24) },
    sqftBand !== 'all' && { key: 'sf', label: SF_BANDS.find((o) => o.id === sqftBand)?.label, clear: () => setSqftBand('all') },
    minBeds !== 0 && { key: 'beds', label: BED_OPTIONS.find((o) => o.id === minBeds)?.label, clear: () => setMinBeds(0) }
  ].filter(Boolean);

  const segBtn = (active) => ({
    padding: '7px 13px',
    borderRadius: '9px',
    border: 'none',
    backgroundColor: active ? COLORS.espresso : 'transparent',
    color: active ? COLORS.cream : '#5E544C',
    fontFamily: SANS,
    fontSize: '12px',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    transition: 'background-color 0.18s ease, color 0.18s ease',
    whiteSpace: 'nowrap'
  });
  const segWrap = { display: 'inline-flex', gap: '2px', padding: '3px', borderRadius: '12px', backgroundColor: COLORS.beige };
  const selectStyle = {
    width: '100%',
    padding: '9px 10px',
    borderRadius: '10px',
    border: `1px solid ${COLORS.border}`,
    backgroundColor: COLORS.white,
    color: COLORS.espresso,
    fontFamily: SANS,
    fontSize: '12px',
    cursor: 'pointer'
  };
  const filterField = (label, value, onChange, options, numeric = false) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={LABEL_STYLE}>{label}</span>
      <select value={value} onChange={(e) => onChange(numeric ? Number(e.target.value) : e.target.value)} style={selectStyle}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
  const rankValues = rankings.map((r) => Math.abs(Number(r.metric_value) || 0)).filter((v) => v > 0);
  const maxRankValue = rankValues.length ? Math.max(...rankValues) : 1;
  const minRankValue = rankValues.length ? Math.min(...rankValues) : 1;
  const rankBarPct = (r) => {
    const v = Math.abs(Number(r.metric_value) || 0);
    if (!v) return 0;
    if (activeLayer === 'months' || activeLayer === 'dom') return Math.round((minRankValue / v) * 100);
    return Math.round((v / maxRankValue) * 100);
  };
  const totalDeals = aggregates.reduce((n, a) => n + (Number(a.deal_count) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: SANS, color: COLORS.espresso }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ ...LABEL_STYLE, margin: '0 0 8px' }}>Opportunity map · county deeds</p>
          <h2 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(28px, 3vw, 40px)', lineHeight: 1.05, color: COLORS.espresso }}>
            Where the money is made, <em>and how fast.</em>
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: '11px', color: '#7A6E64' }}>
          {loading ? 'Updating…' : `${totalDeals.toLocaleString()} deals on the map`}
        </p>
      </div>

      {/* MAP VIEWPORT & FLOATING OVERLAYS */}
      <div style={{ position: 'relative', width: '100%', height: 'max(640px, 76vh)', borderRadius: '24px', overflow: 'hidden', border: `1px solid ${COLORS.border}`, backgroundColor: '#F5F1EA' }}>
        {tokenMissing ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: COLORS.espresso, padding: '40px', textAlign: 'center' }}>
            <p>Mapbox access token is required to display the Opportunity Map. Set VITE_MAPBOX_TOKEN in your environment.</p>
          </div>
        ) : (
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
        )}

        {mapError && !tokenMissing && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, maxWidth: '440px', background: '#FFFFFF', border: '1px solid #E4DDD3', borderRadius: '12px', padding: '20px 24px', textAlign: 'center', color: COLORS.espresso, boxShadow: '0 8px 24px rgba(27,19,13,0.08)' }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color: COLORS.burgundy, marginBottom: '8px' }}>Map could not load</div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '13px', lineHeight: 1.5 }}>{mapError}</div>
          </div>
        )}

        {/* LOADING INDICATOR PILL */}
        {loading && (
          <div style={{
            position: 'absolute',
            top: '118px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 14px',
            borderRadius: '999px',
            backgroundColor: 'rgba(27, 19, 13, 0.92)',
            color: COLORS.cream,
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            backdropFilter: 'blur(4px)',
            zIndex: 10
          }}>
            Loading market aggregates…
          </div>
        )}

        {/* FLOATING TOOLBAR */}
        <div style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px', zIndex: 8, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'auto', maxWidth: '100%' }}>
            <div style={{ ...FLOAT, display: 'flex', alignItems: 'center', gap: '8px', padding: '5px', borderRadius: '16px', flexWrap: 'wrap' }}>
              <div style={segWrap} role="group" aria-label="Color the map by">
                {LAYERS.map((layer) => (
                  <button key={layer.id} type="button" title={layer.desc} onClick={() => setActiveLayer(layer.id)} style={segBtn(activeLayer === layer.id)}>
                    {SHORT_LAYER[layer.id] || layer.label}
                  </button>
                ))}
              </div>
              <span style={{ width: '1px', height: '22px', backgroundColor: COLORS.border }} />
              <div style={segWrap} role="group" aria-label="Deal type">
                {DEAL_TYPES.map((dt) => (
                  <button key={dt.id} type="button" onClick={() => setActiveDealType(dt.id)} style={segBtn(activeDealType === dt.id)}>
                    {SHORT_DEAL[dt.id] || dt.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                aria-expanded={filtersOpen}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 13px', borderRadius: '10px', border: `1px solid ${filtersOpen ? COLORS.espresso : COLORS.border}`, backgroundColor: COLORS.white, color: COLORS.espresso, fontFamily: SANS, fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}
              >
                Filters
                {activeFilterChips.length > 0 && (
                  <span style={{ backgroundColor: COLORS.burgundy, color: COLORS.cream, borderRadius: '999px', fontSize: '10px', fontWeight: 600, padding: '1px 7px' }}>{activeFilterChips.length}</span>
                )}
              </button>
            </div>

            {filtersOpen && (
              <div style={{ ...FLOAT, borderRadius: '16px', padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', width: 'min(560px, calc(100vw - 80px))', boxSizing: 'border-box' }}>
                {filterField('County', selectedCounty, setSelectedCounty, COUNTIES)}
                {filterField('Exit price', priceBand, setPriceBand, PRICE_BANDS)}
                {filterField('Window', lookbackMonths, setLookbackMonths, LOOKBACK_OPTIONS, true)}
                {filterField('Living sf', sqftBand, setSqftBand, SF_BANDS)}
                {filterField('Beds', minBeds, setMinBeds, BED_OPTIONS, true)}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" onClick={() => { setSelectedCounty('all'); setPriceBand('all'); setLookbackMonths(24); setSqftBand('all'); setMinBeds(0); }} style={{ border: 'none', background: 'transparent', color: '#7A6E64', fontFamily: SANS, fontSize: '11.5px', cursor: 'pointer', padding: '9px 4px' }}>Reset</button>
                  <button type="button" onClick={() => setFiltersOpen(false)} style={{ border: 'none', borderRadius: '999px', backgroundColor: COLORS.burgundy, color: COLORS.cream, fontFamily: SANS, fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.14em', padding: '9px 16px', cursor: 'pointer' }}>DONE →</button>
                </div>
              </div>
            )}

            {!filtersOpen && activeFilterChips.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {activeFilterChips.map((c) => (
                  <button key={c.key} type="button" onClick={c.clear} title="Remove filter" style={{ padding: '5px 10px', borderRadius: '999px', backgroundColor: 'rgba(255,255,255,0.94)', border: `1px solid ${COLORS.border}`, fontFamily: SANS, fontSize: '11px', color: COLORS.espresso, cursor: 'pointer' }}>
                    {c.label} <span style={{ color: '#7A6E64', marginLeft: '2px' }}>×</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* LEGEND (bottom right) */}
        <div style={{ ...FLOAT, position: 'absolute', right: '16px', bottom: '16px', zIndex: 5, borderRadius: '14px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '10.5px', color: '#5E544C', maxWidth: 'calc(100% - 340px)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={LABEL_STYLE}>{SHORT_LAYER[activeLayer]}</span>
            <span>{activeLayer === 'months' || activeLayer === 'dom' ? 'Slower' : 'Lower'}</span>
            {BURGUNDY_SCALE.map((color) => <span key={color} style={{ width: '18px', height: '8px', borderRadius: '2px', backgroundColor: color }} />)}
            <span>{activeLayer === 'months' || activeLayer === 'dom' ? 'Faster' : 'Higher'}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: DOT_FLIP }} />Flip</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: COLORS.espresso }} />Build</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '11px', height: '8px', borderRadius: '2px', backgroundColor: '#EDE7DE', border: '1px dashed #B9AEA2' }} />Under 3 deals</span>
          {activeLayer === 'dom' && <span style={{ color: COLORS.burgundy }}>Days on market: Redfin</span>}
        </div>

        {/* TOP AREAS (collapsible, bottom left) */}
        {rankings.length > 0 && (rankOpen ? (
          <div style={{ ...FLOAT, position: 'absolute', left: '16px', bottom: '16px', width: '290px', maxWidth: 'calc(100% - 32px)', zIndex: 5, borderRadius: '16px', padding: '14px 12px 8px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px 6px' }}>
              <span style={{ fontFamily: SERIF, fontSize: '19px' }}>Top areas <em>by {(SHORT_LAYER[activeLayer] || '').toLowerCase()}</em></span>
              <button type="button" onClick={() => setRankOpen(false)} aria-label="Collapse top areas" style={{ border: 'none', background: 'transparent', color: '#7A6E64', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>–</button>
            </div>
            {rankings.map((r) => {
              const isSelected = selectedZip === r.zip;
              return (
                <button
                  key={r.zip}
                  type="button"
                  onClick={() => handleSelectRankItem(r)}
                  style={{ width: '100%', display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr) auto', gap: '10px', alignItems: 'center', padding: '7px 6px', border: 'none', borderRadius: '8px', backgroundColor: isSelected ? COLORS.beige : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: SANS, color: COLORS.espresso, transition: 'background-color 0.15s ease' }}
                >
                  <span style={{ fontFamily: SERIF, fontSize: '15px', color: '#7A6E64' }}>{r.rank}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: '11.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                      <b style={{ fontWeight: 600 }}>{r.zip}</b> <span style={{ color: '#7A6E64' }}>{r.city}</span>
                    </span>
                    <span style={{ display: 'block', height: '3px', backgroundColor: '#EFEAE3', borderRadius: '2px', marginTop: '5px' }}>
                      <span style={{ display: 'block', height: '3px', width: `${rankBarPct(r)}%`, backgroundColor: '#6E2231', borderRadius: '2px', transition: 'width 0.4s ease' }} />
                    </span>
                  </span>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: COLORS.burgundy, whiteSpace: 'nowrap' }}>{r.metric_label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRankOpen(true)}
            style={{ ...FLOAT, position: 'absolute', left: '16px', bottom: '16px', zIndex: 5, borderRadius: '999px', padding: '9px 16px', fontFamily: SANS, fontSize: '11.5px', color: COLORS.espresso, cursor: 'pointer' }}
          >
            <span style={{ fontFamily: SERIF, fontSize: '16px' }}>Top areas</span>
            <span style={{ color: '#7A6E64' }}> · {rankings[0]?.zip} {rankings[0]?.city} leads · {rankings[0]?.metric_label}</span>
            <span style={{ color: COLORS.burgundy }}> ▾</span>
          </button>
        ))}

        {/* SIDE DETAIL PANEL (Area Click) */}
        {selectedArea && (
          <div style={{
            position: 'absolute',
            top: '76px',
            right: '16px',
            width: '340px',
            maxHeight: 'calc(100% - 160px)',
            overflowY: 'auto',
            backgroundColor: COLORS.white,
            borderRadius: '10px',
            padding: '18px 20px',
            border: `1px solid ${COLORS.border}`,
            boxShadow: '0 8px 28px rgba(27, 19, 13, 0.14)',
            zIndex: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-serif, "Playfair Display", serif)', fontSize: '20px', fontWeight: 700, color: COLORS.espresso }}>
                    ZIP {selectedArea.zip}
                  </h3>
                  <span style={{ padding: '2px 7px', borderRadius: '4px', backgroundColor: COLORS.beige, border: `1px solid ${COLORS.border}`, color: COLORS.espresso, fontSize: '9.5px', fontWeight: 700 }}>
                    {selectedArea.county}
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: 'rgba(27, 19, 13, 0.65)', marginTop: '2px' }}>
                  {selectedArea.city || 'South Florida Market'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedZip(null)}
                style={{ border: 'none', background: 'transparent', fontSize: '16px', color: 'rgba(27, 19, 13, 0.5)', cursor: 'pointer', padding: '2px' }}
              >
                ✕
              </button>
            </div>

            {/* Key Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: COLORS.cream, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(27, 19, 13, 0.6)' }}>
                  Est. Net Profit
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: COLORS.burgundy, marginTop: '2px' }}>
                  {fmtDollar(selectedArea.est_profit_low)} – {fmtDollar(selectedArea.est_profit_likely)}
                </div>
                <div style={{ fontSize: '9.5px', color: 'rgba(27, 19, 13, 0.5)', marginTop: '1px' }}>
                  Median spread: {fmtDollar(selectedArea.median_jump_dollars)}
                </div>
              </div>

              <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: COLORS.cream, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(27, 19, 13, 0.6)' }}>
                  Total Deals
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: COLORS.espresso, marginTop: '2px' }}>
                  {selectedArea.deal_count} Completed
                </div>
                <div style={{ fontSize: '9.5px', color: 'rgba(27, 19, 13, 0.5)', marginTop: '1px' }}>
                  {selectedArea.flip_count} flips · {selectedArea.new_build_count} builds
                </div>
              </div>

              <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: COLORS.cream, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(27, 19, 13, 0.6)' }}>
                  Buy → Sell Speed
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: COLORS.espresso, marginTop: '2px' }}>
                  {selectedArea.median_hold_months || '—'} Months
                </div>
                <div style={{ fontSize: '9.5px', color: 'rgba(27, 19, 13, 0.5)', marginTop: '1px' }}>
                  Recorded deed duration
                </div>
              </div>

              <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: COLORS.cream, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(27, 19, 13, 0.6)' }}>
                  Days on Market
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: COLORS.espresso, marginTop: '2px' }}>
                  {selectedArea.median_dom || '—'} Days
                </div>
                <div style={{ fontSize: '9px', fontWeight: 600, color: COLORS.burgundy, marginTop: '2px' }}>
                  Days on market data: Redfin
                </div>
              </div>
            </div>

            {/* Best Product Here Card */}
            {selectedArea.best_product && (
              <div style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: COLORS.beige,
                border: `1px solid ${COLORS.border}`
              }}>
                <div style={{ fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.burgundy }}>
                  BEST PRODUCT HERE
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: COLORS.espresso, marginTop: '3px' }}>
                  {selectedArea.best_product.deal_type === 'demo_new_build' ? 'New Build' : 'Flip'} · {selectedArea.best_product.beds} Bed / {selectedArea.best_product.baths} Bath · {selectedArea.best_product.sqft_band}
                </div>
                <div style={{ fontSize: '10.5px', color: 'rgba(27, 19, 13, 0.7)', marginTop: '2px' }}>
                  Highest spread: +{fmtDollar(selectedArea.best_product.median_jump)} median jump ({selectedArea.best_product.min_deals}+ deals)
                </div>
              </div>
            )}

            {/* One-Line Market Insight */}
            <div style={{ fontSize: '11px', fontStyle: 'italic', color: 'rgba(27, 19, 13, 0.75)', lineHeight: 1.45, padding: '2px 4px' }}>
              “{selectedArea.insight}”
            </div>

            {/* Action Button: Navigate to Finder */}
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (onOpenFinder) {
                  onOpenFinder({
                    zip: selectedArea.zip,
                    dealType: activeDealType
                  });
                }
              }}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              See {selectedArea.deal_count} deals in Finder →
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
