export class PremiumMappingError extends Error {
  constructor(message, code = 'PREMIUM_MAPPING_VERIFY_REQUIRED') {
    super(message);
    this.name = 'PremiumMappingError';
    this.code = code;
  }
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function createPremiumEngine({ mappings = {} } = {}) {
  function mappingFor(planKey) {
    const mapping = mappings[planKey];
    if (!mapping || mapping.verified !== true) {
      throw new PremiumMappingError(`Premium mapping for ${planKey} is not verified.`);
    }
    return mapping;
  }

  function calculate({ planKey, sumAssured, age, gender, smokerStatus, paymentTerm, vitality = false }) {
    if (!(Number(sumAssured) > 0)) throw new PremiumMappingError('Invalid sum assured.', 'INVALID_SUM_ASSURED');
    const mapping = mappingFor(planKey);
    const coordinate = mapping.resolve({ age, gender, smokerStatus, paymentTerm });
    if (!coordinate || !finite(coordinate.rate)) {
      throw new PremiumMappingError(`No verified premium matrix coordinate for ${planKey}.`, 'RATE_NOT_AVAILABLE');
    }
    const rawRate = coordinate.rate;
    const scaled = Number(sumAssured) / Number(mapping.rateBasis);
    if (!finite(scaled)) throw new PremiumMappingError('Invalid premium rate basis.', 'INVALID_RATE_BASIS');
    const annualBeforeProgram = scaled * rawRate;
    const annual = mapping.applyProgram
      ? mapping.applyProgram({ annualBeforeProgram, vitality })
      : annualBeforeProgram;
    return {
      planKey, sumAssured, age, gender, smokerStatus, paymentTerm,
      rawRate, rateBasis: mapping.rateBasis, source: coordinate.source,
      annualBeforeProgram, annual, monthly: null,
      status: 'VERIFY_ROUNDING_AND_MONTHLY_ORDER'
    };
  }

  return Object.freeze({ calculate });
}

export function monthlyFromAnnual(annual, factor) {
  if (!finite(Number(annual)) || !finite(Number(factor))) {
    throw new PremiumMappingError('Monthly conversion is not verified.', 'MONTHLY_CONVERSION_VERIFY_REQUIRED');
  }
  return Number(annual) * Number(factor) / 12;
}

// The product owner confirmed annual × 1.06 / 12; final illustration rounding remains to be checked.
export function premiumQuote(evidence, health, participating = false) {
  if (evidence?.status !== 'AVAILABLE' || !(Number(evidence.annualPremium) > 0)) return { status: 'VERIFY_REQUIRED', reason: evidence?.reason || '官方年繳費率未提供' };
  if (participating && health?.status !== 'VERIFIED') return { status: 'VERIFY_REQUIRED', reason: '健康程式資料未確認' };
  const multiplier = participating && health?.effectType === 'premium_multiplier' ? Number(health.premiumMultiplier) : 1;
  if (!Number.isFinite(multiplier) || multiplier <= 0) return { status: 'VERIFY_REQUIRED', reason: '健康程式折扣未確認' };
  const annual = evidence.annualPremium * multiplier;
  return { status: 'AVAILABLE', annual, monthly: monthlyFromAnnual(annual, 1.06), multiplier };
}

export function renderPremiumFigures(quote) {
  if (quote?.status !== 'AVAILABLE' || !(quote.annual > 0) || !(quote.monthly > 0)) {
    const reason = String(quote?.reason || '年繳保費未確認').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return `<div class="premium-figure"><small>每年保費</small><strong>VERIFY REQUIRED</strong></div><p>每月保費：VERIFY REQUIRED（${reason}）</p>`;
  }
  const fmt = n => Number(n).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `<div class="premium-figure"><small>每年保費</small><strong>HK$${fmt(quote.annual)}</strong></div><p>每月保費：約 HK$${fmt(quote.monthly)}</p>`;
}
