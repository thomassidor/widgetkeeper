/*
 * Lights by Room: the picked lights grouped by their Homey room, a card per room. A closed card shows the room's
 * icon, name and state, its switch and its bar (every light in it); a tap on the header opens it, showing the room's
 * Moods and a row per light: a tap on the row toggles the light, its slim bar dims it, and the chip opens Light
 * Controls' swatches under the row. Taps only for what Android must do, as Homey's Android app takes any drag.
 * Plain browser JS (served as-is).
 */
(function () {
  const { el, tileNames, applyColors, KEY_PROBLEMS, onTap: kitOnTap, touchGuard, messageLine, wireBar } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  const { glyphs, PALETTES, temperatureColor, hueColor, moodDot, swatchList, setBlend, model } = window.WidgetkeeperKit.lights;
  'use strict';

  const PANEL_MS = 8e3; // the swatch panel closes after this long without a touch
  /** The room of lights without a known room, and of missing ones. */
  const OTHER = 'other';

  const DEFAULT_STRINGS = {
    selectDevices: 'Select lights in the widget settings.',
    error: 'Could not load the lights.',
    failed: 'Could not change __name__.',
    unavailable: 'Unavailable',
    other: 'Other',
    on: 'On',
    off: 'Off',
    allOn: 'All on',
    someOn: '__on__ of __all__ on',
    level: '__state__ · __percent__%',
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

  const svg = (viewBox, body) => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`)}`;
  // Points right while the room is closed, down (turned by the CSS) while it's open.
  const CHEVRON_GLYPH = svg('0 0 24 24', '<path d="M9 5.5l6.5 6.5L9 18.5"/>');

  const clamp01 = x => Math.min(1, Math.max(0, x));
  /** Snaps to whole percent; anything below half a percent is 0 (off). */
  const snap = x => Math.round(clamp01(x) * 100) / 100;

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, t?: (key: string, tokens?: object) => string,
   *   onSet?: (deviceId: string, change: {dim?: number, onoff?: boolean, temperature?: number,
   *     hue?: number, saturation?: number}) => Promise<any>,
   *   onMood?: (moodId: string) => Promise<any>, showMoods?: boolean, palette?: string, barMin?: string,
   *   renameTiles?: boolean, onRename?: (key: string, name: string) => Promise<any>,
   *   roomLevel?: string, open?: string[], onHeight?: (h: number) => void }} opts `open`: rooms (zone ids) open from the start, for the
   *   dev pages and renders; on a dashboard every room starts closed. `renameTiles`: each room's and each light's name
   *   is a text field (keys `zone:<zoneId>` and the device id; not Other's or a missing light's), every room is open
   *   without its Moods, and the controls do nothing.
   */
  function createLightRoomsWidget(root, opts = {}) {
    const t = (key, tokens) => {
      const s = opts.t ? opts.t(`lightrooms.${key}`, tokens) : null;
      if (s && s !== `lightrooms.${key}`) return s;
      return (DEFAULT_STRINGS[key] || key).replace(/__(\w+)__/g, (_, k) => (tokens && tokens[k] != null ? tokens[k] : ''));
    };

    let devices = []; // [{ id, name, icon, zone, caps, groupLights? } | { id, missing }]
    /** Each room's icon (an SVG data URL) by zone id. */
    let zoneIcons = {};
    /** @type {{id: string, name: string, zone: string, colors: ({hue: number, saturation: number} | {temperature: number})[]}[]} */
    let moods = [];
    /**
     * The rooms, in the order of their first light: `key` is `zone:<zoneId>` or OTHER, `members` its lights that
     * can be switched, `rows` every entry shown in it (the missing ones too, in OTHER).
     * @type {{key: string, zone: string | null, name: string, members: any[], rows: any[]}[]}
     */
    let rooms = [];
    // The shown values (optimistic over reported) and what follows from them: on, brightness, colours.
    const lights = model({ render: () => render(), roomLevel: opts.roomLevel });
    const { isOn, colorOf, colorsOf, settable, itemOn, itemBrightness } = lights;
    const drags = new Map(); // a room key or light id → fraction, while a finger or the mouse is on its bar
    /** The rooms open on this screen (their keys); every room starts closed. */
    const open = new Set((opts.open || []).map(z => `zone:${z}`));
    // What failed: a lasting message replaces the content, a transient one goes by itself.
    const message = messageLine(() => render(), { clear: () => { devices = []; } });

    root.classList.add('lr');
    applyColors(root, { style: opts.colorStyle });
    const names = tileNames(opts, () => render(), (key) => {
      shake(key);
      setMessage(t('renameFailed'), true);
    });
    root.classList.toggle('renaming', names.renaming);
    const list = el('div', { class: 'lr-list' }, root);
    const messageEl = el('div', { class: 'lr-message', dir: 'auto' }, root);
    const palette = PALETTES[opts.palette] || PALETTES.default;
    /** The bar's lowest value: 0 turns the light off (the default); `barMin: '1'` stops at 1 %, so it stays on. */
    const barFloor = opts.barMin === '1' ? 0.01 : 0;
    const level = x => Math.max(barFloor, snap(x));
    const touches = touchGuard(); // the tiles' taps and the bars' touches

    /** The swatch panel, under the row of the light it's open for. */
    const panel = el('div', { class: 'lr-panel' });
    let panelFor = null; // the light id the panel is open for
    let panelKey = ''; // which swatches it holds, so it's only rebuilt when that changes
    let panelTimer = null;
    /** @type {{node: HTMLElement, swatch: {hue?: number, sat?: number, k?: number}}[]} */
    let swatches = [];
    for (const type of ['touchstart', 'pointerdown']) panel.addEventListener(type, () => armPanel(), { passive: true });

    /** @type {Map<string, any>} the room cards by key */
    const cards = new Map();
    /** @type {Map<string, any>} the light rows by light id */
    const rows = new Map();
    /** The lights (`/state`'s `lights`) and their rooms' icons (`zoneIcons`). */
    function setState(lightList, icons) {
      devices = Array.isArray(lightList) ? lightList : [];
      if (icons && typeof icons === 'object') zoneIcons = icons;
      message.reset();
      lights.took(devices);
      render();
    }

    /** The Moods of the lights' rooms. */
    function setMoods(listOfMoods) {
      moods = Array.isArray(listOfMoods) ? listOfMoods : [];
      render();
    }

    function pushChange(change) {
      if (lights.apply(devices, change)) render();
    }

    /** A message under the rooms. Persistent messages also clear the rooms. */
    function setMessage(text, transient) {
      message.set(text, transient);
    }

    /**
     * What a tap, a bar or a swatch acts on: a room (by its key) or one light (by its id), with its lights.
     * @returns {{id: string, name: string, members: any[]} | null}
     */
    function itemOf(id) {
      const room = rooms.find(r => r.key === id);
      if (room) return room.members.length ? { id, name: room.name, members: room.members } : null;
      const d = devices.find(x => x.id === id && !('missing' in x) && x.caps && (x.caps.dim || x.caps.onoff));
      return d ? { id, name: d.name, members: [d] } : null;
    }

    /** Sends one light's change; a failure shakes the room or the row (`item`) and shows a message. */
    async function send(item, d, change) {
      if (!opts.onSet) return;
      try {
        await opts.onSet(d.id, change);
      } catch (err) {
        console.error(err);
        lights.forget(d);
        shake(item.id);
        setMessage(t('failed', { name: names.name(d.id, d.name) }), true);
      }
    }

    function shake(id) {
      const node = cards.has(id) ? cards.get(id).card : rows.has(id) ? rows.get(id).row : null;
      window.WidgetkeeperKit.shake(node);
    }

    /** A tap on a room's switch or a light's row: turns all its lights off when any is on, else all on. */
    function toggle(id) {
      const item = itemOf(id);
      if (!item || names.renaming) return;
      const on = !itemOn(item);
      lights.hopeOnOff(item, on);
      render();
      for (const d of item.members) send(item, d, { onoff: on });
    }

    /** The bar was let go at `x` (0–1): the brightness of the light, or of every light in the room. */
    function commit(id, x) {
      const item = itemOf(id);
      if (!item) return;
      const value = level(x);
      lights.hopeLevel(item, value);
      render();
      for (const d of item.members) send(item, d, { dim: value });
    }

    /** Whether a light has the chip (colour or colour temperature), which opens the swatches. */
    const hasChip = d => settable(d, 'light_hue') || settable(d, 'light_temperature');

    /** A swatch was tapped: sets the light's colour or white (as Light Controls does for one light), and closes. */
    function pick(id, swatch) {
      const item = itemOf(id);
      closePanel();
      if (!item) return;
      const d = item.members[0];
      let change = null;
      if (swatch.k != null && settable(d, 'light_temperature')) {
        lights.hope(d, { light_temperature: swatch.k, light_mode: 'temperature', onoff: true });
        change = { temperature: swatch.k };
      } else if (settable(d, 'light_hue') && swatch.k == null) {
        lights.hope(d, { light_hue: swatch.hue / 360, light_saturation: swatch.sat, light_mode: 'color', onoff: true });
        change = { hue: swatch.hue / 360, saturation: swatch.sat };
      }
      render();
      if (change) send(item, d, change);
    }

    /** A Mood was tapped: Homey starts it (through the API key), and the lights report their new state. */
    async function startMood(key, mood) {
      if (!opts.onMood) return;
      try {
        await opts.onMood(mood.id);
      } catch (err) {
        console.error(err);
        shake(key);
        const reason = err && err.reason;
        setMessage(KEY_PROBLEMS.includes(reason) ? t(reason) : t('moodFailed', { name: mood.name }), true);
      }
    }

    /** Opens or closes a room; closing it closes its light's swatches too. Not while renaming: every room stays open. */
    function toggleOpen(key) {
      if (names.renaming) return;
      if (open.has(key)) {
        open.delete(key);
        const room = rooms.find(r => r.key === key);
        if (room && room.rows.some(d => d.id === panelFor)) { panelFor = null; clearTimeout(panelTimer); }
      } else {
        open.add(key);
      }
      render();
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
     * Fills the panel for light `d` from the palette: the colours (with `light_hue`) in the first row, then the whites
     * (the temperatures, or a plain white without them), and the close button in the last column.
     */
    function buildPanel(d) {
      const color = settable(d, 'light_hue');
      const temp = settable(d, 'light_temperature');
      const key = `${color}:${temp}`;
      if (key === panelKey) return;
      panelKey = key;
      panel.textContent = '';
      swatches = [];
      /** @type {{hue?: number, sat?: number, k?: number}[]} */
      for (const swatch of swatchList(palette, color, temp)) {
        const node = el('button', { type: 'button', class: 'lr-swatch' }, panel);
        node.style.setProperty('--lr-swatch', swatch.k != null ? temperatureColor(swatch.k) : hueColor(swatch.hue / 360, swatch.sat));
        onTap(node, () => { if (panelFor != null) pick(panelFor, swatch); });
        swatches.push({ node, swatch });
      }
      const close = el('button', { type: 'button', class: 'lr-close', 'aria-label': t('close') }, panel);
      setMask(el('span', { class: 'lr-close-glyph' }, close), glyphs.close);
      onTap(close, closePanel);
    }

    /** Taps on the tile body; `stop` keeps a control's taps (and keys) from also reaching the tile around it. */
    function onTap(node, fn, { stop = false } = {}) {
      kitOnTap(node, fn, { stop, guard: touches });
    }

    const setMask = (node, url) => window.WidgetkeeperKit.setMask(node, url, '--lr-mask');

    /** A bar: a track with its fill, and the knob. */
    function makeBar(parent, cls) {
      const bar = el('div', { class: cls, role: 'slider', 'aria-valuemin': '0', 'aria-valuemax': '100' }, parent);
      const track = el('div', { class: 'lr-track' }, bar);
      el('div', { class: 'lr-fill' }, track);
      el('div', { class: 'lr-knob' }, bar);
      return bar;
    }

    function cardFor(key) {
      let card = cards.get(key);
      if (!card) {
        const node = el('div', { class: 'lr-room', 'data-room': key });
        const head = el('div', { class: 'lr-head', role: 'button', tabindex: '0' }, node);
        const icon = el('span', { class: 'lr-icon' }, head);
        const name = el('span', { class: 'lr-name', dir: 'auto' }, head);
        const state = el('span', { class: 'lr-state' }, head);
        setMask(el('span', { class: 'lr-chevron' }, head), CHEVRON_GLYPH);
        const sw = el('button', { type: 'button', class: 'lr-switch', role: 'switch' }, head);
        const bar = makeBar(node, 'lr-bar');
        const body = el('div', { class: 'lr-body' }, node);
        const moodRow = el('div', { class: 'lr-moods' }, body);
        el('div', { class: 'lr-sep' }, body);
        const rowList = el('div', { class: 'lr-rows' }, body);
        card = { card: node, head, icon, name, state, sw, bar, body, moodRow, moodKey: '', rowList };
        onTap(head, () => toggleOpen(key));
        // The switch is inside the header: its own taps (and keys) must not open the room.
        onTap(sw, () => toggle(key), { stop: true });
        wireBar(bar, { id: key, drags, guard: touches, render: () => render(), commit });
        cards.set(key, card);
      }
      return card;
    }

    function rowFor(id) {
      let row = rows.get(id);
      if (!row) {
        const node = el('div', { class: 'lr-row', 'data-device': id, role: 'group', tabindex: '0' });
        const chip = el('button', { type: 'button', class: 'lr-chip' }, node);
        const glyph = el('span', { class: 'lr-chip-glyph' }, chip);
        const name = el('span', { class: 'lr-row-name', dir: 'auto' }, node);
        const sub = el('span', { class: 'lr-row-sub' }, node);
        const bar = makeBar(node, 'lr-bar slim');
        row = { row: node, chip, glyph, name, sub, bar };
        onTap(node, () => toggle(id));
        // The chip is inside the row: its taps open the swatches, or toggle a light without colour.
        onTap(chip, () => {
          const item = itemOf(id);
          if (item && hasChip(item.members[0])) togglePanel(id);
          else toggle(id);
        }, { stop: true });
        wireBar(bar, { id, drags, guard: touches, render: () => render(), commit });
        rows.set(id, row);
      }
      return row;
    }

    /** The rooms of the lights, in the order of each room's first light; OTHER last. */
    function buildRooms() {
      const usable = d => !('missing' in d) && d.caps && (d.caps.dim || d.caps.onoff);
      const byKey = new Map();
      for (const d of devices) {
        const ok = usable(d);
        const key = ok && d.zone ? `zone:${d.zone.id}` : OTHER;
        if (!byKey.has(key)) {
          byKey.set(key, { key, zone: key === OTHER ? null : d.zone.id, name: key === OTHER ? t('other') : d.zone.name, members: [], rows: [] });
        }
        const room = byKey.get(key);
        room.rows.push(d);
        if (ok) room.members.push(d);
      }
      const out = [...byKey.values()].filter(r => r.key !== OTHER);
      if (byKey.has(OTHER)) out.push(byKey.get(OTHER));
      return out;
    }

    /** The room's state: Off, All on or "2 of 3 on", with the brightness while a light that dims is on. */
    function roomState(room, on, x) {
      if (!room.members.length) return t('unavailable');
      const lit = room.members.filter(isOn).length;
      if (!on) return t('off');
      const state = lit === room.members.length ? t('allOn') : t('someOn', { on: lit, all: room.members.length });
      return room.members.some(d => d.caps.dim && isOn(d)) ? t('level', { state, percent: Math.round(x * 100) }) : state;
    }

    /** Keeps `node` as the next child after `prev` in `parent` (moving it only when out of place, so a drag goes on). */
    function place(parent, prev, node) {
      const want = prev ? prev.nextSibling : parent.firstChild;
      if (node !== want) parent.insertBefore(node, want);
      return node;
    }

    function renderBar(bar, x, name) {
      bar.style.setProperty('--lr-x', String(x));
      bar.setAttribute('aria-valuenow', String(Math.round(x * 100)));
      bar.setAttribute('aria-label', name);
    }

    function renderRoom(room, card) {
      const item = { id: room.key, members: room.members };
      const drag = drags.get(room.key);
      const on = itemOn(item);
      const x = drag != null ? level(drag) : itemBrightness(item);
      const colors = colorsOf(room.members);
      // Renaming opens every room, so each light's field shows.
      const isOpen = names.renaming || open.has(room.key);
      card.card.classList.toggle('on', on || (drag != null && x > 0));
      card.card.classList.toggle('open', isOpen);
      card.card.classList.toggle('other', !room.zone);
      card.card.classList.toggle('multi', colors.length > 1);
      card.card.classList.toggle('no-dim', !room.members.some(d => d.caps.dim));
      card.card.style.setProperty('--lr-light', colors[0] || (room.members[0] ? colorOf(room.members[0]) : 'transparent'));
      setBlend(card.card, colors.length > 1 ? colors : null, 'lr', '90deg');
      card.head.setAttribute('aria-expanded', String(isOpen));
      const icon = room.zone ? zoneIcons[room.zone] : null;
      setMask(card.icon, icon || null);
      card.icon.classList.toggle('fallback', !icon);
      // A room's typed name (`renameTiles`); Other keeps its own.
      const name = room.zone ? names.name(room.key, room.name) : room.name;
      card.name.textContent = name;
      if (names.renaming && room.zone) {
        const field = names.field(room.key, room.name);
        if (field.previousSibling !== card.name) card.name.after(field);
      }
      card.state.textContent = roomState(room, on, x);
      card.sw.classList.toggle('on', on);
      card.sw.setAttribute('aria-checked', String(on));
      card.sw.setAttribute('aria-label', name);
      card.sw.style.display = room.members.length ? '' : 'none';
      renderBar(card.bar, x, name);

      // The room's Moods, while it's open (not while renaming).
      const roomMoods = isOpen && !names.renaming && opts.showMoods !== false && room.zone ? moods.filter(m => m.zone === room.zone) : [];
      const moodKey = JSON.stringify(roomMoods.map(m => [m.id, m.name, m.colors]));
      if (moodKey !== card.moodKey) {
        card.moodKey = moodKey;
        card.moodRow.textContent = '';
        for (const mood of roomMoods) {
          const node = el('button', { type: 'button', class: 'lr-mood' }, card.moodRow);
          const dot = moodDot(mood.colors);
          if (dot) el('span', { class: 'lr-mood-dot' }, node).style.setProperty('--lr-swatch', dot);
          el('span', { class: 'lr-mood-name', dir: 'auto', text: mood.name }, node);
          onTap(node, () => startMood(room.key, mood));
        }
      }
      card.moodRow.style.display = roomMoods.length ? '' : 'none';
      card.body.style.display = isOpen ? '' : 'none';
      if (!isOpen) return;

      let prev = null;
      for (const d of room.rows) {
        const row = rowFor(d.id);
        prev = place(card.rowList, prev, row.row);
        renderRow(d, row);
        if (panelFor === d.id) prev = place(card.rowList, prev, panel);
      }
    }

    function renderRow(d, row) {
      const missing = 'missing' in d || !d.caps || !(d.caps.dim || d.caps.onoff);
      row.row.classList.toggle('missing', missing);
      if (missing) {
        row.name.textContent = t('unavailable');
        row.sub.textContent = '';
        row.row.classList.remove('on', 'multi');
        row.row.classList.add('no-dim');
        row.chip.classList.add('plain');
        row.row.style.setProperty('--lr-light', 'transparent');
        return;
      }
      const item = { id: d.id, members: [d] };
      const drag = drags.get(d.id);
      const on = itemOn(item);
      const x = drag != null ? level(drag) : itemBrightness(item);
      const colors = colorsOf([d]);
      const multi = colors.length > 1;
      const color = settable(d, 'light_hue');
      const chip = hasChip(d);
      row.row.classList.toggle('on', on || (drag != null && x > 0));
      row.row.classList.toggle('no-dim', !d.caps.dim);
      row.row.classList.toggle('multi', multi);
      row.row.style.setProperty('--lr-light', colors[0] || colorOf(d));
      setBlend(row.row, multi ? colors : null, 'lr', '135deg');
      // A light's typed name (`renameTiles`).
      const name = names.name(d.id, d.name);
      row.row.setAttribute('aria-label', name);
      row.name.textContent = name;
      if (names.renaming) {
        const field = names.field(d.id, d.name);
        if (field.previousSibling !== row.name) row.name.after(field);
      }
      row.sub.textContent = d.caps.dim ? '' : t(on ? 'on' : 'off');
      // A light without colour or temperature: a plain dot in its colour.
      row.chip.classList.toggle('plain', !chip);
      row.chip.classList.toggle('active', panelFor === d.id);
      row.chip.tabIndex = chip ? 0 : -1;
      row.chip.setAttribute('aria-label', t(color ? 'color' : 'temperature'));
      row.glyph.classList.toggle('hue', color || multi);
      setMask(row.glyph, chip ? (multi ? glyphs.pie : color ? glyphs.hue : glyphs.temp) : null);
      renderBar(row.bar, x, name);
    }

    let lastHeight = 0;
    function render() {
      rooms = buildRooms();
      const keys = new Set(rooms.map(r => r.key));
      for (const [key, card] of cards) {
        if (!keys.has(key)) { card.card.remove(); cards.delete(key); open.delete(key); }
      }
      const ids = new Set(devices.map(d => d.id));
      for (const [id, row] of rows) {
        if (!ids.has(id)) { row.row.remove(); rows.delete(id); }
      }
      // The swatches: only while their light is shown in an open room and can take a colour.
      const panelItem = panelFor != null ? itemOf(panelFor) : null;
      const panelRoom = panelItem ? rooms.find(r => r.rows.some(d => d.id === panelFor)) : null;
      if (!panelItem || !panelRoom || !open.has(panelRoom.key) || !hasChip(panelItem.members[0])) {
        if (panelFor != null) { panelFor = null; clearTimeout(panelTimer); }
        panel.remove();
      } else {
        buildPanel(panelItem.members[0]);
        for (const s of swatches) s.node.classList.toggle('current', lights.isCurrent(panelItem.members[0], s.swatch));
      }

      let prev = null;
      for (const room of rooms) {
        const card = cardFor(room.key);
        prev = place(list, prev, card.card);
        renderRoom(room, card);
      }
      list.style.display = devices.length ? '' : 'none';
      messageEl.textContent = message.text || '';
      messageEl.style.display = message.text ? '' : 'none';
      messageEl.classList.toggle('error', !!message.text && devices.length > 0);

      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h && h !== lastHeight) { lastHeight = h; if (opts.onHeight) opts.onHeight(h); }
    }

    return { setState, setMoods, setNames: names.set, pushChange, setMessage, render, t };
  }

  window.createLightRoomsWidget = createLightRoomsWidget;
})();
