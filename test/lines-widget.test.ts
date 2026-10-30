// @vitest-environment happy-dom
/* Chart · Lines (widgets/lines): up to six values over time on one chart, a line each. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMount, loadWidget } from './helpers/loadWidget.js';

const MIN = 60e3;
const HOUR = 60 * MIN;
const NOW = new Date('2026-10-28T15:30:00').getTime(); // Europe/Copenhagen (vitest.config.ts)
const FROM = NOW - 24 * HOUR;
const YESTERDAY = new Date('2026-10-27T00:00:00').getTime();

/** A number as the kit writes it in the machine's locale (`21.5` or `21,5`). */
const n = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

let win: any;
beforeAll(() => { win = loadWidget('lines'); loadMount('lines'); });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.body.innerHTML = '';
});
afterEach(() => { vi.useRealTimers(); });

const cap = (title: string, units: string, decimals = 1) => ({ title, type: 'number', units, decimals, min: null, max: null, values: null, icon: null });
/** Hourly points over `[from, from + 24 h)`, each `value(k)` for the k-th hour. */
const hourly = (from: number, value: (k: number) => number) => Array.from({ length: 24 }, (_, k) => [from + (k + 0.5) * HOUR, value(k)] as [number, number]);
const room = (id: string, name: string, value: (k: number) => number, now: number, from = FROM) => (
  { deviceId: id, capabilityId: 'measure_temperature', name, capability: cap('Temperature', '°C'), value: now, points: hourly(from, value) });
const kitchen = (from?: number) => room('k', 'Kitchen', () => 21, 21.5, from);
const bedroom = (from?: number) => room('b', 'Bedroom', k => 18 + k / 23, 19, from);
const office = (from?: number) => room('o', 'Office', () => 23, 23, from);

function widget(opts: Record<string, unknown>, state: any[]) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createLinesWidget(root, { locale: 'en-GB', language: 'en', now: () => Date.now(), count: state.length, ...opts });
  w.setState(state);
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const header = () => all('.ew-hcol').map(c => `${c.querySelector('.ew-hval')!.textContent} | ${c.querySelector('.ew-hsub')!.textContent}`);
  const chips = () => all('.ew-chip').map(c => c.textContent);
  const labels = () => all('svg text').map(t => t.textContent);
  return { w, root, q, all, header, chips, labels };
}

describe('the lines', () => {
  it('draws a line per value in its colour, a dot on each latest, and the first two values now at the top', () => {
    const r = widget({}, [kitchen(), bedroom(), office()]);
    expect(r.chips()).toEqual(['Kitchen – °C', 'Bedroom', 'Office']);
    expect(r.all('g.ln-series path.ln-line').map(p => p.parentElement!.getAttribute('data-wk-color'))).toEqual(['blue', 'red', 'orange']);
    expect(r.all('circle.dot-core.ln-dot')).toHaveLength(3);
    expect(r.q('path.ln-area')).toBeNull();
    expect(r.header()).toEqual([`${n(21.5)}°C | Kitchen · Now`, '19°C | Bedroom · Now']);
  });

  it('fills an area under each line with `area`, and gives each its own colour', () => {
    const r = widget({ style: 'area', colors: ['purple', 'green'] }, [kitchen(), bedroom(), office()]);
    expect(r.all('path.ln-area')).toHaveLength(3);
    expect(r.all('.ew-chip').map(c => c.getAttribute('data-wk-color'))).toEqual(['purple', 'green', 'orange']);
  });

  it('fits the scale to the values, or starts it at zero', () => {
    const fit = widget({}, [kitchen(), office()]);
    expect(fit.labels()).not.toContain('0');
    const zero = widget({ range: 'zero' }, [kitchen(), office()]);
    expect(zero.labels()).toContain('0');
  });

  it('scales kW onto W, and leaves out a value in other units, saying so', () => {
    const power = (id: string, name: string, units: string, v: number) => (
      { deviceId: id, capabilityId: 'measure_power', name, capability: cap('Power', units, 0), value: v, points: hourly(FROM, () => v) });
    const humidity = { ...room('h', 'Bathroom', () => 60, 60), capabilityId: 'measure_humidity', capability: cap('Humidity', '%', 0) };
    const r = widget({}, [power('a', 'Heat pump', 'W', 400), power('b', 'Oven', 'kW', 0.2), humidity]);
    expect(r.header()).toEqual(['400W | Heat pump · Now', '200W | Oven · Now']);
    expect(r.all('.ew-chip.missing').map(c => c.textContent)).toEqual(['Bathroom – Other units']);
    expect(r.all('path.ln-line')).toHaveLength(2);
  });

  it("shows a finished span's averages, without dots, and Unavailable for a gone value", () => {
    const r = widget({ span: '1d!-' }, [kitchen(YESTERDAY), { deviceId: 'x', capabilityId: 'measure_temperature', missing: true }, bedroom(YESTERDAY)]);
    expect(r.chips()).toEqual(['Kitchen – °C', 'Unavailable', 'Bedroom']);
    expect(r.header()).toEqual(['21°C | Kitchen · avg', `${n(18.5)}°C | Bedroom · avg`]);
    expect(r.q('circle.dot-core')).toBeNull();
  });

  it('says so when nothing can be drawn', () => {
    const r = widget({}, [{ ...kitchen(), points: [] }]);
    expect(r.q('svg')!.style.display).toBe('none');
    expect(r.root.textContent).toContain('No history yet.');
  });
});

