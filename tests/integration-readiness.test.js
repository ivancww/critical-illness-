import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');
const compliance = fs.readFileSync('docs/MOTHER-COMPLIANCE.md', 'utf8');

test('entry contract exposes frontend and user modes and rejects unsupported entries', () => {
  assert.match(app, /const appEntry = requestedEntry \|\| 'frontend'/);
  assert.match(app, /const unsupportedEntry = Boolean\(requestedEntry\)/);
  assert.match(app, /function unsupportedEntryPage\(\)/);
  assert.match(html, /data-return-to-ava/);
});

test('User flow includes Frontstage edit, Preview, and Save Local', () => {
  assert.match(app, /function editPage\(\)/);
  assert.match(app, /id="preview-edit"/);
  assert.match(app, /id="save-preview"/);
  assert.match(app, /function saveEditDraft\(\)/);
  assert.match(app, /persistUser\(\); setStatus\('User Override 已保存至本機。'\)/);
});

test('Return to AVA uses caller context and no guessed deployment URL', () => {
  assert.match(app, /function returnContext\(\)/);
  assert.match(app, /document\.referrer/);
  assert.match(app, /function returnToAva\(event\)/);
  assert.doesNotMatch(app, /https:\/\/ivancww\.github\.io\/avaplatform/);
  assert.doesNotMatch(html, /\.\.\/avaplatform\//);
  assert.match(compliance, /caller-provided browser return context/);
});

console.log('Critical Illness integration-readiness contract checks passed');
