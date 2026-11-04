/** My aggregated fund allocation, exported from distribucion_agregada_cartera.xlsx (target weights, sum = 1). Pure data + math, no I/O. */
export interface Holding { assetClass: string; fund: string; weight: number; group: 'Equities' | 'Bonds' }

export const HOLDINGS_AS_OF = '2026-11-04';
export const HOLDINGS: Holding[] = [
  { assetClass: 'US equities', fund: 'Vanguard US 500 Stock Index Euro - Institutional Plus', weight: 0.3983588675690416, group: 'Equities' },
  { assetClass: 'European equities', fund: 'Vanguard European Stock Index Euro - Institutional Plus', weight: 0.24799196787148595, group: 'Equities' },
  { assetClass: 'Emerging-market equities', fund: 'Vanguard Emerging Markets Stock Index Euro - Institutional Plus', weight: 0.09299543854430066, group: 'Equities' },
  { assetClass: 'Global small-cap equities', fund: 'Vanguard Global Small Cap Index Euro - Institutional Plus', weight: 0.09042342208339531, group: 'Equities' },
  { assetClass: 'Japan equities', fund: 'Vanguard Japan Stock Index Euro - Institutional Plus', weight: 0.07360925182210323, group: 'Equities' },
  { assetClass: 'Euro government bonds', fund: 'Vanguard Euro Government Bond Index - Institutional Plus', weight: 0.04166046903664039, group: 'Bonds' },
  { assetClass: 'Euro corporate bonds (IG)', fund: 'Vanguard Euro Investment Grade Bond Index Euro - Institutional Plus', weight: 0.029537904705240717, group: 'Bonds' },
  { assetClass: 'Euro inflation-linked bonds', fund: 'Vanguard Eurozone Inflation-Linked Bond Index Euro - Institutional Plus', weight: 0.025422678367792155, group: 'Bonds' },
];

/** Weight per group, e.g. { Equities: 0.903, Bonds: 0.097 }. */
export function groupWeights(hs: Holding[] = HOLDINGS): Record<Holding['group'], number> {
  const out = { Equities: 0, Bonds: 0 };
  for (const h of hs) out[h.group] += h.weight;
  return out;
}

export const totalWeight = (hs: Holding[] = HOLDINGS) => hs.reduce((s, h) => s + h.weight, 0);
