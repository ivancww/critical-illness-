import test from 'node:test';
import assert from 'node:assert/strict';

test('actual comparison route renders one shared payout with scenario breakdown and no double counting', async () => {
  const main={innerHTML:'',focus(){}}; const handlers={};
  const dummy={textContent:'',focus(){},addEventListener(){},classList:{toggle(){},remove(){},add(){}},setAttribute(){}};
  const benefits=['SCE','OYS2'].flatMap(id=>[{plan_id:id,benefit_type:'major_ci',payout_percent:100},{plan_id:id,benefit_type:'early_ci',payout_percent:20}]);
  benefits.push({plan_id:'OYS2',benefit_type:'first_10_year_bonus',payout_percent:35,age_min:0,age_max:120},{plan_id:'OYS2',benefit_type:'premium_waiver',display_text:'合資格豁免'});
  const cache={structured:{Plans:[{plan_id:'SCE',plan_name:'簡護危疾保',protection_style:'single'},{plan_id:'OYS2',plan_name:'愛伴航2',protection_style:'continuing'}],Benefits:benefits,Claim_Rules:[],Health_Program:[],Product_Content:[],Settings_Versions:[]},premium:{}};
  const user={flow:{monthlyNeed:30000,desiredMonths:24,protectionStyle:'compare'},frontstage:{age:40,diagnosisAge:51,sums:{SCE:500000,OYS2:500000},comparisonClaimType:'early'}};
  globalThis.localStorage={getItem(k){return k==='AVA_CI_OFFICIAL_CACHE_V2'?JSON.stringify(cache):k==='AVA_CI_USER_STATE_V1'?JSON.stringify(user):null},setItem(){}};
  globalThis.document={querySelector(s){return s==='#main-content'?main:dummy},querySelectorAll(s){return s==='[data-plan-claim]'?[{dataset:{claimType:'major'},addEventListener(n,cb){handlers.major=cb}},{dataset:{claimType:'early'},addEventListener(n,cb){handlers.early=cb}}]:[]},getElementById(){return dummy},body:dummy,addEventListener(){},visibilityState:'visible'};
  globalThis.window=globalThis;globalThis.addEventListener=(name,cb)=>{handlers[name]=cb};globalThis.location={search:'',hash:'#/plans',href:'https://example.test/#/plans'};globalThis.history={replaceState(){}};Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});globalThis.fetch=()=>new Promise(()=>{});
  const app = await import('../src/app.js?payout-render');
  assert.equal((main.innerHTML.match(/data-plan-card=/g)||[]).length,2);
  assert.equal((main.innerHTML.match(/data-shared-payout-card/g)||[]).length,1);
  assert.equal((main.innerHTML.match(/role="img" aria-label="早期疾病/g)||[]).length,1);
  assert.match(main.innerHTML,/HK\$200,000/); assert.match(main.innerHTML,/HK\$800,000/); assert.match(main.innerHTML,/累計總賠償：HK\$1,000,000/); assert.match(main.innerHTML,/可支持約 7 個月/);
  handlers.major();
  assert.equal((main.innerHTML.match(/data-shared-payout-card/g)||[]).length,1);
  assert.match(main.innerHTML,/主要危疾 100%/);assert.match(main.innerHTML,/HK\$1,000,000/);assert.match(main.innerHTML,/合約完結/);assert.match(main.innerHTML,/往後保費獲豁免/);
  assert.doesNotMatch(main.innerHTML,/\d+\.\d{6,}%/);
  app.state.user.frontstage.diagnosisAge=45; handlers.hashchange();
  assert.match(main.innerHTML,/HK\$1,175,000/); assert.match(main.innerHTML,/額外保障 \+HK\$175,000/); assert.match(main.innerHTML,/主要危疾 100%/);
  handlers.early(); assert.match(main.innerHTML,/第二次 · 主要危疾賠償：HK\$800,000/); assert.match(main.innerHTML,/基本保障合計 HK\$1,000,000；實際累計須待額外保障確認/);
  assert.doesNotMatch(main.innerHTML,/往後保費獲豁免/);
});
