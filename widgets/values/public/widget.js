/*
 * Device Values: a grid of half-height tiles in the style of Device Quick Actions, each showing one
 * capability of a device: its icon and value on top, the device name below (and, if picked, a second value of the
 * same device, small at the end of the name's row). Display only.
 * Plain browser JS (served as-is).
 */
(function () {
  const { el, COLORS, tileNames, formatValue, valueGlyph: glyph, applyColors, messageLine } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const DEFAULT_STRINGS = {
    selectSlots: 'Pick device values in the widget settings.',
    error: 'Could not load the values.',
    unavailable: 'Unavailable',
    on: 'On',
    off: 'Off',
    renameFailed: 'Could not save the name.',
  };

  /** The capability's own icon, else the glyph; batteries always get the glyph (drivers' own differ, some with a fixed level). */
  function iconFor(s) {
    if ('missing' in s) return glyph(s.capabilityId, null);
    const base = s.capabilityId.split('.')[0];
    if (base === 'measure_battery' || base === 'alarm_battery') return glyph(s.capabilityId, s.value);
    return s.capability.icon || glyph(s.capabilityId, s.value);
  }

  /** Units written without a space, as the Homey app does (`21.5°C`, `45%`). */

  /**
   * A `%` number as 0–100, or null for anything else. Homey's `dim` (and some others) report `%` as 0–1
   * (`max: 1`), so a range of 0–1 is scaled up.
   * @param {{type: string, units: string|null, min?: number|null, max?: number|null}} cap
   * @param {unknown} value
   */
  function percentOf(cap, value) {
    if (cap.type !== 'number' || cap.units !== '%' || typeof value !== 'number' || !isFinite(value)) return null;
    return cap.max === 1 && (cap.min == null || cap.min === 0) ? value * 100 : value;
  }

  /** The fill colour for a percentage: red below `red`, yellow below `yellow`, else green. */
  function levelOf(percent, thresholds) {
    if (percent < thresholds.red) return 'red';
    if (percent < thresholds.yellow) return 'yellow';
    return 'green';
  }

  const keyOf = s => `${s.deviceId}:${s.capabilityId}`;

  /** Each tile's key for its typed name: the value's own key, then `#2`, `#3` … for repeats, so reordering keeps the names. */
  function nameKeys(slots) {
    const seen = new Map();
    return slots.map((s) => {
      const k = keyOf(s);
      const n = (seen.get(k) || 0) + 1;
      seen.set(k, n);
      return n > 1 ? `${k}#${n}` : k;
    });
  }

  /**
   * @param {HTMLElement} root
   * @param {{ t?: (key: string, tokens?: object) => string, columns?: number|string, tileStyle?: string, colorStyle?: string,
   *   percentFill?: boolean, redBelow?: number|string, yellowBelow?: number|string,
   *   renameTiles?: boolean, onRename?: (key: string, name: string) => Promise<any>,
   *   onHeight?: (h: number) => void }} opts
   */
  function createValuesWidget(root, opts = {}) {
    const t = (key, tokens) => {
      const s = opts.t ? opts.t(`values.${key}`, tokens) : null;
      if (s && s !== `values.${key}`) return s;
      return (DEFAULT_STRINGS[key] || key).replace(/__(\w+)__/g, (_, k) => (tokens && tokens[k] != null ? tokens[k] : ''));
    };

    let slots = []; // [{ deviceId, capabilityId, name, capability, value, color? } | { deviceId, capabilityId, missing }]
    // What failed: a lasting message replaces the content, a transient one goes by itself.
    const message = messageLine(() => render(), { clear: () => { slots = []; } });

    root.classList.add('vt');
    const typed = tileNames(opts, () => render(), (key) => {
      const i = nameKeys(slots).indexOf(key);
      const tile = i >= 0 ? tiles.get(`${keyOf(slots[i])}#${i}`) : null;
      if (tile) {
        tile.tile.classList.remove('shake');
        void tile.tile.offsetWidth; // restart the animation
        tile.tile.classList.add('shake');
      }
      setMessage(t('renameFailed'), true);
    });
    root.classList.toggle('renaming', typed.renaming);
    root.dataset.columns = String(opts.columns) === '2' ? '2' : '3';
    // Pill tiles: Sensor Alarms' tile, the icon beside the name over the value (compact, Quick Actions' tile, otherwise).
    const pill = opts.tileStyle === 'pill';
    root.classList.toggle('vt-pill', pill);
    // Vivid colours (kit.css): fills and Flow colours in the darker shades at full strength, with text that reads on them (the
    // 22 % tint otherwise). The old Bright reads as Vivid.
    const deep = applyColors(root, { style: opts.colorStyle }) === 'deep';
    const num = (v, fallback) => (v !== '' && v != null && isFinite(Number(v)) ? Number(v) : fallback);
    const thresholds = { red: num(opts.redBelow, 10), yellow: num(opts.yellowBelow, 20) };
    const grid = el('div', { class: 'vt-grid' }, root);
    const messageEl = el('div', { class: 'vt-message', dir: 'auto' }, root);
    /** @typedef {{icon: HTMLElement, value: HTMLElement, name: HTMLElement, second: HTMLElement, secondIcon: HTMLElement,
     *   secondValue: HTMLElement}} TileParts */
    /** @type {Map<string, TileParts & {tile: HTMLElement, ink: TileParts | null}>} */
    const tiles = new Map();

    function setState(list) {
      slots = Array.isArray(list) ? list : [];
      message.reset();
      render();
    }

    function pushChange({ deviceId, capabilityId, value }) {
      let changed = false;
      for (const s of slots) {
        if (s.deviceId !== deviceId || 'missing' in s) continue;
        if (s.capabilityId === capabilityId) {
          s.value = value;
          changed = true;
        }
        if (s.second && s.second.capabilityId === capabilityId) {
          s.second.value = value;
          changed = true;
        }
      }
      if (changed) render();
    }

    /** A tile colour set by a Flow (`color` null resets it), for every tile showing that value. */
    function pushColor({ deviceId, capabilityId, color }) {
      let changed = false;
      for (const s of slots) {
        if (s.deviceId === deviceId && s.capabilityId === capabilityId && !('missing' in s)) {
          s.color = color || undefined;
          changed = true;
        }
      }
      if (changed) render();
    }

    /** A message under the tiles. Persistent messages also clear the tiles. */
    function setMessage(text, transient) {
      message.set(text, transient);
    }

    /**
     * A tile's icon, value and name in `parent`: the icon and value over the name, or in pill tiles the icon beside the name
     * over the value. The second value (hidden without one) ends the name's row, or in pill tiles the value's.
     */
    function parts(parent) {
      const secondIn = (row) => {
        const second = el('span', { class: 'vt-second' }, row);
        return { second, secondIcon: el('span', { class: 'vt-second-icon' }, second), secondValue: el('span', { class: 'vt-second-value', dir: 'auto' }, second) };
      };
      if (pill) {
        const icon = el('span', { class: 'vt-icon' }, parent);
        const text = el('div', { class: 'vt-text' }, parent);
        const name = el('span', { class: 'vt-name', dir: 'auto' }, text);
        const row = el('div', { class: 'vt-row' }, text);
        return { icon, value: el('span', { class: 'vt-value', dir: 'auto' }, row), name, ...secondIn(row) };
      }
      const top = el('div', { class: 'vt-top' }, parent);
      const icon = el('span', { class: 'vt-icon' }, top);
      const value = el('span', { class: 'vt-value', dir: 'auto' }, top);
      const row = el('div', { class: 'vt-row' }, parent);
      return { icon, value, name: el('span', { class: 'vt-name', dir: 'auto' }, row), ...secondIn(row) };
    }

    // A slot can appear twice (the same value picked for two tiles), so tiles are keyed by position too.
    function tileFor(key) {
      let tile = tiles.get(key);
      if (!tile) {
        const node = el('div', { class: 'vt-tile', 'data-slot': key });
        tile = { tile: node, ...parts(node), ink: null };
        // Vivid fills: the same icon and text again in the ink colour, which the CSS clips to the fill.
        if (deep) tile.ink = parts(el('div', { class: 'vt-ink', 'aria-hidden': 'true' }, node));
        tiles.set(key, tile);
      }
      return tile;
    }

    const setMask = (node, url) => window.WidgetkeeperKit.setMask(node, url, '--vt-mask');

    let lastHeight = 0;
    function render() {
      const keys = slots.map((s, i) => `${keyOf(s)}#${i}`);
      const named = nameKeys(slots);
      const wanted = new Set(keys);
      for (const [key, tile] of tiles) {
        if (!wanted.has(key)) { tile.tile.remove(); tiles.delete(key); }
      }
      let placed = null;
      slots.forEach((s, i) => {
        const tile = tileFor(keys[i]);
        // Keeps the order, moving only what is out of place: a moved node loses the focus of a field in it.
        const want = placed ? placed.nextSibling : grid.firstChild;
        if (tile.tile !== want) grid.insertBefore(tile.tile, want);
        placed = tile.tile;
        const missing = 'missing' in s;
        tile.name.textContent = missing ? t('unavailable') : typed.name(named[i], s.name);
        if (typed.renaming && !missing) {
          const field = typed.field(named[i], s.name);
          if (field.previousSibling !== tile.name) tile.name.after(field);
        }
        tile.value.textContent = missing ? '' : formatValue(s.capability, s.value, t);
        setMask(tile.icon, iconFor(s));
        // The second value: another of the device's values, as text only (the first decides the tile's colour).
        const second = !missing && s.second ? s.second : null;
        const secondText = second ? formatValue(second.capability, second.value, t) : '';
        tile.tile.classList.toggle('has-second', !!second);
        for (const p of tile.ink ? [tile, tile.ink] : [tile]) {
          p.second.hidden = !second;
          p.secondValue.textContent = secondText;
          setMask(p.secondIcon, second ? iconFor(second) : null);
        }
        if (tile.ink) {
          tile.ink.name.textContent = tile.name.textContent;
          tile.ink.value.textContent = tile.value.textContent;
          setMask(tile.ink.icon, iconFor(s));
        }
        tile.tile.classList.toggle('active', !missing && s.capability.type === 'boolean' && s.value === true);
        // Percentages can fill the tile from the left, coloured by level.
        const percent = !missing && opts.percentFill ? percentOf(s.capability, s.value) : null;
        tile.tile.classList.toggle('filled', percent != null);
        if (percent != null) {
          tile.tile.style.setProperty('--vt-fill', `${Math.max(0, Math.min(100, percent))}%`);
          tile.tile.dataset.level = levelOf(percent, thresholds);
        } else {
          tile.tile.style.removeProperty('--vt-fill');
          delete tile.tile.dataset.level;
        }
        // A colour set by a Flow tints the tile (and colours a percentage fill instead of its level).
        const color = !missing && COLORS.includes(s.color) ? s.color : null;
        if (color) tile.tile.dataset.color = color;
        else delete tile.tile.dataset.color;
        tile.tile.classList.toggle('missing', missing);
        tile.tile.dataset.capability = s.capabilityId;
        tile.tile.title = missing ? '' : second ? `${s.capability.title} · ${second.capability.title}` : s.capability.title;
      });
      grid.style.display = slots.length ? '' : 'none';
      messageEl.textContent = message.text || '';
      messageEl.style.display = message.text ? '' : 'none';
      messageEl.classList.toggle('error', !!message.text && slots.length > 0);

      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h && h !== lastHeight) { lastHeight = h; if (opts.onHeight) opts.onHeight(h); }
    }

    return { setState, setNames: typed.set, pushChange, pushColor, setMessage, render, t };
  }

  window.createValuesWidget = createValuesWidget;
})();
