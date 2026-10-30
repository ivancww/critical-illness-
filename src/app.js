import { createDraft, createIntro, draftChanged, savePagesVerified, saveScenario } from './user-edit.js?v=0.6.13';
import { CI_APP_ID, GAS_DATA_API_URL, exchangeAdminLaunch, loadOfficialData, refreshOfficialData, premiumMatrixHasExpectedHeaders, normalizeStructuredData, validateOfficialData, writeOfficialData } from './data/data-api.js?v=0.6.13';
import { createUserBackup, loadOfficialCache, loadUserState, normalizeUserState, restoreUserBackup, saveOfficialCache, saveUserMediaReference, saveUserState } from './data/storage.js?v=0.6.13';
import { diseaseResourcesForProduct, firebaseResourceUrl, productBrochureForProduct, resourceKind } from './data/content.js?v=0.6.13';
import { calculateSupportReserve, createFlowState, nextFlowStep, previousFlowStep, translateProtectionToMonths } from './domain/flow-state.js?v=0.6.13';
import { getActivePlans, resolveClaimRules } from './domain/product-engine.js?v=0.6.13';
import { verificationState } from './domain/verification.js?v=0.6.13';
import { cancerTimeline, dementiaTimeline, heartStrokeTimeline, multiClaimGrandTotalFromSimulation, combinedPlanPayout, emptyMultiClaimSimulation, isNewMultiClaimEntry, paymentEndAge, premiumEvidence, selectedProtection } from './domain/frontstage-experience.js?v=0.6.13';
import { claimOutcome, healthProgramEffect, planProtectionSummary as basePlanProtectionSummary, remainingMajorProtectionAfterEarlyClaim, supportMonthsForPayout, verifiedPlanBenefits } from './domain/plan-experience.js?v=0.6.13';
import { formatMoneyText, parseMoneyText } from './domain/input-format.js?v=0.6.13';
import { premiumQuote, renderPremiumFigures, calculatePremiumSchedule, renderPremiumSchedule } from './domain/premium-engine.js?v=0.6.13';
import { renderBrochureAction, renderPlanComparisonLayout } from './domain/frontstage-render.js?v=0.6.13';
import { resolveAvaReturnContext } from './integration/return-context.js?v=0.6.13';
import { uploadOfficialMedia, validateMediaFile } from './integration/firebase-media.js?v=0.6.13';
import { ADMIN_SECTION_DEFINITIONS, ADMIN_SECTION_META, adminEditableFields, adminFieldLabel, adminFieldType, adminPersistenceStatus, adminRecordId, adminRecordVersion, composeOfficialAndUser, createAdminWriteRequest, officialRecords, premiumSheetStatus, redactOfficialValue, resourceStatus } from './admin/official-config.js?v=0.6.13';
import { APP_VERSION } from './version.js?v=0.6.13';

const main = document.querySelector('#main-content');
const status = document.querySelector('#status');
document.querySelector('#app-version').textContent = `v${APP_VERSION}`;
const steps = [
  { title: '生活支援預備金', text: '一場大病，需要面對嘅往往唔只係醫療費。治療、需要時間休養，而生活仍然繼續。' },
  { title: '如果有一日醫生話你患上重大疾病，你第一時間最關心咩？', text: '以下只是幫助開始對話，不會限制你之後的保障理解。' },
  { title: '治療、康復，同生活開支', text: '治療需要資源，康復可能需要時間，生活開支仍然會繼續。' },
  { title: '如果需要一段時間處理疾病，你希望為自己留幾多時間？', text: '先用時間理解需要，再換算成一筆生活支援預備金。' },
  { title: '每月大約生活需要幾多？', text: '輸入一個容易估算的數字即可，之後可以隨時修改。' },
  { title: '生活支援預備金', text: '月份 × 每月生活需要，讓保障需要一眼看得明白。' },
  { title: '你現有的重大疾病保障', text: '手動輸入現有保額，先將保障換算成時間。' },
  { title: '現有保障可以支持幾耐？', text: '主要看可以支持幾多個月，而不是先問你差幾多錢。' },
  { title: '危疾保障可以有兩種模式', text: '先用最簡單的方式看清楚一次性保障和持續／多次保障的分別，之後直接進入實際方案。' }
];
const concernOptions = ['治療要幾多錢？', '要停工／休養幾耐？', '生活開支點安排？', '其實未諗過'];
const state = { official: loadOfficialCache(), user: normalizeUserState(loadUserState()) };
// A persisted success is a cached snapshot, not proof of a successful fetch in this session.
if (state.official?.freshness) for (const key of ['structured', 'premium']) {
  if (state.official.freshness[key]?.status === 'fresh') state.official.freshness[key].status = 'stale';
}
state.user.flow = createFlowState(state.user.flow);
const requestedEntry = new URLSearchParams(location.search).get('avaEntry') || '';
const appEntry = requestedEntry || 'frontend';
const unsupportedEntry = Boolean(requestedEntry) && !['frontend', 'user', 'admin'].includes(requestedEntry);
const canEdit = appEntry === 'user' && !unsupportedEntry;
let editMode = canEdit ? 'edit' : 'use';
let savedPages = createDraft(state.user);
let draftPages = createDraft(state.user);
let savedIntro = createIntro(state.user);
let draftIntro = createIntro(state.user);
let editNotice = true;
let editIndex = 0;
let suppressEditExitReset = false;
const dirty = () => canEdit && editMode !== 'use' && (draftChanged(draftPages, savedPages) || draftChanged(draftIntro, savedIntro));

const adminLaunch = new URLSearchParams(location.search).get('avaAdminLaunch') || '';
let adminSessionProof = null;
let adminAuthorizationError = adminLaunch ? '正在向 AVA Platform 驗證 Admin 授權…' : '必須由 AVA Studio 啟動並授權此 Admin 入口。';
const canAdmin = appEntry === 'admin' && !unsupportedEntry;
let adminActiveSection = 'products';
const adminSelectedRecords = Object.create(null);

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(value) { return Number(value || 0).toLocaleString('en-HK', { maximumFractionDigits: 0 }); }
function moneyInputValue(value) { return value === null || value === undefined || value === '' ? '' : money(Number(value)); }
function numericMoneyValue(value) { return parseMoneyText(value); }
function formatMoneyInput(input) {
  const start = input.selectionStart ?? input.value.length;
  const digitsBefore = input.value.slice(0, start).replace(/[^0-9]/g, '').length;
  const digits = input.value.replace(/[^0-9]/g, '');
  input.value = formatMoneyText(digits);
  let caret = 0; let seen = 0;
  while (caret < input.value.length && seen < digitsBefore) { if (/\d/.test(input.value[caret])) seen += 1; caret += 1; }
  try { input.setSelectionRange(caret, caret); } catch { /* non-text input */ }
  return digits ? Number(digits) : 0;
}
function setStatus(message, error = false) { status.textContent = message; status.className = `status is-visible${error ? ' is-error' : ''}`; window.clearTimeout(setStatus.timer); setStatus.timer = window.setTimeout(() => { status.className = 'status'; }, 4000); }
function persistUser() { try { saveScenario({ storage: localStorage, user: state.user }); } catch (error) { setStatus(`客戶資料未能儲存：${error.message}`, true); } }
function render(html, mode = 'use') {
  const effectiveMode = canEdit && editMode !== 'use' && mode !== 'admin' ? editMode : mode;
  document.body.classList.toggle('presentation-active', mode === 'presentation'); document.body.classList.toggle('admin-active', mode === 'admin');
  main.innerHTML = `<div class="page" data-ava-mode="${effectiveMode}">${html}</div>`;
  renderModeBar(); main.focus();
}
function flow() { return state.user.flow; }
function supportSummary() { const f = flow(); const desired = calculateSupportReserve(f); const existing = Number(f.existingProtection) || 0; return { desired, existing, months: translateProtectionToMonths({ existingProtection: existing, monthlyNeed: f.monthlyNeed }) }; }
function datasets() { return normalizeStructuredData(state.official?.structured || {}); }
function plans() { return getActivePlans(state.official?.structured?.Plans || []); }
function frontstage() { return state.user.frontstage; }
function savedAge() { const age = Number(frontstage().age); return Number.isInteger(age) && age > 0 ? age : null; }
function savedDiagnosisAge() { const age = Number(frontstage().diagnosisAge); return Number.isInteger(age) && age > 0 ? age : null; }
function healthProgramParticipating() { return Boolean(frontstage().vitality); }
function planProtectionSummary(args = {}) { return basePlanProtectionSummary({ ...args, healthProgram: args.healthProgram ?? datasets().Health_Program, healthProgramParticipating: args.healthProgramParticipating ?? healthProgramParticipating(), diagnosisAge: args.diagnosisAge ?? savedDiagnosisAge() }); }
function continuingPlans() { return plans().filter(plan => ['continuing', 'continuing_multiple_claim'].includes(plan.protection_style)); }
function continuingPlan() { return continuingPlans().find(plan => planKey(plan) === frontstage().claimPlanId) || continuingPlans()[0]; }
function planName(plan) { return plan.plan_name || plan.name_zh || plan.display_name || plan.plan_id || plan.plan_key; }
function planKey(plan) { return plan.plan_id ?? plan.plan_key; }
function moneyOrPending(value) { return Number.isFinite(value) ? `HK$${money(value)}` : 'VERIFY REQUIRED'; }
function userPagesMarkup() {
  const pages = canEdit && editMode !== 'use' ? draftPages : state.user.pages;
  return pages.map((p, i) => {
    if (!p.visible && editMode !== 'edit') return '';
    const form = canEdit && editMode === 'edit' ? `<div class="ava-editable"><strong><svg class="edit-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg> 編輯自訂頁面</strong><div class="field"><label for="page-title-${i}">標題</label><input id="page-title-${i}" data-page-field="title" data-index="${i}" value="${escapeHtml(p.title)}" maxlength="10000"></div><div class="field"><label for="page-subtitle-${i}">副標題</label><input id="page-subtitle-${i}" data-page-field="subtitle" data-index="${i}" value="${escapeHtml(p.subtitle)}" maxlength="10000"></div><div class="field"><label for="page-content-${i}">個人說明</label><textarea id="page-content-${i}" data-page-field="content" data-index="${i}" maxlength="10000">${escapeHtml(p.content)}</textarea></div><div class="actions"><button type="button" class="secondary" data-page-action="toggle" data-index="${i}">${p.visible ? '隱藏' : '顯示'}</button><button type="button" class="secondary" data-page-action="up" data-index="${i}" ${i === 0 ? 'disabled' : ''}>上移</button><button type="button" class="secondary" data-page-action="down" data-index="${i}" ${i === pages.length - 1 ? 'disabled' : ''}>下移</button><button type="button" class="secondary" data-page-action="delete" data-index="${i}">刪除</button></div>${p.type !== 'content' ? '<p>現有雲端媒體參照會保留；目前未配置 User 雲端上載服務。</p>' : ''}</div>` : '';
    return `<article class="card user-page"><span class="eyebrow">自訂頁面${p.visible ? '' : ' · 已隱藏'}</span><h2>${escapeHtml(p.title)}</h2><p class="support">${escapeHtml(p.subtitle)}</p><p class="user-copy">${escapeHtml(p.content)}</p>${p.type === 'image' || p.type === 'video' ? mediaMarkup(p) : ''}${form}</article>`;
  }).join('') + (canEdit && editMode === 'edit' ? `<section class="card user-page"><h2>新增自訂頁面</h2><p>請只加入個人銷售說明；官方產品資料和條款保持不變。</p><label for="new-page-type">頁面類型</label> <select id="new-page-type"><option value="content">文字</option><option value="image">圖片</option><option value="video">影片</option></select> <button type="button" class="secondary" id="add-user-page">新增頁面</button><div class="actions"><button class="secondary" id="backup-user">下載目前草稿備份</button><label class="button secondary file-button" for="restore-user">還原資料備份</label><input id="restore-user" type="file" accept="application/json" hidden></div></section>` : '');
}
function mediaMarkup(page) { if (!page.media?.length) return '<p class="media-fallback" role="status">媒體暫時無法使用。<br>Cloud Storage 未配置。</p>'; if (page.type === 'video') return `<div class="media-frame"><video controls preload="metadata" src="${escapeHtml(page.media[0].cloudFileRef)}"></video></div>`; return `<div class="media-grid">${page.media.slice(0, 6).map(m => `<div class="media-frame"><img loading="lazy" src="${escapeHtml(m.cloudFileRef)}" alt="${escapeHtml(m.name || page.title)}"></div>`).join('')}</div>`; }

