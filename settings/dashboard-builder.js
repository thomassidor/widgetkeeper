/*
 * The web dashboards page — the Widget Builder (1.4.0, `.claude/rules/widgets/custom.md`): the designs on the front
 * page, and the builder (`#/builder/<id>`): the parts library and Layers on the left, the design in the middle at its
 * real size (the real widget, `widgets/custom/public/widget.js`, in a same-origin frame of its own so its stylesheet
 * stays there, with an overlay to select, move and resize parts), and the selected part's Part, Look, Rules and Flow
 * tabs on the right. Every change shows at once and is saved half a second later (`PUT /web/designs`). A part of the
 * page (settings/dashboard.js): mountWebDashboards() runs it once with `wd`. Plain browser JS (served as-is).
 */
(function () {
  'use strict';

  window.WidgetkeeperWeb.part('builder', (wd) => {
    const { button, confirmButton, el, failed, icon, request, root, storageSet, t, THEME_STORAGE, toast } = wd;

    const GRID = { cols: 4, row: 64, gap: 8 };
    const FINE = { cols: 12, row: 8, gap: 6 };
    const MAX_RULES = 6;
    const MAX_CHOICES = 6;
    const SAVE_MS = 500;
    const PREVIEW_MS = 400;
    const SNAP = 2; // per cent: free-form parts snap to the others' edges and middles within this
    const WIDTHS = [300, 440];

    /** The library: each kind, its group, the kit's icon and the size it gets at the top. */
    const KINDS = [
      ['value', 'show', 'thermometer', 2, 1], ['chart', 'show', 'chart', 2, 1], ['gauge', 'show', 'gauge', 2, 2],
      ['level', 'show', 'battery', 2, 1], ['status', 'show', 'shieldcheck', 2, 1], ['flowvalue', 'show', 'bolt', 2, 1],
      ['switch', 'control', 'power', 2, 1], ['button', 'control', 'play', 1, 1], ['slider', 'control', 'sun', 4, 1],
      ['stepper', 'control', 'up', 2, 1], ['choice', 'control', 'list', 2, 1], ['variable', 'control', 'pencil', 1, 1],
      ['container', 'layout', 'dashboard', 4, 3], ['text', 'layout', 'book', 4, 1], ['icon', 'layout', 'star', 1, 1],
      ['shape', 'layout', 'paintbrush', 4, 1], ['calc', 'show', 'settings', 2, 1], ['time', 'show', 'clock', 2, 1],
      ['image', 'layout', 'camera', 2, 2], ['ring', 'show', 'refresh', 2, 2], ['repeat', 'show', 'users', 4, 2],
      ['state', 'control', 'bookmark', 2, 1],
    ].map(([kind, group, glyph, w, h]) => ({ kind, group, glyph, w, h }));
    const GROUPS = ['layout', 'show', 'control'];
    const SLOT_KINDS = ['value', 'chart', 'gauge', 'level', 'status', 'switch', 'slider', 'stepper', 'choice'];
    const VARIABLE_KINDS = ['stepper', 'choice', 'variable'];
    const RANGE_KINDS = ['gauge', 'level', 'slider', 'stepper'];
    const SPANS = ['1h', '6h', '24h', '7d', '30d', 'today', 'yesterday', 'thisWeek'];
    const RULE_OPS = ['above', 'below', 'is', 'isNot'];
    const CALC_OPS = ['sum', 'avg', 'min', 'max', 'diff', 'count', 'formula'];
    const TIME_MODES = ['clock', 'date', 'since', 'until'];
    const MAX_INPUTS = 12;
    const MAX_REFS = 6;
    const INPUT_NAMES = 'abcdefghijkl';
    /** Kinds without a value of their own: each rule names the value it checks (lib/customDesigns.ts' VALUELESS_KINDS). */
    const VALUELESS_KINDS = ['shape', 'text', 'icon', 'button', 'container', 'image'];
    /** The kinds another component may read (a `{part}` source): lib/customDesigns.ts' SOURCE_KINDS. */
    const SOURCE_KINDS = ['calc', 'state', 'repeat'];
    const ACTION_KINDS = ['set', 'variable', 'flow', 'dashboard', 'state'];
    const MAX_ACTIONS = 6;
    const MAX_PAGES = 6;
    const MAX_RINGS = 3;
    /** What a Flow may change, per kind (lib/customDesigns.ts takes any; these are the ones that show on it). */
    const FLOW_PROPS = {
      text: ['text', 'color', 'hidden'], icon: ['icon', 'color', 'hidden'], container: ['hidden'],
      flowvalue: ['text', 'color', 'icon', 'hidden'], shape: ['color', 'hidden'],
      calc: ['text', 'color', 'icon', 'hidden'], time: ['text', 'color', 'icon', 'hidden'],
      state: ['text', 'color', 'hidden'], image: ['hidden'], ring: ['text', 'color', 'icon', 'hidden'], repeat: ['text', 'color', 'hidden'],
    };
    const flowPropsOf = kind => FLOW_PROPS[kind] || ['text', 'value', 'color', 'icon', 'hidden'];

    /** A colour's name in Homey's language: Dashboard Shortcuts' colour setting lists every one (the manifests are translated). */
    function colourName(id) {
      const def = wd.types && wd.types.get('shortcuts');
      const s = def && (def.settings || []).find(x => x.id === 'color1');
      const v = s && (s.values || []).find(x => x.id === id);
      return (v && v.title) || id;
    }

    /** The builder now: the design being built, the selection, the view's choices, undo, the preview. */
    let b = null;

    const strings = () => (wd.setup && wd.setup.strings) || {};
    const kindName = kind => (strings().custom && strings().custom.kinds && strings().custom.kinds[kind]) || kind;
    const designs = () => wd.designs || (wd.designs = (wd.setup && wd.setup.designs) || []);
    const clone = x => JSON.parse(JSON.stringify(x));
    const partId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    const kitIcon = (id, cls) => {
      const def = window.WidgetkeeperKit.icons[id];
      return def ? window.WidgetkeeperKit.svgIcon(def, cls) : el('span', cls);
    };

    // ---- The front page's section ------------------------------------------------------------------------------

    /** The designs as cards under the dashboards, each with a sketch of its grid, and a New design card. */
    function designsSection() {
      const wrap = el('section', 'wdb-front');
      wrap.append(el('h2', 'wd-group-title', t('builderTitle')));
      const grid = el('div', 'wd-dashboards wdb-cards');
      for (const d of designs()) grid.append(designCard(d));
      const add = button('wd-dash wd-dash-new', '', () => newDesign(add));
      const plus = el('span', 'wd-dash-plus');
      plus.append(icon('plus'));
      add.append(plus, el('span', 'wd-dash-new-text', t('builderNew')));
      grid.append(add);
      wrap.append(grid);
      return wrap;
    }

    function designCard(d) {
      const card = el('div', 'wd-dash wdb-card');
      const art = el('div', 'wd-dash-art wdb-art');
      const rows = Math.max(2, ...d.parts.map(p => p.at.y + p.at.h));
      art.style.setProperty('--rows', String(Math.min(rows, 6)));
      for (const p of d.parts) {
        if (p.at.y >= 6) continue;
        const cell = el('span', `wdb-thumb wdb-thumb-${p.kind}`);
        cell.style.gridColumn = `${p.at.x + 1} / span ${p.at.w}`;
        cell.style.gridRow = `${p.at.y + 1} / span ${Math.min(p.at.h, 6 - p.at.y)}`;
        if (p.kind === 'container' && p.background && p.background.kind !== 'none') {
          cell.style.background = p.background.kind === 'color' ? p.background.from : `linear-gradient(${p.background.angle}deg, ${p.background.from}, ${p.background.to})`;
        }
        art.append(cell);
      }
      const link = el('a', 'wd-dash-link');
      link.href = `#/builder/${d.id}`;
      const info = el('span', 'wd-dash-info');
      const count = d.parts.reduce((n, p) => n + 1 + (p.parts ? p.parts.length : 0), 0);
      info.append(el('span', 'wd-dash-name', d.name || t('untitled')), el('span', 'wd-muted wd-dash-count', t('builderPartCount', { count })));
      link.append(info);
      card.append(art, link);
      return card;
    }

    async function newDesign(node) {
      if (node) node.disabled = true;
      try {
        const res = await request('PUT', '/web/designs', { name: t('builderUntitled'), parts: [] });
        wd.designs = res.designs;
        location.hash = `#/builder/${res.design.id}`;
      } catch (err) {
        if (node) node.disabled = false;
        failed(err);
      }
    }

    // ---- The builder -------------------------------------------------------------------------------------------

    function renderBuilder(id) {
      const found = designs().find(d => d.id === id);
      if (!found) { wd.renderMissing(); return; }
      wd.clearRoot();
      wd.applyTheme('auto');
      wd.hideNav();
      const keep = b && b.design.id === id ? b : null;
      b = {
        design: clone(found), selected: keep ? keep.selected : null, libTab: keep ? keep.libTab : 'parts', tab: keep ? keep.tab : 'part',
        width: keep ? keep.width : 440, dark: wd.isDark(), vivid: keep ? keep.vivid : false,
        query: '', undo: [], state: null, rev: 1, saveTimer: null, previewTimer: null, status: 'saved', node: null,
      };
      const page = el('div', 'wdb');
      page.append(library(), stage(), inspector());
      root.append(builderBar(), page);
      b.node = page;
      loadPreview(true);
      // The device values, for the picked ones' names and readings (shared with the value picker for 30 s).
      wd.valueDevices('values').then((list) => { if (b && b.design.id === id) { b.devices = list; redrawInspector(); } }, () => {});
    }

    function builderBar() {
      const back = el('a', 'wd-icon');
      back.href = '#/';
      back.title = t('navAll');
      back.setAttribute('aria-label', t('navAll'));
      back.append(icon('left'));
      const name = el('input', 'wd-input wd-title-input wdb-name');
      name.value = b.design.name;
      name.setAttribute('aria-label', t('builderName'));
      name.addEventListener('change', () => change(() => { b.design.name = name.value.trim().slice(0, 40) || t('builderUntitled'); }, { preview: false }));
      const pick = el('select', 'wd-input wdb-switch');
      pick.setAttribute('aria-label', t('builderDesigns'));
      for (const d of designs()) {
        const o = el('option', null, d.name || t('untitled'));
        o.value = d.id;
        o.selected = d.id === b.design.id;
        pick.append(o);
      }
      pick.addEventListener('change', async () => { await flush(); location.hash = `#/builder/${pick.value}`; });
      const status = el('span', 'wd-muted wdb-status', t('builderSaved'));
      status.setAttribute('role', 'status');
      b.statusNode = status;
      const undo = button('wd-btn quiet', '', () => undoChange(), t('undo'));
      undo.append(el('span', null, t('undo')));
      undo.disabled = true;
      b.undoNode = undo;
      const copy = button('wd-icon', '', () => duplicateDesign(), t('duplicate'));
      copy.append(icon('copy'));
      const remove = confirmButton('wd-icon wd-bar-delete', icon('trash'), () => deleteDesign(), t('tapAgain'), t('builderDelete'));
      const place = button('wd-btn', '', () => addToDashboard(), t('builderAddTo'));
      place.append(icon('plus'), el('span', 'wd-bar-label', t('builderAddTo')));
      const done = el('a', 'wd-btn primary', t('done'));
      done.href = '#/';
      done.addEventListener('click', async (e) => { e.preventDefault(); await flush(); wd.leaveEditor('#/'); });
      const end = el('span', 'wd-bar-end');
      // Dark or light: this browser's own choice (as Settings' Dark or light), the page and the preview alike.
      const mode = button('wd-icon', '', () => {
        b.dark = !b.dark;
        storageSet(THEME_STORAGE, b.dark ? 'dark' : 'light');
        wd.applyTheme('auto');
        mode.replaceChildren(icon(b.dark ? 'sun' : 'moon'));
        mode.title = t(b.dark ? 'builderLightMode' : 'builderDarkMode');
        mode.setAttribute('aria-label', mode.title);
        mountPreview();
      }, t(b.dark ? 'builderLightMode' : 'builderDarkMode'));
      mode.append(icon(b.dark ? 'sun' : 'moon'));
      end.append(status, mode, undo, copy, remove, place, done);
      const node = wd.bar(back, name, pick, el('span', 'wd-spacer'), end);
      node.classList.add('wdb-bar');
      return node;
    }

    // ---- The library: parts to add, and Layers ---------------------------------------------------------------------

    function library() {
      const lib = el('aside', 'wdb-lib');
      const tabs = el('div', 'wdb-tabs');
      tabs.setAttribute('role', 'tablist');
      for (const [id, label] of [['parts', t('builderParts')], ['layers', t('builderLayers')]]) {
        const tb = button(`wdb-tab${b.libTab === id ? ' on' : ''}`, label, () => { b.libTab = id; redrawLibrary(); });
        tb.setAttribute('role', 'tab');
        tb.setAttribute('aria-selected', String(b.libTab === id));
        tabs.append(tb);
      }
      const body = el('div', 'wdb-lib-body');
      lib.append(tabs, body);
      b.libNode = lib;
      if (b.libTab === 'layers') drawLayers(body);
      else drawParts(body);
      return lib;
    }

    function redrawLibrary() {
      const old = b.libNode;
      old.replaceWith(library());
    }

    function drawParts(body) {
      const search = el('input', 'wd-input');
      search.type = 'search';
      search.placeholder = t('builderSearch');
      search.value = b.query;
      const list = el('div', 'wdb-groups');
      const draw = () => {
        list.textContent = '';
        const q = b.query.trim();
        for (const group of GROUPS) {
          const items = KINDS.filter(k => k.group === group && (!q || wd.matchesWords(q, `${kindName(k.kind)} ${t(`builderGroup_${group}`)}`)));
          if (!items.length) continue;
          list.append(el('h3', 'wdb-h3', t(`builderGroup_${group}`)));
          const grid = el('div', 'wdb-comps');
          for (const k of items) {
            const c = button('wdb-comp', '', () => { if (!c.dataset.dragged) addPart(k.kind); delete c.dataset.dragged; }, t('builderAdd', { name: kindName(k.kind) }));
            c.append(kitIcon(k.glyph, 'wdb-comp-icon'), el('span', null, kindName(k.kind)));
            dragToAdd(c, k);
            grid.append(c);
          }
          list.append(grid);
        }
        if (!list.firstChild) list.append(el('p', 'wd-muted', t('builderNoMatches')));
      };
      search.addEventListener('input', () => { b.query = search.value; draw(); });
      draw();
      const where = el('p', 'wd-hint wdb-where');
      const target = targetContainer();
      where.textContent = target ? t('builderAddsInto', { name: target.name || kindName('container') }) : t('builderAddsTop');
      body.append(search, where, list);
    }

    /**
     * Drag a component from the library onto the design: a ghost follows the pointer and the drop puts it there, at the
     * cell under the pointer, or inside the container under it. A tap (no drag) still adds it.
     */
    function dragToAdd(node, k) {
      node.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        const start = { x: e.clientX, y: e.clientY };
        let ghost = null;
        node.setPointerCapture(e.pointerId);
        const move = (ev) => {
          if (!ghost && Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) < 6) return;
          if (!ghost) {
            ghost = el('div', 'wdb-ghost');
            ghost.append(kitIcon(k.glyph, 'wdb-comp-icon'), el('span', null, kindName(k.kind)));
            document.body.append(ghost);
            node.dataset.dragged = '1';
          }
          ghost.style.left = `${ev.clientX + 8}px`;
          ghost.style.top = `${ev.clientY + 8}px`;
          b.canvas.classList.toggle('dropping', overCanvas(ev.clientX, ev.clientY));
        };
        const up = (ev) => {
          node.removeEventListener('pointermove', move);
          node.removeEventListener('pointerup', up);
          node.removeEventListener('pointercancel', up);
          if (!ghost) return;
          ghost.remove();
          b.canvas.classList.remove('dropping');
          if (ev.type === 'pointerup' && overCanvas(ev.clientX, ev.clientY)) addPart(k.kind, dropTarget(k.kind, ev.clientX, ev.clientY));
          // The click that follows a drag isn't a tap.
          setTimeout(() => { delete node.dataset.dragged; }, 0);
        };
        node.addEventListener('pointermove', move);
        node.addEventListener('pointerup', up);
        node.addEventListener('pointercancel', up);
      });
    }

    function overCanvas(x, y) {
      const r = b.canvas.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom + GRID.row;
    }

    /** Where a drop at a point goes: the container under it (not for a container) and the cell or per cent there. */
    function dropTarget(kind, x, y) {
      const c = b.canvas.getBoundingClientRect();
      const fx = x - c.left;
      const fy = y - c.top;
      if (kind !== 'container') {
        for (const box of b.design.parts.filter(p => p.kind === 'container')) {
          const inner = nodeOf(box.id) && nodeOf(box.id).querySelector('.wb-inner');
          if (!inner) continue;
          const r = inner.getBoundingClientRect();
          if (fx < r.left || fx > r.right || fy < r.top || fy > r.bottom) continue;
          if (box.mode === 'free') return { into: box, x: ((fx - r.left) / r.width) * 100, y: ((fy - r.top) / r.height) * 100 };
          const g = gridOf(box);
          return { into: box, x: Math.floor((fx - r.left) / g.colW), y: Math.floor((fy - r.top) / g.rowH) };
        }
      }
      const g = gridOf(null);
      return { into: null, x: Math.floor(fx / g.colW), y: Math.floor(fy / g.rowH) };
    }

    function drawLayers(body) {
      const list = el('div', 'wdb-layers');
      const row = (p, depth, siblings, i) => {
        const r = el('div', `wdb-layer${b.selected === p.id ? ' on' : ''}${depth ? ' in' : ''}`);
        const pick = button('wdb-layer-pick', '', () => select(p.id));
        pick.append(kitIcon((KINDS.find(k => k.kind === p.kind) || {}).glyph, 'wdb-layer-icon'), el('span', null, partTitle(p)));
        if (Object.keys(p.flow || {}).length) pick.append(el('span', 'wdb-flowmark', '⚡'));
        const up = button('wd-icon small', '', () => change(() => { siblings.splice(i - 1, 0, siblings.splice(i, 1)[0]); }), t('moveUp'));
        up.append(icon('up'));
        up.disabled = i === 0;
        const down = button('wd-icon small', '', () => change(() => { siblings.splice(i + 1, 0, siblings.splice(i, 1)[0]); }), t('moveDown'));
        down.append(icon('down'));
        down.disabled = i === siblings.length - 1;
        r.append(pick, up, down);
        list.append(r);
        if (p.kind === 'container') (p.parts || []).forEach((k, j) => row(k, depth + 1, p.parts, j));
      };
      b.design.parts.forEach((p, i) => row(p, 0, b.design.parts, i));
      if (!b.design.parts.length) list.append(el('p', 'wd-muted', t('builderEmpty')));
      body.append(list, el('p', 'wd-hint', t('builderLayersHint')));
    }

    function partTitle(p) {
      return p.name || (p.kind === 'text' && p.text ? p.text.slice(0, 30) : '') || kindName(p.kind);
    }

    // ---- The stage: the design at its size --------------------------------------------------------------------

    function stage() {
      const node = el('div', 'wdb-stage');
      const tools = el('div', 'wdb-tools');
      const seg = (items, value, set) => {
        const g = el('div', 'wd-seg');
        for (const [id, label] of items) {
          const btn = button(`wd-seg-option${id === value ? ' on' : ''}`, label, () => { set(id); for (const x of g.children) x.classList.toggle('on', x === btn); });
          g.append(btn);
        }
        return g;
      };
      tools.append(
        seg(WIDTHS.map(w => [w, `${w} px`]), b.width, (w) => { b.width = w; sizeCanvas(); }),
        seg([[false, t('builderMuted')], [true, t('builderVivid')]], b.vivid, (v) => { b.vivid = v; mountPreview(); }),
      );
      const canvas = el('div', 'wdb-canvas');
      const guide = el('div', 'wdb-guide');
      const frame = /** @type {HTMLIFrameElement} */ (el('iframe', 'wdb-frame'));
      frame.title = t('builderPreview');
      const overlay = el('div', 'wdb-overlay');
      canvas.append(guide, frame, overlay);
      b.canvas = canvas;
      b.guide = guide;
      b.frame = frame;
      b.overlay = overlay;
      overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) { select(null); } });
      node.append(tools, canvas, el('p', 'wd-hint wdb-tip', t('builderTip')));
      frame.srcdoc = frameDoc();
      frame.addEventListener('load', () => mountPreview());
      sizeCanvas();
      return node;
    }

    /**
     * The widget's own files, from where this page loaded the kit: the Homey serves a widget's `public/` as its folder
     * (`../widgets/spacer/kit.js`), the dev pages the repo (`../widgets/spacer/public/kit.js`). Homey's widget stylesheet
     * too where the page has it, for its tokens.
     */
    function frameDoc() {
      const kit = document.querySelector('script[src*="spacer/"][src$="kit.js"]');
      const kitUrl = new URL(kit ? kit.getAttribute('src') : '../widgets/spacer/kit.js', location.href).href;
      const pub = /\/public\/kit\.js$/.test(kitUrl);
      const base = kitUrl.replace(/spacer\/(public\/)?kit\.js$/, '');
      const at = (f) => { const [id, file] = f.split('/'); return `${base}${id}/${pub ? 'public/' : ''}${file}`; };
      const homeyCss = /** @type {HTMLLinkElement | null} */ (document.querySelector('link[href*="homey.widgets.css"]'));
      return '<!DOCTYPE html><html><head><meta charset="utf-8">'
        + (homeyCss ? `<link rel="stylesheet" href="${homeyCss.href}">` : '')
        + `<link rel="stylesheet" href="${at('spacer/kit.css')}"><link rel="stylesheet" href="${at('custom/widget.css')}">`
        + `<script src="${at('spacer/kit.js')}"><\/script><script src="${at('spacer/icons.js')}"><\/script><script src="${at('custom/widget.js')}"><\/script>`
        + '<style>body{margin:0;padding:0}</style></head><body class="homey-widget-full"><div id="root"></div></body></html>';
    }

    function mountPreview() {
      const win = b && b.frame && b.frame.contentWindow;
      if (!win || !win.createCustomWidget) return;
      const doc = win.document;
      doc.documentElement.classList.toggle('homey-dark-mode', b.dark);
      doc.documentElement.style.colorScheme = '';
      const host = doc.getElementById('root');
      host.textContent = '';
      const lookup = key => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), strings());
      b.widget = win.createCustomWidget(host, {
        t: key => lookup(key) || key,
        colorStyle: b.vivid ? 'deep' : 'soft',
        preview: true,
        onHeight: () => queueMicrotask(drawOverlay),
        onImage: part => request('POST', '/web/designs/image', { device: part.image.device }),
      });
      showPreview();
    }

    function sizeCanvas() {
      b.canvas.style.width = `${b.width}px`;
      drawOverlay();
    }

    /** The design as it is now, with the preview's values (read again a moment after a change that needs them). */
    function showPreview() {
      if (!b.widget) return;
      const state = b.state || { values: {}, variables: {}, flows: {}, histories: {}, flow: {} };
      b.widget.setState({ ...state, design: { ...clone(b.design), updatedAt: b.rev } });
      // The page each pages container is being edited on.
      for (const [id, page] of Object.entries(b.editPage || {})) if (b.widget.showPage) b.widget.showPage(id, page);
      b.frame.style.height = `${Math.max(rowsOf() * (GRID.row + GRID.gap) - GRID.gap, b.frame.contentDocument.body.scrollHeight)}px`;
      drawGuide();
      drawOverlay();
    }

    async function loadPreview(now = false) {
      clearTimeout(b.previewTimer);
      const mine = b;
      const go = async () => {
        try {
          const state = await request('POST', '/web/designs/preview', { design: mine.design });
          if (b !== mine) return;
          b.state = state;
          showPreview();
        } catch (err) {
          console.error(err);
        }
      };
      if (now) go();
      else b.previewTimer = setTimeout(go, PREVIEW_MS);
    }

    const rowsOf = () => Math.max(3, ...b.design.parts.map(p => p.at.y + p.at.h + 1));

    function drawGuide() {
      const g = b.guide;
      g.textContent = '';
      const rows = rowsOf();
      g.style.gridTemplateRows = `repeat(${rows}, ${GRID.row}px)`;
      for (let i = 0; i < rows * GRID.cols; i++) g.append(el('i'));
      b.canvas.style.minHeight = `${rows * (GRID.row + GRID.gap) - GRID.gap}px`;
    }

    // ---- The overlay: select, move, resize -------------------------------------------------------------------

    function nodeOf(id) {
      const doc = b.frame.contentDocument;
      return doc ? doc.querySelector(`[data-part="${id}"]`) : null;
    }

    function drawOverlay() {
      if (!b || !b.overlay) return;
      const o = b.overlay;
      o.textContent = '';
      b.lines = null;
      const box = (p, parent) => {
        const n = nodeOf(p.id);
        if (!n) return;
        const r = n.getBoundingClientRect();
        if (!r.width && !r.height) return; // on another page of a pages container
        const node = el('div', `wdb-box${p.kind === 'container' ? ' container' : ''}${b.selected === p.id ? ' on' : ''}${n.classList.contains('wb-hidden') ? ' hidden' : ''}`);
        Object.assign(node.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        node.style.borderRadius = n.ownerDocument.defaultView.getComputedStyle(n).borderRadius; // a pill's outline is round too
        node.title = partTitle(p);
        node.addEventListener('pointerdown', e => startDrag(e, p, parent, 'move'));
        if (b.selected === p.id) {
          const handle = el('span', 'wdb-handle');
          handle.addEventListener('pointerdown', e => startDrag(e, p, parent, 'resize'));
          node.append(handle);
          if (p.kind === 'container') node.append(el('span', 'wdb-tag', t(p.mode === 'free' ? 'builderFree' : 'builderFine')));
        }
        o.append(node);
      };
      for (const p of b.design.parts) {
        box(p, null);
        if (p.kind === 'container') for (const k of p.parts || []) box(k, p);
      }
    }

    /** The grid a part moves on: its cell size in px, and where its box starts. */
    function gridOf(parent) {
      if (!parent) {
        const w = b.canvas.getBoundingClientRect().width || b.width; // narrower than chosen on a phone
        return { mode: 'top', cols: GRID.cols, colW: (w - (GRID.cols - 1) * GRID.gap) / GRID.cols + GRID.gap, rowH: GRID.row + GRID.gap };
      }
      const inner = nodeOf(parent.id) && nodeOf(parent.id).querySelector('.wb-inner');
      const r = inner ? inner.getBoundingClientRect() : { width: 100, height: 100 };
      if (parent.mode === 'free') return { mode: 'free', w: r.width, h: r.height };
      return { mode: 'grid', cols: FINE.cols, colW: (r.width - (FINE.cols - 1) * FINE.gap) / FINE.cols + FINE.gap, rowH: FINE.row, rows: Math.floor(r.height / FINE.row) };
    }

    function startDrag(e, p, parent, how) {
      if (e.button) return;
      e.preventDefault();
      e.stopPropagation();
      if (b.selected !== p.id) select(p.id);
      // The overlay takes the pointer, not the box: the boxes are drawn again as the part moves.
      const node = b.overlay;
      node.setPointerCapture(e.pointerId);
      const g = gridOf(parent);
      const from = { ...p.at };
      // On a grid the others make room: each move starts from where they were and pushes the overlapped ones down.
      const siblings = parent ? parent.parts : b.design.parts;
      const places = new Map(siblings.map(x => [x, { ...x.at }]));
      const start = { x: e.clientX, y: e.clientY };
      let moved = false;
      let before = null;
      const move = (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        if (!moved) { moved = true; before = JSON.stringify(b.design); }
        const at = { ...from };
        if (g.mode === 'free') {
          const px = (dx / g.w) * 100;
          const py = (dy / g.h) * 100;
          if (how === 'move') {
            at.x = clamp(from.x + px, 0, 100 - at.w);
            at.y = clamp(from.y + py, 0, 100 - at.h);
            snapFree(at, parent, p);
          } else {
            at.w = clamp(from.w + px, 4, 100 - at.x);
            at.h = clamp(from.h + py, 4, 100 - at.y);
          }
          for (const k of ['x', 'y', 'w', 'h']) at[k] = Math.round(at[k] * 10) / 10;
        } else {
          const cx = Math.round(dx / g.colW);
          const cy = Math.round(dy / g.rowH);
          if (how === 'move') {
            at.x = clamp(from.x + cx, 0, g.cols - from.w);
            at.y = Math.max(0, from.y + cy);
          } else {
            at.w = clamp(from.w + cx, 1, g.cols - from.x);
            at.h = clamp(from.h + cy, 1, g.mode === 'top' ? 8 : 200);
          }
        }
        if (['x', 'y', 'w', 'h'].every(k => at[k] === p.at[k])) return;
        p.at = at;
        if (g.mode !== 'free') {
          for (const [x, place] of places) if (x !== p) x.at = { ...place };
          makeRoom(siblings, p);
        }
        b.rev++;
        showPreview();
        drawLines();
      };
      const up = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
        b.lines = null;
        if (moved) {
          pushUndo(before);
          saveSoon();
          drawOverlay();
          redrawInspector();
        }
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
    }

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    /** On a grid: the parts `moved` now overlaps go down below it, and those they then overlap, and so on. */
    function makeRoom(all, moved) {
      // In a pages container only the parts on the same page make room.
      const list = all.filter(o => (o.page || 0) === (moved.page || 0));
      const overlaps = (a, c) => a.at.x < c.at.x + c.at.w && c.at.x < a.at.x + a.at.w && a.at.y < c.at.y + c.at.h && c.at.y < a.at.y + a.at.h;
      const queue = [moved];
      for (let guard = 0; queue.length && guard < 500; guard++) {
        const m = queue.shift();
        for (const o of list) {
          if (o === m || o === moved || !overlaps(m, o)) continue;
          o.at = { ...o.at, y: m.at.y + m.at.h };
          queue.push(o);
        }
      }
    }

    /** Free-form: a part's edges and middle snap to its siblings' within SNAP per cent, the lines drawn while it does. */
    function snapFree(at, parent, p) {
      const lines = [];
      const others = (parent.parts || []).filter(k => k.id !== p.id);
      const tryAxis = (pos, size, axis) => {
        const mine = [pos, pos + size / 2, pos + size];
        let best = null;
        for (const k of others) {
          const kp = axis === 'x' ? k.at.x : k.at.y;
          const ks = axis === 'x' ? k.at.w : k.at.h;
          for (const target of [kp, kp + ks / 2, kp + ks, 0, 50, 100]) {
            mine.forEach((m, i) => {
              const d = target - m;
              if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, target, i };
            });
          }
        }
        if (!others.length) {
          for (const target of [0, 50, 100]) mine.forEach((m, i) => { const d = target - m; if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, target, i }; });
        }
        if (best) lines.push({ axis, at: best.target });
        return best ? best.d : 0;
      };
      at.x = clamp(at.x + tryAxis(at.x, at.w, 'x'), 0, 100 - at.w);
      at.y = clamp(at.y + tryAxis(at.y, at.h, 'y'), 0, 100 - at.h);
      b.lines = { parent, lines };
    }

    function drawLines() {
      drawOverlay();
      if (!b.lines || !b.lines.lines.length) return;
      const inner = nodeOf(b.lines.parent.id) && nodeOf(b.lines.parent.id).querySelector('.wb-inner');
      if (!inner) return;
      const r = inner.getBoundingClientRect();
      for (const l of b.lines.lines) {
        const line = el('div', `wdb-line ${l.axis}`);
        if (l.axis === 'x') Object.assign(line.style, { left: `${r.left + (r.width * l.at) / 100}px`, top: `${r.top - 8}px`, height: `${r.height + 16}px` });
        else Object.assign(line.style, { top: `${r.top + (r.height * l.at) / 100}px`, left: `${r.left - 8}px`, width: `${r.width + 16}px` });
        b.overlay.append(line);
      }
    }

    // ---- Changes, undo, saving -------------------------------------------------------------------------------

    /** A change to the design: kept for Undo, drawn at once, saved soon; `preview` reads the values again. */
    function change(fn, { preview = true, inspector = true } = {}) {
      pushUndo(JSON.stringify(b.design));
      fn();
      b.rev++;
      showPreview();
      if (preview) loadPreview();
      saveSoon();
      if (inspector) redrawInspector();
      if (b.libTab === 'layers') redrawLibrary();
    }

    function pushUndo(before) {
      b.undo.push(before);
      if (b.undo.length > 50) b.undo.shift();
      b.undoNode.disabled = false;
    }

    function undoChange() {
      const last = b.undo.pop();
      if (!last) return;
      b.design = JSON.parse(last);
      if (b.selected && !findPart(b.selected)) b.selected = null;
      b.undoNode.disabled = !b.undo.length;
      b.rev++;
      showPreview();
      loadPreview();
      saveSoon();
      redrawInspector();
      redrawLibrary();
    }

    function saveSoon() {
      setStatus('saving');
      clearTimeout(b.saveTimer);
      b.saveTimer = setTimeout(save, SAVE_MS);
    }

    function save() {
      const mine = b;
      clearTimeout(mine.saveTimer);
      mine.saveTimer = null;
      const body = clone(mine.design);
      wd.saving = wd.saving.then(async () => {
        try {
          const res = await request('PUT', '/web/designs', body);
          wd.designs = res.designs;
          if (b === mine) setStatus('saved');
        } catch (err) {
          if (b === mine) setStatus('failed');
          if (err.unauthorized || err.handled) failed(err);
          else toast(t('builderNotSaved'));
        }
      });
      return wd.saving;
    }

    /** Sends a save that's waiting, before leaving. */
    async function flush() {
      if (b && b.saveTimer) save();
      await wd.saving;
    }

    function setStatus(s) {
      b.status = s;
      if (!b.statusNode) return;
      b.statusNode.textContent = t(s === 'saving' ? 'builderSaving' : s === 'failed' ? 'builderNotSaved' : 'builderSaved');
      b.statusNode.classList.toggle('bad', s === 'failed');
    }

    async function duplicateDesign() {
      await flush();
      try {
        const res = await request('POST', `/web/designs/${encodeURIComponent(b.design.id)}/copy`);
        wd.designs = res.designs;
        location.hash = `#/builder/${res.design.id}`;
      } catch (err) { failed(err); }
    }

    async function deleteDesign() {
      clearTimeout(b.saveTimer);
      b.saveTimer = null;
      await wd.saving;
      try {
        const res = await request('DELETE', `/web/designs/${encodeURIComponent(b.design.id)}`);
        wd.designs = res.designs;
        b = null;
        location.hash = '#/';
      } catch (err) { failed(err); }
    }

    /** Add to dashboard: a Widget Builder widget showing this design, at the end of a dashboard's first column. */
    async function addToDashboard() {
      await flush();
      const { d, body } = wd.dialog(t('builderAddTo'));
      if (!wd.dashboards.length) body.append(el('p', 'wd-muted', t('builderNoDashboards')));
      const list = el('div', 'wd-checklist');
      for (const dash of wd.dashboards) {
        const row = button('wd-btn wdb-dashpick', dash.name || t('untitled'), async () => {
          d.close();
          try {
            const next = clone(dash);
            if (!next.columns.length) next.columns.push([]);
            const widget = { id: wd.newId(), type: 'custom', title: b.design.name, settings: { design: { id: b.design.id, name: b.design.name } }, deviceIds: [] };
            next.columns[0].push(widget);
            const saved = await request('PUT', '/web/dashboards', next);
            wd.dashboards = wd.dashboards.map(x => (x.id === saved.id ? saved : x));
            toast(t('builderAdded', { name: dash.name || t('untitled') }), { label: t('builderOpen'), run: () => { location.hash = `#/d/${dash.id}`; } });
          } catch (err) { failed(err); }
        });
        list.append(row);
      }
      body.append(list);
      d.showModal();
    }

    // ---- Adding and selecting parts --------------------------------------------------------------------------

    function findPart(id, parts = b.design.parts) {
      for (const p of parts) {
        if (p.id === id) return p;
        if (p.kind === 'container') { const k = findPart(id, p.parts || []); if (k) return k; }
      }
      return null;
    }
    function parentOf(id) {
      return b.design.parts.find(p => p.kind === 'container' && (p.parts || []).some(k => k.id === id)) || null;
    }

    /** The container a new part goes into: the selected one, or the one holding the selected part. */
    function targetContainer() {
      if (!b.selected) return null;
      const sel = findPart(b.selected);
      if (sel && sel.kind === 'container') return sel;
      return parentOf(b.selected);
    }

    function addPart(kind, drop) {
      const def = KINDS.find(k => k.kind === kind);
      const into = drop ? drop.into : kind === 'container' ? null : targetContainer();
      const p = {
        id: partId(), kind, name: '', color: null, icon: null, style: ['text', 'icon'].includes(kind) ? 'none' : 'tile', rules: [], flow: {}, reset: 'never',
      };
      if (kind === 'text') { p.text = t('builderTextDefault'); p.size = 'heading'; p.align = 'left'; }
      if (kind === 'container') { p.mode = 'grid'; p.background = { kind: 'gradient', from: '#2d4c7a', to: '#2a1958', angle: 135 }; p.parts = []; }
      if (kind === 'choice') p.choices = [];
      if (kind === 'stepper') p.step = 0.5;
      if (kind === 'chart') p.span = '24h';
      if (kind === 'value') p.show = 'value';
      if (kind === 'icon') p.icon = 'star';
      if (kind === 'shape') { p.style = 'none'; p.shape = 'rect'; p.background = { kind: 'none' }; p.opacity = 100; p.radius = 10; }
      if (kind === 'calc') { p.inputs = []; p.op = 'sum'; p.units = ''; }
      if (kind === 'time') { p.timeMode = 'clock'; p.icon = 'clock'; }
      if (kind === 'state') { p.stateType = 'toggle'; p.initial = 'false'; p.name = kindName('state'); }
      if (kind === 'image') { p.fit = 'cover'; p.refresh = 5; }
      if (kind === 'ring') { p.rings = []; p.center = 'value'; }
      if (kind === 'repeat') { p.itemStyle = 'row'; p.columns = 1; p.text = ''; }
      if (into && into.mode === 'pages') p.page = (b.editPage && b.editPage[into.id]) || 0;
      change(() => {
        const w = Number(def.w);
        const h = Number(def.h);
        if (!into) {
          const y = drop ? Math.max(0, drop.y) : b.design.parts.reduce((m, q) => Math.max(m, q.at.y + q.at.h), 0);
          p.at = { x: drop ? clamp(drop.x, 0, GRID.cols - w) : 0, y, w, h };
          b.design.parts.push(p);
          makeRoom(b.design.parts, p);
        } else if (into.mode === 'free') {
          const n = (into.parts || []).length;
          const pw = Math.min(48, w * 24);
          p.at = drop
            ? { x: Math.round(clamp(drop.x, 0, 100 - pw) * 10) / 10, y: Math.round(clamp(drop.y, 0, 70) * 10) / 10, w: pw, h: 30 }
            : { x: 4 + (n % 3) * 4, y: 4 + (n % 3) * 6, w: pw, h: 30 };
          into.parts.push(p);
        } else {
          const bottom = (into.parts || []).reduce((m, q) => Math.max(m, q.at.y + q.at.h), 0);
          const pw = Math.min(FINE.cols, w * 3);
          p.at = drop ? { x: clamp(drop.x, 0, FINE.cols - pw), y: Math.max(0, drop.y), w: pw, h: h * 8 } : { x: 0, y: bottom, w: pw, h: h * 8 };
          into.parts.push(p);
          makeRoom(into.parts, p);
        }
        b.selected = p.id;
        b.tab = 'part';
      });
    }

    function select(id) {
      b.selected = id;
      drawOverlay();
      redrawInspector();
      if (b.libTab === 'layers' || b.libTab === 'parts') redrawLibrary();
    }

    function removePart(id) {
      change(() => {
        const parent = parentOf(id);
        const list = parent ? parent.parts : b.design.parts;
        list.splice(list.findIndex(p => p.id === id), 1);
        b.selected = null;
      });
    }

    // ---- The inspector ---------------------------------------------------------------------------------------

    function inspector() {
      const node = el('aside', 'wdb-insp');
      b.inspNode = node;
      drawInspector(node);
      return node;
    }

    function redrawInspector() {
      if (!b || !b.inspNode) return;
      const scroll = b.inspNode.scrollTop;
      b.inspNode.textContent = '';
      drawInspector(b.inspNode);
      b.inspNode.scrollTop = scroll;
    }

    function drawInspector(node) {
      const p = b.selected && findPart(b.selected);
      if (!p) {
        node.append(el('h3', 'wdb-h3', t('builderNothing')), el('p', 'wd-hint', t('builderNothingHint')));
        return;
      }
      const parent = parentOf(p.id);
      const tabs = el('div', 'wdb-tabs');
      tabs.setAttribute('role', 'tablist');
      const ids = p.kind === 'container' ? ['part', 'rules', 'flow'] : ['part', 'look', 'rules', 'flow'];
      if (!ids.includes(b.tab)) b.tab = 'part';
      for (const id of ids) {
        const label = t(`builderTab_${id}`);
        const tb = button(`wdb-tab${b.tab === id ? ' on' : ''}`, label, () => { b.tab = id; redrawInspector(); });
        tb.setAttribute('role', 'tab');
        tb.setAttribute('aria-selected', String(b.tab === id));
        tabs.append(tb);
      }
      node.append(tabs, el('h3', 'wdb-h3', parent ? t('builderIn', { kind: kindName(p.kind), name: partTitle(parent) }) : kindName(p.kind)));
      const body = el('div', 'wdb-form');
      node.append(body);
      if (b.tab === 'part') partTab(body, p, parent);
      else if (b.tab === 'look') lookTab(body, p);
      else if (b.tab === 'rules') rulesTab(body, p);
      else flowTab(body, p);
    }

    /** A labelled row: the label, then the control (and a hint under it). */
    function row(label, control, hint) {
      const r = el('label', 'wdb-row');
      r.append(el('span', 'wdb-label', label), control);
      if (hint) r.append(el('span', 'wd-hint', hint));
      return r;
    }
    function textInput(value, set, attrs = {}) {
      const input = el(attrs.multi ? 'textarea' : 'input', 'wd-input');
      if (!attrs.multi) input.type = attrs.type || 'text';
      input.value = value == null ? '' : String(value);
      if (attrs.placeholder) input.placeholder = attrs.placeholder;
      if (attrs.step) input.step = attrs.step;
      input.addEventListener('change', () => set(input.value));
      return input;
    }
    function segs(items, value, set) {
      const g = el('div', 'wd-seg');
      for (const [id, label] of items) {
        const btn = button(`wd-seg-option${id === value ? ' on' : ''}`, label, () => set(id));
        btn.setAttribute('aria-pressed', String(id === value));
        g.append(btn);
      }
      return g;
    }
    const numOrNull = v => (String(v).trim() === '' ? undefined : (Number.isFinite(Number(String(v).replace(',', '.'))) ? Number(String(v).replace(',', '.')) : undefined));

    function partTab(body, p, parent) {
      const set = (fn, opts) => change(fn, opts);
      if (p.kind === 'text') {
        body.append(row(t('builderText'), textInput(p.text, v => set(() => { p.text = v.slice(0, 200); }, { preview: false }), { multi: true })));
        body.append(row(t('builderSize'), segs([['heading', t('builderHeading')], ['body', t('builderBody')], ['small', t('builderSmall')]], p.size, v => set(() => { p.size = v; }, { preview: false }))));
        body.append(row(t('builderAlign'), segs([['left', t('builderLeft')], ['center', t('builderCenter')], ['right', t('builderRight')]], p.align, v => set(() => { p.align = v; }, { preview: false }))));
      } else {
        body.append(row(t('builderPartName'), textInput(p.name, v => set(() => { p.name = v.trim().slice(0, 40); }, { preview: false }), { placeholder: ownName(p) || t('builderNameHint') })));
      }
      if (SLOT_KINDS.includes(p.kind) || VARIABLE_KINDS.includes(p.kind)) sourceRows(body, p);
      if (p.kind === 'button' && !(p.actions || []).length) body.append(row(t('builderStarts'), listPicker('flow', p.flowId, item => set(() => { if (item) p.flowId = item.id; else delete p.flowId; }), t('builderTapTrigger')), t('builderStartsHint')));
      if (p.kind === 'value') {
        body.append(row(t('builderShow'), segs([['value', t('builderJustValue')], ['chart', t('builderWithChart')]], p.show || 'value', v => set(() => { p.show = v; if (v === 'chart' && !p.span) p.span = '24h'; }))));
      }
      if (p.kind === 'chart' || (p.kind === 'value' && p.show === 'chart')) body.append(row(t('builderSpan'), spanSelect(p)));
      if (RANGE_KINDS.includes(p.kind)) {
        const two = el('div', 'wdb-two');
        two.append(row(t('builderMin'), textInput(p.min, v => set(() => { const n = numOrNull(v); if (n === undefined) delete p.min; else p.min = n; }, { preview: false }), { type: 'number', placeholder: t('builderAuto') })),
          row(t('builderMax'), textInput(p.max, v => set(() => { const n = numOrNull(v); if (n === undefined) delete p.max; else p.max = n; }, { preview: false }), { type: 'number', placeholder: t('builderAuto') })));
        body.append(two);
        if (p.kind === 'stepper') body.append(row(t('builderStep'), textInput(p.step, v => set(() => { p.step = numOrNull(v) || 0.5; }, { preview: false }), { type: 'number', step: 'any' })));
      }
      if (p.kind === 'choice') choicesRows(body, p);
      if (p.kind === 'flowvalue') {
        const two = el('div', 'wdb-two');
        two.append(row(t('builderUntilFlow'), textInput(p.text, v => set(() => { p.text = v.slice(0, 200); }, { preview: false }))),
          row(t('builderUnits'), textInput(p.units, v => set(() => { p.units = v.slice(0, 12); }, { preview: false }))));
        body.append(two, el('p', 'wd-hint', t('builderFlowValueHint')));
      }
      if (p.kind === 'container') containerRows(body, p);
      if (p.kind === 'text') refRows(body, p);
      if (p.kind === 'shape') shapeRows(body, p);
      if (p.kind === 'calc') calcRows(body, p);
      if (p.kind === 'time') timeRows(body, p);
      if (p.kind === 'state') stateRows(body, p);
      if (p.kind === 'button') actionRows(body, p);
      if (p.kind === 'image') imageRows(body, p);
      if (p.kind === 'ring') ringRows(body, p);
      if (p.kind === 'repeat') repeatRows(body, p);
      if (parent && parent.mode === 'pages') {
        body.append(row(t('builderOnPage'), selectOf((parent.pages || []).map((pg, i) => [String(i), pg.name || t('builderPageN', { n: i + 1 })]), String(p.page || 0), v => change(() => {
          p.page = Number(v);
          (b.editPage || (b.editPage = {}))[parent.id] = p.page;
          makeRoom(parent.parts, p);
        }))));
      }
      placeRows(body, p, parent);
      body.append(confirmButton('wd-btn danger wdb-remove', t('builderRemove'), () => removePart(p.id), t('tapAgain')));
    }

    /** Where a part's value comes from: a device value, or (stepper, choice) a Homey variable. */
    function sourceRows(body, p) {
      const both = SLOT_KINDS.includes(p.kind) && VARIABLE_KINDS.includes(p.kind);
      const usesVariable = p.kind === 'variable' || (both && !p.slot && !!p.variable) || (both && p.source === 'variable');
      if (both) {
        body.append(row(t('builderFrom'), segs([['device', t('builderDevice')], ['variable', t('builderVariable')]], usesVariable ? 'variable' : 'device', (v) => {
          change(() => { if (v === 'variable') { delete p.slot; p.source = 'variable'; } else { delete p.variable; delete p.source; } });
        })));
      }
      if (usesVariable) {
        body.append(row(t('builderVariable'), listPicker('variable', p.variable, item => change(() => { if (item) p.variable = item.id; else delete p.variable; delete p.source; }))));
      } else {
        body.append(row(t('builderValue'), valueButton(p)));
      }
    }

    /** The picked value's device and capability, from the device list (or the preview's answer while that's on its way). */
    function slotInfo(slot) {
      if (!slot) return null;
      const i = slot.indexOf(':');
      const dev = (b.devices || []).find(d => d.id === slot.slice(0, i));
      const cap = dev && dev.caps.find(c => c.id === slot.slice(i + 1));
      if (dev && cap) return { device: dev.name, room: dev.zone && dev.zone.name, title: cap.title, reading: window.WidgetkeeperKit.formatValue(cap, cap.value, k => t(k === 'on' ? 'valueOn' : 'valueOff')) };
      const v = b.state && b.state.values && b.state.values[slot];
      if (v && !v.missing) return { device: v.name, title: v.capability.title, reading: window.WidgetkeeperKit.formatValue(v.capability, v.value, k => t(k === 'on' ? 'valueOn' : 'valueOff')) };
      return b.devices ? { gone: true } : { loading: true };
    }

    /** The name a part shows when none is typed: its device's, its variable's or its Flow's. */
    function ownName(p) {
      const info = slotInfo(p.slot);
      if (info && info.device) return info.device;
      const v = p.variable && b.state && b.state.variables && b.state.variables[p.variable];
      if (v && v.name) return v.name;
      const f = p.flowId && b.state && b.state.flows && b.state.flows[p.flowId];
      return f && f.name ? f.name : '';
    }

    /** A device value: the device over the value and its reading (as the value picker's row), a tap to change it. */
    function valueButton(p) {
      return slotButton(p.slot, (item, devices) => change(() => {
        p.slot = item.id;
        // A choice on a list of values starts with that list.
        if (p.kind === 'choice' && !(p.choices || []).length) {
          const [devId, capId] = item.id.split(':');
          const dev = devices.find(x => x.id === devId);
          const cap = dev && dev.caps.find(c => c.id === capId);
          if (cap && Array.isArray(cap.values)) p.choices = cap.values.slice(0, MAX_CHOICES).map(x => ({ label: String(x.title || x.id).slice(0, 24), value: String(x.id) }));
          else if (cap && cap.type === 'boolean') p.choices = [{ label: t('valueOn'), value: 'true' }, { label: t('valueOff'), value: 'false' }];
        }
      }));
    }

    /** A device value's button: the picked one's device over its value and reading; `picked(item, devices)` on a pick. */
    function slotButton(slot, picked) {
      const wrap = el('div', 'wd-row');
      const info = slotInfo(slot);
      const pick = button('wd-btn wd-choice wdb-valuepick', '', async () => {
        try {
          const devices = await wd.valueDevices('values');
          wd.chooseValue(devices, slot || null, item => picked(item, devices));
        } catch (err) { failed(err); }
      });
      if (!info) pick.append(el('span', null, t('chooseValue')));
      else if (info.loading) pick.append(el('span', 'wd-muted', t('builderLoading')));
      else if (info.gone) pick.append(el('span', null, t('builderValueGone')));
      else {
        pick.append(el('span', 'wdb-valuepick-device', info.device));
        pick.append(el('span', 'wd-muted wdb-valuepick-value', [info.title, info.reading].filter(Boolean).join(' · ')));
      }
      wrap.append(pick);
      return wrap;
    }

    /** A list from `/web/designs/pick` (Flows, variables): the current one's name, a search and the rows. */
    function listPicker(what, current, picked, noneLabel) {
      const wrap = el('div', 'wd-picker');
      const known = what === 'flow' && current && b.state && b.state.flows && b.state.flows[current];
      const knownVar = what === 'variable' && current && b.state && b.state.variables && b.state.variables[current];
      const knownImage = what === 'image' && current && b.imageNames && b.imageNames[current];
      const label = known && known.name ? known.name : knownVar && knownVar.name ? knownVar.name : knownImage || (current ? current : (noneLabel || t('choose')));
      const head = el('div', 'wd-row');
      const pick = button('wd-btn wd-choice', label, () => toggle());
      head.append(pick);
      if (current) head.append(button('wd-btn quiet small', t('clear'), () => picked(null)));
      const search = el('input', 'wd-input');
      search.type = 'search';
      search.placeholder = t('search');
      const list = el('div', 'wd-options');
      wrap.append(head);
      let open = false;
      let seq = 0;
      const load = async () => {
        const mine = ++seq;
        try {
          const items = await request('POST', '/web/designs/pick', { what, query: search.value });
          if (mine !== seq) return;
          list.textContent = '';
          for (const item of items || []) {
            if (item.hint || item.id === 'none') { list.append(el('p', 'wd-muted', item.name)); continue; }
            const r = button(`wd-option${item.id === current ? ' on' : ''}`, '', () => picked(item));
            r.append(el('span', 'wd-option-name', item.name));
            if (item.description) r.append(el('span', 'wd-muted', item.description));
            list.append(r);
          }
        } catch (err) { list.textContent = ''; list.append(el('p', 'wd-muted', t('loadFailed'))); }
      };
      let timer = null;
      search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 200); });
      const toggle = () => {
        open = !open;
        if (open) { wrap.append(search, list); load(); search.focus(); } else { search.remove(); list.remove(); }
      };
      return wrap;
    }

    function spanSelect(p) {
      const s = el('select', 'wd-input');
      for (const id of SPANS) {
        const o = el('option', null, t(`builderSpan_${id}`));
        o.value = id;
        o.selected = p.span === id;
        s.append(o);
      }
      s.addEventListener('change', () => change(() => { p.span = s.value; }));
      return s;
    }

    function choicesRows(body, p) {
      const box = el('div', 'wdb-choices');
      (p.choices || []).forEach((c, i) => {
        const r = el('div', 'wdb-choice');
        r.append(
          textInput(c.label, v => change(() => { c.label = v.slice(0, 24) || c.value; }, { preview: false }), { placeholder: t('builderLabel') }),
          textInput(c.value, v => change(() => { c.value = v.slice(0, 60); }, { preview: false }), { placeholder: t('builderChoiceValue') }),
          button('wd-icon small', '', () => change(() => { p.choices.splice(i, 1); }, { preview: false }), t('remove')),
        );
        r.lastChild.append(icon('close'));
        box.append(r);
      });
      const add = button('wd-btn quiet small', t('builderAddChoice'), () => change(() => { p.choices = [...(p.choices || []), { label: '', value: '' }]; }, { preview: false }));
      add.disabled = (p.choices || []).length >= MAX_CHOICES;
      body.append(row(t('builderChoices'), box, t('builderChoicesHint')), add);
    }

    function containerRows(body, p) {
      body.append(row(t('builderMode'), segs([['grid', t('builderFine')], ['free', t('builderFree')], ['pages', t('builderPages')]], p.mode, v => change(() => {
        if (v === p.mode) return;
        if (v === 'pages') { p.pages = p.pages && p.pages.length ? p.pages : [{ name: '' }, { name: '' }]; p.nav = p.nav || 'tabs'; for (const k of p.parts || []) k.page = 0; }
        else { delete p.pages; delete p.nav; delete p.pageBy; for (const k of p.parts || []) delete k.page; }
        // Pages sit on the fine grid too: only free placement turns the places into per cent and back.
        if ((v === 'free') === (p.mode === 'free')) { p.mode = v; return; }
        const n = nodeOf(p.id);
        const rows = n ? Math.max(1, Math.floor(n.querySelector('.wb-inner').getBoundingClientRect().height / FINE.row)) : p.at.h * 9;
        for (const k of p.parts || []) {
          k.at = v === 'free'
            ? { x: Math.round((k.at.x / FINE.cols) * 1000) / 10, y: Math.round((k.at.y / rows) * 1000) / 10, w: Math.round((k.at.w / FINE.cols) * 1000) / 10, h: Math.min(100, Math.round((k.at.h / rows) * 1000) / 10) }
            : { x: Math.min(FINE.cols - 1, Math.round((k.at.x / 100) * FINE.cols)), y: Math.round((k.at.y / 100) * rows), w: Math.max(1, Math.round((k.at.w / 100) * FINE.cols)), h: Math.max(1, Math.round((k.at.h / 100) * rows)) };
        }
        p.mode = v;
      }, { preview: false }))));
      if (p.mode === 'pages') pagesRows(body, p);
      backgroundRows(body, p, t('builderBackground'), t('builderNone'));
    }

    /** A container's background, or a shape's fill: none (a shape: its colour from Style), a colour, or a gradient. */
    function backgroundRows(body, p, label, noneLabel) {
      const bg = p.background || { kind: 'none' };
      body.append(row(label, segs([['none', noneLabel], ['color', t('builderColour')], ['gradient', t('builderGradient')]], bg.kind, v => change(() => {
        p.background = v === 'none' ? { kind: 'none' } : v === 'color' ? { kind: 'color', from: bg.from || '#2d4c7a' } : { kind: 'gradient', from: bg.from || '#2d4c7a', to: bg.to || '#2a1958', angle: bg.angle || 135 };
      }, { preview: false }))));
      const colour = (key) => {
        const input = el('input', 'wdb-colour');
        input.type = 'color';
        input.value = bg[key] || '#2d4c7a';
        input.addEventListener('input', () => { bg[key] = input.value; b.rev++; showPreview(); });
        input.addEventListener('change', () => change(() => { p.background = { ...bg, [key]: input.value }; }, { preview: false, inspector: false }));
        return input;
      };
      if (bg.kind !== 'none') {
        const two = el('div', 'wdb-two');
        two.append(row(bg.kind === 'gradient' ? t('builderGradientFrom') : t('builderColour'), colour('from')));
        if (bg.kind === 'gradient') two.append(row(t('builderTo'), colour('to')));
        body.append(two);
        if (bg.kind === 'gradient') body.append(row(t('builderAngle'), textInput(bg.angle, v => change(() => { p.background = { ...bg, angle: Math.round(Number(v) || 0) % 360 }; }, { preview: false }), { type: 'number' })));
      }
    }

    /** Where it is: column, row, width and height on its grid, or per cent in a free-form container. */
    function placeRows(body, p, parent) {
      const free = parent && parent.mode === 'free';
      const box = el('div', 'wdb-four');
      const field = (key, label) => row(label, textInput(p.at[key], v => change(() => {
        const n = Number(String(v).replace(',', '.'));
        if (!Number.isFinite(n)) return;
        p.at = { ...p.at, [key]: free ? Math.round(n * 10) / 10 : Math.max(key === 'w' || key === 'h' ? 1 : 0, Math.round(n) - (key === 'x' || key === 'y' ? 1 : 0)) };
        if (!free) {
          const cols = parent ? FINE.cols : GRID.cols;
          p.at.w = Math.min(p.at.w, cols);
          p.at.x = Math.min(p.at.x, cols - p.at.w);
          makeRoom(parent ? parent.parts : b.design.parts, p);
        }
      }, { preview: false }), { type: 'number', step: free ? '0.1' : '1' }));
      const shown = free ? p.at : { ...p.at, x: p.at.x + 1, y: p.at.y + 1 };
      for (const [k, label] of [['x', free ? t('builderLeftPc') : t('builderColumn')], ['y', free ? t('builderTopPc') : t('builderRow')], ['w', t('builderWidth')], ['h', t('builderHeight')]]) {
        const f = field(k, label);
        f.querySelector('input').value = String(shown[k]);
        box.append(f);
      }
      body.append(el('h4', 'wdb-h4', parent ? t(free ? 'builderPlaceFree' : 'builderPlaceFine') : t('builderPlace')), box);
    }

    /** Every calculated value of the design: what a `{part}` source may name. */
    const everyPart = () => b.design.parts.flatMap(p => [p, ...(p.parts || [])]);
    /** The components another may read: calculated values, widget states and repeaters (how many they show). */
    const allCalcs = () => everyPart().filter(p => SOURCE_KINDS.includes(p.kind));
    const sourceKind = src => (!src || 'slot' in src ? 'device' : 'time' in src ? 'time' : 'part' in src ? 'calc' : 'variable');

    /**
     * Where a value comes from: a device value, a variable, a calculated value (`o.calc`, not `o.self`) or the time
     * (`o.time`, a text's). `set(source)` on a change; a new kind starts empty until one is picked.
     */
    function sourcePicker(src, set, o = {}) {
      const wrap = el('div', 'wdb-source');
      const calcs = o.calc === false ? [] : allCalcs().filter(c => c.id !== o.self);
      const kinds = [['device', t('builderDevice')], ['variable', t('builderVariable')]];
      if (calcs.length) kinds.push(['calc', t('builderFromComponent')]);
      if (o.time) kinds.push(['time', t('builderTimeNow')]);
      const kind = sourceKind(src);
      wrap.append(segs(kinds, kind, (v) => {
        if (v === kind) return;
        set(v === 'device' ? { slot: '' } : v === 'variable' ? { variable: '' } : v === 'calc' ? { part: calcs[0].id } : { time: 'clock' });
      }));
      if (kind === 'device') wrap.append(slotButton(src && src.slot, item => set({ slot: item.id })));
      else if (kind === 'variable') wrap.append(listPicker('variable', src.variable || '', item => set({ variable: item ? item.id : '' })));
      else {
        const items = kind === 'calc'
          ? calcs.map(c => [c.id, partTitle(c)])
          : [['clock', t('builderRef_clock')], ['date', t('builderRef_date')], ['weekday', t('builderRef_weekday')]];
        const sel = el('select', 'wd-input');
        for (const [id, label] of items) {
          const opt = el('option', null, label);
          opt.value = id;
          opt.selected = id === (kind === 'calc' ? src.part : src.time);
          sel.append(opt);
        }
        sel.addEventListener('change', () => set(kind === 'calc' ? { part: sel.value } : { time: sel.value }));
        wrap.append(sel);
      }
      return wrap;
    }

    function checkRow(label, on, set, hint) {
      const r = el('label', 'wdb-flowrow');
      const sw = el('input', 'wd-switch');
      sw.type = 'checkbox';
      sw.checked = !!on;
      sw.addEventListener('change', () => set(sw.checked));
      r.append(el('span', 'wdb-label', label), sw);
      if (hint) r.append(el('span', 'wd-hint', hint));
      return r;
    }

    function selectOf(items, value, set) {
      const sel = el('select', 'wd-input');
      for (const [id, label] of items) {
        const opt = el('option', null, label);
        opt.value = id;
        opt.selected = id === value;
        sel.append(opt);
      }
      sel.addEventListener('change', () => set(sel.value));
      return sel;
    }

    /** A text's values: `{1}` … `{6}`, each a device value, variable, calculated value or the time. */
    function refRows(body, p) {
      const refs = p.refs || [];
      body.append(el('h4', 'wdb-h4', t('builderRefs')));
      refs.forEach((r, i) => {
        const line = el('div', 'wdb-ref');
        const drop = button('wd-icon small', '', () => change(() => {
          // The later values move up one, and the text with them.
          p.refs.splice(i, 1);
          p.text = String(p.text || '').replace(/\{([1-6])\}/g, (m, n) => (Number(n) === i + 1 ? '' : Number(n) > i + 1 ? `{${Number(n) - 1}}` : m)).replace(/\s{2,}/g, ' ').trim();
        }), t('remove'));
        drop.append(icon('close'));
        line.append(el('span', 'wdb-ref-key', `{${i + 1}}`), sourcePicker(r, src => change(() => { p.refs[i] = src; }), { time: true, self: p.id }), drop);
        body.append(line);
      });
      const add = button('wd-btn quiet small', t('builderInsert'), () => change(() => {
        p.refs = [...refs, { slot: '' }];
        p.text = `${String(p.text || '').trimEnd()} {${p.refs.length}}`.trim();
      }));
      add.disabled = refs.length >= MAX_REFS;
      body.append(add, el('p', 'wd-hint', t('builderRefsHint')));
    }

    /** A pages container's pages (names), how it's paged, and the page being edited here. */
    function pagesRows(body, p) {
      const pages = p.pages || [];
      const editing = Math.min(pages.length - 1, (b.editPage && b.editPage[p.id]) || 0);
      body.append(row(t('builderEditPage'), segs(pages.map((pg, i) => [i, pg.name || String(i + 1)]), editing, (i) => {
        (b.editPage || (b.editPage = {}))[p.id] = i;
        if (b.widget && b.widget.showPage) b.widget.showPage(p.id, i);
        redrawInspector();
        drawOverlay();
      }), t('builderEditPageHint')));
      body.append(el('h4', 'wdb-h4', t('builderPageList')));
      pages.forEach((pg, i) => {
        const line = el('div', 'wdb-ref');
        const drop = button('wd-icon small', '', () => change(() => {
          // Its components move to the page before it.
          p.pages.splice(i, 1);
          for (const k of p.parts || []) if ((k.page || 0) >= i && (k.page || 0) > 0) k.page = (k.page || 0) - 1;
          if (b.editPage) b.editPage[p.id] = 0;
        }), t('remove'));
        drop.append(icon('close'));
        drop.disabled = pages.length <= 1;
        line.append(el('span', 'wdb-ref-key', String(i + 1)), textInput(pg.name, v => change(() => { pg.name = v.trim().slice(0, 24); }, { preview: false }), { placeholder: t('builderPageN', { n: i + 1 }) }), drop);
        body.append(line);
      });
      const add = button('wd-btn quiet small', t('builderAddPage'), () => change(() => { p.pages = [...pages, { name: '' }]; }, { preview: false }));
      add.disabled = pages.length >= MAX_PAGES;
      body.append(add);
      const states = everyPart().filter(x => x.kind === 'state');
      const navs = [['tabs', t('builderNav_tabs')], ['dots', t('builderNav_dots')]];
      if (states.length) navs.push(['state', t('builderNav_state')]);
      body.append(row(t('builderNav'), segs(navs, p.nav || 'tabs', v => change(() => {
        p.nav = v;
        if (v === 'state' && !p.pageBy) p.pageBy = { part: states[0].id };
        if (v !== 'state') delete p.pageBy;
      }, { preview: false }))));
      if (p.nav === 'state' && states.length) {
        body.append(row(t('builderPageBy'), selectOf(states.map(x => [x.id, partTitle(x)]), p.pageBy && p.pageBy.part, v => change(() => { p.pageBy = { part: v }; }, { preview: false })), t('builderPageByHint')));
      }
    }

    function stateRows(body, p) {
      body.append(row(t('builderStateType'), segs([['toggle', t('builderState_toggle')], ['choice', t('builderState_choice')]], p.stateType || 'toggle', v => change(() => {
        p.stateType = v;
        if (v === 'choice') { p.choices = p.choices && p.choices.length ? p.choices : [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }]; p.initial = p.choices[0].value; } else { delete p.choices; p.initial = 'false'; }
      }, { preview: false }))));
      if (p.stateType === 'choice') {
        choicesRows(body, p);
        body.append(row(t('builderInitial'), selectOf((p.choices || []).map(c => [c.value, c.label || c.value]), p.initial, v => change(() => { p.initial = v; }, { preview: false }))));
      } else {
        body.append(checkRow(t('builderInitialOn'), p.initial === 'true', v => change(() => { p.initial = v ? 'true' : 'false'; }, { preview: false })));
      }
      body.append(el('p', 'wd-hint', t('builderStateHint')));
    }

    /** A button's actions, in order, and how it's pressed. */
    function actionRows(body, p) {
      body.append(row(t('builderPress'), segs([['tap', t('builderPress_tap')], ['confirm', t('builderPress_confirm')], ['long', t('builderPress_long')]], p.press || 'tap', v => change(() => { p.press = v; }, { preview: false }))));
      body.append(el('h4', 'wdb-h4', t('builderActions')));
      const actions = p.actions || [];
      const states = everyPart().filter(x => x.kind === 'state');
      actions.forEach((a, i) => {
        const box = el('div', 'wdb-action');
        const head = el('div', 'wdb-action-head');
        const kinds = ACTION_KINDS.filter(k => k !== 'state' || states.length).map(k => [k, t(`builderAction_${k}`)]);
        const drop = button('wd-icon small', '', () => change(() => { p.actions.splice(i, 1); if (!p.actions.length) delete p.actions; }), t('remove'));
        drop.append(icon('close'));
        head.append(el('span', 'wdb-ref-key', String(i + 1)), selectOf(kinds, a.do, v => change(() => {
          p.actions[i] = v === 'state' ? { do: v, part: states[0].id, value: 'toggle' } : v === 'set' || v === 'variable' ? { do: v, value: '' } : { do: v };
        })), drop);
        box.append(head);
        const set = next => change(() => { p.actions[i] = { ...a, ...next }; });
        if (a.do === 'set') box.append(slotButton(a.slot, item => set({ slot: item.id })));
        if (a.do === 'variable') box.append(listPicker('variable', a.variable, item => set({ variable: item ? item.id : '' })));
        if (a.do === 'flow') box.append(listPicker('flow', a.flowId, item => set({ flowId: item ? item.id : '' })));
        if (a.do === 'dashboard') {
          box.append(selectOf([['', t('choose')], ...wd.dashboards.map(d => [d.id, d.name || t('untitled')])], a.dashboard || '', v => set({ dashboard: v })));
        }
        if (a.do === 'state') box.append(selectOf(states.map(x => [x.id, partTitle(x)]), a.part, v => set({ part: v })));
        if (a.do === 'set' || a.do === 'variable' || a.do === 'state') {
          box.append(textInput(a.value, v => change(() => { p.actions[i] = { ...a, value: v.trim().slice(0, 60) }; }, { preview: false }), { placeholder: t('builderActionValue') }));
        }
        body.append(box);
      });
      const add = button('wd-btn quiet small', t('builderAddAction'), () => change(() => { p.actions = [...actions, { do: 'set', value: 'toggle' }]; }));
      add.disabled = actions.length >= MAX_ACTIONS;
      body.append(add, el('p', 'wd-hint', t('builderActionsHint')));
    }

    function imageRows(body, p) {
      const src = p.image || { kind: 'url', url: '' };
      body.append(row(t('builderImageFrom'), segs([['url', t('builderImage_url')], ['device', t('builderImage_device')]], src.kind, v => change(() => {
        p.image = v === 'url' ? { kind: 'url', url: '' } : { kind: 'device', device: '' };
      }))));
      if (src.kind === 'url') {
        body.append(row(t('builderImageUrl'), textInput(src.url, v => change(() => { p.image = { kind: 'url', url: v.trim().slice(0, 500) }; }), { type: 'url', placeholder: 'https://…' }), t('builderImageUrlHint')));
      } else {
        body.append(row(t('builderImage_device'), listPicker('image', src.device, item => change(() => {
          if (item) (b.imageNames || (b.imageNames = {}))[item.id] = item.name;
          p.image = { kind: 'device', device: item ? item.id : '' };
        }))));
        body.append(row(t('builderRefresh'), selectOf([['0', t('builderRefreshNever')], ...[1, 5, 15, 60].map(m => [String(m), t('builderEveryMin', { n: m })])], String(p.refresh != null ? p.refresh : 5), v => change(() => { p.refresh = Number(v); }, { preview: false }))));
      }
      body.append(row(t('builderFit'), segs([['cover', t('builderFit_cover')], ['contain', t('builderFit_contain')]], p.fit || 'cover', v => change(() => { p.fit = v; }, { preview: false }))));
    }

    function ringRows(body, p) {
      const rings = p.rings || [];
      body.append(el('h4', 'wdb-h4', t('builderRings')));
      const colours = [['', t('builderNoColour')], ...window.WidgetkeeperKit.COLORS.map(c => [c, colourName(c)])];
      rings.forEach((r, i) => {
        const box = el('div', 'wdb-action');
        const head = el('div', 'wdb-action-head');
        const drop = button('wd-icon small', '', () => change(() => { p.rings.splice(i, 1); }), t('remove'));
        drop.append(icon('close'));
        head.append(el('span', 'wdb-ref-key', String(i + 1)), selectOf(colours, r.color || '', v => change(() => { r.color = v || null; }, { preview: false })), drop);
        box.append(head, sourcePicker(r.src, src => change(() => { p.rings[i] = { ...r, src }; }), { self: p.id }));
        const two = el('div', 'wdb-two');
        two.append(textInput(r.min, v => change(() => { const n = numOrNull(v); if (n === undefined) delete r.min; else r.min = n; }, { preview: false }), { type: 'number', placeholder: `${t('builderMin')} · ${t('builderAuto')}` }),
          textInput(r.max, v => change(() => { const n = numOrNull(v); if (n === undefined) delete r.max; else r.max = n; }, { preview: false }), { type: 'number', placeholder: `${t('builderMax')} · ${t('builderAuto')}` }));
        box.append(two);
        body.append(box);
      });
      const add = button('wd-btn quiet small', t('builderAddRing'), () => change(() => { p.rings = [...rings, { src: { slot: '' }, color: null }]; }));
      add.disabled = rings.length >= MAX_RINGS;
      body.append(add, el('p', 'wd-hint', t('builderRingsHint')));
      body.append(row(t('builderRingMiddle'), segs([['value', t('builderRingMiddle_value')], ['icon', t('builderIcon')], ['none', t('builderNone')]], p.center || 'value', v => change(() => { p.center = v; }, { preview: false }))));
    }

    /** A repeater: which devices (a capability, a room), which of them show, and how. */
    function repeatRows(body, p) {
      const caps = new Map();
      const zones = new Map();
      for (const d of b.devices || []) {
        if (d.id === 'log') continue; // apps' logs aren't devices
        for (const c of d.caps) if (!caps.has(c.id)) caps.set(c.id, c.title || c.id);
        if (d.zone && d.zone.id) zones.set(d.zone.id, d.zone.name);
      }
      const byTitle = m => [...m].sort((x, y) => String(x[1]).localeCompare(String(y[1])));
      body.append(row(t('builderRepeatCap'), selectOf([['', t('choose')], ...byTitle(caps).map(([id, title]) => [id, `${title} (${id})`])], p.capability || '', v => change(() => { if (v) p.capability = v; else delete p.capability; })), t('builderRepeatCapHint')));
      body.append(row(t('builderRepeatZone'), selectOf([['', t('builderEverywhere')], ...byTitle(zones)], p.zone || '', v => change(() => { if (v) p.zone = v; else delete p.zone; }))));
      body.append(checkRow(t('builderRepeatOnly'), !!p.test, v => change(() => { if (v) p.test = { op: 'is', value: 'on' }; else delete p.test; }, { preview: false })));
      if (p.test) {
        const two = el('div', 'wdb-two');
        two.append(selectOf(RULE_OPS.map(o => [o, t(`builderOp_${o}`)]), p.test.op, v => change(() => { p.test = { ...p.test, op: v }; }, { preview: false })),
          textInput(p.test.value, v => change(() => { p.test = { ...p.test, value: v.slice(0, 60) }; }, { preview: false }), { placeholder: t('builderRuleValue') }));
        body.append(two);
      }
      body.append(row(t('builderItemStyle'), segs([['row', t('builderItem_row')], ['tile', t('builderItem_tile')]], p.itemStyle || 'row', v => change(() => { p.itemStyle = v; }, { preview: false }))));
      body.append(row(t('builderColumns'), segs([1, 2, 3, 4].map(n => [n, String(n)]), p.columns || 1, v => change(() => { p.columns = v; }, { preview: false }))));
      body.append(checkRow(t('builderRepeatControl'), p.control, v => change(() => { if (v) p.control = true; else delete p.control; }, { preview: false }), t('builderRepeatControlHint')));
      body.append(row(t('builderRepeatEmpty'), textInput(p.text, v => change(() => { p.text = v.slice(0, 200); }, { preview: false }), { placeholder: t('builderRepeatEmptyHint') })));
      body.append(el('p', 'wd-hint', t('builderRepeatHint')));
    }

    function shapeRows(body, p) {
      body.append(row(t('builderShape'), segs([['rect', t('builderShape_rect')], ['circle', t('builderShape_circle')], ['line', t('builderShape_line')]], p.shape || 'rect', v => change(() => {
        p.shape = v;
        if (v === 'rect' && p.radius == null) p.radius = 10;
        if (v === 'line') { if (!p.thickness) p.thickness = 2; if (!p.dir) p.dir = 'horizontal'; }
      }, { preview: false }))));
      backgroundRows(body, p, t('builderFill'), t('builderFillStyle'));
      const two = el('div', 'wdb-two');
      const clampTo = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
      two.append(row(t('builderOpacity'), textInput(p.opacity != null ? p.opacity : 100, v => change(() => { p.opacity = clampTo(v, 10, 100, 100); }, { preview: false }), { type: 'number' })));
      if ((p.shape || 'rect') === 'rect') two.append(row(t('builderRadius'), textInput(p.radius != null ? p.radius : 10, v => change(() => { p.radius = clampTo(v, 0, 32, 10); }, { preview: false }), { type: 'number' })));
      if (p.shape === 'line') two.append(row(t('builderThickness'), textInput(p.thickness || 2, v => change(() => { p.thickness = clampTo(v, 1, 8, 2); }, { preview: false }), { type: 'number' })));
      body.append(two);
      if (p.shape === 'line') body.append(row(t('builderDirection'), segs([['horizontal', t('builderHorizontal')], ['vertical', t('builderVertical')]], p.dir || 'horizontal', v => change(() => { p.dir = v; }, { preview: false }))));
    }

    function calcRows(body, p) {
      body.append(row(t('builderCalc'), selectOf(CALC_OPS.map(o => [o, t(`builderCalc_${o}`)]), p.op || 'sum', v => change(() => {
        p.op = v;
        if (v === 'count' && !p.test) p.test = { op: 'is', value: 'on' };
        if (v === 'formula' && p.formula == null) p.formula = '';
      }, { preview: false }))));
      body.append(el('h4', 'wdb-h4', t('builderInputs')));
      const inputs = p.inputs || [];
      inputs.forEach((src, i) => {
        const line = el('div', 'wdb-ref');
        const drop = button('wd-icon small', '', () => change(() => { p.inputs.splice(i, 1); }), t('remove'));
        drop.append(icon('close'));
        line.append(el('span', 'wdb-ref-key', p.op === 'formula' ? INPUT_NAMES[i] : String(i + 1)), sourcePicker(src, next => change(() => { p.inputs[i] = next; }), { calc: false }), drop);
        body.append(line);
      });
      const add = button('wd-btn quiet small', t('builderAddInput'), () => change(() => { p.inputs = [...inputs, { slot: '' }]; }));
      add.disabled = inputs.length >= MAX_INPUTS;
      body.append(add);
      if (p.op === 'count') {
        const test = p.test || { op: 'is', value: 'on' };
        const line = el('div', 'wdb-two');
        line.append(selectOf(RULE_OPS.map(o => [o, t(`builderOp_${o}`)]), test.op, v => change(() => { p.test = { ...test, op: v }; }, { preview: false })),
          textInput(test.value, v => change(() => { p.test = { ...test, value: v.slice(0, 60) }; }, { preview: false }), { placeholder: t('builderRuleValue') }));
        body.append(row(t('builderCountWhen'), line));
      }
      if (p.op === 'formula') {
        const win = b.frame && b.frame.contentWindow;
        const bad = !!(p.formula && win && win.customFormula && !win.customFormula(p.formula));
        body.append(row(t('builderFormula'), textInput(p.formula, v => change(() => { p.formula = v.slice(0, 120); }, { preview: false }), { placeholder: '(a + b) / 2' }), bad ? t('builderFormulaBad') : t('builderFormulaHint')));
      }
      const two = el('div', 'wdb-two');
      two.append(row(t('builderUnits'), textInput(p.units, v => change(() => { p.units = v.trim().slice(0, 12); }, { preview: false }), { placeholder: t('builderAuto') })),
        row(t('builderDecimals'), selectOf([['', t('builderAuto')], ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']], p.decimals == null ? '' : String(p.decimals), v => change(() => { if (v === '') delete p.decimals; else p.decimals = Number(v); }, { preview: false }))));
      body.append(two);
      if (p.op === 'min' || p.op === 'max') body.append(checkRow(t('builderShowWinner'), p.winner, v => change(() => { p.winner = v; }, { preview: false })));
      body.append(checkRow(t('builderSourceOnly'), p.sourceOnly, v => change(() => { if (v) p.sourceOnly = true; else delete p.sourceOnly; }, { preview: false }), t('builderSourceOnlyHint')));
    }

    function timeRows(body, p) {
      body.append(row(t('builderTimeShow'), selectOf(TIME_MODES.map(m => [m, t(`builderTime_${m}`)]), p.timeMode || 'clock', v => change(() => {
        p.timeMode = v;
        if (v === 'until' && !p.until) p.until = '22:00';
        if (v === 'date' && !p.dateStyle) p.dateStyle = 'long';
      }))));
      const mode = p.timeMode || 'clock';
      if (mode === 'clock') body.append(checkRow(t('builderSeconds'), p.seconds, v => change(() => { p.seconds = v; }, { preview: false })));
      if (mode === 'date') body.append(row(t('builderDateStyle'), segs([['short', t('builderDate_short')], ['long', t('builderDate_long')], ['weekday', t('builderDate_weekday')]], p.dateStyle || 'long', v => change(() => { p.dateStyle = v; }, { preview: false }))));
      if (mode === 'since') body.append(row(t('builderValue'), slotButton(p.slot, item => change(() => { p.slot = item.id; })), t('builderSinceHint')));
      if (mode === 'until') body.append(row(t('builderUntilTime'), textInput(p.until || '22:00', v => change(() => { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) p.until = v; }, { preview: false }), { type: 'time' }), t('builderUntilHint')));
    }

    function lookTab(body, p) {
      const colours = [{ id: 'none', title: t('builderNoColour') }, ...window.WidgetkeeperKit.COLORS.map(c => ({ id: c, title: colourName(c) }))];
      body.append(row(t('builderColour'), wd.choiceGroup({ id: 'colour' }, colours, p.color || 'none', v => change(() => { p.color = v === 'none' ? null : v; }, { preview: false }), true), t(p.kind === 'shape' ? 'builderShapeColourHint' : 'builderColourHint')));
      if (p.kind === 'shape') return;
      const iconRow = el('div', 'wd-row');
      const current = wd.iconNode(p.icon);
      const pick = button('wd-btn', '', () => wd.pickIcon({ value: p.icon, noneLabel: t('builderNoIcon'), picked: v => change(() => { p.icon = v && !wd.isIconPicture(v) ? v : null; }, { preview: false }) }));
      if (current) pick.append(current);
      pick.append(el('span', null, p.icon ? t('builderChange') : t('builderNoIcon')));
      iconRow.append(pick);
      body.append(row(t('builderIcon'), iconRow, t('builderIconHint')));
      const style = ['tile', 'pill', 'none'].includes(p.style) ? p.style : (p.tile === false || ['text', 'icon'].includes(p.kind) ? 'none' : 'tile');
      body.append(row(t('builderStyle'), segs([['tile', t('builderStyleTile')], ['pill', t('builderStylePill')], ['none', t('builderStyleNone')]], style, v => change(() => { p.style = v; delete p.tile; }, { preview: false })), t('builderStyleHint')));
    }

    function rulesTab(body, p) {
      const colours = window.WidgetkeeperKit.COLORS;
      if ((p.rules || []).length) body.append(el('p', 'wdb-label', t('builderRulesLead')));
      // A clock or a date has no value either: like a shape, each rule names the one it checks.
      const valueless = VALUELESS_KINDS.includes(p.kind) || (p.kind === 'time' && ['clock', 'date'].includes(p.timeMode || 'clock'));
      (p.rules || []).forEach((r, i) => {
        const of = el('div', 'wdb-rule-of');
        if (!valueless) {
          of.append(segs([['self', t('builderRuleOfSelf')], ['other', t('builderRuleOfOther')]], r.of ? 'other' : 'self', v => change(() => {
            if (v === 'self') delete r.of; else r.of = { slot: '' };
          })));
        }
        if (r.of || valueless) of.append(sourcePicker(r.of, src => change(() => { r.of = src; }), { self: p.id }));
        body.append(of);
        const line = el('div', 'wdb-rule');
        const op = el('select', 'wd-input');
        for (const o of RULE_OPS) { const opt = el('option', null, t(`builderOp_${o}`)); opt.value = o; opt.selected = r.op === o; op.append(opt); }
        op.addEventListener('change', () => change(() => { r.op = op.value; }, { preview: false }));
        const value = textInput(r.value, v => change(() => { r.value = v.slice(0, 60); }, { preview: false }), { placeholder: t('builderRuleValue') });
        const look = el('select', 'wd-input');
        for (const o of [...colours, 'hide']) { const opt = el('option', null, o === 'hide' ? t('builderHide') : colourName(o)); opt.value = o; opt.selected = r.look === o; look.append(opt); }
        look.addEventListener('change', () => change(() => { r.look = look.value; }, { preview: false }));
        const drop = button('wd-icon small', '', () => change(() => { p.rules.splice(i, 1); }, { preview: false }), t('remove'));
        drop.append(icon('close'));
        line.append(op, value, look, drop);
        body.append(line);
      });
      if (!(p.rules || []).length) body.append(el('p', 'wd-muted', t('builderNoRules')));
      const add = button('wd-btn quiet small', t('builderAddRule'), () => change(() => {
        p.rules = [...(p.rules || []), { op: 'above', value: '', look: 'red', ...(valueless ? { of: { slot: '' } } : {}) }];
      }, { preview: false }));
      add.disabled = (p.rules || []).length >= MAX_RULES;
      body.append(add, el('p', 'wd-hint', t(valueless ? 'builderRulesOtherHint' : 'builderRulesHint')));
    }

    function flowTab(body, p) {
      const name = `${b.design.name} · ${partTitle(p)}`;
      body.append(el('p', 'wd-hint', t('builderFlowHint', { name })));
      if (p.kind === 'flowvalue') body.append(el('p', 'wd-hint', t('builderFlowValueAlways')));
      for (const prop of flowPropsOf(p.kind)) {
        const on = p.flow && p.flow[prop] === true;
        const sw = el('input', 'wd-switch');
        sw.type = 'checkbox';
        sw.checked = on;
        sw.addEventListener('change', () => change(() => {
          const next = { ...(p.flow || {}) };
          if (sw.checked) next[prop] = true; else delete next[prop];
          p.flow = next;
        }, { preview: false }));
        const r = el('label', 'wdb-flowrow');
        r.append(el('span', 'wdb-label', t(`builderFlow_${prop}`)), sw, el('span', 'wd-hint', t(`builderFlowCard_${prop}`, { name })));
        body.append(r);
      }
      body.append(row(t('builderReset'), segs([['never', t('builderResetNever')], ['hour', t('builderResetHour')], ['midnight', t('builderResetMidnight')]], p.reset || 'never', v => change(() => { p.reset = v; }, { preview: false })), t('builderResetHint')));
      if (p.kind === 'button' && !p.flowId) body.append(el('p', 'wd-hint', t('builderTapHint', { name })));
    }

    // Leaving the builder sends what waits; a design another browser changed is drawn again on the front page.
    window.addEventListener('pagehide', () => { if (b && b.saveTimer) save(); });

    Object.assign(wd, { designsSection, renderBuilder, flushBuilder: flush });
  });
})();
