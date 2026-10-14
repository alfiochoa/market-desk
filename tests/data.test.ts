import { describe, expect, it, vi } from 'vitest';
import { fetchChain, loadSWR, type KV, type Provider, type Result } from '../src/core/data.ts';

const mem = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }; };
const prov = (id: string, kind: 'live' | 'snapshot', fn: () => Promise<{ data: number; asOf: string | null }>): Provider<number> => ({ id, label: id, kind, fetch: fn });
const ok = (n: number) => async () => ({ data: n, asOf: '2026-10-13' });
const bad = (msg: string) => async () => { throw new Error(msg); };

describe('fetchChain', () => {
  it('falls through failed providers in order and records errors', async () => {
    const { result, errors } = await fetchChain([prov('a', 'live', bad('HTTP 429')), prov('b', 'live', bad('timeout')), prov('c', 'snapshot', ok(3))], { ttlMs: 1 });
    expect(result.data).toBe(3); expect(result.kind).toBe('snapshot');
    expect(errors).toEqual(['a: HTTP 429', 'b: timeout']);
  });
  it('throws a combined error when everything fails', async () => {
    await expect(fetchChain([prov('a', 'live', bad('x')), prov('b', 'snapshot', bad('y'))], { ttlMs: 1 })).rejects.toThrow(/All sources failed.*a: x.*b: y/);
  });
  it('aborts a hung provider after the timeout and moves on', async () => {
    const hang = prov('hang', 'live', () => new Promise(() => {}));
    const slow: Provider<number> = { id: 'h', label: 'h', kind: 'live', fetch: ({ signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))) };
    const { errors, result } = await fetchChain([slow, prov('c', 'snapshot', ok(1))], { ttlMs: 1, timeoutMs: 20 });
    expect(errors[0]).toMatch(/aborted/); expect(result.data).toBe(1); void hang;
  });
  it('passes the injected (mocked) fetch to providers', async () => {
    const f = vi.fn(async () => new Response('{"v":7}'));
    const p: Provider<number> = { id: 'j', label: 'j', kind: 'live', fetch: async ({ fetch }) => ({ data: (await (await fetch('https://x.test')).json()).v, asOf: null }) };
    const { result } = await fetchChain([p], { ttlMs: 1, fetchImpl: f as never });
    expect(result.data).toBe(7); expect(f).toHaveBeenCalledOnce();
  });
});

describe('loadSWR', () => {
  const run = async (providers: Provider<number>[], storage: KV, now: number) => {
    const got: Result<number>[] = []; let err: Error | null = null;
    await loadSWR('k', providers, { ttlMs: 1000, storage, now: () => now }, (r) => got.push(r), (e) => { err = e; });
    return { got, err: err as Error | null };
  };
  it('fresh fetch stores to cache and reports live', async () => {
    const s = mem();
    const { got } = await run([prov('a', 'live', ok(1))], s, 0);
    expect(got).toHaveLength(1); expect(got[0].status).toBe('live'); expect(s.m.size).toBe(1);
  });
  it('fresh cache hit: no network at all, status cached', async () => {
    const s = mem(); await run([prov('a', 'live', ok(1))], s, 0);
    const spy = vi.fn(ok(2));
    const { got } = await run([prov('a', 'live', spy)], s, 500);
    expect(spy).not.toHaveBeenCalled(); expect(got.map((g) => g.status)).toEqual(['cached']); expect(got[0].data).toBe(1);
  });
  it('stale cache: serves stale first, then the revalidated value', async () => {
    const s = mem(); await run([prov('a', 'live', ok(1))], s, 0);
    const { got } = await run([prov('a', 'live', ok(2))], s, 5000);
    expect(got.map((g) => [g.status, g.data])).toEqual([['cached', 1], ['live', 2]]);
  });
  it('outage with stale cache keeps data and says why; outage without cache errors', async () => {
    const s = mem(); await run([prov('a', 'live', ok(1))], s, 0);
    const down = await run([prov('a', 'live', bad('HTTP 503'))], s, 5000);
    expect(down.err).toBeNull(); expect(down.got.at(-1)?.note).toMatch(/refresh failed.*503/); expect(down.got.at(-1)?.data).toBe(1);
    const cold = await run([prov('a', 'live', bad('HTTP 503'))], mem(), 0);
    expect(cold.got).toHaveLength(0); expect(cold.err?.message).toMatch(/503/);
  });
  it('survives corrupt cache entries and throwing storage', async () => {
    const s = mem(); s.m.set('md:cache:k', '{not json');
    expect((await run([prov('a', 'live', ok(4))], s, 0)).got[0].data).toBe(4);
    const broken: KV = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    expect((await run([prov('a', 'live', ok(5))], broken, 0)).got[0].data).toBe(5);
  });
});
