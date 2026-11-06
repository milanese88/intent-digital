import React, { useState, useEffect, useRef } from 'react';
import AddressAutocomplete from './AddressAutocomplete.jsx';
import UnderwritePanel from './UnderwritePanel.jsx';
import InvestorMap from './InvestorMap.jsx';

function calculateMedian(numbers) {
  if (!numbers || numbers.length === 0) return null;
  const valid = numbers.filter(n => n != null && !isNaN(n)).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) {
    return valid[mid];
  }
  return (valid[mid - 1] + valid[mid]) / 2;
}

export default function InvestorStudio() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active property for Detail View (null = List View, string = Detail View)
  const [activePropertyId, setActivePropertyId] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('property') || null;
    }
    return null;
  });

  // Search & filter state (List view)
  const [locationInput, setLocationInput] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [appliedFilters, setAppliedFilters] = useState({
    location: '',
    type: 'all',
    strategy: 'all'
  });

  // Slide-in Property Form Panel state
  const [isPropertyPanelOpen, setIsPropertyPanelOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [isPropDeleteConfirming, setIsPropDeleteConfirming] = useState(false);
  const [isPropSaving, setIsPropSaving] = useState(false);
  const [isPropDeleting, setIsPropDeleting] = useState(false);
  const [propFormErrors, setPropFormErrors] = useState({});
  const [toast, setToast] = useState(null);

  const [propFormData, setPropFormData] = useState({
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

  // Split Map State (List view)
  const [showSavedPins, setShowSavedPins] = useState(true);
  const [showCompsPins, setShowCompsPins] = useState(false);
  const [allComps, setAllComps] = useState([]);
  const [allCompsLoading, setAllCompsLoading] = useState(false);
  const [hoveredMapPinId, setHoveredMapPinId] = useState(null);

  // Comps State (Detail view)
  const [comps, setComps] = useState([]);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compsError, setCompsError] = useState(null);

  // Slide-in Comp Form Panel state
  const [isCompPanelOpen, setIsCompPanelOpen] = useState(false);
  const [editingComp, setEditingComp] = useState(null);
  const [isCompDeleteConfirming, setIsCompDeleteConfirming] = useState(false);
  const [isCompSaving, setIsCompSaving] = useState(false);
  const [isCompDeleting, setIsCompDeleting] = useState(false);
  const [compFormErrors, setCompFormErrors] = useState({});

  const [compFormData, setCompFormData] = useState({
    address: '',
    city: '',
    zip: '',
    lat: null,
    lng: null,
    sold_date: '',
    sold_price: '',
    sqft: '',
    beds: '',
    baths: '',
    year_built: '',
    source: 'MLS',
    included: true
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

  // Sync URL search params with activePropertyId & handle popstate
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const prop = params.get('property') || null;
      setActivePropertyId(prop);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

  // Fetch all comps for map when showCompsPins is enabled
  useEffect(() => {
    if (showCompsPins && allComps.length === 0 && !allCompsLoading) {
      setAllCompsLoading(true);
      fetch('/api/investor/comps')
        .then(res => {
          if (!res.ok) throw new Error('Failed to load comps');
          return res.json();
        })
        .then(data => {
          setAllComps(Array.isArray(data) ? data : []);
        })
        .catch(err => {
          console.error('Error fetching all comps for map:', err);
        })
        .finally(() => {
          setAllCompsLoading(false);
        });
    }
  }, [showCompsPins, allComps.length, allCompsLoading]);

  // Fetch comps whenever activePropertyId changes
  const fetchComps = async (propertyId) => {
    if (!propertyId) {
      setComps([]);
      return;
    }
    setCompsLoading(true);
    setCompsError(null);
    try {
      const res = await fetch(`/api/investor/comps?property_id=${encodeURIComponent(propertyId)}`);
      if (!res.ok) {
        throw new Error(`Failed to load comps (HTTP ${res.status}).`);
      }
      const data = await res.json();
      setComps(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching comps:', err);
      setCompsError(err.message || 'Unable to load sold comps.');
    } finally {
      setCompsLoading(false);
    }
  };

  useEffect(() => {
    if (activePropertyId) {
      fetchComps(activePropertyId);
    }
  }, [activePropertyId]);

  // Navigation handlers
  const handleOpenDetail = (propId) => {
    setActivePropertyId(propId);
    const url = new URL(window.location);
    url.searchParams.set('property', propId);
    window.history.pushState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToList = () => {
    setActivePropertyId(null);
    const url = new URL(window.location);
    url.searchParams.delete('property');
    window.history.pushState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Find active property object
  const activeProperty = properties.find(p => p.id === activePropertyId) || null;

  // Search & Filter in list view
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

  // Open property panel in Add mode
  const handleOpenAddProperty = () => {
    setEditingProperty(null);
    setPropFormData({
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
    setPropFormErrors({});
    setIsPropDeleteConfirming(false);
    setIsPropertyPanelOpen(true);
  };

  // Open property panel in Edit mode
  const handleOpenEditProperty = (p) => {
    setEditingProperty(p);
    setPropFormData({
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
    setPropFormErrors({});
    setIsPropDeleteConfirming(false);
    setIsPropertyPanelOpen(true);
  };

  const handleClosePropertyPanel = () => {
    if (isPropSaving || isPropDeleting) return;
    setIsPropertyPanelOpen(false);
    setIsPropDeleteConfirming(false);
    setPropFormErrors({});
  };

  const handleSaveProperty = async (e) => {
    if (e) e.preventDefault();
    setPropFormErrors({});
    setIsPropSaving(true);

    if (!propFormData.address.trim()) {
      setPropFormErrors({ address: 'Address is required.' });
      setIsPropSaving(false);
      return;
    }

    const payload = {
      ...propFormData,
      address: propFormData.address.trim(),
      city: propFormData.city.trim() || null,
      zip: propFormData.zip.trim() || null,
      county: propFormData.county.trim() || null,
      lat: propFormData.lat != null ? Number(propFormData.lat) : null,
      lng: propFormData.lng != null ? Number(propFormData.lng) : null,
      property_type: propFormData.property_type || null,
      units: propFormData.property_type === 'multifamily_2_9' ? (Number(propFormData.units) || 1) : 1,
      beds: propFormData.beds !== '' ? Number(propFormData.beds) : null,
      baths: propFormData.baths !== '' ? Number(propFormData.baths) : null,
      sqft: propFormData.sqft !== '' ? Number(propFormData.sqft) : null,
      lot_sqft: propFormData.lot_sqft !== '' ? Number(propFormData.lot_sqft) : null,
      year_built: propFormData.year_built !== '' ? Number(propFormData.year_built) : null,
      list_price: propFormData.list_price ? Number(String(propFormData.list_price).replace(/[^\d]/g, '')) : null,
      status: propFormData.status || 'watching',
      strategy: propFormData.strategy || null,
      condition: propFormData.condition.trim() || null,
      roof_year: propFormData.roof_year !== '' ? Number(propFormData.roof_year) : null,
      listing_url: propFormData.listing_url.trim() || null,
      notes: propFormData.notes.trim() || null
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
          setPropFormErrors({ ...data.errors, general: data.error || 'Please correct the highlighted fields.' });
        } else {
          setPropFormErrors({ general: data.error || 'Failed to save property.' });
        }
        setIsPropSaving(false);
        return;
      }

      if (isEdit) {
        setProperties(prev => prev.map(p => (p.id === data.id ? data : p)));
      } else {
        setProperties(prev => [data, ...prev]);
      }

      setIsPropertyPanelOpen(false);
      showToast('Property saved');
    } catch (err) {
      console.error('Save error:', err);
      setPropFormErrors({ general: err.message || 'An unexpected error occurred while saving.' });
    } finally {
      setIsPropSaving(false);
    }
  };

  const handleDeleteProperty = async () => {
    if (!editingProperty) return;
    setIsPropDeleting(true);
    try {
      const res = await fetch('/api/investor/properties', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingProperty.id })
      });

      const data = await res.json();
      if (!res.ok) {
        setPropFormErrors({ general: data.error || 'Failed to delete property.' });
        setIsPropDeleting(false);
        return;
      }

      setProperties(prev => prev.filter(p => p.id !== editingProperty.id));
      setIsPropertyPanelOpen(false);
      setIsPropDeleteConfirming(false);
      showToast('Property deleted');
      if (activePropertyId === editingProperty.id) {
        handleBackToList();
      }
    } catch (err) {
      console.error('Delete error:', err);
      setPropFormErrors({ general: err.message || 'An unexpected error occurred while deleting.' });
    } finally {
      setIsPropDeleting(false);
    }
  };

  // Comp Form Handlers
  const handleOpenAddComp = () => {
    setEditingComp(null);
    setCompFormData({
      address: '',
      city: '',
      zip: '',
      lat: null,
      lng: null,
      sold_date: '',
      sold_price: '',
      sqft: '',
      beds: '',
      baths: '',
      year_built: '',
      source: 'MLS',
      included: true
    });
    setCompFormErrors({});
    setIsCompDeleteConfirming(false);
    setIsCompPanelOpen(true);
  };

  const handleOpenEditComp = (comp) => {
    setEditingComp(comp);
    setCompFormData({
      address: comp.address || '',
      city: comp.city || '',
      zip: comp.zip || '',
      lat: comp.lat != null ? Number(comp.lat) : null,
      lng: comp.lng != null ? Number(comp.lng) : null,
      sold_date: comp.sold_date ? String(comp.sold_date).split('T')[0] : '',
      sold_price: comp.sold_price != null ? formatCurrencyInput(comp.sold_price) : '',
      sqft: comp.sqft != null ? comp.sqft : '',
      beds: comp.beds != null ? comp.beds : '',
      baths: comp.baths != null ? comp.baths : '',
      year_built: comp.year_built != null ? comp.year_built : '',
      source: comp.source || 'MLS',
      included: comp.included !== false
    });
    setCompFormErrors({});
    setIsCompDeleteConfirming(false);
    setIsCompPanelOpen(true);
  };

  const handleCloseCompPanel = () => {
    if (isCompSaving || isCompDeleting) return;
    setIsCompPanelOpen(false);
    setIsCompDeleteConfirming(false);
    setCompFormErrors({});
  };

  const handleSaveComp = async (e) => {
    if (e) e.preventDefault();
    setCompFormErrors({});
    setIsCompSaving(true);

    if (!compFormData.address.trim()) {
      setCompFormErrors({ address: 'Address is required.' });
      setIsCompSaving(false);
      return;
    }

    const payload = {
      ...compFormData,
      property_id: activePropertyId,
      address: compFormData.address.trim(),
      city: compFormData.city.trim() || null,
      zip: compFormData.zip.trim() || null,
      lat: compFormData.lat != null ? Number(compFormData.lat) : null,
      lng: compFormData.lng != null ? Number(compFormData.lng) : null,
      sold_date: compFormData.sold_date || null,
      sold_price: compFormData.sold_price ? Number(String(compFormData.sold_price).replace(/[^\d]/g, '')) : null,
      sqft: compFormData.sqft !== '' ? Number(compFormData.sqft) : null,
      beds: compFormData.beds !== '' ? Number(compFormData.beds) : null,
      baths: compFormData.baths !== '' ? Number(compFormData.baths) : null,
      year_built: compFormData.year_built !== '' ? Number(compFormData.year_built) : null,
      source: compFormData.source || null,
      included: Boolean(compFormData.included)
    };

    if (editingComp) {
      payload.id = editingComp.id;
    }

    try {
      const isEdit = Boolean(editingComp);
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch('/api/investor/comps', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.errors) {
          setCompFormErrors({ ...data.errors, general: data.error || 'Please correct the errors below.' });
        } else {
          setCompFormErrors({ general: data.error || 'Failed to save comp.' });
        }
        setIsCompSaving(false);
        return;
      }

      if (isEdit) {
        setComps(prev => prev.map(c => (c.id === data.id ? data : c)));
      } else {
        setComps(prev => [data, ...prev]);
      }

      setIsCompPanelOpen(false);
      showToast('Comp saved');
    } catch (err) {
      console.error('Save comp error:', err);
      setCompFormErrors({ general: err.message || 'An error occurred while saving comp.' });
    } finally {
      setIsCompSaving(false);
    }
  };

  const handleDeleteComp = async () => {
    if (!editingComp) return;
    setIsCompDeleting(true);
    try {
      const res = await fetch('/api/investor/comps', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingComp.id })
      });

      const data = await res.json();
      if (!res.ok) {
        setCompFormErrors({ general: data.error || 'Failed to delete comp.' });
        setIsCompDeleting(false);
        return;
      }

      setComps(prev => prev.filter(c => c.id !== editingComp.id));
      setIsCompPanelOpen(false);
      setIsCompDeleteConfirming(false);
      showToast('Comp deleted');
    } catch (err) {
      console.error('Delete comp error:', err);
      setCompFormErrors({ general: err.message || 'An error occurred while deleting comp.' });
    } finally {
      setIsCompDeleting(false);
    }
  };

  // Toggle comp included checkbox (instant PUT)
  const handleToggleInclude = async (comp) => {
    const updatedIncluded = !comp.included;
    // Optimistic state update
    setComps(prev => prev.map(c => (c.id === comp.id ? { ...c, included: updatedIncluded } : c)));

    try {
      const res = await fetch('/api/investor/comps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comp.id, included: updatedIncluded })
      });
      if (!res.ok) {
        throw new Error('Failed to update comp inclusion.');
      }
      const data = await res.json();
      setComps(prev => prev.map(c => (c.id === data.id ? data : c)));
    } catch (err) {
      console.error('Toggle include error:', err);
      // Revert on error
      setComps(prev => prev.map(c => (c.id === comp.id ? { ...c, included: !updatedIncluded } : c)));
      showToast('Failed to update comp inclusion');
    }
  };

  // Detail View Stats & Median Calculations
  const includedComps = comps.filter(c => c.included !== false);
  const includedPrices = includedComps.map(c => Number(c.sold_price)).filter(n => n && !isNaN(n));
  const includedSqfts = includedComps.map(c => Number(c.sqft)).filter(n => n && !isNaN(n));
  const includedPpsqft = includedComps.map(c => {
    if (c.price_per_sqft != null) return Number(c.price_per_sqft);
    if (c.sold_price && c.sqft) return Number(c.sold_price) / Number(c.sqft);
    return null;
  }).filter(n => n && !isNaN(n));

  const medianSoldPrice = calculateMedian(includedPrices);
  const medianSqft = calculateMedian(includedSqfts);
  const medianPpsqft = calculateMedian(includedPpsqft);

  // COMP VALUE = median $/sqft of included comps * property sqft, rounded to nearest $100
  let compValueFormatted = '—';
  let rawCompValue = null;
  if (medianPpsqft != null && activeProperty?.sqft) {
    const rawVal = medianPpsqft * Number(activeProperty.sqft);
    rawCompValue = Math.round(rawVal / 100) * 100;
    compValueFormatted = `$${rawCompValue.toLocaleString('en-US')}`;
  }

  // Formatting helpers
  const formatPrice = (val) => {
    if (val == null || val === '') return '—';
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

  const formatSoldDate = (dStr) => {
    if (!dStr) return '—';
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const formatStatus = (status) => {
    if (!status) return 'WATCHING';
    return String(status).replace(/_/g, ' ').toUpperCase();
  };

  const formatPropertyType = (type) => {
    if (!type) return null;
    const map = {
      single_family: 'Single-family',
      condo: 'Condo',
      townhome: 'Townhome',
      multifamily_2_9: 'Multifamily 2–9',
      other: 'Other'
    };
    return map[type] || type;
  };

  // Filter properties in memory based on search filters (list view)
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

        /* Split View (Cards List + Live Map) */
        .investor-split-view {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 24px;
          margin-top: 36px;
          align-items: start;
        }
        .investor-split-list {
          height: 620px;
          overflow-y: auto;
          padding-right: 6px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .investor-compact-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          background: #ffffff;
          border: 1px solid rgba(52, 41, 42, 0.08);
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(52, 41, 42, 0.02);
          cursor: pointer;
          transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
          user-select: none;
        }
        .investor-compact-card:hover,
        .investor-compact-card.is-hovered {
          border-color: var(--secondary-color, #41101B);
          box-shadow: 0 6px 18px rgba(65, 16, 27, 0.09);
          transform: translateY(-2px);
          background-color: #FFFDFB;
        }
        .investor-split-map-container {
          display: flex;
          flex-direction: column;
          height: 620px;
        }
        .investor-split-map-header {
          display: flex;
          justifyContent: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        @media (max-width: 960px) {
          .investor-split-view {
            grid-template-columns: 1fr;
            gap: 20px;
          }
          .investor-split-map-container {
            height: 420px;
          }
          .investor-split-list {
            height: 360px;
          }
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
          cursor: pointer;
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

        /* Custom Selects with subtle chevron */
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

        /* Remove number spinner arrows */
        .investor-form-input::-webkit-outer-spin-button,
        .investor-form-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .investor-form-input[type="number"] {
          -moz-appearance: textfield;
          appearance: textfield;
        }

        /* Autocomplete dropdown styles */
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

        /* Detail View Layout */
        .investor-detail-grid {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 32px;
          align-items: start;
        }

        /* 5-tile Stats Strip */
        .investor-stats-strip {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          background: #ffffff;
          border: 1px solid rgba(52, 41, 42, 0.1);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(52, 41, 42, 0.03);
          margin-bottom: 40px;
        }
        .investor-stat-tile {
          padding: 18px 20px;
          border-right: 1px solid rgba(52, 41, 42, 0.08);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .investor-stat-tile:last-child {
          border-right: none;
        }
        .investor-stat-label {
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(52, 41, 42, 0.55);
        }
        .investor-stat-value {
          font-family: var(--font-display, 'Atelier Fleur', Georgia, serif);
          font-size: 20px;
          font-weight: 600;
          color: var(--espresso, #1E1509);
          line-height: 1.2;
          letter-spacing: -0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Sold Comps Table */
        .investor-table-card {
          background: #ffffff;
          border: 1px solid rgba(52, 41, 42, 0.1);
          border-radius: 12px;
          box-shadow: 0 4px 16px rgba(52, 41, 42, 0.03);
          overflow: hidden;
        }
        .investor-table-wrapper {
          overflow-x: auto;
          width: 100%;
        }
        .investor-comps-table {
          width: 100%;
          border-collapse: collapse;
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 13px;
        }
        .investor-comps-table th {
          background: rgba(52, 41, 42, 0.03);
          border-bottom: 1px solid rgba(52, 41, 42, 0.1);
          padding: 12px 14px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(52, 41, 42, 0.6);
          white-space: nowrap;
        }
        .investor-comps-table td {
          padding: 14px;
          border-bottom: 1px solid rgba(52, 41, 42, 0.06);
          color: var(--espresso, #1E1509);
        }
        .investor-comp-row {
          transition: background-color 0.15s ease, opacity 0.2s ease;
        }
        .investor-comp-row:hover {
          background-color: rgba(52, 41, 42, 0.02);
        }
        .investor-comp-row.excluded {
          opacity: 0.42;
        }
        .investor-median-row td {
          background: rgba(52, 41, 42, 0.04);
          font-weight: 600;
          border-bottom: none;
          padding-top: 14px;
          padding-bottom: 14px;
        }

        /* Responsive Breakpoints */
        @media (max-width: 960px) {
          .investor-detail-grid {
            grid-template-columns: 1fr;
            gap: 28px;
          }
          .investor-stats-strip {
            grid-template-columns: repeat(2, 1fr);
          }
          .investor-stat-tile:nth-child(2) {
            border-right: none;
          }
        }
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
          .investor-stats-strip {
            grid-template-columns: 1fr;
          }
          .investor-stat-tile {
            border-right: none;
            border-bottom: 1px solid rgba(52, 41, 42, 0.08);
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

      {/* ========================================================================= */}
      {/* 1. PROPERTY DETAIL VIEW (When activePropertyId is set)                    */}
      {/* ========================================================================= */}
      {activePropertyId && (
        <div>
          {/* Back link */}
          <div style={{ marginBottom: '24px' }}>
            <button
              type="button"
              onClick={handleBackToList}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--secondary-color, #41101B)',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12.5px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                cursor: 'pointer',
                padding: '4px 0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              &larr; Back to saved properties
            </button>
          </div>

          {activeProperty ? (
            <>
              {/* Detail Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '20px',
                marginBottom: '32px'
              }}>
                <div>
                  {/* Status Eyebrow */}
                  <span style={{
                    display: 'block',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--secondary-color, #41101B)',
                    marginBottom: '8px'
                  }}>
                    {formatStatus(activeProperty.status)}
                  </span>

                  {/* Street Address */}
                  <h1 style={{
                    fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                    fontSize: 'clamp(32px, 4vw, 48px)',
                    fontWeight: 400,
                    lineHeight: 1.15,
                    color: 'var(--espresso, #34292A)',
                    margin: '0 0 6px 0',
                    letterSpacing: '-0.02em'
                  }}>
                    {activeProperty.address}
                  </h1>

                  {/* Subtitle: "City, FL ZIP · Property type · Built YEAR" */}
                  <p style={{
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '14px',
                    color: 'rgba(52, 41, 42, 0.65)',
                    margin: 0
                  }}>
                    {[
                      [activeProperty.city, activeProperty.state || 'FL', activeProperty.zip].filter(Boolean).join(', '),
                      formatPropertyType(activeProperty.property_type),
                      activeProperty.year_built ? `Built ${activeProperty.year_built}` : null
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>

                {/* Top Right: EDIT PROPERTY (Outline pill) */}
                <button
                  type="button"
                  onClick={() => handleOpenEditProperty(activeProperty)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(52, 41, 42, 0.24)',
                    borderRadius: '50px',
                    padding: '10px 22px',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--espresso, #1E1509)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--secondary-color, #41101B)';
                    e.currentTarget.style.color = 'var(--secondary-color, #41101B)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(52, 41, 42, 0.24)';
                    e.currentTarget.style.color = 'var(--espresso, #1E1509)';
                  }}
                >
                  EDIT PROPERTY
                </button>
              </div>

              {/* Stats Strip: 5 Tiles */}
              <div className="investor-stats-strip">
                {/* 1. LIST PRICE */}
                <div className="investor-stat-tile">
                  <span className="investor-stat-label">LIST PRICE</span>
                  <div className="investor-stat-value">
                    {formatPrice(activeProperty.list_price)}
                  </div>
                </div>

                {/* 2. COMP VALUE */}
                <div className="investor-stat-tile">
                  <span className="investor-stat-label">COMP VALUE</span>
                  <div className="investor-stat-value">
                    {compValueFormatted}
                  </div>
                </div>

                {/* 3. $/SQFT · COMPS */}
                <div className="investor-stat-tile">
                  <span className="investor-stat-label">$/SQFT · COMPS</span>
                  <div className="investor-stat-value">
                    {(() => {
                      const propPps = activeProperty.list_price && activeProperty.sqft
                        ? Math.round(Number(activeProperty.list_price) / Number(activeProperty.sqft))
                        : null;
                      const compPps = medianPpsqft != null ? Math.round(medianPpsqft) : null;
                      if (propPps != null && compPps != null) return `$${propPps} · $${compPps}`;
                      if (propPps != null) return `$${propPps} · —`;
                      if (compPps != null) return `— · $${compPps}`;
                      return '—';
                    })()}
                  </div>
                </div>

                {/* 4. SIZE */}
                <div className="investor-stat-tile">
                  <span className="investor-stat-label">SIZE</span>
                  <div className="investor-stat-value">
                    {(() => {
                      const beds = activeProperty.beds != null && activeProperty.beds !== '' ? activeProperty.beds : '—';
                      const baths = activeProperty.baths != null && activeProperty.baths !== '' ? activeProperty.baths : '—';
                      const sqft = activeProperty.sqft ? `${Number(activeProperty.sqft).toLocaleString()} sf` : '—';
                      return `${beds} / ${baths} · ${sqft}`;
                    })()}
                  </div>
                </div>

                {/* 5. CONDITION */}
                <div className="investor-stat-tile">
                  <span className="investor-stat-label">CONDITION</span>
                  <div className="investor-stat-value" title={activeProperty.condition || ''}>
                    {activeProperty.condition || '—'}
                    {activeProperty.roof_year ? ` · roof ${activeProperty.roof_year}` : ''}
                  </div>
                </div>
              </div>

              {/* Main Content Grid: Left Column (Comps + Notes) & Right Column (Underwrite) */}
              <div className="investor-detail-grid">
                {/* LEFT COLUMN */}
                <div>
                  {/* Sold Comps Header */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '18px'
                  }}>
                    <h2 style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '28px',
                      fontWeight: 400,
                      color: 'var(--espresso, #34292A)',
                      margin: 0
                    }}>
                      Sold comps
                    </h2>

                    <button
                      type="button"
                      onClick={handleOpenAddComp}
                      className="investor-search-btn"
                      style={{
                        padding: '10px 20px',
                        fontSize: '11px'
                      }}
                    >
                      + ADD COMP
                    </button>
                  </div>

                  {/* Loading / Error States */}
                  {compsLoading && (
                    <div style={{ padding: '30px 0', textAlign: 'center', color: 'rgba(52, 41, 42, 0.6)', fontSize: '13px' }}>
                      Loading sold comps...
                    </div>
                  )}

                  {compsError && (
                    <div style={{
                      backgroundColor: '#FFF7F5',
                      border: '1px solid rgba(192, 57, 43, 0.2)',
                      borderRadius: '8px',
                      padding: '14px 18px',
                      color: '#A93226',
                      fontSize: '13px',
                      marginBottom: '16px'
                    }}>
                      {compsError}
                    </div>
                  )}

                  {/* Comps Table Card */}
                  {!compsLoading && !compsError && (
                    <div className="investor-table-card">
                      {comps.length === 0 ? (
                        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                          <p style={{
                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                            fontSize: '14px',
                            color: 'rgba(52, 41, 42, 0.65)',
                            margin: 0
                          }}>
                            No comps yet — add 3 to 5 recent sales nearby to value this property.
                          </p>
                        </div>
                      ) : (
                        <div className="investor-table-wrapper">
                          <table className="investor-comps-table">
                            <thead>
                              <tr>
                                <th style={{ width: '44px', textAlign: 'center' }}>INC</th>
                                <th style={{ textAlign: 'left' }}>ADDRESS</th>
                                <th style={{ textAlign: 'left' }}>SOLD</th>
                                <th style={{ textAlign: 'right' }}>PRICE</th>
                                <th style={{ textAlign: 'right' }}>SQFT</th>
                                <th style={{ textAlign: 'right' }}>$/SQFT</th>
                                <th style={{ textAlign: 'right' }}>DIST</th>
                                <th style={{ width: '50px', textAlign: 'center' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {comps.map((c) => {
                                const ppsqft = c.price_per_sqft != null
                                  ? Math.round(Number(c.price_per_sqft))
                                  : (c.sold_price && c.sqft ? Math.round(Number(c.sold_price) / Number(c.sqft)) : null);

                                return (
                                  <tr key={c.id} className={`investor-comp-row ${c.included === false ? 'excluded' : ''}`}>
                                    <td style={{ textAlign: 'center' }}>
                                      <input
                                        type="checkbox"
                                        checked={c.included !== false}
                                        onChange={() => handleToggleInclude(c)}
                                        style={{ cursor: 'pointer', accentColor: 'var(--secondary-color, #41101B)' }}
                                      />
                                    </td>
                                    <td>
                                      <div style={{ fontWeight: 600 }}>{c.address}</div>
                                      {(c.city || c.source) && (
                                        <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.55)' }}>
                                          {[c.city, c.source].filter(Boolean).join(' · ')}
                                        </div>
                                      )}
                                    </td>
                                    <td>{formatSoldDate(c.sold_date)}</td>
                                    <td style={{ textAlign: 'right' }}>{c.sold_price ? formatPrice(c.sold_price) : '—'}</td>
                                    <td style={{ textAlign: 'right' }}>{c.sqft ? Number(c.sqft).toLocaleString() : '—'}</td>
                                    <td style={{ textAlign: 'right' }}>{ppsqft ? `$${ppsqft}` : '—'}</td>
                                    <td style={{ textAlign: 'right' }}>{c.distance_mi != null ? `${c.distance_mi} mi` : '—'}</td>
                                    <td style={{ textAlign: 'center' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditComp(c)}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: 'rgba(52, 41, 42, 0.65)',
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          textDecoration: 'underline',
                                          cursor: 'pointer',
                                          padding: '2px 4px'
                                        }}
                                      >
                                        Edit
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}

                              {/* Shaded Median Row */}
                              <tr className="investor-median-row">
                                <td style={{ textAlign: 'center' }}></td>
                                <td>
                                  <span style={{
                                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: 'var(--espresso, #1E1509)'
                                  }}>
                                    Median ({includedComps.length} included)
                                  </span>
                                </td>
                                <td>—</td>
                                <td style={{ textAlign: 'right' }}>
                                  {medianSoldPrice != null ? formatPrice(Math.round(medianSoldPrice)) : '—'}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  {medianSqft != null ? Number(Math.round(medianSqft)).toLocaleString() : '—'}
                                </td>
                                <td style={{
                                  textAlign: 'right',
                                  color: 'var(--secondary-color, #41101B)',
                                  fontWeight: 700
                                }}>
                                  {medianPpsqft != null ? `$${Math.round(medianPpsqft)}` : '—'}
                                </td>
                                <td style={{ textAlign: 'right' }}>—</td>
                                <td></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes Card: soft beige card, italic serif */}
                  {activeProperty.notes && (
                    <div style={{
                      backgroundColor: 'rgba(140, 121, 106, 0.1)',
                      border: '1px solid rgba(140, 121, 106, 0.22)',
                      borderRadius: '12px',
                      padding: '24px 28px',
                      marginTop: '28px'
                    }}>
                      <span style={{
                        display: 'block',
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'rgba(52, 41, 42, 0.65)',
                        marginBottom: '8px'
                      }}>
                        YOUR NOTES
                      </span>
                      <p style={{
                        fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                        fontStyle: 'italic',
                        fontSize: '16px',
                        color: 'var(--espresso, #1E1509)',
                        lineHeight: 1.6,
                        margin: 0,
                        whiteSpace: 'pre-wrap'
                      }}>
                        {activeProperty.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN: Underwrite Panel */}
                <div>
                  <UnderwritePanel
                    property={activeProperty}
                    compValueRaw={rawCompValue}
                    compValueFormatted={compValueFormatted}
                  />
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '15px', color: 'rgba(52, 41, 42, 0.7)' }}>Property not found.</p>
              <button
                type="button"
                onClick={handleBackToList}
                className="investor-search-btn"
                style={{ padding: '10px 20px', fontSize: '12px', marginTop: '12px' }}
              >
                Return to Saved Properties
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PROPERTY LIST VIEW (When activePropertyId is null)                     */}
      {/* ========================================================================= */}
      {!activePropertyId && (
        <>
          {/* HERO SECTION */}
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

          {/* PILL SEARCH BAR */}
          <form onSubmit={handleSearchSubmit} className="investor-search-container">
            <div className="investor-search-bar">
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

              <button type="submit" className="investor-search-btn">
                SEARCH &rarr;
              </button>
            </div>
          </form>

          {/* SPLIT VIEW: Compact Cards List & Mapbox Live Map */}
          <div className="investor-split-view">
            {/* LEFT: Scrollable list of compact cards */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                padding: '0 2px'
              }}>
                <span style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(52, 41, 42, 0.55)'
                }}>
                  PROPERTIES IN VIEW ({filteredProperties.length})
                </span>
              </div>

              <div className="investor-split-list">
                {filteredProperties.length === 0 ? (
                  <div style={{
                    padding: '36px 16px',
                    textAlign: 'center',
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid rgba(52, 41, 42, 0.08)'
                  }}>
                    <p style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '13px',
                      color: 'rgba(52, 41, 42, 0.6)',
                      margin: 0
                    }}>
                      No saved properties match your filters.
                    </p>
                  </div>
                ) : (
                  filteredProperties.map(p => {
                    const isHovered = hoveredMapPinId === p.id;
                    const pricePerSqft = formatPricePerSqft(p.list_price, p.sqft);
                    const specs = [
                      p.beds != null && p.beds !== '' ? `${p.beds} bd` : null,
                      p.baths != null && p.baths !== '' ? `${p.baths} ba` : null,
                      p.sqft ? `${Number(p.sqft).toLocaleString()} sf` : null
                    ].filter(Boolean).join(' · ');

                    return (
                      <div
                        key={p.id}
                        className={`investor-compact-card ${isHovered ? 'is-hovered' : ''}`}
                        onClick={() => handleOpenDetail(p.id)}
                        onMouseEnter={() => setHoveredMapPinId(p.id)}
                        onMouseLeave={() => setHoveredMapPinId(null)}
                      >
                        {/* Thumbnail Tone Block */}
                        <div style={{
                          width: '52px',
                          height: '52px',
                          borderRadius: '8px',
                          background: 'linear-gradient(145deg, #2E2218 0%, #4A382A 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'rgba(250, 248, 245, 0.4)',
                          flexShrink: 0
                        }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                          </svg>
                        </div>

                        {/* Card Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                            fontSize: '18px',
                            fontWeight: 600,
                            color: 'var(--espresso, #1E1509)',
                            lineHeight: 1.15,
                            marginBottom: '2px'
                          }}>
                            {formatPrice(p.list_price)}
                          </div>

                          <div style={{
                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            color: 'var(--espresso, #34292A)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginBottom: '3px'
                          }}>
                            {p.address}
                          </div>

                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '11px',
                            color: 'rgba(52, 41, 42, 0.65)',
                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
                          }}>
                            <span>{specs || '—'}</span>
                            <span style={{ fontWeight: 600, color: 'var(--espresso, #1E1509)' }}>{pricePerSqft}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT: Map ~620px tall with above-map pill toggles */}
            <div className="investor-split-map-container">
              <div className="investor-split-map-header">
                <span style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(52, 41, 42, 0.55)'
                }}>
                  MAP VIEW
                </span>

                {/* Pill Toggles: My saved & Sold comps */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowSavedPins(prev => !prev)}
                    style={{
                      backgroundColor: showSavedPins ? 'var(--secondary-color, #41101B)' : 'transparent',
                      color: showSavedPins ? 'var(--lighter-tone, #FAF8F5)' : 'rgba(52, 41, 42, 0.75)',
                      border: showSavedPins ? 'none' : '1px solid rgba(52, 41, 42, 0.2)',
                      borderRadius: '50px',
                      padding: '5px 14px',
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    My saved
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCompsPins(prev => !prev)}
                    style={{
                      backgroundColor: showCompsPins ? 'var(--secondary-color, #41101B)' : 'transparent',
                      color: showCompsPins ? 'var(--lighter-tone, #FAF8F5)' : 'rgba(52, 41, 42, 0.75)',
                      border: showCompsPins ? 'none' : '1px solid rgba(52, 41, 42, 0.2)',
                      borderRadius: '50px',
                      padding: '5px 14px',
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {allCompsLoading ? 'Loading comps...' : 'Sold comps'}
                  </button>
                </div>
              </div>

              {/* InvestorMap Component */}
              <div style={{ flex: 1, minHeight: 0 }}>
                {(() => {
                  const propertyPins = filteredProperties
                    .filter(p => p.lat != null && p.lng != null && !isNaN(p.lat) && !isNaN(p.lng))
                    .map(p => ({
                      id: p.id,
                      type: 'property',
                      lat: Number(p.lat),
                      lng: Number(p.lng),
                      price: p.list_price,
                      address: p.address,
                      city: p.city,
                      specs: [
                        p.beds != null && p.beds !== '' ? `${p.beds} bd` : null,
                        p.baths != null && p.baths !== '' ? `${p.baths} ba` : null,
                        p.sqft ? `${Number(p.sqft).toLocaleString()} sf` : null
                      ].filter(Boolean).join(' · '),
                      status: p.status
                    }));

                  const compPins = allComps
                    .filter(c => {
                      if (c.lat == null || c.lng == null || isNaN(c.lat) || isNaN(c.lng)) return false;
                      if (appliedFilters.location) {
                        const q = appliedFilters.location.toLowerCase();
                        const addrMatch = c.address && c.address.toLowerCase().includes(q);
                        const cityMatch = c.city && c.city.toLowerCase().includes(q);
                        const zipMatch = c.zip && c.zip.toLowerCase().includes(q);
                        if (!addrMatch && !cityMatch && !zipMatch) return false;
                      }
                      return true;
                    })
                    .map(c => ({
                      id: `comp-${c.id}`,
                      type: 'comp',
                      lat: Number(c.lat),
                      lng: Number(c.lng),
                      price: c.sold_price,
                      address: c.address,
                      city: c.city,
                      specs: [
                        c.beds != null && c.beds !== '' ? `${c.beds} bd` : null,
                        c.baths != null && c.baths !== '' ? `${c.baths} ba` : null,
                        c.sqft ? `${Number(c.sqft).toLocaleString()} sf` : null
                      ].filter(Boolean).join(' · ')
                    }));

                  const mapPins = [
                    ...(showSavedPins ? propertyPins : []),
                    ...(showCompsPins ? compPins : [])
                  ];

                  return (
                    <InvestorMap
                      pins={mapPins}
                      hoveredId={hoveredMapPinId}
                      onSelectPin={(id) => setHoveredMapPinId(id)}
                      onOpenProperty={(id) => handleOpenDetail(id)}
                      showLegend={true}
                      style={{ height: '100%', minHeight: '560px' }}
                    />
                  );
                })()}
              </div>
            </div>
          </div>

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
                  onClick={handleOpenAddProperty}
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
                  onClick={handleOpenAddProperty}
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

            {!loading && !error && filteredProperties.length > 0 && (
              <div className="investor-grid">
                {filteredProperties.map((p) => {
                  const specs = [
                    p.beds != null && p.beds !== '' ? `${p.beds} bd` : null,
                    p.baths != null && p.baths !== '' ? `${p.baths} ba` : null,
                    p.sqft ? `${Number(p.sqft).toLocaleString('en-US')} sqft` : null,
                    p.year_built ? `Built ${p.year_built}` : null
                  ].filter(Boolean).join(' · ');

                  const pricePerSqft = formatPricePerSqft(p.list_price, p.sqft);
                  const cityStateZip = [p.city, p.state || 'FL', p.zip].filter(Boolean).join(', ');

                  return (
                    <div
                      key={p.id}
                      className="investor-card"
                      onClick={() => handleOpenDetail(p.id)}
                    >
                      {/* Photo Block */}
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
                              {formatStatus(p.strategy)}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditProperty(p);
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
        </>
      )}

      {/* ========================================================================= */}
      {/* 3. SLIDE-IN ADD / EDIT PROPERTY PANEL                                     */}
      {/* ========================================================================= */}
      {isPropertyPanelOpen && (
        <>
          <div className="investor-panel-overlay" onClick={handleClosePropertyPanel} />
          <div className="investor-slide-panel" role="dialog" aria-modal="true">
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
                onClick={handleClosePropertyPanel}
                disabled={isPropSaving || isPropDeleting}
                aria-label="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  lineHeight: 1,
                  color: 'rgba(52, 41, 42, 0.6)',
                  cursor: (isPropSaving || isPropDeleting) ? 'not-allowed' : 'pointer',
                  padding: '6px'
                }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveProperty} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{
                padding: '28px 30px',
                overflowY: 'auto',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '26px'
              }}>
                {propFormErrors.general && (
                  <div style={{
                    backgroundColor: '#FFF7F5',
                    border: '1px solid rgba(192, 57, 43, 0.25)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    color: '#C0392B',
                    fontSize: '13px',
                    lineHeight: 1.4
                  }}>
                    {propFormErrors.general}
                  </div>
                )}

                {/* LOCATION */}
                <div>
                  <span className="investor-section-header">LOCATION</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <AddressAutocomplete
                      id="prop-address"
                      label="Address *"
                      value={propFormData.address}
                      onChange={(val) => {
                        setPropFormData(prev => ({ ...prev, address: val, lat: null, lng: null }));
                        if (propFormErrors.address) {
                          setPropFormErrors(prev => {
                            const c = { ...prev };
                            delete c.address;
                            return c;
                          });
                        }
                      }}
                      onSelect={(details) => {
                        setPropFormData(prev => ({
                          ...prev,
                          address: details.address,
                          city: details.city || prev.city,
                          zip: details.zip || prev.zip,
                          county: details.county || prev.county,
                          lat: details.lat,
                          lng: details.lng
                        }));
                      }}
                      error={propFormErrors.address}
                    />

                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-city">City</label>
                        <input
                          id="prop-city"
                          type="text"
                          value={propFormData.city}
                          onChange={(e) => setPropFormData(prev => ({ ...prev, city: e.target.value }))}
                          placeholder="e.g. Fort Lauderdale"
                          className="investor-form-input"
                        />
                      </div>
                      <div>
                        <label className="investor-form-label" htmlFor="prop-zip">ZIP</label>
                        <input
                          id="prop-zip"
                          type="text"
                          inputMode="numeric"
                          value={propFormData.zip}
                          onChange={(e) => setPropFormData(prev => ({ ...prev, zip: e.target.value }))}
                          placeholder="e.g. 33301"
                          className="investor-form-input"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="investor-form-label" htmlFor="prop-county">County</label>
                      <select
                        id="prop-county"
                        value={propFormData.county}
                        onChange={(e) => setPropFormData(prev => ({ ...prev, county: e.target.value }))}
                        className={`investor-form-select ${!propFormData.county ? 'placeholder-active' : ''}`}
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

                {/* THE PROPERTY */}
                <div>
                  <span className="investor-section-header">THE PROPERTY</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-type">Property Type</label>
                        <select
                          id="prop-type"
                          value={propFormData.property_type}
                          onChange={(e) => setPropFormData(prev => ({ ...prev, property_type: e.target.value }))}
                          className={`investor-form-select ${!propFormData.property_type ? 'placeholder-active' : ''}`}
                        >
                          <option value="single_family">Single-family</option>
                          <option value="condo">Condo</option>
                          <option value="townhome">Townhome</option>
                          <option value="multifamily_2_9">Multifamily 2–9 units</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      {propFormData.property_type === 'multifamily_2_9' ? (
                        <div>
                          <label className="investor-form-label" htmlFor="prop-units">Units</label>
                          <input
                            id="prop-units"
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={propFormData.units}
                            onChange={(e) => setPropFormData(prev => ({ ...prev, units: e.target.value }))}
                            className="investor-form-input"
                          />
                        </div>
                      ) : <div />}
                    </div>

                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-beds">Beds</label>
                        <input
                          id="prop-beds"
                          type="number"
                          step="any"
                          inputMode="numeric"
                          value={propFormData.beds}
                          onChange={(e) => setPropFormData(prev => ({ ...prev, beds: e.target.value }))}
                          placeholder="e.g. 3"
                          className="investor-form-input"
                        />
                      </div>
                      <div>
                        <label className="investor-form-label" htmlFor="prop-baths">Baths</label>
                        <input
                          id="prop-baths"
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={propFormData.baths}
                          onChange={(e) => setPropFormData(prev => ({ ...prev, baths: e.target.value }))}
                          placeholder="e.g. 2.5"
                          className="investor-form-input"
                        />
                      </div>
                    </div>

                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-sqft">Living sqft</label>
                        <input
                          id="prop-sqft"
                          type="number"
                          step="1"
                          inputMode="numeric"
                          value={propFormData.sqft}
                          onChange={(e) => setPropFormData(prev => ({ ...prev, sqft: e.target.value }))}
                          placeholder="e.g. 1850"
                          className="investor-form-input"
                        />
                      </div>
                      <div>
                        <label className="investor-form-label" htmlFor="prop-lot-sqft">Lot sqft</label>
                        <input
                          id="prop-lot-sqft"
                          type="number"
                          step="1"
                          inputMode="numeric"
                          value={propFormData.lot_sqft}
                          onChange={(e) => setPropFormData(prev => ({ ...prev, lot_sqft: e.target.value }))}
                          placeholder="e.g. 6500"
                          className="investor-form-input"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="investor-form-label" htmlFor="prop-year-built">Year built</label>
                      <input
                        id="prop-year-built"
                        type="number"
                        step="1"
                        inputMode="numeric"
                        value={propFormData.year_built}
                        onChange={(e) => setPropFormData(prev => ({ ...prev, year_built: e.target.value }))}
                        placeholder="e.g. 1988"
                        className="investor-form-input"
                      />
                    </div>
                  </div>
                </div>

                {/* THE DEAL */}
                <div>
                  <span className="investor-section-header">THE DEAL</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label className="investor-form-label" htmlFor="prop-price">List Price</label>
                      <input
                        id="prop-price"
                        type="text"
                        value={propFormData.list_price}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^\d]/g, '');
                          setPropFormData(prev => ({
                            ...prev,
                            list_price: digits ? `$${Number(digits).toLocaleString('en-US')}` : ''
                          }));
                        }}
                        placeholder="$0"
                        className="investor-form-input"
                      />
                    </div>

                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-status">Status</label>
                        <select
                          id="prop-status"
                          value={propFormData.status}
                          onChange={(e) => setPropFormData(prev => ({ ...prev, status: e.target.value }))}
                          className="investor-form-select"
                        >
                          <option value="watching">Watching</option>
                          <option value="analyzing">Analyzing</option>
                          <option value="offer_sent">Offer sent</option>
                          <option value="under_contract">Under contract</option>
                          <option value="passed">Passed</option>
                          <option value="owned">Owned</option>
                        </select>
                      </div>

                      <div>
                        <label className="investor-form-label" htmlFor="prop-strategy">Strategy</label>
                        <select
                          id="prop-strategy"
                          value={propFormData.strategy}
                          onChange={(e) => setPropFormData(prev => ({ ...prev, strategy: e.target.value }))}
                          className={`investor-form-select ${!propFormData.strategy ? 'placeholder-active' : ''}`}
                        >
                          <option value="">Select strategy</option>
                          <option value="rental">Rental</option>
                          <option value="flip">Flip</option>
                          <option value="brrrr">BRRRR</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="investor-form-label" htmlFor="prop-listing-url">Listing Link</label>
                      <input
                        id="prop-listing-url"
                        type="url"
                        value={propFormData.listing_url}
                        onChange={(e) => setPropFormData(prev => ({ ...prev, listing_url: e.target.value }))}
                        placeholder="https://..."
                        className="investor-form-input"
                      />
                    </div>
                  </div>
                </div>

                {/* CONDITION */}
                <div>
                  <span className="investor-section-header">CONDITION</span>
                  <div className="investor-form-grid-2">
                    <div>
                      <label className="investor-form-label" htmlFor="prop-condition">Condition</label>
                      <input
                        id="prop-condition"
                        type="text"
                        value={propFormData.condition}
                        onChange={(e) => setPropFormData(prev => ({ ...prev, condition: e.target.value }))}
                        placeholder="e.g. Dated, original kitchen"
                        className="investor-form-input"
                      />
                    </div>
                    <div>
                      <label className="investor-form-label" htmlFor="prop-roof-year">Roof Year</label>
                      <input
                        id="prop-roof-year"
                        type="number"
                        step="1"
                        inputMode="numeric"
                        value={propFormData.roof_year}
                        onChange={(e) => setPropFormData(prev => ({ ...prev, roof_year: e.target.value }))}
                        placeholder="e.g. 2018"
                        className="investor-form-input"
                      />
                    </div>
                  </div>
                </div>

                {/* NOTES */}
                <div>
                  <span className="investor-section-header">NOTES</span>
                  <div>
                    <label className="investor-form-label" htmlFor="prop-notes">Notes</label>
                    <textarea
                      id="prop-notes"
                      rows={3}
                      value={propFormData.notes}
                      onChange={(e) => setPropFormData(prev => ({ ...prev, notes: e.target.value }))}
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
                {isPropDeleteConfirming ? (
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
                        onClick={() => setIsPropDeleteConfirming(false)}
                        disabled={isPropDeleting}
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
                        disabled={isPropDeleting}
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
                          cursor: isPropDeleting ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isPropDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    {editingProperty ? (
                      <button
                        type="button"
                        onClick={() => setIsPropDeleteConfirming(true)}
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
                    ) : <div />}

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={handleClosePropertyPanel}
                        disabled={isPropSaving}
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
                          cursor: isPropSaving ? 'not-allowed' : 'pointer'
                        }}
                      >
                        CANCEL
                      </button>
                      <button
                        type="submit"
                        disabled={isPropSaving}
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
                          cursor: isPropSaving ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isPropSaving ? 'Saving…' : 'SAVE PROPERTY'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 4. SLIDE-IN ADD / EDIT COMP PANEL                                         */}
      {/* ========================================================================= */}
      {isCompPanelOpen && (
        <>
          <div className="investor-panel-overlay" onClick={handleCloseCompPanel} />
          <div className="investor-slide-panel" role="dialog" aria-modal="true">
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
                  SOLD COMPARABLE
                </span>
                <h2 style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '26px',
                  fontWeight: 400,
                  color: 'var(--espresso, #34292A)',
                  margin: 0
                }}>
                  {editingComp ? 'Edit comp' : 'Add a comp'}
                </h2>
              </div>

              <button
                type="button"
                onClick={handleCloseCompPanel}
                disabled={isCompSaving || isCompDeleting}
                aria-label="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  lineHeight: 1,
                  color: 'rgba(52, 41, 42, 0.6)',
                  cursor: (isCompSaving || isCompDeleting) ? 'not-allowed' : 'pointer',
                  padding: '6px'
                }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveComp} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{
                padding: '28px 30px',
                overflowY: 'auto',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '24px'
              }}>
                {compFormErrors.general && (
                  <div style={{
                    backgroundColor: '#FFF7F5',
                    border: '1px solid rgba(192, 57, 43, 0.25)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    color: '#C0392B',
                    fontSize: '13px',
                    lineHeight: 1.4
                  }}>
                    {compFormErrors.general}
                  </div>
                )}

                {/* Address (Reusing Mapbox AddressAutocomplete) */}
                <AddressAutocomplete
                  id="comp-address"
                  label="Address *"
                  value={compFormData.address}
                  onChange={(val) => {
                    setCompFormData(prev => ({ ...prev, address: val, lat: null, lng: null }));
                    if (compFormErrors.address) {
                      setCompFormErrors(prev => {
                        const c = { ...prev };
                        delete c.address;
                        return c;
                      });
                    }
                  }}
                  onSelect={(details) => {
                    setCompFormData(prev => ({
                      ...prev,
                      address: details.address,
                      city: details.city || prev.city,
                      zip: details.zip || prev.zip,
                      lat: details.lat,
                      lng: details.lng
                    }));
                  }}
                  error={compFormErrors.address}
                />

                <div className="investor-form-grid-2">
                  <div>
                    <label className="investor-form-label" htmlFor="comp-city">City</label>
                    <input
                      id="comp-city"
                      type="text"
                      value={compFormData.city}
                      onChange={(e) => setCompFormData(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="e.g. Fort Lauderdale"
                      className="investor-form-input"
                    />
                  </div>
                  <div>
                    <label className="investor-form-label" htmlFor="comp-zip">ZIP</label>
                    <input
                      id="comp-zip"
                      type="text"
                      inputMode="numeric"
                      value={compFormData.zip}
                      onChange={(e) => setCompFormData(prev => ({ ...prev, zip: e.target.value }))}
                      placeholder="e.g. 33301"
                      className="investor-form-input"
                    />
                  </div>
                </div>

                <div className="investor-form-grid-2">
                  <div>
                    <label className="investor-form-label" htmlFor="comp-sold-date">Sold Date</label>
                    <input
                      id="comp-sold-date"
                      type="date"
                      value={compFormData.sold_date}
                      onChange={(e) => setCompFormData(prev => ({ ...prev, sold_date: e.target.value }))}
                      className={`investor-form-input ${compFormErrors.sold_date ? 'has-error' : ''}`}
                    />
                    {compFormErrors.sold_date && (
                      <span className="investor-field-error">{compFormErrors.sold_date}</span>
                    )}
                  </div>
                  <div>
                    <label className="investor-form-label" htmlFor="comp-sold-price">Sold Price</label>
                    <input
                      id="comp-sold-price"
                      type="text"
                      value={compFormData.sold_price}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^\d]/g, '');
                        setCompFormData(prev => ({
                          ...prev,
                          sold_price: digits ? `$${Number(digits).toLocaleString('en-US')}` : ''
                        }));
                      }}
                      placeholder="$0"
                      className="investor-form-input"
                    />
                  </div>
                </div>

                <div className="investor-form-grid-2">
                  <div>
                    <label className="investor-form-label" htmlFor="comp-sqft">Living sqft</label>
                    <input
                      id="comp-sqft"
                      type="number"
                      step="1"
                      inputMode="numeric"
                      value={compFormData.sqft}
                      onChange={(e) => setCompFormData(prev => ({ ...prev, sqft: e.target.value }))}
                      placeholder="e.g. 1650"
                      className="investor-form-input"
                    />
                  </div>
                  <div>
                    <label className="investor-form-label" htmlFor="comp-year-built">Year Built</label>
                    <input
                      id="comp-year-built"
                      type="number"
                      step="1"
                      inputMode="numeric"
                      value={compFormData.year_built}
                      onChange={(e) => setCompFormData(prev => ({ ...prev, year_built: e.target.value }))}
                      placeholder="e.g. 1985"
                      className="investor-form-input"
                    />
                  </div>
                </div>

                <div className="investor-form-grid-2">
                  <div>
                    <label className="investor-form-label" htmlFor="comp-beds">Beds</label>
                    <input
                      id="comp-beds"
                      type="number"
                      step="any"
                      inputMode="numeric"
                      value={compFormData.beds}
                      onChange={(e) => setCompFormData(prev => ({ ...prev, beds: e.target.value }))}
                      placeholder="e.g. 3"
                      className="investor-form-input"
                    />
                  </div>
                  <div>
                    <label className="investor-form-label" htmlFor="comp-baths">Baths</label>
                    <input
                      id="comp-baths"
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={compFormData.baths}
                      onChange={(e) => setCompFormData(prev => ({ ...prev, baths: e.target.value }))}
                      placeholder="e.g. 2"
                      className="investor-form-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="investor-form-label" htmlFor="comp-source">Source</label>
                  <select
                    id="comp-source"
                    value={compFormData.source}
                    onChange={(e) => setCompFormData(prev => ({ ...prev, source: e.target.value }))}
                    className="investor-form-select"
                  >
                    <option value="MLS">MLS</option>
                    <option value="Property appraiser">Property appraiser</option>
                    <option value="Zillow">Zillow</option>
                    <option value="Redfin">Redfin</option>
                    <option value="Realtor">Realtor</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Comp Panel Footer */}
              <div style={{
                padding: '20px 30px',
                borderTop: '1px solid rgba(52, 41, 42, 0.1)',
                backgroundColor: 'var(--lighter-tone, #FAF8F5)'
              }}>
                {isCompDeleteConfirming ? (
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
                      Delete this comp?
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setIsCompDeleteConfirming(false)}
                        disabled={isCompDeleting}
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
                        onClick={handleDeleteComp}
                        disabled={isCompDeleting}
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
                          cursor: isCompDeleting ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isCompDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    {editingComp ? (
                      <button
                        type="button"
                        onClick={() => setIsCompDeleteConfirming(true)}
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
                        Delete comp
                      </button>
                    ) : <div />}

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={handleCloseCompPanel}
                        disabled={isCompSaving}
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
                          cursor: isCompSaving ? 'not-allowed' : 'pointer'
                        }}
                      >
                        CANCEL
                      </button>
                      <button
                        type="submit"
                        disabled={isCompSaving}
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
                          cursor: isCompSaving ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isCompSaving ? 'Saving…' : 'SAVE COMP'}
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
