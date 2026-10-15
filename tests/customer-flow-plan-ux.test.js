import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FLOW_STEP_COUNT, createFlowState } from '../src/domain/flow-state.js';
import { ageDependentEnhancement, claimOutcome, diagnosisTiming, planProtectionSummary, premiumWaiverText, supportMonthsForPayout } from '../src/domain/plan-experience.js';
import { claimCaseResourcesForProduct, diseaseResourcesForProduct, productBrochureForProduct, resourceKind } from '../src/data/content.js';
import { cumulativePayout } from '../src/domain/frontstage-experience.js';
import { FIREBASE_CONFIG, FIREBASE_AUTH_METHOD, FIREBASE_UPLOAD_ENABLED, FIREBASE_UPLOAD_STATUS, OFFICIAL_STORAGE_AUTH_STATE, officialResourcePath, sanitizeMediaFilename, storageCapability, uploadOfficialMedia, uploadOfficialMediaWithProvider, userMediaCapability, validateMediaFile } from '../src/integration/firebase-media.js';
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
  const young = planProtectionSummary({ plan: plans[1], benefits, sumAssured: 500000, age: 25, diagnosisAge: 30 });
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
  assert.equal(noAge.extra.percent, null);
  assert.equal(noAge.extra.status, 'VERIFY_REQUIRED');
  assert.equal(noAge.extra.amount, null);
  assert.equal(noAge.totalApplicable, null);
  assert.equal(noAge.major.status, 'VERIFY_REQUIRED');
  assert.equal(claimOutcome(noAge, 'major').status, 'VERIFY_REQUIRED');
  const missingDiagnosis = planProtectionSummary({ plan: plans[1], benefits, sumAssured: 500000, age: 31 });
  assert.equal(missingDiagnosis.extra.percent, 35);
  assert.equal(missingDiagnosis.extra.amount, null);
  assert.equal(missingDiagnosis.totalApplicable, null);
  assert.equal(missingDiagnosis.major.status, 'VERIFY_REQUIRED');
  const age31 = planProtectionSummary({ plan: plans[1], benefits, sumAssured: 500000, age: 31, diagnosisAge: 40 });
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
    { plan_id: 'OYS2', category: 'diseases', resource_type: 'pdf', resource_ref: '' },
    { plan_id: 'OYS2', content_type: 'brochure', category: 'documents', resource_type: 'firebase', resource_ref: 'https://example.test/brochure.pdf', enabled: true },
    { plan_id: 'OYS2', content_type: 'claim_example', category: 'claims', resource_type: 'firebase', resource_ref: 'https://example.test/case.png', enabled: true },
    { plan_id: 'OYS2', content_type: 'claim_example', category: 'claims', resource_type: 'firebase', resource_ref: 'https://example.test/disabled.pdf', enabled: false }
  ];
  assert.deepEqual(diseaseResourcesForProduct(configured, 'OYS2', 17).map(item => item.key), ['adult', 'child']);
  assert.deepEqual(diseaseResourcesForProduct(configured, 'OYS2', 18).map(item => item.key), ['adult']);
  assert.equal(diseaseResourcesForProduct(configured, 'SCE', 17).length, 0);
  assert.equal(resourceKind({ resource_type: 'image/png' }), 'image/png');
  assert.equal(resourceKind({ resource_type: 'firebase', resource_ref: 'https://example.test/case.png' }), 'image/png');
  assert.equal(productBrochureForProduct(configured, 'OYS2').length, 1);
  assert.equal(claimCaseResourcesForProduct(configured, 'OYS2').length, 1);
  assert.match(app, /查看產品小冊子|產品小冊子/);
  assert.match(app, /賠償案例/);
});

