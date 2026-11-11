import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidHex,
  normalizeHex,
  hexToRgb,
  getLuminance,
  getContrastRatio,
  getContrastEvaluation
} from './themeContrast.js';
import {
  ALLOWED_HEADING_FONTS,
  ALLOWED_BODY_FONTS,
  DEFAULT_THEME_COLORS,
  DEFAULT_THEME_FONTS,
  computeThemeCssVariables
} from './themeFonts.js';

describe('Hex Color Validation & Normalization', () => {
  test('isValidHex correctly identifies valid and invalid hex strings', () => {
    assert.strictEqual(isValidHex('#fff'), true);
    assert.strictEqual(isValidHex('#FFFFFF'), true);
    assert.strictEqual(isValidHex('#3a1418'), true);
    assert.strictEqual(isValidHex('#FAF8F4'), true);
    assert.strictEqual(isValidHex(' #FAF8F4 '), true); // trims

    assert.strictEqual(isValidHex(''), false);
    assert.strictEqual(isValidHex(null), false);
    assert.strictEqual(isValidHex('FAF8F4'), false); // missing #
    assert.strictEqual(isValidHex('#12'), false); // too short
    assert.strictEqual(isValidHex('#12345'), false); // 5 digits
    assert.strictEqual(isValidHex('#1234567'), false); // 7 digits
    assert.strictEqual(isValidHex('#GGGGGG'), false); // non-hex
  });

  test('normalizeHex normalizes 3-char and 6-char hex to uppercase #RRGGBB', () => {
    assert.strictEqual(normalizeHex('#fff'), '#FFFFFF');
    assert.strictEqual(normalizeHex('#34292a'), '#34292A');
    assert.strictEqual(normalizeHex(' #faf8f4 '), '#FAF8F4');
    assert.strictEqual(normalizeHex('invalid'), null);
  });

  test('hexToRgb correctly breaks down RGB channels', () => {
    assert.deepStrictEqual(hexToRgb('#FFFFFF'), { r: 255, g: 255, b: 255 });
    assert.deepStrictEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
    assert.deepStrictEqual(hexToRgb('#3A1418'), { r: 58, g: 20, b: 24 });
  });
});

describe('WCAG AA Contrast Evaluation', () => {
  test('Calculates luminance correctly for pure white and black', () => {
    assert.strictEqual(getLuminance({ r: 255, g: 255, b: 255 }), 1);
    assert.strictEqual(getLuminance({ r: 0, g: 0, b: 0 }), 0);
  });

  test('Calculates contrast ratio: pure white on pure black = 21:1', () => {
    const ratio = getContrastRatio('#FFFFFF', '#000000');
    assert.strictEqual(Math.round(ratio), 21);
  });

  test('Default brand heading on canvas (#1B130D on #FAF8F4) meets WCAG AA', () => {
    const evalResult = getContrastEvaluation('#1B130D', '#FAF8F4');
    assert.strictEqual(evalResult.readable, true);
    assert.ok(evalResult.ratio >= 4.5);
    assert.match(evalResult.label, /^Readable \(\d+\.\d+:1\)$/);
  });

  test('White text on burgundy primary button (#FFFFFF on #3A1418) meets WCAG AA', () => {
    const evalResult = getContrastEvaluation('#FFFFFF', '#3A1418');
    assert.strictEqual(evalResult.readable, true);
    assert.ok(evalResult.ratio >= 4.5);
  });

  test('Low contrast combinations are flagged without throwing', () => {
    const evalResult = getContrastEvaluation('#FAF8F4', '#F2EEE8');
    assert.strictEqual(evalResult.readable, false);
    assert.match(evalResult.label, /^Low contrast \(\d+\.\d+:1\)$/);
  });
});

describe('Font Allowlist & Theme CSS Variable Computation', () => {
  test('Heading font allowlist contains all required fonts', () => {
    const headingIds = ALLOWED_HEADING_FONTS.map(f => f.id);
    assert.ok(headingIds.includes('Instrument Serif'));
    assert.ok(headingIds.includes('Cormorant Garamond'));
    assert.ok(headingIds.includes('Playfair Display'));
    assert.ok(headingIds.includes('EB Garamond'));
    assert.ok(headingIds.includes('Fraunces'));
    assert.ok(headingIds.includes('Libre Caslon Display'));
    assert.ok(headingIds.includes('DM Serif Display'));
  });

  test('Body font allowlist contains all required fonts', () => {
    const bodyIds = ALLOWED_BODY_FONTS.map(f => f.id);
    assert.ok(bodyIds.includes('Montserrat'));
    assert.ok(bodyIds.includes('Inter'));
    assert.ok(bodyIds.includes('DM Sans'));
    assert.ok(bodyIds.includes('Jost'));
    assert.ok(bodyIds.includes('Lato'));
    assert.ok(bodyIds.includes('Nunito Sans'));
  });

  test('computeThemeCssVariables maps colors and fonts to exact token properties', () => {
    const theme = {
      colors: {
        ...DEFAULT_THEME_COLORS,
        background: '#FAF8F4',
        primaryButton: '#3A1418'
      },
      fonts: {
        ...DEFAULT_THEME_FONTS,
        headingFont: 'Playfair Display',
        bodyFont: 'Inter'
      }
    };

    const vars = computeThemeCssVariables(theme);
    assert.strictEqual(vars['--cream'], '#FAF8F4');
    assert.strictEqual(vars['--burgundy'], '#3A1418');
    assert.ok(vars['--font-display'].includes('Playfair Display'));
    assert.ok(vars['--font-body'].includes('Inter'));
  });
});
