/**
 * WCAG AA Contrast and Hex Color Utilities for Intent Digital Owner Portal Theme
 */

/**
 * Validates whether a string is a valid #RGB or #RRGGBB hex color.
 */
export function isValidHex(hex) {
  if (!hex || typeof hex !== 'string') return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex.trim());
}

/**
 * Normalizes hex to uppercase #RRGGBB format.
 * Returns null if invalid.
 */
export function normalizeHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  let clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  if (clean.length !== 6 || !/^[0-9A-Fa-f]{6}$/.test(clean)) return null;
  return `#${clean.toUpperCase()}`;
}

/**
 * Converts a hex string to RGB object { r, g, b }.
 */
export function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const num = parseInt(normalized.slice(1), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

/**
 * Computes relative luminance from RGB object according to WCAG 2.1 specs.
 */
export function getLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map(val => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Computes contrast ratio between two hex colors (returns number like 4.5).
 */
export function getContrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return null;
  const l1 = getLuminance(rgb1);
  const l2 = getLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Evaluates WCAG AA contrast ratio between text and background.
 * Returns { ratio, readable, label, formattedRatio }
 */
export function getContrastEvaluation(textColor, bgColor, isLargeText = false) {
  const ratio = getContrastRatio(textColor, bgColor);
  if (ratio == null) {
    return { ratio: null, readable: true, label: 'Unknown', formattedRatio: 'N/A' };
  }
  const minRatio = isLargeText ? 3.0 : 4.5;
  const readable = ratio >= minRatio;
  const formattedRatio = `${ratio.toFixed(1)}:1`;
  return {
    ratio,
    readable,
    formattedRatio,
    label: readable ? `Readable (${formattedRatio})` : `Low contrast (${formattedRatio})`
  };
}
