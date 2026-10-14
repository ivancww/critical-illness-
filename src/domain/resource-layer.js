// Resource layering is independent from any storage provider. Official data
// is authoritative for shared content; User overrides are resolved only when
// an AVA-issued opaque User binding and an approved cloud reference exist.
export const OFFICIAL_RESOURCE_NAMESPACE = 'critical-illness/official';
export const USER_RESOURCE_NAMESPACE = 'critical-illness/users';
export const USER_RESOURCE_RUNTIME_BLOCKED = 'USER_RESOURCE_RUNTIME_BLOCKED';
export const USER_RESOURCE_PROVIDER_REQUIRED = 'AVA_USER_CLOUD_PROVIDER_AND_BINDING_REQUIRED';

const OPAQUE_SCOPE = /^[A-Za-z0-9_-]{8,128}$/;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeSegment(value, fallback = 'resource') {
  const normalized = text(value).normalize('NFKC').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

export function resourceIdentity(resource = {}) {
  const value = resource?.content_id ?? resource?.resource_id ?? resource?.resourceId ?? resource?.id;
  if (text(value)) return text(value);
  const legacyParts = [resource?.plan_id ?? resource?.planId, resource?.content_type ?? resource?.contentType, resource?.category, resource?.title, resource?.sort_order ?? resource?.display_order];
  if (!legacyParts.some(value => text(value))) return null;
  return `legacy:${legacyParts.map(value => text(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-')).join(':')}`;
}

// Ownership is never derived from display name, email or filename.
// opaqueUserScope must come from the canonical AVA User binding.
export function canonicalUserScope(binding = {}) {
  const scope = text(binding?.opaqueUserScope);
  return OPAQUE_SCOPE.test(scope) ? scope : null;
}

export function userResourcePath({ opaqueUserScope, planId, resourceId, filename, timestamp = Date.now() } = {}) {
  const scope = canonicalUserScope({ opaqueUserScope });
  const identity = safeSegment(resourceId, 'resource');
  if (!scope) throw new Error('Canonical AVA User binding is required for User resource storage.');
  if (!text(planId)) throw new Error('Plan identity is required for User resource storage.');
  return `${USER_RESOURCE_NAMESPACE}/${scope}/${safeSegment(planId).toUpperCase()}/${identity}/${Number(timestamp) || Date.now()}_${safeSegment(filename)}`;
}

function validCloudReference(value) {
  return /^https:\/\//i.test(text(value));
}

export function normalizeUserResourceOverride(value = {}) {
  if (!value || typeof value !== 'object') return null;
  const resourceId = text(value.resourceId ?? value.content_id ?? value.resource_id ?? value.id);
  const ownerScope = text(value.ownerScope ?? value.opaqueUserScope);
  const reference = text(value.cloudFileRef ?? value.resource_ref ?? value.resourceRef);
  const providerId = text(value.providerId ?? value.storageProvider);
  if (!resourceId || !OPAQUE_SCOPE.test(ownerScope) || !validCloudReference(reference)) return null;
  if (!providerId || providerId === 'local') return null;
  return {
    layer: 'user',
    resourceId,
    ownerScope,
    providerId,
    plan_id: text(value.plan_id ?? value.planId),
    content_id: resourceId,
    content_type: text(value.content_type ?? value.contentType),
    category: text(value.category),
    title: text(value.title),
    short_text: text(value.short_text ?? value.shortText),
    resource_type: text(value.resource_type ?? value.resourceType),
    resource_ref: reference,
    cloudFileRef: reference,
    enabled: value.enabled !== false,
    sort_order: Number.isFinite(Number(value.sort_order)) ? Number(value.sort_order) : 0,
    filename: text(value.filename ?? value.name),
    mimeType: text(value.mimeType ?? value.mime_type),
    size: Number.isFinite(Number(value.size)) ? Number(value.size) : 0,
    updatedAt: text(value.updatedAt)
  };
}

function ownedOverride(override, userBinding, officialResource) {
  const normalized = normalizeUserResourceOverride(override);
  const scope = canonicalUserScope(userBinding);
  if (!normalized || !scope || normalized.ownerScope !== scope) return null;
  if (resourceIdentity(officialResource) && normalized.resourceId !== resourceIdentity(officialResource)) return null;
  if (normalized.enabled === false) return null;
  return normalized;
}

export function resolveEffectiveResource({ officialResource = null, userOverride = null, userBinding = null } = {}) {
  const override = ownedOverride(userOverride, userBinding, officialResource);
  if (override) return { ...override, source: 'user', resourceIdentity: override.resourceId, resourceReference: override.resource_ref };
  if (officialResource && typeof officialResource === 'object') {
    const reference = text(officialResource.resource_ref ?? officialResource.resourceReference ?? officialResource.url);
    if (!validCloudReference(reference)) return null;
    return { ...officialResource, source: 'official', resourceIdentity: resourceIdentity(officialResource), resourceReference: reference };
  }
  return null;
}

export function removeUserResourceOverride(overrides = [], { resourceId, userBinding } = {}) {
  const scope = canonicalUserScope(userBinding);
  const id = text(resourceId);
  if (!scope || !id || !Array.isArray(overrides)) return Array.isArray(overrides) ? overrides.slice() : [];
  return overrides.filter(item => {
    const normalized = normalizeUserResourceOverride(item);
    return !(normalized && normalized.ownerScope === scope && normalized.resourceId === id);
  });
}

export function userResourceCapability(provider = null) {
  const usable = Boolean(provider
    && provider.isUserCloudProvider === true
    && provider.binaryStoredInCloud === true
    && typeof provider.saveFile === 'function'
    && typeof provider.replaceFile === 'function'
    && typeof provider.resolveFile === 'function'
    && typeof provider.deletePersonalFile === 'function');
  if (!usable) return {
    status: USER_RESOURCE_RUNTIME_BLOCKED,
    reason: USER_RESOURCE_PROVIDER_REQUIRED,
    providerId: null,
    binaryStoredLocally: false,
    officialIsolation: true
  };
  return { status: 'AVAILABLE', reason: '', providerId: provider.id, binaryStoredLocally: false, officialIsolation: true };
}
