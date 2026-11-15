import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fakeApi, fakeHomey } from './helpers/fakeHomey.js';
import { spyApp } from './helpers/spyApp.js';
import { WEB_APIS } from '../api.js';
import { TILE_SHADOW_EVENT, tileShadowOf, watchTileShadow } from '../lib/tileShadow.js';
import { callWidgetRoute } from '../lib/widgetRoutes.js';

const manifest = JSON.parse(readFileSync('app.json', 'utf8'));

/** The app's Tile shadows: the light-mode tile shadow, on unless turned off on the settings page's Appearance card. */
describe('Tile shadows (lib/tileShadow.ts)', () => {
  it('is on unless the setting is false', () => {
    const homey = fakeHomey(fakeApi({}));
    expect(tileShadowOf(homey)).toBe(true);
    homey.settings.set('tileShadow', 'nonsense');
    expect(tileShadowOf(homey)).toBe(true);
    homey.settings.set('tileShadow', false);
    expect(tileShadowOf(homey)).toBe(false);
  });

  it('tells open widgets when the settings page changes it, and only then', () => {
    const homey = fakeHomey(fakeApi({}));
    watchTileShadow(homey);
    homey.settings.set('timeFormat', '24');
    expect(homey.api.realtime).not.toHaveBeenCalled();
    homey.settings.set('tileShadow', false);
    expect(homey.api.realtime).toHaveBeenLastCalledWith(TILE_SHADOW_EVENT, { tileShadow: false });
    homey.settings.unset('tileShadow');
    expect(homey.api.realtime).toHaveBeenLastCalledWith(TILE_SHADOW_EVENT, { tileShadow: true });
  });

  it('has no route of its own', () => {
    for (const [id, w] of Object.entries<any>(manifest.widgets)) {
      expect([id, Object.values<any>(w.api ?? {}).some(r => r.path === '/tile-shadow')]).toEqual([id, false]);
    }
  });

  // The answers the tile widgets read anyway carry it, so none asks for it (`test/widget-surface.test.ts` mounts each).
  it.each([
    ['the tile names wrapper', 'lights', '/state', { deviceIds: 'd1', instance: 'w1' }],
    ['the time format', 'clock', '/time-format', {}],
    ["Notes' state", 'textline', '/state', { board: 'Kitchen' }],
    ["Flow Tiles' state", 'flowtiles', '/state', { board: 'Kitchen' }],
    ["the Smart Stack's pages", 'stack', '/pages', { dashboardId: 'dash1' }],
    ["Flow Buttons' state", 'flows', '/state', { ids: 'flow:a' }],
  ])('comes with %s', async (_what, type, path, query) => {
    const homey = fakeHomey(fakeApi({}));
    homey.manifest = { ...homey.manifest, widgets: manifest.widgets };
    homey.app = spyApp().app;
    homey.settings.set('tileShadow', false);
    expect(await callWidgetRoute(homey, WEB_APIS, type, 'GET', path, query, {})).toMatchObject({ tileShadow: false });
  });
});
