import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePremiumData } from '../src/data/data-api.js';
import { premiumEvidence } from '../src/domain/frontstage-experience.js';
import { premiumQuote, renderPremiumFigures } from '../src/domain/premium-engine.js';

// Synthetic rates deliberately do not represent official production rates.
const tables = normalizePremiumData({
  SCE_MALE: [['SCE Male'], ['Age', 'Non-Smoker','Smoker'], [40, 100, 110]],
  SCE_FEMALE: [['SCE Female'], ['Age', 'Non-Smoker','Smoker'], [40, 200, 210]],
  OYS2_MALE: [['OYS2 Male'], ['Age', '10-Year Pay','','18-Year Pay','','25-Year Pay',''], ['', 'Non-Smoker','Smoker','Non-Smoker','Smoker','Non-Smoker','Smoker'], [40,300,310,320,330,340,350]],
  OYS2_FEMALE: [['OYS2 Female'], ['Age', '10-Year Pay','','18-Year Pay','','25-Year Pay',''], ['', 'Non-Smoker','Smoker','Non-Smoker','Smoker','Non-Smoker','Smoker'], [40,400,410,420,430,440,450]]
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
  const handlers={};
  const structured={ Plans:[{plan_id:'SCE',plan_name:'SCE',rate_basis:7800,protection_style:'single',active:true},{plan_id:'OYS2',plan_name:'OYS2',rate_basis:7800,protection_style:'continuing',active:true}],Benefits:[],Claim_Rules:[],Health_Program:[{plan_id:'SCE',effect_type:'premium_multiplier',effect_value:0.9,enabled:true},{plan_id:'OYS2',effect_type:'coverage_bonus',effect_value:0.1,enabled:true}],Product_Content:[],Settings_Versions:[] };
  const cache={structured,premium:tables};
  const user={frontstage:{age:40,gender:'M',smoker:'non-smoker',payTerm:10,vitality:true,sums:{SCE:7800,OYS2:7800}}};
  globalThis.localStorage={getItem(k){return k==='AVA_CI_OFFICIAL_CACHE_V2'?JSON.stringify(cache):k==='AVA_CI_USER_STATE_V1'?JSON.stringify(user):null},setItem(){}};
  globalThis.document={querySelector(s){return s==='#main-content'?main:s==='#status'?status:dummy},querySelectorAll(){return []},body:dummy,addEventListener(){},visibilityState:'visible'};
  globalThis.window=globalThis; globalThis.addEventListener=(name,cb)=>{handlers[name]=cb};
  globalThis.location={search:'',hash:'#/premiums',href:'https://example.test/#/premiums'};
  globalThis.history={replaceState(){}}; Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
  globalThis.fetch=()=>new Promise(()=>{});
  const app=await import('../src/app.js?render-test');
  assert.match(main.innerHTML,/HK\$90\.00/); assert.match(main.innerHTML,/約 HK\$7\.95/);
  assert.match(main.innerHTML,/HK\$300\.00/); assert.match(main.innerHTML,/約 HK\$26\.50/);
  assert.match(main.innerHTML,/總保費：VERIFY REQUIRED/);
  app.state.user.frontstage.age=41; handlers.hashchange();
  assert.doesNotMatch(main.innerHTML,/HK\$0\.00/); assert.match(main.innerHTML,/每月保費：VERIFY REQUIRED/);
});
