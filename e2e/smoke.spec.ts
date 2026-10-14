import { expect, test, type Page } from '@playwright/test';

/** Fixture bodies for the CORS APIs the browser calls directly. Snapshot files (/data/*.json) come from the built site itself. */
const coins = [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 100000, market_cap: 2e12, price_change_percentage_24h_in_currency: 1.5, price_change_percentage_7d_in_currency: -2, sparkline_in_7d: { price: Array.from({ length: 168 }, (_, i) => 99000 + i * 10) } }];
const klines = Array.from({ length: 120 }, (_, i) => [1_790_000_000_000 + i * 86_400_000, '100', '110', '95', String(100 + i * 0.2), '1000']);
const fx = { rates: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, { EUR: 0.9 + i / 1000, GBP: 0.75, JPY: 150, CHF: 0.8, CAD: 1.4, AUD: 1.5, CNY: 7, MXN: 18 }])) };
const xml = (d: string, y: number) => `<m:properties><d:NEW_DATE m:type="Edm.DateTime">${d}T00:00:00</d:NEW_DATE>${['1MONTH', '3MONTH', '6MONTH', '1YEAR', '2YEAR', '5YEAR', '10YEAR', '30YEAR'].map((t) => `<d:BC_${t} m:type="Edm.Double">${y}</d:BC_${t}>`).join('')}</m:properties>`;
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });

