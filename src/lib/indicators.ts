/** Technical indicators implemented from their textbook definitions (no TA library). Output arrays align 1:1 with input; warm-up slots are NaN. */

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA seeded with the SMA of the first `period` values; alpha = 2 / (period + 1). */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Bollinger Bands with population standard deviation (as in Bollinger's definition). */
export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = mid.map(() => NaN);
  const lower = mid.map(() => NaN);
  for (let i = period - 1; i < values.length; i++) {
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(v / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

/** Wilder's RSI: first average is a simple mean of `period` changes, then Wilder smoothing. */
export function rsi(values: number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  const calc = () => (avgL === 0 ? (avgG === 0 ? 50 : 100) : 100 - 100 / (1 + avgG / avgL));
  out[period] = calc();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = calc();
  }
  return out;
}

/** MACD = EMA(fast) - EMA(slow); signal = EMA(signalPeriod) of the MACD line; histogram = MACD - signal. */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => (Number.isNaN(f[i]) || Number.isNaN(s[i]) ? NaN : f[i] - s[i]));
  const first = line.findIndex((v) => !Number.isNaN(v));
  const signal = new Array<number>(values.length).fill(NaN);
  if (first >= 0) {
    const sig = ema(line.slice(first), signalPeriod);
    sig.forEach((v, i) => { signal[first + i] = v; });
  }
  const hist = line.map((v, i) => (Number.isNaN(v) || Number.isNaN(signal[i]) ? NaN : v - signal[i]));
  return { line, signal, hist };
}
