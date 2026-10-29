export const GAS_DATA_API_URL = 'https://script.google.com/macros/s/AKfycbyWEzPJm1q0QG0ZXFAqGQv6WxTGj8B3EVUgnSP28ML1Y0wbPu7ZaaqUdmARG6teYYjclA/exec';
export const CI_APP_ID = 'critical-illness';

export const PREMIUM_SOURCE_NAMES = Object.freeze({
  OYS2_MALE: '男愛伴航2保費',
  OYS2_FEMALE: '女愛伴航2保費',
  SCE_MALE: '男簡護危疾保保費',
  SCE_FEMALE: '女簡護危疾保保費'
});

export class DataApiError extends Error {
  constructor(message, code = 'DATA_API_ERROR') {
    super(message);
    this.name = 'DataApiError';
    this.code = code;
  }
}

function parseResponse(payload) {
  if (!payload || typeof payload !== 'object') throw new DataApiError('GAS returned an invalid response.', 'INVALID_RESPONSE');
  if (payload.status && payload.status !== 'success') throw new DataApiError(payload.message || 'GAS returned an error.', 'REMOTE_ERROR');
  return payload.data && typeof payload.data === 'object' ? payload.data : payload;
}

export async function fetchDataset(action = 'all', fetchImpl = fetch) {
  const url = new URL(GAS_DATA_API_URL);
  if (action) url.searchParams.set('action', action);
  let response;
  try { response = await fetchImpl(url, { cache: 'no-store', headers: { Accept: 'application/json' } }); }
  catch (_) { throw new DataApiError(`${action}: 網絡、CORS 或重新導向失敗`, 'NETWORK_OR_CORS_ERROR'); }
  if (!response.ok) throw new DataApiError(`${action}: HTTP ${response.status}`, 'HTTP_ERROR');
  let payload;
  try { payload = await response.json(); } catch (_) { throw new DataApiError(`${action}: 回應不是有效 JSON`, 'INVALID_JSON'); }
  if (payload?.success === false) throw new DataApiError(`${action}: GAS 回報錯誤`, 'GAS_REMOTE_ERROR');
  return parseResponse(payload);
}

const STRUCTURED_KEYS = ['Plans', 'Benefits', 'Claim_Rules', 'Health_Program', 'Product_Content', 'Settings_Versions'];
function validateStructuredPayload(data) {
  if (!data || STRUCTURED_KEYS.some(key => !Array.isArray(data[key])) || !data.Plans.length)
    throw new DataApiError('官方方案資料格式不完整', 'SCHEMA_MISMATCH');
  return data;
}
function validatePremiumPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new DataApiError('保費資料格式不正確', 'SCHEMA_MISMATCH');
  for (const key of Object.keys(PREMIUM_SOURCE_NAMES)) {
    const raw = data[key]; const values = Array.isArray(raw) ? raw : raw?.values;
    if (!Array.isArray(values) || !values.some(row => Array.isArray(row) && row.length > 1 && row[0] !== '' && Number.isInteger(Number(row[0])) && row.slice(1, 7).some(n => Number(n) > 0)))
      throw new DataApiError(`保費表 ${key} 缺少有效資料`, 'PREMIUM_MATRIX_MISSING');
  }
  return normalizePremiumData(data);
}

// Per-dataset timestamps do not imply an atomic, version-matched snapshot.
export async function refreshOfficialData(previous = null, fetchImpl = fetch, now = () => new Date().toISOString()) {
  const outcomes = await Promise.allSettled([
    fetchDataset('all', fetchImpl).then(validateStructuredPayload),
    fetchDataset('premiumSheets', fetchImpl).then(validatePremiumPayload)
  ]);
  const keys = ['structured', 'premium'];
  const result = { ...(previous || {}), freshness: { ...(previous?.freshness || {}) } };
  keys.forEach((key, i) => {
    const outcome = outcomes[i];
    if (outcome.status === 'fulfilled') {
      result[key] = outcome.value;
      result.freshness[key] = { status: 'fresh', fetchedAt: now(), error: null };
    } else {
      result.freshness[key] = { status: result[key] ? 'stale' : 'unavailable', fetchedAt: previous?.freshness?.[key]?.fetchedAt || previous?.fetchedAt || null, error: outcome.reason?.code || 'NETWORK_ERROR' };
    }
  });
  result.freshness.versionMatched = false; // GAS premium response carries no matching snapshot identity.
  if (outcomes.every(o => o.status === 'fulfilled')) result.fetchedAt = now();
  return result;
}

export async function loadOfficialData(fetchImpl = fetch) {
  const data = await refreshOfficialData(null, fetchImpl);
  const failure = Object.values(data.freshness).find(item => item && typeof item === 'object' && item.status !== 'fresh');
  if (failure) throw new DataApiError('官方資料未能完整載入', failure.error);
  return data;
}

