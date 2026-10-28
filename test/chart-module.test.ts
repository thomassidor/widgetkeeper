// @vitest-environment happy-dom
/* The chart module shared by the Electricity Overview, Charts and Totals per Period (widgets/electricity/public/chart.js). */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWidget } from './helpers/loadWidget.js';

let C: any;
beforeAll(() => { C = loadWidget('electricity').WidgetkeeperChart; });
afterEach(() => { vi.useRealTimers(); });

const nf = (v: number, d?: number) => new Intl.NumberFormat('da-DK', d == null
  ? { maximumFractionDigits: 0 } : { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

function svg() {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.append(node);
  return node;
}
const labels = (s: SVGElement) => [...s.querySelectorAll('text')].map(t => t.textContent);

describe('helpers', () => {
  it('rounds scale steps to 1, 2, 2.5 and 5', () => {
    expect([0.7, 1.5, 2.2, 4, 7, 23, 0.003].map(C.niceStep)).toEqual([1, 2, 2.5, 5, 10, 25, 0.005]);
    expect(C.niceStep(0)).toBe(1);
  });

  it('writes thousands as k, with a real minus sign', () => {
    expect([850, 1000, 1500, -1500, -200].map(v => C.compactNumber(nf, v))).toEqual(['850', '1k', '1,5k', '−1,5k', '−200']);
  });

  it('labels relative times', () => {
    expect([3600e3, 1800e3, 150e3, 30e3].map(ms => C.ago(ms, nf))).toEqual(['1h', '30m', '2,5m', '30s']);
  });

  it('draws straight or smooth lines through the points', () => {
    const pts = [[0, 10], [10, 0], [20, 10]];
    expect(C.linePath(pts, false)).toBe('M0 10L10 0L20 10');
    expect(C.linePath(pts, true)).toMatch(/^M0 10C/);
    expect(C.stepPath([[0, 10], [10, 10], [10, 0], [20, 0]], true)).toContain('Q');
  });

  it('smooths a series without moving its ends', () => {
    const s = C.smoothValues([0, 10, 0, 10, 0]);
    expect(s[0]).toBe(0);
    expect(s[4]).toBe(0);
    expect(Math.max(...s)).toBeLessThan(10);
  });
});

describe('value scale', () => {
  const opts = { h: 100, top: 0, pw: 200, format: (v: number) => String(v) };

  it('starts at zero by default', () => {
    const s = svg();
    const scale = C.createKit().valueScale(s, { ...opts, min: 19, max: 23 });
    expect(scale.axisMin).toBe(0);
    expect(labels(s)).toContain('0');
    expect(scale.y(0)).toBe(100);
  });

  it('extends below zero in whole steps, with a zero line', () => {
    const s = svg();
    const scale = C.createKit().valueScale(s, { ...opts, min: -150, max: 400 });
    expect(scale.axisMin).toBeLessThan(0);
    expect(s.querySelectorAll('path.axis').length).toBe(1);
    expect(scale.zeroY).toBeGreaterThan(0);
    expect(scale.zeroY).toBeLessThan(100);
  });

  it('fits the values when asked, with no zero in the range', () => {
    const s = svg();
    const scale = C.createKit().valueScale(s, { ...opts, min: 19.3, max: 23.1, fit: true });
    expect([scale.axisMin, scale.axisMax]).toEqual([18, 24]);
    expect(labels(s)).not.toContain('0');
    expect(s.querySelectorAll('path.axis').length).toBe(0); // no zero line
    expect(scale.baseY).toBe(100); // areas and bars close at the bottom
    expect(scale.zeroY).toBeGreaterThan(100);
  });

  it('fits a range that crosses zero, with the zero line and labelled zero', () => {
    const s = svg();
    const scale = C.createKit().valueScale(s, { ...opts, min: -4.2, max: 6.8, fit: true });
    expect(scale.axisMin).toBeLessThanOrEqual(-4.2);
    expect(scale.axisMax).toBeGreaterThanOrEqual(6.8);
    expect(labels(s)).toContain('0');
    expect(s.querySelectorAll('path.axis').length).toBe(1);
    expect(scale.baseY).toBe(scale.zeroY);
  });

  it('closes areas at the top when every value is below zero', () => {
    const scale = C.createKit().valueScale(svg(), { ...opts, min: -20, max: -17, fit: true });
    expect(scale.baseY).toBe(0);
  });

  it('puts a flat series in the middle', () => {
    const scale = C.createKit().valueScale(svg(), { ...opts, min: 21, max: 21, fit: true });
    expect(scale.y(21)).toBe(50);
    expect([scale.axisMin, scale.axisMax]).toEqual([19, 23]);
  });
});

describe('trace and bars', () => {
  it('splits a trace at zero into the export look', () => {
    const s = svg();
    const kit = C.createKit();
    kit.trace(s, { line: 'M0 0L10 90', area: 'M0 0L10 90L10 50L0 50Z', kind: 'series', lineClass: 'series-line', zeroY: 50, top: 0, base: 100 });
    expect([...s.querySelectorAll('path[class]')].map(p => p.getAttribute('class'))).toEqual(['series-line', 'series-line export']);
    expect(s.querySelectorAll('clipPath').length).toBe(4);
    expect(s.querySelectorAll('stop.export').length).toBeGreaterThan(0);
  });

  it('draws one trace without the split', () => {
    const s = svg();
    C.createKit().trace(s, { line: 'M0 0L10 90', kind: 'series', lineClass: 'series-line', zeroY: 50, top: 0, base: 100, split: false });
    expect([...s.querySelectorAll('path')].map(p => p.getAttribute('class'))).toEqual(['series-line']);
  });

  it('draws bars from the base, skipping empty ones, and marks the selected one', () => {
    const s = svg();
    C.createKit().bars(s, { list: [{ x: 0, w: 8, v: 10 }, { x: 10, w: 8, v: null }, { x: 20, w: 8, v: -5 }], y: (v: number) => 50 - v * 4,
      baseY: 50, zeroY: 50, base: 100, cls: 'series-bars', selected: 2 });
    const rects = [...s.querySelectorAll('rect')];
    expect(rects.map(r => [r.getAttribute('y'), r.getAttribute('height')])).toEqual([['10', '40'], ['50', '20']]);
    expect(rects[1].getAttribute('class')).toBe('bar selected');
  });

  it('gives each kit its own ids', () => {
    const a = svg(), b = svg();
    C.createKit().gradient(a, 'x', [[0, 1]]);
    C.createKit().gradient(b, 'x', [[0, 1]]);
    expect(a.querySelector('linearGradient')!.id).not.toBe(b.querySelector('linearGradient')!.id);
  });
});

describe('tap to inspect', () => {
  it('keeps a touch selection 3 s after the finger lifts, and resets a mouse one on leave', () => {
    vi.useFakeTimers();
    const s = svg();
    const scrub = vi.fn(), reset = vi.fn();
    C.attachScrub(s, scrub, reset, { timer: null });
    s.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }));
    expect(scrub).toHaveBeenCalledTimes(1);
    s.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch' }));
    vi.advanceTimersByTime(2900);
    expect(reset).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(reset).toHaveBeenCalledTimes(1);
    s.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    expect(reset).toHaveBeenCalledTimes(2);
  });
});

