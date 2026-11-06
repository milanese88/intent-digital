import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Short price formatter: e.g. $499K, $1.2M, $850K
function formatShortPrice(price) {
  if (price == null || price === '' || isNaN(price)) return '—';
  const num = Number(price);
  if (num >= 1000000) {
    const m = (num / 1000000).toFixed(1).replace(/\.0$/, '');
    return `$${m}M`;
  }
  if (num >= 1000) {
    const k = Math.round(num / 1000);
    return `$${k}K`;
  }
  return `$${num}`;
}

function formatFullPrice(price) {
  if (price == null || price === '' || isNaN(price)) return '—';
  return `$${Number(price).toLocaleString('en-US')}`;
}

export default function InvestorMap({
  pins = [],
  selectedId = null,
  hoveredId = null,
  onSelectPin = null,
  onOpenProperty = null,
  showLegend = true,
  className = '',
  style = {}
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map()); // id -> { marker, element, popup }
  const [mapLoaded, setMapLoaded] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

  // Initialize Map
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
      center: [-80.1373, 26.1224], // Fort Lauderdale default
      zoom: 11,
      attributionControl: false
    });

    // Add navigation zoom +/- controls to top-right
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      setMapLoaded(true);

      // Adjust paint colors to match site theme
      try {
        const layers = map.getStyle().layers || [];
        for (const layer of layers) {
          const id = layer.id;

          // Hide POI icons, business labels, and transit labels
          if (id.includes('poi') || id.includes('transit') || id.includes('business')) {
            map.setLayoutProperty(id, 'visibility', 'none');
          }

          // Water: soft muted blue-gray
          if (layer.type === 'fill' && id.includes('water')) {
            map.setPaintProperty(id, 'fill-color', '#CBD5E1');
          }

          // Parks & green spaces: soft sage
          if (layer.type === 'fill' && (id.includes('park') || id.includes('national-park') || id.includes('green') || id.includes('landcover'))) {
            map.setPaintProperty(id, 'fill-color', '#DCE5D8');
          }

          // Land & background: warm cream (#ECE6DC range)
          if (layer.type === 'background') {
            map.setPaintProperty(id, 'background-color', '#F2ECE4');
          }

          // Roads: clean white
          if (layer.type === 'line' && (id.includes('road') || id.includes('street') || id.includes('motorway') || id.includes('highway'))) {
            if (!id.includes('case')) {
              map.setPaintProperty(id, 'line-color', '#FFFFFF');
            }
          }

          // Text labels: muted brown-gray
          if (layer.type === 'symbol') {
            try {
              map.setPaintProperty(id, 'text-color', '#5E4E42');
              map.setPaintProperty(id, 'text-halo-color', '#FAF8F5');
              map.setPaintProperty(id, 'text-halo-width', 1.5);
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn('Mapbox custom theme styling warning:', err);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [MAPBOX_TOKEN]);

  // Sync Markers & Bounds when pins or mapLoaded changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Filter pins with valid coordinates
    const validPins = pins.filter(p => p.lat != null && p.lng != null && !isNaN(p.lat) && !isNaN(p.lng));

    // Remove obsolete markers
    const currentPinIds = new Set(validPins.map(p => String(p.id)));
    for (const [id, entry] of markersRef.current.entries()) {
      if (!currentPinIds.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Add or update markers
    validPins.forEach(pin => {
      const pinId = String(pin.id);
      const isSaved = pin.type === 'property';
      const isSelected = selectedId === pin.id;
      const isHovered = hoveredId === pin.id;

      let entry = markersRef.current.get(pinId);

      if (!entry) {
        // Create custom HTML marker element
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `investor-marker-pill ${isSaved ? 'is-saved' : 'is-comp'}`;
        el.setAttribute('aria-label', `${isSaved ? 'Saved' : 'Sold comp'}: ${pin.address || ''}, ${formatFullPrice(pin.price)}`);

        // Pill text
        const shortPrice = formatShortPrice(pin.price);
        el.innerText = isSaved ? shortPrice : `Sold ${shortPrice}`;

        // Create Popup
        const popupContent = document.createElement('div');
        popupContent.className = 'investor-popup-card';
        popupContent.innerHTML = `
          <div class="investor-popup-type">${isSaved ? 'SAVED PROPERTY' : 'SOLD COMP'}</div>
          <div class="investor-popup-address">${pin.address || ''}</div>
          <div class="investor-popup-price">${formatFullPrice(pin.price)}</div>
          ${pin.specs ? `<div class="investor-popup-specs">${pin.specs}</div>` : ''}
          ${isSaved && onOpenProperty ? `<button type="button" class="investor-popup-open-link">Open details &rarr;</button>` : ''}
        `;

        // Handle open click inside popup
        const openBtn = popupContent.querySelector('.investor-popup-open-link');
        if (openBtn) {
          openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onOpenProperty) onOpenProperty(pin.id);
          });
        }

        const popup = new mapboxgl.Popup({
          offset: [0, -14],
          closeButton: false,
          closeOnClick: false,
          className: 'investor-mapbox-popup'
        }).setDOMContent(popupContent);

        // Marker hover & click listeners
        el.addEventListener('mouseenter', () => {
          popup.addTo(map);
          el.classList.add('is-hovered');
          if (onSelectPin) onSelectPin(pin.id);
        });

        el.addEventListener('mouseleave', () => {
          if (selectedId !== pin.id) {
            popup.remove();
          }
          el.classList.remove('is-hovered');
        });

        el.addEventListener('focus', () => {
          popup.addTo(map);
          el.classList.add('is-hovered');
        });

        el.addEventListener('blur', () => {
          if (selectedId !== pin.id) {
            popup.remove();
          }
          el.classList.remove('is-hovered');
        });

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onSelectPin) onSelectPin(pin.id);
          if (isSaved && onOpenProperty) {
            onOpenProperty(pin.id);
          }
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([pin.lng, pin.lat])
          .setPopup(popup)
          .addTo(map);

        entry = { marker, element: el, popup, pin };
        markersRef.current.set(pinId, entry);
      } else {
        // Update pin position & label if changed
        entry.marker.setLngLat([pin.lng, pin.lat]);
        const shortPrice = formatShortPrice(pin.price);
        entry.element.innerText = isSaved ? shortPrice : `Sold ${shortPrice}`;
      }

      // Update active/hover state classes
      if (isSelected || isHovered) {
        entry.element.classList.add('is-active');
        if (!entry.popup.isOpen()) {
          entry.popup.addTo(map);
        }
      } else {
        entry.element.classList.remove('is-active');
        if (entry.popup.isOpen() && selectedId !== pin.id) {
          entry.popup.remove();
        }
      }
    });

    // Fit Bounds
    if (validPins.length === 0) {
      map.flyTo({ center: [-80.1373, 26.1224], zoom: 11, duration: 600 });
    } else if (validPins.length === 1) {
      map.flyTo({ center: [validPins[0].lng, validPins[0].lat], zoom: 15, duration: 600 });
    } else {
      const bounds = new mapboxgl.LngLatBounds();
      validPins.forEach(p => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 800 });
    }
  }, [pins, selectedId, hoveredId, mapLoaded]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      minHeight: '420px',
      borderRadius: '16px',
      border: '1px solid rgba(52, 41, 42, 0.1)',
      boxShadow: '0 4px 16px rgba(52, 41, 42, 0.04)',
      overflow: 'hidden',
      backgroundColor: '#FAF8F5',
      ...style
    }} className={className}>
      {tokenMissing ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--espresso, #34292A)'
        }}>
          <p style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '13px',
            color: 'rgba(52, 41, 42, 0.65)',
            margin: 0
          }}>
            Mapbox token not configured. Set <code>VITE_MAPBOX_TOKEN</code> in your environment.
          </p>
        </div>
      ) : (
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      )}

      {/* Small Legend in Bottom-Left Corner */}
      {showLegend && !tokenMissing && (
        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          backgroundColor: 'rgba(250, 248, 245, 0.92)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(52, 41, 42, 0.12)',
          borderRadius: '8px',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.08)',
          pointerEvents: 'none',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              borderRadius: '50px',
              backgroundColor: 'var(--secondary-color, #41101B)',
              border: '1.5px solid #FAF8F5',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
            <span style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--espresso, #1E1509)'
            }}>
              Saved property
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              borderRadius: '50px',
              backgroundColor: '#FAF8F5',
              border: '1.5px solid rgba(52, 41, 42, 0.4)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
            <span style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--espresso, #1E1509)'
            }}>
              Sold comp
            </span>
          </div>
        </div>
      )}

      {/* Component Styles */}
      <style>{`
        .investor-marker-pill {
          display: inline-flex;
          align-items: center;
          justifyContent: center;
          border-radius: 50px;
          border: 2px solid #FAF8F5;
          padding: 4px 10px;
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
          white-space: nowrap;
          user-select: none;
        }
        .investor-marker-pill.is-saved {
          background-color: var(--secondary-color, #41101B);
          color: var(--lighter-tone, #FAF8F5);
        }
        .investor-marker-pill.is-comp {
          background-color: var(--lighter-tone, #FAF8F5);
          color: var(--espresso, #1E1509);
          border-color: rgba(52, 41, 42, 0.35);
        }
        .investor-marker-pill:hover,
        .investor-marker-pill.is-hovered,
        .investor-marker-pill.is-active {
          transform: scale(1.12) translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
          z-index: 100 !important;
          border-color: #D4AF37;
        }

        /* Mapbox Popup Styling */
        .investor-mapbox-popup .mapboxgl-popup-content {
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid rgba(52, 41, 42, 0.12);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14);
          background-color: #FAF8F5;
          min-width: 170px;
          max-width: 240px;
        }
        .investor-mapbox-popup .mapboxgl-popup-tip {
          border-top-color: #FAF8F5;
        }
        .investor-popup-type {
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--secondary-color, #41101B);
          margin-bottom: 3px;
        }
        .investor-popup-address {
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 12px;
          font-weight: 600;
          color: var(--espresso, #1E1509);
          line-height: 1.3;
          margin-bottom: 4px;
        }
        .investor-popup-price {
          font-family: var(--font-display, "Atelier Fleur", Georgia, serif);
          font-size: 18px;
          font-weight: 600;
          color: var(--espresso, #1E1509);
          line-height: 1.15;
          margin-bottom: 4px;
        }
        .investor-popup-specs {
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 11px;
          color: rgba(52, 41, 42, 0.65);
          margin-bottom: 6px;
        }
        .investor-popup-open-link {
          display: inline-block;
          background: none;
          border: none;
          padding: 0;
          color: var(--secondary-color, #41101B);
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 11px;
          font-weight: 600;
          text-decoration: underline;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
