import type { App } from 'homey';
import { timeFormatRoutes } from '../../lib/timeFormat.js';
import type WidgetkeeperApp from '../../app.js';
import { chartState } from '../../lib/chartState.js';
import type { PriceHistoryAnswer } from '../../lib/ElectricityService.js';
import { logged } from '../../lib/widgetApi.js';

type Homey = App['homey'];

/** `prices=<from>~<to>` (epoch ms), or null. */
function priceSpan(v: string | undefined): [number, number] | null {
  const [from, to] = String(v ?? '').split('~').map(Number);
  return Number.isFinite(from) && Number.isFinite(to) && to > from ? [from, to] : null;
}

export default {
  ...timeFormatRoutes,
  /**
   * `charts`: the value's running total (`~use`) over the period, and with compare over the one before
   * (`parseChartRequests()` in lib/chartState.ts). `{charts, language}`: `[current, previous?]`. With `prices=<from>~<to>`
   * (Show: Cost, 1.2.0) also `prices`, the hourly prices over both periods with Homey Energy's costs
   * (`ElectricityService.getPriceHistory()`), or null when they couldn't be read: the totals still come.
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    const span = priceSpan(query.prices);
    if (!span) return chartState(homey, query, 'Totals');
    const app = homey.app as WidgetkeeperApp;
    const [state, prices] = await Promise.all([
      chartState(homey, query, 'Totals'),
      logged(app, 'Totals prices failed:', () => app.electricity.getPriceHistory(span[0], span[1]))
        .catch((): PriceHistoryAnswer | null => null),
    ]);
    return { ...state, prices };
  },
};
