import { randomUUID } from 'node:crypto';
import type Homey from 'homey';
import { isTransientError } from './DeviceTracker.js';
import { KeyError, type default as PersonalApiKey } from './PersonalApiKey.js';
import { fileStorage, type SecretStorage } from './secrets.js';
import { DebouncedSetting, isReservedKey } from './storedSetting.js';
import type TileNameService from './TileNameService.js';
import type { default as WebDashboardService, WebDashboard } from './WebDashboardService.js';
import { MAX_WIDGETS } from './WebDashboardService.js';
import {
  hasChanges, homeyView, mergeViews, toHomey, toWeb, webView,
  type HomeyDashboard, type HomeySyncOptions, type SyncChanges, type SyncSideName, type SyncView, type WebSyncDashboard,
} from './dashboardSync.js';

/** The links and their bases (`/userdata`: they hold settings and tile names, which no API should serve). */
const WEB_SYNC_FILE = '/userdata/web-sync.json';
/** The app setting with the nightly sync (`{nightly, time}`); missing is on at 03:00. */
export const WEB_SYNC_SCHEDULE_SETTING = 'webSyncSchedule';
/** Realtime after each sync: `{id, link}`, the web dashboard's id and its link as `status()` gives it (null: unlinked). */
export const WEB_SYNC_EVENT = 'websync:state';

const SAVE_DELAY = 2000;
const RETRY_MS = 3000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type SyncSchedule = { nightly: boolean, time: string };
const DEFAULT_SCHEDULE: SyncSchedule = { nightly: true, time: '03:00' };

/** Why a sync didn't happen: the key's problems, the Homey dashboard gone, too many widgets for the web, or else. */
type SyncProblem = 'noKey' | 'keyScope' | 'keyInvalid' | 'homeyGone' | 'webGone' | 'tooMany' | 'failed';

export type LastSync = {
  at: number,
  ok: boolean,
  reason?: SyncProblem,
  changes?: { web: SyncChanges, homey: SyncChanges },
  /** What was in conflict: `name`, `layout`, `title`, `settings.<id>`, `tileNames.<tile>` …, each kept from `prefer`. */
  conflicts?: string[],
};

type Link = {
  homeyId: string,
  prefer: SyncSideName,
  /** The first sync's start side (cleared once there's a base). */
  start?: SyncSideName,
  /** Web widget id (the merge's key) → Homey widget id. */
  idMap: Record<string, string>,
  base: { web: SyncView, homey: SyncView } | null,
  lastSync: LastSync | null,
};

/** A link as the page sees it. */
export type LinkStatus = { homeyId: string, prefer: SyncSideName, lastSync: LastSync | null, syncing: boolean };

/**
 * Web dashboards synced with Homey dashboards, both ways (`.claude/rules/web-sync.md`; the merge is `dashboardSync.ts`).
 * Reading and writing Homey dashboards takes the stored personal API key (`homey.dashboard`, so a Homey (everything) key).
 * Syncs on demand, when a dashboard is opened and its last sync is older than a while, and every night.
 */
export default class WebSyncService {

  private links: Record<string, Link>;
  private saved: DebouncedSetting;
  private running = new Map<string, Promise<LastSync>>();
  private nightlyTimer: NodeJS.Timeout | null = null;
  private onSetting = (key: string) => { if (key === WEB_SYNC_SCHEDULE_SETTING) this.planNight(); };
  private stopped = false;

  constructor(
    private homey: Homey.App['homey'],
    private deps: { web: WebDashboardService, tileNames: TileNameService, key: PersonalApiKey },
    private log: (...args: any[]) => void,
    private debug: (...args: any[]) => void = () => {},
    private storage: SecretStorage = fileStorage(WEB_SYNC_FILE),
    /** A web dashboard's backup before each sync writes (`web-sync-backup-<id>.json`). */
    private backups: (id: string) => SecretStorage = id => fileStorage(`/userdata/web-sync-backup-${id}.json`),
    private newId: () => string = randomUUID,
  ) {
    this.links = this.read();
    this.saved = new DebouncedSetting({
      homey, delay: SAVE_DELAY, value: () => this.links, log, what: 'the dashboard sync', store: v => this.storage.write(JSON.stringify(v)),
    });
  }

