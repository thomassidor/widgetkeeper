// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMount, loadWidget } from './helpers/loadWidget.js';

const MIN = 60e3;
const HOUR = 60 * MIN;
const NOW = new Date('2026-10-28T15:30:00').getTime(); // a Wednesday, Europe/Copenhagen (vitest.config.ts), three days after summer time ended

let win: any;
beforeAll(() => { win = loadWidget('totals'); loadMount('totals'); });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.body.innerHTML = '';
});
afterEach(() => { vi.useRealTimers(); });

const cap = { title: 'Energy', type: 'number', units: 'kWh', decimals: 2, min: null, max: null, values: null, icon: null };
/**
 * A meter's running total, as `/state` gives it: a point at each hour's middle from `from` until before `to`, rising
 * `perHour` an hour, and the meter's value now.
 */
function meter(from: number, to: number, perHour = 1, extra: Record<string, unknown> = {}) {
  const points: [number, number][] = [];
  for (let t = from + HOUR / 2; t < to; t += HOUR) points.push([t, (t - from) / HOUR * perHour]);
  const value = (NOW - from) / HOUR * perHour;
  return { deviceId: 'm1', capabilityId: 'meter_power', name: 'Meter', capability: cap, value, points, meter: { offset: 0, high: points.at(-1)?.[1] ?? null }, ...extra };
}

function widget(opts: Record<string, unknown>, state: any[]) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createTotalsWidget(root, { locale: 'en-GB', language: 'en', now: () => Date.now(), ...opts });
  w.setState(state);
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const shown = (el: HTMLElement | null) => !!el && el.style.display !== 'none';
  const header = () => all('.ew-hcol').map(c => `${c.querySelector('.ew-hval')!.textContent} | ${c.querySelector('.ew-hsub')!.textContent}`);
  const heights = (sel = '.series-bars:not(.prev)') => all(`${sel} rect.bar`).map(r => Number(r.getAttribute('height')));
  /** A tap in the middle of slot `k` of `n` (the widget is 368 px wide outside a browser: a 326 px plot from x = 38). */
  const tap = (k: number, n: number) => q('svg')!.dispatchEvent(new PointerEvent('pointerdown', { clientX: 38 + 326 * (k + 0.5) / n, pointerType: 'mouse' }));
  return { w, root, q, all, shown, header, heights, tap };
}

const monday = new Date('2026-10-26T00:00:00').getTime();
/** A day as the widget names it, in Intl's order for the language (`27 Tue` in English). */
const day = (iso: string) => new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric' }).format(new Date(iso));

describe('a week', () => {
  it("draws a bar per day of the meter's use, the days to come empty, and the week's total on top", () => {
    const r = widget({ period: 'thisWeek' }, [meter(monday - 24 * HOUR, NOW)]);
    const h = r.heights();
    expect(h).toHaveLength(3); // Monday, Tuesday and today so far
    expect(h[0]).toBeCloseTo(h[1], 5);
    expect(h[2] / h[0]).toBeCloseTo(15.5 / 24, 2);
    expect(r.header()).toEqual(['63.5kWh | This week']);
    expect([...r.root.querySelectorAll('svg text')].map(t => t.textContent)).toEqual(expect.arrayContaining(['Mon', 'Tue', 'Wed', 'Sun']));
    expect(r.q('.ew-chip')!.textContent).toBe('Meter · Energy – kWh');
  });

  it('shows a tapped day with its use and date, then the total again', () => {
    const r = widget({ period: 'thisWeek' }, [meter(monday - 24 * HOUR, NOW)]);
    r.tap(1, 7);
    expect(r.header()).toEqual([`24.0kWh | ${day('2026-10-27T12:00')}`]);
    expect(r.q('rect.bar.selected')).not.toBeNull();
    r.q('svg')!.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    expect(r.header()).toEqual(['63.5kWh | This week']);
    r.tap(5, 7); // Saturday: nothing yet, nothing to select
    expect(r.header()).toEqual(['63.5kWh | This week']);
  });

  it('grows the day with live values, and counts on across a reset', () => {
    const r = widget({ period: 'thisWeek' }, [meter(monday - 24 * HOUR, NOW)]);
    const total = (NOW - (monday - 24 * HOUR)) / HOUR;
    vi.setSystemTime(NOW + 30 * MIN);
    r.w.pushChange({ deviceId: 'm1', capabilityId: 'meter_power', value: total + 2 });
    expect(r.header()).toEqual(['65.5kWh | This week']);
    // The meter starts again from zero: what it counts from there adds on.
    vi.setSystemTime(NOW + 40 * MIN);
    r.w.pushChange({ deviceId: 'm1', capabilityId: 'meter_power', value: 0.5 });
    expect(r.header()).toEqual(['66.0kWh | This week']);
    r.w.pushChange({ deviceId: 'other', capabilityId: 'meter_power', value: 1 });
    expect(r.header()).toEqual(['66.0kWh | This week']);
  });

  it('keeps live totals newer than a refreshed history', () => {
    const r = widget({ period: 'thisWeek' }, [meter(monday - 24 * HOUR, NOW)]);
    const total = (NOW - (monday - 24 * HOUR)) / HOUR;
    vi.setSystemTime(NOW + 30 * MIN);
    r.w.pushChange({ deviceId: 'm1', capabilityId: 'meter_power', value: total + 2 });
    r.w.setState([meter(monday - 24 * HOUR, NOW)]); // a history cached from before; its value now is the older one
    expect(r.header()).toEqual(['65.5kWh | This week']);
  });
});

