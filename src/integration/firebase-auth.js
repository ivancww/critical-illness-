import { CI_APP_ID, GAS_DATA_API_URL } from '../data/data-api.js?v=0.6.7';

export const FIREBASE_CLAIM_CONTRACT = Object.freeze({
  admin: 'avaAdmin',
  userScope: 'avaUserScope',
  version: 'ava-ci-storage-v1'
});

export const OFFICIAL_STORAGE_AUTH_READY = 'OFFICIAL_STORAGE_AUTH_READY';
export const OFFICIAL_STORAGE_AUTH_CONFIG_REQUIRED = 'OFFICIAL_STORAGE_AUTH_CONFIG_REQUIRED';
export const USER_STORAGE_AUTH_READY = 'USER_STORAGE_AUTH_READY';
export const USER_STORAGE_AUTH_CONFIG_REQUIRED = 'USER_STORAGE_AUTH_CONFIG_REQUIRED';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function expiresAt(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && time > Date.now() ? value : null;
}

export function firebaseAuthorizationRequest({ mode, adminSessionProof, userBinding } = {}) {
  const type = String(mode || '').toLowerCase();
  if (type === 'admin' && !text(adminSessionProof)) {
    const error = new Error('AVA Admin session proof is required.');
    error.code = 'ADMIN_PROOF_REQUIRED';
    throw error;
  }
  if (type === 'user' && (!text(userBinding?.opaqueUserScope) || !text(userBinding?.bindingProof))) {
    const error = new Error('A canonical AVA User binding proof is required.');
    error.code = USER_STORAGE_AUTH_CONFIG_REQUIRED;
    throw error;
  }
  if (!['admin', 'user'].includes(type)) throw new Error('Unsupported Firebase authorization mode.');
  return {
    action: 'issueFirebaseAuthorization',
    appId: CI_APP_ID,
    mode: type,
    adminSessionProof: type === 'admin' ? text(adminSessionProof) : undefined,
    userBinding: type === 'user' ? { opaqueUserScope: text(userBinding.opaqueUserScope), bindingProof: text(userBinding.bindingProof) } : undefined,
    contract: FIREBASE_CLAIM_CONTRACT.version
  };
}

export async function requestFirebaseAuthorization({ mode, adminSessionProof, userBinding, fetchImpl = fetch, endpoint = GAS_DATA_API_URL } = {}) {
  const body = firebaseAuthorizationRequest({ mode, adminSessionProof, userBinding });
  const response = await fetchImpl(endpoint, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  let envelope = {};
  try { envelope = await response.json(); } catch (_) { /* handled below */ }
  const grant = envelope?.data || envelope;
  if (!response.ok || envelope.success !== true || typeof grant.firebaseCustomToken !== 'string' || !expiresAt(grant.expiresAt)) {
    const error = new Error(envelope?.error?.message || envelope?.error || 'Firebase authorization bridge is not configured.');
    error.code = envelope?.error?.code || (mode === 'admin' ? OFFICIAL_STORAGE_AUTH_CONFIG_REQUIRED : USER_STORAGE_AUTH_CONFIG_REQUIRED);
    throw error;
  }
  const claims = grant.claims && typeof grant.claims === 'object' ? grant.claims : {};
  if (mode === 'admin' && claims[FIREBASE_CLAIM_CONTRACT.admin] !== true) throw new Error('Firebase grant does not contain the Admin claim.');
  if (mode === 'user' && claims[FIREBASE_CLAIM_CONTRACT.userScope] !== userBinding.opaqueUserScope) throw new Error('Firebase grant is not bound to the current User.');
  return { customToken: grant.firebaseCustomToken, expiresAt: grant.expiresAt, claims, contract: FIREBASE_CLAIM_CONTRACT.version };
}

export function createFirebaseAuthAdapter({ authSdk, auth, fetchImpl = fetch, endpoint = GAS_DATA_API_URL } = {}) {
  let state = { status: 'SIGNED_OUT', claims: null, expiresAt: null };
  return {
    async authenticate(options = {}) {
      if (!authSdk || typeof authSdk.signInWithCustomToken !== 'function') throw new Error('Firebase Auth SDK is unavailable.');
      const grant = await requestFirebaseAuthorization({ ...options, fetchImpl, endpoint });
      const credential = await authSdk.signInWithCustomToken(auth, grant.customToken);
      state = { status: 'AUTHENTICATED', user: credential?.user || null, claims: grant.claims, expiresAt: grant.expiresAt };
      return state;
    },
    currentState() { return { ...state }; },
    signOut: async () => { if (authSdk?.signOut) await authSdk.signOut(auth); state = { status: 'SIGNED_OUT', claims: null, expiresAt: null }; }
  };
}
