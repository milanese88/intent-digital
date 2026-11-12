import React, { useState, useEffect } from 'react';
import FormattedNumberInput from './FormattedNumberInput.jsx';
import { ALLOWED_CREDIT_TIERS, DEFAULT_RATE_SHEET } from './underwriting.js';
import { Button } from '../ui';

const LOAN_TYPE_LABELS = {
  conventional_investment: 'Conventional (Investment)',
  conventional_primary: 'Conventional (Primary Residence)',
  fha: 'FHA (Primary Residence)',
  dscr: 'DSCR Loan',
  hard_money: 'Hard Money'
};

export default function BuyingProfileModal({ isOpen, onClose, onProfileSaved, currentProfile }) {
  const [creditTier, setCreditTier] = useState('740-759');
  const [liquidCash, setLiquidCash] = useState(100000);
  const [reserveMonths, setReserveMonths] = useState(6);
  const [rateSheet, setRateSheet] = useState(DEFAULT_RATE_SHEET);
  const [expandedLoanType, setExpandedLoanType] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (currentProfile) {
      if (currentProfile.credit_tier) setCreditTier(currentProfile.credit_tier);
      if (currentProfile.liquid_cash != null) setLiquidCash(currentProfile.liquid_cash);
      if (currentProfile.reserve_months != null) setReserveMonths(currentProfile.reserve_months);
      if (currentProfile.rate_sheet) {
        setRateSheet({
          ...DEFAULT_RATE_SHEET,
          ...currentProfile.rate_sheet
        });
      }
    }
  }, [currentProfile, isOpen]);

  if (!isOpen) return null;

  const handleBaseRateChange = (loanKey, val) => {
    const num = val === '' ? '' : parseFloat(val);
    setRateSheet(prev => ({
      ...prev,
      [loanKey]: {
        ...prev[loanKey],
        base_rate: num
      }
    }));
  };

  const handleAdjustmentChange = (loanKey, tier, val) => {
    const num = val === '' ? '' : parseFloat(val);
    setRateSheet(prev => ({
      ...prev,
      [loanKey]: {
        ...prev[loanKey],
        adjustments: {
          ...(prev[loanKey]?.adjustments || {}),
          [tier]: num
        }
      }
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload = {
        credit_tier: creditTier,
        liquid_cash: Number(liquidCash) || 0,
        reserve_months: Number(reserveMonths) || 6,
        rate_sheet: rateSheet,
        ...(currentProfile?.valuation_defaults ? { valuation_defaults: currentProfile.valuation_defaults } : {})
      };

      const res = await fetch('/api/investor/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error('Failed to update buying profile');
      }

      const saved = await res.json();
      setSuccessMsg('Profile saved successfully!');
      if (onProfileSaved) {
        onProfileSaved(saved);
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setErrorMsg(err.message || 'Error saving profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(52, 41, 42, 0.55)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        maxWidth: '680px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(52, 41, 42, 0.18)',
        border: '1px solid rgba(52, 41, 42, 0.1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(52, 41, 42, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h2 style={{
              margin: 0,
              fontFamily: 'var(--font-serif, "Cormorant Garamond", Georgia, serif)',
              fontSize: '24px',
              fontWeight: 600,
              color: 'var(--espresso, #34292A)'
            }}>
              My Buying Profile
            </h2>
            <p style={{
              margin: '3px 0 0',
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '12px',
              color: 'rgba(52, 41, 42, 0.65)'
            }}>
              Set your credit tier, liquid cash reserves, and rate sheet quotes.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '22px',
              cursor: 'pointer',
              color: 'rgba(52, 41, 42, 0.45)',
              padding: '4px'
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{
          padding: '20px 24px',
          overflowY: 'auto',
          flex: 1
        }}>
          {errorMsg && (
            <div style={{
              backgroundColor: 'rgba(224, 106, 59, 0.1)',
              color: '#B71C1C',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '12.5px',
              marginBottom: '16px',
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
            }}>
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div style={{
              backgroundColor: 'rgba(52, 168, 83, 0.1)',
              color: '#2E7D32',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '12.5px',
              marginBottom: '16px',
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
            }}>
              {successMsg}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {/* Credit Tier */}
            <div>
              <label style={{
                display: 'block',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--espresso, #34292A)',
                marginBottom: '6px'
              }}>
                Credit Score Tier
              </label>
              <select
                value={creditTier}
                onChange={e => setCreditTier(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(52, 41, 42, 0.2)',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '13px',
                  color: 'var(--espresso, #34292A)',
                  backgroundColor: '#FFFFFF'
                }}
              >
                {ALLOWED_CREDIT_TIERS.map(tier => (
                  <option key={tier} value={tier}>{tier}</option>
                ))}
              </select>
            </div>

            {/* Liquid Cash */}
            <div>
              <label style={{
                display: 'block',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--espresso, #34292A)',
                marginBottom: '6px'
              }}>
                Liquid Cash Available
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                border: '1px solid rgba(52, 41, 42, 0.2)',
                borderRadius: '6px',
                padding: '0 8px',
                backgroundColor: '#FFFFFF'
              }}>
                <span style={{ fontSize: '13px', color: 'rgba(52, 41, 42, 0.5)', marginRight: '4px' }}>$</span>
                <FormattedNumberInput
                  value={liquidCash}
                  onChange={setLiquidCash}
                  placeholder="100,000"
                  style={{
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    padding: '8px 0',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--espresso, #34292A)'
                  }}
                />
              </div>
            </div>

            {/* Reserve Months */}
            <div>
              <label style={{
                display: 'block',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--espresso, #34292A)',
                marginBottom: '6px'
              }}>
                Required Reserves (Months)
              </label>
              <input
                type="number"
                min="0"
                max="24"
                value={reserveMonths}
                onChange={e => setReserveMonths(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(52, 41, 42, 0.2)',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '13px',
                  color: 'var(--espresso, #34292A)',
                  backgroundColor: '#FFFFFF',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Rate Sheet Header */}
          <div style={{
            borderTop: '1px solid rgba(52, 41, 42, 0.08)',
            paddingTop: '20px',
            marginBottom: '16px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px'
            }}>
              <h3 style={{
                margin: 0,
                fontFamily: 'var(--font-serif, "Cormorant Garamond", Georgia, serif)',
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--espresso, #34292A)'
              }}>
                Lender Rate Sheet Quotes
              </h3>
              <span style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '11px',
                color: 'rgba(52, 41, 42, 0.55)',
                fontStyle: 'italic'
              }}>
                Enter your lender's quotes
              </span>
            </div>
            <p style={{
              margin: '0 0 16px',
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '11.5px',
              color: 'rgba(52, 41, 42, 0.65)'
            }}>
              Your underwriting default rates will automatically reflect your base rate plus the credit adjustment for your tier (<strong style={{ color: 'var(--espresso, #34292A)' }}>{creditTier}</strong>).
            </p>

            {/* Rate Sheet Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Object.keys(LOAN_TYPE_LABELS).map(loanKey => {
                const sheet = rateSheet[loanKey] || DEFAULT_RATE_SHEET[loanKey] || { base_rate: 7.0, adjustments: {} };
                const currentAdj = sheet.adjustments?.[creditTier] ?? 0;
                const effectiveRate = ((sheet.base_rate != null ? Number(sheet.base_rate) : 0) + (Number(currentAdj) || 0)).toFixed(2);
                const isExpanded = expandedLoanType === loanKey;

                return (
                  <div
                    key={loanKey}
                    style={{
                      border: '1px solid rgba(52, 41, 42, 0.12)',
                      borderRadius: '8px',
                      backgroundColor: '#FAF8F5',
                      padding: '12px 14px'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}>
                      <div style={{ flex: 1 }}>
                        <span style={{
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--espresso, #34292A)'
                        }}>
                          {LOAN_TYPE_LABELS[loanKey]}
                        </span>
                        <div style={{
                          fontSize: '11px',
                          color: 'rgba(52, 41, 42, 0.6)',
                          marginTop: '2px',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
                        }}>
                          Effective rate for {creditTier}: <strong style={{ color: '#1B5E20' }}>{effectiveRate}%</strong>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.55)', fontFamily: 'var(--font-sans, "Montserrat", sans-serif)' }}>Base:</span>
                          <input
                            type="number"
                            step="0.05"
                            value={sheet.base_rate ?? ''}
                            onChange={e => handleBaseRateChange(loanKey, e.target.value)}
                            style={{
                              width: '64px',
                              padding: '4px 6px',
                              borderRadius: '4px',
                              border: '1px solid rgba(52, 41, 42, 0.2)',
                              fontSize: '12px',
                              textAlign: 'right',
                              fontWeight: 600,
                              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
                            }}
                          />
                          <span style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.5)' }}>%</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setExpandedLoanType(isExpanded ? null : loanKey)}
                          style={{
                            background: 'none',
                            border: '1px solid rgba(52, 41, 42, 0.15)',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            color: 'var(--espresso, #34292A)',
                            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
                          }}
                        >
                          {isExpanded ? 'Hide Adjustments' : 'Tiers ±'}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Tier Adjustments */}
                    {isExpanded && (
                      <div style={{
                        marginTop: '12px',
                        paddingTop: '10px',
                        borderTop: '1px dashed rgba(52, 41, 42, 0.12)'
                      }}>
                        <div style={{
                          fontSize: '10.5px',
                          color: 'rgba(52, 41, 42, 0.6)',
                          marginBottom: '8px',
                          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
                        }}>
                          Enter adjustment in % (e.g. +0.25% or -0.125%):
                        </div>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                          gap: '8px'
                        }}>
                          {ALLOWED_CREDIT_TIERS.map(tier => {
                            const adjVal = sheet.adjustments?.[tier] ?? 0;
                            const isCurrent = tier === creditTier;
                            return (
                              <div
                                key={tier}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '4px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: isCurrent ? 'rgba(189, 211, 226, 0.35)' : '#FFFFFF',
                                  border: isCurrent ? '1px solid #859DCE' : '1px solid rgba(52, 41, 42, 0.08)'
                                }}
                              >
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: isCurrent ? 700 : 500,
                                  color: 'var(--espresso, #34292A)',
                                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
                                }}>
                                  {tier}:
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  <input
                                    type="number"
                                    step="0.05"
                                    value={adjVal}
                                    onChange={e => handleAdjustmentChange(loanKey, tier, e.target.value)}
                                    style={{
                                      width: '46px',
                                      padding: '2px 4px',
                                      fontSize: '11px',
                                      textAlign: 'right',
                                      border: '1px solid rgba(52, 41, 42, 0.15)',
                                      borderRadius: '3px'
                                    }}
                                  />
                                  <span style={{ fontSize: '10px', color: 'rgba(52, 41, 42, 0.5)' }}>%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(52, 41, 42, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '12px',
          backgroundColor: '#FAF8F5',
          borderBottomLeftRadius: '12px',
          borderBottomRightRadius: '12px'
        }}>
          <Button
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Profile'}
          </Button>
        </div>
      </div>
    </div>
  );
}
