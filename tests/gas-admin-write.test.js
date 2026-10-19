import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('gas/Code.gs', 'utf8');

class FakeRange {
  constructor(sheet, row, column) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
  }

  getValue() {
    return this.sheet.values[this.row - 1][this.column - 1];
  }

  getFormula() {
    return this.sheet.formulas[this.row - 1][this.column - 1];
  }

  setValue(value) {
    this.sheet.book.write(this.sheet.name, this.row, this.column, value, 'setValue');
  }

  setFormula(formula) {
    this.sheet.book.write(this.sheet.name, this.row, this.column, formula, 'setFormula');
    this.sheet.formulas[this.row - 1][this.column - 1] = formula;
  }
}

class FakeSheet {
  constructor(book, name, values) {
    this.book = book;
    this.name = name;
    this.values = values.map(row => row.slice());
    this.formulas = this.values.map(row => row.map(() => ''));
  }

  getDataRange() {
    return { getValues: () => this.values.map(row => row.slice()) };
  }

  getRange(row, column) {
    return new FakeRange(this, row, column);
  }
}

class FakeBook {
  constructor({ includePlanName = true, includeVersionSetting = true } = {}) {
    this.flushCount = 0;
    this.failPlan = null;
    this.onFlush = null;
    const planHeaders = includePlanName
      ? ['plan_id', 'plan_name', 'active', 'version', 'updated_at']
      : ['plan_id', 'active', 'version', 'updated_at'];
    const planNameColumn = includePlanName ? 2 : 0;
    const planRow = includePlanName
      ? ['p1', 'Original', true, '1', new Date('2026-10-11T08:00:00.000Z')]
      : ['p1', true, '1', new Date('2026-10-11T08:00:00.000Z')];

    const settingsRows = includeVersionSetting
      ? [['dataset_plans_version', '1.0.0', '1', new Date('2026-10-11T08:00:00.000Z')]]
      : [];

    this.sheets = {
      Plans: new FakeSheet(this, 'Plans', [planHeaders, planRow]),
      Settings_Versions: new FakeSheet(this, 'Settings_Versions', [
        ['setting_key', 'setting_value', 'version', 'updated_at'],
        ...settingsRows
      ])
    };
    this.planNameColumn = planNameColumn;
  }

  getSheetByName(name) {
    return this.sheets[name] || null;
  }

  write(sheet, row, column, value, kind) {
    const event = { sheet, row, column, value, kind, flushCount: this.flushCount };
    if (this.failPlan?.(event)) throw new Error(`Injected ${kind} failure at ${sheet}!R${row}C${column}`);
    const target = this.sheets[sheet];
    target.values[row - 1][column - 1] = value;
    if (kind === 'setValue') target.formulas[row - 1][column - 1] = '';
  }

  flush() {
    this.flushCount += 1;
    this.onFlush?.(this);
  }
}

function loadGas(book, { scriptProperties = {}, utilities = {} } = {}) {
  let lockReleased = false;
  const context = {
    console,
    Date,
    Number,
    String,
    Object,
    Array,
    JSON,
    Math,
    Set,
    isNaN,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book,
      flush: () => book.flush()
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {},
        releaseLock: () => { lockReleased = true; }
      })
    },
    UrlFetchApp: {
      fetch: (_url, options) => {
        const request = JSON.parse(options.payload);
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            success: true,
            appId: 'critical-illness',
            operation: request.operation,
            contract: 'ava-admin-session-v1',
            expiresAt: new Date(Date.now() + 60000).toISOString()
          })
        };
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => scriptProperties[key] || ''
      })
    },
    Utilities: {
      newBlob: value => ({ getBytes: () => Array.from(Buffer.from(String(value), 'utf8')) }),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
      computeRsaSha256Signature: (value, key) => {
        if (utilities.computeRsaSha256Signature) return utilities.computeRsaSha256Signature(value, key);
        return [1, 2, 3];
      }
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: text => ({
        text,
        body: JSON.parse(text),
        setMimeType() { return this; }
      })
    }
  };

  vm.createContext(context);
  vm.runInContext(`${source}\nthis.__ciTestApi = { adminUpdate_, doPost };`, context, { filename: 'Code.gs' });
  return { api: context.__ciTestApi, getLockReleased: () => lockReleased };
}