// GAS readPremium_ returns each premium sheet directly as a matrix. Keep the
// source name explicit in the browser-owned normalized shape so presentation
// code does not infer it from a display label or from matrix contents.
export function normalizePremiumData(premium = {}) {
  return Object.fromEntries(Object.entries(PREMIUM_SOURCE_NAMES).map(([key, sheetName]) => {
    const raw = premium?.[key];
    const values = Array.isArray(raw) ? raw : Array.isArray(raw?.values) ? raw.values : [];
    return [key, { sheetName, values }];
  }));
}

const PLATFORM_ORIGIN = 'https://ivancww.github.io';
const BROWSER_CONTEXT_PREFIX = 'ava-admin-session-v1:';

export function browserProofFromContext(launchTicket, launchNonce, browserWindow = globalThis.window) {
  let raw = '';
  try { raw = String(browserWindow?.name || ''); browserWindow.name = ''; } catch (_) { return null; }
  if (!raw.startsWith(BROWSER_CONTEXT_PREFIX)) return null;
  let data;
  try { data = JSON.parse(raw.slice(BROWSER_CONTEXT_PREFIX.length)); }
  catch (_) { throw new DataApiError('Invalid AVA browser proof.', 'ADMIN_BROWSER_BINDING_INVALID'); }
  const expiry = Date.parse(data?.expiresAt || '');
  if (data?.type !== 'ava-admin-session-context' || data.appId !== CI_APP_ID || data.launchTicket !== launchTicket || data.launchNonce !== launchNonce || !data.browserProof || data.contract !== 'ava-admin-session-v1' || !Number.isFinite(expiry) || expiry <= Date.now()) throw new DataApiError('Invalid or expired AVA browser proof.', 'ADMIN_BROWSER_BINDING_INVALID');
  return data;
}

function requestBrowserProof(launchTicket, launchNonce) {
  if (!launchTicket || !launchNonce) throw new DataApiError('Admin launch must originate from AVA Studio.', 'ADMIN_BROWSER_BINDING_REQUIRED');
  const contextProof = browserProofFromContext(launchTicket, launchNonce);
  if (contextProof) return Promise.resolve(contextProof);
  if (!globalThis.window?.opener) throw new DataApiError('Admin launch must originate from AVA Studio.', 'ADMIN_BROWSER_BINDING_REQUIRED');
  return new Promise((resolve, reject) => {
    const opener = globalThis.window.opener; let settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); window.removeEventListener('message', onMessage); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => finish(new DataApiError('AVA browser binding expired.', 'ADMIN_BROWSER_BINDING_EXPIRED')), 15000);
    const onMessage = event => {
      if (event.source !== opener || event.origin !== PLATFORM_ORIGIN) return;
      const data = event.data || {};
      if (data.type !== 'ava-admin-session-response' || data.appId !== CI_APP_ID || data.launchTicket !== launchTicket || data.launchNonce !== launchNonce) return;
      if (!data.browserProof || data.contract !== 'ava-admin-session-v1') return finish(new DataApiError('Invalid AVA browser proof.', 'ADMIN_BROWSER_BINDING_INVALID'));
      finish(null, data);
    };
    window.addEventListener('message', onMessage);
    opener.postMessage({ type: 'ava-admin-session-request', appId: CI_APP_ID, launchTicket, launchNonce }, PLATFORM_ORIGIN);
  });
}

export async function exchangeAdminLaunch({ launchTicket, launchNonce }, fetchImpl = fetch) {
  if (!launchTicket || !launchNonce) throw new DataApiError('A complete Platform Admin launch is required.', 'ADMIN_LAUNCH_REQUIRED');
  const browser = await requestBrowserProof(launchTicket, launchNonce);
  const response = await fetchImpl(GAS_DATA_API_URL, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'exchangeAdminSession', appId: CI_APP_ID, launchTicket, launchNonce, browserProof: browser.browserProof }) });
  if (!response.ok) throw new DataApiError('Admin authorization exchange failed (' + response.status + ').', 'ADMIN_EXCHANGE_HTTP_ERROR');
  const envelope = await response.json(); const expiry = Date.parse(envelope?.expiresAt || '');
  if (!envelope || envelope.success !== true || envelope.appId !== CI_APP_ID || envelope.contract !== 'ava-admin-session-v1' || typeof envelope.adminSessionProof !== 'string' || !envelope.adminSessionProof.trim() || !Number.isFinite(expiry) || expiry <= Date.now()) throw new DataApiError(envelope?.error || 'Admin authorization was rejected.', 'ADMIN_UNAUTHORIZED');
  return { adminSessionProof: envelope.adminSessionProof, expiresAt: envelope.expiresAt, contract: envelope.contract };
}

