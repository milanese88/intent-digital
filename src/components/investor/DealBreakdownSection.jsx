import React, { useState, useEffect, useMemo } from 'react';
import { Button, Pill, SegmentedControl } from '../ui';
import FormattedNumberInput from './FormattedNumberInput.jsx';
import {
  DEVELOPER_COSTS_AS_OF_DISPLAY,
  DEVELOPER_COSTS_DISCLAIMER,
  FLIP_REHAB_LEVELS,
  NEW_BUILD_QUALITY_TIERS,
  SOFT_COSTS_DEFAULTS,
  SITE_ADDON_ESTIMATES,
  FINANCING_MODES,
  DEFAULT_CONSTRUCTION_DRAW_SCHEDULE,
  estimateDemoLumpSum,
  sumSoftCostsPct,
  computeWeightedDrawUtilization
} from '../../config/developerCosts.js';
import {
  buildDefaultDealBreakdownInputs,
  calculateDealBreakdown,
  computeHoldMonthsBetweenDates
} from './dealBreakdownEngine.js';
import PropertyTimeline from './PropertyTimeline.jsx';
import PaRecordUploadModal from './PaRecordUploadModal.jsx';
import AddPermitModal from './AddPermitModal.jsx';

function fmtDollar(val, signed = false) {
  if (val == null || isNaN(Number(val))) return '—';
  const n = Math.round(Number(val));
  if (signed) {
    if (n > 0) return `+$${n.toLocaleString('en-US')}`;
    if (n < 0) return `−$${Math.abs(n).toLocaleString('en-US')}`;
    return '$0';
  }
  return n < 0 ? `−$${Math.abs(n).toLocaleString('en-US')}` : `$${n.toLocaleString('en-US')}`;
}

function fmtPct(val, digits = 1, signed = false) {
  if (val == null || isNaN(Number(val))) return '—';
  const n = Number(val);
  const prefix = signed && n > 0 ? '+' : '';
  return `${prefix}${n.toFixed(digits)}%`;
}

function EstimateTag({ text = 'estimate' }) {
  return (
    <span
      style={{
        display: 'inline-block',
        marginLeft: '6px',
        padding: '1px 6px',
        borderRadius: '999px',
        backgroundColor: 'rgba(189, 211, 226, 0.45)',
        border: '1px solid rgba(133, 157, 206, 0.55)',
        color: '#34292A',
        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
        fontSize: '9px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        verticalAlign: 'middle'
      }}
    >
      {text}
    </span>
  );
}

const CARD_STYLE = {
  backgroundColor: '#FFFFFF',
  border: '1px solid rgba(52, 41, 42, 0.12)',
  borderRadius: '18px',
  padding: '22px 24px',
  boxShadow: '0 4px 18px rgba(52, 41, 42, 0.04)'
};

const LABEL_STYLE = {
  display: 'block',
  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  color: 'rgba(52, 41, 42, 0.65)',
  marginBottom: '5px'
};

