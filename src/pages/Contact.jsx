import React, { useState, useEffect } from 'react';
import AnnouncementBanner from '../components/AnnouncementBanner';
import '../styles/home.css';

export default function Contact({ navigateTo }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  const today = new Date();
  
  const formatDate = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState(formatDate(today));
  const [currentViewDate, setCurrentViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedTime, setSelectedTime] = useState(null);
  const [communicationMethod, setCommunicationMethod] = useState('Zoom');
  
  // API State
  const [availableSlots, setAvailableSlots] = useState({});
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState(null);


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

  useEffect(() => {
    async function fetchSlots() {
      setIsLoadingSlots(true);
      setSlotError(null);
      
      const currentYear = currentViewDate.getFullYear();
      const currentMonth = currentViewDate.getMonth();
      const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
      
      const dateFrom = formatDate(new Date(currentYear, currentMonth, 1)) + "T00:00:00Z";
      const dateTo = formatDate(new Date(currentYear, currentMonth, lastDay)) + "T23:59:59Z";

      try {
        const res = await fetch(`/api/get-availability?dateFrom=${dateFrom}&dateTo=${dateTo}`);
        
        // The backend might return a 500 with a JSON error message if env vars are missing
        let data;
        try {
          data = await res.json();
        } catch (parseError) {
          throw new Error(`Server returned a non-JSON response (Status: ${res.status})`);
        }
        
        if (!res.ok) {
          throw new Error(data.error || `Failed to fetch availability (Status: ${res.status})`);
        }
        
        // Cal.com returns slots as an object with date keys: { "2026-07-28": [ { time: "2026-07-28T13:15:00.000Z" } ] }
        setAvailableSlots(data.slots || {});
      } catch (err) {
        console.error("Calendar Sync Error:", err);
        setSlotError(err.message || 'Could not load time slots.');
      } finally {
        setIsLoadingSlots(false);
      }
    }
    fetchSlots();
  }, [currentViewDate]);

  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month, 1).getDay();
  };

  const currentYear = currentViewDate.getFullYear();
  const currentMonth = currentViewDate.getMonth();
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const calendarGrid = [];
  const daysInPrevMonth = getDaysInMonth(currentYear, currentMonth - 1);
  
  for (let i = 0; i < firstDay; i++) {
    calendarGrid.push({
      day: daysInPrevMonth - firstDay + i + 1,
      isCurrentMonth: false,
      dateString: formatDate(new Date(currentYear, currentMonth - 1, daysInPrevMonth - firstDay + i + 1)),
      isPast: true
    });
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(currentYear, currentMonth, i);
    const dString = formatDate(d);
    const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    calendarGrid.push({
      day: i,
      isCurrentMonth: true,
      dateString: dString,
      isPast: isPast
    });
  }

  const totalSlots = calendarGrid.length;
  const paddingAfter = totalSlots % 7 === 0 ? 0 : 7 - (totalSlots % 7);
  for (let i = 1; i <= paddingAfter; i++) {
    calendarGrid.push({
      day: i,
      isCurrentMonth: false,
      dateString: formatDate(new Date(currentYear, currentMonth + 1, i)),
      isPast: false 
    });
  }

  const handlePrevMonth = () => {
    if (currentMonth > today.getMonth() || currentYear > today.getFullYear()) {
      setCurrentViewDate(new Date(currentYear, currentMonth - 1, 1));
    }
  };

  const handleNextMonth = () => {
    setCurrentViewDate(new Date(currentYear, currentMonth + 1, 1));
  };
  
  const isCurrentMonthView = currentMonth === today.getMonth() && currentYear === today.getFullYear();
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const displayMonth = `${monthNames[currentMonth]} ${currentYear}`;

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00'); 
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `${days[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTime) {
      alert("Please select a time slot.");
      return;
    }
    
    const payload = {
      start: selectedTime,
      responses: {
        name: formData.fullName,
        email: formData.email,
        notes: `Business: ${formData.businessName}, Phone: ${formData.phone}, Website: ${formData.website}, Instagram: ${formData.instagram}, Location: ${formData.location}, Launch: ${formData.launchDate}, Budget: ${formData.budget}, Method: ${communicationMethod}, Details: ${formData.details}`
      },
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    try {
      const res = await fetch('/api/book-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Booking failed');
      
      setSubmitted(true);
    } catch (err) {
      console.error("Booking error:", err);
      alert("There was a problem booking your slot. Please try again.");
    }
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

      {/* UNIFIED HERO SECTION */}
      <header className="unified-hero-section">
        <div className="container unified-hero-container">
          <div className="unified-hero-content">
            <span className="unified-hero-tagline">GET IN TOUCH</span>
            <h1 className="unified-hero-title">
              We're so glad you're here.
            </h1>
            <p className="unified-hero-subheadline">
              Tell us a little about you and your business &mdash; this takes about 3 minutes, then you'll pick a time for your free consult call.
            </p>
          </div>
        </div>
      </header>

      {/* CONTACT FORM SECTION */}
      <section className="contact-form-section">
        <div className="contact-form-container">

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
                      <div className="calendar-month-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button 
                          type="button" 
                          onClick={handlePrevMonth} 
                          disabled={isCurrentMonthView}
                          style={{ background: 'none', border: 'none', cursor: isCurrentMonthView ? 'not-allowed' : 'pointer', opacity: isCurrentMonthView ? 0.3 : 1, fontSize: '18px', color: 'var(--espresso)' }}
                        >&lt;</button>
                        <span>{displayMonth}</span>
                        <button 
                          type="button" 
                          onClick={handleNextMonth}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--espresso)' }}
                        >&gt;</button>
                      </div>
                      <div className="calendar-days-grid">
                        <span className="day-name">Sun</span><span className="day-name">Mon</span><span className="day-name">Tue</span><span className="day-name">Wed</span><span className="day-name">Thu</span><span className="day-name">Fri</span><span className="day-name">Sat</span>
                        
                        {calendarGrid.map((dayObj, index) => {
                          const isSelected = selectedDate === dayObj.dateString;
                          const className = `day-num ${!dayObj.isCurrentMonth || dayObj.isPast ? 'muted' : 'active-slot'} ${isSelected ? 'selected' : ''}`;
                          return (
                            <span 
                              key={index}
                              className={className}
                              onClick={() => {
                                if (dayObj.isCurrentMonth && !dayObj.isPast) {
                                  setSelectedDate(dayObj.dateString);
                                }
                              }}
                              style={{ cursor: dayObj.isCurrentMonth && !dayObj.isPast ? 'pointer' : 'default' }}
                            >
                              {dayObj.day}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="scheduler-right-times">
                    <h4 className="times-day-title">{formatDisplayDate(selectedDate)}</h4>
                    <span className="timezone-label">Eastern Time - US &amp; Canada</span>

                    <div className="time-slots-column">
                      {isLoadingSlots ? (
                        <p style={{ fontSize: '13px', opacity: 0.7 }}>Loading available times...</p>
                      ) : slotError ? (
                        <p style={{ fontSize: '13px', color: 'red' }}>{slotError}</p>
                      ) : availableSlots[selectedDate] && availableSlots[selectedDate].length > 0 ? (
                        <>
                          <span className="time-period-label">Available Times</span>
                          {availableSlots[selectedDate].map((slotObj, idx) => {
                            const dateObj = new Date(slotObj.time);
                            const timeString = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                            return (
                              <button 
                                key={idx}
                                type="button" 
                                className={`time-pill-btn ${selectedTime === slotObj.time ? 'active' : ''}`}
                                onClick={() => setSelectedTime(slotObj.time)}
                              >
                                {timeString}
                              </button>
                            );
                          })}
                        </>
                      ) : (
                        <p style={{ fontSize: '13px', opacity: 0.7 }}>No slots available for this date.</p>
                      )}
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
