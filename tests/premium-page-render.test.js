import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePremiumData } from '../src/data/data-api.js';
import { premiumEvidence } from '../src/domain/frontstage-experience.js';
import { healthProgramEffect } from '../src/domain/plan-experience.js';
import { premiumQuote, renderPremiumFigures } from '../src/domain/premium-engine.js';

// Synthetic rates deliberately do not represent official production rates.
const tables = normalizePremiumData({
  SCE_MALE: [['Simple Care Essence - Male (per hk$7800)'], ['Age', 'Non-Smoker','Smoker'], [40, 100, 110]],
  SCE_FEMALE: [['Simple Care Essence - Female (per hk$7800)'], ['Age', 'Non-Smoker','Smoker'], [40, 200, 210]],
  OYS2_MALE: [['OYS2 Premium Rate Table (Per hk$7800) - Male'], ['Age', '10-Year Pay','','18-Year Pay','','25-Year Pay',''], ['', 'Non-Smoker','Smoker','Non-Smoker','Smoker','Non-Smoker','Smoker'], [40,300,310,320,330,340,350]],
  OYS2_FEMALE: [['OYS2 Premium Rate Table (Per hk$7800) - Female'], ['Age', '10-Year Pay','','18-Year Pay','','25-Year Pay',''], ['', 'Non-Smoker','Smoker','Non-Smoker','Smoker','Non-Smoker','Smoker'], [40,400,410,420,430,440,450]]
});
test('all four independent matrices map age, sex, smoking and product-specific terms', () => {
  for (const [id,sex,smoker,term,rate] of [['SCE','M','non-smoker',10,100],['SCE','F','smoker',25,210],['OYS2','M','smoker',18,330],['OYS2','F','non-smoker',25,440]]) {
    const x=premiumEvidence(tables,{plan_id:id,rate_basis:7800},sex,40,smoker,term,7800); assert.equal(x.rawRate,rate); assert.equal(x.annualPremium,rate);
  }
  assert.equal(premiumEvidence(tables,{plan_id:'OYS2',rate_basis:7800},'F',40,'smoker',99,7800).status,'VERIFY_REQUIRED');
  assert.equal(premiumEvidence(tables,{plan_id:'SCE',rate_basis:7800},'M',null,'smoker',10,7800).status,'VERIFY_REQUIRED');
});
test('monthly loading is applied once after health adjustment with two-decimal display', () => {
  for (const [annual,expected] of [[1015,'89.66'],[6015,'531.33']]) {
    const q=premiumQuote({status:'AVAILABLE',annualPremium:annual},{status:'NOT_APPLICABLE'},false);
    assert.match(renderPremiumFigures(q),new RegExp(expected.replace('.','\\.')));
  }
  const q=premiumQuote({status:'AVAILABLE',annualPremium:1000},{status:'VERIFIED',effectType:'premium_multiplier',premiumMultiplier:0.9},true);
  assert.equal(q.annual,900); assert.equal(q.monthly,79.5);
  assert.equal(premiumQuote({status:'AVAILABLE',annualPremium:1000},{status:'VERIFY_REQUIRED'},true).status,'VERIFY_REQUIRED');
  assert.doesNotMatch(renderPremiumFigures(premiumQuote({status:'VERIFY_REQUIRED'},null)),/HK\$0/);
});

