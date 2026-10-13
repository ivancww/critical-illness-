import { resolveBenefits } from './product-engine.js?v=0.4.1';

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

export function planProtectionSummary({ plan, benefits = [], sumAssured = 0, age } = {}) {
  const id = planId(plan);
  const base = number(sumAssured);
  const major = resolveBenefits(benefits, id).find(row => row.benefit_type === 'major_ci' && active(row) && number(row.payout_percent) === 100);
  const early = resolveBenefits(benefits, id).find(row => row.benefit_type === 'early_ci' && active(row));
  const enhancement = ageDependentEnhancement(benefits, id, age);
  const waiverText = premiumWaiverText(benefits, id);
  const extraPercent = enhancement.status === 'VERIFIED' ? enhancement.percent : 0;
  const extraAmount = base !== null && enhancement.status === 'VERIFIED' ? base * extraPercent / 100 : null;
  const earlyPercent = number(early?.payout_percent);
  const earlyAmount = base !== null && earlyPercent !== null ? base * earlyPercent / 100 : null;
  const total = base !== null && major ? base + (extraAmount || 0) : null;

  return {
    planId: id,
    baseAmount: base,
    basePercent: major ? number(major.payout_percent) : null,
    extra: { status: enhancement.status, percent: enhancement.percent, amount: extraAmount, row: enhancement.row, reason: enhancement.reason },
    totalApplicable: total,
    early: { status: early && earlyPercent !== null ? 'VERIFIED' : 'VERIFY_REQUIRED', percent: earlyPercent, amount: earlyAmount, row: early },
    major: { status: major ? 'VERIFIED' : 'VERIFY_REQUIRED', row: major },
    premiumWaiver: { status: waiverText ? 'VERIFIED' : 'NOT_VERIFIED', text: waiverText }
  };
}

export function verifiedPlanBenefits(benefits = [], id) {
  return resolveBenefits(benefits, id).filter(active).filter(row => [
    'major_ci', 'early_ci', 'premium_waiver', 'continuing_protection', 'first_10_year_bonus'
  ].includes(row.benefit_type));
}
