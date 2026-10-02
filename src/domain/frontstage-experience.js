import { calculateDementiaParkinsonClaim, createCancerState, payCancerOptionA, payCancerOptionBMonth, payInitialCancerClaim, remainingCancerOptionBMonths } from './claim-engine.js';
import { translateProtectionToMonths } from './flow-state.js';
import { resolveBenefits, resolveClaimRules } from './product-engine.js';

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

export function premiumEvidence(premium, plan, gender, age, smokerStatus, paymentTerm) {
  const id = String(planId(plan) || '').toUpperCase();
  const key = `${id}_${gender === 'F' ? 'FEMALE' : 'MALE'}`;
  const matrix = premium?.[key]?.values;
  if (!Array.isArray(matrix) || !Number.isInteger(Number(age))) return { status: 'VERIFY_REQUIRED', reason: '官方保費資料或年齡未提供' };
  const header = matrix[id === 'OYS2' ? 3 : 2] || [];
  const row = matrix.find((entry, index) => index >= (id === 'OYS2' ? 4 : 3) && Number(entry[0]) === Number(age));
  const terms = id === 'OYS2' ? { 10: [1, 2], 18: [3, 4], 25: [5, 6] } : { annual: [1, 2] };
  const columns = terms[id === 'OYS2' ? paymentTerm : 'annual'];
  const column = columns?.[smokerStatus === 'smoker' ? 1 : 0];
  if (column === undefined || !row || !header[column] || !positive(row[column])) return { status: 'VERIFY_REQUIRED', reason: '此年齡、吸煙狀態或供款期沒有可用官方費率' };
  return { status: 'VERIFY_REQUIRED', reason: '費率座標可讀；保費計算、四捨五入及月繳次序尚待核實', source: premium[key].sheetName };
}

export function paymentEndAge(startAge, term) {
  return Number.isInteger(Number(startAge)) && Number(startAge) >= 0 && [10, 18, 25].includes(Number(term))
    ? Number(startAge) + Number(term) : null;
}
