// @vitest-environment happy-dom
/* Chart · Timeline (widgets/timeline): a row per boolean over the span, bands where it was true. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMount, loadWidget } from './helpers/loadWidget.js';

const MIN = 60e3;
const HOUR = 60 * MIN;
const NOW = new Date('2026-10-28T15:30:00').getTime(); // Europe/Copenhagen (vitest.config.ts)
const MIDNIGHT = new Date('2026-10-28T00:00:00').getTime();
const at = (hhmm: string) => new Date(`2026-10-28T${hhmm}`).getTime();

let win: any;
beforeAll(() => { win = loadWidget('timeline'); loadMount('timeline'); });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.body.innerHTML = '';
});
afterEach(() => { vi.useRealTimers(); });

const cap = (title: string) => ({ title, type: 'boolean', units: null, decimals: null, min: null, max: null, values: null, icon: null });
/** The heating: known since yesterday (off at midnight), on 06:00–08:30 and from 14:00. */
const heating = () => ({
  deviceId: 'h', capabilityId: 'onoff', name: 'Heating', capability: cap('Turned on'), value: true,
  changes: [[MIDNIGHT - 5 * HOUR, 0], [at('06:00:00'), 1], [at('08:30:00'), 0], [at('14:00:00'), 1]], since: MIDNIGHT - 20 * HOUR,
});
/** The front door: recorded from 10:00, opened twice for a few seconds and minutes. */
const door = () => ({
  deviceId: 'd', capabilityId: 'alarm_contact', name: 'Front door', capability: cap('Contact alarm'), value: false,
  changes: [[at('10:00:00'), 0], [at('11:00:00'), 1], [at('11:00:20'), 0], [at('13:00:00'), 1], [at('13:05:00'), 0]], since: at('10:00:00'),
});

function widget(opts: Record<string, unknown>, state: any[]) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createTimelineWidget(root, { locale: 'en-GB', language: 'en', now: () => Date.now(), ...opts });
  w.setState(state);
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const header = () => all('.ew-hcol').map(c => `${c.querySelector('.ew-hval')!.textContent} | ${c.querySelector('.ew-hsub')!.textContent}`);
  const names = () => all('svg text.tl-name').map(t => t.textContent);
  /** A tap at `x` on row `k` (rows of 32 px from y 2, the track 18 px into a row). */
  const tap = (k: number, x: number) => q('svg')!.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: 2 + 32 * k + 22, pointerType: 'mouse' }));
  return { w, root, q, all, header, names, tap };
}

describe('the rows', () => {
  it('draws a row per value with its bands today, and the time on and the openings at the top', () => {
    const r = widget({}, [heating(), door()]);
    expect(r.names()).toEqual(['Heating', 'Front door']);
    expect(r.all('.tl-row')[0].querySelectorAll('rect.tl-band')).toHaveLength(2);
    expect(r.all('.tl-row')[1].querySelectorAll('rect.tl-band')).toHaveLength(2);
    // 06:00–08:30 and 14:00–15:30: four hours; the door opened twice.
    expect(r.header()).toEqual(['4:00h | On · Heating', '2 | Opened · Front door']);
    // The axis is the whole day: the hours to come dimmed, a dashed line at now.
    expect(r.all('svg text').map(t => t.textContent).filter(s => /:00$/.test(s!))).toEqual(['6:00', '12:00', '18:00']);
    expect(r.q('rect.future')).not.toBeNull();
    expect(r.q('path.cursor')).not.toBeNull();
  });

  it("draws a band of seconds at least 2.5 px wide, and leaves the time before a row's first change dashed, not guessed", () => {
    const r = widget({}, [door()]);
    const widths = [...r.all('.tl-row')[0].querySelectorAll('rect.tl-band')].map(b => Number(b.getAttribute('width')));
    expect(widths[0]).toBe(2.5); // 20 s
    const unknown = r.all('.tl-row')[0].querySelector('path.tl-unknown')!.getAttribute('d');
    expect(unknown).toBe(`M0 25H${368 * 10 / 24}`.replace(/(\.\d)\d+/, '$1')); // midnight to 10:00, at the track's middle
    expect(r.all('.tl-row')[0].querySelector('rect.tl-track')!.getAttribute('x')).toBe(String(Math.round(368 * 10 / 24 * 10) / 10));
  });

  it("gives each row its colour, else the kit's in order", () => {
    expect(widget({}, [heating(), door()]).all('.tl-row').map(g => g.getAttribute('data-wk-color'))).toEqual(['blue', 'red']);
    expect(widget({ colors: ['orange', 'nope'] }, [heating(), door()]).all('.tl-row').map(g => g.getAttribute('data-wk-color'))).toEqual(['orange', 'red']);
  });

  it("names one device's values by capability, and a gone one Unavailable, in its place", () => {
    const two = [heating(), { ...door(), deviceId: 'h', name: 'Heating' }];
    expect(widget({}, two).names()).toEqual(['Turned on', 'Contact alarm']);
    const gone = widget({}, [{ deviceId: 'x', capabilityId: 'onoff', missing: true }, door()]);
    expect(gone.names()).toEqual(['Unavailable', 'Front door']);
    expect(gone.header()).toEqual(['5min | Open · Front door', '2 | Opened · Front door']);
  });

  it('says nothing is recorded yet before the first change', () => {
    const r = widget({}, [{ ...door(), changes: [], since: null }]);
    expect(r.header()).toEqual(['– | Nothing recorded yet']);
    expect(r.q('rect.tl-band')).toBeNull();
  });

  it('puts the title on a chip above the rows', () => {
    const r = widget({ title: 'Doors' }, [door()]);
    expect(r.all('.ew-chip').map(c => c.textContent)).toEqual(['Doors']);
  });
});