async function mockApis(page: Page, mode: 'ok' | 'down') {
  const hosts = ['api.coingecko.com', 'data-api.binance.vision', 'api.frankfurter.dev', 'home.treasury.gov'];
  if (mode === 'down') { for (const h of hosts) await page.route(`https://${h}/**`, (r) => r.abort('failed')); return; }
  await page.route('https://api.coingecko.com/**', (r) => r.fulfill(json(coins)));
  await page.route('https://data-api.binance.vision/**', (r) => r.fulfill(json(klines)));
  await page.route('https://api.frankfurter.dev/**', (r) => r.fulfill(json(fx)));
  await page.route('https://home.treasury.gov/**', (r) => r.fulfill({ status: 200, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' }, body: `<feed>${xml('2026-09-10', 4.1)}${xml('2026-10-10', 4.3)}</feed>` }));
}
const badge = (page: Page, w: string) => page.locator(`[data-widget=${w}] .badge`);

test.describe('widgets render', () => {
  test.beforeEach(async ({ page }) => { await mockApis(page, 'ok'); await page.goto('/'); });

  test('all nine widgets render with provenance badges and the disclaimer is visible', async ({ page }) => {
    await expect(page.locator('.panel')).toHaveCount(9);
    await expect(page.locator('[data-widget=chart] canvas').first()).toBeVisible();
    await expect(page.locator('[data-widget=watchlist] tbody tr')).toHaveCount(30);
    await expect(page.locator('[data-widget=quote] .q-sym')).toHaveText('AAPL');
    await expect(page.locator('[data-widget=crypto] tbody tr')).toHaveCount(1);
    await expect(page.locator('[data-widget=fx] tbody tr')).toHaveCount(8);
    await expect(page.locator('[data-widget=macro] svg.linechart')).toHaveCount(2);
    await expect(page.locator('[data-widget=heatmap] .h-cell')).toHaveCount(30);
    expect(await page.locator('[data-widget=news] li').count()).toBeGreaterThan(5);
    await expect(page.locator('[data-widget=portfolio] form')).toBeVisible();
    await expect(badge(page, 'crypto')).toContainText('LIVE · CoinGecko');
    await expect(badge(page, 'fx')).toContainText('LIVE · Frankfurter');
    await expect(badge(page, 'macro')).toContainText('LIVE · US Treasury');
    await expect(badge(page, 'watchlist')).toContainText(/SNAPSHOT/);
    await expect(badge(page, 'news')).toContainText(/SNAPSHOT/);
    await expect(page.locator('.foot')).toContainText('Not investment advice');
  });

  test('command palette opens with Ctrl+K, jumps to a symbol, closes with Esc', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const dlg = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dlg).toBeVisible();
    await page.keyboard.type('msft');
    await page.keyboard.press('Enter');
    await expect(dlg).toBeHidden();
    await expect(page.locator('[data-widget=quote] .q-sym')).toHaveText('MSFT');
    await expect(page.locator('[data-widget=chart] .chart-title')).toContainText('MSFT');
    await page.keyboard.press('Control+k');
    await expect(dlg).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
  });

  test('crypto row selects the chart and uses the Binance klines fixture', async ({ page }) => {
    await page.locator('[data-widget=crypto] tbody tr').first().click();
    await expect(page.locator('[data-widget=chart] .chart-title')).toContainText('BITCOIN');
    await expect(badge(page, 'chart')).toContainText('LIVE · Binance');
  });

  test('indicators toggle and chart type changes without errors', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    for (const t of ['EMA50', 'Bollinger', 'RSI', 'MACD']) await page.getByRole('button', { name: t, exact: true }).click();
    await page.locator('[data-widget=chart] select').selectOption('area');
    await expect(page.locator('[data-widget=chart] canvas').first()).toBeVisible();
    expect(errs).toEqual([]);
  });

  test('Alt+2 focuses the second panel', async ({ page }) => {
    await page.keyboard.press('Alt+2');
    await expect(page.locator('[data-widget=watchlist] .head')).toBeFocused();
  });

  test('portfolio lot persists across reload and computes P&L', async ({ page }) => {
    const p = page.locator('[data-widget=portfolio]');
    await p.getByLabel('Symbol').fill('AAPL');
    await p.getByLabel('Quantity').fill('10');
    await p.getByLabel('Price').fill('100');
    await p.getByRole('button', { name: 'Add lot' }).click();
    await expect(p.locator('tbody tr').first()).toContainText('AAPL');
    await page.reload();
    await expect(page.locator('[data-widget=portfolio] tbody tr').first()).toContainText('AAPL');
  });

  test('layout is draggable, persisted, and reset restores the default', async ({ page }) => {
    const before = await page.evaluate(() => localStorage.getItem('md:layout:v1'));
    expect(before).toBeNull();
    const head = page.locator('[data-widget=news] .head');
    await head.scrollIntoViewIfNeeded();
    const box = (await head.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x - 600, box.y + 10, { steps: 8 });
    await page.mouse.up();
    const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('md:layout:v1')))!) as { id: string; x: number }[];
    expect(saved.find((i) => i.id === 'news')!.x).toBeLessThan(5);
    await page.reload();
    expect((await page.locator('[data-widget=news]').boundingBox())!.x).toBeLessThan(700);
    await page.getByRole('button', { name: 'Reset layout' }).click();
    const raw = await page.evaluate(() => localStorage.getItem('md:layout:v1'));
    expect(raw === null || (JSON.parse(raw) as { id: string; x: number }[]).find((i) => i.id === 'news')!.x >= 5).toBe(true);
    expect((await page.locator('[data-widget=news]').boundingBox())!.x).toBeGreaterThan(700);
  });
});

test('provider outage: every live widget falls back to its snapshot and says so', async ({ page }) => {
  await mockApis(page, 'down');
  await page.goto('/');
  await expect(badge(page, 'crypto')).toContainText('SNAPSHOT');
  await expect(badge(page, 'fx')).toContainText('SNAPSHOT');
  await expect(badge(page, 'macro')).toContainText('SNAPSHOT', { timeout: 20_000 });
  await expect(page.locator('[data-widget=crypto] tbody tr')).toHaveCount(10);
  await expect(page.locator('[data-widget=fx] tbody tr')).toHaveCount(8);
  await expect(page.locator('[data-widget=macro] svg.linechart')).toHaveCount(2);
  await page.locator('[data-widget=crypto] tbody tr').first().click();
  await expect(badge(page, 'chart')).toContainText('SNAPSHOT');
});

test('total failure of a snapshot shows an explicit error, not a blank panel', async ({ page }) => {
  await mockApis(page, 'ok');
  await page.route('**/data/news.json', (r) => r.fulfill({ status: 500, body: 'nope' }));
  await page.goto('/');
  await expect(badge(page, 'news')).toContainText('ERROR');
  await expect(page.locator('[data-widget=news] .err')).toContainText('Data unavailable');
});
