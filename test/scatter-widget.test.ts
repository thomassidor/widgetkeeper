// @vitest-environment happy-dom
/* Chart · X against Y (widgets/scatter): one value against another, a dot per stretch of time, and the trend line. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMount, loadWidget } from './helpers/loadWidget.js';

const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-28T15:30:00').getTime(); // Europe/Copenhagen (vitest.config.ts)

let win: any;
beforeAll(() => { win = loadWidget('scatter'); loadMount('scatter'); });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.body.innerHTML = '';
});
afterEach(() => { vi.useRealTimers(); });

const temp = { title: 'Temperature', type: 'number', units: '°C', decimals: 1, min: null, max: null, values: null, icon: null };
const power = { title: 'Power', type: 'number', units: 'kW', decimals: 2, min: null, max: null, values: null, icon: null };

/** A value's state as `/state` gives it: a point every 30 min over `days` up to now, `f(t)` at each, and its value now. */
function series(id: string, capability: object, f: (t: number) => number, days = 7) {
  const points: [number, number][] = [];
  for (let t = NOW - days * DAY; t < NOW; t += 30 * MIN) points.push([t, f(t)]);
  return { deviceId: id, capabilityId: 'c', name: id === 'out' ? 'Outside' : 'Heat pump', capability, value: f(NOW), points };
}
/** The outdoor temperature swinging over the day, and the heat pump using more the colder it is. */
const outdoor = (t: number) => 5 + 6 * Math.sin((t / HOUR) * Math.PI / 12);
const pump = (t: number) => 3 - 0.2 * outdoor(t);

function widget(opts: Record<string, unknown>, state: any[]) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createScatterWidget(root, { locale: 'en-GB', language: 'en', now: () => Date.now(), ...opts });
  w.setState(state);
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const header = () => all('.ew-hcol').map(c => `${c.querySelector('.ew-hval')!.textContent} | ${c.querySelector('.ew-hsub')!.textContent}`);
  const dots = () => all('circle.xy-dot').map(c => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy')), Number(c.getAttribute('fill-opacity'))]);
  /** A tap at `[x, y]` in the svg (it sits at the page's 0, 0 outside a browser). */
  const tap = (x: number, y: number) => q('svg')!.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerType: 'mouse' }));
  return { w, root, q, all, header, dots, tap };
}
const both = () => [series('out', temp, outdoor), series('hp', power, pump)];

describe('the dots', () => {
  it('puts a dot per hour over 7 days, each the two values at once, older ones fainter', () => {
    const r = widget({ span: '7d' }, both());
    const d = r.dots();
    expect(d.length).toBe(7 * 24);
    // Colder (further left) means higher (smaller y): every dot lies on the falling line.
    const byX = [...d].sort((a, b) => a[0] - b[0]);
    expect(byX[0][1]).toBeLessThan(byX[byX.length - 1][1]);
    expect(d[0][2]).toBeCloseTo(0.15, 2);
    expect(d.at(-1)![2]).toBeCloseTo(0.85, 2);
    // Without fading, all alike.
    expect(new Set(widget({ span: '7d', fade: false }, both()).dots().map(x => x[2]))).toEqual(new Set([0.7]));
  });

  it('takes a dot length by the span: 5 min over a day, 6 hours over a month (Homey keeps 6-hour steps), or as set', () => {
    expect(widget({ span: '24h' }, [series('out', temp, outdoor, 1), series('hp', power, pump, 1)]).dots().length).toBe(24 * 12);
    expect(widget({ span: '30d' }, [series('out', temp, outdoor, 30), series('hp', power, pump, 30)]).dots().length).toBe(30 * 4 + 1); // the first cut
    expect(widget({ span: '7d', dots: 'day' }, both()).dots().length).toBe(8); // seven days back from 15:30 touch eight
  });

  it('labels both scales and names both values in their chips', () => {
    const r = widget({ span: '7d' }, both());
    expect(r.all('.ew-chip').map(c => c.textContent)).toEqual(['Heat pump · Power – kW', 'Outside · Temperature – °C']);
    const labels = r.all('svg text').map(t => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['0', '10'])); // degrees across
  });
});

