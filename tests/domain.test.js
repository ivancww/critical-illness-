import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDementiaParkinsonClaim, createCancerState, payCancerOptionA, payCancerOptionBMonth, payInitialCancerClaim, remainingCancerOptionBMonths } from '../src/domain/claim-engine.js';
import { getActivePlans, resolvePlan } from '../src/domain/product-engine.js';

test('cancer initial claim is separate from the continuing pool', () => {
  let state = createCancerState(780000);
  state = payInitialCancerClaim(state);
  assert.equal(state.payout, 780000);
  assert.equal(state.remainingPoolPercent, 500);
});

test('cancer A consumes the shared pool and B uses remaining months', () => {
  let state = payInitialCancerClaim(createCancerState(780000));
  state = payCancerOptionA(state);
  state = payCancerOptionA(state);
  assert.equal(state.remainingPoolPercent, 300);
  assert.equal(remainingCancerOptionBMonths(state), 60);
});

test('cancer B locks out A while B can continue', () => {
  let state = payInitialCancerClaim(createCancerState(780000));
  state = payCancerOptionBMonth(state);
  assert.equal(state.remainingPoolPercent, 495);
  assert.throws(() => payCancerOptionA(state), /不能轉回/);
  state = payCancerOptionBMonth(state);
  assert.equal(state.optionBMonths, 2);
});

test('dementia/Parkinson continuation is lifetime, not max eleven entries', () => {
  assert.deepEqual(calculateDementiaParkinsonClaim({ sumAssured: 780000, initial: true }), { payout: 780000, payoutPercent: 100, duration: 'lifetime' });
  assert.deepEqual(calculateDementiaParkinsonClaim({ sumAssured: 780000 }), { payout: 46800, payoutPercent: 6, duration: 'lifetime' });
});

test('inactive products remain resolvable but are excluded from active plan access', () => {
  const records = [{ plan_id: 'sce', active: true }, { plan_id: 'old', active: false }];
  assert.deepEqual(getActivePlans(records).map(item => item.plan_id), ['sce']);
  assert.equal(resolvePlan(records, 'old').active, false);
});
