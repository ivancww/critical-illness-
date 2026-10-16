export const STORAGE_POLICY = Object.freeze({
  officialPrefix: 'critical-illness/official/',
  userPrefix: 'critical-illness/users/',
  maxBytes: 20 * 1024 * 1024,
  allowedMimeTypes: Object.freeze(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
});

function userScopeFor(path) {
  const match = String(path || '').match(/^critical-illness\/users\/([^/]+)\//);
  return match ? match[1] : null;
}

function validMedia(resource) {
  return Boolean(resource
    && Number(resource.size) > 0
    && Number(resource.size) <= STORAGE_POLICY.maxBytes
    && STORAGE_POLICY.allowedMimeTypes.includes(String(resource.contentType || '').toLowerCase()));
}

export function storagePolicyDecision({ operation, path, auth = null, resource = null } = {}) {
  const action = String(operation || '').toLowerCase();
  const objectPath = String(path || '');
  if (objectPath.startsWith(STORAGE_POLICY.officialPrefix)) {
    if (action === 'read') return { allowed: true, reason: 'official-public-read' };
    if (['create', 'update'].includes(action)) return { allowed: validMedia(resource), reason: validMedia(resource) ? 'official-public-media-write' : 'invalid-media' };
    if (action === 'delete') return { allowed: false, reason: 'official-delete-denied' };
    return { allowed: false, reason: 'unsupported-operation' };
  }
  const scope = userScopeFor(objectPath);
  if (scope) {
    const owner = auth?.token?.avaUserScope === scope;
    if (action === 'read') return { allowed: owner, reason: owner ? 'user-owner-read' : 'owner-claim-required' };
    if (['create', 'update'].includes(action)) return { allowed: owner && validMedia(resource), reason: !owner ? 'owner-claim-required' : (validMedia(resource) ? 'user-owner-write' : 'invalid-media') };
    if (action === 'delete') return { allowed: owner, reason: owner ? 'user-owner-delete' : 'owner-claim-required' };
    return { allowed: false, reason: 'unsupported-operation' };
  }
  return { allowed: false, reason: 'path-denied' };
}