describe('taps and live changes', () => {
  it("shows a tapped band's length and times, and a tapped row's time on and how often", () => {
    const r = widget({}, [heating(), door()]);
    r.tap(0, 368 * 7 / 24); // 07:00, in the morning's band
    expect(r.header()).toEqual(['2:30h | 06:00–08:30', '2 | Turned on · Heating']);
    expect(r.q('rect.tl-band.selected')).not.toBeNull();
    r.tap(1, 368 * 20 / 24); // 20:00 on the door's row: no band
    expect(r.header()).toEqual(['5min | Open · Front door', '2 | Opened · Front door']);
  });

  it('adds a realtime change onto its row', () => {
    const r = widget({}, [heating(), door()]);
    vi.setSystemTime(NOW + 10 * MIN);
    r.w.pushChange({ deviceId: 'd', capabilityId: 'alarm_contact', value: true });
    vi.setSystemTime(NOW + 20 * MIN);
    r.w.render();
    expect(r.header()[1]).toBe('3 | Opened · Front door');
    expect(r.all('.tl-row')[1].querySelectorAll('rect.tl-band')).toHaveLength(3);
  });
});

/** A number's capability: its title, units and decimals. */
const numCap = (title: string, units: string) => ({ title, type: 'number', units, decimals: 0, min: null, max: null, values: null, icon: null });
/** Insights points from midnight to now, each its 5 minutes' average at their middle: `value(t)` at each 5 minutes' start. */
const points = (value: (t: number) => number) => {
  const out: [number, number][] = [];
  for (let t = MIDNIGHT; t + 5 * MIN <= NOW; t += 5 * MIN) out.push([t + 2.5 * MIN, value(t)]);
  return out;
};
/** The heater: 100 W from 06:00 to 08:00, else 10 W. */
const heater = () => ({
  deviceId: 'p', capabilityId: 'measure_power', name: 'Heater', capability: numCap('Power', 'W'), value: 10,
  points: points(t => (t >= at('06:00:00') && t < at('08:00:00') ? 100 : 10)),
});
/** The bedroom: 19 °C from 03:00 to 04:00 and from 05:00 to 05:30, else 22 °C. */
const bedroom = () => ({
  deviceId: 'b', capabilityId: 'measure_temperature', name: 'Bedroom', capability: numCap('Temperature', '°C'), value: 22,
  points: points(t => ((t >= at('03:00:00') && t < at('04:00:00')) || (t >= at('05:00:00') && t < at('05:30:00')) ? 19 : 22)),
});

