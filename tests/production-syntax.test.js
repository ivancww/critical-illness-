import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('Critical Illness production app parses as JavaScript', () => {
  assert.doesNotMatch(source, /\}age;/, 'residual truncated refreshOfficial fragment must not ship');
  assert.doesNotMatch(source, /\n\s*\}\s*age;/, 'corrupt token must not ship');
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', new URL('../src/app.js', import.meta.url)]), 'production app.js must be syntactically valid');
  assert.match(source, /function establishAdminAuthorization\(\)/);
  assert.match(source, /exchangeAdminLaunch\(\{ launchTicket, launchNonce \}\)/);
});
