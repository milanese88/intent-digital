import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePortalTheme } from '../../context/PortalThemeContext.jsx';
import { loadThemeFont } from '../../utils/themeFonts.js';
import { getCmaStaticMapUrl, getMapboxAerialUrl } from '../../components/investor/mapboxAerial.js';
import { formatNiceAddress } from '../../components/investor/AddressAutocomplete.jsx';
import { VALUATION_REPORT_FOOTER } from '../../config/legal.js';
import { resolvePropertyCounty, getPropertyCountyLabel, getCountyAppraiserLabel } from '../../config/counties.js';
import { computeAppraisalGrid } from '../../components/investor/valuationEngine.js';
import { resolvePropertyPricing } from '../../components/investor/priceSource.js';
import { buildValuationEstimatePdfBase64, buildValuationEstimatePdfBytes } from '../../utils/valuationPdfBuilder.js';

const REPORT_HEADING_FONT = 'var(--font-heading, "Instrument Serif", Georgia, serif)';
const REPORT_BODY_FONT = 'var(--font-sans, "Montserrat", sans-serif)';

function fmtMoney(val) {
  if (val == null || isNaN(Number(val)) || Number(val) <= 0) return '—';
  return `$${Math.round(Number(val)).toLocaleString('en-US')}`;
}

function fmtSigned(val) {
  const n = Math.round(Number(val) || 0);
  if (n > 0) return `+$${n.toLocaleString('en-US')}`;
  if (n < 0) return `\u2212$${Math.abs(n).toLocaleString('en-US')}`;
  return '$0';
}

