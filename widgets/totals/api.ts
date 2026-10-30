import type { App } from 'homey';
import { chartState } from '../../lib/chartState.js';

type Homey = App['homey'];

export default {
  /**
   * `charts`: the value's running total (`~use`) over the period, and with compare over the one before
   * (`parseChartRequests()` in lib/chartState.ts). `{charts, language}`: `[current, previous?]`.
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    return chartState(homey, query, 'Totals');
  },
};
