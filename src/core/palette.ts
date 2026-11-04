import { bus } from './bus.ts';
import { h } from './ui.ts';
import { CRYPTO, EQUITIES, FX_QUOTES } from '../universe.ts';
import { INVEST_WIDGETS, WIDGETS } from '../widgets/registry.ts';
import type { Workspace } from './workspace.ts';

export type TabId = 'markets' | 'invest';
/** Tab controller from main.ts: open() switches (mounting lazily) and returns that tab's workspace. */
export interface TabCtl { active(): Workspace; open(id: TabId): Workspace }

interface Cmd { label: string; hint: string; run(): void }

export function buildCommands(tabs: TabCtl): Cmd[] {
  const sel = (s: Parameters<typeof bus.select>[0]) => () => { const ws = tabs.open('markets'); ws.add('chart'); bus.select(s); ws.focus('chart'); };
  return [
    ...EQUITIES.map((e) => ({ label: `${e.symbol} — ${e.name}`, hint: 'US equity', run: sel({ kind: 'eq', id: e.symbol }) })),
    ...CRYPTO.map((c) => ({ label: `${c.symbol} — ${c.id}`, hint: 'Crypto', run: sel({ kind: 'crypto', id: c.id }) })),
    ...FX_QUOTES.map((q) => ({ label: `USD/${q}`, hint: 'FX', run: sel({ kind: 'fx', id: q }) })),
    ...WIDGETS.map((w) => ({ label: `Add / jump to widget: ${w.title}`, hint: 'Widget · Markets', run: () => tabs.open('markets').add(w.type) })),
    ...INVEST_WIDGETS.filter((w) => !WIDGETS.includes(w)).map((w) => ({ label: `Add / jump to widget: ${w.title}`, hint: 'Widget · Simulator', run: () => tabs.open('invest').add(w.type) })),
    { label: 'Go to tab: Markets', hint: 'Tab', run: () => tabs.open('markets') },
    { label: 'Go to tab: Simulator', hint: 'Tab', run: () => tabs.open('invest') },
    { label: 'Reset layout (current tab)', hint: 'Workspace', run: () => tabs.active().reset() },
  ];
}

/** Subsequence-ish scoring: exact prefix > word prefix > substring > subsequence. */
export function score(q: string, text: string): number {
  q = q.toLowerCase(); const t = text.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 100;
  if (t.split(/[\s—/:]+/).some((w) => w.startsWith(q))) return 80;
  if (t.includes(q)) return 60;
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length ? 20 : 0;
}

export function initPalette(tabs: TabCtl) {
  const cmds = buildCommands(tabs);
  let open = false, idx = 0, shown: Cmd[] = [];
  const input = h('input', { type: 'search', class: 'pal-input', placeholder: 'Search symbols, widgets, actions…', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list', 'aria-autocomplete': 'list', 'aria-label': 'Command palette' });
  const list = h('ul', { id: 'pal-list', class: 'pal-list', role: 'listbox' });
  const dlg = h('div', { class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette', hidden: true }, h('div', { class: 'pal-box' }, input, list, h('div', { class: 'pal-foot' }, '↑↓ navigate · Enter run · Esc close')));
  document.body.append(dlg);

  const render = () => {
    shown = cmds.map((c) => ({ c, s: score(input.value.trim(), c.label) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 12).map((x) => x.c);
    idx = Math.min(idx, Math.max(shown.length - 1, 0));
    list.replaceChildren(...shown.map((c, i) => h('li', { role: 'option', id: `pal-${i}`, 'aria-selected': String(i === idx), class: i === idx ? 'on' : '', onmousedown: (e: Event) => { e.preventDefault(); run(i); } }, h('span', {}, c.label), h('em', {}, c.hint))));
    if (!shown.length) list.append(h('li', { class: 'none' }, 'No matches'));
    input.setAttribute('aria-activedescendant', shown.length ? `pal-${idx}` : '');
  };
  const show = (v: boolean) => {
    open = v; dlg.hidden = !v;
    if (v) { input.value = ''; idx = 0; render(); input.focus(); } else (document.querySelector('.grid:not([hidden]) .panel .head') as HTMLElement | null)?.focus();
  };
  const run = (i: number) => { const c = shown[i]; show(false); c?.run(); };

  input.addEventListener('input', () => { idx = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, shown.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { run(idx); e.preventDefault(); }
  });
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) show(false); });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); show(!open); }
    else if (e.key === 'Escape' && open) show(false);
    else if (e.altKey && /^[1-9]$/.test(e.key === 'Dead' ? '' : e.code.replace('Digit', ''))) { e.preventDefault(); tabs.active().focusNth(Number(e.code.replace('Digit', ''))); }
  });
  return { show };
}
