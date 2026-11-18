import React from 'react';
import {
  UNAVAILABLE_CARD_TEXT,
  sanitizeGettingAroundCard,
  sanitizeSchoolsCard,
  sanitizePeopleHousingCard,
  sanitizeSafetyCard
} from './locationCardGuards.js';

function RefreshButton({ onClick, loading, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={ariaLabel}
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(52, 41, 42, 0.2)',
        borderRadius: '999px',
        padding: '5px 12px',
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
        color: 'var(--espresso, #34292A)',
        cursor: loading ? 'wait' : 'pointer',
        whiteSpace: 'nowrap'
      }}
    >
      {loading ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}

function UnavailableNotice({ propertyAddress }) {
  return (
    <div
      style={{
        backgroundColor: '#FAF8F5',
        border: '1px solid rgba(52, 41, 42, 0.12)',
        borderRadius: '12px',
        padding: '20px 18px',
        color: 'rgba(52, 41, 42, 0.72)',
        fontSize: '13px',
        lineHeight: 1.5
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
        {UNAVAILABLE_CARD_TEXT}
      </div>
      {propertyAddress && (
        <div style={{ fontSize: '11.5px', color: 'rgba(52, 41, 42, 0.56)', marginTop: '4px' }}>
          Target parcel: {propertyAddress}
        </div>
      )}
    </div>
  );
}

function ProvenanceFooter({ provenanceLine }) {
  if (!provenanceLine) return null;
  return (
    <div
      data-testid="location-card-provenance"
      style={{
        borderTop: '1px solid #E4DDD3',
        paddingTop: '12px',
        fontSize: '11px',
        color: 'rgba(52, 41, 42, 0.6)',
        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
        lineHeight: 1.45
      }}
    >
      {provenanceLine}
    </div>
  );
}

function gradeBadgeColor(grade) {
  const g = String(grade || '').trim().toUpperCase();
  if (g.startsWith('A')) return '#3F5A3A';
  if (g.startsWith('B')) return '#274D73';
  if (g.startsWith('C')) return '#52453C';
  if (g.startsWith('D') || g.startsWith('F')) return '#41101B';
  return 'rgba(52, 41, 42, 0.55)';
}

export default function LocationSection({
  propertyAddress = '',
  county = 'Broward',
  lat = null,
  lng = null,
  mapboxToken = '',
  locationData = null,
  loading = false,
  refreshingSection = null,
  onRefreshSection
}) {
  const hasCoords = lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));
  const miniMapUrl =
    hasCoords && mapboxToken
      ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+41101B(${lng},${lat})/${lng},${lat},13.2,0/500x200@2x?access_token=${mapboxToken}`
      : null;

  const safeGettingAround = sanitizeGettingAroundCard(locationData?.getting_around, propertyAddress);
  const safeSchools = sanitizeSchoolsCard(locationData?.schools, propertyAddress, county, lat);
  const safePeople = sanitizePeopleHousingCard(locationData?.people_housing, propertyAddress);
  const safeSafety = sanitizeSafetyCard(locationData?.safety, propertyAddress);

  const isRefreshing = (sec) => loading || refreshingSection === 'all' || refreshingSection === sec;

  return (
    <>
      {/* ROW 1: GETTING AROUND + SCHOOLS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px'
        }}
      >
        {/* CARD 1: GETTING AROUND */}
        <div
          id="getting-around-card"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4DDD3',
            borderRadius: '20px',
            padding: '26px 28px',
            boxShadow: '0 4px 20px rgba(52, 41, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '20px'
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '18px'
              }}
            >
              <div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                    fontSize: '24px',
                    fontWeight: 400,
                    color: 'var(--espresso, #1E1509)',
                    margin: '0 0 4px 0'
                  }}
                >
                  Getting around
                </h3>
                {propertyAddress && (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '11.5px',
                      color: 'rgba(52, 41, 42, 0.72)',
                      marginBottom: '3px'
                    }}
                  >
                    {propertyAddress}
                  </div>
                )}
                <p
                  style={{
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '12px',
                    color: 'rgba(52, 41, 42, 0.6)',
                    margin: 0
                  }}
                >
                  Nearest highway junctions and daily places from parcel coordinates.
                </p>
              </div>

              <RefreshButton
                loading={isRefreshing('getting_around')}
                ariaLabel="Refresh Getting around data"
                onClick={() => onRefreshSection && onRefreshSection('getting_around')}
              />
            </div>

            {loading && !safeGettingAround.available ? (
              <div style={{ padding: '18px 0', fontSize: '13px', color: 'rgba(52, 41, 42, 0.6)' }}>
                Checking nearby places and driving times…
              </div>
            ) : !safeGettingAround.available ? (
              <UnavailableNotice propertyAddress={propertyAddress} />
            ) : (
              <>
                {/* Highways & On-Ramps (only when imported in fl_highway_junctions) */}
                {safeGettingAround.highways.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        color: 'rgba(52, 41, 42, 0.55)',
                        textTransform: 'uppercase',
                        display: 'block',
                        marginBottom: '10px'
                      }}
                    >
                      Major Highways &amp; On-Ramps
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {safeGettingAround.highways.map((hw, idx) => (
                        <div
                          key={`${hw.route}-${idx}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            padding: '9px 12px',
                            backgroundColor: '#FAF8F5',
                            borderRadius: '10px',
                            border: '1px solid rgba(228, 221, 211, 0.8)'
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'var(--espresso, #1E1509)'
                              }}
                            >
                              {hw.name}
                            </div>
                            <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.58)' }}>
                              {hw.route}
                              {hw.exit_ref ? ` · Exit ${hw.exit_ref}` : ''}
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {hw.distance_mi != null && (
                              <div
                                style={{
                                  fontSize: '12.5px',
                                  fontWeight: 700,
                                  color: 'var(--espresso, #1E1509)'
                                }}
                              >
                                {hw.distance_mi} mi
                              </div>
                            )}
                            {hw.drive_minutes != null && (
                              <div
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: 'var(--burgundy, #41101B)'
                                }}
                              >
                                {hw.drive_minutes} min drive
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Daily Places */}
                {safeGettingAround.places.length > 0 && (
                  <div style={{ marginBottom: miniMapUrl ? '18px' : 0 }}>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        color: 'rgba(52, 41, 42, 0.55)',
                        textTransform: 'uppercase',
                        display: 'block',
                        marginBottom: '10px'
                      }}
                    >
                      Daily Needs &amp; Places
                    </span>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                        gap: '8px'
                      }}
                    >
                      {safeGettingAround.places.map((place, idx) => (
                        <div
                          key={`${place.name}-${idx}`}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '9px 11px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid rgba(228, 221, 211, 0.8)',
                            borderRadius: '10px'
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: '12.5px',
                                fontWeight: 600,
                                color: 'var(--espresso, #1E1509)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {place.name}
                            </div>
                            <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.55)' }}>
                              {place.category}
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {place.distance_mi != null && (
                              <span
                                style={{
                                  fontSize: '11.5px',
                                  fontWeight: 600,
                                  color: 'var(--espresso, #1E1509)'
                                }}
                              >
                                {place.distance_mi} mi
                              </span>
                            )}
                            {place.drive_minutes != null && (
                              <span
                                style={{
                                  display: 'block',
                                  fontSize: '10.5px',
                                  color: 'rgba(52, 41, 42, 0.6)'
                                }}
                              >
                                {place.drive_minutes} min
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {miniMapUrl && (
                  <div
                    style={{
                      position: 'relative',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '1px solid #E4DDD3'
                    }}
                  >
                    <img
                      src={miniMapUrl}
                      alt={`Street map centered on ${propertyAddress || 'subject property'}`}
                      loading="lazy"
                      style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '6px',
                        right: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.88)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '9.5px',
                        color: 'rgba(52, 41, 42, 0.7)'
                      }}
                    >
                      © Mapbox © OpenStreetMap
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <ProvenanceFooter provenanceLine={safeGettingAround.provenanceLine} />
        </div>

        {/* CARD 2: SCHOOLS */}
        <div
          id="schools-card"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4DDD3',
            borderRadius: '20px',
            padding: '26px 28px',
            boxShadow: '0 4px 20px rgba(52, 41, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '20px'
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '16px'
              }}
            >
              <div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                    fontSize: '24px',
                    fontWeight: 400,
                    color: 'var(--espresso, #1E1509)',
                    margin: '0 0 4px 0'
                  }}
                >
                  Schools
                </h3>
                <p
                  style={{
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '12px',
                    color: 'rgba(52, 41, 42, 0.6)',
                    margin: 0
                  }}
                >
                  Public school attendance boundaries &amp; FLDOE accountability grades.
                </p>
              </div>

              <RefreshButton
                loading={isRefreshing('schools')}
                ariaLabel="Refresh Schools data"
                onClick={() => onRefreshSection && onRefreshSection('schools')}
              />
            </div>

            {loading && !safeSchools.available ? (
              <div style={{ padding: '18px 0', fontSize: '13px', color: 'rgba(52, 41, 42, 0.6)' }}>
                Checking school attendance boundaries…
              </div>
            ) : !safeSchools.available ? (
              <UnavailableNotice propertyAddress={propertyAddress} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {!safeSchools.zone_verified && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignSelf: 'flex-start',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      border: '1px solid var(--burgundy, #41101B)',
                      color: 'var(--burgundy, #41101B)',
                      fontSize: '11px',
                      fontWeight: 600
                    }}
                  >
                    Attendance zone not verified
                  </div>
                )}

                {safeSchools.schools.map((sch, idx) => (
                  <div
                    key={`${sch.name}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '13px 14px',
                      backgroundColor: '#FAF8F5',
                      borderRadius: '14px',
                      border: '1px solid rgba(228, 221, 211, 0.85)'
                    }}
                  >
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        backgroundColor: gradeBadgeColor(sch.grade),
                        color: '#FFFFFF',
                        fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                        fontSize: sch.grade ? '26px' : '12px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      {sch.grade || 'N/R'}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          color: 'rgba(52, 41, 42, 0.55)',
                          textTransform: 'uppercase',
                          display: 'block'
                        }}
                      >
                        {sch.level}
                        {sch.grade_year ? ` · FLDOE ${sch.grade_year}` : ''}
                      </span>
                      <div
                        style={{
                          fontSize: '13.5px',
                          fontWeight: 700,
                          color: 'var(--espresso, #1E1509)'
                        }}
                      >
                        {sch.name}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'rgba(52, 41, 42, 0.65)',
                          marginTop: '2px'
                        }}
                      >
                        {!sch.zone_verified
                          ? `Attendance zone not verified${sch.distance_mi != null ? ` · ${sch.distance_mi} mi` : ''}`
                          : `Assigned attendance zone${sch.pct_points != null ? ` · ${sch.pct_points}% pts` : ''}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Mandatory District Boundary Locator Disclaimer */}
            <div
              style={{
                marginTop: '16px',
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: 'rgba(189, 211, 226, 0.2)',
                border: '1px solid rgba(133, 157, 206, 0.4)',
                fontSize: '11.5px',
                color: 'var(--espresso, #34292A)',
                lineHeight: 1.45
              }}
            >
              <span>{safeSchools.disclaimer} — </span>
              <a
                href={safeSchools.locator_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--burgundy, #41101B)',
                  fontWeight: 600,
                  textDecoration: 'underline'
                }}
              >
                {safeSchools.locator_label} &rarr;
              </a>
            </div>
          </div>

          <ProvenanceFooter provenanceLine={safeSchools.provenanceLine} />
        </div>
      </div>

      {/* ROW 2: PEOPLE & HOUSING + SAFETY (Safety hidden unless real FDLE agency data exists) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: safeSafety.available
            ? 'repeat(auto-fit, minmax(320px, 1fr))'
            : '1fr',
          gap: '24px'
        }}
      >
        {/* CARD 3: PEOPLE & HOUSING */}
        <div
          id="people-housing-card"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4DDD3',
            borderRadius: '20px',
            padding: '26px 28px',
            boxShadow: '0 4px 20px rgba(52, 41, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '20px'
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '18px'
              }}
            >
              <div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                    fontSize: '24px',
                    fontWeight: 400,
                    color: 'var(--espresso, #1E1509)',
                    margin: '0 0 4px 0'
                  }}
                >
                  People &amp; housing
                </h3>
                <p
                  style={{
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    fontSize: '12px',
                    color: 'rgba(52, 41, 42, 0.65)',
                    margin: 0
                  }}
                >
                  {safePeople.available
                    ? `${safePeople.tract_label} · ${safePeople.survey_years} vs. ${safePeople.county_name}`
                    : 'U.S. Census tract & county ACS 5-year socioeconomic profile.'}
                </p>
              </div>

              <RefreshButton
                loading={isRefreshing('people_housing')}
                ariaLabel="Refresh People and housing data"
                onClick={() => onRefreshSection && onRefreshSection('people_housing')}
              />
            </div>

            {loading && !safePeople.available ? (
              <div style={{ padding: '18px 0', fontSize: '13px', color: 'rgba(52, 41, 42, 0.6)' }}>
                Fetching U.S. Census tract &amp; ACS 5-year estimates…
              </div>
            ) : !safePeople.available ? (
              <UnavailableNotice propertyAddress={propertyAddress} />
            ) : (
              <>
                {safePeople.age_distribution.length > 0 && (
                  <div style={{ marginBottom: '22px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginBottom: '12px'
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          color: 'rgba(52, 41, 42, 0.55)',
                          textTransform: 'uppercase'
                        }}
                      >
                        Age Distribution ({safePeople.tract_label})
                      </span>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px',
                          fontSize: '11px',
                          color: 'rgba(52, 41, 42, 0.65)'
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span
                            style={{
                              width: '9px',
                              height: '9px',
                              backgroundColor: 'var(--espresso, #34292A)',
                              borderRadius: '2px',
                              display: 'inline-block'
                            }}
                          />
                          {safePeople.tract_label}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span
                            style={{
                              width: '9px',
                              height: '9px',
                              backgroundColor: '#859DCE',
                              borderRadius: '2px',
                              display: 'inline-block'
                            }}
                          />
                          {safePeople.county_name}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {safePeople.age_distribution.map((cohort) => (
                        <div
                          key={cohort.label}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '74px 1fr 98px',
                            alignItems: 'center',
                            gap: '12px',
                            fontSize: '11.5px'
                          }}
                        >
                          <span style={{ fontWeight: 600, color: 'var(--espresso, #1E1509)' }}>
                            {cohort.label}
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div
                              style={{
                                width: '100%',
                                height: '6px',
                                backgroundColor: 'rgba(52, 41, 42, 0.06)',
                                borderRadius: '3px',
                                overflow: 'hidden'
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, Number(cohort.tract_pct) * 2.5)}%`,
                                  height: '100%',
                                  backgroundColor: 'var(--espresso, #34292A)',
                                  borderRadius: '3px'
                                }}
                              />
                            </div>
                            {cohort.county_pct != null && (
                              <div
                                style={{
                                  width: '100%',
                                  height: '6px',
                                  backgroundColor: 'rgba(52, 41, 42, 0.06)',
                                  borderRadius: '3px',
                                  overflow: 'hidden'
                                }}
                              >
                                <div
                                  style={{
                                    width: `${Math.min(100, Number(cohort.county_pct) * 2.5)}%`,
                                    height: '100%',
                                    backgroundColor: '#859DCE',
                                    borderRadius: '3px'
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          <span
                            style={{
                              color: 'rgba(52, 41, 42, 0.72)',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono, monospace)'
                            }}
                          >
                            {cohort.tract_pct}%
                            {cohort.county_pct != null ? ` / ${cohort.county_pct}%` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: 'rgba(52, 41, 42, 0.55)',
                      textTransform: 'uppercase',
                      display: 'block',
                      marginBottom: '10px'
                    }}
                  >
                    Housing &amp; Socioeconomics ({safePeople.survey_years})
                  </span>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                      gap: '10px'
                    }}
                  >
                    {[
                      {
                        label: 'MEDIAN AGE',
                        val:
                          safePeople.tract.median_age != null
                            ? `${safePeople.tract.median_age} yrs`
                            : 'Not reported',
                        countyVal:
                          safePeople.county?.median_age != null
                            ? `${safePeople.county.median_age} yrs`
                            : null
                      },
                      {
                        label: 'MEDIAN INCOME',
                        val:
                          safePeople.tract.median_income != null
                            ? `$${safePeople.tract.median_income.toLocaleString()}`
                            : 'Not reported',
                        countyVal:
                          safePeople.county?.median_income != null
                            ? `$${safePeople.county.median_income.toLocaleString()}`
                            : null
                      },
                      {
                        label: 'OWNER-OCCUPIED',
                        val:
                          safePeople.tract.owner_occupied_pct != null
                            ? `${safePeople.tract.owner_occupied_pct}%`
                            : 'Not reported',
                        countyVal:
                          safePeople.county?.owner_occupied_pct != null
                            ? `${safePeople.county.owner_occupied_pct}%`
                            : null
                      },
                      {
                        label: 'RENTER-OCCUPIED',
                        val:
                          safePeople.tract.renter_occupied_pct != null
                            ? `${safePeople.tract.renter_occupied_pct}%`
                            : 'Not reported',
                        countyVal:
                          safePeople.county?.renter_occupied_pct != null
                            ? `${safePeople.county.renter_occupied_pct}%`
                            : null
                      },
                      {
                        label: 'MEDIAN RENT',
                        val:
                          safePeople.tract.median_rent != null
                            ? `$${safePeople.tract.median_rent.toLocaleString()}/mo`
                            : 'Not reported',
                        countyVal:
                          safePeople.county?.median_rent != null
                            ? `$${safePeople.county.median_rent.toLocaleString()}/mo`
                            : null
                      },
                      {
                        label: "BACHELOR'S+",
                        val:
                          safePeople.tract.bachelors_plus_pct != null
                            ? `${safePeople.tract.bachelors_plus_pct}%`
                            : 'Not reported',
                        countyVal:
                          safePeople.county?.bachelors_plus_pct != null
                            ? `${safePeople.county.bachelors_plus_pct}%`
                            : null
                      },
                      {
                        label: 'HOUSING VACANCY',
                        val:
                          safePeople.tract.vacancy_pct != null
                            ? `${safePeople.tract.vacancy_pct}%`
                            : 'Not reported',
                        countyVal:
                          safePeople.county?.vacancy_pct != null
                            ? `${safePeople.county.vacancy_pct}%`
                            : null
                      }
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        style={{
                          backgroundColor: '#FAF8F5',
                          border: '1px solid rgba(228, 221, 211, 0.85)',
                          borderRadius: '10px',
                          padding: '12px'
                        }}
                      >
                        <div
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            color: 'rgba(52, 41, 42, 0.55)',
                            textTransform: 'uppercase',
                            marginBottom: '4px'
                          }}
                        >
                          {stat.label}
                        </div>
                        <div
                          style={{
                            fontSize: '15.5px',
                            fontWeight: 700,
                            color: 'var(--espresso, #1E1509)'
                          }}
                        >
                          {stat.val}
                        </div>
                        {stat.countyVal && (
                          <div
                            style={{
                              fontSize: '10.5px',
                              color: 'rgba(52, 41, 42, 0.58)',
                              marginTop: '2px'
                            }}
                          >
                            County: {stat.countyVal}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <ProvenanceFooter provenanceLine={safePeople.provenanceLine} />
        </div>

        {/* CARD 4: SAFETY — Shown ONLY when real FDLE reporting-agency data is loaded */}
        {safeSafety.available && (
          <div
            id="safety-card"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E4DDD3',
              borderRadius: '20px',
              padding: '26px 28px',
              boxShadow: '0 4px 20px rgba(52, 41, 42, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '20px'
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px',
                  marginBottom: '16px'
                }}
              >
                <div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                      fontSize: '24px',
                      fontWeight: 400,
                      color: 'var(--espresso, #1E1509)',
                      margin: '0 0 4px 0'
                    }}
                  >
                    Safety
                  </h3>
                  <p
                    style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '12px',
                      color: 'rgba(52, 41, 42, 0.68)',
                      margin: 0
                    }}
                  >
                    {safeSafety.agency_name} &middot; {safeSafety.report_year} FDLE Agency Summary
                  </p>
                </div>

                <RefreshButton
                  loading={isRefreshing('safety')}
                  ariaLabel="Refresh Safety data"
                  onClick={() => onRefreshSection && onRefreshSection('safety')}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {safeSafety.violent_rate_per_100k != null && (
                  <div
                    style={{
                      padding: '14px',
                      backgroundColor: '#FAF8F5',
                      borderRadius: '12px',
                      border: '1px solid rgba(228, 221, 211, 0.85)'
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.6)', textTransform: 'uppercase' }}>
                      Violent Offenses ({safeSafety.report_year})
                    </div>
                    <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--espresso, #1E1509)', marginTop: '4px' }}>
                      {safeSafety.violent_rate_per_100k} per 100,000
                    </div>
                  </div>
                )}

                {safeSafety.property_rate_per_100k != null && (
                  <div
                    style={{
                      padding: '14px',
                      backgroundColor: '#FAF8F5',
                      borderRadius: '12px',
                      border: '1px solid rgba(228, 221, 211, 0.85)'
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.6)', textTransform: 'uppercase' }}>
                      Property Offenses ({safeSafety.report_year})
                    </div>
                    <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--espresso, #1E1509)', marginTop: '4px' }}>
                      {safeSafety.property_rate_per_100k} per 100,000
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.6)', lineHeight: 1.45 }}>
                  Reported at the covering law-enforcement agency level ({safeSafety.agency_name}) — FDLE does not publish neighborhood-level crime counts.
                </div>
              </div>
            </div>

            <ProvenanceFooter provenanceLine={safeSafety.provenanceLine} />
          </div>
        )}
      </div>
    </>
  );
}

