/* AVA Critical Illness Official Data API
 * Bound to: 危疾app info
 * Keep the existing Web App deployment and /exec URL.
 */

const CONFIG = {
  API_VERSION: '1.1.0',
  APP_ID: 'critical-illness',
  WRITE_OPERATION: 'official-write',
  PLATFORM_VERIFY_ENDPOINT: 'https://script.google.com/macros/s/AKfycbzVf1fuxcq8GPSOzS8WvcAtubqaawFj0rbVjxe0LOLKfwbYkRZf7Vs61Q0T73UG6dznww/exec',
  DATA_SHEETS: ['Plans', 'Benefits', 'Claim_Rules', 'Health_Program', 'Product_Content', 'Settings_Versions'],
  PREMIUM_SHEETS: {
    OYS2_MALE: '男愛伴航2保費',
    OYS2_FEMALE: '女愛伴航2保費',
    SCE_MALE: '男簡護危疾保保費',
    SCE_FEMALE: '女簡護危疾保保費'
  },
  DATASET_VERSION_KEYS: {
    Plans: 'dataset_plans_version',
    Benefits: 'dataset_benefits_version',
    Claim_Rules: 'dataset_claims_version',
    Health_Program: 'dataset_health_version',
    Product_Content: 'dataset_content_version'
  }
};

const ADMIN_DATASETS = {
  Plans: {
    id: 'plan_id',
    fields: ['plan_name', 'short_name', 'plan_category', 'protection_style', 'active', 'sort_order']
  },
  Benefits: {
    id: 'benefit_id',
    fields: ['benefit_type', 'benefit_name', 'payout_percent', 'max_payout', 'max_claims', 'display_text', 'sort_order', 'enabled']
  },
  Claim_Rules: {
    id: 'rule_id',
    fields: ['condition_name', 'claim_phase', 'claim_option', 'shared_pool_percent', 'option_switch_rule', 'payout_type', 'payout_value', 'interval_value', 'interval_unit', 'max_claims', 'max_months', 'duration_rule', 'display_label', 'sort_order', 'enabled']
  },
  Health_Program: {
    id: 'health_rule_id',
    fields: ['program_name', 'effect_type', 'effect_value', 'annual_fee', 'feature_1', 'feature_2', 'feature_3', 'display_text', 'enabled']
  },
  Product_Content: {
    id: 'content_id',
    fields: ['category', 'title', 'short_text', 'resource_ref', 'sort_order', 'enabled']
  },
  Settings_Versions: {
    id: 'setting_key',
    fields: ['setting_value']
  }
};

const PROTECTED_FIELDS = new Set([
  'id',
  'plan_id',
  'benefit_id',
  'rule_id',
  'health_rule_id',
  'content_id',
  'setting_key',
  'product_code',
  'currency',
  'rate_basis',
  'data_type',
  'description',
  'version',
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
  'row_version',
  'record_version',
  'dataset_version',
  'shared_pool_id',
  'sequence',
  'premium_rate',
  'premium_matrix',
  'calculation_rule',
  'security'
]);

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function success_(data, extra) {
  return Object.assign({
    success: true,
    apiVersion: CONFIG.API_VERSION,
    data: data || {}
  }, extra || {});
}

function failure_(code, message, details) {
  return json_({
    success: false,
    apiVersion: CONFIG.API_VERSION,
    error: {
      code: code,
      message: message,
      details: details || null
    }
  });
}

function requestBody_(e) {
  try {
    return JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (_) {
    return null;
  }
}

function book_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Bound spreadsheet is unavailable');
  return book;
}

function rawSheet_(name) {
  const sheet = book_().getSheetByName(name);
  if (!sheet) throw new Error('Unknown sheet: ' + name);

  const values = sheet.getDataRange().getValues();
  if (!values.length) return { headers: [], rows: [] };

  const headers = values[0].map(function (value) {
    return String(value || '').trim();
  });

  const rows = values.slice(1).filter(function (row) {
    return row.some(function (value) {
      return value !== '' && value !== null;
    });
  });

  return {
    headers: headers,
    rows: rows
  };
}

function records_(name) {
  const raw = rawSheet_(name);

  return raw.rows.map(function (row, index) {
    const record = { __rowNumber: index + 2 };

    raw.headers.forEach(function (header, column) {
      if (header) record[header] = row[column];
    });

    return record;
  });
}

function headers_(name) {
  const raw = rawSheet_(name);
  const result = {};

  raw.headers.forEach(function (header, index) {
    if (header) result[header] = index + 1;
  });

  return result;
}

function settingsRecord_(key) {
  return records_('Settings_Versions').find(function (record) {
    return String(record.setting_key || '') === String(key);
  }) || null;
}

function semanticVersions_() {
  const result = {};

  records_('Settings_Versions').forEach(function (record) {
    const key = String(record.setting_key || '');

    if (key.indexOf('dataset_') === 0 && key.slice(-8) === '_version') {
      result[key] = String(record.setting_value || '');
    }
  });

  return result;
}

