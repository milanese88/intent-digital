import React, { useState, useEffect, useMemo } from 'react';
import FormattedNumberInput from './FormattedNumberInput.jsx';
import {
  calculateMortgagePayment,
  calculateFloridaLoanTaxes,
  calculateFloridaOwnerTitlePolicy,
  calculateMonthlyPayment,
  calculateCashToClose,
  calculateLiquidCashNeeded,
  formatCurrency,
  formatPercent,
  formatRatio,
  underwriteRental,
  underwriteFlip,
  underwriteBrrrr,
  LOAN_TYPES,
  ESTIMATED_CLOSING_DEFAULTS
} from './underwriting.js';

// Section Header for Compact Underwriting Form
function SectionHeader({ title, action = null }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: '18px',
      marginBottom: '8px',
      borderBottom: '1px solid rgba(52, 41, 42, 0.08)',
      paddingBottom: '4px'
    }}>
      <span style={{
        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
        fontSize: '9.5px',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--secondary-color, #41101B)'
      }}>
        {title}
      </span>
      {action}
    </div>
  );
}

// Stable module-level InputRow so React never remounts inputs on keystroke
function InputRow({
  id,
  label,
  value,
  onChange,
  prefix = '',
  suffix = '',
  sublabel = '',
  placeholder = '',
  allowDecimal = false,
  formatOnBlur = true,
  disabled = false
}) {
  const decimalAllowed = allowDecimal || suffix === '%';
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '7px 0',
      borderBottom: '1px solid rgba(52, 41, 42, 0.05)',
      opacity: disabled ? 0.6 : 1
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <label
          htmlFor={id}
          style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '12.5px',
            fontWeight: 500,
            color: 'var(--espresso, #34292A)',
            display: 'block',
            cursor: id && !disabled ? 'pointer' : 'default'
          }}
        >
          {label}
        </label>
        {sublabel && (
          <span style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '10.5px',
            color: 'rgba(52, 41, 42, 0.55)',
            display: 'block',
            lineHeight: 1.25,
            marginTop: '1px'
          }}>
            {sublabel}
          </span>
        )}
      </div>

      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: disabled ? 'rgba(52, 41, 42, 0.04)' : '#ffffff',
        border: '1px solid rgba(52, 41, 42, 0.18)',
        borderRadius: '6px',
        padding: '5px 8px',
        width: '128px',
        transition: 'border-color 0.15s ease'
      }}>
        {prefix && (
          <span style={{
            fontSize: '12px',
            color: 'rgba(52, 41, 42, 0.45)',
            marginRight: '4px',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
          }}>
            {prefix}
          </span>
        )}
        <FormattedNumberInput
          id={id}
          value={value}
          onChange={onChange}
          disabled={disabled}
          allowDecimal={decimalAllowed}
          formatOnBlur={prefix === '$' ? true : formatOnBlur}
          placeholder={placeholder}
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            textAlign: 'right',
            width: '100%',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '12.5px',
            fontWeight: 600,
            color: 'var(--espresso, #1E1509)'
          }}
        />
        {suffix && (
          <span style={{
            fontSize: '12px',
            color: 'rgba(52, 41, 42, 0.45)',
            marginLeft: '4px',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
          }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export default function UnderwritePanel({
  property,
  compValueRaw,
  compValueFormatted,
  profile: initialProfile,
  onOpenProfileModal,
  onUnderwriteChange,
  setActiveDashboardTab
}) {
  // Strategy toggle: 'rental' | 'flip' | 'brrrr'
  const initialStrategy = useMemo(() => {
    if (property?.strategy && ['rental', 'flip', 'brrrr'].includes(property.strategy.toLowerCase())) {
      return property.strategy.toLowerCase();
    }
    return 'rental';
  }, [property?.strategy]);

  const [strategy, setStrategy] = useState(initialStrategy);

  // Sync strategy if property changes
  useEffect(() => {
    if (property?.strategy && ['rental', 'flip', 'brrrr'].includes(property.strategy.toLowerCase())) {
      setStrategy(property.strategy.toLowerCase());
    }
  }, [property?.id, property?.strategy]);

  // Buying profile state
  const [profile, setProfile] = useState(initialProfile || null);

  useEffect(() => {
    if (initialProfile) {
      setProfile(initialProfile);
    } else {
      let isMounted = true;
      fetch('/api/investor/profile')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (isMounted && data) {
            setProfile(data);
          }
        })
        .catch(() => {});
      return () => { isMounted = false; };
    }
  }, [initialProfile]);

  // FRED weekly Freddie Mac 30-year fixed rate reference
  const [fredRate, setFredRate] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/rates/reference')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (isMounted && data?.rate != null) {
          setFredRate(data);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  // Check property condo & flood status
  const isCondo = useMemo(() => {
    const pType = (property?.property_type || '').toLowerCase();
    const useCode = String(property?.use_code || '').trim();
    return pType === 'condo' || useCode === '004';
  }, [property?.property_type, property?.use_code]);

  const isSFHA = useMemo(() => {
    if (property?.flood_sfha === true) return true;
    const fZone = (property?.flood_zone || '').toUpperCase();
    return ['A', 'AE', 'AH', 'AO', 'A99', 'AR', 'V', 'VE'].includes(fZone);
  }, [property?.flood_sfha, property?.flood_zone]);

  // Helper to get initial rate from profile for a loan type
  const getProfileRate = (loanTypeKey, userProfile) => {
    const loanCfg = LOAN_TYPES[loanTypeKey] || LOAN_TYPES.conventional_investment;
    if (loanCfg.isCash) return 0;
    if (userProfile?.rate_sheet && userProfile.rate_sheet[loanTypeKey]) {
      const sheet = userProfile.rate_sheet[loanTypeKey];
      const base = sheet.base_rate != null ? Number(sheet.base_rate) : loanCfg.defaultRatePct;
      const tier = userProfile.credit_tier || '740-759';
      const adj = sheet.adjustments?.[tier] != null ? Number(sheet.adjustments[tier]) : 0;
      return Number((base + adj).toFixed(3));
    }
    return loanCfg.defaultRatePct;
  };

  // Build Default Inputs
  const buildDefaultInputs = (strat, prop, userProfile) => {
    const listPrice = prop?.list_price != null ? Number(prop.list_price) : '';
    const estTaxes = listPrice ? Math.round(Number(listPrice) * 0.02) : '';
    const initialLoanType = strat === 'flip' ? 'hard_money' : 'conventional_investment';
    const loanCfg = LOAN_TYPES[initialLoanType] || LOAN_TYPES.conventional_investment;
    const defaultRate = getProfileRate(initialLoanType, userProfile);
    const defaultRehab = (prop?.rehab_budget != null && prop.rehab_budget !== '')
      ? Math.round(Number(prop.rehab_budget))
      : '';

    const base = {
      purchasePrice: listPrice,
      loanType: initialLoanType,
      downPaymentPct: loanCfg.defaultDownPct,
      interestRatePct: defaultRate,
      loanTermYears: loanCfg.defaultTermYears,
      isInterestOnly: loanCfg.defaultInterestOnly,
      pointsPct: loanCfg.defaultPointsPct,
      pmiPct: loanCfg.defaultPmiPct,

      // Monthly expenses
      propertyTaxesYr: estTaxes,
      insuranceYr: '',
      floodInsuranceYr: isSFHA ? ESTIMATED_CLOSING_DEFAULTS.defaultFloodInsuranceYr : '',
      isFloodEnabled: isSFHA,
      hoaMo: isCondo ? ESTIMATED_CLOSING_DEFAULTS.defaultCondoHoaMo : 0,
      isHoaEnabled: isCondo,
      specialAssessmentsMo: 0,

      // Cash to Close customizations
      earnestMoney: listPrice ? Math.max(5000, Math.round(Number(listPrice) * 0.01)) : 5000,
      sellerCredits: 0,
      ownerTitlePaidByBuyer: true,
      escrowMonths: 3,
      prepaidInterestDays: 15,

      // Profile reserve override
      reserveMonths: userProfile?.reserve_months != null ? userProfile.reserve_months : 6,
      profileLiquidCash: userProfile?.liquid_cash != null ? userProfile.liquid_cash : 100000
    };

    if (strat === 'rental') {
      return {
        ...base,
        rehabBudget: defaultRehab,
        monthlyRent: '',
        vacancyPct: 5,
        maintenancePct: 5,
        capexPct: 5,
        managementPct: 0
      };
    }

    if (strat === 'flip') {
      return {
        ...base,
        rehabBudget: defaultRehab,
        arv: '',
        holdingMonths: 6,
        holdingCostMo: '',
        sellingCostsPct: 8
      };
    }

    // BRRRR
    return {
      ...base,
      rehabBudget: defaultRehab,
      arv: '',
      holdingMonths: 6,
      refiLtvPct: 75,
      refiRatePct: 7.0,
      refiTermYears: 30,
      refiClosingPct: 2,
      monthlyRent: '',
      vacancyPct: 5,
      maintenancePct: 5,
      capexPct: 5,
      managementPct: 0
    };
  };

  const [rentalInputs, setRentalInputs] = useState(() => buildDefaultInputs('rental', property, profile));
  const [flipInputs, setFlipInputs] = useState(() => buildDefaultInputs('flip', property, profile));
  const [brrrrInputs, setBrrrrInputs] = useState(() => buildDefaultInputs('brrrr', property, profile));

  // Toggle for detailed cash to close breakdown
  const [showDetailedClosing, setShowDetailedClosing] = useState(false);

  // Reset inputs when property ID changes
  useEffect(() => {
    setRentalInputs(buildDefaultInputs('rental', property, profile));
    setFlipInputs(buildDefaultInputs('flip', property, profile));
    setBrrrrInputs(buildDefaultInputs('brrrr', property, profile));
  }, [property?.id]);

  // Saved Analyses State
  const [savedAnalyses, setSavedAnalyses] = useState([]);
  const [_analysesLoading, setAnalysesLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const fetchSavedAnalyses = async () => {
    if (!property?.id) return;
    setAnalysesLoading(true);
    try {
      const res = await fetch(`/api/investor/analyses?property_id=${encodeURIComponent(property.id)}`);
      if (res.ok) {
        const data = await res.json();
        setSavedAnalyses(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching analyses:', err);
    } finally {
      setAnalysesLoading(false);
    }
  };

  useEffect(() => {
    fetchSavedAnalyses();
  }, [property?.id]);

  // Input Change Helper
  const handleInputChange = (field, val) => {
    const clean = val === '' ? '' : val;
    if (strategy === 'rental') {
      setRentalInputs(prev => ({ ...prev, [field]: clean }));
    } else if (strategy === 'flip') {
      setFlipInputs(prev => ({ ...prev, [field]: clean }));
    } else {
      setBrrrrInputs(prev => ({ ...prev, [field]: clean }));
    }
  };

  // Loan Type Selection Handler
  const handleLoanTypeSelect = (newLoanType) => {
    const cfg = LOAN_TYPES[newLoanType] || LOAN_TYPES.conventional_investment;
    const computedRate = getProfileRate(newLoanType, profile);

    const updateState = (prev) => {
      let pmiVal = cfg.defaultPmiPct;
      if (!cfg.isCash && (cfg.defaultDownPct < 20 || prev.downPaymentPct < 20) && pmiVal === 0) {
        pmiVal = 0.75;
      }
      return {
        ...prev,
        loanType: newLoanType,
        downPaymentPct: cfg.defaultDownPct,
        interestRatePct: computedRate,
        loanTermYears: cfg.defaultTermYears,
        pointsPct: cfg.defaultPointsPct,
        isInterestOnly: cfg.defaultInterestOnly,
        pmiPct: pmiVal
      };
    };

    if (strategy === 'rental') setRentalInputs(updateState);
    else if (strategy === 'flip') setFlipInputs(updateState);
    else setBrrrrInputs(updateState);
  };

  // Active inputs pointer
  const currentInputs = strategy === 'rental' ? rentalInputs : strategy === 'flip' ? flipInputs : brrrrInputs;

  // Compute Results Live via underwriting.js
  const results = useMemo(() => {
    const sharedInputs = {
      purchasePrice: Number(currentInputs.purchasePrice) || 0,
      loanType: currentInputs.loanType,
      isCash: currentInputs.loanType === 'cash',
      downPaymentPct: Number(currentInputs.downPaymentPct) || 0,
      interestRatePct: Number(currentInputs.interestRatePct) || 0,
      loanTermYears: Number(currentInputs.loanTermYears) || 0,
      isInterestOnly: Boolean(currentInputs.isInterestOnly),
      pointsPct: Number(currentInputs.pointsPct) || 0,
      pmiPct: Number(currentInputs.pmiPct) || 0,

      // Monthly carry
      propertyTaxesYr: currentInputs.propertyTaxesYr !== '' ? Number(currentInputs.propertyTaxesYr) : null,
      insuranceYr: currentInputs.insuranceYr !== '' ? Number(currentInputs.insuranceYr) : null,
      floodInsuranceYr: currentInputs.floodInsuranceYr !== '' ? Number(currentInputs.floodInsuranceYr) : null,
      isFloodEnabled: Boolean(currentInputs.isFloodEnabled),
      hoaMo: Number(currentInputs.hoaMo) || 0,
      isHoaEnabled: Boolean(currentInputs.isHoaEnabled),
      specialAssessmentsMo: Number(currentInputs.specialAssessmentsMo) || 0,

      // Cash to Close overrides
      earnestMoney: currentInputs.earnestMoney !== '' ? Number(currentInputs.earnestMoney) : null,
      sellerCredits: Number(currentInputs.sellerCredits) || 0,
      ownerTitlePaidByBuyer: currentInputs.ownerTitlePaidByBuyer !== false,
      escrowMonths: Number(currentInputs.escrowMonths) || 3,
      prepaidInterestDays: Number(currentInputs.prepaidInterestDays) || 15,

      // Profile overrides
      reserveMonths: currentInputs.reserveMonths != null ? Number(currentInputs.reserveMonths) : 6,
      profileLiquidCash: profile?.liquid_cash != null ? Number(profile.liquid_cash) : 100000
    };

    if (strategy === 'rental') {
      return underwriteRental({
        ...sharedInputs,
        monthlyRent: rentalInputs.monthlyRent !== '' ? Number(rentalInputs.monthlyRent) : null,
        vacancyPct: Number(rentalInputs.vacancyPct) || 0,
        maintenancePct: Number(rentalInputs.maintenancePct) || 0,
        capexPct: Number(rentalInputs.capexPct) || 0,
        managementPct: Number(rentalInputs.managementPct) || 0
      });
    }

    if (strategy === 'flip') {
      return underwriteFlip({
        ...sharedInputs,
        rehabBudget: Number(flipInputs.rehabBudget) || 0,
        arv: flipInputs.arv !== '' ? Number(flipInputs.arv) : null,
        holdingMonths: Number(flipInputs.holdingMonths) || 6,
        holdingCostMo: flipInputs.holdingCostMo !== '' ? Number(flipInputs.holdingCostMo) : null,
        sellingCostsPct: Number(flipInputs.sellingCostsPct) || 0
      });
    }

    // BRRRR
    return underwriteBrrrr({
      ...sharedInputs,
      rehabBudget: Number(brrrrInputs.rehabBudget) || 0,
      arv: brrrrInputs.arv !== '' ? Number(brrrrInputs.arv) : null,
      holdingMonths: Number(brrrrInputs.holdingMonths) || 6,
      refiLtvPct: Number(brrrrInputs.refiLtvPct) || 0,
      refiRatePct: Number(brrrrInputs.refiRatePct) || 0,
      refiTermYears: Number(brrrrInputs.refiTermYears) || 30,
      refiClosingPct: Number(brrrrInputs.refiClosingPct) || 0,
      monthlyRent: brrrrInputs.monthlyRent !== '' ? Number(brrrrInputs.monthlyRent) : null,
      vacancyPct: Number(brrrrInputs.vacancyPct) || 0,
      maintenancePct: Number(brrrrInputs.maintenancePct) || 0,
      capexPct: Number(brrrrInputs.capexPct) || 0,
      managementPct: Number(brrrrInputs.managementPct) || 0
    });
  }, [strategy, currentInputs, rentalInputs, flipInputs, brrrrInputs, profile]);

  // Save Analysis validation
  const isSaveDisabled = useMemo(() => {
    if (strategy === 'rental') {
      const rent = Number(rentalInputs.monthlyRent);
      const ins = Number(rentalInputs.insuranceYr);
      return !(rent > 0 && ins > 0);
    }
    if (strategy === 'flip') {
      const arv = Number(flipInputs.arv);
      return !(arv > 0);
    }
    if (strategy === 'brrrr') {
      const arv = Number(brrrrInputs.arv);
      const rent = Number(brrrrInputs.monthlyRent);
      const ins = Number(brrrrInputs.insuranceYr);
      return !(arv > 0 && rent > 0 && ins > 0);
    }
    return false;
  }, [strategy, rentalInputs, flipInputs, brrrrInputs]);

  // Save Analysis Handler
  const handleSaveAnalysis = async () => {
    if (!property?.id || isSaving || isSaveDisabled) return;

    setIsSaving(true);
    setSaveSuccessMsg('');
    try {
      const res = await fetch('/api/investor/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          strategy,
          inputs: currentInputs,
          results
        })
      });

      if (!res.ok) {
        throw new Error('Failed to save analysis');
      }

      const saved = await res.json();
      setSavedAnalyses(prev => [saved, ...prev]);
      setSaveSuccessMsg('Analysis saved');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Error saving analysis:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Notify parent component of live underwriting summary and save trigger
  useEffect(() => {
    if (onUnderwriteChange) {
      onUnderwriteChange({
        strategy,
        results,
        inputs: currentInputs,
        isSaving,
        isSaveDisabled,
        handleSaveAnalysis: () => handleSaveAnalysis()
      });
    }
  }, [strategy, results, currentInputs, isSaving, isSaveDisabled]);

  // Delete Analysis Handler
  const handleDeleteAnalysis = async (id) => {
    setDeletingId(id);
    try {
      const res = await fetch('/api/investor/analyses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        setSavedAnalyses(prev => prev.filter(a => a.id !== id));
        setConfirmDeleteId(null);
      }
    } catch (err) {
      console.error('Error deleting analysis:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Load Saved Analysis
  const handleLoadAnalysis = (saved) => {
    if (!saved || !saved.strategy) return;
    const strat = saved.strategy.toLowerCase();
    setStrategy(strat);
    if (strat === 'rental') {
      setRentalInputs(prev => ({ ...prev, ...(saved.inputs || {}) }));
    } else if (strat === 'flip') {
      setFlipInputs(prev => ({ ...prev, ...(saved.inputs || {}) }));
    } else if (strat === 'brrrr') {
      setBrrrrInputs(prev => ({ ...prev, ...(saved.inputs || {}) }));
    }
  };

  // Headline number for saved analysis
  const getSavedHeadline = (item) => {
    const res = item.results || {};
    const strat = (item.strategy || '').toLowerCase();
    if (strat === 'rental') {
      if (res.monthlyCashFlow != null) {
        const sign = res.monthlyCashFlow >= 0 ? '+' : '';
        return `${sign}${formatCurrency(res.monthlyCashFlow)}/mo`;
      }
      return 'Rental analysis';
    }
    if (strat === 'flip') {
      if (res.projectedProfit != null) {
        const sign = res.projectedProfit >= 0 ? '+' : '';
        return `${sign}${formatCurrency(res.projectedProfit)} profit`;
      }
      return 'Flip analysis';
    }
    if (strat === 'brrrr') {
      if (res.cashLeftInDeal != null) {
        if (res.cashLeftInDeal <= 0) {
          return `+${formatCurrency(Math.abs(res.cashLeftInDeal))} cash out`;
        }
        return `${formatCurrency(res.cashLeftInDeal)} left`;
      }
      return 'BRRRR analysis';
    }
    return 'Analysis';
  };

  // Monthly Details from live calculations
  const monthlyDetails = results.monthlyDetails || {};
  const closingDetails = results.closingDetails || {};
  const liquidDetails = results.liquidCashDetails || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Main Underwrite Panel Card */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid rgba(52, 41, 42, 0.1)',
        borderRadius: '12px',
        padding: '24px 22px',
        boxShadow: '0 4px 16px rgba(52, 41, 42, 0.03)'
      }}>
        {/* Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{
            fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
            fontSize: '26px',
            fontWeight: 400,
            color: 'var(--espresso, #34292A)',
            margin: 0,
            letterSpacing: '-0.01em'
          }}>
            Underwrite
          </h3>

          {onOpenProfileModal && (
            <button
              type="button"
              onClick={onOpenProfileModal}
              style={{
                background: 'none',
                border: '1px solid rgba(52, 41, 42, 0.15)',
                borderRadius: '50px',
                padding: '4px 12px',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--secondary-color, #41101B)',
                cursor: 'pointer'
              }}
            >
              My Buying Profile
            </button>
          )}
        </div>

        {/* 3-way Strategy Pill Toggle: RENTAL / FLIP / BRRRR */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          backgroundColor: 'rgba(52, 41, 42, 0.05)',
          borderRadius: '50px',
          padding: '4px',
          marginBottom: '20px'
        }}>
          {[
            { id: 'rental', label: 'RENTAL' },
            { id: 'flip', label: 'FLIP' },
            { id: 'brrrr', label: 'BRRRR' }
          ].map(tab => {
            const isSelected = strategy === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStrategy(tab.id)}
                style={{
                  backgroundColor: isSelected ? 'var(--secondary-color, #41101B)' : 'transparent',
                  color: isSelected ? 'var(--lighter-tone, #FAF8F5)' : 'rgba(52, 41, 42, 0.65)',
                  border: 'none',
                  borderRadius: '50px',
                  padding: '7px 0',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ================================================================= */}
        {/* 1. PURCHASE & FINANCING BLOCK (SHARED ACROSS STRATEGIES)          */}
        {/* ================================================================= */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <SectionHeader title="PURCHASE & FINANCING" />

          {/* Purchase Price */}
          <InputRow
            id="underwrite-purchase-price"
            label="Purchase Price"
            prefix="$"
            value={currentInputs.purchasePrice}
            onChange={(val) => handleInputChange('purchasePrice', val)}
            placeholder="0"
          />

          {/* Strategy specific purchase items */}
          {(strategy === 'flip' || strategy === 'brrrr' || strategy === 'rental') && (
            <div>
              <InputRow
                id="underwrite-rehab-budget"
                label="Rehab Budget"
                prefix="$"
                value={currentInputs.rehabBudget}
                onChange={(val) => handleInputChange('rehabBudget', val)}
                placeholder="0"
              />
              {property?.rehab_budget != null && property?.rehab_budget !== '' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '4px',
                  marginBottom: '10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  color: 'var(--muted, #52453C)'
                }}>
                  <span>
                    From Designer Hub · {property.rehab_budget_updated_at ? new Date(property.rehab_budget_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'} ·
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        const url = new URL(window.location.href);
                        url.searchParams.set('tab', 'designer');
                        url.searchParams.set('designer_tab', 'budget');
                        if (property?.id) {
                          url.searchParams.set('investor_property_id', property.id);
                        }
                        window.history.pushState({}, '', url.toString());
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      }
                      if (setActiveDashboardTab) {
                        setActiveDashboardTab('designer');
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--burgundy, #41101B)',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                      textDecoration: 'underline'
                    }}
                  >
                    View budget &rarr;
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Loan Type Select */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '7px 0',
            borderBottom: '1px solid rgba(52, 41, 42, 0.05)'
          }}>
            <div>
              <label style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12.5px',
                fontWeight: 500,
                color: 'var(--espresso, #34292A)',
                display: 'block'
              }}>
                Loan Type
              </label>
              <span style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '10.5px',
                color: 'rgba(52, 41, 42, 0.55)',
                display: 'block',
                marginTop: '1px'
              }}>
                Sets editable down %, term, points & rate
              </span>
            </div>

            <select
              value={currentInputs.loanType || 'conventional_investment'}
              onChange={(e) => handleLoanTypeSelect(e.target.value)}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid rgba(52, 41, 42, 0.18)',
                borderRadius: '6px',
                padding: '6px 8px',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--espresso, #1E1509)',
                outline: 'none',
                maxWidth: '180px'
              }}
            >
              {Object.values(LOAN_TYPES).map(lt => (
                <option key={lt.key} value={lt.key}>{lt.label}</option>
              ))}
            </select>
          </div>

          {/* FHA Note */}
          {currentInputs.loanType === 'fha' && (
            <div style={{
              backgroundColor: 'rgba(189, 211, 226, 0.25)',
              border: '1px solid rgba(133, 157, 206, 0.35)',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '11px',
              color: 'var(--espresso, #34292A)',
              lineHeight: 1.4,
              marginTop: '4px',
              marginBottom: '6px',
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
            }}>
              <strong>FHA Note:</strong> Owner-occupied only (1–4 units). FHA loans cannot be used for purely non-owner-occupied investment properties.
            </div>
          )}

          {/* Down Payment % and calculated $ */}
          {currentInputs.loanType !== 'cash' && (
            <InputRow
              id="underwrite-down-payment"
              label="Down Payment"
              sublabel={currentInputs.purchasePrice ? `${formatCurrency(closingDetails.downPayment || 0)} down` : ''}
              suffix="%"
              value={currentInputs.downPaymentPct}
              onChange={(val) => handleInputChange('downPaymentPct', val)}
              placeholder="25"
            />
          )}

          {/* Interest Rate & FRED reference */}
          {currentInputs.loanType !== 'cash' && (
            <>
              <InputRow
                id="underwrite-interest-rate"
                label="Interest Rate"
                sublabel={profile?.credit_tier ? `Profile (${profile.credit_tier}) quote` : 'Editable per deal'}
                suffix="%"
                value={currentInputs.interestRatePct}
                onChange={(val) => handleInputChange('interestRatePct', val)}
                placeholder="7.0"
                allowDecimal={true}
              />

              {/* FRED Freddie Mac weekly average reference */}
              {fredRate?.rate != null && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 8px',
                  backgroundColor: 'rgba(52, 41, 42, 0.03)',
                  borderRadius: '6px',
                  marginTop: '2px',
                  marginBottom: '6px'
                }}>
                  <div style={{
                    fontSize: '11px',
                    color: 'rgba(52, 41, 42, 0.75)',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
                  }}>
                    National avg this week: <strong style={{ color: '#1B5E20' }}>{fredRate.rate.toFixed(2)}%</strong> (Freddie Mac)
                  </div>
                  <span style={{
                    fontSize: '10px',
                    color: 'rgba(52, 41, 42, 0.5)',
                    fontStyle: 'italic',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
                  }}>
                    Investor rates are usually higher
                  </span>
                </div>
              )}

              {/* Loan Term */}
              <InputRow
                id="underwrite-loan-term"
                label="Loan Term"
                suffix="yrs"
                value={currentInputs.loanTermYears}
                onChange={(val) => handleInputChange('loanTermYears', val)}
                placeholder="30"
              />

              {/* Points */}
              <InputRow
                id="underwrite-points"
                label="Lender Points"
                sublabel={currentInputs.loanTermYears ? `${formatCurrency(closingDetails.lenderFees?.pointsCost || 0)}` : ''}
                suffix="%"
                value={currentInputs.pointsPct}
                onChange={(val) => handleInputChange('pointsPct', val)}
                placeholder="0"
                allowDecimal={true}
              />

              {/* Interest-Only Checkbox */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid rgba(52, 41, 42, 0.05)'
              }}>
                <label htmlFor="underwrite-interest-only" style={{
                  fontSize: '12.5px',
                  fontWeight: 500,
                  color: 'var(--espresso, #34292A)',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  cursor: 'pointer'
                }}>
                  Interest-Only Payment
                </label>
                <input
                  id="underwrite-interest-only"
                  type="checkbox"
                  checked={Boolean(currentInputs.isInterestOnly)}
                  onChange={(e) => handleInputChange('isInterestOnly', e.target.checked)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
              </div>

              {/* PMI (% per year) if down payment < 20% or FHA */}
              {(Number(currentInputs.downPaymentPct) < 20 || currentInputs.loanType === 'fha') && (
                <InputRow
                  id="underwrite-pmi"
                  label="PMI / Mortgage Insurance"
                  sublabel="annual % of loan (down < 20%)"
                  suffix="%"
                  value={currentInputs.pmiPct}
                  onChange={(val) => handleInputChange('pmiPct', val)}
                  placeholder="0.75"
                  allowDecimal={true}
                />
              )}
            </>
          )}

          {/* ============================================================= */}
          {/* 2. MONTHLY PAYMENT (PITI + HOA) ITEMIZATION                   */}
          {/* ============================================================= */}
          <SectionHeader title="MONTHLY PAYMENT (PITI + HOA)" />

          {/* Large Total Monthly Payment Banner */}
          <div style={{
            backgroundColor: '#FAF8F5',
            border: '1px solid rgba(52, 41, 42, 0.12)',
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <span style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(52, 41, 42, 0.55)',
                display: 'block'
              }}>
                TOTAL MONTHLY PAYMENT
              </span>
              <span style={{
                fontSize: '11px',
                color: 'rgba(52, 41, 42, 0.65)',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
              }}>
                P&I + Taxes + Insurance + Flood + HOA
              </span>
            </div>

            <div style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: '28px',
              fontWeight: 600,
              color: 'var(--espresso, #34292A)',
              letterSpacing: '-0.02em'
            }}>
              {formatCurrency(monthlyDetails.totalMonthlyPayment || 0)}
              <span style={{ fontSize: '13px', fontWeight: 400, color: 'rgba(52, 41, 42, 0.55)', marginLeft: '3px' }}>/mo</span>
            </div>
          </div>

          {/* Monthly P&I (Read only summary) */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 0',
            borderBottom: '1px solid rgba(52, 41, 42, 0.05)',
            fontSize: '12.5px',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
          }}>
            <span style={{ color: 'var(--espresso, #34292A)' }}>
              Principal & Interest {currentInputs.isInterestOnly ? '(Interest-Only)' : ''}
            </span>
            <strong style={{ color: 'var(--espresso, #34292A)' }}>
              {formatCurrency(monthlyDetails.monthlyPI || 0)}/mo
            </strong>
          </div>

          {/* Property Taxes */}
          <InputRow
            id="underwrite-property-taxes"
            label="Property Taxes / yr"
            sublabel="estimate — FL taxes reset after sale"
            prefix="$"
            value={currentInputs.propertyTaxesYr}
            onChange={(val) => handleInputChange('propertyTaxesYr', val)}
            placeholder="0"
          />

          {/* Homeowners Insurance */}
          <InputRow
            id="underwrite-insurance"
            label="Homeowners Insurance / yr *"
            prefix="$"
            value={currentInputs.insuranceYr}
            onChange={(val) => handleInputChange('insuranceYr', val)}
            placeholder="e.g. 2,400"
          />

          {/* Flood Insurance (Toggle + Amount) */}
          <div style={{ padding: '6px 0', borderBottom: '1px solid rgba(52, 41, 42, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  id="underwrite-flood-enabled"
                  type="checkbox"
                  checked={Boolean(currentInputs.isFloodEnabled)}
                  onChange={(e) => handleInputChange('isFloodEnabled', e.target.checked)}
                  style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                />
                <label htmlFor="underwrite-flood-enabled" style={{
                  fontSize: '12.5px',
                  fontWeight: 500,
                  color: 'var(--espresso, #34292A)',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  cursor: 'pointer'
                }}>
                  Flood Insurance {isSFHA ? '(SFHA required)' : '(Optional)'}
                </label>
              </div>

              {currentInputs.isFloodEnabled && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  backgroundColor: '#ffffff',
                  border: '1px solid rgba(52, 41, 42, 0.18)',
                  borderRadius: '6px',
                  padding: '4px 6px',
                  width: '110px'
                }}>
                  <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.45)', marginRight: '3px' }}>$</span>
                  <FormattedNumberInput
                    value={currentInputs.floodInsuranceYr}
                    onChange={(val) => handleInputChange('floodInsuranceYr', val)}
                    placeholder="1,800"
                    style={{
                      border: 'none',
                      outline: 'none',
                      textAlign: 'right',
                      width: '100%',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--espresso, #1E1509)'
                    }}
                  />
                  <span style={{ fontSize: '10px', color: 'rgba(52, 41, 42, 0.45)', marginLeft: '2px' }}>/yr</span>
                </div>
              )}
            </div>
          </div>

          {/* HOA Dues (Toggle + Amount) */}
          <div style={{ padding: '6px 0', borderBottom: '1px solid rgba(52, 41, 42, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  id="underwrite-hoa-enabled"
                  type="checkbox"
                  checked={Boolean(currentInputs.isHoaEnabled)}
                  onChange={(e) => handleInputChange('isHoaEnabled', e.target.checked)}
                  style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                />
                <label htmlFor="underwrite-hoa-enabled" style={{
                  fontSize: '12.5px',
                  fontWeight: 500,
                  color: 'var(--espresso, #34292A)',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  cursor: 'pointer'
                }}>
                  HOA Dues {isCondo ? '(Condo auto-enabled)' : ''}
                </label>
              </div>

              {currentInputs.isHoaEnabled && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  backgroundColor: '#ffffff',
                  border: '1px solid rgba(52, 41, 42, 0.18)',
                  borderRadius: '6px',
                  padding: '4px 6px',
                  width: '110px'
                }}>
                  <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.45)', marginRight: '3px' }}>$</span>
                  <FormattedNumberInput
                    value={currentInputs.hoaMo}
                    onChange={(val) => handleInputChange('hoaMo', val)}
                    placeholder="350"
                    style={{
                      border: 'none',
                      outline: 'none',
                      textAlign: 'right',
                      width: '100%',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--espresso, #1E1509)'
                    }}
                  />
                  <span style={{ fontSize: '10px', color: 'rgba(52, 41, 42, 0.45)', marginLeft: '2px' }}>/mo</span>
                </div>
              )}
            </div>
          </div>

          {/* Special Assessments */}
          <InputRow
            id="underwrite-special-assessments"
            label="Special Assessments / mo"
            prefix="$"
            value={currentInputs.specialAssessmentsMo}
            onChange={(val) => handleInputChange('specialAssessmentsMo', val)}
            placeholder="0"
          />

          {/* ============================================================= */}
          {/* 3. CASH TO CLOSE (ITEMIZED & EDITABLE)                        */}
          {/* ============================================================= */}
          <SectionHeader
            title="CASH TO CLOSE"
            action={(
              <button
                type="button"
                onClick={() => setShowDetailedClosing(prev => !prev)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--secondary-color, #41101B)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0
                }}
              >
                {showDetailedClosing ? 'Hide Itemized' : 'Edit All Costs'}
              </button>
            )}
          />

          {/* Cash to Close Highlight Card */}
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgba(52, 41, 42, 0.15)',
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(52, 41, 42, 0.55)',
                  display: 'block'
                }}>
                  TOTAL CASH TO CLOSE
                </span>
                <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                  Down payment + closing fees & prepaids
                </span>
              </div>
              <div style={{
                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                fontSize: '26px',
                fontWeight: 600,
                color: 'var(--espresso, #34292A)'
              }}>
                {formatCurrency(closingDetails.totalCashToClose || 0)}
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '8px',
              borderTop: '1px dashed rgba(52, 41, 42, 0.12)',
              fontSize: '11.5px',
              color: 'rgba(52, 41, 42, 0.8)'
            }}>
              <span>Due at contract (Earnest Money): <strong>{formatCurrency(closingDetails.earnestMoney || 0)}</strong></span>
              <span>Due at closing table: <strong>{formatCurrency(closingDetails.balanceDueAtClosing || 0)}</strong></span>
            </div>
          </div>

          {/* Quick Primary Inputs: Earnest Money & Seller Credits */}
          <InputRow
            id="underwrite-earnest-money"
            label="Earnest Money Deposit (EMD)"
            sublabel="Due at contract signing (counted in total)"
            prefix="$"
            value={currentInputs.earnestMoney}
            onChange={(val) => handleInputChange('earnestMoney', val)}
            placeholder="5,000"
          />

          <InputRow
            id="underwrite-seller-credits"
            label="Seller Credits"
            sublabel="Deducted from closing costs"
            prefix="$"
            value={currentInputs.sellerCredits}
            onChange={(val) => handleInputChange('sellerCredits', val)}
            placeholder="0"
          />

          {/* Detailed Itemized Costs Drawer / Accordion */}
          {showDetailedClosing && (
            <div style={{
              backgroundColor: '#FAF8F5',
              border: '1px solid rgba(52, 41, 42, 0.1)',
              borderRadius: '8px',
              padding: '12px 14px',
              marginTop: '8px',
              marginBottom: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--secondary-color, #41101B)',
                letterSpacing: '0.08em',
                marginBottom: '4px'
              }}>
                Estimated Closing Cost Breakdown (FL Promulgated Rates & Averages)
              </div>

              {/* Florida Statutory Loan Taxes */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11.5px',
                padding: '3px 0',
                borderBottom: '1px dashed rgba(52, 41, 42, 0.08)'
              }}>
                <span>FL Mortgage Doc Stamps (0.35% of loan):</span>
                <strong>{formatCurrency(closingDetails.floridaLoanTaxes?.docStamps || 0)}</strong>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11.5px',
                padding: '3px 0',
                borderBottom: '1px dashed rgba(52, 41, 42, 0.08)'
              }}>
                <span>FL Intangible Tax (0.20% of loan):</span>
                <strong>{formatCurrency(closingDetails.floridaLoanTaxes?.intangibleTax || 0)}</strong>
              </div>

              {/* Title Fees with Owner Title Toggle */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '11.5px',
                padding: '4px 0',
                borderBottom: '1px dashed rgba(52, 41, 42, 0.08)'
              }}>
                <div>
                  <span>Owner Title Policy:</span>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                    <button
                      type="button"
                      onClick={() => handleInputChange('ownerTitlePaidByBuyer', true)}
                      style={{
                        padding: '2px 6px',
                        fontSize: '9.5px',
                        borderRadius: '3px',
                        border: '1px solid rgba(52,41,42,0.2)',
                        backgroundColor: currentInputs.ownerTitlePaidByBuyer !== false ? 'var(--secondary-color, #41101B)' : 'transparent',
                        color: currentInputs.ownerTitlePaidByBuyer !== false ? '#FAF8F5' : 'inherit',
                        cursor: 'pointer'
                      }}
                    >
                      Paid by Buyer
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInputChange('ownerTitlePaidByBuyer', false)}
                      style={{
                        padding: '2px 6px',
                        fontSize: '9.5px',
                        borderRadius: '3px',
                        border: '1px solid rgba(52,41,42,0.2)',
                        backgroundColor: currentInputs.ownerTitlePaidByBuyer === false ? 'var(--secondary-color, #41101B)' : 'transparent',
                        color: currentInputs.ownerTitlePaidByBuyer === false ? '#FAF8F5' : 'inherit',
                        cursor: 'pointer'
                      }}
                    >
                      Paid by Seller
                    </button>
                  </div>
                </div>
                <strong>{formatCurrency(closingDetails.titleFees?.ownersTitlePolicy || 0)}</strong>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11.5px',
                padding: '3px 0',
                borderBottom: '1px dashed rgba(52, 41, 42, 0.08)'
              }}>
                <span>Lender Title Policy + Settlement & Recording:</span>
                <strong>{formatCurrency((closingDetails.titleFees?.lendersTitlePolicy || 0) + (closingDetails.titleFees?.settlementFee || 0) + (closingDetails.titleFees?.recordingFees || 0))}</strong>
              </div>

              {/* Prepaids & Escrow */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11.5px',
                padding: '3px 0',
                borderBottom: '1px dashed rgba(52, 41, 42, 0.08)'
              }}>
                <span>Prepaids & Escrows (12mo Ins + Taxes/Escrow + Interest):</span>
                <strong>{formatCurrency(closingDetails.prepaidsEscrow?.totalPrepaidsEscrow || 0)}</strong>
              </div>

              {/* Lender Fees */}
              {currentInputs.loanType !== 'cash' && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11.5px',
                  padding: '3px 0',
                  borderBottom: '1px dashed rgba(52, 41, 42, 0.08)'
                }}>
                  <span>Lender Origination, Underwriting & Appraisal:</span>
                  <strong>{formatCurrency((closingDetails.lenderFees?.totalLenderFees || 0) - (closingDetails.lenderFees?.pointsCost || 0))}</strong>
                </div>
              )}

              {/* Inspections */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11.5px',
                padding: '3px 0',
                borderBottom: '1px dashed rgba(52, 41, 42, 0.08)'
              }}>
                <span>Inspections (General, 4-Point, Wind, Survey, Termite):</span>
                <strong>{formatCurrency(closingDetails.inspections?.totalInspectionFees || 0)}</strong>
              </div>

              {/* HOA / Condo Fees */}
              {currentInputs.isHoaEnabled && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11.5px',
                  padding: '3px 0'
                }}>
                  <span>HOA Estoppel, Transfer & Capital Contribution:</span>
                  <strong>{formatCurrency(closingDetails.hoaFees?.totalHoaFees || 0)}</strong>
                </div>
              )}
            </div>
          )}

          {/* ============================================================= */}
          {/* 4. TOTAL LIQUID CASH NEEDED SUMMARY CARD                      */}
          {/* ============================================================= */}
          <div style={{
            marginTop: '14px',
            marginBottom: '10px',
            padding: '14px 16px',
            borderRadius: '10px',
            backgroundColor: liquidDetails.isCovered ? 'rgba(52, 168, 83, 0.1)' : 'rgba(224, 106, 59, 0.12)',
            border: `1px solid ${liquidDetails.isCovered ? 'rgba(52, 168, 83, 0.3)' : 'rgba(224, 106, 59, 0.35)'}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: liquidDetails.isCovered ? '#1B5E20' : '#B71C1C'
              }}>
                LIQUID CASH CHECK
              </span>

              {onOpenProfileModal && (
                <button
                  type="button"
                  onClick={onOpenProfileModal}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '10.5px',
                    color: 'rgba(52, 41, 42, 0.7)',
                    textDecoration: 'underline',
                    cursor: 'pointer'
                  }}
                >
                  Edit profile
                </button>
              )}
            </div>

            <div style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '13px',
              fontWeight: 700,
              color: liquidDetails.isCovered ? '#1B5E20' : '#B71C1C'
            }}>
              {liquidDetails.summaryText}
            </div>

            <div style={{
              fontSize: '11px',
              color: 'rgba(52, 41, 42, 0.7)',
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              marginTop: '2px'
            }}>
              Includes {formatCurrency(closingDetails.totalCashToClose || 0)} closing
              {Number(currentInputs.rehabBudget) > 0 ? ` + ${formatCurrency(currentInputs.rehabBudget)} cash rehab` : ''}
              {` + ${liquidDetails.reserveMonths || 6} mos reserves (${formatCurrency(liquidDetails.reserveCash || 0)})`}.
            </div>
          </div>

          {/* ============================================================= */}
          {/* 5. STRATEGY SPECIFIC OPERATIONS (RENTAL / FLIP / BRRRR)       */}
          {/* ============================================================= */}

          {/* RENTAL INCOME & OPERATING EXPENSES */}
          {strategy === 'rental' && (
            <>
              <SectionHeader title="RENTAL INCOME" />
              <InputRow
                id="rental-monthly-rent"
                label="Monthly Rent *"
                prefix="$"
                value={rentalInputs.monthlyRent}
                onChange={(val) => handleInputChange('monthlyRent', val)}
                placeholder="e.g. 3,400"
              />
              <InputRow
                id="rental-vacancy"
                label="Vacancy"
                suffix="%"
                value={rentalInputs.vacancyPct}
                onChange={(val) => handleInputChange('vacancyPct', val)}
                placeholder="5"
              />

              <SectionHeader title="OPERATING RESERVES" />
              <InputRow
                id="rental-maintenance"
                label="Maintenance"
                suffix="%"
                value={rentalInputs.maintenancePct}
                onChange={(val) => handleInputChange('maintenancePct', val)}
                placeholder="5"
              />
              <InputRow
                id="rental-capex"
                label="CapEx Reserve"
                suffix="%"
                value={rentalInputs.capexPct}
                onChange={(val) => handleInputChange('capexPct', val)}
                placeholder="5"
              />
              <InputRow
                id="rental-management"
                label="Management"
                suffix="%"
                value={rentalInputs.managementPct}
                onChange={(val) => handleInputChange('managementPct', val)}
                placeholder="0"
              />
            </>
          )}

          {/* FLIP HOLDING & SELLING */}
          {strategy === 'flip' && (
            <>
              <SectionHeader title="AFTER-REPAIR VALUE & EXIT" />
              <div>
                <InputRow
                  id="flip-arv"
                  label="After-Repair Value (ARV) *"
                  prefix="$"
                  value={flipInputs.arv}
                  onChange={(val) => handleInputChange('arv', val)}
                  placeholder="0"
                />
                {/* ARV Helper */}
                <div style={{ marginTop: '4px', marginBottom: '8px', paddingLeft: '2px' }}>
                  {compValueRaw != null ? (
                    <button
                      type="button"
                      onClick={() => handleInputChange('arv', compValueRaw)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'var(--secondary-color, #41101B)',
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '11px',
                        fontWeight: 600,
                        textDecoration: 'underline',
                        cursor: 'pointer'
                      }}
                    >
                      Use comp value ({compValueFormatted})
                    </button>
                  ) : null}
                  <div style={{
                    fontSize: '10.5px',
                    color: 'rgba(52, 41, 42, 0.55)',
                    fontStyle: 'italic',
                    marginTop: '2px'
                  }}>
                    For ARV, use comps that were renovated.
                  </div>
                </div>
              </div>

              <SectionHeader title="HOLDING & SELLING" />
              <InputRow
                id="flip-holding-months"
                label="Holding Period"
                suffix="mos"
                value={flipInputs.holdingMonths}
                onChange={(val) => handleInputChange('holdingMonths', val)}
                placeholder="6"
              />
              <InputRow
                id="flip-holding-cost-mo"
                label="Holding Cost / mo"
                sublabel="Defaults to full monthly carry"
                prefix="$"
                value={flipInputs.holdingCostMo}
                onChange={(val) => handleInputChange('holdingCostMo', val)}
                placeholder={String(Math.round(monthlyDetails.totalMonthlyPayment || 0))}
              />
              <InputRow
                id="flip-selling-costs"
                label="Selling Costs"
                sublabel="agent commissions, title & transfer"
                suffix="%"
                value={flipInputs.sellingCostsPct}
                onChange={(val) => handleInputChange('sellingCostsPct', val)}
                placeholder="8"
              />
            </>
          )}

          {/* BRRRR REFINANCE & OPERATIONS */}
          {strategy === 'brrrr' && (
            <>
              <SectionHeader title="AFTER-REPAIR VALUE & EXIT" />
              <div>
                <InputRow
                  id="brrrr-arv"
                  label="After-Repair Value (ARV) *"
                  prefix="$"
                  value={brrrrInputs.arv}
                  onChange={(val) => handleInputChange('arv', val)}
                  placeholder="0"
                />
                {/* ARV Helper */}
                <div style={{ marginTop: '4px', marginBottom: '8px', paddingLeft: '2px' }}>
                  {compValueRaw != null ? (
                    <button
                      type="button"
                      onClick={() => handleInputChange('arv', compValueRaw)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'var(--secondary-color, #41101B)',
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '11px',
                        fontWeight: 600,
                        textDecoration: 'underline',
                        cursor: 'pointer'
                      }}
                    >
                      Use comp value ({compValueFormatted})
                    </button>
                  ) : null}
                  <div style={{
                    fontSize: '10.5px',
                    color: 'rgba(52, 41, 42, 0.55)',
                    fontStyle: 'italic',
                    marginTop: '2px'
                  }}>
                    For ARV, use comps that were renovated.
                  </div>
                </div>
              </div>

              <SectionHeader title="REFINANCE" />
              <InputRow
                id="brrrr-refi-ltv"
                label="Refinance LTV"
                suffix="%"
                value={brrrrInputs.refiLtvPct}
                onChange={(val) => handleInputChange('refiLtvPct', val)}
                placeholder="75"
              />
              <InputRow
                id="brrrr-refi-rate"
                label="Refinance Rate"
                suffix="%"
                value={brrrrInputs.refiRatePct}
                onChange={(val) => handleInputChange('refiRatePct', val)}
                placeholder="7.0"
              />
              <InputRow
                id="brrrr-refi-term"
                label="Refinance Term"
                suffix="yrs"
                value={brrrrInputs.refiTermYears}
                onChange={(val) => handleInputChange('refiTermYears', val)}
                placeholder="30"
              />
              <InputRow
                id="brrrr-refi-closing"
                label="Refi Closing Costs"
                sublabel="% of new loan"
                suffix="%"
                value={brrrrInputs.refiClosingPct}
                onChange={(val) => handleInputChange('refiClosingPct', val)}
                placeholder="2"
              />

              <SectionHeader title="RENTAL OPERATIONS" />
              <InputRow
                id="brrrr-monthly-rent"
                label="Monthly Rent *"
                prefix="$"
                value={brrrrInputs.monthlyRent}
                onChange={(val) => handleInputChange('monthlyRent', val)}
                placeholder="e.g. 3,400"
              />
              <InputRow
                id="brrrr-vacancy"
                label="Vacancy"
                suffix="%"
                value={brrrrInputs.vacancyPct}
                onChange={(val) => handleInputChange('vacancyPct', val)}
                placeholder="5"
              />
              <InputRow
                id="brrrr-maintenance"
                label="Maintenance"
                suffix="%"
                value={brrrrInputs.maintenancePct}
                onChange={(val) => handleInputChange('maintenancePct', val)}
                placeholder="5"
              />
              <InputRow
                id="brrrr-capex"
                label="CapEx Reserve"
                suffix="%"
                value={brrrrInputs.capexPct}
                onChange={(val) => handleInputChange('capexPct', val)}
                placeholder="5"
              />
              <InputRow
                id="brrrr-management"
                label="Management"
                suffix="%"
                value={brrrrInputs.managementPct}
                onChange={(val) => handleInputChange('managementPct', val)}
                placeholder="0"
              />
            </>
          )}
        </div>

        {/* ============================================================= */}
        {/* RESULTS: 2-Column Grid of Big Serif Numbers                  */}
        {/* ============================================================= */}
        <div style={{
          marginTop: '22px',
          paddingTop: '20px',
          borderTop: '1px solid rgba(52, 41, 42, 0.1)'
        }}>
          {results.isComplete ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px 14px'
            }}>
              {/* RENTAL RESULTS */}
              {strategy === 'rental' && (
                <>
                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      MONTHLY CASH FLOW
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: results.monthlyCashFlow >= 0 ? '#196F3D' : '#A93226',
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {formatCurrency(results.monthlyCashFlow)}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      CAP RATE
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: results.capRate != null && results.capRate >= 0.06 ? '#196F3D' : 'var(--espresso, #1E1509)',
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {formatPercent(results.capRate)}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      CASH-ON-CASH
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: results.cashOnCash != null && results.cashOnCash >= 0.08 ? '#196F3D' : (results.cashOnCash < 0 ? '#A93226' : 'var(--espresso, #1E1509)'),
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {formatPercent(results.cashOnCash)}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      CASH NEEDED
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: 'var(--espresso, #1E1509)',
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {formatCurrency(results.cashNeeded)}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      DSCR
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: results.dscr != null && results.dscr >= 1.25 ? '#196F3D' : (results.dscr != null && results.dscr < 1.0 ? '#A93226' : 'var(--espresso, #1E1509)'),
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {results.dscr != null ? `${formatRatio(results.dscr)}x` : '—'}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      1% RULE
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: results.onePercentRule != null && results.onePercentRule >= 0.01 ? '#196F3D' : 'var(--espresso, #1E1509)',
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {formatPercent(results.onePercentRule)}
                    </div>
                  </div>
                </>
              )}

              {/* FLIP RESULTS */}
              {strategy === 'flip' && (
                <>
                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      PROJECTED PROFIT
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: results.projectedProfit >= 0 ? '#196F3D' : '#A93226',
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {formatCurrency(results.projectedProfit)}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      ROI
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: results.roi != null && results.roi >= 0.15 ? '#196F3D' : (results.roi < 0 ? '#A93226' : 'var(--espresso, #1E1509)'),
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {formatPercent(results.roi)}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      MAX OFFER (70%)
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: 'var(--espresso, #1E1509)',
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {formatCurrency(results.maxOffer)}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      TOTAL COST
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: 'var(--espresso, #1E1509)',
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {formatCurrency(results.totalCost)}
                    </div>
                  </div>
                </>
              )}

              {/* BRRRR RESULTS */}
              {strategy === 'brrrr' && (
                <>
                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      REFI LOAN
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: 'var(--espresso, #1E1509)',
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {formatCurrency(results.refiLoan)}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      ALL-IN COST
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: 'var(--espresso, #1E1509)',
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {formatCurrency(results.allInCost)}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      CASH LEFT IN DEAL
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: results.cashLeftInDeal <= 0 ? '#196F3D' : 'var(--espresso, #1E1509)',
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {results.cashLeftInDeal <= 0 ? `-${formatCurrency(Math.abs(results.cashLeftInDeal))}` : formatCurrency(results.cashLeftInDeal)}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      POST-REFI CASH FLOW
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: results.postRefiMonthlyCashFlow != null && results.postRefiMonthlyCashFlow >= 0 ? '#196F3D' : '#A93226',
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {formatCurrency(results.postRefiMonthlyCashFlow)}
                    </div>
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)', display: 'block' }}>
                      CASH-ON-CASH
                    </span>
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: results.isInfiniteCoC || (results.cashOnCash && results.cashOnCash >= 0.08) ? '#196F3D' : 'var(--espresso, #1E1509)',
                      marginTop: '2px',
                      lineHeight: 1.15
                    }}>
                      {results.isInfiniteCoC ? '∞' : formatPercent(results.cashOnCash)}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(52, 41, 42, 0.03)',
              borderRadius: '8px',
              textAlign: 'center',
              color: 'rgba(52, 41, 42, 0.65)',
              fontSize: '13px',
              fontStyle: 'italic'
            }}>
              {results.hint}
            </div>
          )}
        </div>

        {/* ============================================================= */}
        {/* DARK ESPRESSO VERDICT CARD                                    */}
        {/* ============================================================= */}
        <div style={{
          marginTop: '22px',
          backgroundColor: '#1E1509',
          borderRadius: '10px',
          padding: '16px 20px',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)'
        }}>
          <span style={{
            display: 'block',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '9.5px',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(250, 248, 245, 0.6)',
            marginBottom: '4px'
          }}>
            VERDICT
          </span>
          <p style={{
            fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
            fontSize: '17px',
            fontStyle: 'italic',
            color: '#FAF8F5',
            margin: 0,
            lineHeight: 1.35
          }}>
            {results.verdict}
          </p>
        </div>

        {/* ============================================================= */}
        {/* SAVE ANALYSIS BUTTON                                          */}
        {/* ============================================================= */}
        <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            type="button"
            id="underwrite-save-btn"
            onClick={handleSaveAnalysis}
            disabled={isSaving || isSaveDisabled}
            title={
              isSaveDisabled
                ? (strategy === 'flip'
                    ? 'Enter ARV to save'
                    : strategy === 'rental'
                    ? 'Enter Rent and Insurance to save'
                    : 'Enter ARV, Rent, and Insurance to save')
                : 'Save analysis'
            }
            style={{
              backgroundColor: 'var(--secondary-color, #41101B)',
              color: 'var(--lighter-tone, #FAF8F5)',
              border: 'none',
              borderRadius: '50px',
              padding: '10px 22px',
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: (isSaving || isSaveDisabled) ? 'not-allowed' : 'pointer',
              opacity: isSaveDisabled ? 0.45 : 1,
              boxShadow: isSaveDisabled ? 'none' : '0 2px 8px rgba(65, 16, 27, 0.25)',
              transition: 'background-color 0.2s ease, opacity 0.2s ease, transform 0.1s ease',
              flexShrink: 0
            }}
          >
            {isSaving ? 'SAVING...' : 'SAVE ANALYSIS'}
          </button>

          {saveSuccessMsg && (
            <span style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '12px',
              color: '#196F3D',
              fontWeight: 600
            }}>
              ✓ {saveSuccessMsg}
            </span>
          )}
        </div>
      </div>

      {/* ============================================================= */}
      {/* SAVED ANALYSES LIST (Under the Underwrite Panel)              */}
      {/* ============================================================= */}
      {savedAnalyses.length > 0 && (
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid rgba(52, 41, 42, 0.1)',
          borderRadius: '12px',
          padding: '18px 20px',
          boxShadow: '0 4px 16px rgba(52, 41, 42, 0.03)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px'
          }}>
            <span style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '10.5px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(52, 41, 42, 0.55)'
            }}>
              SAVED ANALYSES ({savedAnalyses.length})
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {savedAnalyses.map(item => {
              const dateStr = item.created_at
                ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '';
              const headline = getSavedHeadline(item);
              const strat = (item.strategy || '').toUpperCase();
              const isConfirming = confirmDeleteId === item.id;
              const isDeleting = deletingId === item.id;

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(52, 41, 42, 0.02)',
                    border: '1px solid rgba(52, 41, 42, 0.06)',
                    gap: '10px'
                  }}
                >
                  <div
                    onClick={() => handleLoadAnalysis(item)}
                    style={{
                      flex: 1,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      overflow: 'hidden'
                    }}
                    title="Click to load into calculator"
                  >
                    <span style={{
                      backgroundColor: 'rgba(65, 16, 27, 0.08)',
                      color: 'var(--secondary-color, #41101B)',
                      fontSize: '9.5px',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      flexShrink: 0
                    }}>
                      {strat}
                    </span>

                    <span style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--espresso, #1E1509)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {headline}
                    </span>

                    <span style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '11px',
                      color: 'rgba(52, 41, 42, 0.45)',
                      marginLeft: 'auto',
                      flexShrink: 0
                    }}>
                      {dateStr}
                    </span>
                  </div>

                  {/* Delete Link */}
                  {isConfirming ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteAnalysis(item.id)}
                        disabled={isDeleting}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#C0392B',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: isDeleting ? 'not-allowed' : 'pointer',
                          padding: 0
                        }}
                      >
                        {isDeleting ? '...' : 'Yes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={isDeleting}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'rgba(52, 41, 42, 0.5)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(52, 41, 42, 0.4)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        flexShrink: 0
                      }}
                      title="Delete saved analysis"
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