describe('bars on the local clock', () => {
  const at = (iso: string) => new Date(iso).getTime();
  const local = (ms: number) => new Date(ms).toString().slice(4, 21);

  it('steps by days and calendar months, across a DST change and month lengths', () => {
    const days = C.buckets([], at('2026-10-24T00:00'), at('2026-10-27T00:00'), 24 * 36e5);
    expect(days.map((b: any) => [local(b.t), (b.end - b.t) / 36e5])).toEqual([['Oct 24 2026 00:00', 24], ['Oct 25 2026 00:00', 25], ['Oct 26 2026 00:00', 24]]);
    const months = C.buckets([], at('2026-01-01T00:00'), at('2026-04-01T00:00'), 'month');
    expect(months.map((b: any) => local(b.t))).toEqual(['Jan 01 2026 00:00', 'Feb 01 2026 00:00', 'Mar 01 2026 00:00']);
    expect(months.map((b: any) => Math.round((b.end - b.t) / 864e5))).toEqual([31, 28, 31]);
    // The average of each day's points, as with lengths.
    expect(C.buckets([[at('2026-10-24T06:00'), 1], [at('2026-10-24T18:00'), 3], [at('2026-10-26T12:00'), 7]], at('2026-10-24T00:00'), at('2026-10-27T00:00'), 24 * 36e5)
      .map((b: any) => b.v)).toEqual([2, 3, 7]);
  });

  it('steps by calendar weeks from Monday', () => {
    const weeks = C.buckets([], at('2026-10-01T00:00'), at('2026-10-31T00:00'), 'week');
    expect(weeks.map((b: any) => local(b.t))).toEqual(['Oct 01 2026 00:00', 'Oct 05 2026 00:00', 'Oct 12 2026 00:00', 'Oct 19 2026 00:00', 'Oct 26 2026 00:00']);
    // The week holding the DST change (25 Oct) is an hour longer.
    expect((weeks[3].end - weeks[3].t) / 36e5).toBe(7 * 24 + 1);
  });

  it("gives each bar its points' lowest, highest or last value, else the last before", () => {
    const pts = [[at('2026-10-24T06:00'), 1], [at('2026-10-24T18:00'), 3], [at('2026-10-24T20:00'), 2], [at('2026-10-26T12:00'), 7]];
    const by = (agg: string) => C.buckets(pts, at('2026-10-24T00:00'), at('2026-10-27T00:00'), 24 * 36e5, null, agg).map((b: any) => b.v);
    expect(by('min')).toEqual([1, 2, 7]);
    expect(by('max')).toEqual([3, 2, 7]);
    expect(by('last')).toEqual([2, 2, 7]);
    expect(by('avg')).toEqual([2, 2, 7]);
  });
});

