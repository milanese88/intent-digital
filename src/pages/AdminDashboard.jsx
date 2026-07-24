import React, { useEffect, useState } from 'react';
import AnnouncementBanner from '../components/AnnouncementBanner';

export default function AdminDashboard({ navigateTo }) {
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (e, page, targetId) => {
    e.preventDefault();
    if (navigateTo) {
      navigateTo(page, targetId);
    }
  };

  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await fetch('/api/verify');
        if (!res.ok) {
          throw new Error('Unauthorized');
        }
        setLoading(false);
      } catch (err) {
        navigateTo('login');
      }
    };
    verifySession();
  }, [navigateTo]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <p>Verifying session...</p>
      </div>
    );
  }

  return (
    <div className="home-page contact-page">
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
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
            <a href="#" className="nav-link active" onClick={(e) => handleNavClick(e, 'admin')}>PORTAL</a>
          </div>
          <div className="nav-right">
            <button type="button" className="btn btn-pill-top-submit desktop-only" onClick={(e) => handleNavClick(e, 'home')}>
              Log Out &rarr;
            </button>
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
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
            <a href="#" className="mobile-nav-link" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
            <a href="#" className="mobile-nav-link active" onClick={(e) => handleNavClick(e, 'admin')}>PORTAL</a>
          </div>
        )}
      </nav>

      {/* DASHBOARD HERO */}
      <header className="unified-hero-section">
        <div className="container unified-hero-container">
          <div className="unified-hero-content" style={{ textAlign: 'center' }}>
            <span className="unified-hero-tagline">OWNER PORTAL</span>
            <h1 className="unified-hero-title">Welcome Back, Florencia.</h1>
            <p className="unified-hero-subheadline">
              This is your private administrative dashboard. You can add secure management features here in the future.
            </p>
          </div>
        </div>
      </header>

      {/* DASHBOARD CONTENT */}
      <section className="contact-form-section" style={{ minHeight: '40vh' }}>
        <div className="contact-form-container" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ backgroundColor: '#fff', border: '1px solid rgba(52,41,42,0.1)', borderRadius: '16px', padding: '48px', boxShadow: '0 4px 24px rgba(52, 41, 42, 0.05)' }}>
            <h2 className="contact-success-title" style={{ fontSize: '24px', marginBottom: '16px' }}>Dashboard is Active</h2>
            <p className="contact-success-text">Your secure backend is perfectly functioning. Cal.com API and Resend API are both integrated and waiting for submissions.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
