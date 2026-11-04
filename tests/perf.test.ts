import { describe, expect, it } from 'vitest';
import { periodReturn, toEur, weightedReturn, type ClosePoint } from '../src/lib/perf.ts';

/** Daily weekday closes from 2024-01-01, drifting +0.1 per session from 100. */
const bars: ClosePoint[] = [];
{
  let c = 100;
  const d = new Date(Date.UTC(2024, 0, 1));
  while (bars.length < 540) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) bars.push({ t: d.toISOString().slice(0, 10), c: (c += 0.1) });
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

describe('periodReturn', () => {
  it('1D and 5D count trading sessions', () => {
    const last = bars.at(-1)!.c;
    expect(periodReturn(bars, '1D')).toBeCloseTo(last / bars.at(-2)!.c - 1, 12);
    expect(periodReturn(bars, '5D')).toBeCloseTo(last / bars.at(-6)!.c - 1, 12);
  });
  it('1M uses the last close on or before the calendar date', () => {
    const last = bars.at(-1)!;
    const [y, m, dd] = last.t.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 2, dd)).toISOString().slice(0, 10);
    const base = [...bars].reverse().find((b) => b.t <= target)!;
    expect(periodReturn(bars, '1M')).toBeCloseTo(last.c / base.c - 1, 12);
  });
  it('returns null when the series does not reach back far enough', () => {
    const last = bars.at(-1)!;
    const [y, m, dd] = last.t.split('-').map(Number);
    const t2y = new Date(Date.UTC(y - 2, m - 1, dd)).toISOString().slice(0, 10);
    const base2y = [...bars].reverse().find((b) => b.t <= t2y)!;
    expect(periodReturn(bars, '2Y')).toBeCloseTo(last.c / base2y.c - 1, 12); // 540 sessions ≈ 2.07y: just enough
    expect(periodReturn(bars.slice(-200), '1Y')).toBeNull();
    expect(periodReturn([], '1D')).toBeNull();
    expect(periodReturn(bars.slice(-1), '1D')).toBeNull();
  });
});

describe('weightedReturn', () => {
  it('weight-averages and normalizes', () => {
    expect(weightedReturn([{ weight: 3, r: 0.1 }, { weight: 1, r: -0.1 }])).toBeCloseTo(0.05, 12);
  });
  it('is null when a weighted component is missing or weights are zero', () => {
    expect(weightedReturn([{ weight: 1, r: 0.1 }, { weight: 1, r: null }])).toBeNull();
    expect(weightedReturn([{ weight: 0, r: null }, { weight: 1, r: 0.2 }])).toBeCloseTo(0.2, 12); // zero-weight nulls are ignored
    expect(weightedReturn([{ weight: 0, r: 0.1 }])).toBeNull();
  });
});

describe('toEur', () => {
  it('converts with the latest rate on or before each bar and drops bars before the first rate', () => {
    const rates = { '2024-01-02': 0.9, '2024-01-04': 0.95 };
    const out = toEur([{ t: '2024-01-01', c: 100 }, { t: '2024-01-02', c: 100 }, { t: '2024-01-03', c: 100 }, { t: '2024-01-05', c: 100 }], rates);
    expect(out).toEqual([{ t: '2024-01-02', c: 90 }, { t: '2024-01-03', c: 90 }, { t: '2024-01-05', c: 95 }]);
  });
});