  start() {
    this.homey.settings.on?.('set', this.onSetting);
    this.planNight();
  }

  stop() {
    this.stopped = true;
    this.homey.settings.off?.('set', this.onSetting);
    if (this.nightlyTimer) this.homey.clearTimeout(this.nightlyTimer);
    this.nightlyTimer = null;
    this.saved.flush();
  }

  private read(): Record<string, Link> {
    try {
      const text = this.storage.read();
      const v = text ? JSON.parse(text) : {};
      const out: Record<string, Link> = {};
      for (const [id, link] of Object.entries(v && typeof v === 'object' ? v : {})) {
        const l = link as Link;
        if (isReservedKey(id) || !l || typeof l.homeyId !== 'string') continue;
        out[id] = {
          homeyId: l.homeyId, prefer: l.prefer === 'web' ? 'web' : 'homey', idMap: l.idMap && typeof l.idMap === 'object' ? l.idMap : {},
          base: l.base ?? null, lastSync: l.lastSync ?? null, ...(l.start ? { start: l.start } : {}),
        };
      }
      return out;
    } catch (err) {
      this.log('Dashboard sync: could not read the links:', err);
      return {};
    }
  }

  private save() {
    this.saved.schedule();
  }

  // ── The schedule ──────────────────────────────────────────────────────────────────────────────────────────────

  schedule(): SyncSchedule {
    const v = this.homey.settings.get(WEB_SYNC_SCHEDULE_SETTING);
    return {
      nightly: v?.nightly !== false,
      time: typeof v?.time === 'string' && TIME.test(v.time) ? v.time : DEFAULT_SCHEDULE.time,
    };
  }

  setSchedule(input: unknown): SyncSchedule {
    const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const now = this.schedule();
    const next: SyncSchedule = {
      nightly: typeof v.nightly === 'boolean' ? v.nightly : now.nightly,
      time: typeof v.time === 'string' && TIME.test(v.time) ? v.time : now.time,
    };
    this.homey.settings.set(WEB_SYNC_SCHEDULE_SETTING, next);
    this.planNight();
    return next;
  }

  /** The next nightly sync's timer (none while off or without links when it fires). */
  private planNight() {
    if (this.nightlyTimer) this.homey.clearTimeout(this.nightlyTimer);
    this.nightlyTimer = null;
    if (this.stopped) return;
    const { nightly, time } = this.schedule();
    if (!nightly) return;
    const at = nextLocalTime(time, this.homey.clock.getTimezone(), Date.now());
    this.nightlyTimer = this.homey.setTimeout(() => {
      this.nightlyTimer = null;
      this.syncAll().catch(err => this.log('Dashboard sync: the nightly sync failed:', err))
        .finally(() => this.planNight());
    }, at - Date.now());
  }

  // ── Links ─────────────────────────────────────────────────────────────────────────────────────────────────────

  status(): Record<string, LinkStatus> {
    const out: Record<string, LinkStatus> = {};
    for (const [id, l] of Object.entries(this.links)) {
      out[id] = { homeyId: l.homeyId, prefer: l.prefer, lastSync: l.lastSync, syncing: this.running.has(id) };
    }
    return out;
  }

  private statusOf(id: string): LinkStatus | null {
    return this.status()[id] ?? null;
  }

