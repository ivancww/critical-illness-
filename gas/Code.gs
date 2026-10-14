/* AVA Critical Illness Official Data API
 * Bound to: Âç±Áñæapp info
 * Keep the existing Web App deployment and /exec URL.
 */

const CONFIG = {
  API_VERSION: '1.2.0',
  APP_ID: 'critical-illness',
  PLATFORM_VERIFY_ENDPOINT: 'https://script.google.com/macros/s/AKfycbzVf1fuxcq8GPSOzS8WvcAtubqaawFj0rbVjxe0LOLKfwbYkRZf7Vs61Q0T73UG6dznww/exec',
  DATA_SHEETS: ['Plans', 'Benefits', 'Claim_Rules', 'Health_Program', 'Product_Content', 'Settings_Versions'],
  PREMIUM_SHEETS: {
    OYS2_MALE: 'Áî∑ÊÑõ‰º¥Ëà™2‰øùË≤ª',
    OYS2_FEMALE: 'Â•≥ÊÑõ‰º¥Ëà™2‰øùË≤ª',
    SCE_MALE: 'Áî∑Á∞°Ë≠∑Âç±Áñæ‰øù‰øùË≤ª',
    SCE_FEMALE: 'Â•≥Á∞°Ë≠∑Âç±Áñæ‰øù‰øùË≤ª'
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
    fields: ['category', 'title', 'short_text', 'resource_type', 'resource_ref', 'sort_order', 'enabled']
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
        source: 'Âç±Áñæapp info',
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
      contentType: 'text/plain;charset=utf-8',
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

function exchangeAdminSession_(request) {
  const launchTicket = String(request.launchTicket || '').trim();
  const launchNonce = String(request.launchNonce || '').trim();
  const browserProof = String(request.browserProof || '').trim();

  if (String(request.appId || '') !== CONFIG.APP_ID || !launchTicket || !launchNonce || !browserProof) {
    throw new Error('Invalid browser-bound Admin launch');
  }

  const result = platformRequest_({
    action: 'exchangeAdminSession',
    appId: CONFIG.APP_ID,
    launchTicket: launchTicket,
    launchNonce: launchNonce,
    browserProof: browserProof
  });
  const expiry = Date.parse(result.expiresAt || '');

  if (String(result.appId || '') !== CONFIG.APP_ID || result.contract !== 'ava-admin-session-v1' || typeof result.adminSessionProof !== 'string' || !result.adminSessionProof.trim() || !Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new Error('Platform did not return a valid Admin session proof');
  }

  return {
    success: true,
    apiVersion: CONFIG.API_VERSION,
    appId: CONFIG.APP_ID,
    adminSessionProof: result.adminSessionProof,
    expiresAt: result.expiresAt,
    contract: result.contract
  };
}

function verifyAdminSession_(proof, operation) {
  proof = String(proof || '').trim();
  operation = String(operation || '').trim();
  if (!proof) throw new Error('adminSessionProof is required');
  if (!/^critical-illness:official-write:[A-Za-z0-9_]+$/.test(operation)) throw new Error('Invalid Official operation');

  const result = platformRequest_({ action: 'verifyAdminSession', appId: CONFIG.APP_ID, operation: operation, adminSessionProof: proof });
  const expiry = Date.parse(result.expiresAt || '');
  if (String(result.appId || '') !== CONFIG.APP_ID || String(result.operation || '') !== operation || result.contract !== 'ava-admin-session-v1' || !Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new Error('Invalid or expired Admin session');
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

function sameValue_(actual, expected) {
  if (actual instanceof Date || expected instanceof Date) {
    const actualTime = actual instanceof Date ? actual.getTime() : NaN;
    const expectedTime = expected instanceof Date ? expected.getTime() : NaN;
    return Number.isFinite(actualTime) && Number.isFinite(expectedTime) && actualTime === expectedTime;
  }

  if (expected === null || expected === undefined) {
    return actual === null || actual === undefined || actual === '';
  }

  if (typeof expected === 'boolean') return actual === expected;
  if (typeof expected === 'number') return Number(actual) === expected;
  return String(actual) === String(expected);
}

function cellSnapshot_(sheetName, row, column) {
  const sheet = book_().getSheetByName(sheetName);
  const range = sheet.getRange(row, column);

  return {
    sheet: sheetName,
    row: row,
    column: column,
    value: range.getValue(),
    formula: String(range.getFormula() || '')
  };
}

function restoreCellSnapshot_(snapshot) {
  const sheet = book_().getSheetByName(snapshot.sheet);
  const range = sheet.getRange(snapshot.row, snapshot.column);

  if (snapshot.formula) {
    range.setFormula(snapshot.formula);
  } else {
    range.setValue(snapshot.value);
  }
}

function cellMatchesSnapshot_(snapshot) {
  const sheet = book_().getSheetByName(snapshot.sheet);
  const range = sheet.getRange(snapshot.row, snapshot.column);
  const formula = String(range.getFormula() || '');

  if (formula !== snapshot.formula) return false;
  return snapshot.formula ? true : sameValue_(range.getValue(), snapshot.value);
}

function rollbackAdminMutation_(snapshots) {
  const result = {
    attempted: true,
    success: false,
    restoredCells: 0,
    error: null
  };

  try {
    snapshots.forEach(function (snapshot) {
      restoreCellSnapshot_(snapshot);
    });

    SpreadsheetApp.flush();

    snapshots.forEach(function (snapshot) {
      if (!cellMatchesSnapshot_(snapshot)) {
        throw new Error(
          'Rollback verification failed for ' + snapshot.sheet + '!R' + snapshot.row + 'C' + snapshot.column
        );
      }
    });

    result.success = true;
    result.restoredCells = snapshots.length;
    return result;
  } catch (error) {
    result.error = String(error && error.message || error);
    return result;
  }
}

function datasetVersionTarget_(dataset) {
  const key = CONFIG.DATASET_VERSION_KEYS[dataset];

  if (!key) return null;

  const record = settingsRecord_(key);

  if (!record) {
    throw new Error('Dataset version setting not found: ' + key);
  }

  const columns = headers_('Settings_Versions');

  if (!columns.setting_key || !columns.setting_value) {
    throw new Error('Settings_Versions schema is missing setting_key or setting_value');
  }

  return {
    key: key,
    record: record,
    columns: columns,
    sheet: book_().getSheetByName('Settings_Versions')
  };
}

function validateAdminSheetSchema_(dataset, config, columns, fields, ve]Yô\ú⁄[€àOOH[ôYö[ôYà›\YY^X›Yô\ú⁄[€àOOHù[à›\YY^X›Yô\ú⁄[€àOOH	…¬à
H¬àõ›»ô]»\úõ‹ä	Ÿ^X›Yô\ú⁄[€à\»ô\]Z\ôY	 N¬àBÇà€€ú›^X›Yô\ú⁄[€àH›ö[ô ›\YY^X›Yô\ú⁄[€äN¬à€€ú›öY[»HÿöôX›ò\‹⁄Y€äàﬂKàô\]Y\›ôöY[»ô\]Y\›ú]⁄ﬂBà
N¬Çàò[Y]QöY[◊ ]\Ÿ]öY[ÀôX€‹ôY
N¬Çà€€ú›ÿ⁄»Hÿ⁄‘Ÿ\ùöXŸKôŸ]ÿ‹ö\ÿ⁄ 
N¬àÿ⁄ÀùÿZ]ÿ⁄ ML
N¬Çà]]]][€î›\ùYHò[ŸN¬à]€ò\⁄›»H◊N¬ÇàûH¬à€€ú››\úô[ùHö[ôôX€‹ô ]\Ÿ]ôX€‹ôY
N¬à€€ú›X›X[ô\ú⁄[€àHôX€‹ôô\ú⁄[€ó ›\úô[ù
N¬ÇàYà
^X›Yô\ú⁄[€àOOHX›X[ô\ú⁄[€äH¬àõ›»ô]»\úõ‹ä	‘›[HôX€‹ôô\ú⁄[€â N¬àBÇà€€ú›⁄Y]Hõ€⁄◊ 
KôŸ]⁄Y]ûSò[YJ]\Ÿ]
N¬à€€ú›€€[[ú»HXY\ú◊ ]\Ÿ]
N¬à€€ú›ô\ú⁄[€ï\ôŸ]H]\Ÿ]ô\ú⁄[€ï\ôŸ] ]\Ÿ]
N¬Çàò[Y]PYZ[î⁄Y]ÿ⁄[XW ]\Ÿ]€€ôöYÀ€€[[úÀöY[Àô\ú⁄[€ï\ôŸ]
N¬Çà€ò\⁄›»HÿöôX›öŸ^\ öY[ KõX\
ù[ò›[€à
öY[
H¬àô]\õàŸ[€ò\⁄› ]\Ÿ]›\úô[ùó◊‹õ›”ù[Xô\ã€€[[ú÷ŸöY[JN¬àJN¬Çà€ò\⁄›Àú\⁄
Ÿ[€ò\⁄› ]\Ÿ]›\úô[ùó◊‹õ›”ù[Xô\ã€€[[úÀùô\ú⁄[€äJN¬ÇàYà
€€[[úÀù\]Yÿ]
H¬à€ò\⁄›Àú\⁄
Ÿ[€ò\⁄› ]\Ÿ]›\úô[ùó◊‹õ›”ù[Xô\ã€€[[úÀù\]Yÿ]
JN¬àBÇàYà
ô\ú⁄[€ï\ôŸ]
H¬à€ò\⁄›Àú\⁄
Ÿ[€ò\⁄› 	‘Ÿ][ô‹◊’ô\ú⁄[€ú…Àô\ú⁄[€ï\ôŸ]úôX€‹ôó◊‹õ›”ù[Xô\ãô\ú⁄[€ï\ôŸ]ò€€[[úÀúŸ][ô◊›ò[YJJN¬ÇàYà
ô\ú⁄[€ï\ôŸ]ò€€[[úÀù\]Yÿ]
H¬à€ò\⁄›Àú\⁄
Ÿ[€ò\⁄› 	‘Ÿ][ô‹◊’ô\ú⁄[€ú…Àô\ú⁄[€ï\ôŸ]úôX€‹ôó◊‹õ›”ù[Xô\ãô\ú⁄[€ï\ôŸ]ò€€[[úÀù\]Yÿ]
JN¬àBàBÇà]]][€î›\ùYHùYN¬ÇàÿöôX›öŸ^\ öY[ Kôõ‹ëXX⁄
ù[ò›[€à
öY[
H¬à⁄Y]àôŸ]ò[ôŸJ›\úô[ùó◊‹õ›”ù[Xô\ã€€[[ú÷ŸöY[JBàúŸ]ò[YJöY[÷ŸöY[JN¬àJN¬Çà⁄Y]àôŸ]ò[ôŸJ›\úô[ùó◊‹õ›”ù[Xô\ã€€[[úÀùô\ú⁄[€äBàúŸ]ò[YJô^ôX€‹ôô\ú⁄[€ó X›X[ô\ú⁄[€äJN¬ÇàYà
€€[[úÀù\]Yÿ]
H¬à⁄Y]àôŸ]ò[ôŸJ›\úô[ùó◊‹õ›”ù[Xô\ã€€[[úÀù\]Yÿ]
BàúŸ]ò[YJô]»]J
JN¬àBÇà€€ú›]\Ÿ]ô\ú⁄[€àBà]\Ÿ]OOH	‘Ÿ][ô‹◊’ô\ú⁄[€ú…¬à»›ö[ô öY[ÀúŸ][ô◊›ò[YHOOH[ôYö[ôY»›\úô[ùúŸ][ô◊›ò[YHàöY[ÀúŸ][ô◊›ò[YJBààù[\]\Ÿ]Ÿ[X[ùX’ô\ú⁄[€ó ]\Ÿ]
N¬Çà‹ôXY⁄Y]\ôõ\⁄

N¬Çà€€ú›úô\⁄Hö[ôôX€‹ô ]\Ÿ]ôX€‹ôY
N¬àô\öYûT\ú⁄\›YYZ[ï‹ö]W ]\Ÿ]ôX€‹ôYöY[ÀX›X[ô\ú⁄[€ãúô\⁄]\Ÿ]ô\ú⁄[€äN¬à[]Húô\⁄ó◊‹õ›”ù[Xô\é¬Çàô]\õà›XÿŸ\‹◊ ¬à]\Ÿ]à]\Ÿ]àôX€‹ôàúô\⁄àôX€‹ôô\ú⁄[€éà›ö[ô úô\⁄ùô\ú⁄[€äKà]\Ÿ]ô\ú⁄[€éà]\Ÿ]ô\ú⁄[€ãà]]‹ö]]]ôNàùYKàôXYYù\ï‹ö]NàùYKà\ú⁄\›YàùYKàô\öYöYYöY[ŒàÿöôX›öŸ^\ öY[ Kàõ€òX⁄Œà¬à][\Yàò[ŸKà›XÿŸ\‹ŒàùYBàBàJN¬àHÿ]⁄
\úõ‹äH¬àYà
]]][€î›\ùY
H¬à€€ú›õ€òX⁄»Hõ€òX⁄–YZ[ì]]][€ó €ò\⁄› N¬ÇàYà
\õ€òX⁄Àú›XÿŸ\‹ H¬à€€ú›õ€òX⁄—\úõ‹àHô]»\úõ‹äà	”ŸôöX⁄X[‹ö]HòZ[Y[ôõ€òX⁄»òZ[Yà	»
»õ€òX⁄Àô\úõ‹Çà
N¬àõ€òX⁄—\úõ‹ãò€ŸHH	‘ì”êP“◊—êRSQ	Œ¬àõ€òX⁄—\úõ‹ãô]Z[»H¬àõ€òX⁄Œàõ€òX⁄Àà‹öY⁄[ò[\úõ‹éà›ö[ô \úõ‹à	âà\úõ‹ãõY\‹ÿYŸH\úõ‹äBàN¬àõ›»õ€òX⁄—\úõ‹é¬àBÇà€€ú›õ€YòX⁄—\úõ‹àHô]»\úõ‹äà	”ŸôöX⁄X[‹ö]HòZ[Y»[⁄[ôŸYŸ[»Ÿ\ôHõ€YòX⁄Œà	»
»›ö[ô \úõ‹à	âà\úõ‹ãõY\‹ÿYŸH\úõ‹äBà
N¬àõ€YòX⁄—\úõ‹ãò€ŸHH	’‘íUW‘ì”Q–êP“…Œ¬àõ€YòX⁄—\úõ‹ãô]Z[»H¬àõ€òX⁄Œàõ€òX⁄Àà‹öY⁄[ò[\úõ‹éà›ö[ô \úõ‹à	âà\úõ‹ãõY\‹ÿYŸH\úõ‹äBàN¬àõ›»õ€YòX⁄—\úõ‹é¬àBÇàõ›»\úõ‹é¬àHö[ò[H¬àÿ⁄Àúô[X\ŸSÿ⁄ 
N¬àBüBÇã Çà
àö\ôXò\ŸH]]‹ö^ò][€àúöYŸH€€ùòX›Çà
Çà
àHúõ›‹Ÿ\àô]ô\àôXŸZ]ô\»Húõ⁄Ÿ\àŸX‹ô]‹àHŸ\ùöXŸHXÿ€›[ùàBà
à\ﬁ[Y[ù›€ô\à]\›€€ôöY›\ôH\ŸHÿ‹ö\õ‹\ùY\»Yù\àHö\ôXò\ŸBà
à]]‘›‹òYŸHù[\»€€ùòX›\»ôY[àô]öY]ŸYÇà
à“W—íTëPêT—W–UU–îì“—Tó’Tìà
à“W—íTëPêT—W–UU–îì“—Tó‘—P‘ëUà
Çà
àHúõ⁄Ÿ\à\»ô\‹€ú⁄XõHõ‹à\‹›Z[ô»H⁄‹ù[]ôYö\ôXò\ŸH›\›€H⁄Ÿ[Çà
à⁄]Z]\à]òPYZ[è]ùYH‹àH^X›]òU\Ÿ\îÿ€‹H€Z[Kà\»–T»^Y\Çà
àô\öYöY\»H^\›[ô»UêHYZ[àõ€ŸàôYõ‹ôHõ‹ùÿ\ô[ô»[àYZ[àô\]Y\›¬à
à\Ÿ\àö[ô[ô»õ€Ÿàô\öYöXÿ][€àô[XZ[ú»Ÿ\ùô\ã\⁄YH[àHúõ⁄Ÿ\ãÇà
ã¬ôù[ò›[€à\‹›YQö\ôXò\ŸP]]‹ö^ò][€ó ô\]Y\›
H¬àYà
›ö[ô ô\]Y\›ò\Y	… HOOH””ëíQÀêT“Q
Hõ›»ô]»\úõ‹ä	’‹õ€ô»\Q	 N¬Çà€€ú›[ŸHH›ö[ô ô\]Y\›õ[ŸH	… Kù”›Ÿ\êÿ\ŸJ
N¬àYà
…ÿYZ[âÀ	›\Ÿ\â◊Kö[ô^Ÿä[ŸJHOOHLJHõ›»ô]»\úõ‹ä	’[ú›\‹ùYö\ôXò\ŸH]]‹ö^ò][€à[ŸI N¬ÇàYà
[ŸHOOH	ÿYZ[â H¬àô\öYûPYZ[îŸ\‹⁄[€ó ô\]Y\›òYZ[îŸ\‹⁄[€îõ€Ÿã””ëíQÀêT“Q
»	ŒõŸôöX⁄X[]‹ö]NîõŸX›–€€ù[ù	 N¬àH[ŸH¬à€€ú›ö[ô[ô»Hô\]Y\›ù\Ÿ\êö[ô[ô»ﬂN¬àYà
K◊ñ–KVòK^åNWÀW^ŒLéIÀù\›
›ö[ô ö[ô[ôÀõ‹\]YU\Ÿ\îÿ€‹H	… JHT›ö[ô ö[ô[ôÀòö[ô[ô‘õ€Ÿà	… Kùö[J
JH¬àõ›»ô]»\úõ‹ä	–ÿ[õ€öXÿ[UêH\Ÿ\àö[ô[ô»õ€Ÿà\»ô\]Z\ôY	 N¬àBàBÇà€€ú›õ‹\ùY\»Hõ‹\ùY\‘Ÿ\ùöXŸKôŸ]ÿ‹ö\õ‹\ùY\ 
N¬à€€ú›úõ⁄Ÿ\ï\õH›ö[ô õ‹\ùY\ÀôŸ]õ‹\ùJ	–“W—íTëPêT—W–UU–îì“—Tó’Tì	 H	… Kùö[J
N¬à€€ú›úõ⁄Ÿ\îŸX‹ô]H›ö[ô õ‹\ùY\ÀôŸ]õ‹\ùJ	–“W—íTëPêT—W–UU–îì“—Tó‘—P‘ëU	 H	… Kùö[J
N¬ÇàYà
Xúõ⁄Ÿ\ï\õXúõ⁄Ÿ\îŸX‹ô]
H¬à€€ú›\úõ‹àHô]»\úõ‹ä	—ö\ôXò\ŸH]]‹ö^ò][€àúõ⁄Ÿ\à\»õ›€€ôöY›\ôY	 N¬à\úõ‹ãò€ŸHH	—íTëPêT—W–UU–””ëíQ’TêUS”ó‘ëTURTëQ	Œ¬àõ›»\úõ‹é¬àBÇà€€ú›^[ÿYH¬à\Yà””ëíQÀêT“Qà€€ùòX›à	ÿ]òKX⁄K\›‹òYŸK]åIÀà[ŸNà[ŸKà€Z[\Œà[ŸHOOH	ÿYZ[â¬à»»]òPYZ[éàùYHBàà»]òU\Ÿ\îÿ€‹Nà›ö[ô ô\]Y\›ù\Ÿ\êö[ô[ôÀõ‹\]YU\Ÿ\îÿ€‹JHKàö[ô[ô‘õ€Ÿéà[ŸHOOH	›\Ÿ\â»»›ö[ô ô\]Y\›ù\Ÿ\êö[ô[ôÀòö[ô[ô‘õ€ŸäHà[ôYö[ôYàN¬Çà€€ú›ô\‹€úŸHH\õô]⁄\ôô]⁄
úõ⁄Ÿ\ï\õ¬àY]Ÿà	‹‹›	Àà€€ù[ù\Nà	ÿ\Xÿ][€ã⁄ú€€âÀàXY\úŒà»]]‹ö^ò][€éà	–ôX\ô\à	»
»úõ⁄Ÿ\îŸX‹ô]Kà^[ÿYàî””ãú›ö[ô⁄YûJ^[ÿY
Kà]]R^Ÿ\[€úŒàùYBàJN¬à€€ú››]\»Hô\‹€úŸKôŸ]ô\‹€úŸP€ŸJ
N¬à]ô\›[HﬂN¬àûH»ô\›[Hî””ãú\úŸJô\‹€úŸKôŸ]€€ù[ù^

H	ﬁﬂI N»Hÿ]⁄
 H»ô\›[HﬂN»BÇàYà
›]\»å›]\»èHÃô\›[ú›XÿŸ\‹»OOHùYJH¬à€€ú›\úõ‹àHô]»\úõ‹ä	—ö\ôXò\ŸH]]‹ö^ò][€àúõ⁄Ÿ\àôZôX›YHô\]Y\›	 N¬à\úõ‹ãò€ŸHH	—íTëPêT—W–UU–îì“—Tó‘ëRëP’Q	Œ¬àõ›»\úõ‹é¬àBÇà€€ú›⁄Ÿ[àH›ö[ô ô\›[ôö\ôXò\ŸP›\›€U⁄Ÿ[à	… Kùö[J
N¬à€€ú›^\ô\–]H]Kú\úŸJô\›[ô^\ô\–]	… N¬à€€ú›€Z[\»Hô\›[ò€Z[\»ﬂN¬àYà
]⁄Ÿ[àSù[Xô\ãö\—ö[ö]J^\ô\–]
H^\ô\–]H]Kõõ› 
JHõ›»ô]»\úõ‹ä	—ö\ôXò\ŸHúõ⁄Ÿ\àô]\õôY[à[ùò[Y⁄‹ù[]ôY‹ò[ù	 N¬àYà
[ŸHOOH	ÿYZ[â»	âà€Z[\Àò]òPYZ[àOOHùYJHõ›»ô]»\úõ‹ä	—ö\ôXò\ŸHúõ⁄Ÿ\àô]\õôYõ»YZ[à€Z[I N¬àYà
[ŸHOOH	›\Ÿ\â»	âà€Z[\Àò]òU\Ÿ\îÿ€‹HOOH›ö[ô ô\]Y\›ù\Ÿ\êö[ô[ôÀõ‹\]YU\Ÿ\îÿ€‹JJHõ›»ô]»\úõ‹ä	—ö\ôXò\ŸHúõ⁄Ÿ\àô]\õôYH‹õ€ô»\Ÿ\àÿ€‹I N¬Çàô]\õà›XÿŸ\‹◊ ¬àö\ôXò\ŸP›\›€U⁄Ÿ[éà⁄Ÿ[ãà^\ô\–]àô\›[ô^\ô\–]à€Z[\Œà€Z[\Àà€€ùòX›à	ÿ]òKX⁄K\›‹òYŸK]åI¬àJN¬üBÇôù[ò›[€à‘‹›
JH¬à€€ú›ô\]Y\›Hô\]Y\›õŸW JN¬ÇàYà
\ô\]Y\›
H¬àô]\õàòZ[\ôW à	“SïêSQ“î””âÀà	‘ô\]Y\›õŸH]\›ôHò[Yî””â¬à
N¬àBÇàûH¬à€€ú›X›[€àH›ö[ô ô\]Y\›òX›[€à	… Kùö[J
N¬ÇàYà
X›[€àOOH	Ÿ^⁄[ôŸPYZ[îŸ\‹⁄[€â H¬àô]\õàú€€ó ^⁄[ôŸPYZ[îŸ\‹⁄[€ó ô\]Y\›
JN¬àBÇàYà
X›[€àOOH	⁄\‹›YQö\ôXò\ŸP]]‹ö^ò][€â H¬àô]\õàú€€ó \‹›YQö\ôXò\ŸP]]‹ö^ò][€ó ô\]Y\›
JN¬àBÇàYà
X›[€àOOH	ÿYZ[ï\]I H¬àô]\õàú€€ó YZ[ï\]W ô\]Y\›
JN¬àBÇàô]\õàòZ[\ôW à	’Sí”ì’”ó–P’S”âÀà	’[ú›\‹ùY‘’X›[€â¬à
N¬àHÿ]⁄
\úõ‹äH¬à€€ú›Y\‹ÿYŸHH›ö[ô \úõ‹à	âà\úõ‹ãõY\‹ÿYŸH\úõ‹äN¬ÇàYà
\úõ‹à	âà\úõ‹ãò€ŸHOOH	‘ì”êP“◊—êRSQ	 H¬àô]\õàòZ[\ôW 	‘ì”êP“◊—êRSQ	ÀY\‹ÿYŸK\úõ‹ãô]Z[»ù[
N¬àBÇàYà
\úõ‹à	âà\úõ‹ãò€ŸHOOH	’‘íUW‘ì”Q–êP“… H¬àô]\õàòZ[\ôW 	’‘íUW‘ì”Q–êP“…ÀY\‹ÿYŸK\úõ‹ãô]Z[»ù[
N¬àBÇàYà
\úõ‹à	âà\úõ‹ãò€ŸHOOH	—íTëPêT—W–UU–””ëíQ’TêUS”ó‘ëTURTëQ	 H¬àô]\õàòZ[\ôW 	—íTëPêT—W–UU–””ëíQ’TêUS”ó‘ëTURTëQ	ÀY\‹ÿYŸJN¬àBÇàYà
\úõ‹à	âà\úõ‹ãò€ŸHOOH	—íTëPêT—W–UU–îì“—Tó‘ëRëP’Q	 H¬àô]\õàòZ[\ôW 	—íTëPêT—W–UU–îì“—Tó‘ëRëP’Q	ÀY\‹ÿYŸJN¬àBÇàYà
‹Ÿ\‹⁄[€üõ€Ÿü]]‹ö^ò][€ü]õ‹õK⁄Kù\›
Y\‹ÿYŸJJH¬àô]\õàòZ[\ôW 	–QRSó’SêUU‘íVëQ	ÀY\‹ÿYŸJN¬àBÇàYà
‹›[_ô\ú⁄[€ã⁄Kù\›
Y\‹ÿYŸJJH¬àô]\õàòZ[\ôW 	‘’SW’‘íUIÀY\‹ÿYŸJN¬àBÇàYà
à‹õ›X›Y[›€\›Y]Xõ_öY[]\Ÿ]ôX€‹ô]⁄^X›Yù[Y\öXﬂõ€€X[ã⁄Bàù\›
Y\‹ÿYŸJBà
H¬àô]\õàòZ[\ôW 	–QRSó’‘íUW‘ëRëP’Q	ÀY\‹ÿYŸJN¬àBÇàô]\õàòZ[\ôW 	‘ëTUQT’—êRSQ	ÀY\‹ÿYŸJN¬àBüB