import React, { useState } from 'react';
import '../styles/home.css';

export default function Services({ navigateTo }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (e, page, targetId) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (navigateTo) {
      navigateTo(page, targetId);
    }
  };

  return (
    <div className="home-page services-page">
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="container nav-container">
          <div className="nav-links nav-links-left desktop-only">
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'home', 'why-us')}>ABOUT</a>
            <a href="#" className="nav-link active" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'home', 'portfolio')}>CLIENT WORK</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
          </div>

          <a href="#" className="nav-logo-link" onClick={(e) => handleNavClick(e, 'home')}>
            <img src="/intent-script-logo.png" alt="Intent Digital" className="nav-logo-img" />
          </a>

          <div className="nav-right">
            <a href="#" className="btn btn-nav-cta desktop-only" onClick={(e) => handleNavClick(e, 'contact')}>
              GET STARTED &rarr;
            </a>
            <button 
              className="mobile-toggle-btn" 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="mobile-nav-drawer">
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'home')}>HOME</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'home', 'why-us')}>ABOUT</a>
            <a href="#" className="mobile-nav-link active" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'home', 'portfolio')}>CLIENT WORK</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
            <a href="#" className="btn btn-mobile-cta" onClick={(e) => handleNavClick(e, 'contact')}>
              GET STARTED &rarr;
            </a>
          </div>
        )}
      </nav>

      {/* SERVICES HERO SECTION */}
      <header className="services-hero-section">
        <div className="container">
          <div className="section-header" style={{ marginBottom: '24px' }}>
            <span className="section-tagline">OUR SERVICES &amp; PACKAGES</span>
            <h1 className="section-title" style={{ fontSize: 'clamp(42px, 5.5vw, 64px)' }}>
              Crafted with Intention.<br />Built for Distinction.
            </h1>
          </div>
          <p className="services-hero-subtitle">
            Intent Digital is a boutique branding and web design studio shaping identity, voice, and digital presence for founders who mean business. No recycled templates—every deliverable is custom-crafted to elevate your brand authority.
          </p>
        </div>
      </header>

      {/* WHAT WE OFFER SECTION */}
      <section id="services" className="services-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tagline">WHAT WE OFFER</span>
            <h2 className="section-title">Select the Investment Level Built for Your Brand</h2>
          </div>

          <div className="services-grid">
            {/* Card 1 — Brand Basics */}
            <div className="service-card">
              <div className="card-top">
                <span className="badge-timeline">1&ndash;2 weeks</span>
              </div>
              <h3 className="card-name">Brand Basics</h3>
              <div className="card-price">$1,200 <span className="currency">USD</span></div>
              <p className="card-desc">
                Pre-made, semi-custom brand kits tailored to your brand &mdash; a fast, polished starting point for new ventures and emerging founders.
              </p>
              <hr className="card-divider" />
              <div className="card-includes-label">WHAT'S INCLUDED</div>
              <ul className="card-list">
                <li>Logo suite &amp; brand marks</li>
                <li>Color palette</li>
                <li>Typography</li>
                <li>Business card design</li>
                <li>Social media profile image</li>
                <li>Brand style sheet</li>
              </ul>
              <a href="mailto:hello@intent-digital.com?subject=Inquiry: Brand Basics Package" className="btn btn-card btn-card-basics">
                GET STARTED &rarr;
              </a>
            </div>

            {/* Card 2 — Mini-Brand */}
            <div className="service-card">
              <div className="card-top">
                <span className="badge-timeline">2&ndash;3 weeks</span>
              </div>
              <h3 className="card-name">Mini-Brand</h3>
              <div className="card-price">$4,200 <span className="currency">USD</span></div>
              <p className="card-desc">
                A focused mini branding suite for founders who need clarity and cohesion, fast, without sacrificing bespoke luxury aesthetics.
              </p>
              <hr className="card-divider" />
              <div className="card-includes-label">WHAT'S INCLUDED</div>
              <ul className="card-list">
                <li>Mini branding suite</li>
                <li>Color palette</li>
                <li>Typography</li>
                <li>Brand guideline sheet</li>
              </ul>
              <a href="mailto:hello@intent-digital.com?subject=Inquiry: Mini-Brand Package" className="btn btn-card btn-card-mini">
                GET STARTED &rarr;
              </a>
            </div>

            {/* Card 3 — Photography & Content */}
            <div className="service-card">
              <div className="card-top">
                <span className="badge-timeline">4&ndash;5 weeks</span>
              </div>
              <h3 className="card-name">Photography &amp; Content</h3>
              <div className="card-price">$6,000 <span className="currency">USD</span></div>
              <p className="card-desc">
                Professional photography plus a full content bundle &mdash; everything you need to show up consistently and beautifully across all channels.
              </p>
              <hr className="card-divider" />
              <div className="card-includes-label">WHAT'S INCLUDED</div>
              <ul className="card-list">
                <li>Professional photography + content</li>
                <li>Social media templates</li>
                <li>Branding personality</li>
                <li>Typography</li>
                <li>Colors/patterns/icons</li>
                <li>Full brand guidelines</li>
              </ul>
              <a href="mailto:hello@intent-digital.com?subject=Inquiry: Photography %26 Content Package" className="btn btn-card btn-card-photo">
                GET STARTED &rarr;
              </a>
            </div>

            {/* Card 4 — Full Branding + Website */}
            <div className="service-card">
              <div className="card-top">
                <span className="badge-timeline">8&ndash;10 weeks</span>
              </div>
              <h3 className="card-name">Full Branding + Website</h3>
              <div className="card-price">$12,400 <span className="currency">USD</span></div>
              <p className="card-desc">
                For the founder who wants their brand and website to work beautifully together &mdash; end to end, with zero compromises.
              </p>
              <hr className="card-divider" />
              <div className="card-includes-label">WHAT'S INCLUDED</div>
              <ul className="card-list">
                <li>Discovery call</li>
                <li>Creative direction</li>
                <li>Logo suite &amp; brand marks</li>
                <li>Color palette</li>
                <li>Typography suite</li>
                <li>Brand &amp; strategy guidelines</li>
                <li>Designed &amp; built website</li>
              </ul>
              <a href="mailto:hello@intent-digital.com?subject=Inquiry: Full Branding %2B Website Package" className="btn btn-card btn-card-full">
                GET STARTED &rarr;
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* THE INTENT DIGITAL PROCESS & METHODOLOGY */}
      <section className="why-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tagline">OUR INTENTIONAL METHODOLOGY</span>
            <h2 className="section-title">Why Founders Partner With Intent Digital</h2>
          </div>

          <div className="why-grid">
            <div className="why-col">
              <div className="why-num">01</div>
              <h3 className="why-col-title">Strategy First</h3>
              <p className="why-col-text">
                Every decision is rooted in who you are and who you're for. We don't just design to look pretty; we design to position your business as an undeniable leader in your industry.
              </p>
            </div>

            <div className="why-col">
              <div className="why-num">02</div>
              <h3 className="why-col-title">Done With You</h3>
              <p className="why-col-text">
                A deeply collaborative process so your brand actually feels like you. No handoffs over a brick wall—we work hand-in-hand to build alignment and confidence.
              </p>
            </div>

            <div className="why-col">
              <div className="why-num">03</div>
              <h3 className="why-col-title">Built To Last</h3>
              <p className="why-col-text">
                No recycled templates. Your brand identity and digital presence are crafted custom from scratch, giving you the foundation to scale confidently for years to come.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CUSTOM INQUIRY BANNER */}
      <section className="services-custom-banner">
        <div className="container" style={{ textAlign: 'center', maxWidth: '800px' }}>
          <span className="section-tagline" style={{ color: 'var(--espresso)' }}>NEED A CUSTOM TAILORED SOLUTION?</span>
          <h2 className="section-title" style={{ marginTop: '12px', marginBottom: '20px' }}>
            Looking for something tailored specifically to your brand roadmap?
          </h2>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', opacity: '0.85', marginBottom: '32px' }}>
            We work with established businesses and luxury ventures on custom retainer projects, specialized e-commerce platforms, and visual rebrands.
          </p>
          <a href="mailto:hello@intent-digital.com?subject=Custom%20Brand%20Inquiry" className="btn btn-pill-primary">
            INQUIRE FOR CUSTOM SCOPE &rarr;
          </a>
        </div>
      </section>

      {/* CTA BANNER SECTION */}
      <section className="cta-banner-section">
        <div className="container cta-banner-container">
          <h2 className="cta-banner-title">
            Ready to build something you're proud of?
          </h2>
          <p className="cta-banner-subtext">
            Let's talk about your brand vision, goals, and timeline.
          </p>
          <a href="mailto:hello@intent-digital.com" className="btn btn-cta-banner">
            GET STARTED &rarr;
          </a>
        </div>
      </section>

      {/* FOOTER SECTION */}
      <footer className="footer-section">
        <div className="container footer-container">
          <div className="footer-grid-layout">
            {/* Left Column */}
            <div className="footer-col-left">
              <img src="/intent-script-logo.png" alt="Intent Digital" className="footer-script-logo" />
              <p className="footer-agency-tagline">
                Full-service brand + website design studio for ambitious founders.
              </p>
              <span className="footer-quote">Pure intention &amp; craft behind every choice.</span>
            </div>

            {/* Center Column — Circular Seal Logo & Socials */}
            <div className="footer-col-center">
              <div className="footer-seal-wrapper">
                <img src="/seal-logo.png" alt="Intent Digital Seal" className="footer-main-seal" />
              </div>
              <div className="footer-social-row">
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="social-icon-link" aria-label="Instagram">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                  </svg>
                </a>
                <a href="https://pinterest.com" target="_blank" rel="noopener noreferrer" className="social-icon-link" aria-label="Pinterest">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.65 7.86 6.39 9.27-.09-.79-.17-2 .04-2.87.19-.79 1.22-5.18 1.22-5.18s-.31-.62-.31-1.54c0-1.45.84-2.53 1.89-2.53.89 0 1.32.67 1.32 1.47 0 .9-.57 2.24-.87 3.48-.25 1.04.52 1.88 1.54 1.88 1.85 0 3.28-1.95 3.28-4.77 0-2.49-1.79-4.24-4.35-4.24-2.97 0-4.71 2.23-4.71 4.52 0 .9.34 1.86.77 2.38.08.1.1.19.07.3-.08.33-.26 1.05-.3 1.2-.05.21-.17.26-.39.16-1.46-.68-2.37-2.82-2.37-4.54 0-3.69 2.69-7.09 7.74-7.09 4.06 0 7.22 2.9 7.22 6.77 0 4.04-2.55 7.29-6.09 7.29-1.19 0-2.31-.62-2.69-1.35l-.73 2.79c-.26 1.01-.97 2.27-1.45 3.03C9.9 21.84 10.93 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"></path>
                  </svg>
                </a>
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="social-icon-link" aria-label="Facebook">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                  </svg>
                </a>
              </div>
            </div>

            {/* Right Column */}
            <div className="footer-col-right">
              <div className="footer-nav-columns">
                <div className="footer-nav-col">
                  <a href="#" onClick={(e) => handleNavClick(e, 'home')}>HOME</a>
                  <a href="#" onClick={(e) => handleNavClick(e, 'home', 'why-us')}>ABOUT</a>
                  <a href="#" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
                </div>
                <div className="footer-nav-col">
                  <a href="#" onClick={(e) => handleNavClick(e, 'home', 'portfolio')}>PORTFOLIO</a>
                  <a href="mailto:hello@intent-digital.com">WORK WITH US</a>
                  <a href="mailto:hello@intent-digital.com">CONTACT</a>
                </div>
              </div>
              <div className="footer-cta-wrap">
                <a href="mailto:hello@intent-digital.com" className="btn btn-footer-pill-cta">
                  GET STARTED &rarr;
                </a>
              </div>
            </div>
          </div>

          <div className="footer-bottom-bar">
            <p className="footer-copy">&copy; 2025 Intent Digital Studio LLC | Fort Lauderdale, FL | All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
