import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { claimCaseResourcesForProduct, diseaseResourcesForProduct, productBrochureForProduct } from '../src/data/content.js';
import { createMemoryStorage, loadUserState, saveUserState } from '../src/data/storage.js';
import { FIREBASE_UPLOAD_ENABLED, officialResourcePath } from '../src/integration/firebase-media.js';
import { USER_RESOURCE_RUNTIME_BLOCKED, canonicalUserScope, removeUserResourceOverride, resolveEffectiveResource, userResourceCapability, userResourcePath } from '../src/domain/resource-layer.js';
import { USER_STORAGE_AUTH_STATE } from '../src/integration/firebase-media.js';

const bindingA = { opaqueUserScope: 'ava-user-a-123' };
const bindingB = { opaqueUserScope: 'ava-user-b-456' };
const official = { content_id: 'OYS2_CASE_001', plan_id: 'OYS2', content_type: 'claim_case', category: 'claims', title: '官方案例', resource_type: 'pdf', resource_ref: 'https://cdn.example/official.pdf', enabled: true };
const override = { resourceId: 'OYS2_CASE_001', ownerScope: bindingA.opaqueUserScope, providerId: 'approved-user-cloud', plan_id: 'OYS2', content_type: 'claim_case', category: 'claims', title: '我的案例', resource_type: 'pdf', resource_ref: 'https://cdn.example/user-a.pdf', enabled: true };

test('Official exists and no User override resolves to Official', () => {
  assert.equal(resolveEffectiveResource({ officialResource: official, userBinding: bindingA }).source, 'official');
});

test('User override resolves only for its canonical opaque User binding', () => {
  assert.equal(resolveEffectiveResource({ officialResource: official, userOverride: override, userBinding: bindingA }).source, 'user');
  assert.equal(resolveEffectiveResource({ officialResource: official, userOverride: override, userBinding: bindingB }).source, 'official');
});

test('removing a User override reveals Official without changing Official data', () => {
  const officialBefore = structuredClone(official);
  const remaining = removeUserResourceOverride([override], { resourceId: official.content_id, userBinding: bindingA });
  assert.deepEqual(remaining, []);
  assert.deepEqual(official, officialBefore);
  assert.equal(resolveEffectiveResource({ officialResource: official, userBinding: bindingA }).resourceReference, official.resource_ref);
});

test('User A cannot resolve User B resource and identity is not derived from filename or display name', () => {
  assert.equal(canonicalUserScope({ displayName: bindingA.opaqueUserScope }), null);
  assert.equal(resolveEffectiveResource({ officialResource: official, userOverride: { ...override, ownerScope: bindingB.opaqueUserScope }, userBinding: bindingA }).source, 'official');
  assert.throws(() => userResourcePath({ opaqueUserScope: 'Ivan Chiu', planId: 'OYS2', resourceId: official.content_id, filename: 'case.pdf' }), /binding/);
});

test('User metadata may persist references only; binary fields are not normalized', () => {
  const storage = createMemoryStorage();
  saveUserState({ resourceOverrides: [{ ...override, blob: 'must-not-persist', binary: 'must-not-persist' }] }, storage);
  const state = loadUserState(storage);
  assert.equal(state.resourceOverrides.length, 1);
  assert.equal('blob' in state.resourceOverrides[0], false);
  assert.equal('binary' in state.resourceOverrides[0], false);
});

test('layered customer resources apply User-first then Official fallback', () => {
  const content = [official, { content_id: 'OYS2_DISEASES', plan_id: 'OYS2', category: 'diseases', resource_type: 'pdf', resource_ref: 'https://cdn.example/diseases.pdf', enabled: true }, { content_id: 'OYS2_BROCHURE', plan_id: 'OYS2', content_type: 'brochure', category: 'documents', resource_type: 'pdf', resource_ref: 'https://cdn.example/brochure.pdf', enabled: true }];
  const overrideRows = [override];
  assert.equal(claimCaseResourcesForProduct(content, 'OYS2', overrideRows, bindingA)[0].source, 'user');
  assert.equal(diseaseResourcesForProduct(content, 'OYS2', 18, overrideRows, bindingA)[0].resources[0].source, 'official');
  assert.equal(productBrochureForProduct(content, 'OYS2', overrideRows, bindingA)[0].source, 'official');
});

test('no approved User cloud provider keeps User resource runtime safely blocked', () => {
  assert.equal(userResourceCapability().status, USER_RESOURCE_RUNTIME_BLOCKED);
  assert.equal(userResourceCapability({ id: 'local', saveFile() {}, replaceFile() {}, resolveFile() {}, deletePersonalFile() {}, binaryStoredInCloud: false, isUserCloudProvider: false }).status, USER_RESOURCE_RUNTIME_BLOCKED);
  assert.equal(userResourceCapability({ id: 'approved-user-cloud', saveFile() {}, replaceFile() {}, resolveFile() {}, deletePersonalFile() {}, binaryStoredInCloud: true, isUserCloudProvider: true }).status, 'AVAILABLE');
});

test('runtime capability distinguishes missing User auth configuration from the resolver contract', () => {
  assert.equal(USER_STORAGE_AUTH_STATE, 'USER_STORAGE_AUTH_CONFIG_REQUIRED');
  assert.equal(userResourceCapability().status, USER_RESOURCE_RUNTIME_BLOCKED);
});

test('Official/Admin layer remains separate while upload authenticates at runtime', () => {
  assert.equal(FIREBASE_UPLOAD_ENABLED, true);
  assert.match(officialResourcePath({ planId: 'OYS2', category: 'claims', contentId: 'OYS2_CASE_001', filename: 'case.pdf', timestamp: 1 }), /^critical-illness\/official\/OYS2\/claims\/OYS2_CASE_001\/1_case\.pdf$/);
  const source = fs.readFileSync('src/integration/firebase-media.js', 'utf8');
  assert.match(source, /adminSessionProof/);
  assert.doesNotMatch(source, /critical-illness\/users/);
});
