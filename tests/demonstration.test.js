import test from 'node:test';
import assert from 'node:assert/strict';
import { claimOutcome, planProtectionSummary, remainingMajorProtectionAfterEarlyClaim, supportMonthsForPayout } from '../src/domain/plan-experience.js';
import { combinedPlanPayout } from '../src/domain/frontstage-experience.js';

const benefits = ['SCE', 'OYS2'].flatMap(plan_id => [
  { plan_id, benefit_type: 'major_ci', payout_percent: 100 },
  { plan_id, benefit_type: 'early_ci', payout_percent: 20 }
]);
benefits.push(
  { plan_id: 'OYS2', benefit_type: 'first_10_year_bonus', payout_percent: 50, age_min: 0, age_max: 30 },
  { plan_id: 'OYS2', benefit_type: 'first_10_year_bonus', payout_percent: 35, age_min: 31, age_max: 120 }
);
const summary = (id, age, diagnosisAge, verifiedEnhancementDecision) => planProtectionSummary({ plan: { plan_id: id }, benefits, sumAssured: 500000, age, diagnosisAge, verifiedEnhancementDecision });

test('hypothetical enhancement uses issue-age band and never changes verified payout', () => {
  for (const [age, percent] of [[0, 50], [30, 50], [31, 35], [40, 35]]) {
    const before = summary('OYS2', age, age + 5);
    assert.deepEqual(before.demonstration, { status: 'ILLUSTRATIVE', percent, amount: 500000 * percent / 100 });
    assert.equal(before.enhancementEligibility.status, 'PENDING_POLICY_DATE');
    assert.equal(claimOutcome(before).amount, 500000);
    assert.equal(claimOutcome(before).enhancementPending, true);
    assert.equal(claimOutcome(before, 'early').amount, 100000);
    assert.equal(remainingMajorProtectionAfterEarlyClaim(before).amount, 400000);
    assert.equal(summary('OYS2', age, age + 10).demonstration.status, 'ILLUSTRATIVE_BOUNDARY');
    assert.equal(summary('OYS2', age, age + 15).demonstration.status, 'ILLUSTRATIVE_EXPIRED');
    assert.equal(summary('SCE', age, age + 5).demonstration.status, 'HIDDEN');
  }
  assert.equal(summary('OYS2', 30, undefined).demonstration.status, 'UNAVAILABLE');
  assert.equal(summary('OYS2', 30, 29).demonstration.status, 'UNAVAILABLE');
});

test('contractual decision overrides illustration and combined amounts remain separate', () => {
  const applicable = summary('OYS2', 30, 35, 'VERIFIED_APPLICABLE');
  const expired = summary('OYS2', 30, 35, 'VERIFIED_EXPIRED');
  assert.equal(applicable.demonstration.status, 'HIDDEN');
  assert.equal(claimOutcome(applicable).amount, 750000);
  assert.equal(expired.demonstration.status, 'HIDDEN');
  assert.equal(expired.extra.amount, 0);
  assert.equal(claimOutcome(expired).amount, 500000);
  const sce = summary('SCE', 30, 35);
  const pending = summary('OYS2', 30, 35);
  const entries = [sce, pending].map(s => ({ baseAmount: s.baseAmount, summary: s, outcome: claimOutcome(s) }));
  const combined = combinedPlanPayout(entries, 'major');
  assert.equal(combined.amount, 1000000);
  assert.equal(combined.enhancementPending, true);
  assert.equal(supportMonthsForPayout(combined.amount, 25000), 40);
});
