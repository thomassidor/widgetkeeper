/*
 * Chart · Typical Day: a value's line today over its usual day, each hour's average over the last 7 (or 3) days dashed
 * and their lowest to highest as a band: is today unusual? Drawn by the shared chart module (../electricity/chart.js,
 * `window.WidgetkeeperChart`, loaded first). Plain browser JS (served as-is).
 */
(function () {
  const { scaled, formatNumber, timeSpan } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const C = window.WidgetkeeperChart;
  const { HOUR, L, X_LABEL_GAP, X_LABEL_H, clear, show, f1, smoothValues } = C;

  const DAY = 24 * HOUR;
  const CHIP_H = 38; // chip row → top grid line, as Charts'
  const PLOT_H = 122; // Charts' one chart
  const USUAL = [7, 3]; // the days the usual day is from: Insights' hourly logs reach 7 days back (`last7Days`, `last3Days`)

  const DEFAULT_STRINGS = {
    selectValue: 'Pick a device value in the widget settings.',
    error: 'Could not load the chart.',
    unavailable: 'Unavailable',
    noHistory: 'No history yet.',
    now: 'Now',
    usual: 'Usual',
    usualAt: 'Usual at __time__',
  };

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, color?: string, t?: (key: string, tokens?: object) => string, locale?: string, language?: string,
   *   now?: () => number, usual?: string | number, band?: boolean, smooth?: boolean, range?: string, title?: string, showHeader?: boolean,
   *   onHeight?: (h: number) => void }} opts
   */
  function createTypicalDayWidget(root, opts = {}) {
    const days = USUAL.includes(Number(opts.usual)) ? Number(opts.usual) : 7;
    const band = opts.band !== false;
    const smooth = opts.smooth === true;
    const fit = opts.range !== 'zero';
    const title = typeof opts.title === 'string' ? opts.title.trim() : '';

    const state = {
      today: null, // Sparklines' slot state over today ({deviceId, capabilityId, name, capability, value, points} | {missing})
      past: null, // the same over the last `days` days
      sel: null, // the tapped hour (0–23): dropped at midnight
    };
    let drawn = null; // the latest render's window, hours and today's points, for the header and the pointer

    const frame = C.createFrame(root, {
      opts, cls: 'td', prefix: 'typicalday', strings: DEFAULT_STRINGS, showHeader: opts.showHeader,
      colors: { style: opts.colorStyle, color: opts.color, fallback: 'blue' },
      redrawMs: 60e3,
      has: () => state.today != null,
      clear: () => { state.today = state.past = null; },
      draw, header: renderHeader,
    });
    const { t, nf, now, kit } = frame;
    const { box, chips, svg, note } = frame.boxes[0];

    // ------------------------------------------------------------------ derived data

    const ok = s => !!s && !('missing' in s);
    const pointsOf = s => (ok(s) ? (s.points || []).filter(p => typeof p[1] === 'number' && isFinite(p[1])) : []);
    const current = s => (ok(s) && typeof s.value === 'number' && isFinite(s.value) ? s.value : null);

    /** Today's window (midnight to midnight), the usual day before it, and the hour `h`'s middle today. */
    function dayAt(at) {
      const win = timeSpan('1d!', at);
      // Only the days before today count as usual (the past series reaches into today).
      const hours = C.profile(pointsOf(state.past).filter(p => p[0] < win.from), win.from - days * DAY, win.from);
      const mid = h => { const d = new Date(win.from); d.setHours(h, 30, 0, 0); return d.getTime(); };
      const today = pointsOf(state.today).filter(p => p[0] >= win.from && p[0] <= win.end);
      const v = current(state.today);
      if (v != null && (!today.length || today[today.length - 1][0] < win.end)) today.push([win.end, v]);
      return { win, hours, mid, today };
    }

    function titleText() {
      if (title) return title;
      const s = state.today;
      if (!ok(s)) return t('unavailable');
      return [s.name, s.capability.title].filter(Boolean).join(' · ');
    }

    /** Today's value at hour `h` (its points' average then), or null. */
    function todayAt(h, d) {
      const hour = C.buckets(d.today, d.win.from, d.win.end, HOUR).find(b => new Date(b.t).getHours() === h);
      return hour ? hour.v : null;
    }

    // ------------------------------------------------------------------ render

    /** The chart, shown (`on`) or hidden; the frame draws the message, the header and the passing message around it. */
    function draw(on) {
      show(box, on);
      drawn = null;
      if (on) renderChart();
    }

    function renderHeader(column) {
      const s = state.today;
      if (!ok(s)) { column({ value: null, sub: t('unavailable') }); return; }
      const units = s.capability.units || '';
      const d = drawn || dayAt(now());
      const tapped = state.sel != null;
      const h = tapped ? state.sel : new Date(Math.min(now(), d.win.to - 1)).getHours();
      const value = tapped ? todayAt(h, d) : current(s);
      const at = `${String(h).padStart(2, '0')}:00`;
      const has = v => typeof v === 'number' && isFinite(v);
      column({ value: has(value) ? formatNumber(s.capability, value, tapped) : null, units: has(value) ? units : '', tightUnits: units, sub: tapped ? at : t('now') });
      const usual = d.hours[h].avg;
      column({ value: has(usual) ? formatNumber(s.capability, usual, true) : null, units: has(usual) ? units : '', tightUnits: units, sub: t('usualAt', { time: at }), colCls: ' usual' });
    }

    function renderChart() {
      const w = frame.width;
      const pw = Math.max(40, w - L - 4);
      const top = CHIP_H, base = top + PLOT_H;
      const H = base + X_LABEL_GAP + X_LABEL_H;
      const s = state.today;

      clear(chips);
      kit.chip(chips, 'series', titleText(), ok(s) && s.capability.units ? s.capability.units : null);
      kit.chip(chips, 'series usual', `${t('usual')} · ${days} d`, null);

      const d = dayAt(now());
      const known = d.hours.filter(h => h.n);
      const drawable = ok(s) && (known.length > 0 || d.today.length >= 2);
      show(svg, drawable);
      show(note, !drawable && (ok(s) || !!title));
      note.textContent = ok(s) ? t('noHistory') : t('unavailable');
      box.classList.toggle('empty', !drawable);
      if (!drawable) return;

      const disp = v => scaled(s.capability, v);
      const values = [...d.today.map(p => disp(p[1])), ...known.flatMap(h => (band ? [disp(h.min), disp(h.max)] : [disp(h.avg)]))];
      kit.prepareSvg(svg, w, H);
      const x = ms => L + pw * (ms - d.win.from) / (d.win.to - d.win.from);
      const scale = kit.valueScale(svg, { max: Math.max(...values), min: Math.min(...values), h: PLOT_H, top, pw, format: (v, step) => C.axisLabel(nf, v, step), fit });
      const y = v => Math.min(base + 2, Math.max(top - 2, scale.y(v)));
      kit.timeLabels(svg, d.win, { pw, top, base, nf, date: frame.date, now: t('now') });
      kit.axis(svg, top, base, pw);

      // The usual day: the band from each hour's lowest to its highest, the average dashed through it.
      if (known.length) {
        const at = h => x(d.mid(h.hour));
        if (band) {
          const upper = known.map(h => [at(h), y(disp(h.max))]);
          const lower = known.map(h => [at(h), y(disp(h.min))]).reverse();
          C.el('svg:path', { class: 'td-band', d: `M${[...upper, ...lower].map(([px, py]) => `${f1(px)} ${f1(py)}`).join('L')}Z` }, svg);
        }
        const avg = known.map(h => [at(h), y(disp(h.avg))]);
        if (avg.length > 1) C.el('svg:path', { class: 'td-usual', d: C.linePath(avg, true) }, svg);
      }

      // Today's line up to now, its dot at the end (or at the tapped hour).
      let dotAt = null;
      if (d.today.length >= 2) {
        const vs = d.today.map(p => disp(p[1]));
        const ws = smooth ? smoothValues(vs) : vs;
        const xy = ws.map((v, k) => [x(d.today[k][0]), y(v)]);
        kit.trace(svg, { line: C.linePath(xy, smooth), area: null, kind: 'series', lineClass: 'series-line', zeroY: scale.zeroY, top, base, split: false });
        dotAt = xy[xy.length - 1];
      }
      if (state.sel != null) {
        const cx = x(d.mid(state.sel));
        C.el('svg:path', { class: 'cursor', d: `M${f1(cx)} ${top}V${base}` }, svg);
        const v = todayAt(state.sel, d);
        dotAt = v != null ? [cx, y(disp(v))] : null;
      }
      if (dotAt) kit.dot(svg, dotAt[0], dotAt[1], 'series');
      drawn = { ...d, pw };
    }

    // ------------------------------------------------------------------ interaction

    /** The hour under the pointer, kept as its number (0–23); none past now. */
    function scrub(px) {
      if (!drawn) return;
      const at = drawn.win.from + (px - L) / drawn.pw * (drawn.win.to - drawn.win.from);
      const h = at >= drawn.win.from && at < drawn.win.to ? new Date(at).getHours() : null;
      if (h !== state.sel) { state.sel = h; frame.render(); }
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
      /** Today's state and the last days' (`/state`'s `charts`). */
      setState(list, lang) {
        if (lang) frame.language = lang;
        const [today, past] = Array.isArray(list) ? list : [];
        state.today = merged(today, state.today);
        state.past = past || null;
        frame.resetMessage();
        frame.render();
      },
      /** A realtime value (Device Values' `values:state`): appended to today's line. */
      pushChange({ deviceId, capabilityId, value }) {
        const s = state.today;
        if (!ok(s) || s.deviceId !== deviceId || s.capabilityId !== capabilityId) return;
        s.value = value;
        if (typeof value === 'number' && isFinite(value)) s.points.push([now(), value]);
        frame.renderIfSeen();
      },
      /**
       * Today's window and the last days' (rolling, so Insights' hourly log holds them), as `/state` asks for them
       * (lib/chartState.ts): `<span>~<from>~<end>~<unit>`.
       */
      windows: () => {
        const at = now();
        const today = timeSpan('1d!', at), past = timeSpan(`${days}d`, at);
        return [`1d!~${Math.floor(today.from)}~${Math.ceil(today.end)}~day`, `${days}d~${Math.floor(past.from)}~${Math.ceil(past.end)}~`];
      },
    });
  }

  window.createTypicalDayWidget = createTypicalDayWidget;
})();
