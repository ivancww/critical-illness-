import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CI_APP_ID, browserProofFromContext, exchangeAdminLaunch, writeOfficialData } from '../src/data/data-api.js';
import { ADMIN_SECTION_DEFINITIONS, adminPersistenceStatus, composeOfficialAndUser, createAdminWriteRequest, officialRecords, premiumSheetStatus, redactOfficialValue, resourceStatus, validateAdminWrite } from '../src/admin/official-config.js';

const app = fs.readFileSync('src/app.js', 'utf8');
const sections = fs.readFileSync('src/admin/official-config.js', 'utf8');
const gas = fs.readFileSync('gas/Code.gs', 'utf8');

test('admin entry is explicit, Platform-authorized, and separate from Front/User routes', () => {
  assert.match(app, /!\['frontend', 'user', 'admin'\]\.includes\(requestedEntry\)/);
  assert.match(app, /const canAdmin = appEntry === 'admin'/);
  assert.match(app, /exchangeAdminLaunch\(\{ launchTicket, launchNonce \}\)/);
  assert.match(app, /if \(!canAdmin \|\| !adminSessionProof\) return adminDeniedPage\(\)/);
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
  assert.deepEqual(adminPersistenceStatus(), { status: 'PLATFORM AUTH REQUIRED', reason: 'OFFICIAL WRITE REQUIRES PLATFORM ADMIN SESSION VERIFICATION', authentication: 'AVA PLATFORM UNIFIED ADMIN AUTH' });
});

test('Admin launch exchange requires browser-bound ava-admin-session-v1', async () => {
  await assert.rejects(() => exchangeAdminLaunch({ launchTicket: '', launchNonce: '' }, async () => ({})), /complete Platform Admin launch/);
  const listeners = [];
  const opener = { postMessage(message) { listeners.at(-1)?.({ source: opener, origin: 'https://ivancww.github.io', data: { type: 'ava-admin-session-response', appId: CI_APP_ID, launchTicket: message.launchTicket, launchNonce: message.launchNonce, browserProof: 'browser-proof', contract: 'ava-admin-session-v1', expiresAt: new Date(Date.now() + 60000).toISOString() } }); } };
  global.window = { opener, addEventListener: (_type, fn) => listeners.push(fn), removeEventListener: () => {} };
  const payload = await exchangeAdminLaunch({ launchTicket: 'one-time-ticket', launchNonce: 'launch-nonce' }, async (url, options) => {
    assert.equal(url, 'https://script.google.com/macros/s/AKfycbyWEzPJm1q0QG0ZXFAqGQv6WxTGj8B3EVUgnSP28ML1Y0wbPu7ZaaqUdmARG6teYYjclA/exec');
    assert.equal(options.headers['Content-Type'], 'text/plain;charset=utf-8');
    const body = JSON.parse(options.body);
    assert.deepEqual(body, { action: 'exchangeAdminSession', appId: CI_APP_ID, launchTicket: 'one-time-ticket', launchNonce: 'launch-nonce', browserProof: 'browser-proof' });
    return { ok: true, json: async () => ({ success: true, appId: CI_APP_ID, adminSessionProof: 'opaque-proof', contract: 'ava-admin-session-v1', expiresAt: new Date(Date.now() + 60000).toISOString() }) };
  });
  assert.equal(payload.adminSessionProof, 'opaque-proof');
  await assert.rejects(() => exchangeAdminLaunch({ launchTicket: 'wrong', launchNonce: 'nonce' }, async () => ({ ok: true, json: async () => ({ success: true, appId: 'other-app', adminSessionProof: 'proof', contract: 'ava-admin-session-v1', expiresAt: new Date(Date.now() + 60000).toISOString() }) })), /rejected/);
});

