// Storage-only Firebase entry point for public CI Official media.
// Firebase Authentication is intentionally not part of this module.
import { getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getDownloadURL, getMetadata, getStorage, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyDBA5Iitb8X0qmbVfjVdYWw-M2D_9ZhFIg',
  projectId: 'medical-and-ci',
  storageBucket: 'medical-and-ci.firebasestorage.app',
  appId: '1:857984223277:web:bd64aa72fc7e374c3450a4'
});

let clientPromise;

export function createFirebaseStorageClient() {
  if (!clientPromise) {
    clientPromise = Promise.resolve().then(() => {
      const app = getApps().find(item => item.name === 'ava-critical-illness')
        || initializeApp(FIREBASE_CONFIG, 'ava-critical-illness');
      const storage = getStorage(app);
      return {
        app,
        storage,
        appSdk: { getApps, initializeApp },
        storageSdk: { getDownloadURL, getMetadata, getStorage, ref, uploadBytes }
      };
    });
  }
  return clientPromise;
}
