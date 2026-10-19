import { resolveBenefits } from './product-engine.js?v=0.6.7';

const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
const active = row => row?.enabled !== false && row?.active !== false;
const planId = plan => plan?.plan_id ?? plan?.plan_key;

function ageRange(row) {
  const explicitMin = number(row?.age_min ?? row?.min_age);
  const explicitMax = number(row?.age_max ?? row?.max_age);
  if (explicitMin !== null || explicitMax !== null) return { min: explicitMin, max: explicitMax };

  const source = `${row?.benefit_name ?? ''} ${row?.display_text ?? ''}`;
  const max = source.match(/(\d+)\s*歲(?:或以下|或之前)/);
  const min = source.match(/(\d+)\s*歲(?:或以上|或之後)/);
  return { min: min ? Number(min[1]) : null, max: max ? Number(max[1]) : null };
}

function appliesToAge(row, age) {
  const range = ageRange(row);
  return (range.min === null || age >= range.min) && (range.max === null || age <= range.max);
}

export function ageDependentEnhancement(benefits = [], id, age) {
  const rows = resolveBenefits(benefits, id).filter(row => row.benefit_type === 'first_10_year_bonus' && active(row));
  if (!rows.length) return { status: 'NOT_APPLICABLE', percent: 0, amount: 0, row: null };
  if (age === null || age === undefined || !Number.isInteger(Number(age)) || Number(age) < 0) return { status: 'VERIFY_REQUIRED', reason: '請先輸入投保年齡。', percent: null, amount: null, row: null };
  const row = rows.find(candidate => appliesToAge(candidate, Number(age)));
  const percent = number(row?.payout_percent);
  if (!row || percent === null || percent < 0) return { status: 'VERIFY_REQUIRED', reason: '官方額外保障的年齡適用範圍未能核實。', percent: null, amount: null, row: null };
  return { status: 'VERIFIED', percent, amount: null, row };
}

export function diagnosisTiming(issueAge, diagnosisAge, years = 10) {
  const issue = Number(issueAge);
  const diagnosis = Number(diagnosisAge);
  if (!Number.isInteger(issue) || issue < 0 || !Number.isInteger(diagnosis) || diagnosis < issue) {
    return { status: 'VERIFY_REQUIRED', reason: '請輸入不早於投保年齡的確診歲數。', elapsedYears: null };
  }
  const elapsedYears = diagnosis - issue;
  if (!Number.isFinite(Number(years)) || Number(years) <= 0) {
    return { status: 'VERIFY_REQUIRED', reason: '首10年保障期的官方邊界未能核實。', elapsedYears };
  }
  return {
    status: elapsedYears < Number(years) ? 'APPLICABLE' : elapsedYears > Number(years) ? 'NOT_APPLICABLE' : 'BOUNDARY_REQUIRES_POLICY_ANNIVERSARY',
    elapsedYears,
    reason: elapsedYears < Number(years) ? '仍在首10年保障期內。' : elapsedYears > Number(years) ? '已超過首10年保障期。' : '接近首10年保障期邊界，需按保單週年確認。'
  };
}

export function premiumWaiverText(benefits = [], id) {
  const row = resolveBenefits(benefits, id).find(candidate => candidate.benefit_type === 'premium_waiver' && active(candidate));
  const text = String(row?.display_text ?? '').trim();
  return text || null;
}

export function claimOutcome(summary, claimType = 'major') {
  if (claimType === 'early') {
    return {
      claimType,
      status: summary?.early?.status || 'VERIFY_REQUIRED',
      amount: summary?.early?.amount ?? null,
      percent: summary?.early?.percent ?? null,
      includesEnhancement: false
    };
  }
  return {
    claimType: 'major',
    status: summary?.major?.status || 'VERIFY_REQUIRED',
    amount: summary?.totalApplicable ?? null,
    percent: summary?.basePercent ?? null,
    includesEnhancement: summary?.extra?.status === 'VERIFIED' && Number(summary.extra.percent) > 0
  };
}

export function supportMonthsForPayout(payout, monthlyNeed) {
  const amount = Number(payout);
  const need = Number(monthlyNeed);
  return Number.isFinite(amount) && amount >= 0 && Number.isFinite(need) && need > 0 ? amount / need : null;
}

