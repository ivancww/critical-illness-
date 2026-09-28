const CACHE = 'ava-ci-shell-v1';
const SHELL = ['./', './index.html', './manifest.json', './src/app.js', './src/styles.css', './src/domain/product-engine.js', './src/domain/claim-engine.js', './src/domain/premium-engine.js', './src/data/data-api.js', './src/data/storage.js', './src/data/content.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('script.google.com')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).origin === location.origin) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then(response => response || caches.match('./index.html'))));
});
