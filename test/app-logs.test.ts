import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import SparklineService from '../lib/SparklineService.js';
import ValueService from '../lib/ValueService.js';
import { describeAppLogs, findLog, isAppLog, listAppLogs, listLogSlots, logSlot, logUnits, parseLogSlot } from '../lib/appLogs.js';

vi.mock('homey-api', () => homeyApiMock);

// As read on the Homey (2026-11-03, lib/appLogs.ts), shortened ids.
const LOGS = [
  { id: 'homey:device:d1:measure_power', ownerUri: 'homey:device:d1', ownerId: 'd1', ownerName: 'Meter', type: 'number', title: 'Power', units: 'W', decimals: 2, lastValue: 400 },
  { id: 'homey:app:net.i-dev.betterlogic:Fj.Forbrug1dag', ownerUri: 'homey:app:net.i-dev.betterlogic', ownerId: 'Fj.Forbrug1dag', ownerName: null, type: 'number', title: 'Fj.Forbrug1dag', units: '', decimals: 2, lastValue: 12.5 },
  { id: 'homey:app:net.i-dev.betterlogic:Alarm', ownerUri: 'homey:app:net.i-dev.betterlogic', ownerId: 'Alarm', ownerName: null, type: 'boolean', title: 'Alarm', units: null, decimals: null, lastValue: false },
  { id: 'homey:manager:logic:d32c551a', ownerUri: 'homey:manager:logic', ownerId: 'd32c551a', ownerName: 'Logic', type: 'number', title: 'Test Var 2', units: null, decimals: 2, lastValue: 239.02 },
  { id: 'homey:manager:apps:net.i-dev.betterlogic-cpu', ownerUri: 'homey:manager:apps', ownerId: 'net.i-dev.betterlogic-cpu', ownerName: 'Apps', type: 'number', title: 'Better Logic Library — CPU', units: '%', decimals: 2, lastValue: 0 },
  { id: 'homey:manager:weather:temperature', ownerUri: 'homey:manager:weather', ownerId: 'weather', ownerName: 'Weather', type: 'number', title: 'Temperature', units: '°C', decimals: 1, lastValue: 8 },
];

const APPS = { 'net.i-dev.betterlogic': { id: 'net.i-dev.betterlogic', name: 'Better Logic Library' } };

/** The fake API with the installed apps (an app's log has no `ownerName`), or a failing `getApps()`. */
function api(apps: unknown = APPS) {
  const a = fakeApi({ logs: LOGS as any });
  (a as any).apps = { getApps: vi.fn(async () => { if (!apps) throw new Error('Missing Scopes'); return apps; }) };
  return a;
}

describe('app logs', () => {
  it("lists apps' own logs, not devices', Logic variables' (the user's choice), Homey's apps' CPU and RAM or weather", async () => {
    const homey = fakeHomey(api());
    expect(LOGS.map(isAppLog)).toEqual([false, true, true, false, false, false]);
    expect(await listAppLogs(homey)).toEqual([
      expect.objectContaining({ title: 'Alarm', type: 'boolean' }),
      { id: LOGS[1].id, ownerUri: LOGS[1].ownerUri, ownerId: 'Fj.Forbrug1dag', ownerName: 'Better Logic Library', type: 'number', title: 'Fj.Forbrug1dag', units: null, decimals: 2, lastValue: 12.5 },
    ]);
  });

  it('reads every log and app once a minute, however many ask', async () => {
    const a = api();
    const homey = fakeHomey(a);
    await Promise.all([listAppLogs(homey), listAppLogs(homey), describeAppLogs(homey)]);
    expect(a.insights.getLogs).toHaveBeenCalledTimes(1);
    expect((a as any).apps.getApps).toHaveBeenCalledTimes(1);
  });

  it("leaves an app's log unnamed when the apps can't be read", async () => {
    const logs = await listAppLogs(fakeHomey(api(null)));
    expect(logs.map(l => l.ownerName)).toEqual([null, null]);
  });

  it('describes the owners for Diagnostics, devices counted together', async () => {
    const d = await describeAppLogs(fakeHomey(api()));
    expect(d.total).toBe(6);
    expect(d.owners).toEqual({ 'homey:device:…': 1, 'homey:app:net.i-dev.betterlogic': 2, 'homey:manager:logic': 1, 'homey:manager:apps': 1, 'homey:manager:weather': 1 });
    expect(d.apps).toHaveLength(2);
    expect(d.sample).toBe(LOGS[1]);
  });
});

