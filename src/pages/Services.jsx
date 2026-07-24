import React, { useState } from 'react';
import AnnouncementBanner from '../components/AnnouncementBanner';
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
      <AnnouncementBanner />
      {/* SERVICES PAGE HERO — REFERENCE LAYOUT */}
      <section className="services-split-hero services-split-hero-v2">
        {/* Nav Bar — Full Width */}
        <div className="services-hero-nav-bar">
          <a href="#" className="services-seal-link" onClick={(e) => handleNavClick(e, 'home')}>
            <img src="/seal-logo.png" alt="Intent Digital Seal" className="services-seal-img" />
          </a>
          <div className="services-nav-links desktop-only">
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'about')}>ABOUT</a>
            <a href="#" className="nav-link active" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
          </div>
          <div className="mobile-only" style={{ marginLeft: 'auto' }}>
            <button 
              className="mobile-toggle-btn" 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="mobile-nav-drawer" style={{ position: 'relative', top: 0, width: '100%' }}>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'home')}>HOME</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'about')}>ABOUT</a>
            <a href="#" className="mobile-nav-link active" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'home', 'portfolio')}>CLIENT WORK</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
          </div>
        )}

        {/* Two-Column Hero Split */}
        <div className="services-hero-split-grid">
          {/* LEFT: Hero Image */}
          <div className="services-hero-img-panel">
            <img 
              src="/services-hero-writing.jpg" 
              alt="Creative branding strategist writing at desk" 
              className="services-hero-staircase-img" 
            />
            <div className="services-hero-img-overlay"></div>
          </div>

          {/* RIGHT: Dark Content Panel */}
          <div className="services-hero-dark-panel">
            <p className="services-hero-label">
              COMPREHENSIVE BRAND SERVICES<br />
              <span>INCLUDING BRAND IDENTITY, WEBSITE DESIGN, CONTENT DIRECTION</span>
            </p>
            <h1 className="services-hero-headline">
              More than visuals, branding that makes an impact.
            </h1>
            <p className="services-hero-italic-copy">
              You don't need just a brand that looks good — you need one that connects, inspires, and drives success. A brand that tells your story with clarity, builds recognition and trust, and gives you the confidence to show up boldly.
            </p>
            <a href="#" className="btn services-hero-cta-outline" onClick={(e) => handleNavClick(e, 'contact')}>
              Yes! I'm so ready &nbsp;&rarr;
            </a>
          </div>
        </div>
      </section>

      {/* THE SERVICES LIST */}
      <section className="services-section">
        <div className="container">
          <div className="services-offerings-grid">
            {/* 01 - Brand Strategy */}
            <div className="offering-card">
              <div className="offering-num">01</div>
              <h2 className="offering-name">Brand Strategy</h2>
              <p className="offering-tagline">The thinking behind the beauty.</p>
              <p className="offering-desc">
                Before a single color is chosen, we define who your brand is, who it's for, and what makes it unforgettable. Strategy is the foundation everything else is built on.
              </p>
            </div>

            {/* 02 - Visual Identity */}
            <div className="offering-card">
              <div className="offering-num">02</div>
              <h2 className="offering-name">Visual Identity</h2>
              <p className="offering-tagline">Your brand, made visible.</p>
              <p className="offering-desc">
                Logos, color, typography, and a cohesive visual system — designed to feel authentic and stay consistent everywhere your brand appears, complete with brand guidelines to keep it that way.
              </p>
            </div>

            {/* 03 - Messaging & Voice */}
            <div className="offering-card">
              <div className="offering-num">03</div>
              <h2 className="offering-name">Messaging &amp; Voice</h2>
              <p className="offering-tagline">The words that sound like you.</p>
              <p className="offering-desc">
                We shape a voice and message that's clear, confident, and unmistakably yours — so your brand doesn't just look considered, it reads that way too.
              </p>
            </div>

            {/* 04 - Web Architecture */}
            <div className="offering-card">
              <div className="offering-num">04</div>
              <h2 className="offering-name">Web Architecture</h2>
              <p className="offering-tagline">A digital home with intention.</p>
              <p className="offering-desc">
                Thoughtful, beautiful websites that turn your identity into an experience — designed to feel like your brand and invite visitors to explore, connect, and reach out.
              </p>
            </div>

            {/* 05 - Content Creation */}
            <div className="offering-card offering-card-full">
              <div className="offering-num">05</div>
              <h2 className="offering-name">Content Creation</h2>
              <p className="offering-tagline">Keeping your brand alive.</p>
              <p className="offering-desc">
                Professional photography, headshots, product and social content, and content guidelines — created in your visual language on an ongoing retainer, so your brand always looks its best.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* THE PROCESS SECTION */}
      <section className="why-section">
        <div className="container">
          <div className="section-header center">
            <span className="section-tagline">THE PROCESS</span>
            <h2 className="section-title">What working together looks like.</h2>
            <p className="section-subtext" style={{ maxWidth: '780px', margin: '16px auto 0 auto' }}>
              We keep things clear and intentional from the very first call. Here's the journey we'll take together:
            </p>
          </div>

          <div className="process-timeline-list">
            <div className="process-step-item">
              <div className="process-step-num">01</div>
              <div className="process-step-info">
                <h3 className="process-step-title">Discovery</h3>
                <p className="process-step-desc">A first conversation to understand your vision and make sure we're the right fit.</p>
              </div>
            </div>

            <div className="process-step-item">
              <div className="process-step-num">02</div>
              <div className="process-step-info">
                <h3 className="process-step-title">Proposal</h3>
                <p className="process-step-desc">A tailored plan and scope, shaped around your brand.</p>
              </div>
            </div>

            <div className="process-step-item">
              <div className="process-step-num">03</div>
              <div className="process-step-info">
                <h3 className="process-step-title">Agreement</h3>
                <p className="process-step-desc">Contract signed and your place reserved on our calendar.</p>
              </div>
            </div>

            <div className="process-step-item">
              <div className="process-step-num">04</div>
              <div className="process-step-info">
                <h3 className="process-step-title">Onboarding</h3>
                <p className="process-step-desc">We walk you through exactly what to expect before we begin.</p>
              </div>
            </div>

            <div className="process-step-item">
              <div className="process-step-num">05</div>
              <div className="process-step-info">
                <h3 className="process-step-title">Design</h3>
                <p className="process-step-desc">Where your brand takes shape, crafted detail by detail.</p>
              </div>
            </div>

            <div className="process-step-item">
              <div className="process-step-num">06</div>
              <div className="process-step-info">
                <h3 className="process-step-title">Refinement</h3>
                <p className="process-step-desc">We review and perfect together, until it feels just right.</p>
              </div>
            </div>

            <div className="process-step-item">
              <div className="process-step-num">07</div>
              <div className="process-step-info">
                <h3 className="process-step-title">Delivery</h3>
                <p className="process-step-desc">Your complete brand, ready to share with the world.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING CTA SECTION */}
      <section className="cta-banner-section">
        <div className="container cta-banner-container">
          <h2 className="cta-banner-title">Ready to build something worth remembering?</h2>
          <p className="cta-banner-subtext">
            Tell us about your brand and where you want to take it — we'll guide the rest, with intention every step of the way.
          </p>
          <a href="#" className="btn btn-cta-banner" onClick={(e) => handleNavClick(e, 'contact')}>
            Start your project &rarr;
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer-section">
        <div className="container footer-container">
          <div className="footer-grid-layout">
            <div className="footer-col-left">
              <img src="/intent-script-logo.png" alt="Intent Digital" className="footer-script-logo" />
              <p className="footer-agency-tagline">
                Full-service brand + website design studio for ambitious founders.
              </p>
              <p className="footer-quote">
                <em>Pure intention &amp; craft behind every choice.</em>
              </p>
            </div>

            <div className="footer-col-center">
              <div className="footer-seal-wrapper">
                <img src="/seal-logo.png" alt="Intent Digital Seal" className="footer-main-seal" />
              </div>
            </div>

            <div className="footer-col-right">
              <div className="footer-nav-columns">
                <div className="footer-nav-col">
                  <a href="#" onClick={(e) => handleNavClick(e, 'home')}>HOME</a>
                  <a href="#" onClick={(e) => handleNavClick(e, 'about')}>ABOUT</a>
                  <a href="#" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
                  <a href="#" onClick={(e) => handleNavClick(e, 'home', 'portfolio')}>PORTFOLIO</a>
                </div>
                <div className="footer-nav-col">
                  <a href="#" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
                </div>
              </div>
            </div>
          </div>

          <div className="footer-bottom-bar">
            <p className="footer-copy">&copy; 2025 Intent Digital Studio LLC &nbsp;|&nbsp; Fort Lauderdale, FL &nbsp;|&nbsp; All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
