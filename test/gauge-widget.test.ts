// @vitest-environment happy-dom
/* Chart · Gauge (widgets/gauge): one value now on a dial, its range over the span inside, coloured by level if asked. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMount, loadWidget } from './helpers/loadWidget.js';

const MIN = 60e3;
const HOUR = 60 * MIN;
const NOW = new Date('2026-10-28T15:30:00').getTime(); // Europe/Copenhagen (vitest.config.ts)
const MIDNIGHT = new Date('2026-10-28T00:00:00').getTime();

/** A number as the widget writes it: in the system locale (the kit's `formatNumber()` doesn't take `opts.locale`). */
const num = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

let win: any;
beforeAll(() => { win = loadWidget('gauge'); loadMount('gauge'); });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.body.innerHTML = '';
});
afterEach(() => { vi.useRealTimers(); });

const co2Cap = { title: 'CO2', type: 'number', units: 'ppm', decimals: 0, min: null, max: null, values: null, icon: null };
const batteryCap = { title: 'Battery', type: 'number', units: '%', decimals: 0, min: 0, max: 100, values: null, icon: null };
const dimCap = { title: 'Brightness', type: 'number', units: '%', decimals: 2, min: 0, max: 1, values: null, icon: null };

/** A value today: from `lo` at midnight up to `hi` at noon, then `now`; a point an hour. */
function entry(cap: object, lo: number, hi: number, now: number, name = 'Office') {
  const points: [number, number][] = [];
  for (let t = MIDNIGHT; t < NOW; t += HOUR) {
    const h = (t - MIDNIGHT) / HOUR;
    points.push([t, h <= 12 ? lo + (hi - lo) * h / 12 : hi]);
  }
  return { deviceId: 'd', capabilityId: 'measure_co2', name, capability: cap, value: now, points };
}

function widget(opts: Record<string, unknown>, state: any[]) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createGaugeWidget(root, { locale: 'en-GB', language: 'en', now: () => Date.now(), ...opts });
  w.setState(state);
  const q = (sel: string) => root.querySelector<SVGElement>(sel);
  const all = (sel: string) => [...root.querySelectorAll<SVGElement>(sel)];
  const text = (sel: string) => all(sel).map(t => t.textContent);
  return { w, root, q, all, text };
}

