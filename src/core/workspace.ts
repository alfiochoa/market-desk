import { COLS, findSlot, resolve, type Item } from '../lib/layout.ts';
import { byType, WIDGETS } from '../widgets/registry.ts';
import { makeCtx } from './widget.ts';
import { h } from './ui.ts';

const KEY = 'md:layout:v1';
export const ROW = 34;

export function defaultLayout(): Item[] {
  const items: Item[] = [];
  for (const w of WIDGETS) { const s = findSlot(items, w.w, w.h); items.push({ id: w.type, type: w.type, x: s.x, y: s.y, w: w.w, h: w.h }); }
  return resolve(items);
}
function loadLayout(): Item[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Item[] | null;
    if (Array.isArray(raw) && raw.every((i) => byType(i.type) && Number.isFinite(i.x + i.y + i.w + i.h))) return resolve(raw);
  } catch { /* fall through */ }
  return defaultLayout();
}

export class Workspace {
  items: Item[] = loadLayout();
  private els = new Map<string, { el: HTMLElement; destroy: () => void }>();
  constructor(private root: HTMLElement) { root.classList.add('grid'); root.setAttribute('role', 'main'); this.sync(); window.addEventListener('resize', () => this.layoutAll()); }

  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch { /* ignore */ } }
  private stacked() { return window.matchMedia('(max-width: 900px)').matches; }

  private place(it: Item) {
    const e = this.els.get(it.id)?.el;
    if (!e) return;
    if (this.stacked()) { e.style.cssText = `height:${Math.min(it.h, 14) * ROW}px`; return; }
    e.style.cssText = `left:${(it.x / COLS) * 100}%;width:${(it.w / COLS) * 100}%;top:${it.y * ROW}px;height:${it.h * ROW}px`;
  }
  layoutAll() {
    this.items.forEach((i) => this.place(i));
    this.root.style.flex = 'none';
    this.root.style.height = this.stacked() ? 'auto' : `${Math.max(0, ...this.items.map((i) => i.y + i.h)) * ROW + 8}px`;
    [...this.els.keys()].forEach((id) => { const n = this.order().indexOf(id) + 1; const k = this.els.get(id)!.el.querySelector('.kbd'); if (k) k.textContent = n <= 9 ? `Alt+${n}` : ''; });
  }
  order() { return [...this.items].sort((a, b) => a.y - b.y || a.x - b.x).map((i) => i.id); }

  private sync() {
    for (const [id, v] of this.els) if (!this.items.some((i) => i.id === id)) { v.destroy(); v.el.remove(); this.els.delete(id); }
    for (const it of this.items) if (!this.els.has(it.id)) this.create(it);
    this.layoutAll();
  }

  private create(it: Item) {
    const def = byType(it.type)!;
    const badge = h('span', { class: 'badge loading' });
    const body = h('div', { class: 'body' });
    const kbd = h('span', { class: 'kbd', 'aria-hidden': 'true' });
    const head = h('header', { class: 'head', tabIndex: 0, 'aria-label': `${def.title} panel header. Arrow keys move, Shift plus arrows resize.` },
      h('span', { class: 'ttl' }, def.title), kbd, badge,
      h('button', { class: 'x', 'aria-label': `Close ${def.title}`, onclick: () => this.remove(it.id) }, '✕'));
    const handle = h('div', { class: 'resize', 'aria-hidden': 'true' });
    const el = h('section', { class: 'panel', 'data-widget': it.type, 'aria-label': def.title }, head, body, handle);
    this.root.append(el);
    const ctx = makeCtx(body, badge, (() => { try { return localStorage; } catch { return null; } })());
    let cleanup: void | (() => void) = undefined;
    try { cleanup = def.mount(body, ctx); } catch (e) { body.append(h('div', { class: 'err', role: 'alert' }, `Widget crashed: ${(e as Error).message}`)); }
    this.els.set(it.id, { el, destroy: () => { (ctx as unknown as { destroy(): void }).destroy(); if (typeof cleanup === 'function') cleanup(); } });
    this.wire(it.id, head, handle, el);
  }

  private mutate(id: string, patch: Partial<Item>) {
    this.items = resolve(this.items.map((i) => (i.id === id ? { ...i, ...patch } : i)), id);
    this.layoutAll(); this.save();
  }

  private wire(id: string, head: HTMLElement, handle: HTMLElement, el: HTMLElement) {
    const drag = (mode: 'move' | 'size') => (ev: PointerEvent) => {
      if (this.stacked() || (ev.target as HTMLElement).closest('button')) return;
      ev.preventDefault();
      const start = this.items.find((i) => i.id === id)!;
      const colW = this.root.clientWidth / COLS, x0 = ev.clientX, y0 = ev.clientY;
      el.classList.add('dragging');
      const move = (e: PointerEvent) => {
        const dx = Math.round((e.clientX - x0) / colW), dy = Math.round((e.clientY - y0) / ROW);
        this.items = resolve(this.items.map((i) => (i.id === id ? (mode === 'move' ? { ...i, x: start.x + dx, y: start.y + dy } : { ...i, w: Math.max(3, start.w + dx), h: Math.max(4, start.h + dy) }) : i)), id);
        this.layoutAll();
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); el.classList.remove('dragging'); this.save(); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    };
    head.addEventListener('pointerdown', drag('move'));
    handle.addEventListener('pointerdown', drag('size'));
    head.addEventListener('keydown', (e) => {
      const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const v = d[e.key];
      if (!v || (e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      const it = this.items.find((i) => i.id === id)!;
      this.mutate(id, e.shiftKey ? { w: Math.max(3, it.w + v[0]), h: Math.max(4, it.h + v[1]) } : { x: it.x + v[0], y: it.y + v[1] });
    });
  }

  has(type: string) { return this.items.some((i) => i.type === type); }
  add(type: string) {
    const def = byType(type);
    if (!def || this.has(type)) { this.focus(type); return; }
    const s = findSlot(this.items, def.w, def.h);
    this.items = resolve([...this.items, { id: type, type, x: s.x, y: s.y, w: def.w, h: def.h }]);
    this.sync(); this.save(); this.focus(type);
  }
  remove(id: string) { this.items = this.items.filter((i) => i.id !== id); this.items = resolve(this.items); this.sync(); this.save(); }
  reset() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } this.items = defaultLayout(); this.sync(); }
  focus(type: string) { const e = this.els.get(type)?.el; e?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); (e?.querySelector('.head') as HTMLElement | null)?.focus(); }
  focusNth(n: number) { const id = this.order()[n - 1]; if (id) this.focus(id); }
}
