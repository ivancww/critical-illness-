export class ClaimRuleError extends Error {
  constructor(message, code = 'CLAIM_RULE_ERROR') {
    super(message);
    this.name = 'ClaimRuleError';
    this.code = code;
  }
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function assertPositiveSumAssured(sumAssured) {
  if (!(number(sumAssured) > 0)) throw new ClaimRuleError('請先輸入有效保額。', 'INVALID_SUM_ASSURED');
}

export function calculateAdvanceClaim({ sumAssured, advancePercent = 20, previousAdvance = false }) {
  assertPositiveSumAssured(sumAssured);
  const base = number(sumAssured);
  const advance = base * number(advancePercent) / 100;
  return {
    payout: advance,
    remainingPercent: previousAdvance ? 100 - number(advancePercent) * 2 : 100 - number(advancePercent),
    formula: `Basic Sum Assured × ${number(advancePercent)}%`
  };
}

export function calculateMajorClaim({ sumAssured, remainingPercent = 100, enhancementPercent = 0 }) {
  assertPositiveSumAssured(sumAssured);
  const base = number(sumAssured);
  const basePayout = base * number(remainingPercent) / 100;
  const enhancement = base * number(enhancementPercent) / 100;
  return { payout: basePayout + enhancement, basePayout, enhancement, remainingPercent, enhancementPercent };
}

export function firstTenYearEnhancement() {
  throw new ClaimRuleError(
    '首10年升級保障的資格及邊界尚待官方核實。',
    'FIRST_TEN_YEAR_ENHANCEMENT_VERIFY_REQUIRED'
  );
}

export function createCancerState(sumAssured, rules = {}) {
  assertPositiveSumAssured(sumAssured);
  const poolPercent = number(rules.shared_pool_percent ?? 500);
  return {
    sumAssured: number(sumAssured),
    initialClaimPaid: false,
    sharedPoolId: rules.shared_pool_id ?? 'CANCER_CONTINUING_POOL',
    sharedPoolPercent: poolPercent,
    remainingPoolPercent: poolPercent,
    activeOption: null,
    optionBActivated: false,
    optionAClaims: 0,
    optionBMonths: 0,
    lastClaimAt: null
  };
}

export function payInitialCancerClaim(state) {
  if (state.initialClaimPaid) throw new ClaimRuleError('初次癌症保障已使用。', 'INITIAL_CANCER_ALREADY_PAID');
  return { ...state, initialClaimPaid: true, payout: state.sumAssured, payoutPercent: 100 };
}

function ensureContinuingClaim(state) {
  if (!state.initialClaimPaid) throw new ClaimRuleError('必須先記錄初次癌症保障。', 'INITIAL_CANCER_REQUIRED');
  if (state.remainingPoolPercent <= 0) throw new ClaimRuleError('癌症延續保障額度已用完。', 'CANCER_POOL_EXHAUSTED');
}

export function payCancerOptionA(state, { intervalSatisfied = true } = {}) {
  ensureContinuingClaim(state);
  if (state.optionBActivated) throw new ClaimRuleError('啟用癌症選項B後，不能轉回選項A。', 'OPTION_A_LOCKED');
  if (!intervalSatisfied) throw new ClaimRuleError('尚未符合癌症選項A的等待間隔。', 'INTERVAL_NOT_SATISFIED');
  const consumption = Math.min(100, state.remainingPoolPercent);
  if (consumption < 100) throw new ClaimRuleError('剩餘癌症延續保障不足以支付選項A。', 'INSUFFICIENT_POOL');
  return {
    ...state,
    activeOption: 'A',
    optionAClaims: state.optionAClaims + 1,
    remainingPoolPercent: state.remainingPoolPercent - consumption,
    lastClaimAt: 'option-a',
    payout: state.sumAssured,
    payoutPercent: 100,
    consumedPercent: consumption
  };
}

export function payCancerOptionBMonth(state, { intervalSatisfied = true } = {}) {
  ensureContinuingClaim(state);
  if (!intervalSatisfied) throw new ClaimRuleError('尚未符合癌症選項B的等待間隔。', 'INTERVAL_NOT_SATISFIED');
  const consumption = 5;
  if (state.remainingPoolPercent < consumption) throw new ClaimRuleError('癌症延續保障額度已不足以支付下一個月。', 'INSUFFICIENT_POOL');
  return {
    ...state,
    activeOption: 'B',
    optionBActivated: true,
    optionBMonths: state.optionBMonths + 1,
    remainingPoolPercent: state.remainingPoolPercent - consumption,
    lastClaimAt: 'option-b',
    payout: state.sumAssured * 0.05,
    payoutPercent: 5,
    consumedPercent: consumption
  };
}

export function remainingCancerOptionBMonths(state) {
  return Math.floor(state.remainingPoolPercent / 5);
}

export function calculateDementiaParkinsonClaim({ sumAssured, initial = false }) {
  assertPositiveSumAssured(sumAssured);
  return { payout: number(sumAssured) * (initial ? 1 : 0.06), payoutPercent: initial ? 100 : 6, duration: 'lifetime' };
}
