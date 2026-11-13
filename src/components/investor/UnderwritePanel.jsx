import React, { useState, useEffect, useMemo, useRef } from 'react';
import FormattedNumberInput from './FormattedNumberInput.jsx';
import {
  formatCurrency,
  formatPercent,
  formatRatio,
  underwriteRental,
  underwriteFlip,
  underwriteBrrrr,
  underwriteLiveInPlan,
  evaluateLiveInFit,
  formatStrategyDisplayLabel,
  formatLiveInChosenExitHeadline,
  LOAN_TYPES,
  ESTIMATED_CLOSING_DEFAULTS
} from './underwriting.js';
import {
  getMergedFinancingConfig,
  getDefaultMillageForCounty,
  normalizeCreditBand
} from '../../config/financing.js';
import LiveInPlanView from './LiveInPlanView.jsx';

// Keyboard-accessible Tooltip for Underwriting Metric Labels
function MetricTooltip({ text, alignRight = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <span
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle'
      }}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        aria-label="What does this mean?"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(prev => !prev);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget)) {
            setIsOpen(false);
          }
        }}
        style={{
          background: 'none',
          border: 'none',
          padding: '2px',
          margin: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isOpen ? 'var(--secondary-color, #41101B)' : 'rgba(52, 41, 42, 0.45)',
          borderRadius: '50%',
          outline: 'none',
          transition: 'color 0.15s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--secondary-color, #41101B)'; }}
        onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.color = 'rgba(52, 41, 42, 0.45)'; }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
          <circle cx="8" cy="8" r="6.75" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="4.75" r="0.75" fill="currentColor" />
        </svg>
      </button>

      {isOpen && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: alignRight ? 'auto' : '50%',
            right: alignRight ? '0' : 'auto',
            transform: alignRight ? 'none' : 'translateX(-50%)',
            backgroundColor: '#1E1509',
            color: '#FAF8F5',
            padding: '7px 10px',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '11px',
            fontWeight: 400,
            lineHeight: 1.45,
            width: 'max-content',
            maxWidth: '220px',
            whiteSpace: 'normal',
            zIndex: 1000,
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.22)',
            border: '1px solid rgba(250, 248, 245, 0.15)',
            textAlign: 'left',
            pointerEvents: 'none'
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

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
  countyData,
  compValueRaw,
  compValueFormatted,
  appraisalAsIs,
  appraisalArv,
  appliedAppraisal,
  profile: initialProfile,
  onOpenProfileModal,
  onUnderwriteChange,
  onNavigateToLesson,
  setActiveDashboardTab,
  navigateTo
}) {
  // Strategy toggle: 'rental' | 'flip' | 'brrrr' | 'live_in'
  const initialStrategy = useMemo(() => {
    if (property?.strategy && ['rental', 'flip', 'brrrr', 'live_in'].includes(property.strategy.toLowerCase())) {
      return property.strategy.toLowerCase();
    }
    return 'rental';
  }, [property?.strategy]);

  const [strategy, setStrategy] = useState(initialStrategy);

  // Sync strategy if property changes
  useEffect(() => {
    if (property?.strategy && ['rental', 'flip', 'brrrr', 'live_in'].includes(property.strategy.toLowerCase())) {
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

  const resolveDefaultLiveInValueAfterReno = ({
    rehabVal,
    asIsVal,
    arvVal,
    purchaseVal
  }) => {
    const hasRehab = Number(rehabVal) > 0;
    if (hasRehab) {
      if (Number(arvVal) > 0) {
        return { value: Math.round(Number(arvVal)), source: 'from Appraisal · ARV' };
      }
      if (Number(purchaseVal) > 0) {
        return {
          value: Math.round(Number(purchaseVal) + Number(rehabVal)),
          source: 'purchase price + renovation'
        };
      }
      return { value: '', source: '' };
    }
    if (Number(asIsVal) > 0) {
      return { value: Math.round(Number(asIsVal)), source: 'from Appraisal · as-is' };
    }
    if (Number(purchaseVal) > 0) {
      return { value: Math.round(Number(purchaseVal)), source: 'purchase price (no appraisal yet)' };
    }
    return { value: '', source: '' };
  };

  const resolveDefaultMarketRentFromData = (prop, cData) => {
    const raw =
      prop?.market_rent ??
      prop?.estimated_rent ??
      prop?.monthly_rent ??
      cData?.market_rent ??
      cData?.estimated_rent ??
      null;
    if (raw != null && raw !== '' && Number(raw) > 0) {
      return { value: Math.round(Number(raw)), source: 'from county/rent data' };
    }
    return { value: '', source: '' };
  };

  const buildDefaultLiveInInputs = (prop, userProfile, defaultAsIs, defaultArv, cData) => {
    const merged = getMergedFinancingConfig(userProfile);
    const listPrice = prop?.list_price != null ? Number(prop.list_price) : '';
    const defaultRehab =
      prop?.rehab_budget != null && prop.rehab_budget !== ''
        ? Math.round(Number(prop.rehab_budget))
        : 0;
    const unitsCount = Math.min(4, Math.max(1, Math.round(Number(prop?.units) || 1)));
    const resolvedPostReno = resolveDefaultLiveInValueAfterReno({
      rehabVal: defaultRehab,
      asIsVal: defaultAsIs,
      arvVal: defaultArv,
      purchaseVal: listPrice
    });
    const resolvedRent = resolveDefaultMarketRentFromData(prop, cData);
    const countyKey = prop?.county || prop?.parcel_county || 'Broward';

    return {
      purchasePrice: listPrice,
      units: unitsCount,
      interestRatePct: merged.defaults.fhaInterestRatePct,
      creditScoreBand: normalizeCreditBand(userProfile?.credit_tier),
      downPaymentPct: merged.fha.minDownPct,
      closingCostsPct: merged.defaults.closingCostsPct,
      sellerCredits: 0,
      rehabBudget: defaultRehab,
      rehabPaidBy: 'cash',
      valueAfterReno: resolvedPostReno.value,
      valueAfterRenoSource: resolvedPostReno.source,
      valueAfterRenoTouched: false,
      currentRentMo: merged.defaults.currentRentMo,
      otherUnitsRentMo: '',
      liveInYears: merged.defaults.liveInYears,
      appreciationPctYr: merged.defaults.appreciationPctYr,
      rentGrowthPctYr: merged.defaults.rentGrowthPctYr,
      marketRentMo: resolvedRent.value,
      marketRentSource: resolvedRent.source,
      marketRentTouched: false,
      vacancyPct: merged.defaults.vacancyPct,
      repairsPct: merged.defaults.repairsPct,
      capexPct: merged.defaults.capexPct,
      managementPct: merged.defaults.managementPct,
      homeownerInsuranceYr: merged.defaults.homeownerInsuranceYr,
      landlordInsuranceYr: merged.defaults.landlordInsuranceYr,
      floodInsuranceYr: isSFHA ? merged.defaults.floodInsuranceYr : 0,
      hoaMonthly:
        prop?.hoa_monthly != null && prop.hoa_monthly !== ''
          ? Number(prop.hoa_monthly)
          : isCondo
          ? ESTIMATED_CLOSING_DEFAULTS.defaultCondoHoaMo
          : 0,
      millageRate: getDefaultMillageForCounty(countyKey, merged),
      propertyTaxNonHomesteadOverride: false,
      propertyTaxNonHomesteadYr: '',
      useConvRefi: true,
      filingStatus: 'single',
      preferredExit: 'rent'
    };
  };

  const [rentalInputs, setRentalInputs] = useState(() => buildDefaultInputs('rental', property, profile));
  const [flipInputs, setFlipInputs] = useState(() => buildDefaultInputs('flip', property, profile));
  const [brrrrInputs, setBrrrrInputs] = useState(() => buildDefaultInputs('brrrr', property, profile));
  const [liveInInputs, setLiveInInputs] = useState(() =>
    buildDefaultLiveInInputs(property, profile, appraisalAsIs, appraisalArv, countyData)
  );

  // Toggle for detailed cash to close breakdown
  const [showDetailedClosing, setShowDetailedClosing] = useState(false);

  // Toggle for collapsible plain-English verdict explanations
  const [verdictExpanded, setVerdictExpanded] = useState(false);

  // Reset inputs when property ID changes
  useEffect(() => {
    setRentalInputs(buildDefaultInputs('rental', property, profile));
    setFlipInputs(buildDefaultInputs('flip', property, profile));
    setBrrrrInputs(buildDefaultInputs('brrrr', property, profile));
    setLiveInInputs(
      buildDefaultLiveInInputs(property, profile, appraisalAsIs, appraisalArv, countyData)
    );
  }, [property?.id]);

  // Keep Live-in valueAfterReno synced to Appraisal As-Is ($0 reno) or Appraisal ARV (>$0 reno) until manually edited
  useEffect(() => {
    setLiveInInputs((prev) => {
      if (prev.valueAfterRenoTouched) return prev;
      const next = resolveDefaultLiveInValueAfterReno({
        rehabVal: prev.rehabBudget,
        asIsVal: appraisalAsIs,
        arvVal: appraisalArv,
        purchaseVal: prev.purchasePrice
      });
      if (prev.valueAfterReno === next.value && prev.valueAfterRenoSource === next.source) {
        return prev;
      }
      return {
        ...prev,
        valueAfterReno: next.value,
        valueAfterRenoSource: next.source
      };
    });
  }, [appraisalAsIs, appraisalArv, liveInInputs.rehabBudget, liveInInputs.purchasePrice]);

  // Populate marketRentMo if county/property rent data arrives asynchronously and user hasn't edited it
  useEffect(() => {
    const resolvedRent = resolveDefaultMarketRentFromData(property, countyData);
    if (!resolvedRent.value) return;
    setLiveInInputs((prev) => {
      if (prev.marketRentTouched || prev.marketRentMo !== '') return prev;
      return {
        ...prev,
        marketRentMo: resolvedRent.value,
        marketRentSource: resolvedRent.source
      };
    });
  }, [
    property?.market_rent,
    property?.estimated_rent,
    property?.monthly_rent,
    countyData?.market_rent,
    countyData?.estimated_rent
  ]);

  // Apply reconciled appraisal value from Value & Comps / Appraisal ("Use in Deal →")
  useEffect(() => {
    if (!appliedAppraisal?.nonce || !(Number(appliedAppraisal.value) > 0)) return;
    const rounded = Math.round(Number(appliedAppraisal.value));
    if (appliedAppraisal.mode === 'arv') {
      setFlipInputs((prev) => ({ ...prev, arv: rounded }));
      setBrrrrInputs((prev) => ({ ...prev, arv: rounded }));
      setLiveInInputs((prev) => ({
        ...prev,
        valueAfterReno: rounded,
        valueAfterRenoSource: 'from Appraisal · ARV',
        valueAfterRenoTouched: true
      }));
      setStrategy((prev) => (prev === 'rental' ? 'flip' : prev));
    } else {
      setRentalInputs((prev) => ({ ...prev, purchasePrice: rounded }));
      setFlipInputs((prev) => ({ ...prev, purchasePrice: rounded }));
      setBrrrrInputs((prev) => ({ ...prev, purchasePrice: rounded }));
      setLiveInInputs((prev) => ({
        ...prev,
        purchasePrice: rounded,
        ...(!(Number(prev.rehabBudget) > 0)
          ? {
              valueAfterReno: rounded,
              valueAfterRenoSource: 'from Appraisal · as-is',
              valueAfterRenoTouched: false
            }
          : {})
      }));
    }
  }, [appliedAppraisal?.nonce]);

  // Saved Analyses State
  const [savedAnalyses, setSavedAnalyses] = useState([]);
  const [_analysesLoading, setAnalysesLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [saveErrorMsg, setSaveErrorMsg] = useState('');
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

  const [selectedReportAnalysisId, setSelectedReportAnalysisId] = useState('');
  useEffect(() => {
    if (savedAnalyses.length > 0) {
      if (!selectedReportAnalysisId || !savedAnalyses.some(a => a.id === selectedReportAnalysisId)) {
        setSelectedReportAnalysisId(savedAnalyses[0].id);
      }
    }
  }, [savedAnalyses, selectedReportAnalysisId]);

  // Input Change Helper
  const handleInputChange = (field, val) => {
    const clean = val === '' ? '' : val;
    if (strategy === 'rental') {
      setRentalInputs(prev => ({ ...prev, [field]: clean }));
    } else if (strategy === 'flip') {
      setFlipInputs(prev => ({ ...prev, [field]: clean }));
    } else if (strategy === 'live_in') {
      setLiveInInputs(prev => ({
        ...prev,
        [field]: clean,
        ...(field === 'valueAfterReno'
          ? { valueAfterRenoTouched: true, valueAfterRenoSource: 'custom override' }
          : {}),
        ...(field === 'marketRentMo'
          ? { marketRentTouched: true, marketRentSource: clean !== '' ? 'custom entry' : '' }
          : {})
      }));
    } else {
      setBrrrrInputs(prev => ({ ...prev, [field]: clean }));
    }
  };

  const handleLiveInBatchChange = (patch) => {
    setLiveInInputs((prev) => ({
      ...prev,
      ...patch,
      ...(Object.prototype.hasOwnProperty.call(patch, 'valueAfterReno') &&
      !Object.prototype.hasOwnProperty.call(patch, 'valueAfterRenoTouched')
        ? { valueAfterRenoTouched: true, valueAfterRenoSource: 'custom override' }
        : {})
    }));
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
    else if (strategy === 'brrrr') setBrrrrInputs(updateState);
  };

  // Active inputs pointer
  const currentInputs =
    strategy === 'rental'
      ? rentalInputs
      : strategy === 'flip'
      ? flipInputs
      : strategy === 'live_in'
      ? liveInInputs
      : brrrrInputs;

  // Compute Results Live via underwriting.js
  const results = useMemo(() => {
    if (strategy === 'live_in') {
      const countyName = property?.county || property?.parcel_county || 'Broward';
      const baseRes = underwriteLiveInPlan(
        {
          ...liveInInputs,
          county: countyName,
          mySavings: profile?.liquid_cash != null ? Number(profile.liquid_cash) : null
        },
        profile
      );
      const liveFitSnapshot = {
        ...(property || {}),
        county: countyName,
        asking_price: Number(liveInInputs.purchasePrice) || property?.list_price || 0,
        units: Number(liveInInputs.units) || property?.units || 1,
        hoa_monthly: Number(liveInInputs.hoaMonthly) || property?.hoa_monthly || 0,
        has_hoa: Number(liveInInputs.hoaMonthly) > 0 ? true : property?.has_hoa
      };
      return {
        ...baseRes,
        liveInFit: evaluateLiveInFit(liveFitSnapshot, profile)
      };
    }

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
  }, [strategy, currentInputs, rentalInputs, flipInputs, brrrrInputs, liveInInputs, property?.county, property?.parcel_county, profile]);

  // Save Analysis validation
  const isSaveDisabled = useMemo(() => {
    if (strategy === 'live_in') {
      return !(Number(liveInInputs.purchasePrice) > 0);
    }
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
  }, [strategy, rentalInputs, flipInputs, brrrrInputs, liveInInputs]);

  // Save Analysis Handler
  const handleSaveAnalysis = async () => {
    if (!property?.id || isSaving || isSaveDisabled) return;

    setIsSaving(true);
    setSaveSuccessMsg('');
    setSaveErrorMsg('');
    try {
      const inputsToSave =
        strategy === 'live_in'
          ? {
              ...liveInInputs,
              preferredExit: ['rent', 'sell', 'keep'].includes(liveInInputs.preferredExit)
                ? liveInInputs.preferredExit
                : 'rent',
              county: property?.county || property?.parcel_county || 'Broward',
              mySavings: profile?.liquid_cash != null ? Number(profile.liquid_cash) : null
            }
          : currentInputs;

      const res = await fetch('/api/investor/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          strategy,
          inputs: inputsToSave,
          results
        })
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || 'Failed to save analysis');
      }

      setSavedAnalyses(prev => [body, ...prev]);
      if (body?.id) {
        setSelectedReportAnalysisId(body.id);
      }
      setSaveSuccessMsg('Analysis saved');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Error saving analysis:', err);
      setSaveErrorMsg(err.message || 'Failed to save analysis');
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
    } else if (strat === 'live_in') {
      setLiveInInputs(prev => ({ ...prev, ...(saved.inputs || {}), valueAfterRenoTouched: true }));
    }
  };

  // Headline number for saved analysis
  const getSavedHeadline = (item) => {
    const res = item.results || {};
    const inp = item.inputs || {};
    const strat = (item.strategy || '').toLowerCase();
    const arvVal = inp.arv || inp.valueAfterReno;
    const arvPrefix = arvVal ? `ARV ${formatCurrency(arvVal)} · ` : '';

    if (strat === 'live_in') {
      const chosenHeadline = formatLiveInChosenExitHeadline(item);
      const valPrefix = inp.valueAfterReno
        ? `Val ${formatCurrency(inp.valueAfterReno)} · `
        : '';
      return `${valPrefix}${chosenHeadline}`;
    }

    if (strat === 'rental') {
      if (res.monthlyCashFlow != null) {
        const sign = res.monthlyCashFlow >= 0 ? '+' : '';
        return `${arvPrefix}${sign}${formatCurrency(res.monthlyCashFlow)}/mo`;
      }
      return `${arvPrefix}Rental analysis`;
    }
    if (strat === 'flip') {
      if (res.projectedProfit != null) {
        const sign = res.projectedProfit >= 0 ? '+' : '';
        return `${arvPrefix}${sign}${formatCurrency(res.projectedProfit)} profit`;
      }
      return `${arvPrefix}Flip analysis`;
    }
    if (strat === 'brrrr') {
      if (res.cashLeftInDeal != null) {
        if (res.cashLeftInDeal <= 0) {
          return `${arvPrefix}+${formatCurrency(Math.abs(res.cashLeftInDeal))} cash out`;
        }
        return `${arvPrefix}${formatCurrency(res.cashLeftInDeal)} left`;
      }
      return `${arvPrefix}BRRRR analysis`;
    }
    return `${arvPrefix}Analysis`;
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

        {/* 4-way Strategy Pill Toggle: RENTAL / FLIP / BRRRR / LIVE-IN (FHA) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          backgroundColor: 'rgba(52, 41, 42, 0.05)',
          borderRadius: '50px',
          padding: '4px',
          marginBottom: '20px'
        }}>
          {[
            { id: 'rental', label: 'RENTAL' },
            { id: 'flip', label: 'FLIP' },
            { id: 'brrrr', label: 'BRRRR' },
            { id: 'live_in', label: 'LIVE-IN (FHA)' }
          ].map(tab => {
            const isSelected = strategy === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStrategy(tab.id);
                  setVerdictExpanded(false);
                  setSaveErrorMsg('');
                }}
                style={{
                  backgroundColor: isSelected ? 'var(--secondary-color, #41101B)' : 'transparent',
                  color: isSelected ? 'var(--lighter-tone, #FAF8F5)' : 'rgba(52, 41, 42, 0.65)',
                  border: 'none',
                  borderRadius: '50px',
                  padding: '7px 4px',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {strategy === 'live_in' ? (
          <LiveInPlanView
            property={property}
            profile={profile}
            inputs={liveInInputs}
            onChangeInput={handleInputChange}
            onBatchChange={handleLiveInBatchChange}
            results={results}
            appraisalAsIs={appraisalAsIs}
            appraisalArv={appraisalArv}
            onOpenBuyingProfile={onOpenProfileModal}
            onNavigateToLesson={onNavigateToLesson}
            onSaveAnalysis={handleSaveAnalysis}
            savingAnalysis={isSaving}
            saveSuccessMsg={saveSuccessMsg}
            saveErrorMsg={saveErrorMsg}
          />
        ) : (
        <>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        MONTHLY CASH FLOW
                      </span>
                      <MetricTooltip
                        text="Net money left each month after collecting rent and paying all operating expenses and mortgage debt service."
                        alignRight={false}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        CAP RATE
                      </span>
                      <MetricTooltip
                        text="Capitalization rate (NOI ÷ purchase price): unleveraged annual rate of return, measuring the asset's intrinsic performance."
                        alignRight={true}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        CASH-ON-CASH
                      </span>
                      <MetricTooltip
                        text="Annual pre-tax cash flow divided by total out-of-pocket cash invested, measuring your return on capital."
                        alignRight={false}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        CASH NEEDED
                      </span>
                      <MetricTooltip
                        text="Total out-of-pocket cash required to close the purchase, including down payment, closing costs, and upfront escrows."
                        alignRight={true}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        DSCR
                      </span>
                      <MetricTooltip
                        text="Debt Service Coverage Ratio (NOI ÷ annual loan payments): measures how easily rent covers mortgage debt; lenders typically seek 1.2+."
                        alignRight={false}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        1% RULE
                      </span>
                      <MetricTooltip
                        text="Monthly rent divided by purchase price: a screening rule of thumb where 1%+ indicates healthy positive cash flow."
                        alignRight={true}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        PROJECTED PROFIT
                      </span>
                      <MetricTooltip
                        text="Estimated net flip profit after deducting acquisition, rehab, buying/selling closing, and holding costs from ARV."
                        alignRight={false}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        ROI
                      </span>
                      <MetricTooltip
                        text="Return on investment: projected flip profit divided by total all-in project capital (purchase, rehab, closing, and holding costs)."
                        alignRight={true}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        MAX OFFER (70%)
                      </span>
                      <MetricTooltip
                        text="70% of ARV minus repairs: the maximum purchase price under the 70% rule to ensure sufficient profit and margin."
                        alignRight={false}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        TOTAL COST
                      </span>
                      <MetricTooltip
                        text="All-in project expenditure: purchase price plus rehab budget, buying closing costs, and holding expenses during renovation."
                        alignRight={true}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        REFI LOAN
                      </span>
                      <MetricTooltip
                        text="The new permanent loan amount based on the appraised after-repair value (ARV) and your target refinance LTV."
                        alignRight={false}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        ALL-IN COST
                      </span>
                      <MetricTooltip
                        text="Total initial capital required: purchase price plus renovation costs, acquisition closing costs, and holding expenses."
                        alignRight={true}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        CASH LEFT IN DEAL
                      </span>
                      <MetricTooltip
                        text="All-in project cost minus refinance loan proceeds: negative values mean 100% cash recovery plus extra proceeds."
                        alignRight={false}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        POST-REFI CASH FLOW
                      </span>
                      <MetricTooltip
                        text="Net monthly cash flow generated by rent after ongoing operating expenses and the new permanent mortgage payment."
                        alignRight={true}
                      />
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
                        CASH-ON-CASH
                      </span>
                      <MetricTooltip
                        text="Annual pre-tax cash flow divided by cash left in deal; if all cash was recovered on refinance, return is infinite (∞)."
                        alignRight={false}
                      />
                    </div>
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

          {/* ============================================================= */}
          {/* PLAIN-ENGLISH MATH & COLLAPSIBLE DEFINITIONS                   */}
          {/* ============================================================= */}
          {strategy === 'flip' && (() => {
            const flipArv = flipInputs.arv !== '' ? Number(flipInputs.arv) : null;
            const flipRehab = Number(flipInputs.rehabBudget) || 0;
            const flipPrice = Number(currentInputs.purchasePrice) || 0;
            const flipMaxOffer = results.maxOffer != null ? results.maxOffer : (flipArv != null ? Math.round(flipArv * 0.70 - flipRehab) : null);
            const hasArv = flipArv != null && flipArv > 0;
            const flipDiff = hasArv && flipMaxOffer != null ? flipPrice - flipMaxOffer : null;
            const flipDiffText = flipDiff == null
              ? ''
              : flipDiff < 0
              ? `${formatCurrency(Math.abs(flipDiff))} under the max`
              : flipDiff > 0
              ? `${formatCurrency(flipDiff)} over the max`
              : 'right at the max';

            return (
              <div style={{ marginTop: '8px' }}>
                <div style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '13px',
                  color: 'rgba(250, 248, 245, 0.72)',
                  lineHeight: 1.55
                }}>
                  {hasArv ? (
                    <>
                      70% rule: ARV {formatCurrency(flipArv)} × 70% − rehab {formatCurrency(flipRehab)} = max offer {formatCurrency(flipMaxOffer)}. Your price: {formatCurrency(flipPrice)} — {flipDiffText}.
                    </>
                  ) : (
                    <>
                      70% rule: Enter an ARV and rehab budget above to calculate the maximum allowable offer.
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setVerdictExpanded(prev => !prev)}
                  aria-expanded={verdictExpanded}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    marginTop: '10px',
                    color: 'rgba(250, 248, 245, 0.75)',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '11px',
                    fontWeight: 500,
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'color 0.15s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#FAF8F5'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(250, 248, 245, 0.75)'; }}
                >
                  <span>What's the 70% rule?</span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    style={{
                      transform: verdictExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease'
                    }}
                  >
                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {verdictExpanded && (
                  <div style={{
                    marginTop: '10px',
                    paddingTop: '10px',
                    borderTop: '1px solid rgba(250, 248, 245, 0.12)',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '12px',
                    lineHeight: 1.55,
                    color: 'rgba(250, 248, 245, 0.85)'
                  }}>
                    A flipper's rule of thumb: pay no more than 70% of the after-repair value, minus repairs. The other 30% covers closing and selling costs, holding costs (interest, taxes, insurance, utilities) and your profit. In higher-priced markets some investors use 75–80% — it's a guideline, not a guarantee.
                  </div>
                )}
              </div>
            );
          })()}

          {strategy === 'rental' && (() => {
            const rentalPrice = Number(currentInputs.purchasePrice) || 0;
            const rentalRent = rentalInputs.monthlyRent !== '' ? Number(rentalInputs.monthlyRent) : null;
            const rentalCashNeeded = results.cashNeeded != null ? results.cashNeeded : 0;
            const rentalNoi = results.noi;
            const rentalCashFlowYr = results.cashFlowYr;
            const rentalCashFlowMo = results.monthlyCashFlow;
            const rentalDebtYr = results.debtYr != null ? results.debtYr : 0;
            const rentalCapRate = results.capRate;
            const rentalCashOnCash = results.cashOnCash;
            const rentalDscr = results.dscr;
            const rentalOnePct = results.onePercentRule;
            const hasRent = rentalRent != null && rentalRent > 0;

            return (
              <div style={{ marginTop: '8px' }}>
                <div style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '13px',
                  color: 'rgba(250, 248, 245, 0.72)',
                  lineHeight: 1.55
                }}>
                  {hasRent && results.isComplete ? (
                    <>
                      Cash flow: <strong style={{ color: '#FAF8F5' }}>{formatCurrency(rentalCashFlowMo)}/mo</strong> ({formatCurrency(rentalCashFlowYr)}/yr)
                      {' · '}Cap rate: <strong style={{ color: '#FAF8F5' }}>{formatPercent(rentalCapRate)}</strong> (NOI {formatCurrency(rentalNoi)} ÷ price {formatCurrency(rentalPrice)})
                      {' · '}Cash-on-cash: <strong style={{ color: '#FAF8F5' }}>{formatPercent(rentalCashOnCash)}</strong> ({formatCurrency(rentalCashFlowYr)} ÷ {formatCurrency(rentalCashNeeded)})
                      {' · '}DSCR: <strong style={{ color: '#FAF8F5' }}>{rentalDscr != null ? `${formatRatio(rentalDscr)}x` : '—'}</strong> ({rentalDebtYr > 0 ? `NOI ${formatCurrency(rentalNoi)} ÷ debt ${formatCurrency(rentalDebtYr)}` : 'all cash'})
                      {' · '}1% rule: <strong style={{ color: '#FAF8F5' }}>{formatPercent(rentalOnePct)}</strong> (rent {formatCurrency(rentalRent)} ÷ price {formatCurrency(rentalPrice)})
                    </>
                  ) : (
                    <>
                      Enter monthly rent and insurance above to see live cash flow, cap rate, cash-on-cash, DSCR, and the 1% rule.
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setVerdictExpanded(prev => !prev)}
                  aria-expanded={verdictExpanded}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    marginTop: '10px',
                    color: 'rgba(250, 248, 245, 0.75)',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '11px',
                    fontWeight: 500,
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'color 0.15s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#FAF8F5'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(250, 248, 245, 0.75)'; }}
                >
                  <span>What do these rental metrics mean?</span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    style={{
                      transform: verdictExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease'
                    }}
                  >
                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {verdictExpanded && (
                  <div style={{
                    marginTop: '10px',
                    paddingTop: '10px',
                    borderTop: '1px solid rgba(250, 248, 245, 0.12)',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '12px',
                    lineHeight: 1.6,
                    color: 'rgba(250, 248, 245, 0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div>
                      <strong style={{ color: '#FAF8F5' }}>Cash flow:</strong> Net cash remaining in your pocket each month ({formatCurrency(rentalCashFlowMo)}/mo or {formatCurrency(rentalCashFlowYr)}/yr) after collecting rent and paying operating expenses (property taxes, insurance, maintenance, vacancy, capex) and debt service.
                    </div>
                    <div>
                      <strong style={{ color: '#FAF8F5' }}>Cap rate (NOI ÷ price):</strong> Unleveraged annual return independent of financing. Calculated as Net Operating Income ({formatCurrency(rentalNoi)}) divided by purchase price ({formatCurrency(rentalPrice)}) = {formatPercent(rentalCapRate)}.
                    </div>
                    <div>
                      <strong style={{ color: '#FAF8F5' }}>Cash-on-cash (annual cash flow ÷ cash invested):</strong> Annual pre-tax return on the actual out-of-pocket cash invested. Calculated as annual cash flow ({formatCurrency(rentalCashFlowYr)}) divided by total cash needed to close ({formatCurrency(rentalCashNeeded)}) = {formatPercent(rentalCashOnCash)}.
                    </div>
                    <div>
                      <strong style={{ color: '#FAF8F5' }}>DSCR (NOI ÷ annual loan payments):</strong> Debt Service Coverage Ratio measuring how comfortably property income covers mortgage payments ({rentalDscr != null ? `${formatRatio(rentalDscr)}x` : '—'}). Lenders often look for 1.20+ to qualify an investor loan.
                    </div>
                    <div>
                      <strong style={{ color: '#FAF8F5' }}>1% rule (monthly rent ÷ price):</strong> Quick rule of thumb where monthly rent should equal 1% or more of the purchase price to produce healthy cash flow. Currently: {formatPercent(rentalOnePct)} ({formatCurrency(rentalRent)} ÷ {formatCurrency(rentalPrice)}).
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {strategy === 'brrrr' && (() => {
            const brrrrArv = brrrrInputs.arv !== '' ? Number(brrrrInputs.arv) : null;
            const brrrrAllIn = results.allInCost;
            const brrrrRefiLoan = results.refiLoan;
            const brrrrCashLeft = results.cashLeftInDeal;
            const brrrrPostRefiCashFlow = results.postRefiMonthlyCashFlow;
            const brrrrCashOnCash = results.cashOnCash;
            const brrrrIsInfinite = results.isInfiniteCoC;
            const hasArv = brrrrArv != null && brrrrArv > 0;

            return (
              <div style={{ marginTop: '8px' }}>
                <div style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '13px',
                  color: 'rgba(250, 248, 245, 0.72)',
                  lineHeight: 1.55
                }}>
                  {hasArv && brrrrAllIn != null && brrrrRefiLoan != null ? (
                    <>
                      Cash left in deal: all-in cost <strong style={{ color: '#FAF8F5' }}>{formatCurrency(brrrrAllIn)}</strong> − refinance loan <strong style={{ color: '#FAF8F5' }}>{formatCurrency(brrrrRefiLoan)}</strong> = <strong style={{ color: '#FAF8F5' }}>{brrrrCashLeft <= 0 ? `$0 left in deal (${formatCurrency(Math.abs(brrrrCashLeft))} cash back out)` : `${formatCurrency(brrrrCashLeft)} left in the deal`}</strong>.
                      {results.isComplete && brrrrPostRefiCashFlow != null && (
                        <>
                          {' · '}Post-refi cash flow: <strong style={{ color: '#FAF8F5' }}>{formatCurrency(brrrrPostRefiCashFlow)}/mo</strong>
                          {' · '}Cash-on-cash: <strong style={{ color: '#FAF8F5' }}>{brrrrIsInfinite ? '∞ (infinite)' : formatPercent(brrrrCashOnCash)}</strong>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      Enter ARV and rehab budget above to calculate refinance loan and cash left in the deal.
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setVerdictExpanded(prev => !prev)}
                  aria-expanded={verdictExpanded}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    marginTop: '10px',
                    color: 'rgba(250, 248, 245, 0.75)',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '11px',
                    fontWeight: 500,
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'color 0.15s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#FAF8F5'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(250, 248, 245, 0.75)'; }}
                >
                  <span>Why does cash left in the deal matter?</span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    style={{
                      transform: verdictExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease'
                    }}
                  >
                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {verdictExpanded && (
                  <div style={{
                    marginTop: '10px',
                    paddingTop: '10px',
                    borderTop: '1px solid rgba(250, 248, 245, 0.12)',
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '12px',
                    lineHeight: 1.6,
                    color: 'rgba(250, 248, 245, 0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div>
                      <strong style={{ color: '#FAF8F5' }}>Cash left in the deal (all-in cost − refinance loan):</strong> The net out-of-pocket capital remaining tied up after completing the renovation and refinancing into permanent debt. Here, all-in cost {formatCurrency(brrrrAllIn)} minus new loan {formatCurrency(brrrrRefiLoan)} leaves {brrrrCashLeft <= 0 ? '$0 of your original money in the property' : `${formatCurrency(brrrrCashLeft)} in the deal`}.
                    </div>
                    <div>
                      <strong style={{ color: '#FAF8F5' }}>Why "most of your cash comes back out" matters:</strong> The BRRRR (Buy, Rehab, Rent, Refinance, Repeat) strategy relies on velocity of capital. When refinance proceeds return all or most of your initial purchase, rehab, and closing funds, you can recycle the exact same dollars into your next property without waiting years to save new down payments. If all cash is recovered ($0 left), your cash-on-cash return is effectively infinite (∞).
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        </>
        )}

        {/* ============================================================= */}
        {/* SAVE ANALYSIS BUTTON                                          */}
        {/* ============================================================= */}
        <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <button
            type="button"
            id="underwrite-save-btn"
            onClick={handleSaveAnalysis}
            disabled={isSaving || isSaveDisabled}
            title={
              isSaveDisabled
                ? (strategy === 'live_in'
                    ? 'Enter purchase price to save'
                    : strategy === 'flip'
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

          {/* Deal Report Button & Picker */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {savedAnalyses.length > 1 && (
              <select
                id="underwrite-deal-report-picker"
                aria-label="Select saved analysis for deal report"
                value={selectedReportAnalysisId || savedAnalyses[0]?.id || ''}
                onChange={(e) => setSelectedReportAnalysisId(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '50px',
                  border: '1px solid rgba(52, 41, 42, 0.2)',
                  backgroundColor: '#FAF8F5',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--espresso, #34292A)',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {savedAnalyses.map(item => {
                  const strat = formatStrategyDisplayLabel(item.strategy || 'flip');
                  const detailText =
                    String(item.strategy || '').toLowerCase() === 'live_in'
                      ? ` · ${formatLiveInChosenExitHeadline(item)}`
                      : item.inputs?.arv
                      ? ` · ARV ${formatCurrency(item.inputs.arv)}`
                      : '';
                  const dateText = item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                  return (
                    <option key={item.id} value={item.id}>
                      {strat}{detailText} ({dateText})
                    </option>
                  );
                })}
              </select>
            )}

            <button
              type="button"
              id="underwrite-deal-report-btn"
              onClick={(e) => {
                const targetAnalysisId = selectedReportAnalysisId || (savedAnalyses.length > 0 ? savedAnalyses[0].id : '');
                if (e.metaKey || e.ctrlKey) {
                  const targetUrl = `/admin/investor/report/${property.id}${targetAnalysisId ? `?analysis=${targetAnalysisId}` : ''}`;
                  window.open(targetUrl, '_blank', 'noopener,noreferrer');
                  return;
                }
                if (navigateTo) {
                  navigateTo('deal-report', null, property.id, targetAnalysisId);
                } else {
                  window.location.href = `/admin/investor/report/${property.id}${targetAnalysisId ? `?analysis=${targetAnalysisId}` : ''}`;
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'transparent',
                color: 'var(--secondary-color, #41101B)',
                border: '1.5px solid var(--secondary-color, #41101B)',
                borderRadius: '50px',
                padding: '9px 20px',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textDecoration: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--secondary-color, #41101B)';
                e.currentTarget.style.color = '#FAF8F5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--secondary-color, #41101B)';
              }}
            >
              Deal report →
            </button>
          </div>

          {saveSuccessMsg && (
            <span style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '12px',
              color: '#3F5A3A',
              fontWeight: 600
            }}>
              ✓ {saveSuccessMsg}
            </span>
          )}

          {saveErrorMsg && (
            <span style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '12px',
              color: '#41101B',
              backgroundColor: 'rgba(65, 16, 27, 0.07)',
              border: '1px solid rgba(65, 16, 27, 0.25)',
              padding: '5px 10px',
              borderRadius: '8px',
              fontWeight: 500
            }}>
              {saveErrorMsg}
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
              const strat = formatStrategyDisplayLabel(item.strategy || '');
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
