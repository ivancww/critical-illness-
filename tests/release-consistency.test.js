import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = file => fs.readFileSync(file, 'utf8');
const packageMetadata = JSON.parse(read('package.json'));
const versionSource = read('src/version.js');
const html = read('index.html');
const sw = read('sw.js');

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(file));
    else if (entry.isFile() && file.endsWith('.js')) files.push(file);
  }
  return files;
}

test('browser release identity is synchronized across package, modules, shell, and service worker', () => {
  const appVersion = versionSource.match(/export const APP_VERSION = '([^']+)'/)?.[1];
  assert.ok(appVersion, 'src/version.js must export APP_VERSION');
  assert.equal(packageMetadata.version, appVersion);
  assert.match(sw, new RegExp("const RELEASE = '" + appVersion.replaceAll('.', '\\.') + "'"));

  const browserSources = [html, sw, ...sourceFiles('src').map(read)];
  const queryVersions = browserSources.flatMap(source => [...source.matchAll(/[?&]v=([0-9]+\.[0-9]+\.[0-9]+)/g)].map(match => match[1]));
  assert.ok(queryVersions.length > 0, 'browser assets must carry release query versions');
  assert.ok(queryVersions.every(version => version === appVersion), 'found mixed browser query versions: ' + queryVersions.join(', '));
  assert.match(html, new RegExp("href=\"\\./src/styles\\.css\\?v=" + appVersion.replaceAll('.', '\\.') + "\""));
  assert.match(html, new RegExp("src=\"\\./src/app\\.js\\?v=" + appVersion.replaceAll('.', '\\.') + "\""));
  assert.doesNotMatch(browserSources.join('\n'), /(?:0\.5\.0|0\.6\.0)(?:["']|&|\b)/, 'stale release identity remains in browser assets');
});

test('release guard keeps the stable cache and versioned shell contract', () => {
  assert.match(sw, /const CACHE = 'ava-ci-shell';/);
  assert.match(sw, /VERSIONED_INDEX =/);
  assert.match(sw, /const SHELL = \[/);
  assert.match(sw, /src\/app\.js\?v=\$\{RELEASE\}/);
  assert.doesNotMatch(sw, /localStorage\.clear\(\)|indexedDB\.deleteDatabase\(\)|unregister\(\)/);
});
