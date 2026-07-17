import React from 'react';
import '../styles/home.css';

export default function Home() {
  const handleScroll = (e, id) => {
    e.preventDefault();
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
      {/* SECTION 1 — NAV */}
      <nav className="navbar">
        <div className="container nav-container">
          <a href="#" className="nav-logo-link" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <img src="/intent-script-logo.png" alt="Intent Digital" className="nav-logo-img" />
          </a>
          <div className="nav-links">
            <a href="#services" className="nav-link" onClick={(e) => handleScroll(e, 'services')}>Services</a>
            <a href="#why-us" className="nav-link" onClick={(e) => handleScroll(e, 'why-us')}>About</a>
            <a href="mailto:hello@intent-digital.com" className="nav-link">Contact</a>
          </div>
          <a href="mailto:hello@intent-digital.com" className="btn btn-nav-cta">
            Get started &rarr;
          </a>
        </div>
      </nav>

      {/* SECTION 2 — HERO */}
      <header className="hero-section">
        <div className="container hero-container">
          <div className="hero-postcard-card">
            {/* Left side of the postcard */}
            <div className="postcard-left">
              <div className="postcard-logo-wrap">
                <img src="/intent-script-logo.png" alt="Intent Digital" className="postcard-logo-img" />
              </div>
              
              <div className="postcard-fields">
                <div className="postcard-field">
                  <span className="field-label">To:</span>
                  <span className="field-value">Authentic Business</span>
                </div>
                <div className="postcard-field">
                  <span className="field-label">From:</span>
                  <span className="field-value">Intent Digital, Fort Lauderdale, FL</span>
                </div>
              </div>
              
              <div className="postcard-actions">
                <a href="mailto:hello@intent-digital.com" className="btn btn-hero-primary">
                  Get started &rarr;
                </a>
                <a href="#portfolio" className="btn btn-hero-secondary" onClick={(e) => handleScroll(e, 'portfolio')}>
                  See our work
                </a>
              </div>
              
              <div className="postcard-postmark-wrap">
                <svg className="postcard-postmark" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="0.8" />
                  <circle cx="50" cy="50" r="41" fill="none" stroke="currentColor" strokeDasharray="2 2" strokeWidth="0.5" />
                  <text x="50" y="32" fontSize="6.5" textAnchor="middle" fill="currentColor" letterSpacing="0.5">FORT LAUDERDALE</text>
                  <text x="50" y="50" fontSize="9" fontWeight="bold" textAnchor="middle" fill="currentColor">JUL 17</text>
                  <text x="50" y="62" fontSize="7" textAnchor="middle" fill="currentColor">2025</text>
                  <text x="50" y="74" fontSize="7" textAnchor="middle" fill="currentColor" letterSpacing="1">FLA.</text>
                </svg>
              </div>
            </div>

            {/* Right side of the postcard */}
            <div className="postcard-right">
              <div className="postcard-stamp-area">
                <div className="postage-stamp">
                  <div className="postage-stamp-inner"></div>
                </div>
                <div className="postmark-waves-wrap">
                  <svg className="postmark-waves" viewBox="0 0 100 40">
                    <path d="M 0 10 Q 15 5 30 10 T 60 10 T 90 10" fill="none" stroke="currentColor" strokeWidth="0.8" />
                    <path d="M 0 20 Q 15 15 30 20 T 60 20 T 90 20" fill="none" stroke="currentColor" strokeWidth="0.8" />
                    <path d="M 0 30 Q 15 25 30 30 T 60 30 T 90 30" fill="none" stroke="currentColor" strokeWidth="0.8" />
                  </svg>
                </div>
              </div>
              
              <div className="postcard-letter-content">
                <img src="/intent-letter-text.png" alt="Handwritten letter from Intent Digital" className="postcard-letter-img" />
              </div>
            </div>
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
            <div className="service-card card-best-seller">
              <div className="card-top">
                <span className="badge-timeline">4&ndash;5 weeks</span>
                <span className="badge-best-seller">BEST SELLER</span>
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
          <div className="footer-top">
            <div className="footer-brand">
              <img src="/intent-script-logo.png" alt="Intent Digital" className="footer-logo-img" />
              <p className="footer-tagline">Branding for founders who mean business.</p>
            </div>
            <div className="footer-contact">
              <span className="footer-label">GET IN TOUCH</span>
              <a href="mailto:hello@intent-digital.com" className="footer-email">
                hello@intent-digital.com
              </a>
              <a href="mailto:hello@intent-digital.com" className="btn btn-footer-cta">
                Get started &rarr;
              </a>
            </div>
            <div className="footer-nav">
              <span className="footer-label">EXPLORE</span>
              <div className="footer-links">
                <a href="#services" onClick={(e) => handleScroll(e, 'services')}>Services</a>
                <a href="#why-us" onClick={(e) => handleScroll(e, 'why-us')}>About</a>
                <a href="mailto:hello@intent-digital.com">Contact</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p className="footer-copy">&copy; 2025 Intent Digital. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
