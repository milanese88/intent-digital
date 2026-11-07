import React, { useState, useId } from 'react';

/**
 * MarketChart
 * Renders an inline SVG chart for monthly median $/sf with optional quarterly trend line,
 * subject property reference line, and dashed segment for incomplete months still being recorded.
 * 
 * Supports both full interactive chart mode and compact sparkline mode.
 */
export default function MarketChart({
  monthly = [],
  quarterly = [],
  subjectPpsf = null,
  isSparkline = false,
  height = 200,
  accentColor = '#859DCE',
  primaryColor = '#34292A'
}) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const gradientId = useId();

  // Filter months that have valid median_price_per_sqft
  const validMonthly = (monthly || []).filter(m => m && m.median_price_per_sqft != null && m.median_price_per_sqft > 0);

  if (validMonthly.length < 2) {
    return (
      <div
        style={{
          height: `${height}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(52, 41, 42, 0.02)',
          borderRadius: '8px',
          color: 'rgba(52, 41, 42, 0.45)',
          fontSize: '12px',
          fontStyle: 'italic'
        }}
      >
        Insufficient sales data to display trend chart
      </div>
    );
  }

  // Determine coordinate bounding box
  const ppsfValues = validMonthly.map(m => m.median_price_per_sqft);
  if (subjectPpsf != null && !isNaN(subjectPpsf) && subjectPpsf > 0) {
    ppsfValues.push(subjectPpsf);
  }

  const rawMin = Math.min(...ppsfValues);
  const rawMax = Math.max(...ppsfValues);
  const padding = Math.max(20, (rawMax - rawMin) * 0.15);
  const minY = Math.max(0, Math.floor((rawMin - padding) / 25) * 25);
  const maxY = Math.ceil((rawMax + padding) / 25) * 25;
  const yRange = maxY - minY || 1;

  // ViewBox dimensions
  const vbWidth = isSparkline ? 260 : 640;
  const vbHeight = isSparkline ? 54 : height;

  const padLeft = isSparkline ? 6 : 56;
  const padRight = isSparkline ? 6 : 40;
  const padTop = isSparkline ? 6 : 26;
  const padBottom = isSparkline ? 6 : 34;

  const chartW = vbWidth - padLeft - padRight;
  const chartH = vbHeight - padTop - padBottom;

  // Calculate coordinates for monthly points
  const points = validMonthly.map((m, idx) => {
    const x = padLeft + (idx / Math.max(1, validMonthly.length - 1)) * chartW;
    const y = padTop + chartH - ((m.median_price_per_sqft - minY) / yRange) * chartH;
    return { ...m, x, y };
  });

  // Helper to generate path
  const buildSmoothPath = (pts) => {
    if (!pts || pts.length === 0) return '';
    return pts.reduce((acc, pt, i, arr) => {
      if (i === 0) return `M ${pt.x},${pt.y}`;
      const prev = arr[i - 1];
      const cx1 = prev.x + (pt.x - prev.x) / 2;
      const cy1 = prev.y;
      const cx2 = prev.x + (pt.x - prev.x) / 2;
      const cy2 = pt.y;
      return `${acc} C ${cx1},${cy1} ${cx2},${cy2} ${pt.x},${pt.y}`;
    }, '');
  };

  // Find partition between complete and incomplete months
  const lastCompleteIdx = points.reduce((lastIdx, pt, idx) => (pt.is_complete !== false ? idx : lastIdx), -1);
  const hasIncompleteMonths = lastCompleteIdx >= 0 && lastCompleteIdx < points.length - 1;

  const completePts = hasIncompleteMonths ? points.slice(0, lastCompleteIdx + 1) : points;
  const incompletePts = hasIncompleteMonths ? points.slice(lastCompleteIdx) : [];

  const completeLinePath = buildSmoothPath(completePts);
  const incompleteLinePath = hasIncompleteMonths ? buildSmoothPath(incompletePts) : null;

  // Full line path for gradient area
  const fullLinePath = buildSmoothPath(points);
  const areaPath = points.length > 0
    ? `${fullLinePath} L ${points[points.length - 1].x},${padTop + chartH} L ${points[0].x},${padTop + chartH} Z`
    : '';

  // Subject Property horizontal line Y
  const subjectY = (subjectPpsf != null && subjectPpsf >= minY && subjectPpsf <= maxY)
    ? padTop + chartH - ((subjectPpsf - minY) / yRange) * chartH
    : null;

  // Quarterly trend line points (if available and not sparkline)
  const validQuarterly = (quarterly || []).filter(q => q && q.median_price_per_sqft != null && q.median_price_per_sqft > 0);
  const qPoints = validQuarterly.map((q, qIdx) => {
    const matchIdx = validMonthly.findIndex(m => {
      const qNum = Math.ceil(m.month / 3);
      return m.year === q.year && qNum === q.quarter;
    });
    const x = matchIdx >= 0
      ? padLeft + (matchIdx / Math.max(1, validMonthly.length - 1)) * chartW
      : padLeft + (qIdx / Math.max(1, validQuarterly.length - 1)) * chartW;
    const y = padTop + chartH - ((q.median_price_per_sqft - minY) / yRange) * chartH;
    return { ...q, x, y };
  });

  const qPath = qPoints.length > 1
    ? qPoints.reduce((acc, pt, i) => i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`, '')
    : null;

  // Y-axis grid ticks (3 ticks for full mode)
  const yTicks = [
    minY,
    Math.round((minY + maxY) / 2),
    maxY
  ];

  if (isSparkline) {
    return (
      <div style={{ width: '100%', height: `${height}px`, overflow: 'hidden' }}>
        <svg
          viewBox={`0 0 ${vbWidth} ${vbHeight}`}
          style={{ width: '100%', height: '100%', display: 'block' }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`spark-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.32" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#spark-${gradientId})`} />
          
          {/* Complete Months (Solid) */}
          <path
            d={completeLinePath}
            fill="none"
            stroke={primaryColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Incomplete Months (Dashed Lighter) */}
          {incompleteLinePath && (
            <path
              d={incompleteLinePath}
              fill="none"
              stroke={primaryColor}
              strokeWidth="1.6"
              strokeDasharray="3 2"
              strokeOpacity="0.45"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.length > 0 && (
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r="2.5"
              fill={hasIncompleteMonths ? 'rgba(52, 41, 42, 0.45)' : primaryColor}
            />
          )}
        </svg>
      </div>
    );
  }

  const latestIncompletePt = hasIncompleteMonths ? points[points.length - 1] : null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Chart Legend / Metadata Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: 'rgba(52, 41, 42, 0.65)',
          marginBottom: '8px',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '2.5px', backgroundColor: primaryColor, display: 'inline-block', borderRadius: '2px' }} />
            <span style={{ fontWeight: 500 }}>Monthly median $/sf</span>
          </div>

          {hasIncompleteMonths && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '0', borderTop: '2px dashed rgba(52, 41, 42, 0.45)', display: 'inline-block' }} />
              <span style={{ fontWeight: 500, color: 'rgba(52, 41, 42, 0.6)' }}>Still being recorded</span>
            </div>
          )}

          {qPath && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '2px', backgroundColor: accentColor, display: 'inline-block', borderRadius: '2px' }} />
              <span style={{ fontWeight: 500 }}>Quarterly trend</span>
            </div>
          )}

          {subjectY != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '0', borderTop: '2px dashed rgba(52, 41, 42, 0.7)', display: 'inline-block' }} />
              <span style={{ fontWeight: 500 }}>This property (${subjectPpsf}/sf)</span>
            </div>
          )}
        </div>

        {hoveredPoint && (
          <div
            style={{
              fontWeight: 600,
              color: 'var(--espresso, #34292A)',
              backgroundColor: 'rgba(189, 211, 226, 0.25)',
              padding: '2px 8px',
              borderRadius: '4px'
            }}
          >
            {hoveredPoint.label}: ${hoveredPoint.median_price_per_sqft}/sf ({hoveredPoint.sales_count} sales)
            {hoveredPoint.is_complete === false ? ' · Still being recorded' : ''}
          </div>
        )}
      </div>

      <div style={{ width: '100%', height: `${height}px` }}>
        <svg
          viewBox={`0 0 ${vbWidth} ${vbHeight}`}
          style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id={`grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines and Y labels */}
          {yTicks.map(val => {
            const y = padTop + chartH - ((val - minY) / yRange) * chartH;
            return (
              <g key={`ytick-${val}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + chartW}
                  y2={y}
                  stroke="rgba(52, 41, 42, 0.08)"
                  strokeDasharray="2 3"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fontFamily="var(--font-sans, 'Montserrat', sans-serif)"
                  fill="rgba(52, 41, 42, 0.5)"
                >
                  ${val}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill={`url(#grad-${gradientId})`} />

          {/* Quarterly Trend Line */}
          {qPath && (
            <path
              d={qPath}
              fill="none"
              stroke={accentColor}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
            />
          )}

          {/* Complete Months: Solid Curve Line */}
          <path
            d={completeLinePath}
            fill="none"
            stroke={primaryColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Incomplete Months: Lighter Dashed Segment */}
          {incompleteLinePath && (
            <path
              d={incompleteLinePath}
              fill="none"
              stroke={primaryColor}
              strokeWidth="2.0"
              strokeDasharray="4 3"
              strokeOpacity="0.45"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* "Still being recorded" label over incomplete segment */}
          {latestIncompletePt && (
            <g>
              <rect
                x={latestIncompletePt.x - 52}
                y={latestIncompletePt.y - 20}
                width="104"
                height="15"
                rx="3"
                fill="rgba(250, 248, 245, 0.92)"
                stroke="rgba(52, 41, 42, 0.15)"
                strokeWidth="0.8"
              />
              <text
                x={latestIncompletePt.x}
                y={latestIncompletePt.y - 9}
                textAnchor="middle"
                fontSize="8.5"
                fontFamily="var(--font-sans, 'Montserrat', sans-serif)"
                fontWeight="600"
                letterSpacing="0.02em"
                fill="rgba(52, 41, 42, 0.65)"
              >
                Still being recorded
              </text>
            </g>
          )}

          {/* Subject property reference line */}
          {subjectY != null && (
            <g>
              <line
                x1={padLeft}
                y1={subjectY}
                x2={padLeft + chartW}
                y2={subjectY}
                stroke="rgba(52, 41, 42, 0.75)"
                strokeWidth="1.8"
                strokeDasharray="4 4"
              />
              <text
                x={padLeft + chartW}
                y={subjectY - 5}
                textAnchor="end"
                fontSize="9.5"
                fontWeight="600"
                fontFamily="var(--font-sans, 'Montserrat', sans-serif)"
                fill="var(--espresso, #34292A)"
              >
                This property (${subjectPpsf}/sf)
              </text>
            </g>
          )}

          {/* Data point circles and hover targets */}
          {points.map((pt, i) => {
            const isInc = pt.is_complete === false;
            return (
              <g key={`pt-${pt.key || i}`}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={hoveredPoint?.key === pt.key ? 5 : (isInc ? 3 : 3)}
                  fill={isInc ? '#FAF8F5' : '#ffffff'}
                  stroke={isInc ? 'rgba(52, 41, 42, 0.45)' : primaryColor}
                  strokeWidth="2"
                  strokeDasharray={isInc ? '2 2' : 'none'}
                  style={{ transition: 'r 0.15s ease' }}
                />
                {/* Invisible larger hit target */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="14"
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredPoint(pt)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              </g>
            );
          })}

          {/* X Axis Month Labels (sample evenly) */}
          {points
            .filter((_, idx) => idx === 0 || idx === Math.floor(points.length / 2) || idx === points.length - 1)
            .map((pt, idx, arr) => {
              const anchor = idx === 0 ? 'start' : idx === arr.length - 1 ? 'end' : 'middle';
              return (
                <text
                  key={`xlbl-${pt.key}`}
                  x={pt.x}
                  y={padTop + chartH + 18}
                  textAnchor={anchor}
                  fontSize="10"
                  fontFamily="var(--font-sans, 'Montserrat', sans-serif)"
                  fill="rgba(52, 41, 42, 0.6)"
                >
                  {pt.label}
                </text>
              );
            })}
        </svg>
      </div>
    </div>
  );
}
