/**
 * Theme Constants, On-Demand Font Loader & CSS Variable Resolver
 * Backed by the single font registry in src/config/fonts.js.
 */

import {
  MY_FONTS,
  GOOGLE_HEADING_FONTS,
  GOOGLE_BODY_FONTS,
  ALLOWED_HEADING_FONTS,
  ALLOWED_BODY_FONTS,
  ALLOWED_LABEL_FONTS,
  ALLOWED_ACCENT_FONTS,
  getFontGroupsForSlot,
  matchFontInList,
  findFontInRegistry
} from '../config/fonts.js';

export {
  MY_FONTS,
  GOOGLE_HEADING_FONTS,
  GOOGLE_BODY_FONTS,
  ALLOWED_HEADING_FONTS,
  ALLOWED_BODY_FONTS,
  ALLOWED_LABEL_FONTS,
  ALLOWED_ACCENT_FONTS,
  getFontGroupsForSlot
};

export const DEFAULT_THEME_COLORS = {
  background: '#FAF8F4',
  surface: '#F2EEE8',
  cards: '#FFFFFF',
  borders: '#E4DDD3',
  sidebarBg: '#FAF8F4',
  sidebarText: '#1B130D',
  headingText: '#1B130D',
  bodyText: '#4A413A',
  mutedText: '#8A7E72',
  primaryButton: '#3A1418',
  buttonText: '#FFFFFF',
  accent: '#859DCE',
  error: '#C24132',
  success: '#2E6B48'
};

export const DEFAULT_THEME_FONTS = {
  headingFont: 'Instrument Serif',
  bodyFont: 'Montserrat',
  labelFont: 'Montserrat',
  accentFont: '',
  baseTextSize: 'default', // 'small' | 'default' | 'large'
  italicSecondLine: true
};

export const DEFAULT_THEME = {
  colors: DEFAULT_THEME_COLORS,
  fonts: DEFAULT_THEME_FONTS,
  apply_to_login: false
};

export function getHeadingFontDef(name) {
  return matchFontInList(ALLOWED_HEADING_FONTS, name) || GOOGLE_HEADING_FONTS[0];
}

export function getBodyFontDef(name) {
  return matchFontInList(ALLOWED_BODY_FONTS, name) || GOOGLE_BODY_FONTS[0];
}

export function getLabelFontDef(name) {
  return matchFontInList(ALLOWED_LABEL_FONTS, name) || GOOGLE_BODY_FONTS[0];
}

export function getAccentFontDef(name) {
  if (!name || !String(name).trim()) return null;
  return matchFontInList(ALLOWED_ACCENT_FONTS, name) || null;
}

// ============================================================================
// On-Demand Font Loading & Load-Error Tracking
// ============================================================================
const loadedFontIds = new Set();
const inFlightLoads = new Map();
const fontLoadErrors = new Map(); // fontId -> { id, label, family, fallback, reason }
const errorListeners = new Set();

function notifyFontErrorListeners() {
  const snapshot = getFontLoadErrors();
  errorListeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      // ignore listener errors
    }
  });
}

export function getFontLoadErrors() {
  return Object.fromEntries(fontLoadErrors.entries());
}