test('issue age chooses enhancement band while diagnosis age only controls first-ten-year timing', () => {
  assert.equal(ageDependentEnhancement(benefits, 'OYS2', 30).percent, 50);
  assert.equal(ageDependentEnhancement(benefits, 'OYS2', 31).percent, 35);
  assert.deepEqual(diagnosisTiming(45, 50), { status: 'APPLICABLE', elapsedYears: 5, reason: '仍在首10年保障期內。' });
  assert.equal(diagnosisTiming(45, 54).status, 'APPLICABLE');
  assert.equal(diagnosisTiming(45, 56).status, 'NOT_APPLICABLE');
  assert.equal(diagnosisTiming(45, 55).status, 'BOUNDARY_REQUIRES_POLICY_ANNIVERSARY');
  const inPeriod = planProtectionSummary({ plan: plans[1], benefits, sumAssured: 500000, age: 31, diagnosisAge: 40 });
  const afterPeriod = planProtectionSummary({ plan: plans[1], benefits, sumAssured: 500000, age: 31, diagnosisAge: 42 });
  assert.equal(inPeriod.extra.percent, 35);
  assert.equal(inPeriod.extra.amount, 175000);
  assert.equal(inPeriod.major.status, 'VERIFIED');
  assert.equal(claimOutcome(inPeriod, 'major').amount, 675000);
  assert.equal(afterPeriod.extra.status, 'NOT_APPLICABLE');
  assert.equal(afterPeriod.extra.amount, 0);
  assert.equal(afterPeriod.totalApplicable, 500000);
  assert.equal(afterPeriod.major.status, 'VERIFIED');
  assert.equal(claimOutcome(afterPeriod, 'major').status, 'VERIFIED');
  const boundary = planProtectionSummary({ plan: plans[1], benefits, sumAssured: 500000, age: 31, diagnosisAge: 41 });
  assert.equal(boundary.diagnosis.status, 'BOUNDARY_REQUIRES_POLICY_ANNIVERSARY');
  assert.equal(boundary.extra.amount, null);
  assert.equal(boundary.totalApplicable, null);
  assert.equal(boundary.major.status, 'VERIFY_REQUIRED');
  assert.equal(claimOutcome(boundary, 'major').status, 'VERIFY_REQUIRED');
  const sce = planProtectionSummary({ plan: plans[0], benefits, sumAssured: 500000, age: 45, diagnosisAge: 50 });
  assert.equal(sce.diagnosis.visible, false);
  assert.equal(sce.extra.status, 'NOT_APPLICABLE');
  assert.equal(sce.major.status, 'VERIFIED');
  assert.equal(sce.totalApplicable, 500000);
  assert.equal(claimOutcome(sce, 'major').amount, 500000);
  assert.equal(claimOutcome(sce, 'major').status, 'VERIFIED');
  assert.match(app, /summary\.diagnosis\?\.visible !== false/);
  assert.match(app, /確診歲數/);
  assert.doesNotMatch(app.slice(app.indexOf('function planComparisonCard'), app.indexOf('function bindPlanInputs')), /現時可享保障/);
  assert.doesNotMatch(app, /globalThis\.__ciCumulativeCard/);
});

test('cumulative payout is derived from scenario events', () => {
  assert.deepEqual(cumulativePayout([{ amount: 500000, percent: 100 }, { amount: 500000, percent: 100 }, { amount: 25000, percent: 5 }]), { amount: 1025000, percent: 205, eventCount: 3 });
  assert.deepEqual(cumulativePayout([]), { amount: 0, percent: 0, eventCount: 0 });
});

