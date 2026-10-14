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
