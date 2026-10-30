/*
 * Chart · Scatter (XY): one value against another over a time span, a dot per hour (or a minute to a week, by the span),
 * each the two values' averages over its time, older dots fainter, with the straight line that fits them best: does the
 * heat pump work harder when it's colder? Drawn by the shared chart module (../electricity/chart.js,
 * `window.WidgetkeeperChart`, loaded first). Plain browser JS (served as-is).
 */
(function () {
  const { scaled, formatNumber, timeSpan, isTimeSpan, sixHourSpan } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const C = window.WidgetkeeperChart;
  const { MIN, HOUR, L, X_LABEL_GAP, X_LABEL_H, clear, show, f1 } = C;

  const DAY = 24 * HOUR;
  const CHIP_H = 38; // chip row → top grid line, as Charts'
  const PLOT_H = 160; // taller than a time chart's: the dots need the height as much as the width
  const R_GAP = 8; // right of the plot, so the last x label fits
  /** A dot's time, shortest first (`dotUnit()`), and the most dots a span gets. */
  const DOT_STEPS = [MIN, 5 * MIN, 15 * MIN, HOUR, 3 * HOUR, 6 * HOUR, DAY, 'week'];
  const MAX_DOTS = 400;
  const PICK_PX = 24; // a tap picks the nearest dot within this
  const DOTS = ['auto', 'hour', 'day'];

  const DEFAULT_STRINGS = {
    selectValues: 'Pick a value across (x) and a value up (y) in the widget settings.',
    error: 'Could not load the chart.',
    unavailable: 'Unavailable',
    noHistory: 'Not enough history of both yet.',
    now: 'Now',
    trend: 'Trend',
  };

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, color?: string, t?: (key: string) => string, locale?: string, language?: string, now?: () => number,
   *   span?: string, dots?: string, trend?: boolean, fade?: boolean, title?: string, showHeader?: boolean, onHeight?: (h: number) => void }} opts
   */
  function createScatterWidget(root, opts = {}) {
    // Any time span (the kit's `timeSpan()`); missing or unknown: the last 7 days.
    const span = isTimeSpan(opts.span) ? opts.span : '7d';
    const dots = DOTS.includes(opts.dots) ? opts.dots : 'auto';
    const trend = opts.trend !== false;
    const fade = opts.fade !== false;
    const title = typeof opts.title === 'string' ? opts.title.trim() : '';

    const state = {
      x: null, // Sparklines' slot state ({deviceId, capabilityId, name, capability, value, points} | {missing}), across
      y: null, // the same, up
      sel: null, // the tapped dot's time: dropped once the span moves past it
    };
    let drawn = null; // the latest render's dots with their place, and the trend

    const frame = C.createFrame(root, {
      opts, cls: 'xy', prefix: 'scatter', strings: DEFAULT_STRINGS, showHeader: opts.showHeader,
      colors: { style: opts.colorStyle, color: opts.color, fallback: 'blue' },
      redrawMs: 60e3,
      has: () => state.x != null,
      clear: () => { state.x = state.y = null; },
      draw, header: renderHeader,
    });
    const { t, nf, hhmm, date, now, kit } = frame;
    const { box, chips, svg, note } = frame.boxes[0];
    // The x value's chip goes under its labels, at the right.
    const xChips = C.el('div', { class: 'ew-chips xy-x' });
    box.insertBefore(xChips, note);

    // ------------------------------------------------------------------ derived data

    const ok = s => !!s && !('missing' in s);
    const current = s => (ok(s) && typeof s.value === 'number' && isFinite(s.value) ? s.value : null);
    const pointsOf = s => (ok(s) ? (s.points || []).filter(p => typeof p[1] === 'number' && isFinite(p[1])) : []);
    const units = s => (ok(s) && s.capability.units ? s.capability.units : '');

    /**
     * A dot's time over the window: an hour or a day when set, else the shortest of `DOT_STEPS` giving at most `MAX_DOTS`,
     * no shorter than 6 h where Homey's log is 6-hourly (`sixHourSpan()`).
     */
    function dotUnit(win) {
      if (dots === 'hour') return HOUR;
      if (dots === 'day') return DAY;
      const length = s => (s === 'week' ? 7 * DAY : s);
      const least = sixHourSpan(span) ? 6 * HOUR : 0;
      return DOT_STEPS.find(s => length(s) >= least && (win.to - win.from) / length(s) <= MAX_DOTS) || 'week';
    }

    /** The dots at `at`: each time with both values (their averages over it, the last before carried on), oldest first. */
    function dotsAt(at) {
      const win = timeSpan(span, at);
      const live = win.end === at;
      const rows = C.alignSeries([pointsOf(state.x), pointsOf(state.y)], win.from, win.end, dotUnit(win),
        live ? [current(state.x), current(state.y)] : []);
      const list = rows.filter(r => r.values.every(v => typeof v === 'number' && isFinite(v)))
        .map(r => ({ t: r.t, end: r.end, x: r.values[0], y: r.values[1] }));
      return { win, live, list };
    }

    function titleOf(s) {
      if (!ok(s)) return t('unavailable');
      return [s.name, s.capability.title].filter(Boolean).join(' · ');
    }

    /** The trend's slope: up to three significant digits, a real minus sign. */
    const slopeFormat = new Intl.NumberFormat(frame.locale, { maximumSignificantDigits: 3 });
    const slopeText = v => (v < 0 ? '−' : '') + slopeFormat.format(Math.abs(v));

    /** A dot's time: `14:00–15:00` (a weekday before it over several days), a day's `tir. 14`, a week's start. */
    function whenText(dot, win) {
      if (dot.end - dot.t > 23 * HOUR) return date(dot.t, { weekday: 'short', day: 'numeric', month: 'short' });
      const day = win.to - win.from > DAY + HOUR ? `${date(dot.t, { weekday: 'short' })} ` : '';
      return `${day}${hhmm(dot.t)}–${hhmm(dot.end)}`;
    }

    // ------------------------------------------------------------------ render

    /** The chart, shown (`on`) or hidden; the frame draws the message, the header and the passing message around it. */
    function draw(on) {
      show(box, on);
      drawn = null;
      if (on) renderChart();
    }

    /** The newest dot, or the tapped one (kept as its time; dropped once it's left the span). */
    function shownDot() {
      if (!drawn || !drawn.dots.length) return null;
      if (state.sel != null) {
        const k = drawn.dots.findIndex(d => d.t === state.sel);
        if (k >= 0) return { dot: drawn.dots[k], tapped: true };
        state.sel = null;
      }
      return { dot: drawn.dots[drawn.dots.length - 1], tapped: false };
    }

    function renderHeader(column) {
      const x = state.x, y = state.y;
      const shown = shownDot();
      if (!ok(x) || !ok(y) || !shown) {
        column({ value: null, sub: !ok(x) || !ok(y) ? t('unavailable') : t('noHistory') });
        return;
      }
      const { dot, tapped } = shown;
      const at = tapped || !drawn.live ? whenText(dot, drawn.win) : t('now');
      column({
        value: formatNumber(y.capability, dot.y, tapped || !drawn.live), units: units(y),
        sub: `${formatNumber(x.capability, dot.x, true)}${units(x) ? ` ${units(x)}` : ''} · ${at}`,
      });
      if (drawn.trend) {
        const per = [units(y), units(x)].every(Boolean) ? `${units(y)}/${units(x)}` : '';
        column({ value: slopeText(drawn.trend.slope), units: per, sub: t('trend'), colCls: ' trend' });
      }
    }

    function renderChart() {
      const w = frame.width;
      const pw = Math.max(40, w - L - R_GAP);
      const top = CHIP_H, base = top + PLOT_H;
      const H = base + X_LABEL_GAP + X_LABEL_H;
      const x = state.x, y = state.y;

      clear(chips);
      kit.chip(chips, 'series', title || titleOf(y), units(y) || null);
      clear(xChips);
      kit.chip(xChips, 'series x', titleOf(x), units(x) || null);

      const { win, live, list } = dotsAt(now());
      const drawable = ok(x) && ok(y) && list.length >= 2;
      show(svg, drawable);
      // A missing value's chip already says Unavailable, unless the chart's own title stands in the value up's.
      const why = ok(x) && ok(y) ? t('noHistory') : !ok(y) && title ? t('unavailable') : null;
      show(note, !drawable && why != null);
      note.textContent = why || '';
      box.classList.toggle('empty', !drawable);
      if (!drawable) return;

      kit.prepareSvg(svg, w, H);
      const xs = list.map(d => scaled(x.capability, d.x)), ys = list.map(d => scaled(y.capability, d.y));
      const ySc = kit.valueScale(svg, { max: Math.max(...ys), min: Math.min(...ys), h: PLOT_H, top, pw, format: (v, step) => C.axisLabel(nf, v, step), fit: true });
      const xSc = kit.xValueScale(svg, { max: Math.max(...xs), min: Math.min(...xs), pw, top, base, format: (v, step) => C.axisLabel(nf, v, step) });
      kit.axis(svg, top, base, pw);

      // The dots, oldest first so the newest lie on top; with `fade`, older ones fainter.
      const placed = list.map((d, k) => ({ ...d, px: xSc.x(xs[k]), py: ySc.y(ys[k]) }));
      const g = C.el('svg:g', { class: 'xy-dots' }, svg);
      placed.forEach((d, k) => {
        const opacity = fade ? 0.15 + 0.7 * k / Math.max(1, placed.length - 1) : 0.7;
        C.el('svg:circle', { class: 'xy-dot', cx: f1(d.px), cy: f1(d.py), r: 2.6, 'fill-opacity': opacity.toFixed(2) }, g);
      });

      // The trend over them: the line through the dots as drawn (display units), cut to the plot.
      const fit = trend ? C.trendLine(xs.map((v, k) => [v, ys[k]])) : null;
      if (fit) {
        const yAt = v => fit.intercept + fit.slope * v;
        let x0 = xSc.axisMin, x1 = xSc.axisMax;
        if (fit.slope !== 0) {
          const [a, b] = [(ySc.axisMin - fit.intercept) / fit.slope, (ySc.axisMax - fit.intercept) / fit.slope].sort((m, n) => m - n);
          x0 = Math.max(x0, a);
          x1 = Math.min(x1, b);
        }
        if (x1 > x0) C.el('svg:path', { class: 'xy-trend', d: `M${f1(xSc.x(x0))} ${f1(ySc.y(yAt(x0)))}L${f1(xSc.x(x1))} ${f1(ySc.y(yAt(x1)))}` }, svg);
      }

      drawn = { win, live, dots: placed, trend: fit ? { slope: fit.slope, r: fit.r } : null };
      const shown = shownDot();
      kit.dot(svg, shown.dot.px, shown.dot.py, 'series');
    }

    // ------------------------------------------------------------------ interaction

    /** The dot nearest the pointer, within `PICK_PX`, kept as its time. */
    function scrub(px, py) {
      if (!drawn) return;
      let best = null, bestD = PICK_PX;
      for (const d of drawn.dots) {
        const dd = Math.hypot(d.px - px, d.py - py);
        if (dd <= bestD) { best = d; bestD = dd; }
      }
      const at = best ? best.t : null;
      if (at !== state.sel) { state.sel = at; frame.render(); }
    }
    frame.scrub(svg, scrub, () => { if (state.sel != null) { state.sel = null; frame.render(); } });

    // ------------------------------------------------------------------ public API

    /** An entry with the live points newer than its refreshed history kept (it's cached up to 5 min). */
    function merged(s, old) {
      if (!ok(s)) return s || { missing: true };
      const points = Array.isArray(s.points) ? s.points.slice() : [];
      const same = ok(old) && old.deviceId === s.deviceId && old.capabilityId === s.capabilityId;
      const after = points.length ? points[points.length - 1][0] : -Infinity;
      return { ...s, points: points.concat(same ? old.points.filter(p => p[0] > after) : []) };
    }

    return frame.api({
      /** The two values' states, across and up (`/state`'s `charts`). */
      setState(list, lang) {
        if (lang) frame.language = lang;
        const [x, y] = Array.isArray(list) ? list : [];
        state.x = merged(x, state.x);
        state.y = merged(y, state.y);
        frame.resetMessage();
        frame.render();
      },
      /** A realtime value (Device Values' `values:state`): appended to the value it is, across or up. */
      pushChange({ deviceId, capabilityId, value }) {
        const at = now();
        const win = timeSpan(span, at);
        let changed = false;
        for (const s of [state.x, state.y]) {
          if (!ok(s) || s.deviceId !== deviceId || s.capabilityId !== capabilityId) continue;
          s.value = value;
          // Not onto Homey's 6-hour averages (`sixHourSpan()`): the value now still fills the last dot.
          if (typeof value === 'number' && isFinite(value) && win.end === at && !sixHourSpan(span)) {
            s.points.push([at, value]);
            while (s.points.length && s.points[0][0] < win.from) s.points.shift();
          }
          changed = true;
        }
        if (changed) frame.renderIfSeen();
      },
      /** Both values' window now, as `/state` asks for them (lib/chartState.ts): `<span>~<from>~<end>~<unit>`. */
      windows: () => {
        const w = timeSpan(span, now());
        const one = `${span}~${Math.floor(w.from)}~${Math.ceil(w.end)}~${w.unit || ''}`;
        return [one, one];
      },
    });
  }

  window.createScatterWidget = createScatterWidget;
})();
