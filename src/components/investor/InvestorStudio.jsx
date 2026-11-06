import React, { useState, useEffect } from 'react';

export default function InvestorStudio() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & filter state
  const [locationInput, setLocationInput] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [strategyFilter, setStrategyFilter] = useState('all');

  // Applied filter state (filters saved properties in browser)
  const [appliedFilters, setAppliedFilters] = useState({
    location: '',
    type: 'all',
    strategy: 'all'
  });

  const fetchProperties = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/investor/properties');
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Unauthorized. Please log in to access Investor Studio.');
        }
        throw new Error(`Failed to load saved properties (HTTP ${res.status}).`);
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.properties || []);
      setProperties(list);
    } catch (err) {
      console.error('Error fetching investor properties:', err);
      setError(err.message || 'An unexpected error occurred while fetching properties.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    setAppliedFilters({
      location: locationInput.trim().toLowerCase(),
      type: typeFilter,
      strategy: strategyFilter
    });
  };

  const handleClearFilters = () => {
    setLocationInput('');
    setTypeFilter('all');
    setStrategyFilter('all');
    setAppliedFilters({ location: '', type: 'all', strategy: 'all' });
  };

  // Filter properties in memory based on location text, type, and strategy
  const filteredProperties = properties.filter((p) => {
    // 1. Location match (address, city, or zip)
    if (appliedFilters.location) {
      const q = appliedFilters.location;
      const addrMatch = p.address && p.address.toLowerCase().includes(q);
      const cityMatch = p.city && p.city.toLowerCase().includes(q);
      const zipMatch = p.zip && p.zip.toLowerCase().includes(q);
      const countyMatch = p.county && p.county.toLowerCase().includes(q);
      if (!addrMatch && !cityMatch && !zipMatch && !countyMatch) {
        return false;
      }
    }

    // 2. Property type match
    if (appliedFilters.type !== 'all') {
      if (appliedFilters.type === 'condo_townhome') {
        if (p.property_type !== 'condo' && p.property_type !== 'townhome') {
          return false;
        }
      } else if (p.property_type !== appliedFilters.type) {
        return false;
      }
    }

    // 3. Strategy match
    if (appliedFilters.strategy !== 'all') {
      if (p.strategy !== appliedFilters.strategy) {
        return false;
      }
    }

    return true;
  });

  const formatPrice = (val) => {
    if (val == null || val === '') return 'Price upon request';
    const num = Number(val);
    if (isNaN(num)) return `$${val}`;
    return `$${num.toLocaleString('en-US')}`;
  };

  const formatPricePerSqft = (price, sqft) => {
    if (!price || !sqft) return '—';
    const numPrice = Number(price);
    const numSqft = Number(sqft);
    if (!numPrice || !numSqft) return '—';
    return `$${Math.round(numPrice / numSqft).toLocaleString('en-US')}/sqft`;
  };

  const buildSpecsLine = (p) => {
    const parts = [];
    if (p.beds != null && p.beds !== '') parts.push(`${p.beds} bd`);
    if (p.baths != null && p.baths !== '') parts.push(`${p.baths} ba`);
    if (p.sqft != null && p.sqft !== '') parts.push(`${Number(p.sqft).toLocaleString('en-US')} sqft`);
    if (p.year_built != null && p.year_built !== '') parts.push(`Built ${p.year_built}`);
    return parts.join(' · ');
  };

  const formatStatus = (status) => {
    if (!status) return 'WATCHING';
    return String(status).replace(/_/g, ' ').toUpperCase();
  };

  const formatStrategy = (strategy) => {
    if (!strategy) return '—';
    return String(strategy).toUpperCase();
  };

  const isFiltered = appliedFilters.location || appliedFilters.type !== 'all' || appliedFilters.strategy !== 'all';

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <style>{`
        /* Hero & Display Typography */
        .investor-hero-title {
          font-family: var(--font-display, 'Atelier Fleur', Georgia, serif);
          font-weight: 400;
          letter-spacing: -0.02em;
          line-height: 1.15;
          color: var(--espresso, #34292A);
        }
        .investor-hero-title i,
        .investor-hero-title em {
          font-family: var(--font-display, 'Atelier Fleur', Georgia, serif);
          font-style: italic;
          font-weight: 400;
        }

        /* Pill Search Bar */
        .investor-search-container {
          max-width: 900px;
          margin: 0 auto 64px auto;
        }
        .investor-search-bar {
          display: flex;
          align-items: center;
          background: #ffffff;
          border: 1px solid rgba(52, 41, 42, 0.12);
          border-radius: 60px;
          padding: 8px 10px 8px 24px;
          box-shadow: 0 4px 20px rgba(52, 41, 42, 0.05);
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .investor-search-bar:focus-within {
          border-color: var(--secondary-color, #41101B);
          box-shadow: 0 6px 24px rgba(65, 16, 27, 0.08);
        }
        .investor-search-field {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 4px 18px;
          min-width: 0;
        }
        .investor-search-field:first-of-type {
          padding-left: 0;
        }
        .investor-search-label {
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(52, 41, 42, 0.55);
          margin-bottom: 3px;
          display: block;
        }
        .investor-search-input,
        .investor-search-select {
          border: none;
          outline: none;
          background: transparent;
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 14px;
          color: var(--espresso, #1E1509);
          padding: 3px 0;
          margin: 0;
          width: 100%;
          line-height: 1.4;
          box-sizing: border-box;
        }
        .investor-search-input::placeholder {
          color: rgba(52, 41, 42, 0.4);
        }
        .investor-search-select {
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2334292A' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 2px center;
          padding-right: 18px;
        }
        .investor-search-select option {
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          color: #1E1509;
          background: #ffffff;
        }
        .investor-search-divider {
          width: 1px;
          height: 36px;
          background: rgba(52, 41, 42, 0.1);
          flex-shrink: 0;
        }
        .investor-search-btn {
          background-color: var(--secondary-color, #41101B);
          color: var(--lighter-tone, #FAF8F5);
          border: none;
          border-radius: 50px;
          padding: 14px 28px;
          font-family: var(--font-sans, 'Montserrat', sans-serif);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: background-color 0.2s ease, transform 0.1s ease;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .investor-search-btn:hover {
          background-color: #5E1627;
        }

        /* Property Cards Grid */
        .investor-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
        }
        .investor-card {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid rgba(52, 41, 42, 0.08);
          box-shadow: 0 4px 16px rgba(52, 41, 42, 0.03);
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: flex;
          flex-direction: column;
        }
        .investor-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(52, 41, 42, 0.07);
        }

        /* Responsive Breakpoints */
        @media (max-width: 860px) {
          .investor-search-bar {
            flex-direction: column;
            border-radius: 20px;
            padding: 20px;
            gap: 16px;
            align-items: stretch;
          }
          .investor-search-divider {
            display: none;
          }
          .investor-search-field {
            padding: 0 !important;
          }
          .investor-search-select {
            background-position: right 6px center;
          }
          .investor-search-btn {
            width: 100% !important;
            justify-content: center;
          }
        }
        @media (max-width: 600px) {
          .investor-grid {
            grid-template-columns: 1fr;
          }
          .investor-empty-card {
            padding: 36px 20px !important;
          }
        }
      `}</style>

      {/* HERO SECTION - MATCHING DASHBOARD / OVERVIEW EXACTLY */}
      <header style={{ marginBottom: '40px', textAlign: 'center' }}>
        {/* Eyebrow: Matches "OWNER PORTAL" in Overview.jsx */}
        <span style={{
          display: 'block',
          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
          fontSize: '12px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(52, 41, 42, 0.6)',
          marginBottom: '16px'
        }}>
          INVESTOR STUDIO · PRIVATE
        </span>

        {/* Headline: Scaled display serif, italic on line 2, centered */}
        <h1 className="investor-hero-title" style={{
          fontSize: 'clamp(36px, 4.5vw, 60px)',
          margin: '0 auto 20px auto',
          textAlign: 'center',
          maxWidth: '850px'
        }}>
          Find the property.<br />
          <i>Know the numbers.</i>
        </h1>

        {/* Body Text: Matches Overview.jsx intro paragraph, centered, max-width ~620px */}
        <p style={{
          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
          fontSize: '15px',
          color: 'rgba(52, 41, 42, 0.7)',
          margin: '0 auto',
          maxWidth: '620px',
          lineHeight: '1.6',
          textAlign: 'center'
        }}>
          Search Broward and Palm Beach, pull sold comps, underwrite a deal and save everything to your own database.
        </p>
      </header>

      {/* PILL SEARCH BAR - CENTERED UNDER TEXT (MAX-WIDTH ~900px) */}
      <form onSubmit={handleSearchSubmit} className="investor-search-container">
        <div className="investor-search-bar">
          
          {/* 1. LOCATION */}
          <div className="investor-search-field">
            <label htmlFor="investor-loc" className="investor-search-label">
              LOCATION
            </label>
            <input
              id="investor-loc"
              type="text"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              placeholder="Address, city or ZIP"
              className="investor-search-input"
            />
          </div>

          <div className="investor-search-divider" />

          {/* 2. PROPERTY TYPE */}
          <div className="investor-search-field">
            <label htmlFor="investor-type" className="investor-search-label">
              PROPERTY TYPE
            </label>
            <select
              id="investor-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="investor-search-select"
            >
              <option value="all">Any</option>
              <option value="single_family">Single-family</option>
              <option value="condo_townhome">Condo / townhome</option>
              <option value="multifamily_2_9">Multifamily 2–9 units</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="investor-search-divider" />

          {/* 3. STRATEGY */}
          <div className="investor-search-field">
            <label htmlFor="investor-strat" className="investor-search-label">
              STRATEGY
            </label>
            <select
              id="investor-strat"
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              className="investor-search-select"
            >
              <option value="all">Any</option>
              <option value="rental">Rental</option>
              <option value="flip">Flip</option>
              <option value="brrrr">BRRRR</option>
            </select>
          </div>

          {/* 4. BURGUNDY BUTTON */}
          <button type="submit" className="investor-search-btn">
            SEARCH &rarr;
          </button>
        </div>
      </form>

      {/* SAVED PROPERTIES SECTION */}
      <section style={{ marginTop: '64px' }}>
        {/* Section Heading: Left-aligned large serif matching homepage section titles */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '28px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: 'clamp(32px, 3.8vw, 44px)',
              fontWeight: 400,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              color: 'var(--espresso, #34292A)',
              margin: '0 0 6px 0',
              textAlign: 'left'
            }}>
              Your saved properties
            </h2>
            <p style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '13px',
              color: 'rgba(52, 41, 42, 0.6)',
              margin: 0
            }}>
              {properties.length > 0 ? (
                isFiltered
                  ? `Showing ${filteredProperties.length} of ${properties.length} saved properties`
                  : `${properties.length} total saved ${properties.length === 1 ? 'property' : 'properties'}`
              ) : null}
            </p>
          </div>

          {isFiltered && (
            <button
              type="button"
              onClick={handleClearFilters}
              style={{
                background: 'none',
                border: 'none',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12px',
                color: 'var(--secondary-color, #41101B)',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div style={{
            padding: '36px 0',
            textAlign: 'center',
            color: 'rgba(52, 41, 42, 0.7)',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '14px'
          }}>
            Loading saved properties...
          </div>
        )}

        {/* ERROR STATE */}
        {!loading && error && (
          <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            backgroundColor: '#FFF7F5',
            border: '1px solid rgba(192, 57, 43, 0.2)',
            borderRadius: '12px',
            padding: '24px',
            color: '#A93226',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '14px',
            lineHeight: 1.5
          }}>
            <strong style={{ display: 'block', marginBottom: '4px' }}>Unable to load properties</strong>
            {error}
          </div>
        )}

        {/* EMPTY STATE - MATCHING "DASHBOARD IS ACTIVE" CARD EXACTLY */}
        {!loading && !error && properties.length === 0 && (
          <div className="investor-empty-card" style={{
            maxWidth: '800px',
            margin: '0 auto',
            textAlign: 'center',
            backgroundColor: '#fff',
            border: '1px solid rgba(52, 41, 42, 0.1)',
            borderRadius: '16px',
            padding: '48px',
            boxShadow: '0 4px 24px rgba(52, 41, 42, 0.05)'
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: '24px',
              color: 'var(--espresso, #34292A)',
              marginBottom: '16px',
              fontWeight: 400
            }}>
              No saved properties yet
            </h3>
            <p style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '15px',
              color: 'rgba(52, 41, 42, 0.7)',
              lineHeight: '1.6',
              margin: 0
            }}>
              Add your first property to start running comps and numbers.
            </p>
          </div>
        )}

        {/* EMPTY FILTER STATE - NO MATCHES */}
        {!loading && !error && properties.length > 0 && filteredProperties.length === 0 && (
          <div className="investor-empty-card" style={{
            maxWidth: '800px',
            margin: '0 auto',
            textAlign: 'center',
            backgroundColor: '#fff',
            border: '1px solid rgba(52, 41, 42, 0.1)',
            borderRadius: '16px',
            padding: '48px',
            boxShadow: '0 4px 24px rgba(52, 41, 42, 0.05)'
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: '24px',
              color: 'var(--espresso, #34292A)',
              marginBottom: '16px',
              fontWeight: 400
            }}>
              No matching properties
            </h3>
            <p style={{
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '15px',
              color: 'rgba(52, 41, 42, 0.7)',
              lineHeight: '1.6',
              margin: '0 0 20px 0'
            }}>
              None of your saved properties match the current search filters.
            </p>
            <button
              type="button"
              onClick={handleClearFilters}
              style={{
                backgroundColor: 'var(--lighter-tone, #FAF8F5)',
                border: '1px solid rgba(52, 41, 42, 0.15)',
                borderRadius: '50px',
                padding: '10px 22px',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--espresso, #1E1509)',
                cursor: 'pointer'
              }}
            >
              Reset Search Filters
            </button>
          </div>
        )}

        {/* PROPERTY CARDS GRID */}
        {!loading && !error && filteredProperties.length > 0 && (
          <div className="investor-grid">
            {filteredProperties.map((p) => {
              const specs = buildSpecsLine(p);
              const pricePerSqft = formatPricePerSqft(p.list_price, p.sqft);
              const cityStateZip = [p.city, p.state || 'FL', p.zip].filter(Boolean).join(', ');

              return (
                <div key={p.id} className="investor-card">
                  {/* Photo Block: Warm brown tone with cream status pill */}
                  <div style={{
                    height: '180px',
                    background: 'linear-gradient(145deg, #2E2218 0%, #4A382A 100%)',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(250, 248, 245, 0.35)'
                  }}>
                    {/* Status Pill in Cream */}
                    <div style={{
                      position: 'absolute',
                      top: '12px',
                      left: '12px',
                      backgroundColor: 'var(--lighter-tone, #FAF8F5)',
                      color: 'var(--secondary-color, #41101B)',
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      padding: '4px 10px',
                      borderRadius: '50px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}>
                      {formatStatus(p.status)}
                    </div>

                    {/* Architectural placeholder icon */}
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                      <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                  </div>

                  {/* Card Body */}
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    {/* List Price */}
                    <div style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: 'var(--espresso, #1E1509)',
                      marginBottom: '6px',
                      letterSpacing: '-0.01em'
                    }}>
                      {formatPrice(p.list_price)}
                    </div>

                    {/* Address & City, State Zip */}
                    <div style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--espresso, #34292A)',
                      marginBottom: '2px',
                      lineHeight: 1.3
                    }}>
                      {p.address}
                    </div>
                    {cityStateZip && (
                      <div style={{
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '12px',
                        color: 'rgba(52, 41, 42, 0.65)',
                        marginBottom: '12px'
                      }}>
                        {cityStateZip}
                      </div>
                    )}

                    {/* Specs Line (e.g. 3 bd · 2 ba · 1,640 sqft · Built 1974) */}
                    {specs && (
                      <div style={{
                        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                        fontSize: '12px',
                        color: 'rgba(52, 41, 42, 0.75)',
                        marginBottom: '16px'
                      }}>
                        {specs}
                      </div>
                    )}

                    {/* Bottom Row: $/SQFT and STRATEGY */}
                    <div style={{
                      marginTop: 'auto',
                      paddingTop: '14px',
                      borderTop: '1px solid rgba(52, 41, 42, 0.08)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '11px',
                      letterSpacing: '0.04em'
                    }}>
                      <div>
                        <span style={{ color: 'rgba(52, 41, 42, 0.5)', textTransform: 'uppercase', marginRight: '6px' }}>$/SQFT:</span>
                        <strong style={{ color: 'var(--espresso, #1E1509)' }}>{pricePerSqft}</strong>
                      </div>
                      <div style={{
                        backgroundColor: 'rgba(65, 16, 27, 0.06)',
                        color: 'var(--secondary-color, #41101B)',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        letterSpacing: '0.06em',
                        fontSize: '10px'
                      }}>
                        {formatStrategy(p.strategy)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
