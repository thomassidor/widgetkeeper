/*
 * The Widget Builder widget (`custom`): draws a design (lib/customDesigns.ts) built on the web dashboards' builder page.
 * Parts sit on a 4-column grid of 64 px rows; a container holds its own parts on a fine grid (12 columns, 8 px rows) or
 * freely (per cent of its box). Each part's colour is, in order: what a Flow set, the first rule that holds, its own.
 * `opts.onSet(part, value)`, `onButton(part)` act; mount.js sends them. The builder page draws its preview with this too.
 */
(function () {
  const K = window.WidgetkeeperKit;
  const { el } = K;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STEP_SEND_MS = 700; // a burst of − / + taps is sent once
  const HOPE_MS = 10e3; // a value just sent, shown until the device says so
  /** A Text's sizes before they were Notes' (Normal is Small now, Heading Default; lib/customDesigns.ts' `OLD_SIZES`). */
  const OLD_SIZES = { body: 'small', heading: 'default' };
  /** Notes' Post-it font by size. */
  const NOTE_FONT = { small: 24, default: 30, large: 38, display: 38 };

  const DEFAULT_STRINGS = {
    error: 'Could not load the design.',
    missing: 'This design was removed.',
    pickDesign: 'Pick a design in the widget\'s settings.',
    empty: 'This design has no components yet.',
    unavailable: 'Unavailable',
    on: 'On',
    off: 'Off',
    setFailed: 'Could not change __name__.',
    noValue: 'No value picked',
    noReady: 'Pick a ready-made component for the repeater.',
    noKey: 'For this, add an API key in the app settings.',
    keyScope: 'The API key may not do this (Flows or Variables).',
    keyInvalid: 'The API key was not accepted.',
    tapAgain: 'Tap again',
    hold: 'Hold',
    nothing: 'Nothing to show',
    page: 'Page __n__',
    yes: 'Yes',
    no: 'No',
    open: 'Open',
    closed: 'Closed',
    motion: 'Motion',
    noMotion: 'No motion',
    alarm: 'Alarm',
    ok: 'OK',
  };

  /** lib/customDesigns.ts' `ruleHolds()` (a test checks they agree). */
  function ruleHolds(rule, value) {
    if (value === null || value === undefined) return false;
    const n = x => Number(String(x == null ? '' : x).replace(',', '.'));
    if (rule.op === 'between') {
      // From one end to the other, both included, whichever is typed first; an empty end is open.
      const v = Number(value);
      const a = String(rule.value == null ? '' : rule.value).trim() ? n(rule.value) : -Infinity;
      const b = String(rule.to == null ? '' : rule.to).trim() ? n(rule.to) : Infinity;
      if (!Number.isFinite(v) || Number.isNaN(a) || Number.isNaN(b)) return false;
      return v >= Math.min(a, b) && v <= Math.max(a, b);
    }
    if (rule.op === 'above' || rule.op === 'below') {
      const v = Number(value);
      const r = n(rule.value);
      if (!Number.isFinite(v) || !Number.isFinite(r)) return false;
      return rule.op === 'above' ? v > r : v < r;
    }
    const norm = (x) => {
      const s = String(x).trim().toLowerCase();
      if (['on', 'yes', 'true', 'open'].includes(s)) return 'true';
      if (['off', 'no', 'false', 'closed'].includes(s)) return 'false';
      return s;
    };
    const same = typeof value === 'number'
      ? Number(String(rule.value).replace(',', '.')) === value
      : norm(value) === norm(rule.value);
    return rule.op === 'is' ? same : !same;
  }
  window.customRuleHolds = ruleHolds;

  const FUNCTIONS = {
    min: Math.min, max: Math.max, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sqrt: Math.sqrt,
    round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  };
  const INPUT_NAMES = 'abcdefghijkl';

  /**
   * A calculated value's formula: numbers, the inputs `a` … `l`, `+ - * / % ^`, brackets and `min max abs round floor
   * ceil sqrt`, as a function of the inputs (`{a: 21.5, b: …}`), or null when it can't be read. A small parser, no `eval`
   * (lib/priceCosts.ts' grammar, with names). An input that's missing makes the result NaN.
   */
  function parseFormula(src) {
    if (typeof src !== 'string' || !src.trim()) return null;
    const tokens = src.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
      .match(/\d+(?:\.\d+)?|\.\d+|[a-z]+|[-+*/%^(),;]|\S/gi) || [];
    let i = 0;
    const peek = () => tokens[i];
    const next = () => tokens[i++];
    const fail = () => { throw new Error('formula'); };
    const expect = (t) => { if (next() !== t) fail(); };
    const isSep = t => t === ';' || t === ',';
    const expr = () => {
      let left = term();
      while (peek() === '+' || peek() === '-') {
        const op = next(); const a = left; const b = term();
        left = op === '+' ? v => a(v) + b(v) : v => a(v) - b(v);
      }
      return left;
    };
    const term = () => {
      let left = unary();
      while (peek() === '*' || peek() === '/' || peek() === '%') {
        const op = next(); const a = left; const b = unary();
        left = op === '*' ? v => a(v) * b(v) : op === '/' ? v => a(v) / b(v) : v => a(v) % b(v);
      }
      return left;
    };
    const unary = () => {
      if (peek() === '-') { next(); const a = unary(); return v => -a(v); }
      if (peek() === '+') { next(); return unary(); }
      const base = atom();
      if (peek() !== '^') return base;
      next();
      const e = unary();
      return v => base(v) ** e(v);
    };
    const atom = () => {
      const t = next();
      if (t == null) fail();
      if (/^[\d.]/.test(t)) { const n = Number(t); if (!Number.isFinite(n)) fail(); return () => n; }
      if (t === '(') { const a = expr(); expect(')'); return a; }
      const name = t.toLowerCase();
      if (name.length === 1 && INPUT_NAMES.includes(name)) {
        return v => (v && typeof v[name] === 'number' ? v[name] : NaN);
      }
      const fn = Object.prototype.hasOwnProperty.call(FUNCTIONS, name) ? FUNCTIONS[name] : null;
      if (!fn) fail();
      expect('(');
      const args = [expr()];
      while (isSep(peek())) { next(); args.push(expr()); }
      expect(')');
      return v => fn(...args.map(a => a(v)));
    };
    try {
      // A comma (or `;`) separates a function's arguments; decimals take a point.
      const fn = expr();
      if (i < tokens.length) fail();
      return fn;
    } catch (e) {
      return null;
    }
  }
  window.customFormula = parseFormula;

  /**
   * A part's look now: its colour (a palette name or `#rrggbb`), whether that tints the whole tile (a rule's or a Flow's
   * colour: something to notice; the part's own colour only accents its icon, toggle, bar or line) and whether it's hidden.
   */
  function lookOf(part, value, flow, valueOf) {
    if (flow && flow.hidden === true) return { color: null, tint: false, hidden: true };
    // A colour that follows a Flow input is its own colour while the input has one.
    let color = (flow && flow.color) || part.color || null;
    let tint = false;
    let hidden = false;
    let icon = null;
    for (const r of part.rules || []) {
      // A rule that names another value (`of`) checks that one.
      if (!ruleHolds(r, r.of ? (valueOf ? valueOf(r.of) : undefined) : value)) continue;
      if (r.look === 'hide') hidden = true;
      else if (r.look !== 'same') { color = r.look; tint = true; } // `same`: only its icon changes
      icon = r.icon || null;
      break;
    }
    return { color, tint, hidden, icon };
  }
  window.customLookOf = lookOf;

  /** A part's background: its `style`, or as kept before it had one (`tile: false`; text and icons none). */
  function styleOf(part) {
    if (part.kind === 'shape') return 'none';
    // A container from before it had a style: on the tile's colour without a background of its own.
    if (part.kind === 'container' && !['tile', 'pill', 'none'].includes(part.style)) return part.background && part.background.kind !== 'none' ? 'none' : 'tile';
    if (part.style === 'postit') return part.kind === 'text' ? 'postit' : 'tile';
    if (['tile', 'pill', 'none'].includes(part.style)) return part.style;
    return part.tile === false || ['text', 'icon', 'sparkline', 'arc', 'bar', 'calc', 'each', 'use'].includes(part.kind) ? 'none' : 'tile';
  }

  /** A colour as CSS: a palette name follows Muted or Vivid (the kit's `--wk-<name>`), `#rrggbb` as it is. */
  function cssColor(c) {
    if (!c) return '';
    if (K.isCustomColor(c)) return c;
    return K.COLORS.includes(c) ? `var(--wk-${c})` : '';
  }
  /** A chart's colour: a palette name in its bright set, as Charts' and Sparklines' lines in both colour styles. */
  function chartColor(c) {
    if (!c) return '';
    if (K.isCustomColor(c)) return c;
    return K.COLORS.includes(c) ? `var(--wk-${c}-bright)` : '';
  }
  /**
   * A container's own fill (`background`), as CSS variables its stylesheet draws at its strength (`dim`): each end's colour
   * in the colour style's pick and in its bright set, with the text on each, and whether both are colours of its own
   * (`#rrggbb`, solid in both styles, as a Flow's custom colour on Device Values' tiles).
   */
  function paintBox(node, bg) {
    const ends = [bg.from, bg.kind === 'gradient' ? bg.to : bg.from];
    const own = c => K.isCustomColor(c);
    const set = (name, v) => node.style.setProperty(name, v);
    ends.forEach((c, i) => {
      const at = i ? 'to' : 'from';
      set(`--wb-${at}`, own(c) ? c : `var(--wk-${c})`);
      set(`--wb-${at}-bright`, own(c) ? c : `var(--wk-${c}-bright)`);
    });
    set('--wb-on', own(bg.from) ? K.customInk(bg.from) : `var(--wk-on-${bg.from})`);
    set('--wb-on-bright', own(bg.from) ? K.customInk(bg.from) : `var(--wk-on-${bg.from}-bright)`);
    set('--wb-angle', `${bg.kind === 'gradient' ? bg.angle : 180}deg`);
    node.classList.add('wb-box-bg', `wb-dim-${['half', 'full'].includes(bg.dim) ? bg.dim : 'widget'}`);
    node.classList.toggle('wb-bg-hex', ends.every(own));
  }
  /** A container's or a shape's background as CSS: none, a colour or a gradient (each colour a palette name or hex). */
  function backgroundCss(bg) {
    if (!bg || bg.kind === 'none') return '';
    if (bg.kind === 'color') return cssColor(bg.from);
    return `linear-gradient(${bg.angle}deg, ${cssColor(bg.from)}, ${cssColor(bg.to)})`;
  }
  /**
   * A copy of a ready-made component for one device (a Repeater's): its `@` values that device's, its ids and its
   * kids' `<repeater>/<id>` (so a request names the copy), and the device kept for its requests.
   */
  function bindPart(part, deviceId, prefix) {
    const walk = (x, key) => {
      if (typeof x === 'string') return /^@:/.test(x) ? `${deviceId}${x.slice(1)}` : key === 'device' && x === '@' ? deviceId : x;
      if (Array.isArray(x)) return x.map(y => walk(y, ''));
      // A Flow input it reads is this device's (a per-device input's own value).
      if (x && typeof x === 'object' && typeof x.input === 'string' && !x.device) return { ...Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y, k)])), device: deviceId };
      if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y, k)]));
      return x;
    };
    const copy = walk(part, '');
    const rename = (p) => { p.id = `${prefix}/${p.id}`; p.device = deviceId; for (const k of p.parts || []) rename(k); };
    rename(copy);
    return copy;
  }
  window.customBindPart = bindPart;

  function icon(id, cls) {
    const ic = id && K.icons[id];
    return ic ? K.svgIcon(ic, cls) : null;
  }

  /**
   * A line through the points (`[t, v]`), filled under it, scaled to the box (between `lo` and `hi` where given):
   * Sparklines' line and area, smoothed as theirs with `smooth`.
   */
  function sparkline(points, parent, min, max, smooth) {
    const svg = el('svg', { class: 'wb-spark', viewBox: '0 0 100 40', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, parent, SVG_NS);
    const pts = (points || []).filter(p => Array.isArray(p) && Number.isFinite(p[1]));
    if (pts.length < 2) return svg;
    const [t0, t1] = [pts[0][0], pts[pts.length - 1][0]];
    const vs = smooth ? K.smoothValues(pts.map(p => p[1])) : pts.map(p => p[1]);
    let [lo, hi] = [min != null ? min : Math.min(...vs), max != null ? max : Math.max(...vs)];
    if (hi < lo) [lo, hi] = [hi, lo];
    const y = v => 37 - (Math.min(1, Math.max(0, (v - lo) / ((hi - lo) || 1)))) * 30;
    const xy = pts.map(([t], i) => [((t - t0) / ((t1 - t0) || 1)) * 100, y(vs[i])]);
    const d = `M${xy.map(p => p.map(n => n.toFixed(2)).join(',')).join(' L')}`;
    el('path', { class: 'wb-spark-area', d: `${d} L100,40 L0,40 Z` }, svg, SVG_NS);
    el('path', { class: 'wb-spark-line', d, 'vector-effect': 'non-scaling-stroke' }, svg, SVG_NS);
    return svg;
  }

  /**
   * The level a value is at (Chart · Gauge's `zoneOf()`): `rising`, higher is worse; `falling`, lower is worse: green,
   * yellow from `yellowAt`, red from `redAt`; null without zones.
   */
  function zoneOf(v, part) {
    if (!Number.isFinite(v)) return null;
    if (part.zones === 'rising') return v >= part.redAt ? 'red' : v >= part.yellowAt ? 'yellow' : 'green';
    if (part.zones === 'falling') return v <= part.redAt ? 'red' : v <= part.yellowAt ? 'yellow' : 'green';
    return null;
  }
  /** The stretches of a scale `lo` … `hi` by level, as fractions: `[[from, to, level]]` (Chart · Gauge's zones). */
  function zoneCuts(part, lo, hi) {
    const frac = v => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    const cuts = [lo, hi, part.yellowAt, part.redAt].filter(v => Number.isFinite(v) && v >= lo && v <= hi).sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < cuts.length - 1; i++) if (cuts[i + 1] > cuts[i]) out.push([frac(cuts[i]), frac(cuts[i + 1]), zoneOf((cuts[i] + cuts[i + 1]) / 2, part)]);
    return out;
  }

  /**
   * Chart · Gauge's dial: a 240° arc (120° each way from the top) as thick as `width` px, its track (or with zones a
   * stretch per level), the span's range inside it, and the value from the scale's start with its knob, in its level's
   * colour with zones. Fractions of the scale; the strokes keep their px at any size.
   */
  function gaugeArc(parent, { frac, width = 12, zones = null, level = null, range = null }) {
    const svg = el('svg', { class: 'wb-arc', viewBox: '0 0 100 76', 'aria-hidden': 'true' }, parent, SVG_NS);
    const r = 38; const cx = 50; const cy = 46;
    const deg = f => (-120 + 240 * f) * Math.PI / 180;
    const pt = (f, rr = r) => [cx + rr * Math.sin(deg(f)), cy - rr * Math.cos(deg(f))];
    const path = (a, b, rr = r) => {
      const [x0, y0] = pt(a, rr); const [x1, y1] = pt(b, rr);
      return `M${x0.toFixed(2)},${y0.toFixed(2)} A${rr},${rr} 0 ${(b - a) * 240 > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
    };
    const stroke = (a, b, cls, w, rr) => {
      const n = el('path', { class: cls, d: path(a, b, rr), 'vector-effect': 'non-scaling-stroke' }, svg, SVG_NS);
      n.style.strokeWidth = `${w}px`;
      return n;
    };
    // A dot of `w` px at `f`: a stroke of no length with round ends, so it keeps its px too.
    const dot = (f, cls, w) => {
      const [x, y] = pt(f);
      const n = el('path', { class: cls, d: `M${x.toFixed(2)},${y.toFixed(2)} h0.001`, 'vector-effect': 'non-scaling-stroke' }, svg, SVG_NS);
      n.style.strokeWidth = `${w}px`;
    };
    if (!zones || !zones.length) stroke(0, 1, 'wb-arc-track', width);
    else {
      for (const [a, b, lv] of zones) stroke(a, b, `wb-arc-zone ${lv}`, width);
      dot(0, `wb-arc-cap ${zones[0][2]}`, width);
      dot(1, `wb-arc-cap ${zones[zones.length - 1][2]}`, width);
    }
    if (range) stroke(range[0], Math.max(range[1], range[0] + 0.006), 'wb-arc-range', 4, r - 13);
    if (frac !== null && frac !== undefined && Number.isFinite(frac)) {
      const f = Math.min(1, Math.max(0, frac));
      stroke(0, Math.max(f, 0.002), `wb-arc-fill${level ? ` ${level}` : ''}`, width);
      // The knob: Chart · Gauge's ring (3 px, in the value's colour) round the card's colour.
      dot(f, `wb-arc-knob${level ? ` ${level}` : ''}`, width + 7);
      dot(f, 'wb-arc-knob-in', width + 1);
    }
    return svg;
  }

  const SERIES_COLORS = ['blue', 'green', 'orange'];
  let svgIds = 0;
  /**
   * A Chart's plot, as Chart · Basic draws it: each series' points (`[t, v]`) as an area (its line over a fading fill),
   * a line, or bars (up to 24 per series, each the average of its time), between `lo` and `hi` over `t0` … `t1`, the
   * lines smoothed with `smooth`, below zero in yellow with `negative`. In a 100 × 100 box drawn to its size
   * (`preserveAspectRatio: none`), the lines kept 2 px.
   */
  function chartPlot(list, parent, { lo, hi, t0, t1, style, smooth, negative }) {
    const svg = el('svg', { class: 'wb-chart-svg', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, parent, SVG_NS);
    const defs = el('defs', null, svg, SVG_NS);
    for (const f of [0, 0.5, 1]) el('path', { class: 'wb-chart-grid', d: `M0,${(f * 100).toFixed(2)} L100,${(f * 100).toFixed(2)}`, 'vector-effect': 'non-scaling-stroke' }, svg, SVG_NS);
    const y = v => 100 - Math.min(1, Math.max(0, (v - lo) / ((hi - lo) || 1))) * 100;
    const x = t => ((t - t0) / ((t1 - t0) || 1)) * 100;
    const zeroY = y(Math.max(lo, Math.min(hi, 0)));
    // Below zero yellow: each series drawn twice, clipped above and below the zero line (chart.js' `exportSplit()`).
    const split = negative && lo < 0 && hi > 0;
    const clip = (top, h) => {
      const id = `wbc${++svgIds}`;
      el('rect', { x: -10, y: top.toFixed(2), width: 120, height: Math.max(0, h).toFixed(2) }, el('clipPath', { id }, defs, SVG_NS), SVG_NS);
      return `url(#${id})`;
    };
    const sides = split ? [[clip(-10, zeroY + 10), false], [clip(zeroY, 120), true]] : [[null, false]];
    const gradient = (css, below) => {
      const id = `wbg${++svgIds}`;
      const g = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs, SVG_NS);
      // Chart · Basic's area: 45 % at the line, nothing at the base (below zero the other way round).
      for (const [offset, top] of [[0, true], [1, false]]) {
        const stop = el('stop', { class: `wb-chart-stop${top === !below ? ' strong' : ''}`, offset }, g, SVG_NS);
        stop.style.stopColor = below ? 'var(--wb-export)' : css;
      }
      return `url(#${id})`;
    };
    if (style === 'bars') {
      const n = 24;
      const width = 100 / n;
      list.forEach((s, k) => {
        const sums = new Array(n).fill(0);
        const counts = new Array(n).fill(0);
        for (const [t, v] of s.points) {
          const i = Math.min(n - 1, Math.max(0, Math.floor(((t - t0) / ((t1 - t0) || 1)) * n)));
          sums[i] += v; counts[i]++;
        }
        const w = (width * 0.8) / list.length;
        for (let i = 0; i < n; i++) {
          if (!counts[i]) continue;
          const v = sums[i] / counts[i];
          const top = y(v);
          const r = el('rect', { class: `wb-chart-bar${negative && v < 0 ? ' export' : ''}`, x: (i * width + width * 0.1 + k * w).toFixed(2), width: w.toFixed(2), y: Math.min(top, zeroY).toFixed(2), height: Math.max(0.5, Math.abs(zeroY - top)).toFixed(2) }, svg, SVG_NS);
          r.style.setProperty('--wb-series', s.css);
        }
      });
      return svg;
    }
    list.forEach((s) => {
      if (s.points.length < 2) return;
      const vs = smooth ? K.smoothValues(s.points.map(p => p[1])) : s.points.map(p => p[1]);
      const xy = s.points.map(([t], i) => `${x(t).toFixed(2)},${y(vs[i]).toFixed(2)}`);
      const d = `M${xy.join(' L')}`;
      for (const [clipPath, below] of sides) {
        if (style !== 'line') {
          const base = split ? zeroY : 100;
          const area = el('path', { class: 'wb-chart-area', d: `${d} L${x(s.points[s.points.length - 1][0]).toFixed(2)},${base.toFixed(2)} L${x(s.points[0][0]).toFixed(2)},${base.toFixed(2)} Z` }, svg, SVG_NS);
          area.setAttribute('fill', gradient(s.css, below));
          if (clipPath) area.setAttribute('clip-path', clipPath);
        }
        const line = el('path', { class: `wb-chart-line${below ? ' export' : ''}`, d, 'vector-effect': 'non-scaling-stroke' }, svg, SVG_NS);
        line.style.setProperty('--wb-series', s.css);
        if (clipPath) line.setAttribute('clip-path', clipPath);
      }
    });
    return svg;
  }

  /**
   * @param {HTMLElement} root
   * @param {any} opts
   */
  window.createCustomWidget = function (root, opts) {
    const t = K.translator('custom', DEFAULT_STRINGS, opts);
    K.applyColors(root, { style: opts.colorStyle });
    root.classList.add('wb');
    root.classList.toggle('wb-preview', !!opts.preview);
    const guard = K.touchGuard();
    const report = K.heightReporter(root, opts);
    const drags = new Map();
    /** partId → {value, until}: a value just sent, shown over the reported one. */
    const hoped = new Map();
    /** partId → {value, timer}: a stepper's burst of taps, not sent yet. */
    const pending = new Map();
    let state = null;
    let builtFor = null; // the design object the parts were built from
    let views = []; // {part, node, update}
    let message = null;
    /** The design's calculated values by id (`{part}` sources), and its formulas once parsed. */
    let calcs = new Map();
    /** The design's widget states, repeaters (for `{part}` sources), and each state's value now. */
    let states = new Map();
    let repeaters = new Map();
    const stateValues = new Map();
    /** What each state started as when its value was read: a changed *Starts on* (in the builder) reads it again. */
    const stateStarts = new Map();
    /** A pages container's page now (by id), and the builder's pick of the page it's editing. */
    const pageNow = new Map();
    /** The page a Flow input last said, per pages container: a new one turns the page. */
    const flowPage = new Map();
    const forcedPage = new Map();
    /** Images' refresh timers, stopped when the parts are built again. */
    let imageTimers = [];
    const formulas = new Map();
    let ticker = null;

    const grid = el('div', { class: 'wb-grid' }, root);
    const note = el('div', { class: 'wb-message', role: 'status', hidden: '' }, root);
    const msg = K.messageLine(() => {
      note.hidden = !msg.text;
      note.textContent = msg.text || '';
      report();
    });

    // ------------------------------------------------------------ values

    function slotEntry(part) {
      return part.slot && state && state.values ? state.values[part.slot] : null;
    }
    function variableEntry(part) {
      return part.variable && state && state.variables ? state.variables[part.variable] : null;
    }
    /**
     * A Flow input's value now (`{value, units}`): a per-device input's for `device` (a Repeater's copy's, else the
     * widget's), else the shared one; null without one, or once it has gone back.
     */
    function inputNow(id, device) {
      const e = state && state.inputs && state.inputs[id];
      if (!e) return null;
      const live = v => (v && (!v.expires || v.expires > Date.now()) ? v : null);
      const dev = device || state.device;
      return (e.perDevice && dev && e.devices && live(e.devices[dev])) || live(e.all) || null;
    }
    /** An input's value for a binding, if it's of a type the setting takes (lib/customDesigns.ts' `BIND_TYPES`). */
    function bound(part, prop, types) {
      const id = part.bind && part.bind[prop];
      const e = id && state && state.inputs && state.inputs[id];
      if (!e || !types.includes(e.type)) return null;
      const v = inputNow(id, part.device);
      return v ? { ...v, type: e.type } : null;
    }
    /**
     * What a part's Flow inputs give it now, in the shape its makers read: `text` (a name or label), `value`/`units` (a
     * Text's number), `color`, `ink`, `fill`, `icon`, `hidden`, `page`; null when none has a value.
     */
    function flowOf(part) {
      if (!part.bind) return null;
      const out = {};
      const text = bound(part, 'text', ['text', 'number']);
      if (text && text.type === 'number' && part.kind === 'text') { out.value = text.value; if (text.units) out.units = text.units; }
      else if (text && text.type === 'number') out.text = K.formatValue({ units: text.units || null, decimals: 2 }, text.value);
      else if (text && String(text.value)) out.text = String(text.value);
      const colorIn = bound(part, 'color', ['color']);
      if (colorIn) out.color = colorIn.value;
      const ink = bound(part, 'textColor', ['color']);
      if (ink) out.ink = ink.value;
      const fill = bound(part, 'fill', ['color']);
      if (fill) out.fill = fill.value;
      const ic = bound(part, 'icon', ['icon']);
      if (ic) out.icon = ic.value;
      const shown = bound(part, 'shown', ['yesno']);
      if (shown) out.hidden = shown.value === false;
      const page = bound(part, 'page', ['number', 'text']);
      if (page) out.page = page.value;
      return Object.keys(out).length ? out : null;
    }
    /** A source's value now (`{value, cap, name, offline, missing, updatedAt}`), or null when it isn't read. */
    function sourceEntry(src) {
      if (!src || !state) return null;
      if (src.slot) {
        const s = state.values && state.values[src.slot];
        if (!s) return null;
        if (s.missing) return { missing: true };
        return { value: s.value, cap: { ...(s.capability || {}), capabilityId: s.capabilityId }, name: s.name, room: s.room, offline: !!s.offline, updatedAt: s.updatedAt };
      }
      if (src.variable) {
        const v = state.variables && state.variables[src.variable];
        if (!v) return null;
        if (v.missing) return { missing: true };
        return { value: v.value, cap: { type: v.type, units: null, decimals: 2 }, name: v.name };
      }
      if (src.input) {
        const e = state.inputs && state.inputs[src.input];
        if (!e) return null;
        const v = inputNow(src.input, src.device);
        const cap = e.type === 'number' ? { type: 'number', units: (v && v.units) || null, decimals: 2 } : e.type === 'yesno' ? { type: 'boolean' } : { type: 'string' };
        return { value: v ? v.value : null, cap, name: e.name, updatedAt: v ? v.at : undefined };
      }
      if (src.part) {
        const c = calcs.get(src.part);
        if (c) return calcValue(c);
        const st = states.get(src.part);
        if (st) return stateEntry(st);
        const rp = repeaters.get(src.part);
        if (rp) return { value: repeatItems(rp).length, cap: { type: 'number', units: null, decimals: 0 }, name: rp.name };
        return null;
      }
      return null;
    }
    const valueOf = (src) => { const e = sourceEntry(src); return e && !e.missing ? e.value : undefined; };

    /** A number for a calculation: a boolean as 1/0, a number, else null; an unavailable device's is null too. */
    function inputNumber(e) {
      if (!e || e.missing || e.offline) return null;
      if (typeof e.value === 'boolean') return e.value ? 1 : 0;
      const n = typeof e.value === 'number' ? e.value : typeof e.value === 'string' && e.value.trim() ? Number(e.value) : NaN;
      return Number.isFinite(n) ? n : null;
    }

    /**
     * A calculated value: its inputs summed, averaged, their median, the lowest or highest (with that input's name), the first less
     * the second, counted by a test, or put through a formula. Units are the part's, else its first input's (none for a
     * count). Unknown (`value: null`) when nothing can be counted in, or for a difference or formula, when an input is.
     */
    function calcValue(part) {
      const entries = (part.inputs || []).map(sourceEntry);
      const nums = entries.map(inputNumber);
      const known = nums.filter(n => n !== null);
      const first = entries.find(e => e && !e.missing && e.cap);
      const op = part.op || 'sum';
      let value = null;
      let winner = '';
      if (op === 'count') {
        value = entries.filter(e => e && !e.missing && !e.offline && ruleHolds(part.test || { op: 'is', value: 'on' }, e.value)).length;
      } else if (op === 'sum') {
        value = known.length ? known.reduce((a, n) => a + n, 0) : null;
      } else if (op === 'avg') {
        value = known.length ? known.reduce((a, n) => a + n, 0) / known.length : null;
      } else if (op === 'median') {
        // Combined Value's: the middle one, or the two middle ones' average for an even count.
        const sorted = [...known].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        value = !sorted.length ? null : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      } else if (op === 'min' || op === 'max') {
        let at = -1;
        nums.forEach((n, i) => { if (n !== null && (at < 0 || (op === 'min' ? n < nums[at] : n > nums[at]))) at = i; });
        if (at >= 0) { value = nums[at]; winner = (entries[at] && entries[at].name) || ''; }
      } else if (op === 'diff') {
        value = nums[0] != null && nums[1] != null ? nums[0] - nums[1] : null;
      } else if (op === 'change') {
        // Trend's: now less where its history over `span` began, or that as a percentage of it.
        const slot = part.inputs && part.inputs[0] && part.inputs[0].slot;
        const pts = (slot && state && state.histories && state.histories[`${part.span}\n${slot}`]) || [];
        const start = pts.find(p => Array.isArray(p) && Number.isFinite(p[1]));
        if (start && nums[0] !== null) {
          const d = nums[0] - start[1];
          value = part.percent ? (start[1] ? (d / Math.abs(start[1])) * 100 : null) : d;
        }
      } else if (op === 'since') {
        // Minutes since its first input last changed.
        const at = entries[0] && !entries[0].missing ? entries[0].updatedAt : null;
        value = at ? Math.max(0, Math.floor((Date.now() - at) / 60e3)) : null;
      } else if (op === 'formula') {
        if (!formulas.has(part.formula)) formulas.set(part.formula, parseFormula(part.formula));
        const fn = formulas.get(part.formula);
        const vars = {};
        nums.forEach((n, i) => { if (n !== null) vars['abcdefghijkl'[i]] = n; });
        const r = fn ? fn(vars) : NaN;
        value = Number.isFinite(r) ? r : null;
      }
      const own = op === 'count' || op === 'since';
      const units = part.units || (op === 'change' && part.percent ? '%' : own || !first || !first.cap ? null : first.cap.units || null);
      const decimals = part.decimals != null ? part.decimals : own || (op === 'change' && part.percent) ? 0 : first && first.cap && first.cap.decimals != null ? first.cap.decimals : 1;
      // `name`: a min's or max's input, for a text's name of it.
      return { value, cap: { type: 'number', units, decimals }, name: winner };
    }

    /** The next `HH:mm` from now, today or tomorrow. */
    function nextAt(hhmm, now) {
      const [h, m] = String(hhmm || '').split(':').map(Number);
      const d = new Date(now);
      d.setHours(h || 0, m || 0, 0, 0);
      if (d.getTime() <= now) d.setDate(d.getDate() + 1);
      return d.getTime();
    }

    // ------------------------------------------------------------ widget states

    const stateKey = part => (opts.storeKey ? `widgetkeeper.custom.${opts.storeKey}.${part.id}` : '');
    /** A widget state's value: set on this screen (kept for its next load), else what it starts as. */
    function stateValue(part) {
      if (stateStarts.has(part.id) && stateStarts.get(part.id) !== part.initial) stateValues.delete(part.id);
      stateStarts.set(part.id, part.initial);
      if (stateValues.has(part.id)) return stateValues.get(part.id);
      let v = part.initial;
      try {
        const key = stateKey(part);
        const kept = key && window.localStorage ? window.localStorage.getItem(key) : null;
        if (kept !== null && kept !== undefined) v = kept;
      } catch (e) { /* this page only */ }
      if (part.stateType === 'choice' && !(part.choices || []).some(c => c.value === v)) v = part.choices && part.choices[0] ? part.choices[0].value : '';
      const value = part.stateType === 'choice' ? v : v === 'true';
      stateValues.set(part.id, value);
      return value;
    }
    function stateEntry(part) {
      const values = (part.choices || []).map(c => ({ id: c.value, title: c.label }));
      return { value: stateValue(part), cap: part.stateType === 'choice' ? { type: 'enum', values } : { type: 'boolean' }, name: part.name };
    }
    /** Sets a widget state (a typed `toggle`, on/off or a choice's value), keeps it, and draws everything again. */
    function setStateValue(part, text) {
      let v = text;
      if (part.stateType !== 'choice') {
        const l = String(text).trim().toLowerCase();
        v = l === 'toggle' ? stateValue(part) !== true : ['on', 'yes', 'true', '1', 'open'].includes(l) || text === true;
      } else if (!(part.choices || []).some(c => c.value === v)) return;
      stateValues.set(part.id, v);
      try {
        const key = stateKey(part);
        if (key && window.localStorage) window.localStorage.setItem(key, String(v));
      } catch (e) { /* this page only */ }
      update();
    }

    // ------------------------------------------------------------ repeaters

    /**
     * A repeater's devices now: its candidates whose value holds its test (all without one), by name (as the app sends
     * them) or by value, lowest or highest first (a yes/no as 1/0; one without a number last), at most its limit or 24.
     */
    function repeatItems(part) {
      const slots = (state && state.repeats && state.repeats[part.id]) || [];
      let out = [];
      for (const slot of slots) {
        const e = sourceEntry({ slot });
        if (!e || e.missing) continue;
        if (part.test && !ruleHolds(part.test, e.value)) continue;
        out.push({ slot, ...e });
      }
      if (part.sort === 'up' || part.sort === 'down') {
        const key = (x) => { const n = inputNumber({ value: x.value }); return n === null ? null : n; };
        out = out.map((x, i) => ({ x, i, k: key(x) })).sort((a, b) => {
          if (a.k === null || b.k === null) return Number(a.k === null) - Number(b.k === null) || a.i - b.i;
          return (part.sort === 'up' ? a.k - b.k : b.k - a.k) || a.i - b.i;
        }).map(y => y.x);
      }
      return out.slice(0, Math.min(24, part.limit || 24));
    }

    // ------------------------------------------------------------ segments and trends

    const SEGMENT_COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'pink'];
    /** A segmented bar's segments now (a negative or unknown value counts as 0) and their sum, its value. */
    function segmentsValue(part) {
      const segs = (part.segments || []).map((x, i) => {
        const e = sourceEntry(x.src);
        const n = inputNumber(e);
        return { ...x, entry: e, n: n !== null && n > 0 ? n : 0, color: x.color || SEGMENT_COLORS[i % SEGMENT_COLORS.length] };
      });
      const sum = segs.reduce((a, x) => a + x.n, 0);
      const first = segs.find(x => x.entry && x.entry.cap && x.entry.cap.units);
      const units = part.units || (first ? first.entry.cap.units : null);
      const decimals = first && first.entry.cap.decimals != null ? first.entry.cap.decimals : 0;
      return { value: segs.length ? sum : null, cap: { type: 'number', units, decimals }, segs };
    }

    /** The part's value: hoped for, else reported; `cap` describes it (a variable's is made up). */
    function current(part) {
      if (part.kind === 'calc') return calcValue(part);
      if ((part.kind === 'arc' || part.kind === 'bar') && part.src) return sourceEntry(part.src);
      if (part.kind === 'state') return stateEntry(part);
      if (part.kind === 'ring') return (part.rings && part.rings[0] && sourceEntry(part.rings[0].src)) || null;
      if (part.kind === 'repeat') return { value: repeatItems(part).length, cap: { type: 'number', decimals: 0 } };
      if (part.kind === 'segments') return segmentsValue(part);

      const h = hoped.get(part.id);
      const p = pending.get(part.id);
      const s = slotEntry(part);
      if (s) {
        if (s.missing) return { missing: true };
        const value = p ? p.value : h && Date.now() < h.until ? h.value : s.value;
        return { value, cap: s.capability || {}, name: s.name, offline: !!s.offline };
      }
      const v = variableEntry(part);
      if (v) {
        if (v.missing) return { missing: true };
        const value = p ? p.value : h && Date.now() < h.until ? h.value : v.value;
        // A variable has no units or decimals of its own: the part's, else two decimals.
        return { value, cap: { type: v.type, units: part.units || null, decimals: part.decimals != null ? part.decimals : 2 }, name: v.name };
      }
      return null;
    }
    /** A value as text: a sensor's yes/no in its own words (Value Board's: open/closed, motion, alarm), else the kit's. */
    const fmt = (cap, value) => {
      if (typeof value === 'boolean' && cap && cap.capabilityId) {
        const base = String(cap.capabilityId).split('.')[0];
        if (base === 'alarm_contact') return t(value ? 'open' : 'closed');
        if (base === 'alarm_motion') return t(value ? 'motion' : 'noMotion');
        if (base.startsWith('alarm_')) return t(value ? 'alarm' : 'ok');
      }
      return K.formatValue(cap || {}, value, k => t(k));
    };
    const language = () => (state && state.language) || (typeof navigator !== 'undefined' && navigator.language) || 'en';

    /** `4 min ago`, `in 2 hr.`, `now` in Homey's language (Intl's own words: no strings of ours). */
    function relative(at, now) {
      const diff = at - now;
      const abs = Math.abs(diff);
      let rtf;
      try { rtf = new Intl.RelativeTimeFormat(language(), { numeric: 'auto', style: 'short' }); } catch (e) { rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' }); }
      const whole = x => (diff < 0 ? -Math.floor(x) : Math.ceil(x));
      if (abs < 60e3) return rtf.format(0, 'second');
      if (abs < 120 * 60e3) return rtf.format(whole(abs / 60e3), 'minute');
      if (abs < 48 * 3600e3) return rtf.format(whole(abs / 3600e3), 'hour');
      return rtf.format(whole(abs / 86400e3), 'day');
    }
    function dateText(ms, style) {
      /** @type {Intl.DateTimeFormatOptions} */
      const o = style === 'weekday' ? { weekday: 'long' } : style === 'short' ? { day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' };
      try { return new Date(ms).toLocaleDateString(language(), o); } catch (e) { return new Date(ms).toLocaleDateString('en', o); }
    }
    /** A text's `{n}`: its value as Device Values would show it, or the time, date or weekday; `–` when there's none. */
    function refText(ref) {
      if (!ref) return '–';
      if (ref.time === 'clock') return K.clockTime(Date.now());
      if (ref.time === 'seconds') return K.clockTime(Date.now(), { seconds: true });
      if (ref.until) return relative(nextAt(ref.until, Date.now()), Date.now());
      if (ref.since) {
        // A device value's last change, or when a Flow input was last set.
        const s = sourceEntry(typeof ref.since === 'string' ? { slot: ref.since } : ref.since);
        return s && !s.missing && s.updatedAt ? relative(s.updatedAt, Date.now()) : '–';
      }
      if (ref.time === 'date') return dateText(Date.now(), 'long');
      if (ref.time === 'weekday') return dateText(Date.now(), 'weekday');
      const e = sourceEntry(ref);
      if (ref.show === 'name') return (e && e.name) || '–';
      if (ref.show === 'room') return (e && e.room) || '–';
      if (!e || e.missing || e.value === null || e.value === undefined) return '–';
      // A change (Trend's) shows its sign.
      // Its own decimals, and without its units where it says so.
      const cap = ref.decimals != null || ref.plain ? { ...(e.cap || {}), ...(ref.decimals != null ? { decimals: ref.decimals } : {}), ...(ref.plain ? { units: null } : {}) } : e.cap;
      const calc = ref.part && calcs.get(ref.part);
      if (calc && calc.op === 'change' && typeof e.value === 'number' && e.value > 0) return `+${fmt(cap, e.value)}`;
      return fmt(cap, e.value);
    }
    /**
     * A text with its values filled in, as pieces: text, and with `big` each value's number and units apart
     * (`{num, unit, tight}`), so its units are drawn smaller (Chart · Gauge's).
     */
    function fillPieces(text, refs, big) {
      if (!refs || !refs.length) return [String(text)];
      const out = [];
      let at = 0;
      String(text).replace(/\{([1-6])\}/g, (m, n, i) => {
        if (Number(n) > refs.length) return m;
        out.push(String(text).slice(at, i));
        at = i + m.length;
        const ref = refs[Number(n) - 1];
        const e = big && ref && !ref.show && !ref.plain && !ref.time && !ref.since && !ref.until ? sourceEntry(ref) : null;
        const units = e && !e.missing && typeof e.value === 'number' && e.cap && e.cap.units;
        if (units) {
          const cap = { ...e.cap, units: null, ...(ref.decimals != null ? { decimals: ref.decimals } : {}) };
          const calc = ref.part && calcs.get(ref.part);
          const num = fmt(cap, e.value);
          out.push({ num: calc && calc.op === 'change' && e.value > 0 ? `+${num}` : num, unit: units, tight: K.TIGHT_UNITS.test(units) });
        } else out.push(refText(ref));
        return m;
      });
      out.push(String(text).slice(at));
      return out.filter(x => x !== '');
    }
    /** Notes' scrolling text: moved to its end and back where it's longer than its box, with a pause at each end. */
    function scrollText(wrap, txt) {
      wrap.classList.remove('scrolling');
      txt.style.removeProperty('--wb-shift');
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const over = txt.scrollWidth - wrap.clientWidth;
      if (!(over > 2)) return;
      txt.style.setProperty('--wb-shift', `${-over}px`);
      txt.style.setProperty('--wb-scroll-s', `${Math.max(4, (over / 40) / 0.7).toFixed(1)}s`);
      wrap.classList.add('scrolling');
    }
    /** The part's range: its own min/max, else the capability's, else 0–100. */
    function range(part, cap) {
      const lo = part.min != null ? part.min : cap && cap.min != null ? cap.min : 0;
      const hi = part.max != null ? part.max : cap && cap.max != null ? cap.max : 100;
      return hi > lo ? [lo, hi] : [lo, lo + 1];
    }
    /** An arc's or bar's lowest and highest over its `rangeSpan` (its device value's history), scaled as its value. */
    function spanRange(part, cap) {
      if (!part.rangeSpan || !part.src || !part.src.slot) return null;
      const pts = ((state && state.histories && state.histories[`${part.rangeSpan}\n${part.src.slot}`]) || []).filter(p => Array.isArray(p) && Number.isFinite(p[1]));
      if (!pts.length) return null;
      const vs = pts.map(p => Number(K.scaled(cap || {}, p[1]))).filter(Number.isFinite);
      return vs.length ? [Math.min(...vs), Math.max(...vs)] : null;
    }
    function hope(part, value) {
      hoped.set(part.id, { value, until: Date.now() + HOPE_MS });
      setTimeout(update, HOPE_MS + 50);
    }

    // ------------------------------------------------------------ acting

    async function act(part, node, value, slot) {
      if (!opts.onSet) return;
      const before = hoped.get(part.id);
      if (value !== undefined && !slot) { hope(part, value); update(); }
      try {
        await (slot ? opts.onSet(part, value, slot) : opts.onSet(part, value)); // a repeater names its device
        if (opts.onHaptic) opts.onHaptic();
      } catch (err) {
        console.error(err);
        if (before) hoped.set(part.id, before); else hoped.delete(part.id);
        update();
        K.shake(node);
        msg.set(err && K.KEY_PROBLEMS.includes(err.reason) ? t(err.reason) : t('setFailed', { name: nameOf(part) }), true);
      }
    }
    function nameOf(part) {
      if (part.name) return part.name;
      const c = current(part);
      return (c && c.name) || '';
    }

    // ------------------------------------------------------------ parts

    /** Puts a part where it goes: grid cells at the top, the fine grid or per cent in a container. */
    function place(node, part, where) {
      const a = part.at || { x: 0, y: 0, w: 1, h: 1 };
      if (where === 'item') return; // a Repeater's copy fills its own cell
      if (where === 'free') {
        Object.assign(node.style, { left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` });
      } else {
        node.style.gridColumn = `${a.x + 1} / span ${a.w}`;
        node.style.gridRow = `${a.y + 1} / span ${a.h}`;
      }
    }

    /**
     * Whether a part is tall enough for a big value and wide enough for a name beside its value: two rows of the
     * widget's grid (in a container 10 fine rows, or 40 %), one of its four columns (3 of 12, or 25 %).
     */
    function sizeOf(part, where) {
      const a = part.at || { w: 1, h: 1 };
      // `wide`: room for a list beside a donut (three columns, 8 of 12, 60 %).
      if (where === 'free') return { big: a.h >= 40, narrow: a.w <= 25, wide: a.w >= 60 };
      if (where === 'grid') return { big: a.h >= 10, narrow: a.w <= 3, wide: a.w >= 8 };
      if (where === 'item') return { big: a.h >= 2, narrow: false, wide: a.w >= 3 };
      return { big: a.h >= 2, narrow: a.w === 1, wide: a.w >= 3 };
    }

    function build(part, where) {
      const node = el('div', { class: `wb-part wb-k-${part.kind}`, 'data-part': part.id });
      // Its background (lib/customDesigns.ts' `style`): the native tile, a plain pill, or none.
      const style = styleOf(part);
      node.classList.add(style === 'none' ? 'wb-bare' : style === 'postit' ? 'wb-postit' : 'wb-tile');
      if (style === 'pill') node.classList.add('wb-pill');
      // Its text's colour (a rule's Vivid tint still puts its own text colour on it); a Flow input's over it, on update.
      const ink = (c) => {
        node.classList.toggle('wb-has-ink', !!cssColor(c));
        if (cssColor(c)) node.style.setProperty('--wb-ink', cssColor(c));
        else node.style.removeProperty('--wb-ink');
      };
      ink(part.textColor);
      place(node, part, where);
      for (const e of part.hide || []) node.classList.add(`wb-no-${e}`);
      const make = MAKERS[part.kind] || MAKERS.text;
      const updatePart = make(part, node, sizeOf(part, where));
      // Any component that isn't a control can act when tapped, as a button does.
      if (part.kind !== 'button' && (part.actions || []).length) {
        node.setAttribute('role', 'button');
        node.tabIndex = 0;
        node.classList.add('wb-tappable');
        wirePress(part, node, null);
      }
      const view = { part, node, update: () => {
        const c = current(part);
        const flow = flowOf(part);
        const value = c ? c.value : undefined;
        const look = lookOf(part, value, flow, valueOf);
        if (part.bind && part.bind.textColor) ink((flow && flow.ink) || part.textColor);
        // A calculated value only for text and rules: not drawn on a dashboard, faint in the builder.
        const sourceOnly = part.kind === 'calc';
        if (sourceOnly && !opts.preview) look.hidden = true;
        node.classList.toggle('wb-source-only', sourceOnly);
        node.classList.toggle('wb-hidden', look.hidden);
        node.setAttribute('aria-hidden', look.hidden ? 'true' : 'false');
        applyColor(node, look.color);
        node.classList.toggle('wb-colored', look.tint);
        node.classList.toggle('wb-has-color', !!look.color);
        // A rule's icon, under a Flow's.
        const shownFlow = look.icon && !(flow && flow.icon) ? { ...(flow || {}), icon: look.icon } : flow;
        updatePart(c || {}, shownFlow, look);
        K.markOffline(node, c && (c.offline || c.missing), c && (c.offline || c.missing) ? t('unavailable') : undefined);
      } };
      views.push(view);
      return node;
    }

    function applyColor(node, color) {
      if (color && K.isCustomColor(color)) {
        node.removeAttribute('data-wk-color');
        node.style.setProperty('--wk-c', color);
        node.style.setProperty('--wk-on', K.customInk(color));
      } else {
        node.style.removeProperty('--wk-c');
        node.style.removeProperty('--wk-on');
        if (color && K.COLORS.includes(color)) node.dataset.wkColor = color;
        else node.removeAttribute('data-wk-color');
      }
    }

    /** An icon slot: the part's icon (or a Flow's), else the capability's glyph. */
    function iconSlot(parent) {
      const box = el('span', { class: 'wb-icon', 'aria-hidden': 'true' }, parent);
      let shown = null;
      return (part, c, flow) => {
        const id = (flow && flow.icon) || part.icon;
        // Its device's own icon (`deviceIcon`), where the app sent one: under a picked, rule's or Flow's icon, over the glyph.
        const own = !id && part.deviceIcon && part.slot ? deviceIconOf(part.slot) : null;
        const key = id ? `i:${id}` : own ? `d:${own}` : c && c.cap && part.slot ? `g:${part.slot}:${c.value === true}` : '';
        if (key === shown) return;
        shown = key;
        box.textContent = '';
        box.classList.remove('wb-glyph');
        box.style.removeProperty('--wb-mask');
        if (id && K.icons[id]) box.appendChild(icon(id, 'wb-svg'));
        else if (own) {
          box.classList.add('wb-glyph');
          K.setMask(box, own, '--wb-mask');
        } else if (part.slot && c && c.cap) {
          const glyph = c.cap.icon || K.valueGlyph(part.slot.slice(part.slot.indexOf(':') + 1), c.value);
          box.classList.add('wb-glyph');
          K.setMask(box, glyph, '--wb-mask');
        }
        box.hidden = !box.firstChild && !box.classList.contains('wb-glyph');
      };
    }

    /** A slot's device's own icon (a data URL), as `/state` sends them, or null. */
    function deviceIconOf(slot) {
      const id = String(slot).slice(0, String(slot).indexOf(':'));
      return (state && state.icons && state.icons[id]) || null;
    }

    function textOf(part, c, flow) {
      if (flow && flow.value !== undefined) {
        const v = flow.value;
        const units = flow.units != null ? flow.units : part.units;
        if (typeof v === 'number') return K.formatValue({ units: units || null, decimals: 2 }, v);
        return units ? `${v} ${units}` : String(v);
      }
      if (!c || c.missing) return '–';
      return fmt(c.cap, c.value);
    }

    /**
     * A button's or a tapped component's actions in order (the app runs device values, variables and Flows; the widget
     * the rest), else a button's Flow or the tap trigger.
     */
    async function runActions(part) {
      const actions = part.actions || [];
      if (actions.length) {
        for (const [i, a] of actions.entries()) {
          if (a.do === 'state') { const st = states.get(a.part); if (st) setStateValue(st, a.value); continue; }
          if (opts.preview) continue;
          if (a.do === 'dashboard') { if (opts.onOpen) opts.onOpen(a.dashboard); continue; }
          if (opts.onAction) await opts.onAction(part, i, a);
        }
        return;
      }
      if (opts.preview || !opts.onButton) return;
      await opts.onButton(part);
    }

    /** What a press says in a component's name while it waits (Flow Buttons' and Quick Actions' *Tap again* or *Hold*). */
    const said = node => (node.dataset.say ? t(node.dataset.say) : '');

    /**
     * Wires a press as Quick Actions' and Flow Buttons' *Activate with*: a tap; a second tap to confirm, the component
     * tinted red meanwhile and its name saying *Tap again*; or a hold, filling from the left while held (a tap says
     * *Hold*). A tap on a control inside it (a container's switch) is that control's, not this one's. `run`: a switch's
     * own press, which sends, shakes and vibrates itself.
     */
    function wirePress(part, node, run) {
      const actions = part.actions || [];
      let asking = null;
      let hinting = null;
      const say = (what) => {
        node.dataset.say = what || '';
        node.classList.toggle('confirm', what === 'tapAgain');
        update();
      };
      async function press() {
        if (run) { if (!opts.preview) run(); return; }
        if (node.classList.contains('running')) return;
        if (opts.preview && !actions.some(a => a.do === 'state')) return;
        node.classList.add('running');
        try {
          await runActions(part);
          if (opts.onHaptic) opts.onHaptic();
          node.classList.add('done');
          setTimeout(() => node.classList.remove('done'), 400);
        } catch (err) {
          console.error(err);
          K.shake(node);
          msg.set(err && K.KEY_PROBLEMS.includes(err.reason) ? t(err.reason) : t('setFailed', { name: part.name || '' }), true);
        } finally {
          node.classList.remove('running');
        }
      }
      const inner = (e) => {
        const target = e && e.target && e.target.closest ? e.target : null;
        if (!target) return false;
        const own = target.closest('.wb-part');
        return (own && own !== node && own.matches('[role="button"], [role="switch"], [role="slider"]')) || !!target.closest('button, input');
      };
      K.onTap(node, (e) => {
        if (inner(e)) return;
        if (part.press === 'long') {
          clearTimeout(hinting);
          say('hold');
          hinting = setTimeout(() => say(''), 1500);
          return;
        }
        if (part.press === 'confirm' && !asking) {
          say('tapAgain');
          asking = setTimeout(() => { asking = null; say(''); }, 3000);
          return;
        }
        clearTimeout(asking);
        asking = null;
        if (node.dataset.say) say('');
        press();
      }, {
        guard, keys: true,
        hold: part.press === 'long' ? {
          ms: 600, when: () => true,
          start: () => { clearTimeout(hinting); if (node.dataset.say) say(''); },
          act: () => press(),
          done: () => {},
        } : null,
      });
    }

    /**
     * − and + by `step` within the part's range, sent once 700 ms after the last tap (Variables'); `limits` dims the
     * buttons at the lowest or highest number.
     */
    function stepper(part, node, minus, plus, step) {
      const go = (dir) => {
        if (opts.preview) return;
        const c = current(part);
        const base = Number(c && c.value);
        if (!Number.isFinite(base)) return;
        const [lo, hi] = part.kind === 'variable' ? [part.min != null ? part.min : -Infinity, part.max != null ? part.max : Infinity] : range(part, c.cap);
        const s = step();
        const v = Number(Math.min(hi, Math.max(lo, Math.round((base + dir * s) / s) * s)).toFixed(4));
        if (v === base) return;
        const p = pending.get(part.id);
        if (p) clearTimeout(p.timer);
        const timer = setTimeout(() => { pending.delete(part.id); act(part, node, v); }, STEP_SEND_MS);
        pending.set(part.id, { value: v, timer });
        update();
      };
      K.onTap(minus, () => go(-1), { guard, keys: false, stop: true });
      K.onTap(plus, () => go(1), { guard, keys: false, stop: true });
      return (c) => {
        const v = Number(c && c.value);
        const [lo, hi] = part.kind === 'variable' ? [part.min, part.max] : range(part, c && c.cap);
        minus.classList.toggle('at-limit', Number.isFinite(v) && lo != null && v <= lo);
        plus.classList.toggle('at-limit', Number.isFinite(v) && hi != null && v >= hi);
      };
    }

    /** Presets' row of buttons, as many columns as choices. */
    function presetRow(part, node) {
      const row = el('div', { class: 'wb-presets', role: 'radiogroup' }, node);
      row.style.setProperty('--wb-count', String(Math.max(1, (part.choices || []).length)));
      return row;
    }

    const MAKERS = {
      switch(part, node) {
        // Quick Actions' tile (its *Lighter tile* when on, with `active`), with Variables' switch.
        if (part.active === 'lighter') node.classList.add('wb-lighter');
        const top = el('div', { class: 'wb-top' }, node);
        const ic = iconSlot(top);
        const tog = el('span', { class: 'wb-toggle', 'aria-hidden': 'true' }, top);
        const name = el('div', { class: 'wb-name' }, node);
        // A pill says On or Off under its name, as Quick Actions' pill, instead of the switch.
        const said2 = styleOf(part) === 'pill' ? el('div', { class: 'wb-value' }, node) : null;
        node.setAttribute('role', 'switch');
        node.tabIndex = 0;
        let on = false;
        // A second tap to confirm, or a hold, as a button's (a garage door, an alarm).
        if (part.press === 'confirm' || part.press === 'long') wirePress(part, node, () => act(part, node, !on));
        else K.onTap(node, () => { if (!opts.preview) act(part, node, !on); }, { guard });
        return (c, flow) => {
          on = c.value === true;
          ic(part, c, flow);
          // Waiting for the second tap, it isn't shown as on (Quick Actions').
          const shown = on && !node.classList.contains('confirm');
          node.classList.toggle('wb-on', shown);
          node.setAttribute('aria-checked', on ? 'true' : 'false');
          tog.classList.toggle('on', on);
          name.textContent = said(node) || (flow && flow.text) || part.name || c.name || '';
          if (said2) said2.textContent = c.value === true ? t('on') : c.value === false ? t('off') : '–';
        };
      },
      button(part, node, size) {
        // Flow Buttons' row: the round 32 px button in its colour with an 18 px icon (a play icon without one), then
        // the name; where it's narrow, only the button.
        const round = el('span', { class: 'wb-fbtn', 'aria-hidden': 'true' }, node);
        const ic = iconSlot(round);
        const name = el('div', { class: 'wb-name' }, node);
        if (size.narrow) node.classList.add('wb-narrow');
        node.setAttribute('role', 'button');
        node.tabIndex = 0;
        wirePress(part, node);
        return (c, flow) => {
          ic(part.icon || (flow && flow.icon) ? part : { ...part, icon: 'play' }, null, flow);
          const f = part.flowId && state.flows && state.flows[part.flowId];
          const label = (flow && flow.text) || part.name || (f && !f.missing ? f.name : '');
          name.textContent = said(node) || label;
          node.title = size.narrow ? label : '';
          node.setAttribute('aria-label', label);
        };
      },
      state(part, node, size) {
        if (part.stateType === 'choice') {
          if (size.big) node.classList.add('wb-presets-big');
          const name = el('div', { class: 'wb-name' }, node);
          const row = presetRow(part, node);
          const buttons = (part.choices || []).map((ch) => {
            const b = el('button', { type: 'button', class: 'wb-preset', role: 'radio', text: ch.label }, row);
            K.onTap(b, () => { setStateValue(part, ch.value); if (opts.onHaptic) opts.onHaptic(); }, { guard, keys: false, stop: true });
            return { b, ch };
          });
          return (c, flow) => {
            for (const { b, ch } of buttons) {
              b.classList.toggle('active', ch.value === c.value);
              b.setAttribute('aria-checked', ch.value === c.value ? 'true' : 'false');
            }
            name.textContent = (flow && flow.text) || part.name || '';
            name.hidden = !name.textContent;
          };
        }
        const top = el('div', { class: 'wb-top' }, node);
        const ic = iconSlot(top);
        const tog = el('span', { class: 'wb-toggle', 'aria-hidden': 'true' }, top);
        const name = el('div', { class: 'wb-name' }, node);
        node.setAttribute('role', 'switch');
        node.tabIndex = 0;
        K.onTap(node, () => { setStateValue(part, 'toggle'); if (opts.onHaptic) opts.onHaptic(); }, { guard });
        return (c, flow) => {
          const on = c.value === true;
          ic(part, null, flow);
          node.classList.toggle('wb-on', on);
          node.setAttribute('aria-checked', on ? 'true' : 'false');
          tog.classList.toggle('on', on);
          name.textContent = (flow && flow.text) || part.name || '';
        };
      },
      image(part, node) {
        const img = el('img', { class: 'wb-img', alt: part.name || '', draggable: 'false' }, node);
        img.style.objectFit = part.fit === 'contain' ? 'contain' : 'cover';
        const src = part.image || null;
        const empty = () => { node.classList.add('wb-img-empty'); img.removeAttribute('src'); };
        img.addEventListener('error', empty);
        img.addEventListener('load', () => node.classList.remove('wb-img-empty'));
        if (!src) empty();
        else if (src.kind === 'url') {
          img.src = src.url;
          // A web address read again (a camera's still): asked past the browser's cache.
          const again = () => { img.src = `${src.url}${src.url.includes('?') ? '&' : '?'}wk=${Date.now()}`; };
          if (part.refresh > 0 && !opts.preview) imageTimers.push(setInterval(() => { if (typeof document === 'undefined' || !document.hidden) again(); }, part.refresh * 60e3));
        }
        else if (opts.onImage) {
          const read = () => Promise.resolve(opts.onImage(part)).then((r) => {
            if (r && r.data) img.src = `data:${r.type || 'image/jpeg'};base64,${r.data}`;
            else empty();
          }, (err) => { console.error(err); empty(); });
          read();
          if (part.refresh > 0 && !opts.preview) imageTimers.push(setInterval(() => { if (typeof document === 'undefined' || !document.hidden) read(); }, part.refresh * 60e3));
        } else empty();
        return () => {};
      },
      ring(part, node) {
        const box = el('div', { class: `wb-ring-box wb-rings-${(part.rings || []).length}` }, node);
        const svg = el('svg', { class: 'wb-ring', viewBox: '0 0 100 100', 'aria-hidden': 'true' }, box, SVG_NS);
        const DEFAULTS = ['blue', 'green', 'orange'];
        const arcs = (part.rings || []).map((ring, i) => {
          const r = 44 - i * 12;
          const len = 2 * Math.PI * r;
          el('circle', { class: 'wb-ring-track', cx: 50, cy: 50, r }, svg, SVG_NS);
          const arc = el('circle', { class: 'wb-ring-fill', cx: 50, cy: 50, r, 'stroke-dasharray': `0 ${len}`, transform: 'rotate(-90 50 50)' }, svg, SVG_NS);
          const c = ring.color || (i === 0 && part.color) || DEFAULTS[i];
          arc.style.stroke = K.isCustomColor(c) ? c : `var(--wk-${c}, var(--wk-c))`;
          return { ring, arc, len };
        });
        const mid = el('div', { class: 'wb-ring-mid' }, box);
        const ic = part.center === 'icon' ? iconSlot(mid) : null;
        const val = part.center === 'value' || !part.center ? el('div', { class: 'wb-value' }, mid) : null;
        const name = el('div', { class: 'wb-name' }, node);
        return (c, flow) => {
          for (const { ring, arc, len } of arcs) {
            const e = sourceEntry(ring.src);
            const cap = (e && e.cap) || {};
            const lo = ring.min != null ? ring.min : cap.min != null ? cap.min : 0;
            const hi = ring.max != null ? ring.max : cap.max != null ? cap.max : 100;
            const v = e && !e.missing ? Number(K.scaled(cap, e.value)) : NaN;
            const f = Number.isFinite(v) && hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0;
            arc.setAttribute('stroke-dasharray', `${(f * len).toFixed(2)} ${len.toFixed(2)}`);
          }
          if (ic) ic(part, null, flow);
          if (val) val.textContent = textOf(part, c, flow);
          name.textContent = (flow && flow.text) || part.name || (c && c.name) || '';
          name.hidden = !name.textContent;
        };
      },
      segments(part, node, size) {
        const head = el('div', { class: 'wb-top' }, node);
        const name = el('span', { class: 'wb-name' }, head);
        const total = el('span', { class: 'wb-value' }, head);
        const donut = part.barStyle === 'donut';
        node.classList.add(donut ? 'wb-seg-donut' : 'wb-seg-barstyle');
        const body = el('div', { class: 'wb-seg-body' }, node);
        const bar = donut ? el('svg', { class: 'wb-seg-ring', viewBox: '0 0 100 100', 'aria-hidden': 'true' }, body, SVG_NS) : el('div', { class: 'wb-seg-bar', 'aria-hidden': 'true' }, body);
        // A donut lists its values beside it only where there's room.
        const legend = part.legend !== false && (!donut || size.wide) ? el('div', { class: 'wb-seg-legend' }, body) : null;
        const paint = (n, c) => { const v = K.isCustomColor(c) ? c : `var(--wk-${c}, var(--wk-c))`; if (n.namespaceURI === SVG_NS) n.style.stroke = v; else n.style.background = v; };
        return (c, flow) => {
          name.textContent = (flow && flow.text) || part.name || '';
          total.textContent = textOf(part, c, flow);
          const segs = c.segs || [];
          const whole = part.scale === 'max' ? (part.max || 100) : c.value || 0;
          bar.textContent = '';
          if (donut) {
            const r = 38;
            const len = 2 * Math.PI * r;
            el('circle', { class: 'wb-seg-track', cx: 50, cy: 50, r }, bar, SVG_NS);
            let at = 0;
            for (const x of segs) {
              const f = whole > 0 ? Math.min(1 - at, x.n / whole) : 0;
              if (f <= 0) continue;
              const arc = el('circle', { class: 'wb-seg-arc', cx: 50, cy: 50, r, 'stroke-dasharray': `${(f * len).toFixed(2)} ${len.toFixed(2)}`, 'stroke-dashoffset': (-at * len).toFixed(2), transform: 'rotate(-90 50 50)' }, bar, SVG_NS);
              paint(arc, x.color);
              at += f;
            }
          } else {
            for (const x of segs) {
              const f = whole > 0 ? Math.min(100, (x.n / whole) * 100) : 0;
              if (f <= 0) continue;
              const seg = el('span', { class: 'wb-seg' }, bar);
              seg.style.width = `${f}%`;
              paint(seg, x.color);
            }
          }
          if (legend) {
            legend.textContent = '';
            for (const x of segs) {
              const row = el('div', { class: 'wb-seg-key' }, legend);
              paint(el('i', { class: 'wb-seg-dot' }, row), x.color);
              el('span', { class: 'wb-seg-label', dir: 'auto', text: x.label || (x.entry && x.entry.name) || '' }, row);
              el('span', { class: 'wb-seg-num', text: x.entry && !x.entry.missing ? fmt(x.entry.cap, x.entry.value) : '–' }, row);
            }
          }
        };
      },
      repeat(part, node) {
        node.classList.add(`wb-rep-${part.itemStyle === 'tile' ? 'tiles' : 'rows'}`);
        const head = el('div', { class: 'wb-name wb-rep-head' }, node);
        const list = el('div', { class: 'wb-rep-list' }, node);
        list.style.gridTemplateColumns = `repeat(${part.columns || 1}, minmax(0, 1fr))`;
        const empty = el('div', { class: 'wb-sub wb-rep-empty', hidden: '' }, node);
        let shown = '';
        return (c, flow) => {
          head.textContent = (flow && flow.text) || part.name || '';
          head.hidden = !head.textContent;
          const items = repeatItems(part);
          empty.hidden = items.length > 0;
          empty.textContent = part.text || t('nothing');
          // Rebuilt only when the devices shown or their values change.
          const key = JSON.stringify(items.map(i => [i.slot, i.value, i.name, i.offline, part.deviceIcon ? deviceIconOf(i.slot) : null]));
          if (key === shown) return;
          shown = key;
          list.textContent = '';
          for (const item of items) {
            const row = el('div', { class: 'wb-rep-item', 'data-slot': item.slot }, list);
            const glyph = el('span', { class: 'wb-icon wb-glyph', 'aria-hidden': 'true' }, row);
            K.setMask(glyph, (part.deviceIcon && deviceIconOf(item.slot)) || (item.cap && item.cap.icon) || K.valueGlyph(item.slot.slice(item.slot.indexOf(':') + 1), item.value), '--wb-mask');
            el('span', { class: 'wb-rep-name', dir: 'auto', text: item.name || '' }, row);
            el('span', { class: 'wb-rep-value', text: fmt(item.cap, item.value) }, row);
            row.classList.toggle('wb-on', item.value === true);
            // Its own colour by its value: the first item rule that holds.
            const look = (part.itemRules || []).find(r => ruleHolds(r, item.value));
            if (look) { row.classList.add('wb-item-colored'); applyColor(row, look.look); }
            K.markOffline(row, item.offline, item.offline ? t('unavailable') : undefined);
            if (part.control && typeof item.value === 'boolean') {
              row.setAttribute('role', 'switch');
              row.setAttribute('aria-checked', item.value ? 'true' : 'false');
              row.tabIndex = 0;
              K.onTap(row, () => { if (!opts.preview) act(part, row, !item.value, item.slot); }, { guard });
            }
          }
        };
      },
      slider(part, node) {
        // Light Controls' bar: the whole box is the hit area round a 6 px track and a 14 px knob at the value. Its
        // icon, name and value are components of their own beside it.
        el('span', { class: 'wb-fill' }, el('span', { class: 'wb-track', 'aria-hidden': 'true' }, node));
        el('span', { class: 'wb-knob', 'aria-hidden': 'true' }, node);
        node.setAttribute('role', 'slider');
        node.tabIndex = 0;
        let last = { cap: {} };
        if (!opts.preview) {
          K.wireBar(node, {
            id: part.id, drags, guard, render: update,
            commit: (id, x) => {
              const [lo, hi] = range(part, last.cap);
              const step = part.step || (last.cap && last.cap.step) || ((hi - lo) <= 1 ? 0.01 : 1);
              const v = Math.round((lo + x * (hi - lo)) / step) * step;
              act(part, node, Number(v.toFixed(4)));
            },
          });
        }
        return (c) => {
          last = c;
          const [lo, hi] = range(part, c.cap);
          const v = Number(c.value);
          const x = drags.has(part.id) ? drags.get(part.id) : Number.isFinite(v) ? (v - lo) / (hi - lo) : 0;
          const f = Math.min(1, Math.max(0, x));
          node.style.setProperty('--wb-x', String(f));
          node.classList.toggle('dragging', drags.has(part.id));
          node.setAttribute('aria-valuenow', String(v));
          node.setAttribute('aria-label', part.name || c.name || '');
        };
      },
      sparkline(part, node) {
        // A line of a device value's history over its span, filling the box.
        let svg = null;
        return () => {
          if (svg) svg.remove();
          svg = sparkline(state.histories && state.histories[`${part.span}\n${part.slot}`], node, part.min, part.max, part.smooth);
        };
      },
      arc(part, node) {
        // Chart · Gauge's dial of its value between its range: its zones, the span's range and the knob.
        let svg = null;
        node.classList.toggle('wb-zoned', !!part.zones);
        return (c) => {
          const [lo, hi] = range(part, c.cap);
          const v = Number(K.scaled(c.cap || {}, c.value));
          const span = spanRange(part, c.cap);
          const frac = x => (x - lo) / (hi - lo);
          if (svg) svg.remove();
          svg = gaugeArc(node, {
            frac: Number.isFinite(v) ? frac(v) : null,
            width: part.thickness || 12,
            zones: part.zones ? zoneCuts(part, lo, hi) : null,
            level: part.zones ? zoneOf(v, part) : null,
            range: span ? [Math.max(0, frac(span[0])), Math.min(1, frac(span[1]))] : null,
          });
        };
      },
      bar(part, node) {
        // A level bar of its value between its range, as thick as set, centred in its box: Chart · Gauge's bar, with
        // its zones as stretches of the track, the value in its level's colour, and the span's range under it.
        // Vertical: from the bottom up, as a tank or a battery.
        const up = part.dir === 'vertical';
        node.classList.toggle('wb-bar-v', up);
        node.classList.toggle('wb-zoned', !!part.zones);
        const bar = el('div', { class: `wb-level${up ? ' wb-level-v' : ''}`, 'aria-hidden': 'true' }, node);
        const fill = el('i', null, bar);
        const band = part.rangeSpan ? el('b', { class: `wb-level-range${up ? ' wb-level-range-v' : ''}`, 'aria-hidden': 'true' }, node) : null;
        bar.style[up ? 'width' : 'height'] = `${part.thickness || 6}px`;
        const ZONE_CSS = { green: 'var(--wb-zone-green)', yellow: 'var(--wb-zone-yellow)', red: 'var(--wb-zone-red)' };
        return (c) => {
          const [lo, hi] = range(part, c.cap);
          const v = Number(K.scaled(c.cap || {}, c.value));
          const pc = x => Math.min(100, Math.max(0, ((x - lo) / (hi - lo)) * 100));
          fill.style[up ? 'height' : 'width'] = `${Number.isFinite(v) ? pc(v) : 0}%`;
          const level = part.zones ? zoneOf(v, part) : null;
          fill.className = level || '';
          if (part.zones) {
            // The track in stretches, each its level's colour mixed into the track (hard stops between them).
            const stops = zoneCuts(part, lo, hi).flatMap(([a, b, lv]) => [`${ZONE_CSS[lv]} ${(a * 100).toFixed(1)}%`, `${ZONE_CSS[lv]} ${(b * 100).toFixed(1)}%`]);
            bar.style.background = stops.length ? `linear-gradient(${up ? 'to top' : 'to right'}, ${stops.join(', ')})` : '';
          }
          if (band) {
            const span = spanRange(part, c.cap);
            band.hidden = !span;
            if (span) {
              const [a, b] = [pc(span[0]), Math.max(pc(span[1]), pc(span[0]) + 1)];
              band.style[up ? 'bottom' : 'left'] = `${a}%`;
              band.style[up ? 'height' : 'width'] = `${b - a}%`;
            }
          }
        };
      },
      stepper(part, node, size) {
        // Variables' number row: the name, then − value + (32 px round buttons); stacked where it isn't wide.
        node.classList.add(size.wide ? 'wb-row-layout' : 'wb-stack');
        const name = el('div', { class: 'wb-name' }, node);
        const row = el('div', { class: 'wb-stepper' }, node);
        const minus = el('button', { type: 'button', class: 'wb-step', 'aria-label': '−', text: '−' }, row);
        const val = el('span', { class: 'wb-value' }, row);
        const plus = el('button', { type: 'button', class: 'wb-step', 'aria-label': '+', text: '+' }, row);
        const limits = stepper(part, node, minus, plus, () => part.step || 0.5);
        return (c, flow) => {
          name.textContent = (flow && flow.text) || part.name || c.name || '';
          val.textContent = textOf(part, c, flow);
          limits(c);
        };
      },
      choice(part, node, size) {
        // Variable Presets' and Thermostat Presets' buttons: a row of them, lit in the colour's shade (Vivid: bright).
        if (size.big) node.classList.add('wb-presets-big');
        const name = el('div', { class: 'wb-name' }, node);
        const row = presetRow(part, node);
        const buttons = (part.choices || []).map((ch) => {
          const b = el('button', { type: 'button', class: 'wb-preset', role: 'radio', text: ch.label }, row);
          K.onTap(b, () => { if (!opts.preview) act(part, node, ch.value); }, { guard, keys: false, stop: true });
          return { b, ch };
        });
        return (c, flow) => {
          const v = c.value === undefined || c.value === null ? '' : String(c.value);
          for (const { b, ch } of buttons) {
            const on = ch.value === v;
            b.classList.toggle('active', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
          }
          name.textContent = (flow && flow.text) || part.name || c.name || '';
          name.hidden = !name.textContent;
        };
      },
      variable(part, node, size) {
        // Variables' row: the name, then the control: a switch for a yes/no, − value + for a number, the text for a
        // text (muted). Read only: a yes/no is a dot and Yes or No, a number or text only its value. Stacked where it
        // isn't wide. A tap toggles a yes/no or types a number or text in the tile.
        node.classList.add(size.wide ? 'wb-row-layout' : 'wb-stack');
        // Too narrow for − value +: a tap types the number.
        if (size.narrow) node.classList.add('wb-narrow');
        if (part.readOnly) node.classList.add('wb-readonly');
        const name = el('div', { class: 'wb-name' }, node);
        const control = el('div', { class: 'wb-control' }, node);
        const minus = el('button', { type: 'button', class: 'wb-step', 'aria-label': '−', text: '−', hidden: '' }, control);
        const dot = el('span', { class: 'wb-dot', 'aria-hidden': 'true', hidden: '' }, control);
        const val = el('span', { class: 'wb-value' }, control);
        const plus = el('button', { type: 'button', class: 'wb-step', 'aria-label': '+', text: '+', hidden: '' }, control);
        const tog = el('span', { class: 'wb-toggle', 'aria-hidden': 'true' }, control);
        const limits = stepper(part, node, minus, plus, () => part.step || 1);
        let c = {};
        let input = null;
        /** A text or number variable is typed in the tile: Enter or leaving it sets it, Escape leaves it as it was. */
        function edit() {
          if (input) return;
          input = el('input', { class: 'wb-input', type: 'text', inputmode: c.cap.type === 'number' ? 'decimal' : 'text', 'aria-label': part.name || c.name || '' });
          input.value = c.value == null ? '' : String(c.value);
          control.replaceWith(input);
          node.classList.add('wb-editing');
          input.focus();
          input.select();
          let done = false;
          const finish = (save) => {
            if (done) return;
            done = true;
            const typed = input.value;
            input.replaceWith(control);
            input = null;
            node.classList.remove('wb-editing');
            if (!save || typed === (c.value == null ? '' : String(c.value))) return;
            let v = c.cap.type === 'number' ? Number(typed.replace(',', '.')) : typed;
            if (c.cap.type === 'number' && (!typed.trim() || !Number.isFinite(v))) { K.shake(node); return; }
            // Within its own range, as the app keeps it.
            if (typeof v === 'number') v = Math.min(part.max != null ? part.max : Infinity, Math.max(part.min != null ? part.min : -Infinity, v));
            act(part, node, v);
          };
          input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            if (e.key === 'Escape') { e.preventDefault(); finish(false); }
          });
          input.addEventListener('blur', () => finish(true));
          ['click', 'touchend', 'touchstart'].forEach(ev => input.addEventListener(ev, e => e.stopPropagation()));
        }
        const use = () => {
          if (opts.preview || part.readOnly || !c.cap || input) return;
          if (c.cap.type === 'boolean') act(part, node, c.value !== true);
          else edit();
        };
        if (!part.readOnly) {
          K.onTap(node, use, { guard, keys: false });
          node.addEventListener('keydown', (e) => {
            if (e.target === node && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); use(); }
          });
          node.setAttribute('role', 'button');
          node.tabIndex = 0;
        }
        return (cur, flow) => {
          c = cur;
          const type = cur.cap && cur.cap.type;
          const bool = type === 'boolean';
          node.dataset.type = type || '';
          tog.hidden = !bool || !!part.readOnly;
          tog.classList.toggle('on', cur.value === true);
          dot.hidden = !bool || !part.readOnly;
          node.classList.toggle('wb-unknown', bool && typeof cur.value !== 'boolean');
          node.classList.toggle('wb-on', bool && cur.value === true);
          minus.hidden = plus.hidden = type !== 'number' || !!part.readOnly;
          val.hidden = bool && !part.readOnly;
          if (!input) val.textContent = bool ? (cur.value === true ? t('yes') : cur.value === false ? t('no') : '–') : textOf(part, cur, flow);
          name.textContent = (flow && flow.text) || part.name || cur.name || '';
          if (type === 'number') limits(cur);
        };
      },
      text(part, node) {
        // Notes' sizes (Small 14, Default 17 medium, Large 24 bold) and Big 32 bold, whose values' units are drawn as
        // Chart · Gauge's (17 regular, muted); its long text cut short, scrolled or on more lines; or Notes' Post-it.
        const size = OLD_SIZES[part.size] || part.size || 'small';
        node.classList.add(`wb-size-${size}`);
        if (part.weight) node.classList.add(`wb-weight-${part.weight}`);
        if (part.muted) node.classList.add('wb-muted');
        const postit = styleOf(part) === 'postit';
        const overflow = postit ? 'wrap' : part.overflow || 'wrap';
        node.classList.add(`wb-over-${overflow}`);
        node.style.textAlign = part.align || 'left';
        let holder = node;
        if (postit) {
          node.style.setProperty('--wb-note-font', `${NOTE_FONT[size] || 30}px`);
          holder = el('div', { class: 'wb-paper' }, el('div', { class: 'wb-note' }, node));
        }
        const wrap = el('div', { class: 'wb-text-wrap' }, holder);
        const txt = el('div', { class: 'wb-text', dir: 'auto' }, wrap);
        // Big values' units as Chart · Gauge's (17), Large ones' as Charts' header (14).
        const big = (size === 'display' || size === 'large') && !postit;
        let shown = null;
        // A Flow's text replaces the whole text, its {1} … left as typed; a Flow's value (with its units) too.
        return (c, flow) => {
          const pieces = (flow && flow.text) ? [flow.text] : (flow && flow.value !== undefined) ? [textOf(part, null, flow)] : fillPieces(part.text || '', part.refs, big);
          const key = JSON.stringify(pieces);
          if (key === shown) return;
          shown = key;
          txt.textContent = '';
          for (const x of pieces) {
            if (typeof x === 'string') txt.append(x);
            else { txt.append(x.num); el('span', { class: 'wb-unit', text: x.unit }, txt).style.marginLeft = x.tight ? '0' : '3px'; }
          }
          if (overflow === 'scroll') requestAnimationFrame(() => scrollText(wrap, txt));
        };
      },
      calc(part, node) {
        // Only a value for others: left out on a dashboard; in the builder a faint chip of its name and value.
        const chip = el('div', { class: 'wb-calc-chip' }, node);
        return (c) => { chip.textContent = `${part.name || 'Σ'} = ${textOf(part, c, null)}`; };
      },
      shape(part, node) {
        const form = part.shape || 'rect';
        node.classList.add(`wb-shape-${form}`);
        if (form === 'line') node.classList.add(part.dir === 'vertical' ? 'wb-line-v' : 'wb-line-h');
        const fill = el('i', { class: 'wb-shape-fill', 'aria-hidden': 'true' }, node);
        fill.style.opacity = String((part.opacity != null ? part.opacity : 100) / 100);
        if (form === 'rect') fill.style.borderRadius = `${part.radius != null ? part.radius : 10}px`;
        if (form === 'line') fill.style.setProperty('--wb-thick', `${part.thickness || 2}px`);
        const own = backgroundCss(part.background);
        // Its fill: a rule's colour, else a Flow input's, else its own background, else its colour from Style (CSS).
        return (c, flow, look) => { fill.style.background = look && look.tint ? 'var(--wk-c)' : flow && flow.fill ? cssColor(flow.fill) : own; };
      },
      icon(part, node) {
        if (part.grow) node.classList.add('wb-icon-grow');
        const ic = iconSlot(node);
        // With a device value: its own glyph (a lock open or closed), unless an icon is picked or a rule or Flow sets one.
        return (c, flow) => ic(part, part.slot ? c : null, flow);
      },
      chart(part, node) {
        // Chart · Basic's look: up to three device values over a span, the values now at its top (`header`), each
        // series' chip above or below the plot (`chartLegend`), the scale at the left and the times under it (`axis`).
        const style = part.chartStyle || 'area';
        node.classList.add(`wb-chart-${style}`);
        node.classList.toggle('wb-chart-axis', part.axis !== false);
        const legendAt = part.chartLegend || 'above';
        const header = part.header ? el('div', { class: 'wb-chart-header' }, node) : null;
        const chipsAbove = legendAt === 'above' ? el('div', { class: 'wb-chart-chips' }, node) : null;
        const body = el('div', { class: 'wb-chart-body' }, node);
        const yAxis = el('div', { class: 'wb-chart-y' }, body);
        const plot = el('div', { class: 'wb-chart-plot' }, body);
        const xAxis = el('div', { class: 'wb-chart-x' }, node);
        const chipsBelow = legendAt === 'below' ? el('div', { class: 'wb-chart-chips' }, node) : null;
        const chips = chipsAbove || chipsBelow;
        return (c, flow) => {
          // One series' chip says the chart's name; more each say their own (a title, else the device's).
          const one = (part.series || []).length === 1;
          const list = (part.series || []).map((s, i) => {
            const v = state.values && state.values[s.slot];
            const pts = ((state.histories && state.histories[`${part.span}\n${s.slot}`]) || []).filter(p => Array.isArray(p) && Number.isFinite(p[1]));
            const name = s.title || (one && ((flow && flow.text) || part.name)) || (v && !v.missing ? v.name : '') || '';
            return { ...s, points: pts, entry: v, name, css: chartColor(s.color || (i === 0 && part.color) || SERIES_COLORS[i % SERIES_COLORS.length]) };
          });
          const all = list.flatMap(s => s.points);
          const first = list.find(s => s.entry && !s.entry.missing);
          const cap = first ? first.entry.capability || {} : {};
          if (header) {
            // Charts' header: each value now (24 bold, its unit 14) over its name.
            header.textContent = '';
            header.classList.toggle('one', list.length < 2);
            for (const s of list) {
              const col = el('div', { class: 'wb-chart-hcol' }, header);
              col.style.setProperty('--wb-series', s.css);
              const val = el('div', { class: 'wb-chart-hval' }, col);
              const e = s.entry;
              const known = e && !e.missing && e.value !== null && e.value !== undefined;
              const below = known && part.negative && typeof e.value === 'number' && e.value < 0;
              el('span', { class: `v${below ? ' export' : ''}`, text: known ? fmt({ ...(e.capability || {}), units: null }, e.value) : '–' }, val);
              const units = known && e.capability && e.capability.units;
              if (units) el('span', { class: 'u', text: `${K.TIGHT_UNITS.test(units) ? '' : ' '}${units}` }, val);
              el('div', { class: 'wb-chart-hsub', dir: 'auto', text: s.name }, col);
            }
          }
          if (chips) {
            chips.textContent = '';
            for (const s of list) {
              const chip = el('span', { class: 'wb-chart-chip' }, chips);
              el('i', null, chip).style.background = s.css;
              el('span', { dir: 'auto', text: s.name }, chip);
            }
            chips.hidden = !list.length;
          }
          plot.textContent = '';
          yAxis.textContent = '';
          xAxis.textContent = '';
          if (!all.length) { el('div', { class: 'wb-sub wb-chart-none', text: '–' }, plot); return; }
          const vs = all.map(p => p[1]);
          // Chart · Basic's *Scale*: fitted to the values, or from zero.
          let lo = part.min != null ? part.min : Math.min(...vs);
          let hi = part.max != null ? part.max : Math.max(...vs);
          if ((part.chartScale === 'zero' || style === 'bars') && part.min == null) lo = Math.min(0, lo);
          if (part.chartScale === 'zero' && part.max == null) hi = Math.max(0, hi);
          if (hi === lo) { hi += 1; lo -= part.min != null ? 0 : 1; }
          const ts = all.map(p => p[0]);
          const [t0, t1] = [Math.min(...ts), Math.max(...ts)];
          chartPlot(list, plot, { lo, hi, t0, t1, style, smooth: part.smooth, negative: part.negative });
          if (part.axis === false) return;
          const scale = { ...cap, decimals: Math.abs(hi - lo) >= 20 ? 0 : cap.decimals != null ? Math.min(1, cap.decimals) : 1 };
          el('span', { text: fmt(scale, hi) }, yAxis);
          el('span', { text: fmt(scale, lo) }, yAxis);
          // Over more than a day and a half its dates; else how long ago it starts (a day's both ends have the same clock time) and the time it ends.
          const long = t1 - t0 > 36 * 3600e3;
          el('span', { text: long ? dateText(t0, 'short') : relative(t0, Date.now()) }, xAxis);
          el('span', { text: long ? dateText(t1, 'short') : K.clockTime(t1) }, xAxis);
        };
      },
      use(part, node) {
        // A linked ready-made: its source's component as it is now, filling this box (the app sends it as a Repeater's).
        node.classList.add('wb-use');
        return MAKERS.each(part, node);
      },
      each(part, node) {
        // A ready-made component once per device, each filled in with it, in rows of `columns`.
        const single = part.kind === 'use';
        const list = el('div', { class: 'wb-each-list' }, node);
        list.style.gridTemplateColumns = `repeat(${single ? 1 : part.columns || 1}, minmax(0, 1fr))`;
        const empty = el('div', { class: 'wb-sub wb-each-empty', hidden: '' }, node);
        let shown = '';
        return () => {
          const e = state.each && state.each[part.id];
          const devices = e && e.part ? e.devices || [] : [];
          empty.hidden = devices.length > 0;
          empty.textContent = e && !e.part ? t('noReady') : t('nothing');
          const key = JSON.stringify([devices, e && e.part]);
          if (key === shown) return;
          shown = key;
          // The copies' views go with them.
          views = views.filter(v => !list.contains(v.node));
          list.textContent = '';
          const h = e && e.part && e.part.at ? Math.max(1, e.part.at.h) : 1;
          list.style.gridAutoRows = single ? '1fr' : `${h * 64 + (h - 1) * 8}px`;
          const fresh = [];
          for (const dev of devices) {
            const cell = el('div', { class: 'wb-each-item' }, list);
            const before = views.length;
            cell.appendChild(build(bindPart(e.part, dev, part.id), 'item'));
            fresh.push(...views.slice(before));
          }
          for (const v of fresh) v.update();
        };
      },
      container(part, node) {
        node.classList.add(`wb-box-${part.mode === 'free' ? 'free' : 'grid'}`);
        const paged = part.mode === 'pages';
        let nav = null;
        if (paged) {
          node.classList.add('wb-box-pages', `wb-nav-${part.nav || 'tabs'}`);
          if (part.nav !== 'state') {
            nav = el('div', { class: 'wb-pagenav', role: 'tablist' }, node);
            (part.pages || []).forEach((pg, i) => {
              const b = el('button', { type: 'button', class: 'wb-pagebtn', role: 'tab', text: part.nav === 'dots' ? '' : pg.name || String(i + 1) }, nav);
              b.setAttribute('aria-label', pg.name || t('page', { n: i + 1 }));
              K.onTap(b, () => { pageNow.set(part.id, i); forcedPage.delete(part.id); update(); }, { guard, keys: false, stop: true });
            });
          }
        }
        const bg = part.background || { kind: 'none' };
        // Its own background over its style's (a tile's colour, or none); light text on it unless a text colour is set.
        // Its own colour or gradient at its strength (`dim`): *Like the widgets* by default (CSS), Half or Full.
        if (bg.kind !== 'none') paintBox(node, bg);
        // A fill that follows a Flow input: its colour as the fill, at the container's strength, while it has one.
        let painted = '';
        const paintFill = (flow) => {
          if (!part.bind || !part.bind.fill) return;
          const c = (flow && flow.fill) || '';
          if (c === painted) return;
          painted = c;
          if (c) paintBox(node, { kind: 'color', from: c, ...(bg.dim ? { dim: bg.dim } : {}) });
          else if (bg.kind !== 'none') paintBox(node, bg);
          else { node.classList.remove('wb-box-bg', 'wb-bg-hex', 'wb-dim-widget', 'wb-dim-half', 'wb-dim-full'); }
        };
        const inner = el('div', { class: 'wb-inner' }, node);
        const kids = (part.parts || []).map(kid => [kid, inner.appendChild(build(kid, part.mode === 'free' ? 'free' : 'grid'))]);
        if (paged && nav && part.nav === 'dots') node.appendChild(nav); // dots under the page
        return (c, flow) => {
          paintFill(flow);
          if (part.fillBy) fillLevel(part, node, bg);
          if (!paged) return;
          const page = pageOf(part, flow);
          for (const [kid, n] of kids) n.classList.toggle('wb-off-page', (kid.page || 0) !== page);
          if (nav) [...nav.children].forEach((b, i) => { b.classList.toggle('on', i === page); b.setAttribute('aria-selected', i === page ? 'true' : 'false'); });
        };
      },
    };

    /**
     * Device Values' *Fill percentages by level*: the container filled from the left as far as its value is along its
     * range, red below `redBelow` per cent, yellow below `yellowBelow`, else green (22 % into the tile; solid in Vivid).
     */
    function fillLevel(part, node, bg) {
      const e = sourceEntry(part.fillBy);
      const n = e && !e.missing && !e.offline ? Number(K.scaled(e.cap || {}, e.value)) : NaN;
      if (!Number.isFinite(n)) {
        node.classList.remove('wb-filled');
        node.style.removeProperty('--wb-fill');
        if (bg.kind === 'none') node.style.removeProperty('background');
        return;
      }
      const cap = e.cap || {};
      const lo = cap.min != null ? cap.min : 0;
      const hi = cap.max != null && cap.max > lo ? (cap.units === '%' && cap.max <= 1 ? 100 : cap.max) : 100;
      const pc = Math.min(100, Math.max(0, ((n - lo) / (hi - lo)) * 100));
      node.classList.add('wb-filled');
      node.dataset.level = pc < (part.redBelow != null ? part.redBelow : 10) ? 'red' : pc < (part.yellowBelow != null ? part.yellowBelow : 20) ? 'yellow' : 'green';
      node.style.setProperty('--wb-fill', `${pc}%`);
    }

    /**
     * A pages container's page now: the builder's, a Flow input's (a number from 1, or a page's name), its widget
     * state's, else the one tapped (from 0).
     */
    function pageOf(part, flow) {
      const n = (part.pages || []).length || 1;
      let page = pageNow.get(part.id) || 0;
      // A Flow input's new value turns the page, as a tap would: a tap after it still turns it.
      const said = flow && flow.page !== undefined ? String(flow.page) : null;
      if (said !== null && said !== flowPage.get(part.id)) {
        flowPage.set(part.id, said);
        const named = (part.pages || []).findIndex(pg => pg.name && pg.name.trim().toLowerCase() === said.trim().toLowerCase());
        const num = Number(said.replace(',', '.'));
        if (named >= 0) page = named;
        else if (Number.isFinite(num)) page = Math.round(num) - 1;
        pageNow.set(part.id, Math.min(n - 1, Math.max(0, page)));
      } else if (said === null) flowPage.delete(part.id);
      if (part.nav === 'state' && part.pageBy && part.pageBy.part) {
        const st = states.get(part.pageBy.part);
        if (st) {
          const v = stateValue(st);
          page = st.stateType === 'choice' ? Math.max(0, (st.choices || []).findIndex(c => c.value === v)) : v === true ? 1 : 0;
        }
      }
      if (forcedPage.has(part.id)) page = forcedPage.get(part.id);
      return Math.min(n - 1, Math.max(0, page));
    }

    // ------------------------------------------------------------ drawing

    function rebuild() {
      grid.textContent = '';
      views = [];
      builtFor = state && state.design;
      calcs = new Map();
      states = new Map();
      repeaters = new Map();
      for (const timer of imageTimers) clearInterval(timer);
      imageTimers = [];
      if (!builtFor) { tick(); return; }
      for (const part of builtFor.parts) {
        for (const p of [part, ...(part.parts || [])]) {
          if (p.kind === 'calc') calcs.set(p.id, p);
          if (p.kind === 'state') states.set(p.id, p);
          if (p.kind === 'repeat') repeaters.set(p.id, p);
        }
      }
      for (const part of builtFor.parts) grid.appendChild(build(part, 'top'));
      tick();
    }

    /** What changes with the clock: a Time component, or a text with the time in it. Every second with seconds shown. */
    function timed() {
      let any = false;
      let seconds = false;
      for (const v of views) {
        for (const r of v.part.refs || []) {
          if (r && (r.time || r.since || r.until)) any = true;
          if (r && r.time === 'seconds') seconds = true;
        }
        if (v.part.kind === 'calc' && v.part.op === 'since') any = true;
      }
      return any ? (seconds ? 1000 : 60e3) : 0;
    }
    /** Draws the times again on the second or minute, while the page shows. */
    function tick() {
      clearTimeout(ticker);
      ticker = null;
      const every = timed();
      if (!every) return;
      ticker = setTimeout(() => {
        if (typeof document === 'undefined' || !document.hidden) update();
        else tick();
      }, every - (Date.now() % every) + 20);
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden && timed()) update(); });

    function update() {
      if (!state || !state.design) { report(); return; }
      if (state.design !== builtFor) rebuild();
      for (const v of views) v.update();
      grid.hidden = !!message;
      report();
      if (timed()) tick();
    }

    function setMessage(text, transient) {
      if (transient) { msg.set(text, true); return; }
      message = text;
      msg.set(text, false);
      grid.hidden = !!text;
      report();
    }

    return {
      t,
      /** `/state`'s answer: a design and its values. */
      setState(next) {
        if (next && next.missing) { state = null; builtFor = null; grid.textContent = ''; setMessage(t('missing')); return; }
        if (!next || !next.design || !Array.isArray(next.design.parts)) { setMessage(t('error')); return; }
        const sameDesign = state && next && state.design && next.design && state.design.updatedAt === next.design.updatedAt && state.design.id === next.design.id;
        state = next;
        if (state.timeFormat) K.setTimeFormat(state.timeFormat); // the app's, riding along
        if (sameDesign) state.design = builtFor; // keep the built parts (and a drag on a slider)
        message = null;
        msg.reset();
        // The note goes with the message (reset() doesn't draw): an empty design's, once it has components.
        note.hidden = !msg.text;
        note.textContent = msg.text || '';
        if (!state.design.parts.length) {
          // The builder's canvas shows its empty grid itself; the message only gets in the way there.
          if (opts.preview) { grid.textContent = ''; builtFor = null; views = []; grid.hidden = false; report(); return; }
          setMessage(t('empty'));
          return;
        }
        update();
      },
      /** Realtime `values:state`: one capability's new value. */
      pushValue({ deviceId, capabilityId, value }) {
        if (!state || !state.values) return;
        const key = `${deviceId}:${capabilityId}`;
        const s = state.values[key];
        if (!s || s.missing) return;
        if (s.value !== value) s.updatedAt = Date.now();
        s.value = value;
        for (const v of views) if (v.part.slot === key) { const h = hoped.get(v.part.id); if (h && h.value === value) hoped.delete(v.part.id); }
        update();
      },
      /** Realtime `variables:state`. */
      pushVariable({ id, value }) {
        const v = state && state.variables && state.variables[id];
        if (!v || v.missing) return;
        v.value = value;
        update();
      },
      /** Realtime `custom:input`: a Flow input's values now (null: it's gone), if the design reads it. */
      pushInput({ input, entry }) {
        if (!state || !state.inputs || !(input in state.inputs)) return;
        state.inputs = { ...state.inputs };
        if (entry) state.inputs[input] = entry; else delete state.inputs[input];
        update();
      },
      setMessage,
      /** The parts' ids that need a history (for the dev pages). */
      update,
      /** The builder: shows a pages container's page (null: back to its own). */
      showPage(id, page) {
        if (page === null || page === undefined) forcedPage.delete(id); else forcedPage.set(id, page);
        update();
      },
    };
  };
})();
