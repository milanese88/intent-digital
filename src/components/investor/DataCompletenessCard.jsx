import React, { useState } from 'react';
import { Button, Eyebrow } from '../ui';
import { evaluateDataCompleteness } from '../../utils/propertyCompleteness.js';

export default function DataCompletenessCard({
  property,
  countyData,
  onOpenPasteListing = null,
  onRefreshCounty = null,
  isRefreshing = false
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const completeness = evaluateDataCompleteness(property, countyData);

  const { scorePct, completed, total, missingItems, items } = completeness;

  // Determine badge color based on completeness
  const badgeBg = scorePct >= 80 ? 'rgba(133, 157, 206, 0.18)' : scorePct >= 50 ? 'rgba(189, 211, 226, 0.3)' : 'rgba(52, 41, 42, 0.08)';
  const badgeColor = scorePct >= 80 ? '#34292A' : '#34292A';

  return (
    <div
      style={{
        backgroundColor: '#FAF8F5',
        borderRadius: '14px',
        border: '1px solid rgba(52, 41, 42, 0.12)',
        padding: '18px 20px',
        boxShadow: '0 2px 8px rgba(52, 41, 42, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        fontFamily: 'Montserrat, sans-serif'
      }}
    >
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>📊</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h4 style={{ fontFamily: 'Playfair Display, Cormorant Garamond, serif', fontSize: '17px', fontWeight: 600, color: '#34292A', margin: 0 }}>
                Data Completeness
              </h4>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: badgeBg,
                  color: badgeColor,
                  border: '1px solid rgba(52, 41, 42, 0.1)'
                }}
              >
                {scorePct}% · {completed} of {total} core items
              </span>
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'rgba(52, 41, 42, 0.7)' }}>
              Auto-filled once from county records. Your manual edits always win.
            </p>
          </div>
        </div>

        {/* Quick action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onOpenPasteListing && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenPasteListing}
              style={{
                fontSize: '11px',
                padding: '5px 10px',
                borderColor: '#859DCE',
                color: '#34292A',
                backgroundColor: 'rgba(189, 211, 226, 0.2)'
              }}
              title="Paste listing description from Zillow, Redfin, or MLS to fill price, beds, baths, and features"
            >
              📋 Paste listing details
            </Button>
          )}
          {onRefreshCounty && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshCounty}
              disabled={isRefreshing}
              style={{ fontSize: '11px', padding: '5px 10px', borderColor: 'rgba(52, 41, 42, 0.2)' }}
            >
              {isRefreshing ? 'Syncing…' : '↻ Re-sync county'}
            </Button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              color: '#859DCE',
              padding: '4px 6px'
            }}
          >
            {isExpanded ? 'Hide checklist ▲' : 'View checklist ▼'}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(52, 41, 42, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${scorePct}%`,
            backgroundColor: scorePct >= 80 ? '#859DCE' : scorePct >= 50 ? '#BDD3E2' : '#34292A',
            transition: 'width 0.4s ease'
          }}
        />
      </div>

      {/* Missing items summary chips (shown when not expanded) */}
      {!isExpanded && missingItems.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(52, 41, 42, 0.6)' }}>Missing:</span>
          {missingItems.map((item) => (
            <span
              key={item.id}
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(52, 41, 42, 0.04)',
                border: '1px dashed rgba(52, 41, 42, 0.18)',
                color: '#34292A'
              }}
            >
              ⚠️ {item.missingReason || item.label}
            </span>
          ))}
        </div>
      )}

      {/* Detailed Itemized Checklist (shown when expanded) */}
      {isExpanded && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '8px',
            marginTop: '4px',
            paddingTop: '10px',
            borderTop: '1px solid rgba(52, 41, 42, 0.08)'
          }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                backgroundColor: item.isComplete ? 'rgba(189, 211, 226, 0.12)' : 'rgba(255, 255, 255, 0.7)',
                border: item.isComplete ? '1px solid rgba(133, 157, 206, 0.25)' : '1px dashed rgba(52, 41, 42, 0.18)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '8px'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px' }}>{item.isComplete ? '✓' : '⚠️'}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#34292A' }}>{item.label}</span>
                </div>
                {item.isComplete ? (
                  <div style={{ marginTop: '2px', fontSize: '12px', fontWeight: 500, color: '#34292A' }}>
                    {item.displayValue}
                  </div>
                ) : (
                  <div style={{ marginTop: '2px', fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)', fontStyle: 'italic' }}>
                    {item.missingReason}
                  </div>
                )}
              </div>
              {item.isComplete && item.sourceLabel && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(52, 41, 42, 0.06)',
                    color: '#34292A',
                    whiteSpace: 'nowrap'
                  }}
                  title={`Source: ${item.sourceLabel} (${item.sourceDate || '2026'})`}
                >
                  {item.sourceLabel.slice(0, 18)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

