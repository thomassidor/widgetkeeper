import type Homey from 'homey';
import { getAppApi } from './appApi.js';
import { capabilityReading, describeCapability } from './capabilities.js';
import { sharedCache } from './sharedCache.js';
import { valueGlyphImage } from './valueGlyphs.js';

/** An item of a widget setting's or a Flow card argument's autocomplete. */
export type AutocompleteItem = { name: string, description?: string, image?: string, id: string };

/** Text as searches compare it: lower case, without accents (`Café` is found by `cafe`). */
function folded(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const queryWords = (query: string) => folded(query || '').split(/\s+/).filter(Boolean);

/**
 * Whether every word of the query is in at least one of the texts (any case and accents, in any order, so
 * `living room temperature` finds a `Sensor · Temperature` in the Living room); an empty query matches everything.
 */
export function matches(query: string, ...texts: (string | undefined | null)[]) {
  const words = queryWords(query);
  if (!words.length) return true;
  const hay = texts.filter((t): t is string => typeof t === 'string').map(folded);
  return words.every(w => hay.some(t => t.includes(w)));
}

/** The items whose name or description, what a row shows, or an `extra` text (a capability's id) has the query's words. */
export function filterItems<T extends { name: string, description?: string }>(query: string, items: T[], extra: (item: T) => (string | undefined | null)[] = () => []): T[] {
  return items.filter(i => matches(query, i.name, i.description, ...extra(i)));
}

/** Compares names in Homey's language, numbers by their value: `Spot 2` before `Spot 10`, and `Å` where a Dane looks for it. */
export function nameOrder(homey: Homey.App['homey']): (a: string, b: string) => number {
  let language: string | undefined;
  try { language = homey.i18n.getLanguage(); } catch { /* the default */ }
  try {
    return new Intl.Collator(language, { numeric: true }).compare;
  } catch {
    return new Intl.Collator(undefined, { numeric: true }).compare;
  }
}

/** `nameOrder()` for items with a `name`. */
export function byName(homey: Homey.App['homey']): (a: { name: string }, b: { name: string }) => number {
  const order = nameOrder(homey);
  return (a, b) => order(a.name, b.name);
}

/** "None" first (id `none`, which the widgets skip), so a slot can be emptied again; left out when the query doesn't match it. */
export function withNone(none: string, query: string, items: AutocompleteItem[]): AutocompleteItem[] {
  return matches(query, none) ? [{ name: none, id: 'none' }, ...items] : items;
}

/**
 * A row that only says something (`Pick a thermostat first`, `No speakers found`), for the lists where a setting's first
 * pick is missing or nothing qualifies. The phone has no row that can't be tapped, so its id is `none`, which the widgets
 * read as nothing chosen; `hint` lets the web editor show it as plain text.
 */
export function hintRow(name: string, description?: string): AutocompleteItem & { hint: true } {
  return { name, ...(description ? { description } : {}), id: 'none', hint: true };
}

/** At most this many rows in a list, so a large Homey's thousand device values aren't sent on every keystroke. */
export const MAX_ROWS = 100;

/** Whether a row isn't a choice of its own (`None`, a hint, the thermostat's `Don't change`): these stay on top. */
const pinned = (item: { id?: unknown, capabilityId?: unknown }) => item.id === 'none' || (item.id === undefined && item.capabilityId === undefined);

/** Whether every word starts a word of the text. */
function startsWords(words: string[], text: string) {
  return words.every((w) => {
    for (let at = text.indexOf(w); at >= 0; at = text.indexOf(w, at + 1)) {
      if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1])) return true;
    }
    return false;
  });
}

/**
 * The last step of every setting's list: the rows whose words start with what's typed before those that only hold it
 * (`lamp` puts `Lamp 1` before `Clamp`; otherwise the listers' order stays), then at most `MAX_ROWS`, the last row saying
 * how many more there are. `cap: false` for a list whose id is what the widget keeps as a name (Flow Tiles' boards).
 */
