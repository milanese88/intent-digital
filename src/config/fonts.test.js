import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MY_FONTS,
  ALLOWED_HEADING_FONTS,
  ALLOWED_BODY_FONTS,
  ALLOWED_LABEL_FONTS,
  ALLOWED_ACCENT_FONTS,
  getFontGroupsForSlot,
  matchFontInList
} from './fonts.js';
import {
  DEFAULT_THEME_COLORS,
  DEFAULT_THEME_FONTS,
  computeThemeCssVariables
} from '../utils/themeFonts.js';

describe('Brand Font Registry (src/config/fonts.js)', () => {
  test('MY_FONTS entries expose complete schema and /fonts/brand/ webfont paths', () => {
    assert.strictEqual(MY_FONTS.length, 3);
    const validCategories = new Set(['serif', 'sans', 'script', 'display']);

    for (const font of MY_FONTS) {
      assert.ok(typeof font.id === 'string' && font.id.length > 0);
      assert.ok(typeof font.family === 'string' && font.family.length > 0);
      assert.ok(Array.isArray(font.weights) && font.weights.length > 0);
      assert.strictEqual(typeof font.italic, 'boolean');
      assert.ok(validCategories.has(font.category));
      assert.ok(typeof font.fallback === 'string' && font.fallback.length > 0);
      assert.strictEqual(font.fallbackStack, font.fallback);
      assert.ok(Array.isArray(font.files) && font.files.length > 0);

      for (const file of font.files) {
        assert.match(file.url, /^\/fonts\/brand\/.+\.woff2$/);
        assert.match(file.fallbackUrl, /^\/fonts\/brand\/.+\.woff$/);
      }
    }
  });

  test('Script and display fonts appear ONLY in Headings and Accent slots, never in Body or Labels', () => {
    const headingsGroup = getFontGroupsForSlot('headings');
    const bodyGroup = getFontGroupsForSlot('body');
    const labelsGroup = getFontGroupsForSlot('labels');
    const accentGroup = getFontGroupsForSlot('accent');

    // Headings gets all 3 My fonts at the top
    assert.deepStrictEqual(
      headingsGroup.myFonts.map((f) => f.id),
      ['atelier-fleur', 'atelier-fleur-script', 'dreams-on-paper']
    );

    // Body and Labels get serif/sans My fonts at top, never script/display
    assert.deepStrictEqual(bodyGroup.myFonts.map((f) => f.id), ['atelier-fleur']);
    assert.deepStrictEqual(labelsGroup.myFonts.map((f) => f.id), ['atelier-fleur']);

    for (const font of [...ALLOWED_BODY_FONTS, ...ALLOWED_LABEL_FONTS]) {
      assert.notStrictEqual(font.category, 'script');
      assert.notStrictEqual(font.category, 'display');
    }

    // Accent slot gets script/display My fonts
    assert.deepStrictEqual(
      accentGroup.myFonts.map((f) => f.id),
      ['atelier-fleur-script', 'dreams-on-paper']
    );
    assert.strictEqual(ALLOWED_ACCENT_FONTS.length, 2);
  });

  test('matchFontInList matches by id or family name case-insensitively and rejects unknown fonts', () => {
    assert.strictEqual(matchFontInList(ALLOWED_HEADING_FONTS, 'atelier-fleur')?.family, 'Atelier Fleur');
    assert.strictEqual(matchFontInList(ALLOWED_HEADING_FONTS, 'Dreams on Paper')?.id, 'dreams-on-paper');
    assert.strictEqual(matchFontInList(ALLOWED_BODY_FONTS, 'dreams-on-paper'), null);
    assert.strictEqual(matchFontInList(ALLOWED_HEADING_FONTS, 'Evil Unlicensed Font'), null);
  });

  test('computeThemeCssVariables resolves custom brand fonts with fallback stacks and optional accent stamp', () => {
    const vars = computeThemeCssVariables({
      colors: DEFAULT_THEME_COLORS,
      fonts: {
        ...DEFAULT_THEME_FONTS,
        headingFont: 'atelier-fleur',
        bodyFont: 'atelier-fleur',
        labelFont: 'Montserrat',
        accentFont: 'dreams-on-paper'
      }
    });

    assert.strictEqual(vars['--font-display'], "'Atelier Fleur', Georgia, 'Times New Roman', serif");
    assert.strictEqual(vars['--font-body'], "'Atelier Fleur', Georgia, 'Times New Roman', serif");
    assert.strictEqual(vars['--font-accent'], "'Dreams on Paper', cursive");
    assert.strictEqual(vars['--font-script'], "'Dreams on Paper', cursive");
  });
});
