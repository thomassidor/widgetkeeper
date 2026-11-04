/*
 * Combined Value: one full-width tile with one value read from several devices, folded into one number (the average,
 * the median, the sum, the lowest, the highest, the lowest to the highest, or how many are outside an OK range), large
 * on the right; the name and the range on the left; under them a chart of the devices against each other: a dot each on
 * a shared scale, or for a sum of values that are all zero or more, each device's share of it. A pill style puts the
 * dots (or the share) on the right. An OK range colours the tile when the value is outside it, and the dots outside it.
 * A tap opens every device's value under the tile. Plain browser JS (served as-is).
 */
(function () {
  const { el, COLORS, TIGHT_UNITS, formatNumber, scaled, valueGlyph, setMask, applyColors, messageLine, okRange, okLevel, onTap } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const DEFAULT_STRINGS = {
    selectValue: 'Pick a value in the widget settings.',
    noDevices: 'None of the devices has this value.',
    error: 'Could not load the value.',
    notRead: '__count__ of __total__ not read',
    leftOut: '__count__ of __total__ left out',
    others: 'Others',
    upTo: 'up to __value__',
    from: 'from __value__',
    ofTotal: 'of __total__',
    allOk: 'All within range',
    noRange: 'Set an OK range in the settings',
    unavailable: '__count__ unavailable',
    otherUnits: 'other unit, left out',
  };

  const SHOWS = ['avg', 'median', 'sum', 'min', 'max', 'range', 'out'];
  /** The levels past the OK range, worst last. */
  const PAST = ['out', 'far'];
  /** The share bar's colours, biggest first (kit.css's bright set), and Others. */
  const SHARE_COLORS = ['blue', 'green', 'orange', 'purple'];
  /** The share bar names every device up to this many, else the biggest three and Others. */
  const SHARE_ALL = 4;

  /**
   * What the readings fold into: their sum, average, median, lowest and highest (raw, as the devices report them), with
   * the first device at the lowest and at the highest; null without a reading. The median of an even count is the
   * average of the middle two.
   * @param {{name: string, value: number}[]} read
   */
  function combine(read) {
    if (!read.length) return null;
    let sum = 0;
    let lo = read[0];
    let hi = read[0];
    for (const d of read) {
      sum += d.value;
      if (d.value < lo.value) lo = d;
      if (d.value > hi.value) hi = d;
    }
    const sorted = read.map(d => d.value).sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { sum, avg: sum / read.length, median, min: lo.value, max: hi.value, lo: lo.name, hi: hi.name, n: read.length };
  }

  /** The worse of two levels (`far` over `out` over the rest). */
  const worse = (a, b) => (PAST.indexOf(b) > PAST.indexOf(a) ? b : a);

  /**
   * The dots' scale, in the shown numbers (`scaled()`): 0–100 for a `%` value, so a low battery sits at the left; else
   * the lowest to the highest with a little room either side, kept from crossing zero when every value is above it.
   * @returns {[number, number]}
   */
  function scaleOf(cap, min, max) {
    if (cap.units === '%') return [Math.min(0, min), Math.max(100, max)];
    const pad = (max - min) * 0.08 || Math.abs(max) * 0.05 || 1;
    const a = min - pad;
    return [min >= 0 && a < 0 ? 0 : a, max + pad];
  }

  /**
   * The share bar's parts: every device when there are few, else the biggest three and the rest as Others; each with
   * its colour's name (`others` for the rest).
   * @param {{name: string, value: number}[]} read
   */
  function shareParts(read) {
    const sorted = [...read].sort((a, b) => b.value - a.value);
    const keep = sorted.length <= SHARE_ALL ? sorted.length : SHARE_ALL - 1;
    const parts = sorted.slice(0, keep).map((d, i) => ({ name: d.name, value: d.value, color: SHARE_COLORS[i] }));
    const rest = sorted.slice(keep).reduce((a, d) => a + d.value, 0);
    if (keep < sorted.length) parts.push({ name: null, value: rest, color: 'others' });
    return parts;
  }

  /**
   * @param {HTMLElement} root
   * @param {{ t?: (key: string, tokens?: object) => string, show?: string, name?: string, range?: boolean, chart?: boolean,
   *   okRange?: string, tileStyle?: string, color?: string, colorStyle?: string, onHeight?: (h: number) => void,
   *   onTap?: () => void }} opts
   */
  function createCombinedWidget(root, opts = {}) {
    const t = (key, tokens) => {
      const s = opts.t ? opts.t(`combined.${key}`, tokens) : null;
      if (s && s !== `combined.${key}`) return s;
      return (DEFAULT_STRINGS[key] || key).replace(/__(\w+)__/g, (_, k) => (tokens && tokens[k] != null ? tokens[k] : ''));
    };
    const show = SHOWS.includes(opts.show) ? opts.show : 'avg';
    const withRange = opts.range !== false;
    const withChart = opts.chart !== false;
    const pill = opts.tileStyle === 'pill';
    const typedName = typeof opts.name === 'string' ? opts.name.trim() : '';

    /** @type {{capability: any, devices: any[]} | null} */
    let state = null;
    /** Every device's value is open under the tile (a tap toggles it). */
    let listOpen = false;
    const message = messageLine(() => render(), { clear: () => { state = null; } });

    root.classList.add('cv');
    root.classList.toggle('cv-pill', pill);
    // A colour tints the tile (Muted) or fills it with the shade (Vivid); without one, a plain tile.
    applyColors(root, { style: opts.colorStyle, color: COLORS.includes(opts.color) ? opts.color : null });
    root.classList.toggle('cv-colored', COLORS.includes(opts.color));
    root.dataset.show = show;

    const tile = el('div', { class: 'cv-tile' }, root);
    const head = el('div', { class: 'cv-head' }, tile);
    const icon = el('span', { class: 'cv-icon' }, head);
    const text = el('div', { class: 'cv-text' }, head);
    const nameEl = el('span', { class: 'cv-name', dir: 'auto' }, text);
    const lineEl = el('span', { class: 'cv-line', dir: 'auto' }, text);
    const valueEl = el('span', { class: 'cv-value' }, head);
    const chartEl = el('div', { class: 'cv-chart' }, pill ? head : tile);
    const listEl = el('div', { class: 'cv-list', hidden: '' }, root);
    const messageEl = el('div', { class: 'cv-message', dir: 'auto' }, root);
    tile.style.display = 'none'; // until there's a value to show
    // A tap on the tile opens every device's value under it; another tap (on either) closes it.
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.setAttribute('aria-expanded', 'false');
    const toggle = () => {
      if (!state || !state.capability) return;
      listOpen = !listOpen;
      if (opts.onTap) opts.onTap();
      render();
    };
    onTap(tile, toggle);
    onTap(listEl, toggle, { keys: false });

    function setState(next) {
      state = next && typeof next === 'object' ? { capability: next.capability || null, devices: Array.isArray(next.devices) ? next.devices : [] } : null;
      message.reset();
      render();
    }

    function pushChange({ deviceId, capabilityId, value }) {
      if (!state || !state.capability || state.capability.id !== capabilityId) return;
      const d = state.devices.find(x => x.id === deviceId && !x.missing);
      if (!d) return;
      d.value = typeof value === 'number' && isFinite(value) ? value : null;
      render();
    }

    /** A message in place of the tile; a transient one goes by itself and keeps the tile. */
    function setMessage(textValue, transient) {
      message.set(textValue, transient);
    }

    /** A number as the tiles show it (`averaged`: three significant digits within the decimals). */
    const num = (v, averaged = false) => formatNumber(state.capability, v, averaged).replace(/^-/, '−');
    const units = () => state.capability.units || '';
    const withUnits = (s) => {
      const u = units();
      return !u ? s : TIGHT_UNITS.test(u) ? `${s}${u}` : `${s} ${u}`;
    };
    /** `19.6–23.1°`, spaced when a number is negative (`−19.5 – −17.2°`). */
    const span = (a, b) => `${num(a)}${a < 0 || b < 0 ? ' – ' : '–'}${num(b)}`;

    /**
     * The OK range in the shown numbers (`18–24`, `<1000`, `>20`), or null. Empty is none: unlike Value Matrix's rooms,
     * the devices may be anything (an outdoor sensor, a freezer), so a usual indoor range would colour them wrongly.
     */
    const ok = okRange(opts.okRange) || null;
    /** A raw reading's level against the OK range (`plain` without one). */
    const levelOf = (x, ok) => okLevel(scaled(state.capability, x), ok);

    /** The main value: the number (or the span, or the count) and its units apart, so the units can be smaller. */
    function mainParts(c, f) {
      if (show === 'out') return f.ok ? [String(f.past.length), t('ofTotal', { total: c.n })] : ['–', ''];
      if (show === 'range') return [span(c.min, c.max), units()];
      return [num(c[show], show === 'avg' || show === 'median'), units()];
    }

    /**
     * The line under the name: what's missing (or left out), else the device the value comes from (Lowest, Highest) and
     * the range, its other end only when the value is one (`up to 23.1°C`); for the count, the devices outside the range,
     * worst first.
     */
    function lineText(c, f) {
      if (f.leftOut) return t('leftOut', { count: f.leftOut, total: f.total });
      if (f.missing) return t('notRead', { count: f.missing, total: f.total });
      const parts = [];
      if (show === 'out') {
        if (!f.ok) return t('noRange');
        parts.push(f.past.length ? f.past.map(d => d.name).join(', ') : t('allOk'));
      }
      if (show === 'min') parts.push(c.lo);
      if (show === 'max') parts.push(c.hi);
      if (withRange && show === 'min') parts.push(t('upTo', { value: withUnits(num(c.max)) }));
      else if (withRange && show === 'max') parts.push(t('from', { value: withUnits(num(c.min)) }));
      else if (withRange && show !== 'range') parts.push(withUnits(span(c.min, c.max)));
      return parts.join(' · ');
    }

    /** The tile's level: the shown value's against the OK range (the worse end of a span; for the count, the worst device). */
    function tileLevel(c, f) {
      if (!f.ok) return 'plain';
      if (show === 'out') return f.past.reduce((a, d) => worse(a, d.level), 'good');
      if (show === 'range') return worse(levelOf(c.min, f.ok), levelOf(c.max, f.ok));
      return levelOf(c[show], f.ok);
    }

    /**
     * Every device under the tile: the readings in the order the value reads them (highest first for the sum and the
     * highest, worst first for the count, else lowest first), then those without a reading or in other units, and how
     * many can't be read. The device the value comes from is bold, one outside the OK range marked by its level.
     */
    function renderList(read, c, f) {
      listEl.textContent = '';
      const down = show === 'sum' || show === 'max';
      const rank = d => (show === 'out' ? -PAST.indexOf(d.level) : 0);
      const rows = [...read].sort((a, b) => rank(a) - rank(b) || (down ? b.value - a.value : a.value - b.value));
      const from = show === 'min' ? c.min : show === 'max' ? c.max : null;
      for (const d of rows) {
        const row = el('div', { class: `cv-row${d.value === from ? ' hl' : ''}` }, listEl);
        el('i', { class: 'cv-mark', 'data-level': d.level }, row);
        el('span', { class: 'cv-row-name', dir: 'auto' }, row).textContent = d.name;
        el('span', { class: 'cv-row-value' }, row).textContent = withUnits(num(d.value));
      }
      for (const d of f.unread) {
        const row = el('div', { class: 'cv-row left' }, listEl);
        el('i', { class: 'cv-mark' }, row);
        el('span', { class: 'cv-row-name', dir: 'auto' }, row).textContent = d.name;
        const u = d.otherUnits;
        const v = typeof d.value === 'number' && isFinite(d.value) && u != null
          ? `${formatNumber({ ...state.capability, units: u, min: null, max: null }, d.value).replace(/^-/, '−')}${u ? (TIGHT_UNITS.test(u) ? u : ` ${u}`) : ''}` : '–';
        el('span', { class: 'cv-row-value', title: u != null ? t('otherUnits') : null }, row).textContent = v;
      }
      if (f.unavailable) el('div', { class: 'cv-row left' }, listEl).textContent = t('unavailable', { count: f.unavailable });
    }

    function renderDots(read, c) {
      const cap = state.capability;
      const v = x => scaled(cap, x);
      const [a, b] = scaleOf(cap, v(c.min), v(c.max));
      const at = x => `${(((v(x) - a) / (b - a)) * 100).toFixed(2)}%`;
      const strip = el('div', { class: 'cv-strip' }, chartEl);
      el('div', { class: 'cv-track' }, strip);
      const band = el('div', { class: `cv-band${show === 'range' ? ' hl' : ''}` }, strip);
      band.style.left = at(c.min);
      band.style.width = `calc(${at(c.max)} - ${at(c.min)})`;
      if (a < 0 && b > 0) el('div', { class: 'cv-zero' }, strip).style.left = at(0);
      for (const d of read) {
        const hl = (show === 'min' && d.value === c.min) || (show === 'max' && d.value === c.max) || (show === 'range' && (d.value === c.min || d.value === c.max));
        const dot = el('div', { class: `cv-dot${hl ? ' hl' : ''}`, title: `${d.name}: ${withUnits(num(d.value))}` }, strip);
        if (PAST.includes(d.level)) dot.dataset.level = d.level;
        dot.style.left = at(d.value);
      }
      if (show === 'avg') el('div', { class: 'cv-avg' }, strip).style.left = at(c.avg);
      if (pill) return;
      const ends = el('div', { class: 'cv-ends' }, chartEl);
      el('span', { class: `cv-end${show === 'min' || show === 'range' ? ' hl' : ''}`, dir: 'auto' }, ends).textContent = c.lo;
      if (read.length > 1) el('span', { class: `cv-end${show === 'max' || show === 'range' ? ' hl' : ''}`, dir: 'auto' }, ends).textContent = c.hi;
    }

    function renderShare(read, c) {
      const parts = shareParts(read);
      const bar = el('div', { class: 'cv-share' }, chartEl);
      for (const p of parts) {
        const seg = el('i', { 'data-share': p.color, title: p.name || t('others') }, bar);
        seg.style.flexGrow = String(p.value);
      }
      if (pill) return;
      const legend = el('div', { class: 'cv-legend' }, chartEl);
      for (const p of parts) {
        const item = el('span', { class: 'cv-key' }, legend);
        el('i', { 'data-share': p.color }, item);
        el('span', { class: 'cv-key-name', dir: 'auto' }, item).textContent = p.name || t('others');
        el('b', {}, item).textContent = `${Math.round((p.value / c.sum) * 100)}%`;
      }
    }

    let lastHeight = 0;
    function render() {
      if (state && state.capability) {
        const cap = state.capability;
        const counts = d => !d.missing && d.otherUnits == null && typeof d.value === 'number' && isFinite(d.value);
        const read = state.devices.filter(counts).map(d => ({ name: d.name, value: d.value, level: levelOf(d.value, ok) }));
        const total = state.devices.length;
        const unread = state.devices.filter(d => !d.missing && !counts(d));
        const leftOut = unread.filter(d => d.otherUnits != null).length;
        const unavailable = state.devices.filter(d => d.missing).length;
        const f = {
          ok, total, unread, unavailable, leftOut: leftOut ? total - read.length : 0, missing: total - read.length,
          past: read.filter(d => PAST.includes(d.level)).sort((a, b) => PAST.indexOf(b.level) - PAST.indexOf(a.level)),
        };
        const c = combine(read);
        nameEl.textContent = typedName || cap.title;
        root.dataset.capability = cap.id;
        setMask(icon, valueGlyph(cap.id), '--cv-mask');
        valueEl.textContent = '';
        chartEl.textContent = '';
        if (c) {
          const [n, u] = mainParts(c, f);
          // The count's `of 12` is spaced and untranslated units aren't: both go through withUnits() but the count.
          const tight = show !== 'out' && TIGHT_UNITS.test(u);
          if (pill) {
            valueEl.textContent = !u ? n : show === 'out' ? `${n} ${u}` : withUnits(n);
          } else {
            el('span', { class: 'cv-number' }, valueEl).textContent = n;
            if (u) el('span', { class: `cv-units${tight ? ' tight' : ''}${show === 'out' ? ' count' : ''}` }, valueEl).textContent = u;
          }
        } else {
          valueEl.textContent = '–';
        }
        const level = c ? tileLevel(c, f) : 'plain';
        if (PAST.includes(level)) tile.dataset.level = level;
        else delete tile.dataset.level;
        const line = c ? lineText(c, f) : t('notRead', { count: total, total });
        // The pill's value line carries the value first, then the line; the tile's line is under the name.
        lineEl.textContent = pill ? [valueEl.textContent, line].filter(Boolean).join(' · ') : line;
        lineEl.hidden = !lineEl.textContent;
        head.classList.toggle('one', lineEl.hidden);
        const share = show === 'sum' && read.every(d => d.value >= 0) && c && c.sum > 0;
        if (withChart && c) {
          if (share) renderShare(read, c);
          else renderDots(read, c);
        }
        chartEl.hidden = !withChart || !c;
        root.dataset.chart = !withChart || !c ? 'none' : share ? 'share' : 'dots';
        if (listOpen) renderList(read, c || { min: null, max: null }, f);
      }
      const open = listOpen && !!state && !!state.capability;
      listEl.hidden = !open;
      tile.setAttribute('aria-expanded', String(open));
      root.classList.toggle('cv-open', open);
      // No device has the value (or none of those picked): said in place of the tile.
      const note = message.text || (state && !state.capability ? t('noDevices') : '');
      messageEl.textContent = note;
      messageEl.style.display = note ? '' : 'none';
      tile.style.display = state && state.capability ? '' : 'none';
      // A passing message under a tile that stays: the refresh failed.
      messageEl.classList.toggle('error', !!message.text && !!state && !!state.capability);

      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h && h !== lastHeight) { lastHeight = h; if (opts.onHeight) opts.onHeight(h); }
    }

    return { setState, pushChange, setMessage, render, t, toggle };
  }

  window.createCombinedWidget = createCombinedWidget;
  window.combineValues = combine;
})();
