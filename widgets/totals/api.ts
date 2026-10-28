import type { App } from 'homey';
import type WidgetkeeperApp from '../../app.js';
import { logged, logPerf } from '../../lib/widgetApi.js';
import { parseSlot } from '../../lib/ValueService.js';

type Homey = App['homey'];

/** The periods the widget offers: Sparklines' calendar spans (`SPANS` in lib/SparklineService.ts). */
const PERIODS = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear'];

export default {
  /**
   * `slot`: `<deviceId>:<capabilityId>`; `period`: today … lastYear (else this week); `compare=1` adds the period before.
   * `{current, previous?, language}`: Sparklines' slot state with the value's running total (`use`) over the period,
   * and over the one before; Homey's language (the weekday and month names).
   */
  async getState({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Totals per Period', query);
    return logged(app, 'Totals per Period state failed:', async () => {
      const slot = String(query.slot ?? '');
      const period = PERIODS.includes(query.period) ? query.period : 'thisWeek';
      const missing = { ...(parseSlot(slot) ?? { deviceId: slot, capabilityId: '' }), missing: true as const };
      const [[current], previous] = await Promise.all([
        app.sparklines.getState([slot], period, { use: true }),
        query.compare === '1' ? app.sparklines.getState([slot], period, { use: true, prev: true }) : null,
      ]);
      return {
        language: homey.i18n.getLanguage(),
        current: current ?? missing,
        ...(previous ? { previous: previous[0] ?? missing } : {}),
      };
    });
  },
};
