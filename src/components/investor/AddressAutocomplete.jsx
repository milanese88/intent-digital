import React, { useState, useEffect, useRef } from 'react';

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
 * Reusable Address Autocomplete Combobox using Mapbox Search Box API
 * 
 * Props:
 * - value: string (current address input value)
 * - onChange: (newValue: string) => void (called on manual edit, clears lat/lng)
 * - onSelect: (details: { address, city, zip, county, lat, lng }) => void
 * - id: string
 * - label: string (optional, default "Address *")
 * - placeholder: string (optional)
 * - error: string (optional)
 */
export default function AddressAutocomplete({
  value = '',
  onChange,
  onSelect,
  id = 'autocomplete-address',
  label = 'Address *',
  placeholder = 'e.g. 1240 Las Olas Blvd',
  error = ''
}) {
  const [sessionToken, setSessionToken] = useState(() => generateUUID());
  const [suggestions, setSuggestions] = useState([]);
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

  // Debounced suggest call (250ms, >= 3 chars, South Florida proximity)
  useEffect(() => {
    if (!MAPBOX_TOKEN || !value || value.trim().length < 3 || !isFocused) {
      return;
    }
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const q = encodeURIComponent(value.trim());
        const url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${q}&access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}&types=address&country=US&proximity=-80.14,26.12&limit=6&language=en`;
        const res = await fetch(url);
        if (!res.ok) {
          setIsSearching(false);
          return;
        }
        const data = await res.json();
        const list = data.suggestions || [];
        setSuggestions(list);
        setIsDropdownOpen(list.length > 0);
        setSelectedIndex(-1);
      } catch (err) {
        setSuggestions([]);
        setIsDropdownOpen(false);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [value, sessionToken, isFocused]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    if (onChange) {
      onChange(val);
    }
    if (val.trim().length >= 3 && MAPBOX_TOKEN) {
      setIsDropdownOpen(true);
    } else {
      setIsDropdownOpen(false);
      setSuggestions([]);
    }
  };

  const handleSelect = async (suggestion) => {
    justSelectedRef.current = true;
    setIsDropdownOpen(false);
    setSuggestions([]);
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

            // Street address only
            if (props.name) {
              streetAddress = props.name;
            } else if (props.address && props.street) {
              streetAddress = `${props.address} ${props.street}`;
            }

            // City
            city = ctx.place?.name || ctx.locality?.name || '';

            // ZIP
            zip = ctx.postcode?.name || '';

            // County mapping (Broward, Palm Beach, Miami-Dade, Other)
            const rawDistrict = (ctx.district?.name || ctx.county?.name || '').toLowerCase();
            if (rawDistrict.includes('broward')) county = 'Broward';
            else if (rawDistrict.includes('palm beach')) county = 'Palm Beach';
            else if (rawDistrict.includes('miami') || rawDistrict.includes('dade')) county = 'Miami-Dade';
            else county = 'Other';

            // Coordinates [lng, lat]
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
        lng: lng != null ? Number(lng) : null
      });
    }

    // Refresh session token for next search session
    setSessionToken(generateUUID());
  };

  const handleKeyDown = (e) => {
    if (!isDropdownOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        e.preventDefault();
        handleSelect(suggestions[selectedIndex]);
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
        aria-expanded={isDropdownOpen && suggestions.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={selectedIndex >= 0 ? `${id}-opt-${selectedIndex}` : undefined}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setIsFocused(true);
          if (value.trim().length >= 3 && suggestions.length > 0) {
            setIsDropdownOpen(true);
          }
        }}
        onBlur={() => {
          setTimeout(() => setIsFocused(false), 200);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={`investor-form-input ${error ? 'has-error' : ''}`}
      />

      {isDropdownOpen && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="investor-autocomplete-dropdown"
        >
          {suggestions.map((item, idx) => {
            const isSelected = selectedIndex === idx;
            return (
              <li
                key={item.mapbox_id || idx}
                id={`${id}-opt-${idx}`}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item);
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`investor-autocomplete-item ${isSelected ? 'active' : ''}`}
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
        </ul>
      )}

      {error && <span className="investor-field-error">{error}</span>}
    </div>
  );
}
