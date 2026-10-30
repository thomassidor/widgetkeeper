import type { App } from 'homey';
import { chartState } from '../../lib/chartState.js';

type Homey = App['homey'];

export default {
  /**
   * `charts`: the value over the span, up to 400 points (`~fine`; `parseChartRequests()` in lib/chartState.ts).
   * `{charts, language}`: `[value]`.
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    return chartState(homey, query, 'Min/Max');
  },
};
