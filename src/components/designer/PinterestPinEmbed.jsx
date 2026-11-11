import React, { useEffect, useRef, useState } from 'react';
import { buildPinterestWidgets } from '../../utils/pinterest.js';

/**
 * PinterestPinEmbed renders Pinterest's official embedPin widget
 * with a responsive container and an 8-second timeout fallback.
 *
 * Pattern:
 * <a data-pin-do="embedPin" data-pin-width="medium" href="PIN_URL"></a>
 */
export default function PinterestPinEmbed({ pin, onDelete }) {
  const containerRef = useRef(null);
  const [isRendered, setIsRendered] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  useEffect(() => {
    buildPinterestWidgets();

    const checkInterval = setInterval(() => {
      if (containerRef.current) {
        const iframe = containerRef.current.querySelector('iframe');
        const span = containerRef.current.querySelector('[data-pin-log="embed_pin"]');
        if (iframe || span) {
          setIsRendered(true);
          clearInterval(checkInterval);
        }
      }
    }, 250);

    const timer = setTimeout(() => {
      clearInterval(checkInterval);
      if (containerRef.current) {
        const iframe = containerRef.current.querySelector('iframe');
        const span = containerRef.current.querySelector('[data-pin-log="embed_pin"]');
        if (!iframe && !span) {
          setHasTimedOut(true);
        } else {
          setIsRendered(true);
        }
      } else {
        setHasTimedOut(true);
      }
    }, 8000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timer);
    };
  }, [pin.pin_url]);

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: 'var(--white, #FFFFFF)',
        border: '1px solid #E4DDD3',
        boxShadow: '0 2px 8px rgba(30, 21, 9, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gridColumn: 'span 1',
        gridRow: 'span 2',
        minHeight: '256px',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 6px 18px rgba(30, 21, 9, 0.12)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(30, 21, 9, 0.06)';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {/* Delete / remove button */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(pin);
          }}
          title="Remove pin"
          aria-label="Remove pin"
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            zIndex: 15,
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: 'rgba(30, 21, 9, 0.75)',
            color: '#FFFFFF',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            lineHeight: 1,
            transition: 'background-color 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--burgundy, #41101B)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(30, 21, 9, 0.75)';
          }}
        >
          &times;
        </button>
      )}

      {/* Widget container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          display: hasTimedOut ? 'none' : 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '12px 8px',
          overflow: 'hidden'
        }}
      >
        <a
          data-pin-do="embedPin"
          data-pin-width="medium"
          href={pin.pin_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--burgundy)',
            textDecoration: 'none'
          }}
        >
          Loading Pinterest Pin...
        </a>
      </div>

      {/* 8-second fallback card */}
      {hasTimedOut && (
        <div
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            minHeight: '220px',
            backgroundColor: 'var(--sand, #F7F3EE)'
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'var(--white)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--burgundy)'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
            </svg>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--muted)'
            }}
          >
            Pinterest Pin
          </span>
          <a
            href={pin.pin_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'var(--burgundy)',
              color: 'var(--cream)',
              textDecoration: 'none',
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.04em'
            }}
          >
            Open on Pinterest &rarr;
          </a>
        </div>
      )}

      {/* Note footer if present */}
      {pin.note && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--sand, #F7F3EE)',
            borderTop: '1px solid var(--border)',
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            color: 'var(--espresso)',
            lineHeight: 1.4
          }}
        >
          {pin.note}
        </div>
      )}
    </div>
  );
}
