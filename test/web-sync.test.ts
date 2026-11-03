import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeHomey, homeyApiMock, keyApis, memoryStorage } from './helpers/fakeHomey.js';
import PersonalApiKey, { API_KEY_SETTING } from '../lib/PersonalApiKey.js';
import Secrets from '../lib/secrets.js';
import TileNameService from '../lib/TileNameService.js';
import WebDashboardService, { MAX_WIDGETS, WEB_ENABLED_SETTING } from '../lib/WebDashboardService.js';
import WebSyncService, { nextLocalTime, WEB_SYNC_EVENT, WEB_SYNC_SCHEDULE_SETTING } from '../lib/WebSyncService.js';

vi.mock('homey-api', () => homeyApiMock);

// A web dashboard synced with a Homey dashboard through the stored key (lib/WebSyncService.ts, .claude/rules/web-sync.md).
const manifest = JSON.parse(readFileSync('app.json', 'utf8'));
const APP = manifest.id;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const ours = (id: string, type: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  ({ id, title: '', titleHidden: true, type: 'app_webview', data: { appWidgetId: `homey:app:${APP}:${type}`, settings: {}, deviceIds: [], ...data }, ...extra });

function setup({ scopes = ['homey'], dashboards = {} as Record<string, any> } = {}) {
  const homey = fakeHomey(fakeApi({}));
  homey.manifest = { ...homey.manifest, id: APP, widgets: manifest.widgets };
  homey.settings.set(WEB_ENABLED_SETTING, true);
  const store = new Map<string, any>(Object.entries(JSON.parse(JSON.stringify(dashboards))));
  let made = 100;
  const dash = {
    getDashboards: vi.fn(async () => Object.fromEntries(store)),
    getDashboard: vi.fn(async ({ id }: { id: string }) => {
      if (!store.has(id)) throw Object.assign(new Error('Not Found: Dashboard'), { statusCode: 404 });
      return JSON.parse(JSON.stringify(store.get(id)));
    }),
    updateDashboard: vi.fn(async ({ id, dashboard }: { id: string, dashboard: any }) => {
      if (!scopes.includes('homey') && !scopes.includes('homey.dashboard')) throw new Error('Missing Scopes: homey.dashboard');
      store.set(id, { ...JSON.parse(JSON.stringify(dashboard)), id });
      return store.get(id);
    }),
    createDashboard: vi.fn(async ({ dashboard }: { dashboard: any }) => {
      const id = uuid(made++);
      store.set(id, { ...dashboard, id });
      return store.get(id);
    }),
  };
  keyApis.set('key', { sessions: { getSessionMe: async () => ({ scopes }) }, dashboards: dash });
  Secrets.for(homey).set(API_KEY_SETTING, 'key');
  const tileNames = new TileNameService(homey);
  const web = new WebDashboardService(homey, vi.fn(), {}, tileNames);
  const files = new Map<string, ReturnType<typeof memoryStorage>>();
  const storage = memoryStorage();
  let n = 1;
  const make = () => new WebSyncService(
    homey, { web, tileNames, key: PersonalApiKey.for(homey, vi.fn()) }, vi.fn(), vi.fn(), storage,
    id => files.get(id) ?? files.set(id, memoryStorage()).get(id)!, () => uuid(n++),
  );
  return { homey, web, tileNames, store, dash, files, storage, sync: make(), make };
}

afterEach(() => { keyApis.clear(); vi.useRealTimers(); });

const kitchen = () => ({
  id: 'h1', name: 'Kitchen',
  columns: [
    { id: 'c1', widgets: [
      { id: 'native', type: 'device', title: 'Lamp', data: { deviceId: 'd9' } },
      ours('w1', 'weather', { settings: { density: 'detailed', rows: '2' } }),
    ] },
    { id: 'c2', widgets: [ours('w2', 'lights', { deviceIds: ['d1', 'd2'] }, { title: 'Lamps', titleHidden: false })] },
  ],
});

const flat = (d: any) => d.columns.map((c: any) => (c.widgets ?? c).map((w: any) => w.id));

describe('linking a web dashboard to a Homey dashboard', () => {
  it("copies the Homey dashboard over at the start, without Homey's own widgets, with tile names", async () => {
    const { web, sync, store, tileNames } = setup({ dashboards: { h1: kitchen() } });
    tileNames.set('w2', 'd1', 'Ceiling');
    web.save({ id: 'web1', name: 'Mine', theme: 'dark', columns: [[{ id: 'x', type: 'clock', title: '', settings: {}, deviceIds: [] }]] });
    const { lastSync } = await sync.link('web1', { homeyId: 'h1', start: 'homey' });
    expect(lastSync).toMatchObject({ ok: true, conflicts: [] });
    const d = web.list().find(x => x.id === 'web1')!;
    expect(d).toMatchObject({ name: 'Kitchen', theme: 'dark' });
    expect(flat(d)).toEqual([['w1'], ['w2']]);
    expect(d.columns[0][0].settings).toMatchObject({ density: 'detailed', rows: '2' });
    expect(d.columns[1][0]).toMatchObject({ title: 'Lamps', deviceIds: ['d1', 'd2'] });
    expect(tileNames.get('web-web1-w2').names).toEqual({ d1: 'Ceiling' });
    expect(flat(store.get('h1'))).toEqual([['native', 'w1'], ['w2']]);
  });

  it('makes a new Homey dashboard from the web dashboard, with UUIDs for its widgets', async () => {
    const { web, sync, store, dash } = setup();
    web.save({ id: 'web1', name: 'Hall', columns: [[{ id: 'a', type: 'clock', title: 'Time', settings: {}, deviceIds: [] }], []] });
    await sync.link('web1', { homeyId: 'new' });
    const made = [...store.values()][0];
    expect(made.name).toBe('Hall');
    expect(made.columns).toHaveLength(2);
    expect(made.columns[0].widgets[0]).toMatchObject({
      type: 'app_webview', title: 'Time', titleHidden: false, data: { appWidgetId: `homey:app:${APP}:clock` },
    });
    expect(made.columns[0].widgets[0].id).toMatch(/^[0-9a-f-]{36}$/);
    // Nothing changed since: the second sync writes nothing.
    dash.updateDashboard.mockClear();
    expect(await sync.sync('web1')).toMatchObject({ ok: true });
    expect(dash.updateDashboard).not.toHaveBeenCalled();
  });

  it('refuses a Homey dashboard another web dashboard syncs with', async () => {
    const { web, sync } = setup({ dashboards: { h1: kitchen() } });
    web.save({ id: 'a', name: 'A', columns: [[]] });
    web.save({ id: 'b', name: 'B', columns: [[]] });
    await sync.link('a', { homeyId: 'h1' });
    await expect(sync.link('b', { homeyId: 'h1' })).rejects.toThrow(/another web dashboard/);
  });
});

describe('syncing', () => {
  async function linked() {
    const s = setup({ dashboards: { h1: kitchen() } });
    s.web.save({ id: 'web1', name: '', columns: [[]] });
    await s.sync.link('web1', { homeyId: 'h1', start: 'homey' });
    return s;
  }

  it('takes changes both ways and keeps what only one side holds', async () => {
    const { web, sync, store, homey } = await linked();
    const d = web.list()[0];
    d.columns[0][0].settings.rows = '1';
    d.columns[0].push({ id: 'new', type: 'clock', title: '', settings: {}, deviceIds: [] } as any);
    web.save({ ...d, background: 'ocean' });
    const h = store.get('h1');
    h.columns[1].widgets[0].title = 'Lights';
    store.set('h1', h);
    homey.api.realtime.mockClear();

    const result = await sync.sync('web1');
    expect(result.changes!.homey).toMatchObject({ added: 1, updated: 1 });
    expect(result.changes!.web).toMatchObject({ updated: 1 });
    const after = store.get('h1');
    expect(flat(after)).toEqual([['native', 'w1', expect.stringMatching(/^0{8}-/)], ['w2']]);
    expect(after.columns[0].widgets[1].data.settings.rows).toBe('1');
    expect(after.columns[0].widgets[0]).toEqual({ id: 'native', type: 'device', title: 'Lamp', data: { deviceId: 'd9' } });
    expect(web.list()[0]).toMatchObject({ background: 'ocean' });
    expect(web.list()[0].columns[1][0].title).toBe('Lights');
    expect(homey.api.realtime).toHaveBeenCalledWith(WEB_SYNC_EVENT, expect.objectContaining({ id: 'web1' }));
  });

  it('deletes a widget deleted on one side from the other', async () => {
    const { web, sync, store } = await linked();
    const d = web.list()[0];
    d.columns[1] = [];
    web.save(d);
    await sync.sync('web1');
    expect(flat(store.get('h1'))).toEqual([['native', 'w1'], []]);
  });

  it('syncs renamed tiles between the two instances', async () => {
    const { sync, tileNames } = await linked();
    tileNames.set('w2', 'd2', 'Floor');
    await sync.sync('web1');
    expect(tileNames.get('web-web1-w2').names).toEqual({ d2: 'Floor' });
    tileNames.set('web-web1-w2', 'd2', 'Standing');
    await sync.sync('web1');
    expect(tileNames.get('w2').names).toEqual({ d2: 'Standing' });
  });

  it('backs both sides up before writing', async () => {
    const { sync, files } = await linked();
    await sync.sync('web1');
    const backup = JSON.parse(files.get('web1')!.text!);
    expect(backup.homey.id).toBe('h1');
    expect(backup.web.id).toBe('web1');
  });

  it("says why it couldn't: the Homey dashboard gone, no key, a key that may not", async () => {
    const { sync, store, homey } = await linked();
    store.delete('h1');
    expect(await sync.sync('web1')).toMatchObject({ ok: false, reason: 'homeyGone' });
    Secrets.for(homey).unset(API_KEY_SETTING);
    expect(await sync.sync('web1')).toMatchObject({ ok: false, reason: 'noKey' });
    expect(sync.status().web1.lastSync).toMatchObject({ ok: false, reason: 'noKey' });

    const narrow = setup({ scopes: ['homey.dashboard.readonly'], dashboards: { h1: kitchen() } });
    narrow.web.save({ id: 'web1', name: '', columns: [[]] });
    expect((await narrow.sync.link('web1', { homeyId: 'h1' })).lastSync).toMatchObject({ ok: false, reason: 'keyScope' });
  });

  it('refuses more widgets than a web dashboard holds, writing nothing', async () => {
    const big = kitchen();
    big.columns[1].widgets = Array.from({ length: MAX_WIDGETS }, (_, i) => ours(`m${i}`, 'clock'));
    const { web, sync, dash } = setup({ dashboards: { h1: big } });
    web.save({ id: 'web1', name: '', columns: [[]] });
    expect((await sync.link('web1', { homeyId: 'h1', start: 'homey' })).lastSync).toMatchObject({ ok: false, reason: 'tooMany' });
    expect(dash.updateDashboard).not.toHaveBeenCalled();
    expect(web.list()[0].columns.flat()).toEqual([]);
  });

  it('skips a sync newer than ifOlderMs (opening a dashboard)', async () => {
    const { sync, dash } = await linked();
    dash.getDashboard.mockClear();
    await sync.sync('web1', { ifOlderMs: 600e3 });
    expect(dash.getDashboard).not.toHaveBeenCalled();
  });

  it('keeps its links over a restart, and forgets one on unlink', async () => {
    const { sync, make, store, web } = await linked();
    sync.stop();
    const again = make();
    expect(again.status().web1).toMatchObject({ homeyId: 'h1', prefer: 'homey' });
    const d = web.list()[0];
    d.columns[0][0].settings.density = 'compact';
    web.save(d);
    await again.sync('web1');
    expect(store.get('h1').columns[0].widgets[1].data.settings.density).toBe('compact');
    expect(again.unlink('web1')).toEqual({ removed: true });
    expect(again.status()).toEqual({});
  });
});

describe('the nightly sync', () => {
  it('finds the next local time, across a DST change', () => {
    const tz = 'Europe/Copenhagen';
    expect(new Date(nextLocalTime('03:00', tz, Date.parse('2026-11-03T12:00:00Z'))).toISOString()).toBe('2026-11-04T02:00:00.000Z');
    expect(new Date(nextLocalTime('03:00', tz, Date.parse('2026-07-01T00:30:00Z'))).toISOString()).toBe('2026-07-01T01:00:00.000Z');
    // The night clocks go back (25 October 2026): 03:00 is after it, in winter time.
    expect(new Date(nextLocalTime('03:00', tz, Date.parse('2026-10-24T12:00:00Z'))).toISOString()).toBe('2026-10-25T02:00:00.000Z');
    // The night clocks go forward (29 March 2026): 02:30 doesn't exist and comes an hour later.
    expect(new Date(nextLocalTime('02:30', tz, Date.parse('2026-03-28T12:00:00Z'))).toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('syncs every link at the time, then plans the next night', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-03T12:00:00Z') });
    const { web, sync, dash, homey } = setup({ dashboards: { h1: kitchen() } });
    web.save({ id: 'web1', name: '', columns: [[]] });
    await sync.link('web1', { homeyId: 'h1', start: 'homey' });
    sync.start();
    dash.getDashboard.mockClear();
    await vi.advanceTimersByTimeAsync(13 * 3600e3);
    expect(dash.getDashboard).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2 * 3600e3); // 03:00 local
    expect(dash.getDashboard).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 3600e3);
    expect(dash.getDashboard).toHaveBeenCalledTimes(2);

    expect(sync.setSchedule({ nightly: false, time: '25:00' })).toEqual({ nightly: false, time: '03:00' });
    expect(homey.settings.get(WEB_SYNC_SCHEDULE_SETTING)).toEqual({ nightly: false, time: '03:00' });
    await vi.advanceTimersByTimeAsync(48 * 3600e3);
    expect(dash.getDashboard).toHaveBeenCalledTimes(2);
    sync.stop();
  });
});
