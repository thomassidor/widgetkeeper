import type { App } from 'homey';
import type WidgetkeeperApp from '../../app.js';
import { keyResult, logged, logPerf, requireId } from '../../lib/widgetApi.js';
import { tileShadowOf } from '../../lib/tileShadow.js';

type Homey = App['homey'];
type Body = { design?: unknown, part?: unknown, value?: unknown, instance?: unknown };

export default {
  /**
   * `design`: a design's id. A design and what it shows (`CustomWidgetService.getState()`), or `{missing: true}`;
   * `tileShadow` rides along (`lib/tileShadow.ts`).
   */
  async getState({ homey, query }: { homey: Homey, query: Record<string, string> }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Widget Builder', query);
    const state = await logged(app, 'Widget Builder state failed:', () => app.custom.getState(query.design || ''));
    return { ...state, tileShadow: tileShadowOf(homey) };
  },

  /** `{design, part, value}`: a switch, slider, stepper or choice sets its own device value (the app's token). */
  async set({ homey, body }: { homey: Homey, body: Body }) {
    const app = homey.app as WidgetkeeperApp;
    return logged(app, 'Widget Builder set failed:', () => app.custom.setValue(requireId(body?.design, 'design'), requireId(body?.part, 'part'), body?.value));
  },

  /** `{design, part, value}`: a variable, stepper or choice sets its Homey variable (the personal API key). */
  async variable({ homey, body }: { homey: Homey, body: Body }) {
    const app = homey.app as WidgetkeeperApp;
    const [design, part] = [requireId(body?.design, 'design'), requireId(body?.part, 'part')];
    return keyResult(app, 'Widget Builder variable failed', async () => { await app.custom.setVariable(design, part, body?.value); });
  },

  /** `{design, part}`: a button starts its Flow (the personal API key). */
  async flow({ homey, body }: { homey: Homey, body: Body }) {
    const app = homey.app as WidgetkeeperApp;
    const [design, part] = [requireId(body?.design, 'design'), requireId(body?.part, 'part')];
    return keyResult(app, 'Widget Builder Flow failed', async () => { await app.custom.startFlow(design, part); });
  },

  /** `{design, part, instance}`: a button without a Flow fires *A Widget Builder button was tapped*. */
  async tap({ homey, body }: { homey: Homey, body: Body }) {
    const app = homey.app as WidgetkeeperApp;
    const instance = typeof body?.instance === 'string' ? body.instance : undefined;
    return logged(app, 'Widget Builder tap failed:', () => app.custom.tap(requireId(body?.design, 'design'), requireId(body?.part, 'part'), instance));
  },
};
