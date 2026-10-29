import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshOfficialData } from '../src/data/data-api.js';

// Synthetic fixtures, not product rates.
const structured = { Plans: [{ plan_id: 'fixture' }], Benefits: [], Claim_Rules: [], Health_Program: [], Product_Content: [], Settings_Versions: [] };
const matrices = Object.fromEntries(['OYS2_MALE', 'OYS2_FEMALE', 'SCE_MALE', 'SCE_FEMALE'].map(k => {
  const gender = k.endsWith('FEMALE') ? 'Female' : 'Male';
  return [k, k.startsWith('SCE') ? [[`Simple Care Essence - ${gender} (per hk$7800)`], ['Age', 'Non-Smoker', 'Smoker'], [30, 123, 150]] : [[`OYS2 Premium Rate Table (Per hk$7800) - ${gender}`], ['Age', '10-Year Pay', '', '18-Year Pay', '', '25-Year Pay', ''], ['', 'Non-Smoker', 'Smoker', 'Non-Smoker', 'Smoker', 'Non-Smoker', 'Smoker'], [30, 123, 150, 100, 120, 90, 110]]];
}));
const response = data => ({ ok: true, json: async () => ({ success: true, data }) });
const fetcher = (a, b) => async url => { const value = url.searchParams.get('action') === 'all' ? a : b; if (value instanceof Error) throw value; return value; };
const old = { structured, premium: { old: 'preserved' }, fetchedAt: 'old', freshness: { structured: { fetchedAt: 'old' }, premium: { fetchedAt: 'old' } } };
const now = () => 'new';

test('independent requests preserve old data and report freshness per dataset', async () => {
  for (const [a,b,sa,sb] of [[response(structured),response(matrices),'fresh','fresh'],[response(structured),new Error(),'fresh','stale'],[new Error(),response(matrices),'stale','fresh'],[new Error(),new Error(),'stale','stale']]) {
    const actual = await refreshOfficialData(old, fetcher(a,b), now);
    assert.equal(actual.freshness.structured.status,sa); assert.equal(actual.freshness.premium.status,sb);
    if (sb === 'stale') { assert.deepEqual(actual.premium,old.premium); assert.equal(actual.freshness.premium.fetchedAt,'old'); }
    if (sa === 'stale') assert.deepEqual(actual.structured,old.structured);
    assert.equal(actual.freshness.versionMatched,false);
    if (sa !== 'fresh' || sb !== 'fresh') assert.equal(actual.fetchedAt,'old');
  }
});

test('invalid JSON, schema and empty matrices never overwrite cache', async () => {
  const invalidJson = { ok: true, json: async () => { throw new SyntaxError(); } };
  for (const [bad,code] of [[invalidJson,'INVALID_JSON'],[response({}),'PREMIUM_MATRIX_MISSING'],[response({ ...matrices, SCE_MALE: [] }),'PREMIUM_MATRIX_MISSING']]) {
    const data = await refreshOfficialData(old, fetcher(response(structured),bad), now);
    assert.deepEqual(data.premium,old.premium); assert.equal(data.freshness.premium.error,code);
  }
  const badStructured = await refreshOfficialData(old,fetcher(response({Plans:[]}),response(matrices)),now);
  assert.equal(badStructured.freshness.structured.error,'SCHEMA_MISMATCH');
  assert.deepEqual(badStructured.structured,old.structured);
});

test('swapped matrices fail safely; a later retry restores fresh data', async () => {
  const bad = { ...matrices, SCE_MALE: matrices.SCE_FEMALE };
  const failed = await refreshOfficialData(old, fetcher(response(structured), response(bad)), now);
  assert.equal(failed.freshness.premium.error, 'SCHEMA_MISMATCH');
  assert.deepEqual(failed.premium, old.premium);
  const retried = await refreshOfficialData(failed, fetcher(response(structured), response(matrices)), () => 'retry');
  assert.equal(retried.freshness.premium.status, 'fresh');
  assert.equal(retried.freshness.premium.fetchedAt, 'retry');
});
test('HTTP and GAS errors are distinct and missing fetch time is not borrowed', async () => {
  const prior = { ...old, fetchedAt: 'other', freshness: { structured: { fetchedAt: 'other' }, premium: {} } };
  const http = await refreshOfficialData(prior, fetcher(response(structured), {ok:false,status:503}), now);
  assert.equal(http.freshness.premium.error, 'HTTP_ERROR');
  assert.equal(http.freshness.premium.fetchedAt, null);
  const gas = await refreshOfficialData(old, fetcher(response(structured), {ok:true,json:async()=>({success:false})}), now);
  assert.equal(gas.freshness.premium.error, 'GAS_REMOTE_ERROR');
});