function home() {
  const official = composeOfficialAndUser(state.official || {}, {}).presentation;
  const personal = canEdit && editMode !== 'use' ? draftIntro : createIntro(state.user);
  const show = personal.showIntro;
  const personalCopy = show && (personal.introTitle || personal.introSubtitle || personal.introSupport) ? `<section class="personal-intro"><strong>個人介紹</strong>${personal.introSubtitle ? `<h2>${escapeHtml(personal.introSubtitle)}</h2>` : ''}${personal.introTitle ? `<p>${escapeHtml(personal.introTitle)}</p>` : ''}${personal.introSupport ? `<p>${escapeHtml(personal.introSupport)}</p>` : ''}</section>` : '';
  const editor = canEdit && editMode === 'edit' ? `<div class="ava-editable"><strong>編輯個人介紹</strong><p>個人內容與固定介紹分開顯示；請確保內容準確，並以官方條款為準。</p><div class="field"><label for="intro-subtitle">個人標題</label><input id="intro-subtitle" data-intro-field="introSubtitle" value="${escapeHtml(personal.introSubtitle)}" maxlength="10000"></div><div class="field"><label for="intro-title">個人主訊息</label><input id="intro-title" data-intro-field="introTitle" value="${escapeHtml(personal.introTitle)}" maxlength="10000"></div><div class="field"><label for="intro-support">個人補充說明</label><textarea id="intro-support" data-intro-field="introSupport" maxlength="10000">${escapeHtml(personal.introSupport)}</textarea></div><label class="intro-toggle"><input type="checkbox" id="show-intro" data-intro-field="showIntro" ${show ? 'checked' : ''}> 顯示個人介紹</label></div>` : '';
  const intro = `<section class="hero ava-concept"><span class="eyebrow">AVA Critical Illness</span><h1>${escapeHtml(official.introSubtitle || '生活支援預備金')}</h1><p class="support">${escapeHtml(official.introTitle || '一場大病，需要面對嘅往往唔只係醫療費。')}</p><div class="concept-flow"><span>治療</span><b>＋</b><span>需要時間休養</span><b>＋</b><span>生活仍然繼續</span><b>→</b><strong>一筆可以靈活運用嘅生活支援預備金</strong></div><p class="support">${escapeHtml(official.introSupport || '由你希望保留的時間開始，慢慢理解保障。')}</p>${personalCopy}${editor}<div class="actions actions--end"><a class="button primary" href="#/flow">開始了解</a><a class="button secondary" href="#/plans">直接查看方案</a></div></section>`;
  render(`${intro}${userPagesMarkup()}`); bindUserPages();
}

function flowBody(step) {
  const f = flow(); const s = supportSummary();
  if (step === 1) return `<div class="choice-grid concern-grid">${concernOptions.map(v => `<button class="choice" data-concern="${escapeHtml(v)}" aria-pressed="${f.concern === v}">${v}</button>`).join('')}</div>`;
  if (step === 3) return `<div class="choice-grid">${[6, 12, 18, 24].map(v => `<button class="choice" data-months="${v}" aria-pressed="${f.desiredMonths === v}">${v} 個月</button>`).join('')}</div><div class="field"><label for="custom-months">自訂月份</label><input id="custom-months" type="number" min="1" inputmode="numeric" value="${f.desiredMonths}"></div>`;
  if (step === 4 || step === 6) return `<div class="field"><label for="${step === 4 ? 'monthly-need' : 'existing-protection'}">${step === 4 ? '每月大約生活需要' : '現有重大疾病保障'}</label><div class="money-input"><span>HK$</span><input id="${step === 4 ? 'monthly-need' : 'existing-protection'}" data-money-input="${step === 4 ? 'monthly-need' : 'existing-protection'}" type="text" inputmode="numeric" value="${money(step === 4 ? f.monthlyNeed : f.existingProtection)}"></div></div>`;
  if (step === 5) return `<div class="result-card"><small>生活支援預備金</small><strong>HK$${money(s.desired)}</strong><span>${f.desiredMonths} 個月 × HK$${money(f.monthlyNeed)}</span></div>`;
  if (step === 7) return `<div class="result-card"><small>現有保障 ≈</small><strong>${s.months.toFixed(1)} 個月</strong><span>HK$${money(s.existing)} ÷ HK$${money(f.monthlyNeed)}</span><div class="coverage-bar" role="img" aria-label="現有保障約支持 ${s.months.toFixed(1)} 個月，共需 ${f.desiredMonths} 個月"><span style="width:${Math.min(100, f.desiredMonths ? s.months / f.desiredMonths * 100 : 0)}%"></span></div><p class="muted">目標：${f.desiredMonths} 個月 · HK$${money(s.desired)} · 差額只作次要參考：HK$${money(Math.max(0, s.desired - s.existing))}</p></div>`;
  if (step === 8) return `<div class="mode-grid"><article class="mode-card" data-information-card="single"><span class="tag">模式 A · 資訊</span><h2>一次性賠償</h2><ol><li>發生合資格嚴重疾病</li><li>賠償保障額</li><li>完成100%賠償後</li><li><strong>合約完結</strong></li></ol></article><article class="mode-card" data-information-card="continuing"><span class="tag">模式 B · 資訊</span><h2>多次賠償</h2><ol><li>首次合資格嚴重疾病獲得賠償</li><li>保費豁免須按產品官方保障資料確認</li><li>保障仍然繼續生效</li><li><strong>日後仍可按產品條款享有多重賠償</strong></li></ol></article></div><div class="choice-grid choice-grid--balanced" role="group" aria-label="選擇方案方向"><button class="choice" data-style="single" aria-pressed="false">偏向一次性保障</button><button class="choice" data-style="continuing" aria-pressed="false">偏向持續／多次保障</button><button class="choice" data-style="compare" aria-pressed="false">想比較兩者</button></div><p class="muted">選擇後直接進入相應方案；三個按鈕是唯一的方案方向選擇。</p>`;
  return '<div class="card"><p class="support">由治療、康復時間和生活開支一起理解保障需要。</p></div>';
}

function flowPage() { const step = Math.min(Math.max(Number(flow().currentStep) || 0, 0), steps.length - 1); flow().currentStep = step; const item = steps[step]; const pageControl = step === 0 ? `<div class="page-control"><span class="page-control-spacer" aria-hidden="true"></span><span class="eyebrow">${String(step + 1).padStart(2, '0')} / ${steps.length}</span></div>` : `<div class="page-control"><button class="secondary" id="flow-back">← 返回</button><span class="eyebrow">${String(step + 1).padStart(2, '0')} / ${steps.length}</span></div>`; const actions = step === steps.length - 1 ? '' : `<div class="actions actions--end"><button class="primary" id="flow-next">繼續</button><a class="button subtle" href="#/plans">直接查看方案</a></div>`; render(`${pageControl}<section class="hero"><div class="progress" aria-label="流程進度"><span style="width:${(step + 1) / steps.length * 100}%"></span></div><h1>${item.title}</h1><p class="support">${item.text}</p>${flowBody(step)}${actions}</section>`); bindFlow(step); }
function parseMoney(value, fallback) { const parsed = Number(String(value).replace(/,/g, '')); return parsed >= 0 ? parsed : fallback; }
function bindFlow(step) { document.querySelector('#flow-back')?.addEventListener('click', () => { state.user.flow = previousFlowStep(flow()); persistUser(); flowPage(); }); document.querySelector('#flow-next')?.addEventListener('click', () => { state.user.flow = nextFlowStep(flow()); persistUser(); flowPage(); }); document.querySelectorAll('[data-concern]').forEach(b => b.addEventListener('click', () => { flow().concern = b.dataset.concern; persistUser(); flowPage(); })); document.querySelectorAll('[data-months]').forEach(b => b.addEventListener('click', () => { flow().desiredMonths = Number(b.dataset.months); persistUser(); flowPage(); })); document.querySelector('#custom-months')?.addEventListener('input', e => { flow().desiredMonths = Math.max(1, Number(e.target.value) || 1); persistUser(); }); document.querySelectorAll('[data-money-input]').forEach(input => input.addEventListener('input', () => { const value = formatMoneyInput(input); if (input.dataset.moneyInput === 'monthly-need') flow().monthlyNeed = value; if (input.dataset.moneyInput === 'existing-protection') flow().existingProtection = value; persistUser(); })); document.querySelector('#monthly-need')?.addEventListener('input', e => { flow().monthlyNeed = numericMoneyValue(e.target.value); persistUser(); }); document.querySelector('#existing-protection')?.addEventListener('input', e => { flow().existingProtection = numericMoneyValue(e.target.value); persistUser(); }); document.querySelectorAll('[data-style]').forEach(b => b.addEventListener('click', () => { flow().protectionStyle = b.dataset.style; persistUser(); location.hash = '#/plans'; })); }