function nextSemanticVersion_(value) {
  const parts = String(value || '1.0.0')
    .split('.')
    .map(function (part) {
      return Number(part) || 0;
    });

  while (parts.length < 3) parts.push(0);

  parts[2] += 1;

  return parts.slice(0, 3).join('.');
}

function recordVersion_(record) {
  if (
    record.version === undefined ||
    record.version === null ||
    record.version === ''
  ) {
    throw new Error('Record has no technical version');
  }

  return String(record.version);
}

function nextRecordVersion_(value) {
  if (!/^\d+$/.test(String(value))) {
    throw new Error('Record version is not numeric');
  }

  return String(Number(value) + 1);
}

function readStructured_() {
  const data = {};

  CONFIG.DATA_SHEETS.forEach(function (name) {
    data[name] = records_(name).map(function (record) {
      const copy = Object.assign({}, record);
      delete copy.__rowNumber;
      return copy;
    });
  });

  data._meta = {
    versions: semanticVersions_()
  };

  return data;
}

function readPremium_() {
  const result = {};

  Object.keys(CONFIG.PREMIUM_SHEETS).forEach(function (key) {
    const raw = rawSheet_(CONFIG.PREMIUM_SHEETS[key]);
    result[key] = [raw.headers].concat(raw.rows);
  });

  return result;
}

function doGet(e) {
  try {
    const parameters = (e && e.parameter) || {};
    const action = String(parameters.action || 'all');

    if (action === 'health') {
      return json_(success_({
        status: 'ok',
        source: '危疾app info',
        versions: semanticVersions_()
      }));
    }

    if (action === 'all') {
      return json_(success_(readStructured_()));
    }

    if (action === 'premiumSheets') {
      return json_(success_(readPremium_()));
    }

    if (action === 'sheet') {
      const name = String(parameters.sheet || parameters.name || '');

      if (CONFIG.DATA_SHEETS.indexOf(name) === -1) {
        return failure_(
          'UNKNOWN_SHEET',
          'Sheet is not an allowed Official dataset'
        );
      }

      return json_(success_(
        records_(name).map(function (record) {
          delete record.__rowNumber;
          return record;
        })
      ));
    }

    return failure_('UNKNOWN_ACTION', 'Unsupported GET action');
  } catch (error) {
    return failure_(
      'READ_FAILED',
      String(error && error.message || error)
    );
  }
}

