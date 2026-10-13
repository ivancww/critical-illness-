import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FLOW_STEP_COUNT, createFlowState } from '../src/domain/flow-state.js';
import { ageDependentEnhancement, claimOutcome, planProtectionSummary, premiumWaiverText, supportMonthsForPayout } from '../src/domain/plan-experience.js';
import { diseaseResourcesForProduct } from '../src/data/content.js';
import { formatMoneyText, parseMoneyText } from '../src/domain/input-format.js';

const app = fs.readFileSync('src/app.js', 'utf8');
const header = fs.readFileSync('index.html', 'utf8').slice(fs.readFileSync('index.html', 'utf8').indexOf('<header'), fs.readFileSync('index.html', 'utf8').indexOf('</header>'));

const plans = [
  { plan_id: 'SCE', plan_name: '簡護危疾保', protection_style: 'single' },
  { plan_id: 'OYS2', plan_name: '愛伴航2', protection_style: 'continuing' }
];
const benefits = [
  { plan_id: 'SCE', benefit_id: 'SCE_MAJOR', benefit_type: 'major_ci', payout_percent: 100, display_text: '主要危疾可獲100%基本保額；賠償後保障完結', enabled: true },
  { plan_id: 'SCE', benefit_id: 'SCE_EARLY', benefit_type: 'early_ci', payout_percent: 20, enabled: true },
  { plan_id: 'OYS2', benefit_id: 'OYS2_MAJOR', benefit_type: 'major_ci', payout_percent: 100, enabled: true },
  { plan_id: 'OYS2', benefit_id: 'OYS2_EARLY', benefit_type: 'early_ci', payout_percent: 20, enabled: true },
  { plan_id: 'OYS2', benefit_id: 'OYS2_FIRST10_YOUNG', benefit_type: 'first_10_year_bonus', benefit_name: '首10年升級保障（投保年齡30歲或以下）', payout_percent: 50, enabled: true },
  { plan_id: 'OYS2', benefit_id: 'OYS2_FIRST10_OTHER', benefit_type: 'first_10_year_bonus', benefit_name: '首10年升級保障（投保年齡31歲或以上）', payout_percent: 35, enabled: true },
  { plan_id: 'OYS2', benefit_id: 'OYS2_WAIVER', benefit_type: 'premium_waiver', display_text: '符合嚴重危疾賠償後，豁免餘下保費', enabled: true },
  { plan_id: 'OYS2', benefit_id: 'OYS2_CONTINUING', benefit_type: 'continuing_protection', display_text: '首次嚴重危疾後，多重保障可繼續', enabled: true }
];

test('guided flow ends at P9 and P2 has no age field', () => {
  assert.equal(FLOW_STEP_COUNT, 9);
  assert.equal(createFlowState({ currentStep: 99 }).currentStep, 8);
  const p2 = app.slice(app.indexOf('function flowBody(step)'), app.indexOf('function flowPage()'));
  assert.doesNotMatch(p2, /insured-age|你現時年齡/);
  assert.match(p2, /data-concern/);
  assert.match(app, /危疾保障可以有兩種模式/);
  assert.match(p2, /一次性賠償/);
  assert.match(p2, /多次賠償/);
});

