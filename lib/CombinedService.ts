import type Homey from 'homey';
import { byName, devicesAndZones, type AutocompleteItem } from './autocomplete.js';
import { describeCapability } from './capabilities.js';
import Timings from './Timings.js';
import ValueMatrixService, { matrixCaps } from './ValueMatrixService.js';

/** The value the widget combines, described from the first counted device that has it. */
export type CombinedCapability = {
  id: string, title: string, units: string | null, decimals: number | null, min: number | null, max: number | null,
};

/**
 * A counted device: its shown name and its reading (null before its first), or one that can't be read (deleted, or failing).
 * `otherUnits` (the device's units, `''` for none): it reports the value in units the others don't, so the widget lists
 * it but leaves it out of the combined value (a Wh meter among kWh ones would make the sum wrong).
 */
export type CombinedDevice = { id: string, name: string, value: number | null, otherUnits?: string } | { id: string, missing: true };

/** What the last request for a value counted, for Diagnostics' `combined`. */
type CombinedRequest = {
  at: string, picked: number, counted: number, notFound: number, units: string | null,
  otherUnits: { id: string, units: string }[],
};

/** Diagnostics keeps the last request of this many values. */
const DESCRIBED = 10;

export type CombinedState = { capability: CombinedCapability | null, devices: CombinedDevice[] };

/**
 * The Combined Value widget: one number capability read from several devices, which the widget folds into one value
 * (average, sum, lowest, highest, or lowest to highest). The values are Value Matrix's cells (its tracking, device names
 * and realtime `valuematrix:state`), so this only picks the devices: the `devices` setting's that have the value (a
 * deleted one counts as missing, one without the value isn't counted), or with none picked every device that has it.
 */
export default class CombinedService {

  constructor(
    private homey: Homey.App['homey'],
    private matrix: ValueMatrixService,
    private log: (...args: any[]) => void, // errors and warnings: always kept
    private debug: (...args: any[]) => void = () => {}, // routine detail: only with the `debugLog` setting on
  ) {}

  /** The last request per value, newest last. */
  private requests = new Map<string, CombinedRequest>();

  /** Diagnostics' `combined`: per value its last request (what was picked, counted, not found, in other units). */
  describe() {
    return Object.fromEntries(this.requests);
  }

  /** The `capability` setting: every number capability on the Homey, as Value Matrix's columns (units · N devices). */
  listCapabilities(query: string): Promise<AutocompleteItem[]> {
    return this.matrix.listColumns(query);
  }

  /** The counted devices' readings in order (by name when none were picked), and the value described. */
  async getState(capabilityId: string, deviceIds: string[]): Promise<CombinedState> {
    const tm = new Timings();
    const [devices] = await tm.time('devices', () => devicesAndZones(this.homey));
    const byId = new Map<string, any>(devices.map(d => [d.id, d]));
    const has = (d: any) => matrixCaps(d).includes(capabilityId);
    const counted: string[] = [];
    const gone: string[] = [];
    if (deviceIds.length) {
      for (const id of new Set(deviceIds)) {
        const d = byId.get(id);
        if (!d) gone.push(id);
        else if (has(d)) counted.push(id);
      }
    } else {
      counted.push(...devices.filter(has)
        .sort(byName(this.homey))
        .map(d => d.id as string));
    }
    // The value's units are those most counted devices report it in (the first's on a tie); the rest are left out.
    const unitsOf = (id: string) => describeCapability(byId.get(id).capabilitiesObj[capabilityId], capabilityId).units ?? '';
    const tally = new Map<string, number>();
    for (const id of counted) tally.set(unitsOf(id), (tally.get(unitsOf(id)) ?? 0) + 1);
    let units: string | null = null;
    for (const [u, n] of tally) if (units === null || n > tally.get(units)!) units = u;
    const first = counted.find(id => unitsOf(id) === units);
    const c = first ? describeCapability(byId.get(first).capabilitiesObj[capabilityId], capabilityId) : null;
    const capability = c ? { id: capabilityId, title: c.title, units: c.units, decimals: c.decimals, min: c.min, max: c.max } : null;
    const read = counted.length ? (await this.matrix.getState(counted, [capabilityId])).devices : [];
    const otherUnits: { id: string, units: string }[] = [];
    const out: CombinedDevice[] = read.map((d) => {
      // An unavailable device's value is only the last it reported: left out of the sum or average, and the tile says so.
      if ('missing' in d || d.offline) return { id: d.id, missing: true as const };
      const entry: CombinedDevice = { id: d.id, name: d.name, value: d.values[capabilityId] ?? null };
      const u = unitsOf(d.id);
      if (u !== units) {
        entry.otherUnits = u;
        otherUnits.push({ id: d.id, units: u });
      }
      return entry;
    });
    for (const id of gone) out.push({ id, missing: true });
    if (gone.length) this.log(`Combined value: ${gone.length} picked device(s) not found`);
    // Once while it stays so, not every refresh.
    const before = this.requests.get(capabilityId);
    if (otherUnits.length && JSON.stringify(otherUnits) !== JSON.stringify(before?.otherUnits ?? [])) {
      this.log(`Combined value ${capabilityId}: ${otherUnits.length} device(s) left out for other units than ${units || 'none'}: ${otherUnits.map(o => o.units || 'none').join(', ')}`);
    }
    this.requests.delete(capabilityId);
    this.requests.set(capabilityId, {
      at: new Date().toISOString(), picked: deviceIds.length, counted: counted.length, notFound: gone.length, units: capability ? capability.units : null, otherUnits,
    });
    while (this.requests.size > DESCRIBED) this.requests.delete(this.requests.keys().next().value!);
    this.debug(`Combined value ${capabilityId} of ${counted.length} devices${deviceIds.length ? '' : ' (every one with it)'}: ${tm.summary()}`);
    return { capability, devices: out };
  }

}
