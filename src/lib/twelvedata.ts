import type { Bar } from './simulate.ts';
/** Parses a Twelve Data `time_series` batch response ({SYM: {values:[...]}}) or single-symbol response; values arrive newest-first. */
export function parseTwelveData(json: unknown, symbols: string[]): Record<string, Bar[]> {
  const j = json as Record<string, unknown>;
  const bySym: Record<string, unknown> = symbols.length === 1 && 'values' in j ? { [symbols[0]]: j } : j;
  const out: Record<string, Bar[]> = {};
  for (const s of symbols) {
    const e = bySym[s] as { status?: string; message?: string; values?: Record<string, string>[] } | undefined;
    if (!e || e.status === 'error' || !Array.isArray(e.values)) throw new Error(`Twelve Data ${s}: ${e?.message ?? 'missing'}`);
    out[s] = e.values.map((v) => ({ t: v.datetime.slice(0, 10), o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: +(v.volume || 0) })).reverse();
  }
  return out;
}

/** Hard cap on Twelve Data credits (1 credit per symbol) in a single run. The key is shared with other projects (800/day free). */
export const MAX_CREDITS_PER_RUN = 40;

/** Most recent US trading day (weekday, no holiday calendar) whose end-of-day bar should exist at `now`: data is considered final from 22:00 UTC. */
export function lastTradingDay(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (now.getUTCHours() < 22) d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Symbols that must be fetched: missing, or whose last bar is older than the last trading day. Never more than `cap`. */
export function planFetch(symbols: string[], lastBar: Record<string, string | undefined>, now: Date, cap = MAX_CREDITS_PER_RUN): string[] {
  const want = lastTradingDay(now);
  return symbols.filter((s) => !lastBar[s] || lastBar[s]! < want).slice(0, cap);
}

export class CreditsExhausted extends Error {}

/** True for Twelve Data's rate/credit-limit signals (HTTP 429, or a 200 body with code 429 / "run out of API credits"). */
export function isCreditError(x: unknown): boolean {
  const j = x as { code?: number; status?: string; message?: string } | null;
  return !!j && (j.code === 429 || (j.status === 'error' && /run out of api credits|api credits|rate limit/i.test(j.message ?? '')));
}

/** Tolerant batch parse: returns the symbols that parsed, plus per-symbol errors. Throws CreditsExhausted on a credit/429 signal. */
export function parseTwelveDataPartial(json: unknown, symbols: string[]): { bars: Record<string, Bar[]>; errors: string[] } {
  if (isCreditError(json)) throw new CreditsExhausted((json as { message?: string }).message ?? 'HTTP 429');
  const bars: Record<string, Bar[]> = {}, errors: string[] = [];
  for (const s of symbols) {
    const j = json as Record<string, unknown>;
    const e = (symbols.length === 1 && 'values' in j ? j : j[s]) as { code?: number; status?: string; message?: string; values?: unknown[] } | undefined;
    if (isCreditError(e)) throw new CreditsExhausted(e!.message ?? 'HTTP 429');
    try { Object.assign(bars, parseTwelveData(symbols.length === 1 ? j : { [s]: e }, [s])); } catch (err) { errors.push((err as Error).message); }
  }
  return { bars, errors };
}

/** Drops a trailing bar of a session that has not closed yet at `now` (the API returns the in-progress day); keeps snapshots strictly end-of-day. */
export function dropIncompleteBar(bars: Bar[], now: Date): Bar[] {
  const last = bars.at(-1);
  return last && Date.parse(`${last.t}T22:00:00Z`) > now.getTime() ? bars.slice(0, -1) : bars;
}
