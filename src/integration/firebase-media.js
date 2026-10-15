// Firebase Web configuration is public client configuration. It is not upload
// authority. Official writes still require the AVA Admin/GAS contract and an
// approved Firebase Storage auth/rules or media-broker setup.
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyDBA5Iitb8X0qmbVfjVdYWw-M2D_9ZhFIg',
  authDomain: 'medical-and-ci.firebaseapp.com',
  projectId: 'medical-and-ci',
  storageBucket: 'medical-and-ci.firebasestorage.app',
  messagingSenderId: '857984223277',
  appId: '1:857984223277:web:bd64aa72fc7e374c3450a4',
  measurementId: 'G-VC775G3QRW'
});

export const ALLOWED_MEDIA_TYPES = Object.freeze(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

// The production path is enabled as a capability, but authorization is still
// enforced per upload by the AVA Admin proof -> Firebase custom-token flow.
// A public Web config never grants Storage write access by itself.
export const FIREBASE_UPLOAD_ENABLED = true;
export const FIREBASE_UPLOAD_STATUS = 'FIREBASE_AUTH_REQUIRED';
export const OFFICIAL_STORAGE_AUTH_STATE = 'OFFICIAL_STORAGE_AUTH_READY';
export const USER_STORAGE_AUTH_STATE = 'USER_STORAGE_AUTH_CONFIG_REQUIRED';
export const FIREBASE_AUTH_METHOD = 'SERVER_SIDE_FIREBASE_CUSTOM_TOKEN_OR_APPROVED_BROKER';

const FIREBASE_SDK_URLS = Object.freeze({
  app: 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js',
  storage: 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js',
  auth: 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'
});

let sdkPromise;

export function sanitizeMediaFilename(name = '') {
  const safe = String(name).normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'resource';
}

export function validateMediaFile(file) {
  const type = String(file?.type || '').toLowerCase();
  const size = Number(file?.size);
  if (!ALLOWED_MEDIA_TYPES.includes(type)) throw new Error('只接受 PDF、PNG、JPG 或 WebP 檔案。');
  if (!Number.isFinite(size) || size <= 0 || size > MAX_MEDIA_BYTES) throw new Error('檔案大小必須為 20 MB 或以下。');
  return { type, size, name: sanitizeMediaFilename(file.name) };
}

export function resourceTypeForMime(type = '') {
  return String(type).toLowerCase() === 'application/pdf' ? 'pdf' : 'image';
}

export function officialResourcePath({ planId, category, contentId, filename, timestamp = Date.now(), contentType } = {}) {
  const plan = sanitizeMediaFilename(planId).toUpperCase();
  const safeCategory = sanitizeMediaFilename(category).toLowerCase();
  const safeContentId = sanitizeMediaFilename(contentId || 'resource');
  const isClaim = ['claim_example', 'claim_case'].includes(String(contentType || '').toLowerCase())
    || safeCategory === 'claims';
  const location = isClaim
    ? `claims/${safeContentId}`
    : `product/${safeCategory}`;
  return `critical-illness/official/${plan}/${location}/${Number(timestamp) || Date.now()}_${sanitizeMediaFilename(filename)}`;
}

export async function loadFirebaseStorageSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import(FIREBASE_SDK_URLS.app),
      import(FIREBASE_SDK_URLS.storage),
      import(FIREBASE_SDK_URLS.auth)
    ]).then(([appSdk, storageSdk, authSdk]) => ({ appSdk, storageSdk, authSdk }));
  }
  return sdkPromise;
}

export async function uploadOfficialMediaWithProvider({ provider, planId, category, contentId, contentType, file, timestamp } = {}) {
  if (!provider || provider.authorized !== true || typeof provider.upload !== 'function' || typeof provider.downloadUrl !== 'function') {
    throw new Error('Official media provider is unavailable.');
  }
  const validated = validateMediaFile(file);
  const path = officialResourcePath({ planId, category, contentId, contentType, filename: validated.name, timestamp });
  const snapshot = await provider.upload(path, file, {
    contentType: validated.type,
    customMetadata: {
      app: 'critical-illness',
      assetType: 'official-resource',
      planId: String(planId || ''),
      contentId: String(contentId || ''),
      category: String(category || '')
    }
  });
  const url = await provider.downloadUrl(snapshot);
  if (!/^https:\/\//i.test(String(url || ''))) throw new Error('Firebase did not return a usable HTTPS resource reference.');
  return { path, url, resourceType: resourceTypeForMime(validated.type), mimeType: validated.type, name: validated.name };
}

export async function uploadOfficialMedia({ planId, category, contentId, contentType, file, timestamp, adminSessionProof, authAdapter } = {}) {
  if (!adminSessionProof) {
    const error = new Error('有效的 AVA Admin session proof 是必要的。');
    error.code = 'ADMIN_PROOF_REQUIRED';
    throw error;
  }
  const { appSdk, storageSdk, authSdk } = await loadFirebaseStorageSdk();
  const app = appSdk.getApps().find(item => item.name === 'ava-critical-illness')
    || appSdk.initializeApp(FIREBASE_CONFIG, 'ava-critical-illness');
  const auth = authSdk.getAuth(app);
  const adapter = authAdapter || (await import('./firebase-auth.js?v=0.6.3')).createFirebaseAuthAdapter({ authSdk, auth });
  await adapter.authenticate({ mode: 'admin', adminSessionProof });
  const storage = storageSdk.getStorage(app);
  return uploadOfficialMediaWithProvider({
    planId,
    category,
    contentId,
    contentType,
    file,
    timestamp,
    provider: {
      authorized: true,
      upload: (path, data, metadata) => storageSdk.uploadBytes(storageSdk.ref(storage, path), data, metadata),
      downloadUrl: snapshot => storageSdk.getDownloadURL(snapshot.ref)
    }
  });
}

export function userMediaCapability() {
  return {
    status: USER_STORAGE_AUTH_STATE,
    reason: 'AVA_USER_CLOUD_PROVIDER_AND_BINDING_REQUIRED',
    binaryStoredLocally: false,
    officialIsolation: true
  };
}

export function storageCapability() {
  return {
    official: {
      status: OFFICIAL_STORAGE_AUTH_STATE,
      uploadEnabled: FIREBASE_UPLOAD_ENABLED,
      authMethod: FIREBASE_AUTH_METHOD,
      publicRead: true,
      publicWrite: false
    },
    user: userMediaCapability()
  };
}
