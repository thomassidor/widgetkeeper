import type { App } from 'homey';
import { timeFormatRoutes } from '../../lib/timeFormat.js';
import { chartState } from '../../lib/chartState.js';

type Homey = App['homey'];

export default {
  ...timeFormatRoutes,
  /**
   * `charts`: the value over today and over the last days (`parseChartRequests()` in lib/chartState.ts).
   * `{charts, language}`: `[today, past]`.
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    return chartState(homey, query, 'Daily Profile');
  },
};
