/*
 * Activity Dots: motion, presence, contact, vibration and camera-detection sensors as a grid of dots, in one colour while idle and
 * another while active (settings; grey and blue by default). A tap on a dot opens an overlay over its row with the device's name, what's active and since when;
 * a tap on the overlay closes it.
 * Plain browser JS (served as-is).
 */
(function () {
  const { el, formatSince, baseTitle, applyColors, onTap, messageLine, tileNames } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const DEFAULT_STRINGS = {
    selectDevices: 'Select sensors in the widget settings.',
    error: 'Could not load the sensors.',
    unavailable: 'Unavailable',
    open: 'Open',
    closed: 'Closed',
    motion: 'Motion',
    noMotion: 'No motion',
    presence: 'Presence',
    noPresence: 'No presence',
    vibration: 'Vibration',
    noVibration: 'No vibration',
    nothingDetected: 'Nothing detected',
    since: 'since __time__',
    renameFailed: 'Could not save the name.',
  };

  const COLORS = ['grey', 'blue', 'red', 'orange', 'yellow', 'green', 'purple', 'teal', 'cyan', 'indigo', 'pink', 'brown'];
  /** A colour setting's id, or the fallback when it's unknown. */
  const colorOf = (id, fallback) => (COLORS.includes(id) ? id : fallback);

  const baseId = a => String(a.capabilityId).split('.')[0];

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, t?: (key: string, tokens?: object) => string, locale?: string, timeFormat?: string, title?: string,
   *   idleColor?: string, activeColor?: string, renameTiles?: boolean, onRename?: (key: string, name: string) => Promise<any>,
   *   onHeight?: (h: number) => void }} opts
   */
  function createSensorDotsWidget(root, opts = {}) {
    const t = (key, tokens) => {
      const s = opts.t ? opts.t(`sensordots.${key}`, tokens) : null;
      if (s && s !== `sensordots.${key}`) return s;
      return (DEFAULT_STRINGS[key] || key).replace(/__(\w+)__/g, (_, k) => (tokens && tokens[k] != null ? tokens[k] : ''));
    };

    let devices = []; // [{ id, name, icon, alarms: [{ capabilityId, title, value, lastUpdated }] } | { id, missing }]
    let language = null;
    // What failed: a lasting message replaces the content, a transient one goes by itself.
    const message = messageLine(() => render(), { clear: () => { devices = []; } });
    let openId = null; // the device whose overlay is open

    // Typed names (Rename tiles), by device id: a row per sensor with its dot and a field, in place of the grid.
    const typed = tileNames(opts, () => render(), (id) => {
      const row = renameRows.get(id);
      if (row) {
        row.classList.remove('shake');
        void row.offsetWidth; // restart the animation
        row.classList.add('shake');
      }
      setMessage(t('renameFailed'), true);
    });
    /** @type {Map<string, HTMLElement>} */
    const renameRows = new Map();
    const nameOf = d => typed.name(d.id, d.name);
    root.classList.add('sd');
    root.classList.toggle('renaming', typed.renaming);
    applyColors(root, { style: opts.colorStyle });
    root.dataset.idle = colorOf(opts.idleColor, 'grey');
    root.dataset.active = colorOf(opts.activeColor, 'blue');
    // One device tile: an optional header (the `title` setting), then the dots.
    const tileEl = el('div', { class: 'sd-tile' }, root);
    const title = typeof opts.title === 'string' ? opts.title.trim() : '';
    if (title) el('div', { class: 'sd-header', dir: 'auto', text: title }, tileEl);
    const grid = el('div', { class: 'sd-grid' }, tileEl);
    const renameList = el('div', { class: 'sd-rename-list' }, tileEl);
    const messageEl = el('div', { class: 'sd-message', dir: 'auto' }, root);
    // The overlay, over the row of the dot it's open for. In the grid (absolutely positioned, as Light
    // Controls' swatch panel) so it can cover the row; the dots are kept before it.
    const panel = el('div', { class: 'sd-panel', role: 'button', tabindex: '0' }, grid);
    el('span', { class: 'sd-panel-dot' }, panel);
    const panelText = el('div', { class: 'sd-panel-text' }, panel);
    const panelName = el('span', { class: 'sd-panel-name', dir: 'auto' }, panelText);
    const panelState = el('span', { class: 'sd-panel-state', dir: 'auto' }, panelText);
    panel.style.display = 'none';
    onTap(panel, () => { openId = null; render(); });
    /** @type {Map<string, HTMLElement>} */
    const cells = new Map();

    /** `{devices, language}` from `/state`, or just the device list. */
    function setState(state) {
      const list = Array.isArray(state) ? state : state && state.devices;
      devices = Array.isArray(list) ? list : [];
      if (state && typeof state.language === 'string') language = state.language;
      message.reset();
      render();
    }

    function pushChange({ deviceId, capabilityId, value, t: at }) {
      const d = devices.find(x => x.id === deviceId);
      const a = d && d.alarms ? d.alarms.find(x => x.capabilityId === capabilityId) : null;
      if (!a) return;
      a.value = value;
      a.lastUpdated = typeof at === 'number' ? at : Date.now();
      render();
    }

    /** A message under the dots. Persistent messages also clear the dots. */
    function setMessage(text, transient) {
      message.set(text, transient);
    }

    const activeOf = d => (d.alarms || []).filter(a => a.value === true);

    /** 'active', 'idle', 'unknown' (no value reported) or 'missing'. */
    function levelOf(d) {
      if ('missing' in d) return 'missing';
      if (activeOf(d).length) return 'active';
      if (d.offline) return 'missing';
      return (d.alarms || []).some(a => a.value === false) ? 'idle' : 'unknown';
    }

    /** "Open", "Motion, Person Detected", "Closed", "No presence", "No motion", "No vibration" …, then "since 18:32" when known. */
    function stateText(d) {
      if ('missing' in d) return t('unavailable');
      const alarms = d.alarms || [];
      const active = activeOf(d);
      if (d.offline && !active.length) return t('unavailable');
      const from = active.length ? active : alarms;
      let text;
      if (active.length) {
        const labels = [];
        for (const a of active) {
          const id = baseId(a);
          const label = id === 'alarm_contact' ? t('open') : id === 'alarm_motion' ? t('motion')
            : id === 'alarm_presence' ? t('presence') : id === 'alarm_vibration' ? t('vibration') : baseTitle(a.title);
          if (!labels.includes(label)) labels.push(label);
        }
        text = labels.join(', ');
      } else if (alarms.some(a => a.value === false)) {
        text = alarms.some(a => baseId(a) === 'alarm_contact') ? t('closed')
          : alarms.some(a => baseId(a) === 'alarm_presence') ? t('noPresence')
          : alarms.some(a => baseId(a) === 'alarm_motion') ? t('noMotion')
          : alarms.some(a => baseId(a) === 'alarm_vibration') ? t('noVibration') : t('nothingDetected');
      } else {
        return '–';
      }
      const times = from.map(a => a.lastUpdated).filter(x => typeof x === 'number');
      if (!times.length) return text;
      return `${text} ${t('since', { time: formatSince(Math.max(...times), Date.now(), language, opts.locale, opts.timeFormat) })}`;
    }

    function toggle(id) {
      openId = openId === id ? null : id;
      render();
    }

    function cellFor(id) {
      let cell = cells.get(id);
      if (!cell) {
        cell = el('div', { class: 'sd-cell', 'data-device': id, role: 'button', tabindex: '0' });
        el('span', { class: 'sd-dot' }, cell);
        onTap(cell, () => toggle(id));
        cells.set(id, cell);
      }
      return cell;
    }

    /** Places the overlay over the row of its dot, or hides it. */
    function renderPanel() {
      const d = openId != null ? devices.find(x => x.id === openId) : null;
      const cell = d ? cells.get(d.id) : null;
      if (!d || !cell) {
        openId = null;
        panel.style.display = 'none';
        return;
      }
      panel.dataset.level = levelOf(d);
      panelName.textContent = 'missing' in d ? '' : nameOf(d);
      panelName.style.display = 'missing' in d ? 'none' : '';
      panelState.textContent = stateText(d);
      panel.style.display = '';
      panel.style.top = `${cell.offsetTop}px`;
      panel.style.height = `${cell.offsetHeight}px`;
    }

    /** Rename tiles: a row per sensor (a missing one has none), its dot and its name's field, in the settings' order. */
    function renderRename() {
      const shown = devices.filter(d => !('missing' in d));
      const ids = new Set(shown.map(d => d.id));
      for (const [id, row] of renameRows) {
        if (!ids.has(id)) { row.remove(); renameRows.delete(id); }
      }
      let placed = null;
      for (const d of shown) {
        let row = renameRows.get(d.id);
        if (!row) {
          row = el('div', { class: 'sd-rename-row', 'data-device': d.id });
          el('span', { class: 'sd-panel-dot' }, row);
          renameRows.set(d.id, row);
        }
        row.dataset.level = levelOf(d);
        const field = typed.field(d.id, d.name);
        if (field.parentNode !== row) row.append(field);
        // Moves only what is out of place: a moved field loses the focus.
        const want = placed ? placed.nextSibling : renameList.firstChild;
        if (row !== want) renameList.insertBefore(row, want);
        placed = row;
      }
    }

    let lastHeight = 0;
    function render() {
      const ids = new Set(devices.map(d => d.id));
      for (const [id, cell] of cells) {
        if (!ids.has(id)) { cell.remove(); cells.delete(id); }
      }
      for (const d of devices) {
        const cell = cellFor(d.id);
        grid.insertBefore(cell, panel); // keeps the settings' order, and the overlay last
        const level = levelOf(d);
        cell.dataset.level = level;
        cell.classList.toggle('open', d.id === openId);
        cell.setAttribute('aria-expanded', String(d.id === openId));
        cell.setAttribute('aria-label', 'missing' in d ? t('unavailable') : `${nameOf(d)}: ${stateText(d)}`);
      }
      if (typed.renaming) renderRename();
      renderPanel();
      tileEl.style.display = devices.length ? '' : 'none';
      messageEl.textContent = message.text || '';
      messageEl.style.display = message.text ? '' : 'none';
      messageEl.classList.toggle('error', !!message.text && devices.length > 0);

      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h && h !== lastHeight) { lastHeight = h; if (opts.onHeight) opts.onHeight(h); }
    }

    // The width changes the number of dots per row, so the height and the overlay's row.
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => render()).observe(grid);

    return { setState, setNames: typed.set, pushChange, setMessage, render, t, open: (id) => { openId = id; render(); } };
  }

  window.createSensorDotsWidget = createSensorDotsWidget;
})();