function planKind(plan) { return ['continuing', 'continuing_multiple_claim'].includes(plan.protection_style) ? '持續／多次保障' : '一次性保障'; }
function routedPlans() {
  const mode = flow().protectionStyle;
  if (mode === 'single') return plans().filter(plan => planKey(plan) === 'SCE');
  if (mode === 'continuing') return plans().filter(plan => planKey(plan) === 'OYS2');
  return plans();
}
function protectionAmount(value) { return value === null || value === undefined || !(Number(value) > 0) ? '輸入基本保額後顯示' : `HK$${money(value)}`; }
function protectionRows(summary) {
  const extra = summary.extra.status === 'VERIFIED'
    ? `<div class="protection-row"><span>額外保障</span><strong>+${summary.extra.percent}%<small>+${protectionAmount(summary.extra.amount)}</small></strong></div>`
    : summary.extra.status === 'NOT_APPLICABLE'
      ? '<div class="protection-row"><span>額外保障</span><strong>不適用</strong></div>'
      : `<div class="protection-row"><span>額外保障</span><strong class="verify">VERIFY REQUIRED<small>${escapeHtml(summary.extra.reason || '請先輸入投保年齡')}</small></strong></div>`;
  return `<div class="protection-rows"><div class="protection-row"><span>基本保額</span><strong>${protectionAmount(summary.baseAmount)}</strong></div>${extra}${summary.diagnosis?.visible !== false && summary.diagnosis?.status && summary.diagnosis.status !== 'NOT_PROVIDED' ? `<div class="protection-row"><span>首10年升級保障</span><strong>${summary.diagnosis.status === 'APPLICABLE' ? '生效' : summary.diagnosis.status === 'NOT_APPLICABLE' ? '不適用' : 'VERIFY REQUIRED'}</strong></div>` : ''}</div>`;
}
function claimPayout(summary, continuing) {
  const hasExtra = summary.extra.status === 'VERIFIED' && Number(summary.extra.percent) > 0 && Number(summary.extra.amount) > 0;
  if (!hasExtra) return `<span class="tag">${continuing ? '首次100%主要危疾賠償' : '100% 一次性賠償'}</span><strong>HK$${money(summary.totalApplicable)}</strong>`;
  return `<span class="tag">首次主要危疾賠償</span><strong>HK$${money(summary.totalApplicable)}</strong><div class="claim-breakdown"><div class="protection-row"><span>基本保障</span><strong>${summary.basePercent || 100}%<small>HK$${money(summary.baseAmount)}</small></strong></div><div class="protection-row"><span>額外保障</span><strong>+${summary.extra.percent}%<small>+HK$${money(summary.extra.amount)}</small></strong></div></div>`;
}
function premiumWaiverCopy(summary) { return summary.premiumWaiver.status === 'VERIFIED' ? `<p>${escapeHtml(summary.premiumWaiver.text)}</p>` : ''; }
function selectedClaimType() { return frontstage().comparisonClaimType === 'early' ? 'early' : 'major'; }
function claimLabel(type) { return type === 'early' ? '早期疾病' : '主要危疾'; }
function claimAmountMarkup(summary, type) {
  const outcome = claimOutcome(summary, type);
  if (outcome.status !== 'VERIFIED' || !(Number(outcome.amount) >= 0)) {
    const pendingReason = summary.diagnosis?.status === 'NOT_PROVIDED'
      ? '首10年升級保障：請輸入確診歲數。'
      : '此項保障金額尚未能按現有資料顯示。';
    return `<div class="claim-result claim-result--pending"><span class="tag">${claimLabel(type)}賠償</span><strong>VERIFY REQUIRED</strong><p class="verify">${pendingReason}</p>${summary.baseAmount ? `<p>基本保障：HK$${money(summary.baseAmount)}</p>` : ''}</div>`;
  }
  if (type === 'early') return `<div class="claim-result"><span class="tag">早期疾病賠償</span><strong>HK$${money(outcome.amount)}</strong><p>${summary.early.percent}% 基本保障</p></div>`;
  const hasExtra = summary.extra.status === 'VERIFIED' && Number(summary.extra.percent) > 0 && Number(summary.extra.amount) > 0;
  return `<div class="claim-result"><span class="tag">主要危疾賠償</span><strong>HK$${money(outcome.amount)}</strong>${hasExtra ? `<div class="claim-breakdown"><div class="protection-row"><span>基本保障</span><strong>${summary.basePercent || 100}%<small>HK$${money(summary.baseAmount)}</small></strong></div><div class="protection-row"><span>額外保障</span><strong>+${summary.extra.percent}%<small>+HK$${money(summary.extra.amount)}</small></strong></div></div>` : `<p>${summary.basePercent || 100}% 基本保障</p>`}</div>`;
}
function supportEffectMarkup(payout, monthlyNeed, desiredMonths, status = 'VERIFIED') {
  if (status !== 'VERIFIED') return '<div class="support-effect support-effect--pending"><strong>輸入確診歲數後顯示支持月份</strong><p class="verify">未能確認實際主要危疾賠償，不會把未確認結果當作零。</p></div>';
  const months = supportMonthsForPayout(payout, monthlyNeed);
  if (months === null) return '<div class="support-effect"><strong>輸入每月生活需要後顯示支持月份</strong></div>';
  const target = Number(desiredMonths) > 0 ? Number(desiredMonths) : null;
  const difference = target ? target - months : 0;
  return `<div class="support-effect"><strong>可支持約 ${Math.round(months)} 個月</strong><small>目標 ${target ? Math.round(target) : '—'} 個月 · ${difference > 0 ? `仍差約 ${Math.round(difference)} 個月` : `本次保障可支持 ${Math.round(months)} 個月`}</small></div>`;
}
function subsequentMajorMarkup(summary) {
  const remaining = remainingMajorProtectionAfterEarlyClaim(summary);
  if (remaining.status !== 'VERIFIED') return '<p class="verify">餘下主要危疾保障尚待官方資料核實。</p>';
  const extraNote = summary.extra.status === 'VERIFY_REQUIRED' ? '；額外保障按確診歲數核實' : '';
  return `<p>餘下主要危疾保障：HK$${money(remaining.amount)}（${remaining.percent}% 基本保障${extraNote}）</p>`;
}
function postPayoutMarkup(summary, plan, type) {
  if (type === 'early') return `<div class="plan-outcome"><strong>賠償後</strong>${subsequentMajorMarkup(summary)}<p>早期疾病賠償後，保障繼續按產品條款提供。</p></div>`;
  const continuing = planKind(plan) !== '一次性保障';
  return `<div class="plan-outcome"><strong>賠償後</strong><p>${continuing ? '首次主要危疾賠償後，仍然享有延續多重賠償保障。' : '完成主要危疾賠償後，合約完結。'}</p></div>`;
}
function payoutEffectBarMarkup(summary, type) {
  if (type === 'early') {
    const remaining = remainingMajorProtectionAfterEarlyClaim(summary);
    if (summary.early.status !== 'VERIFIED' || remaining.status !== 'VERIFIED') return '<div class="payout-effect-bar payout-effect-bar--pending"><span>早期／餘下保障比例待核實</span></div>';
    const earlyPercent = Number(summary.early.percent);
    const remainingPercent = Number(remaining.percent);
    return `<div class="payout-effect-bar payout-effect-bar--segmented" role="img" aria-label="早期疾病 ${earlyPercent}% 已支付，餘下主要危疾保障 ${remainingPercent}%"><span class="payout-segment payout-segment--early" style="width:${earlyPercent}%">早期疾病 ${earlyPercent}%</span><span class="payout-segment payout-segment--remaining" style="width:${remainingPercent}%">餘下主要危疾 ${remainingPercent}%</span></div>`;
  }
  if (summary.major.status !== 'VERIFIED' || !Number(summary.basePercent)) return '<div class="payout-effect-bar payout-effect-bar--pending"><span>主要危疾保障比例待核實</span></div>';
  return `<div class="payout-effect-bar" role="img" aria-label="主要危疾 ${summary.basePercent}% 基本保障"><span style="width:100%">主要危疾 ${summary.basePercent}%</span></div>`;
}
function brochureActionMarkup(planId) {
  const brochures = productBrochureForProduct(datasets().Product_Content, planId, currentUserResourceOverrides(), currentUserBinding());
  return renderBrochureAction(brochures[0]);
}
function planComparisonCard(plan, age, diagnosisAge, compareBoth = false) {
  const id = planKey(plan); const sum = Number(frontstage().sums?.[id]) || 0;
  const summary = planProtectionSummary({ plan, benefits: datasets().Benefits, sumAssured: sum, age, diagnosisAge });
  const type = selectedClaimType();
  return `<article class="card comparison-plan" data-plan-card="${escapeHtml(id)}" data-claim-type="${escapeHtml(type)}"><span class="tag">${escapeHtml(plan.plan_category || plan.badge || '方案')}</span><div class="plan-title-line"><h2>${escapeHtml(planName(plan))}</h2><label class="diagnosis-age-control" for="diagnosis-age-${escapeHtml(id)}">確診歲數 <input id="diagnosis-age-${escapeHtml(id)}" data-diagnosis-age="${escapeHtml(id)}" type="number" min="1" max="120" step="1" inputmode="numeric" value="${diagnosisAge || ''}" placeholder="歲數" aria-label="${escapeHtml(planName(plan))} 確診歲數"></label></div><p class="support">${escapeHtml(planKind(plan))} · 投保年齡 ${age || '待輸入'}${summary.diagnosis?.elapsedYears !== null && summary.diagnosis?.elapsedYears !== undefined ? ` · 保單經過約 ${summary.diagnosis.elapsedYears} 年` : ''}</p>${protectionRows(summary)}<div class="claim-selector" role="group" aria-label="選擇賠償類型"><button class="choice ${type === 'major' ? 'is-selected' : ''}" type="button" data-claim-type="major" data-plan-claim="${escapeHtml(id)}" aria-pressed="${type === 'major'}">主要危疾</button><button class="choice ${type === 'early' ? 'is-selected' : ''}" type="button" data-claim-type="early" data-plan-claim="${escapeHtml(id)}" aria-pressed="${type === 'early'}">早期疾病</button></div><p class="active-result-note">${compareBoth ? `兩份方案同步顯示：${claimLabel(type)}` : `目前情境：${claimLabel(type)}`}</p><div class="actions"><a class="button subtle" href="#/plans/${encodeURIComponent(id)}/diseases">查看保障疾病種類</a>${brochureActionMarkup(id)}</div></article>`;
}
function sharedPayoutEffectCard(visiblePlans, age, diagnosisAge) {
  if (!visiblePlans.length) return '';
  const type = selectedClaimType();
  const entries = visiblePlans.map(plan => {
    const id = planKey(plan);
    const summary = planProtectionSummary({ plan, benefits: datasets().Benefits, sumAssured: Number(frontstage().sums?.[id]) || 0, age, diagnosisAge });
    return { plan, summary, baseAmount: summary.baseAmount, outcome: claimOutcome(summary, type), remaining: type === 'early' ? remainingMajorProtectionAfterEarlyClaim(summary) : null };
  });
  const combined = combinedPlanPayout(entries, type);
  const scope = visiblePlans.length > 1 ? '兩份方案合計' : `${planName(visiblePlans[0])} · 方案結果`;
  const bar = combined.status === 'VERIFIED' ? combinedPayoutEffectBarMarkup(combined, type) : '<div class="payout-effect-bar payout-effect-bar--pending"><span>兩份方案合計尚待資料完整後顯示</span></div>';
  const amount = combined.status === 'VERIFIED' ? combinedClaimAmountMarkup(combined, type) : '<div class="claim-result claim-result--pending"><span class="tag">保障賠償效果</span><strong>VERIFY REQUIRED</strong><p class="verify">兩份方案合計尚待資料完整後顯示。</p></div>';
  const outcome = combined.status === 'VERIFIED' ? supportEffectMarkup(combined.amount, flow().monthlyNeed, flow().desiredMonths, combined.status) : '';
  const details = combined.status === 'VERIFIED' ? payoutBreakdownMarkup(entries, type) : '';
  const post = combined.status === 'VERIFIED' ? combinedPostPayoutMarkup(visiblePlans, type, entries) : '';
  return `<section class="card shared-payout-effect" data-shared-payout-card data-visible-plans="${escapeHtml(visiblePlans.map(planKey).join(','))}" data-active-claim="${escapeHtml(type)}"><div class="shared-payout-heading"><span class="eyebrow">保障賠償效果</span><p class="muted">${escapeHtml(scope)} · ${claimLabel(type)}</p></div>${amount}${details}${bar}${outcome}${post}</section>`;
}
function combinedClaimAmountMarkup(result, type) {
  if (type === 'early') return `<div class="claim-result"><span class="tag">早期疾病賠償</span><strong>HK$${money(result.amount)}</strong><p>${Math.round(result.percent)}% 基本保障 · 兩份方案合計</p><p>餘下主要危疾基本保障：HK$${money(result.remainingAmount)}（${Math.round(result.remainingPercent)}%）</p></div>`;
  return `<div class="claim-result"><span class="tag">主要危疾賠償</span><strong>HK$${money(result.amount)}</strong><p>100% 基本保障 · 另加適用額外保障</p></div>`;
}
function combinedPayoutEffectBarMarkup(result, type) {
  if (type === 'early') return `<div class="payout-effect-bar payout-effect-bar--segmented" role="img" aria-label="早期疾病 ${Math.round(result.percent)}% 已支付，餘下主要危疾保障 ${Math.round(result.remainingPercent)}%"><span class="payout-segment payout-segment--early" style="width:${result.percent / (result.percent + result.remainingPercent) * 100}%">已支付 ${Math.round(result.percent)}%</span><span class="payout-segment payout-segment--remaining" style="width:${result.remainingPercent / (result.percent + result.remainingPercent) * 100}%">餘下 ${Math.round(result.remainingPercent)}%</span></div>`;
  return `<div class="payout-effect-bar" role="img" aria-label="主要危疾 100% 基本保障"><span style="width:100%">主要危疾 100%</span></div>`;
}
function payoutBreakdownMarkup(entries, type) {
  const rows = entries.map(({ plan, summary, outcome }) => {
    const extra = type === 'major' && summary.extra.status === 'VERIFIED' && summary.extra.amount > 0 ? ` <small>額外保障 +HK$${money(summary.extra.amount)}</small>` : '';
    return `<div class="protection-row"><span>${escapeHtml(planName(plan))} · ${Math.round(type === 'early' ? summary.early.percent : summary.basePercent)}%</span><strong>HK$${money(outcome.amount)}${extra}</strong></div>`;
  }).join('');
  if (type !== 'early') return `<div class="claim-breakdown"><strong>賠償明細</strong>${rows}</div>`;
  const early = entries.reduce((sum, entry) => sum + entry.outcome.amount, 0);
  const remaining = entries.reduce((sum, entry) => sum + entry.remaining.amount, 0);
  // A later diagnosis has no separate date in the current scenario. A bonus
  // that could expire between claims cannot be attributed to that later claim.
  const laterKnown = entries.every(({ summary }) => summary.extra.status === 'NOT_APPLICABLE');
  const later = laterKnown ? remaining : null;
  return `<div class="claim-breakdown"><strong>賠償明細</strong>${rows}<div class="payout-path"><strong>先早期，後主要危疾 · 情境示例</strong><p>第一次 · 早期疾病賠償：HK$${money(early)}（20%）</p><p>第二次 · 主要危疾賠償：${later === null ? `HK$${money(remaining)}（餘下基本保障 80%）；額外保障須按較後確診時間確認` : `HK$${money(later)}（餘下基本保障 80%）`}</p><p>累計總賠償：${later === null ? `基本保障合計 HK$${money(early + remaining)}；實際累計須待額外保障確認` : `HK$${money(early + later)}`}</p></div></div>`;
}
function combinedPostPayoutMarkup(visiblePlans, type, entries) {
  if (type === 'early') return '<div class="plan-outcome"><strong>賠償後</strong><p>早期疾病賠償後，兩份方案的餘下保障按各自產品條款繼續提供。</p></div>';
  const rows = entries.map(({ plan, summary }) => {
    if (planKey(plan) === 'SCE') return '<p>簡護危疾保：主要危疾賠償後，合約完結。</p>';
    const waiver = summary.premiumWaiver.status === 'VERIFIED' ? '往後保費獲豁免，' : '保費豁免安排待確認，';
    return `<p>${escapeHtml(planName(plan))}：符合適用條款的主要危疾賠償後，${waiver}延續多重賠償保障按條款繼續有效。</p>`;
  }).join('');
  return `<div class="plan-outcome"><strong>賠償後</strong>${rows}</div>`;
}
function bindPlanInputs() {
  document.querySelector('#plan-age')?.addEventListener('change', event => { const value = Math.max(0, Math.trunc(Number(event.target.value) || 0)); frontstage().age = value || null; frontstage().claimDemo = {}; persistUser(); plansPage(); });
  document.querySelectorAll('[data-diagnosis-age]').forEach(input => input.addEventListener('input', event => {
    const value = Math.max(0, Math.trunc(Number(event.target.value) || 0));
    const inputId = event.target.id;
    frontstage().diagnosisAge = value || null;
    frontstage().claimDemo = {};
    persistUser();
    plansPage();
    const nextInput = document.getElementById(inputId);
    nextInput?.focus();
  }));
  document.querySelectorAll('[data-money-input]').forEach(input => input.addEventListener('input', () => { const value = formatMoneyInput(input); const key = input.dataset.moneyInput; if (key === 'monthly-need' || key === 'existing-protection') flow()[key === 'monthly-need' ? 'monthlyNeed' : 'existingProtection'] = value; else { frontstage().sums ||= {}; frontstage().sums[key] = value; } persistUser(); }));
  document.querySelectorAll('[data-plan-sum]').forEach(input => input.addEventListener('change', () => { formatMoneyInput(input); frontstage().claimDemo = {}; persistUser(); plansPage(); }));
  document.querySelectorAll('[data-plan-claim]').forEach(button => button.addEventListener('click', () => { frontstage().comparisonClaimType = button.dataset.claimType === 'early' ? 'early' : 'major'; persistUser(); plansPage(); }));
}
function plansPage() { const s = supportSummary(); const age = savedAge(); const diagnosisAge = savedDiagnosisAge(); const visiblePlans = routedPlans(); const routeMode = flow().protectionStyle; const heading = routeMode === 'single' ? '一次性保障方案' : routeMode === 'continuing' ? '持續／多次保障方案' : '直接比較兩種危疾保障'; const planCards = visiblePlans.map(plan => `<div class="plan-input-wrap"><div class="field card-field"><label for="sum-${escapeHtml(planKey(plan))}">${escapeHtml(planName(plan))}基本保額（HK$）</label><input id="sum-${escapeHtml(planKey(plan))}" data-plan-sum="${escapeHtml(planKey(plan))}" data-money-input="${escapeHtml(planKey(plan))}" type="text" min="1" inputmode="numeric" value="${moneyInputValue(frontstage().sums?.[planKey(plan)])}"></div>${planComparisonCard(plan, age, diagnosisAge, visiblePlans.length > 1)}</div>`); const comparison = renderPlanComparisonLayout({ planCards: planCards.length ? planCards : ['<p class="empty">官方方案資料尚未提供。</p>'], sharedPayoutCard: sharedPayoutEffectCard(visiblePlans, age, diagnosisAge) }); render(`<section class="hero"><span class="eyebrow">Actual Plans</span><h1>${heading}</h1><p class="support">先輸入投保年齡及基本保額；確診歲數可在每張方案標題旁輸入，直接看首10年升級保障、賠償結果及生活支援效果。</p><div class="plan-scenario-inputs"><div class="field"><label for="plan-age">投保年齡</label><input id="plan-age" type="number" min="1" max="120" step="1" inputmode="numeric" value="${age || ''}" placeholder="進入實際方案時輸入"></div></div><p class="muted">投保年齡用於選擇 +50% / +35% 年齡組別；確診歲數只用於判斷首10年保障期。目標 HK$${money(s.desired)} · ${flow().desiredMonths} 個月 · 現有保障約 ${s.months.toFixed(1)} 個月</p><div class="actions"><a class="button subtle" href="#/flow">返回 Guided Flow</a><a class="button secondary" href="#/claims">多重賠償情境</a><a class="button secondary" href="#/premiums">方案保費</a><a class="button secondary" href="#/presentation">一鍵客戶展示</a></div></section>${comparison}`); bindPlanInputs(); }

