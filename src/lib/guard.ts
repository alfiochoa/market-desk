import { CreditsExhausted, isCreditError } from './twelvedata.ts';

/** Account-wide Twelve Data guard. The key is shared with another project (800 credits/day, 8/min), so every paid call is preceded by the FREE /api_usage. */
export const DAILY_LIMIT = 800;
export const CEILING = { intraday: 600, eod: 700 } as const;  // daily_usage + planned must stay <= ceiling
export const HARD_STOP = 760;                                   // nothing automatic above this (reserve for manual runs)
export const MINUTE_WAIT_MS = 62_000;

export interface Usage { daily: number; dailyLimit: number; minute: number; minuteLimit: number }
export class GuardBlocked extends Error {}

export function parseUsage(j: unknown): Usage {
  const o = j as Record<string, unknown> | null;
  const n = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  const u = { daily: n(o?.daily_usage), dailyLimit: n(o?.plan_daily_limit), minute: n(o?.current_usage), minuteLimit: n(o?.plan_limit) };
  if (![u.daily, u.dailyLimit, u.minute].every(Number.isFinite)) throw new Error('api_usage: unexpected payload');
  return { ...u, minuteLimit: Number.isFinite(u.minuteLimit) ? u.minuteLimit : 8 };
}

/** Pure threshold rule. */
export function decide(kind: keyof typeof CEILING, daily: number, planned: number): { ok: boolean; reason: string } {
  const after = daily + planned;
  if (after > HARD_STOP) return { ok: false, reason: `hard stop: ${daily} used + ${planned} planned > ${HARD_STOP}` };
  if (after > CEILING[kind]) return { ok: false, reason: `${kind} ceiling: ${daily} used + ${planned} planned > ${CEILING[kind]}` };
  return { ok: true, reason: 'ok' };
}

type F = typeof fetch;
export async function getUsage(f: F, key: string, signal?: AbortSignal): Promise<Usage> {
  const r = await f(`https://api.twelvedata.com/api_usage?apikey=${encodeURIComponent(key)}`, { signal });
  if (!r.ok) throw new Error(`api_usage HTTP ${r.status}`);
  return parseUsage(await r.json());
}

export interface GuardOpts { fetch: F; sleep: (ms: number) => Promise<void>; key: string; kind: keyof typeof CEILING; url: string; n: number; remaining: number; headers?: Record<string, string>; onUsage?: (u: Usage) => void }
/** One paid call: usage check (fail closed), thresholds, per-minute room (wait once), 429 -> retry once after 62 s, else CreditsExhausted. */
export async function guardedFetch(o: GuardOpts): Promise<unknown> {
  let u: Usage;
  try { u = await getUsage(o.fetch, o.key, AbortSignal.timeout(20000)); } catch (e) { throw new GuardBlocked(`api_usage unavailable (${(e as Error).message}); failing closed, no credits spent`); }
  o.onUsage?.(u);
  const d = decide(o.kind, u.daily, o.remaining);
  if (!d.ok) throw new GuardBlocked(d.reason);
  if (u.minute + o.n > u.minuteLimit) {
    await o.sleep(MINUTE_WAIT_MS);
    try { u = await getUsage(o.fetch, o.key, AbortSignal.timeout(20000)); } catch (e) { throw new GuardBlocked(`api_usage unavailable (${(e as Error).message}); failing closed`); }
    if (u.minute + o.n > u.minuteLimit) throw new GuardBlocked(`per-minute limit busy (${u.minute}+${o.n} > ${u.minuteLimit}); keeping old data`);
  }
  for (let attempt = 0; ; attempt++) {
    const r = await o.fetch(o.url, { headers: o.headers, signal: AbortSignal.timeout(45000) });
    let body: unknown = null;
    if (r.status !== 429) { if (!r.ok) throw new Error(`HTTP ${r.status} from api.twelvedata.com`); body = await r.json(); }
    if (r.status === 429 || isCreditError(body)) {
      if (attempt === 0) { await o.sleep(MINUTE_WAIT_MS); continue; }
      throw new CreditsExhausted(r.status === 429 ? 'HTTP 429' : ((body as { message?: string }).message ?? '429'));
    }
    return body;
  }
}

/** Paid calls are only ever allowed from scheduled or manually dispatched Action runs; pushes, PRs, CI and local runs never get the key. */
export const paidAllowedEvent = (e: string | undefined) => e === 'schedule' || e === 'workflow_dispatch';
