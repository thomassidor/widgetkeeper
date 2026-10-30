// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWidget } from './helpers/loadWidget.js';

const MIN = 60e3;
const HOUR = 60 * MIN;
const NOW = new Date('2026-01-15T10:20:00').getTime(); // Europe/Copenhagen (vitest.config.ts)

let win: any;
beforeAll(() => { win = loadWidget('charts'); });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.body.innerHTML = '';
});
afterEach(() => { vi.useRealTimers(); });

const cap = (extra: Record<string, unknown> = {}) => ({ title: 'Temperature', type: 'number', units: '°C', decimals: 1, min: null, max: null, values: null, icon: null, ...extra });
/** 120 points over the span ending now, from `f(x)` with x 0…1. */
const series = (spanMs: number, f: (x: number) => number) =>
  Array.from({ length: 120 }, (_, i) => [NOW - spanMs + (i + 0.5) * spanMs / 120, f(i / 119)] as [number, number]);
const entry = (points: [number, number][], extra: Record<string, unknown> = {}) => ({
  deviceId: 'd1', capabilityId: 'measure_temperature', name: 'Living room', capability: cap(), value: points.at(-1)![1], points, ...extra,
});

/** A header number as the widget writes it: in the system locale (its `formatNumber()` doesn't take `opts.locale`). */
const num = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

function widget(charts: Record<string, unknown>[], state: any[], opts: Record<string, unknown> = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createChartsWidget(root, { locale: 'da-DK', language: 'da', now: () => Date.now(), charts, ...opts });
  w.setState(state);
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const shown = (el: HTMLElement | null) => !!el && el.style.display !== 'none';
  const header = () => all('.ew-hcol').map(c => `${c.querySelector('.ew-hval')!.textContent} | ${c.querySelector('.ew-hsub')!.textContent}`);
  const yLabels = (i = 0) => all('.ch-chart')[i].querySelectorAll('text');
  return { w, root, q, all, shown, header, yLabels };
}

describe('charts', () => {
  it('draws one chart with its chip, header, line, area and dot', () => {
    const { q, all, header } = widget([{ span: '24h' }], [entry(series(24 * HOUR, x => 20 + x * 2))]);
    expect(all('.ch-chart').length).toBe(1);
    expect(q('.ew-chip')!.textContent).toBe('Living room · Temperature – °C');
    expect(header()).toEqual(['22°C | Now']);
    expect(q('.series-line')).not.toBeNull();
    expect(all('path[fill^="url"]').length).toBe(1); // the area
    expect(q('.dot-core.series')).not.toBeNull();
    expect(q('.ch-chart')!.dataset.color).toBe('blue');
  });

  it('stacks two charts, each in its own colour', () => {
    const { all, header } = widget([{ span: '24h' }, { span: '6h', color: 'green', style: 'bars' }],
      [entry(series(24 * HOUR, x => 20 + x)), entry(series(6 * HOUR, x => 500 + x * 1000), { deviceId: 'd2', capabilityId: 'measure_power', capability: cap({ title: 'Power', units: 'W', decimals: 0 }) })]);
    expect(all('.ch-chart').map(c => c.dataset.color)).toEqual(['blue', 'green']);
    expect(header()).toEqual(['21°C | Now', `${num(1500)}W | Now`]);
    expect(all('.ch-chart')[1].querySelectorAll('rect.bar').length).toBeGreaterThan(20);
  });

  it('draws a line without an area', () => {
    const { q, all } = widget([{ style: 'line' }], [entry(series(24 * HOUR, x => 20 + x))]);
    expect(q('.series-line')).not.toBeNull();
    expect(all('path[fill^="url"]').length).toBe(0);
  });

  it('hides the header when asked', () => {
    const { q, shown } = widget([{}], [entry(series(24 * HOUR, x => 20 + x))], { showHeader: false });
    expect(shown(q('.ew-header'))).toBe(false);
  });

  it('uses a title of its own', () => {
    const { q } = widget([{ title: '  Stue ' }], [entry(series(24 * HOUR, x => 20 + x))]);
    expect(q('.ew-chip')!.textContent).toBe('Stue – °C');
  });

  it('falls back on unknown settings', () => {
    const { q } = widget([{ span: 'x', style: 'pie', color: 'pink', range: 'odd' }], [entry(series(24 * HOUR, x => 20 + x))]);
    expect(q('.ch-chart')!.dataset.color).toBe('blue');
    expect(q('.series-line')).not.toBeNull();
    expect([...q('.ch-chart')!.querySelectorAll('text')].map(t => t.textContent)).not.toContain('0'); // fit
  });
});

describe('scale', () => {
  const temps = () => [entry(series(24 * HOUR, x => 19.3 + x * 3.8))];
  const labels = (r: ReturnType<typeof widget>) => [...r.yLabels()].map(t => t.textContent);

  it('fits the values by default', () => {
    const l = labels(widget([{}], temps()));
    expect(l).toContain('24');
    expect(l).not.toContain('0');
  });

  it('starts at zero when asked', () => {
    expect(labels(widget([{ range: 'zero' }], temps()))).toContain('0');
  });

  it('labels decimals and thousands from the step', () => {
    expect(labels(widget([{}], [entry(series(24 * HOUR, x => 0.2 + x * 0.5))]))).toContain('0,4');
    expect(labels(widget([{ range: 'zero' }], [entry(series(24 * HOUR, x => 500 + x * 3000))]))).toContain('2k');
  });

  it('shows a 0–1 percentage as 0–100', () => {
    const r = widget([{ range: 'zero' }], [entry(series(24 * HOUR, x => x), { capability: cap({ title: 'Dim', units: '%', decimals: 2, min: 0, max: 1 }) })]);
    expect(labels(r)).toContain('100');
    expect(r.header()).toEqual(['100% | Now']);
  });
});

describe('below zero', () => {
  const outdoor = () => [entry(series(24 * HOUR, x => -4 + x * 8))];

  it('is one colour with a zero line by default', () => {
    const { all, q } = widget([{}], outdoor());
    expect(all('.series-line').length).toBe(1);
    expect(q('.ch-chart path.axis + path, .ch-chart path.axis')).not.toBeNull();
    expect(q('.export')).toBeNull();
  });

  it('is yellow with the setting, as the Electricity Overview draws export', () => {
    const { all } = widget([{ negative: true }], outdoor());
    expect(all('.series-line').map(p => p.getAttribute('class'))).toEqual(['series-line', 'series-line export']);
  });

  it('colours the header and dot when the value now is below zero', () => {
    const { q } = widget([{ negative: true }], [entry(series(24 * HOUR, x => 4 - x * 8))]);
    expect(q('.ch-value')!.classList.contains('export')).toBe(true);
    expect(q('.dot-core.series.export')).not.toBeNull();
  });

  it('splits bars too', () => {
    const { all } = widget([{ negative: true, style: 'bars' }], outdoor());
    expect(all('g.series-bars').length).toBe(2);
    expect(all('g.series-bars.export').length).toBe(1);
  });
});

