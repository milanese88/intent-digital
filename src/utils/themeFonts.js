/**
 * Allowlisted Google Fonts & Theme Constants for Intent Digital Owner Portal
 *
 * Security: Strict allowlist only. Arbitrary URLs or font names are rejected.
 */

export const ALLOWED_HEADING_FONTS = [
  {
    id: 'Instrument Serif',
    label: 'Instrument Serif (Default)',
    family: "'Instrument Serif', Georgia, serif",
    googleParam: 'family=Instrument+Serif:ital@0;1',
    category: 'serif'
  },
  {
    id: 'Cormorant Garamond',
    label: 'Cormorant Garamond',
    family: "'Cormorant Garamond', Georgia, serif",
    googleParam: 'family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600',
    category: 'serif'
  },
  {
    id: 'Playfair Display',
    label: 'Playfair Display',
    family: "'Playfair Display', Georgia, serif",
    googleParam: 'family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600',
    category: 'serif'
  },
  {
    id: 'EB Garamond',
    label: 'EB Garamond',
    family: "'EB Garamond', Georgia, serif",
    googleParam: 'family=EB+Garamond:ital,wght@0,400;0,600;1,400;1,600',
    category: 'serif'
  },
  {
    id: 'Fraunces',
    label: 'Fraunces',
    family: "'Fraunces', Georgia, serif",
    googleParam: 'family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,600',
    category: 'serif'
  },
  {
    id: 'Libre Caslon Display',
    label: 'Libre Caslon Display',
    family: "'Libre Caslon Display', Georgia, serif",
    googleParam: 'family=Libre+Caslon+Display',
    category: 'serif'
  },
  {
    id: 'DM Serif Display',
    label: 'DM Serif Display',
    family: "'DM Serif Display', Georgia, serif",
    googleParam: 'family=DM+Serif+Display:ital@0;1',
    category: 'serif'
  }
];

export const ALLOWED_BODY_FONTS = [
  {
    id: 'Montserrat',
    label: 'Montserrat (Default)',
    family: "'Montserrat', system-ui, -apple-system, sans-serif",
    googleParam: 'family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400',
    category: 'sans-serif'
  },
  {
    id: 'Inter',
    label: 'Inter',
    family: "'Inter', system-ui, -apple-system, sans-serif",
    googleParam: 'family=Inter:wght@400;500;600;700',
    category: 'sans-serif'
  },
  {
    id: 'DM Sans',
    label: 'DM Sans',
    family: "'DM Sans', system-ui, -apple-system, sans-serif",
    googleParam: 'family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400',
    category: 'sans-serif'
  },
  {
    id: 'Jost',
    label: 'Jost',
    family: "'Jost', system-ui, -apple-system, sans-serif",
    googleParam: 'family=Jost:ital,wght@0,400;0,500;0,600;0,700;1,400',
    category: 'sans-serif'
  },
  {
    id: 'Lato',
    label: 'Lato',
    family: "'Lato', system-ui, -apple-system, sans-serif",
    googleParam: 'family=Lato:ital,wght@0,400;0,700;1,400',
    category: 'sans-serif'
  },
  {
    id: 'Nunito Sans',
    label: 'Nunito Sans',
    family: "'Nunito Sans', system-ui, -apple-system, sans-serif",
    googleParam: 'family=Nunito+Sans:ital,wght@0,400;0,600;0,700;1,400',
    category: 'sans-serif'
  }
];

export const ALLOWED_LABEL_FONTS = ALLOWED_BODY_FONTS;

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
  baseTextSize: 'default', // 'small' | 'default' | 'large'
  italicSecondLine: true
};

export const DEFAULT_THEME = {
  colors: DEFAULT_THEME_COLORS,
  fonts: DEFAULT_THEME_FONTS,
  apply_to_login: false
};

/**
 * Checks if font name is in allowlist and returns its entry
 */
export function getHeadingFontDef(name) {
  return ALLOWED_HEADING_FONTS.find(f => f.id.toLowerCase() === (name || '').trim().toLowerCase()) || ALLOWED_HEADING_FONTS[0];
}

export function getBodyFontDef(name) {
  return ALLOWED_BODY_FONTS.find(f => f.id.toLowerCase() === (name || '').trim().toLowerCase()) || ALLOWED_BODY_FONTS[0];
}

export function getLabelFontDef(name) {
  return ALLOWED_LABEL_FONTS.find(f => f.id.toLowerCase() === (name || '').trim().toLowerCase()) || ALLOWED_LABEL_FONTS[0];
}

/**
 * Injects Google Fonts <link> tags safely using strictly allowlisted queries.
 * Never constructs arbitrary URLs.
 */
const loadedFontIds = new Set();

export function loadGoogleFont(fontName) {
  if (typeof document === 'undefined') return;
  const headingMatch = ALLOWED_HEADING_FONTS.find(f => f.id.toLowerCase() === (fontName || '').trim().toLowerCase());
  const bodyMatch = ALLOWED_BODY_FONTS.find(f => f.id.toLowerCase() === (fontName || '').trim().toLowerCase());
  const match = headingMatch || bodyMatch;
  if (!match || loadedFontIds.has(match.id)) return;

  const linkId = `google-font-${match.id.replace(/\s+/g, '-').toLowerCase()}`;
  if (document.getElementById(linkId)) {
    loadedFontIds.add(match.id);
    return;
  }

  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${match.googleParam}&display=swap`;
  document.head.appendChild(link);
  loadedFontIds.add(match.id);
}

/**
 * Preloads all allowlisted fonts so that dropdown options are rendered in their respective typeface.
 */
export function loadAllPreviewFonts() {
  if (typeof document === 'undefined') return;
  const allParams = [
    ...ALLOWED_HEADING_FONTS.map(f => f.googleParam),
    ...ALLOWED_BODY_FONTS.map(f => f.googleParam)
  ];
  const uniqueParams = Array.from(new Set(allParams));
  const linkId = 'portal-all-preview-fonts';
  if (document.getElementById(linkId)) return;

  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${uniqueParams.join('&')}&display=swap`;
  document.head.appendChild(link);
}

/**
 * Returns the CSS custom property dictionary for a given theme to inject into the DashboardLayout root.
 */
export function computeThemeCssVariables(theme) {
  const colors = { ...DEFAULT_THEME_COLORS, ...(theme?.colors || {}) };
  const fonts = { ...DEFAULT_THEME_FONTS, ...(theme?.fonts || {}) };

  const headingDef = getHeadingFontDef(fonts.headingFont);
  const bodyDef = getBodyFontDef(fonts.bodyFont);
  const labelDef = getLabelFontDef(fonts.labelFont);

  // Text scale calculation
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

  return {
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
    '--font-display': headingDef.family,
    '--font-serif': headingDef.family,
    '--font-body': bodyDef.family,
    '--font-sans': bodyDef.family,
    '--font-label': labelDef.family,
    '--text-body': bodyPx,
    '--text-body-sm': bodySmPx,
    '--text-h1': h1Clamp,
    '--text-h2': h2Px,
    '--text-h3': h3Px
  };
}