describe('a month against the one before', () => {
  const oct1 = new Date('2026-10-01T00:00:00').getTime();
  const sep1 = new Date('2026-09-01T00:00:00').getTime();
  const state = () => [meter(oct1 - 24 * HOUR, NOW), { ...meter(sep1 - 24 * HOUR, oct1 + 24 * HOUR, 2), value: 9999 }];

  it("puts the month before beside each day, paired by date, and both totals on top", () => {
    const r = widget({ period: 'thisMonth', compare: true }, state());
    expect(r.heights()).toHaveLength(28); // 1–28 October
    expect(r.heights('.series-bars.prev')).toHaveLength(30); // 1–30 September, in the first 30 slots
    // The 25th was an hour longer: summer time ended.
    expect(r.heights()[24] / r.heights()[23]).toBeCloseTo(25 / 24, 2);
    expect(r.header()).toEqual(['664.5kWh | This month', '1,440kWh | Last month']);
    expect(r.all('.ew-chip').map(c => c.textContent)).toEqual(['Meter · Energy – kWh', 'Last month']);
    expect(r.q('.ew-header')!.classList.contains('one')).toBe(false);
  });

  it('shows both days of a tapped slot', () => {
    const r = widget({ period: 'thisMonth', compare: true }, state());
    r.tap(2, 31);
    expect(r.header()).toEqual([`24.0kWh | ${day('2026-10-03T12:00')}`, `48.0kWh | ${day('2026-09-03T12:00')}`]);
    r.tap(30, 31); // the 31st: no day of it yet, nor in September
    expect(r.header()).toEqual(['664.5kWh | This month', '1,440kWh | Last month']);
  });
});

describe('a year', () => {
  it('draws a bar per month, named by month (narrow names where short ones would crowd)', () => {
    const jan1 = new Date('2026-01-01T00:00:00').getTime();
    const points: [number, number][] = [];
    for (let t = jan1 + 3 * HOUR; t < NOW; t += 6 * HOUR) points.push([t, (t - jan1) / HOUR]);
    const r = widget({ period: 'thisYear' }, [{ ...meter(jan1, NOW), points }]);
    const h = r.heights();
    expect(h).toHaveLength(10); // January to October
    expect(h[1] / h[0]).toBeCloseTo(28 / 31, 2); // February is shorter
    const months = [...r.root.querySelectorAll('svg text')].map(t => t.textContent).slice(-12);
    expect(months.join('')).toBe('JFMAMJJASOND');
    r.tap(1, 12);
    expect(r.header()[0]).toBe('672.0kWh | February');
  });
});

describe('a day', () => {
  it('draws an hour a bar, labelled 6:00, 12:00 and 18:00', () => {
    const midnight = new Date('2026-10-28T00:00:00').getTime();
    const r = widget({ period: 'today' }, [meter(midnight - HOUR, NOW)]);
    expect(r.heights()).toHaveLength(16); // 00:00 up to 15:30
    expect([...r.root.querySelectorAll('svg text')].map(t => t.textContent)).toEqual(expect.arrayContaining(['6:00', '12:00', '18:00']));
    r.tap(13, 24);
    expect(r.header()).toEqual(['1.00kWh | 13:00–14:00']);
  });
});

