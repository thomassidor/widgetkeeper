/**
 * Syncing a web dashboard with a Homey dashboard, both ways (`.claude/rules/web-sync.md`). Pure: no Homey here, so the
 * merge is tested on its own (`test/dashboard-sync.test.ts`); `WebSyncService` reads, writes and keeps the bases.
 *
 * Both sides are seen as a `SyncView`: the name, columns of widget keys and the widgets' synced fields. A widget's key is
 * its web id (a widget that came from Homey keeps its Homey id as its web id: a UUID fits the web's id pattern); the link's
 * `idMap` gives each key's Homey widget id. What only one side can hold (Homey's own widgets, the web's Dashboard
 * Shortcuts) is left out of the view and put back where it was (`Opaque`).
 *
 * The merge is three-way, against what each side looked like after the last sync (its own base, so each side's own
 * normalising never reads as a change): a field changed on one side goes to both; changed on both to different values
 * is a conflict, and the link's preferred side wins; changed on neither stays as each side has it. A widget deleted on
 * one side goes from both, unless it was edited on the other since (then it comes back). A widget added on one side is
 * added to the other.
 */

export type SyncSideName = 'web' | 'homey';

/**
 * One widget's synced fields: its type (ours, or another app's `homey:app:<appId>:<widgetId>`), title ('' hidden), and
 * its tile names (Rename tiles, by tile key; filled in by `WebSyncService`, not part of either dashboard), merged per tile.
 */
export type SyncWidget = {
  type: string, title: string, settings: Record<string, unknown>, deviceIds: string[], tileNames?: Record<string, string>,
};

export type SyncView = { name: string, columns: string[][], widgets: Record<string, SyncWidget> };

/** What one side had that the other can't hold: put back in its column, after the item it followed (null: first). */
export type Opaque<T> = { item: T, column: number, after: string | null };

export type SyncConflict = { key: string | null, field: string, kept: SyncSideName };

/** What a merge changes on one side. */
export type SyncChanges = { added: number, removed: number, updated: number, moved: boolean, renamed: boolean };

export type MergeResult = {
  web: SyncView,
  homey: SyncView,
  conflicts: SyncConflict[],
  changes: { web: SyncChanges, homey: SyncChanges },
};

const MAX_WEB_COLUMNS = 6;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Merges the two sides against their bases (`base` null: the first sync, where `start` is copied to the other side as
 * it is). `prefer` wins a conflict.
 */
