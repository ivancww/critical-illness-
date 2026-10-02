import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('service worker uses deployment-independent owned cache and retires only CI caches', () => {
  assert.match(sw, /const CACHE = 'ava-ci-shell';/);
  assert.doesNotMatch(sw, /ava-ci-shell-v\d+/);
  assert.match(sw, /name\.startsWith\(LEGACY_CACHE_PREFIX\)/);
  assert.match(sw, /fetch\(request, \{ cache: 'no-store' \}\)/);
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
  assert.doesNotMatch(sw, /localStorage|indexedDB|deleteDatabase/);
});

test('registration performs an explicit update lifecycle with bounded reload', () => {
  assert.match(app, /registration\.update\(\)/);
  assert.match(app, /registration\.addEventListener\('updatefound'/);
  assert.match(app, /worker\.addEventListener\('statechange'/);
  assert.match(app, /registration\.waiting\.postMessage/);
  assert.match(app, /navigator\.serviceWorker\.addEventListener\('controllerchange'/);
  assert.match(app, /ci-sw-reload-pending/);
  assert.match(app, /window\.location\.reload\(\)/);
});

test('Pages workflow publishes the shell and source tree from main', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /cp index\.html manifest\.json sw\.js _site\//);
  assert.match(workflow, /cp -R src _site\/src/);
});
