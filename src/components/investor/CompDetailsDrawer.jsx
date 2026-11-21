import React, { useState, useEffect, useMemo } from 'react';
import { Button, Pill, SegmentedControl } from '../ui';
import AddressAutocomplete from './AddressAutocomplete.jsx';
import FormattedNumberInput from './FormattedNumberInput.jsx';
import {
  CONDITION_QUICK_PICKS,
  UAD_CONDITION_OPTIONS,
  UAD_QUALITY_OPTIONS,
  ROOF_TYPE_OPTIONS,
  CONSTRUCTION_TYPE_OPTIONS,
  WINDOW_OPTIONS,
  POOL_OPTIONS,
  GARAGE_OPTIONS,
  WATERFRONT_VIEW_OPTIONS,
  DETAIL_SOURCE_OPTIONS,
  FIELD_ORIGIN_LABELS,
  buildSaleMonthKey,
  normalizeCompDetails,
  mergeDetailsWithCountyBuilding,
  buildingRecordToCountyDefaults,
  detailsToLegacyColumns,
  computeDetailsProgress,
  formatCountyClues,
  buildCountyHintSuggestions,
  resolveSubjectDetailsForMode,
  formatQualityWithRawCode,
  buildCountyCodeTooltip
} from './compDetailsModel.js';
import { parseListingDetailsText } from '../../utils/listingDetailsParser.js';

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

function parseCompleteRoofYear(raw) {
  const cleaned = raw == null ? '' : String(raw).trim();
  if (cleaned === '') {
    return { isEmpty: true, valid: true, value: null };
  }
  if (!/^\d{4}$/.test(cleaned)) {
    return { isEmpty: false, valid: false, value: null };
  }
  const num = Number(cleaned);
  const maxYear = new Date().getFullYear() + 1;
  if (!Number.isFinite(num) || num < 1900 || num > maxYear) {
    return { isEmpty: false, valid: false, value: null };
  }
  return { isEmpty: false, valid: true, value: num };
}

