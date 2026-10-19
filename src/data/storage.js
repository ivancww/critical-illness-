import { normalizeUserResourceOverride } from '../domain/resource-layer.js?v=0.6.7';

const CACHE_KEY = 'AVA_CI_OFFICIAL_CACHE_V2';
const USER_KEY = 'AVA_CI_USER_STATE_V1';
export const USER_DATA_SCHEMA_VERSION = 3;
export const MEDIA_PROVIDER = 'cloud-storage';

export function loadOfficialCache(storage = localStorage) {
  try { return JSON.parse(storage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}

export function saveOfficialCache(data, storage = localStorage) {
  const revision = data.revision ?? data.structured?._meta?.revision ?? data.structured?._meta?.versions ?? null;
  storage.setItem(CACHE_KEY, JSON.stringify({ ...data, revision, cacheVersion: data.cacheVersion ?? data.structured?.Settings_Versions?.[0]?.ci_version ?? null, cachedAt: new Date().toISOString() }));
}

export function officialCacheIsCurrent(cache, version) {
  return Boolean(cache && version && cache.cacheVersion === version);
}

export function loadUserState(storage = localStorage) {
  try { return normalizeUserState(JSON.parse(storage.getItem(USER_KEY) || '{}')); } catch { return normalizeUserState(); }
}

export function saveUserState(state, storage = localStorage) {
  const normalized = normalizeUserState(state);
  storage.setItem(USER_KEY, JSON.stringify(normalized));
  return normalized;
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function structured(value) {
  if (Array.isArray(value)) return value.map(structured);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/(^|_)(file|blob|binary|base64|dataurl)($|_)/i.test(key)).map(([key, item]) => [key, structured(item)]));
}

function page(value, index) {
  if (!value || typeof value !== 'object') return null;
  const type = ['content', 'image', 'video'].includes(value.type) ? value.type : 'content';
  const media = Array.isArray(value.media) ? value.media.slice(0, type === 'image' ? 6 : type === 'video' ? 1 : 0).map(reference).filter(Boolean) : [];
  return {
    id: text(value.id) || `ci-user-page-${index + 1}`,
    type,
    title: text(value.title, '自訂頁面'),
    subtitle: text(value.subtitle),
    content: text(value.content),
    flowPosition: Number.isFinite(Number(value.flowPosition)) ? Number(value.flowPosition) : index,
    sortOrder: Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : index,
    visible: value.visible !== false,
    createdAt: text(value.createdAt, new Date(0).toISOString()),
    updatedAt: text(value.updatedAt, new Date(0).toISOString()),
    overrides: value.overrides && typeof value.overrides === 'object' ? structured(value.overrides) : {},
    media
  };
}

function reference(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: text(value.id), provider: MEDIA_PROVIDER, cloudFileRef: text(value.cloudFileRef),
    name: text(value.name), mimeType: text(value.mimeType), size: Number(value.size) || 0,
    width: Number(value.width) || null, height: Number(value.height) || null,
    duration: Number(value.duration) || null, pageId: text(value.pageId), order: Number(value.order) || 0,
    status: text(value.status, 'unavailable')
  };
}

export function normalizeUserState(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const rawFrontstage = input.frontstage && typeof input.frontstage === 'object' ? input.frontstage : {};
  const legacyClaimTypes = rawFrontstage.claimTypes && typeof rawFrontstage.claimTypes === 'object'
    ? Object.values(rawFrontstage.claimTypes).filter(type => type === 'major' || type === 'early')
    : [];
  const comparisonClaimType = rawFrontstage.comparisonClaimType === 'early' || rawFrontstage.comparisonClaimType === 'major'
    ? rawFrontstage.comparisonClaimType
    : legacyClaimTypes.length && legacyClaimTypes.every(type => type === legacyClaimTypes[0])
      ? legacyClaimTypes[0]
      : 'major';
  const pages = Array.isArray(input.pages) ? input.pages.map(page).filter(Boolean).sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const resourceOverrides = Array.isArray(input.resourceOverrides) ? input.resourceOverrides.map(normalizeUserResourceOverride).filter(Boolean) : [];
  return {
    schemaVersion: USER_DATA_SCHEMA_VERSION,
    flow: input.flow && typeof input.flow === 'object' ? { ...input.flow } : {},
    selectedPlanIds: Array.isArray(input.selectedPlanIds) ? input.selectedPlanIds.filter(item => typeof item === 'string') : [],
    frontstage: { ...structured(rawFrontstage), comparisonClaimType },
    pagePreferences: input.pagePreferences && typeof input.pagePreferences === 'object' ? { ...input.pagePreferences } : { introTitle: '', introSubtitle: '', introSupport: '', showIntro: true },
    overrides: input.overrides && typeof input.overrides === 'object' ? structured(input.overrides) : {},
    resourceOverrides,
    pages
  };
}

export function createUserBackup(state) {
  const data = normalizeUserState(state);
  return { kind: 'ava-critical-illness-user-backup', schemaVersion: USER_DATA_SCHEMA_VERSION, createdAt: new Date().toISOString(), data };
}

export function restoreUserBackup(backup) {
  if (!backup || backup.kind !== 'ava-critical-illness-user-backup' || !backup.data || Number(backup.schemaVersion) > USER_DATA_SCHEMA_VERSION) {
    throw new Error('無效或不兼容的 User Backup。');
  }
  return normalizeUserState(backup.data);
}

export function saveUserMediaReference({ provider, planId, resourceId, file, timestamp } = {}) {
  if (provider && typeof provider.saveFile === 'function') return provider.saveFile({ planId, resourceId, file, timestamp });
  const error = new Error('Cloud Storage provider 未配置；媒體上載功能目前只供 Development QA 顯示。');
  error.code = 'CLOUD_STORAGE_UNAVAILABLE';
  throw error;
}

export function removeUserMediaReference({ provider, reference } = {}) {
  if (provider && typeof provider.deleteFile === 'function') return provider.deleteFile(reference);
  const error = new Error('User cloud Storage provider 未配置。');
  error.code = 'USER_STORAGE_AUTH_CONFIG_REQUIRED';
  throw error;
}

export function createQrRestorePointer({ restoreId, expiresAt } = {}) {
  if (!restoreId) throw new Error('Restore pointer is required.');
  return { kind: 'ava-restore-pointer', restoreId: String(restoreId), expiresAt: expiresAt ?? null, credentialsIncluded: false };
}

export function validateQrRestorePointer(pointer) {
  if (!pointer || pointer.kind !== 'ava-restore-pointer' || !pointer.restoreId || pointer.credentialsIncluded) {
    throw new Error('無效的 QR Restore pointer。');
  }
  return pointer;
}

export function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