test('Android browsing-context proof is exact, expiring, one-time in memory, and copied URLs still fail', async () => {
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  const browserWindow = { opener: null, name: 'ava-admin-session-v1:' + JSON.stringify({ type: 'ava-admin-session-context', appId: CI_APP_ID, launchTicket: 'ticket-context', launchNonce: 'nonce-context', browserProof: 'proof-context', expiresAt, contract: 'ava-admin-session-v1' }) };
  global.window = browserWindow;
  const result = await exchangeAdminLaunch({ launchTicket: 'ticket-context', launchNonce: 'nonce-context' }, async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { action: 'exchangeAdminSession', appId: CI_APP_ID, launchTicket: 'ticket-context', launchNonce: 'nonce-context', browserProof: 'proof-context' });
    return { ok: true, json: async () => ({ success: true, appId: CI_APP_ID, adminSessionProof: 'session-context', contract: 'ava-admin-session-v1', expiresAt }) };
  });
  assert.equal(result.adminSessionProof, 'session-context');
  assert.equal(browserWindow.name, '', 'proof is removed from the browsing context before network exchange');
  assert.equal(browserProofFromContext('ticket-context', 'nonce-context', { name: '' }), null);
  await assert.rejects(() => exchangeAdminLaunch({ launchTicket: 'copied-ticket', launchNonce: 'copied-nonce' }, async () => { throw new Error('must not fetch'); }), /originate from AVA Studio/);
  assert.throws(() => browserProofFromContext('ticket-context', 'nonce-context', { name: 'ava-admin-session-v1:' + JSON.stringify({ type: 'ava-admin-session-context', appId: 'other-app', launchTicket: 'ticket-context', launchNonce: 'nonce-context', browserProof: 'x', expiresAt, contract: 'ava-admin-session-v1' }) }), /Invalid or expired/);
});

test('official updates compose with User Overrides without resetting User-owned data', () => {
  const user = { pagePreferences: { introTitle: '我的標題', showIntro: false }, overrides: { presentation: { mode: 'presentation' } }, pages: [{ id: 'personal-page', sortOrder: 2, visible: false, content: '自訂內容' }] };
  const before = composeOfficialAndUser({ presentationDefaults: { introTitle: 'Official A', introSubtitle: 'Official subtitle' }, Plans: [{ plan_id: 'p1', active: true }] }, user);
  const after = composeOfficialAndUser({ presentationDefaults: { introTitle: 'Official C', introSubtitle: 'Official subtitle 2' }, Plans: [{ plan_id: 'p1', active: false }] }, user);
  assert.equal(before.presentation.introTitle, '我的標題');
  assert.equal(after.presentation.introTitle, '我的標題');
  assert.equal(after.presentation.showIntro, false);
  assert.deepEqual(after.presentationSettings, { mode: 'presentation' });
  assert.deepEqual(after.pages, user.pages);
  assert.equal(after.official.Plans[0].active, false);
  assert.equal(after.userOverride, user);
});

test('Admin write contract is allowlisted, versioned, and never reports cloud success', () => {
  assert.deepEqual(createAdminWriteRequest({ dataset: 'Plans', recordId: 'p1', expectedVersion: 'v2', fields: { plan_name: 'Updated', active: false } }), {
    action: 'adminUpdate', dataset: 'Plans', recordId: 'p1', expectedVersion: 'v2', fields: { plan_name: 'Updated', active: false }
  });
  assert.throws(() => validateAdminWrite({ dataset: 'Plans', recordId: 'p1', expectedVersion: 'v2', fields: { premium_rate: 1 } }), /Unknown or protected/);
  assert.throws(() => validateAdminWrite({ dataset: 'Plans', recordId: 'p1', expectedVersion: 'v2', fields: { unknown_field: true } }), /Unknown or protected/);
  assert.throws(() => validateAdminWrite({ dataset: 'Plans', recordId: 'p1', expectedVersion: 'v2', fields: { active: 'false' } }), /must be boolean/);
  assert.throws(() => validateAdminWrite({ dataset: 'Settings_Versions', recordId: 'versions', expectedVersion: 'v2', fields: { monthly_premium_factor: 1.06 } }), /Unknown or protected/);
  assert.throws(() => createAdminWriteRequest({ dataset: 'Plans', recordId: 'p1', fields: { active: false } }), /expected dataset version/);
});

