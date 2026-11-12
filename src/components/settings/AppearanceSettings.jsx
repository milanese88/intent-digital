import React, { useState, useEffect, useRef } from 'react';
import { usePortalTheme } from '../../context/PortalThemeContext.jsx';
import {
  DEFAULT_THEME_COLORS,
  DEFAULT_THEME_FONTS,
  getFontGroupsForSlot,
  getHeadingFontDef,
  getBodyFontDef,
  getLabelFontDef,
  getAccentFontDef,
  loadThemeFont,
  loadDropdownPreviewFonts
} from '../../utils/themeFonts.js';
import {
  isValidHex,
  normalizeHex,
  getContrastEvaluation
} from '../../utils/themeContrast.js';

function FontDropdown({
  id,
  label,
  slot,
  value,
  selectedDef,
  sampleText,
  sampleFontSize = '15px',
  uppercaseSample = false,
  allowEmpty = false,
  emptyLabel = 'None (Portal default)',
  onChange
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const { myFonts, googleFonts } = getFontGroupsForSlot(slot);

  useEffect(() => {
    if (!open) return;
    loadDropdownPreviewFonts([...myFonts, ...googleFonts]);

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, myFonts, googleFonts]);

  const handleSelect = (nextId) => {
    setOpen(false);
    if (nextId) {
      loadThemeFont(nextId, { forceRetry: true });
    }
    onChange(nextId);
  };

  const isEmptySelected = allowEmpty && (!value || !selectedDef);

  const renderOptionRow = (f) => {
    const isSelected = Boolean(selectedDef && selectedDef.id === f.id && !isEmptySelected);
    return (
      <button
        key={f.id}
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={() => handleSelect(f.id)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '10px 14px',
          border: 'none',
          backgroundColor: isSelected ? 'rgba(58, 20, 24, 0.08)' : 'transparent',
          color: '#34292A',
          cursor: 'pointer',
          textAlign: 'left',
          borderRadius: '6px',
          transition: 'background-color 0.12s ease'
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(52, 41, 42, 0.05)';
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <span
          style={{
            fontFamily: f.cssFamily,
            fontSize: sampleFontSize,
            letterSpacing: uppercaseSample ? '0.1em' : 'normal',
            textTransform: uppercaseSample ? 'uppercase' : 'none',
            lineHeight: 1.35,
            fontWeight: isSelected ? 600 : 400
          }}
        >
          {f.label} &mdash; {sampleText}
        </span>
        <span
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontSize: '10px',
            color: 'rgba(52, 41, 42, 0.5)',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          {f.category}{f.italic ? ' · ital' : ''}
        </span>
      </button>
    );
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <label
        htmlFor={id}
        style={{
          display: 'block',
          fontFamily: 'Montserrat, sans-serif',
          fontSize: '12px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: '#34292A',
          marginBottom: '8px'
        }}
      >
        {label}
      </label>

      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 14px',
          borderRadius: '8px',
          border: open ? '1px solid #3A1418' : '1px solid rgba(52, 41, 42, 0.2)',
          backgroundColor: '#FAF8F5',
          color: '#34292A',
          fontSize: sampleFontSize,
          fontFamily: isEmptySelected ? 'Montserrat, sans-serif' : selectedDef?.cssFamily,
          outline: 'none',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: !isEmptySelected && uppercaseSample ? '0.08em' : 'normal'
          }}
        >
          {isEmptySelected ? emptyLabel : `${selectedDef.label} — ${sampleText}`}
        </span>
        <span
          aria-hidden="true"
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontSize: '11px',
            color: 'rgba(52, 41, 42, 0.55)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
            flexShrink: 0
          }}
        >
          &#9662;
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: '320px',
            overflowY: 'auto',
            backgroundColor: '#FFFFFF',
            border: '1px solid rgba(52, 41, 42, 0.18)',
            borderRadius: '10px',
            padding: '6px',
            boxShadow: '0 12px 32px rgba(30, 21, 9, 0.14)'
          }}
        >
          {allowEmpty && (
            <button
              type="button"
              role="option"
              aria-selected={isEmptySelected}
              onClick={() => handleSelect('')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 14px',
                border: 'none',
                backgroundColor: isEmptySelected ? 'rgba(58, 20, 24, 0.08)' : 'transparent',
                color: 'rgba(52, 41, 42, 0.75)',
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left',
                borderRadius: '6px',
                marginBottom: '4px'
              }}
            >
              <span>{emptyLabel}</span>
            </button>
          )}

          {myFonts.length > 0 && (
            <div role="group" aria-label="My fonts">
              <div
                style={{
                  padding: '6px 12px 4px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: '#3A1418'
                }}
              >
                My fonts
              </div>
              {myFonts.map(renderOptionRow)}
            </div>
          )}

          {googleFonts.length > 0 && (
            <div
              role="group"
              aria-label="Google Fonts"
              style={{
                marginTop: myFonts.length > 0 ? '6px' : 0,
                paddingTop: myFonts.length > 0 ? '6px' : 0,
                borderTop: myFonts.length > 0 ? '1px solid rgba(52, 41, 42, 0.08)' : 'none'
              }}
            >
              <div
                style={{
                  padding: '6px 12px 4px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(52, 41, 42, 0.5)'
                }}
              >
                Google Fonts
              </div>
              {googleFonts.map(renderOptionRow)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 14 Color Role Definitions
const COLOR_ROLES = [
  { key: 'background', label: 'Background', defaultHex: '#FAF8F4', desc: 'Main canvas and layout background' },
  { key: 'surface', label: 'Surface / Alt Background', defaultHex: '#F2EEE8', desc: 'Secondary panels, segmented controls, and tiles' },
  { key: 'cards', label: 'Cards', defaultHex: '#FFFFFF', desc: 'Card containers, table surfaces, and modals' },
  { key: 'borders', label: 'Borders', defaultHex: '#E4DDD3', desc: 'Card borders, dividers, and input boundaries' },
  { key: 'sidebarBg', label: 'Sidebar Background', defaultHex: '#FAF8F4', desc: 'Desktop navigation sidebar surface' },
  { key: 'sidebarText', label: 'Sidebar Text', defaultHex: '#1B130D', desc: 'Sidebar links and navigation text' },
  { key: 'headingText', label: 'Heading Text', defaultHex: '#1B130D', desc: 'Editorial titles, section headings, and display serif' },
  { key: 'bodyText', label: 'Body Text', defaultHex: '#4A413A', desc: 'Main paragraphs, table text, and form descriptions' },
  { key: 'mutedText', label: 'Muted Text', defaultHex: '#8A7E72', desc: 'Timestamps, secondary metadata, and placeholder text' },
  { key: 'primaryButton', label: 'Primary Button', defaultHex: '#3A1418', desc: 'Pill action buttons and prominent submit controls' },
  { key: 'buttonText', label: 'Button Text', defaultHex: '#FFFFFF', desc: 'Label text inside primary action buttons' },
  { key: 'accent', label: 'Accent / Active Tab', defaultHex: '#859DCE', desc: 'Active navigation indicators, badges, and focus rings' },
  { key: 'error', label: 'Error', defaultHex: '#C24132', desc: 'Validation errors, alert notices, and destructive states' },
  { key: 'success', label: 'Success', defaultHex: '#2E6B48', desc: 'Confirmation badges and positive status indicators' }
];

// Text/Background pairs for WCAG AA contrast check
const CONTRAST_PAIRS = {
  headingText: { bgKey: 'background', altBgKey: 'cards', label: 'Heading on canvas' },
  bodyText: { bgKey: 'background', altBgKey: 'cards', label: 'Body on canvas' },
  mutedText: { bgKey: 'background', altBgKey: 'cards', label: 'Muted on canvas' },
  sidebarText: { bgKey: 'sidebarBg', label: 'Text on sidebar' },
  buttonText: { bgKey: 'primaryButton', label: 'Text on button' },
  accent: { bgKey: 'background', label: 'Accent on canvas' }
};

export default function AppearanceSettings() {
  const {
    workingTheme,
    setWorkingTheme,
    saveTheme,
    discardChanges,
    resetToBrandDefault,
    hasUnsavedChanges,
    fontLoadErrors = {}
  } = usePortalTheme();

  const headingFontDef = getHeadingFontDef(workingTheme?.fonts?.headingFont);
  const bodyFontDef = getBodyFontDef(workingTheme?.fonts?.bodyFont);
  const labelFontDef = getLabelFontDef(workingTheme?.fonts?.labelFont);
  const accentFontDef = getAccentFontDef(workingTheme?.fonts?.accentFont);

  const selectedFontIds = Array.from(
    new Set(
      [
        headingFontDef?.id,
        bodyFontDef?.id,
        labelFontDef?.id,
        accentFontDef?.id
      ].filter(Boolean)
    )
  );
  const activeFontErrors = selectedFontIds
    .map((id) => fontLoadErrors[id])
    .filter(Boolean);

  // Local state for hex text inputs to allow typing before normalization
  const [hexInputs, setHexInputs] = useState(() => ({ ...(workingTheme?.colors || DEFAULT_THEME_COLORS) }));
  const [hexErrors, setHexErrors] = useState({});

  // Presets state
  const [presets, setPresets] = useState([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetSaving, setPresetSaving] = useState(false);

  // Action status
  const [saveStatus, setSaveStatus] = useState({ loading: false, success: '', error: '' });
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Sync local hexInputs when workingTheme changes externally
  useEffect(() => {
    if (workingTheme?.colors) {
      setHexInputs(prev => ({ ...workingTheme.colors, ...prev }));
    }
  }, [workingTheme?.colors]);

  // Fetch saved presets
  const fetchPresets = async () => {
    try {
      setLoadingPresets(true);
      const res = await fetch('/api/settings/theme-presets');
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || []);
      }
    } catch (err) {
      console.warn('Failed to load presets:', err);
    } finally {
      setLoadingPresets(false);
    }
  };

  useEffect(() => {
    fetchPresets();
  }, []);

  // Warn on browser unload if unsaved changes exist
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Color change handlers
  const handleHexChange = (key, rawValue) => {
    setHexInputs(prev => ({ ...prev, [key]: rawValue }));

    if (isValidHex(rawValue)) {
      setHexErrors(prev => ({ ...prev, [key]: null }));
      const normalized = normalizeHex(rawValue);
      setWorkingTheme(prev => ({
        ...prev,
        colors: {
          ...prev.colors,
          [key]: normalized
        }
      }));
    } else {
      setHexErrors(prev => ({ ...prev, [key]: 'Invalid hex (#RGB or #RRGGBB)' }));
    }
  };

  const handleHexBlur = (key) => {
    const currentVal = hexInputs[key];
    if (isValidHex(currentVal)) {
      const normalized = normalizeHex(currentVal);
      setHexInputs(prev => ({ ...prev, [key]: normalized }));
      setHexErrors(prev => ({ ...prev, [key]: null }));
    } else {
      // Revert to workingTheme value on invalid blur
      const fallback = workingTheme.colors[key] || DEFAULT_THEME_COLORS[key];
      setHexInputs(prev => ({ ...prev, [key]: fallback }));
      setHexErrors(prev => ({ ...prev, [key]: null }));
    }
  };

  const handleNativeColorPicker = (key, hexValue) => {
    const upper = hexValue.toUpperCase();
    setHexInputs(prev => ({ ...prev, [key]: upper }));
    setHexErrors(prev => ({ ...prev, [key]: null }));
    setWorkingTheme(prev => ({
      ...prev,
      colors: {
        ...prev.colors,
        [key]: upper
      }
    }));
  };

  // Font change handlers
  const handleFontChange = (field, value) => {
    setWorkingTheme(prev => ({
      ...prev,
      fonts: {
        ...prev.fonts,
        [field]: value
      }
    }));
  };

  // Toggle "apply to login"
  const handleLoginToggle = (e) => {
    setWorkingTheme(prev => ({
      ...prev,
      apply_to_login: e.target.checked
    }));
  };

  // Save current appearance
  const handleSave = async () => {
    setSaveStatus({ loading: true, success: '', error: '' });
    const result = await saveTheme();
    if (result.success) {
      setSaveStatus({ loading: false, success: 'Appearance saved successfully.', error: '' });
      setTimeout(() => setSaveStatus(prev => ({ ...prev, success: '' })), 4000);
    } else {
      setSaveStatus({ loading: false, success: '', error: result.error || 'Failed to save appearance.' });
    }
  };

  // Reset to brand default
  const handleResetConfirm = () => {
    resetToBrandDefault();
    setHexInputs({ ...DEFAULT_THEME_COLORS });
    setHexErrors({});
    setShowResetConfirm(false);
    setSaveStatus({ loading: false, success: 'Reset to brand defaults (unsaved). Click "Save appearance →" to persist.', error: '' });
    setTimeout(() => setSaveStatus(prev => ({ ...prev, success: '' })), 5000);
  };

  // Preset operations
  const handleSavePreset = async (e) => {
    e.preventDefault();
    const name = newPresetName.trim();
    if (!name) return;

    setPresetSaving(true);
    try {
      const res = await fetch('/api/settings/theme-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          colors: workingTheme.colors,
          fonts: workingTheme.fonts
        })
      });
      const data = await res.json();
      if (res.ok) {
        setPresets(prev => [data.preset, ...prev]);
        setNewPresetName('');
        setShowPresetModal(false);
      } else {
        alert(data.error || 'Failed to save preset');
      }
    } catch (err) {
      alert('Network error saving preset');
    } finally {
      setPresetSaving(false);
    }
  };

  const handleLoadPreset = (preset) => {
    const loadedColors = { ...DEFAULT_THEME_COLORS, ...(preset.colors || {}) };
    const loadedFonts = { ...DEFAULT_THEME_FONTS, ...(preset.fonts || {}) };

    setWorkingTheme(prev => ({
      ...prev,
      colors: loadedColors,
      fonts: loadedFonts
    }));
    setHexInputs(loadedColors);
    setHexErrors({});
  };

  const handleDeletePreset = async (e, presetId) => {
    e.stopPropagation();
    if (!window.confirm('Delete this preset?')) return;

    try {
      const res = await fetch(`/api/settings/theme-presets?id=${presetId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setPresets(prev => prev.filter(p => p.id !== presetId));
      }
    } catch (err) {
      console.warn('Failed to delete preset:', err);
    }
  };

  // Preset chips list: includes brand default chip + saved presets
  const brandDefaultPreset = {
    id: '__default_brand__',
    name: 'Brand Default',
    colors: DEFAULT_THEME_COLORS,
    fonts: DEFAULT_THEME_FONTS
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Unsaved changes banner */}
      {hasUnsavedChanges && (
        <div style={{
          backgroundColor: '#F7EEDC',
          border: '1px solid #7A5212',
          borderRadius: '8px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#7A5212',
          fontFamily: 'Montserrat, sans-serif',
          fontSize: '13px'
        }}>
          <div>
            <strong>Unsaved Changes:</strong> You are currently previewing custom appearance edits. Persist them with &ldquo;Save appearance &rarr;&rdquo;.
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={discardChanges}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#7A5212',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              Discard edits
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="btn-cherry"
              style={{ padding: '6px 14px', fontSize: '11px' }}
              disabled={saveStatus.loading}
            >
              {saveStatus.loading ? 'Saving…' : 'Save appearance \u2192'}
            </button>
          </div>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 1fr)',
        gap: '32px',
        alignItems: 'start'
      }}>
        {/* LEFT COLUMN: Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* SECTION 1: COLOR ROLES */}
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgba(52, 41, 42, 0.1)',
            borderRadius: '8px',
            padding: '32px'
          }}>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{
                fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                fontSize: '28px',
                color: '#34292A',
                margin: '0 0 8px 0'
              }}>
                Colors
              </h2>
              <p style={{
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '13px',
                color: 'rgba(52, 41, 42, 0.7)',
                lineHeight: 1.5,
                margin: 0
              }}>
                Customize your portal palette. Each role adjusts tokens across layouts, cards, typography, and controls.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {COLOR_ROLES.map((role) => {
                const currentHex = hexInputs[role.key] || workingTheme.colors[role.key] || role.defaultHex;
                const normalizedHex = normalizeHex(currentHex) || role.defaultHex;
                const hasError = hexErrors[role.key];

                // Contrast Evaluation
                const contrastSpec = CONTRAST_PAIRS[role.key];
                let contrastEval = null;
                if (contrastSpec) {
                  const bgVal = workingTheme.colors[contrastSpec.bgKey] || DEFAULT_THEME_COLORS[contrastSpec.bgKey];
                  contrastEval = getContrastEvaluation(normalizedHex, bgVal, role.key === 'headingText');
                }

                return (
                  <div
                    key={role.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      backgroundColor: '#FAF8F5',
                      border: '1px solid rgba(52, 41, 42, 0.08)',
                      gap: '16px',
                      flexWrap: 'wrap'
                    }}
                  >
                    {/* Role Info */}
                    <div style={{ minWidth: '180px', flex: '1 1 200px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontFamily: 'Montserrat, sans-serif',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#34292A'
                        }}>
                          {role.label}
                        </span>
                        {/* Contrast Badge */}
                        {contrastEval && contrastEval.ratio !== null && (
                          <span
                            title={`WCAG AA evaluation for ${contrastSpec.label}: ${contrastEval.formattedRatio}`}
                            style={{
                              fontSize: '11px',
                              fontFamily: 'Montserrat, sans-serif',
                              fontWeight: 600,
                              letterSpacing: '0.04em',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              backgroundColor: contrastEval.readable ? '#EEF2EA' : '#F7EEDC',
                              color: contrastEval.readable ? '#3F5A3A' : '#7A5212',
                              border: `1px solid ${contrastEval.readable ? 'rgba(63, 90, 58, 0.3)' : 'rgba(122, 82, 18, 0.3)'}`
                            }}
                          >
                            {contrastEval.label}
                          </span>
                        )}
                      </div>
                      <p style={{
                        fontFamily: 'Montserrat, sans-serif',
                        fontSize: '11px',
                        color: 'rgba(52, 41, 42, 0.6)',
                        margin: '4px 0 0 0'
                      }}>
                        {role.desc}
                      </p>
                    </div>

                    {/* Controls: Swatch + Native Picker + Hex Input */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {/* Swatch & Color Picker Container */}
                      <label
                        style={{
                          position: 'relative',
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          backgroundColor: normalizedHex,
                          border: '1px solid rgba(52, 41, 42, 0.2)',
                          cursor: 'pointer',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden'
                        }}
                        title={`Click to pick ${role.label} color`}
                      >
                        <input
                          type="color"
                          value={normalizedHex}
                          onChange={(e) => handleNativeColorPicker(role.key, e.target.value)}
                          style={{
                            position: 'absolute',
                            opacity: 0,
                            width: '100%',
                            height: '100%',
                            cursor: 'pointer'
                          }}
                        />
                      </label>

                      {/* Hex Text Input */}
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <input
                          type="text"
                          value={currentHex}
                          onChange={(e) => handleHexChange(role.key, e.target.value)}
                          onBlur={() => handleHexBlur(role.key)}
                          maxLength={7}
                          placeholder="#RRGGBB"
                          style={{
                            width: '94px',
                            padding: '8px 10px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            color: '#34292A',
                            backgroundColor: '#ffffff',
                            border: hasError ? '1px solid #C24132' : '1px solid rgba(52, 41, 42, 0.2)',
                            borderRadius: '6px',
                            outline: 'none',
                            textAlign: 'center'
                          }}
                        />
                        {hasError && (
                          <span style={{ fontSize: '10px', color: '#C24132', marginTop: '2px' }}>
                            {hasError}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: TYPOGRAPHY */}
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgba(52, 41, 42, 0.1)',
            borderRadius: '8px',
            padding: '32px'
          }}>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{
                fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                fontSize: '28px',
                color: '#34292A',
                margin: '0 0 8px 0'
              }}>
                Typography
              </h2>
              <p style={{
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '13px',
                color: 'rgba(52, 41, 42, 0.7)',
                lineHeight: 1.5,
                margin: 0
              }}>
                Choose from your self-hosted brand fonts or allowlisted Google Fonts. Custom fonts load on demand only when selected.
              </p>
            </div>

            {activeFontErrors.length > 0 && (
              <div
                role="status"
                style={{
                  marginBottom: '20px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#F7EEDC',
                  border: '1px solid rgba(122, 82, 18, 0.35)',
                  color: '#7A5212',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '12px',
                  lineHeight: 1.5
                }}
              >
                {activeFontErrors.map((err) => (
                  <div
                    key={err.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <span>
                      <strong>{err.label}</strong> failed to load &mdash; using fallback stack (<code>{err.fallback}</code>).
                    </span>
                    <button
                      type="button"
                      onClick={() => loadThemeFont(err.id, { forceRetry: true })}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#7A5212',
                        textDecoration: 'underline',
                        fontFamily: 'Montserrat, sans-serif',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      Retry
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gap: '20px' }}>
              {/* Headings Font */}
              <FontDropdown
                id="typography-headings-font"
                label="Headings & Display"
                slot="headings"
                value={workingTheme.fonts.headingFont}
                selectedDef={headingFontDef}
                sampleText='Ag "Intent Digital"'
                sampleFontSize="16px"
                onChange={(val) => handleFontChange('headingFont', val)}
              />

              {/* Body Font */}
              <FontDropdown
                id="typography-body-font"
                label="Body Paragraphs"
                slot="body"
                value={workingTheme.fonts.bodyFont}
                selectedDef={bodyFontDef}
                sampleText="Sample body typography"
                sampleFontSize="14px"
                onChange={(val) => handleFontChange('bodyFont', val)}
              />

              {/* Labels Font */}
              <FontDropdown
                id="typography-labels-font"
                label="Labels & Navigation (Uppercase)"
                slot="labels"
                value={workingTheme.fonts.labelFont}
                selectedDef={labelFontDef}
                sampleText="LABEL PREVIEW"
                sampleFontSize="13px"
                uppercaseSample={true}
                onChange={(val) => handleFontChange('labelFont', val)}
              />

              {/* Optional Accent / Script Slot */}
              <FontDropdown
                id="typography-accent-font"
                label="Accent / Script (Optional — Small Stamps)"
                slot="accent"
                value={workingTheme.fonts.accentFont || ''}
                selectedDef={accentFontDef}
                sampleText="Curated"
                sampleFontSize="17px"
                allowEmpty={true}
                emptyLabel="None (Portal default)"
                onChange={(val) => handleFontChange('accentFont', val)}
              />

              {/* Base Text Size Scale */}
              <div>
                <label style={{
                  display: 'block',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '12px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: '#34292A',
                  marginBottom: '8px'
                }}>
                  Base Text Size
                </label>
                <div style={{
                  display: 'inline-flex',
                  backgroundColor: '#FAF8F5',
                  padding: '4px',
                  borderRadius: '999px',
                  border: '1px solid rgba(52, 41, 42, 0.15)'
                }}>
                  {['small', 'default', 'large'].map((sizeOption) => {
                    const isSelected = (workingTheme.fonts.baseTextSize || 'default') === sizeOption;
                    return (
                      <button
                        key={sizeOption}
                        type="button"
                        onClick={() => handleFontChange('baseTextSize', sizeOption)}
                        style={{
                          padding: '6px 18px',
                          borderRadius: '999px',
                          border: 'none',
                          backgroundColor: isSelected ? '#3A1418' : 'transparent',
                          color: isSelected ? '#FFFFFF' : '#34292A',
                          fontFamily: 'Montserrat, sans-serif',
                          fontSize: '12px',
                          fontWeight: 600,
                          textTransform: 'capitalize',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {sizeOption}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Italic Second Line Toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(52, 41, 42, 0.08)'
              }}>
                <input
                  type="checkbox"
                  id="italicSecondLine"
                  checked={workingTheme.fonts.italicSecondLine !== false}
                  onChange={(e) => handleFontChange('italicSecondLine', e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#3A1418', cursor: 'pointer' }}
                />
                <label
                  htmlFor="italicSecondLine"
                  style={{
                    fontFamily: 'Montserrat, sans-serif',
                    fontSize: '13px',
                    color: '#34292A',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  Italicize second line of editorial headings (&ldquo;Editorial Direction &amp; <em>Studio Identity</em>&rdquo;)
                </label>
              </div>
            </div>
          </div>

          {/* SECTION 3: SIGN-IN SCREEN SYNC */}
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgba(52, 41, 42, 0.1)',
            borderRadius: '8px',
            padding: '24px 32px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <h3 style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#34292A',
                  margin: '0 0 4px 0'
                }}>
                  Also apply to the sign-in screen
                </h3>
                <p style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '12px',
                  color: 'rgba(52, 41, 42, 0.7)',
                  margin: 0,
                  lineHeight: 1.4
                }}>
                  When enabled, your custom appearance will style the login screen via a secure, read-only endpoint.
                </p>
              </div>
              <input
                type="checkbox"
                id="applyToLogin"
                checked={Boolean(workingTheme.apply_to_login)}
                onChange={handleLoginToggle}
                style={{ width: '22px', height: '22px', accentColor: '#3A1418', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* SECTION 4: SAVED PRESETS */}
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgba(52, 41, 42, 0.1)',
            borderRadius: '8px',
            padding: '32px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#34292A',
                  margin: '0 0 4px 0'
                }}>
                  Theme Presets
                </h3>
                <p style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '12px',
                  color: 'rgba(52, 41, 42, 0.7)',
                  margin: 0
                }}>
                  Click a preset chip to preview its palette and typography.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPresetModal(true)}
                className="btn-cherry-outline"
                style={{ fontSize: '11px', padding: '6px 14px' }}
              >
                Save as preset
              </button>
            </div>

            {/* Presets Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {/* Default Brand Chip */}
              <button
                type="button"
                onClick={() => handleLoadPreset(brandDefaultPreset)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  borderRadius: '999px',
                  backgroundColor: '#FAF8F5',
                  border: '1px solid rgba(52, 41, 42, 0.2)',
                  cursor: 'pointer',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '12px',
                  color: '#34292A',
                  fontWeight: 500
                }}
              >
                <span style={{ display: 'flex', gap: '2px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: DEFAULT_THEME_COLORS.background, border: '1px solid rgba(0,0,0,0.1)' }} />
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: DEFAULT_THEME_COLORS.primaryButton }} />
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: DEFAULT_THEME_COLORS.accent }} />
                </span>
                Brand Default
              </button>

              {/* Custom Presets */}
              {presets.map(p => {
                const colors = p.colors || {};
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleLoadPreset(p)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      borderRadius: '999px',
                      backgroundColor: '#FAF8F5',
                      border: '1px solid rgba(52, 41, 42, 0.2)',
                      cursor: 'pointer',
                      fontFamily: 'Montserrat, sans-serif',
                      fontSize: '12px',
                      color: '#34292A',
                      fontWeight: 500
                    }}
                  >
                    <span style={{ display: 'flex', gap: '2px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: colors.background || '#FAF8F4', border: '1px solid rgba(0,0,0,0.1)' }} />
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: colors.primaryButton || '#3A1418' }} />
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: colors.accent || '#859DCE' }} />
                    </span>
                    {p.name}
                    <span
                      onClick={(e) => handleDeletePreset(e, p.id)}
                      title="Delete preset"
                      style={{
                        marginLeft: '4px',
                        color: 'rgba(52, 41, 42, 0.4)',
                        fontSize: '14px',
                        lineHeight: 1,
                        cursor: 'pointer'
                      }}
                    >
                      &times;
                    </span>
                  </button>
                );
              })}

              {presets.length === 0 && !loadingPresets && (
                <span style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.5)', fontFamily: 'Montserrat, sans-serif', alignSelf: 'center' }}>
                  No custom presets yet.
                </span>
              )}
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            paddingTop: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                onClick={handleSave}
                className="btn-cherry"
                disabled={saveStatus.loading}
                style={{ padding: '12px 28px', fontSize: '13px' }}
              >
                {saveStatus.loading ? 'Saving appearance…' : 'Save appearance \u2192'}
              </button>

              <button
                type="button"
                onClick={() => setShowPresetModal(true)}
                className="btn-cherry-outline"
                style={{ padding: '12px 22px', fontSize: '13px' }}
              >
                Save as preset
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              style={{
                background: 'none',
                border: 'none',
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '12px',
                color: 'rgba(52, 41, 42, 0.6)',
                textDecoration: 'underline',
                cursor: 'pointer'
              }}
            >
              Reset to brand default
            </button>
          </div>

          {/* Status feedback */}
          {saveStatus.success && (
            <div style={{
              backgroundColor: '#EEF2EA',
              color: '#3F5A3A',
              padding: '12px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 500
            }}>
              {saveStatus.success}
            </div>
          )}
          {saveStatus.error && (
            <div style={{
              backgroundColor: '#F5E6E3',
              color: '#8A2A1E',
              padding: '12px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 500
            }}>
              {saveStatus.error}
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: STICKY LIVE MINI PREVIEW */}
        <div style={{
          position: 'sticky',
          top: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {/* Preview Box Card */}
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgba(52, 41, 42, 0.1)',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)'
          }}>
            {/* Top Preview Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid rgba(52, 41, 42, 0.08)'
            }}>
              <span style={{
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#34292A'
              }}>
                Live Mini Preview
              </span>
              <span style={{
                fontSize: '10px',
                fontFamily: 'Montserrat, sans-serif',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '999px',
                backgroundColor: hasUnsavedChanges ? '#F7EEDC' : '#EEF2EA',
                color: hasUnsavedChanges ? '#7A5212' : '#3F5A3A'
              }}>
                {hasUnsavedChanges ? 'Unsaved edits' : 'Synchronized'}
              </span>
            </div>

            {/* The Live Mini Portal Frame */}
            <div style={{
              display: 'flex',
              minHeight: '340px',
              backgroundColor: workingTheme.colors.background,
              borderRadius: '8px',
              border: `1px solid ${workingTheme.colors.borders}`,
              overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
              transition: 'background-color 0.2s ease'
            }}>
              {/* Sidebar Strip */}
              <div style={{
                width: '90px',
                backgroundColor: workingTheme.colors.sidebarBg,
                borderRight: `1px solid ${workingTheme.colors.borders}`,
                padding: '16px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                flexShrink: 0,
                transition: 'background-color 0.2s ease'
              }}>
                {/* Mini Brand Mark */}
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  <img
                    src="/intent-digital-logo-web.png"
                    alt="Logo"
                    style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                  />
                  <div style={{
                    fontFamily: headingFontDef.cssFamily,
                    fontSize: '9px',
                    color: workingTheme.colors.sidebarText,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginTop: '4px'
                  }}>
                    Intent
                  </div>
                </div>

                {/* Mini Nav Items */}
                <div style={{
                  padding: '4px 6px',
                  borderRadius: '4px',
                  backgroundColor: `${workingTheme.colors.accent}25`,
                  borderLeft: `2px solid ${workingTheme.colors.accent}`,
                  fontFamily: labelFontDef.cssFamily,
                  fontSize: '8px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: workingTheme.colors.sidebarText,
                  textTransform: 'uppercase'
                }}>
                  Dashboard
                </div>
                <div style={{
                  padding: '4px 6px',
                  fontFamily: labelFontDef.cssFamily,
                  fontSize: '8px',
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  color: workingTheme.colors.sidebarText,
                  opacity: 0.7,
                  textTransform: 'uppercase'
                }}>
                  Projects
                </div>
                <div style={{
                  padding: '4px 6px',
                  fontFamily: labelFontDef.cssFamily,
                  fontSize: '8px',
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  color: workingTheme.colors.sidebarText,
                  opacity: 0.7,
                  textTransform: 'uppercase'
                }}>
                  Settings
                </div>
              </div>

              {/* Mini Main Content */}
              <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Mini Card */}
                <div style={{
                  backgroundColor: workingTheme.colors.cards,
                  border: `1px solid ${workingTheme.colors.borders}`,
                  borderRadius: '10px',
                  padding: '16px',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  transition: 'all 0.2s ease'
                }}>
                  {/* Uppercase Label + Optional Accent/Script Stamp */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    marginBottom: '6px'
                  }}>
                    <div style={{
                      fontFamily: labelFontDef.cssFamily,
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: workingTheme.colors.accent
                    }}>
                      Studio Direction
                    </div>
                    {accentFontDef && (
                      <span style={{
                        fontFamily: accentFontDef.cssFamily,
                        fontSize: '14px',
                        lineHeight: 1,
                        color: workingTheme.colors.primaryButton,
                        padding: '2px 7px',
                        borderRadius: '999px',
                        border: `1px dashed ${workingTheme.colors.borders}`,
                        backgroundColor: workingTheme.colors.surface,
                        transform: 'rotate(-3deg)',
                        display: 'inline-block'
                      }}>
                        Curated
                      </span>
                    )}
                  </div>

                  {/* Heading with Optional Italic Second Line */}
                  <h4 style={{
                    fontFamily: headingFontDef.cssFamily,
                    fontSize: workingTheme.fonts.baseTextSize === 'small' ? '18px' : workingTheme.fonts.baseTextSize === 'large' ? '24px' : '21px',
                    color: workingTheme.colors.headingText,
                    margin: '0 0 8px 0',
                    lineHeight: 1.15,
                    fontWeight: 'normal'
                  }}>
                    Editorial Vision<br />
                    <span style={{ fontStyle: workingTheme.fonts.italicSecondLine !== false ? 'italic' : 'normal' }}>
                      &amp; Architectural Craft
                    </span>
                  </h4>

                  {/* Body Text */}
                  <p style={{
                    fontFamily: bodyFontDef.cssFamily,
                    fontSize: workingTheme.fonts.baseTextSize === 'small' ? '11px' : workingTheme.fonts.baseTextSize === 'large' ? '13px' : '12px',
                    color: workingTheme.colors.bodyText,
                    lineHeight: 1.4,
                    margin: '0 0 12px 0'
                  }}>
                    Curating high-conviction visual systems for ambitious founders and modern practices.
                  </p>

                  {/* Sample Input Field */}
                  <div style={{ marginBottom: '12px' }}>
                    <input
                      type="text"
                      readOnly
                      placeholder="Search archive or project..."
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: `1px solid ${workingTheme.colors.borders}`,
                        backgroundColor: workingTheme.colors.surface,
                        color: workingTheme.colors.bodyText,
                        fontFamily: bodyFontDef.cssFamily,
                        fontSize: '11px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Button Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Primary Pill Button with Arrow */}
                    <button
                      type="button"
                      style={{
                        backgroundColor: workingTheme.colors.primaryButton,
                        color: workingTheme.colors.buttonText,
                        border: 'none',
                        borderRadius: '999px',
                        padding: '6px 14px',
                        fontFamily: labelFontDef.cssFamily,
                        fontSize: '10px',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        cursor: 'default',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                      }}
                    >
                      Explore Work &rarr;
                    </button>

                    {/* Secondary Outline Button */}
                    <button
                      type="button"
                      style={{
                        backgroundColor: 'transparent',
                        color: workingTheme.colors.bodyText,
                        border: `1px solid ${workingTheme.colors.borders}`,
                        borderRadius: '999px',
                        padding: '5px 12px',
                        fontFamily: labelFontDef.cssFamily,
                        fontSize: '10px',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        cursor: 'default'
                      }}
                    >
                      Details
                    </button>
                  </div>
                </div>

                {/* Sub-card with Status Badges */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '9px',
                  fontFamily: labelFontDef.cssFamily,
                  fontWeight: 600
                }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: `${workingTheme.colors.success}20`,
                    color: workingTheme.colors.success,
                    border: `1px solid ${workingTheme.colors.success}40`
                  }}>
                    Active Status
                  </span>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: `${workingTheme.colors.error}20`,
                    color: workingTheme.colors.error,
                    border: `1px solid ${workingTheme.colors.error}40`
                  }}>
                    Action Required
                  </span>
                </div>
              </div>
            </div>

            <p style={{
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '11px',
              color: 'rgba(52, 41, 42, 0.5)',
              margin: '14px 0 0 0',
              textAlign: 'center'
            }}>
              Updates immediately as you edit colors and typography.
            </p>
          </div>
        </div>
      </div>

      {/* MODAL: Save Preset */}
      {showPresetModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(52, 41, 42, 0.6)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '420px',
            width: '100%',
            boxShadow: '0 16px 40px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
              fontSize: '24px',
              color: '#34292A',
              margin: '0 0 8px 0'
            }}>
              Save Appearance as Preset
            </h3>
            <p style={{
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '13px',
              color: 'rgba(52, 41, 42, 0.7)',
              margin: '0 0 20px 0'
            }}>
              Store your current combination of colors and fonts as a quick-load preset chip.
            </p>

            <form onSubmit={handleSavePreset}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#34292A',
                  marginBottom: '8px'
                }}>
                  Preset Name
                </label>
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="e.g. Midnight Espresso, Minimal Ivory"
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(52, 41, 42, 0.2)',
                    fontSize: '14px',
                    fontFamily: 'Montserrat, sans-serif',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowPresetModal(false)}
                  className="btn-cherry-outline"
                  style={{ padding: '8px 18px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-cherry"
                  disabled={presetSaving || !newPresetName.trim()}
                  style={{ padding: '8px 20px', fontSize: '12px' }}
                >
                  {presetSaving ? 'Saving…' : 'Save preset \u2192'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reset to Default Confirm */}
      {showResetConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(52, 41, 42, 0.6)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '420px',
            width: '100%',
            boxShadow: '0 16px 40px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
              fontSize: '24px',
              color: '#34292A',
              margin: '0 0 8px 0'
            }}>
              Reset to Brand Default?
            </h3>
            <p style={{
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '13px',
              color: 'rgba(52, 41, 42, 0.7)',
              lineHeight: 1.5,
              margin: '0 0 24px 0'
            }}>
              This will reset all colors and typography back to the original Intent Digital brand tokens (Toasted Cream, Terrane Dark Brown, and Cherry).
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="btn-cherry-outline"
                style={{ padding: '8px 18px', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetConfirm}
                className="btn-cherry"
                style={{ padding: '8px 20px', fontSize: '12px', backgroundColor: '#8A2A1E', borderColor: '#8A2A1E' }}
              >
                Confirm reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
