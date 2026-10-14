/** Fallback chain + stale-while-revalidate cache. Every result carries provenance so widgets can show an honest badge. */
export type Status = 'live' | 'cached' | 'snapshot';
export interface Result<T> { data: T; source: string; asOf: string | null; status: Status; note?: string }
export interface Provider<T> {
  id: string;
  label: string;
  /** 'live' = fetched from the origin API by the browser; 'snapshot' = a file built by the scheduled Action. */
  kind: 'live' | 'snapshot';
  /** Per-provider timeout override (ms). */
  timeoutMs?: number;
  fetch(ctx: { fetch: typeof fetch; signal: AbortSignal }): Promise<{ data: T; asOf: string | null; source?: string }>;
}
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
interface Entry<T> { savedAt: number; data: T; source: string; asOf: string | null; kind: Provider<T>['kind'] }
export interface Options { ttlMs: number; storage?: KV | null; fetchImpl?: typeof fetch; timeoutMs?: number; now?: () => number }

const PREFIX = 'md:cache:';

function read<T>(storage: KV | null | undefined, key: string): Entry<T> | null {
  try { const s = storage?.getItem(PREFIX + key); return s ? (JSON.parse(s) as Entry<T>) : null; } catch { return null; }
}
function write<T>(storage: KV | null | undefined, key: string, e: Entry<T>) {
  try { storage?.setItem(PREFIX + key, JSON.stringify(e)); } catch { /* quota or privacy mode: cache is best-effort */ }
}

export async function fetchChain<T>(providers: Provider<T>[], o: Options): Promise<{ result: Omit<Result<T>, 'status'> & { kind: Provider<T>['kind'] }; errors: string[] }> {
  const errors: string[] = [];
  const f = o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  for (const p of providers) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), p.timeoutMs ?? o.timeoutMs ?? 8000);
    try {
      const r = await p.fetch({ fetch: f, signal: ac.signal });
      return { result: { data: r.data, asOf: r.asOf, source: r.source ?? p.label, kind: p.kind }, errors };
    } catch (e) {
      errors.push(`${p.label}: ${e instanceof Error ? e.message : String(e)}`);
    } finally { clearTimeout(timer); }
  }
  throw Object.assign(new Error(`All sources failed — ${errors.join('; ')}`), { errors });
}

/**
 * Resolves `onResult` with the best data available, possibly twice:
 *  1. fresh cache  -> status 'cached', no network;
 *  2. stale cache  -> status 'cached' immediately, then the revalidated result (live/snapshot);
 *  3. no cache     -> straight to the chain.
 * If the whole chain fails and a stale entry exists it is kept (with a note); otherwise `onError` fires.
 */
export async function loadSWR<T>(key: string, providers: Provider<T>[], o: Options, onResult: (r: Result<T>) => void, onError: (e: Error) => void): Promise<void> {
  const now = o.now ?? Date.now;
  const hit = read<T>(o.storage, key);
  const fresh = hit && now() - hit.savedAt < o.ttlMs;
  if (hit) onResult({ data: hit.data, source: hit.source, asOf: hit.asOf, status: 'cached', note: fresh ? undefined : 'stale, revalidating' });
  if (fresh) return;
  let result: Awaited<ReturnType<typeof fetchChain<T>>>['result'];
  try {
    result = (await fetchChain(providers, o)).result;
  } catch (e) {
    const err = e as Error;
    if (hit) onResult({ data: hit.data, source: hit.source, asOf: hit.asOf, status: 'cached', note: `refresh failed — ${err.message}` });
    else onError(err);
    return;
  }
  write(o.storage, key, { savedAt: now(), data: result.data, source: result.source, asOf: result.asOf, kind: result.kind });
  onResult({ data: result.data, source: result.source, asOf: result.asOf, status: result.kind });
}
