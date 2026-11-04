import type { App } from 'homey';
import { timeFormatRoutes } from '../../lib/timeFormat.js';
import { chartState } from '../../lib/chartState.js';

type Homey = App['homey'];

export default {
  ...timeFormatRoutes,
  /**
   * `charts`: each layer over the same window, the total (when picked) first (`parseChartRequests()` in lib/chartState.ts).
   * `{charts, language}`: one entry per value.
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    return chartState(homey, query, 'Stacked');
  },
};