function planProtection(id) { const planId = decodeURIComponent(id); const plan = plans().find(item => planKey(item) === planId); if (!plan) return plansPage(); const summary = planProtectionSummary({ plan, benefits: datasets().Benefits, sumAssured: Number(frontstage().sums?.[planId]) || 0, age: savedAge(), diagnosisAge: savedDiagnosisAge() }); const continuing = planKind(plan) !== '一次性保障'; render(`<section class="hero"><span class="eyebrow">Protection</span><h1>${escapeHtml(planName(plan))}</h1><p class="support">${escapeHtml(planKind(plan))} · 先看賠償後的保障狀態，再查看詳細內容。</p>${protectionRows(summary)}<div class="actions"><a class="button secondary" href="#/plans">返回方案</a><a class="button subtle" href="#/plans/${encodeURIComponent(planId)}/diseases">查看保障疾病種類</a>${brochureActionMarkup(planId)}<a class="button primary" href="#/plans/${encodeURIComponent(planId)}/claim">查看保障效果</a></div></section><section class="grid"><article class="card"><h2>${continuing ? '多次保障' : '一次性保障'}</h2><p>${continuing ? '首次合資格嚴重疾病獲得賠償後，可按產品條款繼續享有保障。' : '發生合資格嚴重疾病後賠償基本保障額；完成100%賠償後合約完結。'}</p>${continuing ? premiumWaiverCopy(summary) : ''}</article><article class="card"><h2>保費</h2><p class="verify">保費金額需以官方費率及已核實計算次序為準。</p><a class="button secondary" href="#/premiums">查看方案保費</a></article></section>`); }
function resourceMarkup(resource) { const ref = resource.resourceReference || firebaseResourceUrl(resource); const title = resource.title || resource.content_type || '疾病保障資源'; const type = resourceKind(resource); const image = /^image\//i.test(type) ? `<img class="resource-preview" loading="lazy" src="${escapeHtml(ref)}" alt="${escapeHtml(title)}">` : ''; const contentType = String(resource.content_type || '').toLowerCase(); const action = contentType === 'brochure' ? '查看產品小冊子' : contentType === 'claim_example' || contentType === 'claim_case' ? '查看案例' : type === 'pdf' ? '開啟 PDF' : /^image\//i.test(type) ? '查看圖片' : '開啟資源'; return `<article class="card resource-card"><h3>${escapeHtml(title)}</h3><p class="muted">${escapeHtml(resource.short_text || '')}</p>${image}<a class="button secondary" href="${escapeHtml(ref)}" target="_blank" rel="noopener">${action}</a></article>`; }
function currentUserResourceOverrides() { return Array.isArray(state.user.resourceOverrides) ? state.user.resourceOverrides : []; }
function currentUserBinding() { return state.user.userBinding || null; }
function diseaseResourcePage(id) { const planId = decodeURIComponent(id); const plan = plans().find(item => planKey(item) === planId); if (!plan) return plansPage(); const productContent = datasets().Product_Content; const categories = diseaseResourcesForProduct(productContent, planId, savedAge(), currentUserResourceOverrides(), currentUserBinding()); const diseaseBody = categories.length ? categories.map(category => `<section class="resource-category"><h2>${escapeHtml(category.label)}</h2><div class="grid">${category.resources.map(resourceMarkup).join('')}</div></section>`).join('') : '<p class="empty">目前未配置可開啟的疾病保障資源。</p>'; render(`<section class="hero"><span class="eyebrow">Disease resources</span><h1>${escapeHtml(planName(plan))} · 保障疾病種類</h1><div class="actions"><a class="button secondary" href="#/plans">返回方案</a></div></section>${diseaseBody}`); }
function planProtectionDetail(id) { return diseaseResourcePage(id); }
function planClaim(id) { const planId = decodeURIComponent(id); const plan = plans().find(item => planKey(item) === planId); if (!plan) return plansPage(); const age = savedAge(); const sum = Number(frontstage().sums?.[planId]) || 0; const summary = planProtectionSummary({ plan, benefits: datasets().Benefits, sumAssured: sum, age, diagnosisAge: savedDiagnosisAge() }); const continuing = planKind(plan) !== '一次性保障'; const amountReady = Number(summary.totalApplicable) > 0 && summary.major.status === 'VERIFIED' && summary.extra.status !== 'VERIFY_REQUIRED'; const claimed = amountReady && Boolean(frontstage().claimDemo?.[planId]); const payout = summary.totalApplicable; const stateCard = claimed ? continuing ? `<article class="card claim-state claim-state--active" data-claim-state="continuing">${claimPayout(summary, true)}<p>保障仍然生效</p>${premiumWaiverCopy(summary)}<p>仍可享有多重賠償</p><a class="button primary" href="#/claims" data-open-multiple>繼續查看多重賠償情境</a></article>` : `<article class="card claim-state claim-state--ended" data-claim-state="ended">${claimPayout(summary, false)}<p>一次性賠償完成</p><p><strong>合約完結</strong></p></article>` : `<article class="card claim-state"><span class="tag">${continuing && summary.extra.status === 'VERIFIED' ? '模擬首次主要危疾賠償' : continuing ? '模擬首次100%主要危疾賠償' : '模擬100%一次性賠償'}</span><p>按目前輸入的投保年齡及基本保額，查看賠償後的真實保障狀態。</p><button class="button primary" data-full-claim="${escapeHtml(planId)}" ${amountReady ? '' : 'disabled'}>${continuing && summary.extra.status === 'VERIFIED' ? '模擬首次主要危疾賠償' : '模擬100%賠償'}${amountReady ? ` · HK$${money(payout)}` : ''}</button>${amountReady ? '' : '<p class="verify">請先在方案比較輸入年齡及有效基本保額；額外保障未核實前不會自行推算。</p>'}</article>`; render(`<section class="hero"><span class="eyebrow">Claim outcome</span><h1>${escapeHtml(planName(plan))}</h1><p class="support">${escapeHtml(planKind(plan))} · 以視覺看清楚主要危疾賠償後的結果。</p>${stateCard}<div class="actions"><a class="button secondary" href="#/plans/${encodeURIComponent(planId)}/protection">返回保障頁</a><a class="button subtle" href="#/plans">返回方案比較</a></div></section>`); document.querySelector('[data-full-claim]')?.addEventListener('click', () => { frontstage().claimDemo ||= {}; frontstage().claimDemo[planId] = true; if (continuing) frontstage().claimPlanId = planId; persistUser(); planClaim(planId); }); document.querySelector('[data-open-multiple]')?.addEventListener('click', () => { frontstage().claimPlanId = planId; persistUser(); }); }

function planDetail(id) { return planProtectionDetail(id); }

function experienceNav() { return '<nav class="actions experience-nav" aria-label="保障比較"><a class="button subtle" href="#/plans">方案比較</a><a class="button subtle" href="#/claims">多重賠償</a><a class="button subtle" href="#/premiums">方案保費</a><a class="button subtle" href="#/presentation">客戶展示</a></nav>'; }
function comparisonPage() { return plansPage(); /* compatibility route; the principal plans are already the comparison */ }

function ageLabel(months) { const years = Math.floor(months / 12); const remainder = months % 12; return `${years}歲${remainder ? `${remainder}個月` : ''}`; }
function claimEvent(event, ageText) { return `<li class="claim-event"><span class="event-age">${escapeHtml(ageText)}</span><div><strong>${escapeHtml(event.label)}</strong><p>本次 ${event.percent}% · HK$${money(event.amount)}</p><small>累計 ${event.cumulativePercent}% · HK$${money(event.cumulativeAmount)}</small>${event.remainingPercent !== undefined ? `<small>癌症延續保障餘額 ${event.remainingPercent}%</small>` : ''}</div></li>`; }
// Multi-claim Frontstage markup is composed once in claimPage() so the cross-disease total stays at the bottom.
function multiClaimGrandTotalMarkup(total) {
  const status = total.eventCount ? `已模擬 ${total.eventCount} 次賠償` : '目前尚未加入賠償模擬';
  return `<article class="card cumulative-payout-card cumulative-payout-card--grand"><span class="eyebrow">${status}</span><h2>三類疾病累積賠償</h2><strong>HK$${money(total.amount)}</strong><p>癌症＋心臟病／中風＋腦退化症，目前已模擬賠償合計${total.percent ? ` · 累積 ${total.percent}%` : ''}</p></article>`;
}

function multiClaimSimulationState() {
  const current = frontstage().multiClaimSimulation ||= {};
  if (current.cancerStarted === undefined) current.cancerStarted = Array.isArray(frontstage().cancerActions) && frontstage().cancerActions.length > 0;
  // Legacy defaults (one heart claim and age + three dementia years) are
  // previews, not user-simulated events. Only an explicit marker, or a
  // legacy value that could only have come from an added event, is active.
  if (current.heartStarted === undefined) current.heartStarted = Number(frontstage().heartClaims) > 1;
  if (current.dementiaStarted === undefined) current.dementiaStarted = false;
  return current;
}

function resetMultiClaimSimulation() {
  frontstage().multiClaimSimulation = emptyMultiClaimSimulation();
  frontstage().cancerActions = [];
  frontstage().heartClaims = 0;
  delete frontstage().throughAge;
}

function claimPage() {
  const plan = continuingPlan(); const id = plan && planKey(plan); const sum = Number(frontstage().sums?.[id]) || 0; const age = savedAge();
  const scenario = ['cancer', 'heart', 'dementia'].includes(frontstage().scenario) ? frontstage().scenario : 'cancer';
  const rules = datasets().Claim_Rules;
  const simulation = multiClaimSimulationState();
  const cancer = id && cancerTimeline({ rules, planId: id, sumAssured: sum, age, actions: frontstage().cancerActions || [] });
  const heartClaims = simulation.heartStarted ? Math.max(1, Number(frontstage().heartClaims) || 1) : 1;
  const heart = id && heartStrokeTimeline({ rules, planId: id, sumAssured: sum, age, claims: heartClaims });
  const throughAge = Math.max(age || 0, Number(frontstage().throughAge) || (age || 0) + 3);
  const dementia = id === 'OYS2' && age && sum ? dementiaTimeline({ sumAssured: sum, age, throughAge }) : null;
  let body;
  if (!id || !age || !sum) body = '<p class="empty">先輸入客戶目前年齡及延續保障方案基本保額，便可查看以實際年齡呈現的情境。</p>';
  else if (scenario === 'cancer') body = cancer ? `<div class="card result-panel"><small>${simulation.cancerStarted ? '癌症累積賠償模擬' : '癌症賠償預覽'}</small><strong>600%</strong><p>首次 100% ＋ 後續延續保障最高 500%；兩種後續選項共用同一保障池。</p><p>現時延續保障餘額 ${cancer.remainingPercent}% · 若選 B，尚可 ${cancer.remainingBMonths} 個月</p></div><ol class="claim-timeline">${cancer.events.slice(-8).map(event => claimEvent(event, ageLabel(event.ageMonths))).join('')}</ol><div class="actions">${!simulation.cancerStarted ? '<button class="secondary" id="cancer-start">加入首次癌症賠償模擬</button>' : ''}<button class="secondary" data-cancer-action="A" ${!simulation.cancerStarted || cancer.optionBActivated || cancer.remainingPercent < 100 ? 'disabled' : ''}>加入選項 A · 相隔 3 年 100%</button><button class="secondary" data-cancer-action="B" ${!simulation.cancerStarted || cancer.remainingPercent < 5 ? 'disabled' : ''}>加入選項 B · 下個 5% 月份</button><button class="subtle" id="cancer-reset">重設情境</button></div><p class="muted">${simulation.cancerStarted ? '只計入已加入模擬的賠償事件。' : '以上為計算預覽，尚未計入三類疾病累積賠償。'}</p>` : '<p class="verify">癌症官方規則未能完整核對，模擬暫不可用。</p>';
  else if (scenario === 'heart') body = heart ? `<div class="card result-panel"><small>${simulation.heartStarted ? '心臟病／中風累積賠償' : '心臟病／中風賠償預覽'}</small><strong>累計 ${heart.events.at(-1).cumulativePercent}%</strong><p>${simulation.heartStarted ? `已加入 ${heart.events.length} / ${heart.maxClaims} 次 · 尚餘 ${heart.remainingClaims} 次機會` : '首次賠償只作預覽，尚未計入三類疾病累積賠償。'}</p></div><ol class="claim-timeline">${heart.events.map(event => claimEvent(event, `${event.age}歲`)).join('')}</ol><div class="actions">${!simulation.heartStarted ? '<button class="secondary" id="heart-start">加入首次心臟病／中風模擬</button>' : `<button class="secondary" id="heart-next" ${heart.remainingClaims ? '' : 'disabled'}>加入下一次 · 相隔 1 年</button>`}<button class="subtle" id="heart-reset">重設情境</button></div><p class="muted">僅展示已核實數字；實際合約資格須另行核實。</p>` : `<div class="card"><h2>心臟病／中風</h2><p class="verify">VERIFY REQUIRED：目前官方 Claim_Rules 這筆資料欄位錯位，賠償百分比、次數與間隔暫不能作為正式計算。</p><p>客戶目前 ${age} 歲。待官方規則修正後，這裡會以實際年齡顯示每次賠償、累計及餘下機會。</p></div>`;
  else body = id === 'OYS2' && dementia ? `<div class="card result-panel"><small>${simulation.dementiaStarted ? '腦退化症累積賠償' : '腦退化症賠償預覽'} · 使用已確認業務規則</small><strong>首次 100%</strong><p>其後每年 6% 基本保額，${simulation.dementiaStarted ? `目前顯示到 ${throughAge} 歲；只計入已選擇的期間。` : '預設顯示到約三年後，但未加入累積總額。'}</p><p>到 ${throughAge} 歲累計 ${dementia.events.at(-1).cumulativePercent}% · HK$${money(dementia.events.at(-1).cumulativeAmount)}</p></div><ol class="claim-timeline">${dementia.events.slice(-8).map(event => claimEvent(event, `${event.age}歲`)).join('')}</ol><div class="actions">${!simulation.dementiaStarted ? '<button class="secondary" id="dementia-start">加入首次腦退化症模擬</button>' : ''}<button class="secondary" data-dementia-years="1" ${!simulation.dementiaStarted ? 'disabled' : ''}>再看 1 年</button><button class="secondary" data-dementia-years="10" ${!simulation.dementiaStarted ? 'disabled' : ''}>再看 10 年</button><button class="subtle" id="dementia-reset">重設情境</button></div><p class="muted">合約資格與付款時間仍須核實。</p>` : '<p class="verify">此方案的腦退化症規則尚待核實。</p>';
  const total = multiClaimGrandTotalFromSimulation({ cancer, heart, dementia }, simulation);
  render(`<section class="hero"><span class="eyebrow">多重賠償</span><h1>第一次之後，保障怎樣延續？</h1><div class="ava-comparison experience-grid"><div class="card"><h2>一次保障</h2><p>確診 → 首次保障 → 合約完結</p></div><div class="card"><h2>延續保障</h2><p>確診 → 首次保障 → 治療／康復 → 延續保障</p></div></div>${experienceNav()}</section><div class="claim-controls">${continuingPlans().length > 1 ? `<div class="field"><label for="claim-plan">延續保障方案</label><select id="claim-plan">${continuingPlans().map(item => `<option value="${escapeHtml(planKey(item))}" ${planKey(item) === id ? 'selected' : ''}>${escapeHtml(planName(item))}</option>`).join('')}</select></div>` : ''}<div class="field"><label for="claim-age">客戶目前年齡</label><input id="claim-age" type="number" min="1" step="1" value="${age || ''}"></div><div class="field"><label for="claim-sum">${escapeHtml(plan ? planName(plan) : '延續保障方案')}基本保額（HK$）</label><input id="claim-sum" data-money-input="claim-sum" type="text" inputmode="numeric" value="${moneyInputValue(sum)}"></div></div><div class="scenario-nav" role="group" aria-label="選擇情境">${[['cancer','癌症'],['heart','心臟病／中風'],['dementia','腦退化症']].map(([key,label]) => `<button class="${scenario === key ? 'primary' : 'secondary'}" data-scenario="${key}" aria-pressed="${scenario === key}">${label}</button>`).join('')}</div><section class="scenario-body">${body}</section>${multiClaimGrandTotalMarkup(total)}`);
  document.querySelector('#claim-plan')?.addEventListener('change', event => { frontstage().claimPlanId = event.target.value; resetMultiClaimSimulation(); persistUser(); claimPage(); });
  document.querySelector('#claim-age')?.addEventListener('change', event => { frontstage().age = Math.max(0, Math.trunc(Number(event.target.value) || 0)); resetMultiClaimSimulation(); persistUser(); claimPage(); });
  document.querySelector('#claim-sum')?.addEventListener('input', event => { const value = formatMoneyInput(event.target); if (id) { frontstage().sums ||= {}; frontstage().sums[id] = value; } persistUser(); });
  document.querySelector('#claim-sum')?.addEventListener('change', () => { resetMultiClaimSimulation(); persistUser(); claimPage(); });
  document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => { frontstage().scenario = button.dataset.scenario; persistUser(); claimPage(); }));
  document.querySelector('#cancer-start')?.addEventListener('click', () => { simulation.cancerStarted = true; persistUser(); claimPage(); });
  document.querySelectorAll('[data-cancer-action]').forEach(button => button.addEventListener('click', () => { simulation.cancerStarted = true; frontstage().cancerActions ||= []; frontstage().cancerActions.push(button.dataset.cancerAction); persistUser(); claimPage(); }));
  document.querySelector('#cancer-reset')?.addEventListener('click', () => { simulation.cancerStarted = false; frontstage().cancerActions = []; persistUser(); claimPage(); });
  document.querySelector('#heart-start')?.addEventListener('click', () => { simulation.heartStarted = true; frontstage().heartClaims = 1; persistUser(); claimPage(); });
  document.querySelector('#heart-next')?.addEventListener('click', () => { simulation.heartStarted = true; frontstage().heartClaims = Math.min(3, Math.max(1, Number(frontstage().heartClaims) || 1) + 1); persistUser(); claimPage(); });
  document.querySelector('#heart-reset')?.addEventListener('click', () => { simulation.heartStarted = false; frontstage().heartClaims = 0; persistUser(); claimPage(); });
  document.querySelector('#dementia-start')?.addEventListener('click', () => { simulation.dementiaStarted = true; frontstage().throughAge = age; persistUser(); claimPage(); });
  document.querySelectorAll('[data-dementia-years]').forEach(button => button.addEventListener('click', () => { simulation.dementiaStarted = true; frontstage().throughAge = throughAge + Number(button.dataset.dementiaYears); persistUser(); claimPage(); }));
  document.querySelector('#dementia-reset')?.addEventListener('click', () => { simulation.dementiaStarted = false; frontstage().throughAge = age; persistUser(); claimPage(); });
}

