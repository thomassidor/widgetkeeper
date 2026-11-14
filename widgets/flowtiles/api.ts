import type { App } from 'homey';
import { timeFormatRoutes } from '../../lib/timeFormat.js';
import type WidgetkeeperApp from '../../app.js';
import { logged, logPerf } from '../../lib/widgetApi.js';
import { tileShadowRoutes } from '../../lib/tileShadow.js';

type Homey = App['homey'];

export default {
  ...tileShadowRoutes,
  ...timeFormatRoutes,
  /** `board`: the board's name (empty: Tiles). Its tiles in the order added, with the Homey's clock and language. */
  async getState({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Flow Tiles', query);
    return { now: Date.now(), language: homey.i18n.getLanguage(), board: app.flowTiles.get(query.board) };
  },

  /** `{board, tile}`: a tap on a tile some Flow listens to; fires *A Flow Tile was tapped* (`{ok: true}`). */
  async tap({ homey, body }: {
    homey: Homey,
    body: { board?: unknown, tile?: unknown },
  }) {
    const app = homey.app as WidgetkeeperApp;
    return logged(app, 'Flow Tiles tap failed:', () => app.flowTiles.tap(body?.board, body?.tile));
  },
};
