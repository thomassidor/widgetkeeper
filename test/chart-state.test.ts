/* A chart widget's windows (lib/chartState.ts, SparklineService.getWindows()): the logs each is read from, and what comes back. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeDevice, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import { chartStates, parseChartRequests } from '../lib/chartState.js';
import SparklineService, { MAX_POINTS } from '../lib/SparklineService.js';
import ValueService from '../lib/ValueService.js';

vi.mock('homey-api', () => homeyApiMock);

// Tuesday 6 October 2026, 14:00 in Copenhagen (UTC+2).
const NOW = Date.parse('2026-10-06T12:00:00Z');
const HOUR = 3600e3;
const local = (iso: string) => new Date(iso).getTime(); // the tests run in Europe/Copenhagen

const sensor = () => fakeDevice({
  id: 'sensor', name: 'Stue', zone: 'z1',
  caps: { measure_humidity: { type: 'number', value: 48, title: 'Humidity', units: '%', insights: true } },
});

/** One entry a minute over the last 24 hours, rising 0.01 a minute from 20. */
function entries() {
  const values = [];
  for (let i = 24 * 60; i > 0; i--) values.push({ t: new Date(NOW - i * 60e3).toISOString(), v: 20 + (24 * 60 - i) / 100 });
  return { values };
}

function setup(logEntries: (args: any) => unknown = entries) {
  const api = fakeApi({ devices: [sensor()], zones: { z1: { name: 'Living room' } }, logEntries });
  const homey = fakeHomey(api);
  const service = new SparklineService(homey, new ValueService(homey, () => {}), () => {});
  const app: any = { sparklines: service };
  const resolutions = () => api.insights.getLogEntries.mock.calls.map((c: any[]) => c[0].resolution);
  return { api, service, app, resolutions };
}

const slot = 'sensor:measure_humidity';
const ask = (from: number, end: number, unit = '', use = false) => `${slot}~x~${from}~${end}~${unit}${use ? '~use' : ''}`;

beforeEach(() => { vi.useFakeTimers({ now: NOW }); });
afterEach(() => { vi.useRealTimers(); });

describe('parseChartRequests', () => {
  it('reads each window, its calendar unit and use', () => {
    expect(parseChartRequests('a:x~24h~100~200~,b:y~thisMonth~50~300~month~use')).toEqual([
      { slot: 'a:x', span: '24h', from: 100, end: 200, unit: null, use: false, window: true },
      { slot: 'b:y', span: 'thisMonth', from: 50, end: 300, unit: 'month', use: true, window: true },
    ]);
  });

  it('reads a request for more points (Chart · Min/Max)', () => {
    expect(parseChartRequests('a:x~1mo!~100~200~month~fine')).toEqual([
      { slot: 'a:x', span: '1mo!', from: 100, end: 200, unit: 'month', use: false, fine: true, window: true },
    ]);
  });

  it("takes a page's older request (a span without a window) as Sparklines' span", () => {
    expect(parseChartRequests('a:x~7d')).toEqual([{ slot: 'a:x', span: '7d', window: false }]);
    expect(parseChartRequests('a:x~7d~300~100~')).toEqual([{ slot: 'a:x', span: '7d', window: false }]); // ends before it starts
  });
});

