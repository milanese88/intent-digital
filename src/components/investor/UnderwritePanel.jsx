import React, { useState, useEffect, useMemo } from 'react';
import FormattedNumberInput from './FormattedNumberInput.jsx';
import {
  calculateMortgagePayment,
  formatCurrency,
  formatPercent,
  formatRatio,
  underwriteRental,
  underwriteFlip,
  underwriteBrrrr
} from './underwriting.js';

// Section Header for Compact Underwriting Form
function SectionHeader({ title }) {
  return (
    <div style={{
      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
      fontSize: '9.5px',
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'rgba(52, 41, 42, 0.5)',
      marginTop: '16px',
      marginBottom: '6px'
    }}>
      {title}
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
  formatOnBlur = true
}) {
  const decimalAllowed = allowDecimal || suffix === '%';
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '7px 0',
      borderBottom: '1px solid rgba(52, 41, 42, 0.05)'
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
            cursor: id ? 'pointer' : 'default'
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
        backgroundColor: '#ffffff',
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


export default function UnderwritePanel({ property, compValueRaw, compValueFormatted }) {
  // Strategy toggle: 'rental' | 'flip' | 'brrrr'
  const initialStrategy = useMemo(() => {
    if (property?.strategy && ['rental', 'flip', 'brrrr'].includes(property.strategy.toLowerCase())) {
      return property.strategy.toLowerCase();
    }
    return 'flip';
  }, [property?.strategy]);

  const [strategy, setStrategy] = useState(initialStrategy);

  // Sync strategy if property changes
  useEffect(() => {
    if (property?.strategy && ['rental', 'flip', 'brrrr'].includes(property.strategy.toLowerCase())) {
      setStrategy(property.strategy.toLowerCase());
    }
  }, [property?.id, property?.strategy]);

  // Default Inputs Builder
  const buildDefaultInputs = (strat, prop) => {
    const listPrice = prop?.list_price != null ? Number(prop.list_price) : '';
    const estTaxes = listPrice ? Math.round(Number(listPrice) * 0.02) : '';

    if (strat === 'rental') {
      return {
        purchasePrice: listPrice,
        downPaymentPct: 25,
        interestRatePct: 7.0,
        loanTermYears: 30,
        closingCostsPct: 3,
        monthlyRent: '',
        vacancyPct: 5,
        maintenancePct: 5,
        capexPct: 5,
        managementPct: 0,
        propertyTaxesYr: estTaxes,
        insuranceYr: '',
        hoaMo: 0
      };
    }

    if (strat === 'flip') {
      return {
        purchasePrice: listPrice,
        rehabBudget: '',
        arv: '',
        buyingClosingCostsPct: 2,
        holdingMonths: 6,
        holdingCostMo: '',
        sellingCostsPct: 8
      };
    }

    // BRRRR
    return {
      purchasePrice: listPrice,
      rehabBudget: '',
      arv: '',
      buyingClosingCostsPct: 2,
      refiLtvPct: 75,
      refiRatePct: 7.0,
      refiTermYears: 30,
      refiClosingPct: 2,
      monthlyRent: '',
      vacancyPct: 5,
      maintenancePct: 5,
      capexPct: 5,
      managementPct: 0,
      propertyTaxesYr: estTaxes,
      insuranceYr: '',
      hoaMo: 0
    };
  };

  const [rentalInputs, setRentalInputs] = useState(() => buildDefaultInputs('rental', property));
  const [flipInputs, setFlipInputs] = useState(() => buildDefaultInputs('flip', property));
  const [brrrrInputs, setBrrrrInputs] = useState(() => buildDefaultInputs('brrrr', property));

  // Reset inputs when property ID changes
  useEffect(() => {
    setRentalInputs(buildDefaultInputs('rental', property));
    setFlipInputs(buildDefaultInputs('flip', property));
    setBrrrrInputs(buildDefaultInputs('brrrr', property));
  }, [property?.id]);

  // Saved Analyses State
  const [savedAnalyses, setSavedAnalyses] = useState([]);
  const [analysesLoading, setAnalysesLoading] = useState(false);
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
    // Strip non-numeric except decimal
    const cleanNum = val === '' ? '' : val;
    if (strategy === 'rental') {
      setRentalInputs(prev => ({ ...prev, [field]: cleanNum }));
    } else if (strategy === 'flip') {
      setFlipInputs(prev => ({ ...prev, [field]: cleanNum }));
    } else {
      setBrrrrInputs(prev => ({ ...prev, [field]: cleanNum }));
    }
  };

  // Convert percentage fields from 0-100 to decimal
  const currentInputs = strategy === 'rental' ? rentalInputs : strategy === 'flip' ? flipInputs : brrrrInputs;

  // Compute Results Live
  const results = useMemo(() => {
    if (strategy === 'rental') {
      return underwriteRental({
        purchasePrice: Number(rentalInputs.purchasePrice) || 0,
        downPaymentPct: (Number(rentalInputs.downPaymentPct) || 0) / 100,
        interestRatePct: (Number(rentalInputs.interestRatePct) || 0) / 100,
        loanTermYears: Number(rentalInputs.loanTermYears) || 30,
        closingCostsPct: (Number(rentalInputs.closingCostsPct) || 0) / 100,
        monthlyRent: rentalInputs.monthlyRent !== '' ? Number(rentalInputs.monthlyRent) : null,
        vacancyPct: (Number(rentalInputs.vacancyPct) || 0) / 100,
        maintenancePct: (Number(rentalInputs.maintenancePct) || 0) / 100,
        capexPct: (Number(rentalInputs.capexPct) || 0) / 100,
        managementPct: (Number(rentalInputs.managementPct) || 0) / 100,
        propertyTaxesYr: rentalInputs.propertyTaxesYr !== '' ? Number(rentalInputs.propertyTaxesYr) : null,
        insuranceYr: rentalInputs.insuranceYr !== '' ? Number(rentalInputs.insuranceYr) : null,
        hoaMo: Number(rentalInputs.hoaMo) || 0
      });
    }

    if (strategy === 'flip') {
      return underwriteFlip({
        purchasePrice: Number(flipInputs.purchasePrice) || 0,
        rehabBudget: Number(flipInputs.rehabBudget) || 0,
        arv: flipInputs.arv !== '' ? Number(flipInputs.arv) : null,
        buyingClosingCostsPct: (Number(flipInputs.buyingClosingCostsPct) || 0) / 100,
        holdingMonths: Number(flipInputs.holdingMonths) || 6,
        holdingCostMo: Number(flipInputs.holdingCostMo) || 0,
        sellingCostsPct: (Number(flipInputs.sellingCostsPct) || 0) / 100
      });
    }

    // BRRRR
    return underwriteBrrrr({
      purchasePrice: Number(brrrrInputs.purchasePrice) || 0,
      rehabBudget: Number(brrrrInputs.rehabBudget) || 0,
      arv: brrrrInputs.arv !== '' ? Number(brrrrInputs.arv) : null,
      buyingClosingCostsPct: (Number(brrrrInputs.buyingClosingCostsPct) || 0) / 100,
      refiLtvPct: (Number(brrrrInputs.refiLtvPct) || 0) / 100,
      refiRatePct: (Number(brrrrInputs.refiRatePct) || 0) / 100,
      refiTermYears: Number(brrrrInputs.refiTermYears) || 30,
      refiClosingPct: (Number(brrrrInputs.refiClosingPct) || 0) / 100,
      monthlyRent: brrrrInputs.monthlyRent !== '' ? Number(brrrrInputs.monthlyRent) : null,
      vacancyPct: (Number(brrrrInputs.vacancyPct) || 0) / 100,
      maintenancePct: (Number(brrrrInputs.maintenancePct) || 0) / 100,
      capexPct: (Number(brrrrInputs.capexPct) || 0) / 100,
      managementPct: (Number(brrrrInputs.managementPct) || 0) / 100,
      propertyTaxesYr: brrrrInputs.propertyTaxesYr !== '' ? Number(brrrrInputs.propertyTaxesYr) : null,
      insuranceYr: brrrrInputs.insuranceYr !== '' ? Number(brrrrInputs.insuranceYr) : null,
      hoaMo: Number(brrrrInputs.hoaMo) || 0
    });
  }, [strategy, rentalInputs, flipInputs, brrrrInputs]);

  // Save Analysis validation:
  // Rental: monthlyRent > 0 and insuranceYr > 0
  // Flip: arv > 0
  // BRRRR: arv > 0, monthlyRent > 0, and insuranceYr > 0
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

  // Formatter for currency inputs (strips non-digits for raw state, shows with commas)
  const formatNumWithCommas = (val) => {
    if (val === '' || val == null) return '';
    const digits = String(val).replace(/[^0-9]/g, '');
    if (!digits) return '';
    return Number(digits).toLocaleString('en-US');
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
        <h3 style={{
          fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
          fontSize: '26px',
          fontWeight: 400,
          color: 'var(--espresso, #34292A)',
          margin: '0 0 16px 0',
          letterSpacing: '-0.01em'
        }}>
          Underwrite
        </h3>

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

        {/* Inputs Group Container */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* ============================================================= */}
          {/* RENTAL INPUTS                                                 */}
          {/* ============================================================= */}
          {strategy === 'rental' && (
            <>
              <SectionHeader title="PURCHASE & FINANCING" />
              <InputRow
                id="rental-purchase-price"
                label="Purchase Price"
                prefix="$"
                value={rentalInputs.purchasePrice}
                onChange={(val) => handleInputChange('purchasePrice', val)}
                placeholder="0"
              />
              <InputRow
                id="rental-down-payment"
                label="Down Payment"
                suffix="%"
                value={rentalInputs.downPaymentPct}
                onChange={(val) => handleInputChange('downPaymentPct', val)}
                placeholder="25"
              />
              <InputRow
                id="rental-interest-rate"
                label="Interest Rate"
                suffix="%"
                value={rentalInputs.interestRatePct}
                onChange={(val) => handleInputChange('interestRatePct', val)}
                placeholder="7.0"
              />
              <InputRow
                id="rental-loan-term"
                label="Loan Term"
                suffix="yrs"
                value={rentalInputs.loanTermYears}
                onChange={(val) => handleInputChange('loanTermYears', val)}
                placeholder="30"
              />
              <InputRow
                id="rental-closing-costs"
                label="Closing Costs"
                suffix="%"
                value={rentalInputs.closingCostsPct}
                onChange={(val) => handleInputChange('closingCostsPct', val)}
                placeholder="3"
              />

              <SectionHeader title="INCOME" />
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

              <SectionHeader title="EXPENSES" />
              <InputRow
                id="rental-property-taxes"
                label="Property Taxes / yr"
                sublabel="estimate — FL taxes reset after sale"
                prefix="$"
                value={rentalInputs.propertyTaxesYr}
                onChange={(val) => handleInputChange('propertyTaxesYr', val)}
                placeholder="0"
              />
              <InputRow
                id="rental-insurance"
                label="Insurance / yr *"
                prefix="$"
                value={rentalInputs.insuranceYr}
                onChange={(val) => handleInputChange('insuranceYr', val)}
                placeholder="e.g. 6,000"
              />
              <InputRow
                id="rental-hoa"
                label="HOA / mo"
                prefix="$"
                value={rentalInputs.hoaMo}
                onChange={(val) => handleInputChange('hoaMo', val)}
                placeholder="0"
              />
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

          {/* ============================================================= */}
          {/* FLIP INPUTS                                                   */}
          {/* ============================================================= */}
          {strategy === 'flip' && (
            <>
              <SectionHeader title="PURCHASE & REHAB" />
              <InputRow
                id="flip-purchase-price"
                label="Purchase Price"
                prefix="$"
                value={flipInputs.purchasePrice}
                onChange={(val) => handleInputChange('purchasePrice', val)}
                placeholder="0"
              />
              <InputRow
                id="flip-rehab-budget"
                label="Rehab Budget"
                prefix="$"
                value={flipInputs.rehabBudget}
                onChange={(val) => handleInputChange('rehabBudget', val)}
                placeholder="0"
              />

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
                id="flip-buying-closing-costs"
                label="Buying Closing Costs"
                suffix="%"
                value={flipInputs.buyingClosingCostsPct}
                onChange={(val) => handleInputChange('buyingClosingCostsPct', val)}
                placeholder="2"
              />
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
                sublabel="taxes, insurance, utilities, debt"
                prefix="$"
                value={flipInputs.holdingCostMo}
                onChange={(val) => handleInputChange('holdingCostMo', val)}
                placeholder="0"
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

          {/* ============================================================= */}
          {/* BRRRR INPUTS                                                  */}
          {/* ============================================================= */}
          {strategy === 'brrrr' && (
            <>
              <SectionHeader title="BUY & REHAB" />
              <InputRow
                id="brrrr-purchase-price"
                label="Purchase Price"
                prefix="$"
                value={brrrrInputs.purchasePrice}
                onChange={(val) => handleInputChange('purchasePrice', val)}
                placeholder="0"
              />
              <InputRow
                id="brrrr-rehab-budget"
                label="Rehab Budget"
                prefix="$"
                value={brrrrInputs.rehabBudget}
                onChange={(val) => handleInputChange('rehabBudget', val)}
                placeholder="0"
              />
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
              <InputRow
                id="brrrr-buying-closing-costs"
                label="Buying Closing Costs"
                suffix="%"
                value={brrrrInputs.buyingClosingCostsPct}
                onChange={(val) => handleInputChange('buyingClosingCostsPct', val)}
                placeholder="2"
              />

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
                id="brrrr-property-taxes"
                label="Property Taxes / yr"
                sublabel="estimate — FL taxes reset after sale"
                prefix="$"
                value={brrrrInputs.propertyTaxesYr}
                onChange={(val) => handleInputChange('propertyTaxesYr', val)}
                placeholder="0"
              />
              <InputRow
                id="brrrr-insurance"
                label="Insurance / yr *"
                prefix="$"
                value={brrrrInputs.insuranceYr}
                onChange={(val) => handleInputChange('insuranceYr', val)}
                placeholder="e.g. 6,000"
              />
              <InputRow
                id="brrrr-hoa"
                label="HOA / mo"
                prefix="$"
                value={brrrrInputs.hoaMo}
                onChange={(val) => handleInputChange('hoaMo', val)}
                placeholder="0"
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

                  {/* Quiet Delete Link */}
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