describe('barUnit', () => {
  const H = 36e5, D = 24 * H;
  it('keeps the bars Charts drew for each span', () => {
    const rolling = { '1h': [H, 5 * 6e4], '6h': [6 * H, 15 * 6e4], '24h': [D, H], '2d': [2 * D, 2 * H], '3d': [3 * D, 3 * H], '5d': [5 * D, 6 * H], '7d': [7 * D, 6 * H] };
    for (const [span, [ms, bar]] of Object.entries(rolling)) expect([span, C.barUnit(0, ms)]).toEqual([span, bar]);
    expect(C.barUnit(0, 25 * H, 'day')).toBe(H); // a DST day
    expect(C.barUnit(0, 7 * D, 'week')).toBe(D);
    expect(C.barUnit(0, 31 * D, 'month')).toBe(D);
    expect(C.barUnit(0, 365 * D, 'year')).toBe('month');
  });

  it('gives any other span at most 28 bars, up to calendar weeks and months', () => {
    expect(C.barUnit(0, 40 * 6e4)).toBe(2 * 6e4); // 40 minutes: 20 bars of 2 min
    expect(C.barUnit(0, 10 * D)).toBe(12 * H);
    expect(C.barUnit(0, 3 * D, 'day')).toBe(3 * H); // three whole days
    expect(C.barUnit(0, 60 * D)).toBe('week');
    expect(C.barUnit(0, 2 * 365 * D)).toBe('month');
  });
});

describe('ticks', () => {
  it('runs from zero by default, in whole steps above and below it', () => {
    expect(C.ticks({ max: 830 })).toEqual({ step: 500, axisMin: 0, axisMax: 1000, k: 2, zeroIndex: null });
    expect(C.ticks({ max: 4, min: -2 })).toEqual({ step: 2, axisMin: -2, axisMax: 4, k: 3, zeroIndex: 1 });
  });

  it('fits a range when asked, marking zero where it crosses', () => {
    expect(C.ticks({ max: 23.4, min: 18.2, fit: true })).toEqual({ step: 2, axisMin: 18, axisMax: 24, k: 3, zeroIndex: null });
    expect(C.ticks({ max: 3, min: -4, fit: true })).toEqual({ step: 2.5, axisMin: -5, axisMax: 5, k: 4, zeroIndex: 2 });
    // A flat range: one small step either side.
    expect(C.ticks({ max: 20, min: 20, fit: true })).toEqual({ step: 1, axisMin: 19, axisMax: 21, k: 2, zeroIndex: null });
  });
});

