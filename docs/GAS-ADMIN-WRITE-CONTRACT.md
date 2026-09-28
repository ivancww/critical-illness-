# Critical Illness Admin GAS write contract

The deployed Critical Illness GAS endpoint currently exposes read actions
only. PR #5 sends the following authenticated request when an authorized
Admin saves an allowlisted record:

```json
{
  "action": "adminUpdate",
  "dataset": "Plans",
  "recordId": "OYS2",
  "expectedVersion": "1",
  "fields": {
    "plan_name": "愛伴航2"
  }
}
```

The endpoint must return HTTP 200 with this shape only after the Sheet write,
record version update, and dataset-version update succeed:

```json
{
  "status": "success",
  "data": {
    "dataset": "Plans",
    "recordId": "OYS2",
    "recordVersion": "2",
    "datasetVersion": "1.0.1",
    "updatedAt": "2026-09-28T00:00:00.000Z"
  }
}
```

## Deployment-ready Apps Script update

Add this code to the existing GAS project. It deliberately does not contain
credentials, a spreadsheet ID, or a frontend write token. Set the Script
Properties `CRITICAL_ILLNESS_SPREADSHEET_ID` and
`ADMIN_EMAIL_ALLOWLIST` outside this repository, and deploy the Web App so
that the authenticated AVA/Google account is available to `Session`.

