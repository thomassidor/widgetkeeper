import type Homey from 'homey';

/**
 * The app setting: whether the transparent widgets' tiles have the native tiles' soft shadow in light mode (kit.css's
 * `--wk-tile-shadow`; issue #20, 1.3.1). On unless turned off on the settings page's Appearance card (the user's ask,
 * 2026-11-14: one option for the app).
 */
export const TILE_SHADOW_SETTING = 'tileShadow';
/** Sent with `{tileShadow}` when it changes, so open widgets follow at once. */
export const TILE_SHADOW_EVENT = 'tileshadow:state';

/** The stored setting: on unless it's `false`. */
export function tileShadowOf(homey: Homey.App['homey']): boolean {
  return homey.settings.get(TILE_SHADOW_SETTING) !== false;
}

/** Tells open widgets when the settings page (which writes the app setting itself) changes it. */
export function watchTileShadow(homey: Homey.App['homey']): void {
  const changed = (key: string) => {
    if (key !== TILE_SHADOW_SETTING) return;
    Promise.resolve(homey.api.realtime(TILE_SHADOW_EVENT, { tileShadow: tileShadowOf(homey) })).catch(() => { /* no widget open */ });
  };
  homey.settings.on('set', changed);
  homey.settings.on('unset', changed);
}

/*
 * No route of its own (the user's ask, 2026-11-15: no extra request): `tileShadow` comes with an answer each widget with
 * tiles reads anyway, and the kit takes it from there (`takeTileShadow()`): the tile names' `{state, tileNames}`
 * (`withTileNames()`), the time format's `GET /time-format`, Notes' and Flow Tiles' `/state`, the Smart Stack's `/pages` and Flow
 * Buttons' `/state` (`{state, tileShadow}`). A change comes as realtime `tileshadow:state` (`wireTileShadow()`).
 */
