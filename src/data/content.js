import { resolveEffectiveResource, resourceIdentity } from '../domain/resource-layer.js?v=0.6.6';

export function resourcesForProduct(productContent = [], planId) {
  const targetPlanId = String(planId ?? '').trim().toUpperCase();
  return productContent.filter(item => String(item.plan_id ?? item.plan_key ?? item.product_id ?? '').trim().toUpperCase() === targetPlanId && item.active !== false)
    .sort((a, b) => {
      const order = Number(a.display_order ?? a.sort_order ?? 0) - Number(b.display_order ?? b.sort_order ?? 0);
      if (order) return order;
      return String(a.content_id ?? a.resource_id ?? a.title ?? '').localeCompare(String(b.content_id ?? b.resource_id ?? b.title ?? ''));
    });
}

export function firebaseResourceUrl(resource) {
  return resource?.resource_url ?? resource?.firebase_url ?? resource?.url ?? null;
}

function referenceExtension(reference) {
  const value = String(reference || '').split(/[?#]/, 1)[0].toLowerCase();
  if (value.endsWith('.pdf')) return 'pdf';
  if (value.endsWith('.png')) return 'image/png';
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg';
  if (value.endsWith('.webp')) return 'image/webp';
  return '';
}

export function resourceKind(resource) {
  const value = String(resource?.resource_type ?? resource?.mime_type ?? '').toLowerCase();
  if (value === 'pdf' || value === 'application/pdf') return 'pdf';
  if (value.includes('png')) return 'image/png';
  if (value.includes('jpeg') || value.includes('jpg')) return 'image/jpeg';
  if (value.includes('webp')) return 'image/webp';
  return referenceExtension(resource?.resource_ref || firebaseResourceUrl(resource)) || 'resource';
}

function active(resource) {
  return resource?.active !== false && resource?.enabled !== false;
}

function resourceReference(resource) {
  const reference = resource?.resource_ref || firebaseResourceUrl(resource);
  return /^https:\/\//i.test(String(reference || '')) ? reference : null;
}

function normalizedContentType(resource) {
  return String(resource?.content_type ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isBrochureResource(resource) {
  const contentType = normalizedContentType(resource);
  const category = String(resource?.category ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ['brochure', 'product_brochure'].includes(contentType) || ['brochure', 'product_brochure'].includes(category);
}

function layeredResourcesForProduct(productContent = [], planId, userOverrides = [], userBinding = null) {
  const official = resourcesForProduct(productContent, planId).filter(active);
  const user = Array.isArray(userOverrides) ? userOverrides.filter(item => item?.plan_id === planId) : [];
  const ids = [...new Set([...official, ...user].map(resourceIdentity).filter(Boolean))];
  return ids.map(id => {
    const officialResource = official.find(item => resourceIdentity(item) === id) || null;
    const userOverride = user.find(item => resourceIdentity(item) === id) || null;
    const effective = resolveEffectiveResource({ officialResource, userOverride, userBinding });
    if (!effective || !active(effective) || !resourceReference(effective)) return null;
    return { ...effective, resourceReference: resourceReference(effective) };
  }).filter(Boolean).sort((a, b) => Number(a.display_order ?? a.sort_order ?? 0) - Number(b.display_order ?? b.sort_order ?? 0));
}

export function productBrochureForProduct(productContent = [], planId, userOverrides = [], userBinding = null) {
  return layeredResourcesForProduct(productContent, planId, userOverrides, userBinding)
    .filter(isBrochureResource)
    .filter(resource => resourceReference(resource))
    .map(resource => ({ ...resource, resourceReference: resourceReference(resource) }));
}

export function claimCaseResourcesForProduct(productContent = [], planId, userOverrides = [], userBinding = null) {
  return layeredResourcesForProduct(productContent, planId, userOverrides, userBinding)
    .filter(resource => ['claim_example', 'claim_case'].includes(String(resource.content_type || '').toLowerCase()))
    .filter(resource => resourceReference(resource))
    .map(resource => ({ ...resource, resourceReference: resourceReference(resource) }));
}

export function diseaseResourcesForProduct(productContent = [], planId, age, userOverrides = [], userBinding = null) {
  const rows = layeredResourcesForProduct(productContent, planId, userOverrides, userBinding)
    .filter(resource => resourceReference(resource))
    .map(resource => ({ ...resource, resourceReference: resourceReference(resource) }));
  const adult = rows.filter(resource => ['diseases', 'adult', 'adult_disease'].includes(String(resource.category || '').toLowerCase()));
  const child = rows.filter(resource => ['child', 'children', 'child_disease'].includes(String(resource.category || '').toLowerCase()));
  const categories = [];
  if (adult.length) categories.push({ key: 'adult', label: '成人保障疾病', resources: adult });
  if (Number.isInteger(Number(age)) && Number(age) <= 17 && child.length) categories.push({ key: 'child', label: '兒童專屬保障疾病', resources: child });
  return categories;
}
