/** Static reference lists. `w` is an ILLUSTRATIVE relative size weight for the heatmap, not a live market cap. */
export interface Equity { symbol: string; name: string; sector: string; w: number; px: number }
export const EQUITIES: Equity[] = [
  { symbol: 'AAPL', name: 'Apple', sector: 'Technology', w: 30, px: 210 },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'Technology', w: 31, px: 430 },
  { symbol: 'NVDA', name: 'NVIDIA', sector: 'Technology', w: 33, px: 130 },
  { symbol: 'AVGO', name: 'Broadcom', sector: 'Technology', w: 9, px: 170 },
  { symbol: 'ORCL', name: 'Oracle', sector: 'Technology', w: 4, px: 140 },
  { symbol: 'CRM', name: 'Salesforce', sector: 'Technology', w: 3, px: 280 },
  { symbol: 'AMD', name: 'AMD', sector: 'Technology', w: 2.5, px: 150 },
  { symbol: 'INTC', name: 'Intel', sector: 'Technology', w: 1, px: 24 },
  { symbol: 'AMZN', name: 'Amazon', sector: 'Consumer', w: 20, px: 190 },
  { symbol: 'TSLA', name: 'Tesla', sector: 'Consumer', w: 9, px: 250 },
  { symbol: 'HD', name: 'Home Depot', sector: 'Consumer', w: 3.5, px: 360 },
  { symbol: 'COST', name: 'Costco', sector: 'Consumer', w: 4, px: 900 },
  { symbol: 'WMT', name: 'Walmart', sector: 'Consumer', w: 6, px: 70 },
  { symbol: 'GOOGL', name: 'Alphabet', sector: 'Communication', w: 21, px: 175 },
  { symbol: 'META', name: 'Meta Platforms', sector: 'Communication', w: 14, px: 560 },
  { symbol: 'NFLX', name: 'Netflix', sector: 'Communication', w: 4, px: 700 },
  { symbol: 'DIS', name: 'Disney', sector: 'Communication', w: 2, px: 105 },
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financials', w: 7, px: 230 },
  { symbol: 'V', name: 'Visa', sector: 'Financials', w: 5.5, px: 280 },
  { symbol: 'BAC', name: 'Bank of America', sector: 'Financials', w: 3, px: 42 },
  { symbol: 'LLY', name: 'Eli Lilly', sector: 'Health Care', w: 8, px: 800 },
  { symbol: 'UNH', name: 'UnitedHealth', sector: 'Health Care', w: 5, px: 520 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Health Care', w: 3.7, px: 160 },
  { symbol: 'MRK', name: 'Merck', sector: 'Health Care', w: 2.8, px: 110 },
  { symbol: 'ABBV', name: 'AbbVie', sector: 'Health Care', w: 3.2, px: 180 },
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', w: 4.5, px: 115 },
  { symbol: 'CVX', name: 'Chevron', sector: 'Energy', w: 2.8, px: 155 },
  { symbol: 'PG', name: 'Procter & Gamble', sector: 'Staples', w: 4, px: 170 },
  { symbol: 'KO', name: 'Coca-Cola', sector: 'Staples', w: 2.8, px: 65 },
  { symbol: 'PEP', name: 'PepsiCo', sector: 'Staples', w: 2.3, px: 170 },
];

export const CRYPTO = [
  { id: 'bitcoin', symbol: 'BTC', pair: 'BTCUSDT' }, { id: 'ethereum', symbol: 'ETH', pair: 'ETHUSDT' }, { id: 'binancecoin', symbol: 'BNB', pair: 'BNBUSDT' },
  { id: 'solana', symbol: 'SOL', pair: 'SOLUSDT' }, { id: 'ripple', symbol: 'XRP', pair: 'XRPUSDT' }, { id: 'cardano', symbol: 'ADA', pair: 'ADAUSDT' },
  { id: 'dogecoin', symbol: 'DOGE', pair: 'DOGEUSDT' }, { id: 'tron', symbol: 'TRX', pair: 'TRXUSDT' }, { id: 'chainlink', symbol: 'LINK', pair: 'LINKUSDT' },
  { id: 'avalanche-2', symbol: 'AVAX', pair: 'AVAXUSDT' },
];

export const FX_QUOTES = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'MXN'];

export const FRED_SERIES = [
  { id: 'DGS10', label: '10-Year Treasury yield (%)' },
  { id: 'T10Y2Y', label: '10Y minus 2Y spread (pp)' },
  { id: 'FEDFUNDS', label: 'Effective federal funds rate (%, monthly)' },
  { id: 'UNRATE', label: 'US unemployment rate (%, monthly)' },
];

export const NEWS_FEEDS = [
  { source: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { source: 'ECB', url: 'https://www.ecb.europa.eu/rss/press.html' },
  { source: 'SEC', url: 'https://www.sec.gov/news/pressreleases.rss' },
];
