import type { Bar } from './simulate.ts';

/** Priority subset refreshed intraday (15 symbols incl. AAPL, the chart's default). Everything else stays end-of-day. */
export const INTRADAY_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'JPM', 'LLY', 'V', 'NFLX', 'WMT', 'COST', 'AMD'];
/** Shared free key: 800 credits/day, sp500-tracker uses up to 320/weekday. market-desk total (EOD + intraday) must stay <= this. */
export const MARKET_DESK_DAILY_BUDGET = 250;
export const EOD_CREDITS_PER_DAY = 30;           // one /time_series credit per universe symbol
export const INTRADAY_MIN_GAP_MIN = 25;          // never refresh twice within 25 min (cron targets ~30)
export const INTRADAY_MAX_OPEN_RUNS = 14;        // 6.5 h session / 30 min + 1
export const INTRADAY_MAX_CLOSED_PROBES = 2;     // runs in the 13:30-21:00 UTC window that find the market closed (1-credit probe each)
export const worstCaseDailyCredits = () => EOD_CREDITS_PER_DAY + INTRADAY_MAX_OPEN_RUNS * INTRADAY_SYMBOLS.length + INTRADAY_MAX_CLOSED_PROBES;

export interface IntradayQuote { datetime: string; last_quote_at: number; open: number; high: number; low: number; close: number; volume: number; previous_close: number; is_market_open: boolean }
export interface IntradaySnap { generatedAt: string; source: string; quotes: Record<string, IntradayQuote> }

/** Weekday and 13:30-21:00 UTC (covers US market hours in both EDT and EST); the API's is_market_open decides the rest. */
export function inIntradayWindow(now: Date): boolean {
  const d = now.getUTCDay(), m = now.getUTCHours() * 60 + now.getUTCMinutes();
  return d >= 1 && d <= 5 && m >= 13 * 60 + 30 && m <= 21 * 60;
}

/** Rough day total for the log line: EOD + 15 per 30-min slot elapsed since 13:30 UTC (an estimate; nothing persists a ledger between runs). */
export function estimateDayTotal(now: Date): number {
  const m = now.getUTCHours() * 60 + now.getUTCMinutes() - (13 * 60 + 30);
  return EOD_CREDITS_PER_DAY + Math.min(INTRADAY_MAX_OPEN_RUNS, Math.max(1, Math.ceil(m / 30))) * INTRADAY_SYMBOLS.length;
}

/** Parses one /quote entry; throws on an error body. */
export function parseQuote(e: Record<string, unknown> | undefined, sym: string): IntradayQuote {
  if (!e || e.status === 'error' || e.close === undefined) throw new Error(`Twelve Data quote ${sym}: ${(e?.message as string) ?? 'missing'}`);
  return { datetime: String(e.datetime), last_quote_at: Number(e.last_quote_at ?? e.timestamp), open: +(e.open as string), high: +(e.high as string), low: +(e.low as string), close: +(e.close as string), volume: +((e.volume as string) || 0), previous_close: +(e.previous_close as string), is_market_open: e.is_market_open === true };
}

export interface MergeResult { symbols: { symbol: string; bars: Bar[] }[]; intraday: { asOfIso: string; label: string; lagMin: number; symbols: string[] } | null }
const pad = (n: number) => String(n).padStart(2, '0');
export const utcLabel = (iso: string) => { const d = new Date(iso); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; };

/** Appends a provisional (p:true) bar per intraday quote on top of EOD history, only when the quote's session is newer than the last EOD bar. */
export function mergeIntraday<S extends { symbol: string; bars: Bar[] }>(symbols: S[], snap: IntradaySnap | null): { symbols: S[]; intraday: MergeResult['intraday'] } {
  if (!snap) return { symbols, intraday: null };
  const used: string[] = []; let latest = 0;
  const out = symbols.map((s) => {
    const q = snap.quotes[s.symbol], last = s.bars.at(-1);
    if (!q || !last || q.datetime <= last.t || !Number.isFinite(q.close)) return s;
    used.push(s.symbol); latest = Math.max(latest, q.last_quote_at);
    return { ...s, bars: [...s.bars, { t: q.datetime, o: q.open, h: q.high, l: q.low, c: q.close, v: q.volume, p: true }] };
  });
  if (!used.length) return { symbols, intraday: null };
  const asOfIso = new Date(latest * 1000).toISOString();
  return { symbols: out, intraday: { asOfIso, label: utcLabel(asOfIso), lagMin: Math.max(0, Math.round((Date.parse(snap.generatedAt) - latest * 1000) / 60000)), symbols: used } };
}
