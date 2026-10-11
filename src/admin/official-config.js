export const ADMIN_SECTION_DEFINITIONS = Object.freeze([
  ['Products', 'Plans', '產品方案'],
  ['Benefits', 'Benefits', '保障項目'],
  ['Claim Rules', 'Claim_Rules', '理賠規則'],
  ['Health Program', 'Health_Program', '健康計劃'],
  ['Product Content', 'Product_Content', '產品內容'],
  ['Premium Data', 'premium', '保費資料'],
  ['Data Sources', 'sources', '資料來源'],
  ['Versions / Status', 'Settings_Versions', '版本／狀態']
]);

// The section inventory stays Critical Illness-specific.  Saving V1.8 is only
// the presentation reference; these labels, datasets, and descriptions remain
// owned by the Critical Illness Official contract.
export const ADMIN_SECTION_META = Object.freeze({
  Plans: Object.freeze({ id: 'products', label: '產品方案', description: '查看方案資料；方案 ID 及受保護計算參數維持唯讀。', editable: true }),
  Benefits: Object.freeze({ id: 'benefits', label: '保障項目', description: '管理已授權的保障顯示欄位；不改動保障計算邏輯。', editable: true }),
  Claim_Rules: Object.freeze({ id: 'claim-rules', label: '理賠規則', description: '管理官方理賠規則資料；不建立第二套計算引擎。', editable: true }),
  Health_Program: Object.freeze({ id: 'health-program', label: '健康計劃', description: '管理健康計劃內容及已授權的作用欄位。', editable: true }),
  Product_Content: Object.freeze({ id: 'product-content', label: '產品內容', description: '管理前台產品內容；資源連結及來源欄位按既有合約處理。', editable: true }),
  premium: Object.freeze({ id: 'premium-data', label: '保費資料', description: '保費矩陣只作檢視；不推算、不四捨五入、不修改。', editable: false }),
  sources: Object.freeze({ id: 'data-sources', label: '資料來源', description: '查看實際 Official data 來源狀態；不暴露憑證或寫入控制。', editable: false }),
  Settings_Versions: Object.freeze({ id: 'versions-status', label: '版本／狀態', description: '查看資料集版本；只可按既有 allowlist 管理版本設定。', editable: true })
});

export const ADMIN_FIELD_LABELS = Object.freeze({
  plan_id: '方案 ID', plan_name: '方案名稱', short_name: '簡稱', plan_category: '方案類別',
  protection_style: '保障形式', active: '啟用', sort_order: '排序', benefit_id: '保障 ID',
  benefit_type: '保障類型', benefit_name: '保障名稱', payout_percent: '賠償百分比', max_payout: '最高賠償',
  max_claims: '最高索償次數', display_text: '顯示內容', enabled: '啟用', rule_id: '規則 ID',
  condition_name: '條件名稱', claim_phase: '理賠階段', claim_option: '理賠選項', shared_pool_percent: '共用保障百分比',
  option_switch_rule: '選項轉換規則', payout_type: '賠償類型', payout_value: '賠償數值', interval_value: '間隔數值',
  interval_unit: '間隔單位', max_months: '最長月份', duration_rule: '持續規則', display_label: '顯示標籤',
  health_rule_id: '健康規則 ID', program_name: '計劃名稱', effect_type: '作用類型', effect_value: '作用數值',
  annual_fee: '年費', feature_1: '特色一', feature_2: '特色二', feature_3: '特色三', content_id: '內容 ID',
  category: '內容類別', title: '標題', short_text: '簡介', resource_ref: '資源連結', setting_key: '設定鍵',
  setting_value: '設定值', version: '版本', record_version: '記錄版本', updated_at: '更新時間', key: '名稱', value: '數值'
});

export function adminFieldLabel(field) {
  return ADMIN_FIELD_LABELS[field] || field;
}

export function adminFieldType(field, value) {
  if (typeof value === 'boolean' || ['active', 'enabled'].includes(field)) return 'checkbox';
  if (['sort_order', 'payout_percent', 'shared_pool_percent', 'payout_value', 'interval_value', 'max_payout', 'max_claims', 'max_months', 'annual_fee', 'effect_value'].includes(field)) return 'number';
  if (typeof value === 'string' && value.length > 100) return 'textarea';
  return 'text';
}

export const ADMIN_WRITEBACK_STATUS = Object.freeze({
  status: 'PLATFORM AUTH REQUIRED',
  reason: 'OFFICIAL WRITE REQUIRES PLATFORM ADMIN SESSION VERIFICATION',
  authentication: 'AVA PLATFORM UNIFIED ADMIN AUTH'
});

const ADMIN_ALLOWED_FIELDS = Object.freeze({
  Plans: ['plan_name', 'short_name', 'plan_category', 'protection_style', 'active', 'sort_order'],
  Benefits: ['benefit_type', 'benefit_name', 'payout_percent', 'max_payout', 'max_claims', 'display_text', 'sort_order', 'enabled'],
  Claim_Rules: ['condition_name', 'claim_phase', 'claim_option', 'shared_pool_percent', 'option_switch_rule', 'payout_type', 'payout_value', 'interval_value', 'interval_unit', 'max_claims', 'max_months', 'duration_rule', 'display_label', 'sort_order', 'enabled'],
  Health_Program: ['program_name', 'effect_type', 'effect_value', 'annual_fee', 'feature_1', 'feature_2', 'feature_3', 'display_text', 'enabled'],
  Product_Content: ['category', 'title', 'short_text', 'resource_ref', 'sort_order', 'enabled'],
  Settings_Versions: ['setting_value']
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
