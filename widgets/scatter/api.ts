import type { App } from 'homey';
import { chartState } from '../../lib/chartState.js';

type Homey = App['homey'];

export default {
  /**
   * `charts`: the value across and the value up over the same window (`parseChartRequests()` in lib/chartState.ts).
   * `{charts, language}`: `[x, y]`.
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    return chartState(homey, query, 'X against Y');
  },
};
