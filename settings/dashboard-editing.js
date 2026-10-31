/*
 * The web dashboards page — editing a dashboard: wide widgets' covers and layout, moving widgets, drag and drop, and
 * resizing. A part of the page (settings/dashboard.js): mountWebDashboards() runs it once with `wd`, the page's
 * shared state and functions. The core's functions and constants are taken from `wd` at the top; the state that
 * changes, and the other parts' functions, are read as `wd.<name>`. Plain browser JS (served as-is).
 */
(function () {
  'use strict';

  window.WidgetkeeperWeb.part('editing', (wd) => {
    const { appWidget, button, clone, confirmButton, DRAG_SLOP, EDGE_PX, el, frames, icon, keepAwake, LAYOUT, opts,
      persist, root, t, typeOf } = wd;

    /** What another app's widget frame may do: no `allow-same-origin`, so it can't read this page or its key. */
    const SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox';

    // ---- Wide widgets: a cover in each column they cover takes their room; `place()` says how far down. --------

    /** Sizes the dashboard as it is: what changed, a widget's height, the window's width (a wide widget's height). */
    const sizes = new ResizeObserver(() => scheduleLayout());
    let layoutQueued = false;
    function scheduleLayout() {
      if (layoutQueued) return;
      layoutQueued = true;
      requestAnimationFrame(() => { layoutQueued = false; layoutWide(); });
    }

    /**
     * Moves the wide widgets and their covers down to where `place()` puts them (a top margin) and gives each cover
     * its widget's height. In one column (a phone) the wide widgets are as wide as the rest and the covers hidden (the
     * CSS), so the margins go.
     */
    function layoutWide() {
      if (!wd.current) return;
      const { dashboard, grid, widgets, covers } = wd.current;
      const cols = [...grid.children];
      const stacked = cols.length < 2 || /** @type {HTMLElement} */ (cols[1]).offsetLeft === /** @type {HTMLElement} */ (cols[0]).offsetLeft;
      const any = dashboard.columns.some((col, c) => col.some(w => !w.cover && LAYOUT.spanOf(w, c, cols.length) > 1));
      const nodeOf = (e, k) => (e.cover ? covers.get(`${e.cover}@${k}`) : widgets.get(e.id) && widgets.get(e.id).el);
      if (stacked || !any) {
        dashboard.columns.forEach((col, k) => col.forEach((e) => {
          const node = nodeOf(e, k);
          if (!node) return;
          node.style.marginTop = '';
          if (e.cover) node.style.height = '';
        }));
        return;
      }
      const gap = parseFloat(getComputedStyle(cols[0]).rowGap) || 0;
      const placed = LAYOUT.place(dashboard.columns, (e) => { const node = nodeOf(e, 0); return node ? node.offsetHeight : 0; }, gap);
      placed.forEach((col, k) => col.forEach(({ entry, margin, height, hidden }) => {
        const node = nodeOf(entry, k);
        if (!node) return;
        node.hidden = hidden;
        node.style.marginTop = margin ? `${margin}px` : '';
        if (entry.cover) node.style.height = `${height}px`;
      }));
    }

    /**
     * Puts a wide widget's covers at `y` (a top, in the window): in each column it covers, under the entries whose
     * middle is above it. From what's on screen, so every column agrees on which wide widget comes first.
     */
    function placeCovers(id, c, y) {
      const columns = wd.current.dashboard.columns;
      const w = columns[c].find(e => e.id === id);
      for (let k = 0; k < columns.length; k++) {
        const i = columns[k].findIndex(e => e.cover === id);
        if (i >= 0) columns[k].splice(i, 1);
      }
      const span = LAYOUT.spanOf(w, c, columns.length);
      for (let k = c + 1; k < c + span; k++) columns[k].splice(indexAt(k, y, id), 0, { cover: id });
    }

    /** How many of column `k`'s entries (not `id`'s own) are above `y`: their middle is. */
    function indexAt(k, y, id) {
      const column = wd.current.dashboard.columns[k];
      let i = 0;
      for (const e of column) {
        if ((e.cover || e.id) === id) continue;
        const node = e.cover ? wd.current.covers.get(`${e.cover}@${k}`) : wd.current.widgets.get(e.id) && wd.current.widgets.get(e.id).el;
        const r = node && !node.hidden ? node.getBoundingClientRect() : null;
        if (r && r.top + r.height / 2 >= y) break;
        i++;
      }
      return i;
    }

    /** A widget's top on screen (where its covers line up). */
    const topOf = (id) => wd.current.widgets.get(id).el.getBoundingClientRect().top;

    function widgetElement(w) {
      const app = appWidget(w.type);
      // Another app's widget still shows when this key can't read Homey's list (its defaults then: a card, no height).
      const def = typeOf(w.type) || (app && wd.foreignState !== 'ok' ? { name: app.widgetId, height: null, transparent: false } : null);
      const node = el('article', 'wd-widget');
      node.dataset.id = w.id;
      if (wd.current.editing) node.append(dragHandle(el('div', 'wd-tools')), resizeHandle(node));
      if (w.title) node.append(el('h2', 'wd-title', w.title));
      if (!def) {
        node.append(el('p', 'wd-error', app ? t('notInstalled', { name: app.appId }) : w.type));
        return node;
      }
      if (app && opts.mountWidget) return node; // the dev renders draw only ours
      // Another app's widget may be laid out at a phone's width and scaled to the column, as on Homey (`fitFrame()`).
      const scaled = !!app && w.scaled === true;
      const wrap = el('div', `wd-frame${def.transparent ? '' : ' card'}${scaled ? ' scaled' : ''}`);
      if (opts.mountWidget) {
        node.append(wrap);
        opts.mountWidget(clone(w), wrap);
        return node;
      }
      const iframe = document.createElement('iframe');
      iframe.title = w.title || def.name;
      // A percentage height keeps that share of the width until the widget sets its own (`ready`/`setHeight`).
      if (typeof def.height === 'string') iframe.style.aspectRatio = `100 / ${parseFloat(def.height)}`;
      else iframe.style.height = `${def.height || 120}px`;
      iframe.setAttribute('allow', 'autoplay; fullscreen');
      // A frame far below the window loads when it's scrolled near, so the ones on screen get the Homey to themselves.
      iframe.loading = 'lazy';
      // The dashboard and widget ids: a Timers widget keeps its own timer, a Media widget its speaker choice.
      const instance = `web-${wd.current.dashboard.id}-${w.id}`;
      // Another app's widget is sandboxed (no `allow-same-origin`: it can't read the key) unless the user trusts it.
      const sandboxed = !!app && w.trusted !== true;
      if (sandboxed) iframe.setAttribute('sandbox', SANDBOX);
      // Keep screen on's refused video retries on a tap in the widget too (each load is a new window).
      else iframe.addEventListener('load', () => { try { keepAwake.watch(iframe.contentWindow); } catch (e) { /* not ours */ } });
      iframe.src = `${wd.widgetFolder(w.type)}/index.html?widgetInstanceId=${encodeURIComponent(instance)}`;
      wrap.append(iframe);
      node.append(wrap);
      frames.add({ widget: clone(w), iframe, subs: new Map(), gen: 0, app, sandboxed, scaled });
      if (scaled) wd.scaler.observe(wrap);
      return node;
    }

    /** The edit tools over a widget: its name, settings, moves and remove. */
    function setTools(node, w, c, i, n) {
      const tools = node.querySelector(':scope > .wd-tools');
      if (!tools) return;
      const def = typeOf(w.type);
      const cols = wd.current.dashboard.columns.length;
      tools.textContent = '';
      const grip = el('span', 'wd-grip');
      grip.title = t('drag');
      grip.append(icon('grip'));
      const tool = (name, className, onClick, label) => {
        const b = button(`wd-tool${className ? ` ${className}` : ''}`, '', onClick, label);
        b.append(icon(name));
        return b;
      };
      // The moves, then (past a rule) the widget's settings and remove.
      tools.append(
        grip,
        el('span', 'wd-tools-name', (def && def.name) || (appWidget(w.type) || { widgetId: w.type }).widgetId),
        el('span', 'wd-spacer'),
        tool('up', 'wd-move', () => move(w.id, 0, -1), t('moveUp')),
        tool('down', 'wd-move', () => move(w.id, 0, 1), t('moveDown')),
        tool('left', 'wd-move', () => move(w.id, -1, 0), t('moveLeft')),
        tool('right', 'wd-move', () => move(w.id, 1, 0), t('moveRight')),
        el('span', 'wd-tools-rule'),
        tool('sliders', 'wd-tool-settings', () => wd.editWidget(w.id), t('settings')),
        confirmButton('wd-tool danger', icon('close'), () => removeWidget(w.id), t('tapAgain'), t('remove')),
      );
      const [up, down, left, right] = tools.querySelectorAll('.wd-move');
      up.disabled = i === 0;
      down.disabled = i === n - 1;
      left.disabled = c === 0;
      right.disabled = c + LAYOUT.spanOf(w, c, cols) >= cols;
      const handle = node.querySelector(':scope > .wd-resize');
      if (handle) handle.hidden = cols - c < 2 && LAYOUT.spanOf(w, c, cols) < 2;
    }

    function find(id) {
      const columns = wd.current.dashboard.columns;
      for (let c = 0; c < columns.length; c++) {
        const i = columns[c].findIndex(w => w.id === id);
        if (i >= 0) return { c, i, widget: columns[c][i] };
      }
      return null;
    }

    function move(id, dc, di) {
      const at = find(id);
      if (!at) return;
      const columns = wd.current.dashboard.columns;
      if (LAYOUT.spanOf(at.widget, at.c, columns.length) > 1) {
        // A wide widget: past the entry above or below it in its own column, its covers at that height; or a column
        // over, lining up with its top.
        if (dc) {
          moveWide(id, at.c + dc, topOf(id));
          return;
        }
        const past = columns[at.c][at.i + di];
        if (!past) return;
        const node = past.cover ? wd.current.covers.get(`${past.cover}@${at.c}`) : wd.current.widgets.get(past.id).el;
        const r = node.getBoundingClientRect();
        columns[at.c].splice(at.i, 1);
        columns[at.c].splice(at.i + di, 0, at.widget);
        placeCovers(id, at.c, di < 0 ? r.top : r.bottom);
        persist();
        wd.syncGrid();
        return;
      }
      if (dc) {
        const to = at.c + dc;
        if (to < 0 || to >= columns.length) return;
        columns[at.c].splice(at.i, 1);
        columns[to].splice(Math.min(at.i, columns[to].length), 0, at.widget);
      } else {
        const to = at.i + di;
        if (to < 0 || to >= columns[at.c].length) return;
        columns[at.c].splice(at.i, 1);
        columns[at.c].splice(to, 0, at.widget);
      }
      persist();
      wd.syncGrid();
    }

    /** Puts a widget at `index` of column `c` (an index among the column's other widgets). */
    function moveTo(id, c, index) {
      const at = find(id);
      const columns = wd.current.dashboard.columns;
      if (!at || !columns[c] || (at.c === c && at.i === index)) return;
      columns[at.c].splice(at.i, 1);
      columns[c].splice(Math.min(index, columns[c].length), 0, at.widget);
      persist();
      wd.syncGrid();
    }

    /**
     * Puts a wide widget in column `c` (moved left so its span fits) with its top at `y` (in the window): in each of its
     * columns, under the entries whose middle is above `y`.
     */
    function moveWide(id, c, y) {
      const at = find(id);
      const columns = wd.current.dashboard.columns;
      if (!at) return;
      const span = LAYOUT.spanOf(at.widget, at.c, columns.length);
      const to = Math.max(0, Math.min(c, columns.length - span));
      const i = indexAt(to, y, id);
      columns[at.c].splice(at.i, 1);
      columns[to].splice(Math.min(i, columns[to].length), 0, at.widget);
      placeCovers(id, to, y);
      persist();
      wd.syncGrid();
    }

    // ---- Drag and drop (editing): a widget's bar is its handle. Pointer events, so it works by touch too; the
    // widget stays where it is (moving an iframe reloads it) while a line shows where it will go. ----------------

    wd.drag = null; // {id, node, pointerId, x0, y0, x, y, active, ghost, marker, target: {c, i}, raf}

    function dragHandle(tools) {
      tools.addEventListener('pointerdown', (e) => {
        if (wd.drag || !wd.current || !wd.current.editing || e.button !== 0) return;
        if (/** @type {Element} */ (e.target).closest('button')) return;
        const node = tools.parentElement;
        wd.drag = { id: node.dataset.id, node, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false };
        try { tools.setPointerCapture(e.pointerId); } catch (err) { /* moves still come while over the bar */ }
        e.preventDefault();
      });
      tools.addEventListener('pointermove', (e) => {
        if (!wd.drag || e.pointerId !== wd.drag.pointerId) return;
        wd.drag.x = e.clientX;
        wd.drag.y = e.clientY;
        if (!wd.drag.active && Math.hypot(wd.drag.x - wd.drag.x0, wd.drag.y - wd.drag.y0) >= DRAG_SLOP) beginDrag();
        if (wd.drag.active) dragTo();
      });
      tools.addEventListener('pointerup', (e) => {
        if (wd.drag && e.pointerId === wd.drag.pointerId) endDrag(true);
      });
      tools.addEventListener('pointercancel', () => endDrag(false));
      tools.addEventListener('lostpointercapture', () => endDrag(false));
      return tools;
    }

    function beginDrag() {
      const at = find(wd.drag.id);
      const def = at && typeOf(at.widget.type);
      wd.drag.active = true;
      root.classList.add('dragging');
      wd.drag.node.classList.add('lifted');
      wd.drag.ghost = el('div', 'wd-ghost', (at && at.widget.title) || (def && def.name) || '');
      wd.drag.marker = el('div', 'wd-drop');
      document.body.append(wd.drag.ghost);
      wd.drag.raf = requestAnimationFrame(autoScroll);
    }

    /** Follows the pointer: the ghost under it, the line where the widget would go. */
    function dragTo() {
      wd.drag.ghost.style.transform = `translate(${wd.drag.x}px, ${wd.drag.y}px)`;
      // The column nearest the pointer (one under another on a phone), then the place among its other widgets.
      let c = 0;
      let best = Infinity;
      [...wd.current.grid.children].forEach((col, n) => {
        const r = col.getBoundingClientRect();
        const dx = Math.max(r.left - wd.drag.x, 0, wd.drag.x - r.right);
        const dy = Math.max(r.top - wd.drag.y, 0, wd.drag.y - r.bottom);
        if (dx * dx + dy * dy < best) { best = dx * dx + dy * dy; c = n; }
      });
      // A wide widget goes no further right than its span fits; the line is as wide as it.
      const columns = wd.current.dashboard.columns;
      const at = find(wd.drag.id);
      const span = at ? LAYOUT.spanOf(at.widget, at.c, columns.length) : 1;
      if (span > 1) c = Math.min(c, columns.length - span);
      const col = wd.current.grid.children[c];
      if (!col) return;
      // Its own covers aren't places to go; other wide widgets' covers are: above or below them in this column.
      const own = [...wd.current.covers.entries()].filter(([key]) => key.startsWith(`${wd.drag.id}@`)).map(([, node]) => node);
      const others = [...col.children].filter(n => (n.classList.contains('wd-widget') || (n.classList.contains('wd-cover') && !n.hidden))
        && n !== wd.drag.node && !own.includes(n));
      let i = 0;
      while (i < others.length) {
        const r = others[i].getBoundingClientRect();
        if (wd.drag.y < r.top + r.height / 2) break;
        i++;
      }
      const prev = others[i - 1];
      wd.drag.target = { c, i, y: prev ? prev.getBoundingClientRect().bottom + 1 : col.getBoundingClientRect().top };
      wd.drag.marker.classList.toggle('wide', span > 1);
      if (span > 1) wd.drag.marker.style.setProperty('--span', String(span));
      const before = others[i] || col.querySelector(':scope > .wd-add');
      if (wd.drag.marker.parentNode !== col || wd.drag.marker.nextSibling !== before) col.insertBefore(wd.drag.marker, before || null);
    }

    function autoScroll() {
      if (!wd.drag || !wd.drag.active) return;
      const h = window.innerHeight;
      const by = wd.drag.y < EDGE_PX ? wd.drag.y - EDGE_PX : wd.drag.y > h - EDGE_PX ? wd.drag.y - (h - EDGE_PX) : 0;
      if (by) {
        window.scrollBy(0, Math.round(by / 4));
        dragTo();
      }
      wd.drag.raf = requestAnimationFrame(autoScroll);
    }

    function endDrag(drop) {
      if (!wd.drag) return;
      const { id, active, target } = wd.drag;
      if (active) {
        cancelAnimationFrame(wd.drag.raf);
        wd.drag.ghost.remove();
        wd.drag.marker.remove();
        wd.drag.node.classList.remove('lifted');
        root.classList.remove('dragging');
      }
      wd.drag = null;
      if (!drop || !active || !target || !wd.current) return;
      const at = find(id);
      if (at && LAYOUT.spanOf(at.widget, at.c, wd.current.dashboard.columns.length) > 1) moveWide(id, target.c, target.y);
      else moveTo(id, target.c, target.i);
    }

    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (wd.drag) endDrag(false);
      if (wd.resizing) endResize(false);
    });

    // ---- Resizing (editing): a handle on a widget's right edge sets how many columns it spans. The width follows
    // the pointer a column at a time (a column counts once the pointer is past its middle); the covers follow on
    // release, at the widget's top. ------------------------------------------------------------------------------

    wd.resizing = null; // {id, node, pointerId, c, span, from}

    function resizeHandle(node) {
      const handle = el('div', 'wd-resize');
      handle.title = t('resize');
      handle.setAttribute('aria-hidden', 'true'); // the Width row in its settings is the keyboard's way
      handle.addEventListener('pointerdown', (e) => {
        if (wd.drag || wd.resizing || !wd.current || !wd.current.editing || e.button !== 0) return;
        const at = find(node.dataset.id);
        if (!at) return;
        const span = LAYOUT.spanOf(at.widget, at.c, wd.current.dashboard.columns.length);
        wd.resizing = { id: at.widget.id, node, pointerId: e.pointerId, c: at.c, span, from: span };
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* moves still come while over the handle */ }
        root.classList.add('resizing');
        e.preventDefault();
      });
      handle.addEventListener('pointermove', (e) => {
        if (!wd.resizing || e.pointerId !== wd.resizing.pointerId) return;
        const cols = [...wd.current.grid.children];
        let span = 1;
        for (let k = wd.resizing.c + 1; k < cols.length; k++) {
          const r = cols[k].getBoundingClientRect();
          if (e.clientX > r.left + r.width / 2) span = k - wd.resizing.c + 1;
        }
        if (span === wd.resizing.span) return;
        wd.resizing.span = span;
        node.classList.toggle('wide', span > 1);
        node.style.setProperty('--span', String(span));
      });
      handle.addEventListener('pointerup', (e) => { if (wd.resizing && e.pointerId === wd.resizing.pointerId) endResize(true); });
      handle.addEventListener('pointercancel', () => endResize(false));
      handle.addEventListener('lostpointercapture', () => endResize(false));
      return handle;
    }

    function endResize(keep) {
      if (!wd.resizing) return;
      const { id, node, c, span, from } = wd.resizing;
      wd.resizing = null;
      root.classList.remove('resizing');
      if (!keep || span === from) {
        node.classList.toggle('wide', from > 1);
        if (from > 1) node.style.setProperty('--span', String(from));
        else node.style.removeProperty('--span');
        return;
      }
      setSpan(id, c, span);
    }

    /** A widget's span (1: one column), its covers lined up with its top; saved. */
    function setSpan(id, c, span) {
      const at = find(id);
      if (!at) return;
      if (span > 1) at.widget.span = span;
      else { delete at.widget.span; delete at.widget.at; }
      placeCovers(id, c, topOf(id));
      persist();
      wd.syncGrid();
    }

    function removeWidget(id) {
      const at = find(id);
      if (!at) return;
      wd.current.dashboard.columns[at.c].splice(at.i, 1);
      for (const column of wd.current.dashboard.columns) {
        const i = column.findIndex(e => e.cover === id);
        if (i >= 0) column.splice(i, 1);
      }
      persist();
      wd.syncGrid();
    }

    Object.assign(wd, { endDrag, endResize, find, layoutWide, setSpan, setTools, sizes, widgetElement });
  });
})();
