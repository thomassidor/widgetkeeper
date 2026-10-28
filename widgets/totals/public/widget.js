/*
 * Chart · Totals per Period: how much a value that counts up (a meter's kWh, a rain gauge's mm, hours of TV) went up
 * per hour, day or month over a day, week, month or year, like the Homey app's Energy tab, and optionally the period
 * before beside it. Drawn by the shared chart module (../electricity/chart.js, `window.WidgetkeeperChart`, loaded
 * first). Plain browser JS (served as-is).
 */
(function () {
  const { TIGHT_UNITS, applyColors, timeSpan, spanUnit, messageLine } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const C = window.WidgetkeeperChart;
  const { HOUR, L, X_LABEL_GAP, X_LABEL_H, el, clear, show } = C;

  const CHIP_H = 38; // chip row → top grid line, as Charts'
  const PLOT_H = 122; // Charts' one chart
  const PERIODS = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear'];
  /** Each period's bars by its unit (the chart module's `useBuckets()`): an hour, a day (midnight to midnight) or a calendar month. */
  const BARS = { day: HOUR, week: 24 * HOUR, month: 24 * HOUR, year: 'month' };
  /** The period before each, by the name its chip and header column show. */
  const BEFORE = { today: 'yesterday', yesterday: 'dayBefore', thisWeek: 'lastWeek', lastWeek: 'weekBefore', thisMonth: 'lastMonth', lastMonth: 'monthBefore', thisYear: 'lastYear', lastYear: 'yearBefore' };

  const DEFAULT_STRINGS = {
    selectValue: 'Pick a value that counts up in the widget settings.',
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
    const t = (key) => {
      const s = opts.t ? opts.t(`totals.${key}`) : null;
      return s && s !== `totals.${key}` ? s : DEFAULT_STRINGS[key] || key;
    };
    const now = opts.now || (() => Date.now());
    const locale = opts.locale || navigator.language || 'en';
    let language = opts.language || 'en';
    const period = PERIODS.includes(opts.period) ? opts.period : 'thisWeek';
    const compare = opts.compare === true;
    const title = typeof opts.title === 'string' ? opts.title.trim() : '';
    const showHeader = opts.showHeader !== false;

    const nfCache = {};
    const nf = (v, d) => {
      nfCache[d] = nfCache[d] || new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
      return nfCache[d].format(v);
    };
    const pad2 = n => String(n).padStart(2, '0');
    const hhmm = ms => { const d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
    /** A date in Homey's language (`{weekday: 'short', day: 'numeric'}` → `tir. 14`). */
    const dateText = (ms, o) => {
      try { return new Intl.DateTimeFormat(language || 'en', o).format(new Date(ms)); } catch (e) { return new Date(ms).toLocaleDateString(undefined, o); }
    };

    const state = {
      current: null, // Sparklines' slot state with the value's running total ({deviceId, capabilityId, name, capability, value, points, meter} | {missing})
      previous: null, // the same over the period before (with `compare`)
      width: root.clientWidth || 368,
      lastHeight: 0,
      sel: null, // the tapped slot's start: a time, so it's dropped once the period moves on
    };
    let drawn = null; // the latest render's slots and their x, for the header and the pointer

    const kit = C.createKit();
    applyColors(root, { style: opts.colorStyle, color: opts.color, fallback: 'blue' });
    const wrap = el('div', { class: 'ew tt' }, root);
    const message = el('div', { class: 'ew-message', dir: 'auto' }, wrap);
    const header = el('div', { class: 'ew-header' }, wrap);
    const box = el('div', { class: 'ew-chart tt-chart' }, wrap);
    const chips = el('div', { class: 'ew-chips' }, box);
    const svg = el('svg:svg', null, box);
    const note = el('div', { class: 'ew-message tt-note', dir: 'auto' }, box);
    const transientEl = el('div', { class: 'ew-message tt-transient', dir: 'auto' }, wrap);
    // A lasting message (no value picked, a failed first load) drops the chart and shows in its place; a passing one (a failed
    // refresh) shows under it.
    const line = messageLine(render, { clear: () => { state.current = state.previous = null; } });

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
      const unit = BARS[win.unit];
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

    /** A bar's time: an hour's `13:00–14:00`, a day's `tir. 14`, a month's name. */
    function whenText(bar) {
      const unit = spanUnit(period);
      if (unit === 'year') return dateText(bar.t, { month: 'long' });
      if (unit === 'day') return `${hhmm(bar.t)}–${hhmm(bar.end)}`;
      return dateText(bar.t, { weekday: 'short', day: 'numeric' });
    }

    // ------------------------------------------------------------------ render

    function render() {
      const has = state.current != null;
      const lasting = line.text != null && !has;
      show(message, lasting);
      message.textContent = lasting ? line.text : '';
      show(box, has);
      drawn = null;
      if (has) renderChart();
      show(header, has && showHeader);
      if (has && showHeader) renderHeader();
      show(transientEl, has && line.text != null);
      transientEl.textContent = has && line.text != null ? line.text : '';
      reportHeight();
    }

    function reportHeight() {
      if (!opts.onHeight) return;
      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h && h !== state.lastHeight) { state.lastHeight = h; opts.onHeight(h); }
    }

    /** The tapped slot's index in `slots`, from the time kept in `state.sel` (dropped once it's left the period). */
    function selectedIndex(slots) {
      if (state.sel == null) return null;
      const k = slots.findIndex(s => s.t === state.sel);
      if (k < 0) state.sel = null;
      return k < 0 ? null : k;
    }

    function renderHeader() {
      clear(header);
      header.classList.toggle('one', !compare);
      const s = state.current;
      const units = ok(s) && s.capability.units ? s.capability.units : '';
      const slots = drawn ? drawn.slots : [];
      const k = drawn ? drawn.sel : null;
      const sum = vs => (vs.some(v => v != null) ? vs.reduce((a, v) => a + (v || 0), 0) : null);
      const column = (value, sub, prev) => {
        const col = el('div', { class: `ew-hcol${prev ? ' prev' : ''}` }, header);
        const has = ok(s) && typeof value === 'number' && isFinite(value);
        const hv = el('div', { class: `ew-hval tt-value${TIGHT_UNITS.test(units) ? ' tight' : ''}` }, col);
        el('span', { class: 'v ew-num', text: has ? useText(value) : '–' }, hv);
        if (units && has) el('span', { class: 'u', text: units }, hv);
        el('div', { class: 'ew-hsub', dir: 'auto', text: sub }, col);
      };
      if (!ok(s)) column(null, t('unavailable'), false);
      else if (k != null) column(slots[k].v, whenText(slots[k]), false);
      else column(sum(slots.map(x => x.v)), t(period), false);
      if (!compare) return;
      const p = k != null ? slots[k].prev : null;
      if (k != null) column(p ? p.v : null, p ? whenText(p) : t(BEFORE[period]), true);
      else column(sum(slots.map(x => (x.prev ? x.prev.v : null))), t(BEFORE[period]), true);
    }

    function renderChart() {
      const w = state.width;
      const pw = Math.max(40, w - L - 4);
      const top = CHIP_H, base = top + PLOT_H;
      const H = base + X_LABEL_GAP + X_LABEL_H;
      const s = state.current;
      const units = ok(s) && s.capability.units ? s.capability.units : null;

      clear(chips);
      kit.chip(chips, 'series', titleText(), units);
      if (compare) kit.chip(chips, 'series prev', t(BEFORE[period]), null);

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
     * Time labels: a day's hours 6:00, 12:00 and 18:00 with no lines, else the chart module's calendar labels (a week's
     * weekdays, a month's days 1·8·15·22·29, a year's months; narrow ones where short ones don't fit) and dashed lines.
     */
    function xLabels(win, x, pw, top, base) {
      const ly = base + X_LABEL_GAP;
      if (win.unit === 'day') {
        const h = new Date(win.from);
        for (h.setHours(h.getHours() + 1); h.getTime() < win.to; h.setHours(h.getHours() + 1)) {
          if (h.getHours() % 6 === 0) kit.text(svg, x(h.getTime()), ly, h.getHours() + ':00', 'middle', 'hanging');
        }
        return;
      }
      const narrow = win.unit === 'week' ? pw / 7 < 34 : win.unit === 'year' && pw / 12 < 30;
      const { labels, lines } = C.calendarLabels(win.unit, win.from, win.to, language, narrow);
      kit.midnightLines(svg, lines.map(x), top, base);
      let lastX = -Infinity;
      for (const q of labels) {
        const cx = x(q.at);
        if (cx - lastX >= 14) { kit.text(svg, cx, ly, q.label, 'middle', 'hanging'); lastX = cx; }
      }
    }

    // ------------------------------------------------------------------ interaction

    /** The slot under the pointer, kept as its start; a slot with no bar in it selects nothing. */
    function scrub(e) {
      if (!drawn) return;
      const px = C.pointerX(e, svg);
      const k = drawn.xs.findIndex(([x0, x1]) => px >= x0 && px < x1);
      const slot = k >= 0 ? drawn.slots[k] : null;
      const at = slot && (slot.v != null || (slot.prev && slot.prev.v != null)) ? slot.t : null;
      if (at !== state.sel) { state.sel = at; render(); }
    }
    C.attachScrub(svg, scrub, () => { if (state.sel != null) { state.sel = null; render(); } }, { timer: null });

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver((entries) => {
        const w = Math.round(entries[0].contentRect.width);
        if (w && w !== state.width) { state.width = w; render(); }
      }).observe(root);
    }

    // Redrawn every minute, so the live bar keeps up and the period rolls over at its end. Not while nobody sees it (a
    // hidden page, or a Smart Stack page that isn't on screen); drawn at once when it's back.
    let offScreen = false;
    const visible = () => state.current != null && !offScreen && !document.hidden;
    const timer = setInterval(() => { if (visible()) render(); }, 60e3);
    const onVisibility = () => { if (visible()) render(); };
    document.addEventListener('visibilitychange', onVisibility);

    // ------------------------------------------------------------------ public API

    return {
      /**
       * This period's state and, with `compare`, the period before's (`/state`'s `current` and `previous`). Live totals
       * newer than a refreshed history are kept (it's cached up to 5 min).
       */
      setState(list, lang) {
        if (lang) language = lang;
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
        line.reset({ lastingOnly: true });
        render();
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
        if (!document.hidden && !offScreen) render(); // else drawn when it's back
      },
      /** A message in place of the chart, or with `transient` under it for 8 s (a failed refresh). */
      setMessage(text, transient) { line.set(text, transient); },
      render,
      t,
      /** The Smart Stack: whether this page is the one on screen. */
      setVisible(on) { offScreen = !on; if (visible()) render(); },
      destroy() { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); },
    };
  }

  window.createTotalsWidget = createTotalsWidget;
})();
