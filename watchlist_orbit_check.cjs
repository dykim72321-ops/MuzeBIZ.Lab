const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + err.message));

  await page.goto('http://localhost:5173/stock/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  await page.screenshot({ path: '/tmp/dashboard_full.png', fullPage: true });

  // Try to find watchlist orbit panel and click a stock item
  const clickableTickers = await page.$$('[data-ticker], .watchlist-item, button, div');
  console.log('Page title:', await page.title());

  // Look for any element containing a ticker-like uppercase text in the orbit panel
  const orbitText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('--- BODY TEXT SNIPPET ---');
  console.log(orbitText);

  console.log('--- CONSOLE ERRORS SO FAR ---');
  console.log(JSON.stringify(consoleErrors, null, 2));

  await browser.close();
})();
