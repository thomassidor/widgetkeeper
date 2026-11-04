import type { App } from 'homey';
import { timeFormatRoutes } from '../../lib/timeFormat.js';
import type WidgetkeeperApp from '../../app.js';
import { logged, logPerf } from '../../lib/widgetApi.js';

type Homey = App['homey'];

export default {
  ...timeFormatRoutes,
  async getPollen({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Pollen', query);
    return logged(app, 'Pollen forecast failed:', () => app.pollen.getPollen());
  },
};
