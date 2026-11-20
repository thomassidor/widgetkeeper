import type Homey from 'homey';
import { getAppApi } from './appApi.js';
import { byName, matches, type AutocompleteItem } from './autocomplete.js';
import {
  MAX_DESIGNS, allParts, designCharts, designFlows, designSlots, designVariables, findPart, partLabel, readDesign,
  type Design, type FlowProp, type FlowReset, type Part,
} from './customDesigns.js';
import { DebouncedSetting, isReservedKey } from './storedSetting.js';
import { parseTileColor, type TileColor } from './tileColors.js';
import { convertTemperature, shownTemperatureScale, temperatureScaleOf } from './temperatureUnit.js';
import { nextLocalTime } from './WebSyncService.js';
import type FlowService from './FlowService.js';
import type SparklineService from './SparklineService.js';
import type ValueService from './ValueService.js';
import type VariableService from './VariableService.js';

/** The app setting holding the designs: `Design[]`, in the library's order. */
export const CUSTOM_DESIGNS_SETTING = 'customDesigns';
/** The app setting holding what Flows set: `{[designId]: {[partId]: FlowValues}}`. */
export const CUSTOM_FLOW_SETTING = 'customFlowValues';
/** A design was saved or removed: `{id}`; every widget showing it reads again. */
export const CUSTOM_DESIGN_EVENT = 'custom:design';
/** A Flow changed a part: `{design, part, values}` (values `null` when they went back to the design's). */
export const CUSTOM_FLOW_EVENT = 'custom:flow';

export const CUSTOM_SET_TEXT_CARD = 'custom_set_text';
export const CUSTOM_SET_VALUE_CARD = 'custom_set_value';
export const CUSTOM_SET_COLOR_CARD = 'custom_set_color';
export const CUSTOM_SET_CUSTOM_COLOR_CARD = 'custom_set_custom_color';
export const CUSTOM_SET_ICON_CARD = 'custom_set_icon';
export const CUSTOM_SHOW_CARD = 'custom_show';
export const CUSTOM_RESET_CARD = 'custom_reset';
export const CUSTOM_IS_SHOWN_CARD = 'custom_is_shown';
export const CUSTOM_TAPPED_CARD = 'custom_tapped';
export const CUSTOM_CHOICE_CARD = 'custom_choice';

const SAVE_MS = 2000;
const HOUR = 3600e3;

/** What Flows set on one part, each only where the part allows it; `at` when, for its reset. */
export type FlowValues = {
  text?: string,
  value?: number | string,
  units?: string,
  color?: TileColor,
  icon?: string,
  hidden?: boolean,
  at: number,
};

/** A Flow card's part argument: `{id: '<designId>/<partId>'}`. */
export type PartArg = { id?: string, name?: string } | undefined;

/**
 * The Widget Builder: the designs (built on the web dashboards' builder page, placed as the `custom` widget) and what
 * Flows set on their parts. The widget's `/state` gathers a design's values from the services that already read them
 * (Device Values', Variables', Flow Buttons', Sparklines'), and its controls act through a design's own parts only, so a
 * request can't reach a device, variable or Flow the design doesn't use.
 */
export default class CustomWidgetService {

