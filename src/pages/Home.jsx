import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import IntroCurtain from '../components/IntroCurtain';
import AnnouncementBanner from '../components/AnnouncementBanner';
import { projectsData } from '../data/projectsData';
import '../styles/home.css';

export default function Home({ navigateTo }) {
  const [startReveal, setStartReveal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const introSeen = sessionStorage.getItem('introSeen');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (introSeen || prefersReducedMotion) {
      setStartReveal(true);
    }
  }, []);

  const handleScroll = (e, id) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      const navHeight = 80; // approximate nav height
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: elementPosition - navHeight,
        behavior: 'smooth'
      });
    }
  };

  const handleNavClick = (e, page, targetId) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (navigateTo) {
      navigateTo(page, targetId);
    }
  };

  return (
    <div className="home-page">
      <IntroCurtain onComplete={() => setStartReveal(true)} />
      
      {/* TOP ANNOUNCEMENT MARQUEE BANNER */}
      <AnnouncementBanner />

      {/* SECTION 1 — NAV (IMAGE 2 MATCHING STYLE) */}
      <nav className="navbar">
        <div className="container nav-container">
          <a href="#" className="nav-logo-link" onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <img src="/seal-logo.png" alt="Intent Digital Seal" className="nav-seal-img" />
          </a>

          <div className="nav-links desktop-only">
            <a href="#why-us" className="nav-link" onClick={(e) => handleScroll(e, 'why-us')}>ABOUT</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
            <a href="#portfolio" className="nav-link" onClick={(e) => handleScroll(e, 'portfolio')}>CLIENT WORK</a>
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

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="mobile-nav-drawer">
            <a href="#" className="mobile-nav-link" onClick={(e) => { setMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>HOME</a>
            <a href="#why-us" className="mobile-nav-link" onClick={(e) => handleScroll(e, 'why-us')}>ABOUT</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
            <a href="#portfolio" className="mobile-nav-link" onClick={(e) => handleScroll(e, 'portfolio')}>CLIENT WORK</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
          </div>
        )}
      </nav>

      {/* MAIN CINEMATIC EDITORIAL HERO SECTION */}
      <header className="hero-section hero-cinematic">
        <div className="hero-cinematic-banner-wrap">
          <img 
            src="/services-hero-staircase.jpg" 
            alt="Intent Digital Studio Environment" 
            className="hero-cinematic-banner-img"
          />
          <div className="hero-cinematic-overlay"></div>
          <div className="hero-cinematic-caption">
            <img 
              src="/seal-logo.png" 
              alt="Intent Digital Monogram Seal" 
              className="hero-cinematic-seal"
            />
            <p className="hero-cinematic-tagline">
              BRAND IDENTITY. WEBSITE EXPERIENCE. CONTENT DIRECTION.
            </p>
            <p className="hero-cinematic-subtagline">
              For brands seeking distinction, intention, and world-class visual presence.
            </p>
            <div className="hero-cinematic-action">
              <a href="#" className="btn btn-pill-hero-outline hero-banner-btn" onClick={(e) => handleNavClick(e, 'contact')}>
                Start your brand &rarr;
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* POSITIONING / STUDIO OFFERINGS SECTION (MATCHING SCREENSHOT 2) */}
      <section className="welcome-intro-section">
        <div className="container">
          {/* Main Editorial Headline */}
          <div className="welcome-intro-header">
            <h2 className="welcome-title studio-hero-headline">
              Shaping brand identity and digital presence for clients worldwide.
            </h2>
          </div>

          {/* Two Large Side-by-Side Feature Cards */}
          <div className="welcome-visuals-grid studio-offerings-cards">
            <div className="welcome-visual-card studio-card">
              <img 
                src="/offerings/brand-identity-card.jpg" 
                alt="The Complete Brand Identity - Intent Digital Monogram Tray" 
                className="welcome-card-img" 
              />
            </div>
            <div className="welcome-visual-card studio-card">
              <img 
                src="/offerings/website-experience-card.jpg" 
                alt="The Website Experience - Intent Digital Laptop Mockup" 
                className="welcome-card-img" 
              />
            </div>
          </div>

          {/* Studio Offerings Section Below Cards */}
          <div className="studio-offerings-footer">
            <div className="offerings-header-row">
              <h3 className="offerings-section-label">Studio Offerings</h3>
            </div>
            <div className="offerings-columns-grid">
              <div className="offering-col">
                <a href="#" className="offering-link-title" onClick={(e) => handleNavClick(e, 'services')}>
                  THE COMPLETE BRAND IDENTITY &rarr;
                </a>
                <p className="offering-desc">
                  A 6 to 8 week, end-to-end brand build that gives you a complete strategy, creative direction, and visual identity system, designed to launch your brand with clarity, confidence, and luxury-level presence.
                </p>
              </div>

              <div className="offering-col">
                <a href="#" className="offering-link-title" onClick={(e) => handleNavClick(e, 'services')}>
                  THE WEBSITE EXPERIENCE &rarr;
                </a>
                <p className="offering-desc">
                  A refined 4 to 8 week digital build transforming your brand into an elevated, seamless website crafted with intentional design, strategic structure, and a world-class user experience.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OUR SERVICES SECTION — TWO-COLUMN EDITORIAL LAYOUT */}
      <section id="services" className="home-services-summary-section">
        <div className="container">
          <div className="home-services-grid">
            {/* Left Column: Visual Mockup / On-Brand Image */}
            <div className="home-services-visual-wrap">
              <img 
                src="/services-studio-desk.jpg" 
                alt="Creative branding studio workspace with camera and editorial prints" 
                className="home-services-visual-img" 
                loading="lazy"
              />
            </div>

            {/* Right Column: Content & Organized Vertical Service List */}
            <div className="home-services-content">
              <span className="section-tagline">OUR SERVICES</span>
              <h2 className="services-home-title">Everything your brand needs to feel like itself.</h2>
              <p className="services-home-subheadline">
                From strategy to the smallest visual choice, we shape brands that are cohesive, considered, and made to last.
              </p>

              <ul className="services-vertical-list">
                <li className="service-list-row">
                  <span className="service-marker">&bull;</span>
                  <div className="service-row-text">
                    <strong className="service-row-name">Brand Strategy</strong>
                    <span className="service-row-sep">&mdash;</span>
                    <span className="service-row-desc">the thinking behind the beauty.</span>
                  </div>
                </li>

                <li className="service-list-row">
                  <span className="service-marker">&bull;</span>
                  <div className="service-row-text">
                    <strong className="service-row-name">Visual Identity</strong>
                    <span className="service-row-sep">&mdash;</span>
                    <span className="service-row-desc">logos, color, type, and a cohesive system.</span>
                  </div>
                </li>

                <li className="service-list-row">
                  <span className="service-marker">&bull;</span>
                  <div className="service-row-text">
                    <strong className="service-row-name">Messaging &amp; Voice</strong>
                    <span className="service-row-sep">&mdash;</span>
                    <span className="service-row-desc">words that sound like you.</span>
                  </div>
                </li>

                <li className="service-list-row">
                  <span className="service-marker">&bull;</span>
                  <div className="service-row-text">
                    <strong className="service-row-name">Web Architecture</strong>
                    <span className="service-row-sep">&mdash;</span>
                    <span className="service-row-desc">a digital home with intention.</span>
                  </div>
                </li>

                <li className="service-list-row">
                  <span className="service-marker">&bull;</span>
                  <div className="service-row-text">
                    <strong className="service-row-name">Content Creation</strong>
                    <span className="service-row-sep">&mdash;</span>
                    <span className="service-row-desc">photography and content, on retainer.</span>
                  </div>
                </li>
              </ul>

              <div className="home-services-cta-wrap">
                <a href="#" className="btn btn-pill-secondary" onClick={(e) => handleNavClick(e, 'services')}>
                  Discover our services &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OUR WORK SECTION — 4-COLUMN PORTRAIT GALLERY */}
      <section id="portfolio" className="our-work-section">
        <div className="our-work-container">
          <div className="section-header center">
            <span className="section-tagline">OUR WORK</span>
            <h2 className="section-title">Brands we've built.</h2>
            <p className="section-subtext">
              A look at the identities we've shaped — each one crafted with the same intention we'd bring to yours.
            </p>
          </div>

          <div className="our-work-grid">
            {projectsData.map((project) => (
              <a
                key={project.id}
                href={project.href || "#"}
                className="gallery-item"
                onClick={(e) => { e.preventDefault(); if (navigateTo) navigateTo('contact'); }}
              >
                <div className="gallery-image-wrap">
                  <img
                    src={project.image}
                    alt={project.title}
                    className="gallery-image"
                    loading="lazy"
                  />
                </div>
                <div className="gallery-caption">
                  <h3 className="gallery-title">{project.title}</h3>
                  <p className="gallery-desc">{project.description}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* APPROACH / WHY INTENT DIGITAL SECTION */}
      <section id="why-us" className="why-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tagline">OUR APPROACH</span>
            <h2 className="section-title">Intentional from the very first call.</h2>
            <p className="section-subtext" style={{ maxWidth: '780px', margin: '16px auto 0 auto' }}>
              Great branding isn't decoration — it's meaning made visible. Every color, type choice, and detail we design carries a reason. That's the difference between a brand that simply looks good and one that feels right — and gets remembered.
            </p>
          </div>
          <div className="why-grid">
            <div className="why-col">
              <div className="why-num">01</div>
              <h3 className="why-col-title">Strategy first</h3>
              <p className="why-col-text">
                Every decision is rooted in who you are and who you're for. We don't just design to look pretty; we design to convert.
              </p>
            </div>
            <div className="why-col">
              <div className="why-num">02</div>
              <h3 className="why-col-title">Done with you</h3>
              <p className="why-col-text">
                Collaborative process so your brand actually feels like you. No handoffs over a brick wall—we work hand-in-hand to build alignment.
              </p>
            </div>
            <div className="why-col">
              <div className="why-num">03</div>
              <h3 className="why-col-title">Built to last</h3>
              <p className="why-col-text">
                No recycled templates. Your brand is yours. Crafted custom from scratch, allowing you to scale confidently.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING CTA SECTION */}
      <section className="cta-banner-section">
        <div className="container cta-banner-container">
          <h2 className="cta-banner-title">Let's create something worth remembering.</h2>
          <p className="cta-banner-subtext">
            Whether you're starting fresh or ready to evolve, we'd love to hear your story and shape what comes next — together.
          </p>
          <a href="#" className="btn btn-cta-banner" onClick={(e) => handleNavClick(e, 'contact')}>
            Get in touch &rarr;
          </a>
        </div>
      </section>

      {/* SECTION 6 — FOOTER */}
      <footer className="footer-section">
        <div className="container footer-container">
          <div className="footer-grid-layout">
            {/* Left Column: Brand script logo, tagline, quote */}
            <div className="footer-col-left">
              <img src="/intent-script-logo.png" alt="Intent Digital" className="footer-script-logo" />
              <p className="footer-agency-tagline">
                Full-service brand + website design studio for ambitious founders.
              </p>
              <p className="footer-quote">
                <em>Pure intention &amp; craft behind every choice.</em>
              </p>
            </div>

            {/* Center Column: Centered Seal logo + Social icons */}
            <div className="footer-col-center">
              <div className="footer-seal-wrapper">
                <img src="/seal-logo.png" alt="Intent Digital Seal" className="footer-main-seal" />
              </div>
              <div className="footer-social-row">
                <a href="#" className="social-icon-link" aria-label="Facebook">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
                </a>
                <a href="#" className="social-icon-link" aria-label="Pinterest">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345c-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146A11.96 11.96 0 0012 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/></svg>
                </a>
                <a href="#" className="social-icon-link" aria-label="Instagram">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                </a>
              </div>
            </div>

            {/* Right Column: Navigation Links + CTA Button */}
            <div className="footer-col-right">
              <div className="footer-nav-columns">
                <div className="footer-nav-col">
                  <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>HOME</a>
                  <a href="#why-us" onClick={(e) => handleScroll(e, 'why-us')}>ABOUT</a>
                  <a href="#services" onClick={(e) => handleScroll(e, 'services')}>SERVICES</a>
                  <a href="#portfolio" onClick={(e) => handleScroll(e, 'portfolio')}>PORTFOLIO</a>
                </div>
                <div className="footer-nav-col">
                  <a href="#services" onClick={(e) => handleScroll(e, 'services')}>WORK WITH US</a>
                  <a href="mailto:hello@intent-digital.com">CONTACT</a>
                  <a href="#portfolio" onClick={(e) => handleScroll(e, 'portfolio')}>CLIENT WORK</a>
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
            <p className="footer-copy">&copy; 2025 Intent Digital Studio LLC &nbsp;|&nbsp; Fort Lauderdale, FL &nbsp;|&nbsp; All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
