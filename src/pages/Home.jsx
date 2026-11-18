import React, { useState, useEffect } from 'react';
import { Button, Card, DarkBand, ScriptAccent } from '../components/ui/index.js';
import { BRAND_NAME } from '../config/legal.js';
import {
  HOME_CONTENT,
  splitJournalTitle,
  resolveJournalCategory
} from '../content/home.js';
import { newsArticles } from '../data/newsData.js';
import '../styles/florencia-home.css';

function upsertMetaTag(attrName, attrValue, content) {
  if (typeof document === 'undefined' || !content) return;
  let tag = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attrName, attrValue);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function formatJournalDate(rawDate) {
  if (!rawDate) return '';
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return String(rawDate).toUpperCase();
  return parsed
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    .toUpperCase();
}

export default function Home({ navigateTo }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [portraitMissing, setPortraitMissing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Journal posts state (fetched from published blog_posts via /api/news)
  const [journalPosts, setJournalPosts] = useState([]);
  const [totalPublishedCount, setTotalPublishedCount] = useState(0);
  const [journalLoading, setJournalLoading] = useState(true);

  // Newsletter state
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newsletterError, setNewsletterError] = useState('');
  const [newsletterSaved, setNewsletterSaved] = useState(false);

  const {
    seo,
    marquee,
    header,
    hero,
    readTwice,
    system,
    currently,
    series,
    specSheet,
    journal,
    newsletter,
    workWithMe,
    footer
  } = HOME_CONTENT;

  // SEO & Open Graph tags
  useEffect(() => {
    document.title = seo.title;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const ogImgUrl = seo.ogImage?.startsWith('http') ? seo.ogImage : `${origin}${seo.ogImage}`;

    upsertMetaTag('name', 'description', seo.description);
    upsertMetaTag('property', 'og:title', seo.ogTitle || seo.title);
    upsertMetaTag('property', 'og:description', seo.ogDescription || seo.description);
    upsertMetaTag('property', 'og:type', seo.ogType || 'website');
    upsertMetaTag('property', 'og:image', ogImgUrl);
    if (origin) {
      upsertMetaTag('property', 'og:url', `${origin}/`);
    }
    upsertMetaTag('name', 'twitter:card', 'summary_large_image');
    upsertMetaTag('name', 'twitter:title', seo.ogTitle || seo.title);
    upsertMetaTag('name', 'twitter:description', seo.ogDescription || seo.description);
  }, [seo]);

  // Check active Owner Portal session so header displays "STUDIO →" when logged in
  useEffect(() => {
    let active = true;
    fetch('/api/verify', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active) {
          setIsAuthenticated(Boolean(data?.loggedIn));
        }
      })
      .catch(() => {
        if (active) setIsAuthenticated(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  // Fetch 3 latest published blog posts from /api/news
  useEffect(() => {
    let active = true;
    const loadPosts = async () => {
      setJournalLoading(true);
      try {
        const res = await fetch('/api/news');
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (active && Array.isArray(data)) {
            setTotalPublishedCount(data.length);
            setJournalPosts(data.slice(0, 3));
            setJournalLoading(false);
            return;
          }
        }
        // Local plain-vite fallback when serverless /api/news is not mounted
        if (active && !contentType.includes('application/json')) {
          const fallback = newsArticles.map((item) => ({
            id: item.id,
            slug: item.id,
            title: item.title,
            category: item.category,
            published_at: item.date
          }));
          setTotalPublishedCount(fallback.length);
          setJournalPosts(fallback.slice(0, 3));
        }
      } catch {
        if (active) {
          setJournalPosts([]);
          setTotalPublishedCount(0);
        }
      } finally {
        if (active) setJournalLoading(false);
      }
    };

    loadPosts();
    return () => {
      active = false;
    };
  }, []);

  const scrollToSection = (targetId) => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const navOffset = 82;
    const top = el.getBoundingClientRect().top + window.scrollY - navOffset;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  const handleAction = (e, item) => {
    if (!item) return;
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
    if (e) e.preventDefault();
    setMobileMenuOpen(false);

    if (item.route && navigateTo) {
      navigateTo(item.route, item.targetId || null);
      return;
    }
    if (item.targetId) {
      scrollToSection(item.targetId);
    }
  };

  const handleJournalPostClick = (e, slug) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
    e.preventDefault();
    if (navigateTo && slug) {
      navigateTo('news', null, slug);
    }
  };

  const handleNewsletterSubmit = async (e) => {
    e.preventDefault();
    setNewsletterError('');

    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setNewsletterError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          consent_text: newsletter.consentText,
          company_website: honeypot
        })
      });

      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await res.json() : {};

      if (!res.ok) {
        setNewsletterError(
          data?.error || 'Unable to save your subscription right now. Please try again.'
        );
        return;
      }

      setNewsletterSaved(true);
      setEmail('');
    } catch {
      setNewsletterError('Network error — please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Repeat marquee sequence 4x per track for seamless wide-screen loop
  const marqueeLoop = [0, 1, 2, 3];
  const currentYear = new Date().getFullYear();
  const headerAuthCta = isAuthenticated && header.studio ? header.studio : header.login;

  return (
    <div className="florencia-home">
      {/* 2. TOP MARQUEE (ESPRESSO) */}
      <div className="fl-marquee" role="region" aria-label="Site marquee">
        <div className="fl-marquee-track">
          {[false, true].map((isDuplicate) => (
            <div
              key={isDuplicate ? 'dup' : 'main'}
              className="fl-marquee-group"
              aria-hidden={isDuplicate ? 'true' : undefined}
            >
              {marqueeLoop.map((pass) =>
                marquee.items.map((item, idx) => (
                  <React.Fragment key={`${pass}-${idx}`}>
                    <span className={`fl-marquee-item fl-marquee-item--${item.variant}`}>
                      {item.text}
                    </span>
                    <span className="fl-marquee-dot" aria-hidden="true">
                      &middot;
                    </span>
                  </React.Fragment>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 2. HEADER */}
      <header className="fl-header">
        <div className="fl-container fl-header-inner">
          <a
            href="/"
            className="fl-wordmark"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              setMobileMenuOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            {header.wordmark}
            <em className="fl-wordmark-period">{header.wordmarkPeriod}</em>
          </a>

          <nav className="fl-nav" aria-label="Primary">
            {header.nav.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="fl-nav-link"
                onClick={(e) => handleAction(e, item)}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="fl-header-right">
            <a
              href={headerAuthCta.href}
              className={`fl-login-link ${isAuthenticated ? 'fl-login-link--studio' : ''}`}
              onClick={(e) => handleAction(e, headerAuthCta)}
            >
              {headerAuthCta.label}
            </a>

            <button
              type="button"
              className="fl-menu-btn"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="fl-mobile-menu"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
            >
              {mobileMenuOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav id="fl-mobile-menu" className="fl-mobile-drawer" aria-label="Mobile navigation">
            {header.nav.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="fl-mobile-link"
                onClick={(e) => handleAction(e, item)}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">&rarr;</span>
              </a>
            ))}
            <a
              href={headerAuthCta.href}
              className="fl-mobile-link"
              onClick={(e) => handleAction(e, headerAuthCta)}
            >
              <span>{headerAuthCta.label}</span>
              <span aria-hidden="true">&rarr;</span>
            </a>
          </nav>
        )}
      </header>

      <main>
        {/* 3a. HERO — FAINT 40PX GRID */}
        <section className="fl-hero">
          <div className="fl-container fl-hero-grid">
            <div>
              <span className="fl-mono-eyebrow">{hero.monoLabel}</span>

              <h1 className="fl-hero-title">
                <span className="fl-hero-title-line">{hero.headingLine1}</span>
                <em className="fl-hero-title-line">{hero.headingLine2Italic}</em>
              </h1>

              <p className="fl-hero-intro">{hero.intro}</p>

              <div className="fl-hero-actions">
                <Button
                  variant="primary"
                  size="lg"
                  href={hero.primaryCta.href}
                  onClick={(e) => handleAction(e, hero.primaryCta)}
                >
                  {hero.primaryCta.label}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  href={hero.secondaryCta.href}
                  onClick={(e) => handleAction(e, hero.secondaryCta)}
                >
                  {hero.secondaryCta.label}
                </Button>
              </div>
            </div>

            {/* Right: Arched Portrait + Annotations + Measurement Line */}
            <div className="fl-portrait-stage">
              <div className="fl-annot fl-annot--script">
                <ScriptAccent size="md" color="var(--burgundy)">
                  {hero.portrait.annotations.scriptNote}
                </ScriptAccent>
                <span className="fl-annot-leader" aria-hidden="true" />
              </div>

              <div className="fl-annot fl-annot--ppsf">
                <span className="fl-mono-chip">{hero.portrait.annotations.pricePerSqftTag}</span>
              </div>

              <div className="fl-annot fl-annot--palette">
                <span className="fl-mono-chip">
                  <span
                    className="fl-swatch-dot"
                    style={{ backgroundColor: hero.portrait.annotations.paletteHex }}
                    aria-hidden="true"
                  />
                  {hero.portrait.annotations.paletteTag}
                </span>
              </div>

              <div className="fl-arch-frame">
                {!portraitMissing ? (
                  <img
                    src={hero.portrait.src}
                    alt={hero.portrait.alt}
                    fetchPriority="high"
                    decoding="async"
                    className="fl-arch-img"
                    onError={() => setPortraitMissing(true)}
                  />
                ) : (
                  <div
                    className="fl-arch-placeholder"
                    role="img"
                    aria-label={hero.portrait.alt}
                  >
                    <div className="fl-arch-placeholder-inner" aria-hidden="true" />
                    <span className="fl-arch-monogram" aria-hidden="true">
                      F<em>.</em>
                    </span>
                    <span className="fl-arch-placeholder-tag">
                      {hero.portrait.placeholderMono}
                    </span>
                    <span className="fl-arch-placeholder-path">
                      {hero.portrait.placeholderPath}
                    </span>
                  </div>
                )}
              </div>

              <div className="fl-measure">
                <div className="fl-measure-bar" aria-hidden="true">
                  <span className="fl-measure-tick" />
                  <span className="fl-measure-line" />
                  <span className="fl-measure-tick" />
                </div>
                <span className="fl-measure-caption">{hero.portrait.figureCaption}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 3b. "EVERY SPACE, READ TWICE." */}
        <section id="design" className="fl-section">
          <div className="fl-container">
            <div className="fl-read-header">
              <span className="fl-section-eyebrow">{readTwice.eyebrow}</span>
              <h2 className="fl-h2">
                {readTwice.headingLine1} <em>{readTwice.headingLine2Italic}</em>
              </h2>
              <p className="fl-section-lead">{readTwice.subtitle}</p>
            </div>

            <div className="fl-read-grid">
              {/* Left Column: the eye (serif) */}
              <div>
                <div className="fl-lens-col-head">
                  <span className="fl-lens-col-title--eye">{readTwice.eye.heading}</span>
                  <span className="fl-lens-col-tag">{readTwice.eye.tag}</span>
                </div>
                <ul className="fl-lens-list">
                  {readTwice.eye.items.map((item) => (
                    <li key={item.title} className="fl-lens-item">
                      <h3 className="fl-lens-item-title--serif">{item.title}</h3>
                      <p className="fl-lens-item-line">{item.line}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Center Image */}
              <figure className="fl-read-center">
                <div className="fl-read-photo-wrap">
                  <img
                    src={readTwice.image.src}
                    alt={readTwice.image.alt}
                    loading="lazy"
                    decoding="async"
                    className="fl-read-photo"
                  />
                </div>
                <figcaption className="fl-fig-caption">{readTwice.image.caption}</figcaption>
              </figure>

              {/* Right Column: the mind (mono) */}
              <div>
                <div className="fl-lens-col-head">
                  <span className="fl-lens-col-title--mind">{readTwice.mind.heading}</span>
                  <span className="fl-lens-col-tag">{readTwice.mind.tag}</span>
                </div>
                <ul className="fl-lens-list">
                  {readTwice.mind.items.map((item) => (
                    <li key={item.title} className="fl-lens-item">
                      <h3 className="fl-lens-item-title--mono">{item.title}</h3>
                      <p className="fl-lens-item-line">{item.line}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 3c. "I HAVE A SYSTEM. OF COURSE I DO." */}
        <section id="system" className="fl-section fl-section--beige">
          <div className="fl-container">
            <div className="fl-system-top">
              <div>
                <span className="fl-section-eyebrow">{system.eyebrow}</span>
                <h2 className="fl-h2">
                  {system.headingLine1} <em>{system.headingLine2Italic}</em>
                </h2>
              </div>
              <ScriptAccent size="lg" color="var(--burgundy)">
                {system.scriptNote}
              </ScriptAccent>
            </div>

            <div className="fl-ruler" aria-hidden="true">
              <div className="fl-ruler-majors">
                {system.steps.map((step) => (
                  <div key={step.number} className="fl-ruler-major-tick" />
                ))}
              </div>
            </div>

            <div className="fl-steps-grid">
              {system.steps.map((step) => (
                <article key={step.number} className="fl-step-card">
                  <span className="fl-step-num">{step.number}</span>
                  <h3 className="fl-step-title">{step.title}</h3>
                  <p className="fl-step-desc">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 3d. "CURRENTLY…" ESPRESSO BAND */}
        <DarkBand paddingTop="80px" paddingBottom="88px" maxWidth="1152px">
          <div className="fl-currently-top">
            <h2 className="fl-h2 fl-h2--on-dark">
              {currently.headingLine1}
              <em>{currently.headingItalicSuffix}</em>
            </h2>
            <span className="fl-currently-status">
              STATUS &middot; UPDATED {currently.updatedMonthYear}
            </span>
          </div>

          <dl className="fl-currently-dl">
            {currently.items.map((row) => (
              <div key={row.term} className="fl-currently-row">
                <dt className="fl-currently-dt">{row.term}</dt>
                <dd className="fl-currently-dd">{row.definition}</dd>
              </div>
            ))}
          </dl>
        </DarkBand>

        {/* 3e. SERIES — "DESIGN IT, THEN RUN THE NUMBERS." */}
        <section id="real-estate" className="fl-section">
          <div className="fl-container">
            <div className="fl-series-header">
              <span className="fl-section-eyebrow">{series.eyebrow}</span>
              <h2 className="fl-h2">
                {series.headingLine1} <em>{series.headingLine2Italic}</em>
              </h2>
              <p className="fl-section-lead">{series.intro}</p>
            </div>

            <div className="fl-series-pair">
              <figure className="fl-series-figure">
                <div className="fl-series-img-wrap">
                  <img
                    src={series.before.src}
                    alt={series.before.alt}
                    loading="lazy"
                    decoding="async"
                    className="fl-series-img"
                  />
                  <span className="fl-series-badge">{series.before.tag}</span>
                </div>
                <figcaption className="fl-series-figcaption">{series.before.caption}</figcaption>
              </figure>

              <figure className="fl-series-figure">
                <div className="fl-series-img-wrap">
                  <img
                    src={series.after.src}
                    alt={series.after.alt}
                    loading="lazy"
                    decoding="async"
                    className="fl-series-img"
                  />
                  <span className="fl-series-badge fl-series-badge--after">{series.after.tag}</span>
                </div>
                <figcaption className="fl-series-figcaption">{series.after.caption}</figcaption>
              </figure>
            </div>

            <div className="fl-metrics-table" role="table" aria-label="Series study numbers">
              {series.metrics.map((cell) => (
                <div key={cell.label} className="fl-metric-cell" role="cell">
                  <span className="fl-metric-label">{cell.label}</span>
                  <span className="fl-metric-value">{cell.value}</span>
                  <span className="fl-metric-detail">{cell.detail}</span>
                </div>
              ))}
            </div>

            <p className="fl-series-note">{series.note}</p>
          </div>
        </section>

        {/* 3f. SPEC SHEET ("FLORENCIA, ITEMIZED") + "FROM THE JOURNAL" */}
        <section className="fl-section fl-section--beige">
          <div className="fl-container fl-editorial-split">
            {/* Spec Sheet Card */}
            <Card id="about" className="fl-spec-card">
              <span className="fl-section-eyebrow">{specSheet.eyebrow}</span>
              <h2 className="fl-h2">
                {specSheet.headingLine1} <em>{specSheet.headingLine2Italic}</em>
              </h2>

              <dl className="fl-spec-dl">
                {specSheet.items.map((item) => (
                  <div key={item.label} className="fl-spec-row">
                    <dt className="fl-spec-dt">{item.label}</dt>
                    <dd className="fl-spec-dd">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            {/* From the Journal */}
            <div id="journal">
              <div className="fl-journal-head">
                <div>
                  <span className="fl-section-eyebrow">{journal.eyebrow}</span>
                  <h2 className="fl-h2">
                    {journal.headingLine1} <em>{journal.headingLine2Italic}</em>
                  </h2>
                </div>
                <a
                  href="/news"
                  className="fl-journal-all-link"
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) return;
                    e.preventDefault();
                    if (navigateTo) navigateTo(journal.viewAllRoute);
                  }}
                >
                  {journal.viewAllLabel}
                </a>
              </div>

              {journalLoading ? (
                <p className="fl-section-lead">Loading latest entries…</p>
              ) : journalPosts.length === 0 ? (
                <p className="fl-section-lead">{journal.emptyMessage}</p>
              ) : (
                <ol className="fl-journal-list">
                  {journalPosts.map((post, idx) => {
                    const issueNum = Math.max(1, (totalPublishedCount || journalPosts.length) - idx);
                    const formattedIssue = `No. ${String(issueNum).padStart(2, '0')}`;
                    const { firstPart, italicPart } = splitJournalTitle(post.title);
                    const category = resolveJournalCategory(post, journal.defaultCategory);
                    const dateStr = formatJournalDate(post.published_at);

                    return (
                      <li key={post.id || post.slug || idx} className="fl-journal-item">
                        <a
                          href={`/news/${post.slug}`}
                          className="fl-journal-link"
                          onClick={(e) => handleJournalPostClick(e, post.slug)}
                        >
                          <span className="fl-journal-num">{formattedIssue}</span>
                          <div>
                            <h3 className="fl-journal-title">
                              {firstPart}
                              {italicPart ? (
                                <>
                                  {' '}
                                  <em>{italicPart}</em>
                                </>
                              ) : null}
                            </h3>
                            <div className="fl-journal-meta">
                              <span className="fl-journal-cat">{category}</span>
                              {dateStr && <span className="fl-journal-date">{dateStr}</span>}
                            </div>
                          </div>
                          <span className="fl-journal-arrow" aria-hidden="true">
                            &rarr;
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </section>

        {/* 3g. NEWSLETTER CARD (ESPRESSO) + "WORK WITH ME" CARD */}
        <section className="fl-section">
          <div className="fl-container fl-cta-pair">
            {/* Espresso Newsletter Card */}
            <div className="fl-newsletter-card">
              <div>
                <span className="fl-newsletter-eyebrow">{newsletter.eyebrow}</span>
                <h2 className="fl-h2 fl-h2--on-dark">
                  {newsletter.headingLine1} <em>{newsletter.headingLine2Italic}</em>
                </h2>
                <p className="fl-newsletter-desc">{newsletter.description}</p>
              </div>

              {newsletterSaved ? (
                <div className="fl-newsletter-success" role="status" aria-live="polite">
                  <p className="fl-newsletter-success-title">{newsletter.successTitle}</p>
                  <p className="fl-newsletter-success-body">{newsletter.successMessage}</p>
                </div>
              ) : (
                <form className="fl-newsletter-form" onSubmit={handleNewsletterSubmit} noValidate>
                  <div className="fl-hp-wrap" aria-hidden="true">
                    <label htmlFor="fl-company-website">Website</label>
                    <input
                      id="fl-company-website"
                      name="company_website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>

                  <label htmlFor="fl-newsletter-email" className="fl-sr-only">
                    {newsletter.inputLabel}
                  </label>

                  <div className="fl-newsletter-row">
                    <input
                      id="fl-newsletter-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder={newsletter.inputPlaceholder}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (newsletterError) setNewsletterError('');
                      }}
                      disabled={submitting}
                      className="fl-newsletter-input"
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={submitting}
                      style={{ border: '1px solid rgba(250, 248, 245, 0.24)' }}
                    >
                      {submitting ? newsletter.submittingLabel : newsletter.buttonLabel}
                    </Button>
                  </div>

                  {newsletterError && (
                    <div className="fl-newsletter-error" role="alert">
                      {newsletterError}
                    </div>
                  )}

                  <p className="fl-newsletter-consent">{newsletter.consentText}</p>
                </form>
              )}
            </div>

            {/* Work With Me Card */}
            <Card id="work-with-me" featured className="fl-work-card">
              <div>
                <span className="fl-section-eyebrow">{workWithMe.eyebrow}</span>
                <h2 className="fl-h2">
                  {workWithMe.headingLine1} <em>{workWithMe.headingLine2Italic}</em>
                </h2>
                <p className="fl-work-desc">{workWithMe.description}</p>
              </div>

              <div>
                <Button
                  variant="primary"
                  size="lg"
                  href={workWithMe.href}
                  onClick={(e) => handleAction(e, workWithMe)}
                >
                  {workWithMe.buttonLabel}
                </Button>
              </div>
            </Card>
          </div>
        </section>
      </main>

      {/* 3h. FOOTER */}
      <footer className="fl-footer">
        <div className="fl-container fl-footer-inner">
          <p className="fl-footer-line">
            &copy; {currentYear} {BRAND_NAME} &middot; {footer.personName} &middot;{' '}
            {footer.rightsText}
            {footer.links.map((lnk) => (
              <React.Fragment key={lnk.label}>
                {' '}
                &middot;{' '}
                <a
                  href={lnk.href}
                  className="fl-footer-link"
                  onClick={(e) => handleAction(e, lnk)}
                >
                  {lnk.label}
                </a>
              </React.Fragment>
            ))}
          </p>
        </div>
      </footer>
    </div>
  );
}
