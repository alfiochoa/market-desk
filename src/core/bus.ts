export type Sel = { kind: 'eq' | 'crypto' | 'fx'; id: string };
type Handler<T> = (v: T) => void;
class Bus {
  private sel: Sel = { kind: 'eq', id: 'AAPL' };
  private subs = new Set<Handler<Sel>>();
  get selected() { return this.sel; }
  select(s: Sel) { this.sel = s; for (const f of this.subs) f(s); }
  onSelect(f: Handler<Sel>) { this.subs.add(f); return () => this.subs.delete(f); }
}
export const bus = new Bus();

/** Shared loaded data so widgets (chart/watchlist/heatmap/portfolio) read the same equity snapshot. */
export const makeStore = () => {
  const m = new Map<string, unknown>();
  const subs = new Map<string, Set<Handler<unknown>>>();
  return {
    get: <T>(k: string) => m.get(k) as T | undefined,
    set(k: string, v: unknown) { m.set(k, v); subs.get(k)?.forEach((f) => f(v)); },
    on<T>(k: string, f: Handler<T>) { (subs.get(k) ?? subs.set(k, new Set()).get(k)!).add(f as Handler<unknown>); if (m.has(k)) f(m.get(k) as T); },
  };
};
export const store = makeStore();
