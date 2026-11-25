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
    const { button, confirmButton, el, failed, icon, request, root, storageGet, storageSet, t, THEME_STORAGE, toast } = wd;

    const GRID = { cols: 4, row: 64, gap: 8 };
    const FINE = { cols: 12, row: 8, gap: 6 };
    const MAX_RULES = 6;
    const MAX_CHOICES = 6;
    const SAVE_MS = 500;
    const PREVIEW_MS = 400;
    const SNAP = 2; // per cent: free-form parts snap to the others' edges and middles within this
    const WIDTHS = [300, 440];
    const COLUMN_GAP = 16; // the web dashboards' gap between columns (.wd-grid)

    /** The library: each kind, its group, the kit's icon and the size it gets at the top. */
    const KINDS = [
      ['sparkline', 'show', 'pulse', 4, 1], ['arc', 'show', 'gauge', 1, 1], ['bar', 'show', 'progress', 4, 1],
      ['switch', 'control', 'power', 2, 1], ['button', 'control', 'play', 2, 1], ['slider', 'control', 'slider', 4, 1],
      ['stepper', 'control', 'stepper', 4, 1], ['choice', 'control', 'radio', 4, 1], ['variable', 'control', 'variable', 4, 1],
      ['container', 'layout', 'group', 4, 3], ['text', 'layout', 'type', 4, 1], ['icon', 'layout', 'star', 1, 1],
      ['shape', 'layout', 'shapes', 4, 1], ['calc', 'show', 'calculator', 2, 1],
      ['image', 'layout', 'picture', 2, 2], ['ring', 'show', 'ring', 2, 2], ['repeat', 'show', 'list', 4, 2],
      ['state', 'control', 'bookmark', 2, 1], ['segments', 'show', 'segments', 4, 2], ['chart', 'show', 'chart', 4, 2],
      ['each', 'layout', 'stack', 4, 2],
    ].map(([kind, group, glyph, w, h]) => ({ kind, group, glyph, w, h }));
    /** A kind's icon; a linked ready-made (`use`, not in the library) has its own. */
    const glyphOf = kind => (kind === 'use' ? 'link' : (KINDS.find(k => k.kind === kind) || {}).glyph || 'star');
    /**
     * The builder's own icons for what the kit's (home and device icons, also every icon setting's list) has none
     * for: drawn here, or from Lucide (ISC, widgets/spacer/public/icons.LICENSE.txt) as one path. Not in the kit, so
     * they don't show up in the widgets' icon pickers.
     */
    const BUILDER_ICONS = {
      slider: 'M2 12h6M16 12h6M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0z',
      ring: 'M12 2a10 10 0 1 1-10 10M12 7a5 5 0 1 1-5 5',
      segments: 'M2 8h5v8H2zM9.5 8h5v8h-5zM17 8h5v8h-5z',
      progress: 'M5 8h14a4 4 0 0 1 0 8H5a4 4 0 0 1 0-8zM6 12h7',
      stepper: 'M2 12h8M14 12h8M18 8v8',
      type: 'M12 4v16M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2M9 20h6',
      shapes: 'M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1ZM4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1zM14 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0z',
      calculator: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM8 6h8M16 14v4M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01',
      radio: 'M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0zM2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0z',
      variable: 'M8 21s-4-3-4-9 4-9 4-9M16 3s4 3 4 9-4 9-4 9M15 9l-6 6M9 9l6 6',
      group: 'M3 7V5c0-1.1.9-2 2-2h2M17 3h2c1.1 0 2 .9 2 2v2M21 17v2c0 1.1-.9 2-2 2h-2M7 21H5c-1.1 0-2-.9-2-2v-2M8 7h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM11 12h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z',
      picture: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0zM21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21',
      stack: 'M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2M16 14h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z',
      link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
      pulse: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2',
      trend: 'M16 7h6v6M22 7l-8.5 8.5-5-5L2 17',
    };
    const GROUPS = ['ready', 'layout', 'show', 'control'];

    /**
     * Ready-made: the tiles that used to be components of their own (Value, Mini chart, Gauge …), put together from
     * primitives in a free-form container (per cent of its box). `value`: the device value it asks for first, bound to
     * every part (the label is the device's name, the value its reading).
     */
    const READY = [
      { id: 'value', glyph: 'thermometer', w: 2, h: 1, value: true },
      { id: 'value2', glyph: 'thermometer', w: 2, h: 1, value: true, second: true },
      { id: 'chart', glyph: 'chart', w: 2, h: 1, value: true },
      { id: 'gauge', glyph: 'gauge', w: 2, h: 2, value: true },
      { id: 'level', glyph: 'battery', w: 2, h: 1, value: true },
      { id: 'status', glyph: 'shieldcheck', w: 2, h: 1, value: true },
      { id: 'slider', glyph: 'slider', w: 4, h: 1, value: true },
      { id: 'trend', glyph: 'trend', w: 2, h: 1, value: true },
      { id: 'clock', glyph: 'clock', w: 2, h: 1 },
      { id: 'flowvalue', glyph: 'bolt', w: 2, h: 1 },
    ];
    const at = (x, y, w, h) => ({ x, y, w, h });
    /**
     * A ready-made tile's parts, for `slot` (a device value) where it needs one, with the looks of the normal widgets:
     * Device Values' tile (the icon and the value 14 bold on its top row, the name 14 bold under it, a second value 14
     * muted at its end), Sparklines' tile, Chart · Gauge's dial (its number 32 bold, the units 17), a 6 px level bar,
     * Light Controls' tile (the icon and name over the bar), Notes' Default text for a Flow's value.
     */
    function readyParts(id, slot, second) {
      /** @returns {any} */
      const base = (kind, place, o = {}) => ({ id: partId(), kind, name: '', color: null, icon: null, style: 'none', rules: [], flow: {}, reset: 'never', at: place, ...o });
      const value = (place, o = {}) => base('text', place, { text: '{1}', refs: [{ slot }], size: 'small', weight: 'bold', align: 'right', ...o });
      const label = (place, o = {}) => base('text', place, { text: '{1}', refs: [{ slot, show: 'name' }], size: 'small', weight: 'bold', align: 'left', overflow: 'ellipsis', ...o });
      // Device Values' compact tile: a 20 px row of the icon and the value, then the name's row.
      const low = at(0, 58, 100, 42);
      switch (id) {
        case 'value': return [base('icon', at(0, 0, 14, 42), { slot }), value(at(16, 0, 84, 42)), label(low)];
        case 'value2': return [
          base('icon', at(0, 0, 14, 42), { slot }), value(at(16, 0, 84, 42)), label(at(0, 58, 62, 42)),
          base('text', at(62, 58, 38, 42), { text: '{1}', refs: [{ slot: second || slot }], size: 'small', align: 'right', muted: true, overflow: 'ellipsis' }),
        ];
        case 'chart': return [base('icon', at(0, 0, 14, 42), { slot }), label(at(16, 0, 44, 42)), value(at(60, 0, 40, 42)), base('sparkline', at(0, 50, 100, 50), { slot, span: '24h' })];
        case 'gauge': return [
          base('arc', at(0, 0, 100, 82), { src: { slot } }),
          value(at(0, 32, 100, 28), { size: 'large', weight: undefined, align: 'center' }),
          label(at(0, 82, 100, 18), { align: 'center', weight: undefined }),
        ];
        case 'level': return [label(at(0, 0, 60, 50)), value(at(60, 0, 40, 50)), base('bar', at(0, 60, 100, 40), { src: { slot } })];
        case 'status': return [
          base('shape', at(0, 30, 8, 40), { shape: 'circle', background: { kind: 'none' }, opacity: 100, rules: [{ op: 'is', value: 'on', look: 'green', of: { slot } }] }),
          label(at(12, 0, 88, 100)),
        ];
        // Light Controls' tile: the icon, the name and its value over the bar.
        case 'slider': return [
          base('icon', at(0, 0, 7, 46), { slot }), label(at(9, 0, 66, 46)), value(at(75, 0, 25, 46), { weight: undefined }),
          base('slider', at(0, 50, 100, 50), { slot }),
        ];
        case 'trend': {
          const calc = base('calc', at(86, 0, 14, 25), { inputs: [{ slot }], op: 'change', span: '24h', units: '' });
          const of = { part: calc.id };
          return [
            calc,
            base('icon', at(0, 0, 14, 42), { icon: 'right', rules: [{ op: 'above', value: '0', look: 'same', icon: 'up', of }, { op: 'below', value: '0', look: 'same', icon: 'down', of }] }),
            base('text', at(16, 0, 84, 42), { text: '{1}', refs: [of], size: 'small', weight: 'bold', align: 'right' }),
            base('text', at(0, 58, 100, 42), { text: '{1} · {2}', refs: [{ slot, show: 'name' }, { slot }], size: 'small', weight: 'bold', align: 'left', overflow: 'ellipsis' }),
          ];
        }
        case 'clock': return [base('text', at(0, 0, 100, 100), { text: '{1}', refs: [{ time: 'clock' }], size: 'display', align: 'center' })];
        case 'flowvalue': return [
          base('icon', at(0, 0, 14, 42), { icon: 'bolt' }),
          base('text', at(16, 0, 84, 42), { text: '–', size: 'small', weight: 'bold', align: 'right', flow: { value: true, text: true } }),
          base('text', low, { text: t('builderReady_flowvalue'), size: 'small', weight: 'bold', overflow: 'ellipsis' }),
        ];
        default: return [];
      }
    }
    const SLOT_KINDS = ['switch', 'slider', 'stepper', 'choice', 'sparkline'];
    /** lib/customDesigns.ts' TEXT_KINDS: the kinds with a text colour. */
    const TEXT_KINDS = ['text', 'switch', 'button', 'state', 'stepper', 'choice', 'variable', 'ring', 'segments', 'repeat', 'chart', 'container'];
    /** The kinds whose own colour accents them (an icon, a toggle, a bar, a line); a shape's is its fill. */
    const ACCENT_KINDS = ['switch', 'button', 'state', 'slider', 'stepper', 'choice', 'variable', 'icon', 'sparkline', 'arc', 'bar', 'ring', 'segments', 'repeat', 'chart', 'image'];
    const MAX_SERIES = 3;
    const MAX_EACH = 12;
    const MAX_SPAN = 3;
    const VARIABLE_KINDS = ['slider', 'stepper', 'choice', 'variable'];
    const RANGE_KINDS = ['arc', 'bar', 'sparkline', 'slider', 'stepper', 'variable'];
    /** The charts' time span units (scripts/chart-settings.json's `span`), as the kit's span ids write them. */
    const SPAN_UNITS = [['minutes', 'm'], ['hours', 'h'], ['days', 'd'], ['weeks', 'w'], ['months', 'mo'], ['years', 'y'], ['calDays', 'd!'], ['calWeeks', 'w!'], ['calMonths', 'mo!'], ['calYears', 'y!']];
    const SPAN_LETTER = { minute: 'm', hour: 'h', day: 'd', week: 'w', month: 'mo', year: 'y' };
    const RULE_OPS = ['above', 'below', 'between', 'is', 'isNot'];
    const CALC_OPS = ['sum', 'avg', 'min', 'max', 'diff', 'count', 'formula', 'change', 'since'];
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
    const MAX_SEGMENTS = 6;
    /** lib/customDesigns.ts' ELEMENTS and TAP_KINDS: the parts that can be turned off, and the kinds a tap can act on. */
    const ELEMENTS = {
      switch: ['icon', 'name'], stepper: ['name'], choice: ['name'], variable: ['name'],
      ring: ['name', 'value'], segments: ['name', 'value'], button: ['icon', 'name'], state: ['icon', 'name'],
    };
    /** Kinds whose name, left empty, is their device's, variable's or Flow's. */
    const NAMED_KINDS = [...new Set([...SLOT_KINDS, ...VARIABLE_KINDS, 'button'])];
    const TAP_KINDS = ['container', 'text', 'icon', 'shape', 'image', 'ring', 'segments', 'sparkline', 'arc', 'bar', 'chart'];
    /** lib/customDesigns.ts' ICON_KINDS: the kinds that draw an icon (a Ring only with one in its middle). */
    const ICON_KINDS = ['switch', 'button', 'state', 'ring', 'icon'];
    const drawsIcon = p => ICON_KINDS.includes(p.kind) && (p.kind !== 'ring' || p.center === 'icon');
    /** What a Flow may change, per kind (lib/customDesigns.ts takes any; these are the ones that show on it). */
    const FLOW_PROPS = {
      text: ['text', 'value', 'color', 'hidden'], icon: ['icon', 'color', 'hidden'], container: ['hidden'],
      shape: ['color', 'hidden'], sparkline: ['color', 'hidden'], arc: ['color', 'hidden'], bar: ['color', 'hidden'], slider: ['color', 'hidden'],
      calc: [], stepper: ['text', 'value', 'color', 'hidden'], choice: ['text', 'value', 'color', 'hidden'], variable: ['text', 'value', 'color', 'hidden'],
      state: ['text', 'color', 'hidden'], image: ['hidden'], ring: ['text', 'color', 'icon', 'hidden'], repeat: ['text', 'color', 'hidden'],
      segments: ['text', 'color', 'hidden'], chart: ['text', 'color', 'hidden'], each: ['hidden'],
    };
    const flowPropsOf = kind => FLOW_PROPS[kind] || ['text', 'value', 'color', 'icon', 'hidden'];

    /** A colour's name in Homey's language: Dashboard Shortcuts' colour setting lists every one (the manifests are translated). */
    function colourName(id) {
      const def = wd.types && wd.types.get('shortcuts');
      const s = def && (def.settings || []).find(x => x.id === 'color1');
      const v = s && (s.values || []).find(x => x.id === id);
      return (v && v.title) || id;
    }

    /** A widget setting's title in Homey's language (the manifests are translated), or null. */
    function settingTitle(type, id) {
      const def = wd.types && wd.types.get(type);
      const s = def && (def.settings || []).find(x => x.id === id);
      return (s && s.title) || null;
    }

    /** The builder now: the design being built, the selection, the view's choices, undo, the preview. */
    let b = null;
    /**
     * The web dashboard columns the design is shown over (the preview's width, and Add to dashboard's), and its grid's
     * columns: always 4, as a design is made for one column and stretches over more as a normal widget does (the user,
     * 2026-11-24: no widget is wider than one column by design, so it fits a Homey dashboard too).
     */
    const spanOf = () => Math.min(MAX_SPAN, Math.max(1, Number(b.design.span) || 1));
    const cols = () => GRID.cols;
    /**
     * A new span: the same design over more columns, stretched. A view of it, as the column width and colour style
     * are, so no Undo step, and Undo and Redo keep it (restore(); the user, 2026-11-25).
     */
    function setSpan(n) {
      change(() => { if (n > 1) b.design.span = n; else delete b.design.span; }, { preview: false, undo: false });
      sizeCanvas();
    }

    const strings = () => (wd.setup && wd.setup.strings) || {};
    const kindName = kind => (strings().custom && strings().custom.kinds && strings().custom.kinds[kind]) || kind;
    const designs = () => wd.designs || (wd.designs = (wd.setup && wd.setup.designs) || []);
    const clone = x => JSON.parse(JSON.stringify(x));
    const partId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    const kitIcon = (id, cls) => {
      const def = BUILDER_ICONS[id] ? { d: BUILDER_ICONS[id] } : window.WidgetkeeperKit.icons[id];
      return def ? window.WidgetkeeperKit.svgIcon(def, cls) : el('span', cls);
    };

    // ---- The Widget Builder's own page, and the front page's banner ---------------------------------------------

    const PROMO_STORAGE = 'widgetkeeper.web.builderPromo';

    /** The front page's banner for the Widget Builder, until it's put away in this browser (null then). */
    function builderPromo() {
      if (storageGet(PROMO_STORAGE) === 'hidden') return null;
      const box = el('section', 'wdb-promo');
      const art = el('span', 'wdb-promo-art');
      art.append(kitIcon('sparkles', 'wdb-promo-icon'));
      const text = el('div', 'wdb-promo-text');
      text.append(el('strong', null, t('builderPromoTitle')), el('span', null, t('builderPromoText')));
      const open = el('a', 'wd-btn primary', t('builderPromoOpen'));
      open.href = '#/builder';
      const close = button('wd-icon small wdb-promo-close', '', () => { storageSet(PROMO_STORAGE, 'hidden'); box.remove(); }, t('builderPromoHide'));
      close.append(icon('close'));
      box.append(art, text, open, close);
      return box;
    }

    /**
     * `#/builder`: every design as a card (a sketch of its grid) to open in the builder, New design, and the ready-made
     * components of your own under them.
     */
    function renderBuilderHome() {
      wd.clearRoot();
      wd.applyTheme('auto');
      const page = el('div', 'wd-home wdb-home');
      const head = el('div', 'wd-section-head');
      const titles = el('div', 'wd-section-titles');
      titles.append(el('h1', 'wd-h1', t('builderTitle')), el('p', 'wd-muted', t('builderHomeHint')));
      head.append(titles);
      const grid = el('div', 'wd-dashboards wdb-cards');
      for (const d of designs().filter(x => !x.ready)) grid.append(designCard(d));
      const add = button('wd-dash wd-dash-new', '', () => newDesign(add));
      const plus = el('span', 'wd-dash-plus');
      plus.append(icon('plus'));
      add.append(plus, el('span', 'wd-dash-new-text', t('builderNew')));
      grid.append(add);
      page.append(head, grid);
      const ready = designs().filter(x => x.ready);
      if (ready.length) {
        page.append(el('h2', 'wd-group-title', t('builderGroup_mine')), el('p', 'wd-muted wdb-home-note', t('builderMineHint')));
        const mine = el('div', 'wd-dashboards wdb-cards');
        for (const d of ready) mine.append(designCard(d));
        page.append(mine);
      }
      const node = wd.bar(wd.navButton(), wd.brand(), el('span', 'wd-spacer'));
      node.classList.add('wd-bar-front');
      root.append(node, page);
      wd.showNav();
    }

    /** A design's card: a sketch of its grid, its name and how many components. */
    function designCard(d) {
      const card = el('div', 'wd-dash wdb-card');
      card.append(designArt(d));
      const link = el('a', 'wd-dash-link');
      link.href = `#/builder/${d.id}`;
      const info = el('span', 'wd-dash-info');
      const count = d.parts.reduce((n, p) => n + 1 + (p.parts ? p.parts.length : 0), 0);
      info.append(el('span', 'wd-dash-name', d.name || t('untitled')), el('span', 'wd-muted wd-dash-count', t('builderPartCount', { count })));
      link.append(info);
      card.append(link);
      return card;
    }

    /** A sketch of a design's grid (its first six rows): a block per part, a container in its background. */
    function designArt(d, cls = 'wd-dash-art wdb-art') {
      const art = el('div', cls);
      art.style.gridTemplateColumns = 'repeat(4, 1fr)';
      const rows = Math.max(2, ...d.parts.map(p => p.at.y + p.at.h));
      art.style.setProperty('--rows', String(Math.min(rows, 6)));
      for (const p of d.parts) {
        if (p.at.y >= 6) continue;
        const cell = el('span', `wdb-thumb wdb-thumb-${p.kind}`);
        cell.style.gridColumn = `${p.at.x + 1} / span ${p.at.w}`;
        cell.style.gridRow = `${p.at.y + 1} / span ${Math.min(p.at.h, 6 - p.at.y)}`;
        if (p.kind === 'container' && p.background && p.background.kind !== 'none') {
          const css = c => (/^#/.test(c) ? c : `var(--wk-${c}-bright, ${c})`);
          cell.style.background = p.background.kind === 'color' ? css(p.background.from) : `linear-gradient(${p.background.angle}deg, ${css(p.background.from)}, ${css(p.background.to)})`;
        }
        art.append(cell);
      }
      art.classList.add('wk');
      livePreview(art, d);
      return art;
    }

    // ---- The cards' live previews: the real widget, drawn small over the sketch once it's in view ------------------

    const LIVE_WIDTH = WIDTHS[0]; // a column's width the miniature is drawn at, then scaled to the card
    const liveStates = new Map(); // `<id>:<updatedAt>` → the preview's answer (a promise), for this page's life
    let liveSeen = null;

    /** The design's widget in a frame over its sketch, once the card scrolls into view; the sketch stays if it fails. */
    function livePreview(art, d) {
      if (typeof IntersectionObserver !== 'function' || !d.parts.length) return;
      if (!liveSeen) {
        liveSeen = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            liveSeen.unobserve(e.target);
            const go = /** @type {any} */ (e.target).wdbLive;
            if (go) go();
          }
        }, { rootMargin: '200px' });
      }
      /** @type {any} */ (art).wdbLive = () => startLive(art, d);
      liveSeen.observe(art);
    }

    function liveState(d) {
      const key = `${d.id}:${d.updatedAt || ''}`;
      if (!liveStates.has(key)) {
        const p = request('POST', '/web/designs/preview', { design: d });
        p.catch(() => liveStates.delete(key));
        liveStates.set(key, p);
      }
      return liveStates.get(key);
    }

    function startLive(art, d) {
      const span = Math.min(MAX_SPAN, Math.max(1, Number(d.span) || 1));
      const width = LIVE_WIDTH * span + COLUMN_GAP * (span - 1);
      const frame = /** @type {HTMLIFrameElement} */ (el('iframe', 'wdb-live'));
      frame.title = d.name || t('untitled');
      frame.tabIndex = -1;
      frame.setAttribute('scrolling', 'no');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.width = `${width}px`;
      frame.style.height = '1200px';
      let height = 0;
      const fit = () => {
        if (!height || !art.isConnected) return;
        const cs = getComputedStyle(art);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const boxW = art.clientWidth - padX;
        const boxH = art.clientHeight - padY;
        if (boxW <= 0 || boxH <= 0) return;
        // Whole where it fits; a tall design at no less than 70 % of the card's width, its foot faded out.
        const fitW = boxW / width;
        const scale = Math.min(1, fitW, Math.max(boxH / height, fitW * 0.7));
        const left = parseFloat(cs.paddingLeft) + (boxW - width * scale) / 2;
        const shown = height * scale;
        const top = parseFloat(cs.paddingTop) + Math.max(0, (boxH - shown) / 2);
        frame.style.height = `${height}px`;
        frame.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
        art.classList.toggle('wdb-art-cut', shown > boxH + 1);
      };
      const measure = (doc) => {
        const root = doc.getElementById('root');
        const h = Math.ceil(root ? root.getBoundingClientRect().height : doc.body.scrollHeight);
        if (h > 0 && h !== height) { height = h; fit(); }
      };
      frame.addEventListener('load', async () => {
        const win = /** @type {any} */ (frame.contentWindow);
        if (!win || !win.createCustomWidget) return;
        const doc = win.document;
        doc.documentElement.classList.toggle('homey-dark-mode', wd.isDark());
        doc.documentElement.style.overflow = 'hidden';
        const lookup = key => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), strings());
        let widget;
        try {
          widget = win.createCustomWidget(doc.getElementById('root'), {
            t: key => lookup(key) || key,
            colorStyle: 'soft',
            preview: true,
            onHeight: () => queueMicrotask(() => measure(doc)),
            onImage: part => request('POST', '/web/designs/image', { device: part.image.device }),
          });
          const state = await liveState(d);
          if (!art.isConnected) return;
          widget.setState({ ...state, design: { ...bindSample(d), updatedAt: d.updatedAt || 1 } });
        } catch (err) {
          console.error(err);
          frame.remove();
          return;
        }
        measure(doc);
        if (!height) { frame.remove(); return; }
        art.classList.add('wdb-art-live');
        if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(art);
      });
      frame.srcdoc = frameDoc();
      art.append(frame);
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
        query: '', undo: [], redo: [], state: null, rev: 1, saveTimer: null, previewTimer: null, status: 'saved', node: null,
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
      back.href = '#/builder';
      back.title = t('builderTitle');
      back.setAttribute('aria-label', t('builderTitle'));
      back.append(icon('left'));
      const name = el('input', 'wd-input wd-title-input wdb-name');
      name.value = b.design.name;
      name.setAttribute('aria-label', t('builderName'));
      name.addEventListener('change', () => change(() => { b.design.name = name.value.trim().slice(0, 40) || t('builderUntitled'); }, { preview: false }));
      const status = el('span', 'wd-muted wdb-status', t('builderSaved'));
      status.setAttribute('role', 'status');
      b.statusNode = status;
      // Undo and Redo as icons, their names as tooltips (Ctrl or ⌘ with Z, Shift+Z), so the bar fits a phone.
      const undo = button('wd-icon', '', () => undoChange(), t('undo'));
      undo.append(icon('undo'));
      undo.disabled = true;
      b.undoNode = undo;
      const redo = button('wd-icon', '', () => redoChange(), t('redo'));
      redo.append(icon('redo'));
      redo.disabled = true;
      b.redoNode = redo;
      const copy = button('wd-icon', '', () => duplicateDesign(), t('duplicate'));
      copy.append(icon('copy'));
      const remove = confirmButton('wd-icon wd-bar-delete', icon('trash'), () => deleteDesign(), t('tapAgain'), t('builderDelete'));
      const place = button('wd-btn', '', () => addToDashboard(), t('builderAddTo'));
      place.append(icon('plus'), el('span', 'wd-bar-label', t('builderAddTo')));
      const done = el('a', 'wd-btn primary', t('done'));
      done.href = '#/builder';
      done.addEventListener('click', async (e) => { e.preventDefault(); await flush(); wd.leaveEditor('#/builder'); });
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
      end.append(status, mode, undo, redo, copy, remove, place, done);
      const node = wd.bar(back, name, el('span', 'wd-spacer'), end);
      node.classList.add('wdb-bar');
      return node;
    }

    // ---- The library: parts to add, and Layers ---------------------------------------------------------------------

    function library() {
      const lib = el('aside', 'wdb-lib');
      const tabs = el('div', 'wdb-tabs');
      tabs.setAttribute('role', 'tablist');
      for (const [id, label] of [['parts', t('builderParts')], ['ready', t('builderGroup_ready')], ['layers', t('builderLayers')]]) {
        const tb = button(`wdb-tab${b.libTab === id ? ' on' : ''}`, label, () => { b.libTab = id; redrawLibrary(); });
        tb.setAttribute('role', 'tab');
        tb.setAttribute('aria-selected', String(b.libTab === id));
        tabs.append(tb);
      }
      const body = el('div', 'wdb-lib-body');
      lib.append(tabs, body);
      b.libNode = lib;
      if (b.libTab === 'layers') drawLayers(body);
      else drawParts(body, b.libTab === 'ready');
      return lib;
    }

    function redrawLibrary() {
      const old = b.libNode;
      old.replaceWith(library());
    }

    /** The library's Components tab, or with `ready` its Ready-made tab: your own ready-mades, then the built-in ones. */
    function drawParts(body, ready) {
      const search = el('input', 'wd-input');
      search.type = 'search';
      search.placeholder = t('builderSearch');
      search.value = b.query;
      const list = el('div', 'wdb-groups');
      const draw = () => {
        list.textContent = '';
        const q = b.query.trim();
        for (const group of GROUPS) {
          if ((group === 'ready') !== ready) continue;
          if (group === 'ready') {
            // Your own first (designs saved as ready-made components), then the built-in ones.
            const mine = designs().filter(d => d.ready && d.parts[0] && d.id !== b.design.id && (!q || wd.matchesWords(q, `${d.name} ${t('builderGroup_mine')}`)));
            if (mine.length) {
              list.append(el('h3', 'wdb-h3', t('builderGroup_mine')));
              const grid = el('div', 'wdb-comps');
              for (const d of mine) {
                const c = button('wdb-comp wdb-mine', '', () => { if (!c.dataset.dragged) addMine(d); delete c.dataset.dragged; }, t('builderAdd', { name: d.name }));
                const glyph = glyphOf(d.parts[0].kind);
                c.append(kitIcon(glyph, 'wdb-comp-icon'), el('span', null, d.name || t('untitled')));
                dragToAdd(c, { glyph, label: d.name, size: sizeOfPart(d.parts[0]), container: d.parts[0].kind === 'container', drop: target => addMine(d, target) });
                const line = el('div', 'wdb-mine-line');
                const del = confirmButton('wd-icon wdb-mine-delete', icon('trash'), () => deleteReady(d), t('tapAgain'), t('builderDeleteReady', { name: d.name || t('untitled') }));
                line.append(c, del);
                grid.append(line);
              }
              list.append(grid);
            }
            const builtIn = READY.filter(r => !q || wd.matchesWords(q, `${t(`builderReady_${r.id}`)} ${t('builderGroup_ready')}`));
            if (!builtIn.length) continue;
            if (list.firstChild) list.append(el('h3', 'wdb-h3', t('builderGroup_ready')));
            const grid = el('div', 'wdb-comps');
            for (const r of builtIn) {
              const c = button('wdb-comp', '', () => { if (!c.dataset.dragged) addReady(r); delete c.dataset.dragged; }, t('builderAdd', { name: t(`builderReady_${r.id}`) }));
              c.append(kitIcon(r.glyph, 'wdb-comp-icon'), el('span', null, t(`builderReady_${r.id}`)));
              dragToAdd(c, { glyph: r.glyph, label: t(`builderReady_${r.id}`), size: { w: r.w, h: r.h }, container: true, drop: target => addReady(r, target) });
              grid.append(c);
            }
            list.append(grid);
            continue;
          }
          const items = KINDS.filter(k => k.group === group && (!q || wd.matchesWords(q, `${kindName(k.kind)} ${t(`builderGroup_${group}`)}`)));
          if (!items.length) continue;
          list.append(el('h3', 'wdb-h3', t(`builderGroup_${group}`)));
          const grid = el('div', 'wdb-comps');
          for (const k of items) {
            const c = button('wdb-comp', '', () => { if (!c.dataset.dragged) addPart(k.kind); delete c.dataset.dragged; }, t('builderAdd', { name: kindName(k.kind) }));
            c.append(kitIcon(k.glyph, 'wdb-comp-icon'), el('span', null, kindName(k.kind)));
            dragToAdd(c, { glyph: k.glyph, label: kindName(k.kind), size: { w: k.w, h: k.h }, container: k.kind === 'container', drop: target => addPart(k.kind, target) });
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
    function dragToAdd(node, what) {
      node.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        const start = { x: e.clientX, y: e.clientY };
        let ghost = null;
        let target = null;
        node.setPointerCapture(e.pointerId);
        const move = (ev) => {
          if (!ghost && Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) < 6) return;
          if (!ghost) {
            ghost = el('div', 'wdb-ghost');
            ghost.append(kitIcon(what.glyph, 'wdb-comp-icon'), el('span', null, what.label));
            document.body.append(ghost);
            node.dataset.dragged = '1';
          }
          ghost.style.left = `${ev.clientX + 8}px`;
          ghost.style.top = `${ev.clientY + 8}px`;
          const over = overCanvas(ev.clientX, ev.clientY);
          b.canvas.classList.toggle('dropping', over);
          // The cell (or the place in a container) it lands on, at its size there.
          target = over ? dropTarget(what.container ? 'container' : 'part', ev.clientX, ev.clientY) : null;
          showCell(target && { ...target, ...sizeIn(what.size, target.into) });
        };
        const up = (ev) => {
          node.removeEventListener('pointermove', move);
          node.removeEventListener('pointerup', up);
          node.removeEventListener('pointercancel', up);
          node.removeEventListener('lostpointercapture', up);
          showCell(null);
          if (!ghost) return;
          ghost.remove();
          b.canvas.classList.remove('dropping');
          if (ev.type === 'pointerup' && target) what.drop(target);
          // The click that follows a drag isn't a tap.
          setTimeout(() => { delete node.dataset.dragged; }, 0);
        };
        node.addEventListener('pointermove', move);
        node.addEventListener('pointerup', up);
        node.addEventListener('pointercancel', up);
        // A capture lost without a pointerup (the window left mid-drag) ends it too, or the ghost would stay.
        node.addEventListener('lostpointercapture', up);
      });
    }

    /** A size in top-grid cells (`{w, h}`) as it is in a container (`into`): fine-grid cells, or per cent free-form. */
    function sizeIn(size, into) {
      if (!into) return { w: Math.min(size.w, cols()), h: size.h };
      if (into.mode === 'free') return { w: Math.min(48, size.w * 24), h: 30 };
      return { w: Math.min(FINE.cols, size.w * 3), h: size.h * 8 };
    }

    /** A top-level part's size in top-grid cells, for a ready-made of your own. */
    const sizeOfPart = part => ({ w: Math.max(1, part.at.w), h: Math.max(1, part.at.h) });

    /** Highlights where a drag lands: `{into, x, y, w, h}` on its grid (or per cent), or null for none. */
    function showCell(cell) {
      b.cell = cell;
      const old = b.overlay.querySelector('.wdb-cell');
      if (old) old.remove();
      if (!cell) return;
      const r = cellRect(cell);
      if (!r) return;
      const n = el('div', 'wdb-cell');
      Object.assign(n.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      b.overlay.append(n);
    }

    /** A place's box in the overlay: top-grid cells, a container's fine-grid cells, or per cent of its inner box. */
    function cellRect({ into, x, y, w, h }) {
      if (!into) {
        const g = gridOf(null);
        const cx = clamp(x, 0, cols() - w);
        return { left: cx * g.colW, top: Math.max(0, y) * g.rowH, width: w * g.colW - GRID.gap, height: h * g.rowH - GRID.gap };
      }
      const inner = nodeOf(into.id) && nodeOf(into.id).querySelector('.wb-inner');
      if (!inner) return null;
      const r = inner.getBoundingClientRect();
      if (into.mode === 'free') {
        const cx = clamp(x, 0, 100 - w);
        const cy = clamp(y, 0, 100 - h);
        return { left: r.left + (cx / 100) * r.width, top: r.top + (cy / 100) * r.height, width: (w / 100) * r.width, height: (h / 100) * r.height };
      }
      const g = gridOf(into);
      const cx = clamp(x, 0, FINE.cols - w);
      return { left: r.left + cx * g.colW, top: r.top + Math.max(0, y) * g.rowH, width: w * g.colW - FINE.gap, height: h * g.rowH };
    }

    function overCanvas(x, y) {
      const r = b.canvas.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom + GRID.row;
    }

    /** Where a drop at a point goes: the container under it (not for a container) and the cell or per cent there. */
    function dropTarget(kind, x, y, boxes = null) {
      const c = b.canvas.getBoundingClientRect();
      const fx = x - c.left;
      const fy = y - c.top;
      if (kind !== 'container') {
        // The last drawn (on top) first.
        for (const box of b.design.parts.filter(p => p.kind === 'container').reverse()) {
          const r = boxes ? boxes.get(box.id) : innerRect(box.id);
          if (!r) continue;
          if (fx < r.left || fx > r.right || fy < r.top || fy > r.bottom) continue;
          const px = fx - r.left;
          const py = fy - r.top;
          if (box.mode === 'free') return { into: box, x: (px / r.width) * 100, y: (py / r.height) * 100, px, py };
          const g = gridOf(box);
          return { into: box, x: Math.floor(px / g.colW), y: Math.floor(py / g.rowH), px, py };
        }
      }
      const g = gridOf(null);
      return { into: null, x: Math.floor(fx / g.colW), y: Math.floor(fy / g.rowH), px: fx, py: fy };
    }

    /**
     * Where a component of `size` (top-grid cells) lands at a drop target, held at `grab` (0–1 across and down its box):
     * that point of its new box under the pointer, snapped to the target's grid (per cent free-form).
     */
    function landAt(target, size, grab) {
      const s = sizeIn(size, target.into);
      const g = gridOf(target.into);
      if (g.mode === 'free') {
        return { into: target.into, ...s, x: clamp(target.x - grab.x * s.w, 0, 100 - s.w), y: clamp(target.y - grab.y * s.h, 0, 100 - s.h) };
      }
      const x = Math.round((target.px - grab.x * (s.w * g.colW)) / g.colW);
      const y = Math.round((target.py - grab.y * (s.h * g.rowH)) / g.rowH);
      return { into: target.into, ...s, x: clamp(x, 0, g.cols - s.w), y: Math.max(0, y) };
    }

    /** A container's inner box in the frame's coordinates (the overlay's), or null. */
    function innerRect(id) {
      const inner = nodeOf(id) && nodeOf(id).querySelector('.wb-inner');
      return inner ? inner.getBoundingClientRect() : null;
    }

    /** Every top-level container's inner box now: where a drag looks for one to drop into (see startDrag()). */
    function containerRects() {
      const m = new Map();
      for (const box of b.design.parts) if (box.kind === 'container') { const r = innerRect(box.id); if (r) m.set(box.id, r); }
      return m;
    }

    function drawLayers(body) {
      const list = el('div', 'wdb-layers');
      // Shown front first, as design tools list layers: the parts are drawn in their saved order, the last on top,
      // so the list runs backwards through it and ↑ moves a part later (forward).
      const row = (p, depth, siblings, i) => {
        const r = el('div', `wdb-layer${b.selected === p.id ? ' on' : ''}${depth ? ' in' : ''}`);
        const pick = button('wdb-layer-pick', '', () => select(p.id));
        pick.append(kitIcon(glyphOf(p.kind), 'wdb-layer-icon'), el('span', null, partTitle(p)));
        if (Object.keys(p.flow || {}).length) pick.append(el('span', 'wdb-flowmark', '⚡'));
        const up = button('wd-icon small', '', () => change(() => { siblings.splice(i + 1, 0, siblings.splice(i, 1)[0]); }), t('moveUp'));
        up.append(icon('up'));
        up.disabled = i === siblings.length - 1;
        const down = button('wd-icon small', '', () => change(() => { siblings.splice(i - 1, 0, siblings.splice(i, 1)[0]); }), t('moveDown'));
        down.append(icon('down'));
        down.disabled = i === 0;
        r.append(pick, up, down);
        list.append(r);
        if (p.kind === 'container') frontFirst(p.parts || [], depth + 1);
      };
      const frontFirst = (siblings, depth) => { for (let i = siblings.length - 1; i >= 0; i--) row(siblings[i], depth, siblings, i); };
      frontFirst(b.design.parts, 0);
      if (!b.design.parts.length) list.append(el('p', 'wd-muted', t('builderEmpty')));
      body.append(list);
      // Only free-form parts can overlap: the grids push them apart.
      if (b.design.parts.some(p => p.kind === 'container' && p.mode === 'free')) body.append(el('p', 'wd-hint', t('builderLayersHint')));
    }

    function partTitle(p) {
      const source = p.kind === 'use' && !p.name ? sourceOf(p) : null;
      return p.name || (p.kind === 'text' && p.text ? textTitle(p) : '') || (source && source.name) || kindName(p.kind);
    }

    /** A text's title: as typed, or with values in it (`{1}`) as the preview shows it now (`22.4 °C`). */
    function textTitle(p) {
      const n = /\{\d+\}/.test(p.text) && b && b.frame && nodeOf(p.id);
      const shown = n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
      return (shown || p.text).slice(0, 30);
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
      // Each group under its name (the editor's Columns and Column width, the widgets' Colour style: no new strings).
      const group = (label, control) => {
        const g = el('div', 'wdb-toolgroup');
        g.append(el('span', 'wdb-toollabel', label), control);
        return g;
      };
      const spanSeg = seg([1, 2, 3].map(n => [n, t('builderSpanN', { n })]), spanOf(), (n) => setSpan(n));
      b.spanSeg = spanSeg;
      tools.append(
        // How many dashboard columns it's shown over (stretched), and a column's width here.
        group(t('columns'), spanSeg),
        group(t('columnWidth'), seg(WIDTHS.map(w => [w, `${w} px`]), b.width, (w) => { b.width = w; sizeCanvas(); })),
        group(settingTitle('values', 'colorStyle') || t('builderMuted'), seg([[false, t('builderMuted')], [true, t('builderVivid')]], b.vivid, (v) => { b.vivid = v; mountPreview(); })),
      );
      // A design that works with any device: which device the preview fills in.
      const sampleBox = el('div', 'wdb-sample');
      b.sampleNode = sampleBox;
      drawSample();
      tools.append(sampleBox);
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
      overlay.addEventListener('pointerdown', onOverlayDown);
      node.append(tools, canvas, el('p', 'wd-hint wdb-tip', t('builderTip')));
      frame.srcdoc = frameDoc();
      frame.addEventListener('load', () => mountPreview());
      sizeCanvas();
      return node;
    }

    /** The preview's device, shown while the design uses the widget's device anywhere. */
    function drawSample() {
      const box = b.sampleNode;
      if (!box) return;
      box.textContent = '';
      // Its own parts, or a linked ready-made without a device of its own whose ready-made uses it.
      box.hidden = !usesAnyDevice(b.design.parts) && !everyPart().some((p) => {
        const d = p.kind === 'use' && !p.device && sourceOf(p);
        return d && usesAnyDevice(d.parts);
      });
      if (box.hidden) return;
      const dev = (b.devices || []).find(d => d.id === b.design.sample);
      const pick = button('wd-btn small', '', async () => {
        try {
          const items = await request('GET', '/web/devices?type=custom');
          wd.chooseDevices({ devices: { singular: true } }, items, b.design.sample ? [b.design.sample] : [], (ids) => change(() => { if (ids[0]) b.design.sample = ids[0]; }));
        } catch (err) { failed(err); }
      }, t('builderSampleHint'));
      pick.append(icon('eye'), el('span', null, t('builderSample', { name: dev ? dev.name : t('builderNoSample') })));
      box.append(pick);
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
      // Keys pressed with the preview focused count as the page's.
      if (!win.wdbKeys) { win.wdbKeys = true; doc.addEventListener('keydown', onKey); }
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
      b.canvas.style.width = `${b.width * spanOf() + COLUMN_GAP * (spanOf() - 1)}px`;
      b.guide.style.gridTemplateColumns = `repeat(${cols()}, 1fr)`;
      drawOverlay();
    }

    /** The design as it is now, with the preview's values (read again a moment after a change that needs them). */
    function showPreview() {
      drawSample();
      if (!b.widget) return;
      const state = b.state || { values: {}, variables: {}, flows: {}, histories: {}, flow: {} };
      // The widget's device (`@:`) as the preview's device, as the app fills it in (lib/customDesigns.ts' bindDevice()).
      b.widget.setState({ ...state, design: { ...bindSample(b.design), updatedAt: b.rev } });
      fillShowsAs();
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

    /** A copy of the design with its `@:` values the preview device's. */
    function bindSample(design) {
      const dev = design.sample;
      const json = JSON.stringify(design);
      return JSON.parse(dev && /^[^\s:"\\]+$/.test(dev) ? json.replace(/"@:/g, `"${dev}:`).replace(/"device":"@"/g, `"device":"${dev}"`) : json);
    }

    const rowsOf = () => Math.max(3, ...b.design.parts.map(p => p.at.y + p.at.h + 1));

    function drawGuide() {
      const g = b.guide;
      g.textContent = '';
      const rows = rowsOf();
      g.style.gridTemplateRows = `repeat(${rows}, ${GRID.row}px)`;
      g.style.gridTemplateColumns = `repeat(${cols()}, 1fr)`;
      for (let i = 0; i < rows * cols(); i++) g.append(el('i'));
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
        // A container's components take the pointer only once it's entered (it or one of them selected): until then a
        // tap anywhere on it is the whole container's, and the hover shows that.
        const sealed = parent && !entered(parent);
        const node = el('div', `wdb-box${p.kind === 'container' ? ' container' : ''}${parent ? ' kid' : ''}${sealed ? ' sealed' : ''}${b.selected === p.id ? ' on' : ''}${n.classList.contains('wb-hidden') ? ' hidden' : ''}`);
        Object.assign(node.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        node.style.borderRadius = n.ownerDocument.defaultView.getComputedStyle(n).borderRadius; // a pill's outline is round too
        node.title = partTitle(p);
        if (b.selected === p.id) {
          // Every corner and, where the box is long enough for them, every edge; centred on the outline.
          for (const dir of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
            const edge = dir.length === 1;
            if (edge && ((dir === 'n' || dir === 's') ? r.width : r.height) < 48) continue;
            // A narrow container's top edge holds its placement's label (its corners still resize it).
            if (dir === 'n' && p.kind === 'container' && r.width < 280) continue;
            if (!edge && dir !== 'se' && (r.width < 24 || r.height < 24)) continue;
            const handle = el('span', `wdb-handle ${edge ? 'edge' : 'corner'} h-${dir}`);
            handle.addEventListener('pointerdown', e => startDrag(e, p, parent, dir));
            node.append(handle);
          }
          if (p.kind === 'container') {
            // Its placement, a label on its top edge.
            node.append(el('span', 'wdb-tag', t(p.mode === 'free' ? 'builderFree' : p.mode === 'pages' ? 'builderPages' : 'builderFine')));
          }
        }
        o.append(node);
      };
      for (const p of b.design.parts) {
        box(p, null);
        if (p.kind === 'container') for (const k of p.parts || []) box(k, p);
      }
      if (b.cell) showCell(b.cell);
    }

    /** A container is entered while it or one of its components is selected: then a tap picks the component under it. */
    const entered = box => !!b.selected && (b.selected === box.id || (box.parts || []).some(k => k.id === b.selected));

    /**
     * Every component under a point of the overlay, the topmost first: in the order they're drawn, a container's
     * components over the container.
     * @returns {{p: any, parent: any}[]}
     */
    function partsAt(x, y) {
      const out = [];
      const hit = (p, parent) => {
        const n = nodeOf(p.id);
        if (!n) return;
        const r = n.getBoundingClientRect();
        if (!r.width && !r.height) return;
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) out.push({ p, parent });
      };
      for (const p of [...b.design.parts].reverse()) {
        if (p.kind === 'container') for (const k of [...(p.parts || [])].reverse()) hit(k, p);
        hit(p, null);
      }
      return out;
    }

    /**
     * A press on the canvas: the first tap selects the whole thing under it (a container, with every component in it);
     * once a container is entered, its component under the pointer. A tap on what's selected picks the next one under
     * it (a container's component, one hidden behind another, then round again), and a drag moves what's selected. A tap
     * on a selected pages container's tab or dot shows that page.
     */
    function onOverlayDown(e) {
      if (e.button) return;
      const o = b.overlay.getBoundingClientRect();
      const x = e.clientX - o.left;
      const y = e.clientY - o.top;
      const stack = partsAt(x, y);
      if (!stack.length) { if (b.selected) select(null); return; }
      const i = stack.findIndex(s => s.p.id === b.selected);
      const inside = i < 0 && stack.find(s => s.parent && entered(s.parent));
      const pick = i >= 0 ? stack[i] : inside || stack.find(s => !s.parent) || stack[0];
      const tab = pageTabAt(stack, e.clientX, e.clientY);
      const wasSelected = i >= 0;
      startDrag(e, pick.p, pick.parent, 'move', () => {
        if (tab) { showEditPage(tab.box, tab.page); return; }
        if (!wasSelected || stack.length < 2) return;
        select(stack[(i + 1) % stack.length].p.id);
      });
    }

    /** A pages container's tab or dot under a point (the frame's coordinates are the overlay's), or null. */
    function pageTabAt(stack, cx, cy) {
      const o = b.overlay.getBoundingClientRect();
      for (const { p } of stack) {
        if (p.kind !== 'container' || p.mode !== 'pages') continue;
        const btns = [...(nodeOf(p.id) ? nodeOf(p.id).querySelectorAll('.wb-pagebtn') : [])];
        const page = btns.findIndex((btn) => {
          const r = btn.getBoundingClientRect();
          return cx - o.left >= r.left && cx - o.left <= r.right && cy - o.top >= r.top && cy - o.top <= r.bottom;
        });
        if (page >= 0) return { box: p, page };
      }
      return null;
    }

    /** Shows (and edits) a pages container's page: the inspector's Editing page, or a tap on its tab in the preview. */
    function showEditPage(box, page) {
      (b.editPage || (b.editPage = {}))[box.id] = page;
      if (b.widget && b.widget.showPage) b.widget.showPage(box.id, page);
      // A component on another page lets go.
      const sel = b.selected && findPart(b.selected);
      if (sel && sel !== box && parentOf(sel.id) === box && (sel.page || 0) !== page) b.selected = box.id;
      redrawInspector();
      drawOverlay();
    }

    /** The grid a part moves on: its cell size in px, and where its box starts. */
    function gridOf(parent) {
      if (!parent) {
        const w = b.canvas.getBoundingClientRect().width || b.width; // narrower than chosen on a phone
        return { mode: 'top', cols: cols(), colW: (w - (cols() - 1) * GRID.gap) / cols() + GRID.gap, rowH: GRID.row + GRID.gap };
      }
      const inner = nodeOf(parent.id) && nodeOf(parent.id).querySelector('.wb-inner');
      const r = inner ? inner.getBoundingClientRect() : { width: 100, height: 100 };
      if (parent.mode === 'free') return { mode: 'free', w: r.width, h: r.height };
      return { mode: 'grid', cols: FINE.cols, colW: (r.width - (FINE.cols - 1) * FINE.gap) / FINE.cols + FINE.gap, rowH: FINE.row, rows: Math.floor(r.height / FINE.row) };
    }

    /**
     * A drag on the canvas: `how` is `move`, or the handle a resize starts from (`n`, `ne`, `e` … `nw`). `onClick` runs
     * when the pointer comes up without having moved.
     */
    function startDrag(e, p, parent, how, onClick) {
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
      // Where in its box it was grabbed (0–1 across and down): a move into another container lands with that point
      // under the pointer, so the cells it lands on are the one marker and stay where the box would be.
      const startNode = nodeOf(p.id);
      const startBox = startNode ? startNode.getBoundingClientRect() : null;
      const o = b.overlay.getBoundingClientRect();
      const grab = startBox && startBox.width && startBox.height
        ? { x: clamp((e.clientX - o.left - startBox.left) / startBox.width, 0, 1), y: clamp((e.clientY - o.top - startBox.top) / startBox.height, 0, 1) }
        : { x: 0, y: 0 };
      // The containers where they were as the drag started: a top-level part moving onto one's cells pushes it down out
      // from under the pointer, so looking where it is now, nothing could ever be dragged into one.
      const boxes = containerRects();
      const dir = how === 'move' ? '' : how;
      let moved = false;
      let before = null;
      /** A move over another container (or out of its own, to the top): where it goes when dropped. */
      let away = null;
      const move = (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        if (!moved) { moved = true; before = JSON.stringify(b.design); }
        if (how === 'move' && p.kind !== 'container') {
          const target = dropTarget('part', ev.clientX, ev.clientY, boxes);
          if ((target.into ? target.into.id : null) !== (parent ? parent.id : null)) {
            // Over another container, or out of this one: only the place it lands on shows until it's dropped.
            // Everything back where it was meanwhile, as it will be until it's dropped there.
            if (!away) {
              for (const [x, place] of places) x.at = { ...place };
              b.rev++;
              showPreview();
            }
            away = landAt(target, topSize(p, parent), grab);
            showCell(away);
            return;
          }
          away = null;
        }
        const at = { ...from };
        if (g.mode === 'free') {
          const px = (dx / g.w) * 100;
          const py = (dy / g.h) * 100;
          if (how === 'move') {
            at.x = clamp(from.x + px, 0, 100 - at.w);
            at.y = clamp(from.y + py, 0, 100 - at.h);
            snapFree(at, parent, p);
          } else resizeTo(at, from, dir, px, py, { cols: 100, min: 4, maxH: 100, free: true });
          for (const k of ['x', 'y', 'w', 'h']) at[k] = Math.round(at[k] * 10) / 10;
        } else {
          const cx = Math.round(dx / g.colW);
          const cy = Math.round(dy / g.rowH);
          if (how === 'move') {
            at.x = clamp(from.x + cx, 0, g.cols - from.w);
            at.y = Math.max(0, from.y + cy);
          } else resizeTo(at, from, dir, cx, cy, { cols: g.cols, min: 1, maxH: g.mode === 'top' ? 8 : 200 });
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
        // On a grid, the cells it covers.
        b.cell = g.mode === 'free' ? null : { into: parent, ...p.at };
        if (b.cell) showCell(b.cell);
      };
      const up = (ev) => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
        node.removeEventListener('lostpointercapture', up);
        b.lines = null;
        showCell(null);
        if (!moved) {
          if (ev.type === 'pointerup' && onClick) onClick();
          return;
        }
        if (away && ev.type === 'pointerup') {
          // Into another container, or out to the top: from where it started, so nothing else moved.
          b.design = JSON.parse(before);
          const fresh = findPart(p.id);
          const from = parentOf(p.id);
          pushUndo(before);
          // The container it goes into, in the design as it was put back.
          moveTo(fresh, from, { ...away, into: away.into ? findPart(away.into.id) : null });
          b.rev++;
          showPreview();
          loadPreview();
          saveSoon();
          redrawInspector();
          redrawLibrary();
          return;
        }
        if (away) {
          // Let go elsewhere (cancelled): everything as it was.
          b.design = JSON.parse(before);
          b.rev++;
          showPreview();
          return;
        }
        // Back where it started: nothing to undo or save.
        if (JSON.stringify(b.design) === before) { drawOverlay(); return; }
        pushUndo(before);
        saveSoon();
        drawOverlay();
        redrawInspector();
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
      node.addEventListener('lostpointercapture', up);
    }

    /**
     * A resize from a handle (`dir`: the edges it moves, `n`, `e`, `s`, `w` or two of them) by `dx`, `dy` cells or per
     * cent; the opposite edges stay where they were. `o`: the columns (or 100), the smallest size and the tallest.
     */
    function resizeTo(at, from, dir, dx, dy, o) {
      if (dir.includes('e')) at.w = clamp(from.w + dx, o.min, o.cols - from.x);
      if (dir.includes('s')) at.h = clamp(from.h + dy, o.min, o.free ? 100 - from.y : o.maxH);
      if (dir.includes('w')) {
        at.x = clamp(from.x + dx, 0, from.x + from.w - o.min);
        at.w = from.w - (at.x - from.x);
      }
      if (dir.includes('n')) {
        at.y = clamp(from.y + dy, Math.max(0, from.y + from.h - o.maxH), from.y + from.h - o.min);
        at.h = from.h - (at.y - from.y);
      }
    }

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    /** A part's size in top-grid cells, wherever it is: from a container's fine grid (3 columns, 8 rows a cell) or per cent. */
    function topSize(p, parent) {
      if (!parent) return { w: p.at.w, h: p.at.h };
      if (parent.mode === 'free') return { w: Math.max(1, Math.round(p.at.w / 25)), h: 1 };
      return { w: Math.max(1, Math.round(p.at.w / 3)), h: Math.max(1, Math.round(p.at.h / 8)) };
    }

    /** Moves a part (not a container) into another container, or out to the top, at `to` (`{into, x, y, w, h}`). */
    function moveTo(p, from, to) {
      const list = from ? from.parts : b.design.parts;
      list.splice(list.findIndex(x => x.id === p.id), 1);
      delete p.page;
      if (!to.into) {
        p.at = { x: clamp(to.x, 0, cols() - to.w), y: Math.max(0, to.y), w: to.w, h: to.h };
        b.design.parts.push(p);
        makeRoom(b.design.parts, p);
      } else if (to.into.mode === 'free') {
        p.at = { x: Math.round(to.x * 10) / 10, y: Math.round(to.y * 10) / 10, w: to.w, h: to.h };
        to.into.parts.push(p);
      } else {
        p.at = { x: clamp(to.x, 0, FINE.cols - to.w), y: Math.max(0, to.y), w: to.w, h: to.h };
        if (to.into.mode === 'pages') p.page = (b.editPage && b.editPage[to.into.id]) || 0;
        to.into.parts.push(p);
        makeRoom(to.into.parts, p);
      }
      b.selected = p.id;
    }

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

    /**
     * A change to the design: kept for Undo, drawn at once, saved soon; `preview` reads the values again; `undo: false`
     * adds no step (a run of arrow-key nudges is one).
     */
    function change(fn, { preview = true, inspector = true, undo = true } = {}) {
      if (undo) pushUndo(JSON.stringify(b.design));
      fn();
      b.rev++;
      showPreview();
      if (preview) loadPreview();
      saveSoon();
      if (inspector) redrawInspector();
      if (b.libTab === 'layers') redrawLibrary();
    }

    /** A step for Undo; a new change (not a Redo) clears what Redo had. */
    function pushUndo(before, redoing = false) {
      b.undo.push(before);
      if (b.undo.length > 50) b.undo.shift();
      if (!redoing) b.redo = [];
      b.nudged = null;
      undoButtons();
    }

    function undoButtons() {
      if (b.undoNode) b.undoNode.disabled = !b.undo.length;
      if (b.redoNode) b.redoNode.disabled = !(b.redo || []).length;
    }

    function undoChange() {
      const last = b.undo.pop();
      if (!last) return;
      (b.redo || (b.redo = [])).push(JSON.stringify(b.design));
      restore(last);
    }

    function redoChange() {
      const next = b.redo && b.redo.pop();
      if (!next) return;
      pushUndo(JSON.stringify(b.design), true);
      restore(next);
    }

    /** The design as an Undo or Redo step had it, drawn, saved and read again. */
    function restore(json) {
      const span = b.design.span;
      b.design = JSON.parse(json);
      if (span) b.design.span = span; else delete b.design.span;
      b.nudged = null;
      if (b.selected && !findPart(b.selected)) b.selected = null;
      undoButtons();
      sizeCanvas();
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

    /**
     * Deletes a ready-made of your own from the library. The app turns its linked instances into copies first, in
     * every design, so this one is read again from the answer.
     */
    async function deleteReady(d) {
      await flush();
      try {
        const res = await request('DELETE', `/web/designs/${encodeURIComponent(d.id)}`);
        wd.designs = res.designs;
        const fresh = res.designs.find(x => x.id === b.design.id);
        if (fresh && JSON.stringify(fresh.parts) !== JSON.stringify(b.design.parts)) {
          b.design = clone(fresh);
          if (b.selected && !findPart(b.selected)) b.selected = null;
          showPreview();
          loadPreview();
          redrawInspector();
        }
        redrawLibrary();
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
        location.hash = '#/builder';
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
            // As wide as it's made for, and a design for any device with its preview device to start with.
            const anyDevice = JSON.stringify(b.design.parts).includes('"@:');
            const widget = {
              id: wd.newId(), type: 'custom', title: b.design.name, settings: { design: { id: b.design.id, name: b.design.name } },
              deviceIds: anyDevice && b.design.sample ? [b.design.sample] : [], ...(spanOf() > 1 ? { span: spanOf() } : {}),
            };
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

    /**
     * Adds a ready-made tile, asking for its device value first where it needs one: a free-form container of its parts
     * at the bottom, or, in a container (one level deep), its parts in a region of it.
     */
    async function addReady(r, drop) {
      if (!r.value) { placeKids({ name: t(`builderReady_${r.id}`), w: r.w, h: r.h, kids: readyParts(r.id, '') }, drop); return; }
      try {
        const devices = await wd.valueDevices('values');
        wd.chooseValue(devices, null, (item) => {
          const add = second => placeKids({ name: t(`builderReady_${r.id}`), w: r.w, h: r.h, kids: readyParts(r.id, item.id, second) }, drop);
          // Device Values' second value: another of its values, asked for next.
          if (r.second) wd.chooseValue(devices, null, more => add(more.id));
          else add();
        });
      } catch (err) { failed(err); }
    }

    /** A copy of a part with new ids (a container's parts too). */
    function freshCopy(part) {
      // New ids throughout, its `{part}` references to its own parts following them (lib/customDesigns.ts' renewIds()).
      const ids = new Map();
      const collect = (x) => { ids.set(x.id, partId()); for (const k of x.parts || []) collect(k); };
      collect(part);
      const walk = (x, key) => {
        if (typeof x === 'string') return (key === 'id' || key === 'part') && ids.has(x) ? ids.get(x) : x;
        if (Array.isArray(x)) return x.map(y => walk(y, ''));
        if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y, k)]));
        return x;
      };
      return walk(clone(part), '');
    }

    /** The ready-made of your own a linked instance follows, or null when it's gone. */
    function sourceOf(p) {
      const d = p.kind === 'use' && designs().find(x => x.id === p.ready && x.ready);
      return d && d.parts[0] ? d : null;
    }

    /** A linked instance becomes a copy of its ready-made as it is now, in the same box, to change on its own. */
    function detach(p) {
      const d = sourceOf(p);
      if (!d) return;
      change(() => {
        const copy = freshCopy(d.parts[0]);
        copy.at = { ...p.at };
        if (p.page !== undefined) copy.page = p.page;
        else delete copy.page;
        const parent = parentOf(p.id);
        const list = parent ? parent.parts : b.design.parts;
        list.splice(list.indexOf(p), 1, copy);
        b.selected = copy.id;
      });
    }

    /**
     * Adds a ready-made component of your own (a design saved as one): a copy of it, at the drop's cell or at the
     * bottom; into a container, a container's parts go in a region of it (nesting is one level), anything else as itself.
     */
    function addMine(d, drop) {
      const into0 = drop ? drop.into : targetContainer();
      // Linked to its source, so a change to the ready-made shows here too; a copy inside a ready-made (they don't
      // nest) and for a container dropped into a container (containers are one level deep).
      const linked = !b.design.ready && !(into0 && d.parts[0].kind === 'container');
      const part = linked
        ? { id: partId(), kind: 'use', name: '', ready: d.id, color: null, icon: null, style: 'none', rules: [], flow: {}, reset: 'never', at: { ...d.parts[0].at } }
        : freshCopy(d.parts[0]);
      // Its `@` values stay the widget's device; this design then shows them with the same preview device.
      if (!b.design.sample && d.sample) b.design.sample = d.sample;
      const into = drop ? drop.into : targetContainer();
      if (!into) {
        change(() => {
          const w = Math.min(part.at.w, cols());
          const y = drop ? Math.max(0, drop.y) : b.design.parts.reduce((m, q) => Math.max(m, q.at.y + q.at.h), 0);
          part.at = { x: drop ? clamp(drop.x, 0, cols() - w) : 0, y, w, h: part.at.h };
          b.design.parts.push(part);
          makeRoom(b.design.parts, part);
          b.selected = part.id;
        });
        return;
      }
      if (part.kind === 'container') {
        // Its parts in per cent of it, then placed as a built-in ready-made's.
        const rows = Math.max(1, part.at.h * 8);
        const kids = (part.parts || []).map(k => ({ ...k, at: part.mode === 'free' ? k.at : { x: (k.at.x / FINE.cols) * 100, y: Math.min(95, (k.at.y / rows) * 100), w: (k.at.w / FINE.cols) * 100, h: Math.min(100, (k.at.h / rows) * 100) } }));
        for (const k of kids) delete k.page;
        placeKids({ name: d.name, w: part.at.w, h: part.at.h, kids }, { ...drop, into });
        return;
      }
      change(() => {
        const size = sizeIn(sizeOfPart(linked ? d.parts[0] : part), into);
        part.at = { x: drop ? drop.x : 0, y: drop ? drop.y : (into.parts || []).reduce((m, q) => Math.max(m, q.at.y + q.at.h), 0), ...size };
        if (into.mode === 'pages') part.page = (b.editPage && b.editPage[into.id]) || 0;
        into.parts.push(part);
        if (into.mode !== 'free') makeRoom(into.parts, part);
        b.selected = part.id;
      });
    }

    /**
     * Adds a ready-made: at the top a free-form container of its parts (in per cent), at the drop's cell or at the
     * bottom; in a container (one level deep) its parts in a region of it, at the drop's place or under what's there.
     */
    function placeKids({ name, w: rw, h: rh, kids }, drop) {
      const into = drop ? drop.into : targetContainer();
      change(() => {
        if (!into) {
          const w = Math.min(rw, cols());
          const y = drop ? Math.max(0, drop.y) : b.design.parts.reduce((m, q) => Math.max(m, q.at.y + q.at.h), 0);
          const box = {
            id: partId(), kind: 'container', name, color: null, icon: null, style: 'tile', rules: [], flow: {}, reset: 'never',
            mode: 'free', background: { kind: 'none' }, parts: kids, at: { x: drop ? clamp(drop.x, 0, cols() - w) : 0, y, w, h: rh },
          };
          b.design.parts.push(box);
          makeRoom(b.design.parts, box);
          b.selected = box.id;
          return;
        }
        // In a container: the parts in a region of it, as wide as half of it, under what's there (or at the drop).
        const page = into.mode === 'pages' ? ((b.editPage && b.editPage[into.id]) || 0) : undefined;
        if (into.mode === 'free') {
          const y = drop ? clamp(drop.y, 0, 70) : Math.min(70, (into.parts || []).reduce((m, q) => Math.max(m, q.at.y + q.at.h), 0));
          const region = { x: drop ? clamp(drop.x, 0, 50) : 0, y, w: Math.min(100, rw * 25), h: Math.min(100 - y, rh * 30) };
          region.w = Math.min(region.w, 100 - region.x);
          for (const k of kids) k.at = { x: Math.round((region.x + (k.at.x / 100) * region.w) * 10) / 10, y: Math.round((region.y + (k.at.y / 100) * region.h) * 10) / 10, w: Math.max(1, Math.round((k.at.w / 100) * region.w * 10) / 10), h: Math.max(1, Math.round((k.at.h / 100) * region.h * 10) / 10) };
        } else {
          const y = drop ? Math.max(0, drop.y) : (into.parts || []).filter(q => (q.page || 0) === (page || 0)).reduce((m, q) => Math.max(m, q.at.y + q.at.h), 0);
          const region = { x: drop ? clamp(drop.x, 0, FINE.cols - 1) : 0, y, w: Math.min(FINE.cols, rw * 3), h: rh * 8 };
          region.w = Math.min(region.w, FINE.cols - region.x);
          for (const k of kids) {
            const x = Math.round((k.at.x / 100) * region.w);
            const yy = Math.round((k.at.y / 100) * region.h);
            k.at = { x: Math.min(FINE.cols - 1, region.x + x), y: region.y + yy, w: Math.max(1, Math.round((k.at.w / 100) * region.w)), h: Math.max(1, Math.round((k.at.h / 100) * region.h)) };
            if (page !== undefined) k.page = page;
          }
        }
        into.parts = [...(into.parts || []), ...kids];
        b.selected = kids[kids.length - 1].id;
      });
    }

    /**
     * Saves a top-level component as a ready-made of your own: a design holding a copy of it (`ready`), offered in the
     * library and to Repeaters. Its values of the widget's device stay so, filled in where it's used.
     */
    function saveAsReady(p) {
      const { d, body } = wd.dialog(t('builderSaveReady'));
      const name = el('input', 'wd-input');
      name.value = partTitle(p);
      name.setAttribute('aria-label', t('builderName'));
      const go = async () => {
        d.close();
        await flush();
        const part = freshCopy(p);
        part.at = { x: 0, y: 0, w: p.at.w, h: p.at.h };
        try {
          const res = await request('PUT', '/web/designs', { name: name.value.trim().slice(0, 40) || partTitle(p), ready: true, parts: [part], ...(b.design.sample ? { sample: b.design.sample } : {}) });
          wd.designs = res.designs;
          redrawLibrary();
          redrawInspector();
          toast(t('builderSavedReady', { name: res.design.name }));
        } catch (err) { failed(err); }
      };
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      const actions = el('div', 'wd-row wd-actions');
      actions.append(button('wd-btn quiet', t('cancel'), () => d.close()), button('wd-btn primary', t('save'), go));
      body.append(el('p', 'wd-hint', t('builderSaveReadyHint')), row(t('builderName'), name), actions);
      d.showModal();
      name.focus();
      name.select();
    }

    function addPart(kind, drop) {
      const def = KINDS.find(k => k.kind === kind);
      const into = drop ? drop.into : kind === 'container' ? null : targetContainer();
      const p = {
        id: partId(), kind, name: '', color: null, icon: null, style: ['text', 'icon'].includes(kind) ? 'none' : 'tile', rules: [], flow: {}, reset: 'never',
      };
      if (kind === 'text') { p.text = t('builderTextDefault'); p.size = 'default'; p.align = 'left'; }
      if (kind === 'container') { p.mode = 'grid'; p.background = { kind: 'none' }; p.parts = []; }
      if (kind === 'choice') p.choices = [];
      if (kind === 'stepper') p.step = 0.5;
      if (kind === 'sparkline') p.span = '24h';
      if (['sparkline', 'arc', 'bar', 'calc'].includes(kind)) p.style = 'none';
      if (kind === 'icon') p.icon = 'star';
      if (kind === 'shape') { p.style = 'none'; p.shape = 'rect'; p.background = { kind: 'none' }; p.opacity = 100; p.radius = 10; }
      if (kind === 'calc') { p.inputs = []; p.op = 'sum'; p.units = ''; }
      if (kind === 'state') { p.stateType = 'toggle'; p.initial = 'false'; p.name = kindName('state'); }
      if (kind === 'image') { p.fit = 'cover'; p.refresh = 5; }
      if (kind === 'ring') { p.rings = []; p.center = 'value'; }
      if (kind === 'repeat') { p.itemStyle = 'row'; p.columns = 1; p.text = ''; }
      if (kind === 'segments') { p.segments = []; p.barStyle = 'bar'; p.scale = 'sum'; p.legend = true; p.units = ''; }
      if (kind === 'chart') { p.series = []; p.span = '24h'; p.chartStyle = 'area'; p.axis = true; p.chartLegend = 'above'; }
      if (kind === 'each') { p.style = 'none'; p.devices = []; p.columns = 1; const first = designs().find(d => d.ready); if (first) p.ready = first.id; }
      if (into && into.mode === 'pages') p.page = (b.editPage && b.editPage[into.id]) || 0;
      change(() => {
        const w = Number(def.w);
        const h = Number(def.h);
        if (!into) {
          const y = drop ? Math.max(0, drop.y) : b.design.parts.reduce((m, q) => Math.max(m, q.at.y + q.at.h), 0);
          p.at = { x: drop ? clamp(drop.x, 0, cols() - w) : 0, y, w, h };
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
      redrawLibrary();
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
      node.append(inspectorHead(p, parent));
      const tabs = el('div', 'wdb-tabs');
      tabs.setAttribute('role', 'tablist');
      // A calculated value is never drawn: only what it calculates.
      const ids = p.kind === 'calc' || p.kind === 'use' ? ['part'] : p.kind === 'each' ? ['part', 'look', 'flow'] : ['part', 'look', 'rules', 'flow'];
      if (!ids.includes(b.tab)) b.tab = 'part';
      // How many rules it has, and how many changes Flows may make: there's something on that tab.
      const counts = { rules: (p.rules || []).length, flow: Object.values(p.flow || {}).filter(v => v === true).length };
      for (const id of ids) {
        const tb = button(`wdb-tab${b.tab === id ? ' on' : ''}`, t(`builderTab_${id}`), () => { b.tab = id; redrawInspector(); });
        if (counts[id]) tb.append(el('span', 'wdb-tab-count', String(counts[id])));
        tb.setAttribute('role', 'tab');
        tb.setAttribute('aria-selected', String(b.tab === id));
        tabs.append(tb);
      }
      node.append(tabs);
      const body = el('div', 'wdb-form');
      node.append(body);
      if (b.tab === 'part') partTab(body, p, parent);
      else if (b.tab === 'look') lookTab(body, p);
      else if (b.tab === 'rules') rulesTab(body, p);
      else flowTab(body, p);
      sheets(body);
    }

    /**
     * Who's selected, above the tabs: its kind's icon, its name, its kind and the container it's in (a tap selects that),
     * and on every tab Save as ready-made (a top-level component's) and Delete (a second tap).
     */
    function inspectorHead(p, parent) {
      const head = el('div', 'wdb-head');
      const glyph = glyphOf(p.kind);
      const badge = el('span', 'wdb-head-icon');
      badge.append(kitIcon(glyph, 'wdb-comp-icon'));
      const path = el('span', 'wdb-head-path');
      if (parent) {
        // The container's name as a link inside "<kind> in <name>", in each language's order.
        const [before, after = ''] = t('builderIn', { kind: kindName(p.kind), name: '\u0000' }).split('\u0000');
        path.append(before, button('wdb-head-parent', partTitle(parent), () => select(parent.id)), after);
      } else path.append(kindName(p.kind));
      const tools = el('span', 'wdb-head-tools');
      if (!parent && p.kind !== 'calc' && p.kind !== 'use' && !b.design.ready) {
        const keep = button('wd-icon small', '', () => saveAsReady(p), t('builderSaveReady'));
        keep.append(kitIcon('bookmark', ''));
        tools.append(keep);
      }
      const copy = button('wd-icon small', '', () => duplicatePart(p.id), t('duplicate'));
      copy.append(icon('copy'));
      tools.append(copy, confirmButton('wd-icon small wdb-head-delete', icon('trash'), () => removePart(p.id), t('tapAgain'), t('builderRemove')));
      head.append(badge, el('span', 'wdb-head-name', partTitle(p)), path, tools);
      return head;
    }

    /**
     * The tab's settings as groups, each a panel of its own: a new group at each heading (`h4.wdb-h4`, kept as the
     * group's title); a node that is already one (`.wdb-sec`, Position and size) stays as it is.
     */
    function sheets(body) {
      const kids = [...body.children];
      body.textContent = '';
      let sheet = null;
      for (const k of kids) {
        if (k.classList.contains('wdb-sec')) { body.append(k); sheet = null; continue; }
        if (!sheet || k.classList.contains('wdb-h4')) { sheet = el('div', 'wdb-sec'); body.append(sheet); }
        sheet.append(k);
      }
    }

    /**
     * One item of a list (a text's values, actions, segments, rings, series, inputs, rules) as one line: its key, what
     * it is, and its reading now; a tap opens its settings under it (`fill(body)`), one open per list.
     * @param {string} list @param {number} i @param {{key: any, title: string, sub?: string, value?: any, fill: (body: HTMLElement) => void, remove?: () => void}} o
     */
    function itemLine(list, i, o) {
      const id = `${b.selected}:${list}`;
      const open = (b.openItem || {})[id] === i;
      const node = el('div', `wdb-item${open ? ' open' : ''}`);
      const head = button('wdb-item-head', '', () => { (b.openItem || (b.openItem = {}))[id] = open ? -1 : i; redrawInspector(); });
      head.setAttribute('aria-expanded', String(open));
      const key = el('span', 'wdb-item-key');
      key.append(o.key);
      const what = el('span', 'wdb-item-what');
      what.append(el('span', 'wdb-item-title', o.title));
      if (o.sub) what.append(el('span', 'wdb-item-sub', o.sub));
      const value = el('span', 'wdb-item-value');
      if (o.value != null) value.append(o.value);
      head.append(key, what, value, icon(open ? 'up' : 'down'));
      node.append(head);
      if (open) {
        const body = el('div', 'wdb-item-body');
        o.fill(body);
        if (o.remove) body.append(button('wd-btn quiet small wdb-item-remove', t('remove'), o.remove));
        node.append(body);
      }
      return node;
    }
    /** Opens a list's item on the next draw (one just added). */
    const openItem = (list, i) => { (b.openItem || (b.openItem = {}))[`${b.selected}:${list}`] = i; };

    /** What a source (`{slot} | {variable} | {part} | {time …}`) is, for an item's line: its name, what of it, its reading. */
    function sourceSummary(src) {
      const kind = sourceKind(src);
      if (kind === 'time') {
        const which = 'since' in src ? 'since' : 'until' in src ? 'until' : src.time;
        return { title: t(`builderRef_${which}`), sub: which === 'until' ? src.until : '' };
      }
      if (kind === 'calc') {
        const x = everyPart().find(c => c.id === src.part);
        return { title: x ? partTitle(x) : t('chooseValue'), sub: t('builderFromComponent') };
      }
      if (kind === 'variable') {
        const v = src.variable && b.state && b.state.variables && b.state.variables[src.variable];
        return src.variable ? { title: v ? v.name : src.variable, sub: t('builderVariable'), value: v && v.value != null ? String(v.value) : '' } : { title: t('chooseValue') };
      }
      const info = src && src.slot ? slotInfo(src.slot) : null;
      if (!info) return { title: t('chooseValue') };
      if (info.gone) return { title: t('builderValueGone') };
      if (info.loading) return { title: t('builderLoading') };
      return { title: info.device, sub: info.title, value: info.reading };
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

    /** A linked ready-made's settings: what it follows, a way there, and Detach. */
    function useRows(body, p) {
      const d = sourceOf(p);
      body.append(el('p', 'wd-hint', d ? t('builderLinkedHint', { name: d.name || t('untitled') }) : t('builderLinkedGone')));
      if (!d) return;
      const actions = el('div', 'wd-row');
      const open = el('a', 'wd-btn quiet small', t('builderEditReady'));
      open.href = `#/builder/${d.id}`;
      open.addEventListener('click', async (e) => { e.preventDefault(); await flush(); location.hash = open.getAttribute('href'); });
      actions.append(button('wd-btn small', t('builderDetach'), () => detach(p)), open);
      body.append(actions);
      // Its own device, where the ready-made works with any device; without one, the widget's.
      if (!usesAnyDevice(d.parts)) return;
      const dev = p.device && (b.devices || []).find(x => x.id === p.device);
      const line = el('div', 'wd-row');
      line.append(button('wd-btn wd-choice', p.device ? (dev ? dev.name : t('missingDevice')) : t('builderAnyDevice'), async () => {
        try {
          const items = await request('GET', '/web/devices?type=custom');
          wd.chooseDevices({ devices: { singular: true } }, items, p.device ? [p.device] : [], ids => change(() => { if (ids[0]) p.device = ids[0]; }));
        } catch (err) { failed(err); }
      }));
      if (p.device) line.append(button('wd-btn quiet small', t('clear'), () => change(() => { delete p.device; })));
      body.append(row(t('builderDevice'), line, t('builderUseDeviceHint')));
    }

    /** Whether parts use the widget's device (`@`) anywhere. */
    function usesAnyDevice(parts) {
      const json = JSON.stringify(parts);
      return json.includes('"@:') || json.includes('"device":"@"');
    }

    function partTab(body, p, parent) {
      const set = (fn, opts) => change(fn, opts);
      if (p.kind === 'text') {
        body.append(row(t('builderText'), textInput(p.text, v => set(() => { p.text = v.slice(0, 200); }, { preview: false }), { multi: true })));
        if ((p.refs || []).length) {
          const shows = el('p', 'wd-hint wdb-shows');
          b.showsAs = { node: shows, id: p.id };
          body.append(shows);
          fillShowsAs();
        }
      } else if (p.kind !== 'use') {
        body.append(row(t('builderPartName'), textInput(p.name, v => set(() => { p.name = v.trim().slice(0, 40); }, { preview: false }), { placeholder: ownName(p) || (NAMED_KINDS.includes(p.kind) ? t('builderNameHint') : kindName(p.kind)) })));
      }
      if (SLOT_KINDS.includes(p.kind) || VARIABLE_KINDS.includes(p.kind)) sourceRows(body, p);
      if (p.kind === 'button' && !(p.actions || []).length) body.append(row(t('builderStarts'), listPicker('flow', p.flowId, item => set(() => { if (item) p.flowId = item.id; else delete p.flowId; }), t('builderTapTrigger')), t('builderStartsHint')));
      if (p.kind === 'switch') body.append(row(t('builderPress'), segs([['tap', t('builderPress_tap')], ['confirm', t('builderPress_confirm')], ['long', t('builderPress_long')]], p.press || 'tap', v => set(() => { if (v === 'tap') delete p.press; else p.press = v; }, { preview: false }))));
      if (p.kind === 'variable') body.append(checkRow(t('builderReadOnly'), p.readOnly, v => set(() => { if (v) p.readOnly = true; else delete p.readOnly; })));
      if (p.kind === 'sparkline') {
        spanRows(body, p);
        body.append(checkRow(t('builderSmooth'), p.smooth, v => change(() => { if (v) p.smooth = true; else delete p.smooth; }, { preview: false })));
      }
      if (p.kind === 'arc' || p.kind === 'bar') {
        body.append(row(t('builderValue'), sourcePicker(p.src, src => change(() => { p.src = src; }), { self: p.id })));
        if (p.kind === 'bar') body.append(row(t('builderDirection'), segs([['horizontal', t('builderHorizontal')], ['vertical', t('builderVertical')]], p.dir || 'horizontal', v => change(() => { if (v === 'vertical') p.dir = v; else delete p.dir; }, { preview: false }))));
        gaugeRows(body, p);
      }
      // A variable's range only where it's a number (or not read yet).
      const varType = p.kind === 'variable' && p.variable && b.state && b.state.variables && b.state.variables[p.variable] ? b.state.variables[p.variable].type : null;
      if (RANGE_KINDS.includes(p.kind) && !(p.kind === 'variable' && (!p.variable || (varType && varType !== 'number')))) {
        const two = el('div', 'wdb-two');
        two.append(row(t('builderMin'), textInput(p.min, v => set(() => { const n = numOrNull(v); if (n === undefined) delete p.min; else p.min = n; }, { preview: false }), { type: 'number', placeholder: t('builderAuto') })),
          row(t('builderMax'), textInput(p.max, v => set(() => { const n = numOrNull(v); if (n === undefined) delete p.max; else p.max = n; }, { preview: false }), { type: 'number', placeholder: t('builderAuto') })));
        body.append(two);
        if (p.kind === 'stepper') body.append(row(t('builderStep'), textInput(p.step, v => set(() => { p.step = numOrNull(v) || 0.5; }, { preview: false }), { type: 'number', step: 'any' })));
        if (p.kind === 'slider') body.append(row(t('builderStep'), textInput(p.step, v => set(() => { const n = numOrNull(v); if (n && n > 0) p.step = n; else delete p.step; }, { preview: false }), { type: 'number', step: 'any', placeholder: t('builderAuto') })));
        if (p.kind === 'variable' && !p.readOnly) body.append(row(t('builderStepVariable'), textInput(p.step, v => set(() => { const n = numOrNull(v); if (n && n > 0) p.step = n; else delete p.step; }, { preview: false }), { type: 'number', step: 'any', placeholder: '1' })));
        if (p.kind === 'variable') {
          const two2 = el('div', 'wdb-two');
          two2.append(row(t('builderUnits'), textInput(p.units, v => set(() => { const u = v.trim().slice(0, 12); if (u) p.units = u; else delete p.units; }, { preview: false }))),
            row(t('builderDecimals'), selectOf([['', t('builderAuto')], ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']], p.decimals == null ? '' : String(p.decimals), v => set(() => { if (v === '') delete p.decimals; else p.decimals = Number(v); }, { preview: false }))));
          body.append(two2);
        }
      }
      if (p.kind === 'choice') choicesRows(body, p);
      if (p.kind === 'chart') chartRows(body, p);
      if (p.kind === 'each') eachRows(body, p);
      if (p.kind === 'use') useRows(body, p);
      if (p.kind === 'container') containerRows(body, p);
      if (p.kind === 'text') refRows(body, p);
      if (p.kind === 'shape') shapeRows(body, p);
      if (p.kind === 'calc') calcRows(body, p);
      if (p.kind === 'state') stateRows(body, p);
      if (p.kind === 'button') actionRows(body, p);
      if (p.kind === 'icon') {
        const follow = el('div', 'wd-row');
        follow.append(slotButton(p.slot, item => change(() => { p.slot = item.id; p.icon = null; })));
        if (p.slot) follow.append(button('wd-btn quiet small', t('clear'), () => change(() => { delete p.slot; p.icon = p.icon || 'star'; })));
        body.append(row(t('builderFollows'), follow, t('builderFollowsHint')));
      }
      if (p.kind === 'image') imageRows(body, p);
      if (p.kind === 'ring') ringRows(body, p);
      if (p.kind === 'repeat') repeatRows(body, p);
      if (p.kind === 'segments') segmentRows(body, p);
      // What a tap does comes after what it shows.
      if (TAP_KINDS.includes(p.kind)) tapRows(body, p);
      placeRows(body, p, parent);
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
      // The widget's device: shown with the design's preview device.
      if (slot.startsWith('@:')) {
        if (!b.design.sample) return { device: t('builderNoSample'), title: slot.slice(2) };
        slot = `${b.design.sample}${slot.slice(1)}`;
      }
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

    /**
     * A device value's button: the picked one's device over its value and reading; `picked(item, devices)` on a pick.
     * Under it *The widget's device*: the value as `@:<capability>`, filled in with the device picked where the widget
     * is placed (or each of a Repeater's), the design's preview device standing in for it here.
     */
    function slotButton(slot, picked) {
      const wrap = el('div', 'wdb-slot');
      const any = typeof slot === 'string' && slot.startsWith('@:');
      const info = slotInfo(slot);
      const pick = button('wd-btn wd-choice wdb-valuepick', '', async () => {
        try {
          const devices = await wd.valueDevices('values');
          const sample = b.design.sample;
          const current = any && sample ? `${sample}${slot.slice(1)}` : slot || null;
          wd.chooseValue(devices, current, (item) => {
            // Still the widget's device: the picked device becomes the preview's.
            if (any) { const i = item.id.indexOf(':'); b.design.sample = item.id.slice(0, i); picked({ ...item, id: `@${item.id.slice(i)}` }, devices); } else picked(item, devices);
          });
        } catch (err) { failed(err); }
      });
      if (!info) pick.append(el('span', null, t('chooseValue')));
      else if (info.loading) pick.append(el('span', 'wd-muted', t('builderLoading')));
      else if (info.gone) pick.append(el('span', null, t('builderValueGone')));
      else {
        pick.append(el('span', 'wdb-valuepick-device', any ? t('builderAnyDeviceOf', { name: info.device }) : info.device));
        pick.append(el('span', 'wd-muted wdb-valuepick-value', [info.title, info.reading].filter(Boolean).join(' · ')));
      }
      pick.append(icon('right'));
      wrap.append(pick);
      if (slot) {
        wrap.append(checkLine(t('builderAnyDevice'), any, (on) => {
          const i = slot.indexOf(':');
          if (on) {
            if (!b.design.sample) b.design.sample = slot.slice(0, i);
            picked({ id: `@${slot.slice(i)}` }, b.devices || []);
          } else {
            const dev = b.design.sample;
            if (dev) picked({ id: `${dev}${slot.slice(i)}` }, b.devices || []);
          }
        }, t('builderAnyDeviceHint')));
      }
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

    /**
     * The charts' time span block (Chart · Basic's *Time span*, *Unit*, *Leave out the current period*) for `p[key]`, as
     * the kit's span ids (`24h`, `3d!`, `1w!-`); a span kept under its old name (`today`) is read as the kit reads it.
     */
    function spanRows(body, p, key = 'span', fallback = '24h') {
      const parsed = window.WidgetkeeperKit.parseSpan(p[key] || fallback) || window.WidgetkeeperKit.parseSpan(fallback);
      const unitId = `${SPAN_LETTER[parsed.unit]}${parsed.whole ? '!' : ''}`;
      const put = (count, unit, skip) => change(() => { p[key] = `${Math.max(1, Math.round(count) || 1)}${unit}${unit.endsWith('!') && skip ? '-' : ''}`; });
      const two = el('div', 'wdb-two');
      two.append(
        row(t('builderCount'), textInput(parsed.count, v => put(Number(v), unitId, parsed.skip), { type: 'number' })),
        row(t('builderUnit'), selectOf(SPAN_UNITS.map(([id, u]) => [u, t(`builderUnit_${id}`)]), unitId, u => put(parsed.count, u, parsed.skip))),
      );
      body.append(two);
      if (parsed.whole) body.append(checkRow(t('builderLeaveOut'), parsed.skip, v => put(parsed.count, unitId, v)));
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
      const add = addButton(t('builderAddChoice'), () => change(() => { p.choices = [...(p.choices || []), { label: '', value: '' }]; }, { preview: false }));
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
      // Device Values' *Fill percentages by level*, by any value of the design.
      const fill = el('div', 'wdb-fillby');
      fill.append(sourcePicker(p.fillBy, src => change(() => {
        if (src && (src.slot || src.variable || src.part)) { p.fillBy = src; if (p.redBelow == null) p.redBelow = 10; if (p.yellowBelow == null) p.yellowBelow = 20; }
      }), { self: p.id }));
      if (p.fillBy) fill.append(button('wd-btn quiet small', t('clear'), () => change(() => { delete p.fillBy; delete p.redBelow; delete p.yellowBelow; })));
      // Its own group: the container's mode and pages above it are another matter.
      body.append(el('h4', 'wdb-h4', t('builderFillBy')), fill, el('p', 'wd-hint', t('builderFillByHint')));
      if (p.fillBy) {
        const two = el('div', 'wdb-two');
        two.append(row(t('builderRedBelow'), textInput(p.redBelow, v => change(() => { p.redBelow = clampTo(v, 0, 100, 10); }, { preview: false }), { type: 'number' })),
          row(t('builderYellowBelow'), textInput(p.yellowBelow, v => change(() => { p.yellowBelow = clampTo(v, 0, 100, 20); }, { preview: false }), { type: 'number' })));
        body.append(two);
      }
    }

    /**
     * An Arc's or a Bar's Chart · Gauge options: colour by level (rising or falling, yellow at, red at), and the span's
     * lowest to highest (*Show the range*, over its own time span).
     */
    function gaugeRows(body, p) {
      body.append(row(t('builderZones'), selectOf([['', t('builderZones_none')], ['rising', t('builderZones_rising')], ['falling', t('builderZones_falling')]], p.zones || '', v => change(() => {
        if (!v) { delete p.zones; delete p.yellowAt; delete p.redAt; return; }
        p.zones = v;
        if (p.yellowAt == null) p.yellowAt = v === 'rising' ? 60 : 40;
        if (p.redAt == null) p.redAt = v === 'rising' ? 80 : 20;
      }))));
      if (p.zones) {
        const two = el('div', 'wdb-two');
        const num = key => textInput(p[key], v => change(() => { const n = numOrNull(v); if (n !== undefined) p[key] = n; }, { preview: false }), { type: 'number', step: 'any' });
        two.append(row(t('builderYellowAt'), num('yellowAt')), row(t('builderRedAt'), num('redAt')));
        body.append(two);
      }
      const ranged = !!p.rangeSpan;
      body.append(checkRow(t('builderShowRange'), ranged, v => change(() => { if (v) p.rangeSpan = '1d!'; else delete p.rangeSpan; }), t('builderShowRangeHint')));
      if (ranged) spanRows(body, p, 'rangeSpan', '1d!');
    }

    /** A container's background, or a shape's fill: none (a shape: its colour from Style), a colour, or a gradient. */
    function backgroundRows(body, p, label, noneLabel) {
      const bg = p.background || { kind: 'none' };
      // Without a label: a shape's gradient, its kind already picked.
      if (label) body.append(row(label, segs([['none', noneLabel], ['color', t('builderColour')], ['gradient', t('builderGradient')]], bg.kind, v => change(() => {
        const dim = bg.dim ? { dim: bg.dim } : {};
        p.background = v === 'none' ? { kind: 'none' } : v === 'color' ? { kind: 'color', from: bg.from || 'blue', ...dim } : { kind: 'gradient', from: bg.from || 'blue', to: bg.to || 'purple', angle: bg.angle || 135, ...dim };
      }, { preview: false }))));
      const colour = key => colourPicker(bg[key] || 'blue', v => change(() => { p.background = { ...bg, [key]: v || 'blue' }; }, { preview: false }), {
        none: false, live: (v) => { bg[key] = v; b.rev++; showPreview(); },
      });
      if (bg.kind !== 'none') {
        // A container's strength: as the normal tiles (a tint in Muted, solid in Vivid), half, or the full colour.
        if (label && p.kind === 'container') {
          body.append(row(t('builderDim'), segs([['widget', t('builderDim_widget')], ['half', t('builderDim_half')], ['full', t('builderDim_full')]], bg.dim || 'widget', v => change(() => {
            const next = { ...bg };
            if (v === 'widget') delete next.dim; else next.dim = v;
            p.background = next;
          }, { preview: false })), t('builderDimHint')));
        }
        body.append(row(bg.kind === 'gradient' ? t('builderGradientFrom') : t('builderColour'), colour('from')));
        if (bg.kind === 'gradient') body.append(row(t('builderTo'), colour('to')));
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
          const n = parent ? FINE.cols : cols();
          p.at.w = Math.min(p.at.w, n);
          p.at.x = Math.min(p.at.x, n - p.at.w);
          makeRoom(parent ? parent.parts : b.design.parts, p);
        }
      }, { preview: false }), { type: 'number', step: free ? '0.1' : '1' }));
      const shown = free ? p.at : { ...p.at, x: p.at.x + 1, y: p.at.y + 1 };
      for (const [k, label] of [['x', free ? t('builderLeftPc') : t('builderColumn')], ['y', free ? t('builderTopPc') : t('builderRow')], ['w', t('builderWidth')], ['h', t('builderHeight')]]) {
        const f = field(k, label);
        f.querySelector('input').value = String(shown[k]);
        box.append(f);
      }
      // Folded, as a drag sets it: its own panel, the place summed up on its line.
      const fold = el('details', 'wdb-sec wdb-fold');
      fold.open = !!b.placeOpen;
      fold.addEventListener('toggle', () => { b.placeOpen = fold.open; });
      const summary = el('summary', 'wdb-fold-head');
      const pc = free ? ' %' : '';
      summary.append(el('span', 'wdb-h4', parent ? t(free ? 'builderPlaceFree' : 'builderPlaceFine') : t('builderPlace')),
        el('span', 'wdb-fold-now', `${shown.x}${pc}, ${shown.y}${pc} · ${shown.w} × ${shown.h}${pc}`), icon('down'));
      fold.append(summary, box);
      // On a pages container: which page it's on.
      if (parent && parent.mode === 'pages') {
        fold.append(row(t('builderOnPage'), selectOf((parent.pages || []).map((pg, i) => [String(i), pg.name || t('builderPageN', { n: i + 1 })]), String(p.page || 0), v => change(() => {
          p.page = Number(v);
          (b.editPage || (b.editPage = {}))[parent.id] = p.page;
          makeRoom(parent.parts, p);
        }))));
      }
      body.append(fold);
    }

    /** Every calculated value of the design: what a `{part}` source may name. */
    const everyPart = () => b.design.parts.flatMap(p => [p, ...(p.parts || [])]);
    /** The components another may read: calculated values, widget states and repeaters (how many they show). */
    const allCalcs = () => everyPart().filter(p => SOURCE_KINDS.includes(p.kind));
    const sourceKind = src => (!src || 'slot' in src ? 'device' : 'time' in src || 'since' in src || 'until' in src ? 'time' : 'part' in src ? 'calc' : 'variable');
    const TIME_REFS = ['clock', 'seconds', 'date', 'weekday', 'since', 'until'];

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
      wrap.append(selectOf(kinds, kind, (v) => {
        if (v === kind) return;
        set(v === 'device' ? { slot: '' } : v === 'variable' ? { variable: '' } : v === 'calc' ? { part: calcs[0].id } : { time: 'clock' });
      }));
      // A text's value may be the source's name instead (a device's, a variable's).
      const named = next => (o.time && src && src.show === 'name' ? { ...next, show: 'name' } : next);
      if (kind === 'device') wrap.append(slotButton(src && src.slot, item => set(named({ slot: item.id }))));
      else if (kind === 'variable') wrap.append(listPicker('variable', src.variable || '', item => set(named({ variable: item ? item.id : '' }))));
      else if (kind === 'time') {
        const which = 'since' in src ? 'since' : 'until' in src ? 'until' : src.time;
        wrap.append(selectOf(TIME_REFS.map(x => [x, t(`builderRef_${x}`)]), which, v => set(v === 'since' ? { since: '' } : v === 'until' ? { until: '22:00' } : { time: v })));
        if (which === 'since') wrap.append(slotButton(src.since, item => set({ since: item.id })));
        if (which === 'until') wrap.append(textInput(src.until || '22:00', v => { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) set({ until: v }); }, { type: 'time' }));
      } else {
        const sel = el('select', 'wd-input');
        for (const [id, label] of calcs.map(c => [c.id, partTitle(c)])) {
          const opt = el('option', null, label);
          opt.value = id;
          opt.selected = id === src.part;
          sel.append(opt);
        }
        sel.addEventListener('change', () => set(named({ part: sel.value })));
        wrap.append(sel);
      }
      if (o.time && kind !== 'time' && src) {
        wrap.append(checkLine(t('builderRefName'), src.show === 'name', (v) => {
          const next = { ...src };
          if (v) next.show = 'name'; else delete next.show;
          set(next);
        }));
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
        const src = r || { slot: '' };
        const sum = sourceSummary(src);
        // Its name instead: no reading on its line.
        if (src.show === 'name') sum.value = null;
        body.append(itemLine('refs', i, {
          key: `{${i + 1}}`, ...sum,
          remove: () => change(() => {
            // The later values move up one, and the text with them.
            p.refs.splice(i, 1);
            p.text = String(p.text || '').replace(/\{([1-6])\}/g, (m, n) => (Number(n) === i + 1 ? '' : Number(n) > i + 1 ? `{${Number(n) - 1}}` : m)).replace(/\s{2,}/g, ' ').trim();
          }),
          fill: (box) => {
            box.append(sourcePicker(r, next => change(() => { p.refs[i] = next; }), { time: true, self: p.id }));
            // How a value's number shows: its decimals, and with or without its unit.
            if (r && sourceKind(r) !== 'time' && r.show !== 'name') {
              const put = next => change(() => { p.refs[i] = next; }, { preview: false });
              const fmt = el('div', 'wdb-fmt');
              fmt.append(el('span', 'wdb-label', t('builderDecimals')), selectOf([['', t('builderAuto')], ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']], r.decimals == null ? '' : String(r.decimals), (v) => {
                const next = { ...r };
                if (v === '') delete next.decimals; else next.decimals = Number(v);
                put(next);
              }), checkLine(t('builderRefUnits'), !r.plain, (v) => {
                const next = { ...r };
                if (v) delete next.plain; else next.plain = true;
                put(next);
              }));
              box.append(fmt);
            }
          },
        }));
      });
      const add = addButton(t('builderInsert'), () => change(() => {
        p.refs = [...refs, { slot: '' }];
        p.text = `${String(p.text || '').trimEnd()} {${p.refs.length}}`.trim();
        openItem('refs', p.refs.length - 1);
      }));
      add.disabled = refs.length >= MAX_REFS;
      body.append(add);
      if (!refs.length) body.append(el('p', 'wd-hint', t('builderRefsHint')));
    }

    /** A text's line *Shows as: …*, the text as the preview draws it, once it has values. */
    function fillShowsAs() {
      const s = b && b.showsAs;
      if (!s || !s.node.isConnected) return;
      const n = nodeOf(s.id);
      const text = n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
      s.node.textContent = text ? t('builderShowsAs', { text }) : '';
      s.node.hidden = !text;
    }

    /** A plain checkbox and its label on one line (`title`: what it means, as a tooltip). */
    function checkLine(label, on, set, title) {
      const r = el('label', 'wdb-check');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = !!on;
      box.addEventListener('change', () => set(box.checked));
      r.append(box, el('span', null, label));
      if (title) r.title = title;
      return r;
    }

    function pagesRows(body, p) {
      const pages = p.pages || [];
      const editing = Math.min(pages.length - 1, (b.editPage && b.editPage[p.id]) || 0);
      body.append(row(t('builderEditPage'), segs(pages.map((pg, i) => [i, pg.name || String(i + 1)]), editing, i => showEditPage(p, i)), t('builderEditPageHint')));
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
      const add = addButton(t('builderAddPage'), () => change(() => { p.pages = [...pages, { name: '' }]; }, { preview: false }));
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

    /** Any other component's actions when tapped: as a button's, under a heading of their own. */
    function tapRows(body, p) {
      body.append(el('h4', 'wdb-h4', t('builderWhenTapped')));
      actionRows(body, p, true);
    }

    /** A button's actions, in order, and how it's pressed (`tap`: a component's, its press only once it has some). */
    function actionRows(body, p, tap = false) {
      if (!tap || (p.actions || []).length) body.append(row(t('builderPress'), segs([['tap', t('builderPress_tap')], ['confirm', t('builderPress_confirm')], ['long', t('builderPress_long')]], p.press || 'tap', v => change(() => { p.press = v; }, { preview: false }))));
      if (!tap) body.append(el('h4', 'wdb-h4', t('builderActions')));
      const actions = p.actions || [];
      const states = everyPart().filter(x => x.kind === 'state');
      actions.forEach((a, i) => {
        const kinds = ACTION_KINDS.filter(k => k !== 'state' || states.length).map(k => [k, t(`builderAction_${k}`)]);
        const set = next => change(() => { p.actions[i] = { ...a, ...next }; });
        body.append(itemLine(tap ? 'tap' : 'actions', i, {
          key: String(i + 1), ...actionSummary(a), remove: () => change(() => { p.actions.splice(i, 1); if (!p.actions.length) delete p.actions; }),
          fill: (box) => {
            box.append(selectOf(kinds, a.do, v => change(() => {
              p.actions[i] = v === 'state' ? { do: v, part: states[0].id, value: 'toggle' } : v === 'set' || v === 'variable' ? { do: v, value: '' } : { do: v };
            })));
            if (a.do === 'set') box.append(slotButton(a.slot, item => set({ slot: item.id })));
            if (a.do === 'variable') box.append(listPicker('variable', a.variable, item => set({ variable: item ? item.id : '' })));
            if (a.do === 'flow') box.append(listPicker('flow', a.flowId, item => set({ flowId: item ? item.id : '' })));
            if (a.do === 'dashboard') box.append(selectOf([['', t('choose')], ...wd.dashboards.map(d => [d.id, d.name || t('untitled')])], a.dashboard || '', v => set({ dashboard: v })));
            if (a.do === 'state') box.append(selectOf(states.map(x => [x.id, partTitle(x)]), a.part, v => set({ part: v })));
            if (a.do === 'set' || a.do === 'variable' || a.do === 'state') {
              box.append(textInput(a.value, v => change(() => { p.actions[i] = { ...a, value: v.trim().slice(0, 60) }; }, { preview: false }), { placeholder: t('builderActionValue') }));
            }
          },
        }));
      });
      const add = addButton(t('builderAddAction'), () => change(() => { p.actions = [...actions, { do: 'set', value: 'toggle' }]; openItem(tap ? 'tap' : 'actions', actions.length); }));
      add.disabled = actions.length >= MAX_ACTIONS;
      body.append(add);
      // A tap's hint once there's something it does; a button's always (it needs the key).
      if (!tap || actions.length) body.append(el('p', 'wd-hint', t(tap ? 'builderWhenTappedHint' : 'builderActionsHint')));
    }

    // The colours a ring, segment or series gets without one of its own (the widget's defaults).
    const RING_COLOURS = ['blue', 'green', 'orange'];
    const SEGMENT_COLOURS = ['blue', 'green', 'orange', 'purple', 'teal', 'pink'];
    const SERIES_COLOURS = ['blue', 'red', 'orange', 'yellow', 'green', 'purple'];
    /** An item's colour as its key: a dot in the palette's colour (as the preview's Muted or Vivid) or its own. */
    function swatchKey(colour) {
      const dot = el('span', `wk wdb-item-swatch${b.vivid ? ' wk-deep' : ''}`);
      if (colour) dot.style.setProperty('--sw', /^#/.test(colour) ? colour : `var(--wk-${colour})`);
      return dot;
    }

    /** An action's line: what it does, on what, and to which value. */
    function actionSummary(a) {
      let sub = '';
      if (a.do === 'set') { const info = a.slot && slotInfo(a.slot); sub = info && info.device ? [info.device, info.title].filter(Boolean).join(' · ') : ''; }
      if (a.do === 'variable') { const v = a.variable && b.state && b.state.variables && b.state.variables[a.variable]; sub = v ? v.name : ''; }
      if (a.do === 'flow') { const f = a.flowId && b.state && b.state.flows && b.state.flows[a.flowId]; sub = f ? f.name : ''; }
      if (a.do === 'dashboard') { const d = wd.dashboards.find(x => x.id === a.dashboard); sub = d ? d.name || t('untitled') : ''; }
      if (a.do === 'state') { const x = everyPart().find(c => c.id === a.part); sub = x ? partTitle(x) : ''; }
      return { title: t(`builderAction_${a.do}`), sub, value: a.value ? `→ ${a.value}` : null };
    }

    function imageRows(body, p) {
      const src = p.image || { kind: 'url', url: '' };
      body.append(row(t('builderImageFrom'), segs([['url', t('builderImage_url')], ['device', t('builderImage_device')]], src.kind, v => change(() => {
        p.image = v === 'url' ? { kind: 'url', url: '' } : { kind: 'device', device: '' };
        p.refresh = v === 'url' ? 0 : 5;
      }))));
      if (src.kind === 'url') {
        body.append(row(t('builderImageUrl'), textInput(src.url, v => change(() => { p.image = { kind: 'url', url: v.trim().slice(0, 500) }; }), { type: 'url', placeholder: 'https://…' }), t('builderImageUrlHint')));
      } else {
        body.append(row(t('builderImage_device'), listPicker('image', src.device, item => change(() => {
          if (item) (b.imageNames || (b.imageNames = {}))[item.id] = item.name;
          p.image = { kind: 'device', device: item ? item.id : '' };
        }))));
      }
      // A device's picture, or a web address's (a camera's still) read again.
      body.append(row(t('builderRefresh'), selectOf([['0', t('builderRefreshNever')], ...[1, 5, 15, 60].map(m => [String(m), t('builderEveryMin', { n: m })])], String(p.refresh != null ? p.refresh : src.kind === 'url' ? 0 : 5), v => change(() => { p.refresh = Number(v); }, { preview: false }))));
      body.append(row(t('builderFit'), segs([['cover', t('builderFit_cover')], ['contain', t('builderFit_contain')]], p.fit || 'cover', v => change(() => { p.fit = v; }, { preview: false }))));
    }

    function ringRows(body, p) {
      const rings = p.rings || [];
      body.append(el('h4', 'wdb-h4', t('builderRings')));
      rings.forEach((r, i) => {
        body.append(itemLine('rings', i, {
          key: swatchKey(r.color || RING_COLOURS[i]), ...sourceSummary(r.src), remove: () => change(() => { p.rings.splice(i, 1); }),
          fill: (box) => {
            box.append(sourcePicker(r.src, src => change(() => { p.rings[i] = { ...r, src }; }), { self: p.id }),
              colourPicker(r.color, v => change(() => { r.color = v || null; }, { preview: false }), { none: t('builderAuto') }));
            const two = el('div', 'wdb-two');
            two.append(textInput(r.min, v => change(() => { const n = numOrNull(v); if (n === undefined) delete r.min; else r.min = n; }, { preview: false }), { type: 'number', placeholder: `${t('builderMin')} · ${t('builderAuto')}` }),
              textInput(r.max, v => change(() => { const n = numOrNull(v); if (n === undefined) delete r.max; else r.max = n; }, { preview: false }), { type: 'number', placeholder: `${t('builderMax')} · ${t('builderAuto')}` }));
            box.append(two);
          },
        }));
      });
      const add = addButton(t('builderAddRing'), () => change(() => { p.rings = [...rings, { src: { slot: '' }, color: null }]; openItem('rings', rings.length); }));
      add.disabled = rings.length >= MAX_RINGS;
      body.append(add, el('p', 'wd-hint', t('builderRingsHint')));
      body.append(el('h4', 'wdb-h4', t('builderGroup_show')));
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
        two.append(selectOf(RULE_OPS.map(o => [o, t(`builderOp_${o}`)]), p.test.op, v => change(() => { p.test = { ...p.test, op: v }; if (v !== 'between') delete p.test.to; })),
          ...testValues(p.test, next => change(() => { p.test = next; }, { preview: false })));
        body.append(two);
      }
      body.append(row(t('builderRepeatSort'), segs([['name', t('builderSort_name')], ['up', t('builderSort_up')], ['down', t('builderSort_down')]], p.sort || 'name', v => change(() => { p.sort = v; }, { preview: false }))));
      body.append(row(t('builderRepeatLimit'), textInput(p.limit, v => change(() => { const n = Math.round(Number(v)); if (String(v).trim() && Number.isFinite(n) && n >= 1) p.limit = Math.min(24, n); else delete p.limit; }, { preview: false }), { type: 'number', placeholder: t('builderAuto') })));
      body.append(row(t('builderItemStyle'), segs([['row', t('builderItem_row')], ['tile', t('builderItem_tile')]], p.itemStyle || 'row', v => change(() => { p.itemStyle = v; }, { preview: false }))));
      body.append(row(t('builderColumns'), segs([1, 2, 3, 4].map(n => [n, String(n)]), p.columns || 1, v => change(() => { p.columns = v; }, { preview: false }))));
      body.append(checkRow(t('builderRepeatControl'), p.control, v => change(() => { if (v) p.control = true; else delete p.control; }, { preview: false }), t('builderRepeatControlHint')));
      body.append(row(t('builderRepeatEmpty'), textInput(p.text, v => change(() => { p.text = v.slice(0, 200); }, { preview: false }), { placeholder: t('builderRepeatEmptyHint') })));
      body.append(el('p', 'wd-hint', t('builderRepeatHint')));
    }

    function segmentRows(body, p) {
      const list = p.segments || [];
      body.append(el('h4', 'wdb-h4', t('builderSegments')));
      list.forEach((x, i) => {
        const sum = sourceSummary(x.src);
        body.append(itemLine('segments', i, {
          key: swatchKey(x.color || SEGMENT_COLOURS[i]), title: x.label || sum.title, sub: x.label ? [sum.title, sum.sub].filter(Boolean).join(' · ') : sum.sub, value: sum.value,
          remove: () => change(() => { p.segments.splice(i, 1); }),
          fill: (box) => {
            box.append(row(t('builderLabel'), textInput(x.label, v => change(() => { x.label = v.trim().slice(0, 24); }, { preview: false }), { placeholder: sum.title })),
              colourPicker(x.color, v => change(() => { x.color = v || null; }, { preview: false }), { none: t('builderAuto') }),
              sourcePicker(x.src, src => change(() => { p.segments[i] = { ...x, src }; }), { self: p.id }));
          },
        }));
      });
      const add = addButton(t('builderAddSegment'), () => change(() => { p.segments = [...list, { src: { slot: '' }, color: null, label: '' }]; openItem('segments', list.length); }));
      add.disabled = list.length >= MAX_SEGMENTS;
      body.append(add, el('p', 'wd-hint', t('builderSegmentsHint')));
      body.append(el('h4', 'wdb-h4', t('builderGroup_show')));
      body.append(row(t('builderBarStyle'), segs([['bar', t('builderBarStyle_bar')], ['donut', t('builderBarStyle_donut')]], p.barStyle || 'bar', v => change(() => { p.barStyle = v; }, { preview: false }))));
      body.append(row(t('builderScale'), segs([['sum', t('builderScale_sum')], ['max', t('builderScale_max')]], p.scale || 'sum', v => change(() => { p.scale = v; if (v === 'max' && !p.max) p.max = 100; }, { preview: false }))));
      if (p.scale === 'max') body.append(row(t('builderMax'), textInput(p.max, v => change(() => { const n = numOrNull(v); p.max = n && n > 0 ? n : 100; }, { preview: false }), { type: 'number' })));
      body.append(row(t('builderUnits'), textInput(p.units, v => change(() => { p.units = v.trim().slice(0, 12); }, { preview: false }), { placeholder: t('builderAuto') })));
      // A donut has its list beside it only where it's wide (the widget's `size.wide`): say so where it isn't.
      const box = parentOf(p.id);
      const wide = !box ? p.at.w >= 3 : box.mode === 'free' ? p.at.w >= 60 : p.at.w >= 8;
      const hidden = p.barStyle === 'donut' && !wide && p.legend !== false;
      body.append(checkRow(t('builderLegend'), p.legend !== false, v => change(() => { p.legend = v; }, { preview: false }), hidden ? t('builderLegendDonutHint') : undefined));
    }


    /** A Chart's series (each a device value and its colour), its span, lines or bars, its scale and its edges. */
    function chartRows(body, p) {
      const list = p.series || [];
      body.append(el('h4', 'wdb-h4', t('builderSeries')));
      list.forEach((x, i) => {
        const sum = sourceSummary({ slot: x.slot });
        body.append(itemLine('series', i, {
          key: swatchKey(x.color || SERIES_COLOURS[i]), title: x.title || sum.title, sub: x.title ? [sum.title, sum.sub].filter(Boolean).join(' · ') : sum.sub, value: sum.value,
          remove: () => change(() => { p.series.splice(i, 1); }),
          fill: (box) => {
            box.append(slotButton(x.slot, item => change(() => { p.series[i] = { ...x, slot: item.id }; })),
              row(t('builderSeriesTitle'), textInput(x.title, v => change(() => { const s2 = v.trim().slice(0, 24); if (s2) x.title = s2; else delete x.title; }, { preview: false }), { placeholder: t('builderAuto') })),
              colourPicker(x.color, v => change(() => { x.color = v || null; }, { preview: false }), { none: t('builderAuto') }));
          },
        }));
      });
      const add = addButton(t('builderAddSeries'), async () => {
        try {
          const devices = await wd.valueDevices('values');
          wd.chooseValue(devices, null, item => change(() => { p.series = [...(p.series || []), { slot: item.id, color: null }]; }));
        } catch (err) { failed(err); }
      });
      add.disabled = list.length >= MAX_SERIES;
      body.append(add);
      body.append(el('h4', 'wdb-h4', t('builderGroup_show')));
      spanRows(body, p);
      // Chart · Basic's options.
      const quiet = fn => change(fn, { preview: false });
      body.append(row(t('builderChartStyle'), segs([['area', t('builderChart_area')], ['line', t('builderChart_line')], ['bars', t('builderChart_bars')]], p.chartStyle || 'area', v => quiet(() => { p.chartStyle = v; }))));
      body.append(row(t('builderChartScale'), segs([['fit', t('builderChartScale_fit')], ['zero', t('builderChartScale_zero')]], p.chartScale || 'fit', v => quiet(() => { if (v === 'zero') p.chartScale = v; else delete p.chartScale; }))));
      body.append(row(t('builderChartLegend'), segs([['above', t('builderChartLegend_above')], ['below', t('builderChartLegend_below')], ['hidden', t('builderChartLegend_hidden')]], p.chartLegend || 'above', v => quiet(() => { p.chartLegend = v; }))));
      body.append(checkRow(t('builderHeader'), p.header, v => quiet(() => { if (v) p.header = true; else delete p.header; })));
      body.append(checkRow(t('builderSmooth'), p.smooth, v => quiet(() => { if (v) p.smooth = true; else delete p.smooth; })));
      body.append(checkRow(t('builderNegative'), p.negative, v => quiet(() => { if (v) p.negative = true; else delete p.negative; })));
      body.append(checkRow(t('builderAxis'), p.axis !== false, v => quiet(() => { p.axis = v; })));
    }

    /**
     * A Repeater: the ready-made component it repeats, and its devices (picked, or every one with a capability in a
     * room), each filling in the component's values of *the widget's device*.
     */
    function eachRows(body, p) {
      const ready = designs().filter(d => d.ready);
      if (!ready.length) body.append(el('p', 'wd-hint wdb-note', t('builderEachNoReady')));
      body.append(row(t('builderEachReady'), selectOf([['', t('choose')], ...ready.map(d => [d.id, d.name || t('untitled')])], p.ready || '', v => change(() => { if (v) p.ready = v; else delete p.ready; })), t('builderEachReadyHint')));
      const byCap = !!p.capability;
      body.append(row(t('builderEachDevices'), segs([['pick', t('builderEach_pick')], ['cap', t('builderEach_cap')]], byCap ? 'cap' : 'pick', v => change(() => {
        if (v === 'cap') { delete p.devices; p.capability = p.capability || 'onoff'; } else { delete p.capability; delete p.zone; p.devices = p.devices || []; }
      }))));
      if (byCap) {
        const { caps, zones } = capsAndZones();
        body.append(row(t('builderRepeatCap'), selectOf([['', t('choose')], ...caps], p.capability || '', v => change(() => { if (v) p.capability = v; else delete p.capability; }))));
        body.append(row(t('builderRepeatZone'), selectOf([['', t('builderEverywhere')], ...zones], p.zone || '', v => change(() => { if (v) p.zone = v; else delete p.zone; }))));
      } else {
        const names = (p.devices || []).map(id => ((b.devices || []).find(d => d.id === id) || {}).name || id);
        const pick = button('wd-btn wd-choice', names.length ? names.join(', ') : t('chooseDevices'), async () => {
          try {
            const items = await request('GET', '/web/devices?type=custom');
            wd.chooseDevices({ devices: { singular: false } }, items, p.devices || [], ids => change(() => { p.devices = ids.slice(0, MAX_EACH); }));
          } catch (err) { failed(err); }
        });
        body.append(row(t('devices'), pick));
      }
      body.append(row(t('builderColumns'), segs([1, 2, 3, 4].map(n => [n, String(n)]), p.columns || 1, v => change(() => { p.columns = v; }, { preview: false }))));
      body.append(row(t('builderRepeatLimit'), textInput(p.limit, v => change(() => { const n = Math.round(Number(v)); if (String(v).trim() && Number.isFinite(n) && n >= 1) p.limit = Math.min(MAX_EACH, n); else delete p.limit; }), { type: 'number', placeholder: t('builderAuto') })));
    }

    /** The capabilities and rooms of the value picker's devices, by title (apps' logs left out). */
    function capsAndZones() {
      const caps = new Map();
      const zones = new Map();
      for (const d of b.devices || []) {
        if (d.id === 'log') continue;
        for (const c of d.caps) if (!caps.has(c.id)) caps.set(c.id, c.title || c.id);
        if (d.zone && d.zone.id) zones.set(d.zone.id, d.zone.name);
      }
      const byTitle = m => [...m].sort((x, y) => String(x[1]).localeCompare(String(y[1])));
      return { caps: byTitle(caps).map(([id, title]) => [id, `${title} (${id})`]), zones: byTitle(zones) };
    }

    /** An *Add …* button: quiet, with a plus, at the start of its line under what it adds to. */
    function addButton(label, fn) {
      const x = button('wd-btn quiet small wdb-add', '', fn);
      x.append(icon('plus'), el('span', null, label));
      return x;
    }

    function shapeRows(body, p) {
      body.append(row(t('builderShape'), segs([['rect', t('builderShape_rect')], ['circle', t('builderShape_circle')], ['line', t('builderShape_line')]], p.shape || 'rect', v => change(() => {
        p.shape = v;
        if (v === 'rect' && p.radius == null) p.radius = 10;
        if (v === 'line') { if (!p.thickness) p.thickness = 2; if (!p.dir) p.dir = 'horizontal'; }
      }, { preview: false }))));
      if (p.shape === 'line') body.append(row(t('builderDirection'), segs([['horizontal', t('builderHorizontal')], ['vertical', t('builderVertical')]], p.dir || 'horizontal', v => change(() => { p.dir = v; }, { preview: false }))));
    }

    /** A test's or a rule's value: one field, or for `between` two (from, to). */
    function testValues(test, put) {
      const from = textInput(test.value, v => put({ ...test, value: v.slice(0, 60) }), { placeholder: t(test.op === 'between' ? 'builderMin' : 'builderRuleValue') });
      if (test.op !== 'between') return [from];
      return [from, textInput(test.to, v => put({ ...test, to: v.slice(0, 60) }), { placeholder: t('builderMax') })];
    }

    function calcRows(body, p) {
      body.append(row(t('builderCalc'), selectOf(CALC_OPS.map(o => [o, t(`builderCalc_${o}`)]), p.op || 'sum', v => change(() => {
        p.op = v;
        if (v === 'count' && !p.test) p.test = { op: 'is', value: 'on' };
        if (v === 'formula' && p.formula == null) p.formula = '';
        if (v === 'change' && !p.span) p.span = '1h';
      }))));
      // A change (Trend's) and minutes since a change read their first value only.
      if (p.op === 'change') {
        body.append(el('h4', 'wdb-h4', t('builderTrendSpan')));
        spanRows(body, p, 'span', '1h');
        body.append(checkRow(t('builderPercent'), p.percent, v => change(() => { if (v) p.percent = true; else delete p.percent; }, { preview: false })));
        body.append(el('p', 'wd-hint', t('builderTrendHint')));
      }
      if (p.op === 'since') body.append(el('p', 'wd-hint', t('builderSinceHint')));
      body.append(el('h4', 'wdb-h4', t('builderInputs')));
      const inputs = p.inputs || [];
      inputs.forEach((src, i) => {
        body.append(itemLine('inputs', i, {
          key: p.op === 'formula' ? INPUT_NAMES[i] : String(i + 1), ...sourceSummary(src), remove: () => change(() => { p.inputs.splice(i, 1); }),
          fill: box => box.append(sourcePicker(src, next => change(() => { p.inputs[i] = next; }), { calc: false })),
        }));
      });
      const add = addButton(t('builderAddInput'), () => change(() => { p.inputs = [...inputs, { slot: '' }]; openItem('inputs', inputs.length); }));
      add.disabled = inputs.length >= MAX_INPUTS;
      body.append(add);
      if (p.op === 'count') {
        const test = p.test || { op: 'is', value: 'on' };
        const line = el('div', 'wdb-two');
        line.append(selectOf(RULE_OPS.map(o => [o, t(`builderOp_${o}`)]), test.op, v => change(() => { p.test = { ...test, op: v }; if (v !== 'between') delete p.test.to; })),
          ...testValues(test, next => change(() => { p.test = next; }, { preview: false })));
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
      body.append(el('p', 'wd-hint', t('builderSourceOnlyHint')));
    }


    const clampTo = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

    /**
     * The Style tab: how it looks, not what it shows (that's Settings). Its background (a tile, a plain pill or none,
     * and a container's colour or gradient), its colours (an accent, a shape's fill, the text's), the text's size, weight
     * and alignment, its icon, the parts shown, and a shape's or a bar's measures.
     */
    function lookTab(body, p) {
      const quiet = fn => change(fn, { preview: false });
      // Background: a calculated value has none; a shape is its own.
      if (p.kind !== 'shape') {
        const style = ['tile', 'pill', 'none', 'postit'].includes(p.style) && (p.style !== 'postit' || p.kind === 'text') ? p.style : (p.tile === false || ['text', 'icon', 'sparkline', 'arc', 'bar', 'each'].includes(p.kind) ? 'none' : 'tile');
        // A Text may also be Notes' Post-it.
        const styles = [['tile', t('builderStyleTile')], ['pill', t('builderStylePill')], ['none', t('builderStyleNone')], ...(p.kind === 'text' ? [['postit', t('builderStylePostit')]] : [])];
        body.append(row(t('builderStyle'), segs(styles, style, v => quiet(() => { p.style = v; delete p.tile; })), t(p.kind === 'container' && style !== 'tile' ? `builderBoxStyleHint_${style}` : `builderStyleHint_${style}`)));
        // A Post-it's paper, in the palette's colours (yellow without one).
        if (p.kind === 'text' && style === 'postit') body.append(row(t('builderPaper'), colourPicker(p.color, v => quiet(() => { p.color = v; }), { none: t('builderAuto') })));
      }
      if (p.kind === 'container') backgroundRows(body, p, t('builderFill'), t('builderNone'));
      if (p.kind === 'shape') {
        // A shape's fill: a colour (the palette's or its own), or a gradient.
        const bg = p.background || { kind: 'none' };
        const gradient = bg.kind === 'gradient';
        body.append(row(t('builderFill'), segs([['color', t('builderColour')], ['gradient', t('builderGradient')]], gradient ? 'gradient' : 'color', v => quiet(() => {
          if (v === 'gradient') p.background = { kind: 'gradient', from: (bg.kind === 'color' && bg.from) || p.color || 'blue', to: 'purple', angle: 135 };
          else { p.background = { kind: 'none' }; if (bg.kind !== 'none' && !p.color) p.color = bg.from; }
        }))));
        if (gradient) backgroundRows(body, p, null, null);
        else body.append(colourPicker(p.color || (bg.kind === 'color' ? bg.from : null), v => quiet(() => { p.color = v; p.background = { kind: 'none' }; }), { none: t('builderShapeGrey') }));
        const two = el('div', 'wdb-two');
        two.append(row(t('builderOpacity'), textInput(p.opacity != null ? p.opacity : 100, v => quiet(() => { p.opacity = clampTo(v, 10, 100, 100); }), { type: 'number' })));
        if ((p.shape || 'rect') === 'rect') two.append(row(t('builderRadius'), textInput(p.radius != null ? p.radius : 10, v => quiet(() => { p.radius = clampTo(v, 0, 32, 10); }), { type: 'number' })));
        if (p.shape === 'line') two.append(row(t('builderThickness'), textInput(p.thickness || 2, v => quiet(() => { p.thickness = clampTo(v, 1, 8, 2); }), { type: 'number' })));
        body.append(two);
      }
      // An Arc or Bar coloured by level takes its colours from the level, so its own colour would do nothing.
      if (ACCENT_KINDS.includes(p.kind) && (p.kind === 'arc' || p.kind === 'bar') && p.zones) {
        body.append(row(t('builderColour'), el('p', 'wd-hint', t('builderZonesColourHint'))));
      } else if (ACCENT_KINDS.includes(p.kind)) {
        body.append(row(t('builderColour'), colourPicker(p.color, v => quiet(() => { p.color = v; })), t('builderColourHint')));
      }
      if (TEXT_KINDS.includes(p.kind)) {
        body.append(row(t('builderTextColour'), colourPicker(p.textColor, v => quiet(() => { if (v) p.textColor = v; else delete p.textColor; }), { none: t('builderAuto') }), t('builderTextColourHint')));
      }
      if (p.kind === 'text') {
        // Notes' sizes, and Big.
        const size = ({ body: 'small', heading: 'default' })[p.size] || p.size || 'small';
        body.append(row(t('builderSize'), segs([['display', t('builderSizeDisplay')], ['large', t('builderSizeLarge')], ['default', t('builderSizeDefault')], ['small', t('builderSmall')]], size, v => quiet(() => { p.size = v; }))));
        body.append(row(t('builderWeight'), segs([['', t('builderAuto')], ['regular', t('builderWeight_regular')], ['medium', t('builderWeight_medium')], ['bold', t('builderWeight_bold')]], p.weight || '', v => quiet(() => { if (v) p.weight = v; else delete p.weight; }))));
        body.append(row(t('builderAlign'), segs([['left', t('builderLeft')], ['center', t('builderCenter')], ['right', t('builderRight')]], p.align || 'left', v => quiet(() => { p.align = v; }))));
        // Notes' *Long text*; a Post-it shows three lines.
        if (p.style !== 'postit') body.append(row(t('builderOverflow'), segs([['ellipsis', t('builderOverflow_ellipsis')], ['scroll', t('builderOverflow_scroll')], ['wrap', t('builderOverflow_wrap')]], p.overflow || 'wrap', v => quiet(() => { if (v === 'wrap') delete p.overflow; else p.overflow = v; }))));
        body.append(checkRow(t('builderTextMuted'), p.muted, v => quiet(() => { if (v) p.muted = true; else delete p.muted; })));
      }
      // Quick Actions' *Active tile style*.
      if (p.kind === 'switch') body.append(row(t('builderActive'), segs([['tint', t('builderActive_tint')], ['lighter', t('builderActive_lighter')]], p.active || 'tint', v => quiet(() => { if (v === 'lighter') p.active = v; else delete p.active; }))));
      if (p.kind === 'arc' || p.kind === 'bar') {
        const thick = p.kind === 'arc' ? 12 : 6;
        body.append(row(t('builderThickness'), textInput(p.thickness || thick, v => quiet(() => { p.thickness = clampTo(v, 2, 24, thick); }), { type: 'number' })));
      }
      if (p.kind === 'icon') body.append(checkRow(t('builderIconGrow'), p.grow, v => quiet(() => { if (v) p.grow = true; else delete p.grow; })));
      if (drawsIcon(p)) lookIcon(body, p);
      if (ELEMENTS[p.kind]) {
        body.append(el('h4', 'wdb-h4', t('builderShowParts')));
        for (const e of ELEMENTS[p.kind]) {
          body.append(checkLine(t(`builderEl_${e}`), !(p.hide || []).includes(e), v => quiet(() => {
            const hide = new Set(p.hide || []);
            if (v) hide.delete(e); else hide.add(e);
            if (hide.size) p.hide = ELEMENTS[p.kind].filter(x => hide.has(x)); else delete p.hide;
          })));
        }
        body.append(el('p', 'wd-hint', t('builderShowPartsHint')));
      }
    }

    /**
     * A colour: none (`none`'s label; `false` for no such choice), the palette's twelve as Muted or Vivid draws them (as
     * the preview), or one of its own from the browser's colour picker. `set(value)`: a palette name, `#rrggbb` or null;
     * `live(hex)` while the picker is open.
     */
    /** @param {any} value @param {(v: any) => void} set @param {{none?: any, live?: (hex: string) => void}} [o] */
    function colourPicker(value, set, { none = t('builderNoColour'), live = undefined } = {}) {
      const wrap = el('div', `wk wdb-swatches${b.vivid ? ' wk-deep' : ''}`);
      wrap.setAttribute('role', 'radiogroup');
      const custom = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
      const swatch = (id, title, paint, cls = '') => {
        const on = (value || '') === id;
        const x = button(`wdb-swatch${cls}${on ? ' on' : ''}`, '', () => set(id || null), title);
        x.setAttribute('role', 'radio');
        x.setAttribute('aria-checked', String(on));
        if (paint) x.style.setProperty('--sw', paint);
        return x;
      };
      if (none !== false) wrap.append(swatch('', none, '', ' none'));
      for (const c of window.WidgetkeeperKit.COLORS) wrap.append(swatch(c, colourName(c), `var(--wk-${c})`));
      const own = el('label', `wdb-swatch wdb-swatch-own${custom ? ' on' : ''}`);
      own.title = t('builderOwnColour');
      own.setAttribute('aria-label', t('builderOwnColour'));
      if (custom) own.style.setProperty('--sw', value);
      const input = el('input');
      input.type = 'color';
      input.value = custom ? value.toLowerCase() : '#2d4c7a';
      input.addEventListener('input', () => { own.style.setProperty('--sw', input.value); if (live) live(input.value); });
      input.addEventListener('change', () => set(input.value.toLowerCase()));
      own.append(input);
      wrap.append(own);
      return wrap;
    }

    /** The Style tab's icon, for a component that draws one. */
    function lookIcon(body, p) {
      const iconRow = el('div', 'wd-row');
      const current = wd.iconNode(p.icon);
      const pick = button('wd-btn', '', () => wd.pickIcon({ value: p.icon, noneLabel: t('builderNoIcon'), picked: v => change(() => { p.icon = v && !wd.isIconPicture(v) ? v : null; }, { preview: false }) }));
      if (current) pick.append(current);
      pick.append(el('span', null, p.icon ? t('builderChange') : t('builderNoIcon')));
      iconRow.append(pick);
      body.append(row(t('builderIcon'), iconRow, t('builderIconHint')));
    }

    function rulesTab(body, p) {
      const colours = window.WidgetkeeperKit.COLORS;
      // A clock or a date has no value either: like a shape, each rule names the one it checks.
      const valueless = VALUELESS_KINDS.includes(p.kind) && !(p.kind === 'icon' && p.slot);
      body.append(el('p', 'wd-hint', t(valueless ? 'builderRulesOtherHint' : 'builderRulesHint')));
      (p.rules || []).forEach((r, i) => {
        const then = r.look === 'hide' ? 'hide' : r.look === 'same' ? 'same' : 'colour';
        // Its line: the test (Is above 24), on what, and what it does then (a dot and its colour, or Hide it).
        const test = `${t(`builderOp_${r.op}`)} ${r.value === '' || r.value == null ? '…' : r.value}${r.op === 'between' ? ` – ${r.to || '…'}` : ''}`;
        const of = r.of ? sourceSummary(r.of).title : t('builderRuleOfSelf');
        const look = el('span', 'wdb-item-look');
        if (then === 'colour') look.append(swatchKey(r.look), colourName(r.look) || '');
        else look.append(t(then === 'hide' ? 'builderHide' : 'builderKeepColour'));
        body.append(itemLine('rules', i, {
          key: String(i + 1), title: test, sub: of, value: look, remove: () => change(() => { p.rules.splice(i, 1); }, { preview: false }),
          fill: (box) => {
            if (!valueless) {
              box.append(row(t('builderRulesLead'), selectOf([['self', t('builderRuleOfSelf')], ['other', t('builderRuleOfOther')]], r.of ? 'other' : 'self', v => change(() => {
                if (v === 'self') delete r.of; else r.of = { slot: '' };
              }))));
            }
            if (r.of || valueless) box.append(sourcePicker(r.of, src => change(() => { r.of = src; }), { self: p.id }));
            const line = el('div', 'wdb-rule');
            const op = el('select', 'wd-input');
            for (const o of RULE_OPS) { const opt = el('option', null, t(`builderOp_${o}`)); opt.value = o; opt.selected = r.op === o; op.append(opt); }
            // Between shows a second field: redrawn.
            op.addEventListener('change', () => change(() => { r.op = op.value; if (r.op === 'between') r.to = r.to || ''; else delete r.to; }));
            line.append(op, ...testValues(r, next => change(() => { r.value = next.value; if (r.op === 'between') r.to = next.to || ''; }, { preview: false })));
            box.append(line);
            // Then: a colour (the palette's or its own), hidden, or (with an icon) its colour kept.
            const looks = [['colour', t('builderColour')], ...(drawsIcon(p) ? [['same', t('builderKeepColour')]] : []), ['hide', t('builderHide')]];
            box.append(segs(looks, then, v => change(() => { r.look = v === 'colour' ? (colours.includes(r.look) || /^#/.test(r.look) ? r.look : 'red') : v; }, { preview: false })));
            if (then === 'colour') box.append(colourPicker(r.look, v => change(() => { r.look = v || 'red'; }, { preview: false }), { none: false }));
            // And the icon it shows meanwhile, where the component draws one.
            if (r.look !== 'hide' && drawsIcon(p)) {
              const pickIc = button('wd-btn quiet small wdb-rule-icon', '', () => wd.pickIcon({ value: r.icon || null, noneLabel: t('builderNoIcon'), picked: v => change(() => { if (v && !wd.isIconPicture(v)) r.icon = v; else delete r.icon; }, { preview: false }) }));
              const node = r.icon && wd.iconNode(r.icon);
              if (node) pickIc.append(node);
              pickIc.append(el('span', null, r.icon ? t('builderRuleIcon') : t('builderRuleIconNone')));
              box.append(pickIc);
            }
          },
        }));
      });
      if (!(p.rules || []).length) body.append(el('p', 'wd-muted', t('builderNoRules')));
      const add = addButton(t('builderAddRule'), () => change(() => {
        p.rules = [...(p.rules || []), { op: 'above', value: '', look: 'red', ...(valueless ? { of: { slot: '' } } : {}) }];
        openItem('rules', p.rules.length - 1);
      }, { preview: false }));
      add.disabled = (p.rules || []).length >= MAX_RULES;
      body.append(add);
    }

    function flowTab(body, p) {
      const name = `${b.design.name} · ${partTitle(p)}`;
      body.append(el('p', 'wd-hint', t('builderFlowHint', { name })));
      // An icon only where it's drawn (a Ring's with one in its middle).
      for (const prop of flowPropsOf(p.kind).filter(x => x !== 'icon' || drawsIcon(p))) {
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

    /**
     * The canvas' keys, not while typing in a field: Delete (or Backspace) removes the selected component, Escape goes
     * up to its container and then lets go, the arrows move it a cell (1 % free-form) and with Shift resize it; with
     * Ctrl or ⌘, Z undoes, Shift+Z (or Y) redoes and D duplicates the selected component.
     */
    function onKey(e) {
      if (!b || !b.node || !b.node.isConnected || e.defaultPrevented || e.altKey) return;
      const target = /** @type {HTMLElement} */ (e.target);
      if (target && target.closest && target.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      if (document.querySelector('dialog[open]')) return;
      const sel = b.selected && findPart(b.selected);
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoChange(); }
        else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redoChange(); }
        else if (key === 'd' && sel) { e.preventDefault(); duplicatePart(sel.id); }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removePart(sel.id); }
      else if (e.key === 'Escape' && sel) {
        e.preventDefault();
        const parent = parentOf(sel.id);
        select(parent ? parent.id : null);
      } else if (sel && ARROWS[e.key]) {
        e.preventDefault();
        nudge(sel, ...ARROWS[e.key], e.shiftKey);
      }
    }
    const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

    /**
     * Moves the selected component a cell (1 % free-form), or with `resize` makes it a cell larger or smaller; the
     * others make room on a grid. A run of nudges to one component within a second is one Undo step.
     */
    function nudge(p, dx, dy, resize) {
      const parent = parentOf(p.id);
      const free = !!parent && parent.mode === 'free';
      const n = free ? 100 : parent ? FINE.cols : cols();
      const min = free ? 4 : 1;
      const tallest = free ? 100 : parent ? 200 : 8;
      const now = Date.now();
      const same = b.nudged && b.nudged.id === p.id && now - b.nudged.at < 1000;
      const at = { ...p.at };
      if (resize) {
        at.w = clamp(at.w + dx, min, n - at.x);
        at.h = clamp(at.h + dy, min, free ? 100 - at.y : tallest);
      } else {
        at.x = clamp(at.x + dx, 0, n - at.w);
        at.y = free ? clamp(at.y + dy, 0, 100 - at.h) : Math.max(0, at.y + dy);
      }
      if (free) for (const k of ['x', 'y', 'w', 'h']) at[k] = Math.round(at[k] * 10) / 10;
      if (['x', 'y', 'w', 'h'].every(k => at[k] === p.at[k])) return;
      change(() => {
        p.at = at;
        if (!free) makeRoom(parent ? parent.parts : b.design.parts, p);
      }, { preview: false, undo: !same });
      b.nudged = { id: p.id, at: now };
    }

    /**
     * A copy of a component (a container with its components), with new ids, right after it: under it on a grid (the
     * others making room), a little down and right free-form; selected.
     */
    function duplicatePart(id) {
      const p = findPart(id);
      if (!p) return;
      const parent = parentOf(id);
      change(() => {
        const list = parent ? parent.parts : b.design.parts;
        const copy = freshCopy(p);
        list.splice(list.indexOf(p) + 1, 0, copy);
        if (parent && parent.mode === 'free') {
          copy.at = { ...p.at, x: Math.round(clamp(p.at.x + 4, 0, 100 - p.at.w) * 10) / 10, y: Math.round(clamp(p.at.y + 4, 0, 100 - p.at.h) * 10) / 10 };
        } else {
          copy.at = { ...p.at, y: p.at.y + p.at.h };
          makeRoom(list, copy);
        }
        b.selected = copy.id;
      });
    }
    document.addEventListener('keydown', onKey);

    Object.assign(wd, { builderPromo, renderBuilderHome, renderBuilder, flushBuilder: flush, designArt });
  });
})();