function premiumMoney(value) { return Number(value).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function premiumPage() {
  const age = savedAge(); const gender = frontstage().gender === 'F' ? 'F' : 'M'; const smoker = frontstage().smoker === 'smoker' ? 'smoker' : 'non-smoker';
  const term = [10,18,25].includes(Number(frontstage().payTerm)) ? Number(frontstage().payTerm) : 18;
  const mode = frontstage().premiumPaymentMode === 'monthly' ? 'monthly' : 'annual';
  const cards = plans().map(plan => { const id = planKey(plan); const sum = Number(frontstage().sums?.[id]) || 0;
    const evidence = premiumEvidence(state.official?.premium, plan, gender, age, smoker, term, sum);
    const health = planProtectionSummary({ plan, benefits: datasets().Benefits, sumAssured: sum, age }).health;
    const quote = premiumQuote(evidence, health, healthProgramParticipating());
    let benefit = '';
    if (healthProgramParticipating() && health?.status === 'VERIFIED' && quote.status === 'AVAILABLE') {
      if (id === 'SCE' && health.effectType === 'premium_multiplier') benefit = `<small>原基準年繳保費 HK$${premiumMoney(evidence.annualPremium)}</small><small>Vitality 保費 ${Number((health.premiumMultiplier * 10).toFixed(2))} 折${Number(health.row?.annual_fee) > 0 ? `；會費另計 HK$${money(health.row.annual_fee)}／年` : ''}</small>`;
      if (id === 'OYS2' && health.effectType === 'coverage_bonus') benefit = `<small>Vitality 額外保障 +${money((health.coverageMultiplier - 1) * 100)}%</small><small>額外保障 HK$${money(health.coverageBonusAmount)} · 合計 HK$${money(sum * health.coverageMultiplier)}</small>`;
    }
    return `<article class="card premium-plan"><h2>${escapeHtml(planName(plan))}</h2><p>基本保額 ${sum ? `HK$${money(sum)}` : '待輸入'}</p>${renderPremiumFigures(quote, mode)}${benefit}</article>`; }).join('');
  const matrixKey = `SCE_${gender === 'F' ? 'FEMALE' : 'MALE'}`;
  const matrix = state.official?.premium?.[matrixKey]?.values || [];
  const rateColumn = smoker === 'smoker' ? 2 : 1;
  const ages = premiumMatrixHasExpectedHeaders(matrixKey, matrix) ? matrix.filter(row => Array.isArray(row) && row[0] !== '' && row[0] !== null && Number.isInteger(Number(row[0])) && Number(row[0]) >= age && Number(row[rateColumn]) > 0).map(row => Number(row[0])) : [];
  const horizon = age && ages.length ? Math.min(100, Math.max(...ages) - age + 1) : 0;
  const schedule = calculatePremiumSchedule({ issueAge: age, horizon, term, vitality: healthProgramParticipating(), premium: state.official?.premium, plans: plans(), sums: frontstage().sums, healthProgram: datasets().Health_Program, gender, smoker, lookup: premiumEvidence, healthEffect: healthProgramEffect, diagnosisAge: savedDiagnosisAge(), claimType: selectedClaimType(), paymentMode: mode });
  render(`<section class="hero"><span class="eyebrow">方案保費</span><h1>並排看保障與供款</h1>${experienceNav()}</section><section class="premium-inputs card"><div class="field"><label for="premium-age">投保年齡</label><input id="premium-age" type="number" min="1" step="1" value="${age || ''}"></div><div class="field"><label for="premium-gender">性別</label><select id="premium-gender"><option value="M" ${gender === 'M' ? 'selected' : ''}>男</option><option value="F" ${gender === 'F' ? 'selected' : ''}>女</option></select></div><div class="field"><label for="premium-smoker">吸煙狀態</label><select id="premium-smoker"><option value="non-smoker" ${smoker === 'non-smoker' ? 'selected' : ''}>非吸煙</option><option value="smoker" ${smoker === 'smoker' ? 'selected' : ''}>吸煙</option></select></div><div class="field"><label for="premium-vitality">AIA Vitality</label><select id="premium-vitality"><option value="no" ${!frontstage().vitality ? 'selected' : ''}>未參加</option><option value="yes" ${frontstage().vitality ? 'selected' : ''}>參加</option></select></div><div class="field"><label for="premium-term">愛伴航2供款期</label><select id="premium-term">${[10,18,25].map(years => `<option value="${years}" ${term === years ? 'selected' : ''}>${years} 年</option>`).join('')}</select></div><div class="field"><label for="premium-mode">付款方式</label><select id="premium-mode"><option value="annual" ${mode === 'annual' ? 'selected' : ''}>年繳</option><option value="monthly" ${mode === 'monthly' ? 'selected' : ''}>月繳</option></select></div></section><section class="ava-comparison experience-grid">${cards || '<p class="empty">官方方案資料尚未提供。</p>'}</section><details class="card" id="premium-schedule" ${frontstage().premiumScheduleOpen ? 'open' : ''}><summary>查看逐年保費</summary>${renderPremiumSchedule(schedule)}</details>`);
  document.querySelector('#premium-schedule')?.addEventListener('toggle', event => { frontstage().premiumScheduleOpen = event.target.open; persistUser(); });
  for (const [selector, key, convert] of [['#premium-age','age',value => Math.max(0, Math.trunc(Number(value) || 0))],['#premium-gender','gender',String],['#premium-smoker','smoker',String],['#premium-vitality','vitality',value => value === 'yes'],['#premium-term','payTerm',Number],['#premium-mode','premiumPaymentMode',String]]) document.querySelector(selector)?.addEventListener('change', event => { frontstage()[key] = convert(event.target.value); persistUser(); premiumPage(); });
}

function presentation() { const s = supportSummary(); const chosen = plans(); const result = selectedProtection(chosen, datasets().Benefits, chosen.map(planKey), frontstage().sums || {}, flow().monthlyNeed); const scenario = frontstage().scenario; const age = savedAge(); const continuing = continuingPlan(); const sum = Number(frontstage().sums?.[continuing && planKey(continuing)]) || 0; const cancer = scenario === 'cancer' && continuing && age && sum ? cancerTimeline({ rules: datasets().Claim_Rules, planId: planKey(continuing), sumAssured: sum, age, actions: frontstage().cancerActions || [] }) : null; const dementia = scenario === 'dementia' && age && sum ? dementiaTimeline({ sumAssured: sum, age, throughAge: Math.max(age, Number(frontstage().throughAge) || age + 3) }) : null; const claimSummary = cancer ? `癌症：${ageLabel(cancer.events.at(-1).ageMonths)}累計 ${cancer.events.at(-1).cumulativePercent}%；延續保障餘額 ${cancer.remainingPercent}%。` : dementia ? `腦退化症：到 ${dementia.events.at(-1).age} 歲累計 ${dementia.events.at(-1).cumulativePercent}%；其後按已確認規則每年延續，終身。` : scenario === 'heart' ? '心臟病／中風：官方規則欄位待修正，金額與時間線 VERIFY REQUIRED。' : ''; render(`<section class="hero presentation"><span class="eyebrow">Customer Presentation</span><h1>你的生活支援預備金</h1><p class="support">重大疾病發生時，治療、康復時間和生活開支會同時存在。</p><section class="grid"><article class="card metric"><small>希望準備</small><strong>HK$${money(s.desired)}</strong><span>${flow().desiredMonths} 個月 × 每月 HK$${money(flow().monthlyNeed)}</span></article><article class="card metric"><small>現有保障約等於</small><strong>${s.months.toFixed(1)} 個月</strong><span>現有 HK$${money(s.existing)}</span></article></section><div class="card"><h2>一次與延續</h2><p>一次保障：首次賠償後合約完結。延續保障：首次賠償後，符合條件可繼續獲得保障。</p><p>現有保障支持約 ${s.months.toFixed(1)} / ${flow().desiredMonths} 個月。</p></div>${chosen.length ? `<div class="card"><h2>實際方案比較</h2><p>${chosen.map(p => escapeHtml(planName(p))).join('、')}</p><p><strong>兩個方案主要危疾保障算術合計 HK$${money(result.total)}</strong>${result.months === null ? '' : ` · 約 ${result.months.toFixed(1)} 個月生活需要`}</p><small>只作展示兩種保障規模；不同保單或事件不一定同時賠付。</small></div>` : ''}${claimSummary ? `<div class="card"><h2>多重賠償情境</h2><p>${claimSummary}</p></div>` : ''}<div class="card"><h2>方案保費</h2><p class="verify">年度、月度及總保費尚待官方映射與計算次序核實。</p></div><div class="actions"><a class="button primary" href="#/comparison">查看方案比較</a><a class="button secondary" href="#/plans">返回方案</a><a class="button secondary" href="#/flow">返回 Guided Flow</a></div></section>`, 'presentation'); }

function returnContext() { return resolveAvaReturnContext({ referrer: document.referrer, currentUrl: location.href }); }
async function returnToAva(event) { event?.preventDefault(); if (dirty() && !await confirmDiscard()) return; const context = returnContext(); const fallback = canEdit ? 'https://ivancww.github.io/avaplatform/?avaSurface=user' : 'https://ivancww.github.io/avaplatform/'; window.location.assign(context || fallback); }
function confirmDiscard() {
  return new Promise(resolve => {
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'discard-dialog';
    dialog.setAttribute('aria-labelledby', 'discard-heading');
    dialog.innerHTML = `<h2 id="discard-heading">尚有未儲存的修改</h2><p>要放棄修改嗎？</p><div class="actions"><button type="button" class="secondary" data-continue>繼續編輯</button><button type="button" class="danger" data-discard>放棄修改</button></div>`;
    document.body.append(dialog);
    let accepted = false;
    dialog.querySelector('[data-continue]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-discard]').addEventListener('click', () => { accepted = true; dialog.close(); });
    dialog.addEventListener('close', () => { dialog.remove(); previous?.focus?.(); resolve(accepted); }, { once: true });
    dialog.showModal(); dialog.querySelector('[data-continue]').focus();
  });
}
function renderModeBar() {
  let bar = document.querySelector('#user-mode-bar');
  if (!bar) { bar = document.createElement('section'); bar.id = 'user-mode-bar'; document.querySelector('.app-header').after(bar); }
  bar.hidden = !canEdit || editMode === 'use';
  const badge = document.querySelector('#user-mode-indicator');
  if (badge) { badge.hidden = bar.hidden; badge.textContent = '編輯模式'; }
  if (bar.hidden) { bar.innerHTML = ''; return; }
  bar.className = 'ava-mode-bar';
  const count = 1 + draftPages.length;
  bar.innerHTML = `<div class="mode-actions"><strong tabindex="-1" id="mode-heading">可編輯頁面 ${editIndex + 1} / ${count}</strong><button type="button" class="secondary" id="edit-prev" ${editIndex === 0 ? 'disabled' : ''}>上一頁</button><button type="button" class="secondary" id="edit-next" ${editIndex >= count - 1 ? 'disabled' : ''}>下一頁</button><button type="button" class="primary" id="save-edit">儲存全部修改</button><button type="button" class="secondary" id="cancel-edit">取消修改</button></div><div class="mode-actions edit-tools"><label for="new-page-type">新增類型</label><select id="new-page-type"><option value="content">文字</option><option value="image">圖片</option><option value="video">影片</option></select><button type="button" class="secondary" id="add-user-page">新增自訂頁面</button><button type="button" class="secondary" id="backup-user">下載草稿備份</button><label class="button secondary file-button" for="restore-user">還原備份</label><input id="restore-user" type="file" accept="application/json" hidden></div>${editNotice ? '<div class="mode-notice">點選個人文字直接修改，所有頁面完成後一次儲存。官方產品資料及計算不會改動。 <button type="button" class="subtle" id="dismiss-edit-notice">知道了</button></div>' : ''}`;
  bar.querySelector('#dismiss-edit-notice')?.addEventListener('click', () => { editNotice = false; renderModeBar(); });
  bar.querySelector('#edit-prev')?.addEventListener('click', () => { editIndex--; editView(); });
  bar.querySelector('#edit-next')?.addEventListener('click', () => { editIndex++; editView(); });
  bar.querySelector('#add-user-page')?.addEventListener('click', () => { const t = new Date().toISOString(); draftPages.push({ id: `ci-user-page-${crypto.randomUUID()}`, type: bar.querySelector('#new-page-type').value, title: '自訂頁面', subtitle: '', content: '', flowPosition: draftPages.length, sortOrder: draftPages.length, visible: true, createdAt: t, updatedAt: t, overrides: {}, media: [] }); editIndex = draftPages.length; editView(); });
  bar.querySelector('#backup-user')?.addEventListener('click', downloadBackup);
  bar.querySelector('#restore-user')?.addEventListener('change', restoreBackup);
  bar.querySelector('#save-edit')?.addEventListener('click', saveEditDraft);
  bar.querySelector('#cancel-edit')?.addEventListener('click', async () => { if (dirty() && !await confirmDiscard()) return; try { const raw = localStorage.getItem('AVA_CI_USER_STATE_V1'); if (raw !== null) { state.user = normalizeUserState(JSON.parse(raw)); state.user.flow = createFlowState(state.user.flow); } } catch (error) { setStatus(`無法讀取已儲存資料，草稿仍保留：${error.message}`, true); return; } savedPages = createDraft(state.user); savedIntro = createIntro(state.user); draftPages = createDraft(state.user); draftIntro = createIntro(state.user); editMode = 'use'; suppressEditExitReset = true; route(); setStatus('已取消修改。'); });
}
function saveEditDraft() {
  try { const saved = savePagesVerified({ storage: localStorage, user: state.user, savedPages, draft: draftPages, savedIntro, draftIntro, normalize: normalizeUserState }); state.user = normalizeUserState(saved); state.user.flow = createFlowState(state.user.flow); savedPages = createDraft(state.user); draftPages = createDraft(saved); savedIntro = createIntro(state.user); draftIntro = createIntro(state.user); editMode = 'use'; suppressEditExitReset = true; route(); setStatus('儲存成功。'); }
  catch (error) { setStatus(`儲存失敗，修改仍保留，請重試：${error.message}`, true); }
}
function editPage() { editView(); }
function inlineField(tag, field, value, label, attrs = '') {
  return `<${tag} ${attrs} class="inline-edit${tag === 'p' ? ' support' : ''}" contenteditable="plaintext-only" role="textbox" aria-label="${escapeHtml(label)}" data-inline-field="${field}" data-empty-label="${escapeHtml(label)}" spellcheck="false">${escapeHtml(value)}</${tag}>`;
}
function editView() {
  editIndex = Math.max(0, Math.min(editIndex, draftPages.length));
  let html;
  if (editIndex === 0) {
    const official = composeOfficialAndUser(state.official || {}, {}).presentation;
    html = `<section class="hero ava-concept"><span class="eyebrow">AVA Critical Illness</span><h1>${escapeHtml(official.introSubtitle || '生活支援預備金')}</h1><p class="support">${escapeHtml(official.introTitle || '一場大病，需要面對嘅往往唔只係醫療費。')}</p><div class="concept-flow"><span>治療</span><b>＋</b><span>需要時間休養</span><b>＋</b><span>生活仍然繼續</span><b>→</b><strong>一筆可以靈活運用嘅生活支援預備金</strong></div><p class="support">${escapeHtml(official.introSupport || '由你希望保留的時間開始，慢慢理解保障。')}</p><section class="personal-intro"><strong>個人介紹</strong>${inlineField('h2','introSubtitle',draftIntro.introSubtitle,'個人標題')}${inlineField('p','introTitle',draftIntro.introTitle,'個人主訊息')}${inlineField('p','introSupport',draftIntro.introSupport,'個人補充說明')}<label class="intro-toggle"><input type="checkbox" id="show-intro" ${draftIntro.showIntro ? 'checked' : ''}> 顯示個人介紹</label>${draftIntro.showIntro ? '' : '<p class="muted">客戶展示時隱藏個人介紹。</p>'}</section></section>`;
  } else {
    const i = editIndex - 1; const p = draftPages[i];
    html = `<article class="card user-page"><span class="eyebrow">自訂頁面${p.visible ? '' : ' · 已隱藏'}</span>${inlineField('h2','title',p.title,'頁面標題')}${inlineField('p','subtitle',p.subtitle,'頁面副標題')}${inlineField('p','content',p.content,'頁面說明')}${p.type === 'image' || p.type === 'video' ? mediaMarkup(p) : ''}<div class="actions"><button type="button" class="secondary" data-page-action="toggle">${p.visible ? '隱藏此頁' : '顯示此頁'}</button><button type="button" class="secondary" data-page-action="up" ${i === 0 ? 'disabled' : ''}>上移</button><button type="button" class="secondary" data-page-action="down" ${i === draftPages.length - 1 ? 'disabled' : ''}>下移</button><button type="button" class="secondary" data-page-action="delete">刪除此頁</button></div></article>`;
  }
  render(html, 'edit');
  main.querySelectorAll('[data-inline-field]').forEach(el => {
    el.addEventListener('input', () => { const key = el.dataset.inlineField; if (editIndex === 0 && ['introTitle','introSubtitle','introSupport'].includes(key)) draftIntro[key] = el.innerText; else if (editIndex > 0 && ['title','subtitle','content'].includes(key)) draftPages[editIndex - 1][key] = el.innerText; });
    el.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
  });
  main.querySelector('#show-intro')?.addEventListener('change', e => { draftIntro.showIntro = e.target.checked; });
  main.querySelectorAll('[data-page-action]').forEach(button => button.addEventListener('click', () => { const i = editIndex - 1; const page = draftPages[i]; if (!page) return; const action = button.dataset.pageAction; if (action === 'toggle') page.visible = !page.visible; if (action === 'delete') { if (!window.confirm('刪除此自訂頁面？儲存前仍可取消修改。')) return; draftPages.splice(i, 1); editIndex = Math.min(editIndex, draftPages.length); } if (action === 'up' && i > 0) { [draftPages[i-1], draftPages[i]] = [draftPages[i], draftPages[i-1]]; editIndex--; } if (action === 'down' && i < draftPages.length - 1) { [draftPages[i+1], draftPages[i]] = [draftPages[i], draftPages[i+1]]; editIndex++; } draftPages.forEach((p, n) => { p.sortOrder = n; }); editView(); }));
}
function bindUserPages() { /* Frontend uses read-only existing presentation. */ }
function downloadBackup() { const blob = new Blob([JSON.stringify(createUserBackup(canEdit && editMode !== 'use' ? { ...state.user, pages: draftPages, pagePreferences: { ...state.user.pagePreferences, ...draftIntro } } : state.user), null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'ava-critical-illness-user-backup.json'; link.click(); URL.revokeObjectURL(link.href); }
async function restoreBackup(event) { try { const file = event.target.files?.[0]; if (!file) return; if (dirty() && !await confirmDiscard()) return; const restored = restoreUserBackup(JSON.parse(await file.text())); restored.flow = createFlowState(restored.flow); const previous = localStorage.getItem('AVA_CI_USER_STATE_V1'); let written = null; try { const saved = saveUserState(restored); written = JSON.stringify(saved); const readback = localStorage.getItem('AVA_CI_USER_STATE_V1'); if (readback !== written) throw new Error('讀回不一致'); state.user = saved; } catch (e) { try { if (written !== null && localStorage.getItem('AVA_CI_USER_STATE_V1') === written) { if (previous === null) localStorage.removeItem('AVA_CI_USER_STATE_V1'); else localStorage.setItem('AVA_CI_USER_STATE_V1', previous); } } catch {} throw e; } savedPages = createDraft(state.user); draftPages = createDraft(state.user); savedIntro = createIntro(state.user); draftIntro = createIntro(state.user); setStatus('Backup 已還原；媒體只保留 Cloud references。'); editIndex = 0; route(); } catch (e) { setStatus(`Backup 還原失敗：${e.message}`, true); } }

function adminValue(value) { const safe = redactOfficialValue(value); if (safe === null || safe === undefined || safe === '') return '—'; if (typeof safe === 'object') return JSON.stringify(safe); return String(safe); }
function adminRecordIdentity(dataset, record, index) {
  const id = adminRecordId(dataset, record);
  const labelKey = ['plan_name', 'benefit_name', 'condition_name', 'program_name', 'title', 'short_name', 'category', 'key', 'name'].find(key => record?.[key] !== undefined && record?.[key] !== null && record?.[key] !== '');
  const label = labelKey ? String(record[labelKey]) : `第 ${index + 1} 筆`;
  return { id, label, option: id ? `${id} · ${label}` : label };
}
function editableAdminFields(dataset, record) {
  const id = adminRecordId(dataset, record);
  const version = adminRecordVersion(record);
  const versionRecord = dataset !== 'Settings_Versions' || /^dataset_(plans|benefits|claims|health|content|premium)_version$/.test(id);
  return id && version && versionRecord ? adminEditableFields(dataset, record) : [];
}
function adminControlMarkup(key, value) {
  const type = adminFieldType(key, value);
  const originalType = typeof value;
  const common = `class="ava-input" name="${escapeHtml(key)}" data-admin-field="${escapeHtml(key)}" data-admin-type="${type}" data-original-type="${originalType}"`;
  if (type === 'textarea') return `<textarea ${common}>${escapeHtml(value ?? '')}</textarea>`;
  if (type === 'checkbox') return `<input ${common} type="checkbox" ${value === true ? 'checked' : ''}>`;
  return `<input ${common} type="${type}" value="${escapeHtml(value ?? '')}">`;
}
function adminMediaUploadMarkup(record) {
  const id = adminRecordId('Product_Content', record);
  const ref = record.resource_ref || '';
  return `<section class="admin-media-upload" data-media-upload-panel data-content-id="${escapeHtml(id)}"><h4>官方 PDF／圖片資源</h4><p class="muted">可選擇 PDF 或圖片後上載；Firebase 檔案上載只限 CI Official namespace，官方資料寫入仍需 AVA Admin 授權。</p>${ref ? `<p class="muted">目前檔案：<a href="${escapeHtml(ref)}" target="_blank" rel="noopener">開啟目前資源</a></p>` : '<p class="muted">目前未配置資源。</p>'}<label class="admin-field admin-field--editable"><span>上載新檔案</span><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" data-media-file="${escapeHtml(id)}"></label><div class="actions"><button class="secondary" type="button" data-media-upload="${escapeHtml(id)}">上載／發布資源</button></div><p class="muted" data-media-status="${escapeHtml(id)}" role="status">尚未上載。</p></section>`;
}
function adminRecordMarkup(record, dataset = '', index = 0, selected = false) {
  const safe = redactOfficialValue(record);
  const entries = Object.entries(safe || {}).filter(([, value]) => value !== null && value !== undefined);
  const identity = adminRecordIdentity(dataset, record, index);
  const version = adminRecordVersion(record);
  const editable = editableAdminFields(dataset, record);
  const editableSet = new Set(editable);
  const fields = entries.length ? entries.map(([key, value]) => editableSet.has(key)
    ? `<div class="admin-field admin-field--readonly"><span>${escapeHtml(adminFieldLabel(key))}<small>（可編輯）</small></span><strong>${escapeHtml(adminValue(value))}</strong></div>`
    : `<div class="admin-field admin-field--readonly"><span>${escapeHtml(adminFieldLabel(key))}<small>（唯讀）</small></span><strong>${escapeHtml(adminValue(value))}</strong></div>`).join('')
    : '<p class="muted">沒有可顯示的官方欄位。</p>';
  const form = editable.length ? `<form class="admin-edit-form" data-admin-form data-admin-dataset="${escapeHtml(dataset)}" data-admin-record="${escapeHtml(identity.id)}"><p class="admin-form-version muted">預期記錄版本：${escapeHtml(version)}</p><div class="admin-editable-fields">${editable.map(key => `<label class="admin-field admin-field--editable"><span>${escapeHtml(adminFieldLabel(key))}</span>${adminControlMarkup(key, record[key])}</label>`).join('')}</div><div class="actions"><button class="primary" type="submit">驗證並儲存官方資料</button><button class="subtle" type="button" data-admin-cancel>取消</button></div></form>` : '<p class="muted admin-readonly-note">此記錄沒有可寫入欄位；資料只作檢視。</p>';
  const media = dataset === 'Product_Content' ? adminMediaUploadMarkup(record) : '';
  return `<article class="admin-record" data-admin-record="${escapeHtml(identity.id)}" data-admin-record-index="${index}" data-admin-record-label="${escapeHtml(identity.label)}" data-admin-dataset="${escapeHtml(dataset)}" data-admin-plan-id="${escapeHtml(record.plan_id || '')}" data-admin-content-type="${escapeHtml(record.content_type || '')}"${selected ? '' : ' hidden'}><div class="admin-record-heading"><div><span class="eyebrow">${escapeHtml(identity.id || 'Official record')}</span><h3>${escapeHtml(identity.label)}</h3></div><span class="admin-record-index">第 ${index + 1} 筆</span></div><div class="admin-field-grid">${fields}</div>${form}${media}</article>`;
}
function adminReadonlyRecordMarkup(record, dataset, index) {
  const safe = redactOfficialValue(record);
  const entries = Object.entries(safe || {}).filter(([, value]) => value !== null && value !== undefined);
  return `<article class="admin-record admin-record--readonly" data-admin-readonly-dataset="${escapeHtml(dataset)}"><div class="admin-record-heading"><div><span class="eyebrow">Official Layer</span><h3>${escapeHtml(adminRecordIdentity(dataset, record, index).label)}</h3></div><span class="admin-record-index">第 ${index + 1} 筆</span></div><div class="admin-field-grid">${entries.length ? entries.map(([key, value]) => `<div class="admin-field admin-field--readonly"><span>${escapeHtml(adminFieldLabel(key))}</span><strong>${escapeHtml(adminValue(value))}</strong></div>`).join('') : '<p class="muted">沒有可顯示的官方欄位。</p>'}</div></article>`;
}
function adminRecordSelector(dataset, records, selectedIndex) {
  if (records.length < 2) return '';
  return `<div class="admin-record-tools"><label for="admin-record-select-${escapeHtml(dataset)}"><span>選擇記錄</span><select class="ava-input" id="admin-record-select-${escapeHtml(dataset)}" data-admin-record-select="${escapeHtml(dataset)}">${records.map((record, index) => { const identity = adminRecordIdentity(dataset, record, index); return `<option value="${index}"${index === selectedIndex ? ' selected' : ''}>${escapeHtml(identity.option)}</option>`; }).join('')}</select></label><span class="quiet-note">已選擇一筆官方記錄；切換前會保護未儲存草稿。</span></div>`;
}
function adminDatasetSection(dataset, records, active = false, { readonly = false } = {}) {
  const meta = ADMIN_SECTION_META[dataset];
  const selectedIndex = Math.min(Math.max(Number(adminSelectedRecords[dataset] || 0), 0), Math.max(records.length - 1, 0));
  if (records.length && !readonly) adminSelectedRecords[dataset] = selectedIndex;
  const recordMarkup = readonly
    ? (records.length ? records.map((record, index) => adminReadonlyRecordMarkup(record, dataset, index)).join('') : '<p class="empty">官方資料未配置；不會在前端自行補造商業規則。</p>')
    : (records.length ? `${adminRecordSelector(dataset, records, selectedIndex)}<div class="admin-record-list">${records.map((record, index) => adminRecordMarkup(record, dataset, index, index === selectedIndex)).join('')}</div>` : '<p class="empty">官方資料未配置；不會在前端自行補造商業規則。</p>');
  return `<section class="admin-section" id="admin-${meta.id}" data-admin-panel="${escapeHtml(meta.id)}" data-admin-dataset="${escapeHtml(dataset)}" role="tabpanel" aria-labelledby="admin-tab-${meta.id}" tabindex="-1"${active ? '' : ' hidden'}><div class="admin-section-heading"><div><span class="eyebrow">${escapeHtml(dataset === 'premium' || dataset === 'sources' ? 'Official Layer' : dataset)}</span><h2>${escapeHtml(meta.label)}</h2><p class="muted">${escapeHtml(meta.description)}</p></div><span class="admin-count">${records.length} 筆</span></div>${recordMarkup}</section>`;
}
function adminInputValue(input) { if (input.type === 'checkbox') return input.checked; if (input.dataset.originalType === 'number') return input.value === '' ? '' : Number(input.value); return input.value; }
function activateAdminTab(button, { focusPanel = true } = {}) {
  const tabs = [...document.querySelectorAll('[data-admin-tab]')];
  const panels = [...document.querySelectorAll('[data-admin-panel]')];
  const id = button?.dataset.adminTab;
  if (!id) return;
  discardAdminDrafts();
  adminActiveSection = id;
  tabs.forEach(tab => { const active = tab === button; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  panels.forEach(panel => { panel.hidden = panel.dataset.adminPanel !== id; });
  if (focusPanel) { const panel = document.getElementById(`admin-${id}`); panel?.scrollIntoView({ block: 'start', behavior: 'auto' }); button?.focus?.({ preventScroll: true }); }
}
function adminHasDirtyDraft() { return [...document.querySelectorAll('[data-admin-form][data-dirty="true"]')].length > 0; }
function discardAdminDrafts() { document.querySelectorAll('[data-admin-form][data-dirty="true"]').forEach(form => { form.reset(); form.dataset.dirty = 'false'; }); }
function activateAdminRecord(select) {
  const panel = select.closest('[data-admin-panel]');
  const records = [...(panel?.querySelectorAll('[data-admin-record-index]') || [])];
  const nextIndex = Number(select.value);
  if (!panel || !Number.isInteger(nextIndex) || !records[nextIndex]) return false;
  if (adminHasDirtyDraft() && !globalThis.confirm?.('目前有未保存的編輯。要放棄草稿並切換嗎？')) { select.value = String(panel.dataset.adminSelectedRecord || 0); return false; }
  discardAdminDrafts();
  const dataset = panel.dataset.adminDataset;
  adminSelectedRecords[dataset] = nextIndex;
  panel.dataset.adminSelectedRecord = String(nextIndex);
  records.forEach((record, index) => { record.hidden = index !== nextIndex; });
  records[nextIndex].scrollIntoView?.({ block: 'start', behavior: 'auto' });
  return true;
}
function bindAdmin() {
  document.querySelectorAll('[data-admin-cancel]').forEach(button => button.addEventListener('click', () => { const form = button.closest('[data-admin-form]'); if (!form) return; form.reset(); form.dataset.dirty = 'false'; }));
  document.querySelectorAll('[data-admin-form]').forEach(form => {
    const markDirty = () => { form.dataset.dirty = 'true'; };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const record = form.closest('[data-admin-record]');
      const fields = Object.fromEntries([...form.elements].filter(input => input.name).map(input => [input.name, adminInputValue(input)]));
      try {
        const request = createAdminWriteRequest({ dataset: record.dataset.adminDataset, recordId: record.dataset.adminRecord, expectedVersion: form.querySelector('[data-admin-version]')?.textContent.replace('預期記錄版本：', '').trim() || form.querySelector('.admin-form-version')?.textContent.replace('預期記錄版本：', '').trim(), fields });
        await writeOfficialData(request, adminSessionProof);
        const latest = await loadOfficialData();
        const normalized = { ...latest, structured: normalizeStructuredData(latest.structured) };
        validateOfficialData(normalized);
        state.official = normalized;
        saveOfficialCache(normalized);
        adminActiveSection = document.querySelector('[data-admin-tab][aria-selected="true"]')?.dataset.adminTab || adminActiveSection;
        adminSelectedRecords[record.dataset.adminDataset] = Number(record.dataset.adminRecordIndex || 0);
        setStatus('官方資料已保存並由伺服器重新確認。');
        route();
      } catch (error) { setStatus(`官方資料未保存：${error.message}`, true); }
    });
  });
  document.querySelectorAll('[data-admin-tab]').forEach((tab, index, tabs) => {
    const canSwitch = () => !adminHasDirtyDraft() || Boolean(globalThis.confirm?.('目前有未保存的編輯。要放棄草稿並切換嗎？'));
    tab.addEventListener('click', () => { if (canSwitch()) activateAdminTab(tab); });
    tab.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length; if (canSwitch()) { tabs[nextIndex].focus(); activateAdminTab(tabs[nextIndex], { focusPanel: false }); } });
  });
  document.querySelectorAll('[data-admin-record-select]').forEach(select => {
    const panel = select.closest('[data-admin-panel]');
    if (panel) panel.dataset.adminSelectedRecord = select.value;
    select.addEventListener('change', () => activateAdminRecord(select));
  });
  document.querySelectorAll('[data-media-file]').forEach(input => input.addEventListener('change', () => {
    const panel = input.closest('[data-media-upload-panel]');
    const id = input.dataset.mediaFile;
    const statusNode = [...(panel?.querySelectorAll('[data-media-status]') || [])].find(item => item.dataset.mediaStatus === id);
    const file = input.files?.[0];
    if (statusNode && file) {
      const size = file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
      statusNode.textContent = `已選擇檔案：${file.name} · ${file.type || '未知格式'} · ${size}`;
    }
  }));
  document.querySelectorAll('[data-media-upload]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.mediaUpload;
    const panel = button.closest('[data-media-upload-panel]');
    const input = [...(panel?.querySelectorAll('[data-media-file]') || [])].find(item => item.dataset.mediaFile === id);
    const statusNode = [...(panel?.querySelectorAll('[data-media-status]') || [])].find(item => item.dataset.mediaStatus === id);
    const record = panel?.closest('[data-admin-record]');
    const setMediaStatus = (message, error = false) => { if (statusNode) { statusNode.textContent = message; statusNode.classList.toggle('is-error', error); } };
    if (!adminSessionProof) { setMediaStatus('上載未獲授權：必須由 AVA Studio Admin session 啟動。', true); return; }
    const file = input?.files?.[0];
    if (!file) { setMediaStatus('請先選擇 PDF 或圖片。', true); return; }
    try {
      try {
        validateMediaFile(file);
      } catch (error) {
        error.stage = 'file-validation';
        throw error;
      }
      setMediaStatus('正在上載…');
      const result = await uploadOfficialMedia({ planId: record?.dataset.adminPlanId || '', category: record?.querySelector('[data-admin-field="category"]')?.value || 'documents', contentId: id, contentType: record?.dataset.adminContentType || '', file, adminSessionProof });
      setMediaStatus('Firebase 上載完成，正在更新官方資料…');
      const request = createAdminWriteRequest({ dataset: 'Product_Content', recordId: id, expectedVersion: record?.querySelector('.admin-form-version')?.textContent.replace('預期記錄版本：', '').trim(), fields: { resource_type: result.resourceType, resource_ref: result.url } });
      await writeOfficialData(request, adminSessionProof);
      const latest = await loadOfficialData();
      const normalized = { ...latest, structured: normalizeStructuredData(latest.structured) };
      validateOfficialData(normalized);
      state.official = normalized;
      saveOfficialCache(normalized);
      setMediaStatus('已發佈');
      setStatus('官方資源已上載並由伺服器重新確認。');
      route();
    } catch (error) {
      const message = error.code === 'ADMIN_PROOF_REQUIRED'
        ? `AVA Admin 授權失敗：${error.message}`
        : error.stage === 'file-validation'
          ? `檔案驗證失敗：${error.message}`
        : error.stage === 'firebase-module'
          ? `Firebase 模組載入失敗：${error.message}`
          : error.stage === 'firebase-upload'
            ? `Firebase 上載失敗：${error.message}`
            : error.stage === 'firebase-object-verification'
              ? `Firebase 物件確認失敗：${error.message}`
              : error.stage === 'firebase-download-url'
                ? `Firebase 資源 URL 取得失敗：${error.message}`
                : `官方資料更新失敗：${error.message}`;
      setMediaStatus(message, true);
    }
  }));
  if (!globalThis.__ciAdminUnloadGuard) { globalThis.__ciAdminUnloadGuard = true; globalThis.addEventListener?.('beforeunload', event => { if (adminHasDirtyDraft()) { event.preventDefault(); event.returnValue = ''; } }); }
}
function adminPage() {
  if (!canAdmin || !adminSessionProof) return adminDeniedPage();
  const d = datasets();
  const plans = officialRecords(d, 'Plans');
  const benefits = officialRecords(d, 'Benefits');
  const claimRules = officialRecords(d, 'Claim_Rules');
  const healthProgram = officialRecords(d, 'Health_Program');
  const content = officialRecords(d, 'Product_Content');
  const versions = officialRecords(d, 'Settings_Versions');
  const premium = premiumSheetStatus(state.official?.premium || {});
  const resources = resourceStatus(content);
  const fetchedAt = state.official?.fetchedAt || state.official?.cachedAt || 'Not available';
  const sourceRows = [['GAS endpoint', GAS_DATA_API_URL], ['Structured data', `${state.official?.freshness?.structured?.status || 'unknown'} · ${state.official?.freshness?.structured?.fetchedAt || '未確認'} · ${state.official?.freshness?.structured?.error || '無錯誤'}`], ['Premium sheets', `${state.official?.freshness?.premium?.status || 'unknown'} · ${state.official?.freshness?.premium?.fetchedAt || '未確認'} · ${state.official?.freshness?.premium?.error || '無錯誤'}`], ['Firebase resources', `${resources.linked} linked · ${resources.unlinked} unlinked / not configured`], ['Dataset versions', versions.length ? `${versions.length} records` : 'NOT AVAILABLE'], ['Last successful refresh', fetchedAt]].map(([key, value]) => ({ key, value }));
  const activeId = ADMIN_SECTION_META[Object.keys(ADMIN_SECTION_META).find(dataset => ADMIN_SECTION_META[dataset].id === adminActiveSection) || 'Plans'].id;
  const sectionLinks = ADMIN_SECTION_DEFINITIONS.map(([, dataset], index) => { const meta = ADMIN_SECTION_META[dataset]; const records = { Plans: plans, Benefits: benefits, Claim_Rules: claimRules, Health_Program: healthProgram, Product_Content: content, premium, sources: sourceRows, Settings_Versions: versions }[dataset] || []; const active = meta.id === activeId; return `<button class="admin-tab${active ? ' is-active' : ''}" id="admin-tab-${meta.id}" type="button" role="tab" data-admin-tab="${meta.id}" aria-selected="${active}" aria-controls="admin-${meta.id}" tabindex="${active ? '0' : '-1'}"><span>${escapeHtml(meta.label)}</span><small>${records.length} 筆</small></button>`; }).join('');
  const persistence = adminPersistenceStatus();
  const systemDataVersion = state.official?.structured?._meta?.data_version || state.official?.structured?._meta?.version || '未提供';
  const sections = [
    adminDatasetSection('Plans', plans, activeId === ADMIN_SECTION_META.Plans.id),
    adminDatasetSection('Benefits', benefits, activeId === ADMIN_SECTION_META.Benefits.id),
    adminDatasetSection('Claim_Rules', claimRules, activeId === ADMIN_SECTION_META.Claim_Rules.id),
    adminDatasetSection('Health_Program', healthProgram, activeId === ADMIN_SECTION_META.Health_Program.id),
    adminDatasetSection('Product_Content', content, activeId === ADMIN_SECTION_META.Product_Content.id),
    adminDatasetSection('premium', premium, activeId === ADMIN_SECTION_META.premium.id, { readonly: true }),
    adminDatasetSection('sources', sourceRows, activeId === ADMIN_SECTION_META.sources.id, { readonly: true }),
    adminDatasetSection('Settings_Versions', versions, activeId === ADMIN_SECTION_META.Settings_Versions.id)
  ].join('');
  render(`<section class="admin-shell" data-ava-mode="admin"><div class="admin-surface"><div class="admin-topline"><span>AVA Studio · Critical Illness Admin</span><span>Official Layer only</span></div><nav class="admin-section-nav" role="tablist" aria-label="Critical Illness 官方資料分區">${sectionLinks}</nav>${sections}<details class="admin-system-info"><summary>系統資料</summary><button type="button" id="retry-official">重新載入官方資料</button><div class="admin-system-grid"><p><strong>App 版本</strong><span>v${escapeHtml(APP_VERSION)}</span></p><p><strong>Official 資料版本</strong><span>${escapeHtml(systemDataVersion)}</span></p><p><strong>同步狀態</strong><span>${escapeHtml(persistence.status)} · ${escapeHtml(persistence.reason)}</span></p><p><strong>最近更新</strong><span>${escapeHtml(fetchedAt)}</span></p><p><strong>安全狀態</strong><span>${escapeHtml(persistence.authentication)}；Official Write 必須有 AVA Platform Admin session。</span></p></div></details></div></section>`, 'admin');
  bindAdmin();
}
function adminDeniedPage() { render(`<section class="hero" data-ava-mode="admin"><span class="eyebrow">AVA Studio · Critical Illness Admin</span><h1>Admin 未授權</h1><p class="support">${escapeHtml(adminAuthorizationError)}</p><p class="muted">此網址只是 Admin routing；沒有 AVA Platform 的一次性 App 授權，Official 資料和寫入功能不會顯示。</p><div class="actions"><a class="button secondary return-ava" href="#return-to-ava" data-return-to-ava>返回 AVA</a></div></section>`, 'admin'); document.querySelector('[data-return-to-ava]')?.addEventListener('click', returnToAva); }
function unsupportedEntryPage() { render('<section class="hero"><span class="eyebrow">AVA Entry unavailable</span><h1>此入口未配置</h1><p class="support">這個 avaEntry 尚未由 AVA Platform 啟用。請從 AVA 以 Frontstage 或 User 入口重新開啟。</p></section>'); }
let lastRouteKey = null;
function route() { if (canEdit && editMode === 'edit') return editView(); const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean); const routeKey = parts[0] || 'home'; if (!suppressEditExitReset && isNewMultiClaimEntry(lastRouteKey, routeKey)) { resetMultiClaimSimulation(); persistUser(); } suppressEditExitReset = false; lastRouteKey = routeKey; if (unsupportedEntry) return unsupportedEntryPage(); if (canAdmin) return adminPage(); if (!parts.length) return home(); if (parts[0] === 'flow') return flowPage(); if (parts[0] === 'plans' && parts[1] && parts[2] === 'diseases') return diseaseResourcePage(parts[1]); if (parts[0] === 'plans' && parts[1] && parts[2] === 'protection' && parts[3] === 'detail') return diseaseResourcePage(parts[1]); if (parts[0] === 'plans' && parts[1] && parts[2] === 'protection') return planProtection(parts[1]); if (parts[0] === 'plans' && parts[1] && parts[2] === 'claim') return planClaim(parts[1]); if (parts[0] === 'plans' && parts[1]) return planDetail(parts[1]); if (parts[0] === 'plans') return plansPage(); if (parts[0] === 'comparison') return comparisonPage(); if (parts[0] === 'claims') return claimPage(); if (parts[0] === 'premiums') return premiumPage(); if (parts[0] === 'presentation') return presentation(); if (parts[0] === 'edit') return editPage(); return home(); }
let officialRefreshRunning = false;
async function refreshOfficial() {
  if (officialRefreshRunning) return;
  officialRefreshRunning = true;
  try {
  const data = await refreshOfficialData(state.official);
  state.official = data;
  if (data.structured || data.premium) saveOfficialCache(data);
  const f = data.freshness;
  const label = key => `${key === 'structured' ? '方案資料' : '保費資料'}：${f[key].status === 'fresh' ? '已取得' : f[key].status === 'stale' ? '使用舊資料' : '未取得'}${f[key].error ? `（${f[key].error}）` : ''}`;
  if (canAdmin && adminSessionProof) setStatus(`${label('structured')}；${label('premium')}。兩者版本未能共同確認。`, f.structured.status !== 'fresh' || f.premium.status !== 'fresh');
  route();
  } finally { officialRefreshRunning = false; }
}
async function establishAdminAuthorization() {
  if (!canAdmin) return;
  const params = new URLSearchParams(location.search);
  const launchTicket = params.get('avaAdminLaunch');
  const launchNonce = params.get('avaAdminLaunchNonce');
  if (!launchTicket || !launchNonce) { route(); return; }
  try {
    const payload = await exchangeAdminLaunch({ launchTicket, launchNonce });
    adminSessionProof = payload.adminSessionProof;
    adminAuthorizationError = '';
    const clean = new URL(location.href); clean.searchParams.delete('avaAdminLaunch'); clean.searchParams.delete('avaAdminLaunchNonce'); history.replaceState(null, '', clean.href);
  } catch (error) { adminSessionProof = null; adminAuthorizationError = error.message; }
  route();
}
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const reloadKey = 'ci-sw-reload-pending';
  const hadController = Boolean(navigator.serviceWorker.controller);
  const controllerUrl = navigator.serviceWorker.controller?.scriptURL || '';
  let reloadConsumed = false;
  try {
    const marker = JSON.parse(sessionStorage.getItem(reloadKey) || 'null');
    if (marker?.fromController && marker.fromController !== controllerUrl) {
      // The guarded reload completed with a different controller. This page
      // must not reload again for the same transition, but later page boots
      // may establish a fresh guard for a later worker update.
      reloadConsumed = true;
      sessionStorage.removeItem(reloadKey);
    } else if (marker) {
      // Preserve the guard when a reload did not yet produce a new controller.
      reloadConsumed = true;
    }
  } catch {
    reloadConsumed = Boolean(sessionStorage.getItem(reloadKey));
  }
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading || reloadConsumed || dirty()) return;
    reloading = true;
    reloadConsumed = true;
    try { sessionStorage.setItem(reloadKey, JSON.stringify({ fromController: controllerUrl, at: Date.now() })); } catch { /* reload remains bounded by in-memory state */ }
    window.location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
    // Check at boot, when the app returns online, and when an installed PWA
    // becomes visible again. The periodic check covers a long-lived tab while
    // keeping the stable cache and all User data intact.
    const updateRegistration = () => {
      if (navigator.onLine === false) return Promise.resolve();
      return registration.update().catch(() => undefined);
    };
    window.addEventListener('online', updateRegistration);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') updateRegistration();
    });
    window.setInterval(updateRegistration, 5 * 60 * 1000);
    return updateRegistration();
  }).catch(() => setStatus('離線外殼未能啟用。', true));
}

window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('click', event => { if (canEdit && editMode === 'edit' && event.target.closest?.('a.brand')) { event.preventDefault(); editIndex = 0; editView(); } if (event.target?.id === 'retry-official') refreshOfficial(); });
document.querySelector('[data-return-to-ava]')?.addEventListener('click', returnToAva); window.addEventListener('hashchange', route); route(); if (!state.official && canAdmin) setStatus('官方資料正在載入。'); refreshOfficial(); establishAdminAuthorization(); registerServiceWorker(); window.__AVA_CI_BOOT_OK__ = true; window.__AVA_CI_MARK_BOOT_OK__?.();
export { supportSummary, state, verificationState };
