import type { App } from 'homey';
import type WidgetkeeperApp from '../app.js';
import { parseSlot, type ValueSlot } from './ValueService.js';
import { idList, logged, logPerf } from './widgetApi.js';

type Homey = App['homey'];

/** A Timeline row: Device Values' slot state with its recorded changes (`{missing}` where there's no such device or value). */
export type TimelineRow = ValueSlot | (Extract<ValueSlot, { name: string }> & { changes: [number, 0 | 1][], since: number | null });

/**
 * Chart · Timeline's `GET /state?slots=<deviceId>:<capabilityId>,…&from=<ms>`: `{rows, language}`, a row per slot in
 * order, each Device Values' state (the name, the capability and the value now, kept live through `values:state`) with
 * the boolean's changes from `from` on as the Insights Heatmap records them (`HeatmapService.getChanges()`: Insights
 * keeps only a boolean's last 50 changes). A row whose changes can't be read has none, and says since when it's known
 * as null; a gone device or value is `{missing}`.
 */
export async function timelineState(homey: Homey, query: Record<string, string>) {
  const app = homey.app as WidgetkeeperApp;
  logPerf(app, 'Timeline', query);
  return logged(app, 'Timeline state failed:', async () => {
    const slots = idList(query.slots).filter(s => parseSlot(s));
    const from = Number(query.from);
    const start = Number.isFinite(from) ? from : Date.now() - 24 * 3600e3;
    const [states, changes] = await Promise.all([
      app.values.getState(slots),
      Promise.all(slots.map((s) => {
        const { deviceId, capabilityId } = parseSlot(s)!;
        return app.heatmap.getChanges(deviceId, capabilityId, start).catch((err: unknown) => {
          app.log(`Timeline: no changes of ${capabilityId} of ${deviceId}:`, err);
          return null;
        });
      })),
    ]);
    const rows: TimelineRow[] = states.map((s, i) => ('missing' in s ? s : { ...s, ...(changes[i] ?? { changes: [], since: null }) }));
    return { language: homey.i18n.getLanguage(), rows };
  });
}
