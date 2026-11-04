import type { App } from 'homey';
import type WidgetkeeperApp from '../../app.js';
import { idList, logged, logPerf, requireId } from '../../lib/widgetApi.js';

type Homey = App['homey'];

export default {
  /** `capabilityId`: the value; `deviceIds` (optional, comma-separated): the devices picked, none for every one with it. */
  async getState({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Combined value', query);
    const capabilityId = requireId(query.capabilityId, 'capabilityId');
    return logged(app, 'Combined value state failed:', () => app.combined.getState(capabilityId, idList(query.deviceIds)));
  },
};
