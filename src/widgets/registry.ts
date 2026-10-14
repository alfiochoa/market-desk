import type { WidgetDef } from '../core/widget.ts';
import { chartWidget } from './chart.ts';
import { cryptoWidget, fxWidget, heatmapWidget, quoteWidget, watchlistWidget } from './boards.ts';
import { macroWidget, newsWidget, portfolioWidget } from './info.ts';

/** Order = default layout order = Alt+1..9 order on a fresh workspace. */
export const WIDGETS: WidgetDef[] = [chartWidget, watchlistWidget, quoteWidget, cryptoWidget, fxWidget, macroWidget, heatmapWidget, newsWidget, portfolioWidget];
export const byType = (t: string) => WIDGETS.find((w) => w.type === t);
