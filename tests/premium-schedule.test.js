import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePremiumSchedule, renderPremiumSchedule } from '../src/domain/premium-engine.js';
import { premiumEvidence } from '../src/domain/frontstage-experience.js';
import { healthProgramEffect } from '../src/domain/plan-experience.js';
import { normalizePremiumData } from '../src/data/data-api.js';
// Synthetic fixtures, not production insurance quotations.
const makeSce = (g, values) => [[`Simple Care Essence - ${g} (per hk$7800)`], ['Age','Non-Smoker','Smoker'], ...values];
const makeOys = (g, row) => [[`OYS2 Premium Rate Table (Per hk$7800) - ${g}`], ['Age','10-Year Pay','','18-Year Pay','','25-Year Pay',''], ['','Non-Smoker','Smoker','Non-Smoker','Smoker','Non-Smoker','Smoker'], row];
const premium = normalizePremiumData({ SCE_MALE:makeSce('Male',[[40,100,200],[41,120,220],[42,140,''],[45,150,''],[47,170,270],[50,200,300],[52,220,320]]), SCE_FEMALE:makeSce('Female',[[40,90,190],[41,110,210],[42,130,230],[45,140,240],[47,160,260],[50,190,290],[52,210,310]]), OYS2_MALE:makeOys('Male',[40,300,400,200,300,100,200]), OYS2_FEMALE:makeOys('Female',[40,310,410,210,310,110,210]) });
const params = { issueAge:40, horizon:3, term:10, vitality:false, premium, gender:'M', smoker:'non-smoker', plans:[{plan_id:'SCE',rate_basis:7800},{plan_id:'OYS2',rate_basis:7800}], sums:{SCE:7800,OYS2:7800}, healthProgram:[], lookup:premiumEvidence, healthEffect:healthProgramEffect };
test('SCE renewals use issue-age five-policy-year blocks and accumulate independently', () => {
  const s = calculatePremiumSchedule(params); assert.deepEqual(s.rows.map(r=>r.SCE.value),[100,100,100]); assert.deepEqual(s.rows.map(r=>r.SCE.cumulative),[100,200,300]); assert.equal(s.totals.SCE,300);
  assert.deepEqual(s.rows.map(r=>r.OYS2.value),[300,300,300]); assert.equal(s.totals.OYS2,900);
  assert.match(renderPremiumSchedule(s),/按目前官方費率推算/);
});
test('all three OYS2 terms project the source rate only during the chosen payment period', () => {
  for (const [term,rate] of [[10,300],[18,200],[25,100]]) { const s=calculatePremiumSchedule({...params,term,horizon:term+2}); assert.equal(s.rows[term-1].OYS2.value,rate); assert.equal(s.rows[term].OYS2.value,0); assert.equal(s.rows[term].OYS2.reason,'已供滿'); assert.equal(s.totals.OYS2,rate*term); }
});
test('gender, smoking, unavailable renewal and Vitality duration fail closed', () => {
  let s=calculatePremiumSchedule({...params,gender:'F',smoker:'smoker'}); assert.deepEqual(s.rows.map(r=>r.SCE.value),[190,190,190]);
  s=calculatePremiumSchedule({...params,smoker:'smoker',horizon:6}); assert.equal(s.rows[5].SCE.value,null); assert.equal(s.totals.SCE,null); assert.match(renderPremiumSchedule(s),/沒有可用費率/);
  s=calculatePremiumSchedule({...params,vitality:true,healthProgram:[{plan_id:'SCE',effect_type:'premium_multiplier',effect_value:0.9},{plan_id:'OYS2',effect_type:'coverage_bonus',effect_value:0.1}]}); assert.equal(s.rows[0].SCE.value,90); assert.equal(s.rows[1].SCE.value,100); assert.equal(s.totals.SCE,290); assert.match(s.rows[1].SCE.reason,/未計未確認的續年折扣/);
  assert.equal(calculatePremiumSchedule({...params,issueAge:null}).rows.length,0);
});

test('source amounts scale with sum assured and missing OYS2 rate never becomes zero', () => {
  const scaled=calculatePremiumSchedule({...params,sums:{SCE:15600,OYS2:15600}});
  assert.equal(scaled.rows[0].SCE.value,200); assert.equal(scaled.rows[1].SCE.value,200); assert.equal(scaled.totals.OYS2,1800);
  const invalid=calculatePremiumSchedule({...params,term:18,premium:{...premium,OYS2_MALE:{...premium.OYS2_MALE,values:premium.OYS2_MALE.values.map((row,i)=>i===3?[40,300,400,'',300,100,200]:row)}}});
  assert.equal(invalid.rows[0].OYS2.value,null); assert.equal(invalid.totals.OYS2,null); assert.match(invalid.rows[1].OYS2.reason,/沒有可用費率/);
});

