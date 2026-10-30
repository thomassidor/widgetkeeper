import type Homey from 'homey';
import { getAppApi } from './appApi.js';
import { listCapabilitySlots, type AutocompleteItem } from './autocomplete.js';
import { heatmapCaps } from './HeatmapService.js';
import { isTransientError } from './DeviceTracker.js';
import { readCapabilityLog } from './insightsLog.js';
import { logCover, mergeLogs, periodStart, planLogs, type CalendarUnit, type InsightsLog } from './logPlan.js';
import { bucketAverage, HOUR, MINUTE, parseInsightsEntries, runningTotal, type Meter, type Sample } from './series.js';
import Timings from './Timings.js';
import type ValueService from './ValueService.js';
import { parseSlot, type ValueSlot } from './ValueService.js';

const TICK = MINUTE;
/** A history is re-read from Insights at most this often (widgets refresh every 5 min). */
const HISTORY_TTL = 5 * MINUTE;
/** A history that failed because Homey was busy (a timeout, `Too many requests`) is asked for again after this. */
const RETRY_BUSY = 30e3;
/** A cached history is dropped this long after the last request. */
const IDLE_TIMEOUT = 10 * MINUTE;
/** The most points a sparkline gets: about one per 3 px of a phone's 2-column tile. */
export const MAX_POINTS = 120;
/** The most points of a running total (`use`): bars' edges are read off it, so a year's month edges stay within a day. */
export const MAX_METER_POINTS = 400;

const DAY = 24 * HOUR;

/**
 * The spans the widget offers, with the Insights resolution behind each and its step (all verified on the
 * Homey, 2026-10-06, 2026-10-09, 2026-10-23 and 2026-10-27). Insights has no `last2Days` or `last5Days`, so those
 * read the next longer hourly log; `downsample()` cuts it to the span. The rest are the Homey's own calendar
 * days, weeks (from Monday), months and years (`calendar`): their window is the log's (`calendarWindow()`), not
 * `ms` back from now. Months and years are 6-hour averages on UTC's 00, 06, 12 and 18, so their log starts up to
 * 6 h before the local month; this month's and year's end at the last finished 6 hours. A finished period's log
 * (`finished`: the shortest the period after it can be, an hour short for DST) stays as it is until that one ends.
 */
export const SPANS = {
  '1h': { resolution: 'lastHour', ms: HOUR, step: 5 * 1000 },
  '6h': { resolution: 'last6Hours', ms: 6 * HOUR, step: MINUTE },
  '24h': { resolution: 'last24Hours', ms: DAY, step: 5 * MINUTE },
  'today': { resolution: 'today', ms: DAY, step: 5 * MINUTE, calendar: true },
  'yesterday': { resolution: 'yesterday', ms: DAY, step: 5 * MINUTE, calendar: true, finished: DAY - HOUR },
  '2d': { resolution: 'last3Days', ms: 2 * DAY, step: HOUR },
  '3d': { resolution: 'last3Days', ms: 3 * DAY, step: HOUR },
  '5d': { resolution: 'last7Days', ms: 5 * DAY, step: HOUR },
  '7d': { resolution: 'last7Days', ms: 7 * DAY, step: HOUR },
  'thisWeek': { resolution: 'thisWeek', ms: 7 * DAY, step: HOUR, calendar: true },
  'lastWeek': { resolution: 'lastWeek', ms: 7 * DAY, step: HOUR, calendar: true, finished: 7 * DAY - HOUR },
  'thisMonth': { resolution: 'thisMonth', ms: 31 * DAY, step: 6 * HOUR, calendar: true },
  'lastMonth': { resolution: 'lastMonth', ms: 31 * DAY, step: 6 * HOUR, calendar: true, finished: 28 * DAY - HOUR },
  'thisYear': { resolution: 'thisYear', ms: 366 * DAY, step: 6 * HOUR, calendar: true },
  'lastYear': { resolution: 'lastYear', ms: 366 * DAY, step: 6 * HOUR, calendar: true, finished: 365 * DAY - HOUR },
} as const;
export type SpanId = keyof typeof SPANS;

export function spanOf(id: string | undefined): SpanId {
  return id && id in SPANS ? id as SpanId : '24h';
}

