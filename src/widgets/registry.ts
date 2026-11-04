import type { WidgetDef } from '../core/widget.ts';
import { chartWidget } from './chart.ts';
import { cryptoWidget, fxWidget, heatmapWidget, quoteWidget, watchlistWidget } from './boards.ts';
import { macroWidget, newsWidget, portfolioWidget } from './info.ts';
import { allocationWidget, performanceWidget } from './invest.ts';

/** Order = default layout order = Alt+1..9 order on a fresh workspace. */
export const WIDGETS: WidgetDef[] = [chartWidget, watchlistWidget, quoteWidget, cryptoWidget, fxWidget, macroWidget, heatmapWidget, newsWidget, portfolioWidget];
/** Widgets of the "Simulator" tab. The lot tracker is shared with the Markets tab (same local data). */
export const INVEST_WIDGETS: WidgetDef[] = [allocationWidget, performanceWidget, portfolioWidget];
