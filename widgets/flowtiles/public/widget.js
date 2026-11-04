/*
 * Flow Tiles: Device Values' tiles (its stylesheet, ../values/widget.css), each written by Flow cards on a named board:
 * a name, a text or number, a second line, an icon, a colour and a fill. A tile some Flow listens to (*A Flow Tile was
 * tapped*) can be tapped. Plain browser JS (served as-is).
 */
(function () {
  const { el, COLORS, icons, TIGHT_UNITS, formatSince, applyColors, messageLine, onTap } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const DEFAULT_STRINGS = {
    empty: 'No tiles yet. Add one with the Flow card Set Flow Tile.',
    noneShown: 'None of the tiles in Show only are on this board yet.',
    error: 'Could not load the tiles.',
    tapFailed: 'Could not tap __name__.',
  };

  /** How long a tapped tile lights up (`tapEffect: highlight`). */
  const FLASH_MS = 600;

  /** A board's or tile's key, as the app's (`flowTileKey()` in lib/FlowTileService.ts; a test checks they agree). */
  function flowTileKey(name, fallback = '') {
    const n = typeof name === 'string' ? name.trim() : '';
    const key = (n || fallback).toLowerCase().slice(0, 60);
    return ['__proto__', 'constructor', 'prototype'].includes(key) ? '' : key;
  }

  /** The names of `Show only` (comma-separated) as keys, in order, without repeats or empty ones. */
  function onlyKeys(only) {
    const keys = [];
    for (const part of String(only || '').split(',')) {
      const k = flowTileKey(part);
      if (k && !keys.includes(k)) keys.push(k);
    }
    return keys;
  }

  /** A Flow Buttons icon (the kit's `icons`) as a data URL for a mask; made once each. */
  const iconUrls = new Map();
  function iconUrl(id) {
    const icon = id && Object.prototype.hasOwnProperty.call(icons, id) ? icons[id] : null;
    if (!icon) return null;
    if (!iconUrls.has(id)) {
      const paint = icon.fill ? 'fill="#000"' : 'fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${paint}><path d="${icon.d}"/></svg>`;
      iconUrls.set(id, `data:image/svg+xml,${encodeURIComponent(svg)}`);
    }
    return iconUrls.get(id);
  }

  /** A tile's value as shown: a number in the screen's format (up to 2 decimals, or exactly 0–2), with its units. */
  function valueText(tile) {
    if (tile.kind === 'number' && typeof tile.number === 'number' && isFinite(tile.number)) {
      const fixed = ['0', '1', '2'].includes(tile.decimals);
      const digits = fixed ? Number(tile.decimals) : 2;
      const text = tile.number.toLocaleString(undefined, { minimumFractionDigits: fixed ? digits : 0, maximumFractionDigits: digits });
      if (!tile.units) return text;
      return TIGHT_UNITS.test(tile.units) ? `${text}${tile.units}` : `${text} ${tile.units}`;
    }
    return typeof tile.text === 'string' ? tile.text : '';
  }

  /**
   * @param {HTMLElement} root
   * @param {{ t?: (key: string, tokens?: object) => string, columns?: number|string, tileStyle?: string, colorStyle?: string,
   *   order?: string, only?: string, showAge?: boolean, tapEffect?: string, language?: string,
   *   onTap?: (tile: string) => Promise<any>, onHeight?: (h: number) => void }} opts
   */
  function createFlowTilesWidget(root, opts = {}) {
    const t = (key, tokens) => {
      const s = opts.t ? opts.t(`flowtiles.${key}`, tokens) : null;
      if (s && s !== `flowtiles.${key}`) return s;
      return (DEFAULT_STRINGS[key] || key).replace(/__(\w+)__/g, (_, k) => (tokens && tokens[k] != null ? tokens[k] : ''));
    };

    let board = null; // { key, name, tiles: [...] } once loaded
    let skew = 0; // the Homey's clock less the screen's
    let language = opts.language;
    const only = onlyKeys(opts.only);
    const byName = opts.order === 'name';
    const flash = opts.tapEffect !== 'none';
    const message = messageLine(() => render(), { clear: () => { board = null; } });

    // Device Values' tile and its rules (vt), with Flow Tiles' own few (ft).
    root.classList.add('vt', 'ft');
    root.dataset.columns = ['1', '2'].includes(String(opts.columns)) ? String(opts.columns) : '3';
    const pill = opts.tileStyle === 'pill';
    root.classList.toggle('vt-pill', pill);
    const deep = applyColors(root, { style: opts.colorStyle }) === 'deep';
    const grid = el('div', { class: 'vt-grid' }, root);
    const messageEl = el('div', { class: 'vt-message', dir: 'auto' }, root);
    /** @typedef {{icon: HTMLElement, value: HTMLElement, name: HTMLElement, second: HTMLElement, secondIcon: HTMLElement,
     *   secondValue: HTMLElement}} FlowTileParts */
    /** @type {Map<string, FlowTileParts & {tile: HTMLElement, ink: FlowTileParts | null, data: any, busy: boolean}>} */
    const tiles = new Map();

    /** `/state`'s answer: `{now, language, board}`. */
    function setState(state) {
      if (state && typeof state.now === 'number') skew = state.now - Date.now();
      if (state && state.language) language = state.language;
      board = state && state.board && Array.isArray(state.board.tiles) ? state.board : { key: '', name: '', tiles: [] };
      message.reset();
      render();
    }

    /** A board from the realtime event: taken when it's this widget's (`key`). */
    function pushBoard(entry, key) {
      if (!entry || entry.key !== key || !Array.isArray(entry.tiles)) return;
      board = entry;
      message.reset({ lastingOnly: true });
      render();
    }

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

    function shake(node) {
      node.classList.remove('shake');
      void node.offsetWidth; // restart the animation
      node.classList.add('shake');
    }

    function lightUp(node) {
      node.classList.remove('ft-flash');
      void node.offsetWidth;
      node.classList.add('ft-flash');
      setTimeout(() => node.classList.remove('ft-flash'), FLASH_MS);
    }

    /** A tap on a tile a Flow listens to: the trigger fires; a second tap waits for the first. */
    async function tap(tile) {
      if (!tile.data || !tile.data.tappable || tile.busy || !opts.onTap) return;
      tile.busy = true;
      if (flash) lightUp(tile.tile);
      try {
        await opts.onTap(tile.data.name);
      } catch (err) {
        shake(tile.tile);
        setMessage(t('tapFailed', { name: tile.data.name }), true);
      } finally {
        tile.busy = false;
      }
    }

    function tileFor(key) {
      let tile = tiles.get(key);
      if (!tile) {
        const node = el('div', { class: 'vt-tile', 'data-tile': key });
        tile = { tile: node, ...parts(node), ink: null, data: null, busy: false };
        // Vivid fills: the same icon and text again in the ink colour, which the CSS clips to the fill.
        if (deep) tile.ink = parts(el('div', { class: 'vt-ink', 'aria-hidden': 'true' }, node));
        const own = tile;
        onTap(node, () => tap(own));
        tiles.set(key, tile);
      }
      return tile;
    }

    const setMask = (node, url) => window.WidgetkeeperKit.setMask(node, url, '--vt-mask');

    /** The tiles to show: `Show only`'s in its order, else all, as added or by name. */
    function shown() {
      const list = board ? board.tiles.filter(x => x && typeof x.key === 'string') : [];
      if (only.length) return only.map(k => list.find(x => x.key === k)).filter(Boolean);
      return byName ? list.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), language)) : list;
    }

    let lastHeight = 0;
    function render() {
      const list = shown();
      const wanted = new Set(list.map(x => x.key));
      for (const [key, tile] of tiles) {
        if (!wanted.has(key)) { tile.tile.remove(); tiles.delete(key); }
      }
      const now = Date.now() + skew;
      let placed = null;
      for (const data of list) {
        const tile = tileFor(data.key);
        tile.data = data;
        const want = placed ? placed.nextSibling : grid.firstChild;
        if (tile.tile !== want) grid.insertBefore(tile.tile, want);
        placed = tile.tile;
        const icon = iconUrl(data.icon);
        const second = data.second || (opts.showAge && data.updatedAt ? formatSince(data.updatedAt, now, language) : '');
        for (const p of tile.ink ? [tile, tile.ink] : [tile]) {
          p.name.textContent = data.name;
          p.value.textContent = valueText(data);
          setMask(p.icon, icon);
          p.icon.classList.toggle('ft-none', !icon);
          p.second.hidden = !second;
          p.secondValue.textContent = second;
        }
        tile.tile.classList.toggle('has-second', !!second);
        tile.tile.classList.toggle('ft-noicon', !icon);
        // The fill, from the left, in the tile's colour (blue without one: the CSS).
        const fill = typeof data.fill === 'number' && isFinite(data.fill) ? Math.max(0, Math.min(100, data.fill)) : null;
        tile.tile.classList.toggle('filled', fill != null);
        if (fill != null) tile.tile.style.setProperty('--vt-fill', `${fill}%`);
        else tile.tile.style.removeProperty('--vt-fill');
        const color = COLORS.includes(data.color) ? data.color : null;
        if (color) tile.tile.dataset.color = color;
        else delete tile.tile.dataset.color;
        const tappable = !!data.tappable && !!opts.onTap;
        tile.tile.classList.toggle('ft-tappable', tappable);
        if (tappable) {
          tile.tile.setAttribute('role', 'button');
          tile.tile.tabIndex = 0;
        } else {
          tile.tile.removeAttribute('role');
          tile.tile.removeAttribute('tabindex');
        }
      }
      grid.style.display = list.length ? '' : 'none';
      // Nothing to show: the board is empty, or none of Show only's tiles is on it.
      const idle = board && !list.length ? t(only.length && board.tiles.length ? 'noneShown' : 'empty') : null;
      const text = message.text || idle;
      messageEl.textContent = text || '';
      messageEl.style.display = text ? '' : 'none';
      messageEl.classList.toggle('error', !!message.text && list.length > 0);

      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h && h !== lastHeight) { lastHeight = h; if (opts.onHeight) opts.onHeight(h); }
    }

    return { setState, pushBoard, setMessage, render, t };
  }

  window.createFlowTilesWidget = createFlowTilesWidget;
  window.flowTileKey = flowTileKey;
})();