export function subscribeFontLoadErrors(listener) {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

function recordFontSuccess(fontDef) {
  loadedFontIds.add(fontDef.id);
  if (fontLoadErrors.has(fontDef.id)) {
    fontLoadErrors.delete(fontDef.id);
    notifyFontErrorListeners();
  }
}

function recordFontFailure(fontDef, reason = 'Font file failed to load') {
  loadedFontIds.delete(fontDef.id);
  fontLoadErrors.set(fontDef.id, {
    id: fontDef.id,
    label: fontDef.label,
    family: fontDef.family,
    fallback: fontDef.fallback,
    reason
  });
  notifyFontErrorListeners();
}

async function loadBrandFontFaces(fontDef) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ok: true };
  }

  const files = Array.isArray(fontDef.files) ? fontDef.files : [];
  if (files.length === 0) {
    return { ok: true };
  }

  const normalizeFamily = (name) =>
    String(name || '')
      .replace(/^['"]+|['"]+$/g, '')
      .trim()
      .toLowerCase();

  const targetFamily = normalizeFamily(fontDef.family);

  try {
    // Use existing CSS @font-face declarations in document.fonts when present,
    // or construct FontFace instances on demand if not yet parsed.
    const existingFaces = document.fonts
      ? Array.from(document.fonts).filter((f) => normalizeFamily(f.family) === targetFamily)
      : [];

    if (existingFaces.length > 0) {
      await Promise.all(existingFaces.map((face) => face.load()));
    } else if (typeof FontFace !== 'undefined' && document.fonts) {
      const created = files.map(
        (file) =>
          new FontFace(
            fontDef.family,
            `url("${file.url}") format("woff2"), url("${file.fallbackUrl}") format("woff")`,
            {
              weight: String(file.weight || 400),
              style: file.style || 'normal',
              display: 'swap'
            }
          )
      );
      const loadedFaces = await Promise.all(created.map((ff) => ff.load()));
      loadedFaces.forEach((ff) => document.fonts.add(ff));
    }

    recordFontSuccess(fontDef);
    return { ok: true };
  } catch (err) {
    recordFontFailure(fontDef, err?.message || 'Unable to load webfont file');
    return { ok: false, error: err };
  }
}

function loadGoogleFontStylesheet(fontDef) {
  if (typeof document === 'undefined') {
    return Promise.resolve({ ok: true });
  }

  const linkId = `google-font-${fontDef.id.replace(/\s+/g, '-').toLowerCase()}`;
  const existing = document.getElementById(linkId);
  if (existing) {
    recordFontSuccess(fontDef);
    return Promise.resolve({ ok: true });
  }

  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${fontDef.googleParam}&display=swap`;
    link.onload = () => {
      recordFontSuccess(fontDef);
      resolve({ ok: true });
    };
    link.onerror = () => {
      link.remove();
      recordFontFailure(fontDef, 'Unable to load Google Font stylesheet');
      resolve({ ok: false });
    };
    document.head.appendChild(link);
  });
}

/**
 * Loads a single allowlisted font (Google or self-hosted brand font) ON DEMAND.
 * Never loads unselected fonts on normal pages.
 */
export function loadThemeFont(fontNameOrId, { forceRetry = false } = {}) {
  if (typeof document === 'undefined' || !fontNameOrId) {
    return Promise.resolve({ ok: true, skipped: true });
  }

  const match = findFontInRegistry(fontNameOrId);
  if (!match) {
    return Promise.resolve({ ok: false, skipped: true });
  }

  if (loadedFontIds.has(match.id) && !forceRetry) {
    return Promise.resolve({ ok: true });
  }

  if (inFlightLoads.has(match.id)) {
    return inFlightLoads.get(match.id);
  }

  const promise = (
    match.source === 'brand'
      ? loadBrandFontFaces(match)
      : loadGoogleFontStylesheet(match)
  ).finally(() => {
    inFlightLoads.delete(match.id);
  });

  inFlightLoads.set(match.id, promise);
  return promise;
}

// Backwards-compatible alias for existing callers
export function loadGoogleFont(fontName) {
  return loadThemeFont(fontName);
}

/**
 * Loads ONLY the fonts currently selected in a theme object.
 */
export function loadSelectedThemeFonts(fonts = {}) {
  const selected = [
    fonts.headingFont,
    fonts.bodyFont,
    fonts.labelFont,
    fonts.accentFont
  ].filter(Boolean);

  const unique = Array.from(new Set(selected));
  return Promise.all(unique.map((id) => loadThemeFont(id)));
}

/**
 * Loads preview fonts ONLY when the user opens a Typography dropdown in Settings.
 */
export function loadDropdownPreviewFonts(options = []) {
  if (typeof document === 'undefined') return Promise.resolve([]);
  return Promise.all(options.map((opt) => loadThemeFont(opt.id)));
}

// Legacy helper kept as a no-op / targeted Google preview loader if called directly
export function loadAllPreviewFonts() {
  // Intentionally lazy: individual dropdowns in AppearanceSettings load their options when opened
  // so visiting pages never eagerly downloads every font.
}

/**
 * Computes CSS custom properties for DashboardLayout / Login theme scopes.
 */
export function computeThemeCssVariables(theme) {
  const colors = { ...DEFAULT_THEME_COLORS, ...(theme?.colors || {}) };
  const fonts = { ...DEFAULT_THEME_FONTS, ...(theme?.fonts || {}) };

  const headingDef = getHeadingFontDef(fonts.headingFont);
  const bodyDef = getBodyFontDef(fonts.bodyFont);
  const labelDef = getLabelFontDef(fonts.labelFont);
  const accentDef = getAccentFontDef(fonts.accentFont);

  let bodyPx = '15px';
  let bodySmPx = '14px';
  let h1Clamp = 'clamp(36px, 4.5vw, 56px)';
  let h2Px = '32px';
  let h3Px = '25px';

  if (fonts.baseTextSize === 'small') {
    bodyPx = '14px';
    bodySmPx = '13px';
    h1Clamp = 'clamp(32px, 4vw, 50px)';
    h2Px = '28px';
    h3Px = '22px';
  } else if (fonts.baseTextSize === 'large') {
    bodyPx = '16.5px';
    bodySmPx = '15px';
    h1Clamp = 'clamp(40px, 5vw, 62px)';
    h2Px = '36px';
    h3Px = '28px';
  }

  const vars = {
    '--cream': colors.background,
    '--portal-bg': colors.background,
    '--surface': colors.surface,
    '--beige': colors.surface,
    '--sand': colors.surface,
    '--white': colors.cards,
    '--card-bg': colors.cards,
    '--border': colors.borders,
    '--border-strong': colors.borders,
    '--sidebar-bg': colors.sidebarBg,
    '--sidebar-text': colors.sidebarText,
    '--espresso': colors.headingText,
    '--portal-heading': colors.headingText,
    '--text-2': colors.bodyText,
    '--portal-body': colors.bodyText,
    '--muted': colors.mutedText,
    '--portal-muted': colors.mutedText,
    '--burgundy': colors.primaryButton,
    '--button-text': colors.buttonText,
    '--accent': colors.accent,
    '--negative': colors.error,
    '--positive': colors.success,
    '--font-display': headingDef.cssFamily,
    '--font-serif': headingDef.cssFamily,
    '--font-heading': headingDef.cssFamily,
    '--font-body': bodyDef.cssFamily,
    '--font-sans': bodyDef.cssFamily,
    '--font-label': labelDef.cssFamily,
    '--text-body': bodyPx,
    '--text-body-sm': bodySmPx,
    '--text-h1': h1Clamp,
    '--text-h2': h2Px,
    '--text-h3': h3Px
  };

  if (accentDef) {
    vars['--font-script'] = accentDef.cssFamily;
    vars['--font-accent'] = accentDef.cssFamily;
  }

  return vars;
}