test('GAS write client requires confirmed success and never reports a failed write as saved', async () => {
  const request = createAdminWriteRequest({ dataset: 'Plans', recordId: 'p1', expectedVersion: '1', fields: { plan_name: 'Updated' } });
  const success = await writeOfficialData(request, 'opaque-proof', async (url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, undefined);
    assert.equal(options.headers['Content-Type'], 'text/plain;charset=utf-8');
    assert.deepEqual(JSON.parse(options.body), { ...request, adminSessionProof: 'opaque-proof', appId: CI_APP_ID, operation: 'critical-illness:official-write:Plans' });
    return { ok: true, json: async () => ({ status: 'success', data: { dataset: 'Plans', recordId: 'p1', recordVersion: '2', datasetVersion: '1.0.1' } }) };
  });
  assert.equal(success.datasetVersion, '1.0.1');
  await assert.rejects(() => writeOfficialData(request, 'opaque-proof', async () => ({ ok: true, json: async () => ({ status: 'error', code: 'VERSION_CONFLICT' }) })), /did not confirm/);
  await assert.rejects(() => writeOfficialData(request, 'opaque-proof', async () => ({ ok: false, status: 409, json: async () => ({}) })), /GAS write failed/);
  await assert.rejects(() => writeOfficialData(request, '', async () => ({ ok: true, json: async () => ({}) })), /Admin session proof is required/);
  await assert.rejects(() => writeOfficialData(request, { value: 'opaque-proof' }, async () => ({ ok: true, json: async () => ({}) })), /Admin session proof is required/);
});

test('deployed GAS source implements only the browser-bound unified Admin session contract', () => {
  assert.match(gas, /action === 'exchangeAdminSession'/);
  assert.match(gas, /action: 'exchangeAdminSession'/);
  assert.match(gas, /action: 'verifyAdminSession'/);
  assert.match(gas, /adminSessionProof/);
  assert.match(gas, /ava-admin-session-v1/);
  assert.doesNotMatch(gas, /action === 'exchangeAppLaunch'/);
  assert.doesNotMatch(gas, /action: 'verifyAppGrant'/);
});

test('Admin save path refreshes Official cache only after confirmed write and never saves User state', () => {
  assert.match(app, /await writeOfficialData\(request, adminSessionProof\)/);
  assert.match(app, /validateOfficialData\(normalized\); state\.official = normalized; saveOfficialCache\(normalized\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function bindAdmin()'), app.indexOf('function adminPage()')), /saveUserState|persistUser/);
});

test('official records retain product history, verify premium mappings, and protect secrets', () => {
  const structured = { Plans: [{ plan_id: 'old', active: false }], Claim_Rules: [{ plan_id: 'oys2', rule_type: 'continuing' }] };
  assert.deepEqual(officialRecords(structured, 'Plans'), [{ plan_id: 'old', active: false }]);
  assert.deepEqual(officialRecords(structured, 'Claim_Rules'), [{ plan_id: 'oys2', rule_type: 'continuing' }]);
  assert.deepEqual(premiumSheetStatus({ '男愛伴航2保費': [['Age', 'Rate']] }), [{ name: '男愛伴航2保費', rows: 1, columns: 2, status: 'VERIFY REQUIRED' }]);
  assert.deepEqual(resourceStatus([{ resource_ref: 'firebase/ref' }, { content_type: 'brochure' }]), { total: 2, linked: 1, unlinked: 1 });
  assert.deepEqual(redactOfficialValue({ display_name: 'SCE', password: 'hidden', nested: { token: 'hidden' } }), { display_name: 'SCE', nested: {} });
});
