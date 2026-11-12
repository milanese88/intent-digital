import React, { useState } from 'react';
import { Button, Pill, SegmentedControl } from '../ui';
import { COMP_CONDITIONS } from './valuationEngine.js';

function formatSignedCurrency(amount) {
  const num = Math.round(Number(amount) || 0);
  if (num > 0) return `+$${num.toLocaleString('en-US')}`;
  if (num < 0) return `\u2212$${Math.abs(num).toLocaleString('en-US')}`;
  return '$0';
}

function formatDollar(amount) {
  if (amount == null || isNaN(Number(amount))) return '—';
  return `$${Math.round(Number(amount)).toLocaleString('en-US')}`;
}

function formatShortSoldDate(dStr) {
  if (!dStr) return 'No date';
  const d = new Date(dStr);
  if (isNaN(d.getTime())) return dStr;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const CONDITION_CYCLE = ['as_is', 'updated', 'fully_renovated'];

const GRID_ROWS = [
  { key: 'time', label: 'Sale Date / Time', sub: 'Market trend' },
  { key: 'gla', label: 'Living Area (GLA)', sub: 'Size differential' },
  { key: 'bed_bath', label: 'Beds & Baths', sub: 'Room & bath count' },
  { key: 'condition', label: 'Condition (UAD)', sub: 'Kitchen & baths' },
  { key: 'pool', label: 'Pool & Outdoor', sub: 'In-ground pool' },
  { key: 'garage', label: 'Garage Capacity', sub: 'Enclosed bays' },
  { key: 'windstorm', label: 'Windstorm & Roof', sub: 'Impact / roof age' },
  { key: 'location_site', label: 'Location & Site', sub: 'Waterfront & lot sf' }
];

export default function AppraisalGridSection({
  grid,
  mode,
  onModeChange,
  sizeMethod,
  onSizeMethodChange,
  subjectOverrides = {},
  onSubjectOverrideChange,
  onToggleCompUsed,
  onChangeCompCondition,
  onOverrideCompCell,
  onOpenEditComp,
  onOpenAddComp,
  onGoToCompsTab,
  customWeights,
  onWeightChange,
  onAutoWeights,
  onNormalizeWeights,
  onUseInDeal,
  onSaveAppraisal,
  isSavingAppraisal = false,
  lastSavedAt = null,
  onOpenLibraryModal,
  onOpenLearningLabLesson
}) {
  const [editingCell, setEditingCell] = useState(null); // { compId, rowKey, draft }

  const {
    tier,
    effectiveRates,
    localMedianPpsf,
    subjectSummary,
    comps = [],
    usedComps = [],
    weightValidation,
    reconciledValue,
    rangeLow,
    rangeHigh,
    reconciledPpsf,
    confidencePct,
    confidenceScore,
    cvPct,
    avgGrossPct,
    checks = []
  } = grid;

  const localRatePreview = localMedianPpsf
    ? Math.round(localMedianPpsf * (Number(grid.library?.localPpsfFactor) || 0.35))
    : effectiveRates.glaRate;
  const libraryRatePreview = Number(grid.library?.glaRates?.[tier.key]) || tier.defaultGlaRate;

  const startCellEdit = (comp, rowKey, currentAmount) => {
    setEditingCell({
      compId: comp.id,
      rowKey,
      draft: String(currentAmount || 0)
    });
  };

  const commitCellEdit = (comp, rowKey) => {
    if (!editingCell) return;
    const raw = String(editingCell.draft).replace(/[$,\s]/g, '').replace('\u2212', '-');
    if (raw === '' || isNaN(Number(raw))) {
      setEditingCell(null);
      return;
    }
    onOverrideCompCell && onOverrideCompCell(comp, rowKey, Math.round(Number(raw)));
    setEditingCell(null);
  };

  const renderAdjustmentBadge = (comp, rowKey, cell) => {
    const isEditing = editingCell && editingCell.compId === comp.id && editingCell.rowKey === rowKey;
    if (isEditing) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <input
            type="text"
            autoFocus
            value={editingCell.draft}
            onChange={(e) => setEditingCell((prev) => ({ ...prev, draft: e.target.value }))}
            onBlur={() => commitCellEdit(comp, rowKey)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitCellEdit(comp, rowKey);
              } else if (e.key === 'Escape') {
                setEditingCell(null);
              }
            }}
            style={{
              width: '78px',
              padding: '2px 6px',
              borderRadius: '6px',
              border: '1px solid var(--burgundy)',
              fontFamily: 'var(--font-sans)',
              fontSize: '11.5px',
              fontWeight: 700,
              textAlign: 'right',
              color: 'var(--espresso)',
              backgroundColor: '#FFFFFF',
              outline: 'none'
            }}
          />
        </span>
      );
    }

    const isAdd = cell.direction === 'add';
    const isSub = cell.direction === 'subtract';

    const badgeBg = isAdd
      ? 'var(--positive-bg, #EEF2EA)'
      : isSub
        ? 'rgba(65, 16, 27, 0.09)'
        : 'rgba(30, 21, 9, 0.04)';
    const badgeColor = isAdd
      ? 'var(--positive, #3F5A3A)'
      : isSub
        ? 'var(--burgundy, #41101B)'
        : 'rgba(82, 69, 60, 0.72)';
    const badgeBorder = isAdd
      ? '1px solid rgba(63, 90, 58, 0.28)'
      : isSub
        ? '1px solid rgba(65, 16, 27, 0.25)'
        : '1px solid rgba(30, 21, 9, 0.08)';

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <button
          type="button"
          onClick={() => startCellEdit(comp, rowKey, cell.amount)}
          title={
            cell.isOverridden
              ? `Custom override (auto was ${formatSignedCurrency(cell.computedAmount)}). Click to edit.`
              : `${isAdd ? 'CIA (Comp Inferior → Add)' : isSub ? 'CBS (Comp Better → Subtract)' : 'Equal / within threshold'}. Click to override.`
          }
          style={{
            backgroundColor: badgeBg,
            color: badgeColor,
            border: badgeBorder,
            borderRadius: '999px',
            padding: '2px 9px',
            fontFamily: 'var(--font-sans)',
            fontSize: '11.5px',
            fontWeight: 700,
            letterSpacing: '0.01em',
            cursor: 'pointer',
            lineHeight: 1.35,
            whiteSpace: 'nowrap'
          }}
        >
          {formatSignedCurrency(cell.amount)}
          {cell.isOverridden ? '*' : ''}
        </button>
        {cell.isOverridden && (
          <button
            type="button"
            title="Reset to calculated adjustment"
            onClick={() => onOverrideCompCell && onOverrideCompCell(comp, rowKey, null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '11px',
              cursor: 'pointer',
              padding: '0 2px',
              lineHeight: 1
            }}
          >
            &#8634;
          </button>
        )}
      </span>
    );
  };

  const renderSubjectRowValue = (rowKey) => {
    switch (rowKey) {
      case 'time':
        return <span style={{ opacity: 0.9 }}>Current ({effectiveRates.monthlyTrendPct}%/mo)</span>;
      case 'gla':
        return (
          <span>
            {subjectSummary.sqft > 0 ? `${subjectSummary.sqft.toLocaleString()} sf` : 'Add sqft'}
            <span style={{ display: 'block', fontSize: '10.5px', color: 'rgba(250, 248, 245, 0.65)' }}>
              @${effectiveRates.glaRate}/sf · ±{effectiveRates.minGlaThreshold} sf
            </span>
          </span>
        );
      case 'bed_bath':
        return (
          <span>
            {[
              subjectSummary.beds != null ? `${subjectSummary.beds} bd` : null,
              subjectSummary.baths != null ? `${subjectSummary.baths} ba` : null
            ].filter(Boolean).join(' / ') || '—'}
          </span>
        );
      case 'condition':
        return (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: mode === 'arv' ? 'rgba(63, 90, 58, 0.38)' : 'rgba(250, 248, 245, 0.14)',
              border: '1px solid rgba(250, 248, 245, 0.24)',
              fontSize: '11px',
              fontWeight: 600,
              color: '#FAF8F5'
            }}
          >
            {subjectSummary.conditionLabel}
          </span>
        );
      case 'pool':
        return (
          <button
            type="button"
            onClick={() =>
              onSubjectOverrideChange &&
              onSubjectOverrideChange('pool', !subjectOverrides.pool)
            }
            title="Click to toggle Subject pool attribute"
            style={{
              background: 'rgba(250, 248, 245, 0.12)',
              border: '1px solid rgba(250, 248, 245, 0.24)',
              color: '#FAF8F5',
              borderRadius: '999px',
              padding: '2px 9px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {subjectSummary.poolLabel}
          </button>
        );
      case 'garage': {
        const currBays = subjectOverrides.garage_bays != null ? Number(subjectOverrides.garage_bays) : 2;
        return (
          <button
            type="button"
            onClick={() => {
              const next = (currBays + 1) % 4;
              onSubjectOverrideChange && onSubjectOverrideChange('garage_bays', next);
            }}
            title="Click to cycle Subject garage bays (0–3)"
            style={{
              background: 'rgba(250, 248, 245, 0.12)',
              border: '1px solid rgba(250, 248, 245, 0.24)',
              color: '#FAF8F5',
              borderRadius: '999px',
              padding: '2px 9px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {subjectSummary.garageLabel}
          </button>
        );
      }
      case 'windstorm':
        return (
          <button
            type="button"
            onClick={() =>
              onSubjectOverrideChange &&
              onSubjectOverrideChange('impact_windows', !subjectOverrides.impact_windows)
            }
            title="Click to toggle Subject impact glass protection"
            style={{
              background: 'rgba(250, 248, 245, 0.12)',
              border: '1px solid rgba(250, 248, 245, 0.24)',
              color: '#FAF8F5',
              borderRadius: '999px',
              padding: '2px 9px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {subjectSummary.windstormLabel}
          </button>
        );
      case 'location_site':
        return (
          <button
            type="button"
            onClick={() =>
              onSubjectOverrideChange &&
              onSubjectOverrideChange('waterfront', !subjectOverrides.waterfront)
            }
            title="Click to toggle Subject waterfront / canal status"
            style={{
              background: 'rgba(250, 248, 245, 0.12)',
              border: '1px solid rgba(250, 248, 245, 0.24)',
              color: '#FAF8F5',
              borderRadius: '999px',
              padding: '2px 9px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {subjectSummary.locationSiteLabel}
          </button>
        );
      default:
        return '—';
    }
  };

  const confidenceBarColor =
    confidenceScore === 'High'
      ? '#62A36B'
      : confidenceScore === 'Medium'
        ? '#E3B363'
        : '#D97B73';

  const canUseInDeal = Boolean(reconciledValue && reconciledValue > 0 && weightValidation.valid);

  return (
    <section style={{ marginBottom: '36px' }}>
      {/* ===================================================================== */}
      {/* 1. TOP BAR: As-Is / ARV Toggle · Size-Method Toggle · Tier Chip       */}
      {/* ===================================================================== */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border, #E4DDD3)',
          borderRadius: '20px',
          padding: '20px 24px',
          marginBottom: '18px',
          boxShadow: 'var(--shadow-subtle, 0 4px 18px rgba(30, 21, 9, 0.04))'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px'
          }}
        >
          {/* Left: Title + Tier Chip */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)'
                }}
              >
                SALES COMPARISON · CIA / CBS ADJUSTMENT GRID
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
                <h2
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                    fontSize: '28px',
                    fontWeight: 400,
                    color: 'var(--espresso, #1E1509)',
                    lineHeight: 1.1
                  }}
                >
                  Appraisal &amp; Reconciliation
                </h2>

                {/* Auto-Selected South Florida Tier Chip */}
                <Pill
                  variant="neutral"
                  title={`${tier.name} (${tier.submarkets}) · Auto-selected from unadjusted median comp sale price · GLA threshold ±${effectiveRates.minGlaThreshold} sf`}
                  style={{
                    backgroundColor: 'var(--sand, #F7F3EE)',
                    border: '1px solid rgba(65, 16, 27, 0.25)',
                    color: 'var(--burgundy, #41101B)'
                  }}
                >
                  {tier.shortChip} · ${effectiveRates.glaRate}/sf
                </Pill>
              </div>
            </div>
          </div>

          {/* Right: As-Is / ARV Toggle + Size-Method Toggle + Add Comp */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            {/* As-Is / ARV Toggle */}
            <SegmentedControl
              size="sm"
              value={mode}
              onChange={onModeChange}
              options={[
                { id: 'as_is', label: 'As-Is' },
                { id: 'arv', label: 'ARV' }
              ]}
            />

            {/* Size-Method Toggle: 35% of local $/sf vs Library rate */}
            <SegmentedControl
              size="sm"
              value={sizeMethod}
              onChange={onSizeMethodChange}
              options={[
                {
                  id: 'local_35',
                  label: `${Math.round((Number(grid.library?.localPpsfFactor) || 0.35) * 100)}% local $/sf ($${localRatePreview})`
                },
                {
                  id: 'library',
                  label: `Library rate ($${libraryRatePreview}/sf)`
                }
              ]}
            />

            <Button variant="secondary" size="sm" onClick={onOpenAddComp}>
              + Add comp
            </Button>
          </div>
        </div>

        {/* Sign Legend Strip */}
        <div
          style={{
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(30, 21, 9, 0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            fontFamily: 'var(--font-sans)',
            fontSize: '11.5px',
            color: 'var(--muted)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--positive, #3F5A3A)',
                  display: 'inline-block'
                }}
              />
              <strong style={{ color: 'var(--positive, #3F5A3A)' }}>Green = Add (+)</strong>
              <span>Comp inferior (CIA)</span>
            </span>

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--burgundy, #41101B)',
                  display: 'inline-block'
                }}
              />
              <strong style={{ color: 'var(--burgundy, #41101B)' }}>Burgundy = Subtract (&minus;)</strong>
              <span>Comp superior (CBS)</span>
            </span>
          </div>

          <span style={{ fontSize: '11px' }}>
            Click any adjustment pill to override · Click subject chips to toggle features
          </span>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. ADJUSTMENT GRID: Subject in Espresso + Comp Columns (USED / OFF)   */}
      {/* ===================================================================== */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border, #E4DDD3)',
          borderRadius: '20px',
          overflow: 'hidden',
          marginBottom: '22px',
          boxShadow: 'var(--shadow-card, 0 10px 30px rgba(30, 21, 9, 0.05))'
        }}
      >
        {comps.length === 0 ? (
          <div style={{ padding: '44px 28px', textAlign: 'center' }}>
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '22px',
                color: 'var(--espresso)',
                margin: '0 0 8px 0'
              }}
            >
              Add 3–5 comparable sales to populate the appraisal adjustment grid
            </p>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                color: 'var(--muted)',
                margin: '0 0 18px 0'
              }}
            >
              Pick verified Palm Beach &amp; Broward sales in the Value &amp; Comps tab, or add an MLS sale manually.
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {onGoToCompsTab && (
                <Button variant="primary" size="sm" onClick={onGoToCompsTab}>
                  Pick comps in Value &amp; Comps &rarr;
                </Button>
              )}
              <Button variant={onGoToCompsTab ? 'secondary' : 'primary'} size="sm" onClick={onOpenAddComp}>
                + Add comparable sale
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table
              style={{
                width: '100%',
                minWidth: `${420 + comps.length * 225}px`,
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontFamily: 'var(--font-sans)'
              }}
            >
              <thead>
                <tr>
                  {/* Column 1: Line Item Header */}
                  <th
                    style={{
                      width: '185px',
                      minWidth: '175px',
                      padding: '18px 18px',
                      textAlign: 'left',
                      verticalAlign: 'bottom',
                      backgroundColor: 'var(--sand, #F7F3EE)',
                      borderBottom: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)'
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'var(--muted)',
                        marginBottom: '4px'
                      }}
                    >
                      FEATURE / METRIC
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--espresso)' }}>
                      {mode === 'arv' ? 'Post-Rehab Target' : 'As-Is Baseline'}
                    </span>
                  </th>

                  {/* Column 2: SUBJECT COLUMN IN ESPRESSO */}
                  <th
                    style={{
                      width: '225px',
                      minWidth: '215px',
                      padding: '18px 18px',
                      textAlign: 'left',
                      verticalAlign: 'top',
                      backgroundColor: 'var(--espresso, #1E1509)',
                      color: 'var(--on-dark, #FAF8F5)',
                      borderBottom: '1px solid rgba(250, 248, 245, 0.14)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '6px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                          color: 'rgba(250, 248, 245, 0.68)'
                        }}
                      >
                        SUBJECT
                      </span>
                      <span
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor: mode === 'arv' ? 'rgba(98, 163, 107, 0.25)' : 'rgba(250, 248, 245, 0.14)',
                          color: '#FAF8F5'
                        }}
                      >
                        {mode === 'arv' ? 'ARV TARGET' : 'AS-IS'}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '18px',
                        fontWeight: 400,
                        lineHeight: 1.2,
                        color: '#FAF8F5',
                        marginBottom: '4px'
                      }}
                    >
                      {subjectSummary.address}
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 400, color: 'rgba(250, 248, 245, 0.72)' }}>
                      {subjectSummary.listPrice
                        ? `Ask ${formatDollar(subjectSummary.listPrice)}`
                        : subjectSummary.justValue
                          ? `Just Val ${formatDollar(subjectSummary.justValue)}`
                          : 'Unadjusted anchor'}
                    </div>
                  </th>

                  {/* Columns 3..N: COMPARABLE COLUMNS WITH USED / OFF TOGGLES */}
                  {comps.map((comp, idx) => {
                    const isUsed = comp.isUsed;
                    const condKey = comp.conditionMeta?.key || 'unknown';
                    const isRenov = comp.conditionMeta?.isRenovated;

                    return (
                      <th
                        key={comp.id}
                        style={{
                          width: '235px',
                          minWidth: '220px',
                          padding: '16px 16px',
                          textAlign: 'left',
                          verticalAlign: 'top',
                          backgroundColor: isUsed ? '#FFFFFF' : 'rgba(242, 239, 234, 0.65)',
                          borderBottom: '1px solid var(--border)',
                          borderLeft: '1px solid var(--border)',
                          opacity: isUsed ? 1 : 0.62,
                          transition: 'opacity 0.18s ease, background-color 0.18s ease'
                        }}
                      >
                        {/* Top strip: COMP # + USED / OFF Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              color: 'var(--muted)'
                            }}
                          >
                            COMP {idx + 1}
                          </span>

                          {/* USED / OFF Segmented Pill Toggle */}
                          <div
                            role="group"
                            aria-label={`Include ${comp.address}`}
                            style={{
                              display: 'inline-flex',
                              borderRadius: '999px',
                              border: '1px solid var(--border-strong)',
                              backgroundColor: 'var(--beige, #F2EFEA)',
                              padding: '2px'
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => !isUsed && onToggleCompUsed && onToggleCompUsed(comp)}
                              style={{
                                border: 'none',
                                borderRadius: '999px',
                                padding: '2px 8px',
                                fontSize: '9.5px',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                cursor: 'pointer',
                                backgroundColor: isUsed ? 'var(--positive, #3F5A3A)' : 'transparent',
                                color: isUsed ? '#FAF8F5' : 'var(--muted)'
                              }}
                            >
                              USED
                            </button>
                            <button
                              type="button"
                              onClick={() => isUsed && onToggleCompUsed && onToggleCompUsed(comp)}
                              style={{
                                border: 'none',
                                borderRadius: '999px',
                                padding: '2px 8px',
                                fontSize: '9.5px',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                cursor: 'pointer',
                                backgroundColor: !isUsed ? 'var(--espresso, #1E1509)' : 'transparent',
                                color: !isUsed ? '#FAF8F5' : 'var(--muted)'
                              }}
                            >
                              OFF
                            </button>
                          </div>
                        </div>

                        {/* Comp Address */}
                        <div
                          style={{
                            fontSize: '13.5px',
                            fontWeight: 700,
                            color: 'var(--espresso)',
                            lineHeight: 1.25,
                            marginBottom: '4px'
                          }}
                        >
                          {comp.address}
                        </div>

                        {/* Distance · Date · Edit + Condition Cycle Chip */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted)' }}>
                            {comp.distance_mi != null ? `${comp.distance_mi} mi` : '— mi'} · {formatShortSoldDate(comp.sold_date)}
                          </span>

                          <button
                            type="button"
                            onClick={() => onOpenEditComp && onOpenEditComp(comp)}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontSize: '11px',
                              fontWeight: 600,
                              color: 'var(--burgundy)',
                              textDecoration: 'underline',
                              cursor: 'pointer'
                            }}
                          >
                            Edit
                          </button>
                        </div>

                        <div style={{ marginTop: '8px' }}>
                          <button
                            type="button"
                            title="Click to cycle comp condition (As-is → Updated → Fully renovated)"
                            onClick={() => {
                              const currIdx = CONDITION_CYCLE.indexOf(condKey);
                              const nextKey = CONDITION_CYCLE[(currIdx + 1) % CONDITION_CYCLE.length];
                              onChangeCompCondition && onChangeCompCondition(comp, nextKey);
                            }}
                            style={{
                              borderRadius: '999px',
                              padding: '2px 9px',
                              fontSize: '10px',
                              fontWeight: 700,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              cursor: 'pointer',
                              backgroundColor: isRenov ? 'var(--positive-bg, #EEF2EA)' : 'var(--beige, #F2EFEA)',
                              color: isRenov ? 'var(--positive, #3F5A3A)' : 'var(--espresso)',
                              border: isRenov ? '1px solid rgba(63, 90, 58, 0.28)' : '1px solid var(--border)'
                            }}
                          >
                            {(COMP_CONDITIONS[condKey] || COMP_CONDITIONS.unknown).label} &#8635;
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {/* Row 0: Unadjusted Sale Price */}
                <tr>
                  <td
                    style={{
                      padding: '12px 18px',
                      backgroundColor: 'var(--sand, #F7F3EE)',
                      borderBottom: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--espresso)'
                    }}
                  >
                    Unadjusted Sale Price
                  </td>
                  <td
                    style={{
                      padding: '12px 18px',
                      backgroundColor: 'var(--espresso, #1E1509)',
                      color: '#FAF8F5',
                      borderBottom: '1px solid rgba(250, 248, 245, 0.12)',
                      fontSize: '13px',
                      fontWeight: 600
                    }}
                  >
                    {subjectSummary.listPrice ? `${formatDollar(subjectSummary.listPrice)} (Ask)` : '—'}
                  </td>
                  {comps.map((comp) => (
                    <td
                      key={comp.id}
                      style={{
                        padding: '12px 16px',
                        backgroundColor: comp.isUsed ? 'rgba(247, 243, 238, 0.45)' : 'rgba(242, 239, 234, 0.5)',
                        borderBottom: '1px solid var(--border)',
                        borderLeft: '1px solid var(--border)',
                        opacity: comp.isUsed ? 1 : 0.55
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--espresso)' }}>
                          {comp.soldPrice > 0 ? formatDollar(comp.soldPrice) : '—'}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>
                          {comp.compPpsf ? `$${comp.compPpsf}/sf` : ''}
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>

                {/* Feature Adjustment Rows */}
                {GRID_ROWS.map((row) => (
                  <tr key={row.key}>
                    <td
                      style={{
                        padding: '11px 18px',
                        backgroundColor: 'var(--sand, #F7F3EE)',
                        borderBottom: '1px solid var(--border)',
                        borderRight: '1px solid var(--border)'
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--espresso)' }}>
                        {row.label}
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--muted)' }}>
                        {row.sub}
                      </div>
                    </td>

                    {/* Subject Espresso Cell */}
                    <td
                      style={{
                        padding: '11px 18px',
                        backgroundColor: 'var(--espresso, #1E1509)',
                        color: '#FAF8F5',
                        borderBottom: '1px solid rgba(250, 248, 245, 0.1)',
                        fontSize: '12px'
                      }}
                    >
                      {renderSubjectRowValue(row.key)}
                    </td>

                    {/* Comp Feature + Green/Burgundy Adjustment Cell */}
                    {comps.map((comp) => {
                      const cell = comp.cells[row.key];
                      return (
                        <td
                          key={comp.id}
                          style={{
                            padding: '10px 16px',
                            backgroundColor: comp.isUsed ? '#FFFFFF' : 'rgba(242, 239, 234, 0.5)',
                            borderBottom: '1px solid var(--border)',
                            borderLeft: '1px solid var(--border)',
                            opacity: comp.isUsed ? 1 : 0.55
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px'
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '12px', color: 'var(--espresso)', fontWeight: 500 }}>
                                {cell.spec}
                              </div>
                              {cell.note && (
                                <div style={{ fontSize: '10px', color: 'var(--muted)' }}>
                                  {cell.note}
                                </div>
                              )}
                            </div>

                            {renderAdjustmentBadge(comp, row.key, cell)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* ============================================================= */}
                {/* SUMMARY FOOTER ROWS: Net · Gross · Adjusted price · Weight    */}
                {/* ============================================================= */}

                {/* Summary Row 1: NET */}
                <tr>
                  <td
                    style={{
                      padding: '12px 18px',
                      backgroundColor: 'var(--beige, #F2EFEA)',
                      borderTop: '1.5px solid var(--border-strong)',
                      borderBottom: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--espresso)'
                    }}
                  >
                    Net
                    <span style={{ display: 'block', fontSize: '10px', fontWeight: 500, color: 'var(--muted)' }}>
                      Guideline &le; 15%
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '12px 18px',
                      backgroundColor: 'var(--espresso, #1E1509)',
                      color: 'rgba(250, 248, 245, 0.65)',
                      borderTop: '1.5px solid rgba(250, 248, 245, 0.22)',
                      borderBottom: '1px solid rgba(250, 248, 245, 0.1)',
                      fontSize: '12px'
                    }}
                  >
                    —
                  </td>
                  {comps.map((comp) => {
                    const netColor = comp.netAdjustment > 0
                      ? 'var(--positive, #3F5A3A)'
                      : comp.netAdjustment < 0
                        ? 'var(--burgundy, #41101B)'
                        : 'var(--espresso)';
                    return (
                      <td
                        key={comp.id}
                        style={{
                          padding: '12px 16px',
                          backgroundColor: comp.isUsed ? 'rgba(247, 243, 238, 0.6)' : 'rgba(242, 239, 234, 0.5)',
                          borderTop: '1.5px solid var(--border-strong)',
                          borderBottom: '1px solid var(--border)',
                          borderLeft: '1px solid var(--border)',
                          opacity: comp.isUsed ? 1 : 0.55
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: netColor }}>
                            {formatSignedCurrency(comp.netAdjustment)}
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '1px 7px',
                              borderRadius: '999px',
                              backgroundColor: comp.isHighNet ? 'var(--warning-bg, #F7EEDC)' : 'transparent',
                              color: comp.isHighNet ? 'var(--warning, #7A5212)' : 'var(--muted)',
                              border: comp.isHighNet ? '1px solid rgba(122, 82, 18, 0.3)' : 'none'
                            }}
                          >
                            {comp.netAdjustmentPct.toFixed(1)}%{comp.isHighNet ? ' !' : ''}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Summary Row 2: GROSS */}
                <tr>
                  <td
                    style={{
                      padding: '12px 18px',
                      backgroundColor: 'var(--beige, #F2EFEA)',
                      borderBottom: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--espresso)'
                    }}
                  >
                    Gross
                    <span style={{ display: 'block', fontSize: '10px', fontWeight: 500, color: 'var(--muted)' }}>
                      Guideline &le; 25%
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '12px 18px',
                      backgroundColor: 'var(--espresso, #1E1509)',
                      color: 'rgba(250, 248, 245, 0.65)',
                      borderBottom: '1px solid rgba(250, 248, 245, 0.1)',
                      fontSize: '12px'
                    }}
                  >
                    —
                  </td>
                  {comps.map((comp) => (
                    <td
                      key={comp.id}
                      style={{
                        padding: '12px 16px',
                        backgroundColor: comp.isUsed ? 'rgba(247, 243, 238, 0.6)' : 'rgba(242, 239, 234, 0.5)',
                        borderBottom: '1px solid var(--border)',
                        borderLeft: '1px solid var(--border)',
                        opacity: comp.isUsed ? 1 : 0.55
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--espresso)' }}>
                          {formatDollar(comp.grossAdjustment)}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '1px 7px',
                            borderRadius: '999px',
                            backgroundColor: comp.isHighGross ? 'var(--negative-bg, #F5E6E3)' : 'transparent',
                            color: comp.isHighGross ? 'var(--negative, #8A2A1E)' : 'var(--muted)',
                            border: comp.isHighGross ? '1px solid rgba(138, 42, 30, 0.3)' : 'none'
                          }}
                        >
                          {comp.grossAdjustmentPct.toFixed(1)}%{comp.isHighGross ? ' !' : ''}
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>

                {/* Summary Row 3: ADJUSTED PRICE */}
                <tr>
                  <td
                    style={{
                      padding: '14px 18px',
                      backgroundColor: 'var(--beige, #F2EFEA)',
                      borderBottom: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: 'var(--espresso)'
                    }}
                  >
                    Adjusted price
                  </td>
                  <td
                    style={{
                      padding: '14px 18px',
                      backgroundColor: 'var(--espresso, #1E1509)',
                      color: '#FAF8F5',
                      borderBottom: '1px solid rgba(250, 248, 245, 0.1)',
                      fontFamily: 'var(--font-display)',
                      fontSize: '18px'
                    }}
                  >
                    {reconciledValue ? formatDollar(reconciledValue) : '—'}
                  </td>
                  {comps.map((comp) => (
                    <td
                      key={comp.id}
                      style={{
                        padding: '14px 16px',
                        backgroundColor: comp.isUsed ? '#FFFFFF' : 'rgba(242, 239, 234, 0.5)',
                        borderBottom: '1px solid var(--border)',
                        borderLeft: '1px solid var(--border)',
                        opacity: comp.isUsed ? 1 : 0.55
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '20px',
                            fontWeight: 400,
                            color: 'var(--espresso)'
                          }}
                        >
                          {comp.adjustedPrice > 0 ? formatDollar(comp.adjustedPrice) : '—'}
                        </span>
                        {comp.adjustedPpsf && (
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)' }}>
                            ${comp.adjustedPpsf}/sf
                          </span>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>

                {/* Summary Row 4: WEIGHT */}
                <tr>
                  <td
                    style={{
                      padding: '12px 18px',
                      backgroundColor: 'var(--beige, #F2EFEA)',
                      borderRight: '1px solid var(--border)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--espresso)'
                    }}
                  >
                    Weight
                  </td>
                  <td
                    style={{
                      padding: '12px 18px',
                      backgroundColor: 'var(--espresso, #1E1509)',
                      color: 'rgba(250, 248, 245, 0.85)',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      letterSpacing: '0.06em'
                    }}
                  >
                    &sum; w = {usedComps.length > 0 ? `${weightValidation.sumPct.toFixed(1)}%` : '0%'}
                  </td>
                  {comps.map((comp) => (
                    <td
                      key={comp.id}
                      style={{
                        padding: '12px 16px',
                        backgroundColor: comp.isUsed ? 'rgba(247, 243, 238, 0.45)' : 'rgba(242, 239, 234, 0.5)',
                        borderLeft: '1px solid var(--border)',
                        opacity: comp.isUsed ? 1 : 0.55
                      }}
                    >
                      {comp.isUsed ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--burgundy)', minWidth: '42px' }}>
                            {comp.weightPct.toFixed(1)}%
                          </span>
                          <div
                            style={{
                              flex: 1,
                              height: '6px',
                              borderRadius: '999px',
                              backgroundColor: 'rgba(30, 21, 9, 0.08)',
                              overflow: 'hidden'
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${Math.min(100, comp.weightPct)}%`,
                                backgroundColor: 'var(--burgundy)',
                                borderRadius: '999px'
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                          OFF · 0%
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 3. THREE CARDS BELOW: Dark Reconciled Value · Weights · Checks        */}
      {/* ===================================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(295px, 1fr))',
          gap: '20px',
          alignItems: 'stretch',
          marginBottom: '22px'
        }}
      >
        {/* CARD 1: DARK RECONCILED VALUE CARD */}
        <div
          style={{
            backgroundColor: 'var(--espresso, #1E1509)',
            color: 'var(--on-dark, #FAF8F5)',
            borderRadius: '20px',
            padding: '26px 26px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 14px 36px rgba(30, 21, 9, 0.18)'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'rgba(250, 248, 245, 0.65)'
                }}
              >
                {mode === 'arv' ? 'RECONCILED ARV (POST-REHAB)' : 'RECONCILED AS-IS VALUE'}
              </span>

              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(250, 248, 245, 0.12)',
                  color: 'rgba(250, 248, 245, 0.88)'
                }}
              >
                {usedComps.length} {usedComps.length === 1 ? 'comp' : 'comps'}
              </span>
            </div>

            {/* Big Reconciled Value */}
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: reconciledValue ? 'clamp(36px, 3.6vw, 46px)' : '26px',
                fontWeight: 400,
                lineHeight: 1.08,
                color: '#FAF8F5',
                marginBottom: '10px',
                letterSpacing: '-0.02em'
              }}
            >
              {usedComps.length === 0
                ? 'Enable comps above'
                : !weightValidation.valid
                  ? 'Normalize weights to 100%'
                  : formatDollar(reconciledValue)}
            </div>

            {/* Range & $/sf */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px 16px',
                fontFamily: 'var(--font-sans)',
                fontSize: '12.5px',
                color: 'rgba(250, 248, 245, 0.82)',
                marginBottom: '18px'
              }}
            >
              <span>
                <strong style={{ color: '#FAF8F5' }}>Range:</strong>{' '}
                {rangeLow && rangeHigh ? `${formatDollar(rangeLow)} – ${formatDollar(rangeHigh)}` : '—'}
              </span>
              <span>·</span>
              <span>
                <strong style={{ color: '#FAF8F5' }}>$/sf:</strong>{' '}
                {reconciledPpsf ? `$${reconciledPpsf}/sf` : '—'}
              </span>
            </div>

            {mode === 'arv' && grid.renovatedUsedCount === 0 && usedComps.length > 0 && (
              <div
                style={{
                  backgroundColor: 'rgba(227, 179, 99, 0.16)',
                  border: '1px solid rgba(227, 179, 99, 0.4)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '11.5px',
                  color: '#F7EEDC',
                  lineHeight: 1.4,
                  marginBottom: '16px'
                }}
              >
                0 comps marked Renovated/Updated — value currently relies on condition adjustments. Tag renovated comps for stronger ARV support.
              </div>
            )}
          </div>

          {/* Confidence Bar */}
          <div
            style={{
              paddingTop: '14px',
              borderTop: '1px solid rgba(250, 248, 245, 0.14)'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '7px',
                fontFamily: 'var(--font-sans)',
                fontSize: '11.5px'
              }}
            >
              <span style={{ color: 'rgba(250, 248, 245, 0.78)', fontWeight: 600 }}>
                Confidence
              </span>
              <span style={{ color: confidenceBarColor, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {confidenceScore} · {confidencePct}%
              </span>
            </div>

            <div
              style={{
                height: '7px',
                width: '100%',
                borderRadius: '999px',
                backgroundColor: 'rgba(250, 248, 245, 0.14)',
                overflow: 'hidden',
                marginBottom: '8px'
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${confidencePct}%`,
                  backgroundColor: confidenceBarColor,
                  borderRadius: '999px',
                  transition: 'width 0.25s ease'
                }}
              />
            </div>

            <div style={{ fontSize: '11px', color: 'rgba(250, 248, 245, 0.65)', lineHeight: 1.4 }}>
              {usedComps.length > 0
                ? `Spread ${cvPct.toFixed(1)}% CV · Avg ${(avgGrossPct || 0).toFixed(1)}% gross adj`
                : 'Select ≥ 3 nearby comps for high confidence'}
            </div>
          </div>
        </div>

        {/* CARD 2: RECONCILIATION WEIGHTS */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border, #E4DDD3)',
            borderRadius: '20px',
            padding: '24px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-subtle)'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '14px' }}>
              <div>
                <span
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)'
                  }}
                >
                  WEIGHTED SYNTHESIS
                </span>
                <h3
                  style={{
                    margin: '2px 0 0 0',
                    fontFamily: 'var(--font-display)',
                    fontSize: '22px',
                    fontWeight: 400,
                    color: 'var(--espresso)'
                  }}
                >
                  Reconciliation weights
                </h3>
              </div>

              <Pill variant={usedComps.length > 0 && weightValidation.valid ? 'positive' : 'warning'} size="sm">
                &sum; {weightValidation.sumPct.toFixed(1)}%
              </Pill>
            </div>

            {usedComps.length === 0 ? (
              <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: '12px 0' }}>
                Toggle at least one comparable to <strong>USED</strong> to assign confidence weights.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {usedComps.map((comp, idx) => {
                  const currentPct =
                    customWeights && customWeights[comp.id] != null
                      ? customWeights[comp.id]
                      : comp.weightPct;

                  return (
                    <div
                      key={comp.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '12px',
                        backgroundColor: 'var(--sand, #F7F3EE)',
                        border: '1px solid rgba(30, 21, 9, 0.08)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--espresso)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          C{idx + 1} · {comp.address.split(',')[0]}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--espresso)', flexShrink: 0 }}>
                          {formatDollar(comp.adjustedPrice)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={Number(currentPct) || 0}
                          onChange={(e) => onWeightChange && onWeightChange(comp.id, Number(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--burgundy)', cursor: 'pointer' }}
                        />
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid var(--border-strong)',
                            borderRadius: '6px',
                            padding: '2px 6px',
                            width: '62px'
                          }}
                        >
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={currentPct}
                            onChange={(e) =>
                              onWeightChange &&
                              onWeightChange(comp.id, e.target.value === '' ? 0 : Number(e.target.value))
                            }
                            style={{
                              border: 'none',
                              outline: 'none',
                              width: '100%',
                              textAlign: 'right',
                              fontFamily: 'var(--font-sans)',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              color: 'var(--espresso)'
                            }}
                          />
                          <span style={{ fontSize: '10.5px', color: 'var(--muted)', marginLeft: '2px' }}>%</span>
                        </div>
                      </div>

                      <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '4px' }}>
                        {comp.distanceMi} mi · {comp.monthsSinceSale} mo · {comp.grossAdjustmentPct.toFixed(1)}% gross
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Weight Validation + Reset/Normalize Controls */}
          <div
            style={{
              marginTop: '14px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(30, 21, 9, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px'
            }}
          >
            {!weightValidation.valid && usedComps.length > 0 ? (
              <button
                type="button"
                onClick={onNormalizeWeights}
                style={{
                  backgroundColor: 'var(--burgundy)',
                  color: '#FAF8F5',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '5px 12px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  cursor: 'pointer'
                }}
              >
                Normalize to 100%
              </button>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {weightValidation.hasCustomWeights ? 'Custom weights active' : 'Auto-weighted by proximity & low gross %'}
              </span>
            )}

            {weightValidation.hasCustomWeights && (
              <button
                type="button"
                onClick={onAutoWeights}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--burgundy)',
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                Auto-weight
              </button>
            )}
          </div>
        </div>

        {/* CARD 3: CHECKS + LINK TO LEARNING LAB LESSON */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border, #E4DDD3)',
            borderRadius: '20px',
            padding: '24px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-subtle)'
          }}
        >
          <div>
            <div style={{ marginBottom: '14px' }}>
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)'
                }}
              >
                USPAP &amp; FANNIE MAE BENCHMARKS
              </span>
              <h3
                style={{
                  margin: '2px 0 0 0',
                  fontFamily: 'var(--font-display)',
                  fontSize: '22px',
                  fontWeight: 400,
                  color: 'var(--espresso)'
                }}
              >
                Checks
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {checks.map((chk) => {
                const dotColor =
                  chk.status === 'pass'
                    ? 'var(--positive, #3F5A3A)'
                    : chk.status === 'fail'
                      ? 'var(--burgundy, #41101B)'
                      : 'var(--warning, #7A5212)';

                const symbol = chk.status === 'pass' ? '✓' : chk.status === 'fail' ? '!' : '•';

                return (
                  <div
                    key={chk.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--sand, #F7F3EE)',
                      border: '1px solid rgba(30, 21, 9, 0.06)'
                    }}
                  >
                    <span
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        backgroundColor: dotColor,
                        color: '#FAF8F5',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '1px'
                      }}
                    >
                      {symbol}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--espresso)', lineHeight: 1.25 }}>
                        {chk.label}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.35, marginTop: '2px' }}>
                        {chk.detail}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Learning Lab Lesson Link */}
          <div
            style={{
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(30, 21, 9, 0.08)'
            }}
          >
            <button
              type="button"
              onClick={onOpenLearningLabLesson}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                textAlign: 'left',
                fontFamily: 'var(--font-sans)',
                fontSize: '11.5px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--burgundy, #41101B)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>Study CIA / CBS &amp; 15/25 Rule in Learning Lab &rarr;</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 4. ACTION BUTTONS: Use in Deal → · Save appraisal · Edit library      */}
      {/* ===================================================================== */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border, #E4DDD3)',
          borderRadius: '16px',
          padding: '16px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <Button
            variant="primary"
            disabled={!canUseInDeal}
            onClick={() => canUseInDeal && onUseInDeal && onUseInDeal({
              mode,
              value: reconciledValue,
              rangeLow,
              rangeHigh,
              ppsf: reconciledPpsf
            })}
          >
            Use in Deal &rarr;
          </Button>

          <Button
            variant="secondary"
            disabled={isSavingAppraisal || comps.length === 0}
            onClick={onSaveAppraisal}
          >
            {isSavingAppraisal ? 'Saving appraisal…' : 'Save appraisal'}
          </Button>

          <Button
            variant="secondary"
            onClick={onOpenLibraryModal}
          >
            Edit adjustment library
          </Button>
        </div>

        {lastSavedAt && (
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11.5px', color: 'var(--muted)' }}>
            Saved {new Date(lastSavedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>
    </section>
  );
}

