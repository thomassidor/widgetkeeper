// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeDevice, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import { loadWidget } from './helpers/loadWidget.js';
import CombinedService from '../lib/CombinedService.js';
import QuickActionService from '../lib/QuickActionService.js';
import ValueMatrixService from '../lib/ValueMatrixService.js';

vi.mock('homey-api', () => homeyApiMock);

/** A device Homey calls unavailable: its values are only the last it reported. */
const offline = <T extends object>(d: T) => Object.assign(d, { available: false });

let win: any;
beforeAll(() => {
  for (const id of ['values', 'sparklines', 'quickactions', 'sensoralarms', 'sensordots', 'roomhealth', 'valuematrix', 'valueboard', 'lights', 'lightrooms', 'curtains', 'locks', 'thermostat'] as const) win = loadWidget(id);
});
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

const rootEl = () => document.body.appendChild(document.createElement('div'));
const dimmed = (root: Element) => root.querySelectorAll('.wk-offline').length;
const marks = (root: Element) => root.querySelectorAll('.wk-offline-badge').length;

describe('the services', () => {
  // A new service that tracks devices for a widget says whether it shows them unavailable, or here why it doesn't.
  const NOT_SHOWN: Record<string, string> = {
    'ElectricityService.ts': 'a meter, whose history stays good; the live number stops by itself',
    'MediaService.ts': 'not done yet: a speaker has its own states',
  };

  it('every service that tracks devices for a widget says so', () => {
    const tracked = readdirSync('lib').filter(f => f.endsWith('Service.ts') && readFileSync(`lib/${f}`, 'utf8').includes('new DeviceTracker'));
    expect(tracked.length).toBeGreaterThan(5);
    expect(Object.keys(NOT_SHOWN).filter(f => !tracked.includes(f))).toEqual([]);
    for (const f of tracked) {
      if (!NOT_SHOWN[f]) expect(readFileSync(`lib/${f}`, 'utf8'), f).toContain('offlineFlag(');
    }
  });

  const lamp = () => fakeDevice({ id: 'lamp', name: 'Lamp', caps: { onoff: { type: 'boolean', value: false } }, ui: { quickAction: 'onoff' } });

  it('says it only of an unavailable device, on the first read and on later ones', async () => {
    const device = lamp();
    const service = new QuickActionService(fakeHomey(fakeApi({ devices: [device] })), () => {});
    expect((await service.getState(['lamp']))[0]).not.toHaveProperty('offline');
    offline(device);
    expect((await service.getState(['lamp']))[0]).toMatchObject({ id: 'lamp', name: 'Lamp', offline: true });
    Object.assign(device, { available: true });
    expect((await service.getState(['lamp']))[0]).not.toHaveProperty('offline');
    service.stop();
  });

  it('Combined Value leaves an unavailable device out of the sum or average, as one it could not read', async () => {
    const T = 'measure_temperature';
    const sensor = (id: string, value: number) => fakeDevice({ id, name: id, zone: 'z', caps: { [T]: { type: 'number', value, units: '°C' } } });
    const api = fakeApi({ devices: [sensor('a', 20), offline(sensor('b', 99))], zones: { z: { name: 'Up' } } });
    const homey = fakeHomey(api);
    const service = new CombinedService(homey, new ValueMatrixService(homey, () => {}), () => {});
    expect((await service.getState(T, ['a', 'b'])).devices).toEqual([{ id: 'a', name: 'a', value: 20 }, { id: 'b', missing: true }]);
  });
});

