import { premiumMatrixHasExpectedHeaders } from '../data/data-api.js?v=0.6.10';
import { calculateDementiaParkinsonClaim, createCancerState, payCancerOptionA, payCancerOptionBMonth, payInitialCancerClaim, remainingCancerOptionBMonths } from './claim-engine.js?v=0.6.10';
import { translateProtectionToMonths } from './flow-state.js?v=0.6.10';
import { resolveBenefits, resolveClaimRules } from './product-engine.js?v=0.6.10';

const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const active = row => row?.enabled !== false && row?.active !== false;
const planId = plan => plan.plan_id ?? plan.plan_key;

export function comparisonItems(plan, benefits = [], sumAssured) {
  const id = planId(plan);
  const major = resolveBenefits(benefits, id).find(row => row.benefit_type === 'major_ci' && active(row) && Number(row.payout_percent) === 100);
  if (!major || !positive(sumAssured)) return [];
  return [{ planId: id, benefitId: major.benefit_id, label: major.benefit_name, amount: Number(sumAssured), percent: 100 }];
}

export function selectedProtection(plans, benefits, selectedPlanIds, sums, monthlyNeed) {
  const items = plans.filter(plan => selectedPlanIds.includes(planId(plan)))
    .flatMap(plan => comparisonItems(plan, benefits, sums[planId(plan)]));
  const total = items.reduce((amount, item) => amount + item.amount, 0);
  return { items, total, months: positive(monthlyNeed) && items.length ? translateProtectionToMonths({ existingProtection: total, monthlyNeed }) : null };
}

export function cancerEvidence(rules, id) {
  const rows = resolveClaimRules(rules, id).filter(row => row.condition_group === 'cancer');
  const initial = rows.find(row => row.claim_phase === 'initial');
  const a = rows.find(row => row.claim_option === 'A');
  const b = rows.find(row => row.claim_option === 'B');
  if (Number(initial?.payout_value) !== 100 || Number(a?.payout_value) !== 100 ||
    Number(a?.shared_pool_percent) !== 500 || a?.shared_pool_id !== b?.shared_pool_id ||
    Number(a?.interval_value) !== 3 || a?.interval_unit !== 'year' ||
    Number(b?.payout_value) !== 5 || Number(b?.interval_value) !== 1 || b?.interval_unit !== 'year' ||
    b?.duration_rule !== 'remaining_pool_divided_by_5' || a?.option_switch_rule !== 'A_TO_B_ONLY' ||
    b?.option_switch_rule !== 'B_LOCKED') return null;
  return { poolPercent: 500, aIntervalYears: 3, bIntervalYears: 1, aPercent: 100, bMonthlyPercent: 5 };
}

export function cancerTimeline({ rules, planId: id, sumAssured, age, actions = [] }) {
  const evidence = cancerEvidence(rules, id);
  if (!evidence || !positive(sumAssured) || !Number.isInteger(Number(age)) || Number(age) < 0) return null;
  let claim = payInitialCancerClaim(createCancerState(sumAssured, { shared_pool_percent: evidence.poolPercent }));
  let month = Number(age) * 12;
  const events = [{ ageMonths: month, label: '首次癌症保障', percent: 100, amount: Number(sumAssured), cumulativePercent: 100, cumulativeAmount: Number(sumAssured), remainingPercent: 500 }];
  let lastOption = null;
  for (const action of actions) {
    if (action === 'A') {
      claim = payCancerOptionA(claim);
      month += evidence.aIntervalYears * 12;
      lastOption = 'A';
    } else if (action === 'B') {
      claim = payCancerOptionBMonth(claim);
      month += lastOption === 'B' ? 1 : evidence.bIntervalYears * 12;
      lastOption = 'B';
    } else continue;
    const cumulativePercent = 100 + evidence.poolPercent - claim.remainingPoolPercent;
    events.push({ ageMonths: month, label: action === 'A' ? '選項 A · 再次符合條件' : `選項 B · 第 ${claim.optionBMonths} 個月`, percent: claim.payoutPercent, amount: claim.payout, cumulativePercent, cumulativeAmount: Number(sumAssured) * cumulativePercent / 100, remainingPercent: claim.remainingPoolPercent });
  }
  return { events, remainingPercent: claim.remainingPoolPercent, remainingBMonths: remainingCancerOptionBMonths(claim), optionBActivated: claim.optionBActivated, maxPercent: 600 };
}

