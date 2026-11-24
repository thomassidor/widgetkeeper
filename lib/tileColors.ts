import type Homey from 'homey';

/**
 * The colours a Flow can give a tile: Device Values' tiles, Flow Buttons' buttons and Notes (the cards'
 * `color` argument, which also has `default`; `test/locales.test.ts` checks the three cards list these). The kit's
 * `COLORS` are the same names.
 */
export const TILE_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'teal', 'cyan', 'indigo', 'pink', 'brown', 'grey'] as const;
export type TileColor = typeof TILE_COLORS[number] | `#${string}`;

/**
 * White and black (1.4.0, wk-135: a device whose normal state is On can look calm): only on the Flow cards, after the
 * palette. Not palette colours (no Vivid shade, no colour setting has them): a card's `white`/`black` is kept and sent
 * as this custom colour, drawn as any other (the kit's `paintColor()`: a 22 % tint in Muted, solid in Vivid).
 */
export const FLOW_ONLY_COLORS = { white: '#ffffff', black: '#000000' } as const;

/** A custom colour as kept and sent: `#rrggbb`, lower case (the kit's `isCustomColor()` takes the same). */
const CUSTOM = /^#[0-9a-f]{6}$/;

/**
 * A Flow card's `color` argument: a tile colour, `white` or `black` (as their hex) or a custom colour as
 * `parseCustomColor()` gives it, or null for `default` (the widget's own). Anything else throws.
 */
export function parseTileColor(color: string): TileColor | null {
  if (color === 'default') return null;
  if (Object.prototype.hasOwnProperty.call(FLOW_ONLY_COLORS, color)) return FLOW_ONLY_COLORS[color as keyof typeof FLOW_ONLY_COLORS];
  if ((TILE_COLORS as readonly string[]).includes(color) || CUSTOM.test(color)) return color as TileColor;
  throw new Error(`Unknown colour: ${color}`);
}

/**
 * The custom colour cards' text (1.4.0, a forum request): `#F00`, `#FF0000` (the `#` may be left out) or
 * `rgb(255, 0, 0)` (commas or spaces), as `#ff0000`; an empty text is `default`, so an empty tag resets the colour.
 * Colour names, alpha and hsl() aren't taken (the user's pick: hex and rgb only). Anything else throws.
 */
export function parseCustomColor(text: unknown): string {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return 'default';
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    return `#${h}`;
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)$/.exec(s);
  if (rgb) {
    const parts = rgb.slice(1).map(Number);
    if (parts.every(n => n <= 255)) return `#${parts.map(n => n.toString(16).padStart(2, '0')).join('')}`;
  }
  throw new Error(`Unknown colour: ${String(text)}`);
}

/**
 * Colours set by a Flow card, per key (a device value, a flow): a Flow can't address a widget instance, so the colour
 * belongs to what the tile shows, in every widget showing it. Kept in an app setting, so they survive restarts.
 */
export class FlowColors {

  constructor(private homey: Homey.App['homey'], private setting: string) {}

  all(): Record<string, TileColor> {
    const v = this.homey.settings.get(this.setting);
    return v && typeof v === 'object' ? v : {};
  }

  /** Sets a key's colour (null removes it); false when it had that colour already, so nothing was written. */
  set(key: string, color: TileColor | null): boolean {
    const colors = { ...this.all() };
    const had = Object.prototype.hasOwnProperty.call(colors, key) ? colors[key] : null;
    if (had === color) return false;
    if (color) colors[key] = color;
    else delete colors[key];
    this.homey.settings.set(this.setting, colors);
    return true;
  }

}