test('major diagnosis projection waives, early scenario and paid-up remain distinct', () => {
  const major=calculatePremiumSchedule({...params,horizon:12,diagnosisAge:42,claimType:'major'});
  assert.equal(major.rows[1].OYS2.cumulative,600); assert.equal(major.rows[2].OYS2.value,0); assert.equal(major.totals.OYS2,600);
  assert.equal(major.rows[2].OYS2.reason,'確診豁免保費');
  assert.equal(major.rows[10].OYS2.reason,'已供滿');
  const early=calculatePremiumSchedule({...params,horizon:10,diagnosisAge:42,claimType:'early'}); assert.equal(early.totals.OYS2,3000);
  const after=calculatePremiumSchedule({...params,horizon:12,diagnosisAge:52,claimType:'major'}); assert.equal(after.totals.OYS2,3000); assert.equal(after.rows[10].OYS2.reason,'已供滿');
});
test('monthly mode and five-year summaries use actual annual rows and correct subtotals', () => {
  const s=calculatePremiumSchedule({...params,horizon:25,paymentMode:'monthly'});
  assert.ok(Math.abs(s.rows[0].OYS2.value-318)<1e-9);
  const html=renderPremiumSchedule(s); assert.match(html,/<td>21–25<\/td>/); assert.match(html,/區間小計/); assert.match(html,/HK\$0（已供滿）/);
});

test('post-20 summary subtotal sums all annual block rates', () => {
  const source = { ...premium, SCE_MALE: { ...premium.SCE_MALE, values: [premium.SCE_MALE.values[0], premium.SCE_MALE.values[1], ...Array.from({length:25},(_,i)=>[40+i,100+i,200+i])] } };
  const s=calculatePremiumSchedule({...params,premium:source,horizon:25});
  assert.equal(s.rows[20].attainedAge,60); assert.equal(s.rows[24].attainedAge,64);
  assert.equal(s.rows.slice(20,25).reduce((n,r)=>n+r.SCE.value,0),600);
  const html=renderPremiumSchedule(s); assert.match(html,/21–25/); assert.match(html,/區間小計：HK\$600\.00/);
});

test('owner-approved SCE repricing is tied to policy years and issue age', () => {
  const a=calculatePremiumSchedule({...params,horizon:10});
  assert.deepEqual(a.rows.map(r=>r.SCE.value),[100,100,100,100,100,150,150,150,150,150]);
  const other = {...premium, OYS2_MALE: {...premium.OYS2_MALE, values: [...premium.OYS2_MALE.values,[42,300,400,200,300,100,200]]}};
  const b=calculatePremiumSchedule({...params,issueAge:42,horizon:10,premium:other});
  assert.deepEqual(b.rows.map(r=>r.SCE.value),[140,140,140,140,140,170,170,170,170,170]);
  assert.equal(b.totals.SCE,1550);
});
test('waiver projection handles first, final and within-interval transitions', () => {
  const first=calculatePremiumSchedule({...params,horizon:12,diagnosisAge:40,claimType:'major'});
  assert.equal(first.totals.OYS2,0); assert.equal(first.rows[0].OYS2.reason,'確診豁免保費'); assert.equal(first.rows[10].OYS2.reason,'已供滿');
  const last=calculatePremiumSchedule({...params,horizon:12,diagnosisAge:49,claimType:'major'});
  assert.equal(last.totals.OYS2,2700); assert.equal(last.rows[9].OYS2.value,0);
  const interval=calculatePremiumSchedule({...params,horizon:25,term:25,diagnosisAge:62,claimType:'major'});
  assert.equal(interval.totals.OYS2,2200); assert.match(renderPremiumSchedule(interval),/區間小計：HK\$200\.00/);
});

test('missing repricing row remains pending throughout its five-year block', () => {
 const s=calculatePremiumSchedule({...params,horizon:11});
 assert.equal(s.rows[10].SCE.value,200);
 const p={...premium,SCE_MALE:{...premium.SCE_MALE,values:premium.SCE_MALE.values.filter(row=>Number(row[0])!==45)}};
 const m=calculatePremiumSchedule({...params,premium:p,horizon:10});
 assert.deepEqual(m.rows.slice(5,10).map(r=>r.SCE.value),[null,null,null,null,null]); assert.equal(m.totals.SCE,null);
});
test('waiver does not disguise an absent source rate as a zero quote', () => {
 const p={...premium,OYS2_MALE:{...premium.OYS2_MALE,values:premium.OYS2_MALE.values.map((row,i)=>i===3?[40,'',400,200,300,100,200]:row)}};
 const s=calculatePremiumSchedule({...params,premium:p,diagnosisAge:40,horizon:2});
 assert.equal(s.rows[0].OYS2.value,null); assert.equal(s.totals.OYS2,null);
});