/**
 * A calendar period's window from its log: `start` is the period's start, `end` the next step after now (this
 * day, week, month or year) or a step past the period's end (the last one), so it ends at now at the latest.
 * Without a readable `start`, the last `ms` up to now.
 */
export function calendarWindow(res: any, now: number, ms: number): { to: number, ms: number } {
  const from = Date.parse(res?.start);
  const end = Date.parse(res?.end);
  const to = Math.min(now, Number.isFinite(end) ? end : now);
  return Number.isFinite(from) && from < to ? { to, ms: to - from } : { to: now, ms };
}

/**
 * How long a history read now stays cached. A finished period's: until the period after it could end, at the
 * earliest its log's `end` (a step past the period's end, or the end of the 6 hours holding it) less a step, plus
 * `finished`; only once a step has passed since `end`, so a log Homey is still completing is read again. Else
 * `HISTORY_TTL`.
 */
export function historyTtl(span: SpanId, res: any, now: number): number {
  const s = SPANS[span];
  const end = Date.parse(res?.end);
  if (!('finished' in s) || !Number.isFinite(end) || now < end + s.step) return HISTORY_TTL;
  return Math.max(HISTORY_TTL, end - s.step + s.finished - now);
}

/**
 * A Device Values slot plus its history as `[epoch ms, value]`, oldest first, and `step`, the coarsest step of the logs it
 * was read from (6 h or more: Homey's 6-hour averages, which a widget doesn't append live values to; the kit's
 * `sixHourLog()`). With `use`, the history is the value's running total, and `meter` carries its count on for live
 * values (`runningTotal()`).
 */
export type SparklineSlot =
  | (Extract<ValueSlot, { name: string }> & { points: [number, number][], step?: number, meter?: Meter })
  | Extract<ValueSlot, { missing: true }>;

export type History = { points: [number, number][], step?: number, meter?: Meter };
/** The logs a window is read from, each with how long a read of it is kept (`planLogs()`, `logTtl()`). */
type Plan = { log: InsightsLog, ttl: number }[];
type HistoryCache = History & { at: number, lastRequested: number, ttl: number };

/** The device's capabilities a sparkline can show: numbers that Homey logs in Insights. */
export function sparkCaps(device: any): string[] {
  return heatmapCaps(device).filter(c => c.type === 'number').map(c => c.id);
}

/** The device's logged booleans (on/off, open/closed, motion …). */
export function booleanCaps(device: any): string[] {
  return heatmapCaps(device).filter(c => c.type === 'boolean').map(c => c.id);
}

/** Chart · Timeline's values: the device's logged booleans, then its logged numbers (held against a threshold). */
export function timelineCaps(device: any): string[] {
  return [...booleanCaps(device), ...sparkCaps(device)];
}

/**
 * Insights entries averaged into at most `MAX_POINTS` buckets over the span ending `now`, each at its
 * bucket's middle. Empty buckets carry the last value (Homey doesn't log unchanged values); buckets
 * before the first value are left out. With the log's `logStep`, no bucket is shorter than it, so an
 * hourly log over 2 days is 48 points, not 120 drawn as steps.
 */
export function downsample(res: any, now: number, spanMs: number, logStep = 0): [number, number][] {
  return downsampleSamples(parseInsightsEntries(res), now, spanMs, logStep);
}

/** `downsample()` of samples. */
export function downsampleSamples(samples: Sample[], now: number, spanMs: number, logStep = 0, max = MAX_POINTS): [number, number][] {
  const count = Math.max(1, Math.min(max, logStep ? Math.floor(spanMs / logStep) : max));
  const step = spanMs / count;
  const start = now - spanMs;
  const out: [number, number][] = [];
  bucketAverage(samples, start, step, count).forEach((v, i) => {
    if (v != null) out.push([Math.round(start + (i + 0.5) * step), Math.round(v * 1000) / 1000]);
  });
  return out;
}

/**
 * A running total (`runningTotal()`) of samples, each with its log's step (`mergeLogs()`), at each one's middle (Insights
 * stamps an entry, the average over its step, at the step's start), as `[epoch ms, total]`, thinned to at most `max`
 * points by averaging runs of entries, so no point moves off its time; with the `meter` to carry on with.
 */
