import React, { useState } from 'react';
import AnnouncementBanner from '../components/AnnouncementBanner';
import '../styles/home.css';

export default function Contact({ navigateTo }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedDate, setSelectedDate] = useState('2026-07-28');
  const [selectedTime, setSelectedTime] = useState('01:15 PM');
  const [communicationMethod, setCommunicationMethod] = useState('Zoom');

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    businessName: '',
    phone: '',
    website: '',
    instagram: '',
    location: '',
    launchDate: '',
    budget: '$6,000 - $12,400+',
    details: '',
    referral: 'Instagram'
  });

  const handleNavClick = (e, page, targetId) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (navigateTo) {
      navigateTo(page, targetId);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="home-page contact-page">
      <AnnouncementBanner />
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
            <a href="#" className="nav-link" onClick={(e) => handleNavClick(e, 'news')}>NEWS</a>
            <a href="#" className="nav-link active" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
          </div>

          <div className="nav-right">
            <button type="button" className="btn btn-pill-top-submit desktop-only" onClick={handleSubmit}>
              Submit &rarr;
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
            <a href="#" className="mobile-nav-link active" onClick={(e) => handleNavClick(e, 'contact')}>CONTACT</a>
          </div>
        )}
      </nav>

      {/* CONTACT HERO & FORM WRAPPER (2-COLUMN SPLIT MATCHING SCREENSHOT 3) */}
      <section className="contact-form-section">
        <div className="contact-split-container">
          {/* LEFT COLUMN: Founder Photo */}
          <div className="contact-split-left">
            <div className="contact-image-frame">
              <img 
                src="/bb5a8145cd5888844301ac922a78598a.jpg" 
                alt="Intent Digital Founder working at studio desk" 
                className="contact-hero-image" 
              />
            </div>
          </div>

          {/* RIGHT COLUMN: Header Title & Form */}
          <div className="contact-split-right">
            <div className="global-section-header align-left" style={{ marginBottom: '40px' }}>
              <span className="global-section-tagline">GET IN TOUCH</span>
              <h1 className="global-section-title">We're so glad you're here.</h1>
              <p className="global-section-subtext">
                Tell us a little about you and your business &mdash; this takes about 3 minutes, then you'll pick a time for your free consult call.
              </p>
            </div>

            {submitted ? (
              <div className="contact-success-state">
                <span className="contact-success-badge">&check; INQUIRY RECEIVED</span>
                <h2 className="contact-success-title">Thank You, {formData.fullName || 'Founder'}!</h2>
                <p className="contact-success-text">
                  We've received your project inquiry and scheduled consult slot for {selectedDate} at {selectedTime} ({communicationMethod}). Our creative team reviews every proposal carefully and will reach out with next steps.
                </p>
                <button className="btn btn-pill-primary" onClick={() => setSubmitted(false)} style={{ marginTop: '24px' }}>
                  SUBMIT ANOTHER INQUIRY &rarr;
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="contact-pill-form">
              {/* ROW 1: Full Name + Email */}
              <div className="form-row-2col">
                <div className="form-field-group">
                  <label className="form-pill-label" htmlFor="fullName">Full name</label>
                  <input 
                    type="text" 
                    id="fullName" 
                    name="fullName" 
                    required 
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={handleChange}
                    className="form-pill-input"
                  />
                  <span className="field-required-hint">* This question is required</span>
                </div>

                <div className="form-field-group">
                  <label className="form-pill-label" htmlFor="email">Email</label>
                  <input 
                    type="email" 
                    id="email" 
                    name="email" 
                    required 
                    placeholder="Enter your email address"
                    value={formData.email}
                    onChange={handleChange}
                    className="form-pill-input"
                  />
                  <span className="field-required-hint">* This question is required</span>
                </div>
              </div>

              {/* ROW 2: Business Name */}
              <div className="form-field-group">
                <label className="form-pill-label" htmlFor="businessName">Business name:</label>
                <input 
                  type="text" 
                  id="businessName" 
                  name="businessName" 
                  required
                  placeholder="Enter your business name"
                  value={formData.businessName}
                  onChange={handleChange}
                  className="form-pill-input"
                />
                <span className="field-required-hint">* This question is required</span>
              </div>

              {/* ROW 3: Phone Number + Current Website */}
              <div className="form-row-2col">
                <div className="form-field-group">
                  <label className="form-pill-label" htmlFor="phone">Phone number</label>
                  <input 
                    type="tel" 
                    id="phone" 
                    name="phone" 
                    required 
                    placeholder="E.g. 541 444 0755"
                    value={formData.phone}
                    onChange={handleChange}
                    className="form-pill-input"
                  />
                  <span className="field-required-hint">* This question is required</span>
                </div>

                <div className="form-field-group">
                  <label className="form-pill-label" htmlFor="website">Current Website (If you have one)</label>
                  <input 
                    type="text" 
                    id="website" 
                    name="website" 
                    placeholder="yourwebsite.com"
                    value={formData.website}
                    onChange={handleChange}
                    className="form-pill-input"
                  />
                </div>
              </div>

              {/* ROW 4: Instagram Username + State/Country */}
              <div className="form-row-2col">
                <div className="form-field-group">
                  <label className="form-pill-label" htmlFor="instagram">Instagram Username</label>
                  <input 
                    type="text" 
                    id="instagram" 
                    name="instagram" 
                    placeholder="@yourhandle"
                    value={formData.instagram}
                    onChange={handleChange}
                    className="form-pill-input"
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-pill-label" htmlFor="location">What state are you in? (or country if outside the US)</label>
                  <input 
                    type="text" 
                    id="location" 
                    name="location" 
                    placeholder="e.g. Florida, USA"
                    value={formData.location}
                    onChange={handleChange}
                    className="form-pill-input"
                  />
                </div>
              </div>

              {/* ROW 5: Launch Date */}
              <div className="form-field-group">
                <label className="form-pill-label" htmlFor="launchDate">
                  When is your launch date? Please note, we book 1-2 months in advance.
                </label>
                <input 
                  type="text" 
                  id="launchDate" 
                  name="launchDate" 
                  required
                  placeholder="e.g. September 2026"
                  value={formData.launchDate}
                  onChange={handleChange}
                  className="form-pill-input"
                />
                <span className="field-required-hint">* This question is required</span>
              </div>

              {/* ROW 6: Budget */}
              <div className="form-field-group">
                <label className="form-pill-label" htmlFor="budget">What's your budget?</label>
                <p className="form-pill-subtext">Please note: we do offer payment plans for services!</p>
                <select 
                  id="budget" 
                  name="budget" 
                  value={formData.budget} 
                  onChange={handleChange}
                  className="form-pill-select"
                >
                  <option value="$1,200 - $3,000">$1,200 &ndash; $3,000 USD</option>
                  <option value="$4,200 - $6,000">$4,200 &ndash; $6,000 USD</option>
                  <option value="$6,000 - $12,400+">$6,000 &ndash; $12,400+ USD</option>
                  <option value="Custom / Retainer">Custom Scope / Retainer</option>
                </select>
                <span className="field-required-hint">* This question is required</span>
              </div>

              {/* ROW 7: Anything else */}
              <div className="form-field-group">
                <label className="form-pill-label" htmlFor="details">Anything else you'd like to share?</label>
                <textarea 
                  id="details" 
                  name="details" 
                  rows="4"
                  placeholder="Tell us about your brand goals, target audience, or design inspirations..."
                  value={formData.details}
                  onChange={handleChange}
                  className="form-pill-textarea"
                ></textarea>
              </div>

              {/* ROW 8: Referral & Communication Method */}
              <div className="form-row-2col">
                <div className="form-field-group">
                  <label className="form-pill-label" htmlFor="referral">How did you hear about us?</label>
                  <select 
                    id="referral" 
                    name="referral" 
                    value={formData.referral} 
                    onChange={handleChange}
                    className="form-pill-select"
                  >
                    <option value="Instagram">Instagram</option>
                    <option value="Google Search">Google Search</option>
                    <option value="Referral">Referral / Word of Mouth</option>
                    <option value="Pinterest">Pinterest</option>
                    <option value="Other">Other</option>
                  </select>
                  <span className="field-required-hint">* This question is required</span>
                </div>

                <div className="form-field-group">
                  <label className="form-pill-label">Preferred method of communication:</label>
                  <p className="form-pill-subtext">Choose one of the options</p>
                  <div className="radio-options-wrap">
                    <label className="radio-pill-option">
                      <input 
                        type="radio" 
                        name="comm" 
                        value="Phone" 
                        checked={communicationMethod === 'Phone'} 
                        onChange={() => setCommunicationMethod('Phone')} 
                      />
                      <span>Phone</span>
                    </label>
                    <label className="radio-pill-option">
                      <input 
                        type="radio" 
                        name="comm" 
                        value="Zoom" 
                        checked={communicationMethod === 'Zoom'} 
                        onChange={() => setCommunicationMethod('Zoom')} 
                      />
                      <span>Zoom</span>
                    </label>
                  </div>
                  <span className="field-required-hint">* This question is required</span>
                </div>
              </div>

              {/* CONSULT CALL SCHEDULER (SCREENSHOT 2 MATCHING) */}
              <div className="scheduler-section-card">
                <div className="scheduler-notice-bar">
                  <span>Please select an available date and time.</span>
                  <span className="optional-badge">Optional</span>
                </div>

                <div className="scheduler-box-grid">
                  <div className="scheduler-left-meta">
                    <div className="scheduler-event-type">
                      <span>📅 Web Design Consult</span>
                      <span>⏱️ 30 min</span>
                    </div>

                    <div className="calendar-widget">
                      <div className="calendar-month-header">
                        <span>July 2026</span>
                      </div>
                      <div className="calendar-days-grid">
                        <span className="day-name">Sun</span><span className="day-name">Mon</span><span className="day-name">Tue</span><span className="day-name">Wed</span><span className="day-name">Thu</span><span className="day-name">Fri</span><span className="day-name">Sat</span>
                        
                        <span className="day-num muted">28</span><span className="day-num muted">29</span><span className="day-num muted">30</span>
                        <span className="day-num">1</span><span className="day-num">2</span><span className="day-num">3</span><span className="day-num">4</span>
                        <span className="day-num">5</span><span className="day-num">6</span><span className="day-num">7</span><span className="day-num">8</span><span className="day-num">9</span><span className="day-num">10</span><span className="day-num">11</span>
                        <span className="day-num">12</span><span className="day-num">13</span><span className="day-num">14</span><span className="day-num">15</span><span className="day-num">16</span><span className="day-num">17</span><span className="day-num">18</span>
                        <span className="day-num">19</span><span className="day-num">20</span><span className="day-num">21</span><span className="day-num">22</span><span className="day-num">23</span><span className="day-num">24</span><span className="day-num">25</span>
                        <span className="day-num">26</span><span className="day-num">27</span>
                        
                        <span 
                          className={`day-num active-slot ${selectedDate === '2026-07-28' ? 'selected' : ''}`}
                          onClick={() => setSelectedDate('2026-07-28')}
                        >
                          28
                        </span>
                        <span 
                          className={`day-num active-slot ${selectedDate === '2026-07-29' ? 'selected' : ''}`}
                          onClick={() => setSelectedDate('2026-07-29')}
                        >
                          29
                        </span>
                        <span 
                          className={`day-num active-slot ${selectedDate === '2026-07-30' ? 'selected' : ''}`}
                          onClick={() => setSelectedDate('2026-07-30')}
                        >
                          30
                        </span>
                        <span className="day-num">31</span>
                      </div>
                    </div>
                  </div>

                  <div className="scheduler-right-times">
                    <h4 className="times-day-title">Tuesday, July 28, 2026</h4>
                    <span className="timezone-label">Eastern Time - US &amp; Canada</span>

                    <div className="time-slots-column">
                      <span className="time-period-label">PM</span>
                      <button 
                        type="button" 
                        className={`time-pill-btn ${selectedTime === '01:15 PM' ? 'active' : ''}`}
                        onClick={() => setSelectedTime('01:15 PM')}
                      >
                        01:15 PM
                      </button>
                      <button 
                        type="button" 
                        className={`time-pill-btn ${selectedTime === '02:30 PM' ? 'active' : ''}`}
                        onClick={() => setSelectedTime('02:30 PM')}
                      >
                        02:30 PM
                      </button>
                      <button 
                        type="button" 
                        className={`time-pill-btn ${selectedTime === '04:00 PM' ? 'active' : ''}`}
                        onClick={() => setSelectedTime('04:00 PM')}
                      >
                        04:00 PM
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SUBMIT BUTTON */}
              <div className="form-submit-wrap">
                <button type="submit" className="btn btn-pill-bottom-submit">
                  Submit &rarr;
                </button>
              </div>
            </form>
          )}
          </div>
        </div>
      </section>

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
