import { describe, expect, it } from 'vitest';
import { groupWeights, HOLDINGS, totalWeight } from '../src/lib/holdings.ts';

describe('holdings (distribucion_agregada_cartera.xlsx export)', () => {
  it('weights sum to exactly the invested total (1)', () => {
    expect(totalWeight()).toBeCloseTo(1, 10);
  });
  it('every holding has a positive weight and a fund name', () => {
    for (const h of HOLDINGS) { expect(h.weight).toBeGreaterThan(0); expect(h.fund).toMatch(/Vanguard/); }
  });
  it('splits into ~90/10 equities vs bonds', () => {
    const g = groupWeights();
    expect(g.Equities + g.Bonds).toBeCloseTo(1, 10);
    expect(g.Equities).toBeGreaterThan(0.9);
    expect(g.Bonds).toBeLessThan(0.1);
  });
});