describe('bars', () => {
  it('averages the points into clock buckets, carrying the last value over gaps', () => {
    const t0 = new Date('2026-01-15T08:00:00').getTime();
    const b = win.chartBuckets([[t0 - 10 * MIN, 1], [t0 + 10 * MIN, 2], [t0 + 20 * MIN, 4], [t0 + 130 * MIN, 9]], t0 - 30 * MIN, t0 + 150 * MIN, HOUR);
    expect(b.map((x: any) => [new Date(x.t).toTimeString().slice(0, 5), new Date(x.end).toTimeString().slice(0, 5), x.v]))
      .toEqual([['07:30', '08:00', 1], ['08:00', '09:00', 3], ['09:00', '10:00', 4], ['10:00', '10:30', 9]]);
  });

  it('leaves the bars before the first value empty', () => {
    const t0 = new Date('2026-01-15T08:00:00').getTime();
    expect(win.chartBuckets([[t0 + 90 * MIN, 5]], t0, t0 + 2 * HOUR, HOUR).map((x: any) => x.v)).toEqual([null, 5]);
  });

  it('uses about 24 hourly bars over 24 h', () => {
    const { all } = widget([{ style: 'bars' }], [entry(series(24 * HOUR, x => 20 + x))]);
    expect(all('rect.bar').length).toBe(25); // the first and last hours cut by the span
  });
});

describe('tap to inspect', () => {
  it('shows the tapped point in the header with its time, then goes back to now', () => {
    const r = widget([{}], [entry(series(24 * HOUR, x => 20 + x * 2))]);
    const svg = r.q('.ch-chart svg')!;
    svg.dispatchEvent(new PointerEvent('pointerdown', { clientX: 38 + 163, pointerType: 'touch' }));
    const [h] = r.header();
    expect(h).toMatch(/^21([,.]\d)?°C \| \d\d:\d\d$/);
    expect(r.q('.cursor')).not.toBeNull();
    svg.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch' }));
    vi.advanceTimersByTime(3100);
    expect(r.header()).toEqual(['22°C | Now']);
  });

  it('shows a tapped bar with its time range, and the weekday over longer spans', () => {
    const r = widget([{ style: 'bars', span: '7d' }], [entry(series(7 * 24 * HOUR, x => 20 + x * 2))]);
    r.q('.ch-chart svg')!.dispatchEvent(new PointerEvent('pointerdown', { clientX: 38 + 100, pointerType: 'mouse' }));
    expect(r.header()[0]).toMatch(/\| \S+ \d\d:\d\d–\d\d:\d\d$/);
    expect(r.q('rect.bar.selected')).not.toBeNull();
  });

  it("rounds a tapped bar and an average to three digits, not the meter's two decimals; the value now stays", () => {
    // A meter with 2 decimals (the real frient one): its averages came out as 1.304,48 W.
    const power = cap({ title: 'Power', units: 'W', decimals: 2 });
    const pts = series(24 * HOUR, x => 1304.4801 + x * 0.01);
    const r = widget([{ style: 'bars' }], [entry(pts, { capability: power, value: 1589.25 })]);
    expect(r.header()).toEqual([`${(1589.25).toLocaleString()}W | Now`]);
    r.q('.ch-chart svg')!.dispatchEvent(new PointerEvent('pointerdown', { clientX: 38 + 100, pointerType: 'mouse' }));
    expect(r.header()[0]).toMatch(new RegExp(`^${(1304).toLocaleString()}W \\|`));
    const y0 = new Date('2026-01-14T00:00:00').getTime();
    const day = Array.from({ length: 96 }, (_, k) => [y0 + (k + 0.5) * 15 * MIN, 1304.48 + (k % 2) * 0.01] as [number, number]);
    const y = widget([{ span: 'yesterday' }], [entry(day, { capability: power })]);
    expect(y.header()).toEqual([`${(1304).toLocaleString()}W | Yesterday · avg`]);
  });
});

