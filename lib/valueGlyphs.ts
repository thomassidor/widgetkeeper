import { VALUE_GLYPH_IMAGES } from './valueGlyphImages.js';

/**
 * The name of the kit's built-in glyph for a capability and its value. The same choice as the kit's `glyphFor()` (a test
 * compares them): the phone apps draw a row's `image` as a bitmap, so the rows use pre-rendered PNGs of those glyphs.
 */
export function valueGlyphName(capabilityId: string, value?: unknown): string {
  const base = capabilityId.split('.')[0];
  if (base === 'measure_temperature' || base === 'target_temperature') return 'thermometer';
  if (base === 'measure_humidity' || base === 'measure_rain') return 'drop';
  if (base === 'measure_power' || base === 'meter_power' || base === 'measure_current' || base === 'measure_voltage') return 'bolt';
  if (base === 'measure_luminance' || base === 'measure_ultraviolet') return 'sun';
  if (/^measure_(co2|co|pm\d+|voc|tvoc)$/.test(base)) return 'cloud';
  if (base === 'measure_battery' || base === 'alarm_battery') return 'battery';
  if (base.startsWith('alarm_')) return 'bell';
  if (base === 'onoff') return 'power';
  if (base === 'locked') return value ? 'locked' : 'unlocked';
  if (base === 'dim') return 'bulb';
  if (base === 'measure_noise') return 'wave';
  return 'gauge';
}

/** An autocomplete row's image for a capability (`npm run value-glyphs` renders them). */
export function valueGlyphImage(capabilityId: string, value?: unknown): string {
  return VALUE_GLYPH_IMAGES[valueGlyphName(capabilityId, value)].image;
}
