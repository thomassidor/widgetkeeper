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
    const { button, el, icon, root, STAY_STORAGE, storageGet, storageSet, t } = wd;

    /** The stored choices, whatever is stored: a list only of strings, and pinned only if it's true. */
    function readPrefs(raw) {
      let p = null;
      try { p = JSON.parse(raw); } catch (e) { /* none yet, or damaged: the defaults */ }
      const list = (v) => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
      return { pinned: !!p && p.pinned === true, hidden: list(p && p.hidden), folded: list(p && p.folded), order: list(p && p.order), sectionOrder: list(p && p.sectionOrder) };
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

    const nav = { prefs: readPrefs(storageGet(NAV_STORAGE)), shown: false, inactive: false, open: false, customizing: false, drag: null, pane: null, scrim: null, head: null, list: null, foot: null };
    wd.nav = nav;

    const sectionsNow = () => (wd.frontPage && wd.frontPage.sections) || [];
    const dashboardIds = () => wd.dashboards.map(d => d.id);
    const sectionIds = () => sectionsNow().map(s => s.id);
    const isHidden = (id) => nav.prefs.hidden.includes(id);

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
        const rows = customizing ? all : all.filter(d => !isHidden(d.id));
        if (!rows.length) continue;
        const section = sections.find(s => s.id === id);
        groups.push({ id, name: section ? section.name || t('untitled') : '', all, rows, folded: !customizing && !!id && nav.prefs.folded.includes(id) });
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

    const canPin = () => window.innerWidth >= PIN_MIN_WIDTH;
    /** Full screen and kiosk mode have no pane, unless a kiosk's address asks for it (`?kiosk=1&nav=1`). */
    function blocked() {
      const c = document.documentElement.classList;
      return c.contains('wd-full') || (c.contains('wd-kiosk') && !c.contains('wd-kiosk-nav'));
    }
    const allowed = () => nav.shown && !blocked();
    const isPinned = () => allowed() && nav.prefs.pinned && canPin();
    const isFloating = () => allowed() && !nav.inactive && !isPinned() && nav.open;

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
        const pin = nav.head.querySelector('.wd-nav-pin');
        if (pin) pin.hidden = !canPin();
      }
      for (const b of root.querySelectorAll('.wd-nav-toggle')) b.setAttribute('aria-expanded', String(isPinned() || isFloating()));
    }

    const focusToggle = () => { const b = /** @type {HTMLElement} */ (root.querySelector('.wd-nav-toggle')); if (b) b.focus({ preventScroll: true }); };
    function focusKey(key) {
      const node = /** @type {HTMLElement} */ ([...nav.list.querySelectorAll('[data-nav-key]')].find(x => /** @type {HTMLElement} */ (x).dataset.navKey === key));
      if (node) node.focus({ preventScroll: true });
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
      apply();
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
      wd.askCode(here, () => { storageSet(STAY_STORAGE, null); location.hash = hash; });
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
        nav.prefs.folded = group.folded ? nav.prefs.folded.filter(id => id !== group.id) : [...nav.prefs.folded, group.id];
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

    function drawList() {
      const nodes = [];
      for (const group of navGroups(nav.customizing)) {
        if (group.id) nodes.push(nav.customizing ? customHead(group) : plainHead(group));
        if (group.folded) continue;
        nodes.push(...group.rows.map(d => (nav.customizing ? customRow(d, group) : plainRow(d))));
      }
      nav.list.replaceChildren(...nodes);
    }

    function drawHead() {
      if (nav.customizing) {
        const done = button('wd-btn primary wd-nav-done', t('done'), () => { nav.customizing = false; draw(); });
        nav.head.replaceChildren(el('strong', 'wd-nav-title', t('navShowHere')), done);
        return;
      }
      const pinned = isPinned();
      const label = t(pinned ? 'navStopKeeping' : 'navKeepOpen');
      const pin = button(`wd-icon wd-nav-pin${pinned ? ' on' : ''}`, '', togglePin, label);
      pin.setAttribute('aria-pressed', String(pinned));
      pin.hidden = !canPin();
      pin.append(icon('pin'));
      const close = button('wd-icon wd-nav-close', '', closePane, t('navClose'));
      close.append(icon('close'));
      nav.head.replaceChildren(el('strong', 'wd-nav-title', t('dashboards')), pin, close);
    }

    function drawFoot() {
      if (nav.customizing) {
        const p = nav.prefs;
        const nodes = [el('p', 'wd-nav-note', t('navNote'))];
        if (p.hidden.length || p.order.length || p.sectionOrder.length) {
          nodes.push(button('wd-nav-row wd-nav-reset', t('navReset'), () => {
            Object.assign(nav.prefs, { hidden: [], order: [], sectionOrder: [] });
            save();
            drawList();
            drawFoot();
          }));
        }
        nav.foot.replaceChildren(...nodes);
        return;
      }
      const all = el('a', 'wd-nav-row');
      all.href = '#/';
      all.append(icon('squares'), el('span', 'wd-nav-name', t('navAll')));
      if (!wd.current) all.setAttribute('aria-current', 'page');
      all.addEventListener('click', (e) => leave(e, '#/'));
      const edit = button('wd-nav-row', '', customize);
      edit.append(icon('eye'), el('span', 'wd-nav-name', t('navCustomize')));
      const count = nav.prefs.hidden.filter(id => dashboardIds().includes(id)).length;
      if (count) edit.append(el('span', 'wd-nav-count', t('navHiddenCount', { count })));
      const settings = button('wd-nav-row wd-nav-settings', '', openSettings);
      settings.append(icon('sliders'), el('span', 'wd-nav-name', t('pageSettings')));
      nav.foot.replaceChildren(all, edit, settings);
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
      draw();
      apply();
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
    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(type, apply);

    Object.assign(wd, { hideNav, navBlocked: blocked, navButton, navCopied, navGroups, navInOrder, ordered, readPrefs, redrawNav, reorder, showNav, PIN_MIN_WIDTH });
  });
})();
