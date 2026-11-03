import { describe, expect, it } from 'vitest';
import {
  hasChanges, homeyView, mergeViews, putBack, toHomey, toWeb, webView,
  type HomeyDashboard, type SyncView, type SyncWidget, type WebSyncDashboard,
} from '../lib/dashboardSync.js';

// A web dashboard synced with a Homey dashboard (lib/dashboardSync.ts, .claude/rules/web-sync.md).
const APP = 'com.example.app';
const SETTINGS: Record<string, string[]> = { weather: ['density', 'rows'], lights: ['palette'], shortcuts: [] };
const opts = { appId: APP, settingIds: (t: string) => SETTINGS[t] ?? null, keyOf: (id: string) => id };

const w = (type: string, settings: Record<string, unknown> = {}, title = '', deviceIds: string[] = []): SyncWidget =>
  ({ type, title, settings, deviceIds });
const view = (columns: string[][], widgets: Record<string, SyncWidget>, name = 'Home'): SyncView => ({ name, columns, widgets });
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const base = view([['a', 'b'], ['c']], {
  a: w('weather', { density: 'compact', rows: 3 }),
  b: w('lights', { palette: 'warm' }, 'Lamps', ['d1']),
  c: w('weather', { density: 'detailed', rows: 5 }),
});
const both = () => ({ web: copy(base), homey: copy(base) });

