import test from 'node:test';
import assert from 'node:assert/strict';
import { createPremiumEngine, monthlyFromAnnual, PremiumMappingError } from '../src/domain/premium-engine.js';

test('premium engine refuses unverified mappings', () => {
  const engine = createPremiumEngine();
  assert.throws(() => engine.calculate({ planKey: 'sce', sumAssured: 780000, age: 30, gender: 'M' }), PremiumMappingError);
});

test('premium engine preserves raw rate and does not silently round', () => {
  const engine = createPremiumEngine({ mappings: {
    sce: { verified: true, rateBasis: 7800, resolve: () => ({ rate: 2.03, source: 'test-matrix' }) }
  }});
  const result = engine.calculate({ planKey: 'sce', sumAssured: 780000, age: 30, gender: 'M' });
  assert.equal(result.rawRate, 2.03);
  assert.ok(Math.abs(result.annualBeforeProgram - 203) < Number.EPSILON * 203);
  assert.equal(result.status, 'VERIFY_ROUNDING_AND_MONTHLY_ORDER');
});

test('monthly conversion is explicit and isolated', () => {
  assert.equal(monthlyFromAnnual(203, 1.06), 203 * 1.06 / 12);
});
