import { hierarchy, treemap } from 'd3-hierarchy';
import type { WidgetDef } from '../core/widget.ts';
import { bus, store } from '../core/bus.ts';
import { cls, fmtNum, fmtPct, fmtPrice, h, sparkline } from '../core/ui.ts';
import { cryptoBoard, equities, fxBoard, type Coin, type EquitySnap, type FxData } from '../sources/providers.ts';

const chg = (bars: { c: number }[]) => (bars.length > 1 ? (bars.at(-1)!.c / bars.at(-2)!.c - 1) * 100 : 0);
const simNote = (d: EquitySnap) => (d.kind === 'simulated' ? h('div', { class: 'warn' }, 'SIMULATED placeholder prices — no real equity source was reachable when this snapshot was built. Not market data.') : h('div', { class: 'note' }, 'End-of-day, delayed, not real-time.'));

function row(label: string, on: () => void, selected: boolean, ...cells: (Node | string)[]) {
  const tr = h('tr', { tabIndex: 0, class: selected ? 'sel' : '', 'aria-label': label, onclick: on, onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); on(); } } });
  tr.append(...cells.map((c, i) => h('td', { class: i === 0 ? 'sym' : '' }, c)));
  return tr;
}

export const watchlistWidget: WidgetDef = {
  type: 'watchlist', title: 'US equities watchlist', w: 5, h: 11,
  mount(body, ctx) {
    const render = (d: EquitySnap) => {
      store.set('equities', d);
      const sel = bus.selected;
      const tb = h('tbody');
      for (const s of d.symbols) {
        const last = s.bars.at(-1)!.c, c = chg(s.bars);
        tb.append(row(`${s.symbol} ${s.name} ${fmtPrice(last)} ${fmtPct(c)}`, () => bus.select({ kind: 'eq', id: s.symbol }), sel.kind === 'eq' && sel.id === s.symbol,
          s.symbol, fmtPrice(last), h('span', { class: cls(c) }, fmtPct(c)), sparkline(s.bars.slice(-30).map((b) => b.c))));
      }
      body.replaceChildren(simNote(d), h('div', { class: 'scroll' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...['Symbol', 'Last', '1d', '30d'].map((t) => h('th', {}, t)))), tb)));
    };
    const cancel = ctx.load<EquitySnap>('equities', equities, 6 * 3600e3, render);
    const off = bus.onSelect(() => { const d = store.get<EquitySnap>('equities'); if (d) render(d); });
    return () => { cancel(); off(); };
  },
};

export const quoteWidget: WidgetDef = {
  type: 'quote', title: 'Quote', w: 5, h: 9,
  mount(body, ctx) {
    let sym = 'AAPL';
    const render = (d: EquitySnap) => {
      store.set('equities', d);
      const s = d.symbols.find((x) => x.symbol === sym) ?? d.symbols[0];
      const b = s.bars.at(-1)!, p = s.bars.at(-2) ?? b;
      const yr = s.bars.slice(-252), hi = Math.max(...yr.map((x) => x.h)), lo = Math.min(...yr.map((x) => x.l));
      const c = chg(s.bars);
      const kv = (k: string, v: string) => [h('dt', {}, k), h('dd', {}, v)];
      body.replaceChildren(simNote(d),
        h('div', { class: 'q-head' }, h('b', { class: 'q-sym' }, s.symbol), h('span', { class: 'muted' }, ` ${s.name} · ${s.sector}`)),
        h('div', { class: 'q-px' }, h('span', { class: 'big' }, fmtPrice(b.c)), h('span', { class: cls(c) }, ` ${fmtNum(b.c - p.c)} (${fmtPct(c)})`)),
        h('dl', { class: 'kv' }, ...kv('Close date', b.t), ...kv('Open', fmtPrice(b.o)), ...kv('High', fmtPrice(b.h)), ...kv('Low', fmtPrice(b.l)), ...kv('Volume', b.v.toLocaleString('en-US')), ...kv('Prev close', fmtPrice(p.c)), ...kv('52w range', `${fmtPrice(lo)} – ${fmtPrice(hi)}`)));
    };
    const cancel = ctx.load<EquitySnap>('equities', equities, 6 * 3600e3, render);
    const off = bus.onSelect((s) => { if (s.kind === 'eq') { sym = s.id; const d = store.get<EquitySnap>('equities'); if (d) render(d); } });
    return () => { cancel(); off(); };
  },
};