describe('the dial', () => {
  it('shows the value now in the middle, its range today and the scale fitted around them', () => {
    const r = widget({}, [entry(co2Cap, 420, 980, 760)]);
    expect(r.text('text.gg-num')).toEqual([`${num(760)}ppm`]);
    expect(r.text('text.gg-sub')).toEqual([`Range ${num(420)}–${num(980)}`]);
    expect(r.text('text.gg-end')).toEqual([num(400), num(1000)]); // the chart kit's whole steps around 420–980
    expect(r.all('path.gg-track')).toHaveLength(1);
    expect(r.all('path.gg-range')).toHaveLength(1);
    expect(r.q('path.gg-value')!.getAttribute('data-value')).toBe('760');
    expect(r.all('.ew-chip').map(c => c.textContent)).toEqual(['Office · CO2 – ppm', 'Range']);
  });

  it('puts a percentage on 0–100, a 0–1 one scaled', () => {
    expect(widget({}, [entry(batteryCap, 60, 80, 72)]).text('text.gg-end')).toEqual(['0', '100']);
    const dim = widget({}, [entry(dimCap, 0.2, 0.8, 0.5)]);
    expect(dim.text('text.gg-end')).toEqual(['0', '100']);
    expect(dim.text('text.gg-num')).toEqual([`${num(50)}%`]);
  });

  it('takes a scale as set, and a value past it fills the dial', () => {
    const r = widget({ scale: 'custom', scaleMin: 0, scaleMax: 500 }, [entry(co2Cap, 420, 980, 760)]);
    expect(r.text('text.gg-end')).toEqual(['0', '500']);
    const d = r.q('path.gg-value')!.getAttribute('d')!;
    const track = r.q('path.gg-track')!.getAttribute('d')!;
    expect(d).toBe(track); // all the way round
  });

  it('ignores a set scale that runs backwards', () => {
    expect(widget({ scale: 'custom', scaleMin: 100, scaleMax: 100 }, [entry(co2Cap, 420, 980, 760)]).text('text.gg-end')).toEqual([num(400), num(1000)]);
  });

  it('leaves the range out when asked', () => {
    const r = widget({ showRange: false }, [entry(co2Cap, 420, 980, 760)]);
    expect(r.all('path.gg-range')).toHaveLength(0);
    expect(r.all('text.gg-sub')).toHaveLength(0);
    expect(r.all('.ew-chip').map(c => c.textContent)).toEqual(['Office · CO2 – ppm']);
  });

  it('draws a bar by default, a dial when asked', () => {
    const bar = widget({}, [entry(co2Cap, 420, 980, 760)]);
    expect(bar.q('.gg-chart')!.dataset.layout).toBe('bar');
    expect(bar.q('path.gg-track')!.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+H[\d.]+$/);
    expect(bar.q('text.gg-num')!.getAttribute('text-anchor')).toBe('start');
    const dial = widget({ layout: 'dial' }, [entry(co2Cap, 420, 980, 760)]);
    expect(dial.q('.gg-chart')!.dataset.layout).toBe('dial');
    expect(dial.q('path.gg-track')!.getAttribute('d')).toMatch(/A/);
    expect(dial.q('text.gg-num')!.getAttribute('text-anchor')).toBe('middle');
    expect(widget({ layout: 'pie' }, [entry(co2Cap, 420, 980, 760)]).q('.gg-chart')!.dataset.layout).toBe('bar');
  });

  it.each(['bar', 'dial'])('%s: puts the value at its place on the scale', (layout) => {
    const r = widget({ layout, scale: 'custom', scaleMin: 0, scaleMax: 1000 }, [entry(co2Cap, 420, 980, 500)]);
    const knob = r.q('circle.gg-knob')!;
    if (layout === 'bar') {
      const [x0, x1] = r.q('path.gg-track')!.getAttribute('d')!.match(/[\d.]+/g)!.map(Number).filter((_, i) => i !== 1);
      expect(Number(knob.getAttribute('cx'))).toBeCloseTo((x0 + x1) / 2, 0);
    } else {
      // Half the scale is the top of the arc: straight above the centre.
      const cx = Number(r.q('svg')!.getAttribute('width')) / 2;
      expect(Number(knob.getAttribute('cx'))).toBeCloseTo(cx, 0);
    }
  });

  it('names the chart by its title', () => {
    expect(widget({ title: ' Air ' }, [entry(co2Cap, 420, 980, 760)]).all('.ew-chip')[0].textContent).toBe('Air – ppm');
  });
});

describe('levels', () => {
  it('higher is worse: green, yellow from, red from', () => {
    const z = win.createGaugeWidget.zoneOf;
    const levels = { zones: 'rising', yellowAt: 1000, redAt: 1400 };
    expect([800, 1000, 1399, 1400].map(v => z(v, levels))).toEqual(['green', 'yellow', 'yellow', 'red']);
    const low = { zones: 'falling', yellowAt: 30, redAt: 15 };
    expect([80, 30, 16, 15].map(v => z(v, low))).toEqual(['green', 'yellow', 'yellow', 'red']);
    expect(z(5, { zones: 'none', yellowAt: 1, redAt: 2 })).toBeNull();
  });

  it('colours the track in zones, takes the limits into the scale and the value in its level', () => {
    const r = widget({ zones: 'rising', yellowAt: 1000, redAt: 1400 }, [entry(co2Cap, 420, 1180, 1100)]);
    expect(r.all('path.gg-zone').map(p => p.getAttribute('class'))).toEqual(['gg-zone green', 'gg-zone yellow', 'gg-zone red']);
    expect(r.text('text.gg-end')).toEqual([num(0), num(1500)]);
    expect(r.q('path.gg-value')!.getAttribute('class')).toBe('gg-value yellow');
    expect(r.q('text.gg-num')!.getAttribute('class')).toBe('gg-num yellow');
  });

  it('one colour without them', () => {
    const r = widget({}, [entry(co2Cap, 420, 1180, 1100)]);
    expect(r.all('path.gg-zone')).toHaveLength(0);
    expect(r.q('path.gg-value')!.getAttribute('class')).toBe('gg-value');
  });
});

