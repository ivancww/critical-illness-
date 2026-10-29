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

// Schedules use a chosen display horizon; the horizon does not assert coverage termination.
export function calculatePremiumSchedule({ issueAge, horizon, term, vitality, premium, plans, sums, healthProgram, gender, smoker, lookup, healthEffect, vitalityDurationYears = null }) {
  const age = Number(issueAge), years = Number(horizon), payTerm = Number(term);
  if (issueAge === null || issueAge === undefined || issueAge === '' || !Number.isInteger(age) || age < 0 || !Number.isInteger(years) || years < 1 || years > 100) return { rows: [], reason: '請輸入投保年齡及顯示年數（1至100年）。', totals: {} };
  const rows = [], totals = { SCE: 0, OYS2: 0 }, complete = { SCE: true, OYS2: true };
  for (let year = 1; year <= years; year++) {
    const attainedAge = age + year - 1, item = { year, attainedAge };
    for (const id of ['SCE', 'OYS2']) {
      const plan = plans.find(p => (p.plan_id ?? p.plan_key) === id);
      let value = null, reason = '';
      if (!plan) reason = '方案資料未提供';
      else if (id === 'OYS2' && ![10,18,25].includes(payTerm)) reason = '供款期未確認';
      else if (id === 'OYS2' && year > payTerm) { item[id] = { value: null, cumulative: complete[id] ? totals[id] : null, reason: '所選供款期後無預定保費', afterTerm: true }; continue; }
      else {
        const quoteAge = id === 'SCE' ? attainedAge : age;
        const evidence = lookup(premium, plan, gender, quoteAge, smoker, payTerm, sums?.[id]);
        const health = healthEffect(healthProgram, id, vitality, sums?.[id]);
        const baseQuote = premiumQuote(evidence, health, false);
        if (baseQuote.status !== 'AVAILABLE') reason = baseQuote.reason;
        else if (vitality && id === 'SCE' && (year === 1 || (Number.isInteger(vitalityDurationYears) && year <= vitalityDurationYears))) {
          const adjusted = premiumQuote(evidence, health, true);
          if (adjusted.status === 'AVAILABLE') { value = adjusted.annual; reason = '已按現時適用折扣計算'; }
          else { value = baseQuote.annual; reason = '基礎保費，折扣待確認'; }
        } else {
          value = baseQuote.annual;
          if (vitality && id === 'SCE') reason = '基礎保費，未計未確認的續年折扣';
          else if (vitality && health.status !== 'VERIFIED') reason = '基礎保費，健康程式待確認';
        }
      }
      if (value === null) complete[id] = false; else totals[id] += value;
      item[id] = { value, reason, cumulative: complete[id] ? totals[id] : null };
    }
    rows.push(item);
  }
  return { rows, totals: Object.fromEntries(['SCE','OYS2'].map(id => [id, complete[id] ? totals[id] : null])) };
}

export function renderPremiumSchedule(schedule) {
  if (!schedule.rows.length) return `<p>${schedule.reason || '請選擇顯示年數。'}</p>`;
  const money = n => n === null ? '未能計算' : `HK$${Number(n).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cell = v => v.value === null ? esc(v.reason || '未能計算') : `${money(v.value)}${v.reason ? `<small class="premium-schedule-note">${esc(v.reason)}</small>` : ''}`;
  const vitalityNote = schedule.rows.some(r => r.SCE.reason?.includes('未確認的續年折扣')) ? '<p>簡護續年使用基礎保費，未計未確認的 Vitality 折扣；總額按表內數字累計。</p>' : '';
  return `<p>按目前官方費率推算，實際續期保費以保單及保險公司當時適用安排為準。顯示年數只用於比較，不代表保障終止時間。</p>${vitalityNote}<div class="premium-schedule-scroll"><table class="premium-schedule"><thead><tr><th>保單年度</th><th>當時年齡</th><th>簡護每年保費</th><th>簡護累積</th><th>愛伴航2每年保費</th><th>愛伴航2累積</th></tr></thead><tbody>${schedule.rows.map(r => `<tr><td>${r.year}</td><td>${r.attainedAge}</td><td>${cell(r.SCE)}</td><td>${money(r.SCE.cumulative)}</td><td>${cell(r.OYS2)}</td><td>${money(r.OYS2.cumulative)}</td></tr>`).join('')}</tbody></table></div><p>所選期間預計總保費：簡護 ${money(schedule.totals.SCE)}；愛伴航2 ${money(schedule.totals.OYS2)}</p>`;
}
