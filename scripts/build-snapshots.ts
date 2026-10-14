/**
 * Builds public/data/*.json for sources a browser cannot call directly (no CORS) or that benefit from a fallback copy.
 * Runs in the scheduled GitHub Action (Node >= 22.6 with type stripping). Each source is independent: a failure keeps the previous file
 * and is recorded in meta.json, so one outage never blanks the demo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRYPTO, EQUITIES, FRED_SERIES, FX_QUOTES, NEWS_FEEDS } from '../src/universe.ts';
import { parseFredCsv } from '../src/lib/csv.ts';
import { dedupe, parseRss, type NewsItem } from '../src/lib/rss.ts';
import { parseYieldXml } from '../src/lib/treasury.ts';
import { simulateBars } from '../src/lib/simulate.ts';
import { parseStooqCsv } from '../src/lib/stooq.ts';
import { parseTwelveData } from '../src/lib/twelvedata.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const UA = 'market-desk/0.1 (educational demo; +https://github.com/alfiochoa/market-desk)';
mkdirSync(OUT, { recursive: true });

const now = new Date().toISOString();
const meta: Record<string, { ok: boolean; at: string; note: string }> = existsSync(join(OUT, 'meta.json')) ? JSON.parse(readFileSync(join(OUT, 'meta.json'), 'utf8')) : {};
const save = (name: string, obj: unknown) => writeFileSync(join(OUT, name), JSON.stringify(obj) + '\n');
const has = (name: string) => existsSync(join(OUT, name));

async function get(url: string, accept = '*/*', tries = 2): Promise<string> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
      return await r.text();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}
async function step(name: string, file: string, fn: () => Promise<string>) {
  try { const note = await fn(); meta[name] = { ok: true, at: now, note }; console.log(`ok   ${name}: ${note}`); }
  catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    meta[name] = { ok: false, at: now, note: `${msg}${has(file) ? ' (previous snapshot kept)' : ''}` };
    console.log(`FAIL ${name}: ${msg}`);
  }
}

await step('equities', 'equities.json', async () => {
  // Stooq CSV first. Stooq currently answers scripted clients with HTTP 403 or a JavaScript browser-verification page; that is an access control,
  // so we do NOT solve it. If it appears we keep the last snapshot, or write an explicitly SIMULATED placeholder on first run.
  const probe = parseStooqCsv(await get('https://stooq.com/q/d/l/?s=aapl.us&i=d', 'text/csv', 1).catch(() => ''));
  if (!probe) {
    // Optional keyed fallback: a free Twelve Data key in the TWELVE_DATA_API_KEY secret (never logged). Free tier = 8 credits/minute,
    // so we fetch 8 symbols per minute and only when the committed snapshot is older than 20 h.
    const key = process.env.TWELVE_DATA_API_KEY;
    const stale = !has('equities.json') || Date.now() - Date.parse(JSON.parse(readFileSync(join(OUT, 'equities.json'), 'utf8')).generatedAt) > 20 * 3600e3;
    if (key && stale) {
      const syms = EQUITIES.map((e) => e.symbol), bars: Record<string, ReturnType<typeof parseTwelveData>[string]> = {};
      for (let i = 0; i < syms.length; i += 8) {
        if (i) await new Promise((r) => setTimeout(r, 62000));
        const chunk = syms.slice(i, i + 8);
        Object.assign(bars, parseTwelveData(JSON.parse(await get(`https://api.twelvedata.com/time_series?symbol=${chunk.join(',')}&interval=1day&outputsize=260&apikey=${encodeURIComponent(key)}`)), chunk));
      }
      save('equities.json', { generatedAt: now, kind: 'twelvedata', source: 'Twelve Data daily (end-of-day, delayed)', symbols: EQUITIES.map((e) => ({ ...e, bars: bars[e.symbol] })) });
      return `${syms.length} symbols from Twelve Data (Stooq unavailable)`;
    }
    if (key && !stale) return 'Stooq unavailable; snapshot is fresh (<20 h), keeping it';
    if (has('equities.json')) throw new Error('Stooq did not return CSV (403 or browser-verification page; not bypassed)');
    const end = new Date().toISOString().slice(0, 10);
    save('equities.json', {
      generatedAt: now, kind: 'simulated', source: 'SIMULATED placeholder (no real equity source reachable)',
      symbols: EQUITIES.map((e, i) => ({ ...e, bars: simulateBars(1000 + i, e.px, end) })),
    });
    throw new Error('Stooq did not return CSV (403 or browser-verification page; not bypassed); wrote SIMULATED placeholder prices');
  }
  const symbols = [];
  for (const e of EQUITIES) {
    const bars = parseStooqCsv(await get(`https://stooq.com/q/d/l/?s=${e.symbol.toLowerCase()}.us&i=d`, 'text/csv'));
    if (!bars) throw new Error(`Stooq: no CSV for ${e.symbol}`);
    symbols.push({ ...e, bars: bars.slice(-260) });
    await new Promise((r) => setTimeout(r, 400));
  }
  save('equities.json', { generatedAt: now, kind: 'stooq', source: 'Stooq daily CSV (end-of-day, delayed)', symbols });
  return `${symbols.length} symbols from Stooq`;
});

