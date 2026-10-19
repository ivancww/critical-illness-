// Classic-script bootstrap keeps the Storage-only ESM graph observable and
// avoids making app.js import Firebase Auth or several CDN modules in parallel.
(() => {
  const version = '0.6.7';
  const ready = import(`./firebase-media-module.js?v=${version}`)
    .then(module => module.createFirebaseStorageClient())
    .catch(error => {
      if (error && !error.code) error.code = 'FIREBASE_MODULE_LOAD_FAILED';
      globalThis.__AVA_CI_FIREBASE_MODULE_ERROR__ = error;
      throw error;
    });
  globalThis.__AVA_CI_FIREBASE_READY__ = ready;
  ready.catch(() => {});
})();
