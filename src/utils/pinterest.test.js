import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isValidPinterestBoardUrl,
  deriveBoardTitleFromUrl,
  parsePinterestPinUrl
} from './pinterest.js';

describe('Pinterest Board URL Validation', () => {
  it('accepts standard pinterest board URLs', () => {
    assert.strictEqual(
      isValidPinterestBoardUrl('https://www.pinterest.com/intentdigital/japandi-kitchens/'),
      true
    );
    assert.strictEqual(
      isValidPinterestBoardUrl('https://pinterest.com/florencia/warm-minimalist-bathrooms'),
      true
    );
    assert.strictEqual(
      isValidPinterestBoardUrl('pinterest.com/user/coastal-living/'),
      true
    );
  });

  it('accepts pin.it short links for boards', () => {
    assert.strictEqual(isValidPinterestBoardUrl('https://pin.it/7dK29Lf'), true);
    assert.strictEqual(isValidPinterestBoardUrl('pin.it/abc1234'), true);
  });

  it('rejects pin URLs and non-board pinterest pages', () => {
    assert.strictEqual(
      isValidPinterestBoardUrl('https://www.pinterest.com/pin/1234567890/'),
      false
    );
    assert.strictEqual(
      isValidPinterestBoardUrl('https://www.pinterest.com/search/pins/?q=kitchen'),
      false
    );
    assert.strictEqual(
      isValidPinterestBoardUrl('https://www.pinterest.com/today/'),
      false
    );
  });

  it('rejects invalid or arbitrary non-pinterest URLs', () => {
    assert.strictEqual(isValidPinterestBoardUrl('https://google.com'), false);
    assert.strictEqual(isValidPinterestBoardUrl('not a url'), false);
    assert.strictEqual(isValidPinterestBoardUrl(''), false);
    assert.strictEqual(isValidPinterestBoardUrl(null), false);
  });

  it('derives friendly title from board url slug', () => {
    assert.strictEqual(
      deriveBoardTitleFromUrl('https://www.pinterest.com/intentdigital/warm-organic-living/'),
      'Warm Organic Living'
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

  it('parses pin.it short links', () => {
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
