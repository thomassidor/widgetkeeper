import { localHour, zoneParts } from './heatmap.js';
import { HOUR, MINUTE, type Sample } from './series.js';

const DAY = 24 * HOUR;

/** A calendar unit in the Homey's time zone (weeks from Monday, as Homey's). */
export type CalendarUnit = 'day' | 'week' | 'month' | 'year';

/**
 * Every Insights log a chart's window can be read from: its resolution, its step (the bucket length `downsample()`
 * keeps to: the log's own, or for `thisWeek` an hour, as Sparklines always had it) and the window it holds at `now`.
 * A rolling log ends now; a calendar one (`unit`) holds this day, week, month or year up to now, or a finished one.
 * Verified on the Homey (read-only, 2026-10-06 … 2026-10-27): `last3Months` ends at this month's start and
 * `last2Years` (weekly) at this year's; months and years are 6-hour averages.
 */
export const INSIGHTS_LOGS: { resolution: string, step: number, unit?: CalendarUnit, back?: number, span?: number, length?: number }[] = [
  { resolution: 'lastHour', step: 5 * 1000, span: HOUR },
  { resolution: 'last6Hours', step: MINUTE, span: 6 * HOUR },
  { resolution: 'last24Hours', step: 5 * MINUTE, span: DAY },
  { resolution: 'last3Days', step: HOUR, span: 3 * DAY },
  { resolution: 'last7Days', step: HOUR, span: 7 * DAY },
  { resolution: 'last31Days', step: 6 * HOUR, span: 31 * DAY },
  { resolution: 'today', step: 5 * MINUTE, unit: 'day', back: 0 },
  { resolution: 'yesterday', step: 5 * MINUTE, unit: 'day', back: 1 },
  { resolution: 'thisWeek', step: HOUR, unit: 'week', back: 0 },
  { resolution: 'lastWeek', step: HOUR, unit: 'week', back: 1 },
  { resolution: 'thisMonth', step: 6 * HOUR, unit: 'month', back: 0 },
  { resolution: 'lastMonth', step: 6 * HOUR, unit: 'month', back: 1 },
  { resolution: 'last3Months', step: 6 * HOUR, unit: 'month', back: 3, length: 3 },
  { resolution: 'thisYear', step: 6 * HOUR, unit: 'year', back: 0 },
  { resolution: 'lastYear', step: 6 * HOUR, unit: 'year', back: 1 },
  { resolution: 'last2Years', step: 7 * DAY, unit: 'year', back: 2, length: 2 },
];
export type InsightsLog = typeof INSIGHTS_LOGS[number];

/** How far apart a window's edge and a log's may be and still meet (the phone's clock against the Homey's). */
const SLACK = 2 * MINUTE;

