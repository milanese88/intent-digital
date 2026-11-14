import React, { useState, useEffect } from 'react';
import { formatCurrency } from './underwriting.js';
import { loadThemeFont } from '../../utils/themeFonts.js';

// Heading token strictly resolves to Instrument Serif (portal default) — zero other serifs
const HEADING_FONT = 'var(--font-heading, "Instrument Serif", Georgia, serif)';
const BODY_FONT = 'var(--font-sans, "Montserrat", sans-serif)';

const SERIES_META = [
  {
    key: 'rentNetWorth',
    code: 'A',
    label: 'A · Rent',
    color: '#41101B', // Brand Burgundy / Cherry
    dash: 'none',
    requiresMarketRent: true
  },
  {
    key: 'sellNetWorth',
    code: 'B',
    label: 'B · Sell',
    color: '#5C75A8', // Brand Periwinkle Slate
    dash: '6 4',
    requiresMarketRent: false
  },
  {
    key: 'keepAndBuyNextNetWorth',
    code: 'C',
    label: 'C · Keep & buy next',
    color: '#3F5A3A', // Brand Forest Green
    dash: 'none',
    requiresMarketRent: true
  }
];

function formatCompactDollar(val) {
  const n = Number(val) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1000000) {
    return `${sign}$${(abs / 1000000).toFixed(2)}M`;
  }
  if (abs >= 1000) {
    return `${sign}$${Math.round(abs / 1000)}k`;
  }
  return formatCurrency(n);
}

/**
 * Vector SVG line chart in strict Intent Digital brand colors (zero orange) plotting
 * Net Worth created from this property at 3 / 5 / 10 years across Exits A, B, and C.
 * Uses pure inline SVG (not canvas) so it prints crisply in Deal Reports.
 */
