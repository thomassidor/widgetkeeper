/*
 * Chart · Stacked: who uses the power? Several values stacked on one time axis (the heat pump, the EV charger, the oven),
 * and with a total the rest as Other. A value below zero (solar, a battery charging) stacks downwards from the zero
 * line, so the two stacks never cancel out. Drawn by the shared chart module (../electricity/chart.js,
 * `window.WidgetkeeperChart`, loaded first). Plain browser JS (served as-is).
 */
(function () {
  const { COLORS, scaled, formatNumber, timeSpan, isTimeSpan, sixHourSpan } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const C = window.WidgetkeeperChart;
  const { L, X_LABEL_GAP, X_LABEL_H, MIN, HOUR, clear, show, f1 } = C;

  const TOP_PAD = 10; // the top grid line: room for the top scale label (the legend is in the page's flow, above or below)
  const PLOT_H = 122; // Charts' one-chart plot
  const MAX = 6;
  const DAY = 24 * HOUR;
  /** An area's steps (`areaUnit()`): the shortest giving at most `MAX_STEPS` over the span. */
  const AREA_STEPS = [MIN, 5 * MIN, 15 * MIN, 30 * MIN, HOUR, 3 * HOUR, 6 * HOUR, DAY, 'week'];
  const MAX_STEPS = 150;
  /** Units a layer may be scaled between (to the first layer's): power and energy. */
  const UNIT_SCALE = { W: ['W', 1], kW: ['W', 1e3], MW: ['W', 1e6], Wh: ['Wh', 1], kWh: ['Wh', 1e3], MWh: ['Wh', 1e6] };

  const DEFAULT_STRINGS = {
    selectValues: 'Pick the values to stack in the widget settings.',
    error: 'Could not load the chart.',
    unavailable: 'Unavailable',
    noHistory: 'No history yet.',
    otherUnits: 'Other units',
    now: 'Now',
    total: 'Total',
    other: 'Other',
    largest: 'Largest',
  };

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, colors?: string[], t?: (key: string) => string, locale?: string, language?: string,
   *   now?: () => number, total?: boolean, count?: number, span?: string, style?: string, legend?: string, title?: string,
   *   showHeader?: boolean, onHeight?: (h: number) => void }} opts
   */
  function createStackedWidget(root, opts = {}) {
    // Any time span (the kit's `timeSpan()`); missing or unknown: 24 hours.
    const span = isTimeSpan(opts.span) ? opts.span : '24h';
    const bars = opts.style === 'bars';
    const legendBelow = opts.legend === 'below';
    const title = typeof opts.title === 'string' ? opts.title.trim() : '';
    const hasTotal = opts.total === true;
    const count = Math.max(1, Math.min(MAX, Number(opts.count) || 1)); // layers
    // Each layer's colour (its setting), else the kit's colours in order.
    const colorOf = i => (opts.colors && COLORS.includes(opts.colors[i]) ? opts.colors[i] : COLORS[i % COLORS.length]);
    const plotTop = TOP_PAD;

    const state = {
      total: null, // the total's slot state (Sparklines'), or null without one
      layers: [], // per layer, as picked
      sel: null, // the tapped time, kept as a time so it stays put as the window moves
      selY: null, // and the pointer's height, for the layer under it
    };
    let drawn = null; // the latest render: rows, x, y, the layers' bands

    const frame = C.createFrame(root, {
      opts, cls: 'sk', prefix: 'stacked', strings: DEFAULT_STRINGS, legendBelow, showHeader: opts.showHeader,
      colors: { style: opts.colorStyle },
      redrawMs: 60e3,
      has: () => state.layers.length > 0,
      clear: () => { state.layers = []; state.total = null; },
      draw, header: renderHeader,
    });
    const { t, nf, now, kit } = frame;
    const { box, chips, svg, note } = frame.boxes[0];

    // ------------------------------------------------------------------ derived data

    const ok = s => !!s && !('missing' in s);
    const num = v => typeof v === 'number' && isFinite(v);

    /** The factor from a slot's units to `units` (the first layer's), or null when they can't be compared. */
    function factor(s, units) {
      const from = s.capability.units || '', to = units || '';
      if (from === to) return 1;
      const a = UNIT_SCALE[from], b = UNIT_SCALE[to];
      return a && b && a[0] === b[0] ? a[1] / b[1] : null;
    }

    /** The layers that can be drawn, each with its factor to the shared units; the first readable layer sets them. */
    function plan() {
      const first = state.layers.find(ok);
      const units = first ? first.capability.units || '' : '';
      const layers = state.layers.map((s, i) => {
        if (!ok(s)) return { i, s, missing: true, color: colorOf(i) };
        const f = factor(s, units);
        return { i, s, color: colorOf(i), f, other: f == null };
      });
      const total = ok(state.total) && factor(state.total, units) != null ? { s: state.total, f: factor(state.total, units) } : null;
      return { first, units, layers, drawable: layers.filter(l => !l.missing && !l.other), total };
    }

    /** An area's step over the window: about `MAX_STEPS`, never under Homey's 6 hours where its log is 6-hourly. */
    function areaUnit(win) {
      const length = s => (s === 'week' ? 7 * DAY : s);
      const least = sixHourSpan(span) ? 6 * HOUR : 0;
      return AREA_STEPS.find(s => length(s) >= least && (win.to - win.from) / length(s) <= MAX_STEPS) || 'week';
    }

    const pointsOf = (s, f) => (s.points || []).filter(p => num(p[1])).map(p => [p[0], scaled(s.capability, p[1]) * f]);
    const currentOf = (s, f) => (num(s.value) ? scaled(s.capability, s.value) * f : null);

    /**
     * The stack over the window: every layer (and the total) on one clock grid (`alignSeries()`), each row `{t, end,
     * values, other, total, pos, neg}`: the layers' values (null before a layer's first), Other (the total less the
     * layers, never below zero; null without a total) and the sums of the stack above and below zero.
     */
    function stackAt(at, p) {
      const win = timeSpan(span, at);
      const live = win.end === at;
      const unit = bars ? C.barUnit(win.from, win.to, win.unit) : areaUnit(win);
      const series = p.drawable.map(l => pointsOf(l.s, l.f));
      const currents = p.drawable.map(l => currentOf(l.s, l.f));
      if (p.total) { series.push(pointsOf(p.total.s, p.total.f)); currents.push(currentOf(p.total.s, p.total.f)); }
      const rows = C.alignSeries(series, win.from, win.end, unit, live ? currents : []).map((r) => {
        const values = r.values.slice(0, p.drawable.length);
        const total = p.total ? r.values[p.drawable.length] : null;
        const net = values.reduce((a, v) => a + (v || 0), 0);
        const other = total == null ? null : Math.max(0, total - net);
        const pos = (other || 0) + values.reduce((a, v) => a + Math.max(0, v || 0), 0);
        const neg = values.reduce((a, v) => a + Math.min(0, v || 0), 0);
        return { t: r.t, end: r.end, values, other, total, pos, neg };
      });
      return { win, unit, live, rows, known: rows.filter(r => r.values.some(num) || num(r.total)) };
    }

    /** A layer's share of the stack above zero over the rows (each weighed by its length), 0–1. */
    function shares(rows, n) {
      const sum = Array(n + 1).fill(0); // the layers, then Other
      let all = 0;
      for (const r of rows) {
        const len = r.end - r.t;
        r.values.forEach((v, k) => { if (v > 0) sum[k] += v * len; });
        if (r.other) sum[n] += r.other * len;
        all += r.pos * len;
      }
      return all > 0 ? sum.map(s => s / all) : sum.map(() => 0);
    }

    const valueText = (p, v) => (p.first ? formatNumber(p.first.capability, v, true) : nf(v));
    const pct = share => `${nf(Math.round(share * 100))} %`;

    // ------------------------------------------------------------------ render

    /** The chart, shown (`on`) or hidden; the frame draws the message, the header and the passing message around it. */
    function draw(on) {
      show(box, on);
      drawn = null;
      if (on) renderChart();
    }

    /** The tapped row, found again from its time on each render (`null` once it's left the window). */
    function selectedRow(rows) {
      if (state.sel == null) return null;
      return rows.find(r => state.sel >= r.t && state.sel < r.end) || null;
    }

    function renderHeader(column) {
      const p = plan();
      if (!p.drawable.length) { column({ value: null, sub: t('unavailable') }); return; }
      const d = drawn || { ...stackAt(now(), p), p };
      const units = p.units;
      const names = p.drawable.map(l => l.s.name);
      const row = selectedRow(d.rows);
      if (row) {
        const total = row.total != null ? row.total : row.values.reduce((a, v) => a + (v || 0), 0);
        column({ value: valueText(p, total), units, sub: `${t('total')} · ${timeText(row, d)}` });
        const layer = d.layerAt && d.layerAt(row, state.selY);
        if (layer) {
          const v = layer.k < p.drawable.length ? row.values[layer.k] : row.other;
          const name = layer.k < p.drawable.length ? names[layer.k] : t('other');
          const share = row.pos > 0 && v > 0 ? pct(v / row.pos) : null;
          column({ value: valueText(p, v), units, sub: share ? `${name} · ${share}` : name, colCls: ' low', attrs: layer.color ? { 'data-wk-color': layer.color } : {} });
        }
        return;
      }
      // The total now (or the layers' sum without one), and the largest part's share of the span.
      const { live } = d;
      const last = d.known[d.known.length - 1];
      const totalNow = p.total && live && num(p.total.s.value) ? currentOf(p.total.s, p.total.f)
        : last ? (last.total != null ? last.total : last.values.reduce((a, v) => a + (v || 0), 0)) : null;
      column({ value: totalNow == null ? null : valueText(p, totalNow), units: totalNow == null ? '' : units, sub: `${t('total')} · ${live ? t('now') : timeText(last, d)}` });
      const sh = shares(d.known, p.drawable.length);
      let best = 0;
      sh.forEach((s, k) => { if (s > sh[best]) best = k; });
      if (sh[best] > 0) {
        const name = best < p.drawable.length ? names[best] : t('other');
        column({ value: nf(Math.round(sh[best] * 100)), units: '%', sub: `${t('largest')} · ${name}`, colCls: ' low', attrs: best < p.drawable.length ? { 'data-wk-color': p.drawable[best].color } : {} });
      }
    }

    /** A row's time: `14:00` (or `14:00–15:00` for a bar), with the weekday over several days, a day's date for a day. */
    function timeText(row, d) {
      if (!row) return '';
      const long = d.win.to - d.win.from > DAY + HOUR;
      const len = row.end - row.t;
      if (len >= DAY - HOUR) return frame.date(row.t, { weekday: 'short', day: 'numeric', month: 'short' });
      const at = bars ? `${frame.hhmm(row.t)}–${frame.hhmm(row.end)}` : frame.hhmm((row.t + row.end) / 2);
      return long ? `${frame.date(row.t, { weekday: 'short' })} ${at}` : at;
    }

    function renderChart() {
      const w = frame.width;
      const p = plan();
      const at = now();

      clear(chips);
      if (title) kit.chip(chips, 'series', title, p.units || null);
      // Other first, as it's drawn at the bottom, then the layers in their order; a layer in other units says so.
      if (p.total) kit.chip(chips, 'series other', t('other'), null);
      for (const l of p.layers) {
        kit.chip(chips, `series${l.missing || l.other ? ' missing' : ''}`, l.missing ? t('unavailable') : l.s.name, l.other ? t('otherUnits') : null);
        chips.lastChild.setAttribute('data-wk-color', l.color);
      }

      const d = p.drawable.length ? stackAt(at, p) : null;
      const drawable = !!d && d.known.length > 0;
      show(svg, drawable);
      show(note, !drawable);
      note.textContent = p.drawable.length ? t('noHistory') : t('unavailable');
      box.classList.toggle('empty', !drawable);
      if (!drawable) return;

      // From the first row with a value: rows before it (a log that starts late) would draw as zero.
      const { win } = d;
      const rows = d.rows.slice(d.rows.indexOf(d.known[0]));
      const pw = Math.max(40, w - L - 4);
      const top = plotTop, base = top + PLOT_H;
      kit.prepareSvg(svg, w, base + X_LABEL_GAP + X_LABEL_H);
      const max = Math.max(...d.known.map(r => Math.max(r.pos, r.total || 0)), 0);
      const min = Math.min(...d.known.map(r => Math.min(r.neg, r.total || 0)), 0);
      const scale = kit.valueScale(svg, { max, min, h: PLOT_H, top, pw, format: (v, step) => C.axisLabel(nf, v, step) });
      kit.timeLabels(svg, win, { pw, top, base, nf, date: frame.date, now: t('now') });
      kit.axis(svg, top, base, pw);
      const x = ms => L + pw * (ms - win.from) / (win.to - win.from);
      const y = scale.y;

      // Each layer's band in each row: from the sum below it to the sum with it, Other at the bottom of the upper stack.
      const n = p.drawable.length;
      const order = p.total ? [n, ...p.drawable.map((_, k) => k)] : p.drawable.map((_, k) => k);
      const bands = rows.map((r) => {
        let up = 0, down = 0;
        const out = [];
        for (const k of order) {
          const v = k === n ? r.other : r.values[k];
          if (!num(v) || v === 0) { out[k] = null; continue; }
          if (v > 0) { out[k] = [up, up + v]; up += v; } else { out[k] = [down + v, down]; down += v; }
        }
        return out;
      });
      const cls = k => (k === n ? 'sk-layer other' : 'sk-layer');
      const colorAttr = k => (k === n ? {} : { 'data-wk-color': p.drawable[k].color });
      const selRow = selectedRow(rows);
      const selIndex = selRow ? rows.indexOf(selRow) : -1;
      if (bars) {
        rows.forEach((r, j) => {
          const x0 = x(r.t), x1 = x(r.end);
          const bw = Math.max(1, (x1 - x0) * 0.72), bx = x0 + (x1 - x0 - bw) / 2;
          for (const k of order) {
            const b = bands[j][k];
            if (!b) continue;
            const y0 = y(b[1]), y1 = y(b[0]);
            C.el('svg:rect', { class: `${cls(k)}${j === selIndex ? ' selected' : ''}`, ...colorAttr(k), x: f1(bx), y: f1(y0), width: f1(bw), height: f1(Math.max(0.5, y1 - y0)) }, svg);
          }
        });
      } else {
        // An area per layer and side, through each row's middle: its upper edge out, its lower edge back.
        const mid = r => x((r.t + r.end) / 2);
        const xs = rows.map((r, j) => (j === 0 ? x(r.t) : j === rows.length - 1 ? x(r.end) : mid(r)));
        for (const k of order) {
          for (const side of [1, -1]) {
            const has = bands.some(b => b[k] && Math.sign(b[k][0] + b[k][1]) === side);
            if (!has) continue;
            // The edges: where the layer has nothing on this side, both edges meet the sum below it.
            const edge = (j, which) => {
              const b = bands[j][k];
              if (b && Math.sign(b[0] + b[1]) === side) return b[which];
              let below = 0;
              for (const o of order) {
                if (o === k) break;
                const ob = bands[j][o];
                if (ob && Math.sign(ob[0] + ob[1]) === side) below = side > 0 ? ob[1] : ob[0];
              }
              return below;
            };
            const outer = side > 0 ? 1 : 0, inner = side > 0 ? 0 : 1;
            const upper = rows.map((_, j) => [xs[j], y(edge(j, outer))]);
            const lower = rows.map((_, j) => [xs[j], y(edge(j, inner))]).reverse();
            const g = C.el('svg:g', { class: cls(k), ...colorAttr(k) }, svg);
            C.el('svg:path', { class: 'sk-area', d: `${C.linePath(upper, false)}${lower.map(([px, py]) => `L${f1(px)} ${f1(py)}`).join('')}Z` }, g);
            C.el('svg:path', { class: 'sk-line', d: C.linePath(upper, false) }, g);
          }
        }
      }
      // The total, where picked: a line over the stack.
      if (p.total) {
        const pts = rows.map((r, j) => (num(r.total) ? [bars ? x((r.t + r.end) / 2) : (j === 0 ? x(r.t) : j === rows.length - 1 ? x(r.end) : x((r.t + r.end) / 2)), y(r.total)] : null)).filter(Boolean);
        if (pts.length > 1) C.el('svg:path', { class: 'sk-total', d: C.linePath(pts, false) }, svg);
      }
      if (win.end < win.to) C.el('svg:rect', { class: 'future', x: f1(x(win.end)), y: top - 6, width: f1(x(win.to) - x(win.end)), height: f1(base - top + 6) }, svg);
      if (selRow) {
        const cx = x((selRow.t + selRow.end) / 2);
        C.el('svg:path', { class: 'cursor', d: `M${f1(cx)} ${top}V${base}` }, svg);
      }

      /** The layer whose band holds the pointer's height in a row (`{k, color}`), else the one nearest it. */
      const layerAt = (row, py) => {
        const j = rows.indexOf(row);
        if (j < 0 || py == null) return null;
        let best = null, dist = Infinity;
        for (const k of order) {
          const b = bands[j][k];
          if (!b) continue;
          const y0 = y(b[1]), y1 = y(b[0]);
          const dd = py >= y0 && py <= y1 ? 0 : Math.min(Math.abs(py - y0), Math.abs(py - y1));
          if (dd < dist) { dist = dd; best = { k, color: k === n ? null : p.drawable[k].color }; }
        }
        return best;
      };
      drawn = { ...d, p, x, layerAt, top, base };
    }

    // ------------------------------------------------------------------ interaction

    /** The row under the pointer, kept as its time, and the pointer's height for the layer under it. */
    function scrub(px, py) {
      if (!drawn) return;
      const { win } = drawn;
      const ms = win.from + (px - L) / (drawn.x(win.to) - L) * (win.to - win.from);
      const row = drawn.known.find(r => ms >= r.t && ms < r.end) || (ms >= win.end ? drawn.known[drawn.known.length - 1] : null);
      const sel = row ? (row.t + row.end) / 2 : null;
      if (sel !== state.sel || py !== state.selY) { state.sel = sel; state.selY = py; frame.render(); }
    }
    frame.scrub(svg, scrub, () => { if (state.sel != null) { state.sel = null; state.selY = null; frame.render(); } });

    // ------------------------------------------------------------------ public API

    /** A slot's state with the live points newer than its refreshed history kept from `old`. */
    function keep(s, old) {
      if (!ok(s)) return s || { missing: true };
      const points = Array.isArray(s.points) ? s.points.slice() : [];
      const same = ok(old) && old.deviceId === s.deviceId && old.capabilityId === s.capabilityId;
      const after = points.length ? points[points.length - 1][0] : -Infinity;
      return { ...s, points: points.concat(same ? old.points.filter(q => q[0] > after) : []) };
    }

    return frame.api({
      /** The total (when picked) and each layer, in that order (`/state`'s `charts`). */
      setState(list, lang) {
        if (lang) frame.language = lang;
        const all = Array.isArray(list) ? list : [];
        state.total = hasTotal ? keep(all[0], state.total) : null;
        const previous = state.layers;
        state.layers = all.slice(hasTotal ? 1 : 0).slice(0, MAX).map((s, i) => keep(s, previous[i]));
        frame.resetMessage();
        frame.render();
      },
      /** A realtime value (Device Values' `values:state`): onto the total and every layer that shows it. */
      pushChange({ deviceId, capabilityId, value }) {
        const at = now();
        const win = timeSpan(span, at);
        let changed = false;
        for (const s of [state.total, ...state.layers]) {
          if (!ok(s) || s.deviceId !== deviceId || s.capabilityId !== capabilityId) continue;
          s.value = value;
          if (num(value) && win.end === at && !sixHourSpan(span)) s.points.push([at, value]);
          changed = true;
        }
        if (changed) frame.renderIfSeen();
      },
      /** The span's window now, once per request (the total, then each layer), as `/state` asks for it (lib/chartState.ts). */
      windows: () => {
        const w = timeSpan(span, now());
        return Array.from({ length: count + (hasTotal ? 1 : 0) }, () => `${span}~${Math.floor(w.from)}~${Math.ceil(w.end)}~${w.unit || ''}`);
      },
    });
  }

  window.createStackedWidget = createStackedWidget;
})();
