import React, { useEffect } from 'react';

/**
 * Universal SidePanel component
 * Standardized right-side slide-in drawer for forms, editors, and inspectors.
 */
export default function SidePanel({
  isOpen,
  onClose,
  eyebrow,
  title,
  children,
  footer,
  width = '540px',
  className = '',
  style = {}
}) {
  // ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose && onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="ui-sidepanel-overlay"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(27, 19, 13, 0.48)',
          backdropFilter: 'blur(2px)',
          zIndex: 999
        }}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Panel'}
        className={`ui-sidepanel ${className}`}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: width,
          maxWidth: '100vw',
          backgroundColor: '#ffffff',
          boxShadow: '-8px 0 36px rgba(27, 19, 13, 0.22)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          overflow: 'hidden',
          ...style
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px 30px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--cream)',
          flexShrink: 0
        }}>
          <div>
            {eyebrow && (
              <span style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: 'var(--letter-spacing-eyebrow)',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: '4px'
              }}>
                {eyebrow}
              </span>
            )}
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '26px',
              fontWeight: 400,
              color: 'var(--espresso)',
              margin: 0,
              lineHeight: 1.2
            }}>
              {title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '26px',
              lineHeight: 1,
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: '10px',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-pill)',
              transition: 'color 0.15s ease, background 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--espresso)';
              e.currentTarget.style.backgroundColor = 'rgba(27, 19, 13, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--muted)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            &times;
          </button>
        </div>

        {/* Scrollable content body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '30px',
          boxSizing: 'border-box'
        }}>
          {children}
        </div>

        {/* Optional sticky footer */}
        {footer && (
          <div style={{
            padding: '20px 30px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--cream)',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0
          }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
