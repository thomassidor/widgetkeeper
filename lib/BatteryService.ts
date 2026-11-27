import type Homey from 'homey';
import DeviceTracker, { type TrackedEntry, offlineFlag } from './DeviceTracker.js';
import { deviceNamer } from './deviceNames.js';
import Timings from './Timings.js';

export const BATTERY_STATE_EVENT = 'battery:state';

/**
 * One picked device's battery: `level` (`measure_battery`, 0–100) and `low` (`alarm_battery`), each null when the device
 * hasn't it or hasn't reported; `none` for a device with neither (the widget leaves it out).
 */
export type BatteryDevice =
  | { id: string, name: string, level: number | null, low: boolean | null, offline?: true }
  | { id: string, name: string, none: true }
  | { id: string, missing: true };

type Tracked = TrackedEntry & {
  /** The capability ids read: the first `measure_battery` and the first `alarm_battery` (a sub-capability too). */
  levelCap: string | null,
  lowCap: string | null,
  level: number | null,
  low: boolean | null,
};

/** The device's first capability with this base id (`measure_battery` or `measure_battery.main`). */
function capOf(device: any, base: string): string | null {
  const caps = device?.capabilitiesObj || {};
  const ids: string[] = device?.capabilities || Object.keys(caps);
  return ids.find(id => id.split('.')[0] === base && caps[id] && caps[id].getable !== false) ?? null;
}

const levelOf = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
const lowOf = (v: unknown) => (typeof v === 'boolean' ? v : null);

function read(device: any) {
  const levelCap = capOf(device, 'measure_battery');
  const lowCap = capOf(device, 'alarm_battery');
  const caps = device?.capabilitiesObj || {};
  return {
    levelCap, lowCap,
    level: levelCap ? levelOf(caps[levelCap]?.value) : null,
    low: lowCap ? lowOf(caps[lowCap]?.value) : null,
  };
}

/** The Batteries widget: the battery level (or the low-battery alarm) of each picked device, kept live. */
export default class BatteryService {

  private tracker: DeviceTracker<Tracked>;

  constructor(
    private homey: Homey.App['homey'],
    private log: (...args: any[]) => void, // errors and warnings: always kept
    private debug: (...args: any[]) => void = () => {}, // routine detail: only with the `debugLog` setting on
  ) {
    this.tracker = new DeviceTracker<Tracked>({
      homey,
      debug,
      what: 'Battery',
      // A device that gains or loses a battery capability is tracked again.
      signature: (device) => { const r = read(device); return `${r.levelCap}|${r.lowCap}`; },
      create: async device => read(device),
      listen: (t, device) => {
        const instances = [];
        if (t.levelCap) {
          instances.push(device.makeCapabilityInstance(t.levelCap, (value: unknown) => {
            t.level = levelOf(value);
            this.homey.api.realtime(BATTERY_STATE_EVENT, { deviceId: t.key, capabilityId: 'measure_battery', value: t.level });
          }));
        }
        if (t.lowCap) {
          instances.push(device.makeCapabilityInstance(t.lowCap, (value: unknown) => {
            t.low = lowOf(value);
            this.homey.api.realtime(BATTERY_STATE_EVENT, { deviceId: t.key, capabilityId: 'alarm_battery', value: t.low });
          }));
        }
        this.debug(`Tracking battery of ${device.name} (${t.key}): ${[t.levelCap, t.lowCap].filter(Boolean).join(', ') || 'none'}`);
        return instances;
      },
      refresh: (t, device) => { Object.assign(t, read(device)); },
      label: t => `battery of ${t.name}`,
    });
  }

  start() {
    this.tracker.start();
  }

  async stop() {
    this.tracker.stop();
  }

  /** One entry per device, in the order asked for. A deleted device doesn't fail the others. */
  async getState(deviceIds: string[]): Promise<BatteryDevice[]> {
    const tm = new Timings();
    const show = await deviceNamer(this.homey, tm, this.log, 'Batteries');
    const out = await this.tracker.each(deviceIds, tm, this.log, 'Battery device', async (t, id): Promise<BatteryDevice> => (
      !t.levelCap && !t.lowCap
        ? { id, name: show(t.name, t.zone), none: true }
        : { id, name: show(t.name, t.zone), level: t.level, low: t.low, ...offlineFlag(t) }));
    this.debug(`Batteries state for ${deviceIds.length} devices: ${tm.summary()}`);
    return out;
  }

}
