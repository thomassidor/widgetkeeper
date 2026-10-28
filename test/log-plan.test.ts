/* Which Insights logs a chart's window is read from (lib/logPlan.ts). The tests run in Europe/Copenhagen. */
import { describe, expect, it } from 'vitest';
import { logCover, mergeLogs, periodStart, planLogs, INSIGHTS_LOGS } from '../lib/logPlan.js';

const TZ = 'Europe/Copenhagen';
const at = (iso: string) => new Date(iso).getTime();
const H = 36e5, D = 24 * H;
// Wednesday 28 October 2026, 15:00, three days after the clocks went back.
const now = at('2026-10-28T15:00');
const plan = (from: number, end: number, unit: any = null) => planLogs(from, end, now, TZ, unit).map(l => l.resolution);

describe('periodStart', () => {
  it('finds local days, Monday weeks, months and years, across DST', () => {
    expect(periodStart(now, 'day', 0, TZ)).toBe(at('2026-10-28T00:00'));
    expect(periodStart(now, 'day', -3, TZ)).toBe(at('2026-10-25T00:00'));
    expect(at('2026-10-26T00:00') - at('2026-10-25T00:00')).toBe(25 * H); // the long day
    expect(periodStart(now, 'week', 0, TZ)).toBe(at('2026-10-26T00:00'));
    expect(periodStart(now, 'week', -1, TZ)).toBe(at('2026-10-19T00:00'));
    expect(periodStart(now, 'month', -1, TZ)).toBe(at('2026-09-01T00:00'));
    expect(periodStart(now, 'year', -2, TZ)).toBe(at('2024-01-01T00:00'));
    // In another zone the day starts at its own midnight.
    expect(periodStart(now, 'day', 0, 'America/New_York')).toBe(Date.UTC(2026, 9, 28, 4));
  });

  it('knows the window each log holds', () => {
    const cover = (r: string) => logCover(INSIGHTS_LOGS.find(l => l.resolution === r)!, now, TZ);
    expect(cover('last24Hours')).toEqual([now - D, now]);
    expect(cover('yesterday')).toEqual([at('2026-10-27T00:00'), at('2026-10-28T00:00')]);
    expect(cover('last3Months')).toEqual([at('2026-07-01T00:00'), at('2026-10-01T00:00')]);
    expect(cover('last2Years')).toEqual([at('2024-01-01T00:00'), at('2026-01-01T00:00')]);
  });
});

describe('planLogs', () => {
  it('reads what Sparklines read for each rolling span', () => {
    expect(plan(now - H, now)).toEqual(['lastHour']);
    expect(plan(now - 6 * H, now)).toEqual(['last6Hours']);
    expect(plan(now - D, now)).toEqual(['last24Hours']);
    expect(plan(now - 2 * D, now)).toEqual(['last3Days']);
    expect(plan(now - 3 * D, now)).toEqual(['last3Days']);
    expect(plan(now - 5 * D, now)).toEqual(['last7Days']);
    expect(plan(now - 7 * D, now)).toEqual(['last7Days']);
  });

  it('reads a calendar period from its own log', () => {
    expect(plan(at('2026-10-28T00:00'), now, 'day')).toEqual(['today']);
    expect(plan(at('2026-10-27T00:00'), at('2026-10-28T00:00'), 'day')).toEqual(['yesterday']);
    expect(plan(at('2026-10-26T00:00'), now, 'week')).toEqual(['thisWeek']);
    expect(plan(at('2026-10-19T00:00'), at('2026-10-26T00:00'), 'week')).toEqual(['lastWeek']);
    expect(plan(at('2026-10-01T00:00'), now, 'month')).toEqual(['thisMonth']);
    expect(plan(at('2026-09-01T00:00'), at('2026-10-01T00:00'), 'month')).toEqual(['lastMonth']);
    expect(plan(at('2026-01-01T00:00'), now, 'year')).toEqual(['thisYear']);
    expect(plan(at('2025-01-01T00:00'), at('2026-01-01T00:00'), 'year')).toEqual(['lastYear']);
  });

  it('reads the period before as Totals per Period did (the logs reaching past it)', () => {
    expect(plan(at('2026-10-26T00:00'), at('2026-10-27T00:00'), 'day')).toEqual(['last3Days']);
    expect(plan(at('2026-10-12T00:00'), at('2026-10-19T00:00'), 'week')).toEqual(['last31Days']);
    expect(plan(at('2026-08-01T00:00'), at('2026-09-01T00:00'), 'month')).toEqual(['last3Months']);
    expect(plan(at('2024-01-01T00:00'), at('2025-01-01T00:00'), 'year')).toEqual(['last2Years']);
  });

  it('stitches logs for any other span', () => {
    expect(plan(at('2026-10-27T00:00'), now, 'day')).toEqual(['today', 'yesterday']); // two days from midnight
    expect(plan(at('2026-10-19T00:00'), now, 'week')).toEqual(['thisWeek', 'lastWeek']);
    expect(plan(at('2026-08-01T00:00'), now, 'month')).toEqual(['thisMonth', 'last3Months']);
    expect(plan(now - 40 * 6e4, now)).toEqual(['lastHour']);
    expect(plan(now - 10 * D, now)).toEqual(['last31Days']);
    // One log rather than two where one holds it (each is a request to Homey): this year's for 60 or 180 days in October.
    expect(plan(now - 60 * D, now)).toEqual(['thisYear']);
    expect(plan(now - 330 * D, now)).toEqual(['thisYear', 'lastYear']);
    // Two years back: weekly. Further, what there is.
    expect(plan(now - 2 * 365 * D, now)).toEqual(['thisYear', 'last2Years']);
    expect(plan(now - 3 * 365 * D, now)).toEqual(['thisYear', 'last2Years']);
  });
});

describe('mergeLogs', () => {
  it("keeps the finer log's samples where two overlap", () => {
    const fine = { samples: [{ t: 10, w: 1 }, { t: 15, w: 2 }], step: 5 };
    const coarse = { samples: [{ t: 0, w: 9 }, { t: 10, w: 9 }, { t: 20, w: 3 }], step: 10 };
    expect(mergeLogs([coarse, fine])).toEqual([{ t: 0, w: 9, step: 10 }, { t: 10, w: 1, step: 5 }, { t: 15, w: 2, step: 5 }, { t: 20, w: 3, step: 10 }]);
  });
});
