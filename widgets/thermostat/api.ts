import type { App } from 'homey';
import type WidgetkeeperApp from '../../app.js';
import { shownName } from '../../lib/deviceNames.js';
import type { CapValue } from '../../lib/ThermostatService.js';
import { parseSlot } from '../../lib/ValueService.js';
import { logged, logPerf, requireId } from '../../lib/widgetApi.js';

type Homey = App['homey'];

/**
 * The thermostat's state, its name as the widgets show device names (`ThermostatService` keeps the full one for the
 * Flow token), with the value beside its name (`sensor`, a Device Values slot `<deviceId>:<capabilityId>`, tracked by
 * `app.values`) as `sensor: {deviceId, capabilityId, capability, value}`. A sensor that can't be read is left out: it
 * never fails the thermostat.
 */
export async function thermostatState(homey: Homey, app: Pick<WidgetkeeperApp, 'thermostat' | 'values'>, deviceId: string, sensor?: string) {
  const slot = sensor && parseSlot(sensor) ? sensor : null;
  const [full, values] = await Promise.all([
    app.thermostat.getState(deviceId),
    slot ? app.values.getState([slot]) : [],
  ]);
  if ('missing' in full) return full;
  const state = { ...full, name: shownName(homey, full.name) };
  const s = values[0];
  if (!s || 'missing' in s) return state;
  return { ...state, sensor: { deviceId: s.deviceId, capabilityId: s.capabilityId, capability: s.capability, value: s.value } };
}

export default {
  /** `deviceId`, and `sensor` (optional): the value beside the name. */
  async getState({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    const deviceId = requireId(query.deviceId, 'deviceId');
    logPerf(app, 'Thermostat', query);
    return logged(app, 'Thermostat state failed:', () => thermostatState(homey, app, deviceId, query.sensor));
  },

  /** `deviceId`, `values`, and for a button's tap `instance` (the widget's) and `button` (1–3): the Flow card *… was tapped*. */
  async apply({ homey, body }: {
    homey: Homey,
    body: { deviceId?: string, values?: CapValue[], instance?: unknown, button?: unknown },
  }) {
    const app = homey.app as WidgetkeeperApp;
    return logged(app, () => `Thermostat apply failed, body: ${JSON.stringify(body)}`, async () => {
      const deviceId = requireId(body?.deviceId, 'deviceId');
      if (!Array.isArray(body.values)) throw new Error('Missing values');
      await app.thermostat.apply(deviceId, body.values);
      // Not awaited: the tap's answer doesn't wait for the Flows (`tapped()` never throws).
      if (body.instance != null) void app.thermostatPresets.tapped({ instance: body.instance, button: body.button, deviceId, values: body.values });
      return { ok: true };
    });
  },
};
