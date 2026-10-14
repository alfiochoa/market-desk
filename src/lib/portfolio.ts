/** Portfolio math: average-cost method. Pure functions, no I/O. */
export interface Lot { id: string; date: string; symbol: string; side: 'buy' | 'sell'; qty: number; price: number; fee: number }
export interface Position { symbol: string; qty: number; avgCost: number; costBasis: number; realized: number; marketPrice?: number; marketValue?: number; unrealized?: number }

/** Replays lots in date order. Buys raise the average cost (fees capitalised); sells realise (price - avg)*qty - fee. Throws on overselling. */
export function computePositions(lots: Lot[], prices: Record<string, number> = {}): Position[] {
  const sorted = [...lots].sort((a, b) => a.date.localeCompare(b.date) || (a.side === b.side ? 0 : a.side === 'buy' ? -1 : 1));
  const book = new Map<string, { qty: number; cost: number; realized: number }>();
  for (const l of sorted) {
    const p = book.get(l.symbol) ?? { qty: 0, cost: 0, realized: 0 };
    if (l.side === 'buy') {
      p.qty += l.qty;
      p.cost += l.qty * l.price + l.fee;
    } else {
      if (l.qty > p.qty + 1e-9) throw new Error(`Sell of ${l.qty} ${l.symbol} exceeds position ${p.qty}`);
      const avg = p.qty > 0 ? p.cost / p.qty : 0;
      p.realized += (l.price - avg) * l.qty - l.fee;
      p.cost -= avg * l.qty;
      p.qty -= l.qty;
      if (p.qty < 1e-9) { p.qty = 0; p.cost = 0; }
    }
    book.set(l.symbol, p);
  }
  return [...book.entries()].map(([symbol, p]) => {
    const mp = prices[symbol];
    const pos: Position = { symbol, qty: p.qty, avgCost: p.qty ? p.cost / p.qty : 0, costBasis: p.cost, realized: p.realized };
    if (mp !== undefined) { pos.marketPrice = mp; pos.marketValue = mp * p.qty; pos.unrealized = mp * p.qty - p.cost; }
    return pos;
  });
}

export function totals(ps: Position[]) {
  return ps.reduce((t, p) => ({ realized: t.realized + p.realized, unrealized: t.unrealized + (p.unrealized ?? 0), value: t.value + (p.marketValue ?? 0), cost: t.cost + p.costBasis }), { realized: 0, unrealized: 0, value: 0, cost: 0 });
}

const HEAD = 'date,symbol,side,qty,price,fee';
export function lotsToCsv(lots: Lot[]): string {
  return [HEAD, ...lots.map((l) => [l.date, l.symbol, l.side, l.qty, l.price, l.fee].join(','))].join('\n') + '\n';
}

/** Strict import: returns parsed lots or throws with the offending line number. */
export function lotsFromCsv(text: string): Lot[] {
  const rows = text.trim().split(/\r?\n/);
  if (rows[0]?.trim().toLowerCase() !== HEAD) throw new Error(`Expected header: ${HEAD}`);
  return rows.slice(1).filter((r) => r.trim()).map((r, i) => {
    const [date, symbol, side, qty, price, fee] = r.split(',').map((s) => s.trim());
    const n = { qty: Number(qty), price: Number(price), fee: Number(fee || 0) };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !symbol || (side !== 'buy' && side !== 'sell') || !(n.qty > 0) || !(n.price >= 0) || !(n.fee >= 0)) {
      throw new Error(`Invalid row ${i + 2}: ${r}`);
    }
    return { id: `${date}-${symbol}-${i}`, date, symbol: symbol.toUpperCase(), side, ...n };
  });
}
