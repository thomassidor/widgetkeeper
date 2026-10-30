/*
 * The web dashboards page — popups (wk-084): a Flow's message or question, over everything. A part of the page
 * (settings/dashboard.js): mountWebDashboards() runs it once with `wd`, the page's shared state and functions. The
 * core's functions and constants are taken from `wd` at the top; the state that changes, and the other parts'
 * functions, are read as `wd.<name>`. Plain browser JS (served as-is).
 */
(function () {
  'use strict';

  window.WidgetkeeperWeb.part('popups', (wd) => {
    const { APP_ID, button, el, listeners, request, t } = wd;

    /** A popup's camera picture is read again this often while it shows. */
    const CAMERA_REFRESH_MS = 3000;

    /** How long "Answered on another screen" shows before the popup closes. */
    const ELSEWHERE_MS = 2000;

    // ---- Popups (wk-084): a Flow's message or question, over everything ---------------------------------------

    /**
     * The open popups (`lib/PopupService.ts`), oldest first, each with `localUntil` (its end on this browser's clock).
     * One shows at a time, in a modal dialog (the top layer: above the dim layer, full screen and the frames): a
     * dashboard shows those sent to it and to everywhere, the front page only everywhere's, the editor none.
     */
    const popups = new Map();
    const dismissed = new Set(); // messages tapped away on this screen (the others keep theirs)
    const sounded = new Set(); // popups whose sound played here, so going back to their dashboard doesn't play it again
    let shownPopup = null; // {id, d, close(note)}
    // A popup's sound (the kit's) needs the page used first: any tap or key wakes the audio.
    for (const type of ['pointerdown', 'keydown']) {
      document.addEventListener(type, () => window.WidgetkeeperKit.sound.unlock(), { capture: true, passive: true });
    }

    /** Takes the open popups as Homey lists them (`/web/setup`, `/web/popups`), its clock beside them. */
    function setPopups(list, now) {
      const skew = typeof now === 'number' ? now - Date.now() : 0;
      const ids = new Set();
      for (const p of Array.isArray(list) ? list : []) {
        ids.add(p.id);
        if (!popups.has(p.id)) addPopup(p, skew);
      }
      for (const id of [...popups.keys()]) if (!ids.has(id)) removePopup(id, null, 'closed');
      syncPopups();
    }

    function addPopup(p, skew) {
      const localUntil = p.until - skew;
      if (localUntil <= Date.now()) return;
      const timer = setTimeout(() => removePopup(p.id, null, 'expired'), localUntil - Date.now());
      popups.set(p.id, Object.assign({}, p, { localUntil, timer }));
    }

    /** `button`: the text of the button that answered it, if one did. */
    function removePopup(id, answer, reason, button) {
      const p = popups.get(id);
      if (p) clearTimeout(p.timer);
      popups.delete(id);
      dismissed.delete(id);
      sounded.delete(id);
      if (shownPopup && shownPopup.id === id) {
        if (shownPopup.sending) {
          // This screen's answer is on its way, so this close may be its own or another screen's: its reply says.
          shownPopup.held = { answer, reason, button };
        } else {
          // Another screen's answer: said for a moment, so this screen sees what happened.
          const note = reason === 'answered' && !shownPopup.answeredHere && typeof button === 'string'
            ? t('popupElsewhere', { button }) : null;
          shownPopup.close(note);
        }
      }
      syncPopups();
    }

    /** Whether a popup belongs on the view now open. */
    function popupHere(p) {
      if (!wd.setup || wd.setup.disabled || wd.setup.passwordRequired || !wd.key) return false;
      const m = location.hash.match(/^#\/d\/([A-Za-z0-9_-]+)(\/edit)?$/);
      if (m) return !m[2] && (p.target === 'all' || p.target === `web:${m[1]}` || screenNamesOf(m[1]).has(p.target));
      return p.target === 'all' && location.hash !== '#/edit';
    }

    /**
     * The screen names of a dashboard's Popups widgets, as targets (`name:<key>`, keyed as `screenKey()` in
     * lib/PopupService.ts and the widget's `popupsScreenKey()`): a popup sent to one shows on that dashboard too.
     */
    function screenNamesOf(dashboardId) {
      const d = wd.dashboards.find(x => x.id === dashboardId);
      const names = new Set();
      for (const column of (d && d.columns) || []) {
        for (const w of column) {
          if (w.type !== 'popups') continue;
          const name = w.settings && typeof w.settings.name === 'string' ? w.settings.name.trim() : '';
          names.add(`name:${(name || 'Screen').toLowerCase().slice(0, 60)}`);
        }
      }
      return names;
    }

    /** Shows the oldest popup that belongs here, or closes the one shown when it no longer does (another view). */
    function syncPopups() {
      if (shownPopup) {
        const p = popups.get(shownPopup.id);
        if (p && !popupHere(p)) shownPopup.close(null);
        return;
      }
      for (const p of popups.values()) {
        if (!dismissed.has(p.id) && popupHere(p)) { showPopup(p); return; }
      }
    }

    function showPopup(p) {
      const d = el('dialog', 'wd-dialog wd-popup');
      d.classList.toggle('ask', p.kind === 'ask');
      const box = el('div', 'wd-popup-box');
      d.append(box);
      const timers = [];
      let closed = false;
      // `sending`: this screen's answer is on its way; `held`: how the popup closed meanwhile.
      const shown = { id: p.id, d, answeredHere: false, sending: false, held: null, close: null };

      if (p.picture) {
        const frame = el('div', 'wd-popup-picture loading');
        const img = el('img');
        img.alt = '';
        frame.append(img);
        box.append(frame);
        const load = async () => {
          if (closed) return;
          if (!document.hidden) {
            try {
              const res = await request('GET', `/web/popups/${encodeURIComponent(p.id)}/image`);
              if (closed) return;
              img.src = `data:${res.type};base64,${res.data}`;
              frame.classList.remove('loading', 'failed');
            } catch (err) {
              if (closed) return;
              if (frame.classList.contains('loading')) {
                frame.classList.replace('loading', 'failed');
                frame.append(el('p', 'wd-muted', t('popupPictureFailed')));
              }
            }
          }
          // A camera's snapshot is read again while it shows; a kept picture once.
          if (p.picture.source === 'camera') timers.push(setTimeout(load, CAMERA_REFRESH_MS));
        };
        load();
      }
      if (p.text) {
        const text = el('p', 'wd-popup-text', p.text);
        text.dir = 'auto';
        box.append(text);
      }
      const status = el('p', 'wd-popup-status');
      status.setAttribute('role', 'status');

      if (p.kind === 'ask') {
        const actions = el('div', 'wd-popup-actions');
        const send = async (answer) => {
          for (const b of actions.querySelectorAll('button')) b.disabled = true;
          shown.sending = true;
          status.textContent = '';
          let res;
          try {
            res = await request('POST', `/web/popups/${encodeURIComponent(p.id)}/answer`, { answer });
          } catch (err) {
            shown.sending = false;
            // It closed meanwhile (another screen, or the time ran out): say how.
            if (shown.held) { removePopup(p.id, shown.held.answer, shown.held.reason, shown.held.button); return; }
            status.textContent = t('popupAnswerFailed');
            for (const b of actions.querySelectorAll('button')) b.disabled = false;
            return;
          }
          shown.sending = false;
          if (res && res.ok === false && res.reason === 'closed') {
            // Someone else was first: say what they answered.
            removePopup(p.id, res.answer, res.answer == null ? 'closed' : 'answered', res.button);
          } else {
            shown.answeredHere = true;
            removePopup(p.id, answer, 'answered', res && res.button);
          }
        };
        // The Flow's buttons in its order, the first highlighted (it answers yes).
        (Array.isArray(p.buttons) && p.buttons.length ? p.buttons : ['Yes', 'No']).forEach((label, i) => {
          const b = button(i === 0 ? 'wd-btn primary wd-popup-first' : 'wd-btn', label, () => send(i === 0));
          b.dir = 'auto';
          actions.append(b);
        });
        box.append(actions, status);
      } else {
        // A message: a bar runs down to its end; a tap anywhere closes it on this screen.
        const bar = el('div', 'wd-popup-bar');
        const fill = el('span');
        bar.append(fill);
        box.append(bar);
        const left = Math.max(0, p.localUntil - Date.now());
        const total = Math.max(left, p.until - p.createdAt);
        fill.style.transform = `scaleX(${left / total})`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          fill.style.transition = `transform ${left}ms linear`;
          fill.style.transform = 'scaleX(0)';
        }));
        d.addEventListener('click', () => { dismissed.add(p.id); shown.close(null); });
        d.setAttribute('aria-label', p.text || t('popupClose'));
      }

      // Escape closes it here (a question stays open on the other screens).
      d.addEventListener('cancel', (e) => { e.preventDefault(); dismissed.add(p.id); shown.close(null); });
      shown.close = (note) => {
        if (closed) return;
        closed = true;
        for (const timer of timers) clearTimeout(timer);
        const done = () => {
          if (shownPopup === shown) shownPopup = null;
          d.close();
          d.remove();
          syncPopups();
        };
        if (note) {
          for (const b of d.querySelectorAll('button')) b.disabled = true;
          status.textContent = note;
          if (!status.isConnected) box.append(status);
          setTimeout(done, ELSEWHERE_MS);
        } else {
          done();
        }
      };
      shownPopup = shown;
      document.body.append(d);
      d.showModal();
      if (p.sound && !sounded.has(p.id)) {
        sounded.add(p.id);
        window.WidgetkeeperKit.sound.play(p.sound);
      }
      const first = d.querySelector('.wd-popup-first');
      if (first) /** @type {HTMLElement} */ (first).focus();
    }

    /** The open popups again, after a reconnect: a screen that was offline missed their events. */
    function refreshPopups() {
      request('GET', '/web/popups').then(res => setPopups(res && res.popups, res && res.now), () => { /* the next reconnect tries again */ });
    }

    {
      const uri = `homey:app:${APP_ID}`;
      const on = (event, fn) => {
        const k = wd.listenerKey(uri, event);
        if (!listeners.has(k)) listeners.set(k, new Set());
        listeners.get(k).add(fn);
      };
      on('popups:show', (data) => {
        if (!data || typeof data.id !== 'string' || popups.has(data.id)) return;
        addPopup(data, typeof data.now === 'number' ? data.now - Date.now() : 0);
        syncPopups();
      });
      on('popups:close', (data) => {
        if (data && typeof data.id === 'string') removePopup(data.id, data.answer == null ? null : data.answer === true, data.reason, data.button);
      });
    }

    Object.assign(wd, { refreshPopups, setPopups, syncPopups });
  });
})();