export function meterPointsOf(samples: (Sample & { step: number })[], max = MAX_METER_POINTS): { points: [number, number][], meter: Meter } {
  const steps = new Map(samples.map(e => [e.t, e.step]));
  const { totals, meter } = runningTotal(samples);
  const run = Math.max(1, Math.ceil(totals.length / max));
  const points: [number, number][] = [];
  for (let i = 0; i < totals.length; i += run) {
    const part = totals.slice(i, i + run);
    const t = part.reduce((a, p) => a + p.t + (steps.get(p.t) ?? 0) / 2, 0) / part.length;
    const v = part.reduce((a, p) => a + p.w, 0) / part.length;
    points.push([Math.round(t), Math.round(v * 1000) / 1000]);
  }
  return { points, meter };
}

/** A log's own step, when it says (Homey's do). */
function logStep(res: any): number | null {
  const own = Number(res?.step);
  return Number.isFinite(own) && own > 0 ? own : null;
}

/**
 * A chart's request (Charts, Chart · Totals and the other `Chart · …` widgets): the slot's history over `[from, end]`,
 * which the widget works out on the phone's clock, with its span's calendar unit for a calendar one (`planLogs()`),
 * and with `use` the running total; `fine` keeps up to `MAX_METER_POINTS` of it (Chart · Min/Max's lows and highs). `span`
 * is the setting, for the log line.
 */
export type WindowRequest = { slot: string, from: number, end: number, unit?: CalendarUnit | null, use?: boolean, fine?: boolean, span?: string };

/**
 * The Sparklines widget: Device Values' tiles with each value's recent history from Insights.
 * The name, icon and live value come from `ValueService` (and its `values:state` realtime events). Charts and Totals per
 * Period ask it too, with their own spans and options.
 */
export default class SparklineService {

  private cache = new Map<string, HistoryCache>();
  private promises = new Map<string, Promise<History>>();
  /**
   * The raw Insights log per slot and resolution, so spans on the same log (2d and 3d, 5d and 7d, a chart's windows)
   * read it once: for `ttl` (a finished period's until the next begins), dropped after 10 min without a request.
   */
  private logs = new Map<string, { at: number, ttl: number, lastRequested: number, log: Promise<any> }>();
  private logIds = new Map<string, string>(); // the Insights log that worked, per device and capability
  private tickTimer: NodeJS.Timeout | null = null;

  constructor(
    private homey: Homey.App['homey'],
    private values: ValueService,
    private log: (...args: any[]) => void, // errors and warnings: always kept
    private debug: (...args: any[]) => void = () => {}, // routine detail: only with the `debugLog` setting on
  ) {}

  start() {
    this.tickTimer = this.homey.setInterval(() => this.tick(), TICK);
  }

  async stop() {
    if (this.tickTimer) this.homey.clearInterval(this.tickTimer);
  }

  // ---------------------------------------------------------------- settings autocomplete

  /**
   * Every logged number of every device, as `Device · Capability`, with `None` first; `counter` (Chart · Totals'
   * value that counts up) lists the meters (`meter_*`: kWh, m³, …) before the rest, `power` (Chart · Stacked's layers)
   * the power values (`measure_power`) first, `boolean` the logged booleans instead, and `timeline` (Chart ·
   * Timeline's) both.
   */
  listSlots(query: string, kind: 'number' | 'counter' | 'power' | 'boolean' | 'timeline' = 'number'): Promise<AutocompleteItem[]> {
    if (kind === 'boolean') return listCapabilitySlots(this.homey, query, booleanCaps);
    if (kind === 'timeline') return listCapabilitySlots(this.homey, query, timelineCaps);
    const first = kind === 'counter' ? (id: string) => id.startsWith('meter_') : kind === 'power' ? (id: string) => id.startsWith('measure_power') : undefined;
    return listCapabilitySlots(this.homey, query, sparkCaps, first);
  }

  // ---------------------------------------------------------------- state

