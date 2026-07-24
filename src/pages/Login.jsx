import React, { useState, useEffect } from 'react';
import AnnouncementBanner from '../components/AnnouncementBanner';

export default function Login({ navigateTo }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  
  // UI States
  const [loginMode, setLoginMode] = useState('magic'); // 'magic' or 'password'
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [eyeHover, setEyeHover] = useState(false);

  // Check for URL errors (e.g. from verify-magic-link redirect)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if (err === 'invalid_link') {
        setError('The magic link is invalid or has already been used.');
      } else if (err === 'expired_link') {
        setError('Your magic link has expired. Please request a new one.');
      }
      
      // Cleanup URL
      if (err) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  const handleNavClick = (e, page, targetId) => {
    e.preventDefault();
    if (navigateTo) {
      navigateTo(page, targetId);
    }
  };

  const handleMagicLinkRequest = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/request-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await res.json();
      
      if (res.status === 429) {
        setError('Too many requests. Please try again in 15 minutes.');
      } else if (!res.ok) {
        setError(data.error || 'A network error occurred while requesting the link.');
      } else {
        setMagicLinkSent(true);
      }
    } catch (err) {
      setError('A network failure occurred. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok) {
        navigateTo('admin');
      } else {
        if (res.status === 500) {
          setError('Server configuration error: Authentication is not properly configured.');
        } else {
          setError('Wrong credentials. Please try again.');
        }
      }
    } catch (err) {
      setError('A network failure occurred. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const eyeColor = eyeHover ? '#3A342B' : 'rgba(58, 52, 43, 0.4)';

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
          
          <div className="contact-pill-form" style={{ padding: '32px' }}>
            {magicLinkSent ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <h3 style={{ color: '#34292A', fontFamily: 'Montserrat, sans-serif', fontSize: '18px', marginBottom: '16px' }}>
                  Check your inbox
                </h3>
                <p style={{ color: '#666', fontSize: '14px', lineHeight: '1.5' }}>
                  We sent a login link to your email. It expires in 15 minutes.
                </p>
                <button 
                  onClick={() => setMagicLinkSent(false)} 
                  style={{ background: 'none', border: 'none', color: '#34292A', textDecoration: 'underline', marginTop: '24px', cursor: 'pointer', fontFamily: 'Montserrat' }}
                >
                  Need another link?
                </button>
              </div>
            ) : (
              <>
                {loginMode === 'magic' ? (
                  // MAGIC LINK FORM
                  <form onSubmit={handleMagicLinkRequest}>
                    <div className="form-field-group" style={{ marginBottom: '16px' }}>
                      <label className="form-pill-label" htmlFor="email">Email Address</label>
                      <input 
                        type="email" 
                        id="email" 
                        name="email" 
                        className="form-pill-input" 
                        required 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{ textAlign: 'center' }}
                      />
                    </div>
                    
                    {error && <p style={{ color: 'red', fontSize: '14px', marginBottom: '16px' }}>{error}</p>}

                    <button type="submit" className="btn btn-pill-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
                      {loading ? 'Sending...' : 'Email me a login link'}
                    </button>
                    
                    <button 
                      type="button" 
                      onClick={() => { setLoginMode('password'); setError(null); }}
                      style={{ background: 'none', border: 'none', color: 'rgba(52, 41, 42, 0.7)', textDecoration: 'none', marginTop: '24px', cursor: 'pointer', fontFamily: 'Montserrat', fontSize: '13px' }}
                    >
                      Sign in with password instead
                    </button>
                  </form>
                ) : (
                  // PASSWORD FORM
                  <form onSubmit={handlePasswordLogin}>
                    <div className="form-field-group" style={{ marginBottom: '16px' }}>
                      <label className="form-pill-label" htmlFor="email">Email</label>
                      <input 
                        type="email" 
                        id="email" 
                        name="email" 
                        className="form-pill-input" 
                        required 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{ textAlign: 'center' }}
                      />
                    </div>

                    <div className="form-field-group" style={{ position: 'relative' }}>
                      <label className="form-pill-label" htmlFor="password">Admin Password</label>
                      <input 
                        type={showPassword ? "text" : "password"}
                        id="password" 
                        name="password" 
                        className="form-pill-input" 
                        required 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ textAlign: 'center', paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword(!showPassword)}
                        onMouseEnter={() => setEyeHover(true)}
                        onMouseLeave={() => setEyeHover(false)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '38px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.2s ease',
                          color: eyeColor
                        }}
                      >
                        {showPassword ? (
                          // Eye-with-slash icon
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                            <line x1="1" y1="1" x2="23" y2="23"></line>
                          </svg>
                        ) : (
                          // Eye icon
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        )}
                      </button>
                    </div>

                    {error && <p style={{ color: 'red', fontSize: '14px', marginBottom: '16px', marginTop: '16px' }}>{error}</p>}

                    <button type="submit" className="btn btn-pill-primary" style={{ width: '100%', marginTop: '24px' }} disabled={loading}>
                      {loading ? 'Authenticating...' : 'Log In'}
                    </button>

                    <button 
                      type="button" 
                      onClick={() => { setLoginMode('magic'); setError(null); }}
                      style={{ background: 'none', border: 'none', color: 'rgba(52, 41, 42, 0.7)', textDecoration: 'none', marginTop: '24px', cursor: 'pointer', fontFamily: 'Montserrat', fontSize: '13px' }}
                    >
                      &larr; Back to Magic Link
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
