// @vitest-environment happy-dom
/* Chart · Compare (widgets/compare): one value across devices, a row each, sorted, with its range over the span. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMount, loadWidget } from './helpers/loadWidget.js';

const MIN = 60e3;
const HOUR = 60 * MIN;
const NOW = new Date('2026-10-28T15:30:00').getTime(); // Europe/Copenhagen (vitest.config.ts)
const MIDNIGHT = new Date('2026-10-28T00:00:00').getTime();

let win: any;
beforeAll(() => { win = loadWidget('compare'); loadMount('compare'); });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.body.innerHTML = '';
});
afterEach(() => { vi.useRealTimers(); });

const cap = { title: 'Temperature', type: 'number', units: '°C', decimals: 1, min: null, max: null, values: null, icon: null };
/** A room's temperature today: from `lo` at midnight up to `hi` at noon, then down to `now`'s value; a point an hour. */
function room(id: string, name: string, lo: number, hi: number, now: number) {
  const points: [number, number][] = [];
  for (let t = MIDNIGHT; t < NOW; t += HOUR) {
    const h = (t - MIDNIGHT) / HOUR;
    points.push([t, h <= 12 ? lo + (hi - lo) * h / 12 : hi - (hi - now) * (h - 12) / 3.5]);
  }
  return { deviceId: id, capabilityId: 'measure_temperature', name, capability: cap, value: now, points };
}
const rooms = () => [room('k', 'Kitchen', 19.8, 23.4, 21.4), room('b', 'Bathroom', 21.8, 24.6, 23.5), room('h', 'Hall', 17.1, 19.2, 18.3)];

function widget(opts: Record<string, unknown>, state: any[]) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createCompareWidget(root, { locale: 'en-GB', language: 'en', now: () => Date.now(), count: state.length, ...opts });
  w.setState(state);
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const header = () => all('.ew-hcol').map(c => `${c.querySelector('.ew-hval')!.textContent} | ${c.querySelector('.ew-hsub')!.textContent}`);
  const names = () => all('svg text.cp-name').map(t => t.textContent);
  const nums = () => all('svg text.cp-num').map(t => t.textContent);
  /** A tap on row `k` (rows start under the 36 px chip row, 26 px each). */
  const tap = (k: number) => q('svg')!.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: 36 + 26 * (k + 0.5), pointerType: 'mouse' }));
  return { w, root, q, all, header, names, nums, tap };
}

describe('the rows', () => {
  it('puts a row per value, highest first, each with its range today and its value now', () => {
    const r = widget({}, rooms());
    expect(r.names()).toEqual(['Bathroom', 'Kitchen', 'Hall']);
    expect(r.nums()).toEqual(['23,5°C', '21,4°C', '18,3°C']); // the kit's number format
    expect(r.all('rect.cp-range')).toHaveLength(3);
    expect(r.all('circle.cp-dot')).toHaveLength(3);
    expect(r.header()).toEqual(['23,5°C | Highest · Bathroom', '18,3°C | Lowest · Hall']);
    expect(r.all('.ew-chip').map(c => c.textContent)).toEqual(['Temperature – °C', 'Range']);
  });

  it('sorts lowest first or keeps the order picked, and leaves the ranges out when asked', () => {
    expect(widget({ sort: 'low' }, rooms()).names()).toEqual(['Hall', 'Kitchen', 'Bathroom']);
    expect(widget({ sort: 'listed' }, rooms()).names()).toEqual(['Kitchen', 'Bathroom', 'Hall']);
    expect(widget({ showRange: false }, rooms()).all('rect.cp-range')).toHaveLength(0);
  });

  it("shows a tapped row's value and its range", () => {
    const r = widget({}, rooms());
    r.tap(1);
    expect(r.header()).toEqual(['21,4°C | Kitchen', '19,8–23,4°C | Range']);
    expect(r.q('circle.dot-core')).not.toBeNull();
  });

  it("names one device's values by their capability, and a gone one Unavailable, last", () => {
    const one = [room('d', 'Sensor', 1, 2, 1.5), { ...room('d', 'Sensor', 40, 60, 50), capabilityId: 'measure_humidity', capability: { ...cap, title: 'Humidity', units: '%' } }];
    expect(widget({}, one).names()).toEqual(['Humidity', 'Temperature']);
    const gone = widget({}, [{ deviceId: 'x', capabilityId: 'measure_temperature', missing: true }, ...rooms()]);
    expect(gone.names()).toEqual(['Bathroom', 'Kitchen', 'Hall', 'Unavailable']);
  });
});

describe('the requests and messages', () => {
  it('asks for every value over today', () => {
    const t = win.WidgetkeeperKit.timeSpan('1d!', NOW);
    expect(widget({}, rooms()).w.windows()).toEqual(Array(3).fill(`1d!~${t.from}~${t.end}~day`));
  });

  it('mounts with the values picked, leaving empty ones out, and asks without one', async () => {
    const ask = async (settings: object) => {
      const api = vi.fn(async () => ({ charts: rooms(), language: 'en' }));
      const Homey = { getSettings: () => settings, api, on: () => {}, ready: () => {}, setHeight: () => {}, __: (k: string) => k };
      const root = document.createElement('div');
      document.body.append(root);
      win.mountCompareWidget(Homey, { root, frame: root });
      await vi.advanceTimersByTimeAsync(0);
      return { url: api.mock.calls.length ? decodeURIComponent((api.mock.calls[0] as any)[1]) : null, root };
    };
    expect((await ask({ slot1: { id: 'k:measure_temperature' }, slot3: { id: 'h:measure_temperature' } })).url)
      .toMatch(/^\/state\?charts=k:measure_temperature~1d!~\d+~\d+~day,h:measure_temperature~1d!~\d+~\d+~day(&|$)/);
    const none = await ask({});
    expect(none.url).toBeNull();
    expect(none.root.textContent).toContain('Pick the values to compare in the widget settings.');
  });
});
