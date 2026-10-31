/*
 * The web dashboards page — the front page: the dashboards' cards and sections, their editing, the page's Settings
 * dialog and the backup. A part of the page (settings/dashboard.js): mountWebDashboards() runs it once with `wd`,
 * the page's shared state and functions. The core's functions and constants are taken from `wd` at the top; the
 * state that changes, and the other parts' functions, are read as `wd.<name>`. Plain browser JS (served as-is).
 */
(function () {
  'use strict';

  window.WidgetkeeperWeb.part('front', (wd) => {
    const { applyDim, AWAKE_STORAGE, button, confirmButton, deleted, DIM_STORAGE, dimLevel, DRAG_SLOP, EDGE_PX, el,
      failed, icon, keepAwake, LAYOUT, loadSetup, MAX_DIM, newId, request, root, route,
      storageSet, t, THEME_STORAGE, toast } = wd;

    /**
     * The front page: the dashboards as cards with a miniature of their columns, then a carousel of the widgets.
     * `editing` (`#/edit`, the pen in its bar): the cards are dragged into order, the carousel can be turned off, and
     * Forget the key is there (a user wanted it out of the way).
     */
    function renderList(editing = false) {
      wd.clearRoot();
      wd.applyTheme('auto');
      const page = el('div', `wd-home${editing ? ' arranging' : ''}`);

      const head = el('div', 'wd-section-head');
      const titles = el('div', 'wd-section-titles');
      titles.append(el('h1', 'wd-h1', t('yourDashboards')));
      if (editing) titles.append(el('p', 'wd-muted', t('arrangeHint')));
      head.append(titles);
      // The dashboards in no section under Your dashboards, then each section under its heading, each ending in a
      // New dashboard card that makes one there (not while editing).
      const sections = wd.frontPage.sections || [];
      const sectionOf = d => (sections.some(x => x.id === d.section) ? d.section : '');
      const grid = dashboardGrid('');
      for (const d of wd.dashboards) if (!sectionOf(d)) grid.append(dashboardCard(d, editing));
      if (!editing) grid.append(newDashboardCard(''));
      page.append(head, grid);
      sections.forEach((section, i) => {
        const g = dashboardGrid(section.id);
        for (const d of wd.dashboards) if (sectionOf(d) === section.id) g.append(dashboardCard(d, editing));
        if (!editing) g.append(newDashboardCard(section.id));
        page.append(editing ? sectionEditHead(section, i) : el('h2', 'wd-group-title', section.name || t('untitled')), g);
      });
      if (editing) {
        const add = button('wd-btn wd-group-add', '', () => addSection(), t('addSection'));
        add.append(icon('plus'), el('span', null, t('addSection')));
        add.disabled = sections.length >= wd.maxSections;
        page.append(add);
        arrangeCards(page);
        if (wd.types.size) page.append(widgetCarousel(true));
        const settings = button('wd-btn quiet', '', () => pageSettings(), t('pageSettings'));
        settings.append(icon('sliders'), el('span', 'wd-bar-label', t('pageSettings')));
        const done = el('a', 'wd-btn primary', t('done'));
        done.href = '#/';
        root.append(wd.bar(wd.brand(), el('span', 'wd-spacer'), settings, done), page);
        return;
      }
      if (wd.types.size && wd.frontPage.widgets) page.append(widgetCarousel());

      const edit = el('a', 'wd-icon');
      edit.href = '#/edit';
      edit.title = t('edit');
      edit.setAttribute('aria-label', t('edit'));
      edit.append(icon('pen'));
      root.append(wd.bar(wd.brand(), el('span', 'wd-spacer'), wd.liveNote(), edit), page);
    }

    /** The New dashboard card: makes an empty dashboard in `section` (`''`: none) and opens its editor. */
    function newDashboardCard(section) {
      const add = button('wd-dash wd-dash-new', '', async () => {
        add.disabled = true;
        try {
          const saved = await request('PUT', '/web/dashboards', { name: t('untitled'), theme: 'auto', columns: [[], [], []], ...(section ? { section } : {}) });
          wd.dashboards.push(saved);
          location.hash = `#/d/${saved.id}/edit`;
        } catch (err) {
          add.disabled = false;
          failed(err);
        }
      });
      const plus = el('span', 'wd-dash-plus');
      plus.append(icon('plus'));
      add.append(plus, el('span', 'wd-dash-new-text', t('newDashboard')));
      return add;
    }

    /** A grid of dashboard cards, of one section (`''`: none); an empty one says to drag dashboards into it (edit mode). */
    function dashboardGrid(section) {
      const grid = el('div', 'wd-dashboards');
      grid.dataset.section = section;
      if (section) grid.append(el('p', 'wd-group-empty wd-muted', t('sectionEmpty')));
      return grid;
    }

    /** A section's heading in edit mode: its name to type in, ↑ ↓ to move it, and delete (its dashboards stay, in none). */
    function sectionEditHead(section, i) {
      const head = el('div', 'wd-group-head');
      const name = /** @type {HTMLInputElement} */ (el('input', 'wd-input wd-group-name'));
      name.type = 'text';
      name.value = section.name;
      name.maxLength = 60;
      name.placeholder = t('sectionName');
      name.setAttribute('aria-label', t('sectionName'));
      name.dataset.section = section.id;
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
      name.addEventListener('change', () => {
        const value = name.value.trim();
        if (value === section.name) return;
        wd.frontPage = { ...wd.frontPage, sections: wd.frontPage.sections.map(x => (x.id === section.id ? { ...x, name: value } : x)) };
        saveFront({ sections: wd.frontPage.sections });
      });
      const move = (step) => {
        const list = [...wd.frontPage.sections];
        list.splice(i + step, 0, ...list.splice(i, 1));
        wd.frontPage = { ...wd.frontPage, sections: list };
        saveFront({ sections: list });
        renderList(true);
        const moved = /** @type {HTMLElement} */ (root.querySelector(`.wd-group-name[data-section="${section.id}"]`));
        const b = moved && /** @type {HTMLButtonElement} */ (moved.parentElement.querySelector(step < 0 ? '.wd-group-up' : '.wd-group-down'));
        if (b) (b.disabled ? moved : b).focus();
      };
      const up = button('wd-icon wd-group-up', '', () => move(-1), t('moveUp'));
      up.append(icon('up'));
      up.disabled = i === 0;
      const down = button('wd-icon wd-group-down', '', () => move(1), t('moveDown'));
      down.append(icon('down'));
      down.disabled = i === wd.frontPage.sections.length - 1;
      const remove = confirmButton('wd-icon wd-group-delete', icon('trash'), () => {
        wd.frontPage = { ...wd.frontPage, sections: wd.frontPage.sections.filter(x => x.id !== section.id) };
        wd.dashboards = wd.dashboards.map(d => (d.section === section.id ? withSection(d, '') : d));
        saveFront({ sections: wd.frontPage.sections });
        renderList(true);
      }, t('tapAgain'), t('deleteSection'));
      head.append(name, up, down, remove);
      return head;
    }

    /** Edit mode: a new section at the end, its name selected to type over. */
    function addSection() {
      if ((wd.frontPage.sections || []).length >= wd.maxSections) return;
      const section = { id: newId(), name: t('newSection') };
      wd.frontPage = { ...wd.frontPage, sections: [...(wd.frontPage.sections || []), section] };
      saveFront({ sections: wd.frontPage.sections });
      renderList(true);
      const name = /** @type {HTMLInputElement} */ (root.querySelector(`.wd-group-name[data-section="${section.id}"]`));
      if (!name) return;
      name.scrollIntoView({ block: 'nearest' });
      name.focus();
      name.select();
    }

    /** A dashboard in a section (`''`: none). */
    function withSection(d, section) {
      const copy = { ...d };
      delete copy.section;
      if (section) copy.section = section;
      return copy;
    }

    /** Saves the front page's choices (`sections`, `placement`, `order`, `widgets`) after the saves already queued; keeps what the app answers. */
    function saveFront(change) {
      wd.saving = wd.saving.then(async () => {
        try {
          const res = await request('PUT', '/web/front', change);
          if (res && Array.isArray(res.dashboards)) wd.dashboards = res.dashboards;
          if (res && res.front) wd.frontPage = res.front;
        } catch (err) {
          failed(err);
        }
      });
    }

    /** The front page's edit mode: Settings in its bar, a dialog with the backup, then this browser's Keep screen on, Dim and Sign out. */
    function pageSettings() {
      const { d, body } = wd.dialog(t('pageSettings'));
      d.classList.add('wd-page-settings');
      const browser = el('section', 'wd-page-section');
      const forget = button('wd-btn', t('forgetKey'), () => { forget.disabled = true; wd.signOut(); });
      // This browser's settings as the editor's rows: the label and a hint on the left, the control on the right.
      const setRow = (label, hint, control, id) => {
        const row = el('div', 'wd-set-row inline');
        const head = el('div', 'wd-set-text');
        const l = el(id ? 'label' : 'span', 'wd-set-label', label);
        if (id) l.htmlFor = id;
        head.append(l, el('p', 'wd-hint', hint));
        row.append(head, control);
        return row;
      };
      const box = el('input', 'wd-switch');
      box.type = 'checkbox';
      box.id = 'wd-keep-awake';
      box.setAttribute('role', 'switch');
      box.checked = keepAwake.on;
      const howText = () => t(keepAwake.how === 'lock' ? 'keepAwakeLock' : 'keepAwakeVideo');
      const awake = setRow(t('keepAwake'), howText(), box, box.id);
      awake.classList.add('switch');
      box.addEventListener('change', () => {
        storageSet(AWAKE_STORAGE, box.checked ? '1' : null);
        // In the tap, so a video may start; a refused lock turns to the video, and the hint says so.
        keepAwake.set(box.checked).then(() => { awake.querySelector('.wd-hint').textContent = howText(); });
      });
      // Dim: the page behind the dialog darkens while the slider moves; stored when it's let go. The slider spans the row.
      const slider = el('input', 'wd-dim-slider');
      slider.id = 'wd-dim-level';
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(MAX_DIM);
      slider.step = '5';
      slider.value = String(dimLevel());
      const amount = el('span', 'wd-dim-value');
      const show = () => {
        const level = Number(slider.value);
        amount.textContent = level ? `${level} %` : t('dimOff');
        applyDim(level);
      };
      slider.addEventListener('input', show);
      slider.addEventListener('change', () => {
        show();
        storageSet(DIM_STORAGE, Number(slider.value) ? slider.value : null);
      });
      show();
      const dim = setRow(t('dim'), t('dimText'), amount, slider.id);
      dim.classList.add('wd-dim-row');
      dim.append(slider);
      // Dark or light: this browser's own mode for every dashboard, or each one's theme (Automatic). The front page
      // behind redraws in it (the dialog is on body, so it stays).
      const modes = [['auto', 'themeAuto'], ['dark', 'themeDark'], ['light', 'themeLight']].map(([id, key]) => ({ id, title: t(key) }));
      const mode = wd.choiceGroup(null, modes, wd.ownTheme() || 'auto', (id) => {
        storageSet(THEME_STORAGE, id === 'auto' ? null : id);
        route();
      }, false);
      mode.setAttribute('aria-label', t('darkLight'));
      const card = el('div', 'wd-set-card');
      card.append(setRow(t('darkLight'), t('darkLightText'), mode), awake, dim, setRow(t('signedIn'), t('forgetKeyText'), forget));
      browser.append(el('h3', 'wd-h2', t('thisBrowser')), card);
      body.append(backupSection(), browser);
      d.showModal();
    }

    /**
     * The Settings dialog's backup: the dashboards the user ticks as one file (`GET /web/backup?ids=`: the dashboards, the
     * front page's choices and their widgets' tile names), and a restore of the ones ticked in such a file, which replaces
     * those with the same id and adds the rest after a second tap; the others stay. Each opens a list in place of the
     * buttons (`backupChecklist()`). Here, not on the app settings page: my.homey.app runs that in a frame sandboxed
     * without downloads (2026-10-20).
     */
    function backupSection() {
      const section = el('section', 'wd-page-section');
      const status = el('p', 'wd-muted wd-backup-status');
      status.setAttribute('role', 'status');
      const file = el('input');
      file.type = 'file';
      file.accept = '.json,application/json';
      file.hidden = true;
      const row = el('div', 'wd-row wd-backup-row');
      let open = null; // the list shown in place of the buttons, under the file's summary
      const show = (list) => {
        if (open) open.remove();
        open = list;
        row.hidden = !!list;
        if (list) status.after(list);
      };
      const widgetsOf = d => (d && Array.isArray(d.columns)
        ? d.columns.reduce((m, c) => m + (Array.isArray(c) ? c.length : 0), 0) : 0);
      const download = button('wd-btn', t('backupDownload'), () => {
        status.textContent = '';
        const all = wd.dashboards.slice();
        show(backupChecklist({
          items: all.map(d => ({ name: d.name, widgets: widgetsOf(d) })),
          action: count => t('backupDownloadCount', { count }),
          onCancel: () => show(null),
          onDone: async (chosen, list) => {
            list.busy(true);
            try {
              const picked = chosen.map(i => all[i]);
              const backup = await request('GET', `/web/backup?ids=${picked.map(d => encodeURIComponent(d.id)).join(',')}`);
              saveFile(backup, picked.length === 1 ? (picked[0].name || t('untitled')) : '');
              show(null);
            } catch (err) {
              list.busy(false);
              failed(err);
            }
          },
        }));
      });
      const restore = button('wd-btn', t('backupRestore'), () => {
        show(null);
        status.textContent = '';
        file.value = '';
        file.click();
      });
      file.addEventListener('change', async () => {
        const chosenFile = file.files && file.files[0];
        if (!chosenFile) return;
        let backup = null;
        try { backup = JSON.parse(await chosenFile.text()); } catch (e) { backup = null; }
        if (!backup || backup.format !== 'widgetkeeper-web-dashboards' || !Array.isArray(backup.dashboards)) {
          show(null);
          status.textContent = t('backupInvalid');
          return;
        }
        const inFile = backup.dashboards.filter(d => d && typeof d === 'object');
        const widgets = inFile.reduce((n, d) => n + widgetsOf(d), 0);
        const date = new Date(backup.exportedAt);
        status.textContent = t('backupSummary', {
          dashboards: inFile.length, widgets, date: Number.isNaN(date.getTime()) ? '?' : date.toLocaleString(),
        });
        const stored = new Set(wd.dashboards.map(d => d.id));
        show(backupChecklist({
          items: inFile.map(d => ({
            name: typeof d.name === 'string' ? d.name : '', widgets: widgetsOf(d),
            tag: t(stored.has(d.id) ? 'backupReplaces' : 'backupNew'),
          })),
          action: count => t('backupRestoreCount', { count }),
          confirm: true,
          // A new dashboard (or a repeated id, which gets a new one) needs room under 64.
          problem: (chosen) => {
            const seen = new Set();
            let added = 0;
            for (const i of chosen) {
              const id = inFile[i].id;
              if (seen.has(id) || !stored.has(id)) added++;
              seen.add(id);
            }
            const over = added - (wd.maxDashboards - wd.dashboards.length);
            return over > 0 ? t('backupTooMany', { count: over }) : '';
          },
          onCancel: () => { show(null); status.textContent = ''; },
          onDone: (chosen, list) => {
            list.busy(true);
            const body = {
              format: backup.format, version: backup.version, app: backup.app, exportedAt: backup.exportedAt,
              front: backup.front, tileNames: backup.tileNames,
              dashboards: chosen.map(i => inFile[i]), complete: chosen.length === inFile.length,
            };
            wd.saving = wd.saving.then(async () => {
              try {
                const res = await request('PUT', '/web/backup', body);
                await loadSetup(); // the dashboards and the front page's choices as restored
                if (location.hash === '#/edit') renderList(true); // behind the dialog
                show(null);
                status.textContent = t('backupRestored', { dashboards: res.dashboards, widgets: res.widgets });
              } catch (err) {
                list.busy(false);
                if (/Not a Widgetkeeper backup/.test(String(err && err.message))) {
                  show(null);
                  status.textContent = t('backupInvalid');
                } else {
                  failed(err);
                }
              }
            });
          },
        }));
      });
      row.append(download, restore);
      section.append(el('h3', 'wd-h2', t('backupTitle')), el('p', 'wd-muted', t('backupText')), row, status, file);
      return section;
    }

    /** Downloads a backup as `widgetkeeper-web-dashboards-<date>.json`, or `widgetkeeper-web-<name>-<date>.json` for one. */
    function saveFile(backup, name) {
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      // What a file name can't hold goes; spaces become dashes.
      const safe = name.replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 40);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const a = el('a');
      a.href = url;
      a.download = `widgetkeeper-web-${safe || 'dashboards'}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60e3);
    }

    /**
     * The backup's list of dashboards (`items`: `{name, widgets, tag?}`), every one ticked: the count with Select all or
     * Clear all, a checkbox per dashboard, then `action(count)`'s button and Cancel. The button is disabled while none is
     * ticked or `problem(chosen)` says why (shown under the list); with `confirm` it asks for a second tap within 10 s
     * (`backupConfirm`). `onDone(chosen, list)` gets the ticked items' indexes in order; `list.busy(on)` disables it.
     * @param {{items: {name: string, widgets: number, tag?: string}[], action: (count: number) => string, confirm?: boolean,
     *   problem?: (chosen: number[]) => string, onDone: (chosen: number[], list: {busy: (on: boolean) => void}) => void,
     *   onCancel: () => void}} opts
     */
    function backupChecklist({ items, action, confirm = false, problem = () => '', onDone, onCancel }) {
      const box = el('div', 'wd-backup-pick');
      const chosen = new Set(items.map((_, i) => i));
      const ordered = () => items.map((_, i) => i).filter(i => chosen.has(i));
      const head = el('div', 'wd-backup-head');
      const count = el('span', 'wd-muted');
      const toggle = button('wd-btn quiet small', '', () => {
        const all = chosen.size === items.length;
        boxes.forEach((input, i) => {
          input.checked = !all;
          if (all) chosen.delete(i); else chosen.add(i);
        });
        draw();
      });
      head.append(count, toggle);
      const list = el('div', 'wd-backup-list');
      const boxes = items.map((item, i) => {
        const label = el('label', 'wd-backup-item');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = true;
        input.addEventListener('change', () => {
          if (input.checked) chosen.add(i); else chosen.delete(i);
          draw();
        });
        const text = el('span', 'wd-backup-item-text');
        const name = el('span', 'wd-backup-item-name', item.name || t('untitled'));
        name.dir = 'auto';
        text.append(name, el('span', 'wd-muted', t('widgetCount', { count: item.widgets })));
        label.append(input, text);
        if (item.tag) label.append(el('span', 'wd-backup-tag', item.tag));
        list.append(label);
        return input;
      });
      const note = el('p', 'wd-backup-note');
      note.setAttribute('role', 'status');
      let armed = false;
      let timer = 0;
      let busy = false;
      const go = button('wd-btn primary', '', () => {
        if (confirm && !armed) {
          armed = true;
          go.classList.add('armed');
          go.textContent = t('backupConfirm');
          timer = setTimeout(() => { if (box.isConnected) draw(); }, 10e3);
          return;
        }
        draw();
        onDone(ordered(), handle);
      });
      const cancel = button('wd-btn', t('cancel'), onCancel);
      const foot = el('div', 'wd-row wd-backup-foot');
      foot.append(go, cancel);
      /** The count, the toggle's words and what may be pressed; disarms the button. */
      function draw() {
        clearTimeout(timer);
        armed = false;
        go.classList.remove('armed');
        const why = problem(ordered());
        count.textContent = t('chosenCount', { count: chosen.size });
        toggle.textContent = t(chosen.size === items.length ? 'clearAll' : 'selectAll');
        toggle.disabled = busy || !items.length;
        note.textContent = why;
        go.textContent = action(chosen.size);
        go.disabled = busy || !chosen.size || !!why;
        cancel.disabled = busy;
        for (const input of boxes) input.disabled = busy;
      }
      const handle = { busy(on) { busy = on; draw(); } };
      box.append(head, list, note, foot);
      draw();
      return box;
    }

    /**
     * Deletes a dashboard after the saves already queued, and no save of it after (a name field's change can fire on the
     * way); then `done()`.
     */
    function deleteDashboard(id, done) {
      deleted.add(id);
      wd.saving = wd.saving.then(async () => {
        try {
          await request('DELETE', `/web/dashboards/${encodeURIComponent(id)}`);
          wd.dashboards = wd.dashboards.filter(x => x.id !== id);
          done();
        } catch (err) {
          deleted.delete(id);
          failed(err);
        }
      });
    }

    /**
     * The front page's edit mode: copies a dashboard (after the saves already queued); the app puts the copy right after
     * it, with the widgets' tile names. The copy is then shown, focused and marked for a moment.
     */
    function duplicate(id) {
      const tooMany = () => toast(t('tooManyDashboards', { max: wd.maxDashboards }));
      if (wd.dashboards.length >= wd.maxDashboards) { tooMany(); return; }
      for (const b of root.querySelectorAll('.wd-dash-copy')) /** @type {HTMLButtonElement} */ (b).disabled = true;
      wd.saving = wd.saving.then(async () => {
        try {
          const res = await request('POST', `/web/dashboards/${encodeURIComponent(id)}/copy`, {});
          if (res && Array.isArray(res.dashboards)) wd.dashboards = res.dashboards;
          if (location.hash !== '#/edit' || !res || !res.dashboard) return;
          renderList(true);
          const card = /** @type {HTMLElement} */ (root.querySelector(`.wd-dash[data-id="${res.dashboard.id}"]`));
          if (!card) return;
          card.classList.add('fresh');
          card.addEventListener('animationend', () => card.classList.remove('fresh'), { once: true });
          card.focus({ preventScroll: true });
          card.scrollIntoView({ block: 'nearest' });
        } catch (err) {
          if (/At most/.test(String(err && err.message))) tooMany(); else failed(err);
          if (location.hash === '#/edit') renderList(true);
        }
      });
    }

    /**
     * The front page's edit mode: a card is dragged (pointer events, so by touch too; the page holds the capture, as
     * the card itself moves), within its section or into another (`page`'s grids), and the others make room at once;
     * arrow keys move a focused one, on into the next or previous section at either end. Escape puts them back.
     */
    function arrangeCards(page) {
      const grids = () => /** @type {HTMLElement[]} */ ([...page.querySelectorAll('.wd-dashboards')]);
      const cards = () => /** @type {HTMLElement[]} */ ([...page.querySelectorAll('.wd-dashboards > .wd-dash[data-id]')]);
      // Where every card is, first to last: its id and section.
      const arrangement = () => cards().map(c => ({ id: c.dataset.id, section: /** @type {HTMLElement} */ (c.parentElement).dataset.section }));
      const save = () => {
        const now = arrangement();
        const placement = Object.fromEntries(now.map(x => [x.id, x.section || null]));
        // The page's own copy at once, so a redraw before the app answers (a section added) keeps it.
        const byId = new Map(wd.dashboards.map(d => [d.id, d]));
        wd.dashboards = [
          ...now.filter(x => byId.has(x.id)).map(x => withSection(byId.get(x.id), x.section)),
          ...wd.dashboards.filter(d => !(d.id in placement)),
        ];
        saveFront({ order: now.map(x => x.id), placement });
      };
      let move = null; // {card, pointerId, x0, y0, active, before: the arrangement when it started}
      const finish = (keep) => {
        if (!move) return;
        const { card, active, before } = move;
        move = null;
        if (!active) return;
        card.classList.remove('lifted');
        root.classList.remove('dragging');
        if (!keep) {
          for (const x of before) grids().find(g => g.dataset.section === x.section).append(cards().find(c => c.dataset.id === x.id));
        } else if (JSON.stringify(arrangement()) !== JSON.stringify(before)) {
          save();
        }
      };
      const under = (node, e) => {
        const r = node.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      };
      page.addEventListener('pointerdown', (e) => {
        const card = /** @type {Element} */ (e.target).closest('.wd-dashboards > .wd-dash[data-id]');
        // A card's own buttons (the pen, Duplicate) are pressed, not dragged: the page's capture would take their click.
        // The card's own link has no href here.
        if (move || !card || e.button !== 0 || /** @type {Element} */ (e.target).closest('button, a[href]')) return;
        move = { card, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, before: arrangement() };
        try { page.setPointerCapture(e.pointerId); } catch (err) { /* moves still come while over the page */ }
        e.preventDefault();
      });
      page.addEventListener('pointermove', (e) => {
        if (!move || e.pointerId !== move.pointerId) return;
        if (!move.active) {
          if (Math.hypot(e.clientX - move.x0, e.clientY - move.y0) < DRAG_SLOP) return;
          move.active = true;
          move.card.classList.add('lifted');
          root.classList.add('dragging');
        }
        const h = window.innerHeight;
        if (e.clientY < EDGE_PX) window.scrollBy(0, -16);
        else if (e.clientY > h - EDGE_PX) window.scrollBy(0, 16);
        const all = cards();
        const over = all.find(c => c !== move.card && under(c, e));
        if (over) {
          const after = all.indexOf(over) > all.indexOf(move.card);
          over.parentElement.insertBefore(move.card, after ? over.nextSibling : over);
          return;
        }
        // Over another section with no card under the pointer (an empty one, or past its last card): at its end.
        const grid = grids().find(g => g !== move.card.parentElement && under(g, e));
        if (grid) grid.append(move.card);
      });
      page.addEventListener('pointerup', (e) => { if (move && e.pointerId === move.pointerId) finish(true); });
      page.addEventListener('pointercancel', () => finish(false));
      page.addEventListener('lostpointercapture', () => finish(true));
      page.addEventListener('keydown', (e) => {
        const card = /** @type {HTMLElement} */ (e.target);
        const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
        if (!step || !card.matches('.wd-dashboards > .wd-dash[data-id]')) return;
        e.preventDefault();
        const grid = /** @type {HTMLElement} */ (card.parentElement);
        const mine = [...grid.querySelectorAll(':scope > .wd-dash[data-id]')];
        const other = mine[mine.indexOf(card) + step];
        if (other) {
          grid.insertBefore(card, step > 0 ? other.nextSibling : other);
        } else {
          // Past either end: the next section's start, or the previous one's end.
          const next = grids()[grids().indexOf(grid) + step];
          if (!next) return;
          if (step > 0) next.insertBefore(card, next.querySelector(':scope > .wd-dash[data-id]'));
          else next.append(card);
        }
        card.focus();
        card.scrollIntoView({ block: 'nearest' });
        save();
      });
      window.addEventListener('keydown', function escape(e) {
        if (!page.isConnected) { window.removeEventListener('keydown', escape); return; }
        if (e.key === 'Escape' && move) finish(false);
      });
    }

    /**
     * A dashboard's card: a miniature of its columns (each widget as its preview), its name and widget count; it opens
     * the dashboard. While the front page is edited it opens nothing: it's dragged (a grip), and it has a pen (the
     * dashboard's editor), Duplicate and Delete (a second tap).
     */
    function dashboardCard(d, editing = false) {
      const card = el('div', 'wd-dash');
      card.dataset.id = d.id;
      // The miniature in the mode the dashboard shows in (a Dark one on a light page too), the page's for Automatic.
      const dark = wd.showsDark(d.theme);
      const art = el('div', `wd-dash-art ${dark ? 'dark' : 'light'}`);
      if (d.background && d.background !== 'default') art.style.setProperty('--wd-bg', wd.backdrop(d.background, dark));
      // A grid of the columns, a row per widget: the first three rows, a wide widget across the columns it covers
      // (placed as on the dashboard, every widget one row high), an empty column dashed.
      const columns = LAYOUT.expand(d.columns.length ? d.columns : [[]]);
      art.style.setProperty('--cols', String(columns.length));
      LAYOUT.place(columns, () => 1, 0).forEach((placed, c) => {
        if (!columns[c].length) art.append(thumbAt(el('span', 'wd-dash-thumb empty'), c, 0, 1));
        for (const { entry, top, hidden } of placed) {
          if (hidden || entry.cover || top >= 3) continue;
          const span = LAYOUT.spanOf(entry, c, columns.length);
          art.append(thumbAt(wd.preview(entry.type, `wd-dash-thumb${span > 1 ? ' wide' : ''}`, dark), c, top, span));
        }
      });
      const link = el('a', 'wd-dash-link');
      if (!editing) link.href = `#/d/${d.id}`;
      const count = d.columns.reduce((n, c) => n + c.length, 0);
      const info = el('span', 'wd-dash-info');
      info.append(el('span', 'wd-dash-name', d.name || t('untitled')), el('span', 'wd-muted wd-dash-count', t('widgetCount', { count })));
      link.append(info);
      if (editing) {
        card.tabIndex = 0;
        card.setAttribute('aria-roledescription', t('drag'));
        card.setAttribute('aria-label', d.name || t('untitled'));
        const grip = el('span', 'wd-icon wd-dash-grip');
        grip.append(icon('grip'));
        const edit = el('a', 'wd-icon wd-dash-edit');
        edit.href = `#/d/${d.id}/edit`;
        edit.title = t('edit');
        edit.setAttribute('aria-label', t('edit'));
        edit.append(icon('pen'));
        const copy = button('wd-icon wd-dash-copy', '', () => duplicate(d.id), t('duplicate'));
        copy.append(icon('copy'));
        copy.disabled = wd.dashboards.length >= wd.maxDashboards;
        const remove = confirmButton('wd-icon wd-dash-delete', icon('trash'), () => deleteDashboard(d.id, () => {
          if (location.hash === '#/edit') renderList(true);
        }), t('tapAgain'), t('deleteDashboard'));
        card.append(art, link, remove, copy, edit, grip);
        return card;
      }
      card.append(art, link);
      return card;

      function thumbAt(node, c, top, span) {
        node.style.gridArea = `${top + 1} / ${c + 1} / auto / span ${span}`;
        return node;
      }
    }

    /**
     * The widgets as a carousel: a native scroll-snap track (swipes and trackpads scroll it), arrows and dots, and it
     * moves on by itself every 5 s, except while the pointer or focus is on it, for 15 s after a touch, while the page
     * is hidden, and not at all with reduced motion.
     */
    function widgetCarousel(editing = false) {
      // One widget at a time in a small card under the dashboards (a user found a row of large previews took the
      // attention away from them): its preview, name and description, ‹ › and a count. It moves on every 6 s, but not
      // while the mouse or focus is on it, for 15 s after a tap, while the page is hidden, or with reduced motion.
      const section = el('section', 'wd-carousel');
      section.setAttribute('aria-label', t('widgetsTitle'));
      const head = el('div', 'wd-carousel-head');
      head.append(el('h2', 'wd-carousel-title', t('widgetsTitle')), el('span', 'wd-muted wd-carousel-text', t('widgetsText')));
      if (editing) {
        const label = el('label', 'wd-carousel-show');
        const box = el('input', 'wd-switch');
        box.type = 'checkbox';
        box.setAttribute('role', 'switch');
        box.checked = wd.frontPage.widgets;
        section.classList.toggle('off', !box.checked);
        box.addEventListener('change', () => {
          section.classList.toggle('off', !box.checked);
          saveFront({ widgets: box.checked });
        });
        label.append(el('span', null, t('showWidgets')), box);
        head.append(label);
      }
      const sorted = [...wd.types.values()].sort((a, b) => a.name.localeCompare(b.name));

      const card = el('article', 'wd-spot');
      const art = el('div', 'wd-spot-art');
      const text = el('div', 'wd-spot-text');
      const name = el('h3', 'wd-spot-name');
      const desc = el('p', 'wd-muted wd-spot-about');
      text.append(name, desc);
      const nav = el('div', 'wd-spot-nav');
      const prev = button('wd-icon wd-nav', '', () => { hold(); show(i - 1); }, t('previous'));
      prev.append(icon('left'));
      const next = button('wd-icon wd-nav', '', () => { hold(); show(i + 1); }, t('next'));
      next.append(icon('right'));
      const count = el('span', 'wd-spot-count');
      nav.append(prev, count, next);
      card.append(art, text, nav);
      section.append(head, card);

      let i = 0;
      function show(n) {
        i = (n + sorted.length) % sorted.length;
        const def = sorted[i];
        card.classList.add('swap');
        // The new content fades in (CSS); the image is swapped once loaded, so it doesn't blink.
        requestAnimationFrame(() => {
          art.textContent = '';
          art.append(wd.preview(def.type, 'wd-spot-img'));
          name.textContent = def.name;
          desc.textContent = wd.about(def.type);
          count.textContent = `${i + 1} / ${sorted.length}`;
          requestAnimationFrame(() => card.classList.remove('swap'));
        });
      }
      show(0);

      let heldUntil = 0;
      let hovered = false;
      let focused = false;
      function hold() { heldUntil = Date.now() + 15e3; }
      section.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovered = true; });
      section.addEventListener('pointerleave', () => { hovered = false; });
      section.addEventListener('focusin', () => { focused = true; });
      section.addEventListener('focusout', () => { focused = false; });
      card.addEventListener('pointerdown', hold);
      const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const timer = setInterval(() => {
        if (!section.isConnected) { clearInterval(timer); return; }
        if (still || hovered || focused || document.hidden || Date.now() < heldUntil) return;
        show(i + 1);
      }, 6000);
      return section;
    }

    Object.assign(wd, { deleteDashboard, renderList });
  });
})();
