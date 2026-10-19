import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STORAGE_POLICY, storagePolicyDecision } from '../src/integration/storage-policy.js';

const media = { size: 1024, contentType: 'application/pdf' };
const admin = { token: { avaAdmin: true } };
const userA = { token: { avaUserScope: 'ava-user-a-123' } };
const userB = { token: { avaUserScope: 'ava-user-b-456' } };
const officialPath = 'critical-illness/official/OYS2/product/diseases/1_guide.pdf';
const userPathA = 'critical-illness/users/ava-user-a-123/OYS2/OYS2_CASE_001/1_case.pdf';
const userPathB = 'critical-illness/users/ava-user-b-456/OYS2/OYS2_CASE_001/1_case.pdf';

test('Storage policy allows public Official read and validated media write', () => {
  assert.equal(storagePolicyDecision({ operation: 'read', path: officialPath }).allowed, true);
  assert.equal(storagePolicyDecision({ operation: 'create', path: officialPath, resource: media }).allowed, true);
});

test('Storage policy denies Official delete regardless of caller', () => {
  assert.equal(storagePolicyDecision({ operation: 'delete', path: officialPath, auth: userA }).allowed, false);
  assert.equal(storagePolicyDecision({ operation: 'delete', path: officialPath, auth: admin }).allowed, false);
});

test('Storage policy binds User reads and writes to the exact opaque User scope', () => {
  assert.equal(storagePolicyDecision({ operation: 'read', path: userPathA, auth: userA }).allowed, true);
  assert.equal(storagePolicyDecision({ operation: 'create', path: userPathA, auth: userA, resource: media }).allowed, true);
  assert.equal(storagePolicyDecision({ operation: 'read', path: userPathB, auth: userA }).allowed, false);
  assert.equal(storagePolicyDecision({ operation: 'create', path: userPathB, auth: userA, resource: media }).allowed, false);
});

test('Storage policy rejects oversized and unsupported media', () => {
  assert.equal(storagePolicyDecision({ operation: 'create', path: officialPath, auth: admin, resource: { size: STORAGE_POLICY.maxBytes + 1, contentType: 'application/pdf' } }).allowed, false);
  assert.equal(storagePolicyDecision({ operation: 'create', path: officialPath, auth: admin, resource: { size: 10, contentType: 'application/javascript' } }).allowed, false);
});

test('versioned rules artifact expresses the same security boundaries', () => {
  const rules = fs.readFileSync('firebase/storage.rules', 'utf8');
  assert.match(rules, /allow read: if true/);
  assert.match(rules, /request\.auth\.token\.avaUserScope == userScope/);
  assert.doesNotMatch(rules, /avaAdmin/);
  assert.match(rules, /20 \* 1024 \* 1024/);
  assert.match(rules, /application\/pdf/);
  assert.match(rules, /image\/webp/);
  assert.doesNotMatch(rules, /allow read, write: if true/);
  assert.match(rules, /allow create, update: if validMedia\(\)/);
  assert.match(rules, /allow delete: if false/);
  assert.match(rules, /allow write: if false/);
});
