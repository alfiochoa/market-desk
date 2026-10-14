// Records the demo scenes from the DEPLOYED site (headless Chromium + Playwright video):  node scripts/video/record.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';

const URL = process.argv[2] ?? 'https://alfiochoa.github.io/market-desk/';
const OUT = 'tmp/video';
mkdirSync(OUT, { recursive: true });
const W = 1600, H = 750;
const b = await chromium.launch();
const times = {};

async function scene(name, run, { down = false, init, ready = '[data-widget=macro] svg.linechart' } = {}) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: `${OUT}/raw_${name}`, size: { width: W, height: H } } });
  const t0 = Date.now();
  const p = await ctx.newPage();
  if (init) await p.addInitScript(init);
  if (down) for (const h of ['api.coingecko.com', 'data-api.binance.vision', 'api.frankfurter.dev', 'home.treasury.gov']) await p.route(`https://${h}/**`, (r) => r.abort('failed'));
  await p.goto(URL);
  await p.waitForSelector(ready, { timeout: 60000 });
  await p.waitForFunction(() => !document.querySelector('.badge.loading'), null, { timeout: 60000 });
  await p.waitForTimeout(800);
  times[name] = (Date.now() - t0) / 1000;
  await run(p);
  const v = p.video();
  await ctx.close();
  renameSync(await v.path(), `${OUT}/scene_${name}.webm`);
  console.log('recorded', name, times[name].toFixed(1));
}
const wait = (p, ms) => p.waitForTimeout(ms);
const type = async (p, s) => { for (const c of s) { await p.keyboard.type(c); await wait(p, 140); } };

await scene('overview', async (p) => {
  await wait(p, 3500);
  await p.evaluate(() => window.scrollTo({ top: 520, behavior: 'smooth' })); await wait(p, 3500);
  await p.evaluate(() => window.scrollTo({ top: 1100, behavior: 'smooth' })); await wait(p, 3500);
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(p, 2000);
});

await scene('palette', async (p) => {
  await wait(p, 1200);
  await p.keyboard.press('Control+k'); await wait(p, 900);
  await type(p, 'msft'); await wait(p, 900); await p.keyboard.press('Enter'); await wait(p, 2200);
  await p.keyboard.press('Control+k'); await wait(p, 700);
  await type(p, 'btc'); await wait(p, 900); await p.keyboard.press('Enter'); await wait(p, 2500);
  for (const t of ['Bollinger', 'RSI', 'MACD']) { await p.getByRole('button', { name: t, exact: true }).click(); await wait(p, 1500); }
  await wait(p, 2500);
}, { init: () => localStorage.setItem('md:layout:v1', JSON.stringify([{ id: 'chart', type: 'chart', x: 0, y: 0, w: 8, h: 17 }, { id: 'watchlist', type: 'watchlist', x: 8, y: 0, w: 4, h: 17 }, { id: 'crypto', type: 'crypto', x: 0, y: 17, w: 8, h: 10 }])), ready: '[data-widget=crypto] tbody tr' });

await scene('badges', async (p) => {
  await p.addStyleTag({ content: '.badge{outline:2px solid #f5b94a;outline-offset:2px;box-shadow:0 0 12px #f5b94a88}' });
  await wait(p, 4500);
  await p.evaluate(() => window.scrollTo({ top: 480, behavior: 'smooth' })); await wait(p, 4500);
}, {});

await scene('outage', async (p) => {
  await wait(p, 2500);
  await p.evaluate(() => window.scrollTo({ top: 420, behavior: 'smooth' })); await wait(p, 4500);
  await p.addStyleTag({ content: '.badge{outline:2px solid #f5b94a;outline-offset:2px}' });
  await wait(p, 3500);
}, { down: true });

await scene('portfolio', async (p) => {
  await p.evaluate(() => document.querySelector('[data-widget=heatmap]').scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(p, 4000);
  const pf = p.locator('[data-widget=portfolio]');
  await pf.scrollIntoViewIfNeeded(); await wait(p, 1500);
  for (const [sym, side, q, px] of [['AAPL', 'buy', '10', '250'], ['AAPL', 'buy', '5', '270'], ['AAPL', 'sell', '6', '285']]) {
    await pf.getByLabel('Symbol').fill(sym); await pf.getByLabel('Side').selectOption(side); await pf.getByLabel('Quantity').fill(q); await pf.getByLabel('Price').fill(px);
    await wait(p, 600); await pf.getByRole('button', { name: 'Add lot' }).click(); await wait(p, 1800);
  }
  await wait(p, 3000);
});
await b.close();
writeFileSync(`${OUT}/times.json`, JSON.stringify(times));