await step('fred', 'fred.json', async () => {
  const series: Record<string, { label: string; obs: { date: string; value: number }[] }> = {};
  for (const s of FRED_SERIES) {
    const obs = parseFredCsv(await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${s.id}`));
    if (!obs.length) throw new Error(`FRED ${s.id}: empty`);
    series[s.id] = { label: s.label, obs: obs.slice(s.id === 'DGS10' || s.id === 'T10Y2Y' ? -520 : -180) };
  }
  save('fred.json', { generatedAt: now, source: 'FRED (St. Louis Fed) fredgraph.csv', series });
  return `${Object.keys(series).length} series`;
});

await step('treasury', 'treasury.json', async () => {
  const d = new Date();
  const months = [0, 1].map((k) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1)); return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}`; });
  const curves = [];
  for (const m of months) curves.push(...parseYieldXml(await get(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${m}`)));
  if (!curves.length) throw new Error('no curve rows');
  curves.sort((a, b) => a.date.localeCompare(b.date));
  save('treasury.json', { generatedAt: now, source: 'US Treasury daily par yield curve', curves: curves.slice(-45) });
  return `${curves.length} curve dates, latest ${curves.at(-1)!.date}`;
});

await step('news', 'news.json', async () => {
  const all: NewsItem[] = [];
  const bad: string[] = [];
  for (const f of NEWS_FEEDS) {
    try { all.push(...parseRss(await get(f.url, 'application/rss+xml, text/xml'), f.source)); } catch (e) { bad.push(`${f.source}: ${(e as Error).message}`); }
  }
  if (!all.length) throw new Error(`all feeds failed — ${bad.join('; ')}`);
  save('news.json', { generatedAt: now, source: 'Official RSS: Federal Reserve, ECB, SEC', items: dedupe(all).slice(0, 60), failed: bad });
  return `${all.length} items${bad.length ? `, failed: ${bad.join('; ')}` : ''}`;
});

await step('fx', 'fx.json', async () => {
  const start = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  const j = JSON.parse(await get(`https://api.frankfurter.dev/v1/${start}..?base=USD&symbols=${FX_QUOTES.join(',')}`));
  if (!j.rates) throw new Error('unexpected Frankfurter payload');
  save('fx.json', { generatedAt: now, source: 'Frankfurter (ECB reference rates)', base: 'USD', rates: j.rates });
  return `${Object.keys(j.rates).length} days`;
});

await step('crypto', 'crypto.json', async () => {
  const ids = CRYPTO.map((c) => c.id).join(',');
  const j = JSON.parse(await get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true&price_change_percentage=24h,7d`));
  if (!Array.isArray(j) || !j.length) throw new Error('unexpected CoinGecko payload');
  save('crypto.json', { generatedAt: now, source: 'CoinGecko public API', coins: j.map((c: Record<string, unknown>) => ({ id: c.id, symbol: String(c.symbol).toUpperCase(), name: c.name, price: c.current_price, cap: c.market_cap, ch24: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h, ch7d: c.price_change_percentage_7d_in_currency ?? null, spark: ((c.sparkline_in_7d as { price: number[] })?.price ?? []).filter((_, i) => i % 4 === 0) })) });
  return `${j.length} coins`;
});

save('meta.json', meta);
const failed = Object.entries(meta).filter(([, v]) => !v.ok).map(([k]) => k);
console.log(failed.length ? `done with failures: ${failed.join(', ')}` : 'done');
if (failed.length === Object.keys(meta).length) process.exit(1);
