import type { WidgetDef } from '../core/widget.ts';
import { store } from '../core/bus.ts';
import { cls, fmtNum, fmtPct, h, svg } from '../core/ui.ts';
import { groupWeights, HOLDINGS, HOLDINGS_AS_OF, type Holding } from '../lib/holdings.ts';
import { PERIODS, periodReturn, weightedReturn } from '../lib/perf.ts';
import { sim, type SimSnap } from '../sources/providers.ts';

const VALUE_KEY = 'md:invest:value:v1';
const WEIGHTS_KEY = 'md:invest:weights:v1';
const STATE = 'sim:state'; // store key: { weights: number[]; value: number | null }
interface SimState { weights: number[]; value: number | null }
/** 8 theme-friendly series colors: cool tones for equities, warm for bonds (order follows HOLDINGS). */
const COLORS = ['#4aa3ff', '#7ec4ff', '#b58cff', '#5fd0c8', '#2ec78a', '#f5b94a', '#f2915f', '#e5736f'];
const DEFAULTS = HOLDINGS.map((hd) => hd.weight);
const pctTxt = (w: number) => `${(w * 100).toFixed(2)}%`;

const readStoredValue = () => { try { const v = Number(localStorage.getItem(VALUE_KEY)); return v > 0 ? v : null; } catch { return null; } };
const readStoredWeights = (): number[] => {
  try {
    const a = JSON.parse(localStorage.getItem(WEIGHTS_KEY) ?? 'null') as unknown;
    if (Array.isArray(a) && a.length === HOLDINGS.length && a.every((x) => typeof x === 'number' && x >= 0)) return a as number[];
  } catch { /* fall through */ }
  return [...DEFAULTS];
};

/** Percent strings (2 decimals) that sum to exactly 100.00: the rounding residual goes to the largest weight. */
function displayPercents(weights: number[]): string[] {
  const r = weights.map((w) => Math.round(w * 10_000) / 100);
  const residual = Math.round((100 - r.reduce((s, x) => s + x, 0)) * 100) / 100;
  r[r.indexOf(Math.max(...r))] += residual;
  return r.map((x) => x.toFixed(2));
}

export const allocationWidget: WidgetDef = {
  type: 'alloc', title: 'Simulator · allocation calculator', w: 12, h: 16,
  mount(body, ctx) {
    ctx.setBadge({ status: 'snapshot', source: 'distribucion_agregada_cartera.xlsx', asOf: HOLDINGS_AS_OF, note: 'Default weights are my aggregated targets, exported from my portfolio spreadsheet. Edit or randomize them freely.' });
    let value = readStoredValue();
    let weights = readStoredWeights();
    const saveWeights = () => { try { localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights)); } catch { /* ignore */ } };
    const amount = (w: number) => (value === null ? '—' : fmtNum(w * value));
    const current = (): Holding[] => HOLDINGS.map((hd, i) => ({ ...hd, weight: weights[i] }));

    const valueInput = h('input', { type: 'number', 'aria-label': 'Total portfolio value in euros', placeholder: 'e.g. 25000', min: '0', step: 'any', value: value === null ? '' : String(value) });
    const weightInputs = HOLDINGS.map((hd, i) => h('input', { type: 'number', class: 'w-in', 'aria-label': `${hd.assetClass} weight percent`, min: '0', step: 'any', value: (weights[i] * 100).toFixed(2) }));
    const kpis = h('div', { class: 'kpis' });
    const barBox = h('div', {});
    const warn = h('div', { role: 'status' });
    const eurCells = HOLDINGS.map(() => h('td', {}));
    const totalPct = h('td', {});
    const totalEur = h('td', {});

    const recalc = () => {
      store.set(STATE, { weights: [...weights], value } satisfies SimState);
      const total = weights.reduce((s, w) => s + w, 0);
      const g = groupWeights(current());
      kpis.replaceChildren(...([['Equities', pctTxt(g.Equities), amount(g.Equities)], ['Bonds', pctTxt(g.Bonds), amount(g.Bonds)], ['Funds', String(HOLDINGS.length), '']] as const)
        .map(([k, v, a]) => h('div', { class: 'kpi' }, h('span', { class: 'muted' }, k), h('b', {}, v), a && a !== '—' ? h('span', { class: 'muted' }, `€ ${a}`) : null)));
      const W = 600, H = 26;
      const bar = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'alloc-bar', role: 'img',
        'aria-label': `Allocation: ${current().map((x) => `${x.assetClass} ${pctTxt(x.weight)}`).join(', ')}` });
      let x = 0;
      weights.forEach((w, i) => {
        const seg = total > 0 ? (w / total) * W : 0;
        if (seg > 0) bar.append(svg('rect', { x: x.toFixed(1), y: 0, width: Math.max(seg - 1, 0.5).toFixed(1), height: H, rx: 2, fill: COLORS[i] }));
        x += seg;
      });
      barBox.replaceChildren(bar);
      eurCells.forEach((td, i) => { td.textContent = amount(weights[i]); });
      totalPct.textContent = pctTxt(total);
      totalEur.textContent = value === null ? '—' : fmtNum(total * value);
      const off = Math.abs(total - 1) > 0.0005;
      warn.className = off ? 'warn' : 'note';
      warn.textContent = off ? `Weights sum to ${pctTxt(total)}, not 100% — the € column uses them as entered, while the bar shows proportions.` : '';
      warn.hidden = !off;
    };

    const setWeights = (next: number[]) => {
      weights = next; saveWeights();
      displayPercents(weights).forEach((p, i) => { weightInputs[i].value = p; });
      recalc();
    };
    weightInputs.forEach((input, i) => input.addEventListener('input', () => {
      weights[i] = Math.max(Number(input.value) || 0, 0) / 100; saveWeights(); recalc();
    }));
    valueInput.addEventListener('input', () => {
      value = Number(valueInput.value) > 0 ? Number(valueInput.value) : null;
      try { if (value === null) localStorage.removeItem(VALUE_KEY); else localStorage.setItem(VALUE_KEY, String(value)); } catch { /* ignore */ }
      recalc();
    });
    const randomize = () => {
      const xs = HOLDINGS.map(() => -Math.log(1 - Math.random())); // Dirichlet(1,…,1): uniform over all mixes
      const sum = xs.reduce((s, v) => s + v, 0);
      setWeights(xs.map((v) => v / sum));
    };

    body.append(
      h('div', { class: 'lot-form' },
        h('label', {}, 'Total value € ', valueInput),
        h('button', { class: 'btn', onclick: randomize }, 'Randomize')),
      h('div', { class: 'scroll' },
        kpis, barBox, warn,
        h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, ...['Asset class', 'Fund', 'Weight %', '€'].map((t) => h('th', {}, t)))),
          h('tbody', {}, ...HOLDINGS.map((hd, i) => h('tr', {},
            h('td', { class: 'sym' }, h('span', { class: 'dot', style: `background:${COLORS[i]}` }), hd.assetClass),
            h('td', { class: 'fund' }, hd.fund),
            h('td', {}, weightInputs[i]),
            eurCells[i])),
            h('tr', { class: 'total' }, h('td', { class: 'sym' }, 'Total'), h('td', {}), totalPct, totalEur)))),
      h('div', { class: 'note' }, `A what-if calculator, local to this browser. Default weights are my real aggregated targets from distribucion_agregada_cartera.xlsx (as of ${HOLDINGS_AS_OF}); edit any weight or Randomize for a random mix. The € column simply splits the total you enter by weight — it is not a market valuation or advice.`));
    recalc();
  },
};