describe('today and yesterday', () => {
  const L = 38, PW = 368 - L - 4; // the chart module's left gutter; the plot's width at the default 368 px
  const MIDNIGHT = new Date('2026-01-15T00:00:00').getTime();
  /** 120 points over `[from, to]`, from `f(x)` with x 0…1. */
  const between = (from: number, to: number, f: (x: number) => number) =>
    Array.from({ length: 120 }, (_, i) => [from + (i + 0.5) * (to - from) / 120, f(i / 119)] as [number, number]);
  const xLabels = (r: ReturnType<typeof widget>) => [...r.q('.ch-chart svg')!.querySelectorAll('text')]
    .filter(t => t.getAttribute('dominant-baseline') === 'hanging').map(t => t.textContent);

  it('draws today over the whole day, the line up to now', () => {
    const r = widget([{ span: 'today' }], [entry(between(MIDNIGHT - 24 * HOUR, NOW, x => 20 + x * 2))]);
    expect(r.header()).toEqual(['22°C | Now']);
    expect(xLabels(r)).toEqual(['6:00', '12:00', '18:00']); // no Now at the right end: that's midnight
    const cx = Number(r.q('.dot-core.series')!.getAttribute('cx'));
    expect(cx).toBeCloseTo(L + PW * (NOW - MIDNIGHT) / (24 * HOUR), 0);
    // Yesterday's points are left out.
    expect([...r.yLabels()].map(t => t.textContent)).not.toContain('20');
  });

  it("puts today's bars up to now, an hour each", () => {
    const r = widget([{ span: 'today', style: 'bars' }], [entry(between(MIDNIGHT, NOW, x => 20 + x))]);
    expect(r.all('rect.bar').length).toBe(11); // 00:00 … 10:00
  });

  it('draws yesterday up to midnight, its average in the header', () => {
    const y = MIDNIGHT - 24 * HOUR;
    const pts = between(y, MIDNIGHT, x => (x < 0.5 ? 10 : 20)).concat(between(MIDNIGHT, NOW, () => 99));
    const r = widget([{ span: 'yesterday' }], [entry(pts, { value: 99 })]);
    expect(r.header()).toEqual(['15°C | Yesterday · avg']);
    expect(xLabels(r)).toEqual(['6:00', '12:00', '18:00']);
    // The line ends at midnight, without today's values or the value now carried on.
    const cx = Number(r.q('.dot-core.series')!.getAttribute('cx'));
    expect(cx).toBeGreaterThan(L + PW - 3);
    expect([...r.yLabels()].map(t => t.textContent)).not.toContain('99');
  });

  it('leaves out live values on yesterday', () => {
    const y = MIDNIGHT - 24 * HOUR;
    const r = widget([{ span: 'yesterday' }], [entry(between(y, MIDNIGHT, () => 10))]);
    r.w.pushChange({ deviceId: 'd1', capabilityId: 'measure_temperature', value: 50 });
    expect(r.header()).toEqual(['10°C | Yesterday · avg']);
  });

  it('is 25 hours on the day DST ends', () => {
    const day = new Date('2026-10-25T00:00:00').getTime(); // Copenhagen: 03:00 → 02:00
    vi.setSystemTime(day + 20 * HOUR);
    const r = widget([{ span: 'today' }], [entry(between(day, day + 20 * HOUR, x => 20 + x))]);
    const noon = [...r.q('.ch-chart svg')!.querySelectorAll('text')].find(t => t.textContent === '12:00')!;
    expect(Number(noon.getAttribute('x'))).toBeCloseTo(L + PW * 13 / 25, 0);
  });

  it('moves on at midnight', () => {
    const r = widget([{ span: 'yesterday' }], [entry(between(MIDNIGHT - 24 * HOUR, MIDNIGHT, () => 10).concat(between(MIDNIGHT, NOW, () => 30)))]);
    expect(r.header()).toEqual(['10°C | Yesterday · avg']);
    vi.setSystemTime(MIDNIGHT + 24 * HOUR + 5 * MIN);
    r.w.render();
    expect(r.header()).toEqual(['30°C | Yesterday · avg']); // the 15th is yesterday now
  });

  describe('on one chart (wk-102)', () => {
    const PW2 = 368 - L - 34; // with the right scale
    // One capability twice, as the app answers it: each with its own day's history and the same value now.
    const today = (style?: string) => [{ span: 'today', style }, { span: 'yesterday', style, color: 'green' }];
    const days = () => [entry(between(MIDNIGHT, NOW, x => 20 + x * 2)), entry(between(MIDNIGHT - 24 * HOUR, MIDNIGHT, x => 10 + x * 20), { value: 22 })];
    const rightLabels = (r: ReturnType<typeof widget>) => r.all('.ch-chart svg text[text-anchor="start"]').map(t => t.textContent);
    const tap = (r: ReturnType<typeof widget>, hour: number) => r.q('.ch-chart svg')!
      .dispatchEvent(new PointerEvent('pointerdown', { clientX: L + PW2 * hour / 24, pointerType: 'mouse' }));
    const minutes = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3);

    it('draws today and yesterday, each by its time of day', () => {
      const r = widget(today(), days(), { overlay: true });
      const lines = r.all('g[data-color] .series-line');
      expect(lines.map(p => p.closest('g')!.getAttribute('data-color'))).toEqual(['blue', 'green']);
      expect(lines[0].getAttribute('d')).not.toBe(lines[1].getAttribute('d'));
      expect(rightLabels(r)).toContain('30'); // yesterday's own values, not today's again
      const [a, b] = r.all('g[data-color] .dot-core').map(c => +c.getAttribute('cx')!);
      expect(a).toBeCloseTo(L + PW2 * (NOW - MIDNIGHT) / (24 * HOUR), 0); // today up to now
      expect(b).toBeGreaterThan(L + PW2 - 3); // yesterday up to midnight
      expect(r.header()).toEqual(['22°C | Now', '20°C | Yesterday · avg']);
      expect(xLabels(r)).toEqual(['6:00', '12:00', '18:00']);
    });

    it("puts yesterday's bars beside today's, an hour each", () => {
      const r = widget(today('bars'), days(), { overlay: true });
      const [a, b] = r.all('g.series-bars').map(g => [...g.querySelectorAll('rect.bar')]);
      expect([a.length, b.length]).toEqual([11, 24]);
      const k = 5;
      const ax = +a[k].getAttribute('x')!, aw = +a[k].getAttribute('width')!, bx = +b[k].getAttribute('x')!;
      expect(bx).toBeGreaterThan(ax + aw - 0.01);
      expect(bx).toBeLessThan(ax + 2 * aw + 2);
    });

    it('keeps live values off yesterday', () => {
      const r = widget(today(), days(), { overlay: true });
      r.w.pushChange({ deviceId: 'd1', capabilityId: 'measure_temperature', value: 50 });
      expect(r.header()).toEqual(['50°C | Now', '20°C | Yesterday · avg']);
    });

    it('shows both days at the tapped time of day, only yesterday after now', () => {
      const r = widget(today(), days(), { overlay: true });
      tap(r, 6);
      const [a, b] = r.header().map(h => h.split(' | ')[1]);
      expect(Math.abs(minutes(a) - 360)).toBeLessThan(10);
      expect(Math.abs(minutes(b) - 360)).toBeLessThan(10);
      tap(r, 18);
      const [c, d] = r.header().map(h => h.split(' | ')[1]);
      expect(c).toBe('Now');
      expect(Math.abs(minutes(d) - 18 * 60)).toBeLessThan(10);
    });

    it("gives series 2 chart 1's span unless both are days", () => {
      const r = widget([{ span: 'today' }, { span: '24h', style: 'bars' }], [entry(between(MIDNIGHT, NOW, () => 20)), entry(series(24 * HOUR, () => 30))], { overlay: true });
      expect(r.all('rect.bar').length).toBe(11); // today's hours, not 24 h's
      const r2 = widget([{ span: '24h' }, { span: 'yesterday', style: 'bars' }], [entry(series(24 * HOUR, () => 20)), entry(series(24 * HOUR, () => 30))], { overlay: true });
      expect(r2.all('rect.bar').length).toBe(25); // the last 24 h, not yesterday
      expect(r2.header()[1]).toBe('30°C | Now');
    });
  });
});

