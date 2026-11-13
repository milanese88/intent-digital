import React, { useEffect } from 'react';
import { SegmentedControl } from '../ui';
import FormattedNumberInput from './FormattedNumberInput.jsx';
import {
  CREDIT_SCORE_BANDS,
  LIVE_IN_PLAN_DISCLAIMER,
  getMergedFinancingConfig
} from '../../config/financing.js';
import { loadThemeFont } from '../../utils/themeFonts.js';
import { formatCurrency } from './underwriting.js';
import LiveInFitBadge from './LiveInFitBadge.jsx';

// Heading token strictly resolves to Instrument Serif (portal default) with zero other custom serifs
const HEADING_FONT = 'var(--font-heading, "Instrument Serif", Georgia, serif)';
const BODY_FONT = 'var(--font-sans, "Montserrat", sans-serif)';

const UNIT_OPTIONS = [
  { id: 1, label: '1 unit' },
  { id: 2, label: '2 units' },
  { id: 3, label: '3 units' },
  { id: 4, label: '4 units' }
];

const REHAB_FINANCING_OPTIONS = [
  { id: 'cash', label: 'Cash' },
  { id: 'limited_203k', label: 'Limited 203(k)' },
  { id: 'standard_203k', label: 'Standard 203(k)' }
];

const LIVE_IN_PERIOD_OPTIONS = [
  { id: 1, label: '1 year' },
  { id: 2, label: '2 years' }
];

const LESSON_LINKS = [
  { key: 'fha_plain_words', title: 'FHA in plain words' },
  { key: 'live_in_flip_vs_house_hack', title: 'Live-in flip vs. house hack' },
  { key: 'section_121_year_two', title: 'Why year 2 matters (Section 121)' },
  { key: 'homestead_when_you_rent', title: 'Homestead and what changes when you rent' }
];

const SELECT_CHEVRON_BG =
  "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2334292A' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

const labelStyle = {
  display: 'block',
  fontFamily: BODY_FONT,
  fontSize: '10.5px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'rgba(52, 41, 42, 0.68)',
  marginBottom: '6px',
  lineHeight: 1.25
};

const baseControlStyle = {
  width: '100%',
  height: '42px',
  minHeight: '42px',
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: '8px',
  border: '1px solid rgba(52, 41, 42, 0.18)',
  backgroundColor: '#FFFFFF',
  fontFamily: BODY_FONT,
  fontSize: '13.5px',
  fontWeight: 500,
  color: 'var(--espresso, #34292A)',
  outline: 'none',
  lineHeight: '20px',
  transition: 'border-color 0.18s ease, box-shadow 0.18s ease'
};

const selectControlStyle = {
  ...baseControlStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  backgroundImage: SELECT_CHEVRON_BG,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: '34px',
  cursor: 'pointer'
};

const cardStyle = {
  background: '#FFFFFF',
  border: '1px solid rgba(52, 41, 42, 0.12)',
  borderRadius: '14px',
  padding: '20px 22px',
  fontFamily: BODY_FONT
};

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '12px',
  padding: '6px 0',
  borderBottom: '1px solid rgba(52, 41, 42, 0.06)',
  fontSize: '12.5px',
  color: '#34292A'
};

/**
 * Shared field wrapper ensuring pixel-identical 42px height, label alignment,
 * and control chrome across FormattedNumberInput and <select>.
 */
function LiveInField({
  id,
  label,
  headerAction = null,
  type = 'number', // 'number' | 'select'
  value,
  onChange,
  options = [],
  prefix = '',
  suffix = '',
  allowDecimal = false,
  formatOnBlur = true,
  placeholder = '',
  disabled = false,
  caption = null,
  warning = null
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '8px',
          minHeight: '19px'
        }}
      >
        <label htmlFor={id} className="investor-form-label" style={labelStyle}>
          {label}
        </label>
        {headerAction}
      </div>

      {type === 'select' ? (
        <select
          id={id}
          className="investor-form-select"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...selectControlStyle,
            backgroundColor: disabled ? '#FAF8F5' : '#FFFFFF',
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
        >
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <FormattedNumberInput
          id={id}
          className="investor-form-input"
          value={value}
          onChange={onChange}
          allowDecimal={allowDecimal}
          formatOnBlur={formatOnBlur}
          prefix={prefix}
          suffix={suffix}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            ...baseControlStyle,
            backgroundColor: disabled ? '#FAF8F5' : '#FFFFFF',
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? 'not-allowed' : 'text'
          }}
        />
      )}

      {caption && (
        <div
          style={{
            marginTop: '5px',
            fontSize: '11px',
            lineHeight: 1.35,
            color: 'rgba(52, 41, 42, 0.68)',
            fontFamily: BODY_FONT
          }}
        >
          {caption}
        </div>
      )}

      {warning && (
        <div
          role="alert"
          style={{
            marginTop: '6px',
            padding: '7px 10px',
            borderRadius: '8px',
            background: 'rgba(65, 16, 27, 0.06)',
            border: '1px solid rgba(65, 16, 27, 0.28)',
            color: '#41101B',
            fontSize: '11px',
            fontWeight: 500,
            lineHeight: 1.4,
            fontFamily: BODY_FONT
          }}
        >
          {warning}
        </div>
      )}
    </div>
  );
}

