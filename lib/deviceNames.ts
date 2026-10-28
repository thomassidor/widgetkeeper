import type Homey from 'homey';
import { devicesAndZones } from './autocomplete.js';

/** The app setting: how the widgets show device names, `{mode, separator}` (`NameRule`), from the app settings page. */
export const DEVICE_NAMES_SETTING = 'deviceNames';
/** Sent when it changes, so open widgets read their devices again. */
export const DEVICE_NAMES_EVENT = 'devicenames:state';

/** The whole name, the part before the first separator, the part after the last one, the last word. */
export const NAME_MODES = ['full', 'before', 'after', 'lastWord'] as const;
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

/**
 * The part of `name` the rule shows, trimmed: before the first separator, after the last one, or the last word. The
 * whole name when the separator isn't in it or the part would be empty (`| Kitchen`).
 */
export function shortName(name: string, rule: NameRule): string {
  let part = '';
  if (rule.mode === 'before') {
    const at = name.indexOf(rule.separator);
    if (at >= 0) part = name.slice(0, at);
  } else if (rule.mode === 'after') {
    const at = name.lastIndexOf(rule.separator);
    if (at >= 0) part = name.slice(at + rule.separator.length);
  } else if (rule.mode === 'lastWord') {
    part = name.trim().split(/\s+/).pop() ?? '';
  }
  return part.trim() || name;
}

/**
 * A device's name as the widgets show it, by the app setting (read each time: it's in memory). Only for what a widget
 * shows: pickers, Flow tokens, logs and diagnostics keep the full name.
 */
export function shownName(homey: Homey.App['homey'], name: string): string {
  return shortName(name, nameRule(homey.settings.get(DEVICE_NAMES_SETTING)));
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
    const [devices] = await devicesAndZones(homey);
    const names = devices.map(d => String(d.name ?? '')).sort((a, b) => a.localeCompare(b));
    const changed = names.flatMap((name) => {
      const shown = shortName(name, rule);
      return shown === name ? [] : [{ name, shown }];
    });
    return { ...rule, examples: changed.slice(0, EXAMPLES), changed: changed.length, total: names.length };
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