export const performanceWidget: WidgetDef = {
  type: 'perf', title: 'Simulator · performance', w: 12, h: 12,
  mount(body, ctx) {
    let state: SimState = store.get<SimState>(STATE) ?? { weights: readStoredWeights(), value: readStoredValue() };
    let snap: SimSnap | null = null;
    const out = h('div', { class: 'scroll' });
    const note = h('div', { class: 'note' });
    body.append(out, note);

    const draw = () => {
      if (!snap) return;
      const bySymbol = new Map(snap.series.map((s) => [s.symbol, s]));
      const rows = HOLDINGS.map((hd, i) => {
        const s = bySymbol.get(hd.proxy.symbol);
        return { hd, i, s, rs: PERIODS.map((p) => (s ? periodReturn(s.bars, p) : null)) };
      });
      const totals = PERIODS.map((_, k) => weightedReturn(rows.map(({ hd, rs, i }) => ({ weight: state.weights[i] ?? hd.weight, r: rs[k] }))));
      const v = state.value;
      out.replaceChildren(h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ...['Asset class', 'Proxy', ...PERIODS].map((t) => h('th', {}, t)))),
        h('tbody', {},
          ...rows.map(({ hd, i, s, rs }) => h('tr', {},
            h('td', { class: 'sym' }, h('span', { class: 'dot', style: `background:${COLORS[i]}` }), hd.assetClass),
            h('td', { class: 'fund', title: s ? `${s.name}${s.note ? ` — ${s.note}` : ''}` : 'no data' }, hd.proxy.symbol),
            ...rs.map((r) => h('td', { class: cls(r) }, fmtPct(r === null ? null : r * 100))))),
          h('tr', { class: 'total' }, h('td', { class: 'sym' }, 'Portfolio'), h('td', {}),
            ...totals.map((r) => h('td', { class: cls(r) }, fmtPct(r === null ? null : r * 100)))),
          v === null ? null : h('tr', { class: 'total' }, h('td', { class: 'sym' }, `€ on ${fmtNum(v, 0)}`), h('td', {}),
            ...totals.map((r) => h('td', { class: cls(r) }, r === null ? '—' : `${r > 0 ? '+' : r < 0 ? '−' : ''}${fmtNum(Math.abs(r * v))}`))))));
      const lastDate = snap.series[0]?.bars.at(-1)?.t;
      note.textContent = `Estimated with US-listed proxy ETFs (hover a symbol for which), daily closes converted to EUR at ECB reference rates — an approximation of the funds, not their official NAVs. Returns to ${lastDate ?? '?'}; 1D/5D are trading sessions, longer periods calendar. Uses the calculator's weights${v === null ? '' : ' and your € total'}. Not investment advice.`;
    };

    store.on<SimState>(STATE, (s) => { state = s; draw(); });
    return ctx.load<SimSnap>('sim', sim, 3 * 3600e3, (d) => { snap = d; draw(); });
  },
};
