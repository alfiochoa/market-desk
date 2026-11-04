/** Period returns over daily close series. Pure functions, no I/O. */
export interface ClosePoint { t: string; c: number }
export type PeriodId = '1D' | '5D' | '1M' | '6M' | '1Y' | '2Y'
export const PERIODS: PeriodId[] = ['1D', '5D', '1M', '6M', '1Y', '2Y'];

/** ISO date `months` months (or `years` years) before `iso`, clamped by Date (e.g. Mar 31 - 1M = Mar 03 is fine: only used as an upper bound). */
function back(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - months, d)).toISOString().slice(0, 10);
}

/** Simple return from the latest close to the period's base close, or null when the series does not reach back that far.
 * 1D/5D count trading sessions; 1M/6M/1Y/2Y use calendar dates (last close on or before that date). */
export function periodReturn(bars: ClosePoint[], period: PeriodId): number | null {
  const last = bars.at(-1);
  if (!last) return null;
  let base: ClosePoint | undefined;
  if (period === '1D' || period === '5D') {
    base = bars[bars.length - 1 - (period === '1D' ? 1 : 5)];
  } else {
    const target = back(last.t, { '1M': 1, '6M': 6, '1Y': 12, '2Y': 24 }[period]);
    if (bars[0] && bars[0].t > target) return null; // series starts after the base date
    for (let i = bars.length - 1; i >= 0; i--) if (bars[i].t <= target) { base = bars[i]; break; }
  }
  return base && base.c > 0 ? last.c / base.c - 1 : null;
}

/** Weight-averaged return; null when any weighted component is missing (a partial sum would misstate the portfolio). */
export function weightedReturn(parts: { weight: number; r: number | null }[]): number | null {
  const used = parts.filter((p) => p.weight > 0);
  const total = used.reduce((s, p) => s + p.weight, 0);
  if (!total || used.some((p) => p.r === null)) return null;
  return used.reduce((s, p) => s + p.weight * p.r!, 0) / total;
}

/** Converts USD closes to EUR with ECB daily reference rates (EUR per USD), carrying the last known rate over market holidays.
 * Bars before the first available rate are dropped. Used by the snapshot build. */
export function toEur(bars: ClosePoint[], rates: Record<string, number>): ClosePoint[] {
  const dates = Object.keys(rates).sort();
  let i = -1;
  const out: ClosePoint[] = [];
  for (const b of [...bars].sort((a, x) => a.t.localeCompare(x.t))) {
    while (i + 1 < dates.length && dates[i + 1] <= b.t) i++;
    if (i >= 0) out.push({ t: b.t, c: b.c * rates[dates[i]] });
  }
  return out;
}