export default function DealBreakdownSection({
  property = null,
  countyData = null,
  finderRow = null,
  buyingProfile = null,
  showToast = null,
  onBackToFinder = null,
  onOpenLearningLabLesson = null
}) {
  const defaultInputs = useMemo(
    () => buildDefaultDealBreakdownInputs({ property, countyData, finderRow }),
    [property, countyData, finderRow]
  );

  const [inputs, setInputs] = useState(defaultInputs);
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState('');
  const [activeSavedId, setActiveSavedId] = useState(null);
  const [savedBreakdowns, setSavedBreakdowns] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showSoftDetails, setShowSoftDetails] = useState(false);
  const [showDrawSchedule, setShowDrawSchedule] = useState(false);
  const [hasEditedLocally, setHasEditedLocally] = useState(false);
  const [savedPropertyId, setSavedPropertyId] = useState(() => property?.id || finderRow?.property_id || null);
  const [isSavingToProperties, setIsSavingToProperties] = useState(false);
  const [isPaModalOpen, setIsPaModalOpen] = useState(false);
  const [isAddPermitOpen, setIsAddPermitOpen] = useState(false);
  const [permits, setPermits] = useState([]);
  const [valueHistory, setValueHistory] = useState(() => inputs.valueHistory || []);
  const [paRecord, setPaRecord] = useState(null);
  const [countySales, setCountySales] = useState(() => {
    if (Array.isArray(countyData?.sales) && countyData.sales.length > 0) return countyData.sales;
    if (Array.isArray(finderRow?.sales) && finderRow.sales.length > 0) return finderRow.sales;
    return [];
  });

  // Fetch permits for property or folio
  useEffect(() => {
    const propId = property?.id || savedPropertyId;
    const folio = inputs.parcelId || finderRow?.parcel_id || countyData?.parcel_id;
    if (!propId && !folio) return;
    const params = new URLSearchParams();
    if (propId) params.set('property_id', propId);
    if (folio) params.set('folio', folio);

    fetch(`/api/investor/permits?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data?.permits) && data.permits.length > 0) {
          setPermits(data.permits);
        }
      })
      .catch(() => {});
  }, [property?.id, savedPropertyId, inputs.parcelId, finderRow?.parcel_id, countyData?.parcel_id]);

  // Fetch full parcel sales if parcelId is known and countySales is empty
  useEffect(() => {
    const parcelId = inputs.parcelId || finderRow?.parcel_id || property?.parcel_id || countyData?.parcel_id;
    const pCounty = inputs.county || finderRow?.county || property?.parcel_county || property?.county || countyData?.county;
    if (parcelId && pCounty && countySales.length === 0) {
      fetch(`/api/county/parcel?county=${encodeURIComponent(pCounty)}&parcel_id=${encodeURIComponent(parcelId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (Array.isArray(data?.sales) && data.sales.length > 0) {
            setCountySales(data.sales);
          }
        })
        .catch(() => {});
    }
  }, [inputs.parcelId, inputs.county, countySales.length, finderRow, property, countyData]);

  // Sync defaults when switching target property / finder row
  const targetKey = `${property?.id || ''}|${finderRow?.id || ''}|${countyData?.parcel_id || ''}`;
  useEffect(() => {
    setInputs(defaultInputs);
    setActiveSavedId(null);
    setTitle('');
    setNotes('');
    setSaveError('');
    setHasEditedLocally(false);
  }, [targetKey]);

  // Update auto-filled county values if countyData arrives asynchronously before user edits
  useEffect(() => {
    if (!hasEditedLocally && !activeSavedId) {
      setInputs(defaultInputs);
    }
  }, [defaultInputs, hasEditedLocally, activeSavedId]);

  // Fetch saved breakdowns for this property / parcel
  const loadSavedBreakdowns = async () => {
    const propertyId = property?.id || finderRow?.property_id || null;
    const parcelId = finderRow?.parcel_id || property?.parcel_id || countyData?.parcel_id || null;
    const county = finderRow?.county || property?.parcel_county || property?.county || countyData?.county || '';
    if (!propertyId && !parcelId) {
      setSavedBreakdowns([]);
      return;
    }

    setLoadingSaved(true);
    try {
      const params = new URLSearchParams();
      if (propertyId) params.set('property_id', propertyId);
      if (parcelId) params.set('parcel_id', parcelId);
      if (county) params.set('county', county);
      const res = await fetch(`/api/investor/deal-breakdowns?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      const list = Array.isArray(json.items) ? json.items : [];
      setSavedBreakdowns(list);
      // Hydrate latest saved breakdown automatically on initial load when user hasn't edited yet
      if (list.length > 0 && !hasEditedLocally && !activeSavedId) {
        const latest = list[0];
        if (latest?.inputs && Object.keys(latest.inputs).length > 0) {
          setInputs((prev) => ({ ...prev, ...latest.inputs }));
          setActiveSavedId(latest.id);
          setTitle(latest.title || '');
          setNotes(latest.notes || '');
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingSaved(false);
    }
  };

  useEffect(() => {
    loadSavedBreakdowns();
  }, [targetKey]);

  const updateInput = (patch) => {
    setHasEditedLocally(true);
    setInputs((prev) => {
      const next = { ...prev, ...patch };
      if ((patch.purchaseDate !== undefined || patch.exitDate !== undefined) && patch.holdMonths === undefined) {
        next.holdMonths = computeHoldMonthsBetweenDates(next.purchaseDate, next.exitDate, next.holdMonths);
      }
      return next;
    });
  };

  const handleDealTypeSwitch = (nextType) => {
    const isNewBuild = nextType === 'demo_new_build';
    const nextFinMode = isNewBuild ? 'construction_loan' : 'hard_money';
    const finPreset = FINANCING_MODES[nextFinMode];
    const softPreset = isNewBuild ? SOFT_COSTS_DEFAULTS.demo_new_build : SOFT_COSTS_DEFAULTS.flip;

    updateInput({
      dealType: nextType,
      demoCost: isNewBuild ? (inputs.isVacantLotPurchase ? 0 : estimateDemoLumpSum(inputs.beforeLivingSqft)) : 0,
      hardCostOverride: null,
      softCostsBreakdown: { ...softPreset },
      softCostsPct: sumSoftCostsPct(softPreset),
      financingMode: nextFinMode,
      interestRatePct: finPreset.ratePct,
      pointsPct: finPreset.pointsPct,
      ltcPct: finPreset.ltcPct,
      drawUtilPct: finPreset.rehabDrawUtilPct,
      lenderFees: finPreset.lenderFees,
      includePoolAddon: isNewBuild && inputs.hasPool,
      poolAddonCost: isNewBuild ? SITE_ADDON_ESTIMATES.demo_new_build.pool : SITE_ADDON_ESTIMATES.flip.pool,
      includeDockAddon: isNewBuild && inputs.hasDock,
      dockAddonCost: isNewBuild ? SITE_ADDON_ESTIMATES.demo_new_build.dock : SITE_ADDON_ESTIMATES.flip.dock
    });
  };

  const handleFinancingModeSwitch = (nextMode) => {
    const preset = FINANCING_MODES[nextMode] || FINANCING_MODES.hard_money;
    updateInput({
      financingMode: nextMode,
      interestRatePct: preset.ratePct,
      pointsPct: preset.pointsPct,
      ltcPct: preset.ltcPct,
      drawUtilPct: preset.rehabDrawUtilPct,
      lenderFees: preset.lenderFees
    });
  };

  const handleSoftSubChange = (key, rawVal) => {
    const val = Math.max(0, Math.min(25, Number(rawVal) || 0));
    const nextBreakdown = {
      ...(inputs.softCostsBreakdown || {}),
      [key]: val
    };
    updateInput({
      softCostsBreakdown: nextBreakdown,
      softCostsPct: sumSoftCostsPct(nextBreakdown)
    });
  };

  const handleDrawStageChange = (stageId, field, rawVal) => {
    const nextSchedule = (inputs.drawSchedule || DEFAULT_CONSTRUCTION_DRAW_SCHEDULE).map((st) =>
      st.id === stageId ? { ...st, [field]: Number(rawVal) || 0 } : st
    );
    const nextUtilPct = Math.round(computeWeightedDrawUtilization(nextSchedule) * 100);
    updateInput({
      drawSchedule: nextSchedule,
      drawUtilPct: nextUtilPct
    });
  };

  const handleResetDefaults = () => {
    setInputs(defaultInputs);
    setHasEditedLocally(false);
    setActiveSavedId(null);
    setTitle('');
    setNotes('');
    setSaveError('');
    if (showToast) showToast('Reset to county auto-fill & cost estimates');
  };

  const result = useMemo(
    () => calculateDealBreakdown(inputs, buyingProfile),
    [inputs, buyingProfile]
  );

  const handleSaveBreakdown = async (saveAsNew = false) => {
    setSaveError('');
    if (!inputs.address?.trim()) {
      setSaveError('Enter a property address before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const isUpdate = Boolean(activeSavedId && !saveAsNew);
      const method = isUpdate ? 'PUT' : 'POST';
      const payload = {
        ...(isUpdate ? { id: activeSavedId } : {}),
        property_id: property?.id || finderRow?.property_id || null,
        county: inputs.county || 'Broward',
        parcel_id: inputs.parcelId || null,
        address: inputs.address.trim(),
        city: inputs.city || null,
        zip: inputs.zip || null,
        deal_type: inputs.dealType,
        title: title.trim() || `${inputs.dealType === 'demo_new_build' ? 'Demo → New Build' : 'Flip'} Breakdown`,
        inputs,
        notes: notes.trim() || null
      };

      const res = await fetch('/api/investor/deal-breakdowns', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Could not save breakdown (HTTP ${res.status}).`);
      }

      setActiveSavedId(json.id);
      setSavedBreakdowns((prev) => {
        const filtered = prev.filter((b) => b.id !== json.id);
        return [json, ...filtered];
      });
      if (showToast) showToast(isUpdate ? 'Deal breakdown updated' : 'Deal breakdown saved');
    } catch (err) {
      setSaveError(err?.message || 'Unable to save deal breakdown.');
      if (showToast) showToast(err?.message || 'Unable to save deal breakdown.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadSaved = (item) => {
    if (!item) return;
    setActiveSavedId(item.id);
    setInputs((prev) => ({ ...prev, ...(item.inputs || {}) }));
    setTitle(item.title || '');
    setNotes(item.notes || '');
    setHasEditedLocally(true);
    setSaveError('');
  };

  const handleDeleteSaved = async (id) => {
    try {
      const res = await fetch(`/api/investor/deal-breakdowns?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Could not delete breakdown.');
      }
      setSavedBreakdowns((prev) => prev.filter((b) => b.id !== id));
      if (activeSavedId === id) {
        setActiveSavedId(null);
      }
      if (showToast) showToast('Saved breakdown removed');
    } catch (err) {
      setSaveError(err?.message || 'Unable to delete breakdown.');
    }
  };

  const handleApplyPaRecord = ({ parsedData, applySpecs, applySales, applyValues }) => {
    setPaRecord(parsedData);
    setHasEditedLocally(true);
    const updates = {
      paRecordSource: parsedData.source
    };

    if (applySpecs && parsedData.buildingInfo) {
      const b = parsedData.buildingInfo;
      const f = parsedData.features || {};
      if (b.livingSqft) {
        updates.afterLivingSqft = b.livingSqft;
        if (!inputs.beforeLivingSqft) updates.beforeLivingSqft = b.livingSqft;
      }
      if (b.yearBuilt) {
        updates.afterYearBuilt = b.yearBuilt;
      }
      if (f.hasPool) updates.hasPool = true;
      if (f.hasDock) updates.hasDock = true;
      if (b.construction) updates.construction = b.construction;
      if (b.roofCover) updates.roofCover = b.roofCover;
      if (b.qualityGrade) updates.qualityTier = b.qualityGrade;
      // Only confident (non-null) parsed values may overwrite existing characteristics
      const confidentOnly = Object.fromEntries(
        Object.entries({ ...b, ...f }).filter(([, v]) => v != null && v !== '')
      );
      updates.buildingCharacteristics = {
        ...(inputs.buildingCharacteristics || {}),
        ...confidentOnly,
        source: parsedData.source || 'PA record PDF'
      };
    }

    if (applySales && Array.isArray(parsedData.salesHistory) && parsedData.salesHistory.length > 0) {
      const sorted = [...parsedData.salesHistory].sort((a, b) => (a.saleDate || '').localeCompare(b.saleDate || ''));
      if (sorted.length >= 2) {
        // Most recent pair of deeds = bought → sold (older history stays in the sales list)
        const bought = sorted[sorted.length - 2];
        const sold = sorted[sorted.length - 1];
        updates.purchasePrice = bought.salePrice;
        updates.purchaseDate = bought.saleDate;
        updates.purchaseSource = 'county_deed';
        updates.exitPrice = sold.salePrice;
        updates.exitDate = sold.saleDate;
        updates.exitSource = 'county_resale';
      } else if (sorted.length === 1) {
        updates.purchasePrice = sorted[0].salePrice;
        updates.purchaseDate = sorted[0].saleDate;
        updates.purchaseSource = 'county_deed';
      }
      const formattedSales = parsedData.salesHistory.map((s) => ({
        id: `pa-${s.saleDate}-${s.salePrice}`,
        sale_date: s.saleDate,
        sale_year: s.saleDate ? Number(s.saleDate.slice(0, 4)) : null,
        sale_month: s.saleDate ? Number(s.saleDate.slice(5, 7)) : null,
        sale_price: s.salePrice,
        qual_code: s.deedType,
        qual_label: s.deedType,
        or_book: s.orBook,
        or_page: s.orPage,
        is_market: ['WD', 'SWD'].includes(s.deedType) && s.qualified !== false
      }));
      setCountySales((prev) => [...formattedSales, ...prev]);
    }

    if (applyValues && Array.isArray(parsedData.valueHistory) && parsedData.valueHistory.length > 0) {
      setValueHistory(parsedData.valueHistory);
      updates.valueHistory = parsedData.valueHistory;
    }

    updateInput(updates);
  };

  const handleSelectBoughtSale = (saleKey) => {
    setHasEditedLocally(true);
    if (saleKey === 'manual') {
      updateInput({ purchaseSource: 'entered_by_me' });
      return;
    }
    const sale = countySales.find((s) => String(s.id) === String(saleKey) || `${s.sale_year}-${s.sale_month}-${s.sale_price}` === saleKey);
    if (!sale) return;
    const pDate = buildIsoDateFromYearMonth(sale.sale_year, sale.sale_month);
    updateInput({
      purchasePrice: Math.round(Number(sale.sale_price) || 0),
      purchaseDate: pDate,
      purchaseSource: 'county_deed',
      buyViCd: sale.vi_cd || null,
      isVacantLotPurchase: String(sale.vi_cd || '').trim() === 'V'
    });
  };

  const handleSelectSoldSale = (saleKey) => {
    setHasEditedLocally(true);
    if (saleKey === 'manual') {
      updateInput({ exitSource: 'county_resale' });
      return;
    }
    const sale = countySales.find((s) => String(s.id) === String(saleKey) || `${s.sale_year}-${s.sale_month}-${s.sale_price}` === saleKey);
    if (!sale) return;
    const eDate = buildIsoDateFromYearMonth(sale.sale_year, sale.sale_month);
    updateInput({
      exitPrice: Math.round(Number(sale.sale_price) || 0),
      exitDate: eDate,
      exitSource: 'county_resale',
      sellViCd: sale.vi_cd || null
    });
  };

  const handleSaveToProperties = async () => {
    if (!inputs.address?.trim()) {
      setSaveError('Address is required to save to properties.');
      return;
    }
    setIsSavingToProperties(true);
    setSaveError('');
    try {
      const propPayload = {
        address: inputs.address.trim(),
        city: inputs.city || '',
        zip: inputs.zip || '',
        county: inputs.county || 'Broward',
        parcel_id: inputs.parcelId || null,
        parcel_county: inputs.county || null,
        property_type: 'single_family',
        sqft: inputs.afterLivingSqft || inputs.beforeLivingSqft || null,
        lot_sqft: inputs.lotSqft || null,
        year_built: inputs.afterYearBuilt || inputs.beforeYearBuilt || null,
        list_price: inputs.exitPrice || inputs.purchasePrice || 0,
        price_source: inputs.exitSource === 'my_list_price' ? 'list_price' : 'county_value',
        strategy: 'flip',
        status: 'analyzing',
        notes: `Saved from Deal Breakdown (${inputs.dealType === 'demo_new_build' ? 'Demo → New Build' : 'Flip'}). Purchase: $${inputs.purchasePrice?.toLocaleString() || 0} (${inputs.purchaseDate || '—'}) · Exit: $${inputs.exitPrice?.toLocaleString() || 0} (${inputs.exitDate || '—'})`,
        pool: Boolean(inputs.hasPool),
        boat_dock: Boolean(inputs.hasDock)
      };

      const propRes = await fetch('/api/investor/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(propPayload)
      });
      const propJson = await propRes.json();
      if (!propRes.ok) {
        throw new Error(propJson.error || 'Failed to save property to My Properties.');
      }

      const newPropId = propJson.id;
      setSavedPropertyId(newPropId);

      // Now save or update breakdown linked to this new property
      const breakdownPayload = {
        property_id: newPropId,
        county: inputs.county || 'Broward',
        parcel_id: inputs.parcelId || null,
        address: inputs.address.trim(),
        city: inputs.city || null,
        zip: inputs.zip || null,
        deal_type: inputs.dealType,
        title: title.trim() || `${inputs.dealType === 'demo_new_build' ? 'Demo → New Build' : 'Flip'} Breakdown`,
        inputs,
        notes: notes.trim() || null
      };

      const bdRes = await fetch('/api/investor/deal-breakdowns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(breakdownPayload)
      });
      const bdJson = await bdRes.json();
      if (bdRes.ok && bdJson.id) {
        setActiveSavedId(bdJson.id);
        setSavedBreakdowns((prev) => [bdJson, ...prev]);
      }

      if (showToast) {
        showToast(`Saved to My Saved Properties as ${inputs.dealType === 'demo_new_build' ? 'New Build' : 'Flip'}!`);
      }
    } catch (err) {
      setSaveError(err.message || 'Unable to save to properties.');
      if (showToast) showToast(err.message || 'Unable to save to properties.');
    } finally {
      setIsSavingToProperties(false);
    }
  };

  const handlePermitAdded = (newPermit) => {
    setPermits((prev) => [newPermit, ...prev]);
    if (showToast) showToast('Permit added to timeline!');
  };

  const { costs, metrics, scenarios, myVersion } = result;
  const isNewBuild = inputs.dealType === 'demo_new_build';
  const hasCamaRecord = Boolean(
    finderRow?.building_characteristics ||
    property?.building_characteristics ||
    countyData?.building_characteristics
  );

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '40px' }}>
      {/* ================================================================= */}
      {/* 1. HEADER & MODE SWITCHER                                         */}
      {/* ================================================================= */}
      <div style={CARD_STYLE}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            {onBackToFinder && (
              <button
                type="button"
                onClick={onBackToFinder}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginBottom: '8px',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#34292A',
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                &larr; Back to Flip &amp; Build Finder
              </button>
            )}
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'rgba(52, 41, 42, 0.58)'
              }}
            >
              DEVELOPER REVERSE-ENGINEERING · COST DEFAULTS AS OF {DEVELOPER_COSTS_AS_OF_DISPLAY.toUpperCase()}
            </span>
            <h2
              style={{
                margin: '4px 0 0 0',
                fontFamily: 'var(--font-heading, "Instrument Serif", Georgia, serif)',
                fontSize: '30px',
                fontWeight: 400,
                lineHeight: 1.12,
                color: '#34292A'
              }}
            >
              Deal Breakdown {inputs.address ? `· ${inputs.address}` : ''}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              <Pill variant="neutral" size="sm" style={{ backgroundColor: 'rgba(189, 211, 226, 0.35)', border: '1px solid #859DCE', color: '#34292A', textTransform: 'none', fontWeight: 700 }}>
                {inputs.county}{inputs.zip ? ` · ZIP ${inputs.zip}` : ''}
              </Pill>
              {inputs.parcelId && (
                <Pill variant="neutral" size="sm" style={{ textTransform: 'none' }}>
                  Folio {inputs.parcelId}
                </Pill>
              )}
              {hasCamaRecord && (
                <Pill variant="neutral" size="sm" style={{ backgroundColor: 'rgba(189, 211, 226, 0.25)', border: '1px solid rgba(133, 157, 206, 0.5)', color: '#34292A', textTransform: 'none' }}>
                  Auto-filled from county building record
                </Pill>
              )}
              {inputs.hasPool && <Pill variant="neutral" size="sm" style={{ textTransform: 'none' }}>Pool</Pill>}
              {inputs.hasDock && <Pill variant="neutral" size="sm" style={{ textTransform: 'none' }}>Boat dock</Pill>}
              {finderRow?.is_distressed_acquisition && (
                <Pill variant="negative" size="sm" style={{ textTransform: 'none', fontWeight: 700 }}>
                  Distressed acquisition → market resale
                </Pill>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <SegmentedControl
              size="sm"
              value={inputs.dealType}
              onChange={handleDealTypeSwitch}
              options={[
                { id: 'flip', label: 'Flip' },
                { id: 'demo_new_build', label: 'Demo → New Build' }
              ]}
            />
            <Button variant="secondary" size="sm" onClick={handleResetDefaults}>
              Reset defaults
            </Button>
            <Button variant="primary" size="sm" onClick={() => handleSaveBreakdown(false)} disabled={isSaving}>
              {isSaving ? 'Saving…' : activeSavedId ? 'Update saved' : 'Save breakdown'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPaModalOpen(true)}
              title="Upload Property Appraiser record PDF (strictly non-PII)"
              style={{ borderColor: '#34292A', color: '#34292A' }}
            >
              📄 Upload PA Record (PDF)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveToProperties}
              disabled={isSavingToProperties}
              title="Save this property with type Flip / New build so it shows in My Saved Properties"
              style={{
                borderColor: '#34292A',
                color: '#34292A',
                backgroundColor: savedPropertyId ? 'rgba(189, 211, 226, 0.3)' : 'transparent'
              }}
            >
              {isSavingToProperties ? 'Saving property…' : savedPropertyId ? '✓ In My Properties' : '+ Save to My Properties'}
            </Button>
          </div>
        </div>

        {/* Estimate Disclaimer Banner + Learning Lab link */}
        <div
          style={{
            marginTop: '14px',
            padding: '10px 14px',
            borderRadius: '10px',
            backgroundColor: '#FAF8F5',
            border: '1px solid rgba(52, 41, 42, 0.12)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '11.5px',
            color: '#34292A'
          }}
        >
          <span>
            <strong>Editable estimates:</strong> {DEVELOPER_COSTS_DISCLAIMER}
          </span>
          {onOpenLearningLabLesson && (
            <button
              type="button"
              onClick={() => onOpenLearningLabLesson('how_flippers_builders_make_money')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: '#34292A',
                fontWeight: 700,
                fontSize: '11px',
                textDecoration: 'underline',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Lesson: How flippers &amp; builders make money &rarr;
            </button>
          )}
        </div>

        {saveError && (
          <div
            role="alert"
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(65, 16, 27, 0.08)',
              border: '1px solid rgba(65, 16, 27, 0.28)',
              color: '#41101B',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            {saveError}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* 2. HERO OUTPUT METRICS BAND (Pantone Ganache #34292A)             */}
      {/* ================================================================= */}
      <div
        style={{
          backgroundColor: '#34292A',
          color: '#FAF8F5',
          borderRadius: '20px',
          padding: '22px 24px',
          boxShadow: '0 10px 28px rgba(52, 41, 42, 0.14)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          <span
            style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#BDD3E2'
            }}
          >
            LIKELY (BASE) REVERSE-ENGINEERED RETURNS · ESTIMATE
          </span>
          <span style={{ fontSize: '11.5px', color: 'rgba(250, 248, 245, 0.78)' }}>
            Gross deed spread: {fmtDollar(metrics.grossSpread, true)} ({fmtPct(metrics.grossSpreadPct, 1, true)}) over {metrics.holdMonths} mo
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
            gap: '14px'
          }}
        >
          {[
            {
              label: 'EST. NET PROFIT',
              value: fmtDollar(metrics.estProfit, true),
              sub: metrics.profitPerSqft != null ? `${fmtDollar(metrics.profitPerSqft, true)} / sf` : 'Likely estimate',
              highlight: metrics.estProfit >= 0 ? '#BDD3E2' : '#F2A39D'
            },
            {
              label: 'TOTAL INVESTED',
              value: fmtDollar(costs.totalInvested),
              sub: `Project cost ${fmtDollar(costs.totalProjectCost)} + sell`,
              highlight: '#FAF8F5'
            },
            {
              label: 'ROI (EST.)',
              value: fmtPct(metrics.roiPct, 1),
              sub: `CoC ${fmtPct(metrics.cashOnCashRoiPct, 1)} on cash`,
              highlight: '#FAF8F5'
            },
            {
              label: 'ANNUALIZED ROI',
              value: fmtPct(metrics.annualizedRoiPct, 1),
              sub: `${metrics.holdMonths}-mo hold period`,
              highlight: '#BDD3E2'
            },
            {
              label: 'CASH NEEDED',
              value: fmtDollar(metrics.cashNeeded),
              sub: costs.financingMode === 'cash' ? '100% cash funded' : `Loan ${fmtDollar(costs.loanAmount)}`,
              highlight: '#FAF8F5'
            },
            {
              label: 'BUILD COST / SF',
              value: metrics.constructionCostPerSqft != null ? `$${metrics.constructionCostPerSqft.toLocaleString()}/sf` : '—',
              sub: `All-in ${metrics.costPerSqftAllIn != null ? `$${metrics.costPerSqftAllIn.toLocaleString()}/sf` : '—'}`,
              highlight: '#FAF8F5'
            }
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{
                backgroundColor: 'rgba(250, 248, 245, 0.07)',
                border: '1px solid rgba(250, 248, 245, 0.14)',
                borderRadius: '14px',
                padding: '13px 15px'
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: 'rgba(250, 248, 245, 0.65)',
                  marginBottom: '5px'
                }}
              >
                {kpi.label}
              </span>
              <div
                style={{
                  fontFamily: 'var(--font-heading, "Instrument Serif", Georgia, serif)',
                  fontSize: '26px',
                  lineHeight: 1.1,
                  color: kpi.highlight
                }}
              >
                {kpi.value}
              </div>
              <div style={{ fontSize: '10.5px', color: 'rgba(250, 248, 245, 0.68)', marginTop: '4px' }}>
                {kpi.sub}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ================================================================= */}
      {/* 2.5 PROPERTY LIFECYCLE TIMELINE & PERMIT TRACK                    */}
      {/* ================================================================= */}
      <PropertyTimeline
        property={property}
        finderRow={finderRow}
        breakdownInputs={inputs}
        permits={permits}
        valueHistory={valueHistory}
        paRecord={paRecord}
        onAddPermit={() => setIsAddPermitOpen(true)}
        onUploadPaRecord={() => setIsPaModalOpen(true)}
        onApplyPhasesToBreakdown={(phases) => {
          updateInput({
            holdMonths: phases.totalHoldMonths,
            timelinePhases: phases
          });
          if (showToast) {
            showToast(`Applied timeline phases: ${phases.totalHoldMonths} mo hold (${phases.constructionMonths} mo build)`);
          }
        }}
      />

      {/* ================================================================= */}
      {/* 3. TWO-COLUMN WORKSPACE: DEAL TIMELINE + EDITABLE COST STACK      */}
      {/* ================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', alignItems: 'start' }}>
        {/* LEFT COLUMN: Purchase / Exit & Property Specs + Hard & Soft Costs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* A. Acquisition, Exit & Property Specs */}
          <div style={CARD_STYLE}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '10px', flexWrap: 'wrap' }}>
              <span className="investor-section-header" style={{ marginBottom: 0 }}>
                1. ACQUISITION, EXIT &amp; SPECS
              </span>
              <SegmentedControl
                size="sm"
                value={inputs.exitSource}
                onChange={(val) => updateInput({ exitSource: val })}
                options={[
                  { id: 'county_resale', label: 'County Resale' },
                  { id: 'my_list_price', label: 'My List Price' }
                ]}
              />
            </div>

            {countySales.length > 0 && (
              <div
                style={{
                  marginBottom: '14px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: '#FAF8F5',
                  border: '1px solid rgba(52, 41, 42, 0.12)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px'
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(52, 41, 42, 0.65)'
                    }}
                  >
                    County Deeds on Folio ({countySales.length})
                  </span>
                  <span style={{ fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.55)' }}>
                    Pick deed or enter manually
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                  <div>
                    <label style={{ ...LABEL_STYLE, fontSize: '9px', marginBottom: '2px' }}>Bought Deed</label>
                    <select
                      value={countySales.find((s) => Number(s.sale_price) === Number(inputs.purchasePrice) && buildIsoDateFromYearMonth(s.sale_year, s.sale_month) === inputs.purchaseDate)?.id || 'manual'}
                      onChange={(e) => handleSelectBoughtSale(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(52, 41, 42, 0.2)',
                        backgroundColor: '#FFFFFF',
                        fontSize: '11px',
                        color: '#34292A',
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
                      }}
                    >
                      <option value="manual">Manual entry (Entered by me)</option>
                      {countySales.map((s) => (
                        <option key={s.id || `${s.sale_year}-${s.sale_month}-${s.sale_price}`} value={s.id || `${s.sale_year}-${s.sale_month}-${s.sale_price}`}>
                          {s.sale_year}/{s.sale_month ? String(s.sale_month).padStart(2, '0') : '??'} · ${Math.round(Number(s.sale_price) || 0).toLocaleString()} ({s.is_market || s.qual_code === '01' ? 'Market' : s.qual_label || s.qual_code || 'Deed'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {inputs.exitSource === 'county_resale' && (
                    <div>
                      <label style={{ ...LABEL_STYLE, fontSize: '9px', marginBottom: '2px' }}>Resale Deed</label>
                      <select
                        value={countySales.find((s) => Number(s.sale_price) === Number(inputs.exitPrice) && buildIsoDateFromYearMonth(s.sale_year, s.sale_month) === inputs.exitDate)?.id || 'manual'}
                        onChange={(e) => handleSelectSoldSale(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '8px',
                          border: '1px solid rgba(52, 41, 42, 0.2)',
                          backgroundColor: '#FFFFFF',
                          fontSize: '11px',
                          color: '#34292A',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
                        }}
                      >
                        <option value="manual">Manual entry / County resale</option>
                        {countySales.map((s) => (
                          <option key={s.id || `${s.sale_year}-${s.sale_month}-${s.sale_price}`} value={s.id || `${s.sale_year}-${s.sale_month}-${s.sale_price}`}>
                            {s.sale_year}/{s.sale_month ? String(s.sale_month).padStart(2, '0') : '??'} · ${Math.round(Number(s.sale_price) || 0).toLocaleString()} ({s.is_market || s.qual_code === '01' ? 'Market' : s.qual_label || s.qual_code || 'Deed'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="investor-form-grid-2" style={{ marginBottom: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ ...LABEL_STYLE, marginBottom: 0 }}>Purchase Price</label>
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      padding: '1px 6px',
                      borderRadius: '6px',
                      backgroundColor: inputs.purchaseSource === 'entered_by_me' ? 'rgba(52, 41, 42, 0.08)' : 'rgba(189, 211, 226, 0.4)',
                      color: '#34292A',
                      border: '1px solid rgba(52, 41, 42, 0.15)'
                    }}
                  >
                    {inputs.purchaseSource === 'entered_by_me' ? 'Entered by me' : 'County deed'}
                  </span>
                </div>
                <FormattedNumberInput
                  value={inputs.purchasePrice || ''}
                  onChange={(val) => updateInput({ purchasePrice: Number(val) || 0, purchaseSource: 'entered_by_me' })}
                  prefix="$"
                  formatOnBlur={true}
                  className="investor-form-input"
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Purchase Date</label>
                <input
                  type="date"
                  value={inputs.purchaseDate || ''}
                  onChange={(e) => updateInput({ purchaseDate: e.target.value, purchaseSource: 'entered_by_me' })}
                  className="investor-form-input"
                />
              </div>
            </div>

            <div className="investor-form-grid-2" style={{ marginBottom: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ ...LABEL_STYLE, marginBottom: 0 }}>
                    {inputs.exitSource === 'my_list_price' ? 'My Entered List Price' : 'Resale Price'}
                  </label>
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      padding: '1px 6px',
                      borderRadius: '6px',
                      backgroundColor: inputs.exitSource === 'my_list_price' ? 'rgba(133, 157, 206, 0.25)' : 'rgba(189, 211, 226, 0.4)',
                      color: '#34292A',
                      border: '1px solid rgba(52, 41, 42, 0.15)'
                    }}
                  >
                    {inputs.exitSource === 'my_list_price' ? 'Listed mode (entered by me)' : 'County resale (deed)'}
                  </span>
                </div>
                <FormattedNumberInput
                  value={inputs.exitPrice || ''}
                  onChange={(val) => updateInput({ exitPrice: Number(val) || 0 })}
                  prefix="$"
                  formatOnBlur={true}
                  className="investor-form-input"
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>
                  {inputs.exitSource === 'my_list_price' ? 'List / Target Exit Date' : 'Resale Date'}
                </label>
                <input
                  type="date"
                  value={inputs.exitDate || ''}
                  onChange={(e) => updateInput({ exitDate: e.target.value })}
                  className="investor-form-input"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={LABEL_STYLE}>Hold Months</label>
                <FormattedNumberInput
                  value={inputs.holdMonths || ''}
                  onChange={(val) => updateInput({ holdMonths: Math.max(1, Number(val) || 1) })}
                  allowDecimal={false}
                  formatOnBlur={false}
                  className="investor-form-input"
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>{isNewBuild ? 'Before Living SF' : 'Existing Living SF'}</label>
                <FormattedNumberInput
                  value={inputs.beforeLivingSqft || ''}
                  onChange={(val) => {
                    const nextBefore = Math.max(0, Number(val) || 0);
                    updateInput({
                      beforeLivingSqft: nextBefore,
                      ...(isNewBuild ? { demoCost: estimateDemoLumpSum(nextBefore) } : {})
                    });
                  }}
                  allowDecimal={false}
                  formatOnBlur={true}
                  className="investor-form-input"
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>{isNewBuild ? 'New Living SF' : 'After Living SF'}</label>
                <FormattedNumberInput
                  value={inputs.afterLivingSqft || ''}
                  onChange={(val) => updateInput({ afterLivingSqft: Math.max(0, Number(val) || 0) })}
                  allowDecimal={false}
                  formatOnBlur={true}
                  className="investor-form-input"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
              <div>
                <label style={LABEL_STYLE}>Before Yr Built</label>
                <FormattedNumberInput
                  value={inputs.beforeYearBuilt || ''}
                  onChange={(val) => updateInput({ beforeYearBuilt: val === '' ? null : Number(val) })}
                  allowDecimal={false}
                  formatOnBlur={false}
                  placeholder="Vacant"
                  className="investor-form-input"
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>After Yr Built</label>
                <FormattedNumberInput
                  value={inputs.afterYearBuilt || ''}
                  onChange={(val) => updateInput({ afterYearBuilt: val === '' ? null : Number(val) })}
                  allowDecimal={false}
                  formatOnBlur={false}
                  className="investor-form-input"
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Lot SF</label>
                <FormattedNumberInput
                  value={inputs.lotSqft || ''}
                  onChange={(val) => updateInput({ lotSqft: Math.max(0, Number(val) || 0) })}
                  allowDecimal={false}
                  formatOnBlur={true}
                  className="investor-form-input"
                />
              </div>
            </div>
          </div>

          {/* B. Hard Rehab / Construction, Demo & Soft Costs */}
          <div style={CARD_STYLE}>
            <span className="investor-section-header">
              2. {isNewBuild ? 'DEMOLITION, NEW BUILD & SOFT COSTS' : 'REHAB & SOFT COSTS'}
              <EstimateTag />
            </span>

            {!isNewBuild ? (
              <div style={{ marginBottom: '14px' }}>
                <label style={LABEL_STYLE}>Flip Rehab Level ($/sf estimate)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  {Object.values(FLIP_REHAB_LEVELS).map((lvl) => {
                    const active = inputs.flipRehabLevel === lvl.id && inputs.hardCostOverride == null;
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        title={lvl.description}
                        onClick={() =>
                          updateInput({
                            flipRehabLevel: lvl.id,
                            flipRehabCostPerSqft: lvl.costPerSqft,
                            hardCostOverride: null
                          })
                        }
                        style={{
                          flex: '1 1 110px',
                          padding: '9px 10px',
                          borderRadius: '12px',
                          border: active ? '1.5px solid #34292A' : '1px solid rgba(52, 41, 42, 0.18)',
                          backgroundColor: active ? '#34292A' : '#FAF8F5',
                          color: active ? '#FAF8F5' : '#34292A',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <div>{lvl.shortLabel}</div>
                        <div style={{ fontSize: '10px', opacity: 0.78, marginTop: '2px' }}>${lvl.costPerSqft}/sf ({lvl.rangeLabel})</div>
                      </button>
                    );
                  })}
                </div>
                <div className="investor-form-grid-2">
                  <div>
                    <label style={LABEL_STYLE}>Rehab Rate ($/sf) <EstimateTag /></label>
                    <FormattedNumberInput
                      value={inputs.flipRehabCostPerSqft ?? ''}
                      onChange={(val) => updateInput({ flipRehabCostPerSqft: Math.max(0, Number(val) || 0), hardCostOverride: null })}
                      prefix="$"
                      className="investor-form-input"
                    />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Or Direct Rehab Lump Sum</label>
                    <FormattedNumberInput
                      value={inputs.hardCostOverride ?? ''}
                      onChange={(val) => updateInput({ hardCostOverride: val === '' ? null : Math.max(0, Number(val) || 0) })}
                      prefix="$"
                      formatOnBlur={true}
                      placeholder={fmtDollar(costs.hardBuildCore)}
                      className="investor-form-input"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '14px' }}>
                <label style={LABEL_STYLE}>New Build Quality Tier ($/sf estimate)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  {Object.values(NEW_BUILD_QUALITY_TIERS).map((tier) => {
                    const active = inputs.newBuildQuality === tier.id && inputs.hardCostOverride == null;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        title={tier.description}
                        onClick={() =>
                          updateInput({
                            newBuildQuality: tier.id,
                            newBuildCostPerSqft: tier.costPerSqft,
                            hardCostOverride: null
                          })
                        }
                        style={{
                          flex: '1 1 110px',
                          padding: '9px 10px',
                          borderRadius: '12px',
                          border: active ? '1.5px solid #34292A' : '1px solid rgba(52, 41, 42, 0.18)',
                          backgroundColor: active ? '#34292A' : '#FAF8F5',
                          color: active ? '#FAF8F5' : '#34292A',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <div>{tier.shortLabel}</div>
                        <div style={{ fontSize: '10px', opacity: 0.78, marginTop: '2px' }}>${tier.costPerSqft}/sf ({tier.rangeLabel})</div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={LABEL_STYLE}>Build $/sf <EstimateTag /></label>
                    <FormattedNumberInput
                      value={inputs.newBuildCostPerSqft ?? ''}
                      onChange={(val) => updateInput({ newBuildCostPerSqft: Math.max(0, Number(val) || 0), hardCostOverride: null })}
                      prefix="$"
                      className="investor-form-input"
                    />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Demo Lump Sum <EstimateTag /></label>
                    <FormattedNumberInput
                      value={inputs.demoCost ?? ''}
                      onChange={(val) => updateInput({ demoCost: Math.max(0, Number(val) || 0) })}
                      prefix="$"
                      formatOnBlur={true}
                      className="investor-form-input"
                    />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Hard Build Override</label>
                    <FormattedNumberInput
                      value={inputs.hardCostOverride ?? ''}
                      onChange={(val) => updateInput({ hardCostOverride: val === '' ? null : Math.max(0, Number(val) || 0) })}
                      prefix="$"
                      formatOnBlur={true}
                      placeholder={fmtDollar(costs.hardBuildCore)}
                      className="investor-form-input"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Pool & Dock Optional Add-ons (auto-hinted from building_characteristics) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', padding: '10px 12px', borderRadius: '10px', backgroundColor: '#FAF8F5', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#34292A', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(inputs.includePoolAddon)}
                  onChange={(e) => updateInput({ includePoolAddon: e.target.checked })}
                />
                {isNewBuild ? 'Include new pool' : 'Pool refresh'} ({fmtDollar(inputs.poolAddonCost)} est.)
              </label>
              {inputs.includePoolAddon && (
                <div style={{ width: '115px' }}>
                  <FormattedNumberInput
                    value={inputs.poolAddonCost ?? ''}
                    onChange={(val) => updateInput({ poolAddonCost: Math.max(0, Number(val) || 0) })}
                    prefix="$"
                    formatOnBlur={true}
                    className="investor-form-input"
                  />
                </div>
              )}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#34292A', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(inputs.includeDockAddon)}
                  onChange={(e) => updateInput({ includeDockAddon: e.target.checked })}
                />
                {isNewBuild ? 'Include new dock' : 'Dock repair'} ({fmtDollar(inputs.dockAddonCost)} est.)
              </label>
              {inputs.includeDockAddon && (
                <div style={{ width: '115px' }}>
                  <FormattedNumberInput
                    value={inputs.dockAddonCost ?? ''}
                    onChange={(val) => updateInput({ dockAddonCost: Math.max(0, Number(val) || 0) })}
                    prefix="$"
                    formatOnBlur={true}
                    className="investor-form-input"
                  />
                </div>
              )}
            </div>

            {/* Soft Costs % + Expandable Sub-Items */}
            <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(52, 41, 42, 0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <label style={{ ...LABEL_STYLE, marginBottom: 0 }}>
                  Soft Costs % (Architect, Engineering, Survey, Permits, Impact) <EstimateTag />
                </label>
                <button
                  type="button"
                  onClick={() => setShowSoftDetails((p) => !p)}
                  style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: 700, color: '#34292A', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  {showSoftDetails ? 'Hide breakdown' : 'Itemize %'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '130px' }}>
                  <FormattedNumberInput
                    value={inputs.softCostsPct ?? ''}
                    onChange={(val) => updateInput({ softCostsPct: Math.max(0, Math.min(45, Number(val) || 0)) })}
                    suffix="%"
                    allowDecimal={true}
                    className="investor-form-input"
                  />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#34292A' }}>
                  = {fmtDollar(costs.softCosts)} <span style={{ fontWeight: 500, color: 'rgba(52, 41, 42, 0.6)' }}>estimate</span>
                </span>
              </div>

              {showSoftDetails && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: '8px', marginTop: '10px', padding: '10px', borderRadius: '10px', backgroundColor: '#FAF8F5' }}>
                  {[
                    { key: 'architectPct', label: 'Architect %' },
                    { key: 'engineeringPct', label: 'Engineering %' },
                    { key: 'surveyPct', label: 'Survey %' },
                    { key: 'permitsPct', label: 'Permits %' },
                    { key: 'impactFeesPct', label: 'Impact fees %' }
                  ].map((sf) => (
                    <div key={sf.key}>
                      <label style={{ ...LABEL_STYLE, fontSize: '9px' }}>{sf.label}</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        max="20"
                        value={inputs.softCostsBreakdown?.[sf.key] ?? 0}
                        onChange={(e) => handleSoftSubChange(sf.key, e.target.value)}
                        className="investor-form-input"
                        style={{ padding: '6px 8px', fontSize: '12px' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Financing, Holding & Selling + Full Cost Ledger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* C. Financing, Holding & Selling Costs */}
          <div style={CARD_STYLE}>
            <span className="investor-section-header">
              3. FINANCING, HOLDING &amp; SELLING
              <EstimateTag />
            </span>

            <div style={{ marginBottom: '12px' }}>
              <label style={LABEL_STYLE}>Financing Structure</label>
              <SegmentedControl
                size="sm"
                value={inputs.financingMode}
                onChange={handleFinancingModeSwitch}
                options={[
                  { id: 'cash', label: 'Cash' },
                  { id: 'hard_money', label: 'Hard Money' },
                  { id: 'construction_loan', label: 'Construction Loan' }
                ]}
              />
            </div>

            {inputs.financingMode !== 'cash' && (
              <div style={{ marginBottom: '14px', padding: '12px', borderRadius: '12px', backgroundColor: '#FAF8F5', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                  <div>
                    <label style={{ ...LABEL_STYLE, fontSize: '9px' }}>Rate %</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="30"
                      value={inputs.interestRatePct ?? 0}
                      onChange={(e) => updateInput({ interestRatePct: Number(e.target.value) || 0 })}
                      className="investor-form-input"
                      style={{ padding: '7px 8px', fontSize: '12.5px' }}
                    />
                  </div>
                  <div>
                    <label style={{ ...LABEL_STYLE, fontSize: '9px' }}>Points</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="10"
                      value={inputs.pointsPct ?? 0}
                      onChange={(e) => updateInput({ pointsPct: Number(e.target.value) || 0 })}
                      className="investor-form-input"
                      style={{ padding: '7px 8px', fontSize: '12.5px' }}
                    />
                  </div>
                  <div>
                    <label style={{ ...LABEL_STYLE, fontSize: '9px' }}>LTC %</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="95"
                      value={inputs.ltcPct ?? 0}
                      onChange={(e) => updateInput({ ltcPct: Number(e.target.value) || 0 })}
                      className="investor-form-input"
                      style={{ padding: '7px 8px', fontSize: '12.5px' }}
                    />
                  </div>
                  <div>
                    <label style={{ ...LABEL_STYLE, fontSize: '9px' }}>Avg Draw %</label>
                    <input
                      type="number"
                      step="5"
                      min="10"
                      max="100"
                      value={inputs.drawUtilPct ?? 55}
                      onChange={(e) => updateInput({ drawUtilPct: Number(e.target.value) || 55 })}
                      className="investor-form-input"
                      style={{ padding: '7px 8px', fontSize: '12.5px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11px', color: 'rgba(52, 41, 42, 0.72)' }}>
                  <span>
                    Loan {fmtDollar(costs.loanAmount)} · Interest {fmtDollar(costs.financingInterest)} + Points {fmtDollar(costs.financingPoints)} + Fees/FL tax {fmtDollar(costs.financingFees)}
                  </span>
                  {inputs.financingMode === 'construction_loan' && (
                    <button
                      type="button"
                      onClick={() => setShowDrawSchedule((p) => !p)}
                      style={{ background: 'none', border: 'none', color: '#34292A', fontWeight: 700, fontSize: '10.5px', textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      {showDrawSchedule ? 'Hide draws' : 'Draw schedule'}
                    </button>
                  )}
                </div>

                {inputs.financingMode === 'construction_loan' && showDrawSchedule && (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(inputs.drawSchedule || DEFAULT_CONSTRUCTION_DRAW_SCHEDULE).map((st) => (
                      <div key={st.id} style={{ display: 'grid', gridTemplateColumns: '1fr 78px 90px', gap: '8px', alignItems: 'center', fontSize: '11px' }}>
                        <span style={{ fontWeight: 600, color: '#34292A' }}>{st.label}</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={st.pctOfBuild}
                          onChange={(e) => handleDrawStageChange(st.id, 'pctOfBuild', e.target.value)}
                          title="% of build budget drawn at this stage"
                          className="investor-form-input"
                          style={{ padding: '4px 6px', fontSize: '11.5px' }}
                        />
                        <span style={{ color: 'rgba(52, 41, 42, 0.65)', fontSize: '10.5px' }}>
                          @ mo {Math.max(1, Math.round(st.startMonthFrac * inputs.holdMonths))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Holding Costs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={LABEL_STYLE}>Millage ({inputs.county})</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  value={inputs.millageRate ?? 19}
                  onChange={(e) => updateInput({ millageRate: Number(e.target.value) || 0 })}
                  className="investor-form-input"
                />
                <span style={{ fontSize: '10px', color: 'rgba(52, 41, 42, 0.6)' }}>
                  Tax {fmtDollar(costs.monthlyTax)}/mo
                </span>
              </div>
              <div>
                <label style={LABEL_STYLE}>Insurance / mo</label>
                <FormattedNumberInput
                  value={inputs.monthlyInsurance ?? ''}
                  onChange={(val) => updateInput({ monthlyInsurance: Math.max(0, Number(val) || 0) })}
                  prefix="$"
                  className="investor-form-input"
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Utilities / mo</label>
                <FormattedNumberInput
                  value={inputs.monthlyUtilities ?? ''}
                  onChange={(val) => updateInput({ monthlyUtilities: Math.max(0, Number(val) || 0) })}
                  prefix="$"
                  className="investor-form-input"
                />
              </div>
            </div>

            {/* Selling & Buy Closing */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', paddingTop: '10px', borderTop: '1px solid rgba(52, 41, 42, 0.08)' }}>
              <div>
                <label style={{ ...LABEL_STYLE, fontSize: '9px' }}>Buy Close %</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="10"
                  value={inputs.buyClosingPct ?? 2}
                  onChange={(e) => updateInput({ buyClosingPct: Number(e.target.value) || 0 })}
                  className="investor-form-input"
                  style={{ padding: '7px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ ...LABEL_STYLE, fontSize: '9px' }}>Commission %</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="10"
                  value={inputs.sellCommissionPct ?? 5}
                  onChange={(e) => updateInput({ sellCommissionPct: Number(e.target.value) || 0 })}
                  className="investor-form-input"
                  style={{ padding: '7px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ ...LABEL_STYLE, fontSize: '9px' }}>Sell Close %</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="10"
                  value={inputs.sellClosingPct ?? 1}
                  onChange={(e) => updateInput({ sellClosingPct: Number(e.target.value) || 0 })}
                  className="investor-form-input"
                  style={{ padding: '7px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ ...LABEL_STYLE, fontSize: '9px' }}>FL Doc Stamps</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="3"
                  value={inputs.flDocStampsPct ?? 0.7}
                  onChange={(e) => updateInput({ flDocStampsPct: Number(e.target.value) || 0 })}
                  className="investor-form-input"
                  style={{ padding: '7px 8px', fontSize: '12px' }}
                />
              </div>
            </div>
          </div>

          {/* D. Itemized Cost Ledger */}
          <div style={CARD_STYLE}>
            <span className="investor-section-header">
              4. ITEMIZED COST STACK (ESTIMATE)
            </span>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '12.5px' }}>
              <tbody>
                {[
                  ['Purchase price', fmtDollar(costs.purchasePrice), 'County deed / entered'],
                  [`Buy closing (${inputs.buyClosingPct}%)`, fmtDollar(costs.buyClosing), 'Title, recording (estimate)'],
                  ...(isNewBuild ? [['Demolition lump sum', fmtDollar(costs.demoCost), 'Existing structure tear-down (est.)']] : []),
                  [
                    isNewBuild ? 'Hard construction' : 'Rehab hard cost',
                    fmtDollar(costs.hardCost),
                    costs.hardCostPerSqft != null ? `$${costs.hardCostPerSqft}/sf${costs.poolAddon || costs.dockAddon ? ' + site add-ons' : ''} (est.)` : 'estimate'
                  ],
                  [`Soft costs (${costs.softCostsPct}%)`, fmtDollar(costs.softCosts), 'Arch, eng, survey, permits, impact (est.)'],
                  [
                    `Financing (${FINANCING_MODES[costs.financingMode]?.label || costs.financingMode})`,
                    fmtDollar(costs.financingCosts),
                    costs.financingMode === 'cash' ? 'All cash' : `${inputs.interestRatePct}% · ${inputs.pointsPct} pts · ${costs.avgDrawnPct}% avg draw`
                  ],
                  [
                    `Holding (${metrics.holdMonths} mo)`,
                    fmtDollar(costs.holdingCosts),
                    `Tax ${fmtDollar(costs.monthlyTax)} + Ins ${fmtDollar(costs.monthlyInsurance)} + Util ${fmtDollar(costs.monthlyUtilities)}/mo`
                  ],
                  [
                    `Selling (${inputs.sellCommissionPct}% + ${inputs.sellClosingPct}% + ${costs.flDocStampsPct}% FL doc)`,
                    fmtDollar(costs.sellingCosts),
                    `Incl. ${fmtDollar(costs.flDocStampsCost)} FL deed doc stamps`
                  ]
                ].map(([label, amount, sub]) => (
                  <tr key={label} style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.07)' }}>
                    <td style={{ padding: '8px 0', color: '#34292A', fontWeight: 600 }}>
                      {label}
                      <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 400, color: 'rgba(52, 41, 42, 0.58)' }}>
                        {sub}
                      </span>
                    </td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: '#34292A', whiteSpace: 'nowrap' }}>
                      {amount}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '11px 0 4px', fontWeight: 700, color: '#34292A' }}>
                    Total Invested (All-In + Selling)
                  </td>
                  <td style={{ padding: '11px 0 4px', textAlign: 'right', fontWeight: 700, fontSize: '14px', color: '#34292A' }}>
                    {fmtDollar(costs.totalInvested)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 4. SCENARIOS (LOW / LIKELY / HIGH) + "MY VERSION" (70% RULE)      */}
      {/* ================================================================= */}
      <div style={CARD_STYLE}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
          <div>
            <span className="investor-section-header" style={{ marginBottom: '2px' }}>
              5. SCENARIO STRESS TEST &amp; MY VERSION (70% RULE + BUYING PROFILE)
            </span>
            <p style={{ margin: 0, fontSize: '12px', color: 'rgba(52, 41, 42, 0.68)' }}>
              Compare Low / Likely / High developer outcomes against your 70% Rule MAO ({fmtDollar(myVersion.mao70)}) and Buying Profile liquidity.
            </p>
          </div>
          <Pill
            variant="neutral"
            size="sm"
            style={{
              backgroundColor: myVersion.actualBelowMao ? '#EEF2EA' : 'rgba(189, 211, 226, 0.35)',
              border: myVersion.actualBelowMao ? '1px solid rgba(63, 90, 58, 0.3)' : '1px solid #859DCE',
              color: '#34292A',
              textTransform: 'none',
              fontWeight: 700
            }}
          >
            Actual buy is {fmtDollar(Math.abs(myVersion.deltaVsActualPurchase))} {myVersion.actualBelowMao ? 'below' : 'above'} 70% MAO
          </Pill>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'var(--font-sans, "Montserrat", sans-serif)', fontSize: '12.5px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '11px 12px', backgroundColor: '#FAF8F5', borderBottom: '1px solid rgba(52, 41, 42, 0.14)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.65)' }}>
                  Metric (Estimate)
                </th>
                <th style={{ textAlign: 'right', padding: '11px 12px', backgroundColor: '#FAF8F5', borderBottom: '1px solid rgba(52, 41, 42, 0.14)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#34292A' }}>Low (Conservative)</div>
                  <div style={{ fontSize: '9.5px', fontWeight: 500, color: 'rgba(52, 41, 42, 0.58)' }}>{scenarios.low.summary}</div>
                </th>
                <th style={{ textAlign: 'right', padding: '11px 12px', backgroundColor: '#FAF8F5', borderBottom: '1px solid rgba(52, 41, 42, 0.14)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#34292A' }}>Likely (Base)</div>
                  <div style={{ fontSize: '9.5px', fontWeight: 500, color: 'rgba(52, 41, 42, 0.58)' }}>{scenarios.likely.summary}</div>
                </th>
                <th style={{ textAlign: 'right', padding: '11px 12px', backgroundColor: '#FAF8F5', borderBottom: '1px solid rgba(52, 41, 42, 0.14)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#34292A' }}>High (Optimistic)</div>
                  <div style={{ fontSize: '9.5px', fontWeight: 500, color: 'rgba(52, 41, 42, 0.58)' }}>{scenarios.high.summary}</div>
                </th>
                <th style={{ textAlign: 'right', padding: '11px 14px', backgroundColor: '#34292A', color: '#FAF8F5', borderBottom: '1px solid rgba(250, 248, 245, 0.2)', borderTopRightRadius: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#BDD3E2' }}>My Version (70% Rule)</div>
                  <div style={{ fontSize: '9.5px', fontWeight: 500, color: 'rgba(250, 248, 245, 0.72)' }}>{myVersion.financingLabel}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Purchase / 70% MAO', fmtDollar(costs.purchasePrice), fmtDollar(costs.purchasePrice), fmtDollar(costs.purchasePrice), fmtDollar(myVersion.mao70)],
                ['Exit Price', fmtDollar(scenarios.low.exitPrice), fmtDollar(scenarios.likely.exitPrice), fmtDollar(scenarios.high.exitPrice), fmtDollar(scenarios.likely.exitPrice)],
                ['Hold Time', `${scenarios.low.holdMonths} mo`, `${scenarios.likely.holdMonths} mo`, `${scenarios.high.holdMonths} mo`, `${scenarios.likely.holdMonths} mo`],
                ['Total Invested', fmtDollar(scenarios.low.totalInvested), fmtDollar(scenarios.likely.totalInvested), fmtDollar(scenarios.high.totalInvested), fmtDollar(myVersion.totalInvested)],
                ['Cash Needed', fmtDollar(scenarios.low.cashNeeded), fmtDollar(scenarios.likely.cashNeeded), fmtDollar(scenarios.high.cashNeeded), fmtDollar(myVersion.cashNeeded)],
                ['Est. Net Profit', fmtDollar(scenarios.low.estProfit, true), fmtDollar(scenarios.likely.estProfit, true), fmtDollar(scenarios.high.estProfit, true), fmtDollar(myVersion.estProfit, true)],
                ['ROI (Est.)', fmtPct(scenarios.low.roiPct, 1), fmtPct(scenarios.likely.roiPct, 1), fmtPct(scenarios.high.roiPct, 1), fmtPct(myVersion.roiPct, 1)],
                ['Annualized ROI', fmtPct(scenarios.low.annualizedRoiPct, 1), fmtPct(scenarios.likely.annualizedRoiPct, 1), fmtPct(scenarios.high.annualizedRoiPct, 1), fmtPct(myVersion.annualizedRoiPct, 1)]
              ].map(([label, vLow, vLikely, vHigh, vMy], idx) => {
                const isProfitRow = label === 'Est. Net Profit';
                return (
                  <tr key={label}>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(52, 41, 42, 0.08)', fontWeight: isProfitRow ? 700 : 600, color: '#34292A' }}>
                      {label}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', borderBottom: '1px solid rgba(52, 41, 42, 0.08)', fontWeight: isProfitRow ? 700 : 500, color: '#34292A' }}>
                      {vLow}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', borderBottom: '1px solid rgba(52, 41, 42, 0.08)', fontWeight: isProfitRow ? 700 : 600, color: '#34292A', backgroundColor: 'rgba(189, 211, 226, 0.14)' }}>
                      {vLikely}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', borderBottom: '1px solid rgba(52, 41, 42, 0.08)', fontWeight: isProfitRow ? 700 : 500, color: '#34292A' }}>
                      {vHigh}
                    </td>
                    <td
                      style={{
                        padding: '9px 14px',
                        textAlign: 'right',
                        backgroundColor: '#34292A',
                        color: isProfitRow ? '#BDD3E2' : '#FAF8F5',
                        borderBottom: idx === 7 ? 'none' : '1px solid rgba(250, 248, 245, 0.1)',
                        fontWeight: isProfitRow ? 700 : 600,
                        borderBottomRightRadius: idx === 7 ? '10px' : 0
                      }}
                    >
                      {vMy}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Buying Profile Liquidity Fit Note */}
        <div style={{ marginTop: '12px', fontSize: '11.5px', color: 'rgba(52, 41, 42, 0.78)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <span>
            {myVersion.liquidCash != null
              ? myVersion.fitsLiquidCash
                ? `Buying Profile liquidity check: Fits your ${fmtDollar(myVersion.liquidCash)} liquid cash (after ${myVersion.reserveMonths}-mo reserve holdback of ${fmtDollar(myVersion.reserveHoldback)}).`
                : `Buying Profile liquidity check: Needs ${fmtDollar(myVersion.cashGap)} more liquid capital beyond your ${fmtDollar(myVersion.deployableCash)} deployable cash (after ${myVersion.reserveMonths}-mo reserves).`
              : 'Set your liquid cash & lender rate sheet in My Buying Profile to check capital fit.'}
          </span>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 5. NOTES, SAVE & SAVED BREAKDOWNS LIST                            */}
      {/* ================================================================= */}
      <div style={CARD_STYLE}>
        <span className="investor-section-header">6. SAVE ANALYSIS &amp; NOTES</span>
        <div className="investor-form-grid-2" style={{ marginBottom: '12px' }}>
          <div>
            <label style={LABEL_STYLE}>Breakdown Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isNewBuild ? 'e.g. Coastal Spec Demo → New Build' : 'e.g. Full Gut Developer Flip'}
              className="investor-form-input"
            />
          </div>
          <div>
            <label style={LABEL_STYLE}>Notes (saved into Deal Report PDF)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Permit observations, finish level, builder comps, contractor bid notes..."
              className="investor-form-input"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button variant="primary" size="sm" onClick={() => handleSaveBreakdown(false)} disabled={isSaving}>
            {isSaving ? 'Saving…' : activeSavedId ? 'Update Saved Breakdown' : 'Save Deal Breakdown'}
          </Button>
          {activeSavedId && (
            <Button variant="secondary" size="sm" onClick={() => handleSaveBreakdown(true)} disabled={isSaving}>
              Save as New Copy
            </Button>
          )}
        </div>

        {!loadingSaved && savedBreakdowns.length > 0 && (
          <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(52, 41, 42, 0.1)' }}>
            <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>
              SAVED BREAKDOWNS FOR THIS PROPERTY ({savedBreakdowns.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {savedBreakdowns.map((item) => {
                const isSelected = item.id === activeSavedId;
                const rMetrics = item.results?.metrics || {};
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      backgroundColor: isSelected ? 'rgba(189, 211, 226, 0.28)' : '#FAF8F5',
                      border: isSelected ? '1px solid #859DCE' : '1px solid rgba(52, 41, 42, 0.08)'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#34292A' }}>
                        {item.title || (item.deal_type === 'demo_new_build' ? 'Demo → New Build' : 'Flip')}{' '}
                        <span style={{ fontWeight: 500, color: 'rgba(52, 41, 42, 0.65)', fontSize: '11px' }}>
                          · Est. profit {fmtDollar(rMetrics.estProfit, true)} ({fmtPct(rMetrics.roiPct, 1)} ROI)
                        </span>
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.58)' }}>
                        Updated {item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'recently'}
                        {item.notes ? ` · ${item.notes}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button variant="secondary" size="sm" onClick={() => handleLoadSaved(item)}>
                        {isSelected ? 'Loaded' : 'Load'}
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSaved(item.id)}
                        style={{ background: 'none', border: 'none', color: '#41101B', fontSize: '11px', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Property Appraiser Record Upload Modal (Strictly Non-PII) */}
      <PaRecordUploadModal
        isOpen={isPaModalOpen}
        onClose={() => setIsPaModalOpen(false)}
        property={property || { address: inputs.address, parcel_id: inputs.parcelId, county: inputs.county }}
        onApply={handleApplyPaRecord}
        showToast={showToast}
      />

      {/* Manual Add Permit Modal */}
      <AddPermitModal
        isOpen={isAddPermitOpen}
        onClose={() => setIsAddPermitOpen(false)}
        propertyId={property?.id || savedPropertyId}
        folio={inputs.parcelId || finderRow?.parcel_id}
        county={inputs.county || 'Broward'}
        onPermitAdded={handlePermitAdded}
        showToast={showToast}
      />
    </section>
  );
}

