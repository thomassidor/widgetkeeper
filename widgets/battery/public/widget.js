/*
 * Batteries: the battery of each picked device in one tile, lowest first, so the ones that need a new battery are on
 * top. A cell per device: the level top left (or Low/OK for a device that only says whether it's low), a battery
 * glyph filled to it top right, the device's name under both; red below `redBelow`, yellow below `yellowBelow`, green
 * when fine with `greenWhenFine`. Plain browser JS (served as-is).
 */
(function () {
  const { el, formatNumber, applyColors, messageLine, tileNames, markOffline } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const DEFAULT_STRINGS = {
    title: 'Batteries',
    selectDevices: 'Select devices in the widget settings.',
    error: 'Could not load the batteries.',
    unavailable: 'Unavailable',
    noBatteries: 'None of these devices has a battery.',
    low: 'Low',
    ok: 'OK',
    summary: '__low__ low · __fine__ fine',
    unavailableCount: '__count__ unavailable',
    renameFailed: 'Could not save the name.',
  };

  /** A level setting as a number from 0 to 100, else the default. */
  function percent(value, fallback) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
  }

  /**
   * How a battery stands: `alert` below `red`, `warn` below `yellow`, else `fine`; a low alarm on is `alert`, off
   * `fine`; null when it hasn't reported. The level wins over the alarm.
   * @param {{level?: number|null, low?: boolean|null}} d
   * @param {{red?: number, yellow?: number}} [limits]
   */
  function batteryLevel(d, { red = 10, yellow = 20 } = {}) {
    if (!d) return null;
    if (typeof d.level === 'number' && isFinite(d.level)) return d.level < red ? 'alert' : d.level < yellow ? 'warn' : 'fine';
    if (typeof d.low === 'boolean') return d.low ? 'alert' : 'fine';
    return null;
  }

  /**
   * Where a device goes, lowest first: by its level; a low alarm on before every level, off after them; one that hasn't
   * reported after those, a missing one last. Equal ones keep the order they were picked in.
   */
  function sortKey(d) {
    if ('missing' in d) return 1e4;
    if (typeof d.level === 'number' && isFinite(d.level)) return d.level;
    if (d.low === true) return -1;
    if (d.low === false) return 1e3;
    return 2e3;
  }

  /** The devices to show, lowest first: a device without a battery is left out. */
  function batteryOrder(devices) {
    return (Array.isArray(devices) ? devices : [])
      .filter(d => d && typeof d === 'object' && typeof d.id === 'string' && !d.none)
      .map((d, i) => ({ d, i }))
      .sort((a, b) => sortKey(a.d) - sortKey(b.d) || a.i - b.i)
      .map(({ d }) => d);
  }

  /** A battery outline with its terminal, filled to `fill` (0–1). */
  function glyph(parent, fill) {
    const svg = el('svg', { class: 'bt-glyph', viewBox: '0 0 24 14', 'aria-hidden': 'true' }, parent, SVG_NS);
    el('rect', { class: 'bt-glyph-case', x: '1', y: '1', width: '19', height: '12', rx: '2.5' }, svg, SVG_NS);
    el('path', { class: 'bt-glyph-tip', d: 'M21.5 5v4' }, svg, SVG_NS);
    const f = Math.max(0, Math.min(1, fill));
    if (f > 0) el('rect', { class: 'bt-glyph-fill', x: '3', y: '3', width: String(Math.max(1, 15 * f)), height: '8', rx: '1' }, svg, SVG_NS);
    return svg;
  }

  /**
   * @param {HTMLElement} root
   * @param {{ columns?: number|string, yellowBelow?: number|string, redBelow?: number|string, greenWhenFine?: boolean,
   *   fillLevel?: boolean, colorStyle?: string, renameTiles?: boolean, onRename?: (key: string, name: string) => Promise<any>,
   *   t?: (key: string, tokens?: object) => string, onHeight?: (h: number) => void }} opts
   */
  function createBatteryWidget(root, opts = {}) {
    const t = window.WidgetkeeperKit.translator('battery', DEFAULT_STRINGS, opts);

    const limits = { red: percent(opts.redBelow, 10), yellow: percent(opts.yellowBelow, 20) };
    const green = opts.greenWhenFine !== false;
    let devices = []; // [{ id, name, level, low, offline? } | { id, name, none } | { id, missing }]
    // What failed: a lasting message replaces the content, a transient one goes by itself.
    const message = messageLine(() => render(), { clear: () => { devices = []; } });

    // Typed names (Rename tiles), by device id. A name that couldn't be saved shakes its row.
    let shaking = null;
    const typed = tileNames(opts, () => render(), (key) => {
      shaking = key;
      setTimeout(() => { if (shaking === key) shaking = null; }, 400);
      message.set(t('renameFailed'), true);
    });
    root.classList.add('bt');
    root.classList.toggle('renaming', typed.renaming);
    // Fill to the level: each cell filled from the left as far as its battery (the CSS draws it, in Muted only).
    root.classList.toggle('bt-fill', opts.fillLevel === true);
    root.dataset.columns = ['2', '4'].includes(String(opts.columns)) ? String(opts.columns) : '3';
    applyColors(root, { style: opts.colorStyle });
    const body = el('div', { class: 'bt-body' }, root);
    const messageEl = el('div', { class: 'bt-message', dir: 'auto' }, root);

    function setState(list) {
      devices = Array.isArray(list) ? list : [];
      message.reset();
      render();
    }

    /** A realtime change: the level or the low alarm of one device. The order may change, so all is drawn again. */
    function pushChange({ deviceId, capabilityId, value }) {
      const d = devices.find(x => x && x.id === deviceId && !('missing' in x) && !x.none);
      if (!d) return;
      if (capabilityId === 'measure_battery') d.level = typeof value === 'number' && isFinite(value) ? value : null;
      else if (capabilityId === 'alarm_battery') d.low = typeof value === 'boolean' ? value : null;
      else return;
      render();
    }

    const nameOf = d => typed.name(d.id, d.name);

    /** The level as text (the number; the % goes after it, small), or Low/OK, or a dash. */
    function valueText(d) {
      if (typeof d.level === 'number' && isFinite(d.level)) return { num: formatNumber({ decimals: 0 }, d.level), pct: true };
      if (typeof d.low === 'boolean') return { num: t(d.low ? 'low' : 'ok'), pct: false };
      return { num: '–', pct: false };
    }

    /** How full the glyph is: the level, else nearly empty for Low and full for OK. */
    function fillOf(d) {
      if (typeof d.level === 'number' && isFinite(d.level)) return d.level / 100;
      if (typeof d.low === 'boolean') return d.low ? 0.1 : 1;
      return 0;
    }

    function cell(grid, d) {
      const node = el('div', { class: 'bt-cell', 'data-key': d.id, role: 'img' }, grid);
      if ('missing' in d) {
        node.classList.add('missing');
        const top = el('div', { class: 'bt-top' }, node);
        el('span', { class: 'bt-num', text: '–' }, top);
        glyph(top, 0);
        el('div', { class: 'bt-label', dir: 'auto', text: t('unavailable') }, node);
        node.setAttribute('aria-label', t('unavailable'));
        return;
      }
      const level = batteryLevel(d, limits);
      const tone = level === 'fine' && !green ? null : level;
      if (tone) node.dataset.tone = tone;
      markOffline(node, d.offline, t('unavailable'));
      node.style.setProperty('--bt-lvl', String(Math.max(0, Math.min(1, fillOf(d)))));
      const top = el('div', { class: 'bt-top' }, node);
      const { num, pct } = valueText(d);
      const n = el('span', { class: 'bt-num', text: num }, top);
      if (pct) el('span', { class: 'bt-pct', text: '%' }, n);
      glyph(top, fillOf(d));
      el('div', { class: 'bt-label', dir: 'auto', text: nameOf(d) }, node);
      node.setAttribute('aria-label', `${nameOf(d)}: ${num}${pct ? ' %' : ''}`);
    }

    /** The heading's count: how many are low, how many fine, and how many can't be read. */
    function summary(list) {
      let low = 0, fine = 0, gone = 0;
      for (const d of list) {
        if ('missing' in d || d.offline) { gone++; continue; }
        const level = batteryLevel(d, limits);
        if (level === 'alert' || level === 'warn') low++;
        else if (level === 'fine') fine++;
      }
      const text = t('summary', { low, fine });
      return gone ? `${text} · ${t('unavailableCount', { count: gone })}` : text;
    }

    /** Rename tiles: a field per device in place of its cell (a missing one has none). */
    function renameTile(list) {
      const tile = el('section', { class: 'bt-tile bt-renaming' }, body);
      for (const d of list) {
        if ('missing' in d) continue;
        const row = el('div', { class: `bt-rename-row${d.id === shaking ? ' shake' : ''}`, 'data-rename': d.id }, tile);
        row.append(typed.field(d.id, d.name));
      }
    }

    const reportHeight = window.WidgetkeeperKit.heightReporter(root, opts);

    function render() {
      // A field being typed in isn't taken away (moving it would end the typing): drawn once it's left.
      const active = document.activeElement;
      if (typed.renaming && active && active.classList.contains('wk-rename') && body.contains(active)) {
        active.addEventListener('blur', () => render(), { once: true });
        return;
      }
      const list = batteryOrder(devices);
      body.textContent = '';
      if (list.length) {
        if (typed.renaming) renameTile(list);
        else {
          const tile = el('section', { class: 'bt-tile' }, body);
          const head = el('div', { class: 'bt-head' }, tile);
          el('span', { class: 'bt-title', dir: 'auto', text: t('title') }, head);
          el('span', { class: 'bt-summary', dir: 'auto', text: summary(list) }, head);
          const grid = el('div', { class: 'bt-grid' }, tile);
          for (const d of list) cell(grid, d);
        }
      }
      // Devices that came back without a battery say so, unless a message says more.
      const shown = message.text || (devices.length && !list.length ? t('noBatteries') : '');
      messageEl.textContent = shown;
      messageEl.style.display = shown ? '' : 'none';
      messageEl.classList.toggle('error', !!message.text && list.length > 0);
      reportHeight();
    }

    if (typeof ResizeObserver === 'function') new ResizeObserver(() => reportHeight()).observe(body);

    return { setState, setNames: typed.set, pushChange, setMessage: (text, transient) => message.set(text, transient), render, t };
  }

  window.createBatteryWidget = createBatteryWidget;
  window.batteryLevel = batteryLevel;
  window.batteryOrder = batteryOrder;
})();
