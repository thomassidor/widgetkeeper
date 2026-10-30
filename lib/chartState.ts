import type { App } from 'homey';
import type WidgetkeeperApp from '../app.js';
import type { CalendarUnit } from './logPlan.js';
import type { SparklineSlot, WindowRequest } from './SparklineService.js';
import { parseSlot } from './ValueService.js';
import { idList, logged, logPerf } from './widgetApi.js';

type Homey = App['homey'];

const UNITS: CalendarUnit[] = ['day', 'week', 'month', 'year'];

/**
 * A chart widget's request (`charts`: comma-separated): `<deviceId>:<capabilityId>~<span>~<from>~<end>~<unit>[~use|~fine]`,
 * the window the widget works out on the phone's clock (epoch ms; `unit` its span's calendar unit, or empty for a rolling
 * one), `span` its setting for the log line, `use` for the running total (Chart · Totals), `fine` for up to 400 points
 * (Chart · Min/Max's lows and highs). The older
 * `<slot>~<span>` (a page loaded before 1.2.0) asks Sparklines' span as before.
 */
export type ChartRequest = (WindowRequest & { window: true }) | { slot: string, span?: string, window: false };

export function parseChartRequests(list: string | undefined): ChartRequest[] {
  return idList(list).map((item) => {
    const [slot, span, from, end, unit, flag] = item.split('~');
    const f = Number(from), e = Number(end);
    if (from === undefined || !Number.isFinite(f) || !Number.isFinite(e) || e < f) return { slot, span, window: false };
    return {
      slot, span, from: f, end: e, window: true,
      unit: (UNITS as string[]).includes(unit) ? unit as CalendarUnit : null,
      use: flag === 'use',
      ...(flag === 'fine' ? { fine: true } : {}),
    };
  });
}

/** Each request's slot with its history, in order (`{missing}` where there's no such device or value). */
export async function chartStates(app: WidgetkeeperApp, requests: ChartRequest[]): Promise<SparklineSlot[]> {
  const windows = requests.filter((r): r is WindowRequest & { window: true } => r.window);
  const [answered, older] = await Promise.all([
    windows.length ? app.sparklines.getWindows(windows) : [],
    Promise.all(requests.map(r => (r.window ? null : app.sparklines.getState([r.slot], r.span).then(([s]) => s)))),
  ]);
  return requests.map((r, i) => {
    const s = r.window ? answered[windows.indexOf(r)] : older[i];
    return s ?? { ...(parseSlot(r.slot) ?? { deviceId: r.slot, capabilityId: '' }), missing: true as const };
  });
}

/**
 * A chart widget's `GET /state` (its `api.ts`, `label` its name in the log): `{charts, language}`, one entry per request in
 * `charts` (Sparklines' slot state with its history, Device Values' name and value), and Homey's language (the dates'
 * and weekdays' names).
 */
export async function chartState(homey: Homey, query: Record<string, string>, label: string) {
  const app = homey.app as WidgetkeeperApp;
  logPerf(app, label, query);
  return logged(app, `${label} state failed:`, async () => ({
    language: homey.i18n.getLanguage(),
    charts: await chartStates(app, parseChartRequests(query.charts)),
  }));
}