  /**
   * Device Values' state for the slots, each with its history over the span. A failed history is empty.
   */
  async getState(slots: string[], spanId: string | undefined): Promise<SparklineSlot[]> {
    const span = spanOf(spanId);
    const tm = new Timings();
    const valid = slots.filter(s => parseSlot(s));
    const [states, histories] = await Promise.all([
      tm.time('values', () => this.values.getState(valid)),
      tm.time('insights', () => Promise.all(valid.map(s => this.history(s, span)))),
    ]);
    this.debug(`Sparklines state for ${valid.length} slots (${span}): ${tm.summary()}`);
    return states.map((s, i) => ('missing' in s ? s : { ...s, ...histories[i] }));
  }

  /**
   * Device Values' state for each request's slot, in order (`{missing}` for one that isn't a slot), each with its
   * history over the request's window (`windowHistory()`).
   */
  async getWindows(requests: WindowRequest[]): Promise<SparklineSlot[]> {
    const tm = new Timings();
    const valid = requests.filter(r => parseSlot(r.slot));
    const [states, histories] = await Promise.all([
      tm.time('values', () => this.values.getState([...new Set(valid.map(r => r.slot))])),
      tm.time('insights', () => this.histories(valid)),
    ]);
    this.debug(`Chart state for ${valid.length} windows (${valid.map(r => `${r.span ?? '?'}${r.use ? ' use' : ''}`).join(', ')}): ${tm.summary()}`);
    const bySlot = new Map(states.map(s => [`${s.deviceId}:${s.capabilityId}`, s]));
    return requests.map((r) => {
      const at = valid.indexOf(r);
      const s = at < 0 ? null : bySlot.get(r.slot);
      if (!s) return { ...(parseSlot(r.slot) ?? { deviceId: r.slot, capabilityId: '' }), missing: true as const };
      return 'missing' in s ? s : { ...s, ...histories[at] };
    });
  }

  /**
   * Each request's history (`windowHistory()`), in order, without Device Values' state (Chart · Timeline has read it). The
   * logs to read and how long to keep them are worked out once per distinct window: a Ranking or Stacked asks one window
   * per value.
   */
  histories(requests: WindowRequest[]): Promise<History[]> {
    const now = Date.now();
    const timeZone = this.homey.clock.getTimezone() || 'UTC';
    const plans = new Map<string, Plan>();
    return Promise.all(requests.map((r) => {
      const k = `${r.from}~${r.end}~${r.unit ?? ''}`;
      let plan = plans.get(k);
      if (!plan) {
        const logs = planLogs(r.from, r.end, now, timeZone, r.unit ?? null);
        plan = logs.map(log => ({ log, ttl: logTtl(log, now, timeZone) }));
        plans.set(k, plan);
      }
      return this.windowHistory(r, plan);
    }));
  }

  /**
   * A window's history: the Insights logs `planLogs()` picks (stitched where one doesn't hold it, the finer one where
   * they overlap), averaged into at most `MAX_POINTS` over the window up to where the logs end (no bucket shorter than
   * the coarsest log's step, `step`), or with `use` the running total around it (`meterPointsOf()`). This month's and
   * year's logs end at the last finished 6 hours, up to 12 h before now: buckets past that would only carry the last
   * value on, as if it had been logged. A failed read gives no history.
   */
  private async windowHistory({ slot, from, end, use = false, fine = false }: WindowRequest, plan: Plan): Promise<History> {
    const { deviceId, capabilityId } = parseSlot(slot)!;
    const logs = plan.map(p => p.log);
    if (!logs.length) return { points: [] };
    try {
      const read = await Promise.all(plan.map(p => this.readLog(slot, deviceId, capabilityId, p.log.resolution, p.ttl)));
      const step = Math.max(...logs.map(l => l.step));
      const samples = mergeLogs(read.map((res, i) => ({ samples: parseInsightsEntries(res), step: logStep(res) ?? logs[i].step })));
      if (use) return { ...meterPointsOf(samples.filter(e => e.t >= from - 2 * step && e.t <= end + step)), step };
      const logEnd = Math.max(...read.map(res => Date.parse(res?.end)).filter(Number.isFinite));
      const to = logEnd > from && logEnd < end ? logEnd : end;
      return { points: downsampleSamples(samples, to, to - from, step, fine ? MAX_METER_POINTS : MAX_POINTS), step };
    } catch (err) {
      this.log(`Chart history of ${slot} unavailable:`, err);
      return { points: [] };
    }
  }

