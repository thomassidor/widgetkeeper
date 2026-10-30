/*
 * Chart · Lines: up to six values over time on one chart, a line each in its own colour: every room's temperature, each
 * radiator's power. A value scale on the left for the first value's units and one on the right for a second kind (power
 * against the outdoor temperature); a value in a third kind of units is left out, its chip saying so. Drawn by
 * the shared chart module (../electricity/chart.js, `window.WidgetkeeperChart`, loaded first). Plain browser JS
 * (served as-is).
 */
(function () {
  const { COLORS, scaled, formatNumber, timeSpan, isTimeSpan } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const C = window.WidgetkeeperChart;
  const { L, X_LABEL_GAP, X_LABEL_H, HOUR, clear, show, f1, smoothValues } = C;

  const R = 34; // right gutter for the second scale, as Charts' two on one chart
  const TOP_PAD = 10; // the top grid line: room for the top scale label (the legend is in the page's flow, above or below)
  const PLOT_H = 122; // Charts' one-chart plot
  const MAX = 6;
  const DAY = 24 * HOUR;
  /** Units a value may be scaled between (to the first value's): power and energy, as Chart · Stacked's. */
  const UNIT_SCALE = { W: ['W', 1], kW: ['W', 1e3], MW: ['W', 1e6], Wh: ['Wh', 1], kWh: ['Wh', 1e3], MWh: ['Wh', 1e6] };

  const DEFAULT_STRINGS = {
    selectValues: 'Pick the values to show in the widget settings.',
    error: 'Could not load the chart.',
    unavailable: 'Unavailable',
    noHistory: 'No history yet.',
    otherUnits: 'Other units',
    now: 'Now',
    average: 'avg',
  };

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, colors?: string[], t?: (key: string) => string, locale?: string, language?: string,
   *   now?: () => number, count?: number, span?: string, style?: string, range?: string, smooth?: boolean,
   *   legend?: string, title?: string, showHeader?: boolean, onHeight?: (h: number) => void }} opts
   */
  function createLinesWidget(root, opts = {}) {
    // Any time span (the kit's `timeSpan()`); missing or unknown: 24 hours.
    const span = isTimeSpan(opts.span) ? opts.span : '24h';
    const areas = opts.style === 'area';
    const fromZero = opts.range === 'zero';
    const smooth = opts.smooth === true;
    const legendBelow = opts.legend === 'below';
    const title = typeof opts.title === 'string' ? opts.title.trim() : '';
    const count = Math.max(1, Math.min(MAX, Number(opts.count) || 1));
    // Each value's colour (its setting), else the kit's colours in order.
    const colorOf = i => (opts.colors && COLORS.includes(opts.colors[i]) ? opts.colors[i] : COLORS[i % COLORS.length]);

    const state = {
      series: [], // per value, as picked: Sparklines' slot state with its points, or {missing}
      sel: null, // the tapped time, kept as a time so it stays put as the window moves
      selY: null, // and the pointer's height, for the line nearest it
    };
    let drawn = null; // the latest render: the window, x, y, each line's points

    const frame = C.createFrame(root, {
      opts, cls: 'ln', prefix: 'lines', strings: DEFAULT_STRINGS, legendBelow, showHeader: opts.showHeader,
      colors: { style: opts.colorStyle },
      redrawMs: 60e3,
      has: () => state.series.length > 0,
      clear: () => { state.series = []; },
      draw, header: renderHeader,
    });
    const { t, nf, now, kit } = frame;
    const { box, chips, svg, note } = frame.boxes[0];

    // ------------------------------------------------------------------ derived data

    const ok = s => !!s && !('missing' in s);
    const num = v => typeof v === 'number' && isFinite(v);

    /** The factor from a slot's units to `units` (its side's), or null when they can't be compared. */
    function factor(s, units) {
      const from = s.capability.units || '', to = units || '';
      if (from === to) return 1;
      const a = UNIT_SCALE[from], b = UNIT_SCALE[to];
      return a && b && a[0] === b[0] ? a[1] / b[1] : null;
    }

    /**
     * The values that can be drawn, each on its side with its factor to that side's units: the first readable value sets
     * the left scale's units, the first one that can't go on it the right's (`sides`, each `{first, units}`); a value
     * that fits neither is `other`.
     */
    function plan() {
      const sides = [];
      const all = state.series.map((s, i) => {
        if (!ok(s)) return { i, s, missing: true, color: colorOf(i) };
        let side = sides.findIndex(sd => factor(s, sd.units) != null);
        if (side < 0 && sides.length < 2) { sides.push({ first: s, units: s.capability.units || '' }); side = sides.length - 1; }
        if (side < 0) return { i, s, color: colorOf(i), other: true };
        return { i, s, color: colorOf(i), side, f: factor(s, sides[side].units), other: false };
      });
      return { sides, all, drawable: all.filter(l => !l.missing && !l.other) };
    }

    /**
     * Each drawable value's points in the window (`[t, v]` in the shared units), with the value now carrying its line on
     * to now while the window is live; `live` whether it is.
     */
    function linesAt(at, p) {
      const win = timeSpan(span, at);
      const live = win.end === at;
      const lines = p.drawable.map((l) => {
        const pts = (l.s.points || []).filter(q => num(q[1]) && q[0] >= win.from && q[0] <= win.end)
          .map(q => [q[0], scaled(l.s.capability, q[1]) * l.f]);
        if (live && num(l.s.value) && pts.length) pts.push([at, scaled(l.s.capability, l.s.value) * l.f]);
        return { ...l, pts };
      });
      return { win, live, lines, known: lines.filter(l => l.pts.length > 0) };
    }

    /** A line's value at `ms`: its nearest point's (`[t, v]`), or null without one. */
    function pointAt(line, ms) {
      let best = null;
      for (const q of line.pts) if (!best || Math.abs(q[0] - ms) < Math.abs(best[0] - ms)) best = q;
      return best;
    }

    /** A line's average over the window, each point weighed by the time to the next (the points are evenly spaced). */
    function average(line) {
      const q = line.pts;
      if (q.length < 2) return q.length ? q[0][1] : null;
      let sum = 0, len = 0;
      for (let j = 0; j < q.length - 1; j++) { const d = q[j + 1][0] - q[j][0]; sum += q[j][1] * d; len += d; }
      return len > 0 ? sum / len : q[0][1];
    }

    /** A value as the header writes it, to its side's first value's decimals (`averaged`: three significant digits within them). */
    const valueText = (p, l, v, averaged) => formatNumber({ ...p.sides[l.side].first.capability, max: null }, v, averaged);

    /** A point's time: `14:00`, with the weekday over several days, the date over more than a week. */
    function timeText(ms, win) {
      const length = win.to - win.from;
      if (length > 8 * DAY) return `${frame.date(ms, { day: 'numeric', month: 'short' })} ${frame.hhmm(ms)}`;
      if (length > DAY + HOUR) return `${frame.date(ms, { weekday: 'short' })} ${frame.hhmm(ms)}`;
      return frame.hhmm(ms);
    }

    // ------------------------------------------------------------------ render

    /** The chart, shown (`on`) or hidden; the frame draws the message, the header and the passing message around it. */
    function draw(on) {
      show(box, on);
      drawn = null;
      if (on) renderChart();
    }

    function renderHeader(column) {
      const p = plan();
      if (!p.drawable.length) { column({ value: null, sub: t('unavailable') }); return; }
      const d = drawn || { ...linesAt(now(), p), p };
      const colOf = (line, v, sub, colCls, averaged) => column({
        value: v == null ? null : valueText(p, line, v, averaged), units: v == null ? '' : p.sides[line.side].units, sub: `${line.s.name} · ${sub}`, colCls,
        attrs: { 'data-wk-color': line.color },
      });
      if (state.sel != null && d.known.length) {
        // The line nearest the pointer at the tapped time, then the next nearest.
        const at = d.known.map(l => ({ l, q: pointAt(l, state.sel) })).filter(a => a.q);
        const y = drawn && drawn.yOf;
        at.sort((a, b) => (y && state.selY != null ? Math.abs(y(a.l)(a.q[1]) - state.selY) - Math.abs(y(b.l)(b.q[1]) - state.selY) : 0));
        at.slice(0, 2).forEach((a, k) => colOf(a.l, a.q[1], timeText(a.q[0], d.win), k ? ' low' : '', a.q[0] !== now()));
        return;
      }
      // The first two values now, or over a finished span their averages.
      const shown = d.known.slice(0, 2);
      if (!shown.length) { column({ value: null, sub: t('noHistory') }); return; }
      shown.forEach((l, k) => {
        if (d.live) colOf(l, num(l.s.value) ? scaled(l.s.capability, l.s.value) * l.f : l.pts[l.pts.length - 1][1], t('now'), k ? ' low' : '', !num(l.s.value));
        else colOf(l, average(l), t('average'), k ? ' low' : '', true);
      });
    }

    function renderChart() {
      const w = frame.width;
      const p = plan();
      const at = now();

      clear(chips);
      // Each side's units once: with one side on the title, else on the first line drawn on each side.
      const oneSide = p.sides.length < 2;
      if (title) kit.chip(chips, 'series', title, oneSide && p.sides.length ? p.sides[0].units || null : null);
      for (const l of p.all) {
        const firstOfSide = !l.missing && !l.other && l === p.drawable.find(m => m.side === l.side);
        kit.chip(chips, `series${l.missing || l.other ? ' missing' : ''}`, l.missing ? t('unavailable') : l.s.name,
          l.other ? t('otherUnits') : firstOfSide && !(title && oneSide) ? p.sides[l.side].units || null : null);
        chips.lastChild.setAttribute('data-wk-color', l.color);
      }

      const d = p.drawable.length ? linesAt(at, p) : null;
      const drawable = !!d && d.known.length > 0;
      show(svg, drawable);
      show(note, !drawable);
      note.textContent = p.drawable.length ? t('noHistory') : t('unavailable');
      box.classList.toggle('empty', !drawable);
      if (!drawable) return;

      const { win } = d;
      // A second scale on the right only when a line drawn is on it.
      const two = d.known.some(l => l.side === 1) && d.known.some(l => l.side === 0);
      const pw = Math.max(40, w - L - (two ? R : 4));
      const top = TOP_PAD, base = top + PLOT_H;
      kit.prepareSvg(svg, w, base + X_LABEL_GAP + X_LABEL_H);
      const range = (side) => {
        const values = d.known.filter(l => two ? l.side === side : true).flatMap(l => l.pts.map(q => q[1]));
        const max = Math.max(...values), min = Math.min(...values);
        return { max: fromZero ? Math.max(max, 0) : max, min: fromZero ? Math.min(min, 0) : min, format: (v, step) => C.axisLabel(nf, v, step) };
      };
      const scales = two
        ? kit.dualScale(svg, { a: range(0), b: range(1), h: PLOT_H, top, pw, fit: !fromZero })
        : (() => { const one = kit.valueScale(svg, { ...range(0), h: PLOT_H, top, pw, fit: !fromZero }); return { a: one, b: one }; })();
      kit.timeLabels(svg, win, { pw, top, base, nf, date: frame.date, now: t('now') });
      kit.axis(svg, top, base, pw);
      const x = ms => L + pw * (ms - win.from) / (win.to - win.from);
      const scaleOf = l => (l.side === 1 ? scales.b : scales.a);
      const yOf = l => scaleOf(l).y;

      // The lines in their order, each with its area under it with `area`; the last picked on top.
      for (const l of d.known) {
        const vs = smooth ? smoothValues(l.pts.map(q => q[1])) : l.pts.map(q => q[1]);
        const y = yOf(l);
        const xy = l.pts.map((q, j) => [x(q[0]), y(vs[j])]);
        const g = C.el('svg:g', { class: 'ln-series', 'data-wk-color': l.color }, svg);
        if (xy.length === 1) { C.el('svg:circle', { class: 'ln-point', cx: f1(xy[0][0]), cy: f1(xy[0][1]), r: 2 }, g); continue; }
        const line = C.linePath(xy, smooth);
        if (areas) C.el('svg:path', { class: 'ln-area', d: `${line}L${f1(xy[xy.length - 1][0])} ${f1(scaleOf(l).baseY)}L${f1(xy[0][0])} ${f1(scaleOf(l).baseY)}Z` }, g);
        C.el('svg:path', { class: 'ln-line', d: line }, g);
      }
      if (win.end < win.to) C.el('svg:rect', { class: 'future', x: f1(x(win.end)), y: top - 6, width: f1(x(win.to) - x(win.end)), height: f1(base - top + 6) }, svg);

      // A dot on each line's latest point while live; at the tapped time, a cursor and a dot on each line.
      const dotsAt = list => list.forEach(([l, q]) => {
        const g = C.el('svg:g', { class: 'ln-series', 'data-wk-color': l.color }, svg);
        kit.dot(g, x(q[0]), yOf(l)(q[1]), 'ln-dot', true);
      });
      if (state.sel != null && state.sel >= win.from && state.sel <= win.end) {
        C.el('svg:path', { class: 'cursor', d: `M${f1(x(state.sel))} ${top}V${base}` }, svg);
        dotsAt(d.known.map(l => [l, pointAt(l, state.sel)]).filter(a => a[1]));
      } else if (d.live) {
        dotsAt(d.known.map(l => [l, l.pts[l.pts.length - 1]]));
      }
      drawn = { ...d, p, x, yOf };
    }

    // ------------------------------------------------------------------ interaction

    /** The time under the pointer, and its height for the line nearest it. */
    frame.select(svg, state, (px) => {
      if (!drawn) return undefined;
      const { win } = drawn;
      const ms = Math.max(win.from, Math.min(win.end, win.from + (px - L) / (drawn.x(win.to) - L) * (win.to - win.from)));
      // The nearest point's time, so the header and the dots agree.
      const q = drawn.known.map(l => pointAt(l, ms)).filter(Boolean).sort((a, b) => Math.abs(a[0] - ms) - Math.abs(b[0] - ms))[0];
      return q ? q[0] : null;
    }, { withY: true });

    // ------------------------------------------------------------------ public API

    return frame.api({
      /** Each value, as picked (`/state`'s `charts`). */
      setState(list, lang) {
        if (lang) frame.language = lang;
        const previous = state.series;
        state.series = (Array.isArray(list) ? list : []).slice(0, MAX).map((s, i) => C.keepLive(s, previous[i]));
        frame.resetMessage();
        frame.render();
      },
      /** A realtime value (Device Values' `values:state`): onto every line that shows it (not on a 6-hourly span). */
      pushChange(change) { frame.pushLive(state.series, change, at => timeSpan(span, at)); },
      /** The span's window now, once per value, as `/state` asks for it (lib/chartState.ts). */
      windows: () => {
        const w = timeSpan(span, now());
        return Array.from({ length: count }, () => `${span}~${Math.floor(w.from)}~${Math.ceil(w.end)}~${w.unit || ''}`);
      },
    });
  }

  window.createLinesWidget = createLinesWidget;
})();
