import type Homey from 'homey';
import { getAppApi } from './appApi.js';
import { listCapabilitySlots, type AutocompleteItem } from './autocomplete.js';
import { heatmapCaps } from './HeatmapService.js';
import { isTransientError } from './DeviceTracker.js';
import { readCapabilityLog } from './insightsLog.js';
import { bucketAverage, HOUR, MINUTE, parseInsightsEntries, runningTotal, type Meter } from './series.js';
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

/**
 * Each calendar span's period before (Totals per Period's `compare`), as the log that holds it: Insights has no
 * resolution for the week, month or year before last, so `last31Days`, `last3Months` (ending at this month's start)
 * and `last2Years` (weekly, ending at this year's start) reach past it, and `last3Days` past the day before yesterday;
 * the widget cuts each to its own window. Verified on the Homey, 2026-10-27; `last14Days` doesn't reach the week
 * before last.
 */
export const PREV_LOGS: Partial<Record<SpanId, { resolution: string, step: number }>> = {
  today: { resolution: 'yesterday', step: 5 * MINUTE },
  yesterday: { resolution: 'last3Days', step: HOUR },
  thisWeek: { resolution: 'lastWeek', step: HOUR },
  lastWeek: { resolution: 'last31Days', step: 6 * HOUR },
  thisMonth: { resolution: 'lastMonth', step: 6 * HOUR },
  lastMonth: { resolution: 'last3Months', step: 6 * HOUR },
  thisYear: { resolution: 'lastYear', step: 6 * HOUR },
  lastYear: { resolution: 'last2Years', step: 7 * DAY },
};

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
 * A Device Values slot plus its history as `[epoch ms, value]`, oldest first. With `use`, the history is the value's
 * running total, and `meter` carries its count on for live values (`runningTotal()`).
 */
export type SparklineSlot =
  | (Extract<ValueSlot, { name: string }> & { points: [number, number][], meter?: Meter })
  | Extract<ValueSlot, { missing: true }>;

/** `prev`: the period before a calendar span's (`PREV_LOGS`); `use`: a running total instead of the values. */
export type HistoryOptions = { prev?: boolean, use?: boolean };

type History = { points: [number, number][], meter?: Meter };
type HistoryCache = History & { at: number, lastRequested: number, ttl: number };

/** The device's capabilities a sparkline can show: numbers that Homey logs in Insights. */
export function sparkCaps(device: any): string[] {
  return heatmapCaps(device).filter(c => c.type === 'number').map(c => c.id);
}

/**
 * Insights entries averaged into at most `MAX_POINTS` buckets over the span ending `now`, each at its
 * bucket's middle. Empty buckets carry the last value (Homey doesn't log unchanged values); buckets
 * before the first value are left out. With the log's `logStep`, no bucket is shorter than it, so an
 * hourly log over 2 days is 48 points, not 120 drawn as steps.
 */
export function downsample(res: any, now: number, spanMs: number, logStep = 0): [number, number][] {
  const count = Math.max(1, Math.min(MAX_POINTS, logStep ? Math.floor(spanMs / logStep) : MAX_POINTS));
  const step = spanMs / count;
  const start = now - spanMs;
  const out: [number, number][] = [];
  bucketAverage(parseInsightsEntries(res), start, step, count).forEach((v, i) => {
    if (v != null) out.push([Math.round(start + (i + 0.5) * step), Math.round(v * 1000) / 1000]);
  });
  return out;
}

/**
 * A running total (`runningTotal()`) at each log entry's middle (Insights stamps an entry, the average over its step,
 * at the step's start; `step` is the log's own when it says, as Homey's do), as `[epoch ms, total]`, thinned to at most
 * `max` points by averaging runs of entries, so no point moves off its time; with the `meter` to carry on with.
 */
export function meterPoints(res: any, step: number, max = MAX_METER_POINTS): { points: [number, number][], meter: Meter } {
  const own = Number(res?.step);
  const half = (Number.isFinite(own) && own > 0 ? own : step) / 2;
  const { totals, meter } = runningTotal(parseInsightsEntries(res));
  const run = Math.max(1, Math.ceil(totals.length / max));
  const points: [number, number][] = [];
  for (let i = 0; i < totals.length; i += run) {
    const part = totals.slice(i, i + run);
    const t = part.reduce((a, p) => a + p.t, 0) / part.length + half;
    const v = part.reduce((a, p) => a + p.w, 0) / part.length;
    points.push([Math.round(t), Math.round(v * 1000) / 1000]);
  }
  return { points, meter };
}