describe('the widgets', () => {
  const value = { deviceId: 'd', capabilityId: 'measure_temperature', name: 'Hall', capability: { title: 'Temperature', type: 'number', units: '°C', decimals: 1 }, value: 21.5 };

  it('Device Values dims the tile and keeps its last value', () => {
    const root = rootEl();
    win.createValuesWidget(root, {}).setState([{ ...value, offline: true }, { ...value, deviceId: 'e' }]);
    expect(dimmed(root)).toBe(1);
    expect(marks(root)).toBe(1);
    expect(root.querySelector('.wk-offline')!.textContent).toContain('21.5');
  });

  it("Device Values and Sparklines keep a gone device's picked name, and say Unavailable without one", () => {
    for (const create of ['createValuesWidget', 'createSparklinesWidget']) {
      const root = rootEl();
      const gone = { deviceId: 'd', capabilityId: 'measure_temperature', missing: true };
      win[create](root, { labels: { 'd:measure_temperature': 'Hall · Temperature' }, span: '24h' }).setState([gone, { ...gone, deviceId: 'x' }]);
      const text = root.textContent!;
      expect(text).toContain('Hall · Temperature');
      expect(text).toContain('Unavailable');
      expect(marks(root)).toBe(2);
    }
  });

  it('Quick Actions marks the tile', () => {
    const root = rootEl();
    win.createQuickActionsWidget(root, {}).setState([{ id: 'a', name: 'Lamp', icon: null, quickAction: null, offline: true }]);
    expect(marks(root)).toBe(1);
  });

  const alarm = (value: boolean) => ({ capabilityId: 'alarm_smoke', title: 'Smoke', value, state: false, lastUpdated: null });

  it('Sensor Alarms says Unavailable, not No alarm, but keeps an alarm it last saw', () => {
    const root = rootEl();
    const w = win.createSensorAlarmsWidget(root, {});
    w.setState([{ id: 'a', name: 'Hall', icon: null, alarms: [alarm(false)], offline: true }]);
    expect(root.textContent).toContain('Unavailable');
    expect(root.textContent).not.toContain('No alarm');
    expect(marks(root)).toBe(1);
    w.setState([{ id: 'a', name: 'Hall', icon: null, alarms: [alarm(true)], offline: true }]);
    expect(root.textContent).toContain('Smoke');
  });

  it('Activity Dots draws the ring of a missing device, the name kept', () => {
    const root = rootEl();
    win.createSensorDotsWidget(root, {}).setState({ devices: [{ id: 'a', name: 'Hall', icon: null, alarms: [{ capabilityId: 'alarm_motion', title: 'Motion', value: false, lastUpdated: null }], offline: true }], language: 'en' });
    const dot = root.querySelector<HTMLElement>('[data-level]')!;
    expect(dot.dataset.level).toBe('missing');
    expect(dot.getAttribute('aria-label')).toBe('Hall: Unavailable');
  });

  it('Room Health and Value Matrix leave an unavailable device out of the average, and mark a room with only those', () => {
    const zone = { id: 'z', name: 'Bedroom' };
    const reading = (id: string, v: number, more = {}) => ({ id, name: id, zone, measures: { temperature: { capabilityId: 'measure_temperature', value: v } }, ...more });
    const rooms = win.roomHealthRooms([reading('a', 20), reading('b', 99, { offline: true })]);
    expect(rooms[0].values.temperature).toBe(20);
    expect(rooms[0].offline).toBe(false);
    const all = win.roomHealthRooms([reading('a', 20, { offline: true })]);
    expect(all[0].values.temperature).toBeNull();
    expect(all[0].offline).toBe(true);
    const root = rootEl();
    win.createRoomHealthWidget(root, {}).setState([reading('a', 20, { offline: true })]);
    expect(marks(root)).toBe(1);

    const row = (id: string, v: number, more = {}) => ({ id, name: id, zone, values: { t: v }, ...more });
    expect(win.valueMatrixRows([row('a', 20), row('b', 99, { offline: true })], 'rooms')[0].values.t).toBe(20);
    expect(win.valueMatrixRows([row('a', 20, { offline: true })], 'devices')[0]).toMatchObject({ offline: true, values: { t: null } });
  });

  it('Value Board marks an unavailable device among others, and says so in the name of a group of only those', () => {
    const zone = { id: 'z', name: 'Bedroom' };
    const v = { capabilityId: 'measure_temperature', title: 'Temperature', type: 'number', units: '°C', decimals: 1, min: null, max: null, values: null, value: 20 };
    const root = rootEl();
    const w = win.createValueBoardWidget(root, {});
    w.setState([{ id: 'a', name: 'A', zone, values: [v] }, { id: 'b', name: 'B', zone, values: [v], offline: true }]);
    expect(dimmed(root)).toBe(1);
    expect(marks(root)).toBe(1);
    expect(root.querySelector('.vb-head')!.textContent).toBe('Bedroom');
    w.setState([{ id: 'b', name: 'B', zone, values: [v], offline: true }]);
    expect(root.querySelector('.vb-head')!.textContent).toBe('Bedroom · Unavailable');
    expect(marks(root)).toBe(0);
    expect(dimmed(root)).toBe(1);
  });

  const cap = (value: unknown) => ({ value, setable: true });

  it('Light Controls and Curtains mark a tile once all of it is unavailable', () => {
    const zone = { id: 'z', name: 'Kitchen' };
    const light = (id: string, more = {}) => ({ id, name: id, icon: null, zone, caps: { onoff: cap(false) }, ...more });
    let root = rootEl();
    win.createLightsWidget(root, { groupByZone: true }).setState([light('a'), light('b', { offline: true })]);
    expect(marks(root)).toBe(0);
    root = rootEl();
    win.createLightsWidget(root, { groupByZone: true }).setState([light('a', { offline: true }), light('b', { offline: true })]);
    expect(marks(root)).toBe(1);
    root = rootEl();
    win.createCurtainsWidget(root, {}).setState([{ id: 'c', name: 'c', kind: 'curtain', zone: null, caps: { windowcoverings_set: cap(0.5) }, offline: true }]);
    expect(marks(root)).toBe(1);
  });

  it('Locks never says All locked while a lock is unavailable, and one last seen open stays open', () => {
    const lock = (id: string, locked: boolean, more = {}) => ({ id, name: id, icon: null, caps: { locked: { value: locked, setable: true, lastUpdated: 0 } }, ...more });
    expect(win.lockLevel(lock('a', true))).toBe('secure');
    expect(win.lockLevel(lock('a', true, { offline: true }))).toBe('unknown');
    expect(win.lockLevel(lock('a', false, { offline: true }))).toBe('insecure');
    const root = rootEl();
    win.createLocksWidget(root, { view: 'list' }).setState({ devices: [lock('Front', true), lock('Back', true, { offline: true })], language: 'en' });
    expect(root.textContent).not.toContain('All locked');
    expect(root.textContent).toContain('Unavailable');
    expect(marks(root)).toBe(1);
  });

  it('Thermostat Presets marks the widget, and takes it back', () => {
    const root = rootEl();
    const w = win.createThermostatWidget(root, {});
    const state = { name: 'Aircon', icon: null, values: {}, caps: {} };
    w.setState({ ...state, offline: true });
    expect(root.classList.contains('wk-offline')).toBe(true);
    w.setState(state);
    expect(root.classList.contains('wk-offline')).toBe(false);
  });
});
