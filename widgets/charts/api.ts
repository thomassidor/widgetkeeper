import type { App } from 'homey';
import { timeFormatRoutes } from '../../lib/timeFormat.js';
import { chartState } from '../../lib/chartState.js';

type Homey = App['homey'];

export default {
  ...timeFormatRoutes,
  /**
   * `charts`: comma-separated chart requests (`parseChartRequests()` in lib/chartState.ts), one per series: its value
   * over the window it draws. `{charts, language}`: one entry per series, in order.
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    return chartState(homey, query, 'History');
  },
};
