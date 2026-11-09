/*
 * The web dashboards page — the views: the page chrome (title, theme, the key and password screens), a dashboard and
 * its view and edit bars, and the grid kept in step with it. A part of the page (settings/dashboard.js):
 * mountWebDashboards() runs it once with `wd`, the page's shared state and functions. The core's functions and
 * constants are taken from `wd` at the top; the state that changes, and the other parts' functions, are read as
 * `wd.<name>`. Plain browser JS (served as-is).
 */
(function () {
  'use strict';

  window.WidgetkeeperWeb.part('views', (wd) => {
    const { appWidget, BACKGROUNDS, button, clone, confirmButton, CUSTOM_BACKGROUND, hardToRead, darkQuery, DEFAULT_STRINGS, el, failed, HOMEY_WIDTH,
      icon, isScreenCode, KEY_STORAGE, LAYOUT, loadAll, persist, request, root, route, SESSION_STORAGE, start, STAY_STORAGE,
      storageSet, t, THEME_STORAGE, unlocked, useCode } = wd;

    /** The app's logomark (assets/icon.svg): three rounded squares and a sparkle, stroked and filled in currentColor. */
    const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3">'
      + '<rect x="11.5" y="11.5" width="17" height="17" rx="5"/><rect x="11.5" y="35.5" width="17" height="17" rx="5"/>'
      + '<rect x="35.5" y="35.5" width="17" height="17" rx="5"/></g>'
      + '<path d="M44 11Q44 20 53 20Q44 20 44 29Q44 20 35 20Q44 20 44 11Z" fill="currentColor"/></svg>';

    /**
     * A dashboard's column widths (`columnWidth`; the ids are `WEB_COLUMN_WIDTHS` in lib/WebDashboardService.ts), as the
     * grid's `--wd-col-max`: Narrow is a phone's widget width, as on Homey's dashboard; Fit to window shares the window.
     */
    const COLUMN_WIDTHS = { narrow: `${HOMEY_WIDTH}px`, normal: '440px', wide: '560px', fit: '1fr' };

    // ---- Views ---------------------------------------------------------------------------------------------

    /** The browser title: `Widgetkeeper - <dashboard name>` on a dashboard, else `Widgetkeeper Web Dashboards`. */
    function setTitle(dashboard) {
      document.title = dashboard ? `Widgetkeeper - ${dashboard.name || t('untitled')}` : brandName();
    }

    /** `Widgetkeeper Web Dashboards`: the app's name, then the page's (`web.title`, in Homey's language). */
    function brandName() {
      return `Widgetkeeper ${t('title')}`;
    }

    /** The front page's title: the app icon (the logomark, white on the brand colour) and the name. */
    function brand() {
      const node = el('h1', 'wd-brand');
      const mark = el('span', 'wd-logo');
      mark.innerHTML = LOGO;
      node.append(mark, el('span', 'wd-brand-name', brandName()));
      return node;
    }

    function clearRoot() {
      if (wd.drag) wd.endDrag(false);
      if (wd.resizing) wd.endResize(false);
      wd.sizes.disconnect();
      if (wd.dismissUndo) wd.dismissUndo();
      if (wd.clearSaveProblem) wd.clearSaveProblem();
      setTitle(null);
      root.classList.remove('editing');
      root.textContent = '';
      wd.current = null;
      wd.sweepFrames();
    }

    /** The page's mode (this browser's own choice, else the theme) and the dashboard's backdrop (none: the page's). */
    function applyTheme(theme, background) {
      const html = document.documentElement;
      const own = wd.ownTheme();
      const dark = own ? own === 'dark' : wd.themeIsDark(theme);
      html.classList.toggle('homey-dark-mode', dark);
      if (background && background !== 'default') html.style.setProperty('--wd-bg', wd.backdrop(background, dark));
      else html.style.removeProperty('--wd-bg');
      // A colour of the user's own may be a bright one in dark mode: the editor's forms keep the page's own shade.
      if (CUSTOM_BACKGROUND.test(background)) html.style.setProperty('--wd-panel', BACKGROUNDS.default[dark ? 1 : 0]);
      else html.style.removeProperty('--wd-panel');
    }

    // Full screen: the dashboard's bar keeps only the exit button and the live note (dashboard.css).
    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) {
      document.addEventListener(type, () => {
        const page = /** @type {any} */ (document);
        const full = !!(page.fullscreenElement || page.webkitFullscreenElement);
        document.documentElement.classList.toggle('wd-full', full);
        for (const b of root.querySelectorAll('.wd-full-toggle')) b.replaceChildren(icon(full ? 'fullScreenExit' : 'fullScreen'));
      });
    }

    if (darkQuery && darkQuery.addEventListener) {
      darkQuery.addEventListener('change', () => {
        if (wd.ownTheme() || (wd.current && wd.current.dashboard.theme !== 'auto')) return;
        // The front page: its cards of Automatic dashboards change mode too.
        if (root.querySelector(':scope > .wd-home')) { route(); return; }
        applyTheme(wd.current ? wd.current.dashboard.theme : 'auto');
        wd.reloadFrames(); // a frame's dark mode is set when it starts
      });
    }

    function centered(...children) {
      const wrap = el('div', 'wd-center');
      const card = el('div', 'wd-card');
      card.append(...children);
      wrap.append(card);
      return wrap;
    }

    /**
     * Signing a browser in: a screen's sign-in code first (Web dashboards → Screens and browsers in the app settings),
     * or, behind *Use an API key instead*, a personal API key, with the plain-HTTP warning that only a key needs. Either
     * field takes either (`isScreenCode()`), so a code pasted in key mode still works.
     */
    function renderKey(message, mode = 'code') {
      clearRoot();
      applyTheme('auto');
      const keyMode = mode === 'key';
      const input = el('input', 'wd-input');
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (keyMode) {
        input.type = 'password';
        input.placeholder = t('keyPlaceholder');
      } else {
        // A code (8 characters) shows as it's typed; anything longer is a pasted key, hidden.
        input.type = 'text';
        input.autocapitalize = 'characters';
        input.placeholder = t('signInCode');
        input.addEventListener('input', () => { input.type = input.value.trim().length > 9 ? 'password' : 'text'; });
      }
      const error = el('p', 'wd-error', message || '');
      const go = button('wd-btn primary', t('signIn'), async () => {
        const value = input.value.trim();
        if (!value) return;
        go.disabled = true;
        error.textContent = '';
        if (isScreenCode(value)) {
          const problem = await useCode(value);
          go.disabled = false;
          if (problem) { error.textContent = problem; input.select(); return; }
          start();
          return;
        }
        wd.key = value;
        try {
          await loadAll();
          storageSet(KEY_STORAGE, wd.key);
          route();
        } catch (err) {
          wd.key = null;
          go.disabled = false;
          error.textContent = err.unauthorized ? t('keyRejected') : t('loadFailed');
        }
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
      const form = el('div', 'wd-row');
      form.append(input, go);
      // The home address is plain HTTP: a key (sent with every request) can be read on the network.
      const plain = keyMode && location.protocol === 'http:' ? [el('p', 'wd-muted', t('keyPlain'))] : [];
      const other = button('wd-btn quiet', t(keyMode ? 'codeUse' : 'keyUse'), () => renderKey('', keyMode ? 'code' : 'key'));
      root.append(centered(el('h1', 'wd-h1', brandName()), el('p', 'wd-muted', t(keyMode ? 'keyModeText' : 'keyText')),
        ...plain, form, error, other));
      input.focus();
    }

    /** Signs this browser out: its password session ended, its key and session forgotten, then the sign-in screen. */
    async function signOut() {
      if (wd.session) await request('POST', '/web/logout', {}).catch(() => {});
      storageSet(KEY_STORAGE, null);
      storageSet(SESSION_STORAGE, null);
      location.reload();
    }

    /** The web dashboards password (set in the app settings): asked after the code or key, before anything else. */
    function renderPassword(message) {
      clearRoot();
      applyTheme('auto');
      const input = el('input', 'wd-input');
      input.type = 'password';
      input.autocomplete = 'current-password';
      input.placeholder = t('passwordPlaceholder');
      const error = el('p', 'wd-error', message || '');
      const go = button('wd-btn primary', t('signIn'), async () => {
        if (!input.value) return;
        go.disabled = true;
        error.textContent = '';
        try {
          const res = await request('POST', '/web/login', { password: input.value });
          if (res && res.reason === 'notSet') { start(); return; } // the password was removed meanwhile: none needed
          if (!res || !res.ok) {
            go.disabled = false;
            error.textContent = res && res.reason === 'locked'
              ? t('passwordLocked', { seconds: res.retryAfter || 60 }) : t('passwordWrong');
            input.select();
            return;
          }
          wd.session = res.token;
          storageSet(SESSION_STORAGE, wd.session);
          start();
        } catch (err) {
          go.disabled = false;
          if (err && err.handled) return;
          if (err && (err.unauthorized || /turned off/.test(String(err.message)))) { failed(err); return; }
          error.textContent = t('loadFailed');
        }
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
      const form = el('div', 'wd-row');
      form.append(input, go);
      const out = button('wd-btn quiet', t('forgetKey'), () => { out.disabled = true; signOut(); });
      root.append(centered(el('h1', 'wd-h1', brandName()), el('p', 'wd-muted', t('passwordText')), form, error, out));
      input.focus();
    }

    function renderOff() {
      clearRoot();
      applyTheme('auto');
      root.append(centered(
        el('h1', 'wd-h1', brandName()),
        el('p', 'wd-muted', t(wd.setup && wd.setup.away ? 'offAway' : 'off')),
        button('wd-btn', t('retry'), () => start()),
      ));
    }

    function renderFailed() {
      clearRoot();
      applyTheme('auto');
      root.append(centered(
        el('p', 'wd-error', t('loadFailed')),
        button('wd-btn', t('retry'), () => start()),
      ));
    }

    function bar(...children) {
      const node = el('header', 'wd-bar');
      node.append(...children);
      return node;
    }

    function liveNote() {
      const note = el('span', 'wd-live', t('noLive'));
      note.hidden = wd.live;
      return note;
    }

    /** A widget type's short description (`web.about.<type>`); another app's widget's is its app's name. */
    function about(type) {
      const other = wd.foreign.get(type);
      if (other) return other.ownerName;
      const strings = wd.setup && wd.setup.strings && wd.setup.strings.web;
      const own = strings && strings.about && strings.about[type];
      return (typeof own === 'string' && own) || DEFAULT_STRINGS.about[type] || '';
    }

    /** Where the Homey serves a widget's files (`index.html`, the previews): ours beside this page, another app's under it. */
    function widgetFolder(type) {
      const app = appWidget(type);
      return app
        ? `/app/${encodeURIComponent(app.appId)}/widgets/${encodeURIComponent(app.widgetId)}`
        : `../widgets/${encodeURIComponent(type)}`;
    }

    /** A widget type's own preview (as Homey's widget picker shows it), served beside its files, in the page's theme. */
    function preview(type, className, dark = wd.isDark()) {
      const img = el('img', className);
      img.src = `${widgetFolder(type)}/preview-${dark ? 'dark' : 'light'}.png`;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
      return img;
    }


    function renderMissing() {
      clearRoot();
      applyTheme('auto');
      const back = el('a', 'wd-btn', t('dashboards'));
      back.href = '#/';
      root.append(centered(el('p', 'wd-muted', t('missing')), back));
    }

    /** The widget ids' frame signature: a change (settings, devices, title, theme) reloads that frame. */
    const signature = (w) => JSON.stringify([w.type, w.title, w.settings, w.deviceIds, w.trusted === true, w.scaled === true, wd.isDark()]);

    function renderDashboard(dashboard, editing) {
      clearRoot();
      setTitle(dashboard);
      applyTheme(dashboard.theme, dashboard.background);
      wd.current = { dashboard: editable(dashboard), editing, widgets: new Map(), covers: new Map(), grid: el('main', 'wd-grid') };
      root.classList.toggle('editing', editing);
      root.append(editing ? editBar() : viewBar(), wd.current.grid);
      wd.sizes.observe(wd.current.grid);
      syncGrid();
      if (!editing) wd.onSyncOpen(dashboard.id);
    }

    /**
     * A dashboard as the page edits it: a cover (`{cover: <id>}`) in each column a wide widget covers, where it sits in
     * that column (`settings/dashboard-layout.js`), so moving, adding and removing widgets carries them along.
     */
    function editable(d) {
      const copy = clone(d);
      copy.columns = LAYOUT.expand(copy.columns);
      return copy;
    }

    /** And as it's stored: each wide widget's place in the columns it covers as its `at`. */
    function stored(d) {
      const copy = clone(d);
      copy.columns = LAYOUT.collapse(copy.columns);
      return copy;
    }

    /**
     * A dashboard's code, while it locks: `{digits}` (0 while Any code's codes differ in length: OK sends it), or null
     * without one, or once it was removed (or Any code has none).
     */
    function lockOf(d) {
      const id = d && d.code && d.code.id;
      const codes = (wd.setup && wd.setup.codes) || [];
      if (!id) return null;
      if (id === 'any') return codes.length ? { digits: new Set(codes.map(c => c.digits)).size === 1 ? codes[0].digits : 0 } : null;
      const c = codes.find(x => x.id === id);
      return c ? { digits: c.digits } : null;
    }

    /**
     * Asks a dashboard's code on a phone's keypad in a dialog, which the app checks, then `then()`. It sends on the last
     * digit, or with OK while the length isn't known; wrong ones count as at a Keypad.
     */
    function askCode(dash, then) {
      const lock = lockOf(dash);
      if (!lock) { then(); return; }
      for (const open of document.querySelectorAll('dialog.wd-code')) /** @type {HTMLDialogElement} */ (open).close(); // one at a time
      const { d, body } = wd.dialog(dash.name || t('untitled'));
      d.classList.add('wd-code');
      const dots = el('div', 'wd-code-dots');
      dots.setAttribute('aria-hidden', 'true');
      const note = el('p', 'wd-code-note');
      note.setAttribute('role', 'status');
      const keys = el('div', 'wd-code-keys');
      body.append(el('p', 'wd-code-prompt', t('enterCode')), dots, note, keys);
      let typed = '';
      let busy = false;
      let lockedUntil = 0;
      let timer = null;
      const buttons = [];
      for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'ok', '0', 'back']) {
        if (k === 'ok' && lock.digits) { keys.append(el('span')); continue; }
        const fn = k === 'ok' || k === 'back';
        const b = button(fn ? 'wd-code-key fn' : 'wd-code-key', fn ? null : k, () => press(k), fn ? t(k === 'ok' ? 'codeOk' : 'codeDelete') : null);
        if (fn) b.append(icon(k === 'ok' ? 'check' : 'backspace'));
        buttons.push(b);
        keys.append(b);
      }
      function draw(error = false) {
        dots.replaceChildren(...Array.from({ length: lock.digits || typed.length }, (_, i) => el('span', i < typed.length ? 'f' : null)));
        dots.classList.toggle('err', error);
        dots.classList.toggle('checking', busy);
        for (const b of buttons) b.disabled = busy || Date.now() < lockedUntil;
      }
      function tick() {
        clearTimeout(timer);
        const left = lockedUntil - Date.now();
        note.textContent = left > 0 ? t('codeLocked', { s: Math.ceil(left / 1000) }) : '';
        draw();
        if (left > 0) timer = setTimeout(tick, Math.min(1000, left));
      }
      async function send() {
        busy = true;
        draw();
        let res = null;
        try {
          res = await request('POST', `/web/dashboards/${encodeURIComponent(dash.id)}/unlock`, { code: typed });
        } catch (err) {
          failed(err, t('loadFailed'));
        }
        busy = false;
        typed = '';
        if (res && res.ok) {
          d.close();
          then();
          return;
        }
        if (res && res.reason === 'locked') {
          lockedUntil = Date.now() + (Number(res.retryAfter) || 30) * 1000;
          tick();
          return;
        }
        note.textContent = res && res.reason === 'wrongCode' ? (res.left <= 2 ? t('triesLeft', { n: res.left }) : t('wrongCode')) : '';
        draw(true);
        setTimeout(() => { if (!busy) draw(); }, 700);
      }
      function press(k) {
        if (busy || Date.now() < lockedUntil) return;
        if (k === 'ok') {
          if (typed.length >= 3) send();
          return;
        }
        if (k === 'back') typed = typed.slice(0, -1);
        else if (typed.length < (lock.digits || 6)) typed += k;
        note.textContent = '';
        if (lock.digits && typed.length === lock.digits) send();
        else draw();
      }
      d.addEventListener('keydown', (e) => {
        if (/^[0-9]$/.test(e.key)) press(e.key);
        else if (e.key === 'Backspace') press('back');
        else if (e.key === 'Enter' && !lock.digits) press('ok');
        else return;
        e.preventDefault();
      });
      d.addEventListener('close', () => clearTimeout(timer));
      draw();
      d.showModal();
    }

    /**
     * A popover under its button: opens and closes with the button; a tap elsewhere closes it, also in a widget (a frame
     * takes the page's focus, not its pointer events), and Escape, back to the button.
     */
    function popover(wrap, trigger, pop, opened, picker) {
      pop.hidden = true;
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      const outside = (e) => { if (!wrap.contains(/** @type {Node} */ (e.target))) close(); };
      const escape = (e) => { if (e.key === 'Escape') { close(); trigger.focus(); } };
      // `picker`: a field whose system dialog takes the window's focus and shouldn't close this. A tap in a widget moves
      // the page's focus to its frame, a moment after the blur in some browsers.
      const blurred = () => {
        if (!picker) close();
        else setTimeout(() => { if (document.activeElement !== picker) close(); });
      };
      function open() {
        pop.hidden = false;
        pop.style.left = '';
        const over = pop.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
        if (over > 0) pop.style.left = `${-over}px`; // kept inside a narrow window
        trigger.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', escape, true);
        window.addEventListener('blur', blurred);
        if (opened) opened();
      }
      function close() {
        pop.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', outside, true);
        document.removeEventListener('keydown', escape, true);
        window.removeEventListener('blur', blurred);
      }
      return { open, close, toggle() { if (pop.hidden) open(); else close(); } };
    }

    /**
     * The viewing bar's title with the way to the other dashboards: a list in the front page's order and sections. Only
     * a name while there are no others. Leaving a dashboard with a code takes the code, as its back button does.
     */
    function dashboardJump(d) {
      if (wd.dashboards.length < 2) return null;
      const wrap = el('span', 'wd-jump');
      const trigger = button('wd-jump-button', '', () => menu.toggle(), t('dashboards'));
      const chevron = icon('down');
      trigger.append(el('span', 'wd-bar-title', d.name || t('untitled')), chevron);
      const pop = el('nav', 'wd-jump-list');
      pop.setAttribute('aria-label', t('dashboards'));
      const row = (other) => {
        const link = el('a', `wd-jump-row${other.id === d.id ? ' on' : ''}`);
        link.href = `#/d/${other.id}`;
        link.append(el('span', 'wd-jump-name', other.name || t('untitled')));
        if (other.id === d.id) {
          link.setAttribute('aria-current', 'page');
          link.append(icon('check'));
        }
        link.addEventListener('click', (e) => {
          menu.close();
          if (other.id === d.id) { e.preventDefault(); return; }
          if (!lockOf(d)) return;
          e.preventDefault();
          askCode(d, () => { storageSet(STAY_STORAGE, null); location.hash = link.getAttribute('href'); });
        });
        return link;
      };
      const sections = (wd.frontPage && wd.frontPage.sections) || [];
      const inSection = (x, id) => (sections.some(s => s.id === x.section) ? x.section : '') === id;
      const loose = wd.dashboards.filter(x => inSection(x, ''));
      if (sections.length && loose.length) pop.append(el('h2', 'wd-jump-head', t('yourDashboards')));
      pop.append(...loose.map(row));
      for (const section of sections) {
        const inIt = wd.dashboards.filter(x => inSection(x, section.id));
        if (!inIt.length) continue;
        pop.append(el('h2', 'wd-jump-head', section.name || t('untitled')), ...inIt.map(row));
      }
      wrap.append(trigger, pop);
      const menu = popover(wrap, trigger, pop, () => {
        const on = /** @type {HTMLElement} */ (pop.querySelector('.on'));
        if (on) { on.focus(); on.scrollIntoView({ block: 'nearest' }); }
      });
      return wrap;
    }

    function viewBar() {
      const d = wd.current.dashboard;
      const back = el('a', 'wd-icon wd-back');
      back.append(icon('left'));
      back.href = '#/';
      back.title = t('dashboards');
      back.setAttribute('aria-label', t('dashboards'));
      // With a code, going back to the dashboards and editing take it first (`route()` holds to it for a typed address).
      back.addEventListener('click', (e) => {
        if (!lockOf(d)) return;
        e.preventDefault();
        askCode(d, () => { storageSet(STAY_STORAGE, null); location.hash = '#/'; });
      });
      const items = [back, dashboardJump(d) || el('span', 'wd-bar-title', d.name || t('untitled')), el('span', 'wd-spacer'), liveNote()];
      // Safari on an iPad only has the webkit-prefixed calls.
      const doc = /** @type {any} */ (document.documentElement);
      const page = /** @type {any} */ (document);
      if (doc.requestFullscreen || doc.webkitRequestFullscreen) {
        const full = button('wd-icon wd-full-toggle', '', () => {
          if (page.fullscreenElement || page.webkitFullscreenElement) {
            (page.exitFullscreen || page.webkitExitFullscreen).call(page);
          } else {
            (doc.requestFullscreen || doc.webkitRequestFullscreen).call(doc);
          }
        }, t('fullScreen'));
        full.append(icon(page.fullscreenElement || page.webkitFullscreenElement ? 'fullScreenExit' : 'fullScreen'));
        items.push(full);
      }
      const sync = wd.syncBarButton(d.id); // synced with a Homey dashboard: its state, and a tap syncs now
      if (sync) items.push(sync);
      const edit = el('a', 'wd-icon wd-bar-edit');
      edit.href = `#/d/${d.id}/edit`;
      edit.title = t('edit');
      edit.setAttribute('aria-label', t('edit'));
      edit.append(icon('pen'));
      edit.addEventListener('click', (e) => {
        if (!lockOf(d)) return;
        e.preventDefault();
        askCode(d, () => { unlocked.add(d.id); location.hash = `#/d/${d.id}/edit`; });
      });
      items.push(edit);
      const node = bar(...items);
      node.classList.add('wd-bar-view');
      return node;
    }

    function editBar() {
      const d = wd.current.dashboard;
      const name = el('input', 'wd-input wd-name');
      name.value = d.name;
      name.placeholder = t('untitled');
      name.setAttribute('aria-label', t('name'));
      // current.dashboard, not d, when it changes: a save the app corrected swaps it for the app's copy.
      name.addEventListener('change', () => { const dash = wd.current.dashboard; dash.name = name.value.trim(); setTitle(dash); persist(); });

      // The columns: one pill with its icon, − the count +.
      const cols = el('span', 'wd-stepper');
      const fewer = button('wd-step wd-fewer', '', () => setColumns(wd.current.dashboard.columns.length - 1), t('columns'));
      const more = button('wd-step wd-more', '', () => setColumns(wd.current.dashboard.columns.length + 1), t('columns'));
      fewer.append(icon('minus'));
      more.append(icon('plus'));
      cols.append(icon('columns'), fewer, el('span', 'wd-count', String(d.columns.length)), more);
      cols.title = t('columns');

      const theme = el('select', 'wd-theme');
      theme.setAttribute('aria-label', t('theme'));
      for (const [id, label] of [['auto', 'themeAuto'], ['dark', 'themeDark'], ['light', 'themeLight']]) {
        const o = el('option', null, t(label));
        o.value = id;
        theme.append(o);
      }
      theme.value = d.theme;
      // In a pill with the theme's icon, as the columns' and the backdrop's have theirs.
      const themePick = el('span', 'wd-themepick');
      const themeIcon = el('span', 'wd-themepick-icon');
      const drawThemeIcon = () => themeIcon.replaceChildren(icon({ dark: 'moon', light: 'sun' }[theme.value] || 'contrast'));
      drawThemeIcon();
      themePick.append(themeIcon, theme);
      theme.addEventListener('change', () => {
        drawThemeIcon();
        wd.current.dashboard.theme = theme.value;
        storageSet(THEME_STORAGE, null); // this browser's own dark or light would hide the choice
        applyTheme(theme.value, wd.current.dashboard.background);
        persist();
        syncGrid();
        drawBackground();
      });

      // The columns' width, drawn as the Theme's pill.
      const width = el('select', 'wd-theme');
      width.setAttribute('aria-label', t('columnWidth'));
      width.title = t('columnWidth');
      for (const [id, label] of [['narrow', 'columnNarrow'], ['normal', 'columnNormal'], ['wide', 'columnWide'], ['fit', 'columnFit']]) {
        const o = el('option', null, t(label));
        o.value = id;
        width.append(o);
      }
      width.value = COLUMN_WIDTHS[d.columnWidth] ? d.columnWidth : 'normal';
      const widthPick = el('span', 'wd-themepick');
      const widthIcon = el('span', 'wd-themepick-icon');
      widthIcon.append(icon('width'));
      widthPick.append(widthIcon, width);
      width.addEventListener('change', () => {
        if (width.value === 'normal') delete wd.current.dashboard.columnWidth;
        else wd.current.dashboard.columnWidth = width.value;
        persist();
        syncGrid();
      });

      // The backdrop: a button with the current one's swatch, opening the palette under it.
      const bgPick = el('span', 'wd-bgpick');
      const bgButton = button('wd-btn wd-bgbutton', '', () => palette.toggle(), t('background'));
      const pop = el('div', 'wd-bgpop');
      bgPick.append(bgButton, pop);
      // The tints, then the user's own colour (the browser's colour picker, shown live and saved when it's done).
      const presets = el('div');
      const customField = /** @type {HTMLInputElement} */ (el('input', 'wd-bgcustom-field'));
      customField.type = 'color';
      const customHex = el('span', 'wd-bgcustom-hex');
      const customRow = el('label', 'wd-bgcustom');
      customRow.append(customField, el('span', null, t('bgCustom')), customHex);
      const customHint = el('div', 'wd-bgcustom-hint', t('bgHardToRead'));
      pop.append(presets, customRow, customHint);
      const palette = popover(bgPick, bgButton, pop, () => {
        /** @type {HTMLElement} */ (pop.querySelector('.wd-swatch.on') || customField).focus();
      }, customField);
      const backgrounds = Object.keys(BACKGROUNDS).map(id => ({ id, title: t(`bg${id[0].toUpperCase()}${id.slice(1)}`) }));
      function drawBackground() {
        const current = wd.current.dashboard.background || 'default';
        const custom = CUSTOM_BACKGROUND.test(current);
        const shown = wd.backdrop(current);
        bgButton.replaceChildren(wd.swatch(shown, 'small'), el('span', 'wd-bar-label', t('background')));
        // Each swatch shows both its shades (the dark tints alone look alike): the theme picks one.
        const colours = Object.fromEntries(backgrounds.map(b => [b.id, `linear-gradient(135deg, ${BACKGROUNDS[b.id][0]} 50%, ${BACKGROUNDS[b.id][1]} 50%)`]));
        presets.replaceChildren(wd.choiceGroup(null, backgrounds, current, (id) => {
          wd.current.dashboard.background = id;
          applyTheme(wd.current.dashboard.theme, id);
          persist();
          drawBackground();
          palette.close();
          bgButton.focus();
        }, true, colours));
        if (customField.value !== shown) customField.value = shown; // not while it's being picked: it's the same then
        customRow.classList.toggle('on', custom);
        customHex.textContent = custom ? current.toUpperCase() : '';
        customHint.hidden = !custom || !hardToRead(current, wd.isDark());
      }
      const pickCustom = () => {
        wd.current.dashboard.background = customField.value.toLowerCase();
        applyTheme(wd.current.dashboard.theme, wd.current.dashboard.background);
        drawBackground();
      };
      customField.addEventListener('input', pickCustom);
      customField.addEventListener('change', () => { pickCustom(); persist(); });
      drawBackground();

      // The code editing and going back to the dashboards take: none, Any code or one of the Keypad codes (only once
      // there are some, made on the app settings page).
      const codes = (wd.setup && wd.setup.codes) || [];
      const codePick = el('span', 'wd-themepick');
      if (codes.length) {
        const code = el('select', 'wd-theme');
        code.setAttribute('aria-label', t('code'));
        code.title = t('codeTitle');
        for (const [id, label] of [['', t('codeNone')], ['any', t('codeAny')], ...codes.map(c => [c.id, c.name])]) {
          const o = el('option', null, label);
          o.value = id;
          code.append(o);
        }
        code.value = lockOf(d) ? d.code.id : '';
        const codeIcon = el('span', 'wd-themepick-icon');
        codeIcon.append(icon('lock'));
        codePick.append(codeIcon, code);
        code.addEventListener('change', () => {
          const c = codes.find(x => x.id === code.value);
          if (code.value) wd.current.dashboard.code = { id: code.value, name: c ? c.name : t('codeAny') };
          else delete wd.current.dashboard.code;
          persist();
        });
      } else {
        codePick.hidden = true;
      }

      // A bin, as on the front page's cards: red once armed.
      const remove = confirmButton('wd-icon wd-bar-delete', icon('trash'), () => wd.deleteDashboard(d.id, () => { location.hash = '#/'; }), t('tapAgain'), t('deleteDashboard'));

      const done = el('a', 'wd-btn primary', t('done'));
      done.href = `#/d/${d.id}`;
      // Once the queued saves are in, and only if they worked: a failed one stays here with its message.
      done.addEventListener('click', (e) => {
        e.preventDefault();
        (wd.hasSaveProblem() ? persist() : wd.saving).then(() => {
          if (wd.hasSaveProblem() || !wd.current || !wd.current.editing || wd.current.dashboard.id !== d.id) return;
          location.hash = done.getAttribute('href');
        });
      });
      // The end of the bar stays together when a narrow window wraps it.
      const end = el('span', 'wd-bar-end');
      end.append(remove, done);
      const b = bar(name, el('span', 'wd-bar-rule'), cols, widthPick, themePick, bgPick, codePick, wd.syncPill(d), end);
      stepColumns(b);
      return b;
    }

    /** The columns' count and its − and + (one column at least, six at most). */
    function stepColumns(scope) {
      const n = wd.current.dashboard.columns.length;
      const count = scope.querySelector('.wd-count');
      if (count) count.textContent = String(n);
      const fewer = /** @type {HTMLButtonElement} */ (scope.querySelector('.wd-fewer'));
      const more = /** @type {HTMLButtonElement} */ (scope.querySelector('.wd-more'));
      if (fewer) fewer.disabled = n <= 1;
      if (more) more.disabled = n >= 6;
    }

    function setColumns(n) {
      const d = wd.current.dashboard;
      if (n < 1 || n > 6) return;
      const change = () => {
        while (d.columns.length < n) d.columns.push([]);
        while (d.columns.length > n) {
          const last = d.columns.pop();
          d.columns[d.columns.length - 1].push(...last.filter(e => !e.cover)); // its widgets stay, in the column before
        }
        persist();
        syncGrid();
      };
      // + doesn't part them again, nor give a wide widget back its width. An empty column has nothing to put back.
      if (n < d.columns.length && d.columns[d.columns.length - 1].length) wd.withUndo('columnRemoved', change);
      else change();
    }

    /**
     * Brings the grid in line with the dashboard: a widget whose frame signature didn't change keeps its element
     * (and so its running frame, unless it has to move: moving an iframe reloads it).
     */
    function syncGrid() {
      if (!wd.current) return;
      if (wd.drag) wd.endDrag(false); // its widget may be rebuilt
      if (wd.resizing) wd.endResize(false);
      tidyCovers();
      stepColumns(root);
      const { dashboard, grid, widgets, covers, editing } = wd.current;
      const count = dashboard.columns.length;
      grid.style.setProperty('--cols', String(count));
      grid.style.setProperty('--wd-col-max', COLUMN_WIDTHS[dashboard.columnWidth] || COLUMN_WIDTHS.normal);
      while (grid.children.length < count) grid.append(el('section', 'wd-col'));
      while (grid.children.length > count) grid.lastChild.remove();
      const seen = new Set();
      const coversSeen = new Set();
      dashboard.columns.forEach((column, c) => {
        const col = grid.children[c];
        const nodes = column.map((w, i) => {
          if (w.cover) {
            // The room a wide widget from the left takes in this column (`layoutWide()` sizes it).
            const key = `${w.cover}@${c}`;
            coversSeen.add(key);
            if (!covers.has(key)) covers.set(key, el('div', 'wd-cover'));
            return covers.get(key);
          }
          seen.add(w.id);
          const sig = signature(w);
          let entry = widgets.get(w.id);
          if (!entry || entry.sig !== sig) {
            if (entry) { entry.el.remove(); wd.sizes.unobserve(entry.el); }
            entry = { el: wd.widgetElement(w), sig };
            widgets.set(w.id, entry);
            wd.sizes.observe(entry.el);
          }
          const span = LAYOUT.spanOf(w, c, count);
          entry.el.classList.toggle('wide', span > 1);
          if (span > 1) entry.el.style.setProperty('--span', String(span));
          else entry.el.style.removeProperty('--span');
          wd.setTools(entry.el, w, c, i, column.length);
          return entry.el;
        });
        if (editing) {
          let add = col.querySelector(':scope > .wd-add');
          if (!add) add = button('wd-add', `+ ${t('addWidget')}`, () => {});
          add.onclick = () => wd.chooseWidget(c);
          nodes.push(add);
        } else if (!column.length) {
          nodes.push(el('div', 'wd-empty'));
        }
        // Only what's out of place moves: what left the column goes first, so the widgets after it stay put (a moved
        // frame reloads).
        for (const child of [...col.children]) if (!nodes.includes(child)) child.remove();
        nodes.forEach((node, i) => { if (col.children[i] !== node) col.insertBefore(node, col.children[i] || null); });
      });
      for (const [id, entry] of widgets) {
        if (seen.has(id)) continue;
        entry.el.remove();
        wd.sizes.unobserve(entry.el);
        widgets.delete(id);
      }
      for (const key of covers.keys()) if (!coversSeen.has(key)) covers.delete(key);
      wd.sweepFrames();
      wd.layoutWide();
    }

    /**
     * Keeps the covers in line with the widgets: a span no further than the last column, one cover in each column a
     * wide widget covers (a missing one at the column's end), none elsewhere.
     */
    function tidyCovers() {
      const columns = wd.current.dashboard.columns;
      const wide = new Map();
      columns.forEach((column, c) => column.forEach((w) => {
        if (w.cover) return;
        const span = LAYOUT.spanOf(w, c, columns.length);
        if (span > 1) { w.span = span; wide.set(w.id, { c, span }); } else { delete w.span; delete w.at; }
      }));
      columns.forEach((column, k) => {
        const seen = new Set();
        const keep = column.filter((e) => {
          if (!e.cover) return true;
          const o = wide.get(e.cover);
          if (!o || k <= o.c || k >= o.c + o.span || seen.has(e.cover)) return false;
          seen.add(e.cover);
          return true;
        });
        for (const [id, o] of wide) if (k > o.c && k < o.c + o.span && !seen.has(id)) keep.push({ cover: id });
        column.splice(0, column.length, ...keep);
      });
    }

    Object.assign(wd, { about, applyTheme, askCode, bar, brand, clearRoot, dashboardJump, editable, liveNote, lockOf, preview,
      renderDashboard, renderFailed, renderKey, renderMissing, renderOff, renderPassword, signOut, stored, syncGrid,
      widgetFolder });
  });
})();
