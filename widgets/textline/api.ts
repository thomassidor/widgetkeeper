import type { App } from 'homey';
import type WidgetkeeperApp from '../../app.js';
import { logged, logPerf } from '../../lib/widgetApi.js';
import { tileShadowRoutes } from '../../lib/tileShadow.js';

type Homey = App['homey'];

export default {
  ...tileShadowRoutes,
  /**
   * `board`: the note's name (its text, written by Flows); `variable`: a Logic variable id (its value, through Flow
   * Variables' service, which sends its changes as `variables:state`). Either may be left out.
   */
  async getState({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Notes', query);
    const language = homey.i18n.getLanguage();
    const board = typeof query.board === 'string' ? app.textLines.get(query.board) : null;
    const id = query.variable;
    const variable = id && id !== 'none'
      ? (await logged(app, 'Notes variable failed:', () => app.variables.getState([id])))[0] ?? null
      : null;
    return { language, board, variable };
  },
};
