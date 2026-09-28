export function resourcesForProduct(productContent = [], planId) {
  return productContent.filter(item => item.plan_id === planId && item.active !== false)
    .sort((a, b) => Number(a.display_order ?? a.sort_order ?? 0) - Number(b.display_order ?? b.sort_order ?? 0));
}

export function firebaseResourceUrl(resource) {
  return resource?.resource_url ?? resource?.firebase_url ?? resource?.url ?? null;
}
