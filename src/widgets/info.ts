import type { WidgetDef } from '../core/widget.ts';
import { store } from '../core/bus.ts';
import { cls, fmtNum, fmtPct, h, svg } from '../core/ui.ts';
import { equities, fred, news, treasury, type EquitySnap, type FredSnap, type NewsSnap, type TreasurySnap } from '../sources/providers.ts';
import { TENORS } from '../lib/treasury.ts';
import { computePositions, lotsFromCsv, lotsToCsv, totals, type Lot, type Position } from '../lib/portfolio.ts';
import { FRED_SERIES } from '../universe.ts';

function lineSvg(xs: string[], ys: number[], w = 520, hgt = 150): SVGElement {
  const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1, pad = 6;
  const X = (i: number) => pad + (i / Math.max(ys.length - 1, 1)) * (w - 2 * pad - 36);
  const Y = (v: number) => hgt - 16 - ((v - min) / span) * (hgt - 28);
  const el = svg('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'linechart', role: 'img', 'aria-label': `Line chart from ${xs[0]} to ${xs.at(-1)}, last value ${ys.at(-1)}` });
  el.append(svg('path', { d: ys.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(''), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.6 }));
  for (const [v, anchor] of [[max, 12], [min, hgt - 16]] as const) { const t = svg('text', { x: w - 34, y: anchor, class: 'axis' }); t.textContent = fmtNum(v); el.append(t); }
  const a = svg('text', { x: pad, y: hgt - 2, class: 'axis' }); a.textContent = xs[0];
  const b = svg('text', { x: w - 80, y: hgt - 2, class: 'axis' }); b.textContent = xs.at(-1)!;
  el.append(a, b);
  return el;
}

export const macroWidget: WidgetDef = {
  type: 'macro', title: 'Macro · yield curve & FRED', w: 7, h: 14,
  mount(body, ctx) {
    const curveBox = h('div', { class: 'curve' });
    const fredBox = h('div', { class: 'fred' });
    const sel = h('select', { 'aria-label': 'FRED series', onchange: () => drawFred() }, ...FRED_SERIES.map((s) => h('option', { value: s.id }, s.label)));
    let fd: FredSnap | null = null;
    const drawFred = () => {
      if (!fd) return;
      const s = fd.series[sel.value];
      if (!s) return;
      const o = s.obs.slice(-260);
      fredBox.replaceChildren(lineSvg(o.map((x) => x.date), o.map((x) => x.value)), h('div', { class: 'note' }, `Latest ${o.at(-1)!.value} on ${o.at(-1)!.date}. Series ${sel.value}. Source: FRED, Federal Reserve Bank of St. Louis (snapshot — FRED's CSV endpoint has no CORS headers).`));
    };
    body.append(h('h3', {}, 'US Treasury par yield curve'), curveBox, h('h3', {}, 'FRED series', sel), fredBox);
    const c1 = ctx.load<TreasurySnap>('treasury', treasury, 3 * 3600e3, (d) => {
      const last = d.curves.at(-1)!;
      const ago = d.curves[Math.max(0, d.curves.length - 22)];
      const W = 520, H = 190, P = 28;
      const x = (i: number) => P + (i / (TENORS.length - 1)) * (W - P - 10);
      const all = [last, ago].flatMap((c) => TENORS.map((t) => c.yields[t])).filter((v): v is number => v !== null);
      const lo = Math.floor(Math.min(...all) * 4) / 4 - 0.1, hi = Math.ceil(Math.max(...all) * 4) / 4 + 0.1;
      const y = (v: number) => H - 22 - ((v - lo) / (hi - lo)) * (H - 36);
      const path = (c: typeof last) => TENORS.map((t, i) => (c.yields[t] === null ? null : `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c.yields[t]!).toFixed(1)}`)).filter(Boolean).join('');
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'linechart', role: 'img', 'aria-label': `Treasury yield curve on ${last.date}: 2-year ${last.yields['2Y']} percent, 10-year ${last.yields['10Y']} percent` });
      for (let g = Math.ceil(lo * 2) / 2; g <= hi; g += 0.5) { const t = svg('text', { x: 0, y: y(g) + 3, class: 'axis' }); t.textContent = g.toFixed(1); s.append(svg('line', { x1: P, x2: W - 10, y1: y(g), y2: y(g), class: 'gridline' }), t); }
      TENORS.forEach((t, i) => { const e = svg('text', { x: x(i) - 8, y: H - 6, class: 'axis' }); e.textContent = t; s.append(e); });
      s.append(svg('path', { d: path(ago), fill: 'none', stroke: 'var(--muted)', 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }), svg('path', { d: path(last), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2 }));
      const spread = last.yields['10Y'] !== null && last.yields['2Y'] !== null ? last.yields['10Y']! - last.yields['2Y']! : null;
      curveBox.replaceChildren(s, h('div', { class: 'legend' }, h('span', { class: 'sw solid' }), ` ${last.date}  `, h('span', { class: 'sw dash' }), ` ${ago.date}   10Y−2Y: `, h('b', { class: cls(spread) }, spread === null ? '—' : fmtPct(spread, 2).replace('%', ' pp'))));
    });
    const c2 = ctx.load<FredSnap>('fred', fred, 6 * 3600e3, (d) => { fd = d; drawFred(); }, { badge: false });
    return () => { c1(); c2(); };
  },
};

