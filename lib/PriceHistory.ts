import type Homey from 'homey';
import { fileStorage, type SecretStorage } from './secrets.js';
import { HOUR } from './series.js';
import { DebouncedSetting } from './storedSetting.js';

/**
 * Where past days' spot prices are kept (Chart · Totals' cost, 1.2.0): a file in the app's own `/userdata`, so a year's
 * chart doesn't fetch 365 days again after every restart. A finished day's prices don't change.
 */
const PRICE_HISTORY_FILE = '/userdata/price-history.json';
/** Days older than this are dropped when the file is written: Insights keeps two years, so a chart can't go further. */
const KEEP_DAYS = 2 * 366 + 7;
/** A past day Homey had no prices for is asked for again after this. */
const MISS_RETRY = 6 * HOUR;
/** How many days are fetched at once. */
const AT_ONCE = 3;
/** Written this long after the first new day, so a year's first load is one write. */
const SAVE_DELAY = 30e3;
/** The kept days (two years are ~1–1.5 MB of Maps) are let go this long after the last ask, written first if changed. */
const RELEASE_AFTER = 10 * 60e3;

/** One day's hourly prices from Homey, as `ElectricityService` reads them. */
export type FetchedDay = { hours: Map<number, number> };

type Stored = { v: 1, days: Record<string, [number, number][]> };

/**
 * Past days' hourly spot prices (without Homey Energy's costs, which may change), read through `fetch` (one day, Homey's
 * `fetchDynamicElectricityPrices`) at most `AT_ONCE` at a time and kept in `PRICE_HISTORY_FILE` once a day is complete.
 * A day Homey has no prices for (before it began keeping them, a failed read) counts as missing for `MISS_RETRY`.
 */
export default class PriceHistory {

  private days: Map<string, Map<number, number>> | null = null;
  private misses = new Map<string, number>();
  private pending = new Map<string, Promise<void>>();
  private queue: (() => void)[] = [];
  private running = 0;
  private saved: DebouncedSetting;
  private releaseTimer: NodeJS.Timeout | null = null;
  /** Set by `stop()`: a read finishing later writes nothing (the last write has been). */
  private stopped = false;

  constructor(
    private homey: Homey.App['homey'],
    private fetch: (day: string) => Promise<FetchedDay>,
    private log: (...args: any[]) => void,
    private storage: SecretStorage = fileStorage(PRICE_HISTORY_FILE),
  ) {
    this.saved = new DebouncedSetting({
      homey, delay: SAVE_DELAY, value: () => this.toStored(), log, what: 'the price history', store: v => this.storage.write(JSON.stringify(v)),
    });
  }

  stop() {
    this.stopped = true;
    if (this.releaseTimer) this.homey.clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    this.saved.flush();
  }

  /** How many days are kept, for the diagnostics report: read from the file when they aren't in memory, without keeping them. */
  size(): number {
    if (this.days) return this.days.size;
    const n = this.load().size;
    this.days = null;
    return n;
  }

  /** Whether the kept days are in memory (for the tests). */
  get loaded(): boolean {
    return this.days !== null;
  }

  /**
   * The hourly spot prices of these past days (`YYYY-MM-DD`, before today), by hour start, waiting at most `waitMs` for
   * the ones not kept yet; those go on being read. `missing`: days Homey had no prices for; `pending`: days still being
   * read.
   */
  async hours(days: string[], waitMs: number): Promise<{ hours: Map<number, number>, missing: number, pending: number }> {
    const kept = this.load();
    const now = Date.now();
    const reads: Promise<void>[] = [];
    for (const day of days) {
      if (kept.has(day)) continue;
      const missed = this.misses.get(day);
      if (missed != null && now - missed < MISS_RETRY) continue;
      reads.push(this.read(day));
    }
    if (reads.length) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.all(reads),
        new Promise<void>((resolve) => { timer = this.homey.setTimeout(resolve, waitMs); }),
      ]);
      if (timer) this.homey.clearTimeout(timer);
    }
    this.releaseLater();
    const hours = new Map<number, number>();
    let missing = 0, pending = 0;
    for (const day of days) {
      const prices = kept.get(day);
      if (prices) for (const [h, p] of prices) hours.set(h, p);
      else if (this.pending.has(day)) pending++;
      else missing++;
    }
    return { hours, missing, pending };
  }

  /** One day, read once however many ask; queued behind the reads already running. */
  private read(day: string): Promise<void> {
    let p = this.pending.get(day);
    if (p) return p;
    p = new Promise<void>((resolve) => { this.queue.push(resolve); this.next(); })
      .then(() => this.fetch(day))
      .then((res) => {
        // A complete day (23 hours on a DST day) is kept; a day with no or some prices counts as missing for a while.
        if (res.hours.size >= 23) {
          this.load().set(day, new Map(res.hours));
          this.misses.delete(day);
          if (!this.stopped) this.saved.schedule();
        } else {
          this.misses.set(day, Date.now());
        }
      }, () => { this.misses.set(day, Date.now()); })
      .finally(() => {
        this.pending.delete(day);
        this.running--;
        this.next();
      });
    this.pending.set(day, p);
    return p;
  }

  /** Lets go of the kept days `RELEASE_AFTER` after the last ask, once no read is on its way; a pending write goes first. */
  private releaseLater() {
    if (this.stopped) return;
    if (this.releaseTimer) this.homey.clearTimeout(this.releaseTimer);
    this.releaseTimer = this.homey.setTimeout(() => {
      this.releaseTimer = null;
      if (this.pending.size) {
        this.releaseLater();
        return;
      }
      this.saved.flush();
      this.days = null;
    }, RELEASE_AFTER);
  }

  private next() {
    while (this.running < AT_ONCE && this.queue.length) {
      this.running++;
      this.queue.shift()!();
    }
  }

  private load(): Map<string, Map<number, number>> {
    if (this.days) return this.days;
    this.days = new Map();
    try {
      const text = this.storage.read();
      const stored = text ? JSON.parse(text) as Stored : null;
      for (const [day, list] of Object.entries(stored?.v === 1 && stored.days && typeof stored.days === 'object' ? stored.days : {})) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(list)) continue;
        const hours = new Map<number, number>();
        for (const e of list) {
          if (Array.isArray(e) && Number.isFinite(e[0]) && Number.isFinite(e[1])) hours.set(e[0], e[1]);
        }
        if (hours.size) this.days.set(day, hours);
      }
    } catch (err) {
      this.log('The price history file could not be read:', String((err as any)?.message ?? err));
    }
    return this.days;
  }

  private toStored(): Stored {
    const oldest = new Date(Date.now() - KEEP_DAYS * 24 * HOUR).toISOString().slice(0, 10);
    const days: Record<string, [number, number][]> = {};
    for (const [day, hours] of [...this.load()].sort(([a], [b]) => a.localeCompare(b))) {
      if (day < oldest) {
        this.days!.delete(day);
        continue;
      }
      days[day] = [...hours];
    }
    return { v: 1, days };
  }

}
