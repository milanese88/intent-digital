import React, { useState, useEffect } from 'react';
import AnnouncementBanner from '../components/AnnouncementBanner';
import '../styles/home.css';

export default function News({ navigateTo, slug }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [articles, setArticles] = useState([]);
  const [activeArticle, setActiveArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch articles from API
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        if (slug) {
          const res = await fetch(`/api/news?slug=${slug}`);
          const data = await res.json();
          if (res.ok) {
            setActiveArticle(data);
          } else {
            setErrorMsg(data.error || 'Article not found.');
          }
        } else {
          setActiveArticle(null);
          const res = await fetch('/api/news');
          const data = await res.json();
          if (res.ok) {
            setArticles(data);
          } else {
            setErrorMsg(data.error || 'Failed to load news.');
          }
        }
      } catch (err) {
        setErrorMsg('Network error.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug]);

  // SEO & Structured Data (JSON-LD) Injector
  useEffect(() => {
    const originalTitle = document.title;
    if (activeArticle) {
      document.title = `${activeArticle.title} | Intent Digital`;
    } else {
      document.title = "Journal & News | Intent Digital Studio Fort Lauderdale";
    }

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    const defaultDesc = "Curated editorial news, luxury wellness studio spotlights, and high-impact branding insights from Intent Digital Studio in Fort Lauderdale.";
    metaDesc.content = activeArticle ? activeArticle.excerpt : defaultDesc;

    return () => {
      document.title = originalTitle;
      metaDesc.content = defaultDesc;
    };
  }, [activeArticle]);

  const handleNavClick = (e, page, targetId) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (navigateTo) {
      navigateTo(page, targetId);
    }
  };

  const handleArticleClick = (e, articleSlug) => {
    e.preventDefault();
    if (navigateTo) {
      navigateTo('news', null, articleSlug);
    }
  };

  const formatTextWithParagraphs = (text) => {
    if (!text) return null;
    return text.split('\n').map((paragraph, index) => {
      if (paragraph.trim() === '') return <br key={index} />;
      return <p key={index} style={{ marginBottom: '1.2em' }}>{paragraph}</p>;
    });
  };

  return (
    <div className="home-page news-page">
      <AnnouncementBanner />
      {/* NAVBAR */}
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

          <div className="nav-right">
            <a 
              href="#" 
              className="desktop-only" 
              onClick={(e) => handleNavClick(e, 'login')}
              style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: '#34292A', fontFamily: 'Montserrat, sans-serif', fontSize: '12px', fontWeight: 500, letterSpacing: '0.05em', marginRight: '20px' }}
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

      {/* ARTICLE VIEW */}
      {slug && activeArticle && !loading && (
        <article className="container" style={{ marginTop: '80px', marginBottom: '80px', maxWidth: '680px' }}>
          <button 
            onClick={(e) => { e.preventDefault(); navigateTo('news'); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Montserrat', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#34292A', marginBottom: '32px' }}
          >
            &larr; Back to Journal
          </button>
          
          <h1 style={{ fontFamily: '"Atelier Fleur", serif', fontSize: 'clamp(36px, 5vw, 56px)', color: '#34292A', lineHeight: 1.1, marginBottom: '24px' }}>
            {activeArticle.title}
          </h1>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '12px', color: 'rgba(52,41,42,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '40px' }}>
            {new Date(activeArticle.published_at).toLocaleDateString()}
          </div>
          
          {activeArticle.cover_image_url && (
            <img 
              src={activeArticle.cover_image_url} 
              alt={activeArticle.title} 
              style={{ width: '100%', height: 'auto', borderRadius: '12px', marginBottom: '40px', objectFit: 'cover', aspectRatio: '16/9' }} 
            />
          )}

          <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '16px', lineHeight: 1.8, color: '#34292A' }}>
            {formatTextWithParagraphs(activeArticle.content)}
          </div>
        </article>
      )}

      {/* LIST VIEW */}
      {!slug && (
        <>
          <header className="unified-hero-section">
            <div className="container unified-hero-container">
              <div className="unified-hero-content">
                <span className="unified-hero-tagline">JOURNAL &amp; INSIGHTS</span>
                <h1 className="unified-hero-title">
                  South Florida Luxury<br />
                  <i>Real Estate &amp; Lifestyle</i>
                </h1>
                <p className="unified-hero-subheadline">
                  Curated editorial news, upcoming luxury retail &amp; dining in Fort Lauderdale &amp; Las Olas, Palm Beach market trends, wellness studios, and high-impact branding insights from Intent Digital Studio.
                </p>
              </div>
            </div>
          </header>

          <section className="news-main-section" style={{ minHeight: '40vh' }}>
            <div className="container">
              <div className="global-section-header align-left" style={{ marginBottom: '40px' }}>
                <h2 className="global-section-title" style={{ fontSize: 'clamp(32px, 4vw, 42px)' }}>
                  Latest Journal Entries
                </h2>
              </div>

              {loading && <p style={{ fontFamily: 'Montserrat', color: 'rgba(52,41,42,0.6)' }}>Loading journal entries...</p>}
              
              {!loading && articles.length === 0 && (
                <div style={{ padding: '64px 0', textAlign: 'center', borderTop: '1px solid rgba(52,41,42,0.1)' }}>
                  <p style={{ fontFamily: '"Atelier Fleur", serif', fontSize: '24px', color: '#34292A', fontStyle: 'italic' }}>
                    Check back soon for news and updates.
                  </p>
                </div>
              )}

              {!loading && articles.length > 0 && (
                <div className="news-articles-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '32px'
                }}>
                  {articles.map((article) => (
                    <article 
                      key={article.id} 
                      className="news-article-card" 
                      onClick={(e) => handleArticleClick(e, article.slug)}
                      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', height: '100%' }}
                    >
                      <div className="article-img-wrap" style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', borderRadius: '8px', marginBottom: '16px' }}>
                        {article.cover_image_url ? (
                          <img src={article.cover_image_url} alt={article.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                        ) : (
                          <div style={{ width: '100%', height: '100%', backgroundColor: 'rgba(52,41,42,0.05)' }}></div>
                        )}
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '11px', color: 'rgba(52,41,42,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'block' }}>
                          {new Date(article.published_at).toLocaleDateString()}
                        </span>
                        <h3 style={{ fontFamily: '"Atelier Fleur", serif', fontSize: '24px', color: '#34292A', marginBottom: '12px', lineHeight: 1.2 }}>{article.title}</h3>
                        <p style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '14px', color: 'rgba(52,41,42,0.8)', lineHeight: 1.6, flex: 1 }}>{article.excerpt}</p>
                        <div style={{ marginTop: '16px' }}>
                          <span style={{ fontFamily: 'Montserrat', fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em', color: '#34292A' }}>READ &rarr;</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* FOOTER SECTION */}
      <footer className="footer-section" style={{ marginTop: slug ? '0' : undefined }}>
        <div className="container footer-container">
          <div className="footer-grid-layout">
            <div className="footer-col-left">
              <img src="/intent-script-logo.png" alt="Intent Digital" className="footer-script-logo" />
              <p className="footer-agency-tagline">
                Full-service brand + website design studio for ambitious founders.
              </p>
              <span className="footer-quote">Pure intention &amp; craft behind every choice.</span>
            </div>

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
              </div>
            </div>

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
