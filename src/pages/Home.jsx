import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import IntroCurtain from '../components/IntroCurtain';
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
              Luxe Website Design &amp;<br />Branding for Founders
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
              <a href="#" className="btn btn-pill-primary" onClick={(e) => handleNavClick(e, 'contact')}>
                GET STARTED &rarr;
              </a>
            </motion.div>
          </div>
        </div>

        {/* INFINITE MARQUEE TICKER BANNER */}
        <div className="marquee-banner">
          <div className="marquee-track">
            <span>CREATIVE DIRECTION &nbsp;&bull;&nbsp; EDITORIAL DESIGN &nbsp;&bull;&nbsp; VISUAL STRATEGY &nbsp;&bull;&nbsp; WEB ARCHITECTURE &nbsp;&bull;&nbsp; BRAND IDENTITY &nbsp;&bull;&nbsp; INTENT DIGITAL STUDIO &nbsp;&bull;&nbsp;&nbsp;</span>
            <span>CREATIVE DIRECTION &nbsp;&bull;&nbsp; EDITORIAL DESIGN &nbsp;&bull;&nbsp; VISUAL STRATEGY &nbsp;&bull;&nbsp; WEB ARCHITECTURE &nbsp;&bull;&nbsp; BRAND IDENTITY &nbsp;&bull;&nbsp; INTENT DIGITAL STUDIO &nbsp;&bull;&nbsp;&nbsp;</span>
            <span>CREATIVE DIRECTION &nbsp;&bull;&nbsp; EDITORIAL DESIGN &nbsp;&bull;&nbsp; VISUAL STRATEGY &nbsp;&bull;&nbsp; WEB ARCHITECTURE &nbsp;&bull;&nbsp; BRAND IDENTITY &nbsp;&bull;&nbsp; INTENT DIGITAL STUDIO &nbsp;&bull;&nbsp;&nbsp;</span>
          </div>
        </div>
      </header>



      {/* OUR WORK SECTION — 4-COLUMN PORTRAIT GALLERY */}
      <section id="portfolio" className="our-work-section">
        <div className="our-work-container">
          <div className="section-header center">
            <span className="section-tagline">OUR WORK</span>
            <h2 className="section-title">Brands we've built</h2>
          </div>

          <div className="our-work-grid">
            {projectsData.slice(0, 8).map((project) => (
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
                  <div className="gallery-overlay">
                    <h3 className="gallery-title">{project.title}</h3>
                    <p className="gallery-desc">{project.description}</p>
                  </div>
                </div>
                <div className="gallery-caption mobile-caption">
                  <h3 className="gallery-title">{project.title}</h3>
                  <p className="gallery-desc">{project.description}</p>
                </div>
              </a>
            ))}
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
              <img src="/work-florentine.jpg" alt="Intent Digital Client Work Showcase" className="welcome-card-img" />
            </div>
          </div>
        </div>
      </section>

      {/* BOUNCY SCALLOP / CLOUD MARQUEE MOTION BANNER */}
      <div className="wave-marquee-section">
        {/* Top Scallop Wave SVG */}
        <div className="wave-divider wave-top">
          <svg viewBox="0 0 1200 36" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 36 Q30 0 60 36 Q90 0 120 36 Q150 0 180 36 Q210 0 240 36 Q270 0 300 36 Q330 0 360 36 Q390 0 420 36 Q450 0 480 36 Q510 0 540 36 Q570 0 600 36 Q630 0 660 36 Q690 0 720 36 Q750 0 780 36 Q810 0 840 36 Q870 0 900 36 Q930 0 960 36 Q990 0 1020 36 Q1050 0 1080 36 Q1110 0 1140 36 Q1170 0 1200 36 V36 H0 Z" fill="var(--dusty-blue)"/>
          </svg>
        </div>

        {/* Baby Blue Marquee Banner */}
        <div className="wave-marquee-banner">
          <div className="wave-marquee-track">
            <span>BRAND IDENTITY &nbsp;&bull;&nbsp; DIGITAL PRESENCE &nbsp;&bull;&nbsp; CREATIVE DIRECTION &nbsp;&bull;&nbsp; EDITORIAL DESIGN &nbsp;&bull;&nbsp; VISUAL STRATEGY &nbsp;&bull;&nbsp; WEB ARCHITECTURE &nbsp;&bull;&nbsp;&nbsp;</span>
            <span>BRAND IDENTITY &nbsp;&bull;&nbsp; DIGITAL PRESENCE &nbsp;&bull;&nbsp; CREATIVE DIRECTION &nbsp;&bull;&nbsp; EDITORIAL DESIGN &nbsp;&bull;&nbsp; VISUAL STRATEGY &nbsp;&bull;&nbsp; WEB ARCHITECTURE &nbsp;&bull;&nbsp;&nbsp;</span>
            <span>BRAND IDENTITY &nbsp;&bull;&nbsp; DIGITAL PRESENCE &nbsp;&bull;&nbsp; CREATIVE DIRECTION &nbsp;&bull;&nbsp; EDITORIAL DESIGN &nbsp;&bull;&nbsp; VISUAL STRATEGY &nbsp;&bull;&nbsp; WEB ARCHITECTURE &nbsp;&bull;&nbsp;&nbsp;</span>
          </div>
        </div>

        {/* Bottom Scallop Wave SVG */}
        <div className="wave-divider wave-bottom">
          <svg viewBox="0 0 1200 36" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 0 Q30 36 60 0 Q90 36 120 0 Q150 36 180 0 Q210 36 240 0 Q270 36 300 0 Q330 36 360 0 Q390 36 420 0 Q450 36 480 0 Q510 36 540 0 Q570 36 600 0 Q630 36 660 0 Q690 36 720 0 Q750 36 780 0 Q810 36 840 0 Q870 36 900 0 Q930 36 960 0 Q990 36 1020 0 Q1050 36 1080 0 Q1110 36 1140 0 Q1170 36 1200 0 V0 H0 Z" fill="var(--dusty-blue)"/>
          </svg>
        </div>
      </div>

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
