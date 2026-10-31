/*
 * The web dashboards page — the pickers in the settings dialog: devices, device values and autocompletes. A part of
 * the page (settings/dashboard.js): mountWebDashboards() runs it once with `wd`, the page's shared state and
 * functions. The core's functions and constants are taken from `wd` at the top; the state that changes, and the
 * other parts' functions, are read as `wd.<name>`. Plain browser JS (served as-is).
 */
(function () {
  'use strict';

  window.WidgetkeeperWeb.part('pickers', (wd) => {
    const { bracketQuery, button, el, homeyRequest, icon, request, t, toast } = wd;

    /** A device's icon: Homey's own drawing (a black glyph, inverted in dark mode), else a rounded square. */
    function deviceIcon(dev, className) {
      const box = el('span', `wd-devicon${className ? ` ${className}` : ''}`);
      if (dev && dev.icon) {
        const img = el('img');
        img.src = dev.icon;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', () => img.remove());
        box.append(img);
      }
      return box;
    }

    /** `Kitchen`, or `Ground floor › Kitchen` when the room sits under another zone. */
    const roomLabel = (dev) => (dev.zone ? [...dev.zone.path, dev.zone.name].join(' › ') : t('noRoom'));

    /**
     * The widget's devices in its settings: the chosen ones in their order (the widget's tiles follow it; drag the
     * grip to change it, ✕ to drop one) and a button that opens the device picker.
     */
    function devicePicker(def, draft, openAtOnce, onChange = () => {}) {
      const singular = def.devices.singular;
      const wrap = el('section', 'wd-set-card wd-set-devices');
      const head = el('div', 'wd-set-cardhead');
      const count = el('span', 'wd-set-count');
      const list = el('div', 'wd-devlist');
      const hint = el('p', 'wd-hint', t('dragToOrder'));
      let byId = null; // id → device, once loaded
      // Another app's widget sends its filter: only this page can read that app's manifest.
      const filter = def.app ? `&class=${encodeURIComponent(def.devices.class)}&capabilities=${encodeURIComponent(def.devices.capabilities)}${def.devices.app ? '&app=1' : ''}` : '';
      const loading = request('GET', `/web/devices?type=${encodeURIComponent(def.type)}${filter}`).then((items) => {
        byId = new Map((items || []).map(d => [d.id, d]));
        draw();
        return items || [];
      });
      loading.catch((err) => { list.textContent = ''; list.append(el('p', 'wd-error', String(err.message || err))); });
      const choose = button('wd-btn small', '', async () => {
        let items;
        try { items = await loading; } catch (e) { return; }
        chooseDevices(def, items, draft.deviceIds, (ids) => { draft.deviceIds = ids; draw(); });
      });
      const caption = el('h3', 'wd-set-title', singular ? t('device') : t('devices'));
      head.append(caption, count, el('span', 'wd-spacer'), choose);
      wrap.append(head, list, hint);

      function draw() {
        onChange();
        list.textContent = '';
        const ids = draft.deviceIds;
        choose.textContent = t(ids.length ? (singular ? 'changeDevice' : 'changeDevices') : (singular ? 'chooseDevice' : 'chooseDevices'));
        hint.hidden = singular || ids.length < 2;
        count.textContent = singular || !ids.length ? '' : String(ids.length);
        if (!ids.length) { list.append(el('p', 'wd-hint wd-devnone', t('noneChosen'))); return; }
        for (const id of ids) {
          const dev = (byId && byId.get(id)) || { id, name: byId ? t('missingDevice') : '…', zone: null, icon: null, missing: !!byId };
          const row = el('div', `wd-devrow${dev.missing ? ' missing' : ''}`);
          row.dataset.id = id;
          if (!singular && ids.length > 1) {
            const grip = el('span', 'wd-devgrip');
            grip.title = t('drag');
            grip.append(icon('grip'));
            reorderBy(grip, row);
            row.append(grip);
          }
          const text = el('span', 'wd-devtext');
          text.append(el('span', 'wd-devname', dev.name));
          if (byId && !dev.missing) text.append(el('span', 'wd-hint', roomLabel(dev)));
          const remove = button('wd-icon wd-devremove', '', () => {
            draft.deviceIds = draft.deviceIds.filter(x => x !== id);
            draw();
          }, t('remove'));
          remove.append(icon('close'));
          row.append(deviceIcon(dev), text, remove);
          list.append(row);
        }
      }

      /** Drag a row by its grip (pointer events, so touch works): the rows move as it passes their middles. */
      function reorderBy(grip, row) {
        grip.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          grip.setPointerCapture(e.pointerId);
          row.classList.add('lifted');
          const move = (ev) => {
            const rows = [...list.querySelectorAll('.wd-devrow')].filter(r => r !== row);
            const before = rows.find(r => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
            if (before) { if (row.nextSibling !== before) list.insertBefore(row, before); } else if (list.lastChild !== row) list.append(row);
          };
          const up = () => {
            grip.removeEventListener('pointermove', move);
            grip.removeEventListener('pointerup', up);
            grip.removeEventListener('pointercancel', up);
            row.classList.remove('lifted');
            draft.deviceIds = [...list.querySelectorAll('.wd-devrow')].map(r => r.dataset.id);
            draw();
          };
          grip.addEventListener('pointermove', move);
          grip.addEventListener('pointerup', up);
          grip.addEventListener('pointercancel', up);
        });
      }

      draw();
      if (openAtOnce && !draft.deviceIds.length) setTimeout(() => choose.click(), 0);
      return wrap;
    }

    /**
     * The device picker: a wide dialog over the settings, with a search, the rooms as filters and the devices grouped
     * by room as tiles. One device: a tap picks it. Several: taps tick them (in that order), a room's Select all ticks
     * the room, and Done keeps it.
     */
    function chooseDevices(def, items, current, onDone) {
      const singular = def.devices.singular;
      let chosen = current.slice();
      const { d, body } = wd.dialog(t(singular ? 'chooseDevice' : 'chooseDevices'));
      d.classList.add('wide', 'tall');
      const tools = el('div', 'wd-devtools');
      const search = el('input', 'wd-input');
      search.type = 'search';
      search.placeholder = t('search');
      const rooms = el('div', 'wd-rooms');
      tools.append(search, rooms);
      const groupsBox = el('div', 'wd-devgroups');
      body.append(tools, groupsBox);
      const count = el('span', 'wd-muted wd-devcount');
      const actions = el('div', 'wd-actions');
      if (singular) {
        actions.append(button('wd-btn quiet', t('cancel'), () => d.close()));
      } else {
        actions.append(count, el('span', 'wd-spacer'), button('wd-btn quiet', t('cancel'), () => d.close()),
          button('wd-btn primary', t('done'), () => { onDone(chosen); d.close(); }));
      }
      d.append(actions);

      // The rooms, in the order of their place in the home (`Ground floor › Kitchen`), devices without one last.
      const groups = new Map();
      for (const dev of items) {
        const key = dev.zone ? dev.zone.id : '';
        if (!groups.has(key)) groups.set(key, { key, label: dev.zone ? dev.zone.name : t('noRoom'), path: dev.zone ? dev.zone.path : [], devices: [] });
        groups.get(key).devices.push(dev);
      }
      const sortKey = (g) => (g.key ? [...g.path, g.label].join('\u0000').toLowerCase() : '\uffff');
      const ordered = [...groups.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      let room = 'all'; // 'all', 'chosen' or a zone id ('' for no room)

      function drawRooms() {
        rooms.textContent = '';
        const chip = (id, label, n) => {
          const b = button(`wd-room${room === id ? ' on' : ''}`, '', () => { room = id; drawRooms(); draw(); });
          b.append(el('span', null, label), el('span', 'wd-room-count', String(n)));
          b.setAttribute('aria-pressed', String(room === id));
          rooms.append(b);
        };
        chip('all', t('allRooms'), items.length);
        if (!singular) chip('chosen', t('chosen'), chosen.length);
        if (ordered.length > 1) for (const g of ordered) chip(g.key, g.label, g.devices.length);
      }

      function draw() {
        const q = search.value.trim().toLowerCase();
        const scroll = groupsBox.scrollTop;
        groupsBox.textContent = '';
        count.textContent = t('chosenCount', { count: chosen.length });
        let shown = 0;
        for (const g of ordered) {
          if (room !== 'all' && room !== 'chosen' && room !== g.key) continue;
          const devices = g.devices.filter(dev => (room !== 'chosen' || chosen.includes(dev.id))
            && (!q || `${dev.name} ${roomLabel(dev)}`.toLowerCase().includes(q)));
          if (!devices.length) continue;
          shown += devices.length;
          const group = el('section', 'wd-devgroup');
          const head = el('div', 'wd-devgroup-head');
          const title = el('div', 'wd-devgroup-title');
          if (g.path.length) title.append(el('span', 'wd-hint', g.path.join(' › ')));
          title.append(el('h3', 'wd-h2', g.label));
          head.append(title);
          if (!singular) {
            const all = devices.every(dev => chosen.includes(dev.id));
            head.append(button('wd-btn quiet small', t(all ? 'clearAll' : 'selectAll'), () => {
              if (all) chosen = chosen.filter(id => !devices.some(dev => dev.id === id));
              else for (const dev of devices) if (!chosen.includes(dev.id)) chosen.push(dev.id);
              drawRooms();
              draw();
            }));
          }
          const tiles = el('div', 'wd-devtiles');
          for (const dev of devices) {
            const on = chosen.includes(dev.id);
            const tile = button(`wd-devtile${on ? ' on' : ''}`, '', () => {
              if (singular) { onDone([dev.id]); d.close(); return; }
              chosen = on ? chosen.filter(id => id !== dev.id) : [...chosen, dev.id];
              drawRooms();
              draw();
            });
            tile.setAttribute('aria-pressed', String(on));
            const mark = el('span', 'wd-devcheck');
            mark.append(icon('check'));
            const order = chosen.indexOf(dev.id);
            if (!singular && on && chosen.length > 1) mark.dataset.n = String(order + 1);
            tile.append(deviceIcon(dev, 'large'), el('span', 'wd-devtile-name', dev.name), mark);
            tiles.append(tile);
          }
          group.append(head, tiles);
          groupsBox.append(group);
        }
        if (!shown) groupsBox.append(el('p', 'wd-hint', t('noDevices')));
        groupsBox.scrollTop = scroll;
      }

      search.addEventListener('input', draw);
      drawRooms();
      draw();
      d.showModal();
      search.focus();
    }

    /**
     * The devices with the values a widget's slots may show (`/web/values`), shared by its slots while they're open
     * and read again after 30 s, so a dialog shows current readings.
     */
    const valueLists = new Map(); // type → {at, promise}
    function valueDevices(type) {
      const hit = valueLists.get(type);
      if (hit && Date.now() - hit.at < 30e3) return hit.promise;
      const promise = request('GET', `/web/values?type=${encodeURIComponent(type)}`).then(items => items || []);
      promise.catch(() => valueLists.delete(type));
      valueLists.set(type, { at: Date.now(), promise });
      return promise;
    }

    /** A value as its tile shows it (the kit's `formatValue()`, which the page loads first). */
    function formatReading(cap) {
      return window.WidgetkeeperKit.formatValue(cap, cap.value, key => t(key === 'on' ? 'valueOn' : 'valueOff'));
    }

    /** What a slot keeps (as its autocomplete's item, `listCapabilitySlots()`): the widgets read the id. */
    function slotItem(dev, cap) {
      const description = [dev.zone && dev.zone.name, cap.units].filter(Boolean).join(' · ');
      return { id: `${dev.id}:${cap.id}`, name: `${dev.name} · ${cap.title}`, ...(description ? { description } : {}) };
    }

    /**
     * A device value slot (Device Values' and Sparklines' tiles): the chosen value as a row (the device's icon, the
     * value's name over the device and room; a tap changes it, ✕ empties the tile), or a button that opens the picker.
     */
    function valuePicker(def, s, draft, changed = () => {}) {
      const wrap = el('div', 'wd-valsel');
      let devices = null;
      valueDevices(def.type).then((list) => { devices = list; draw(); }, () => {});

      const find = (id) => {
        const i = typeof id === 'string' ? id.indexOf(':') : -1;
        if (i < 0 || !devices) return null;
        const dev = devices.find(x => x.id === id.slice(0, i));
        const cap = dev && dev.caps.find(c => c.id === id.slice(i + 1));
        return cap ? { dev, cap } : null;
      };
      const open = async () => {
        let list;
        try { list = await valueDevices(def.type); } catch (err) { toast(String(err.message || err)); return; }
        devices = list;
        const v = draft.settings[s.id];
        chooseValue(list, v && v.id, (item) => { draft.settings[s.id] = item; draw(); changed(); });
      };

      function draw() {
        wrap.textContent = '';
        const v = draft.settings[s.id];
        const id = v && typeof v.id === 'string' && v.id.includes(':') ? v.id : null;
        if (!id) {
          wrap.append(button('wd-btn', t('chooseValue'), open));
          return;
        }
        const hit = find(id);
        const row = button(`wd-valrow${devices && !hit ? ' missing' : ''}`, '', open);
        row.title = t('changeValue');
        const text = el('span', 'wd-devtext');
        if (hit) {
          text.append(el('span', 'wd-devname', hit.cap.title),
            el('span', 'wd-hint', [hit.dev.name, hit.dev.zone && hit.dev.zone.name].filter(Boolean).join(' · ')));
        } else {
          text.append(el('span', 'wd-devname', v.name || id), el('span', 'wd-hint', devices ? t('missingValue') : '…'));
        }
        row.append(deviceIcon(hit && hit.dev), text);
        if (hit) row.append(el('span', 'wd-valreading', formatReading(hit.cap)));
        const remove = button('wd-icon wd-devremove', '', () => { draft.settings[s.id] = null; draw(); changed(); }, t('clear'));
        remove.append(icon('close'));
        const line = el('div', 'wd-valline');
        line.append(row, remove);
        wrap.append(line);
      }

      draw();
      return wrap;
    }

    /**
     * The device value picker: the device picker's dialog (a search, the rooms as filters, each room's devices as
     * tiles), where a device opens its values with their readings and a tap on one picks it. A search also lists the
     * matching values straight away (`temperature` gives every temperature), so one tap is enough.
     */
    function chooseValue(devices, currentId, onDone) {
      const { d, body } = wd.dialog(t('chooseValue'));
      d.classList.add('wide', 'tall');
      const tools = el('div', 'wd-devtools');
      const search = el('input', 'wd-input');
      search.type = 'search';
      search.placeholder = t('search');
      const rooms = el('div', 'wd-rooms');
      tools.append(search, rooms);
      const box = el('div', 'wd-devgroups');
      body.append(tools, box);
      const actions = el('div', 'wd-actions');
      actions.append(el('span', 'wd-spacer'), button('wd-btn quiet', t('cancel'), () => d.close()));
      d.append(actions);

      const pick = (dev, cap) => { onDone(slotItem(dev, cap)); d.close(); };

      // The rooms, in the order of their place in the home, devices without one last (as the device picker).
      const groups = new Map();
      for (const dev of devices) {
        const key = dev.zone ? dev.zone.id : '';
        if (!groups.has(key)) groups.set(key, { key, label: dev.zone ? dev.zone.name : t('noRoom'), path: dev.zone ? dev.zone.path : [], devices: [] });
        groups.get(key).devices.push(dev);
      }
      const sortKey = (g) => (g.key ? [...g.path, g.label].join('\u0000').toLowerCase() : '\uffff');
      const ordered = [...groups.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      let room = 'all';
      // The device whose values show, or null for the rooms; opens at the current choice's device.
      const sep = typeof currentId === 'string' ? currentId.indexOf(':') : -1;
      let device = sep > 0 ? devices.find(x => x.id === currentId.slice(0, sep)) || null : null;

      function drawRooms() {
        rooms.textContent = '';
        rooms.hidden = !!device || ordered.length < 2;
        const chip = (id, label, n) => {
          const b = button(`wd-room${room === id ? ' on' : ''}`, '', () => { room = id; drawRooms(); draw(); });
          b.append(el('span', null, label), el('span', 'wd-room-count', String(n)));
          b.setAttribute('aria-pressed', String(room === id));
          rooms.append(b);
        };
        chip('all', t('allRooms'), devices.length);
        for (const g of ordered) chip(g.key, g.label, g.devices.length);
      }

      /** A value's row: its title over the device (with the device's icon when `withDevice`), and its reading. */
      function valueRow(dev, cap, withDevice) {
        const on = `${dev.id}:${cap.id}` === currentId;
        const row = button(`wd-valoption${on ? ' on' : ''}`, '', () => pick(dev, cap));
        const text = el('span', 'wd-devtext');
        text.append(el('span', 'wd-devname', cap.title));
        if (withDevice) text.append(el('span', 'wd-hint', dev.name));
        if (withDevice) row.append(deviceIcon(dev));
        row.append(text, el('span', 'wd-valreading', formatReading(cap)));
        const mark = el('span', 'wd-valcheck');
        if (on) mark.append(icon('check'));
        row.append(mark);
        return row;
      }

      function groupHead(g, extra) {
        const head = el('div', 'wd-devgroup-head');
        const title = el('div', 'wd-devgroup-title');
        if (g.path.length) title.append(el('span', 'wd-hint', g.path.join(' › ')));
        title.append(el('h3', 'wd-h2', g.label));
        head.append(title);
        if (extra) head.append(extra);
        return head;
      }

      function draw() {
        box.textContent = '';
        drawRooms();
        if (device) { drawDevice(); return; }
        const q = search.value.trim().toLowerCase();
        let shown = 0;
        for (const g of ordered) {
          if (room !== 'all' && room !== g.key) continue;
          const section = el('section', 'wd-devgroup');
          if (!q) {
            // The devices as tiles; a tap opens its values.
            const tiles = el('div', 'wd-devtiles');
            for (const dev of g.devices) {
              const chosen = sep > 0 && dev.id === currentId.slice(0, sep);
              const tile = button(`wd-devtile${chosen ? ' on' : ''}`, '', () => { device = dev; box.scrollTop = 0; draw(); });
              tile.append(deviceIcon(dev, 'large'), el('span', 'wd-devtile-name', dev.name),
                el('span', 'wd-hint wd-valnames', dev.caps.map(c => c.title).join(', ')));
              tiles.append(tile);
            }
            shown += g.devices.length;
            section.append(groupHead(g), tiles);
          } else {
            // A search lists the values: all of a device whose name or room matches, else those whose title does.
            const list = el('div', 'wd-vallist');
            for (const dev of g.devices) {
              const whole = `${dev.name} ${roomLabel(dev)}`.toLowerCase().includes(q);
              for (const cap of dev.caps) {
                if (!whole && !`${cap.title} ${cap.id}`.toLowerCase().includes(q)) continue;
                list.append(valueRow(dev, cap, true));
                shown++;
              }
            }
            if (!list.childElementCount) continue;
            section.append(groupHead(g), list);
          }
          box.append(section);
        }
        if (!shown) box.append(el('p', 'wd-hint', t(q ? 'noValues' : 'noDevices')));
      }

      /** One device's values, with a way back to the rooms. */
      function drawDevice() {
        const head = el('div', 'wd-valhead');
        const back = button('wd-btn quiet small wd-valback', '', () => { device = null; draw(); search.focus(); });
        back.append(icon('left'), el('span', null, t('allDevices')));
        const who = el('div', 'wd-valwho');
        const text = el('span', 'wd-devtext');
        text.append(el('span', 'wd-devname', device.name), el('span', 'wd-hint', roomLabel(device)));
        who.append(deviceIcon(device, 'large'), text);
        head.append(back, who);
        const list = el('div', 'wd-vallist');
        for (const cap of device.caps) list.append(valueRow(device, cap, false));
        box.append(head, list);
      }

      // Typing goes back to the rooms, where the search lists the matching values.
      search.addEventListener('input', () => { device = null; draw(); });
      draw();
      d.showModal();
      if (!device) search.focus();
    }

    /** An autocomplete setting: the choice, and a search through the app's own listener (with the draft's settings). */
    function autocompletePicker(def, s, draft, changed = () => {}) {
      const wrap = el('div', 'wd-picker');
      const head = el('div', 'wd-row');
      const pick = button('wd-btn wd-choice', '', () => toggle());
      const clear = button('wd-btn quiet small', t('clear'), () => {
        draft.settings[s.id] = null;
        label();
        changed();
      });
      head.append(pick, clear);
      const search = el('input', 'wd-input');
      search.type = 'search';
      search.placeholder = t('search');
      const list = el('div', 'wd-options');
      wrap.append(head);
      const label = () => {
        const v = draft.settings[s.id];
        pick.textContent = v && v.name ? v.name : t('choose');
        clear.hidden = !v;
      };
      label();
      let open = false;
      let seq = 0;
      let timer = null;
      const load = async () => {
        const mine = ++seq;
        try {
          // The page's key goes along: the Smart Stack's dashboards are read with the app's stored key. Another app's
          // autocomplete is Homey's to ask that app (it needs a key with full access, as Homey's list of them does).
          const items = def.app
            ? await homeyRequest('GET', `/manager/dashboards/appwidget/${encodeURIComponent(def.type)}/autocomplete?${bracketQuery(new URLSearchParams({ settingId: s.id, query: search.value }), draft.settings, 'settings')}`)
            : await request('POST', '/web/autocomplete', { type: def.type, setting: s.id, query: search.value, settings: draft.settings, key: wd.key });
          if (mine !== seq) return;
          list.textContent = '';
          if (!items || !items.length) list.append(el('p', 'wd-hint', t('nothingFound')));
          for (const item of items || []) {
            const row = button('wd-option', '', () => {
              const chosen = {};
              for (const k in item) if (k !== 'image') chosen[k] = item[k];
              draft.settings[s.id] = chosen;
              label();
              changed();
              toggle(false);
            });
            if (item.image) {
              const img = el('img', 'wd-option-image');
              img.src = item.image;
              img.alt = '';
              row.append(img);
            }
            const text = el('span', 'wd-option-text');
            text.append(el('span', 'wd-option-name', item.name));
            if (item.description) text.append(el('span', 'wd-hint', item.description));
            row.append(text);
            list.append(row);
          }
        } catch (err) {
          if (mine !== seq) return;
          list.textContent = '';
          list.append(el('p', 'wd-error', String(err.message || err)));
        }
      };
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(load, 250);
      });
      function toggle(on = !open) {
        open = on;
        wrap.classList.toggle('open', open);
        if (open) {
          wrap.append(search, list);
          search.value = '';
          list.textContent = '';
          load();
          search.focus();
        } else {
          search.remove();
          list.remove();
        }
      }
      return wrap;
    }

    Object.assign(wd, { autocompletePicker, devicePicker, valuePicker });
  });
})();
