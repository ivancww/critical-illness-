// The CI Pages app may hold Firebase web configuration, but it must not infer
// upload authority from that public configuration.  Official writes still go
// through the existing AVA Admin/GAS contract until an approved media broker
// is connected to this app.
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

export function officialResourcePath({ planId, category, filename, timestamp = Date.now() } = {}) {
  const plan = sanitizeMediaFilename(planId).toUpperCase();
  const group = sanitizeMediaFilename(category).toLowerCase();
  return `critical-illness/official/${plan}/${group}/${Number(timestamp) || Date.now()}_${sanitizeMediaFilename(filename)}`;
}

export function uploadOfficialMedia() {
  const error = new Error('AVA Cloud Media upload broker 未配置；請由已授權 Admin 先取得 cloud reference，再以 Product_Content.resource_ref 儲存。');
  error.code = 'OFFICIAL_MEDIA_PROVIDER_UNAVAILABLE';
  throw error;
}

export function userMediaCapability() {
  return { status: 'USER_RESOURCE_UPLOAD_BLOCKED_BY_STORAGE_PROVIDER', binaryStoredLocally: false };
}
