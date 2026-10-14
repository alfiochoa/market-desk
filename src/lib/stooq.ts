import type { Bar } from './simulate.ts';
/** Parses a Stooq daily CSV (Date,Open,High,Low,Close,Volume). Returns null when the body is not CSV (e.g. a browser-verification page). */
export function parseStooqCsv(text: string): Bar[] | null {
  const rows = text.trim().split(/\r?\n/);
  if (!/^date,open,high,low,close/i.test(rows[0] ?? '')) return null;
  const bars = rows.slice(1).map((r) => r.split(',')).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c[0])).map((c) => ({ t: c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +(c[5] || 0) }));
  return bars.every((b) => [b.o, b.h, b.l, b.c].every(Number.isFinite)) && bars.length ? bars : null;
}
