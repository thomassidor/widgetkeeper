import type Homey from 'homey';

/** A capability as most widgets read it: its value and whether the widget may set it. */
export type CapState = { value: unknown, setable: boolean };

/** An enum's values with their titles (a value without a title is named by its id). */
export type CapValues = { id: string, title: string }[];

export type CapabilityDescription = {
  title: string,
  type: string,
  units: string | null,
  decimals: number | null,
  /** A number's range, when the capability has one (`dim` is 0–1 with `%` units). */
  min: number | null,
  max: number | null,
  /** An enum's values with their titles. */
  values: CapValues | null,
};

/** A capability's `values` list, normalised, or null when it has none. */
export function capabilityValues(cap: any): CapValues | null {
  return Array.isArray(cap?.values)
    ? cap.values.map((v: any) => ({ id: String(v.id), title: typeof v.title === 'string' && v.title ? v.title : String(v.id) }))
    : null;
}

/** A capability's `capabilitiesObj` entry, normalised. An empty title or units count as none (the title falls back to the id). */
export function describeCapability(cap: any, id: string): CapabilityDescription {
  return {
    title: typeof cap?.title === 'string' && cap.title ? cap.title : id,
    type: cap?.type,
    units: typeof cap?.units === 'string' && cap.units ? cap.units : null,
    decimals: typeof cap?.decimals === 'number' ? cap.decimals : null,
    min: typeof cap?.min === 'number' ? cap.min : null,
    max: typeof cap?.max === 'number' ? cap.max : null,
    values: cap?.type === 'enum' ? capabilityValues(cap) : null,
  };
}

/**
 * A capability's value for an autocomplete row's description, as the kit's `formatValue()` shows it on a tile but in
 * Homey's language (the tiles use the device's); null without a value worth showing (none, or a long text).
 */
export function capabilityReading(homey: Homey.App['homey'], cap: CapabilityDescription, value: unknown): string | null {
  if (typeof value === 'boolean') return homey.__(`values.${value ? 'on' : 'off'}`) || (value ? 'On' : 'Off');
  if (typeof value === 'number' && Number.isFinite(value)) {
    const percent = cap.units === '%' && cap.max === 1 && (cap.min == null || cap.min === 0);
    const v = percent ? value * 100 : value;
    const digits = percent ? 0 : cap.decimals != null ? Math.max(0, Math.min(cap.decimals, 4)) : 1;
    let language: string | undefined;
    try { language = homey.i18n.getLanguage(); } catch { /* the default */ }
    const text = new Intl.NumberFormat(language, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(v);
    if (!cap.units) return text;
    return /^(°|%)/.test(cap.units) ? `${text}${cap.units}` : `${text} ${cap.units}`;
  }
  if (value == null || value === '') return null;
  const text = (cap.values ?? []).find(v => v.id === String(value))?.title ?? String(value);
  return text.length <= 24 ? text : null;
}

/** The capabilities of `ids` the device has, in that order. */
export function presentCaps<T extends string>(device: any, ids: readonly T[]): T[] {
  const caps = device?.capabilitiesObj || {};
  return ids.filter(id => caps[id]);
}

/** The value and settability of each of `ids` the device has. */
export function readCaps(device: any, ids: readonly string[]): Record<string, CapState> {
  const out: Record<string, CapState> = {};
  for (const id of presentCaps(device, ids)) {
    const c = device.capabilitiesObj[id];
    out[id] = { value: c.value ?? null, setable: c.setable !== false };
  }
  return out;
}

/** A copy of an entry's tracked capabilities, for one `/state` answer: the tracker keeps changing its own. */
export function copyCaps<T extends Record<string, object | undefined>>(caps: T): T {
  return Object.fromEntries(Object.entries(caps).map(([k, c]) => [k, { ...c }])) as T;
}

/** Tracked capabilities' values as JSON, for the debug line saying what's tracked. */
export function capValuesText(caps: Record<string, { value: unknown } | undefined>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(caps).map(([k, c]) => [k, c?.value])));
}
