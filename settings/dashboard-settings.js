/*
 * The web dashboards page — the dialogs: choosing a widget, a widget's settings with its live preview, and the
 * setting controls. A part of the page (settings/dashboard.js): mountWebDashboards() runs it once with `wd`, the
 * page's shared state and functions. The core's functions and constants are taken from `wd` at the top; the state
 * that changes, and the other parts' functions, are read as `wd.<name>`. Plain browser JS (served as-is).
 */
(function () {
  'use strict';

  window.WidgetkeeperWeb.part('settings', (wd) => {
    const { appWidget, button, clone, CONFIRM_MS, el, frames, icon, LAYOUT, newId, opts, persist, t, typeOf } = wd;

    /** Add widget's groups: every widget of ours is in one (a test checks), alphabetical by its name inside it. */
    const WIDGET_GROUPS = [
      ['groupControl', ['curtains', 'lightrooms', 'lights', 'media', 'quickactions']],
      ['groupSecurity', ['cameras', 'keypad', 'locks', 'sensoralarms', 'sensordots']],
      ['groupClimate', ['pollen', 'roomhealth', 'thermostat', 'weather']],
      ['groupEnergy', ['electricity', 'price']],
      ['groupValues', ['combined', 'sparklines', 'valueboard', 'valuematrix', 'values']],
      ['groupCharts', ['charts', 'compare', 'dailyrange', 'gauge', 'heatmap', 'lines', 'scatter', 'stacked', 'timeline', 'totals', 'typicalday']],
      ['groupFlows', ['flows', 'flowtiles', 'popups', 'variables', 'varpresets']],
      ['groupTime', ['clock', 'dayssince', 'textline', 'timers']],
      ['groupLayout', ['shortcuts', 'spacer', 'stack', 'webpage']],
    ];

    /**
     * A colour setting's values drawn as swatches: the widgets' palette (kit.css's bright colours, which `swatch()`'s `wk`
     * class defines; grey too, also for Flow Buttons' own grey). `default` and `neutral` are the widget's own colour, an
     * outlined swatch.
     */
    const SWATCHES = {
      ...Object.fromEntries(window.WidgetkeeperKit.COLORS.map(c => [c, `var(--wk-${c}-bright)`])),
      default: null, neutral: null,
    };

    // ---- Dialogs: choose a widget, a widget's settings -------------------------------------------------------

    /** A dialog with a title (and for a widget's settings its preview and description) and ✕ (`leave`, if given, instead of closing). */
    function dialog(title, type, leave) {
      const d = el('dialog', 'wd-dialog');
      const head = el('div', 'wd-dialog-head');
      if (type) {
        const who = el('div', 'wd-dialog-who');
        const text = el('div', 'wd-dialog-titles');
        text.append(el('h2', 'wd-h1', title), el('p', 'wd-muted', wd.about(type)));
        who.append(wd.preview(type, 'wd-dialog-preview'), text);
        head.append(who);
      } else {
        head.append(el('h2', 'wd-h2', title));
      }
      head.append(button('wd-tool', '✕', () => (leave ? leave() : d.close()), t('cancel')));
      const body = el('div', 'wd-dialog-body');
      d.append(head, body);
      d.addEventListener('close', () => d.remove());
      document.body.append(d);
      return { d, body };
    }

    /** Every word typed is somewhere in the text, in any order, any case and with or without accents. */
    function matchesWords(query, text) {
      const plain = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const hay = plain(text);
      return plain(query).split(/\s+/).filter(Boolean).every(word => hay.includes(word));
    }

    function chooseWidget(column) {
      const { d, body } = dialog(t('chooseWidget'));
      d.classList.add('wide', 'tall');
      const tools = el('div', 'wd-devtools');
      const search = el('input', 'wd-input');
      search.type = 'search';
      search.placeholder = t('search');
      search.setAttribute('aria-label', t('search'));
      const chips = el('div', 'wd-rooms wrap');
      tools.append(search, chips);
      const groupsBox = el('div', 'wd-devgroups');
      body.append(tools, groupsBox);

      // Each group's widgets by name; a widget in no group (a test forbids it) still shows, in the last. Then other
      // apps' widgets, by app (only what Homey still offers: not a deprecated one).
      const types = [...wd.types.values()].sort((a, b) => a.name.localeCompare(b.name));
      const groups = WIDGET_GROUPS.map(([key, ids], i) => ({
        key,
        label: t(key),
        defs: types.filter(def => ids.includes(def.type) || (i === WIDGET_GROUPS.length - 1 && !WIDGET_GROUPS.some(g => g[1].includes(def.type)))),
      }));
      const others = [...wd.foreign.values()].filter(f => !f.deprecated)
        .sort((a, b) => a.ownerName.localeCompare(b.ownerName) || a.name.localeCompare(b.name));
      if (others.length || wd.foreignState !== 'ok') groups.push({ key: 'otherApps', label: t('otherApps'), defs: others });
      let group = 'all';

      function drawChips() {
        chips.textContent = '';
        const chip = (id, label, n) => {
          const b = button(`wd-room${group === id ? ' on' : ''}`, '', () => { group = id; drawChips(); draw(); });
          b.append(el('span', null, label), el('span', 'wd-room-count', String(n)));
          b.setAttribute('aria-pressed', String(group === id));
          chips.append(b);
        };
        chip('all', t('allWidgets'), groups.reduce((n, g) => n + g.defs.length, 0));
        for (const g of groups) chip(g.key, g.label, g.defs.length);
      }

      function draw() {
        groupsBox.textContent = '';
        const query = search.value;
        let shown = 0;
        for (const g of groups) {
          if (group !== 'all' && group !== g.key) continue;
          const defs = g.defs.filter(def => matchesWords(query, `${def.name} ${wd.about(def.type)} ${g.label}`));
          // Other apps' list says so when it couldn't be read, with or without a search.
          const problem = g.key === 'otherApps' && !query.trim() && wd.foreignState !== 'ok' && wd.foreignState !== null;
          if (!defs.length && !problem) continue;
          shown += defs.length;
          const section = el('section', 'wd-type-group');
          const head = el('div', 'wd-types-head');
          head.append(el('h3', 'wd-h2', g.label));
          if (g.key === 'otherApps' && wd.foreignState === 'noScope') head.append(el('p', 'wd-muted', t('otherAppsKey')));
          else if (g.key === 'otherApps' && wd.foreignState === 'failed') head.append(el('p', 'wd-error', t('otherAppsFailed')));
          section.append(head);
          if (defs.length) {
            const list = el('div', 'wd-types');
            for (const def of defs) list.append(typeButton(def));
            section.append(list);
          }
          groupsBox.append(section);
        }
        if (!shown && !groupsBox.childElementCount) groupsBox.append(el('p', 'wd-muted', t('noWidgets')));
      }
      search.addEventListener('input', draw);
      drawChips();
      draw();
      d.showModal();
      // Not where the keyboard would slide up over the list on a tablet.
      if (window.matchMedia && window.matchMedia('(hover: hover)').matches) search.focus();

      function typeButton(def) {
        const b = button('wd-type', '', () => {
          d.close();
          const settings = {};
          for (const s of def.settings) settings[s.id] = clone(s.value);
          const w = { id: newId(), type: def.type, title: '', settings, deviceIds: [] };
          wd.current.dashboard.columns[column].push(w);
          wd.syncGrid(); // saved by the dialog's Save: Cancel takes it away again
          editWidget(w.id, { pickDevices: true, isNew: true });
        });
        const text = el('span', 'wd-type-text');
        text.append(el('span', 'wd-type-name', def.name), el('span', 'wd-type-about', wd.about(def.type)));
        b.append(wd.preview(def.type, 'wd-type-preview'), text);
        return b;
      }
    }

    /**
     * A widget's settings, laid out in cards by the sections the app gives (`settingSections()`: the titles' groups):
     * the devices, the general settings with the title, each group (a numbered one folds, with a summary of its
     * values in its header) and the slots. `pickDevices` (a widget just added) opens its device picker at once. `isNew`:
     * not saved yet, so leaving without Save takes it off the dashboard. With changes made, ✕, Cancel and Escape take a
     * second go (no browser dialogs).
     */
    function editWidget(id, { pickDevices = false, isNew = false } = {}) {
      const at = wd.find(id);
      if (!at) return;
      const w = at.widget;
      const def = typeOf(w.type);
      if (!def) return;
      const draft = { title: w.title || '', settings: clone(w.settings || {}), deviceIds: (w.deviceIds || []).slice() };
      // Another app's widget: size it as on Homey, run it unsandboxed.
      const trust = { settings: { scaled: w.scaled === true, trusted: w.trusted === true } };
      for (const s of def.settings) if (!(s.id in draft.settings)) draft.settings[s.id] = clone(s.value);
      const { d, body } = dialog(def.name, def.type, leave);
      d.classList.add('wd-settings');
      const byId = new Map(def.settings.map(s => [s.id, s]));
      const updates = []; // what follows the draft: the groups' summaries, the rows a switch turns off
      const changed = () => { for (const f of updates) f(); };
      let n = 0;
      const uid = () => `wd-f${++n}`;
      const card = (className) => el('section', `wd-set-card${className ? ` ${className}` : ''}`);
      const rows = (ids, label, hints = true) => ids.map(sid => settingRow(def, byId.get(sid), draft, changed, uid(), label ? label(byId.get(sid)) : undefined, hints));

      if (def.devices) body.append(wd.devicePicker(def, draft, pickDevices, () => changed()));

      const title = el('input', 'wd-input');
      title.id = uid();
      title.value = draft.title;
      title.addEventListener('input', () => { draft.title = title.value; });
      const titleRow = el('div', 'wd-set-row inline');
      const titleText = el('div', 'wd-set-text');
      const titleLabel = el('label', 'wd-set-label', t('widgetTitle'));
      titleLabel.htmlFor = title.id;
      titleText.append(titleLabel, el('p', 'wd-hint', t('widgetTitleHint')));
      titleRow.append(titleText, title);

      // Its width in columns, as far as the columns to its right go (the resize handle's keyboard and touch twin).
      const count = wd.current.dashboard.columns.length;
      const width = { span: LAYOUT.spanOf(w, at.c, count) };
      let widthRow = null;
      if (count - at.c > 1) {
        widthRow = el('div', 'wd-set-row inline');
        const widthText = el('div', 'wd-set-text');
        widthText.append(el('span', 'wd-set-label', t('width')), el('p', 'wd-hint', t('widthHint')));
        const spans = Array.from({ length: count - at.c }, (_, k) => ({ id: String(k + 1), title: String(k + 1) }));
        const seg = choiceGroup(null, spans, String(width.span), (v) => { width.span = Number(v); }, false);
        seg.setAttribute('aria-label', t('width'));
        widthRow.append(widthText, seg);
      }

      const sections = def.sections || [{ kind: 'plain', ids: def.settings.map(s => s.id) }];
      // A run of numbered groups (Flow Buttons' eight buttons) shares a card; one of more than two starts folded.
      const numbered = (sec) => sec && sec.kind === 'group' && sec.numbered;
      const runOf = sections.map((sec, i) => {
        if (!numbered(sec)) return 0;
        let a = i;
        let b = i;
        while (numbered(sections[a - 1])) a--;
        while (numbered(sections[b + 1])) b++;
        return b - a + 1;
      });

      let general = null;
      let stack = null;
      sections.forEach((sec, i) => {
        if (!numbered(sec)) stack = null;
        if (sec.kind === 'plain') {
          const c = card();
          if (i === 0) { c.append(titleRow); if (widthRow) c.append(widthRow); general = c; }
          c.append(...rows(sec.ids));
          body.append(c);
        } else if (sec.kind === 'slots') {
          // The slots' hint (on the first) goes above them, beside their narrow labels it would be a column.
          const c = card('wd-set-slots');
          const hint = sec.ids.map(sid => byId.get(sid).hint).find(Boolean);
          if (hint) c.append(el('p', 'wd-hint wd-set-note', hint));
          c.append(...rows(sec.ids, null, false));
          body.append(c);
        } else if (sec.numbered) {
          if (!stack) body.append(stack = card('wd-set-stack'));
          stack.append(groupCard(sec, runOf[i] <= 2));
        } else {
          const head = byId.get(sec.ids[0]);
          const c = card('wd-set-group');
          if (head.type === 'checkbox') {
            // A switch with its settings under it (the Smart Stack's page dots): they fade while it's off.
            c.append(...rows([head.id]));
            const sub = el('div', 'wd-set-sub');
            sub.append(...rows(sec.ids.slice(1)));
            c.append(sub);
            updates.push(() => { const off = draft.settings[head.id] !== true; sub.classList.toggle('off', off); sub.inert = off; });
          } else {
            c.append(el('h3', 'wd-set-title wd-set-caption', sec.title), ...rows(sec.ids));
          }
          body.append(c);
        }
      });
      if (!general) {
        general = card();
        general.append(titleRow);
        if (widthRow) general.append(widthRow);
        body.insertBefore(general, body.querySelector(':scope > .wd-set-card:not(.wd-set-devices)') || null);
      }
      if (def.app) {
        const c = card();
        c.append(
          settingRow(def, { id: 'scaled', type: 'checkbox', title: t('scaleTitle'), hint: t('scaleHint') }, trust, () => {}, uid()),
          settingRow(def, { id: 'trusted', type: 'checkbox', title: t('trustTitle'), hint: t('trustHint') }, trust, () => {}, uid()),
        );
        body.append(c);
      }

      /** A numbered group (`Button 1`): a header that folds it, with what its values are; its rows under it. */
      function groupCard(sec, open) {
        const c = el('div', 'wd-set-fold');
        const inner = el('div', 'wd-set-rows');
        inner.id = uid();
        const head = button('wd-set-head', '', () => setOpen(!open));
        head.setAttribute('aria-controls', inner.id);
        const summary = el('span', 'wd-set-summary');
        const chevron = el('span', 'wd-set-chevron');
        chevron.append(icon('down'));
        head.append(el('span', 'wd-set-title', sec.title), summary, chevron);
        // The head's own label is the group's title when its title has no colon (Media's `Button 1`): not twice.
        inner.append(...rows(sec.ids, s => (s.label === sec.title ? '' : s.label)));
        c.append(head, inner);
        const setOpen = (on) => {
          open = on;
          c.classList.toggle('open', open);
          head.setAttribute('aria-expanded', String(open));
          inner.hidden = !open;
        };
        setOpen(open);
        updates.push(() => {
          const { parts, empty } = groupSummary(sec);
          summary.textContent = '';
          c.classList.toggle('empty', empty);
          if (empty) return; // its title is dimmed
          parts.forEach((p, k) => {
            if (k) summary.append(' · ');
            if (p.swatch !== undefined) summary.append(swatch(p.swatch, 'small'));
            summary.append(p.text);
          });
        });
        return c;
      }

      /** What a group's values are, for its header: the choices' names, the dropdowns' titles, the texts. */
      function groupSummary(sec) {
        const parts = [];
        let empty = false;
        sec.ids.forEach((sid, k) => {
          const s = byId.get(sid);
          const v = draft.settings[sid];
          if (s.type === 'autocomplete') {
            if (v && v.name) parts.push({ text: v.name });
            else if (k === 0) empty = true;
          } else if (s.type === 'dropdown') {
            const opt = (s.values || []).find(o => o.id === String(v));
            if (opt) parts.push(isSwatches(s) ? { text: opt.title, swatch: SWATCHES[opt.id] } : { text: opt.title });
          } else if (s.type === 'number') {
            if (k === 0 && v != null) parts.push({ text: `${v} ${splitUnit(s.title.slice(s.title.indexOf(':') + 1).trim()).label}`.trim() }); // `5 minutes`
          } else if (s.type === 'text' || s.type === 'textarea') {
            if (typeof v === 'string' && v.trim()) parts.push({ text: v.trim() });
          }
        });
        return { parts, empty };
      }

      // Ours get a live preview beside the cards (above them on a narrow screen).
      if (!appWidget(w.type)) {
        const cards = el('div', 'wd-set-cards');
        cards.append(...body.childNodes);
        body.append(cards, livePreview(w, def, draft, d, updates));
        d.classList.add('with-preview');
      }
      changed();
      const edits = () => JSON.stringify([draft, width.span, trust.settings]);
      const unedited = edits();
      let saved = false;
      let armedUntil = 0;
      let disarm = null;
      const cancel = button('wd-btn quiet', t('cancel'), leave);
      /** ✕, Cancel and Escape: closes, or with changes made says so first and closes on the next go. */
      function leave() {
        if (edits() === unedited || Date.now() < armedUntil) { d.close(); return; }
        armedUntil = Date.now() + CONFIRM_MS;
        cancel.textContent = t('discardEdits');
        cancel.classList.add('armed');
        cancel.focus();
        clearTimeout(disarm);
        disarm = setTimeout(() => {
          cancel.textContent = t('cancel');
          cancel.classList.remove('armed');
        }, CONFIRM_MS);
      }
      d.addEventListener('cancel', (e) => { e.preventDefault(); leave(); });
      d.addEventListener('close', () => {
        clearTimeout(disarm);
        if (!isNew || saved || !wd.current) return;
        const added = wd.find(id);
        if (!added) return;
        wd.current.dashboard.columns[added.c].splice(added.i, 1);
        wd.syncGrid();
      });
      const actions = el('div', 'wd-actions');
      actions.append(
        cancel,
        button('wd-btn primary', t('save'), () => {
          saved = true;
          const now = wd.find(id);
          if (now) {
            now.widget.title = draft.title.trim();
            now.widget.settings = draft.settings;
            now.widget.deviceIds = draft.deviceIds;
            for (const key of ['scaled', 'trusted']) {
              if (trust.settings[key] === true) now.widget[key] = true;
              else delete now.widget[key];
            }
            if (width.span !== LAYOUT.spanOf(now.widget, now.c, wd.current.dashboard.columns.length)) {
              wd.setSpan(id, now.c, width.span); // saves it all
              d.close();
              return;
            }
            persist();
            wd.syncGrid();
          }
          d.close();
        }),
      );
      d.append(actions);
      d.showModal();
    }

    /**
     * A widget's live preview in its settings dialog: its own index.html in a frame like the dashboard's (or the dev
     * renders' `mountWidget`), whose settings and devices are the dialog's draft, drawn again 400 ms after a change
     * (pushed to `updates`). Its own widget instance, so a Timers or Media preview doesn't share the widget's. Closing
     * the dialog takes it away; Cancel leaves the widget as it was.
     */
    function livePreview(w, def, draft, dialog, updates) {
      const aside = el('aside', 'wd-preview');
      aside.append(el('h3', 'wd-set-caption', t('preview')));
      const wrap = el('div', `wd-frame${def.transparent ? '' : ' card'} wd-blends`);
      aside.append(wrap);
      const shown = () => ({ ...w, settings: clone(draft.settings), deviceIds: draft.deviceIds.slice() });
      let draw;
      if (opts.mountWidget) {
        draw = () => { wrap.textContent = ''; opts.mountWidget(shown(), wrap); };
      } else {
        const iframe = document.createElement('iframe');
        iframe.title = t('preview');
        if (typeof def.height === 'string') iframe.style.aspectRatio = `100 / ${parseFloat(def.height)}`;
        else iframe.style.height = `${def.height || 120}px`;
        wrap.append(iframe);
        const frame = { widget: shown(), iframe, subs: new Map(), gen: 0, app: null, sandboxed: false, scaled: false };
        frames.add(frame);
        wd.stampSurface(frame);
        let n = 0;
        draw = () => {
          frame.widget = shown();
          iframe.src = `${wd.widgetFolder(w.type)}/index.html?widgetInstanceId=${encodeURIComponent(`web-preview-${w.id}`)}&v=${++n}`;
        };
        dialog.addEventListener('close', () => { wd.dropListeners(frame); frames.delete(frame); });
      }
      let timer = null;
      let first = true;
      updates.push(() => {
        clearTimeout(timer);
        if (first) { first = false; draw(); return; }
        timer = setTimeout(draw, 400);
      });
      dialog.addEventListener('close', () => clearTimeout(timer));
      return aside;
    }

    /** `Amber after (days)` → `Amber after` and `days`: a number's unit goes after its field. */
    function splitUnit(label) {
      const m = /^(.*\S)\s*\(([^()]{1,16})\)$/.exec(label || '');
      return m ? { label: m[1], unit: m[2] } : { label: label || '', unit: '' };
    }

    /** A dropdown of the widgets' colours, drawn as swatches. */
    const isSwatches = (s) => (s.values || []).length > 1 && s.values.every(v => v.id in SWATCHES) && s.values.some(v => SWATCHES[v.id]);

    function swatch(colour, className) {
      const dot = el('span', `wd-swatch-dot wk${className ? ` ${className}` : ''}${colour ? '' : ' plain'}`); // wk: kit.css's colours
      if (colour) dot.style.background = colour;
      return dot;
    }

    /**
     * One setting as a row: its label and hint, and its control, beside them (`inline`: a switch, a number, a short
     * choice, a text) or under them (a list, a search, a long text).
     */
    function settingRow(def, s, draft, changed, fid, label = s.label || s.title, withHint = true) {
      const { node, inline, labelable = true } = settingControl(def, s, draft, changed, fid);
      let text = label;
      if (s.type === 'number') {
        const split = splitUnit(label);
        text = split.label;
        if (split.unit) node.append(el('span', 'wd-unit', split.unit));
      }
      const row = el('div', `wd-set-row${inline ? ' inline' : ''}${s.type === 'checkbox' ? ' switch' : ''}`);
      const head = el('div', 'wd-set-text');
      if (text) {
        const l = el(labelable ? 'label' : 'span', 'wd-set-label', text);
        if (labelable) l.htmlFor = fid;
        else l.id = `${fid}-label`;
        head.append(l);
      }
      if (s.hint && withHint) head.append(el('p', 'wd-hint', s.hint));
      if (!labelable) node.setAttribute(text ? 'aria-labelledby' : 'aria-label', text ? `${fid}-label` : s.title);
      if (head.childElementCount) row.append(head);
      row.append(node);
      return row;
    }

    /** A setting's control, writing to the draft: a switch, swatches, a segmented choice, a select, a field, a picker. */
    function settingControl(def, s, draft, changed, fid) {
      const set = (v) => { draft.settings[s.id] = v; changed(); };
      const value = draft.settings[s.id];
      switch (s.type) {
        case 'checkbox': {
          const box = el('input', 'wd-switch');
          box.type = 'checkbox';
          box.id = fid;
          box.setAttribute('role', 'switch');
          box.checked = value === true;
          box.addEventListener('change', () => set(box.checked));
          return { node: box, inline: true };
        }
        case 'number': {
          const wrap = el('span', 'wd-num');
          const input = el('input', 'wd-input');
          input.type = 'number';
          input.id = fid;
          input.step = 'any';
          if (s.min != null) input.min = String(s.min);
          if (s.max != null) input.max = String(s.max);
          input.value = value == null ? '' : String(value);
          input.addEventListener('input', () => {
            const v = input.value.trim();
            set(v === '' ? null : Number(v));
          });
          wrap.append(input);
          return { node: wrap, inline: true };
        }
        case 'textarea': {
          const area = el('textarea', 'wd-input');
          area.id = fid;
          area.rows = 4;
          area.value = String(value ?? '');
          area.addEventListener('input', () => set(area.value));
          return { node: area, inline: false };
        }
        case 'dropdown': {
          const values = s.values || [];
          if (isSwatches(s) || (values.length <= 3 && values.reduce((sum, v) => sum + v.title.length, 0) <= 24)) {
            return { node: choiceGroup(s, values, value, set, isSwatches(s)), inline: true, labelable: false };
          }
          const select = el('select', 'wd-input');
          select.id = fid;
          for (const v of values) {
            const o = el('option', null, v.title);
            o.value = v.id;
            select.append(o);
          }
          select.value = String(value ?? '');
          select.addEventListener('change', () => set(select.value));
          return { node: select, inline: true };
        }
        case 'autocomplete': {
          const node = s.picker === 'capability' ? wd.valuePicker(def, s, draft, changed) : wd.autocompletePicker(def, s, draft, changed);
          node.id = fid;
          return { node, inline: false, labelable: false };
        }
        default: { // text
          const input = el('input', 'wd-input');
          input.id = fid;
          input.value = String(value ?? '');
          input.addEventListener('input', () => set(input.value));
          return { node: input, inline: true };
        }
      }
    }

    /** A short dropdown as one row of choices (`1 | 2`, `Standard | Compact`), or a colour's as swatches. */
    /** @param {Record<string, string | null>} [colours] a swatch's colour per value (the widgets' palette) */
    function choiceGroup(s, values, value, set, swatches, colours = SWATCHES) {
      const group = el('div', swatches ? 'wd-swatches' : 'wd-seg');
      group.setAttribute('role', 'radiogroup');
      const name = el('span', 'wd-swatch-name');
      const draw = (current) => {
        for (const b of group.querySelectorAll('button')) {
          const on = b.dataset.id === current;
          b.classList.toggle('on', on);
          b.setAttribute('aria-checked', String(on));
          b.tabIndex = on || (!values.some(v => v.id === current) && b === group.querySelector('button')) ? 0 : -1;
        }
        const opt = values.find(v => v.id === current);
        name.textContent = opt ? opt.title : '';
      };
      for (const v of values) {
        const b = button(swatches ? 'wd-swatch' : 'wd-seg-option', swatches ? '' : v.title, () => { set(v.id); draw(v.id); });
        b.dataset.id = v.id;
        b.setAttribute('role', 'radio');
        if (swatches) {
          b.title = v.title;
          b.setAttribute('aria-label', v.title);
          b.append(swatch(colours[v.id]));
        }
        group.append(b);
      }
      // The arrow keys move the choice, as in a radio group.
      group.addEventListener('keydown', (e) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const all = [...group.querySelectorAll('button')];
        const i = Math.max(0, all.findIndex(b => b.classList.contains('on')));
        const next = all[(i + step + all.length) % all.length];
        next.click();
        next.focus();
      });
      if (swatches) group.append(name);
      draw(String(value ?? ''));
      return group;
    }

    Object.assign(wd, { choiceGroup, chooseWidget, dialog, editWidget, matchesWords, swatch });
  });
})();
