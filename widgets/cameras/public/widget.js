/*
 * Cameras: a grid of camera snapshots, 2 per row at 16:9, each refreshed every few seconds. With an odd
 * number the last tile spans the row (the `layout` setting: the first, or every tile, one per row).
 * Tapping a camera with video plays it live over the whole widget (WebRTC through Homey's own video
 * server), trying the camera's next stream when one won't play (an H.265 one); tapping again, or the
 * `liveFor` setting's 30 s to 5 minutes, ends it ("Until tapped": only a tap, and it comes back when the
 * page shows again). A camera with video but no snapshot (Aqara's) gets a frame grabbed from a
 * short-lived stream instead, at most once a minute. From a 5-minute refresh up (battery cameras) the app keeps
 * the last picture, so showing the page asks no camera until a picture is due.
 * Plain browser JS (served as-is).
 */
(function () {
  const { el, tileNames, timeFormatter, onTap, touchGuard, messageLine, openVideoStream, playCameraStream, STREAM_NEXT_MS, STREAM_LAST_MS } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const LIVE_MAX_MS = 5 * 60e3; // the default, and for a missing or unknown `liveFor`
  const LIVE_FOR = { 30: 30e3, 60: 60e3, 300: LIVE_MAX_MS, tap: null }; // `liveFor` → ms; null: until tapped
  const GRAB_MIN_MS = 60e3; // a video-only camera's frame grab: each one opens a stream through Homey
  const GRAB_RETRY_MS = 5 * 60e3; // after a failed grab
  const AUTO_LOST_MS = 5000; // Always live: a stream that played and was lost is tried again after this
  const AUTO_BACK_MS = 60e3; // and after a tap, or a read that didn't play, it comes back after this
  const SNAPSHOT_TIMEOUT_MS = 20e3; // a snapshot taking longer is skipped this round (they load one at a time)
  const KEPT_FROM_MS = 5 * 60e3; // a `refresh` from this up: the app keeps each picture, and a camera is only asked when one is due
  const KEPT_RETRY_MS = 5 * 60e3; // and a picture that didn't come isn't asked for again sooner
  const GRAB_WIDTH = 640; // px; a grabbed frame is scaled down to this

  const DEFAULT_STRINGS = {
    selectDevices: 'Select cameras in the widget settings.',
    error: 'Could not load the cameras.',
    noImage: 'No snapshot',
    unavailable: 'Unavailable',
    live: 'Live',
    liveFailed: 'Live view failed',
    liveH265: 'H.265 can\'t play live. Try H.264.',
    liveAway: 'Live view needs your home network or a VPN.',
    renameFailed: 'Could not save the name.',
  };

  /** Loads an image off-screen, so a tile only swaps once the new snapshot has decoded. */
  /** The video's current frame as a JPEG data URL, or null before it has a size. */
  function captureFrame(video) {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, GRAB_WIDTH / w);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  /** How long live view lasts for the `liveFor` setting, in ms; null until a tap ends it. */
  function liveLimit(value) {
    const key = String(value);
    return Object.prototype.hasOwnProperty.call(LIVE_FOR, key) ? LIVE_FOR[key] : LIVE_MAX_MS;
  }

  /**
   * Whether tile i of n spans the row, for the `layout` setting: every one (`single`), else with an odd number
   * the first (`top`) or the last (`bottom`, the default, and for a missing or unknown value).
   */
  function spansRow(i, n, layout) {
    if (layout === 'single') return true;
    if (n % 2 === 0) return false;
    return i === (layout === 'top' ? 0 : n - 1);
  }

  const timedOut = () => Object.assign(new Error('Snapshot timed out'), { timeout: true });

  /** Loads an image; gives up after SNAPSHOT_TIMEOUT_MS (`timeout`), so a camera that hangs doesn't hold up the others. */
  function preload(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => { img.src = ''; reject(timedOut()); }, SNAPSHOT_TIMEOUT_MS);
      img.onload = () => { clearTimeout(timer); resolve(src); };
      img.onerror = () => { clearTimeout(timer); reject(new Error('Image failed')); };
      img.src = src;
    });
  }

  /** `promise`, or a rejection with `timeout` after `ms`. */
  function withTimeout(promise, ms) {
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject(timedOut()), ms); });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
  }

  /**
   * @param {HTMLElement} root
   * @param {{ t?: (key: string, tokens?: object) => string, refreshMs?: number,
   *   api?: (method: string, path: string, body?: object) => Promise<any>,
   *   report?: (text: string, warn?: boolean) => void, onHeight?: (h: number) => void,
   *   now?: () => number, renameTiles?: boolean, onRename?: (key: string, name: string) => Promise<any>,
   *   liveView?: boolean, liveFor?: string, autoLive?: string, layout?: string, timeFormat?: string }} opts
   */
  function createCamerasWidget(root, opts = {}) {
    const t = (key, tokens) => {
      const s = opts.t ? opts.t(`cameras.${key}`, tokens) : null;
      if (s && s !== `cameras.${key}`) return s;
      return (DEFAULT_STRINGS[key] || key).replace(/__(\w+)__/g, (_, k) => (tokens && tokens[k] != null ? tokens[k] : ''));
    };
    const now = opts.now || (() => Date.now());
    const refreshMs = opts.refreshMs || 10e3;
    const grabMs = Math.max(GRAB_MIN_MS, refreshMs);
    const keptMs = refreshMs >= KEPT_FROM_MS ? refreshMs : 0;
    const liveMs = liveLimit(opts.liveFor);
    // `liveView` off: snapshots only, a tap does nothing (a video-only camera still gets its grabbed frames).
    const liveView = opts.liveView !== false;
    /** Always live: the camera that plays by itself, without the `liveFor` limit. */
    const autoId = liveView && typeof opts.autoLive === 'string' && opts.autoLive ? opts.autoLive : null;

    let devices = []; // [{ id, name, icon, image: { id, url, lastUpdated } | null, video, videos, h265 } | { id, missing }]
    // What failed: a lasting message replaces the content, a transient one goes by itself.
    const message = messageLine(() => render(), { clear: () => { devices = []; resumeId = null; stopLive(); } });
    const touches = touchGuard(); // the tiles' taps
    /**
     * How snapshots load, per camera: 'direct' (the image URL from the widget frame, as Homey's web server
     * serves it), or 'app' (base64 through the app's /snapshot, when the frame can't load that URL). Every
     * camera starts direct; one whose direct load fails moves to the app, the others stay direct.
     */
    const appRoute = new Set();
    let directReported = false;
    let refreshing = false;
    /** The tile playing live, with its connection. */
    let live = null;
    /** Until tapped: the camera that was live when the page was hidden, to go live again when it shows. */
    let resumeId = null;
    /** Always live: whether the page shows (resume() to pause()), what brings it back, and how soon after it ends. */
    let autoShown = false;
    let autoTimer = null;
    let autoGaveUp = false;
    let autoDelay = AUTO_BACK_MS;
    /** The frame grab under way (a video-only camera). */
    let grab = null;
    const grabReported = new Set();
    /** Per camera, this session: the stream that last played, and the streams that failed before a frame. */
    const workingVideo = new Map();
    const failedVideos = new Map();

    root.classList.add('cw');
    const names = tileNames(opts, () => render(), (key) => {
      const tile = tiles.get(key);
      if (tile) {
        tile.tile.classList.remove('shake');
        void tile.tile.offsetWidth; // restart the animation
        tile.tile.classList.add('shake');
      }
      setMessage(t('renameFailed'), true);
    });
    root.classList.toggle('renaming', names.renaming);
    const grid = el('div', { class: 'cw-grid' }, root);
    const messageEl = el('div', { class: 'cw-message', dir: 'auto' }, root);
    /**
     * @type {Map<string, {tile: HTMLElement, img: HTMLImageElement, video: HTMLVideoElement, icon: HTMLElement,
     *   name: HTMLElement, badge: HTMLElement, note: HTMLElement, loadedAt: number, noteTimer: any,
     *   grabAt: number | null, grabFailed: boolean, askedAt: number | null, frameRead: boolean}>}
     */
    const tiles = new Map();

    function setState(list) {
      devices = Array.isArray(list) ? list : [];
      message.reset();
      if (live && !devices.some(d => d.id === live.id && d.video)) stopLive();
      render();
      startAuto();
    }

    /** A message under the tiles. Persistent messages also clear the tiles. */
    function setMessage(text, transient) {
      message.set(text, transient);
    }

    // ---------------------------------------------------------------- snapshots

    function api(method, path, body) {
      if (!opts.api) return Promise.reject(new Error('No API'));
      return opts.api(method, path, body);
    }

    function directUrl(d) {
      const u = d.image.url;
      if (u.startsWith('data:')) return u; // the dev previews' mock scenes
      return `${u}${u.includes('?') ? '&' : '?'}t=${now()}`;
    }

    async function appUrl(d) {
      const s = await withTimeout(api('GET', `/snapshot?deviceId=${encodeURIComponent(d.id)}`), SNAPSHOT_TIMEOUT_MS);
      return `data:${s.type};base64,${s.data}`;
    }

    /** A new snapshot for one camera; its first direct failure moves that camera to the app route. */
    async function loadSnapshot(d) {
      if (!appRoute.has(d.id)) {
        try {
          const src = await preload(directUrl(d));
          if (!directReported && opts.report) opts.report(`snapshots load directly (frame ${location.origin})`);
          directReported = true;
          return src;
        } catch (err) {
          if (err && err.timeout) throw err; // slow, not unreachable: tried directly again next round
          appRoute.add(d.id);
          if (opts.report) opts.report(`direct snapshot URL failed for ${d.name} (frame ${location.origin}), using the app`);
        }
      }
      return preload(await appUrl(d));
    }

    /**
     * Refreshes every snapshot, one camera at a time, so a slow camera doesn't hold up the frame. Not while a
     * camera is live: it covers the other tiles, and stopLive() refreshes them when it ends.
     */
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        for (const d of devices.slice()) {
          if (live) break;
          if ('missing' in d) continue;
          const tile = tiles.get(d.id);
          if (!tile) continue;
          if (!d.image) {
            if (d.video) {
              if (keptMs) await showKeptFrame(d, tile);
              await grabInto(d, tile);
            }
            continue;
          }
          if (keptMs && !keptDue(tile)) continue;
          try {
            if (keptMs) await loadKept(d, tile);
            else {
              const src = await loadSnapshot(d);
              if (tiles.get(d.id) !== tile) continue;
              showImage(tile, src);
            }
          } catch (err) {
            console.error(err);
          }
          updateBadge(d.id);
        }
      } finally {
        refreshing = false;
      }
    }

    /** On a long refresh: whether to ask the app, as the picture shown is old enough and the last try isn't recent. */
    function keptDue(tile) {
      if (tile.loadedAt > 0 && now() - tile.loadedAt < keptMs) return false;
      return tile.askedAt == null || now() - tile.askedAt >= KEPT_RETRY_MS;
    }

    /** A long refresh's picture: the app's kept one while it's young enough, else a new one it keeps. */
    async function loadKept(d, tile) {
      tile.askedAt = now();
      const s = await withTimeout(api('GET', `/snapshot?deviceId=${encodeURIComponent(d.id)}&maxAge=${keptMs / 1000}`), SNAPSHOT_TIMEOUT_MS);
      const src = await preload(`data:${s.type};base64,${s.data}`);
      if (tiles.get(d.id) === tile) showImage(tile, src, s.at);
    }

    /** A video-only camera on a long refresh: first the frame kept from before, which also says when the next grab is due. */
    async function showKeptFrame(d, tile) {
      if (tile.frameRead) return;
      tile.frameRead = true;
      try {
        const s = await withTimeout(api('GET', `/snapshot?deviceId=${encodeURIComponent(d.id)}&saved=1`), SNAPSHOT_TIMEOUT_MS);
        if (!s || s.none || tiles.get(d.id) !== tile) return;
        const src = await preload(`data:${s.type};base64,${s.data}`);
        if (tiles.get(d.id) !== tile) return;
        tile.grabAt = s.at;
        showImage(tile, src, s.at);
      } catch (err) {
        console.error(err);
      }
    }

    /** Gives the app a grabbed frame to keep, so the next page load opens no stream. */
    function keepFrame(d, src) {
      const data = src.slice(src.indexOf(',') + 1);
      api('POST', '/snapshot', { deviceId: d.id, type: 'image/jpeg', data }).catch(err => console.error(err));
    }

    function showImage(tile, src, at = now()) {
      tile.img.src = src;
      tile.loadedAt = at;
      tile.tile.classList.add('loaded');
    }

    /**
     * A video-only camera's picture: a frame from its stream, one stream at a time, at most every grabMs
     * (GRAB_RETRY_MS after a failure), and never while a camera is live.
     */
    async function grabInto(d, tile) {
      if (live || grab) return;
      if (tile.grabAt != null && now() - tile.grabAt < (tile.grabFailed ? GRAB_RETRY_MS : grabMs)) return;
      tile.grabAt = now();
      try {
        const src = await grabFrame(d, tile);
        if (src == null || tiles.get(d.id) !== tile) return; // cancelled, or the camera went
        tile.grabFailed = false;
        showImage(tile, src);
        if (keptMs) keepFrame(d, src);
      } catch (err) {
        tile.grabFailed = true;
        if (!grabReported.has(d.id)) report(`frame grab of ${d.name} failed: ${err && err.message ? err.message : err}`, true);
        grabReported.add(d.id);
        render();
      }
      updateBadge(d.id);
    }

    /** The first frame of the first stream that gives one; null when cancelled. */
    async function grabFrame(d, tile) {
      const order = videoOrder(d);
      let error = null;
      for (let i = 0; i < order.length; i++) {
        const last = i === order.length - 1;
        try {
          const src = await grabStream(d, tile, order[i], last ? STREAM_LAST_MS : STREAM_NEXT_MS);
          if (src != null) streamWorked(d.id, order[i]);
          return src;
        } catch (err) {
          error = err;
          streamFailed(d.id, order[i]);
          if (tiles.get(d.id) !== tile) return null;
        }
      }
      throw error || new Error('no video');
    }

    /** Opens a stream just long enough to draw its first frame; resolves null when cancelled. */
    function grabStream(d, tile, videoId, timeoutMs) {
      return new Promise((resolve, reject) => {
        if (typeof RTCPeerConnection !== 'function') { reject(new Error('no WebRTC')); return; }
        const pc = new RTCPeerConnection();
        const video = tile.video;
        let finished = false;
        let retry = null;
        const finish = (result) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          clearTimeout(retry);
          video.removeEventListener('playing', onPlaying);
          if (grab === g) grab = null;
          try { pc.close(); } catch (err) { /* already closed */ }
          video.pause();
          video.srcObject = null;
          if (result instanceof Error) reject(result);
          else resolve(result);
        };
        const g = { id: d.id, cancel: () => finish(null) };
        grab = g;
        const timer = setTimeout(() => finish(new Error(`no video after ${timeoutMs / 1000} s`)), timeoutMs);
        const take = () => {
          if (finished) return;
          let src = null;
          try { src = captureFrame(video); } catch (err) { finish(err); return; }
          if (src) finish(src);
          else retry = setTimeout(take, 250); // no size yet
        };
        const onPlaying = () => {
          if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(() => take());
          else retry = setTimeout(take, 100);
        };
        video.addEventListener('playing', onPlaying);
        pc.ontrack = (e) => {
          if (finished) return;
          video.srcObject = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
          const p = video.play();
          if (p && p.catch) p.catch(() => {});
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed') finish(new Error('connection failed'));
        };
        openStream(pc, videoId, () => !finished)
          .catch(err => finish(err instanceof Error ? err : new Error(String(err))));
      });
    }

    /** Sends the offer and sets Homey's answer; null when `current()` says the stream was dropped meanwhile. */
    function openStream(pc, videoId, current) {
      return openVideoStream(pc, videoId, (path, body) => api('POST', path, body), current);
    }

    /** A snapshot that hasn't refreshed for two intervals shows the time it was taken. */
    function updateBadge(id) {
      const tile = tiles.get(id);
      if (!tile) return;
      const d = devices.find(x => x.id === id);
      const every = d && !('missing' in d) && !d.image ? grabMs : refreshMs;
      const stale = tile.loadedAt > 0 && now() - tile.loadedAt > 2 * every + 5000;
      tile.badge.textContent = stale
        ? timeFormatter(undefined, opts.timeFormat, '2-digit').format(new Date(tile.loadedAt)) : '';
      tile.badge.style.display = stale ? '' : 'none';
    }

    // ---------------------------------------------------------------- live view

    function note(id, text) {
      const tile = tiles.get(id);
      if (!tile) return;
      if (tile.noteTimer) clearTimeout(tile.noteTimer);
      tile.note.textContent = text;
      tile.note.style.display = '';
      tile.noteTimer = setTimeout(() => { tile.note.style.display = 'none'; }, 6000);
    }

    /**
     * The live camera covers the whole widget, letterboxed. The widget keeps its height, except that a single
     * row of tiles grows to a full-width 16:9 first, so the video isn't a strip. The height is measured before
     * the tile leaves the grid: a wide tile has a row of its own, which would otherwise collapse.
     */
    function expand(tile, on) {
      const box = grid.getBoundingClientRect();
      const minHeight = on ? `${Math.ceil(Math.max(box.height, box.width * 9 / 16))}px` : '';
      tile.tile.classList.toggle('expanded', on);
      grid.classList.toggle('has-expanded', on);
      grid.style.minHeight = minHeight;
      reportHeight();
    }

    function stopLive(refreshAfter = true) {
      if (!live) return;
      const l = live;
      live = null;
      clearTimeout(l.maxTimer);
      const tile = tiles.get(l.id);
      if (tile) {
        // A video-only camera keeps the last frame it showed live.
        const d = devices.find(x => x.id === l.id);
        if (l.playing && d && !('missing' in d) && !d.image) {
          let src = null;
          try { src = captureFrame(tile.video); } catch (err) { /* no frame */ }
          if (src) { tile.grabAt = now(); tile.grabFailed = false; showImage(tile, src); }
        }
      }
      if (l.stream) l.stream.stop();
      if (tile) {
        tile.tile.classList.remove('live', 'connecting');
        expand(tile, false);
        render();
      }
      if (refreshAfter) refresh();
      if (autoId && autoShown && !autoGaveUp) {
        clearTimeout(autoTimer);
        autoTimer = setTimeout(() => { autoTimer = null; startAuto(); }, autoDelay);
      }
      autoDelay = AUTO_BACK_MS;
    }

    /**
     * Always live: its camera goes live, unless something else is live, it's waiting to come back, or it gave up. It
     * gives up until the page next shows when another try can't help: away from home, or H.265 only.
     */
    function startAuto() {
      if (!autoId || !autoShown || autoGaveUp || autoTimer || live || names.renaming) return;
      const d = devices.find(x => x.id === autoId);
      if (!d || 'missing' in d || !d.video) return;
      const tile = tiles.get(d.id);
      // The page just opened: its snapshot shows while the stream connects, as it would after a tap.
      if (tile && d.image && !tile.loadedAt) {
        loadSnapshot(d).then((src) => { if (tiles.get(d.id) === tile) showImage(tile, src); }).catch(() => { /* the stream may still play */ });
      }
      startLive(d);
    }

    /**
     * The camera's streams in the order to try: the one that last played first, then those that haven't
     * failed this session, then those that have (they may work now), each group in the app's order.
     */
    function videoOrder(d) {
      const all = Array.isArray(d.videos) && d.videos.length ? d.videos : (d.video ? [d.video] : []);
      const failed = failedVideos.get(d.id);
      const ok = workingVideo.get(d.id);
      const rank = v => (v === ok ? 0 : failed && failed.has(v) ? 2 : 1);
      return all.map((v, i) => ({ v, i })).sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i).map(x => x.v);
    }

    function streamWorked(id, videoId) {
      workingVideo.set(id, videoId);
      const failed = failedVideos.get(id);
      if (failed) failed.delete(videoId);
    }

    function streamFailed(id, videoId) {
      if (workingVideo.get(id) === videoId) workingVideo.delete(id);
      if (!failedVideos.has(id)) failedVideos.set(id, new Set());
      failedVideos.get(id).add(videoId);
    }

    /** Every stream of the camera is H.265, which Homey's WebRTC refuses ("codecs not matched"). */
    function allH265(d) {
      const all = Array.isArray(d.videos) && d.videos.length ? d.videos : (d.video ? [d.video] : []);
      const h265 = Array.isArray(d.h265) ? d.h265 : [];
      return all.length > 0 && all.every(v => h265.includes(v));
    }

    function report(text, warn) {
      if (opts.report) opts.report(text, warn);
    }

    /**
     * Live view: the kit's `playCameraStream()` on the camera's streams (videoOrder), with what only this widget does:
     * which stream to try first next time, the reports, and what the tile says when it ends.
     */
    function startLive(d) {
      const tile = tiles.get(d.id);
      if (!tile || typeof RTCPeerConnection !== 'function') { note(d.id, t('liveFailed')); return; }
      if (grab) grab.cancel(); // one stream at a time
      clearTimeout(autoTimer);
      autoTimer = null;
      const order = videoOrder(d);
      const l = { id: d.id, stream: null, playing: false, maxTimer: null };
      live = l;
      tile.tile.classList.add('connecting');
      expand(tile, true);
      if (liveMs != null && d.id !== autoId) l.maxTimer = setTimeout(() => { if (live === l) stopLive(); }, liveMs);
      l.stream = playCameraStream(tile.video, order, (path, body) => api('POST', path, body), {
        onPlaying(videoId) {
          l.playing = true;
          streamWorked(d.id, videoId);
          tile.tile.classList.remove('connecting');
          tile.tile.classList.add('live');
        },
        onStreamFailed(videoId, why, i) {
          streamFailed(d.id, videoId);
          report(`live view of ${d.name}: stream ${i + 1} of ${order.length} failed: ${why}`, true);
        },
        onKeepAliveFailed(err) {
          report(`live view of ${d.name}: keep-alive failed: ${err && err.message ? err.message : err}`, true);
        },
        onEnded(played, why, { away }) {
          if (live !== l) return;
          if (played) {
            report(`live view of ${d.name} failed: ${why}`, true);
            if (d.id === autoId) autoDelay = AUTO_LOST_MS;
            stopLive();
            note(d.id, t('liveFailed'));
            return;
          }
          report(`live view of ${d.name}: none of its ${order.length} streams played`
            + (away ? '; Homey answered, but its video server could not be reached (away from home?)' : ''), true);
          if (d.id === autoId && (away || allH265(d))) autoGaveUp = true;
          stopLive();
          note(d.id, t(allH265(d) ? 'liveH265' : away ? 'liveAway' : 'liveFailed'));
        },
      });
    }

    function press(id) {
      const d = devices.find(x => x.id === id);
      if (!liveView || !d || 'missing' in d || !d.video || names.renaming) return;
      resumeId = null;
      const wasLive = live && live.id === id;
      stopLive();
      if (!wasLive) startLive(d);
    }

    // ---------------------------------------------------------------- tiles

    function tileFor(id) {
      let tile = tiles.get(id);
      if (tile) return tile;
      const node = el('div', { class: 'cw-tile', 'data-device': id });
      const img = /** @type {HTMLImageElement} */ (el('img', { class: 'cw-img', alt: '' }, node));
      const video = /** @type {HTMLVideoElement} */ (el('video', { class: 'cw-video', playsinline: '', muted: '', autoplay: '' }, node));
      video.muted = true;
      const icon = el('span', { class: 'cw-icon' }, node);
      const overlay = el('div', { class: 'cw-overlay' }, node);
      const name = el('span', { class: 'cw-name', dir: 'auto' }, overlay);
      const chip = el('span', { class: 'cw-chip' }, overlay);
      chip.textContent = t('live');
      const badge = el('span', { class: 'cw-badge' }, node);
      badge.style.display = 'none';
      const noteEl = el('span', { class: 'cw-note', dir: 'auto' }, node);
      noteEl.style.display = 'none';
      tile = {
        tile: node, img, video, icon, name, badge, note: noteEl, loadedAt: 0, noteTimer: null,
        grabAt: null, grabFailed: false, askedAt: null, frameRead: false,
      };

      // A tap (the kit's, as Quick Actions'): a drag is left to the dashboard, so it still scrolls.
      onTap(node, () => press(id), { keys: false, guard: touches });
      tiles.set(id, tile);
      return tile;
    }

    const setMask = (node, url) => window.WidgetkeeperKit.setMask(node, url, '--cw-mask');

    let lastHeight = 0;
    function render() {
      const ids = new Set(devices.map(d => d.id));
      for (const [id, tile] of tiles) {
        if (!ids.has(id)) { tile.tile.remove(); tiles.delete(id); }
      }
      let placed = null;
      devices.forEach((d, i) => {
        const tile = tileFor(d.id);
        // Keeps the order, moving only what is out of place: a moved node loses the focus of a field in it.
        const want = placed ? placed.nextSibling : grid.firstChild;
        if (tile.tile !== want) grid.insertBefore(tile.tile, want);
        placed = tile.tile;
        const missing = 'missing' in d;
        tile.name.textContent = missing ? t('unavailable') : names.name(d.id, d.name);
        if (names.renaming && !missing) {
          const field = names.field(d.id, d.name);
          if (field.previousSibling !== tile.name) tile.name.after(field);
        }
        setMask(tile.icon, missing ? null : d.icon);
        tile.icon.classList.toggle('fallback', missing || !d.icon);
        tile.tile.classList.toggle('missing', missing);
        // "No snapshot": no image and no video to grab a frame from, or a failed grab before any frame.
        const empty = !missing && !d.image && (!d.video || (tile.grabFailed && !tile.loadedAt));
        tile.tile.classList.toggle('no-image', empty);
        tile.tile.classList.toggle('has-video', liveView && !missing && !!d.video);
        // A lone tile, and the last (or first) of an odd number, spans the row.
        tile.tile.classList.toggle('wide', spansRow(i, devices.length, opts.layout));
        if (empty) tile.note.style.display = 'none';
        tile.tile.setAttribute('data-empty', !empty ? '' : d.video && allH265(d) ? t('liveH265') : t('noImage'));
      });
      grid.style.display = devices.length ? '' : 'none';
      messageEl.textContent = message.text || '';
      messageEl.style.display = message.text ? '' : 'none';
      messageEl.classList.toggle('error', !!message.text && devices.length > 0);

      reportHeight();
    }

    function reportHeight() {
      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h && h !== lastHeight) { lastHeight = h; if (opts.onHeight) opts.onHeight(h); }
    }

    /**
     * Ends live view, e.g. when the dashboard goes to the background. Until tapped, the camera goes live again on
     * resume(); a second pause() (hidden, then off screen in a Smart Stack) keeps that.
     */
    function pause() {
      if (grab) grab.cancel();
      if (live && liveMs == null) resumeId = live.id;
      autoShown = false;
      stopLive(false);
      clearTimeout(autoTimer);
      autoTimer = null;
    }

    /** The page shows again: the camera that pause() ended until tapped goes live again. */
    function resume() {
      const id = resumeId;
      resumeId = null;
      autoShown = true;
      autoGaveUp = false;
      if (liveView && id && !live && !names.renaming) {
        const d = devices.find(x => x.id === id);
        if (d && !('missing' in d) && d.video) startLive(d);
      }
      startAuto();
    }

    return { setState, setNames: names.set, setMessage, refresh, render, pause, resume, t, routeOf: (id) => (appRoute.has(id) ? 'app' : 'direct') };
  }

  window.createCamerasWidget = createCamerasWidget;
})();
