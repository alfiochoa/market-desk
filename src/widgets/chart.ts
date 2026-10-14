import { AreaSeries, CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart, type IChartApi, type Time, type UTCTimestamp } from 'lightweight-charts';
import type { WidgetCtx, WidgetDef } from '../core/widget.ts';
import { bus, store } from '../core/bus.ts';
import { h } from '../core/ui.ts';
import { bollinger, ema, macd, rsi, sma } from '../lib/indicators.ts';
import { CRYPTO_TF, cryptoCandles, equities, fxBoard, type Candle, type CryptoTf, type EquitySnap, type FxData } from '../sources/providers.ts';

type Pt = { time: Time; o: number; h: number; l: number; c: number; v?: number; prov?: boolean };
const EQ_TF = { '1M': 22, '3M': 66, '6M': 130, '1Y': 260 } as const;
type EqTf = keyof typeof EQ_TF;
interface Opts { type: 'candles' | 'line' | 'area'; eqTf: EqTf; cTf: CryptoTf; sma: boolean; ema: boolean; bb: boolean; vol: boolean; rsi: boolean; macd: boolean }
const DEFAULTS: Opts = { type: 'candles', eqTf: '6M', cTf: '1d', sma: true, ema: false, bb: false, vol: true, rsi: false, macd: false };
const KEY = 'md:chart:opts';
const loadOpts = (): Opts => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULTS }; } };
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';

const fromCandles = (cs: Candle[]): Pt[] => cs.map((c) => ({ time: c.t as UTCTimestamp, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v }));

