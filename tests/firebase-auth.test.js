import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIREBASE_CLAIM_CONTRACT, OFFICIAL_STORAGE_AUTH_CONFIG_REQUIRED, USER_STORAGE_AUTH_CONFIG_REQUIRED, createFirebaseAuthAdapter, firebaseAuthorizationRequest, requestFirebaseAuthorization } from '../src/integration/firebase-auth.js';
import { createFirebaseUserCloudProvider } from '../src/integration/firebase-user-media.js';

const adminProof = 'ava-admin-session-proof';
const userBinding = { opaqueUserScope: 'ava-user-a-123', bindingProof: 'ava-user-binding-proof' };

test('Firebase authorization request uses server-side bridge and never carries private credentials', () => {
  const request = firebaseAuthorizationRequest({ mode: 'admin', adminSessionProof: adminProof });
  assert.equal(request.action, 'issueFirebaseAuthorization');
  assert.equal(request.contract, FIREBASE_CLAIM_CONTRACT.version);
  assert.equal(request.adminSessionProof, adminProof);
  assert.equal('serviceAccountJson' in request, false);
  assert.equal('privateKey' in request, false);
  assert.throws(() => firebaseAuthorizationRequest({ mode: 'user', userBinding: { opaqueUserScope: userBinding.opaqueUserScope } }), error => error.code === USER_STORAGE_AUTH_CONFIG_REQUIRED);
});

test('missing Firebase bridge fails closed with explicit capability states', async () => {
  const fetchImpl = async () => ({ ok: false, json: async () => ({ success: false, error: { code: 'FIREBASE_AUTH_CONFIGURATION_REQUIRED', message: 'not configured' } }) });
  await assert.rejects(() => requestFirebaseAuthorization({ mode: 'admin', adminSessionProof: adminProof, fetchImpl, endpoint: 'https://example.test/ci' }), error => error.code === OFFICIAL_STORAGE_AUTH_CONFIG_REQUIRED || error.code === 'FIREBASE_AUTH_CONFIGURATION_REQUIRED');
});

test('valid server grant authenticates without introducing a second visible login', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ success: true, data: { firebaseCustomToken: 'short-lived-token', expiresAt: new Date(Date.now() + 60000).toISOString(), claims: { avaAdmin: true } } }) });
  const authSdk = { signInWithCustomToken: async (_auth, token) => ({ user: { token } }), signOut: async () => {} };
  const adapter = createFirebaseAuthAdapter({ authSdk, auth: {}, fetchImpl, endpoint: 'https://example.test/ci' });
  const state = await adapter.authenticate({ mode: 'admin', adminSessionProof: adminProof });
  assert.equal(state.status, 'AUTHENTICATED');
  assert.equal(state.claims.avaAdmin, true);
});


test('User provider exposes cloud-only save/replace/resolve/delete operations', async () => {
  const calls = [];
  const storageSdk = {
    ref: (_storage, path) => ({ path }),
    uploadBytes: async (ref, file, metadata) => { calls.push(['upload', ref.path, metadata]); return { ref }; },
    getDownloadURL: async ref => 'https://storage.test/' + ref.path,
    deleteObject: async ref => { calls.push(['delete', ref.path]); }
  };
  const provider = createFirebaseUserCloudProvider({ storageSdk, storage: {}, userBinding, authAdapter: { currentState: () => ({ status: 'AUTHENTICATED', claims: { avaUserScope: userBinding.opaqueUserScope } }) } });
  const saved = await provider.saveFile({ planId: 'OYS2', resourceId: 'CASE_001', file: { type: 'image/png', size: 12, name: 'case.png' }, timestamp: 9 });
  assert.equal(provider.isUserCloudProvider, true);
  assert.match(saved.cloudFileRef, /critical-illness\/users\/ava-user-a-123\/OYS2\/CASE_001\/9_case\.png$/);
  assert.equal((await provider.replaceFile({ planId: 'OYS2', resourceId: 'CASE_001', file: { type: 'image/png', size: 12, name: 'new.png' }, timestamp: 10 })).ownerScope, userBinding.opaqueUserScope);
  assert.equal((await provider.resolveFile('critical-illness/users/ava-user-a-123/OYS2/CASE_001/9_case.png')).includes('critical-illness/users/ava-user-a-123'), true);
  await provider.deleteFile('critical-illness/users/ava-user-a-123/OYS2/CASE_001/9_case.png');
  assert.equal(calls.filter(call => call[0] === 'delete').length, 1);
});

test('server bridge and rules artifacts contain no public-write or private browser credential path', () => {
  const gas = fs.readFileSync('gas/Code.gs', 'utf8');
  const auth = fs.readFileSync('src/integration/firebase-auth.js', 'utf8');
  assert.match(gas, /issueFirebaseAuthorization_/);
  assert.match(gas, /CI_FIREBASE_AUTH_BROKER_SECRET/);
  assert.doesNotMatch(auth, /serviceAccount|privateKey|firebase-admin/i);
  assert.doesNotMatch(gas, /allow read, write: if true/);
});