export default function LiveInWealthChart({
  wealthSeries = [],
  liveInYears = 2,
  hasMarketRent = true,
  onFocusMarketRent = null,
  printMode = false
}) {
  const [selectedYear, setSelectedYear] = useState(10);

  useEffect(() => {
    loadThemeFont('Instrument Serif');
  }, []);

  if (!Array.isArray(wealthSeries) || wealthSeries.length === 0) {
    return null;
  }

  const resolvedExitYears = Number(liveInYears) === 1 ? 1 : 2;

  const plottableSeries = SERIES_META.filter((s) =>
    wealthSeries.every((pt) => pt[s.key] != null && Number.isFinite(pt[s.key]))
  );

  const allValues = [];
  for (const pt of wealthSeries) {
    for (const s of plottableSeries) {
      if (Number.isFinite(pt[s.key])) allValues.push(pt[s.key]);
    }
  }
  if (allValues.length === 0) return null;

  const rawMin = Math.min(0, ...allValues);
  const rawMax = Math.max(50000, ...allValues);
  const rangeSpan = Math.max(10000, rawMax - rawMin);
  const yMin = rawMin < 0 ? rawMin - rangeSpan * 0.08 : 0;
  const yMax = rawMax + rangeSpan * 0.12;

  const svgWidth = 680;
  const svgHeight = 250;
  const padLeft = 68;
  const padRight = 32;
  const padTop = 24;
  const padBottom = 38;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const xPositions = wealthSeries.map((_, idx) => {
    if (wealthSeries.length === 1) return padLeft + plotW / 2;
    return padLeft + (idx / (wealthSeries.length - 1)) * plotW;
  });

  const yForVal = (v) => {
    const ratio = (v - yMin) / (yMax - yMin || 1);
    return padTop + plotH - ratio * plotH;
  };

  const yTicks = [0, 0.33, 0.66, 1].map((t) => yMin + t * (yMax - yMin));
  const activePoint =
    wealthSeries.find((pt) => pt.year === selectedYear) || wealthSeries[wealthSeries.length - 1];

  return (
    <div
      className={printMode ? 'avoid-break' : undefined}
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(52, 41, 42, 0.12)',
        borderRadius: '14px',
        padding: printMode ? '18px 20px' : '20px 22px',
        fontFamily: BODY_FONT
      }}
    >
      {/* Header & Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '14px'
        }}
      >
        <div>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(52, 41, 42, 0.58)',
              marginBottom: '4px',
              fontFamily: BODY_FONT
            }}
          >
            3 / 5 / 10-YEAR WEALTH TRAJECTORY
          </div>
          <h4
            style={{
              margin: 0,
              fontFamily: HEADING_FONT,
              fontSize: 'var(--text-h3, 26px)',
              fontWeight: 400,
              lineHeight: 1.14,
              letterSpacing: 'var(--letter-spacing-tight, -0.02em)',
              color: 'var(--espresso, #34292A)'
            }}
          >
            <span style={{ display: 'block', fontFamily: HEADING_FONT, fontWeight: 400 }}>
              Net worth from this property
            </span>
            <span
              style={{
                display: 'block',
                fontFamily: HEADING_FONT,
                fontStyle: 'italic',
                fontWeight: 400
              }}
            >
              after a year-{resolvedExitYears} exit
            </span>
          </h4>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          {SERIES_META.map((s) => {
            const isMuted = s.requiresMarketRent && !hasMarketRent;
            return (
              <div
                key={s.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#34292A',
                  opacity: isMuted ? 0.52 : 1,
                  fontFamily: BODY_FONT
                }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '3px',
                    background: s.color,
                    borderRadius: '2px',
                    display: 'inline-block'
                  }}
                />
                <span>
                  {s.label}
                  {isMuted ? ' (add market rent)' : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty Market Rent Callout (Brand Quietude — no orange) */}
      {!hasMarketRent && (
        <div
          style={{
            marginBottom: '12px',
            padding: '9px 12px',
            borderRadius: '8px',
            background: 'rgba(189, 211, 226, 0.25)',
            border: '1px solid rgba(133, 157, 206, 0.42)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '11.5px',
            color: '#34292A'
          }}
        >
          <span>
            {printMode ? (
              <>
                Market rent after move-out was not entered — <strong>B · Sell</strong> is plotted below; add market rent in the Deal tab to include <strong>A · Rent</strong> and <strong>C · Keep &amp; buy next</strong>.
              </>
            ) : (
              <>
                Add <strong>Market rent after move-out ($/mo)</strong> above to plot{' '}
                <strong>A · Rent</strong> and <strong>C · Keep &amp; buy next</strong> alongside{' '}
                <strong>B · Sell</strong>.
              </>
            )}
          </span>
          {!printMode && typeof onFocusMarketRent === 'function' && (
            <button
              type="button"
              onClick={onFocusMarketRent}
              className="no-print"
              style={{
                border: '1px solid rgba(52, 41, 42, 0.22)',
                background: '#FFFFFF',
                color: '#34292A',
                borderRadius: '999px',
                padding: '4px 10px',
                fontSize: '10.5px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: BODY_FONT
              }}
            >
              Add market rent ↑
            </button>
          )}
        </div>
      )}

      {/* Vector SVG Line Chart (Print-Ready) */}
      <div style={{ width: '100%', overflowX: printMode ? 'visible' : 'auto' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ width: '100%', height: 'auto', minWidth: printMode ? 0 : '340px', display: 'block' }}
          role="img"
          aria-label={`Net worth from this property after a year-${resolvedExitYears} exit at 3, 5, and 10 years`}
        >
          {/* Horizontal grid lines */}
          {yTicks.map((tickVal, idx) => {
            const y = yForVal(tickVal);
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  stroke="rgba(52, 41, 42, 0.09)"
                  strokeDasharray={idx === 0 ? 'none' : '3 3'}
                />
                <text
                  x={padLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10.5"
                  fontFamily="'Montserrat', sans-serif"
                  fill="rgba(52, 41, 42, 0.62)"
                >
                  {formatCompactDollar(tickVal)}
                </text>
              </g>
            );
          })}

          {/* Zero baseline if negative exists */}
          {yMin < 0 && (
            <line
              x1={padLeft}
              y1={yForVal(0)}
              x2={svgWidth - padRight}
              y2={yForVal(0)}
              stroke="rgba(52, 41, 42, 0.25)"
              strokeWidth="1"
            />
          )}

          {/* Vertical guides & Year labels */}
          {wealthSeries.map((pt, idx) => {
            const x = xPositions[idx];
            const isSelected = !printMode && pt.year === activePoint?.year;
            return (
              <g key={pt.year}>
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={padTop + plotH}
                  stroke={isSelected ? 'rgba(133, 157, 206, 0.55)' : 'rgba(52, 41, 42, 0.07)'}
                  strokeWidth={isSelected ? '1.5' : '1'}
                />
                <text
                  x={x}
                  y={svgHeight - 10}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={isSelected ? '700' : '600'}
                  fontFamily="'Montserrat', sans-serif"
                  fill={isSelected ? '#34292A' : 'rgba(52, 41, 42, 0.72)'}
                  style={{ cursor: printMode ? 'default' : 'pointer' }}
                  onClick={printMode ? undefined : () => setSelectedYear(pt.year)}
                >
                  Year {pt.year}
                </text>
              </g>
            );
          })}

          {/* Lines & Data Nodes */}
          {plottableSeries.map((s) => {
            const pointsAttr = wealthSeries
              .map((pt, idx) => `${xPositions[idx]},${yForVal(pt[s.key])}`)
              .join(' ');

            return (
              <g key={s.key}>
                <polyline
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.75"
                  strokeDasharray={s.dash}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={pointsAttr}
                />
                {wealthSeries.map((pt, idx) => {
                  const cx = xPositions[idx];
                  const cy = yForVal(pt[s.key]);
                  const isSelected = !printMode && pt.year === activePoint?.year;
                  return (
                    <circle
                      key={`${s.key}-${pt.year}`}
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 5.5 : 4.25}
                      fill="#FAF8F5"
                      stroke={s.color}
                      strokeWidth="2.5"
                      style={{ cursor: printMode ? 'default' : 'pointer' }}
                      onMouseEnter={printMode ? undefined : () => setSelectedYear(pt.year)}
                      onClick={printMode ? undefined : () => setSelectedYear(pt.year)}
                    >
                      <title>{`${s.label} · Year ${pt.year}: ${formatCurrency(pt[s.key])}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Year 3 / Year 5 / Year 10 Net Worth Summary Row */}
      <div
        style={{
          marginTop: '14px',
          display: 'grid',
          gridTemplateColumns: printMode
            ? 'repeat(3, minmax(0, 1fr))'
            : 'repeat(auto-fit, minmax(185px, 1fr))',
          gap: '10px'
        }}
      >
        {wealthSeries.map((pt) => {
          const isSelected = !printMode && pt.year === activePoint?.year;
          const CardTag = printMode ? 'div' : 'button';
          return (
            <CardTag
              {...(printMode ? {} : { type: 'button', onClick: () => setSelectedYear(pt.year) })}
              key={pt.year}
              style={{
                textAlign: 'left',
                background: isSelected || printMode ? '#FAF8F5' : '#FFFFFF',
                border: isSelected
                  ? '1px solid rgba(133, 157, 206, 0.7)'
                  : '1px solid rgba(52, 41, 42, 0.10)',
                borderRadius: '10px',
                padding: '10px 12px',
                cursor: printMode ? 'default' : 'pointer',
                fontFamily: BODY_FONT
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: '#34292A',
                  marginBottom: '6px'
                }}
              >
                Year {pt.year} Net Worth
              </div>
              <div style={{ display: 'grid', gap: '4px' }}>
                {SERIES_META.map((s) => {
                  const val = pt[s.key];
                  const missing = val == null || !Number.isFinite(val);
                  return (
                    <div
                      key={s.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11.5px'
                      }}
                    >
                      <span
                        style={{
                          color: 'rgba(52, 41, 42, 0.75)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: s.color,
                            display: 'inline-block'
                          }}
                        />
                        {s.label}
                      </span>
                      <strong
                        style={{
                          color: missing ? 'rgba(52, 41, 42, 0.52)' : s.color,
                          fontWeight: 600,
                          fontSize: missing ? '10.5px' : '11.5px'
                        }}
                      >
                        {missing ? 'Add market rent' : formatCurrency(val)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </CardTag>
          );
        })}
      </div>
    </div>
  );
}
