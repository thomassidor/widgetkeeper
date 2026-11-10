import type Homey from 'homey';
import { devicesAndZones } from './autocomplete.js';
import { readZones } from './DeviceTracker.js';
import Timings from './Timings.js';

/** The app setting: how the widgets show device names, `{mode, separator}` (`NameRule`), from the app settings page. */
export const DEVICE_NAMES_SETTING = 'deviceNames';
/** Sent when it changes, so open widgets read their devices again. */
export const DEVICE_NAMES_EVENT = 'devicenames:state';

/**
 * The whole name, the part before the first separator, the part after the last one, the last word, or the name
 * without its room's name at the start or end (`room`, 1.2.0: *Kitchen ceiling lamp* in the Kitchen).
 */
const NAME_MODES = ['full', 'before', 'after', 'lastWord', 'room'] as const;
export type NameMode = typeof NAME_MODES[number];
export type NameRule = { mode: NameMode, separator: string };

const DEFAULT_SEPARATOR = '|';
const MAX_SEPARATOR = 5;
/** How many of the Homey's names the settings page shows as examples. */
const EXAMPLES = 3;

/** A separator as typed: 1–5 characters, spaces included (` - ` leaves `Wi-Fi` whole). */
function isSeparator(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_SEPARATOR;
}

function isMode(v: unknown): v is NameMode {
  return NAME_MODES.includes(v as NameMode);
}

/** The stored setting as a rule: full names when it's missing or broken, `|` without a usable separator. */
export function nameRule(value: unknown): NameRule {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { mode: isMode(v.mode) ? v.mode : 'full', separator: isSeparator(v.separator) ? v.separator : DEFAULT_SEPARATOR };
}

/** What may stand between a room's name and the rest: spaces, dashes, `|`, `:`, `·`, `,` and `/`. */
const ROOM_GAP = '[\\s\\-\u2013\u2014|:\u00b7,/]+';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `name` without `room` at its start or end, as a whole word or words (any case, with what stands between them):
 * *Kitchen ceiling lamp*, *Kitchen - Ceiling lamp* and *Ceiling lamp (Kitchen)* … *Ceiling lamp Kitchen* in the
 * Kitchen. Its first letter is made a capital when the name started with one. Empty when the room isn't there.
 */
export function withoutRoom(name: string, room: string | null | undefined): string {
  const r = room?.trim();
  const n = name.trim();
  if (!r || !n) return '';
  const esc = escapeRegExp(r);
  const start = new RegExp(`^${esc}${ROOM_GAP}`, 'iu').exec(n);
  if (start) {
    const rest = n.slice(start[0].length);
    const first = n.charAt(0);
    const capital = first !== first.toLocaleLowerCase() && first === first.toLocaleUpperCase();
    return capital ? rest.charAt(0).toLocaleUpperCase() + rest.slice(1) : rest;
  }
  const end = new RegExp(`${ROOM_GAP}\\(?${esc}\\)?$`, 'iu').exec(n);
  return end ? n.slice(0, end.index) : '';
}

/**
 * The part of `name` the rule shows, trimmed: before the first separator, after the last one, the last word, or
 * without its room (`room`, the device's room's name). The whole name when the separator or room isn't in it or the
 * part would be empty (`| Kitchen`, a device called *Kitchen* in the Kitchen).
 */
export function shortName(name: string, rule: NameRule, room?: string | null): string {
  let part = '';
  if (rule.mode === 'before') {
    const at = name.indexOf(rule.separator);
    if (at >= 0) part = name.slice(0, at);
  } else if (rule.mode === 'after') {
    const at = name.lastIndexOf(rule.separator);
    if (at >= 0) part = name.slice(at + rule.separator.length);
  } else if (rule.mode === 'lastWord') {
    part = name.trim().split(/\s+/).pop() ?? '';
  } else if (rule.mode === 'room') {
    part = withoutRoom(name, room);
  }
  return part.trim() || name;
}

/**
 * A device's name as the widgets show it, by the app setting (read each time: it's in memory), `room` its room's name
 * (only *Leave out the room* uses it). Only for what a widget shows: pickers, Flow tokens, logs and diagnostics keep
 * the full name.
 */
export function shownName(homey: Homey.App['homey'], name: string, room?: string | null): string {
  return shortName(name, nameRule(homey.settings.get(DEVICE_NAMES_SETTING)), room);
}

/**
 * How a widget's answer names its devices: `show(name, zoneId)`, by the setting as it is now. Only *Leave out the
 * room* reads the zones (`readZones()`, shared for a minute; a failed read leaves the names whole).
 */
export async function deviceNamer(homey: Homey.App['homey'], tm: Timings | null, log: (...args: any[]) => void, what: string) {
  const rule = nameRule(homey.settings.get(DEVICE_NAMES_SETTING));
  const zones = rule.mode === 'room' ? await readZones(homey, tm ?? new Timings(), log, what) : {};
  return (name: string, zoneId?: string | null): string => {
    const room = zoneId && Object.prototype.hasOwnProperty.call(zones, zoneId) ? zones[zoneId]?.name : null;
    return shortName(name, rule, typeof room === 'string' ? room : null);
  };
}

export type DeviceNamesState = NameRule & {
  /** Up to three of the Homey's device names the rule changes, by name. */
  examples?: { name: string, shown: string }[],
  /** How many names it changes, of how many. */
  changed?: number,
  total?: number,
};

/** For the app settings page: the rule and what it does to the Homey's device names (left out when they can't be read). */
export async function deviceNamesState(homey: Homey.App['homey'], log: (...args: any[]) => void): Promise<DeviceNamesState> {
  const rule = nameRule(homey.settings.get(DEVICE_NAMES_SETTING));
  try {
    const [devices, zones] = await devicesAndZones(homey);
    const named = devices.map(d => ({ name: String(d.name ?? ''), room: zones[d.zone]?.name as string | undefined }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const changed = named.flatMap(({ name, room }) => {
      const shown = shortName(name, rule, room);
      return shown === name ? [] : [{ name, shown }];
    });
    return { ...rule, examples: changed.slice(0, EXAMPLES), changed: changed.length, total: named.length };
  } catch (err) {
    log('Device names: the devices could not be read:', err);
    return rule;
  }
}

/**
 * The app settings page's choice, `{mode, separator?}` (without a separator the stored one stays): stored, and open
 * widgets told when it changed. Answers `{ok: true, …deviceNamesState()}`, or `{ok: false, reason: 'separator'}` for
 * an empty or too long one.
 */
export async function setDeviceNames(homey: Homey.App['homey'], log: (...args: any[]) => void, body: { mode?: unknown, separator?: unknown }) {
  if (!isMode(body?.mode)) throw new Error('Invalid mode');
  const before = nameRule(homey.settings.get(DEVICE_NAMES_SETTING));
  if (body.separator !== undefined && !isSeparator(body.separator)) return { ok: false as const, reason: 'separator' as const };
  const rule: NameRule = { mode: body.mode, separator: isSeparator(body.separator) ? body.separator : before.separator };
  homey.settings.set(DEVICE_NAMES_SETTING, rule);
  if (rule.mode !== before.mode || rule.separator !== before.separator) homey.api.realtime(DEVICE_NAMES_EVENT, rule);
  return { ok: true as const, ...await deviceNamesState(homey, log) };
}
