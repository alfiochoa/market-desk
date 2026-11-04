/** My aggregated fund allocation, exported from distribucion_agregada_cartera.xlsx (target weights, sum = 1). Pure data + math, no I/O.
 * `proxy` is a US-listed ETF with a similar exposure, used only to estimate performance (the funds themselves have no free price feed);
 * proxy closes are converted to EUR with ECB daily rates in the snapshot build, so returns include the same FX effect as the unhedged EUR funds. */
export interface Holding { assetClass: string; fund: string; weight: number; group: 'Equities' | 'Bonds'; proxy: { symbol: string; name: string; note?: string } }

export const HOLDINGS_AS_OF = '2026-11-04';
export const HOLDINGS: Holding[] = [
  { assetClass: 'US equities', fund: 'Vanguard US 500 Stock Index Euro - Institutional Plus', weight: 0.3983588675690416, group: 'Equities', proxy: { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' } },
  { assetClass: 'European equities', fund: 'Vanguard European Stock Index Euro - Institutional Plus', weight: 0.24799196787148595, group: 'Equities', proxy: { symbol: 'VGK', name: 'Vanguard FTSE Europe ETF' } },
  { assetClass: 'Emerging-market equities', fund: 'Vanguard Emerging Markets Stock Index Euro - Institutional Plus', weight: 0.09299543854430066, group: 'Equities', proxy: { symbol: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF' } },
  { assetClass: 'Global small-cap equities', fund: 'Vanguard Global Small Cap Index Euro - Institutional Plus', weight: 0.09042342208339531, group: 'Equities', proxy: { symbol: 'VSS', name: 'Vanguard FTSE All-World ex-US Small-Cap ETF', note: 'approximate: the fund also holds US small caps' } },
  { assetClass: 'Japan equities', fund: 'Vanguard Japan Stock Index Euro - Institutional Plus', weight: 0.07360925182210323, group: 'Equities', proxy: { symbol: 'EWJ', name: 'iShares MSCI Japan ETF' } },
  { assetClass: 'Euro government bonds', fund: 'Vanguard Euro Government Bond Index - Institutional Plus', weight: 0.04166046903664039, group: 'Bonds', proxy: { symbol: 'IGOV', name: 'iShares International Treasury Bond ETF', note: 'approximate: ex-US treasuries, not euro-only' } },
  { assetClass: 'Euro corporate bonds (IG)', fund: 'Vanguard Euro Investment Grade Bond Index Euro - Institutional Plus', weight: 0.029537904705240717, group: 'Bonds', proxy: { symbol: 'IBND', name: 'SPDR Bloomberg International Corporate Bond ETF', note: 'approximate: international IG, not euro-only' } },
  { assetClass: 'Euro inflation-linked bonds', fund: 'Vanguard Eurozone Inflation-Linked Bond Index Euro - Institutional Plus', weight: 0.025422678367792155, group: 'Bonds', proxy: { symbol: 'WIP', name: 'SPDR FTSE International Government Inflation-Protected Bond ETF', note: 'approximate: international linkers, not euro-only' } },
];

/** Weight per group, e.g. { Equities: 0.903, Bonds: 0.097 }. */
export function groupWeights(hs: Holding[] = HOLDINGS): Record<Holding['group'], number> {
  const out = { Equities: 0, Bonds: 0 };
  for (const h of hs) out[h.group] += h.weight;
  return out;
}

export const totalWeight = (hs: Holding[] = HOLDINGS) => hs.reduce((s, h) => s + h.weight, 0);
