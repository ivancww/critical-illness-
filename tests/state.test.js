import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage, createUserBackup, loadUserState, restoreUserBackup, saveUserMediaReference, saveUserState } from '../src/data/storage.js';
import { normalizeStructuredData } from '../src/data/data-api.js';
import { calculateSupportReserve, createFlowState, nextFlowStep, previousFlowStep, togglePlanSelection, translateProtectionToMonths } from '../src/domain/flow-state.js';
import { createQrRestorePointer, officialCacheIsCurrent, validateQrRestorePointer } from '../src/data/storage.js';

test('user state persists independently from official data', () => {
  const storage = createMemoryStorage();
  const state = { flow: { desiredMonths: 18 }, selectedPlanIds: ['oys2'] };
  saveUserState(state, storage);
  assert.deepEqual(loadUserState(storage).flow, state.flow);
  assert.deepEqual(loadUserState(storage).selectedPlanIds, state.selectedPlanIds);
});

test('structured datasets normalize without changing premium matrices', () => {
  const premium = { 男愛伴航2保費: [["Age", "Rate"]] };
  const result = normalizeStructuredData({ plans: [{ plan_id: 'sce' }], benefits: [], claim_rules: [], health_program: [], product_content: [], settings_versions: [], premium });
  assert.deepEqual(result.Plans, [{ plan_id: 'sce' }]);
  assert.deepEqual(result.Settings_Versions, []);
  assert.deepEqual(premium, { 男愛伴航2保費: [["Age", "Rate"]] });
});

test('flow navigation preserves state while changing only the step', () => {
  const flow = createFlowState({ desiredMonths: 18, monthlyNeed: 30000 });
  assert.equal(nextFlowStep(flow).desiredMonths, 18);
  assert.equal(nextFlowStep(flow).currentStep, 1);
  assert.equal(previousFlowStep(nextFlowStep(flow)).currentStep, 0);
});

test('plan selection is shared by direct and guided routes', () => {
  assert.deepEqual(togglePlanSelection([], 'sce'), ['sce']);
  assert.deepEqual(togglePlanSelection(['sce'], 'sce'), []);
});

test('support reserve and coverage months use the customer inputs', () => {
  assert.equal(calculateSupportReserve({ desiredMonths: 12, monthlyNeed: 30000 }), 360000);
  assert.equal(calculateSupportReserve({ months: 12, monthlyNeed: 30000 }), 360000);
  assert.equal(translateProtectionToMonths({ existingProtection: 180000, monthlyNeed: 30000 }), 6);
});

test('official cache refresh is version-aware and does not mix with user state', () => {
  assert.equal(officialCacheIsCurrent({ cacheVersion: 'ci-2' }, 'ci-2'), true);
  assert.equal(officialCacheIsCurrent({ cacheVersion: 'ci-1' }, 'ci-2'), false);
});

test('QR restore is a pointer only and cannot contain credentials', () => {
  const pointer = createQrRestorePointer({ restoreId: 'restore-123' });
  assert.deepEqual(validateQrRestorePointer(pointer), pointer);
  assert.throws(() => validateQrRestorePointer({ ...pointer, credentialsIncluded: true }));
});

test('user backup preserves structured pages and excludes media binary', () => {
  const source = { pagePreferences: { introTitle: '自訂' }, overrides: { home: { title: '標題', binary: 'should-not-export' } }, pages: [{ id: 'p1', type: 'image', title: '相片', media: [{ id: 'm1', cloudFileRef: 'cloud/ref', file: { bytes: 'no' }, order: 0 }] }] };
  const backup = createUserBackup(source);
  assert.equal(backup.data.pages[0].media[0].cloudFileRef, 'cloud/ref');
  assert.equal('file' in backup.data.pages[0].media[0], false);
  assert.equal('binary' in backup.data.overrides.home, false);
  assert.equal(restoreUserBackup(backup).pages[0].id, 'p1');
});

test('media upload fails safely until a cloud provider is configured', () => {
  assert.throws(() => saveUserMediaReference(), error => error.code === 'CLOUD_STORAGE_UNAVAILABLE');
});