export const newsWidget: WidgetDef = {
  type: 'news', title: 'Official news feeds', w: 5, h: 11,
  mount(body, ctx) {
    let filter = 'All';
    let data: NewsSnap | null = null;
    const list = h('ul', { class: 'news' });
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Source filter' });
    const draw = () => {
      if (!data) return;
      const srcs = ['All', ...new Set(data.items.map((i) => i.source))];
      chips.replaceChildren(...srcs.map((s) => h('button', { class: 'chip', 'aria-pressed': String(s === filter), onclick: () => { filter = s; draw(); } }, s)));
      list.replaceChildren(...data.items.filter((i) => filter === 'All' || i.source === filter).slice(0, 40).map((i) => h('li', {},
        h('a', { href: i.link, target: '_blank', rel: 'noopener noreferrer' }, i.title),
        h('div', { class: 'meta' }, `${i.source} · ${new Date(i.published).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`))));
    };
    body.append(chips, h('div', { class: 'scroll' }, list), h('div', { class: 'note' }, 'Headlines only, deduplicated; each link opens the original publisher.'));
    return ctx.load<NewsSnap>('news', news, 30 * 60e3, (d) => { data = d; draw(); });
  },
};

const LOTS_KEY = 'md:lots:v1';
const readLots = (): Lot[] => { try { return JSON.parse(localStorage.getItem(LOTS_KEY) ?? '[]'); } catch { return []; } };

