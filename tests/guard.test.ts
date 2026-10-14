import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CEILING, GuardBlocked, HARD_STOP, MINUTE_WAIT_MS, decide, getUsage, guardedFetch, paidAllowedEvent, parseUsage } from '../src/lib/guard.ts';
import { CreditsExhausted } from '../src/lib/twelvedata.ts';

const usage = (daily: number, minute = 0) => ({ daily_usage: daily, plan_daily_limit: 800, current_usage: minute, plan_limit: 8 });
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
/** Scripted fetch double: api_usage answers come from `usages`, paid calls from `paid`. Records the calls. */
function double(usages: (unknown | Error)[], paid: (Response)[] = []) {
  const calls: string[] = [], sleeps: number[] = [];
  const f = (async (u: string) => {
    calls.push(u.includes('api_usage') ? 'usage' : 'paid');
    if (u.includes('api_usage')) { const x = usages.length > 1 ? usages.shift() : usages[0]; if (x instanceof Error) throw x; return res(x); }
    return paid.shift() ?? res({});
  }) as unknown as typeof fetch;
  return { f, calls, sleeps, sleep: async (ms: number) => { sleeps.push(ms); } };
}
const base = (d: ReturnType<typeof double>, kind: 'intraday' | 'eod', remaining: number, n = 8) => ({ fetch: d.f, sleep: d.sleep, key: 'K', kind, url: 'https://api.twelvedata.com/quote?x=1', n, remaining });

describe('thresholds (daily_usage + planned)', () => {
  it('intraday allowed up to exactly 600, blocked above', () => {
    expect(CEILING).toEqual({ intraday: 600, eod: 700 });
    expect(decide('intraday', 585, 15).ok).toBe(true);
    expect(decide('intraday', 586, 15).ok).toBe(false);
    expect(decide('intraday', 354, 15).ok).toBe(true);
  });
  it('EOD allowed up to exactly 700, blocked above', () => {
    expect(decide('eod', 670, 30).ok).toBe(true);
    expect(decide('eod', 671, 30).ok).toBe(false);
    expect(decide('eod', 600, 30).ok).toBe(true); // above the intraday ceiling but fine for the daily EOD
  });
  it('hard stop at 760 for anything automatic', () => {
    expect(HARD_STOP).toBe(760);
    expect(decide('eod', 731, 30).ok).toBe(false); // 761 > 760 (also above the 700 EOD ceiling)
    expect(decide('eod', 700, 61).ok).toBe(false);
    expect(decide('intraday', 750, 11).reason).toMatch(/hard stop|ceiling/);
  });
  it('parses api_usage and rejects a malformed payload', () => {
    expect(parseUsage(usage(354, 2))).toEqual({ daily: 354, dailyLimit: 800, minute: 2, minuteLimit: 8 });
    expect(() => parseUsage({ status: 'error' })).toThrow(/unexpected/);
  });
});

describe('guardedFetch', () => {
  it('spends nothing and fails closed when api_usage fails (network error, HTTP error, bad payload)', async () => {
    for (const bad of [new Error('boom'), { code: 401, status: 'error' }]) {
      const d = double([bad]);
      await expect(guardedFetch(base(d, 'eod', 30))).rejects.toThrow(GuardBlocked);
      expect(d.calls).toEqual(['usage']); // never a paid call
    }
    const d2 = { calls: [] as string[] }; const f = (async (u: string) => { d2.calls.push(u.includes('api_usage') ? 'usage' : 'paid'); return res({}, 500); }) as unknown as typeof fetch;
    await expect(guardedFetch({ fetch: f, sleep: async () => {}, key: 'K', kind: 'eod', url: 'https://api.twelvedata.com/x', n: 1, remaining: 1 })).rejects.toThrow(/failing closed/);
    expect(d2.calls).toEqual(['usage']);
  });
  it('blocks above the ceiling without any paid call, and the error never contains the key', async () => {
    const d = double([usage(600)]);
    const e = await guardedFetch(base(d, 'intraday', 15)).catch((x: Error) => x);
    expect(e).toBeInstanceOf(GuardBlocked); expect(d.calls).toEqual(['usage']);
    expect(String((e as Error).message)).not.toContain('K&'); expect(String((e as Error).message)).not.toMatch(/apikey/i);
  });
  it('passes through under the ceiling: one usage check, one paid call', async () => {
    const d = double([usage(354)], [res({ ok: 1 })]);
    expect(await guardedFetch(base(d, 'intraday', 15))).toEqual({ ok: 1 });
    expect(d.calls).toEqual(['usage', 'paid']);
  });
  it('waits 62 s once when the minute window is busy (sp500-tracker), re-checks, then proceeds', async () => {
    const d = double([usage(300, 7), usage(300, 0)], [res({ ok: 1 })]);
    await guardedFetch(base(d, 'eod', 8));
    expect(d.sleeps).toEqual([MINUTE_WAIT_MS]); expect(d.calls).toEqual(['usage', 'usage', 'paid']);
  });
  it('keeps old data (blocked, no paid call) if the minute stays busy', async () => {
    const d = double([usage(300, 7)]);
    await expect(guardedFetch(base(d, 'eod', 8))).rejects.toThrow(/per-minute/);
    expect(d.calls).toEqual(['usage', 'usage']);
  });
  it('429 / "run out of API credits for the current minute": retries ONCE after 62 s, then gives up', async () => {
    const d = double([usage(300)], [res({}, 429), res({ ok: 2 })]);
    expect(await guardedFetch(base(d, 'eod', 8))).toEqual({ ok: 2 }); expect(d.sleeps).toEqual([MINUTE_WAIT_MS]);
    const m = { code: 429, status: 'error', message: 'You have run out of API credits for the current minute.' };
    const d2 = double([usage(300)], [res(m), res(m), res({ never: 1 })]);
    await expect(guardedFetch(base(d2, 'eod', 8))).rejects.toThrow(CreditsExhausted);
    expect(d2.calls.filter((c) => c === 'paid').length).toBe(2); // exactly one retry, never hammering
  });
  it('getUsage calls the free /api_usage endpoint', async () => {
    const urls: string[] = [];
    await getUsage((async (u: string) => { urls.push(u); return res(usage(1)); }) as unknown as typeof fetch, 'K');
    expect(urls[0]).toMatch(/^https:\/\/api\.twelvedata\.com\/api_usage\?apikey=/);
  });
});

describe('no paid API outside scheduled/manual Action runs', () => {
  it('only schedule and workflow_dispatch may use the key', () => {
    expect(paidAllowedEvent('schedule')).toBe(true); expect(paidAllowedEvent('workflow_dispatch')).toBe(true);
    for (const e of ['push', 'pull_request', undefined, '']) expect(paidAllowedEvent(e)).toBe(false);
  });
  it('CI never has the secret and only the snapshot script talks to api.twelvedata.com', () => {
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).not.toMatch(/TWELVE|secrets\./);
    expect(readFileSync('src/sources/providers.ts', 'utf8')).not.toContain('twelvedata.com'); // the browser bundle never calls it
  });
  it('the unit-test setup blocks fetches to api.twelvedata.com', () => {
    expect(() => fetch('https://api.twelvedata.com/quote?symbol=AAPL')).toThrow(/must not call/);
  });
});
