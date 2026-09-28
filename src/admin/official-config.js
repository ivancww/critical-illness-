export const ADMIN_SECTION_DEFINITIONS = Object.freeze([
  ['Products', 'Plans'],
  ['Benefits', 'Benefits'],
  ['Claim Rules', 'Claim_Rules'],
  ['Health Program', 'Health_Program'],
  ['Product Content', 'Product_Content'],
  ['Premium Data', 'premium'],
  ['Data Sources', 'sources'],
  ['Versions / Status', 'Settings_Versions']
]);

export const ADMIN_WRITEBACK_STATUS = Object.freeze({
  status: 'EXTERNAL CONFIGURATION REQUIRED',
  reason: 'CURRENT GAS CONTRACT EXPOSES READ ACTIONS ONLY',
  authentication: 'AUTH PLATFORM-DEPENDENT'
});

const ADMIN_ALLOWED_FIELDS = Object.freeze({
  Plans: ['plan_name', 'short_name', 'plan_category', 'protection_style', 'active', 'sort_order'],
  Benefits: ['benefit_type', 'benefit_name', 'payout_percent', 'max_payout', 'max_claims', 'display_text', 'sort_order', 'enabled'],
  Claim_Rules: ['condition_name', 'claim_phase', 'claim_option', 'shared_pool_percent', 'option_switch_rule', 'payout_type', 'payout_value', 'interval_value', 'interval_unit', 'max_claims', 'max_months', 'duration_rule', 'display_label', 'sort_order', 'enabled'],
  Health_Program: ['program_name', 'effect_type', 'effect_value', 'annual_fee', 'feature_1', 'feature_2', 'feature_3', 'display_text', 'enabled'],
  Product_Content: ['category', 'title', 'short_text', 'resource_ref', 'sort_order', 'enabled'],
  Settings_Versions: ['setting_value', 'updated_at']
});

const PROTECTED_FIELDS = new Set(['plan_id', 'product_id', 'code', 'premium_rate', 'premium_matrix', 'calculation_rule', 'gas_endpoint', 'firebase_mapping', 'security']);

const SENSITIVE_KEY = /(password|secret|token|credential|private[_-]?key|access[_-]?key)/i;

export function redactOfficialValue(value) {
  if (Array.isArray(value)) return value.map(redactOfficialValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE_KEY.test(key)).map(([key, child]) => [key, redactOfficialValue(child)]));
}

export function officialRecords(structured = {}, key) {
  return Array.isArray(structured[key]) ? structured[key] : [];
}

export function premiumSheetStatus(premium = {}) {
  return Object.entries(premium).map(([name, matrix]) => ({
    name,
    rows: Array.isArray(matrix) ? matrix.length : 0,
    columns: Array.isArray(matrix) && Array.isArray(matrix[0]) ? matrix[0].length : 0,
    status: 'VERIFY REQUIRED'
  }));
}

export function resourceStatus(content = []) {
  const records = officialRecords({ Product_Content: content }, 'Product_Content');
  const linked = records.filter(item => item && (item.resource_ref || item.resource_url || item.firebase_url || item.url)).length;
  return { total: records.length, linked, unlinked: records.length - linked };
}

export function adminPersistenceStatus() {
  return { ...ADMIN_WRITEBACK_STATUS };
}

export function adminEditableFields(dataset, record = {}) {
  return (ADMIN_ALLOWED_FIELDS[dataset] || []).filter(key => Object.prototype.hasOwnProperty.call(record, key));
}

export function adminRecordId(dataset, record = {}) {
  const keys = { Plans: 'plan_id', Benefits: 'benefit_id', Claim_Rules: 'rule_id', Health_Program: 'health_rule_id', Product_Content: 'content_id', Settings_Versions: 'setting_key' };
  return record[keys[dataset]] ? String(record[keys[dataset]]) : '';
}

export function adminRecordVersion(record = {}) {
  return record.version === undefined || record.version === null || record.version === '' ? '' : String(record.version);
}

export function composeOfficialAndUser(official = {}, user = {}) {
  const officialDefaults = official?.presentationDefaults && typeof official.presentationDefaults === 'object' ? official.presentationDefaults : {};
  const pagePreferences = user?.pagePreferences && typeof user.pagePreferences === 'object' ? user.pagePreferences : {};
  const permitted = ['introTitle', 'introSubtitle', 'introSupport', 'showIntro'];
  return {
    official,
    userOverride: user,
    presentation: Object.fromEntries(permitted.map(key => [key, pagePreferences[key] ?? officialDefaults[key]])),
    presentationSettings: user?.presentationSettings || user?.overrides?.presentation || {},
    pages: Array.isArray(user?.pages) ? user.pages : []
  };
}

export function validateAdminWrite({ dataset, recordId, fields, expectedVersion } = {}) {
  if (!ADMIN_ALLOWED_FIELDS[dataset]) throw new Error(`Dataset is not allowlisted: ${dataset || 'missing'}`);
  if (!recordId || typeof recordId !== 'string') throw new Error('A stable official record ID is required.');
  if (!expectedVersion || typeof expectedVersion !== 'string') throw new Error('An expected dataset version is required.');
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('Admin fields must be an object.');
  const unknown = Object.keys(fields).filter(key => !ADMIN_ALLOWED_FIELDS[dataset].includes(key));
  if (unknown.length) throw new Error(`Unknown or protected Admin fields: ${unknown.join(', ')}`);
  const protectedKeys = Object.keys(fields).filter(key => PROTECTED_FIELDS.has(key));
  if (protectedKeys.length) throw new Error(`Protected Admin fields cannot be changed: ${protectedKeys.join(', ')}`);
  if (dataset === 'Settings_Versions' && !/^dataset_(plans|benefits|claims|health|content|premium)_version$/.test(recordId)) {
    throw new Error('Only dataset version records may be published through Admin write-back.');
  }
  for (const [key, value] of Object.entries(fields)) {
    if (['active', 'enabled'].includes(key) && typeof value !== 'boolean') throw new Error(`${key} must be boolean.`);
    if (key === 'sort_order' && (!Number.isInteger(value) || value < 0)) throw new Error('sort_order must be a non-negative integer.');
    if (key === 'version' && typeof value !== 'string') throw new Error('version must be a string.');
    if (['payout_percent', 'shared_pool_percent', 'payout_value', 'interval_value', 'max_payout', 'max_claims', 'annual_fee', 'effect_value'].includes(key) && !['number', 'string'].includes(typeof value)) throw new Error(`${key} must be numeric.`);
  }
  return { dataset, recordId, fields: { ...fields }, expectedVersion };
}

export function createAdminWriteRequest(input) {
  return { action: 'adminUpdate', ...validateAdminWrite(input) };
}