export const portfolioWidget: WidgetDef = {
  type: 'portfolio', title: 'Portfolio tracker (local only)', w: 12, h: 9,
  mount(body, ctx) {
    let lots = readLots();
    const persist = () => { try { localStorage.setItem(LOTS_KEY, JSON.stringify(lots)); } catch { /* ignore */ } };
    const msg = h('div', { class: 'note', role: 'status' });
    const out = h('div', { class: 'scroll' });
    const f = {
      date: h('input', { type: 'date', 'aria-label': 'Date', value: new Date().toISOString().slice(0, 10) }),
      symbol: h('input', { 'aria-label': 'Symbol', placeholder: 'AAPL', size: 6, list: 'md-symbols' }),
      side: h('select', { 'aria-label': 'Side' }, h('option', { value: 'buy' }, 'buy'), h('option', { value: 'sell' }, 'sell')),
      qty: h('input', { type: 'number', 'aria-label': 'Quantity', placeholder: 'qty', min: '0', step: 'any', size: 6 }),
      price: h('input', { type: 'number', 'aria-label': 'Price', placeholder: 'price', min: '0', step: 'any', size: 7 }),
      fee: h('input', { type: 'number', 'aria-label': 'Fee', placeholder: 'fee', min: '0', step: 'any', size: 5, value: '0' }),
    };
    const prices = (): Record<string, number> => Object.fromEntries((store.get<EquitySnap>('equities')?.symbols ?? []).map((s) => [s.symbol, s.bars.at(-1)!.c]));
    const draw = () => {
      let ps: Position[];
      try { ps = computePositions(lots, prices()); msg.textContent = ''; } catch (e) { msg.textContent = (e as Error).message; ps = []; }
      const t = totals(ps);
      const sim = store.get<EquitySnap>('equities')?.kind === 'simulated';
      out.replaceChildren(
        h('div', { class: 'kpis' }, ...[['Cost basis', fmtNum(t.cost), ''], ['Market value', fmtNum(t.value), ''], ['Unrealized', fmtNum(t.unrealized), cls(t.unrealized)], ['Realized', fmtNum(t.realized), cls(t.realized)]].map(([k, v, c]) => h('div', { class: 'kpi' }, h('span', { class: 'muted' }, k), h('b', { class: c }, v)))),
        sim ? h('div', { class: 'warn' }, 'Market values use SIMULATED placeholder prices — P&L shown is illustrative only.') : h('div', { class: 'note' }, 'Market values use last end-of-day close from the snapshot (delayed).'),
        h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...['Symbol', 'Qty', 'Avg cost', 'Last', 'Unrealized', 'Realized'].map((x) => h('th', {}, x)))),
          h('tbody', {}, ...ps.map((p) => h('tr', {}, h('td', { class: 'sym' }, p.symbol), h('td', {}, fmtNum(p.qty, 4)), h('td', {}, fmtNum(p.avgCost)), h('td', {}, p.marketPrice === undefined ? '—' : fmtNum(p.marketPrice)), h('td', { class: cls(p.unrealized) }, fmtNum(p.unrealized)), h('td', { class: cls(p.realized) }, fmtNum(p.realized)))))),
        h('details', {}, h('summary', {}, `Lots (${lots.length})`), h('table', { class: 'tbl' }, h('tbody', {}, ...[...lots].reverse().map((l) => h('tr', {}, h('td', {}, l.date), h('td', { class: 'sym' }, l.symbol), h('td', {}, l.side), h('td', {}, fmtNum(l.qty, 4)), h('td', {}, fmtNum(l.price)), h('td', {}, fmtNum(l.fee)),
          h('td', {}, h('button', { class: 'chip', 'aria-label': `Delete lot ${l.date} ${l.symbol}`, onclick: () => { lots = lots.filter((x) => x.id !== l.id); persist(); draw(); } }, '✕'))))))));
    };
    const add = () => {
      const lot: Lot = { id: crypto.randomUUID(), date: f.date.value, symbol: f.symbol.value.trim().toUpperCase(), side: f.side.value as 'buy' | 'sell', qty: Number(f.qty.value), price: Number(f.price.value), fee: Number(f.fee.value || 0) };
      if (!lot.date || !lot.symbol || !(lot.qty > 0) || !(lot.price >= 0)) { msg.textContent = 'Enter date, symbol, quantity > 0 and price.'; return; }
      try { computePositions([...lots, lot]); } catch (e) { msg.textContent = (e as Error).message; return; }
      lots = [...lots, lot]; persist(); f.qty.value = ''; draw();
    };
    const file = h('input', { type: 'file', accept: '.csv,text/csv', hidden: true, onchange: async () => {
      try { const imp = lotsFromCsv(await file.files![0].text()); computePositions(imp); lots = imp; persist(); draw(); msg.textContent = `Imported ${imp.length} lots.`; } catch (e) { msg.textContent = `Import failed: ${(e as Error).message}`; }
      file.value = '';
    } });
    const exportCsv = () => {
      const a = h('a', { href: URL.createObjectURL(new Blob([lotsToCsv(lots)], { type: 'text/csv' })), download: 'market-desk-lots.csv' });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    body.append(
      h('datalist', { id: 'md-symbols' }, ...(store.get<EquitySnap>('equities')?.symbols ?? []).map((s) => h('option', { value: s.symbol }))),
      h('form', { class: 'lot-form', onsubmit: (e: Event) => { e.preventDefault(); add(); } }, f.date, f.symbol, f.side, f.qty, f.price, f.fee, h('button', { type: 'submit', class: 'btn' }, 'Add lot'),
        h('button', { type: 'button', class: 'btn ghost', onclick: exportCsv }, 'Export CSV'), h('button', { type: 'button', class: 'btn ghost', onclick: () => file.click() }, 'Import CSV'), file,
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { if (lots.length && confirm('Delete all lots stored in this browser?')) { lots = []; persist(); draw(); } } }, 'Clear')),
      msg, out, h('div', { class: 'note' }, 'Stored only in this browser (localStorage). Average-cost method; fees are added to cost on buys and deducted on sells. Educational — not tax or investment advice.'));
    draw();
    store.on<EquitySnap>('equities', draw);
    return ctx.load<EquitySnap>('equities', equities, 6 * 3600e3, (d) => { store.set('equities', d); });
  },
};
