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

/**
 * The widget route every widget with tiles in kit.css's list spreads into its `api.ts` (and declares in its manifest),
 * for the kit's `wireTileShadow()`: `GET /tile-shadow` → `{tileShadow}`.
 */
export const tileShadowRoutes = {
  async getTileShadow({ homey }: { homey: Homey.App['homey'] }) {
    return { tileShadow: tileShadowOf(homey) };
  },
};
