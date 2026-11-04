import './styles.css';
import { Workspace } from './core/workspace.ts';
import { initPalette, type TabCtl, type TabId } from './core/palette.ts';
import { INVEST_WIDGETS, WIDGETS } from './widgets/registry.ts';
import { dataUrl } from './sources/providers.ts';

const TAB_KEY = 'md:tab:v1';
const pages: Record<TabId, { root: HTMLElement; btn: HTMLElement }> = {
  markets: { root: document.getElementById('workspace')!, btn: document.getElementById('tab-markets')! },
  invest: { root: document.getElementById('workspace-invest')!, btn: document.getElementById('tab-invest')! },
};
// Lazy: the investments workspace mounts on first visit, so the default view stays untouched.
const wss: Partial<Record<TabId, Workspace>> = {};
const workspace = (id: TabId) => (wss[id] ??= id === 'markets'
  ? new Workspace(pages.markets.root, WIDGETS, 'md:layout:v1')
  : new Workspace(pages.invest.root, INVEST_WIDGETS, 'md:layout:invest:v1'));

let current: TabId = 'markets';
function open(id: TabId): Workspace {
  current = id;
  try { localStorage.setItem(TAB_KEY, id); } catch { /* ignore */ }
  for (const [k, p] of Object.entries(pages)) {
    p.root.hidden = k !== id;
    p.btn.setAttribute('aria-selected', String(k === id));
  }
  const ws = workspace(id);
  ws.layoutAll();
  return ws;
}
const tabs: TabCtl = { active: () => workspace(current), open };
pages.markets.btn.addEventListener('click', () => open('markets'));
pages.invest.btn.addEventListener('click', () => open('invest'));
open(((): TabId => { try { return localStorage.getItem(TAB_KEY) === 'invest' ? 'invest' : 'markets'; } catch { return 'markets'; } })());

const pal = initPalette(tabs);
document.getElementById('open-pal')!.addEventListener('click', () => pal.show(true));
document.getElementById('reset')!.addEventListener('click', () => tabs.active().reset());

// Honest data-health line from the Action's last snapshot build.
fetch(dataUrl('meta.json')).then((r) => r.json()).then((m: Record<string, { ok: boolean; at: string; note: string }>) => {
  const bad = Object.entries(m).filter(([, v]) => !v.ok);
  const at = Object.values(m)[0]?.at;
  const el = document.getElementById('health')!;
  el.textContent = `Snapshots built ${at ? new Date(at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '?'}${bad.length ? ` · ${bad.length} source(s) failing: ${bad.map(([k]) => k).join(', ')}` : ' · all ok'}`;
  el.title = Object.entries(m).map(([k, v]) => `${k}: ${v.ok ? 'ok' : 'FAILED'} — ${v.note}`).join('\n');
  el.classList.toggle('bad', bad.length > 0);
}).catch(() => { document.getElementById('health')!.textContent = 'Snapshot status unavailable'; });
