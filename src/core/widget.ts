import { loadSWR, type Provider } from './data.ts';
import { renderBadge, type BadgeState } from './ui.ts';

export interface WidgetCtx {
  setBadge(b: BadgeState): void;
  /** Loads through the fallback chain + SWR cache; calls render for every result; shows the badge; reports total failure in the body. */
  load<T>(key: string, providers: Provider<T>[], ttlMs: number, render: (data: T, meta: { source: string; asOf: string | null; status: string }) => void, opts?: { badge?: boolean }): () => void;
}
export interface WidgetDef { type: string; title: string; w: number; h: number; mount(body: HTMLElement, ctx: WidgetCtx): void | (() => void) }

export function makeCtx(body: HTMLElement, badgeEl: HTMLElement, storage: Storage | null): WidgetCtx {
  let alive = true;
  const ctx: WidgetCtx = {
    setBadge: (b) => renderBadge(badgeEl, b),
    load(key, providers, ttlMs, render, opts) {
      const showBadge = opts?.badge !== false;
      let mine = true;
      const run = () => {
        if (showBadge) ctx.setBadge({ status: 'loading', source: '', asOf: null });
        void loadSWR(key, providers, { ttlMs, storage }, (r) => {
          if (!alive || !mine) return;
          body.querySelector('.err')?.remove();
          if (showBadge) ctx.setBadge(r);
          try { render(r.data, r); } catch (e) {
            console.error(`[${key}] render failed`, e);
            const d = document.createElement('div');
            d.className = 'err';
            d.textContent = `Render error: ${(e as Error).message}`;
            body.prepend(d);
          }
        }, (e) => {
          if (!alive || !mine) return;
          if (showBadge) ctx.setBadge({ status: 'error', source: providers.map((p) => p.label).join(' → '), asOf: null, note: e.message });
          body.querySelector('.err')?.remove();
          const d = document.createElement('div');
          d.className = 'err';
          d.setAttribute('role', 'alert');
          d.innerHTML = '<b>Data unavailable.</b> ';
          d.append(e.message, ' ');
          const b = document.createElement('button');
          b.textContent = 'Retry';
          b.onclick = run;
          d.append(b);
          body.prepend(d);
        });
      };
      run();
      return () => { mine = false; };
    },
  };
  return Object.assign(ctx, { destroy: () => { alive = false; } });
}
