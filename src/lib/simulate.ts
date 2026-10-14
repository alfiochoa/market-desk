/** Deterministic synthetic daily bars used ONLY as a clearly-labelled placeholder when no real equity source is reachable. */
export interface Bar { t: string; o: number; h: number; l: number; c: number; v: number; /** provisional intraday bar (not an official daily close) */ p?: boolean }

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function businessDays(end: string, n: number): string[] {
  const days: string[] = [];
  const d = new Date(end + 'T00:00:00Z');
  while (days.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days;
}

export function simulateBars(seed: number, start: number, end: string, n = 260): Bar[] {
  const r = rng(seed);
  let px = start;
  return businessDays(end, n).map((t) => {
    const o = px;
    const c = o * (1 + (r() - 0.48) * 0.03);
    const h = Math.max(o, c) * (1 + r() * 0.008);
    const l = Math.min(o, c) * (1 - r() * 0.008);
    px = c;
    return { t, o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2), v: Math.round(2e6 + r() * 8e6) };
  });
}