describe('weeks, months and years (wk-104)', () => {
  // NOW is Thursday 15 January 2026, 10:20.
  const L = 38, PW = 368 - L - 4;
  const at = (s: string) => new Date(s).getTime();
  const kit = () => win.WidgetkeeperKit;
  const between = (from: number, to: number, f: (x: number) => number, n = 120) =>
    Array.from({ length: n }, (_, i) => [from + (i + 0.5) * (to - from) / n, f(i / (n - 1))] as [number, number]);
  const xLabels = (r: ReturnType<typeof widget>) => [...r.q('.ch-chart svg')!.querySelectorAll('text')]
    .filter(t => t.getAttribute('dominant-baseline') === 'hanging').map(t => t.textContent);
  const da = (ms: number, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('da', o).format(new Date(ms));
  const tap = (r: ReturnType<typeof widget>, x: number) => r.q('.ch-chart svg')!
    .dispatchEvent(new PointerEvent('pointerdown', { clientX: L + x, pointerType: 'mouse' }));
  const MON = at('2026-01-12T00:00:00');
  const DAY = 24 * HOUR;

  describe("the kit's timeSpan()", () => {
    const span = (s: string, now = NOW) => kit().timeSpan(s, now);

    it('goes back by whole periods with `back` (Chart · Totals\' period before), across month lengths', () => {
      const back = (s: string, n: number, now = NOW) => kit().timeSpan(s, now, n);
      expect(back('thisWeek', 1)).toEqual(span('lastWeek'));
      expect(back('thisMonth', 1)).toEqual(span('lastMonth'));
      expect(back('thisYear', 1)).toEqual(span('lastYear'));
      expect(back('today', 1)).toEqual(span('yesterday'));
      const march31 = new Date(2026, 2, 31, 12).getTime();
      expect(new Date(back('lastMonth', 1, march31).from).getMonth()).toBe(0); // January: the month before February
      expect(back('6h', 1)).toEqual({ from: NOW - 12 * 36e5, to: NOW - 6 * 36e5, end: NOW - 6 * 36e5 });
    });

    it('is the whole local week from Monday: this one up to now, the last one to its end', () => {
      expect(span('thisWeek')).toEqual({ from: MON, to: MON + 7 * DAY, end: NOW, unit: 'week' });
      expect(span('lastWeek')).toEqual({ from: MON - 7 * DAY, to: MON, end: MON, unit: 'week' });
      expect(span('thisWeek', at('2026-01-18T23:30:00')).from).toBe(MON); // a Sunday
      expect(span('thisWeek', at('2026-01-19T00:00:00')).from).toBe(MON + 7 * DAY); // the next Monday
    });

    it('is 169 hours over the week DST ends', () => {
      const w = span('lastWeek', at('2026-10-27T12:00:00'));
      expect([w.from, w.to]).toEqual([at('2026-10-19T00:00:00'), at('2026-10-26T00:00:00')]);
      expect(w.to - w.from).toBe(169 * HOUR);
    });

    it('is the whole local month and year', () => {
      expect(span('thisMonth')).toEqual({ from: at('2026-01-01T00:00:00'), to: at('2026-02-01T00:00:00'), end: NOW, unit: 'month' });
      expect(span('lastMonth')).toMatchObject({ from: at('2025-12-01T00:00:00'), to: at('2026-01-01T00:00:00'), end: at('2026-01-01T00:00:00') });
      expect(span('lastMonth', at('2026-03-31T12:00:00'))).toMatchObject({ from: at('2026-02-01T00:00:00'), to: at('2026-03-01T00:00:00') });
      expect(span('thisMonth', at('2028-02-10T12:00:00')).to - span('thisMonth', at('2028-02-10T12:00:00')).from).toBe(29 * DAY);
      expect(span('thisYear')).toEqual({ from: at('2026-01-01T00:00:00'), to: at('2027-01-01T00:00:00'), end: NOW, unit: 'year' });
      expect(span('lastYear')).toMatchObject({ from: at('2025-01-01T00:00:00'), to: at('2026-01-01T00:00:00'), end: at('2026-01-01T00:00:00') });
    });

    it('names the unit of a calendar span only', () => {
      expect(span('lastYear').unit).toBe('year');
      expect(kit().isTimeSpan('lastYear')).toBe(true);
      expect(span('7d').unit).toBeUndefined();
    });

    it('takes any number of a unit (1.2.0): the last so many up to now, or whole periods', () => {
      expect(kit().parseSpan('40m')).toEqual({ count: 40, unit: 'minute', whole: false, skip: false });
      expect(kit().parseSpan('3mo!-')).toEqual({ count: 3, unit: 'month', whole: true, skip: true });
      expect(['0h', '5h!', '2d-', '1x', 'today!', ''].map(kit().parseSpan)).toEqual([null, null, null, null, null, null]);
      expect(span('40m')).toEqual({ from: NOW - 40 * 6e4, to: NOW, end: NOW });
      expect(span('2w')).toEqual({ from: NOW - 14 * DAY, to: NOW, end: NOW });
      // Months and years back on the calendar, the 31st to the month's last day.
      expect(span('3mo', at('2026-05-31T12:00:00'))).toEqual({ from: at('2026-02-28T12:00:00'), to: at('2026-05-31T12:00:00'), end: at('2026-05-31T12:00:00') });
      expect(span('1y').from).toBe(new Date(2025, 0, new Date(NOW).getDate(), new Date(NOW).getHours(), new Date(NOW).getMinutes()).getTime());
      // Whole periods: the current one in, or with `-` left out; `back` steps by all of them.
      expect(span('2w!')).toEqual({ from: MON - 7 * DAY, to: MON + 7 * DAY, end: NOW, unit: 'week' });
      expect(span('2w!-')).toEqual({ from: MON - 14 * DAY, to: MON, end: MON, unit: 'week' });
      expect(kit().timeSpan('3mo!', NOW, 1)).toMatchObject({ from: at('2025-08-01T00:00:00'), to: at('2025-11-01T00:00:00') });
      // The names of before are whole periods.
      expect(span('1d!-')).toEqual(span('yesterday'));
      expect(span('1y!')).toEqual(span('thisYear'));
      // At most two years.
      expect(kit().parseSpan('9y')!.count).toBe(2);
    });

    it("reads a chart's span from its settings, keeping one stored before 1.2.0", () => {
      const of = (s: Record<string, unknown>, n = 1) => kit().spanSetting(s, n);
      expect(of({ count1: 3, span1: 'days' })).toBe('3d');
      expect(of({ count1: 1, span1: 'calDays', leaveOut1: true })).toBe('1d!-');
      expect(of({ count1: 2, span1: 'calMonths' })).toBe('2mo!');
      expect(of({ count1: 2, span1: 'months', leaveOut1: true })).toBe('2mo'); // only whole periods leave one out
      expect(of({ span1: 'yesterday', count1: 5 })).toBe('yesterday');
      expect(of({ span1: '7d' })).toBe('7d');
      expect(of({})).toBe('24h');
      expect(kit().spanSetting({}, '', { count: 1, unit: 'calWeeks' })).toBe('1w!');
      // The web editor shows a stored one as its number and unit.
      expect(kit().spanFields('7d', 2)).toEqual({ count2: 7, span2: 'days', leaveOut2: false });
      expect(kit().spanFields('lastMonth', 1)).toEqual({ count1: 1, span1: 'calMonths', leaveOut1: true });
      expect([kit().spanFields('hours', 1), kit().spanFields(undefined, 1)]).toEqual([{}, {}]);
      // … which is the same window.
      for (const old of ['1h', '24h', 'today', 'yesterday', '5d', 'thisWeek', 'lastYear']) expect(span(of(kit().spanFields(old, 1)))).toEqual(span(old));
    });
  });

  describe('chartBuckets', () => {
    it('makes a bar a day over the week DST ends, each from midnight', () => {
      const from = at('2026-10-19T00:00:00'), to = at('2026-10-26T00:00:00');
      const b = win.chartBuckets(between(from, to, () => 5), from, to, DAY);
      expect(b.map((x: any) => new Date(x.t).getDate())).toEqual([19, 20, 21, 22, 23, 24, 25]);
      expect(b.map((x: any) => (x.end - x.t) / HOUR)).toEqual([24, 24, 24, 24, 24, 24, 25]);
    });

    it('makes a bar a calendar month over a year', () => {
      const from = at('2025-01-01T00:00:00'), to = at('2026-01-01T00:00:00');
      const b = win.chartBuckets(between(from, to, x => x), from, to, 'month');
      expect(b.map((x: any) => [new Date(x.t).getMonth(), new Date(x.t).getDate()])).toEqual(Array.from({ length: 12 }, (_, m) => [m, 1]));
      expect(b.at(-1).end).toBe(to);
    });
  });

  it('draws last week Monday to Sunday: a weekday a day, midnights, its average', () => {
    const r = widget([{ span: 'lastWeek' }], [entry(between(MON - 7 * DAY, MON, x => (x < 0.5 ? 10 : 20)).concat(between(MON, NOW, () => 99)), { value: 99 })]);
    expect(xLabels(r)).toEqual(Array.from({ length: 7 }, (_, k) => da(MON - 7 * DAY + k * DAY + 12 * HOUR, { weekday: 'short' })));
    expect(r.q('path.midnight')!.getAttribute('d')!.match(/M/g)).toHaveLength(6);
    expect(r.header()).toEqual(['15°C | Last week · avg']);
    expect([...r.yLabels()].map(t => t.textContent)).not.toContain('99');
  });

  it("puts this week's bars up to today, a day each, and names a tapped one by its date", () => {
    const r = widget([{ span: 'thisWeek', style: 'bars' }], [entry(between(MON, NOW, x => 20 + x))]);
    expect(r.all('rect.bar').length).toBe(4); // Monday … Thursday
    expect(r.header()[0]).toMatch(/\| Now$/);
    tap(r, PW * 1.5 / 7); // Tuesday
    expect(r.header()[0].split(' | ')[1]).toBe(da(MON + DAY, { weekday: 'short', day: 'numeric', month: 'short' }));
  });

  it("names today's bar by its date though it's cut short at now, and this year's month by its month", () => {
    const r = widget([{ span: 'thisWeek', style: 'bars' }], [entry(between(MON, NOW, x => 20 + x))]);
    tap(r, PW * 3.2 / 7); // Thursday, today: 00:00 to 10:20
    expect(r.header()[0].split(' | ')[1]).toBe(da(MON + 3 * DAY, { weekday: 'short', day: 'numeric', month: 'short' }));
    const y = widget([{ span: 'thisYear', style: 'bars' }], [entry(between(at('2026-01-01T00:00:00'), NOW, x => 20 + x))]);
    tap(y, 2); // January, 15 days of it
    expect(y.header()[0].split(' | ')[1]).toBe(da(at('2026-01-01T00:00:00'), { month: 'long', year: 'numeric' }));
  });

  it('labels a month on the 7th, 14th, 21st and 28th, without midnights or Now', () => {
    const dec = at('2025-12-01T00:00:00');
    const r = widget([{ span: 'lastMonth' }], [entry(between(dec, at('2026-01-01T00:00:00'), () => 5))]);
    expect(xLabels(r)).toEqual([7, 14, 21, 28].map(d => da(dec + (d - 1) * DAY + 12 * HOUR, { day: 'numeric', month: 'short' })));
    expect(r.q('path.midnight')).toBeNull();
    expect(r.header()).toEqual(['5°C | Last month · avg']);
  });

  it('labels any span by its length (1.2.0): minutes, dates, months, and finished periods by their dates', () => {
    const labels = (span: string, from: number) => xLabels(widget([{ span }], [entry(between(from, NOW, () => 5))]));
    expect(labels('40m', NOW - 40 * 6e4)).toEqual(['40m', '20m', 'Now']);
    // 30 days: the 7th, 14th … of each month, Now at the end.
    const days = labels('30d', NOW - 30 * DAY);
    expect(days).toContain('Now');
    expect(days).toContain(da(at('2026-01-07T12:00:00'), { day: 'numeric', month: 'short' }));
    // A rolling year and a half: the months from their 1st, January as its year.
    const months = labels('18mo', NOW - 548 * DAY);
    expect(months).toContain('2025');
    expect(months).toContain(da(at('2025-08-01T00:00:00'), { month: 'short' }));
    // The three months before this one: their average, named by their dates.
    const r = widget([{ span: '3mo!-' }], [entry(between(at('2025-10-01T00:00:00'), at('2026-01-01T00:00:00'), () => 5))]);
    const range = `${da(at('2025-10-01T00:00:00'), { day: 'numeric', month: 'short' })} – ${da(at('2025-12-31T12:00:00'), { day: 'numeric', month: 'short' })}`;
    expect(r.header()).toEqual([`5°C | ${range} · avg`]);
  });

  it("starts a month's line at its start with the 6 hours holding it, logged before it", () => {
    const dec = at('2025-12-01T00:00:00');
    const startX = (before: [number, number][]) => {
      const r = widget([{ span: 'lastMonth' }], [entry(before.concat(between(dec + 3 * HOUR, at('2026-01-01T00:00:00'), () => 5)), { step: 6 * HOUR })]);
      return Number(r.q('path.series-line')!.getAttribute('d')!.match(/^M\s*([\d.]+)/)![1]);
    };
    expect(startX([[dec - 2 * HOUR, 5]])).toBe(L);
    expect(startX([])).toBeGreaterThan(L);
    expect(startX([[dec - 7 * HOUR, 5]])).toBeGreaterThan(L); // older than those 6 hours
    // 6-hour averages by the step the app read them with (`/state`'s `step`), not by the span.
    expect([{ step: 6 * HOUR }, { step: 7 * DAY }].every(kit().sixHourLog)).toBe(true);
    expect([{ step: HOUR }, {}, null, { missing: true }].some(kit().sixHourLog)).toBe(false);
  });

  it('makes a bar a day over a month, the last month all of it', () => {
    const dec = at('2025-12-01T00:00:00');
    const r = widget([{ span: 'lastMonth', style: 'bars' }], [entry(between(dec, at('2026-01-01T00:00:00'), x => x, 124))]);
    expect(r.all('rect.bar').length).toBe(31);
    const t = widget([{ span: 'thisMonth', style: 'bars' }], [entry(between(at('2026-01-01T00:00:00'), NOW, x => x))]);
    expect(t.all('rect.bar').length).toBe(15);
  });

  it('labels a year by its months from their 1st, as many as fit, and a tapped month bar by name', () => {
    const y = at('2025-01-01T00:00:00');
    const r = widget([{ span: 'lastYear', style: 'bars' }], [entry(between(y, at('2026-01-01T00:00:00'), x => x))]);
    expect(r.all('rect.bar').length).toBe(12);
    // 27 px a month at 368 px: every other one.
    expect(xLabels(r)).toEqual([0, 2, 4, 6, 8, 10].map(m => da(new Date(2025, m, 1).getTime(), { month: 'short' })));
    tap(r, PW * 2.5 / 12); // March
    expect(r.header()[0].split(' | ')[1]).toBe(da(at('2025-03-01T00:00:00'), { month: 'long', year: 'numeric' }));
  });

  it("weighs a year's month bars by their length in its average", () => {
    const y = at('2025-01-01T00:00:00');
    // 100 in February, 0 the rest: 28 of 365 days, not 1 of 12 bars.
    const pts = between(y, at('2026-01-01T00:00:00'), () => 0, 365).map(([t]) => [t, new Date(t).getMonth() === 1 ? 100 : 0] as [number, number]);
    const r = widget([{ span: 'lastYear', style: 'bars' }], [entry(pts)]);
    expect(r.header()).toEqual([`${num(2800 / 365)}°C | Last year · avg`]);
  });

  it("dates a month's and a year's tapped points", () => {
    const r = widget([{ span: 'thisMonth' }], [entry(between(at('2026-01-01T00:00:00'), NOW, () => 5))]);
    tap(r, PW * 4.5 / 31);
    expect(r.header()[0].split(' | ')[1]).toMatch(new RegExp(`^${da(at('2026-01-05T12:00:00'), { day: 'numeric', month: 'short' })} \\d\\d:\\d\\d$`));
    const y = widget([{ span: 'lastYear' }], [entry(between(at('2025-01-01T00:00:00'), at('2026-01-01T00:00:00'), () => 5))]);
    tap(y, PW * 0.5);
    expect(y.header()[0].split(' | ')[1]).toMatch(/^\d+\. \S+$/); // a date, no time
  });

  it("keeps live values on a week, but only the value now on Homey's 6-hour averages (a month or year)", () => {
    const top = (r: ReturnType<typeof widget>) => Math.max(...[...r.yLabels()].map(t => Number(t.textContent!.replace(',', '.'))).filter(Number.isFinite));
    const push = (r: ReturnType<typeof widget>) => {
      r.w.pushChange({ deviceId: 'd1', capabilityId: 'measure_temperature', value: 50 });
      vi.advanceTimersByTime(MIN);
      r.w.pushChange({ deviceId: 'd1', capabilityId: 'measure_temperature', value: 20 });
    };
    const week = widget([{ span: 'thisWeek' }], [entry(between(MON, NOW - HOUR, () => 20))]);
    push(week);
    expect(top(week)).toBeGreaterThanOrEqual(50);
    const month = widget([{ span: 'thisMonth' }], [entry(between(at('2026-01-01T00:00:00'), NOW - 6 * HOUR, () => 20), { step: 6 * HOUR })]);
    push(month);
    expect(top(month)).toBeLessThan(50);
    expect(month.header()).toEqual(['20°C | Now']);
  });

  describe('on one chart', () => {
    it('draws this month with last month, each by its place in the month', () => {
      const pts = [entry(between(at('2026-01-01T00:00:00'), NOW, () => 20)), entry(between(at('2025-12-01T00:00:00'), at('2026-01-01T00:00:00'), () => 10), { value: 20 })];
      const r = widget([{ span: 'thisMonth', style: 'bars' }, { span: 'lastMonth', style: 'bars', color: 'green' }], pts, { overlay: true });
      expect(r.all('g.series-bars').map(g => g.querySelectorAll('rect.bar').length)).toEqual([15, 31]);
      expect(r.header()).toEqual(['20°C | Now', '10°C | Last month · avg']);
    });

    it("gives series 2 chart 1's span when they're of different kinds", () => {
      const r = widget([{ span: 'thisWeek' }, { span: 'lastMonth' }], [entry(between(MON, NOW, () => 20)), entry(between(MON, NOW, () => 30))], { overlay: true });
      expect(r.header()).toEqual(['20°C | Now', '30°C | Now']);
    });

    it("gives series 2 chart 1's span when it's more of the same periods, which wouldn't fit the axis", () => {
      const r = widget([{ span: 'thisWeek' }, { span: '4w!' }], [entry(between(MON, NOW, () => 20)), entry(between(MON - 21 * DAY, NOW, () => 30))], { overlay: true });
      const [w1, w2] = r.w.windows();
      expect(w2).toBe(w1);
      // The same number of whole periods keeps its own: the 2 weeks before under these 2.
      const r2 = widget([{ span: '2w!' }, { span: '2w!-' }], [entry(between(MON, NOW, () => 20)), entry(between(MON - 14 * DAY, MON, () => 30))], { overlay: true });
      expect(r2.w.windows()[1]).not.toBe(r2.w.windows()[0]);
    });
  });
});

describe('legend', () => {
  const topLabel = (r: ReturnType<typeof widget>) => Math.min(...[...r.yLabels()].map(t => Number(t.getAttribute('y'))));

  it('is above the chart by default', () => {
    const r = widget([{}], [entry(series(24 * HOUR, x => 20 + x))]);
    const box = r.q('.ch-chart')!;
    expect(box.firstElementChild!.classList.contains('ew-chips')).toBe(true);
    expect(r.q('.ch')!.classList.contains('legend-below')).toBe(false);
    expect(topLabel(r)).toBeGreaterThanOrEqual(38);
  });

  it('goes under each chart with the setting, the plot moving up', () => {
    const r = widget([{}, { color: 'green' }], [entry(series(24 * HOUR, x => 20 + x)), entry(series(24 * HOUR, x => 30 + x), { deviceId: 'd2' })], { legend: 'below' });
    expect(r.q('.ch')!.classList.contains('legend-below')).toBe(true);
    for (const box of r.all('.ch-chart')) {
      expect([...box.children].map(c => c.tagName.toLowerCase() === 'svg' ? 'svg' : c.className)).toEqual(['svg', 'ew-chips', 'ew-message ew-fnote ch-note']);
    }
    expect(topLabel(r)).toBeLessThan(15);
  });

  it('goes under one chart of two series too, and keeps a chip over an empty chart', () => {
    const r = widget([{}, { color: 'green' }], [entry(series(24 * HOUR, x => 20 + x)), entry(series(24 * HOUR, x => 30 + x), { deviceId: 'd2' })], { legend: 'below', overlay: true });
    expect(r.q('.ch-chart')!.querySelectorAll('.ew-chips .ew-chip').length).toBe(2);
    expect(r.q('.ch-chart svg')!.nextElementSibling!.classList.contains('ew-chips')).toBe(true);
    const e = widget([{}], [{ ...entry([[NOW, 20]]), points: [] }], { legend: 'below' });
    expect(e.shown(e.q('.ch-chart .ew-chip'))).toBe(true);
    expect(e.q('.ch-chart .ew-chips')!.nextElementSibling!.textContent).toBe('No history yet.');
  });
});

describe('live and states', () => {
  it('appends live values and keeps them over an older history', () => {
    const r = widget([{ span: '1h' }], [entry(series(HOUR, () => 20))]);
    vi.setSystemTime(NOW + 30e3);
    r.w.pushChange({ deviceId: 'd1', capabilityId: 'measure_temperature', value: 23.4 });
    expect(r.header()).toEqual([`${num(23.4)}°C | Now`]);
    r.w.setState([entry(series(HOUR, () => 20))]); // a cached history from before the push
    const d = r.q('.series-line')!.getAttribute('d')!;
    expect(d.endsWith(r.q('.dot-core')!.getAttribute('cx') + ' ' + r.q('.dot-core')!.getAttribute('cy'))).toBe(true);
  });

  it('says when a device is missing or has no history', () => {
    const r = widget([{}, {}], [
      { deviceId: 'g', capabilityId: 'measure_temperature', name: 'Garage', capability: cap(), value: null, points: [] },
      { deviceId: 'h', capabilityId: 'measure_temperature', missing: true },
    ]);
    expect(r.all('.ew-chip').map(c => c.textContent)).toEqual(['Garage · Temperature – °C', 'Unavailable']);
    expect(r.all('.ch-note').filter(r.shown).map(n => n.textContent)).toEqual(['No history yet.']);
    expect(r.header()).toEqual(['– | Now', '– | Unavailable']);
  });

  it('keeps the charts on a failed refresh, with a passing message', () => {
    const r = widget([{}], [entry(series(24 * HOUR, x => 20 + x))]);
    r.w.setMessage('Could not load the chart.', true);
    expect(r.shown(r.q('.ch-chart'))).toBe(true);
    expect(r.q('.ch-transient')!.textContent).toBe('Could not load the chart.');
    vi.advanceTimersByTime(8100);
    expect(r.shown(r.q('.ch-transient'))).toBe(false);
  });

  it('shows only the message when nothing is picked', () => {
    const r = widget([{}], []);
    r.w.setMessage(r.w.t('selectChart'));
    expect(r.all('.ch > .ew-message').filter(r.shown).map(m => m.textContent)).toEqual(['Pick a device value in the widget settings.']);
    expect(r.shown(r.q('.ch-chart'))).toBe(false);
  });
});

describe('two series on one chart', () => {
  const power = (spanMs: number, f: (x: number) => number) => entry(series(spanMs, f),
    { deviceId: 'd2', capabilityId: 'measure_power', name: 'Meter', capability: cap({ title: 'Power', units: 'W', decimals: 0 }) });
  const two = (c2: Record<string, unknown> = {}, opts: Record<string, unknown> = {}) =>
    widget([{ span: '24h' }, { color: 'green', ...c2 }], [entry(series(24 * HOUR, x => 20 + x * 2)), power(24 * HOUR, x => 500 + x * 1000)], { overlay: true, ...opts });
  const rightLabels = (r: ReturnType<typeof widget>) => r.all('.ch-chart svg text[text-anchor="start"]').map(t => t.textContent);

  it('draws both in one chart, each with its chip, colour and scale', () => {
    const r = two();
    expect(r.all('.ch-chart').filter(r.shown).length).toBe(1);
    expect(r.all('.ew-chip').map(c => [c.dataset.color, c.textContent]))
      .toEqual([['blue', 'Living room · Temperature – °C'], ['green', 'Meter · Power – W']]);
    expect(r.all('g[data-color] .series-line').map(p => p.closest('g')!.getAttribute('data-color'))).toEqual(['blue', 'green']);
    expect(r.all('g[data-color] .dot-core').length).toBe(2);
    expect(rightLabels(r)).toContain('1,5k');
    expect(r.header()).toEqual(['22°C | Now', `${num(1500)}W | Now`]);
  });

  it('gives both the same number of grid steps, from zero sharing the zero line', () => {
    for (const range of ['fit', 'zero']) {
      const r = widget([{ range }, { range: 'fit' }], [entry(series(24 * HOUR, x => 20 + x * 2)), power(24 * HOUR, x => 500 + x * 1000)], { overlay: true });
      const left = r.all('.ch-chart svg text[text-anchor="end"][dominant-baseline="central"]').map(t => t.getAttribute('y'));
      expect(r.all('.ch-chart svg text[text-anchor="start"]').map(t => t.getAttribute('y'))).toEqual(left);
      if (range === 'zero') expect(rightLabels(r)).toContain('0');
    }
  });

  it('puts both on one scale on the left with sharedScale, as wide as one chart', () => {
    const both = (opts: Record<string, unknown>) => widget([{}, { color: 'green' }],
      [entry(series(24 * HOUR, x => 20 + x * 2)), entry(series(24 * HOUR, x => 10 + x * 20), { deviceId: 'd2', name: 'Outdoor' })], { overlay: true, ...opts });
    const dots = (r: ReturnType<typeof widget>) => r.all('g[data-color] .dot-core').map(c => +c.getAttribute('cy')!);
    const gridEnd = (r: ReturnType<typeof widget>) => Math.max(...[...r.q('.ch-chart .grid')!.getAttribute('d')!.matchAll(/H([\d.]+)/g)].map(m => +m[1]));
    // Each on its own scale, both values end at the top; on one, 22 lies well below 30.
    const own = both({});
    expect(dots(own)[0]).toBeCloseTo(dots(own)[1], 0);
    const one = both({ sharedScale: true });
    expect(dots(one)[0] - dots(one)[1]).toBeGreaterThan(30);
    expect(rightLabels(one)).toEqual([]);
    expect([...one.yLabels()].map(t => t.textContent)).toEqual(expect.arrayContaining(['10', '30']));
    expect(gridEnd(one)).toBe(gridEnd(widget([{}], [entry(series(24 * HOUR, x => 20 + x))])));
    expect(gridEnd(one)).toBeGreaterThan(gridEnd(own));
  });

  it('keeps one scale over the series that can be drawn', () => {
    const r = widget([{}, {}], [entry(series(24 * HOUR, x => 20 + x * 2)), { deviceId: 'h', capabilityId: 'measure_power', missing: true }],
      { overlay: true, sharedScale: true });
    expect(r.all('.series-line').length).toBe(1);
    expect([...r.yLabels()].map(t => t.textContent)).toContain('22');
  });

  it('ignores sharedScale on stacked charts', () => {
    const r = widget([{}, {}], [entry(series(24 * HOUR, x => 20 + x)), power(24 * HOUR, x => 500 + x * 1000)], { sharedScale: true });
    expect(r.all('.ch-chart').filter(r.shown).length).toBe(2);
    expect([...r.yLabels(1)].map(t => t.textContent)).toContain('1,5k');
  });

  it('uses chart 1\'s time span for both', () => {
    const r = two({ span: '7d', style: 'bars' });
    expect(r.all('rect.bar').length).toBe(25); // hourly bars over 24 h, not 6-hourly over 7 days
  });

  it('puts two series of bars side by side in each slot', () => {
    const r = two({ style: 'bars' }, {});
    const r2 = widget([{ style: 'bars' }, { style: 'bars' }], [entry(series(24 * HOUR, x => 20 + x)), power(24 * HOUR, x => 500 + x)], { overlay: true });
    const [a, b] = r2.all('g.series-bars').map(g => [...g.querySelectorAll('rect.bar')]);
    expect(a.length).toBe(b.length);
    const k = 5;
    const ax = +a[k].getAttribute('x')!, aw = +a[k].getAttribute('width')!, bx = +b[k].getAttribute('x')!;
    expect(bx).toBeGreaterThan(ax + aw - 0.01);
    expect(r.all('rect.bar').length).toBe(25);
  });

  it('shows both values at the tapped time', () => {
    const r = two();
    r.q('.ch-chart svg')!.dispatchEvent(new PointerEvent('pointerdown', { clientX: 38 + 148, pointerType: 'mouse' }));
    const [a, b] = r.header();
    const at = a.split(' | ')[1];
    expect(at).toMatch(/^\d\d:\d\d$/);
    expect(b.split(' | ')[1]).toBe(at);
    expect(r.all('.cursor').length).toBe(1);
  });

  it('draws the other series when one is missing', () => {
    const r = widget([{}, {}], [entry(series(24 * HOUR, x => 20 + x)), { deviceId: 'h', capabilityId: 'measure_power', missing: true }], { overlay: true });
    expect(r.all('.ew-chip').map(c => c.textContent)).toEqual(['Living room · Temperature – °C', 'Unavailable']);
    expect(r.all('.series-line').length).toBe(1);
    expect(r.shown(r.q('.ch-chart .ch-note'))).toBe(false);
  });

  it('stays stacked without the option', () => {
    const r = widget([{}, {}], [entry(series(24 * HOUR, x => 20 + x)), power(24 * HOUR, x => 500 + x)]);
    expect(r.all('.ch-chart').filter(r.shown).length).toBe(2);
    expect(rightLabels(r)).toEqual([]);
  });
});

describe('dualScale', () => {
  const scale = (a: [number, number], b: [number, number], fit: boolean) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const kit = win.WidgetkeeperChart.createKit();
    const f = (v: number) => String(v);
    const s = kit.dualScale(svg, { a: { max: a[1], min: a[0], format: f }, b: { max: b[1], min: b[0], format: f }, h: 120, top: 0, pw: 200, fit });
    return { s, labels: [...svg.querySelectorAll('text')].map(t => [t.getAttribute('text-anchor'), t.textContent]) };
  };

  it('from zero, shares the zero line, also when only one side goes below zero', () => {
    const { s } = scale([-3, 8], [0, 2500], false);
    expect(s.a.zeroY).toBeCloseTo(s.b.zeroY);
    expect(s.b.y(2500)).toBeGreaterThanOrEqual(0);
    const t = scale([0, 8], [-900, 2500], false).s;
    expect(t.a.zeroY).toBeCloseTo(t.b.zeroY);
    expect(t.a.zeroY).toBeLessThan(120);
    expect(t.b.y(-900)).toBeLessThanOrEqual(120);
  });

  it('fitted, both cover their values in the same steps', () => {
    const { s, labels } = scale([19.3, 23.1], [480, 2700], true);
    for (const [side, lo, hi] of [['a', 19.3, 23.1], ['b', 480, 2700]] as const) {
      expect(s[side].y(lo)).toBeLessThanOrEqual(120 + 1e-9);
      expect(s[side].y(hi)).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(labels.filter(l => l[0] === 'end').length).toBe(labels.filter(l => l[0] === 'start').length);
  });
});

describe('axis labels', () => {
  it('shows exact thousands for a 250 step: 1,25k, not 1,3k', () => {
    const co2 = entry(series(24 * HOUR, x => 900 + x * 700), { deviceId: 'd3', capabilityId: 'measure_co2', name: 'Bedroom', capability: cap({ title: 'CO₂', units: 'ppm', decimals: 0 }) });
    const r = widget([{ span: '24h' }], [co2]);
    const labels = r.all('.ch-chart svg text').map(t => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['1,25k', '1,75k']));
    expect(labels).not.toContain('1,3k');
  });
});
