import React, { useState } from 'react';
import AnnouncementBanner from '../components/AnnouncementBanner';
import '../styles/home.css';

export default function About({ navigateTo }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (e, page, targetId) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (navigateTo) {
      navigateTo(page, targetId);
    }
  };

  return (
    <div className="home-page about-page">
      <AnnouncementBanner />
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="container nav-container">
          <a href="#" className="nav-logo-link" onClick={(e) => handleNavClick(e, 'home')}>
            <img src="/seal-logo.png" alt="Intent Digital Seal" className="nav-seal-img" />
          </a>

          <div className="nav-links desktop-only">
            <a href="#" className="nav-link active" onClick={(e) => handleNavClick(e, 'about')}>ABOUT</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'home', 'portfolio')}>CLIENT WORK</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
          </div>

          <div className="nav-right mobile-only">
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
          <div className="mobile-nav-drawer">
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'home')}>HOME</a>
            <a href="#" className="mobile-nav-link active" onClick={(e) => handleNavClick(e, 'about')}>ABOUT</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'home', 'portfolio')}>CLIENT WORK</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
          </div>
        )}
      </nav>

      {/* UNIFIED HERO SECTION */}
      <header className="unified-hero-section">
        <div className="container unified-hero-container">
          <div className="unified-hero-content">
            <span className="unified-hero-tagline">ABOUT INTENT DIGITAL</span>
            <h1 className="unified-hero-title">
              A studio built<br />
              <i>on intention.</i>
            </h1>
            <p className="unified-hero-subheadline">
              Intent Digital is a creative branding studio shaping identities that feel authentic, considered, and unmistakably alive — so your brand looks like who you truly are, and gets remembered for it.
            </p>
          </div>
          <div className="unified-hero-image-wrap">
            <img 
              src="/hero-founder-cinematic.jpg" 
              alt="Intent Digital Founder" 
            />
          </div>
        </div>
      </header>

      {/* WHO WE ARE */}
      <section className="about-block-section">
        <div className="container">
          <div className="about-block-grid">
            <div className="about-block-content">
              <span className="section-tagline">WHO WE ARE</span>
              <h2 className="about-block-title">Creativity, guided by intention.</h2>
              <p className="about-block-body">
                We're a creative branding studio for businesses that want to feel authentic and communicate their soul. We shape visual direction — identity, messaging, and digital presence — for brands in hospitality, real estate, lifestyle, and beyond. Timeless, elegant, and always considered.
              </p>
            </div>
            <div className="about-block-image-wrap">
              <img src="/hero-founder-cinematic.jpg" alt="Intent Digital Founder & Studio" className="about-block-img" />
            </div>
          </div>
        </div>
      </section>

      {/* OUR PHILOSOPHY & OUR PROMISE */}
      <section className="about-philosophy-section">
        <div className="container">
          <div className="about-two-col-grid">
            <div className="about-col-card">
              <span className="section-tagline">OUR PHILOSOPHY</span>
              <h2 className="about-col-title">Every visual choice has a reason.</h2>
              <p className="about-col-body">
                Anyone can make something look pretty. We make it mean something. From the first call to the final file, every color, every typeface, every detail is chosen with purpose. That's what turns a nice design into the right one — and a business into a brand people remember.
              </p>
            </div>

            <div className="about-col-card">
              <span className="section-tagline">OUR PROMISE</span>
              <h2 className="about-col-title">The brand you've been dreaming of.</h2>
              <p className="about-col-body">
                We'll deliver a brand you're genuinely proud of — and leave you confident in your identity and where it's headed. No templates, no filler. Just a brand crafted personally, thoughtfully, and entirely for you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW WE WORK */}
      <section className="about-process-section">
        <div className="container center-text">
          <span className="section-tagline">HOW WE WORK</span>
          <h2 className="section-title">Intentional, every step of the way.</h2>
          <p className="section-subtext" style={{ maxWidth: '800px', margin: '16px auto 0 auto' }}>
            Great branding is a process, not a moment. We guide you through it with clarity and care — from that first conversation to the day your brand comes to life — so the same intention lives in every stage.
          </p>
        </div>
      </section>

      {/* CLOSING CTA SECTION */}
      <section className="cta-banner-section">
        <div className="container cta-banner-container">
          <h2 className="cta-banner-title">Let's shape something meaningful.</h2>
          <p className="cta-banner-subtext">
            If you're ready for a brand that feels like you — considered, cohesive, and made to last — we'd love to hear your story.
          </p>
          <a href="#" className="btn btn-cta-banner" onClick={(e) => handleNavClick(e, 'contact')}>
            Get in touch &rarr;
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
