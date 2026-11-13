import React from 'react';
import { SegmentedControl } from '../ui';
import {
  CREDIT_SCORE_BANDS,
  LIVE_IN_PLAN_DISCLAIMER,
  LIVE_IN_TAX_DISCLAIMER,
  getMergedFinancingConfig
} from '../../config/financing.js';
import { formatCurrency } from './underwriting.js';
import LiveInFitBadge from './LiveInFitBadge.jsx';
import LiveInWealthChart from './LiveInWealthChart.jsx';

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

const FILING_STATUS_OPTIONS = [
  { id: 'single', label: 'Single ($250k)' },
  { id: 'married', label: 'Married ($500k)' }
];

const LESSON_LINKS = [
  { key: 'fha_plain_words', title: 'FHA in plain words' },
  { key: 'live_in_flip_vs_house_hack', title: 'Live-in flip vs. house hack' },
  { key: 'section_121_year_two', title: 'Why year 2 matters (Section 121)' },
  { key: 'homestead_when_you_rent', title: 'Homestead and what changes when you rent' }
];

function fmtPct(decOrNum, digits = 1, isAlreadyPercent = false) {
  if (decOrNum == null || !Number.isFinite(Number(decOrNum))) return '—';
  const val = isAlreadyPercent ? Number(decOrNum) : Number(decOrNum) * 100;
  return `${val.toFixed(digits)}%`;
}

const labelStyle = {
  display: 'block',
  fontFamily: "'Montserrat', sans-serif",
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: 'rgba(52, 41, 42, 0.68)',
  marginBottom: '6px'
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  borderRadius: '8px',
  border: '1px solid rgba(52, 41, 42, 0.16)',
  background: '#FFFFFF',
  fontFamily: "'Montserrat', sans-serif",
  fontSize: '13px',
  color: '#34292A',
  outline: 'none'
};