/** The offset of `timeZone` from UTC at `t`, in ms (local = UTC + offset). */
function zoneOffset(t: number, timeZone: string): number {
  const parts = zoneParts(t, timeZone);
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** The epoch ms of local midnight on `y-m-d` (month 0-based, any overflow carried) in `timeZone`. */
function localMidnight(y: number, m: number, d: number, timeZone: string): number {
  const guess = Date.UTC(y, m, d);
  const first = guess - zoneOffset(guess, timeZone);
  return guess - zoneOffset(first, timeZone);
}

/** The local start of the `unit` holding `at` in `timeZone`, moved by `n` units (−1: the one before). */
export function periodStart(at: number, unit: CalendarUnit, n: number, timeZone: string): number {
  const [y, m, d] = localHour(at, timeZone).date.split('-').map(Number);
  if (unit === 'day') return localMidnight(y, m - 1, d + n, timeZone);
  if (unit === 'week') return localMidnight(y, m - 1, d - (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 + 7 * n, timeZone);
  if (unit === 'month') return localMidnight(y, m - 1 + n, 1, timeZone);
  return localMidnight(y + n, 0, 1, timeZone);
}

/** The window a log holds at `now`: `[from, to]`, `to` now for this period's and the rolling ones. */
export function logCover(log: InsightsLog, now: number, timeZone: string): [number, number] {
  if (!log.unit) return [now - log.span!, now];
  const back = log.back ?? 0;
  const from = periodStart(now, log.unit, -back, timeZone);
  return [from, back ? periodStart(now, log.unit, -back + (log.length ?? 1), timeZone) : now];
}

/**
 * The Insights logs to read for a chart's window `[from, end]` at `now`. A calendar window (`unit`: today, this week,
 * the last three months …) reads its own unit's logs (`today`, `thisWeek`, `lastMonth` with `thisMonth` …), a rolling one
 * the rolling logs; when those can't hold it, the others too (the day before yesterday from `last3Days`, a rolling half
 * year from `lastYear` with `thisYear`). Of the sets of at most three that hold it: the finest coarsest step, then the
 * fewest logs, then the least read beyond the window. So every span reads what Sparklines read for it (24 h
 * `last24Hours`, today `today`, this week `thisWeek`, 7 days `last7Days`, the month before last `last3Months`). A window
 * older than any log gets the set reaching furthest back.
 */
export function planLogs(from: number, end: number, now: number, timeZone: string, unit: CalendarUnit | null = null): InsightsLog[] {
  const all = INSIGHTS_LOGS
    .map(l => ({ log: l, cover: logCover(l, now, timeZone) }))
    .filter(c => c.cover[1] > from - SLACK && c.cover[0] < end + SLACK);
  type Cover = typeof all[number];
  const holds = (set: Cover[]) => {
    // Walk from `from`: each stretch must start inside some log.
    let at = from;
    for (let moved = true; moved && at < end - SLACK;) {
      moved = false;
      for (const c of set) {
        if (c.cover[0] <= at + SLACK && c.cover[1] > at + SLACK) { at = c.cover[1]; moved = true; }
      }
    }
    return at >= end - SLACK;
  };
  const setsOf = (list: Cover[]) => {
    const sets: Cover[][] = [];
    for (let i = 0; i < list.length; i++) {
      sets.push([list[i]]);
      for (let j = i + 1; j < list.length; j++) {
        sets.push([list[i], list[j]]);
        for (let k = j + 1; k < list.length; k++) sets.push([list[i], list[j], list[k]]);
      }
    }
    return sets;
  };
  const coarsest = (s: Cover[]) => Math.max(...s.map(c => c.log.step));
  const read = (s: Cover[]) => s.reduce((a, c) => a + (c.cover[1] - c.cover[0]), 0);
  const own = all.filter(c => (unit ? c.log.unit === unit : !c.log.unit));
  const tiers = unit ? [own, all.filter(c => c.log.unit === unit || !c.log.unit), all] : [own, all];
  for (const tier of tiers) {
    const holding = setsOf(tier).filter(holds);
    if (holding.length) {
      holding.sort((a, b) => coarsest(a) - coarsest(b) || a.length - b.length || read(a) - read(b));
      return holding[0].map(c => c.log);
    }
  }
  // Nothing holds it all (it starts before the oldest log, two years back): what there is, from the oldest log's start.
  const oldest = Math.min(...INSIGHTS_LOGS.map(l => logCover(l, now, timeZone)[0]));
  return from < oldest && end > oldest ? planLogs(oldest, end, now, timeZone, unit) : [];
}

/**
 * The samples of several logs as one series, oldest first: where logs overlap, the finer one's (each log holds its
 * samples' stretch, from its first to a step past its last). Each sample keeps its log's step.
 */
export function mergeLogs(logs: { samples: Sample[], step: number }[]): (Sample & { step: number })[] {
  const taken: [number, number][] = [];
  const out: (Sample & { step: number })[] = [];
  for (const { samples, step } of [...logs].sort((a, b) => a.step - b.step)) {
    if (!samples.length) continue;
    const free = samples.filter(s => !taken.some(([a, b]) => s.t >= a && s.t < b));
    out.push(...free.map(s => ({ ...s, step })));
    taken.push([samples[0].t, samples[samples.length - 1].t + step]);
  }
  return out.sort((a, b) => a.t - b.t);
}
