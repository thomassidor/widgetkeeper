import type { App } from 'homey';
import { timeFormatRoutes } from '../../lib/timeFormat.js';
import { chartState } from '../../lib/chartState.js';

type Homey = App['homey'];

export default {
  ...timeFormatRoutes,
  /**
   * `charts`: each value over the same window, as picked (`parseChartRequests()` in lib/chartState.ts).
   * `{charts, language}`: one entry per value.
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    return chartState(homey, query, 'Ranking');
  },
};
