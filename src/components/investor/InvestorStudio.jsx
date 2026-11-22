import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import AddressAutocomplete from './AddressAutocomplete.jsx';
import UnderwritePanel from './UnderwritePanel.jsx';
import FormattedNumberInput from './FormattedNumberInput.jsx';
import InvestorMap from './InvestorMap.jsx';
import CountyRecordCard from './CountyRecordCard.jsx';
import SiteZoningCard from './SiteZoningCard.jsx';
import SuggestedCompsPanel from './SuggestedCompsPanel.jsx';
import MarketCard from './MarketCard.jsx';
import WatchedLocations from './WatchedLocations.jsx';
import AerialPhoto from './AerialPhoto.jsx';
import PropertyPhotosSection from './PropertyPhotosSection.jsx';
import PropertyDocumentsSection from './PropertyDocumentsSection.jsx';
import BuyingProfileModal from './BuyingProfileModal.jsx';
import AppraisalGridSection from './AppraisalGridSection.jsx';
import AdjustmentLibraryModal from './AdjustmentLibraryModal.jsx';
import CompDetailsDrawer from './CompDetailsDrawer.jsx';
import DealBreakdownSection from './DealBreakdownSection.jsx';
import DataCompletenessCard from './DataCompletenessCard.jsx';
import PasteListingModal from './PasteListingModal.jsx';
import { mergeCountyDataIntoProperty } from '../../utils/propertyCompleteness.js';
import SectionErrorBoundary from '../ui/SectionErrorBoundary.jsx';
import FlipBuildFinder from './FlipBuildFinder.jsx';
import {
  computeAppraisalGrid,
  normalizeReconciliationWeights,
  resolveCompIsIncluded,
  COMP_CONDITIONS
} from './valuationEngine.js';
import {
  computeDetailsProgress,
  formatCountyClues,
  detailsToLegacyColumns,
  CONSTRUCTION_TYPE_OPTIONS,
  formatBoatDockLabel,
  formatConstructionTypeLabel
} from './compDetailsModel.js';
import { formatCurrency, evaluateLiveInFit } from './underwriting.js';
import { LIVE_IN_PLAN_DISCLAIMER } from '../../config/financing.js';
import LiveInFitBadge from './LiveInFitBadge.jsx';
import { resolvePropertyCounty, getPropertyCountyLabel, normalizeCountyName } from '../../config/counties.js';
import { isSameSubdivision } from '../../utils/subdivision.js';
import { PRICE_SOURCE_OPTIONS, getPriceSourceMeta, resolvePropertyPricing } from './priceSource.js';
import { buildValuationEstimatePdfBase64 } from '../../utils/valuationPdfBuilder.js';
import {
  Button,
  Pill,
  Eyebrow,
  SectionHeading,
  EmptyState,
  DarkBand
} from '../ui';

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

const VALID_PROPERTY_TABS = ['overview', 'comps', 'appraisal', 'site', 'deal', 'breakdown', 'photos'];

function resolvePropertyTabFromSearch(searchStr) {
  const params = new URLSearchParams(searchStr);
  const raw = (params.get('investor_tab') || params.get('tab') || '').toLowerCase();
  return VALID_PROPERTY_TABS.includes(raw) ? raw : 'overview';
}

