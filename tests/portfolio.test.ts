import { describe, expect, it } from 'vitest';
import { computePositions, lotsFromCsv, lotsToCsv, totals, type Lot } from '../src/lib/portfolio.ts';

const lot = (date: string, side: 'buy' | 'sell', qty: number, price: number, fee = 0, symbol = 'AAA'): Lot => ({ id: date + side, date, symbol, side, qty, price, fee });

describe('portfolio P&L (average cost)', () => {
  it('averages buys and computes unrealized P&L', () => {
    const [p] = computePositions([lot('2026-01-01', 'buy', 10, 100), lot('2026-01-02', 'buy', 10, 120)], { AAA: 130 });
    expect(p.qty).toBe(20);
    expect(p.avgCost).toBe(110);
    expect(p.unrealized).toBe(400); // 20*130 - 2200
    expect(p.realized).toBe(0);
  });
  it('realizes P&L on sells against average cost, net of fees; keeps avg for the remainder', () => {
    const [p] = computePositions([lot('2026-01-01', 'buy', 10, 100, 5), lot('2026-01-03', 'sell', 4, 150, 2)], { AAA: 140 });
    // avg = 1005/10 = 100.5 ; realized = (150-100.5)*4 - 2 = 196
    expect(p.realized).toBeCloseTo(196, 10);
    expect(p.qty).toBe(6);
    expect(p.avgCost).toBeCloseTo(100.5, 10);
    expect(p.unrealized).toBeCloseTo(140 * 6 - 100.5 * 6, 10);
  });
  it('resets cost basis when fully closed and rejects overselling', () => {
    const [p] = computePositions([lot('2026-01-01', 'buy', 5, 10), lot('2026-01-02', 'sell', 5, 12)]);
    expect(p.qty).toBe(0); expect(p.costBasis).toBe(0); expect(p.realized).toBe(10);
    expect(() => computePositions([lot('2026-01-01', 'buy', 1, 10), lot('2026-01-02', 'sell', 2, 10)])).toThrow(/exceeds/);
  });
  it('sums totals across symbols', () => {
    const ps = computePositions([lot('2026-01-01', 'buy', 1, 10), lot('2026-01-01', 'buy', 2, 20, 0, 'BBB')], { AAA: 12, BBB: 25 });
    expect(totals(ps)).toEqual({ realized: 0, unrealized: 12, value: 62, cost: 50 });
  });
});

describe('CSV round trip', () => {
  it('exports and re-imports identical lots', () => {
    const lots = [lot('2026-01-01', 'buy', 10, 100.5, 1), lot('2026-02-01', 'sell', 3, 120)];
    const back = lotsFromCsv(lotsToCsv(lots));
    expect(back.map(({ id: _id, ...r }) => r)).toEqual(lots.map(({ id: _id, ...r }) => r));
  });
  it('rejects bad header or rows with a line number', () => {
    expect(() => lotsFromCsv('a,b\n1,2')).toThrow(/header/);
    expect(() => lotsFromCsv('date,symbol,side,qty,price,fee\n2026-01-01,AAA,hold,1,1,0')).toThrow(/row 2/);
  });
});
