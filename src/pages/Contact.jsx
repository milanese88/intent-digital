import React, { useState } from 'react';
import '../styles/home.css';

export default function Contact({ navigateTo }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    brandName: '',
    service: 'Full Branding + Website',
    timeline: 'Within 1-2 Months',
    budget: '$6k - $12k+',
    message: ''
  });

  const handleNavClick = (e, page, targetId) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (navigateTo) {
      navigateTo(page, targetId);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="home-page contact-page">
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="container nav-container">
          <div className="nav-links nav-links-left desktop-only">
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'home', 'why-us')}>ABOUT</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'home', 'portfolio')}>CLIENT WORK</a>
            <a href="#" className="nav-link active" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
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
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'home', 'portfolio')}>CLIENT WORK</a>
            <a href="#" className="mobile-nav-link active" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
            <a href="#" className="btn btn-mobile-cta" onClick={(e) => handleNavClick(e, 'contact')}>
              GET STARTED &rarr;
            </a>
          </div>
        )}
      </nav>

      {/* CONTACT HERO */}
      <header className="contact-hero-section">
        <div className="container">
          <div className="section-header" style={{ marginBottom: '20px' }}>
            <span className="section-tagline">GET IN TOUCH</span>
            <h1 className="section-title" style={{ fontSize: 'clamp(40px, 5.5vw, 64px)' }}>
              Let's Build Something<br />You're Proud Of.
            </h1>
          </div>
          <p className="contact-hero-subtitle">
            We partner with ambitious founders and luxury ventures to build intentional visual identities and digital experiences. Fill out the inquiry form below to start your brand transformation.
          </p>
        </div>
      </header>

      {/* CONTACT FORM & DIRECT INFO GRID */}
      <section className="contact-main-section">
        <div className="container">
          <div className="contact-grid">
            {/* LEFT — INQUIRY FORM */}
            <div className="contact-form-card">
              {submitted ? (
                <div className="contact-success-state">
                  <span className="contact-success-badge">&check; INQUIRY RECEIVED</span>
                  <h2 className="contact-success-title">Thank You, {formData.name || 'Founder'}!</h2>
                  <p className="contact-success-text">
                    We've received your project inquiry. Our creative team reviews every proposal carefully and will reach out within 24&ndash;48 business hours with next steps.
                  </p>
                  <button className="btn btn-pill-primary" onClick={() => setSubmitted(false)} style={{ marginTop: '24px' }}>
                    SEND ANOTHER INQUIRY &rarr;
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="contact-form">
                  <h2 className="form-title">Project Inquiry</h2>
                  <p className="form-subtitle">Tell us about your brand vision, goals, and desired launch timeline.</p>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="name">YOUR NAME *</label>
                      <input 
                        type="text" 
                        id="name" 
                        name="name" 
                        required 
                        placeholder="First & Last Name"
                        value={formData.name}
                        onChange={handleChange}
                        className="form-input"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="email">EMAIL ADDRESS *</label>
                      <input 
                        type="email" 
                        id="email" 
                        name="email" 
                        required 
                        placeholder="hello@yourbrand.com"
                        value={formData.email}
                        onChange={handleChange}
                        className="form-input"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="brandName">BUSINESS / BRAND NAME</label>
                    <input 
                      type="text" 
                      id="brandName" 
                      name="brandName" 
                      placeholder="Your Business or Project Name"
                      value={formData.brandName}
                      onChange={handleChange}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="service">SELECT INVESTMENT PACKAGE *</label>
                    <select 
                      id="service" 
                      name="service" 
                      value={formData.service} 
                      onChange={handleChange}
                      className="form-select"
                    >
                      <option value="Brand Basics ($1.2k)">Brand Basics ($1,200 USD)</option>
                      <option value="Mini-Brand ($4.2k)">Mini-Brand ($4,200 USD)</option>
                      <option value="Photography & Content ($6.0k)">Photography &amp; Content ($6,000 USD)</option>
                      <option value="Full Branding + Website ($12.4k)">Full Branding + Website ($12,400 USD)</option>
                      <option value="Custom Scope / Retainer">Custom Scope / Retainer</option>
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="timeline">DESIRED TIMELINE</label>
                      <select 
                        id="timeline" 
                        name="timeline" 
                        value={formData.timeline} 
                        onChange={handleChange}
                        className="form-select"
                      >
                        <option value="ASAP">ASAP (Next 2 Weeks)</option>
                        <option value="Within 1-2 Months">Within 1&ndash;2 Months</option>
                        <option value="3+ Months Out">3+ Months Out</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="budget">ESTIMATED BUDGET</label>
                      <select 
                        id="budget" 
                        name="budget" 
                        value={formData.budget} 
                        onChange={handleChange}
                        className="form-select"
                      >
                        <option value="$1k - $3k">$1,200 &ndash; $3,000</option>
                        <option value="$3k - $6k">$4,200 &ndash; $6,000</option>
                        <option value="$6k - $12k+">$6,000 &ndash; $12,400+</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="message">PROJECT DETAILS &amp; VISION *</label>
                    <textarea 
                      id="message" 
                      name="message" 
                      required 
                      rows="5"
                      placeholder="Tell us about your brand goals, target audience, and ideal launch outcome..."
                      value={formData.message}
                      onChange={handleChange}
                      className="form-textarea"
                    ></textarea>
                  </div>

                  <button type="submit" className="btn btn-submit-inquiry">
                    SUBMIT INQUIRY &rarr;
                  </button>
                </form>
              )}
            </div>

            {/* RIGHT — DIRECT CONTACT INFO PANEL */}
            <div className="contact-info-panel">
              <div className="info-block">
                <span className="info-label">DIRECT EMAIL</span>
                <a href="mailto:hello@intent-digital.com" className="info-value-link">
                  hello@intent-digital.com
                </a>
              </div>

              <div className="info-block">
                <span className="info-label">STUDIO LOCATION</span>
                <p className="info-value-text">
                  Fort Lauderdale, FL &bull; USA<br />
                  <span style={{ fontSize: '14px', opacity: 0.75 }}>Available for global client partnerships</span>
                </p>
              </div>

              <div className="info-block">
                <span className="info-label">STUDIO HOURS</span>
                <p className="info-value-text">
                  Monday &ndash; Friday: 9:00 AM &ndash; 5:00 PM EST
                </p>
              </div>

              <div className="info-block">
                <span className="info-label">DISCOVERY CALLS</span>
                <p className="info-value-text" style={{ marginBottom: '12px' }}>
                  Prefer a quick conversation before submitting your scope?
                </p>
                <a href="mailto:hello@intent-digital.com?subject=Discovery%20Call%20Request" className="btn btn-pill-secondary" style={{ width: '100%', textAlign: 'center' }}>
                  BOOK DISCOVERY CALL &rarr;
                </a>
              </div>

              <div className="info-block" style={{ marginBottom: 0 }}>
                <span className="info-label">CONNECT WITH US</span>
                <div className="contact-social-links">
                  <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="social-pill-link">
                    INSTAGRAM &nearr;
                  </a>
                  <a href="https://pinterest.com" target="_blank" rel="noopener noreferrer" className="social-pill-link">
                    PINTEREST &nearr;
                  </a>
                </div>
              </div>
            </div>
          </div>
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
                  <a href="#" onClick={(e) => handleNavClick(e, 'contact')}>WORK WITH US</a>
                  <a href="#" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
                </div>
              </div>
              <div className="footer-cta-wrap">
                <a href="#" className="btn btn-footer-pill-cta" onClick={(e) => handleNavClick(e, 'contact')}>
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
