import type { App } from 'homey';
import type WidgetkeeperApp from '../../app.js';
import { keyResult, logPerf } from '../../lib/widgetApi.js';
import { callWidgetRoute, type WidgetApis } from '../../lib/widgetRoutes.js';
import electricity from '../electricity/api.js';
import thermostat from '../thermostat/api.js';
import quickactions from '../quickactions/api.js';
import sensoralarms from '../sensoralarms/api.js';
import sensordots from '../sensordots/api.js';
import roomhealth from '../roomhealth/api.js';
import valuematrix from '../valuematrix/api.js';
import weather from '../weather/api.js';
import pollen from '../pollen/api.js';
import heatmap from '../heatmap/api.js';
import cameras from '../cameras/api.js';
import values from '../values/api.js';
import combined from '../combined/api.js';
import groupaction from '../groupaction/api.js';
import flowtiles from '../flowtiles/api.js';
import lights from '../lights/api.js';
import sparklines from '../sparklines/api.js';
import charts from '../charts/api.js';
import totals from '../totals/api.js';
import scatter from '../scatter/api.js';
import typicalday from '../typicalday/api.js';
import dailyrange from '../dailyrange/api.js';
import compare from '../compare/api.js';
import timeline from '../timeline/api.js';
import stacked from '../stacked/api.js';
import lines from '../lines/api.js';
import gauge from '../gauge/api.js';
import variables from '../variables/api.js';
import varpresets from '../varpresets/api.js';
import flows from '../flows/api.js';
import price from '../price/api.js';
import timers from '../timers/api.js';
import locks from '../locks/api.js';
import curtains from '../curtains/api.js';
import media from '../media/api.js';
import clock from '../clock/api.js';
import textline from '../textline/api.js';
import dayssince from '../dayssince/api.js';
import type { StackType } from '../../lib/StackService.js';
import { tileShadowOf } from '../../lib/tileShadow.js';

type Homey = App['homey'];

/** Each page widget's own API (its `api.ts`), by widget id: one for every `STACK_TYPES` (tsc checks). */
export const PAGE_APIS: Record<StackType, WidgetApis[string]> = {
  electricity, thermostat, quickactions, groupaction, sensoralarms, sensordots, roomhealth, valuematrix, weather, pollen, heatmap, cameras, values, combined, flowtiles,
  lights, sparklines, charts, totals, scatter, typicalday, dailyrange, compare, timeline, stacked, lines, gauge, variables, varpresets, flows, price, timers, locks, curtains, media, clock, textline, dayssince,
};

/** A widget's name from the manifest, in `language` (English otherwise), or null. */
export function widgetName(homey: Homey, type: string, language: string): string | null {
  const name = (homey.manifest as any)?.widgets?.[type]?.name;
  return (name && (name[language] || name.en)) || null;
}

export default {
  /**
   * `dashboardId`: that dashboard's pages (this app's widgets on it) and the Flow requests running. Without a
   * usable API key it answers `{ok: false, reason}` (`noKey`, `keyScope`, `keyInvalid`), so the widget can say what to do.
   */
  async getPages({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Smart stack', query);
    const language = homey.i18n.getLanguage();
    const result = await keyResult(app, 'Smart stack pages failed', () => app.stack.getPages(query.dashboardId || ''));
    // Each page's widget name in the Homey's language: a tab's name when the widget has no title on its dashboard.
    const named = result.ok ? { ...result, pages: result.pages.map(page => ({ ...page, name: widgetName(homey, page.type, language) })) } : result;
    return { ...named, language, tileShadow: tileShadowOf(homey) };
  },

  /**
   * `{type, method, path, query, body}`: a page's own request (`Homey.api(method, path, body)` in its widget),
   * handed to that widget's API as if it came from its own frame. `PAGE_APIS` has no `stack`, so a stack's own
   * routes can't be reached from a page.
   */
  async call({ homey, body }: {
    homey: Homey,
    body: { type?: unknown, method?: unknown, path?: unknown, query?: unknown, body?: unknown },
  }) {
    return callWidgetRoute(homey, PAGE_APIS, String(body?.type ?? ''), String(body?.method ?? ''), String(body?.path ?? ''), body?.query, body?.body);
  },
};