const cardStyle = {
  background: '#FFFFFF',
  border: '1px solid rgba(52, 41, 42, 0.12)',
  borderRadius: '14px',
  padding: '20px 22px',
  fontFamily: "'Montserrat', sans-serif"
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

export default function LiveInPlanView({
  property,
  profile,
  inputs,
  onChangeInput,
  onBatchChange,
  results,
  appraisalArv,
  onOpenBuyingProfile,
  onNavigateToLesson,
  onSaveAnalysis,
  savingAnalysis = false
}) {
  const mergedConfig = getMergedFinancingConfig(profile);

  const liveFitSnapshot = {
    ...(property || {}),
    asking_price: Number(inputs.purchasePrice) || property?.list_price || 0,
    units: Number(inputs.units) || property?.units || 1,
    hoa_monthly: Number(inputs.hoaMonthly) || property?.hoa_monthly || 0,
    has_hoa: Number(inputs.hoaMonthly) > 0 ? true : property?.has_hoa
  };

  const taxComp = results?.taxComparison;

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
        fontFamily: "'Montserrat', sans-serif",
        color: '#34292A'
      }}
    >
      {/* Top Strategy Header + Mandatory Planning Disclaimer */}
      <div
        style={{
          background: '#FAF8F5',
          border: '1px solid rgba(52, 41, 42, 0.14)',
          borderRadius: '14px',
          padding: '16px 20px'
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
                marginBottom: '4px'
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
            <h3
              style={{
                margin: '4px 0 4px',
                fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
                fontSize: '25px',
                fontWeight: 600,
                color: '#34292A'
              }}
            >
              Buy with FHA, live 1–2 years, renovate, then rent or sell
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
                  fontFamily: "'Montserrat', sans-serif"
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
                  fontFamily: "'Montserrat', sans-serif",
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

        {/* Row Group 1: Purchase & FHA Financing */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: '14px',
            marginBottom: '18px'
          }}
        >
          <div>
            <label style={labelStyle}>Purchase price ($)</label>
            <input
              type="number"
              min="0"
              step="1000"
              style={inputStyle}
              value={inputs.purchasePrice ?? ''}
              onChange={(e) => onChangeInput('purchasePrice', e.target.value)}
              placeholder="e.g. 525000"
            />
          </div>

          <div>
            <label style={labelStyle}>Units (1–4)</label>
            <SegmentedControl
              size="sm"
              options={UNIT_OPTIONS}
              value={Number(inputs.units) || 1}
              onChange={(val) => onChangeInput('units', Number(val))}
            />
          </div>

          <div>
            <label style={labelStyle}>FHA interest rate (%)</label>
            <input
              type="number"
              min="0"
              max="20"
              step="0.125"
              style={inputStyle}
              value={inputs.interestRatePct ?? ''}
              onChange={(e) => onChangeInput('interestRatePct', e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>Credit score band</label>
            <select
              style={inputStyle}
              value={inputs.creditScoreBand || '740-759'}
              onChange={(e) => {
                const band = e.target.value;
                const meta = CREDIT_SCORE_BANDS.find((b) => b.id === band);
                const minDown = meta && meta.minScore < 580
                  ? mergedConfig.fha.lowCreditDownPct
                  : mergedConfig.fha.minDownPct;
                onBatchChange({
                  creditScoreBand: band,
                  downPaymentPct: Math.max(Number(inputs.downPaymentPct) || 0, minDown)
                });
              }}
            >
              {CREDIT_SCORE_BANDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Down payment (%)</label>
            <input
              type="number"
              min="3.5"
              max="90"
              step="0.5"
              style={inputStyle}
              value={inputs.downPaymentPct ?? ''}
              onChange={(e) => onChangeInput('downPaymentPct', e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>Closing costs (%)</label>
            <input
              type="number"
              min="0"
              max="15"
              step="0.25"
              style={inputStyle}
              value={inputs.closingCostsPct ?? ''}
              onChange={(e) => onChangeInput('closingCostsPct', e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>Seller credits ($)</label>
            <input
              type="number"
              min="0"
              step="500"
              style={inputStyle}
              value={inputs.sellerCredits ?? ''}
              onChange={(e) => onChangeInput('sellerCredits', e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {/* Row Group 2: Renovation & Value After Renovation */}
        <div
          style={{
            paddingTop: '16px',
            borderTop: '1px solid rgba(52, 41, 42, 0.08)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))',
            gap: '14px',
            marginBottom: '18px'
          }}
        >
          <div>
            <label style={labelStyle}>Renovation budget ($)</label>
            <input
              type="number"
              min="0"
              step="1000"
              style={inputStyle}
              value={inputs.rehabBudget ?? ''}
              onChange={(e) => onChangeInput('rehabBudget', e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <label style={labelStyle}>Renovation paid by</label>
            <SegmentedControl
              size="sm"
              options={REHAB_FINANCING_OPTIONS}
              value={inputs.rehabPaidBy || 'cash'}
              onChange={(val) => onChangeInput('rehabPaidBy', val)}
            />
            {inputs.rehabPaidBy === 'limited_203k' && (
              <div style={{ fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.65)', marginTop: '4px' }}>
                Limited 203(k) cap: {formatCurrency(mergedConfig.fha.limited203kMaxRehab)}
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
              <label style={labelStyle}>Value after renovation ($)</label>
              {appraisalArv > 0 && Number(inputs.valueAfterReno) !== Math.round(appraisalArv) && (
                <button
                  type="button"
                  onClick={() => onChangeInput('valueAfterReno', Math.round(appraisalArv))}
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
                    fontFamily: "'Montserrat', sans-serif"
                  }}
                >
                  Use Appraisal ARV ({formatCurrency(appraisalArv)})
                </button>
              )}
            </div>
            <input
              type="number"
              min="0"
              step="1000"
              style={inputStyle}
              value={inputs.valueAfterReno ?? ''}
              onChange={(e) => onChangeInput('valueAfterReno', e.target.value)}
              placeholder={appraisalArv > 0 ? String(Math.round(appraisalArv)) : 'Post-reno ARV'}
            />
          </div>
        </div>

        {/* Row Group 3: Live-In Period & Growth Assumptions */}
        <div
          style={{
            paddingTop: '16px',
            borderTop: '1px solid rgba(52, 41, 42, 0.08)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: '14px',
            marginBottom: '18px'
          }}
        >
          <div>
            <label style={labelStyle}>My current rent ($/mo)</label>
            <input
              type="number"
              min="0"
              step="50"
              style={inputStyle}
              value={inputs.currentRentMo ?? ''}
              onChange={(e) => onChangeInput('currentRentMo', e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Rent from other unit(s) ($/mo)
            </label>
            <input
              type="number"
              min="0"
              step="50"
              disabled={(Number(inputs.units) || 1) < 2}
              style={{
                ...inputStyle,
                background: (Number(inputs.units) || 1) < 2 ? '#FAF8F5' : '#FFFFFF',
                opacity: (Number(inputs.units) || 1) < 2 ? 0.6 : 1
              }}
              value={(Number(inputs.units) || 1) >= 2 ? (inputs.otherUnitsRentMo ?? '') : 0}
              onChange={(e) => onChangeInput('otherUnitsRentMo', e.target.value)}
              placeholder={(Number(inputs.units) || 1) >= 2 ? 'Units 2–4 total rent' : 'Select 2–4 units'}
            />
          </div>

          <div>
            <label style={labelStyle}>Live-in period</label>
            <SegmentedControl
              size="sm"
              options={LIVE_IN_PERIOD_OPTIONS}
              value={Number(inputs.liveInYears) === 1 ? 1 : 2}
              onChange={(val) => onChangeInput('liveInYears', Number(val))}
            />
          </div>

          <div>
            <label style={labelStyle}>Appreciation (%/yr)</label>
            <input
              type="number"
              step="0.25"
              style={inputStyle}
              value={inputs.appreciationPctYr ?? ''}
              onChange={(e) => onChangeInput('appreciationPctYr', e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>Rent growth (%/yr)</label>
            <input
              type="number"
              step="0.25"
              style={inputStyle}
              value={inputs.rentGrowthPctYr ?? ''}
              onChange={(e) => onChangeInput('rentGrowthPctYr', e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>HOA / Condo dues ($/mo)</label>
            <input
              type="number"
              min="0"
              step="25"
              style={inputStyle}
              value={inputs.hoaMonthly ?? ''}
              onChange={(e) => onChangeInput('hoaMonthly', e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {/* Row Group 4: Rental Phase Inputs + Non-Homestead Reassessed Tax */}
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
              gap: '14px',
              marginBottom: '14px'
            }}
          >
            <div>
              <label style={labelStyle}>Full market rent ($/mo)</label>
              <input
                type="number"
                min="0"
                step="50"
                style={inputStyle}
                value={inputs.marketRentMo ?? ''}
                onChange={(e) => onChangeInput('marketRentMo', e.target.value)}
                placeholder="All units combined"
              />
            </div>

            <div>
              <label style={labelStyle}>Vacancy (%)</label>
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                style={inputStyle}
                value={inputs.vacancyPct ?? ''}
                onChange={(e) => onChangeInput('vacancyPct', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Repairs (%)</label>
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                style={inputStyle}
                value={inputs.repairsPct ?? ''}
                onChange={(e) => onChangeInput('repairsPct', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>CapEx (%)</label>
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                style={inputStyle}
                value={inputs.capexPct ?? ''}
                onChange={(e) => onChangeInput('capexPct', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Management (%)</label>
              <input
                type="number"
                min="0"
                max="30"
                step="0.5"
                style={inputStyle}
                value={inputs.managementPct ?? ''}
                onChange={(e) => onChangeInput('managementPct', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Landlord insurance ($/yr)</label>
              <input
                type="number"
                min="0"
                step="100"
                style={inputStyle}
                value={inputs.landlordInsuranceYr ?? ''}
                onChange={(e) => onChangeInput('landlordInsuranceYr', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Millage rate (mills)</label>
              <input
                type="number"
                min="1"
                max="40"
                step="0.1"
                style={inputStyle}
                value={inputs.millageRate ?? ''}
                onChange={(e) => onChangeInput('millageRate', e.target.value)}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={labelStyle}>Tax w/o Homestead ($/yr)</label>
                {inputs.propertyTaxNonHomesteadOverride && taxComp && (
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
                      textDecoration: 'underline'
                    }}
                  >
                    Reset to millage
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                step="100"
                style={inputStyle}
                value={
                  inputs.propertyTaxNonHomesteadOverride
                    ? inputs.propertyTaxNonHomesteadYr ?? ''
                    : taxComp?.nonHomesteadTaxYr ?? ''
                }
                onChange={(e) =>
                  onBatchChange({
                    propertyTaxNonHomesteadOverride: true,
                    propertyTaxNonHomesteadYr: e.target.value
                  })
                }
              />
            </div>
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
      {/* FOUR PHASES: 01 BUY · 02 LIVE · 03 IMPROVE · 04 EXIT               */}
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
          {results?.hint || 'Enter a purchase price above to calculate all four Live-in phases.'}
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(295px, 1fr))',
              gap: '16px'
            }}
          >
            {/* PHASE 01: BUY */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
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
                  fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
                  fontSize: '30px',
                  fontWeight: 600,
                  color: '#34292A',
                  marginBottom: '2px'
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

              {/* Cash vs My Savings */}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
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
                  fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
                  fontSize: '30px',
                  fontWeight: 600,
                  color: '#34292A',
                  marginBottom: '2px'
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

            {/* PHASE 03: IMPROVE */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#41101B'
                  }}
                >
                  03 · IMPROVE
                </span>
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: 'rgba(189, 211, 226, 0.35)',
                    color: '#34292A'
                  }}
                >
                  {results.improve.rehabPaidBy === 'limited_203k'
                    ? 'Financed · Limited 203(k)'
                    : results.improve.rehabPaidBy === 'standard_203k'
                    ? 'Financed · Standard 203(k)'
                    : 'Paid in Cash'}
                </span>
              </div>

              <div
                style={{
                  fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
                  fontSize: '30px',
                  fontWeight: 600,
                  color: '#34292A',
                  marginBottom: '2px'
                }}
              >
                {formatCurrency(results.improve.equityAtExit)}
              </div>
              <div style={{ fontSize: '11.5px', color: 'rgba(52, 41, 42, 0.65)', marginBottom: '12px' }}>
                Total equity at Year {results.live.liveInYears} ({fmtPct(results.improve.equityPctAtExit)} of value)
              </div>

              <div style={rowStyle}>
                <span>Renovation cost</span>
                <strong>{formatCurrency(results.improve.rehabBudget)}</strong>
              </div>
              <div style={rowStyle}>
                <span>Value after renovation (ARV)</span>
                <strong>{formatCurrency(results.improve.valueAfterReno)}</strong>
              </div>
              <div style={rowStyle}>
                <span>Gross value added vs. purchase</span>
                <strong style={{ color: results.improve.valueAdded >= 0 ? '#3F5A3A' : '#41101B' }}>
                  {results.improve.valueAdded >= 0 ? '+' : ''}
                  {formatCurrency(results.improve.valueAdded)}
                </strong>
              </div>
              <div style={rowStyle}>
                <span>Net equity immediately after reno</span>
                <strong>
                  {formatCurrency(results.improve.equityAfterRenoDay1)} (
                  {fmtPct(results.improve.equityPctAfterRenoDay1)})
                </strong>
              </div>
            </div>
          </div>

          {/* PHASE 04: EXIT — THREE SCENARIOS SIDE BY SIDE */}
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '16px'
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#41101B'
                  }}
                >
                  04 · EXIT OPTIONS (AFTER LIVE-IN PHASE)
                </span>
                <h4
                  style={{
                    margin: '4px 0 0',
                    fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
                    fontSize: '23px',
                    fontWeight: 600,
                    color: '#34292A'
                  }}
                >
                  Compare Rent, Sell, or Keep & Buy Property #2
                </h4>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(275px, 1fr))',
                gap: '16px'
              }}
            >
              {/* EXIT A: RENT */}
              <div
                style={{
                  background: '#FAF8F5',
                  border: '1px solid rgba(52, 41, 42, 0.12)',
                  borderRadius: '12px',
                  padding: '16px'
                }}
              >
                <div
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    color: '#41101B',
                    marginBottom: '6px'
                  }}
                >
                  A · RENT IT OUT
                </div>

                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
                    fontSize: '28px',
                    fontWeight: 600,
                    color: results.exit.rent.monthlyCashFlow >= 0 ? '#3F5A3A' : '#41101B'
                  }}
                >
                  {results.exit.rent.monthlyCashFlow >= 0 ? '+' : ''}
                  {formatCurrency(results.exit.rent.monthlyCashFlow)}/mo
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)', marginBottom: '10px' }}>
                  Monthly cash flow (incl. reassessed non-homestead tax)
                </div>

                <div style={rowStyle}>
                  <span>Projected market rent (Yr {results.live.liveInYears})</span>
                  <strong>{formatCurrency(results.exit.rent.exitGrossRentMo)}/mo</strong>
                </div>
                <div style={rowStyle}>
                  <span>Cash-on-Cash return</span>
                  <strong>
                    {results.exit.rent.isInfiniteCoC
                      ? '∞ (All cash out)'
                      : fmtPct(results.exit.rent.cashOnCash)}
                  </strong>
                </div>
                <div style={rowStyle}>
                  <span>DSCR</span>
                  <strong>
                    {results.exit.rent.dscr != null ? `${results.exit.rent.dscr.toFixed(2)}x` : '—'}
                  </strong>
                </div>

                {/* Optional Conventional Refinance at >=20% equity */}
                <div
                  style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    borderRadius: '9px',
                    background: '#FFFFFF',
                    border: '1px solid rgba(52, 41, 42, 0.12)'
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: results.exit.rent.convRefi.eligible ? '#34292A' : 'rgba(52, 41, 42, 0.55)',
                      cursor: results.exit.rent.convRefi.eligible ? 'pointer' : 'not-allowed'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(inputs.useConvRefi && results.exit.rent.convRefi.eligible)}
                      disabled={!results.exit.rent.convRefi.eligible}
                      onChange={(e) => onChangeInput('useConvRefi', e.target.checked)}
                    />
                    <span>Refinance to Conventional at ≥20% equity (drops MIP)</span>
                  </label>

                  {results.exit.rent.convRefi.eligible ? (
                    <div style={{ marginTop: '8px', fontSize: '11px', lineHeight: 1.55, color: 'rgba(52, 41, 42, 0.8)' }}>
                      <div>
                        • Drops FHA MIP (<strong>{formatCurrency(results.exit.rent.convRefi.monthlyMipDropped)}/mo</strong> saved)
                      </div>
                      <div>
                        • New Conv P&I ({results.exit.rent.convRefi.ratePct}%):{' '}
                        <strong>{formatCurrency(results.exit.rent.convRefi.newMonthlyPaymentPi)}/mo</strong>
                      </div>
                      <div>
                        • 80% LTV cash out:{' '}
                        <strong style={{ color: '#3F5A3A' }}>
                          {formatCurrency(results.exit.rent.convRefi.cashOut)}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                      Currently at {fmtPct(results.exit.rent.convRefi.equityPctAtExit)} equity — needs{' '}
                      {formatCurrency(results.exit.rent.convRefi.equityNeededForRefi)} more value/paydown to reach 20% equity.
                    </div>
                  )}
                </div>
              </div>

              {/* EXIT B: SELL (1 YR VS 2 YRS + SECTION 121) */}
              <div
                style={{
                  background: '#FAF8F5',
                  border: '1px solid rgba(52, 41, 42, 0.12)',
                  borderRadius: '12px',
                  padding: '16px'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap',
                    marginBottom: '8px'
                  }}
                >
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      letterSpacing: '0.09em',
                      textTransform: 'uppercase',
                      color: '#5C75A8'
                    }}
                  >
                    B · SELL (1 YR VS. 2 YRS)
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: '999px',
                      background: 'rgba(189, 211, 226, 0.4)',
                      color: '#34292A'
                    }}
                  >
                    {LIVE_IN_TAX_DISCLAIMER}
                  </span>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <SegmentedControl
                    size="sm"
                    options={FILING_STATUS_OPTIONS}
                    value={inputs.filingStatus || 'single'}
                    onChange={(val) => onChangeInput('filingStatus', val)}
                  />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    marginBottom: '10px'
                  }}
                >
                  {[results.exit.sell.year1, results.exit.sell.year2].map((yrData) => (
                    <div
                      key={yrData.years}
                      style={{
                        background: '#FFFFFF',
                        border:
                          yrData.years === 2
                            ? '1px solid rgba(63, 90, 58, 0.35)'
                            : '1px solid rgba(52, 41, 42, 0.10)',
                        borderRadius: '9px',
                        padding: '10px'
                      }}
                    >
                      <div
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.07em',
                          color: yrData.years === 2 ? '#3F5A3A' : 'rgba(52, 41, 42, 0.7)',
                          marginBottom: '4px'
                        }}
                      >
                        After {yrData.years} {yrData.years === 1 ? 'yr' : 'yrs'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.72)' }}>
                        Sale: <strong>{formatCurrency(yrData.salePrice)}</strong>
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.72)' }}>
                        Costs ({yrData.sellingCostsPct}%): −{formatCurrency(yrData.sellingCosts)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.72)', marginBottom: '4px' }}>
                        Est. tax: −{formatCurrency(yrData.estimatedCapGainsTax)}
                      </div>
                      <div
                        style={{
                          paddingTop: '4px',
                          borderTop: '1px solid rgba(52, 41, 42, 0.08)',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: yrData.profitAfterEstTax >= 0 ? '#3F5A3A' : '#41101B'
                        }}
                      >
                        Profit: {formatCurrency(yrData.profitAfterEstTax)}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    fontSize: '11px',
                    lineHeight: 1.5,
                    color: 'rgba(52, 41, 42, 0.78)',
                    background: '#FFFFFF',
                    padding: '9px 11px',
                    borderRadius: '8px',
                    border: '1px solid rgba(52, 41, 42, 0.09)'
                  }}
                >
                  <strong>2-of-5-year rule (Section 121):</strong> Living in the home ≥ 2 of the last 5 years can exclude up to{' '}
                  <strong>$250k single / $500k married</strong> in capital gains (
                  <em>{LIVE_IN_TAX_DISCLAIMER}</em>).
                </div>
              </div>

              {/* EXIT C: KEEP & BUY NEXT */}
              <div
                style={{
                  background: '#FAF8F5',
                  border: '1px solid rgba(52, 41, 42, 0.12)',
                  borderRadius: '12px',
                  padding: '16px'
                }}
              >
                <div
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    color: '#3F5A3A',
                    marginBottom: '6px'
                  }}
                >
                  C · KEEP & BUY PROPERTY #2
                </div>

                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
                    fontSize: '28px',
                    fontWeight: 600,
                    color: '#34292A'
                  }}
                >
                  {formatCurrency(results.exit.keepAndBuyNext.deployableCapitalForNext)}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)', marginBottom: '10px' }}>
                  Accessible equity + savings available for Property #2
                </div>

                <div style={rowStyle}>
                  <span>Property #1 equity kept</span>
                  <strong>{formatCurrency(results.exit.keepAndBuyNext.property1EquityAtExit)}</strong>
                </div>
                <div style={rowStyle}>
                  <span>Remaining + live-in rent savings</span>
                  <strong>
                    {formatCurrency(
                      results.exit.keepAndBuyNext.remainingSavingsAfterClose +
                        results.exit.keepAndBuyNext.savingsAccumulatedWhileLiving
                    )}
                  </strong>
                </div>
                <div style={rowStyle}>
                  <span>Tappable 80% LTV cash-out</span>
                  <strong>{formatCurrency(results.exit.keepAndBuyNext.tappableEquityCashOut)}</strong>
                </div>
                <div style={rowStyle}>
                  <span>Est. #2 budget (@ 20% down + 3% close)</span>
                  <strong>{formatCurrency(results.exit.keepAndBuyNext.estimatedNextPurchasingPower)}</strong>
                </div>

                <div
                  style={{
                    marginTop: '10px',
                    fontSize: '11px',
                    lineHeight: 1.5,
                    color: 'rgba(52, 41, 42, 0.78)',
                    background: '#FFFFFF',
                    padding: '9px 11px',
                    borderRadius: '8px',
                    border: '1px solid rgba(52, 41, 42, 0.09)'
                  }}
                >
                  <strong>FHA rule note:</strong> {results.exit.keepAndBuyNext.oneFhaRuleNote}
                </div>
              </div>
            </div>
          </div>

          {/* WEALTH CHART (3 / 5 / 10 YEARS) */}
          <LiveInWealthChart
            wealthSeries={results.wealthSeries}
            liveInYears={results.live.liveInYears}
          />
        </>
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
                fontFamily: "'Montserrat', sans-serif"
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

