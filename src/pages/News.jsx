import React, { useState } from 'react';
import { newsArticles } from '../data/newsData';
import '../styles/home.css';

export default function News({ navigateTo }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeArticle, setActiveArticle] = useState(null);

  const categories = [
    'All',
    'Real Estate Branding',
    'Fort Lauderdale & Las Olas',
    'Hospitality & Dining',
    'Palm Beach & Boca Luxury',
    'Wellness & Lifestyle',
    'Branding & Design Insights'
  ];

  const handleNavClick = (e, page, targetId) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (navigateTo) {
      navigateTo(page, targetId);
    }
  };

  const filteredArticles = selectedCategory === 'All'
    ? newsArticles
    : newsArticles.filter(art => art.category === selectedCategory || art.category.includes(selectedCategory));

  const featuredArticle = newsArticles[0];
  const gridArticles = filteredArticles.filter(art => selectedCategory !== 'All' || art.id !== featuredArticle.id);

  return (
    <div className="home-page news-page">
      {/* NAVBAR (IMAGE 2 MATCHING STYLE) */}
      <nav className="navbar">
        <div className="container nav-container">
          <a href="#" className="nav-logo-link" onClick={(e) => handleNavClick(e, 'home')}>
            <img src="/seal-logo.png" alt="Intent Digital Seal" className="nav-seal-img" />
          </a>

          <div className="nav-links desktop-only">
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'home', 'why-us')}>ABOUT</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'home', 'portfolio')}>CLIENT WORK</a>
            <a href="#" className="nav-link active" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
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
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'home')}>HOME</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'home', 'why-us')}>ABOUT</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'services')}>SERVICES</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'home', 'portfolio')}>CLIENT WORK</a>
            <a href="#" className="mobile-nav-link active" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
          </div>
        )}
      </nav>

      {/* NEWS HERO */}
      <header className="news-hero-section">
        <div className="container">
          <div className="section-header" style={{ marginBottom: '20px' }}>
            <span className="section-tagline">JOURNAL &amp; INSIGHTS</span>
            <h1 className="section-title" style={{ fontSize: 'clamp(38px, 5.2vw, 60px)' }}>
              South Florida Luxury Real Estate,<br />Dining, Lifestyle &amp; Brand Strategy
            </h1>
          </div>
          <p className="news-hero-subtitle">
            Curated editorial news, upcoming luxury retail &amp; dining in Fort Lauderdale &amp; Las Olas, Palm Beach market trends, wellness studios, and high-impact branding insights from Intent Digital Studio.
          </p>

          {/* CATEGORY FILTER BAR */}
          <div className="news-category-bar">
            {categories.map((cat) => (
              <button 
                key={cat} 
                className={`news-cat-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* MAIN NEWS CONTENT */}
      <section className="news-main-section">
        <div className="container">
          {/* FEATURED ARTICLE HERO CARD (When 'All' selected) */}
          {selectedCategory === 'All' && featuredArticle && (
            <div className="news-featured-card" onClick={() => setActiveArticle(featuredArticle)}>
              <div className="featured-img-wrap">
                <img src={featuredArticle.image} alt={featuredArticle.title} className="featured-img" />
              </div>
              <div className="featured-content">
                <div className="news-meta-row">
                  <span className="news-badge-cat">{featuredArticle.category}</span>
                  <span className="news-location-pill">{featuredArticle.location}</span>
                </div>
                <h2 className="featured-title">{featuredArticle.title}</h2>
                <p className="featured-summary">{featuredArticle.summary}</p>
                <div className="featured-footer">
                  <span className="news-date">{featuredArticle.date} &bull; {featuredArticle.readTime}</span>
                  <span className="read-more-link">READ ARTICLE &rarr;</span>
                </div>
              </div>
            </div>
          )}

          {/* ARTICLES 3-COLUMN GRID */}
          <div className="news-grid-header">
            <h2 className="news-section-title">
              {selectedCategory === 'All' ? 'Latest Journal & News Entries' : `${selectedCategory} Articles (${filteredArticles.length})`}
            </h2>
          </div>

          <div className="news-3col-grid">
            {gridArticles.map((article) => (
              <article key={article.id} className="news-article-card" onClick={() => setActiveArticle(article)}>
                <div className="article-img-wrap">
                  <img src={article.image} alt={article.title} className="article-img" />
                </div>
                <div className="article-card-body">
                  <div className="news-meta-row">
                    <span className="news-badge-cat">{article.category}</span>
                    <span className="news-location-pill">{article.location}</span>
                  </div>
                  <h3 className="article-card-title">{article.title}</h3>
                  <p className="article-card-summary">{article.summary}</p>
                  <div className="article-card-footer">
                    <span className="news-date">{article.date} &bull; {article.readTime}</span>
                    <span className="read-more-link">READ &rarr;</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ARTICLE READER MODAL OVERLAY */}
      {activeArticle && (
        <div className="article-modal-backdrop" onClick={() => setActiveArticle(null)}>
          <div className="article-modal-container" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setActiveArticle(null)} aria-label="Close Article">
              ✕
            </button>
            <div className="article-modal-header">
              <div className="news-meta-row" style={{ marginBottom: '16px' }}>
                <span className="news-badge-cat">{activeArticle.category}</span>
                <span className="news-location-pill">{activeArticle.location}</span>
              </div>
              <h1 className="modal-article-title">{activeArticle.title}</h1>
              <p className="modal-article-date">{activeArticle.date} &bull; {activeArticle.readTime} &bull; By Intent Digital Studio</p>
            </div>
            <div className="modal-img-wrap">
              <img src={activeArticle.image} alt={activeArticle.title} className="modal-img" />
            </div>
            <div 
              className="modal-article-body" 
              dangerouslySetInnerHTML={{ __html: activeArticle.content }}
            />
            <div className="modal-article-footer">
              <div className="modal-cta-box">
                <h3>Elevate Your Brand in South Florida</h3>
                <p>Looking for strategic brand positioning, web design, or creative direction in Fort Lauderdale, Palm Beach, or Boca Raton?</p>
                <a href="#" className="btn btn-pill-primary" onClick={(e) => { e.preventDefault(); setActiveArticle(null); handleNavClick(e, 'contact'); }}>
                  START A PROJECT INQUIRY &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <a href="#" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
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
