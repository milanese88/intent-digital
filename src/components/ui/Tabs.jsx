import React from 'react';

/**
 * Universal Tabs component
 * 
 * Variants:
 * - 'on-dark': Sits on the bottom edge of dark espresso hero bands.
 *             Selected tab connects seamlessly to the page below with var(--cream) background.
 * - 'light': Underline / pill tabs for pages and sub-views.
 */
export default function Tabs({
  tabs = [],
  activeTab,
  onChange,
  variant = 'light', // 'light' | 'on-dark'
  className = '',
  style = {}
}) {
  const isOnDark = variant === 'on-dark';

  return (
    <div
      role="tablist"
      className={`ui-tabs ui-tabs-${variant} ${className}`}
      style={{
        display: 'flex',
        gap: isOnDark ? '4px' : '8px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        borderBottom: isOnDark ? 'none' : '1px solid var(--border)',
        marginBottom: isOnDark ? '-1px' : 'var(--space-24)',
        ...style
      }}
    >
      {tabs.map((tab) => {
        const isSelected = tab.id === activeTab;

        if (isOnDark) {
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isSelected}
              type="button"
              onClick={() => onChange && onChange(tab.id)}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-label-lg)',
                fontWeight: 600,
                letterSpacing: 'var(--letter-spacing-pill)',
                textTransform: 'uppercase',
                padding: '14px 22px',
                borderRadius: '12px 12px 0 0',
                border: '1px solid transparent',
                borderBottom: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                backgroundColor: isSelected ? 'var(--cream)' : 'transparent',
                color: isSelected ? 'var(--espresso)' : 'var(--eyebrow-on-dark)',
                opacity: isSelected ? 1 : 0.75,
                borderColor: isSelected ? 'rgba(228, 221, 211, 0.8)' : 'transparent',
                boxShadow: isSelected ? '0 -4px 16px rgba(0, 0, 0, 0.06)' : 'none',
                outline: 'none'
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.opacity = '0.75';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {tab.label}
            </button>
          );
        }

        // Light variant
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isSelected}
            type="button"
            onClick={() => onChange && onChange(tab.id)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: isSelected ? '2px solid var(--burgundy)' : '2px solid transparent',
              padding: '12px 16px',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: isSelected ? 700 : 500,
              letterSpacing: '0.04em',
              color: isSelected ? 'var(--espresso)' : 'var(--muted)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease',
              outline: 'none',
              marginBottom: '-1px'
            }}
            onMouseEnter={(e) => {
              if (!isSelected) e.currentTarget.style.color = 'var(--espresso)';
            }}
            onMouseLeave={(e) => {
              if (!isSelected) e.currentTarget.style.color = 'var(--muted)';
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
