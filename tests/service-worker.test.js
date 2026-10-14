import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('service worker uses deployment-independent owned cache and retires only CI caches', () => {
  assert.match(sw, /const CACHE = 'ava-ci-shell';/);
  assert.doesNotMatch(sw, /ava-ci-shell-v\d+/);
  assert.match(sw, /name\.startsWith\(LEGACY_CACHE_PREFIX\)/);
  assert.match(sw, /fetch\(networkRequest, \{ cache: 'no-store' \}\)/);
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /const VERSIONED_INDEX = `\.\/index\.html\?v=\$\{RELEASE\}`/);
  assert.match(sw, /new Request\(new URL\(VERSIONED_INDEX, request\.url\), request\)/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
  assert.doesNotMatch(sw, /SKIP_WAITING/);
  assert.doesNotMatch(sw, /package\.json/);
  assert.match(sw, /\.\/src\/version\.js/);
  assert.match(sw, /\.\/src\/domain\/input-format\.js/);
  assert.match(sw, /\.\/src\/domain\/plan-experience\.js/);
  assert.doesNotMatch(sw, /localStorage|indexedDB|deleteDatabase/);
});

test('registration checks for updates and bounds controllerchange reload across boot', () => {
  assert.match(app, /registration\.update\(\)/);
  assert.match(app, /window\.addEventListener\('online', updateRegistration\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange'/);
  assert.match(app, /window\.setInterval\(updateRegistration, 5 \* 60 \* 1000\)/);
  assert.match(app, /navigator\.serviceWorker\.addEventListener\('controllerchange'/);
  assert.match(app, /ci-sw-reload-pending/);
  assert.match(app, /fromController/);
  assert.match(app, /marker\?\.fromController && marker\.fromController !== controllerUrl/);
  assert.match(app, /window\.location\.reload\(\)/);
  assert.match(app, /updateViaCache: 'none'/);
  assert.doesNotMatch(app, /updatefound|SKIP_WAITING/);
});

test('rendering and entry routing do not depend on worker success', () => {
  assert.ok(app.indexOf('route();') < app.indexOf('registerServiceWorker();'));
  assert.match(app, /\.catch\(\(\) => setStatus\('離線外殼未能啟用。', true\)\)/);
  assert.match(app, /const appEntry = requestedEntry \|\| 'frontend'/);
  assert.match(app, /!\['frontend', 'user', 'admin'\]\.includes\(requestedEntry\)/);
  assert.match(app, /registration\.update\(\)/);
});

test('Pages workflow publishes the shell and source tree from main', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /cp index\.html manifest\.json package\.json sw\.js _site\//);
  assert.match(workflow, /cp -R src _site\/src/);
});

test('Pages artifact contains every static ES module dependency', () => {
  const sourceRoot = path.resolve('src');
  const pending = [path.join(sourceRoot, 'app.js')];
  const visited = new Set();
  const importPattern = /(?:from\s+|import\s*\()(['"])(\.\/[^'"]+)\1/g;
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    assert.equal(fs.existsSync(file), true, `missing Pages source: ${path.relative('.', file)}`);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const dependency = path.resolve(path.dirname(file), match[2].split('?')[0]);
      assert.equal(fs.existsSync(dependency), true, `missing module dependency: ${path.relative('.', dependency)}`);
      if (dependency.startsWith(sourceRoot)) pending.push(dependency);
    }
  }
  assert.ok(visited.size >= 14, `unexpectedly small module graph: ${visited.size}`);
});

test('startup guard and static Return-to-AVA work before app.js executes', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /href="https:\/\/ivancww\.github\.io\/avaplatform\/" data-return-to-ava/);
  assert.match(html, /window\.__AVA_CI_BOOT_OK__ = false/);
  assert.match(html, /Critical Illness 暫時未能載入/);
  assert.match(html, /data-startup-reload/);
  assert.match(html, /setTimeout\(showRecovery, 10000\)/);
  assert.match(html, /__AVA_CI_MARK_BOOT_OK__ = \(\) =>/);
  assert.match(html, /clearTimeout\(timer\)/);
  assert.match(app, /window\.__AVA_CI_MARK_BOOT_OK__\?\.\(\)/);
  assert.match(app, /window\.location\.assign\(context \|\| 'https:\/\/ivancww\.github\.io\/avaplatform\/'\)/);
});
