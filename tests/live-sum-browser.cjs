const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || undefined});
  try {
    const benefits = ['SCE','OYS2'].flatMap(plan_id => [{plan_id,benefit_type:'major_ci',payout_percent:100},{plan_id,benefit_type:'early_ci',payout_percent:20}]);
    benefits.push({plan_id:'OYS2',benefit_type:'first_10_year_bonus',payout_percent:50,age_min:0,age_max:30});
    const cache = {structured:{Plans:[{plan_id:'SCE',plan_name:'SCE',protection_style:'single'},{plan_id:'OYS2',plan_name:'OYS2',protection_style:'continuing'}], Benefits:benefits, Claim_Rules:[], Health_Program:[{plan_id:'SCE',effect_type:'premium_multiplier',effect_value:0.9},{plan_id:'OYS2',effect_type:'coverage_bonus',effect_value:0.1}], Product_Content:[],Settings_Versions:[]},premium:{}};
    for (const [name,width,height] of [['ipad-portrait',820,1180],['ipad-landscape',1180,820],['honor-unfolded',790,720]]) for (const vitality of [false,true]) {
      const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
      await page.addInitScript(({cache,vitality})=>{ localStorage.setItem('AVA_CI_OFFICIAL_CACHE_V2',JSON.stringify(cache));if (!localStorage.getItem('AVA_CI_USER_STATE_V1')) localStorage.setItem('AVA_CI_USER_STATE_V1',JSON.stringify({flow:{monthlyNeed:30000,desiredMonths:24,protectionStyle:'compare'},frontstage:{age:30,diagnosisAge:35,vitality,sums:{SCE:78000,OYS2:78000}}})); },{cache,vitality});
      await page.route('https://script.google.com/**',r=>r.abort());
      await page.goto('http://127.0.0.1:8765/?avaEntry=frontend#/plans');
      const sce=page.locator('#sum-SCE'),oys=page.locator('#sum-OYS2'); await sce.waitFor();
      for (const [input,id] of [[sce,'SCE'],[oys,'OYS2']]) {
        await input.click(); await input.press('ControlOrMeta+A'); await input.press('Backspace');
        await input.pressSequentially('100000', {delay:5});
        assert.equal(await input.inputValue(),'100,000');
        assert.equal(await input.evaluate(el=>document.activeElement===el),true);
        assert.equal(await input.evaluate(el=>el.selectionStart),7);
        const card=page.locator(`[data-plan-card="${id}"] .protection-rows`);
        assert.match(await card.innerText(),new RegExp(id==='OYS2'&&vitality?'HK\\$110,000':'HK\\$100,000'));
        if(id==='OYS2') assert.match(await card.innerText(),/\+HK\$50,000/);
      }
      const payout=page.locator('[data-shared-payout-card]');
      assert.match(await payout.innerText(),new RegExp(vitality?'HK\\$210,000':'HK\\$200,000'));
      assert.match(await payout.innerText(),/可支持約 7 個月/);
      await oys.evaluate(el=>{el.setSelectionRange(4,4)});await oys.press('Backspace');
      assert.equal(await oys.inputValue(),'10,000'); assert.equal(await oys.evaluate(el=>document.activeElement===el),true);
      await oys.fill('78000'); assert.equal(await oys.inputValue(),'78,000');
      assert.match(await page.locator('[data-plan-card="OYS2"] .protection-rows').innerText(),new RegExp(vitality?'HK\\$85,800':'HK\\$78,000'));
      await page.context().grantPermissions(['clipboard-read','clipboard-write']); await page.evaluate(()=>navigator.clipboard.writeText('100000')); await oys.click(); await oys.press('ControlOrMeta+A'); await oys.press('ControlOrMeta+V'); assert.equal(await oys.inputValue(),'100,000');
      assert.match(await payout.innerText(),new RegExp(vitality?'HK\\$210,000':'HK\\$200,000'));
      await page.reload();assert.equal(await oys.inputValue(),'100,000'); assert.equal(await sce.inputValue(),'100,000');
      await page.close();console.log(`${name} vitality=${vitality}: passed`);
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