  private designs: Design[];
  private flowValues: Record<string, Record<string, FlowValues>>;
  private savedFlow: DebouncedSetting;
  /** Expires Flow values that go back after an hour or at midnight, so open widgets hear of it. */
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
    const fv = homey.settings.get(CUSTOM_FLOW_SETTING);
    this.flowValues = fv && typeof fv === 'object' ? CustomWidgetService.readFlowValues(fv) : {};
    this.savedFlow = new DebouncedSetting({
      homey, delay: SAVE_MS, setting: CUSTOM_FLOW_SETTING, value: () => this.flowValues, log, what: 'the Widget Builder\'s Flow values',
    });
  }

  start() {
    this.scheduleReset();
  }

  stop() {
    if (this.resetTimer) this.homey.clearTimeout(this.resetTimer);
    this.resetTimer = null;
    this.savedFlow.flush();
  }

  private static readFlowValues(v: Record<string, any>): Record<string, Record<string, FlowValues>> {
    const out: Record<string, Record<string, FlowValues>> = {};
    for (const [d, parts] of Object.entries(v)) {
      if (isReservedKey(d) || !parts || typeof parts !== 'object') continue;
      for (const [p, val] of Object.entries<any>(parts)) {
        if (isReservedKey(p) || !val || typeof val !== 'object' || !Number.isFinite(val.at)) continue;
        (out[d] ??= {})[p] = val as FlowValues;
      }
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

  /** The widget's Design setting: every design by name, its part count as the description. */
  designItems(query: string): AutocompleteItem[] {
    return this.designs
      .filter(d => matches(query, d.name))
      .map(d => ({ id: d.id, name: d.name, description: this.homey.__('custom.partCount', { count: allParts(d).length }) || `${allParts(d).length} parts` }));
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
    this.dropStaleFlowValues(design);
    this.write();
    this.homey.api.realtime(CUSTOM_DESIGN_EVENT, { id: design.id });
    this.debug(`Widget Builder: saved design ${design.id} (${allParts(design).length} parts)`);
    return design;
  }

  remove(id: string): { removed: boolean } {
    const i = this.designs.findIndex(d => d.id === id);
    if (i < 0) return { removed: false };
    this.designs.splice(i, 1);
    if (this.flowValues[id]) {
      delete this.flowValues[id];
      this.savedFlow.schedule();
    }
    this.write();
    this.homey.api.realtime(CUSTOM_DESIGN_EVENT, { id });
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

  /** A part removed or no longer open to a Flow keeps nothing a Flow set on it. */
  private dropStaleFlowValues(design: Design) {
    const kept = this.flowValues[design.id];
    if (!kept) return;
    let changed = false;
    for (const [partId, v] of Object.entries(kept)) {
      const part = findPart(design, partId);
      const allowed = part ? CustomWidgetService.allowed(part, v) : null;
      if (!allowed) { delete kept[partId]; changed = true; } else if (allowed !== v) { kept[partId] = allowed; changed = true; }
    }
    if (!Object.keys(kept).length) delete this.flowValues[design.id];
    if (changed) this.savedFlow.schedule();
  }

  /** The values a part still allows, the same object when all are, or null for none. */
  private static allowed(part: Part, v: FlowValues): FlowValues | null {
    const out: FlowValues = { at: v.at };
    const has = (p: FlowProp) => part.flow[p] === true;
    if (v.text !== undefined && has('text')) out.text = v.text;
    if (v.value !== undefined && (has('value') || part.kind === 'flowvalue')) { out.value = v.value; if (v.units !== undefined) out.units = v.units; }
    if (v.color !== undefined && has('color')) out.color = v.color;
    if (v.icon !== undefined && has('icon')) out.icon = v.icon;
    if (v.hidden !== undefined && has('hidden')) out.hidden = v.hidden;
    const n = Object.keys(out).length - 1;
    if (!n) return null;
    return n === Object.keys(v).length - 1 ? v : out;
  }

  // ---------------------------------------------------------------- the widget

  /**
   * A design and what it shows: device values by slot (`ValueService`), variables, Flows, histories by `<span>\n<slot>`,
   * and what Flows set on its parts (`flow`, with `expires` where it goes back). `{missing: true}` for a design that's gone.
   */
  async getState(id: string) {
    const design = this.get(id);
    if (!design) return { missing: true as const, now: Date.now() };
    const slots = designSlots(design);
    const variables = designVariables(design);
    const flows = designFlows(design);
    const charts = designCharts(design);
    const quiet = <T>(what: string, p: Promise<T>, empty: T) => p.catch(err => { this.log(`Widget Builder: ${what} failed:`, err); return empty; });
    const bySpan = new Map<string, string[]>();
    for (const c of charts) bySpan.set(c.span, [...(bySpan.get(c.span) ?? []), c.slot]);
    const [values, vars, flowList, histories] = await Promise.all([
      slots.length ? this.deps.values.getState(slots) : [],
      variables.length ? quiet('variables', this.deps.variables.getState(variables), []) : [],
      flows.length ? quiet('flows', this.deps.flows.getState(flows), []) : [],
      Promise.all([...bySpan].map(([span, list]) => quiet('histories', this.deps.sparklines.getState(list, span), [])
        .then(res => res.map((r: any) => [`${span}\n${r.deviceId}:${r.capabilityId}`, r.points ?? []] as const)))),
    ]);
    return {
      design,
      values: Object.fromEntries(values.map(v => [`${v.deviceId}:${v.capabilityId}`, v])),
      variables: Object.fromEntries((vars as any[]).map(v => [v.id, v])),
      flows: Object.fromEntries((flowList as any[]).map(f => [f.id, f])),
      histories: Object.fromEntries(histories.flat()),
      flow: this.flowState(design.id),
      now: Date.now(),
    };
  }

  /** What Flows set on a design's parts, each with `expires` where it goes back; gone ones dropped. */
  private flowState(designId: string): Record<string, FlowValues & { expires?: number }> {
    const kept = this.flowValues[designId];
    const design = this.get(designId);
    if (!kept || !design) return {};
    const now = Date.now();
    const out: Record<string, FlowValues & { expires?: number }> = {};
    for (const [partId, v] of Object.entries(kept)) {
      const part = findPart(design, partId);
      if (!part) continue;
      const expires = this.expiry(part.reset, v.at);
      if (expires !== null && expires <= now) continue;
      out[partId] = expires === null ? { ...v } : { ...v, expires };
    }
    return out;
  }

  private expiry(reset: FlowReset, at: number): number | null {
    if (reset === 'hour') return at + HOUR;
    if (reset === 'midnight') return nextLocalTime('00:00', this.homey.clock.getTimezone() || 'UTC', at);
    return null;
  }

  /** The part a widget's request acts on, which must be one of `kinds`; anything else throws. */
  private partFor(designId: unknown, partId: unknown, kinds: readonly string[]): { design: Design, part: Part } {
    const design = this.get(String(designId ?? ''));
    if (!design) throw new Error('No such design');
    const part = findPart(design, String(partId ?? ''));
    if (!part || !kinds.includes(part.kind)) throw new Error('No such part');
    return { design, part };
  }

  /**
   * A switch, slider, stepper or choice changes its device value. Only the part's own capability is set, with a value
   * of its type: a switch's boolean, a number within the capability's (and the part's) range, or one of a choice's values.
   */
  async setValue(designId: unknown, partId: unknown, value: unknown) {
    const { part } = this.partFor(designId, partId, ['switch', 'slider', 'stepper', 'choice']);
    if (!part.slot) throw new Error('The part has no device value');
    const i = part.slot.indexOf(':');
    const [deviceId, capabilityId] = [part.slot.slice(0, i), part.slot.slice(i + 1)];
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

  /** A variable, stepper or choice on a Homey variable sets it (through the personal API key, as Variables does). */
  async setVariable(designId: unknown, partId: unknown, value: unknown) {
    const { part } = this.partFor(designId, partId, ['variable', 'stepper', 'choice']);
    if (!part.variable) throw new Error('The part has no variable');
    let v = value;
    if (part.kind === 'choice') {
      const choice = part.choices?.find(c => c.value === String(value));
      if (!choice) throw new Error('Not one of the choices');
      const current = (await this.deps.variables.getState([part.variable]))[0] as any;
      v = current?.type === 'number' ? Number(choice.value) : current?.type === 'boolean' ? choice.value === 'true' : choice.value;
    } else if (part.kind === 'stepper' && typeof v === 'number') {
      v = Math.min(part.max ?? Infinity, Math.max(part.min ?? -Infinity, v));
    }
    await this.deps.variables.set(part.variable, v);
    if (part.kind === 'choice') void this.fireChoice(designId, part, String(value));
    return { ok: true as const };
  }

  /** A button with a Flow starts it (through the personal API key, as Flow Buttons does). */
  async startFlow(designId: unknown, partId: unknown) {
    const { part } = this.partFor(designId, partId, ['button']);
    if (!part.flowId) throw new Error('The button has no Flow');
    await this.deps.flows.trigger(part.flowId);
    return { ok: true as const };
  }

  /**
   * A button without a Flow fires *A Widget Builder button was tapped*: no API key, the app fires its own card.
   */
  async tap(designId: unknown, partId: unknown, instance?: string) {
    const { design, part } = this.partFor(designId, partId, ['button']);
    if (part.flowId) throw new Error('The button starts a Flow');
    await this.trigger(CUSTOM_TAPPED_CARD,
      { part: part.name || part.kind, design: design.name, dashboard: CustomWidgetService.dashboardOf(instance) },
      { part: `${design.id}/${part.id}` });
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

  /** A trigger's or condition's part matches the state's (`<design>/<part>`). */
  static matches(args: { part?: PartArg }, state: { part?: string }): boolean {
    return !!args.part?.id && args.part.id === state.part;
  }

  /**
   * The parts a card may name: those open to `prop` (`text`, `color` …), or for the triggers every part that can be
   * tapped (`tap`) or every choice (`choice`), as `Design · Part`, id `<designId>/<partId>`.
   */
  listParts(query: string, prop: FlowProp | 'tap' | 'choice' | 'any'): AutocompleteItem[] {
    const items: AutocompleteItem[] = [];
    for (const d of this.designs) {
      for (const p of allParts(d)) {
        const ok = prop === 'any' ? Object.keys(p.flow).length > 0 || p.kind === 'flowvalue'
          : prop === 'tap' ? (p.kind === 'button' && !p.flowId)
            : prop === 'choice' ? p.kind === 'choice'
              : prop === 'value' ? p.kind === 'flowvalue' || p.flow.value === true
                : p.flow[prop] === true;
        if (!ok) continue;
        const name = partLabel(d, p);
        if (!matches(query, name)) continue;
        items.push({ id: `${d.id}/${p.id}`, name, description: this.homey.__(`custom.kinds.${p.kind}`) || p.kind });
      }
    }
    return items.sort(byName(this.homey));
  }

  /** A card's part, which must allow `prop`; anything else throws, so the Flow shows why. */
  private flowPart(arg: PartArg, prop: FlowProp): { design: Design, part: Part } {
    const [designId, partId] = String(arg?.id ?? '').split('/');
    const design = this.get(designId);
    const part = design && findPart(design, partId);
    if (!design || !part) throw new Error(`No such Widget Builder part: ${arg?.name ?? arg?.id ?? ''}`);
    if (part.flow[prop] !== true && !(prop === 'value' && part.kind === 'flowvalue')) {
      throw new Error(`${partLabel(design, part)} isn't open to Flows for this`);
    }
    return { design, part };
  }

  private setFlow(arg: PartArg, prop: FlowProp, change: Partial<FlowValues>) {
    const { design, part } = this.flowPart(arg, prop);
    const kept = (this.flowValues[design.id] ??= {});
    const before = kept[part.id];
    const now = Date.now();
    const live = before && (this.expiry(part.reset, before.at) ?? Infinity) > now ? before : undefined;
    const next: FlowValues = { ...live, ...change, at: now };
    for (const k of Object.keys(next) as (keyof FlowValues)[]) if (next[k] === undefined) delete next[k];
    kept[part.id] = next;
    this.savedFlow.schedule();
    this.send(design.id, part);
    this.scheduleReset();
  }

  setText(arg: PartArg, text: unknown) {
    this.setFlow(arg, 'text', { text: String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) });
  }

  setNumber(arg: PartArg, value: unknown, units?: unknown) {
    const n = typeof value === 'number' ? value : Number(value);
    const v = Number.isFinite(n) ? n : String(value ?? '').trim().slice(0, 60);
    this.setFlow(arg, 'value', { value: v, units: typeof units === 'string' && units.trim() ? units.trim().slice(0, 12) : undefined });
  }

  setColor(arg: PartArg, color: string) {
    const c = parseTileColor(color);
    this.setFlow(arg, 'color', { color: c ?? undefined });
  }

  setIcon(arg: PartArg, icon: unknown) {
    const id = typeof icon === 'string' && /^[a-z0-9-]{1,40}$/.test(icon) && icon !== 'none' ? icon : undefined;
    this.setFlow(arg, 'icon', { icon: id });
  }

  setShown(arg: PartArg, shown: boolean) {
    this.setFlow(arg, 'hidden', { hidden: !shown });
  }

  /** Everything Flows set on the part goes, so it's as designed again. */
  reset(arg: PartArg) {
    const [designId, partId] = String(arg?.id ?? '').split('/');
    const design = this.get(designId);
    const part = design && findPart(design, partId);
    if (!design || !part) throw new Error(`No such Widget Builder part: ${arg?.name ?? arg?.id ?? ''}`);
    if (!this.flowValues[design.id]?.[part.id]) return;
    delete this.flowValues[design.id][part.id];
    if (!Object.keys(this.flowValues[design.id]).length) delete this.flowValues[design.id];
    this.savedFlow.schedule();
    this.send(design.id, part);
  }

  /** The condition *… is shown*: not hidden by a Flow (the rules depend on values only the widget weighs). */
  isShown(arg: PartArg): boolean {
    const { design, part } = this.flowPart(arg, 'hidden');
    return this.flowState(design.id)[part.id]?.hidden !== true;
  }

  private send(designId: string, part: Part) {
    const values = this.flowState(designId)[part.id] ?? null;
    this.homey.api.realtime(CUSTOM_FLOW_EVENT, { design: designId, part: part.id, values });
  }

  /** The next Flow value to go back: tells the widgets then, and drops it. */
  private scheduleReset() {
    if (this.resetTimer) this.homey.clearTimeout(this.resetTimer);
    this.resetTimer = null;
    let next = Infinity;
    const now = Date.now();
    for (const [designId, parts] of Object.entries(this.flowValues)) {
      const design = this.get(designId);
      for (const [partId, v] of Object.entries(parts)) {
        const part = design && findPart(design, partId);
        const at = part ? this.expiry(part.reset, v.at) : null;
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
    for (const [designId, parts] of Object.entries(this.flowValues)) {
      const design = this.get(designId);
      for (const [partId, v] of Object.entries(parts)) {
        const part = design && findPart(design, partId);
        const at = part ? this.expiry(part.reset, v.at) : null;
        if (!part || (at !== null && at <= now)) {
          delete parts[partId];
          this.savedFlow.schedule();
          if (part) this.homey.api.realtime(CUSTOM_FLOW_EVENT, { design: designId, part: partId, values: null });
        }
      }
      if (!Object.keys(parts).length) delete this.flowValues[designId];
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
      openToFlows: parts.filter(p => Object.keys(p.flow).length > 0).length,
      flowValues: Object.values(this.flowValues).reduce((n, p) => n + Object.keys(p).length, 0),
    };
  }
}
