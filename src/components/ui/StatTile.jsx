import React from 'react';

/**
 * Universal StatTile component
 * Displays key analytical metrics with serif display numbers and sans uppercase labels.
 */
export default function StatTile({
  label,
  value,
  subtext,
  surface = 'white', // 'white' | 'sand'
  className = '',
  style = {},
  ...rest
}) {
  const baseStyle = {
    backgroundColor: surface === 'sand' ? 'var(--sand)' : '#ffffff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-tile)',
    padding: 'var(--space-20)',
    boxShadow: 'var(--shadow-subtle)',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    ...style
  };

  return (
    <div className={`ui-stat-tile ${className}`} style={baseStyle} {...rest}>
      <span style={{
        display: 'block',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-label)',
        fontWeight: 700,
        letterSpacing: 'var(--letter-spacing-label)',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        marginBottom: 'var(--space-8)'
      }}>
        {label}
      </span>

      <span style={{
        fontFamily: 'var(--font-display)',
        fontSize: '32px',
        fontWeight: 400,
        color: 'var(--espresso)',
        lineHeight: 1.15
      }}>
        {value}
      </span>

      {subtext && (
        <span style={{
          marginTop: 'var(--space-8)',
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          color: 'var(--text-2)'
        }}>
          {subtext}
        </span>
      )}
    </div>
  );
}
