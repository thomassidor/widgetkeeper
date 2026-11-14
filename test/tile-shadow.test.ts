import { describe, expect, it } from 'vitest';
import { fakeApi, fakeHomey } from './helpers/fakeHomey.js';
import { TILE_SHADOW_EVENT, tileShadowOf, tileShadowRoutes, watchTileShadow } from '../lib/tileShadow.js';

/** The app's Tile shadows: the light-mode tile shadow, on unless turned off on the settings page's Appearance card. */
describe('Tile shadows (lib/tileShadow.ts)', () => {
  it('is on unless the setting is false', async () => {
    const homey = fakeHomey(fakeApi({}));
    expect(tileShadowOf(homey)).toBe(true);
    homey.settings.set('tileShadow', 'nonsense');
    expect(tileShadowOf(homey)).toBe(true);
    homey.settings.set('tileShadow', false);
    expect(tileShadowOf(homey)).toBe(false);
    expect(await tileShadowRoutes.getTileShadow({ homey })).toEqual({ tileShadow: false });
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
});