describe('app log slots', () => {
  it('round-trips any name, the request separators and colons included, as an id free of them', () => {
    for (const name of ['Fj.Forbrug1dag', 'a,b~c', 'x:y', 'Øl 50%', 'Ä/ö?#&=']) {
      const slot = logSlot(`homey:app:net.i-dev.betterlogic:${name}`)!;
      expect(slot).toMatch(/^log:net\.i-dev\.betterlogic:[A-Za-z0-9_-]+$/);
      expect(parseLogSlot(slot)).toEqual({
        appId: 'net.i-dev.betterlogic', uri: 'homey:app:net.i-dev.betterlogic', logId: `homey:app:net.i-dev.betterlogic:${name}`,
        deviceId: 'log:net.i-dev.betterlogic', capabilityId: slot.split(':')[2],
      });
    }
    for (const id of ['homey:manager:logic:d32c551a', 'homey:device:d1:measure_power', 'homey:app:x', 'homey:app:x:']) expect(logSlot(id)).toBeNull();
    for (const slot of ['d1:measure_power', 'log:x', 'log:x:', 'log:x:a=b', 'log:x:a+b', 'log:x:y:z']) expect(parseLogSlot(slot)).toBeNull();
  });

  it("Better Logic's `Value` isn't shown as units", () => {
    expect(['Value', ' value ', '', null, 'kWh'].map(logUnits)).toEqual([null, null, null, null, 'kWh']);
  });

  it('lists the logged numbers as `App · Title`, by the query', async () => {
    const homey = fakeHomey(api());
    const slot = logSlot(LOGS[1].id)!;
    expect(await listLogSlots(homey, '')).toEqual([{ name: 'Better Logic Library · Fj.Forbrug1dag', image: expect.stringMatching(/^data:image\/png/), id: slot }]);
    expect(await listLogSlots(homey, 'forbrug')).toHaveLength(1);
    expect(await listLogSlots(homey, 'better')).toHaveLength(1);
    expect(await listLogSlots(homey, 'nothing')).toEqual([]);
    expect(await findLog(homey, slot)).toMatchObject({ title: 'Fj.Forbrug1dag' });
    expect(await findLog(homey, logSlot('homey:app:net.i-dev.betterlogic:Gone')!)).toBeNull();
  });
});

describe("an app's log in a chart", () => {
  const NOW = Date.parse('2026-11-03T12:00:00Z');
  beforeEach(() => { vi.useFakeTimers({ now: NOW }); });
  afterEach(() => { vi.useRealTimers(); });

  function setup() {
    const a = api();
    // Hourly values over the last day, as Better Logic's log reads; anything else Not Found, as Homey answers.
    a.insights.getLogEntries.mockImplementation(async (args: any) => {
      if (args.id !== LOGS[1].id) throw new Error(`Not Found: LogLocal with ID ${args.id}`);
      const values = Array.from({ length: 24 }, (_, i) => ({ t: new Date(NOW - (24 - i) * 3600e3).toISOString(), v: i }));
      return { values, step: 3600e3, start: values[0].t, end: new Date(NOW).toISOString() };
    });
    const homey = fakeHomey(a);
    const values = new ValueService(homey, () => {});
    return { a, values, sparklines: new SparklineService(homey, values, () => {}) };
  }

  it("is offered after the devices' values, but not where booleans are picked", async () => {
    const { sparklines } = setup();
    const slot = logSlot(LOGS[1].id)!;
    expect((await sparklines.listSlots('', 'number')).map(i => i.id)).toEqual(['none', slot]);
    expect((await sparklines.listSlots('', 'counter')).map(i => i.id)).toContain(slot);
    expect((await sparklines.listSlots('', 'boolean')).map(i => i.id)).toEqual(['none']);
  });

  it('a failed log list leaves the devices', async () => {
    const { a, sparklines } = setup();
    a.insights.getLogs.mockRejectedValue(new Error('Missing Scopes'));
    expect((await sparklines.listSlots('', 'number')).map(i => i.id)).toEqual(['none']);
  });

  it('has the app as its device, the title, units and last value, and its history from its own log', async () => {
    const { a, sparklines } = setup();
    const slot = logSlot(LOGS[1].id)!;
    const [s] = await sparklines.getWindows([{ slot, from: NOW - 24 * 3600e3, end: NOW }]);
    expect(s).toMatchObject({
      deviceId: 'log:net.i-dev.betterlogic', capabilityId: slot.split(':')[2], name: 'Better Logic Library',
      capability: { title: 'Fj.Forbrug1dag', type: 'number', units: null, decimals: 2, icon: null }, value: 12.5,
    });
    expect(`${s.deviceId}:${s.capabilityId}`).toBe(slot);
    expect((s as any).points.length).toBeGreaterThan(10);
    expect(a.insights.getLogEntries).toHaveBeenCalledWith(expect.objectContaining({ uri: 'homey:app:net.i-dev.betterlogic', id: LOGS[1].id }));
  });

  it('a deleted variable, or a boolean, is missing', async () => {
    const { values } = setup();
    const gone = logSlot('homey:app:net.i-dev.betterlogic:Gone')!;
    const alarm = logSlot(LOGS[2].id)!;
    expect(await values.getState([gone, alarm])).toEqual([
      { deviceId: 'log:net.i-dev.betterlogic', capabilityId: gone.split(':')[2], missing: true },
      { deviceId: 'log:net.i-dev.betterlogic', capabilityId: alarm.split(':')[2], missing: true },
    ]);
  });
});
