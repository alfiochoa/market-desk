import { bus } from './bus.ts';
import { h } from './ui.ts';
import { CRYPTO, EQUITIES, FX_QUOTES } from '../universe.ts';
import { WIDGETS } from '../widgets/registry.ts';
import type { Workspace } from './workspace.ts';

interface Cmd { label: string; hint: string; run(): void }

export function buildCommands(ws: Workspace): Cmd[] {
  const sel = (s: Parameters<typeof bus.select>[0]) => () => { ws.add('chart'); bus.select(s); ws.focus('chart'); };
  return [
    ...EQUITIES.map((e) => ({ label: `${e.symbol} — ${e.name}`, hint: 'US equity', run: sel({ kind: 'eq', id: e.symbol }) })),
    ...CRYPTO.map((c) => ({ label: `${c.symbol} — ${c.id}`, hint: 'Crypto', run: sel({ kind: 'crypto', id: c.id }) })),
    ...FX_QUOTES.map((q) => ({ label: `USD/${q}`, hint: 'FX', run: sel({ kind: 'fx', id: q }) })),
    ...WIDGETS.map((w) => ({ label: `Add / jump to widget: ${w.title}`, hint: 'Widget', run: () => ws.add(w.type) })),
    { label: 'Reset layout', hint: 'Workspace', run: () => ws.reset() },
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

export function initPalette(ws: Workspace) {
  const cmds = buildCommands(ws);
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
    if (v) { input.value = ''; idx = 0; render(); input.focus(); } else (document.querySelector('.panel .head') as HTMLElement | null)?.focus();
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
    else if (e.altKey && /^[1-9]$/.test(e.key === 'Dead' ? '' : e.code.replace('Digit', ''))) { e.preventDefault(); ws.focusNth(Number(e.code.replace('Digit', ''))); }
  });
  return { show };
}
