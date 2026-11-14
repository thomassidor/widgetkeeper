import type { App } from 'homey';
import type WidgetkeeperApp from '../../app.js';
import { lightRoutes } from '../../lib/lightRoutes.js';
import { idList, logged, logPerf } from '../../lib/widgetApi.js';
import { tileNameRoutes, withTileNames } from '../../lib/TileNameService.js';
import { tileShadowRoutes } from '../../lib/tileShadow.js';

type Homey = App['homey'];

/** Lights by Room: Light Controls' service (`app.lights`), with each room's zone icon. */
export default {
  ...tileShadowRoutes,
  ...tileNameRoutes,

  async getState({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Light rooms', query);
    return withTileNames(homey, query, logged(app, 'Light rooms state failed:', async () => {
      const lights = await app.lights.getState(idList(query.deviceIds));
      const zones = [...new Set(lights.flatMap(d => ('missing' in d || !d.zone ? [] : [d.zone.id])))];
      return { lights, zoneIcons: await app.lights.zoneIcons(zones) };
    }));
  },

  ...lightRoutes('Light rooms'),
};
