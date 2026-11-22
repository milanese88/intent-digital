import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
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

function fmtDollar(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(Math.round(n));
  if (abs >= 1000000) return `$${(abs / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1000) return `$${Math.round(abs / 1000)}K`;
  return `$${abs}`;
}

export default function OpportunityMap({
  onOpenFinder = null,
  onOpenDealBreakdown = null
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

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

  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

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
        beds: String(minBeds)
      });

      if (viewportBbox) {
        qs.set('bbox', `${viewportBbox.minLng},${viewportBbox.minLat},${viewportBbox.maxLng},${viewportBbox.maxLat}`);
        qs.set('include_dots', 'true');
      } else if (selectedZip) {
        qs.set('zip', selectedZip);
        qs.set('include_dots', 'true');
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

  // Initialize Mapbox
  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      setTokenMissing(true);
      return;
    }

    if (!mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-80.12, 26.45], // South Florida regional center
      zoom: 9.2,
      attributionControl: false
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      mapRef.current = map;
      setMapLoaded(true);

      // Mute map background according to Intent Digital brand tokens
      try {
        const layers = map.getStyle().layers || [];
        for (const layer of layers) {
          if (layer.id.includes('poi') || layer.id.includes('transit')) {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
          }
          if (layer.type === 'fill' && layer.id.includes('water')) {
            map.setPaintProperty(layer.id, 'fill-color', '#E4DDD3');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.55);
          }
        }
      } catch (_) {}

      // Add ZCTA GeoJSON source
      map.addSource('zcta-boundaries', {
        type: 'geojson',
        data: zctaGeoJson,
        generateId: true
      });

      // Add ZCTA Fill layer (choropleth)
      map.addLayer({
        id: 'zcta-fills',
        type: 'fill',
        source: 'zcta-boundaries',
        paint: {
          'fill-color': COLORS.lowData,
          'fill-opacity': 0.65
        }
      });

      // Add ZCTA Line layer (borders)
      map.addLayer({
        id: 'zcta-lines',
        type: 'line',
        source: 'zcta-boundaries',
        paint: {
          'line-color': COLORS.espresso,
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            2.5,
            ['boolean', ['feature-state', 'hover'], false],
            2,
            0.6
          ],
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            1.0,
            ['boolean', ['feature-state', 'hover'], false],
            0.9,
            0.35
          ]
        }
      });

      // Add Deal Dots Source
      map.addSource('deal-dots', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add Deal Dots Layer (Flip = burgundy, New Build = espresso)
      map.addLayer({
        id: 'deal-dots-layer',
        type: 'circle',
        source: 'deal-dots',
        paint: {
          'circle-color': [
            'case',
            ['==', ['get', 'deal_type'], 'demo_new_build'],
            COLORS.espresso,
            COLORS.burgundy
          ],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'jump_dollars'],
            50000, 4,
            200000, 6,
            500000, 9,
            1000000, 13
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#FFFFFF',
          'circle-opacity': 0.88
        }
      });

      // Hover on ZCTA
      let lastHoveredId = null;
      map.on('mousemove', 'zcta-fills', (e) => {
        if (e.features.length > 0) {
          const feat = e.features[0];
          const zip = feat.properties?.zip || feat.properties?.ZCTA5;
          setHoveredZip(zip);
          map.getCanvas().style.cursor = 'pointer';

          if (lastHoveredId !== null) {
            map.setFeatureState({ source: 'zcta-boundaries', id: lastHoveredId }, { hover: false });
          }
          lastHoveredId = feat.id;
          map.setFeatureState({ source: 'zcta-boundaries', id: lastHoveredId }, { hover: true });
        }
      });

      map.on('mouseleave', 'zcta-fills', () => {
        map.getCanvas().style.cursor = '';
        setHoveredZip(null);
        if (lastHoveredId !== null) {
          map.setFeatureState({ source: 'zcta-boundaries', id: lastHoveredId }, { hover: false });
          lastHoveredId = null;
        }
      });

      // Click on ZCTA
      map.on('click', 'zcta-fills', (e) => {
        if (e.features.length > 0) {
          const feat = e.features[0];
          const zip = feat.properties?.zip || feat.properties?.ZCTA5;
          if (zip) {
            setSelectedZip(zip);
          }
        }
      });

      // Click on Deal Dot
      map.on('click', 'deal-dots-layer', (e) => {
        if (e.features.length > 0) {
          const dot = e.features[0].properties;
          if (onOpenDealBreakdown) {
            onOpenDealBreakdown(dot);
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
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [MAPBOX_TOKEN, onOpenDealBreakdown]);

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
        const bounds = new mapboxgl.LngLatBounds();
        coords.forEach((pt) => bounds.extend(pt));
        map.fitBounds(bounds, { padding: 80, maxZoom: 12.5, duration: 900 });
      }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '740px', backgroundColor: COLORS.cream, borderRadius: '12px', overflow: 'hidden', border: `1px solid ${COLORS.border}` }}>
      {/* TOP CONTROLS BAR */}
      <div style={{
        padding: '16px 20px',
        backgroundColor: COLORS.white,
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        {/* Layer Pills & Deal Type */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* Layer Pills */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(27, 19, 13, 0.6)', marginRight: '6px' }}>
              HEATMAP LAYER:
            </span>
            {LAYERS.map((layer) => {
              const active = activeLayer === layer.id;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setActiveLayer(layer.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '999px',
                    border: active ? `1.5px solid ${COLORS.burgundy}` : `1px solid ${COLORS.border}`,
                    backgroundColor: active ? COLORS.burgundy : COLORS.white,
                    color: active ? COLORS.cream : COLORS.espresso,
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '11px',
                    fontWeight: active ? 700 : 500,
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title={layer.desc}
                >
                  {layer.label}
                </button>
              );
            })}
          </div>

          {/* Deal Type Switcher */}
          <div style={{ display: 'inline-flex', padding: '3px', borderRadius: '999px', backgroundColor: COLORS.beige, border: `1px solid ${COLORS.border}` }}>
            {DEAL_TYPES.map((dt) => {
              const active = activeDealType === dt.id;
              return (
                <button
                  key={dt.id}
                  type="button"
                  onClick={() => setActiveDealType(dt.id)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '999px',
                    border: 'none',
                    backgroundColor: active ? COLORS.espresso : 'transparent',
                    color: active ? COLORS.cream : COLORS.espresso,
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '11px',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease'
                  }}
                >
                  {dt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary Filter Dropdowns */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* County */}
          <select
            value={selectedCounty}
            onChange={(e) => setSelectedCounty(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: `1px solid ${COLORS.border}`,
              backgroundColor: COLORS.white,
              color: COLORS.espresso,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {COUNTIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>

          {/* Price Band */}
          <select
            value={priceBand}
            onChange={(e) => setPriceBand(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: `1px solid ${COLORS.border}`,
              backgroundColor: COLORS.white,
              color: COLORS.espresso,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {PRICE_BANDS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>

          {/* Lookback Window */}
          <select
            value={lookbackMonths}
            onChange={(e) => setLookbackMonths(Number(e.target.value))}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: `1px solid ${COLORS.border}`,
              backgroundColor: COLORS.white,
              color: COLORS.espresso,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {LOOKBACK_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>

          {/* SF Band */}
          <select
            value={sqftBand}
            onChange={(e) => setSqftBand(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: `1px solid ${COLORS.border}`,
              backgroundColor: COLORS.white,
              color: COLORS.espresso,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {SF_BANDS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>

          {/* Beds */}
          <select
            value={minBeds}
            onChange={(e) => setMinBeds(Number(e.target.value))}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: `1px solid ${COLORS.border}`,
              backgroundColor: COLORS.white,
              color: COLORS.espresso,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {BED_OPTIONS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>

          {/* Deal Dot Legend */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px', color: 'rgba(27, 19, 13, 0.7)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: COLORS.burgundy, border: '1px solid #FFF' }}></span>
              Flip Dot
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: COLORS.espresso, border: '1px solid #FFF' }}></span>
              New Build Dot
            </span>
          </div>
        </div>
      </div>

      {/* MAP VIEWPORT & FLOATING OVERLAYS */}
      <div style={{ position: 'relative', width: '100%', height: '620px' }}>
        {tokenMissing ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: COLORS.espresso, padding: '40px', textAlign: 'center' }}>
            <p>Mapbox access token is required to display the Opportunity Map. Set VITE_MAPBOX_TOKEN in your environment.</p>
          </div>
        ) : (
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
        )}

        {/* LOADING INDICATOR PILL */}
        {loading && (
          <div style={{
            position: 'absolute',
            top: '16px',
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

        {/* 5-STEP COLOR SCALE LEGEND (Bottom Left) */}
        <div style={{
          position: 'absolute',
          bottom: '24px',
          left: '20px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '8px',
          padding: '10px 14px',
          border: `1px solid ${COLORS.border}`,
          boxShadow: '0 4px 14px rgba(27, 19, 13, 0.08)',
          zIndex: 5,
          pointerEvents: 'auto'
        }}>
          <div style={{ fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.espresso, marginBottom: '6px' }}>
            {LAYERS.find((l) => l.id === activeLayer)?.label} ({activeLayer === 'months' || activeLayer === 'dom' ? 'Dark = Faster' : 'Dark = Higher'})
            {activeLayer === 'dom' && <span style={{ marginLeft: '6px', color: COLORS.burgundy, fontWeight: 600 }}>· Days on market data: Redfin</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            {BURGUNDY_SCALE.map((color, idx) => (
              <div
                key={idx}
                style={{
                  width: '24px',
                  height: '10px',
                  borderRadius: '2px',
                  backgroundColor: color,
                  border: '0.5px solid rgba(27, 19, 13, 0.2)'
                }}
              />
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px', fontSize: '10px', color: 'rgba(27, 19, 13, 0.6)' }}>
              <div style={{ width: '12px', height: '10px', borderRadius: '2px', backgroundColor: COLORS.lowData, border: '0.5px dashed rgba(27, 19, 13, 0.4)' }} />
              <span>&lt;3 deals</span>
            </div>
          </div>
        </div>

        {/* RANKINGS CARD (Top Left Overlay) */}
        {rankings.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '20px',
            width: '230px',
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            borderRadius: '10px',
            padding: '12px 14px',
            border: `1px solid ${COLORS.border}`,
            boxShadow: '0 4px 18px rgba(27, 19, 13, 0.1)',
            zIndex: 5
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.burgundy }}>
                TOP 5 OPPORTUNITY AREAS
              </span>
              <span style={{ fontSize: '9px', color: 'rgba(27, 19, 13, 0.5)' }}>by {activeLayer}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {rankings.map((r) => {
                const isSelected = selectedZip === r.zip;
                return (
                  <div
                    key={r.zip}
                    onClick={() => handleSelectRankItem(r)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? COLORS.beige : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.12s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: COLORS.burgundy, width: '12px' }}>{r.rank}.</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: COLORS.espresso }}>{r.zip}</span>
                      <span style={{ fontSize: '10px', color: 'rgba(27, 19, 13, 0.6)', maxWidth: '75px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.city}
                      </span>
                    </div>
                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: COLORS.burgundy }}>
                      {r.metric_label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SIDE DETAIL PANEL (Area Click) */}
        {selectedArea && (
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '20px',
            width: '320px',
            maxHeight: '588px',
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