describe('numbers against a threshold', () => {
  it('draws a band where a number was above its threshold, from the 5 minutes it crossed in', () => {
    const r = widget({ thresholds: [{ at: 50 }] }, [heater()]);
    expect(r.all('.tl-row')[0].querySelectorAll('rect.tl-band')).toHaveLength(1);
    expect(r.header()).toEqual(['2:00h | Above 50 W · Heater', '1 | Went above · Heater']);
    r.tap(0, 368 * 7 / 24); // 07:00, in the band
    expect(r.header()[0]).toBe('2:00h | 06:00–08:00');
  });

  it('draws a band where it was below, with `below`, and mixes with booleans', () => {
    const r = widget({ thresholds: [{ at: 20, below: true }, {}] }, [bedroom(), door()]);
    expect(r.all('.tl-row')[0].querySelectorAll('rect.tl-band')).toHaveLength(2);
    expect(r.header()).toEqual(['1:30h | Below 20°C · Bedroom', '2 | Opened · Front door']);
  });

  it('is known from its first point, and above 0 without a threshold', () => {
    const r = widget({}, [heater()]);
    // 10 W is above 0 all day: one band from midnight.
    expect(r.header()[0]).toBe('15:30h | Above 0 W · Heater');
    expect(r.all('.tl-row')[0].querySelector('path.tl-unknown')).toBeNull();
  });

  it('turns a realtime number into a change by the threshold, and leaves booleans to boolean rows', () => {
    const r = widget({ thresholds: [{ at: 50 }] }, [heater()]);
    vi.setSystemTime(NOW + 10 * MIN);
    r.w.pushChange({ deviceId: 'p', capabilityId: 'measure_power', value: 120 });
    r.w.pushChange({ deviceId: 'p', capabilityId: 'measure_power', value: true });
    vi.setSystemTime(NOW + 40 * MIN);
    r.w.render();
    expect(r.header()).toEqual(['2:30h | Above 50 W · Heater', '2 | Went above · Heater']);
  });
});

describe('what true means', () => {
  it('is open for a contact, motion for motion, active for other alarms, else on', () => {
    const kind = win.createTimelineWidget.kindOf;
    expect(['alarm_contact', 'alarm_motion', 'alarm_smoke', 'onoff', 'onoff.output2'].map(kind)).toEqual(['open', 'motion', 'alarm', 'on', 'on']);
  });
});

describe('the request', () => {
  it('mounts with the values picked, leaving empty ones out, from the span\'s start', async () => {
    const ask = async (settings: object) => {
      const api = vi.fn(async () => ({ rows: [door()], language: 'en' }));
      const Homey = { getSettings: () => settings, api, on: () => {}, ready: () => {}, setHeight: () => {}, __: (k: string) => k };
      const root = document.createElement('div');
      document.body.append(root);
      win.mountTimelineWidget(Homey, { root, frame: root });
      await vi.advanceTimersByTimeAsync(0);
      return { url: api.mock.calls.length ? decodeURIComponent((api.mock.calls[0] as any)[1]) : null, root };
    };
    const asked = await ask({ slot1: { id: 'd:alarm_contact' }, slot3: { id: 'h:onoff' }, color3: 'green' });
    expect(asked.url).toMatch(new RegExp(`^/state\\?slots=d:alarm_contact,h:onoff&from=${MIDNIGHT}(&|$)`));
    // The window's end and unit, for a number's Insights.
    expect(asked.url).toContain(`&end=${NOW}&unit=day&span=1d!`);
    const week = await ask({ slot1: { id: 'd:alarm_contact' }, count: 7, span: 'days' });
    expect(week.url).toContain(`from=${NOW - 7 * 24 * HOUR}`);
    const none = await ask({});
    expect(none.url).toBeNull();
    expect(none.root.textContent).toContain('Pick the values to show in the widget settings.');
  });

  it("gives each row its threshold and side from the settings, a missing one above 0", async () => {
    const api = vi.fn(async () => ({ rows: [bedroom(), heater()], language: 'en' }));
    const settings = { slot1: { id: 'b:measure_temperature' }, threshold1: 20, when1: 'below', slot2: { id: 'p:measure_power' } };
    const Homey = { getSettings: () => settings, api, on: () => {}, ready: () => {}, setHeight: () => {}, __: (k: string) => k };
    const root = document.createElement('div');
    document.body.append(root);
    win.mountTimelineWidget(Homey, { root, frame: root });
    await vi.advanceTimersByTimeAsync(0);
    const subs = [...root.querySelectorAll('.ew-hsub')].map(e => e.textContent);
    expect(subs).toEqual(['Below 20°C · Bedroom', 'Went above · Heater']);
  });
});
