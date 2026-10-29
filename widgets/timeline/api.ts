import type { App } from 'homey';
import { timelineState } from '../../lib/timelineState.js';

type Homey = App['homey'];

export default {
  /**
   * `slots`: each value, as picked; `from`: the window's start (epoch ms, on the phone's clock). `{rows, language}`: one
   * entry per value (`timelineState()` in lib/timelineState.ts).
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    return timelineState(homey, query);
  },
};
