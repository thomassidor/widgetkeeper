import type Homey from 'homey';
import { getAppApi } from './appApi.js';
import { matches, type AutocompleteItem } from './autocomplete.js';
import { limitInsights } from './insightsLog.js';
import { sharedCache } from './sharedCache.js';

/**
 * The Insights logs an app keeps itself (`homey:app:<appId>:…`), which a chart could show beside the capabilities:
 * Better Logic Library's variables, for one (a user charted them by copying each into a Device Capabilities device).
 * Homey's own Logic variables have logs too (`homey:manager:logic:<variableId>`) but are left out (the user's choice,
 * 2026-11-03). `insights.getLogs()`
 * lists every log on the Homey, hundreds, so one read is shared for a minute and let go two minutes after it came in.
 *
 * Read on the Homey (2026-11-03, 484 logs): 341 devices', `homey:manager:apps` 134 (Homey's CPU and RAM per app,
 * `<appId>-cpu`/`-mem`, left out), `homey:manager:system` 5, `homey:manager:weather` 3, and one Logic number
 * variable's (`units` null, `decimals` 2). Its entries read as a device's: `getLogEntries({uri: ownerUri, id: <full id>})`
 * (the bare variable id is `Not Found`), `last7Days` hourly with `step`. A Better Logic Library number variable (4.2.3)
 * is `homey:app:net.i-dev.betterlogic:<name>` (`ownerId` the name, `title` the name, `units` `Value`, `decimals` 2) with
 * `ownerName` null, so the app's name comes from `apps.getApps()`; its entries read the same way (`lastHour` 5 s steps).
 */
export interface AppLog {
  id: string,
  ownerUri: string,
  ownerId: string | null,
  ownerName: string | null,
  type: string,
  title: string,
  units: string | null,
  decimals: number | null,
  lastValue: unknown,
}

const caches = new WeakMap<object, ReturnType<typeof sharedCache<any[]>>>();
const appCaches = new WeakMap<object, ReturnType<typeof sharedCache<any[]>>>();

function allLogs(homey: Homey.App['homey']): Promise<any[]> {
  let cache = caches.get(homey);
  if (!cache) {
    // Through limitInsights() like every other Insights read, so a busy Homey's answer pauses the rest too.
    cache = sharedCache(async () => {
      const api = await getAppApi(homey) as any;
      return Object.values(await limitInsights(() => api.insights.getLogs()) ?? {});
    }, { keepFor: 120e3 });
    caches.set(homey, cache);
  }
  return cache.get(60e3);
}

/** The installed apps' names by id (an app's own log has no `ownerName`), or none when they can't be read. */
async function appNames(homey: Homey.App['homey']): Promise<Map<string, string>> {
  let cache = appCaches.get(homey);
  if (!cache) {
    cache = sharedCache(async () => Object.values(await (await getAppApi(homey) as any).apps.getApps() ?? {}), { keepFor: 120e3 });
    appCaches.set(homey, cache);
  }
  try {
    return new Map((await cache.get(60e3)).map((a: any) => [String(a.id), String(a.name ?? a.id)]));
  } catch {
    return new Map();
  }
}

const APP_URI = 'homey:app:';

/**
 * A chart value setting's id for an app's log: `log:<appId>:<the rest of the log id, base64url>`. A Better Logic variable's
 * name is the end of its log id as typed, so it may hold `,` or `~` (the chart requests' separators), `:` or `%`; base64url
 * has none of them, so the slot goes into every request as it is. `<deviceId>:<capabilityId>` readers split on the first
 * colon, giving the device `log`, which no device's id is.
 */
export function logSlot(logId: string): string | null {
  if (!logId.startsWith(APP_URI)) return null;
  const rest = logId.slice(APP_URI.length);
  const i = rest.indexOf(':');
  if (i <= 0 || i === rest.length - 1) return null;
  return `log:${rest.slice(0, i)}:${Buffer.from(rest.slice(i + 1), 'utf8').toString('base64url')}`;
}

/**
 * A `logSlot()` id read back, or null for any other: the app, the log's owner (`uri`) and full id, and the
 * `deviceId`/`capabilityId` its state is sent with (`log:<appId>` and the encoded name), so `<deviceId>:<capabilityId>`
 * is the slot again.
 */
