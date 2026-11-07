/*
 * Value Board: every value of the picked devices in one widget, grouped by room (or by device), each group's name on
 * top. Tiles: a grid of cells, the icon and value over the device's name (or the value's, grouped by device). Compact:
 * the values run on in lines under the group's name, without names; a tap shows what a value is. The values with a
 * sense of their own (a battery, an alarm, CO₂ …) are yellow or red when off, and green when fine with `greenWhenFine`.
 * Plain browser JS (served as-is).
 */
(function () {
  const { el, setMask, formatNumber, formatValue, valueGlyph, TIGHT_UNITS, applyColors, onTap, messageLine, tileNames, markOffline, knownValue, okLevel } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const DEFAULT_STRINGS = {
    selectDevices: 'Select devices in the widget settings.',
    error: 'Could not load the values.',
    unavailable: 'Unavailable',
    noValues: 'These devices have no values to show.',
    on: 'On',
    off: 'Off',
    open: 'Open',
    closed: 'Closed',
    motion: 'Motion',
    noMotion: 'No motion',
    alarm: 'Alarm',
    ok: 'OK',
    renameFailed: 'Could not save the name.',
  };

  const REVEAL_MS = 4000; // how long a tapped value's name shows (Compact)

  /**
   * Where a value goes among its device's: temperature, humidity, the other measures, meters, alarms, the rest (switches,
   * dim levels, set temperatures, modes), the battery last. The device's own order within each.
   */
  function rank(capabilityId) {
    const base = capabilityId.split('.')[0];
    if (base === 'measure_battery' || base === 'alarm_battery') return 6;
    if (base === 'measure_temperature') return 0;
    if (base === 'measure_humidity') return 1;
    if (base.startsWith('measure_')) return 2;
    if (base.startsWith('meter_')) return 3;
    if (base.startsWith('alarm_')) return 4;
    return 5;
  }

  /** The kit's `okLevel()` in this widget's words: air quality above its limit a warning, from 1.5 × it an alert. */
  const AIR_LEVELS = { good: 'fine', out: 'warn', far: 'alert' };

  /**
   * How a value stands, for the few that have a sense of their own: `alert`, `warn` or `fine`; null for the rest
   * (a temperature could be a fridge's or the garden's, so it isn't judged). A battery under 10 % is an alert, under 20 % a
   * warning (Device Values' defaults); an alarm on is an alert, an open contact a warning, motion nothing; air quality
   * above its limit a warning, from 1.5 × it an alert.
   * @param {{capabilityId: string, type?: string, units?: string|null, value: unknown}} v
   */
  function valueBoardLevel(v) {
    if (!v || typeof v.capabilityId !== 'string') return null;
    const base = v.capabilityId.split('.')[0];
    const { value } = v;
    if (base === 'alarm_motion') return null;
    if (base.startsWith('alarm_')) {
      if (typeof value !== 'boolean') return null;
      if (!value) return 'fine';
      return base === 'alarm_contact' ? 'warn' : 'alert';
    }
    if (typeof value !== 'number' || !isFinite(value)) return null;
    if (base === 'measure_battery') return value < 10 ? 'alert' : value < 20 ? 'warn' : 'fine';
    // Air quality: the kit's known values with an upper limit only (Room Health's and Value Matrix's), in their units.
    const known = knownValue({ capabilityId: base, units: v.units });
    if (!known || known.range.min != null) return null;
    return AIR_LEVELS[okLevel(value, known.range)];
  }

  /**
   * The devices as groups: by room (zone, in the order its first device was picked, keyed `zone:<id>`; a device without
   * a known zone is a group of its own) or by device (keyed by its id). A missing device is a group of its own. Each
   * group's values are its devices' in turn, each device's by `rank()`; a group without values is left out.
   * @returns {{key: string, name?: string, missing?: true, values: any[]}[]}
   */
  function valueBoardGroups(devices, groupBy) {
    const groups = [];
    const byZone = new Map();
    for (const d of Array.isArray(devices) ? devices : []) {
      if (!d || typeof d !== 'object') continue;
      if ('missing' in d) { groups.push({ key: d.id, missing: true, values: [] }); continue; }
      const values = (Array.isArray(d.values) ? d.values : [])
        .map((v, i) => ({ v, i }))
        .sort((a, b) => rank(a.v.capabilityId) - rank(b.v.capabilityId) || a.i - b.i)
        .map(({ v }) => ({ ...v, deviceId: d.id, deviceName: d.name, key: `${d.id}:${v.capabilityId}`, offline: !!d.offline }));
      if (!values.length) continue;
      const zone = groupBy !== 'devices' && d.zone && d.zone.id ? d.zone : null;
      if (zone && byZone.has(zone.id)) { byZone.get(zone.id).values.push(...values); continue; }
      const group = zone ? { key: `zone:${zone.id}`, name: zone.name, values } : { key: d.id, name: d.name, values };
      if (zone) byZone.set(zone.id, group);
      groups.push(group);
    }
    return groups;
  }

  /**
   * @param {HTMLElement} root
   * @param {{ layout?: string, groupBy?: string, columns?: number|string, greenWhenFine?: boolean, colorStyle?: string,
   *   renameTiles?: boolean, onRename?: (key: string, name: string) => Promise<any>,
   *   t?: (key: string, tokens?: object) => string, onHeight?: (h: number) => void }} opts
   */
  function createValueBoardWidget(root, opts = {}) {
    const t = (key, tokens) => {
      const s = opts.t ? opts.t(`valueboard.${key}`, tokens) : null;
      if (s && s !== `valueboard.${key}`) return s;
      return (DEFAULT_STRINGS[key] || key).replace(/__(\w+)__/g, (_, k) => (tokens && tokens[k] != null ? tokens[k] : ''));
    };

    const compact = opts.layout === 'compact';
    const byDevice = opts.groupBy === 'devices';
    const green = opts.greenWhenFine === true;
    let devices = []; // [{ id, name, zone, values: [{capabilityId, title, type, units, decimals, values, value}] } | { id, missing }]
    // What failed: a lasting message replaces the content, a transient one goes by itself.
    const message = messageLine(() => render(), { clear: () => { devices = []; } });
    let reveal = null; // { group, key }: the value a tap named in its group's heading (Compact)
    let revealTimer = null;

    // Typed names (Rename tiles): a room's (`zone:<id>`) and a device's (its id), over their own.
    // A name that couldn't be saved shakes its row (drawn with the message that says so).
    let shaking = null;
    const typed = tileNames(opts, () => render(), (key) => {
      shaking = key;
      setTimeout(() => { if (shaking === key) shaking = null; }, 400);
      setMessage(t('renameFailed'), true);
    });
    root.classList.add('vb', compact ? 'vb-compact' : 'vb-tiles');
    root.classList.toggle('renaming', typed.renaming);
    root.dataset.columns = ['2', '4'].includes(String(opts.columns)) ? String(opts.columns) : '3';
    applyColors(root, { style: opts.colorStyle });
    const body = el('div', { class: 'vb-body' }, root);
    const messageEl = el('div', { class: 'vb-message', dir: 'auto' }, root);

    function setState(list) {
      devices = Array.isArray(list) ? list : [];
      message.reset();
      render();
    }

    function pushChange({ deviceId, capabilityId, value }) {
      const d = devices.find(x => x.id === deviceId);
      const v = d && Array.isArray(d.values) ? d.values.find(x => x.capabilityId === capabilityId) : null;
      if (!v) return;
      v.value = value;
      if (!typed.renaming) render(); // renaming shows no values
    }

    /** A message under the groups. Persistent messages also clear them. */
    function setMessage(text, transient) {
      message.set(text, transient);
    }

    /** A value as text: yes/no in the capability's own words where it has them (open/closed, motion, alarm). */
    function text(v) {
      if (typeof v.value === 'boolean') {
        const base = v.capabilityId.split('.')[0];
        if (base === 'alarm_contact') return t(v.value ? 'open' : 'closed');
        if (base === 'alarm_motion') return t(v.value ? 'motion' : 'noMotion');
        if (base.startsWith('alarm_')) return t(v.value ? 'alarm' : 'ok');
      }
      return formatValue(v, v.value, t);
    }

    /** A value's tone: its level, but `fine` only when it's to be green. */
    function toneOf(v) {
      const level = valueBoardLevel(v);
      return level === 'fine' && !green ? null : level;
    }

    /** A device's shown name: its typed one, else its own. */
    const deviceName = v => typed.name(v.deviceId, v.deviceName);
    /** A group's shown name: the room's or the device's typed one, else its own. */
    const groupName = g => typed.name(g.key, g.name);

    /** What a value is: the device and the value's title grouped by room, the title alone grouped by device. */
    function nameOf(v) {
      return byDevice ? v.title : `${deviceName(v)} · ${v.title}`;
    }

    function icon(parent, v) {
      const node = el('span', { class: 'vb-icon', 'aria-hidden': 'true' }, parent);
      setMask(node, valueGlyph(v.capabilityId, v.value), '--vb-mask');
      return node;
    }

    function tone(node, v) {
      const k = toneOf(v);
      if (k) node.dataset.tone = k;
    }

    /** A tap in Compact: the value's name in its group's heading, for REVEAL_MS; a second tap on it puts the group's back. */
    function show(group, key) {
      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = null;
      reveal = reveal && reveal.key === key ? null : { group, key };
      if (reveal) revealTimer = setTimeout(() => { reveal = null; revealTimer = null; render(); }, REVEAL_MS);
      render();
    }

    const allOffline = group => group.values.length > 0 && group.values.every(v => v.offline);
    /** The group's name, saying so when all of it is unavailable (one device among others is marked on its own values). */
    const headOf = group => (allOffline(group) ? `${groupName(group)} · ${t('unavailable')}` : groupName(group));

    function tilesGroup(group) {
      const node = el('section', { class: 'vb-tile vb-group', 'data-group': group.key }, body);
      el('div', { class: 'vb-head', dir: 'auto', text: group.missing ? t('unavailable') : headOf(group) }, node);
      if (group.missing) { node.classList.add('missing'); return; }
      const whole = allOffline(group);
      const grid = el('div', { class: 'vb-grid' }, node);
      for (const v of group.values) {
        const value = text(v);
        const cell = el('div', { class: 'vb-cell', 'data-key': v.key, role: 'img', 'aria-label': `${nameOf(v)}: ${value}` }, grid);
        tone(cell, v);
        markOffline(cell, v.offline, whole ? undefined : t('unavailable'));
        const line = el('div', { class: 'vb-value' }, cell);
        icon(line, v);
        // A unit other than ° and % small after the number, so the number keeps its room.
        const apart = typeof v.value === 'number' && isFinite(v.value) && v.units && !TIGHT_UNITS.test(v.units);
        const num = el('span', { class: 'vb-num', text: apart ? formatNumber(v, v.value) : value }, line);
        if (apart) el('span', { class: 'vb-unit', text: v.units }, num);
        el('div', { class: 'vb-label', dir: 'auto', text: byDevice ? v.title : deviceName(v) }, cell);
      }
    }

    function compactGroup(group, tile) {
      const node = el('section', { class: 'vb-group', 'data-group': group.key }, tile);
      const named = reveal && reveal.group === group.key ? group.values.find(v => v.key === reveal.key) : null;
      const head = el('div', { class: 'vb-head', dir: 'auto' }, node);
      head.textContent = group.missing ? t('unavailable') : named ? nameOf(named) : headOf(group);
      head.classList.toggle('naming', !!named);
      if (group.missing) { node.classList.add('missing'); return; }
      const line = el('div', { class: 'vb-line' }, node);
      for (const v of group.values) {
        const value = text(v);
        const item = el('span', { class: 'vb-item', 'data-key': v.key, role: 'button', tabindex: '0', 'aria-label': `${nameOf(v)}: ${value}` }, line);
        tone(item, v);
        markOffline(item, v.offline);
        item.classList.toggle('named', !!named && named.key === v.key);
        icon(item, v);
        el('span', { class: 'vb-num', text: value }, item);
        onTap(item, () => show(group.key, v.key));
      }
    }

    /**
     * Rename tiles: in place of the values, each group's name as a field, and grouped by room each of its devices' under
     * it (a device once), so the names are typed where they show. A missing device has none.
     */
    function renameGroup(group) {
      const node = el('section', { class: 'vb-tile vb-group vb-renaming', 'data-group': group.key }, body);
      if (group.missing) {
        node.classList.add('missing');
        el('div', { class: 'vb-head', dir: 'auto', text: t('unavailable') }, node);
        return;
      }
      const row = (key, own, cls) => {
        const line = el('div', { class: `vb-rename-row ${cls}${key === shaking ? ' shake' : ''}`, 'data-rename': key }, node);
        line.append(typed.field(key, own));
      };
      row(group.key, group.name, 'vb-rename-group');
      if (byDevice) return;
      const seen = new Set();
      for (const v of group.values) {
        if (seen.has(v.deviceId)) continue;
        seen.add(v.deviceId);
        // A device alone in its own group (no known room) is named by the group's field.
        if (v.deviceId !== group.key) row(v.deviceId, v.deviceName, 'vb-rename-device');
      }
    }

    let lastHeight = 0;
    function reportHeight() {
      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h && h !== lastHeight) { lastHeight = h; if (opts.onHeight) opts.onHeight(h); }
    }

    function render() {
      const groups = valueBoardGroups(devices, opts.groupBy);
      if (reveal && !groups.some(g => g.key === reveal.group && g.values.some(v => v.key === reveal.key))) reveal = null;
      // A field being typed in isn't taken away (moving it would end the typing): drawn once it's left.
      const active = document.activeElement;
      if (typed.renaming && active && active.classList.contains('wk-rename') && body.contains(active)) {
        active.addEventListener('blur', () => render(), { once: true });
        return;
      }
      body.textContent = '';
      body.classList.toggle('has-named', !!reveal);
      if (typed.renaming) {
        for (const g of groups) renameGroup(g);
      } else if (compact) {
        if (groups.length) {
          const tile = el('div', { class: 'vb-tile' }, body);
          for (const g of groups) compactGroup(g, tile);
        }
      } else {
        for (const g of groups) tilesGroup(g);
      }
      // Devices that came back without a value to show say so, unless a message says more.
      const shown = message.text || (devices.length && !groups.length ? t('noValues') : '');
      messageEl.textContent = shown;
      messageEl.style.display = shown ? '' : 'none';
      messageEl.classList.toggle('error', !!message.text && groups.length > 0);
      reportHeight();
    }

    // The width changes how many values fit on a line, so the height.
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => reportHeight()).observe(body);

    return { setState, setNames: typed.set, pushChange, setMessage, render, t };
  }

  window.createValueBoardWidget = createValueBoardWidget;
  window.valueBoardLevel = valueBoardLevel;
  window.valueBoardGroups = valueBoardGroups;
})();