export function finishList<T extends { name: string, description?: string, id?: unknown, capabilityId?: unknown }>(
  homey: Homey.App['homey'], query: string, items: T[], { cap = true } = {},
): (T | ReturnType<typeof hintRow>)[] {
  const words = queryWords(query);
  const ranked = !words.length ? items : items
    .map((item) => {
      const text = folded(`${item.name} ${item.description ?? ''}`);
      return { item, rank: pinned(item) ? 0 : startsWords(words, text) ? 1 : 2 };
    })
    .sort((a, b) => a.rank - b.rank)
    .map(r => r.item);
  const rows = ranked.filter(i => !pinned(i)).length;
  if (!cap || rows <= MAX_ROWS) return ranked;
  let left = MAX_ROWS;
  const kept = ranked.filter(i => pinned(i) || left-- > 0);
  const more = rows - MAX_ROWS;
  return [...kept, hintRow(homey.__('autocomplete.more', { count: more }) || `${more} more: keep typing`)];
}

const deviceReads = new WeakMap<object, ReturnType<typeof sharedCache<[any[], Record<string, any>]>>>();

/**
 * Every device and the zones, for the lists below, the web editor's pickers and Media's speaker list: one read shared
 * for 5 s, as an autocomplete asks on every keystroke. A failed zone read only loses the rooms.
 */
export function devicesAndZones(homey: Homey.App['homey']): Promise<[any[], Record<string, any>]> {
  let cache = deviceReads.get(homey);
  if (!cache) {
    // Every device and zone as homey-api Items: let go 30 s after the read, not kept until the next autocomplete.
    deviceReads.set(homey, cache = sharedCache(async () => {
      const api = await getAppApi(homey);
      const [devices, zones] = await Promise.all([
        api.devices.getDevices(),
        api.zones.getZones().catch(() => ({})),
      ]);
      return [Object.values(devices) as any[], zones as Record<string, any>];
    }, { keepFor: 30e3 }));
  }
  return cache.get(5e3);
}

/**
 * The devices that pass `filter`, by name, described by their zone. `empty`: what one row says when no device on the
 * Homey passes (whatever's typed).
 */
export async function listDevicesWhere(homey: Homey.App['homey'], query: string, filter: (device: any) => boolean, { empty }: { empty?: string } = {}): Promise<AutocompleteItem[]> {
  const [devices, zones] = await devicesAndZones(homey);
  const passing = devices.filter(filter);
  if (!passing.length && empty) return [hintRow(empty)];
  return passing
    .map(d => ({ name: d.name as string, description: zones[d.zone]?.name as string | undefined, id: d.id as string }))
    .filter(d => matches(query, d.name, d.description))
    .sort(byName(homey));
}

/**
 * Every device × capability pair that `capsOf` gives, as `Device · Capability` with the id `<deviceId>:<capabilityId>`,
 * described by the zone and the value as it reads now (the units when there's none; a reading isn't searched, or `on`
 * would find every switch that's on), with the capability's glyph. "None" first, so a tile can be emptied again: its id
 * has no colon, so the widget skips the slot.
 */
export async function listCapabilitySlots(
  homey: Homey.App['homey'], query: string, capsOf: (device: any) => string[], first: (capabilityId: string) => boolean = () => false,
): Promise<AutocompleteItem[]> {
  const [devices, zones] = await devicesAndZones(homey);
  const items: (AutocompleteItem & { first: boolean })[] = [];
  for (const d of devices) {
    const zone = zones[d.zone]?.name as string | undefined;
    for (const id of capsOf(d)) {
      const c = describeCapability(d.capabilitiesObj[id], id);
      const name = `${d.name} · ${c.title}`;
      if (!matches(query, name, zone, id, c.units)) continue;
      const value = d.capabilitiesObj[id]?.value;
      items.push({
        name,
        description: [zone, capabilityReading(homey, c, value) ?? c.units].filter(Boolean).join(' · ') || undefined,
        image: valueGlyphImage(id, value),
        id: `${d.id}:${id}`,
        first: first(id),
      });
    }
  }
  // The capabilities `first` picks (a meter's for Chart · Totals) before the rest, each alphabetically.
  const order = nameOrder(homey);
  items.sort((a, b) => Number(b.first) - Number(a.first) || order(a.name, b.name));
  for (const item of items) delete (item as Partial<typeof item>).first;
  return withNone(homey.__('values.none') || 'None', query, items);
}