function fmtShortDate(dStr) {
  if (!dStr) return '—';
  const d = new Date(dStr);
  if (isNaN(d.getTime())) return String(dStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const GRID_ROWS = [
  { key: 'time', label: 'Sale Date / Time' },
  { key: 'gla', label: 'Living Area (GLA)' },
  { key: 'age', label: 'Year Built / Eff. Age' },
  { key: 'bed_bath', label: 'Beds & Baths' },
  { key: 'quality', label: 'Quality (UAD)' },
  { key: 'condition', label: 'Condition (UAD)' },
  { key: 'construction', label: 'Construction' },
  { key: 'windows', label: 'Windows' },
  { key: 'roof', label: 'Roof' },
  { key: 'pool', label: 'Pool & Outdoor' },
  { key: 'garage', label: 'Garage & Parking' },
  { key: 'location_subdivision', label: 'Location / Subdiv.' },
  { key: 'location_site', label: 'Waterfront & View' },
  { key: 'boat_dock', label: 'Boat Dock / Lift' },
  { key: 'lot_size', label: 'Lot Size' }
];

function getSubjectGridLabel(rowKey, summary, grid) {
  switch (rowKey) {
    case 'time':
      return 'Current baseline';
    case 'gla':
      return summary.sqft ? `${Number(summary.sqft).toLocaleString()} sf (@$${grid.effectiveRates?.glaRate || 0}/sf)` : '—';
    case 'age':
      return summary.ageLabel || '—';
    case 'bed_bath':
      return summary.bedBathLabel || '—';
    case 'quality':
      return summary.qualityLabel || '—';
    case 'condition':
      return summary.conditionLabel || '—';
    case 'construction':
      return summary.constructionDetail || summary.constructionLabel || 'Unknown';
    case 'windows':
      return summary.windowsLabel || '—';
    case 'roof':
      return summary.roofLabel || '—';
    case 'pool':
      return summary.poolLabel || '—';
    case 'garage':
      return summary.garageLabel || '—';
    case 'location_subdivision':
      return [summary.subdivisionName || 'Not set', summary.nbrhdCd ? `Nbrhd ${summary.nbrhdCd}` : null].filter(Boolean).join(' · ');
    case 'location_site':
      return summary.locationSiteLabel || '—';
    case 'boat_dock':
      return summary.boatDockLabel || 'Unknown';
    case 'lot_size':
      return summary.lotSizeLabel || '—';
    default:
      return '—';
  }
}

function ReportPageFooter({ pageNumber, totalPages }) {
  return (
    <div
      className="valuation-page-footer"
      style={{
        marginTop: '24px',
        paddingTop: '10px',
        borderTop: '1px solid rgba(52, 41, 42, 0.16)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        fontFamily: REPORT_BODY_FONT,
        fontSize: '9.5px',
        color: 'rgba(52, 41, 42, 0.62)'
      }}
    >
      <span>{VALUATION_REPORT_FOOTER}</span>
      <span style={{ fontWeight: 700, color: '#34292A' }}>
        Page {pageNumber} of {totalPages}
      </span>
    </div>
  );
}

export default function ValuationReportPage({ propertyId, navigateTo }) {
  const { cssVariables } = usePortalTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadThemeFont('Instrument Serif');
  }, []);

  const resolvedPropId = propertyId || (() => {
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/^\/admin\/investor\/valuation-report\/([^/?#]+)/);
      return match ? match[1] : '';
    }
    return '';
  })();

  const queryParams = useMemo(() => {
    if (typeof window === 'undefined') return { mode: 'as_is', sizeMethod: 'auto' };
    const sp = new URLSearchParams(window.location.search);
    return {
      mode: sp.get('mode') === 'arv' ? 'arv' : 'as_is',
      sizeMethod: sp.get('sizeMethod') || 'auto'
    };
  }, []);

  useEffect(() => {
    if (!resolvedPropId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/investor/report?property_id=${encodeURIComponent(resolvedPropId)}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            const currentPath = window.location.pathname + window.location.search;
            if (navigateTo) navigateTo('login', null, currentPath);
            else window.location.href = `/login?next=${encodeURIComponent(currentPath)}`;
            return null;
          }
          if (res.status === 404) throw new Error('Property not found or unauthorized.');
          throw new Error(`Failed to load valuation report (HTTP ${res.status}).`);
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled && json) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to load valuation report.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedPropId]);

  const property = data?.property || {};
  const countyData = data?.countyData || null;
  const comps = data?.comps || [];
  const photos = data?.photos || [];
  const profile = data?.profile || {};
  const marketTrends = data?.marketTrends || null;
  const countyFreshness = data?.countyFreshness || null;

  const hasRenovationBudget = Number(property.rehab_budget) > 0;
  const savedAppraisal = profile?.valuation_defaults?.saved_appraisals?.[property.id] || null;
  const activeMode = hasRenovationBudget && (queryParams.mode === 'arv' || savedAppraisal?.mode === 'arv')
    ? 'arv'
    : 'as_is';
  const activeSizeMethod = queryParams.sizeMethod !== 'auto'
    ? queryParams.sizeMethod
    : (savedAppraisal?.sizeMethod || 'auto');

  const subjectForGrid = useMemo(() => {
    if (!property?.id) return {};
    return {
      ...property,
      sqft: property.sqft || countyData?.living_sqft || null,
      lot_sqft: property.lot_sqft || countyData?.land_sqft || null,
      year_built: property.year_built || countyData?.year_built || null,
      eff_year_built: property.eff_year_built || countyData?.eff_year_built || null,
      just_value: countyData?.just_value ?? property.just_value ?? null,
      land_value: property.land_value ?? countyData?.land_value ?? null,
      imp_qual: property.imp_qual || countyData?.imp_qual || null,
      const_class: property.const_class || countyData?.const_class || null,
      nearest_same_street_sale: countyData?.nearest_same_street_sale || null,
      subdivision_name: property.subdivision_name || countyData?.subdivision_name || null,
      subdivision_code: property.subdivision_code || countyData?.subdivision_code || null,
      nbrhd_cd: property.nbrhd_cd || countyData?.nbrhd_cd || null,
      s_legal: property.s_legal || countyData?.s_legal || null,
      appraisal_overrides: savedAppraisal?.subjectOverrides || {},
      ...(savedAppraisal?.subjectOverrides || {})
    };
  }, [property, countyData, savedAppraisal]);

  const grid = useMemo(() => {
    if (!property?.id) return null;
    const zipSummary = marketTrends?.summary || null;
    const zipMonthlyPct = zipSummary?.monthly_trend_pct != null && !isNaN(Number(zipSummary.monthly_trend_pct))
      ? Number(zipSummary.monthly_trend_pct) / 100
      : null;
    const zipCode = String(property.zip || countyData?.zip || '').trim();
    const zipTrendSource = /^\d{5}$/.test(zipCode) ? `ZIP ${zipCode}` : null;

    return computeAppraisalGrid({
      comps,
      subject: subjectForGrid,
      mode: activeMode,
      sizeMethod: activeSizeMethod,
      library: profile?.valuation_defaults?.library || {},
      customWeights: savedAppraisal?.customWeights || null,
      zipMarketData: marketTrends || null,
      zipTrendMonthlyPct: zipMonthlyPct,
      zipTrendSource
    });
  }, [property?.id, property.zip, countyData?.zip, comps, subjectForGrid, activeMode, activeSizeMethod, profile, savedAppraisal, marketTrends]);

  const pricing = useMemo(() => resolvePropertyPricing(property, countyData), [property, countyData]);

  const todayStr = useMemo(
    () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    []
  );
  const isoDateStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const coverImage = useMemo(() => {
    if (property.cover_photo_url) return property.cover_photo_url;
    const coverPhoto = photos.find((p) => p.is_cover) || photos[0];
    if (coverPhoto?.blob_url) return coverPhoto.blob_url;
    if (property.lng && property.lat) {
      return getMapboxAerialUrl(property.lng, property.lat, 900, 400, 18.2);
    }
    return null;
  }, [property.cover_photo_url, property.lng, property.lat, photos]);

  const compsStaticMap = useMemo(() => {
    if (!property.lng || !property.lat) return null;
    const mapComps = (grid?.usedComps?.length > 0 ? grid.usedComps : comps).slice(0, 8);
    return getCmaStaticMapUrl(property, mapComps, 820, 320);
  }, [property, grid?.usedComps, comps]);

  useEffect(() => {
    if (property?.address) {
      document.title = `Valuation Estimate - ${formatNiceAddress(property.address)} - ${isoDateStr}`;
    }
  }, [property?.address, isoDateStr]);

  const handlePrintPdf = async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await new Promise((r) => setTimeout(r, 300));
    window.print();
  };

  const handleDirectDownloadPdf = () => {
    if (!grid) return;
    const bytes = buildValuationEstimatePdfBytes({
      property,
      countyData,
      grid,
      countyFreshness,
      hasRenovationBudget
    });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Valuation Estimate - ${formatNiceAddress(property.address || 'Property')} - ${isoDateStr}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleSaveToProperty = async () => {
    if (!property?.id || !grid) return;
    setSavingDoc(true);
    setSaveMessage('');
    setSaveError('');
    try {
      const pdfBase64 = buildValuationEstimatePdfBase64({
        property,
        countyData,
        grid,
        countyFreshness,
        hasRenovationBudget
      });
      const niceName = formatNiceAddress(property.address || 'Property');
      const title = `Valuation Estimate - ${niceName} (${isoDateStr})`;
      const res = await fetch('/api/investor/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          title,
          doc_type: 'valuation_estimate',
          data: pdfBase64,
          filename: `${title}.pdf`
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save valuation PDF');
      }
      setSaveMessage('Saved to Photos & Notes documents');
      setTimeout(() => setSaveMessage(''), 6000);
    } catch (err) {
      setSaveError(err.message || 'Unable to save valuation PDF');
    } finally {
      setSavingDoc(false);
    }
  };

  const handleManualPdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !property?.id) return;
    setSavingDoc(true);
    setSaveMessage('');
    setSaveError('');
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const niceName = formatNiceAddress(property.address || 'Property');
          const res = await fetch('/api/investor/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              property_id: property.id,
              title: `Valuation Estimate - ${niceName} (${isoDateStr})`,
              doc_type: 'valuation_estimate',
              data: reader.result,
              filename: file.name
            })
          });
          if (!res.ok) throw new Error('Upload failed');
          setSaveMessage('Uploaded PDF saved to Photos & Notes');
        } catch (err) {
          setSaveError(err.message || 'Upload failed');
        } finally {
          setSavingDoc(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setSaveError(err.message || 'Error reading file');
      setSavingDoc(false);
    } finally {
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#FAF8F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: REPORT_BODY_FONT, color: '#34292A' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>Preparing Valuation Estimate…</div>
          <div style={{ fontSize: '13px', color: 'rgba(52, 41, 42, 0.65)' }}>Loading county record, comparable sales, and adjustment grid</div>
        </div>
      </div>
    );
  }

  if (error || !data || !grid) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#FAF8F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: REPORT_BODY_FONT }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '36px 40px', maxWidth: '500px', textAlign: 'center', border: '1px solid rgba(52, 41, 42, 0.12)' }}>
          <h1 style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '30px', color: '#34292A', margin: '0 0 8px 0', fontWeight: 400 }}>
            Valuation Report Unavailable
          </h1>
          <p style={{ fontSize: '13px', color: 'rgba(52, 41, 42, 0.72)', margin: '0 0 22px 0' }}>{error || 'Could not locate property.'}</p>
          <button
            type="button"
            onClick={() => (navigateTo ? navigateTo('admin') : (window.location.href = '/admin?tab=investor'))}
            style={{ backgroundColor: '#34292A', color: '#FAF8F5', border: 'none', borderRadius: '50px', padding: '10px 22px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Back to Investor Studio →
          </button>
        </div>
      </div>
    );
  }

  const summary = grid.subjectSummary || {};
  const countyKey = resolvePropertyCounty(property) || countyData?.county || 'Broward';
  const countyLabel = getPropertyCountyLabel(property);
  const appraiserLabel = getCountyAppraiserLabel(countyKey);
  const totalPages = 7;
  const estVal = grid.reconciledValue;
  const deltaPct = estVal && pricing.referencePrice
    ? Math.round(((estVal - pricing.referencePrice) / pricing.referencePrice) * 1000) / 10
    : null;
  const jvAnchor = grid.sanityAnchors?.countyJustValueAnchor || null;
  const streetAnchor = grid.sanityAnchors?.nearestSameStreetSale || null;
  const refAnchor = grid.sanityAnchors?.referencePriceAnchor || null;
  const compsWithNotes = grid.comps.filter((c) => c.notes || c.compDetails?.notes);

  const reportFontVars = {
    '--font-heading': cssVariables?.['--font-heading'] || "'Instrument Serif', Georgia, serif",
    '--font-display': cssVariables?.['--font-display'] || "'Instrument Serif', Georgia, serif",
    '--font-sans': cssVariables?.['--font-sans'] || "'Montserrat', sans-serif"
  };

  return (
    <div style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', color: '#34292A', ...reportFontVars }}>
      <style>{`
        @page {
          size: letter portrait;
          margin: 0.5in;
        }
        @page landscape-grid {
          size: letter landscape;
          margin: 0.4in;
        }
        .valuation-landscape-page {
          page: landscape-grid;
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
          .valuation-report-shell {
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .valuation-page {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            page-break-after: always;
            break-after: page;
          }
          .valuation-page:last-of-type {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      {/* SCREEN-ONLY TOOLBAR */}
      <div
        className="no-print"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid rgba(52, 41, 42, 0.12)',
          boxShadow: '0 2px 12px rgba(52, 41, 42, 0.05)',
          padding: '12px 24px'
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              type="button"
              onClick={() => (navigateTo ? navigateTo('admin') : (window.location.href = '/admin?tab=investor'))}
              style={{ background: 'none', border: 'none', color: '#34292A', fontFamily: REPORT_BODY_FONT, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
            >
              ← Back to Studio
            </button>
            <span style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.6)', fontFamily: REPORT_BODY_FONT }}>
              Valuation Estimate · {formatNiceAddress(property.address)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            {saveMessage && (
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#3F5A3A', fontFamily: REPORT_BODY_FONT }}>
                ✓ {saveMessage}
              </span>
            )}
            {saveError && (
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#8A2A1E', fontFamily: REPORT_BODY_FONT }}>
                {saveError}
              </span>
            )}

            <button
              type="button"
              onClick={handlePrintPdf}
              style={{
                backgroundColor: '#34292A',
                color: '#FAF8F5',
                border: 'none',
                borderRadius: '999px',
                padding: '8px 18px',
                fontFamily: REPORT_BODY_FONT,
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                cursor: 'pointer'
              }}
            >
              Print / Save PDF
            </button>

            <button
              type="button"
              onClick={handleDirectDownloadPdf}
              style={{
                backgroundColor: '#BDD3E2',
                color: '#34292A',
                border: '1px solid #859DCE',
                borderRadius: '999px',
                padding: '8px 16px',
                fontFamily: REPORT_BODY_FONT,
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer'
              }}
            >
              Download valuation PDF
            </button>

            <button
              type="button"
              disabled={savingDoc}
              onClick={handleSaveToProperty}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#34292A',
                border: '1px solid rgba(52, 41, 42, 0.28)',
                borderRadius: '999px',
                padding: '8px 16px',
                fontFamily: REPORT_BODY_FONT,
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: savingDoc ? 'wait' : 'pointer'
              }}
            >
              {savingDoc ? 'Saving…' : 'Save to property'}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: 'none' }}
              onChange={handleManualPdfUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(52, 41, 42, 0.65)',
                fontFamily: REPORT_BODY_FONT,
                fontSize: '11px',
                fontWeight: 600,
                textDecoration: 'underline',
                cursor: 'pointer'
              }}
            >
              Upload custom PDF
            </button>
          </div>
        </div>
      </div>

      {/* REPORT PAGES CONTAINER */}
      <div className="valuation-report-shell" style={{ maxWidth: '940px', margin: '28px auto', padding: '0 20px 60px' }}>

        {/* =============================================================== */}
        {/* PAGE 1: COVER                                                   */}
        {/* =============================================================== */}
        <section
          className="valuation-page"
          style={{
            backgroundColor: '#FAF8F5',
            border: '1px solid rgba(52, 41, 42, 0.14)',
            borderRadius: '18px',
            padding: '36px 40px 28px',
            marginBottom: '28px',
            boxShadow: '0 8px 28px rgba(52, 41, 42, 0.06)'
          }}
        >
          <div style={{ backgroundColor: '#34292A', color: '#FAF8F5', borderRadius: '14px', padding: '28px 30px', borderBottom: '4px solid #BDD3E2', marginBottom: '22px' }}>
            <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#BDD3E2', marginBottom: '8px' }}>
              VALUATION ESTIMATE · SALES COMPARISON REPORT
            </div>
            <h1 style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '40px', fontWeight: 400, margin: '0 0 8px 0', lineHeight: 1.08, color: '#FAF8F5' }}>
              {formatNiceAddress(property.address)}
            </h1>
            <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '13px', color: 'rgba(250, 248, 245, 0.85)', marginBottom: '14px' }}>
              {[property.city || countyData?.city, property.state || 'FL', property.zip || countyData?.zip].filter(Boolean).join(', ')} · {countyLabel}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontFamily: REPORT_BODY_FONT, fontSize: '11.5px', color: '#BDD3E2' }}>
              <span><strong>Folio:</strong> {property.parcel_id || countyData?.parcel_id || 'Not linked'}</span>
              <span><strong>Date:</strong> {todayStr}</span>
              {summary.subdivisionName && <span><strong>Subdivision:</strong> {summary.subdivisionName}</span>}
              {summary.nbrhdCd && <span><strong>Neighborhood:</strong> {summary.nbrhdCd}</span>}
            </div>
          </div>

          {coverImage && (
            <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(52, 41, 42, 0.12)', marginBottom: '22px', maxHeight: '230px' }}>
              <img src={coverImage} alt={property.address} style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block' }} />
            </div>
          )}

          {/* Value + Price Source Hero Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div style={{ backgroundColor: '#34292A', color: '#FAF8F5', borderRadius: '14px', padding: '22px 24px' }}>
              <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#BDD3E2', marginBottom: '6px' }}>
                {activeMode === 'arv' && hasRenovationBudget ? 'ESTIMATED AFTER-REPAIR VALUE (ARV)' : 'ESTIMATED CURRENT VALUE'}
              </div>
              <div style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '40px', lineHeight: 1.06, marginBottom: '8px' }}>
                {estVal ? fmtMoney(estVal) : '—'}
              </div>
              <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '12px', color: 'rgba(250, 248, 245, 0.85)' }}>
                <strong>Range:</strong> {grid.rangeLow && grid.rangeHigh ? `${fmtMoney(grid.rangeLow)} – ${fmtMoney(grid.rangeHigh)}` : '—'}
              </div>
              <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '11.5px', color: '#BDD3E2', marginTop: '4px' }}>
                {grid.reconciledPpsf ? `$${grid.reconciledPpsf}/sf · ` : ''}{grid.usedComps.length} active comparable sales
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(52, 41, 42, 0.15)', borderRadius: '14px', padding: '22px 24px' }}>
              <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.6)', marginBottom: '6px' }}>
                {pricing.headerPriceLabel}
              </div>
              <div style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '40px', lineHeight: 1.06, color: '#34292A', marginBottom: '8px' }}>
                {pricing.referencePrice ? fmtMoney(pricing.referencePrice) : 'Not set'}
              </div>
              {deltaPct != null && (
                <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '12px', fontWeight: 700, color: deltaPct >= 0 ? '#3F5A3A' : '#41101B' }}>
                  Est. current value is {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}% vs {pricing.shortLabel.toLowerCase()}
                </div>
              )}
              {pricing.offerPrice && pricing.priceSource !== 'my_offer' && (
                <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '11.5px', color: '#34292A', marginTop: '4px' }}>
                  <strong>My offer:</strong> {fmtMoney(pricing.offerPrice)}
                </div>
              )}
            </div>
          </div>

          {/* Confidence Box */}
          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(52, 41, 42, 0.14)', borderRadius: '14px', padding: '18px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.65)' }}>
                CONFIDENCE RATING
              </span>
              <span style={{ fontFamily: REPORT_BODY_FONT, fontSize: '12px', fontWeight: 700, color: grid.confidenceScore === 'High' ? '#3F5A3A' : '#41101B' }}>
                {grid.confidenceScore.toUpperCase()} · {grid.confidencePct}%
              </span>
            </div>
            <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '11.5px', color: '#34292A', marginBottom: grid.lowConfidenceReasons?.length ? '8px' : 0 }}>
              Spread {grid.cvPct.toFixed(1)}% CV · Avg {(grid.avgGrossPct || 0).toFixed(1)}% gross adj · Max single-comp weight {grid.maxCompWeightPct.toFixed(1)}%
            </div>
            {grid.lowConfidenceReasons?.length > 0 && (
              <ul style={{ margin: '6px 0 0 18px', padding: 0, fontFamily: REPORT_BODY_FONT, fontSize: '11.5px', color: '#41101B', lineHeight: 1.5 }}>
                {grid.lowConfidenceReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>

          <ReportPageFooter pageNumber={1} totalPages={totalPages} />
        </section>

        {/* =============================================================== */}
        {/* PAGE 2: SUBJECT COUNTY RECORD                                   */}
        {/* =============================================================== */}
        <section
          className="valuation-page"
          style={{
            backgroundColor: '#FAF8F5',
            border: '1px solid rgba(52, 41, 42, 0.14)',
            borderRadius: '18px',
            padding: '32px 38px 26px',
            marginBottom: '28px',
            boxShadow: '0 8px 28px rgba(52, 41, 42, 0.06)'
          }}
        >
          <div style={{ borderBottom: '2px solid #34292A', paddingBottom: '10px', marginBottom: '20px' }}>
            <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#859DCE' }}>
              SECTION 01 · SUBJECT PROPERTY
            </div>
            <h2 style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '30px', fontWeight: 400, margin: '2px 0 0 0', color: '#34292A' }}>
              County Record &amp; Verified Subject Specifications
            </h2>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: REPORT_BODY_FONT, fontSize: '12px', backgroundColor: '#FFFFFF', borderRadius: '10px', overflow: 'hidden' }}>
            <tbody>
              {[
                ['Living Area (Heated / Finished)', summary.sqft ? `${Number(summary.sqft).toLocaleString()} sf` : '—'],
                ['Sketch Areas', summary.sketchAreas || '—'],
                ['Year Built / Effective Year', summary.ageLabel || '—'],
                ['Construction', summary.constructionDetail || summary.constructionLabel || 'Unknown'],
                ['Lot Size', summary.lotSizeLabel || '—'],
                ['Beds / Baths', summary.bedBathLabel || '—'],
                ['Quality (UAD) / Condition (UAD)', `${summary.qualityLabel || '—'} · ${summary.conditionLabel || '—'}`],
                ['Roof & Storm Windows', `${summary.roofLabel || 'Unknown'} · Windows: ${summary.windowsLabel || 'Unknown'}`],
                ['Pool & Outdoor', summary.poolLabel || 'Unknown'],
                ['Boat Dock / Lift', summary.boatDockLabel || 'Unknown'],
                ['Garage / Parking', summary.garageLabel || 'Unknown'],
                ['Waterfront & View', summary.locationSiteLabel || 'Unknown'],
                ['Neighborhood Code (NBRHD_CD)', summary.nbrhdCd || countyData?.nbrhd_cd || '—'],
                ['Subdivision / HOA', [summary.subdivisionName || '—', summary.hoaName ? `HOA: ${summary.hoaName}` : null].filter(Boolean).join(' · ')],
                ['County Just Value', summary.justValue ? fmtMoney(summary.justValue) : '—'],
                [
                  'Land vs Improvement Split',
                  summary.landValue != null && summary.improvementValue != null
                    ? `Land ${fmtMoney(summary.landValue)} (${Math.round(summary.landSharePct || 0)}%) · Improvement ${fmtMoney(summary.improvementValue)}${summary.sqft ? ` ($${Math.round(summary.improvementValue / summary.sqft)}/sf)` : ''}`
                    : '—'
                ],
                ['Short Legal Description', property.s_legal || countyData?.s_legal || '—']
              ].map(([k, v], idx) => (
                <tr key={k} style={{ backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAF8F5', borderBottom: '1px solid rgba(52, 41, 42, 0.1)' }}>
                  <td style={{ padding: '9px 14px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.7)', width: '36%' }}>{k}</td>
                  <td style={{ padding: '9px 14px', color: '#34292A' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '18px', backgroundColor: '#FFFFFF', border: '1px solid rgba(52, 41, 42, 0.14)', borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.6)', marginBottom: '6px' }}>
              RECENT IMPROVEMENTS
            </div>
            <p style={{ margin: 0, fontFamily: REPORT_BODY_FONT, fontSize: '12px', color: '#34292A', lineHeight: 1.55 }}>
              {summary.recentImprovements || 'No recent improvements recorded.'}
            </p>
          </div>

          <ReportPageFooter pageNumber={2} totalPages={totalPages} />
        </section>

        {/* =============================================================== */}
        {/* PAGE 3: COMPS MAP + TABLE                                       */}
        {/* =============================================================== */}
        <section
          className="valuation-page"
          style={{
            backgroundColor: '#FAF8F5',
            border: '1px solid rgba(52, 41, 42, 0.14)',
            borderRadius: '18px',
            padding: '32px 38px 26px',
            marginBottom: '28px',
            boxShadow: '0 8px 28px rgba(52, 41, 42, 0.06)'
          }}
        >
          <div style={{ borderBottom: '2px solid #34292A', paddingBottom: '10px', marginBottom: '18px' }}>
            <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#859DCE' }}>
              SECTION 02 · COMPARABLE SALES
            </div>
            <h2 style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '30px', fontWeight: 400, margin: '2px 0 0 0', color: '#34292A' }}>
              Comparable Sales Map &amp; Summary Table
            </h2>
          </div>

          {compsStaticMap && (
            <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(52, 41, 42, 0.15)', marginBottom: '18px' }}>
              <img src={compsStaticMap} alt="Comparable sales map" style={{ width: '100%', height: '270px', objectFit: 'cover', display: 'block' }} />
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: REPORT_BODY_FONT, fontSize: '11px', backgroundColor: '#FFFFFF' }}>
            <thead>
              <tr style={{ backgroundColor: '#34292A', color: '#FAF8F5', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>#</th>
                <th style={{ padding: '8px 10px' }}>Address &amp; Subdivision</th>
                <th style={{ padding: '8px 10px' }}>Sold</th>
                <th style={{ padding: '8px 10px' }}>Sale Price</th>
                <th style={{ padding: '8px 10px' }}>Living SF</th>
                <th style={{ padding: '8px 10px' }}>$/sf</th>
                <th style={{ padding: '8px 10px' }}>Dist</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px' }}>Adjusted</th>
              </tr>
            </thead>
            <tbody>
              {grid.comps.map((c, idx) => (
                <tr key={c.id} style={{ backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAF8F5', borderBottom: '1px solid rgba(52, 41, 42, 0.1)', opacity: c.isUsed ? 1 : 0.65 }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>C{idx + 1}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ fontWeight: 700, color: '#34292A' }}>{c.address}</div>
                    <div style={{ fontSize: '10px', color: 'rgba(52, 41, 42, 0.65)' }}>
                      {[c.subdivision_name, c.nbrhdCd ? `Nbrhd ${c.nbrhdCd}` : null, c.isOutlier ? 'Outlier' : null].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px' }}>{fmtShortDate(c.sold_date)}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmtMoney(c.soldPrice)}</td>
                  <td style={{ padding: '8px 10px' }}>{c.compSqft ? c.compSqft.toLocaleString() : '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{c.compPpsf ? `$${c.compPpsf}` : '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{c.distance_mi != null ? `${c.distance_mi} mi` : '—'}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: c.isUsed ? '#3F5A3A' : 'rgba(52, 41, 42, 0.55)' }}>
                    {c.isUsed ? `USED (${c.weightPct.toFixed(1)}%)` : 'OFF'}
                  </td>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{fmtMoney(c.adjustedPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ReportPageFooter pageNumber={3} totalPages={totalPages} />
        </section>

        {/* =============================================================== */}
        {/* PAGE 4: FULL ADJUSTMENT GRID (LANDSCAPE PAGE)                   */}
        {/* =============================================================== */}
        <section
          className="valuation-page valuation-landscape-page"
          style={{
            backgroundColor: '#FAF8F5',
            border: '1px solid rgba(52, 41, 42, 0.14)',
            borderRadius: '18px',
            padding: '24px 26px 20px',
            marginBottom: '28px',
            boxShadow: '0 8px 28px rgba(52, 41, 42, 0.06)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #34292A', paddingBottom: '8px', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <span style={{ fontFamily: REPORT_BODY_FONT, fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#859DCE', display: 'block' }}>
                SECTION 03 · FULL ADJUSTMENT GRID (LANDSCAPE)
              </span>
              <h2 style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '26px', fontWeight: 400, margin: 0, color: '#34292A' }}>
                Sales Comparison Adjustment Grid
              </h2>
            </div>
            <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10px', color: 'rgba(52, 41, 42, 0.72)' }}>
              GLA: {grid.glaRateSource} · Time: {grid.timeTrendSource}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: REPORT_BODY_FONT, fontSize: '10px', backgroundColor: '#FFFFFF' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left', backgroundColor: '#F2EFEA', border: '1px solid rgba(52, 41, 42, 0.14)', width: '125px' }}>Feature</th>
                  <th style={{ padding: '8px', textAlign: 'left', backgroundColor: '#34292A', color: '#FAF8F5', border: '1px solid #34292A', width: '145px' }}>
                    <div style={{ fontSize: '9px', color: '#BDD3E2', letterSpacing: '0.1em' }}>SUBJECT</div>
                    <div style={{ fontWeight: 700, fontSize: '11px' }}>{formatNiceAddress(property.address)}</div>
                    <div style={{ fontSize: '9.5px', color: '#BDD3E2' }}>{summary.priceColumnText || 'Subject anchor'}</div>
                  </th>
                  {grid.comps.map((c, idx) => (
                    <th key={c.id} style={{ padding: '8px', textAlign: 'left', backgroundColor: c.isUsed ? '#FFFFFF' : '#F2EFEA', border: '1px solid rgba(52, 41, 42, 0.14)', opacity: c.isUsed ? 1 : 0.65 }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: c.isUsed ? '#3F5A3A' : 'rgba(52, 41, 42, 0.6)' }}>
                        COMP {idx + 1} · {c.isUsed ? 'USED' : 'OFF'}
                      </div>
                      <div style={{ fontWeight: 700, color: '#34292A' }}>{(c.address || '').split(',')[0]}</div>
                      <div style={{ fontSize: '9px', color: 'rgba(52, 41, 42, 0.65)', fontWeight: 500 }}>
                        {c.distance_mi != null ? `${c.distance_mi} mi` : '—'} · {fmtShortDate(c.sold_date)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ backgroundColor: '#F7F3EE', fontWeight: 700 }}>
                  <td style={{ padding: '6px 8px', border: '1px solid rgba(52, 41, 42, 0.14)' }}>Unadjusted Price</td>
                  <td style={{ padding: '6px 8px', backgroundColor: '#34292A', color: '#FAF8F5', border: '1px solid rgba(250, 248, 245, 0.15)' }}>
                    {summary.unadjustedRowText || '—'}
                  </td>
                  {grid.comps.map((c) => (
                    <td key={c.id} style={{ padding: '6px 8px', border: '1px solid rgba(52, 41, 42, 0.14)' }}>
                      {fmtMoney(c.soldPrice)} {c.compPpsf ? `($${c.compPpsf}/sf)` : ''}
                    </td>
                  ))}
                </tr>

                {GRID_ROWS.map((row, rIdx) => (
                  <tr key={row.key} style={{ backgroundColor: rIdx % 2 === 0 ? '#FFFFFF' : '#FAF8F5' }}>
                    <td style={{ padding: '5px 8px', fontWeight: 600, border: '1px solid rgba(52, 41, 42, 0.12)' }}>{row.label}</td>
                    <td style={{ padding: '5px 8px', backgroundColor: '#34292A', color: '#FAF8F5', border: '1px solid rgba(250, 248, 245, 0.12)' }}>
                      {getSubjectGridLabel(row.key, summary, grid)}
                    </td>
                    {grid.comps.map((c) => {
                      const cell = c.cells?.[row.key] || { spec: '—', amount: 0 };
                      return (
                        <td key={c.id} style={{ padding: '5px 8px', border: '1px solid rgba(52, 41, 42, 0.12)', opacity: c.isUsed ? 1 : 0.6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                            <span style={{ color: 'rgba(52, 41, 42, 0.78)' }}>
                              {cell.spec}{cell.needsInfo ? ' (Needs info)' : ''}
                            </span>
                            <span style={{ fontWeight: 700, color: cell.amount > 0 ? '#3F5A3A' : cell.amount < 0 ? '#41101B' : 'rgba(52, 41, 42, 0.5)', whiteSpace: 'nowrap' }}>
                              {fmtSigned(cell.amount)}
                            </span>
                          </div>
                          {cell.note && (
                            <div style={{ fontSize: '8.5px', color: 'rgba(52, 41, 42, 0.58)' }}>{cell.note}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Summary Rows */}
                <tr style={{ backgroundColor: '#F2EFEA', fontWeight: 700 }}>
                  <td style={{ padding: '6px 8px', border: '1px solid rgba(52, 41, 42, 0.16)' }}>Net Adj. (≤15%)</td>
                  <td style={{ padding: '6px 8px', backgroundColor: '#34292A', color: '#BDD3E2' }}>—</td>
                  {grid.comps.map((c) => (
                    <td key={c.id} style={{ padding: '6px 8px', border: '1px solid rgba(52, 41, 42, 0.16)', color: c.isHighNet ? '#7A5212' : '#34292A' }}>
                      {fmtSigned(c.netAdjustment)} ({c.netAdjustmentPct.toFixed(1)}%)
                    </td>
                  ))}
                </tr>
                <tr style={{ backgroundColor: '#F2EFEA', fontWeight: 700 }}>
                  <td style={{ padding: '6px 8px', border: '1px solid rgba(52, 41, 42, 0.16)' }}>Gross Adj. (≤25%)</td>
                  <td style={{ padding: '6px 8px', backgroundColor: '#34292A', color: '#BDD3E2' }}>—</td>
                  {grid.comps.map((c) => (
                    <td key={c.id} style={{ padding: '6px 8px', border: '1px solid rgba(52, 41, 42, 0.16)', color: c.isHighGross ? '#8A2A1E' : '#34292A' }}>
                      {fmtMoney(c.grossAdjustment)} ({c.grossAdjustmentPct.toFixed(1)}%)
                    </td>
                  ))}
                </tr>
                <tr style={{ backgroundColor: '#FFFFFF', fontWeight: 700 }}>
                  <td style={{ padding: '7px 8px', border: '1px solid rgba(52, 41, 42, 0.16)' }}>Adjusted Price</td>
                  <td style={{ padding: '7px 8px', backgroundColor: '#34292A', color: '#FAF8F5', fontSize: '12px' }}>
                    {estVal ? fmtMoney(estVal) : '—'}
                  </td>
                  {grid.comps.map((c) => (
                    <td key={c.id} style={{ padding: '7px 8px', border: '1px solid rgba(52, 41, 42, 0.16)', fontSize: '11px' }}>
                      {fmtMoney(c.adjustedPrice)} {c.adjustedPpsf ? `($${c.adjustedPpsf}/sf)` : ''}
                    </td>
                  ))}
                </tr>
                <tr style={{ backgroundColor: '#F2EFEA', fontWeight: 700 }}>
                  <td style={{ padding: '6px 8px', border: '1px solid rgba(52, 41, 42, 0.16)' }}>Weight</td>
                  <td style={{ padding: '6px 8px', backgroundColor: '#34292A', color: '#BDD3E2' }}>
                    ∑ {grid.weightValidation.sumPct.toFixed(1)}%
                  </td>
                  {grid.comps.map((c) => (
                    <td key={c.id} style={{ padding: '6px 8px', border: '1px solid rgba(52, 41, 42, 0.16)' }}>
                      {c.isUsed ? `${c.weightPct.toFixed(1)}%` : 'OFF · 0%'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <ReportPageFooter pageNumber={4} totalPages={totalPages} />
        </section>

        {/* =============================================================== */}
        {/* PAGE 5: RECONCILIATION WEIGHTS + CHECKS + SANITY ANCHORS        */}
        {/* =============================================================== */}
        <section
          className="valuation-page"
          style={{
            backgroundColor: '#FAF8F5',
            border: '1px solid rgba(52, 41, 42, 0.14)',
            borderRadius: '18px',
            padding: '32px 38px 26px',
            marginBottom: '28px',
            boxShadow: '0 8px 28px rgba(52, 41, 42, 0.06)'
          }}
        >
          <div style={{ borderBottom: '2px solid #34292A', paddingBottom: '10px', marginBottom: '18px' }}>
            <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#859DCE' }}>
              SECTION 04 · RECONCILIATION &amp; REALITY CHECKS
            </div>
            <h2 style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '30px', fontWeight: 400, margin: '2px 0 0 0', color: '#34292A' }}>
              Reconciliation Weights, Checks &amp; Sanity Anchors
            </h2>
          </div>

          {/* Sanity Anchors */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(52, 41, 42, 0.14)', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.6)' }}>
                COUNTY JUST VALUE ÷ 0.85
              </div>
              <div style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '26px', color: '#34292A', margin: '4px 0' }}>
                {jvAnchor ? fmtMoney(jvAnchor.impliedMarketValue) : '—'}
              </div>
              <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.7)' }}>
                {jvAnchor ? `Just val ${fmtMoney(jvAnchor.justValue)}${jvAnchor.landSharePct != null ? ` · ${Math.round(jvAnchor.landSharePct)}% land` : ''}` : 'Not linked'}
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(52, 41, 42, 0.14)', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.6)' }}>
                NEAREST SAME-STREET SALE
              </div>
              <div style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '26px', color: '#34292A', margin: '4px 0' }}>
                {streetAnchor ? fmtMoney(streetAnchor.soldPrice) : '—'}
              </div>
              <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.7)' }}>
                {streetAnchor ? `${streetAnchor.address} (${fmtShortDate(streetAnchor.soldDate)})` : 'None found'}
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(52, 41, 42, 0.14)', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.6)' }}>
                {pricing.headerPriceLabel}
              </div>
              <div style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '26px', color: '#34292A', margin: '4px 0' }}>
                {refAnchor ? fmtMoney(refAnchor.price) : '—'}
              </div>
              <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.7)' }}>
                {refAnchor?.deltaPctVsReconciled != null ? `Est. value ${refAnchor.deltaPctVsReconciled > 0 ? '+' : ''}${refAnchor.deltaPctVsReconciled}% vs anchor` : 'Reference anchor'}
              </div>
            </div>
          </div>

          {/* Weights Table */}
          <h3 style={{ fontFamily: REPORT_BODY_FONT, fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#34292A', margin: '0 0 8px 0' }}>
            Reconciliation Weights (Sum = {grid.weightValidation.sumPct.toFixed(1)}%)
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: REPORT_BODY_FONT, fontSize: '11px', backgroundColor: '#FFFFFF', marginBottom: '18px' }}>
            <thead>
              <tr style={{ backgroundColor: '#34292A', color: '#FAF8F5', textAlign: 'left' }}>
                <th style={{ padding: '7px 10px' }}>Comparable</th>
                <th style={{ padding: '7px 10px' }}>Adjusted Price</th>
                <th style={{ padding: '7px 10px' }}>Weight</th>
                <th style={{ padding: '7px 10px' }}>Weighting Basis / Penalties</th>
              </tr>
            </thead>
            <tbody>
              {grid.usedComps.map((c, idx) => (
                <tr key={c.id} style={{ backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAF8F5', borderBottom: '1px solid rgba(52, 41, 42, 0.1)' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 700 }}>{c.address}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 600 }}>{fmtMoney(c.adjustedPrice)}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 700, color: '#41101B' }}>{c.weightPct.toFixed(1)}%</td>
                  <td style={{ padding: '7px 10px', color: 'rgba(52, 41, 42, 0.72)' }}>
                    {(c.weightReasons || []).join(' · ') || `${c.distanceMi} mi · ${c.monthsSinceSale} mo · ${c.grossAdjustmentPct.toFixed(1)}% gross`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Checks */}
          <h3 style={{ fontFamily: REPORT_BODY_FONT, fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#34292A', margin: '0 0 8px 0' }}>
            USPAP &amp; Fannie Mae Guideline Checks
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {grid.checks.map((chk) => (
              <div key={chk.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 12px', backgroundColor: '#FFFFFF', border: '1px solid rgba(52, 41, 42, 0.1)', borderRadius: '8px', fontFamily: REPORT_BODY_FONT, fontSize: '11px' }}>
                <span style={{ fontWeight: 700, color: chk.status === 'pass' ? '#3F5A3A' : chk.status === 'fail' ? '#41101B' : '#7A5212', minWidth: '38px' }}>
                  {chk.status === 'pass' ? 'PASS' : chk.status === 'fail' ? 'FAIL' : 'WARN'}
                </span>
                <div>
                  <strong style={{ color: '#34292A' }}>{chk.label}:</strong>{' '}
                  <span style={{ color: 'rgba(52, 41, 42, 0.75)' }}>{chk.detail}</span>
                </div>
              </div>
            ))}
          </div>

          <ReportPageFooter pageNumber={5} totalPages={totalPages} />
        </section>

        {/* =============================================================== */}
        {/* PAGE 6: NOTES                                                   */}
        {/* =============================================================== */}
        <section
          className="valuation-page"
          style={{
            backgroundColor: '#FAF8F5',
            border: '1px solid rgba(52, 41, 42, 0.14)',
            borderRadius: '18px',
            padding: '32px 38px 26px',
            marginBottom: '28px',
            boxShadow: '0 8px 28px rgba(52, 41, 42, 0.06)'
          }}
        >
          <div style={{ borderBottom: '2px solid #34292A', paddingBottom: '10px', marginBottom: '18px' }}>
            <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#859DCE' }}>
              SECTION 05 · ANALYST NOTES
            </div>
            <h2 style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '30px', fontWeight: 400, margin: '2px 0 0 0', color: '#34292A' }}>
              Property &amp; Comparable Notes
            </h2>
          </div>

          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(52, 41, 42, 0.14)', borderRadius: '12px', padding: '18px 20px', marginBottom: '18px' }}>
            <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.6)', marginBottom: '8px' }}>
              SUBJECT NOTES
            </div>
            <p style={{ margin: 0, fontFamily: REPORT_BODY_FONT, fontSize: '12.5px', lineHeight: 1.65, color: '#34292A', whiteSpace: 'pre-wrap' }}>
              {property.notes || 'No subject property notes recorded.'}
            </p>
          </div>

          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(52, 41, 42, 0.14)', borderRadius: '12px', padding: '18px 20px' }}>
            <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.6)', marginBottom: '10px' }}>
              COMPARABLE NOTES
            </div>
            {compsWithNotes.length === 0 ? (
              <p style={{ margin: 0, fontFamily: REPORT_BODY_FONT, fontSize: '12px', color: 'rgba(52, 41, 42, 0.65)' }}>
                No individual comparable notes recorded.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {compsWithNotes.map((c) => (
                  <div key={c.id} style={{ paddingBottom: '10px', borderBottom: '1px solid rgba(52, 41, 42, 0.08)' }}>
                    <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '12px', fontWeight: 700, color: '#34292A' }}>
                      {c.address} ({fmtShortDate(c.sold_date)})
                    </div>
                    <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '12px', color: 'rgba(52, 41, 42, 0.78)', marginTop: '3px', lineHeight: 1.5 }}>
                      {c.compDetails?.notes || c.notes}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ReportPageFooter pageNumber={6} totalPages={totalPages} />
        </section>

        {/* =============================================================== */}
        {/* PAGE 7: SOURCES & DATES                                         */}
        {/* =============================================================== */}
        <section
          className="valuation-page"
          style={{
            backgroundColor: '#FAF8F5',
            border: '1px solid rgba(52, 41, 42, 0.14)',
            borderRadius: '18px',
            padding: '32px 38px 26px',
            boxShadow: '0 8px 28px rgba(52, 41, 42, 0.06)'
          }}
        >
          <div style={{ borderBottom: '2px solid #34292A', paddingBottom: '10px', marginBottom: '18px' }}>
            <div style={{ fontFamily: REPORT_BODY_FONT, fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#859DCE' }}>
              SECTION 06 · PROVENANCE &amp; DATES
            </div>
            <h2 style={{ fontFamily: REPORT_HEADING_FONT, fontSize: '30px', fontWeight: 400, margin: '2px 0 0 0', color: '#34292A' }}>
              Sources, Dates &amp; Methodology
            </h2>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: REPORT_BODY_FONT, fontSize: '12px', backgroundColor: '#FFFFFF', marginBottom: '20px' }}>
            <tbody>
              {[
                ['Report Date', todayStr],
                ['County Appraiser Source', `${appraiserLabel} (${countyData?.roll_year ? `Tax Roll ${countyData.roll_year}` : 'FL DOR NAL / SDF'})`],
                ['County Sales Complete Through', countyFreshness?.complete_through || marketTrends?.summary?.complete_through || 'Latest complete month'],
                ['Parcel Record Imported', countyData?.imported_at ? fmtShortDate(countyData.imported_at) : 'Current import'],
                ['Living Area Source', 'FL DOR TOT_LVG_AREA (heated / finished living area, excluding garages & open porches)'],
                ['GLA Rate Source', grid.glaRateSource || 'South Florida tier library'],
                ['Time Adjustment Trend Source', grid.timeTrendSource || 'Measured ZIP trend (capped ±10%)'],
                ['Reference Price Source', `${pricing.label}${pricing.referencePrice ? ` (${fmtMoney(pricing.referencePrice)})` : ''}`],
                ['Privacy & Non-PII Notice', 'No parcel owner names or mailing addresses are imported, stored, or displayed in this report.']
              ].map(([k, v], idx) => (
                <tr key={k} style={{ backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAF8F5', borderBottom: '1px solid rgba(52, 41, 42, 0.1)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: 'rgba(52, 41, 42, 0.68)', width: '34%' }}>{k}</td>
                  <td style={{ padding: '10px 14px', color: '#34292A' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ backgroundColor: 'rgba(189, 211, 226, 0.25)', border: '1px solid #859DCE', borderRadius: '12px', padding: '16px 18px', fontFamily: REPORT_BODY_FONT, fontSize: '11.5px', lineHeight: 1.6, color: '#34292A' }}>
            <strong>Methodology &amp; Scope:</strong> {VALUATION_REPORT_FOOTER} Comparable adjustments apply CIA (Comp Inferior → Add) and CBS (Comp Better → Subtract) conventions, measure market time adjustments from actual ZIP sales trends capped at ±10% unless manually overridden, cap baths credited at bedrooms + 1, and weight comparable sales by gross adjustment %, size parity, recency, proximity, verification, and detail completeness.
          </div>

          <ReportPageFooter pageNumber={7} totalPages={totalPages} />
        </section>
      </div>
    </div>
  );
}