export const cryptoWidget: WidgetDef = {
  type: 'crypto', title: 'Crypto board', w: 7, h: 9,
  mount(body, ctx) {
    return ctx.load<Coin[]>('crypto', cryptoBoard, 60e3, (coins) => {
      const sel = bus.selected;
      const tb = h('tbody');
      for (const c of coins) tb.append(row(`${c.symbol} ${fmtPrice(c.price)} ${fmtPct(c.ch24)}`, () => bus.select({ kind: 'crypto', id: c.id }), sel.kind === 'crypto' && sel.id === c.id,
        c.symbol, '$' + fmtPrice(c.price), h('span', { class: cls(c.ch24) }, fmtPct(c.ch24)), h('span', { class: cls(c.ch7d) }, fmtPct(c.ch7d)), c.cap ? '$' + (c.cap / 1e9).toFixed(1) + 'B' : '—', sparkline(c.spark, 100, 26)));
      body.replaceChildren(h('div', { class: 'scroll' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...['Coin', 'Price', '24h', '7d', 'Mkt cap', '7d chart'].map((t) => h('th', {}, t)))), tb)));
    });
  },
};

export const fxWidget: WidgetDef = {
  type: 'fx', title: 'FX board (ECB reference)', w: 5, h: 12,
  mount(body, ctx) {
    return ctx.load<FxData>('fx', fxBoard, 30 * 60e3, (d) => {
      const sel = bus.selected;
      const tb = h('tbody');
      for (const [q, v] of Object.entries(d.series)) {
        const last = v.at(-1)!, prev = v.at(-2) ?? last, c = (last / prev - 1) * 100;
        tb.append(row(`USD/${q} ${fmtNum(last, 4)} ${fmtPct(c)}`, () => bus.select({ kind: 'fx', id: q }), sel.kind === 'fx' && sel.id === q,
          `USD/${q}`, fmtNum(last, last > 20 ? 2 : 4), h('span', { class: cls(c) }, fmtPct(c)), sparkline(v.slice(-30))));
      }
      body.replaceChildren(h('div', { class: 'note' }, `Daily ECB reference rates (published ~16:00 CET, working days). Indicative only. Latest: ${d.days.at(-1)}.`), h('div', { class: 'scroll' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...['Pair', 'Rate', '1d', '30d'].map((t) => h('th', {}, t)))), tb)));
    });
  },
};

/** Red/green scale saturating at +/-3%. */
const heat = (c: number) => { const a = Math.min(Math.abs(c) / 3, 1); return `color-mix(in srgb, ${c >= 0 ? 'var(--up)' : 'var(--down)'} ${Math.round(18 + a * 60)}%, var(--panel))`; };

export const heatmapWidget: WidgetDef = {
  type: 'heatmap', title: 'Heatmap · daily % change', w: 7, h: 11,
  mount(body, ctx) {
    const area = h('div', { class: 'heat', role: 'group', 'aria-label': 'Treemap of watchlist by daily change' });
    let data: EquitySnap | null = null;
    const draw = () => {
      if (!data) return;
      const W = area.clientWidth, H = area.clientHeight;
      if (W < 10 || H < 10) return;
      type N = { name: string; sector?: string; value?: number; c?: number; children?: N[] };
      const sectors = new Map<string, N[]>();
      for (const s of data.symbols) (sectors.get(s.sector) ?? sectors.set(s.sector, []).get(s.sector)!).push({ name: s.symbol, value: s.w, c: chg(s.bars), sector: s.sector });
      const root = hierarchy<N>({ name: 'root', children: [...sectors].map(([name, children]) => ({ name, children })) }).sum((d) => d.value ?? 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
      treemap<N>().size([W, H]).paddingInner(2).paddingTop((d) => (d.depth === 1 ? 14 : 0))(root);
      area.replaceChildren();
      for (const n of root.descendants()) {
        const r = n as unknown as { x0: number; y0: number; x1: number; y1: number };
        const st = `left:${r.x0}px;top:${r.y0}px;width:${r.x1 - r.x0}px;height:${r.y1 - r.y0}px`;
        if (n.depth === 1) area.append(h('div', { class: 'h-sector', style: st }, n.data.name));
        if (n.depth === 2) {
          const c = n.data.c ?? 0, small = r.x1 - r.x0 < 54 || r.y1 - r.y0 < 34;
          area.append(h('button', { class: 'h-cell', style: `${st};background:${heat(c)}`, 'aria-label': `${n.data.name} ${fmtPct(c)}`, title: `${n.data.name} ${fmtPct(c)} (size = illustrative weight)`, onclick: () => bus.select({ kind: 'eq', id: n.data.name }) },
            h('b', {}, n.data.name), small ? null : h('span', {}, fmtPct(c))));
        }
      }
    };
    body.append(h('div', { class: 'note' }, 'Colour = last daily % change. Tile size = illustrative weight, not live market cap.'), area);
    const ro = new ResizeObserver(draw); ro.observe(area);
    const cancel = ctx.load<EquitySnap>('equities', equities, 6 * 3600e3, (d) => {
      store.set('equities', d);
      data = d;
      const old = body.querySelector('.warn'); old?.remove();
      if (d.kind === 'simulated') body.prepend(h('div', { class: 'warn' }, 'SIMULATED placeholder prices — not market data.'));
      requestAnimationFrame(draw);
    });
    return () => { ro.disconnect(); cancel(); };
  },
};
