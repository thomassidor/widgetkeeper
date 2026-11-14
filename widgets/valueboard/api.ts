import type { App } from 'homey';
import type WidgetkeeperApp from '../../app.js';
import { idList, logged, logPerf } from '../../lib/widgetApi.js';
import { tileNameRoutes, withTileNames } from '../../lib/TileNameService.js';
import { tileShadowRoutes } from '../../lib/tileShadow.js';

type Homey = App['homey'];

export default {
  ...tileShadowRoutes,
  ...tileNameRoutes,

  /** `deviceIds`: comma-separated; `values`: `all`, else the readings only. */
  async getState({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Value board', query);
    return withTileNames(homey, query, logged(app, 'Value board state failed:', () => app.valueBoard.getState(idList(query.deviceIds), query.values === 'all' ? 'all' : 'readings')));
  },
};