function platformRequest_(payload) {
  const response = UrlFetchApp.fetch(
    CONFIG.PLATFORM_VERIFY_ENDPOINT,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  const status = response.getResponseCode();

  let result;

  try {
    result = JSON.parse(response.getContentText() || '{}');
  } catch (_) {
    result = {};
  }

  if (
    status < 200 ||
    status >= 300 ||
    result.success !== true
  ) {
    throw new Error('Platform authorization rejected');
  }

  return result;
}

function exchangeAppLaunch_(request) {
  const launchTicket = String(request.launchTicket || '').trim();

  if (!launchTicket) {
    throw new Error('launchTicket is required');
  }

  const result = platformRequest_({
    action: 'exchangeAppLaunch',
    appId: CONFIG.APP_ID,
    launchTicket: launchTicket
  });

  if (
    typeof result.appGrant !== 'string' ||
    !result.appGrant.trim()
  ) {
    throw new Error('Platform did not return appGrant');
  }

  return {
    success: true,
    apiVersion: CONFIG.API_VERSION,
    appId: CONFIG.APP_ID,
    appGrant: result.appGrant,
    expiresAt: result.expiresAt || null
  };
}

function verifyAppGrant_(grant) {
  grant = String(grant || '').trim();

  if (!grant) {
    throw new Error('appGrant is required');
  }

  const result = platformRequest_({
    action: 'verifyAppGrant',
    appId: CONFIG.APP_ID,
    operation: CONFIG.WRITE_OPERATION,
    appGrant: grant
  });

  if (String(result.appId || '') !== CONFIG.APP_ID) {
    throw new Error('Wrong app grant');
  }

  if (String(result.operation || '') !== CONFIG.WRITE_OPERATION) {
    throw new Error('Wrong grant operation');
  }

  return result;
}

function validateValue_(field, value) {
  if (value !== null && typeof value === 'object') {
    throw new Error('Invalid value type: ' + field);
  }

  if (
    ['active', 'enabled'].indexOf(field) !== -1 &&
    typeof value !== 'boolean'
  ) {
    throw new Error(field + ' must be boolean');
  }

  if (
    field === 'sort_order' &&
    (!Number.isInteger(Number(value)) || Number(value) < 0)
  ) {
    throw new Error('sort_order must be a non-negative integer');
  }

  if (
    [
      'payout_percent',
      'shared_pool_percent',
      'payout_value',
      'interval_value',
      'max_payout',
      'max_claims',
      'max_months',
      'annual_fee',
      'effect_value'
    ].indexOf(field) !== -1 &&
    value !== '' &&
    isNaN(Number(value))
  ) {
    throw new Error(field + ' must be numeric');
  }
}

function validateFields_(dataset, fields, recordId) {
  const config = ADMIN_DATASETS[dataset];

  if (!config) {
    throw new Error('Dataset is not Admin-editable');
  }

  if (
    !fields ||
    typeof fields !== 'object' ||
    Array.isArray(fields)
  ) {
    throw new Error('Admin fields must be an object');
  }

  const keys = Object.keys(fields);

  if (!keys.length) {
    throw new Error('Admin fields cannot be empty');
  }

  keys.forEach(function (field) {
    if (
      PROTECTED_FIELDS.has(field) ||
      config.fields.indexOf(field) === -1
    ) {
      throw new Error('Unknown or protected Admin field: ' + field);
    }

    validateValue_(field, fields[field]);
  });

  if (
    dataset === 'Settings_Versions' &&
    !/^dataset_(plans|benefits|claims|health|content|premium)_version$/
      .test(String(recordId || ''))
  ) {
    throw new Error(
      'Only dataset version records may be published through Admin write-back'
    );
  }
}

function findRecord_(dataset, recordId) {
  const config = ADMIN_DATASETS[dataset];

  const record = records_(dataset).find(function (item) {
    return String(item[config.id] || '') === String(recordId);
  });

  if (!record) {
    throw new Error('Record not found');
  }

  return record;
}

function bumpDatasetSemanticVersion_(dataset) {
  const key = CONFIG.DATASET_VERSION_KEYS[dataset];

  if (!key) return null;

  const record = settingsRecord_(key);

  if (!record) {
    throw new Error('Dataset version setting not found: ' + key);
  }

  const columns = headers_('Settings_Versions');
  const sheet = book_().getSheetByName('Settings_Versions');
  const next = nextSemanticVersion_(record.setting_value);

  sheet
    .getRange(record.__rowNumber, columns.setting_value)
    .setValue(next);

  if (columns.updated_at) {
    sheet
      .getRange(record.__rowNumber, columns.updated_at)
      .setValue(new Date());
  }

  return next;
}

function adminUpdate_(request) {
  verifyAppGrant_(request.appGrant);

  const dataset = String(request.dataset || '').trim();
  const config = ADMIN_DATASETS[dataset];

  if (!config) {
    throw new Error('Dataset is not Admin-editable');
  }

  const recordId = String(request.recordId || '').trim();

  if (!recordId) {
    throw new Error('recordId is required');
  }

  const suppliedExpectedVersion = request.expectedVersion;

  if (
    suppliedExpectedVersion === undefined ||
    suppliedExpectedVersion === null ||
    suppliedExpectedVersion === ''
  ) {
    throw new Error('expectedVersion is required');
  }

  const expectedVersion = String(suppliedExpectedVersion);
  const fields = Object.assign(
    {},
    request.fields || request.patch || {}
  );

  validateFields_(dataset, fields, recordId);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const current = findRecord_(dataset, recordId);
    const actualVersion = recordVersion_(current);

    if (expectedVersion !== actualVersion) {
      throw new Error('Stale record version');
    }

    const sheet = book_().getSheetByName(dataset);
    const columns = headers_(dataset);

    Object.keys(fields).forEach(function (field) {
      if (!columns[field]) {
        throw new Error('Field does not exist in Sheet: ' + field);
      }

      sheet
        .getRange(current.__rowNumber, columns[field])
        .setValue(fields[field]);
    });

    if (!columns.version) {
      throw new Error('Technical record version column is missing');
    }

    sheet
      .getRange(current.__rowNumber, columns.version)
      .setValue(nextRecordVersion_(actualVersion));

    if (columns.updated_at) {
      sheet
        .getRange(current.__rowNumber, columns.updated_at)
        .setValue(new Date());
    }

    const datasetVersion =
      dataset === 'Settings_Versions'
        ? null
        : bumpDatasetSemanticVersion_(dataset);

    SpreadsheetApp.flush();

    const fresh = findRecord_(dataset, recordId);
    delete fresh.__rowNumber;

    return success_({
      dataset: dataset,
      record: fresh,
      recordVersion: String(fresh.version),
      datasetVersion: datasetVersion,
      authoritative: true,
      readAfterWrite: true
    });
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  const request = requestBody_(e);

  if (!request) {
    return failure_(
      'INVALID_JSON',
      'Request body must be valid JSON'
    );
  }

  try {
    const action = String(request.action || '').trim();

    if (action === 'exchangeAppLaunch') {
      return json_(exchangeAppLaunch_(request));
    }

    if (action === 'adminUpdate') {
      return json_(adminUpdate_(request));
    }

    return failure_(
      'UNKNOWN_ACTION',
      'Unsupported POST action'
    );
  } catch (error) {
    const message = String(error && error.message || error);

    if (/grant|authorization|platform/i.test(message)) {
      return failure_('ADMIN_UNAUTHORIZED', message);
    }

    if (/stale|version/i.test(message)) {
      return failure_('STALE_WRITE', message);
    }

    if (
      /protected|allowlist|editable|field|dataset|record|patch|expected|numeric|boolean/i
        .test(message)
    ) {
      return failure_('ADMIN_WRITE_REJECTED', message);
    }

    return failure_('REQUEST_FAILED', message);
  }
}
