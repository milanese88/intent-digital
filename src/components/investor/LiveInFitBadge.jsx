import React from 'react';
import { evaluateLiveInFit } from './underwriting.js';
import { LIVE_IN_PLAN_DISCLAIMER } from '../../config/financing.js';

/**
 * Displays the "Live-in fit" screening badge and itemized reasons on saved properties
 * and county search results. Strictly uses Intent Digital brand colors (zero orange).
 */
export default function LiveInFitBadge({
  property,
  profile = null,
  compact = false,
  showReasons = false,
  showDisclaimer = false
}) {
  if (!property) return null;

  const fit = evaluateLiveInFit(property, profile);

  const getBadgeStyles = () => {
    if (!fit.fits) {
      return {
        background: 'rgba(65, 16, 27, 0.07)',
        color: '#41101B',
        border: '1px solid rgba(65, 16, 27, 0.30)'
      };
    }
    if (fit.status === 'caution') {
      return {
        background: 'rgba(189, 211, 226, 0.36)',
        color: '#34292A',
        border: '1px solid rgba(133, 157, 206, 0.60)'
      };
    }
    return {
      background: 'rgba(63, 90, 58, 0.11)',
      color: '#3F5A3A',
      border: '1px solid rgba(63, 90, 58, 0.30)'
    };
  };

  const badgeStyle = getBadgeStyles();
  const cautionCount = fit.reasons.filter((r) => r.type === 'caution').length;
  const tooltipText = fit.reasons.map((r) => `• ${r.text}`).join('\n');

  if (compact && !showReasons) {
    const shortFlagSummary = fit.reasons
      .filter((r) => r.type === 'bonus' || r.type === 'caution' || r.type === 'blocker')
      .slice(0, 2)
      .map((r) => {
        if (r.key === 'multifamily_bonus') return `${fit.fhaLimitInfo.units}-unit bonus`;
        if (r.key === 'condo_approval') return 'Check FHA condo approval';
        if (r.key === 'hoa_rental_restrictions') return 'Check HOA rental rules';
        if (r.key === 'flood_zone') return 'Flood ins. flag';
        if (r.key === 'condition_203k') return 'May need 203(k)';
        if (r.key === 'fha_limit_exceeded') return 'Above FHA limit';
        return r.text;
      })
      .join(' · ');

    return (
      <div
        title={`${fit.badgeLabel}\n${tooltipText}\n(${LIVE_IN_PLAN_DISCLAIMER})`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '6px',
          fontFamily: "'Montserrat', sans-serif"
        }}
      >
        <span
          style={{
            ...badgeStyle,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '999px',
            fontSize: '9px',
            fontWeight: 600,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            lineHeight: 1.4,
            whiteSpace: 'nowrap'
          }}
        >
          <span>{fit.fits ? '✓' : '✕'}</span>
          <span>
            {fit.fits
              ? cautionCount > 0
                ? `LIVE-IN FIT · ${cautionCount} CHECK${cautionCount > 1 ? 'S' : ''}`
                : 'LIVE-IN FIT'
              : fit.badgeLabel.toUpperCase()}
          </span>
          {fit.fhaLimitInfo?.verify && (
            <span
              style={{
                fontSize: '8px',
                fontWeight: 700,
                padding: '0 4px',
                borderRadius: '4px',
                background: 'rgba(52, 41, 42, 0.08)',
                color: '#34292A'
              }}
            >
              VERIFY
            </span>
          )}
        </span>
        {shortFlagSummary && (
          <span
            style={{
              fontSize: '10px',
              color: 'rgba(52, 41, 42, 0.72)',
              lineHeight: 1.3
            }}
          >
            {shortFlagSummary}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: '#FAF8F5',
        border: '1px solid rgba(52, 41, 42, 0.12)',
        borderRadius: '10px',
        padding: '12px 14px',
        fontFamily: "'Montserrat', sans-serif"
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: fit.reasons.length > 0 ? '8px' : 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(52, 41, 42, 0.65)'
            }}
          >
            Live-in Plan (FHA) Check
          </span>
          <span
            style={{
              ...badgeStyle,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 9px',
              borderRadius: '999px',
              fontSize: '9.5px',
              fontWeight: 600,
              letterSpacing: '0.07em',
              textTransform: 'uppercase'
            }}
          >
            <span>{fit.fits ? '✓' : '✕'}</span>
            <span>{fit.badgeLabel}</span>
          </span>
        </div>

        {fit.fhaLimitInfo?.verify && (
          <span
            style={{
              fontSize: '9px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '2px 7px',
              borderRadius: '999px',
              background: 'rgba(189, 211, 226, 0.35)',
              color: '#34292A',
              border: '1px solid rgba(133, 157, 206, 0.5)'
            }}
          >
            Verify county/unit FHA limit
          </span>
        )}
      </div>

      {fit.reasons.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: '5px'
          }}
        >
          {fit.reasons.map((r) => {
            let dotColor = '#3F5A3A';
            let textColor = '#34292A';
            let tag = null;
            if (r.type === 'blocker') {
              dotColor = '#41101B';
              textColor = '#41101B';
            } else if (r.type === 'caution') {
              dotColor = '#5C75A8';
            } else if (r.type === 'bonus') {
              dotColor = '#3F5A3A';
              tag = 'BONUS';
            }

            return (
              <li
                key={r.key}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '7px',
                  fontSize: '11.5px',
                  lineHeight: 1.45,
                  color: textColor
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                    transform: 'translateY(-1px)'
                  }}
                />
                <span>{r.text}</span>
                {tag && (
                  <span
                    style={{
                      fontSize: '8.5px',
                      fontWeight: 700,
                      letterSpacing: '0.07em',
                      padding: '1px 6px',
                      borderRadius: '999px',
                      background: 'rgba(63, 90, 58, 0.12)',
                      color: '#3F5A3A'
                    }}
                  >
                    {tag}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showDisclaimer && (
        <div
          style={{
            marginTop: '8px',
            paddingTop: '7px',
            borderTop: '1px solid rgba(52, 41, 42, 0.08)',
            fontSize: '10.5px',
            color: 'rgba(52, 41, 42, 0.62)',
            fontStyle: 'italic'
          }}
        >
          {LIVE_IN_PLAN_DISCLAIMER}
        </div>
      )}
    </div>
  );
}

