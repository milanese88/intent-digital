/**
 * src/components/investor/PaRecordUploadModal.jsx
 *
 * Modal to upload or paste a Property Appraiser record (PDF / text).
 * Parses building specs, features, sub-areas, sales history, and value history.
 * Strictly non-PII (drops all owner names and mailing addresses).
 * Presents a side-by-side diff review step so the user confirms before applying.
 */

import React, { useState, useRef } from 'react';
import { Button } from '../ui';

function fmtDollar(n) {
  if (n == null || isNaN(Number(n))) return '—';
  return `$${Math.round(Number(n)).toLocaleString('en-US')}`;
}

export default function PaRecordUploadModal({
  isOpen = false,
  onClose = () => {},
  property = null,
  onApply = null,
  showToast = null
}) {
  const [tab, setTab] = useState('pdf'); // 'pdf' | 'text'
  const [file, setFile] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Confirmation view state
  const [parsedData, setParsedData] = useState(null);
  const [applySpecs, setApplySpecs] = useState(true);
  const [applySales, setApplySales] = useState(true);
  const [applyValues, setApplyValues] = useState(true);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
        setError('Please select a valid PDF file.');
        return;
      }
      setFile(f);
      setError('');
    }
  };

  const handleParse = async () => {
    setError('');
    setLoading(true);

    try {
      let payload = {};

      if (tab === 'pdf') {
        if (!file) {
          setError('Please select a Property Appraiser record PDF file.');
          setLoading(false);
          return;
        }

        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result;
            const commaIdx = res.indexOf(',');
            resolve(commaIdx !== -1 ? res.slice(commaIdx + 1) : res);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        payload = { fileBase64: base64, filename: file.name };
      } else {
        if (!textInput.trim()) {
          setError('Please paste text from the Property Appraiser record.');
          setLoading(false);
          return;
        }
        payload = { text: textInput.trim() };
      }

      const res = await fetch('/api/county/parse-pa-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `Parsing failed (HTTP ${res.status}).`);
      }

      if (!json.parsed) {
        throw new Error('No structured details could be extracted from this record.');
      }

      setParsedData(json.parsed);
    } catch (err) {
      setError(err.message || 'Unable to parse Property Appraiser record.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmApply = () => {
    if (!parsedData) return;

    if (onApply) {
      onApply({
        parsedData,
        applySpecs,
        applySales,
        applyValues
      });
    }

    if (showToast) {
      showToast('Property Appraiser record updates confirmed & applied!');
    }

    onClose();
  };

  const bInfo = parsedData?.buildingInfo || {};
  const feats = parsedData?.features || {};
  const sales = parsedData?.salesHistory || [];
  const values = parsedData?.valueHistory || [];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(52, 41, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#FAF8F5',
          borderRadius: '20px',
          border: '1.5px solid #34292A',
          boxShadow: '0 16px 48px rgba(52, 41, 42, 0.22)',
          width: '100%',
          maxWidth: parsedData ? '780px' : '540px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'max-width 0.2s ease'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(52, 41, 42, 0.12)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#FFFFFF'
          }}
        >
          <div>
            <span
              style={{
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'rgba(52, 41, 42, 0.6)'
              }}
            >
              PROPERTY APPRAISER RECORD · PRIVACY-SAFE PARSER
            </span>
            <h3
              style={{
                margin: '2px 0 0 0',
                fontFamily: 'var(--font-heading, "Instrument Serif", Georgia, serif)',
                fontSize: '24px',
                fontWeight: 400,
                color: '#34292A'
              }}
            >
              {parsedData ? 'Review & Confirm Updates' : 'Upload Property Appraiser Record'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '22px',
              color: '#34292A',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px'
            }}
          >
            &times;
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              role="alert"
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '10px',
                backgroundColor: 'rgba(185, 28, 28, 0.08)',
                border: '1px solid rgba(185, 28, 28, 0.28)',
                color: '#7F1D1D',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              {error}
            </div>
          )}

          {!parsedData ? (
            /* Upload / Paste View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(52, 41, 42, 0.12)', paddingBottom: '10px' }}>
                <button
                  type="button"
                  onClick={() => setTab('pdf')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '999px',
                    border: tab === 'pdf' ? '1.5px solid #34292A' : '1px solid rgba(52, 41, 42, 0.2)',
                    backgroundColor: tab === 'pdf' ? '#34292A' : '#FFFFFF',
                    color: tab === 'pdf' ? '#FAF8F5' : '#34292A',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Upload PDF File
                </button>
                <button
                  type="button"
                  onClick={() => setTab('text')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '999px',
                    border: tab === 'text' ? '1.5px solid #34292A' : '1px solid rgba(52, 41, 42, 0.2)',
                    backgroundColor: tab === 'text' ? '#34292A' : '#FFFFFF',
                    color: tab === 'text' ? '#FAF8F5' : '#34292A',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Paste PA Text
                </button>
              </div>

              {tab === 'pdf' ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed rgba(52, 41, 42, 0.25)',
                    borderRadius: '14px',
                    padding: '36px 20px',
                    textAlign: 'center',
                    backgroundColor: '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#34292A' }}>
                    {file ? file.name : 'Click to select Property Appraiser record PDF'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.6)', marginTop: '4px' }}>
                    Supports Broward (BCPA), Palm Beach (PAPA), and Martin (MCPA) record printouts
                  </div>
                </div>
              ) : (
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(52, 41, 42, 0.65)',
                      marginBottom: '6px'
                    }}
                  >
                    Paste Text from County Property Appraiser Site
                  </label>
                  <textarea
                    rows={8}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Copy and paste text from BCPA, PAPA, or MCPA parcel page…"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '12px',
                      border: '1px solid rgba(52, 41, 42, 0.2)',
                      backgroundColor: '#FFFFFF',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}

              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(189, 211, 226, 0.25)',
                  border: '1px solid rgba(133, 157, 206, 0.45)',
                  fontSize: '11.5px',
                  color: '#34292A'
                }}
              >
                <strong>Privacy Guaranteed:</strong> Owner names and mailing addresses are automatically stripped before parsing. Only property specs, features, sales, and values are retained.
              </div>
            </div>
          ) : (
            /* Confirmation & Diff View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Provenance badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span
                  style={{
                    padding: '3px 9px',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(189, 211, 226, 0.5)',
                    border: '1px solid #859DCE',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    color: '#34292A'
                  }}
                >
                  {parsedData.source}
                </span>
                <span style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
                  Folio: <strong>{parsedData.folio || 'Detected'}</strong> · County: <strong>{parsedData.county}</strong>
                </span>
              </div>

              {/* Specs Diff Table */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid rgba(52, 41, 42, 0.12)',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#FAF8F5',
                    borderBottom: '1px solid rgba(52, 41, 42, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={applySpecs}
                      onChange={(e) => setApplySpecs(e.target.checked)}
                    />
                    <strong style={{ fontSize: '12px', color: '#34292A' }}>
                      Apply Building Specs &amp; Features
                    </strong>
                  </label>
                  <span style={{ fontSize: '10.5px', color: 'rgba(52, 41, 42, 0.55)' }}>
                    My manual edits will update with confirmed data
                  </span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.08)', textAlign: 'left', color: 'rgba(52, 41, 42, 0.6)' }}>
                      <th style={{ padding: '8px 14px' }}>Field</th>
                      <th style={{ padding: '8px 14px' }}>Current Property Value</th>
                      <th style={{ padding: '8px 14px', color: '#1F5C3D' }}>Parsed PA Record Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                      <td style={{ padding: '7px 14px', fontWeight: 600 }}>Living Area</td>
                      <td style={{ padding: '7px 14px' }}>{property?.sqft ? `${property.sqft.toLocaleString()} sf` : '—'}</td>
                      <td style={{ padding: '7px 14px', fontWeight: 700, color: '#1F5C3D' }}>{bInfo.livingSqft ? `${bInfo.livingSqft.toLocaleString()} sf` : '—'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                      <td style={{ padding: '7px 14px', fontWeight: 600 }}>Year Built</td>
                      <td style={{ padding: '7px 14px' }}>{property?.year_built || '—'}</td>
                      <td style={{ padding: '7px 14px', fontWeight: 700, color: '#1F5C3D' }}>
                        {bInfo.yearBuilt ? `${bInfo.yearBuilt}${bInfo.effectiveYearBuilt ? ` (Eff ${bInfo.effectiveYearBuilt})` : ''}` : '—'}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                      <td style={{ padding: '7px 14px', fontWeight: 600 }}>Beds / Baths</td>
                      <td style={{ padding: '7px 14px' }}>
                        {property?.beds != null ? `${property.beds} bd` : '—'} / {property?.full_baths != null ? `${property.full_baths} ba` : '—'}
                      </td>
                      <td style={{ padding: '7px 14px', fontWeight: 700, color: '#1F5C3D' }}>
                        {bInfo.beds != null ? `${bInfo.beds} bd` : '—'} / {bInfo.fullBaths != null ? `${bInfo.fullBaths}${bInfo.halfBaths ? `.${bInfo.halfBaths}` : ''} ba` : '—'}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                      <td style={{ padding: '7px 14px', fontWeight: 600 }}>Construction</td>
                      <td style={{ padding: '7px 14px' }}>{property?.construction || '—'}</td>
                      <td style={{ padding: '7px 14px', fontWeight: 700, color: '#1F5C3D' }}>{bInfo.construction || '—'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                      <td style={{ padding: '7px 14px', fontWeight: 600 }}>Roof</td>
                      <td style={{ padding: '7px 14px' }}>{property?.roof_type || '—'}</td>
                      <td style={{ padding: '7px 14px', fontWeight: 700, color: '#1F5C3D' }}>
                        {[bInfo.roofCover, bInfo.roofStructure].filter(Boolean).join(' / ') || '—'}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '7px 14px', fontWeight: 600 }}>Pool &amp; Dock</td>
                      <td style={{ padding: '7px 14px' }}>
                        {[property?.pool ? 'Pool' : null, property?.boat_dock ? 'Dock' : null].filter(Boolean).join(' · ') || 'None'}
                      </td>
                      <td style={{ padding: '7px 14px', fontWeight: 700, color: '#1F5C3D' }}>
                        {[
                          feats.hasPool ? `Pool (${feats.poolYear || 'Yes'})` : null,
                          feats.hasDock ? `Dock (${feats.dockSqft ? `${feats.dockSqft} sf` : 'Yes'})` : null,
                          feats.hasBoatLift ? 'Boat lift' : null
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'None'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Value History Table */}
              {values.length > 0 && (
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid rgba(52, 41, 42, 0.12)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: '#FAF8F5',
                      borderBottom: '1px solid rgba(52, 41, 42, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={applyValues}
                        onChange={(e) => setApplyValues(e.target.checked)}
                      />
                      <strong style={{ fontSize: '12px', color: '#34292A' }}>
                        Save Value History ({values.length} years)
                      </strong>
                    </label>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.08)', color: 'rgba(52, 41, 42, 0.6)' }}>
                        <th style={{ padding: '6px 14px', textAlign: 'left' }}>Year</th>
                        <th style={{ padding: '6px 14px', textAlign: 'right' }}>Land Value</th>
                        <th style={{ padding: '6px 14px', textAlign: 'right' }}>Improvement Value</th>
                        <th style={{ padding: '6px 14px', textAlign: 'right' }}>Just / Market Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {values.slice(0, 6).map((v) => (
                        <tr key={v.rollYear} style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                          <td style={{ padding: '6px 14px', fontWeight: 700 }}>{v.rollYear}</td>
                          <td style={{ padding: '6px 14px', textAlign: 'right' }}>{fmtDollar(v.landValue)}</td>
                          <td style={{ padding: '6px 14px', textAlign: 'right' }}>{fmtDollar(v.improvementValue)}</td>
                          <td style={{ padding: '6px 14px', textAlign: 'right', fontWeight: 700 }}>{fmtDollar(v.justValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sales History Table */}
              {sales.length > 0 && (
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid rgba(52, 41, 42, 0.12)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: '#FAF8F5',
                      borderBottom: '1px solid rgba(52, 41, 42, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={applySales}
                        onChange={(e) => setApplySales(e.target.checked)}
                      />
                      <strong style={{ fontSize: '12px', color: '#34292A' }}>
                        Merge Sales History ({sales.length} deeds)
                      </strong>
                    </label>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.08)', color: 'rgba(52, 41, 42, 0.6)' }}>
                        <th style={{ padding: '6px 14px', textAlign: 'left' }}>Date</th>
                        <th style={{ padding: '6px 14px', textAlign: 'right' }}>Price</th>
                        <th style={{ padding: '6px 14px' }}>Deed</th>
                        <th style={{ padding: '6px 14px' }}>Book / Page</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map((s, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(52, 41, 42, 0.06)' }}>
                          <td style={{ padding: '6px 14px', fontWeight: 600 }}>{s.saleDate}</td>
                          <td style={{ padding: '6px 14px', textAlign: 'right', fontWeight: 700 }}>{fmtDollar(s.salePrice)}</td>
                          <td style={{ padding: '6px 14px', textAlign: 'center' }}>{s.deedType}</td>
                          <td style={{ padding: '6px 14px', textAlign: 'center', color: 'rgba(52, 41, 42, 0.6)' }}>
                            {s.orBook ? `${s.orBook}/${s.orPage || '—'}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid rgba(52, 41, 42, 0.12)',
            backgroundColor: '#FFFFFF',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          {parsedData ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setParsedData(null)}>
                &larr; Back to Upload
              </Button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleConfirmApply}>
                  Confirm &amp; Apply Updates
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleParse} disabled={loading}>
                {loading ? 'Parsing record…' : 'Parse Record'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

