import type { Result } from './data.ts';

type Child = Node | string | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k in el && k !== 'list' && k !== 'style') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c) el.append(c);
  return el;
}
export const svgNs = 'http://www.w3.org/2000/svg';
export function svg(tag: string, attrs: Record<string, string | number> = {}, ...kids: (SVGElement | string)[]): SVGElement {
  const el = document.createElementNS(svgNs, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
}

export const fmtNum = (v: number | null | undefined, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtPrice = (v: number) => fmtNum(v, v >= 1000 ? 0 : v >= 10 ? 2 : v >= 1 ? 3 : 5);
export const fmtPct = (v: number | null | undefined, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}%`);
export const cls = (v: number | null | undefined) => (v === null || v === undefined || v === 0 || Number.isNaN(v) ? 'flat' : v > 0 ? 'up' : 'down');
export function fmtAsOf(s: string | null): string {
  if (!s) return 'n/a';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Tiny dependency-free SVG line (used for sparklines and macro series). */
export function sparkline(values: number[], w = 90, hgt = 26, color?: string): SVGElement {
  const pts = values.filter(Number.isFinite);
  const s = svg('svg', { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, class: 'spark', 'aria-hidden': 'true' });
  if (pts.length < 2) return s;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * (w - 2) + 1).toFixed(1)},${(hgt - 2 - ((v - min) / span) * (hgt - 4)).toFixed(1)}`).join('');
  s.append(svg('path', { d, fill: 'none', 'stroke-width': 1.4, stroke: color ?? (pts.at(-1)! >= pts[0] ? 'var(--up)' : 'var(--down)') }));
  return s;
}

export type BadgeState = Pick<Result<unknown>, 'source' | 'asOf' | 'status' | 'note'> | { status: 'error'; source: string; asOf: null; note: string } | { status: 'loading'; source: ''; asOf: null; note?: string };
export function renderBadge(el: HTMLElement, b: BadgeState) {
  el.className = `badge ${b.status}`;
  el.textContent = b.status === 'loading' ? 'LOADING' : `${b.status.toUpperCase()} · ${b.source} · as of ${fmtAsOf(b.asOf)}`;
  el.title = b.note ? `${b.source}: ${b.note}` : b.status === 'live' ? 'Fetched just now from the provider API' : b.status === 'cached' ? 'Served from this browser\'s cache' : b.status === 'snapshot' ? 'Pre-built file from the scheduled GitHub Action' : '';
  el.setAttribute('role', 'status');
}