function updateRequest(fields = { plan_name: 'Updated' }) {
  return {
    action: 'adminUpdate',
    appId: 'critical-illness',
    operation: 'critical-illness:official-write:Plans',
    adminSessionProof: 'session-proof',
    dataset: 'Plans',
    recordId: 'p1',
    expectedVersion: '1',
    fields
  };
}

function planState(book) {
  return book.getSheetByName('Plans').values[1].slice();
}

function settingState(book) {
  return book.getSheetByName('Settings_Versions').values[1]?.slice() || null;
}

test('isolated Sheet fixture: successful update verifies fields, record version, dataset version and persisted evidence', () => {
  const book = new FakeBook();
  const { api, getLockReleased } = loadGas(book);
  const result = api.adminUpdate_(updateRequest({ plan_name: 'Updated', active: false }));

  assert.equal(result.success, true);
  assert.equal(result.data.record.plan_name, 'Updated');
  assert.equal(result.data.record.active, false);
  assert.equal(result.data.recordVersion, '2');
  assert.equal(result.data.datasetVersion, '1.0.1');
  assert.deepEqual(result.data.verifiedFields, ['plan_name', 'active']);
  assert.equal(result.data.rollback.attempted, false);
  assert.equal(result.data.rollback.success, true);
  assert.equal(result.data.persisted, true);
  assert.equal(book.getSheetByName('Plans').values[1][3], '2');
  assert.equal(book.getSheetByName('Settings_Versions').values[1][1], '1.0.1');
  assert.equal(getLockReleased(), true);
});

test('pre-mutation validation rejects missing semantic setting and missing target column without changing Sheets', () => {
  const missingSettingBook = new FakeBook({ includeVersionSetting: false });
  const missingSettingGas = loadGas(missingSettingBook).api;
  assert.throws(() => missingSettingGas.adminUpdate_(updateRequest()), /Dataset version setting not found/);
  assert.deepEqual(planState(missingSettingBook), ['p1', 'Original', true, '1', missingSettingBook.getSheetByName('Plans').values[1][4]]);

  const missingColumnBook = new FakeBook({ includePlanName: false });
  const missingColumnGas = loadGas(missingColumnBook).api;
  assert.throws(() => missingColumnGas.adminUpdate_(updateRequest()), /Field does not exist in Sheet: plan_name/);
  assert.equal(missingColumnBook.getSheetByName('Plans').values[1][1], true);
  assert.equal(missingColumnBook.getSheetByName('Settings_Versions').values[1][1], '1.0.0');
});

test('field mutation failure rolls back the exact target cells and semantic version', () => {
  const book = new FakeBook();
  let failed = false;
  book.failPlan = event => {
    if (!failed && event.sheet === 'Plans' && event.column === 2) {
      failed = true;
      return true;
    }
    return false;
  };
  const { api } = loadGas(book);
  assert.throws(() => api.adminUpdate_(updateRequest()), /all changed cells were rolled back/);
  assert.deepEqual(planState(book).slice(0, 4), ['p1', 'Original', true, '1']);
  assert.equal(settingState(book)[1], '1.0.0');
});

test('record-version failure rolls back field, record version and dataset version', () => {
  const book = new FakeBook();
  let failed = false;
  book.failPlan = event => {
    if (!failed && event.sheet === 'Plans' && event.column === 4) {
      failed = true;
      return true;
    }
    return false;
  };
  const { api } = loadGas(book);
  assert.throws(() => api.adminUpdate_(updateRequest()), /all changed cells were rolled back/);
  assert.deepEqual(planState(book).slice(0, 4), ['p1', 'Original', true, '1']);
  assert.equal(settingState(book)[1], '1.0.0');
});

