import React from 'react';

/**
 * Section-level React error boundary.
 * A render/effect failure inside the wrapped section shows a friendly card instead of
 * blanking the whole page. The real error is logged to the console and (best effort)
 * to the server via /api/log/client-error. Never sends property owner data — only the
 * section name, error message/stack and component stack.
 */
export function reportClientError(section, error, componentStack = '') {
  const payload = {
    section: String(section || 'unknown').slice(0, 80),
    message: String(error?.message || error || 'Unknown error').slice(0, 500),
    stack: String(error?.stack || '').slice(0, 4000),
    componentStack: String(componentStack || '').slice(0, 4000),
    url: typeof window !== 'undefined' ? window.location.pathname : '',
    at: new Date().toISOString()
  };
  console.error(`[ErrorBoundary:${payload.section}]`, error, componentStack);
  try {
    if (typeof fetch === 'function') {
      fetch('/api/log/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {});
    }
  } catch {
    // logging must never throw
  }
  return payload;
}

export default class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportClientError(this.props.section, error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Reset when the parent switches to a different property / row
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  handleRetry() {
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { label = 'this part', onBack = null, backLabel = 'Go back' } = this.props;
    return (
      <div
        role="alert"
        style={{
          backgroundColor: '#FAF8F5',
          border: '1px solid rgba(52, 41, 42, 0.18)',
          borderRadius: '18px',
          padding: '22px 24px',
          margin: '12px 0',
          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
          color: '#34292A'
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-heading, "Cormorant Garamond", Georgia, serif)',
            fontSize: '22px',
            marginBottom: '6px'
          }}
        >
          Couldn&rsquo;t load {label}
        </div>
        <p style={{ margin: '0 0 14px 0', fontSize: '12.5px', color: 'rgba(52, 41, 42, 0.72)' }}>
          Details logged. The rest of the page still works — try again, or enter the numbers manually.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: '7px 14px',
              borderRadius: '999px',
              border: '1px solid #34292A',
              backgroundColor: '#34292A',
              color: '#FAF8F5',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Try again
          </button>
          {typeof onBack === 'function' && (
            <button
              type="button"
              onClick={onBack}
              style={{
                padding: '7px 14px',
                borderRadius: '999px',
                border: '1px solid #859DCE',
                backgroundColor: '#BDD3E2',
                color: '#34292A',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {backLabel}
            </button>
          )}
        </div>
      </div>
    );
  }
}

