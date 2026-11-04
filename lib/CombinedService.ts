import type Homey from 'homey';
import { devicesAndZones, type AutocompleteItem } from './autocomplete.js';
import { describeCapability } from './capabilities.js';
import Timings from './Timings.js';
import ValueMatrixService, { matrixCaps } from './ValueMatrixService.js';

/** The value the widget combines, described from the first counted device that has it. */
export type CombinedCapability = {
  id: string, title: string, units: string | null, decimals: number | null, min: number | null, max: number | null,
};

/** A counted device: its shown name and its reading (null before its first), or one that can't be read (deleted, or failing). */
export type CombinedDevice = { id: string, name: string, value: number | null } | { id: string, missing: true };

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
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map(d => d.id as string));
    }
    const first = counted.length ? byId.get(counted[0]) : null;
    const c = first ? describeCapability(first.capabilitiesObj[capabilityId], capabilityId) : null;
    const capability = c ? { id: capabilityId, title: c.title, units: c.units, decimals: c.decimals, min: c.min, max: c.max } : null;
    const read = counted.length ? (await this.matrix.getState(counted, [capabilityId])).devices : [];
    const out: CombinedDevice[] = read.map(d => ('missing' in d
      ? { id: d.id, missing: true as const }
      : { id: d.id, name: d.name, value: d.values[capabilityId] ?? null }));
    for (const id of gone) out.push({ id, missing: true });
    if (gone.length) this.log(`Combined value: ${gone.length} picked device(s) not found`);
    this.debug(`Combined value ${capabilityId} of ${counted.length} devices${deviceIds.length ? '' : ' (every one with it)'}: ${tm.summary()}`);
    return { capability, devices: out };
  }

}