describe('states', () => {
  it('says when the meter is gone, or has no history yet', () => {
    const gone = widget({ period: 'thisWeek' }, [{ deviceId: 'm1', capabilityId: 'meter_power', missing: true }]);
    expect(gone.header()).toEqual(['– | Unavailable']);
    expect(gone.q('.ew-chip')!.textContent).toBe('Unavailable');
    expect(gone.shown(gone.q('svg'))).toBe(false);
    const empty = widget({ period: 'thisWeek', title: 'Heat pump' }, [{ ...meter(monday, monday), points: [] }]);
    expect(empty.q('.tt-note')!.textContent).toBe('No history yet.');
    expect(empty.q('.ew-chip')!.textContent).toBe('Heat pump – kWh');
  });

  it('has no header without showHeader, and a message in place of the chart', () => {
    const r = widget({ period: 'thisWeek', showHeader: false }, [meter(monday, NOW)]);
    expect(r.shown(r.q('.ew-header'))).toBe(false);
    r.w.setMessage('Could not load the chart.', true);
    expect(r.shown(r.q('.tt-transient'))).toBe(true);
    expect(r.shown(r.q('svg'))).toBe(true);
    vi.advanceTimersByTime(8100);
    expect(r.shown(r.q('.tt-transient'))).toBe(false);
    r.w.setMessage('Pick a value that counts up in the widget settings.');
    expect(r.q('.ew-message')!.textContent).toBe('Pick a value that counts up in the widget settings.');
    expect(r.shown(r.q('.tt-chart'))).toBe(false);
  });

  it("colours itself by the colour setting, and strengthens it with Vivid", () => {
    const r = widget({ period: 'thisWeek', color: 'purple', colorStyle: 'deep' }, [meter(monday, NOW)]);
    expect(r.root.dataset.wkColor).toBe('purple');
    expect(r.root.classList.contains('wk-deep')).toBe(true);
  });
});

describe('mount', () => {
  async function requested(settings: Record<string, unknown>) {
    const api = vi.fn(async () => ({ current: { missing: true }, language: 'en' }));
    const Homey = { getSettings: () => settings, api, on: () => {}, ready: () => {}, setHeight: () => {}, __: (k: string) => k };
    const root = document.createElement('div');
    document.body.append(root);
    win.mountTotalsWidget(Homey, { root, frame: root });
    await vi.advanceTimersByTimeAsync(0);
    return { api, root, url: api.mock.calls.length ? decodeURIComponent((api.mock.calls[0] as any)[1]) : null };
  }

  it("asks for the meter's running total over the period, and the one before with compare", async () => {
    const month = (back: number) => {
      const w = win.WidgetkeeperKit.timeSpan('thisMonth', Date.now(), back);
      return `m1:meter_power~1mo!~${w.from}~${Math.ceil(w.end)}~month~use`;
    };
    expect((await requested({ slot: { id: 'm1:meter_power' }, count: 1, span: 'calMonths', compare: true })).url)
      .toMatch(new RegExp(`^/state\\?charts=${month(0)},${month(1)}(&|$)`));
    // Missing: this week. A span stored before the count and unit existed is used as it was.
    expect((await requested({ slot: { id: 'm1:meter_power' } })).url).toMatch(/^\/state\?charts=m1:meter_power~1w!~\d+~\d+~week~use(&|$)/);
    expect((await requested({ slot: { id: 'm1:meter_power' }, span: 'lastMonth' })).url).toMatch(/^\/state\?charts=m1:meter_power~lastMonth~\d+~\d+~month~use(&|$)/);
    expect((await requested({ slot: { id: 'm1:meter_power' }, count: 30, span: 'days' })).url).toMatch(/^\/state\?charts=m1:meter_power~30d~\d+~\d+~~use(&|$)/);
  });

  it('asks for a value without one', async () => {
    const r = await requested({ slot: null });
    expect(r.api).not.toHaveBeenCalled();
    expect(r.root.textContent).toContain('Pick a value that counts up in the widget settings.');
  });
});
