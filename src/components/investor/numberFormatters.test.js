import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stripNumberFormatting,
  formatNumberWithCommas
} from './numberFormatters.js';

test('stripNumberFormatting: integers only', () => {
  assert.strictEqual(stripNumberFormatting('580000'), '580000');
  assert.strictEqual(stripNumberFormatting('$580,000'), '580000');
  assert.strictEqual(stripNumberFormatting('  $1,234,567  '), '1234567');
  assert.strictEqual(stripNumberFormatting('abc123def'), '123');
  assert.strictEqual(stripNumberFormatting(''), '');
  assert.strictEqual(stripNumberFormatting(null), '');
  assert.strictEqual(stripNumberFormatting(undefined), '');
});

test('stripNumberFormatting: decimal allowed for percentages/rates', () => {
  assert.strictEqual(stripNumberFormatting('7.0', true), '7.0');
  assert.strictEqual(stripNumberFormatting('7.25', true), '7.25');
  assert.strictEqual(stripNumberFormatting('7.2.5', true), '7.25');
  assert.strictEqual(stripNumberFormatting('25%', true), '25');
  assert.strictEqual(stripNumberFormatting('  2.5  ', true), '2.5');
  assert.strictEqual(stripNumberFormatting('.5', true), '.5');
  assert.strictEqual(stripNumberFormatting('', true), '');
});

test('formatNumberWithCommas: blur formatting', () => {
  assert.strictEqual(formatNumberWithCommas('580000'), '580,000');
  assert.strictEqual(formatNumberWithCommas('580000', '$'), '$580,000');
  assert.strictEqual(formatNumberWithCommas('1650'), '1,650');
  assert.strictEqual(formatNumberWithCommas('6000', '$'), '$6,000');
  assert.strictEqual(formatNumberWithCommas('1234567.89'), '1,234,567.89');
  assert.strictEqual(formatNumberWithCommas('', '$'), '');
  assert.strictEqual(formatNumberWithCommas(null), '');
});