describe('getWindows', () => {
  it("returns Device Values' state with each window's history, in order, missing slots marked", async () => {
    const { app } = setup();
    const state = await chartStates(app, parseChartRequests(`${ask(NOW - 24 * HOUR, NOW)},nope:measure_power~x~1~2~,bad~x~1~2~`));
    expect(state).toHaveLength(3);
    expect(state[0]).toMatchObject({ deviceId: 'sensor', capabilityId: 'measure_humidity', name: 'Stue', value: 48 });
    expect((state[0] as any).points).toHaveLength(MAX_POINTS);
    expect((state[0] as any).points[0][1]).toBeCloseTo(20.055, 2);
    expect(state[1]).toEqual({ deviceId: 'nope', capabilityId: 'measure_power', missing: true });
    expect(state[2]).toMatchObject({ missing: true });
  });

  it('reads each window from the logs that hold it', async () => {
    const { app, resolutions } = setup();
    await chartStates(app, parseChartRequests([
      ask(NOW - 24 * HOUR, NOW),
      ask(local('2026-10-06T00:00'), NOW, 'day'), // today
      ask(local('2026-09-28T00:00'), local('2026-10-05T00:00'), 'week'), // last week
      ask(local('2026-10-05T00:00'), NOW, 'day'), // two days from midnight: today's log again, with yesterday's
    ].join(',')));
    expect(resolutions()).toEqual(['last24Hours', 'today', 'lastWeek', 'yesterday']);
  });

  it('keeps up to 400 points with fine, no bucket under the log step', async () => {
    const { app } = setup();
    const [s] = await chartStates(app, parseChartRequests(`${slot}~x~${NOW - 24 * HOUR}~${NOW}~~fine`)) as any[];
    expect(s.points).toHaveLength(24 * 12); // 5-minute steps
  });

  it('gives a running total with use', async () => {
    // A monthly utility meter, 6-hour steps: 10 kWh a step up to 80, then reset at the month's start.
    const start = Date.parse('2026-09-30T18:00:00Z');
    const vs = [50, 60, 70, 80, 5, 15];
    const { app } = setup(() => ({ values: vs.map((v, i) => ({ t: new Date(start + i * 6 * HOUR).toISOString(), v })), step: 6 * HOUR }));
    const [use] = await chartStates(app, parseChartRequests(ask(local('2026-10-01T00:00'), NOW, 'month', true))) as any[];
    expect(use.points).toEqual(vs.map((_, i) => [start + i * 6 * HOUR + 3 * HOUR, [50, 60, 70, 80, 85, 95][i]]));
    expect(use.meter).toEqual({ offset: 80, high: 15 });
  });

  it("keeps a finished period's log until the next period, and reads a running one again after 5 minutes", async () => {
    const { app, resolutions } = setup();
    // As a widget asks: the windows worked out anew each time.
    const both = () => parseChartRequests(`${ask(local('2026-09-28T00:00'), local('2026-10-05T00:00'), 'week')},${ask(Date.now() - 24 * HOUR, Date.now())}`);
    await chartStates(app, both());
    vi.advanceTimersByTime(6 * 60e3);
    await chartStates(app, both());
    expect(resolutions()).toEqual(['lastWeek', 'last24Hours', 'last24Hours']);
  });

  it('shows the value without a history when a log is unavailable, and asks again after 30 s when Homey was busy', async () => {
    let busy = true;
    const { app, resolutions } = setup(() => {
      if (busy) throw Object.assign(new Error('Too many requests.'), { statusCode: 429 });
      return entries();
    });
    const req = parseChartRequests(ask(NOW - 24 * HOUR, NOW));
    expect((await chartStates(app, req))[0]).toMatchObject({ value: 48, points: [] });
    busy = false;
    await chartStates(app, req);
    expect(resolutions()).toHaveLength(1);
    vi.advanceTimersByTime(30e3 + 1);
    expect((await chartStates(app, req) as any)[0].points.length).toBeGreaterThan(0);
    expect(resolutions()).toHaveLength(2);
  });

  it('says the step of the logs it read, so a widget knows 6-hour averages', async () => {
    const { app } = setup();
    const [day, month] = await chartStates(app, parseChartRequests(`${ask(NOW - 24 * HOUR, NOW)},${ask(local('2026-10-01T00:00'), NOW, 'month')}`)) as any[];
    expect(day.step).toBe(5 * 60e3);
    expect(month.step).toBe(6 * HOUR);
    // A rolling 8 days is read from last31Days: 6-hour averages too, though it isn't a month.
    const [eight] = await chartStates(app, parseChartRequests(ask(NOW - 8 * 24 * HOUR, NOW))) as any[];
    expect(eight.step).toBe(6 * HOUR);
  });

  it('makes up no points past where the logs end', async () => {
    // This month's log ends at the last finished 6 hours: 06:00Z, 6 hours before now.
    const logEnd = Date.parse('2026-10-06T06:00:00Z');
    const start = Date.parse('2026-09-30T18:00:00Z');
    const values: { t: string, v: number }[] = [];
    for (let t = start; t < logEnd; t += 6 * HOUR) values.push({ t: new Date(t).toISOString(), v: 20 });
    const { app } = setup(() => ({ values, step: 6 * HOUR, end: new Date(logEnd).toISOString() }));
    const [s] = await chartStates(app, parseChartRequests(ask(local('2026-10-01T00:00'), NOW, 'month'))) as any[];
    expect(s.points.at(-1)[0]).toBeLessThan(logEnd);
  });

  it("asks again after 5 minutes for a finished period's log that failed, not when the next period starts", async () => {
    let missing = true;
    const { app, resolutions } = setup(() => {
      if (missing) throw Object.assign(new Error('Not Found: LogLocal'), { statusCode: 404 });
      return entries();
    });
    const req = () => parseChartRequests(ask(local('2026-09-28T00:00'), local('2026-10-05T00:00'), 'week'));
    await chartStates(app, req());
    missing = false;
    vi.advanceTimersByTime(60e3);
    await chartStates(app, req());
    expect(resolutions()).toHaveLength(1); // kept a while, so a value without a log isn't asked for on every request
    vi.advanceTimersByTime(5 * 60e3);
    await chartStates(app, req());
    expect(resolutions()).toHaveLength(2);
  });

  it("answers a page's older request as Sparklines did", async () => {
    const { app, resolutions } = setup();
    const [s] = await chartStates(app, parseChartRequests(`${slot}~7d`)) as any[];
    expect(s).toMatchObject({ value: 48 });
    expect(resolutions()).toEqual(['last7Days']);
  });
});
