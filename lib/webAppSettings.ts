import type { App } from 'homey';
import { TIMELINE_UPDATES_SETTING } from './UpdateNotice.js';
import { TILE_SHADOW_SETTING } from './tileShadow.js';
import { WEB_ENABLED_SETTING, WEB_REMOTE_SETTING } from './WebDashboardService.js';

type Homey = App['homey'];

/**
 * The app's settings from the web dashboards' Settings dialog (`settings/app-settings.js`, the cards the app settings
 * page has too), through `POST /web/app-settings {key, method, path, body}`: the settings page's own routes, by method
 * and path, and the app settings it reads and writes with `Homey.get`/`Homey.set` (`GET`/`PUT /settings`, which only
 * this route answers). Only a browser whose own key has full access (`homey`) may: a screen's or a family tablet's
 * key, with Devices only, sees none of it (the user's choice, 2026-11-20).
 */
export const APP_SETTINGS_ROUTES: ReadonlyArray<readonly [method: string, path: string, handler: string]> = [
  ['GET', '/variables-key', 'getVariablesKey'],
  ['PUT', '/variables-key', 'putVariablesKey'],
  ['GET', '/device-names', 'getDeviceNames'],
  ['PUT', '/device-names', 'putDeviceNames'],
  ['GET', '/time-format', 'getTimeFormat'],
  ['PUT', '/time-format', 'putTimeFormat'],
  ['GET', '/temperature-unit', 'getTemperatureUnit'],
  ['PUT', '/temperature-unit', 'putTemperatureUnit'],
  ['GET', '/keypad-codes', 'getKeypadCodes'],
  ['POST', '/keypad-codes', 'postKeypadCode'],
  ['PUT', '/keypad-codes/:id', 'putKeypadCode'],
  ['DELETE', '/keypad-codes/:id', 'deleteKeypadCode'],
  ['GET', '/web/address', 'getWebAddress'],
  ['GET', '/web/password', 'getWebPassword'],
  ['PUT', '/web/password', 'putWebPassword'],
  ['GET', '/web/screens', 'getWebScreens'],
  ['POST', '/web/screens', 'postWebScreen'],
  ['PUT', '/web/screens/:id', 'putWebScreen'],
  ['PUT', '/web/screens/:id/dashboard', 'putWebScreenDashboard'],
  ['DELETE', '/web/screens/:id', 'deleteWebScreen'],
  ['GET', '/diagnostics', 'getDiagnostics'],
];

/**
 * The app settings the cards read with `Homey.get` and which of them they may write from a web dashboard: not the
 * web dashboards' own switch (off would lock the page out; the Web dashboards card leaves it out there), and Remote
 * access not from away from home, for the same reason.
 */
export const APP_SETTING_FLAGS: Record<string, { write: boolean | 'home' }> = {
  [WEB_ENABLED_SETTING]: { write: false },
  [WEB_REMOTE_SETTING]: { write: 'home' },
  [TIMELINE_UPDATES_SETTING]: { write: true },
  [TILE_SHADOW_SETTING]: { write: true },
};

/** The scope a browser's key needs for any of it: full access. */
export const APP_SETTINGS_SCOPE = 'homey';

/** A call's route: its handler, with the path's `:id` and query, or null for one that isn't the settings page's. */
export function findAppSettingsRoute(method: unknown, path: unknown) {
  if (typeof method !== 'string' || typeof path !== 'string') return null;
  const [bare, search = ''] = path.split('?');
  const parts = bare.split('/');
  for (const [m, pattern, handler] of APP_SETTINGS_ROUTES) {
    if (m !== method.toUpperCase()) continue;
    const want = pattern.split('/');
    if (want.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < want.length && ok; i++) {
      if (want[i].startsWith(':')) {
        try { params[want[i].slice(1)] = decodeURIComponent(parts[i]); } catch { ok = false; }
        ok = ok && !!parts[i];
      } else {
        ok = want[i] === parts[i];
      }
    }
    if (ok) return { handler, params, query: Object.fromEntries(new URLSearchParams(search)) };
  }
  return null;
}

/** `GET /settings`: the flags as stored (missing is null; each card reads its own default). */
export function appSettingValues(homey: Homey) {
  return Object.fromEntries(Object.keys(APP_SETTING_FLAGS).map(name => [name, homey.settings.get(name) ?? null]));
}

/** `PUT /settings {name, value}`: a flag the web dashboards may write, as a boolean. */
export function setAppSettingFlag(homey: Homey, body: unknown, away: boolean) {
  const { name, value } = (body ?? {}) as { name?: unknown, value?: unknown };
  const flag = typeof name === 'string' && Object.prototype.hasOwnProperty.call(APP_SETTING_FLAGS, name) ? APP_SETTING_FLAGS[name] : null;
  if (!flag || !flag.write || (flag.write === 'home' && away)) throw new Error(`The web dashboards may not change ${String(name)}`);
  if (typeof value !== 'boolean') throw new Error(`${name} takes true or false`);
  homey.settings.set(name as string, value);
  return { ok: true, [name as string]: value };
}
