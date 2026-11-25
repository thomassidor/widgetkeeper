import type { App } from 'homey';
import type WidgetkeeperApp from '../../app.js';
import { tileShadowOf } from '../../lib/tileShadow.js';
import { idList, logged, logPerf, requireId } from '../../lib/widgetApi.js';

type Homey = App['homey'];

/** Group Quick Action: Device Quick Actions' devices and trigger, for one tile that acts on them all. */
export default {
  /**
   * `{state, tileShadow}`: the devices as Quick Actions reads them, each with its room (the tile's name when they share
   * one), and the app's Tile shadows, which ride along so the widget needs no request for them (`lib/tileShadow.ts`).
   */
  async getState({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Group quick action', query);
    const state = await logged(app, 'Group quick action state failed:', () => app.quickActions.getState(idList(query.deviceIds), { zones: true }));
    return { state, tileShadow: tileShadowOf(homey) };
  },

  /** One device's quick action; the widget sends one per device, at once. */
  async trigger({ homey, body }: {
    homey: Homey,
    body: { deviceId?: string, value?: unknown },
  }) {
    const app = homey.app as WidgetkeeperApp;
    return logged(app, () => `Group quick action failed, body: ${JSON.stringify(body)}`, async () => {
      await app.quickActions.trigger(requireId(body?.deviceId, 'deviceId'), body.value);
      return { ok: true };
    });
  },
};