describe('the header and the trend', () => {
  it("shows the newest dot's values and the trend line's slope", () => {
    const r = widget({ span: '7d' }, both());
    const [now, trend] = r.header();
    expect(now).toMatch(/kW \| .*°C · Now$/);
    expect(trend).toBe('−0.2kW/°C | Trend');
    expect(r.q('path.xy-trend')).not.toBeNull();
    // Without the trend, one column and no line.
    const off = widget({ span: '7d', trend: false }, both());
    expect(off.header()).toHaveLength(1);
    expect(off.q('path.xy-trend')).toBeNull();
  });

  it("shows a tapped dot's values and time", () => {
    const r = widget({ span: '7d' }, both());
    const [x, y] = r.dots()[10];
    r.tap(x, y);
    expect(r.header()[0]).toMatch(/kW \| .*°C · \w{3} \d\d:00–\d\d:00$/);
    // A tap far from any dot lets go.
    r.tap(-500, -500);
    expect(r.header()[0]).toMatch(/· Now$/);
  });
});

describe('missing values', () => {
  it('says which is unavailable, or that there is not enough history yet', () => {
    const gone = widget({}, [{ deviceId: 'out', capabilityId: 'c', missing: true }, series('hp', power, pump)]);
    expect(gone.all('.ew-chip').map(c => c.textContent)).toEqual(['Heat pump · Power – kW', 'Unavailable']);
    expect(gone.q('.xy-note')!.style.display).toBe('none'); // the chip says it
    const titled = widget({ title: 'Pump' }, [series('out', temp, outdoor), { deviceId: 'hp', capabilityId: 'c', missing: true }]);
    expect(titled.q('.xy-note')!.textContent).toBe('Unavailable');
    const none = widget({}, [{ ...series('out', temp, outdoor), points: [] }, { ...series('hp', power, pump), points: [] }]);
    expect(none.q('.xy-note')!.textContent).toBe('Not enough history of both yet.');
  });
});

describe('live values and the request', () => {
  it('appends a live value to the series it belongs to', () => {
    const r = widget({ span: '24h' }, [series('out', temp, outdoor, 1), series('hp', power, pump, 1)]);
    vi.setSystemTime(NOW + 6 * MIN);
    r.w.pushChange({ deviceId: 'hp', capabilityId: 'c', value: 9 });
    expect(r.header()[0]).toMatch(/^9kW/); // as Homey reports it
  });

  it('asks for both values over the same window', () => {
    const r = widget({ span: '3d' }, both());
    const w = win.WidgetkeeperKit.timeSpan('3d', NOW);
    expect(r.w.windows()).toEqual([`3d~${w.from}~${w.end}~`, `3d~${w.from}~${w.end}~`]);
  });

  it('mounts with both values picked, and asks for them', async () => {
    const api = vi.fn(async () => ({ charts: both(), language: 'en' }));
    const Homey = {
      getSettings: () => ({ xValue: { id: 'out:c' }, yValue: { id: 'hp:c' }, count: 2, span: 'days' }),
      api, on: () => {}, ready: () => {}, setHeight: () => {}, __: (k: string) => k,
    };
    const root = document.createElement('div');
    document.body.append(root);
    win.mountScatterWidget(Homey, { root, frame: root });
    await vi.advanceTimersByTimeAsync(0);
    expect(decodeURIComponent((api.mock.calls[0] as any)[1])).toMatch(/^\/state\?charts=out:c~2d~\d+~\d+~,hp:c~2d~\d+~\d+~(&|$)/);
  });

  it('asks for both values when one is missing', async () => {
    const api = vi.fn();
    const Homey = { getSettings: () => ({ xValue: { id: 'out:c' } }), api, on: () => {}, ready: () => {}, setHeight: () => {}, __: (k: string) => k };
    const root = document.createElement('div');
    document.body.append(root);
    win.mountScatterWidget(Homey, { root, frame: root });
    await vi.advanceTimersByTimeAsync(0);
    expect(api).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Pick a value across (x) and a value up (y) in the widget settings.');
  });
});

describe('the chart module', () => {
  it('lines several series up on one grid, carrying a value over gaps', () => {
    const C = win.WidgetkeeperChart;
    const rows = C.alignSeries([[[0, 1], [HOUR, 3]], [[30 * MIN, 10]]], 0, 3 * HOUR, HOUR);
    expect(rows.map((r: any) => r.values)).toEqual([[1, 10], [3, 10], [3, 10]]);
  });

  it('fits a line through pairs, with its correlation', () => {
    const C = win.WidgetkeeperChart;
    const fit = C.trendLine([[0, 1], [1, 3], [2, 5]]);
    expect([fit.slope, fit.intercept, fit.r]).toEqual([2, 1, 1]);
    expect(C.trendLine([[1, 1], [1, 2], [1, 3]])).toBeNull();
    expect(C.trendLine([[0, 1], [1, 2]])).toBeNull();
  });
});
