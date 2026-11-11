import React, { useEffect } from 'react';
import { Button, Card, Eyebrow, Pill } from '../components/ui/index.js';

export default function LearningLab({ navigateTo }) {
  useEffect(() => {
    // If user has active session, automatically go straight to the protected dashboard tab
    fetch('/api/verify')
      .then(res => {
        if (res.ok) {
          if (typeof window !== 'undefined') {
            window.location.href = '/admin?tab=learning-lab';
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleEnterLab = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/admin?tab=learning-lab';
    }
  };

  return (
    <div style={{
      backgroundColor: 'var(--cream, #FAF8F5)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      color: 'var(--espresso, #1E1509)'
    }}>
      {/* Top Bar */}
      <header style={{
        padding: '24px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src="/intent-digital-logo-web.png"
            alt="Intent Digital"
            style={{ width: '36px', height: '36px', objectFit: 'contain' }}
          />
          <span style={{
            fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
            fontSize: '13px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--espresso)'
          }}>
            Intent Digital
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            if (navigateTo) {
              navigateTo('admin');
            } else {
              window.location.href = '/admin';
            }
          }}
          style={{
            background: 'none',
            border: 'none',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--burgundy, #41101B)',
            cursor: 'pointer'
          }}
        >
          ← Return to Dashboard
        </button>
      </header>

      {/* Main Content */}
      <main style={{
        flex: 1,
        maxWidth: '880px',
        width: '100%',
        margin: '0 auto',
        padding: '80px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box'
      }}>
        {/* Handwritten Script Accent */}
        <div style={{ marginBottom: '16px' }}>
          <span style={{
            fontFamily: "var(--font-script, 'Dreams on Paper', cursive)",
            fontSize: '32px',
            color: 'var(--burgundy, #41101B)',
            display: 'inline-block',
            transform: 'rotate(-2deg)'
          }}>
            Private Division
          </span>
        </div>

        {/* Eyebrow */}
        <Eyebrow style={{ marginBottom: '16px' }}>
          THE LEARNING LAB
        </Eyebrow>

        {/* Editorial Serif H1 */}
        <h1 style={{
          fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
          fontSize: 'clamp(40px, 5.5vw, 68px)',
          fontWeight: 400,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          color: 'var(--espresso, #1E1509)',
          margin: '0 0 16px 0'
        }}>
          Sharpen your eye.<br />
          <span style={{ fontStyle: 'italic' }}>Know the numbers.</span>
        </h1>

        {/* Italic Serif Subtitle */}
        <p style={{
          fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
          fontSize: 'clamp(18px, 2.4vw, 24px)',
          fontStyle: 'italic',
          color: 'var(--espresso, #1E1509)',
          maxWidth: '620px',
          lineHeight: 1.45,
          margin: '0 auto 36px auto',
          opacity: 0.9
        }}>
          Daily single-family market deals, 70% rule diagnostics, investing glossary, and architectural principles.
        </p>

        {/* Informative Card */}
        <Card style={{
          padding: '40px',
          maxWidth: '640px',
          width: '100%',
          margin: '0 auto 40px auto',
          textAlign: 'left'
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
            fontSize: '22px',
            fontWeight: 400,
            margin: '0 0 12px 0',
            color: 'var(--espresso)'
          }}>
            Owner & Investor Workspace
          </h3>
          <p style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '14.5px',
            lineHeight: 1.7,
            color: 'var(--text-2, #4A413A)',
            margin: '0 0 20px 0'
          }}>
            The Learning Lab is Intent Digital’s private analytical suite. Evaluate Broward single-family sales against 1-mile comps, test your valuation instincts with real-time ARV diagnostics, and master design principles you can apply directly to client rooms.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Pill variant="neutral">DEAL OF THE DAY</Pill>
            <Pill variant="neutral">INVESTING TERMS</Pill>
            <Pill variant="neutral">DESIGN PRINCIPLES</Pill>
            <Pill variant="neutral">GUESS THE VALUE</Pill>
          </div>
        </Card>

        {/* Launch Button */}
        <div>
          <Button
            variant="primary"
            size="lg"
            onClick={handleEnterLab}
          >
            ENTER THE LEARNING LAB →
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '24px 32px',
        textAlign: 'center',
        borderTop: '1px solid var(--border)',
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        color: 'var(--muted)'
      }}>
        Intent Digital · Proprietary & Confidential
      </footer>
    </div>
  );
}
