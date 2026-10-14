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