test('Firebase media gate validates references without creating an unsafe upload path', () => {
  assert.equal(FIREBASE_CONFIG.projectId, 'medical-and-ci');
  assert.equal(sanitizeMediaFilename('../疾病清單?.pdf'), '..-.pdf');
  assert.match(officialResourcePath({ planId: 'OYS2', category: 'diseases', filename: 'guide.pdf', timestamp: 123 }), /^critical-illness\/official\/OYS2\/product\/diseases\/123_guide\.pdf$/);
  assert.match(officialResourcePath({ planId: 'OYS2', category: 'claims', contentId: 'OYS2_CASE_001', contentType: 'claim_example', filename: 'case.pdf', timestamp: 123 }), /^critical-illness\/official\/OYS2\/claims\/OYS2_CASE_001\/123_case\.pdf$/);
  assert.deepEqual(validateMediaFile({ type: 'application/pdf', size: 10, name: 'guide.pdf' }), { type: 'application/pdf', size: 10, name: 'guide.pdf' });
  assert.throws(() => validateMediaFile({ type: 'application/javascript', size: 10, name: 'bad.js' }));
  assert.equal(userMediaCapability().binaryStoredLocally, false);
  assert.equal(FIREBASE_UPLOAD_ENABLED, true);
  assert.equal(FIREBASE_AUTH_METHOD, 'SERVER_SIDE_FIREBASE_CUSTOM_TOKEN_OR_APPROVED_BROKER');
  assert.equal(userMediaCapability().status, 'USER_STORAGE_AUTH_CONFIG_REQUIRED');
  assert.equal(OFFICIAL_STORAGE_AUTH_STATE, 'OFFICIAL_STORAGE_AUTH_READY');
  assert.deepEqual(storageCapability().official, { status: OFFICIAL_STORAGE_AUTH_STATE, uploadEnabled: true, authMethod: FIREBASE_AUTH_METHOD, publicRead: true, publicWrite: false });
});

test('Firebase media upload requires Admin proof and no longer uses a static runtime block', async () => {
  await assert.rejects(() => uploadOfficialMedia({ planId: 'OYS2', category: 'diseases', contentId: 'OYS2_DISEASES', file: { type: 'application/pdf', size: 10, name: 'guide.pdf' } }), error => error.code === 'ADMIN_PROOF_REQUIRED');
  assert.equal(FIREBASE_UPLOAD_STATUS, 'FIREBASE_AUTH_REQUIRED');
  assert.doesNotMatch(fs.readFileSync('src/integration/firebase-media.js', 'utf8'), /if \(!FIREBASE_UPLOAD_ENABLED\)/);
});

test('mocked approved provider returns a usable reference without storing binaries locally', async () => {
  const uploaded = await uploadOfficialMediaWithProvider({
    planId: 'SCE',
    category: 'brochure',
    contentId: 'SCE_BROCHURE',
    file: { type: 'application/pdf', size: 12, name: 'brochure.pdf' },
    timestamp: 456,
    provider: {
      upload: async (path, file, metadata) => ({ ref: { path }, file, metadata }),
      downloadUrl: async snapshot => 'https://storage.test/' + snapshot.ref.path,
      authorized: true
    }
  });
  assert.equal(uploaded.resourceType, 'pdf');
  assert.match(uploaded.url, /^https:\/\/storage\.test\/critical-illness\/official\/SCE\/product\/brochure\/456_brochure\.pdf$/);
});

test('Admin media controls keep AVA authorization and Firebase safety boundaries', () => {
  assert.match(app, /data-media-upload/);
  assert.match(app, /adminSessionProof/);
  assert.match(app, /writeOfficialData\(request, adminSessionProof\)/);
  assert.doesNotMatch(app, /getAnalytics|firebase-admin|serviceAccount|allow write: if true/);
  assert.doesNotMatch(app, /FIREBASE_RUNTIME_BLOCKED/);
  assert.match(app, /Firebase Admin 授權失敗/);
});

test('P9 information cards are display-only and the three choices route directly', () => {
  const p9 = app.slice(app.indexOf('if (step === 8)'), app.indexOf('function flowPage()'));
  assert.match(p9, /data-information-card="single"/);
  assert.match(p9, /data-information-card="continuing"/);
  assert.doesNotMatch(p9, /<article[^>]*data-information-card="single"[^>]*data-style/);
  assert.equal((p9.match(/data-style="(single|continuing|compare)"/g) || []).length, 3);
  assert.match(app, /location\.hash = '#\/plans'/);
  assert.match(app, /function routedPlans\(\)/);
  assert.match(app, /mode === 'single'.*planKey\(plan\) === 'SCE'/s);
  assert.match(app, /mode === 'continuing'.*planKey\(plan\) === 'OYS2'/s);
  assert.doesNotMatch(p9, /查看方案|直接查看方案/);
});
