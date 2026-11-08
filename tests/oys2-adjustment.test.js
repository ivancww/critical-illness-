import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePremiumData,adjustmentAvailability} from '../src/data/data-api.js';
import {premiumEvidence} from '../src/domain/frontstage-experience.js';
// Synthetic fixture; values are not official rates.
const edges=[10000,20000,40000,80000,130000,250000,500000];
const adjustment={status:'AVAILABLE',adjustmentCurrency:'USD',baseRateCurrency:'HKD',hkdPerUsd:7.8,rateBasisHkd:7800,bandMaxExclusive:true,rows:edges.map((minUsd,i)=>({minUsd,maxUsd:edges[i+1]??null,pay10:i/10,pay18:i===4?-0.3:i/10,pay25:i/10}))};
const matrix=g=>[[`OYS2 Premium Rate Table (Per hk$7800) - ${g}`],['Age','10-Year Pay','','18-Year Pay','','25-Year Pay',''],['','Non-Smoker','Smoker','Non-Smoker','Smoker','Non-Smoker','Smoker'],...[0,30,40].map(age=>[age,351,351,351,351,351,351])];
const premium=normalizePremiumData({OYS2_MALE:matrix('Male'),OYS2_FEMALE:matrix('Female'),OYS2_ADJUSTMENT:adjustment});
const quote=(usd,term=18,gender='M',age=40)=>premiumEvidence(premium,{plan_id:'OYS2',rate_basis:7800},gender,age,'non-smoker',term,usd*7.8);
test('USD adjustment converts once and reaches the specified synthetic reference',()=>{assert.ok(Math.abs(quote(150000).annualPremium-52299)<1e-7); for(const g of ['M','F']) for(const age of [0,30,40]) for(const usd of [10000,100000,150000]) for(const term of [10,18,25]) assert.equal(quote(usd,term,g,age).status,'AVAILABLE');});
test('all seven synthetic bands honor lower and exclusive upper boundaries',()=>{for(const [i,edge] of edges.entries()) for(const term of [10,18,25]) {const q=quote(edge,term); const expected=(351+adjustment.rows[i][`pay${term}`]*7.8)*edge/1000;assert.ok(Math.abs(q.annualPremium-expected)<1e-6); if(i) assert.equal(quote(edge-1,term).status,'AVAILABLE');} assert.equal(quote(9999).status,'VERIFY_REQUIRED');});
test('null adjustments and unverified currency metadata fail closed',()=>{const a=structuredClone(adjustment);a.rows[2].pay18=null; const p={...premium,OYS2_ADJUSTMENT:a};assert.equal(premiumEvidence(p,{plan_id:'OYS2',rate_basis:7800},'M',40,'non-smoker',18,50000*7.8).status,'VERIFY_REQUIRED');assert.equal(adjustmentAvailability({OYS2_ADJUSTMENT:{...a,hkdPerUsd:1}}),'MALFORMED_OR_EMPTY');});

test('reference rate is shared by quote, monthly conversion and schedule totals', async()=>{
 const {premiumQuote,calculatePremiumSchedule,renderPremiumSchedule}=await import('../src/domain/premium-engine.js');
 const q=quote(150000); const card=premiumQuote(q,{status:'NOT_APPLICABLE'},false);
 assert.ok(Math.abs(card.annual-52299)<1e-7);assert.ok(Math.abs(card.monthly-52299*1.06/12)<1e-7);
 const schedule=calculatePremiumSchedule({issueAge:40,horizon:20,term:18,vitality:false,premium,plans:[{plan_id:'OYS2',rate_basis:7800}],sums:{OYS2:1170000},healthProgram:[],gender:'M',smoker:'non-smoker',lookup:premiumEvidence,healthEffect:()=>({status:'NOT_APPLICABLE'})});
 assert.ok(Math.abs(schedule.rows[0].OYS2.value-card.annual)<1e-7);assert.ok(Math.abs(schedule.totals.OYS2-52299*18)<1e-6);assert.equal(schedule.rows[18].OYS2.reason,'已供滿');assert.match(renderPremiumSchedule(schedule),/HK\$941,382\.00/);
});

test('official adjustment survives refresh and cache round-trip without contaminating User state', async()=>{
 const {refreshOfficialData}=await import('../src/data/data-api.js');const {saveOfficialCache,loadOfficialCache}=await import('../src/data/storage.js');
 const sce=g=>[[`Simple Care Essence - ${g} (per hk$7800)`],['Age','Non-Smoker','Smoker'],[40,100,101]];
 const raw={OYS2_MALE:matrix('Male'),OYS2_FEMALE:matrix('Female'),SCE_MALE:sce('Male'),SCE_FEMALE:sce('Female'),OYS2_ADJUSTMENT:adjustment};
 const structured={Plans:[{plan_id:'OYS2'}],Benefits:[],Claim_Rules:[],Health_Program:[],Product_Content:[],Settings_Versions:[]};
 const result=await refreshOfficialData(null,async u=>({ok:true,json:async()=>({success:true,data:u.searchParams.get('action')==='all'?structured:raw})}));
 assert.equal(result.freshness.premium.adjustmentStatus,'AVAILABLE');assert.deepEqual(result.premium.OYS2_ADJUSTMENT,adjustment);
 const map=new Map();const storage={setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)??null};saveOfficialCache(result,storage);assert.deepEqual(loadOfficialCache(storage).premium.OYS2_ADJUSTMENT,adjustment);assert.equal(map.has('AVA_CI_USER_STATE_V1'),false);
});