  private history(slot: string, span: SpanId): Promise<History> {
    const k = `${slot}:${span}`;
    const now = Date.now();
    const cached = this.cache.get(k);
    if (cached) cached.lastRequested = now;
    if (cached && now - cached.at < cached.ttl) return Promise.resolve(historyOf(cached));
    let p = this.promises.get(k);
    if (!p) {
      p = (async () => {
        const log = SPANS[span];
        let h: History = { points: [], step: log.step };
        let ttl = HISTORY_TTL;
        const { deviceId, capabilityId } = parseSlot(slot)!;
        try {
          const res = await this.readLog(slot, deviceId, capabilityId, log.resolution);
          const w = 'calendar' in log ? calendarWindow(res, Date.now(), log.ms) : { to: Date.now(), ms: log.ms };
          h = { points: downsample(res, w.to, w.ms, log.step), step: log.step };
          // A finished period's log stays as it is (`historyTtl()`).
          ttl = historyTtl(span, res, Date.now());
        } catch (err) {
          // Cached all the same, so a capability without a log isn't asked for again on every request; a busy Homey
          // only for a moment, so a dashboard's load burst doesn't leave its charts empty for 5 minutes.
          this.log(`Sparkline history of ${slot} unavailable:`, err);
          if (isTransientError(err)) {
            ttl = RETRY_BUSY;
            this.logs.delete(`${slot}:${log.resolution}`);
          }
        }
        this.cache.set(k, { ...h, at: Date.now(), lastRequested: Date.now(), ttl });
        return h;
      })().finally(() => this.promises.delete(k));
      this.promises.set(k, p);
    }
    return p;
  }

  private readLog(slot: string, deviceId: string, capabilityId: string, resolution: string, ttl = HISTORY_TTL): Promise<any> {
    const k = `${slot}:${resolution}`;
    const now = Date.now();
    const cached = this.logs.get(k);
    if (cached && now - cached.at < cached.ttl) {
      cached.lastRequested = now;
      return cached.log;
    }
    const log = getAppApi(this.homey).then(api => readCapabilityLog(api, deviceId, capabilityId, resolution, this.logIds));
    const entry = { at: now, ttl, lastRequested: now, log };
    // A failure is handled by each caller and kept no longer than an ordinary read (a finished period's `ttl` runs until
    // the next period, which would leave its chart empty until then); a busy Homey's is asked again soon, so a dashboard's
    // load burst doesn't leave its charts empty until the next refresh (a window's history isn't cached beyond its logs).
    log.catch((err) => { entry.ttl = Math.min(entry.ttl, isTransientError(err) ? RETRY_BUSY : HISTORY_TTL); });
    this.logs.set(k, entry);
    return log;
  }

  private tick() {
    const now = Date.now();
    for (const [k, l] of this.logs) {
      if (now - l.at >= l.ttl || now - l.lastRequested > IDLE_TIMEOUT) this.logs.delete(k);
    }
    for (const [k, c] of this.cache) {
      if (now - c.lastRequested > IDLE_TIMEOUT) this.cache.delete(k);
    }
  }

  /** For the diagnostics report. */
  describe() {
    return [...this.cache.entries()].map(([k, c]) => ({ key: k, points: c.points.length, fetchedAt: new Date(c.at).toISOString() }));
  }

}

/**
 * How long a log read now is kept: a finished period's (yesterday, last week … the two years before this one) until the
 * next period begins, once its last step has passed (before that Homey may still be completing it); else `HISTORY_TTL`.
 */
export function logTtl(log: InsightsLog, now: number, timeZone: string): number {
  if (!log.unit || !log.back) return HISTORY_TTL;
  const [, to] = logCover(log, now, timeZone);
  if (now < to + log.step) return HISTORY_TTL;
  return Math.max(HISTORY_TTL, periodStart(now, log.unit, 1, timeZone) - now);
}

/** A cached history as `getState()` hands it on: its points and its log's step. */
function historyOf({ points, step }: History): History {
  return { points, step };
}