/**
 * The Sparklines widget: Device Values' tiles with each value's recent history from Insights.
 * The name, icon and live value come from `ValueService` (and its `values:state` realtime events). Charts and Totals per
 * Period ask it too, with their own spans and options.
 */
export default class SparklineService {

  private cache = new Map<string, HistoryCache>();
  private promises = new Map<string, Promise<History>>();
  /** The raw Insights log per slot and resolution, so spans on the same log (2d and 3d, 5d and 7d) read it once. */
  private logs = new Map<string, { at: number, log: Promise<any> }>();
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

  /** Every logged number of every device, as `Device · Capability`, with `None` first. */
  listSlots(query: string): Promise<AutocompleteItem[]> {
    return listCapabilitySlots(this.homey, query, sparkCaps);
  }

  // ---------------------------------------------------------------- state

  /**
   * Device Values' state for the slots, each with its history over the span (`prev`: the period before it; `use`: the
   * running total). A failed history is empty.
   */
  async getState(slots: string[], spanId: string | undefined, opts: HistoryOptions = {}): Promise<SparklineSlot[]> {
    const span = spanOf(spanId);
    const tm = new Timings();
    const valid = slots.filter(s => parseSlot(s));
    const [states, histories] = await Promise.all([
      tm.time('values', () => this.values.getState(valid)),
      tm.time('insights', () => Promise.all(valid.map(s => this.history(s, span, opts)))),
    ]);
    this.debug(`Sparklines state for ${valid.length} slots (${span}${opts.prev ? ', before' : ''}${opts.use ? ', use' : ''}): ${tm.summary()}`);
    return states.map((s, i) => ('missing' in s ? s : { ...s, ...histories[i] }));
  }

  private history(slot: string, span: SpanId, { prev = false, use = false }: HistoryOptions): Promise<History> {
    const k = `${slot}:${span}${prev ? ':prev' : ''}${use ? ':use' : ''}`;
    const now = Date.now();
    const cached = this.cache.get(k);
    if (cached) cached.lastRequested = now;
    if (cached && now - cached.at < cached.ttl) return Promise.resolve(historyOf(cached));
    let p = this.promises.get(k);
    if (!p) {
      p = (async () => {
        const log = prev ? PREV_LOGS[span] : SPANS[span]; // a rolling span has no period before it
        let h: History = { points: [] };
        let ttl = HISTORY_TTL;
        if (log) {
          const { deviceId, capabilityId } = parseSlot(slot)!;
          try {
            const res = await this.readLog(slot, deviceId, capabilityId, log.resolution);
            if (use) h = meterPoints(res, log.step);
            else {
              const { ms } = SPANS[span];
              const w = 'calendar' in SPANS[span] ? calendarWindow(res, Date.now(), ms) : { to: Date.now(), ms };
              h = { points: downsample(res, w.to, w.ms, log.step) };
            }
            // A finished period's own log stays as it is (`historyTtl()`); the logs that reach past one are read again.
            if (!prev) ttl = historyTtl(span, res, Date.now());
          } catch (err) {
            // Cached all the same, so a capability without a log isn't asked for again on every request; a busy Homey
            // only for a moment, so a dashboard's load burst doesn't leave its charts empty for 5 minutes.
            this.log(`Sparkline history of ${slot} unavailable:`, err);
            if (isTransientError(err)) {
              ttl = RETRY_BUSY;
              this.logs.delete(`${slot}:${log.resolution}`);
            }
          }
        }
        this.cache.set(k, { ...h, at: Date.now(), lastRequested: Date.now(), ttl });
        return h;
      })().finally(() => this.promises.delete(k));
      this.promises.set(k, p);
    }
    return p;
  }

  private readLog(slot: string, deviceId: string, capabilityId: string, resolution: string): Promise<any> {
    const k = `${slot}:${resolution}`;
    const cached = this.logs.get(k);
    if (cached && Date.now() - cached.at < HISTORY_TTL) return cached.log;
    const log = getAppApi(this.homey).then(api => readCapabilityLog(api, deviceId, capabilityId, resolution, this.logIds));
    log.catch(() => {}); // a failure is handled by each caller
    this.logs.set(k, { at: Date.now(), log });
    return log;
  }

  private tick() {
    const now = Date.now();
    for (const [k, l] of this.logs) {
      if (now - l.at >= HISTORY_TTL) this.logs.delete(k);
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

/** A cached history as `getState()` hands it on: its points, and the running total's count with `use`. */
function historyOf({ points, meter }: History): History {
  return meter ? { points, meter } : { points };
}