export function mergeViews(
  base: { web: SyncView, homey: SyncView } | null,
  web: SyncView,
  homey: SyncView,
  prefer: SyncSideName,
  start: SyncSideName = prefer,
): MergeResult {
  if (!base) {
    const from = start === 'web' ? web : homey;
    const out = { web: clone(from), homey: clone(from) };
    return { ...out, conflicts: [], changes: { web: changesOf(web, out.web), homey: changesOf(homey, out.homey) } };
  }
  const conflicts: SyncConflict[] = [];
  const cur = { web, homey };
  const pick = <V>(field: string, key: string | null, w: V, h: V, bw: V, bh: V): { web: V, homey: V } => {
    const webChanged = !same(w, bw);
    const homeyChanged = !same(h, bh);
    if (webChanged && !homeyChanged) return { web: w, homey: w };
    if (homeyChanged && !webChanged) return { web: h, homey: h };
    if (webChanged && homeyChanged && !same(w, h)) {
      conflicts.push({ key, field, kept: prefer });
      const v = prefer === 'web' ? w : h;
      return { web: v, homey: v };
    }
    return { web: w, homey: h };
  };

  const name = pick('name', null, web.name, homey.name, base.web.name, base.homey.name);

  // Which widgets stay: on both; added on one; deleted on one unless the other edited it since.
  const keys = new Set([...Object.keys(web.widgets), ...Object.keys(homey.widgets)]);
  const kept = new Set<string>();
  for (const key of keys) {
    const onWeb = key in web.widgets;
    const onHomey = key in homey.widgets;
    if (onWeb && onHomey) { kept.add(key); continue; }
    const [has, lacks]: [SyncSideName, SyncSideName] = onWeb ? ['web', 'homey'] : ['homey', 'web'];
    const deleted = key in base[lacks].widgets;
    const edited = !same(cur[has].widgets[key], base[has].widgets[key]);
    if (!deleted || edited) kept.add(key);
  }

  const out: { web: SyncView, homey: SyncView } = {
    web: { name: name.web, columns: [], widgets: {} },
    homey: { name: name.homey, columns: [], widgets: {} },
  };
  for (const key of kept) {
    const w = web.widgets[key];
    const h = homey.widgets[key];
    if (!w || !h) {
      const only = clone((w ?? h)!);
      out.web.widgets[key] = only;
      out.homey.widgets[key] = clone(only);
      continue;
    }
    const bw = base.web.widgets[key] ?? w;
    const bh = base.homey.widgets[key] ?? h;
    const title = pick('title', key, w.title, h.title, bw.title, bh.title);
    const deviceIds = mergeDevices(w.deviceIds, h.deviceIds, bw.deviceIds, bh.deviceIds, prefer);
    const settings = { web: {} as Record<string, unknown>, homey: {} as Record<string, unknown> };
    const ids = new Set([...Object.keys(w.settings), ...Object.keys(h.settings)]);
    for (const id of ids) {
      const v = pick(`settings.${id}`, key, w.settings[id], h.settings[id], bw.settings[id], bh.settings[id]);
      if (v.web !== undefined) settings.web[id] = clone(v.web);
      if (v.homey !== undefined) settings.homey[id] = clone(v.homey);
    }
    const names = { web: {} as Record<string, string>, homey: {} as Record<string, string> };
    const [wn, hn, bwn, bhn] = [w.tileNames ?? {}, h.tileNames ?? {}, bw.tileNames ?? {}, bh.tileNames ?? {}];
    for (const tile of new Set([...Object.keys(wn), ...Object.keys(hn), ...Object.keys(bwn), ...Object.keys(bhn)])) {
      const v = pick(`tileNames.${tile}`, key, wn[tile], hn[tile], bwn[tile], bhn[tile]);
      if (v.web !== undefined) names.web[tile] = v.web;
      if (v.homey !== undefined) names.homey[tile] = v.homey;
    }
    const withNames = (n: Record<string, string>) => (Object.keys(n).length ? { tileNames: n } : {});
    out.web.widgets[key] = { type: w.type, title: title.web, settings: settings.web, deviceIds: [...deviceIds.web], ...withNames(names.web) };
    out.homey.widgets[key] = { type: h.type, title: title.homey, settings: settings.homey, deviceIds: [...deviceIds.homey], ...withNames(names.homey) };
  }

  // The layout: from the side that moved widgets around (both: the preferred one's); neither, each keeps its own.
  const webMoved = moved(base.web, web);
  const homeyMoved = moved(base.homey, homey);
  let source: { web: SyncView, homey: SyncView };
  if (webMoved && homeyMoved && !same(web.columns, homey.columns)) {
    conflicts.push({ key: null, field: 'layout', kept: prefer });
    const v = prefer === 'web' ? web : homey;
    source = { web: v, homey: v };
  } else if (webMoved) source = { web, homey: web };
  else if (homeyMoved) source = { web: homey, homey };
  else source = { web, homey };
  for (const side of ['web', 'homey'] as const) {
    out[side].columns = placeMissing(source[side].columns.map(col => col.filter(k => kept.has(k))), kept, [source[side], web, homey]);
  }

  return { ...out, conflicts, changes: { web: changesOf(web, out.web), homey: changesOf(homey, out.homey) } };
}

/**
 * A widget's devices: changed on one side, that side's list; on both, the preferred side's list with the other side's
 * additions (at the end) and without its removals. Never a conflict.
 */
function mergeDevices(w: string[], h: string[], bw: string[], bh: string[], prefer: SyncSideName): { web: string[], homey: string[] } {
  const webChanged = !same(w, bw);
  const homeyChanged = !same(h, bh);
  if (!webChanged && !homeyChanged) return { web: w, homey: h };
  if (!homeyChanged) return { web: w, homey: w };
  if (!webChanged) return { web: h, homey: h };
  const [mine, other, otherBase] = prefer === 'web' ? [w, h, bh] : [h, w, bw];
  const removed = new Set(otherBase.filter(id => !other.includes(id)));
  const added = other.filter(id => !otherBase.includes(id));
  const list = [...new Set([...mine.filter(id => !removed.has(id)), ...added])];
  return { web: list, homey: list };
}

/** Whether a side moved its widgets (or changed its columns) since its base, its additions and deletions aside. */
function moved(base: SyncView, now: SyncView): boolean {
  if (base.columns.length !== now.columns.length) return true;
  const common = (k: string) => k in base.widgets && k in now.widgets;
  return !same(base.columns.map(c => c.filter(common)), now.columns.map(c => c.filter(common)));
}

/**
 * The kept widgets a layout lacks, put in from the side that has them: the same column (or the last), after the nearest
 * widget before them there that the layout has; first if they were first, else last (their neighbours moved away).
 */
function placeMissing(columns: string[][], kept: Set<string>, from: SyncView[]): string[][] {
  const out = columns.length ? columns.map(c => [...c]) : [[]];
  const placed = new Set(out.flat());
  for (const view of from) {
    view.columns.forEach((col, c) => col.forEach((key, i) => {
      if (!kept.has(key) || placed.has(key)) return;
      const target = out[Math.min(c, out.length - 1)];
      let at = i ? target.length : 0;
      for (let j = i - 1; j >= 0; j--) {
        const k = target.indexOf(col[j]);
        if (k >= 0) { at = k + 1; break; }
      }
      target.splice(at, 0, key);
      placed.add(key);
    }));
  }
  return out;
}

