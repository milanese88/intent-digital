import React, { useState } from 'react';
import { Button, Eyebrow } from '../ui';
import { parseListingDetailsText } from '../../utils/listingDetailsParser.js';

export default function PasteListingModal({
  isOpen,
  onClose,
  onApply,
  propertyName = 'Property'
}) {
  const [rawText, setRawText] = useState('');
  const [selectedIds, setSelectedIds] = useState({});
  const [parsedResult, setParsedResult] = useState(null);

  if (!isOpen) return null;

  const handleTextChange = (e) => {
    const val = e.target.value;
    setRawText(val);
    if (val.trim()) {
      const result = parseListingDetailsText(val);
      setParsedResult(result);
      // Select all found items by default
      const initialSel = {};
      result.items.forEach((item) => {
        initialSel[item.id] = true;
      });
      setSelectedIds(initialSel);
    } else {
      setParsedResult(null);
      setSelectedIds({});
    }
  };

  const handleToggleItem = (id) => {
    setSelectedIds((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleApply = () => {
    if (!parsedResult || !onApply) return;
    const patch = {};
    parsedResult.items.forEach((item) => {
      if (selectedIds[item.id]) {
        Object.assign(patch, item.patch, item.salePatch || {});
      }
    });

    // Tag applied fields as listing edits so they are properly attributed with date
    const fieldSources = {};
    const now = new Date().toISOString().split('T')[0];
    Object.keys(patch).forEach((k) => {
      fieldSources[k] = {
        source: 'listing',
        label: 'Pasted listing details',
        date: now
      };
    });
    patch.field_sources = fieldSources;

    onApply(patch);
    onClose();
  };

  const items = parsedResult?.items || [];
  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(52, 41, 42, 0.45)',
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
          borderRadius: '16px',
          border: '1px solid rgba(52, 41, 42, 0.15)',
          boxShadow: '0 16px 40px rgba(52, 41, 42, 0.2)',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Montserrat, sans-serif',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(52, 41, 42, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#859DCE' }}>
              Paste Listing Text · MLS / Zillow / Redfin
            </span>
            <h3 style={{ fontFamily: 'Playfair Display, Cormorant Garamond, serif', fontSize: '20px', fontWeight: 600, color: '#34292A', margin: '4px 0 0 0' }}>
              Auto-fill specs for {propertyName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'rgba(52, 41, 42, 0.6)',
              padding: '4px 8px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#34292A', marginBottom: '6px' }}>
              Paste listing blurb, MLS sheet, or property overview:
            </label>
            <textarea
              rows={4}
              value={rawText}
              onChange={handleTextChange}
              placeholder="Paste text here, e.g. Beautiful 4 bed, 3 bath pool home in Palm Beach Shores. 2,607 sqft under air, built in 2024. Asking $2,250,000. Features CBS construction, tile roof, private boat dock..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(52, 41, 42, 0.2)',
                backgroundColor: '#FFFFFF',
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '13px',
                color: '#34292A',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Extracted Candidates Preview */}
          {items.length > 0 ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#34292A' }}>
                  Extracted {items.length} fields ({selectedCount} selected to apply):
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const all = {};
                      items.forEach((i) => { all[i.id] = true; });
                      setSelectedIds(all);
                    }}
                    style={{ background: 'none', border: 'none', fontSize: '11px', color: '#859DCE', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds({})}
                    style={{ background: 'none', border: 'none', fontSize: '11px', color: 'rgba(52, 41, 42, 0.6)', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Clear all
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                {items.map((item) => (
                  <label
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: selectedIds[item.id] ? 'rgba(189, 211, 226, 0.2)' : 'rgba(255, 255, 255, 0.6)',
                      border: selectedIds[item.id] ? '1px solid #859DCE' : '1px solid rgba(52, 41, 42, 0.1)',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(selectedIds[item.id])}
                      onChange={() => handleToggleItem(item.id)}
                      style={{ marginTop: '3px' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#34292A' }}>{item.label}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#859DCE' }}>{item.displayValue}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.6)', marginTop: '2px', fontStyle: 'italic' }}>
                        "{item.snippet}"
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ) : rawText.trim() ? (
            <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'rgba(52, 41, 42, 0.04)', fontSize: '12px', color: '#34292A', textAlign: 'center' }}>
              No recognized property fields found. Try pasting a full listing summary with beds, baths, price, or sqft.
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid rgba(52, 41, 42, 0.1)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            backgroundColor: '#FAF8F5'
          }}
        >
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleApply}
            disabled={selectedCount === 0}
          >
            Apply {selectedCount > 0 ? `${selectedCount} fields` : ''} to property
          </Button>
        </div>
      </div>
    </div>
  );
}

