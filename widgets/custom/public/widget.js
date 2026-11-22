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

  const DEFAULT_STRINGS = {
    error: 'Could not load the design.',
    missing: 'This design was removed.',
    pickDesign: 'Pick a design in the widget\'s settings.',
    empty: 'This design has no components yet.',
    webOnly: 'Widget Builder designs show on web dashboards for now.',
    unavailable: 'Unavailable',
    on: 'On',
    off: 'Off',
    setFailed: 'Could not change __name__.',
    noValue: 'No value picked',
    noKey: 'For this, add an API key in the app settings.',
    keyScope: 'The API key may not do this (Flows or Variables).',
    keyInvalid: 'The API key was not accepted.',
    tapAgain: 'Tap again',
    hold: 'Hold',
    nothing: 'Nothing to show',
    page: 'Page __n__',
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
    let color = part.color || null;
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
    if (flow && flow.color) { color = flow.color; tint = true; }
    return { color, tint, hidden, icon };
  }
  window.customLookOf = lookOf;

  /** A part's background: its `style`, or as kept before it had one (`tile: false`; text and icons none). */
  function styleOf(part) {
    if (part.kind === 'shape') return 'none';
    if (['tile', 'pill', 'none'].includes(part.style)) return part.style;
    return part.tile === false || ['text', 'icon', 'sparkline', 'arc', 'bar', 'calc'].includes(part.kind) ? 'none' : 'tile';
  }

  function icon(id, cls) {
    const ic = id && K.icons[id];
    return ic ? K.svgIcon(ic, cls) : null;
  }

  /** A line through the points (`[t, v]`), filled under it, scaled to the box (between `lo` and `hi` where given). */
  function sparkline(points, parent, min, max) {
    const svg = el('svg', { class: 'wb-spark', viewBox: '0 0 100 40', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, parent, SVG_NS);
    const pts = (points || []).filter(p => Array.isArray(p) && Number.isFinite(p[1]));
    if (pts.length < 2) return svg;
    const [t0, t1] = [pts[0][0], pts[pts.length - 1][0]];
    const vs = pts.map(p => p[1]);
    let [lo, hi] = [min != null ? min : Math.min(...vs), max != null ? max : Math.max(...vs)];
    if (hi < lo) [lo, hi] = [hi, lo];
    const y = v => 37 - (Math.min(1, Math.max(0, (v - lo) / ((hi - lo) || 1)))) * 30;
    const xy = pts.map(([t, v]) => [((t - t0) / ((t1 - t0) || 1)) * 100, y(v)]);
    const d = `M${xy.map(p => p.map(n => n.toFixed(2)).join(',')).join(' L')}`;
    el('path', { class: 'wb-spark-area', d: `${d} L100,40 L0,40 Z` }, svg, SVG_NS);
    el('path', { class: 'wb-spark-line', d, 'vector-effect': 'non-scaling-stroke' }, svg, SVG_NS);
    return svg;
  }

  /** The gauge's arc, 270° from the bottom left, filled to `frac`. */
  function arc(frac, parent, width = 8) {
    const svg = el('svg', { class: 'wb-arc', viewBox: '0 0 100 84', 'aria-hidden': 'true' }, parent, SVG_NS);
    svg.style.setProperty('--wb-arc-w', String(width));
    const r = 40; const cx = 50; const cy = 48;
    const a0 = Math.PI * 0.75; const a1 = Math.PI * 2.25;
    const pt = a => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    const path = (from, to) => `M${pt(from)} A${r},${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${pt(to)}`;
    el('path', { class: 'wb-arc-track', d: path(a0, a1) }, svg, SVG_NS);
    const f = Math.min(1, Math.max(0, frac));
    if (f > 0.002) el('path', { class: 'wb-arc-fill', d: path(a0, a0 + (a1 - a0) * f) }, svg, SVG_NS);
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
    /** A pages container's page now (by id), and the builder's pick of the page it's editing. */
    const pageNow = new Map();
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
    function flowOf(part) {
      const f = state && state.flow && state.flow[part.id];
      return f && (!f.expires || f.expires > Date.now()) ? f : null;
    }
    /** A source's value now (`{value, cap, name, offline, missing, updatedAt}`), or null when it isn't read. */
    function sourceEntry(src) {
      if (!src || !state) return null;
      if (src.slot) {
        const s = state.values && state.values[src.slot];
        if (!s) return null;
        if (s.missing) return { missing: true };
        return { value: s.value, cap: s.capability || {}, name: s.name, offline: !!s.offline, updatedAt: s.updatedAt };
      }
      if (src.variable) {
        const v = state.variables && state.variables[src.variable];
        if (!v) return null;
        if (v.missing) return { missing: true };
        return { value: v.value, cap: { type: v.type, units: null, decimals: 2 }, name: v.name };
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
     * A calculated value: its inputs summed, averaged, the lowest or highest (with that input's name), the first less
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
    const fmt = (cap, value) => K.formatValue(cap || {}, value, k => t(k));
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
        const s = sourceEntry({ slot: ref.since });
        return s && !s.missing && s.updatedAt ? relative(s.updatedAt, Date.now()) : '–';
      }
      if (ref.time === 'date') return dateText(Date.now(), 'long');
      if (ref.time === 'weekday') return dateText(Date.now(), 'weekday');
      const e = sourceEntry(ref);
      if (ref.show === 'name') return (e && e.name) || '–';
      if (!e || e.missing || e.value === null || e.value === undefined) return '–';
      // A change (Trend's) shows its sign.
      // Its own decimals, and without its units where it says so.
      const cap = ref.decimals != null || ref.plain ? { ...(e.cap || {}), ...(ref.decimals != null ? { decimals: ref.decimals } : {}), ...(ref.plain ? { units: null } : {}) } : e.cap;
      const calc = ref.part && calcs.get(ref.part);
      if (calc && calc.op === 'change' && typeof e.value === 'number' && e.value > 0) return `+${fmt(cap, e.value)}`;
      return fmt(cap, e.value);
    }
    function fillText(text, refs) {
      if (!refs || !refs.length) return text;
      return String(text).replace(/\{([1-6])\}/g, (m, n) => (Number(n) <= refs.length ? refText(refs[Number(n) - 1]) : m));
    }
    /** The part's range: its own min/max, else the capability's, else 0–100. */
    function range(part, cap) {
      const lo = part.min != null ? part.min : cap && cap.min != null ? cap.min : 0;
      const hi = part.max != null ? part.max : cap && cap.max != null ? cap.max : 100;
      return hi > lo ? [lo, hi] : [lo, lo + 1];
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
      return { big: a.h >= 2, narrow: a.w === 1, wide: a.w >= 3 };
    }

    function build(part, where) {
      const node = el('div', { class: `wb-part wb-k-${part.kind}`, 'data-part': part.id });
      // Its background (lib/customDesigns.ts' `style`): the native tile, a pill, or none.
      if (part.kind !== 'container') {
        const style = styleOf(part);
        node.classList.add(style === 'none' ? 'wb-bare' : 'wb-tile');
        if (style === 'pill') node.classList.add('wb-pill');
      }
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
        const value = flow && flow.value !== undefined ? flow.value : c ? c.value : undefined;
        const look = lookOf(part, value, flow, valueOf);
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
        const key = id ? `i:${id}` : c && c.cap && part.slot ? `g:${part.slot}:${c.value === true}` : '';
        if (key === shown) return;
        shown = key;
        box.textContent = '';
        box.classList.remove('wb-glyph');
        box.style.removeProperty('--wb-mask');
        if (id && K.icons[id]) box.appendChild(icon(id, 'wb-svg'));
        else if (part.slot && c && c.cap) {
          const glyph = c.cap.icon || K.valueGlyph(part.slot.slice(part.slot.indexOf(':') + 1), c.value);
          box.classList.add('wb-glyph');
          K.setMask(box, glyph, '--wb-mask');
        }
        box.hidden = !box.firstChild && !box.classList.contains('wb-glyph');
      };
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

    /**
     * Wires a press: a tap, a second tap to confirm (*Tap again* in `hint`, else a badge), or a hold. A tap on a control
     * inside it (a container's switch) is that control's, not this one's.
     */
    function wirePress(part, node, hint, run) {
      const actions = part.actions || [];
      let asking = null;
      let tip = hint;
      const showHint = (text) => {
        if (!tip) tip = el('div', { class: 'wb-press-tip', hidden: '' }, node);
        tip.textContent = text || '';
        tip.hidden = !text;
        node.classList.toggle('wb-asking', !!text);
      };
      async function press() {
        // A switch's own press: it sends, shakes and vibrates itself.
        if (run) { if (!opts.preview) run(); return; }
        if (node.classList.contains('busy')) return;
        if (opts.preview && !actions.some(a => a.do === 'state')) return;
        node.classList.add('busy');
        try {
          await runActions(part);
          if (opts.onHaptic) opts.onHaptic();
          node.classList.add('done');
          setTimeout(() => node.classList.remove('done'), 1200);
        } catch (err) {
          console.error(err);
          K.shake(node);
          msg.set(err && K.KEY_PROBLEMS.includes(err.reason) ? t(err.reason) : t('setFailed', { name: part.name || '' }), true);
        } finally {
          node.classList.remove('busy');
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
        if (part.press === 'long') { showHint(t('hold')); setTimeout(() => showHint(''), 1500); return; }
        if (part.press === 'confirm' && !asking) {
          showHint(t('tapAgain'));
          asking = setTimeout(() => { asking = null; showHint(''); }, 3000);
          return;
        }
        clearTimeout(asking);
        asking = null;
        showHint('');
        press();
      }, {
        guard, keys: true,
        hold: part.press === 'long' ? { ms: 600, when: () => true, act: () => { showHint(''); press(); } } : null,
      });
    }

    const MAKERS = {
      switch(part, node) {
        const top = el('div', { class: 'wb-top' }, node);
        const ic = iconSlot(top);
        const tog = el('span', { class: 'wb-toggle', 'aria-hidden': 'true' }, top);
        const name = el('div', { class: 'wb-name' }, node);
        node.setAttribute('role', 'switch');
        node.tabIndex = 0;
        let on = false;
        // A second tap to confirm, or a hold, as a button's (a garage door, an alarm).
        if (part.press === 'confirm' || part.press === 'long') wirePress(part, node, null, () => act(part, node, !on));
        else K.onTap(node, () => { if (!opts.preview) act(part, node, !on); }, { guard });
        return (c, flow) => {
          on = c.value === true;
          ic(part, c, flow);
          node.classList.toggle('wb-on', on);
          node.setAttribute('aria-checked', on ? 'true' : 'false');
          tog.classList.toggle('on', on);
          name.textContent = (flow && flow.text) || part.name || c.name || '';
        };
      },
      button(part, node) {
        const ic = iconSlot(node);
        const name = el('div', { class: 'wb-name' }, node);
        const hint = el('div', { class: 'wb-sub wb-press-hint', hidden: '' }, node);
        node.setAttribute('role', 'button');
        node.tabIndex = 0;
        wirePress(part, node, hint);
        return (c, flow) => {
          ic(part, null, flow);
          const f = part.flowId && state.flows && state.flows[part.flowId];
          name.textContent = (flow && flow.text) || part.name || (f && !f.missing ? f.name : '');
        };
      },
      state(part, node, size) {
        if (part.stateType === 'choice') {
          const name = el('div', { class: 'wb-sub' }, node);
          const row = el('div', { class: 'wb-choices', role: 'radiogroup' }, node);
          const buttons = (part.choices || []).map((ch) => {
            const b = el('button', { type: 'button', class: 'wb-choice', role: 'radio', text: ch.label }, row);
            K.onTap(b, () => { setStateValue(part, ch.value); if (opts.onHaptic) opts.onHaptic(); }, { guard, keys: false, stop: true });
            return { b, ch };
          });
          return (c, flow) => {
            for (const { b, ch } of buttons) {
              b.classList.toggle('on', ch.value === c.value);
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
          const key = JSON.stringify(items.map(i => [i.slot, i.value, i.name, i.offline]));
          if (key === shown) return;
          shown = key;
          list.textContent = '';
          for (const item of items) {
            const row = el('div', { class: 'wb-rep-item', 'data-slot': item.slot }, list);
            const glyph = el('span', { class: 'wb-icon wb-glyph', 'aria-hidden': 'true' }, row);
            K.setMask(glyph, (item.cap && item.cap.icon) || K.valueGlyph(item.slot.slice(item.slot.indexOf(':') + 1), item.value), '--wb-mask');
            el('span', { class: 'wb-rep-name', dir: 'auto', text: item.name || '' }, row);
            el('span', { class: 'wb-rep-value', text: fmt(item.cap, item.value) }, row);
            row.classList.toggle('wb-on', item.value === true);
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
        // A bare bar to drag; its icon, name and value are components of their own beside it.
        const fill = el('span', { class: 'wb-fill', 'aria-hidden': 'true' }, node);
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
          fill.style.width = `${Math.min(1, Math.max(0, x)) * 100}%`;
          node.setAttribute('aria-valuenow', String(v));
          node.setAttribute('aria-label', part.name || c.name || '');
        };
      },
      sparkline(part, node) {
        // A line of a device value's history over its span, filling the box.
        let svg = null;
        return () => {
          if (svg) svg.remove();
          svg = sparkline(state.histories && state.histories[`${part.span}\n${part.slot}`], node, part.min, part.max);
        };
      },
      arc(part, node) {
        // A gauge's 270° arc of its value between its range.
        let svg = null;
        return (c) => {
          const [lo, hi] = range(part, c.cap);
          const v = Number(K.scaled(c.cap || {}, c.value));
          if (svg) svg.remove();
          svg = arc(Number.isFinite(v) ? (v - lo) / (hi - lo) : 0, node, part.thickness || 8);
        };
      },
      bar(part, node) {
        // A level bar of its value between its range, as thick as set, centred in its box.
        // Vertical: from the bottom up, as a tank or a battery.
        const up = part.dir === 'vertical';
        node.classList.toggle('wb-bar-v', up);
        const bar = el('div', { class: `wb-level${up ? ' wb-level-v' : ''}`, 'aria-hidden': 'true' }, node);
        const fill = el('i', null, bar);
        bar.style[up ? 'width' : 'height'] = `${part.thickness || 8}px`;
        return (c) => {
          const [lo, hi] = range(part, c.cap);
          const v = Number(K.scaled(c.cap || {}, c.value));
          fill.style[up ? 'height' : 'width'] = `${Number.isFinite(v) ? Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100)) : 0}%`;
        };
      },
      stepper(part, node) {
        const name = el('div', { class: 'wb-sub' }, node);
        const row = el('div', { class: 'wb-stepper' }, node);
        const minus = el('button', { type: 'button', class: 'wb-step', 'aria-label': '−', text: '−' }, row);
        const val = el('span', { class: 'wb-value' }, row);
        const plus = el('button', { type: 'button', class: 'wb-step', 'aria-label': '+', text: '+' }, row);
        let last = {};
        const step = (dir) => {
          if (opts.preview) return;
          const c = current(part);
          const base = Number(c && c.value);
          if (!Number.isFinite(base)) return;
          const [lo, hi] = range(part, c.cap);
          const s = part.step || 0.5;
          const v = Number(Math.min(hi, Math.max(lo, Math.round((base + dir * s) / s) * s)).toFixed(4));
          const p = pending.get(part.id);
          if (p) clearTimeout(p.timer);
          const timer = setTimeout(() => { pending.delete(part.id); act(part, node, v); }, STEP_SEND_MS);
          pending.set(part.id, { value: v, timer });
          update();
        };
        K.onTap(minus, () => step(-1), { guard, keys: false, stop: true });
        K.onTap(plus, () => step(1), { guard, keys: false, stop: true });
        return (c, flow) => {
          last = c;
          name.textContent = (flow && flow.text) || part.name || last.name || '';
          val.textContent = textOf(part, c, flow);
        };
      },
      choice(part, node) {
        const name = el('div', { class: 'wb-sub' }, node);
        const row = el('div', { class: 'wb-choices', role: 'radiogroup' }, node);
        const buttons = (part.choices || []).map((ch) => {
          const b = el('button', { type: 'button', class: 'wb-choice', role: 'radio', text: ch.label }, row);
          K.onTap(b, () => { if (!opts.preview) act(part, node, ch.value); }, { guard, keys: false, stop: true });
          return { b, ch };
        });
        return (c, flow) => {
          const v = c.value === undefined || c.value === null ? '' : String(c.value);
          for (const { b, ch } of buttons) {
            const on = ch.value === v;
            b.classList.toggle('on', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
          }
          name.textContent = (flow && flow.text) || part.name || c.name || '';
        };
      },
      variable(part, node) {
        const top = el('div', { class: 'wb-top' }, node);
        const val = el('span', { class: 'wb-value' }, top);
        const tog = el('span', { class: 'wb-toggle', 'aria-hidden': 'true' }, top);
        const name = el('div', { class: 'wb-name' }, node);
        let c = {};
        let input = null;
        /** A text or number variable is typed in the tile: Enter or leaving it sets it, Escape leaves it as it was. */
        function edit() {
          if (input) return;
          input = el('input', { class: 'wb-input', type: 'text', inputmode: c.cap.type === 'number' ? 'decimal' : 'text', 'aria-label': part.name || c.name || '' });
          input.value = c.value == null ? '' : String(c.value);
          val.replaceWith(input);
          node.classList.add('wb-editing');
          input.focus();
          input.select();
          let done = false;
          const finish = (save) => {
            if (done) return;
            done = true;
            const typed = input.value;
            input.replaceWith(val);
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
        K.onTap(node, () => {
          if (opts.preview || !c.cap || input) return;
          if (c.cap.type === 'boolean') { act(part, node, c.value !== true); return; }
          edit();
        }, { guard, keys: false });
        node.addEventListener('keydown', (e) => {
          if (e.target === node && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (!opts.preview && c.cap) { if (c.cap.type === 'boolean') act(part, node, c.value !== true); else edit(); } }
        });
        node.setAttribute('role', 'button');
        node.tabIndex = 0;
        return (cur, flow) => {
          c = cur;
          const bool = cur.cap && cur.cap.type === 'boolean';
          tog.hidden = !bool;
          tog.classList.toggle('on', cur.value === true);
          node.classList.toggle('wb-on', bool && cur.value === true);
          val.hidden = bool;
          if (!input) val.textContent = textOf(part, cur, flow);
          name.textContent = (flow && flow.text) || part.name || cur.name || '';
        };
      },
      text(part, node) {
        node.classList.add(`wb-size-${part.size || 'body'}`);
        if (part.weight) node.classList.add(`wb-weight-${part.weight}`);
        node.style.textAlign = part.align || 'left';
        const txt = el('div', { class: 'wb-text', dir: 'auto' }, node);
        // A Flow's text replaces the whole text, its {1} … left as typed.
        // A Flow's text replaces it, a Flow's value (with its units) too.
        return (c, flow) => {
          txt.textContent = (flow && flow.text) || (flow && flow.value !== undefined ? textOf(part, null, flow) : fillText(part.text || '', part.refs));
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
        const bg = part.background || { kind: 'none' };
        const own = bg.kind === 'color' ? bg.from : bg.kind === 'gradient' ? `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})` : '';
        // Its fill: a rule's or a Flow's colour, else its own background, else its colour from Style (CSS).
        return (c, flow, look) => { fill.style.background = look && look.tint ? 'var(--wk-c)' : own; };
      },
      icon(part, node) {
        if (part.grow) node.classList.add('wb-icon-grow');
        const ic = iconSlot(node);
        // With a device value: its own glyph (a lock open or closed), unless an icon is picked or a rule or Flow sets one.
        return (c, flow) => ic(part, part.slot ? c : null, flow);
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
        if (bg.kind === 'color') node.style.background = bg.from;
        else if (bg.kind === 'gradient') node.style.background = `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`;
        node.classList.toggle('wb-box-plain', bg.kind === 'none');
        if (bg.kind !== 'none') node.classList.add('wb-box-dark');
        const inner = el('div', { class: 'wb-inner' }, node);
        const kids = (part.parts || []).map(kid => [kid, inner.appendChild(build(kid, part.mode === 'free' ? 'free' : 'grid'))]);
        if (paged && nav && part.nav === 'dots') node.appendChild(nav); // dots under the page
        return () => {
          if (!paged) return;
          const page = pageOf(part);
          for (const [kid, n] of kids) n.classList.toggle('wb-off-page', (kid.page || 0) !== page);
          if (nav) [...nav.children].forEach((b, i) => { b.classList.toggle('on', i === page); b.setAttribute('aria-selected', i === page ? 'true' : 'false'); });
        };
      },
    };

    /** A pages container's page now: the builder's, its widget state's, else the one tapped (from 0). */
    function pageOf(part) {
      const n = (part.pages || []).length || 1;
      let page = pageNow.get(part.id) || 0;
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
        if (!state.design.parts.length) { setMessage(t('empty')); return; }
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
      /** Realtime `custom:flow`: what Flows set on one part (null: back to the design's). */
      pushFlow({ part, values }) {
        if (!state) return;
        state.flow = { ...(state.flow || {}) };
        if (values) state.flow[part] = values; else delete state.flow[part];
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
