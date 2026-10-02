import test from 'node:test';
import assert from 'node:assert/strict';
import { cancerEvidence, cancerTimeline, dementiaTimeline, heartStrokeEvidence, heartStrokeTimeline, paymentEndAge, premiumEvidence, selectedProtection } from '../src/domain/frontstage-experience.js';
import { createMemoryStorage, loadUserState, saveUserState } from '../src/data/storage.js';
import { createFlowState } from '../src/domain/flow-state.js';

const cancerRules = [
  { plan_id: 'OYS2', condition_group: 'cancer', claim_phase: 'initial', payout_value: 100 },
  { plan_id: 'OYS2', condition_group: 'cancer', claim_option: 'A', payout_value: 100, shared_pool_id: 'CANCER_CONTINUING_POOL', shared_pool_percent: 500, interval_value: 3, interval_unit: 'year', option_switch_rule: 'A_TO_B_ONLY' },
  { plan_id: 'OYS2', condition_group: 'cancer', claim_option: 'B', payout_value: 5, shared_pool_id: 'CANCER_CONTINUING_POOL', interval_value: 1, interval_unit: 'year', duration_rule: 'remaining_pool_divided_by_5', option_switch_rule: 'B_LOCKED' }
];

test('selected verified major protection converts to support months without inventing benefits', () => {
  const plans = [{ plan_id: 'SCE' }, { plan_id: 'OYS2' }];
  const benefits = plans.map(plan => ({ plan_id: plan.plan_id, benefit_type: 'major_ci', benefit_id: `${plan.plan_id}_MAJOR`, payout_percent: 100, benefit_name: '主要危疾保障' }));
  benefits.push({ plan_id: 'SCE', benefit_type: 'early_ci', payout_percent: 20 });
  const result = selectedProtection(plans, benefits, ['SCE', 'OYS2'], { SCE: 780000, OYS2: 1170000 }, 30000);
  assert.equal(result.total, 1950000);
  assert.equal(result.months, 65);
  assert.equal(result.items.length, 2);
  assert.equal(selectedProtection(plans, benefits, ['SCE'], { SCE: 780000 }, 0).months, null);
  assert.equal(selectedProtection(plans, benefits, ['SCE'], { SCE: 780000 }, 'invalid').months, null);
  assert.equal(selectedProtection(plans, benefits, ['SCE'], {}, 30000).total, 0);
  assert.equal(createFlowState({ monthlyNeed: 0 }).monthlyNeed, 0);
});

test('cancer has separate first 100%, shared 500%, A to B and actual age timeline', () => {
  assert.ok(cancerEvidence(cancerRules, 'OYS2'));
  const result = cancerTimeline({ rules: cancerRules, planId: 'OYS2', sumAssured: 780000, age: 25, actions: ['A', 'A', 'B', 'B'] });
  assert.equal(result.maxPercent, 600);
  assert.deepEqual(result.events.map(event => event.ageMonths), [300, 336, 372, 384, 385]);
  assert.deepEqual(result.events.map(event => event.cumulativePercent), [100, 200, 300, 305, 310]);
  assert.equal(result.remainingPercent, 290);
  assert.equal(result.remainingBMonths, 58);
  assert.equal(result.events.at(-1).cumulativeAmount, 2418000);
  const switched = cancerTimeline({ rules: cancerRules, planId: 'OYS2', sumAssured: 780000, age: 25, actions: ['A', 'A'] });
  assert.equal(switched.remainingBMonths, 60);
  const allA = cancerTimeline({ rules: cancerRules, planId: 'OYS2', sumAssured: 780000, age: 25, actions: ['A', 'A', 'A', 'A', 'A'] });
  assert.equal(allA.events.at(-1).cumulativePercent, 600);
  assert.equal(allA.remainingPercent, 0);
  assert.throws(() => cancerTimeline({ rules: cancerRules, planId: 'OYS2', sumAssured: 780000, age: 25, actions: ['B', 'A'] }), error => error.code === 'OPTION_A_LOCKED');
  assert.equal(cancerTimeline({ rules: cancerRules.slice(1), planId: 'OYS2', sumAssured: 780000, age: 25 }), null);
});

