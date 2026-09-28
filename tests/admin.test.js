import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ADMIN_SECTION_DEFINITIONS, adminPersistenceStatus, composeOfficialAndUser, createAdminWriteRequest, officialRecords, premiumSheetStatus, redactOfficialValue, resourceStatus, validateAdminWrite } from '../src/admin/official-config.js';

const app = fs.readFileSync('src/app.js', 'utf8');
const sections = fs.readFileSync('src/admin/official-config.js', 'utf8');

test('admin entry is explicit and separate from Front/User routes', () => {
  assert.match(app, /!\['frontend', 'user', 'admin'\]\.includes\(requestedEntry\)/);
  assert.match(app, /const canAdmin = appEntry === 'admin'/);
  assert.match(app, /function adminPage\(\)/);
  assert.match(app, /if \(canAdmin\) return adminPage\(\)/);
  assert.deepEqual(ADMIN_SECTION_DEFINITIONS.map(([label]) => label), ['Products', 'Benefits', 'Claim Rules', 'Health Program', 'Product Content', 'Premium Data', 'Data Sources', 'Versions / Status']);
});

test('official Admin view is data-driven and does not save User state', () => {
  const adminStart = app.indexOf('function adminPage()');
  const adminEnd = app.indexOf('function unsupportedEntryPage()', adminStart);
  const adminSource = app.slice(adminStart, adminEnd);
  assert.match(adminSource, /officialRecords\(d, 'Plans'\)/);
  assert.match(adminSource, /officialRecords\(d, 'Benefits'\)/);
  assert.match(adminSource, /officialRecords\(d, 'Claim_Rules'\)/);
  assert.match(adminSource, /officialRecords\(d, 'Health_Program'\)/);
  assert.match(adminSource, /officialRecords\(d, 'Product_Content'\)/);
  assert.doesNotMatch(adminSource, /saveUserState|persistUser|localStorage\.setItem/);
  assert.match(sections, /CURRENT GAS CONTRACT EXPOSES READ ACTIONS ONLY/);
  assert.deepEqual(adminPersistenceStatus(), { status: 'EXTERNAL CONFIGURATION REQUIRED', reason: 'CURRENT GAS CONTRACT EXPOSES READ ACTIONS ONLY', authentication: 'AUTH PLATFORM-DEPENDENT' });
});

test('official updates compose with User Overrides without resetting User-owned data', () => {
  const user = { pagePreferences: { introTitle: '我的標題', showIntro: false }, pages: [{ id: 'personal-page', sortOrder: 2, visible: false }] };
  const before = composeOfficialAndUser({ presentationDefaults: { introTitle: 'Official A', introSubtitle: 'Official subtitle' }, Plans: [{ plan_id: 'p1', active: true }] }, user);
  const after = composeOfficialAndUser({ presentationDefaults: { introTitle: 'Official C', introSubtitle: 'Official subtitle 2' }, Plans: [{ plan_id: 'p1', active: false }] }, user);
  assert.equal(before.presentation.introTitle, '我的標題');
  assert.equal(after.presentation.introTitle, '我的標題');
  assert.equal(after.presentation.showIntro, false);
  assert.deepEqual(after.pages, user.pages);
  assert.equal(after.official.Plans[0].active, false);
  assert.equal(after.userOverride, user);
});

test('Admin write contract is allowlisted, versioned, and never reports cloud success', () => {
  assert.deepEqual(createAdminWriteRequest({ dataset: 'Plans', recordId: 'p1', expectedVersion: 'v2', fields: { display_name: 'Updated', active: false } }), {
    action: 'adminUpdate', dataset: 'Plans', recordId: 'p1', expectedVersion: 'v2', fields: { display_name: 'Updated', active: false }, status: 'PENDING_EXTERNAL_WRITE_PATH'
  });
  assert.throws(() => validateAdminWrite({ dataset: 'Plans', recordId: 'p1', expectedVersion: 'v2', fields: { premium_rate: 1 } }), /Unknown or protected/);
  assert.throws(() => validateAdminWrite({ dataset: 'Plans', recordId: 'p1', expectedVersion: 'v2', fields: { unknown_field: true } }), /Unknown or protected/);
  assert.throws(() => validateAdminWrite({ dataset: 'Plans', recordId: 'p1', expectedVersion: 'v2', fields: { active: 'false' } }), /must be boolean/);
  assert.throws(() => validateAdminWrite({ dataset: 'Settings_Versions', recordId: 'versions', expectedVersion: 'v2', fields: { monthly_premium_factor: 1.06 } }), /Unknown or protected/);
  assert.throws(() => createAdminWriteRequest({ dataset: 'Plans', recordId: 'p1', fields: { active: false } }), /expected dataset version/);
});

test('official records retain product history, verify premium mappings, and protect secrets', () => {
  const structured = { Plans: [{ plan_id: 'old', active: false }], Claim_Rules: [{ plan_id: 'oys2', rule_type: 'continuing' }] };
  assert.deepEqual(officialRecords(structured, 'Plans'), [{ plan_id: 'old', active: false }]);
  assert.deepEqual(officialRecords(structured, 'Claim_Rules'), [{ plan_id: 'oys2', rule_type: 'continuing' }]);
  assert.deepEqual(premiumSheetStatus({ '男愛伴航2保費': [['Age', 'Rate']] }), [{ name: '男愛伴航2保費', rows: 1, columns: 2, status: 'VERIFY REQUIRED' }]);
  assert.deepEqual(resourceStatus([{ resource_ref: 'firebase/ref' }, { content_type: 'brochure' }]), { total: 2, linked: 1, unlinked: 1 });
  assert.deepEqual(redactOfficialValue({ display_name: 'SCE', password: 'hidden', nested: { token: 'hidden' } }), { display_name: 'SCE', nested: {} });
});