export function dementiaTimeline({ sumAssured, age, throughAge }) {
  if (!positive(sumAssured) || !Number.isInteger(Number(age)) || Number(age) < 0 ||
    !Number.isInteger(Number(throughAge)) || Number(throughAge) < Number(age)) return null;
  const events = [];
  for (let currentAge = Number(age); currentAge <= Number(throughAge); currentAge++) {
    const payout = calculateDementiaParkinsonClaim({ sumAssured, initial: currentAge === Number(age) });
    const cumulativePercent = 100 + (currentAge - Number(age)) * 6;
    events.push({ age: currentAge, label: currentAge === Number(age) ? '首次保障' : '每年延續保障', percent: payout.payoutPercent, amount: payout.payout, cumulativePercent, cumulativeAmount: Number(sumAssured) * cumulativePercent / 100 });
  }
  return { events, duration: 'lifetime' };
}

export function heartStrokeEvidence(rules, id) {
  const row = resolveClaimRules(rules, id).find(item => item.condition_group === 'heart_stroke');
  if (row?.payout_type !== 'percent' || Number(row.payout_value) !== 100 ||
    Number(row.interval_value) !== 1 || row.interval_unit !== 'year' ||
    Number(row.max_claims) !== 3) return null;
  return { payoutPercent: 100, intervalYears: 1, maxClaims: 3 };
}

export function heartStrokeTimeline({ rules, planId: id, sumAssured, age, claims = 1 }) {
  const evidence = heartStrokeEvidence(rules, id);
  if (!evidence || !positive(sumAssured) || !Number.isInteger(Number(age)) || Number(age) < 0 ||
    !Number.isInteger(Number(claims)) || Number(claims) < 1 || Number(claims) > evidence.maxClaims) return null;
  const events = Array.from({ length: Number(claims) }, (_, index) => ({
    age: Number(age) + index * evidence.intervalYears,
    label: index === 0 ? '首次保障' : '再次符合條件',
    percent: evidence.payoutPercent,
    amount: Number(sumAssured),
    cumulativePercent: (index + 1) * evidence.payoutPercent,
    cumulativeAmount: (index + 1) * Number(sumAssured)
  }));
  return { events, remainingClaims: evidence.maxClaims - events.length, maxClaims: evidence.maxClaims };
}

export function cumulativePayout(events = []) {
  const valid = Array.isArray(events) ? events.filter(event => Number.isFinite(Number(event?.amount))) : [];
  const amount = valid.reduce((total, event) => total + Number(event.amount), 0);
  const percent = valid.reduce((total, event) => total + (Number(event?.percent) || 0), 0);
  return { amount, percent, eventCount: valid.length };
}

export function multiClaimGrandTotal(timelines = {}) {
  const events = ['cancer', 'heart', 'dementia'].flatMap(key => Array.isArray(timelines?.[key]?.events) ? timelines[key].events : []);
  return cumulativePayout(events);
}

export function multiClaimGrandTotalFromSimulation(timelines = {}, simulation = {}) {
  return multiClaimGrandTotal({
    cancer: simulation.cancerStarted ? timelines.cancer : null,
    heart: simulation.heartStarted ? timelines.heart : null,
    dementia: simulation.dementiaStarted ? timelines.dementia : null
  });
}

export function combinedPlanPayout(results = [], claimType = 'major') {
  const entries = Array.isArray(results) ? results : [];
  const valid = entries.filter(Boolean);
  const pending = valid.some(entry => entry.outcome?.status !== 'VERIFIED');
  const amounts = valid.map(entry => Number(entry.outcome?.amount));
  const percents = valid.map(entry => Number(entry.outcome?.percent));
  const baseAmounts = valid.map(entry => Number(entry.baseAmount ?? entry.summary?.baseAmount));
  const remaining = valid.map(entry => entry.remaining);
  const remainingPending = claimType === 'early' && remaining.some(entry => entry?.status !== 'VERIFIED');
  if (!valid.length || pending || remainingPending || amounts.some(amount => !Number.isFinite(amount)) || percents.some(percent => !Number.isFinite(percent)) || baseAmounts.some(amount => !Number.isFinite(amount)) || baseAmounts.reduce((total, amount) => total + amount, 0) <= 0) {
    return { status: 'VERIFY_REQUIRED', claimType, amount: null, percent: null, remainingAmount: null, remainingPercent: null };
  }
  const result = {
    status: 'VERIFIED',
    claimType,
    amount: amounts.reduce((total, amount) => total + amount, 0),
    percent: null,
    remainingAmount: null,
    remainingPercent: null,
    includesEnhancement: valid.some(entry => entry.outcome?.includesEnhancement)
  };
  const baseTotal = baseAmounts.reduce((total, amount) => total + amount, 0);
  result.percent = result.amount / baseTotal * 100;
  if (claimType === 'early') {
    result.remainingAmount = remaining.reduce((total, entry) => total + Number(entry.amount), 0);
    result.remainingPercent = result.remainingAmount / baseTotal * 100;
  }
  return result;
}

