import type { App } from 'homey';
import type WidgetkeeperApp from '../../app.js';
import { idList, logged, logPerf } from '../../lib/widgetApi.js';

type Homey = App['homey'];

export default {
  /** `deviceIds`: comma-separated; `values`: `all`, else the readings only. */
  async getState({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Value board', query);
    return logged(app, 'Value board state failed:', () => app.valueBoard.getState(idList(query.deviceIds), query.values === 'all' ? 'all' : 'readings'));
  },
};
