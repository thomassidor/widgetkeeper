/*
 * The web dashboards page: the side pane, the list of dashboards at the left of a dashboard and of the front page. It's
 * closed, floats over the widgets or is kept open beside them (`wd-nav-pinned` on html: the page's left margin). It sits
 * next to `root`, not in it: a redraw leaves it alone and no widget's frame ever has to move, which would reload it.
 * In the editors a kept-open pane stays but can't be used, so a dashboard is laid out at the width it will be seen at.
 * What a browser shows in it is that browser's own (`widgetkeeper.web.nav`): the app stores nothing.
 */
(function () {
  'use strict';

  const NAV_STORAGE = 'widgetkeeper.web.nav';
  /** Kept open from this window width: 260 px less still leaves over 720 px, where the grid goes to one column. */
  const PIN_MIN_WIDTH = 1000;
  const EDGE_PX = 32;

  window.WidgetkeeperWeb.part('nav', (wd) => {
    const { button, el, hardToRead, icon, root, STAY_STORAGE, storageGet, storageSet, t } = wd;
    /** At most this much of a dashboard's backdrop goes into the pane's fill, less where the text would be hard to read. */
    const TINT = 0.6;

    /** The stored choices, whatever is stored: a list only of strings, and pinned only if it's true. */
    function readPrefs(raw) {
      let p = null;
      try { p = JSON.parse(raw); } catch (e) { /* none yet, or damaged: the defaults */ }
      const list = (v) => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
      return { pinned: !!p && p.pinned === true, footFolded: !!p && p.footFolded === true, tint: !!p && p.tint === true, allHidden: !!p && p.allHidden === true, hidden: list(p && p.hidden), folded: list(p && p.folded), order: list(p && p.order), sectionOrder: list(p && p.sectionOrder) };
    }

    /** `ids` in the stored order: those it names first (ids that are gone ignored), the others after them as they came. */
    function ordered(ids, order) {
      const known = new Set(ids);
      const first = [...new Set(order)].filter(id => known.has(id));
      return [...first, ...ids.filter(id => !first.includes(id))];
    }

    /** Puts `item` where `target` is in `list`: before it going up, after it going down. */
    function reorder(list, item, target) {
      const to = list.indexOf(target);
      list.splice(list.indexOf(item), 1);
      list.splice(to, 0, item);
    }

    const nav = { prefs: readPrefs(storageGet(NAV_STORAGE)), shown: false, inactive: false, open: false, customizing: false, reveal: null, drag: null, pane: null, scrim: null, head: null, list: null, foot: null, backdrop: null };
    wd.nav = nav;

    const sectionsNow = () => (wd.frontPage && wd.frontPage.sections) || [];
    const dashboardIds = () => wd.dashboards.map(d => d.id);
    const sectionIds = () => sectionsNow().map(s => s.id);
    const isHidden = (id) => nav.prefs.hidden.includes(id);
    const isCurrent = (id) => !!wd.current && wd.current.dashboard.id === id;

    /**
     * What the pane lists, in this browser's order: the dashboards in no section first (no heading), then each section,
     * one without a row to show left out. `all`: the section's dashboards, hidden ones too; `rows`: those to draw.
     */
    function navGroups(customizing) {
      const sections = sectionsNow();
      const known = sectionIds();
      const sectionOf = (d) => (known.includes(d.section) ? d.section : '');
      const byId = new Map(wd.dashboards.map(d => [d.id, d]));
      const inOrder = ordered(dashboardIds(), nav.prefs.order).map(id => byId.get(id));
      const groups = [];
      for (const id of ['', ...ordered(known, nav.prefs.sectionOrder)]) {
        const all = inOrder.filter(d => sectionOf(d) === id);
        const rows = customizing ? all : all.filter(d => !isHidden(d.id) || isCurrent(d.id)); // a hidden one while it's showing
        if (!rows.length) continue;
        const section = sections.find(s => s.id === id);
        groups.push({ id, name: section ? section.name || t('untitled') : '', all, rows, folded: !customizing && !!id && nav.prefs.folded.includes(id) && id !== nav.reveal });
      }
      return groups;
    }

    /** Stores the choices, without ids that are gone; an order the same as the front page's is no order of its own. */
    function save() {
      const ids = dashboardIds();
      const sections = sectionIds();
      const p = nav.prefs;
      // A dashboard whose delete can still be undone isn't gone yet.
      const undoable = wd.pendingDelete && wd.pendingDelete.id;
      const stays = (id) => ids.includes(id) || id === undoable;
      p.hidden = p.hidden.filter(stays);
      p.folded = p.folded.filter(id => sections.includes(id));
      p.order = p.order.filter(stays);
      p.sectionOrder = p.sectionOrder.filter(id => sections.includes(id));
      if (!p.order.includes(undoable) && ordered(ids, p.order).join('\n') === ids.join('\n')) p.order = [];
      if (ordered(sections, p.sectionOrder).join('\n') === sections.join('\n')) p.sectionOrder = [];
      storageSet(NAV_STORAGE, JSON.stringify(p));
    }

    /** Full screen is for the widgets, so the pane only floats there; the preference comes back with it. */
    const canPin = () => window.innerWidth >= PIN_MIN_WIDTH && !document.documentElement.classList.contains('wd-full');
    /** Kiosk mode has no pane, unless its address asks for it (`?kiosk=1&nav=1`). */
    function blocked() {
      const c = document.documentElement.classList;
      return c.contains('wd-kiosk') && !c.contains('wd-kiosk-nav');
    }
    const allowed = () => nav.shown && !blocked();
    const isPinned = () => allowed() && nav.prefs.pinned && canPin();
    const isFloating = () => allowed() && !nav.inactive && !isPinned() && nav.open;

    /**
     * The pane's fill with Tint on: the tile's colour with some of the dashboard's backdrop in it (none for Default, nor on
     * the front page: the pane as it is). A colour of the user's own may be a bright one in dark mode, so the share goes
     * down until the text reads.
     */
    function tintColour() {
      const b = nav.backdrop;
      if (!nav.prefs.tint || !b) return null;
      const channels = (hex) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
      const tile = channels(b.dark ? '#181920' : '#FFFFFF');
      const back = channels(b.colour);
      for (let share = TINT; share > 0; share -= 0.1) {
        const hex = `#${tile.map((c, i) => Math.round(c * (1 - share) + back[i] * share).toString(16).padStart(2, '0')).join('')}`;
        if (!hardToRead(hex, b.dark)) return hex;
      }
      return null;
    }

    /** The dashboard's backdrop, from `applyTheme()`: null for Default, which leaves the pane as it is. */
    function tintNav(colour, dark) {
      nav.backdrop = colour ? { colour, dark } : null;
      paint();
    }

    function paint() {
      const fill = tintColour();
      document.documentElement.classList.toggle('wd-nav-tinted', !!fill);
      if (fill) document.documentElement.style.setProperty('--wd-nav-bg', fill);
      else document.documentElement.style.removeProperty('--wd-nav-bg');
    }

    /** Puts the pane in the state the choices, the window and the view ask for. */
    function apply() {
      if (nav.pane) {
        const pinned = isPinned();
        const floating = isFloating();
        document.documentElement.classList.toggle('wd-nav-pinned', pinned);
        nav.pane.hidden = !allowed() || (nav.inactive && !pinned);
        nav.pane.classList.toggle('open', pinned || floating);
        nav.pane.classList.toggle('inactive', nav.inactive);
        nav.pane.inert = nav.inactive || !(pinned || floating);
        nav.scrim.hidden = !allowed() || nav.inactive;
        nav.scrim.classList.toggle('open', floating);
        const pin = nav.foot.querySelector('.wd-nav-pin');
        if (pin) pin.hidden = !canPin() || nav.prefs.footFolded;
      }
      for (const b of root.querySelectorAll('.wd-nav-toggle')) b.setAttribute('aria-expanded', String(isPinned() || isFloating()));
    }

    const focusToggle = () => { const b = /** @type {HTMLElement} */ (root.querySelector('.wd-nav-toggle')); if (b) b.focus({ preventScroll: true }); };
    function focusKey(key) {
      const node = /** @type {HTMLElement} */ ([...nav.list.querySelectorAll('[data-nav-key]')].find(x => /** @type {HTMLElement} */ (x).dataset.navKey === key));
      if (node) node.focus({ preventScroll: true });
    }

    /** The section holding the current dashboard stays open for now, whatever is folded: it's where the highlight is. */
    function revealCurrent() {
      const here = wd.current && wd.dashboards.find(d => d.id === wd.current.dashboard.id);
      const section = here && sectionIds().includes(here.section) ? here.section : null;
      nav.reveal = section && nav.prefs.folded.includes(section) ? section : null;
    }

    /** Scrolls only the list, as far as the current row needs. */
    function scrollToCurrent() {
      const row = nav.list.querySelector('[aria-current]');
      if (!row) return;
      const box = nav.list.getBoundingClientRect();
      const at = row.getBoundingClientRect();
      if (at.top < box.top) nav.list.scrollTop -= box.top - at.top + 8;
      else if (at.bottom > box.bottom) nav.list.scrollTop += at.bottom - box.bottom + 8;
    }

    function closePane() {
      if (nav.drag) nav.drag.finish(false);
      if (isPinned()) { nav.prefs.pinned = false; save(); }
      nav.open = false;
      nav.customizing = false;
      draw();
      apply();
      focusToggle();
    }

    function togglePane() {
      if (isPinned() || isFloating()) { closePane(); return; }
      nav.open = true;
      revealCurrent();
      drawList();
      apply();
      scrollToCurrent();
      const here = /** @type {HTMLElement} */ (nav.pane.querySelector('[aria-current]') || nav.pane.querySelector('a, button'));
      if (here) here.focus({ preventScroll: true });
    }

    function togglePin() {
      const pin = !isPinned();
      nav.prefs.pinned = pin;
      nav.open = !pin; // let go, it stays open and floats until it's closed
      save();
      draw();
      apply();
    }

    /** A dashboard with a code is left only with that code, as `route()` holds a browser to it. */
    function leave(e, hash) {
      const here = wd.current && wd.current.dashboard;
      if (location.hash === hash || (hash === '#/' && !here && !location.hash)) {
        e.preventDefault();
        if (isFloating()) closePane();
        return;
      }
      if (!here || !wd.lockOf(here)) return;
      e.preventDefault();
      wd.askCode(here, () => { storageSet(STAY_STORAGE, null); location.hash = hash; }, 'enterCodeLeave');
    }

    /** Settings, over any view; on a dashboard with a code that takes the code, as the way there through the front page did. */
    function openSettings() {
      const here = wd.current && wd.current.dashboard;
      const open = () => {
        if (isFloating()) { nav.open = false; apply(); }
        wd.pageSettings();
      };
      if (here && wd.lockOf(here)) wd.askCode(here, open);
      else open();
    }

    /** Customize: on a dashboard with a code that takes the code too. */
    function customize() {
      const here = wd.current && wd.current.dashboard;
      const start = () => { nav.customizing = true; draw(); };
      if (here && wd.lockOf(here)) wd.askCode(here, start);
      else start();
    }

    /** A row's icon; once any dashboard has one, the others keep its place, so the names line up. */
    function rowIcon(d) {
      const current = wd.current && wd.current.dashboard.id === d.id ? wd.current.dashboard : d;
      const mark = wd.iconNode(current.icon);
      if (mark) return [mark];
      const any = wd.dashboards.some(x => x.icon) || (wd.current && wd.current.dashboard.icon);
      return any ? [el('span', 'wd-chosen-icon')] : [];
    }

    function plainRow(d) {
      const here = wd.current && wd.current.dashboard.id === d.id;
      const name = (here ? wd.current.dashboard.name : d.name) || t('untitled'); // the editor's copy has a new name at once
      const hash = `#/d/${d.id}`;
      const link = el('a', 'wd-nav-row');
      link.href = hash;
      link.append(...rowIcon(d), el('span', 'wd-nav-name', name));
      if (wd.lockOf(d)) { const lock = el('span', 'wd-nav-lock'); lock.append(icon('lock')); link.append(lock); }
      if (here) link.setAttribute('aria-current', 'page');
      link.addEventListener('click', (e) => leave(e, hash));
      return link;
    }

    function eyeButton(key, name, on, change) {
      const b = button('wd-nav-eye', '', () => { change(); save(); drawList(); drawFoot(); focusKey(key); }, t('navShowHide', { name }));
      b.dataset.navKey = key;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('on', on);
      b.append(icon(on ? 'eye' : 'eyeOff'));
      return b;
    }

    function grip(key, name, startDrag, step) {
      const g = el('span', 'wd-nav-grip');
      g.tabIndex = 0;
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', t('navMove', { name }));
      g.title = t('navMove', { name });
      g.dataset.navKey = key;
      g.append(icon('grip'));
      g.addEventListener('pointerdown', startDrag);
      g.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        step(e.key === 'ArrowUp' ? -1 : 1);
        save();
        drawList();
        focusKey(key);
      });
      return g;
    }

    function customRow(d, group) {
      const name = d.name || t('untitled');
      const off = isHidden(d.id);
      const row = el('div', `wd-nav-row${off ? ' off' : ''}${nav.drag && nav.drag.key === d.id ? ' lifted' : ''}`);
      row.dataset.navRow = d.id;
      row.dataset.navGroup = group.id;
      row.append(
        grip(`grip:${d.id}`, name, (e) => startDrag(e, d.id, false), (by) => {
          nav.prefs.order = ordered(dashboardIds(), nav.prefs.order);
          const next = group.all[group.all.indexOf(d) + by];
          if (next) reorder(nav.prefs.order, d.id, next.id);
        }),
        ...rowIcon(d),
        el('span', 'wd-nav-name', name),
        eyeButton(`eye:${d.id}`, name, !off, () => {
          nav.prefs.hidden = off ? nav.prefs.hidden.filter(id => id !== d.id) : [...nav.prefs.hidden, d.id];
        }),
      );
      return row;
    }

    function customHead(group) {
      const head = el('div', `wd-nav-section${nav.drag && nav.drag.key === `section:${group.id}` ? ' lifted' : ''}`);
      head.dataset.navSection = group.id;
      const anyOn = group.all.some(d => !isHidden(d.id));
      head.append(
        grip(`grip-section:${group.id}`, group.name, (e) => startDrag(e, group.id, true), (by) => {
          const shown = navGroups(true).map(g => g.id).filter(Boolean);
          nav.prefs.sectionOrder = ordered(sectionIds(), nav.prefs.sectionOrder);
          const next = shown[shown.indexOf(group.id) + by];
          if (next) reorder(nav.prefs.sectionOrder, group.id, next);
        }),
        el('span', 'wd-nav-name', group.name),
        eyeButton(`eye-section:${group.id}`, group.name, anyOn, () => {
          const ids = group.all.map(d => d.id);
          nav.prefs.hidden = anyOn ? [...new Set([...nav.prefs.hidden, ...ids])] : nav.prefs.hidden.filter(id => !ids.includes(id));
        }),
      );
      return head;
    }

    function plainHead(group) {
      const key = `fold:${group.id}`;
      const head = button('wd-nav-section wd-nav-fold', '', () => {
        nav.prefs.folded = group.folded ? nav.prefs.folded.filter(id => id !== group.id) : [...new Set([...nav.prefs.folded, group.id])];
        if (nav.reveal === group.id) nav.reveal = null; // folded by hand: it stays folded
        save();
        drawList();
        focusKey(key);
      });
      head.dataset.navKey = key;
      head.setAttribute('aria-expanded', String(!group.folded));
      head.classList.toggle('folded', group.folded);
      head.append(el('span', 'wd-nav-name', group.name), icon('down'));
      return head;
    }

    /** All dashboards (the front page), first in the list; hideable in Customize, but listed while it's the page shown. */
    function allRow() {
      if (nav.customizing) {
        const on = !nav.prefs.allHidden;
        const row = el('div', `wd-nav-row wd-nav-all${on ? '' : ' off'}`);
        const room = el('span', 'wd-nav-grip'); // no grip: it stays first, but lines up with the rows that have one
        room.setAttribute('aria-hidden', 'true');
        row.append(room, icon('squares'), el('span', 'wd-nav-name', t('navAll')),
          eyeButton('eye-all', t('navAll'), on, () => { nav.prefs.allHidden = on; }));
        return row;
      }
      const all = el('a', 'wd-nav-row wd-nav-all');
      all.href = '#/';
      all.append(icon('squares'), el('span', 'wd-nav-name', t('navAll')));
      if (!wd.current) all.setAttribute('aria-current', 'page');
      all.addEventListener('click', (e) => leave(e, '#/'));
      return all;
    }

    function drawList() {
      const nodes = [];
      const here = wd.current && wd.current.dashboard;
      if (nav.customizing || !nav.prefs.allHidden || !here) nodes.push(allRow());
      if (!nav.customizing && here && wd.lockOf(here)) nodes.push(el('p', 'wd-nav-note', t('navHeld')));
      for (const group of navGroups(nav.customizing)) {
        if (group.id) nodes.push(nav.customizing ? customHead(group) : plainHead(group));
        if (group.folded) continue;
        nodes.push(...group.rows.map(d => (nav.customizing ? customRow(d, group) : plainRow(d))));
      }
      nav.list.replaceChildren(...nodes);
    }

    /**
     * The pane's title: Dashboards, or with a name or icon of the user's own (the front page's, Settings) that name and the
     * front page's mark (their icon, else the app's).
     */
    function navTitle() {
      const own = (wd.frontPage && wd.frontPage.brand) || {};
      if (!own.name && !own.icon) return el('strong', 'wd-nav-title', t('dashboards'));
      const title = el('strong', 'wd-nav-title wd-nav-brand');
      const mark = wd.brand().querySelector('.wd-logo');
      if (mark) title.append(mark);
      title.append(el('span', 'wd-brand-name', own.name || t('dashboards')));
      return title;
    }

    function drawHead() {
      if (nav.customizing) {
        const done = button('wd-btn primary wd-nav-done', t('done'), () => { nav.customizing = false; draw(); });
        nav.head.replaceChildren(el('strong', 'wd-nav-title', t('navShowHere')), done);
        return;
      }
      const close = button('wd-icon wd-nav-close', '', closePane, t('navClose'));
      close.append(icon('close'));
      nav.head.replaceChildren(navTitle(), close);
    }

    function drawFoot() {
      if (nav.customizing) {
        const p = nav.prefs;
        const tint = el('input', 'wd-switch');
        tint.type = 'checkbox';
        tint.id = 'wd-nav-tint';
        tint.setAttribute('role', 'switch');
        tint.checked = p.tint;
        tint.addEventListener('change', () => { p.tint = tint.checked; save(); paint(); });
        const tintRow = el('label', 'wd-nav-row wd-nav-tint');
        tintRow.htmlFor = tint.id;
        tintRow.append(el('span', 'wd-nav-name', t('navTint')), tint);
        const nodes = [el('p', 'wd-nav-note', t('navNote')), tintRow];
        if (p.allHidden || p.hidden.length || p.order.length || p.sectionOrder.length) {
          nodes.push(button('wd-nav-row wd-nav-reset', t('navReset'), () => {
            Object.assign(nav.prefs, { allHidden: false, hidden: [], order: [], sectionOrder: [] });
            save();
            drawList();
            drawFoot();
          }));
        }
        nav.foot.classList.remove('folded');
        nav.foot.replaceChildren(...nodes);
        return;
      }
      const custom = button('wd-nav-row wd-nav-custom', '', customize);
      custom.append(icon('eye'), el('span', 'wd-nav-name', t('navCustomize')));
      const count = nav.prefs.hidden.filter(id => dashboardIds().includes(id)).length;
      if (count) custom.append(el('span', 'wd-nav-count', t('navHiddenCount', { count })));
      const pinned = isPinned();
      const pin = button(`wd-nav-row wd-nav-pin${pinned ? ' on' : ''}`, '', togglePin);
      pin.setAttribute('aria-pressed', String(pinned));
      pin.hidden = !canPin() || nav.prefs.footFolded;
      pin.append(icon('pin'), el('span', 'wd-nav-name', t(pinned ? 'navStopKeeping' : 'navKeepOpen')));
      const settings = button('wd-nav-row wd-nav-settings', '', openSettings);
      settings.append(icon('sliders'), el('span', 'wd-nav-name', t('pageSettings')));
      // The foot's rows fold away under its handle, for a list with more room; open unless this browser folded them.
      const folded = nav.prefs.footFolded;
      const fold = button('wd-nav-foot-fold', '', () => {
        nav.prefs.footFolded = !nav.prefs.footFolded;
        save();
        drawFoot();
        apply();
        const b = /** @type {HTMLElement} */ (nav.foot.querySelector('.wd-nav-foot-fold'));
        if (b) b.focus({ preventScroll: true });
      }, t(folded ? 'navFootShow' : 'navFootHide'));
      fold.setAttribute('aria-expanded', String(!folded));
      fold.append(icon(folded ? 'up' : 'down'));
      for (const row of [custom, pin, settings]) if (folded) row.hidden = true;
      nav.foot.classList.toggle('folded', folded);
      nav.foot.replaceChildren(fold, custom, pin, settings);
    }

    function draw() {
      if (!nav.pane) return;
      const top = nav.list.scrollTop;
      nav.pane.classList.toggle('customizing', nav.customizing);
      drawHead();
      drawList();
      drawFoot();
      nav.list.scrollTop = top;
    }

    /**
     * Dragging a row within its section, or a section among the others: the capture is on the list, as the rows under the
     * finger are redrawn on each move. Escape puts them back.
     */
    function startDrag(e, id, section) {
      e.preventDefault();
      if (nav.drag) return;
      const before = { order: nav.prefs.order, sectionOrder: nav.prefs.sectionOrder };
      nav.prefs.order = ordered(dashboardIds(), nav.prefs.order);
      nav.prefs.sectionOrder = ordered(sectionIds(), nav.prefs.sectionOrder);
      const list = nav.list;
      try { list.setPointerCapture(e.pointerId); } catch (err) { /* a pointer that has already gone: the moves still come */ }
      const group = section ? null : navGroups(true).find(g => g.all.some(d => d.id === id));
      const move = (ev) => {
        const box = list.getBoundingClientRect();
        if (ev.clientY < box.top + EDGE_PX) list.scrollTop -= 8;
        else if (ev.clientY > box.bottom - EDGE_PX) list.scrollTop += 8;
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        if (!under) return;
        if (section) {
          const head = /** @type {HTMLElement} */ (under.closest('[data-nav-section]'));
          if (!head || head.dataset.navSection === id) return;
          reorder(nav.prefs.sectionOrder, id, head.dataset.navSection);
        } else {
          const row = /** @type {HTMLElement} */ (under.closest('[data-nav-row]'));
          if (!row || row.dataset.navRow === id || row.dataset.navGroup !== group.id) return;
          reorder(nav.prefs.order, id, row.dataset.navRow);
        }
        drawList();
      };
      const up = () => finish(true);
      const cancel = () => finish(false);
      function finish(keep) {
        list.removeEventListener('pointermove', move);
        list.removeEventListener('pointerup', up);
        list.removeEventListener('pointercancel', cancel);
        nav.drag = null;
        if (!keep) Object.assign(nav.prefs, before);
        save();
        drawList();
        drawFoot();
      }
      nav.drag = { key: section ? `section:${id}` : id, finish };
      list.addEventListener('pointermove', move);
      list.addEventListener('pointerup', up);
      list.addEventListener('pointercancel', cancel);
      drawList();
    }

    function ensureShell() {
      if (nav.pane) return;
      nav.pane = el('nav', 'wd-nav');
      nav.pane.setAttribute('aria-label', t('dashboards'));
      nav.head = el('div', 'wd-nav-head');
      nav.list = el('div', 'wd-nav-list');
      nav.foot = el('div', 'wd-nav-foot');
      nav.pane.append(nav.head, nav.list, nav.foot);
      // A tap in a widget never reaches the page, so the floating pane needs this layer over them to close on.
      nav.scrim = el('div', 'wd-nav-scrim');
      nav.scrim.addEventListener('click', closePane);
      (root.parentNode || document.body).insertBefore(nav.pane, root);
      root.parentNode.insertBefore(nav.scrim, root);
    }

    /** The button at the left of the viewing bars. */
    function navButton() {
      const b = button('wd-icon wd-nav-toggle', '', togglePane, t('dashboards'));
      b.setAttribute('aria-expanded', String(isPinned() || isFloating()));
      b.append(icon('panel'));
      return b;
    }

    /** A view is up: called once it's drawn. `inactive`: an editor's, where only a kept-open pane shows, and can't be used. */
    function showNav({ inactive = false } = {}) {
      ensureShell();
      nav.shown = true;
      nav.inactive = inactive;
      revealCurrent();
      draw();
      apply();
      if (isPinned()) scrollToCurrent();
    }

    /** Every view starts here (`clearRoot()`), and only a dashboard, the front page and their editors show the pane again. */
    function hideNav() {
      if (nav.drag) nav.drag.finish(false);
      nav.shown = false;
      nav.inactive = false;
      nav.open = false;
      nav.customizing = false;
      apply();
    }

    /** The list again after a change elsewhere: a dashboard back from Undo, renamed, or moved on the front page. */
    function redrawNav() {
      if (nav.shown) draw();
    }

    /** Every dashboard, hidden ones too, in this browser's order: Rotate goes round them in it. */
    const navInOrder = () => navGroups(true).flatMap(g => g.all);

    /** A duplicate: right after its original in an order of this browser's own, and hidden if that is. */
    function navCopied(from, to) {
      const p = nav.prefs;
      if (p.order.length) {
        p.order = ordered(dashboardIds(), p.order).filter(id => id !== to);
        p.order.splice(p.order.indexOf(from) + 1, 0, to);
      }
      if (isHidden(from) && !isHidden(to)) p.hidden.push(to);
      save();
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (nav.drag) { nav.drag.finish(false); return; }
      if (isFloating() && !document.querySelector('dialog[open]')) closePane();
    });
    window.addEventListener('resize', apply);
    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(type, () => { draw(); apply(); });

    Object.assign(wd, { tintNav, hideNav, navBlocked: blocked, navButton, navCopied, navGroups, navInOrder, ordered, readPrefs, redrawNav, reorder, showNav, PIN_MIN_WIDTH });
  });
})();
