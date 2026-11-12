import type Homey from 'homey';
import { describeCapability, type CapabilityDescription } from './capabilities.js';
import DeviceTracker, { readZones, zoneRef, type TrackedEntry, offlineFlag } from './DeviceTracker.js';
import { deviceNamer, roomNamer } from './deviceNames.js';
import Timings from './Timings.js';
import { valueCaps } from './ValueService.js';

export const VB_STATE_EVENT = 'valueboard:state';

/** The `values` setting: `readings` (measured values, meters and alarms) or `all` (everything Device Values can show). */
export type ValueBoardMode = 'readings' | 'all';

/** One value of a device: its capability described, and its value. */
type BoardValue = CapabilityDescription & { capabilityId: string, value: unknown };

export type BoardDevice =
  | { id: string, name: string, zone: { id: string, name: string } | null, values: BoardValue[], offline?: true }
  | { id: string, missing: true };

type Tracked = TrackedEntry & {
  caps: { capabilityId: string, capability: CapabilityDescription }[],
  values: Record<string, unknown>,
};

/** What `readings` keeps: measured values, meters and alarms (by the base id, so `measure_temperature.outdoor` too). */
export function isReading(capabilityId: string): boolean {
  return /^(measure|meter|alarm)_/.test(capabilityId.split('.')[0]);
}

function readCaps(device: any): Tracked['caps'] {
  return valueCaps(device).map(capabilityId => ({ capabilityId, capability: describeCapability(device.capabilitiesObj[capabilityId], capabilityId) }));
}

function readValues(device: any, caps: Tracked['caps']): Record<string, unknown> {
  return Object.fromEntries(caps.map(c => [c.capabilityId, device.capabilitiesObj?.[c.capabilityId]?.value ?? null]));
}

/**
 * Value Board: every value of the picked devices (or only their readings), each device with its zone. The widget groups
 * them into rooms or devices and judges the few values that have a sense of their own (batteries, alarms, CO₂ …).
 */
export default class ValueBoardService {

  private tracker: DeviceTracker<Tracked>;

  constructor(
    private homey: Homey.App['homey'],
    private log: (...args: any[]) => void, // errors and warnings: always kept
    private debug: (...args: any[]) => void = () => {}, // routine detail: only with the `debugLog` setting on
  ) {
    this.tracker = new DeviceTracker<Tracked>({
      homey,
      debug,
      what: 'Value board capabilities',
      // The capabilities and their kinds: a device that gains, loses or changes one is tracked again.
      signature: device => readCaps(device).map(c => `${c.capabilityId}:${c.capability.type}`).join(),
      create: async (device) => {
        const caps = readCaps(device);
        return { caps, values: readValues(device, caps) };
      },
      listen: (t, device) => {
        const instances = t.caps.map(({ capabilityId }) => device.makeCapabilityInstance(capabilityId, (value: unknown) => {
          t.values[capabilityId] = value ?? null;
          this.homey.api.realtime(VB_STATE_EVENT, { deviceId: t.key, capabilityId, value: value ?? null });
        }));
        this.debug(`Tracking value board device ${device.name} (${t.key}): ${t.caps.length} values`);
        return instances;
      },
      refresh: (t, device) => {
        t.caps = readCaps(device);
        t.values = readValues(device, t.caps);
      },
      label: t => `value board device ${t.name}`,
    });
  }

  start() {
    this.tracker.start();
  }

  async stop() {
    this.tracker.stop();
  }

  /**
   * One entry per device, in the order asked for, with its zone and its values in the device's own order (`readings`:
   * only measured values, meters and alarms). A deleted device doesn't fail the others.
   */
  async getState(deviceIds: string[], mode: ValueBoardMode = 'readings'): Promise<BoardDevice[]> {
    const tm = new Timings();
    const zonesP = readZones(this.homey, tm, this.log, 'Value board');
    const show = await deviceNamer(this.homey, tm, this.log, 'Value board');
    const room = roomNamer(this.homey);
    const out = await this.tracker.each(deviceIds, tm, this.log, 'Value board device', async (t, id): Promise<BoardDevice> => ({
      id,
      name: show(t.name, t.zone),
      zone: zoneRef(await zonesP, t.zone, room),
      ...offlineFlag(t),
      values: t.caps
        .filter(c => mode === 'all' || isReading(c.capabilityId))
        .map(c => ({ capabilityId: c.capabilityId, ...c.capability, value: t.values[c.capabilityId] ?? null })),
    }));
    this.debug(`Value board state for ${deviceIds.length} devices: ${tm.summary()}`);
    return out;
  }

}