// Early illness is presented as an advance from the base major-CI protection.
// This derived presentation amount deliberately excludes any separate OYS2
// enhancement; that enhancement remains governed by its own verified timing.
export function remainingMajorProtectionAfterEarlyClaim(summary = {}) {
  const baseAmount = number(summary.baseAmount);
  const majorPercent = number(summary.basePercent);
  const earlyPercent = number(summary.early?.percent);
  if (baseAmount === null || majorPercent === null || earlyPercent === null || earlyPercent < 0 || majorPercent < earlyPercent) {
    return { status: 'VERIFY_REQUIRED', amount: null, percent: null };
  }
  const percent = majorPercent - earlyPercent;
  return { status: 'VERIFIED', amount: baseAmount * percent / 100, percent };
}

export function planProtectionSummary({ plan, benefits = [], sumAssured = 0, age, diagnosisAge } = {}) {
  const id = planId(plan);
  const base = number(sumAssured);
  const major = resolveBenefits(benefits, id).find(row => row.benefit_type === 'major_ci' && active(row) && number(row.payout_percent) === 100);
  const early = resolveBenefits(benefits, id).find(row => row.benefit_type === 'early_ci' && active(row));
  const enhancement = ageDependentEnhancement(benefits, id, age);
  const firstTenRows = resolveBenefits(benefits, id).filter(row => row.benefit_type === 'first_10_year_bonus' && active(row));
  const timing = !firstTenRows.length
    ? { status: 'NOT_APPLICABLE', visible: false, elapsedYears: null, reason: '此方案沒有配置首10年升級保障。' }
    : diagnosisAge === undefined || diagnosisAge === null || diagnosisAge === ''
    ? { status: 'NOT_PROVIDED', elapsedYears: null, reason: '輸入確診歲數後顯示首10年保障是否生效。' }
    : diagnosisTiming(age, diagnosisAge);
  const bandResolved = !firstTenRows.length || enhancement.status === 'VERIFIED';
  const timingResolved = !firstTenRows.length || ['APPLICABLE', 'NOT_APPLICABLE'].includes(timing.status);
  const effectiveEnhancement = !firstTenRows.length
    ? { ...enhancement, status: 'NOT_APPLICABLE', amount: 0, reason: timing.reason }
    : !bandResolved || !timingResolved
      ? { ...enhancement, status: 'VERIFY_REQUIRED', amount: null, reason: timing.reason || enhancement.reason }
      : timing.status === 'NOT_APPLICABLE'
        ? { ...enhancement, status: 'NOT_APPLICABLE', amount: 0, reason: timing.reason }
        : enhancement;
  const waiverText = premiumWaiverText(benefits, id);
  const extraPercent = enhancement.percent;
  const extraAmount = base !== null && effectiveEnhancement.status === 'VERIFIED'
    ? base * extraPercent / 100
    : base !== null && effectiveEnhancement.status === 'NOT_APPLICABLE' ? 0 : null;
  const earlyPercent = number(early?.payout_percent);
  const earlyAmount = base !== null && earlyPercent !== null ? base * earlyPercent / 100 : null;
  const majorVerified = Boolean(base !== null && major && timingResolved && bandResolved);
  const total = majorVerified ? base + (extraAmount || 0) : null;

  return {
    planId: id,
    baseAmount: base,
    basePercent: major ? number(major.payout_percent) : null,
    extra: { status: effectiveEnhancement.status, percent: extraPercent, amount: extraAmount, row: enhancement.row, reason: effectiveEnhancement.reason, bandStatus: enhancement.status },
    diagnosis: timing,
    totalApplicable: total,
    early: { status: early && earlyPercent !== null ? 'VERIFIED' : 'VERIFY_REQUIRED', percent: earlyPercent, amount: earlyAmount, row: early },
    major: { status: majorVerified ? 'VERIFIED' : 'VERIFY_REQUIRED', row: major },
    premiumWaiver: { status: waiverText ? 'VERIFIED' : 'NOT_VERIFIED', text: waiverText }
  };
}

export function verifiedPlanBenefits(benefits = [], id) {
  return resolveBenefits(benefits, id).filter(active).filter(row => [
    'major_ci', 'early_ci', 'premium_waiver', 'continuing_protection', 'first_10_year_bonus'
  ].includes(row.benefit_type));
}
