import { describe, expect, it } from 'vitest';
import { bollinger, ema, macd, rsi, sma } from '../src/lib/indicators.ts';

const close = (a: number, b: number, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('sma', () => {
  it('matches hand calculation and pads warm-up with NaN', () => {
    const r = sma([1, 2, 3, 4, 5], 3);
    expect(r.slice(0, 2).every(Number.isNaN)).toBe(true);
    expect(r.slice(2)).toEqual([2, 3, 4]);
  });
});

describe('ema', () => {
  it('seeds with SMA and uses alpha = 2/(n+1)', () => {
    expect(ema([1, 2, 3, 4, 5], 3).slice(2)).toEqual([2, 3, 4]);
    const r = ema([10, 12, 11, 13], 2); // seed 11 ; k = 2/3
    close(r[1], 11);
    close(r[2], 11 * (2 / 3) + 11 * (1 / 3));
    close(r[3], 13 * (2 / 3) + r[2] * (1 / 3), 1e-9);
  });
});

describe('bollinger', () => {
  it('textbook example: mean 5, population sd 2 -> bands 1 and 9', () => {
    const b = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    expect(b.mid[7]).toBe(5);
    expect(b.upper[7]).toBeCloseTo(9, 10);
    expect(b.lower[7]).toBeCloseTo(1, 10);
  });
});

describe('rsi (Wilder)', () => {
  // Widely published worked example (StockCharts "RSI" ChartSchool, 14 periods).
  const px = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];
  it('reproduces the published reference values', () => {
    const r = rsi(px, 14);
    close(r[14], 70.53, 0.1);
    close(r[15], 66.32, 0.1);
    close(r[16], 66.55, 0.1);
    close(r[17], 69.41, 0.1);
    close(r[18], 66.36, 0.1);
    close(r[19], 57.97, 0.1);
  });
  it('is 100 for a monotonic rise and stays within [0,100]', () => {
    expect(rsi(Array.from({ length: 30 }, (_, i) => i + 1), 14)[29]).toBe(100);
    rsi(px, 5).filter((v) => !Number.isNaN(v)).forEach((v) => expect(v >= 0 && v <= 100).toBe(true));
  });
});

describe('macd', () => {
  const px = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 8 + i * 0.1);
  it('line = EMA12 - EMA26, hist = line - signal, signal starts after warm-up', () => {
    const m = macd(px);
    const e12 = ema(px, 12), e26 = ema(px, 26);
    close(m.line[40], e12[40] - e26[40], 1e-9);
    expect(Number.isNaN(m.line[24])).toBe(true);
    expect(Number.isNaN(m.line[25])).toBe(false);
    expect(Number.isNaN(m.signal[32])).toBe(true);
    expect(Number.isNaN(m.signal[33])).toBe(false); // 25 + 9 - 1
    close(m.hist[60], m.line[60] - m.signal[60], 1e-9);
  });
  it('is zero for a constant series', () => {
    const m = macd(new Array(60).fill(50));
    expect(m.line[59]).toBe(0);
    expect(m.hist[59]).toBe(0);
  });
});
