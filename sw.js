// Keep this name stable. Service-worker script updates discover a new
// deployment; releases must not depend on a manually edited cache version.
const CACHE = 'ava-ci-shell';
const RELEASE = '0.2.5';
const LEGACY_CACHE_PREFIX = 'ava-ci-shell-';
const SHELL = ['./', './index.html', './manifest.json', `./src/app.js?v=${RELEASE}`, `./src/version.js?v=${RELEASE}`, './src/styles.css', './src/domain/product-engine.js', './src/domain/claim-engine.js', './src/domain/premium-engine.js', './src/domain/flow-state.js', './src/domain/verification.js', './src/domain/frontstage-experience.js', './src/data/data-api.js', './src/data/storage.js', './src/data/content.js', './src/integration/return-context.js', './src/admin/official-config.js'];

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
