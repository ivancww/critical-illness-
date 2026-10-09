import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Critical Illness production app parses as JavaScript', () => {
  assert.doesNotMatch(source, /\}age;/, 'residual truncated refreshOfficial fragment must not ship');
  assert.doesNotMatch(source, /\n\s*\}\s*age;/, 'corrupt token must not ship');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-syntax-'));
  const modulePath = path.join(dir, 'app.mjs');
  fs.writeFileSync(modulePath, source);
  assert.doesNotThrow(
    () => execFileSync(process.execPath, ['--check', modulePath]),
    'production app.js must be syntactically valid'
  );
  assert.match(source, /function establishAdminAuthorization\(\)/);
  assert.match(source, /exchangeAdminLaunch\(\{ launchTicket, launchNonce \}\)/);
});

assert.match(index, /Admin 啟動失敗/);
assert.match(index, /unhandledrejection/);
assert.match(index, /Admin 初始化逾時/);
