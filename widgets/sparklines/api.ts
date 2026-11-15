import type { App } from 'homey';
import type WidgetkeeperApp from '../../app.js';
import { chartStates, parseChartRequests } from '../../lib/chartState.js';
import { idList, logged, logPerf } from '../../lib/widgetApi.js';
import { tileNameRoutes, withTileNames } from '../../lib/TileNameService.js';

type Homey = App['homey'];

export default {
  ...tileNameRoutes,

  /**
   * `slots`: comma-separated `<deviceId>:<capabilityId>`; `window`: `<span>~<from>~<end>~<unit>`, the window the widget
   * draws (1.2.0, any span, read as the chart widgets' are), or `span` (`24h`, `today` …; a page loaded before).
   */
  async getState({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Sparklines', query);
    const slots = idList(query.slots);
    const requests = query.window ? parseChartRequests(slots.map(s => `${s}~${query.window}`).join(',')) : null;
    return withTileNames(homey, query, logged(app, 'Sparklines state failed:', () => (requests
      ? chartStates(app, requests)
      : app.sparklines.getState(slots, query.span))));
  },
};
