/*
 * The Widget Builder widget (`custom`): draws a design (lib/customDesigns.ts) built on the web dashboards' builder page.
 * Parts sit on a 4-column grid of 64 px rows; a container holds its own parts on a fine grid (12 columns, 8 px rows) or
 * freely (per cent of its box). Each part's colour is, in order: what a Flow set, the first rule that holds, its own.
 * `opts.onSet(part, value)`, `onButton(part)` act; mount.js sends them. The builder page draws its preview with this too.
 */
(function () {
  const K = window.WidgetkeeperKit;
  const { el } = K;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STEP_SEND_MS = 700; // a burst of − / + taps is sent once
  const HOPE_MS = 10e3; // a value just sent, shown until the device says so

  const DEFAULT_STRINGS = {
    error: 'Could not load the design.',
    missing: 'This design was removed.',
    pickDesign: 'Pick a design in the widget\'s settings.',
    empty: 'This design has no parts yet.',
    webOnly: 'Widget Builder designs show on web dashboards for now.',
    unavailable: 'Unavailable',
    on: 'On',
    off: 'Off',
    setFailed: 'Could not change __name__.',
    noValue: 'No value picked',
    noKey: 'For this, add an API key in the app settings.',
    keyScope: 'The API key may not do this (Flows or Variables).',
    keyInvalid: 'The API key was not accepted.',
  };

  /** lib/customDesigns.ts' `ruleHolds()` (a test checks they agree). */
  function ruleHolds(rule, value) {
    if (value === null || value === undefined) return false;
    if (rule.op === 'above' || rule.op === 'below') {
      const v = Number(value);
      const r = Number(String(rule.value).replace(',', '.'));
      if (!Number.isFinite(v) || !Number.isFinite(r)) return false;
      return rule.op === 'above' ? v > r : v < r;
    }
    const norm = (x) => {
      const s = String(x).trim().toLowerCase();
      if (['on', 'yes', 'true', 'open'].includes(s)) return 'true';
      if (['off', 'no', 'false', 'closed'].includes(s)) return 'false';
      return s;
    };
    const same = typeof value === 'number'
      ? Number(String(rule.value).replace(',', '.')) === value
      : norm(value) === norm(rule.value);
    return rule.op === 'is' ? same : !same;
  }
  window.customRuleHolds = ruleHolds;

  /**
   * A part's look now: its colour (a palette name or `#rrggbb`), whether that tints the whole tile (a rule's or a Flow's
   * colour: something to notice; the part's own colour only accents its icon, toggle, bar or line) and whether it's hidden.
   */
  function lookOf(part, value, flow) {
    if (flow && flow.hidden === true) return { color: null, tint: false, hidden: true };
    let color = part.color || null;
    let tint = false;
    let hidden = false;
    for (const r of part.rules || []) {
      if (!ruleHolds(r, value)) continue;
      if (r.look === 'hide') hidden = true;
      else { color = r.look; tint = true; }
      break;
    }
    if (flow && flow.color) { color = flow.color; tint = true; }
    return { color, tint, hidden };
  }
  window.customLookOf = lookOf;

  function icon(id, cls) {
    const ic = id && K.icons[id];
    return ic ? K.svgIcon(ic, cls) : null;
  }

  /** A line through the points (`[t, v]`), filled under it, scaled to the box. */
  function sparkline(points, parent) {
    const svg = el('svg', { class: 'wb-spark', viewBox: '0 0 100 40', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, parent, SVG_NS);
    const pts = (points || []).filter(p => Array.isArray(p) && Number.isFinite(p[1]));
    if (pts.length < 2) return svg;
    const [t0, t1] = [pts[0][0], pts[pts.length - 1][0]];
    const vs = pts.map(p => p[1]);
    const [lo, hi] = [Math.min(...vs), Math.max(...vs)];
    const xy = pts.map(([t, v]) => [((t - t0) / ((t1 - t0) || 1)) * 100, 37 - ((v - lo) / ((hi - lo) || 1)) * 30]);
    const d = `M${xy.map(p => p.map(n => n.toFixed(2)).join(',')).join(' L')}`;
    el('path', { class: 'wb-spark-area', d: `${d} L100,40 L0,40 Z` }, svg, SVG_NS);
    el('path', { class: 'wb-spark-line', d, 'vector-effect': 'non-scaling-stroke' }, svg, SVG_NS);
    return svg;
  }

  /** The gauge's arc, 270° from the bottom left, filled to `frac`. */
  function arc(frac, parent) {
    const svg = el('svg', { class: 'wb-arc', viewBox: '0 0 100 84', 'aria-hidden': 'true' }, parent, SVG_NS);
    const r = 40; const cx = 50; const cy = 48;
    const a0 = Math.PI * 0.75; const a1 = Math.PI * 2.25;
    const pt = a => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    const path = (from, to) => `M${pt(from)} A${r},${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${pt(to)}`;
    el('path', { class: 'wb-arc-track', d: path(a0, a1) }, svg, SVG_NS);
    const f = Math.min(1, Math.max(0, frac));
    if (f > 0.002) el('path', { class: 'wb-arc-fill', d: path(a0, a0 + (a1 - a0) * f) }, svg, SVG_NS);
    return svg;
  }

  /**
   * @param {HTMLElement} root
   * @param {any} opts
   */
  window.createCustomWidget = function (root, opts) {
    const t = K.translator('custom', DEFAULT_STRINGS, opts);
    K.applyColors(root, { style: opts.colorStyle });
    root.classList.add('wb');
    const guard = K.touchGuard();
    const report = K.heightReporter(root, opts);
    const drags = new Map();
    /** partId → {value, until}: a value just sent, shown over the reported one. */
    const hoped = new Map();
    /** partId → {value, timer}: a stepper's burst of taps, not sent yet. */
    const pending = new Map();
    let state = null;
    let builtFor = null; // the design object the parts were built from
    let views = []; // {part, node, update}
    let message = null;

    const grid = el('div', { class: 'wb-grid' }, root);
    const note = el('div', { class: 'wb-message', role: 'status', hidden: '' }, root);
    const msg = K.messageLine(() => {
      note.hidden = !msg.text;
      note.textContent = msg.text || '';
      report();
    });

    // ------------------------------------------------------------ values

    function slotEntry(part) {
      return part.slot && state && state.values ? state.values[part.slot] : null;
    }
    function variableEntry(part) {
      return part.variable && state && state.variables ? state.variables[part.variable] : null;
    }
    function flowOf(part) {
      const f = state && state.flow && state.flow[part.id];
      return f && (!f.expires || f.expires > Date.now()) ? f : null;
    }
    /** The part's value: hoped for, else reported; `cap` describes it (a variable's is made up). */
    function current(part) {
      const h = hoped.get(part.id);
      const p = pending.get(part.id);
      const s = slotEntry(part);
      if (s) {
        if (s.missing) return { missing: true };
        const value = p ? p.value : h && Date.now() < h.until ? h.value : s.value;
        return { value, cap: s.capability || {}, name: s.name, offline: !!s.offline };
      }
      const v = variableEntry(part);
      if (v) {
        if (v.missing) return { missing: true };
        const value = p ? p.value : h && Date.now() < h.until ? h.value : v.value;
        return { value, cap: { type: v.type, units: null, decimals: 2 }, name: v.name };
      }
      return null;
    }
    const fmt = (cap, value) => K.formatValue(cap || {}, value, k => t(k));
    /** The part's range: its own min/max, else the capability's, else 0–100. */
    function range(part, cap) {
      const lo = part.min != null ? part.min : cap && cap.min != null ? cap.min : 0;
      const hi = part.max != null ? part.max : cap && cap.max != null ? cap.max : 100;
      return hi > lo ? [lo, hi] : [lo, lo + 1];
    }
    function hope(part, value) {
      hoped.set(part.id, { value, until: Date.now() + HOPE_MS });
      setTimeout(update, HOPE_MS + 50);
    }

    // ------------------------------------------------------------ acting

    async function act(part, node, value) {
      if (!opts.onSet) return;
      const before = hoped.get(part.id);
      if (value !== undefined) { hope(part, value); update(); }
      try {
        await opts.onSet(part, value);
        if (opts.onHaptic) opts.onHaptic();
      } catch (err) {
        console.error(err);
        if (before) hoped.set(part.id, before); else hoped.delete(part.id);
        update();
        K.shake(node);
        msg.set(err && K.KEY_PROBLEMS.includes(err.reason) ? t(err.reason) : t('setFailed', { name: nameOf(part) }), true);
      }
    }
    function nameOf(part) {
      if (part.name) return part.name;
      const c = current(part);
      return (c && c.name) || '';
    }

    // ------------------------------------------------------------ parts

    /** Puts a part where it goes: grid cells at the top, the fine grid or per cent in a container. */
    function place(node, part, where) {
      const a = part.at || { x: 0, y: 0, w: 1, h: 1 };
      if (where === 'free') {
        Object.assign(node.style, { left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` });
      } else {
        node.style.gridColumn = `${a.x + 1} / span ${a.w}`;
        node.style.gridRow = `${a.y + 1} / span ${a.h}`;
      }
    }

    /**
     * Whether a part is tall enough for a big value and wide enough for a name beside its value: two rows of the
     * widget's grid (in a container 10 fine rows, or 40 %), one of its four columns (3 of 12, or 25 %).
     */
    function sizeOf(part, where) {
      const a = part.at || { w: 1, h: 1 };
      if (where === 'free') return { big: a.h >= 40, narrow: a.w <= 25 };
      if (where === 'grid') return { big: a.h >= 10, narrow: a.w <= 3 };
      return { big: a.h >= 2, narrow: a.w === 1 };
    }

    function build(part, where) {
      const node = el('div', { class: `wb-part wb-k-${part.kind}`, 'data-part': part.id });
      if (part.tile !== false && part.kind !== 'container' && part.kind !== 'text' && part.kind !== 'icon') node.classList.add('wb-tile');
      if (part.kind === 'text' || part.kind === 'icon') node.classList.add('wb-bare');
      if (part.tile === false) node.classList.add('wb-bare');
      place(node, part, where);
      const make = MAKERS[part.kind] || MAKERS.text;
      const updatePart = make(part, node, sizeOf(part, where));
      const view = { part, node, update: () => {
        const c = current(part);
        const flow = flowOf(part);
        const value = flow && flow.value !== undefined ? flow.value : c ? c.value : undefined;
        const look = lookOf(part, value, flow);
        node.classList.toggle('wb-hidden', look.hidden);
        node.setAttribute('aria-hidden', look.hidden ? 'true' : 'false');
        applyColor(node, look.color);
        node.classList.toggle('wb-colored', look.tint);
        node.classList.toggle('wb-has-color', !!look.color);
        updatePart(c || {}, flow);
        K.markOffline(node, c && (c.offline || c.missing), c && (c.offline || c.missing) ? t('unavailable') : undefined);
      } };
      views.push(view);
      return node;
    }

    function applyColor(node, color) {
      if (color && K.isCustomColor(color)) {
        node.removeAttribute('data-wk-color');
        node.style.setProperty('--wk-c', color);
        node.style.setProperty('--wk-on', K.customInk(color));
      } else {
        node.style.removeProperty('--wk-c');
        node.style.removeProperty('--wk-on');
        if (color && K.COLORS.includes(color)) node.dataset.wkColor = color;
        else node.removeAttribute('data-wk-color');
      }
    }

    /** An icon slot: the part's icon (or a Flow's), else the capability's glyph. */
    function iconSlot(parent) {
      const box = el('span', { class: 'wb-icon', 'aria-hidden': 'true' }, parent);
      let shown = null;
      return (part, c, flow) => {
        const id = (flow && flow.icon) || part.icon;
        const key = id ? `i:${id}` : c && c.cap && part.slot ? `g:${part.slot}:${c.value === true}` : '';
        if (key === shown) return;
        shown = key;
        box.textContent = '';
        box.classList.remove('wb-glyph');
        box.style.removeProperty('--wb-mask');
        if (id && K.icons[id]) box.appendChild(icon(id, 'wb-svg'));
        else if (part.slot && c && c.cap) {
          const glyph = c.cap.icon || K.valueGlyph(part.slot.slice(part.slot.indexOf(':') + 1), c.value);
          box.classList.add('wb-glyph');
          K.setMask(box, glyph, '--wb-mask');
        }
        box.hidden = !box.firstChild && !box.classList.contains('wb-glyph');
      };
    }

    function textOf(part, c, flow) {
      if (flow && flow.value !== undefined) {
        const v = flow.value;
        const units = flow.units != null ? flow.units : part.units;
        if (typeof v === 'number') return K.formatValue({ units: units || null, decimals: 2 }, v);
        return units ? `${v} ${units}` : String(v);
      }
      if (!c || c.missing) return '–';
      return fmt(c.cap, c.value);
    }

    const MAKERS = {
      value(part, node, size) {
        const big = size.big;
        node.classList.toggle('wb-big', big);
        // One column: the icon over the value, the name left out (it's the tooltip).
        const narrow = !big && size.narrow;
        node.classList.toggle('wb-narrow', narrow);
        const top = el('div', { class: 'wb-top' }, node);
        const ic = iconSlot(top);
        const val = el('span', { class: 'wb-value' }, big || narrow ? null : top);
        const name = el('div', { class: 'wb-name' }, node);
        if (big || narrow) node.insertBefore(val, name);
        let spark = null;
        return (c, flow) => {
          ic(part, c, flow);
          val.textContent = textOf(part, c, flow);
          name.textContent = (flow && flow.text) || part.name || c.name || '';
          node.title = narrow ? name.textContent : '';
          if (part.show === 'chart') {
            const pts = state.histories && state.histories[`${part.span}\n${part.slot}`];
            if (spark) spark.remove();
            spark = sparkline(pts, node);
          }
        };
      },
      flowvalue(part, node) {
        const top = el('div', { class: 'wb-top' }, node);
        const ic = iconSlot(top);
        const val = el('span', { class: 'wb-value' }, top);
        const name = el('div', { class: 'wb-name' }, node);
        return (c, flow) => {
          ic(part, null, flow);
          val.textContent = flow && flow.value !== undefined ? textOf(part, null, flow) : part.text || '–';
          name.textContent = (flow && flow.text) || part.name || '';
        };
      },
      chart(part, node) {
        const top = el('div', { class: 'wb-top' }, node);
        const name = el('span', { class: 'wb-name' }, top);
        const val = el('span', { class: 'wb-value' }, top);
        let spark = null;
        return (c, flow) => {
          name.textContent = (flow && flow.text) || part.name || c.name || '';
          val.textContent = textOf(part, c, flow);
          if (spark) spark.remove();
          spark = sparkline(state.histories && state.histories[`${part.span}\n${part.slot}`], node);
        };
      },
      gauge(part, node) {
        const box = el('div', { class: 'wb-gauge-box' }, node);
        let svg = null;
        const mid = el('div', { class: 'wb-gauge-mid' }, box);
        const val = el('div', { class: 'wb-value' }, mid);
        const name = el('div', { class: 'wb-name' }, mid);
        return (c, flow) => {
          const [lo, hi] = range(part, c.cap);
          const v = Number(c.value);
          if (svg) svg.remove();
          svg = arc(Number.isFinite(v) ? (v - lo) / (hi - lo) : 0, null);
          box.insertBefore(svg, mid);
          val.textContent = textOf(part, c, flow);
          name.textContent = (flow && flow.text) || part.name || c.name || '';
        };
      },
      level(part, node) {
        const top = el('div', { class: 'wb-top' }, node);
        const name = el('span', { class: 'wb-name' }, top);
        const val = el('span', { class: 'wb-value' }, top);
        const bar = el('div', { class: 'wb-level' }, node);
        const fill = el('i', null, bar);
        return (c, flow) => {
          const [lo, hi] = range(part, c.cap);
          const v = Number(K.scaled(c.cap || {}, c.value));
          fill.style.width = `${Number.isFinite(v) ? Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100)) : 0}%`;
          name.textContent = (flow && flow.text) || part.name || c.name || '';
          val.textContent = textOf(part, c, flow);
        };
      },
      status(part, node) {
        const top = el('div', { class: 'wb-top' }, node);
        const dot = el('span', { class: 'wb-dot', 'aria-hidden': 'true' }, top);
        const val = el('span', { class: 'wb-sub' }, top);
        const name = el('div', { class: 'wb-name' }, node);
        return (c, flow) => {
          const on = c.value === true || (typeof c.value === 'number' && c.value > 0);
          dot.classList.toggle('on', on);
          node.classList.toggle('wb-on', on);
          // The dot says yes or no; a number or a text is written beside it.
          val.textContent = typeof c.value === 'boolean' && !(flow && flow.value !== undefined) ? '' : textOf(part, c, flow);
          name.textContent = (flow && flow.text) || part.name || c.name || '';
        };
      },
      switch(part, node) {
        const top = el('div', { class: 'wb-top' }, node);
        const ic = iconSlot(top);
        const tog = el('span', { class: 'wb-toggle', 'aria-hidden': 'true' }, top);
        const name = el('div', { class: 'wb-name' }, node);
        node.setAttribute('role', 'switch');
        node.tabIndex = 0;
        let on = false;
        K.onTap(node, () => { if (!opts.preview) act(part, node, !on); }, { guard });
        return (c, flow) => {
          on = c.value === true;
          ic(part, c, flow);
          node.classList.toggle('wb-on', on);
          node.setAttribute('aria-checked', on ? 'true' : 'false');
          tog.classList.toggle('on', on);
          name.textContent = (flow && flow.text) || part.name || c.name || '';
        };
      },
      button(part, node) {
        const ic = iconSlot(node);
        const name = el('div', { class: 'wb-name' }, node);
        node.setAttribute('role', 'button');
        node.tabIndex = 0;
        K.onTap(node, async () => {
          if (opts.preview || node.classList.contains('busy') || !opts.onButton) return;
          node.classList.add('busy');
          try {
            await opts.onButton(part);
            if (opts.onHaptic) opts.onHaptic();
            node.classList.add('done');
            setTimeout(() => node.classList.remove('done'), 1200);
          } catch (err) {
            console.error(err);
            K.shake(node);
            msg.set(err && K.KEY_PROBLEMS.includes(err.reason) ? t(err.reason) : t('setFailed', { name: part.name || '' }), true);
          } finally {
            node.classList.remove('busy');
          }
        }, { guard, keys: true });
        return (c, flow) => {
          ic(part, null, flow);
          const f = part.flowId && state.flows && state.flows[part.flowId];
          name.textContent = (flow && flow.text) || part.name || (f && !f.missing ? f.name : '');
        };
      },
      slider(part, node) {
        const fill = el('span', { class: 'wb-fill', 'aria-hidden': 'true' }, node);
        const row = el('div', { class: 'wb-row' }, node);
        const ic = iconSlot(row);
        const name = el('span', { class: 'wb-name' }, row);
        const val = el('span', { class: 'wb-value' }, row);
        node.setAttribute('role', 'slider');
        let last = { cap: {} };
        if (!opts.preview) {
          K.wireBar(node, {
            id: part.id, drags, guard, render: update,
            commit: (id, x) => {
              const [lo, hi] = range(part, last.cap);
              const step = last.cap && last.cap.step ? last.cap.step : (hi - lo) <= 1 ? 0.01 : 1;
              const v = Math.round((lo + x * (hi - lo)) / step) * step;
              act(part, node, Number(v.toFixed(4)));
            },
          });
        }
        return (c, flow) => {
          last = c;
          const [lo, hi] = range(part, c.cap);
          const v = Number(c.value);
          const x = drags.has(part.id) ? drags.get(part.id) : Number.isFinite(v) ? (v - lo) / (hi - lo) : 0;
          const frac = Math.min(1, Math.max(0, x));
          fill.style.width = `${frac * 100}%`;
          ic(part, c, flow);
          name.textContent = (flow && flow.text) || part.name || c.name || '';
          val.textContent = drags.has(part.id) ? fmt(c.cap, lo + frac * (hi - lo)) : textOf(part, c, flow);
          node.setAttribute('aria-valuenow', String(v));
        };
      },
      stepper(part, node) {
        const name = el('div', { class: 'wb-sub' }, node);
        const row = el('div', { class: 'wb-stepper' }, node);
        const minus = el('button', { type: 'button', class: 'wb-step', 'aria-label': '−', text: '−' }, row);
        const val = el('span', { class: 'wb-value' }, row);
        const plus = el('button', { type: 'button', class: 'wb-step', 'aria-label': '+', text: '+' }, row);
        let last = {};
        const step = (dir) => {
          if (opts.preview) return;
          const c = current(part);
          const base = Number(c && c.value);
          if (!Number.isFinite(base)) return;
          const [lo, hi] = range(part, c.cap);
          const s = part.step || 0.5;
          const v = Number(Math.min(hi, Math.max(lo, Math.round((base + dir * s) / s) * s)).toFixed(4));
          const p = pending.get(part.id);
          if (p) clearTimeout(p.timer);
          const timer = setTimeout(() => { pending.delete(part.id); act(part, node, v); }, STEP_SEND_MS);
          pending.set(part.id, { value: v, timer });
          update();
        };
        K.onTap(minus, () => step(-1), { guard, keys: false, stop: true });
        K.onTap(plus, () => step(1), { guard, keys: false, stop: true });
        return (c, flow) => {
          last = c;
          name.textContent = (flow && flow.text) || part.name || last.name || '';
          val.textContent = textOf(part, c, flow);
        };
      },
      choice(part, node) {
        const name = el('div', { class: 'wb-sub' }, node);
        const row = el('div', { class: 'wb-choices', role: 'radiogroup' }, node);
        const buttons = (part.choices || []).map((ch) => {
          const b = el('button', { type: 'button', class: 'wb-choice', role: 'radio', text: ch.label }, row);
          K.onTap(b, () => { if (!opts.preview) act(part, node, ch.value); }, { guard, keys: false, stop: true });
          return { b, ch };
        });
        return (c, flow) => {
          const v = c.value === undefined || c.value === null ? '' : String(c.value);
          for (const { b, ch } of buttons) {
            const on = ch.value === v;
            b.classList.toggle('on', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
          }
          name.textContent = (flow && flow.text) || part.name || c.name || '';
        };
      },
      variable(part, node) {
        const top = el('div', { class: 'wb-top' }, node);
        const val = el('span', { class: 'wb-value' }, top);
        const tog = el('span', { class: 'wb-toggle', 'aria-hidden': 'true' }, top);
        const name = el('div', { class: 'wb-name' }, node);
        let c = {};
        K.onTap(node, () => {
          if (opts.preview || !c.cap) return;
          if (c.cap.type === 'boolean') { act(part, node, c.value !== true); return; }
          const typed = window.prompt(part.name || c.name || '', c.value == null ? '' : String(c.value));
          if (typed === null) return;
          const v = c.cap.type === 'number' ? Number(typed.replace(',', '.')) : typed;
          if (c.cap.type === 'number' && !Number.isFinite(v)) { K.shake(node); return; }
          act(part, node, v);
        }, { guard });
        node.setAttribute('role', 'button');
        node.tabIndex = 0;
        return (cur, flow) => {
          c = cur;
          const bool = cur.cap && cur.cap.type === 'boolean';
          tog.hidden = !bool;
          tog.classList.toggle('on', cur.value === true);
          node.classList.toggle('wb-on', bool && cur.value === true);
          val.hidden = bool;
          val.textContent = textOf(part, cur, flow);
          name.textContent = (flow && flow.text) || part.name || cur.name || '';
        };
      },
      text(part, node) {
        node.classList.add(`wb-size-${part.size || 'body'}`);
        node.style.textAlign = part.align || 'left';
        const txt = el('div', { class: 'wb-text', dir: 'auto' }, node);
        return (c, flow) => { txt.textContent = (flow && flow.text) || part.text || ''; };
      },
      icon(part, node) {
        const ic = iconSlot(node);
        return (c, flow) => ic(part, null, flow);
      },
      container(part, node) {
        node.classList.add(`wb-box-${part.mode === 'free' ? 'free' : 'grid'}`);
        const bg = part.background || { kind: 'none' };
        if (bg.kind === 'color') node.style.background = bg.from;
        else if (bg.kind === 'gradient') node.style.background = `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`;
        node.classList.toggle('wb-box-plain', bg.kind === 'none');
        if (bg.kind !== 'none') node.classList.add('wb-box-dark');
        const inner = el('div', { class: 'wb-inner' }, node);
        for (const kid of part.parts || []) inner.appendChild(build(kid, part.mode === 'free' ? 'free' : 'grid'));
        return () => {};
      },
    };

    // ------------------------------------------------------------ drawing

    function rebuild() {
      grid.textContent = '';
      views = [];
      builtFor = state && state.design;
      if (!builtFor) return;
      for (const part of builtFor.parts) grid.appendChild(build(part, 'top'));
    }

    function update() {
      if (!state || !state.design) { report(); return; }
      if (state.design !== builtFor) rebuild();
      for (const v of views) v.update();
      grid.hidden = !!message;
      report();
    }

    function setMessage(text, transient) {
      if (transient) { msg.set(text, true); return; }
      message = text;
      msg.set(text, false);
      grid.hidden = !!text;
      report();
    }

    return {
      t,
      /** `/state`'s answer: a design and its values. */
      setState(next) {
        if (next && next.missing) { state = null; builtFor = null; grid.textContent = ''; setMessage(t('missing')); return; }
        if (!next || !next.design || !Array.isArray(next.design.parts)) { setMessage(t('error')); return; }
        const sameDesign = state && next && state.design && next.design && state.design.updatedAt === next.design.updatedAt && state.design.id === next.design.id;
        state = next;
        if (sameDesign) state.design = builtFor; // keep the built parts (and a drag on a slider)
        message = null;
        msg.reset();
        if (!state.design.parts.length) { setMessage(t('empty')); return; }
        update();
      },
      /** Realtime `values:state`: one capability's new value. */
      pushValue({ deviceId, capabilityId, value }) {
        if (!state || !state.values) return;
        const key = `${deviceId}:${capabilityId}`;
        const s = state.values[key];
        if (!s || s.missing) return;
        s.value = value;
        for (const v of views) if (v.part.slot === key) { const h = hoped.get(v.part.id); if (h && h.value === value) hoped.delete(v.part.id); }
        update();
      },
      /** Realtime `variables:state`. */
      pushVariable({ id, value }) {
        const v = state && state.variables && state.variables[id];
        if (!v || v.missing) return;
        v.value = value;
        update();
      },
      /** Realtime `custom:flow`: what Flows set on one part (null: back to the design's). */
      pushFlow({ part, values }) {
        if (!state) return;
        state.flow = { ...(state.flow || {}) };
        if (values) state.flow[part] = values; else delete state.flow[part];
        update();
      },
      setMessage,
      /** The parts' ids that need a history (for the dev pages). */
      update,
    };
  };
})();