export default function InvestorStudio({ setActiveDashboardTab, navigateTo }) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [designLoading, setDesignLoading] = useState(false);

  // Active property for Detail View (null = List View, string = Detail View)
  const [activePropertyId, setActivePropertyId] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('property') || null;
    }
    return null;
  });
  const [detailPhotoView, setDetailPhotoView] = useState('photos'); // 'photos' | 'aerial'
  const [activePropertyCover, setActivePropertyCover] = useState(null);

  // Active Tab for Property Detail View: 'overview' | 'comps' | 'appraisal' | 'site' | 'deal' | 'breakdown' | 'photos'
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      return resolvePropertyTabFromSearch(window.location.search);
    }
    return 'overview';
  });

  // Top-level Studio Mode (when activePropertyId is null): 'properties' | 'finder'
  const [studioMode, setStudioMode] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.__investorStudioInitialMode === 'finder') return 'finder';
      const params = new URLSearchParams(window.location.search);
      if ((params.get('investor_view') || '').toLowerCase() === 'finder') return 'finder';
    }
    return 'properties';
  });
  const [finderInitialZip, setFinderInitialZip] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.__investorStudioInitialZip) return String(window.__investorStudioInitialZip);
      const params = new URLSearchParams(window.location.search);
      return params.get('finder_zip') || '';
    }
    return '';
  });
  const [activeFinderRow, setActiveFinderRow] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.__investorStudioInitialMode) {
        if (window.__investorStudioInitialMode === 'finder') {
          setStudioMode('finder');
          setActivePropertyId(null);
          setActiveFinderRow(null);
        }
        window.__investorStudioInitialMode = null;
      }
      if (window.__investorStudioInitialZip) {
        setFinderInitialZip(String(window.__investorStudioInitialZip));
        window.__investorStudioInitialZip = null;
      }
    }
  }, []);

  const handleSwitchStudioMode = (nextMode) => {
    setStudioMode(nextMode);
    setActiveFinderRow(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (nextMode === 'finder') {
        url.searchParams.set('investor_view', 'finder');
      } else {
        url.searchParams.delete('investor_view');
        url.searchParams.delete('finder_zip');
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  // State received from detail sub-components
  const [underwriteSummary, setUnderwriteSummary] = useState(null);
  const [siteData, setSiteData] = useState(null);
  const [countyData, setCountyData] = useState(null);
  const [isCountyLoading, setIsCountyLoading] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const _underwriteRef = useRef(null);

  // Buying profile state
  const [buyingProfile, setBuyingProfile] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/investor/profile')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (isMounted && data) {
          setBuyingProfile(data);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  // Search & filter state (List view)
  const [locationInput, setLocationInput] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [fitsLiveInFilter, setFitsLiveInFilter] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({
    location: '',
    type: 'all',
    strategy: 'all',
    fitsLiveIn: false
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
    price_source: 'list_price',
    offer_price: '',
    status: 'watching',
    strategy: '',
    condition: '',
    roof_year: '',
    listing_url: '',
    notes: '',
    parcel_id: null,
    parcel_county: null,
    has_hoa: null,
    hoa_monthly: '',
    hoa_name: '',
    boat_dock: null,
    boat_dock_sqft: '',
    construction_type: '',
    construction_detail: '',
    sketch_areas: '',
    recent_improvements: ''
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
  const [addedCompsSameNbrhdOnly, setAddedCompsSameNbrhdOnly] = useState(false);

  // Slide-in Comp / Subject Details Drawer state
  const [isCompPanelOpen, setIsCompPanelOpen] = useState(false);
  const [detailsDrawerEntityType, setDetailsDrawerEntityType] = useState('comp');
  const [initialSubjectDetailsMode, setInitialSubjectDetailsMode] = useState('as_is');
  const [editingComp, setEditingComp] = useState(null);
  const [isCompSaving, setIsCompSaving] = useState(false);
  const [isCompDeleting, setIsCompDeleting] = useState(false);

  // Appraisal & Sales Comparison Grid State
  const [appraisalMode, setAppraisalMode] = useState('as_is');
  const [sizeMethod, setSizeMethod] = useState('auto');
  const [customWeights, setCustomWeights] = useState(null);
  const [subjectAppraisalOverrides, setSubjectAppraisalOverrides] = useState({});
  const [isAdjustmentLibraryOpen, setIsAdjustmentLibraryOpen] = useState(false);
  const [isSavingAppraisal, setIsSavingAppraisal] = useState(false);
  const [lastAppraisalSavedAt, setLastAppraisalSavedAt] = useState(null);
  const [appliedAppraisal, setAppliedAppraisal] = useState(null);

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
      setActiveTab(resolvePropertyTabFromSearch(window.location.search));
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
    setAddedCompsSameNbrhdOnly(false);
    if (activePropertyId) {
      fetchComps(activePropertyId);
    }
  }, [activePropertyId]);

  // Navigation handlers
  const handleOpenDetail = (propId) => {
    setActivePropertyId(propId);
    setDetailPhotoView('photos');
    setActivePropertyCover(null);
    setUnderwriteSummary(null);
    setSiteData(null);
    setCountyData(null);
    const url = new URL(window.location);
    url.searchParams.set('property', propId);
    const currentTab = resolvePropertyTabFromSearch(window.location.search);
    url.searchParams.set('tab', currentTab);
    setActiveTab(currentTab);
    window.history.pushState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToList = () => {
    setActivePropertyId(null);
    setActiveTab('overview');
    setUnderwriteSummary(null);
    setSiteData(null);
    setCountyData(null);
    const url = new URL(window.location);
    url.searchParams.delete('property');
    url.searchParams.delete('investor_tab');
    url.searchParams.set('tab', 'investor');
    window.history.pushState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDesignThisProperty = async (prop) => {
    if (!prop) return;
    setDesignLoading(true);
    try {
      // 1. Check if a project already exists for this property
      const res = await fetch(`/api/designer/projects?investor_property_id=${prop.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.project?.id) {
          if (typeof setActiveDashboardTab === 'function') {
            setActiveDashboardTab('designer');
          }
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', 'designer');
            url.searchParams.set('project_id', data.project.id);
            url.searchParams.set('designer_tab', 'projects');
            window.history.pushState({}, '', url.toString());
            if (typeof setActiveDashboardTab !== 'function') {
              window.location.reload();
            }
          }
          return;
        }
      }

      // 2. If no project exists, create one linked to this property
      const createRes = await fetch('/api/designer/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${prop.address} Design`,
          location: `${prop.address}${prop.city ? ', ' + prop.city : ''}`,
          project_type: 'investor',
          status: 'concept',
          target_budget: prop.list_price ? Math.round(Number(prop.list_price) * 0.1) : null,
          contingency_pct: 10,
          investor_property_id: prop.id,
          cover_url: prop.cover_photo_url || null,
          notes: `Linked to Investor Studio property at ${prop.address}.`,
          initial_rooms: ['Kitchen', 'Primary bath', 'Living room', 'Bedrooms']
        })
      });

      if (createRes.ok) {
        const createData = await createRes.json();
        const newProjId = createData.project?.id;
        if (typeof setActiveDashboardTab === 'function') {
          setActiveDashboardTab('designer');
        }
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('tab', 'designer');
          if (newProjId) {
            url.searchParams.set('project_id', newProjId);
          }
          url.searchParams.set('designer_tab', 'projects');
          window.history.pushState({}, '', url.toString());
          if (typeof setActiveDashboardTab !== 'function') {
            window.location.reload();
          }
        }
      } else {
        if (typeof setActiveDashboardTab === 'function') {
          setActiveDashboardTab('designer');
        }
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('tab', 'designer');
          url.searchParams.set('new_project_property_id', prop.id);
          window.history.pushState({}, '', url.toString());
          if (typeof setActiveDashboardTab !== 'function') {
            window.location.reload();
          }
        }
      }
    } catch (err) {
      console.warn('Error opening/creating designer project:', err);
      if (typeof setActiveDashboardTab === 'function') {
        setActiveDashboardTab('designer');
      }
    } finally {
      setDesignLoading(false);
    }
  };

  const handleSelectTab = (tabKey) => {
    setActiveTab(tabKey);
    const url = new URL(window.location);
    url.searchParams.set('tab', tabKey);
    window.history.replaceState({}, '', url);
  };

  // Find active property object
  const activeProperty = properties.find(p => p.id === activePropertyId) || null;

  // One-lookup property fill: auto-populates every tab from county records
  const handleOneLookupFill = useCallback(async (prop, forceRefresh = false) => {
    if (!prop || !prop.address) return;
    const propId = prop.id;
    let folio = prop.parcel_id || null;
    let county = prop.parcel_county || prop.county || null;

    setIsCountyLoading(true);
    try {
      if (!folio) {
        // Resolve folio by address search across counties
        const searchRes = await fetch(`/api/county/search?q=${encodeURIComponent(prop.address)}&county=${encodeURIComponent(county || '')}`);
        if (searchRes.ok) {
          const searchJson = await searchRes.json();
          const firstHit = (Array.isArray(searchJson) ? searchJson : searchJson?.results)?.[0];
          if (firstHit?.parcel_id) {
            folio = firstHit.parcel_id;
            if (firstHit.county) county = firstHit.county;
          }
        }
      }

      if (folio) {
        const pCounty = county || 'Palm Beach';
        const parcelRes = await fetch(`/api/county/parcel?county=${encodeURIComponent(pCounty)}&parcel_id=${encodeURIComponent(folio)}`);
        if (parcelRes.ok) {
          const pData = await parcelRes.json();
          setCountyData(pData);
          setProperties((prev) =>
            prev.map((p) => {
              if (p.id !== propId) return p;
              return mergeCountyDataIntoProperty(p, pData);
            })
          );
          if (showToast && forceRefresh) {
            showToast('County record & building characteristics updated');
          }
        }
      }
    } catch (err) {
      console.warn('[One-Lookup Fill] Non-fatal error filling county data:', err?.message);
    } finally {
      setIsCountyLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (activeProperty?.id && (!countyData || countyData.parcel_id !== activeProperty.parcel_id)) {
      handleOneLookupFill(activeProperty);
    }
  }, [activeProperty?.id, activeProperty?.parcel_id, countyData, handleOneLookupFill]);

  const handleApplyListingDetails = useCallback((patch) => {
    if (!activeProperty?.id || !patch) return;
    const propId = activeProperty.id;

    // Build field_sources marking applied fields as manual edits so user edits always win
    const fieldSources = { ...(activeProperty.field_sources || {}) };
    const nowIso = new Date().toISOString();
    Object.keys(patch).forEach((key) => {
      fieldSources[key] = {
        source: 'manual',
        updated_at: nowIso,
        label: 'Pasted listing details'
      };
    });

    const updated = {
      ...activeProperty,
      ...patch,
      field_sources: fieldSources
    };

    setProperties((prev) => prev.map((p) => (p.id === propId ? updated : p)));
    setIsPasteModalOpen(false);
    if (showToast) showToast('Listing details applied to property specs');

    fetch('/api/investor/properties', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: propId, ...patch, field_sources: fieldSources })
    }).catch(() => {});
  }, [activeProperty, showToast]);

  // Search & Filter in list view
  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    setAppliedFilters({
      location: locationInput.trim().toLowerCase(),
      type: typeFilter,
      strategy: strategyFilter,
      fitsLiveIn: fitsLiveInFilter
    });
  };

  const handleToggleFitsLiveIn = () => {
    setFitsLiveInFilter((prev) => {
      const next = !prev;
      setAppliedFilters((af) => ({ ...af, fitsLiveIn: next }));
      return next;
    });
  };

  const handleClearFilters = () => {
    setLocationInput('');
    setTypeFilter('all');
    setStrategyFilter('all');
    setFitsLiveInFilter(false);
    setAppliedFilters({ location: '', type: 'all', strategy: 'all', fitsLiveIn: false });
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
      price_source: 'list_price',
      offer_price: '',
      status: 'watching',
      strategy: '',
      condition: '',
      roof_year: '',
      listing_url: '',
      notes: '',
      parcel_id: null,
      parcel_county: null,
      has_hoa: null,
      hoa_monthly: '',
      hoa_name: '',
      boat_dock: null,
      boat_dock_sqft: '',
      construction_type: '',
      construction_detail: '',
      sketch_areas: '',
      recent_improvements: '',
      is_studying: false
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
      price_source: p.price_source || p.subject_details?.price_source || 'list_price',
      offer_price: (p.offer_price ?? p.subject_details?.offer_price) != null
        ? formatCurrencyInput(p.offer_price ?? p.subject_details?.offer_price)
        : '',
      status: p.status || 'watching',
      strategy: p.strategy || '',
      condition: p.condition || '',
      roof_year: p.roof_year != null ? p.roof_year : '',
      listing_url: p.listing_url || '',
      notes: p.notes || '',
      parcel_id: p.parcel_id || null,
      parcel_county: p.parcel_county || null,
      has_hoa: p.has_hoa ?? null,
      hoa_monthly: p.hoa_monthly != null ? p.hoa_monthly : '',
      hoa_name: p.hoa_name || p.subject_details?.as_is?.hoa_name || '',
      boat_dock: p.boat_dock !== undefined && p.boat_dock !== null
        ? p.boat_dock
        : (p.subject_details?.as_is?.boat_dock ?? null),
      boat_dock_sqft: p.boat_dock_sqft != null
        ? p.boat_dock_sqft
        : (p.subject_details?.as_is?.boat_dock_sqft ?? ''),
      construction_type:
        p.construction_type ||
        (p.subject_details?.as_is?.construction_type && p.subject_details.as_is.construction_type !== 'unknown'
          ? p.subject_details.as_is.construction_type
          : ''),
      construction_detail:
        p.construction_detail ||
        p.subject_details?.as_is?.construction_detail ||
        p.subject_details?.construction_detail ||
        '',
      sketch_areas: p.sketch_areas || p.subject_details?.sketch_areas || '',
      recent_improvements: p.recent_improvements || p.subject_details?.recent_improvements || '',
      is_studying: Boolean(p.is_studying)
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
      units:
        propFormData.property_type === 'multifamily_2_9' || propFormData.strategy === 'live_in'
          ? Number(String(propFormData.units).replace(/[^\d]/g, '')) || 1
          : 1,
      beds: propFormData.beds !== '' && propFormData.beds != null ? Number(String(propFormData.beds).replace(/[^\d.]/g, '')) : null,
      baths: propFormData.baths !== '' && propFormData.baths != null ? Number(String(propFormData.baths).replace(/[^\d.]/g, '')) : null,
      sqft: propFormData.sqft !== '' && propFormData.sqft != null ? Number(String(propFormData.sqft).replace(/[^\d]/g, '')) : null,
      lot_sqft: propFormData.lot_sqft !== '' && propFormData.lot_sqft != null ? Number(String(propFormData.lot_sqft).replace(/[^\d]/g, '')) : null,
      year_built: propFormData.year_built !== '' && propFormData.year_built != null ? Number(String(propFormData.year_built).replace(/[^\d]/g, '')) : null,
      list_price: propFormData.list_price ? Number(String(propFormData.list_price).replace(/[^\d]/g, '')) : null,
      price_source: propFormData.price_source || 'list_price',
      offer_price: propFormData.offer_price ? Number(String(propFormData.offer_price).replace(/[^\d]/g, '')) : null,
      status: propFormData.status || 'watching',
      strategy: propFormData.strategy || null,
      condition: propFormData.condition.trim() || null,
      roof_year: propFormData.roof_year !== '' && propFormData.roof_year != null ? Number(String(propFormData.roof_year).replace(/[^\d]/g, '')) : null,
      listing_url: propFormData.listing_url.trim() || null,
      notes: propFormData.notes.trim() || null,
      parcel_id: propFormData.parcel_id || null,
      parcel_county: propFormData.parcel_county || null,
      has_hoa: propFormData.has_hoa === true ? true : propFormData.has_hoa === false ? false : null,
      hoa_monthly:
        propFormData.hoa_monthly !== '' && propFormData.hoa_monthly != null
          ? Number(String(propFormData.hoa_monthly).replace(/[^\d.]/g, ''))
          : null,
      hoa_name: propFormData.hoa_name && String(propFormData.hoa_name).trim() !== ''
        ? String(propFormData.hoa_name).trim()
        : null,
      boat_dock: propFormData.boat_dock === true ? true : propFormData.boat_dock === false ? false : null,
      boat_dock_sqft:
        propFormData.boat_dock === false
          ? null
          : propFormData.boat_dock_sqft !== '' && propFormData.boat_dock_sqft != null
            ? Number(String(propFormData.boat_dock_sqft).replace(/[^\d]/g, ''))
            : null,
      construction_type: propFormData.construction_type && propFormData.construction_type !== 'unknown'
        ? propFormData.construction_type
        : null,
      construction_detail: propFormData.construction_detail && String(propFormData.construction_detail).trim() !== ''
        ? String(propFormData.construction_detail).trim()
        : null,
      sketch_areas: propFormData.sketch_areas && String(propFormData.sketch_areas).trim() !== ''
        ? String(propFormData.sketch_areas).trim()
        : null,
      recent_improvements: propFormData.recent_improvements && String(propFormData.recent_improvements).trim() !== ''
        ? String(propFormData.recent_improvements).trim()
        : null,
      is_studying: propFormData.is_studying !== undefined ? Boolean(propFormData.is_studying) : (editingProperty ? Boolean(editingProperty.is_studying) : false)
    };

    if (editingProperty) {
      payload.id = editingProperty.id;
      if (editingProperty.subject_details && typeof editingProperty.subject_details === 'object') {
        payload.subject_details = editingProperty.subject_details;
      }
      if (editingProperty.pool !== undefined) payload.pool = editingProperty.pool;
      if (editingProperty.garage !== undefined) payload.garage = editingProperty.garage;
      if (editingProperty.waterfront !== undefined) payload.waterfront = editingProperty.waterfront;
      if (editingProperty.boat_lift !== undefined) payload.boat_lift = editingProperty.boat_lift;
      if (editingProperty.quality !== undefined) payload.quality = editingProperty.quality;
      if (editingProperty.land_value !== undefined) payload.land_value = editingProperty.land_value;
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

  // Toggle Studying status for Journal
  const handleToggleStudying = async (propToToggle) => {
    const targetProp = propToToggle || activeProperty;
    if (!targetProp) return;
    const nextStudying = !targetProp.is_studying;
    try {
      const res = await fetch('/api/investor/properties', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetProp.id, is_studying: nextStudying })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to update studying status', 'error');
        return;
      }
      setProperties(prev => prev.map(p => (p.id === targetProp.id ? { ...p, is_studying: nextStudying } : p)));
      showToast(nextStudying ? 'Pinned to Studio Journal ("Studying")' : 'Unpinned from Studying');
    } catch (err) {
      console.error('Error toggling studying:', err);
      showToast('Error updating studying status', 'error');
    }
  };

  // Comp & Subject Details Drawer Handlers
  const handleOpenAddComp = () => {
    setDetailsDrawerEntityType('comp');
    setEditingComp(null);
    setIsCompPanelOpen(true);
  };

  const handleOpenEditComp = (comp) => {
    setDetailsDrawerEntityType('comp');
    setEditingComp(comp);
    setIsCompPanelOpen(true);
  };

  const handleOpenEditSubjectDetails = (mode = 'as_is') => {
    setDetailsDrawerEntityType('subject');
    setEditingComp(null);
    setInitialSubjectDetailsMode(mode === 'after_rehab' ? 'after_rehab' : 'as_is');
    setIsCompPanelOpen(true);
  };

  const handleCloseCompPanel = () => {
    if (isCompSaving || isCompDeleting) return;
    setIsCompPanelOpen(false);
  };

  const handleSaveCompPayload = async (payload) => {
    setIsCompSaving(true);
    try {
      const isEdit = Boolean(payload?.id);
      const method = isEdit ? 'PUT' : 'POST';
      const bodyPayload = {
        ...payload,
        property_id: activePropertyId
      };

      const res = await fetch('/api/investor/comps', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || `Failed to save comp details (HTTP ${res.status}).`;
        showToast(msg);
        const err = new Error(msg);
        err.errors = data.errors || null;
        throw err;
      }

      if (isEdit) {
        setComps((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      } else {
        setComps((prev) => [data, ...prev]);
      }

      setIsCompPanelOpen(false);
      showToast('Comp details saved');
    } catch (err) {
      if (!err?.errors) {
        showToast(err?.message || 'Failed to save comp details.');
      }
      throw err;
    } finally {
      setIsCompSaving(false);
    }
  };

  const handleSaveSubjectDetails = async (subjectDetailsMap, parsedExtras = null) => {
    if (!activeProperty) return;
    setIsCompSaving(true);
    try {
      const asIsLegacy = detailsToLegacyColumns(subjectDetailsMap?.as_is || {});
      const patchBody = {
        id: activeProperty.id,
        beds: asIsLegacy.beds,
        baths: asIsLegacy.baths,
        roof_year: asIsLegacy.roof_year,
        pool: asIsLegacy.pool,
        garage: asIsLegacy.garage,
        waterfront: asIsLegacy.waterfront,
        boat_dock: asIsLegacy.boat_dock,
        boat_dock_sqft: asIsLegacy.boat_dock_sqft,
        boat_lift: asIsLegacy.boat_lift,
        construction_type: asIsLegacy.construction_type,
        construction_detail: asIsLegacy.construction_detail,
        quality: asIsLegacy.quality,
        hoa_name: asIsLegacy.hoa_name,
        ...(parsedExtras?.sqft != null ? { sqft: parsedExtras.sqft } : {}),
        ...(parsedExtras?.lot_sqft != null ? { lot_sqft: parsedExtras.lot_sqft } : {}),
        ...(parsedExtras?.year_built != null ? { year_built: parsedExtras.year_built } : {}),
        ...(parsedExtras?.hoa_monthly != null ? { hoa_monthly: parsedExtras.hoa_monthly } : {}),
        ...(parsedExtras?.has_hoa != null ? { has_hoa: parsedExtras.has_hoa } : {}),
        subject_details: {
          ...(activeProperty.subject_details || {}),
          ...subjectDetailsMap
        }
      };

      const res = await fetch('/api/investor/properties', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || `Failed to save subject property details (HTTP ${res.status}).`;
        showToast(msg);
        throw new Error(msg);
      }

      setProperties((prev) => prev.map((p) => (p.id === data.id ? { ...p, ...data } : p)));
      setSubjectAppraisalOverrides({});

      // Clear any stale legacy subjectOverrides stored on saved_appraisals so page refresh
      // always reads the newly saved subject_details instead of stale toggles
      const existingSavedAppraisal = buyingProfile?.valuation_defaults?.saved_appraisals?.[activeProperty.id];
      if (existingSavedAppraisal?.subjectOverrides && Object.keys(existingSavedAppraisal.subjectOverrides).length > 0) {
        const nextSavedAppraisals = {
          ...(buyingProfile?.valuation_defaults?.saved_appraisals || {}),
          [activeProperty.id]: {
            ...existingSavedAppraisal,
            subjectOverrides: {}
          }
        };
        const nextDefaults = {
          ...(buyingProfile?.valuation_defaults || {}),
          saved_appraisals: nextSavedAppraisals
        };
        setBuyingProfile((prev) => (prev ? { ...prev, valuation_defaults: nextDefaults } : prev));
        fetch('/api/investor/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valuation_defaults: nextDefaults })
        }).catch(() => {});
      }

      setIsCompPanelOpen(false);
      showToast('Subject details saved');
    } catch (err) {
      showToast(err?.message || 'Failed to save subject property details.');
      throw err;
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
        showToast(data.error || 'Failed to delete comp.');
        return;
      }

      setComps((prev) => prev.filter((c) => c.id !== editingComp.id));
      setIsCompPanelOpen(false);
      showToast('Comp deleted');
    } catch (err) {
      console.error('Delete comp error:', err);
      showToast(err.message || 'An error occurred while deleting comp.');
    } finally {
      setIsCompDeleting(false);
    }
  };

  // Toggle comp included checkbox (instant PUT)
  const handleToggleInclude = async (comp) => {
    const currentlyIncluded = resolveCompIsIncluded(comp);
    const updatedIncluded = !currentlyIncluded;
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
      setComps(prev => prev.map(c => (c.id === comp.id ? { ...c, included: currentlyIncluded } : c)));
      showToast('Failed to update comp inclusion');
    }
  };

  // Cycle or set comp condition chip directly on the Appraisal Grid or Comps Table
  const handleChangeCompCondition = async (comp, nextCondition) => {
    const previousCondition = comp.condition || 'unknown';
    setComps(prev => prev.map(c => (c.id === comp.id ? { ...c, condition: nextCondition } : c)));

    try {
      const res = await fetch('/api/investor/comps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comp.id, condition: nextCondition })
      });
      if (!res.ok) throw new Error('Failed to update comp condition');
      const data = await res.json();
      setComps(prev => prev.map(c => (c.id === data.id ? data : c)));
    } catch (err) {
      console.error('Update comp condition error:', err);
      setComps(prev => prev.map(c => (c.id === comp.id ? { ...c, condition: previousCondition } : c)));
      showToast('Failed to save comp condition');
    }
  };

  // Override (or reset when amountOrNull === null) a single adjustment cell in the Appraisal Grid
  const handleOverrideCompCell = async (comp, rowKey, amountOrNull) => {
    const prevAdjustments = comp.adjustments || {};
    const prevOverrides = { ...(prevAdjustments.overrides || {}) };
    if (amountOrNull == null) {
      delete prevOverrides[rowKey];
    } else {
      prevOverrides[rowKey] = amountOrNull;
    }
    const nextAdjustments = {
      ...prevAdjustments,
      overrides: prevOverrides
    };

    setComps(prev => prev.map(c => (c.id === comp.id ? { ...c, adjustments: nextAdjustments } : c)));

    try {
      const res = await fetch('/api/investor/comps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comp.id, adjustments: nextAdjustments })
      });
      if (!res.ok) throw new Error('Failed to save cell override');
      const data = await res.json();
      setComps(prev => prev.map(c => (c.id === data.id ? data : c)));
    } catch (err) {
      console.error('Override comp cell error:', err);
      setComps(prev => prev.map(c => (c.id === comp.id ? { ...c, adjustments: prevAdjustments } : c)));
      showToast('Failed to save adjustment override');
    }
  };

  // Sync saved appraisal snapshot when activePropertyId or buyingProfile changes
  useEffect(() => {
    if (!activePropertyId) return;
    const saved = buyingProfile?.valuation_defaults?.saved_appraisals?.[activePropertyId];
    if (saved) {
      if (saved.mode === 'as_is' || saved.mode === 'arv') setAppraisalMode(saved.mode);
      if (['auto', 'improvement_value', 'local_35', 'library'].includes(saved.sizeMethod)) {
        setSizeMethod(saved.sizeMethod);
      } else {
        setSizeMethod('auto');
      }
      setCustomWeights(saved.customWeights || null);
      setSubjectAppraisalOverrides(saved.subjectOverrides || {});
      setLastAppraisalSavedAt(saved.savedAt || null);
    } else {
      const defaultMode = ['flip', 'brrrr'].includes((activeProperty?.strategy || '').toLowerCase()) ? 'arv' : 'as_is';
      setAppraisalMode(defaultMode);
      setSizeMethod('auto');
      setCustomWeights(null);
      setSubjectAppraisalOverrides({});
      setLastAppraisalSavedAt(null);
    }
  }, [activePropertyId, Boolean(buyingProfile?.valuation_defaults?.saved_appraisals?.[activePropertyId])]);

  // Fetch full ZIP market series for the active property so APPRAISAL time adjustment measures actual period trend (capped ±10%)
  const [zipMarketData, setZipMarketData] = useState(null);
  const zipMarketSummary = zipMarketData?.summary || null;
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
  const [isSavingValuationPdf, setIsSavingValuationPdf] = useState(false);

  const activeSubjectZip = String(activeProperty?.zip || countyData?.zip || '').trim();
  const activeSubjectCounty = resolvePropertyCounty(activeProperty) || countyData?.county || 'Broward';
  const activeSubjectType = activeProperty?.property_type || 'single_family';

  useEffect(() => {
    if (!/^\d{5}$/.test(activeSubjectZip)) {
      setZipMarketData(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      county: activeSubjectCounty,
      zip: activeSubjectZip,
      type: activeSubjectType
    });
    fetch(`/api/county/market?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((mData) => {
        if (!cancelled) {
          setZipMarketData(mData || null);
        }
      })
      .catch(() => {
        if (!cancelled) setZipMarketData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSubjectZip, activeSubjectCounty, activeSubjectType]);

  // Persist user's last comp search filter choices in their investor profile
  const handleSaveCompFilters = useCallback(async (nextFilters) => {
    setBuyingProfile((prev) => {
      const base = prev || {};
      const prevDefaults = base.valuation_defaults || {};
      return {
        ...base,
        valuation_defaults: {
          ...prevDefaults,
          comp_search_filters: nextFilters
        }
      };
    });

    try {
      const prevDefaults = buyingProfile?.valuation_defaults || {};
      const res = await fetch('/api/investor/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valuation_defaults: {
            ...prevDefaults,
            comp_search_filters: nextFilters
          }
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setBuyingProfile(updated);
      }
    } catch {
      // ignore transient network error; local profile state already updated
    }
  }, [buyingProfile?.valuation_defaults]);

  // Subject object merged with County Roll, County CAMA Building Record & Subject Appraisal Overrides
  const subjectForAppraisal = useMemo(() => {
    if (!activeProperty) return {};
    const subjectBc =
      activeProperty.building_characteristics || countyData?.building_characteristics || null;
    return {
      ...activeProperty,
      building_characteristics: subjectBc,
      sqft: activeProperty.sqft || subjectBc?.living_area_sqft || countyData?.living_sqft || null,
      lot_sqft: activeProperty.lot_sqft || countyData?.land_sqft || null,
      year_built: activeProperty.year_built || subjectBc?.year_built || countyData?.year_built || null,
      eff_year_built: activeProperty.eff_year_built || subjectBc?.effective_year_built || countyData?.eff_year_built || null,
      just_value: countyData?.just_value ?? activeProperty.just_value ?? null,
      land_value: activeProperty.land_value ?? countyData?.land_value ?? null,
      imp_qual: activeProperty.imp_qual || countyData?.imp_qual || null,
      nearest_same_street_sale: countyData?.nearest_same_street_sale || null,
      subdivision_name: activeProperty.subdivision_name || countyData?.subdivision_name || null,
      subdivision_code: activeProperty.subdivision_code || countyData?.subdivision_code || null,
      nbrhd_cd: activeProperty.nbrhd_cd || countyData?.nbrhd_cd || null,
      mkt_ar: activeProperty.mkt_ar || countyData?.mkt_ar || null,
      s_legal: activeProperty.s_legal || countyData?.s_legal || null,
      const_class: activeProperty.const_class || countyData?.const_class || null,
      hoa_name: activeProperty.hoa_name || activeProperty.subject_details?.as_is?.hoa_name || null,
      boat_dock: activeProperty.boat_dock !== undefined && activeProperty.boat_dock !== null
        ? activeProperty.boat_dock
        : (activeProperty.subject_details?.as_is?.boat_dock ?? null),
      boat_dock_sqft: activeProperty.boat_dock_sqft ?? activeProperty.subject_details?.as_is?.boat_dock_sqft ?? null,
      boat_lift: activeProperty.boat_lift !== undefined && activeProperty.boat_lift !== null
        ? activeProperty.boat_lift
        : (activeProperty.subject_details?.as_is?.boat_lift ?? null),
      construction_type:
        activeProperty.construction_type ||
        (activeProperty.subject_details?.as_is?.construction_type && activeProperty.subject_details.as_is.construction_type !== 'unknown'
          ? activeProperty.subject_details.as_is.construction_type
          : null),
      construction_detail:
        activeProperty.construction_detail ||
        activeProperty.subject_details?.as_is?.construction_detail ||
        activeProperty.subject_details?.construction_detail ||
        null,
      sketch_areas: activeProperty.sketch_areas || activeProperty.subject_details?.sketch_areas || null,
      recent_improvements: activeProperty.recent_improvements || activeProperty.subject_details?.recent_improvements || null,
      price_source: activeProperty.price_source || activeProperty.subject_details?.price_source || 'list_price',
      offer_price: activeProperty.offer_price ?? activeProperty.subject_details?.offer_price ?? null,
      quality:
        activeProperty.quality ||
        (activeProperty.subject_details?.as_is?.quality && activeProperty.subject_details.as_is.quality !== 'unknown'
          ? activeProperty.subject_details.as_is.quality
          : null),
      subject_details: activeProperty.subject_details || {},
      appraisal_overrides: subjectAppraisalOverrides,
      ...subjectAppraisalOverrides
    };
  }, [activeProperty, countyData, subjectAppraisalOverrides]);

  // ARV only appears when a renovation budget is entered
  const hasRenovationBudget = Boolean(
    Number(activeProperty?.rehab_budget) > 0 ||
    Number(underwriteSummary?.inputs?.rehabBudget) > 0
  );
  const effectiveAppraisalMode = hasRenovationBudget ? appraisalMode : 'as_is';

  // Compute South Florida Sales Comparison Grid
  const appraisalGrid = useMemo(() => {
    const zipMonthlyPct =
      zipMarketSummary?.monthly_trend_pct != null && !isNaN(Number(zipMarketSummary.monthly_trend_pct))
        ? Number(zipMarketSummary.monthly_trend_pct) / 100
        : null;
    const zipTrendSource =
      /^\d{5}$/.test(activeSubjectZip)
        ? `ZIP ${activeSubjectZip}`
        : null;

    return computeAppraisalGrid({
      comps,
      subject: subjectForAppraisal,
      mode: effectiveAppraisalMode,
      sizeMethod,
      library: buyingProfile?.valuation_defaults?.library || {},
      customWeights,
      zipMarketData,
      zipTrendMonthlyPct: zipMonthlyPct,
      zipTrendSource
    });
  }, [
    comps,
    subjectForAppraisal,
    effectiveAppraisalMode,
    sizeMethod,
    buyingProfile?.valuation_defaults?.library,
    customWeights,
    zipMarketData,
    zipMarketSummary?.monthly_trend_pct,
    activeSubjectZip
  ]);

  // Always compute both Appraisal As-Is (Estimated current value) and ARV
  const appraisalAsIsGrid = useMemo(() => {
    if (effectiveAppraisalMode === 'as_is') return appraisalGrid;
    const zipMonthlyPct =
      zipMarketSummary?.monthly_trend_pct != null && !isNaN(Number(zipMarketSummary.monthly_trend_pct))
        ? Number(zipMarketSummary.monthly_trend_pct) / 100
        : null;
    const zipTrendSource =
      /^\d{5}$/.test(activeSubjectZip)
        ? `ZIP ${activeSubjectZip}`
        : null;

    return computeAppraisalGrid({
      comps,
      subject: subjectForAppraisal,
      mode: 'as_is',
      sizeMethod,
      library: buyingProfile?.valuation_defaults?.library || {},
      customWeights,
      zipMarketData,
      zipTrendMonthlyPct: zipMonthlyPct,
      zipTrendSource
    });
  }, [
    effectiveAppraisalMode,
    appraisalGrid,
    comps,
    subjectForAppraisal,
    sizeMethod,
    buyingProfile?.valuation_defaults?.library,
    customWeights,
    zipMarketData,
    zipMarketSummary?.monthly_trend_pct,
    activeSubjectZip
  ]);

  const appraisalArvGrid = useMemo(() => {
    if (effectiveAppraisalMode === 'arv') return appraisalGrid;
    const zipMonthlyPct =
      zipMarketSummary?.monthly_trend_pct != null && !isNaN(Number(zipMarketSummary.monthly_trend_pct))
        ? Number(zipMarketSummary.monthly_trend_pct) / 100
        : null;
    const zipTrendSource =
      /^\d{5}$/.test(activeSubjectZip)
        ? `ZIP ${activeSubjectZip}`
        : null;

    return computeAppraisalGrid({
      comps,
      subject: subjectForAppraisal,
      mode: 'arv',
      sizeMethod,
      library: buyingProfile?.valuation_defaults?.library || {},
      customWeights,
      zipMarketData,
      zipTrendMonthlyPct: zipMonthlyPct,
      zipTrendSource
    });
  }, [
    effectiveAppraisalMode,
    appraisalGrid,
    comps,
    subjectForAppraisal,
    sizeMethod,
    buyingProfile?.valuation_defaults?.library,
    customWeights,
    zipMarketData,
    zipMarketSummary?.monthly_trend_pct,
    activeSubjectZip
  ]);

  const handleDownloadValuationPdf = () => {
    if (!activeProperty?.id) return;
    const queryStr = `mode=${encodeURIComponent(effectiveAppraisalMode)}&sizeMethod=${encodeURIComponent(sizeMethod || 'auto')}`;
    if (navigateTo) {
      navigateTo('valuation-report', null, activeProperty.id, queryStr);
    } else if (typeof window !== 'undefined') {
      window.open(`/admin/investor/valuation-report/${activeProperty.id}?${queryStr}`, '_blank', 'noopener');
    }
  };

  const handleSaveValuationPdf = async () => {
    if (!activeProperty?.id || !appraisalGrid) return;
    setIsSavingValuationPdf(true);
    try {
      const pdfBase64 = buildValuationEstimatePdfBase64({
        property: activeProperty,
        countyData,
        grid: appraisalGrid,
        hasRenovationBudget
      });
      const isoDate = new Date().toISOString().split('T')[0];
      const title = `Valuation Estimate - ${activeProperty.address} (${isoDate})`;
      const res = await fetch('/api/investor/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: activeProperty.id,
          title,
          doc_type: 'valuation_estimate',
          data: pdfBase64,
          filename: `${title}.pdf`
        })
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to save valuation PDF.');
      }
      setDocumentsRefreshKey((k) => k + 1);
      showToast('Valuation PDF saved to Photos & Notes');
    } catch (err) {
      showToast(err?.message || 'Unable to save valuation PDF.');
    } finally {
      setIsSavingValuationPdf(false);
    }
  };

  const handleSubjectOverrideChange = (key, value) => {
    setSubjectAppraisalOverrides((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleWeightChange = (compId, pct) => {
    setCustomWeights((prev) => {
      const base = prev ? { ...prev } : {};
      if (!prev) {
        appraisalGrid.usedComps.forEach((c) => {
          base[c.id] = c.weightPct;
        });
      }
      base[compId] = pct;
      return base;
    });
  };

  const handleAutoWeights = () => {
    setCustomWeights(null);
  };

  const handleNormalizeWeights = () => {
    const usedIds = appraisalGrid.usedComps.map((c) => c.id);
    const seed = customWeights || {};
    setCustomWeights(normalizeReconciliationWeights(seed, usedIds));
  };

  const handleUseInDeal = ({ mode, value }) => {
    if (!value) return;
    setAppliedAppraisal({
      nonce: Date.now(),
      mode,
      value
    });
    handleSelectTab('deal');
    showToast(
      mode === 'arv'
        ? `Applied $${Math.round(value).toLocaleString('en-US')} ARV to Deal underwriting`
        : `Applied $${Math.round(value).toLocaleString('en-US')} As-Is value to Deal underwriting`
    );
  };

  const handleSaveAppraisal = async () => {
    if (!activePropertyId) return;
    setIsSavingAppraisal(true);
    try {
      const nowIso = new Date().toISOString();
      const prevDefaults = buyingProfile?.valuation_defaults || {};
      const nextSavedAppraisals = {
        ...(prevDefaults.saved_appraisals || {}),
        [activePropertyId]: {
          mode: appraisalMode,
          sizeMethod,
          customWeights,
          subjectOverrides: subjectAppraisalOverrides,
          reconciledValue: appraisalGrid.reconciledValue,
          rangeLow: appraisalGrid.rangeLow,
          rangeHigh: appraisalGrid.rangeHigh,
          confidenceScore: appraisalGrid.confidenceScore,
          tierKey: appraisalGrid.tier?.key,
          savedAt: nowIso
        }
      };

      const res = await fetch('/api/investor/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valuation_defaults: {
            ...prevDefaults,
            saved_appraisals: nextSavedAppraisals
          }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save appraisal');
      }
      setBuyingProfile(data);
      setLastAppraisalSavedAt(nowIso);
      showToast('Appraisal saved');
    } catch (err) {
      console.error('Save appraisal error:', err);
      showToast(err.message || 'Failed to save appraisal');
    } finally {
      setIsSavingAppraisal(false);
    }
  };

  const handleOpenLearningLabLesson = (lessonKey = 'cia_cbs_appraisal') => {
    const targetLesson =
      typeof lessonKey === 'string' && lessonKey.trim()
        ? lessonKey.trim()
        : 'cia_cbs_appraisal';
    if (typeof window !== 'undefined') {
      window.__learningLabFocusTerm = targetLesson;
    }
    if (typeof setActiveDashboardTab === 'function') {
      setActiveDashboardTab('learning-lab');
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('lesson', targetLesson);
        window.history.pushState({}, '', url.toString());
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (typeof navigateTo === 'function') {
      navigateTo(`/learning-lab?lesson=${encodeURIComponent(targetLesson)}`);
    }
  };

  // Detail View Stats & Median Calculations
  const includedComps = comps.filter(c => resolveCompIsIncluded(c));
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

  // COMP VALUE = Reconciled Appraisal Value (fallback to median $/sqft * property sqft)
  let compValueFormatted = '—';
  let rawCompValue = null;
  if (appraisalGrid?.reconciledValue && appraisalGrid.reconciledValue > 0) {
    rawCompValue = appraisalGrid.reconciledValue;
    compValueFormatted = `$${rawCompValue.toLocaleString('en-US')}`;
  } else if (medianPpsqft != null && activeProperty?.sqft) {
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
    if (String(status).toLowerCase() === 'live_in') return 'LIVE-IN (FHA)';
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

    if (appliedFilters.fitsLiveIn) {
      if (!evaluateLiveInFit(p, buyingProfile).fits) {
        return false;
      }
    }

    return true;
  });

  const isFiltered =
    Boolean(appliedFilters.location) ||
    appliedFilters.type !== 'all' ||
    appliedFilters.strategy !== 'all' ||
    Boolean(appliedFilters.fitsLiveIn);

  return (
    <div style={{ width: '100%', position: 'relative' }}>
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
        .investor-split-list-header {
          display: flex;
          align-items: center;
          min-height: 28px;
          margin-bottom: 12px;
          padding: 0 2px;
        }
        .investor-split-col-label {
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(52, 41, 42, 0.55);
          line-height: 1;
        }
        .investor-split-map-container {
          display: flex;
          flex-direction: column;
          height: 620px;
        }
        .investor-split-map-header {
          display: flex;
          align-items: center;
          gap: 16px;
          min-height: 28px;
          margin-bottom: 12px;
        }
        .investor-split-map-pills {
          display: flex;
          align-items: center;
          gap: 8px;
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
        @media (max-width: 640px) {
          .investor-split-map-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
            min-height: auto;
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
        .investor-pill-tag {
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 11px;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: 50px;
          background-color: #ffffff;
          color: var(--espresso, #1B130D);
          border: 1px solid #E4DDD3;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .investor-overview-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
          gap: 28px;
          align-items: start;
        }

        @media (max-width: 900px) {
          .investor-overview-grid {
            grid-template-columns: 1fr !important;
            gap: 20px !important;
          }
        }

        @media (max-width: 768px) {
          .investor-search-bar {
            flex-direction: column;
            border-radius: var(--radius-card);
            padding: 16px;
            gap: 12px;
            align-items: stretch;
          }
          .investor-search-divider {
            display: none;
          }
          .investor-search-field {
            padding: 0;
            width: 100%;
          }
          .investor-search-btn {
            width: 100%;
            justify-content: center;
          }
          .investor-header-row {
            flex-direction: column !important;
          }
          .investor-header-image {
            width: 100% !important;
            max-width: 100% !important;
            height: 200px !important;
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
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '36px 24px 60px 24px' }}>
          {activeProperty ? (
            (() => {
              // Flood info (supports both snake_case from /api/site/flood and legacy camelCase)
              const floodZone =
                siteData?.floodData?.flood_zone ||
                siteData?.floodData?.floodZone ||
                activeProperty.flood_zone;
              const floodSfha =
                siteData?.floodData?.flood_sfha ??
                siteData?.floodData?.isSfha ??
                activeProperty.flood_sfha;
              const floodSubtype =
                siteData?.floodData?.flood_subtype ||
                siteData?.floodData?.subtype ||
                activeProperty.flood_subtype;
              const isSFHA = Boolean(
                floodSfha ||
                (floodZone && ['A', 'AE', 'AH', 'AO', 'A99', 'AR', 'V', 'VE'].includes(String(floodZone).toUpperCase()))
              );

              let floodPillBg = 'rgba(46, 204, 113, 0.12)';
              let floodPillColor = '#1B5E20';
              let floodPillBorder = '1px solid rgba(46, 204, 113, 0.3)';
              let floodLabel = 'Flood · Zone X';

              if (isSFHA) {
                floodPillBg = 'rgba(217, 83, 79, 0.14)';
                floodPillColor = '#9E2A2B';
                floodPillBorder = '1px solid rgba(217, 83, 79, 0.35)';
                floodLabel = `Flood · SFHA (${floodZone || 'AE'})`;
              } else if (
                (floodZone && String(floodZone).toUpperCase().includes('SHADED')) ||
                (floodSubtype && String(floodSubtype).toLowerCase().includes('500-year'))
              ) {
                floodPillBg = 'rgba(120, 120, 120, 0.12)';
                floodPillColor = '#4A4A4A';
                floodPillBorder = '1px solid rgba(120, 120, 120, 0.3)';
                floodLabel = 'Flood · Zone X Shaded';
              } else if (floodZone) {
                floodPillBg = 'rgba(46, 204, 113, 0.12)';
                floodPillColor = '#1B5E20';
                floodPillBorder = '1px solid rgba(46, 204, 113, 0.3)';
                floodLabel = `Flood · Zone ${floodZone}`;
              } else {
                floodPillBg = 'rgba(52, 41, 42, 0.06)';
                floodPillColor = 'rgba(52, 41, 42, 0.7)';
                floodPillBorder = '1px solid rgba(52, 41, 42, 0.15)';
                floodLabel = 'Flood · Unknown';
              }

              // Zoning info
              const zoningCode = siteData?.zoningData?.zoning_code || activeProperty.zoning_code;
              const hasZoning = Boolean(
                zoningCode &&
                String(zoningCode).trim() !== '' &&
                String(zoningCode).toLowerCase() !== 'unknown'
              );

              // KPI 1: Reference Price (List price / Off-market estimate / My offer / County value) & $/sf
              const activePricing = resolvePropertyPricing(activeProperty, countyData);
              const refPriceNum = activePricing.referencePrice;
              const listPricePps = (refPriceNum && activeProperty.sqft)
                ? Math.round(Number(refPriceNum) / Number(activeProperty.sqft))
                : null;

              // KPI 2: Estimated Current Value (always As-Is reconciled value; ARV only shown when rehab budget > 0)
              const estCurrentValRaw = appraisalAsIsGrid?.reconciledValue || rawCompValue || null;
              const estCurrentValFormatted = estCurrentValRaw
                ? `$${Math.round(estCurrentValRaw).toLocaleString('en-US')}`
                : '—';
              const estVsRefDiffPct =
                estCurrentValRaw && refPriceNum
                  ? Math.round(((estCurrentValRaw - refPriceNum) / refPriceNum) * 1000) / 10
                  : null;

              const ppsList = includedComps
                .map(c => c.price_per_sqft != null ? Number(c.price_per_sqft) : (c.sold_price && c.sqft ? Number(c.sold_price) / Number(c.sqft) : null))
                .filter(n => n != null && !isNaN(n) && n > 0);

              let rangeText = 'Add ≥3 comps';
              const formatShort = (v) => v >= 1000000 ? `$${(v / 1000000).toFixed(2)}M` : `$${Math.round(v / 1000)}k`;
              if (appraisalAsIsGrid?.rangeLow && appraisalAsIsGrid?.rangeHigh) {
                rangeText = `${formatShort(appraisalAsIsGrid.rangeLow)} – ${formatShort(appraisalAsIsGrid.rangeHigh)}`;
              } else if (ppsList.length > 0 && activeProperty.sqft) {
                const minPps = Math.min(...ppsList);
                const maxPps = Math.max(...ppsList);
                const lowVal = Math.round(minPps * Number(activeProperty.sqft));
                const highVal = Math.round(maxPps * Number(activeProperty.sqft));
                rangeText = `Range ${formatShort(lowVal)} – ${formatShort(highVal)}`;
              }

              // KPI 3: Cash needed
              const cashNeeded = underwriteSummary?.results?.cashToClose?.liquidCashNeeded != null
                ? Number(underwriteSummary.results.cashToClose.liquidCashNeeded)
                : (activePricing.dealPurchasePrice ? Math.round(Number(activePricing.dealPurchasePrice) * 0.25) : 0);

              // KPI 4: Monthly payment (PITI + HOA)
              const totalPiti = underwriteSummary?.results?.monthlyPayment?.totalPiti != null
                ? Number(underwriteSummary.results.monthlyPayment.totalPiti)
                : null;
              const isMissingInsurance = underwriteSummary?.results?.monthlyPayment?.isMissingInsurance === true;
              const isMissingTaxesOrInsurance = underwriteSummary?.results?.monthlyPayment?.isMissingTaxesOrInsurance === true;

              // KPI 5: Strategy Headline Result
              const activeStrategy = underwriteSummary?.strategy || activeProperty.strategy || 'rental';
              let kpi5Label = 'MONTHLY CASH FLOW';
              let kpi5Value = '—';
              let kpi5Sub = 'Enter rent in Deal';
              let kpi5IsNegative = false;

              if (activeStrategy === 'flip') {
                kpi5Label = 'PROJECTED PROFIT';
                if (underwriteSummary?.results?.projectedProfit != null) {
                  const profit = Math.round(Number(underwriteSummary.results.projectedProfit));
                  kpi5IsNegative = profit < 0;
                  kpi5Value = `${profit >= 0 ? '+' : ''}${formatCurrency(profit)}`;
                  const roi = underwriteSummary.results.roiPct != null ? Number(underwriteSummary.results.roiPct).toFixed(1) : null;
                  kpi5Sub = roi ? `${roi}% ROI` : `${underwriteSummary.inputs?.holdingMonths || 6} mo hold`;
                } else {
                  kpi5Sub = 'Enter ARV in Deal';
                }
              } else if (activeStrategy === 'brrrr') {
                kpi5Label = 'CASH LEFT IN DEAL';
                if (underwriteSummary?.results?.cashLeftInDeal != null) {
                  const left = Math.round(Number(underwriteSummary.results.cashLeftInDeal));
                  kpi5IsNegative = left < 0;
                  kpi5Value = `${left < 0 ? '-' : ''}${formatCurrency(Math.abs(left))}`;
                  const postFlow = underwriteSummary.results.postRefiCashFlowMo != null
                    ? Math.round(Number(underwriteSummary.results.postRefiCashFlowMo))
                    : null;
                  kpi5Sub = postFlow != null ? `${formatCurrency(postFlow)}/mo refi flow` : 'Refinance recovery';
                } else {
                  kpi5Sub = 'Enter ARV & rent in Deal';
                }
              } else if (activeStrategy === 'live_in') {
                kpi5Label = 'LIVE-IN NET COST';
                if (underwriteSummary?.results?.live?.netLiveInMonthlyCost != null) {
                  const netLive = Math.round(Number(underwriteSummary.results.live.netLiveInMonthlyCost));
                  kpi5Value = `${formatCurrency(netLive)}/mo`;
                  kpi5Sub = underwriteSummary.results.live.rentComparisonLabel || 'Live-in plan (FHA)';
                } else {
                  kpi5Sub = 'Open Deal tab to model FHA plan';
                }
              } else {
                // rental
                kpi5Label = 'MONTHLY CASH FLOW';
                if (underwriteSummary?.results?.cashFlowMo != null) {
                  const flow = Math.round(Number(underwriteSummary.results.cashFlowMo));
                  kpi5IsNegative = flow < 0;
                  kpi5Value = `${flow >= 0 ? '+' : ''}${formatCurrency(flow)}/mo`;
                  const coc = underwriteSummary.results.cocPct != null ? Number(underwriteSummary.results.cocPct).toFixed(1) : null;
                  kpi5Sub = coc ? `${coc}% CoC return` : 'Net cash flow';
                } else {
                  kpi5Sub = 'Enter rent in Deal';
                }
              }

              // Verdict Sentence
              let verdictSentence = underwriteSummary?.results?.verdict;
              if (!verdictSentence) {
                if (activeStrategy === 'flip') {
                  if (underwriteSummary?.results?.projectedProfit != null) {
                    const p = Math.round(Number(underwriteSummary.results.projectedProfit));
                    const roi = underwriteSummary.results.roiPct != null ? Number(underwriteSummary.results.roiPct).toFixed(1) : '—';
                    verdictSentence = p >= 0
                      ? `Projected net profit of ${formatCurrency(p)} (${roi}% ROI) based on entered ARV and rehab budget.`
                      : `Projected flip produces a net loss of ${formatCurrency(Math.abs(p))} under current pricing and rehab budget.`;
                  } else {
                    verdictSentence = 'Enter after-repair value (ARV) and rehab budget in the Deal tab to evaluate flip profit and ROI.';
                  }
                } else if (activeStrategy === 'brrrr') {
                  if (underwriteSummary?.results?.cashLeftInDeal != null) {
                    const left = Math.round(Number(underwriteSummary.results.cashLeftInDeal));
                    verdictSentence = left <= 0
                      ? `Full capital recovery achieved — ${formatCurrency(Math.abs(left))} excess cash out on refinance.`
                      : `${formatCurrency(left)} equity remains in the deal after permanent refinancing.`;
                  } else {
                    verdictSentence = 'Enter rehab budget, ARV, and market rent in the Deal tab to analyze BRRRR capital recycling.';
                  }
                } else if (activeStrategy === 'live_in') {
                  verdictSentence = 'Open the Deal tab to model your FHA live-in cost and add market rent after move-out.';
                } else {
                  // rental
                  if (underwriteSummary?.results?.cashFlowMo != null) {
                    const f = Math.round(Number(underwriteSummary.results.cashFlowMo));
                    const coc = underwriteSummary.results.cocPct != null ? Number(underwriteSummary.results.cocPct).toFixed(1) : '—';
                    verdictSentence = f >= 0
                      ? `Generates ${formatCurrency(f)}/mo net cash flow (${coc}% cash-on-cash return) at current pricing.`
                      : `Negative cash flow of ${formatCurrency(Math.abs(f))}/mo at current rent and financing terms.`;
                  } else {
                    verdictSentence = 'Enter estimated market rent in the Deal tab to calculate net cash flow and yield.';
                  }
                }
              }

              // Completeness meter 7 items:
              const hasComps = includedComps.length >= 3;
              const hasRentOrArv = activeStrategy === 'flip'
                ? Boolean(Number(underwriteSummary?.inputs?.arv) > 0)
                : activeStrategy === 'brrrr'
                  ? (Boolean(Number(underwriteSummary?.inputs?.arv) > 0) && Boolean(Number(underwriteSummary?.inputs?.monthlyRent) > 0))
                  : activeStrategy === 'live_in'
                    ? (Boolean(Number(underwriteSummary?.inputs?.valueAfterReno) > 0) && Boolean(Number(underwriteSummary?.inputs?.marketRentMo) > 0))
                    : Boolean(Number(underwriteSummary?.inputs?.monthlyRent) > 0);
              const hasInsurance = activeStrategy === 'live_in'
                ? Boolean(Number(underwriteSummary?.inputs?.homeownerInsuranceYr) > 0)
                : Boolean(Number(underwriteSummary?.inputs?.insuranceYr) > 0);
              const isCondo = (activeProperty.property_type || '').toLowerCase() === 'condo' || String(activeProperty.use_code || '').trim() === '004';
              const hasHoa = isCondo
                ? Boolean(Number(activeStrategy === 'live_in' ? underwriteSummary?.inputs?.hoaMonthly : underwriteSummary?.inputs?.hoaMo) > 0)
                : true;
              const hasLiquidCash = Boolean(buyingProfile?.liquid_cash != null && Number(buyingProfile.liquid_cash) > 0);
              const hasZoningCode = hasZoning;
              const isCashLoan = underwriteSummary?.inputs?.loanType === 'cash';
              const hasRate = isCashLoan || Boolean(Number(underwriteSummary?.inputs?.interestRatePct) > 0);

              const completenessItems = [
                { key: 'comps', label: 'Comps (≥3)', done: hasComps },
                { key: 'rentOrArv', label: activeStrategy === 'flip' ? 'ARV' : (activeStrategy === 'brrrr' || activeStrategy === 'live_in') ? 'ARV & Rent' : 'Rent', done: hasRentOrArv },
                { key: 'insurance', label: 'Insurance', done: hasInsurance },
                { key: 'hoa', label: 'Condo HOA', done: hasHoa },
                { key: 'liquidCash', label: 'Profile liquid cash', done: hasLiquidCash },
                { key: 'zoning', label: 'Zoning code', done: hasZoningCode },
                { key: 'rate', label: 'Interest rate', done: hasRate }
              ];
              const completedCount = completenessItems.filter(i => i.done).length;
              const missingItems = completenessItems.filter(i => !i.done).map(i => i.label);

              // Auto-generated checklist items for "What to know"
              const checklistItems = [];

              // 1. Reference price vs Estimated current value
              if (estCurrentValRaw && refPriceNum) {
                const listP = Number(refPriceNum);
                const compVal = Number(estCurrentValRaw);
                const diffPct = ((listP - compVal) / compVal) * 100;
                const priceLbl = activePricing.shortLabel;
                const valTab = appraisalAsIsGrid?.reconciledValue ? 'appraisal' : 'comps';
                const valTabLabel = appraisalAsIsGrid?.reconciledValue ? 'APPRAISAL →' : 'VALUE & COMPS →';
                if (Math.abs(diffPct) <= 5) {
                  checklistItems.push({
                    status: 'green',
                    title: `${priceLbl} In Line With Est. Current Value`,
                    text: `${priceLbl} (${formatPrice(listP)}) is within ±5% of estimated current value (${estCurrentValFormatted}, ${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%).`,
                    tab: valTab,
                    tabLabel: valTabLabel
                  });
                } else if (diffPct > 5) {
                  checklistItems.push({
                    status: 'amber',
                    title: `${priceLbl} Above Est. Current Value`,
                    text: `${priceLbl} (${formatPrice(listP)}) is ${diffPct.toFixed(1)}% above estimated current value (${estCurrentValFormatted}). May require negotiation.`,
                    tab: valTab,
                    tabLabel: valTabLabel
                  });
                } else {
                  checklistItems.push({
                    status: 'green',
                    title: `${priceLbl} Below Est. Current Value`,
                    text: `${priceLbl} (${formatPrice(listP)}) is ${Math.abs(diffPct).toFixed(1)}% below estimated current value (${estCurrentValFormatted}) — potential built-in equity.`,
                    tab: valTab,
                    tabLabel: valTabLabel
                  });
                }
              } else if (!hasComps) {
                checklistItems.push({
                  status: 'amber',
                  title: 'Sold Comps Needed',
                  text: `Only ${includedComps.length} comps included. Add at least 3 nearby comps to validate pricing.`,
                  tab: 'comps',
                  tabLabel: 'VALUE & COMPS →'
                });
              }

              // 2. Cash Needed vs Liquid Cash
              const profileCash = buyingProfile?.liquid_cash != null ? Number(buyingProfile.liquid_cash) : null;
              if (profileCash != null && cashNeeded > profileCash) {
                checklistItems.push({
                  status: 'red',
                  title: 'Short on Cash',
                  text: `Total liquid cash needed (${formatCurrency(Math.round(cashNeeded))}) exceeds your profile cash reserves (${formatCurrency(Math.round(profileCash))}) by ${formatCurrency(Math.round(cashNeeded - profileCash))}.`,
                  tab: 'deal',
                  tabLabel: 'DEAL →'
                });
              } else if (profileCash != null && profileCash > 0) {
                checklistItems.push({
                  status: 'green',
                  title: 'Cash Reserves Verified',
                  text: `Liquid cash needed (${formatCurrency(Math.round(cashNeeded))}) is within your available reserves (${formatCurrency(Math.round(profileCash))}).`,
                  tab: 'deal',
                  tabLabel: 'DEAL →'
                });
              } else {
                checklistItems.push({
                  status: 'amber',
                  title: 'Buying Profile Cash Not Set',
                  text: 'Set your available liquid cash in My Buying Profile to calculate reserves and closing readiness.',
                  tab: 'deal',
                  tabLabel: 'DEAL →'
                });
              }

              // 3. Flood Zone
              if (isSFHA) {
                checklistItems.push({
                  status: 'amber',
                  title: 'Special Flood Hazard Area (SFHA)',
                  text: `Property is in FEMA Zone ${floodZone || 'AE'} (high flood risk). Mandatory flood insurance required for lenders.`,
                  tab: 'site',
                  tabLabel: 'SITE & ZONING →'
                });
              } else if (floodZone && String(floodZone).toUpperCase() === 'X') {
                checklistItems.push({
                  status: 'green',
                  title: 'Minimal Flood Hazard',
                  text: 'Property is in FEMA Zone X (minimal risk, outside the 500-year floodplain).',
                  tab: 'site',
                  tabLabel: 'SITE & ZONING →'
                });
              } else {
                checklistItems.push({
                  status: 'amber',
                  title: 'FEMA Flood Zone Check',
                  text: 'Review FEMA flood hazard layer for exact flood zone designation and base flood elevation.',
                  tab: 'site',
                  tabLabel: 'SITE & ZONING →'
                });
              }

              // 4. FEMA 50% Rule Warning (Substantial Improvement)
              const rehabBudget = Number(underwriteSummary?.inputs?.rehabBudget || 0);
              let structureValue = 0;
              if (countyData?.just_value) {
                const justVal = Number(countyData.just_value);
                const landVal = Number(countyData.land_value || 0);
                structureValue = justVal > landVal ? (justVal - landVal) : Math.round(justVal * 0.7);
              } else if (activeProperty.list_price) {
                structureValue = Math.round(Number(activeProperty.list_price) * 0.7);
              }
              if (isSFHA && rehabBudget > 0 && structureValue > 0 && rehabBudget >= 0.5 * structureValue) {
                checklistItems.push({
                  status: 'red',
                  title: 'FEMA 50% Rule Warning',
                  text: `Rehab budget (${formatCurrency(rehabBudget)}) is ≥ 50% of structure value (${formatCurrency(structureValue)}) in an SFHA. City may mandate elevating entire structure to current BFE.`,
                  tab: 'site',
                  tabLabel: 'SITE & ZONING →'
                });
              }

              // 5. County Record Mismatches
              const mismatches = [];
              if (countyData) {
                if (countyData.living_sqft && activeProperty.sqft && Number(countyData.living_sqft) !== Number(activeProperty.sqft)) {
                  mismatches.push(`Living area: county says ${Number(countyData.living_sqft).toLocaleString()} sf (you entered ${Number(activeProperty.sqft).toLocaleString()} sf)`);
                }
                if (countyData.land_sqft && activeProperty.lot_sqft && Number(countyData.land_sqft) !== Number(activeProperty.lot_sqft)) {
                  mismatches.push(`Lot: county says ${Number(countyData.land_sqft).toLocaleString()} sf (you entered ${Number(activeProperty.lot_sqft).toLocaleString()} sf)`);
                }
                if (countyData.year_built && activeProperty.year_built && Number(countyData.year_built) !== Number(activeProperty.year_built)) {
                  mismatches.push(`Year built: county says ${countyData.year_built} (you entered ${activeProperty.year_built})`);
                }
              }
              if (mismatches.length > 0) {
                checklistItems.push({
                  status: 'amber',
                  title: 'County Record Discrepancy',
                  text: mismatches.join(' · '),
                  tab: 'site',
                  tabLabel: 'SITE & ZONING →'
                });
              } else if (countyData) {
                checklistItems.push({
                  status: 'green',
                  title: 'County Record Match',
                  text: 'Living area, lot size, and year built match the official county property appraiser roll.',
                  tab: 'site',
                  tabLabel: 'SITE & ZONING →'
                });
              } else if (!activeProperty.parcel_id) {
                checklistItems.push({
                  status: 'amber',
                  title: 'County Parcel Not Linked',
                  text: 'Link the official county parcel record to verify living area, assessment, and tax roll data.',
                  tab: 'site',
                  tabLabel: 'SITE & ZONING →'
                });
              }

              // 6. Zoning Unknown
              if (!hasZoningCode) {
                checklistItems.push({
                  status: 'amber',
                  title: 'Zoning Code Unknown',
                  text: 'Zoning classification is not recorded. Add zoning code to verify allowable density and permitted uses.',
                  tab: 'site',
                  tabLabel: 'SITE & ZONING →'
                });
              } else {
                checklistItems.push({
                  status: 'green',
                  title: `Zoning Code Verified (${zoningCode})`,
                  text: siteData?.zoningData?.zoning_desc
                    ? `${zoningCode}: ${siteData.zoningData.zoning_desc}`
                    : `Official municipal zoning code ${zoningCode} recorded.`,
                  tab: 'site',
                  tabLabel: 'SITE & ZONING →'
                });
              }

              // 7. Historic District
              if (siteData?.zoningData?.historic_district || siteData?.zoningData?.historic_site) {
                checklistItems.push({
                  status: 'amber',
                  title: 'Historic District Overlay',
                  text: `Property is in a designated Historic District (${siteData.zoningData.historic_name || 'Designated District'}). Exterior alterations subject to board review.`,
                  tab: 'site',
                  tabLabel: 'SITE & ZONING →'
                });
              }

              // 8. Missing Deal Inputs
              if (missingItems.length > 0) {
                checklistItems.push({
                  status: 'amber',
                  title: 'Underwriting Inputs Incomplete',
                  text: `Missing: ${missingItems.join(', ')}. Complete them in the Deal tab to finalize underwriting.`,
                  tab: 'deal',
                  tabLabel: 'DEAL →'
                });
              }

              // Tab Badge Counts
              const overviewBadgeCount = checklistItems.filter(i => i.status === 'red' || i.status === 'amber').length;
              const compsBadgeCount = includedComps.length < 3 ? 1 : 0;
              const appraisalBadgeCount = includedComps.length > 0
                ? ((!appraisalGrid?.weightValidation?.valid ? 1 : 0) + (appraisalMode === 'arv' && (appraisalGrid?.renovatedUsedCount || 0) === 0 ? 1 : 0))
                : 0;
              const siteBadgeCount = (!hasZoningCode ? 1 : 0) + (siteData?.zoningData?.historic_district ? 1 : 0) + (mismatches.length > 0 ? 1 : 0);
              const dealBadgeCount = (hasRentOrArv ? 0 : 1) + (hasInsurance ? 0 : 1) + (hasRate ? 0 : 1) + (profileCash != null && cashNeeded > profileCash ? 1 : 0);

              return (
                <>
                  {/* ========================================================================= */}
                  {/* 1. HEADER                                                                */}
                  {/* ========================================================================= */}
                  <header style={{ marginBottom: '24px' }}>
                    {/* Top Row: "← Saved properties" on left; EDIT, EXPORT PDF, SAVE ANALYSIS on right */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '20px',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <Button
                        variant="text"
                        onClick={handleBackToList}
                        style={{ color: 'var(--burgundy)' }}
                      >
                        &larr; Saved properties
                      </Button>

                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Design this property Link */}
                        <Button
                          variant="accent"
                          onClick={() => handleDesignThisProperty(activeProperty)}
                          disabled={designLoading}
                          title="Design this property in Designer Hub"
                        >
                          {designLoading ? 'Opening...' : 'Design this property \u2192'}
                        </Button>

                        {/* EDIT Outline Pill */}
                        <Button
                          variant="secondary"
                          onClick={() => handleOpenEditProperty(activeProperty)}
                        >
                          EDIT
                        </Button>

                        {/* EXPORT PDF Outline Pill (Disabled placeholder) */}
                        <Button
                          variant="secondary"
                          disabled
                          title="Export PDF (coming soon)"
                        >
                          EXPORT PDF
                        </Button>

                        {/* SAVE ANALYSIS Burgundy Pill */}
                        <Button
                          variant="primary"
                          onClick={() => {
                            if (underwriteSummary?.handleSaveAnalysis) {
                              underwriteSummary.handleSaveAnalysis();
                            }
                          }}
                          disabled={underwriteSummary?.isSaving || underwriteSummary?.isSaveDisabled}
                          title={underwriteSummary?.isSaveDisabled ? 'Enter required deal inputs to save' : 'Save analysis'}
                        >
                          {underwriteSummary?.isSaving ? 'SAVING...' : 'SAVE ANALYSIS'}
                        </Button>
                      </div>
                    </div>

                    {/* Header Body: Left (Cover/Aerial ~300x180) + Right (Status, H1, Subtitle, Pill Tags) */}
                    <div className="investor-header-row" style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '24px',
                      flexWrap: 'wrap'
                    }}>
                      {/* Left: Cover/Aerial image ~300x180 with toggle */}
                      <div className="investor-header-image" style={{
                        position: 'relative',
                        width: '300px',
                        maxWidth: '100%',
                        height: '180px',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        boxShadow: '0 4px 16px rgba(27, 19, 13, 0.08)',
                        border: '1px solid #E4DDD3',
                        flexShrink: 0
                      }}>
                        <AerialPhoto
                          lat={activeProperty.lat}
                          lng={activeProperty.lng}
                          coverPhotoUrl={detailPhotoView === 'photos' ? (activePropertyCover || activeProperty.cover_photo_url) : null}
                          alt={activeProperty.address}
                          width={600}
                          height={360}
                          aspectRatio="auto"
                          style={{ width: '100%', height: '100%' }}
                        />

                        {/* Aerial/Photos Toggle Overlay */}
                        <div style={{
                          position: 'absolute',
                          bottom: '10px',
                          right: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          backgroundColor: 'rgba(27, 19, 13, 0.85)',
                          backdropFilter: 'blur(6px)',
                          borderRadius: '50px',
                          padding: '3px',
                          gap: '2px',
                          zIndex: 3,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
                        }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailPhotoView('photos');
                            }}
                            style={{
                              background: detailPhotoView === 'photos' ? 'var(--secondary-color, #41101B)' : 'transparent',
                              color: '#FAF8F4',
                              border: 'none',
                              borderRadius: '50px',
                              padding: '4px 10px',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                              cursor: 'pointer'
                            }}
                          >
                            Photos
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailPhotoView('aerial');
                            }}
                            style={{
                              background: detailPhotoView === 'aerial' ? 'var(--secondary-color, #41101B)' : 'transparent',
                              color: '#FAF8F4',
                              border: 'none',
                              borderRadius: '50px',
                              padding: '4px 10px',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                              cursor: 'pointer'
                            }}
                          >
                            Aerial
                          </button>
                        </div>
                      </div>

                      {/* Right: Status Eyebrow, H1 Address, Subtitle, Row of Pill Tags */}
                      <div style={{ flex: 1, minWidth: '280px' }}>
                        {/* Status & Studying Pills */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                          <span style={{
                            display: 'inline-block',
                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--secondary-color, #41101B)',
                            backgroundColor: 'rgba(65, 16, 27, 0.08)',
                            padding: '3px 10px',
                            borderRadius: '50px'
                          }}>
                            {formatStatus(activeProperty.status)}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleToggleStudying(activeProperty)}
                            title={activeProperty.is_studying ? "Pinned as 'Deal I'm Studying' in Journal" : "Pin as 'Deal I'm Studying' in Journal"}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: activeProperty.is_studying ? '#FAF8F5' : 'var(--secondary-color, #41101B)',
                              backgroundColor: activeProperty.is_studying ? 'var(--secondary-color, #41101B)' : 'transparent',
                              border: '1px solid var(--secondary-color, #41101B)',
                              padding: '2px 10px',
                              borderRadius: '50px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span>{activeProperty.is_studying ? '★ Studying' : '☆ Pin to Study'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setIsPasteModalOpen(true)}
                            title="Paste listing details from Zillow, Redfin, or MLS text"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: '#34292A',
                              backgroundColor: 'rgba(189, 211, 226, 0.45)',
                              border: '1px solid #859DCE',
                              padding: '2px 10px',
                              borderRadius: '50px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span>📋 Paste listing details</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOneLookupFill(activeProperty, true)}
                            disabled={isCountyLoading}
                            title="Re-query county records and building characteristics"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: '#34292A',
                              backgroundColor: 'transparent',
                              border: '1px solid rgba(52, 41, 42, 0.25)',
                              padding: '2px 10px',
                              borderRadius: '50px',
                              cursor: isCountyLoading ? 'wait' : 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span>{isCountyLoading ? '↻ Syncing…' : '↻ County Record'}</span>
                          </button>
                        </div>

                        {/* Large Serif H1 Address */}
                        <h1 style={{
                          fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                          fontSize: 'clamp(28px, 3.6vw, 42px)',
                          fontWeight: 400,
                          lineHeight: 1.15,
                          color: 'var(--espresso, #1B130D)',
                          margin: '0 0 6px 0',
                          letterSpacing: '-0.02em'
                        }}>
                          {activeProperty.address}
                        </h1>

                        {/* Subtitle: "City, FL ZIP · County · Folio …" */}
                        <p style={{
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '13.5px',
                          color: 'rgba(52, 41, 42, 0.7)',
                          margin: '0 0 12px 0'
                        }}>
                          {[
                            [activeProperty.city, activeProperty.state || 'FL', activeProperty.zip].filter(Boolean).join(', '),
                            activeProperty.county || activeProperty.parcel_county || 'Broward County',
                            `Folio ${activeProperty.parcel_id || '—'}`
                          ].filter(Boolean).join(' · ')}
                        </p>

                        {/* Row of Small Pill Tags */}
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          {/* Property Type */}
                          <span className="investor-pill-tag">
                            {formatPropertyType(activeProperty.property_type)}
                          </span>

                          {/* "3 bd · 2 ba · 1,620 sf" */}
                          <span className="investor-pill-tag">
                            {[
                              activeProperty.beds != null && activeProperty.beds !== '' ? `${activeProperty.beds} bd` : null,
                              activeProperty.baths != null && activeProperty.baths !== '' ? `${activeProperty.baths} ba` : null,
                              activeProperty.sqft ? `${Number(activeProperty.sqft).toLocaleString()} sf` : null
                            ].filter(Boolean).join(' · ') || '— sf'}
                          </span>

                          {/* Built Year */}
                          {activeProperty.year_built && (
                            <span className="investor-pill-tag">
                              Built {activeProperty.year_built}
                            </span>
                          )}

                          {/* Lot Size */}
                          {activeProperty.lot_sqft && (
                            <span className="investor-pill-tag">
                              {Number(activeProperty.lot_sqft).toLocaleString()} sf lot
                            </span>
                          )}

                          {/* Subdivision Chip */}
                          {subjectForAppraisal.subdivision_name && (
                            <span
                              title={[
                                `Subdivision: ${subjectForAppraisal.subdivision_name}`,
                                subjectForAppraisal.nbrhd_cd ? `Nbrhd ${subjectForAppraisal.nbrhd_cd}` : null,
                                subjectForAppraisal.mkt_ar ? `Mkt area ${subjectForAppraisal.mkt_ar}` : null
                              ].filter(Boolean).join(' · ')}
                              style={{
                                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '4px 10px',
                                borderRadius: '50px',
                                backgroundColor: 'rgba(189, 211, 226, 0.42)',
                                color: '#34292A',
                                border: '1px solid #859DCE'
                              }}
                            >
                              {subjectForAppraisal.subdivision_name}
                            </span>
                          )}

                          {/* Neighborhood Code Chip (NBRHD_CD) */}
                          {subjectForAppraisal.nbrhd_cd && (
                            <span
                              title="County Property Appraiser neighborhood code (NBRHD_CD)"
                              style={{
                                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '4px 10px',
                                borderRadius: '50px',
                                backgroundColor: 'rgba(189, 211, 226, 0.25)',
                                color: '#34292A',
                                border: '1px solid rgba(133, 157, 206, 0.5)'
                              }}
                            >
                              Nbrhd {subjectForAppraisal.nbrhd_cd}
                            </span>
                          )}

                          {/* Construction Chip */}
                          {formatConstructionTypeLabel(subjectForAppraisal.construction_type) && (
                            <span
                              title="Construction type"
                              className="investor-pill-tag"
                            >
                              {formatConstructionTypeLabel(subjectForAppraisal.construction_type)}
                            </span>
                          )}

                          {/* Boat Dock Chip */}
                          {formatBoatDockLabel(subjectForAppraisal) && (
                            <span
                              title="Boat dock"
                              style={{
                                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '4px 10px',
                                borderRadius: '50px',
                                backgroundColor: 'rgba(189, 211, 226, 0.28)',
                                color: '#34292A',
                                border: '1px solid rgba(133, 157, 206, 0.45)'
                              }}
                            >
                              {formatBoatDockLabel(subjectForAppraisal)}
                            </span>
                          )}

                          {/* HOA / Association Chip right next to subdivision */}
                          {subjectForAppraisal.hoa_name && (
                            <span
                              title="HOA / Association name"
                              style={{
                                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '4px 10px',
                                borderRadius: '50px',
                                backgroundColor: '#FAF8F5',
                                color: '#34292A',
                                border: '1px solid rgba(52, 41, 42, 0.22)'
                              }}
                            >
                              HOA: {subjectForAppraisal.hoa_name}
                            </span>
                          )}

                          {/* FLOOD Tag */}
                          <span
                            style={{
                              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '4px 10px',
                              borderRadius: '50px',
                              backgroundColor: floodPillBg,
                              color: floodPillColor,
                              border: floodPillBorder
                            }}
                          >
                            {floodLabel}
                          </span>

                          {/* ZONING Tag */}
                          <span
                            onClick={() => {
                              if (!hasZoning) {
                                handleSelectTab('site');
                              }
                            }}
                            style={{
                              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '4px 10px',
                              borderRadius: '50px',
                              backgroundColor: hasZoning ? 'rgba(189, 211, 226, 0.28)' : 'rgba(240, 173, 78, 0.18)',
                              color: hasZoning ? '#34292A' : '#8A5D1A',
                              border: hasZoning ? '1px solid rgba(133, 157, 206, 0.4)' : '1px solid rgba(240, 173, 78, 0.4)',
                              cursor: hasZoning ? 'default' : 'pointer'
                            }}
                            title={hasZoning ? `Zoning code: ${zoningCode}` : 'Click to add zoning code in Site & zoning tab'}
                          >
                            {hasZoning ? `Zoning · ${zoningCode}` : 'Zoning · add code'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </header>

                  {/* ========================================================================= */}
                  {/* 2. DEAL SNAPSHOT BAND (#1B130D, cream text, 20px radius)                  */}
                  {/* ========================================================================= */}
                  <div
                    id="deal-snapshot-band"
                    style={{
                      backgroundColor: 'var(--espresso, #1B130D)',
                      color: '#FAF8F4',
                      borderRadius: '20px',
                      padding: '26px 28px',
                      marginBottom: '28px',
                      boxShadow: '0 8px 30px rgba(27, 19, 13, 0.16)'
                    }}
                  >
                    {/* 5 KPIs in a wrapping row */}
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '24px 32px',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start'
                    }}>
                      {/* KPI 1: REFERENCE PRICE (follows price_source: LIST PRICE / OFF-MARKET ESTIMATE / MY OFFER / COUNTY VALUE) */}
                      <div style={{ minWidth: '150px', flex: '1 1 160px' }}>
                        <span style={{
                          display: 'block',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: 'rgba(250, 248, 244, 0.6)',
                          marginBottom: '6px'
                        }}>
                          {activePricing.headerPriceLabel}
                        </span>
                        <div style={{
                          fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                          fontSize: 'clamp(28px, 2.8vw, 34px)',
                          fontWeight: 400,
                          lineHeight: 1.1,
                          color: '#FAF8F4',
                          marginBottom: '4px'
                        }}>
                          {refPriceNum ? formatPrice(refPriceNum) : '—'}
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '11.5px',
                          color: 'rgba(250, 248, 244, 0.7)'
                        }}>
                          {listPricePps ? `$${listPricePps} / sf` : '—'}
                          {activePricing.offerPrice && activePricing.priceSource !== 'my_offer'
                            ? ` · My offer ${formatPrice(activePricing.offerPrice)}`
                            : ''}
                        </div>
                      </div>

                      {/* KPI 2: EST. CURRENT VALUE (+ % difference vs off-market estimate / reference price + range) */}
                      <div style={{ minWidth: '175px', flex: '1 1 180px' }}>
                        <span style={{
                          display: 'block',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: 'rgba(250, 248, 244, 0.6)',
                          marginBottom: '6px'
                        }}>
                          EST. CURRENT VALUE
                        </span>
                        <div style={{
                          fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                          fontSize: 'clamp(28px, 2.8vw, 34px)',
                          fontWeight: 400,
                          lineHeight: 1.1,
                          color: '#FAF8F4',
                          marginBottom: '4px'
                        }}>
                          {estCurrentValFormatted}
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '11.5px',
                          color: 'rgba(250, 248, 244, 0.75)'
                        }}>
                          {estVsRefDiffPct != null && (
                            <span style={{
                              color: estVsRefDiffPct >= 0 ? '#A5D6A7' : '#BDD3E2',
                              fontWeight: 700,
                              marginRight: '6px'
                            }}>
                              {estVsRefDiffPct > 0 ? '+' : ''}{estVsRefDiffPct.toFixed(1)}% vs {activePricing.subjectPrefix.toLowerCase()}
                            </span>
                          )}
                          <span>{estVsRefDiffPct != null ? `· ${rangeText}` : rangeText}</span>
                          {hasRenovationBudget && appraisalArvGrid?.reconciledValue && (
                            <span style={{ display: 'block', fontSize: '10.5px', color: '#BDD3E2', marginTop: '2px' }}>
                              ARV {formatPrice(appraisalArvGrid.reconciledValue)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* KPI 3: CASH NEEDED (total liquid cash + "You have $X") */}
                      <div style={{ minWidth: '150px', flex: '1 1 160px' }}>
                        <span style={{
                          display: 'block',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: 'rgba(250, 248, 244, 0.6)',
                          marginBottom: '6px'
                        }}>
                          CASH NEEDED
                        </span>
                        <div style={{
                          fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                          fontSize: 'clamp(28px, 2.8vw, 34px)',
                          fontWeight: 400,
                          lineHeight: 1.1,
                          color: '#FAF8F4',
                          marginBottom: '4px'
                        }}>
                          {formatCurrency(Math.round(cashNeeded))}
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '11.5px',
                          color: 'rgba(250, 248, 244, 0.7)'
                        }}>
                          {buyingProfile?.liquid_cash != null
                            ? `You have ${formatCurrency(Math.round(buyingProfile.liquid_cash))}`
                            : 'Set profile cash'}
                        </div>
                      </div>

                      {/* KPI 4: MONTHLY PAYMENT (full PITI+HOA + note if missing) */}
                      <div style={{ minWidth: '150px', flex: '1 1 160px' }}>
                        <span style={{
                          display: 'block',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: 'rgba(250, 248, 244, 0.6)',
                          marginBottom: '6px'
                        }}>
                          MONTHLY PAYMENT
                        </span>
                        <div style={{
                          fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                          fontSize: 'clamp(28px, 2.8vw, 34px)',
                          fontWeight: 400,
                          lineHeight: 1.1,
                          color: '#FAF8F4',
                          marginBottom: '4px'
                        }}>
                          {totalPiti != null ? `${formatCurrency(Math.round(totalPiti))}/mo` : '—'}
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '11.5px',
                          color: isMissingInsurance ? '#FFB380' : isMissingTaxesOrInsurance ? '#FFB380' : 'rgba(250, 248, 244, 0.7)'
                        }}>
                          {isMissingInsurance ? 'Missing insurance' : (isMissingTaxesOrInsurance ? 'Missing taxes or ins' : 'Full PITI + HOA')}
                        </div>
                      </div>

                      {/* KPI 5: Strategy Headline Result */}
                      <div style={{ minWidth: '150px', flex: '1 1 160px' }}>
                        <span style={{
                          display: 'block',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: 'rgba(250, 248, 244, 0.6)',
                          marginBottom: '6px'
                        }}>
                          {kpi5Label}
                        </span>
                        <div style={{
                          fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                          fontSize: 'clamp(28px, 2.8vw, 34px)',
                          fontWeight: 400,
                          lineHeight: 1.1,
                          color: kpi5IsNegative ? '#FF7B7B' : '#FAF8F4',
                          marginBottom: '4px'
                        }}>
                          {kpi5Value}
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '11.5px',
                          color: 'rgba(250, 248, 244, 0.7)'
                        }}>
                          {kpi5Sub}
                        </div>
                      </div>
                    </div>

                    {/* Under KPIs: Verdict sentence + Completeness meter */}
                    <div style={{
                      borderTop: '1px solid rgba(250, 248, 244, 0.12)',
                      marginTop: '22px',
                      paddingTop: '18px'
                    }}>
                      {/* Verdict Sentence in Italic Serif */}
                      <p style={{
                        fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                        fontStyle: 'italic',
                        fontSize: 'clamp(16px, 1.8vw, 19px)',
                        color: '#FAF8F4',
                        lineHeight: 1.45,
                        margin: '0 0 16px 0'
                      }}>
                        {verdictSentence}
                      </p>

                      {/* Completeness Meter: "Analysis N of 7 complete" */}
                      <div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '8px',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '12px'
                        }}>
                          <span style={{ color: '#FAF8F4', fontWeight: 600 }}>
                            Analysis {completedCount} of 7 complete
                          </span>
                          <span style={{ color: 'rgba(250, 248, 244, 0.7)', fontSize: '11.5px' }}>
                            {missingItems.length > 0 ? `Missing: ${missingItems.join(', ')}` : '✓ All inputs complete'}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div style={{
                          height: '6px',
                          width: '100%',
                          backgroundColor: 'rgba(250, 248, 244, 0.15)',
                          borderRadius: '50px',
                          overflow: 'hidden',
                          marginTop: '8px'
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.round((completedCount / 7) * 100)}%`,
                            backgroundColor: completedCount === 7 ? 'var(--positive)' : 'var(--cream)',
                            borderRadius: '50px',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Data Completeness Card */}
                  <div style={{ marginBottom: '24px' }}>
                    <DataCompletenessCard
                      property={subjectForAppraisal}
                      countyData={countyData}
                      onOpenPasteListing={() => setIsPasteModalOpen(true)}
                      onRefreshCounty={() => handleOneLookupFill(activeProperty, true)}
                      isRefreshing={isCountyLoading}
                    />
                  </div>

                  {/* ========================================================================= */}
                  {/* 3. TABS (Sticky tab bar at top)                                           */}
                  {/* ========================================================================= */}
                  <div
                    role="tablist"
                    aria-label="Property Detail Tabs"
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 40,
                      backgroundColor: 'rgba(250, 248, 244, 0.96)',
                      backdropFilter: 'blur(10px)',
                      borderBottom: '1px solid #E4DDD3',
                      marginBottom: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      overflowX: 'auto',
                      WebkitOverflowScrolling: 'touch',
                      paddingTop: '6px'
                    }}
                  >
                    {[
                      { id: 'overview', label: 'OVERVIEW', badge: overviewBadgeCount },
                      { id: 'comps', label: 'VALUE & COMPS', badge: compsBadgeCount },
                      { id: 'appraisal', label: 'APPRAISAL', badge: appraisalBadgeCount },
                      { id: 'site', label: 'SITE & ZONING', badge: siteBadgeCount },
                      { id: 'deal', label: 'DEAL', badge: dealBadgeCount },
                      { id: 'breakdown', label: 'DEAL BREAKDOWN', badge: 0 },
                      { id: 'photos', label: 'PHOTOS & NOTES', badge: 0 }
                    ].map((tab) => {
                      const isSelected = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          role="tab"
                          id={`tab-${tab.id}`}
                          aria-selected={isSelected}
                          aria-controls={`panel-${tab.id}`}
                          onClick={() => handleSelectTab(tab.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            borderBottom: isSelected ? '2px solid var(--secondary-color, #41101B)' : '2px solid transparent',
                            padding: '12px 18px',
                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                            fontSize: '11.5px',
                            fontWeight: isSelected ? 700 : 600,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: isSelected ? 'var(--espresso, #1B130D)' : 'rgba(52, 41, 42, 0.65)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span>{tab.label}</span>
                          {tab.badge > 0 && (
                            <span style={{
                              backgroundColor: 'rgba(240, 173, 78, 0.22)',
                              color: '#8A5D1A',
                              border: '1px solid rgba(240, 173, 78, 0.45)',
                              borderRadius: '10px',
                              padding: '1px 6px',
                              fontSize: '10px',
                              fontWeight: 700,
                              lineHeight: 1.2
                            }}>
                              {tab.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* ========================================================================= */}
                  {/* 4. TAB PANELS                                                             */}
                  {/* ========================================================================= */}

                  {/* TAB 1: OVERVIEW */}
                  <div
                    role="tabpanel"
                    id="panel-overview"
                    aria-labelledby="tab-overview"
                    style={{ display: activeTab === 'overview' ? 'block' : 'none' }}
                  >
                    {activeStrategy === 'live_in' && (
                      <div style={{
                        marginBottom: '18px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(189, 211, 226, 0.28)',
                        border: '1px solid rgba(133, 157, 206, 0.45)',
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '12px',
                        color: '#34292A'
                      }}>
                        {LIVE_IN_PLAN_DISCLAIMER}
                      </div>
                    )}
                    <div className="investor-overview-grid">
                      {/* Left, wide: "What to know" Auto-generated Checklist */}
                      <div style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #E4DDD3',
                        borderRadius: '20px',
                        padding: '28px',
                        boxShadow: '0 4px 20px rgba(27, 19, 13, 0.03)'
                      }}>
                        <div style={{ marginBottom: '20px' }}>
                          <h2 style={{
                            fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                            fontSize: '24px',
                            fontWeight: 400,
                            color: 'var(--espresso, #1B130D)',
                            margin: '0 0 6px 0'
                          }}>
                            What to know
                          </h2>
                          <p style={{
                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                            fontSize: '12.5px',
                            color: 'rgba(52, 41, 42, 0.6)',
                            margin: 0
                          }}>
                            Auto-generated checklist of deal factors, missing inputs, and property risks.
                          </p>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                          <LiveInFitBadge
                            property={{
                              ...activeProperty,
                              use_code: countyData?.use_code || activeProperty.use_code,
                              flood_zone:
                                siteData?.floodData?.flood_zone ||
                                siteData?.flood?.zone ||
                                activeProperty.flood_zone,
                              flood_sfha:
                                siteData?.floodData?.flood_sfha ??
                                siteData?.floodData?.isSfha ??
                                siteData?.flood?.is_sfha ??
                                activeProperty.flood_sfha
                            }}
                            profile={buyingProfile}
                            showReasons
                            showDisclaimer={activeStrategy === 'live_in'}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {checklistItems.map((item, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: '14px',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                backgroundColor: 'rgba(250, 248, 244, 0.65)',
                                border: '1px solid rgba(228, 221, 211, 0.6)'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
                                {/* Colored Status Dot */}
                                <span style={{
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '50%',
                                  backgroundColor: item.status === 'red' ? '#D9534F' : item.status === 'amber' ? '#F0AD4E' : '#2ECC71',
                                  flexShrink: 0,
                                  marginTop: '5px'
                                }} />

                                <div>
                                  <div style={{
                                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: 'var(--espresso, #1B130D)',
                                    marginBottom: '3px'
                                  }}>
                                    {item.title}
                                  </div>
                                  <div style={{
                                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                    fontSize: '12px',
                                    color: 'rgba(52, 41, 42, 0.72)',
                                    lineHeight: 1.45
                                  }}>
                                    {item.text}
                                  </div>
                                </div>
                              </div>

                              {/* TAB → Link */}
                              {item.tab && (
                                <button
                                  type="button"
                                  onClick={() => handleSelectTab(item.tab)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--secondary-color, #41101B)',
                                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    letterSpacing: '0.04em',
                                    cursor: 'pointer',
                                    padding: '4px 6px',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0
                                  }}
                                >
                                  {item.tabLabel || 'TAB →'}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Right: Property Highlights / Specs Summary Card */}
                      <div style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #E4DDD3',
                        borderRadius: '20px',
                        padding: '28px',
                        boxShadow: '0 4px 20px rgba(27, 19, 13, 0.03)'
                      }}>
                        <div style={{ marginBottom: '18px' }}>
                          <h2 style={{
                            fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                            fontSize: '22px',
                            fontWeight: 400,
                            color: 'var(--espresso, #1B130D)',
                            margin: '0 0 4px 0'
                          }}>
                            Property highlights
                          </h2>
                          <p style={{
                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                            fontSize: '12px',
                            color: 'rgba(52, 41, 42, 0.6)',
                            margin: 0
                          }}>
                            Core physical and administrative specifications.
                          </p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {[
                            { label: 'Type', value: formatPropertyType(activeProperty.property_type) },
                            { label: 'Bed / Bath', value: `${activeProperty.beds || '—'} bd · ${activeProperty.baths || '—'} ba` },
                            { label: 'Living area', value: activeProperty.sqft ? `${Number(activeProperty.sqft).toLocaleString()} sf ${listPricePps ? `($${listPricePps}/sf)` : ''}` : '—' },
                            { label: 'Lot size', value: activeProperty.lot_sqft ? `${Number(activeProperty.lot_sqft).toLocaleString()} sf` : '—' },
                            { label: 'Year built', value: activeProperty.year_built || '—' },
                            { label: 'Condition', value: activeProperty.condition ? `${activeProperty.condition}${activeProperty.roof_year ? ` (roof ${activeProperty.roof_year})` : ''}` : '—' },
                            {
                              label: 'Construction',
                              value: formatConstructionTypeLabel(subjectForAppraisal.construction_type) || '—'
                            },
                            ...(formatBoatDockLabel(subjectForAppraisal)
                              ? [{ label: 'Boat dock', value: formatBoatDockLabel(subjectForAppraisal) }]
                              : []),
                            { label: 'County / Folio', value: `${getPropertyCountyLabel(activeProperty)} · ${activeProperty.parcel_id || 'Not linked'}` },
                            ...(subjectForAppraisal.subdivision_name
                              ? [{
                                  label: 'Subdivision',
                                  value: subjectForAppraisal.subdivision_name
                                }]
                              : []),
                            ...(subjectForAppraisal.nbrhd_cd
                              ? [{ label: 'Neighborhood code', value: subjectForAppraisal.nbrhd_cd }]
                              : []),
                            ...(subjectForAppraisal.hoa_name
                              ? [{ label: 'HOA / Association', value: subjectForAppraisal.hoa_name }]
                              : []),
                            { label: 'Jurisdiction', value: siteData?.zoningData?.municipality || activeProperty.city || '—' },
                            { label: 'Strategy', value: activeProperty.strategy ? (activeProperty.strategy.toUpperCase()) : '—' }
                          ].map((row, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 0',
                                borderBottom: '1px solid rgba(228, 221, 211, 0.5)',
                                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                fontSize: '12px'
                              }}
                            >
                              <span style={{ color: 'rgba(52, 41, 42, 0.6)', fontWeight: 500 }}>{row.label}</span>
                              <span style={{ color: 'var(--espresso, #1B130D)', fontWeight: 600, textAlign: 'right' }}>{row.value}</span>
                            </div>
                          ))}

                          {activeProperty.listing_url && (
                            <div style={{ marginTop: '12px' }}>
                              <a
                                href={activeProperty.listing_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: 'var(--secondary-color, #41101B)',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                View original listing &rarr;
                              </a>
                            </div>
                          )}

                          {/* Notes snippet if present */}
                          {activeProperty.notes && (
                            <div style={{
                              marginTop: '16px',
                              padding: '14px',
                              backgroundColor: 'rgba(140, 121, 106, 0.08)',
                              border: '1px solid rgba(140, 121, 106, 0.2)',
                              borderRadius: '10px'
                            }}>
                              <span style={{
                                display: 'block',
                                fontSize: '10px',
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                color: 'rgba(52, 41, 42, 0.6)',
                                marginBottom: '4px'
                              }}>
                                Notes snippet
                              </span>
                              <p style={{
                                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                                fontStyle: 'italic',
                                fontSize: '13px',
                                color: 'var(--espresso, #1B130D)',
                                margin: '0 0 6px 0',
                                lineHeight: 1.4,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical'
                              }}>
                                {activeProperty.notes}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleSelectTab('photos')}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--secondary-color, #41101B)',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  padding: 0
                                }}
                              >
                                View full notes in Photos & notes &rarr;
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Link to Timeline & Deal Breakdown */}
                    <div
                      style={{
                        marginTop: '24px',
                        padding: '16px 20px',
                        borderRadius: '16px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E4DDD3',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '14px',
                        boxShadow: '0 2px 12px rgba(27, 19, 13, 0.02)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            backgroundColor: 'rgba(189, 211, 226, 0.35)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '20px'
                          }}
                        >
                          🏗️
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '13.5px', fontWeight: 700, color: 'var(--espresso, #1B130D)' }}>
                            Property Lifecycle Timeline &amp; Deal Breakdown
                          </div>
                          <div style={{ fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '12px', color: 'rgba(52, 41, 42, 0.65)' }}>
                            Track acquisition &rarr; demolition &rarr; permits &rarr; construction &rarr; completed &rarr; exit with actual phase lengths.
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSelectTab('breakdown')}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        Open Timeline &amp; Breakdown &rarr;
                      </Button>
                    </div>
                  </div>

                  {/* TAB 2: VALUE & COMPS */}
                  <div
                    role="tabpanel"
                    id="panel-comps"
                    aria-labelledby="tab-comps"
                    style={{ display: activeTab === 'comps' ? 'block' : 'none' }}
                  >
                    {/* Sold Comps Header */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                      marginBottom: '18px'
                    }}>
                      <h2 style={{
                        fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                        fontSize: '28px',
                        fontWeight: 400,
                        color: 'var(--espresso, #1B130D)',
                        margin: 0
                      }}>
                        Sold comps
                      </h2>

                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <Button
                          variant="secondary"
                          onClick={() => handleOpenEditSubjectDetails('as_is')}
                        >
                          Subject details
                        </Button>
                        {comps.length > 0 && (
                          <Button
                            variant="secondary"
                            onClick={() => handleSelectTab('appraisal')}
                          >
                            Open in Appraisal &rarr;
                          </Button>
                        )}
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
                    </div>

                    {/* Suggested Comps from County Records */}
                    <SuggestedCompsPanel
                      property={
                        activeProperty
                          ? {
                              ...activeProperty,
                              sqft: activeProperty.sqft || countyData?.living_sqft || null,
                              subdivision_name: subjectForAppraisal.subdivision_name,
                              subdivision_code: subjectForAppraisal.subdivision_code,
                              nbrhd_cd: subjectForAppraisal.nbrhd_cd,
                              mkt_ar: subjectForAppraisal.mkt_ar,
                              s_legal: subjectForAppraisal.s_legal,
                              hoa_name: subjectForAppraisal.hoa_name
                            }
                          : activeProperty
                      }
                      comps={comps}
                      savedFilters={buyingProfile?.valuation_defaults?.comp_search_filters || null}
                      onSaveFilters={handleSaveCompFilters}
                      onCompAdded={(newComp) => {
                        setComps(prev => [newComp, ...prev]);
                      }}
                      showToast={showToast}
                    />

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
                    {!compsLoading && !compsError && (() => {
                      const subjCountyNorm = normalizeCountyName(subjectForAppraisal.parcel_county || subjectForAppraisal.county);
                      const subjNbrhd = subjectForAppraisal.nbrhd_cd ? String(subjectForAppraisal.nbrhd_cd).trim() : null;
                      const isCompSameNbrhd = (compRow) => {
                        if (!subjNbrhd || !compRow?.nbrhd_cd) return false;
                        const compCountyNorm = normalizeCountyName(compRow.parcel_county || compRow.county);
                        if (subjCountyNorm && compCountyNorm && subjCountyNorm !== compCountyNorm) return false;
                        return String(compRow.nbrhd_cd).trim() === subjNbrhd;
                      };
                      const sameNbrhdAddedCount = subjNbrhd ? comps.filter(isCompSameNbrhd).length : 0;
                      const visibleComps = addedCompsSameNbrhdOnly && subjNbrhd
                        ? comps.filter(isCompSameNbrhd)
                        : comps;

                      return (
                      <div className="investor-table-card" style={{
                        borderRadius: '20px',
                        border: '1px solid #E4DDD3',
                        marginBottom: '32px'
                      }}>
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
                          <>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '10px',
                            padding: '12px 18px',
                            borderBottom: '1px solid rgba(52, 41, 42, 0.08)',
                            backgroundColor: '#FAF8F5',
                            borderTopLeftRadius: '20px',
                            borderTopRightRadius: '20px'
                          }}>
                            <span style={{
                              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: 'rgba(52, 41, 42, 0.72)'
                            }}>
                              Saved comps ({visibleComps.length}{addedCompsSameNbrhdOnly && subjNbrhd ? ` of ${comps.length}` : ''})
                            </span>
                            <label
                              title={
                                subjNbrhd
                                  ? `Filter added comps to neighborhood code ${subjNbrhd}`
                                  : 'Link the county record to filter by neighborhood code (NBRHD_CD)'
                              }
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '7px',
                                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                fontSize: '11.5px',
                                fontWeight: addedCompsSameNbrhdOnly ? 600 : 500,
                                color: subjNbrhd ? '#34292A' : 'rgba(52, 41, 42, 0.42)',
                                cursor: subjNbrhd ? 'pointer' : 'not-allowed',
                                userSelect: 'none',
                                backgroundColor: addedCompsSameNbrhdOnly ? 'rgba(189, 211, 226, 0.45)' : '#FFFFFF',
                                padding: '5px 11px',
                                borderRadius: '999px',
                                border: addedCompsSameNbrhdOnly
                                  ? '1px solid #859DCE'
                                  : '1px solid rgba(52, 41, 42, 0.14)'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(addedCompsSameNbrhdOnly && subjNbrhd)}
                                disabled={!subjNbrhd}
                                onChange={(e) => setAddedCompsSameNbrhdOnly(e.target.checked)}
                                style={{
                                  accentColor: '#34292A',
                                  cursor: subjNbrhd ? 'pointer' : 'not-allowed'
                                }}
                              />
                              <span>
                                Same neighborhood code
                                {subjNbrhd ? ` (${subjNbrhd}) · ${sameNbrhdAddedCount}` : ''}
                              </span>
                            </label>
                          </div>
                          {visibleComps.length === 0 ? (
                            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
                              <p style={{
                                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                fontSize: '13px',
                                color: 'rgba(52, 41, 42, 0.68)',
                                margin: '0 0 10px 0'
                              }}>
                                None of your added comps match neighborhood code {subjNbrhd}.
                              </p>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setAddedCompsSameNbrhdOnly(false)}
                              >
                                Show all added comps
                              </Button>
                            </div>
                          ) : (
                          <div className="investor-table-wrapper">
                            <table className="investor-comps-table">
                              <thead>
                                <tr>
                                  <th style={{ width: '42px', textAlign: 'center' }}></th>
                                  <th style={{ width: '40px', textAlign: 'center' }}>INC</th>
                                  <th style={{ textAlign: 'left' }}>ADDRESS</th>
                                  <th style={{ textAlign: 'left' }}>CONDITION</th>
                                  <th style={{ textAlign: 'left' }}>SOLD</th>
                                  <th style={{ textAlign: 'right' }}>PRICE</th>
                                  <th style={{ textAlign: 'right' }}>SQFT</th>
                                  <th style={{ textAlign: 'right' }}>$/SQFT</th>
                                  <th style={{ textAlign: 'right' }}>DIST</th>
                                  <th style={{ width: '50px', textAlign: 'center' }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {visibleComps.map((c) => {
                                  const ppsqft = c.price_per_sqft != null
                                    ? Math.round(Number(c.price_per_sqft))
                                    : (c.sold_price && c.sqft ? Math.round(Number(c.sold_price) / Number(c.sqft)) : null);
                                  const condKey = c.condition || 'unknown';
                                  const condMeta = COMP_CONDITIONS[condKey] || COMP_CONDITIONS.unknown;
                                  const condCycle = ['c4', 'c3', 'c2', 'unknown'];
                                  const cycleIdx = condCycle.indexOf(condKey);
                                  const nextCond = condCycle[(cycleIdx >= 0 ? cycleIdx + 1 : 0) % condCycle.length];
                                  const isIncluded = resolveCompIsIncluded(c);
                                  const progress = c.details_progress || computeDetailsProgress(c, {
                                    treatLegacyUneditedCountyBooleansAsUnknown: true
                                  });
                                  const clues = c.county_clues || formatCountyClues(c);
                                  const isOutlier = Boolean(c.is_outlier || c.adjustments?.is_outlier);
                                  const isVerified = Boolean(c.comp_details_json?.verified);
                                  const compHoaName = c.hoa_name || c.comp_details_json?.hoa_name || null;
                                  const compConstLabel = formatConstructionTypeLabel(
                                    c.construction_type || c.comp_details_json?.construction_type
                                  );
                                  const compDockLabel = formatBoatDockLabel({
                                    boat_dock: c.boat_dock ?? c.comp_details_json?.boat_dock,
                                    boat_dock_sqft: c.boat_dock_sqft ?? c.comp_details_json?.boat_dock_sqft
                                  });
                                  const sameNbrhdMatch = isCompSameNbrhd(c);
                                  const sameSubdivMatch = Boolean(
                                    (subjectForAppraisal.subdivision_name || subjectForAppraisal.subdivision_code) &&
                                    (c.subdivision_name || c.subdivision_code) &&
                                    isSameSubdivision(
                                      {
                                        county: subjCountyNorm,
                                        subdivision_name: subjectForAppraisal.subdivision_name,
                                        subdivision_code: subjectForAppraisal.subdivision_code
                                      },
                                      {
                                        county: normalizeCountyName(c.parcel_county || c.county),
                                        subdivision_name: c.subdivision_name,
                                        subdivision_code: c.subdivision_code
                                      }
                                    )
                                  );

                                  return (
                                    <tr key={c.id} className={`investor-comp-row ${!isIncluded ? 'excluded' : ''}`}>
                                      <td style={{ width: '42px', padding: '6px 4px', textAlign: 'center' }}>
                                        <AerialPhoto
                                          lat={c.lat}
                                          lng={c.lng}
                                          alt={c.address}
                                          width={80}
                                          height={80}
                                          aspectRatio="1/1"
                                          style={{ width: '36px', height: '36px', borderRadius: '6px', margin: '0 auto' }}
                                          showAttribution={false}
                                        />
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <input
                                          type="checkbox"
                                          checked={isIncluded}
                                          onChange={() => handleToggleInclude(c)}
                                          style={{ cursor: 'pointer', accentColor: 'var(--secondary-color, #41101B)' }}
                                        />
                                      </td>
                                      <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                          <span style={{ fontWeight: 600 }}>{c.address}</span>
                                          {c.subdivision_name && (
                                            <span
                                              title={[
                                                sameSubdivMatch ? 'Same subdivision as subject' : 'Different subdivision',
                                                c.s_legal ? `Legal: ${c.s_legal}` : null,
                                                c.nbrhd_cd ? `Nbrhd: ${c.nbrhd_cd}` : null
                                              ].filter(Boolean).join(' · ')}
                                              style={
                                                sameSubdivMatch
                                                  ? {
                                                      fontSize: '10px',
                                                      fontWeight: 700,
                                                      padding: '1.5px 8px',
                                                      borderRadius: '999px',
                                                      backgroundColor: 'rgba(189, 211, 226, 0.48)',
                                                      border: '1px solid #859DCE',
                                                      color: '#34292A'
                                                    }
                                                  : {
                                                      fontSize: '10px',
                                                      fontWeight: 500,
                                                      padding: '1.5px 8px',
                                                      borderRadius: '999px',
                                                      backgroundColor: '#FAF8F5',
                                                      border: '1px solid rgba(52, 41, 42, 0.16)',
                                                      color: 'rgba(52, 41, 42, 0.78)'
                                                    }
                                              }
                                            >
                                              {sameSubdivMatch ? `✓ ${c.subdivision_name}` : c.subdivision_name}
                                            </span>
                                          )}
                                          {c.nbrhd_cd && (
                                            <span
                                              title={
                                                sameNbrhdMatch
                                                  ? `Same appraiser neighborhood code (${c.nbrhd_cd})`
                                                  : `Appraiser neighborhood code: ${c.nbrhd_cd}`
                                              }
                                              style={
                                                sameNbrhdMatch
                                                  ? {
                                                      fontSize: '10px',
                                                      fontWeight: 700,
                                                      padding: '1.5px 8px',
                                                      borderRadius: '999px',
                                                      backgroundColor: 'rgba(189, 211, 226, 0.42)',
                                                      border: '1px solid #859DCE',
                                                      color: '#34292A'
                                                    }
                                                  : {
                                                      fontSize: '10px',
                                                      fontWeight: 500,
                                                      padding: '1.5px 8px',
                                                      borderRadius: '999px',
                                                      backgroundColor: '#FFFFFF',
                                                      border: '1px solid rgba(52, 41, 42, 0.16)',
                                                      color: 'rgba(52, 41, 42, 0.72)'
                                                    }
                                              }
                                            >
                                              {sameNbrhdMatch ? `✓ Nbrhd ${c.nbrhd_cd}` : `Nbrhd ${c.nbrhd_cd}`}
                                            </span>
                                          )}
                                          {compHoaName && (
                                            <span
                                              title="Manual HOA / association name"
                                              style={{
                                                fontSize: '10px',
                                                fontWeight: 600,
                                                padding: '1.5px 8px',
                                                borderRadius: '999px',
                                                backgroundColor: '#FFFFFF',
                                                border: '1px solid rgba(52, 41, 42, 0.2)',
                                                color: '#34292A'
                                              }}
                                            >
                                              HOA: {compHoaName}
                                            </span>
                                          )}
                                          {isOutlier && (
                                            <span
                                              title={c.adjustments?.outlier_reason || '$/sf outlier — excluded by default in grid'}
                                              style={{
                                                fontSize: '9.5px',
                                                fontWeight: 700,
                                                letterSpacing: '0.06em',
                                                textTransform: 'uppercase',
                                                padding: '1px 6px',
                                                borderRadius: '999px',
                                                border: '1px solid #41101B',
                                                color: '#41101B',
                                                backgroundColor: 'rgba(65, 16, 27, 0.06)'
                                              }}
                                            >
                                              Outlier
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '2px' }}>
                                          {[
                                            c.city,
                                            c.beds != null || c.baths != null
                                              ? `${c.beds ?? '—'}bd/${c.baths ?? '—'}ba`
                                              : null,
                                            compConstLabel,
                                            c.comp_details_json?.windows === 'impact' ? 'Impact windows' : null,
                                            c.pool === true ? 'Pool' : null,
                                            c.waterfront === true ? 'Waterfront' : null,
                                            compDockLabel,
                                            c.comp_details_json?.source || c.source
                                          ].filter(Boolean).join(' · ')}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', marginTop: '4px' }}>
                                          <button
                                            type="button"
                                            onClick={() => handleOpenEditComp(c)}
                                            style={{
                                              fontSize: '10px',
                                              fontWeight: 700,
                                              padding: '1.5px 8px',
                                              borderRadius: '999px',
                                              border: progress.isComplete
                                                ? '1px solid rgba(63, 90, 58, 0.35)'
                                                : '1px solid rgba(52, 41, 42, 0.18)',
                                              backgroundColor: progress.isComplete
                                                ? 'rgba(63, 90, 58, 0.1)'
                                                : '#FAF8F5',
                                              color: progress.isComplete ? '#3F5A3A' : '#34292A',
                                              cursor: 'pointer'
                                            }}
                                          >
                                            {progress.label}{isVerified ? ' · ✓' : ''}
                                          </button>
                                          {clues?.likelyRenovatedLabel && (
                                            <span
                                              style={{
                                                fontSize: '10px',
                                                fontWeight: 600,
                                                padding: '1.5px 7px',
                                                borderRadius: '999px',
                                                backgroundColor: 'rgba(189, 211, 226, 0.35)',
                                                border: '1px solid rgba(133, 157, 206, 0.45)',
                                                color: '#34292A'
                                              }}
                                            >
                                              {clues.likelyRenovatedLabel}
                                            </span>
                                          )}
                                          {clues?.extraFeaturesLabel && (
                                            <span
                                              style={{
                                                fontSize: '10px',
                                                fontWeight: 500,
                                                padding: '1.5px 7px',
                                                borderRadius: '999px',
                                                backgroundColor: 'rgba(52, 41, 42, 0.05)',
                                                color: 'rgba(52, 41, 42, 0.78)'
                                              }}
                                            >
                                              {clues.extraFeaturesLabel}
                                            </span>
                                          )}
                                          {clues?.unitsLabel && (
                                            <span
                                              style={{
                                                fontSize: '10px',
                                                fontWeight: 500,
                                                padding: '1.5px 7px',
                                                borderRadius: '999px',
                                                backgroundColor: 'rgba(52, 41, 42, 0.05)',
                                                color: 'rgba(52, 41, 42, 0.78)'
                                              }}
                                            >
                                              {clues.unitsLabel}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td>
                                        <button
                                          type="button"
                                          onClick={() => handleChangeCompCondition(c, nextCond)}
                                          title="Click to cycle condition (Original C4 / Updated C3 / Renovated C2 / Unknown)"
                                          style={{
                                            border: `1px solid ${condMeta.color}40`,
                                            backgroundColor: condMeta.bg,
                                            color: condMeta.color,
                                            borderRadius: '999px',
                                            padding: '2px 9px',
                                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                            fontSize: '10.5px',
                                            fontWeight: 700,
                                            letterSpacing: '0.04em',
                                            cursor: 'pointer'
                                          }}
                                        >
                                          {condMeta.label}
                                        </button>
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
                                  <td></td>
                                  <td>
                                    <span style={{
                                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      letterSpacing: '0.08em',
                                      textTransform: 'uppercase',
                                      color: 'var(--espresso, #1B130D)'
                                    }}>
                                      Median ({includedComps.length} included)
                                    </span>
                                  </td>
                                  <td>—</td>
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
                          </>
                        )}
                      </div>
                      );
                    })()}

                    {/* Market & Location Cards */}
                    <MarketCard
                      property={activeProperty}
                      comps={comps}
                      onCompAdded={(newComp) => {
                        setComps(prev => [newComp, ...prev]);
                      }}
                      showToast={showToast}
                    />
                  </div>

                  {/* TAB 3: APPRAISAL */}
                  <div
                    role="tabpanel"
                    id="panel-appraisal"
                    aria-labelledby="tab-appraisal"
                    style={{ display: activeTab === 'appraisal' ? 'block' : 'none' }}
                  >
                    <AppraisalGridSection
                      grid={appraisalGrid}
                      mode={effectiveAppraisalMode}
                      hasRenovationBudget={hasRenovationBudget}
                      onModeChange={(nextMode) => setAppraisalMode(nextMode)}
                      sizeMethod={sizeMethod}
                      onSizeMethodChange={(nextMethod) => setSizeMethod(nextMethod)}
                      subjectOverrides={subjectAppraisalOverrides}
                      onSubjectOverrideChange={handleSubjectOverrideChange}
                      onOpenEditSubject={(subjMode) => handleOpenEditSubjectDetails(subjMode)}
                      onToggleCompUsed={handleToggleInclude}
                      onChangeCompCondition={handleChangeCompCondition}
                      onOverrideCompCell={handleOverrideCompCell}
                      onOpenEditComp={handleOpenEditComp}
                      onOpenAddComp={handleOpenAddComp}
                      onGoToCompsTab={() => handleSelectTab('comps')}
                      customWeights={customWeights}
                      onWeightChange={handleWeightChange}
                      onAutoWeights={handleAutoWeights}
                      onNormalizeWeights={handleNormalizeWeights}
                      onUseInDeal={handleUseInDeal}
                      onSaveAppraisal={handleSaveAppraisal}
                      isSavingAppraisal={isSavingAppraisal}
                      lastSavedAt={lastAppraisalSavedAt}
                      onDownloadValuationPdf={handleDownloadValuationPdf}
                      onSaveValuationPdf={handleSaveValuationPdf}
                      isSavingValuationPdf={isSavingValuationPdf}
                      onOpenLibraryModal={() => setIsAdjustmentLibraryOpen(true)}
                      onOpenLearningLabLesson={handleOpenLearningLabLesson}
                    />
                  </div>

                  {/* TAB 4: SITE & ZONING */}
                  <div
                    role="tabpanel"
                    id="panel-site"
                    aria-labelledby="tab-site"
                    style={{ display: activeTab === 'site' ? 'block' : 'none' }}
                  >
                    {/* Site & Zoning Card (FEMA Flood Zone & Constraints) */}
                    <SiteZoningCard
                      property={activeProperty}
                      onPropertyUpdate={(updated) => {
                        setProperties(prev => prev.map(p => (p.id === updated.id ? updated : p)));
                      }}
                      showToast={showToast}
                      onSiteDataChange={(data) => {
                        setSiteData(data);
                      }}
                    />

                    {/* County Record Card */}
                    <CountyRecordCard
                      property={activeProperty}
                      onPropertyUpdate={(updated) => {
                        setProperties(prev => prev.map(p => (p.id === updated.id ? updated : p)));
                      }}
                      showToast={showToast}
                      onCountyDataChange={(cData) => {
                        setCountyData(cData);
                      }}
                    />
                  </div>

                  {/* TAB 4: DEAL */}
                  <div
                    role="tabpanel"
                    id="panel-deal"
                    aria-labelledby="tab-deal"
                    style={{ display: activeTab === 'deal' ? 'block' : 'none' }}
                  >
                    <UnderwritePanel
                      property={activeProperty}
                      countyData={countyData}
                      compValueRaw={rawCompValue}
                      compValueFormatted={compValueFormatted}
                      appraisalAsIs={appraisalAsIsGrid?.reconciledValue || null}
                      appraisalArv={appraisalArvGrid?.reconciledValue || null}
                      appliedAppraisal={appliedAppraisal}
                      profile={buyingProfile}
                      setActiveDashboardTab={setActiveDashboardTab}
                      navigateTo={navigateTo}
                      onNavigateToLesson={handleOpenLearningLabLesson}
                      onOpenProfileModal={() => setIsProfileModalOpen(true)}
                      onUnderwriteChange={(summary) => {
                        setUnderwriteSummary(summary);
                      }}
                    />
                  </div>

                  {/* TAB 5: DEAL BREAKDOWN (Developer Reverse-Engineering) */}
                  <div
                    role="tabpanel"
                    id="panel-breakdown"
                    aria-labelledby="tab-breakdown"
                    style={{ display: activeTab === 'breakdown' ? 'block' : 'none' }}
                  >
                    <SectionErrorBoundary
                      section="deal-breakdown(property)"
                      label="the Deal Breakdown"
                      resetKey={activeProperty?.id}
                    >
                      <DealBreakdownSection
                        property={subjectForAppraisal}
                        countyData={countyData}
                        buyingProfile={buyingProfile}
                        showToast={showToast}
                        onOpenLearningLabLesson={handleOpenLearningLabLesson}
                      />
                    </SectionErrorBoundary>
                  </div>

                  {/* TAB 6: PHOTOS & NOTES */}
                  <div
                    role="tabpanel"
                    id="panel-photos"
                    aria-labelledby="tab-photos"
                    style={{ display: activeTab === 'photos' ? 'block' : 'none' }}
                  >
                    {/* Photos Section (My Photos) */}
                    <PropertyPhotosSection
                      property={activeProperty}
                      onCoverChange={(newCoverUrl) => {
                        setActivePropertyCover(newCoverUrl);
                        setProperties(prev => prev.map(p => (p.id === activeProperty.id ? { ...p, cover_photo_url: newCoverUrl } : p)));
                      }}
                      showToast={showToast}
                    />

                    {/* Documents & Saved Reports */}
                    <PropertyDocumentsSection
                      property={activeProperty}
                      showToast={showToast}
                      refreshKey={documentsRefreshKey}
                    />

                    {/* Your Notes Card */}
                    <div style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #E4DDD3',
                      borderRadius: '20px',
                      padding: '24px 28px',
                      marginTop: '28px',
                      boxShadow: '0 4px 16px rgba(27, 19, 13, 0.03)'
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px'
                      }}>
                        <span style={{
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '11px',
                          fontWeight: 700,
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                          color: 'var(--secondary-color, #41101B)'
                        }}>
                          YOUR NOTES
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditProperty(activeProperty)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--secondary-color, #41101B)',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: 0
                          }}
                        >
                          Edit notes &rarr;
                        </button>
                      </div>

                      {activeProperty.notes ? (
                        <p style={{
                          fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                          fontStyle: 'italic',
                          fontSize: '16px',
                          color: 'var(--espresso, #1B130D)',
                          lineHeight: 1.6,
                          margin: 0,
                          whiteSpace: 'pre-wrap'
                        }}>
                          {activeProperty.notes}
                        </p>
                      ) : (
                        <p style={{
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '13px',
                          color: 'rgba(52, 41, 42, 0.55)',
                          margin: 0
                        }}>
                          No notes saved for this property yet. Click "Edit notes" above to add your underwriting thoughts, contact info, or renovation notes.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              );
            })()
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
          {/* HERO SECTION WITH PHOTO BACKGROUND */}
          <DarkBand
            photoUrl="/images/investor-hero.jpg"
            photoWebpUrl="/images/investor-hero.webp"
            blendToCream={true}
            overlayOpacity={0.50}
            maxWidth="900px"
            paddingTop="96px"
            paddingBottom="120px"
          >
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <Eyebrow onDark style={{ marginBottom: '16px' }}>
                INVESTOR STUDIO · PRIVATE
              </Eyebrow>

              <h1 className="investor-hero-title" style={{
                fontSize: 'clamp(36px, 4.5vw, 56px)',
                margin: '0 auto 20px auto',
                textAlign: 'center',
                maxWidth: '850px',
                color: 'var(--cream)',
                textShadow: '0 2px 20px rgba(0, 0, 0, 0.45)'
              }}>
                Find the property.<br />
                <i style={{ fontStyle: 'italic' }}>Know the numbers.</i>
              </h1>

              <p style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '15px',
                color: 'var(--eyebrow-on-dark)',
                margin: '0 auto',
                maxWidth: '620px',
                lineHeight: '1.6',
                textAlign: 'center',
                textShadow: '0 1px 10px rgba(0, 0, 0, 0.5)'
              }}>
                Search Broward and Palm Beach, pull sold comps, underwrite a deal and save everything to your own database.
              </p>
            </div>

            {/* PILL SEARCH BAR */}
            <form onSubmit={handleSearchSubmit} className="investor-search-container" style={{ margin: '0 auto' }}>
              <div className="investor-search-bar" style={{ boxShadow: 'var(--shadow-floating)' }}>
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
                    <option value="live_in">Live-in plan (FHA)</option>
                  </select>
                </div>

                <button type="submit" className="investor-search-btn">
                  SEARCH &rarr;
                </button>
              </div>

              {/* Quick Filter Pill: "Fits live-in plan" */}
              <div style={{
                marginTop: '14px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap'
              }}>
                <button
                  type="button"
                  onClick={handleToggleFitsLiveIn}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '7px 16px',
                    borderRadius: '999px',
                    border: fitsLiveInFilter
                      ? '1px solid #BDD3E2'
                      : '1px solid rgba(250, 248, 245, 0.35)',
                    backgroundColor: fitsLiveInFilter
                      ? '#BDD3E2'
                      : 'rgba(250, 248, 245, 0.14)',
                    color: fitsLiveInFilter ? '#34292A' : '#FAF8F5',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    backdropFilter: 'blur(6px)',
                    transition: 'all 0.18s ease'
                  }}
                >
                  <span>{fitsLiveInFilter ? '✓' : '○'}</span>
                  <span>Fits live-in plan</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSwitchStudioMode(studioMode === 'finder' ? 'properties' : 'finder')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '7px 16px',
                    borderRadius: '999px',
                    border: studioMode === 'finder'
                      ? '1px solid #BDD3E2'
                      : '1px solid rgba(250, 248, 245, 0.35)',
                    backgroundColor: studioMode === 'finder'
                      ? '#BDD3E2'
                      : 'rgba(250, 248, 245, 0.14)',
                    color: studioMode === 'finder' ? '#34292A' : '#FAF8F5',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    backdropFilter: 'blur(6px)',
                    transition: 'all 0.18s ease'
                  }}
                >
                  <span>{studioMode === 'finder' ? '✓ Flip & Build Finder' : 'Flip & Build Finder →'}</span>
                </button>
              </div>
            </form>
          </DarkBand>

          {/* PAGE CONTENT CONTAINER */}
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 60px 24px', boxSizing: 'border-box' }}>
            {/* STUDIO SECTION MODE BAR */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '24px',
              paddingBottom: '14px',
              borderBottom: '1px solid rgba(52, 41, 42, 0.12)'
            }}>
              <div style={{ display: 'inline-flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleSwitchStudioMode('properties')}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '999px',
                    border: studioMode === 'properties'
                      ? '1px solid #34292A'
                      : '1px solid rgba(52, 41, 42, 0.2)',
                    backgroundColor: studioMode === 'properties' ? '#34292A' : '#FFFFFF',
                    color: studioMode === 'properties' ? '#FAF8F5' : '#34292A',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer'
                  }}
                >
                  My Saved Properties ({properties.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchStudioMode('finder')}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '999px',
                    border: studioMode === 'finder'
                      ? '1px solid #34292A'
                      : '1px solid rgba(52, 41, 42, 0.2)',
                    backgroundColor: studioMode === 'finder' ? '#34292A' : '#FFFFFF',
                    color: studioMode === 'finder' ? '#FAF8F5' : '#34292A',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>Flip &amp; Build Finder</span>
                  <span style={{
                    padding: '1px 7px',
                    borderRadius: '999px',
                    backgroundColor: studioMode === 'finder' ? '#BDD3E2' : 'rgba(189, 211, 226, 0.5)',
                    color: '#34292A',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    letterSpacing: '0.06em'
                  }}>
                    DEAL BREAKDOWN
                  </span>
                </button>
              </div>
              {studioMode === 'finder' && activeFinderRow && (
                <Button
                  variant="secondary"
                  onClick={() => setActiveFinderRow(null)}
                >
                  ← Back to Flip &amp; Build Finder
                </Button>
              )}
            </div>

            {studioMode === 'finder' ? (
              activeFinderRow ? (
                <div style={{ marginTop: '24px' }}>
                  <SectionErrorBoundary
                    section="deal-breakdown(finder)"
                    label="this Deal Breakdown"
                    resetKey={activeFinderRow?.id}
                    onBack={() => setActiveFinderRow(null)}
                    backLabel="Back to Flip & Build Finder"
                  >
                    <DealBreakdownSection
                      finderRow={activeFinderRow}
                      buyingProfile={buyingProfile}
                      showToast={showToast}
                      onBackToFinder={() => setActiveFinderRow(null)}
                      onOpenLearningLabLesson={handleOpenLearningLabLesson}
                    />
                  </SectionErrorBoundary>
                </div>
              ) : (
                <SectionErrorBoundary section="flip-build-finder" label="the Flip & Build Finder">
                  <FlipBuildFinder
                    initialZip={finderInitialZip}
                    onSelectRow={(row) => {
                      setActiveFinderRow(row);
                      if (typeof window !== 'undefined') {
                        window.scrollTo({ top: 180, behavior: 'smooth' });
                      }
                    }}
                    onOpenLearningLabLesson={handleOpenLearningLabLesson}
                  />
                </SectionErrorBoundary>
              )
            ) : (
              <>
            {(appliedFilters.fitsLiveIn || appliedFilters.strategy === 'live_in') && (
              <div style={{
                marginTop: '18px',
                padding: '9px 14px',
                borderRadius: '10px',
                backgroundColor: 'rgba(189, 211, 226, 0.28)',
                border: '1px solid rgba(133, 157, 206, 0.45)',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12px',
                color: '#34292A',
                textAlign: 'center'
              }}>
                {LIVE_IN_PLAN_DISCLAIMER}
              </div>
            )}
            {/* SPLIT VIEW: Compact Cards List & Mapbox Live Map */}
            <div className="investor-split-view">
            {/* LEFT: Scrollable list of compact cards */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="investor-split-list-header">
                <span className="investor-split-col-label">
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
                        {/* Thumbnail Aerial/Cover Block */}
                        <AerialPhoto
                          lat={p.lat}
                          lng={p.lng}
                          coverPhotoUrl={p.cover_photo_url}
                          alt={p.address}
                          width={104}
                          height={104}
                          aspectRatio="1/1"
                          style={{ width: '52px', height: '52px', borderRadius: '8px', flexShrink: 0 }}
                          showAttribution={false}
                        />

                        {/* Card Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: '6px',
                            flexWrap: 'wrap',
                            marginBottom: '2px'
                          }}>
                            <span style={{
                              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                              fontSize: '18px',
                              fontWeight: 600,
                              color: 'var(--espresso, #1E1509)',
                              lineHeight: 1.15
                            }}>
                              {formatPrice(p.list_price)}
                            </span>
                            {resolvePropertyPricing(p).priceSource !== 'list_price' && (
                              <span style={{
                                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                                fontSize: '9.5px',
                                fontWeight: 700,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                color: '#34292A',
                                backgroundColor: 'rgba(189, 211, 226, 0.45)',
                                padding: '1px 6px',
                                borderRadius: '999px'
                              }}>
                                {resolvePropertyPricing(p).subjectPrefix}
                              </span>
                            )}
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
                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                            marginBottom: '5px'
                          }}>
                            <span>{specs || '—'}</span>
                            <span style={{ fontWeight: 600, color: 'var(--espresso, #1E1509)' }}>{pricePerSqft}</span>
                          </div>

                          <LiveInFitBadge property={p} profile={buyingProfile} compact />
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
                <span className="investor-split-col-label">
                  MAP VIEW
                </span>

                {/* Pill Toggles: My saved & Sold comps */}
                <div className="investor-split-map-pills">
                  <button
                    type="button"
                    onClick={() => setShowSavedPins(prev => !prev)}
                    style={{
                      backgroundColor: showSavedPins ? 'var(--secondary-color, #41101B)' : 'transparent',
                      color: showSavedPins ? 'var(--lighter-tone, #FAF8F5)' : 'rgba(52, 41, 42, 0.75)',
                      border: showSavedPins ? '1px solid var(--secondary-color, #41101B)' : '1px solid rgba(52, 41, 42, 0.2)',
                      borderRadius: '50px',
                      padding: '5px 14px',
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      lineHeight: '16px',
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
                      border: showCompsPins ? '1px solid var(--secondary-color, #41101B)' : '1px solid rgba(52, 41, 42, 0.2)',
                      borderRadius: '50px',
                      padding: '5px 14px',
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      lineHeight: '16px',
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

          {/* WATCHED LOCATIONS SECTION */}
          <WatchedLocations
            showToast={showToast}
            onSelectZip={(zip) => {
              setAppliedFilters(prev => ({ ...prev, location: zip }));
              setSearchInput(zip);
            }}
          />

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
                <SectionHeading level="h2" style={{ marginBottom: '6px' }}>
                  Your saved properties
                </SectionHeading>
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  color: 'var(--muted)',
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
                  <Button
                    variant="text"
                    onClick={handleClearFilters}
                  >
                    Clear filters
                  </Button>
                )}

                <Button
                  variant="secondary"
                  onClick={() => setIsProfileModalOpen(true)}
                >
                  <span>BUYING PROFILE</span>
                  {buyingProfile && (
                    <span style={{
                      backgroundColor: 'var(--beige)',
                      color: 'var(--burgundy)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '2px 8px',
                      fontSize: '10px',
                      fontWeight: 700
                    }}>
                      {buyingProfile.credit_tier} · {formatPrice(buyingProfile.liquid_cash)}
                    </span>
                  )}
                </Button>

                <Button
                  variant="primary"
                  onClick={handleOpenAddProperty}
                >
                  + ADD PROPERTY
                </Button>
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
              <EmptyState
                title="No saved properties yet"
                description="Add your first property to start running comps and numbers."
                action={
                  <Button variant="primary" onClick={handleOpenAddProperty}>
                    + ADD PROPERTY
                  </Button>
                }
              />
            )}

            {!loading && !error && properties.length > 0 && filteredProperties.length === 0 && (
              <EmptyState
                title="No matching properties"
                description="None of your saved properties match the current search filters."
                action={
                  <Button variant="secondary" onClick={handleClearFilters}>
                    Reset Search Filters
                  </Button>
                }
              />
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
                      <AerialPhoto
                        lat={p.lat}
                        lng={p.lng}
                        coverPhotoUrl={p.cover_photo_url}
                        alt={p.address}
                        width={600}
                        height={360}
                        aspectRatio="auto"
                        style={{ height: '180px', width: '100%' }}
                      >
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
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                          zIndex: 2
                        }}>
                          {formatStatus(p.status)}
                        </div>

                        {p.is_studying && (
                          <div style={{
                            position: 'absolute',
                            bottom: '12px',
                            right: '12px',
                            backgroundColor: 'var(--secondary-color, #41101B)',
                            color: '#FAF8F5',
                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                            fontSize: '9.5px',
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: '50px',
                            zIndex: 2,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                          }}>
                            ★ Studying
                          </div>
                        )}

                        {/* Badges on Photo */}
                        <div style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          zIndex: 2
                        }}>
                          {p.zoning_code && (
                            <div style={{
                              backgroundColor: 'rgba(52, 41, 42, 0.85)',
                              color: '#FAF8F5',
                              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                              fontSize: '9.5px',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              padding: '3px 8px',
                              borderRadius: '50px',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                              backdropFilter: 'blur(4px)'
                            }}>
                              {p.zoning_code}
                            </div>
                          )}

                          {p.flood_zone && (
                            <div style={{
                              backgroundColor: (p.flood_sfha || ['A', 'AE', 'AH', 'AO', 'V', 'VE'].includes(p.flood_zone))
                                ? 'rgba(217, 83, 79, 0.95)'
                                : (p.flood_zone === 'X' && (p.flood_subtype?.includes('0.2') || p.flood_subtype?.includes('500')))
                                  ? 'rgba(217, 140, 30, 0.95)'
                                  : 'rgba(52, 41, 42, 0.85)',
                              color: '#FAF8F5',
                              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                              fontSize: '9.5px',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              padding: '3px 8px',
                              borderRadius: '50px',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                              backdropFilter: 'blur(4px)'
                            }}>
                              {p.flood_zone === 'X' && (p.flood_subtype?.includes('0.2') || p.flood_subtype?.includes('500'))
                                ? 'Zone X shaded'
                                : `Zone ${p.flood_zone}`}
                            </div>
                          )}
                        </div>
                      </AerialPhoto>

                      {/* Card Body */}
                      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: '8px',
                          flexWrap: 'wrap',
                          marginBottom: '6px'
                        }}>
                          <span style={{
                            fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                            fontSize: '24px',
                            fontWeight: 600,
                            color: 'var(--espresso, #1E1509)',
                            letterSpacing: '-0.01em'
                          }}>
                            {formatPrice(p.list_price)}
                          </span>
                          {resolvePropertyPricing(p).priceSource !== 'list_price' && (
                            <span style={{
                              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                              fontSize: '10px',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              color: '#34292A',
                              backgroundColor: 'rgba(189, 211, 226, 0.45)',
                              padding: '2px 7px',
                              borderRadius: '999px'
                            }}>
                              {resolvePropertyPricing(p).shortLabel}
                            </span>
                          )}
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
                            marginBottom: '10px'
                          }}>
                            {specs}
                          </div>
                        )}

                        <div style={{ marginBottom: '14px' }}>
                          <LiveInFitBadge property={p} profile={buyingProfile} compact />
                        </div>

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
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {p.zoning_code && (
                              <div
                                title={p.zoning_desc ? `Zoning: ${p.zoning_code} (${p.zoning_desc})` : `Zoning: ${p.zoning_code}`}
                              >
                                <Pill variant="neutral" size="sm">
                                  {p.zoning_code}
                                </Pill>
                              </div>
                            )}

                            {p.flood_zone && (
                              <div
                                title={p.flood_sfha ? 'Special Flood Hazard Area (High Risk)' : 'FEMA Flood Zone'}
                              >
                                <Pill
                                  variant={
                                    (p.flood_sfha || ['A', 'AE', 'AH', 'AO', 'V', 'VE'].includes(p.flood_zone))
                                      ? 'negative'
                                      : (p.flood_zone === 'X' && (p.flood_subtype?.includes('0.2') || p.flood_subtype?.includes('500')))
                                        ? 'warning'
                                        : 'neutral'
                                  }
                                  size="sm"
                                >
                                  {p.flood_zone === 'X' && (p.flood_subtype?.includes('0.2') || p.flood_subtype?.includes('500'))
                                    ? 'Zone X shaded'
                                    : (p.flood_bfe ? `Zone ${p.flood_zone} · BFE ${Math.round(p.flood_bfe)}ft` : `Zone ${p.flood_zone}`)}
                                </Pill>
                              </div>
                            )}

                            <Pill variant="neutral" size="sm">
                              {formatStatus(p.strategy)}
                            </Pill>

                            <Button
                              variant="text"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditProperty(p);
                              }}
                              style={{
                                padding: '2px 6px',
                                fontSize: '11px',
                                minHeight: 'auto',
                                textDecoration: 'underline'
                              }}
                            >
                              Edit
                            </Button>
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
          </div>
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
                          lng: details.lng,
                          ...(details.parcel_id ? {
                            parcel_id: details.parcel_id,
                            parcel_county: details.parcel_county || details.county || 'Broward',
                            sqft: details.sqft != null ? details.sqft : prev.sqft,
                            lot_sqft: details.lot_sqft != null ? details.lot_sqft : prev.lot_sqft,
                            year_built: details.year_built != null ? details.year_built : prev.year_built,
                            units: details.units != null ? details.units : prev.units,
                            property_type: details.property_type || prev.property_type
                          } : {})
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
                        <option value="Martin">Martin</option>
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

                      {(propFormData.property_type === 'multifamily_2_9' || propFormData.strategy === 'live_in') ? (
                        <div>
                          <label className="investor-form-label" htmlFor="prop-units">Units (1–4 FHA)</label>
                          <FormattedNumberInput
                            id="prop-units"
                            value={propFormData.units}
                            onChange={(val) => setPropFormData(prev => ({ ...prev, units: val }))}
                            formatOnBlur={false}
                            placeholder="e.g. 2"
                            className="investor-form-input"
                          />
                        </div>
                      ) : <div />}
                    </div>

                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-beds">Beds</label>
                        <FormattedNumberInput
                          id="prop-beds"
                          value={propFormData.beds}
                          onChange={(val) => setPropFormData(prev => ({ ...prev, beds: val }))}
                          allowDecimal={true}
                          formatOnBlur={false}
                          placeholder="e.g. 3"
                          className="investor-form-input"
                        />
                      </div>
                      <div>
                        <label className="investor-form-label" htmlFor="prop-baths">Baths</label>
                        <FormattedNumberInput
                          id="prop-baths"
                          value={propFormData.baths}
                          onChange={(val) => setPropFormData(prev => ({ ...prev, baths: val }))}
                          allowDecimal={true}
                          formatOnBlur={false}
                          placeholder="e.g. 2.5"
                          className="investor-form-input"
                        />
                      </div>
                    </div>

                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-sqft">Living sqft</label>
                        <FormattedNumberInput
                          id="prop-sqft"
                          value={propFormData.sqft}
                          onChange={(val) => setPropFormData(prev => ({ ...prev, sqft: val }))}
                          formatOnBlur={true}
                          placeholder="e.g. 1850"
                          className="investor-form-input"
                        />
                      </div>
                      <div>
                        <label className="investor-form-label" htmlFor="prop-lot-sqft">Lot sqft</label>
                        <FormattedNumberInput
                          id="prop-lot-sqft"
                          value={propFormData.lot_sqft}
                          onChange={(val) => setPropFormData(prev => ({ ...prev, lot_sqft: val }))}
                          formatOnBlur={true}
                          placeholder="e.g. 6500"
                          className="investor-form-input"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="investor-form-label" htmlFor="prop-year-built">Year built</label>
                      <FormattedNumberInput
                        id="prop-year-built"
                        value={propFormData.year_built}
                        onChange={(val) => setPropFormData(prev => ({ ...prev, year_built: val }))}
                        formatOnBlur={false}
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
                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-price-source">Price Source</label>
                        <select
                          id="prop-price-source"
                          value={propFormData.price_source || 'list_price'}
                          onChange={(e) => setPropFormData(prev => ({ ...prev, price_source: e.target.value }))}
                          className="investor-form-select"
                        >
                          {PRICE_SOURCE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="investor-form-label" htmlFor="prop-price">
                          {getPriceSourceMeta(propFormData.price_source).inputLabel}
                        </label>
                        <FormattedNumberInput
                          id="prop-price"
                          value={propFormData.list_price}
                          onChange={(val) => setPropFormData(prev => ({ ...prev, list_price: val }))}
                          prefix="$"
                          formatOnBlur={true}
                          placeholder="$0"
                          className="investor-form-input"
                        />
                      </div>
                    </div>

                    {(propFormData.price_source || 'list_price') !== 'my_offer' && (
                      <div>
                        <label className="investor-form-label" htmlFor="prop-offer-price">
                          My Offer Price <span style={{ fontWeight: 400, opacity: 0.65 }}>(optional — Deal tab uses this first when set)</span>
                        </label>
                        <FormattedNumberInput
                          id="prop-offer-price"
                          value={propFormData.offer_price || ''}
                          onChange={(val) => setPropFormData(prev => ({ ...prev, offer_price: val }))}
                          prefix="$"
                          formatOnBlur={true}
                          placeholder="Leave blank to use price source above"
                          className="investor-form-input"
                        />
                      </div>
                    )}

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
                          <option value="live_in">Live-in plan (FHA)</option>
                        </select>
                      </div>
                    </div>

                    <div className="investor-form-grid-2">
                      <div>
                        <label className="investor-form-label" htmlFor="prop-has-hoa">HOA / Association</label>
                        <select
                          id="prop-has-hoa"
                          value={propFormData.has_hoa === true ? 'true' : propFormData.has_hoa === false ? 'false' : ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPropFormData((prev) => ({
                              ...prev,
                              has_hoa: v === 'true' ? true : v === 'false' ? false : null
                            }));
                          }}
                          className="investor-form-select"
                        >
                          <option value="">Auto (from property type)</option>
                          <option value="true">Yes — has HOA</option>
                          <option value="false">No HOA</option>
                        </select>
                      </div>
                      <div>
                        <label className="investor-form-label" htmlFor="prop-hoa-monthly">HOA Dues ($/mo)</label>
                        <FormattedNumberInput
                          id="prop-hoa-monthly"
                          value={propFormData.hoa_monthly}
                          onChange={(val) => setPropFormData((prev) => ({ ...prev, hoa_monthly: val }))}
                          prefix="$"
                          formatOnBlur={true}
                          placeholder="$0"
                          className="investor-form-input"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="investor-form-label" htmlFor="prop-hoa-name">
                        HOA / association name <span style={{ fontWeight: 400, opacity: 0.65 }}>(optional)</span>
                      </label>
                      <input
                        id="prop-hoa-name"
                        type="text"
                        maxLength={140}
                        value={propFormData.hoa_name || ''}
                        onChange={(e) => setPropFormData((prev) => ({ ...prev, hoa_name: e.target.value }))}
                        placeholder="e.g. River Ridge HOA"
                        className="investor-form-input"
                      />
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
                        placeholder="e.g. C4 dated kitchen, or C5 needs 203(k)"
                        className="investor-form-input"
                      />
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {['C2', 'C3', 'C4', 'C5', 'C6'].map((code) => (
                          <button
                            key={code}
                            type="button"
                            onClick={() =>
                              setPropFormData((prev) => ({
                                ...prev,
                                condition: prev.condition
                                  ? prev.condition.replace(/\bC[1-6]\b\s*/gi, '').trim()
                                    ? `${code} · ${prev.condition.replace(/\bC[1-6]\b\s*·?\s*/gi, '').trim()}`
                                    : code
                                  : code
                              }))
                            }
                            style={{
                              border: '1px solid rgba(52, 41, 42, 0.18)',
                              background: new RegExp(`\\b${code}\\b`, 'i').test(propFormData.condition || '')
                                ? '#34292A'
                                : '#FAF8F5',
                              color: new RegExp(`\\b${code}\\b`, 'i').test(propFormData.condition || '')
                                ? '#FAF8F5'
                                : '#34292A',
                              borderRadius: '999px',
                              padding: '2px 7px',
                              fontSize: '10px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            {code}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="investor-form-label" htmlFor="prop-roof-year">Roof Year</label>
                      <FormattedNumberInput
                        id="prop-roof-year"
                        value={propFormData.roof_year}
                        onChange={(val) => setPropFormData(prev => ({ ...prev, roof_year: val }))}
                        formatOnBlur={false}
                        placeholder="e.g. 2018"
                        className="investor-form-input"
                      />
                    </div>
                  </div>

                  <div className="investor-form-grid-2" style={{ marginTop: '14px' }}>
                    <div>
                      <label className="investor-form-label" htmlFor="prop-construction-type">Construction</label>
                      <select
                        id="prop-construction-type"
                        value={propFormData.construction_type || ''}
                        onChange={(e) => setPropFormData((prev) => ({ ...prev, construction_type: e.target.value }))}
                        className={`investor-form-select ${!propFormData.construction_type ? 'placeholder-active' : ''}`}
                      >
                        <option value="">Unknown</option>
                        {CONSTRUCTION_TYPE_OPTIONS.filter((opt) => opt.id !== 'unknown').map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="investor-form-label" htmlFor="prop-boat-dock">Boat dock</label>
                      <select
                        id="prop-boat-dock"
                        value={propFormData.boat_dock === true ? 'true' : propFormData.boat_dock === false ? 'false' : ''}
                        onChange={(e) => {
                          const val = e.target.value === 'true' ? true : e.target.value === 'false' ? false : null;
                          setPropFormData((prev) => ({
                            ...prev,
                            boat_dock: val,
                            ...(val !== true ? { boat_dock_sqft: '' } : {})
                          }));
                        }}
                        className={`investor-form-select ${propFormData.boat_dock === null ? 'placeholder-active' : ''}`}
                      >
                        <option value="">Unknown</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: '14px' }}>
                    <label className="investor-form-label" htmlFor="prop-construction-detail">
                      Construction detail <span style={{ fontWeight: 400, opacity: 0.65 }}>(optional county record label)</span>
                    </label>
                    <input
                      id="prop-construction-detail"
                      type="text"
                      maxLength={140}
                      value={propFormData.construction_detail || ''}
                      onChange={(e) => setPropFormData((prev) => ({ ...prev, construction_detail: e.target.value }))}
                      placeholder="e.g. Wood frame / Hardi-plank"
                      className="investor-form-input"
                    />
                  </div>

                  {propFormData.boat_dock === true && (
                    <div style={{ marginTop: '14px' }}>
                      <label className="investor-form-label" htmlFor="prop-boat-dock-sqft">
                        Boat dock area (sf) <span style={{ fontWeight: 400, opacity: 0.65 }}>(optional)</span>
                      </label>
                      <FormattedNumberInput
                        id="prop-boat-dock-sqft"
                        value={propFormData.boat_dock_sqft}
                        onChange={(val) => setPropFormData((prev) => ({ ...prev, boat_dock_sqft: val }))}
                        allowDecimal={false}
                        formatOnBlur={true}
                        placeholder="e.g. 350"
                        className="investor-form-input"
                      />
                    </div>
                  )}

                  <div style={{ marginTop: '14px' }}>
                    <label className="investor-form-label" htmlFor="prop-sketch-areas">
                      County sketch areas <span style={{ fontWeight: 400, opacity: 0.65 }}>(optional — shown in Valuation PDF)</span>
                    </label>
                    <input
                      id="prop-sketch-areas"
                      type="text"
                      maxLength={400}
                      value={propFormData.sketch_areas || ''}
                      onChange={(e) => setPropFormData((prev) => ({ ...prev, sketch_areas: e.target.value }))}
                      placeholder="e.g. DWELL 2,688 + 416 · DWELL_U 569 · ADDN 598 + 36"
                      className="investor-form-input"
                    />
                  </div>

                  <div style={{ marginTop: '14px' }}>
                    <label className="investor-form-label" htmlFor="prop-recent-improvements">
                      Recent improvements <span style={{ fontWeight: 400, opacity: 0.65 }}>(optional — shown in Valuation PDF)</span>
                    </label>
                    <textarea
                      id="prop-recent-improvements"
                      rows={2}
                      maxLength={600}
                      value={propFormData.recent_improvements || ''}
                      onChange={(e) => setPropFormData((prev) => ({ ...prev, recent_improvements: e.target.value }))}
                      placeholder="e.g. 2022 metal roof, impact sliders, resurfaced dock pilings..."
                      className="investor-form-textarea"
                    />
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
                      <Button
                        variant="secondary"
                        onClick={handleClosePropertyPanel}
                        disabled={isPropSaving}
                      >
                        CANCEL
                      </Button>
                      <Button
                        variant="primary"
                        type="submit"
                        disabled={isPropSaving}
                      >
                        {isPropSaving ? 'Saving…' : 'SAVE PROPERTY'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 4. SLIDE-IN COMP & SUBJECT DETAILS DRAWER                                 */}
      {/* ========================================================================= */}
      <CompDetailsDrawer
        isOpen={isCompPanelOpen}
        entityType={detailsDrawerEntityType}
        editingComp={editingComp}
        subjectProperty={activeProperty}
        subjectCountyData={countyData}
        initialSubjectMode={initialSubjectDetailsMode}
        hasRenovationBudget={hasRenovationBudget}
        onClose={handleCloseCompPanel}
        onSaveComp={handleSaveCompPayload}
        onDeleteComp={handleDeleteComp}
        onSaveSubjectDetails={handleSaveSubjectDetails}
        isSaving={isCompSaving}
        isDeleting={isCompDeleting}
      />
      {/* Buying Profile Modal */}
      <BuyingProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileSaved={(p) => setBuyingProfile(p)}
        currentProfile={buyingProfile}
      />

      {/* Appraisal Adjustment Library Modal */}
      <AdjustmentLibraryModal
        isOpen={isAdjustmentLibraryOpen}
        onClose={() => setIsAdjustmentLibraryOpen(false)}
        activeTierKey={appraisalGrid?.tier?.key || 'mid'}
        currentProfile={buyingProfile}
        onLibrarySaved={(updatedProfile) => {
          setBuyingProfile(updatedProfile);
          showToast('Adjustment library saved');
        }}
      />

      {/* Paste Listing Details Modal */}
      <PasteListingModal
        isOpen={isPasteModalOpen}
        onClose={() => setIsPasteModalOpen(false)}
        propertyAddress={activeProperty?.address}
        onApply={(patch) => handleApplyListingDetails(patch)}
      />
    </div>
  );
}