  /** The Homey dashboards to link to, by name: `{id, name, linked}` (`linked`: the web dashboard it's synced with). */
  async homeyDashboards(): Promise<{ id: string, name: string, linked: string | null }[]> {
    const all = Object.values(await this.deps.key.run(api => api.dashboards.getDashboards()) ?? {}) as HomeyDashboard[];
    const linkedTo = new Map(Object.entries(this.links).map(([web, l]) => [l.homeyId, web]));
    return all.map(d => ({ id: String(d.id), name: String(d.name ?? ''), linked: linkedTo.get(String(d.id)) ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Links a web dashboard to a Homey dashboard (`homeyId`, or `new` to make one named as it) and syncs it: the first
   * time, `start`'s side is copied over the other. A Homey dashboard is linked to one web dashboard at most.
   */
  async link(id: string, input: { homeyId?: unknown, start?: unknown, prefer?: unknown }): Promise<{ link: LinkStatus | null, lastSync: LastSync }> {
    const dashboard = this.deps.web.list().find(d => d.id === id);
    if (!dashboard) throw new Error('No such web dashboard');
    const prefer: SyncSideName = input.prefer === 'web' ? 'web' : 'homey';
    let homeyId = typeof input.homeyId === 'string' ? input.homeyId : '';
    let start: SyncSideName = input.start === 'web' ? 'web' : 'homey';
    if (homeyId === 'new') {
      const created: any = await this.deps.key.run(api => api.dashboards.createDashboard({
        dashboard: { name: dashboard.name || 'Web dashboard', columns: [{ id: this.newId(), widgets: [] }] },
      }));
      homeyId = String(created?.id ?? '');
      if (!homeyId) throw new Error('Homey did not make the dashboard');
      start = 'web';
      this.log(`Dashboard sync: made Homey dashboard ${homeyId} for ${id}`);
    }
    if (!homeyId) throw new Error('Pick a Homey dashboard');
    const other = Object.entries(this.links).find(([web, l]) => web !== id && l.homeyId === homeyId);
    if (other) throw new Error('That Homey dashboard is synced with another web dashboard');
    this.links[id] = { homeyId, prefer, start, idMap: {}, base: null, lastSync: null };
    this.save();
    const lastSync = await this.sync(id);
    return { link: this.statusOf(id), lastSync };
  }

  /** Changes which side wins a conflict. */
  setPrefer(id: string, prefer: unknown): LinkStatus | null {
    const link = this.links[id];
    if (!link) throw new Error('Not synced');
    if (prefer !== 'web' && prefer !== 'homey') throw new Error('Pick the side that wins');
    link.prefer = prefer;
    this.save();
    this.emit(id);
    return this.statusOf(id);
  }

  /** Stops syncing (both dashboards stay as they are). Also when the web dashboard is deleted. */
  unlink(id: string): { removed: boolean } {
    if (!this.links[id]) return { removed: false };
    delete this.links[id];
    this.save();
    this.emit(id);
    return { removed: true };
  }

  // ── Syncing ───────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Syncs one web dashboard with its Homey dashboard; one at a time per dashboard (a second call joins the first).
   * `ifOlderMs`: only when the last sync is older than that (opening a dashboard), else the last result.
   */
  sync(id: string, { ifOlderMs }: { ifOlderMs?: number } = {}): Promise<LastSync> {
    const link = this.links[id];
    if (!link) return Promise.reject(new Error('Not synced'));
    const running = this.running.get(id);
    if (running) return running;
    if (ifOlderMs !== undefined && link.lastSync && Date.now() - link.lastSync.at < ifOlderMs) return Promise.resolve(link.lastSync);
    const p = this.runSync(id, link).finally(() => {
      this.running.delete(id);
      this.emit(id);
    });
    this.running.set(id, p);
    this.emit(id);
    return p;
  }

  /** Every linked dashboard, one after another; none while web dashboards are turned off (the links stay). */
  async syncAll(): Promise<Record<string, LastSync>> {
    const out: Record<string, LastSync> = {};
    for (const id of Object.keys(this.links)) {
      if (this.stopped || !this.deps.web.enabled) break; // turned off, even with the night's run under way
      out[id] = await this.sync(id).catch(err => ({ at: Date.now(), ok: false, reason: 'failed' as const, conflicts: [String(err)] }));
    }
    return out;
  }

  private async runSync(id: string, link: Link): Promise<LastSync> {
    let result: LastSync;
    try {
      result = await this.once(id, link).catch(async (err) => {
        if (!isTransientError(err)) throw err;
        await new Promise(r => this.homey.setTimeout(r, RETRY_MS));
        return this.once(id, link);
      });
    } catch (err) {
      const reason: SyncProblem = err instanceof KeyError ? err.reason
        : err instanceof SyncError ? err.reason
          : 'failed';
      if (reason === 'failed') this.log(`Dashboard sync of ${id} failed:`, err);
      else this.debug(`Dashboard sync of ${id}: ${reason}`);
      result = { at: Date.now(), ok: false, reason };
    }
    if (this.links[id] === link) {
      link.lastSync = result;
      this.save();
    }
    return result;
  }

  /** `tries`: how often it may start over because the web dashboard was saved while Homey's was being written. */
  private async once(id: string, link: Link, tries = 3): Promise<LastSync> {
    const { web, tileNames, key } = this.deps;
    const readWeb = () => {
      const dashboard = web.list().find(d => d.id === id);
      if (dashboard) return dashboard;
      this.unlink(id);
      throw new SyncError('webGone');
    };
    readWeb();
    const homeyDash = await key.run<HomeyDashboard>(api => api.dashboards.getDashboard({ id: link.homeyId }))
      .catch((err: unknown) => {
        if (isNotFound(err)) throw new SyncError('homeyGone');
        throw err;
      });
    // Read after the wait, so an edit saved meanwhile is merged. From here on nothing waits until Homey's is written.
    const webDash = readWeb();
    const byHomey = new Map(Object.entries(link.idMap).map(([k, h]) => [h, k]));
    const homeyIds = new Set((homeyDash.columns ?? []).flatMap(c => (c.widgets ?? []).map(w => String(w.id))));
    const opts: HomeySyncOptions = {
      appId: String((this.homey.manifest as any)?.id ?? ''),
      settingIds: (type) => {
        const def = (this.homey.manifest as any)?.widgets?.[type];
        return def ? (def.settings ?? []).map((s: any) => s.id) : null;
      },
      keyOf: (homeyId) => byHomey.get(homeyId) ?? homeyId,
    };
    const homeyIdOf = (k: string) => link.idMap[k] ?? (homeyIds.has(k) ? k : this.newId());
    const webInstance = (k: string) => `web-${id}-${k}`;
    const names = (instance: string) => tileNames.get(instance).names;
    const withNames = (view: SyncView, instance: (k: string) => string) => {
      for (const [k, w] of Object.entries(view.widgets)) {
        const n = names(instance(k));
        if (Object.keys(n).length) w.tileNames = n;
      }
      return view;
    };

    const w = webView(webDash as WebSyncDashboard);
    const h = homeyView(homeyDash, opts);
    withNames(w.view, webInstance);
    withNames(h.view, k => link.idMap[k] ?? k);
    const merged = mergeViews(link.base, w.view, h.view, link.prefer, link.start ?? link.prefer);

    const webCount = Object.keys(merged.web.widgets).length + w.opaque.length;
    if (webCount > MAX_WIDGETS) throw new SyncError('tooMany');

    // Both sides as they were, before anything is written.
    try {
      this.backups(id).write(JSON.stringify({ at: new Date().toISOString(), web: webDash, homey: homeyDash }));
    } catch (err) {
      this.log(`Dashboard sync of ${id}: no backup, so not synced:`, err);
      throw err;
    }

    // Every kept widget's Homey id (new ones for widgets from the web), and only those.
    const idMap: Record<string, string> = {};
    for (const k of Object.keys(merged.homey.widgets)) idMap[k] = homeyIdOf(k);
    // Until Homey's write is through, the old ids too: a widget dropped here is still on Homey if it fails, and a new one
    // may be there if its answer was lost. Without either, the next sync would take them for widgets added on Homey.
    link.idMap = { ...link.idMap, ...idMap };

    const homeyOut = toHomey(homeyDash, merged.homey, h.opaque, opts, k => idMap[k], this.newId);
    if (hasChanges(merged.changes.homey) || !link.base) {
      const { id: _id, ...body } = homeyOut;
      await key.run(api => api.dashboards.updateDashboard({ id: link.homeyId, dashboard: body }));
    }
    link.idMap = idMap;

    // Tile names, on both sides' instances, only where they changed.
    const given: Record<string, Record<string, string>> = {};
    for (const [k, widget] of Object.entries(merged.web.widgets)) {
      const want = widget.tileNames ?? {};
      if (JSON.stringify(want) !== JSON.stringify(names(webInstance(k)))) given[webInstance(k)] = want;
    }
    for (const [k, widget] of Object.entries(merged.homey.widgets)) {
      const want = widget.tileNames ?? {};
      if (JSON.stringify(want) !== JSON.stringify(names(idMap[k]))) given[idMap[k]] = want;
    }
    if (Object.keys(given).length) tileNames.replace(instance => Object.prototype.hasOwnProperty.call(given, instance), given);

    let savedWeb: WebDashboard = webDash;
    if (hasChanges(merged.changes.web)) {
      // An edit saved while Homey's was written isn't in this merge, so saving it would undo the edit. The bases stay,
      // and a new merge finds Homey as just written (the same as here for what this one did) and the edit on top.
      if (JSON.stringify(readWeb()) !== JSON.stringify(webDash)) {
        if (tries <= 1) throw new SyncError('failed');
        return this.once(id, link, tries - 1);
      }
      savedWeb = web.save(toWeb(webDash as WebSyncDashboard, merged.web, w.opaque));
    }

    // The new bases: each side as it is now (the web as saved, so its own normalising is in it).
    const baseWeb = withNames(webView(savedWeb as WebSyncDashboard).view, webInstance);
    const keyOfNow = new Map(Object.entries(idMap).map(([k, hid]) => [hid, k]));
    const baseHomey = homeyView(homeyOut, { ...opts, keyOf: hid => keyOfNow.get(hid) ?? hid }).view;
    withNames(baseHomey, k => idMap[k] ?? k);
    link.base = { web: baseWeb, homey: baseHomey };
    delete link.start;

    const result: LastSync = {
      at: Date.now(), ok: true, changes: merged.changes,
      conflicts: merged.conflicts.map(c => c.field),
    };
    this.debug(`Dashboard sync of ${id} ↔ ${link.homeyId}: web ${summary(merged.changes.web)}, Homey ${summary(merged.changes.homey)}`
      + (merged.conflicts.length ? `, ${merged.conflicts.length} conflicts kept from ${link.prefer}` : ''));
    return result;
  }

  private emit(id: string) {
    this.homey.api.realtime(WEB_SYNC_EVENT, { id, link: this.statusOf(id) });
  }

  /** For the diagnostics report: the links and their last results, never settings or names. */
  describe() {
    return {
      schedule: this.schedule(),
      links: Object.entries(this.links).map(([id, l]) => ({
        web: id, homey: l.homeyId, prefer: l.prefer, widgets: Object.keys(l.idMap).length, synced: !!l.base,
        lastSync: l.lastSync && { ...l.lastSync, at: new Date(l.lastSync.at).toISOString() },
      })),
    };
  }

}

class SyncError extends Error {
  constructor(public reason: SyncProblem) {
    super(reason);
  }
}

const isNotFound = (err: unknown) => (err as any)?.statusCode === 404 || /not found/i.test(String((err as any)?.message ?? err));

function summary(c: SyncChanges): string {
  const parts = [c.added && `+${c.added}`, c.removed && `-${c.removed}`, c.updated && `~${c.updated}`, c.moved && 'moved', c.renamed && 'renamed'];
  return parts.filter(Boolean).join(' ') || 'unchanged';
}

/** The next time it's `time` (`HH:MM`) in the time zone `tz`, after `now` (ms). A time a DST change skips comes an hour later. */
export function nextLocalTime(time: string, tz: string, now: number): number {
  const [hh, mm] = time.split(':').map(Number);
  const parts = (ms: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(ms).map(x => [x.type, Number(x.value)]));
    return p as Record<string, number>;
  };
  const offset = (ms: number) => {
    const p = parts(ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };
  const today = parts(now);
  for (let day = 0; day < 3; day++) {
    const wall = Date.UTC(today.year, today.month - 1, today.day + day, hh, mm);
    let at = wall - offset(wall);
    at = wall - offset(at);
    if (at > now) return at;
  }
  return now + 24 * 3600e3;
}