test('age-dependent and early-illness amounts use verified benefit rows', () => {
  assert.equal(ageDependentEnhancement(benefits, 'OYS2', 25).percent, 50);
  assert.equal(ageDependentEnhancement(benefits, 'OYS2', 31).percent, 35);
  const young = planProtectionSummary({ plan: plans[1], benefits, sumAssured: 500000, age: 25 });
  assert.equal(young.baseAmount, 500000);
  assert.equal(young.extra.percent, 50);
  assert.equal(young.extra.amount, 250000);
  assert.equal(young.totalApplicable, 750000);
  assert.equal(young.early.percent, 20);
  assert.equal(young.early.amount, 100000);
  assert.equal(claimOutcome(young, 'major').amount, 750000);
  assert.equal(claimOutcome(young, 'major').includesEnhancement, true);
  assert.equal(claimOutcome(young, 'early').amount, 100000);
  assert.equal(claimOutcome(young, 'early').includesEnhancement, false);
  assert.equal(supportMonthsForPayout(750000, 30000), 25);
  assert.equal(supportMonthsForPayout(750000, 0), null);
  assert.equal(premiumWaiverText(benefits, 'OYS2'), '符合嚴重危疾賠償後，豁免餘下保費');
  assert.equal(young.premiumWaiver.status, 'VERIFIED');
  const noAge = planProtectionSummary({ plan: plans[1], benefits, sumAssured: 500000 });
  assert.equal(noAge.extra.status, 'VERIFY_REQUIRED');
  const age31 = planProtectionSummary({ plan: plans[1], benefits, sumAssured: 500000, age: 31 });
  assert.equal(age31.extra.percent, 35);
  assert.equal(age31.extra.amount, 175000);
  assert.equal(age31.totalApplicable, 675000);
  assert.doesNotMatch(app.slice(app.indexOf('function planClaim'), app.indexOf('function planDetail')), /首次100%賠償後/);
  const noWaiverBenefits = benefits.filter(row => row.benefit_type !== 'premium_waiver');
  const noWaiver = planProtectionSummary({ plan: plans[1], benefits: noWaiverBenefits, sumAssured: 500000, age: 25 });
  assert.equal(premiumWaiverText(noWaiverBenefits, 'OYS2'), null);
  assert.equal(noWaiver.premiumWaiver.status, 'NOT_VERIFIED');
  assert.doesNotMatch(app.slice(app.indexOf('function planProtection'), app.indexOf('function planProtectionDetail')), /豁免往後保費/);
  assert.match(app.slice(app.indexOf('function planClaim'), app.indexOf('function planDetail')), /premiumWaiverCopy\(summary\)/);
});

test('customer plan UX removes the comparison basket and hides backend rule fields', () => {
  assert.doesNotMatch(header, /Admin · 官方設定/);
  assert.doesNotMatch(app, /加入比較/);
  assert.match(app, /location\.hash = '#\/plans'/);
  assert.match(app, /parts\[2\] === 'protection' && parts\[3\] === 'detail'/);
  const comparison = app.slice(app.indexOf('function planComparisonCard'), app.indexOf('function bindPlanInputs'));
  assert.match(comparison, /claim-selector/);
  assert.match(comparison, /data-plan-claim/);
  assert.match(app, /support-effect/);
  assert.doesNotMatch(comparison, /查看保障效果/);
  assert.match(comparison, /查看保障疾病種類/);
  assert.match(app, /返回方案/);
  assert.match(app, /data-claim-state="ended"/);
  assert.match(app, /data-claim-state="continuing"/);
  assert.match(app, /100% 一次性賠償/);
  assert.match(app, /一次性賠償完成/);
  assert.match(app, /合約完結/);
  assert.match(app, /claim-breakdown/);
  assert.match(app, /基本保障.*basePercent/);
  assert.match(app, /額外保障.*summary\.extra\.percent/);
  assert.match(app, /保費豁免須按產品官方保障資料確認/);
  const detail = app.slice(app.indexOf('function planProtectionDetail'), app.indexOf('function planClaim'));
  for (const rawField of ['rule_id', 'shared_pool_id', 'option_switch_rule', 'max_claims', 'data_version']) assert.doesNotMatch(detail, new RegExp(rawField));
});

test('customer money inputs format live while stored values remain numeric', () => {
  assert.equal(formatMoneyText(1000), '1,000');
  assert.equal(formatMoneyText(360000), '360,000');
  assert.equal(parseMoneyText('1,000,000'), 1000000);
  assert.equal(typeof parseMoneyText('360,000'), 'number');
  assert.match(app, /data-money-input/);
  assert.match(app, /inputmode="numeric"/);
});

test('disease resources are configured-data driven at the 17/18 boundary', () => {
  const configured = [
    { plan_id: 'OYS2', category: 'diseases', resource_type: 'pdf', resource_ref: 'https://example.test/adult.pdf' },
    { plan_id: 'OYS2', category: 'child', resource_type: 'pdf', resource_ref: 'https://example.test/child.pdf' },
    { plan_id: 'OYS2', category: 'diseases', resource_type: 'pdf', resource_ref: '' }
  ];
  assert.deepEqual(diseaseResourcesForProduct(configured, 'OYS2', 17).map(item => item.key), ['adult', 'child']);
  assert.deepEqual(diseaseResourcesForProduct(configured, 'OYS2', 18).map(item => item.key), ['adult']);
  assert.equal(diseaseResourcesForProduct(configured, 'SCE', 17).length, 0);
});