describe('useBuckets', () => {
  const H = 36e5;
  const t0 = new Date('2026-10-28T00:00').getTime();
  /** A running total rising 1 an hour, a point at each hour's middle from `from` to `to` (hours after t0). */
  const total = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => [t0 + (from + i + 0.5) * H, from + i + 0.5]);

  it("is each bar's rise, read off the line through the points", () => {
    expect(C.useBuckets(total(-1, 6), t0, t0 + 6 * H, 2 * H).map((b: any) => b.v)).toEqual([2, 2, 2]);
  });

  it('ends at the total now, for the bar under way', () => {
    // The last point is 2.5 at 02:30; 10 at 05:00 makes the line rise 3 an hour from there.
    expect(C.useBuckets(total(-1, 3), t0, t0 + 5 * H, 2 * H, 10).map((x: any) => x.v)).toEqual([2, 5, 3]);
  });

  it('goes on at the last rate for a step and a half past the last point, then holds', () => {
    // Points 6 h apart, the last at 03:00 of a day that ends at 24:00, as a closed month's 6-hour log.
    const six = [[t0 - 3 * H, 0], [t0 + 3 * H, 6], [t0 + 9 * H, 12], [t0 + 15 * H, 18]];
    const b = C.useBuckets(six, t0, t0 + 24 * H, 6 * H);
    expect(b.map((x: any) => x.v)).toEqual([6, 6, 6, 6]); // 15:00 + 9 h reaches 24:00
    const hold = C.useBuckets(six, t0, t0 + 48 * H, 12 * H).map((x: any) => x.v);
    expect(hold).toEqual([12, 12, 0, 0]);
  });

  it('has no bar before the first point, and counts from it for the bar it lies in', () => {
    const b = C.useBuckets(total(5, 8), t0, t0 + 8 * H, 2 * H).map((x: any) => x.v);
    expect(b[0]).toBeNull();
    expect(b[1]).toBeNull();
    expect(b[2]).toBeCloseTo(2, 6); // 04:00–06:00: back from 05:30 at the same rate
    expect(C.useBuckets([], t0, t0 + 4 * H, 2 * H).map((x: any) => x.v)).toEqual([null, null]);
  });
});

describe('meterTotal', () => {
  it('carries a running total on with live values, as the app counts the history', () => {
    const m = { offset: 800, high: 30 };
    expect(C.meterTotal(m, 31)).toBe(831);
    expect(C.meterTotal(m, 30.5)).toBe(831); // a dip holds
    expect(C.meterTotal(m, 2)).toBe(833); // a reset: counts on from 0
    expect(m).toEqual({ offset: 831, high: 2 });
    expect(C.meterTotal({ offset: 0, high: null }, 5)).toBe(5);
  });
});

describe('calendarLabels', () => {
  const at = (iso: string) => new Date(iso).getTime();

  it("names a week's days, a month's every seventh day and a year's months, with lines between", () => {
    const week = C.calendarLabels('week', at('2026-10-26T00:00'), at('2026-11-02T00:00'), 'en', false);
    expect(week.labels.map((l: any) => l.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(week.lines).toHaveLength(6);
    expect(C.calendarLabels('week', at('2026-10-26T00:00'), at('2026-11-02T00:00'), 'da', true).labels.map((l: any) => l.label).join('')).toBe('MTOTFLS');
    const month = C.calendarLabels('month', at('2026-10-01T00:00'), at('2026-11-01T00:00'), 'en', false);
    expect(month.labels.map((l: any) => l.label)).toEqual(['1', '8', '15', '22', '29']);
    expect(month.lines.map((t: number) => new Date(t).getDate())).toEqual([8, 15, 22, 29]);
    const year = C.calendarLabels('year', at('2026-01-01T00:00'), at('2027-01-01T00:00'), 'en', false);
    expect(year.labels).toHaveLength(12);
    expect(year.labels[2].label).toBe('Mar');
    expect(new Date(year.labels[2].at).getDate()).toBe(16); // mid-month
    expect(year.lines).toHaveLength(11);
    expect(C.calendarLabels('day', at('2026-10-28T00:00'), at('2026-10-29T00:00'), 'en', false)).toEqual({ labels: [], lines: [] });
  });

  it("falls back to the screen's language for one Intl doesn't know", () => {
    expect(() => C.calendarLabels('year', at('2026-01-01T00:00'), at('2027-01-01T00:00'), 'not a tag!', true)).not.toThrow();
  });
});

describe('axisLabel', () => {
  it('writes thousands as k with the decimals the value needs', () => {
    expect(C.axisLabel(nf, 1250, 250)).toBe('1,25k');
    expect(C.axisLabel(nf, 2.5, 0.5)).toBe('2,5');
    expect(C.axisLabel(nf, -40, 20)).toBe('−40');
  });
});