describe('taps and live values', () => {
  it('shows the line nearest the pointer at the tapped time, then the next nearest, with dots on each', () => {
    const r = widget({}, [kitchen(), bedroom(), office()]);
    // 03:30, halfway (38 px gutter, 326 px wide over 24 h), at the office's height: the points either side are an hour
    // apart, so the earlier one, 03:00.
    const x = 38 + 326 * 12 / 24;
    const y = Number(r.all('g.ln-series')[2].querySelector('path')!.getAttribute('d')!.match(/^M[\d.]+ ([\d.]+)/)![1]);
    r.q('svg')!.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerType: 'mouse' }));
    expect(r.header()).toEqual(['23°C | Office · 03:00', '21°C | Kitchen · 03:00']);
    expect(r.q('path.cursor')).not.toBeNull();
    expect(r.all('circle.dot-core.ln-dot')).toHaveLength(3);
  });

  it('adds a realtime value onto its line', () => {
    const r = widget({}, [kitchen(), bedroom()]);
    vi.setSystemTime(NOW + MIN);
    r.w.pushChange({ deviceId: 'k', capabilityId: 'measure_temperature', value: 22 });
    expect(r.header()[0]).toBe('22°C | Kitchen · Now');
  });

  it('asks for each value over the span, leaving empty ones out', async () => {
    const ask = async (settings: object) => {
      const api = vi.fn(async () => ({ charts: [kitchen(), bedroom()], language: 'en' }));
      const Homey = { getSettings: () => settings, api, on: () => {}, ready: () => {}, setHeight: () => {}, __: (k: string) => k };
      const root = document.createElement('div');
      document.body.append(root);
      win.mountLinesWidget(Homey, { root, frame: root });
      await vi.advanceTimersByTimeAsync(0);
      return { url: api.mock.calls.length ? decodeURIComponent((api.mock.calls[0] as any)[1]) : null, root };
    };
    expect((await ask({ slot1: { id: 'k:measure_temperature' }, slot3: { id: 'b:measure_temperature' } })).url)
      .toMatch(new RegExp(`^/state\\?charts=k:measure_temperature~24h~${FROM}~${NOW}~,b:measure_temperature~24h~${FROM}~${NOW}~(&|$)`));
    const week = await ask({ slot1: { id: 'k:measure_temperature' }, count: 7, span: 'days' });
    expect(week.url).toContain(`~7d~${NOW - 7 * 24 * HOUR}~`);
    const none = await ask({});
    expect(none.url).toBeNull();
    expect(none.root.textContent).toContain('Pick the values to show in the widget settings.');
  });
});
