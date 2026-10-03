export const GAS_DATA_API_URL = 'https://script.google.com/macros/s/AKfycbzhPpniIRnXp5n7-SzDcnoK3cQW7f3X3Qv3pEZSlNLPXzxLr85EWZimwRK7ahOWHGQWIA/exec';
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

export async function exchangeAdminLaunch(launchTicket, fetchImpl = fetch) {
  if (!launchTicket) throw new DataApiError('A Platform Admin launch ticket is required.', 'ADMIN_LAUNCH_REQUIRED');
  const response = await fetchImpl(GAS_DATA_API_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'exchangeAppLaunch', appId: CI_APP_ID, launchTicket })
  });
  if (!response.ok) throw new DataApiError(`Admin authorization exchange failed (${response.status}).`, 'ADMIN_EXCHANGE_HTTP_ERROR');
  const envelope = await response.json();
  if (!envelope || envelope.success !== true || typeof envelope.appGrant !== 'string' || !envelope.appGrant.trim()) throw new DataApiError(envelope?.error || 'Admin authorization was rejected.', 'ADMIN_UNAUTHORIZED');
  if (envelope.appId !== undefined && envelope.appId !== CI_APP_ID) throw new DataApiError('Admin authorization was issued for a different App.', 'ADMIN_UNAUTHORIZED');
  return envelope;
}

export async function writeOfficialData(request, appGrant, fetchImpl = fetch) {
  if (typeof appGrant !== 'string' || !appGrant.trim()) throw new DataApiError('A valid Platform App grant is required.', 'ADMIN_GRANT_REQUIRED');
  const response = await fetchImpl(GAS_DATA_API_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, appGrant })
  });
  if (!response.ok) throw new DataApiError(`GAS write failed (${response.status}).`, 'WRITE_HTTP_ERROR');
  const envelope = await response.json();
  if (!envelope || envelope.success !== true && envelope.status !== 'success') throw new DataApiError('GAS did not confirm the official update.', 'WRITE_NOT_CONFIRMED');
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
