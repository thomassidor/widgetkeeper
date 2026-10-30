/*
 * Charts: one chart, two stacked, or two series on one chart, of any logged number, drawn like the Electricity Overview's charts by the
 * shared chart module (../electricity/chart.js, `window.WidgetkeeperChart`, loaded first).
 * Plain browser JS (served as-is).
 */
(function () {
  const { COLORS, scaled, formatNumber, parseSpan, timeSpan, isTimeSpan, spanUnit, sixHourSpan } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const C = window.WidgetkeeperChart;
  const { HOUR, L, X_LABEL_GAP, X_LABEL_H, el, clear, show, f1, smoothValues } = C;

  const DAY = 24 * HOUR;
  const CHIP_H = 38; // chip row → top grid line, as the Electricity Overview's
  const TOP_PAD = 10; // the top grid line with the legend below the chart: room for the top scale label
  const PLOT_H = { 1: 122, 2: 83 }; // one chart: the price chart's height; two: the live chart's
  const R = 34; // right gutter for the second scale on one chart, as the Electricity Overview's usage scale
  const STYLES = ['area', 'line', 'bars'];

  const DEFAULT_STRINGS = {
    now: 'Now',
    selectChart: 'Pick a device value in the widget settings.',
    error: 'Could not load the chart.',
    unavailable: 'Unavailable',
    noHistory: 'No history yet.',
    yesterdayAvg: 'Yesterday · avg',
    lastWeekAvg: 'Last week · avg',
    lastMonthAvg: 'Last month · avg',
    lastYearAvg: 'Last year · avg',
    rangeAvg: '__range__ · avg',
  };
  /** A finished period's header line, by its unit: the one before this (yesterday …), or its dates (`rangeAvg`). */
  const AVG_KEYS = { day: 'yesterdayAvg', week: 'lastWeekAvg', month: 'lastMonthAvg', year: 'lastYearAvg' };


  /** Bars on the local clock: the chart module's (moved there for Chart · Totals; tests and previews call it by this name). */
  const chartBuckets = C.buckets;

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, t?: (key: string, tokens?: object) => string, locale?: string, language?: string, now?: () => number,
   *   charts?: { span?: string, style?: string, color?: string, range?: string, negative?: boolean, smooth?: boolean, title?: string }[],
   *   overlay?: boolean, sharedScale?: boolean, showHeader?: boolean, legend?: string, onHeight?: (h: number) => void }} opts
   */
  function createChartsWidget(root, opts = {}) {
    /** The charts' settings, with fallbacks for anything missing or unknown. */
    const charts = (opts.charts && opts.charts.length ? opts.charts : [{}]).slice(0, 2).map(c => ({
      span: isTimeSpan(c.span) ? c.span : '24h',
      style: STYLES.includes(c.style) ? c.style : 'area',
      color: COLORS.includes(c.color) ? c.color : 'blue',
      fit: c.range !== 'zero',
      negative: c.negative === true,
      smooth: c.smooth === true,
      title: typeof c.title === 'string' ? c.title.trim() : '',
    }));
    // Two series on one chart share chart 1's time axis and kind of scale; with `sharedScale`, the scale itself. Two
    // calendar periods of one kind (today with yesterday, this month with last …) keep their own: each runs over the
    // whole axis, so series 2 is drawn by its place in its period. The mount asks for these spans (`spans()`).
    const overlay = opts.overlay === true && charts.length === 2;
    if (overlay) {
      charts[1].fit = charts[0].fit;
      const unit = spanUnit(charts[0].span);
      if (!(unit && unit === spanUnit(charts[1].span))) charts[1].span = charts[0].span;
    }
    const sharedScale = overlay && opts.sharedScale === true;
    // The legend (each chart's chip) above its plot, or under its time labels.
    const legendBelow = opts.legend === 'below';
    const plotTop = legendBelow ? TOP_PAD : CHIP_H;

    const state = {
      entries: [], // per chart: Sparklines' slot ({deviceId, capabilityId, name, capability, value, points} | {missing})
      // The tapped point's time, or a time inside the tapped bar (its end), per chart: not an index, since the
      // points move along with the window and the live values.
      sel: charts.map(() => null),
    };
    const geom = charts.map(() => null); // the latest render's x positions, for the pointer math

    // The line scrolls with time: about a pixel per redraw, at most once a second.
    const at = opts.now ? opts.now() : Date.now();
    const shortest = Math.min(...charts.map((c) => { const w = timeSpan(c.span, at); return w.to - w.from; }));
    const frame = C.createFrame(root, {
      opts, cls: 'ch', prefix: 'charts', strings: DEFAULT_STRINGS, legendBelow, showHeader: opts.showHeader,
      boxes: charts.map(c => ({ 'data-color': c.color })),
      redrawMs: Math.max(1000, Math.min(60e3, shortest / 300)),
      has: () => state.entries.length > 0,
      clear: () => { state.entries = []; },
      draw, header: renderHeader,
    });
    const { t, nf, hhmm, date, now, kit } = frame;
    const ui = frame.boxes;
    const weekday = ms => date(ms, { weekday: 'short' });

    // ------------------------------------------------------------------ derived data

    /**
     * The chart's window at `at` (the kit's `timeSpan()`): the axis `[from, to]` and `end`, where its data stops;
     * `live` when that's now (not yesterday or a last week, month or year), `unit` for a calendar span (`day`,
     * `week`, `month`, `year`), whose axis is the whole period.
     */
    function windowOf(i, at) {
      const w = timeSpan(charts[i].span, at);
      return { ...w, live: w.end === at, unit: w.unit || null };
    }

    /**
     * The chart's logged (and live) points in its window. A month's or year's log starts with the 6 hours holding the
     * period's start, so a point of those before the start counts from the start.
     */
    function loggedPoints(i, win) {
      const s = state.entries[i];
      if (!s || 'missing' in s) return [];
      const ok = p => typeof p[1] === 'number' && isFinite(p[1]);
      const pts = (s.points || []).filter(p => p[0] >= win.from && p[0] <= win.end && ok(p));
      if (!sixHourSpan(charts[i].span) || (pts.length && pts[0][0] === win.from)) return pts;
      const before = (s.points || []).filter(p => p[0] < win.from && p[0] >= win.from - 6 * HOUR && ok(p)).pop();
      return before ? [[win.from, before[1]], ...pts] : pts;
    }

    /** The chart's current value, or null. */
    function currentOf(i) {
      const s = state.entries[i];
      return s && !('missing' in s) && typeof s.value === 'number' && isFinite(s.value) ? s.value : null;
    }

    /** The chart's points in its window, with the current value carried on to now (not yesterday). */
    function pointsOf(i, win) {
      const pts = loggedPoints(i, win);
      const last = pts.length ? pts[pts.length - 1][0] : -Infinity;
      const v = win.live ? currentOf(i) : null;
      return v != null && last < win.end ? pts.concat([[win.end, v]]) : pts;
    }

    function titleOf(i) {
      const s = state.entries[i];
      if (charts[i].title) return charts[i].title;
      if (!s || 'missing' in s) return t('unavailable');
      return [s.name, s.capability.title].filter(Boolean).join(' · ');
    }

    /** The value axis labels (the chart module's `axisLabel()`): `1,25k` on a 250 step. */
    const axisLabel = (v, step) => C.axisLabel(nf, v, step);

    // ------------------------------------------------------------------ render

    /** The plots, shown (`on`) or hidden; the frame draws the message, the header and the passing message around them. */
    function draw(on) {
      if (overlay) {
        show(ui[0].box, on);
        show(ui[1].box, false);
        if (on) renderOverlay();
      } else {
        ui.forEach((u, i) => {
          show(u.box, on && i < state.entries.length);
          if (on && i < state.entries.length) renderChart(i);
        });
      }
    }

    /**
     * A tapped point's or bar's time, by how long the span is: `14:00` (a bar `14:00–15:00`) up to a day, `Mon 14:00` up to
     * 8 days, then `15 Sep 14:00` up to two months and `15 Sep` beyond; a bar of a day or a week `Tue 15 Sep`, of a month
     * `September 2025`.
     */
    function itemLabel(win, item) {
      const span = win.to - win.from;
      if (item.end != null && item.end - item.t > 27 * DAY) return date(item.t, { month: 'long', year: 'numeric' });
      if (item.end != null && item.end - item.t > 23 * HOUR) return date(item.t, { weekday: 'short', day: 'numeric', month: 'short' });
      if (span > 62 * DAY) return date(item.t, { day: 'numeric', month: 'short' });
      if (span > 8 * DAY + HOUR) return `${date(item.t, { day: 'numeric', month: 'short' })} ${hhmm(item.t)}`;
      const at = ms => (span > DAY + HOUR ? `${weekday(ms)} ${hhmm(ms)}` : hhmm(ms));
      return item.end != null ? `${at(item.t)}–${hhmm(item.end)}` : at(item.t);
    }

    /** A finished window's header line: `Yesterday · avg` …, or for several periods their dates (`1 Jul – 30 Sep · avg`). */
    function avgText(i, win) {
      const p = parseSpan(charts[i].span);
      if (p && p.whole && p.count === 1 && AVG_KEYS[p.unit]) return t(AVG_KEYS[p.unit]);
      const o = win.to - win.from > 366 * DAY ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' };
      return t('rangeAvg', { range: `${date(win.from, o)} – ${date(win.to - 1, o)}` });
    }

    /**
     * The value and time a chart shows: the tapped point or bar, else the current value (a last day, week …: its
     * average). `averaged` when Homey didn't report it as it is (a point, a bar, an average), so it's rounded.
     */
    function shown(i) {
      const s = state.entries[i];
      const g = geom[i];
      const win = windowOf(i, now());
      if (g && g.sel != null && g.items[g.sel]) {
        const item = g.items[g.sel];
        return { value: item.v, sub: itemLabel(win, item), averaged: true };
      }
      if (s && !('missing' in s) && !win.live) {
        // The drawn points are evenly spaced and carry the last value over gaps, so their mean is the period's; bars
        // count by their length (months differ).
        let sum = 0, weight = 0;
        for (const item of g ? g.items : []) {
          if (typeof item.v !== 'number' || !isFinite(item.v)) continue;
          const w = item.end != null ? item.end - item.t : 1;
          sum += item.v * w;
          weight += w;
        }
        return { value: weight ? sum / weight : null, sub: avgText(i, win), averaged: true };
      }
      return { value: s && !('missing' in s) ? s.value : null, sub: s && 'missing' in s ? t('unavailable') : t('now'), averaged: false };
    }

    function renderHeader(column) {
      state.entries.forEach((s, i) => {
        const { value, sub, averaged } = shown(i);
        const ok = s && !('missing' in s) && typeof value === 'number' && isFinite(value);
        const units = ok && s.capability.units ? s.capability.units : '';
        const below = ok && charts[i].negative && scaled(s.capability, value) < 0;
        column({
          value: ok ? formatNumber(s.capability, value, averaged) : null, units, sub,
          valueCls: below ? ' export' : '', attrs: { 'data-color': charts[i].color },
        });
      });
    }

    function renderChart(i) {
      const c = charts[i];
      const u = ui[i];
      const s = state.entries[i];
      const w = frame.width;
      const pw = Math.max(40, w - L - 4);
      const plotH = PLOT_H[state.entries.length > 1 ? 2 : 1];
      const top = plotTop, base = top + plotH;
      const H = base + X_LABEL_GAP + X_LABEL_H;
      const win = windowOf(i, now());
      const missing = !s || 'missing' in s;

      clear(u.chips);
      chip(u.chips, i);

      const data = seriesData(i, win);
      show(u.svg, !missing && data.drawable);
      // A missing device's chip already says Unavailable, unless the chart has a title of its own.
      show(u.note, missing ? !!c.title : !data.drawable);
      u.note.textContent = missing ? t('unavailable') : t('noHistory');
      geom[i] = null;
      if (missing || !data.drawable) { u.box.classList.add('empty'); return; }
      u.box.classList.remove('empty');

      const svg = u.svg;
      kit.prepareSvg(svg, w, H);
      const x = ms => L + pw * (ms - win.from) / (win.to - win.from);
      const scale = kit.valueScale(svg, { max: data.max, min: data.min, h: plotH, top, pw, format: axisLabel, fit: c.fit });
      kit.timeLabels(svg, win, { pw, top, base, nf, date, now: t('now') });
      kit.axis(svg, top, base, pw);

      const drawn = drawSeries(i, svg, { data, x, scale, top, base });
      geom[i] = drawn.geom;
      if (drawn.cursorX != null) el('svg:path', { class: 'cursor', d: `M${f1(drawn.cursorX)} ${top}V${base}` }, svg);
      if (drawn.dot) drawn.dot(svg);
    }

    /**
     * Two series on one chart (`overlay`): one plot, chart 1's scale on the left and chart 2's on the right, or
     * with `sharedScale` one scale on the left over both, as wide as one chart's.
     */
    function renderOverlay() {
      const u = ui[0];
      const w = frame.width;
      const pw = Math.max(40, w - L - (sharedScale ? 4 : R));
      const plotH = PLOT_H[1];
      const top = plotTop, base = top + plotH;
      const H = base + X_LABEL_GAP + X_LABEL_H;
      // The axis is chart 1's window. Series 2's is the same, or the other day, laid over it by time of day (each day
      // spread over the width, so a 23 or 25 h DST day is up to an hour off by its end).
      const wins = [0, 1].map(i => windowOf(i, now()));
      const win = wins[0];

      clear(u.chips);
      chip(u.chips, 0);
      chip(u.chips, 1);

      const missing = [0, 1].map(i => !state.entries[i] || 'missing' in state.entries[i]);
      const data = [0, 1].map(i => seriesData(i, wins[i]));
      const any = data[0].drawable || data[1].drawable;
      show(u.svg, any);
      // Missing devices' chips already say Unavailable, unless a chart has a title of its own.
      show(u.note, !any && missing.some((m, i) => !m || !!charts[i].title));
      u.note.textContent = missing.every(Boolean) ? t('unavailable') : t('noHistory');
      geom[0] = geom[1] = null;
      u.box.classList.toggle('empty', !any);
      if (!any) return;

      const svg = u.svg;
      kit.prepareSvg(svg, w, H);
      const xs = wins.map(wi => ms => L + pw * (ms - wi.from) / (wi.to - wi.from));
      let scales;
      if (sharedScale) {
        // One scale over what both draw (a series with nothing to draw leaves it to the other).
        const drawable = data.filter(d => d.drawable);
        const scale = kit.valueScale(svg, { max: Math.max(...drawable.map(d => d.max)), min: Math.min(...drawable.map(d => d.min)),
          h: plotH, top, pw, format: axisLabel, fit: charts[0].fit });
        scales = { a: scale, b: scale };
      } else {
        // A side with nothing to draw still gets a scale, so the other series keeps its place.
        const side = d => (d.drawable ? { max: d.max, min: d.min, format: axisLabel } : { max: 1, min: 0, format: () => '' });
        scales = kit.dualScale(svg, { a: side(data[0]), b: side(data[1]), h: plotH, top, pw, fit: charts[0].fit });
      }
      kit.timeLabels(svg, win, { pw, top, base, nf, date, now: t('now') });
      kit.axis(svg, top, base, pw);

      const bothBars = !!(data[0].bars && data[1].bars && data[0].drawable && data[1].drawable);
      const drawn = data.map((d, i) => {
        if (!d.drawable) return null;
        const g = el('svg:g', { 'data-color': charts[i].color }, svg);
        const r = drawSeries(i, g, { data: d, x: xs[i], scale: scales[i ? 'b' : 'a'], top, base, half: bothBars ? i : null });
        geom[i] = r.geom;
        return r;
      });
      const cursor = drawn.find(r => r && r.cursorX != null);
      if (cursor) el('svg:path', { class: 'cursor', d: `M${f1(cursor.cursorX)} ${top}V${base}` }, svg);
      // The dots go last, so neither series' trace covers the other's dot.
      drawn.forEach((r, i) => { if (r && r.dot) r.dot(el('svg:g', { 'data-color': charts[i].color }, svg)); });
    }

    /** A chart's title chip, in its colour. */
    function chip(parent, i) {
      const s = state.entries[i];
      const cap = !s || 'missing' in s ? null : s.capability;
      kit.chip(parent, 'series', titleOf(i), cap && cap.units ? cap.units : null);
      parent.lastChild.setAttribute('data-color', charts[i].color);
    }

    /** A series' points (or bars) in the window, the display scaling and the range of what's drawn. */
    function seriesData(i, win) {
      const s = state.entries[i];
      if (!s || 'missing' in s) return { drawable: false };
      const { from } = win;
      const bars = charts[i].style === 'bars'
        ? chartBuckets(loggedPoints(i, win), from, win.end, C.barUnit(from, win.to, win.unit), win.live ? currentOf(i) : null) : null;
      const pts = bars ? null : pointsOf(i, win);
      const drawable = bars ? bars.some(b => b.v != null) : pts.length >= 2;
      if (!drawable) return { drawable };
      const disp = v => scaled(s.capability, v);
      const values = bars ? bars.filter(b => b.v != null).map(b => disp(b.v)) : pts.map(p => disp(p[1]));
      return { drawable, pts, bars, disp, from, max: Math.max(...values), min: Math.min(...values) };
    }

    /**
     * Series i's tapped item (an index into its bars or points) for this render, from the time kept in
     * `state.sel`: the bar holding it, or the point nearest it. A time that has left the window drops the selection.
     */
    function selectedIndex(i, data) {
      const at = state.sel[i];
      if (at == null) return null;
      let k = null;
      if (at >= data.from) {
        if (data.bars) {
          k = data.bars.findIndex(b => b.v != null && b.t < at && at <= b.end);
          if (k < 0) k = null;
        } else {
          k = 0;
          for (let j = 1; j < data.pts.length; j++) if (Math.abs(data.pts[j][0] - at) < Math.abs(data.pts[k][0] - at)) k = j;
        }
      }
      if (k == null) state.sel[i] = null;
      return k;
    }

    /**
     * Draws series i into `parent` on `scale`. `half` (0 or 1) puts its bars in that half of each bar slot, for
     * two series of bars on one chart. Returns the pointer geometry, the cursor's x (a tapped line point) and
     * `dot(parent)`, which draws the line's dot where the caller wants it.
     */
    function drawSeries(i, parent, { data, x, scale, top, base, half = null }) {
      const c = charts[i];
      const { pts, bars, disp } = data;
      const sel = selectedIndex(i, data);
      const y = v => Math.min(base + 2, Math.max(top - 2, scale.y(v)));
      if (bars) {
        const list = bars.map((b) => {
          const bx = x(b.t), bw = x(b.end) - bx;
          const gap = bw > 6 ? 2 : bw > 3 ? 1 : 0;
          let lx = bx + gap / 2, lw = Math.max(1, bw - gap);
          if (half != null) {
            const inner = lw > 4 ? 1 : 0;
            lw = Math.max(1, (lw - inner) / 2);
            lx += half * (lw + inner);
          }
          return { x: lx, w: lw, v: b.v == null ? null : disp(b.v) };
        });
        kit.bars(parent, { list, y, baseY: scale.baseY, zeroY: scale.zeroY, base, cls: 'series-bars', split: c.negative, selected: sel });
        return { geom: { kind: 'bars', sel, items: bars.map((b, k) => ({ t: b.t, end: b.end, v: b.v, x0: list[k].x, x1: list[k].x + list[k].w })) } };
      }

      const xs = pts.map(p => x(p[0]));
      const vs = pts.map(p => disp(p[1]));
      // With `smooth`, the line (and the dot) follow the smoothed values; the header keeps the real ones.
      const ws = c.smooth ? smoothValues(vs) : vs;
      const xy = ws.map((v, k) => [xs[k], y(v)]);
      const line = C.linePath(xy, c.smooth);
      const area = c.style === 'area'
        ? `${line}L${f1(xs[xs.length - 1])} ${f1(scale.baseY)}L${f1(xs[0])} ${f1(scale.baseY)}Z` : null;
      kit.trace(parent, { line, area, kind: 'series', lineClass: 'series-line', stops: [0.45, 0], zeroY: scale.zeroY, top, base, split: c.negative });
      const idx = sel == null ? xy.length - 1 : Math.min(sel, xy.length - 1);
      return {
        geom: { kind: 'line', xs, sel, items: pts.map(p => ({ t: p[0], v: p[1] })) },
        cursorX: sel != null ? xs[idx] : null,
        dot: g => kit.dot(g, xy[idx][0], xy[idx][1], c.negative && ws[idx] < 0 ? 'series export' : 'series'),
      };
    }

    // ------------------------------------------------------------------ interaction

    /** The point nearest the pointer (a line) or the bar under it, or null. */
    function pick(g, px) {
      if (!g) return null;
      let k = null;
      if (g.kind === 'line') {
        if (px >= L && px <= g.xs[g.xs.length - 1] + 1) {
          k = 0;
          for (let j = 1; j < g.xs.length; j++) if (Math.abs(g.xs[j] - px) < Math.abs(g.xs[k] - px)) k = j;
        }
      } else {
        g.items.forEach((b, j) => { if (b.v != null && px >= b.x0 - 1 && px <= b.x1 + 1) k = j; });
      }
      return k;
    }

    // On one chart, a tap selects both series at that x (two bars in a slot: either half picks the slot).
    const scrubbed = overlay ? [0, 1] : null;
    function scrub(i, px) {
      let changed = false;
      for (const j of scrubbed || [i]) {
        const g = geom[j];
        let k = pick(g, px);
        if (k == null && overlay && g && g.kind === 'bars') {
          const other = geom[1 - j];
          const o = other && other.kind === 'bars' ? pick(other, px) : null;
          if (o != null && g.items[o] && g.items[o].v != null) k = o;
        }
        // Kept as a time (a bar's end lies inside it, also as the window moves on), not as an index.
        const at = k == null ? null : g.kind === 'bars' ? g.items[k].end : g.items[k].t;
        if (at !== state.sel[j]) { state.sel[j] = at; changed = true; }
      }
      if (changed) frame.render();
    }
    ui.forEach((u, i) => {
      frame.scrub(u.svg, px => scrub(i, px), () => {
        const js = scrubbed || [i];
        if (js.some(j => state.sel[j] != null)) { js.forEach((j) => { state.sel[j] = null; }); frame.render(); }
      });
    });

    // ------------------------------------------------------------------ public API

    return frame.api({
      /** One entry per chart, in order. Live points newer than a refreshed history are kept (it's cached up to 5 min). */
      setState(list, lang) {
        if (lang) frame.language = lang;
        const previous = state.entries;
        state.entries = (Array.isArray(list) ? list : []).slice(0, charts.length).map((s, i) => {
          if (!s || 'missing' in s) return s || { missing: true };
          const points = Array.isArray(s.points) ? s.points.slice() : [];
          const old = previous[i] && !('missing' in previous[i]) && previous[i].deviceId === s.deviceId
            && previous[i].capabilityId === s.capabilityId ? previous[i].points : [];
          const after = points.length ? points[points.length - 1][0] : -Infinity;
          return { ...s, points: points.concat(old.filter(p => p[0] > after)) };
        });
        frame.resetMessage();
        frame.render();
      },
      /** A realtime value (Device Values' `values:state`): appended to every chart that shows it. */
      pushChange({ deviceId, capabilityId, value }) {
        let changed = false;
        const at = now();
        state.entries.forEach((s, i) => {
          if (!s || 'missing' in s || s.deviceId !== deviceId || s.capabilityId !== capabilityId) return;
          s.value = value;
          const win = windowOf(i, at);
          // Not on a month or a year (`sixHourSpan()`): the current value still carries the line on to now.
          if (typeof value === 'number' && isFinite(value) && win.live && !sixHourSpan(charts[i].span)) {
            s.points.push([at, value]);
            while (s.points.length && s.points[0][0] < win.from) s.points.shift();
          }
          changed = true;
        });
        if (changed) frame.renderIfSeen();
      },
      /**
       * Each chart's window now, as `/state` asks for it (lib/chartState.ts): `<span>~<from>~<end>~<unit>`, its data's
       * window on the phone's clock (on one chart, series 2's may be chart 1's span).
       */
      windows: () => charts.map((c, i) => {
        const w = windowOf(i, now());
        return `${c.span}~${Math.floor(w.from)}~${Math.ceil(w.end)}~${w.unit || ''}`;
      }),
    });
  }

  window.createChartsWidget = createChartsWidget;
  window.chartBuckets = chartBuckets;
})();
