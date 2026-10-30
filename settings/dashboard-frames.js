/*
 * The web dashboards page — the widget frames: Homey's crossframe protocol, parent side (each widget's iframe asks
 * this page as it would Homey's dashboard), the frames' heights, themes and backdrops. A part of the page
 * (settings/dashboard.js): mountWebDashboards() runs it once with `wd`, the page's shared state and functions. The
 * core's functions and constants are taken from `wd` at the top; the state that changes, and the other parts'
 * functions, are read as `wd.<name>`. Plain browser JS (served as-is).
 */
(function () {
  'use strict';

  window.WidgetkeeperWeb.part('frames', (wd) => {
    const { APP_ID, BACKGROUNDS, clone, darkQuery, failed, frames, HOMEY_WIDTH, homeyRequest, keepAwake, listeners,
      request, storageGet, stringsOf, THEME_STORAGE, typeOf } = wd;

    const PREFIX = 'CF2_MESSAGE';

    // Every frame's `getInitialData` carries the app's strings (~25 KB, ~100 KB encoded): a table, not toString(16) per
    // character.
    const HEX = Array.from({ length: 256 }, (_, i) => (i < 16 ? '0' : '') + i.toString(16));

    function hexEncode(input) {
      const out = new Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const c = input.charCodeAt(i);
        out[i] = HEX[c >> 8] + HEX[c & 255];
      }
      return out.join('');
    }

    function hexDecode(input) {
      let out = '';
      for (const hex of input.match(/.{1,4}/g) || []) out += String.fromCharCode(parseInt(hex, 16));
      return out;
    }

    // ---- The widget frames: Homey's crossframe protocol, parent side ----------------------------------------

    function post(frame, message) {
      const win = frame.iframe.contentWindow;
      // A sandboxed frame (another app's widget) has an opaque origin, which no target origin but `*` matches.
      if (win) win.postMessage(PREFIX + hexEncode(JSON.stringify(message)), frame.sandboxed ? '*' : location.origin);
    }

    function reply(frame, callbackId, err, result) {
      if (callbackId == null) return;
      const error = err ? { type: 'Error', data: String(err && err.message ? err.message : err) } : null;
      post(frame, { type: 'cb', args: [error, result === undefined ? null : result], callbackId });
    }

    /** This browser's own mode (`dark` or `light`, from Settings' This browser), or null. */
    function ownTheme() {
      const v = storageGet(THEME_STORAGE);
      return v === 'dark' || v === 'light' ? v : null;
    }

    /** Whether a dashboard theme (`auto`, `dark`, `light`) shows dark, without this browser's own choice. */
    function themeIsDark(theme) {
      return theme === 'dark' || (theme !== 'light' && !!(darkQuery && darkQuery.matches));
    }

    /** Whether a dashboard of that theme shows dark in this browser (its own choice first). */
    function showsDark(theme) {
      const own = ownTheme();
      return own ? own === 'dark' : themeIsDark(theme);
    }

    function isDark() {
      return showsDark(wd.current ? wd.current.dashboard.theme : 'auto');
    }

    /** A backdrop's colour in the page's mode, or in `dark`'s. */
    function backdrop(background, dark = isDark()) {
      const pair = BACKGROUNDS[background] || BACKGROUNDS.default;
      return pair[dark ? 1 : 0];
    }

    /**
     * A widget's height (`ready`/`setHeight`, where Homey's docs allow a number, a string or null): pixels, or a share of
     * the width (`'50%'`, as a manifest's `height`). Anything else leaves it: `Number(null)` used to make it 0 px.
     */
    function setFrameHeight(frame, height) {
      const style = frame.iframe.style;
      const text = typeof height === 'string' ? height.trim() : '';
      if (/^\d+(\.\d+)?%$/.test(text) && parseFloat(text) > 0) {
        style.height = '';
        style.aspectRatio = `100 / ${parseFloat(text)}`;
      } else if ((typeof height === 'number' && Number.isFinite(height) && height >= 0) || /^\d+(\.\d+)?(px)?$/.test(text)) {
        style.height = `${Math.ceil(parseFloat(String(height)))}px`;
      } else {
        return;
      }
      if (frame.scaled) fitFrame(frame);
    }

    /**
     * Another app's widget sized as on Homey (`scaled`): laid out at a phone's widget width and scaled to fill its column,
     * so it wraps, and measures its own height, as on Homey's dashboard (wk-089: an image as wide as the widget made it
     * taller in a wider column). A wide widget takes its column's scale; a column narrower than a phone's isn't scaled.
     */
    function fitFrame(frame) {
      const wrap = frame.iframe.parentElement;
      const col = wrap && wrap.closest('.wd-col');
      const width = wrap ? wrap.clientWidth : 0;
      if (!col || !width) return;
      const pad = getComputedStyle(col);
      const column = col.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
      const scale = Math.max(1, Math.min(width, column) / HOMEY_WIDTH);
      frame.iframe.style.width = `${width / scale}px`;
      frame.iframe.style.transform = scale > 1 ? `scale(${scale})` : '';
      wrap.style.height = `${frame.iframe.offsetHeight * scale}px`;
    }

    /** Refits a scaled frame when its room changes width: the window, the columns, a wide widget's span. */
    const scaler = new ResizeObserver((entries) => {
      for (const entry of entries) {
        for (const frame of frames) {
          if (!frame.scaled || frame.iframe.parentElement !== entry.target || frame.fitted === entry.contentRect.width) continue;
          frame.fitted = entry.contentRect.width; // its own height changes come here too
          fitFrame(frame);
        }
      }
    });

    /**
     * Another app's widget's own request (`Homey.api(method, path, body)`), straight to that widget's API on the
     * Homey (`/api/app/<appId>/widget/<widgetId>/api<path>`, as Homey's dashboard calls it) with this page's key.
     * Only below that: a path that leaves it (`..`) is refused, or a sandboxed widget could use the key for anything.
     */
    function appApi(app, method, path, qs, body) {
      const base = `/app/${encodeURIComponent(app.appId)}/widget/${encodeURIComponent(app.widgetId)}/api`;
      const rel = `${base}${String(path).startsWith('/') ? '' : '/'}${path}`;
      const url = new URL(`/api${rel}`, location.origin);
      if (url.pathname !== `/api${rel}` || !url.pathname.startsWith(`/api${base}/`)) return Promise.reject(new Error(`Not a widget route: ${path}`));
      const withBody = method !== 'GET' && method !== 'DELETE';
      return homeyRequest(method, `${rel}${qs ? `?${qs}` : ''}`, withBody ? (body == null ? {} : body) : undefined);
    }

    /**
     * The dashboard id a widget's `popup(url)` links to (`#/d/<id>`, Dashboard Shortcuts), or null. The SDK may hand the
     * URL on as given or resolved against the frame, so a link to this page or to the frame's own document counts.
     */
    function dashboardLink(url, frame) {
      let u;
      try { u = new URL(url, location.href); } catch (e) { return null; }
      const m = u.hash.match(/^#\/d\/([A-Za-z0-9_-]+)$/);
      if (!m || u.origin !== location.origin) return null;
      const own = [location.pathname, new URL(frame.iframe.src, location.href).pathname];
      return own.includes(u.pathname) ? m[1] : null;
    }

    function handle(frame, msg) {
      const id = msg.callbackId;
      const w = frame.widget;
      const def = typeOf(w.type);
      switch (msg.event) {
        case 'getInitialData': {
          // A new document in the frame (it reloads when it's moved): the old one's listeners and pending answers go.
          dropListeners(frame);
          const gen = ++frame.gen;
          const strings = frame.app ? stringsOf(frame.app.appId) : Promise.resolve((wd.setup && wd.setup.strings) || {});
          strings.then((locales) => {
            if (frame.gen !== gen) return;
            reply(frame, id, null, {
              settings: clone(w.settings || {}),
              deviceIds: (w.deviceIds || []).slice(),
              transparent: !!(def && def.transparent),
              locales,
              language: (wd.setup && wd.setup.language) || 'en',
              devmode: false,
              fontScale: 1,
              isDarkMode: isDark(),
            });
          });
          break;
        }
        case 'ready':
          if (msg.data && msg.data.height != null) setFrameHeight(frame, msg.data.height);
          reply(frame, id, null, null);
          break;
        case 'setHeight':
          setFrameHeight(frame, msg.data && msg.data.height);
          reply(frame, id, null, null);
          break;
        case 'api': {
          const data = msg.data || {};
          const [path, qs] = String(data.path || '').split('?');
          const query = {};
          new URLSearchParams(qs || '').forEach((v, k) => { query[k] = v; });
          // The page's key goes along: a route that acts with the app's stored key checks that this key may too.
          const gen = frame.gen;
          const method = String(data.method || 'GET').toUpperCase();
          (frame.app ? appApi(frame.app, method, path, qs, data.body) : request('POST', '/web/call', { type: w.type, method, path, query, body: data.body == null ? {} : data.body, key: wd.key }))
            .then(result => { if (frame.gen === gen) reply(frame, id, null, result); }, (err) => {
              if (frame.gen === gen) reply(frame, id, err);
              // A rejected key, or the dashboards turned off, is the page's to handle, as for its own requests.
              if (err && (err.unauthorized || /turned off/.test(String(err.message)))) failed(err);
            });
          break;
        }
        case 'registerRealtimeListener': {
          const event = wd.listenerKey(`homey:app:${frame.app ? frame.app.appId : APP_ID}`, String(msg.data || ''));
          if (frame.app) wd.listenToApp(frame.app.appId);
          const fn = (data) => post(frame, { type: 'cb', args: [data], callbackId: id });
          frame.subs.set(id, { event, fn });
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event).add(fn);
          break;
        }
        case 'popup': {
          const url = msg.data && typeof msg.data.url === 'string' ? msg.data.url : null;
          const dashboard = url && !frame.app ? dashboardLink(url, frame) : null;
          // Dashboard Shortcuts: another dashboard opens here (not from the editor, where a tap shouldn't leave it).
          if (dashboard) {
            if (!/\/edit$/.test(location.hash)) location.hash = `#/d/${dashboard}`;
          } else if (url) {
            window.open(url, '_blank', 'noopener');
          }
          reply(frame, id, null, null);
          break;
        }
        case 'shortPressHapticFeedback':
          try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) { /* not on every browser */ }
          reply(frame, id, null, null);
          break;
        case 'emit':
          reply(frame, id, null, null);
          break;
        default:
          reply(frame, id, new Error(`Not supported here: ${msg.event}`));
      }
    }

    window.addEventListener('message', (e) => {
      if (typeof e.data !== 'string' || e.data.indexOf(PREFIX) !== 0) return;
      let frame = null;
      for (const f of frames) if (f.iframe.contentWindow === e.source) { frame = f; break; }
      if (!frame) return;
      let msg;
      try { msg = JSON.parse(hexDecode(e.data.slice(PREFIX.length))); } catch (err) { return; }
      if (!msg || msg.type !== 'tx') return;
      // A sandboxed widget's tap only reaches the page as its message (an `api` call); the browser counts the tap
      // for the page too, so a refused Keep screen on video may start now.
      if (frame.sandboxed) keepAwake.retry();
      handle(frame, msg);
    });

    function dropListeners(frame) {
      for (const { event, fn } of frame.subs.values()) {
        const set = listeners.get(event);
        if (set) set.delete(fn);
      }
      frame.subs.clear();
    }

    /** Forgets the frames no longer on the page, with their realtime listeners. */
    function sweepFrames() {
      for (const frame of [...frames]) {
        if (frame.iframe.isConnected) continue;
        dropListeners(frame);
        if (frame.scaled) scaler.unobserve(frame.iframe.parentElement);
        frames.delete(frame);
      }
    }

    function reloadFrames() {
      if (!wd.current) return;
      wd.current.widgets.clear();
      wd.syncGrid();
    }

    Object.assign(wd, { backdrop, dropListeners, isDark, ownTheme, reloadFrames, scaler, showsDark, sweepFrames,
      themeIsDark });
  });
})();
