// Browser regression; run against a local app server at CI_TEST_URL (default port 8765).
// Rates and benefits below are synthetic fixtures, not official product data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const benefits = ['SCE', 'OYS2'].flatMap(id => [{ plan_id: id, benefit_type: 'major_ci', payout_percent: 100 }, { plan_id: id, benefit_type: 'early_ci', payout_percent: 20 }]);
    benefits.push({ plan_id: 'OYS2', benefit_type: 'first_10_year_bonus', payout_percent: 50, age_min: 0, age_max: 30 }, { plan_id: 'OYS2', benefit_type: 'first_10_year_bonus', payout_percent: 35, age_min: 31, age_max: 120 }, { plan_id: 'OYS2', benefit_type: 'premium_waiver', display_text: '合資格豁免' });
    const cache = { structured: { Plans: [{ plan_id: 'SCE', plan_name: '簡護危疾保', protection_style: 'single' }, { plan_id: 'OYS2', plan_name: '愛伴航2', protection_style: 'continuing' }], Benefits: benefits, Claim_Rules: [], Health_Program: [], Product_Content: [], Settings_Versions: [] }, premium: {} };
    for (const [name, width, height] of [['ipad-portrait', 820, 1180], ['ipad-landscape', 1180, 820], ['honor-unfolded-like', 790, 720], ['mobile', 390, 844]]) {
      for (const [age, diagnosisAge, demoPercent, boundary] of [[0, 5, 50, false], [30, 35, 50, false], [30, 40, null, true], [30, 45, null, false], [31, 36, 35, false], [40, 45, 35, false]]) {
        const page = await browser.newPage({ viewport: { width, height }, serviceWorkers: 'block' });
        await page.addInitScript(({ cache, age, diagnosisAge }) => {
          localStorage.setItem('AVA_CI_OFFICIAL_CACHE_V2', JSON.stringify(cache));
          localStorage.setItem('AVA_CI_USER_STATE_V1', JSON.stringify({ flow: { monthlyNeed: 30000, desiredMonths: 24, protectionStyle: 'compare' }, frontstage: { age, diagnosisAge, sums: { SCE: 500000, OYS2: 500000 } } }));
        }, { cache, age, diagnosisAge });
        await page.route('https://script.google.com/**', route => route.abort());
        await page.goto(`${process.env.CI_TEST_URL || 'http://127.0.0.1:8765'}/?avaEntry=frontend#/plans/OYS2/claim`);
        const button = page.locator('[data-full-claim="OYS2"]');
        await button.waitFor(); assert.equal(await button.isEnabled(), true); assert.match(await button.innerText(), /HK\$500,000/);
        assert.match(await page.locator('#main-content').innerText(), /額外保障資格待確認，並未計入/);
        const demo = page.locator('[data-enhancement-demonstration]');
        if (demoPercent) { assert.equal(await demo.count(), 1); assert.match(await demo.innerText(), new RegExp(`情境示範[\\s\\S]*\\+${demoPercent}%`)); assert.match(await demo.innerText(), /並非已確認賠償，未計入賠償及支持月份/); }
        else { assert.equal(await demo.count(), 0); }
        assert.equal(await page.locator('[data-enhancement-boundary]').count(), boundary ? 1 : 0);
        await button.click();
        const result = page.locator('[data-claim-state="continuing"]'); await result.waitFor();
        const text = await result.innerText(); assert.match(text, /HK\$500,000/); assert.doesNotMatch(text, /HK\$675,000/);
        assert.match(text, /額外保障資格待確認，並未計入/);
        assert.equal(await page.locator('[data-enhancement-demonstration]').count(), demoPercent ? 1 : 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, `${name}: page overflow`);
        await page.goto(`${process.env.CI_TEST_URL || 'http://127.0.0.1:8765'}/?avaEntry=frontend#/plans`);
        const comparison = page.locator('[data-shared-payout-card]');
        await comparison.waitFor();
        const comparisonText = await comparison.innerText();
        assert.match(comparisonText, /HK\$1,000,000/);
        assert.match(comparisonText, /可支持約 33 個月/);
        assert.match(comparisonText, /額外保障待確認/);
        const oys = page.locator('[data-plan-card="OYS2"]');
        assert.equal(await oys.locator('[data-enhancement-demonstration]').count(), demoPercent ? 1 : 0);
        assert.equal(await oys.locator('[data-enhancement-boundary]').count(), boundary ? 1 : 0);
        const protectionRows = oys.locator('.protection-rows');
        const protectionText = await protectionRows.innerText();
        assert.match(protectionText, /基本保額[\s\S]*HK\$500,000/);
        assert.doesNotMatch(protectionText, /額外保障資格待確認/);
        if (demoPercent) {
          assert.equal((protectionText.match(/額外保障/g) || []).length, 1);
          assert.equal((protectionText.match(/情境示範/g) || []).length, 1);
        } else if (boundary) {
          assert.equal((protectionText.match(/額外保障/g) || []).length, 1);
          assert.equal((protectionText.match(/情境示範/g) || []).length, 1);
        } else {
          assert.doesNotMatch(protectionText, /額外保障|首10年升級保障|情境示範/);
        }
        const sce = await page.locator('[data-plan-card="SCE"]').innerText();
        assert.doesNotMatch(sce, /額外保障|首10年升級保障/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, `${name}: comparison overflow`);
        await page.goto(`${process.env.CI_TEST_URL || 'http://127.0.0.1:8765'}/?avaEntry=frontend#/plans/OYS2/protection`);
        const detail = page.locator('.protection-rows');
        await detail.waitFor();
        assert.equal(await detail.innerText(), protectionText);
        await page.goto(`${process.env.CI_TEST_URL || 'http://127.0.0.1:8765'}/?avaEntry=frontend#/plans/SCE/protection`);
        const sceDetail = page.locator('.protection-rows');
        await sceDetail.waitFor();
        assert.doesNotMatch(await sceDetail.innerText(), /額外保障|首10年升級保障|情境示範/);
        await page.close();
      }
      console.log(`${name}: passed`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
