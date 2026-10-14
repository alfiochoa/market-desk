// Takes the README screenshot gallery from the DEPLOYED site with headless Chromium:  node scripts/gallery.mjs [url]
import { chromium } from '@playwright/test';
const URL = process.argv[2] ?? 'https://alfiochoa.github.io/market-desk/';
const out = (n) => `docs/screens/${n}.png`;
const b = await chromium.launch();
const open = async (opts = {}, init, ready = '[data-widget=macro] svg.linechart') => {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, ...opts });
  const p = await ctx.newPage();
  if (init) await p.addInitScript(init);
  await p.goto(URL);
  await p.waitForSelector(ready, { timeout: 40000 });
  await p.waitForFunction(() => !document.querySelector('.badge.loading'), null, { timeout: 40000 });
  await p.waitForTimeout(1500);
  return p;
};
let p = await open();
await p.screenshot({ path: out('overview') });
await p.locator('[data-widget=macro]').screenshot({ path: out('macro') });
await p.locator('[data-widget=heatmap]').screenshot({ path: out('heatmap') });
await p.keyboard.press('Control+k'); await p.keyboard.type('btc'); await p.waitForTimeout(300);
await p.screenshot({ path: out('palette'), clip: { x: 300, y: 0, width: 1000, height: 420 } });
await p.close();

p = await open({}, () => localStorage.setItem('md:layout:v1', JSON.stringify([{ id: 'chart', type: 'chart', x: 0, y: 0, w: 12, h: 17 }, { id: 'crypto', type: 'crypto', x: 0, y: 17, w: 7, h: 9 }])), '[data-widget=crypto] tbody tr');
await p.locator('[data-widget=crypto] tbody tr').first().click();
for (const t of ['Bollinger', 'RSI', 'MACD']) await p.getByRole('button', { name: t, exact: true }).click();
await p.waitForTimeout(2500);
await p.locator('[data-widget=chart]').screenshot({ path: out('chart-indicators') });
await p.close();

p = await open();
const pf = p.locator('[data-widget=portfolio]');
for (const [sym, side, q, px] of [['AAPL', 'buy', '10', '250'], ['AAPL', 'buy', '5', '270'], ['AAPL', 'sell', '6', '285'], ['NVDA', 'buy', '20', '120']]) {
  await pf.getByLabel('Symbol').fill(sym); await pf.getByLabel('Side').selectOption(side); await pf.getByLabel('Quantity').fill(q); await pf.getByLabel('Price').fill(px);
  await pf.getByRole('button', { name: 'Add lot' }).click();
}
await pf.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
await pf.screenshot({ path: out('portfolio') });
await p.close();

p = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.screenshot({ path: out('mobile') });
await b.close();
console.log('ok');
