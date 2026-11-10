import type Homey from 'homey';
import { screenKey } from './PopupService.js';

/** The levels Flows set, per screen: `{ all: {level, at}, 'name:hall': {level, at} }`. */
export const WEB_DIM_SETTING = 'webDimFlows';
export const WEB_DIM_CARD = 'web_dim';
export const WEB_DIM_EVENT = 'webdim:state';
/** The most a page dims (`MAX_DIM` in settings/dashboard.js): never black, so the bar's pen stays findable. */
const MAX_WEB_DIM = 80;
/** Screen names are typed in the Flow card, so what's kept is capped: past it the oldest goes. */
const MAX_TARGETS = 50;

type DimEntry = { level: number, at: number };
export type DimFlows = Record<string, DimEntry>;

/** A Flow's level: a number from 0 to `MAX_WEB_DIM`, in the page's steps of 5. */
export function dimLevelArg(input: unknown): number {
  const level = Math.round(Number(input) / 5) * 5;
  return Number.isFinite(level) ? Math.min(MAX_WEB_DIM, Math.max(0, level)) : 0;
}

/**
 * The Flow card *Dim the web dashboards*: a level for every browser, or for those showing a dashboard with a Popups
 * widget of that screen name (the Popups cards' way of naming a screen). Kept, so a page loaded later or back online
 * dims too; the page weighs it against its own slider and schedule (`dimWanted()` in settings/dashboard.js).
 */
export default class WebDim {
  constructor(private readonly homey: Homey.App['homey']) {}

  private read(): DimFlows {
    const stored = this.homey.settings.get(WEB_DIM_SETTING);
    const flows: DimFlows = Object.create(null);
    if (!stored || typeof stored !== 'object') return flows;
    for (const [target, entry] of Object.entries(stored as Record<string, DimEntry>)) {
      if (Number.isFinite(entry?.level) && Number.isFinite(entry?.at)) flows[target] = { level: entry.level, at: entry.at };
    }
    return flows;
  }

  /** What the page reads at its start and after a reconnect; `now` lets it put `at` on its own clock. */
  state() {
    return { flows: { ...this.read() }, now: Date.now() };
  }

  /** A Flow's choice: `all`, or `name:<name>` / the name itself as the Popups cards' screen argument gives it. */
  set(input: unknown, levelArg: unknown) {
    const id = typeof input === 'string' ? input : typeof (input as any)?.id === 'string' ? (input as any).id : '';
    let target = 'all';
    if (id && id !== 'all') {
      const key = screenKey(id.startsWith('name:') ? id.slice(5) : id);
      if (!key) throw new Error(`Not a screen name: ${id}`);
      target = `name:${key}`;
    }
    const flows = this.read();
    const entry = { level: dimLevelArg(levelArg), at: Date.now() };
    delete flows[target]; // so a set one is the newest in the key order too
    flows[target] = entry;
    const targets = Object.keys(flows);
    if (targets.length > MAX_TARGETS) {
      for (const old of targets.sort((a, b) => flows[a].at - flows[b].at).slice(0, targets.length - MAX_TARGETS)) delete flows[old];
    }
    this.homey.settings.set(WEB_DIM_SETTING, { ...flows });
    this.homey.api.realtime(WEB_DIM_EVENT, { target, ...entry, now: Date.now() });
  }

  /** For Diagnostics: which screens a Flow has set. */
  describe() {
    return this.read();
  }
}
