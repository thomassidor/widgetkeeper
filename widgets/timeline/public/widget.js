/*
 * Chart · Timeline: when was it on, open or moving? A row per value over the time span (today by default), each its name
 * above a thin track with bands where the value was true: the heating's on-time, the hall's motion, the front door's
 * openings. Drawn by the shared chart module (../electricity/chart.js, `window.WidgetkeeperChart`, loaded first). The
 * changes are the app's own recording (Insights keeps only a boolean's last 50). Plain browser JS (served as-is).
 */
(function () {
  const { COLORS, timeSpan, isTimeSpan } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const C = window.WidgetkeeperChart;
  const { L, X_LABEL_GAP, X_LABEL_H, MIN, HOUR, clear, show, f1 } = C;

  const CHIP_H = 36; // the title's chip row → the first row
  const TOP = 2; // without a title
  const ROW = 32; // a row: its name, then the track
  const NAME_Y = 8; // the name's middle, from the row's top
  const TRACK_Y = 18; // the track's top, from the row's top
  const TRACK_H = 10;
  const MIN_BAND = 2.5; // a band of a few seconds (a door opened) still shows
  const HIT = 4; // px either side of a band that a tap still picks
  const MAX = 8;

  /**
   * What true means, by capability: a contact is open, motion is motion, an alarm is active, anything else is on. Each
   * kind has its words for the time true (`time<Kind>`) and for how often it turned true (`count<Kind>`).
   */
  function kindOf(capabilityId) {
    const base = String(capabilityId || '').split('.')[0];
    if (base === 'alarm_contact' || base === 'alarm_door' || base === 'alarm_window') return 'open';
    if (base === 'alarm_motion' || base === 'alarm_presence' || base === 'alarm_occupancy') return 'motion';
    if (base.startsWith('alarm_')) return 'alarm';
    return 'on';
  }
  /** A kind's word key: `timeOpen`, `countOn` … */
  const word = (what, kind) => what + kind.charAt(0).toUpperCase() + kind.slice(1);

  const DEFAULT_STRINGS = {
    selectValues: 'Pick the values to show in the widget settings.',
    error: 'Could not load the chart.',
    unavailable: 'Unavailable',
    noHistory: 'Nothing recorded yet',
    now: 'Now',
    timeOn: 'On',
    timeOpen: 'Open',
    timeMotion: 'Motion',
    timeAlarm: 'Active',
    countOn: 'Turned on',
    countOpen: 'Opened',
    countMotion: 'Detections',
    countAlarm: 'Triggered',
    hours: 'h',
    minutes: 'min',
  };

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, colors?: string[], t?: (key: string) => string, locale?: string, language?: string,
   *   now?: () => number, span?: string, title?: string, showHeader?: boolean, onHeight?: (h: number) => void }} opts
   */
  function createTimelineWidget(root, opts = {}) {
    // Any time span (the kit's `timeSpan()`); missing or unknown: today.
    const span = isTimeSpan(opts.span) ? opts.span : '1d!';
    const title = typeof opts.title === 'string' ? opts.title.trim() : '';
    // Each row's colour (its setting), else the kit's colours in order.
    const colorOf = i => (opts.colors && COLORS.includes(opts.colors[i]) ? opts.colors[i] : COLORS[i % COLORS.length]);

    const state = {
      entries: [], // per value, as picked: {deviceId, capabilityId, name, capability, value, changes, since} | {missing}
      sel: null, // the tapped row's index (`{row}`), with a band's start (`{row, at}`)
    };
    let drawn = null; // the latest render's rows, for the header and the pointer

    const frame = C.createFrame(root, {
      opts, cls: 'tl', prefix: 'timeline', strings: DEFAULT_STRINGS, showHeader: opts.showHeader,
      colors: { style: opts.colorStyle },
      redrawMs: 60e3,
      has: () => state.entries.length > 0,
      clear: () => { state.entries = []; },
      draw, header: renderHeader,
    });
    const { t, nf, now, kit } = frame;
    const { box, chips, svg, note } = frame.boxes[0];

    // ------------------------------------------------------------------ derived data

    const ok = s => !!s && !('missing' in s);

    /**
     * A row's bands over the window `[from, until]` (until: now, or the span's end), the time before its first known change
     * left out: `{known, bands: [{from, to}], on, count}`, `on` the time true (ms) and `count` how often it turned true.
     */
    function bandsOf(s, from, until) {
      const changes = Array.isArray(s.changes) ? s.changes : [];
      const known = s.since == null ? null : Math.max(from, s.since);
      const bands = [];
      let open = null, count = 0, last = null;
      for (const [at, v] of changes) {
        if (at > until) break;
        if (v === last) continue;
        last = v;
        if (v === 1) { open = at; if (at >= from) count++; } else if (open != null) { bands.push({ from: open, to: at }); open = null; }
      }
      if (open != null) bands.push({ from: open, to: until });
      const cut = known == null ? [] : bands.map(b => ({ from: Math.max(b.from, known), to: Math.min(b.to, until) })).filter(b => b.to > b.from);
      return { known, bands: cut, on: cut.reduce((a, b) => a + (b.to - b.from), 0), count };
    }

    /** Each value's row, as picked: its name (one device's several values by their capability), kind and bands. */
    function rowsAt(at) {
      const win = timeSpan(span, at);
      const until = Math.min(at, win.end);
      const devices = new Set(state.entries.filter(ok).map(s => s.deviceId));
      const named = new Map();
      for (const s of state.entries.filter(ok)) named.set(s.name, (named.get(s.name) || 0) + 1);
      return state.entries.map((s, i) => {
        if (!ok(s)) return { i, s, name: t('unavailable'), missing: true, kind: 'on', color: colorOf(i), known: null, bands: [], on: 0, count: 0 };
        const name = devices.size === 1 && state.entries.filter(ok).length > 1 ? s.capability.title
          : named.get(s.name) > 1 ? `${s.name} · ${s.capability.title}` : s.name;
        return { i, s, name, kind: kindOf(s.capabilityId), color: colorOf(i), ...bandsOf(s, win.from, until) };
      });
    }

    /** A length of time as the header writes it: `5:40` h, or under an hour `25` min (`<1` min for seconds). */
    function duration(ms) {
      if (ms < HOUR) return { value: ms < MIN && ms > 0 ? '<1' : nf(Math.floor(ms / MIN)), units: t('minutes') };
      const m = Math.floor(ms / MIN);
      return { value: `${nf(Math.floor(m / 60))}:${String(m % 60).padStart(2, '0')}`, units: t('hours') };
    }

    /** A band's times: `16:05–17:30`, with the weekday over several days (`Mon 16:05 – Tue 01:00`). */
    function bandText(b, win) {
      const day = ms => frame.date(ms, { weekday: 'short' });
      const sameDay = new Date(b.from).toDateString() === new Date(b.to).toDateString();
      if (win.end - win.from <= 24 * HOUR + HOUR && sameDay) return `${frame.hhmm(b.from)}–${frame.hhmm(b.to)}`;
      if (sameDay) return `${day(b.from)} ${frame.hhmm(b.from)}–${frame.hhmm(b.to)}`;
      return `${day(b.from)} ${frame.hhmm(b.from)} – ${day(b.to)} ${frame.hhmm(b.to)}`;
    }

    // ------------------------------------------------------------------ render

    /** The chart, shown (`on`) or hidden; the frame draws the message, the header and the passing message around it. */
    function draw(on) {
      show(box, on);
      drawn = null;
      if (on) renderChart();
    }

    function renderHeader(column) {
      const rows = drawn ? drawn.rows : rowsAt(now());
      const known = rows.filter(r => !r.missing && r.known != null);
      if (!known.length) { column({ value: null, sub: t(rows.some(r => !r.missing) ? 'noHistory' : 'unavailable') }); return; }
      const timeCol = r => {
        const d = duration(r.on);
        column({ value: d.value, units: d.units, sub: `${t(word('time', r.kind))} · ${r.name}`, attrs: { 'data-wk-color': r.color } });
      };
      const countCol = (r, colCls) => column({ value: nf(r.count), sub: `${t(word('count', r.kind))} · ${r.name}`, colCls, attrs: { 'data-wk-color': r.color } });
      const tapped = state.sel != null ? known.find(r => r.i === state.sel.row) : null;
      if (tapped) {
        const band = state.sel.at != null ? tapped.bands.find(b => b.from === state.sel.at) : null;
        if (band) {
          // Its length, with its times under it (`16:05–17:30`: too long for the 300 px widget's 24 px value).
          const d = duration(band.to - band.from);
          column({ value: d.value, units: d.units, sub: bandText(band, timeSpan(span, now())), attrs: { 'data-wk-color': tapped.color } });
          countCol(tapped, ' low');
          return;
        }
        timeCol(tapped);
        countCol(tapped, ' low');
        return;
      }
      timeCol(known[0]);
      countCol(known[1] || known[0], ' low');
    }

    function renderChart() {
      const w = frame.width;
      const at = now();
      const win = timeSpan(span, at);
      const rows = rowsAt(at);

      clear(chips);
      if (title) kit.chip(chips, 'series', title, null);
      show(chips, !!title);
      show(svg, true);
      show(note, false);

      const top = title ? CHIP_H : TOP;
      const base = top + rows.length * ROW + 2;
      kit.prepareSvg(svg, w, base + X_LABEL_GAP + X_LABEL_H);
      const x = ms => w * (ms - win.from) / (win.to - win.from);
      const nowX = at < win.to ? x(at) : null;
      const fit = text => (text.length * 6.6 > w ? `${text.slice(0, Math.max(1, Math.floor(w / 6.6) - 1))}…` : text);

      const placed = rows.map((r, k) => {
        const y = top + k * ROW;
        const g = C.el('svg:g', { class: r.missing ? 'tl-row missing' : 'tl-row', 'data-wk-color': r.color }, svg);
        kit.text(g, 0, y + NAME_Y, fit(r.name), 'start', 'central').setAttribute('class', 'tl-name');
        const ty = y + TRACK_Y;
        if (r.missing || r.known == null) {
          C.el('svg:path', { class: 'tl-unknown', d: `M0 ${f1(ty + TRACK_H / 2)}H${f1(nowX == null ? w : nowX)}` }, g);
          return { ...r, ty, bands: [] };
        }
        const kx = x(r.known);
        if (kx > 0) C.el('svg:path', { class: 'tl-unknown', d: `M0 ${f1(ty + TRACK_H / 2)}H${f1(kx)}` }, g);
        const ex = nowX == null ? w : nowX;
        if (ex > kx) C.el('svg:rect', { class: 'tl-track', x: f1(kx), y: ty, width: f1(ex - kx), height: TRACK_H, rx: 3 }, g);
        const bands = r.bands.map((b) => {
          const bx = x(b.from), bw = Math.max(MIN_BAND, x(b.to) - bx);
          const sel = state.sel && state.sel.row === r.i && state.sel.at === b.from;
          C.el('svg:rect', { class: sel ? 'tl-band selected' : 'tl-band', x: f1(Math.min(bx, w - bw)), y: ty, width: f1(bw), height: TRACK_H, rx: Math.min(3, bw / 2) }, g);
          return { ...b, x0: bx, x1: bx + bw };
        });
        return { ...r, ty, bands: r.bands, hits: bands };
      });
      if (nowX != null) {
        C.el('svg:rect', { class: 'future', x: f1(nowX), y: top, width: f1(w - nowX), height: f1(base - top) }, svg);
        C.el('svg:path', { class: 'cursor', d: `M${f1(nowX)} ${top}V${base}` }, svg);
      }
      C.el('svg:path', { class: 'axis', d: `M0 ${base}H${w}` }, svg);
      // The chart kit's labels, drawn from its left gutter: moved back to the widget's left edge.
      const labels = C.el('svg:g', { transform: `translate(${-L} 0)` }, svg);
      kit.timeLabels(labels, win, { pw: w, top, base, nf, date: frame.date, now: t('now') });
      drawn = { rows: placed };
    }

    // ------------------------------------------------------------------ interaction

    /** The row under the pointer, and the band under it on that row (kept as the row's place and the band's start). */
    function scrub(px, py) {
      if (!drawn) return;
      const row = drawn.rows.find(r => !r.missing && r.hits && py >= r.ty - TRACK_Y && py < r.ty - TRACK_Y + ROW);
      const band = row ? row.hits.find(b => px >= b.x0 - HIT && px <= b.x1 + HIT) : null;
      const sel = row ? { row: row.i, at: band ? band.from : null } : null;
      if (JSON.stringify(sel) !== JSON.stringify(state.sel)) { state.sel = sel; frame.render(); }
    }
    frame.scrub(svg, scrub, () => { if (state.sel != null) { state.sel = null; frame.render(); } });

    // ------------------------------------------------------------------ public API

    return frame.api({
      /** Each value's state, as picked (`/state`'s `rows`). Live changes newer than a refreshed recording are kept. */
      setState(list, lang) {
        if (lang) frame.language = lang;
        const previous = state.entries;
        state.entries = (Array.isArray(list) ? list : []).slice(0, MAX).map((s, i) => {
          if (!ok(s)) return s || { missing: true };
          const old = previous[i];
          const changes = Array.isArray(s.changes) ? s.changes.slice() : [];
          const same = ok(old) && old.deviceId === s.deviceId && old.capabilityId === s.capabilityId;
          const after = changes.length ? changes[changes.length - 1][0] : -Infinity;
          return { ...s, changes: changes.concat(same ? old.changes.filter(c => c[0] > after) : []) };
        });
        frame.resetMessage();
        frame.render();
      },
      /** A realtime value (Device Values' `values:state`): a change onto every row that shows it. */
      pushChange({ deviceId, capabilityId, value }) {
        if (typeof value !== 'boolean') return;
        const at = now();
        let changed = false;
        for (const s of state.entries) {
          if (!ok(s) || s.deviceId !== deviceId || s.capabilityId !== capabilityId) continue;
          s.value = value;
          const last = s.changes[s.changes.length - 1];
          if (!last || last[1] !== (value ? 1 : 0)) s.changes.push([at, value ? 1 : 0]);
          if (s.since == null) s.since = at;
          changed = true;
        }
        if (changed) frame.renderIfSeen();
      },
      /** The window's start now, as `/state` asks for it (lib/timelineState.ts). */
      from: () => Math.floor(timeSpan(span, now()).from),
    });
  }

  createTimelineWidget.kindOf = kindOf;
  window.createTimelineWidget = createTimelineWidget;
})();
