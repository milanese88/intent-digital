import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAddress } from './addressNorm.js';

describe('Address Normalization', () => {
  test('normalizes target property: 409 Northwest 18th Avenue, Fort Lauderdale 33311', () => {
    const res = normalizeAddress('409 Northwest 18th Avenue, Fort Lauderdale 33311');
    assert.strictEqual(res.number, '409');
    assert.strictEqual(res.street, 'NW 18 AVE');
    assert.strictEqual(res.normalized, '409 NW 18 AVE');
    assert.strictEqual(res.zip, '33311');
    assert.strictEqual(res.city, 'FORT LAUDERDALE');
  });

  test('normalizes directions: NORTHWEST, NORTHEAST, SOUTHWEST, SOUTHEAST, NORTH, SOUTH, EAST, WEST', () => {
    assert.strictEqual(normalizeAddress('100 Northwest 1st Ave').street, 'NW 1 AVE');
    assert.strictEqual(normalizeAddress('100 Northeast 2nd St').street, 'NE 2 ST');
    assert.strictEqual(normalizeAddress('100 Southwest 3rd Ct').street, 'SW 3 CT');
    assert.strictEqual(normalizeAddress('100 Southeast 4th Ter').street, 'SE 4 TER');
    assert.strictEqual(normalizeAddress('100 North Main St').street, 'N MAIN ST');
    assert.strictEqual(normalizeAddress('100 South Ocean Blvd').street, 'S OCEAN BLVD');
    assert.strictEqual(normalizeAddress('100 East Park Way').street, 'E PARK WAY');
    assert.strictEqual(normalizeAddress('100 West End Ave').street, 'W END AVE');
  });

  test('normalizes dotted directions: N.W., S.W., etc.', () => {
    assert.strictEqual(normalizeAddress('12300 S.W. 4th Street').street, 'SW 4 ST');
    assert.strictEqual(normalizeAddress('500 N.W. 10th Ave').street, 'NW 10 AVE');
  });

  test('normalizes ordinals: 18TH->18, 1ST->1, 2ND->2, 3RD->3', () => {
    assert.strictEqual(normalizeAddress('100 1st St').street, '1 ST');
    assert.strictEqual(normalizeAddress('200 2nd St').street, '2 ST');
    assert.strictEqual(normalizeAddress('300 3rd St').street, '3 ST');
    assert.strictEqual(normalizeAddress('400 18th Ave').street, '18 AVE');
    assert.strictEqual(normalizeAddress('500 21st Way').street, '21 WAY');
  });

  test('normalizes USPS standard suffixes', () => {
    assert.strictEqual(normalizeAddress('100 Ocean Avenue').street, 'OCEAN AVE');
    assert.strictEqual(normalizeAddress('100 Ocean Street').street, 'OCEAN ST');
    assert.strictEqual(normalizeAddress('100 Ocean Terrace').street, 'OCEAN TER');
    assert.strictEqual(normalizeAddress('100 Ocean Court').street, 'OCEAN CT');
    assert.strictEqual(normalizeAddress('100 Ocean Place').street, 'OCEAN PL');
    assert.strictEqual(normalizeAddress('100 Ocean Drive').street, 'OCEAN DR');
    assert.strictEqual(normalizeAddress('100 Ocean Road').street, 'OCEAN RD');
    assert.strictEqual(normalizeAddress('100 Ocean Boulevard').street, 'OCEAN BLVD');
    assert.strictEqual(normalizeAddress('100 Ocean Lane').street, 'OCEAN LN');
    assert.strictEqual(normalizeAddress('100 Ocean Circle').street, 'OCEAN CIR');
    assert.strictEqual(normalizeAddress('100 Ocean Way').street, 'OCEAN WAY');
    assert.strictEqual(normalizeAddress('100 Ocean Parkway').street, 'OCEAN PKWY');
  });

  test('strips unit numbers and secondary address text', () => {
    assert.strictEqual(normalizeAddress('409 NW 18th Ave #3B').street, 'NW 18 AVE');
    assert.strictEqual(normalizeAddress('409 NW 18th Ave Apt 101').street, 'NW 18 AVE');
    assert.strictEqual(normalizeAddress('409 NW 18th Ave Unit 4').street, 'NW 18 AVE');
    assert.strictEqual(normalizeAddress('409 NW 18th Ave Suite 200').street, 'NW 18 AVE');
  });

  test('handles saved property cases from database', () => {
    const p1 = normalizeAddress('409 Northwest 18th Avenue, Fort Lauderdale 33311');
    assert.strictEqual(p1.number, '409');
    assert.strictEqual(p1.street, 'NW 18 AVE');
    assert.strictEqual(p1.normalized, '409 NW 18 AVE');

    const p2 = normalizeAddress('1110 Southwest 18th Court, Fort Lauderdale 33315');
    assert.strictEqual(p2.number, '1110');
    assert.strictEqual(p2.street, 'SW 18 CT');
    assert.strictEqual(p2.normalized, '1110 SW 18 CT');

    const p3 = normalizeAddress('4221 Northeast 16th Avenue, Oakland Park 33334');
    assert.strictEqual(p3.number, '4221');
    assert.strictEqual(p3.street, 'NE 16 AVE');
    assert.strictEqual(p3.normalized, '4221 NE 16 AVE');
  });

  test('handles addresses without leading numbers', () => {
    const r = normalizeAddress('Loxahatchee Road');
    assert.strictEqual(r.number, '');
    assert.strictEqual(r.street, 'LOXAHATCHEE RD');
    assert.strictEqual(r.normalized, 'LOXAHATCHEE RD');
  });
});
