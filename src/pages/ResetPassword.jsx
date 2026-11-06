import React, { useState, useEffect } from 'react';
import AnnouncementBanner from '../components/AnnouncementBanner';

export default function ResetPassword({ token: propToken, navigateTo }) {
  const [token, setToken] = useState(propToken || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [eyeHoverNew, setEyeHoverNew] = useState(false);
  const [eyeHoverConfirm, setEyeHoverConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        setToken(urlToken);
      }
    }
  }, [token]);

  const handleNavClick = (e, page, targetId) => {
    e.preventDefault();
    if (navigateTo) {
      navigateTo(page, targetId);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Missing reset token. Please request a new password reset link.');
      return;
    }

    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify and try again.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          if (navigateTo) {
            navigateTo('admin');
          } else {
            window.location.href = '/dashboard';
          }
        }, 1500);
      } else {
        setError(data.error || 'Failed to update password. Your reset link may have expired.');
      }
    } catch (err) {
      setError('A network failure occurred. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const eyeColorNew = eyeHoverNew ? '#3A342B' : 'rgba(58, 52, 43, 0.4)';
  const eyeColorConfirm = eyeHoverConfirm ? '#3A342B' : 'rgba(58, 52, 43, 0.4)';

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

      {/* RESET PASSWORD SECTION */}
      <section className="contact-form-section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center' }}>
        <div className="contact-form-container" style={{ maxWidth: '420px', margin: '0 auto', textAlign: 'center' }}>
          <h1 className="unified-hero-title" style={{ fontSize: '32px', marginBottom: '12px' }}>
            Create New Password
          </h1>
          <p style={{ color: 'rgba(52, 41, 42, 0.7)', fontSize: '14px', marginBottom: '28px', fontFamily: 'Montserrat, sans-serif' }}>
            Choose a strong password with at least 10 characters.
          </p>

          <div className="contact-pill-form" style={{ padding: '32px' }}>
            {success ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ 
                  width: '56px', 
                  height: '56px', 
                  borderRadius: '50%', 
                  backgroundColor: '#EAE6DF', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  margin: '0 auto 16px auto',
                  color: '#34292A'
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <h3 style={{ color: '#34292A', fontFamily: 'Montserrat, sans-serif', fontSize: '18px', marginBottom: '8px' }}>
                  Password Updated!
                </h3>
                <p style={{ color: '#666', fontSize: '14px', lineHeight: '1.5' }}>
                  Your password has been changed. Signing you in to your dashboard...
                </p>
              </div>
            ) : !token ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <p style={{ color: '#C0392B', fontSize: '14px', marginBottom: '20px' }}>
                  No password reset token was detected. Please request a new link.
                </p>
                <button 
                  type="button" 
                  className="btn btn-pill-primary" 
                  style={{ width: '100%' }}
                  onClick={(e) => handleNavClick(e, 'login')}
                >
                  Return to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleReset}>
                <div className="form-field-group" style={{ position: 'relative', marginBottom: '16px' }}>
                  <label className="form-pill-label" htmlFor="newPassword">New Password</label>
                  <input 
                    type={showNew ? "text" : "password"}
                    id="newPassword" 
                    name="newPassword" 
                    className="form-pill-input" 
                    required 
                    minLength={10}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 10 characters"
                    style={{ textAlign: 'center', paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    aria-label={showNew ? "Hide password" : "Show password"}
                    onClick={() => setShowNew(!showNew)}
                    onMouseEnter={() => setEyeHoverNew(true)}
                    onMouseLeave={() => setEyeHoverNew(false)}
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
                      color: eyeColorNew
                    }}
                  >
                    {showNew ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>

                <div className="form-field-group" style={{ position: 'relative', marginBottom: '20px' }}>
                  <label className="form-pill-label" htmlFor="confirmPassword">Confirm Password</label>
                  <input 
                    type={showConfirm ? "text" : "password"}
                    id="confirmPassword" 
                    name="confirmPassword" 
                    className="form-pill-input" 
                    required 
                    minLength={10}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    style={{ textAlign: 'center', paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    onClick={() => setShowConfirm(!showConfirm)}
                    onMouseEnter={() => setEyeHoverConfirm(true)}
                    onMouseLeave={() => setEyeHoverConfirm(false)}
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
                      color: eyeColorConfirm
                    }}
                  >
                    {showConfirm ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>

                {error && <p style={{ color: '#C0392B', fontSize: '14px', marginBottom: '16px' }}>{error}</p>}

                <button type="submit" className="btn btn-pill-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
                  {loading ? 'Updating Password...' : 'Update Password & Sign In'}
                </button>

                <button 
                  type="button" 
                  onClick={(e) => handleNavClick(e, 'login')}
                  style={{ background: 'none', border: 'none', color: 'rgba(52, 41, 42, 0.7)', textDecoration: 'none', marginTop: '24px', cursor: 'pointer', fontFamily: 'Montserrat', fontSize: '13px' }}
                >
                  &larr; Back to Login
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
