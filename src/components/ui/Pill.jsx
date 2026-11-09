import React from 'react';

/**
 * Universal Pill / Tag component
 * Displays status badges, category tags, and pill chips with WCAG AA contrast.
 * 
 * Variants:
 * - 'neutral': Warm Oat / Beige
 * - 'positive': Muted Forest Green (e.g. Owned, Complete, Zone X)
 * - 'warning': Amber / Ochre (e.g. In Progress, Analyzing)
 * - 'negative': Brick / Crimson (e.g. Passed, SFHA Flood)
 * - 'info': Deep Slate Blue (e.g. In Design, Watchlist)
 */
export default function Pill({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  style = {},
  ...rest
}) {
  const variantStyles = {
    neutral: {
      backgroundColor: 'var(--beige)',
      color: 'var(--espresso)',
      border: '1px solid var(--border)'
    },
    positive: {
      backgroundColor: 'var(--positive-bg)',
      color: 'var(--positive)',
      border: '1px solid rgba(63, 90, 58, 0.22)'
    },
    warning: {
      backgroundColor: 'var(--warning-bg)',
      color: 'var(--warning)',
      border: '1px solid rgba(122, 82, 18, 0.22)'
    },
    negative: {
      backgroundColor: 'var(--negative-bg)',
      color: 'var(--negative)',
      border: '1px solid rgba(138, 42, 30, 0.22)'
    },
    info: {
      backgroundColor: 'var(--info-bg)',
      color: 'var(--info)',
      border: '1px solid rgba(39, 77, 115, 0.22)'
    }
  };

  const selectedVariant = variantStyles[variant] || variantStyles.neutral;

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'var(--font-sans)',
    fontSize: size === 'sm' ? '10px' : 'var(--text-label)',
    fontWeight: 700,
    letterSpacing: 'var(--letter-spacing-label)',
    textTransform: 'uppercase',
    padding: size === 'sm' ? '2px 8px' : '4px 12px',
    borderRadius: 'var(--radius-pill)',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    ...selectedVariant,
    ...style
  };

  return (
    <span className={`ui-pill ui-pill-${variant} ${className}`} style={baseStyle} {...rest}>
      {children}
    </span>
  );
}
