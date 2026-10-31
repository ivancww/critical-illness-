import { validateMediaFile } from './firebase-media.js?v=0.6.13';
import { canonicalUserScope, userResourcePath } from '../domain/resource-layer.js?v=0.6.13';

export function createFirebaseUserCloudProvider({ storageSdk, storage, authAdapter, userBinding } = {}) {
  const scope = canonicalUserScope(userBinding);
  if (!scope) throw new Error('Canonical AVA User binding is required for User resource storage.');
  if (!storageSdk || !storage) throw new Error('Firebase Storage is unavailable.');

  async function authorize() {
    const current = authAdapter?.currentState?.();
    if (current?.status === 'AUTHENTICATED' && current.claims?.avaUserScope === scope) return current;
    if (!authAdapter?.authenticate) throw new Error('User Storage authorization is not configured.');
    return authAdapter.authenticate({ mode: 'user', userBinding });
  }

  async function saveFile({ planId, resourceId, file, timestamp } = {}) {
    await authorize();
    const validated = validateMediaFile(file);
    const path = userResourcePath({ opaqueUserScope: scope, planId, resourceId, filename: validated.name, timestamp });
    const objectRef = storageSdk.ref(storage, path);
    const snapshot = await storageSdk.uploadBytes(objectRef, file, { contentType: validated.type, customMetadata: { app: 'critical-illness', assetType: 'user-resource', resourceId: String(resourceId || '') } });
    const url = await storageSdk.getDownloadURL(snapshot.ref);
    return { providerId: 'firebase-user-cloud', cloudFileRef: url, path, resourceId, ownerScope: scope, resourceType: validated.type === 'application/pdf' ? 'pdf' : 'image', mimeType: validated.type, size: validated.size, filename: validated.name };
  }

  async function resolveFile(reference) {
    await authorize();
    const objectRef = typeof reference === 'string' ? storageSdk.ref(storage, reference) : reference;
    return storageSdk.getDownloadURL(objectRef);
  }

  async function deleteFile(reference) {
    await authorize();
    const objectRef = typeof reference === 'string' ? storageSdk.ref(storage, reference) : reference;
    await storageSdk.deleteObject(objectRef);
    return true;
  }

  return {
    id: 'firebase-user-cloud',
    isUserCloudProvider: true,
    binaryStoredInCloud: true,
    saveFile,
    replaceFile: saveFile,
    resolveFile,
    deletePersonalFile: deleteFile,
    deleteFile
  };
}
