/*
 * Light Controls: compact light tiles, two per row (no brightness text: the bar shows it, and the space
 * goes to the colour chip's tap area). A tap on the tile turns the light on or off; the bar at the bottom
 * sets the brightness (0 = off); lights without brightness (plugs, switches) have no bar. The chip opens a panel of colour and white swatches over the tile's row
 * (with `palette: moods`, the room's Homey Moods in place of the colours): taps only, as Homey's Android app takes
 * any drag. With `wideLast`, the last of an odd number of tiles spans the row. Plain browser JS (served as-is).
 */
(function () {
  const { el, tileNames, applyColors, KEY_PROBLEMS, onTap: kitOnTap, touchGuard, messageLine, wireBar, roomTiles } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const PANEL_MS = 8e3; // the swatch panel closes after this long without a touch

  const DEFAULT_STRINGS = {
    selectDevices: 'Select lights in the widget settings.',
    error: 'Could not load the lights.',
    failed: 'Could not change __name__.',
    unavailable: 'Unavailable',
    temperature: 'Colour temperature',
    color: 'Colour',
    close: 'Close',
    noKey: 'To start Moods, add an API key in the app settings.',
    keyScope: 'The API key may not start Moods: it needs Set Moods.',
    keyInvalid: 'The API key was not accepted.',
    moodFailed: 'Could not start __name__.',
    moods: 'Moods',
    renameFailed: 'Could not save the name.',
  };

  const { glyphs, PALETTES, temperatureColor, hueColor, moodDot, swatchList, setBlend, model } = window.WidgetkeeperKit.lights;
  const { temp: TEMP_GLYPH, hue: HUE_GLYPH, close: CLOSE_GLYPH, pie: PIE_GLYPH } = glyphs;

  const clamp01 = x => Math.min(1, Math.max(0, x));
  /** Snaps to whole percent; anything below half a percent is 0 (off). */
  const snap = x => Math.round(clamp01(x) * 100) / 100;

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, t?: (key: string, tokens?: object) => string,
   *   onSet?: (deviceId: string, change: {dim?: number, onoff?: boolean, temperature?: number,
   *     hue?: number, saturation?: number}) => Promise<any>,
   *   onMood?: (moodId: string) => Promise<any>,
   *   renameTiles?: boolean, onRename?: (key: string, name: string) => Promise<any>,
   *   onHeight?: (h: number) => void, groupByZone?: boolean, wideLast?: boolean, palette?: string,
   *   barMin?: string, roomLevel?: string }} opts
   */
  function createLightsWidget(root, opts = {}) {
    const t = (key, tokens) => {
      const s = opts.t ? opts.t(`lights.${key}`, tokens) : null;
      if (s && s !== `lights.${key}`) return s;
      return (DEFAULT_STRINGS[key] || key).replace(/__(\w+)__/g, (_, k) => (tokens && tokens[k] != null ? tokens[k] : ''));
    };

    let devices = []; // [{ id, name, icon, zone, caps } | { id, missing }]
    /**
     * The tiles: one per light, or with `groupByZone` one per room that has two or more of the lights,
     * placed where its first light is. `id` is the light's id or `zone:<zoneId>`.
     * @type {({id: string, name: string, icon: string | null, members: any[]} | {id: string, missing: true})[]}
     */
    let items = [];
    // The shown values (optimistic over reported) and what follows from them: on, brightness, colours.
    const lights = model({ render: () => render(), roomLevel: opts.roomLevel });
    const { isOn, colorOf, settable, itemOn, itemBrightness } = lights;
    const drags = new Map(); // tile id → fraction, while a finger or the mouse is on the bar
    // What failed: a lasting message replaces the content, a transient one goes by itself.
    const message = messageLine(() => render(), { clear: () => { devices = []; } });

    root.classList.add('lc');
    applyColors(root, { style: opts.colorStyle });
    const names = tileNames(opts, () => render(), (key) => {
      shake(key);
      setMessage(t('renameFailed'), true);
    });
    root.classList.toggle('renaming', names.renaming);
    const grid = el('div', { class: 'lc-grid' }, root);
    // The swatch panel, over the row of the tile it's open for. In the grid (absolutely positioned) so it
    // can cover the row; the tiles are kept before it.
    const panel = el('div', { class: 'lc-panel' }, grid);
    panel.style.display = 'none';
    let panelFor = null; // the tile id the panel is open for
    let panelKey = ''; // which swatches it holds, so it's only rebuilt when that changes
    const palette = PALETTES[opts.palette] || PALETTES.default;
    /** `palette: moods`: the room's Moods (`setMoods()`) in place of the colours. */
    const useMoods = opts.palette === 'moods';
    /** @type {{id: string, name: string, zone: string, colors: ({hue: number, saturation: number} | {temperature: number})[]}[]} */
    let moods = [];
    /** The bar's lowest value: 0 turns the light off (the default); `barMin: '1'` stops at 1 %, so it stays on. */
    const barFloor = opts.barMin === '1' ? 0.01 : 0;
    const level = x => Math.max(barFloor, snap(x));
    let panelTimer = null;
    /** @type {{node: HTMLElement, swatch: {hue?: number, sat?: number, k?: number}}[]} */
    let swatches = [];
    /** The panel's Moods (`palette: moods`), while it shows a room's. */
    let moodRow = null;
    for (const type of ['touchstart', 'pointerdown']) panel.addEventListener(type, () => armPanel(), { passive: true });
    const messageEl = el('div', { class: 'lc-message', dir: 'auto' }, root);
    const touches = touchGuard(); // the tiles' taps and the bars' touches
    /** @type {Map<string, {tile: HTMLElement, icon: HTMLElement, chip: HTMLButtonElement, chipGlyph: HTMLElement,
     *   name: HTMLElement, bar: HTMLElement, fill: HTMLElement, knob: HTMLElement}>} */
    const tiles = new Map();
    function setState(list) {
      devices = Array.isArray(list) ? list : [];
      message.reset();
      lights.took(devices);
      render();
    }

    /** The Moods of the lights' rooms (`palette: moods`). */
    function setMoods(list) {
      moods = Array.isArray(list) ? list : [];
      render();
    }

    function pushChange(change) {
      if (lights.apply(devices, change)) render();
    }

    /** A message under the tiles. Persistent messages also clear the tiles. */
    function setMessage(text, transient) {
      message.set(text, transient);
    }

    /** Sends one light's change; a failure shakes its tile (`item`) and shows a message. */
    async function send(item, d, change) {
      if (!opts.onSet) return;
      try {
        await opts.onSet(d.id, change);
      } catch (err) {
        console.error(err);
        lights.forget(d);
        shake(item.id);
        setMessage(t('failed', { name: item.id === d.id ? names.name(d.id, d.name) : d.name }), true);
      }
    }

    function shake(id) {
      const tile = tiles.get(id);
      if (tile) window.WidgetkeeperKit.shake(tile.tile);
    }

    /** The tile with this id, if it shows lights. */
    function itemOf(id) {
      const item = items.find(x => x.id === id);
      return item && 'members' in item ? item : null;
    }

    /** The light a tile's colour comes from: the first one that is on, else the first. */
    const lead = item => item.members.find(isOn) || item.members[0];

    /** A tap on a tile: turns all its lights off when any is on, else all on. */
    function toggle(id) {
      const item = itemOf(id);
      if (!item || names.renaming) return;
      const on = !itemOn(item);
      lights.hopeOnOff(item, on);
      render();
      for (const d of item.members) send(item, d, { onoff: on });
    }

    /** The bar was let go at `x` (0–1): the brightness of every light on the tile. */
    function commit(id, x) {
      const item = itemOf(id);
      if (!item) return;
      const value = level(x);
      lights.hopeLevel(item, value);
      render();
      for (const d of item.members) send(item, d, { dim: value });
    }

    const hasColor = item => item.members.some(d => settable(d, 'light_hue'));
    const hasTemp = item => item.members.some(d => settable(d, 'light_temperature'));
    /** The room a tile is in: a grouped room's, or its light's. */
    const zoneOf = item => (item.id.startsWith('zone:') ? item.id.slice(5) : (item.members[0].zone ? item.members[0].zone.id : null));
    /** The Moods of a tile's room, with `palette: moods`. */
    function roomMoods(item) {
      const zone = useMoods ? zoneOf(item) : null;
      return zone ? moods.filter(m => m.zone === zone) : [];
    }
    /** Whether a tile has the chip: colour, colour temperature or its room's Moods. */
    const hasChip = item => hasColor(item) || hasTemp(item) || roomMoods(item).length > 0;

    /**
     * A swatch was tapped: sets the colour (or white) of each light on the tile that can show it, and
     * closes the panel. In a room, a white also goes to colour lights without colour temperature, as
     * saturation 0.
     */
    function pick(id, swatch) {
      const item = itemOf(id);
      closePanel();
      if (!item) return;
      const changes = [];
      for (const d of item.members) {
        if (swatch.k != null && settable(d, 'light_temperature')) {
          lights.hope(d, { light_temperature: swatch.k, light_mode: 'temperature', onoff: true });
          changes.push([d, { temperature: swatch.k }]);
        } else if (settable(d, 'light_hue') && (swatch.k == null || item.members.length > 1)) {
          const hue = swatch.k != null ? 0 : swatch.hue / 360;
          const saturation = swatch.k != null ? 0 : swatch.sat;
          lights.hope(d, { light_hue: hue, light_saturation: saturation, light_mode: 'color', onoff: true });
          changes.push([d, { hue, saturation }]);
        }
      }
      render();
      for (const [d, change] of changes) send(item, d, change);
    }

    /** A Mood was tapped: Homey starts it (through the API key), and the lights report their new state. */
    async function startMood(id, mood) {
      closePanel();
      if (!opts.onMood) return;
      try {
        await opts.onMood(mood.id);
      } catch (err) {
        console.error(err);
        shake(id);
        const reason = err && err.reason;
        setMessage(KEY_PROBLEMS.includes(reason) ? t(reason) : t('moodFailed', { name: mood.name }), true);
      }
    }

    function armPanel() {
      clearTimeout(panelTimer);
      panelTimer = setTimeout(closePanel, PANEL_MS);
    }

    function closePanel() {
      clearTimeout(panelTimer);
      panelTimer = null;
      if (panelFor == null) return;
      panelFor = null;
      render();
    }

    function togglePanel(id) {
      if (names.renaming) return;
      if (panelFor === id) { closePanel(); return; }
      panelFor = id;
      armPanel();
      render();
    }

    /**
     * Fills the panel for `d` from the palette: the colours (with colour) in the first row, then the whites
     * (the temperatures, or a plain white without them), and the close button in the last column. With
     * `palette: moods`, a room with Moods gets only them (no colours or whites), as pills in two rows beside the
     * close button that scroll sideways when they don't fit (one row while they fit in one).
     */
    function buildPanel(d) {
      const color = hasColor(d);
      const temp = hasTemp(d);
      const room = roomMoods(d);
      const key = `${color}:${temp}:${JSON.stringify(room.map(m => [m.id, m.name, m.colors]))}`;
      if (key === panelKey) return;
      panelKey = key;
      panel.textContent = '';
      swatches = [];
      moodRow = null;
      panel.classList.toggle('moods', room.length > 0);
      if (room.length) {
        const row = el('div', { class: 'lc-moods' }, panel);
        moodRow = row;
        for (const mood of room) {
          const node = el('button', { type: 'button', class: 'lc-mood' }, row);
          const dot = moodDot(mood.colors);
          if (dot) el('span', { class: 'lc-mood-dot' }, node).style.setProperty('--lc-swatch', dot);
          el('span', { class: 'lc-mood-name', dir: 'auto', text: mood.name }, node);
          onTap(node, () => { if (panelFor != null) startMood(panelFor, mood); });
        }
      }
      /** @type {{hue?: number, sat?: number, k?: number}[]} */
      const list = room.length ? [] : swatchList(palette, color, temp);
      for (const swatch of list) {
        const node = el('button', { type: 'button', class: 'lc-swatch' }, panel);
        node.style.setProperty('--lc-swatch', swatch.k != null ? temperatureColor(swatch.k) : hueColor(swatch.hue / 360, swatch.sat));
        onTap(node, () => { if (panelFor != null) pick(panelFor, swatch); });
        swatches.push({ node, swatch });
      }
      const close = el('button', { type: 'button', class: 'lc-close', 'aria-label': t('close') }, panel);
      el('span', { class: 'lc-close-glyph' }, close).style.setProperty('--lc-mask', `url("${CLOSE_GLYPH}")`);
      onTap(close, closePanel);
    }

    /** Whether a swatch is the current colour or white of the tile's lead light. */
    const isCurrent = (item, swatch) => lights.isCurrent(lead(item), swatch);

    /** Places the panel over the row of its tile, or hides it. */
    function renderPanel() {
      const d = panelFor != null ? itemOf(panelFor) : null;
      const tile = d ? tiles.get(d.id) : null;
      if (!d || !tile || !hasChip(d)) {
        if (panelFor != null) { panelFor = null; clearTimeout(panelTimer); }
        panel.style.display = 'none';
        return;
      }
      buildPanel(d);
      for (const s of swatches) s.node.classList.toggle('current', isCurrent(d, s.swatch));
      panel.style.display = '';
      panel.style.top = `${tile.tile.offsetTop}px`;
      panel.style.height = `${tile.tile.offsetHeight}px`;
      // The Moods take one row while they fit in it, else two.
      if (moodRow) {
        moodRow.classList.add('one-row');
        if (moodRow.scrollWidth > moodRow.clientWidth + 1) moodRow.classList.remove('one-row');
      }
    }

    /** Taps on the tile body; `stop` keeps a control's taps (and keys) from also reaching the tile around it. */
    function onTap(node, fn, { stop = false } = {}) {
      kitOnTap(node, fn, { stop, guard: touches });
    }

    function tileFor(id) {
      let tile = tiles.get(id);
      if (!tile) {
        const node = el('div', { class: 'lc-tile', 'data-device': id, role: 'group', tabindex: '0' });
        const top = el('div', { class: 'lc-top' }, node);
        const icon = el('span', { class: 'lc-icon' }, top);
        const chip = el('button', { type: 'button', class: 'lc-chip' }, top);
        const chipGlyph = el('span', { class: 'lc-chip-glyph' }, chip);
        const name = el('span', { class: 'lc-name', dir: 'auto' }, node);
        const bar = el('div', { class: 'lc-bar', role: 'slider', 'aria-valuemin': '0', 'aria-valuemax': '100' }, node);
        const track = el('div', { class: 'lc-track' }, bar);
        const fill = el('div', { class: 'lc-fill' }, track);
        const knob = el('div', { class: 'lc-knob' }, bar);
        tile = { tile: node, icon, chip, chipGlyph, name, bar, fill, knob };
        onTap(node, () => toggle(id));
        // The chip is inside the tile: its own taps (and keys) must not toggle the light.
        onTap(chip, () => togglePanel(id), { stop: true });
        wireBar(bar, { id, drags, guard: touches, render: () => render(), commit });
        tiles.set(id, tile);
      }
      return tile;
    }

    const setMask = (node, url) => window.WidgetkeeperKit.setMask(node, url, '--lc-mask');

    /** The tiles for the lights, grouped by room with `groupByZone`. */
    const buildItems = () => roomTiles(devices, {
      byZone: opts.groupByZone,
      usable: d => !('missing' in d) && d.caps && (d.caps.dim || d.caps.onoff),
      extra: d => ({ icon: d.icon }),
    });

    let lastHeight = 0;
    function render() {
      items = buildItems();
      const ids = new Set(items.map(d => d.id));
      for (const [id, tile] of tiles) {
        if (!ids.has(id)) { tile.tile.remove(); tiles.delete(id); }
      }
      let prev = null;
      for (const [i, d] of items.entries()) {
        const tile = tileFor(d.id);
        // Keeps the settings' order. Only moves a tile that is out of place: moving it would drop
        // the bar's pointer capture during a drag.
        const want = prev ? prev.nextSibling : grid.firstChild;
        if (tile.tile !== want) grid.insertBefore(tile.tile, want);
        prev = tile.tile;
        // `wideLast`: the last of an odd number of tiles (missing ones too) spans the row.
        tile.tile.classList.toggle('wide', !!opts.wideLast && items.length % 2 === 1 && i === items.length - 1);
        if (!('members' in d)) {
          tile.tile.classList.add('missing');
          tile.name.textContent = t('unavailable');
          setMask(tile.icon, null);
          tile.icon.classList.add('fallback');
          tile.chip.style.display = 'none';
          tile.tile.classList.remove('on');
          tile.tile.style.removeProperty('--lc-light');
          tile.tile.style.setProperty('--lc-x', '0');
          continue;
        }
        tile.tile.classList.remove('missing');
        const name = names.name(d.id, d.name);
        tile.name.textContent = name;
        if (names.renaming) {
          const field = names.field(d.id, d.name);
          if (field.previousSibling !== tile.name) tile.name.after(field);
        }
        // A group, not a button: it holds the chip and the slider, which have their own roles.
        tile.tile.setAttribute('aria-label', name);
        tile.bar.setAttribute('aria-label', name);
        setMask(tile.icon, d.icon);
        tile.icon.classList.toggle('fallback', !d.icon);
        const color = hasColor(d);
        const colors = lights.colorsOf(d.members);
        // Several colours: the tile's tint, the bar and the chip blend them (the first stays --lc-light).
        const multi = colors.length > 1;
        const on = itemOn(d);
        const drag = drags.get(d.id);
        const x = drag != null ? level(drag) : itemBrightness(d);

        const temp = hasTemp(d);
        // A light with only its room's Moods gets the colour chip's glyph.
        const hueChip = color || !temp;
        tile.chip.style.display = hasChip(d) ? '' : 'none';
        tile.chip.setAttribute('aria-label', t(color ? 'color' : temp ? 'temperature' : 'moods'));
        tile.chip.classList.toggle('active', panelFor === d.id);
        tile.chipGlyph.classList.toggle('hue', hueChip || multi);
        setMask(tile.chipGlyph, multi ? PIE_GLYPH : hueChip ? HUE_GLYPH : TEMP_GLYPH);
        tile.tile.classList.toggle('on', on || (drag != null && x > 0));
        tile.tile.classList.toggle('no-dim', !d.members.some(m => m.caps.dim)); // on/off only: no bar
        tile.tile.style.setProperty('--lc-light', colors[0] || colorOf(lead(d)));
        tile.tile.classList.toggle('multi', multi);
        setBlend(tile.tile, multi ? colors : null, 'lc', '135deg');
        tile.tile.style.setProperty('--lc-x', String(x));
        tile.bar.setAttribute('aria-valuenow', String(Math.round(x * 100)));
      }
      renderPanel();
      grid.style.display = devices.length ? '' : 'none';
      messageEl.textContent = message.text || '';
      messageEl.style.display = message.text ? '' : 'none';
      messageEl.classList.toggle('error', !!message.text && devices.length > 0);

      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h && h !== lastHeight) { lastHeight = h; if (opts.onHeight) opts.onHeight(h); }
    }

    return { setState, setMoods, setNames: names.set, pushChange, setMessage, render, t };
  }

  window.createLightsWidget = createLightsWidget;
})();
