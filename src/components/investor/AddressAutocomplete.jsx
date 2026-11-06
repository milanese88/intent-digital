import React, { useState, useEffect, useRef, useMemo } from 'react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Normalizes title casing for cities (e.g. "FORT LAUDERDALE" -> "Fort Lauderdale")
 */
export function toTitleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : '')
    .join(' ');
}

/**
 * Formats a Florida county parcel address nicely:
 * e.g. "924 SW 15 TER" -> "924 SW 15th Ter"
 * e.g. "10390 PENINSULA PL" -> "10390 Peninsula Pl"
 */
export function formatNiceAddress(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const directionals = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
  const suffixes = {
    ST: 'St', AVE: 'Ave', TER: 'Ter', CT: 'Ct', PL: 'Pl', DR: 'Dr',
    BLVD: 'Blvd', RD: 'Rd', LN: 'Ln', CIR: 'Cir', WAY: 'Way', HWY: 'Hwy',
    PKWY: 'Pkwy', TRL: 'Trl', RUN: 'Run', LOOP: 'Loop', PATH: 'Path',
    CV: 'Cv', ISLE: 'Isle', WALK: 'Walk', BLDG: 'Bldg', ROW: 'Row',
    ALY: 'Aly', XING: 'Xing', VLG: 'Vlg'
  };

  function toOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  const tokens = raw.trim().split(/\s+/);
  return tokens.map((token, i) => {
    const upper = token.toUpperCase();
    if (i === 0) return token; // House number
    if (directionals.has(upper)) return upper;
    if (suffixes[upper]) return suffixes[upper];
    // Check if it's a numeric street name (e.g. 15 in 'SW 15 TER')
    if (/^\d+$/.test(token) && i > 0 && i < tokens.length - 1) {
      const nextUpper = tokens[i + 1].toUpperCase();
      if (suffixes[nextUpper]) {
        return toOrdinal(parseInt(token, 10));
      }
    }
    // Title case other words
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * Maps Florida DOR Use Code to a human-readable land use label
 */
export function getUseCodeLabel(useCode) {
  const code = String(useCode || '').trim();
  switch (code) {
    case '001':
      return 'Single-family';
    case '004':
      return 'Condo';
    case '008':
      return 'Multifamily (2–9 units)';
    case '002':
      return 'Mobile home';
    case '000':
      return 'Vacant residential';
    case '003':
      return 'Multifamily (10+ units)';
    default:
      return code ? `Use code ${code}` : 'Residential';
  }
}

/**
 * Maps Florida DOR Use Code to Investor Studio property types:
 * 001 Single-family, 004 Condo, 008 Multifamily 2–9 units, 002 and 000 Other
 */
export function useCodeToPropertyType(useCode) {
  const code = String(useCode || '').trim();
  switch (code) {
    case '001':
      return 'single_family';
    case '004':
      return 'condo';
    case '008':
      return 'multifamily_2_9';
    case '002':
    case '000':
    default:
      return 'other';
  }
}

/**
 * Forward geocodes an address string using Mapbox to obtain lat/lng
 */
export async function forwardGeocodeMapbox(addressQuery, token = MAPBOX_TOKEN, sessionToken = '') {
  if (!token || !addressQuery) return { lat: null, lng: null };

  // 1. Try Mapbox Geocoding v5
  try {
    const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressQuery)}.json?access_token=${token}&country=US&proximity=-80.14,26.12&limit=1`;
    const res = await fetch(geoUrl);
    if (res.ok) {
      const data = await res.json();
      const coords = data.features?.[0]?.center;
      if (coords && coords.length >= 2) {
        return { lng: Number(coords[0]), lat: Number(coords[1]) };
      }
    }
  } catch (err) {
    // Fall through to Search Box
  }

  // 2. Fallback to Mapbox Search Box suggest + retrieve
  try {
    const sUrl = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(addressQuery)}&access_token=${token}&session_token=${sessionToken}&types=address&country=US&proximity=-80.14,26.12&limit=1&language=en`;
    const sRes = await fetch(sUrl);
    if (sRes.ok) {
      const sData = await sRes.json();
      const mbId = sData.suggestions?.[0]?.mapbox_id;
      if (mbId) {
        const rUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mbId)}?access_token=${token}&session_token=${sessionToken}`;
        const rRes = await fetch(rUrl);
        if (rRes.ok) {
          const rData = await rRes.json();
          const feat = rData.features?.[0];
          const coords = feat?.geometry?.coordinates;
          if (coords && coords.length >= 2) {
            return { lng: Number(coords[0]), lat: Number(coords[1]) };
          }
        }
      }
    }
  } catch (err) {
    console.warn('Mapbox forward geocoding warning:', err);
  }

  return { lat: null, lng: null };
}

/**
 * Reusable Address Autocomplete Combobox
 * Priority 1: County Records (from Neon county_parcels)
 * Priority 2: Mapbox Search Box suggestions ("OTHER ADDRESSES")
 */
export default function AddressAutocomplete({
  value = '',
  onChange,
  onSelect,
  id = 'autocomplete-address',
  label = 'Address *',
  placeholder = 'e.g. 1240 Las Olas Blvd or 924 SW 15th Ter',
  error = ''
}) {
  const [sessionToken, setSessionToken] = useState(() => generateUUID());
  const [countySuggestions, setCountySuggestions] = useState([]);
  const [mapboxSuggestions, setMapboxSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const containerRef = useRef(null);
  const justSelectedRef = useRef(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Combined flat list of items for unified keyboard navigation
  const flatItems = useMemo(() => {
    const items = [];
    countySuggestions.forEach(c => items.push({ type: 'county', data: c }));
    mapboxSuggestions.forEach(m => items.push({ type: 'mapbox', data: m }));
    return items;
  }, [countySuggestions, mapboxSuggestions]);

  // Debounced search for County records and Mapbox suggestions
  useEffect(() => {
    const trimmed = (value || '').trim();
    if (!trimmed || trimmed.length < 3 || !isFocused) {
      setCountySuggestions([]);
      setMapboxSuggestions([]);
      return;
    }
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);

      const promises = [];

      // 1. County prefix search (starts at 4 chars)
      if (trimmed.length >= 4) {
        promises.push(
          fetch(`/api/county/search?q=${encodeURIComponent(trimmed)}`)
            .then(res => (res.ok ? res.json() : []))
            .then(data => (Array.isArray(data) ? data : []))
            .catch(() => [])
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      // 2. Mapbox suggest (>= 3 chars if token available)
      if (MAPBOX_TOKEN && trimmed.length >= 3) {
        const q = encodeURIComponent(trimmed);
        const url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${q}&access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}&types=address&country=US&proximity=-80.14,26.12&limit=6&language=en`;
        promises.push(
          fetch(url)
            .then(res => (res.ok ? res.json() : { suggestions: [] }))
            .then(data => data.suggestions || [])
            .catch(() => [])
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      try {
        const [countyResults, mapboxResults] = await Promise.all(promises);
        setCountySuggestions(countyResults);
        setMapboxSuggestions(mapboxResults);
        const hasResults = countyResults.length > 0 || mapboxResults.length > 0;
        setIsDropdownOpen(hasResults);
        setSelectedIndex(-1);
      } catch (err) {
        console.error('Search autocomplete error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [value, sessionToken, isFocused]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    if (onChange) {
      onChange(val);
    }
    if (val.trim().length >= 3) {
      setIsDropdownOpen(true);
    } else {
      setIsDropdownOpen(false);
      setCountySuggestions([]);
      setMapboxSuggestions([]);
    }
  };

  const handleSelectCountyItem = async (parcel) => {
    justSelectedRef.current = true;
    setIsDropdownOpen(false);
    setCountySuggestions([]);
    setMapboxSuggestions([]);
    setSelectedIndex(-1);

    const niceAddress = formatNiceAddress(parcel.address);
    const niceCity = toTitleCase(parcel.city);
    const zip = parcel.zip || '';
    const county = parcel.county || 'Broward';

    let lat = parcel.lat != null ? Number(parcel.lat) : null;
    let lng = parcel.lng != null ? Number(parcel.lng) : null;

    // Fall back to Mapbox only if the parcel has no coordinates
    if (lat == null || lng == null) {
      const geoQuery = `${niceAddress}, ${niceCity}, FL ${zip}`.trim();
      const coords = await forwardGeocodeMapbox(geoQuery, MAPBOX_TOKEN, sessionToken);
      lat = coords.lat;
      lng = coords.lng;
    }

    if (onSelect) {
      onSelect({
        address: niceAddress,
        city: niceCity,
        zip,
        county,
        lat,
        lng,
        sqft: parcel.living_sqft != null ? Number(parcel.living_sqft) : null,
        lot_sqft: parcel.land_sqft != null ? Number(parcel.land_sqft) : null,
        year_built: parcel.year_built != null ? Number(parcel.year_built) : null,
        units: parcel.units != null ? Number(parcel.units) : 1,
        property_type: useCodeToPropertyType(parcel.use_code),
        parcel_id: parcel.parcel_id,
        parcel_county: county,
        use_code: parcel.use_code,
        just_value: parcel.just_value != null ? Number(parcel.just_value) : null,
        source: 'county'
      });
    }

    setSessionToken(generateUUID());
  };

  const handleSelectMapboxItem = async (suggestion) => {
    justSelectedRef.current = true;
    setIsDropdownOpen(false);
    setCountySuggestions([]);
    setMapboxSuggestions([]);
    setSelectedIndex(-1);

    let streetAddress = suggestion.name || value;
    let city = '';
    let zip = '';
    let county = '';
    let lat = null;
    let lng = null;

    if (MAPBOX_TOKEN && suggestion.mapbox_id) {
      try {
        const retrieveUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(suggestion.mapbox_id)}?access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}`;
        const res = await fetch(retrieveUrl);
        if (res.ok) {
          const data = await res.json();
          const feat = data.features?.[0];
          if (feat) {
            const props = feat.properties || {};
            const ctx = props.context || {};

            if (props.name) {
              streetAddress = props.name;
            } else if (props.address && props.street) {
              streetAddress = `${props.address} ${props.street}`;
            }

            city = ctx.place?.name || ctx.locality?.name || '';
            zip = ctx.postcode?.name || '';

            const rawDistrict = (ctx.district?.name || ctx.county?.name || '').toLowerCase();
            if (rawDistrict.includes('broward')) county = 'Broward';
            else if (rawDistrict.includes('palm beach')) county = 'Palm Beach';
            else if (rawDistrict.includes('miami') || rawDistrict.includes('dade')) county = 'Miami-Dade';
            else county = 'Other';

            const coords = feat.geometry?.coordinates || [];
            lng = coords[0] != null ? coords[0] : (props.coordinates?.longitude ?? null);
            lat = coords[1] != null ? coords[1] : (props.coordinates?.latitude ?? null);
          }
        }
      } catch (err) {
        console.warn('Mapbox retrieve failed:', err);
      }
    }

    if (onSelect) {
      onSelect({
        address: streetAddress,
        city,
        zip,
        county,
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
        source: 'mapbox'
      });
    }

    setSessionToken(generateUUID());
  };

  const handleSelectItem = (item) => {
    if (!item) return;
    if (item.type === 'county') {
      handleSelectCountyItem(item.data);
    } else {
      handleSelectMapboxItem(item.data);
    }
  };

  const handleKeyDown = (e) => {
    if (!isDropdownOpen || flatItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && flatItems[selectedIndex]) {
        e.preventDefault();
        handleSelectItem(flatItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const listboxId = `${id}-listbox`;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {label && (
        <label className="investor-form-label" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isDropdownOpen && flatItems.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={selectedIndex >= 0 ? `${id}-opt-${selectedIndex}` : undefined}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setIsFocused(true);
          if (value.trim().length >= 3 && flatItems.length > 0) {
            setIsDropdownOpen(true);
          }
        }}
        onBlur={() => {
          setTimeout(() => setIsFocused(false), 220);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={`investor-form-input ${error ? 'has-error' : ''}`}
      />

      {isDropdownOpen && flatItems.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="investor-autocomplete-dropdown"
          style={{
            maxHeight: '340px',
            overflowY: 'auto'
          }}
        >
          {/* SECTION 1: COUNTY RECORDS (Priority 1) */}
          {countySuggestions.length > 0 && (
            <>
              <li
                className="investor-autocomplete-section-label"
                role="presentation"
                style={{
                  padding: '8px 14px 4px',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(52, 41, 42, 0.55)',
                  backgroundColor: 'rgba(250, 248, 245, 0.95)',
                  borderBottom: '1px solid rgba(52, 41, 42, 0.06)',
                  userSelect: 'none'
                }}
              >
                COUNTY RECORDS
              </li>
              {countySuggestions.map((item, idx) => {
                const globalIndex = idx;
                const isSelected = selectedIndex === globalIndex;
                const formattedAddr = formatNiceAddress(item.address);
                const cityPart = `${toTitleCase(item.city)}, FL ${item.zip || ''}`.trim();
                const typePart = getUseCodeLabel(item.use_code);
                const sqftPart = item.living_sqft ? `${Number(item.living_sqft).toLocaleString()} sf` : null;
                const builtPart = item.year_built ? `Built ${item.year_built}` : null;
                const countyName = item.county || 'Broward';
                const subtitle = [cityPart, typePart, sqftPart, builtPart].filter(Boolean).join(' · ');

                return (
                  <li
                    key={`county-${item.parcel_id || idx}`}
                    id={`${id}-opt-${globalIndex}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectCountyItem(item);
                    }}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`investor-autocomplete-item ${isSelected ? 'active' : ''}`}
                    style={{
                      borderLeft: isSelected ? '3px solid var(--secondary-color, #41101B)' : '3px solid transparent'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span className="investor-autocomplete-street" style={{ fontWeight: 600 }}>
                        {formattedAddr}
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
                        {countyName}
                      </span>
                    </div>
                    <div className="investor-autocomplete-subtitle">
                      {subtitle}
                    </div>
                  </li>
                );
              })}
            </>
          )}

          {/* SECTION 2: OTHER ADDRESSES (Mapbox fallback) */}
          {mapboxSuggestions.length > 0 && (
            <>
              <li
                className="investor-autocomplete-section-label"
                role="presentation"
                style={{
                  padding: '8px 14px 4px',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(52, 41, 42, 0.55)',
                  backgroundColor: 'rgba(250, 248, 245, 0.95)',
                  borderTop: countySuggestions.length > 0 ? '1px solid rgba(52, 41, 42, 0.08)' : 'none',
                  borderBottom: '1px solid rgba(52, 41, 42, 0.06)',
                  userSelect: 'none'
                }}
              >
                OTHER ADDRESSES
              </li>
              {mapboxSuggestions.map((item, idx) => {
                const globalIndex = countySuggestions.length + idx;
                const isSelected = selectedIndex === globalIndex;

                return (
                  <li
                    key={item.mapbox_id || `mb-${idx}`}
                    id={`${id}-opt-${globalIndex}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectMapboxItem(item);
                    }}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`investor-autocomplete-item ${isSelected ? 'active' : ''}`}
                    style={{
                      borderLeft: isSelected ? '3px solid var(--secondary-color, #41101B)' : '3px solid transparent'
                    }}
                  >
                    <div className="investor-autocomplete-street">
                      {item.name}
                    </div>
                    {item.place_formatted && (
                      <div className="investor-autocomplete-subtitle">
                        {item.place_formatted}
                      </div>
                    )}
                  </li>
                );
              })}
            </>
          )}
        </ul>
      )}

      {error && <span className="investor-field-error">{error}</span>}
    </div>
  );
}