test('dataset semantic-version failure rolls back the earlier record mutation', () => {
  const book = new FakeBook();
  let failed = false;
  book.failPlan = event => {
    if (!failed && event.sheet === 'Settings_Versions' && event.column === 2) {
      failed = true;
      return true;
    }
    return false;
  };
  const { api } = loadGas(book);
  assert.throws(() => api.adminUpdate_(updateRequest()), /all changed cells were rolled back/);
  assert.deepEqual(planState(book).slice(0, 4), ['p1', 'Original', true, '1']);
  assert.equal(settingState(book)[1], '1.0.0');
});

test('read-after-write mismatch rolls back after flush and does not report success', () => {
  const book = new FakeBook();
  book.onFlush = current => {
    if (current.flushCount === 1) current.getSheetByName('Plans').values[1][1] = 'Unexpected';
  };
  const { api } = loadGas(book);
  assert.throws(() => api.adminUpdate_(updateRequest()), /all changed cells were rolled back/);
  assert.deepEqual(planState(book).slice(0, 4), ['p1', 'Original', true, '1']);
  assert.equal(settingState(book)[1], '1.0.0');
});

test('rollback failure is explicit and returned through doPost as ROLLBACK_FAILED', () => {
  const book = new FakeBook();
  let primaryFailure = true;
  book.failPlan = event => {
    if (primaryFailure && event.sheet === 'Plans' && event.column === 4) {
      primaryFailure = false;
      return true;
    }
    return !primaryFailure;
  };
  const { api } = loadGas(book);
  const response = api.doPost({ postData: { contents: JSON.stringify(updateRequest()) } });
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'ROLLBACK_FAILED');
  assert.match(response.body.error.message, /rollback failed/i);
  assert.equal(response.body.error.details.rollback.success, false);
});

test('stale revision, invalid session, protected field and incorrect operation reject before mutation', () => {
  const staleBook = new FakeBook();
  const staleGas = loadGas(staleBook).api;
  assert.throws(() => staleGas.adminUpdate_({ ...updateRequest(), expectedVersion: '0' }), /Stale record version/);

  const sessionBook = new FakeBook();
  const sessionGas = loadGas(sessionBook).api;
  assert.throws(() => {
    sessionGas.adminUpdate_({ ...updateRequest(), adminSessionProof: '' });
  }, /adminSessionProof is required/);

  const protectedBook = new FakeBook();
  const protectedGas = loadGas(protectedBook).api;
  assert.throws(() => protectedGas.adminUpdate_(updateRequest({ version: '9' })), /Unknown or protected/);
  assert.throws(() => protectedGas.adminUpdate_({ ...updateRequest(), operation: 'critical-illness:official-write:Benefits' }), /Wrong Official operation/);
  assert.deepEqual(planState(protectedBook).slice(0, 4), ['p1', 'Original', true, '1']);
});

test('direct GAS custom-token fallback is Admin-only and never returns server credentials', () => {
  const book = new FakeBook();
  const { api } = loadGas(book, {
    scriptProperties: {
      CI_FIREBASE_SERVICE_ACCOUNT_EMAIL: 'ci-broker@medical-and-ci.iam.gserviceaccount.com',
      CI_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nserver-only-test-key\n-----END PRIVATE KEY-----'
    }
  });
  const response = api.doPost({ postData: { contents: JSON.stringify({
    action: 'issueFirebaseAuthorization',
    appId: 'critical-illness',
    mode: 'admin',
    adminSessionProof: 'session-proof'
  }) } });

  assert.equal(response.body.success, true);
  assert.equal(response.body.data.claims.avaAdmin, true);
  assert.equal(response.body.data.provider, 'gas-service-account-custom-token');
  assert.equal(response.body.data.firebaseCustomToken.split('.').length, 3);
  assert.equal('privateKey' in response.body.data, false);
  assert.equal('serviceAccountJson' in response.body.data, false);
});

test('direct GAS custom-token fallback remains fail-closed without server configuration', () => {
  const book = new FakeBook();
  const { api } = loadGas(book);
  const response = api.doPost({ postData: { contents: JSON.stringify({
    action: 'issueFirebaseAuthorization',
    appId: 'critical-illness',
    mode: 'admin',
    adminSessionProof: 'session-proof'
  }) } });

  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'FIREBASE_AUTH_CONFIGURATION_REQUIRED');
});