```javascript
const CI_DATASETS = {
  Plans: {
    sheet: 'Plans', id: 'plan_id', versionSetting: 'dataset_plans_version',
    fields: ['plan_name', 'short_name', 'plan_category', 'protection_style', 'active', 'sort_order']
  },
  Benefits: {
    sheet: 'Benefits', id: 'benefit_id', versionSetting: 'dataset_benefits_version',
    fields: ['benefit_type', 'benefit_name', 'payout_percent', 'max_payout', 'max_claims', 'display_text', 'sort_order', 'enabled']
  },
  Claim_Rules: {
    sheet: 'Claim_Rules', id: 'rule_id', versionSetting: 'dataset_claims_version',
    fields: ['condition_name', 'claim_phase', 'claim_option', 'shared_pool_percent', 'option_switch_rule', 'payout_type', 'payout_value', 'interval_value', 'interval_unit', 'max_claims', 'max_months', 'duration_rule', 'display_label', 'sort_order', 'enabled']
  },
  Health_Program: {
    sheet: 'Health_Program', id: 'health_rule_id', versionSetting: 'dataset_health_version',
    fields: ['program_name', 'effect_type', 'effect_value', 'annual_fee', 'feature_1', 'feature_2', 'feature_3', 'display_text', 'enabled']
  },
  Product_Content: {
    sheet: 'Product_Content', id: 'content_id', versionSetting: 'dataset_content_version',
    fields: ['category', 'title', 'short_text', 'resource_ref', 'sort_order', 'enabled']
  }
};

const CI_PROTECTED_FIELDS = [
  'plan_id', 'product_id', 'product_code', 'benefit_id', 'rule_id',
  'health_rule_id', 'content_id', 'premium_rate', 'premium_matrix',
  'rate_basis', 'protection_end_age', 'calculation_rule', 'gas_endpoint',
  'firebase_mapping', 'security'
];

function ciJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  try {
    const request = JSON.parse(event.postData.contents || '{}');
    ciAuthorizeAdmin_();
    if (request.action !== 'adminUpdate') throw new Error('Unsupported action.');
    return ciJson_({ status: 'success', data: ciUpdate_(request) });
  } catch (error) {
    return ciJson_({ status: 'error', code: error.code || 'ADMIN_WRITE_FAILED', message: error.message });
  }
}

function ciAuthorizeAdmin_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const allowed = String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL_ALLOWLIST') || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowed.includes(email)) {
    const error = new Error('Authenticated Admin permission is required.');
    error.code = 'ADMIN_UNAUTHORIZED';
    throw error;
  }
}

function ciUpdate_(request) {
  const config = CI_DATASETS[request.dataset];
  if (!config) throw new Error('Dataset is not allowlisted.');
  if (!request.recordId || typeof request.recordId !== 'string') throw new Error('A stable record ID is required.');
  if (!request.expectedVersion) throw new Error('Expected record version is required.');
  if (!request.fields || typeof request.fields !== 'object' || Array.isArray(request.fields)) throw new Error('Fields must be an object.');
  const unknown = Object.keys(request.fields).filter(key => !config.fields.includes(key));
  if (unknown.length) throw new Error('Unknown or protected fields: ' + unknown.join(', '));
  const protectedFields = Object.keys(request.fields).filter(key => CI_PROTECTED_FIELDS.includes(key));
  if (protectedFields.length) throw new Error('Protected fields cannot be changed: ' + protectedFields.join(', '));
  ciValidateTypes_(request.fields);

  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('CRITICAL_ILLNESS_SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Official spreadsheet configuration is missing.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(config.sheet);
    if (!sheet) throw new Error('Official sheet is missing: ' + config.sheet);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) throw new Error('Official sheet has no data rows.');
    const headers = values[0].map(String);
    const idColumn = headers.indexOf(config.id);
    const versionColumn = headers.indexOf('version');
    if (idColumn < 0 || versionColumn < 0) throw new Error('Required ID/version columns are missing.');
    const rowIndex = values.slice(1).findIndex(row => String(row[idColumn]) === request.recordId);
    if (rowIndex < 0) throw new Error('Official record was not found.');
    const actualRow = rowIndex + 1;
    const currentVersion = String(values[actualRow][versionColumn]);
    if (currentVersion !== String(request.expectedVersion)) {
      const error = new Error('Official record version conflict; reload before saving.');
      error.code = 'VERSION_CONFLICT';
      throw error;
    }
    Object.entries(request.fields).forEach(([key, value]) => {
      const column = headers.indexOf(key);
      if (column < 0) throw new Error('Field is absent from the official sheet: ' + key);
      sheet.getRange(actualRow + 1, column + 1).setValue(value);
    });
    const nextRecordVersion = ciNextVersion_(currentVersion);
    sheet.getRange(actualRow + 1, versionColumn + 1).setValue(nextRecordVersion);
    const datasetVersion = ciUpdateDatasetVersion_(spreadsheet, config.versionSetting);
    SpreadsheetApp.flush();
    return { dataset: request.dataset, recordId: request.recordId, recordVersion: nextRecordVersion, datasetVersion, updatedAt: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function ciUpdateDatasetVersion_(spreadsheet, settingKey) {
  const sheet = spreadsheet.getSheetByName('Settings_Versions');
  if (!sheet) throw new Error('Settings_Versions sheet is missing.');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const keyColumn = headers.indexOf('setting_key');
  const valueColumn = headers.indexOf('setting_value');
  const updatedColumn = headers.indexOf('updated_at');
  const versionColumn = headers.indexOf('version');
  const rowIndex = values.slice(1).findIndex(row => String(row[keyColumn]) === settingKey);
  if (keyColumn < 0 || valueColumn < 0 || rowIndex < 0) throw new Error('Dataset version setting is missing: ' + settingKey);
  const actualRow = rowIndex + 1;
  const next = ciBumpSemanticVersion_(String(values[actualRow][valueColumn]));
  sheet.getRange(actualRow + 1, valueColumn + 1).setValue(next);
  if (updatedColumn >= 0) sheet.getRange(actualRow + 1, updatedColumn + 1).setValue(new Date().toISOString());
  if (versionColumn >= 0) sheet.getRange(actualRow + 1, versionColumn + 1).setValue(ciNextVersion_(String(values[actualRow][versionColumn])));
  return next;
}

function ciNextVersion_(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric + 1) : ciBumpSemanticVersion_(String(value));
}

function ciBumpSemanticVersion_(value) {
  const parts = value.split('.').map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) return [parts[0], parts[1], parts[2] + 1].join('.');
  return value + '.1';
}

function ciValidateTypes_(fields) {
  ['active', 'enabled'].forEach(key => { if (key in fields && typeof fields[key] !== 'boolean') throw new Error(key + ' must be boolean.'); });
  ['sort_order'].forEach(key => { if (key in fields && (!Number.isInteger(fields[key]) || fields[key] < 0)) throw new Error(key + ' must be a non-negative integer.'); });
  ['payout_percent', 'shared_pool_percent', 'payout_value', 'interval_value', 'max_payout', 'max_claims', 'annual_fee', 'effect_value'].forEach(key => { if (key in fields && !['number', 'string'].includes(typeof fields[key])) throw new Error(key + ' must be numeric.'); });
}
```

## Required external deployment steps

1. Add the code to the existing GAS project without changing the four
   premium matrix sheets or their read action.
2. Set `CRITICAL_ILLNESS_SPREADSHEET_ID` to the official spreadsheet ID in
   Script Properties.
3. Set `ADMIN_EMAIL_ALLOWLIST` to the comma-separated authorized Admin email
   addresses in Script Properties.
4. Deploy a new Web App version with the AVA/Mother-approved authenticated
   access policy. Do not use an anonymous public write deployment.
5. Verify `action=all` and `action=premiumSheets` still read successfully.
6. Verify an authorized Admin update, a rejected unauthorized update, an
   unknown field, and a stale `expectedVersion` conflict against a test row.
7. Promote the tested deployment to the production endpoint used by the App.

Until these steps are completed, the App correctly shows the external
configuration status and real Save failures; it does not claim that a Sheet
write occurred.
