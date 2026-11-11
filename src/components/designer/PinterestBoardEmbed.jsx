import React, { useEffect, useRef, useState } from 'react';
import { buildPinterestWidgets } from '../../utils/pinterest.js';

/**
 * PinterestBoardEmbed renders Pinterest's official embedBoard widget
 * with a responsive container and an 8-second timeout fallback.
 *
 * For section URLs, Pinterest often only embeds full boards, so if the
 * widget doesn't render within 8 seconds, it shows the tailored fallback card:
 * section title + "Open on Pinterest →" + small note
 * "Pinterest only embeds full boards — showing a link to this section."
 *
 * Pattern:
 * <a data-pin-do="embedBoard" data-pin-board-width="400" data-pin-scale-height="240" data-pin-scale-width="80" href="...">
 */
export default function PinterestBoardEmbed({ boardUrl, title, kind }) {
  const containerRef = useRef(null);
  const [, setIsRendered] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  useEffect(() => {
    // Trigger PinUtils.build() whenever this embed mounts or URL changes
    buildPinterestWidgets();

    // Check periodically for widget hydration (Pinterest transforms the <a> into an iframe/span)
    const checkInterval = setInterval(() => {
      if (containerRef.current) {
        const iframe = containerRef.current.querySelector('iframe');
        const span = containerRef.current.querySelector('[data-pin-log="embed_board"]');
        if (iframe || span) {
          setIsRendered(true);
          clearInterval(checkInterval);
        }
      }
    }, 250);

    // 8-second fallback timeout
    const timer = setTimeout(() => {
      clearInterval(checkInterval);
      if (containerRef.current) {
        const iframe = containerRef.current.querySelector('iframe');
        const span = containerRef.current.querySelector('[data-pin-log="embed_board"]');
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
  }, [boardUrl]);

  const isSection = kind === 'section';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '260px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '14px',
        overflow: 'hidden',
        backgroundColor: 'var(--cream, #FAF8F5)'
      }}
    >
      {/* Official Pinterest widget anchor */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          display: hasTimedOut ? 'none' : 'flex',
          justifyContent: 'center',
          overflowX: 'auto',
          padding: '12px 0'
        }}
      >
        <a
          data-pin-do="embedBoard"
          data-pin-board-width="400"
          data-pin-scale-height="240"
          data-pin-scale-width="80"
          href={boardUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--burgundy)',
            textDecoration: 'none'
          }}
        >
          {title || (isSection ? 'Loading Board Section...' : 'Loading Pinterest Board...')}
        </a>
      </div>

      {/* 8-second timeout fallback card */}
      {hasTimedOut && (
        <div
          style={{
            width: '100%',
            padding: '32px 24px',
            backgroundColor: 'var(--sand, #F7F3EE)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'var(--white)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--burgundy)'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
            </svg>
          </div>
          <div style={{ maxWidth: '340px' }}>
            <h4
              style={{
                margin: '0 0 6px 0',
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--espresso)'
              }}
            >
              {title || (isSection ? 'Board Section' : 'Pinterest Board')}
            </h4>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                color: 'var(--muted)',
                lineHeight: 1.5
              }}
            >
              {isSection
                ? 'Pinterest only embeds full boards — showing a link to this section.'
                : 'The Pinterest widget preview could not be rendered. Click below to view the full inspiration board directly.'}
            </p>
          </div>
          <a
            href={boardUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'var(--burgundy)',
              color: 'var(--cream)',
              textDecoration: 'none',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              transition: 'background-color 0.2s ease'
            }}
          >
            Open on Pinterest →
          </a>
        </div>
      )}
    </div>
  );
}
