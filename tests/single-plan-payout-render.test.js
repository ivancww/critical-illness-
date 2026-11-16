import test from 'node:test';
import assert from 'node:assert/strict';

test('single-plan route simulates verified base payout when enhancement expires or timing is uncertain', async () => {
  const main = { innerHTML: '', focus() {} };
  const handlers = {};
  const dummy = { textContent: '', focus() {}, addEventListener() {}, classList: { toggle() {}, remove() {}, add() {} }, setAttribute() {} };
  const button = { addEventListener(type, fn) { handlers.claim = fn; } };
  const benefits = ['SCE', 'OYS2'].flatMap(id => [{ plan_id: id, benefit_type: 'major_ci', payout_percent: 100 }, { plan_id: id, benefit_type: 'early_ci', payout_percent: 20 }]);
  benefits.push({ plan_id: 'OYS2', benefit_type: 'first_10_year_bonus', payout_percent: 35, age_min: 0, age_max: 120 }, { plan_id: 'OYS2', benefit_type: 'premium_waiver', display_text: '合資格豁免' });
  const cache = { structured: { Plans: [{ plan_id: 'SCE', plan_name: '簡護危疾保', protection_style: 'single' }, { plan_id: 'OYS2', plan_name: '愛伴航2', protection_style: 'continuing' }], Benefits: benefits, Claim_Rules: [], Health_Program: [], Product_Content: [], Settings_Versions: [] }, premium: {} };
  const user = { flow: { monthlyNeed: 30000, desiredMonths: 24, protectionStyle: 'compare' }, frontstage: { age: 40, diagnosisAge: 51, sums: { SCE: 500000, OYS2: 500000 } } };
  globalThis.localStorage = { getItem(k) { return k === 'AVA_CI_OFFICIAL_CACHE_V2' ? JSON.stringify(cache) : k === 'AVA_CI_USER_STATE_V1' ? JSON.stringify(user) : null; }, setItem() {} };
  globalThis.document = { querySelector(s) { return s === '#main-content' ? main : s === '[data-full-claim]' ? button : dummy; }, querySelectorAll() { return []; }, getElementById() { return dummy; }, body: dummy, addEventListener() {}, visibilityState: 'visible' };
  globalThis.window = globalThis; globalThis.addEventListener = (name, cb) => { handlers[name] = cb; }; globalThis.location = { search: '', hash: '#/plans/OYS2/claim', href: 'https://example.test/#/plans/OYS2/claim' }; globalThis.history = { replaceState() {} }; Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true }); globalThis.fetch = () => new Promise(() => {});
  const app = await import('../src/app.js?single-plan-payout-render');
  const assertReady = () => { assert.match(main.innerHTML, /data-full-claim="OYS2"\s*>/); assert.match(main.innerHTML, /HK\$500,000/); assert.doesNotMatch(main.innerHTML, /HK\$675,000/); };
  assertReady(); assert.match(main.innerHTML, /額外保障資格待確認/);
  handlers.claim(); assert.match(main.innerHTML, /data-claim-state="continuing"/); assert.match(main.innerHTML, /HK\$500,000/); assert.match(main.innerHTML, /額外保障資格待確認/);
  app.state.user.frontstage.claimDemo = {}; app.state.user.frontstage.diagnosisAge = 50; handlers.hashchange();
  assertReady(); assert.match(main.innerHTML, /此金額只包括已核實的基本保障；額外保障資格待確認，並未計入/);
  handlers.claim(); assert.match(main.innerHTML, /data-claim-state="continuing"/); assert.match(main.innerHTML, /HK\$500,000/); assert.match(main.innerHTML, /額外保障資格待確認/); assert.doesNotMatch(main.innerHTML, /HK\$675,000/);
  app.state.user.frontstage.claimDemo = {}; app.state.user.frontstage.diagnosisAge = 45; handlers.hashchange(); assert.match(main.innerHTML, /HK\$500,000/); handlers.claim(); assert.match(main.innerHTML, /HK\$500,000/); assert.match(main.innerHTML, /額外保障/);
});
