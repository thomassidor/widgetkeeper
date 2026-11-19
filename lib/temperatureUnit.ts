import type Homey from 'homey';

/**
 * The app setting: the unit the widgets show temperatures in, `c` or `f`, or as the Homey's units are (`auto`, the
 * default: Fahrenheit when `homey.i18n.getUnits()` is `imperial`). Set on the app settings page's Temperature card
 * (1.3.2, the user's ask after a forum request, 2026-11-19: one setting for the app, none per widget).
 *
 * Homey reports temperatures in °C (some apps in °F). The app turns every temperature it sends a widget into the shown
 * unit where the answer is built, as with device names (`lib/deviceNames.ts`): the value, its units, a range's ends and
 * a chart's points, and the realtime changes. So a threshold or range typed in a widget's settings is in the shown unit,
 * as the values it's compared with. Thermostat Presets and Weather Forecast are the exceptions: their answers keep
 * Homey's °C (a preset holds the device's own value) and say the unit (`temperatureUnit`), which their front ends show.
 */
export const TEMPERATURE_UNIT_SETTING = 'temperatureUnit';
/** Sent with `{temperatureUnit}` when the shown unit may have changed, so open widgets read again. */
export const TEMPERATURE_UNIT_EVENT = 'temperatureunit:state';

const TEMPERATURE_UNITS = ['auto', 'c', 'f'] as const;
export type TemperatureUnit = typeof TEMPERATURE_UNITS[number];
/** A temperature scale: Celsius or Fahrenheit. */
export type TemperatureScale = 'c' | 'f';

function isTemperatureUnit(v: unknown): v is TemperatureUnit {
  return TEMPERATURE_UNITS.includes(v as TemperatureUnit);
}

/** The stored setting: `auto` when it's missing or broken. */
export function temperatureUnitOf(homey: Homey.App['homey']): TemperatureUnit {
  const v = homey.settings.get(TEMPERATURE_UNIT_SETTING);
  return isTemperatureUnit(v) ? v : 'auto';
}

/** The Homey's own units (Homey's Settings → Location): `f` for imperial, else `c` (also when it can't be read). */
export function homeyTemperatureScale(homey: Homey.App['homey']): TemperatureScale {
  try {
    return homey.i18n.getUnits() === 'imperial' ? 'f' : 'c';
  } catch {
    return 'c';
  }
}

/** The scale the widgets show: the setting's, or the Homey's under `auto`. */
export function shownTemperatureScale(homey: Homey.App['homey']): TemperatureScale {
  const unit = temperatureUnitOf(homey);
  return unit === 'auto' ? homeyTemperatureScale(homey) : unit;
}

/** The settings page's change: `{ok: true, temperatureUnit, shown}`, or `{ok: false}` for a value that isn't one. */
export function setTemperatureUnit(homey: Homey.App['homey'], body: { temperatureUnit?: unknown } | null | undefined) {
  const next = body?.temperatureUnit;
  if (!isTemperatureUnit(next)) return { ok: false as const };
  // The set is what tells open widgets (`watchTemperatureUnit()`), so only a change is stored.
  if (next !== temperatureUnitOf(homey)) homey.settings.set(TEMPERATURE_UNIT_SETTING, next);
  return { ok: true as const, temperatureUnit: next, shown: shownTemperatureScale(homey) };
}

/** The scale a capability's units name, or null for units that aren't a temperature's (`°C`, `℃`, `C`, `Celsius`; the same for F). */
export function temperatureScaleOf(units: unknown): TemperatureScale | null {
  if (typeof units !== 'string') return null;
  const u = units.trim();
  if (/^(°\s*C|℃|C|celsius)$/i.test(u)) return 'c';
  if (/^(°\s*F|℉|F|fahrenheit)$/i.test(u)) return 'f';
  return null;
}

/** The units the widgets write for a scale. */
export const SCALE_UNITS: Record<TemperatureScale, string> = { c: '°C', f: '°F' };

/** A temperature from one scale in another. */
export function convertTemperature(value: number, from: TemperatureScale, to: TemperatureScale): number {
  if (from === to) return value;
  return to === 'f' ? value * 9 / 5 + 32 : (value - 32) * 5 / 9;
}

/** A temperature difference (a step, a margin) from one scale in another: no offset. */
export function convertTemperatureStep(value: number, from: TemperatureScale, to: TemperatureScale): number {
  if (from === to) return value;
  return to === 'f' ? value * 9 / 5 : value * 5 / 9;
}

/** Rounded to 3 decimals, so a conversion doesn't show as 69.80000000000001 in an answer. */
const tidy = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The shown scale for one answer (the setting read once), with what turns a capability's description and values into it.
 * Anything whose units aren't a temperature's, or already in the shown scale, comes back as it was.
 */
export type TemperatureShower = {
  scale: TemperatureScale,
  /** Whether `units` are a temperature in another scale than the shown one. */
  converts(units: unknown): boolean,
  /** A value in `units`, in the shown scale (a non-number as it was). */
  value<V>(units: unknown, value: V): V,
  /** A description (`units`, and `min`/`max` where it has them) in the shown scale: the shown units, the ends converted. */
  cap<C extends { units?: string | null, min?: number | null, max?: number | null }>(cap: C): C,
  /** `[time, value]` points in `units`, in the shown scale. */
  points<P extends [number, number][] | undefined>(units: unknown, points: P): P,
};

export function temperatureShower(homey: Homey.App['homey']): TemperatureShower {
  return showerFor(shownTemperatureScale(homey));
}

export function showerFor(scale: TemperatureScale): TemperatureShower {
  const fromOf = (units: unknown) => {
    const from = temperatureScaleOf(units);
    return from && from !== scale ? from : null;
  };
  const one = (from: TemperatureScale, v: number) => tidy(convertTemperature(v, from, scale));
  return {
    scale,
    converts: units => fromOf(units) !== null,
    value(units, value) {
      const from = fromOf(units);
      return from && typeof value === 'number' && Number.isFinite(value) ? one(from, value) as typeof value : value;
    },
    cap(cap) {
      const from = fromOf(cap.units);
      if (!from) return cap;
      const out = { ...cap, units: SCALE_UNITS[scale] };
      if (typeof cap.min === 'number') out.min = one(from, cap.min);
      if (typeof cap.max === 'number') out.max = one(from, cap.max);
      return out;
    },
    points(units, points) {
      const from = fromOf(units);
      if (!from || !points) return points;
      return points.map(([t, v]) => [t, one(from, v)]) as typeof points;
    },
  };
}

/**
 * Watches the setting: any set or unset (the settings page, or Homey's own API) sends `temperatureunit:state` with the
 * shown scale, so open widgets read again.
 */
export function watchTemperatureUnit(homey: Homey.App['homey']): void {
  const changed = (key: string) => {
    if (key !== TEMPERATURE_UNIT_SETTING) return;
    Promise.resolve(homey.api.realtime(TEMPERATURE_UNIT_EVENT, { temperatureUnit: shownTemperatureScale(homey) })).catch(() => { /* no widget open */ });
  };
  homey.settings.on('set', changed);
  homey.settings.on('unset', changed);
}
