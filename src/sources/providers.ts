/** Every data source the app uses, as fallback chains. Origin APIs first, then the Action-built snapshot in /data. */
import type { Provider } from '../core/data.ts';
import { CRYPTO, EQUITIES, FX_QUOTES } from '../universe.ts';
import { parseYieldXml, type CurvePoint } from '../lib/treasury.ts';
import type { Bar } from '../lib/simulate.ts';
import { mergeIntraday, type IntradaySnap } from '../lib/intraday.ts';

export interface Coin { id: string; symbol: string; name: string; price: number; cap: number | null; ch24: number | null; ch7d: number | null; spark: number[] }
export interface Candle { t: number; o: number; h: number; l: number; c: number; v?: number }
export interface EquitySnap { generatedAt: string; kind: 'stooq' | 'twelvedata' | 'simulated'; source: string; refreshNote?: string; intraday?: { asOfIso: string; label: string; lagMin: number; symbols: string[] }; symbols: { symbol: string; name: string; sector: string; w: number; bars: Bar[] }[] }
export interface FxData { base: string; days: string[]; series: Record<string, number[]> }
export interface FredSnap { generatedAt: string; series: Record<string, { label: string; obs: { date: string; value: number }[] }> }
export interface TreasurySnap { generatedAt: string; curves: CurvePoint[] }
export interface NewsSnap { generatedAt: string; items: { title: string; link: string; published: string; source: string }[]; failed?: string[] }

const BASE = (import.meta as unknown as { env: { BASE_URL: string } }).env?.BASE_URL ?? './';
const json = async (r: Response) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
export const dataUrl = (f: string) => `${BASE}data/${f}`;

function snapshot<T, S>(file: string, label: string, map: (s: S) => { data: T; asOf: string | null; source?: string }): Provider<T> {
  return { id: `snap:${file}`, label, kind: 'snapshot', fetch: async ({ fetch, signal }) => map(await json(await fetch(dataUrl(file), { signal })) as S) };
}

/* ---------- crypto ---------- */
const CG = 'https://api.coingecko.com/api/v3';
const BN = 'https://data-api.binance.vision/api/v3';

export const cryptoBoard: Provider<Coin[]>[] = [
  {
    id: 'coingecko', label: 'CoinGecko', kind: 'live',
    fetch: async ({ fetch, signal }) => {
      const j = await json(await fetch(`${CG}/coins/markets?vs_currency=usd&ids=${CRYPTO.map((c) => c.id).join(',')}&sparkline=true&price_change_percentage=24h,7d`, { signal })) as Record<string, unknown>[];
      if (!Array.isArray(j) || !j.length) throw new Error('empty response');
      return {
        asOf: new Date().toISOString(),
        data: j.map((c) => ({
          id: String(c.id), symbol: String(c.symbol).toUpperCase(), name: String(c.name), price: Number(c.current_price), cap: (c.market_cap as number) ?? null,
          ch24: (c.price_change_percentage_24h_in_currency as number) ?? (c.price_change_percentage_24h as number) ?? null, ch7d: (c.price_change_percentage_7d_in_currency as number) ?? null,
          spark: ((c.sparkline_in_7d as { price: number[] })?.price ?? []).filter((_, i) => i % 4 === 0),
        })),
      };
    },
  },
  {
    id: 'binance', label: 'Binance', kind: 'live',
    fetch: async ({ fetch, signal }) => {
      const syms = encodeURIComponent(JSON.stringify(CRYPTO.map((c) => c.pair)));
      const tick = await json(await fetch(`${BN}/ticker/24hr?symbols=${syms}`, { signal })) as { symbol: string; lastPrice: string; priceChangePercent: string }[];
      const data = await Promise.all(CRYPTO.map(async (c) => {
        const t = tick.find((x) => x.symbol === c.pair);
        if (!t) throw new Error(`no ticker for ${c.pair}`);
        const k = await json(await fetch(`${BN}/klines?symbol=${c.pair}&interval=4h&limit=42`, { signal })) as string[][];
        return { id: c.id, symbol: c.symbol, name: c.symbol, price: Number(t.lastPrice), cap: null, ch24: Number(t.priceChangePercent), ch7d: null, spark: k.map((x) => Number(x[4])) };
      }));
      return { data, asOf: new Date().toISOString() };
    },
  },
  snapshot<Coin[], { generatedAt: string; coins: Coin[] }>('crypto.json', 'CoinGecko (Action snapshot)', (s) => ({ data: s.coins, asOf: s.generatedAt })),
];

export const CRYPTO_TF = { '15m': { iv: '15m', cg: 1 }, '1h': { iv: '1h', cg: 7 }, '4h': { iv: '4h', cg: 30 }, '1d': { iv: '1d', cg: 365 }, '1w': { iv: '1w', cg: 365 } } as const;
export type CryptoTf = keyof typeof CRYPTO_TF;

