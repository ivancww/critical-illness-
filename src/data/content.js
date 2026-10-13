export function resourcesForProduct(productContent = [], planId) {
  return productContent.filter(item => item.plan_id === planId && item.active !== false)
    .sort((a, b) => Number(a.display_order ?? a.sort_order ?? 0) - Number(b.display_order ?? b.sort_order ?? 0));
}

export function firebaseResourceUrl(resource) {
  return resource?.resource_url ?? resource?.firebase_url ?? resource?.url ?? null;
}

function active(resource) {
  return resource?.active !== false && resource?.enabled !== false;
}

function resourceReference(resource) {
  return resource?.resource_ref || firebaseResourceUrl(resource);
}

export function diseaseResourcesForProduct(productContent = [], planId, age) {
  const rows = resourcesForProduct(productContent, planId)
    .filter(active)
    .filter(resource => resourceReference(resource))
    .map(resource => ({ ...resource, resourceReference: resourceReference(resource) }));
  const adult = rows.filter(resource => ['diseases', 'adult', 'adult_disease'].includes(String(resource.category || '').toLowerCase()));
  const child = rows.filter(resource => ['child', 'children', 'child_disease'].includes(String(resource.category || '').toLowerCase()));
  const categories = [];
  if (adult.length) categories.push({ key: 'adult', label: '成人保障疾病', resources: adult });
  if (Number.isInteger(Number(age)) && Number(age) <= 17 && child.length) categories.push({ key: 'child', label: '兒童專屬保障疾病', resources: child });
  return categories;
}
