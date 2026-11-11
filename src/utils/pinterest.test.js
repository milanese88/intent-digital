import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isPinterestHost,
  isValidPinterestBoardUrl,
  validateAndParsePinterestBoardUrl,
  normalizePinterestBoardUrl,
  deriveBoardTitleFromUrl,
  parsePinterestPinUrl
} from './pinterest.js';

describe('Pinterest Host Validation', () => {
  it('accepts global and country-specific Pinterest domains', () => {
    assert.strictEqual(isPinterestHost('pinterest.com'), true);
    assert.strictEqual(isPinterestHost('www.pinterest.com'), true);
    assert.strictEqual(isPinterestHost('ar.pinterest.com'), true);
    assert.strictEqual(isPinterestHost('es.pinterest.com'), true);
    assert.strictEqual(isPinterestHost('pinterest.co.uk'), true);
    assert.strictEqual(isPinterestHost('www.pinterest.co.uk'), true);
    assert.strictEqual(isPinterestHost('pinterest.com.mx'), true);
    assert.strictEqual(isPinterestHost('pinterest.ca'), true);
    assert.strictEqual(isPinterestHost('pinterest.fr'), true);
    assert.strictEqual(isPinterestHost('pinterest.de'), true);
    assert.strictEqual(isPinterestHost('pinterest.it'), true);
    assert.strictEqual(isPinterestHost('pin.it'), true);
    assert.strictEqual(isPinterestHost('www.pin.it'), true);
  });

  it('rejects non-Pinterest domains', () => {
    assert.strictEqual(isPinterestHost('example.com'), false);
    assert.strictEqual(isPinterestHost('google.com'), false);
    assert.strictEqual(isPinterestHost('pinterest.example.com'), false);
    assert.strictEqual(isPinterestHost('notpinterest.com'), false);
    assert.strictEqual(isPinterestHost('pinterest.com.evil.com'), false);
    assert.strictEqual(isPinterestHost(''), false);
    assert.strictEqual(isPinterestHost(null), false);
  });
});

describe('Pinterest Board URL Validation & Normalization', () => {
  it('handles the 4 required prompt test cases', () => {
    // 1. https://ar.pinterest.com/mnflorencia/home/kitchen/ -> valid, section
    const test1 = validateAndParsePinterestBoardUrl('https://ar.pinterest.com/mnflorencia/home/kitchen/');
    assert.strictEqual(test1.valid, true);
    assert.strictEqual(test1.kind, 'section');
    assert.strictEqual(test1.user, 'mnflorencia');
    assert.strictEqual(test1.board, 'home');
    assert.strictEqual(test1.section, 'kitchen');
    assert.strictEqual(test1.normalizedUrl, 'https://www.pinterest.com/mnflorencia/home/kitchen/');

    // 2. https://www.pinterest.com/mnflorencia/home/ -> valid, board
    const test2 = validateAndParsePinterestBoardUrl('https://www.pinterest.com/mnflorencia/home/');
    assert.strictEqual(test2.valid, true);
    assert.strictEqual(test2.kind, 'board');
    assert.strictEqual(test2.user, 'mnflorencia');
    assert.strictEqual(test2.board, 'home');
    assert.strictEqual(test2.normalizedUrl, 'https://www.pinterest.com/mnflorencia/home/');

    // 3. https://www.pinterest.com/pin/123456/ -> rejected, "single pin" message
    const test3 = validateAndParsePinterestBoardUrl('https://www.pinterest.com/pin/123456/');
    assert.strictEqual(test3.valid, false);
    assert.strictEqual(
      test3.error,
      "This looks like a single pin — add it to a room's mood board instead."
    );

    // 4. https://example.com/board/ -> rejected, "not a Pinterest link"
    const test4 = validateAndParsePinterestBoardUrl('https://example.com/board/');
    assert.strictEqual(test4.valid, false);
    assert.match(test4.error, /not a pinterest link/i);
  });

  it('normalizes URLs: forces https://www.pinterest.com, strips query params, adds trailing slash', () => {
    const raw = 'http://es.pinterest.com/studio/moodboard?utm_source=share&utm_medium=pinit#hash';
    const parsed = validateAndParsePinterestBoardUrl(raw);
    assert.strictEqual(parsed.valid, true);
    assert.strictEqual(parsed.kind, 'board');
    assert.strictEqual(parsed.normalizedUrl, 'https://www.pinterest.com/studio/moodboard/');
    assert.strictEqual(normalizePinterestBoardUrl(raw), 'https://www.pinterest.com/studio/moodboard/');
  });

  it('supports pin.it short links for boards', () => {
    const short1 = validateAndParsePinterestBoardUrl('https://pin.it/7dK29Lf');
    assert.strictEqual(short1.valid, true);
    assert.strictEqual(short1.isShortLink, true);
    assert.strictEqual(short1.normalizedUrl, 'https://pin.it/7dK29Lf');

    const short2 = validateAndParsePinterestBoardUrl('pin.it/abc1234?utm_source=copy');
    assert.strictEqual(short2.valid, true);
    assert.strictEqual(short2.isShortLink, true);
    assert.strictEqual(short2.normalizedUrl, 'https://pin.it/abc1234');
  });

  it('gives clear explanations for rejection reasons (wrong domain, pin, profile, empty)', () => {
    assert.strictEqual(
      validateAndParsePinterestBoardUrl('').error,
      'Please enter a Pinterest board URL.'
    );
    assert.strictEqual(
      validateAndParsePinterestBoardUrl('   ').error,
      'Please enter a Pinterest board URL.'
    );
    assert.match(
      validateAndParsePinterestBoardUrl('https://github.com/intent').error,
      /not a pinterest link/i
    );
    assert.strictEqual(
      validateAndParsePinterestBoardUrl('https://www.pinterest.com/pin/99220005531980838/').error,
      "This looks like a single pin — add it to a room's mood board instead."
    );
    assert.match(
      validateAndParsePinterestBoardUrl('https://www.pinterest.com/onlyuser/').error,
      /user profile/i
    );
  });

  it('derives friendly title from board and section URLs', () => {
    assert.strictEqual(
      deriveBoardTitleFromUrl('https://www.pinterest.com/intentdigital/warm-organic-living/'),
      'Warm Organic Living'
    );
    assert.strictEqual(
      deriveBoardTitleFromUrl('https://ar.pinterest.com/mnflorencia/home/kitchen/'),
      'Kitchen'
    );
  });
});

describe('Pinterest Pin URL Parsing', () => {
  it('parses valid pin URLs and extracts pin_id', () => {
    const res = parsePinterestPinUrl('https://www.pinterest.com/pin/99220005531980838/');
    assert.ok(res);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.pin_id, '99220005531980838');
    assert.strictEqual(res.pin_url, 'https://www.pinterest.com/pin/99220005531980838/');
  });

  it('parses pin.it short links for pins', () => {
    const res = parsePinterestPinUrl('https://pin.it/5vH8sPq');
    assert.ok(res);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.pin_id, '5vH8sPq');
    assert.strictEqual(res.pin_url, 'https://pin.it/5vH8sPq');
  });

  it('rejects board URLs or invalid URLs', () => {
    assert.strictEqual(parsePinterestPinUrl('https://www.pinterest.com/user/board/'), null);
    assert.strictEqual(parsePinterestPinUrl('https://google.com'), null);
    assert.strictEqual(parsePinterestPinUrl(''), null);
  });
});