export function isNewMultiClaimEntry(previousRoute, nextRoute) {
  return nextRoute === 'claims' && previousRoute !== 'claims';
}

export function emptyMultiClaimSimulation() {
  return { cancerStarted: false, heartStarted: false, dementiaStarted: false };
}

function premiumAgeRow(matrix, age) {
  return matrix.find(row => Array.isArray(row) && row[0] !== '' && row[0] !== null && row[0] !== undefined && Number.isInteger(Number(row[0])) && Number(row[0]) === Number(age));
}

function premiumColumn(planId, paymentTerm, smokerStatus) {
  if (planId === 'OYS2') {
    const termColumns = { 10: [1, 2], 18: [3, 4], 25: [5, 6] };
    const columns = termColumns[Number(paymentTerm)];
    return columns?.[smokerStatus === 'smoker' ? 1 : 0];
  }
  return [1, 2][smokerStatus === 'smoker' ? 1 : 0];
}

export function premiumEvidence(premium, plan, gender, age, smokerStatus, paymentTerm, sumAssured) {
  const id = String(planId(plan) || '').toUpperCase();
  if (!['SCE', 'OYS2'].includes(id) || !['M', 'F'].includes(gender) || !['smoker', 'non-smoker'].includes(smokerStatus) || age === null || age === undefined || age === '') return { status: 'VERIFY_REQUIRED', reason: '方案或投保資料未提供' };
  const key = `${id}_${gender === 'F' ? 'FEMALE' : 'MALE'}`;
  const matrix = premium?.[key]?.values;
  if (!Array.isArray(matrix) || matrix.length === 0) return { status: 'VERIFY_REQUIRED', reason: '此產品及性別的官方保費表未提供' };
  if (!premiumMatrixHasExpectedHeaders(key, matrix)) return { status: 'VERIFY_REQUIRED', reason: '官方保費表的產品、性別或欄位不相符' };
  if (!Number.isInteger(Number(age)) || Number(age) < 0) return { status: 'VERIFY_REQUIRED', reason: '投保年齡未提供或無效' };
  const row = premiumAgeRow(matrix, age);
  const column = premiumColumn(id, paymentTerm, smokerStatus);
  const rate = column === undefined ? null : Number(row?.[column]);
  const basis = Number(plan?.rate_basis);
  if (column === undefined) return { status: 'VERIFY_REQUIRED', reason: '此產品的供款期未提供或不適用', source: premium[key]?.sheetName };
  if (!row) return { status: 'VERIFY_REQUIRED', reason: '保費表沒有此投保年齡', source: premium[key]?.sheetName };
  if (!positive(rate)) return { status: 'VERIFY_REQUIRED', reason: '此年齡、吸煙狀態及供款期沒有可用費率', source: premium[key]?.sheetName };
  if (basis !== 7800) return { status: 'VERIFY_REQUIRED', reason: '官方費率基準未確認', source: premium[key]?.sheetName };
  if (!positive(sumAssured)) return { status: 'VERIFY_REQUIRED', reason: '請先輸入有效基本保額', source: premium[key]?.sheetName, rawRate: rate, rateBasis: basis };
  return {
    status: 'AVAILABLE',
    source: premium[key].sheetName,
    rawRate: rate,
    rateBasis: basis,
    sumAssured: Number(sumAssured),
    annualPremium: Number(sumAssured) / basis * rate,
    reason: '按已配置官方保費表及方案保額基準計算；未填補缺失費率。'
  };
}

export function paymentEndAge(startAge, term) {
  return Number.isInteger(Number(startAge)) && Number(startAge) >= 0 && [10, 18, 25].includes(Number(term))
    ? Number(startAge) + Number(term) : null;
}
