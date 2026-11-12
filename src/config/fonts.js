/**
 * Single Font Registry for Intent Digital Owner Portal
 *
 * Combines self-hosted "My fonts" (/fonts/brand/*.woff2) and allowlisted Google Fonts.
 * Security: Strict allowlist only — arbitrary font names or external URLs are rejected.
 *
 * Category enum: 'serif' | 'sans' | 'script' | 'display'
 * Slot rules:
 *  - Headings: serif, sans, script, display ("My fonts" at top + Google heading allowlist)
 *  - Body: serif, sans ONLY (script/display excluded)
 *  - Labels: serif, sans ONLY (script/display excluded)
 *  - Accent / script (optional, for small stamps): script, display ONLY (+ empty/none)
 */

function buildFontEntry(entry) {
  const fallback = entry.fallback || entry.fallbackStack || 'serif';
  const quotedFamily = entry.family.includes(' ') || entry.family.includes('-')
    ? `'${entry.family}'`
    : `'${entry.family}'`;
  const cssFamily = `${quotedFamily}, ${fallback}`;

  return {
    ...entry,
    label: entry.label || entry.family,
    fallback,
    fallbackStack: fallback,
    cssFamily
  };
}

export const MY_FONTS = [
  buildFontEntry({
    id: 'atelier-fleur',
    label: 'Atelier Fleur',
    family: 'Atelier Fleur',
    weights: [400, 700],
    italic: true,
    category: 'serif',
    fallback: "Georgia, 'Times New Roman', serif",
    source: 'brand',
    files: [
      {
        url: '/fonts/brand/atelier-fleur-regular-webfont.woff2',
        fallbackUrl: '/fonts/brand/atelier-fleur-regular-webfont.woff',
        weight: 400,
        style: 'normal'
      },
      {
        url: '/fonts/brand/atelier-fleur-italic-webfont.woff2',
        fallbackUrl: '/fonts/brand/atelier-fleur-italic-webfont.woff',
        weight: 400,
        style: 'italic'
      },
      {
        url: '/fonts/brand/atelier-fleur-bold-webfont.woff2',
        fallbackUrl: '/fonts/brand/atelier-fleur-bold-webfont.woff',
        weight: 700,
        style: 'normal'
      },
      {
        url: '/fonts/brand/atelier-fleur-bold-italic-webfont.woff2',
        fallbackUrl: '/fonts/brand/atelier-fleur-bold-italic-webfont.woff',
        weight: 700,
        style: 'italic'
      }
    ]
  }),
  buildFontEntry({
    id: 'atelier-fleur-script',
    label: 'Atelier Fleur Script',
    family: 'Atelier Fleur Script',
    weights: [400, 700],
    italic: false,
    category: 'script',
    fallback: "'Brush Script MT', cursive",
    source: 'brand',
    files: [
      {
        url: '/fonts/brand/atelier-fleur-script-regular-webfont.woff2',
        fallbackUrl: '/fonts/brand/atelier-fleur-script-regular-webfont.woff',
        weight: 400,
        style: 'normal'
      },
      {
        url: '/fonts/brand/atelier-fleur-script-bold-webfont.woff2',
        fallbackUrl: '/fonts/brand/atelier-fleur-script-bold-webfont.woff',
        weight: 700,
        style: 'normal'
      }
    ]
  }),
  buildFontEntry({
    id: 'dreams-on-paper',
    label: 'Dreams on Paper',
    family: 'Dreams on Paper',
    weights: [400],
    italic: false,
    category: 'script',
    fallback: 'cursive',
    source: 'brand',
    files: [
      {
        url: '/fonts/brand/dreamsonpaper-regular-webfont.woff2',
        fallbackUrl: '/fonts/brand/dreamsonpaper-regular-webfont.woff',
        weight: 400,
        style: 'normal'
      }
    ]
  })
];

export const GOOGLE_HEADING_FONTS = [
  buildFontEntry({
    id: 'Instrument Serif',
    label: 'Instrument Serif (Default)',
    family: 'Instrument Serif',
    weights: [400],
    italic: true,
    category: 'serif',
    fallback: 'Georgia, serif',
    googleParam: 'family=Instrument+Serif:ital@0;1',
    source: 'google'
  }),
  buildFontEntry({
    id: 'Cormorant Garamond',
    label: 'Cormorant Garamond',
    family: 'Cormorant Garamond',
    weights: [400, 600],
    italic: true,
    category: 'serif',
    fallback: 'Georgia, serif',
    googleParam: 'family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600',
    source: 'google'
  }),
  buildFontEntry({
    id: 'Playfair Display',
    label: 'Playfair Display',
    family: 'Playfair Display',
    weights: [400, 600],
    italic: true,
    category: 'serif',
    fallback: 'Georgia, serif',
    googleParam: 'family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600',
    source: 'google'
  }),
  buildFontEntry({
    id: 'EB Garamond',
    label: 'EB Garamond',
    family: 'EB Garamond',
    weights: [400, 600],
    italic: true,
    category: 'serif',
    fallback: 'Georgia, serif',
    googleParam: 'family=EB+Garamond:ital,wght@0,400;0,600;1,400;1,600',
    source: 'google'
  }),
  buildFontEntry({
    id: 'Fraunces',
    label: 'Fraunces',
    family: 'Fraunces',
    weights: [400, 600],
    italic: true,
    category: 'serif',
    fallback: 'Georgia, serif',
    googleParam: 'family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,600',
    source: 'google'
  }),
  buildFontEntry({
    id: 'Libre Caslon Display',
    label: 'Libre Caslon Display',
    family: 'Libre Caslon Display',
    weights: [400],
    italic: false,
    category: 'display',
    fallback: 'Georgia, serif',
    googleParam: 'family=Libre+Caslon+Display',
    source: 'google'
  }),
  buildFontEntry({
    id: 'DM Serif Display',
    label: 'DM Serif Display',
    family: 'DM Serif Display',
    weights: [400],
    italic: true,
    category: 'display',
    fallback: 'Georgia, serif',
    googleParam: 'family=DM+Serif+Display:ital@0;1',
    source: 'google'
  })
];

