import type { App } from 'homey';
import type WidgetkeeperApp from '../app.js';
import type { CalendarUnit } from './logPlan.js';
import { parseSlot, type ValueSlot } from './ValueService.js';
import { idList, logged, logPerf } from './widgetApi.js';

type Homey = App['homey'];

const UNITS: CalendarUnit[] = ['day', 'week', 'month', 'year'];

type Shown = Extract<ValueSlot, { name: string }>;

/**
 * A Timeline row: Device Values' slot state with its recorded changes (a boolean), or its Insights points over the window
 * (a number, which the widget holds against its threshold); `{missing}` where there's no such device or value.
 */
export type TimelineRow = ValueSlot
  | (Shown & { changes: [number, 0 | 1][], since: number | null })
  | (Shown & { points: [number, number][] });

/**
 * Chart · Timeline's `GET /state?slots=<deviceId>:<capabilityId>,…&from=<ms>[&end=<ms>&unit=<calendar unit>&span=]`:
 * `{rows, language}`, a row per slot in order, each Device Values' state (the name, the capability and the value now, kept
 * live through `values:state`) with, for a boolean, its changes from `from` on as the Insights Heatmap records them
 * (`HeatmapService.getChanges()`: Insights keeps only a boolean's last 50 changes), and for a number its points over
 * `[from, end]` from Insights (Sparklines' `getWindows()`, `fine`: up to 400). A boolean whose changes can't be read has
 * none, and says since when it's known as null; a gone device or value is `{missing}`. A page from before numbers sends
 * no `end`: its window ends now.
 */
export async function timelineState(homey: Homey, query: Record<string, string>) {
  const app = homey.app as WidgetkeeperApp;
  logPerf(app, 'Timeline', query);
  return logged(app, 'Timeline state failed:', async () => {
    const slots = idList(query.slots).filter(s => parseSlot(s));
    const from = Number(query.from);
    const start = Number.isFinite(from) ? from : Date.now() - 24 * 3600e3;
    const end = Number(query.end);
    const stop = Number.isFinite(end) && end >= start ? end : Date.now();
    const unit = (UNITS as string[]).includes(query.unit) ? query.unit as CalendarUnit : null;
    const states = await app.values.getState(slots);
    const numbers = states.map((s, i) => ('missing' in s || s.capability.type !== 'number' ? null : slots[i]));
    const wanted = numbers.filter((s): s is string => s != null);
    const [windows, changes] = await Promise.all([
      wanted.length
        ? app.sparklines.getWindows(wanted.map(slot => ({ slot, from: start, end: stop, unit, fine: true, span: query.span })))
        : [],
      Promise.all(states.map((s, i) => {
        if ('missing' in s || numbers[i] != null) return null;
        return app.heatmap.getChanges(s.deviceId, s.capabilityId, start).catch((err: unknown) => {
          app.log(`Timeline: no changes of ${s.capabilityId} of ${s.deviceId}:`, err);
          return null;
        });
      })),
    ]);
    const rows: TimelineRow[] = states.map((s, i) => {
      if ('missing' in s) return s;
      if (numbers[i] != null) {
        const w = windows[wanted.indexOf(numbers[i]!)];
        return { ...s, points: w && 'points' in w ? w.points : [] };
      }
      return { ...s, ...(changes[i] ?? { changes: [], since: null }) };
    });
    return { language: homey.i18n.getLanguage(), rows };
  });
}
