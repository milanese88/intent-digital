import React from 'react';

/**
 * Universal SegmentedControl component
 * Replaces ad-hoc toggle pills across search, map/list views, and sub-panels.
 */
export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  className = '',
  style = {}
}) {
  return (
    <div
      role="group"
      className={`ui-segmented-control ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: 'var(--beige)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill)',
        padding: '3px',
        gap: '2px',
        boxSizing: 'border-box',
        ...style
      }}
    >
      {options.map((opt) => {
        const isSelected = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange && onChange(opt.id)}
            style={{
              background: isSelected ? '#ffffff' : 'transparent',
              color: isSelected ? 'var(--espresso)' : 'var(--muted)',
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              padding: size === 'sm' ? '6px 12px' : '8px 18px',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-label)',
              fontWeight: isSelected ? 700 : 500,
              letterSpacing: 'var(--letter-spacing-label)',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: isSelected ? '0 2px 6px rgba(27, 19, 13, 0.08)' : 'none',
              transition: 'all 0.18s cubic-bezier(0.25, 1, 0.5, 1)',
              outline: 'none',
              minHeight: size === 'sm' ? '32px' : '38px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap'
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
