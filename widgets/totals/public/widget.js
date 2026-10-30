/*
 * Chart · Totals: how much a value that counts up (a meter's kWh, a rain gauge's mm, hours of TV) went up
 * per hour, day or month over a day, week, month or year, like the Homey app's Energy tab, and optionally the period
 * before beside it. Drawn by the shared chart module (../electricity/chart.js, `window.WidgetkeeperChart`, loaded
 * first). Plain browser JS (served as-is).
 */
(function () {
  const { parseSpan, timeSpan, isTimeSpan } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const C = window.WidgetkeeperChart;
  const { L, X_LABEL_GAP, X_LABEL_H, clear, show } = C;

  const CHIP_H = 38; // chip row → top grid line, as Charts'
  const PLOT_H = 122; // Charts' one chart
  const DAY = 24 * C.HOUR;
  /** A single whole period's name, by how many periods back it is: this one, the last one, the one before (`windowName()`). */
  const NAMES = {
    day: ['today', 'yesterday', 'dayBefore'], week: ['thisWeek', 'lastWeek', 'weekBefore'],
    month: ['thisMonth', 'lastMonth', 'monthBefore'], year: ['thisYear', 'lastYear', 'yearBefore'],
  };

  const DEFAULT_STRINGS = {
    selectValue: 'Pick a value that counts up in the widget settings.',
    now: 'Now',
    error: 'Could not load the chart.',
    unavailable: 'Unavailable',
    noHistory: 'No history yet.',
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This week',
    lastWeek: 'Last week',
    thisMonth: 'This month',
    lastMonth: 'Last month',
    thisYear: 'This year',
    lastYear: 'Last year',
    dayBefore: 'Day before yesterday',
    weekBefore: 'Week before last',
    monthBefore: 'Month before last',
    yearBefore: 'Year before last',
  };

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, color?: string, t?: (key: string) => string, locale?: string, language?: string, now?: () => number,
   *   period?: string, compare?: boolean, title?: string, showHeader?: boolean, onHeight?: (h: number) => void }} opts
   */
  function createTotalsWidget(root, opts = {}) {
    // Any time span (the kit's `timeSpan()`: `1w!` is this week, `30d` the last 30 days); missing or unknown: this week.
    const period = isTimeSpan(opts.period) ? opts.period : '1w!';
    const compare = opts.compare === true;
    const title = typeof opts.title === 'string' ? opts.title.trim() : '';

    const state = {
      current: null, // Sparklines' slot state with the value's running total ({deviceId, capabilityId, name, capability, value, points, meter} | {missing})
      previous: null, // the same over the period before (with `compare`)
      sel: null, // the tapped slot's start: a time, so it's dropped once the period moves on
    };
    let drawn = null; // the latest render's slots and their x, for the header and the pointer

    // Redrawn every minute, so the live bar keeps up and the period rolls over at its end. A lasting message (no value
    // picked, a failed first load) drops the chart and shows in its place; a passing one (a failed refresh) under it.
    const frame = C.createFrame(root, {
      opts, cls: 'tt', prefix: 'totals', strings: DEFAULT_STRINGS, showHeader: opts.showHeader,
      colors: { style: opts.colorStyle, color: opts.color, fallback: 'blue' },
      redrawMs: 60e3,
      has: () => state.current != null,
      clear: () => { state.current = state.previous = null; },
      draw, header: renderHeader,
    });
    const { t, nf, hhmm, date: dateText, now, kit } = frame;
    const { box, chips, svg, note } = frame.boxes[0];

    // ------------------------------------------------------------------ derived data

    const ok = s => !!s && !('missing' in s);

    /** The value's running total now: its history's count carried on with the value now, or null. */
    function totalNow(s) {
      if (!ok(s) || typeof s.value !== 'number' || !isFinite(s.value)) return null;
      return C.meterTotal({ offset: 0, high: null, ...s.meter }, s.value);
    }

    /** A series' running-total points with numbers. */
    const pointsOf = s => (ok(s) ? (s.points || []).filter(p => typeof p[1] === 'number' && isFinite(p[1])) : []);

    /**
     * The period's bar slots at `at`, every one up to its end (the future ones empty), each with this period's use
     * (`v`) and, with `compare`, the bar of the period before in the same place (`prev`: the third day with the
     * third day, March with March).
     */
    function slotsAt(at) {
      const win = timeSpan(period, at);
      const unit = C.barUnit(win.from, win.to, win.unit);
      const live = win.end === at;
      const cur = C.useBuckets(pointsOf(state.current), win.from, win.end, unit, live ? totalNow(state.current) : null);
      let prev = [];
      if (compare) {
        const p = timeSpan(period, at, 1);
        prev = C.useBuckets(pointsOf(state.previous), p.from, p.to, unit);
      }
      const slots = C.buckets([], win.from, win.to, unit).map((s, k) => ({
        t: s.t, end: s.end, v: cur[k] ? cur[k].v : null, prev: prev[k] || null,
      }));
      return { win, slots };
    }

    function titleText() {
      const s = state.current;
      if (title) return title;
      if (!ok(s)) return t('unavailable');
      return [s.name, s.capability.title].filter(Boolean).join(' · ');
    }

    /** A use as the header shows it: up to two decimals under 10, one under 1000, none above (the capability's at most). */
    function useText(v) {
      const s = state.current;
      const most = ok(s) && s.capability.decimals != null ? Math.max(0, Math.min(s.capability.decimals, 4)) : 2;
      const a = Math.abs(v);
      return nf(v, Math.min(most, a < 10 ? 2 : a < 1000 ? 1 : 0));
    }

    /**
     * A bar's time, by its unit (not its length: the last of a rolling span ends now): an hour's `13:00–14:00` (a weekday
     * before it over several days), a day's or week's `tir. 14`, a month's name.
     */
    function whenText(bar) {
      const win = timeSpan(period, now());
      const unit = C.barUnit(win.from, win.to, win.unit);
      if (unit === 'month') return dateText(bar.t, { month: 'long' });
      if (unit === 'week' || unit >= 23 * C.HOUR) return dateText(bar.t, { weekday: 'short', day: 'numeric' });
      const day = win.to - win.from > DAY + C.HOUR ? `${dateText(bar.t, { weekday: 'short' })} ` : '';
      return `${day}${hhmm(bar.t)}–${hhmm(bar.end)}`;
    }

    /**
     * The name of the window `back` periods before this one: a single whole period's (Today, Last week, Month before last
     * …), else its dates (`1 Jul – 30 Sep`).
     */
    function windowName(back) {
      const p = parseSpan(period);
      const steps = (p.skip ? 1 : 0) + back;
      if (p.whole && p.count === 1 && steps < 3) return t(NAMES[p.unit][steps]);
      const w = timeSpan(period, now(), back);
      const o = w.to - w.from > 366 * DAY ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' };
      return `${dateText(w.from, o)} – ${dateText(w.to - 1, o)}`;
    }

    // ------------------------------------------------------------------ render

    /** The chart, shown (`on`) or hidden; the frame draws the message, the header and the passing message around it. */
    function draw(on) {
      show(box, on);
      drawn = null;
      if (on) renderChart();
    }

    /** The tapped slot's index in `slots`, from the time kept in `state.sel` (dropped once it's left the period). */
    function selectedIndex(slots) {
      if (state.sel == null) return null;
      const k = slots.findIndex(s => s.t === state.sel);
      if (k < 0) state.sel = null;
      return k < 0 ? null : k;
    }

    function renderHeader(col) {
      const s = state.current;
      const units = ok(s) && s.capability.units ? s.capability.units : '';
      const slots = drawn ? drawn.slots : [];
      const k = drawn ? drawn.sel : null;
      const sum = vs => (vs.some(v => v != null) ? vs.reduce((a, v) => a + (v || 0), 0) : null);
      const column = (value, sub, prev) => {
        const has = ok(s) && typeof value === 'number' && isFinite(value);
        col({ value: has ? useText(value) : null, units: has ? units : '', tightUnits: units, sub, colCls: prev ? ' prev' : '' });
      };
      if (!ok(s)) column(null, t('unavailable'), false);
      else if (k != null) column(slots[k].v, whenText(slots[k]), false);
      else column(sum(slots.map(x => x.v)), windowName(0), false);
      if (!compare) return;
      const p = k != null ? slots[k].prev : null;
      if (k != null) column(p ? p.v : null, p ? whenText(p) : windowName(1), true);
      else column(sum(slots.map(x => (x.prev ? x.prev.v : null))), windowName(1), true);
    }

    function renderChart() {
      const w = frame.width;
      const pw = Math.max(40, w - L - 4);
      const top = CHIP_H, base = top + PLOT_H;
      const H = base + X_LABEL_GAP + X_LABEL_H;
      const s = state.current;
      const units = ok(s) && s.capability.units ? s.capability.units : null;

      clear(chips);
      kit.chip(chips, 'series', titleText(), units);
      if (compare) kit.chip(chips, 'series prev', windowName(1), null);

      const { win, slots } = slotsAt(now());
      const values = [];
      slots.forEach((x) => {
        if (x.v != null) values.push(x.v);
        if (x.prev && x.prev.v != null) values.push(x.prev.v);
      });
      const drawable = ok(s) && values.length > 0;
      show(svg, drawable);
      // A missing device's chip already says Unavailable, unless the chart has a title of its own.
      show(note, ok(s) ? !drawable : !!title);
      note.textContent = ok(s) ? t('noHistory') : t('unavailable');
      box.classList.toggle('empty', !drawable);
      if (!drawable) return;

      kit.prepareSvg(svg, w, H);
      const x = ms => L + pw * (ms - win.from) / (win.to - win.from);
      const scale = kit.valueScale(svg, { max: Math.max(...values), min: 0, h: PLOT_H, top, pw, format: (v, step) => C.axisLabel(nf, v, step) });
      xLabels(win, x, pw, top, base);
      kit.axis(svg, top, base, pw);

      const sel = selectedIndex(slots);
      const y = v => Math.min(base + 2, Math.max(top - 2, scale.y(v)));
      // Each slot's bar: two thirds of a wide slot, else the slot less a pixel or two; with `compare`, the period before
      // in its left half and this period in its right.
      const place = (slot, half) => {
        const sx = x(slot.t), sw = x(slot.end) - sx;
        const gap = sw > 12 ? sw / 3 : sw > 6 ? 2 : sw > 3 ? 1 : 0;
        let lx = sx + gap / 2, lw = Math.max(1, sw - gap);
        if (half != null) {
          const inner = lw > 4 ? 1 : 0;
          lw = Math.max(1, (lw - inner) / 2);
          lx += half * (lw + inner);
        }
        return { x: lx, w: lw };
      };
      const draw = (cls, half, value) => kit.bars(svg, {
        list: slots.map(slot => ({ ...place(slot, half), v: value(slot) })),
        y, baseY: scale.baseY, zeroY: scale.zeroY, base, cls, selected: sel,
      });
      if (compare) draw('series-bars prev', 0, slot => (slot.prev ? slot.prev.v : null));
      draw('series-bars', compare ? 1 : null, slot => slot.v);
      drawn = { slots, sel, xs: slots.map(slot => [x(slot.t), x(slot.end)]) };
    }

    /**
     * Time labels: a single week, month or year the chart module's calendar labels (a week's weekdays, a month's days
     * 1·8·15·22·29, a year's months; narrow ones where short ones don't fit, as the Energy tab) and dashed lines; any
     * other span the chart kit's `timeLabels()` (a day's hours 6:00, 12:00 and 18:00, a rolling span's Now …).
     */
    function xLabels(win, x, pw, top, base) {
      const ly = base + X_LABEL_GAP;
      const p = parseSpan(period);
      if (!(p.whole && p.count === 1 && p.unit !== 'day')) {
        kit.timeLabels(svg, win, { pw, top, base, nf, date: dateText, now: t('now') });
        return;
      }
      const narrow = win.unit === 'week' ? pw / 7 < 34 : win.unit === 'year' && pw / 12 < 30;
      const { labels, lines } = C.calendarLabels(win.unit, win.from, win.to, frame.language, narrow);
      kit.midnightLines(svg, lines.map(x), top, base);
      let lastX = -Infinity;
      for (const q of labels) {
        const cx = x(q.at);
        if (cx - lastX >= 14) { kit.text(svg, cx, ly, q.label, 'middle', 'hanging'); lastX = cx; }
      }
    }

    // ------------------------------------------------------------------ interaction

    /** The slot under the pointer, kept as its start; a slot with no bar in it selects nothing. */
    function scrub(px) {
      if (!drawn) return;
      const k = drawn.xs.findIndex(([x0, x1]) => px >= x0 && px < x1);
      const slot = k >= 0 ? drawn.slots[k] : null;
      const at = slot && (slot.v != null || (slot.prev && slot.prev.v != null)) ? slot.t : null;
      if (at !== state.sel) { state.sel = at; frame.render(); }
    }
    frame.scrub(svg, scrub, () => { if (state.sel != null) { state.sel = null; frame.render(); } });

    // ------------------------------------------------------------------ public API

    return frame.api({
      /**
       * This period's state and, with `compare`, the period before's (`/state`'s `current` and `previous`). Live totals
       * newer than a refreshed history are kept (it's cached up to 5 min).
       */
      setState(list, lang) {
        if (lang) frame.language = lang;
        const [current, previous] = Array.isArray(list) ? list : [];
        const old = state.current;
        if (ok(current)) {
          const points = Array.isArray(current.points) ? current.points.slice() : [];
          const same = ok(old) && old.deviceId === current.deviceId && old.capabilityId === current.capabilityId;
          const after = points.length ? points[points.length - 1][0] : -Infinity;
          state.current = {
            ...current,
            points: points.concat(same ? old.points.filter(p => p[0] > after) : []),
            meter: { offset: 0, high: null, ...current.meter },
          };
        } else state.current = current || { missing: true };
        state.previous = previous || null;
        frame.resetMessage();
        frame.render();
      },
      /** A realtime value (Device Values' `values:state`): the running total now, carried on as the history's. */
      pushChange({ deviceId, capabilityId, value }) {
        const s = state.current;
        if (!ok(s) || s.deviceId !== deviceId || s.capabilityId !== capabilityId) return;
        s.value = value;
        const at = now();
        const win = timeSpan(period, at);
        if (typeof value === 'number' && isFinite(value)) {
          const total = C.meterTotal(s.meter, value);
          if (win.end === at) s.points.push([at, total]);
        }
        frame.renderIfSeen();
      },
      /**
       * The period's window now and with compare the one before's, as `/state` asks for them (lib/chartState.ts):
       * `<period>~<from>~<end>~<unit>~use`, on the phone's clock.
       */
      windows: () => [0, ...(compare ? [1] : [])].map((back) => {
        const w = timeSpan(period, now(), back);
        return `${period}~${Math.floor(w.from)}~${Math.ceil(w.end)}~${w.unit || ''}~use`;
      }),
    });
  }

  window.createTotalsWidget = createTotalsWidget;
})();
