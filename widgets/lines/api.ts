import type { App } from 'homey';
import { chartState } from '../../lib/chartState.js';

type Homey = App['homey'];

export default {
  /**
   * `charts`: each value over the same window (`parseChartRequests()` in lib/chartState.ts). `{charts, language}`: one
   * entry per value.
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    return chartState(homey, query, 'Lines');
  },
};
