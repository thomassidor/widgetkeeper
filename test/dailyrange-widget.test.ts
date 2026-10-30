// @vitest-environment happy-dom
/* Chart · Min/Max (widgets/dailyrange): each day's lowest to highest as a floating bar, its average as a tick. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMount, loadWidget } from './helpers/loadWidget.js';

const MIN = 60e3;
const HOUR = 60 * MIN;
const NOW = new Date('2026-10-28T15:30:00').getTime(); // Europe/Copenhagen (vitest.config.ts)
const OCT1 = new Date('2026-10-01T00:00:00').getTime();

let win: any;
beforeAll(() => { win = loadWidget('dailyrange'); loadMount('dailyrange'); });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.body.innerHTML = '';
});
afterEach(() => { vi.useRealTimers(); });

const cap = { title: 'Temperature', type: 'number', units: '°C', decimals: 1, min: null, max: null, values: null, icon: null };
/** Each day 4° at 04:00 and 14° at 16:00 (a straight line between), the 10th 20° at 16:00; a point every hour. */
function temps() {
  const points: [number, number][] = [];
  for (let t = OCT1; t < NOW; t += HOUR) {
    const d = new Date(t);
    const h = d.getHours();
    const high = d.getDate() === 10 ? 20 : 14;
    const v = h < 4 ? 4 + (16 - h - 12) : h <= 16 ? 4 + (high - 4) * (h - 4) / 12 : high - (high - 4) * (h - 16) / 12;
    points.push([t, Math.round(v * 10) / 10]);
  }
  return { deviceId: 'out', capabilityId: 'measure_temperature', name: 'Outside', capability: cap, value: 12, points };
}

function widget(opts: Record<string, unknown>, state: any[]) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createDailyRangeWidget(root, { locale: 'en-GB', language: 'en', now: () => Date.now(), ...opts });
  w.setState(state);
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const header = () => all('.ew-hcol').map(c => `${c.querySelector('.ew-hval')!.textContent} | ${c.querySelector('.ew-hsub')!.textContent}`);
  /** A tap in the middle of day `d` of October (31 days over the 326 px plot from x = 38). */
  const tap = (d: number) => q('svg')!.dispatchEvent(new PointerEvent('pointerdown', { clientX: 38 + 326 * (d - 0.5) / 31, pointerType: 'mouse' }));
  const day = (d: number) => new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric' }).format(new Date(2026, 9, d));
  return { w, root, q, all, header, tap, day };
}

describe('the bars', () => {
  it("draws a bar a day this month up to today, each from its low to its high, with today's high and low at the top", () => {
    const r = widget({ span: '1mo!' }, [temps()]);
    const bars = r.all('rect.dr-bar');
    expect(bars).toHaveLength(28); // the 1st to today, the 28th
    const h = bars.map(b => Number(b.getAttribute('height')));
    expect(h[9]).toBeGreaterThan(h[8] * 1.4); // the 10th went up to 20°
    expect(r.all('path.dr-avg')).toHaveLength(28);
    // Today so far: its 16:00 high is still to come.
    expect(r.header()).toEqual([`13,2°C | High · ${r.day(28)}`, `4°C | Low · ${r.day(28)}`]);
    const date = (d: number) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(new Date(2026, 9, d));
    expect(r.all('svg text').map(t => t.textContent)).toEqual(expect.arrayContaining([date(7), date(14)]));
  });

  it("shows a tapped day's own, and leaves the averages out when asked", () => {
    const r = widget({ span: '1mo!' }, [temps()]);
    r.tap(10);
    expect(r.header()).toEqual([`20°C | High · ${r.day(10)}`, `4°C | Low · ${r.day(10)}`]);
    expect(r.q('rect.dr-bar.selected')).not.toBeNull();
    expect(widget({ span: '1mo!', average: false }, [temps()]).all('path.dr-avg')).toHaveLength(0);
  });

  it('takes any span: a bar an hour over 24 hours', () => {
    expect(widget({ span: '24h' }, [temps()]).all('rect.dr-bar').length).toBeGreaterThanOrEqual(24);
  });
});

describe('the request and messages', () => {
  it('asks for the span with up to 400 points: the last 4 weeks unless set, a bar a day', () => {
    expect(widget({}, [temps()]).w.windows()).toEqual([`4w~${NOW - 28 * 24 * HOUR}~${NOW}~~fine`]);
    const r = widget({}, [temps()]);
    expect(r.all('rect.dr-bar')).toHaveLength(28);
    // Today's bar ends now, and is still named as a day.
    expect(r.header()[0]).toMatch(new RegExp(`High · ${r.day(28)}$`));
    const t = win.WidgetkeeperKit.timeSpan('1mo!', NOW);
    expect(widget({ span: '1mo!' }, [temps()]).w.windows()).toEqual([`1mo!~${t.from}~${t.end}~month~fine`]);
  });

  it('says when the value is gone or there is no history', () => {
    expect(widget({ title: 'Outside' }, [{ deviceId: 'out', capabilityId: 'c', missing: true }]).q('.dr-note')!.textContent).toBe('Unavailable');
    expect(widget({}, [{ ...temps(), points: [], value: null }]).q('.dr-note')!.textContent).toBe('No history yet.');
  });

  it('mounts with a value picked: the last 4 weeks by default, any span set', async () => {
    const ask = async (settings: object) => {
      const api = vi.fn(async () => ({ charts: [temps()], language: 'en' }));
      const Homey = { getSettings: () => settings, api, on: () => {}, ready: () => {}, setHeight: () => {}, __: (k: string) => k };
      const root = document.createElement('div');
      document.body.append(root);
      win.mountDailyRangeWidget(Homey, { root, frame: root });
      await vi.advanceTimersByTimeAsync(0);
      return decodeURIComponent((api.mock.calls[0] as any)[1]);
    };
    expect(await ask({ slot: { id: 'out:measure_temperature' } })).toMatch(/^\/state\?charts=out:measure_temperature~4w~\d+~\d+~~fine(&|$)/);
    expect(await ask({ slot: { id: 'out:measure_temperature' }, count: 14, span: 'days' })).toMatch(/charts=out:measure_temperature~14d~\d+~\d+~~fine/);
  });
});
