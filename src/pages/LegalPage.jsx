import React, { useEffect } from 'react';
import { Button } from '../components/ui/index.js';
import { BRAND_NAME, LEGAL_ENTITY_NAME } from '../config/legal.js';
import '../styles/florencia-home.css';

export default function LegalPage({ docType = 'terms', navigateTo }) {
  const isPrivacy = docType === 'privacy';
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    document.title = isPrivacy
      ? 'Privacy Policy — Florencia Nuñez'
      : 'Terms of Use — Florencia Nuñez';
  }, [isPrivacy]);

  return (
    <div className="florencia-home">
      <header className="fl-header">
        <div className="fl-container fl-header-inner">
          <a
            href="/"
            className="fl-wordmark"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              if (navigateTo) navigateTo('home');
            }}
          >
            Florencia<em className="fl-wordmark-period">.</em>
          </a>

          <Button
            variant="secondary"
            size="sm"
            href="/"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              if (navigateTo) navigateTo('home');
            }}
          >
            &larr; Back home
          </Button>
        </div>
      </header>

      <main className="fl-section">
        <div className="fl-container" style={{ maxWidth: '760px' }}>
          <span className="fl-section-eyebrow">
            {BRAND_NAME.toUpperCase()} &middot; LEGAL
          </span>
          <h1 className="fl-h2" style={{ marginBottom: '28px' }}>
            {isPrivacy ? (
              <>
                Privacy <em>policy.</em>
              </>
            ) : (
              <>
                Terms of <em>use.</em>
              </>
            )}
          </h1>

          {isPrivacy ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', color: 'var(--text-2)', fontSize: '15px', lineHeight: 1.72 }}>
              <p>
                {LEGAL_ENTITY_NAME} (&ldquo;{BRAND_NAME}&rdquo;, Florencia Nu&ntilde;ez) respects your privacy. When you subscribe to the newsletter on this website, we collect your email address, timestamp, and the consent text shown at signup solely to send occasional editorial notes.
              </p>
              <p>
                We do not sell, rent, or trade subscriber email addresses. You may unsubscribe at any time via any dispatch or by contacting the studio directly.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', color: 'var(--text-2)', fontSize: '15px', lineHeight: 1.72 }}>
              <p>
                All design concepts, photographs, text, and case studies published on this website by {LEGAL_ENTITY_NAME} (&ldquo;{BRAND_NAME}&rdquo;, Florencia Nu&ntilde;ez) are provided for editorial and educational purposes only.
              </p>
              <p>
                Real estate numbers, renovation budgets, and value estimates shared on this site are personal learning studies and do not constitute a real estate listing, formal appraisal, brokerage solicitation, legal advice, or financial offer.
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="fl-footer">
        <div className="fl-container fl-footer-inner">
          <p className="fl-footer-line">
            &copy; {currentYear} {BRAND_NAME} &middot; Florencia Nu&ntilde;ez &middot; All rights reserved
          </p>
        </div>
      </footer>
    </div>
  );
}