export function cryptoCandles(id: string, tf: CryptoTf): Provider<Candle[]>[] {
  const c = CRYPTO.find((x) => x.id === id)!;
  return [
    {
      id: 'binance-klines', label: 'Binance', kind: 'live',
      fetch: async ({ fetch, signal }) => {
        const k = await json(await fetch(`${BN}/klines?symbol=${c.pair}&interval=${CRYPTO_TF[tf].iv}&limit=500`, { signal })) as string[][];
        if (!k.length) throw new Error('empty response');
        return { asOf: new Date(Number(k.at(-1)![0])).toISOString(), data: k.map((x) => ({ t: Math.floor(Number(x[0]) / 1000), o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] })) };
      },
    },
    {
      id: 'coingecko-ohlc', label: 'CoinGecko OHLC (no volume)', kind: 'live',
      fetch: async ({ fetch, signal }) => {
        const k = await json(await fetch(`${CG}/coins/${c.id}/ohlc?vs_currency=usd&days=${CRYPTO_TF[tf].cg}`, { signal })) as number[][];
        if (!k.length) throw new Error('empty response');
        return { asOf: new Date(k.at(-1)![0]).toISOString(), data: k.map((x) => ({ t: Math.floor(x[0] / 1000), o: x[1], h: x[2], l: x[3], c: x[4] })) };
      },
    },
    snapshot<Candle[], { generatedAt: string; coins: Coin[] }>('crypto.json', 'CoinGecko 7d line (Action snapshot)', (s) => {
      const sp = s.coins.find((x) => x.id === id)?.spark ?? [];
      if (!sp.length) throw new Error('no sparkline in snapshot');
      const end = Math.floor(Date.parse(s.generatedAt) / 1000);
      return { asOf: s.generatedAt, data: sp.map((p, i) => ({ t: end - (sp.length - 1 - i) * 4 * 3600, o: p, h: p, l: p, c: p })) };
    }),
  ];
}

/* ---------- FX ---------- */
export const fxBoard: Provider<FxData>[] = [
  {
    id: 'frankfurter', label: 'Frankfurter (ECB reference rates)', kind: 'live',
    fetch: async ({ fetch, signal }) => {
      const start = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
      const j = await json(await fetch(`https://api.frankfurter.dev/v1/${start}..?base=USD&symbols=${FX_QUOTES.join(',')}`, { signal })) as { rates: Record<string, Record<string, number>> };
      return { data: fxFromRates(j.rates), asOf: Object.keys(j.rates).sort().at(-1) ?? null };
    },
  },
  snapshot<FxData, { generatedAt: string; rates: Record<string, Record<string, number>> }>('fx.json', 'Frankfurter (Action snapshot)', (s) => ({ data: fxFromRates(s.rates), asOf: Object.keys(s.rates).sort().at(-1) ?? null })),
];
export function fxFromRates(rates: Record<string, Record<string, number>>): FxData {
  const days = Object.keys(rates).sort();
  if (!days.length) throw new Error('no rates');
  const series: Record<string, number[]> = {};
  for (const q of FX_QUOTES) series[q] = days.map((d) => rates[d][q]).filter((v) => v !== undefined);
  return { base: 'USD', days, series };
}

/* ---------- macro ---------- */
export const treasury: Provider<TreasurySnap>[] = [
  {
    id: 'treasury-xml', label: 'US Treasury (home.treasury.gov)', kind: 'live', timeoutMs: 20000,
    fetch: async ({ fetch, signal }) => {
      const d = new Date();
      const ym = (k: number) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1)); return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };
      const curves: CurvePoint[] = [];
      const month = async (m: number) => {
        const r = await fetch(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${ym(m)}`, { signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return parseYieldXml(await r.text());
      };
      curves.push(...(await Promise.all([month(1), month(0)])).flat());
      if (!curves.length) throw new Error('no curve rows');
      return { data: { generatedAt: new Date().toISOString(), curves }, asOf: curves.at(-1)!.date };
    },
  },
  snapshot<TreasurySnap, TreasurySnap>('treasury.json', 'US Treasury (Action snapshot)', (s) => ({ data: s, asOf: s.curves.at(-1)?.date ?? null })),
];
/** FRED's fredgraph.csv sends no CORS headers, so browsers cannot read it: snapshot only. */
export const fred: Provider<FredSnap>[] = [snapshot<FredSnap, FredSnap>('fred.json', 'FRED (Action snapshot)', (s) => ({ data: s, asOf: s.generatedAt }))];

/* ---------- equities & news (snapshot only) ---------- */
const EOD_CADENCE = 'refreshes daily after US close';
export const INTRADAY_CADENCE = 'refreshes ~every 30–60 min in US market hours (best-effort)';
/** End-of-day snapshot (committed baseline) + optional intraday quotes for a priority subset (never 'live'; delayed, provisional). */
export const equities: Provider<EquitySnap>[] = [{
  id: 'snap:equities', label: 'Equities (Action snapshot)', kind: 'snapshot',
  fetch: async ({ fetch, signal }) => {
    const s = await json(await fetch(dataUrl('equities.json'), { signal })) as EquitySnap;
    const iq = await fetch(dataUrl('intraday.json'), { signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as IntradaySnap | null;
    const m = s.kind === 'twelvedata' ? mergeIntraday(s.symbols, iq && iq.quotes ? iq : null) : { symbols: s.symbols, intraday: null };
    const eodAsOf = s.symbols[0]?.bars.at(-1)?.t ?? null;
    const base = s.kind === 'simulated' ? 'SIMULATED placeholder, not market data' : 'Twelve Data';
    if (m.intraday) { const day = m.symbols.find((x) => x.bars.at(-1)?.p)!.bars.at(-1)!.t; return { data: { ...s, symbols: m.symbols, intraday: m.intraday }, asOf: `${m.intraday.label} (${day})`, source: `${base} · intraday, delayed + end-of-day · ${INTRADAY_CADENCE}` }; }
    return { data: s, asOf: eodAsOf, source: s.kind === 'simulated' ? base : `${base} · end-of-day · ${EOD_CADENCE}${s.refreshNote ? ' — last refresh failed, previous data kept' : ''}` };
  },
}];
export const news: Provider<NewsSnap>[] = [snapshot<NewsSnap, NewsSnap>('news.json', 'Fed/ECB/SEC RSS (Action snapshot)', (s) => ({ data: s, asOf: s.generatedAt }))];

export const equityNames = new Map(EQUITIES.map((e) => [e.symbol, e.name]));