function changesOf(before: SyncView, after: SyncView): SyncChanges {
  const was = before.widgets;
  const is = after.widgets;
  const added = Object.keys(is).filter(k => !(k in was)).length;
  const removed = Object.keys(was).filter(k => !(k in is)).length;
  const updated = Object.keys(is).filter(k => k in was && !same(was[k], is[k])).length;
  const common = (k: string) => k in was && k in is;
  const movedNow = before.columns.length !== after.columns.length
    || !same(before.columns.map(c => c.filter(common)), after.columns.map(c => c.filter(common)));
  return { added, removed, updated, moved: movedNow, renamed: before.name !== after.name };
}

export function hasChanges(c: SyncChanges): boolean {
  return c.added > 0 || c.removed > 0 || c.updated > 0 || c.moved || c.renamed;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Puts the opaque items back, each in its column (or the last) after the item it followed, else first. */
export function putBack<T>(columns: T[][], opaque: Opaque<T>[], idOf: (item: T) => string): T[][] {
  const out = columns.length ? columns.map(c => [...c]) : [[]];
  for (const { item, column, after } of opaque) {
    const target = out[Math.min(column, out.length - 1)];
    const i = after === null ? -1 : target.findIndex(x => idOf(x) === after);
    if (after !== null && i < 0) target.push(item);
    else target.splice(i + 1, 0, item);
  }
  return out;
}

/** Splits columns into the synced items and the opaque ones (with where they were). */
function split<T, K>(columns: T[][], idOf: (item: T) => string, synced: (item: T) => K | null) {
  const opaque: Opaque<T>[] = [];
  const kept: { item: T, key: K }[][] = columns.map((col, c) => {
    const keptCol: { item: T, key: K }[] = [];
    col.forEach((item, i) => {
      const key = synced(item);
      if (key === null) opaque.push({ item, column: c, after: i ? idOf(col[i - 1]) : null });
      else keptCol.push({ item, key });
    });
    return keptCol;
  });
  return { kept, opaque };
}

// ── The web side ──────────────────────────────────────────────────────────────────────────────────────────────────

/** A web dashboard's widget as kept (`WebWidget` in `WebDashboardService.ts`). */
export type WebSyncWidget = {
  id: string, type: string, title: string, settings: Record<string, unknown>, deviceIds: string[], [extra: string]: unknown,
};
export type WebSyncDashboard = { id: string, name: string, columns: WebSyncWidget[][], [extra: string]: unknown };

/** Widgets only the web dashboards have (`deprecated` in their manifest, so Homey's own Add widget leaves them out). */
export const WEB_ONLY_TYPES = new Set(['shortcuts']);

export function webView(d: WebSyncDashboard): { view: SyncView, opaque: Opaque<WebSyncWidget>[] } {
  const { kept, opaque } = split(d.columns, w => w.id, w => (WEB_ONLY_TYPES.has(w.type) ? null : w.id));
  const widgets: Record<string, SyncWidget> = {};
  for (const { item } of kept.flat()) {
    widgets[item.id] = { type: item.type, title: item.title, settings: clone(item.settings ?? {}), deviceIds: [...(item.deviceIds ?? [])] };
  }
  return { view: { name: d.name, columns: kept.map(c => c.map(x => x.key)), widgets }, opaque };
}

/**
 * The web dashboard after a merge: its own choices (theme, backdrop, section, code …) and each widget's web-only fields
 * (`span`, `trusted` …) kept, at most six columns (the rest folded into the sixth), the opaque widgets put back.
 */
export function toWeb(d: WebSyncDashboard, view: SyncView, opaque: Opaque<WebSyncWidget>[]): WebSyncDashboard {
  const before = new Map(d.columns.flat().map(w => [w.id, w]));
  const widget = (key: string): WebSyncWidget => {
    const w = view.widgets[key];
    return { ...(before.get(key) ?? {}), id: key, type: w.type, title: w.title, settings: clone(w.settings), deviceIds: [...w.deviceIds] };
  };
  let columns = view.columns.map(c => c.map(widget));
  if (columns.length > MAX_WEB_COLUMNS) {
    columns = [...columns.slice(0, MAX_WEB_COLUMNS - 1), columns.slice(MAX_WEB_COLUMNS - 1).flat()];
  }
  return { ...d, name: view.name, columns: putBack(columns, opaque, w => w.id) };
}

// ── The Homey side ────────────────────────────────────────────────────────────────────────────────────────────────

export type HomeyWidget = {
  id: string, type?: string, title?: string, titleHidden?: boolean, data?: Record<string, any>, [extra: string]: unknown,
};
export type HomeyDashboard = { id: string, name?: string, columns?: { id: string, widgets?: HomeyWidget[] }[], [extra: string]: unknown };

export type HomeySyncOptions = {
  appId: string,
  /** Our widget types' setting ids (the manifest's); null for a type this app doesn't have (left alone). */
  settingIds: (type: string) => string[] | null,
  /** A Homey widget id's key (`idMap` the other way round); a widget not linked yet keeps its Homey id. */
  keyOf: (homeyId: string) => string,
};

/** Our widget type, another app's `homey:app:…` id, or null for what can't be on a web dashboard. */
export function homeyType(w: HomeyWidget, o: Pick<HomeySyncOptions, 'appId' | 'settingIds'>): string | null {
  const appWidgetId = w.type === 'app_webview' && typeof w.data?.appWidgetId === 'string' ? w.data.appWidgetId as string : null;
  if (!appWidgetId) return null;
  const own = `homey:app:${o.appId}:`;
  if (!appWidgetId.startsWith(own)) return /^homey:app:[^:]+:[^:]+$/.test(appWidgetId) ? appWidgetId : null;
  const type = appWidgetId.slice(own.length);
  return o.settingIds(type) && !WEB_ONLY_TYPES.has(type) ? type : null;
}

/** A Homey widget's synced settings: only the manifest's ids for ours (a removed one stays in Homey's data). */
function homeySettings(type: string, settings: Record<string, unknown>, o: Pick<HomeySyncOptions, 'settingIds'>) {
  const ids = type.startsWith('homey:app:') ? null : o.settingIds(type);
  return clone(ids ? Object.fromEntries(Object.entries(settings).filter(([k]) => ids.includes(k))) : settings);
}

export function homeyView(d: HomeyDashboard, o: HomeySyncOptions): { view: SyncView, opaque: Opaque<HomeyWidget>[] } {
  const columns = (d.columns ?? []).map(c => c.widgets ?? []);
  const { kept, opaque } = split(columns, w => String(w.id), w => (homeyType(w, o) === null ? null : o.keyOf(String(w.id))));
  const widgets: Record<string, SyncWidget> = {};
  for (const { item, key } of kept.flat()) {
    const type = homeyType(item, o)!;
    const data = item.data ?? {};
    widgets[key] = {
      type,
      title: item.titleHidden ? '' : String(item.title ?? '').trim(),
      settings: homeySettings(type, data.settings && typeof data.settings === 'object' ? data.settings : {}, o),
      deviceIds: Array.isArray(data.deviceIds) ? data.deviceIds.map(String) : [],
    };
  }
  return { view: { name: String(d.name ?? ''), columns: kept.map(c => c.map(x => x.key)), widgets }, opaque };
}

/**
 * The Homey dashboard after a merge (the body for `updateDashboard`): its columns' ids kept by place, each widget's
 * fields Homey keeps that we don't sync kept (a hidden title's text, our settings no longer in the manifest), Homey's
 * own widgets put back. `homeyIdOf` gives a key's Homey id (a new one for a widget from the web), `newId` a column's.
 */
export function toHomey(
  d: HomeyDashboard, view: SyncView, opaque: Opaque<HomeyWidget>[], o: HomeySyncOptions,
  homeyIdOf: (key: string) => string, newId: () => string,
): HomeyDashboard {
  const before = new Map((d.columns ?? []).flatMap(c => c.widgets ?? []).map(w => [String(w.id), w]));
  const widget = (key: string): HomeyWidget => {
    const w = view.widgets[key];
    const id = homeyIdOf(key);
    const old = before.get(id);
    const ours = !w.type.startsWith('homey:app:');
    const oldSettings = old?.data?.settings && typeof old.data.settings === 'object' ? old.data.settings : {};
    const ids = ours ? o.settingIds(w.type) ?? [] : [];
    const leftOver = ours ? Object.fromEntries(Object.entries(oldSettings).filter(([k]) => !ids.includes(k))) : {};
    return {
      ...(old ?? {}),
      id,
      type: 'app_webview',
      title: w.title || (old?.title ?? ''),
      titleHidden: !w.title,
      ...(w.title && w.title !== old?.title ? { titleModified: true } : {}),
      data: {
        ...(old?.data ?? {}),
        appWidgetId: ours ? `homey:app:${o.appId}:${w.type}` : w.type,
        settings: { ...leftOver, ...clone(w.settings) },
        deviceIds: [...w.deviceIds],
      },
    };
  };
  const widgets = putBack(view.columns.map(c => c.map(widget)), opaque, w => String(w.id));
  const columnIds = (d.columns ?? []).map(c => c.id);
  return { id: d.id, name: view.name, columns: widgets.map((list, i) => ({ id: columnIds[i] ?? newId(), widgets: list })) };
}
