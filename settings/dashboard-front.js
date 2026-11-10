/*
 * The web dashboards page — the front page: the dashboards' cards and sections, their editing, the page's Settings
 * dialog and the backup. A part of the page (settings/dashboard.js): mountWebDashboards() runs it once with `wd`,
 * the page's shared state and functions. The core's functions and constants are taken from `wd` at the top; the
 * state that changes, and the other parts' functions, are read as `wd.<name>`. Plain browser JS (served as-is).
 */
(function () {
  'use strict';

  window.WidgetkeeperWeb.part('front', (wd) => {
    const { applyDim, AWAKE_STORAGE, button, confirmButton, deleted, DIM_CHANGED_STORAGE, DIM_SCHEDULE_STORAGE, DIM_STORAGE, dimLevel, dimScheduleOf, DRAG_SLOP, EDGE_PX, el,
      failed, icon, keepAwake, LAYOUT, loadSetup, MAX_DIM, newId, request, root, route,
      storageGet, storageSet, t, THEME_STORAGE, toast } = wd;

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
        done.addEventListener('click', (e) => { e.preventDefault(); wd.leaveEditor('#/'); });
        // Settings is in the side pane; where there's none (kiosk mode), here.
        root.append(frontBar(wd.brand(), el('span', 'wd-spacer'), ...(wd.navBlocked() ? [settings] : []), done), page);
        wd.showNav({ inactive: true });
        return;
      }
      if (wd.types.size && wd.frontPage.widgets) page.append(widgetCarousel());

      const edit = el('a', 'wd-icon');
      edit.href = '#/edit';
      edit.title = t('edit');
      edit.setAttribute('aria-label', t('edit'));
      edit.append(icon('pen'));
      root.append(frontBar(wd.navButton(), wd.brand(), el('span', 'wd-spacer'), wd.liveNote(), edit), page);
      wd.showNav();
    }

    /** The front page's bar: one row on a phone too, the long title giving way (dashboard.css). */
    function frontBar(...children) {
      const node = wd.bar(...children);
      node.classList.add('wd-bar-front');
      return node;
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

    /**
     * Settings (the side pane's foot, or the front page's bar where there's no pane): a dialog of vertical tabs, the
     * Homey's settings (Header, Sync, Backup) then this browser's (Screen, Kiosk, Sign-in). `open`: a tab's id to start on.
     */
    function pageSettings(open) {
      const { d, body } = wd.dialog(t('pageSettings'));
      d.classList.add('wd-page-settings');
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
      };
      slider.addEventListener('input', () => { show(); applyDim(Number(slider.value)); });
      slider.addEventListener('change', () => {
        show();
        storageSet(DIM_STORAGE, Number(slider.value) ? slider.value : null);
        dimChanged();
      });
      show();
      const dim = setRow(t('dim'), t('dimText'), amount, slider.id);
      dim.classList.add('wd-dim-row');
      dim.append(slider);
      const flowNote = el('p', 'wd-hint wd-dim-flow');
      flowNote.setAttribute('role', 'status');
      const showFlowNote = () => {
        const level = wd.dimFlowLevel();
        flowNote.hidden = level === null;
        flowNote.textContent = level === null ? '' : t('dimFlowNow', { level });
      };
      /** A slider moved by hand: it takes over from a Flow, and the set times say which slider holds now. */
      function dimChanged() {
        storageSet(DIM_CHANGED_STORAGE, String(Date.now()));
        wd.syncDim();
        showFlowNote();
      }
      showFlowNote();
      dim.append(flowNote);
      const scheduled = dimTimes(setRow, dimChanged);
      const rotation = rotateRows(setRow);
      const goBack = goBackRows(setRow);
      // Dark or light: this browser's own mode for every dashboard, or each one's theme (Automatic). The front page
      // behind redraws in it (the dialog is on body, so it stays).
      const modes = [['auto', 'themeAuto'], ['dark', 'themeDark'], ['light', 'themeLight']].map(([id, key]) => ({ id, title: t(key) }));
      const mode = wd.choiceGroup(null, modes, wd.ownTheme() || 'auto', (id) => {
        storageSet(THEME_STORAGE, id === 'auto' ? null : id);
        route();
      }, false);
      mode.setAttribute('aria-label', t('darkLight'));
      // This browser's settings, in three tabs, each saying they're this browser's only.
      const browserSection = (title, ...rows) => {
        const section = el('section', 'wd-page-section');
        const card = el('div', 'wd-set-card');
        card.append(...rows);
        section.append(el('h3', 'wd-h2', title), el('p', 'wd-hint wd-browser-only', t('browserOnly')), card);
        return section;
      };
      const kiosk = el('p', 'wd-hint wd-kiosk-help', t('kioskHelp'));
      const tabs = [
        { group: t('allBrowsers') },
        { id: 'header', label: t('brandTitle'), panel: wd.brandSection(setRow) },
        { id: 'sync', label: t('tabSync'), panel: wd.syncSettingsSection(() => hideTab('sync')) },
        { id: 'backup', label: t('backupTitle'), panel: backupSection() },
        { group: t('thisBrowser') },
        { id: 'screen', label: t('tabScreen'), panel: browserSection(t('tabScreen'), setRow(t('darkLight'), t('darkLightText'), mode), awake, dim, scheduled) },
        { id: 'kiosk', label: t('tabKiosk'), panel: browserSection(t('tabKiosk'), rotation, goBack, kiosk) },
        { id: 'signin', label: t('tabSignIn'), panel: browserSection(t('tabSignIn'), setRow(t('signedIn'), t('forgetKeyText'), forget)) },
      ];
      const { box: tabBox, select, hideTab } = settingsTabs(tabs);
      body.classList.add('wd-tabbed');
      body.append(tabBox);
      select(open && tabs.some(tab => tab.id === open) ? open : wd.settingsTab || 'header');
      d.showModal();
    }

    /**
     * The Settings dialog's vertical tabs: a list on the left, under the group headings (the Homey's settings, then this
     * browser's), and one panel at a time beside it. The tab last open comes back (`wd.settingsTab`, for this page's life).
     * Arrow keys, Home and End move along the tabs, as a tab list's should.
     */
    function settingsTabs(tabs) {
      const box = el('div', 'wd-tabs-box');
      const list = el('div', 'wd-tabs');
      list.setAttribute('role', 'tablist');
      list.setAttribute('aria-orientation', 'vertical');
      const panels = el('div', 'wd-tab-panels');
      const shown = [];
      for (const tab of tabs) {
        if (tab.group) {
          list.append(el('p', 'wd-tabs-group', tab.group));
          continue;
        }
        const b = button('wd-tab', tab.label, () => select(tab.id));
        b.id = `wd-tab-${tab.id}`;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-controls', `wd-tabpanel-${tab.id}`);
        tab.panel.id = `wd-tabpanel-${tab.id}`;
        tab.panel.setAttribute('role', 'tabpanel');
        tab.panel.setAttribute('aria-labelledby', b.id);
        tab.button = b;
        shown.push(tab);
        list.append(b);
        panels.append(tab.panel);
      }
      const usable = () => shown.filter(tab => !tab.button.hidden);
      function select(id, focus) {
        const tab = usable().find(x => x.id === id) || usable()[0];
        wd.settingsTab = tab.id;
        for (const x of shown) {
          const on = x === tab;
          x.button.classList.toggle('on', on);
          x.button.setAttribute('aria-selected', String(on));
          x.button.tabIndex = on ? 0 : -1;
          x.panel.hidden = !on;
        }
        panels.scrollTop = 0;
        if (focus) tab.button.focus();
        // On a phone the tabs are a row that scrolls: keep the chosen one in view.
        if (tab.button.scrollIntoView && list.scrollWidth > list.clientWidth) tab.button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      /** A tab whose settings can't be read (the sync's): gone, and if it was open, the first one instead. */
      function hideTab(id) {
        const tab = shown.find(x => x.id === id);
        if (!tab) return;
        tab.button.hidden = true;
        if (tab.button.classList.contains('on')) {
          const keep = wd.settingsTab;
          select(usable()[0].id);
          wd.settingsTab = keep; // it comes back once it can be read again
        }
      }
      list.addEventListener('keydown', (e) => {
        const tabsNow = usable();
        const at = tabsNow.findIndex(x => x.button === document.activeElement);
        if (at < 0) return;
        const to = { ArrowDown: at + 1, ArrowRight: at + 1, ArrowUp: at - 1, ArrowLeft: at - 1, Home: 0, End: tabsNow.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        select(tabsNow[(to + tabsNow.length) % tabsNow.length].id, true);
      });
      box.append(list, panels);
      return { box, select, hideTab };
    }

    /** A switch's row with rows under it that show only while it's on. */
    function switchedRows(setRow, label, hint, id, on, changed) {
      const box = el('input', 'wd-switch');
      box.type = 'checkbox';
      box.id = id;
      box.setAttribute('role', 'switch');
      box.checked = on;
      const row = setRow(label, hint, box, id);
      row.classList.add('switch');
      const sub = el('div', 'wd-set-sub');
      sub.hidden = !on;
      box.addEventListener('change', () => {
        sub.hidden = !box.checked;
        changed(box.checked);
      });
      const part = el('div', 'wd-switched');
      part.append(row, sub);
      return { part, sub };
    }

    /** Dim at set times: when, and how much (a second slider, stored like the first when it's let go). */
    function dimTimes(setRow, dimChanged) {
      let stored = {};
      try { stored = JSON.parse(storageGet(DIM_SCHEDULE_STORAGE) || '{}') || {}; } catch (e) { /* none */ }
      const on = !!dimScheduleOf(stored);
      const value = { from: on ? stored.from : '22:00', to: on ? stored.to : '07:00', level: on ? Number(stored.level) : 50 };
      const save = (active) => {
        storageSet(DIM_SCHEDULE_STORAGE, active && dimScheduleOf(value) ? JSON.stringify(value) : null);
        dimChanged();
      };
      const { part, sub } = switchedRows(setRow, t('dimSchedule'), t('dimScheduleText'), 'wd-dim-schedule', on, save);
      const time = (id, label, key) => {
        const input = el('input', 'wd-input wd-time');
        input.type = 'time';
        input.id = id;
        input.value = value[key];
        input.addEventListener('change', () => {
          if (!input.value) { input.value = value[key]; return; } // emptied: the last one stays
          value[key] = input.value;
          save(true);
        });
        return setRow(label, '', input, id);
      };
      const slider = el('input', 'wd-dim-slider');
      slider.id = 'wd-dim-then';
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(MAX_DIM);
      slider.step = '5';
      slider.value = String(value.level);
      const amount = el('span', 'wd-dim-value');
      const show = () => { amount.textContent = Number(slider.value) ? `${slider.value} %` : t('dimOff'); };
      slider.addEventListener('input', () => { show(); applyDim(Number(slider.value)); });
      slider.addEventListener('change', () => {
        show();
        value.level = Number(slider.value);
        save(true);
      });
      show();
      const level = setRow(t('dimThen'), '', amount, slider.id);
      level.classList.add('wd-dim-row');
      level.append(slider);
      sub.append(time('wd-dim-from', t('dimFrom'), 'from'), time('wd-dim-to', t('dimTo'), 'to'), level);
      return part;
    }

    /** Rotate dashboards: this browser's list, in the front page's order, and how long each shows. */
    function rotateRows(setRow) {
      const config = wd.rotateConfig();
      const state = { ids: config ? config.ids : [], seconds: config ? config.seconds : wd.ROTATE_DEFAULT_SECONDS };
      const note = el('p', 'wd-backup-note');
      note.setAttribute('role', 'status');
      const save = (on) => {
        const ticked = wd.dashboards.filter(d => state.ids.includes(d.id));
        wd.saveRotate(on ? { ids: ticked.map(d => d.id), seconds: state.seconds } : null);
        note.textContent = on && ticked.length < 2 ? t('rotateNeedTwo') : '';
      };
      const { part, sub } = switchedRows(setRow, t('rotate'), t('rotateText'), 'wd-rotate', !!config, save);
      const seconds = el('input', 'wd-input wd-rotate-seconds');
      seconds.id = 'wd-rotate-seconds';
      seconds.type = 'number';
      seconds.min = String(wd.ROTATE_MIN_SECONDS);
      seconds.max = String(wd.ROTATE_MAX_SECONDS);
      seconds.value = String(state.seconds);
      seconds.addEventListener('change', () => {
        const typed = Math.round(Number(seconds.value));
        state.seconds = Math.min(wd.ROTATE_MAX_SECONDS, Math.max(wd.ROTATE_MIN_SECONDS, Number.isFinite(typed) ? typed : wd.ROTATE_DEFAULT_SECONDS));
        seconds.value = String(state.seconds);
        save(true);
      });
      const list = el('div', 'wd-backup-list wd-rotate-list');
      for (const dash of wd.navInOrder()) {
        const label = el('label', 'wd-backup-item');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = state.ids.includes(dash.id);
        input.addEventListener('change', () => {
          state.ids = input.checked ? [...state.ids, dash.id] : state.ids.filter(id => id !== dash.id);
          save(true);
        });
        const name = el('span', 'wd-backup-item-name', dash.name || t('untitled'));
        name.dir = 'auto';
        label.append(input, name);
        if ((wd.nav.prefs.hidden).includes(dash.id)) label.append(el('span', 'wd-backup-tag', t('navHiddenHere')));
        list.append(label);
      }
      sub.append(setRow(t('rotateEvery'), t('rotateEveryText'), seconds, seconds.id), list, note);
      if (config) save(true); // says so when a ticked dashboard has been deleted since
      return part;
    }

    /** Go back after a while: where to (the front page or a dashboard, in the side pane's order) and after how long. */
    function goBackRows(setRow) {
      const config = wd.goBackConfig();
      const state = { to: config ? config.to : 'front', minutes: config ? config.minutes : wd.GO_BACK_DEFAULT_MINUTES };
      const note = el('p', 'wd-backup-note');
      note.setAttribute('role', 'status');
      const save = (on) => {
        wd.saveGoBack(on ? { to: state.to, minutes: state.minutes } : null);
        note.textContent = on && wd.rotateConfig() ? t('goBackRotating') : '';
      };
      const { part, sub } = switchedRows(setRow, t('goBack'), t('goBackText'), 'wd-go-back', !!config, save);
      const to = el('select', 'wd-input wd-go-back-to');
      to.id = 'wd-go-back-to';
      const option = (value, text) => {
        const o = el('option', '', text);
        o.value = value;
        o.dir = 'auto';
        to.append(o);
      };
      option('front', t('navAll'));
      for (const dash of wd.navInOrder()) option(dash.id, dash.name || t('untitled'));
      // A deleted dashboard reads as the front page, where it goes back to then.
      to.value = wd.dashboards.some(d => d.id === state.to) ? state.to : 'front';
      to.addEventListener('change', () => { state.to = to.value; save(true); });
      const minutes = el('input', 'wd-input wd-go-back-minutes');
      minutes.id = 'wd-go-back-minutes';
      minutes.type = 'number';
      minutes.min = String(wd.GO_BACK_MIN_MINUTES);
      minutes.max = String(wd.GO_BACK_MAX_MINUTES);
      minutes.value = String(state.minutes);
      minutes.addEventListener('change', () => {
        const typed = Math.round(Number(minutes.value));
        state.minutes = Math.min(wd.GO_BACK_MAX_MINUTES, Math.max(wd.GO_BACK_MIN_MINUTES, Number.isFinite(typed) ? typed : wd.GO_BACK_DEFAULT_MINUTES));
        minutes.value = String(state.minutes);
        save(true);
      });
      sub.append(setRow(t('goBackTo'), '', to, to.id), setRow(t('goBackAfter'), t('goBackAfterText'), minutes, minutes.id), note);
      if (config) save(true);
      return part;
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
                route(); // the view behind the dialog, with what was restored
                show(null);
                // Restored either way: an answer without the counts mustn't turn that into a failure.
                status.textContent = t('backupRestored', { dashboards: (res && res.dashboards) || 0, widgets: (res && res.widgets) || 0 });
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

    const DELETE_UNDO_MS = 8e3;

    /**
     * Deletes a dashboard: gone from this page at once, and `done()`, with an Undo; the app only deletes it when that
     * runs out, so Undo needs nothing back (tile names, its place, its sync link). One at a time: a second delete, or
     * leaving the page, sends this one now.
     */
    function deleteDashboard(id, done) {
      commitDelete();
      const index = wd.dashboards.findIndex(x => x.id === id);
      if (index < 0) { done(); return; }
      const pending = { id, dashboard: wd.dashboards[index], index, timer: null, toast: null };
      wd.pendingDelete = pending;
      wd.dashboards = wd.dashboards.filter(x => x.id !== id);
      pending.timer = setTimeout(commitDelete, DELETE_UNDO_MS);
      done();
      pending.toast = toast(t('dashboardDeleted'), {
        label: t('undo'),
        ms: DELETE_UNDO_MS,
        run() {
          clearTimeout(pending.timer);
          pending.toast.remove();
          wd.pendingDelete = null;
          putBack(pending);
        },
      });
    }

    /** A dashboard whose delete was undone or failed, in its old place; the front page shows it again. */
    function putBack({ id, dashboard, index }) {
      if (!wd.dashboards.some(x => x.id === id)) wd.dashboards.splice(Math.min(index, wd.dashboards.length), 0, dashboard);
      if (!wd.current) route();
      else if (wd.redrawNav) wd.redrawNav();
    }

    /** The app deletes the waiting dashboard, after the saves already queued, and no save of it after that. */
    function commitDelete(keepalive = false) {
      const pending = wd.pendingDelete;
      if (!pending) return;
      wd.pendingDelete = null;
      clearTimeout(pending.timer);
      if (pending.toast) pending.toast.remove();
      deleted.add(pending.id);
      wd.saving = wd.saving.then(async () => {
        try {
          await request('DELETE', `/web/dashboards/${encodeURIComponent(pending.id)}`, undefined, keepalive);
          wd.dashboards = wd.dashboards.filter(x => x.id !== pending.id);
        } catch (err) {
          deleted.delete(pending.id);
          putBack(pending);
          failed(err);
        }
      });
    }

    window.addEventListener('pagehide', () => commitDelete(true));

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
          if (res && res.dashboard && wd.navCopied) wd.navCopied(id, res.dashboard.id);
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
        if (wd.redrawNav) wd.redrawNav();
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
      const countLine = el('span', 'wd-muted wd-dash-count', t('widgetCount', { count }));
      const synced = wd.syncIcon(d.id, 'wd-sync wd-dash-sync'); // synced with a Homey dashboard
      if (synced) { countLine.prepend(synced); countLine.classList.add('synced'); }
      const cardName = el('span', 'wd-dash-name', d.name || t('untitled'));
      const cardIcon = wd.iconNode(d.icon);
      if (cardIcon) cardName.prepend(cardIcon);
      info.append(cardName, countLine);
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

    Object.assign(wd, { deleteDashboard, pageSettings, renderList, saveFront });
  });
})();
