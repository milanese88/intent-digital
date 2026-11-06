import React, { useState, useEffect } from 'react';

export default function InvestorStudio() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & filter state
  const [locationInput, setLocationInput] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [strategyFilter, setStrategyFilter] = useState('all');

  // Applied filter state (triggers when Search button is clicked or form submitted)
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
        throw new Error('Failed to load saved properties. Server returned ' + res.status);
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

  // Filter properties based on applied filters
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
          border-color: #41101B;
          box-shadow: 0 6px 24px rgba(65, 16, 27, 0.08);
        }
        .investor-search-field {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 4px 16px;
        }
        .investor-search-divider {
          width: 1px;
          height: 36px;
          background: rgba(52, 41, 42, 0.1);
        }
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
            padding: 0;
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
        }
      `}</style>

      {/* HEADER SECTION */}
      <header style={{ marginBottom: '36px' }}>
        <div style={{
          fontFamily: 'Montserrat, sans-serif',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#9E4B27',
          marginBottom: '12px'
        }}>
          INVESTOR STUDIO · PRIVATE
        </div>

        <h1 style={{
          fontFamily: '"Atelier Fleur", Georgia, serif',
          fontSize: 'clamp(32px, 4vw, 44px)',
          fontWeight: 400,
          lineHeight: 1.15,
          color: '#1E1509',
          margin: '0 0 16px 0',
          letterSpacing: '-0.02em'
        }}>
          Find the property.<br />
          <span style={{ fontStyle: 'italic', color: '#41101B' }}>Know the numbers.</span>
        </h1>

        <p style={{
          fontFamily: 'Montserrat, sans-serif',
          fontSize: '15px',
          color: 'rgba(52, 41, 42, 0.75)',
          maxWidth: '680px',
          margin: 0,
          lineHeight: 1.6
        }}>
          Search Broward and Palm Beach, pull sold comps, underwrite a deal and save everything to your own database.
        </p>
      </header>

      {/* PILL SEARCH BAR */}
      <form onSubmit={handleSearchSubmit} style={{ marginBottom: '44px' }}>
        <div className="investor-search-bar">
          
          {/* 1. LOCATION */}
          <div className="investor-search-field">
            <label htmlFor="investor-loc" style={{
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(52, 41, 42, 0.55)',
              marginBottom: '4px'
            }}>
              LOCATION
            </label>
            <input
              id="investor-loc"
              type="text"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              placeholder="Address, city or ZIP"
              style={{
                border: 'none',
                outline: 'none',
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '13px',
                color: '#1E1509',
                background: 'transparent',
                padding: '2px 0'
              }}
            />
          </div>

          <div className="investor-search-divider" />

          {/* 2. PROPERTY TYPE */}
          <div className="investor-search-field">
            <label htmlFor="investor-type" style={{
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(52, 41, 42, 0.55)',
              marginBottom: '4px'
            }}>
              PROPERTY TYPE
            </label>
            <select
              id="investor-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '13px',
                color: '#1E1509',
                background: 'transparent',
                cursor: 'pointer',
                padding: '2px 0'
              }}
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
            <label htmlFor="investor-strat" style={{
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(52, 41, 42, 0.55)',
              marginBottom: '4px'
            }}>
              STRATEGY
            </label>
            <select
              id="investor-strat"
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '13px',
                color: '#1E1509',
                background: 'transparent',
                cursor: 'pointer',
                padding: '2px 0'
              }}
            >
              <option value="all">Any</option>
              <option value="rental">Rental</option>
              <option value="flip">Flip</option>
              <option value="brrrr">BRRRR</option>
            </select>
          </div>

          {/* 4. BUTTON */}
          <button
            type="submit"
            className="investor-search-btn"
            style={{
              backgroundColor: '#41101B',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '50px',
              padding: '14px 26px',
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.2s ease, transform 0.1s ease',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#5E1627'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#41101B'; }}
          >
            SEARCH &rarr;
          </button>
        </div>
      </form>

      {/* SAVED PROPERTIES SECTION */}
      <section>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <h2 style={{
              fontFamily: '"Atelier Fleur", Georgia, serif',
              fontSize: '24px',
              color: '#1E1509',
              margin: '0 0 4px 0',
              fontWeight: 400
            }}>
              Your saved properties
            </h2>
            <p style={{
              fontFamily: 'Montserrat, sans-serif',
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
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '12px',
                color: '#41101B',
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
            fontFamily: 'Montserrat, sans-serif',
            fontSize: '14px'
          }}>
            Loading saved properties...
          </div>
        )}

        {/* ERROR STATE */}
        {!loading && error && (
          <div style={{
            backgroundColor: '#FFF7F5',
            border: '1px solid rgba(192, 57, 43, 0.2)',
            borderRadius: '12px',
            padding: '24px',
            color: '#A93226',
            fontFamily: 'Montserrat, sans-serif',
            fontSize: '14px',
            lineHeight: 1.5
          }}>
            <strong style={{ display: 'block', marginBottom: '4px' }}>Unable to load properties</strong>
            {error}
          </div>
        )}

        {/* EMPTY STATE - NO SAVED PROPERTIES YET */}
        {!loading && !error && properties.length === 0 && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid rgba(52, 41, 42, 0.08)',
            padding: '56px 24px',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(52, 41, 42, 0.02)'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#FAF8F5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              color: '#8C796A'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </div>
            <h3 style={{
              fontFamily: '"Atelier Fleur", Georgia, serif',
              fontSize: '22px',
              color: '#1E1509',
              margin: '0 0 8px 0',
              fontWeight: 400
            }}>
              No saved properties yet
            </h3>
            <p style={{
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '14px',
              color: 'rgba(52, 41, 42, 0.65)',
              margin: 0,
              maxWidth: '420px',
              marginLeft: 'auto',
              marginRight: 'auto',
              lineHeight: 1.5
            }}>
              Add your first property to start running comps and numbers.
            </p>
          </div>
        )}

        {/* EMPTY FILTER STATE - NO MATCHES */}
        {!loading && !error && properties.length > 0 && filteredProperties.length === 0 && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid rgba(52, 41, 42, 0.08)',
            padding: '48px 24px',
            textAlign: 'center'
          }}>
            <h3 style={{
              fontFamily: '"Atelier Fleur", Georgia, serif',
              fontSize: '20px',
              color: '#1E1509',
              margin: '0 0 8px 0',
              fontWeight: 400
            }}>
              No matching properties
            </h3>
            <p style={{
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '14px',
              color: 'rgba(52, 41, 42, 0.65)',
              margin: '0 0 16px 0'
            }}>
              None of your saved properties match the current filters.
            </p>
            <button
              type="button"
              onClick={handleClearFilters}
              style={{
                backgroundColor: '#FAF8F5',
                border: '1px solid rgba(52, 41, 42, 0.15)',
                borderRadius: '50px',
                padding: '10px 20px',
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '12px',
                fontWeight: 600,
                color: '#1E1509',
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
                  {/* PHOTO BLOCK (Warm brown placeholder with status pill) */}
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
                      backgroundColor: '#FAF8F5',
                      color: '#41101B',
                      fontFamily: 'Montserrat, sans-serif',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      padding: '4px 10px',
                      borderRadius: '50px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}>
                      {formatStatus(p.status)}
                    </div>

                    {/* Placeholder architectural house icon */}
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                      <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                  </div>

                  {/* CARD BODY */}
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    {/* List Price */}
                    <div style={{
                      fontFamily: '"Atelier Fleur", Georgia, serif',
                      fontSize: '24px',
                      fontWeight: 600,
                      color: '#1E1509',
                      marginBottom: '6px',
                      letterSpacing: '-0.01em'
                    }}>
                      {formatPrice(p.list_price)}
                    </div>

                    {/* Address & City, State Zip */}
                    <div style={{
                      fontFamily: 'Montserrat, sans-serif',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#34292A',
                      marginBottom: '2px',
                      lineHeight: 1.3
                    }}>
                      {p.address}
                    </div>
                    {cityStateZip && (
                      <div style={{
                        fontFamily: 'Montserrat, sans-serif',
                        fontSize: '12px',
                        color: 'rgba(52, 41, 42, 0.65)',
                        marginBottom: '12px'
                      }}>
                        {cityStateZip}
                      </div>
                    )}

                    {/* Specs line (e.g. 3 bd · 2 ba · 1,640 sqft · Built 1974) */}
                    {specs && (
                      <div style={{
                        fontFamily: 'Montserrat, sans-serif',
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
                      fontFamily: 'Montserrat, sans-serif',
                      fontSize: '11px',
                      letterSpacing: '0.04em'
                    }}>
                      <div>
                        <span style={{ color: 'rgba(52, 41, 42, 0.5)', textTransform: 'uppercase', marginRight: '6px' }}>$/SQFT:</span>
                        <strong style={{ color: '#1E1509' }}>{pricePerSqft}</strong>
                      </div>
                      <div style={{
                        backgroundColor: 'rgba(65, 16, 27, 0.06)',
                        color: '#41101B',
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
