import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatNiceAddress, toTitleCase, forwardGeocodeMapbox } from './AddressAutocomplete.jsx';
import { Button, Pill, SegmentedControl } from '../ui';
import {
  DEFAULT_COMP_FILTERS,
  sanitizeProfileCompFilters,
  computeSqftBounds,
  formatSoldDateWithAge,
  formatCountyWindowNote,
  getNextMonthsExpansion,
  getNextRadiusExpansion
} from './compSearchLogic.js';
import {
  formatCountyClues,
  detailsToLegacyColumns,
  formatBoatDockLabel,
  formatConstructionTypeLabel,
  getUadQualityMeta,
  formatQualityWithRawCode,
  buildCountyCodeTooltip
} from './compDetailsModel.js';
import { normalizeCountyName, resolvePropertyCounty } from '../../config/counties.js';

const MONTH_OPTIONS = [
  { id: 3, label: '3 mo' },
  { id: 6, label: '6 mo' },
  { id: 9, label: '9 mo' },
  { id: 12, label: '12 mo' }
];

const RADIUS_OPTIONS = [
  { id: 0.25, label: '0.25 mi' },
  { id: 0.5, label: '0.5 mi' },
  { id: 1, label: '1 mi' },
  { id: 2, label: '2 mi' }
];

const SIZE_OPTIONS = [
  { id: '20', label: '±20%' },
  { id: '30', label: '±30%' },
  { id: 'any', label: 'Any' }
];

