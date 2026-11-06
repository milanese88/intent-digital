import test from 'node:test';
import assert from 'node:assert/strict';

function checkIsSaveDisabled(strategy, inputs) {
  if (strategy === 'rental') {
    const rent = Number(inputs.monthlyRent);
    const ins = Number(inputs.insuranceYr);
    return !(rent > 0 && ins > 0);
  }
  if (strategy === 'flip') {
    const arv = Number(inputs.arv);
    return !(arv > 0);
  }
  if (strategy === 'brrrr') {
    const arv = Number(inputs.arv);
    const rent = Number(inputs.monthlyRent);
    const ins = Number(inputs.insuranceYr);
    return !(arv > 0 && rent > 0 && ins > 0);
  }
  return false;
}

test('SAVE ANALYSIS disabled rules: Flip', () => {
  // Initially empty ARV -> disabled
  assert.strictEqual(checkIsSaveDisabled('flip', { arv: '' }), true);
  assert.strictEqual(checkIsSaveDisabled('flip', { arv: 0 }), true);
  assert.strictEqual(checkIsSaveDisabled('flip', { arv: '0' }), true);

  // Filled ARV 580000 -> enabled
  assert.strictEqual(checkIsSaveDisabled('flip', { arv: '580000' }), false);
  assert.strictEqual(checkIsSaveDisabled('flip', { arv: 580000 }), false);
});

test('SAVE ANALYSIS disabled rules: Rental', () => {
  // Missing both -> disabled
  assert.strictEqual(checkIsSaveDisabled('rental', { monthlyRent: '', insuranceYr: '' }), true);

  // Only rent filled -> disabled
  assert.strictEqual(checkIsSaveDisabled('rental', { monthlyRent: '3400', insuranceYr: '' }), true);

  // Only insurance filled -> disabled
  assert.strictEqual(checkIsSaveDisabled('rental', { monthlyRent: '', insuranceYr: '6000' }), true);

  // Both filled -> enabled
  assert.strictEqual(checkIsSaveDisabled('rental', { monthlyRent: '3400', insuranceYr: '6000' }), false);
});

test('SAVE ANALYSIS disabled rules: BRRRR', () => {
  // Missing all -> disabled
  assert.strictEqual(checkIsSaveDisabled('brrrr', { arv: '', monthlyRent: '', insuranceYr: '' }), true);

  // ARV only -> disabled
  assert.strictEqual(checkIsSaveDisabled('brrrr', { arv: '580000', monthlyRent: '', insuranceYr: '' }), true);

  // ARV and rent, missing insurance -> disabled
  assert.strictEqual(checkIsSaveDisabled('brrrr', { arv: '580000', monthlyRent: '3400', insuranceYr: '' }), true);

  // ARV, rent, and insurance all filled -> enabled
  assert.strictEqual(checkIsSaveDisabled('brrrr', { arv: '580000', monthlyRent: '3400', insuranceYr: '6000' }), false);
});
