import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');
const version = fs.readFileSync('src/version.js', 'utf8');
const packageMetadata = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('visible CI release keeps one version source and a lightweight persistent header', () => {
  assert.equal(packageMetadata.version, '0.2.3');
  assert.match(version, /export const APP_VERSION = '0\.2\.2'/);
  assert.match(app, /import \{ APP_VERSION \} from '\.\/version\.js'/);
  assert.doesNotMatch(app, /package\.json.*type:\s*'json'/);
  assert.match(app, /document\.querySelector\('#app-version'\)\.textContent = `v\$\{APP_VERSION\}`/);
  assert.match(html, /id="app-version"/);
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.match(header, /返回 AVA/);
  assert.doesNotMatch(header, /開始了解|查看方案/);
});

test('home and guided navigation preserve direct plan access and stateful flow controls', () => {
  const home = app.slice(app.indexOf('function home()'), app.indexOf('function flowBody(step)'));
  const flow = app.slice(app.indexOf('function flowPage()'), app.indexOf('function parseMoney()'));
  assert.match(home, /開始了解/);
  assert.match(home, /直接查看方案/);
  assert.match(home, /actions actions--end/);
  assert.match(flow, /step === 0/);
  assert.doesNotMatch(flow, /step === 0[^`]+disabled/);
  assert.match(flow, /id="flow-back"/);
  assert.match(flow, /page-control/);
  assert.match(flow, /actions actions--end/);
  assert.match(flow, /直接查看方案/);
  assert.match(app, /previousFlowStep\(flow\(\)\)/);
  assert.match(app, /nextFlowStep\(flow\(\)\)/);
});

test('visible release does not replace the independent update lifecycle or clear user data', () => {
  const sw = fs.readFileSync('sw.js', 'utf8');
  assert.match(sw, /const CACHE = 'ava-ci-shell';/);
  assert.doesNotMatch(sw, /ava-ci-shell-v0\.2\.1/);
  assert.match(app, /registration\.update\(\)/);
  assert.match(sw, /request\.mode === 'navigate' \? '\.\/index\.html'/);
  assert.doesNotMatch(app + sw, /localStorage\.clear\(\)|indexedDB\.deleteDatabase\(/);
});

test('package metadata remains synchronized with the sole browser-safe runtime version', () => {
  const runtimeVersion = version.match(/APP_VERSION = '([^']+)'/)?.[1];
  assert.equal(runtimeVersion, packageMetadata.version);
});
