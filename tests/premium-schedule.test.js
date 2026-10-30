import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePremiumSchedule, renderPremiumSchedule } from '../src/domain/premium-engine.js';
import { premiumEvidence } from '../src/domain/frontstage-experience.js';
import { healthProgramEffect } from '../src/domain/plan-experience.js';
import { normalizePremiumData } from '../src/data/data-api.js';
// Synthetic fixtures, not production insurance quotations.
const makeSce = (g, values) => [[`Simple Care Essence - ${g} (per hk$7800)`], ['Age','Non-Smoker','Smoker'], ...values];
const makeOys = (g, row) => [[`OYS2 Premium Rate Table (Per hk$7800) - ${g}`], ['Age','10-Year Pay','','18-Year Pay','','25-Year Pay',''], ['','Non-Smoker','Smoker','Non-Smoker','Smoker','Non-Smoker','Smoker'], row];
const premium = normalizePremiumData({ SCE_MALE:makeSce('Male',[[40,100,200],[41,120,220],[42,140,'']]), SCE_FEMALE:makeSce('Female',[[40,90,190],[41,110,210],[42,130,230]]), OYS2_MALE:makeOys('Male',[40,300,400,200,300,100,200]), OYS2_FEMALE:makeOys('Female',[40,310,410,210,310,110,210]) });
const params = { issueAge:40, horizon:3, term:10, vitality:false, premium, gender:'M', smoker:'non-smoker', plans:[{plan_id:'SCE',rate_basis:7800},{plan_id:'OYS2',rate_basis:7800}], sums:{SCE:7800,OYS2:7800}, healthProgram:[], lookup:premiumEvidence, healthEffect:healthProgramEffect };
test('SCE renewals use attained-age rows and accumulate independently', () => {
  const s = calculatePremiumSchedule(params); assert.deepEqual(s.rows.map(r=>r.SCE.value),[100,120,140]); assert.deepEqual(s.rows.map(r=>r.SCE.cumulative),[100,220,360]); assert.equal(s.totals.SCE,360);
  assert.deepEqual(s.rows.map(r=>r.OYS2.value),[300,300,300]); assert.equal(s.totals.OYS2,900);
  assert.match(renderPremiumSchedule(s),/按目前官方費率推算/);
});
test('all three OYS2 terms project the source rate only during the chosen payment period', () => {
  for (const [term,rate] of [[10,300],[18,200],[25,100]]) { const s=calculatePremiumSchedule({...params,term,horizon:term+2}); assert.equal(s.rows[term-1].OYS2.value,rate); assert.equal(s.rows[term].OYS2.value,0); assert.equal(s.rows[term].OYS2.reason,'已供滿'); assert.equal(s.totals.OYS2,rate*term); }
});
test('gender, smoking, unavailable renewal and Vitality duration fail closed', () => {
  let s=calculatePremiumSchedule({...params,gender:'F',smoker:'smoker'}); assert.deepEqual(s.rows.map(r=>r.SCE.value),[190,210,230]);
  s=calculatePremiumSchedule({...params,smoker:'smoker'}); assert.equal(s.rows[2].SCE.value,null); assert.equal(s.totals.SCE,null); assert.match(renderPremiumSchedule(s),/沒有可用費率/);
  s=calculatePremiumSchedule({...params,vitality:true,healthProgram:[{plan_id:'SCE',effect_type:'premium_multiplier',effect_value:0.9},{plan_id:'OYS2',effect_type:'coverage_bonus',effect_value:0.1}]}); assert.equal(s.rows[0].SCE.value,90); assert.equal(s.rows[1].SCE.value,120); assert.equal(s.totals.SCE,350); assert.match(s.rows[1].SCE.reason,/未計未確認的續年折扣/);
  assert.equal(calculatePremiumSchedule({...params,issueAge:null}).rows.length,0);
});

test('source amounts scale with sum assured and missing OYS2 rate never becomes zero', () => {
  const scaled=calculatePremiumSchedule({...params,sums:{SCE:15600,OYS2:15600}});
  assert.equal(scaled.rows[0].SCE.value,200); assert.equal(scaled.rows[1].SCE.value,240); assert.equal(scaled.totals.OYS2,1800);
  const invalid=calculatePremiumSchedule({...params,term:18,premium:{...premium,OYS2_MALE:{...premium.OYS2_MALE,values:premium.OYS2_MALE.values.map((row,i)=>i===3?[40,300,400,'',300,100,200]:row)}}});
  assert.equal(invalid.rows[0].OYS2.value,null); assert.equal(invalid.totals.OYS2,null); assert.match(invalid.rows[1].OYS2.reason,/沒有可用費率/);
});

test('major diagnosis timing is pending, early scenario and paid-up remain distinct', () => {
  const major=calculatePremiumSchedule({...params,horizon:12,diagnosisAge:42,claimType:'major'});
  assert.equal(major.rows[1].OYS2.cumulative,600); assert.equal(major.rows[2].OYS2.value,null); assert.equal(major.totals.OYS2,null);
  assert.match(major.rows[2].OYS2.reason,/豁免資格及生效時間未確認/);
  assert.equal(major.rows[10].OYS2.reason,'已供滿');
  const early=calculatePremiumSchedule({...params,horizon:10,diagnosisAge:42,claimType:'early'}); assert.equal(early.totals.OYS2,3000);
  const after=calculatePremiumSchedule({...params,horizon:12,diagnosisAge:52,claimType:'major'}); assert.equal(after.totals.OYS2,3000); assert.equal(after.rows[10].OYS2.reason,'已供滿');
});
test('monthly mode and five-year summaries use actual annual rows and correct subtotals', () => {
  const s=calculatePremiumSchedule({...params,horizon:25,paymentMode:'monthly'});
  assert.ok(Math.abs(s.rows[0].OYS2.value-318)<1e-9);
  const html=renderPremiumSchedule(s); assert.match(html,/<td>21–25<\/td>/); assert.match(html,/區間小計/); assert.match(html,/HK\$0（已供滿）/);
});

test('post-20 summary subtotal sums each actual age rate rather than assuming a flat band', () => {
  const source = { ...premium, SCE_MALE: { ...premium.SCE_MALE, values: [premium.SCE_MALE.values[0], premium.SCE_MALE.values[1], ...Array.from({length:25},(_,i)=>[40+i,100+i,200+i])] } };
  const s=calculatePremiumSchedule({...params,premium:source,horizon:25});
  assert.equal(s.rows[20].attainedAge,60); assert.equal(s.rows[24].attainedAge,64);
  assert.equal(s.rows.slice(20,25).reduce((n,r)=>n+r.SCE.value,0),610);
  const html=renderPremiumSchedule(s); assert.match(html,/21–25/); assert.match(html,/區間小計：HK\$610\.00/);
});
