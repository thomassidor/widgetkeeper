import { isTransientError } from './DeviceTracker.js';
/**
 * Insights log ids differ from capability ids in one known case: Homey logs `measure_power` as
 * `energy_power` (on every device with it on the test Homey, 2026-10-09: the meter, plugs, a heat pump,
 * a car and a charger; reading `…:measure_power` is `Not Found: LogLocal`). The capability's own id is
 * kept as a second try, in case a device or firmware logs it under that name.
 */
const LOG_ALIASES: Record<string, string[]> = {
  measure_power: ['energy_power', 'measure_power'],
};

/**
 * At most this many Insights reads at once, app-wide. A crowded dashboard's load (Sparklines, Charts, a heatmap, the
 * Electricity Overview) sent ~20 at once, and Homey answers a burst of log reads with `Too many requests`.
 */
const MAX_CONCURRENT_READS = 6;
/** After a read failed because Homey was busy (`isTransientError()`): no new read starts for this long… */
const BUSY_PAUSE = 2e3;
/** …and then at most this many run at once for `BUSY_WINDOW`, so the queue doesn't hit a busy Homey at full rate again. */
const BUSY_CONCURRENT_READS = 2;
const BUSY_WINDOW = 30e3;

let running = 0;
const waiting: (() => void)[] = [];
let pausedUntil = 0;
let slowUntil = 0;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

function allowed(now: number): number {
  if (now < pausedUntil) return 0;
  return now < slowUntil ? BUSY_CONCURRENT_READS : MAX_CONCURRENT_READS;
}

/** Starts the reads waiting, in the order asked, as far as `allowed()` lets; while paused, again once the pause is over. */
function pump() {
  const now = Date.now();
  while (waiting.length && running < allowed(now)) {
    running++;
    waiting.shift()!();
  }
  if (waiting.length && now < pausedUntil && !wakeTimer) {
    wakeTimer = setTimeout(() => { wakeTimer = null; pump(); }, pausedUntil - now);
    (wakeTimer as { unref?: () => void }).unref?.();
  }
}

/**
 * `read()` once fewer than `MAX_CONCURRENT_READS` Insights reads are running (in the order asked). A read that fails
 * because Homey is busy pauses the queue for `BUSY_PAUSE`, then lets only `BUSY_CONCURRENT_READS` run for `BUSY_WINDOW`.
 */
export async function limitInsights<T>(read: () => Promise<T>): Promise<T> {
  if (!waiting.length && running < allowed(Date.now())) running++;
  else await new Promise<void>((resolve) => { waiting.push(resolve); pump(); });
  try {
    return await read();
  } catch (err) {
    if (isTransientError(err)) {
      const now = Date.now();
      pausedUntil = Math.max(pausedUntil, now + BUSY_PAUSE);
      slowUntil = Math.max(slowUntil, now + BUSY_WINDOW);
    }
    throw err;
  } finally {
    running--;
    pump();
  }
}

/** Forgets a busy Homey (the tests: each starts with a fresh limiter). */
export function resetInsightsLimit() {
  pausedUntil = 0;
  slowUntil = 0;
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = null;
  pump();
}

/** The Insights log ids that may hold a capability's history, in the order to try them. */
export function logIdsFor(deviceId: string, capabilityId: string): string[] {
  return (LOG_ALIASES[capabilityId] ?? [capabilityId]).map(c => `homey:device:${deviceId}:${c}`);
}

/**
 * `read` with the first of the candidate log ids that works (a missing log throws, so they're tried in turn). The one
 * that worked is remembered in `known` under `key`, so later reads make one call. A remembered id that fails is
 * forgotten, so the next read tries every candidate again, unless `keep` (then it stays the only one tried). Throws
 * the last error when none works, and a passing one (Homey busy, `isTransientError()`) at once: the other ids would
 * fail the same way, and an alias's "not found" would hide that a retry soon may work.
 */
export async function readFirstLog<T>(
  key: string, candidates: string[], known: Map<string, string>, read: (logId: string) => Promise<T>, { keep = false } = {},
): Promise<{ logId: string, result: T }> {
  const remembered = known.get(key);
  let error: unknown;
  for (const logId of remembered ? [remembered] : candidates) {
    try {
      const result = await read(logId);
      known.set(key, logId);
      return { logId, result };
    } catch (err) {
      if (isTransientError(err)) throw err;
      error = err;
    }
  }
  if (remembered && !keep) known.delete(key);
  throw error;
}

/**
 * A capability's Insights log entries at `resolution`, from the first of `logIdsFor()` that works; the one that worked
 * is remembered in `known` (per `deviceId:capabilityId`).
 */
export async function readCapabilityLog(
  api: any, deviceId: string, capabilityId: string, resolution: string, known: Map<string, string>,
): Promise<any> {
  const { result } = await readFirstLog(`${deviceId}:${capabilityId}`, logIdsFor(deviceId, capabilityId), known,
    id => limitInsights(() => api.insights.getLogEntries({ uri: `homey:device:${deviceId}`, id, resolution })));
  return result;
}
