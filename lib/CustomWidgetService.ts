import type Homey from 'homey';
import { getAppApi } from './appApi.js';
import { byName, devicesAndZones, listDevicesWhere, matches, withNone, type AutocompleteItem } from './autocomplete.js';
import { deviceImage, fetchDeviceIcon, fetchImageBase64 } from './deviceIcon.js';
import {
  INPUT_TYPES, MAX_DESIGNS, MAX_EACH, MAX_FLOW_INPUTS, MAX_REPEAT_CANDIDATES, SERVER_ACTIONS, TAP_KINDS, allParts, bindDevice, designCharts, designFlows, designInputs,
  designDeviceIcons, designRooms, designSlots, designVariables, detachUses, findPart, inputValue, newId, partLabel, readDesign, readInputs, ruleHolds,
  type Design, type Input, type InputReset, type InputType, type Part,
} from './customDesigns.js';
import { DebouncedSetting, isReservedKey } from './storedSetting.js';
import { convertTemperature, shownTemperatureScale, temperatureScaleOf } from './temperatureUnit.js';
import { nextLocalTime } from './WebSyncService.js';
import { timeFormatOf } from './timeFormat.js';
import type FlowService from './FlowService.js';
import { isNamedSpan } from './SparklineService.js';
import type SparklineService from './SparklineService.js';
import { periodStart, type CalendarUnit } from './logPlan.js';
import type ValueService from './ValueService.js';
import type VariableService from './VariableService.js';

/** The app setting holding the designs: `Design[]`, in the library's order. */
export const CUSTOM_DESIGNS_SETTING = 'customDesigns';
/** The app setting holding the Flow inputs: `Input[]`, in the builder's order. */
export const CUSTOM_INPUTS_SETTING = 'customInputs';
/** The app setting holding their values: `{[inputId]: InputEntry}`. */
export const CUSTOM_INPUT_VALUES_SETTING = 'customInputValues';
/** A design was saved or removed: `{id}`; every widget showing it reads again. */
export const CUSTOM_DESIGN_EVENT = 'custom:design';
/** A Flow input's values changed: `{input, entry}` (`entry` as `/state`'s `inputs` hold it, null when it has none). */
export const CUSTOM_INPUT_EVENT = 'custom:input';

export const CUSTOM_INPUT_CARDS = {
  text: 'custom_input_text', number: 'custom_input_number', yesno: 'custom_input_yesno', color: 'custom_input_color', icon: 'custom_input_icon',
} as const;
export const CUSTOM_INPUT_CUSTOM_COLOR_CARD = 'custom_input_custom_color';
export const CUSTOM_INPUT_RESET_CARD = 'custom_input_reset';
export const CUSTOM_INPUT_IS_CARD = 'custom_input_is';
export const CUSTOM_TAPPED_CARD = 'custom_tapped';
export const CUSTOM_CHOICE_CARD = 'custom_choice';

const SAVE_MS = 2000;
const HOUR = 3600e3;

/** A Flow input's value, `at` when it was set (for its reset). */
export type InputValue = { value: string | number | boolean, units?: string, at: number };
/** An input's values: the shared one (`all`), and a per-device input's per device. */
export type InputEntry = { all?: InputValue, devices?: Record<string, InputValue> };
/** A card's input argument (`{id}`) and device argument (`{id}`, `*` for every device). */
export type CardArg = { id?: string, name?: string } | undefined;
/** The device argument's *Every device*. */
export const EVERY_DEVICE = '*';

/**
 * The Widget Builder: the designs (built on the web dashboards' builder page, placed as the `custom` widget) and the
 * Flow inputs Flows set. The widget's `/state` gathers a design's values from the services that already read them
 * (Device Values', Variables', Flow Buttons', Sparklines'), and its controls act through a design's own parts only, so a
 * request can't reach a device, variable or Flow the design doesn't use.
 */
/** The device a linked ready-made's `@` values take: the widget's, or `@` (left as they are) without one. */
function usable(device: string | undefined): string {
  return device && !/[\s:]/.test(device) ? device : '@';
}

