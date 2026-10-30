/*
 * Chart · Min/Max: a value's lowest to highest in each day (or each bar of the time span: an hour over a day, a
 * month over a year) as a floating bar, its average as a tick across it: how much did it swing? Drawn by the shared
 * chart module (../electricity/chart.js, `window.WidgetkeeperChart`, loaded first). Plain browser JS (served as-is).
 */
(function () {
  const { scaled, formatNumber, timeSpan, isTimeSpan } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const C = window.WidgetkeeperChart;
  const { HOUR, L, X_LABEL_GAP, X_LABEL_H, clear, show, f1 } = C;

  const CHIP_H = 38; // chip row → top grid line, as Charts'
  const PLOT_H = 122; // Charts' one chart

  const DEFAULT_STRINGS = {
    selectValue: 'Pick a device value in the widget settings.',
    error: 'Could not load the chart.',
    unavailable: 'Unavailable',
    noHistory: 'No history yet.',
    now: 'Now',
    high: 'High',
    low: 'Low',
  };

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, color?: string, t?: (key: string) => string, locale?: string, language?: string, now?: () => number,
   *   span?: string, average?: boolean, range?: string, title?: string, showHeader?: boolean, onHeight?: (h: number) => void }} opts
   */
  function createDailyRangeWidget(root, opts = {}) {
    // Any time span (the kit's `timeSpan()`); missing or unknown: the last 4 weeks, a bar a day.
    const span = isTimeSpan(opts.span) ? opts.span : '4w';
    const average = opts.average !== false;
    const fit = opts.range !== 'zero';
    const title = typeof opts.title === 'string' ? opts.title.trim() : '';

    const state = {
      entry: null, // Sparklines' slot state ({deviceId, capabilityId, name, capability, value, points} | {missing})
      sel: null, // the tapped bar's start: dropped once the span moves past it
    };
    let drawn = null; // the latest render's bars and their x, for the header and the pointer

    const frame = C.createFrame(root, {
      opts, cls: 'dr', prefix: 'dailyrange', strings: DEFAULT_STRINGS, showHeader: opts.showHeader,
      colors: { style: opts.colorStyle, color: opts.color, fallback: 'blue' },
      redrawMs: 60e3,
      has: () => state.entry != null,
      clear: () => { state.entry = null; },
      draw, header: renderHeader,
    });
    const { t, nf, hhmm, date, now, kit } = frame;
    const { box, chips, svg, note } = frame.boxes[0];

    // ------------------------------------------------------------------ derived data

    const ok = s => !!s && !('missing' in s);
    const pointsOf = s => (ok(s) ? (s.points || []).filter(p => typeof p[1] === 'number' && isFinite(p[1])) : []);

    /**
     * The span's bars at `at` (the chart module's `barUnit()`: a day over a week or month, an hour over a day …), every
     * one to the span's end (the future ones empty), each with its points' lowest, highest and average.
     */
    function barsAt(at) {
      const win = timeSpan(span, at);
      const unit = C.barUnit(win.from, win.to, win.unit);
      const pts = pointsOf(state.entry);
      const live = win.end === at && ok(state.entry) && typeof state.entry.value === 'number' ? state.entry.value : null;
      const [lo, hi, avg] = ['min', 'max', 'avg'].map(agg => C.buckets(pts, win.from, win.end, unit, live, agg));
      const bars = C.buckets([], win.from, win.to, unit).map((b, k) => ({
        t: b.t, end: b.end,
        min: lo[k] ? lo[k].v : null, max: hi[k] ? hi[k].v : null, avg: avg[k] ? avg[k].v : null,
      }));
      return { win, unit, bars };
    }

    function titleText() {
      if (title) return title;
      const s = state.entry;
      if (!ok(s)) return t('unavailable');
      return [s.name, s.capability.title].filter(Boolean).join(' · ');
    }

    /**
     * A bar's time, by its unit (not its length: the last of a rolling span ends now): a day's `tir. 14`, a week's start,
     * a month's name, an hour's `13:00–14:00`.
     */
    function whenText(bar) {
      const unit = drawn ? drawn.unit : null;
      if (unit === 'month') return date(bar.t, { month: 'long' });
      if (unit === 'week' || unit >= 23 * HOUR) return date(bar.t, { weekday: 'short', day: 'numeric' });
      return `${hhmm(bar.t)}–${hhmm(bar.end)}`;
    }

    // ------------------------------------------------------------------ render

    /** The chart, shown (`on`) or hidden; the frame draws the message, the header and the passing message around it. */
    function draw(on) {
      show(box, on);
      drawn = null;
      if (on) renderChart();
    }

    /** The tapped bar, else the latest with a value. */
    function shownBar() {
      if (!drawn) return null;
      const full = drawn.bars.filter(b => b.max != null);
      if (state.sel != null) {
        const tapped = full.find(b => b.t === state.sel);
        if (tapped) return tapped;
        state.sel = null;
      }
      return full.length ? full[full.length - 1] : null;
    }

    function renderHeader(column) {
      const s = state.entry;
      const bar = shownBar();
      if (!ok(s) || !bar) { column({ value: null, sub: ok(s) ? t('noHistory') : t('unavailable') }); return; }
      const units = s.capability.units || '';
      column({ value: formatNumber(s.capability, bar.max, true), units, sub: `${t('high')} · ${whenText(bar)}` });
      column({ value: formatNumber(s.capability, bar.min, true), units, sub: `${t('low')} · ${whenText(bar)}`, colCls: ' low' });
    }

    function renderChart() {
      const w = frame.width;
      const pw = Math.max(40, w - L - 4);
      const top = CHIP_H, base = top + PLOT_H;
      const H = base + X_LABEL_GAP + X_LABEL_H;
      const s = state.entry;

      clear(chips);
      kit.chip(chips, 'series', titleText(), ok(s) && s.capability.units ? s.capability.units : null);

      const { win, unit, bars } = barsAt(now());
      const full = bars.filter(b => b.max != null && b.min != null);
      const drawable = ok(s) && full.length > 0;
      show(svg, drawable);
      // A missing device's chip already says Unavailable, unless the chart has a title of its own.
      show(note, ok(s) ? !drawable : !!title);
      note.textContent = ok(s) ? t('noHistory') : t('unavailable');
      box.classList.toggle('empty', !drawable);
      if (!drawable) return;

      const disp = v => scaled(s.capability, v);
      kit.prepareSvg(svg, w, H);
      const x = ms => L + pw * (ms - win.from) / (win.to - win.from);
      const scale = kit.valueScale(svg, {
        max: Math.max(...full.map(b => disp(b.max))), min: Math.min(...full.map(b => disp(b.min))),
        h: PLOT_H, top, pw, format: (v, step) => C.axisLabel(nf, v, step), fit,
      });
      const y = v => Math.min(base + 2, Math.max(top - 2, scale.y(v)));
      kit.timeLabels(svg, win, { pw, top, base, nf, date, now: t('now') });
      kit.axis(svg, top, base, pw);

      const g = C.el('svg:g', { class: 'dr-bars' }, svg);
      const placed = bars.map((b) => {
        const sx = x(b.t), sw = x(b.end) - sx;
        const bw = Math.max(1, sw > 6 ? sw * 0.64 : sw - 1);
        return { ...b, x0: sx, x1: sx + sw, bx: sx + (sw - bw) / 2, bw };
      });
      for (const b of placed) {
        if (b.max == null || b.min == null) continue;
        const y0 = y(disp(b.max)), y1 = y(disp(b.min));
        const selected = state.sel != null && b.t === state.sel;
        C.el('svg:rect', {
          class: selected ? 'dr-bar selected' : 'dr-bar', x: f1(b.bx), y: f1(y0), width: f1(b.bw), height: f1(Math.max(2, y1 - y0)), rx: f1(Math.min(3, b.bw / 2)),
        }, g);
        if (average && b.avg != null && b.bw >= 3) {
          C.el('svg:path', { class: 'dr-avg', d: `M${f1(b.bx - 1)} ${f1(y(disp(b.avg)))}h${f1(b.bw + 2)}` }, g);
        }
      }
      drawn = { win, unit, bars: placed };
    }

    // ------------------------------------------------------------------ interaction

    /** The bar under the pointer, kept as its start; a bar without a value selects nothing. */
    frame.select(svg, state, (px) => {
      if (!drawn) return undefined;
      const bar = drawn.bars.find(b => px >= b.x0 && px < b.x1);
      return bar && bar.max != null ? bar.t : null;
    });

    // ------------------------------------------------------------------ public API

    return frame.api({
      /** The value's state over the span (`/state`'s `charts[0]`). Live points newer than a refreshed history are kept. */
      setState(list, lang) {
        if (lang) frame.language = lang;
        const [s] = Array.isArray(list) ? list : [];
        state.entry = C.keepLive(s, state.entry);
        frame.resetMessage();
        frame.render();
      },
      /** A realtime value (Device Values' `values:state`): into the bar under way (not onto Homey's 6-hour averages). */
      pushChange(change) { frame.pushLive([state.entry], change, at => timeSpan(span, at)); },
      /** The span's window now, as `/state` asks for it (lib/chartState.ts), with up to 400 points (`~fine`). */
      windows: () => {
        const w = timeSpan(span, now());
        return [`${span}~${Math.floor(w.from)}~${Math.ceil(w.end)}~${w.unit || ''}~fine`];
      },
    });
  }

  window.createDailyRangeWidget = createDailyRangeWidget;
})();