export const chartWidget: WidgetDef = {
  type: 'chart', title: 'Price chart', w: 7, h: 11,
  mount(body, ctx: WidgetCtx) {
    const o = loadOpts();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ } };
    let pts: Pt[] = [];
    let label = '';
    let cancel = () => {};
    let chart: IChartApi | null = null;
    const host = h('div', { class: 'chart-host', role: 'img', 'aria-label': 'Price chart' });
    const title = h('span', { class: 'chart-title' });
    const tfBox = h('span', { class: 'chips', role: 'group', 'aria-label': 'Timeframe' });
    const typeSel = h('select', { 'aria-label': 'Chart type', onchange: () => { o.type = typeSel.value as Opts['type']; save(); draw(); } },
      ...(['candles', 'line', 'area'] as const).map((t) => h('option', { value: t, selected: t === o.type }, t)));
    const ind = h('span', { class: 'chips', role: 'group', 'aria-label': 'Indicators' },
      ...([['sma', 'SMA20'], ['ema', 'EMA50'], ['bb', 'Bollinger'], ['vol', 'Volume'], ['rsi', 'RSI'], ['macd', 'MACD']] as const).map(([k, t]) =>
        h('button', { class: 'chip', 'aria-pressed': String(o[k]), onclick: (e: Event) => { o[k] = !o[k]; (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(o[k])); save(); draw(); } }, t)));
    body.append(h('div', { class: 'toolbar' }, title, typeSel, tfBox, ind), host);

    const mkTf = (kind: string) => {
      tfBox.replaceChildren(...(kind === 'crypto' ? Object.keys(CRYPTO_TF) : Object.keys(EQ_TF)).map((t) => {
        const on = kind === 'crypto' ? o.cTf === t : o.eqTf === t;
        return h('button', { class: 'chip', 'aria-pressed': String(on), onclick: () => { if (kind === 'crypto') o.cTf = t as CryptoTf; else o.eqTf = t as EqTf; save(); mkTf(kind); fetchData(); } }, t);
      }));
    };

    function draw() {
      chart?.remove(); chart = null; host.replaceChildren();
      if (!pts.length) return;
      const grid = css('--line'), txt = css('--muted');
      chart = createChart(host, { autoSize: true, layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: txt, fontFamily: 'ui-monospace, monospace', fontSize: 11, panes: { separatorColor: grid, separatorHoverColor: grid + 'aa' } }, grid: { vertLines: { color: grid }, horzLines: { color: grid } }, rightPriceScale: { borderColor: grid }, timeScale: { borderColor: grid, timeVisible: typeof pts[0].time === 'number' }, crosshair: { mode: 0 } });
      const up = css('--up'), down = css('--down'), accent = css('--accent');
      const closes = pts.map((p) => p.c);
      const lineOf = (vals: number[], color: string, pane = 0, width: 1 | 2 = 1) => {
        const s = chart!.addSeries(LineSeries, { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false }, pane);
        s.setData(pts.map((p, i) => ({ time: p.time, value: vals[i] })).filter((d) => !Number.isNaN(d.value)));
        return s;
      };
      if (o.type === 'candles') chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderUpColor: up, borderDownColor: down }).setData(pts.map((p) => ({ time: p.time, open: p.o, high: p.h, low: p.l, close: p.c, ...(p.prov ? { color: css('--warn') + '55', borderColor: css('--warn'), wickColor: css('--warn') } : {}) })));
      else if (o.type === 'line') chart.addSeries(LineSeries, { color: accent, lineWidth: 2 }).setData(pts.map((p) => ({ time: p.time, value: p.c })));
      else chart.addSeries(AreaSeries, { lineColor: accent, topColor: accent + '55', bottomColor: accent + '05', lineWidth: 2 }).setData(pts.map((p) => ({ time: p.time, value: p.c })));
      if (o.sma) lineOf(sma(closes, 20), css('--c1'));
      if (o.ema) lineOf(ema(closes, 50), css('--c2'));
      if (o.bb) { const b = bollinger(closes, 20, 2); lineOf(b.upper, css('--c3')); lineOf(b.lower, css('--c3')); lineOf(b.mid, css('--c3') + '88'); }
      if (o.vol && pts.some((p) => p.v)) {
        const v = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: false });
        v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        v.setData(pts.map((p) => ({ time: p.time, value: p.v ?? 0, color: (p.c >= p.o ? up : down) + '66' })));
      }
      let pane = 1;
      if (o.rsi) {
        const s = lineOf(rsi(closes, 14), css('--c1'), pane);
        s.createPriceLine({ price: 70, color: down + '88', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
        s.createPriceLine({ price: 30, color: up + '88', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
        pane++;
      }
      if (o.macd) {
        const m = macd(closes);
        lineOf(m.line, css('--c1'), pane); lineOf(m.signal, css('--c2'), pane);
        const hs = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
        hs.setData(pts.map((p, i) => ({ time: p.time, value: m.hist[i], color: (m.hist[i] >= 0 ? up : down) + '99' })).filter((d) => !Number.isNaN(d.value)));
      }
      if (pane > 1 || o.macd) { const ps = chart.panes(); ps[0].setStretchFactor(3); for (let i = 1; i < ps.length; i++) ps[i].setStretchFactor(1); }
      chart.timeScale().fitContent();
      host.setAttribute('aria-label', `${label} ${o.type} chart, ${pts.length} points, last close ${pts.at(-1)!.c}`);
    }

    function fetchData() {
      cancel();
      const sel = bus.selected;
      mkTf(sel.kind === 'fx' ? 'fx' : sel.kind);
      if (sel.kind === 'eq') {
        title.textContent = `${sel.id} · USD · daily (end-of-day)`;
        cancel = ctx.load<EquitySnap>('equities', equities, 6 * 3600e3, (d, m) => {
          store.set('equities', d);
          const s = d.symbols.find((x) => x.symbol === sel.id);
          if (!s) return;
          label = sel.id;
          pts = s.bars.slice(-EQ_TF[o.eqTf]).map((b) => ({ time: b.t as Time, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, prov: b.p }));
          if (s.bars.at(-1)?.p && d.intraday) title.textContent = `${sel.id} · USD · daily · last candle = intraday, delayed, provisional (as of ${d.intraday.label})`;
          if (d.kind === 'simulated') title.textContent += ' · SIMULATED placeholder';
          void m; draw();
        });
      } else if (sel.kind === 'crypto') {
        title.textContent = `${sel.id.toUpperCase()} / USD`;
        cancel = ctx.load<Candle[]>(`candles:${sel.id}:${o.cTf}`, cryptoCandles(sel.id, o.cTf), 60e3, (cs) => { label = sel.id; pts = fromCandles(cs); draw(); });
      } else {
        title.textContent = `USD / ${sel.id} · ECB reference rate (line)`;
        cancel = ctx.load<FxData>('fx', fxBoard, 30 * 60e3, (d) => {
          const v = d.series[sel.id] ?? []; label = `USD/${sel.id}`;
          pts = v.map((c, i) => ({ time: d.days[i] as Time, o: c, h: c, l: c, c }));
          if (o.type === 'candles') { o.type = 'line'; typeSel.value = 'line'; }
          draw();
        });
      }
    }
    const off = bus.onSelect(fetchData);
    fetchData();
    return () => { off(); cancel(); chart?.remove(); };
  },
};
