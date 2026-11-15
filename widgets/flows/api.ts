import type { App } from 'homey';
import type WidgetkeeperApp from '../../app.js';
import { idList, keyResult, logged, logPerf, requireId } from '../../lib/widgetApi.js';
import { tileShadowOf } from '../../lib/tileShadow.js';

type Homey = App['homey'];

export default {
  /**
   * `ids`: comma-separated slot ids, `flow:<id>` or `advanced:<id>`. `{state, tileShadow}`: the buttons, and the app's
   * Tile shadows, which ride along so the widget needs no request for them (`lib/tileShadow.ts`).
   */
  async getState({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Flow buttons', query);
    const state = await logged(app, 'Flow buttons state failed:', () => app.flows.getState(idList(query.ids)));
    return { state, tileShadow: tileShadowOf(homey) };
  },

  /**
   * `{id}`: starts the flow. Without a usable API key it answers `{ok: false, reason}` (`noKey`, `keyScope`,
   * `keyInvalid`), so the widget can say what to do.
   */
  async trigger({ homey, body }: {
    homey: Homey,
    body: { id?: unknown },
  }) {
    const app = homey.app as WidgetkeeperApp;
    const id = requireId(body?.id, 'id');
    return keyResult(app, 'Flow start failed', () => app.flows.trigger(id));
  },
};
