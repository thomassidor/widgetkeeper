/*
 * Chart · Gauge: one value now on a bar (the default) or a dial (a 240° arc), on a scale of its own (0–100 for a `%`,
 * else fitted to the time span, or as set), optionally in green, yellow and red by level, with its lowest to highest over
 * the time span (today by default) as a thin band beside the track. Drawn by the shared chart module (../electricity/chart.js, `window.WidgetkeeperChart`,
 * loaded first). Plain browser JS (served as-is).
 */
(function () {
  const { TIGHT_UNITS, scaled, formatNumber, timeSpan, isTimeSpan } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const C = window.WidgetkeeperChart;
  const { clear, show, f1 } = C;

  const SWEEP = 120; // degrees each way from the top: a 240° arc
  const MAX_R = 80; // the arc's radius at most
  const STROKE = 12; // the track and the value's arc
  const RANGE_W = 4; // the time span's band, inside the track
  const CHIP_H = 36; // the chip row, over the svg's top (as every chart widget's)
  const PAD = 6; // above the arc, and room for its round caps
  const ZONES = ['none', 'rising', 'falling'];
  const LAYOUTS = ['bar', 'dial'];
  const NUM_H = 40; // the bar's value line (32 px bold)

  const DEFAULT_STRINGS = {
    selectValue: 'Pick a value in the widget settings.',
    error: 'Could not load the chart.',
    unavailable: 'Unavailable',
    noHistory: 'No history yet.',
    range: 'Range',
  };

  const num = v => typeof v === 'number' && isFinite(v);

  /**
   * The level a value is at (`zones`: `rising`, higher is worse; `falling`, lower is worse): green, yellow from
   * `yellowAt`, red from `redAt`; null without zones.
   */
  function zoneOf(v, { zones, yellowAt, redAt }) {
    if (zones === 'rising') return v >= redAt ? 'red' : v >= yellowAt ? 'yellow' : 'green';
    if (zones === 'falling') return v <= redAt ? 'red' : v <= yellowAt ? 'yellow' : 'green';
    return null;
  }

  /** A point on the arc at `a` degrees from the top, clockwise. */
  function polar(cx, cy, r, a) {
    const rad = a * Math.PI / 180;
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
  }

  /** The arc from `a0` to `a1` degrees (clockwise, a0 < a1). */
  function arcPath(cx, cy, r, a0, a1) {
    const [x0, y0] = polar(cx, cy, r, a0);
    const [x1, y1] = polar(cx, cy, r, a1);
    return `M${f1(x0)} ${f1(y0)}A${f1(r)} ${f1(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f1(x1)} ${f1(y1)}`;
  }

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, color?: string, t?: (key: string) => string, locale?: string, language?: string, now?: () => number,
   *   span?: string, scale?: string, scaleMin?: number, scaleMax?: number, zones?: string, yellowAt?: number, redAt?: number,
   *   showRange?: boolean, title?: string, layout?: string, onHeight?: (h: number) => void }} opts
   */
  function createGaugeWidget(root, opts = {}) {
    // Any time span for the range (the kit's `timeSpan()`); missing or unknown: today.
    const span = isTimeSpan(opts.span) ? opts.span : '1d!';
    const custom = opts.scale === 'custom' && num(opts.scaleMin) && num(opts.scaleMax) && opts.scaleMax > opts.scaleMin;
    const levels = {
      zones: ZONES.includes(opts.zones) ? opts.zones : 'none',
      yellowAt: num(opts.yellowAt) ? opts.yellowAt : 1000,
      redAt: num(opts.redAt) ? opts.redAt : 1400,
    };
    const withZones = levels.zones !== 'none';
    const showRange = opts.showRange !== false;
    const title = typeof opts.title === 'string' ? opts.title.trim() : '';
    const layout = LAYOUTS.includes(opts.layout) ? opts.layout : 'bar'; // missing or unknown: the bar

    const state = {
      entry: null, // Sparklines' slot state ({deviceId, capabilityId, name, capability, value, points} | {missing})
    };

    const frame = C.createFrame(root, {
      opts, cls: 'gg', prefix: 'gauge', strings: DEFAULT_STRINGS, showHeader: false,
      colors: { style: opts.colorStyle, color: opts.color, fallback: 'blue' },
      redrawMs: 60e3,
      has: () => state.entry != null,
      clear: () => { state.entry = null; },
      draw, header: () => {},
    });
    const { t, kit, now } = frame;
    const { box, chips, svg, note } = frame.boxes[0];

    // ------------------------------------------------------------------ derived data

    const ok = s => !!s && !('missing' in s);

    /** The value now and its lowest and highest over the span (with the value now), all as shown (a 0–1 `%` as 0–100). */
    function reading(at) {
      const s = state.entry;
      if (!ok(s)) return null;
      const win = timeSpan(span, at);
      const vs = (s.points || []).filter(p => p[0] >= win.from && p[0] <= win.end && num(p[1])).map(p => scaled(s.capability, p[1]));
      const value = num(s.value) ? scaled(s.capability, s.value) : null;
      if (value != null && win.end === at) vs.push(value);
      return { s, value, min: vs.length ? Math.min(...vs) : null, max: vs.length ? Math.max(...vs) : null };
    }

    /** The scale: as set, 0–100 for a `%`, else whole steps around the span's values (and the zones' limits). */
    function scaleOf(r) {
      if (custom) return { lo: opts.scaleMin, hi: opts.scaleMax };
      if ((r.s.capability.units || '') === '%') return { lo: 0, hi: 100 };
      const vs = [r.value, r.min, r.max].filter(num);
      if (withZones) vs.push(levels.yellowAt, levels.redAt);
      const tk = C.ticks({ min: Math.min(...vs), max: Math.max(...vs), fit: true });
      return { lo: tk.axisMin, hi: tk.axisMax };
    }

    // ------------------------------------------------------------------ render

    /** The gauge, shown (`on`) or hidden; the frame draws the message and the passing message around it. */
    function draw(on) {
      show(box, on);
      if (on) renderGauge();
    }

    function renderGauge() {
      const w = frame.width;
      const r = reading(now());

      clear(chips);
      const s = ok(state.entry) ? state.entry : null;
      const units = s ? (s.capability.units || '') : '';
      const level = r && r.value != null ? zoneOf(r.value, levels) : null; // with zones, the chip's dot is the value's level
      kit.chip(chips, `series${level ? ` ${level}` : ''}`, title || (s ? `${s.name} · ${s.capability.title}` : t('unavailable')), units || null);
      if (showRange && r && r.min != null) kit.chip(chips, 'series range', t('range'), null);

      const drawable = !!r && (r.value != null || r.min != null);
      show(svg, drawable);
      show(note, !drawable);
      note.textContent = !s ? t('unavailable') : t('noHistory');
      box.classList.toggle('empty', !drawable);
      if (!drawable) return;

      const { lo, hi } = scaleOf(r);
      const frac = v => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
      const g = layout === 'dial' ? dialShape(w) : barShape(w);
      kit.prepareSvg(svg, w, g.H);
      box.classList.toggle('gg-zoned', withZones);
      box.dataset.layout = layout;
      const stroke = (a, b, cls, inside = 0) => C.el('svg:path', { class: cls, d: g.path(a, b, inside) }, svg);
      const dot = (f, cls, rr) => { const [x, y] = g.point(f); return C.el('svg:circle', { class: cls, cx: f1(x), cy: f1(y), r: rr }, svg); };

      // The track, or with zones a stretch of it per level (opaque, butt-ended, its round ends as dots in their level's colour).
      if (!withZones) stroke(0, 1, 'gg-track');
      else {
        const cuts = [lo, hi, levels.yellowAt, levels.redAt].filter(v => v >= lo && v <= hi).sort((a, b) => a - b);
        for (let i = 0; i < cuts.length - 1; i++) {
          if (cuts[i + 1] - cuts[i] <= 0) continue;
          stroke(frac(cuts[i]), frac(cuts[i + 1]), `gg-zone ${zoneOf((cuts[i] + cuts[i + 1]) / 2, levels)}`);
        }
        dot(0, `gg-cap ${zoneOf(lo, levels)}`, STROKE / 2);
        dot(1, `gg-cap ${zoneOf(hi, levels)}`, STROKE / 2);
      }
      // The span's lowest to highest, inside the dial or under the bar.
      if (showRange && r.min != null) {
        const f0 = frac(r.min), fEnd = Math.max(frac(r.max), f0 + 0.006);
        stroke(f0, fEnd, 'gg-range', STROKE / 2 + RANGE_W / 2 + 3);
      }
      // The value now, from the scale's start, in its level's colour with zones.
      const zone = level;
      if (r.value != null) {
        const f = frac(r.value);
        stroke(0, Math.max(f, 0.002), `gg-value${zone ? ` ${zone}` : ''}`).setAttribute('data-value', String(r.value));
        dot(f, `gg-knob${zone ? ` ${zone}` : ''}`, STROKE / 2 + 2);
      }

      // The scale's ends, the value with its units, and the range.
      const fmt = v => formatNumber({ ...s.capability, units: '', min: null, max: null }, v, true);
      kit.text(svg, g.endX[0], g.endY, fmt(lo), g.endAnchor[0], 'auto').setAttribute('class', 'gg-end');
      kit.text(svg, g.endX[1], g.endY, fmt(hi), g.endAnchor[1], 'auto').setAttribute('class', 'gg-end');
      const shown = r.value != null ? formatNumber(s.capability, s.value) : '–';
      const big = kit.text(svg, g.numX, g.numY, '', g.numAnchor, 'central');
      big.setAttribute('class', `gg-num${zone ? ` ${zone}` : ''}`);
      C.el('svg:tspan', { text: shown }, big);
      if (units && r.value != null) C.el('svg:tspan', { class: 'gg-unit', dx: TIGHT_UNITS.test(units) ? 0 : 3, text: units }, big);
      if (showRange && r.min != null) {
        const range = `${t('range')} ${fmt(r.min)}–${fmt(r.max)}`;
        kit.text(svg, g.subX, g.subY, range, g.subAnchor, 'central').setAttribute('class', 'gg-sub');
      }
    }

    /**
     * The dial: a 240° arc under the chip row, a fraction `f` of the scale at `-SWEEP + 2·SWEEP·f` degrees; `inside`
     * moves a stroke toward the centre. The value in the middle, the range under it, the scale's ends under the arc's.
     */
    function dialShape(w) {
      const radius = Math.max(40, Math.min(MAX_R, w / 2 - STROKE));
      const cx = w / 2, cy = CHIP_H + PAD + STROKE / 2 + radius;
      const endY = cy + radius * Math.cos((180 - SWEEP) * Math.PI / 180);
      const deg = f => -SWEEP + 2 * SWEEP * f;
      const [lx] = polar(cx, cy, radius, -SWEEP), [rx] = polar(cx, cy, radius, SWEEP);
      return {
        H: Math.ceil(endY + STROKE / 2 + 22),
        path: (a, b, inside) => arcPath(cx, cy, radius - inside, deg(a), deg(b)),
        point: f => polar(cx, cy, radius, deg(f)),
        endX: [lx, rx], endY: endY + STROKE / 2 + 14, endAnchor: ['middle', 'middle'],
        numX: cx, numY: cy + 4, numAnchor: 'middle',
        subX: cx, subY: cy + 34, subAnchor: 'middle',
      };
    }

    /**
     * The bar: the value and the range on one line under the chip row, then the track across the width (inset by its
     * round caps), `inside` moving a stroke below it, and the scale's ends under it at either side.
     */
    function barShape(w) {
      const x0 = STROKE / 2 + 2, x1 = w - STROKE / 2 - 2;
      const numY = CHIP_H + NUM_H / 2;
      const y = CHIP_H + NUM_H + 8 + STROKE / 2;
      const x = f => x0 + (x1 - x0) * f;
      const endY = y + STROKE / 2 + 3 + RANGE_W + 3 + 14;
      return {
        H: Math.ceil(endY + 6),
        path: (a, b, inside) => `M${f1(x(a))} ${f1(y + inside)}H${f1(x(b))}`,
        point: f => [x(f), y],
        endX: [0, w], endY, endAnchor: ['start', 'end'],
        numX: 0, numY, numAnchor: 'start',
        subX: w, subY: numY + 4, subAnchor: 'end',
      };
    }

    // ------------------------------------------------------------------ public API

    return frame.api({
      /** The value's state (`/state`'s `charts`, one entry). Live points newer than a refreshed history are kept. */
      setState(list, lang) {
        if (lang) frame.language = lang;
        const next = Array.isArray(list) && list.length ? list[0] : null;
        state.entry = next ? C.keepLive(next, state.entry) : null;
        frame.resetMessage();
        frame.render();
      },
      /** A realtime value (Device Values' `values:state`). */
      pushChange(change) { if (state.entry) frame.pushLive([state.entry], change, at => timeSpan(span, at)); },
      /** The span's window now, as `/state` asks for it (lib/chartState.ts). */
      windows: () => {
        const w = timeSpan(span, now());
        return [`${span}~${Math.floor(w.from)}~${Math.ceil(w.end)}~${w.unit || ''}`];
      },
    });
  }

  createGaugeWidget.zoneOf = zoneOf;
  window.createGaugeWidget = createGaugeWidget;
})();
