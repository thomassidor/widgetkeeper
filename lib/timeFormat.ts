import type Homey from 'homey';

/**
 * The app setting: whether the widgets show times in 24 or 12 hours, or as the screen's language does (`auto`). Set on
 * the app settings page's Time format card (1.3.0, the user's ask, 2026-11-04: one setting for the app, none per widget;
 * it replaced the `timeFormat` setting of Cameras, Clock, Locks and Doors, Pollen and UV and Activity Dots).
 */
export const TIME_FORMAT_SETTING = 'timeFormat';
/** Sent with `{timeFormat}` when it changes, so open widgets draw their times again. */
export const TIME_FORMAT_EVENT = 'timeformat:state';

const TIME_FORMATS = ['auto', '24', '12'] as const;
export type TimeFormat = typeof TIME_FORMATS[number];

function isTimeFormat(v: unknown): v is TimeFormat {
  return TIME_FORMATS.includes(v as TimeFormat);
}

/** The stored setting: `auto` when it's missing or broken. */
export function timeFormatOf(homey: Homey.App['homey']): TimeFormat {
  const v = homey.settings.get(TIME_FORMAT_SETTING);
  return isTimeFormat(v) ? v : 'auto';
}

/** The settings page's change: `{ok: true, timeFormat}`, or `{ok: false}` for a value that isn't one. */
export function setTimeFormat(homey: Homey.App['homey'], body: { timeFormat?: unknown } | null | undefined) {
  const next = body?.timeFormat;
  if (!isTimeFormat(next)) return { ok: false as const };
  const before = timeFormatOf(homey);
  homey.settings.set(TIME_FORMAT_SETTING, next);
  if (next !== before) homey.api.realtime(TIME_FORMAT_EVENT, { timeFormat: next });
  return { ok: true as const, timeFormat: next };
}

/**
 * The widget route every widget that shows a time spreads into its `api.ts` (and declares in its manifest), for the
 * kit's `wireTimeFormat()`: `GET /time-format` → `{timeFormat}`.
 */
export const timeFormatRoutes = {
  async getTimeFormat({ homey }: { homey: Homey.App['homey'] }) {
    return { timeFormat: timeFormatOf(homey) };
  },
};
