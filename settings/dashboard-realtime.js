/*
 * The web dashboards page — Homey's realtime socket (socket.io v2), as homey-api connects: our app's and other apps'
 * events for the widget frames. A part of the page (settings/dashboard.js): mountWebDashboards() runs it once with
 * `wd`, the page's shared state and functions. The core's functions and constants are taken from `wd` at the top;
 * the state that changes, and the other parts' functions, are read as `wd.<name>`. Plain browser JS (served as-is).
 */
(function () {
  'use strict';

  window.WidgetkeeperWeb.part('realtime', (wd) => {
    const { APP_ID, listeners, root } = wd;

    const ACK_TIMEOUT_MS = 10e3;

    /** After a realtime outage this long, the frames reload: they may have missed changes (they re-read every 5 min). */
    const STALE_AFTER_MS = 30e3;

    // ---- Realtime: Homey's socket (socket.io v2), as homey-api connects ------------------------------------

    let socketGen = 0;
    let retryMs = 2000;
    let lostAt = null;
    let activeSocket = null;
    let activeNs = null; // its `/api` namespace, once subscribed
    const otherApps = new Set(); // the other apps whose events their widgets' frames listen to
    let retryTimer = null;

    /** Closes a socket with its connection: closing the root socket alone left the `/api` namespace's open. */
    function closeSocket(socket) {
      try { socket.io.close(); } catch (e) { /* closed */ }
      try { socket.close(); } catch (e) { /* closed */ }
    }

    /** Closes the socket and stops its retries (a rejected key). */
    function stopSocket() {
      socketGen++;
      wd.socketStarted = false;
      retryMs = 2000;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      activeNs = null;
      if (activeSocket) closeSocket(activeSocket);
      activeSocket = null;
    }

    function ack(socket, event, data) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${event}: timeout`)), ACK_TIMEOUT_MS);
        socket.emit(event, data, (err, result) => {
          clearTimeout(timer);
          if (err != null) reject(err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err)));
          else resolve(result);
        });
      });
    }

    function waitFor(socket, event) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${event}: timeout`)), ACK_TIMEOUT_MS);
        socket.once(event, () => { clearTimeout(timer); resolve(undefined); });
      });
    }

    /**
     * Connects to the Homey's realtime socket with the key: `handshakeClient {token, homeyId}` names a namespace
     * (`/api`), where `subscribe` to `homey:app:<appId>` brings our app's `homey.api.realtime()` events. Any failure
     * or disconnect starts over after a growing pause.
     */
    async function connectSocket() {
      if (typeof window.io !== 'function' || !wd.setup) return;
      const gen = ++socketGen;
      const socket = window.io(location.origin, { transports: ['websocket'], autoConnect: false, reconnection: false, forceNew: true });
      activeSocket = socket;
      let failed = false;
      const fail = (why) => {
        if (failed || gen !== socketGen) return;
        failed = true;
        console.warn('Realtime:', why && why.message ? why.message : why);
        activeNs = null;
        closeSocket(socket);
        setLive(false);
        if (lostAt == null) lostAt = Date.now();
        retryTimer = setTimeout(() => { retryTimer = null; connectSocket(); }, retryMs);
        retryMs = Math.min(retryMs * 2, 60e3);
      };
      try {
        const connected = waitFor(socket, 'connect');
        socket.open();
        await connected;
        const res = await ack(socket, 'handshakeClient', { token: wd.key, homeyId: wd.setup.homeyId });
        const ns = socket.io.socket(res && res.namespace ? res.namespace : '/api');
        const uri = `homey:app:${APP_ID}`;
        ns.on(uri, (event, data) => dispatch(uri, event, data));
        if (!ns.connected) {
          const nsConnected = waitFor(ns, 'connect');
          ns.open();
          await nsConnected;
        }
        await ack(ns, 'subscribe', uri);
        socket.on('disconnect', () => fail('disconnected'));
        ns.on('disconnect', () => fail('namespace disconnected'));
        if (failed) return;
        if (gen !== socketGen) { closeSocket(socket); return; } // stopped meanwhile
        activeNs = ns;
        for (const appId of otherApps) subscribeApp(ns, appId);
        retryMs = 2000;
        setLive(true);
        if (lostAt != null && Date.now() - lostAt > STALE_AFTER_MS) wd.reloadFrames();
        if (lostAt != null) wd.refreshPopups();
        lostAt = null;
      } catch (err) {
        fail(err);
      }
    }

    function setLive(on) {
      wd.live = on;
      for (const node of root.querySelectorAll('.wd-live')) /** @type {HTMLElement} */ (node).hidden = on;
    }

    /** Another app's realtime events (`homey:app:<appId>`), for its widgets' frames; one that fails just stays quiet. */
    function subscribeApp(ns, appId) {
      const uri = `homey:app:${appId}`;
      ns.on(uri, (event, data) => dispatch(uri, event, data));
      ack(ns, 'subscribe', uri).catch(err => console.warn(`Realtime ${uri}:`, err && err.message ? err.message : err));
    }

    /** Subscribes to an app's events once its first widget frame listens (and again on every new socket). */
    function listenToApp(appId) {
      if (otherApps.has(appId)) return;
      otherApps.add(appId);
      if (activeNs && activeNs.connected) subscribeApp(activeNs, appId);
    }

    /** Listeners are per app and event (`homey:app:<appId>\n<event>`): two apps may both send `state`. */
    const listenerKey = (uri, event) => `${uri}\n${event}`;

    function dispatch(uri, event, data) {
      for (const fn of listeners.get(listenerKey(uri, event)) || []) {
        try { fn(data); } catch (e) { console.error(e); }
      }
    }

    Object.assign(wd, { connectSocket, listenerKey, listenToApp, setLive, stopSocket });
  });
})();