export default function SuggestedCompsPanel({
  property,
  comps = [],
  savedFilters = null,
  onSaveFilters = null,
  onCompAdded,
  onOpenFindModal,
  showToast
}) {
  const [filters, setFilters] = useState(() =>
    savedFilters ? sanitizeProfileCompFilters(savedFilters) : { ...DEFAULT_COMP_FILTERS }
  );
  const [sameSubdivision, setSameSubdivision] = useState(false);
  const [sameNeighborhood, setSameNeighborhood] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [addingParcelId, setAddingParcelId] = useState(null);
  const [freshness, setFreshness] = useState(null);

  const userTouchedFiltersRef = useRef(false);
  const saveTimerRef = useRef(null);

  // Reset per-property subdivision / neighborhood toggles when switching properties
  useEffect(() => {
    setSameSubdivision(false);
    setSameNeighborhood(false);
  }, [property?.parcel_id]);

  // Hydrate filters from investor profile once loaded (unless user already interacted)
  useEffect(() => {
    if (!savedFilters || userTouchedFiltersRef.current) return;
    const normalized = sanitizeProfileCompFilters(savedFilters);
    setFilters((prev) => {
      if (
        prev.months === normalized.months &&
        prev.radius === normalized.radius &&
        prev.sizePct === normalized.sizePct &&
        prev.includeDistressed === normalized.includeDistressed
      ) {
        return prev;
      }
      return normalized;
    });
  }, [savedFilters]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const updateFilters = useCallback(
    (patch) => {
      userTouchedFiltersRef.current = true;
      setFilters((prev) => {
        const next = sanitizeProfileCompFilters({ ...prev, ...patch });
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = setTimeout(() => {
          if (onSaveFilters) {
            onSaveFilters(next);
          } else {
            fetch('/api/investor/profile', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                valuation_defaults: {
                  comp_search_filters: next
                }
              })
            }).catch(() => {});
          }
        }, 250);
        return next;
      });
    },
    [onSaveFilters]
  );

  useEffect(() => {
    let active = true;
    async function loadFreshness() {
      try {
        const res = await fetch('/api/county/freshness');
        if (res.ok) {
          const fData = await res.json();
          if (active) setFreshness(fData);
        }
      } catch {
        // ignore
      }
    }
    loadFreshness();
    return () => {
      active = false;
    };
  }, []);

  const { months, radius, sizePct, includeDistressed } = filters;

  // Fetch suggested comps from /api/county/comps with whitelisted params
  const fetchSuggestedComps = useCallback(
    async (signal) => {
      if (!property?.parcel_id) {
        setData(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Subject county = the linked parcel's county (comps radius itself crosses county lines)
        const county = normalizeCountyName(property.parcel_county) || resolvePropertyCounty(property) || 'Broward';
        const params = new URLSearchParams({
          county,
          parcel_id: property.parcel_id,
          months: String(months),
          radius: String(radius),
          sizePct: String(sizePct)
        });
        if (includeDistressed) {
          params.set('include_distressed', '1');
        }
        if (sameSubdivision) {
          params.set('same_subdivision', '1');
        }
        if (sameNeighborhood) {
          params.set('same_neighborhood', '1');
        }

        const res = await fetch(`/api/county/comps?${params.toString()}`, { signal });
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error('Please sign in to view county comps.');
          }
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP ${res.status}`);
        }

        const resData = await res.json();
        setData(resData);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Error fetching suggested county comps:', err);
        setError(err.message || 'Unable to load suggested comps.');
        setData(null);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [property?.parcel_id, property?.parcel_county, property?.county, months, radius, sizePct, includeDistressed, sameSubdivision, sameNeighborhood]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchSuggestedComps(controller.signal);
    return () => controller.abort();
  }, [fetchSuggestedComps]);

  // Handle adding candidate to investor comps (works for both regular comps and manual outlier adds)
  const handleAddCandidate = async (candidate) => {
    if (!property?.id || addingParcelId) return;

    setAddingParcelId(candidate.parcel_id);
    const niceAddress = formatNiceAddress(candidate.address);
    const titleCity = toTitleCase(candidate.city);
    const zip = candidate.zip || property.zip || '';

    const monthNum = candidate.sale_month ? Number(candidate.sale_month) : 1;
    const monthStr = String(monthNum).padStart(2, '0');
    const soldDate = `${candidate.sale_year}-${monthStr}-01`;

    try {
      let lat = candidate.lat != null ? Number(candidate.lat) : null;
      let lng = candidate.lng != null ? Number(candidate.lng) : null;

      if (lat == null || lng == null) {
        const geoQuery = `${niceAddress}, ${titleCity}, FL ${zip}`.trim();
        const coords = await forwardGeocodeMapbox(geoQuery);
        lat = coords.lat;
        lng = coords.lng;
      }

      const isOutlier = Boolean(candidate.is_outlier);
      const savedDetails = candidate.saved_comp_details || null;
      const prefilledColumns = savedDetails
        ? detailsToLegacyColumns(savedDetails)
        : {
            condition: 'unknown',
            pool: null,
            garage: null,
            waterfront: null,
            comp_details_json: {}
          };

      const payload = {
        property_id: property.id,
        address: niceAddress,
        city: titleCity,
        zip: zip || null,
        lat,
        lng,
        sold_date: soldDate,
        sold_price: Number(candidate.sale_price),
        sqft: Number(candidate.living_sqft),
        lot_sqft: candidate.land_sqft != null ? Number(candidate.land_sqft) : null,
        year_built: candidate.year_built ? Number(candidate.year_built) : null,
        source: savedDetails?.source || 'Property appraiser',
        notes: savedDetails?.notes || null,
        ...prefilledColumns,
        boat_dock: prefilledColumns.boat_dock !== undefined ? prefilledColumns.boat_dock : (candidate.boat_dock ?? null),
        boat_dock_sqft: prefilledColumns.boat_dock_sqft ?? candidate.boat_dock_sqft ?? null,
        boat_lift: prefilledColumns.boat_lift !== undefined ? prefilledColumns.boat_lift : (candidate.boat_lift ?? null),
        construction_type: prefilledColumns.construction_type || candidate.construction_type || null,
        quality: prefilledColumns.quality || candidate.quality || null,
        hoa_name: prefilledColumns.hoa_name || candidate.hoa_name || null,
        included: isOutlier ? false : true,
        is_outlier: isOutlier,
        adjustments: isOutlier
          ? { is_outlier: true, outlier_reason: candidate.outlier_reason || null }
          : {},
        parcel_id: candidate.parcel_id,
        parcel_county: candidate.county || normalizeCountyName(property.parcel_county) || resolvePropertyCounty(property) || 'Broward'
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
        showToast(isOutlier ? 'Outlier comp added (OFF by default in Appraisal)' : 'Comp added');
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

  // Check if a candidate is already in investor comps by parcel_id or address match
  const isCandidateAdded = (candidate) => {
    if (!comps || comps.length === 0) return false;
    const candAddressClean = (candidate.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const candNiceClean = formatNiceAddress(candidate.address).toLowerCase().replace(/[^a-z0-9]/g, '');

    return comps.some((c) => {
      if (c.parcel_id && c.parcel_id === candidate.parcel_id && (!c.parcel_county || !candidate.county || normalizeCountyName(c.parcel_county) === candidate.county)) return true;
      if (c.address) {
        const compAddressClean = c.address.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (compAddressClean === candAddressClean || compAddressClean === candNiceClean) {
          return true;
        }
      }
      return false;
    });
  };

  // State A: Property has NO parcel_id linked
  if (!property?.parcel_id) {
    return (
      <div
        className="investor-suggested-comps-card"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(52, 41, 42, 0.1)',
          borderRadius: '12px',
          padding: '18px 22px',
          boxShadow: '0 4px 16px rgba(52, 41, 42, 0.03)',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.65, flexShrink: 0 }} aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '13px',
              color: 'rgba(52, 41, 42, 0.75)'
            }}
          >
            Link the county record to see suggested comps
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            if (onOpenFindModal) {
              onOpenFindModal();
            } else {
              const el = document.getElementById('county-record-card');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
                const btn = el.querySelector('button');
                if (btn) btn.click();
              }
            }
          }}
          className="investor-search-btn"
          style={{
            padding: '8px 16px',
            fontSize: '11px',
            letterSpacing: '0.08em',
            fontWeight: 600
          }}
        >
          FIND COUNTY RECORD
        </button>
      </div>
    );
  }

  const countyKey = resolvePropertyCounty(property) || 'Broward';
  const countyFreshness = freshness?.[countyKey] || null;

  const summary = data?.summary || {};
  const candidates = data?.candidates || [];

  const subjectSubdivisionName = summary.subject_subdivision_name || property?.subdivision_name || null;
  const subjectSubdivisionCode = summary.subject_subdivision_code || property?.subdivision_code || null;
  const subjectNbrhdCd = summary.subject_nbrhd_cd || property?.nbrhd_cd || null;
  const subjectMktAr = summary.subject_mkt_ar || property?.mkt_ar || null;
  const subjectHoaName = property?.hoa_name || property?.subject_details?.as_is?.hoa_name || null;
  const hasSubjectSubdivision = Boolean(subjectSubdivisionName || subjectSubdivisionCode);
  const hasSubjectNbrhd = Boolean(subjectNbrhdCd);

  // Fallback client-side sqft bounds while loading so filter summary responds instantaneously
  const fallbackBounds = computeSqftBounds(property?.sqft, sizePct);
  const minSqft = summary.sqft_min !== undefined ? summary.sqft_min : fallbackBounds.minSqft;
  const maxSqft = summary.sqft_max !== undefined ? summary.sqft_max : fallbackBounds.maxSqft;

  const sqftRangeStr =
    sizePct === 'any'
      ? 'Any size'
      : minSqft != null && maxSqft != null
        ? `${minSqft.toLocaleString()}–${maxSqft.toLocaleString()} sf`
        : null;

  const activeLocationLabel =
    summary.has_coordinates === false ? 'Same neighborhood' : `Within ${radius} mi`;

  const salesCountPart = !loading
    ? `${candidates.length} ${candidates.length === 1 ? 'sale' : 'sales'}`
    : null;

  const subtitleLine = [
    activeLocationLabel,
    `last ${months} months`,
    sqftRangeStr,
    sameSubdivision ? 'Same subdivision' : null,
    sameNeighborhood ? `Neighborhood ${subjectNbrhdCd || ''}`.trim() : null,
    salesCountPart
  ]
    .filter(Boolean)
    .join(' · ');

  const dataNote =
    summary.data_note ||
    formatCountyWindowNote({
      months,
      countyFreshness
    });

  // Median $/sf text (outliers excluded) — shows "Same subdivision" vs "All" when both exist
  const inlierCount = summary.inlier_count ?? candidates.filter((c) => !c.is_outlier).length;
  const outlierCount = summary.outlier_count ?? candidates.filter((c) => c.is_outlier).length;
  const sameSubdivMedian = summary.same_subdivision_median_price_per_sqft;
  const sameSubdivInliers = summary.same_subdivision_inlier_count ?? 0;

  let medianText = null;
  if (summary.median_price_per_sqft != null && inlierCount > 0) {
    const inlierWord = inlierCount === 1 ? 'sale' : 'sales';
    const outlierSuffix =
      outlierCount > 0
        ? `, ${outlierCount} ${outlierCount === 1 ? 'outlier' : 'outliers'} excluded`
        : '';
    const hasBothSubdivAndOther =
      !sameSubdivision &&
      sameSubdivMedian != null &&
      sameSubdivInliers > 0 &&
      inlierCount > sameSubdivInliers;

    if (hasBothSubdivAndOther) {
      const subWord = sameSubdivInliers === 1 ? 'sale' : 'sales';
      medianText = `Same subdivision: $${sameSubdivMedian}/sf (${sameSubdivInliers} ${subWord}) · All: $${summary.median_price_per_sqft}/sf (${inlierCount} ${inlierWord}${outlierSuffix})`;
    } else if (sameSubdivMedian != null && sameSubdivInliers > 0 && sameSubdivInliers === inlierCount) {
      medianText = `Same subdivision median $${sameSubdivMedian}/sf (${inlierCount} ${inlierWord}${outlierSuffix})`;
    } else {
      medianText = `Median $${summary.median_price_per_sqft}/sf (${inlierCount} ${inlierWord}${outlierSuffix})`;
    }
  }

  const renoMedianText =
    summary.renovated_median_price_per_sqft != null
      ? `Renovated median $${summary.renovated_median_price_per_sqft}/sf`
      : null;

  const combinedMedianLine = [medianText, renoMedianText].filter(Boolean).join(' · ');

  // Next expansion steps when < 3 results
  const nextMonths = getNextMonthsExpansion(months);
  const nextRadius = summary.has_coordinates === false ? null : getNextRadiusExpansion(radius);
  const isSparseResults = !loading && !error && candidates.length < 3;

  const filterLabelStyle = {
    display: 'block',
    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--color-text-muted, rgba(52, 41, 42, 0.65))',
    marginBottom: '5px'
  };

  return (
    <div
      className="investor-suggested-comps-card"
      style={{
        background: '#ffffff',
        border: '1px solid rgba(52, 41, 42, 0.1)',
        borderRadius: '12px',
        padding: '22px 24px',
        boxShadow: '0 4px 16px rgba(52, 41, 42, 0.03)',
        marginBottom: '24px'
      }}
    >
      {/* Header & Summary */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px 12px', marginBottom: '4px' }}>
          <h3
            style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: '20px',
              fontWeight: 500,
              color: 'var(--espresso, #34292A)',
              margin: 0
            }}
          >
            Suggested from county records
          </h3>

          {/* Subject Subdivision & HOA Chips */}
          {(subjectSubdivisionName || subjectHoaName || subjectNbrhdCd) && (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              {subjectSubdivisionName && (
                <Pill
                  variant="neutral"
                  size="sm"
                  title={[
                    `Subject subdivision: ${subjectSubdivisionName}`,
                    subjectSubdivisionCode ? `Code ${subjectSubdivisionCode}` : null,
                    subjectNbrhdCd ? `NBRHD ${subjectNbrhdCd}` : null,
                    subjectMktAr ? `MKT AR ${subjectMktAr}` : null
                  ].filter(Boolean).join(' · ')}
                  style={{
                    backgroundColor: 'rgba(189, 211, 226, 0.42)',
                    border: '1px solid rgba(133, 157, 206, 0.55)',
                    color: '#34292A',
                    textTransform: 'none',
                    fontWeight: 600
                  }}
                >
                  Subject: {subjectSubdivisionName}
                </Pill>
              )}
              {subjectHoaName && (
                <Pill
                  variant="neutral"
                  size="sm"
                  title="Subject property HOA / association name"
                  style={{
                    backgroundColor: '#FAF8F5',
                    border: '1px solid rgba(52, 41, 42, 0.2)',
                    color: '#34292A',
                    textTransform: 'none',
                    fontWeight: 600
                  }}
                >
                  HOA: {subjectHoaName}
                </Pill>
              )}
              {subjectNbrhdCd && (
                <Pill
                  variant="neutral"
                  size="sm"
                  title="County Property Appraiser neighborhood code (NBRHD_CD)"
                  style={{
                    backgroundColor: 'rgba(189, 211, 226, 0.25)',
                    border: '1px solid rgba(133, 157, 206, 0.5)',
                    color: '#34292A',
                    textTransform: 'none',
                    fontWeight: 600
                  }}
                >
                  Nbrhd {subjectNbrhdCd}
                </Pill>
              )}
            </div>
          )}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '12px',
            fontWeight: 500,
            color: 'rgba(52, 41, 42, 0.72)',
            letterSpacing: '0.01em'
          }}
        >
          {subtitleLine}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '11px',
            color: 'rgba(52, 41, 42, 0.5)',
            marginTop: '3px'
          }}
        >
          {dataNote}
        </div>
      </div>

      {/* Filter Bar above suggested comps */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '12px 14px',
          backgroundColor: '#FAF8F5',
          border: '1px solid rgba(52, 41, 42, 0.08)',
          borderRadius: '10px',
          marginBottom: '16px'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px 16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px 16px' }}>
            {/* 1. Sale date: 3 / 6 / 9 / 12 months */}
            <div>
              <span style={filterLabelStyle}>Sale date</span>
              <SegmentedControl
                size="sm"
                options={MONTH_OPTIONS}
                value={months}
                onChange={(val) => updateFilters({ months: Number(val) })}
              />
            </div>

            {/* 2. Radius: 0.25 / 0.5 / 1 / 2 mi */}
            <div>
              <span style={filterLabelStyle}>Radius</span>
              <SegmentedControl
                size="sm"
                options={RADIUS_OPTIONS}
                value={radius}
                onChange={(val) => updateFilters({ radius: Number(val) })}
              />
            </div>

            {/* 3. Size: ±20% / ±30% / Any */}
            <div>
              <span style={filterLabelStyle}>Size</span>
              <SegmentedControl
                size="sm"
                options={SIZE_OPTIONS}
                value={sizePct}
                onChange={(val) => updateFilters({ sizePct: String(val) })}
              />
            </div>
          </div>

          {/* 4. Toggle pills: Same subdivision, Same neighborhood code, Include distressed */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <label
              title={
                hasSubjectSubdivision
                  ? `Show only sales in ${subjectSubdivisionName || subjectSubdivisionCode}`
                  : 'Subject parcel has no subdivision name on the county roll'
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12px',
                fontWeight: sameSubdivision ? 600 : 500,
                color: hasSubjectSubdivision ? 'var(--espresso, #34292A)' : 'rgba(52, 41, 42, 0.42)',
                cursor: hasSubjectSubdivision ? 'pointer' : 'not-allowed',
                userSelect: 'none',
                backgroundColor: sameSubdivision ? 'rgba(189, 211, 226, 0.45)' : '#ffffff',
                padding: '6px 12px',
                borderRadius: '999px',
                border: sameSubdivision
                  ? '1px solid #859DCE'
                  : '1px solid rgba(52, 41, 42, 0.12)',
                minHeight: '34px'
              }}
            >
              <input
                type="checkbox"
                checked={sameSubdivision}
                disabled={!hasSubjectSubdivision}
                onChange={(e) => setSameSubdivision(e.target.checked)}
                style={{
                  accentColor: '#34292A',
                  cursor: hasSubjectSubdivision ? 'pointer' : 'not-allowed'
                }}
              />
              <span>
                Same subdivision
                {summary.same_subdivision_count != null && !loading ? ` (${summary.same_subdivision_count})` : ''}
              </span>
            </label>

            <label
              title={
                hasSubjectNbrhd
                  ? `Show only sales in appraiser neighborhood code ${subjectNbrhdCd}`
                  : 'Subject parcel has no neighborhood code on the county roll'
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12px',
                fontWeight: sameNeighborhood ? 600 : 500,
                color: hasSubjectNbrhd ? 'var(--espresso, #34292A)' : 'rgba(52, 41, 42, 0.42)',
                cursor: hasSubjectNbrhd ? 'pointer' : 'not-allowed',
                userSelect: 'none',
                backgroundColor: sameNeighborhood ? 'rgba(189, 211, 226, 0.45)' : '#ffffff',
                padding: '6px 12px',
                borderRadius: '999px',
                border: sameNeighborhood
                  ? '1px solid #859DCE'
                  : '1px solid rgba(52, 41, 42, 0.12)',
                minHeight: '34px'
              }}
            >
              <input
                type="checkbox"
                checked={sameNeighborhood}
                disabled={!hasSubjectNbrhd}
                onChange={(e) => setSameNeighborhood(e.target.checked)}
                style={{
                  accentColor: '#34292A',
                  cursor: hasSubjectNbrhd ? 'pointer' : 'not-allowed'
                }}
              />
              <span>
                Same neighborhood code
                {subjectNbrhdCd ? ` (${subjectNbrhdCd})` : ''}
                {summary.same_neighborhood_count != null && !loading ? ` · ${summary.same_neighborhood_count}` : ''}
              </span>
            </label>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--espresso, #34292A)',
                cursor: 'pointer',
                userSelect: 'none',
                backgroundColor: '#ffffff',
                padding: '6px 12px',
                borderRadius: '999px',
                border: '1px solid rgba(52, 41, 42, 0.12)',
                minHeight: '34px'
              }}
            >
              <input
                type="checkbox"
                checked={includeDistressed}
                onChange={(e) => updateFilters({ includeDistressed: e.target.checked })}
                style={{
                  accentColor: 'var(--secondary-color, #41101B)',
                  cursor: 'pointer'
                }}
              />
              <span>Include distressed sales</span>
            </label>
          </div>
        </div>
      </div>

      {/* Summary Medians Line */}
      {combinedMedianLine && !loading && candidates.length > 0 && (
        <div
          style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--secondary-color, #41101B)',
            backgroundColor: '#FAF8F5',
            border: '1px solid rgba(65, 16, 27, 0.22)',
            padding: '7px 14px',
            borderRadius: '8px',
            display: 'inline-block',
            marginBottom: '14px'
          }}
        >
          {combinedMedianLine}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(52, 41, 42, 0.6)', fontSize: '13px' }}>
          Finding matching county sales nearby...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{ padding: '12px 16px', backgroundColor: '#FFF7F7', borderRadius: '6px', color: '#8A2A1E', fontSize: '12.5px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* Not enough comps (< 3 results): never auto-widen silently */}
      {isSparseResults && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '12px 16px',
            backgroundColor: '#FAF8F5',
            border: '1px solid rgba(65, 16, 27, 0.25)',
            borderRadius: '10px',
            marginBottom: candidates.length > 0 ? '12px' : '0'
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '12.5px',
              fontWeight: 600,
              color: 'var(--espresso, #34292A)'
            }}
          >
            Only {candidates.length} {candidates.length === 1 ? 'sale' : 'sales'} in {months} months{' '}
            {summary.has_coordinates === false ? 'in this neighborhood' : `within ${radius} mi`}
          </span>

          <div style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            {sameSubdivision && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSameSubdivision(false)}
              >
                Show all subdivisions
              </Button>
            )}
            {sameNeighborhood && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSameNeighborhood(false)}
              >
                All neighborhoods
              </Button>
            )}
            {nextMonths != null && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => updateFilters({ months: nextMonths })}
              >
                Expand to {nextMonths} months
              </Button>
            )}
            {nextRadius != null && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => updateFilters({ radius: nextRadius })}
              >
                Expand to {nextRadius} mi
              </Button>
            )}
            {nextMonths == null && nextRadius == null && sizePct !== 'any' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => updateFilters({ sizePct: sizePct === '20' ? '30' : 'any' })}
              >
                {sizePct === '20' ? 'Expand size to ±30%' : 'Expand to Any size'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Candidates List */}
      {!loading && candidates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {candidates.map((c) => {
            const niceAddress = formatNiceAddress(c.address);
            const soldDateWithAgeStr = formatSoldDateWithAge(c.sale_month, c.sale_year, c.months_ago);
            const priceStr = `$${Number(c.sale_price).toLocaleString()}`;
            const sqftStr = `${Number(c.living_sqft).toLocaleString()} sf`;
            const ppsStr = `$${c.price_per_sqft}/sf`;
            const ybStr = c.year_built ? `Built ${c.year_built}` : '';
            const alreadyAdded = isCandidateAdded(c);
            const isAdding = addingParcelId === c.parcel_id;
            const isOutlier = Boolean(c.is_outlier);
            const subjectCounty = normalizeCountyName(property?.parcel_county) || resolvePropertyCounty(property);
            const crossCounty = c.county && subjectCounty && c.county !== subjectCounty;

            return (
              <div
                key={`${c.county || ''}|${c.parcel_id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '11px 14px',
                  backgroundColor: isOutlier ? 'rgba(250, 248, 245, 0.6)' : '#FAF8F5',
                  borderRadius: '8px',
                  border: isOutlier
                    ? '1px dashed rgba(65, 16, 27, 0.28)'
                    : '1px solid rgba(52, 41, 42, 0.08)',
                  opacity: isOutlier ? 0.88 : 1,
                  gap: '12px',
                  flexWrap: 'wrap',
                  transition: 'background-color 0.15s ease'
                }}
              >
                {/* Left Info: Address, distance, date + age, price, size, $/sf, year, pills, outlier reason */}
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '11px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: 'var(--espresso, #1E1509)',
                        minWidth: '155px'
                      }}
                    >
                      {niceAddress}
                    </span>

                    {/* Distance pill */}
                    {c.distance_mi != null && (
                      <Pill
                        variant="neutral"
                        size="sm"
                        title={`Approx. ${c.distance_mi} miles from subject property`}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid rgba(52, 41, 42, 0.15)',
                          color: 'var(--espresso, #34292A)',
                          textTransform: 'none',
                          fontWeight: 600
                        }}
                      >
                        {c.distance_mi} mi
                      </Pill>
                    )}

                    {/* County pill when the comp sits across a county line */}
                    {crossCounty && (
                      <Pill
                        variant="neutral"
                        size="sm"
                        title={`Sale recorded by the ${c.county} County Property Appraiser`}
                        style={{
                          backgroundColor: 'rgba(189, 211, 226, 0.35)',
                          border: '1px solid rgba(133, 157, 206, 0.45)',
                          color: 'var(--espresso, #34292A)',
                          textTransform: 'none',
                          fontWeight: 600
                        }}
                      >
                        {c.county}
                      </Pill>
                    )}

                    {/* Subdivision chip (highlighted in Quietude/Periwinkle when same subdivision as subject) */}
                    {c.subdivision_name && (
                      <Pill
                        variant="neutral"
                        size="sm"
                        title={[
                          c.same_subdivision ? 'Same subdivision as subject' : 'Different subdivision',
                          c.s_legal ? `Legal: ${c.s_legal}` : null,
                          c.nbrhd_cd ? `Nbrhd: ${c.nbrhd_cd}` : null,
                          c.mkt_ar ? `Mkt area: ${c.mkt_ar}` : null
                        ].filter(Boolean).join(' · ')}
                        style={
                          c.same_subdivision
                            ? {
                                backgroundColor: 'rgba(189, 211, 226, 0.48)',
                                border: '1px solid #859DCE',
                                color: '#34292A',
                                textTransform: 'none',
                                fontWeight: 700
                              }
                            : {
                                backgroundColor: '#ffffff',
                                border: '1px solid rgba(52, 41, 42, 0.14)',
                                color: 'rgba(52, 41, 42, 0.78)',
                                textTransform: 'none',
                                fontWeight: 500
                              }
                        }
                      >
                        {c.same_subdivision ? `✓ ${c.subdivision_name}` : c.subdivision_name}
                      </Pill>
                    )}

                    {/* Neighborhood code chip (NBRHD_CD — highlighted when same neighborhood code as subject) */}
                    {c.nbrhd_cd && (
                      <Pill
                        variant="neutral"
                        size="sm"
                        title={
                          c.same_neighborhood
                            ? `Same county appraiser neighborhood code (${c.nbrhd_cd})`
                            : `County appraiser neighborhood code: ${c.nbrhd_cd}`
                        }
                        style={
                          c.same_neighborhood
                            ? {
                                backgroundColor: 'rgba(189, 211, 226, 0.42)',
                                border: '1px solid #859DCE',
                                color: '#34292A',
                                textTransform: 'none',
                                fontWeight: 700
                              }
                            : {
                                backgroundColor: '#ffffff',
                                border: '1px solid rgba(52, 41, 42, 0.14)',
                                color: 'rgba(52, 41, 42, 0.74)',
                                textTransform: 'none',
                                fontWeight: 500
                              }
                        }
                      >
                        {c.same_neighborhood ? `✓ Nbrhd ${c.nbrhd_cd}` : `Nbrhd ${c.nbrhd_cd}`}
                      </Pill>
                    )}

                    {/* HOA / Association name chip shown right next to subdivision when known */}
                    {(c.hoa_name || c.saved_comp_details?.hoa_name) && (
                      <Pill
                        variant="neutral"
                        size="sm"
                        title="Manual HOA / association name from saved comp details"
                        style={{
                          backgroundColor: '#FAF8F5',
                          border: '1px solid rgba(52, 41, 42, 0.2)',
                          color: '#34292A',
                          textTransform: 'none',
                          fontWeight: 600
                        }}
                      >
                        HOA: {c.hoa_name || c.saved_comp_details?.hoa_name}
                      </Pill>
                    )}

                    {/* Auto-filled / Saved Beds, Quality (with raw county code), Construction & Boat Dock chips */}
                    {(() => {
                      const savedConst = formatConstructionTypeLabel(
                        c.construction_type || c.saved_comp_details?.construction_type
                      );
                      const showConst = savedConst && savedConst !== 'Unknown';
                      const savedDock = formatBoatDockLabel({
                        boat_dock: c.boat_dock ?? c.saved_comp_details?.boat_dock,
                        boat_dock_sqft: c.boat_dock_sqft ?? c.saved_comp_details?.boat_dock_sqft,
                        boat_lift: c.boat_lift ?? c.saved_comp_details?.boat_lift
                      });
                      const bedBathChip = [
                        c.beds != null ? `${c.beds} bd` : null,
                        c.baths != null ? `${c.baths} ba` : null
                      ].filter(Boolean).join(' / ');
                      const qualKey = c.quality || c.saved_comp_details?.quality || null;
                      const qualMeta = qualKey ? getUadQualityMeta(qualKey) : null;
                      const qualLabel = qualMeta && qualMeta.id !== 'unknown'
                        ? formatQualityWithRawCode(qualMeta, c.raw_quality_code, {
                            isManualOverride: Boolean(
                              c.raw_quality_code &&
                              c.field_origins?.quality === 'my_edit' &&
                              qualKey !== c.building_characteristics?.quality_uad
                            )
                          })
                        : null;
                      return (
                        <>
                          {bedBathChip && (
                            <Pill
                              variant="neutral"
                              size="sm"
                              title={c.field_origins?.beds === 'county_record' ? 'Beds & baths from county record' : 'Beds & baths'}
                              style={{
                                backgroundColor: 'rgba(189, 211, 226, 0.25)',
                                border: '1px solid rgba(133, 157, 206, 0.4)',
                                color: '#34292A',
                                textTransform: 'none',
                                fontWeight: 600
                              }}
                            >
                              {bedBathChip}
                            </Pill>
                          )}
                          {qualLabel && (
                            <Pill
                              variant="neutral"
                              size="sm"
                              title={buildCountyCodeTooltip({
                                label: 'County grade',
                                rawCode: c.raw_quality_code,
                                rawDesc: c.raw_quality_desc,
                                origin: c.field_origins?.quality,
                                rollYear: c.building_characteristics?.roll_year
                              }) || 'UAD Quality rating'}
                              style={{
                                backgroundColor: '#FAF8F5',
                                border: '1px solid rgba(52, 41, 42, 0.18)',
                                color: '#34292A',
                                textTransform: 'none',
                                fontWeight: 600
                              }}
                            >
                              {qualLabel}
                            </Pill>
                          )}
                          {showConst && (
                            <Pill
                              variant="neutral"
                              size="sm"
                              title={c.field_origins?.construction_type === 'county_record' ? 'Construction from county building record' : 'Confirmed construction type'}
                              style={{
                                backgroundColor: '#FAF8F5',
                                border: '1px solid rgba(52, 41, 42, 0.16)',
                                color: '#34292A',
                                textTransform: 'none',
                                fontWeight: 600
                              }}
                            >
                              {savedConst}
                            </Pill>
                          )}
                          {savedDock && (
                            <Pill
                              variant="neutral"
                              size="sm"
                              title="Boat dock / lift"
                              style={{
                                backgroundColor: 'rgba(189, 211, 226, 0.28)',
                                border: '1px solid rgba(133, 157, 206, 0.45)',
                                color: '#34292A',
                                textTransform: 'none',
                                fontWeight: 600
                              }}
                            >
                              {savedDock}
                            </Pill>
                          )}
                        </>
                      );
                    })()}

                    {/* Sold Date + Age ("Sold Jul 2026 · 4 mo ago") */}
                    <span
                      style={{
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '12px',
                        color: 'rgba(52, 41, 42, 0.68)'
                      }}
                    >
                      {soldDateWithAgeStr}
                    </span>

                    <span
                      style={{
                        fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                        fontSize: '15.5px',
                        fontWeight: 600,
                        color: 'var(--espresso, #34292A)'
                      }}
                    >
                      {priceStr}
                    </span>

                    <span
                      style={{
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '12px',
                        color: 'rgba(52, 41, 42, 0.7)'
                      }}
                    >
                      {sqftStr}
                    </span>

                    <span
                      style={{
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--secondary-color, #41101B)'
                      }}
                    >
                      {ppsStr}
                    </span>

                    {ybStr && !c.likely_renovated && (
                      <span
                        style={{
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '12px',
                          color: 'rgba(52, 41, 42, 0.6)'
                        }}
                      >
                        {ybStr}
                      </span>
                    )}

                    {/* County Clues from DOR NAL: Likely renovated (both years), Extra features, Units */}
                    {(() => {
                      const clues = formatCountyClues(c);
                      return (
                        <>
                          {clues.likelyRenovatedLabel && (
                            <Pill
                              variant="info"
                              size="sm"
                              title="DOR tax roll hint (not a confirmed fact — confirm in Edit)"
                              style={{ textTransform: 'none', fontWeight: 600 }}
                            >
                              {clues.likelyRenovatedLabel}
                            </Pill>
                          )}
                          {clues.extraFeaturesLabel && (
                            <Pill
                              variant="neutral"
                              size="sm"
                              title="DOR SPEC_FEAT_VAL hint (pools, enclosures, docks — confirm in Edit)"
                              style={{
                                backgroundColor: '#ffffff',
                                border: '1px solid rgba(52, 41, 42, 0.14)',
                                color: 'rgba(52, 41, 42, 0.78)',
                                textTransform: 'none',
                                fontWeight: 600
                              }}
                            >
                              {clues.extraFeaturesLabel}
                            </Pill>
                          )}
                          {clues.unitsLabel && (
                            <Pill
                              variant="neutral"
                              size="sm"
                              style={{
                                backgroundColor: '#ffffff',
                                border: '1px solid rgba(52, 41, 42, 0.14)',
                                color: 'rgba(52, 41, 42, 0.75)',
                                textTransform: 'none',
                                fontWeight: 600
                              }}
                            >
                              {clues.unitsLabel}
                            </Pill>
                          )}
                          {clues.constClassLabel && !(c.construction_type || c.saved_comp_details?.construction_type) && (
                            <Pill
                              variant="neutral"
                              size="sm"
                              title="DOR CONST_CLASS hint (confirm in Edit)"
                              style={{
                                backgroundColor: '#ffffff',
                                border: '1px solid rgba(52, 41, 42, 0.14)',
                                color: 'rgba(52, 41, 42, 0.75)',
                                textTransform: 'none',
                                fontWeight: 600
                              }}
                            >
                              {clues.constClassLabel}
                            </Pill>
                          )}
                        </>
                      );
                    })()}

                    {/* Saved comp_details progress when previously filled */}
                    {c.details_filled_count > 0 && (
                      <Pill
                        variant="positive"
                        size="sm"
                        title="Pre-filled from your saved comp_details"
                        style={{ textTransform: 'none', fontWeight: 600 }}
                      >
                        {c.details_progress?.label || `Details: ${c.details_filled_count} of ${c.details_progress?.totalCount || 10} filled`}
                      </Pill>
                    )}

                    {/* Distressed Pill */}
                    {c.is_distressed && (
                      <Pill variant="negative" size="sm">
                        Distressed
                      </Pill>
                    )}

                    {/* Outlier Chip (amber-free burgundy outline) */}
                    {isOutlier && (
                      <Pill
                        variant="neutral"
                        size="sm"
                        style={{
                          backgroundColor: '#ffffff',
                          color: 'var(--secondary-color, #41101B)',
                          border: '1px solid var(--secondary-color, #41101B)'
                        }}
                      >
                        Outlier
                      </Pill>
                    )}
                  </div>

                  {/* Short Outlier Reason */}
                  {isOutlier && c.outlier_reason && (
                    <div
                      style={{
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '11.5px',
                        color: 'var(--secondary-color, #41101B)',
                        marginTop: '5px'
                      }}
                    >
                      {c.outlier_reason}
                    </div>
                  )}
                </div>

                {/* Right Action Button: "+ ADD" or "✓ Added" (outliers can still be added manually) */}
                <div>
                  {alreadyAdded ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled
                      style={{ cursor: 'default', whiteSpace: 'nowrap' }}
                    >
                      ✓ Added
                    </Button>
                  ) : (
                    <Button
                      variant={isOutlier ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => handleAddCandidate(c)}
                      disabled={isAdding}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {isAdding ? 'ADDING...' : '+ ADD'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Note under list */}
      <div
        style={{
          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
          fontSize: '11.5px',
          color: 'rgba(52, 41, 42, 0.55)',
          fontStyle: 'italic',
          marginTop: '14px',
          lineHeight: 1.4
        }}
      >
        County sales show month only. Beds and baths aren&apos;t in county records — add them in the comp if you need them.
      </div>
    </div>
  );
}
