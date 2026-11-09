import React from 'react';

/**
 * Universal EmptyState component
 * Clean typographic empty state without emojis.
 */
export default function EmptyState({
  title = 'No items found',
  description,
  action,
  icon,
  className = '',
  style = {}
}) {
  return (
    <div
      className={`ui-empty-state ${className}`}
      style={{
        backgroundColor: '#ffffff',
        border: '1px dashed var(--border)',
        borderRadius: '24px',
        padding: '64px 32px',
        textAlign: 'center',
        maxWidth: '640px',
        margin: '0 auto',
        boxSizing: 'border-box',
        ...style
      }}
    >
      {icon && (
        <div style={{ marginBottom: 'var(--space-16)', display: 'flex', justifyContent: 'center' }}>
          {icon}
        </div>
      )}

      <h3 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '26px',
        fontWeight: 400,
        color: 'var(--espresso)',
        margin: '0 0 10px 0',
        lineHeight: 1.25
      }}>
        {title}
      </h3>

      {description && (
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-body-sm)',
          color: 'var(--muted)',
          lineHeight: 1.6,
          margin: '0 auto 24px auto',
          maxWidth: '460px'
        }}>
          {description}
        </p>
      )}

      {action && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {action}
        </div>
      )}
    </div>
  );
}