describe('state', () => {
  it('says so for a deleted device, and without history or a value', () => {
    const gone = widget({}, [{ deviceId: 'd', capabilityId: 'measure_co2', missing: true }]);
    expect(gone.q('svg')!.style.display).toBe('none');
    expect(gone.root.querySelector('.gg-note')!.textContent).toBe('Unavailable');
    const empty = widget({}, [{ ...entry(co2Cap, 1, 2, 3), value: null, points: [] }]);
    expect(empty.root.querySelector('.gg-note')!.textContent).toBe('No history yet.');
  });

  it('moves with a live value', () => {
    const r = widget({}, [entry(co2Cap, 420, 980, 760)]);
    r.w.pushChange({ deviceId: 'd', capabilityId: 'measure_co2', value: 1020 });
    expect(r.text('text.gg-num')).toEqual([`${num(1020)}ppm`]);
    expect(r.text('text.gg-sub')).toEqual([`Range ${num(420)}–${num(1020)}`]);
  });

  it("asks for today's window by default", () => {
    const r = widget({}, []);
    expect(r.w.windows()).toEqual([`1d!~${MIDNIGHT}~${NOW}~day`]);
  });
});

describe('the mount', () => {
  it('asks /state for the picked value over its span', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const calls: string[] = [];
    const Homey = {
      getSettings: () => ({ slot: { id: 'd:measure_co2' }, count: 24, span: 'hours', zones: 'rising', yellowAt: '800' }),
      __: (k: string) => k, ready() {}, setHeight() {}, on() {},
      api: (method: string, path: string) => { calls.push(path); return Promise.resolve({ charts: [entry(co2Cap, 420, 980, 900)], language: 'en' }); },
    };
    (window as any).mountGaugeWidget(Homey, { root, frame: root });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[0]).toMatch(new RegExp(`^/state\\?charts=d%3Ameasure_co2~24h~${NOW - 24 * HOUR}~${NOW}~`));
    expect(root.querySelector('text.gg-num')!.getAttribute('class')).toBe('gg-num yellow'); // 900 over the 800 typed
  });
});

describe('the Legend setting (1.3.0)', () => {
  it('is above by default, or under the drawing, whose top moves up', () => {
    const above = widget({}, [entry(co2Cap, 420, 980, 760)]);
    expect([...above.q('.gg-chart')!.children].map(e => e.tagName.toLowerCase())[0]).toBe('div');
    const below = widget({ legend: 'below' }, [entry(co2Cap, 420, 980, 760)]);
    expect(below.q('.ew-frame')!.classList.contains('legend-below')).toBe(true);
    const order = [...below.q('.gg-chart')!.children];
    expect(order.findIndex(e => e.classList.contains('ew-chips'))).toBeGreaterThan(order.findIndex(e => e.tagName.toLowerCase() === 'svg'));
    expect(Number(below.q('svg')!.getAttribute('height'))).toBeLessThan(Number(above.q('svg')!.getAttribute('height')));
  });

  it('hidden shows no chips, and a missing value says why in the note', () => {
    const hidden = widget({ legend: 'hidden' }, [entry(co2Cap, 420, 980, 760)]);
    for (const c of hidden.all('.ew-chips')) expect(c.style.display).toBe('none');
    expect(hidden.q('svg')!.style.display).not.toBe('none');
    const gone = widget({ legend: 'hidden' }, [{ deviceId: 'd', capabilityId: 'c', missing: true }]);
    expect(gone.q('.gg-note')!.style.display).not.toBe('none');
    expect(gone.q('.gg-note')!.textContent).toBe('Unavailable');
  });
});
