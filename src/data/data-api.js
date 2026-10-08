export const GAS_DATA_API_URL = 'https://script.google.com/macros/s/AKfycbyWEzPJm1q0QG0ZXFAqGQv6WxTGj8B3EVUgnSP28ML1Y0wbPu7ZaaqUdmARG6teYYjclA/exec';
export const CI_APP_ID = 'critical-illness';

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
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new DataApiError(`GAS request failed (${response.status}).`, 'HTTP_ERROR');
  return parseResponse(await response.json());
}

export async function loadOfficialData(fetchImpl = fetch) {
  const [structured, premium] = await Promise.all([
    fetchDataset('all', fetchImpl),
    fetchDataset('premiumSheets', fetchImpl)
  ]);
  return { structured, premium, fetchedAt: new Date().toISOString() };
}

const PLATFORM_ORIGIN = 'https://ivancww.github.io';

function requestBrowserProof(launchTicket, launchNonce) {
  if (!launchTicket || !launchNonce || !globalThis.window?.opener) throw new DataApiError('Admin launch must originate from AVA Studio.', 'ADMIN_BROWSER_BINDING_REQUIRED');
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
  const response = await fetchImpl(GAS_DATA_API_URL, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'exchangeAdminSession', appId: CI_APP_ID, launchTicket, launchNonce, browserProof: browser.browserProof }) });
  if (!response.ok) throw new DataApiError('Admin authorization exchange failed (' + response.status + ').', 'ADMIN_EXCHANGE_HTTP_ERROR');
  const envelope = await response.json(); const expiry = Date.parse(envelope?.expiresAt || '');
  if (!envelope || envelope.success !== true || envelope.appId !== CI_APP_ID || envelope.contract !== 'ava-admin-session-v1' || typeof envelope.adminSessionProof !== 'string' || !envelope.adminSessionProof.trim() || !Number.isFinite(expiry) || expiry <= Date.now()) throw new DataApiError(envelope?.error || 'Admin authorization was rejected.', 'ADMIN_UNAUTHORIZED');
  return { adminSessionProof: envelope.adminSessionProof, expiresAt: envelope.expiresAt, contract: envelope.contract };
}

export async function writeOfficialData(request, adminSessionProof, fetchImpl = fetch) {
  if (typeof adminSessionProof !== 'string' || !adminSessionProof.trim()) throw new DataApiError('A valid Platform Admin session proof is required.', 'ADMIN_PROOF_REQUIRED');
  const dataset = String(request?.dataset || '').trim(); if (!dataset) throw new DataApiError('An Official dataset is required.', 'INVALID_DATASET');
  const response = await fetchImpl(GAS_DATA_API_URL, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, adminSessionProof, appId: CI_APP_ID, operation: CI_APP_ID + ':official-write:' + dataset }) });
  if (!response.ok) throw new DataApiError('GAS write failed (' + response.status + ').', 'WRITE_HTTP_ERROR');
  const envelope = await response.json();
  if (!envelope || envelope.success !== true && envelope.status !== 'success') throw new DataApiError(envelope?.error || 'GAS did not confirm the official update.', 'WRITE_NOT_CONFIRMED');
  return envelope.data && typeof envelope.data === 'object' ? envelope.data : envelope;
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
    Settings_Versions: pick('Settings_Versions', 'settings_versions')
  };
}
