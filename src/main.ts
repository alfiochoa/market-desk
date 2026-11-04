import './styles.css';
import { Workspace } from './core/workspace.ts';
import { initPalette } from './core/palette.ts';
import { dataUrl } from './sources/providers.ts';

const ws = new Workspace(document.getElementById('workspace')!);
const pal = initPalette(ws);
document.getElementById('open-pal')!.addEventListener('click', () => pal.show(true));
document.getElementById('reset')!.addEventListener('click', () => ws.reset());

// Honest data-health line from the Action's last snapshot build.
fetch(dataUrl('meta.json')).then((r) => r.json()).then((m: Record<string, { ok: boolean; at: string; note: string }>) => {
  const bad = Object.entries(m).filter(([, v]) => !v.ok);
  const at = Object.values(m)[0]?.at;
  const el = document.getElementById('health')!;
  el.textContent = `Snapshots built ${at ? new Date(at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '?'}${bad.length ? ` · ${bad.length} source(s) failing: ${bad.map(([k]) => k).join(', ')}` : ' · all ok'}`;
  el.title = Object.entries(m).map(([k, v]) => `${k}: ${v.ok ? 'ok' : 'FAILED'} — ${v.note}`).join('\n');
  el.classList.toggle('bad', bad.length > 0);
}).catch(() => { document.getElementById('health')!.textContent = 'Snapshot status unavailable'; });