function FieldOriginBadge({ origin, tooltip = null }) {
  if (!origin || !FIELD_ORIGIN_LABELS[origin]) return null;
  const label = FIELD_ORIGIN_LABELS[origin];
  const isCounty = origin === 'county_record';
  const isDefault = origin === 'county_default';
  return (
    <span
      title={tooltip || (isDefault ? 'County mass-appraisal default — ignored in grid adjustments until you confirm' : undefined)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 7px',
        borderRadius: '999px',
        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
        fontSize: '9.5px',
        fontWeight: 700,
        letterSpacing: '0.02em',
        marginLeft: '6px',
        verticalAlign: 'middle',
        backgroundColor: isCounty
          ? 'rgba(189, 211, 226, 0.55)'
          : isDefault
            ? 'rgba(52, 41, 42, 0.06)'
            : 'rgba(52, 41, 42, 0.1)',
        border: isCounty
          ? '1px solid #859DCE'
          : isDefault
            ? '1px dashed rgba(52, 41, 42, 0.35)'
            : '1px solid rgba(52, 41, 42, 0.28)',
        color: '#34292A'
      }}
    >
      {label}
    </span>
  );
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
  hasRenovationBudget = false,
  onClose,
  onSaveComp,
  onDeleteComp,
  onSaveSubjectDetails,
  isSaving = false,
  isDeleting = false
}) {
  const [subjectTab, setSubjectTab] = useState(
    hasRenovationBudget && initialSubjectMode === 'after_rehab' ? 'after_rehab' : 'as_is'
  );
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
  const [roofYearInput, setRoofYearInput] = useState({
    comp: '',
    as_is: '',
    after_rehab: ''
  });
  const [hintSuggestedFields, setHintSuggestedFields] = useState({});
  const [fieldOriginsMap, setFieldOriginsMap] = useState({
    comp: {},
    as_is: {},
    after_rehab: {}
  });
  const [manualFieldsMap, setManualFieldsMap] = useState({
    comp: {},
    as_is: {},
    after_rehab: {}
  });

  // "Paste listing details" parser box state
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [pasteRawText, setPasteRawText] = useState('');
  const [parsedPreview, setParsedPreview] = useState(null); // { items: [...] }
  const [selectedParsedIds, setSelectedParsedIds] = useState({});
  const [pasteAppliedBanner, setPasteAppliedBanner] = useState('');
  const [parsedSubjectExtras, setParsedSubjectExtras] = useState(null);

  // Active county CAMA building_characteristics record (Palm Beach PAS405E, etc.)
  const activeBuildingRecord = useMemo(() => {
    if (entityType === 'subject') {
      return subjectProperty?.building_characteristics || subjectCountyData?.building_characteristics || null;
    }
    return editingComp?.building_characteristics || null;
  }, [entityType, subjectProperty, subjectCountyData, editingComp]);

  const activeCountyMeta = useMemo(
    () => buildingRecordToCountyDefaults(activeBuildingRecord).meta,
    [activeBuildingRecord]
  );

  // County clues for active entity
  const activeClues = useMemo(() => {
    if (entityType === 'subject') {
      return formatCountyClues({
        ...(subjectProperty || {}),
        ...(subjectCountyData || {}),
        year_built: subjectProperty?.year_built ?? subjectCountyData?.year_built ?? activeBuildingRecord?.year_built ?? null,
        eff_year_built: subjectCountyData?.eff_year_built ?? subjectProperty?.eff_year_built ?? activeBuildingRecord?.effective_year_built ?? null,
        spec_feat_val: subjectCountyData?.spec_feat_val ?? null,
        units: subjectCountyData?.units ?? subjectProperty?.units ?? null,
        imp_qual: subjectCountyData?.imp_qual ?? null,
        const_class: subjectCountyData?.const_class ?? subjectProperty?.const_class ?? null
      });
    }
    if (editingComp?.county_clues) {
      return editingComp.county_clues;
    }
    return formatCountyClues(editingComp || saleFields);
  }, [entityType, subjectProperty, subjectCountyData, editingComp, saleFields, activeBuildingRecord]);

  // Initialize form whenever drawer opens or target changes
  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    setFieldErrors({});
    setIsDeleteConfirming(false);
    setIsPasteOpen(false);
    setPasteRawText('');
    setParsedPreview(null);
    setSelectedParsedIds({});
    setPasteAppliedBanner('');
    setParsedSubjectExtras(null);

    if (entityType === 'subject' && subjectProperty) {
      const nextMode = hasRenovationBudget && initialSubjectMode === 'after_rehab' ? 'after_rehab' : 'as_is';
      setSubjectTab(nextMode);
      const subjectWithBc = {
        ...subjectProperty,
        building_characteristics:
          subjectProperty.building_characteristics || subjectCountyData?.building_characteristics || null
      };
      const baseAsIs = resolveSubjectDetailsForMode(subjectWithBc, 'as_is');
      const baseAfterRehab = resolveSubjectDetailsForMode(subjectWithBc, 'arv');
      setSubjectDetailsMap({
        as_is: baseAsIs,
        after_rehab: baseAfterRehab
      });
      setFieldOriginsMap({
        comp: {},
        as_is: baseAsIs.field_origins || {},
        after_rehab: baseAfterRehab.field_origins || {}
      });
      const asIsManual = Object.fromEntries(
        Object.entries(baseAsIs.field_origins || {})
          .filter(([, origin]) => origin === 'my_edit')
          .map(([k]) => [k, true])
      );
      const arvManual = Object.fromEntries(
        Object.entries(baseAfterRehab.field_origins || {})
          .filter(([, origin]) => origin === 'my_edit')
          .map(([k]) => [k, true])
      );
      setManualFieldsMap({
        comp: {},
        as_is: { ...(baseAsIs.manual_fields || {}), ...asIsManual },
        after_rehab: { ...(baseAfterRehab.manual_fields || {}), ...arvManual }
      });
      setRoofYearInput({
        comp: '',
        as_is: baseAsIs.roof_year != null ? String(baseAsIs.roof_year) : '',
        after_rehab: baseAfterRehab.roof_year != null ? String(baseAfterRehab.roof_year) : ''
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
      const mergedComp = editingComp.building_characteristics
        ? mergeDetailsWithCountyBuilding(baseNorm, editingComp.building_characteristics)
        : {
            details: baseNorm,
            field_origins: editingComp.field_origins || {}
          };
      const clues = editingComp.county_clues || formatCountyClues(editingComp);
      // Only suggest DOR hints when CAMA building_characteristics hasn't already filled a field
      const { suggestions } = editingComp.building_characteristics
        ? { suggestions: {} }
        : buildCountyHintSuggestions(mergedComp.details, clues);
      const initialCompNorm = Object.keys(suggestions).length > 0
        ? normalizeCompDetails({ ...mergedComp.details, ...suggestions })
        : mergedComp.details;

      const compOrigins = mergedComp.field_origins || {};
      const compManual = Object.fromEntries(
        Object.entries(compOrigins)
          .filter(([, origin]) => origin === 'my_edit')
          .map(([k]) => [k, true])
      );

      setCompDetails(initialCompNorm);
      setFieldOriginsMap({ comp: compOrigins, as_is: {}, after_rehab: {} });
      setManualFieldsMap({
        comp: { ...(baseNorm.manual_fields || {}), ...compManual },
        as_is: {},
        after_rehab: {}
      });
      setRoofYearInput({
        comp: initialCompNorm.roof_year != null ? String(initialCompNorm.roof_year) : '',
        as_is: '',
        after_rehab: ''
      });
      setHintSuggestedFields(Object.keys(suggestions).length > 0 ? suggestions : {});
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
      setFieldOriginsMap({ comp: {}, as_is: {}, after_rehab: {} });
      setManualFieldsMap({ comp: {}, as_is: {}, after_rehab: {} });
      setRoofYearInput({ comp: '', as_is: '', after_rehab: '' });
      setHintSuggestedFields({});
    }
  }, [isOpen, entityType, editingComp, subjectProperty, subjectCountyData, initialSubjectMode, hasRenovationBudget]);

  if (!isOpen) return null;

  const activeSlot = entityType === 'subject' ? subjectTab : 'comp';
  const activeDetails = entityType === 'subject' ? subjectDetailsMap[subjectTab] : compDetails;
  const activeOrigins = fieldOriginsMap[activeSlot] || {};
  const activeRoofYearInput = roofYearInput[activeSlot] ?? '';

  const mapPatchKeysToOriginKeys = (patch) => {
    const out = [];
    for (const k of Object.keys(patch || {})) {
      if (k === 'full_baths' || k === 'half_baths' || k === 'baths') out.push('baths');
      else if (k === 'garage_type' || k === 'garage_bays') out.push('garage');
      else if (
        [
          'beds', 'condition', 'quality', 'eff_year_built', 'kitchen_baths_updated',
          'construction_type', 'construction_detail', 'roof_type', 'roof_year',
          'windows', 'pool_type', 'screen_enclosure', 'waterfront_view',
          'boat_dock', 'boat_dock_sqft', 'boat_lift', 'hoa_name'
        ].includes(k)
      ) {
        out.push(k);
      }
    }
    return [...new Set(out)];
  };

  const handleRoofYearChange = (rawVal) => {
    const trimmed = String(rawVal ?? '').slice(0, 4);
    setRoofYearInput((prev) => ({
      ...prev,
      [activeSlot]: trimmed
    }));
    const parsed = parseCompleteRoofYear(trimmed);
    if (parsed.valid && fieldErrors.roof_year) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.roof_year;
        return next;
      });
    }
    updateActiveDetails({ roof_year: parsed.valid ? parsed.value : null });
  };

  const updateActiveDetails = (patch) => {
    // Clear county hint highlight for fields the user explicitly interacts with
    setHintSuggestedFields((prev) => {
      const next = { ...prev };
      Object.keys(patch).forEach((k) => {
        delete next[k];
      });
      return next;
    });

    // Mark edited fields as 'my_edit' so manual edits always win over county data
    const touchedOriginKeys = mapPatchKeysToOriginKeys(patch);
    if (touchedOriginKeys.length > 0) {
      setManualFieldsMap((prev) => {
        const nextSlot = { ...(prev[activeSlot] || {}) };
        touchedOriginKeys.forEach((k) => {
          nextSlot[k] = true;
        });
        return { ...prev, [activeSlot]: nextSlot };
      });
      setFieldOriginsMap((prev) => {
        const nextSlot = { ...(prev[activeSlot] || {}) };
        touchedOriginKeys.forEach((k) => {
          if (k === 'condition' && patch.condition === 'unknown' && activeCountyMeta?.condition_is_default) {
            nextSlot[k] = 'county_default';
          } else {
            nextSlot[k] = 'my_edit';
          }
        });
        return { ...prev, [activeSlot]: nextSlot };
      });
    }

    if (entityType === 'subject') {
      setSubjectDetailsMap((prev) => {
        const nextTab = normalizeCompDetails({
          ...prev[subjectTab],
          ...patch
        });
        const otherTabKey = subjectTab === 'as_is' ? 'after_rehab' : 'as_is';
        const sharedPatch = {};
        if (patch.hoa_name !== undefined) sharedPatch.hoa_name = patch.hoa_name;
        if (
          patch.construction_type !== undefined &&
          (!prev[otherTabKey]?.construction_type || prev[otherTabKey].construction_type === 'unknown')
        ) {
          sharedPatch.construction_type = patch.construction_type;
        }
        if (
          patch.quality !== undefined &&
          (!prev[otherTabKey]?.quality || prev[otherTabKey].quality === 'unknown')
        ) {
          sharedPatch.quality = patch.quality;
        }
        const nextOther =
          Object.keys(sharedPatch).length > 0
            ? normalizeCompDetails({ ...prev[otherTabKey], ...sharedPatch })
            : prev[otherTabKey];
        return {
          ...prev,
          [subjectTab]: nextTab,
          [otherTabKey]: nextOther
        };
      });
    } else {
      setCompDetails((prev) =>
        normalizeCompDetails({
          ...prev,
          ...patch
        })
      );
    }
  };

  const handleParseListingText = () => {
    const parsed = parseListingDetailsText(pasteRawText);
    setParsedPreview(parsed);
    const nextSel = {};
    parsed.items.forEach((it) => {
      nextSel[it.id] = true;
    });
    setSelectedParsedIds(nextSel);
    setPasteAppliedBanner('');
  };

  const handleApplyParsedListing = () => {
    if (!parsedPreview?.items?.length) return;
    const chosen = parsedPreview.items.filter((it) => selectedParsedIds[it.id]);
    if (chosen.length === 0) return;

    const combinedDetailPatch = {};
    const combinedSalePatch = {};
    for (const item of chosen) {
      if (item.patch) Object.assign(combinedDetailPatch, item.patch);
      if (item.salePatch) Object.assign(combinedSalePatch, item.salePatch);
    }

    if (Object.keys(combinedDetailPatch).length > 0) {
      updateActiveDetails(combinedDetailPatch);
      if (combinedDetailPatch.roof_year != null) {
        setRoofYearInput((prev) => ({
          ...prev,
          [activeSlot]: String(combinedDetailPatch.roof_year)
        }));
      }
    }

    if (entityType === 'comp' && Object.keys(combinedSalePatch).length > 0) {
      setSaleFields((prev) => ({
        ...prev,
        ...(combinedSalePatch.sqft != null ? { sqft: String(combinedSalePatch.sqft) } : {}),
        ...(combinedSalePatch.lot_sqft != null ? { lot_sqft: String(combinedSalePatch.lot_sqft) } : {}),
        ...(combinedSalePatch.year_built != null ? { year_built: String(combinedSalePatch.year_built) } : {})
      }));
      // Preserve HOA fee note on comp notes if extracted
      if (combinedSalePatch.hoa_monthly != null) {
        const hoaNote = combinedSalePatch.hoa_monthly === 0
          ? 'No HOA'
          : `HOA $${combinedSalePatch.hoa_monthly.toLocaleString('en-US')}/mo`;
        const curNotes = activeDetails.notes || '';
        if (!curNotes.toLowerCase().includes('hoa')) {
          updateActiveDetails({ notes: [curNotes, hoaNote].filter(Boolean).join(' · ') });
        }
      }
    } else if (entityType === 'subject' && Object.keys(combinedSalePatch).length > 0) {
      setParsedSubjectExtras((prev) => ({
        ...(prev || {}),
        ...combinedSalePatch
      }));
    }

    setPasteAppliedBanner(
      `Applied ${chosen.length} parsed ${chosen.length === 1 ? 'field' : 'fields'} as my edit — review below and click Save.`
    );
    setParsedPreview(null);
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
    if (hintSuggestedFields.quality) resetPatch.quality = 'unknown';
    if (hintSuggestedFields.pool_type) resetPatch.pool_type = 'unknown';
    if (hintSuggestedFields.construction_type) resetPatch.construction_type = 'unknown';
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
    setRoofYearInput((prev) => ({
      ...prev,
      after_rehab: prev.as_is
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
        const savedNorm = normalizeCompDetails(saved);
        setCompDetails(savedNorm);
        setRoofYearInput((prev) => ({
          ...prev,
          comp: savedNorm.roof_year != null ? String(savedNorm.roof_year) : ''
        }));
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
      const asIsRoof = parseCompleteRoofYear(roofYearInput.as_is);
      const afterRehabRoof = parseCompleteRoofYear(roofYearInput.after_rehab);
      if (!asIsRoof.valid || !afterRehabRoof.valid) {
        if (!asIsRoof.valid && subjectTab !== 'as_is') setSubjectTab('as_is');
        else if (!afterRehabRoof.valid && subjectTab !== 'after_rehab') setSubjectTab('after_rehab');
        const msg = `Enter a 4-digit roof year between 1900 and ${new Date().getFullYear() + 1}, or leave blank if unknown.`;
        setFieldErrors({ roof_year: msg });
        setFormError(msg);
        return;
      }
      if (!onSaveSubjectDetails) return;
      try {
        const nextSubjectDetailsPayload = {
          as_is: {
            ...subjectDetailsMap.as_is,
            manual_fields: manualFieldsMap.as_is || {}
          },
          after_rehab: {
            ...subjectDetailsMap.after_rehab,
            manual_fields: manualFieldsMap.after_rehab || {}
          }
        };
        await onSaveSubjectDetails(nextSubjectDetailsPayload, parsedSubjectExtras);
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

    const compRoofCheck = parseCompleteRoofYear(roofYearInput.comp);
    if (!compRoofCheck.valid) {
      const msg = `Enter a 4-digit roof year between 1900 and ${new Date().getFullYear() + 1}, or leave blank if unknown.`;
      setFieldErrors({ roof_year: msg });
      setFormError(msg);
      return;
    }

    const compDetailsWithManual = {
      ...compDetails,
      manual_fields: manualFieldsMap.comp || {}
    };
    const legacy = detailsToLegacyColumns(compDetailsWithManual);
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
      quality: legacy.quality,
      pool: legacy.pool,
      garage: legacy.garage,
      waterfront: legacy.waterfront,
      boat_dock: legacy.boat_dock,
      boat_dock_sqft: legacy.boat_dock_sqft,
      boat_lift: legacy.boat_lift,
      construction_type: legacy.construction_type,
      hoa_name: legacy.hoa_name,
      notes: compDetails.notes ? compDetails.notes.trim() : null,
      source: compDetails.source || editingComp?.source || 'MLS',
      comp_details_json: compDetailsWithManual,
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

  const activeSubdivisionName =
    entityType === 'subject'
      ? (subjectProperty?.subdivision_name || subjectCountyData?.subdivision_name || null)
      : (editingComp?.subdivision_name || null);
  const activeNbrhdCd =
    entityType === 'subject'
      ? (subjectProperty?.nbrhd_cd || subjectCountyData?.nbrhd_cd || null)
      : (editingComp?.nbrhd_cd || null);

  const activeConditionOption =
    UAD_CONDITION_OPTIONS.find((o) => o.id === activeDetails.condition) || UAD_CONDITION_OPTIONS[6];
  const activeQualityOption =
    UAD_QUALITY_OPTIONS.find((o) => o.id === activeDetails.quality) || UAD_QUALITY_OPTIONS[6];

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
              {(saleMonthBadge || activeSubdivisionName || activeNbrhdCd || activeDetails.hoa_name) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {activeSubdivisionName && (
                    <span
                      title={activeNbrhdCd ? `County subdivision · Nbrhd ${activeNbrhdCd}` : 'County subdivision'}
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        padding: '2px 9px',
                        borderRadius: '999px',
                        backgroundColor: 'rgba(189, 211, 226, 0.45)',
                        border: '1px solid #859DCE',
                        color: '#34292A'
                      }}
                    >
                      {activeSubdivisionName}
                    </span>
                  )}
                  {activeNbrhdCd && (
                    <span
                      title="County Property Appraiser neighborhood code (NBRHD_CD)"
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 600,
                        padding: '2px 9px',
                        borderRadius: '999px',
                        backgroundColor: 'rgba(189, 211, 226, 0.25)',
                        border: '1px solid rgba(133, 157, 206, 0.5)',
                        color: '#34292A'
                      }}
                    >
                      Nbrhd {activeNbrhdCd}
                    </span>
                  )}
                  {activeDetails.hoa_name && (
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 600,
                        padding: '2px 9px',
                        borderRadius: '999px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid rgba(52, 41, 42, 0.2)',
                        color: '#34292A'
                      }}
                    >
                      HOA: {activeDetails.hoa_name}
                    </span>
                  )}
                  {saleMonthBadge && (
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
                  )}
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

          {/* Progress Bar: Details: X of 10 filled */}
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '5px' }}>
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
              {progress.missingLabels.length > 0 && (
                <span style={{ fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.58)' }}>
                  Missing:{' '}
                  {progress.missingLabels.length <= 4
                    ? progress.missingLabels.join(', ')
                    : `${progress.missingLabels.slice(0, 3).join(', ')} +${progress.missingLabels.length - 3} more`}
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

          {/* Subject Mode Switcher: As-is vs After-rehab (ARV only shown when renovation budget entered) */}
          {entityType === 'subject' && hasRenovationBudget && (
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
                  { id: 'as_is', label: 'Current (As-is)' },
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

            {/* Paste Listing Details Parser (MLS / Realtor / Zillow) */}
            <div
              style={{
                backgroundColor: '#FAF8F5',
                border: '1px solid rgba(52, 41, 42, 0.14)',
                borderRadius: '14px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div>
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#34292A'
                    }}
                  >
                    PASTE LISTING DETAILS
                  </span>
                  <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                    Parse MLS / Realtor / Zillow text into fields for confirmation
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsPasteOpen((prev) => !prev);
                    setPasteAppliedBanner('');
                  }}
                  style={{
                    background: isPasteOpen ? '#34292A' : '#FFFFFF',
                    color: isPasteOpen ? '#FAF8F5' : '#34292A',
                    border: '1px solid rgba(52, 41, 42, 0.25)',
                    borderRadius: '999px',
                    padding: '4px 11px',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {isPasteOpen ? 'Hide' : 'Paste listing text'}
                </button>
              </div>

              {pasteAppliedBanner && (
                <div
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: '#3F5A3A',
                    backgroundColor: '#EEF2EA',
                    border: '1px solid rgba(63, 90, 58, 0.25)',
                    borderRadius: '8px',
                    padding: '7px 10px'
                  }}
                >
                  {pasteAppliedBanner}
                </div>
              )}

              {isPasteOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <textarea
                    rows={4}
                    value={pasteRawText}
                    onChange={(e) => setPasteRawText(e.target.value)}
                    placeholder="Paste MLS / Realtor.com / Zillow blurb (e.g. 4 beds, 3.5 baths, 3,155 sq ft, Built 1988, CBS, 2022 concrete tile roof, full impact glass, heated saltwater pool, ocean access, 16k lb boat lift, HOA $350/mo)..."
                    className="investor-form-textarea"
                    style={{ fontSize: '12px', backgroundColor: '#FFFFFF' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.6)' }}>
                      Nothing is applied until you confirm the parsed fields below.
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {pasteRawText && (
                        <button
                          type="button"
                          onClick={() => {
                            setPasteRawText('');
                            setParsedPreview(null);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'rgba(52, 41, 42, 0.6)',
                            cursor: 'pointer'
                          }}
                        >
                          Clear
                        </button>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleParseListingText}
                        disabled={!pasteRawText.trim()}
                      >
                        Parse details
                      </Button>
                    </div>
                  </div>

                  {parsedPreview && (
                    <div
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #859DCE',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      {parsedPreview.items.length === 0 ? (
                        <div style={{ fontSize: '11.5px', color: 'rgba(52, 41, 42, 0.7)' }}>
                          No recognizable property fields found in that text. Try pasting specs like beds, baths, sqft, roof, impact glass, pool, or HOA.
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#34292A' }}>
                              Confirm parsed fields ({Object.values(selectedParsedIds).filter(Boolean).length} of {parsedPreview.items.length} selected)
                            </span>
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={handleApplyParsedListing}
                              disabled={Object.values(selectedParsedIds).filter(Boolean).length === 0}
                            >
                              Apply selected
                            </Button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '190px', overflowY: 'auto' }}>
                            {parsedPreview.items.map((item) => {
                              const checked = Boolean(selectedParsedIds[item.id]);
                              return (
                                <label
                                  key={item.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '8px',
                                    padding: '5px 8px',
                                    borderRadius: '8px',
                                    backgroundColor: checked ? 'rgba(189, 211, 226, 0.24)' : '#FAF8F5',
                                    cursor: 'pointer',
                                    fontSize: '11.5px'
                                  }}
                                >
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: '#34292A' }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) =>
                                        setSelectedParsedIds((prev) => ({
                                          ...prev,
                                          [item.id]: e.target.checked
                                        }))
                                      }
                                    />
                                    <strong>{item.label}:</strong> {item.displayValue}
                                  </span>
                                  <span style={{ fontSize: '10px', color: 'rgba(52, 41, 42, 0.55)', whiteSpace: 'nowrap' }}>
                                    &ldquo;{item.snippet}&rdquo;
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* County CAMA Building Record Banner (auto-filled fields — manual edits always win) */}
            {activeCountyMeta && (
              <div
                style={{
                  backgroundColor: 'rgba(189, 211, 226, 0.25)',
                  border: '1px solid #859DCE',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px'
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
                    COUNTY BUILDING RECORD · {activeCountyMeta.roll_year || 2026} CAMA ROLL
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(52, 41, 42, 0.68)' }}>
                    Auto-filled · your edits always win
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {activeCountyMeta.living_area_sqft != null && (
                    <Pill variant="neutral" size="sm">
                      Living {activeCountyMeta.living_area_sqft.toLocaleString()} sf
                      {activeCountyMeta.total_area_sqft && activeCountyMeta.total_area_sqft > activeCountyMeta.living_area_sqft
                        ? ` · Total ${activeCountyMeta.total_area_sqft.toLocaleString()} sf`
                        : ''}
                    </Pill>
                  )}
                  {activeCountyMeta.stories != null && (
                    <Pill variant="neutral" size="sm">
                      {activeCountyMeta.stories} {activeCountyMeta.stories === 1 ? 'story' : 'stories'}
                    </Pill>
                  )}
                  {activeCountyMeta.raw_quality_code && (
                    <Pill
                      variant="info"
                      size="sm"
                      title={buildCountyCodeTooltip({
                        label: 'County grade',
                        rawCode: activeCountyMeta.raw_quality_code,
                        rawDesc: activeCountyMeta.raw_quality_desc,
                        origin: activeOrigins.quality,
                        rollYear: activeCountyMeta.roll_year
                      })}
                    >
                      Grade {activeCountyMeta.raw_quality_code}
                      {activeCountyMeta.county_quality_uad ? ` → ${activeCountyMeta.county_quality_uad.toUpperCase()}` : ''}
                    </Pill>
                  )}
                  {activeCountyMeta.raw_condition_code && (
                    <Pill
                      variant="neutral"
                      size="sm"
                      title={buildCountyCodeTooltip({
                        label: 'County condition',
                        rawCode: activeCountyMeta.raw_condition_code,
                        rawDesc: activeCountyMeta.raw_condition_desc,
                        origin: activeOrigins.condition,
                        rollYear: activeCountyMeta.roll_year,
                        isDefaultCondition: activeCountyMeta.condition_is_default
                      })}
                    >
                      Cond {activeCountyMeta.raw_condition_code}
                      {activeCountyMeta.condition_is_default ? ' · county default (not inspected)' : ''}
                    </Pill>
                  )}
                  {activeCountyMeta.roof_structure_desc && (
                    <Pill variant="neutral" size="sm">
                      Roof struct: {activeCountyMeta.roof_structure_desc}
                    </Pill>
                  )}
                  {activeCountyMeta.pool_year && (
                    <Pill variant="neutral" size="sm">
                      Pool built {activeCountyMeta.pool_year}
                    </Pill>
                  )}
                  {activeCountyMeta.screen_enclosure_sqft && (
                    <Pill variant="neutral" size="sm">
                      Screen {activeCountyMeta.screen_enclosure_sqft.toLocaleString()} sf
                    </Pill>
                  )}
                  {activeCountyMeta.fireplaces > 0 && (
                    <Pill variant="neutral" size="sm">
                      {activeCountyMeta.fireplaces} {activeCountyMeta.fireplaces === 1 ? 'fireplace' : 'fireplaces'}
                    </Pill>
                  )}
                  {activeCountyMeta.condo_model_desc && (
                    <Pill variant="neutral" size="sm">
                      Model: {activeCountyMeta.condo_model_desc}
                    </Pill>
                  )}
                </div>
              </div>
            )}

            {/* County Clues Banner (DOR NAL hints — shown when no CAMA building record exists) */}
            {activeClues.hasAnyClue && !activeCountyMeta && (
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
                  <label className="investor-form-label" htmlFor="detail-beds">
                    Beds
                    <FieldOriginBadge origin={activeOrigins.beds} />
                  </label>
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
                  <label className="investor-form-label" htmlFor="detail-full-baths">
                    Full Baths
                    <FieldOriginBadge origin={activeOrigins.baths} />
                  </label>
                  <FormattedNumberInput
                    id="detail-full-baths"
                    value={activeDetails.full_baths != null ? String(activeDetails.full_baths) : ''}
                    onChange={(val) => {
                      if (val === '') {
                        const hasHalf = activeDetails.half_baths != null && activeDetails.half_baths > 0;
                        updateActiveDetails(
                          hasHalf
                            ? { full_baths: 0, half_baths: activeDetails.half_baths, baths: null }
                            : { full_baths: null, half_baths: null, baths: null }
                        );
                      } else {
                        updateActiveDetails({
                          full_baths: val,
                          half_baths: activeDetails.half_baths ?? 0,
                          baths: null
                        });
                      }
                    }}
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
                    onChange={(val) => {
                      if (val === '') {
                        updateActiveDetails(
                          activeDetails.full_baths == null
                            ? { full_baths: null, half_baths: null, baths: null }
                            : { full_baths: activeDetails.full_baths, half_baths: 0, baths: null }
                        );
                      } else {
                        updateActiveDetails({
                          full_baths: activeDetails.full_baths ?? 0,
                          half_baths: val,
                          baths: null
                        });
                      }
                    }}
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
                <label className="investor-form-label">
                  Full UAD rating (C1–C6)
                  <FieldOriginBadge
                    origin={activeOrigins.condition}
                    tooltip={buildCountyCodeTooltip({
                      label: 'County condition',
                      rawCode: activeCountyMeta?.raw_condition_code,
                      rawDesc: activeCountyMeta?.raw_condition_desc,
                      origin: activeOrigins.condition,
                      rollYear: activeCountyMeta?.roll_year,
                      isDefaultCondition: Boolean(activeCountyMeta?.condition_is_default && activeDetails.condition === 'unknown')
                    })}
                  />
                </label>
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
                {activeCountyMeta?.condition_is_default && activeDetails.condition === 'unknown' && (
                  <div
                    style={{
                      marginTop: '6px',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      backgroundColor: '#FAF8F5',
                      border: '1px dashed rgba(52, 41, 42, 0.28)',
                      fontSize: '11px',
                      color: '#34292A',
                      lineHeight: 1.4
                    }}
                  >
                    County roll lists <strong>{activeCountyMeta.raw_condition_code}</strong> ({activeCountyMeta.raw_condition_desc || 'AVERAGE'}) — <strong>county default (not inspected)</strong> on ~99% of Palm Beach parcels. Ignored in grid condition adjustments until you confirm a rating above.
                  </div>
                )}
              </div>

              <div>
                <label className="investor-form-label">
                  Quality (UAD Q1–Q6) {hintSuggestedFields.quality ? '(Suggested from county hint)' : ''}
                  {activeCountyMeta?.raw_quality_code && (
                    <span
                      title={buildCountyCodeTooltip({
                        label: 'County grade',
                        rawCode: activeCountyMeta.raw_quality_code,
                        rawDesc: activeCountyMeta.raw_quality_desc,
                        origin: activeOrigins.quality,
                        rollYear: activeCountyMeta.roll_year
                      })}
                      style={{
                        marginLeft: '6px',
                        fontWeight: 700,
                        color: '#34292A',
                        fontSize: '10.5px',
                        backgroundColor: 'rgba(189, 211, 226, 0.35)',
                        padding: '1px 6px',
                        borderRadius: '999px'
                      }}
                    >
                      County: {activeCountyMeta.raw_quality_code}
                    </span>
                  )}
                  <FieldOriginBadge origin={activeOrigins.quality} />
                </label>
                <ChoiceChipGroup
                  options={UAD_QUALITY_OPTIONS.map((o) => ({
                    id: o.id,
                    label: o.uad ? o.uad : 'Unknown'
                  }))}
                  value={activeDetails.quality || 'unknown'}
                  suggestedValue={hintSuggestedFields.quality || null}
                  onChange={(id) => updateActiveDetails({ quality: id })}
                />
                <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)', marginTop: '5px' }}>
                  {formatQualityWithRawCode(activeQualityOption, activeCountyMeta?.raw_quality_code, {
                    isManualOverride: Boolean(
                      activeCountyMeta?.raw_quality_code &&
                      activeOrigins.quality === 'my_edit' &&
                      activeDetails.quality !== activeCountyMeta?.county_quality_uad
                    ),
                    short: false
                  })}{' '}
                  — {activeQualityOption.description}
                </div>
              </div>

              <div>
                <label className="investor-form-label">
                  Kitchen &amp; baths updated
                  <FieldOriginBadge origin={activeOrigins.kitchen_baths_updated} />
                </label>
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

            {/* 3. ROOF, CONSTRUCTION & WINDOWS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span className="investor-section-header">ROOF, CONSTRUCTION &amp; STORM PROTECTION</span>

              <div>
                <label className="investor-form-label">
                  Construction {hintSuggestedFields.construction_type ? '(Suggested from county hint)' : ''}
                  <FieldOriginBadge origin={activeOrigins.construction_type} />
                </label>
                <ChoiceChipGroup
                  options={CONSTRUCTION_TYPE_OPTIONS}
                  value={activeDetails.construction_type || 'unknown'}
                  suggestedValue={hintSuggestedFields.construction_type || null}
                  onChange={(id) => updateActiveDetails({ construction_type: id })}
                />
                <input
                  type="text"
                  maxLength={140}
                  value={activeDetails.construction_detail || ''}
                  onChange={(e) => updateActiveDetails({ construction_detail: e.target.value })}
                  placeholder="Optional county record label (e.g. Wood frame / Hardi-plank)"
                  className="investor-form-input"
                  style={{ marginTop: '8px', fontSize: '12px' }}
                />
              </div>

              <div className="investor-form-grid-2" style={{ alignItems: 'start' }}>
                <div>
                  <label className="investor-form-label">
                    Roof type
                    <FieldOriginBadge
                      origin={activeOrigins.roof_type}
                      tooltip={activeCountyMeta?.roof_cover_desc ? `County roof cover: ${activeCountyMeta.roof_cover_desc}` : null}
                    />
                  </label>
                  <ChoiceChipGroup
                    options={ROOF_TYPE_OPTIONS}
                    value={activeDetails.roof_type}
                    onChange={(id) => updateActiveDetails({ roof_type: id })}
                  />
                </div>
                <div>
                  <label className="investor-form-label" htmlFor="detail-roof-year">
                    Roof year (never inferred from year built)
                    <FieldOriginBadge origin={activeOrigins.roof_year} />
                  </label>
                  <FormattedNumberInput
                    id="detail-roof-year"
                    value={activeRoofYearInput}
                    onChange={handleRoofYearChange}
                    allowDecimal={false}
                    formatOnBlur={false}
                    placeholder="Unknown — e.g. 2021"
                    className="investor-form-input"
                  />
                  {fieldErrors.roof_year && (
                    <div style={{ fontSize: '11px', color: '#41101B', fontWeight: 600, marginTop: '4px' }}>
                      {fieldErrors.roof_year}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="investor-form-label">
                  Windows &amp; openings
                  <FieldOriginBadge origin={activeOrigins.windows} />
                </label>
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
                    <FieldOriginBadge
                      origin={activeOrigins.pool_type}
                      tooltip={activeCountyMeta?.pool_year ? `County pool built ${activeCountyMeta.pool_year}` : null}
                    />
                  </label>
                  <SegmentedControl
                    size="sm"
                    options={POOL_OPTIONS}
                    value={activeDetails.pool_type}
                    onChange={(id) => {
                      if (id === 'none') {
                        updateActiveDetails({ pool_type: 'none', screen_enclosure: false });
                      } else if (id === 'unknown') {
                        updateActiveDetails({ pool_type: 'unknown', screen_enclosure: null });
                      } else {
                        updateActiveDetails({
                          pool_type: id,
                          ...(activeDetails.pool_type === 'none' ? { screen_enclosure: null } : {})
                        });
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="investor-form-label">
                    Screen enclosure
                    <FieldOriginBadge origin={activeOrigins.screen_enclosure} />
                  </label>
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
                <label className="investor-form-label">
                  Garage / parking
                  <FieldOriginBadge origin={activeOrigins.garage} />
                </label>
                <ChoiceChipGroup
                  options={GARAGE_OPTIONS}
                  value={garageToOptionId(activeDetails)}
                  onChange={(optId) => updateActiveDetails(optionIdToGarageFields(optId))}
                />
              </div>

              <div>
                <label className="investor-form-label">
                  Waterfront &amp; view
                  <FieldOriginBadge
                    origin={activeOrigins.waterfront_view}
                    tooltip={activeCountyMeta?.land_class_desc ? `County land class: ${activeCountyMeta.land_class_code} ${activeCountyMeta.land_class_desc}` : null}
                  />
                </label>
                <ChoiceChipGroup
                  options={WATERFRONT_VIEW_OPTIONS}
                  value={activeDetails.waterfront_view}
                  onChange={(id) => updateActiveDetails({ waterfront_view: id })}
                />
              </div>

              <div className="investor-form-grid-2" style={{ alignItems: 'start' }}>
                <div>
                  <label className="investor-form-label">
                    Boat dock
                    <FieldOriginBadge origin={activeOrigins.boat_dock} />
                  </label>
                  <SegmentedControl
                    size="sm"
                    options={[
                      { id: 'yes', label: 'Yes' },
                      { id: 'no', label: 'No' },
                      { id: 'unknown', label: 'Unknown' }
                    ]}
                    value={triBoolToSeg(activeDetails.boat_dock)}
                    onChange={(seg) => {
                      const nextDock = segToTriBool(seg);
                      updateActiveDetails({
                        boat_dock: nextDock,
                        ...(nextDock === false ? { boat_dock_sqft: null, boat_lift: false } : {}),
                        ...(nextDock === null ? { boat_dock_sqft: null } : {})
                      });
                    }}
                  />
                </div>
                {activeDetails.boat_dock !== false && (
                  <div>
                    <label className="investor-form-label">
                      Boat lift
                      <FieldOriginBadge origin={activeOrigins.boat_lift} />
                    </label>
                    <SegmentedControl
                      size="sm"
                      options={[
                        { id: 'yes', label: 'Yes' },
                        { id: 'no', label: 'No' },
                        { id: 'unknown', label: 'Unknown' }
                      ]}
                      value={triBoolToSeg(activeDetails.boat_lift)}
                      onChange={(seg) => {
                        const nextLift = segToTriBool(seg);
                        updateActiveDetails({
                          boat_lift: nextLift,
                          ...(nextLift === true ? { boat_dock: true } : {})
                        });
                      }}
                    />
                  </div>
                )}
              </div>

              {activeDetails.boat_dock === true && (
                <div>
                  <label className="investor-form-label" htmlFor="detail-boat-dock-sqft">
                    Dock area (sf) <span style={{ fontWeight: 400, opacity: 0.65 }}>(optional)</span>
                    <FieldOriginBadge origin={activeOrigins.boat_dock_sqft} />
                  </label>
                  <FormattedNumberInput
                    id="detail-boat-dock-sqft"
                    value={activeDetails.boat_dock_sqft != null ? String(activeDetails.boat_dock_sqft) : ''}
                    onChange={(val) =>
                      updateActiveDetails({
                        boat_dock: true,
                        boat_dock_sqft: val === '' ? null : val
                      })
                    }
                    allowDecimal={false}
                    formatOnBlur={true}
                    placeholder="e.g. 350"
                    className="investor-form-input"
                  />
                </div>
              )}

              <div>
                <label className="investor-form-label" htmlFor="detail-hoa-name">
                  HOA / association name <span style={{ fontWeight: 400, opacity: 0.65 }}>(optional)</span>
                  <FieldOriginBadge origin={activeOrigins.hoa_name} />
                </label>
                <input
                  id="detail-hoa-name"
                  type="text"
                  maxLength={140}
                  value={activeDetails.hoa_name || ''}
                  onChange={(e) => updateActiveDetails({ hoa_name: e.target.value })}
                  placeholder="e.g. River Ridge HOA"
                  className="investor-form-input"
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
            {formError && (
              <div
                role="alert"
                style={{
                  backgroundColor: 'rgba(138, 42, 30, 0.08)',
                  border: '1px solid rgba(138, 42, 30, 0.35)',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  color: '#8A2A1E',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '12px',
                  lineHeight: 1.4
                }}
              >
                {formError}
              </div>
            )}
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

