/*
 * The web dashboards page — what a screen does by itself: Dim at set times or from a Flow (the choices are in
 * dashboard.js, `dimWanted()`), and Rotate dashboards. A part of the page (settings/dashboard.js): mountWebDashboards()
 * runs it once with `wd`, the page's shared state and functions. The core's functions and constants are taken from `wd`
 * at the top; the state that changes, and the other parts' functions, are read as `wd.<name>`. Plain browser JS (served
 * as-is).
 */
(function () {
  'use strict';

  /** Rotate dashboards, this browser's choice in Settings: `{ids: [dashboard ids], seconds}`; absent is off. */
  const ROTATE_STORAGE = 'widgetkeeper.web.rotate';
  /** Not shorter: every frame of a dashboard loads again when it shows, ~1.5 s through Homey. */
  const ROTATE_MIN_SECONDS = 10;
  const ROTATE_MAX_SECONDS = 3600;
  const ROTATE_DEFAULT_SECONDS = 30;
  /** After a touch, a key or a scroll: long enough to use a widget without it being taken away. */
  const TOUCH_PAUSE_MS = 60e3;

  /** A stored choice as `{ids, seconds}`, the seconds within limits; null when off or unreadable. */
  function rotateConfigOf(raw) {
    let value = raw;
    try { if (typeof raw === 'string') value = JSON.parse(raw); } catch (e) { return null; }
    if (!value || typeof value !== 'object' || !Array.isArray(value.ids)) return null;
    const seconds = Math.round(Number(value.seconds));
    return {
      ids: value.ids.filter(id => typeof id === 'string'),
      seconds: Number.isFinite(seconds) ? Math.min(ROTATE_MAX_SECONDS, Math.max(ROTATE_MIN_SECONDS, seconds)) : ROTATE_DEFAULT_SECONDS,
    };
  }

  /** The ticked dashboards that still exist, in the front page's order: nothing to rotate through below two. */
  function rotationList(config, dashboards) {
    if (!config) return [];
    const ids = dashboards.map(d => d.id).filter(id => config.ids.includes(id));
    return ids.length >= 2 ? ids : [];
  }

  /** The dashboard after the one in `hash`; the first from the front page or one not in the list. */
  function nextInRotation(list, hash) {
    const m = /^#\/d\/([A-Za-z0-9_-]+)/.exec(hash || '');
    return list[(list.indexOf(m ? m[1] : '') + 1) % list.length];
  }

  /** When the page moves on: `seconds` after this view came up, and not within the pause after a touch. */
  function rotationDue(shownAt, touchedAt, seconds) {
    return Math.max(shownAt + seconds * 1000, touchedAt + Math.max(TOUCH_PAUSE_MS, seconds * 1000));
  }

  window.WidgetkeeperWeb.part('screen', (wd) => {
    const { APP_ID, applyDim, dimChoices, dimFlowHolds, dimWanted, listeners, request, storageGet, storageSet } = wd;

    // ---- Dim: at set times, or from a Flow ------------------------------------------------------------------

    let dimFlows = {}; // target (`all`, `name:<key>`) → {level, at}, `at` on Homey's clock
    let dimSkew = 0; // Homey's clock minus this browser's

    /** The newest level a Flow set for what's showing: every screen's, and this dashboard's Popups widgets' names. */
    function flowHere() {
      const m = /^#\/d\/([A-Za-z0-9_-]+)/.exec(location.hash);
      const names = m && wd.dashboards ? wd.screenNamesOf(m[1]) : new Set();
      let newest = null;
      for (const [target, entry] of Object.entries(dimFlows)) {
        if ((target === 'all' || names.has(target)) && (!newest || entry.at > newest.at)) newest = entry;
      }
      return newest && { level: newest.level, at: newest.at - dimSkew };
    }

    function dimNow() {
      return dimWanted({ ...dimChoices(), flow: flowHere(), now: new Date() });
    }

    function syncDim() {
      applyDim(dimNow());
    }

    /** The level a Flow holds this screen at right now, for Settings to say so; null when the browser's own choice holds. */
    function dimFlowLevel() {
      const flow = flowHere();
      return dimFlowHolds({ ...dimChoices(), flow, now: new Date() }) ? flow.level : null;
    }

    /** Takes `{flows, now}` from `/web/setup` or `/web/dim`. */
    function setDimFlows(state) {
      dimFlows = state && state.flows && typeof state.flows === 'object' ? state.flows : {};
      dimSkew = state && typeof state.now === 'number' ? state.now - Date.now() : 0;
      syncDim();
    }

    /** The levels again, after a reconnect: a screen that was offline missed their events. */
    function refreshDim() {
      request('GET', '/web/dim').then(setDimFlows, () => { /* the next reconnect tries again */ });
    }

    {
      const key = wd.listenerKey(`homey:app:${APP_ID}`, 'webdim:state');
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add((data) => {
        if (!data || typeof data.target !== 'string' || typeof data.level !== 'number') return;
        dimFlows = { ...dimFlows, [data.target]: { level: data.level, at: data.at } };
        if (typeof data.now === 'number') dimSkew = data.now - Date.now();
        syncDim();
      });
    }

    // The set times start and end by themselves; a sleeping tablet's timers may have stopped meanwhile.
    setInterval(syncDim, 30e3);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncDim(); });

    // ---- Rotate dashboards ----------------------------------------------------------------------------------

    let shownHash = location.hash;
    let shownAt = Date.now();
    let touchedAt = 0;

    function touched() {
      touchedAt = Date.now();
    }

    /** A touch, a key or a scroll in `win`: the page, or a widget's frame (same origin), where most of them land. */
    function watchTouches(win) {
      for (const type of ['pointerdown', 'touchstart', 'keydown', 'wheel']) win.addEventListener(type, touched, { capture: true, passive: true });
    }
    watchTouches(window);

    /** Someone is at work, a question is on the screen, or the page has nothing to show yet: no moving on. */
    function holdRotation() {
      return document.hidden || !wd.key || !wd.setup || wd.setup.disabled || wd.setup.passwordRequired
        || /\/edit$/.test(location.hash) || !!(wd.current && wd.current.editing) || !!wd.drag
        || !!document.querySelector('dialog[open]') || !!(wd.nav && wd.nav.customizing);
    }

    function rotateTick() {
      const now = Date.now();
      if (location.hash !== shownHash || holdRotation()) { // a view just came up, or the wait starts when it's let go
        shownHash = location.hash;
        shownAt = now;
        return;
      }
      const config = rotateConfigOf(storageGet(ROTATE_STORAGE));
      const list = rotationList(config, (wd.navInOrder ? wd.navInOrder() : wd.dashboards) || []);
      if (!list.length || now < rotationDue(shownAt, touchedAt, config.seconds)) return;
      shownAt = now;
      location.hash = `#/d/${nextInRotation(list, location.hash)}`;
    }
    setInterval(rotateTick, 1000);

    function rotateConfig() {
      return rotateConfigOf(storageGet(ROTATE_STORAGE));
    }

    function saveRotate(config) {
      storageSet(ROTATE_STORAGE, config ? JSON.stringify(config) : null);
    }

    Object.assign(wd, { dimFlowLevel, refreshDim, ROTATE_DEFAULT_SECONDS, ROTATE_MAX_SECONDS, ROTATE_MIN_SECONDS, rotateConfig, saveRotate, setDimFlows, syncDim, watchTouches });
  });
})();
