import type { App } from 'homey';
import { timeFormatRoutes } from '../../lib/timeFormat.js';
import { chartState } from '../../lib/chartState.js';

type Homey = App['homey'];

export default {
  ...timeFormatRoutes,
  /**
   * `charts`: the value across and the value up over the same window (`parseChartRequests()` in lib/chartState.ts).
   * `{charts, language}`: `[x, y]`.
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    return chartState(homey, query, 'Scatter (XY)');
  },
};