export function parseLogSlot(slot: string): { appId: string, uri: string, logId: string, deviceId: string, capabilityId: string } | null {
  const m = /^log:([^:]+):([A-Za-z0-9_-]+)$/.exec(slot);
  if (!m) return null;
  const name = Buffer.from(m[2], 'base64url').toString('utf8');
  if (!name || Buffer.from(name, 'utf8').toString('base64url') !== m[2]) return null;
  return { appId: m[1], uri: `${APP_URI}${m[1]}`, logId: `${APP_URI}${m[1]}:${name}`, deviceId: `log:${m[1]}`, capabilityId: m[2] };
}

/** Units an app gives that say nothing: Better Logic sets `Value` on every variable. */
const NO_UNITS = new Set(['value']);

/** A log's units to show, or null. */
export function logUnits(units: unknown): string | null {
  return typeof units === 'string' && units.trim() && !NO_UNITS.has(units.trim().toLowerCase()) ? units : null;
}

/** A log an app keeps itself (not a device's, nor Homey's own: Logic's, the apps' CPU and RAM, system's or weather's). */
export function isAppLog(log: any): boolean {
  return typeof log?.ownerUri === 'string' && log.ownerUri.startsWith(APP_URI);
}

/** Every app's own log (numbers and booleans), by the app's name, then title. */
export async function listAppLogs(homey: Homey.App['homey']): Promise<AppLog[]> {
  const logs = (await allLogs(homey)).filter(isAppLog);
  const names = logs.some(l => !l.ownerName) ? await appNames(homey) : new Map<string, string>();
  return logs
    .map((l: any): AppLog => ({
      id: String(l.id),
      ownerUri: l.ownerUri,
      ownerId: l.ownerId ?? null,
      ownerName: l.ownerName || names.get(l.ownerUri.slice(APP_URI.length)) || null,
      type: String(l.type),
      title: String(l.title ?? l.id),
      units: logUnits(l.units),
      decimals: typeof l.decimals === 'number' ? l.decimals : null,
      lastValue: l.lastValue ?? null,
    }))
    .sort((a, b) => String(a.ownerName ?? a.ownerUri).localeCompare(String(b.ownerName ?? b.ownerUri)) || a.title.localeCompare(b.title));
}

/** The app's logged numbers as a chart value setting lists them: `App · Title`, the units as the description. */
export async function listLogSlots(homey: Homey.App['homey'], query: string): Promise<AutocompleteItem[]> {
  const out: AutocompleteItem[] = [];
  for (const l of await listAppLogs(homey)) {
    const id = l.type === 'number' ? logSlot(l.id) : null;
    const name = `${l.ownerName ?? l.ownerUri.slice(APP_URI.length)} · ${l.title}`;
    if (id && matches(query, name, l.units ?? undefined)) out.push({ name, ...(l.units ? { description: l.units } : {}), id });
  }
  return out;
}

/** The app's log a `logSlot()` id names, or null when there's no such log (a deleted variable). */
export async function findLog(homey: Homey.App['homey'], slot: string): Promise<AppLog | null> {
  const s = parseLogSlot(slot);
  return s ? (await listAppLogs(homey)).find(l => l.id === s.logId) ?? null : null;
}

/**
 * For Diagnostics: the app-owned logs, and the owner URIs of every log on the Homey with how many each has (so a
 * Better Logic owned some other way than `homey:app:` still shows). One sample's raw fields too, as Homey sends them.
 */
export async function describeAppLogs(homey: Homey.App['homey']) {
  const logs = await allLogs(homey);
  const owners: Record<string, number> = {};
  for (const l of logs) {
    const kind = typeof l?.ownerUri === 'string' ? l.ownerUri.replace(/^(homey:device):.*$/, '$1:…') : String(l?.ownerUri);
    owners[kind] = (owners[kind] ?? 0) + 1;
  }
  const apps = await listAppLogs(homey);
  const sample = logs.find(isAppLog) ?? null;
  return { total: logs.length, owners, apps, sample };
}
