// Keep this name stable. Service-worker script updates discover a new
// deployment; releases must not depend on a manually edited cache version.
const CACHE = 'ava-ci-shell';
const RELEASE = '0.4.0';
const LEGACY_CACHE_PREFIX = 'ava-ci-shell-';
const SHELL = ['./', './index.html', './manifest.json', `./src/app.js?v=${RELEASE}`, `./src/version.js?v=${RELEASE}`, `./src/styles.css?v=${RELEASE}`, `./src/domain/product-engine.js?v=${RELEASE}`, `./src/domain/claim-engine.js?v=${RELEASE}`, `./src/domain/premium-engine.js?v=${RELEASE}`, `./src/domain/flow-state.js?v=${RELEASE}`, `./src/domain/verification.js?v=${RELEASE}`, `./src/domain/frontstage-experience.js?v=${RELEASE}`, `./src/domain/plan-experience.js?v=${RELEASE}`, `./src/domain/input-format.js?v=${RELEASE}`, `./src/data/data-api.js?v=${RELEASE}`, `./src/data/storage.js?v=${RELEASE}`, `./src/data/content.js?v=${RELEASE}`, `./src/integration/return-context.js?v=${RELEASE}`, `./src/admin/official-config.js?v=${RELEASE}`];

function isOwnedCache(name) {
  return name === CACHE || name.startsWith(LEGACY_CACHE_PREFIX);
}

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isUpdateSensitive(request) {
  return request.mode === 'navigate' || ['script', 'style'].includes(request.destination);
}

function cacheResponse(request, response) {
  if (!response.ok || response.type !== 'basic') return Promise.resolve(response);
  const cacheKey = request.mode === 'navigate' ? './index.html' : request;
  return caches.open(CACHE).then(cache => cache.put(cacheKey, response.clone())).then(() => response);
}

function cachedFallback(request) {
  return (request.mode === 'navigate' ? caches.match('./index.html') : caches.match(request)).then(response => response || Response.error());
}

self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(isOwnedCache).filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.url.includes('script.google.com') || !isSameOrigin(request)) return;
  if (isUpdateSensitive(request)) {
    const update = fetch(request, { cache: 'no-store' }).then(cacheResponse);
    event.respondWith(update.catch(() => cachedFallback(request)));
    return;
  }
  event.respondWith(
    fetch(request)
      .then(response => {
        event.waitUntil(cacheResponse(request, response));
        return response;
      })
      .catch(() => cachedFallback(request))
  );
});
