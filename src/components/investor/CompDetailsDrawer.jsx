import React, { useState, useEffect, useMemo } from 'react';
import { Button, Pill, SegmentedControl } from '../ui';
import AddressAutocomplete from './AddressAutocomplete.jsx';
import FormattedNumberInput from './FormattedNumberInput.jsx';
import {
  CONDITION_QUICK_PICKS,
  UAD_CONDITION_OPTIONS,
  ROOF_TYPE_OPTIONS,
  WINDOW_OPTIONS,
  POOL_OPTIONS,
  GARAGE_OPTIONS,
  WATERFRONT_VIEW_OPTIONS,
  DETAIL_SOURCE_OPTIONS,
  buildSaleMonthKey,
  normalizeCompDetails,
  detailsToLegacyColumns,
  computeDetailsProgress,
  formatCountyClues,
  buildCountyHintSuggestions,
  resolveSubjectDetailsForMode
} from './compDetailsModel.js';

function garageToOptionId(details) {
  const gt = details?.garage_type || 'unknown';
  const bays = details?.garage_bays;
  if (gt === 'none') return 'none';
  if (gt === 'carport') return 'carport';
  if (gt === 'converted') return 'converted';
  if (gt === 'garage') {
    if (bays >= 3) return '3_bay';
    if (bays === 1) return '1_bay';
    return '2_bay';
  }
  return 'unknown';
}

function optionIdToGarageFields(optId) {
  const found = GARAGE_OPTIONS.find((o) => o.id === optId);
  if (!found) return { garage_type: 'unknown', garage_bays: null };
  if (found.id === 'none') return { garage_type: 'none', garage_bays: 0 };
  return {
    garage_type: found.garage_type,
    garage_bays: found.garage_bays
  };
}

function triBoolToSeg(val) {
  if (val === true) return 'yes';
  if (val === false) return 'no';
  return 'unknown';
}

function segToTriBool(seg) {
  if (seg === 'yes') return true;
  if (seg === 'no') return false;
  return null;
}

