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

export function renderPremiumFigures(quote, mode = 'annual') {
  if (quote?.status !== 'AVAILABLE' || !(quote.annual > 0) || !(quote.monthly > 0)) {
    const reason = String(quote?.reason || '年繳保費未確認').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return `<div class="premium-figure"><small>每年保費</small><strong>VERIFY REQUIRED</strong></div><p>每月保費：VERIFY REQUIRED（${reason}）</p>`;
  }
  const fmt = n => Number(n).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `<div class="premium-figure"><small>${mode === 'monthly' ? '每月保費' : '每年保費'}</small><strong>HK$${fmt(mode === 'monthly' ? quote.monthly : quote.annual)}</strong></div>`;
}

// Schedules use a chosen display horizon; the horizon does not assert coverage termination.
export function calculatePremiumSchedule({ issueAge, horizon, term, vitality, premium, plans, sums, healthProgram, gender, smoker, lookup, healthEffect, vitalityDurationYears = null, diagnosisAge = null, claimType = 'major', paymentMode = 'annual' }) {
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
      else if (id === 'OYS2' && year > payTerm) { item[id] = { value: 0, cumulative: complete[id] ? totals[id] : null, reason: '已供滿', afterTerm: true }; continue; }
      else if (id === 'OYS2' && claimType === 'major' && Number.isInteger(diagnosisAge) && diagnosisAge >= age && attainedAge >= diagnosisAge) {
        const evidence = lookup(premium, plan, gender, age, smoker, payTerm, sums?.[id]);
        const quote = premiumQuote(evidence, null, false);
        if (quote.status === 'AVAILABLE') { item[id] = { value: 0, cumulative: complete[id] ? totals[id] : null, reason: '確診豁免保費', waived: true }; continue; }
        reason = quote.reason;
      }
      else {
        const quoteAge = id === 'SCE' ? age + 5 * Math.floor((year - 1) / 5) : age;
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
      if (value !== null && paymentMode === 'monthly') value = monthlyFromAnnual(value, 1.06) * 12;
      if (value === null) complete[id] = false; else totals[id] += value;
      item[id] = { value, reason, cumulative: complete[id] ? totals[id] : null };
    }
    rows.push(item);
  }
  return { rows, paymentMode, totals: Object.fromEntries(['SCE','OYS2'].map(id => [id, complete[id] ? totals[id] : null])) };
}

export function renderPremiumSchedule(schedule) {
  if (!schedule.rows.length) return `<p>未有可用的費率範圍。</p>`;
  const money = n => n === null ? '未能確認' : `HK$${Number(n).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cell = v => v.value === null ? esc(v.reason || '未能確認') : v.afterTerm ? 'HK$0（已供滿）' : v.waived ? '<span class="premium-waived">HK$0（確診豁免保費）</span>' : `${money(v.value)}${v.reason ? `<small class="premium-schedule-note">${esc(v.reason)}</small>` : ''}`;
  const groups = [];
  for (let i = 0; i < schedule.rows.length;) { const n = i < 20 ? 1 : Math.min(5, schedule.rows.length - i); groups.push(schedule.rows.slice(i, i+n)); i += n; }
  const subtotal = (group, id) => group.every(r => r[id].value !== null) ? group.reduce((a,r) => a+r[id].value,0) : null;
  const detail = (g,id) => g.length === 1 ? cell(g[0][id]) : `每年：${g.map(r=>`${r.attainedAge}歲 ${cell(r[id])}`).join('；')}<br>區間小計：${money(subtotal(g,id))}`;
  const body = groups.map(g => { const first=g[0], last=g.at(-1); return `<tr><td>${first.year === last.year ? first.year : `${first.year}–${last.year}`}</td><td>${first.attainedAge === last.attainedAge ? first.attainedAge : `${first.attainedAge}–${last.attainedAge}`}</td><td>${detail(g,'SCE')}</td><td>${money(last.SCE.cumulative)}</td><td>${detail(g,'OYS2')}</td><td>${money(last.OYS2.cumulative)}</td></tr>`; }).join('');
  return `<h2>每年保費及累積總保費</h2><p>按目前官方費率推算，實際保費以保單及保險公司當時適用安排為準；顯示範圍不代表保障終止年齡。${schedule.paymentMode === 'monthly' ? '表內每年金額為月繳 × 12。' : ''}簡護按每五個保單年度重設來源費率；續年未確認折扣時以基礎保費計算。確診豁免由確診年齡該行開始作情境推算，不代表已確認年內繳費或退款。</p><div class="premium-schedule-scroll"><table class="premium-schedule"><thead><tr><th>保單年度</th><th>當時年齡</th><th>簡護保費／區間小計</th><th>簡護累積</th><th>愛伴航2保費／區間小計</th><th>愛伴航2累積</th></tr></thead><tbody>${body}</tbody></table></div><p>合計總保費（顯示範圍）：簡護 ${money(schedule.totals.SCE)}；愛伴航2 ${money(schedule.totals.OYS2)}</p>`;
}
