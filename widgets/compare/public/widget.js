/*
 * Chart · Ranking: one value across up to eight devices, a row each, sorted: the value now as a dot and its lowest to
 * highest over the time span (today by default) as a bar, on one shared scale. Which room is warmest? Drawn by the
 * shared chart module (../electricity/chart.js, `window.WidgetkeeperChart`, loaded first). Plain browser JS (served as-is).
 */
(function () {
  const { TIGHT_UNITS, scaled, formatNumber, timeSpan, isTimeSpan, sixHourSpan } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const C = window.WidgetkeeperChart;
  const { X_LABEL_GAP, X_LABEL_H, clear, show, f1 } = C;

  const CHIP_H = 36; // chip row → the first row
  const ROW = 26; // a row's height
  const VALUE_W = 64; // the value now, at the right
  const MAX = 8;
  const SORTS = ['high', 'low', 'listed'];

  const DEFAULT_STRINGS = {
    selectValues: 'Pick the values to compare in the widget settings.',
    error: 'Could not load the chart.',
    unavailable: 'Unavailable',
    highest: 'Highest',
    lowest: 'Lowest',
    range: 'Range',
  };

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, color?: string, t?: (key: string) => string, locale?: string, language?: string, now?: () => number,
   *   count?: number, span?: string, sort?: string, showRange?: boolean, title?: string, showHeader?: boolean, onHeight?: (h: number) => void }} opts
   */
  function createCompareWidget(root, opts = {}) {
    // Any time span for the ranges (the kit's `timeSpan()`); missing or unknown: today.
    const span = isTimeSpan(opts.span) ? opts.span : '1d!';
    const sort = SORTS.includes(opts.sort) ? opts.sort : 'high';
    const showRange = opts.showRange !== false;
    const title = typeof opts.title === 'string' ? opts.title.trim() : '';
    const count = Math.max(1, Math.min(MAX, Number(opts.count) || 1));

    const state = {
      entries: [], // per value, as picked: Sparklines' slot state ({deviceId, capabilityId, name, capability, value, points} | {missing})
      sel: null, // the tapped row's index into `entries`
    };
    let drawn = null; // the latest render's rows and their y, for the header and the pointer

    const frame = C.createFrame(root, {
      opts, cls: 'cp', prefix: 'compare', strings: DEFAULT_STRINGS, showHeader: opts.showHeader,
      colors: { style: opts.colorStyle, color: opts.color, fallback: 'blue' },
      redrawMs: 60e3,
      has: () => state.entries.length > 0,
      clear: () => { state.entries = []; },
      draw, header: renderHeader,
    });
    const { t, nf, now, kit } = frame;
    const { box, chips, svg, note } = frame.boxes[0];

    // ------------------------------------------------------------------ derived data

    const ok = s => !!s && !('missing' in s);
    const num = v => typeof v === 'number' && isFinite(v);

    /** Each value's row: its name, the value now and its lowest and highest over the span (with the value now), sorted. */
    function rowsAt(at) {
      const win = timeSpan(span, at);
      const live = win.end === at;
      const devices = new Set(state.entries.filter(ok).map(s => s.deviceId));
      const named = new Map();
      for (const s of state.entries.filter(ok)) named.set(s.name, (named.get(s.name) || 0) + 1);
      const rows = state.entries.map((s, i) => {
        if (!ok(s)) return { i, name: t('unavailable'), missing: true };
        // One device: its values by capability; the same name twice: both parts.
        const name = devices.size === 1 && state.entries.length > 1 ? s.capability.title
          : named.get(s.name) > 1 ? `${s.name} · ${s.capability.title}` : s.name;
        const vs = (s.points || []).filter(p => p[0] >= win.from && p[0] <= win.end && num(p[1])).map(p => p[1]);
        if (live && num(s.value)) vs.push(s.value);
        return { i, s, name, value: num(s.value) ? s.value : null, min: vs.length ? Math.min(...vs) : null, max: vs.length ? Math.max(...vs) : null };
      });
      const by = r => (r.missing || r.value == null ? null : scaled(r.s.capability, r.value));
      if (sort !== 'listed') {
        rows.sort((a, b) => {
          const va = by(a), vb = by(b);
          if (va == null || vb == null) return Number(va == null) - Number(vb == null) || a.i - b.i;
          return sort === 'high' ? vb - va : va - vb;
        });
      }
      return rows;
    }

    /** The first value's name for the chip (or the title), with its units. */
    function chipText() {
      const first = state.entries.find(ok);
      if (title) return { label: title, units: first && first.capability.units };
      return first ? { label: first.capability.title, units: first.capability.units } : { label: t('unavailable'), units: null };
    }

    /** A row's value now with its units, as the header writes them (`21.4°C`, `1.2 kW`). */
    const valueText = (r) => {
      const units = r.s.capability.units || '';
      return `${formatNumber(r.s.capability, r.value)}${units ? `${TIGHT_UNITS.test(units) ? '' : ' '}${units}` : ''}`;
    };

    // ------------------------------------------------------------------ render

    /** The chart, shown (`on`) or hidden; the frame draws the message, the header and the passing message around it. */
    function draw(on) {
      show(box, on);
      drawn = null;
      if (on) renderChart();
    }

    function renderHeader(column) {
      const rows = drawn ? drawn.rows : rowsAt(now());
      const known = rows.filter(r => !r.missing && r.value != null);
      if (!known.length) { column({ value: null, sub: t('unavailable') }); return; }
      const units = r => r.s.capability.units || '';
      const tapped = state.sel != null ? known.find(r => r.i === state.sel) : null;
      if (tapped) {
        column({ value: formatNumber(tapped.s.capability, tapped.value), units: units(tapped), sub: tapped.name });
        const range = tapped.min != null ? `${formatNumber(tapped.s.capability, tapped.min, true)}–${formatNumber(tapped.s.capability, tapped.max, true)}` : null;
        column({ value: range, units: range ? units(tapped) : '', tightUnits: units(tapped), sub: t('range'), colCls: ' low' });
        return;
      }
      const ranked = [...known].sort((a, b) => scaled(b.s.capability, b.value) - scaled(a.s.capability, a.value));
      const hi = ranked[0], lo = ranked[ranked.length - 1];
      column({ value: formatNumber(hi.s.capability, hi.value), units: units(hi), sub: `${t('highest')} · ${hi.name}` });
      if (ranked.length > 1) column({ value: formatNumber(lo.s.capability, lo.value), units: units(lo), sub: `${t('lowest')} · ${lo.name}`, colCls: ' low' });
    }

    function renderChart() {
      const w = frame.width;
      const rows = rowsAt(now());
      const known = rows.filter(r => !r.missing && (r.value != null || r.min != null));

      clear(chips);
      const { label, units } = chipText();
      kit.chip(chips, 'series', label, units || null);
      if (showRange) kit.chip(chips, 'series range', t('range'), null);

      const drawable = known.length > 0;
      show(svg, drawable);
      show(note, !drawable);
      note.textContent = t('unavailable');
      box.classList.toggle('empty', !drawable);
      if (!drawable) return;

      const labelW = Math.round(Math.min(130, w * 0.36));
      const left = labelW + 10, pw = Math.max(40, w - left - VALUE_W - 8);
      const top = CHIP_H, base = top + rows.length * ROW + 2;
      const H = base + X_LABEL_GAP + X_LABEL_H;
      kit.prepareSvg(svg, w, H);
      const vals = known.flatMap(r => [r.value, ...(showRange ? [r.min, r.max] : [])].filter(num).map(v => scaled(r.s.capability, v)));
      const sc = kit.xValueScale(svg, { min: Math.min(...vals), max: Math.max(...vals), pw, top: top + 6, base, format: (v, step) => C.axisLabel(nf, v, step), left, edge: true });
      // Names, as much as fits.
      const fit = text => (text.length * 6.6 > labelW ? `${text.slice(0, Math.max(1, Math.floor(labelW / 6.6) - 1))}…` : text);
      const placed = rows.map((r, k) => {
        const cy = top + k * ROW + ROW / 2;
        kit.text(svg, 0, cy, fit(r.name), 'start', 'central').setAttribute('class', r.missing ? 'cp-name missing' : 'cp-name');
        if (r.missing) return { ...r, cy };
        const x = v => sc.x(scaled(r.s.capability, v));
        if (showRange && r.min != null) {
          C.el('svg:rect', { class: 'cp-range', x: f1(x(r.min) - 4), y: f1(cy - 4), width: f1(Math.max(8, x(r.max) - x(r.min) + 8)), height: 8, rx: 4 }, svg);
        }
        if (r.value != null) {
          if (state.sel === r.i) kit.dot(svg, x(r.value), cy, 'series');
          else C.el('svg:circle', { class: 'cp-dot', cx: f1(x(r.value)), cy: f1(cy), r: 4.5 }, svg);
          kit.text(svg, w, cy, valueText(r), 'end', 'central').setAttribute('class', 'cp-num');
        }
        return { ...r, cy };
      });
      drawn = { rows: placed };
    }

    // ------------------------------------------------------------------ interaction

    /** The row under the pointer, kept as its value's place in the settings. */
    function scrub(px, py) {
      if (!drawn) return;
      const row = drawn.rows.find(r => !r.missing && Math.abs(r.cy - py) <= ROW / 2);
      const at = row ? row.i : null;
      if (at !== state.sel) { state.sel = at; frame.render(); }
    }
    frame.scrub(svg, scrub, () => { if (state.sel != null) { state.sel = null; frame.render(); } });

    // ------------------------------------------------------------------ public API

    return frame.api({
      /** Each value's state, as picked (`/state`'s `charts`). Live points newer than a refreshed history are kept. */
      setState(list, lang) {
        if (lang) frame.language = lang;
        const previous = state.entries;
        state.entries = (Array.isArray(list) ? list : []).slice(0, MAX).map((s, i) => {
          if (!ok(s)) return s || { missing: true };
          const old = previous[i];
          const points = Array.isArray(s.points) ? s.points.slice() : [];
          const same = ok(old) && old.deviceId === s.deviceId && old.capabilityId === s.capabilityId;
          const after = points.length ? points[points.length - 1][0] : -Infinity;
          return { ...s, points: points.concat(same ? old.points.filter(p => p[0] > after) : []) };
        });
        frame.resetMessage();
        frame.render();
      },
      /** A realtime value (Device Values' `values:state`): every row that shows it. */
      pushChange({ deviceId, capabilityId, value }) {
        const at = now();
        const win = timeSpan(span, at);
        let changed = false;
        for (const s of state.entries) {
          if (!ok(s) || s.deviceId !== deviceId || s.capabilityId !== capabilityId) continue;
          s.value = value;
          if (num(value) && win.end === at && !sixHourSpan(span)) s.points.push([at, value]);
          changed = true;
        }
        if (changed) frame.renderIfSeen();
      },
      /** The span's window now, once per value, as `/state` asks for it (lib/chartState.ts). */
      windows: () => {
        const w = timeSpan(span, now());
        return Array.from({ length: count }, () => `${span}~${Math.floor(w.from)}~${Math.ceil(w.end)}~${w.unit || ''}`);
      },
    });
  }

  window.createCompareWidget = createCompareWidget;
})();