export const GOOGLE_BODY_FONTS = [
  buildFontEntry({
    id: 'Montserrat',
    label: 'Montserrat (Default)',
    family: 'Montserrat',
    weights: [400, 500, 600, 700],
    italic: true,
    category: 'sans',
    fallback: 'system-ui, -apple-system, sans-serif',
    googleParam: 'family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400',
    source: 'google'
  }),
  buildFontEntry({
    id: 'Inter',
    label: 'Inter',
    family: 'Inter',
    weights: [400, 500, 600, 700],
    italic: false,
    category: 'sans',
    fallback: 'system-ui, -apple-system, sans-serif',
    googleParam: 'family=Inter:wght@400;500;600;700',
    source: 'google'
  }),
  buildFontEntry({
    id: 'DM Sans',
    label: 'DM Sans',
    family: 'DM Sans',
    weights: [400, 500, 700],
    italic: true,
    category: 'sans',
    fallback: 'system-ui, -apple-system, sans-serif',
    googleParam: 'family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400',
    source: 'google'
  }),
  buildFontEntry({
    id: 'Jost',
    label: 'Jost',
    family: 'Jost',
    weights: [400, 500, 600, 700],
    italic: true,
    category: 'sans',
    fallback: 'system-ui, -apple-system, sans-serif',
    googleParam: 'family=Jost:ital,wght@0,400;0,500;0,600;0,700;1,400',
    source: 'google'
  }),
  buildFontEntry({
    id: 'Lato',
    label: 'Lato',
    family: 'Lato',
    weights: [400, 700],
    italic: true,
    category: 'sans',
    fallback: 'system-ui, -apple-system, sans-serif',
    googleParam: 'family=Lato:ital,wght@0,400;0,700;1,400',
    source: 'google'
  }),
  buildFontEntry({
    id: 'Nunito Sans',
    label: 'Nunito Sans',
    family: 'Nunito Sans',
    weights: [400, 600, 700],
    italic: true,
    category: 'sans',
    fallback: 'system-ui, -apple-system, sans-serif',
    googleParam: 'family=Nunito+Sans:ital,wght@0,400;0,600;0,700;1,400',
    source: 'google'
  })
];

export const GOOGLE_FONTS = [...GOOGLE_HEADING_FONTS, ...GOOGLE_BODY_FONTS];
export const ALL_FONTS = [...MY_FONTS, ...GOOGLE_FONTS];

const isScriptOrDisplay = (f) => f.category === 'script' || f.category === 'display';

/**
 * Returns { myFonts, googleFonts } grouped lists for a typography slot.
 * Script/display fonts appear ONLY in 'headings' and 'accent'.
 */
export function getFontGroupsForSlot(slot) {
  switch (slot) {
    case 'headings':
      return {
        myFonts: MY_FONTS,
        googleFonts: GOOGLE_HEADING_FONTS
      };
    case 'body':
    case 'labels':
      return {
        myFonts: MY_FONTS.filter((f) => !isScriptOrDisplay(f)),
        googleFonts: GOOGLE_BODY_FONTS
      };
    case 'accent':
      return {
        myFonts: MY_FONTS.filter((f) => isScriptOrDisplay(f)),
        googleFonts: []
      };
    default:
      return { myFonts: [], googleFonts: [] };
  }
}

export const ALLOWED_HEADING_FONTS = [
  ...getFontGroupsForSlot('headings').myFonts,
  ...getFontGroupsForSlot('headings').googleFonts
];

export const ALLOWED_BODY_FONTS = [
  ...getFontGroupsForSlot('body').myFonts,
  ...getFontGroupsForSlot('body').googleFonts
];

export const ALLOWED_LABEL_FONTS = [
  ...getFontGroupsForSlot('labels').myFonts,
  ...getFontGroupsForSlot('labels').googleFonts
];

export const ALLOWED_ACCENT_FONTS = [
  ...getFontGroupsForSlot('accent').myFonts,
  ...getFontGroupsForSlot('accent').googleFonts
];

/**
 * Matches a font entry in a given list by id OR family name (case-insensitive).
 */
export function matchFontInList(list, nameOrId) {
  const needle = String(nameOrId || '').trim().toLowerCase();
  if (!needle) return null;
  return (
    list.find(
      (f) =>
        f.id.toLowerCase() === needle ||
        f.family.toLowerCase() === needle
    ) || null
  );
}

export function findFontInRegistry(nameOrId) {
  return matchFontInList(ALL_FONTS, nameOrId);
}