function ChoiceChipGroup({ options, value, onChange, suggestedValue = null }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {options.map((opt) => {
        const active = opt.id === value;
        const isSuggested = suggestedValue != null && opt.id === suggestedValue && active;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              padding: '7px 12px',
              borderRadius: '999px',
              border: active
                ? '1.5px solid #34292A'
                : '1px solid rgba(52, 41, 42, 0.18)',
              backgroundColor: active
                ? (isSuggested ? 'rgba(189, 211, 226, 0.42)' : '#34292A')
                : '#FFFFFF',
              color: active
                ? (isSuggested ? '#34292A' : '#FAF8F5')
                : '#34292A',
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '11.5px',
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function CompDetailsDrawer({
  isOpen,
  entityType = 'comp', // 'comp' | 'subject'
  editingComp = null,
  subjectProperty = null,
  subjectCountyData = null,
  initialSubjectMode = 'as_is', // 'as_is' | 'after_rehab'
  onClose,
  onSaveComp,
  onDeleteComp,
  onSaveSubjectDetails,
  isSaving = false,
  isDeleting = false
}) {
  const [subjectTab, setSubjectTab] = useState(initialSubjectMode === 'after_rehab' ? 'after_rehab' : 'as_is');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);

  // Comp sale header state (used when entityType === 'comp')
  const [saleFields, setSaleFields] = useState({
    address: '',
    city: '',
    zip: '',
    lat: null,
    lng: null,
    sold_date: '',
    sold_price: '',
    sqft: '',
    lot_sqft: '',
    year_built: '',
    included: true,
    parcel_id: null,
    parcel_county: null,
    is_outlier: false
  });

  // Details state (for comp, or for subject { as_is, after_rehab })
  const [compDetails, setCompDetails] = useState(() => normalizeCompDetails({}));
  const [subjectDetailsMap, setSubjectDetailsMap] = useState(() => ({
    as_is: normalizeCompDetails({}),
    after_rehab: normalizeCompDetails({ condition: 'c2' })
  }));
  const [hintSuggestedFields, setHintSuggestedFields] = useState({});

  // County clues for active entity
  const activeClues = useMemo(() => {
    if (entityType === 'subject') {
      return formatCountyClues({
        ...(subjectProperty || {}),
        ...(subjectCountyData || {}),
        year_built: subjectProperty?.year_built ?? subjectCountyData?.year_built ?? null,
        eff_year_built: subjectCountyData?.eff_year_built ?? subjectProperty?.eff_year_built ?? null,
        spec_feat_val: subjectCountyData?.spec_feat_val ?? null,
        units: subjectCountyData?.units ?? subjectProperty?.units ?? null,
        imp_qual: subjectCountyData?.imp_qual ?? null,
        const_class: subjectCountyData?.const_class ?? null
      });
    }
    if (editingComp?.county_clues) {
      return editingComp.county_clues;
    }
    return formatCountyClues(editingComp || saleFields);
  }, [entityType, subjectProperty, subjectCountyData, editingComp, saleFields]);

  // Initialize form whenever drawer opens or target changes
  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    setFieldErrors({});
    setIsDeleteConfirming(false);

    if (entityType === 'subject' && subjectProperty) {
      const nextMode = initialSubjectMode === 'after_rehab' ? 'after_rehab' : 'as_is';
      setSubjectTab(nextMode);
      const baseAsIs = resolveSubjectDetailsForMode(subjectProperty, 'as_is');
      const baseAfterRehab = resolveSubjectDetailsForMode(subjectProperty, 'arv');
      setSubjectDetailsMap({
        as_is: baseAsIs,
        after_rehab: baseAfterRehab
      });
      setHintSuggestedFields({});
      return;
    }

    // Comp mode
    if (editingComp) {
      setSaleFields({
        address: editingComp.address || '',
        city: editingComp.city || '',
        zip: editingComp.zip || '',
        lat: editingComp.lat != null ? Number(editingComp.lat) : null,
        lng: editingComp.lng != null ? Number(editingComp.lng) : null,
        sold_date: editingComp.sold_date ? String(editingComp.sold_date).split('T')[0] : '',
        sold_price: editingComp.sold_price != null ? String(editingComp.sold_price) : '',
        sqft: editingComp.sqft != null ? String(editingComp.sqft) : '',
        lot_sqft: editingComp.lot_sqft != null ? String(editingComp.lot_sqft) : '',
        year_built: editingComp.year_built != null ? String(editingComp.year_built) : '',
        included: editingComp.included !== false,
        parcel_id: editingComp.parcel_id || null,
        parcel_county: editingComp.parcel_county || null,
        is_outlier: Boolean(editingComp.is_outlier || editingComp.adjustments?.is_outlier)
      });

      const baseNorm = normalizeCompDetails(editingComp, {
        treatLegacyUneditedCountyBooleansAsUnknown: true
      });
      const clues = editingComp.county_clues || formatCountyClues(editingComp);
      const { suggestions } = buildCountyHintSuggestions(baseNorm, clues);

      if (Object.keys(suggestions).length > 0) {
        setCompDetails(normalizeCompDetails({ ...baseNorm, ...suggestions }));
        setHintSuggestedFields(suggestions);
      } else {
        setCompDetails(baseNorm);
        setHintSuggestedFields({});
      }
    } else {
      setSaleFields({
        address: '',
        city: '',
        zip: '',
        lat: null,
        lng: null,
        sold_date: '',
        sold_price: '',
        sqft: '',
        lot_sqft: '',
        year_built: '',
        included: true,
        parcel_id: null,
        parcel_county: null,
        is_outlier: false
      });
      setCompDetails(normalizeCompDetails({ source: 'MLS', verified: false }));
      setHintSuggestedFields({});
    }
  }, [isOpen, entityType, editingComp, subjectProperty, initialSubjectMode]);

  if (!isOpen) return null;

  const activeDetails = entityType === 'subject' ? subjectDetailsMap[subjectTab] : compDetails;

  const updateActiveDetails = (patch) => {
    // Clear county hint highlight for fields the user explicitly interacts with
    setHintSuggestedFields((prev) => {
      const next = { ...prev };
      Object.keys(patch).forEach((k) => {
        delete next[k];
      });
      return next;
    });

    if (entityType === 'subject') {
      setSubjectDetailsMap((prev) => ({
        ...prev,
        [subjectTab]: normalizeCompDetails({
          ...prev[subjectTab],
          ...patch
        })
      }));
    } else {
      setCompDetails((prev) =>
        normalizeCompDetails({
          ...prev,
          ...patch
        })
      );
    }
  };

  const progress = computeDetailsProgress(activeDetails);

  const handleApplyCountySuggestions = () => {
    const { suggestions } = buildCountyHintSuggestions(activeDetails, activeClues);
    if (Object.keys(suggestions).length === 0) return;
    if (entityType === 'subject') {
      setSubjectDetailsMap((prev) => ({
        ...prev,
        [subjectTab]: normalizeCompDetails({ ...prev[subjectTab], ...suggestions })
      }));
    } else {
      setCompDetails((prev) => normalizeCompDetails({ ...prev, ...suggestions }));
    }
    setHintSuggestedFields(suggestions);
  };

  const handleClearCountySuggestions = () => {
    const resetPatch = {};
    if (hintSuggestedFields.condition) resetPatch.condition = 'unknown';
    if (hintSuggestedFields.pool_type) resetPatch.pool_type = 'unknown';
    if (hintSuggestedFields.beds !== undefined) resetPatch.beds = null;
    if (hintSuggestedFields.full_baths !== undefined) {
      resetPatch.full_baths = null;
      resetPatch.half_baths = null;
    }
    updateActiveDetails(resetPatch);
    setHintSuggestedFields({});
  };

  const handleCopyAsIsToAfterRehab = () => {
    setSubjectDetailsMap((prev) => ({
      ...prev,
      after_rehab: normalizeCompDetails({
        ...prev.as_is,
        condition: prev.after_rehab.condition !== 'unknown' ? prev.after_rehab.condition : 'c2',
        kitchen_baths_updated: true
      })
    }));
  };

  // Lookup saved comp_details if user selects an address with a county folio during "+ Add Comp"
  const fetchSavedDetailsForFolio = async (county, parcelId, soldDate) => {
    if (!parcelId) return;
    try {
      const params = new URLSearchParams({
        county: county || 'Broward',
        parcel_id: parcelId
      });
      if (soldDate) params.set('sale_date', soldDate);
      const res = await fetch(`/api/investor/comp-details?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      const saved = data?.item?.comp_details_json || data?.items?.[0]?.comp_details_json;
      if (saved) {
        setCompDetails(normalizeCompDetails(saved));
        setHintSuggestedFields({});
      }
    } catch {
      // ignore transient error
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setFormError('');
    setFieldErrors({});

    if (entityType === 'subject') {
      if (!onSaveSubjectDetails) return;
      try {
        await onSaveSubjectDetails(subjectDetailsMap);
      } catch (err) {
        setFormError(err?.message || 'Failed to save subject property details.');
      }
      return;
    }

    if (!saleFields.address.trim()) {
      setFieldErrors({ address: 'Address is required.' });
      setFormError('Address is required.');
      return;
    }

    const legacy = detailsToLegacyColumns(compDetails);
    const parseCleanNum = (v) => {
      if (v === '' || v == null) return null;
      const n = Number(String(v).replace(/[^\d.]/g, ''));
      return Number.isFinite(n) ? n : null;
    };

    const payload = {
      ...(editingComp?.id ? { id: editingComp.id } : {}),
      address: saleFields.address.trim(),
      city: saleFields.city.trim() || null,
      zip: saleFields.zip.trim() || null,
      lat: saleFields.lat != null ? Number(saleFields.lat) : null,
      lng: saleFields.lng != null ? Number(saleFields.lng) : null,
      sold_date: saleFields.sold_date || null,
      sold_price: parseCleanNum(saleFields.sold_price),
      sqft: parseCleanNum(saleFields.sqft) != null ? Math.round(parseCleanNum(saleFields.sqft)) : null,
      lot_sqft: parseCleanNum(saleFields.lot_sqft) != null ? Math.round(parseCleanNum(saleFields.lot_sqft)) : null,
      year_built: parseCleanNum(saleFields.year_built) != null ? Math.round(parseCleanNum(saleFields.year_built)) : null,
      included: Boolean(saleFields.included),
      parcel_id: saleFields.parcel_id || null,
      parcel_county: saleFields.parcel_county || null,
      is_outlier: Boolean(saleFields.is_outlier),
      beds: legacy.beds,
      baths: legacy.baths,
      condition: legacy.condition,
      pool: legacy.pool,
      garage: legacy.garage,
      waterfront: legacy.waterfront,
      notes: compDetails.notes ? compDetails.notes.trim() : null,
      source: compDetails.source || editingComp?.source || 'MLS',
      comp_details_json: compDetails,
      ...(editingComp?.adjustments ? { adjustments: editingComp.adjustments } : {})
    };

    try {
      await onSaveComp(payload);
    } catch (err) {
      if (err?.errors) setFieldErrors(err.errors);
      setFormError(err?.message || 'Failed to save comp details.');
    }
  };

  const saleMonthBadge =
    entityType === 'comp' && saleFields.parcel_id
      ? [
          `Folio ${saleFields.parcel_id}`,
          buildSaleMonthKey(saleFields.sold_date) || null
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  const activeConditionOption =
    UAD_CONDITION_OPTIONS.find((o) => o.id === activeDetails.condition) || UAD_CONDITION_OPTIONS[6];

  return (
    <>
      <div className="investor-panel-overlay" onClick={isSaving || isDeleting ? undefined : onClose} />
      <div
        className="investor-slide-panel"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: '580px', width: '100%' }}
      >
        {/* Header */}
        <div
          style={{
            padding: '22px 28px 18px',
            borderBottom: '1px solid rgba(52, 41, 42, 0.1)',
            backgroundColor: '#FAF8F5'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div>
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(52, 41, 42, 0.58)',
                  marginBottom: '4px'
                }}
              >
                {entityType === 'subject' ? 'SUBJECT PROPERTY DETAILS' : 'COMPARABLE SALE DETAILS'}
              </span>
              <h2
                style={{
                  fontFamily: 'var(--font-heading, "Instrument Serif", Georgia, serif)',
                  fontSize: '28px',
                  fontWeight: 400,
                  lineHeight: 1.15,
                  color: '#34292A',
                  margin: 0
                }}
              >
                {entityType === 'subject'
                  ? 'Subject condition & features'
                  : editingComp
                    ? 'Edit comp details'
                    : 'Add a comp'}
              </h2>
              {entityType === 'subject' && subjectProperty?.address && (
                <div style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.68)', marginTop: '4px', fontWeight: 500 }}>
                  {subjectProperty.address}
                </div>
              )}
              {saleMonthBadge && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 600,
                      padding: '2px 9px',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(189, 211, 226, 0.35)',
                      border: '1px solid rgba(133, 157, 206, 0.45)',
                      color: '#34292A'
                    }}
                  >
                    Saved per county sale · {saleMonthBadge}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isDeleting}
              aria-label="Close"
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                lineHeight: 1,
                color: 'rgba(52, 41, 42, 0.6)',
                cursor: isSaving || isDeleting ? 'not-allowed' : 'pointer',
                padding: '4px'
              }}
            >
              &times;
            </button>
          </div>

          {/* Progress Bar: Details: X of 9 filled */}
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: progress.isComplete ? '#3F5A3A' : '#34292A'
                }}
              >
                {progress.label}
                {activeDetails.verified && (
                  <span style={{ marginLeft: '8px', color: '#3F5A3A', fontWeight: 700 }}>· ✓ Verified</span>
                )}
              </span>
              {progress.missingLabels.length > 0 && progress.missingLabels.length <= 4 && (
                <span style={{ fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.58)' }}>
                  Missing: {progress.missingLabels.join(', ')}
                </span>
              )}
            </div>
            <div
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '999px',
                backgroundColor: 'rgba(52, 41, 42, 0.1)',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${progress.pct}%`,
                  height: '100%',
                  borderRadius: '999px',
                  backgroundColor: progress.isComplete ? '#3F5A3A' : '#859DCE',
                  transition: 'width 0.2s ease'
                }}
              />
            </div>
          </div>

          {/* Subject Mode Switcher: As-is vs After-rehab */}
          {entityType === 'subject' && (
            <div
              style={{
                marginTop: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap'
              }}
            >
              <SegmentedControl
                size="sm"
                options={[
                  { id: 'as_is', label: 'As-is' },
                  { id: 'after_rehab', label: 'After-rehab (ARV)' }
                ]}
                value={subjectTab}
                onChange={setSubjectTab}
              />
              {subjectTab === 'after_rehab' && (
                <button
                  type="button"
                  onClick={handleCopyAsIsToAfterRehab}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid rgba(52, 41, 42, 0.2)',
                    borderRadius: '999px',
                    padding: '5px 11px',
                    fontSize: '10.5px',
                    fontWeight: 600,
                    color: '#34292A',
                    cursor: 'pointer'
                  }}
                >
                  Copy As-is &rarr; After-rehab
                </button>
              )}
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              padding: '22px 28px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            {formError && (
              <div
                style={{
                  backgroundColor: 'rgba(65, 16, 27, 0.06)',
                  border: '1px solid rgba(65, 16, 27, 0.28)',
                  borderRadius: '10px',
                  padding: '11px 14px',
                  color: '#41101B',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  lineHeight: 1.4
                }}
              >
                {formError}
              </div>
            )}

            {/* County Clues Banner (DOR NAL hints — user confirms) */}
            {activeClues.hasAnyClue && (
              <div
                style={{
                  backgroundColor: 'rgba(189, 211, 226, 0.22)',
                  border: '1px solid rgba(133, 157, 206, 0.45)',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#34292A'
                    }}
                  >
                    COUNTY ROLL CLUES · HINTS TO CONFIRM
                  </span>
                  {Object.keys(hintSuggestedFields).length > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearCountySuggestions}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid rgba(52, 41, 42, 0.2)',
                        borderRadius: '999px',
                        padding: '3px 9px',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#34292A',
                        cursor: 'pointer'
                      }}
                    >
                      Clear pre-filled hints
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleApplyCountySuggestions}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid rgba(133, 157, 206, 0.6)',
                        borderRadius: '999px',
                        padding: '3px 9px',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#34292A',
                        cursor: 'pointer'
                      }}
                    >
                      Pre-fill suggestions
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {activeClues.likelyRenovatedLabel && (
                    <Pill variant="info" size="sm">
                      {activeClues.likelyRenovatedLabel}
                    </Pill>
                  )}
                  {activeClues.extraFeaturesLabel && (
                    <Pill variant="neutral" size="sm">
                      {activeClues.extraFeaturesLabel}
                    </Pill>
                  )}
                  {activeClues.unitsLabel && (
                    <Pill variant="neutral" size="sm">
                      {activeClues.unitsLabel}
                    </Pill>
                  )}
                  {activeClues.constClassLabel && (
                    <Pill variant="neutral" size="sm">
                      {activeClues.constClassLabel}
                    </Pill>
                  )}
                  {activeClues.impQualLabel && (
                    <Pill variant="neutral" size="sm">
                      Quality: {activeClues.impQualLabel}
                    </Pill>
                  )}
                </div>

                <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.72)', lineHeight: 1.4 }}>
                  County clues pre-fill suggestions only — confirm from MLS photos, agent notes, or drive-by before saving.
                </div>
              </div>
            )}

            {/* Comp Sale Transaction Section (Comp mode only) */}
            {entityType === 'comp' && (
              <div
                style={{
                  paddingBottom: '16px',
                  borderBottom: '1px solid rgba(52, 41, 42, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}
              >
                <span className="investor-section-header">SALE RECORD</span>

                <AddressAutocomplete
                  id="comp-drawer-address"
                  label="Address *"
                  value={saleFields.address}
                  onChange={(val) => {
                    setSaleFields((prev) => ({ ...prev, address: val, lat: null, lng: null }));
                    if (fieldErrors.address) {
                      setFieldErrors((prev) => {
                        const c = { ...prev };
                        delete c.address;
                        return c;
                      });
                    }
                  }}
                  onSelect={(details) => {
                    const nextCounty = details.parcel_county || details.county || saleFields.parcel_county || 'Broward';
                    const nextFolio = details.parcel_id || saleFields.parcel_id || null;
                    setSaleFields((prev) => ({
                      ...prev,
                      address: details.address,
                      city: details.city || prev.city,
                      zip: details.zip || prev.zip,
                      lat: details.lat,
                      lng: details.lng,
                      parcel_id: nextFolio,
                      parcel_county: nextCounty,
                      sqft: details.sqft != null ? String(details.sqft) : prev.sqft,
                      year_built: details.year_built != null ? String(details.year_built) : prev.year_built
                    }));
                    if (nextFolio) {
                      fetchSavedDetailsForFolio(nextCounty, nextFolio, saleFields.sold_date);
                    }
                  }}
                  error={fieldErrors.address}
                />

                <div className="investor-form-grid-2">
                  <div>
                    <label className="investor-form-label" htmlFor="comp-drawer-city">City</label>
                    <input
                      id="comp-drawer-city"
                      type="text"
                      value={saleFields.city}
                      onChange={(e) => setSaleFields((prev) => ({ ...prev, city: e.target.value }))}
                      placeholder="e.g. Fort Lauderdale"
                      className="investor-form-input"
                    />
                  </div>
                  <div>
                    <label className="investor-form-label" htmlFor="comp-drawer-zip">ZIP</label>
                    <input
                      id="comp-drawer-zip"
                      type="text"
                      inputMode="numeric"
                      value={saleFields.zip}
                      onChange={(e) => setSaleFields((prev) => ({ ...prev, zip: e.target.value }))}
                      placeholder="e.g. 33301"
                      className="investor-form-input"
                    />
                  </div>
                </div>

                <div className="investor-form-grid-2">
                  <div>
                    <label className="investor-form-label" htmlFor="comp-drawer-sold-date">Sold Date</label>
                    <input
                      id="comp-drawer-sold-date"
                      type="date"
                      value={saleFields.sold_date}
                      onChange={(e) => {
                        const nextDate = e.target.value;
                        setSaleFields((prev) => ({ ...prev, sold_date: nextDate }));
                        if (saleFields.parcel_id && !editingComp) {
                          fetchSavedDetailsForFolio(saleFields.parcel_county, saleFields.parcel_id, nextDate);
                        }
                      }}
                      className="investor-form-input"
                    />
                  </div>
                  <div>
                    <label className="investor-form-label" htmlFor="comp-drawer-sold-price">Sold Price</label>
                    <FormattedNumberInput
                      id="comp-drawer-sold-price"
                      value={saleFields.sold_price}
                      onChange={(val) => setSaleFields((prev) => ({ ...prev, sold_price: val }))}
                      prefix="$"
                      formatOnBlur={true}
                      placeholder="$0"
                      className="investor-form-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                  <div>
                    <label className="investor-form-label" htmlFor="comp-drawer-sqft">Living sqft</label>
                    <FormattedNumberInput
                      id="comp-drawer-sqft"
                      value={saleFields.sqft}
                      onChange={(val) => setSaleFields((prev) => ({ ...prev, sqft: val }))}
                      formatOnBlur={true}
                      placeholder="1,650"
                      className="investor-form-input"
                    />
                  </div>
                  <div>
                    <label className="investor-form-label" htmlFor="comp-drawer-lot-sqft">Lot sqft</label>
                    <FormattedNumberInput
                      id="comp-drawer-lot-sqft"
                      value={saleFields.lot_sqft}
                      onChange={(val) => setSaleFields((prev) => ({ ...prev, lot_sqft: val }))}
                      formatOnBlur={true}
                      placeholder="7,500"
                      className="investor-form-input"
                    />
                  </div>
                  <div>
                    <label className="investor-form-label" htmlFor="comp-drawer-year-built">Year Built</label>
                    <FormattedNumberInput
                      id="comp-drawer-year-built"
                      value={saleFields.year_built}
                      onChange={(val) => setSaleFields((prev) => ({ ...prev, year_built: val }))}
                      formatOnBlur={false}
                      placeholder="1985"
                      className="investor-form-input"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 1. BEDS & BATHS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span className="investor-section-header">BEDS &amp; BATHS</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                <div>
                  <label className="investor-form-label" htmlFor="detail-beds">Beds</label>
                  <FormattedNumberInput
                    id="detail-beds"
                    value={activeDetails.beds != null ? String(activeDetails.beds) : ''}
                    onChange={(val) => updateActiveDetails({ beds: val === '' ? null : val })}
                    allowDecimal={false}
                    formatOnBlur={false}
                    placeholder="e.g. 3"
                    className="investor-form-input"
                  />
                </div>
                <div>
                  <label className="investor-form-label" htmlFor="detail-full-baths">Full Baths</label>
                  <FormattedNumberInput
                    id="detail-full-baths"
                    value={activeDetails.full_baths != null ? String(activeDetails.full_baths) : ''}
                    onChange={(val) =>
                      updateActiveDetails({
                        full_baths: val === '' ? null : val,
                        half_baths: activeDetails.half_baths ?? 0
                      })
                    }
                    allowDecimal={false}
                    formatOnBlur={false}
                    placeholder="e.g. 2"
                    className="investor-form-input"
                  />
                </div>
                <div>
                  <label className="investor-form-label" htmlFor="detail-half-baths">Half Baths</label>
                  <FormattedNumberInput
                    id="detail-half-baths"
                    value={activeDetails.half_baths != null ? String(activeDetails.half_baths) : ''}
                    onChange={(val) =>
                      updateActiveDetails({
                        full_baths: activeDetails.full_baths ?? 0,
                        half_baths: val === '' ? 0 : val
                      })
                    }
                    allowDecimal={false}
                    formatOnBlur={false}
                    placeholder="0"
                    className="investor-form-input"
                  />
                </div>
              </div>
            </div>

            {/* 2. CONDITION (UAD C1–C6 + Quick Picks) & KITCHEN / BATHS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span className="investor-section-header" style={{ marginBottom: 0 }}>CONDITION &amp; INTERIOR</span>
                {hintSuggestedFields.condition && (
                  <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#34292A', backgroundColor: 'rgba(189, 211, 226, 0.45)', padding: '2px 8px', borderRadius: '999px' }}>
                    Suggested from county hint
                  </span>
                )}
              </div>

              <div>
                <label className="investor-form-label">Quick pick (maps to UAD)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {CONDITION_QUICK_PICKS.map((qp) => {
                    const active = activeDetails.condition === qp.id;
                    return (
                      <button
                        key={qp.id}
                        type="button"
                        onClick={() => updateActiveDetails({ condition: qp.id })}
                        style={{
                          flex: '1 1 140px',
                          padding: '9px 12px',
                          borderRadius: '12px',
                          border: active ? '1.5px solid #34292A' : '1px solid rgba(52, 41, 42, 0.18)',
                          backgroundColor: active ? '#34292A' : '#FFFFFF',
                          color: active ? '#FAF8F5' : '#34292A',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span>{qp.label}</span>
                        <span style={{ fontSize: '10.5px', opacity: active ? 0.85 : 0.6 }}>{qp.uad}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="investor-form-label">Full UAD rating (C1–C6)</label>
                <ChoiceChipGroup
                  options={UAD_CONDITION_OPTIONS.map((o) => ({
                    id: o.id,
                    label: o.uad ? o.uad : 'Unknown'
                  }))}
                  value={activeDetails.condition}
                  suggestedValue={hintSuggestedFields.condition || null}
                  onChange={(id) => updateActiveDetails({ condition: id })}
                />
                <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)', marginTop: '5px' }}>
                  {activeConditionOption.label} — {activeConditionOption.description}
                </div>
              </div>

              <div>
                <label className="investor-form-label">Kitchen &amp; baths updated</label>
                <SegmentedControl
                  size="sm"
                  options={[
                    { id: 'yes', label: 'Yes' },
                    { id: 'no', label: 'No' },
                    { id: 'unknown', label: 'Unknown' }
                  ]}
                  value={triBoolToSeg(activeDetails.kitchen_baths_updated)}
                  onChange={(seg) => updateActiveDetails({ kitchen_baths_updated: segToTriBool(seg) })}
                />
              </div>
            </div>

            {/* 3. ROOF & WINDOWS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span className="investor-section-header">ROOF &amp; STORM PROTECTION</span>

              <div className="investor-form-grid-2" style={{ alignItems: 'start' }}>
                <div>
                  <label className="investor-form-label">Roof type</label>
                  <ChoiceChipGroup
                    options={ROOF_TYPE_OPTIONS}
                    value={activeDetails.roof_type}
                    onChange={(id) => updateActiveDetails({ roof_type: id })}
                  />
                </div>
                <div>
                  <label className="investor-form-label" htmlFor="detail-roof-year">
                    Roof year (never inferred from year built)
                  </label>
                  <FormattedNumberInput
                    id="detail-roof-year"
                    value={activeDetails.roof_year != null ? String(activeDetails.roof_year) : ''}
                    onChange={(val) => updateActiveDetails({ roof_year: val === '' ? null : val })}
                    allowDecimal={false}
                    formatOnBlur={false}
                    placeholder="Unknown — e.g. 2021"
                    className="investor-form-input"
                  />
                </div>
              </div>

              <div>
                <label className="investor-form-label">Windows &amp; openings</label>
                <SegmentedControl
                  size="sm"
                  options={WINDOW_OPTIONS}
                  value={activeDetails.windows}
                  onChange={(id) => updateActiveDetails({ windows: id })}
                />
              </div>
            </div>

            {/* 4. POOL, GARAGE & WATERFRONT / VIEW */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <span className="investor-section-header">SITE, POOL, GARAGE &amp; VIEW</span>

              <div className="investor-form-grid-2" style={{ alignItems: 'start' }}>
                <div>
                  <label className="investor-form-label">
                    Pool {hintSuggestedFields.pool_type ? '(Suggested from county hint)' : ''}
                  </label>
                  <SegmentedControl
                    size="sm"
                    options={POOL_OPTIONS}
                    value={activeDetails.pool_type}
                    onChange={(id) => updateActiveDetails({ pool_type: id })}
                  />
                </div>
                <div>
                  <label className="investor-form-label">Screen enclosure</label>
                  <SegmentedControl
                    size="sm"
                    options={[
                      { id: 'yes', label: 'Yes' },
                      { id: 'no', label: 'No' },
                      { id: 'unknown', label: 'Unknown' }
                    ]}
                    value={triBoolToSeg(activeDetails.screen_enclosure)}
                    onChange={(seg) => updateActiveDetails({ screen_enclosure: segToTriBool(seg) })}
                  />
                </div>
              </div>

              <div>
                <label className="investor-form-label">Garage / parking</label>
                <ChoiceChipGroup
                  options={GARAGE_OPTIONS}
                  value={garageToOptionId(activeDetails)}
                  onChange={(optId) => updateActiveDetails(optionIdToGarageFields(optId))}
                />
              </div>

              <div>
                <label className="investor-form-label">Waterfront &amp; view</label>
                <ChoiceChipGroup
                  options={WATERFRONT_VIEW_OPTIONS}
                  value={activeDetails.waterfront_view}
                  onChange={(id) => updateActiveDetails({ waterfront_view: id })}
                />
              </div>
            </div>

            {/* 5. VERIFICATION, SOURCE & NOTES */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span className="investor-section-header">VERIFICATION &amp; NOTES</span>

              <div className="investor-form-grid-2" style={{ alignItems: 'start' }}>
                <div>
                  <label className="investor-form-label">Source</label>
                  <ChoiceChipGroup
                    options={DETAIL_SOURCE_OPTIONS}
                    value={activeDetails.source || 'MLS'}
                    onChange={(id) => updateActiveDetails({ source: id })}
                  />
                </div>
                <div>
                  <label className="investor-form-label">Verified</label>
                  <SegmentedControl
                    size="sm"
                    options={[
                      { id: 'yes', label: 'Yes · Verified' },
                      { id: 'no', label: 'No' }
                    ]}
                    value={activeDetails.verified ? 'yes' : 'no'}
                    onChange={(seg) => updateActiveDetails({ verified: seg === 'yes' })}
                  />
                </div>
              </div>

              <div>
                <label className="investor-form-label" htmlFor="detail-notes">Notes</label>
                <textarea
                  id="detail-notes"
                  rows={2}
                  value={activeDetails.notes || ''}
                  onChange={(e) => updateActiveDetails({ notes: e.target.value })}
                  placeholder="Permit history, listing photo observations, kitchen/bath finish quality..."
                  className="investor-form-textarea"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '18px 28px',
              borderTop: '1px solid rgba(52, 41, 42, 0.1)',
              backgroundColor: '#FAF8F5'
            }}
          >
            {entityType === 'comp' && isDeleteConfirming ? (
              <div
                style={{
                  backgroundColor: 'rgba(65, 16, 27, 0.06)',
                  border: '1px solid rgba(65, 16, 27, 0.25)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}
              >
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#41101B' }}>
                  Remove this comp from this property?
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    variant="secondary"
                    onClick={() => setIsDeleteConfirming(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={onDeleteComp}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Deleting…' : 'Delete comp'}
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                {entityType === 'comp' && editingComp ? (
                  <button
                    type="button"
                    onClick={() => setIsDeleteConfirming(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#41101B',
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '12px',
                      fontWeight: 600,
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      padding: '4px 0'
                    }}
                  >
                    Delete comp
                  </button>
                ) : (
                  <div />
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <Button
                    variant="secondary"
                    onClick={onClose}
                    disabled={isSaving || isDeleting}
                  >
                    CANCEL
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={isSaving || isDeleting}
                  >
                    {isSaving
                      ? 'Saving…'
                      : entityType === 'subject'
                        ? 'SAVE SUBJECT DETAILS'
                        : 'SAVE COMP DETAILS'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

