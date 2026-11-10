/*
 * The widgets' shared front-end kit, `window.WidgetkeeperKit`: the helpers every widget used to copy. Homey serves
 * each widget's folder and has no shared one, so it lives in the Spacer's (it has no code of its own) and every
 * index.html loads it first as `../spacer/kit.js`, as Charts loads `../electricity/chart.js`. The Smart Stack's
 * pages use the one its own frame loaded; the tests load it before a widget (`test/helpers/loadWidget.ts`).
 */
(function () {
  const DAY = 864e5;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const TAP_SLOP = 10; // px a finger may move and still count as a tap
  /** How long after a touch the browser's own click is ignored (it still sends one after a short swipe). */
  const CLICK_AFTER_TOUCH_MS = 800;
  const DEVICE_REFRESH_MS = 5 * 60e3; // keeps the app's device subscriptions alive and resyncs state
  const PRESS_CONFIRM_MS = 3e3; // `pressGuard()`: how long a first tap waits for the second
  const PRESS_HOLD_MS = 600; // how long a long press holds before it acts
  const PRESS_HINT_MS = 1500; // how long a short tap says it wants a long press
  const HAPTIC_TOGETHER_MS = 300; // calls this close are one tap's (`wireHaptic()`)
  /** How soon a failed read is tried again, each once; after these it's the usual refresh's turn. */
  const RETRY_MS = [5e3, 15e3, 30e3];
  /** A page hidden this long reads again when it's back: it may have missed realtime changes. */
  const RESUME_AFTER_MS = 30e3;

  /**
   * Flow Buttons' icons, also the icons of Days Since's tiles, Notes, Variable Presets and Media's buttons: drawn on a
   * 24 px grid with a 2 px round stroke (`fill: true` for a filled shape). The ids are the icon settings' (FLOW_ICONS
   * in lib/FlowService.ts, named in `flows.icons.<id>`); `npm run flow-icons` renders their previews from here. These are
   * what an icon setting lists first; `icons.js`, which only the pages that show them load, adds the rest to this object.
   */
  const ICONS = {
    play: { fill: true, d: 'M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z' },
    power: { d: 'M12 3v8M7.05 6.05a7 7 0 1 0 9.9 0' },
    bulb: { d: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.55 1.1 1.3 1.1 2.2h5c0-.9.4-1.65 1.1-2.2A6 6 0 0 0 12 3z' },
    sun: { d: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41' },
    moon: { d: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z' },
    home: { d: 'M3.5 11 12 3.8l8.5 7.2M6 9.3V20h4.5v-5.5h3V20H18V9.3' },
    leave: { d: 'M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M15 8l4 4-4 4M19 12H9' },
    bed: { d: 'M3 6v13M3 16h18v3M21 16v-3.5a2.5 2.5 0 0 0-2.5-2.5H11v6M7 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z' },
    lock: { d: 'M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-6A1.5 1.5 0 0 1 6.5 11zM8 11V8a4 4 0 0 1 8 0v3' },
    unlock: { d: 'M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-6A1.5 1.5 0 0 1 6.5 11zM8 11V7a4 4 0 0 1 8 0' },
    shield: { d: 'M12 3 5 6v5.5c0 4.3 3 8 7 9.5 4-1.5 7-5.2 7-9.5V6l-7-3z' },
    bell: { d: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16zM10 21h4' },
    flame: { d: 'M12 2.5c.8 3.2 5.5 5.3 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.3 1-4 2.3-5.2.2 2 1.1 3.2 2.3 3.2-.7-3-.3-5.9.9-8.5z' },
    snowflake: { d: 'M12 2v20M3.34 7l17.32 10M3.34 17 20.66 7M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5' },
    fan: { d: 'M12 12c-1.6-4-1.2-9.2 2.4-9.4 3.6-.2 3.4 5.4-2.4 9.4zM12 12c4.2.6 8.6 3.6 7 6.9-1.6 3.2-6.6.6-7-6.9zM12 12c-2.6 3.3-7.4 5.8-9.4 2.8C.6 11.8 5.6 9 12 12z' },
    drop: { d: 'M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z' },
    bolt: { d: 'M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8z' },
    music: { d: 'M9 18V5.5l11-2V16M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z' },
    tv: { d: 'M4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9A1.5 1.5 0 0 1 4.5 6zM8 21h8M9 2.5 12 6l3-3.5' },
    clock: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2' },
    star: { d: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.06 6.2L12 17.3l-5.56 2.9 1.06-6.2L3 9.6l6.2-.9L12 3z' },
    heart: { d: 'M12 20s-8-4.9-8-10.5A4.5 4.5 0 0 1 12 6.6a4.5 4.5 0 0 1 8 2.9C20 15.1 12 20 12 20z' },
    door: { d: 'M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M4 21h16M14.5 12h.01' },
    window: { d: 'M5.5 3h13A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3zM12 3v18M4 12h16' },
    blinds: { d: 'M3 3.5h18M5 3.5V20h14V3.5M5 8h14M5 12h14M5 16h14' },
    garage: { d: 'M3 21V9l9-5.5L21 9v12M7 21v-9h10v9M7 15h10M7 18h10' },
    car: { d: 'M5 16H3.5v-3.5l2-5A1.5 1.5 0 0 1 6.9 6.5h10.2a1.5 1.5 0 0 1 1.4 1l2 5V16H19M9 16h6M3.5 12.5h17M7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' },
    sofa: { d: 'M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3.5 11A1.5 1.5 0 0 1 5 12.5V14h14v-1.5a1.5 1.5 0 0 1 3 0V18H2v-5.5A1.5 1.5 0 0 1 3.5 11zM5 18v2M19 18v2' },
    coffee: { d: 'M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 2.5v3M12 2.5v3' },
    utensils: { d: 'M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17 21V3c-2 1-3.5 3.5-3.5 7.5V13H17' },
    washer: { d: 'M5.5 3h13A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3zM12 9a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM7.5 6h.01M10.5 6h.01' },
    vacuum: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM7 9h10M12 13.5h.01' },
    trash: { d: 'M4 6.5h16M9 6.5V4h6v2.5M6 6.5l1 13A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5l1-13M10 10.5v6M14 10.5v6' },
    thermometer: { d: 'M14 14.76V4.5a2 2 0 0 0-4 0v10.26a4 4 0 1 0 4 0zM12 18v-6' },
    plug: { d: 'M9 2.5V7M15 2.5V7M6 7h12v4a6 6 0 0 1-12 0V7zM12 17v4.5' },
    wifi: { d: 'M2.5 8.5a14 14 0 0 1 19 0M5.5 12a9.5 9.5 0 0 1 13 0M8.5 15.5a5 5 0 0 1 7 0M12 19.5h.01' },
    camera: { d: 'M4.5 7h3l1.5-2.5h6L16.5 7h3A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-10A1.5 1.5 0 0 1 4.5 7zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z' },
    speaker: { d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11' },
    mute: { d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5zM16 9.5l5 5M21 9.5l-5 5' },
    umbrella: { d: 'M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9zM12 12v6.5a2 2 0 0 1-4 0' },
    leaf: { d: 'M5 19C5 10 11 5 20 4c-1 9-6 15-15 15zM5 19l8-8' },
    paw: { d: 'M12 13c-2.5 0-5 3-5 5a2.5 2.5 0 0 0 2.5 2.5c1 0 1.5-.5 2.5-.5s1.5.5 2.5.5A2.5 2.5 0 0 0 17 18c0-2-2.5-5-5-5zM5.5 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM9 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM15 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM18.5 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z' },
    briefcase: { d: 'M4.5 7.5h15A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V9a1.5 1.5 0 0 1 1.5-1.5zM9 7.5V5h6v2.5M3 13h18' },
    gift: { d: 'M4 8.5h16V12H4zM5.5 12v8.5h13V12M12 8.5v12M12 8.5S11 4 8.5 4a2.25 2.25 0 0 0 0 4.5M12 8.5S13 4 15.5 4a2.25 2.25 0 0 1 0 4.5' },
    sparkles: { d: 'M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8L11 3zM18.5 15v5M16 17.5h5' },
    // A dashboard's tiles (Dashboard Shortcuts' default): a tall one on the left, two on the right.
    dashboard: { fill: true, d: 'M5.5 4h4A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4zM14.5 4h4A1.5 1.5 0 0 1 20 5.5v6a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 14.5 4zM14.5 15h4a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-2a1.5 1.5 0 0 1 1.5-1.5z' },
  };

  /**
   * Homey's Android app already scales its type tokens by the system font scale (calc(1.1 * 14px)), and the
   * WebView's text zoom then scales all text again, so token text came out 1.21x where the native tiles are 1.1x.
   * This divides the tokens by the zoom (measured: a 100px font computes as 110px), so they render at Homey's size.
   * Fixed px sizes keep the zoom once, like the native text. Each index.html runs it first.
   */
  function undoTextZoom() {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;font-size:100px';
    document.body.appendChild(probe);
    const zoom = parseFloat(getComputedStyle(probe).fontSize) / 100;
    probe.remove();
    if (!(zoom > 0) || Math.abs(zoom - 1) < 0.01) return;
    const cs = getComputedStyle(document.body);
    for (const size of ['small', 'default', 'large', 'xlarge', 'xxlarge']) {
      for (const prop of ['font-size', 'line-height']) {
        const name = `--homey-${prop}-${size}`;
        const v = cs.getPropertyValue(name).trim();
        if (v) document.body.style.setProperty(name, `calc((${v}) / ${zoom})`);
      }
    }
  }

  /** An element with attributes (`text` sets its text; null values are left out), appended to `parent`; `ns` for SVG. */
  function el(tag, attrs, parent, ns) {
    const node = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v);
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  /** Sets an icon (a data URL) as `node`'s mask, in the widget's CSS variable `name` (`--vt-mask` …); none without one. */
  function setMask(node, url, name) {
    const v = url ? `url("${url}")` : '';
    if (node.style.getPropertyValue(name) !== v) node.style.setProperty(name, v);
  }

  /**
   * The names typed on the tiles (`renameTiles`; the app keeps them per widget instance, by tile key): `name(key, own)`
   * is the typed name, else `own`. In rename mode `field(key, own)` is the tile's text field (made once per key, with
   * `own` as the placeholder): it saves on change (Enter or leaving it), Escape puts it back, and a realtime update
   * doesn't overwrite it while it has the focus. Its touches, clicks and keys never reach the tile's own taps.
   * `failed(key)` shakes the tile and says so; the name goes back, unless the app's names came meanwhile.
   */
  function tileNames(opts, render, failed) {
    let names = {};
    let reads = 0; // set() calls: the app's names, by realtime or a read
    const fields = new Map();
    async function save(key, value) {
      const before = names[key];
      if ((before || '') === value) return;
      const put = v => { names = { ...names }; if (v) names[key] = v; else delete names[key]; };
      put(value);
      const seen = reads;
      render();
      try {
        if (opts.onRename) await opts.onRename(key, value);
      } catch (err) {
        console.error(err);
        // Only while it still shows this save's name and nothing came from the app since: what came says what the
        // app kept (a newer name, or this one when only the answer was lost).
        if (reads === seen && (names[key] || '') === value) put(before);
        failed(key);
      }
    }
    return {
      renaming: opts.renameTiles === true,
      name: (key, own) => names[key] || own,
      set(map) {
        reads++;
        names = {};
        if (map && typeof map === 'object') for (const [k, v] of Object.entries(map)) if (typeof v === 'string' && v) names[k] = v;
        render();
      },
      field(key, own) {
        let input = fields.get(key);
        if (!input) {
          input = document.createElement('input');
          input.type = 'text';
          input.className = 'wk-rename';
          input.dir = 'auto';
          input.maxLength = 60;
          input.autocomplete = 'off';
          input.setAttribute('enterkeyhint', 'done');
          const field = input;
          for (const type of ['touchstart', 'touchend', 'pointerdown', 'click']) field.addEventListener(type, e => e.stopPropagation(), { passive: true });
          field.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') field.blur();
            else if (e.key === 'Escape') { field.value = names[key] || ''; field.blur(); }
          });
          field.addEventListener('change', () => { field.value = field.value.trim(); save(key, field.value); });
          fields.set(key, input);
        }
        input.placeholder = own || '';
        input.setAttribute('aria-label', own || '');
        if (document.activeElement !== input) input.value = names[key] || '';
        return input;
      },
    };
  }

  /**
   * The app's Time format (the settings page's card, the app setting `timeFormat`: `auto`, `24` or `12`; 1.3.0, it
   * replaced the widgets' own setting), for every widget on the page. The last one read is kept in the screen's
   * storage, so a widget draws its times right before the app answers; `wireTimeFormat()` reads and follows it.
   */
  const TIME_FORMAT_KEY = 'widgetkeeper.timeFormat';
  const isTimeFormat = v => v === 'auto' || v === '24' || v === '12';
  let timeFormatNow = 'auto';
  try {
    const stored = window.localStorage && window.localStorage.getItem(TIME_FORMAT_KEY);
    if (isTimeFormat(stored)) timeFormatNow = stored;
  } catch { /* no storage: Automatic until the app answers */ }

  /** The page's time format: `auto`, `24` or `12`. @returns {'auto' | '24' | '12'} */
  function getTimeFormat() {
    return /** @type {'auto' | '24' | '12'} */ (timeFormatNow);
  }

  /** Sets the page's time format (anything else is `auto`) and keeps it for the next load; whether it changed. */
  function setTimeFormat(value) {
    const v = isTimeFormat(value) ? value : 'auto';
    if (v === timeFormatNow) return false;
    timeFormatNow = v;
    try { if (window.localStorage) window.localStorage.setItem(TIME_FORMAT_KEY, v); } catch { /* kept for this page only */ }
    return true;
  }

  /**
   * A mount's time format: the app's `GET /time-format` (every widget that shows a time has the route) now, and its
   * realtime `timeformat:state`; `changed()` (the mount's redraw or reload) when it differs from the one drawn with.
   */
  function wireTimeFormat(Homey, changed) {
    // This mount's own: a Smart Stack's pages share the kit, so the page's format has changed for all but the first to hear.
    let drawn = timeFormatNow;
    const apply = (res) => {
      // An answer without one (an older app's) changes nothing.
      if (!res || !isTimeFormat(res.timeFormat)) return;
      setTimeFormat(res.timeFormat);
      if (res.timeFormat === drawn) return;
      drawn = res.timeFormat;
      if (changed) changed();
    };
    try { Homey.on('timeformat:state', apply); } catch { /* the stored one stays */ }
    // After the widget's own first request (asked for in this tick or its promises), which carries the load marks.
    setTimeout(() => {
      try {
        Promise.resolve(Homey.api('GET', '/time-format')).then(apply, () => { /* the stored one stays */ });
      } catch { /* the stored one stays */ }
    }, 0);
  }

  const timeFormats = new Map();
  /**
   * Hours and minutes in `locale` (else the screen's), which picks 24 or 12 hours unless `timeFormat` (`24`, `12`;
   * `auto` or anything else leaves it; missing: the app's, `getTimeFormat()`) says. `hour` is Intl's (`numeric` by
   * default), or `2-digit-24`: two digits in 24 hours only (the Clock's `07:05`).
   */
  function timeFormatter(locale, timeFormat = timeFormatNow, hour = 'numeric') {
    const id = `${locale || ''}|${timeFormat}|${hour}`;
    if (!timeFormats.has(id)) {
      const o = /** @type {Intl.DateTimeFormatOptions} */ ({ hour: hour === '2-digit-24' ? 'numeric' : hour, minute: '2-digit' });
      if (timeFormat === '24') o.hourCycle = 'h23';
      else if (timeFormat === '12') o.hour12 = true;
      let tag = locale || undefined;
      let f;
      try { f = new Intl.DateTimeFormat(tag, o); } catch { tag = 'en'; f = new Intl.DateTimeFormat(tag, o); }
      if (hour === '2-digit-24' && f.resolvedOptions().hour12 === false) f = new Intl.DateTimeFormat(tag, { ...o, hour: '2-digit' });
      timeFormats.set(id, f);
    }
    return timeFormats.get(id);
  }

  /** Smoothed values for a `smooth` setting: six [1 2 1]/4 passes; the ends stay put. Moved here from the chart module for Sparklines. */
  function smoothValues(vs) {
    let q = vs;
    for (let k = 0; k < 6; k++) {
      q = q.map((v, i) => (i === 0 || i === q.length - 1 ? v : (q[i - 1] + 2 * v + q[i + 1]) / 4));
    }
    return q;
  }

  /** Whether times show in 12 hours: `timeFormat` (missing: the app's) says so, or Automatic and the screen's locale. */
  function uses12Hours(locale, timeFormat = timeFormatNow) {
    if (timeFormat === '12') return true;
    if (timeFormat === '24') return false;
    return timeFormatter(locale, 'auto').resolvedOptions().hour12 === true;
  }

  const pad2 = n => String(n).padStart(2, '0');
  const twelveHours = new Map();
  function twelveHourFormat(locale, o) {
    const id = `${locale || ''}|${JSON.stringify(o)}`;
    if (!twelveHours.has(id)) {
      const opts = /** @type {Intl.DateTimeFormatOptions} */ ({ ...o, hour: 'numeric', hour12: true });
      let f;
      try { f = new Intl.DateTimeFormat(locale || undefined, opts); } catch { f = new Intl.DateTimeFormat('en', opts); }
      twelveHours.set(id, f);
    }
    return twelveHours.get(id);
  }

  /**
   * A clock time for the charts, the price strips, the Electricity Overview and Timers: in 24 hours `14:05` (`pad`:
   * `06:05`, else `6:05`; with `seconds` `14:05:09`), as these widgets always wrote it; in 12 hours the locale's
   * (`2:05 PM`). The app's time format unless `timeFormat` says.
   * @param {number} ms
   * @param {{ locale?: string, timeFormat?: string, pad?: boolean, seconds?: boolean }} [o]
   */
  function clockTime(ms, { locale, timeFormat = timeFormatNow, pad = true, seconds = false } = {}) {
    const d = new Date(ms);
    if (!uses12Hours(locale, timeFormat)) {
      return `${pad ? pad2(d.getHours()) : d.getHours()}:${pad2(d.getMinutes())}${seconds ? `:${pad2(d.getSeconds())}` : ''}`;
    }
    return twelveHourFormat(locale, seconds ? { minute: '2-digit', second: '2-digit' } : { minute: '2-digit' }).format(d);
  }

  /**
   * A whole hour's label on an axis or a column: in 24 hours the hour alone (`14`; `pad`: `06`, else `6`), in 12
   * hours the locale's (`2 PM`). `hour` is an hour of the day (0–24: an axis' end is `24`, `12 AM` in 12 hours) or a
   * time in ms.
   * @param {number} hour
   * @param {{ locale?: string, timeFormat?: string, pad?: boolean }} [o]
   */
  function hourLabel(hour, { locale, timeFormat = timeFormatNow, pad = true } = {}) {
    const h = hour <= 24 ? hour : new Date(hour).getHours();
    if (!uses12Hours(locale, timeFormat)) return pad ? pad2(h) : String(h);
    return twelveHourFormat(locale, {}).format(new Date(2000, 0, 1, h % 24));
  }

  /**
   * The time today, the weekday and time within 6 days, else the date (times in `locale` and `timeFormat`, as
   * `timeFormatter()`; names in `language`).
   */
  function formatSince(ms, now, language, locale, timeFormat) {
    const at = new Date(ms);
    const time = timeFormatter(locale, timeFormat).format(at);
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    if (ms >= midnight.getTime()) return time;
    let lang = language || undefined;
    try { new Intl.DateTimeFormat(lang); } catch (err) { lang = undefined; }
    if (ms >= midnight.getTime() - 6 * DAY) return `${at.toLocaleDateString(lang, { weekday: 'short' })} ${time}`;
    return at.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  }

  /** An alarm's title without a trailing unit "(…)". */
  function baseTitle(title) {
    return String(title).replace(/\s*\([^)]*\)\s*$/, '') || String(title);
  }

  /** The cheapest price slot from `from` up to `hours` ahead (the first of equal ones), or -1. */
  function lowestSlot(slots, from, hours) {
    let low = -1;
    for (let i = from; i <= from + hours && i < slots.length; i++) {
      const p = slots[i].price;
      if (p != null && (low < 0 || p < slots[low].price - 1e-9)) low = i;
    }
    return low;
  }

  /**
   * The time spans of the chart widgets (Chart · Basic, Chart · Totals …) and Sparklines: `<count><unit>`, the last
   * `count` minutes (`m`), hours (`h`), days (`d`), weeks (`w`), months (`mo`) or years (`y`) up to now; with `!` whole
   * local periods instead (days from midnight, weeks from Monday, as Homey's, months from the 1st, years from 1 January),
   * the current one included, or with `!-` left out (`1d!-` is yesterday). The names spans had before 1.2.0 are whole
   * periods (`today` `1d!`, `lastMonth` `1mo!-` …); the rolling ones (`24h`, `7d`) read as they are. At most two years:
   * Insights keeps no more.
   */
  const SPAN_UNITS = { m: 'minute', h: 'hour', d: 'day', w: 'week', mo: 'month', y: 'year' };
  const SPAN_NAMES = {
    today: '1d!', yesterday: '1d!-', thisWeek: '1w!', lastWeek: '1w!-', thisMonth: '1mo!', lastMonth: '1mo!-', thisYear: '1y!', lastYear: '1y!-',
  };
  const UNIT_MS = { minute: 6e4, hour: 36e5, day: DAY, week: 7 * DAY };
  /** The most of each unit: two years. */
  const MAX_COUNT = { minute: 2 * 366 * 1440, hour: 2 * 366 * 24, day: 2 * 366, week: 105, month: 24, year: 2 };
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /** A span's `{count, unit, whole, skip}`, or null for one that isn't. */
  function parseSpan(span) {
    const m = /^(\d{1,6})(mo|m|h|d|w|y)(!?)(-?)$/.exec(own(SPAN_NAMES, span) ? SPAN_NAMES[span] : String(span));
    if (!m || !(+m[1] > 0)) return null;
    const unit = SPAN_UNITS[m[2]];
    const whole = m[3] === '!';
    if (whole && (unit === 'minute' || unit === 'hour')) return null;
    if (m[4] && !whole) return null;
    return { count: Math.min(+m[1], MAX_COUNT[unit]), unit, whole, skip: m[4] === '-' };
  }

  /** The local start of the `unit` holding `at`, moved by `n` units. Weeks start on Monday, as Homey's do. */
  function periodStart(at, unit, n) {
    const d = new Date(at);
    d.setHours(0, 0, 0, 0);
    if (unit === 'day') d.setDate(d.getDate() + n);
    else if (unit === 'week') d.setDate(d.getDate() - (d.getDay() + 6) % 7 + 7 * n);
    else if (unit === 'month') d.setMonth(d.getMonth() + n, 1);
    else d.setFullYear(d.getFullYear() + n, 0, 1);
    return d.getTime();
  }

  /** `at` moved by `n` calendar months, on the same day and time (the month's last day where it's shorter). */
  function addMonths(at, n) {
    const d = new Date(at);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return d.getTime();
  }

  /**
   * A span's window at `at`: the axis `[from, to]` and `end`, where its data stops. A rolling span ends at `at` (months
   * and years back on the calendar); whole periods (`unit`: `day`, `week`, `month`, `year`) cover theirs entirely,
   * with data up to `at` when the current one is in, else up to their end. A DST day is 23 or 25 h. An unknown span is
   * 24 h. `back`: that many windows before (Chart · Totals' period before).
   */
  function timeSpan(span, at, back = 0) {
    const p = parseSpan(span) || parseSpan('24h');
    if (p.whole) {
      const shift = (p.skip ? 1 : 0) + back * p.count;
      const from = periodStart(at, p.unit, 1 - p.count - shift);
      const to = periodStart(at, p.unit, 1 - shift);
      return { from, to, end: Math.min(to, at), unit: p.unit };
    }
    if (p.unit === 'month' || p.unit === 'year') {
      const months = p.count * (p.unit === 'year' ? 12 : 1);
      const to = addMonths(at, -months * back);
      return { from: addMonths(at, -months * (back + 1)), to, end: to };
    }
    const ms = p.count * UNIT_MS[p.unit];
    return { from: at - ms * (back + 1), to: at - ms * back, end: at - ms * back };
  }

  /** Whether `span` is one the widgets know. */
  function isTimeSpan(span) {
    return parseSpan(span) != null;
  }

  /**
   * Whether a chart's history came from Homey's 6-hour (or weekly) averages: its `step` in `/state`, the coarsest of the
   * logs the app read for it (lib/SparklineService.ts), not a guess from the span. Live values aren't appended to it (a
   * meter's would pile up behind the log).
   * @param {{ step?: number } | null | undefined} entry
   */
  function sixHourLog(entry) {
    return !!entry && typeof entry.step === 'number' && entry.step >= DAY / 4;
  }

  /** The time span block's units (scripts/chart-settings.json `span{n}`): the rolling ones, then whole periods. */
  const SETTING_UNITS = {
    minutes: 'm', hours: 'h', days: 'd', weeks: 'w', months: 'mo', years: 'y', calDays: 'd!', calWeeks: 'w!', calMonths: 'mo!', calYears: 'y!',
  };

  /**
   * A chart's span from its settings (the catalog's time span block): `count<n>` of the unit `span<n>`, whole periods
   * with `leaveOut<n>` leaving out the current one. A span stored before 1.2.0 (`24h`, `today`, `lastMonth` …) is used
   * as it was, until the unit is picked. Missing ones are `defaults` (`{count, unit}`).
   */
  function spanSetting(settings, n = '', defaults = { count: 24, unit: 'hours' }) {
    const stored = settings[`span${n}`];
    if (typeof stored === 'string' && isTimeSpan(stored) && !own(SETTING_UNITS, stored)) return stored;
    const unit = own(SETTING_UNITS, stored) ? SETTING_UNITS[stored] : SETTING_UNITS[defaults.unit];
    const count = Math.max(1, Math.round(Number(settings[`count${n}`]) || defaults.count));
    return `${count}${unit}${unit.endsWith('!') && settings[`leaveOut${n}`] === true ? '-' : ''}`;
  }

  /** Why a write through the personal API key failed (`KeyProblem` in lib/PersonalApiKey.ts): each has its own message. */
  const KEY_PROBLEMS = ['noKey', 'keyScope', 'keyInvalid'];

  /** Units written right after the number: `21°C`, `45%`. */
  const TIGHT_UNITS = /^(°|%)/;

  /** A `%` number as 0–100 (a 0–1 range, like Homey's `dim`, is scaled up), else the number itself. */
  function scaled(cap, value) {
    return cap.units === '%' && cap.max === 1 && (cap.min == null || cap.min === 0) ? value * 100 : value;
  }

  /**
   * A number in the device locale, to the capability's decimals (at most 4; 1 without them, none for a scaled `%`).
   * `averaged`: a value Homey didn't report (an average, a chart's point or bar, its high or low) keeps three
   * significant digits within those, so a 2-decimal meter's average is `1,304`, not `1,304.48`; `22.5`, `0.137` stay.
   */
  function formatNumber(cap, value, averaged = false) {
    const v = scaled(cap, value);
    let digits = v !== value ? 0 : cap.decimals != null ? Math.max(0, Math.min(cap.decimals, 4)) : 1;
    if (averaged && v !== 0) digits = Math.min(digits, Math.max(0, 2 - Math.floor(Math.log10(Math.abs(v)))));
    return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  /**
   * A capability value as the tiles show it: a number to its decimals with its units (`°` and `%` attached), yes/no
   * as `t('on')`/`t('off')`, an enum by its value's title, else the text; `–` for none.
   * @param {{type?: string, units?: string|null, decimals?: number|null, min?: number|null, max?: number|null, values?: {id: string, title: string}[]|null}} cap
   * @param {unknown} value
   * @param {(key: string) => string} [t]
   */
  function formatValue(cap, value, t) {
    if (value == null || value === '') return '–';
    if (typeof value === 'boolean') return t ? t(value ? 'on' : 'off') : String(value);
    if (typeof value === 'number' && isFinite(value)) {
      const text = formatNumber(cap, value);
      if (!cap.units) return text;
      return TIGHT_UNITS.test(cap.units) ? `${text}${cap.units}` : `${text} ${cap.units}`;
    }
    const v = (cap.values || []).find(x => x.id === String(value));
    return v ? v.title : String(value);
  }

  // Homey's standard capabilities carry no icon of their own (the Homey app draws them), so these stand
  // in unless the capability has one. Drawn like Quick Actions' glyphs: each viewBox cropped to the ink
  // (plus half the stroke), with the library icons' thin line.
  // Made on first use (`btoa` isn't everywhere the kit is loaded).
  const valueSvg = (viewBox, body) => {
    let url = null;
    return () => url || (url = `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="#000" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`)}`);
  };
  const LOCK_BOX = '4.4 2.4 15.2 19.2';
  const VALUE_GLYPHS = {
    thermometer: valueSvg('7.4 2.4 9.2 19.6', '<path d="M10 13.8V5a2 2 0 0 1 4 0v8.8a4 4 0 1 1-4 0z"/><path d="M12 9v6"/>'),
    drop: valueSvg('5.4 2.4 13.2 18.2', '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
    bolt: valueSvg('3.4 1.4 16.2 21.2', '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    sun: valueSvg('1.4 1.4 21.2 21.2', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    cloud: valueSvg('2.4 3.4 20.2 15.2', '<path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9.5z"/>'),
    battery: valueSvg('2.4 6.4 19.2 11.2', '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10v4"/>'),
    bell: valueSvg('3.9 4.4 16.2 18.7', '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    power: valueSvg('3.4 2.4 17.2 18.6', '<path d="M12 3v9"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>'),
    locked: valueSvg(LOCK_BOX, '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    unlocked: valueSvg(LOCK_BOX, '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
    bulb: valueSvg('5.4 2.4 13.2 19.2', '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>'),
    wave: valueSvg('2.4 2.4 19.2 16.2', '<path d="M3 12h2l2-6 3 12 3-15 3 15 2-6h3"/>'),
    gauge: valueSvg('3.4 8.4 17.2 9.2', '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>'),
  };

  /**
   * The built-in glyph for a capability and its current value (Device Values', Value Board's and Combined Value's icons), as an SVG data
   * URL for a mask.
   * @param {string} capabilityId
   * @param {unknown} [value]
   */
  function valueGlyph(capabilityId, value) {
    return glyphFor(capabilityId, value)();
  }
  function glyphFor(capabilityId, value) {
    const base = capabilityId.split('.')[0];
    if (base === 'measure_temperature' || base === 'target_temperature') return VALUE_GLYPHS.thermometer;
    if (base === 'measure_humidity' || base === 'measure_rain') return VALUE_GLYPHS.drop;
    if (base === 'measure_power' || base === 'meter_power' || base === 'measure_current' || base === 'measure_voltage') return VALUE_GLYPHS.bolt;
    if (base === 'measure_luminance' || base === 'measure_ultraviolet') return VALUE_GLYPHS.sun;
    if (/^measure_(co2|co|pm\d+|voc|tvoc)$/.test(base)) return VALUE_GLYPHS.cloud;
    if (base === 'measure_battery' || base === 'alarm_battery') return VALUE_GLYPHS.battery;
    if (base.startsWith('alarm_')) return VALUE_GLYPHS.bell;
    if (base === 'onoff') return VALUE_GLYPHS.power;
    if (base === 'locked') return value ? VALUE_GLYPHS.locked : VALUE_GLYPHS.unlocked;
    if (base === 'dim') return VALUE_GLYPHS.bulb;
    if (base === 'measure_noise') return VALUE_GLYPHS.wave;
    return VALUE_GLYPHS.gauge;
  }

  /**
   * Capabilities with a usual comfortable range (Room Health's defaults; Value Matrix's and Combined Value's empty OK range) and a short header, both only in the unit
   * named (`units`, matched without case; a missing one passes where `optional`). `label` is a string key when it's
   * translated.
   */
  const KNOWN_VALUES = [
    { id: /^measure_temperature(\.|$)/, units: /^°C$/, range: { min: 18, max: 24 }, label: '°C' },
    { id: /^measure_humidity(\.|$)/, units: /^%$/, range: { min: 30, max: 60 }, label: '%' },
    { id: /^measure_co2$/, units: /^ppm$/i, optional: true, range: { min: null, max: 1000 }, label: 'CO₂' },
    { id: /^measure_radon$/, units: /^bq\/m(3|³)$/i, range: { min: null, max: 100 }, label: { key: 'radon' } },
    { id: /^measure_pm25$/, units: /^(μ|µ|u)g\/m(3|³)$/i, optional: true, range: { min: null, max: 15 }, label: 'PM2.5' },
    { id: /^measure_pm10$/, units: /^(μ|µ|u)g\/m(3|³)$/i, optional: true, range: { min: null, max: 45 }, label: 'PM10' },
    { id: /^measure_t?voc$/i, units: /^ppb$/i, range: { min: null, max: 1000 }, label: { key: 'voc' } },
  ];

  /** The known capability a column is, in its expected unit, or null. */
  function knownValue(column) {
    if (!column || !column.capabilityId) return null;
    const units = column.units ? String(column.units).trim() : '';
    return KNOWN_VALUES.find(k => k.id.test(column.capabilityId) && (units ? k.units.test(units) : !!k.optional)) || null;
  }

  const RANGE_NUM = '(-?\\d+(?:[.,]\\d+)?)';
  const RANGE_BETWEEN = new RegExp(`^${RANGE_NUM}\\s*[-–—]\\s*${RANGE_NUM}$`);
  const RANGE_BELOW = new RegExp(`^(?:<=?|≤)\\s*${RANGE_NUM}$`);
  const RANGE_ABOVE = new RegExp(`^(?:>=?|≥)\\s*${RANGE_NUM}$`);
  const rangeNum = s => Number(s.replace(',', '.'));

  /**
   * A value's OK range (Value Matrix's columns, Combined Value), `{min, max}` (either may be null), from its setting: `18–24` (or `-`/`—`), `<1000`,
   * `≤1000`, `>10`, `≥10`. Empty is the usual range of a known capability in its unit (`column`: `{capabilityId,
   * units}`), else none; `–` alone, or text it can't read, is none (null).
   */
  function okRange(text, column) {
    const s = typeof text === 'string' ? text.trim() : text == null ? '' : String(text).trim();
    if (!s) {
      const known = knownValue(column);
      return known ? { ...known.range } : null;
    }
    let m = s.match(RANGE_BETWEEN);
    if (m) {
      const [a, b] = [rangeNum(m[1]), rangeNum(m[2])];
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
    if ((m = s.match(RANGE_BELOW))) return { min: null, max: rangeNum(m[1]) };
    if ((m = s.match(RANGE_ABOVE))) return { min: rangeNum(m[1]), max: null };
    return null;
  }

  /**
   * A value's level (a Value Matrix cell, a Combined Value device): `none` without a reading, `plain` without a range, else `good` inside it (edges included), `out`
   * past it, and `far` past it by half its width or more (one-sided: half the limit, so 1.5 × an upper one).
   */
  function okLevel(value, range) {
    if (typeof value !== 'number' || !isFinite(value)) return 'none';
    if (!range || (range.min == null && range.max == null)) return 'plain';
    let distance = 0;
    if (range.min != null && value < range.min) distance = range.min - value;
    else if (range.max != null && value > range.max) distance = value - range.max;
    if (distance <= 0) return 'good';
    const margin = range.min != null && range.max != null ? (range.max - range.min) / 2 : Math.abs(range.min != null ? range.min : range.max) / 2;
    return distance >= margin ? 'far' : 'out';
  }

  /** A frame's load marks for the app's diagnostics log (`wireFrame()`'s `perf=`): start, HTML, SDK ready, request. */
  function loadMarks(sdkAt) {
    const nav = /** @type {PerformanceNavigationTiming | null} */ (performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null);
    return [Math.round(performance.timeOrigin), nav ? Math.round(nav.responseEnd) : -1,
      Math.round(sdkAt), Math.round(performance.now())].join(',');
  }

  /**
   * A mount's link to Homey's frame (`frame`: the body, or a Smart Stack slide):
   * - `ready(opts)` tells Homey the widget is ready, once (later calls do nothing). `fonts: true` waits for the text
   *   font first, so text doesn't pop in after the icons, with `waitFor()`'s promises too, at most `maxMs`; `before()`
   *   runs just before.
   * - `setHeight()` passes the frame's height on, once ready (the widget's `onHeight`); `height()` is that height.
   * - `perfParam(sep)` is the load marks for the app's diagnostics log, `&perf=…` (`?perf=…` with `'?'`), on the first
   *   request only.
   */
  function wireFrame(Homey, frame) {
    const sdkAt = performance.now();
    let marksSent = false;
    let readyStarted = false;
    let readySent = false;
    const height = () => Math.ceil(frame.getBoundingClientRect().height);
    return {
      height,
      setHeight() {
        if (readySent) Homey.setHeight(height());
      },
      async ready({ fonts = false, waitFor = null, maxMs = 1000, before = null } = {}) {
        if (readyStarted) return;
        readyStarted = true;
        /** @type {Promise<unknown>[]} */
        const waits = waitFor ? waitFor() : [];
        if (fonts && document.fonts && document.fonts.ready) waits.unshift(document.fonts.ready);
        if (waits.length) await Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, maxMs))]);
        if (before) before();
        readySent = true;
        Homey.ready({ height: height() });
      },
      perfParam(sep = '&') {
        if (marksSent) return '';
        marksSent = true;
        return `${sep}perf=${loadMarks(sdkAt)}`;
      },
    };
  }

  /**
   * When a mount reads its state again, besides its first read: every `every` ms (null: the mount has its own timer), when
   * the page is back after being hidden 30 s or more (realtime changes may have been missed meanwhile), and soon after
   * a failed read: the mount's load calls `failed()`, which tries again after 5, 15 and 30 s, so a busy Homey's error
   * doesn't stay until the next refresh. A refresh starts the count over.
   * @param {() => unknown} load
   * @param {number | null} [every]
   */
  function wireRefresh(load, every = DEVICE_REFRESH_MS) {
    let hiddenAt = null;
    let tries = 0;
    let timer = null;
    if (every) setInterval(() => { tries = 0; load(); }, every);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (hiddenAt == null) hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt == null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= RESUME_AFTER_MS) { tries = 0; load(); }
    });
    return {
      failed() {
        if (timer != null || tries >= RETRY_MS.length) return;
        timer = setTimeout(() => { timer = null; load(); }, RETRY_MS[tries++]);
      },
    };
  }

  /**
   * The mount's vibration for a tap that acts: Homey's haptic throws unless a touch has just ended (a click, a key, a
   * late send), and then there's nothing. `together`: once for what's sent at once (a room's lights, a preset's values).
   * @param {any} Homey
   * @param {{ together?: boolean }} [opts]
   * @returns {() => void}
   */
  function wireHaptic(Homey, { together = false } = {}) {
    let at = 0;
    return () => {
      if (together) {
        if (Date.now() - at < HAPTIC_TOGETHER_MS) return;
        at = Date.now();
      }
      try { if (Homey.hapticFeedback) Homey.hapticFeedback(); } catch (e) { /* not now */ }
    };
  }

  /**
   * "Activate with" (`press`: Quick Actions', Flow Buttons'), so a stray tap can't act, by each tile's or row's id.
   * `ask(id, from)`: Double's tap, true when it only asks for a second one (for PRESS_CONFIRM_MS; a second tap that finds
   * another `from` than the first asks again). `hint(id)`: Long's short tap, which only says *Hold* (for PRESS_HINT_MS).
   * `hold(id, when, act)`: `onTap()`'s `hold`, with the vibration as the finger lifts, as Homey's only works right after
   * a touch ends. `render` draws `asking()` and `hinting()`.
   * @param {{ render: () => void, onHaptic?: () => void }} opts
   */
  function pressGuard({ render, onHaptic }) {
    const confirming = new Map(); // id → { from, timer }
    const hints = new Map(); // id → timer
    const drop = (id) => {
      const c = confirming.get(id);
      if (c) clearTimeout(c.timer);
      confirming.delete(id);
    };
    return {
      holdMs: PRESS_HOLD_MS,
      asking: id => confirming.has(id),
      /** What the first tap saw, while one waits for the second. */
      askedFrom: id => (confirming.has(id) ? confirming.get(id).from : undefined),
      drop,
      ask(id, from) {
        const c = confirming.get(id);
        drop(id);
        if (c && c.from === from) return false;
        confirming.set(id, { from, timer: setTimeout(() => { confirming.delete(id); render(); }, PRESS_CONFIRM_MS) });
        render();
        return true;
      },
      hinting: id => hints.has(id),
      hint(id) {
        clearTimeout(hints.get(id));
        hints.set(id, setTimeout(() => { hints.delete(id); render(); }, PRESS_HINT_MS));
        render();
      },
      hold: (id, when, act) => ({
        ms: PRESS_HOLD_MS,
        when,
        start: () => { clearTimeout(hints.get(id)); hints.delete(id); render(); },
        act,
        done: () => { if (onHaptic) onHaptic(); },
      }),
    };
  }

  /**
   * Marks a device's tile as unavailable (Homey's `available: false`, or a device that's gone): its content dimmed, as
   * what it shows is only the last it reported, with a small `!` in the corner saying `label` to a screen reader. Without
   * `label` only dimmed, for what's too small for a mark. kit.css draws both.
   * @param {HTMLElement} node
   * @param {unknown} offline
   * @param {string} [label]
   */
  function markOffline(node, offline, label) {
    node.classList.toggle('wk-offline', !!offline);
    let badge = /** @type {HTMLElement | null} */ (node.querySelector(':scope > .wk-offline-badge'));
    if (!offline || !label) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) badge = el('span', { class: 'wk-offline-badge', role: 'img', text: '!' }, node);
    badge.title = label;
    badge.setAttribute('aria-label', label);
  }

  /**
   * A device value setting's pick (an autocomplete item whose id is `<deviceId>:<capabilityId>`): the id, or null for none
   * or one that isn't a value (as lib/ValueService.ts' `parseSlot()`).
   * @param {unknown} item
   * @returns {string | null}
   */
  function slotId(item) {
    const id = item && typeof item === 'object' ? /** @type {{ id?: unknown }} */ (item).id : null;
    return typeof id === 'string' && id.indexOf(':') > 0 && !id.endsWith(':') ? id : null;
  }

  /** The widget's `devices` setting (`Homey.getDeviceIds()`), always a list: empty without one or on a failure. */
  function getDeviceIds(Homey) {
    return Promise.resolve(typeof Homey.getDeviceIds === 'function' ? Homey.getDeviceIds() : [])
      .then(ids => (Array.isArray(ids) ? ids : []), () => []);
  }

  /**
   * A mount's tile names (`renameTiles`), which the app keeps per widget instance: `state(path)` reads `/state` with
   * them (a failure keeps the last ones), realtime keeps them current, and `rename(key, name)` saves one. `setNames` is
   * the widget's.
   */
  function wireTileNames(Homey, setNames) {
    let instance = 'default';
    let asked = '';
    try { asked = typeof Homey.getWidgetInstanceId === 'function' ? Homey.getWidgetInstanceId() : ''; } catch (e) { /* stays 'default' */ }
    const known = Promise.resolve(asked)
      .then((id) => { if (typeof id === 'string' && id) instance = id; })
      .catch(() => {});
    Homey.on('tilenames:state', (data) => {
      if (data && data.instance === instance) setNames(data.names);
    });
    return {
      // `/state` with the instance answers `{state, tileNames}`: the names come with every read, in one request.
      state: path => known
        .then(() => Homey.api('GET', `${path}&instance=${encodeURIComponent(instance)}`))
        .then((res) => {
          if (!res || typeof res !== 'object' || !('tileNames' in res)) return res;
          setNames(res.tileNames);
          return res.state;
        }),
      rename: (key, name) => known.then(() => Homey.api('POST', '/names', { instance, key, name })),
    };
  }

  /**
   * When a widget's nodes last got a touch (`touched()`), so a click the browser sends after it is ignored
   * (`recent()`). One per widget, shared by its taps and its bars: a touch on a bar mustn't come back as a tap on
   * the tile under it.
   */
  function touchGuard() {
    let at = 0;
    return {
      touched() { at = Date.now(); }, // the real clock: a widget's opts.now may be fixed
      recent() { return Date.now() - at < CLICK_AFTER_TOUCH_MS; },
    };
  }

  /**
   * Taps (born in Quick Actions): a touch that ends within TAP_SLOP of where it started, so a drag is left to the
   * dashboard and still scrolls it (on Android too, where the dashboard takes drags), with `click` kept for mouse and
   * keyboard. `pressing` is on the node while a touch may still be a tap. Every touch goes to `guard`, not only taps,
   * so the click a browser still sends after a short swipe is ignored. `fn(event)`.
   * - `keys` (on): Enter and Space call it too, for a focusable non-button; off where keys inside it (a button, an
   *   input) would bubble to it, or on a `<button>`, which clicks on them itself.
   * - `stop`: the touch, click and keys stop at this node, so a button inside a row or tile doesn't press it too.
   * - `guard`: the widget's `touchGuard()` (default: one of the node's own).
   * - `hold` (Quick Actions' `press: long`): while `hold.when()` says so, a touch held still, the left mouse button or
   *   Enter/Space (whose own click is kept back) held for `hold.ms` calls `hold.act()`; let go sooner and it's a tap.
   *   `holding` is on the node meanwhile, `hold.start()` is called as it begins, and the long-press menu is prevented.
   *   `hold.done()` is called a tick after the finger that held lifts: `Homey.hapticFeedback()` throws unless a touch
   *   has just ended, so the vibration goes there (the tick lets Homey's own touchend listener note the time first).
   * @param {HTMLElement} node
   * @param {(e: Event) => void} fn
   * @param {{ keys?: boolean, stop?: boolean, guard?: { touched: () => void, recent: () => boolean },
   *   hold?: { ms: number, when: () => boolean, act: () => void, start?: () => void, done?: () => void } }} [opts]
   */
  function onTap(node, fn, { keys = true, stop = false, guard = touchGuard(), hold = null } = {}) {
    let start = null;
    let holdTimer = null;
    let held = false; // a long press acted: the touch, click or key that ends it isn't a tap
    const unpress = () => {
      start = null;
      clearTimeout(holdTimer);
      holdTimer = null;
      node.classList.remove('pressing', 'holding');
    };
    const holds = () => !!hold && hold.when();
    const press = () => {
      held = false;
      if (!holds()) return;
      node.classList.add('holding');
      holdTimer = setTimeout(() => {
        unpress();
        held = true;
        hold.act();
      }, hold.ms);
      if (hold.start) hold.start();
    };
    node.addEventListener('touchstart', (e) => {
      if (stop) e.stopPropagation();
      const p = e.changedTouches[0];
      start = { x: p.clientX, y: p.clientY };
      node.classList.add('pressing');
      press();
    }, { passive: true });
    node.addEventListener('touchmove', (e) => {
      const p = e.changedTouches[0];
      if (start && Math.hypot(p.clientX - start.x, p.clientY - start.y) > TAP_SLOP) unpress();
    }, { passive: true });
    node.addEventListener('touchend', (e) => {
      const tap = !!start; // not after a drag, or a long press that acted
      if (held && hold.done) setTimeout(hold.done, 0);
      unpress();
      held = false;
      // Every touch: one that moved past TAP_SLOP can still get the browser's click.
      guard.touched();
      if (!tap) return;
      e.preventDefault(); // no click after it
      if (stop) e.stopPropagation();
      fn(e);
    });
    node.addEventListener('touchcancel', unpress);
    node.addEventListener('click', (e) => {
      if (stop) e.stopPropagation();
      if (guard.recent()) return;
      if (held) {
        held = false;
        return;
      }
      fn(e);
    });
    if (keys || hold) {
      node.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const holding = holds();
        if (!keys && !holding) return;
        e.preventDefault();
        if (stop) e.stopPropagation();
        if (!holding) fn(e);
        else if (!e.repeat && !holdTimer) press();
      });
    }
    if (hold) {
      node.addEventListener('keyup', (e) => {
        if ((e.key !== 'Enter' && e.key !== ' ') || (!holdTimer && !held)) return;
        e.preventDefault();
        if (stop) e.stopPropagation();
        const early = !!holdTimer;
        unpress();
        held = false;
        if (early) fn(e);
      });
      // The mouse after a touch is the browser's own (no hold of its own).
      node.addEventListener('mousedown', (e) => { if (e.button === 0 && !guard.recent()) press(); });
      node.addEventListener('mouseup', unpress);
      node.addEventListener('mouseleave', unpress);
      // A long press would open Android's context menu.
      node.addEventListener('contextmenu', (e) => { if (holds()) e.preventDefault(); });
    }
  }

  /**
   * A widget's message line: `set(text, transient)` shows `text` (`text` is what shows, null for none). A transient
   * one (a failed refresh or tap) goes by itself after `ms`; a lasting one (a failed first load) also runs `clear()`,
   * which drops what the widget showed. `reset()` takes it away when fresh state comes; `reset({lastingOnly: true})`
   * leaves a transient one to run out.
   * @param {() => void} render
   * @param {{ clear?: (() => void) | null, ms?: number }} [opts]
   */
  function messageLine(render, { clear = null, ms = 8000 } = {}) {
    let text = null;
    let timer = null;
    return {
      get text() { return text; },
      set(value, transient) {
        if (timer) clearTimeout(timer);
        timer = null;
        text = value;
        if (transient) timer = setTimeout(() => { text = null; render(); }, ms);
        else if (clear) clear();
        render();
      },
      reset({ lastingOnly = false } = {}) {
        if (!lastingOnly || !timer) text = null;
      },
    };
  }

  /**
   * Runs `load` when the app settings page changes how device names show (`lib/deviceNames.ts`): the names come with
   * the widget's own read, so it reads again.
   * @param {any} Homey
   * @param {() => void} load
   */
  function onDeviceNames(Homey, load) {
    Homey.on('devicenames:state', () => load());
  }

  /**
   * The usual device widget's loop (CLAUDE.md): the `devices` setting's ids, `/state?deviceIds=…` with them now and
   * every 5 min (the app drops a device's tracking after 10 min without one) and when the device names setting changes
   * (`onDeviceNames()`), and the realtime `event`'s changes of those devices (`watches(id)` adds others, e.g. a group's
   * lights). Without devices the widget says
   * `selectDevices` (or what `need()` says is missing); a failed refresh keeps the tiles with a passing message, only
   * a failed first load replaces them. `tileNames` (the mount's `wireTileNames()`) reads the names with it; `query()`
   * adds to the request; `setState(state)` hands the answer to the widget (default `widget.setState(state)`), and
   * `onState(state)` runs after each good one. `more` are ids picked another way (the Cameras widget's Camera slots),
   * after the `devices` setting's, a repeat left out. `times`: the widget shows times, so it follows the app's time
   * format (`wireTimeFormat()`). `devicesOptional`: no devices is a pick too (Combined Value: every device with the
   * value), so `/state` is asked with none and only `need()` can hold it back. Ready is told after the first load, once the
   * text font is in (at most 1 s), so the names don't pop in after the icons.
   * @param {any} Homey
   * @param {{ ready: (opts?: object) => Promise<void>, perfParam: (sep?: string) => string }} link the mount's `wireFrame()`
   * @param {any} widget
   * @param {{ event?: string | null, tileNames?: { state: (path: string) => Promise<any> } | null, query?: () => string,
   *   need?: (ids: string[]) => string | null, watches?: (id: string) => boolean, setState?: ((state: any) => void) | null,
   *   onState?: ((state: any) => void) | null, more?: string[], times?: boolean, devicesOptional?: boolean }} [opts]
   */
  function wireDeviceState(Homey, link, widget, {
    event = null, tileNames = null, query = () => '', need = () => null, watches = () => false, setState = null, onState = null, more = [],
    times = false, devicesOptional = false,
  } = {}) {
    let deviceIds = [];
    let loaded = false;
    const ready = () => link.ready({ fonts: true });
    let refresh = null;
    let loadSeq = 0; // only the latest load's answer counts: an older one that comes in last would undo it
    async function load() {
      const seq = ++loadSeq;
      const missing = deviceIds.length || devicesOptional ? need(deviceIds) : 'selectDevices';
      if (missing) {
        widget.setMessage(widget.t(missing));
        ready();
        return;
      }
      try {
        const path = `/state?deviceIds=${deviceIds.map(encodeURIComponent).join(',')}${query()}${link.perfParam()}`;
        const state = await (tileNames ? tileNames.state(path) : Homey.api('GET', path));
        if (seq !== loadSeq) return; // a newer load is on its way
        if (setState) setState(state);
        else widget.setState(state);
        loaded = true;
        if (onState) onState(state);
      } catch (err) {
        if (seq !== loadSeq) return;
        console.error(err);
        // A failed refresh keeps the tiles; only a failed first load replaces them with the error.
        widget.setMessage(widget.t('error'), loaded);
        refresh.failed();
      }
      ready();
    }
    if (event) {
      Homey.on(event, (data) => {
        if (data && (deviceIds.includes(data.deviceId) || watches(data.deviceId))) widget.pushChange(data);
      });
    }
    getDeviceIds(Homey)
      .then((ids) => { deviceIds = [...new Set([...ids, ...more])]; })
      .then(() => {
        refresh = wireRefresh(load);
        onDeviceNames(Homey, load);
        load();
      });
    // A widget that shows times draws them again when the app's time format changes.
    if (times) wireTimeFormat(Homey, () => { if (loaded) load(); });
    return {
      /** The `devices` setting's ids, then `more` (empty until read). */
      ids: () => deviceIds,
      /** Whether a `/state` has come. */
      loaded: () => loaded,
    };
  }

  /** How long a changed value is shown while waiting for the device to confirm it. */
  const OPTIMISTIC_MS = 10e3;

  /**
   * Values just sent, shown over the reported ones until the device confirms them or `ms` passes (Light Controls,
   * Lights by Room, Curtains). Keyed by device and capability.
   */
  function optimistic(render, ms = OPTIMISTIC_MS) {
    const map = new Map(); // `${deviceId}:${capabilityId}` → { value, until }
    return {
      /** A capability's value, or the one just sent while the device hasn't confirmed it. */
      shown(d, capabilityId) {
        const key = `${d.id}:${capabilityId}`;
        const o = map.get(key);
        if (o && Date.now() < o.until) return o.value;
        map.delete(key);
        return d.caps[capabilityId] ? d.caps[capabilityId].value : null;
      },
      /** One value, without a render when it runs out (the caller schedules that). */
      set(deviceId, capabilityId, value) { map.set(`${deviceId}:${capabilityId}`, { value, until: Date.now() + ms }); },
      /** `values` for each of `devices` that has the capability, and a render when they run out. */
      hope(devices, values) {
        const until = Date.now() + ms;
        for (const x of devices) {
          for (const [id, value] of Object.entries(values)) {
            if (x.caps[id]) map.set(`${x.id}:${id}`, { value, until });
          }
        }
        setTimeout(render, ms + 50);
      },
      /** A report: drops the value hoped for once the device says the same. */
      confirm(deviceId, capabilityId, value) {
        const key = `${deviceId}:${capabilityId}`;
        const o = map.get(key);
        if (o && o.value === value) map.delete(key);
      },
      /** Drops what was hoped for these capabilities (one or a list). */
      drop(deviceId, capabilityIds) {
        for (const id of [].concat(capabilityIds)) map.delete(`${deviceId}:${id}`);
      },
    };
  }

  /** Restarts a node's shake animation (a failed change). */
  function shake(node) {
    if (!node) return;
    node.classList.remove('shake');
    void node.offsetWidth; // restart the animation
    node.classList.add('shake');
  }

  /**
   * A widget's strings: `opts.t`'s `<ns>.<key>` (read at each call), else the widget's English fallback from
   * `defaults` (its DEFAULT_STRINGS, en.json's), with `__token__`s filled in; the key itself when neither has it.
   */
  function translator(ns, defaults, opts) {
    return (key, tokens) => {
      const s = opts.t ? opts.t(`${ns}.${key}`, tokens) : null;
      if (s && s !== `${ns}.${key}`) return s;
      return (defaults[key] || key).replace(/__(\w+)__/g, (_, k) => (tokens && tokens[k] != null ? tokens[k] : ''));
    };
  }

  /** A function that tells `hooks.onHeight` the root's height (rounded up) whenever it's changed since the last call. */
  function heightReporter(root, hooks) {
    let last = 0;
    return () => {
      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h && h !== last) { last = h; if (hooks.onHeight) hooks.onHeight(h); }
    };
  }

  /** A 24 px icon `{d, fill}` as an inline SVG of class `cls`; a filled one's path has the class `filled`. */
  function svgIcon(icon, cls) {
    const svg = el('svg', { viewBox: '0 0 24 24', class: cls, 'aria-hidden': 'true' }, null, SVG_NS);
    el('path', { d: icon.d, class: icon.fill ? 'filled' : null }, svg, SVG_NS);
    return svg;
  }

  /**
   * A bar (Light Controls', Lights by Room's, Curtains'): a drag sets the value live (`drags`, id → 0–1, then a
   * render) and `commit(id, x)` sends it when let go; a tap sets it where it lands. The touches are taken
   * (preventDefault, touch-action: none) so iOS doesn't scroll the dashboard. Homey's Android app takes the touch
   * anyway after about 100 ms (touchcancel): that gesture is dropped, but a quick tap still gets through.
   * @param {HTMLElement} bar
   * @param {{ id: string, drags: Map<string, number>, guard: TouchGuard, render: () => void, commit: (id: string, x: number) => void }} opts
   */
  function wireBar(bar, { id, drags, guard, render, commit }) {
    const at = clientX => {
      const r = bar.getBoundingClientRect();
      return r.width ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0;
    };
    const move = (clientX) => {
      drags.set(id, at(clientX));
      render();
    };
    const end = (commitIt) => {
      if (!drags.has(id)) return;
      const x = drags.get(id);
      drags.delete(id);
      bar.classList.remove('dragging');
      if (commitIt) commit(id, x);
      else render();
    };
    bar.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      bar.classList.add('dragging');
      move(e.changedTouches[0].clientX);
    }, { passive: false });
    bar.addEventListener('touchmove', (e) => {
      e.preventDefault();
      move(e.changedTouches[0].clientX);
    }, { passive: false });
    bar.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      guard.touched();
      end(true);
    });
    bar.addEventListener('touchcancel', () => end(false));
    // Mouse (and pen): pointer events with capture, ignored for touch (handled above).
    bar.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      if (bar.setPointerCapture) bar.setPointerCapture(e.pointerId);
      bar.classList.add('dragging');
      move(e.clientX);
    });
    bar.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || !drags.has(id)) return;
      move(e.clientX);
    });
    bar.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      end(true);
    });
    bar.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'touch') return;
      end(false);
    });
    bar.addEventListener('click', e => e.stopPropagation()); // not a tap on the tile
  }

  /**
   * The tiles for a widget's devices (Light Controls, Curtains): one per device, or with `byZone` one per room that
   * has two or more usable ones, placed where its first is (id `zone:<zoneId>`, the room's name). A device that isn't
   * `usable` gets `{id, missing: true}`. `extra(first)` adds a tile's own fields from its (first) device.
   */
  function roomTiles(devices, { byZone, usable, extra }) {
    const rooms = new Map(); // zone id → its usable devices
    if (byZone) {
      for (const d of devices) {
        if (!usable(d) || !d.zone) continue;
        if (!rooms.has(d.zone.id)) rooms.set(d.zone.id, []);
        rooms.get(d.zone.id).push(d);
      }
    }
    const out = [];
    const placed = new Set();
    for (const d of devices) {
      if (!usable(d)) { out.push({ id: d.id, missing: true }); continue; }
      const room = d.zone ? rooms.get(d.zone.id) : null;
      if (room && room.length > 1) {
        if (placed.has(d.zone.id)) continue;
        placed.add(d.zone.id);
        out.push({ id: `zone:${d.zone.id}`, name: d.zone.name, ...extra(room[0]), members: room });
      } else {
        out.push({ id: d.id, name: d.name, ...extra(d), members: [d] });
      }
    }
    return out;
  }

  /**
   * Light colours, shared by Light Controls and Lights by Room: the chip glyphs, the swatch palettes and the colour
   * a light, a swatch or a Mood shows.
   */
  const lightSvg = (viewBox, body) => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="#000" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`)}`;
  /** Built on first use (`btoa`), so loading the kit needs none (test/helpers/flowIcons.ts runs it in a bare context). */
  let lightGlyphs = null;
  const LIGHT_GLYPHS = () => lightGlyphs || (lightGlyphs = {
    // A thermometer with a sun ray, for the temperature chip.
    temp: lightSvg('6.3 1.3 11.4 21.4', '<path d="M10 14.5V4a2 2 0 0 1 4 0v10.5a4 4 0 1 1-4 0z"/><circle cx="12" cy="17.5" r="1.6" fill="#000"/><path d="M12 9.5v6"/>'),
    // A half-filled circle, for the chip of a light with colour: a ring with its right half filled.
    hue: lightSvg('2 2 20 20', '<circle cx="12" cy="12" r="9" stroke-width="1.6"/><path fill="#000" stroke="none" d="M12 3a9 9 0 0 1 0 18z"/>'),
    close: lightSvg('5 5 14 14', '<path d="M6 6l12 12M18 6L6 18"/>'),
    // A full circle, for the chip of a tile whose lights shine in several colours: filled with a pie of them.
    pie: lightSvg('2 2 20 20', '<circle cx="12" cy="12" r="9" fill="#000" stroke="none"/>'),
  });

  /**
   * The swatch palettes (the `palette` setting): 7 colours for the first row (hue in degrees, saturation 0–1)
   * and 5 whites for the second (colour temperature, 0 = cool), each row in the order shown. Light Controls' `moods`
   * has no entry: it puts the room's Moods in the first row, and a room without Moods gets the default colours.
   */
  const PALETTES = {
    // Bright colours around the wheel, and whites from cool to warm.
    default: {
      colors: [[0, 1], [30, 1], [55, 1], [120, 1], [220, 1], [275, 1], [320, 1]],
      whites: [0, 0.25, 0.5, 0.75, 1],
    },
    // Warm: from red through orange and amber, on to warm and then cool white.
    warm: {
      colors: [[0, 1], [10, 1], [20, 1], [28, 0.95], [35, 0.85], [40, 0.7], [44, 0.5]],
      whites: [1, 0.75, 0.5, 0.25, 0],
    },
    // Dusk: the sky after sunset, indigo through violet and rose to coral and amber, with warm whites.
    dusk: {
      colors: [[240, 0.8], [262, 0.75], [285, 0.65], [320, 0.6], [345, 0.65], [12, 0.75], [30, 0.85]],
      whites: [1, 0.85, 0.7, 0.55, 0.4],
    },
  };

  /** The colour of a temperature (0 = cool, 1 = warm), as on Homey's own light card. */
  function temperatureColor(k) {
    const cool = [214, 232, 255];
    const warm = [255, 176, 84];
    const mix = cool.map((c, i) => Math.round(c + (warm[i] - c) * Math.min(1, Math.max(0, k))));
    return `rgb(${mix.join(' ')})`;
  }

  /** A colour light's hue and saturation (0–1); lighter as the saturation drops, so 0 is white. */
  function hueColor(hue, sat) {
    return `hsl(${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(62 + (1 - sat) * 38)}%)`;
  }

  /** The colour a light shines in: its hue in colour mode, else its temperature (or a warm white). */
  function lightColor(caps) {
    const v = id => (caps[id] ? caps[id].value : null);
    const hue = v('light_hue');
    const colourMode = v('light_mode') === 'color' || (!caps.light_mode && !caps.light_temperature);
    if (colourMode && typeof hue === 'number') {
      const sat = typeof v('light_saturation') === 'number' ? v('light_saturation') : 1;
      return hueColor(hue, sat);
    }
    const k = v('light_temperature');
    return temperatureColor(typeof k === 'number' ? k : 0.6);
  }

  /** A Mood's colours as the pill's dot: one colour, or a gradient through them (none without colours). */
  function moodDot(colors) {
    const list = (colors || []).map(c => ('temperature' in c ? temperatureColor(c.temperature) : hueColor(c.hue, c.saturation)));
    if (!list.length) return null;
    return list.length === 1 ? list[0] : `linear-gradient(135deg, ${list.join(', ')})`;
  }

  /** The swatches for a light (or tile) from `palette`: its colours with colour, then its whites, or a plain white without them. */
  function swatchList(palette, color, temp) {
    return [
      ...(color ? palette.colors.map(([hue, sat]) => ({ hue, sat })) : []),
      ...(temp ? palette.whites.map(k => ({ k })) : color ? [{ hue: 0, sat: 0 }] : []),
    ];
  }

  /**
   * The gradients of a tile or row whose lights shine in several colours, in the widget's CSS variables
   * (`--<prefix>-tint-bg` …): the tint (at `angle`, mixed into the tile as one colour is), the bar's fill (left to
   * right, mixed as the fill is) and the chip's pie. Null clears them.
   */
  function setBlend(node, colors, prefix, angle) {
    const v = name => `--${prefix}-${name}`;
    const props = colors ? {
      [v('tint-bg')]: `linear-gradient(${angle}, ${colors.map(c => `color-mix(in srgb, ${c} var(${v('tint')}), var(${v('tile')}))`).join(', ')})`,
      [v('fill-bg')]: `linear-gradient(to right, ${colors.map(c => `color-mix(in srgb, ${c} var(${v('fill-share')}), var(${v('fill-with')}))`).join(', ')})`,
      [v('pie')]: `conic-gradient(${colors.map((c, i) => `color-mix(in srgb, ${c} var(${v('fill-share')}), var(${v('fill-with')})) ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(', ')})`,
    } : { [v('tint-bg')]: '', [v('fill-bg')]: '', [v('pie')]: '' };
    for (const [k, val] of Object.entries(props)) {
      if (node.style.getPropertyValue(k) === val) continue;
      if (val) node.style.setProperty(k, val);
      else node.style.removeProperty(k);
    }
  }

  /** At most this many colours on a tile (or in a room's tint) whose lights shine in several. */
  const MAX_LIGHT_COLORS = 4;
  const LIGHT_CAPS = ['onoff', 'dim', 'light_temperature', 'light_mode', 'light_hue', 'light_saturation'];

  /**
   * The lights' state as Light Controls and Lights by Room show it: the reported values with the optimistic ones
   * over them, and what follows from them (on, brightness, colours). A tile or room is an item `{id, members}`.
   * @param {{ render: () => void, roomLevel?: string }} opts
   */
  /**
   * Light Controls' and Lights by Room's swatch panel: which tile or light it's open for (`id`, or null), closed after
   * `ms` without a touch (`arm()`, on each touch in it), and not opened while `blocked()` (renaming).
   * `drop()` forgets it without a render, for a render that's on its way.
   */
  function lightPanel({ ms, render, blocked }) {
    let id = null;
    let timer = null;
    const panel = {
      get id() { return id; },
      arm() {
        clearTimeout(timer);
        timer = setTimeout(panel.close, ms);
      },
      close() {
        clearTimeout(timer);
        timer = null;
        if (id == null) return;
        id = null;
        render();
      },
      toggle(next) {
        if (blocked()) return;
        if (id === next) { panel.close(); return; }
        id = next;
        panel.arm();
        render();
      },
      drop() {
        if (id == null) return;
        id = null;
        clearTimeout(timer);
      },
    };
    return panel;
  }

  function lightModel({ render, roomLevel }) {
    const values = optimistic(render);
    const { shown } = values;
    /** Each light's last brightness above 0, which the app restores on a light without `onoff`. */
    const lastDim = new Map();
    const noteDim = (id, value) => { if (typeof value === 'number' && value > 0) lastDim.set(id, value); };
    /** A light and, for a Homey group device, the lights in it (`groupLights`). */
    const withGroup = d => [d, ...(Array.isArray(d.groupLights) ? d.groupLights : [])];

    /** Whether the light is on: `onoff`, or a brightness above 0 without it. */
    function isOn(d) {
      const dim = shown(d, 'dim');
      if (d.caps.onoff) return shown(d, 'onoff') === true;
      return typeof dim === 'number' && dim > 0;
    }
    /** The brightness (0–1): a light without `dim` (a plug or a switch) is full while on. */
    function brightness(d) {
      if (!d.caps.dim) return isOn(d) ? 1 : 0;
      const dim = shown(d, 'dim');
      return isOn(d) && typeof dim === 'number' ? dim : 0;
    }
    /** The colour a light shines in, from its shown (optimistic) values. */
    const colorOf = d => lightColor(Object.fromEntries(Object.keys(d.caps).map(k => [k, { value: shown(d, k) }])));

    return {
      shown, withGroup, isOn, brightness, colorOf,
      settable: (d, id) => !!d.caps[id] && d.caps[id].setable !== false,
      /** The lights from `/state`: notes their brightness. */
      took(devices) { for (const d of devices) if (d.caps && d.caps.dim) noteDim(d.id, d.caps.dim.value); },
      /** A realtime change into `devices` (the light itself, or one in a group device; both when it's picked too); false when none shows it. */
      apply(devices, { deviceId, capabilityId, value }) {
        let hit = false;
        for (const d of devices) {
          for (const x of 'missing' in d ? [] : withGroup(d)) {
            if (x.id !== deviceId || !x.caps || !x.caps[capabilityId]) continue;
            x.caps[capabilityId].value = value;
            hit = true;
          }
        }
        if (!hit) return false;
        if (capabilityId === 'dim') noteDim(deviceId, value);
        values.confirm(deviceId, capabilityId, value);
        return true;
      },
      /** Shows `change` while the device confirms it; a group device's lights take it on too. */
      hope: (d, change) => values.hope(withGroup(d), change),
      /** A failed send: the light's own values again. */
      forget: d => values.drop(d.id, LIGHT_CAPS),
      /** A tap: hopes every light of `item` on or off (a light without `onoff` back to its last brightness, or 0). */
      hopeOnOff(item, on) {
        for (const d of item.members) {
          if (d.caps.onoff) this.hope(d, { onoff: on });
          else this.hope(d, { dim: on ? (shown(d, 'dim') || lastDim.get(d.id) || 1) : 0 });
        }
      },
      /** The bar let go: hopes every light of `item` at `value` (0 is off). */
      hopeLevel(item, value) {
        for (const d of item.members) {
          if (value === 0) this.hope(d, d.caps.onoff ? { onoff: false } : { dim: 0 });
          else this.hope(d, { dim: value, onoff: true });
        }
      },
      /** On while any of its lights is. */
      itemOn: item => item.members.some(isOn),
      /**
       * Its light's brightness, or a room's: the average (the highest with `roomLevel: max`) of its lit lights that
       * dim. A light that only switches counts only where none of them dims (the bar is hidden then).
       */
      itemBrightness(item) {
        const lit = item.members.filter(isOn);
        const levels = (item.members.some(d => d.caps.dim) ? lit.filter(d => d.caps.dim) : lit).map(brightness);
        if (!levels.length) return 0;
        return roomLevel === 'max' ? Math.max(...levels) : levels.reduce((sum, x) => sum + x, 0) / levels.length;
      },
      /**
       * The colours the lit lights shine in, without repeats (at most MAX_LIGHT_COLORS): a Homey group device counts
       * its lit lights (its own colour is only the last one set on the group; a Mood may have given them several),
       * any other light itself while it's on. Empty while nothing is on.
       */
      colorsOf(members) {
        const out = [];
        for (const d of members) {
          const group = Array.isArray(d.groupLights) ? d.groupLights.filter(isOn) : [];
          for (const x of group.length ? group : isOn(d) ? [d] : []) {
            const c = colorOf(x);
            if (!out.includes(c)) out.push(c);
          }
        }
        return out.slice(0, MAX_LIGHT_COLORS);
      },
      /** Whether a swatch is light `d`'s current colour or white. */
      isCurrent(d, swatch) {
        const v = id => shown(d, id);
        const colourMode = v('light_mode') === 'color' || (!d.caps.light_mode && !d.caps.light_temperature);
        if (swatch.k != null) {
          const k = v('light_temperature');
          return !colourMode && typeof k === 'number' && Math.abs(k - swatch.k) < 0.05;
        }
        const hue = v('light_hue');
        if (!colourMode || typeof hue !== 'number') return false;
        const sat = typeof v('light_saturation') === 'number' ? v('light_saturation') : 1;
        if (Math.abs(sat - swatch.sat) >= 0.03) return false;
        if (swatch.sat === 0) return true;
        const dh = Math.abs(hue - swatch.hue / 360);
        return Math.min(dh, 1 - dh) < 0.03;
      },
    };
  }

  const LIGHTS = { get glyphs() { return LIGHT_GLYPHS(); }, PALETTES, temperatureColor, hueColor, lightColor, moodDot, swatchList, setBlend, model: lightModel, panel: lightPanel };

  /** The colour settings' names (Device Values', Flow Buttons' and Notes' Flow colours, `TILE_COLORS` in lib/tileColors.ts), in kit.css's palette. */
  const COLORS = ['blue', 'red', 'orange', 'yellow', 'green', 'purple', 'teal', 'cyan', 'indigo', 'pink', 'brown', 'grey'];

  /**
   * The `colorStyle` setting ("Colour style"): 'deep' ("Vivid": Homey's darker shades as solid fills, white text) or
   * 'soft' ("Muted", the default). Device Values' old 'bright' reads as 'deep'; a missing or unknown value is the default.
   */
  function colorStyle(value) {
    return value === 'deep' || value === 'bright' ? 'deep' : 'soft';
  }

  /**
   * Puts a widget root on kit.css's palette: `wk`, `wk-deep` for the Vivid colours, and `data-wk-color` (a colour
   * setting, else `fallback`; null leaves it out) for `--wk-c`/`--wk-on`. Returns the scheme ('soft' or 'deep').
   * @param {HTMLElement} root
   * @param {{ style?: unknown, color?: unknown, fallback?: string | null }} [opts]
   */
  function applyColors(root, { style, color, fallback = null } = {}) {
    const scheme = colorStyle(style);
    root.classList.add('wk');
    root.classList.toggle('wk-deep', scheme === 'deep');
    const name = typeof color === 'string' && COLORS.includes(color) ? color : fallback;
    if (name) root.dataset.wkColor = name;
    else delete root.dataset.wkColor;
    return scheme;
  }

  /**
   * Short sounds drawn with Web Audio, so no sound files ship: Timers' `beep` and the popups' (the Flow cards' `sound`,
   * `POPUP_SOUNDS` in lib/PopupService.ts). Each note is [frequency (Hz), start (s), length (s), wave, loudness].
   */
  const SOUNDS = {
    beep: [[880, 0, 0.15, 'sine', 0.3], [880, 0.22, 0.15, 'sine', 0.3], [880, 0.44, 0.15, 'sine', 0.3]],
    chime: [[880, 0, 0.7, 'sine', 0.3], [1318.5, 0.16, 1.1, 'sine', 0.3]],
    doorbell: [[659.25, 0, 0.9, 'triangle', 0.4], [523.25, 0.5, 1.4, 'triangle', 0.4]],
    alert: [[988, 0, 0.14, 'square', 0.12], [988, 0.22, 0.14, 'square', 0.12], [988, 0.44, 0.14, 'square', 0.12], [1319, 0.66, 0.3, 'square', 0.12]],
  };
  /** A sound the browser lets the page start this much later is still played; one that waited for a tap isn't. */
  const LATE_MS = 300;
  let audio = null;

  /** The page's one AudioContext (every widget of a Smart Stack shares it); null where there's no Web Audio. */
  function audioContext() {
    if (audio) return audio;
    try {
      const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      if (Ctx) audio = new Ctx();
    } catch (err) { audio = null; }
    return audio;
  }

  function playNotes(ctx, notes) {
    try {
      const t0 = ctx.currentTime + 0.01;
      for (const [freq, at, length, wave, loud] of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + at);
        gain.gain.exponentialRampToValueAtTime(loud, t0 + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + length);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + length + 0.01);
      }
    } catch (err) { /* no sound */ }
  }

  const sound = {
    names: Object.keys(SOUNDS),
    /**
     * Wakes the audio from inside a tap or key press: a page (a WebView, Safari) only makes sound after it's been
     * used, so a later sound can play.
     */
    unlock() {
      const ctx = audioContext();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => { /* not a gesture the browser counts */ });
    },
    /**
     * Plays a sound by name: at once, or as soon as the browser lets the audio start (within `LATE_MS`; a sound
     * refused until the next tap is left out). False when it isn't a sound, or there's no Web Audio.
     */
    play(name) {
      const notes = Object.prototype.hasOwnProperty.call(SOUNDS, name) ? SOUNDS[name] : null;
      const ctx = notes && audioContext();
      if (!ctx) return false;
      if (ctx.state === 'running') {
        playNotes(ctx, notes);
      } else {
        const asked = Date.now();
        ctx.resume().then(() => { if (Date.now() - asked <= LATE_MS) playNotes(ctx, notes); }, () => { /* wants a tap first */ });
      }
      return true;
    },
  };

  const ICE_WAIT_MS = 2000; // Homey's answer has every candidate, so the offer is sent once gathering is done
  const STREAM_KEEPALIVE_MS = 10e3;
  const STREAM_NEXT_MS = 10e3; // to the first frame of a stream with another one left to try
  const STREAM_LAST_MS = 15e3; // to the first frame of the last stream, and between frames after that
  const STREAM_CHECK_MS = 5000; // how often a playing stream's decoded frames are counted

  function waitForIce(pc) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { pc.removeEventListener('icegatheringstatechange', check); resolve(undefined); };
      const check = () => { if (pc.iceGatheringState === 'complete') done(); };
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(done, ICE_WAIT_MS);
    });
  }

  /**
   * Homey's WebRTC offer for one camera stream: sends it through `post('/video/offer', body)` (the Cameras routes) and
   * sets the answer. `{answer, streamId}`, or null when `current()` says the stream was dropped meanwhile.
   */
  async function openVideoStream(pc, videoId, post, current) {
    pc.addTransceiver('video', { direction: 'recvonly' });
    await pc.setLocalDescription(await pc.createOffer());
    await waitForIce(pc);
    if (!current()) return null;
    const res = await post('/video/offer', { videoId, offer: pc.localDescription.sdp });
    if (!current()) return null;
    await pc.setRemoteDescription({ type: 'answer', sdp: res.answer });
    return res;
  }

  /** The video frames decoded so far, from the connection's stats; null when the browser can't tell. */
  async function framesDecoded(pc) {
    if (typeof pc.getStats !== 'function') return null;
    const stats = await pc.getStats();
    let n = null;
    stats.forEach((s) => {
      if (s.type === 'inbound-rtp' && (s.kind || s.mediaType) === 'video' && typeof s.framesDecoded === 'number') {
        n = (n || 0) + s.framesDecoded;
      }
    });
    return n;
  }

  /**
   * Plays a camera into `video` (Cameras' live view, a popup on a web dashboard): `videoIds` in turn until one gives a
   * frame in STREAM_NEXT_MS (STREAM_LAST_MS for the last) and doesn't refuse or fail, then kept alive. Once one plays,
   * losing it ends it, as does STREAM_LAST_MS without a new frame (a camera that drops off leaves the connection up and
   * the video frozen). `onPlaying(videoId)` at the first frame; `onStreamFailed(videoId, why, index)` as a stream makes way
   * for the next; `onKeepAliveFailed(err)` once per stream (Homey then ends it, which the frame check notices);
   * `onEnded(played, why, {away})` once, when none played or a playing one was lost, the last frame still in `video`.
   * `away`: Homey answered an offer but no connection ever came up, so its video server (go2rtc, port 8555, which Homey's
   * cloud doesn't relay) can't be reached: away from home without a VPN. `stop()` calls none of them.
   */
  function playCameraStream(video, videoIds, post, { onPlaying, onEnded, onStreamFailed, onKeepAliveFailed }) {
    let pc = null;
    let stopped = false;
    let released = false;
    let playing = false;
    let timeout = null;
    let keepAlive = null;
    let frameCheck = null;
    let attempt = -1;
    let answered = false; // this stream's offer
    let connected = false; // this stream's connection
    let unreached = 0;
    let reached = false;
    const clear = () => {
      clearTimeout(timeout);
      clearInterval(keepAlive);
      clearInterval(frameCheck);
      if (pc) { try { pc.close(); } catch (err) { /* already closed */ } }
      pc = null;
    };
    const release = () => {
      if (released) return;
      released = true;
      video.removeEventListener('playing', started);
      video.pause();
      video.srcObject = null;
    };
    const stop = () => {
      if (!stopped) { stopped = true; clear(); }
      release();
    };
    const end = (why) => {
      if (stopped) return;
      stopped = true;
      clear();
      onEnded(playing, why, { away: unreached > 0 && !reached });
      release();
    };
    const failed = (why) => { if (playing) end(why); else next(why); };
    function started() {
      if (stopped || playing || !pc) return;
      playing = true;
      clearTimeout(timeout);
      onPlaying(videoIds[attempt]);
      const conn = pc;
      let frames = 0;
      let frameAt = Date.now();
      frameCheck = setInterval(async () => {
        let n = null;
        try { n = await framesDecoded(conn); } catch (err) { /* closed meanwhile */ }
        if (stopped || conn !== pc || n == null) return;
        if (n > frames) { frames = n; frameAt = Date.now(); }
        else if (Date.now() - frameAt >= STREAM_LAST_MS) end(`no new frame for ${STREAM_LAST_MS / 1000} s`);
      }, STREAM_CHECK_MS);
    }
    function next(why) {
      if (stopped) return;
      if (attempt >= 0) {
        if (answered && !connected) unreached += 1;
        if (onStreamFailed) onStreamFailed(videoIds[attempt], why, attempt);
      }
      clear();
      attempt += 1;
      if (attempt >= videoIds.length) { end(why || 'no streams'); return; }
      video.srcObject = null;
      answered = false;
      connected = false;
      const videoId = videoIds[attempt];
      const conn = new RTCPeerConnection();
      pc = conn;
      const current = () => !stopped && pc === conn;
      const wait = attempt === videoIds.length - 1 ? STREAM_LAST_MS : STREAM_NEXT_MS;
      timeout = setTimeout(() => { if (current()) failed(`no video after ${wait / 1000} s`); }, wait);
      conn.ontrack = (e) => {
        if (!current()) return;
        video.srcObject = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
        const p = video.play();
        if (p && p.catch) p.catch(() => { /* muted, so only a page being closed refuses */ });
      };
      conn.onconnectionstatechange = () => {
        if (!current()) return;
        if (conn.connectionState === 'connected') { connected = true; reached = true; }
        if (conn.connectionState === 'failed') failed('connection failed');
      };
      openVideoStream(conn, videoId, post, current).then((res) => {
        if (!res || !current()) return;
        answered = true;
        if (!res.streamId) return;
        let refused = false;
        keepAlive = setInterval(() => {
          post('/video/keepalive', { videoId, streamId: res.streamId }).catch((err) => {
            if (refused) return;
            refused = true;
            if (onKeepAliveFailed) onKeepAliveFailed(err);
          });
        }, STREAM_KEEPALIVE_MS);
      }).catch((err) => { if (current()) failed(err && err.message ? err.message : String(err)); });
    }
    video.addEventListener('playing', started);
    next(null);
    return { stop };
  }

  /**
   * A web dashboard's Widget background (`settings/dashboard-frames.js` puts it on this widget's iframe): its colour as
   * Homey's background token, which the frame and every light tile take, and `--wk-surface`, which dark tiles' fixed
   * fills take. On Homey's own dashboards there's no such iframe, so this does nothing. Run at load, before the first
   * paint, and by the page when the slider moves.
   */
  function applySurface() {
    let data = null;
    try { data = window.frameElement && /** @type {HTMLElement} */ (window.frameElement).dataset; } catch (e) { /* another origin's frame */ }
    if (!data) return;
    const html = document.documentElement;
    const set = (name, value) => { if (value) html.style.setProperty(name, value); else html.style.removeProperty(name); };
    const surface = data.wkSurface || '';
    set('--homey-background-color', surface);
    set('--wk-surface', surface);
    set('--wk-surface-line', data.wkSurfaceLine || '');
    html.toggleAttribute('data-wk-surface', !!surface);
  }
  if (typeof document !== 'undefined') applySurface(); // the service tests load the kit without a page

  window.WidgetkeeperKit = {
    applySurface,
    openVideoStream, playCameraStream, STREAM_NEXT_MS, STREAM_LAST_MS,
    icons: ICONS, lights: LIGHTS, TIGHT_UNITS, KEY_PROBLEMS, COLORS, scaled, formatNumber, formatValue, valueGlyph, undoTextZoom, el, setMask, tileNames, timeFormatter,
    getTimeFormat, setTimeFormat, wireTimeFormat, uses12Hours, clockTime, hourLabel, smoothValues,
    formatSince, baseTitle, lowestSlot, parseSpan, timeSpan, isTimeSpan, sixHourLog, spanSetting, slotId, wireFrame, wireRefresh, wireHaptic, pressGuard, markOffline, getDeviceIds, wireTileNames, touchGuard, onTap, messageLine, wireDeviceState,
    onDeviceNames, colorStyle, applyColors, sound, optimistic, shake, translator, heightReporter, svgIcon, wireBar, roomTiles, knownValue, okRange, okLevel,
  };
})();
