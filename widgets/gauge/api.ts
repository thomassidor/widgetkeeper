import type { App } from 'homey';
import { chartState } from '../../lib/chartState.js';

type Homey = App['homey'];

export default {
  /**
   * `charts`: the value's window (`parseChartRequests()` in lib/chartState.ts).
   * `{charts, language}`: one entry.
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    return chartState(homey, query, 'Gauge');
  },
};