/** A value to sort devices by: a number, a yes/no as 1/0, else null (sorted last). */
function sortKey(v: unknown): number | null {
  if (typeof v === 'boolean') return v ? 1 : 0;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export default class CustomWidgetService {

  private designs: Design[];
  private inputList: Input[];
  private inputValues: Record<string, InputEntry>;
  private savedValues: DebouncedSetting;
  /** Expires input values that go back after an hour or at midnight, so open widgets hear of it. */
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(
    private homey: Homey.App['homey'],
    private deps: { values: ValueService, variables: VariableService, flows: FlowService, sparklines: SparklineService },
    private log: (...args: any[]) => void = () => {},
    private debug: (...args: any[]) => void = () => {},
    /** Fires the trigger cards: *A part was tapped*, *A choice changed*. */
    private trigger: (card: string, tokens: object, state: object) => Promise<unknown> = async () => {},
  ) {
    const raw = homey.settings.get(CUSTOM_DESIGNS_SETTING);
    this.designs = (Array.isArray(raw) ? raw : []).map(d => readDesign(d)).filter((d): d is Design => !!d).slice(0, MAX_DESIGNS);
    this.inputList = readInputs(homey.settings.get(CUSTOM_INPUTS_SETTING));
    this.inputValues = CustomWidgetService.readValues(homey.settings.get(CUSTOM_INPUT_VALUES_SETTING), this.inputList);
    this.savedValues = new DebouncedSetting({
      homey, delay: SAVE_MS, setting: CUSTOM_INPUT_VALUES_SETTING, value: () => this.inputValues, log, what: 'the Widget Builder\'s Flow input values',
    });
  }

  start() {
    this.scheduleReset();
  }

  stop() {
    if (this.resetTimer) this.homey.clearTimeout(this.resetTimer);
    this.resetTimer = null;
    this.savedValues.flush();
  }

  /** The values as kept: only known inputs', each of its type, `at` a time; a device's only on a per-device input. */
  private static readValues(v: unknown, inputs: Input[]): Record<string, InputEntry> {
    const out: Record<string, InputEntry> = {};
    if (!v || typeof v !== 'object') return out;
    const one = (type: InputType, x: any): InputValue | undefined => {
      if (!x || typeof x !== 'object' || !Number.isFinite(x.at)) return undefined;
      const value = inputValue(type, x.value);
      if (value === undefined) return undefined;
      return { value, at: x.at, ...(type === 'number' && typeof x.units === 'string' && x.units ? { units: x.units.slice(0, 12) } : {}) };
    };
    for (const input of inputs) {
      const e = (v as any)[input.id];
      if (!e || typeof e !== 'object') continue;
      const entry: InputEntry = {};
      const all = one(input.type, e.all);
      if (all) entry.all = all;
      if (input.perDevice && e.devices && typeof e.devices === 'object') {
        for (const [d, x] of Object.entries(e.devices)) {
          const val = isReservedKey(d) ? undefined : one(input.type, x);
          if (val) (entry.devices ??= {})[d] = val;
        }
      }
      if (entry.all || entry.devices) out[input.id] = entry;
    }
    return out;
  }

  // ---------------------------------------------------------------- the library

  list(): { id: string, name: string, updatedAt: number, parts: number }[] {
    return this.designs.map(d => ({ id: d.id, name: d.name, updatedAt: d.updatedAt, parts: allParts(d).length }));
  }

  get(id: string): Design | undefined {
    return this.designs.find(d => d.id === id);
  }

  /** The widget's Design setting: every design by name (not the ready-made components), its part count as the description. */
  designItems(query: string): AutocompleteItem[] {
    return this.designs
      .filter(d => !d.ready && matches(query, d.name))
      .map(d => ({ id: d.id, name: d.name, description: this.homey.__('custom.partCount', { count: allParts(d).length }) || `${allParts(d).length} components` }));
  }

  /**
   * The widget's Device autocomplete on a Homey dashboard (a design for any device shows it): None, then every device.
   * The web editor has its own picker (`WEB_DEVICES` in `WebDashboardService.ts`).
   */
  async deviceItems(query: string): Promise<AutocompleteItem[]> {
    return withNone(this.homey.__('values.none') || 'None', query, await listDevicesWhere(this.homey, query, () => true));
  }

  /** Every design, whole: the builder page's library. */
  all(): Design[] {
    return this.designs;
  }

  /** Saves a design (a new one gets an id, and goes last); answers it as kept. */
  save(body: unknown): Design {
    const design = readDesign(body);
    if (!design) throw new Error('Not a design');
    const i = this.designs.findIndex(d => d.id === design.id);
    if (i < 0 && this.designs.length >= MAX_DESIGNS) throw new Error(`At most ${MAX_DESIGNS} designs`);
    design.updatedAt = Date.now();
    if (i < 0) this.designs.push(design);
    else this.designs[i] = design;
    this.write();
    this.homey.api.realtime(CUSTOM_DESIGN_EVENT, { id: design.id });
    // The designs linking or repeating a ready-made draw it as it is now: they read again too.
    if (design.ready) {
      for (const d of this.designs) {
        if (d.id !== design.id && allParts(d).some(p => (p.kind === 'use' || p.kind === 'each') && p.ready === design.id)) {
          this.homey.api.realtime(CUSTOM_DESIGN_EVENT, { id: d.id });
        }
      }
    }
    this.debug(`Widget Builder: saved design ${design.id} (${allParts(design).length} parts)`);
    return design;
  }

  remove(id: string): { removed: boolean } {
    const i = this.designs.findIndex(d => d.id === id);
    if (i < 0) return { removed: false };
    const [gone] = this.designs.splice(i, 1);
    // A ready-made's linked instances become copies of it, so no design loses them.
    const source = gone.ready ? gone.parts[0] : undefined;
    const detached = source ? this.designs.filter(d => detachUses(d, id, source)) : [];
    this.write();
    this.homey.api.realtime(CUSTOM_DESIGN_EVENT, { id });
    for (const d of detached) this.homey.api.realtime(CUSTOM_DESIGN_EVENT, { id: d.id });
    return { removed: true };
  }

  /** A copy of a design, named `<name> (copy)`, with new ids for it and its parts. */
  duplicate(id: string): Design {
    const d = this.get(id);
    if (!d) throw new Error('No such design');
    const strip = (p: Part): Part => ({ ...p, id: '', ...(p.parts ? { parts: p.parts.map(strip) } : {}) });
    return this.save({ ...d, id: '', name: `${d.name} (copy)`.slice(0, 40), parts: d.parts.map(strip) });
  }

  /** The designs' new order (ids; ones left out keep their place at the end). */
  reorder(ids: unknown): string[] {
    if (!Array.isArray(ids)) throw new Error('Not a list');
    const rank = new Map(ids.map((id, i) => [String(id), i]));
    this.designs.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
    this.write();
    return this.designs.map(d => d.id);
  }

  private write() {
    this.homey.settings.set(CUSTOM_DESIGNS_SETTING, this.designs);
  }

  // ---------------------------------------------------------------- Flow inputs

  inputs(): Input[] {
    return this.inputList;
  }

  /**
   * The builder's list: every input with its shared value now, how many devices have one of their own, and the designs
   * that use it.
   */
  inputSummary() {
    const now = Date.now();
    return this.inputList.map((input) => {
      const e = this.liveEntry(input, now);
      return {
        ...input,
        value: e?.all ? { value: e.all.value, ...(e.all.units ? { units: e.all.units } : {}) } : null,
        devices: Object.keys(e?.devices ?? {}).length,
        usedBy: this.designs.filter(d => designInputs(d).includes(input.id)).map(d => ({ id: d.id, name: d.name, ready: !!d.ready })),
      };
    });
  }

  /**
   * Adds an input (no id) or changes one: `{id?, name, type, perDevice, reset}`. A name another input has (case aside)
   * is refused. A new type drops its values (they can't be read as the new one), as per device switched off drops the
   * devices'. Answers the input as kept.
   */
  saveInput(body: unknown): Input {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const old = typeof b.id === 'string' ? this.inputList.find(x => x.id === b.id) : undefined;
    if (b.id !== undefined && b.id !== '' && !old) throw new Error('No such input');
    if (!old && this.inputList.length >= MAX_FLOW_INPUTS) throw new Error(`At most ${MAX_FLOW_INPUTS} Flow inputs`);
    const [input] = readInputs([{ ...old, ...b, id: old?.id ?? newId() }]);
    if (!input) throw new Error(INPUT_TYPES.includes(b.type as InputType) || old ? 'A Flow input needs a name' : 'Not a Flow input type');
    if (this.inputList.some(x => x.id !== input.id && x.name.toLowerCase() === input.name.toLowerCase())) {
      throw Object.assign(new Error(`There's already a Flow input called ${input.name}`), { reason: 'taken' });
    }
    const i = this.inputList.findIndex(x => x.id === input.id);
    if (i < 0) this.inputList.push(input);
    else this.inputList[i] = input;
    const e = this.inputValues[input.id];
    if (e && old && (old.type !== input.type || (old.perDevice && !input.perDevice))) {
      if (old.type !== input.type) delete this.inputValues[input.id];
      else delete e.devices;
      if (e.all === undefined && !e.devices) delete this.inputValues[input.id];
      this.savedValues.schedule();
    }
    this.writeInputs();
    // Every widget showing it reads again: a new type or reset changes what its bindings show.
    if (old) this.designsUsing(input.id);
    this.scheduleReset();
    return input;
  }

  /** Deletes an input and its values; a design's settings bound to it go back to their own. */
  removeInput(id: string): { removed: boolean } {
    const i = this.inputList.findIndex(x => x.id === id);
    if (i < 0) return { removed: false };
    this.inputList.splice(i, 1);
    if (this.inputValues[id]) { delete this.inputValues[id]; this.savedValues.schedule(); }
    this.writeInputs();
    this.designsUsing(id);
    return { removed: true };
  }

  private writeInputs() {
    this.homey.settings.set(CUSTOM_INPUTS_SETTING, this.inputList);
  }

  /** Tells every widget showing a design that uses an input to read again. */
  private designsUsing(inputId: string) {
    for (const d of this.designs) if (designInputs(d).includes(inputId)) this.homey.api.realtime(CUSTOM_DESIGN_EVENT, { id: d.id });
  }

  /** An input's values that haven't gone back yet, each with `expires` where it will. */
  private liveEntry(input: Input, now = Date.now()): { all?: InputValue & { expires?: number }, devices?: Record<string, InputValue & { expires?: number }> } | null {
    const e = this.inputValues[input.id];
    if (!e) return null;
    const live = (v: InputValue | undefined) => {
      if (!v) return undefined;
      const expires = this.expiry(input.reset, v.at);
      if (expires !== null && expires <= now) return undefined;
      return expires === null ? { ...v } : { ...v, expires };
    };
    const out: { all?: InputValue & { expires?: number }, devices?: Record<string, InputValue & { expires?: number }> } = {};
    const all = live(e.all);
    if (all) out.all = all;
    for (const [d, v] of Object.entries(e.devices ?? {})) {
      const x = live(v);
      if (x) (out.devices ??= {})[d] = x;
    }
    return out.all || out.devices ? out : null;
  }

  /** What a widget gets of an input: its type, per device or not, and its live values. */
  private inputState(id: string, now = Date.now()) {
    const input = this.inputList.find(x => x.id === id);
    if (!input) return null;
    return { type: input.type, ...(input.perDevice ? { perDevice: true } : {}), ...this.liveEntry(input, now) };
  }

  // ---------------------------------------------------------------- the widget
  // ---------------------------------------------------------------- the widget

  /**
   * A design and what it shows: device values by slot (`ValueService`), variables, Flows, histories by `<span>\n<slot>`,
   * and what Flows set on its parts (`flow`, with `expires` where it goes back). `{missing: true}` for a design that's gone.
   */
  async getState(id: string, device?: string) {
    const design = this.get(id);
    if (!design) return { missing: true as const, now: Date.now() };
    // A design that works with any device: the one picked where it's placed fills in its `@` values.
    return this.stateOf(bindDevice(design, device), device);
  }

  /**
   * The builder's preview: a design as it's being built, read as `readDesign()` keeps it, with the Flow inputs' values
   * now. Nothing is saved.
   */
  async previewState(body: unknown) {
    const design = readDesign(body);
    if (!design) throw new Error('Not a design');
    return this.stateOf(bindDevice(design, design.sample), design.sample);
  }

  /**
   * A repeater's devices: every device with its capability, in its room and the rooms inside it, by name, at most
   * `MAX_REPEAT_CANDIDATES`, as slots. Its test is the widget's, on the live values, so a door that opens shows at once.
   */
  private async repeatSlots(part: Part): Promise<string[]> {
    return (await this.devicesWith(part, MAX_REPEAT_CANDIDATES)).map(id => `${id}:${part.capability}`);
  }

  /**
   * Every device with a part's capability, in its room and the rooms inside it, by name: ids, at most `max`. A
   * Repeater's `sort` (`up`, `down`) orders them by that capability's value now first, as a List's (a yes/no as 1/0,
   * one without a number last), so the limit keeps the lowest or highest.
   */
  private async devicesWith(part: Part, max: number, sort?: Part['sort']): Promise<string[]> {
    if (!part.capability) return [];
    const [devices, zones] = await devicesAndZones(this.homey);
    const inZone = (zoneId: string | undefined): boolean => {
      for (let z = zoneId, depth = 0; z && depth < 20; z = zones[z]?.parent, depth++) if (z === part.zone) return true;
      return false;
    };
    return devices
      .filter(d => d?.capabilitiesObj?.[part.capability!] && d.capabilitiesObj[part.capability!].getable !== false && (!part.zone || inZone(d.zone)))
      .sort(byName(this.homey))
      .map((d, i) => ({ d, i, k: sort === 'up' || sort === 'down' ? sortKey(d.capabilitiesObj[part.capability!].value) : null }))
      .sort((a, b) => (a.k === null || b.k === null ? Number(a.k === null) - Number(b.k === null) : sort === 'up' ? a.k - b.k : b.k - a.k) || a.i - b.i)
      .slice(0, max)
      .map(({ d }) => d.id as string);
  }

    /** A Repeater's devices: those picked, or every one with its capability (in its room). */
  private async eachDevices(part: Part): Promise<string[]> {
    const ids = part.capability ? await this.devicesWith(part, MAX_EACH, part.sort) : part.devices ?? [];
    return ids.slice(0, part.limit ?? MAX_EACH);
  }

  /** The ready-made component a Repeater repeats: the first part of a design saved as one. */
  private readyPart(part: Part): Part | null {
    const d = part.ready ? this.get(part.ready) : undefined;
    return d?.ready && d.parts[0] ? d.parts[0] : null;
  }

  /**
   * The histories of `slots` over a span: Sparklines' own for the spans it names (`24h`, `today` …), else the window the
   * charts' time span means now in the Homey's time zone (the kit's `timeSpan()`), as the chart widgets read it.
   */
  private histories(slots: string[], span: string): Promise<any[]> {
    if (isNamedSpan(span)) return this.deps.sparklines.getState(slots, span);
    const w = spanWindow(span, Date.now(), this.homey.clock.getTimezone() || 'UTC');
    if (!w) return this.deps.sparklines.getState(slots, '24h');
    return this.deps.sparklines.getWindows(slots.map(slot => ({ slot, from: w.from, end: w.end, unit: w.unit, span })));
  }

  private async stateOf(design: Design, device?: string) {
    const repeaters = allParts(design).filter(p => p.kind === 'repeat');
    const repeats = Object.fromEntries(await Promise.all(repeaters.map(async p => [p.id, await this.repeatSlots(p).catch((err) => {
      this.log('Widget Builder: a list\'s devices failed:', err);
      return [] as string[];
    })] as const)));
    // A Repeater's component and devices; what each copy reads is read with the design's own.
    const eaches = allParts(design).filter(p => p.kind === 'each');
    const each = Object.fromEntries(await Promise.all(eaches.map(async (p) => {
      const part = this.readyPart(p);
      const devices = part ? await this.eachDevices(p).catch((err) => { this.log('Widget Builder: a repeater\'s devices failed:', err); return [] as string[]; }) : [];
      return [p.id, { part, devices }] as const;
    })));
    // A linked ready-made: its source once, filled in with its own device, else the widget's (`@` where there's none).
    for (const p of allParts(design).filter(x => x.kind === 'use')) {
      const part = this.readyPart(p);
      each[p.id] = { part, devices: part ? [p.device ?? usable(device)] : [] };
    }
    const reads: Design = {
      ...design,
      parts: [...design.parts, ...Object.values(each).flatMap(e => (e.part ? e.devices.map(id => bindDevice(e.part!, id)) : []))],
    };
    const slots = [...new Set([...designSlots(reads), ...Object.values(repeats).flat()])];
    const variables = designVariables(reads);
    const flows = designFlows(reads);
    const charts = designCharts(reads);
    const quiet = <T>(what: string, p: Promise<T>, empty: T) => p.catch(err => { this.log(`Widget Builder: ${what} failed:`, err); return empty; });
    const bySpan = new Map<string, string[]>();
    for (const c of charts) bySpan.set(c.span, [...(bySpan.get(c.span) ?? []), c.slot]);
    // The devices whose own icon it shows: its switches' and icons', and its Lists' items'.
    const iconIds = [...new Set([
      ...designDeviceIcons(reads),
      ...allParts(reads).filter(p => p.kind === 'repeat' && p.deviceIcon).flatMap(p => (repeats[p.id] ?? []).map(s => s.slice(0, s.indexOf(':')))),
    ])];
    const [values, vars, flowList, histories, icons] = await Promise.all([
      slots.length ? this.deps.values.getState(slots, [], { rooms: designRooms(reads) }) : [],
      variables.length ? quiet('variables', this.deps.variables.getState(variables), []) : [],
      flows.length ? quiet('flows', this.deps.flows.getState(flows), []) : [],
      Promise.all([...bySpan].map(([span, list]) => quiet('histories', this.histories(list, span), [])
        .then(res => res.map((r: any) => [`${span}\n${r.deviceId}:${r.capabilityId}`, r.points ?? []] as const)))),
      iconIds.length ? quiet('device icons', this.deviceIcons(iconIds), {}) : {},
    ]);
    return {
      design,
      values: Object.fromEntries(values.map(v => [`${v.deviceId}:${v.capabilityId}`, v])),
      variables: Object.fromEntries((vars as any[]).map(v => [v.id, v])),
      flows: Object.fromEntries((flowList as any[]).map(f => [f.id, f])),
      histories: Object.fromEntries(histories.flat()),
      ...(iconIds.length ? { icons } : {}),
      repeats,
      each,
      // The Flow inputs it reads, and the widget's device, whose values a per-device input shows.
      inputs: Object.fromEntries(designInputs(reads).map(id => [id, this.inputState(id)]).filter(([, v]) => v)),
      ...(device ? { device } : {}),
      // For its Time components and texts with the time: the weekday's and date's language, and the app's time format.
      language: this.homey.i18n.getLanguage(),
      timeFormat: timeFormatOf(this.homey),
      now: Date.now(),
    };
  }

  /**
   * Devices' own icons as the Homey app shows them (a picked one from Homey's library, else the driver's;
   * `fetchDeviceIcon()`, cached per address), by id; null for a device that's gone or whose icon can't be read.
   */
  private async deviceIcons(ids: string[]): Promise<Record<string, string | null>> {
    const [[devices], api] = await Promise.all([devicesAndZones(this.homey), getAppApi(this.homey)]);
    const byId = new Map(devices.map(d => [d.id, d]));
    return Object.fromEntries(await Promise.all(ids.map(async (id) => {
      const d = byId.get(id);
      return [id, d ? await fetchDeviceIcon(api, d, this.log).catch(() => null) : null] as const;
    })));
  }

  private expiry(reset: InputReset, at: number): number | null {
    if (reset === 'hour') return at + HOUR;
    if (reset === 'midnight') return nextLocalTime('00:00', this.homey.clock.getTimezone() || 'UTC', at);
    return null;
  }

  /**
   * The part a widget's request acts on, which must be one of `kinds`; anything else throws. `device`: the widget's
   * device, filling in the design's `@` values. A Repeater's copy is `<repeater>/<part>`, `device` one of its devices.
   */
  private async partFor(designId: unknown, partId: unknown, kinds: readonly string[], device?: unknown): Promise<{ design: Design, part: Part, owner: string }> {
    const saved = this.get(String(designId ?? ''));
    if (!saved) throw new Error('No such design');
    const dev = typeof device === 'string' && device ? device : undefined;
    const design = bindDevice(saved, dev);
    const [outer, inner] = String(partId ?? '').split('/');
    let part = findPart(design, outer);
    // The design a trigger names the part by (`listParts()`): a copy's is its ready-made's.
    let owner = design.id;
    if (inner !== undefined) {
      const ready = part?.kind === 'each' || part?.kind === 'use' ? this.readyPart(part) : null;
      // A Repeater's copy acts for one of its devices; a linked ready-made for the widget's, as the design's own parts.
      if (!part || !ready || !dev || (part.kind === 'each' && !(await this.eachDevices(part)).includes(dev))
        || (part.kind === 'use' && part.device && dev !== part.device)) throw new Error('No such part');
      owner = part.ready ?? owner;
      const copy = bindDevice({ id: '', name: '', updatedAt: 0, parts: [ready] } as Design, dev);
      part = findPart(copy, inner);
    }
    if (!part || !kinds.includes(part.kind)) throw new Error('No such part');
    return { design, part, owner };
  }

  /**
   * A switch, slider, stepper or choice changes its device value. Only the part's own capability is set, with a value
   * of its type: a switch's boolean, a number within the capability's (and the part's) range, or one of a choice's values.
   */
  async setValue(designId: unknown, partId: unknown, value: unknown, slot?: unknown, device?: unknown) {
    const { part, owner } = await this.partFor(designId, partId, ['switch', 'slider', 'stepper', 'choice', 'repeat'], device);
    if (part.kind === 'repeat') {
      // A repeater switches one of its own devices' yes/no, and only with Tap to switch on.
      if (!part.control || typeof value !== 'boolean') throw new Error('The repeater can\'t switch this');
      if (!(await this.repeatSlots(part)).includes(String(slot ?? ''))) throw new Error('Not one of the repeater\'s devices');
      return this.writeCapability(owner, part, String(slot), value);
    }
    if (!part.slot) throw new Error('The part has no device value');
    return this.writeCapability(owner, part, part.slot, value);
  }

  /** Sets a slot's capability for a part: a value of its type, within the capability's and the part's range. */
  private async writeCapability(designId: string, part: Part, slot: string, value: unknown) {
    const i = slot.indexOf(':');
    const [deviceId, capabilityId] = [slot.slice(0, i), slot.slice(i + 1)];
    const api = await getAppApi(this.homey);
    const device = await api.devices.getDevice({ id: deviceId });
    const cap = device.capabilitiesObj?.[capabilityId];
    if (!cap || cap.setable === false) throw new Error(`${device.name}'s ${capabilityId} can't be set`);
    let v: unknown = value;
    if (part.kind === 'choice') {
      const choice = part.choices?.find(c => c.value === String(value));
      if (!choice) throw new Error('Not one of the choices');
      v = cap.type === 'number' ? Number(choice.value) : cap.type === 'boolean' ? choice.value === 'true' : choice.value;
    }
    if (cap.type === 'boolean') {
      if (typeof v !== 'boolean') throw new Error(`Invalid value ${JSON.stringify(value)}`);
    } else if (cap.type === 'number') {
      let n = Number(v);
      if (typeof v === 'boolean' || !Number.isFinite(n)) throw new Error(`Invalid value ${JSON.stringify(value)}`);
      // The widget shows a temperature in the app's unit (and the part's range is typed in it): back to the device's.
      const scale = temperatureScaleOf(cap.units);
      const shown = shownTemperatureScale(this.homey);
      const own = (x: number) => (scale ? convertTemperature(x, shown, scale) : x);
      n = own(n);
      const lo = Math.max(cap.min ?? -Infinity, part.kind === 'choice' || part.min === undefined ? -Infinity : own(part.min));
      const hi = Math.min(cap.max ?? Infinity, part.kind === 'choice' || part.max === undefined ? Infinity : own(part.max));
      v = Math.min(hi, Math.max(lo, scale ? Math.round(n * 100) / 100 : n));
    } else if (cap.type === 'enum') {
      if (!(cap.values ?? []).some((e: any) => e.id === v)) throw new Error(`Invalid value ${JSON.stringify(value)}`);
    } else if (typeof v !== 'string') {
      throw new Error(`Invalid value ${JSON.stringify(value)}`);
    }
    await device.setCapabilityValue({ capabilityId, value: v });
    this.debug(`Widget Builder: ${device.name} ${capabilityId}=${JSON.stringify(v)}`);
    if (part.kind === 'choice') void this.fireChoice(designId, part, String(value));
    return { ok: true as const };
  }

  /**
   * A typed value read as a capability's or variable's type: a yes/no from on/off/yes/no/true/false/1/0/open/closed,
   * or `toggle` the opposite of `current`; a number (a decimal comma read); an enum's id or title; else the text.
   */
  static typedValue(type: string, text: string, current: unknown, values?: { id: string, title?: string }[]): unknown {
    const s = text.trim();
    if (type === 'boolean') {
      const l = s.toLowerCase();
      if (l === 'toggle') return current !== true;
      if (['on', 'yes', 'true', '1', 'open'].includes(l)) return true;
      if (['off', 'no', 'false', '0', 'closed'].includes(l)) return false;
      throw new Error(`Not a yes/no: ${s}`);
    }
    if (type === 'number') {
      const n = Number(s.replace(',', '.'));
      if (!s || !Number.isFinite(n)) throw new Error(`Not a number: ${s}`);
      return n;
    }
    if (type === 'enum') {
      const l = s.toLowerCase();
      const e = (values ?? []).find(x => x.id === s) ?? (values ?? []).find(x => x.id.toLowerCase() === l || String(x.title ?? '').toLowerCase() === l);
      if (!e) throw new Error(`Not one of its values: ${s}`);
      return e.id;
    }
    return s;
  }

  /**
   * A button's (or a tapped component's) action the app runs (`set`, `variable`, `flow`, `input`), the `index`th of its, which must be of the kind
   * the request says (its API key use is read from that, `routeKeyUse()`). The widget runs them in order and does the
   * others (a dashboard, a widget state) itself.
   */
  async runAction(designId: unknown, partId: unknown, index: unknown, kind: unknown, device?: unknown) {
    // A button's, or any component's tap (`TAP_KINDS`).
    const { design, part } = await this.partFor(designId, partId, ['button', ...TAP_KINDS], device);
    const action = part.actions?.[Number(index)];
    if (!action || action.do !== kind || !SERVER_ACTIONS.includes(action.do)) throw new Error('No such action');
    if (action.do === 'flow') {
      await this.deps.flows.trigger(action.flowId);
    } else if (action.do === 'input') {
      // As a Flow would, for the widget's device where the input is per device.
      const input = this.inputList.find(x => x.id === action.input);
      if (!input) throw new Error('No such Flow input');
      // A device id as a card's (`cardDevice()`): never a reserved key, nor `@` (no device) or one with spaces or `:`.
      const dev = input.perDevice && typeof device === 'string' && device && device !== '@' && !isReservedKey(device) && !/[\s:]/.test(device) ? device : undefined;
      const current = this.current(input, dev);
      // `now`: set just now, keeping its value (a counter of the time since, `since: {input}`).
      if (action.value.trim().toLowerCase() === 'now') this.setInputValue(input, CustomWidgetService.nowValue(input, current), dev, current?.units);
      else this.setInputValue(input, CustomWidgetService.actionValue(input, action.value, current), dev);
    } else if (action.do === 'variable') {
      const current = (await this.deps.variables.getState([action.variable]))[0] as any;
      if (!current || current.missing) throw new Error(`No variable ${action.variable}`);
      await this.deps.variables.set(action.variable, CustomWidgetService.typedValue(current.type, action.value, current.value));
    } else if (action.do === 'set') {
      const i = action.slot.indexOf(':');
      const api = await getAppApi(this.homey);
      const device = await api.devices.getDevice({ id: action.slot.slice(0, i) });
      const cap = device.capabilitiesObj?.[action.slot.slice(i + 1)];
      if (!cap) throw new Error(`${device.name} has no ${action.slot.slice(i + 1)}`);
      const typed = CustomWidgetService.typedValue(cap.type, action.value, cap.value, cap.values);
      await this.writeCapability(design.id, { ...part, kind: 'slider', min: undefined, max: undefined }, action.slot, typed);
    }
    return { ok: true as const };
  }

  /**
   * An image's picture from a device (a camera's snapshot, else its first image), fetched by the app (the widget can't
   * reach Homey's web server), as `{type, data}` base64.
   */
  async image(designId: unknown, partId: unknown, device?: unknown) {
    const { part } = await this.partFor(designId, partId, ['image'], device);
    if (part.image?.kind !== 'device') throw new Error('Not a device\'s image');
    return this.deviceImage(part.image.device);
  }

  /** A device's picture (the builder's preview too). */
  async deviceImage(deviceId: string) {
    const api = await getAppApi(this.homey);
    const device = await api.devices.getDevice({ id: deviceId });
    const img = deviceImage(device, 'camera', { anyType: true });
    if (!img) throw new Error(`${device.name} has no image`);
    return fetchImageBase64(api, img.url, 'Image');
  }

  /** The builder's image picker: every device with an image, by name. */
  async imageDevices(query: string): Promise<AutocompleteItem[]> {
    const [devices, zones] = await devicesAndZones(this.homey);
    return devices
      .filter(d => deviceImage(d, 'camera', { anyType: true }) && matches(query, d.name))
      .map(d => ({ id: d.id, name: d.name, description: zones[d.zone]?.name ?? '' }))
      .sort(byName(this.homey));
  }

  /**
   * A variable, slider, stepper or choice on a Homey variable sets it (through the personal API key, as Variables
   * does); a number within the part's own range.
   */
  async setVariable(designId: unknown, partId: unknown, value: unknown, device?: unknown) {
    const { part, owner } = await this.partFor(designId, partId, ['variable', 'slider', 'stepper', 'choice'], device);
    if (!part.variable) throw new Error('The part has no variable');
    let v = value;
    if (part.kind === 'choice') {
      const choice = part.choices?.find(c => c.value === String(value));
      if (!choice) throw new Error('Not one of the choices');
      const current = (await this.deps.variables.getState([part.variable]))[0] as any;
      v = current?.type === 'number' ? Number(choice.value) : current?.type === 'boolean' ? choice.value === 'true' : choice.value;
    } else if (typeof v === 'number') {
      v = Math.min(part.max ?? Infinity, Math.max(part.min ?? -Infinity, v));
    }
    await this.deps.variables.set(part.variable, v);
    if (part.kind === 'choice') void this.fireChoice(owner, part, String(value));
    return { ok: true as const };
  }

  /** A button with a Flow starts it (through the personal API key, as Flow Buttons does). */
  async startFlow(designId: unknown, partId: unknown, device?: unknown) {
    const { part } = await this.partFor(designId, partId, ['button'], device);
    if (!part.flowId) throw new Error('The button has no Flow');
    await this.deps.flows.trigger(part.flowId);
    return { ok: true as const };
  }

  /**
   * A button without a Flow fires *A Widget Builder button was tapped*: no API key, the app fires its own card.
   */
  async tap(designId: unknown, partId: unknown, instance?: string, device?: unknown) {
    const { design, part, owner } = await this.partFor(designId, partId, ['button'], device);
    if (part.flowId) throw new Error('The button starts a Flow');
    await this.trigger(CUSTOM_TAPPED_CARD,
      { part: part.name || part.kind, design: design.name, dashboard: CustomWidgetService.dashboardOf(instance) },
      { part: `${owner}/${part.id}` });
    return { ok: true as const };
  }

  private async fireChoice(designId: unknown, part: Part, value: string) {
    const index = (part.choices ?? []).findIndex(c => c.value === value);
    const label = part.choices?.[index]?.label ?? value;
    try {
      await this.trigger(CUSTOM_CHOICE_CARD, { choice: label, value, index: index + 1 }, { part: `${String(designId)}/${part.id}` });
    } catch (err) {
      this.log('Widget Builder: the choice trigger failed:', err);
    }
  }

  /** The web dashboard of a `web-<dashboard>-<widget>` instance; both may hold `-`, so it's only the part before the last. */
  private static dashboardOf(instance?: string): string {
    if (!instance?.startsWith('web-')) return '';
    const rest = instance.slice(4);
    const i = rest.lastIndexOf('-');
    return i > 0 ? rest.slice(0, i) : rest;
  }

  // ---------------------------------------------------------------- Flow cards

  /** A trigger's part matches the state's (`<design>/<part>`). */
  static matches(args: { part?: CardArg }, state: { part?: string }): boolean {
    return !!args.part?.id && args.part.id === state.part;
  }

  /** The triggers' parts: every button without a Flow (`tap`) or every choice, as `Design · Part`, id `<designId>/<partId>`. */
  listParts(query: string, prop: 'tap' | 'choice'): AutocompleteItem[] {
    const items: AutocompleteItem[] = [];
    for (const d of this.designs) {
      for (const p of allParts(d)) {
        const ok = prop === 'tap' ? (p.kind === 'button' && !p.flowId) : p.kind === 'choice';
        if (!ok) continue;
        const name = partLabel(d, p);
        if (!matches(query, name)) continue;
        items.push({ id: `${d.id}/${p.id}`, name, description: this.homey.__(`custom.kinds.${p.kind}`) || p.kind });
      }
    }
    return items.sort(byName(this.homey));
  }

  /** A card's inputs: those of `types` (every input without), by name, each described by its type. */
  listInputs(query: string, types?: readonly InputType[]): AutocompleteItem[] {
    return this.inputList
      .filter(x => (!types || types.includes(x.type)) && matches(query, x.name))
      .map(x => ({ id: x.id, name: x.name, description: [this.homey.__(`custom.inputType.${x.type}`) || x.type, x.perDevice ? this.homey.__('custom.perDevice') || 'per device' : ''].filter(Boolean).join(' · ') }))
      .sort(byName(this.homey));
  }

  /** A card's device: *Every device* (the shared value), then every device. */
  async listDevices(query: string): Promise<AutocompleteItem[]> {
    const every = { id: EVERY_DEVICE, name: this.homey.__('custom.everyDevice') || 'Every device' };
    const devices = await listDevicesWhere(this.homey, query, () => true);
    return [...(matches(query, every.name) ? [every] : []), ...devices];
  }

  /** A card's input, which must be of `types`; anything else throws, so the Flow shows why. */
  private cardInput(arg: CardArg, types?: readonly InputType[]): Input {
    const input = this.inputList.find(x => x.id === arg?.id);
    if (!input) throw new Error(`No such Widget Builder Flow input: ${arg?.name ?? arg?.id ?? ''}`);
    if (types && !types.includes(input.type)) throw new Error(`${input.name} isn't a ${types.join(' or ')} input`);
    return input;
  }

  /** A card's device: none or *Every device* is the shared value; a device only on a per-device input. */
  private cardDevice(input: Input, arg: CardArg): string | undefined {
    const id = arg?.id;
    if (!id || id === EVERY_DEVICE) return undefined;
    if (!input.perDevice) throw new Error(`${input.name} isn't kept per device: pick Every device, or switch on Per device in the Widget Builder`);
    if (isReservedKey(id) || /\s/.test(id)) throw new Error('Not a device');
    return id;
  }

  /** The value an input shows now for a device (its own, else the shared one), or undefined. */
  private current(input: Input, device?: string): InputValue | undefined {
    const e = this.liveEntry(input);
    return (device && e?.devices?.[device]) || e?.all;
  }

  /**
   * An action's `now`: the value it has (so only when it was set changes), else a first one of its type: an empty text,
   * 0, yes. A colour or icon has no first one.
   */
  static nowValue(input: Input, current?: InputValue): string | number | boolean {
    if (current) return current.value;
    if (input.type === 'text') return '';
    if (input.type === 'number') return 0;
    if (input.type === 'yesno') return true;
    throw new Error(`Not a ${input.type} value: now`);
  }

  /** A typed action value as an input's: `toggle` flips a yes/no, `+2`/`-1` add to a number, else read as its type. */
  static actionValue(input: Input, text: string, current?: InputValue): string | number | boolean {
    const s = text.trim();
    if (input.type === 'yesno' && s.toLowerCase() === 'toggle') return current?.value !== true;
    if (input.type === 'number' && /^[+-]\s*\d/.test(s)) {
      const step = Number(s.replace(/\s/g, '').replace(',', '.'));
      const base = typeof current?.value === 'number' ? current.value : 0;
      if (Number.isFinite(step)) return Math.round((base + step) * 1e6) / 1e6;
    }
    const v = inputValue(input.type, s);
    if (v === undefined) throw new Error(`Not a ${input.type} value: ${s}`);
    return v;
  }

  /** A card's (or an action's) value for an input; read as its type, else the Flow shows why. */
  setInput(arg: CardArg, type: InputType, raw: unknown, deviceArg?: CardArg, units?: unknown) {
    const input = this.cardInput(arg, [type]);
    const value = inputValue(type, raw);
    if (value === undefined) throw new Error(`Not a ${type} value: ${String(raw ?? '')}`);
    const u = type === 'number' && typeof units === 'string' && units.trim() ? units.trim().slice(0, 12) : undefined;
    this.setInputValue(input, value, this.cardDevice(input, deviceArg), u);
  }

  private setInputValue(input: Input, value: string | number | boolean, device?: string, units?: string) {
    const e = (this.inputValues[input.id] ??= {});
    const v: InputValue = { value, at: Date.now(), ...(units ? { units } : {}) };
    if (device) (e.devices ??= {})[device] = v;
    else e.all = v;
    this.savedValues.schedule();
    this.sendInput(input.id);
    this.scheduleReset();
    this.debug(`Widget Builder: Flow input ${input.id}${device ? ` for ${device}` : ''} set`);
  }

  /** Back to nothing: one device's value, or (no device, *Every device*) every value it has. */
  resetInput(arg: CardArg, deviceArg?: CardArg) {
    const input = this.cardInput(arg);
    const e = this.inputValues[input.id];
    if (!e) return;
    const device = deviceArg?.id && deviceArg.id !== EVERY_DEVICE ? this.cardDevice(input, deviceArg) : undefined;
    if (device) {
      if (!e.devices?.[device]) return;
      delete e.devices[device];
      if (!Object.keys(e.devices).length) delete e.devices;
      if (!e.all && !e.devices) delete this.inputValues[input.id];
    } else {
      delete this.inputValues[input.id];
    }
    this.savedValues.schedule();
    this.sendInput(input.id);
  }

  /** The condition *… is …*: the value it shows now for the device (or the shared one), compared as a rule's *is*. */
  inputIs(arg: CardArg, value: unknown, deviceArg?: CardArg): boolean {
    const input = this.cardInput(arg);
    const device = deviceArg?.id && deviceArg.id !== EVERY_DEVICE ? this.cardDevice(input, deviceArg) : undefined;
    const now = this.current(input, device);
    return ruleHolds({ op: 'is', value: String(value ?? '') }, now?.value);
  }

  private sendInput(id: string) {
    this.homey.api.realtime(CUSTOM_INPUT_EVENT, { input: id, entry: this.inputState(id) });
  }

  /** The next input value to go back: tells the widgets then, and drops it. */
  private scheduleReset() {
    if (this.resetTimer) this.homey.clearTimeout(this.resetTimer);
    this.resetTimer = null;
    let next = Infinity;
    const now = Date.now();
    for (const input of this.inputList) {
      const e = this.inputValues[input.id];
      for (const v of e ? [e.all, ...Object.values(e.devices ?? {})] : []) {
        const at = v ? this.expiry(input.reset, v.at) : null;
        if (at !== null && at > now) next = Math.min(next, at);
      }
    }
    if (next === Infinity) return;
    this.resetTimer = this.homey.setTimeout(() => {
      this.resetTimer = null;
      this.expire();
    }, Math.min(next - now + 50, 2 ** 31 - 1));
  }

  private expire() {
    const now = Date.now();
    for (const input of this.inputList) {
      const e = this.inputValues[input.id];
      if (!e) continue;
      const gone = (v: InputValue | undefined) => { const at = v ? this.expiry(input.reset, v.at) : null; return at !== null && at <= now; };
      let changed = false;
      if (gone(e.all)) { delete e.all; changed = true; }
      for (const [d, v] of Object.entries(e.devices ?? {})) if (gone(v)) { delete e.devices![d]; changed = true; }
      if (e.devices && !Object.keys(e.devices).length) delete e.devices;
      if (!e.all && !e.devices) delete this.inputValues[input.id];
      if (changed) { this.savedValues.schedule(); this.sendInput(input.id); }
    }
    this.scheduleReset();
  }

  /** For the diagnostics report: counts, never names or texts. */
  describe() {
    const parts = this.designs.flatMap(allParts);
    return {
      designs: this.designs.length,
      parts: parts.length,
      containers: parts.filter(p => p.kind === 'container').length,
      flowInputs: this.inputList.length,
      perDevice: this.inputList.filter(x => x.perDevice).length,
      bound: parts.filter(p => p.bind && Object.keys(p.bind).length > 0).length,
      inputValues: Object.values(this.inputValues).reduce((n, e) => n + (e.all ? 1 : 0) + Object.keys(e.devices ?? {}).length, 0),
    };
  }
}

const SPAN_UNITS: Record<string, 'minute' | 'hour' | CalendarUnit> = { m: 'minute', h: 'hour', d: 'day', w: 'week', mo: 'month', y: 'year' };
const UNIT_MS: Record<string, number> = { minute: 60e3, hour: 3600e3, day: 86400e3, week: 7 * 86400e3 };

/**
 * The window a time span (`24h`, `3d!`, `1w!-`) means at `now` in `timeZone`: the kit's `timeSpan()` on the Homey's
 * clock. Whole periods (`!`) from the start of the unit holding now, `count` of them back, the current one left out with
 * `-`; rolling months and years by the calendar. Null for one it can't read.
 */
export function spanWindow(span: string, now: number, timeZone: string): { from: number, end: number, unit: CalendarUnit | null } | null {
  const m = /^(\d{1,6})(mo|m|h|d|w|y)(!?)(-?)$/.exec(span);
  if (!m || !(+m[1] > 0)) return null;
  const count = +m[1];
  const unit = SPAN_UNITS[m[2]];
  if (m[3]) {
    if (unit === 'minute' || unit === 'hour') return null;
    const skip = m[4] ? 1 : 0;
    const from = periodStart(now, unit, 1 - count - skip, timeZone);
    const to = periodStart(now, unit, 1 - skip, timeZone);
    return { from, end: Math.min(to, now), unit };
  }
  if (unit === 'month' || unit === 'year') {
    const d = new Date(now);
    const day = d.getUTCDate();
    // The same day that many months back, or the month's last where it's shorter (31 March → 28 February, not 3 March).
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - count * (unit === 'year' ? 12 : 1));
    d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
    return { from: d.getTime(), end: now, unit: null };
  }
  return { from: now - count * UNIT_MS[unit], end: now, unit: null };
}
