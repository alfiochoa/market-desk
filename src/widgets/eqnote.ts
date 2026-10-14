import { h } from '../core/ui.ts';
import { INTRADAY_CADENCE, type EquitySnap } from '../sources/providers.ts';

/** Honest description of what the equity numbers are: mode, data time, refresh cadence. Never says "live" or "real-time". */
export function eqNote(d: EquitySnap): HTMLElement {
  if (d.kind === 'simulated') return h('div', { class: 'warn' }, 'SIMULATED placeholder prices — no real equity source was reachable when this snapshot was built. Not market data.');
  const eod = d.symbols.find((s) => !s.bars.at(-1)?.p)?.bars.at(-1)?.t ?? d.symbols[0]?.bars.at(-1)?.t;
  const tail = ' Not real-time, not investment advice.';
  const fail = d.refreshNote ? ` ${d.refreshNote}` : '';
  if (d.intraday) {
    const n = d.intraday.symbols.length;
    return h('div', { class: d.refreshNote ? 'warn' : 'note' }, `Intraday, delayed: ${n} priority symbols as of ${d.intraday.label} (feed age ~${d.intraday.lagMin} min when fetched; ${INTRADAY_CADENCE}); volume may be partial. Other symbols: end-of-day as of ${eod}, refreshes daily after US close.${tail}${fail}`);
  }
  return h('div', { class: d.refreshNote ? 'warn' : 'note' }, `End-of-day, as of ${eod}; refreshes daily after US close (intraday quotes appear for priority symbols during US market hours when available).${tail}${fail}`);
}
export const isIntraday = (d: EquitySnap, sym: string) => !!d.intraday?.symbols.includes(sym);