test('dementia annual lifetime exploration exceeds legacy eleven-entry limit', () => {
  const result = dementiaTimeline({ sumAssured: 780000, age: 25, throughAge: 40 });
  assert.equal(result.events.length, 16);
  assert.equal(result.duration, 'lifetime');
  assert.equal(result.events[0].amount, 780000);
  assert.equal(result.events[1].amount, 46800);
  assert.equal(result.events[1].age, 26);
  assert.equal(result.events.at(-1).cumulativePercent, 190);
  assert.equal(result.events.at(-1).cumulativeAmount, 1482000);
});

test('heart/stroke runs only with a well-formed Official rule and uses customer age', () => {
  const verified = [{ plan_id: 'OYS2', condition_group: 'heart_stroke', payout_type: 'percent', payout_value: 100, interval_value: 1, interval_unit: 'year', max_claims: 3 }];
  assert.ok(heartStrokeEvidence(verified, 'OYS2'));
  const result = heartStrokeTimeline({ rules: verified, planId: 'OYS2', sumAssured: 780000, age: 25, claims: 3 });
  assert.deepEqual(result.events.map(event => event.age), [25, 26, 27]);
  assert.deepEqual(result.events.map(event => event.cumulativePercent), [100, 200, 300]);
  assert.equal(result.events.at(-1).cumulativeAmount, 2340000);
  assert.equal(result.remainingClaims, 0);
  assert.equal(heartStrokeTimeline({ rules: verified, planId: 'OYS2', sumAssured: 780000, age: 25, claims: 4 }), null);
  const malformed = [{ plan_id: 'OYS2', condition_group: 'heart_stroke', payout_type: 100, payout_value: 1, interval_value: 'year', interval_unit: 3 }];
  assert.equal(heartStrokeEvidence(malformed, 'OYS2'), null);
  assert.equal(heartStrokeTimeline({ rules: malformed, planId: 'OYS2', sumAssured: 780000, age: 25 }), null);
});

test('premium remains unavailable even with an identifiable raw matrix cell', () => {
  const premium = { OYS2_MALE: { sheetName: '男愛伴航2保費', values: [[], [], ['Age', '10-Year Pay', '', '18-Year Pay'], ['', 'Non-Smoker', 'Smoker', 'Non-Smoker'], [25, 44.2, 55, 27.5]] } };
  const result = premiumEvidence(premium, { plan_id: 'OYS2' }, 'M', 25, 'non-smoker', 18);
  assert.equal(result.status, 'VERIFY_REQUIRED');
  assert.equal(result.source, '男愛伴航2保費');
  assert.equal(premiumEvidence(premium, { plan_id: 'OYS2' }, 'M', 26, 'non-smoker', 18).status, 'VERIFY_REQUIRED');
  assert.equal(paymentEndAge(25, 18), 43);
  assert.equal(paymentEndAge(25, 99), null);
});

test('frontstage choices survive local save with the guided flow and overrides', () => {
  const storage = createMemoryStorage();
  saveUserState({ flow: { monthlyNeed: 30000 }, frontstage: { age: 25, sums: { OYS2: 780000 }, cancerActions: ['A'] }, selectedPlanIds: ['OYS2'], pagePreferences: { introTitle: '我的標題' }, pages: [{ id: 'mine', title: '我的頁面' }] }, storage);
  const saved = loadUserState(storage);
  assert.equal(saved.flow.monthlyNeed, 30000);
  assert.equal(saved.frontstage.sums.OYS2, 780000);
  assert.deepEqual(saved.frontstage.cancerActions, ['A']);
  assert.deepEqual(saved.selectedPlanIds, ['OYS2']);
  assert.equal(saved.pagePreferences.introTitle, '我的標題');
  assert.equal(saved.pages[0].id, 'mine');
});
