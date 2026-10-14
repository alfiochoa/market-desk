# market-desk

A keyboard-driven, dark, dense **market terminal** that runs 100% static on GitHub Pages: a draggable widget workspace, a command palette, charts with indicators, crypto / FX / macro boards, an end-of-day equities watchlist, official news feeds, a local portfolio tracker and a heatmap. No backend, no API keys in the browser.

**Live demo: https://alfiochoa.github.io/market-desk/** · [![CI](https://github.com/alfiochoa/market-desk/actions/workflows/ci.yml/badge.svg)](https://github.com/alfiochoa/market-desk/actions/workflows/ci.yml)

![market-desk overview](docs/screens/overview.png)

> **Demo / educational only. Not investment advice.** Data is delayed, indicative or end-of-day and can be stale or wrong. Every panel carries a badge with its **source, as-of time and state** (`LIVE`, `CACHED`, `SNAPSHOT`, `ERROR`). Equity prices are end-of-day snapshots, never real-time, and when no real equity source was reachable the snapshot is explicitly labelled **SIMULATED** (see [Limitations](#honest-limitations)). Not affiliated with, endorsed by or sponsored by any data provider.

## Why

Free public market data is scattered across APIs that go down, rate-limit, or lack CORS. This project is a reference for building a *resilient* data UI on a static host: every widget has a fallback chain, a stale-while-revalidate cache and a visible provenance badge, so one provider outage degrades a panel instead of blanking the page.

## Gallery (taken with headless Chromium from the deployed site)

| | |
|---|---|
| ![chart](docs/screens/chart-indicators.png) **Chart**: candles/line/area, volume, SMA, EMA, Bollinger, RSI, MACD (own implementations, unit-tested). Live BTC/USD from Binance public market data. | ![palette](docs/screens/palette.png) **Command palette** (`Ctrl/⌘+K`): symbols, jump to / add widgets, reset layout. |
| ![macro](docs/screens/macro.png) **Macro**: US Treasury par yield curve (latest vs ~1 month earlier) and FRED series. | ![heatmap](docs/screens/heatmap.png) **Heatmap**: treemap by sector, coloured by daily % change (own d3-hierarchy layout). |
| ![portfolio](docs/screens/portfolio.png) **Portfolio** (localStorage): lots, average cost, realized/unrealized P&L, CSV export/import. Values shown use the SIMULATED placeholder prices. | <img src="docs/screens/mobile.png" width="260" alt="mobile"> **Responsive**: panels stack on small screens. |

## Features

1. **Workspace**: drag headers to move, drag the corner to resize (keyboard: focus a header, arrows move, Shift+arrows resize). 12-column grid, layout saved in `localStorage`, *Reset layout* button, close/re-add any widget from the palette.
2. **Command palette** `Ctrl/⌘+K`, and **`Alt+1…9`** to focus the Nth panel.
3. **Price chart** with timeframes and indicators (see [Indicators](#indicators)); [lightweight-charts](https://github.com/tradingview/lightweight-charts) (Apache-2.0) is used for rendering only.
4. **Crypto board** with 7-day sparklines.
5. **FX board** (ECB reference rates).
6. **Macro**: Treasury yield curve + FRED series.
7. **US equities watchlist + quote panel** from an end-of-day snapshot.
8. **News**: official RSS headlines (Fed, ECB, SEC), deduplicated; links open the publisher.
9. **Portfolio tracker** (browser-only).
10. **Heatmap** of the watchlist by daily % change.

### Indicators

`src/lib/indicators.ts`: SMA, EMA (SMA-seeded), Bollinger (population σ), Wilder RSI, MACD(12,26,9). Tests check hand-computed values, the textbook Bollinger example (mean 5, σ 2 → bands 1 and 9) and the published Wilder/StockCharts RSI worked example (70.53, 66.32, 66.55, 69.41, 66.36, 57.97).

## Data sources

| Widget | Primary (browser, direct) | Fallback chain | Terms / licence |
|---|---|---|---|
| Crypto board | [CoinGecko public API](https://www.coingecko.com/en/api) | Binance public market data (`data-api.binance.vision`) → Action snapshot | CoinGecko: free API requires attribution ("Powered by CoinGecko") and is rate-limited. Binance: public market-data endpoints under [Binance Terms of Use](https://www.binance.com/en/terms). |
| Crypto chart | Binance public klines | CoinGecko OHLC (no volume) → 7-day sparkline snapshot | as above |
| FX | [Frankfurter](https://frankfurter.dev) (ECB reference rates) | Action snapshot | Free, open source, no key. ECB reference rates are indicative, published once per working day; free reuse with source attribution. |
| Yield curve | [US Treasury daily par yield curve](https://home.treasury.gov/resource-center/data-chart-center/interest-rates) XML | Action snapshot | US government data (public domain). |
| FRED series (DGS10, T10Y2Y, FEDFUNDS, UNRATE) | *none*: `fredgraph.csv` sends no CORS headers | Action snapshot (CSV fetched server-side, no key) | [FRED](https://fred.stlouisfed.org/) data, Federal Reserve Bank of St. Louis; cite the source, not endorsed by the St. Louis Fed. Only series published by the Fed / US Treasury / BLS are used; no S&P/NASDAQ/CBOE-licensed series. |
| US equities | *none* (browsers can't call EOD sources) | Action snapshot: **Stooq** CSV → optional **Twelve Data** (free key as repo secret) → last snapshot → SIMULATED placeholder | Stooq currently answers scripted clients with HTTP 403 / a browser-verification page. That is an access control and is **not bypassed**. Twelve Data free-plan terms apply if you add a key. |
| News | *none* (feeds lack CORS) | Action snapshot of [Federal Reserve](https://www.federalreserve.gov/feeds/feeds.htm), [ECB](https://www.ecb.europa.eu/rss/), [SEC](https://www.sec.gov/news/pressreleases.rss) RSS | Official feeds; only headline + link are stored. Fetched ≤ once/hour with an identifying User-Agent (SEC fair-access). |

Libraries: lightweight-charts (Apache-2.0; its attribution logo is kept on charts), d3-hierarchy (ISC), Vite (MIT).

## Architecture (short; details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md))

```mermaid
flowchart LR
  subgraph Browser
    W[Widgets] --> C[loadSWR: cache + fallback chain]
    C -->|1. live| API[(CORS APIs: CoinGecko, Binance, Frankfurter, Treasury)]
    C -->|2. snapshot| D[/data/*.json/]
    C <--> LS[(localStorage cache)]
  end
  subgraph GitHub Actions hourly
    B[build-snapshots.ts] --> D
    B --> SRC[(Stooq, FRED, RSS, ...)]
  end
  D --> Pages[GitHub Pages]
```

Each source is a `Provider` (`live` or `snapshot`). `loadSWR` serves a fresh cache without network, serves a stale entry immediately while revalidating, walks the chain with a per-provider timeout, and on total failure keeps stale data (with a note) or shows an explicit error with *Retry*. The hourly **Build snapshots & deploy Pages** workflow rebuilds `public/data/*.json` (each source independent; failure keeps the previous file and is shown in the header's health line), builds the site and deploys it; once a day it also commits the snapshots as a fallback baseline.

## Run locally

```bash
git clone https://github.com/alfiochoa/market-desk && cd market-desk
npm ci
npm run dev        # http://localhost:5173
```

Other scripts (`scripts/gallery.mjs` re-takes the screenshots from the deployed site; `scripts/video/` records and assembles the demo video): `npm test` (unit), `npm run build && npm run e2e` (Playwright smoke), `npm run lint`, `npm run typecheck`, `npm run snapshots` (rebuild `public/data`).

## Quality

**36 unit tests (vitest) + 9 Playwright smoke tests**, all green in CI.

* **Unit tests (vitest)**: indicators vs reference values, P&L math and CSV round-trip, layout engine (no overlap), fallback chain / SWR cache / timeout / corrupt storage with mocked `fetch`, provider normalisation (CoinGecko → Binance → snapshot), RSS dedupe, Treasury XML, Stooq and Twelve Data parsers.
* **Playwright smoke (CI)**: loads the *built* site with provider APIs mocked by fixtures; asserts every widget renders with its badge, the palette opens and navigates, `Alt+2` focus, portfolio persistence, drag + persisted layout + reset, a **full provider outage** (all live widgets fall back to snapshots and say so) and a **snapshot failure** (explicit error, not a blank panel).
* **CI**: ESLint, `tsc`, tests, build, dependency-free secret scan (tracked files and full history), Playwright.

## Honest limitations

* **Equities are not live and, right now, not real.** Stooq blocks scripted downloads, so unless you add a free `TWELVE_DATA_API_KEY` repository secret the equities snapshot is a deterministic **SIMULATED placeholder**, labelled as such in every badge, banner and the portfolio panel. The pipeline, parsers and fallbacks are in place and tested with fixtures; the Twelve Data path was not exercised against the live API.
* Crypto/FX/yield-curve panels call third-party APIs from your browser; they can be rate-limited or geo-blocked (Binance's main host is blocked in some countries; the public market-data mirror is used). Falling back is automatic and visible.
* FRED, news and equities only update when the Action runs (hourly, best effort: GitHub may delay scheduled jobs).
* Heatmap tile size uses *illustrative* weights, not live market caps. The yield curve compares the latest date with ~21 trading days earlier.
* Portfolio is browser-local (clearing site data deletes it), average-cost only, no taxes/FX/splits/dividends.
* No trading, no alerts, no accounts. Not investment advice.

## Credits

Concept inspired by the idea of a widget-based market workspace (e.g. OpenTerminal). All code, layout, copy and name here are original; no code, text or assets were copied and none of its unofficial endpoints are used.

MIT licensed.
