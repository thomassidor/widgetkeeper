// @vitest-environment happy-dom
/* Chart · Daily Profile (widgets/typicalday): today's line over the usual day and its spread. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMount, loadWidget } from './helpers/loadWidget.js';

const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-28T15:30:00').getTime(); // Europe/Copenhagen (vitest.config.ts)
const MIDNIGHT = new Date('2026-10-28T00:00:00').getTime();

let win: any;
beforeAll(() => { win = loadWidget('typicalday'); loadMount('typicalday'); });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.body.innerHTML = '';
});
afterEach(() => { vi.useRealTimers(); });

const cap = { title: 'Power', type: 'number', units: 'kW', decimals: 2, min: null, max: null, values: null, icon: null };
/** A usual day: 1 kW at night, 3 kW from 17 to 20, a little more each day back; today 1 kW more than usual. */
const usual = (t: number, k = 0) => { const h = new Date(t).getHours(); return (h >= 17 && h < 20 ? 3 : 1) + 0.1 * k; };
function past(days = 7) {
  const points: [number, number][] = [];
  for (let t = NOW - days * DAY; t < NOW; t += 30 * MIN) points.push([t, usual(t, Math.floor((MIDNIGHT - t) / DAY))]);
  return { deviceId: 'h', capabilityId: 'measure_power', name: 'House', capability: cap, value: 2, points };
}
function today() {
  const points: [number, number][] = [];
  for (let t = MIDNIGHT; t < NOW; t += 5 * MIN) points.push([t, usual(t) + 1]);
  return { deviceId: 'h', capabilityId: 'measure_power', name: 'House', capability: cap, value: 2, points };
}

function widget(opts: Record<string, unknown>, state: any[]) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createTypicalDayWidget(root, { locale: 'en-GB', language: 'en', now: () => Date.now(), ...opts });
  w.setState(state);
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const header = () => all('.ew-hcol').map(c => `${c.querySelector('.ew-hval')!.textContent} | ${c.querySelector('.ew-hsub')!.textContent}`);
  /** A tap at hour `h` (the widget is 368 px wide outside a browser: a 326 px plot from x = 38). */
  const tap = (h: number) => q('svg')!.dispatchEvent(new PointerEvent('pointerdown', { clientX: 38 + 326 * (h + 0.5) / 24, pointerType: 'mouse' }));
  return { w, root, q, all, header, tap };
}

describe('the usual day', () => {
  it("is each hour's average, lowest and highest over the days before today", () => {
    const hours = win.WidgetkeeperChart.profile(past().points.filter((p: number[]) => p[0] < MIDNIGHT), MIDNIGHT - 7 * DAY, MIDNIGHT);
    expect(hours).toHaveLength(24);
    // 3 kW from 17 to 20, a little more each day back: yesterday's 3.0 to 3.6 six days before.
    expect(hours[18].avg).toBeCloseTo(3.3, 5);
    expect(hours[18].min).toBeCloseTo(3, 5);
    // The data starts 7 × 24 h ago, after the clocks went back: 16:30 local that day, so the night hours have six days.
    expect(hours[2].max).toBeCloseTo(1.5, 5);
    expect(hours.every((h: any) => h.n >= 6)).toBe(true);
  });

  it("draws the band and the dashed average under today's line, with today's value and the usual one at the top", () => {
    const r = widget({}, [today(), past()]);
    expect(r.q('path.td-band')).not.toBeNull();
    expect(r.q('path.td-usual')).not.toBeNull();
    expect(r.q('path.series-line')).not.toBeNull();
    expect(r.header()).toEqual(['2kW | Now', '1,25kW | Usual at 15:00']);
    expect(r.all('.ew-chip').map(c => c.textContent)).toEqual(['House · Power – kW', 'Usual · 7 d']);
    expect(r.all('svg text').map(t => t.textContent)).toEqual(expect.arrayContaining(['6:00', '12:00', '18:00']));
    // Without the spread, only the dashed average.
    expect(widget({ band: false }, [today(), past()]).q('path.td-band')).toBeNull();
  });

  it("shows a tapped hour's value today and as usual", () => {
    const r = widget({}, [today(), past()]);
    r.tap(8);
    expect(r.header()).toEqual(['2kW | 08:00', '1,25kW | Usual at 08:00']);
    expect(r.q('path.cursor')).not.toBeNull();
  });
});

describe('the requests and messages', () => {
  it('asks for today and for the last 7 (or 3) days', () => {
    const t = win.WidgetkeeperKit.timeSpan('1d!', NOW);
    expect(widget({}, [today(), past()]).w.windows()).toEqual([`1d!~${t.from}~${t.end}~day`, `7d~${NOW - 7 * DAY}~${NOW}~`]);
    expect(widget({ usual: '3' }, [today(), past()]).w.windows()[1]).toBe(`3d~${NOW - 3 * DAY}~${NOW}~`);
  });

  it('says when the value is gone or there is no history', () => {
    expect(widget({ title: 'House' }, [{ deviceId: 'h', capabilityId: 'c', missing: true }, null]).q('.td-note')!.textContent).toBe('Unavailable');
    expect(widget({}, [{ ...today(), points: [] }, { ...past(), points: [] }]).q('.td-note')!.textContent).toBe('No history yet.');
  });

  it('mounts with a value picked and asks for both windows', async () => {
    const api = vi.fn(async () => ({ charts: [today(), past()], language: 'en' }));
    const Homey = { getSettings: () => ({ slot: { id: 'h:measure_power' } }), api, on: () => {}, ready: () => {}, setHeight: () => {}, __: (k: string) => k };
    const root = document.createElement('div');
    document.body.append(root);
    win.mountTypicalDayWidget(Homey, { root, frame: root });
    await vi.advanceTimersByTimeAsync(0);
    expect(decodeURIComponent((api.mock.calls[0] as any)[1])).toMatch(/^\/state\?charts=h:measure_power~1d!~\d+~\d+~day,h:measure_power~7d~\d+~\d+~(&|$)/);
  });
});
