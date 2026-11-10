import type { App } from 'homey';
import type WidgetkeeperApp from '../app.js';
import type { LightChange } from './LightService.js';
import { idList, keyResult, logged, requireId } from './widgetApi.js';

type Homey = App['homey'];

/**
 * Light Controls' and Lights by Room's routes besides `/state` (both widgets are `app.lights`): a light's change, the
 * zones' Moods and starting one. `what` names the widget in the log (`Light`, `Light rooms`).
 */
export function lightRoutes(what: string) {
  return {
    async set({ homey, body }: {
      homey: Homey,
      body: { deviceId?: string } & LightChange,
    }) {
      const app = homey.app as WidgetkeeperApp;
      return logged(app, () => `${what} change failed, body: ${JSON.stringify(body)}`, async () => {
        await app.lights.set(requireId(body?.deviceId, 'deviceId'), { dim: body.dim, onoff: body.onoff, temperature: body.temperature, hue: body.hue, saturation: body.saturation });
        return { ok: true };
      });
    },

    /** The Moods of these zones (Light Controls' `palette: moods`, Lights by Room's Moods row). */
    async getMoods({ homey, query }: {
      homey: Homey,
      query: Record<string, string>,
    }) {
      const app = homey.app as WidgetkeeperApp;
      return logged(app, `${what} moods failed:`, async () => ({ moods: await app.lights.getMoods(idList(query.zones)) }));
    },

    /** Starts a Mood through the personal API key: `{ok: false, reason}` without a usable one. */
    async setMood({ homey, body }: {
      homey: Homey,
      body: { id?: string },
    }) {
      const app = homey.app as WidgetkeeperApp;
      return keyResult(app, 'Could not start the mood', () => app.lights.setMood(String(body?.id ?? '')));
    },
  };
}