describe('merging a web dashboard with a Homey dashboard', () => {
  it('changes nothing when neither side changed', () => {
    const r = mergeViews(both(), copy(base), copy(base), 'homey');
    expect(r.web).toEqual(base);
    expect(r.homey).toEqual(base);
    expect(hasChanges(r.changes.web) || hasChanges(r.changes.homey)).toBe(false);
    expect(r.conflicts).toEqual([]);
  });

  it("takes one side's changed setting, title, devices and name to the other", () => {
    const web = copy(base);
    web.widgets.a.settings.rows = 4;
    web.name = 'House';
    const homey = copy(base);
    homey.widgets.b.title = 'Living room';
    homey.widgets.b.deviceIds = ['d1', 'd2'];
    const r = mergeViews(both(), web, homey, 'homey');
    for (const side of [r.web, r.homey]) {
      expect(side.name).toBe('House');
      expect(side.widgets.a.settings.rows).toBe(4);
      expect(side.widgets.b).toEqual(w('lights', { palette: 'warm' }, 'Living room', ['d1', 'd2']));
    }
    expect(r.changes.web).toMatchObject({ updated: 1, renamed: false });
    expect(r.changes.homey).toMatchObject({ updated: 1, renamed: true });
    expect(r.conflicts).toEqual([]);
  });

  it('merges different settings of one widget changed on both sides without a conflict', () => {
    const web = copy(base);
    web.widgets.a.settings.rows = 4;
    const homey = copy(base);
    homey.widgets.a.settings.density = 'detailed';
    const r = mergeViews(both(), web, homey, 'web');
    expect(r.web.widgets.a.settings).toEqual({ density: 'detailed', rows: 4 });
    expect(r.homey.widgets.a.settings).toEqual({ density: 'detailed', rows: 4 });
    expect(r.conflicts).toEqual([]);
  });

  it('lets the preferred side win a setting changed differently on both, and says so', () => {
    const web = copy(base);
    web.widgets.a.settings.rows = 4;
    const homey = copy(base);
    homey.widgets.a.settings.rows = 6;
    expect(mergeViews(both(), web, homey, 'homey').homey.widgets.a.settings.rows).toBe(6);
    const r = mergeViews(both(), web, homey, 'web');
    expect(r.web.widgets.a.settings.rows).toBe(4);
    expect(r.homey.widgets.a.settings.rows).toBe(4);
    expect(r.conflicts).toEqual([{ key: 'a', field: 'settings.rows', kept: 'web' }]);
  });

  it("combines devices added and removed on both sides, in the preferred side's order", () => {
    const b = both();
    b.web.widgets.b.deviceIds = b.homey.widgets.b.deviceIds = ['d1', 'd2', 'd3'];
    const web = copy(b.web);
    web.widgets.b.deviceIds = ['d2', 'd1', 'd3', 'd4']; // reordered, d4 added
    const homey = copy(b.homey);
    homey.widgets.b.deviceIds = ['d1', 'd3', 'd5']; // d2 removed, d5 added
    const r = mergeViews(b, web, homey, 'web');
    expect(r.web.widgets.b.deviceIds).toEqual(['d1', 'd3', 'd4', 'd5']);
    expect(r.homey.widgets.b.deviceIds).toEqual(['d1', 'd3', 'd4', 'd5']);
    expect(r.conflicts).toEqual([]);
  });

  it('merges tile names per tile, like settings', () => {
    const b = both();
    b.web.widgets.b.tileNames = { d1: 'Lamp' };
    b.homey.widgets.b.tileNames = { d1: 'Lamp' };
    const web = copy(b.web);
    web.widgets.b.tileNames = { d1: 'Lamp', d2: 'Spot' };
    const homey = copy(b.homey);
    delete homey.widgets.b.tileNames;
    const r = mergeViews(b, web, homey, 'homey');
    expect(r.web.widgets.b.tileNames).toEqual({ d2: 'Spot' });
    expect(r.homey.widgets.b.tileNames).toEqual({ d2: 'Spot' });
  });

  it('is no conflict when both sides made the same change', () => {
    const web = copy(base);
    web.widgets.a.settings.rows = 4;
    const homey = copy(web);
    expect(mergeViews(both(), web, homey, 'homey').conflicts).toEqual([]);
  });

  it("leaves a field each side has its own way when neither changed it (one side's normalising)", () => {
    const b = both();
    b.web.widgets.a.settings.extra = null; // the web fills a default Homey's data lacks
    const web = copy(b.web);
    const homey = copy(b.homey);
    homey.widgets.c.title = 'Changed';
    const r = mergeViews(b, web, homey, 'homey');
    expect(r.web.widgets.a.settings).toHaveProperty('extra', null);
    expect(r.homey.widgets.a.settings).not.toHaveProperty('extra');
    expect(r.changes.homey).toMatchObject({ updated: 0 });
  });

  it('adds a widget added on either side to the other, after the same neighbour', () => {
    const web = copy(base);
    web.columns[0].splice(1, 0, 'n1');
    web.widgets.n1 = w('weather', { rows: 1 });
    const homey = copy(base);
    homey.columns[1].unshift('n2');
    homey.widgets.n2 = w('lights');
    const r = mergeViews(both(), web, homey, 'homey');
    for (const side of [r.web, r.homey]) {
      expect(side.columns).toEqual([['a', 'n1', 'b'], ['n2', 'c']]);
      expect(Object.keys(side.widgets).sort()).toEqual(['a', 'b', 'c', 'n1', 'n2']);
    }
    expect(r.changes.web).toMatchObject({ added: 1, moved: false });
    expect(r.changes.homey).toMatchObject({ added: 1, moved: false });
  });

  it('deletes a widget deleted on one side from the other', () => {
    const web = copy(base);
    web.columns[0] = ['a'];
    delete web.widgets.b;
    const r = mergeViews(both(), web, copy(base), 'homey');
    expect(r.homey.columns).toEqual([['a'], ['c']]);
    expect(r.homey.widgets).not.toHaveProperty('b');
    expect(r.changes.homey).toMatchObject({ removed: 1 });
  });

  it('keeps a widget deleted on one side but edited on the other since', () => {
    const web = copy(base);
    web.columns[0] = ['a'];
    delete web.widgets.b;
    const homey = copy(base);
    homey.widgets.b.settings.palette = 'cold';
    const r = mergeViews(both(), web, homey, 'web');
    expect(r.web.columns).toEqual([['a', 'b'], ['c']]);
    expect(r.web.widgets.b.settings.palette).toBe('cold');
    expect(r.changes.web).toMatchObject({ added: 1 });
  });

  it("takes the layout of the side that moved widgets, with the other side's additions", () => {
    const web = copy(base);
    web.columns = [['c', 'a'], ['b']];
    const homey = copy(base);
    homey.columns[1].push('n');
    homey.widgets.n = w('lights');
    const r = mergeViews(both(), web, homey, 'homey');
    expect(r.web.columns).toEqual([['c', 'a'], ['b', 'n']]);
    expect(r.homey.columns).toEqual([['c', 'a'], ['b', 'n']]);
    expect(r.conflicts).toEqual([]);
  });

  it('takes a changed number of columns', () => {
    const homey = copy(base);
    homey.columns = [['a', 'b', 'c']];
    const r = mergeViews(both(), copy(base), homey, 'web');
    expect(r.web.columns).toEqual([['a', 'b', 'c']]);
    expect(r.changes.web.moved).toBe(true);
  });

  it('takes the preferred layout when both sides moved widgets', () => {
    const web = copy(base);
    web.columns = [['b', 'a'], ['c']];
    const homey = copy(base);
    homey.columns = [['a'], ['b', 'c']];
    const r = mergeViews(both(), web, homey, 'web');
    expect(r.homey.columns).toEqual([['b', 'a'], ['c']]);
    expect(r.conflicts).toEqual([{ key: null, field: 'layout', kept: 'web' }]);
  });

  it('copies the start side over on the first sync', () => {
    const web = view([['x']], { x: w('lights') }, 'Web');
    const r = mergeViews(null, web, copy(base), 'homey', 'homey');
    expect(r.web).toEqual(base);
    expect(r.changes.web).toMatchObject({ added: 3, removed: 1, renamed: true });
    expect(r.changes.homey).toMatchObject({ added: 0, removed: 0, updated: 0, moved: false, renamed: false });
    const r2 = mergeViews(null, web, copy(base), 'homey', 'web');
    expect(r2.homey).toEqual(web);
  });
});

