/**
 * Charts' and Sparklines' time spans before 1.2.0, as the time span block's fields (`count`, the `span` unit,
 * `leaveOut`). A Homey widget keeps its old value until the unit is picked (the kit's `spanSetting()`), but a web
 * dashboard's settings are checked against the manifest, which no longer lists these, so they're turned over first.
 */
const whole = (span: string, leaveOut = false) => ({ count: 1, span, leaveOut });
const rolling = (count: number, span: string) => ({ count, span, leaveOut: false });

export const OLD_SPANS: ReadonlyMap<unknown, { count: number, span: string, leaveOut: boolean }> = new Map(Object.entries({
  '1h': rolling(1, 'hours'),
  '6h': rolling(6, 'hours'),
  '24h': rolling(24, 'hours'),
  '2d': rolling(2, 'days'),
  '3d': rolling(3, 'days'),
  '5d': rolling(5, 'days'),
  '7d': rolling(7, 'days'),
  today: whole('calDays'),
  yesterday: whole('calDays', true),
  thisWeek: whole('calWeeks'),
  lastWeek: whole('calWeeks', true),
  thisMonth: whole('calMonths'),
  lastMonth: whole('calMonths', true),
  thisYear: whole('calYears'),
  lastYear: whole('calYears', true),
}));

/** `settings` with every old value of the manifest's time span settings (`span`, `span1` …) turned over. */
export function withOldSpans(settingDefs: any[], settings: Record<string, unknown>): Record<string, unknown> {
  const out = { ...settings };
  for (const def of settingDefs) {
    const n = /^span(\d*)$/.exec(def.id)?.[1];
    const old = n === undefined ? undefined : OLD_SPANS.get(out[def.id]);
    if (!old || !(def.values ?? []).some((v: any) => v.id === 'calDays')) continue;
    out[def.id] = old.span;
    out[`count${n}`] = old.count;
    out[`leaveOut${n}`] = old.leaveOut;
  }
  return out;
}