export default function LiveInPlanView({
  property,
  profile,
  inputs,
  onChangeInput,
  onBatchChange,
  results,
  appraisalAsIs,
  appraisalArv,
  onOpenBuyingProfile,
  onNavigateToLesson,
  onSaveAnalysis,
  savingAnalysis = false
}) {
  useEffect(() => {
    loadThemeFont('Instrument Serif');
  }, []);

  const mergedConfig = getMergedFinancingConfig(profile);

  const liveFitSnapshot = {
    ...(property || {}),
    asking_price: Number(inputs.purchasePrice) || property?.list_price || 0,
    units: Number(inputs.units) || property?.units || 1,
    hoa_monthly: Number(inputs.hoaMonthly) || property?.hoa_monthly || 0,
    has_hoa: Number(inputs.hoaMonthly) > 0 ? true : property?.has_hoa
  };

  const taxComp = results?.taxComparison;

  // Value after renovation source & >15% zero-rehab warning
  const hasRehab = Number(inputs.rehabBudget) > 0;
  const targetAppraisalValue = hasRehab
    ? Number(appraisalArv) > 0
      ? Math.round(Number(appraisalArv))
      : null
    : Number(appraisalAsIs) > 0
    ? Math.round(Number(appraisalAsIs))
    : null;
  const targetAppraisalLabel = hasRehab ? 'from Appraisal · ARV' : 'from Appraisal · as-is';

  const resolvedValueSource = (() => {
    if (!inputs.valueAfterRenoTouched) {
      if (inputs.valueAfterRenoSource) return inputs.valueAfterRenoSource;
      if (targetAppraisalValue != null) return targetAppraisalLabel;
      return hasRehab ? 'purchase price + renovation' : 'purchase price (no appraisal yet)';
    }
    if (
      targetAppraisalValue != null &&
      Math.round(Number(inputs.valueAfterReno) || 0) === targetAppraisalValue
    ) {
      return targetAppraisalLabel;
    }
    return inputs.valueAfterRenoSource || 'custom override';
  })();

  const purchaseNum = Number(inputs.purchasePrice) || 0;
  const valueAfterRenoNum = Number(inputs.valueAfterReno) || 0;
  const over15PctZeroRehab =
    !hasRehab && purchaseNum > 0 && valueAfterRenoNum > purchaseNum * 1.15;
  const pctAbovePurchase =
    purchaseNum > 0 ? ((valueAfterRenoNum - purchaseNum) / purchaseNum) * 100 : 0;

  const canResetToAppraisal =
    targetAppraisalValue != null &&
    (inputs.valueAfterRenoTouched ||
      Math.round(Number(inputs.valueAfterReno) || 0) !== targetAppraisalValue);

  const handleResetToAppraisal = () => {
    if (targetAppraisalValue == null) return;
    onBatchChange({
      valueAfterReno: targetAppraisalValue,
      valueAfterRenoSource: targetAppraisalLabel,
      valueAfterRenoTouched: false
    });
  };

  const handleOpenLesson = (termKey) => {
    if (typeof onNavigateToLesson === 'function') {
      onNavigateToLesson(termKey);
      return;
    }
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'learning');
      url.searchParams.set('lesson', termKey);
      window.location.href = url.toString();
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: '18px',
        fontFamily: BODY_FONT,
        color: '#34292A'
      }}
    >
      {/* Top Strategy Header + Mandatory Planning Disclaimer */}
      <div
        style={{
          background: '#FAF8F5',
          border: '1px solid rgba(52, 41, 42, 0.14)',
          borderRadius: '14px',
          padding: '18px 20px'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '6px'
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.11em',
                  textTransform: 'uppercase',
                  padding: '3px 9px',
                  borderRadius: '999px',
                  background: '#34292A',
                  color: '#FAF8F5'
                }}
              >
                LIVE-IN PLAN (FHA)
              </span>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 600,
                  color: 'rgba(52, 41, 42, 0.65)',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'rgba(189, 211, 226, 0.35)',
                  border: '1px solid rgba(133, 157, 206, 0.45)'
                }}
              >
                Rates & limits as of {mergedConfig.asOfDisplay}
              </span>
            </div>

            {/* Heading Token (Instrument Serif) with italic second line — no other serif */}
            <h3
              style={{
                margin: '4px 0 8px',
                fontFamily: HEADING_FONT,
                fontSize: 'var(--text-h3, 28px)',
                fontWeight: 400,
                lineHeight: 1.15,
                letterSpacing: '-0.01em',
                color: 'var(--espresso, #34292A)'
              }}
            >
              <span style={{ display: 'block', fontFamily: HEADING_FONT, fontWeight: 400 }}>
                Buy with FHA, live 1–2 years,
              </span>
              <span
                style={{
                  display: 'block',
                  fontFamily: HEADING_FONT,
                  fontStyle: 'italic',
                  fontWeight: 400
                }}
              >
                renovate, then rent or sell.
              </span>
            </h3>

            <p
              style={{
                margin: 0,
                fontSize: '12px',
                color: 'rgba(52, 41, 42, 0.72)'
              }}
            >
              FHA occupancy rule: move in within {mergedConfig.fha.occupancyMoveInDays} days of closing and intend to live in the home for ≥ {mergedConfig.fha.occupancyMinYears} year.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {typeof onOpenBuyingProfile === 'function' && (
              <button
                type="button"
                onClick={onOpenBuyingProfile}
                style={{
                  padding: '8px 13px',
                  borderRadius: '999px',
                  border: '1px solid rgba(52, 41, 42, 0.24)',
                  background: '#FFFFFF',
                  color: '#34292A',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  fontFamily: BODY_FONT
                }}
              >
                Edit FHA Defaults in Profile
              </button>
            )}
            {typeof onSaveAnalysis === 'function' && results?.isComplete && (
              <button
                type="button"
                onClick={onSaveAnalysis}
                disabled={savingAnalysis}
                style={{
                  padding: '8px 15px',
                  borderRadius: '999px',
                  border: 'none',
                  background: '#41101B',
                  color: '#FAF8F5',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: savingAnalysis ? 'wait' : 'pointer',
                  fontFamily: BODY_FONT,
                  opacity: savingAnalysis ? 0.7 : 1
                }}
              >
                {savingAnalysis ? 'Saving…' : 'Save Live-in Plan'}
              </button>
            )}
          </div>
        </div>

        {/* Mandatory Strategy Disclaimer Banner */}
        <div
          style={{
            marginTop: '12px',
            padding: '8px 12px',
            borderRadius: '8px',
            background: 'rgba(189, 211, 226, 0.25)',
            border: '1px solid rgba(133, 157, 206, 0.42)',
            fontSize: '11.5px',
            fontWeight: 500,
            color: '#34292A'
          }}
        >
          {LIVE_IN_PLAN_DISCLAIMER}
        </div>
      </div>

      {/* Live-in Fit Screening Card */}
      <LiveInFitBadge property={liveFitSnapshot} profile={profile} showReasons />

      {/* =================================================================== */}
      {/* INPUTS PANEL                                                        */}
      {/* =================================================================== */}
      <div style={cardStyle}>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.11em',
            textTransform: 'uppercase',
            color: 'rgba(52, 41, 42, 0.58)',
            marginBottom: '14px'
          }}
        >
          LIVE-IN PLAN INPUTS
        </div>

        {/* Dedicated Full-Width Row for Units (1–4) so all 4 options stay visible with zero overlap */}
        <div style={{ marginBottom: '16px' }}>
          <label className="investor-form-label" style={labelStyle}>
            Units (1–4)
          </label>
          <SegmentedControl
            size="sm"
            options={UNIT_OPTIONS}
            value={Number(inputs.units) || 1}
            onChange={(val) => onChangeInput('units', Number(val))}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              width: '100%',
              maxWidth: '420px',
              minHeight: '42px'
            }}
          />
        </div>

        {/* Row Group 1: Purchase & FHA Financing */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px',
            marginBottom: '18px'
          }}
        >
          <LiveInField
            id="livein-purchase-price"
            label="Purchase price ($)"
            prefix="$"
            value={inputs.purchasePrice ?? ''}
            onChange={(val) => onChangeInput('purchasePrice', val)}
            placeholder="e.g. 525,000"
          />

          <LiveInField
            id="livein-fha-rate"
            label="FHA interest rate (%)"
            suffix="%"
            allowDecimal
            formatOnBlur={false}
            value={inputs.interestRatePct ?? ''}
            onChange={(val) => onChangeInput('interestRatePct', val)}
            placeholder="6.125"
          />

          <LiveInField
            id="livein-credit-band"
            label="Credit score band"
            type="select"
            options={CREDIT_SCORE_BANDS}
            value={inputs.creditScoreBand || '740-759'}
            onChange={(band) => {
              const meta = CREDIT_SCORE_BANDS.find((b) => b.id === band);
              const minDown =
                meta && meta.minScore < 580
                  ? mergedConfig.fha.lowCreditDownPct
                  : mergedConfig.fha.minDownPct;
              onBatchChange({
                creditScoreBand: band,
                downPaymentPct: Math.max(Number(inputs.downPaymentPct) || 0, minDown)
              });
            }}
          />

          <LiveInField
            id="livein-down-pct"
            label="Down payment (%)"
            suffix="%"
            allowDecimal
            formatOnBlur={false}
            value={inputs.downPaymentPct ?? ''}
            onChange={(val) => onChangeInput('downPaymentPct', val)}
            placeholder="3.5"
          />

          <LiveInField
            id="livein-closing-pct"
            label="Closing costs (%)"
            suffix="%"
            allowDecimal
            formatOnBlur={false}
            value={inputs.closingCostsPct ?? ''}
            onChange={(val) => onChangeInput('closingCostsPct', val)}
            placeholder="3.5"
          />

          <LiveInField
            id="livein-seller-credits"
            label="Seller credits ($)"
            prefix="$"
            value={inputs.sellerCredits ?? ''}
            onChange={(val) => onChangeInput('sellerCredits', val)}
            placeholder="$0"
          />
        </div>

        {/* Row Group 2: Renovation & Value After Renovation */}
        <div
          style={{
            paddingTop: '16px',
            borderTop: '1px solid rgba(52, 41, 42, 0.08)',
            marginBottom: '18px'
          }}
        >
          <div style={{ marginBottom: '14px' }}>
            <label className="investor-form-label" style={labelStyle}>
              Renovation paid by
            </label>
            <SegmentedControl
              size="sm"
              options={REHAB_FINANCING_OPTIONS}
              value={inputs.rehabPaidBy || 'cash'}
              onChange={(val) => onChangeInput('rehabPaidBy', val)}
              style={{
                display: 'inline-flex',
                flexWrap: 'wrap',
                maxWidth: '100%',
                minHeight: '42px'
              }}
            />
            {inputs.rehabPaidBy === 'limited_203k' && (
              <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)', marginTop: '5px' }}>
                Limited 203(k) cap: {formatCurrency(mergedConfig.fha.limited203kMaxRehab)}
              </div>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px'
            }}
          >
            <LiveInField
              id="livein-rehab-budget"
              label="Renovation budget ($)"
              prefix="$"
              value={inputs.rehabBudget ?? ''}
              onChange={(val) => onChangeInput('rehabBudget', val)}
              placeholder="$0"
              caption={
                hasRehab
                  ? 'Renovation > $0 switches default value to Appraisal · ARV'
                  : '$0 renovation defaults value to Appraisal · as-is'
              }
            />

            <LiveInField
              id="livein-value-after-reno"
              label="Value after renovation ($)"
              prefix="$"
              value={inputs.valueAfterReno ?? ''}
              onChange={(val) => onChangeInput('valueAfterReno', val)}
              placeholder={
                targetAppraisalValue != null
                  ? formatCurrency(targetAppraisalValue)
                  : hasRehab
                  ? 'Post-reno ARV'
                  : 'As-is value'
              }
              headerAction={
                canResetToAppraisal ? (
                  <button
                    type="button"
                    onClick={handleResetToAppraisal}
                    style={{
                      border: 'none',
                      background: 'none',
                      padding: 0,
                      marginBottom: '6px',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: '#5C75A8',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontFamily: BODY_FONT
                    }}
                  >
                    Use {hasRehab ? 'Appraisal · ARV' : 'Appraisal · as-is'} (
                    {formatCurrency(targetAppraisalValue)})
                  </button>
                ) : null
              }
              caption={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span>Source:</span>
                  <strong style={{ color: '#34292A', fontWeight: 600 }}>
                    {resolvedValueSource}
                  </strong>
                </span>
              }
              warning={
                over15PctZeroRehab
                  ? `Value is +${pctAbovePurchase.toFixed(1)}% above purchase price with $0 renovation — verify comps in Appraisal or enter your renovation budget.`
                  : null
              }
            />
          </div>
        </div>

        {/* Row Group 3: Live-In Period & Growth Assumptions */}
        <div
          style={{
            paddingTop: '16px',
            borderTop: '1px solid rgba(52, 41, 42, 0.08)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px',
            marginBottom: '18px'
          }}
        >
          <LiveInField
            id="livein-current-rent"
            label="My current rent ($/mo)"
            prefix="$"
            value={inputs.currentRentMo ?? ''}
            onChange={(val) => onChangeInput('currentRentMo', val)}
            placeholder="$2,400"
          />

          <LiveInField
            id="livein-other-units-rent"
            label="Rent from other unit(s) ($/mo)"
            prefix="$"
            disabled={(Number(inputs.units) || 1) < 2}
            value={(Number(inputs.units) || 1) >= 2 ? (inputs.otherUnitsRentMo ?? '') : ''}
            onChange={(val) => onChangeInput('otherUnitsRentMo', val)}
            placeholder={(Number(inputs.units) || 1) >= 2 ? 'Units 2–4 rent' : 'Select 2–4 units'}
          />

          <div style={{ minWidth: 0 }}>
            <div style={{ minHeight: '19px' }}>
              <label className="investor-form-label" style={labelStyle}>
                Live-in period
              </label>
            </div>
            <SegmentedControl
              size="sm"
              options={LIVE_IN_PERIOD_OPTIONS}
              value={Number(inputs.liveInYears) === 1 ? 1 : 2}
              onChange={(val) => onChangeInput('liveInYears', Number(val))}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                width: '100%',
                minHeight: '42px',
                height: '42px'
              }}
            />
          </div>

          <LiveInField
            id="livein-appreciation"
            label="Appreciation (%/yr)"
            suffix="%"
            allowDecimal
            formatOnBlur={false}
            value={inputs.appreciationPctYr ?? ''}
            onChange={(val) => onChangeInput('appreciationPctYr', val)}
            placeholder="3.5"
          />

          <LiveInField
            id="livein-rent-growth"
            label="Rent growth (%/yr)"
            suffix="%"
            allowDecimal
            formatOnBlur={false}
            value={inputs.rentGrowthPctYr ?? ''}
            onChange={(val) => onChangeInput('rentGrowthPctYr', val)}
            placeholder="3.0"
          />

          <LiveInField
            id="livein-hoa"
            label="HOA / Condo dues ($/mo)"
            prefix="$"
            value={inputs.hoaMonthly ?? ''}
            onChange={(val) => onChangeInput('hoaMonthly', val)}
            placeholder="$0"
          />
        </div>

        {/* Row Group 4: Rental Phase Inputs + Market Rent After Move-Out + Non-Homestead Tax */}
        <div
          style={{
            paddingTop: '16px',
            borderTop: '1px solid rgba(52, 41, 42, 0.08)'
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(52, 41, 42, 0.6)',
              marginBottom: '12px'
            }}
          >
            RENTAL PHASE (ONCE YOU MOVE OUT)
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '14px',
              marginBottom: '14px'
            }}
          >
            <LiveInField
              id="livein-market-rent"
              label="Market rent after move-out ($/mo)"
              prefix="$"
              value={inputs.marketRentMo ?? ''}
              onChange={(val) => onChangeInput('marketRentMo', val)}
              placeholder="Add market rent"
              caption={
                inputs.marketRentSource === 'from county/rent data'
                  ? 'from county/rent data'
                  : !(Number(inputs.marketRentMo) > 0)
                  ? 'Required for exit cash flow & rent wealth projection'
                  : 'All units combined after move-out'
              }
            />

            <LiveInField
              id="livein-vacancy"
              label="Vacancy (%)"
              suffix="%"
              allowDecimal
              formatOnBlur={false}
              value={inputs.vacancyPct ?? ''}
              onChange={(val) => onChangeInput('vacancyPct', val)}
            />

            <LiveInField
              id="livein-repairs"
              label="Repairs (%)"
              suffix="%"
              allowDecimal
              formatOnBlur={false}
              value={inputs.repairsPct ?? ''}
              onChange={(val) => onChangeInput('repairsPct', val)}
            />

            <LiveInField
              id="livein-capex"
              label="CapEx (%)"
              suffix="%"
              allowDecimal
              formatOnBlur={false}
              value={inputs.capexPct ?? ''}
              onChange={(val) => onChangeInput('capexPct', val)}
            />

            <LiveInField
              id="livein-management"
              label="Management (%)"
              suffix="%"
              allowDecimal
              formatOnBlur={false}
              value={inputs.managementPct ?? ''}
              onChange={(val) => onChangeInput('managementPct', val)}
            />

            <LiveInField
              id="livein-landlord-ins"
              label="Landlord insurance ($/yr)"
              prefix="$"
              value={inputs.landlordInsuranceYr ?? ''}
              onChange={(val) => onChangeInput('landlordInsuranceYr', val)}
            />

            <LiveInField
              id="livein-millage"
              label="Millage rate (mills)"
              allowDecimal
              formatOnBlur={false}
              value={inputs.millageRate ?? ''}
              onChange={(val) => onChangeInput('millageRate', val)}
            />

            <LiveInField
              id="livein-non-homestead-tax"
              label="Tax w/o Homestead ($/yr)"
              prefix="$"
              value={
                inputs.propertyTaxNonHomesteadOverride
                  ? inputs.propertyTaxNonHomesteadYr ?? ''
                  : taxComp?.nonHomesteadTaxYr ?? ''
              }
              onChange={(val) =>
                onBatchChange({
                  propertyTaxNonHomesteadOverride: true,
                  propertyTaxNonHomesteadYr: val
                })
              }
              headerAction={
                inputs.propertyTaxNonHomesteadOverride && taxComp ? (
                  <button
                    type="button"
                    onClick={() =>
                      onBatchChange({
                        propertyTaxNonHomesteadOverride: false,
                        propertyTaxNonHomesteadYr: taxComp.nonHomesteadTaxYr
                      })
                    }
                    style={{
                      border: 'none',
                      background: 'none',
                      padding: 0,
                      marginBottom: '6px',
                      fontSize: '9.5px',
                      fontWeight: 600,
                      color: '#5C75A8',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontFamily: BODY_FONT
                    }}
                  >
                    Reset to millage
                  </button>
                ) : null
              }
            />
          </div>

          {/* Homestead vs. Non-Homestead Property Tax Difference Callout */}
          {taxComp && (
            <div
              style={{
                background: '#FAF8F5',
                border: '1px solid rgba(52, 41, 42, 0.12)',
                borderRadius: '10px',
                padding: '12px 15px',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div style={{ fontSize: '12px', lineHeight: 1.5 }}>
                <strong style={{ color: '#34292A' }}>
                  Homestead vs. Non-Homestead Tax ({taxComp.millageRate} mills):
                </strong>{' '}
                With Homestead while living there:{' '}
                <strong>{formatCurrency(taxComp.homesteadTaxYr)}/yr</strong> ({formatCurrency(taxComp.homesteadTaxMo)}/mo)
                {' · '}
                Reassessed at market value without Homestead when rented:{' '}
                <strong>{formatCurrency(taxComp.nonHomesteadTaxYr)}/yr</strong> ({formatCurrency(taxComp.nonHomesteadTaxMo)}/mo)
              </div>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: 'rgba(65, 16, 27, 0.08)',
                  border: '1px solid rgba(65, 16, 27, 0.25)',
                  color: '#41101B',
                  fontSize: '11px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap'
                }}
              >
                +{formatCurrency(Math.max(0, taxComp.annualDiff))}/yr (+{formatCurrency(Math.max(0, taxComp.monthlyDiff))}/mo) when rented
              </span>
            </div>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* PART 1 PHASES: 01 BUY · 02 LIVE                                     */}
      {/* =================================================================== */}
      {!results?.isComplete ? (
        <div
          style={{
            ...cardStyle,
            textAlign: 'center',
            color: 'rgba(52, 41, 42, 0.65)',
            padding: '32px 20px'
          }}
        >
          {results?.hint || 'Enter a purchase price above to calculate your Live-in phases.'}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(295px, 1fr))',
            gap: '16px'
          }}
        >
          {/* PHASE 01: BUY */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#41101B'
                }}
              >
                01 · BUY
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: results.buy.overFhaLimit
                    ? 'rgba(65, 16, 27, 0.09)'
                    : 'rgba(63, 90, 58, 0.11)',
                  color: results.buy.overFhaLimit ? '#41101B' : '#3F5A3A',
                  border: results.buy.overFhaLimit
                    ? '1px solid rgba(65, 16, 27, 0.28)'
                    : '1px solid rgba(63, 90, 58, 0.28)'
                }}
              >
                {results.buy.overFhaLimit
                  ? `Exceeds FHA limit by ${formatCurrency(results.buy.overFhaLimitBy)}`
                  : `Within ${results.buy.fhaLimitInfo.countyKey} ${results.buy.fhaLimitInfo.units}-unit limit`}
                {results.buy.fhaLimitInfo.verify ? ' · VERIFY' : ''}
              </span>
            </div>

            <div
              style={{
                fontFamily: HEADING_FONT,
                fontSize: '32px',
                fontWeight: 400,
                lineHeight: 1.1,
                color: '#34292A',
                marginBottom: '4px'
              }}
            >
              {formatCurrency(results.buy.totalOutOfPocketCash)}
            </div>
            <div style={{ fontSize: '11.5px', color: 'rgba(52, 41, 42, 0.65)', marginBottom: '12px' }}>
              Total cash needed ({formatCurrency(results.buy.cashToCloseAtTable)} at closing
              {results.buy.cashRehabOutOfPocket > 0
                ? ` + ${formatCurrency(results.buy.cashRehabOutOfPocket)} cash reno`
                : ''}
              )
            </div>

            <div style={rowStyle}>
              <span>Down payment ({results.buy.downPaymentPct}%)</span>
              <strong>{formatCurrency(results.buy.downPayment)}</strong>
            </div>
            <div style={rowStyle}>
              <span>Base FHA loan</span>
              <strong>{formatCurrency(results.buy.baseLoan)}</strong>
            </div>
            <div style={rowStyle}>
              <span>Financed UFMIP ({results.buy.ufmipPct}%)</span>
              <strong>+{formatCurrency(results.buy.ufmipAmount)}</strong>
            </div>
            <div style={rowStyle}>
              <span>Total FHA loan amount</span>
              <strong>{formatCurrency(results.buy.totalLoanAmount)}</strong>
            </div>
            <div style={rowStyle}>
              <span>Closing costs ({results.buy.closingCostsPct}%)</span>
              <strong>{formatCurrency(results.buy.closingCosts)}</strong>
            </div>
            {results.buy.effectiveSellerCredits > 0 && (
              <div style={rowStyle}>
                <span>Seller credits applied</span>
                <strong style={{ color: '#3F5A3A' }}>
                  −{formatCurrency(results.buy.effectiveSellerCredits)}
                </strong>
              </div>
            )}

            {results.buy.mySavings != null && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '9px 11px',
                  borderRadius: '8px',
                  background:
                    results.buy.savingsDelta >= 0
                      ? 'rgba(63, 90, 58, 0.08)'
                      : 'rgba(65, 16, 27, 0.07)',
                  border:
                    results.buy.savingsDelta >= 0
                      ? '1px solid rgba(63, 90, 58, 0.22)'
                      : '1px solid rgba(65, 16, 27, 0.25)',
                  fontSize: '11.5px',
                  color: results.buy.savingsDelta >= 0 ? '#3F5A3A' : '#41101B',
                  fontWeight: 600
                }}
              >
                {results.buy.savingsDelta >= 0
                  ? `Leaves ${formatCurrency(results.buy.savingsDelta)} of your ${formatCurrency(results.buy.mySavings)} profile savings`
                  : `Exceeds your ${formatCurrency(results.buy.mySavings)} profile savings by ${formatCurrency(Math.abs(results.buy.savingsDelta))}`}
              </div>
            )}

            {results.buy.limited203kExceeded && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid rgba(65, 16, 27, 0.30)',
                  background: 'rgba(65, 16, 27, 0.06)',
                  color: '#41101B',
                  fontSize: '11px'
                }}
              >
                Renovation exceeds Limited 203(k) max ({formatCurrency(mergedConfig.fha.limited203kMaxRehab)}) — switch to Standard 203(k) or reduce scope.
              </div>
            )}
          </div>

          {/* PHASE 02: LIVE */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#41101B'
                }}
              >
                02 · LIVE ({results.live.liveInYears} {results.live.liveInYears === 1 ? 'YR' : 'YRS'})
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background:
                    results.live.vsCurrentRentMo <= 0
                      ? 'rgba(63, 90, 58, 0.11)'
                      : 'rgba(189, 211, 226, 0.38)',
                  color: results.live.vsCurrentRentMo <= 0 ? '#3F5A3A' : '#34292A'
                }}
              >
                {results.live.rentComparisonLabel}
              </span>
            </div>

            <div
              style={{
                fontFamily: HEADING_FONT,
                fontSize: '32px',
                fontWeight: 400,
                lineHeight: 1.1,
                color: '#34292A',
                marginBottom: '4px'
              }}
            >
              {formatCurrency(results.live.netLiveInMonthlyCost)}/mo
            </div>
            <div style={{ fontSize: '11.5px', color: 'rgba(52, 41, 42, 0.65)', marginBottom: '12px' }}>
              Net live-in monthly housing cost vs. {formatCurrency(results.live.currentRentMo)}/mo current rent
            </div>

            <div style={rowStyle}>
              <span>Principal & interest</span>
              <strong>{formatCurrency(results.live.monthlyPi)}/mo</strong>
            </div>
            <div style={rowStyle}>
              <span>
                Annual MIP ({results.buy.annualMipPct}% ·{' '}
                {results.buy.mipForLife ? 'for life' : `${results.buy.mipDurationYears} yrs`})
              </span>
              <strong>{formatCurrency(results.live.monthlyMip)}/mo</strong>
            </div>
            <div style={rowStyle}>
              <span>Taxes (with Homestead) + Ins. + HOA</span>
              <strong>
                {formatCurrency(
                  results.live.homesteadTaxMo +
                    results.live.liveInInsuranceMo +
                    results.live.hoaMonthly
                )}
                /mo
              </strong>
            </div>
            {results.live.units >= 2 && (
              <div style={rowStyle}>
                <span>75% of other-unit rent ({formatCurrency(results.live.otherUnitsRentMo)}/mo)</span>
                <strong style={{ color: '#3F5A3A' }}>
                  −{formatCurrency(results.live.creditedOtherUnitsRentMo)}/mo
                </strong>
              </div>
            )}

            <div
              style={{
                marginTop: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: '#FAF8F5',
                border: '1px solid rgba(52, 41, 42, 0.10)',
                fontSize: '11.5px'
              }}
            >
              <div style={{ fontWeight: 700, color: '#34292A', marginBottom: '4px' }}>
                Equity built while living there: +{formatCurrency(results.live.equityBuiltWhileLiving)}
              </div>
              <div style={{ color: 'rgba(52, 41, 42, 0.72)' }}>
                {formatCurrency(results.live.principalPaidDown)} principal paid down +{' '}
                {formatCurrency(results.live.appreciationWhileLiving)} appreciation
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Learning Lab Lesson Pills */}
      <div
        style={{
          ...cardStyle,
          background: '#FAF8F5',
          padding: '15px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#34292A' }}>
          Learning Lab · Live-in Plan Guides
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {LESSON_LINKS.map((lesson) => (
            <button
              key={lesson.key}
              type="button"
              onClick={() => handleOpenLesson(lesson.key)}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                border: '1px solid rgba(52, 41, 42, 0.18)',
                background: '#FFFFFF',
                color: '#34292A',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: BODY_FONT
              }}
            >
              {lesson.title} →
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Strategy Disclaimer */}
      <div
        style={{
          textAlign: 'center',
          fontSize: '11.5px',
          color: 'rgba(52, 41, 42, 0.65)',
          padding: '4px 0'
        }}
      >
        {LIVE_IN_PLAN_DISCLAIMER}
      </div>
    </div>
  );
}
