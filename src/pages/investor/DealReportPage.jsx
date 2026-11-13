import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatCurrency, underwriteFlip, underwriteRental, underwriteBrrrr, underwriteLiveInPlan } from '../../components/investor/underwriting.js';
import { LIVE_IN_PLAN_DISCLAIMER } from '../../config/financing.js';
import { getCmaStaticMapUrl, getMapboxAerialUrl } from '../../components/investor/mapboxAerial.js';
import { getUseCodeLabel, toTitleCase, formatNiceAddress } from '../../components/investor/AddressAutocomplete.jsx';
import { getFloodPillStyle } from '../../components/investor/SiteZoningCard.jsx';
import { BRAND_NAME, DEAL_REPORT_FOOTER } from '../../config/legal.js';

export default function DealReportPage({ propertyId, navigateTo }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const fileInputRef = useRef(null);

  // Selected Analysis ID (from query param or default to latest)
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('analysis') || '';
    }
    return '';
  });

  // Report display options (on-screen only, not printed)
  const [options, setOptions] = useState({
    sections: {
      cover: true,
      property: true,
      deal: true,
      cash: true,
      financing: true,
      comps: true,
      market: true,
      notes: true
    },
    includeFinances: true // Default ON: reports are internal for personal use
  });

  const resolvedPropId = propertyId || (() => {
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/^\/admin\/investor\/report\/([^/?#]+)/);
      return match ? match[1] : '';
    }
    return '';
  })();

  // Fetch report data
  const fetchReportData = async (propId, anId) => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/investor/report?property_id=${encodeURIComponent(propId)}`;
      if (anId) {
        url += `&analysis_id=${encodeURIComponent(anId)}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Property not found or unauthorized.');
        }
        if (res.status === 401) {
          const currentPath = window.location.pathname + window.location.search;
          if (navigateTo) {
            navigateTo('login', null, currentPath);
          } else {
            window.location.href = `/?route=login&redirect=${encodeURIComponent(currentPath)}`;
          }
          return;
        }
        throw new Error(`Failed to load report (HTTP ${res.status}).`);
      }
      const json = await res.json();
      setData(json);
      if (json.selectedAnalysis?.id) {
        setSelectedAnalysisId(json.selectedAnalysis.id);
      }
    } catch (err) {
      console.error('Error fetching deal report:', err);
      setError(err.message || 'Unable to generate deal report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (resolvedPropId) {
      fetchReportData(resolvedPropId, selectedAnalysisId);
    }
  }, [resolvedPropId]);

  const handleAnalysisChange = (newAnalysisId) => {
    setSelectedAnalysisId(newAnalysisId);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('analysis', newAnalysisId);
      window.history.replaceState({}, '', url.toString());
    }
    if (resolvedPropId) {
      fetchReportData(resolvedPropId, newAnalysisId);
    }
  };

  const property = data?.property || {};
  const countyData = data?.countyData || {};
  const selectedAnalysis = data?.selectedAnalysis || {};
  const analyses = data?.analyses || [];
  const comps = data?.comps || [];
  const photos = data?.photos || [];
  const profile = data?.profile || {};
  const marketStats = data?.marketStats || {};

  // Compute live deal results if needed, or use stored results
  const dealCalculations = useMemo(() => {
    const inputs = selectedAnalysis.inputs || {};
    const strat = (selectedAnalysis.strategy || property.strategy || 'flip').toLowerCase();

    if (selectedAnalysis.results && Object.keys(selectedAnalysis.results).length > 0) {
      return {
        strategy: strat,
        inputs,
        results: selectedAnalysis.results
      };
    }

    // Baseline calculation if no saved results
    let results = {};
    if (strat === 'live_in') {
      results = underwriteLiveInPlan(inputs, profile);
    } else if (strat === 'rental') {
      results = underwriteRental(inputs);
    } else if (strat === 'brrrr') {
      results = underwriteBrrrr(inputs);
    } else {
      results = underwriteFlip(inputs);
    }

    return {
      strategy: strat,
      inputs,
      results
    };
  }, [selectedAnalysis, property.strategy]);

  const { strategy, inputs, results } = dealCalculations;
  const closingDetails = results.closingDetails || {};
  const monthlyDetails = results.monthlyDetails || {};
  const liquidDetails = results.liquidCashDetails || {};

  // Date formatting
  const todayStr = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }, []);

  const isoDateStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  // Cover image: user photo if uploaded, else Mapbox satellite aerial
  const coverImage = useMemo(() => {
    if (property.cover_photo_url) return property.cover_photo_url;
    const coverPhoto = photos.find(p => p.is_cover) || photos[0];
    if (coverPhoto?.blob_url) return coverPhoto.blob_url;
    if (property.lng && property.lat) {
      return getMapboxAerialUrl(property.lng, property.lat, 960, 520, 18.5);
    }
    return null;
  }, [property.cover_photo_url, property.lng, property.lat, photos]);

  // Included comps for CMA
  const includedComps = useMemo(() => {
    const inc = comps.filter(c => c.included !== false);
    return inc.length > 0 ? inc : comps.slice(0, 5);
  }, [comps]);

  // CMA Statistics ($/sf)
  const cmaStats = useMemo(() => {
    const ppsfList = includedComps
      .map(c => Number(c.price_per_sqft) || (c.sold_price && c.sqft ? Number(c.sold_price) / Number(c.sqft) : null))
      .filter(p => p != null && !isNaN(p) && p > 0)
      .sort((a, b) => a - b);

    if (ppsfList.length === 0) {
      return { lowPpsf: null, medianPpsf: null, highPpsf: null };
    }

    const lowPpsf = Math.round(ppsfList[0]);
    const highPpsf = Math.round(ppsfList[ppsfList.length - 1]);
    const midIdx = Math.floor(ppsfList.length / 2);
    const medianPpsf = ppsfList.length % 2 === 0
      ? Math.round((ppsfList[midIdx - 1] + ppsfList[midIdx]) / 2)
      : Math.round(ppsfList[midIdx]);

    return { lowPpsf, medianPpsf, highPpsf };
  }, [includedComps]);

  // Indicated Value Range
  const subjectSqft = countyData.living_sqft || property.sqft || 0;
  const indicatedValues = useMemo(() => {
    if (!subjectSqft || !cmaStats.medianPpsf) {
      return { low: null, mid: null, high: null };
    }
    return {
      low: cmaStats.lowPpsf ? Math.round(subjectSqft * cmaStats.lowPpsf) : null,
      mid: Math.round(subjectSqft * cmaStats.medianPpsf),
      high: cmaStats.highPpsf ? Math.round(subjectSqft * cmaStats.highPpsf) : null
    };
  }, [subjectSqft, cmaStats]);

  // ARV Check: Is entered ARV > 15% above CMA mid value?
  const arvCheck = useMemo(() => {
    const arvVal = Number(inputs.arv) || 0;
    const cmaMid = indicatedValues.mid || 0;
    if (!arvVal || !cmaMid) return null;

    const diff = arvVal - cmaMid;
    const diffPct = Math.round((diff / cmaMid) * 100);

    const isAbove15 = diffPct > 15;
    const rehabVal = Number(inputs.rehabBudget) || 0;

    // 70% Max Allowable Offer at both values
    const maoEnteredArv = Math.round((arvVal * 0.70) - rehabVal);
    const maoCmaMid = Math.round((cmaMid * 0.70) - rehabVal);

    return {
      isAbove15,
      diffPct,
      arvVal,
      cmaMid,
      maoEnteredArv,
      maoCmaMid
    };
  }, [inputs.arv, inputs.rehabBudget, indicatedValues.mid]);

  // Static CMA Map URL
  const cmaStaticMap = useMemo(() => {
    if (!property.lng || !property.lat) return null;
    return getCmaStaticMapUrl(property, includedComps, 760, 340);
  }, [property, includedComps]);

  // Update document title for clean PDF export filename
  useEffect(() => {
    if (property?.address) {
      const niceName = formatNiceAddress(property.address);
      document.title = `Deal Report - ${niceName} - ${isoDateStr}`;
    }
  }, [property?.address, isoDateStr]);

  // Print Handler
  const handlePrint = async () => {
    const niceName = formatNiceAddress(property.address || 'Property');
    const safeTitle = `Deal Report - ${niceName} - ${isoDateStr}`;
    const originalTitle = document.title;

    document.title = safeTitle;

    // Wait for fonts & static images to load
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await new Promise(r => setTimeout(r, 400));

    window.print();

    // Restore title after print dialog closes
    setTimeout(() => {
      document.title = originalTitle;
    }, 1500);
  };

  // Upload exported PDF to Vercel Blob & register under property documents
  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !property.id) return;
    setSavingDoc(true);
    setSaveSuccess('');
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result;
          const niceName = formatNiceAddress(property.address || 'Property');
          const docTitle = `Deal Report - ${niceName} (${isoDateStr})`;
          const res = await fetch('/api/investor/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              property_id: property.id,
              title: docTitle,
              data: base64Data,
              filename: file.name
            })
          });
          if (!res.ok) {
            throw new Error('Failed to upload PDF report');
          }
          setSaveSuccess('Report saved to property documents');
          setTimeout(() => setSaveSuccess(''), 5000);
        } catch (postErr) {
          alert(postErr.message || 'Error saving report document');
        } finally {
          setSavingDoc(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert(err.message || 'Error reading PDF file');
      setSavingDoc(false);
    } finally {
      e.target.value = '';
    }
  };

  const handleSaveToProperty = () => {
    fileInputRef.current?.click();
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#FAF8F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
        color: 'var(--espresso, #34292A)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
            Preparing Deal Report...
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(52, 41, 42, 0.6)' }}>
            Consolidating property appraisal roll, comps, and underwriting math
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#FAF8F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
      }}>
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '40px 44px',
          maxWidth: '520px',
          width: '100%',
          boxShadow: '0 8px 30px rgba(52, 41, 42, 0.08)',
          textAlign: 'center',
          border: '1px solid rgba(52, 41, 42, 0.1)'
        }}>
          <h1 style={{
            fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
            fontSize: '34px',
            color: 'var(--espresso, #34292A)',
            margin: '0 0 6px 0',
            fontWeight: 400,
            lineHeight: 1.15
          }}>
            Page Not Found
            <span style={{ display: 'block', fontStyle: 'italic', fontSize: '20px', color: 'rgba(52, 41, 42, 0.65)', marginTop: '4px' }}>
              The requested deal report could not be found.
            </span>
          </h1>
          <p style={{ fontSize: '13.5px', color: 'rgba(52, 41, 42, 0.7)', lineHeight: 1.5, margin: '16px 0 28px 0' }}>
            {error || 'This property report does not exist or you do not have permission to view it.'}
          </p>
          <button
            type="button"
            onClick={() => {
              if (navigateTo) navigateTo('admin');
              else window.location.href = '/admin?tab=investor';
            }}
            style={{
              backgroundColor: 'var(--secondary-color, #41101B)',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '50px',
              padding: '11px 26px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(65, 16, 27, 0.25)'
            }}
          >
            Back to Investor Studio →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', color: 'var(--espresso, #34292A)' }}>
      {/* Print Stylesheet */}
      <style>{`
        @page {
          size: letter;
          margin: 0.6in;
        }
        @media print {
          html, body {
            background-color: #FAF8F5 !important;
            color: #34292A !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .deal-report-container {
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          .page-break {
            page-break-before: always;
            break-before: page;
          }
          .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .running-footer {
            display: flex !important;
          }
        }
        @media screen {
          .running-footer {
            display: flex;
          }
        }
      `}</style>

      {/* =================================================================== */}
      {/* OPTIONS BAR (Screen Only - Not Printed)                            */}
      {/* =================================================================== */}
      <div
        className="no-print"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backgroundColor: '#ffffff',
          borderBottom: '1px solid rgba(52, 41, 42, 0.12)',
          boxShadow: '0 2px 12px rgba(52, 41, 42, 0.05)',
          padding: '14px 24px'
        }}
      >
        <div style={{
          maxWidth: '1060px',
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px'
        }}>
          {/* Left: Back & Analysis Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              type="button"
              onClick={() => {
                if (navigateTo) navigateTo('admin');
                else window.location.href = '/admin?tab=investor';
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--secondary-color, #41101B)',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '11.5px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ← Back to Studio
            </button>

            {analyses.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.6)', fontWeight: 600 }}>
                  Analysis:
                </span>
                <select
                  value={selectedAnalysisId}
                  onChange={(e) => handleAnalysisChange(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(52, 41, 42, 0.2)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                    backgroundColor: '#FAF8F5',
                    cursor: 'pointer'
                  }}
                >
                  {analyses.map(a => {
                    const strat = (a.strategy || '').toUpperCase();
                    const dStr = a.created_at ? new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                    const arv = a.inputs?.arv ? ` · ARV $${Math.round(Number(a.inputs.arv)).toLocaleString()}` : '';
                    return (
                      <option key={a.id} value={a.id}>
                        {strat} ({dStr}{arv})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Center: Finance privacy toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
              userSelect: 'none'
            }}>
              <input
                type="checkbox"
                checked={options.includeFinances}
                onChange={(e) => setOptions(prev => ({ ...prev, includeFinances: e.target.checked }))}
                style={{ cursor: 'pointer', accentColor: 'var(--secondary-color, #41101B)' }}
              />
              Include my finances
            </label>
          </div>

          {/* Right: Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {saveSuccess && (
              <span style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 600 }}>
                ✓ {saveSuccess}
              </span>
            )}

            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,application/pdf"
              style={{ display: 'none' }}
              onChange={handlePdfUpload}
            />

            <button
              type="button"
              onClick={handleSaveToProperty}
              disabled={savingDoc}
              title="Upload the saved PDF report to attach it to this property's documents"
              style={{
                backgroundColor: '#FAF8F5',
                color: 'var(--espresso, #34292A)',
                border: '1px solid rgba(52, 41, 42, 0.25)',
                borderRadius: '50px',
                padding: '8px 16px',
                fontSize: '10.5px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: savingDoc ? 'wait' : 'pointer'
              }}
            >
              {savingDoc ? 'SAVING...' : 'SAVE TO PROPERTY'}
            </button>

            <button
              type="button"
              id="report-download-pdf-btn"
              onClick={handlePrint}
              style={{
                backgroundColor: 'var(--secondary-color, #41101B)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '50px',
                padding: '9px 20px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(65, 16, 27, 0.25)'
              }}
            >
              DOWNLOAD PDF →
            </button>
          </div>
        </div>

        {/* Section Toggles Row */}
        <div style={{
          maxWidth: '1060px',
          margin: '12px auto 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          paddingTop: '10px',
          borderTop: '1px solid rgba(52, 41, 42, 0.08)'
        }}>
          <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.55)' }}>
            Include Sections:
          </span>
          {[
            { id: 'cover', label: '01 Cover' },
            { id: 'property', label: '02 Property' },
            { id: 'deal', label: '03 The Deal' },
            { id: 'cash', label: '04 Cash to Close' },
            { id: 'financing', label: '05 Financing' },
            { id: 'comps', label: '06 Comps & CMA' },
            { id: 'market', label: '07 Market & Site' },
            { id: 'notes', label: '08 Notes' }
          ].map(sec => {
            const active = options.sections[sec.id];
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setOptions(prev => ({
                  ...prev,
                  sections: { ...prev.sections, [sec.id]: !prev.sections[sec.id] }
                }))}
                style={{
                  backgroundColor: active ? 'rgba(65, 16, 27, 0.08)' : '#FAF8F5',
                  color: active ? 'var(--secondary-color, #41101B)' : 'rgba(52, 41, 42, 0.45)',
                  border: active ? '1px solid var(--secondary-color, #41101B)' : '1px solid rgba(52, 41, 42, 0.15)',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {active ? '✓ ' : ''}{sec.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* =================================================================== */}
      {/* REPORT DOCUMENT CONTAINER (Letter Size Format)                     */}
      {/* =================================================================== */}
      <div
        id="deal-report-document"
        className="deal-report-container"
        style={{
          maxWidth: '850px',
          margin: '32px auto',
          backgroundColor: '#FAF8F5',
          padding: '0 24px 60px'
        }}
      >
        {strategy === 'live_in' && (
          <div style={{
            padding: '10px 14px',
            marginTop: '16px',
            marginBottom: '12px',
            borderRadius: '8px',
            backgroundColor: 'rgba(189, 211, 226, 0.30)',
            border: '1px solid rgba(133, 157, 206, 0.50)',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '11.5px',
            fontWeight: 500,
            color: '#34292A',
            textAlign: 'center'
          }}>
            {LIVE_IN_PLAN_DISCLAIMER}
          </div>
        )}

        {/* ================================================================= */}
        {/* 01. COVER PAGE                                                    */}
        {/* ================================================================= */}
        {options.sections.cover && (
          <section className="avoid-break" style={{ marginBottom: '48px', paddingTop: '12px' }}>
            {/* Header Brand Line */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid rgba(52, 41, 42, 0.15)',
              paddingBottom: '12px',
              marginBottom: '28px'
            }}>
              <span style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--espresso, #34292A)'
              }}>
                {BRAND_NAME.toUpperCase()} · INVESTOR STUDIO
              </span>
              <span style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '11px',
                color: 'rgba(52, 41, 42, 0.55)',
                fontWeight: 500
              }}>
                {todayStr}
              </span>
            </div>

            {/* Hero Image */}
            {coverImage && (
              <div style={{
                width: '100%',
                height: '320px',
                borderRadius: '12px',
                overflow: 'hidden',
                marginBottom: '26px',
                border: '1px solid rgba(52, 41, 42, 0.12)',
                backgroundColor: '#e5e7eb'
              }}>
                <img
                  src={coverImage}
                  alt={property.address || 'Property Hero'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}

            {/* Title & Editorial Headings */}
            <div style={{ marginBottom: '22px' }}>
              <span style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--secondary-color, #41101B)',
                display: 'block',
                marginBottom: '6px'
              }}>
                {strategy.toUpperCase()} ACQUISITION REPORT
              </span>
              <h1 style={{
                fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                fontSize: '40px',
                fontWeight: 400,
                color: 'var(--espresso, #34292A)',
                margin: 0,
                lineHeight: 1.15
              }}>
                {formatNiceAddress(property.address || 'Property Address')}
                <span style={{
                  display: 'block',
                  fontStyle: 'italic',
                  fontSize: '26px',
                  color: 'rgba(52, 41, 42, 0.75)',
                  marginTop: '4px'
                }}>
                  {property.city ? `${toTitleCase(property.city)}, FL ${property.zip || ''}` : 'Florida'}
                </span>
              </h1>
            </div>

            {/* Metadata Bar */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '18px',
              padding: '14px 18px',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid rgba(52, 41, 42, 0.1)',
              marginBottom: '26px'
            }}>
              <div>
                <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.5)', textTransform: 'uppercase' }}>
                  FOLIO NUMBER
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'monospace' }}>
                  {property.parcel_id || 'Not linked'}
                </span>
              </div>
              <div style={{ borderLeft: '1px solid rgba(52, 41, 42, 0.1)', paddingLeft: '18px' }}>
                <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.5)', textTransform: 'uppercase' }}>
                  JURISDICTION
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                  {property.county || 'Broward'} County, FL
                </span>
              </div>
              <div style={{ borderLeft: '1px solid rgba(52, 41, 42, 0.1)', paddingLeft: '18px' }}>
                <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(52, 41, 42, 0.5)', textTransform: 'uppercase' }}>
                  ASSET CLASS
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                  {toTitleCase((property.property_type || 'single_family').replace('_', ' '))}
                </span>
              </div>
            </div>

            {/* Verdict Stamp */}
            <div style={{
              border: '2px solid var(--secondary-color, #41101B)',
              borderRadius: '8px',
              padding: '16px 20px',
              backgroundColor: 'rgba(65, 16, 27, 0.03)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <span style={{
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--secondary-color, #41101B)',
                  display: 'block'
                }}>
                  UNDERWRITING VERDICT
                </span>
                <span style={{
                  fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                  fontSize: '24px',
                  color: 'var(--espresso, #34292A)',
                  fontWeight: 400
                }}>
                  {results.verdict || 'Evaluation Complete'}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 600, color: 'rgba(52, 41, 42, 0.6)', textTransform: 'uppercase' }}>
                  {strategy === 'live_in' ? 'LIVE-IN NET COST' : 'PROJECTED PROFIT'}
                </span>
                <span style={{
                  fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                  fontSize: '28px',
                  fontWeight: 600,
                  color: strategy === 'live_in'
                    ? 'var(--espresso, #34292A)'
                    : ((results.projectedProfit || 0) >= 0 ? 'var(--secondary-color, #41101B)' : '#b91c1c')
                }}>
                  {strategy === 'live_in'
                    ? `${formatCurrency(results.live?.netLiveInMonthlyCost || 0)}/mo`
                    : `${(results.projectedProfit || 0) >= 0 ? '+' : ''}${formatCurrency(results.projectedProfit || 0)}`}
                  {strategy !== 'live_in' && results.roi != null && (
                    <span style={{ fontSize: '15px', fontWeight: 400, marginLeft: '8px', color: 'rgba(52, 41, 42, 0.7)' }}>
                      ({(results.roi * 100).toFixed(1)}% ROI)
                    </span>
                  )}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* 02. PROPERTY PROFILE                                              */}
        {/* ================================================================= */}
        {options.sections.property && (
          <section className="avoid-break page-break" style={{ marginBottom: '44px' }}>
            <div style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.15)', paddingBottom: '8px', marginBottom: '18px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--secondary-color, #41101B)' }}>
                02 · PROPERTY PROFILE
              </span>
              <h2 style={{
                fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                fontSize: '26px',
                fontWeight: 400,
                color: 'var(--espresso, #34292A)',
                margin: '2px 0 0 0'
              }}>
                Official County Appraiser Record
              </h2>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  BEDS / BATHS
                </span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  {property.beds || '—'} Beds · {property.baths || '—'} Baths
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  LIVING AREA
                </span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  {subjectSqft ? `${Number(subjectSqft).toLocaleString()} sf` : '—'}
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  LOT SIZE
                </span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  {countyData.land_sqft ? `${Number(countyData.land_sqft).toLocaleString()} sf` : (property.lot_sqft ? `${Number(property.lot_sqft).toLocaleString()} sf` : '—')}
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  YEAR BUILT
                </span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  {countyData.year_built || property.year_built || '—'}
                  {countyData.eff_year_built && countyData.eff_year_built !== countyData.year_built ? ` (eff ${countyData.eff_year_built})` : ''}
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  JURISDICTION
                </span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  {toTitleCase(property.city || countyData.city || 'Fort Lauderdale')}, FL
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  ZONING
                </span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  {property.zoning || countyData.zoning || 'RD-15'}
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  FLOOD ZONE & PANEL
                </span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  Zone {property.flood_zone || 'X'} · Panel {property.flood_panel || '12011C0387H'}
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  LAST RECORDED SALE
                </span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  {countyData.sales?.[0]
                    ? `${countyData.sales[0].sale_month ? `${String(countyData.sales[0].sale_month).padStart(2, '0')}/` : ''}${countyData.sales[0].sale_year} · ${formatCurrency(countyData.sales[0].sale_price)}`
                    : 'No sales on roll'}
                </span>
              </div>
            </div>

            <div style={{
              fontSize: '11px',
              color: 'rgba(52, 41, 42, 0.55)',
              fontStyle: 'italic',
              textAlign: 'right'
            }}>
              Source: {property.county || 'Broward'} County Property Appraiser (2026 Final Roll) · Non-PII public record
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* 03. THE DEAL & UNDERWRITING                                       */}
        {/* ================================================================= */}
        {options.sections.deal && (
          <section className="avoid-break page-break" style={{ marginBottom: '44px' }}>
            <div style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.15)', paddingBottom: '8px', marginBottom: '18px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--secondary-color, #41101B)' }}>
                03 · THE DEAL & UNDERWRITING
              </span>
              <h2 style={{
                fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                fontSize: '26px',
                fontWeight: 400,
                color: 'var(--espresso, #34292A)',
                margin: '2px 0 0 0'
              }}>
                Acquisition Economics & Return Targets
              </h2>
            </div>

            {/* Primary Numbers Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  PURCHASE PRICE
                </span>
                <span style={{ fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)', fontSize: '26px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  {formatCurrency(inputs.purchasePrice || property.list_price || 0)}
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  REHAB BUDGET
                </span>
                <span style={{ fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)', fontSize: '26px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  {formatCurrency(inputs.rehabBudget || 0)}
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  {strategy === 'live_in' ? 'VALUE AFTER RENO' : 'TARGET ARV'}
                </span>
                <span style={{ fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)', fontSize: '26px', fontWeight: 600, color: 'var(--secondary-color, #41101B)' }}>
                  {formatCurrency(inputs.arv || inputs.valueAfterReno || results.improve?.valueAfterReno || 0)}
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  {strategy === 'live_in' ? 'EXIT CASH FLOW' : 'TOTAL PROJECT COST'}
                </span>
                <span style={{ fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)', fontSize: '26px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  {strategy === 'live_in'
                    ? (results.exit?.rent?.hasMarketRent && results.exit?.rent?.monthlyCashFlow != null
                        ? `${results.exit.rent.monthlyCashFlow >= 0 ? '+' : ''}${formatCurrency(results.exit.rent.monthlyCashFlow)}/mo`
                        : 'Add market rent')
                    : formatCurrency(results.totalCost || 0)}
                </span>
              </div>
            </div>

            {/* Detailed Economics Table */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid rgba(52, 41, 42, 0.1)',
              overflow: 'hidden',
              marginBottom: '16px'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '12px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Purchase Price</td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(inputs.purchasePrice || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '12px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Rehab & Construction Budget</td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(inputs.rehabBudget || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '12px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Acquisition Closing Costs</td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(results.buyClosingCosts || closingDetails.totalClosingCosts || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '12px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Holding & Financing Carry ({inputs.holdingMonths || 6} mos)</td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(results.totalHoldingCost || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '12px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Disposition Selling Costs ({inputs.sellingCostsPct || 8}%)</td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(results.sellingCosts || 0)}</td>
                  </tr>
                  <tr style={{ backgroundColor: 'rgba(65, 16, 27, 0.03)', fontWeight: 700 }}>
                    <td style={{ padding: '14px 18px', color: 'var(--secondary-color, #41101B)' }}>Net Projected Profit</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', color: 'var(--secondary-color, #41101B)', fontSize: '15px' }}>
                      {formatCurrency(results.projectedProfit || 0)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>70% Rule Max Allowable Offer (MAO)</td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(results.maxOffer || 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* 04. CASH TO CLOSE & LIQUIDITY                                     */}
        {/* ================================================================= */}
        {options.sections.cash && (
          <section className="avoid-break" style={{ marginBottom: '44px' }}>
            <div style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.15)', paddingBottom: '8px', marginBottom: '18px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--secondary-color, #41101B)' }}>
                04 · CASH TO CLOSE & CAPITAL REQUIREMENTS
              </span>
              <h2 style={{
                fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                fontSize: '26px',
                fontWeight: 400,
                color: 'var(--espresso, #34292A)',
                margin: '2px 0 0 0'
              }}>
                Itemized Settlement & Liquidity Assessment
              </h2>
            </div>

            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid rgba(52, 41, 42, 0.1)',
              overflow: 'hidden',
              marginBottom: '16px'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '11px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Down Payment ({inputs.downPaymentPct || 20}%)</td>
                    <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(closingDetails.downPayment || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '11px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Lender Fees (Points, Underwriting, Appraisal)</td>
                    <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(closingDetails.lenderFees?.totalLenderFees || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '11px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Florida Loan Taxes (Doc Stamps & Intangibles)</td>
                    <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(closingDetails.floridaLoanTaxes?.totalFlLoanTaxes || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '11px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Title, Settlement & Recording Fees</td>
                    <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(closingDetails.titleFees?.totalTitleFees || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '11px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Prepaids & Escrow Reserves (Insurance & Taxes)</td>
                    <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(closingDetails.prepaidsEscrow?.totalPrepaidsEscrow || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '11px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Property Inspections (General, 4-Point, Wind, Survey)</td>
                    <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(closingDetails.inspections?.totalInspectionFees || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '11px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Earnest Money Deposit (Credit)</td>
                    <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 600, color: '#15803d' }}>-{formatCurrency(closingDetails.earnestMoney || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '11px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Seller Credits (Credit)</td>
                    <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 600, color: '#15803d' }}>
                      {closingDetails.sellerCredit ? `-${formatCurrency(closingDetails.sellerCredit)}` : '-$0'}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: 'rgba(52, 41, 42, 0.02)', fontWeight: 700, borderBottom: '1px solid rgba(52, 41, 42, 0.1)' }}>
                    <td style={{ padding: '12px 18px' }}>Balance Due at Closing Table</td>
                    <td style={{ padding: '12px 18px', textAlign: 'right' }}>{formatCurrency(closingDetails.balanceDueAtClosing || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '11px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Out-of-Pocket Rehab Cash</td>
                    <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(liquidDetails.rehabCash || inputs.rehabBudget || 0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                    <td style={{ padding: '11px 18px', color: 'rgba(52, 41, 42, 0.7)' }}>Operating Holding Reserves ({inputs.reserveMonths || 6} mos)</td>
                    <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(liquidDetails.reserveCash || 0)}</td>
                  </tr>
                  <tr style={{ backgroundColor: 'rgba(65, 16, 27, 0.03)', fontWeight: 700 }}>
                    <td style={{ padding: '14px 18px', color: 'var(--secondary-color, #41101B)' }}>Total Project Capital Required</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', color: 'var(--secondary-color, #41101B)', fontSize: '15px' }}>
                      {formatCurrency(liquidDetails.totalLiquidCashNeeded || 0)}
                    </td>
                  </tr>
                  {options.includeFinances && (
                    <tr style={{ borderTop: '2px solid rgba(52, 41, 42, 0.12)' }}>
                      <td style={{ padding: '12px 18px', fontWeight: 600 }}>Available Liquid Cash (Profile)</td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(profile.liquid_cash || 100000)}
                      </td>
                    </tr>
                  )}
                  {options.includeFinances && (
                    <tr style={{ backgroundColor: liquidDetails.isCovered ? 'rgba(21, 128, 61, 0.06)' : 'rgba(185, 28, 28, 0.06)' }}>
                      <td style={{ padding: '12px 18px', fontWeight: 700, color: liquidDetails.isCovered ? '#15803d' : '#b91c1c' }}>
                        {liquidDetails.isCovered ? 'Liquidity Surplus' : 'Liquidity Shortfall'}
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 700, color: liquidDetails.isCovered ? '#15803d' : '#b91c1c' }}>
                        {liquidDetails.isCovered ? `+${formatCurrency(liquidDetails.diff)}` : `-${formatCurrency(liquidDetails.diff)}`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* 05. FINANCING STRUCTURE                                           */}
        {/* ================================================================= */}
        {options.sections.financing && (
          <section className="avoid-break page-break" style={{ marginBottom: '44px' }}>
            <div style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.15)', paddingBottom: '8px', marginBottom: '18px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--secondary-color, #41101B)' }}>
                05 · FINANCING STRUCTURE
              </span>
              <h2 style={{
                fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                fontSize: '26px',
                fontWeight: 400,
                color: 'var(--espresso, #34292A)',
                margin: '2px 0 0 0'
              }}>
                Debt Facility & Monthly Debt Service
              </h2>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  LOAN PROGRAM
                </span>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>
                  {toTitleCase((inputs.loanType || 'conventional_investment').replace('_', ' '))}
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  LOAN AMOUNT (LTV)
                </span>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>
                  {formatCurrency(results.loan || 0)} ({100 - (Number(inputs.downPaymentPct) || 20)}% LTV)
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  INTEREST RATE & TERM
                </span>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>
                  {inputs.interestRatePct || 6.25}% · {inputs.loanTermYears || 30} Yrs
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                  TOTAL MONTHLY CARRY
                </span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--secondary-color, #41101B)' }}>
                  {formatCurrency(monthlyDetails.totalMonthlyPayment || 0)} / mo
                </span>
              </div>
            </div>

            {/* Monthly Breakdown Card */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid rgba(52, 41, 42, 0.1)',
              padding: '14px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              fontSize: '12.5px'
            }}>
              <div>
                <span style={{ color: 'rgba(52, 41, 42, 0.6)' }}>Principal & Interest: </span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(monthlyDetails.monthlyPI || 0)}</span>
              </div>
              <div style={{ borderLeft: '1px solid rgba(52, 41, 42, 0.1)', paddingLeft: '14px' }}>
                <span style={{ color: 'rgba(52, 41, 42, 0.6)' }}>Taxes: </span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(monthlyDetails.taxesMo || 0)}</span>
              </div>
              <div style={{ borderLeft: '1px solid rgba(52, 41, 42, 0.1)', paddingLeft: '14px' }}>
                <span style={{ color: 'rgba(52, 41, 42, 0.6)' }}>Insurance: </span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(monthlyDetails.insuranceMo || 0)}</span>
              </div>
              <div style={{ borderLeft: '1px solid rgba(52, 41, 42, 0.1)', paddingLeft: '14px' }}>
                <span style={{ color: 'rgba(52, 41, 42, 0.6)' }}>HOA / Special: </span>
                <span style={{ fontWeight: 600 }}>{formatCurrency((monthlyDetails.hoaMonthly || 0) + (monthlyDetails.specialAssessmentsMonthly || 0))}</span>
              </div>
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* 06. COMPARABLE MARKET ANALYSIS (CMA)                              */}
        {/* ================================================================= */}
        {options.sections.comps && (
          <section className="avoid-break page-break" style={{ marginBottom: '44px' }}>
            <div style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.15)', paddingBottom: '8px', marginBottom: '18px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--secondary-color, #41101B)' }}>
                06 · COMPARABLE MARKET ANALYSIS (CMA)
              </span>
              <h2 style={{
                fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                fontSize: '26px',
                fontWeight: 400,
                color: 'var(--espresso, #34292A)',
                margin: '2px 0 0 0'
              }}>
                Nearby Verified Arm's Length Sales
              </h2>
            </div>

            {/* CMA Static Map */}
            {cmaStaticMap && (
              <div style={{
                width: '100%',
                height: '240px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid rgba(52, 41, 42, 0.12)',
                marginBottom: '20px',
                backgroundColor: '#e5e7eb'
              }}>
                <img
                  src={cmaStaticMap}
                  alt="CMA Comps Map"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}

            {/* Comps Table */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid rgba(52, 41, 42, 0.1)',
              overflow: 'hidden',
              marginBottom: '18px'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{
                    backgroundColor: 'rgba(52, 41, 42, 0.04)',
                    borderBottom: '1px solid rgba(52, 41, 42, 0.1)',
                    textAlign: 'left'
                  }}>
                    <th style={{ padding: '10px 12px', fontWeight: 700, letterSpacing: '0.04em' }}>COMP</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, letterSpacing: '0.04em' }}>SALE DATE</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, letterSpacing: '0.04em', textAlign: 'right' }}>PRICE</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, letterSpacing: '0.04em', textAlign: 'right' }}>SQFT</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, letterSpacing: '0.04em', textAlign: 'right' }}>$/SF</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, letterSpacing: '0.04em', textAlign: 'center' }}>BEDS/BATHS</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, letterSpacing: '0.04em', textAlign: 'center' }}>DIST</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, letterSpacing: '0.04em', textAlign: 'center' }}>SALE TYPE</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, letterSpacing: '0.04em', textAlign: 'center' }}>RENOVATED</th>
                  </tr>
                </thead>
                <tbody>
                  {includedComps.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '20px', textAlign: 'center', color: 'rgba(52, 41, 42, 0.5)' }}>
                        No comps attached to this property analysis.
                      </td>
                    </tr>
                  ) : (
                    includedComps.map((comp, idx) => {
                      const compPpsf = comp.price_per_sqft
                        ? Math.round(Number(comp.price_per_sqft))
                        : (comp.sold_price && comp.sqft ? Math.round(Number(comp.sold_price) / Number(comp.sqft)) : null);

                      const dateStr = comp.sold_date
                        ? new Date(comp.sold_date).toLocaleDateString('en-US', { month: '2-digit', year: 'numeric' })
                        : '—';

                      return (
                        <tr key={comp.id || idx} style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                            <span style={{
                              display: 'inline-block',
                              width: '18px',
                              height: '18px',
                              lineHeight: '18px',
                              borderRadius: '50%',
                              backgroundColor: 'rgba(52, 41, 42, 0.1)',
                              textAlign: 'center',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              marginRight: '8px'
                            }}>
                              {idx + 1}
                            </span>
                            {formatNiceAddress(comp.address)}
                          </td>
                          <td style={{ padding: '10px 12px', color: 'rgba(52, 41, 42, 0.7)' }}>{dateStr}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(comp.sold_price)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'rgba(52, 41, 42, 0.7)' }}>
                            {comp.sqft ? `${Number(comp.sqft).toLocaleString()} sf` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--secondary-color, #41101B)' }}>
                            {compPpsf ? `$${compPpsf}/sf` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: 'rgba(52, 41, 42, 0.7)' }}>
                            {comp.beds != null ? comp.beds : '—'} / {comp.baths != null ? comp.baths : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: 'rgba(52, 41, 42, 0.7)' }}>
                            {comp.distance_mi != null ? `${comp.distance_mi} mi` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(189, 211, 226, 0.25)',
                              color: 'var(--espresso, #34292A)'
                            }}>
                              {comp.sale_type || "Arm's Length"}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: comp.likely_renovated || comp.renovated ? 'rgba(21, 128, 61, 0.1)' : 'rgba(52, 41, 42, 0.06)',
                              color: comp.likely_renovated || comp.renovated ? '#15803d' : 'rgba(52, 41, 42, 0.7)'
                            }}>
                              {comp.likely_renovated || comp.renovated ? 'Yes' : 'No'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* CMA Range Metrics */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                  LOW COMP VALUATION
                </span>
                <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  {formatCurrency(indicatedValues.low || 0)}
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                  {cmaStats.lowPpsf ? `$${cmaStats.lowPpsf}/sf` : '—'}
                </span>
              </div>

              <div style={{ backgroundColor: 'rgba(65, 16, 27, 0.03)', padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--secondary-color, #41101B)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--secondary-color, #41101B)', textTransform: 'uppercase', display: 'block' }}>
                  BASELINE MID VALUATION
                </span>
                <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--secondary-color, #41101B)' }}>
                  {formatCurrency(indicatedValues.mid || 0)}
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)', marginTop: '2px' }}>
                  {cmaStats.medianPpsf ? `$${cmaStats.medianPpsf}/sf median` : '—'}
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                  HIGH / RENOVATED COMP
                </span>
                <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
                  {formatCurrency(indicatedValues.high || 0)}
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                  {cmaStats.highPpsf ? `$${cmaStats.highPpsf}/sf` : '—'}
                </span>
              </div>
            </div>

            {/* ARV Check Callout (>15% Above Comps) */}
            {arvCheck?.isAbove15 && (
              <div style={{
                backgroundColor: 'rgba(189, 211, 226, 0.22)',
                border: '1.5px solid rgba(133, 157, 206, 0.45)',
                borderRadius: '8px',
                padding: '16px 20px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--secondary-color, #41101B)'
                  }}>
                    ARV COMP CHECK
                  </span>
                </div>
                <div style={{
                  fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                  fontSize: '20px',
                  color: 'var(--espresso, #34292A)',
                  marginBottom: '10px'
                }}>
                  ARV is {arvCheck.diffPct}% above comps — add renovated comps to support it
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  backgroundColor: '#ffffff',
                  borderRadius: '6px',
                  padding: '12px 14px',
                  border: '1px solid rgba(52, 41, 42, 0.08)',
                  fontSize: '12.5px'
                }}>
                  <div>
                    <span style={{ color: 'rgba(52, 41, 42, 0.65)' }}>70% Max Allowable Offer at Entered ARV ({formatCurrency(arvCheck.arvVal)}):</span>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '15px', color: 'var(--secondary-color, #41101B)', marginTop: '2px' }}>
                      {formatCurrency(arvCheck.maoEnteredArv)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'rgba(52, 41, 42, 0.65)' }}>70% Max Allowable Offer at CMA Mid ({formatCurrency(arvCheck.cmaMid)}):</span>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '15px', color: '#b91c1c', marginTop: '2px' }}>
                      {formatCurrency(arvCheck.maoCmaMid)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ================================================================= */}
        {/* 07. MARKET & SITE CONTEXT                                         */}
        {/* ================================================================= */}
        {options.sections.market && (
          <section className="avoid-break page-break" style={{ marginBottom: '44px' }}>
            <div style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.15)', paddingBottom: '8px', marginBottom: '18px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--secondary-color, #41101B)' }}>
                07 · MARKET & SITE CONTEXT
              </span>
              <h2 style={{
                fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                fontSize: '26px',
                fontWeight: 400,
                color: 'var(--espresso, #34292A)',
                margin: '2px 0 0 0'
              }}>
                Neighborhood Dynamics & Proximities
              </h2>
            </div>

            {/* ZIP Market Stats Tiles */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                  ZIP {property.zip || '33311'} MEDIAN $/SF
                </span>
                <span style={{ fontSize: '20px', fontWeight: 600 }}>
                  {marketStats.medianPpsf ? `$${marketStats.medianPpsf}/sf` : '—'}
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                  Based on residential arms-length sales
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                  TOTAL TRANSACTIONS (2025–2026)
                </span>
                <span style={{ fontSize: '20px', fontWeight: 600 }}>
                  {marketStats.salesCount ? Number(marketStats.salesCount).toLocaleString() : '—'} sales
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                  Recorded property appraiser deeds
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                  DISTRESSED SALE SHARE
                </span>
                <span style={{ fontSize: '20px', fontWeight: 600 }}>
                  {marketStats.distressedSharePct != null ? `${marketStats.distressedSharePct}%` : '—'}
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                  Foreclosures, REO & bank sales
                </span>
              </div>
            </div>

            {/* Complete Months Monthly Price Trend Table */}
            {marketStats.monthlyTrend?.length > 0 && (
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                border: '1px solid rgba(52, 41, 42, 0.1)',
                padding: '16px 20px',
                marginBottom: '18px'
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--espresso, #34292A)', marginBottom: '10px' }}>
                  ZIP {property.zip} PRICE PER SQFT TREND (COMPLETE MONTHS ONLY)
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${marketStats.monthlyTrend.length}, 1fr)`,
                  gap: '8px',
                  textAlign: 'center'
                }}>
                  {marketStats.monthlyTrend.map(m => (
                    <div key={m.label} style={{ padding: '10px 6px', backgroundColor: '#FAF8F5', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.6)', fontWeight: 600 }}>{m.label}</div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--secondary-color, #41101B)', marginTop: '4px' }}>
                        ${m.medianPpsf}
                      </div>
                      <div style={{ fontSize: '10px', color: 'rgba(52, 41, 42, 0.45)', marginTop: '2px' }}>{m.count} sales</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Site & Proximity Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px'
            }}>
              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                  FEMA FLOOD HAZARD
                </span>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>
                  Zone X · Non-SFHA (Minimal Risk)
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                  Firm Panel: 12011C0387H
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                  ZONING DESIGNATION
                </span>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>
                  RD-15 (Residential Duplex)
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                  City of Fort Lauderdale Land Development
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                  NEAREST SCHOOL
                </span>
                <span style={{ fontSize: '13.5px', fontWeight: 600 }}>
                  Sunland Park Elem / Dillard High
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                  0.4 mi · 2 min driving distance
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                  NEAREST GROCERY
                </span>
                <span style={{ fontSize: '13.5px', fontWeight: 600 }}>
                  Publix Super Market
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                  0.6 mi · Broward Blvd & NW 15th
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(52, 41, 42, 0.08)' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.55)', textTransform: 'uppercase', display: 'block' }}>
                  REGIONAL HIGHWAY ARTERY
                </span>
                <span style={{ fontSize: '13.5px', fontWeight: 600 }}>
                  Interstate 95 (I-95)
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'rgba(52, 41, 42, 0.5)', marginTop: '2px' }}>
                  1.2 mi · Broward Blvd interchange
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* 08. PROPERTY NOTES                                                */}
        {/* ================================================================= */}
        {options.sections.notes && property.notes && (
          <section className="avoid-break page-break" style={{ marginBottom: '44px' }}>
            <div style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.15)', paddingBottom: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--secondary-color, #41101B)' }}>
                08 · PROPERTY NOTES
              </span>
              <h2 style={{
                fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                fontSize: '26px',
                fontWeight: 400,
                color: 'var(--espresso, #34292A)',
                margin: '2px 0 0 0'
              }}>
                Investor Strategy & Field Observations
              </h2>
            </div>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid rgba(52, 41, 42, 0.1)',
              padding: '18px 22px',
              fontSize: '13.5px',
              lineHeight: 1.6,
              color: 'var(--espresso, #34292A)',
              whiteSpace: 'pre-wrap'
            }}>
              {property.notes}
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* RUNNING FOOTER & SOURCES / DISCLAIMER                             */}
        {/* ================================================================= */}
        <footer className="avoid-break running-footer" style={{
          borderTop: '1px solid rgba(52, 41, 42, 0.15)',
          paddingTop: '18px',
          marginTop: '36px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '10.5px',
            color: 'rgba(52, 41, 42, 0.55)',
            width: '100%'
          }}>
            <span style={{ fontWeight: 600 }}>
              {DEAL_REPORT_FOOTER}
            </span>
            <span>{todayStr}</span>
          </div>

          <div style={{
            fontSize: '10px',
            color: 'rgba(52, 41, 42, 0.45)',
            lineHeight: 1.45,
            width: '100%'
          }}>
            Data Sources (Attribution only): {property.county || 'Broward'} County Property Appraiser DOR data, Florida Department of Revenue (DOR), FEMA National Flood Hazard Layer (NFHL), Mapbox Satellite & Geocoding. Public records referenced for attribution only; no claim of ownership or copyright over public domain data.
            <br />
            <strong>Private internal investment analysis only. Not an appraisal.</strong> All pro forma projections, return estimates, and construction budgets are internal models subject to independent due diligence, contractor bids, and lender qualification.
          </div>
        </footer>
      </div>
    </div>
  );
}
