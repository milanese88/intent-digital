import React, { useState } from 'react';
import AnnouncementBanner from '../components/AnnouncementBanner';

export default function Login({ navigateTo }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleNavClick = (e, page, targetId) => {
    e.preventDefault();
    if (navigateTo) {
      navigateTo(page, targetId);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (res.ok) {
        navigateTo('admin');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('An error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
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
          </div>
          <div className="nav-right">
            <a 
              href="#" 
              className="desktop-only" 
              onClick={(e) => handleNavClick(e, 'login')}
              style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: '#34292A', fontFamily: 'Montserrat, sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em', marginRight: '20px' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              LOG IN
            </a>
            <button type="button" className="btn btn-pill-top-submit desktop-only" onClick={(e) => handleNavClick(e, 'contact')}>
              Inquire &rarr;
            </button>
          </div>
        </div>
      </nav>

      {/* LOGIN FORM SECTION */}
      <section className="contact-form-section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center' }}>
        <div className="contact-form-container" style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
          <h1 className="unified-hero-title" style={{ fontSize: '32px', marginBottom: '24px' }}>Owner Login</h1>
          
          <form onSubmit={handleLogin} className="contact-pill-form" style={{ padding: '32px' }}>
            <div className="form-field-group">
              <label className="form-pill-label" htmlFor="password">Admin Password</label>
              <input 
                type="password" 
                id="password" 
                name="password" 
                className="form-pill-input" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ textAlign: 'center' }}
              />
            </div>

            {error && <p style={{ color: 'red', fontSize: '14px', marginBottom: '16px' }}>{error}</p>}

            <button type="submit" className="btn btn-pill-primary" style={{ width: '100%', marginTop: '16px' }} disabled={loading}>
              {loading ? 'Authenticating...' : 'LOG IN &rarr;'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
