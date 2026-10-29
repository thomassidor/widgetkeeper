// @vitest-environment happy-dom
/* Chart · Stacked (widgets/stacked): several values stacked on one time axis, the rest of a total as Other. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMount, loadWidget } from './helpers/loadWidget.js';

const MIN = 60e3;
const HOUR = 60 * MIN;
const NOW = new Date('2026-10-28T15:30:00').getTime(); // Europe/Copenhagen (vitest.config.ts)
const FROM = NOW - 24 * HOUR;
const at = (hhmm: string) => new Date(`2026-10-28T${hhmm}`).getTime();

let win: any;
beforeAll(() => { win = loadWidget('stacked'); loadMount('stacked'); });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.body.innerHTML = '';
});
afterEach(() => { vi.useRealTimers(); });

const cap = (title: string, units = 'W') => ({ title, type: 'number', units, decimals: 0, min: null, max: null, values: null, icon: null });
const slot = (id: string, name: string, points: [number, number][], value: number, units = 'W') => (
  { deviceId: id, capabilityId: 'measure_power', name, capability: cap('Power', units), value, points });
// Values under 1,000, so the kit's numbers (the machine's locale) have no thousands separator.
const meter = () => slot('m', 'Meter', [[FROM, 450]], 450);
const heatPump = () => slot('hp', 'Heat pump', [[FROM, 400]], 400);
const oven = () => slot('o', 'Oven', [[FROM, 0], [at('12:00:00'), 200], [at('13:00:00'), 0]], 0);
const solar = () => slot('s', 'Solar', [[FROM, -300]], -300);

function widget(opts: Record<string, unknown>, state: any[]) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createStackedWidget(root, { locale: 'en-GB', language: 'en', now: () => Date.now(), count: state.length - (opts.total ? 1 : 0), ...opts });
  w.setState(state);
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const header = () => all('.ew-hcol').map(c => `${c.querySelector('.ew-hval')!.textContent} | ${c.querySelector('.ew-hsub')!.textContent}`);
  const chips = () => all('.ew-chip').map(c => c.textContent);
  return { w, root, q, all, header, chips };
}

describe('the stack', () => {
  it('stacks the layers on the total, the rest as Other, the total now and the largest share at the top', () => {
    const r = widget({ total: true }, [meter(), heatPump(), oven(), solar()]);
    expect(r.chips()).toEqual(['Other', 'Heat pump', 'Oven', 'Solar']);
    // Other (450 − (400 + oven − 300)) and the oven add up to 350 all day, so the stack above zero is always 750 W.
    expect(r.header()).toEqual(['450W | Total · Now', '53% | Largest · Heat pump']);
    const layers = r.all('g.sk-layer');
    expect(layers.map(g => g.classList.contains('other') ? 'other' : g.getAttribute('data-wk-color'))).toEqual(['other', 'blue', 'red', 'orange']);
    expect(r.q('path.sk-total')).not.toBeNull();
  });

  it('stacks a value below zero downwards, from the zero line', () => {
    const r = widget({}, [heatPump(), solar()]);
    const [up, down] = r.all('g.sk-layer path.sk-area').map(p => p.getAttribute('d')!);
    const ys = (d: string) => [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map(m => Number(m[1]));
    // The heat pump's area is above the solar's: every y of it is smaller (higher up).
    expect(Math.max(...ys(up))).toBeLessThanOrEqual(Math.min(...ys(down)));
    expect(r.header()).toEqual(['100W | Total · Now', '100% | Largest · Heat pump']);
  });

  it('scales kW onto W, and leaves out a layer in other units, saying so', () => {
    const kw = { ...oven(), points: oven().points.map(([t, v]: [number, number]) => [t, v / 1000]), capability: cap('Power', 'kW') };
    const temp = { ...slot('t', 'Thermometer', [[FROM, 21]], 21, '°C'), capabilityId: 'measure_temperature' };
    const r = widget({ total: true }, [meter(), heatPump(), kw, solar(), temp]);
    expect(r.header()).toEqual(['450W | Total · Now', '53% | Largest · Heat pump']);
    expect(r.chips()).toEqual(['Other', 'Heat pump', 'Oven', 'Solar', 'Thermometer – Other units']);
    expect(r.all('.ew-chip.missing').map(c => c.textContent)).toEqual(['Thermometer – Other units']);
    expect(r.all('g.sk-layer')).toHaveLength(4);
  });

  it('draws bars on the clock when asked, and the legend below the chart', () => {
    const r = widget({ total: true, style: 'bars', legend: 'below' }, [meter(), heatPump(), oven()]);
    expect(r.q('path.sk-area')).toBeNull();
    expect(r.all('rect.sk-layer').length).toBeGreaterThan(24);
    const box = r.q('.sk-chart')!;
    expect([...box.children].map(c => c.tagName.toLowerCase())).toEqual(['svg', 'div', 'div']); // the chips after the svg
  });

  it("gives each layer its colour, else the kit's in order, and says Unavailable for a gone one", () => {
    const r = widget({ colors: ['green'] }, [heatPump(), { deviceId: 'x', capabilityId: 'measure_power', missing: true }, oven()]);
    expect(r.all('.ew-chip').map(c => c.getAttribute('data-wk-color'))).toEqual(['green', 'red', 'orange']);
    expect(r.chips()).toEqual(['Heat pump', 'Unavailable', 'Oven']);
  });
});

describe('taps and the request', () => {
  it('shows the total at a tapped time and the layer under the pointer with its share', () => {
    const r = widget({ total: true }, [meter(), heatPump(), oven(), solar()]);
    // 12:30 on the plot (38 px gutter, 326 px wide over 24 h), at 650 W: inside the oven's band (550–750 W).
    const x = 38 + 326 * 21 / 24;
    const y = 10 + 122 * (1 - (650 + 500) / 1500); // the scale runs −500 … 1,000 W
    r.q('svg')!.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerType: 'mouse' }));
    expect(r.header()).toEqual(['450W | Total · 12:37', '200W | Oven · 27 %']);
    expect(r.q('path.cursor')).not.toBeNull();
  });

  it('asks for the total first, then the layers, leaving empty ones out', async () => {
    const ask = async (settings: object) => {
      const api = vi.fn(async () => ({ charts: [meter(), heatPump()], language: 'en' }));
      const Homey = { getSettings: () => settings, api, on: () => {}, ready: () => {}, setHeight: () => {}, __: (k: string) => k };
      const root = document.createElement('div');
      document.body.append(root);
      win.mountStackedWidget(Homey, { root, frame: root });
      await vi.advanceTimersByTimeAsync(0);
      return { url: api.mock.calls.length ? decodeURIComponent((api.mock.calls[0] as any)[1]) : null, root };
    };
    expect((await ask({ total: { id: 'm:measure_power' }, slot2: { id: 'hp:measure_power' } })).url)
      .toMatch(/^\/state\?charts=m:measure_power~24h~\d+~\d+~,hp:measure_power~24h~\d+~\d+~(&|$)/);
    // A total alone draws nothing: it needs a layer.
    const none = await ask({ total: { id: 'm:measure_power' } });
    expect(none.url).toBeNull();
    expect(none.root.textContent).toContain('Pick the values to stack in the widget settings.');
  });
});
