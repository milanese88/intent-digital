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
      {/* SERVICES PAGE NAV */}
      <div className="services-split-hero services-split-hero-v2">
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
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <a 
              href="#" 
              className="desktop-only" 
              onClick={(e) => handleNavClick(e, 'login')}
              style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: '#FAF8F5', fontFamily: 'Montserrat, sans-serif', fontSize: '12px', fontWeight: 500, letterSpacing: '0.05em', marginRight: '20px' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              LOG IN
            </a>
            <button 
              className="mobile-toggle-btn mobile-only" 
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
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'login')}>LOG IN</a>
          </div>
        )}
      </div>

      {/* UNIFIED HERO SECTION */}
      <header className="unified-hero-section theme-dark">
        <div className="container unified-hero-container">
          <div className="unified-hero-content">
            <span className="unified-hero-tagline">ATTRACTING THE CLIENTS YOUR BUSINESS DESERVES</span>
            <h1 className="unified-hero-title">
              Creative design<br />
              <i>for</i> Confident<br />
              Branding
            </h1>
            <p className="unified-hero-subheadline">
              We work closely with you and your brand to develop a new visual identity that propels your business to new levels of polish and success. It's all about honing and evolving a style that feels undeniably "you", one that can be instantly recognised as your business.
            </p>
            <div className="unified-hero-actions">
              <a href="#packages" className="btn btn-cta" onClick={(e) => handleNavClick(e, 'contact')}>
                Inquire Now &rarr;
              </a>
            </div>
          </div>

        </div>
      </header>

      {/* THE SERVICES LIST — 3 CURATED PACKAGES */}
      <section className="services-section">
        <div className="container">
          <div className="global-section-header">
            <span className="global-section-tagline">CURATED OFFERINGS</span>
            <h2 className="global-section-title">Designed for distinction, crafted for growth.</h2>
          </div>

          <div className="services-packages-grid">
            {/* PACKAGE 01 - BRANDING */}
            <div className="package-card">
              <div className="package-card-header">
                <div className="package-num">01</div>
                <h3 className="package-title">Branding</h3>
                <p className="package-desc">
                  For the visionary founder seeking a comprehensive brand identity packed with every strategic advantage and elevated detail.
                </p>
              </div>

              <div className="package-deliverables">
                <span className="deliverables-heading">INCLUDES:</span>
                <ul className="deliverables-list">
                  <li><span className="deliv-bullet">•</span> Brand Personality</li>
                  <li><span className="deliv-bullet">•</span> Full logo suite</li>
                  <li><span className="deliv-bullet">•</span> Typography</li>
                  <li><span className="deliv-bullet">•</span> Colors</li>
                  <li><span className="deliv-bullet">•</span> Patterns</li>
                  <li><span className="deliv-bullet">•</span> Icons</li>
                  <li><span className="deliv-bullet">•</span> Social media templates</li>
                  <li><span className="deliv-bullet">•</span> Brand guidelines</li>
                </ul>
              </div>

              <div className="package-card-footer">
                <a href="#" className="btn btn-package-inquire" onClick={(e) => handleNavClick(e, 'contact')}>
                  Inquire &nbsp;&rarr;
                </a>
              </div>
            </div>

            {/* PACKAGE 02 - WEBSITE + BRANDING */}
            <div className="package-card package-card-featured">
              <div className="package-card-header">
                <img 
                  src="/best-seller-angel.png" 
                  alt="Best Seller" 
                  className="package-best-seller-angel" 
                />
                <div className="package-num">02</div>
                <h3 className="package-title">Website + Branding</h3>
                <p className="package-desc">
                  Everything in the Branding package + a custom website designed for seamless user experience and maximum conversion.
                </p>
              </div>

              <div className="package-deliverables">
                <span className="deliverables-heading">INCLUDES:</span>
                <ul className="deliverables-list">
                  <li><span className="deliv-bullet">•</span> Creative direction</li>
                  <li><span className="deliv-bullet">•</span> Logo suite and brand marks</li>
                  <li><span className="deliv-bullet">•</span> Color palette</li>
                  <li><span className="deliv-bullet">•</span> Typography</li>
                  <li><span className="deliv-bullet">•</span> Brand &amp; strategy guidelines</li>
                  <li><span className="deliv-bullet">•</span> 5+ page Showit website</li>
                </ul>
              </div>

              <div className="package-card-footer">
                <a href="#" className="btn btn-package-inquire" onClick={(e) => handleNavClick(e, 'contact')}>
                  Inquire &nbsp;&rarr;
                </a>
              </div>
            </div>

            {/* PACKAGE 03 - PERSONAL BRANDING PHOTOGRAPHY + CONTENT CREATION */}
            <div className="package-card">
              <div className="package-card-header">
                <div className="package-num">03</div>
                <h3 className="package-title">Personal Branding Photography + Content Creation</h3>
                <p className="package-desc">
                  A monthly retainer service to keep your branding content high quality, fresh, and visually consistent across every touchpoint.
                </p>
              </div>

              <div className="package-deliverables">
                <span className="deliverables-heading">INCLUDES:</span>
                <ul className="deliverables-list">
                  <li><span className="deliv-bullet">•</span> Personal brand photography &amp; headshots</li>
                  <li><span className="deliv-bullet">•</span> Ongoing content creation on retainer</li>
                  <li><span className="deliv-bullet">•</span> Social media visual direction</li>
                  <li><span className="deliv-bullet">•</span> Brand consistency &amp; retainer support</li>
                </ul>
              </div>

              <div className="package-card-footer">
                <a href="#" className="btn btn-package-inquire" onClick={(e) => handleNavClick(e, 'contact')}>
                  Inquire &nbsp;&rarr;
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* THE PROCESS SECTION */}
      <section className="why-section services-process-section">
        <div className="container">
          <div className="global-section-header theme-dark">
            <span className="global-section-tagline">THE PROCESS</span>
            <h2 className="global-section-title">What working together looks like.</h2>
            <p className="global-section-subtext">
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
