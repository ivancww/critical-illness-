// Firebase Web configuration is public client configuration. It is not Sheet
// write authority. CI Official binaries intentionally use a public-write
// Firebase namespace; Product_Content writes remain AVA Admin/GAS protected.
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyDBA5Iitb8X0qmbVfjVdYWw-M2D_9ZhFIg',
  projectId: 'medical-and-ci',
  storageBucket: 'medical-and-ci.firebasestorage.app',
  appId: '1:857984223277:web:bd64aa72fc7e374c3450a4'
});

export const ALLOWED_MEDIA_TYPES = Object.freeze(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

export const FIREBASE_UPLOAD_ENABLED = true;
export const FIREBASE_UPLOAD_STATUS = 'FIREBASE_UPLOAD_UNAVAILABLE';
export const OFFICIAL_STORAGE_AUTH_STATE = 'PUBLIC_OFFICIAL_MEDIA_STORAGE';
export const USER_STORAGE_AUTH_STATE = 'USER_STORAGE_AUTH_CONFIG_REQUIRED';
export const FIREBASE_AUTH_METHOD = 'NONE_FOR_CI_OFFICIAL_MEDIA';

let sdkPromise;

function stageError(stage, error) {
  const wrapped = error instanceof Error ? error : new Error(String(error || 'Firebase operation failed.'));
  if (!wrapped.stage) wrapped.stage = stage;
  return wrapped;
}

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
    const ready = globalThis.__AVA_CI_FIREBASE_READY__
      || import('./firebase-media-module.js?v=0.6.11').then(module => module.createFirebaseStorageClient());
    sdkPromise = ready.catch(error => { throw stageError('firebase-module', error); });
  }
  return sdkPromise;
}

export async function uploadOfficialMediaWithProvider({ provider, planId, category, contentId, contentType, file, timestamp } = {}) {
  if (!provider || provider.authorized !== true || typeof provider.upload !== 'function' || typeof provider.downloadUrl !== 'function') {
    throw new Error('Official media provider is unavailable.');
  }
  const validated = validateMediaFile(file);
  const path = officialResourcePath({ planId, category, contentId, contentType, filename: validated.name, timestamp });
  let snapshot;
  try {
    snapshot = await provider.upload(path, file, {
      contentType: validated.type,
      customMetadata: {
        app: 'critical-illness',
        assetType: 'official-resource',
        planId: String(planId || ''),
        contentId: String(contentId || ''),
        category: String(category || '')
      }
    });
  } catch (error) {
    throw stageError('firebase-upload', error);
  }
  try {
    if (typeof provider.verify === 'function') await provider.verify(snapshot, { path, type: validated.type, size: validated.size });
  } catch (error) {
    throw stageError('firebase-object-verification', error);
  }
  let url;
  try {
    url = await provider.downloadUrl(snapshot);
  } catch (error) {
    throw stageError('firebase-download-url', error);
  }
  if (!/^https:\/\//i.test(String(url || ''))) throw stageError('firebase-download-url', new Error('Firebase did not return a usable HTTPS resource reference.'));
  return { path, url, verified: true, resourceType: 'firebase', mimeType: validated.type, name: validated.name };
}

export async function uploadOfficialMedia({ planId, category, contentId, contentType, file, timestamp, adminSessionProof } = {}) {
  if (!adminSessionProof) {
    const error = new Error('有效的 AVA Admin session proof 是必要的。');
    error.code = 'ADMIN_PROOF_REQUIRED';
    throw error;
  }
  const client = await loadFirebaseStorageSdk();
  const { storageSdk, storage } = client;
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
      verify: snapshot => storageSdk.getMetadata(snapshot.ref),
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
      publicWrite: true,
      publicDelete: false
    },
    user: userMediaCapability()
  };
}
