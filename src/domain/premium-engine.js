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
