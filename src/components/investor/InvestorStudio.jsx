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

export default function InvestorStudio() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & filter state
  const [locationInput, setLocationInput] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [strategyFilter, setStrategyFilter] = useState('all');

  // Applied filter state (filters saved properties in browser)
  const [appliedFilters, setAppliedFilters] = useState({
    location: '',
    type: 'all',
    strategy: 'all'
  });

  // Slide-in Form Panel state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null); // null = Add, obj = Edit
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [toast, setToast] = useState(null);

  // Mapbox Autocomplete state
  const [mapboxSessionToken, setMapboxSessionToken] = useState(() => generateUUID());
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAddressFocused, setIsAddressFocused] = useState(false);
  const autocompleteRef = useRef(null);
  const justSelectedRef = useRef(false);

  // Form field state
  const [formData, setFormData] = useState({
    address: '',
    city: '',
    zip: '',
    county: '',
    lat: null,
    lng: null,
    property_type: 'single_family',
    units: 1,
    beds: '',
    baths: '',
    sqft: '',
    lot_sqft: '',
    year_built: '',
    list_price: '',
    status: 'watching',
    strategy: '',
    condition: '',
    roof_year: '',
    listing_url: '',
    notes: ''
  });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const formatCurrencyInput = (val) => {
    if (val == null || val === '') return '';
    const digits = String(val).replace(/[^\d]/g, '');
    if (!digits) return '';
    return `$${Number(digits).toLocaleString('en-US')}`;
  };

  const fetchProperties = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/investor/properties');
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Unauthorized. Please log in to access Investor Studio.');
        }
        throw new Error(`Failed to load saved properties (HTTP ${res.status}).`);
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.properties || []);
      setProperties(list);
    } catch (err) {
      console.error('Error fetching investor properties:', err);
      setError(err.message || 'An unexpected error occurred while fetching properties.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mapbox Search Box API: Debounced address suggest (250ms, >= 3 chars, South Florida bias)
  useEffect(() => {
    if (!MAPBOX_TOKEN || !formData.address || formData.address.trim().length < 3 || !isAddressFocused) {
      return;
    }
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const q = encodeURIComponent(formData.address.trim());
        const url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${q}&access_token=${MAPBOX_TOKEN}&session_token=${mapboxSessionToken}&types=address&country=US&proximity=-80.14,26.12&limit=6&language=en`;
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
        // Silently fall back to normal text input
        setSuggestions([]);
        setIsDropdownOpen(false);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [formData.address, mapboxSessionToken, isAddressFocused]);

  // Handle selecting an autocomplete suggestion (Retrieve API)
  const handleSelectSuggestion = async (suggestion) => {
    justSelectedRef.current = true;
    setIsDropdownOpen(false);
    setSuggestions([]);
    setSelectedIndex(-1);

    let streetAddress = suggestion.name || formData.address;
    let city = '';
    let zip = '';
    let county = '';
    let lat = null;
    let lng = null;

    if (MAPBOX_TOKEN && suggestion.mapbox_id) {
      try {
        const retrieveUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(suggestion.mapbox_id)}?access_token=${MAPBOX_TOKEN}&session_token=${mapboxSessionToken}`;
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

    setFormData(prev => ({
      ...prev,
      address: streetAddress,
      city: city || prev.city,
      zip: zip || prev.zip,
      county: county || prev.county,
      lat: lat != null ? Number(lat) : null,
      lng: lng != null ? Number(lng) : null
    }));

    // Generate fresh session token for future searches
    setMapboxSessionToken(generateUUID());
  };

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    setAppliedFilters({
      location: locationInput.trim().toLowerCase(),
      type: typeFilter,
      strategy: strategyFilter
    });
  };

  const handleClearFilters = () => {
    setLocationInput('');
    setTypeFilter('all');
    setStrategyFilter('all');
    setAppliedFilters({ location: '', type: 'all', strategy: 'all' });
  };

  // Open panel in Add mode
  const handleOpenAdd = () => {
    setEditingProperty(null);
    setMapboxSessionToken(generateUUID());
    setSuggestions([]);
    setIsDropdownOpen(false);
    setFormData({
      address: '',
      city: '',
      zip: '',
      county: '',
      lat: null,
      lng: null,
      property_type: 'single_family',
      units: 1,
      beds: '',
      baths: '',
      sqft: '',
      lot_sqft: '',
      year_built: '',
      list_price: '',
      status: 'watching',
      strategy: '',
      condition: '',
      roof_year: '',
      listing_url: '',
      notes: ''
    });
    setFormErrors({});
    setIsDeleteConfirming(false);
    setIsPanelOpen(true);
  };

  // Open panel in Edit mode
  const handleOpenEdit = (p) => {
    setEditingProperty(p);
    setMapboxSessionToken(generateUUID());
    setSuggestions([]);
    setIsDropdownOpen(false);
    setFormData({
      address: p.address || '',
      city: p.city || '',
      zip: p.zip || '',
      county: p.county || '',
      lat: p.lat != null ? Number(p.lat) : null,
      lng: p.lng != null ? Number(p.lng) : null,
      property_type: p.property_type || 'single_family',
      units: p.units != null ? p.units : 1,
      beds: p.beds != null ? p.beds : '',
      baths: p.baths != null ? p.baths : '',
      sqft: p.sqft != null ? p.sqft : '',
      lot_sqft: p.lot_sqft != null ? p.lot_sqft : '',
      year_built: p.year_built != null ? p.year_built : '',
      list_price: p.list_price != null ? formatCurrencyInput(p.list_price) : '',
      status: p.status || 'watching',
      strategy: p.strategy || '',
      condition: p.condition || '',
      roof_year: p.roof_year != null ? p.roof_year : '',
      listing_url: p.listing_url || '',
      notes: p.notes || ''
    });
    setFormErrors({});
    setIsDeleteConfirming(false);
    setIsPanelOpen(true);
  };

  const handleClosePanel = () => {
    if (isSaving || isDeleting) return;
    setIsPanelOpen(false);
    setIsDeleteConfirming(false);
    setFormErrors({});
    setIsDropdownOpen(false);
    setSuggestions([]);
  };

  const handleFormFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  };

  // Address input change clears lat/lng if user manually edits
  const handleAddressInputChange = (e) => {
    const val = e.target.value;
    setFormData(prev => ({
      ...prev,
      address: val,
      lat: null,
      lng: null
    }));
    if (formErrors.address) {
      setFormErrors(prev => {
        const updated = { ...prev };
        delete updated.address;
        return updated;
      });
    }
    if (val.trim().length >= 3 && MAPBOX_TOKEN) {
      setIsDropdownOpen(true);
    } else {
      setIsDropdownOpen(false);
      setSuggestions([]);
    }
  };

  // Address keyboard navigation (combobox)
  const handleAddressKeyDown = (e) => {
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
        handleSelectSuggestion(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const handlePriceInputChange = (e) => {
    const raw = e.target.value;
    const digits = raw.replace(/[^\d]/g, '');
    const formatted = digits ? `$${Number(digits).toLocaleString('en-US')}` : '';
    handleFormFieldChange('list_price', formatted);
  };

  // Save (Create or Update)
  const handleSaveProperty = async (e) => {
    if (e) e.preventDefault();
    setFormErrors({});
    setIsSaving(true);

    if (!formData.address.trim()) {
      setFormErrors({ address: 'Address is required.' });
      setIsSaving(false);
      return;
    }

    const payload = {
      ...formData,
      address: formData.address.trim(),
      city: formData.city.trim() || null,
      zip: formData.zip.trim() || null,
      county: formData.county.trim() || null,
      lat: formData.lat != null ? Number(formData.lat) : null,
      lng: formData.lng != null ? Number(formData.lng) : null,
      property_type: formData.property_type || null,
      units: formData.property_type === 'multifamily_2_9' ? (Number(formData.units) || 1) : 1,
      beds: formData.beds !== '' ? Number(formData.beds) : null,
      baths: formData.baths !== '' ? Number(formData.baths) : null,
      sqft: formData.sqft !== '' ? Number(formData.sqft) : null,
      lot_sqft: formData.lot_sqft !== '' ? Number(formData.lot_sqft) : null,
      year_built: formData.year_built !== '' ? Number(formData.year_built) : null,
      list_price: formData.list_price ? Number(String(formData.list_price).replace(/[^\d]/g, '')) : null,
      status: formData.status || 'watching',
      strategy: formData.strategy || null,
      condition: formData.condition.trim() || null,
      roof_year: formData.roof_year !== '' ? Number(formData.roof_year) : null,
      listing_url: formData.listing_url.trim() || null,
      notes: formData.notes.trim() || null
    };

    if (editingProperty) {
      payload.id = editingProperty.id;
    }

    try {
      const isEdit = Boolean(editingProperty);
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch('/api/investor/properties', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.errors) {
          setFormErrors({ ...data.errors, general: data.error || 'Please correct the highlighted fields.' });
        } else {
          setFormErrors({ general: data.error || 'Failed to save property.' });
        }
        setIsSaving(false);
        return;
      }

      if (isEdit) {
        setProperties(prev => prev.map(p => (p.id === data.id ? data : p)));
      } else {
        setProperties(prev => [data, ...prev]);
      }

      setIsPanelOpen(false);
      showToast('Property saved');
    } catch (err) {
      console.error('Save error:', err);
      setFormErrors({ general: err.message || 'An unexpected error occurred while saving.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete
  const handleDeleteProperty = async () => {
    if (!editingProperty) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/investor/properties', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingProperty.id })
      });

      const data = await res.json();
      if (!res.ok) {
        setFormErrors({ general: data.error || 'Failed to delete property.' });
        setIsDeleting(false);
        return;
      }

      setProperties(prev => prev.filter(p => p.id !== editingProperty.id));
      setIsPanelOpen(false);
      setIsDeleteConfirming(false);
      showToast('Property deleted');
    } catch (err) {
      console.error('Delete error:', err);
      setFormErrors({ general: err.message || 'An unexpected error occurred while deleting.' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter properties in memory based on location text, type, and strategy
  const filteredProperties = properties.filter((p) => {
    if (appliedFilters.location) {
      const q = appliedFilters.location;
      const addrMatch = p.address && p.address.toLowerCase().includes(q);
      const cityMatch = p.city && p.city.toLowerCase().includes(q);
      const zipMatch = p.zip && p.zip.toLowerCase().includes(q);
      const countyMatch = p.county && p.county.toLowerCase().includes(q);
      if (!addrMatch && !cityMatch && !zipMatch && !countyMatch) {
        return false;
      }
    }

    if (appliedFilters.type !== 'all') {
      if (appliedFilters.type === 'condo_townhome') {
        if (p.property_type !== 'condo' && p.property_type !== 'townhome') {
          return false;
        }
      } else if (p.property_type !== appliedFilters.type) {
        return false;
      }
    }

    if (appliedFilters.strategy !== 'all') {
      if (p.strategy !== appliedFilters.strategy) {
        return false;
      }
    }

    return true;
  });

  const formatPrice = (val) => {
    if (val == null || val === '') return 'Price upon request';
    const num = Number(val);
    if (isNaN(num)) return `$${val}`;
    return `$${num.toLocaleString('en-US')}`;
  };

  const formatPricePerSqft = (price, sqft) => {
    if (!price || !sqft) return '—';
    const numPrice = Number(price);
    const numSqft = Number(sqft);
    if (!numPrice || !numSqft) return '—';
    return `$${Math.round(numPrice / numSqft).toLocaleString('en-US')}/sqft`;
  };

  const buildSpecsLine = (p) => {
    const parts = [];
    if (p.beds != null && p.beds !== '') parts.push(`${p.beds} bd`);
    if (p.baths != null && p.baths !== '') parts.push(`${p.baths} ba`);
    if (p.sqft != null && p.sqft !== '') parts.push(`${Number(p.sqft).toLocaleString('en-US')} sqft`);
    if (p.year_built != null && p.year_built !== '') parts.push(`Built ${p.year_built}`);
    return parts.join(' · ');
  };

  const formatStatus = (status) => {
    if (!status) return 'WATCHING';
    return String(status).replace(/_/g, ' ').toUpperCase();
  };

  const formatStrategy = (strategy) => {
    if (!strategy) return '—';
    return String(strategy).toUpperCase();
  };

  const isFiltered = appliedFilters.location || appliedFilters.type !== 'all' || appliedFilters.strategy !== 'all';

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative' }}>
      <style>{`
        /* Hero & Display Typography */
        .investor-hero-title {
          font-family: var(--font-display, 'Atelier Fleur', Georgia, serif);
          font-weight: 300;
          letter-spacing: -0.02em;
          line-height: 1.15;
          color: var(--espresso, #34292A);
        }
        .investor-hero-title i,
        .investor-hero-title em {
          font-family: var(--font-display, 'Atelier Fleur', Georgia, serif);
          font-style: italic;
          font-weight: 400;
        }

        /* Pill Search Bar */
        .investor-search-container {
          max-width: 900px;
          margin: 0 auto 64px auto;
        }
        .investor-search-bar {
          display: flex;
          align-items: center;
          background: #ffffff;
          border: 1px solid rgba(52, 41, 42, 0.12);
          border-radius: 60px;
          padding: 8px 10px 8px 24px;
          box-shadow: 0 4px 20px rgba(52, 41, 42, 0.05);
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .investor-search-bar:focus-within {
          border-color: var(--secondary-color, #41101B);
          box-shadow: 0 6px 24px rgba(65, 16, 27, 0.08);
        }
        .investor-search-field {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 4px 18px;
          min-width: 0;
        }
        .investor-search-field:first-of-type {
          padding-left: 0;
        }
        .investor-search-label {
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(52, 41, 42, 0.55);
          margin-bottom: 3px;
          display: block;
        }
        .investor-search-input,
        .investor-search-select {
          border: none;
          outline: none;
          background: transparent;
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 14px;
          color: var(--espresso, #1E1509);
          padding: 3px 0;
          margin: 0;
          width: 100%;
          line-height: 1.4;
          box-sizing: border-box;
        }
        .investor-search-input::placeholder {
          color: rgba(52, 41, 42, 0.4);
        }
        .investor-search-select {
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2334292A' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 2px center;
          padding-right: 18px;
          padding-left: 0;
          text-indent: 0;
        }
        .investor-search-select option {
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          color: #1E1509;
          background: #ffffff;
        }
        .investor-search-divider {
          width: 1px;
          height: 36px;
          background: rgba(52, 41, 42, 0.1);
          flex-shrink: 0;
        }
        .investor-search-btn {
          background-color: var(--secondary-color, #41101B);
          color: var(--lighter-tone, #FAF8F5);
          border: none;
          border-radius: 50px;
          padding: 14px 28px;
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: background-color 0.2s ease, transform 0.1s ease;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .investor-search-btn:hover {
          background-color: #5E1627;
        }

        /* Property Cards Grid */
        .investor-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
        }
        .investor-card {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid rgba(52, 41, 42, 0.08);
          box-shadow: 0 4px 16px rgba(52, 41, 42, 0.03);
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: flex;
          flex-direction: column;
        }
        .investor-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(52, 41, 42, 0.07);
        }

        /* Slide-In Modal Form Panel */
        .investor-panel-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(30, 21, 9, 0.45);
          backdrop-filter: blur(3px);
          z-index: 1200;
          transition: opacity 0.25s ease;
        }
        .investor-slide-panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          max-width: 580px;
          background-color: var(--lighter-tone, #FAF8F5);
          box-shadow: -10px 0 36px rgba(30, 21, 9, 0.2);
          z-index: 1201;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .investor-form-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .investor-form-input,
        .investor-form-select,
        .investor-form-textarea {
          width: 100%;
          box-sizing: border-box;
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 14px;
          color: var(--espresso, #1E1509);
          background-color: #ffffff;
          border: 1px solid rgba(52, 41, 42, 0.18);
          border-radius: 8px;
          padding: 10px 14px;
          outline: none;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .investor-form-input:focus,
        .investor-form-select:focus,
        .investor-form-textarea:focus {
          border-color: var(--secondary-color, #41101B);
          box-shadow: 0 0 0 3px rgba(65, 16, 27, 0.08);
        }
        .investor-form-input.has-error,
        .investor-form-select.has-error {
          border-color: #C0392B !important;
          background-color: #FFFBFB;
        }
        .investor-field-error {
          display: block;
          color: #C0392B;
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 11px;
          margin-top: 4px;
          font-weight: 500;
        }
        .investor-form-label {
          display: block;
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(52, 41, 42, 0.65);
          margin-bottom: 5px;
        }
        .investor-section-header {
          display: block;
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--secondary-color, #41101B);
          border-bottom: 1px solid rgba(65, 16, 27, 0.12);
          padding-bottom: 6px;
          margin-bottom: 14px;
        }

        /* Form Polish: Custom Select Styling with Subtle Chevron */
        .investor-form-select {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2334292A' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
          padding-right: 36px;
          cursor: pointer;
          height: 42px;
        }
        .investor-form-select.placeholder-active {
          color: rgba(52, 41, 42, 0.45) !important;
        }
        .investor-form-select option {
          color: var(--espresso, #1E1509);
          background-color: #ffffff;
        }
        .investor-form-select option[value=""] {
          color: rgba(52, 41, 42, 0.45);
        }

        /* Form Polish: Remove number spinner arrows */
        .investor-form-input::-webkit-outer-spin-button,
        .investor-form-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .investor-form-input[type="number"] {
          -moz-appearance: textfield;
          appearance: textfield;
        }

        /* Mapbox Autocomplete Dropdown */
        .investor-autocomplete-container {
          position: relative;
          width: 100%;
        }
        .investor-autocomplete-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: #ffffff;
          border: 1px solid rgba(52, 41, 42, 0.16);
          border-radius: 8px;
          box-shadow: 0 10px 28px rgba(52, 41, 42, 0.12);
          z-index: 1300;
          max-height: 280px;
          overflow-y: auto;
          padding: 6px 0;
          margin: 0;
          list-style: none;
        }
        .investor-autocomplete-item {
          padding: 10px 14px;
          cursor: pointer;
          transition: background-color 0.15s ease;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .investor-autocomplete-item:hover,
        .investor-autocomplete-item.active {
          background-color: rgba(65, 16, 27, 0.05);
        }
        .investor-autocomplete-street {
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 14px;
          font-weight: 500;
          color: var(--espresso, #1E1509);
        }
        .investor-autocomplete-subtitle {
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 11.5px;
          color: rgba(52, 41, 42, 0.55);
        }

        /* Responsive Breakpoints */
        @media (max-width: 860px) {
          .investor-search-bar {
            flex-direction: column;
            border-radius: 20px;
            padding: 20px;
            gap: 16px;
            align-items: stretch;
          }
          .investor-search-divider {
            display: none;
          }
          .investor-search-field {
            padding: 0 !important;
          }
          .investor-search-select {
            background-position: right 6px center;
          }
          .investor-search-btn {
            width: 100% !important;
            justify-content: center;
          }
        }
        @media (max-width: 640px) {
          .investor-slide-panel {
            max-width: 100% !important;
            width: 100% !important;
          }
          .investor-form-grid-2 {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }
        @media (max-width: 600px) {
          .investor-grid {
            grid-template-columns: 1fr;
          }
          .investor-empty-card {
            padding: 36px 20px !important;
          }
        }
      `}</style>

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: 'var(--espresso, #1E1509)',
          color: 'var(--lighter-tone, #FAF8F5)',
          padding: '12px 22px',
          borderRadius: '50px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '0.04em',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2ECC71" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          {toast}
        </div>
      )}

      {/* HERO SECTION - MATCHING DASHBOARD / OVERVIEW EXACTLY */}
      <header style={{ marginBottom: '40px', textAlign: 'center' }}>
        <span style={{
          display: 'block',
          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
          fontSize: '12px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(52, 41, 42, 0.6)',
          marginBottom: '16px'
        }}>
          INVESTOR STUDIO · PRIVATE
        </span>

        <h1 className="investor-hero-title" style={{
          fontSize: 'clamp(36px, 4.5vw, 56px)',
          margin: '0 auto 20px auto',
          textAlign: 'center',
          maxWidth: '850px'
        }}>
          Find the property.<br />
          <i>Know the numbers.</i>
        </h1>

        <p style={{
          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
          fontSize: '15px',
          color: 'rgba(52, 41, 42, 0.7)',
          margin: '0 auto',
          maxWidth: '620px',
          lineHeight: '1.6',
          textAlign: 'center'
        }}>
          Search Broward and Palm Beach, pull sold comps, underwrite a deal and save everything to your own database.
        </p>
      </header>

      {/* PILL SEARCH BAR - CENTERED UNDER TEXT (MAX-WIDTH ~900px) */}
      <form onSubmit={handleSearchSubmit} className="investor-search-container">
        <div className="investor-search-bar">
          
          {/* 1. LOCATION */}
          <div className="investor-search-field">
            <label htmlFor="investor-loc" className="investor-search-label">
              LOCATION
            </label>
            <input
              id="investor-loc"
              type="text"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              placeholder="Address, city or ZIP"
              className="investor-search-input"
            />
          </div>

          <div className="investor-search-divider" />

          {/* 2. PROPERTY TYPE */}
          <div className="investor-search-field">
            <label htmlFor="investor-type" className="investor-search-label">
              PROPERTY TYPE
            </label>
            <select
              id="investor-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="investor-search-select"
            >
              <option value="all">Any</option>
              <option value="single_family">Single-family</option>
              <option value="condo_townhome">Condo / townhome</option>
              <option value="multifamily_2_9">Multifamily 2–9 units</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="investor-search-divider" />

          {/* 3. STRATEGY */}
          <div className="investor-search-field">
            <label htmlFor="investor-strat" className="investor-search-label">
              STRATEGY
            </label>
            <select
              id="investor-strat"
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              className="investor-search-select"
            >
              <option value="all">Any</option>
              <option value="rental">Rental</option>
              <option value="flip">Flip</option>
              <option value="brrrr">BRRRR</option>
            </select>
          </div>

          {/* 4. BURGUNDY BUTTON */}
          <button type="submit" className="investor-search-btn">
            SEARCH &rarr;
          </button>
        </div>
      </form>

      {/* SAVED PROPERTIES SECTION */}
      <section style={{ marginTop: '64px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '28px',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: 'clamp(32px, 3.8vw, 44px)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              color: 'var(--espresso, #34292A)',
              margin: '0 0 6px 0',
              textAlign: 'left'
            }}>
              Your saved properties
            </h2>
            <p style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '13px',
              color: 'rgba(52, 41, 42, 0.6)',
              margin: 0
            }}>
              {properties.length > 0 ? (
                isFiltered
                  ? `Showing ${filteredProperties.length} of ${properties.length} saved properties`
                  : `${properties.length} total saved ${properties.length === 1 ? 'property' : 'properties'}`
              ) : null}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            {isFiltered && (
              <button
                type="button"
                onClick={handleClearFilters}
                style={{
                  background: 'none',
                  border: 'none',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '12px',
                  color: 'var(--secondary-color, #41101B)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                Clear filters
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenAdd}
              className="investor-search-btn"
              style={{
                padding: '11px 22px',
                fontSize: '11.5px'
              }}
            >
              + ADD PROPERTY
            </button>
          </div>
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div style={{
            padding: '40px 0',
            textAlign: 'center',
            color: 'rgba(52, 41, 42, 0.7)',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '14px'
          }}>
            Loading saved properties...
          </div>
        )}

        {/* ERROR STATE */}
        {!loading && error && (
          <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            backgroundColor: '#FFF7F5',
            border: '1px solid rgba(192, 57, 43, 0.2)',
            borderRadius: '12px',
            padding: '24px',
            color: '#A93226',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '14px',
            lineHeight: 1.5
          }}>
            <strong style={{ display: 'block', marginBottom: '4px' }}>Unable to load properties</strong>
            {error}
          </div>
        )}

        {/* EMPTY STATE */}
        {!loading && !error && properties.length === 0 && (
          <div className="investor-empty-card" style={{
            maxWidth: '800px',
            margin: '0 auto',
            textAlign: 'center',
            backgroundColor: '#fff',
            border: '1px solid rgba(52, 41, 42, 0.1)',
            borderRadius: '16px',
            padding: '48px 32px',
            boxShadow: '0 4px 24px rgba(52, 41, 42, 0.05)'
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: '24px',
              color: 'var(--espresso, #34292A)',
              marginBottom: '16px',
              fontWeight: 400
            }}>
              No saved properties yet
            </h3>
            <p style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '15px',
              color: 'rgba(52, 41, 42, 0.7)',
              lineHeight: '1.6',
              margin: '0 0 24px 0'
            }}>
              Add your first property to start running comps and numbers.
            </p>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="investor-search-btn"
              style={{
                display: 'inline-flex',
                margin: '0 auto',
                padding: '12px 26px',
                fontSize: '12px'
              }}
            >
              + ADD PROPERTY
            </button>
          </div>
        )}

        {/* EMPTY FILTER STATE */}
        {!loading && !error && properties.length > 0 && filteredProperties.length === 0 && (
          <div className="investor-empty-card" style={{
            maxWidth: '800px',
            margin: '0 auto',
            textAlign: 'center',
            backgroundColor: '#fff',
            border: '1px solid rgba(52, 41, 42, 0.1)',
            borderRadius: '16px',
            padding: '48px',
            boxShadow: '0 4px 24px rgba(52, 41, 42, 0.05)'
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: '24px',
              color: 'var(--espresso, #34292A)',
              marginBottom: '16px',
              fontWeight: 400
            }}>
              No matching properties
            </h3>
            <p style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '15px',
              color: 'rgba(52, 41, 42, 0.7)',
              lineHeight: '1.6',
              margin: '0 0 20px 0'
            }}>
              None of your saved properties match the current search filters.
            </p>
            <button
              type="button"
              onClick={handleClearFilters}
              style={{
                backgroundColor: 'var(--lighter-tone, #FAF8F5)',
                border: '1px solid rgba(52, 41, 42, 0.15)',
                borderRadius: '50px',
                padding: '10px 22px',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--espresso, #1E1509)',
                cursor: 'pointer'
              }}
            >
              Reset Search Filters
            </button>
          </div>
        )}

        {/* PROPERTY CARDS GRID */}
        {!loading && !error && filteredProperties.length > 0 && (
          <div className="investor-grid">
            {filteredProperties.map((p) => {
              const specs = buildSpecsLine(p);
              const pricePerSqft = formatPricePerSqft(p.list_price, p.sqft);
              const cityStateZip = [p.city, p.state || 'FL', p.zip].filter(Boolean).join(', ');

              return (
                <div key={p.id} className="investor-card">
                  {/* Photo Block: Warm brown tone with cream status pill */}
                  <div style={{
                    height: '180px',
                    background: 'linear-gradient(145deg, #2E2218 0%, #4A382A 100%)',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(250, 248, 245, 0.35)'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '12px',
                      left: '12px',
                      backgroundColor: 'var(--lighter-tone, #FAF8F5)',
                      color: 'var(--secondary-color, #41101B)',
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      padding: '4px 10px',
                      borderRadius: '50px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}>
                      {formatStatus(p.status)}
                    </div>

                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                      <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                  </div>

                  {/* Card Body */}
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: 'var(--espresso, #1E1509)',
                      marginBottom: '6px',
                      letterSpacing: '-0.01em'
                    }}>
                      {formatPrice(p.list_price)}
                    </div>

                    <div style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--espresso, #34292A)',
                      marginBottom: '2px',
                      lineHeight: 1.3
                    }}>
                      {p.address}
                    </div>
                    {cityStateZip && (
                      <div style={{
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '12px',
                        color: 'rgba(52, 41, 42, 0.65)',
                        marginBottom: '12px'
                      }}>
                        {cityStateZip}
                      </div>
                    )}

                    {specs && (
                      <div style={{
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '12px',
                        color: 'rgba(52, 41, 42, 0.75)',
                        marginBottom: '16px'
                      }}>
                        {specs}
                      </div>
                    )}

                    {/* Bottom Row */}
                    <div style={{
                      marginTop: 'auto',
                      paddingTop: '14px',
                      borderTop: '1px solid rgba(52, 41, 42, 0.08)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '11px',
                      letterSpacing: '0.04em'
                    }}>
                      <div>
                        <span style={{ color: 'rgba(52, 41, 42, 0.5)', textTransform: 'uppercase', marginRight: '6px' }}>$/SQFT:</span>
                        <strong style={{ color: 'var(--espresso, #1E1509)' }}>{pricePerSqft}</strong>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          backgroundColor: 'rgba(65, 16, 27, 0.06)',
                          color: 'var(--secondary-color, #41101B)',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          letterSpacing: '0.06em',
                          fontSize: '10px'
                        }}>
                          {formatStrategy(p.strategy)}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(p);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(52, 41, 42, 0.65)',
                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                            fontSize: '11px',
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            textDecoration: 'underline'
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SLIDE-IN ADD / EDIT PROPERTY PANEL */}
      {isPanelOpen && (
        <>
          {/* Soft Dark Backdrop Overlay */}
          <div
            className="investor-panel-overlay"
            onClick={handleClosePanel}
          />

          {/* Slide-In Panel Container */}
          <div className="investor-slide-panel" role="dialog" aria-modal="true">
            {/* Panel Header */}
            <div style={{
              padding: '24px 30px',
              borderBottom: '1px solid rgba(52, 41, 42, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--lighter-tone, #FAF8F5)'
            }}>
              <div>
                <span style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(52, 41, 42, 0.55)',
                  marginBottom: '4px'
                }}>
                  INVESTOR STUDIO
                </span>
                <h2 style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '26px',
                  fontWeight: 400,
                  color: 'var(--espresso, #34292A)',
                  margin: 0
                }}>
                  {editingProperty ? 'Edit property' : 'Add a property'}
                </h2>
              </div>

              <button
                type="button"
                onClick={handleClosePanel}
                disabled={isSaving || isDeleting}
                aria-label="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  lineHeight: 1,
                  color: 'rgba(52, 41, 42, 0.6)',
                  cursor: (isSaving || isDeleting) ? 'not-allowed' : 'pointer',
                  padding: '6px'
                }}
              >
                &times;
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveProperty} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{
                padding: '28px 30px',
                overflowY: 'auto',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '26px'
              }}>
                {formErrors.general && (
                  <div style={{
                    backgroundColor: '#FFF7F5',
                    border: '1px solid rgba(192, 57, 43, 0.25)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    color: '#C0392B',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '13px',
                    lineHeight: 1.4
                  }}>
                    {formErrors.general}
                  </div>
                )}

                {/* 1. LOCATION */}
                <div>
                  <span className="investor-section-header">LOCATION</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Address with Mapbox Combobox Autocomplete */}
                    <div ref={autocompleteRef} className="investor-autocomplete-container">
                      <label className="investor-form-label" htmlFor="prop-address">
                        Address *
                      </label>
                      <input
                        id="prop-address"
                        type="text"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={isDropdownOpen && suggestions.length > 0}
                        aria-controls="address-suggestions-listbox"
                        aria-activedescendant={selectedIndex >= 0 ? `address-suggestion-${selectedIndex}` : undefined}
                        value={formData.address}
                        onChange={handleAddressInputChange}
                        onKeyDown={handleAddressKeyDown}
                        onFocus={() => {
                          setIsAddressFocused(true);
                          if (formData.address.trim().length >= 3 && suggestions.length > 0) {
                            setIsDropdownOpen(true);
                          }
                        }}
                        onBlur={() => {
                          // Short delay to allow onMouseDown on suggestion to complete
                          setTimeout(() => setIsAddressFocused(false), 200);
                        }}
                        placeholder="e.g. 1240 Las Olas Blvd"
                        autoComplete="off"
                        className={`investor-form-input ${formErrors.address ? 'has-error' : ''}`}
                      />

                      {/* Autocomplete Dropdown Listbox */}
                      {isDropdownOpen && suggestions.length > 0 && (
                        <ul
                          id="address-suggestions-listbox"
                          role="listbox"
                          className="investor-autocomplete-dropdown"
                        >
                          {suggestions.map((item, idx) => {
                            const isSelected = selectedIndex === idx;
                            return (
                              <li
                                key={item.mapbox_id || idx}
                                id={`address-suggestion-${idx}`}
                                role="option"
                                aria-selected={isSelected}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectSuggestion(item);
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

                      {formErrors.address && (
                        <span className="investor-field-error">{formErrors.address}</span>
                      )}
                    </div>

                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-city">
                          City
                        </label>
                        <input
                          id="prop-city"
                          type="text"
                          value={formData.city}
                          onChange={(e) => handleFormFieldChange('city', e.target.value)}
                          placeholder="e.g. Fort Lauderdale"
                          className="investor-form-input"
                        />
                      </div>
                      <div>
                        <label className="investor-form-label" htmlFor="prop-zip">
                          ZIP
                        </label>
                        <input
                          id="prop-zip"
                          type="text"
                          inputMode="numeric"
                          value={formData.zip}
                          onChange={(e) => handleFormFieldChange('zip', e.target.value)}
                          placeholder="e.g. 33301"
                          className="investor-form-input"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="investor-form-label" htmlFor="prop-county">
                        County
                      </label>
                      <select
                        id="prop-county"
                        value={formData.county}
                        onChange={(e) => handleFormFieldChange('county', e.target.value)}
                        className={`investor-form-select ${!formData.county ? 'placeholder-active' : ''}`}
                      >
                        <option value="">Select county</option>
                        <option value="Broward">Broward</option>
                        <option value="Palm Beach">Palm Beach</option>
                        <option value="Miami-Dade">Miami-Dade</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. THE PROPERTY */}
                <div>
                  <span className="investor-section-header">THE PROPERTY</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-type">
                          Property Type
                        </label>
                        <select
                          id="prop-type"
                          value={formData.property_type}
                          onChange={(e) => handleFormFieldChange('property_type', e.target.value)}
                          className={`investor-form-select ${!formData.property_type ? 'placeholder-active' : ''} ${formErrors.property_type ? 'has-error' : ''}`}
                        >
                          <option value="single_family">Single-family</option>
                          <option value="condo">Condo</option>
                          <option value="townhome">Townhome</option>
                          <option value="multifamily_2_9">Multifamily 2–9 units</option>
                          <option value="other">Other</option>
                        </select>
                        {formErrors.property_type && (
                          <span className="investor-field-error">{formErrors.property_type}</span>
                        )}
                      </div>

                      {/* Units: only shown when Multifamily is selected */}
                      {formData.property_type === 'multifamily_2_9' ? (
                        <div>
                          <label className="investor-form-label" htmlFor="prop-units">
                            Units
                          </label>
                          <input
                            id="prop-units"
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={formData.units}
                            onChange={(e) => handleFormFieldChange('units', e.target.value)}
                            className={`investor-form-input ${formErrors.units ? 'has-error' : ''}`}
                          />
                          {formErrors.units && (
                            <span className="investor-field-error">{formErrors.units}</span>
                          )}
                        </div>
                      ) : (
                        <div />
                      )}
                    </div>

                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-beds">
                          Beds
                        </label>
                        <input
                          id="prop-beds"
                          type="number"
                          step="any"
                          inputMode="numeric"
                          value={formData.beds}
                          onChange={(e) => handleFormFieldChange('beds', e.target.value)}
                          placeholder="e.g. 3"
                          className="investor-form-input"
                        />
                      </div>
                      <div>
                        <label className="investor-form-label" htmlFor="prop-baths">
                          Baths
                        </label>
                        <input
                          id="prop-baths"
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={formData.baths}
                          onChange={(e) => handleFormFieldChange('baths', e.target.value)}
                          placeholder="e.g. 2.5"
                          className="investor-form-input"
                        />
                      </div>
                    </div>

                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-sqft">
                          Living sqft
                        </label>
                        <input
                          id="prop-sqft"
                          type="number"
                          step="1"
                          inputMode="numeric"
                          value={formData.sqft}
                          onChange={(e) => handleFormFieldChange('sqft', e.target.value)}
                          placeholder="e.g. 1850"
                          className="investor-form-input"
                        />
                      </div>
                      <div>
                        <label className="investor-form-label" htmlFor="prop-lot-sqft">
                          Lot sqft
                        </label>
                        <input
                          id="prop-lot-sqft"
                          type="number"
                          step="1"
                          inputMode="numeric"
                          value={formData.lot_sqft}
                          onChange={(e) => handleFormFieldChange('lot_sqft', e.target.value)}
                          placeholder="e.g. 6500"
                          className="investor-form-input"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="investor-form-label" htmlFor="prop-year-built">
                        Year built
                      </label>
                      <input
                        id="prop-year-built"
                        type="number"
                        step="1"
                        inputMode="numeric"
                        value={formData.year_built}
                        onChange={(e) => handleFormFieldChange('year_built', e.target.value)}
                        placeholder="e.g. 1988"
                        className={`investor-form-input ${formErrors.year_built ? 'has-error' : ''}`}
                      />
                      {formErrors.year_built && (
                        <span className="investor-field-error">{formErrors.year_built}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. THE DEAL */}
                <div>
                  <span className="investor-section-header">THE DEAL</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label className="investor-form-label" htmlFor="prop-price">
                        List Price
                      </label>
                      <input
                        id="prop-price"
                        type="text"
                        value={formData.list_price}
                        onChange={handlePriceInputChange}
                        placeholder="$0"
                        className={`investor-form-input ${formErrors.list_price ? 'has-error' : ''}`}
                      />
                      {formErrors.list_price && (
                        <span className="investor-field-error">{formErrors.list_price}</span>
                      )}
                    </div>

                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-status">
                          Status
                        </label>
                        <select
                          id="prop-status"
                          value={formData.status}
                          onChange={(e) => handleFormFieldChange('status', e.target.value)}
                          className={`investor-form-select ${!formData.status ? 'placeholder-active' : ''} ${formErrors.status ? 'has-error' : ''}`}
                        >
                          <option value="watching">Watching</option>
                          <option value="analyzing">Analyzing</option>
                          <option value="offer_sent">Offer sent</option>
                          <option value="under_contract">Under contract</option>
                          <option value="passed">Passed</option>
                          <option value="owned">Owned</option>
                        </select>
                        {formErrors.status && (
                          <span className="investor-field-error">{formErrors.status}</span>
                        )}
                      </div>

                      <div>
                        <label className="investor-form-label" htmlFor="prop-strategy">
                          Strategy
                        </label>
                        <select
                          id="prop-strategy"
                          value={formData.strategy}
                          onChange={(e) => handleFormFieldChange('strategy', e.target.value)}
                          className={`investor-form-select ${!formData.strategy ? 'placeholder-active' : ''} ${formErrors.strategy ? 'has-error' : ''}`}
                        >
                          <option value="">Select strategy</option>
                          <option value="rental">Rental</option>
                          <option value="flip">Flip</option>
                          <option value="brrrr">BRRRR</option>
                        </select>
                        {formErrors.strategy && (
                          <span className="investor-field-error">{formErrors.strategy}</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="investor-form-label" htmlFor="prop-listing-url">
                        Listing Link
                      </label>
                      <input
                        id="prop-listing-url"
                        type="url"
                        value={formData.listing_url}
                        onChange={(e) => handleFormFieldChange('listing_url', e.target.value)}
                        placeholder="https://..."
                        className={`investor-form-input ${formErrors.listing_url ? 'has-error' : ''}`}
                      />
                      {formErrors.listing_url && (
                        <span className="investor-field-error">{formErrors.listing_url}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. CONDITION */}
                <div>
                  <span className="investor-section-header">CONDITION</span>
                  <div className="investor-form-grid-2">
                    <div>
                      <label className="investor-form-label" htmlFor="prop-condition">
                        Condition
                      </label>
                      <input
                        id="prop-condition"
                        type="text"
                        value={formData.condition}
                        onChange={(e) => handleFormFieldChange('condition', e.target.value)}
                        placeholder="e.g. Dated, original kitchen"
                        className="investor-form-input"
                      />
                    </div>
                    <div>
                      <label className="investor-form-label" htmlFor="prop-roof-year">
                        Roof Year
                      </label>
                      <input
                        id="prop-roof-year"
                        type="number"
                        step="1"
                        inputMode="numeric"
                        value={formData.roof_year}
                        onChange={(e) => handleFormFieldChange('roof_year', e.target.value)}
                        placeholder="e.g. 2018"
                        className={`investor-form-input ${formErrors.roof_year ? 'has-error' : ''}`}
                      />
                      {formErrors.roof_year && (
                        <span className="investor-field-error">{formErrors.roof_year}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 5. NOTES */}
                <div>
                  <span className="investor-section-header">NOTES</span>
                  <div>
                    <label className="investor-form-label" htmlFor="prop-notes">
                      Notes
                    </label>
                    <textarea
                      id="prop-notes"
                      rows={3}
                      value={formData.notes}
                      onChange={(e) => handleFormFieldChange('notes', e.target.value)}
                      placeholder="Seller notes, renovation estimates, tenant terms..."
                      className="investor-form-textarea"
                    />
                  </div>
                </div>
              </div>

              {/* Panel Footer */}
              <div style={{
                padding: '20px 30px',
                borderTop: '1px solid rgba(52, 41, 42, 0.1)',
                backgroundColor: 'var(--lighter-tone, #FAF8F5)'
              }}>
                {isDeleteConfirming ? (
                  <div style={{
                    backgroundColor: '#FFF7F5',
                    border: '1px solid rgba(192, 57, 43, 0.25)',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <p style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '13px',
                      color: '#A93226',
                      fontWeight: 600,
                      margin: 0,
                      lineHeight: 1.4
                    }}>
                      Delete this property? Its comps and analyses will be deleted too.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setIsDeleteConfirming(false)}
                        disabled={isDeleting}
                        style={{
                          backgroundColor: 'transparent',
                          border: '1px solid rgba(52, 41, 42, 0.2)',
                          borderRadius: '50px',
                          padding: '7px 16px',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--espresso, #1E1509)',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteProperty}
                        disabled={isDeleting}
                        style={{
                          backgroundColor: '#C0392B',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '50px',
                          padding: '7px 18px',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '11px',
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          cursor: isDeleting ? 'not-allowed' : 'pointer',
                          opacity: isDeleting ? 0.7 : 1
                        }}
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    {editingProperty ? (
                      <button
                        type="button"
                        onClick={() => setIsDeleteConfirming(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#C0392B',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '12px',
                          fontWeight: 500,
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          padding: '4px 0'
                        }}
                      >
                        Delete property
                      </button>
                    ) : (
                      <div />
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={handleClosePanel}
                        disabled={isSaving}
                        style={{
                          backgroundColor: 'transparent',
                          border: '1px solid rgba(52, 41, 42, 0.22)',
                          borderRadius: '50px',
                          padding: '11px 22px',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'var(--espresso, #1E1509)',
                          cursor: isSaving ? 'not-allowed' : 'pointer'
                        }}
                      >
                        CANCEL
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        style={{
                          backgroundColor: 'var(--secondary-color, #41101B)',
                          color: 'var(--lighter-tone, #FAF8F5)',
                          border: 'none',
                          borderRadius: '50px',
                          padding: '11px 24px',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          cursor: isSaving ? 'not-allowed' : 'pointer',
                          opacity: isSaving ? 0.7 : 1
                        }}
                      >
                        {isSaving ? 'Saving…' : 'SAVE PROPERTY'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
