import React, { useState, useEffect } from 'react';
import FormattedNumberInput from './FormattedNumberInput.jsx';
import { Button, Pill } from '../ui';
import {
  DEFAULT_ADJUSTMENT_LIBRARY,
  SOUTH_FLORIDA_TIERS,
  mergeAdjustmentLibrary
} from './valuationEngine.js';

export default function AdjustmentLibraryModal({
  isOpen,
  onClose,
  activeTierKey = 'mid',
  currentProfile,
  onLibrarySaved
}) {
  const [form, setForm] = useState(() =>
    mergeAdjustmentLibrary(currentProfile?.valuation_defaults?.library)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setForm(mergeAdjustmentLibrary(currentProfile?.valuation_defaults?.library));
      setErrorMsg('');
    }
  }, [isOpen, currentProfile]);

  if (!isOpen) return null;

  const setField = (key, val) => {
    setForm((prev) => ({
      ...prev,
      [key]: val === '' ? '' : Number(val)
    }));
  };

  const setTierRate = (tierKey, val) => {
    setForm((prev) => ({
      ...prev,
      glaRates: {
        ...prev.glaRates,
        [tierKey]: val === '' ? '' : Number(val)
      }
    }));
  };

  const setTierThreshold = (tierKey, val) => {
    setForm((prev) => ({
      ...prev,
      glaMinThresholds: {
        ...prev.glaMinThresholds,
        [tierKey]: val === '' ? '' : Number(val)
      }
    }));
  };

  const handleResetDefaults = () => {
    setForm(mergeAdjustmentLibrary(DEFAULT_ADJUSTMENT_LIBRARY));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');

    const sanitizedLibrary = mergeAdjustmentLibrary({
      ...form,
      localPpsfFactor: Math.min(0.8, Math.max(0.1, (Number(form.localPpsfFactorPct ?? form.localPpsfFactor * 100) || 35) / 100))
    });
    delete sanitizedLibrary.localPpsfFactorPct;

    try {
      const nextValuationDefaults = {
        ...(currentProfile?.valuation_defaults || {}),
        library: sanitizedLibrary
      };

      const res = await fetch('/api/investor/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credit_tier: currentProfile?.credit_tier || '740-759',
          liquid_cash: currentProfile?.liquid_cash ?? 100000,
          reserve_months: currentProfile?.reserve_months ?? 6,
          rate_sheet: currentProfile?.rate_sheet,
          valuation_defaults: nextValuationDefaults
        })
      });

      if (!res.ok) {
        throw new Error('Failed to save adjustment library');
      }

      const savedProfile = await res.json();
      if (onLibrarySaved) {
        onLibrarySaved(savedProfile, sanitizedLibrary);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Unable to save adjustment library.');
    } finally {
      setIsSaving(false);
    }
  };

  const localPctDisplay = form.localPpsfFactorPct != null
    ? form.localPpsfFactorPct
    : Math.round((Number(form.localPpsfFactor) || 0.35) * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit South Florida Appraisal Adjustment Library"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(30, 21, 9, 0.58)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--cream, #FAF8F5)',
          borderRadius: '20px',
          maxWidth: '780px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 56px rgba(30, 21, 9, 0.28)',
          border: '1px solid var(--border-strong, rgba(30, 21, 9, 0.2))',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            backgroundColor: 'var(--espresso, #1E1509)',
            color: 'var(--on-dark, #FAF8F5)',
            padding: '22px 28px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px'
          }}
        >
          <div>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--on-dark-muted, #E6DFD7)',
                marginBottom: '6px'
              }}
            >
              PALM BEACH &amp; BROWARD CONTRIBUTORY VALUE GUIDE
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '26px',
                fontWeight: 400,
                color: 'var(--on-dark, #FAF8F5)'
              }}
            >
              Appraisal Adjustment Library
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--on-dark, #FAF8F5)',
              fontSize: '24px',
              lineHeight: 1,
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            &times;
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <div
            style={{
              padding: '24px 28px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '24px'
            }}
          >
            {errorMsg && (
              <div
                style={{
                  backgroundColor: 'var(--negative-bg, #F5E6E3)',
                  color: 'var(--negative, #8A2A1E)',
                  border: '1px solid rgba(138, 42, 30, 0.25)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  fontSize: '12.5px',
                  fontFamily: 'var(--font-sans)'
                }}
              >
                {errorMsg}
              </div>
            )}

            {/* Section 1: GLA Rates by Submarket Tier */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                padding: '18px 20px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                  marginBottom: '12px'
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--burgundy)'
                    }}
                  >
                    1 · Gross Living Area (GLA) Tier Rates
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      color: 'var(--muted)',
                      marginTop: '2px'
                    }}
                  >
                    Auto-selected from unadjusted median comp sale price. Marginal GLA defaults to 30%–45% of local $/sf.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11.5px', fontWeight: 600, color: 'var(--espresso)' }}>
                    Local $/sf factor:
                  </span>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '8px',
                      padding: '4px 8px',
                      backgroundColor: '#FFFFFF',
                      width: '76px'
                    }}
                  >
                    <FormattedNumberInput
                      value={localPctDisplay}
                      onChange={(val) =>
                        setForm((prev) => ({
                          ...prev,
                          localPpsfFactorPct: val === '' ? '' : Number(val)
                        }))
                      }
                      allowDecimal={false}
                      style={{
                        border: 'none',
                        outline: 'none',
                        width: '100%',
                        textAlign: 'right',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: 'var(--espresso)'
                      }}
                    />
                    <span style={{ fontSize: '11.5px', color: 'var(--muted)', marginLeft: '3px' }}>%</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                {Object.values(SOUTH_FLORIDA_TIERS).map((tier) => {
                  const isCurrent = tier.key === activeTierKey;
                  return (
                    <div
                      key={tier.key}
                      style={{
                        backgroundColor: isCurrent ? 'rgba(65, 16, 27, 0.04)' : 'var(--sand, #F7F3EE)',
                        border: isCurrent ? '1.5px solid var(--burgundy)' : '1px solid var(--border)',
                        borderRadius: '10px',
                        padding: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, color: 'var(--espresso)' }}>
                          {tier.bandLabel}
                        </span>
                        {isCurrent && <Pill variant="positive" size="sm">Active</Pill>}
                      </div>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '10.5px', color: 'var(--muted)', marginBottom: '10px', minHeight: '28px' }}>
                        {tier.name} ({tier.multiplier}×)
                      </div>

                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '3px' }}>
                        Library Rate ($/sf)
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid var(--border-strong)', borderRadius: '6px', padding: '4px 8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--muted)', marginRight: '3px' }}>$</span>
                        <FormattedNumberInput
                          value={form.glaRates?.[tier.key] ?? tier.defaultGlaRate}
                          onChange={(v) => setTierRate(tier.key, v)}
                          style={{ border: 'none', outline: 'none', width: '100%', textAlign: 'right', fontSize: '12.5px', fontWeight: 600 }}
                        />
                        <span style={{ fontSize: '10.5px', color: 'var(--muted)', marginLeft: '3px' }}>/sf</span>
                      </div>

                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '3px' }}>
                        Min Variance (±sf)
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid var(--border-strong)', borderRadius: '6px', padding: '4px 8px' }}>
                        <FormattedNumberInput
                          value={form.glaMinThresholds?.[tier.key] ?? tier.defaultMinSqftThreshold}
                          onChange={(v) => setTierThreshold(tier.key, v)}
                          style={{ border: 'none', outline: 'none', width: '100%', textAlign: 'right', fontSize: '12px', fontWeight: 600 }}
                        />
                        <span style={{ fontSize: '10.5px', color: 'var(--muted)', marginLeft: '3px' }}>sf</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Contributory Line Items */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                padding: '18px 20px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--burgundy)'
                    }}
                  >
                    2 · Contributory Feature Values (Mid-Tier Baseline)
                  </div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                    Slab-on-grade South Florida presets (no basement modules). View &amp; waterfront separated in Location/Site.
                  </div>
                </div>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: 'var(--espresso)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.tierScaleEnabled !== false}
                    onChange={(e) => setForm((prev) => ({ ...prev, tierScaleEnabled: e.target.checked }))}
                    style={{ accentColor: 'var(--burgundy)', cursor: 'pointer' }}
                  />
                  Auto-scale by tier multiplier
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px 18px' }}>
                {[
                  { key: 'bedAdjustment', label: 'Bedroom Differential', guide: 'Per bedroom' },
                  { key: 'fullBathAdjustment', label: 'Full Bathroom', guide: 'Guide: $8k–$18k / bath' },
                  { key: 'halfBathAdjustment', label: 'Half Bath (Powder)', guide: 'Guide: $4k–$8k' },
                  { key: 'conditionUpdatedVsAsIs', label: 'Updated (C3) vs As-Is', guide: 'Minor kitchen + bath refresh' },
                  { key: 'conditionRenovatedVsAsIs', label: 'Renovated (C2) vs As-Is', guide: 'Full kitchen ($20k–$40k) + baths' },
                  { key: 'poolAdjustment', label: 'Standard In-Ground Pool', guide: 'Guide: $30k–$50k' },
                  { key: 'garageBayAdjustment', label: 'Garage Bay Differential', guide: 'Guide: $10k–$20k / bay' },
                  { key: 'impactWindowsAdjustment', label: 'Full Impact Windows/Doors', guide: 'Guide: $15k–$35k HVHZ' },
                  { key: 'newerRoofAdjustment', label: 'Newer Tile / Metal Roof', guide: 'Guide: $15k–$35k (<5 yrs)' },
                  { key: 'waterfrontAdjustment', label: 'Waterfront / Canal Frontage', guide: 'Dedicated Location/Site row' }
                ].map((item) => (
                  <div
                    key={item.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      paddingBottom: '8px',
                      borderBottom: '1px solid rgba(30, 21, 9, 0.06)'
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: 'var(--espresso)' }}>
                        {item.label}
                      </div>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '10.5px', color: 'var(--muted)' }}>
                        {item.guide}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid var(--border-strong)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        width: '108px',
                        flexShrink: 0
                      }}
                    >
                      <span style={{ fontSize: '11.5px', color: 'var(--muted)', marginRight: '3px' }}>$</span>
                      <FormattedNumberInput
                        value={form[item.key]}
                        onChange={(v) => setField(item.key, v)}
                        formatOnBlur={true}
                        style={{
                          border: 'none',
                          outline: 'none',
                          width: '100%',
                          textAlign: 'right',
                          fontFamily: 'var(--font-sans)',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--espresso)'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3: Lot, Market Trend & Output Rounding */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                padding: '16px 20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px'
              }}
            >
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, color: 'var(--espresso)', marginBottom: '4px' }}>
                  Lot Size Adjustment ($/sf)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '6px 10px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)', marginRight: '4px' }}>$</span>
                  <FormattedNumberInput
                    value={form.lotSqftRate}
                    onChange={(v) => setField('lotSqftRate', v)}
                    allowDecimal={true}
                    style={{ border: 'none', outline: 'none', width: '100%', textAlign: 'right', fontSize: '12.5px', fontWeight: 600 }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '4px' }}>/sf</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, color: 'var(--espresso)', marginBottom: '4px' }}>
                  Market Time Trend (% / mo)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '6px 10px' }}>
                  <FormattedNumberInput
                    value={form.monthlyMarketTrendPct}
                    onChange={(v) => setField('monthlyMarketTrendPct', v)}
                    allowDecimal={true}
                    style={{ border: 'none', outline: 'none', width: '100%', textAlign: 'right', fontSize: '12.5px', fontWeight: 600 }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '4px' }}>%/mo</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, color: 'var(--espresso)', marginBottom: '4px' }}>
                  Reconciled Value Rounding
                </label>
                <select
                  value={String(form.roundingIncrement ?? 'auto')}
                  onChange={(e) => {
                    const val = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      roundingIncrement: val === 'auto' ? 'auto' : Number(val)
                    }));
                  }}
                  style={{
                    width: '100%',
                    border: '1px solid var(--border-strong)',
                    borderRadius: '8px',
                    padding: '7px 10px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: 'var(--espresso)',
                    backgroundColor: '#FFFFFF'
                  }}
                >
                  <option value="auto">Auto ($1k &lt;$1M · $5k $1M+)</option>
                  <option value="500">Nearest $500</option>
                  <option value="1000">Nearest $1,000</option>
                  <option value="5000">Nearest $5,000</option>
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 28px',
              borderTop: '1px solid var(--border)',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <button
              type="button"
              onClick={handleResetDefaults}
              style={{
                background: 'none',
                border: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '11.5px',
                fontWeight: 600,
                color: 'var(--burgundy)',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: '4px 0'
              }}
            >
              Reset to South Florida Guide defaults
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Button variant="secondary" size="sm" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save library →'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