describe('putting back what only one side holds', () => {
  const id = (x: string) => x;
  it('after the item it followed, first, or at the end when that item went', () => {
    expect(putBack([['a', 'b'], ['c']], [
      { item: 'o1', column: 0, after: null },
      { item: 'o2', column: 0, after: 'a' },
      { item: 'o3', column: 1, after: 'gone' },
      { item: 'o4', column: 5, after: 'c' },
    ], id)).toEqual([['o1', 'a', 'o2', 'b'], ['c', 'o4', 'o3']]);
  });
});

describe('the web side', () => {
  const dash: WebSyncDashboard = {
    id: 'd1', name: 'Home', theme: 'dark', section: 's1',
    columns: [[
      { id: 'a', type: 'weather', title: '', settings: { rows: 3 }, deviceIds: [], span: 2, at: [0] },
      { id: 'sc', type: 'shortcuts', title: '', settings: {}, deviceIds: [] },
    ], [{ id: 'b', type: 'lights', title: 'Lamps', settings: { palette: 'warm' }, deviceIds: ['d1'] }]],
  };

  it('leaves Dashboard Shortcuts out and puts it back, keeping the web-only fields', () => {
    const { view: v, opaque } = webView(dash);
    expect(v.columns).toEqual([['a'], ['b']]);
    expect(Object.keys(v.widgets)).toEqual(['a', 'b']);
    v.widgets.a.settings.rows = 5;
    const out = toWeb(dash, v, opaque);
    expect(out).toMatchObject({ theme: 'dark', section: 's1' });
    expect(out.columns[0].map(x => x.id)).toEqual(['a', 'sc']);
    expect(out.columns[0][0]).toMatchObject({ span: 2, at: [0], settings: { rows: 5 } });
  });

  it('folds columns past the sixth into the sixth', () => {
    const v = view([['a'], [], [], [], [], ['b'], ['c']], { a: w('lights'), b: w('lights'), c: w('lights') });
    expect(toWeb({ id: 'd', name: '', columns: [] }, v, []).columns.map(c => c.map(x => x.id)))
      .toEqual([['a'], [], [], [], [], ['b', 'c']]);
  });
});

describe('the Homey side', () => {
  const app = (id: string, type: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
    ({ id, title: 'Shown', titleHidden: false, type: 'app_webview', data: { appWidgetId: `homey:app:${APP}:${type}`, ...data }, ...extra });
  const dash: HomeyDashboard = {
    id: 'h1', name: 'Home',
    columns: [
      { id: 'c1', widgets: [
        { id: 'own', type: 'device', title: 'Lamp' },
        app('w1', 'weather', { settings: { rows: 3, showNext: true } }, { titleHidden: true }),
      ] },
      { id: 'c2', widgets: [
        app('w2', 'lights', { settings: { palette: 'warm' }, deviceIds: ['d1'] }),
        { id: 'w3', type: 'app_webview', title: 'Other', data: { appWidgetId: 'homey:app:other.app:thing', settings: { x: 1 } } },
        app('w4', 'gone'),
      ] },
    ],
  };

  it("reads our widgets and other apps', leaving Homey's own and unknown types out", () => {
    const { view: v, opaque } = homeyView(dash, opts);
    expect(v.columns).toEqual([['w1'], ['w2', 'w3']]);
    expect(v.widgets.w1).toEqual(w('weather', { rows: 3 }));
    expect(v.widgets.w2).toEqual(w('lights', { palette: 'warm' }, 'Shown', ['d1']));
    expect(v.widgets.w3).toEqual(w('homey:app:other.app:thing', { x: 1 }, 'Other'));
    expect(opaque.map(o => [o.item.id, o.column, o.after])).toEqual([['own', 0, null], ['w4', 1, 'w3']]);
  });

  it("writes back keeping Homey's own widgets, column ids, a hidden title's text and removed settings", () => {
    const { view: v, opaque } = homeyView(dash, opts);
    v.widgets.w1.settings.rows = 4;
    v.widgets.w2.title = '';
    v.columns[1].push('new');
    v.widgets.new = w('lights', { palette: 'cold' }, 'New');
    const out = toHomey(dash, v, opaque, opts, k => (k === 'new' ? 'uuid-new' : k), () => 'col-new');
    expect(Object.keys(out)).toEqual(['id', 'name', 'columns']);
    expect(out.columns!.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(out.columns!.map(c => c.widgets!.map(x => x.id))).toEqual([['own', 'w1'], ['w2', 'w3', 'w4', 'uuid-new']]);
    const [w1] = out.columns![0].widgets!.slice(1);
    expect(w1).toMatchObject({ title: 'Shown', titleHidden: true, data: { settings: { rows: 4, showNext: true } } });
    expect(out.columns![1].widgets![0]).toMatchObject({ title: 'Shown', titleHidden: true });
    expect(out.columns![1].widgets![3]).toEqual({
      id: 'uuid-new', type: 'app_webview', title: 'New', titleHidden: false, titleModified: true,
      data: { appWidgetId: `homey:app:${APP}:lights`, settings: { palette: 'cold' }, deviceIds: [] },
    });
  });
});
