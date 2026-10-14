import { describe, expect, it, vi } from 'vitest';
import { fetchChain } from '../src/core/data.ts';
import { cryptoBoard, cryptoCandles, fxFromRates } from '../src/sources/providers.ts';
import { parseStooqCsv } from '../src/lib/stooq.ts';

const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('provider chains with mocked fetch', () => {
  it('crypto board: CoinGecko rate-limited (429) falls back to Binance, normalising both ticker and klines', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('coingecko')) return res({ error: 'rate limit' }, 429);
      if (u.includes('/ticker/24hr')) return res(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'TRXUSDT', 'LINKUSDT', 'AVAXUSDT'].map((symbol) => ({ symbol, lastPrice: '10.5', priceChangePercent: '-1.25' })));
      return res([[0, '1', '2', '0.5', '1.5', '10'], [1, '1', '2', '0.5', '1.7', '10']]);
    });
    const { result, errors } = await fetchChain(cryptoBoard, { ttlMs: 1, fetchImpl: f as never });
    expect(errors[0]).toMatch(/CoinGecko: HTTP 429/);
    expect(result.source).toMatch(/Binance/);
    expect(result.data).toHaveLength(10);
    expect(result.data[0]).toMatchObject({ symbol: 'BTC', price: 10.5, ch24: -1.25, spark: [1.5, 1.7] });
  });
  it('crypto candles: CoinGecko OHLC fallback has no volume; both live sources down uses snapshot sparkline', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('binance')) return res({}, 451);
      if (u.includes('/ohlc')) return res([[1_790_000_000_000, 1, 2, 0.5, 1.5]]);
      return res({ generatedAt: '2026-10-14T00:00:00Z', coins: [{ id: 'bitcoin', spark: [1, 2, 3] }] });
    });
    const a = await fetchChain(cryptoCandles('bitcoin', '1d'), { ttlMs: 1, fetchImpl: f as never });
    expect(a.errors[0]).toMatch(/451/); expect(a.result.data[0]).toEqual({ t: 1_790_000_000, o: 1, h: 2, l: 0.5, c: 1.5 });
    const g = vi.fn(async (url: string | URL | Request) => (String(url).includes('/data/') ? res({ generatedAt: '2026-10-14T00:00:00Z', coins: [{ id: 'bitcoin', spark: [1, 2, 3] }] }) : res({}, 503)));
    const b = await fetchChain(cryptoCandles('bitcoin', '1d'), { ttlMs: 1, fetchImpl: g as never });
    expect(b.result.kind).toBe('snapshot'); expect(b.result.data.map((c) => c.c)).toEqual([1, 2, 3]);
  });
  it('fx series are derived per quote currency in date order', () => {
    const d = fxFromRates({ '2026-10-02': { EUR: 0.91 }, '2026-10-01': { EUR: 0.9 } });
    expect(d.days).toEqual(['2026-10-01', '2026-10-02']); expect(d.series.EUR).toEqual([0.9, 0.91]);
    expect(() => fxFromRates({})).toThrow();
  });
});

describe('Stooq CSV parser', () => {
  it('parses a CSV body and rejects HTML challenge pages', () => {
    expect(parseStooqCsv('Date,Open,High,Low,Close,Volume\n2026-10-13,1,2,0.5,1.5,100\n')).toEqual([{ t: '2026-10-13', o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }]);
    expect(parseStooqCsv('<!DOCTYPE html><html>verify</html>')).toBeNull();
    expect(parseStooqCsv('Date,Open,High,Low,Close,Volume\n')).toBeNull();
  });
});

import { parseTwelveData } from '../src/lib/twelvedata.ts';
describe('Twelve Data parser (optional keyed fallback)', () => {
  const v = (d: string, c: string) => ({ datetime: d, open: '1', high: '3', low: '0.5', close: c, volume: '10' });
  it('handles batch and single-symbol shapes, reverses to oldest-first', () => {
    const b = parseTwelveData({ AAPL: { status: 'ok', values: [v('2026-10-13', '2'), v('2026-10-12', '1.5')] }, MSFT: { status: 'ok', values: [v('2026-10-13', '9')] } }, ['AAPL', 'MSFT']);
    expect(b.AAPL.map((x) => x.t)).toEqual(['2026-10-12', '2026-10-13']); expect(b.MSFT[0].c).toBe(9);
    expect(parseTwelveData({ values: [v('2026-10-13', '2')] }, ['AAPL']).AAPL[0].c).toBe(2);
  });
  it('throws on per-symbol errors', () => {
    expect(() => parseTwelveData({ AAPL: { status: 'error', message: 'limit' } }, ['AAPL'])).toThrow(/limit/);
  });
});

import { dropIncompleteBar, CreditsExhausted, MAX_CREDITS_PER_RUN, lastTradingDay, parseTwelveDataPartial, planFetch } from '../src/lib/twelvedata.ts';
describe('Twelve Data credit budget', () => {
  it('caps a run at 40 credits (key is shared; 800/day total)', () => {
    expect(MAX_CREDITS_PER_RUN).toBe(40);
    const many = Array.from({ length: 100 }, (_, i) => `S${i}`);
    expect(planFetch(many, {}, new Date('2026-10-14T23:30:00Z')).length).toBe(MAX_CREDITS_PER_RUN);
  });
  it('finds the last US trading day (weekends, before/after the daily cut-off)', () => {
    expect(lastTradingDay(new Date('2026-10-14T23:30:00Z'))).toBe('2026-10-14'); // Wed after close
    expect(lastTradingDay(new Date('2026-10-14T08:00:00Z'))).toBe('2026-10-13'); // Wed morning -> Tue
    expect(lastTradingDay(new Date('2026-10-17T12:00:00Z'))).toBe('2026-10-16'); // Sat -> Fri
    expect(lastTradingDay(new Date('2026-10-19T08:00:00Z'))).toBe('2026-10-16'); // Mon morning -> Fri
  });
  it('fetches only missing or outdated symbols, never the fresh ones', () => {
    const now = new Date('2026-10-14T23:30:00Z');
    expect(planFetch(['A', 'B', 'C'], { A: '2026-10-14', B: '2026-10-13' }, now)).toEqual(['B', 'C']);
    expect(planFetch(['A', 'B'], { A: '2026-10-14', B: '2026-10-14' }, now)).toEqual([]);
  });
  it('treats 429 / "run out of API credits" as exhaustion, not as a data error', () => {
    expect(() => parseTwelveDataPartial({ code: 429, status: 'error', message: 'You have run out of API credits for the day.' }, ['A'])).toThrow(CreditsExhausted);
    expect(() => parseTwelveDataPartial({ A: { code: 429, status: 'error', message: 'rate limit' } }, ['A'])).toThrow(CreditsExhausted);
    const r = parseTwelveDataPartial({ A: { status: 'error', message: 'bad symbol' }, B: { status: 'ok', values: [{ datetime: '2026-10-14', open: '1', high: '2', low: '1', close: '2', volume: '3' }] } }, ['A', 'B']);
    expect(Object.keys(r.bars)).toEqual(['B']); expect(r.errors.length).toBe(1);
  });
});

describe('end-of-day only', () => {
  const b = (t: string) => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1 });
  it('drops the in-progress session bar, keeps closed ones', () => {
    expect(dropIncompleteBar([b('2026-10-13'), b('2026-10-14')], new Date('2026-10-14T17:24:00Z')).length).toBe(1);
    expect(dropIncompleteBar([b('2026-10-13'), b('2026-10-14')], new Date('2026-10-14T23:25:00Z')).length).toBe(2);
  });
});
