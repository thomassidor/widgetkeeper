import { describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeHomey, homeyApiMock, keyApis } from './helpers/fakeHomey.js';
import api from '../api.js';
import KeypadService from '../lib/KeypadService.js';
import PersonalApiKey from '../lib/PersonalApiKey.js';
import { TILE_SHADOW_SETTING } from '../lib/tileShadow.js';
import { TIMELINE_UPDATES_SETTING } from '../lib/UpdateNotice.js';
import { findAppSettingsRoute } from '../lib/webAppSettings.js';
import { WEB_ENABLED_SETTING, WEB_REMOTE_SETTING } from '../lib/WebDashboardService.js';
import WebPassword from '../lib/WebPassword.js';

vi.mock('homey-api', () => homeyApiMock);

// The web dashboards' App settings (`POST /web/app-settings`, lib/webAppSettings.ts): the app settings page's routes and
// app settings, for a browser whose own key has full access only.
function setup() {
  const homey = fakeHomey(fakeApi({}));
  homey.settings.set(WEB_ENABLED_SETTING, true);
  const log = vi.fn();
  const web = { enabled: true, remote: false, assertEnabled: vi.fn() };
  homey.app = { web, webPassword: new WebPassword(homey, log), keypad: new KeypadService(homey, {} as any, log), log, debug: vi.fn() };
  homey.app.apiKey = new PersonalApiKey(homey, vi.fn());
  keyApis.set('full', { sessions: { getSessionMe: async () => ({ scopes: ['homey'] }) } });
  keyApis.set('screen', { sessions: { getSessionMe: async () => ({ scopes: ['homey.device.control', 'homey.app.control'] }) } });
  const call = (method: string, path: string, body?: unknown, key = 'full', query?: Record<string, string>) =>
    api.postWebAppSettings({ homey, query, body: { key, method, path, body } });
  return { homey, web, call };
}

describe('web dashboards: the app settings', () => {
  it('answers only a key with full access', async () => {
    const { call } = setup();
    await expect(call('GET', '/settings', undefined, '')).rejects.toThrow(/\(keyInvalid\)/);
    await expect(call('GET', '/settings', undefined, 'nope')).rejects.toThrow(/\(keyInvalid\)/);
    await expect(call('GET', '/settings', undefined, 'screen')).rejects.toThrow(/\(keyScope\)/);
    await expect(call('GET', '/time-format', undefined, 'screen')).rejects.toThrow(/\(keyScope\)/);
    await expect(call('GET', '/settings')).resolves.toMatchObject({ [WEB_ENABLED_SETTING]: true });
  });

  it("is a web route: off, or without the password's session, it doesn't answer", async () => {
    const { homey, web, call } = setup();
    web.assertEnabled.mockImplementation(() => { throw new Error('Web dashboards are turned off'); });
    await expect(call('GET', '/settings')).rejects.toThrow(/turned off/);
    web.assertEnabled.mockReset();
    await homey.app.webPassword.setPassword('correct horse');
    await expect(call('GET', '/settings')).rejects.toThrow(/password required/);
    const { token } = await homey.app.webPassword.login('correct horse');
    await expect(call('GET', '/settings', undefined, 'full', { session: token })).resolves.toBeTruthy();
  });

  it('reads the app settings the cards read, and writes only those it may', async () => {
    const { homey, call } = setup();
    homey.settings.set(TILE_SHADOW_SETTING, false);
    expect(await call('GET', '/settings')).toEqual({
      [WEB_ENABLED_SETTING]: true, [WEB_REMOTE_SETTING]: null, [TIMELINE_UPDATES_SETTING]: null, [TILE_SHADOW_SETTING]: false,
    });
    await expect(call('PUT', '/settings', { name: TILE_SHADOW_SETTING, value: true })).resolves.toEqual({ ok: true, tileShadow: true });
    expect(homey.settings.get(TILE_SHADOW_SETTING)).toBe(true);
    await call('PUT', '/settings', { name: TIMELINE_UPDATES_SETTING, value: false });
    expect(homey.settings.get(TIMELINE_UPDATES_SETTING)).toBe(false);
    // Not the web dashboards' own switch, nor Remote access away from home: either would lock the page out.
    await expect(call('PUT', '/settings', { name: WEB_ENABLED_SETTING, value: false })).rejects.toThrow(/may not change/);
    await expect(call('PUT', '/settings', { name: WEB_REMOTE_SETTING, value: false }, 'full', { away: '1' })).rejects.toThrow(/may not change/);
    await call('PUT', '/settings', { name: WEB_REMOTE_SETTING, value: true });
    expect(homey.settings.get(WEB_REMOTE_SETTING)).toBe(true);
    // Nothing else, and only booleans.
    for (const name of ['webDashboards', 'variablesApiKey', '__proto__', 'constructor']) {
      await expect(call('PUT', '/settings', { name, value: true })).rejects.toThrow(/may not change/);
    }
    await expect(call('PUT', '/settings', { name: TILE_SHADOW_SETTING, value: 'yes' })).rejects.toThrow(/true or false/);
    expect(homey.settings.get(WEB_ENABLED_SETTING)).toBe(true);
  });

  it("answers the settings page's routes as they would, with the path's id, and nothing else", async () => {
    const { call } = setup();
    await expect(call('GET', '/time-format')).resolves.toEqual({ timeFormat: 'auto' });
    await expect(call('PUT', '/time-format', { timeFormat: '12' })).resolves.toMatchObject({ ok: true, timeFormat: '12' });
    const added = await call('POST', '/keypad-codes', { name: 'Alarm', code: '4711' }) as any;
    expect(added).toMatchObject({ ok: true, codes: [{ name: 'Alarm', digits: 4 }] });
    const id = added.codes[0].id;
    await expect(call('PUT', `/keypad-codes/${encodeURIComponent(id)}`, { current: '4711', code: '2580' })).resolves.toMatchObject({ ok: true });
    await expect(call('DELETE', `/keypad-codes/${encodeURIComponent(id)}`)).resolves.toMatchObject({ ok: true, codes: [] });
    // Not a web dashboards route, a widget's, or another method.
    await expect(call('PUT', '/web/dashboards', {})).rejects.toThrow(/Not an app setting/);
    await expect(call('POST', '/web/call', {})).rejects.toThrow(/Not an app setting/);
    await expect(call('DELETE', '/time-format')).rejects.toThrow(/Not an app setting/);
    await expect(call('GET', '/keypad-codes/')).rejects.toThrow(/Not an app setting/);
  });

  it('matches a path with its id and query', () => {
    expect(findAppSettingsRoute('get', '/diagnostics?device=Lamp%201')).toEqual({ handler: 'getDiagnostics', params: {}, query: { device: 'Lamp 1' } });
    expect(findAppSettingsRoute('PUT', '/web/screens/a%2Fb/dashboard')).toEqual({ handler: 'putWebScreenDashboard', params: { id: 'a/b' }, query: {} });
    expect(findAppSettingsRoute('PUT', '/web/screens/a')).toMatchObject({ handler: 'putWebScreen', params: { id: 'a' } });
    expect(findAppSettingsRoute('PUT', '/web/screens/%E0')).toBeNull();
    expect(findAppSettingsRoute(1, '/time-format')).toBeNull();
  });
});
