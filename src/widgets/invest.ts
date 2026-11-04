import type { WidgetDef } from '../core/widget.ts';
import { fmtNum, h, svg } from '../core/ui.ts';
import { groupWeights, HOLDINGS, HOLDINGS_AS_OF, type Holding } from '../lib/holdings.ts';

const VALUE_KEY = 'md:invest:value:v1';
const WEIGHTS_KEY = 'md:invest:weights:v1';
/** 8 theme-friendly series colors: cool tones for equities, warm for bonds (order follows HOLDINGS). */
const COLORS = ['#4aa3ff', '#7ec4ff', '#b58cff', '#5fd0c8', '#2ec78a', '#f5b94a', '#f2915f', '#e5736f'];
const DEFAULTS = HOLDINGS.map((hd) => hd.weight);
const pctTxt = (w: number) => `${(w * 100).toFixed(2)}%`;

/** Percent strings (2 decimals) that sum to exactly 100.00: the rounding residual goes to the largest weight. */
function displayPercents(weights: number[]): string[] {
  const r = weights.map((w) => Math.round(w * 10_000) / 100);
  const residual = Math.round((100 - r.reduce((s, x) => s + x, 0)) * 100) / 100;
  r[r.indexOf(Math.max(...r))] += residual;
  return r.map((x) => x.toFixed(2));
}

export const allocationWidget: WidgetDef = {
  type: 'alloc', title: 'My investments · allocation calculator', w: 12, h: 16,
  mount(body, ctx) {
    ctx.setBadge({ status: 'snapshot', source: 'distribucion_agregada_cartera.xlsx', asOf: HOLDINGS_AS_OF, note: 'Default weights are my aggregated targets, exported from my portfolio spreadsheet. Edit or randomize them freely.' });
    const readValue = () => { try { const v = Number(localStorage.getItem(VALUE_KEY)); return v > 0 ? v : null; } catch { return null; } };
    const readWeights = (): number[] | null => {
      try {
        const a = JSON.parse(localStorage.getItem(WEIGHTS_KEY) ?? 'null') as unknown;
        return Array.isArray(a) && a.length === HOLDINGS.length && a.every((x) => typeof x === 'number' && x >= 0) ? (a as number[]) : null;
      } catch { return null; }
    };
    let value = readValue();
    let weights = readWeights() ?? [...DEFAULTS];
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
        h('button', { class: 'btn', onclick: randomize }, 'Randomize'),
        h('button', { class: 'btn ghost', onclick: () => { setWeights([...DEFAULTS]); try { localStorage.removeItem(WEIGHTS_KEY); } catch { /* ignore */ } } }, 'My weights')),
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
      h('div', { class: 'note' }, `A what-if calculator, local to this browser. Default weights are my real aggregated targets from distribucion_agregada_cartera.xlsx (as of ${HOLDINGS_AS_OF}); edit any weight, Randomize for a random mix, or "My weights" to restore the defaults. The € column simply splits the total you enter by weight — it is not a market valuation or advice.`));
    recalc();
  },
};
