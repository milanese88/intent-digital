import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import IntroCurtain from '../components/IntroCurtain';
import '../styles/home.css';

export default function Home() {
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

  return (
    <div className="home-page">
      <IntroCurtain onComplete={() => setStartReveal(true)} />
      {/* SECTION 1 — NAV */}
      <nav className="navbar">
        <div className="container nav-container">
          <div className="nav-links nav-links-left desktop-only">
            <a href="#why-us" className="nav-link" onClick={(e) => handleScroll(e, 'why-us')}>ABOUT</a>
            <a href="#services" className="nav-link" onClick={(e) => handleScroll(e, 'services')}>SERVICES</a>
            <a href="#portfolio" className="nav-link" onClick={(e) => handleScroll(e, 'portfolio')}>CLIENT WORK</a>
            <a href="mailto:hello@intent-digital.com" className="nav-link">CONTACT</a>
          </div>

          <a href="#" className="nav-logo-link" onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <img src="/intent-script-logo.png" alt="Intent Digital" className="nav-logo-img" />
          </a>

          <div className="nav-right">
            <a href="mailto:hello@intent-digital.com" className="btn btn-nav-cta desktop-only">
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
            <a href="#why-us" className="mobile-nav-link" onClick={(e) => handleScroll(e, 'why-us')}>ABOUT</a>
            <a href="#services" className="mobile-nav-link" onClick={(e) => handleScroll(e, 'services')}>SERVICES</a>
            <a href="#portfolio" className="mobile-nav-link" onClick={(e) => handleScroll(e, 'portfolio')}>CLIENT WORK</a>
            <a href="mailto:hello@intent-digital.com" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>CONTACT</a>
            <a href="mailto:hello@intent-digital.com" className="btn btn-mobile-cta" onClick={() => setMobileMenuOpen(false)}>
              GET STARTED &rarr;
            </a>
          </div>
        )}
      </nav>

      {/* SECTION 2 — CINEMATIC EDITORIAL HERO */}
      <header className="hero-section hero-cinematic">
        <div className="hero-bg-overlay"></div>
        <div className="container hero-container">
          <div className="hero-editorial-content">
            <motion.h1
              initial={{ opacity: 0, y: 25 }}
              animate={startReveal ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.3 }}
              className="hero-editorial-title"
            >
              Luxe Website Design + Branding for Founders
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={startReveal ? { opacity: 0.9, y: 0 } : {}}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.6 }}
              className="hero-editorial-subtitle"
            >
              Authentic, intentional branding for businesses that stand out. Let's give you that on-brand, intentional identity you've always dreamed of.
            </motion.p>
            
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={startReveal ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.9 }}
              className="hero-editorial-actions"
            >
              <a href="#portfolio" className="btn btn-pill-secondary" onClick={(e) => handleScroll(e, 'portfolio')}>
                SEE OUR WORK &rarr;
              </a>
              <a href="mailto:hello@intent-digital.com" className="btn btn-pill-primary">
                GET STARTED &rarr;
              </a>
            </motion.div>
          </div>
        </div>

        {/* INFINITE MARQUEE TICKER BANNER */}
        <div className="marquee-banner">
          <div className="marquee-track">
            <span>INTENT DIGITAL STUDIO &nbsp;&bull;&nbsp; CREATIVE BRANDING &nbsp;&bull;&nbsp; AUTHENTIC &amp; INTENTIONAL &nbsp;&bull;&nbsp; WEB DESIGN &amp; BRAND IDENTITY &nbsp;&bull;&nbsp; FORT LAUDERDALE, FL &nbsp;&bull;&nbsp;&nbsp;</span>
            <span>INTENT DIGITAL STUDIO &nbsp;&bull;&nbsp; CREATIVE BRANDING &nbsp;&bull;&nbsp; AUTHENTIC &amp; INTENTIONAL &nbsp;&bull;&nbsp; WEB DESIGN &amp; BRAND IDENTITY &nbsp;&bull;&nbsp; FORT LAUDERDALE, FL &nbsp;&bull;&nbsp;&nbsp;</span>
            <span>INTENT DIGITAL STUDIO &nbsp;&bull;&nbsp; CREATIVE BRANDING &nbsp;&bull;&nbsp; AUTHENTIC &amp; INTENTIONAL &nbsp;&bull;&nbsp; WEB DESIGN &amp; BRAND IDENTITY &nbsp;&bull;&nbsp; FORT LAUDERDALE, FL &nbsp;&bull;&nbsp;&nbsp;</span>
          </div>
        </div>
      </header>



      {/* PORTFOLIO SHOWCASE SECTION */}
      <section id="portfolio" className="portfolio-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tagline">Our Work</span>
            <h2 className="section-title">Brands we've built</h2>
          </div>
          <div className="portfolio-grid">
            {/* Card 1 - Rosé & Roast */}
            <div className="portfolio-card portfolio-card-large">
              <img src="/portfolio/rose-roast.png" alt="Rosé & Roast" className="portfolio-img" />
              <div className="portfolio-overlay">
                <div className="portfolio-overlay-content">
                  <h3 className="portfolio-title-text">Rosé &amp; Roast</h3>
                  <p className="portfolio-desc-text">Brand identity for a boutique coffee shop in Fort Lauderdale.</p>
                </div>
              </div>
            </div>

            {/* Card 2 - Studio Solé */}
            <div className="portfolio-card portfolio-card-tall">
              <img src="/portfolio/studio-sole.png" alt="Studio Solé" className="portfolio-img" />
              <div className="portfolio-overlay">
                <div className="portfolio-overlay-content">
                  <h3 className="portfolio-title-text">Studio Solé</h3>
                  <p className="portfolio-desc-text">Minimal, movement-driven branding for a Palm Beach pilates studio.</p>
                </div>
              </div>
            </div>

            {/* Card 3 - The Alcove Hotel */}
            <div className="portfolio-card portfolio-card-half">
              <img src="/portfolio/alcove-hotel.png" alt="The Alcove Hotel" className="portfolio-img" />
              <div className="portfolio-overlay">
                <div className="portfolio-overlay-content">
                  <h3 className="portfolio-title-text">The Alcove Hotel</h3>
                  <p className="portfolio-desc-text">Elevated visual identity for a boutique hotel in Palm Beach.</p>
                </div>
              </div>
            </div>

            {/* Card 4 - Patio Coffee Co. */}
            <div className="portfolio-card portfolio-card-half">
              <img src="/portfolio/patio-coffee.png" alt="Patio Coffee Co." className="portfolio-img" />
              <div className="portfolio-overlay">
                <div className="portfolio-overlay-content">
                  <h3 className="portfolio-title-text">Patio Coffee Co.</h3>
                  <p className="portfolio-desc-text">Playful café branding built for community and consistency.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WELCOME TO INTENT DIGITAL SECTION */}
      <section className="welcome-intro-section">
        <div className="container">
          <div className="welcome-intro-header">
            <span className="welcome-tagline">WELCOME TO INTENT DIGITAL</span>
            <h2 className="welcome-title">
              A creative branding studio shaping identity, voice, and digital presence with pure intention behind every choice.
            </h2>
          </div>

          <div className="welcome-visuals-grid">
            <div className="welcome-visual-card welcome-card-dark">
              <div className="welcome-card-inner">
                <img src="/intent-script-logo.png" alt="Intent Digital Studio" className="welcome-card-monogram" />
              </div>
            </div>
            <div className="welcome-visual-card welcome-card-frame">
              <img src="/portfolio/rose-roast.png" alt="Intent Digital Client Work Showcase" className="welcome-card-img" />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3 — SERVICES ("What We Offer") */}
      <section id="services" className="services-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tagline">OUR SERVICES</span>
            <h2 className="section-title">What We Offer</h2>
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
                Pre-made, semi-custom brand kits tailored to your brand &mdash; a fast, polished starting point.
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
              <a href="mailto:hello@intent-digital.com" className="btn btn-card btn-card-basics">
                Get started &rarr;
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
                A focused mini branding suite for founders who need clarity and cohesion, fast.
              </p>
              <hr className="card-divider" />
              <div className="card-includes-label">WHAT'S INCLUDED</div>
              <ul className="card-list">
                <li>Mini branding suite</li>
                <li>Color palette</li>
                <li>Typography</li>
                <li>Brand guideline sheet</li>
              </ul>
              <a href="mailto:hello@intent-digital.com" className="btn btn-card btn-card-mini">
                Get started &rarr;
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
                Professional photography plus a full content bundle &mdash; everything you need to show up consistently and beautifully.
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
              <a href="mailto:hello@intent-digital.com" className="btn btn-card btn-card-photo">
                Get started &rarr;
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
                For the founder who wants their brand and website to work beautifully together &mdash; end to end.
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
              <a href="mailto:hello@intent-digital.com" className="btn btn-card btn-card-full">
                Get started &rarr;
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 — WHY INTENT DIGITAL */}
      <section id="why-us" className="why-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tagline">OUR VALUES</span>
            <h2 className="section-title">Built for founders who mean it.</h2>
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

      {/* SECTION 5 — CTA BANNER */}
      <section className="cta-banner-section">
        <div className="container cta-banner-container">
          <h2 className="cta-banner-title">Ready to build something you're proud of?</h2>
          <p className="cta-banner-subtext">Let's talk about your brand.</p>
          <a href="mailto:hello@intent-digital.com" className="btn btn-cta-banner">
            Get started &rarr;
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
