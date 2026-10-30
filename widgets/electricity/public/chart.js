/*
 * The chart drawing shared by the Electricity Overview, Charts and Chart · Totals widgets: scales, traces, bars, dots,
 * chips, the export (below zero) split and the tap-to-inspect wiring, and the bars and labels on the local clock.
 * Plain browser JS (served as-is), on `window.WidgetkeeperChart`. Charts and Chart · Totals load it from here
 * (`../electricity/chart.js`), as does the Smart Stack.
 * The class names are the Electricity Overview's (chart.css, scoped by `.ew`), so its markup didn't change.
 */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MIN = 60e3;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  const L = 38; // left gutter
  const X_LABEL_GAP = 5;
  const X_LABEL_H = 14;
  const LABEL_PAD = 8; // y label ↔ axis
  const LABEL_MIN_GAP = 16; // min vertical distance between y labels
  const SMOOTH_PASSES = 6; // `smooth`: averaging passes over a trace
  const STEP_RADIUS = 5; // `smooth`: corner radius on step lines
  const TOUCH_HOLD_MS = 3000; // a touch selection stays this long after the finger lifts
  const REFRESH_MS = 5 * 60e3; // a chart widget's refetch (`wireChart()`)

  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  /**
   * A value axis' steps over `[min, max]`. From zero (`fit` off), 0 is always on it, with whole steps above and below;
   * with `fit`, whole steps from just below `min` to just above `max` (a flat range: one small step either side, so
   * its line sits in the middle). `{step, axisMin, axisMax, k, zeroIndex}`: `k` steps from `axisMin` to `axisMax`, and
   * `zeroIndex` the step at 0 when the axis reaches below zero (fitted: when it crosses zero), else null.
   */
  function ticks({ max, min = 0, fit = false }) {
    if (!fit) {
      min = Math.min(0, min);
      max = Math.max(0, max);
      if (max === min) max = 1;
      const step = niceStep((max - min) / 3);
      const kPos = Math.ceil(max / step - 1e-9), kNeg = Math.ceil(-min / step - 1e-9);
      return { step, axisMin: -step * kNeg, axisMax: step * kPos, k: kPos + kNeg, zeroIndex: kNeg || null };
    }
    let step, axisMin, k;
    if (max === min) {
      step = niceStep(Math.abs(max) / 20 || 1);
      axisMin = max - step;
      k = 2;
    } else {
      step = niceStep((max - min) / 3);
      const kLo = Math.floor(min / step + 1e-9);
      axisMin = kLo * step;
      k = Math.ceil(max / step - 1e-9) - kLo;
    }
    const axisMax = axisMin + k * step;
    return { step, axisMin, axisMax, k, zeroIndex: axisMin < 0 && axisMax > 0 ? Math.round(-axisMin / step) : null };
  }

  /** The kit's el() (../spacer/kit.js, loaded first), with `svg:<tag>` made in the SVG namespace. */
  function el(tag, attrs, parent) {
    const kitEl = window.WidgetkeeperKit.el;
    return tag.startsWith('svg:') ? kitEl(tag.slice(4), attrs, parent, SVG_NS) : kitEl(tag, attrs, parent);
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function show(node, on) { node.style.display = on ? '' : 'none'; }
  function f1(n) { return Math.round(n * 10) / 10; }

  /** Smoothed values for the `smooth` setting: six [1 2 1]/4 passes; the ends stay put. */
  function smoothValues(vs) {
    let q = vs;
    for (let k = 0; k < SMOOTH_PASSES; k++) {
      q = q.map((v, i) => i === 0 || i === q.length - 1 ? v : (q[i - 1] + 2 * v + q[i + 1]) / 4);
    }
    return q;
  }

  /**
   * Path segments (after the M) through `pts` ([x, y] with rising x): a monotone cubic
   * (Fritsch–Carlson, like d3's curveMonotoneX), which never overshoots between points.
   */
  function monotonePath(pts) {
    const n = pts.length;
    if (n < 3) return pts.slice(1).map(([x, y]) => `L${f1(x)} ${f1(y)}`).join('');
    const s = [], m = [];
    for (let i = 0; i < n - 1; i++) s.push((pts[i + 1][1] - pts[i][1]) / ((pts[i + 1][0] - pts[i][0]) || 1e-9));
    m[0] = s[0];
    m[n - 1] = s[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (s[i - 1] * s[i] <= 0) { m[i] = 0; continue; }
      const h0 = pts[i][0] - pts[i - 1][0], h1 = pts[i + 1][0] - pts[i][0];
      const w0 = (h0 + 2 * h1) / (3 * (h0 + h1));
      m[i] = 1 / (w0 / s[i - 1] + (1 - w0) / s[i]);
    }
    let d = '';
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = (x1 - x0) / 3;
      d += `C${f1(x0 + h)} ${f1(y0 + m[i] * h)} ${f1(x1 - h)} ${f1(y1 - m[i + 1] * h)} ${f1(x1)} ${f1(y1)}`;
    }
    return d;
  }

  /** Path segments (after the M) through the corners of a step line, rounded with radius `r`. */
  function roundedPath(pts, r) {
    let d = '';
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (i === pts.length - 1) { d += `L${f1(x)} ${f1(y)}`; break; }
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1];
      const d0 = Math.hypot(x - ax, y - ay), d1 = Math.hypot(bx - x, by - y);
      const rr = Math.min(r, d0 / 2, d1 / 2);
      d += `L${f1(x - (x - ax) / d0 * rr)} ${f1(y - (y - ay) / d0 * rr)}`
        + `Q${f1(x)} ${f1(y)} ${f1(x + (bx - x) / d1 * rr)} ${f1(y + (by - y) / d1 * rr)}`;
    }
    return d;
  }

  /** A whole line through `pts`: straight segments, or with `smooth` the monotone cubic. */
  function linePath(pts, smooth) {
    return `M${f1(pts[0][0])} ${f1(pts[0][1])}` + (smooth
      ? monotonePath(pts) : pts.slice(1).map(([x, y]) => `L${f1(x)} ${f1(y)}`).join(''));
  }

  /** A step line through `pts`: straight corners, or with `smooth` rounded ones. */
  function stepPath(pts, smooth) {
    return `M${f1(pts[0][0])} ${f1(pts[0][1])}` + (smooth
      ? roundedPath(pts, STEP_RADIUS) : pts.slice(1).map(([x, y]) => `L${f1(x)} ${f1(y)}`).join(''));
  }

  /** 98.5th percentile, used to size usage scales so single spikes don't flatten the trace. */
  function p985(values) {
    const v = [...values].sort((a, b) => a - b);
    return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.985))] : 1;
  }

  /** 1.5th percentile, or 0 when that's not negative: how far a usage scale reaches below zero (solar export). */
  function p015(values) {
    const v = [...values].sort((a, b) => a - b);
    return v.length ? Math.min(0, v[Math.floor(v.length * 0.015)]) : 0;
  }

  /** `nf(v)` with thousands as k and a real minus sign: −1,5k, 850, 12k. */
  function compactNumber(nf, v) {
    return v < 0 ? '−' + compactNumber(nf, -v)
      : v >= 1000 ? nf(v / 1000, v % 1000 ? 1 : 0) + 'k' : nf(Math.round(v));
  }

  /** Relative time-axis label: 1h, 30m, 2,5m, 30s. `nf(v, decimals)` formats the number. */
  function ago(ms, nf) {
    return ms >= HOUR && ms % HOUR === 0 ? `${ms / HOUR}h`
      : ms >= MIN ? `${nf(ms / MIN, ms % MIN ? 1 : 0)}m`
        : `${Math.round(ms / 1000)}s`;
  }

  /** The number of decimals in a scale step: 2.5 → 1, 0.25 → 2, 50 → 0. */
  function stepDecimals(step) {
    let d = 0;
    while (d < 4 && Math.abs(step * Math.pow(10, d) - Math.round(step * Math.pow(10, d))) > 1e-6) d++;
    return d;
  }

  /**
   * A value axis label (Charts' and Chart · Totals'): `nf(v, decimals)` to the step's decimals, thousands as `1,5k` once
   * the step is that coarse, with the decimals the value needs (a 250 step's 1250 is `1,25k`, not `1,3k`).
   */
  function axisLabel(nf, v, step) {
    if (Math.abs(v) < step / 1e6) v = 0;
    const sign = v < 0 ? '−' : '';
    const k = Math.abs(v) / 1000;
    if (step >= 100 && k >= 1) return sign + nf(k, stepDecimals(k)) + 'k';
    return sign + nf(Math.abs(v), stepDecimals(step));
  }

  /**
   * Steps along a time axis on the local clock by `unit`: a length in ms, `'week'` (calendar weeks from Monday, as
   * Homey's) or `'month'` (calendar months, starting on the 1st). Steps of whole hours start on the clock's hours, each
   * counted from its day's midnight, so they stay there across a DST change (that day's step is an hour longer or
   * shorter, and a day's, 24 h, runs midnight to midnight); shorter ones divide any hour, so stepping by their length
   * from the first stays on the clock. `align(t)` is the start of the step holding `t`, `next(b)` the start of the one
   * after `b`.
   */
  function clockSteps(unit, from) {
    if (unit === 'month' || unit === 'week') {
      const start = (t, add) => {
        const d = new Date(t);
        return (unit === 'month' ? new Date(d.getFullYear(), d.getMonth() + add, 1)
          : new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7 + 7 * add)).getTime();
      };
      return { align: t => start(t, 0), next: b => start(b, 1) };
    }
    const hours = unit / HOUR;
    const byClock = hours >= 1 && hours % 1 === 0;
    const offset = new Date(from).getTimezoneOffset() * MIN;
    const hourStart = (t, add) => {
      const d = new Date(t);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() - d.getHours() % hours + add).getTime();
    };
    return {
      align: t => (byClock ? hourStart(t, 0) : Math.floor((t - offset) / unit) * unit + offset),
      next: b => (byClock ? hourStart(b, hours) : b + unit),
    };
  }

  /**
   * Bars of `unit` (`clockSteps()`) on the local clock over `[from, to]`: each the average of the points in it (`agg`:
   * or their `min`, `max` or `last`), or the last value before it (Homey doesn't log unchanged values); null before the
   * first value. The first and last bars are cut to the span. `current` (the value now) only stands in for a last bar
   * without points of its own, so it doesn't count as a sample and the bar doesn't jump with each live value.
   * `{t, end, v}`, oldest first.
   * @param {[number, number][]} points
   * @param {number | string} unit
   * @param {number | null} [current]
   * @param {'avg' | 'min' | 'max' | 'last'} [agg]
   */
  function buckets(points, from, to, unit, current = null, agg = 'avg') {
    const { align, next } = clockSteps(unit, from);
    const fold = agg === 'min' ? Math.min : agg === 'max' ? Math.max : agg === 'last' ? (a, v) => v : (a, v) => a + v;
    const out = [];
    let j = 0, last = null;
    while (j < points.length && points[j][0] < from) last = points[j++][1];
    for (let b = align(from); b < to; b = next(b)) {
      const e = next(b);
      let acc = 0, n = 0;
      while (j < points.length && points[j][0] < e) {
        if (points[j][0] <= to) { acc = n ? fold(acc, points[j][1]) : points[j][1]; n++; }
        last = points[j++][1];
      }
      const end = Math.min(e, to);
      out.push({ t: Math.max(b, from), end, v: n ? (agg === 'avg' ? acc / n : acc) : end === to && current != null ? current : last });
    }
    return out;
  }

  /**
   * Several series on one clock grid: `buckets()` of each over `[from, to]` by `unit`, as rows `{t, end, values}`, a
   * value per series (null before its first). `currents` (each series' value now) stand in for a last row without
   * points, as in `buckets()`. Chart · Scatter (XY)'s pairs.
   * @param {[number, number][][]} list
   */
  function alignSeries(list, from, to, unit, currents = []) {
    const each = list.map((pts, i) => buckets(pts, from, to, unit, currents[i] == null ? null : currents[i]));
    return (each[0] || []).map((b, k) => ({ t: b.t, end: b.end, values: each.map(series => series[k].v) }));
  }

  /**
   * A value's usual day over `[from, to]`: for each local clock hour (0–23), the average, lowest and highest of its hourly
   * averages there (`buckets()` by the hour, the last value carried over gaps): `{hour, avg, min, max, n}`, the values
   * null where there were none. Chart · Daily Profile's band and dashed line.
   * @param {[number, number][]} points
   */
  function profile(points, from, to) {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sum: 0, n: 0, min: Infinity, max: -Infinity }));
    for (const b of buckets(points, from, to, HOUR)) {
      if (b.v == null) continue;
      const h = hours[new Date(b.t).getHours()];
      h.sum += b.v;
      h.n++;
      h.min = Math.min(h.min, b.v);
      h.max = Math.max(h.max, b.v);
    }
    return hours.map(h => (h.n ? { hour: h.hour, avg: h.sum / h.n, min: h.min, max: h.max, n: h.n } : { hour: h.hour, avg: null, min: null, max: null, n: 0 }));
  }

  /**
   * The least-squares line through `[x, y]` pairs: `{slope, intercept, r}` (r the correlation, −1 … 1), or null for fewer
   * than three or no spread in x.
   * @param {[number, number][]} pairs
   */
  function trendLine(pairs) {
    const n = pairs.length;
    if (n < 3) return null;
    const mx = pairs.reduce((a, p) => a + p[0], 0) / n, my = pairs.reduce((a, p) => a + p[1], 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
    if (!(sxx > 0)) return null;
    const slope = sxy / sxx;
    return { slope, intercept: my - slope * mx, r: syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0 };
  }

  /** The bars' lengths `barUnit()` picks from, shortest first: about 12–28 of them over a rolling span. */
  const BAR_STEPS = [MIN, 2 * MIN, 5 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR, 'week', 'month'];
  const MAX_BARS = 28;

  /**
   * The bars' unit (`clockSteps()`) over `[from, to]`: on a calendar span (`unit`, the kit's `timeSpan()`) a day's hours,
   * a week's or a month's days or a year's months (a few of them: as long as at most 31 bars), else the shortest of
   * `BAR_STEPS` giving at most 28 bars (an hour: 12 of 5 min; 24 h: an hour each; 7 days: 6 h each), ending with
   * calendar weeks and months.
   */
  function barUnit(from, to, unit = null) {
    const days = (to - from) / (24 * HOUR);
    if (unit === 'day' && days <= 1.05) return HOUR;
    if ((unit === 'week' || unit === 'month') && days <= 31.05) return 24 * HOUR;
    if (unit === 'year' && days <= 2 * 366) return 'month';
    const length = s => (s === 'week' ? 7 * 24 * HOUR : s === 'month' ? 30.44 * 24 * HOUR : s);
    return BAR_STEPS.find(s => (to - from) / length(s) <= MAX_BARS + 0.05) || 'month';
  }

  /**
   * Bars of a meter's use, `unit` as `buckets()`: each how much its running total (`points`, `[t, total]` oldest first,
   * lib/SparklineService.ts' `meterPointsOf()`) rose from the bar's start to its end, read off the line through the
   * points. `current`, the total now, ends that line at `to`. Past the last point the total goes on at its last rate
   * for up to one and a half steps between points (Insights leaves out a closed period's last 6-hour step when it
   * straddles midnight), then holds (Homey doesn't log an unchanged value); before the first point likewise, back. A
   * bar wholly before that has none. `{t, end, v}`, oldest first.
   * @param {[number, number][]} points
   * @param {number | string} unit
   * @param {number | null} [current]
   */
  function useBuckets(points, from, to, unit, current = null) {
    const pts = points.filter(p => p[0] <= to);
    if (current != null && (!pts.length || pts[pts.length - 1][0] < to)) pts.push([to, current]);
    const n = pts.length;
    const gaps = pts.slice(1).map((p, i) => p[0] - pts[i][0]).sort((a, b) => a - b);
    const reach = gaps.length ? 1.5 * gaps[Math.floor(gaps.length / 2)] : 0;
    const rate = (a, b) => Math.max(0, (b[1] - a[1]) / ((b[0] - a[0]) || 1));
    const total = (t) => {
      if (t <= pts[0][0]) return pts[0][1] - (n > 1 ? rate(pts[0], pts[1]) * Math.min(pts[0][0] - t, reach) : 0);
      if (t >= pts[n - 1][0]) return pts[n - 1][1] + (n > 1 ? rate(pts[n - 2], pts[n - 1]) * Math.min(t - pts[n - 1][0], reach) : 0);
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] <= t) lo = mid; else hi = mid; }
      return pts[lo][1] + rate(pts[lo], pts[hi]) * (t - pts[lo][0]);
    };
    const { align, next } = clockSteps(unit, from);
    const out = [];
    for (let b = align(from); b < to; b = next(b)) {
      const t = Math.max(b, from), end = Math.min(next(b), to);
      out.push({ t, end, v: n && end > pts[0][0] - reach ? Math.max(0, total(end) - total(t)) : null });
    }
    return out;
  }

  /**
   * A live value on a meter's running total, carried on from `meter` (`{offset, high}`, lib/series.ts' `runningTotal()`,
   * which it updates) by the same rule: a value below half the highest since the last reset is a reset, a smaller drop
   * holds the total. Returns the total.
   */
  function meterTotal(meter, v) {
    if (meter.high == null) meter.high = v;
    else if (meter.high > 0 && v < meter.high / 2) { meter.offset += meter.high; meter.high = v; }
    else meter.high = Math.max(meter.high, v);
    return meter.offset + meter.high;
  }

  /**
   * The x labels and dashed lines of a calendar axis `[from, to]` by its `unit` (the kit's `timeSpan()`): a week's
   * weekdays and a month's days 1, 8, 15, 22 and 29, each at its noon, with lines at those days' starts; a year's
   * months mid-month, with lines at the months' starts. `narrow` names (M T W, J F M) where short ones don't fit,
   * in `language`. A day has none: its axis keeps the hours. `{labels: [{at, label}], lines}`, times in ms.
   */
  function calendarLabels(unit, from, to, language, narrow) {
    const labels = [], lines = [];
    const format = (opts) => {
      try { return new Intl.DateTimeFormat(language || 'en', opts); } catch (e) { return new Intl.DateTimeFormat(undefined, opts); }
    };
    if (unit === 'week' || unit === 'month') {
      const weekday = format({ weekday: narrow ? 'narrow' : 'short' });
      for (const d = new Date(from); d.getTime() < to; d.setDate(d.getDate() + 1)) {
        if (unit === 'month' && (d.getDate() - 1) % 7) continue;
        labels.push({ at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime(), label: unit === 'week' ? weekday.format(d) : String(d.getDate()) });
        if (d.getTime() > from) lines.push(d.getTime());
      }
    } else if (unit === 'year') {
      const month = format({ month: narrow ? 'narrow' : 'short' });
      for (const d = new Date(from); d.getTime() < to; d.setMonth(d.getMonth() + 1)) {
        const start = d.getTime(), end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
        labels.push({ at: (start + end) / 2, label: month.format(d) });
        if (start > from) lines.push(start);
      }
    }
    return { labels, lines };
  }

  /**
   * The SVG drawing functions of one widget. Gradient and clip ids are unique per kit, so several
   * widgets can share a page (the Smart Stack).
   */
  function createKit() {
    let counter = 0;
    const uid = 'ew' + Math.random().toString(36).slice(2, 7);

    function text(svg, x, y, label, anchor, baseline) {
      return el('svg:text', { x: f1(x), y: f1(y), 'text-anchor': anchor, 'dominant-baseline': baseline, text: label }, svg);
    }

    function gradient(svg, cls, stops, attrs) {
      const id = `${uid}g${++counter}`;
      const defs = el('svg:defs', null, svg);
      const g = el('svg:linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1, ...attrs }, defs);
      for (const [offset, opacity] of stops) el('svg:stop', { class: cls, offset, 'stop-opacity': opacity }, g);
      return `url(#${id})`;
    }

    function dot(svg, x, y, kind, small) {
      el('svg:circle', { class: `dot-ring ${kind}`, cx: f1(x), cy: f1(y), r: small ? 6.5 : 7 }, svg);
      el('svg:circle', { class: `dot-core ${kind}`, cx: f1(x), cy: f1(y), r: small ? 3.5 : 4 }, svg);
    }

    /** A chart's title chip: a coloured dot (`kind`), the label and ` – unit`. */
    function chip(parent, kind, label, unit) {
      const c = el('span', { class: `ew-chip ${kind}` }, parent);
      el('i', null, c);
      const s = el('span', { text: label }, c);
      if (unit) el('span', { class: 'unit', text: ` – ${unit}` }, s);
    }

    /**
     * Draws `draw(clip, exp)` twice when a scale reaches below zero: clipped above `zeroY`
     * as usual, and below it with the `export` look (yellow). Otherwise once, unclipped.
     */
    function exportSplit(svg, zeroY, base, draw) {
      if (!(zeroY < base)) { draw(null, false); return; }
      const defs = el('svg:defs', null, svg);
      const clip = (y, h) => {
        const id = `${uid}c${++counter}`;
        el('svg:rect', { x: -1000, y: f1(y), width: 1e4, height: f1(h) }, el('svg:clipPath', { id }, defs));
        return `url(#${id})`;
      };
      draw(clip(-1000, zeroY + 1000), false);
      draw(clip(zeroY, 1000), true);
    }

    function prepareSvg(svg, w, h) {
      clear(svg);
      svg.setAttribute('width', w);
      svg.setAttribute('height', h);
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }

    /** The left axis and the plot's base line, with the tick left of the base. */
    function axis(svg, top, base, pw) {
      el('svg:path', { class: 'axis', d: `M${L} ${top - 6}V${base}H${L + pw}M${L - 6} ${base}H${L}` }, svg);
    }

    /** Dashed vertical lines at the x positions given (midnights). */
    function midnightLines(svg, xs, top, base) {
      const d = xs.map(x => `M${f1(x)} ${top - 6}V${base}`).join('');
      if (d) el('svg:path', { class: 'midnight', d }, svg);
    }

    /**
     * A time axis' labels for the window `{from, to, unit}` (the kit's `timeSpan()`), of any length, as many as fit 40 px
     * apart: up to 6 h relative (`1h · 30m · Now`, as the live power chart); up to a day the clock hours every 6 h; up to
     * 8 days the weekday at each noon, with dashed midnights; up to two months the 7th, 14th, 21st and 28th (`7 Sep`);
     * longer the months from their 1st (January as its year once the axis spans more than a year). Now at the right end
     * of a rolling span; whole periods (`unit`) end at their end. `date(ms, options)` formats in Homey's language, `nf`
     * the numbers, `now` the word for now.
     */
    function timeLabels(svg, { from, to, unit }, { pw, top, base, nf, date, now }) {
      const span = to - from;
      const ly = base + X_LABEL_GAP;
      if (!unit && span <= 6 * HOUR) {
        text(svg, L, ly, ago(span, nf), 'start', 'hanging');
        text(svg, L + pw / 2, ly, ago(span / 2, nf), 'middle', 'hanging');
        text(svg, L + pw, ly, now, 'end', 'hanging');
        return;
      }
      const x = ms => L + pw * (ms - from) / span;
      const d = new Date(from);
      if (span <= 8 * DAY + HOUR) {
        const midnights = [];
        const m = new Date(from);
        m.setHours(24, 0, 0, 0);
        for (; m.getTime() < to; m.setDate(m.getDate() + 1)) midnights.push(m.getTime());
        midnightLines(svg, midnights.map(x), top, base);
      }
      const kept = unit ? [] : [{ x: L + pw, cx: L + pw - 15, anchor: 'end', label: now }];
      const candidates = [];
      if (span <= DAY + HOUR) {
        d.setMinutes(0, 0, 0);
        for (d.setHours(d.getHours() + 1); d.getTime() < to; d.setHours(d.getHours() + 1)) {
          if (d.getHours() % 6 === 0) candidates.push({ at: d.getTime(), label: d.getHours() + ':00' });
        }
      } else if (span <= 8 * DAY + HOUR) {
        d.setHours(12, 0, 0, 0);
        if (d.getTime() < from) d.setDate(d.getDate() + 1);
        for (; d.getTime() < to; d.setDate(d.getDate() + 1)) candidates.push({ at: d.getTime(), label: date(d.getTime(), { weekday: 'short' }) });
      } else if (span <= 62 * DAY) {
        d.setHours(12, 0, 0, 0);
        for (; d.getTime() < to; d.setDate(d.getDate() + 1)) {
          if (d.getTime() >= from && d.getDate() % 7 === 0 && d.getDate() < 29) {
            candidates.push({ at: d.getTime(), label: date(d.getTime(), { day: 'numeric', month: 'short' }) });
          }
        }
      } else {
        // From each month's 1st, as on a calendar, so January isn't lost against the scale.
        d.setHours(0, 0, 0, 0);
        d.setDate(1);
        if (d.getTime() < from) d.setMonth(d.getMonth() + 1);
        for (; d.getTime() < to; d.setMonth(d.getMonth() + 1)) {
          const year = span > 366 * DAY && d.getMonth() === 0;
          candidates.push({ at: d.getTime(), label: date(d.getTime(), year ? { year: 'numeric' } : { month: 'short' }), anchor: 'start', first: year });
        }
      }
      // A centred label keeps clear of the scale: 18 px on a rolling span, half a weekday on whole periods. A year's goes
      // in first, so the months make room for it.
      const minX = unit ? 12 : 18;
      for (const cnd of candidates.filter(c => c.first).concat(candidates.filter(c => !c.first))) {
        const cx = x(cnd.at) + (cnd.anchor ? 3 : 0);
        if ((cnd.anchor || cx - L >= minX) && kept.every(q => Math.abs(q.cx - cx) >= 40)) {
          kept.push({ x: cx, cx, anchor: cnd.anchor || 'middle', label: cnd.label });
        }
      }
      for (const q of kept) text(svg, q.x, ly, q.label, q.anchor, 'hanging');
    }

    /**
     * The left value scale for a plot of height `h` starting at `top`: grid, thinned labels (`format(v, step)`).
     * From zero (`fit` off): 0 at the base, and a negative `min` extends it below zero in whole steps, with a
     * zero line. With `fit`, it runs in whole steps from just below `min` to just above `max`; a zero line
     * shows when that range crosses zero. Returns `y(v)`, `zeroY` (the y of 0, which may lie outside the plot),
     * `baseY` (where areas and bars close: 0, or the nearer edge when 0 is outside) and the axis range.
     */
    function valueScale(svg, { max, min = 0, h, top, pw, rightExt = 0, format, fit = false }) {
      const { step, axisMin, axisMax, k, zeroIndex } = ticks({ max, min, fit });
      const linear = v => top + h * (1 - (v - axisMin) / (axisMax - axisMin));
      // From zero, a value below a scale that doesn't reach below zero sits on the base; one below the scale's
      // bottom, at most 2 px under it.
      const y = fit ? linear : zeroIndex != null ? v => Math.min(top + h + 2, linear(v)) : v => top + h * (1 - Math.max(0, v) / axisMax);
      let grid = '';
      const every = Math.max(1, Math.ceil(LABEL_MIN_GAP / (h / k)));
      for (let j = 0; j <= k; j++) {
        const v = axisMin + step * j;
        if (j > 0) grid += `M${L - 6} ${f1(y(v))}H${L + pw + rightExt}`;
        if ((zeroIndex != null ? j - zeroIndex : k - j) % every === 0) text(svg, L - LABEL_PAD, y(v), format(v, step), 'end', 'central');
      }
      el('svg:path', { class: 'grid', d: grid }, svg);
      const zeroY = y(0);
      if (zeroIndex != null) el('svg:path', { class: 'axis', d: `M${L - 6} ${f1(zeroY)}H${L + pw + rightExt}` }, svg);
      const baseY = axisMin >= 0 ? top + h : axisMax <= 0 ? top : zeroY;
      return { y, axisMax, axisMin, zeroY, baseY, step };
    }

    /**
     * A bottom value scale over a plot `pw` wide from `left` (`L`; Chart · Scatter (XY)'s x, Chart · Ranking's): vertical grid
     * lines and labels (`format(v, step)`, at least 40 px apart, so with the decimals of the labels' own spacing) under
     * `base`, from `ticks()` (fitted unless `fit` is false); a line at zero where the range crosses it, and with `edge`
     * one at the left end too (where no value axis stands). Returns `x(v)` and the axis range.
     */
    function xValueScale(svg, { min, max, pw, top, base, format, fit = true, left = L, edge = false }) {
      const { step, axisMin, axisMax, k, zeroIndex } = ticks({ min, max, fit });
      const x = v => left + pw * (v - axisMin) / (axisMax - axisMin);
      const every = Math.max(1, Math.ceil(40 / (pw / k)));
      let grid = '';
      for (let j = 0; j <= k; j++) {
        const v = axisMin + j * step;
        if (j > 0 || edge) grid += `M${f1(x(v))} ${top - 6}V${base}`;
        if ((zeroIndex != null ? j - zeroIndex : j) % every === 0) {
          text(svg, x(v), base + X_LABEL_GAP, format(v, step * every), j === 0 ? 'start' : j === k ? 'end' : 'middle', 'hanging');
        }
      }
      el('svg:path', { class: 'grid', d: grid }, svg);
      if (zeroIndex != null) el('svg:path', { class: 'axis', d: `M${f1(x(0))} ${top - 6}V${base}` }, svg);
      return { x, axisMin, axisMax, step };
    }

    /**
     * Two value scales on one plot (Charts' two series on one chart): `a` on the left, `b` on the right
     * (each `{max, min, format}`), on one shared grid. From zero (`fit` off), as the Electricity Overview's
     * price and usage scales: each side its own step, sharing the zero line and the steps above and below it.
     * With `fit`, side a fits as `valueScale` does and b fits the same number of steps. Also draws the right
     * axis. Returns `{a, b}`, each with `y(v)`, `zeroY`, `baseY` and the axis range.
     */
    function dualScale(svg, { a, b, h, top, pw, fit = false }) {
      const sides = fit ? fitPair(a, b) : zeroPair(a, b);
      const { k, anchor } = sides;
      const xr = L + pw + 6;
      const every = Math.max(1, Math.ceil(LABEL_MIN_GAP / (h / k)));
      const side = (s) => {
        const axisMax = s.axisMin + k * s.step;
        const y = v => top + h * (1 - (v - s.axisMin) / (axisMax - s.axisMin));
        const zeroY = y(0);
        const crosses = s.axisMin < 0 && axisMax > 0;
        const baseY = s.axisMin >= 0 ? top + h : axisMax <= 0 ? top : zeroY;
        return { y, zeroY, baseY, axisMin: s.axisMin, axisMax, step: s.step, crosses };
      };
      const out = { a: side(sides.a), b: side(sides.b) };
      let grid = '';
      for (let j = 0; j <= k; j++) {
        const yy = out.a.y(sides.a.axisMin + j * sides.a.step);
        if (j > 0) grid += `M${L - 6} ${f1(yy)}H${xr}`;
        if ((anchor == null ? k - j : j - anchor) % every !== 0) continue;
        text(svg, L - LABEL_PAD, yy, a.format(sides.a.axisMin + j * sides.a.step, sides.a.step), 'end', 'central');
        text(svg, L + pw + LABEL_PAD, yy, b.format(sides.b.axisMin + j * sides.b.step, sides.b.step), 'start', 'central');
      }
      el('svg:path', { class: 'grid', d: grid }, svg);
      // Zero lines: one shared from zero; with `fit`, each side's own where its range crosses zero.
      const zeros = [...new Set([out.a, out.b].filter(s => s.crosses).map(s => f1(s.zeroY)))];
      for (const zy of zeros) el('svg:path', { class: 'axis', d: `M${L - 6} ${zy}H${xr}` }, svg);
      el('svg:path', { class: 'axis', d: `M${L + pw} ${top - 6}V${top + h}H${xr}` }, svg);
      return out;
    }

    /** From zero: `{a, b}` as `{step, axisMin}`, `k` steps in all, `anchor` the zero line's index (or null). */
    function zeroPair(a, b) {
      const B = { lo: Math.min(0, b.min), hi: Math.max(0, b.max) };
      if (B.hi === B.lo) B.hi = 1;
      const A = ticks({ max: a.max, min: a.min });
      const stepA = A.step;
      let kPos = Math.round(A.axisMax / stepA), kNeg = Math.round(-A.axisMin / stepA);
      let stepB;
      if ((B.lo < 0 && !kNeg) || (B.hi > 0 && !kPos)) {
        // b needs a side a doesn't have: both get as many steps as either needs.
        stepB = niceStep((B.hi - B.lo) / 3);
        kPos = Math.max(kPos, Math.ceil(B.hi / stepB - 1e-9));
        kNeg = Math.max(kNeg, Math.ceil(-B.lo / stepB - 1e-9));
      } else {
        stepB = niceStep(Math.max(kPos ? B.hi / kPos : 0, kNeg ? -B.lo / kNeg : 0));
      }
      return { a: { step: stepA, axisMin: -stepA * kNeg }, b: { step: stepB, axisMin: -stepB * kNeg }, k: kPos + kNeg, anchor: kNeg ? kNeg : null };
    }

    /** Fitted: a as `fitScale`, b in the same number of steps (its step raised until its values fit). */
    function fitPair(a, b) {
      const { step: stepA, axisMin: minA, k } = ticks({ max: a.max, min: a.min, fit: true });
      let stepB, minB;
      if (b.max === b.min) {
        stepB = niceStep(Math.abs(b.max) / 20 || 1);
        minB = (Math.round(b.max / stepB) - Math.floor(k / 2)) * stepB;
      } else {
        stepB = niceStep((b.max - b.min) / k);
        for (;;) {
          minB = Math.floor(b.min / stepB + 1e-9) * stepB;
          if (minB + k * stepB >= b.max - 1e-9) break;
          stepB = niceStep(stepB * 1.001);
        }
      }
      const maxA = minA + k * stepA;
      const anchor = minA < 0 && maxA > 0 ? Math.round(-minA / stepA) : null;
      return { a: { step: stepA, axisMin: minA }, b: { step: stepB, axisMin: minB }, k, anchor };
    }

    /**
     * A trace: its area (`area`, a closed path; none for a bare line) with a gradient fading from `stops[0]`
     * to `stops[1]` in `${kind}-stop`, then the line in `lineClass`. With `split` and a scale below zero,
     * each side is drawn on its own (`exportSplit`), the part below zero yellow and fading towards the zero line.
     * `fill` is the plain gradient when the caller made it already.
     */
    function trace(svg, { line, area, kind, lineClass, stops, zeroY, top, base, split = true, fill }) {
      const [a, b] = stops || [0.45, 0];
      const stopClass = `${kind}-stop`;
      const run = split ? (draw) => exportSplit(svg, zeroY, base, draw) : (draw) => draw(null, false);
      if (area) {
        run((clip, exp) => {
          const f = !clip ? fill || gradient(svg, stopClass, [[0, a], [1, b]])
            : gradient(svg, exp ? `${stopClass} export` : stopClass, [[0, exp ? b : a], [1, exp ? a : b]],
              { gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: f1(exp ? zeroY : top), y2: f1(exp ? base : zeroY) });
          el('svg:path', { d: area, fill: f, 'clip-path': clip }, svg);
        });
      }
      run((clip, exp) => {
        el('svg:path', { class: `${lineClass}${exp ? ' export' : ''}`, d: line, 'clip-path': clip }, svg);
      });
    }

    /**
     * Bars (`{x, w, v}`, x their left edge) from `baseY` to `y(v)`, in `cls`. With `split` and a scale below
     * zero, the parts below zero are drawn in `${cls} export`. `selected` (an index) is drawn at full strength.
     */
    function bars(svg, { list, y, baseY, zeroY, base, cls, split = false, selected = null }) {
      const draw = (clip, exp) => {
        const g = el('svg:g', { class: `${cls}${exp ? ' export' : ''}`, 'clip-path': clip }, svg);
        list.forEach((bar, i) => {
          if (bar.v == null) return;
          const yv = y(bar.v);
          const y0 = Math.min(yv, baseY), hh = Math.max(1, Math.abs(yv - baseY));
          el('svg:rect', { class: i === selected ? 'bar selected' : 'bar', x: f1(bar.x), y: f1(y0), width: f1(bar.w), height: f1(hh), rx: Math.min(2, bar.w / 4) }, g);
        });
      };
      if (split) exportSplit(svg, zeroY, base, draw); else draw(null, false);
    }

    return { uid, text, gradient, dot, chip, exportSplit, prepareSvg, axis, midnightLines, timeLabels, valueScale, xValueScale, dualScale, trace, bars };
  }

  /**
   * Tap-to-inspect on a chart's persistent <svg>. Mouse: `scrub` on hover, `reset` on leave. Touch: a tap or
   * drag selects; the selection stays TOUCH_HOLD_MS after the finger lifts. That also makes taps work on Homey's
   * Android app, whose dashboard takes over a drag (pointercancel) about 100 ms in, whatever the page does.
   * Charts that share a selection share one `hold` ({timer}).
   */
  function attachScrub(svg, scrub, reset, hold) {
    svg.addEventListener('pointerdown', e => { clearTimeout(hold.timer); scrub(e); });
    svg.addEventListener('pointermove', scrub);
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') reset(); });
    for (const ev of ['pointerup', 'pointercancel']) {
      svg.addEventListener(ev, e => {
        if (e.pointerType === 'mouse') return;
        clearTimeout(hold.timer);
        hold.timer = setTimeout(reset, TOUCH_HOLD_MS);
      });
    }
    // Without this, Homey's dashboard scrolls and cancels the touch (iOS honours it; Android doesn't).
    for (const ev of ['touchstart', 'touchmove']) {
      svg.addEventListener(ev, e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    }
  }

  /** The pointer's x in the <svg>'s own coordinates. */
  const pointerX = (e, svg) => e.clientX - svg.getBoundingClientRect().left;

  /**
   * The frame a chart widget draws in (Charts, Chart · Totals and the other `Chart · …` widgets; the Electricity Overview
   * has its own): the `.ew` box (`ew <cls>`) with a message, the header, a plot box per `boxes` entry (its attributes;
   * each a chip row, the <svg> and a note, with `legendBelow` the chips under the svg) and a passing message under them.
   * It keeps the width (a ResizeObserver on `root`), tells `opts.onHeight` the height, redraws every `redrawMs` while
   * the widget is seen (not on a hidden page or an off-screen Smart Stack page) and keeps the messages (the kit's
   * `messageLine()`: a lasting one drops the widget's state through `clear()` and shows in the chart's place, a
   * passing one under it for 8 s). Strings are `opts.t('<prefix>.<key>')`, else `strings`.
   * The widget draws in `draw(shown)` (its plots: shown or hidden, `shown` when `has()` says there's state to draw)
   * and `header(column)` (its header's columns), and returns `api({setState, pushChange, …})`.
   * @param {HTMLElement} root
   * @param {{ opts?: any, cls: string, prefix: string, strings?: Record<string, string>, colors?: object, boxes?: object[],
   *   legendBelow?: boolean, showHeader?: boolean, redrawMs: number, has: () => boolean, clear: () => void,
   *   draw: (shown: boolean) => void, header: (column: (c: object) => void) => void }} spec
   */
  function createFrame(root, spec) {
    const { applyColors, messageLine, TIGHT_UNITS } = window.WidgetkeeperKit;
    const { opts = {}, cls, prefix, strings = {}, legendBelow = false } = spec;
    const t = (key, tokens) => {
      const s = opts.t ? opts.t(`${prefix}.${key}`, tokens) : null;
      if (s && s !== `${prefix}.${key}`) return s;
      return (strings[key] || key).replace(/__(\w+)__/g, (_, k) => (tokens && tokens[k] != null ? tokens[k] : ''));
    };
    const locale = opts.locale || navigator.language || 'en';
    const nfCache = {};
    /** A number in the phone's locale: `d` decimals, or none (rounded) without. */
    const nf = (v, d) => {
      const key = d == null ? 'int' : d;
      nfCache[key] = nfCache[key] || new Intl.NumberFormat(locale, d == null
        ? { maximumFractionDigits: 0 }
        : { minimumFractionDigits: d, maximumFractionDigits: d });
      return nfCache[key].format(v);
    };
    const pad2 = n => String(n).padStart(2, '0');

    applyColors(root, spec.colors || { style: opts.colorStyle }); // on the root, so the chart markup stays as it was
    const wrap = el('div', { class: `ew ${cls}${legendBelow ? ' legend-below' : ''}` }, root);
    const message = el('div', { class: 'ew-message', dir: 'auto' }, wrap);
    const header = el('div', { class: 'ew-header' }, wrap);
    const boxes = (spec.boxes || [{}]).map((attrs) => {
      const box = el('div', { class: `ew-chart ${cls}-chart`, ...attrs }, wrap);
      const chips = el('div', { class: 'ew-chips' }, box);
      const svg = el('svg:svg', null, box);
      if (legendBelow) box.appendChild(chips);
      const note = el('div', { class: `ew-message ${cls}-note`, dir: 'auto' }, box);
      return { box, chips, svg, note };
    });
    const transient = el('div', { class: `ew-message ${cls}-transient`, dir: 'auto' }, wrap);
    const line = messageLine(render, { clear: spec.clear });
    let lastHeight = 0;
    let offScreen = false;

    /** A header column: the value (`–` without one), its units (`units`; `tightUnits` decides the spacing) and the sub line. */
    function column({ value, units = '', tightUnits = units, sub, colCls = '', valueCls = '', attrs = {} }) {
      const col = el('div', { class: `ew-hcol${colCls}`, ...attrs }, header);
      const hv = el('div', { class: `ew-hval ${cls}-value${valueCls}${TIGHT_UNITS.test(tightUnits || '') ? ' tight' : ''}` }, col);
      el('span', { class: 'v ew-num', text: value == null ? '–' : value }, hv);
      if (units) el('span', { class: 'u', text: units }, hv);
      el('div', { class: 'ew-hsub', dir: 'auto', text: sub }, col);
    }

    function render() {
      const shown = spec.has();
      const lasting = line.text != null && !shown;
      show(message, lasting);
      message.textContent = lasting ? line.text : '';
      spec.draw(shown);
      const withHeader = shown && spec.showHeader !== false;
      show(header, withHeader);
      if (withHeader) {
        clear(header);
        spec.header(column);
        header.classList.toggle('one', header.childElementCount < 2);
      }
      const passing = shown && line.text != null;
      show(transient, passing);
      transient.textContent = passing ? line.text : '';
      if (opts.onHeight) {
        const h = Math.ceil(root.getBoundingClientRect().height);
        if (h && h !== lastHeight) { lastHeight = h; opts.onHeight(h); }
      }
    }

    const seen = () => !offScreen && !document.hidden;
    const timer = setInterval(() => { if (spec.has() && seen()) render(); }, spec.redrawMs);
    const onVisibility = () => { if (spec.has() && seen()) render(); };
    document.addEventListener('visibilitychange', onVisibility);

    const frame = {
      t, nf, locale,
      now: opts.now || (() => Date.now()),
      /** Homey's language (the dates' and weekdays' names): `setState()`'s, else `opts.language`. */
      language: opts.language || 'en',
      width: root.clientWidth || 368,
      kit: createKit(),
      wrap, header, boxes,
      hhmm: ms => { const d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); },
      /** A date in Homey's language (`{weekday: 'short', day: 'numeric'}` → `tir. 14`). */
      date: (ms, o) => {
        try { return new Intl.DateTimeFormat(frame.language || 'en', o).format(new Date(ms)); } catch (e) { return new Date(ms).toLocaleDateString(undefined, o); }
      },
      render,
      /** Draws now, unless nobody sees it (a hidden page, an off-screen Smart Stack page): then when it's back. */
      renderIfSeen() { if (seen()) render(); },
      /**
       * A realtime value (`{deviceId, capabilityId, value}`) onto each of `entries` that shows it (`pushLive()`, in the
       * window `win(at, i)` of entry i now), then drawn if seen.
       */
      pushLive(entries, { deviceId, capabilityId, value }, win) {
        const at = frame.now();
        let changed = false;
        entries.forEach((s, i) => {
          if (!isValue(s) || s.deviceId !== deviceId || s.capabilityId !== capabilityId) return;
          pushLive(s, value, at, win(at, i));
          changed = true;
        });
        if (changed) frame.renderIfSeen();
      },
      /** After new state: a lasting message goes (a passing one stays its 8 s). */
      resetMessage() { line.reset({ lastingOnly: true }); },
      /** Tap-to-inspect on a box's svg (`attachScrub()`): `onPointer(px, py)` with the pointer in the svg, `onReset()`. */
      scrub(svg, onPointer, onReset) {
        attachScrub(svg, e => onPointer(pointerX(e, svg), e.clientY - svg.getBoundingClientRect().top), onReset, { timer: null });
      },
      /**
       * A tap selection on a box's svg (`scrub()`): `pick(px, py)` gives what's tapped (null for nothing; `undefined`
       * leaves it, before the first drawing), kept in `state.sel` and drawn when it changes (compared as JSON, so it can
       * be an object, Chart · Timeline's row and band). With `withY` the pointer's height goes in `state.selY` too (the
       * line or layer nearest it). The pointer leaving, or a touch's 3 s after it lifts, clears it.
       */
      select(svg, state, pick, { withY = false } = {}) {
        const set = (sel, y = null) => {
          if (sel === undefined) return;
          const same = JSON.stringify(sel) === JSON.stringify(state.sel) && (!withY || sel == null || y === state.selY);
          if (same) return;
          state.sel = sel;
          if (withY) state.selY = sel == null ? null : y;
          render();
        };
        frame.scrub(svg, (px, py) => set(pick(px, py), py), () => set(null));
      },
      /** The widget's public API: its own (`setState`, `pushChange` …) with the frame's. */
      api(own) {
        return {
          ...own,
          /** A message in place of the chart, or with `transient` under it for 8 s (a failed refresh). */
          setMessage(text, transient) { line.set(text, transient); },
          render,
          t,
          /** The Smart Stack: whether this page is the one on screen (it only redraws while it is). */
          setVisible(visible) { offScreen = !visible; if (spec.has() && seen()) render(); },
          destroy() { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); },
        };
      },
    };

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver((entries) => {
        const w = Math.round(entries[0].contentRect.width);
        if (w && w !== frame.width) { frame.width = w; render(); }
      }).observe(root);
    }
    return frame;
  }

  const isValue = s => !!s && !('missing' in s);

  /**
   * A refreshed entry from `/state` with the live values of the one it replaces (`old`, the same value) that are newer
   * than its history kept: the app caches a history up to 5 min. One that isn't a value (`{missing}`) as it is. `key`:
   * the list, `[t, …]` oldest first (Chart · Timeline's `changes`).
   */
  function keepLive(s, old, key = 'points') {
    if (!isValue(s)) return s || { missing: true };
    const list = Array.isArray(s[key]) ? s[key].slice() : [];
    const same = isValue(old) && old.deviceId === s.deviceId && old.capabilityId === s.capabilityId;
    const after = list.length ? list[list.length - 1][0] : -Infinity;
    return { ...s, [key]: list.concat(same ? old[key].filter(p => p[0] > after) : []) };
  }

  /**
   * A realtime value (Device Values' `values:state`) onto an entry that shows it: its value now, and a point at `at` when
   * the window `win` (the kit's `timeSpan()`) runs up to now and the history isn't Homey's 6-hour averages (the kit's
   * `sixHourLog()`: a meter's values would pile up behind the log; the value now still carries the line on). Points older
   * than the window go, but the last one before it, which carries into its start.
   * @param {{ value?: unknown, points: [number, number][], step?: number }} s
   * @param {{ from: number, end: number }} win
   */
  function pushLive(s, value, at, win) {
    s.value = value;
    if (typeof value !== 'number' || !isFinite(value) || win.end !== at || window.WidgetkeeperKit.sixHourLog(s)) return;
    s.points.push([at, value]);
    while (s.points.length > 1 && s.points[1][0] < win.from) s.points.shift();
  }

  /**
   * A chart widget's mount.js: Homey's frame (the kit's `wireFrame()`), the first load and a refetch every 5 min (which
   * keeps the app's device subscriptions alive and resyncs the history), the realtime values (Device Values' `values:state`,
   * which the app's Sparklines service behind `/state` uses) and a changed device names setting. `create(link)` makes the
   * widget (with `onHeight: link.setHeight`); `query()` is the `/state` request's own part, or null when nothing is picked
   * (the widget then says its `need` string); `state(res)` is `setState()`'s arguments from the answer. A failed refresh
   * keeps the chart with a passing message; only a failed first load replaces it with the error.
   * @param {any} Homey
   * @param {{ frame: HTMLElement }} where
   * @param {{ create: (link: any) => any, query: () => string | null, need: string, state: (res: any) => any[] }} spec
   */
  function wireChart(Homey, { frame }, { create, query, need, state }) {
    const { wireFrame, onDeviceNames } = window.WidgetkeeperKit;
    const link = wireFrame(Homey, frame);
    const widget = create(link);
    let loaded = false;

    async function load() {
      const q = query();
      if (q == null) {
        widget.setMessage(widget.t(need));
        link.ready();
        return;
      }
      try {
        const res = await Homey.api('GET', `/state?${q}${link.perfParam()}`);
        widget.setState(...state(res));
        loaded = true;
      } catch (err) {
        console.error(err);
        widget.setMessage(widget.t('error'), loaded);
      }
      link.ready();
    }

    Homey.on('values:state', (data) => {
      if (data) widget.pushChange(data);
    });
    setInterval(load, REFRESH_MS);
    onDeviceNames(Homey, load);
    load();

    return {
      /** The Smart Stack: whether this page is the one on screen. */
      setVisible: v => widget.setVisible(v),
    };
  }

  window.WidgetkeeperChart = {
    MIN, HOUR, L, X_LABEL_GAP, X_LABEL_H, LABEL_PAD, LABEL_MIN_GAP,
    niceStep, ticks, el, clear, show, f1, smoothValues, linePath, stepPath, p985, p015,
    compactNumber, ago, stepDecimals, axisLabel, buckets, alignSeries, profile, trendLine, barUnit, useBuckets, meterTotal, calendarLabels, createKit, attachScrub, pointerX,
    createFrame, wireChart, keepLive, pushLive,
  };
})();
