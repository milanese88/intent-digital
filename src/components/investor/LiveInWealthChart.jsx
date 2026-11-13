import React, { useState } from 'react';
import { formatCurrency } from './underwriting.js';

const SERIES_META = [
  {
    key: 'rentNetWorth',
    code: 'A',
    label: 'A · Rent',
    color: '#41101B', // Brand Burgundy / Cherry
    dash: 'none'
  },
  {
    key: 'sellNetWorth',
    code: 'B',
    label: 'B · Sell',
    color: '#5C75A8', // Brand Periwinkle Slate
    dash: '6 4'
  },
  {
    key: 'keepAndBuyNextNetWorth',
    code: 'C',
    label: 'C · Keep & buy next',
    color: '#3F5A3A', // Brand Forest Green
    dash: 'none'
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
 * Line chart in strict Intent Digital brand colors (zero orange) plotting
 * Net Worth created from this property at 3 / 5 / 10 years across Exits A, B, and C.
 */
export default function LiveInWealthChart({ wealthSeries = [], liveInYears = 2 }) {
  const [selectedYear, setSelectedYear] = useState(10);

  if (!Array.isArray(wealthSeries) || wealthSeries.length === 0) {
    return null;
  }

  const allValues = [];
  for (const pt of wealthSeries) {
    for (const s of SERIES_META) {
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
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(52, 41, 42, 0.12)',
        borderRadius: '14px',
        padding: '20px 22px',
        fontFamily: "'Montserrat', sans-serif"
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
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(52, 41, 42, 0.58)',
              marginBottom: '4px'
            }}
          >
            3 / 5 / 10-YEAR WEALTH TRAJECTORY
          </div>
          <h4
            style={{
              margin: 0,
              fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
              fontSize: '23px',
              fontWeight: 600,
              color: '#34292A'
            }}
          >
            Net Worth From This Property (After Year {liveInYears} Exit)
          </h4>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          {SERIES_META.map((s) => (
            <div
              key={s.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#34292A'
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
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SVG Line Chart */}
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ width: '100%', height: 'auto', minWidth: '340px', display: 'block' }}
          role="img"
          aria-label="Net worth at 3, 5, and 10 years for Rent, Sell, and Keep and Buy Next scenarios"
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

          {/* Vertical highlight guide for selected year */}
          {wealthSeries.map((pt, idx) => {
            const x = xPositions[idx];
            const isSelected = pt.year === activePoint?.year;
            return (
              <g key={pt.year}>
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={padTop + plotH}
                  stroke={isSelected ? 'rgba(133, 157, 206, 0.55)' : 'rgba(52, 41, 42, 0.05)'}
                  strokeWidth={isSelected ? '1.5' : '1'}
                />
                <text
                  x={x}
                  y={svgHeight - 10}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={isSelected ? '700' : '500'}
                  fontFamily="'Montserrat', sans-serif"
                  fill={isSelected ? '#34292A' : 'rgba(52, 41, 42, 0.65)'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedYear(pt.year)}
                >
                  Year {pt.year}
                </text>
              </g>
            );
          })}

          {/* Lines & Data Nodes */}
          {SERIES_META.map((s) => {
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
                  const isSelected = pt.year === activePoint?.year;
                  return (
                    <circle
                      key={`${s.key}-${pt.year}`}
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 5.5 : 4}
                      fill="#FAF8F5"
                      stroke={s.color}
                      strokeWidth="2.5"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setSelectedYear(pt.year)}
                      onClick={() => setSelectedYear(pt.year)}
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

      {/* Interactive Year Comparison Table */}
      <div
        style={{
          marginTop: '14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
          gap: '10px'
        }}
      >
        {wealthSeries.map((pt) => {
          const isSelected = pt.year === activePoint?.year;
          return (
            <button
              type="button"
              key={pt.year}
              onClick={() => setSelectedYear(pt.year)}
              style={{
                textAlign: 'left',
                background: isSelected ? '#FAF8F5' : '#FFFFFF',
                border: isSelected
                  ? '1px solid rgba(133, 157, 206, 0.7)'
                  : '1px solid rgba(52, 41, 42, 0.10)',
                borderRadius: '10px',
                padding: '10px 12px',
                cursor: 'pointer',
                fontFamily: "'Montserrat', sans-serif"
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
                {SERIES_META.map((s) => (
                  <div
                    key={s.key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11.5px'
                    }}
                  >
                    <span style={{ color: 'rgba(52, 41, 42, 0.75)', display: 'flex', alignItems: 'center', gap: '5px' }}>
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
                    <strong style={{ color: s.color, fontWeight: 600 }}>
                      {formatCurrency(pt[s.key])}
                    </strong>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