export async function writeOfficialData(request, adminSessionProof, fetchImpl = fetch) {
  if (typeof adminSessionProof !== 'string' || !adminSessionProof.trim()) throw new DataApiError('A valid Platform Admin session proof is required.', 'ADMIN_PROOF_REQUIRED');
  const dataset = String(request?.dataset || '').trim(); if (!dataset) throw new DataApiError('An Official dataset is required.', 'INVALID_DATASET');
  const response = await fetchImpl(GAS_DATA_API_URL, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...request, adminSessionProof, appId: CI_APP_ID, operation: CI_APP_ID + ':official-write:' + dataset }) });
  if (!response.ok) throw new DataApiError('GAS write failed (' + response.status + ').', 'WRITE_HTTP_ERROR');
  const envelope = await response.json();
  const data = envelope?.data && typeof envelope.data === 'object' ? envelope.data : null;
  const idFields = { Plans: 'plan_id', Benefits: 'benefit_id', Claim_Rules: 'rule_id', Health_Program: 'health_rule_id', Product_Content: 'content_id', Settings_Versions: 'setting_key' };
  const fields = request?.fields && typeof request.fields === 'object' ? request.fields : request?.patch;
  const expectedVersion = String(request?.expectedVersion ?? '');
  const expectedNextVersion = /^\d+$/.test(expectedVersion) ? String(Number(expectedVersion) + 1) : '';
  const idField = idFields[dataset];
  const returnedRecordId = data?.record && idField ? data.record[idField] : undefined;
  const fieldsVerified = Boolean(data?.record && fields && typeof fields === 'object' && !Array.isArray(fields) && Object.keys(fields).every(key => Object.prototype.hasOwnProperty.call(data.record, key) && valuesMatch(data.record[key], fields[key])));
  const verifiedFieldNames = Array.isArray(data?.verifiedFields) && fields ? Object.keys(fields).length === data.verifiedFields.length && Object.keys(fields).every(key => data.verifiedFields.includes(key)) : false;
  const datasetVersionVerified = dataset === 'Settings_Versions'
    ? Boolean(fields && Object.prototype.hasOwnProperty.call(fields, 'setting_value') && String(data?.datasetVersion ?? '') === String(fields.setting_value) && String(data?.record?.setting_value ?? '') === String(fields.setting_value))
    : typeof data?.datasetVersion === 'string' && data.datasetVersion.length > 0;
  const confirmed = envelope && envelope.success === true && data && idField && data.dataset === dataset && data.record && String(returnedRecordId ?? '') === String(request.recordId) && expectedNextVersion && String(data.recordVersion || '') === expectedNextVersion && fieldsVerified && verifiedFieldNames && datasetVersionVerified && data.authoritative === true && data.readAfterWrite === true && data.persisted === true && data.rollback && data.rollback.attempted === false && data.rollback.success === true;
  if (!confirmed) throw new DataApiError(envelope?.error?.message || envelope?.error || 'GAS did not return complete persisted Official evidence.', 'WRITE_NOT_CONFIRMED');
  return data;
}

function valuesMatch(actual, expected) {
  if (expected === null || expected === undefined) return actual === null || actual === undefined || actual === '';
  if (typeof expected === 'boolean') return actual === expected;
  if (typeof expected === 'number') return Number(actual) === expected;
  return String(actual) === String(expected);
}

export function validateOfficialData(data) {
  const structured = data?.structured ?? {};
  const required = ['Plans', 'Benefits', 'Claim_Rules', 'Health_Program', 'Product_Content', 'Settings_Versions'];
  const missing = required.filter(key => !(key in structured));
  if (missing.length) throw new DataApiError(`Missing official datasets: ${missing.join(', ')}`, 'MISSING_DATASET');
  if (!data.premium || typeof data.premium !== 'object') throw new DataApiError('Premium matrices are unavailable.', 'MISSING_PREMIUM_DATA');
  return true;
}

export function normalizeStructuredData(structured = {}) {
  const pick = (name, alternate) => structured[name] ?? structured[alternate] ?? [];
  return {
    Plans: pick('Plans', 'plans'),
    Benefits: pick('Benefits', 'benefits'),
    Claim_Rules: pick('Claim_Rules', 'claim_rules'),
    Health_Program: pick('Health_Program', 'health_program'),
    Product_Content: pick('Product_Content', 'product_content'),
    Settings_Versions: pick('Settings_Versions', 'settings_versions'),
    _meta: structured._meta && typeof structured._meta === 'object' ? structured._meta : {}
  };
}