test('actual premium route renders figures from customer state and keeps total pending', async () => {
  const main={innerHTML:'',focus(){}}; const status={textContent:'',className:''};
  const dummy={textContent:'',addEventListener(){},classList:{toggle(){},remove(){},add(){}},setAttribute(){}};
  const handlers={}; const controls={};
  const structured={ Plans:[{plan_id:'SCE',plan_name:'SCE',rate_basis:7800,protection_style:'single',active:true},{plan_id:'OYS2',plan_name:'OYS2',rate_basis:7800,protection_style:'continuing',active:true}],Benefits:[],Claim_Rules:[],Health_Program:[{plan_id:'SCE',effect_type:'premium_multiplier',effect_value:0.9,enabled:true},{plan_id:'OYS2',effect_type:'coverage_bonus',effect_value:0.1,enabled:true}],Product_Content:[],Settings_Versions:[] };
  const cache={structured,premium:tables};
  const user={frontstage:{age:40,gender:'M',smoker:'non-smoker',payTerm:10,vitality:true,sums:{SCE:7800,OYS2:7800}}};
  globalThis.localStorage={getItem(k){return k==='AVA_CI_OFFICIAL_CACHE_V2'?JSON.stringify(cache):k==='AVA_CI_USER_STATE_V1'?JSON.stringify(user):null},setItem(){}};
  globalThis.document={querySelector(s){ if (s==='#main-content') return main; if (s==='#status') return status; return controls[s] ||= { ...dummy, addEventListener(name, cb){ handlers[s+':'+name]=cb; } }; },querySelectorAll(){return []},body:dummy,addEventListener(){},visibilityState:'visible'};
  globalThis.window=globalThis; globalThis.addEventListener=(name,cb)=>{handlers[name]=cb};
  globalThis.location={search:'',hash:'#/premiums',href:'https://example.test/#/premiums'};
  globalThis.history={replaceState(){}}; Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
  globalThis.fetch=()=>new Promise(()=>{});
  const app=await import('../src/app.js?render-test');
  assert.match(main.innerHTML,/HK\$90\.00/); assert.match(main.innerHTML,/約 HK\$7\.95/);
  assert.match(main.innerHTML,/HK\$300\.00/); assert.match(main.innerHTML,/約 HK\$26\.50/);
  assert.match(main.innerHTML,/<summary>查看逐年保費<\/summary>/);
  assert.match(main.innerHTML,/請輸入投保年齡及顯示年數/);
  handlers['#premium-horizon:change']({target:{value:'2'}});
  assert.match(main.innerHTML,/<th>保單年度<\/th>/);
  assert.match(main.innerHTML,/按目前官方費率推算/);
  assert.match(main.innerHTML,/HK\$600\.00/);
  assert.match(main.innerHTML,/基礎保費|保費表沒有此投保年齡/);
  assert.match(main.innerHTML,/所選期間預計總保費/);
  const cards = [...main.innerHTML.matchAll(/<article class="card premium-plan">([\s\S]*?)<\/article>/g)];
  assert.equal(cards.length,2);
  for (const card of cards) {
    assert.match(card[1],/基本保額/); assert.match(card[1],/每年保費/); assert.match(card[1],/每月保費/);
    assert.doesNotMatch(card[1],/總保費|VERIFY REQUIRED|健康程式|年供/);
  }
  assert.doesNotMatch(main.innerHTML,/payment-timeline|官方方案資料：|重新載入官方資料/);
  handlers['#premium-gender:change']({target:{value:'F'}});
  assert.match(main.innerHTML,/HK\$180\.00/); assert.match(main.innerHTML,/約 HK\$15\.90/);
  handlers['#premium-vitality:change']({target:{value:'no'}});
  assert.match(main.innerHTML,/HK\$200\.00/);
  globalThis.location.hash='#/plans'; handlers.hashchange();
  assert.equal((main.innerHTML.match(/data-plan-card=/g) || []).length,2);
  assert.doesNotMatch(main.innerHTML,/premium-summary|年繳保費|原年繳保費|id="health-program"/);
  assert.match(main.innerHTML,/主要危疾/); assert.match(main.innerHTML,/查看保障疾病種類/);
  globalThis.location.hash='#/premiums'; handlers.hashchange();
  assert.match(main.innerHTML,/HK\$200\.00/);
  assert.equal(app.state.user.frontstage.vitality,false);
  handlers['#premium-age:change']({target:{value:'41'}});
  assert.doesNotMatch(main.innerHTML,/HK\$0\.00/); assert.match(main.innerHTML,/每月保費：VERIFY REQUIRED/);
});

test('bad source identity, swapped columns, blank coordinates and cross-product health rules fail closed', () => {
  const swapped = { ...tables, SCE_MALE: tables.SCE_FEMALE };
  assert.equal(premiumEvidence(swapped,{plan_id:'SCE',rate_basis:7800},'M',40,'non-smoker',10,7800).status,'VERIFY_REQUIRED');
  const rows = tables.OYS2_MALE.values.map(r => r.slice()); rows[2][1] = 'Smoker';
  assert.equal(premiumEvidence({...tables,OYS2_MALE:{...tables.OYS2_MALE,values:rows}},{plan_id:'OYS2',rate_basis:7800},'M',40,'non-smoker',10,7800).status,'VERIFY_REQUIRED');
  rows[2][1] = 'Non-Smoker'; rows[3][1] = '';
  assert.equal(premiumEvidence({...tables,OYS2_MALE:{...tables.OYS2_MALE,values:rows}},{plan_id:'OYS2',rate_basis:7800},'M',40,'non-smoker',10,7800).status,'VERIFY_REQUIRED');
  assert.equal(healthProgramEffect([{plan_id:'OYS2',effect_type:'premium_multiplier',effect_value:0.9}], 'OYS2', true).status,'VERIFY_REQUIRED');
  assert.equal(healthProgramEffect([{plan_id:'SCE',effect_type:'coverage_bonus',effect_value:0.1}], 'SCE', true).status,'VERIFY_REQUIRED');
});
