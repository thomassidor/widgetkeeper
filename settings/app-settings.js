/**
 * The app's settings, one definition for two pages: the app settings page (`settings/index.html`, in Homey's app and
 * my.homey.app) folds each card into a `<details>`; the web dashboards page puts each in a tab of its Settings dialog
 * (`settings/dashboard-app.js`). Both give `cards()` a Homey of their own (`api`, `get`, `set`, `__`, optionally
 * `openURL`: the settings page its real one, the web page one that goes through `POST /web/app-settings`) and a skin,
 * the class names and checkbox markup of their own controls. The cards' content is styled by `app-settings.css`.
 *
 * `cards(Homey, {skin, web, away})` → `[{id, title, line, body, opened()}]`: `title` the strings key of the card's
 * title, `line` the element with where it stands (its `ok` class ticks it), `body` its content, `opened()` called when
 * the card is first shown (Diagnostics reads its report then). With `web`, the Web dashboards card leaves out its
 * on/off switch (turning them off there would lock the page out) and the backup's pointer (it's on that page); with
 * `away` too (the page opened through Homey's cloud), Remote access (turning it off there would do the same).
 */
(function () {
  /** The app settings page's controls: Homey's settings classes. */
  const HOMEY_SKIN = {
    button: kind => `homey-button-${kind || 'secondary'}-small-shadow`,
    input: 'homey-form-input',
    select: 'homey-form-select',
    group: 'homey-form-group',
    label: 'homey-form-label',
    checkbox: (id, key, cls = '', value = '') => `<label class="homey-form-checkbox">
        <input class="homey-form-checkbox-input${cls ? ` ${cls}` : ''}" id="${id}"${value ? ` value="${value}"` : ''} type="checkbox" disabled>
        <span class="homey-form-checkbox-checkmark"></span>
        <span class="homey-form-checkbox-text" data-i18n="${key}"></span>
      </label>`,
  };

  /** The cards in their order, by id and title key. */
  const CARDS = [
    { id: 'varCard', title: 'varTitle' },
    { id: 'namesCard', title: 'namesTitle' },
    { id: 'timeCard', title: 'timeTitle' },
    { id: 'tempCard', title: 'tempTitle' },
    { id: 'lookCard', title: 'lookTitle' },
    { id: 'kpCard', title: 'kpTitle' },
    { id: 'webCard', title: 'webTitle' },
    { id: 'updCard', title: 'updTitle' },
    { id: 'diagCard', title: 'title' },
  ];

  /** Each card's content, in the skin's controls. */
  function markup(s, web, away) {
    const field = (id, type, label, more = '') => `<div class="${s.group}">
          <input class="${s.input}" id="${id}" type="${type}" data-i18n-label="${label}"${more}>
        </div>`;
    const grouped = (groupId, id, type, label, more = '') => `<div class="${s.group}" id="${groupId}">
          <input class="${s.input}" id="${id}" type="${type}" data-i18n-label="${label}"${more}>
        </div>`;
    const button = (kind, id, key, more = '') => `<button class="${s.button(kind)}" id="${id}" data-i18n="${key}"${more}></button>`;
    const address = which => `<div class="web-address" data-address="${which}" hidden>
            <a class="web-url" target="_blank" rel="noopener"></a>
            <div class="row">
              <button class="${s.button('primary')}" data-act="open" data-i18n="webOpen"></button>
              <button class="${s.button()}" data-act="copy" data-i18n="copy"></button>
            </div>
            <p class="help status" role="status"></p>
          </div>`;
    return {
      // The personal API key: what the app's own token may not do (variables, flows, speaker actions, dashboards, Moods).
      varCard: `
      <p class="help" data-i18n="varHelp"></p>
      <!-- Each feature and the permission it needs, as the Homey web app's API Keys page names it (README: API key). -->
      <div class="sub">
        <p class="sub-title" data-i18n="varPermsTitle"></p>
        <ul class="perms">
          <li><span data-i18n="varForVariables"></span> <strong data-i18n="varTickVariables"></strong></li>
          <li><span data-i18n="varForFlows"></span> <strong data-i18n="varTickFlows"></strong></li>
          <li><span data-i18n="varForCards"></span> <strong data-i18n="varTickCards"></strong></li>
          <li><span data-i18n="varForMoods"></span> <strong data-i18n="varTickMoods"></strong></li>
          <li><span data-i18n="varForStack"></span> <strong data-i18n="varTickStack"></strong></li>
        </ul>
        <p class="help" data-i18n="varNoKey"></p>
      </div>
      <!-- Without a key, the field; with one, Replace key (the field again) and Remove. -->
      <div class="sub">
        <p class="state warn" id="varState" role="status" hidden></p>
        <div id="varForm" hidden>
          ${field('varKey', 'password', 'varKey', ' autocomplete="off" spellcheck="false"')}
          <div class="row">
            ${button('primary', 'varSave', 'varSave', ' disabled')}
            ${button('secondary', 'varCancel', 'cancel', ' hidden')}
          </div>
        </div>
        <div class="row" id="varActions" hidden>
          ${button('secondary', 'varReplace', 'varReplace')}
          ${button('danger', 'varRemove', 'varRemove')}
        </div>
        <p class="help status" id="varStatus" role="status"></p>
      </div>`,

      // How every widget shows names of devices, and of rooms and Flows where ticked: the whole name or a part of it
      // (`lib/deviceNames.ts`), with what that does to the Homey's own names. Widget settings, Flow tokens and typed
      // tile names keep theirs.
      namesCard: `
      <p class="help" data-i18n="namesHelp"></p>
      <div class="${s.group}">
        <label class="${s.label}" for="namesMode" data-i18n="namesShow"></label>
        <select class="${s.select}" id="namesMode" disabled>
          <option value="full" data-i18n="namesFull"></option>
          <option value="before" data-i18n="namesBefore"></option>
          <option value="after" data-i18n="namesAfter"></option>
          <option value="lastWord" data-i18n="namesLastWord"></option>
          <option value="room" data-i18n="namesRoom"></option>
        </select>
      </div>
      <div class="${s.group}" id="namesSepGroup" hidden>
        <label class="${s.label}" for="namesSep" data-i18n="namesSeparator"></label>
        <input class="${s.input}" id="namesSep" type="text" maxlength="5" autocomplete="off" spellcheck="false">
        <p class="help" data-i18n="namesSepHelp"></p>
      </div>
      <div class="${s.group}" id="namesApplyGroup" hidden>
        <p class="sub-title" data-i18n="namesApply"></p>
        ${s.checkbox('namesDevices', 'namesDevices', 'names-kind', 'devices')}
        ${s.checkbox('namesRooms', 'namesRooms', 'names-kind', 'rooms')}
        ${s.checkbox('namesFlows', 'namesFlows', 'names-kind', 'flows')}
        <p class="help" id="namesRoomOnly" data-i18n="namesRoomOnly" hidden></p>
      </div>
      <p class="help" id="namesCount"></p>
      <ul class="names-examples" id="namesExamples"></ul>
      <p class="help status" id="namesStatus" role="status"></p>`,

      // How every widget shows times: 24 or 12 hours, or as the screen's language does (`lib/timeFormat.ts`; 1.3.0, it
      // replaced the widgets' own Time format setting).
      timeCard: `
      <p class="help" data-i18n="timeHelp"></p>
      <div class="${s.group}">
        <select class="${s.select}" id="timeFormat" disabled data-i18n-label="timeTitle">
          <option value="auto" data-i18n="timeAuto"></option>
          <option value="24" data-i18n="time24"></option>
          <option value="12" data-i18n="time12"></option>
        </select>
      </div>
      <p class="help status" id="timeStatus" role="status"></p>`,

      // The unit every widget shows temperatures in: °C, °F, or the Homey's units (`lib/temperatureUnit.ts`; 1.3.2).
      tempCard: `
      <p class="help" data-i18n="tempHelp"></p>
      <div class="${s.group}">
        <select class="${s.select}" id="temperatureUnit" disabled data-i18n-label="tempTitle">
          <option value="auto" data-i18n="tempAuto"></option>
          <option value="c" data-i18n="tempC"></option>
          <option value="f" data-i18n="tempF"></option>
        </select>
      </div>
      <p class="help status" id="tempStatus" role="status"></p>`,

      // How the widgets look, for the whole app: the light-mode tile shadow (`tileShadow`, on unless turned off;
      // `lib/tileShadow.ts`, kit.css's `--wk-tile-shadow`; issue #20, 1.3.1).
      lookCard: `
      <p class="help" data-i18n="lookHelp"></p>
      ${s.checkbox('lookShadow', 'lookShadow')}
      <p class="help status" id="lookStatus" role="status"></p>`,

      // The Keypad's codes: a name and the digits, typed twice; the app keeps only an HMAC of each and never sends it back.
      kpCard: `
      <p class="help" data-i18n="kpHelp"></p>
      <ul class="kp-codes" id="kpList"></ul>
      <div class="row" id="kpActions">
        ${button('primary', 'kpNew', 'kpAdd')}
      </div>
      <!-- Add code or a row's Change opens it. -->
      <div id="kpForm" hidden>
        <p class="kp-changing" id="kpChanging" hidden></p>
        ${grouped('kpNameGroup', 'kpName', 'text', 'kpName', ' maxlength="40" autocomplete="off" spellcheck="false"')}
        <!-- Changing a code takes its current one, adding one any code already made: anyone whose key may call the app
             reaches the routes. -->
        <div class="${s.group}" id="kpCurrentGroup" hidden>
          <input class="${s.input}" id="kpCurrent" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" data-i18n-label="kpCurrent">
        </div>
        ${field('kpCode', 'password', 'kpCode', ' inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password"')}
        ${field('kpAgain', 'password', 'kpAgain', ' inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password"')}
        <div class="row">
          ${button('primary', 'kpSave', 'kpAdd', ' disabled')}
          ${button('secondary', 'kpCancel', 'cancel')}
        </div>
      </div>
      <p class="help status" id="kpStatus" role="status"></p>`,

      // Web dashboards: on or off, then in the order a person sets them up: the address, a browser or screen signed in,
      // then away from home with the password that guards it, and where the backup is.
      webCard: `
      <p class="help" data-i18n="webHelp"></p>
      <div${web ? ' hidden' : ''}>${s.checkbox('webEnabled', 'webEnable')}</div>
      <p class="help status" id="webStatus" role="status"></p>
      <div id="webOn" hidden>
        <div class="sub">
          <p class="sub-title" data-i18n="webAddressHome"></p>
          ${address('url')}
        </div>
        <!-- Screens and browsers: the way any browser signs in (a wall tablet, a phone, a Nest Hub cast to): a key made
             for each, swapped for a short sign-in code the page takes typed or in its address (#code=). The code is shown
             once; New code makes another (with the key pasted again: the app never hands a stored key to a caller). -->
        <div class="sub">
          <p class="sub-title" data-i18n="webScreens"></p>
          <p class="help" data-i18n="webScreensHelp"></p>
          <ul class="kp-codes scr-list" id="scrList"></ul>
          <div id="scrForm" hidden>
            <p class="kp-changing" id="scrRenewing" hidden></p>
            <!-- Making the key, step by step: the screen's key needs Devices, which the API key card's list doesn't. -->
            <ol class="steps">
              <li data-i18n="webScreenStep1"></li>
              <li><span data-i18n="webScreenStep2"></span> <strong class="tick" data-i18n="webScreenTickDevices"></strong><span class="help" data-i18n="webScreenStep2More"></span></li>
              <li data-i18n="webScreenStep3"></li>
            </ol>
            ${grouped('scrNameGroup', 'scrName', 'text', 'webScreenName', ' maxlength="40" autocomplete="off"')}
            ${field('scrKey', 'password', 'webScreenKey', ' autocomplete="off" spellcheck="false"')}
            <div class="${s.group}" id="scrCurrentGroup" hidden>
              <input class="${s.input}" id="scrCurrent" type="password" autocomplete="current-password" spellcheck="false" data-i18n-label="webPasswordCurrent">
            </div>
            <div class="row">
              ${button('primary', 'scrSave', 'webScreenSave', ' disabled')}
              ${button('secondary', 'scrCancel', 'cancel')}
            </div>
          </div>
          <div id="scrShown" hidden>
            <p class="state" id="scrShownTitle"></p>
            <p class="scr-code" id="scrCode"></p>
            <p class="help" data-i18n="webScreenOnce"></p>
            <p class="help" id="scrNoDevices" data-i18n="webScreenNoDevices" hidden></p>
            <div id="scrAddresses"></div>
            <div class="row">
              ${button('primary', 'scrDone', 'webScreenDone')}
            </div>
          </div>
          <div class="row" id="scrActions">
            ${button('secondary', 'scrNew', 'webScreenAdd')}
          </div>
          <p class="help status" id="scrStatus" role="status"></p>
        </div>
        <!-- Away from home through Homey's cloud, and the password: an extra sign-in every browser makes once, most worth
             it with remote access on. Setting or changing it keeps the screens above signed in. -->
        <div class="sub">
          <p class="sub-title" data-i18n="webAddressAway"></p>
          <div${away ? ' hidden' : ''}>
            ${s.checkbox('webRemote', 'webRemoteEnable')}
            <p class="help" data-i18n="webRemoteHelp"></p>
          </div>
          <p class="help status" id="webRemoteStatus" role="status"></p>
          ${address('remoteUrl')}
          <div class="sub-part">
            <p class="sub-title" data-i18n="webPassword"></p>
            <p class="help" data-i18n="webPasswordHelp"></p>
            <p class="state" id="pwState" role="status" data-i18n="webPasswordIsSet" hidden></p>
            <!-- Set or Change password opens it for a new one; Remove password for the current one only. While one is
                 set, both take the current one: anyone whose key may call the app reaches the route. -->
            <div id="pwForm" hidden>
              <div class="${s.group}" id="pwCurrentGroup" hidden>
                <input class="${s.input}" id="pwCurrent" type="password" autocomplete="current-password" spellcheck="false" data-i18n-label="webPasswordCurrent">
              </div>
              ${grouped('pwNewGroup', 'webPassword', 'password', 'webPassword', ' autocomplete="new-password" spellcheck="false"')}
              <div class="row">
                ${button('primary', 'pwSave', 'webPasswordSave', ' disabled')}
                ${button('secondary', 'pwCancel', 'cancel')}
              </div>
            </div>
            <div class="row" id="pwActions">
              ${button('secondary', 'pwSet', 'webPasswordSave')}
              ${button('danger', 'pwRemove', 'webPasswordRemove', ' hidden')}
            </div>
            <p class="help status" id="pwStatus" role="status"></p>
            <p class="help" id="pwForgot" data-i18n="webPasswordForgot" hidden></p>
          </div>
        </div>
        <!-- The backup is on the web dashboards page: my.homey.app runs this page in a frame that can't download a file. -->
        <div class="sub"${web ? ' hidden' : ''}><p class="help" data-i18n="webBackupHelp"></p></div>
      </div>`,

      // Whether a feature release (a new major or minor version, not a fix) is posted to Homey's Timeline after the
      // update (`timelineUpdates`, on unless turned off; `lib/UpdateNotice.ts`).
      updCard: `
      <p class="help" data-i18n="updHelp"></p>
      ${s.checkbox('updTimeline', 'updEnable')}
      <p class="help status" id="updStatus" role="status"></p>`,

      diagCard: `
      <p class="help" data-i18n="subtitle"></p>
      <div class="${s.group}">
        <label class="${s.label}" for="device" data-i18n="includeDevice"></label>
        <select class="${s.select}" id="device"><option value="" data-i18n="none"></option></select>
      </div>
      <div class="row">
        ${button('primary', 'copy', 'copy')}
        ${button('secondary', 'share', 'share', ' hidden')}
        ${button('secondary', 'refresh', 'refresh')}
      </div>
      <p class="help status" id="status" role="status"></p>
      <textarea class="report" id="report" readonly></textarea>`,
    };
  }

  function cards(Homey, opts = {}) {
    const skin = opts.skin || HOMEY_SKIN;
    const web = !!opts.web;
    const html = markup(skin, web, web && !!opts.away);
    // Every card in one tree while it's wired, so the lookups below find their elements; the page moves them after.
    const root = document.createElement('div');
    const made = CARDS.map((c) => {
      const line = document.createElement('span');
      line.className = 'card-line';
      line.id = c.id.replace(/Card$/, 'Line');
      if (c.id === 'diagCard') { line.removeAttribute('id'); line.dataset.i18n = 'diagLine'; }
      const body = document.createElement('div');
      body.className = 'card-body wk-as';
      body.dataset.card = c.id;
      body.innerHTML = html[c.id];
      root.append(line, body);
      return { id: c.id, title: c.title, line, body, opened: () => {} };
    });
    const byId = new Map([...root.querySelectorAll('[id]')].map(node => [node.id, node]));
    /** @type {(id: string) => any} */
    const $ = id => byId.get(id);
    /** @type {(selector: string) => any[]} */
    const all = selector => [...root.querySelectorAll(selector)];
    const t = (key, tokens) => Homey.__(`settings.${key}`, tokens);
    for (const node of all('[data-i18n]')) node.textContent = t(node.dataset.i18n);
    for (const node of all('[data-i18n-label]')) {
      node.setAttribute('aria-label', t(node.dataset.i18nLabel));
      node.placeholder = t(node.dataset.i18nLabel);
    }
    const card = id => made.find(c => c.id === id);
    /** A card's line under its title, ticked when it's set up. */
    function setLine(id, text, ok) {
      $(id).textContent = text;
      $(id).classList.toggle('ok', !!ok);
    }
    /** Opens a form in place of the buttons that open it, or closes it. */
    function showForm(form, actions, on) {
      form.hidden = !on;
      actions.hidden = on;
    }
    const newButton = (key, kind) => {
      const b = document.createElement('button');
      b.className = skin.button(kind);
      b.textContent = t(key);
      return b;
    };

    /**
     * Copies text, falling back to a selection where the Homey app's web view (or the home address, not a secure
     * context) doesn't allow the async clipboard: `from` (a text field), else a field of its own for the moment, in
     * the open dialog if there is one (outside a modal dialog it can't be focused). Answers whether it was copied.
     */
    async function copyText(text, from) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        const field = from || document.createElement('textarea');
        if (!from) {
          field.value = text;
          field.setAttribute('readonly', '');
          field.style.position = 'fixed';
          field.style.opacity = '0';
          const active = document.activeElement;
          ((active && active.closest && active.closest('dialog')) || document.body).append(field);
        }
        field.focus();
        field.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
        if (!from) field.remove();
        return ok;
      }
    }

    // ---- The personal API key: checked by the app before it's saved, and never sent back. ----
    const varKey = $('varKey');
    const varSave = $('varSave');
    const varRemove = $('varRemove');
    const varStatus = $('varStatus');
    const varForm = $('varForm');
    const varActions = $('varActions');
    let busy = false;
    let keySet = false;
    const syncKeyButtons = () => { varSave.disabled = busy || !varKey.value.trim(); varRemove.disabled = busy; };
    // Without a key the field shows; with one, Replace key and Remove (Replace key opens the field with Cancel).
    function showKeyForm(on) {
      showForm(varForm, varActions, on);
      $('varCancel').hidden = !keySet;
      if (!on) varKey.value = '';
      syncKeyButtons();
    }
    function showKeyState(message) {
      Homey.api('GET', '/variables-key', null, (err, res) => {
        if (err) { showKeyForm(!keySet); return; }
        keySet = !!(res && res.set);
        $('varState').hidden = keySet;
        $('varState').textContent = t('varNotSet');
        setLine('varLine', t(keySet ? 'varIsSet' : 'varLineNone'), keySet);
        showKeyForm(!keySet);
        if (!message) varStatus.textContent = '';
      });
    }
    function saveKey(key) {
      busy = true;
      syncKeyButtons();
      varStatus.textContent = t('varChecking');
      Homey.api('PUT', '/variables-key', { key }, (err, res) => {
        busy = false;
        syncKeyButtons();
        if (err) { varStatus.textContent = err.message || String(err); return; }
        if (res && res.ok) {
          varKey.value = '';
          syncKeyButtons();
          // A key may allow only some of it (the answer says what): variables, flows, dashboards (the Smart Stack),
          // Moods (Light Controls).
          const moods = t(res.moods ? 'varMoods' : 'varNoMoods');
          if (!key) varStatus.textContent = t('varRemoved');
          else if (!res.variables && !res.flows) {
            varStatus.textContent = res.dashboards ? `${t('varSavedDashboards')} ${moods}` : t('varSavedMoods');
          } else {
            const saved = !res.variables ? 'varSavedFlows' : !res.flows ? 'varSavedVariables' : 'varSaved';
            varStatus.textContent = `${t(saved)} ${t(res.dashboards ? 'varDashboards' : 'varNoDashboards')} ${moods}`;
          }
          showKeyState(true);
        } else {
          varStatus.textContent = t(res && res.reason === 'keyScope' ? 'varKeyScope' : 'varKeyInvalid');
        }
      });
    }
    varKey.addEventListener('input', syncKeyButtons);
    varKey.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !varSave.disabled) varSave.click(); });
    varSave.addEventListener('click', () => { if (varKey.value.trim()) saveKey(varKey.value.trim()); });
    varRemove.addEventListener('click', () => saveKey(''));
    $('varReplace').addEventListener('click', () => { showKeyForm(true); varStatus.textContent = ''; varKey.focus(); });
    $('varCancel').addEventListener('click', () => { showKeyForm(false); varStatus.textContent = ''; });
    showKeyState();

    // ---- Names: how every widget shows those of devices (and of rooms and Flows, where ticked), saved at once,
    // with examples from the Homey's own. ----
    const namesMode = $('namesMode');
    const namesKinds = all('.names-kind');
    const NAME_KINDS = { devices: 'namesDevices', rooms: 'namesRooms', flows: 'namesFlows' };
    const showApply = (mode) => {
      $('namesApplyGroup').hidden = mode === 'full';
      // Leave out the room has nothing to leave out of a room's or a Flow's name.
      $('namesRoomOnly').hidden = mode !== 'room';
    };
    const namesSep = $('namesSep');
    const namesStatus = $('namesStatus');
    const NAME_MODES = { full: 'namesFull', before: 'namesBefore', after: 'namesAfter', lastWord: 'namesLastWord', room: 'namesRoom' };
    const usesSeparator = mode => mode === 'before' || mode === 'after';
    let names = null; // the app's last answer
    function showNames(res) {
      names = res;
      const mode = NAME_MODES[res.mode] ? res.mode : 'full';
      const sep = { separator: res.separator || '' };
      // Stored before the checkboxes: devices only, as it was.
      const apply = Array.isArray(res.apply) ? res.apply.filter(k => NAME_KINDS[k]) : ['devices'];
      namesMode.value = mode;
      namesMode.disabled = false;
      namesSep.value = sep.separator;
      for (const box of namesKinds) {
        box.checked = apply.includes(box.value);
        box.disabled = false;
      }
      $('namesSepGroup').hidden = !usesSeparator(mode);
      showApply(mode);
      // The line: the choice and what it applies to; nothing ticked shows every name whole.
      const kinds = (mode === 'room' ? apply.filter(k => k === 'devices') : apply).map(k => t(NAME_KINDS[k]));
      setLine('namesLine', mode === 'full' || !kinds.length ? t('namesFull')
        : `${t(usesSeparator(mode) ? `${NAME_MODES[mode]}Line` : NAME_MODES[mode], usesSeparator(mode) ? sep : undefined)} · ${kinds.join(', ')}`);
      // Without the devices (the app couldn't read them) or with full names, no examples.
      const count = mode === 'full' || !res.total ? ''
        : res.changed ? t('namesChanged', { changed: res.changed, total: res.total })
          : t(usesSeparator(mode) ? 'namesNoneSep' : 'namesNone', usesSeparator(mode) ? sep : undefined);
      $('namesCount').textContent = count;
      $('namesCount').hidden = !count;
      $('namesExamples').replaceChildren(...(mode === 'full' ? [] : res.examples || []).map((e) => {
        const row = document.createElement('li');
        const from = document.createElement('span');
        from.className = 'names-from';
        from.textContent = e.name;
        const to = document.createElement('span');
        to.className = 'names-to';
        to.textContent = e.shown;
        row.append(from, ' → ', to);
        return row;
      }));
      namesStatus.textContent = '';
    }
    function saveNames() {
      // An emptied field sends no separator: the stored one stays.
      const apply = namesKinds.filter(box => box.checked).map(box => box.value);
      const body = namesSep.value ? { mode: namesMode.value, separator: namesSep.value, apply } : { mode: namesMode.value, apply };
      namesMode.disabled = true;
      for (const box of namesKinds) box.disabled = true;
      Homey.api('PUT', '/device-names', body, (err, res) => {
        namesMode.disabled = false;
        for (const box of namesKinds) box.disabled = false;
        if (err || !res || !res.ok) {
          // The choice as it was, and why: only a refused separator is about the separator. Homey's settings bridge
          // hands an error that isn't an Error on as no answer at all, so that says so too.
          if (names) showNames(names);
          namesStatus.textContent = res && res.reason === 'separator' ? t('namesSepNeeded')
            : t('namesFailed', { error: err ? err.message || JSON.stringify(err) : res ? JSON.stringify(res) : 'no answer' });
          return;
        }
        showNames(res);
      });
    }
    namesMode.addEventListener('change', () => {
      $('namesSepGroup').hidden = !usesSeparator(namesMode.value);
      showApply(namesMode.value);
      saveNames();
    });
    for (const box of namesKinds) box.addEventListener('change', saveNames);
    namesSep.addEventListener('change', () => {
      if (!namesSep.value) { namesStatus.textContent = t('namesSepNeeded'); namesSep.value = names ? names.separator : ''; return; }
      saveNames();
    });
    namesSep.addEventListener('keydown', (e) => { if (e.key === 'Enter') namesSep.blur(); });
    Homey.api('GET', '/device-names', null, (err, res) => {
      if (err || !res) { namesStatus.textContent = err ? err.message || String(err) : ''; return; }
      showNames(res);
    });

    // ---- Time format: how every widget shows times, saved at once. ----
    const timeSelect = $('timeFormat');
    const TIME_FORMATS = { auto: 'timeAuto', 24: 'time24', 12: 'time12' };
    let timeShown = 'auto';
    function showTimeFormat(value) {
      timeShown = TIME_FORMATS[value] ? value : 'auto';
      timeSelect.value = timeShown;
      timeSelect.disabled = false;
      setLine('timeLine', t(TIME_FORMATS[timeShown]));
    }
    timeSelect.addEventListener('change', () => {
      timeSelect.disabled = true;
      $('timeStatus').textContent = '';
      Homey.api('PUT', '/time-format', { timeFormat: timeSelect.value }, (err, res) => {
        if (err || !res || !res.ok) {
          // The choice as it was, and why.
          showTimeFormat(timeShown);
          $('timeStatus').textContent = err ? err.message || String(err) : '';
          return;
        }
        showTimeFormat(res.timeFormat);
      });
    });
    Homey.api('GET', '/time-format', null, (err, res) => {
      if (err || !res) { $('timeStatus').textContent = err ? err.message || String(err) : ''; return; }
      showTimeFormat(res.timeFormat);
    });

    // ---- Temperature: the unit every widget shows, saved at once. ----
    const tempSelect = $('temperatureUnit');
    const TEMP_UNITS = { auto: 'tempAuto', c: 'tempC', f: 'tempF' };
    let tempShown = 'auto';
    function showTemperatureUnit(res) {
      tempShown = TEMP_UNITS[res.temperatureUnit] ? res.temperatureUnit : 'auto';
      tempSelect.value = tempShown;
      tempSelect.disabled = false;
      const unit = res.shown === 'f' ? '°F' : '°C';
      setLine('tempLine', tempShown === 'auto' ? t('tempAutoLine', { unit }) : unit);
    }
    tempSelect.addEventListener('change', () => {
      tempSelect.disabled = true;
      $('tempStatus').textContent = '';
      Homey.api('PUT', '/temperature-unit', { temperatureUnit: tempSelect.value }, (err, res) => {
        if (err || !res || !res.ok) {
          // The choice as it was, and why.
          tempSelect.value = tempShown;
          tempSelect.disabled = false;
          $('tempStatus').textContent = err ? err.message || String(err) : '';
          return;
        }
        showTemperatureUnit(res);
      });
    });
    Homey.api('GET', '/temperature-unit', null, (err, res) => {
      if (err || !res) { $('tempStatus').textContent = err ? err.message || String(err) : ''; return; }
      showTemperatureUnit(res);
    });

    // ---- The Keypad's codes: checked and hashed by the app, never sent back. ----
    const kpList = $('kpList');
    const kpName = $('kpName');
    const kpCurrent = $('kpCurrent');
    const kpCode = $('kpCode');
    const kpAgain = $('kpAgain');
    const kpSave = $('kpSave');
    const kpStatus = $('kpStatus');
    const kpChanging = $('kpChanging');
    let kpEditing = null; // the code whose digits are being changed
    let kpBusy = false;
    let kpCount = 0; // the codes made: adding another takes one of them
    const isCode = v => /^\d{3,6}$/.test(v);
    /** Whether the form asks for a code already made: the current one to change it, any one to add another. */
    const asksCurrent = () => !!kpEditing || kpCount > 0;
    function syncCodeButtons() {
      kpSave.disabled = kpBusy || !isCode(kpCode.value) || kpAgain.value.length < 3
        || (asksCurrent() && !kpCurrent.value) || (!kpEditing && !kpName.value.trim());
    }
    /** The field for a code already made, labelled for a change or an add. */
    function showCurrentField() {
      const key = kpEditing ? 'kpCurrent' : 'kpExisting';
      kpCurrent.setAttribute('aria-label', t(key));
      kpCurrent.placeholder = t(key);
      $('kpCurrentGroup').hidden = !asksCurrent();
    }
    // Digits only, at most six, as they're typed.
    for (const field of [kpCurrent, kpCode, kpAgain]) {
      field.addEventListener('input', () => {
        const digits = field.value.replace(/\D/g, '').slice(0, 6);
        if (digits !== field.value) field.value = digits;
        syncCodeButtons();
      });
    }
    kpName.addEventListener('input', syncCodeButtons);
    for (const field of [kpName, kpCurrent, kpCode, kpAgain]) {
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !kpSave.disabled) kpSave.click(); });
    }
    /** Why the app didn't take it (`changing` a code, or adding one). */
    function codeRefused(res, changing) {
      switch (res && res.reason) {
        case 'name': return t('kpNeedName');
        case 'nameTaken': return t('kpNameTaken');
        case 'codeTaken': return t('kpCodeTaken');
        case 'full': return t('kpFull');
        case 'missing': return t('kpGone');
        case 'wrongCode': return t(changing ? 'kpWrong' : 'kpNotACode');
        case 'locked': return t('kpLocked', { seconds: res.retryAfter || 30 });
        default: return t('kpBadCode');
      }
    }
    function codeButton(key, onClick, kind) {
      const button = newButton(key, kind);
      button.addEventListener('click', onClick);
      return button;
    }
    function showCodes(codes) {
      kpCount = codes.length;
      kpList.replaceChildren();
      setLine('kpLine', codes.length ? codes.map(c => c.name).join(', ') : t('kpNone'));
      for (const c of codes) {
        const row = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'kp-code-name';
        name.textContent = c.name;
        const digits = document.createElement('span');
        digits.className = 'kp-code-digits';
        digits.textContent = t('kpDigits', { n: c.digits });
        const remove = codeButton('kpRemove', () => removeCode(c, remove), 'danger');
        row.append(name, digits, codeButton('kpChange', () => startChange(c)), remove);
        kpList.append(row);
      }
      showCurrentField(); // the first code takes none; another, one of these
      syncCodeButtons();
    }
    function loadCodes() {
      Homey.api('GET', '/keypad-codes', null, (err, res) => { if (!err && res) showCodes(res.codes || []); });
    }
    function resetCodeForm() {
      kpEditing = null;
      kpName.value = kpCurrent.value = kpCode.value = kpAgain.value = '';
      $('kpNameGroup').hidden = false;
      showCurrentField();
      kpChanging.hidden = true;
      kpSave.textContent = t('kpAdd');
      syncCodeButtons();
    }
    const showCodeForm = on => showForm($('kpForm'), $('kpActions'), on);
    function startChange(c) {
      resetCodeForm();
      kpEditing = c;
      $('kpNameGroup').hidden = true;
      showCurrentField();
      kpChanging.textContent = t('kpChanging', { name: c.name });
      kpChanging.hidden = false;
      kpSave.textContent = t('kpSave');
      kpStatus.textContent = '';
      showCodeForm(true);
      kpCurrent.focus();
      syncCodeButtons();
    }
    function saveCode() {
      if (kpCode.value !== kpAgain.value) { kpStatus.textContent = t('kpMismatch'); return; }
      kpBusy = true;
      syncCodeButtons();
      const changing = !!kpEditing;
      const done = (err, res) => {
        kpBusy = false;
        syncCodeButtons();
        if (err) { kpStatus.textContent = err.message || String(err); return; }
        if (res && res.ok) {
          resetCodeForm();
          showCodeForm(false);
          showCodes(res.codes || []);
          kpStatus.textContent = t(changing ? 'kpChanged' : 'kpAdded');
        } else {
          kpStatus.textContent = codeRefused(res, changing);
        }
      };
      if (changing) Homey.api('PUT', `/keypad-codes/${encodeURIComponent(kpEditing.id)}`, { current: kpCurrent.value, code: kpCode.value }, done);
      else Homey.api('POST', '/keypad-codes', { name: kpName.value.trim(), code: kpCode.value, ...(kpCount ? { current: kpCurrent.value } : {}) }, done);
    }
    // A second tap within 4 s removes it (no browser dialogs).
    function removeCode(c, button) {
      if (!button.dataset.armed) {
        button.dataset.armed = '1';
        button.textContent = t('kpRemoveAgain');
        setTimeout(() => { delete button.dataset.armed; button.textContent = t('kpRemove'); }, 4000);
        return;
      }
      Homey.api('DELETE', `/keypad-codes/${encodeURIComponent(c.id)}`, null, (err, res) => {
        if (err) { kpStatus.textContent = err.message || String(err); return; }
        if (kpEditing && kpEditing.id === c.id) { resetCodeForm(); showCodeForm(false); }
        if (res && res.ok) showCodes(res.codes || []);
        kpStatus.textContent = t(res && res.ok ? 'kpRemoved' : 'kpGone');
      });
    }
    $('kpNew').addEventListener('click', () => { resetCodeForm(); kpStatus.textContent = ''; showCodeForm(true); kpName.focus(); });
    kpSave.addEventListener('click', () => { if (!kpSave.disabled) saveCode(); });
    $('kpCancel').addEventListener('click', () => { resetCodeForm(); showCodeForm(false); kpStatus.textContent = ''; });
    loadCodes();

    // ---- Web dashboards: on or off (the app setting), and the page's addresses on the home network and through
    // Homey's cloud (this settings page may be served through the cloud). ----
    const webEnabled = $('webEnabled');
    const webRemote = $('webRemote');
    const webAddresses = all('.web-address');
    let webLoaded = false;
    let webUrls = null; // the page's addresses, once read: {url, remoteUrl}
    let pwSet = false;
    // Off, or on at home (and away), and whether a password is set.
    function showWebLine() {
      let line = t(!webEnabled.checked ? 'webLineOff' : webRemote.checked ? 'webLineAway' : 'webLineHome');
      if (webEnabled.checked && pwSet) line += ` · ${t('webLinePassword')}`;
      setLine('webLine', line, webEnabled.checked);
    }
    // Each address once it's known; the one through the cloud only with Remote access on.
    function showAddresses() {
      for (const block of webAddresses) {
        const known = !!block.querySelector('.web-url').textContent;
        block.hidden = !known || (block.dataset.address === 'remoteUrl' && !webRemote.checked);
      }
      showWebLine();
    }
    function showWeb(on) {
      webEnabled.checked = on;
      $('webOn').hidden = !on;
      showWebLine();
      if (on && !webLoaded) {
        webLoaded = true;
        Homey.api('GET', '/web/address', null, (err, res) => {
          if (err || !res) { webLoaded = false; return; }
          webUrls = res;
          for (const block of webAddresses) {
            const url = res[block.dataset.address];
            const link = block.querySelector('.web-url');
            if (url) { link.href = url; link.textContent = url; }
          }
          showAddresses();
        });
      }
    }
    Homey.get('webDashboardsEnabled', (err, value) => {
      webEnabled.disabled = false;
      showWeb(!err && value === true);
    });
    Homey.get('webRemoteAccess', (err, value) => {
      webRemote.disabled = false;
      webRemote.checked = !err && value === true;
      showAddresses();
    });
    // A checkbox for an app setting: saved at once, put back if saving fails.
    function wireSwitch(box, setting, status, after) {
      box.addEventListener('change', () => {
        const on = box.checked;
        box.disabled = true;
        status.textContent = '';
        Homey.set(setting, on, (err) => {
          box.disabled = false;
          if (err) { status.textContent = err.message || String(err); after(!on); return; }
          after(on);
        });
      });
    }
    wireSwitch(webEnabled, 'webDashboardsEnabled', $('webStatus'), showWeb);
    wireSwitch(webRemote, 'webRemoteAccess', $('webRemoteStatus'), (on) => { webRemote.checked = on; showAddresses(); });

    // ---- Updates: a feature release posted to the Timeline, on unless turned off. ----
    const updTimeline = $('updTimeline');
    function showUpdates(on) {
      updTimeline.checked = on;
      setLine('updLine', t(on ? 'updLineOn' : 'updLineOff'), on);
    }
    Homey.get('timelineUpdates', (err, value) => {
      updTimeline.disabled = false;
      showUpdates(err || value !== false);
    });
    wireSwitch(updTimeline, 'timelineUpdates', $('updStatus'), showUpdates);

    // ---- Appearance: the light-mode tile shadow, on unless turned off; the app tells open widgets. ----
    const lookShadow = $('lookShadow');
    function showLook(on) {
      lookShadow.checked = on;
      setLine('lookLine', t(on ? 'lookLineOn' : 'lookLineOff'), on);
    }
    Homey.get('tileShadow', (err, value) => {
      lookShadow.disabled = false;
      showLook(err || value !== false);
    });
    wireSwitch(lookShadow, 'tileShadow', $('lookStatus'), showLook);
    for (const block of webAddresses) {
      const link = block.querySelector('.web-url');
      const status = block.querySelector('.status');
      block.querySelector('[data-act="open"]').addEventListener('click', () => {
        if (!link.textContent) return;
        if (typeof Homey.openURL === 'function') Homey.openURL(link.href); else window.open(link.href, '_blank');
      });
      block.querySelector('[data-act="copy"]').addEventListener('click', async () => {
        if (!link.textContent) return;
        if (await copyText(link.href)) {
          status.textContent = t('copied');
        } else {
          // Not copied: the address selected, to copy by hand.
          const range = document.createRange();
          range.selectNodeContents(link);
          const sel = window.getSelection();
          if (sel) { sel.removeAllRanges(); sel.addRange(range); }
          status.textContent = '';
        }
      });
    }

    // ---- The web dashboards' password: checked and hashed by the app, never sent back. ----
    const webPassword = $('webPassword');
    const pwSave = $('pwSave');
    const pwStatus = $('pwStatus');
    const pwCurrent = $('pwCurrent');
    let pwBusy = false;
    let pwMode = null; // 'set' (a new one) or 'remove', while the form is open
    const syncPasswordButtons = () => {
      pwSave.disabled = pwBusy || (pwMode === 'set' && !webPassword.value) || (pwSet && !pwCurrent.value);
    };
    // Set password (Change password while one is set) asks for a new one, Remove password only for the current one.
    function openPasswordForm(mode) {
      pwMode = mode;
      webPassword.value = pwCurrent.value = '';
      $('pwCurrentGroup').hidden = !pwSet;
      $('pwNewGroup').hidden = mode !== 'set';
      pwSave.textContent = t(mode === 'set' ? 'webPasswordSave' : 'webPasswordRemove');
      pwSave.className = skin.button(mode === 'set' ? 'primary' : 'danger');
      pwStatus.textContent = '';
      showForm($('pwForm'), $('pwActions'), !!mode);
      if (mode) (pwSet ? pwCurrent : webPassword).focus();
      syncPasswordButtons();
    }
    function showPasswordState() {
      Homey.api('GET', '/web/password', null, (err, res) => {
        // The screens, after the password: which need it again changes with it.
        queueMicrotask(loadScreens);
        if (err) return;
        pwSet = !!(res && res.set);
        $('pwRemove').hidden = !pwSet;
        $('pwState').hidden = !pwSet;
        $('pwForgot').hidden = !pwSet;
        $('pwSet').textContent = t(pwSet ? 'webPasswordChange' : 'webPasswordSave');
        showWebLine();
        syncPasswordButtons();
      });
    }
    /** Why the app didn't take it: the length, or (while one is set) a wrong current password or the lock. */
    function passwordRefused(res) {
      switch (res && res.reason) {
        case 'tooLong': return t('webPasswordTooLong', { max: 200 });
        case 'wrong': return t('webPasswordWrong');
        case 'locked': return t('webPasswordLocked', { seconds: res.retryAfter || 30 });
        default: return t('webPasswordTooShort', { min: 8 });
      }
    }
    function savePassword(password) {
      pwBusy = true;
      syncPasswordButtons();
      pwStatus.textContent = '';
      Homey.api('PUT', '/web/password', { password, current: pwCurrent.value }, (err, res) => {
        pwBusy = false;
        syncPasswordButtons();
        if (err) { pwStatus.textContent = err.message || String(err); return; }
        if (res && res.ok) {
          openPasswordForm(null);
          pwStatus.textContent = t(password ? 'webPasswordSaved' : 'webPasswordRemoved');
          showPasswordState();
          if (opts.passwordChanged) opts.passwordChanged(!!password);
        } else {
          pwStatus.textContent = passwordRefused(res);
        }
      });
    }
    for (const field of [pwCurrent, webPassword]) {
      field.addEventListener('input', syncPasswordButtons);
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !pwSave.disabled) pwSave.click(); });
    }
    pwSave.addEventListener('click', () => {
      if (pwSave.disabled) return;
      if (pwMode === 'set') savePassword(webPassword.value);
      else if (pwMode === 'remove') savePassword('');
    });
    $('pwSet').addEventListener('click', () => openPasswordForm('set'));
    $('pwRemove').addEventListener('click', () => openPasswordForm('remove'));
    $('pwCancel').addEventListener('click', () => openPasswordForm(null));
    showPasswordState();

    // ---- Screens and browsers: a key made for each, swapped for a sign-in code the web dashboards page takes. The
    // code comes back once, when the screen is added or given a new code; the list has names only. ----
    const scrName = $('scrName');
    const scrKey = $('scrKey');
    const scrCurrent = $('scrCurrent');
    const scrSave = $('scrSave');
    const scrStatus = $('scrStatus');
    let scrBusy = false;
    let scrRenewing = null; // the screen getting a new code, while its form is open
    const syncScreenButtons = () => {
      scrSave.disabled = scrBusy || (pwSet && !scrCurrent.value) || !scrKey.value.trim()
        || (!scrRenewing && !scrName.value.trim());
    };
    // Add opens the steps, the name, the key and (with a password) the current one; New code all but the name.
    function openScreenForm(open, screen) {
      scrRenewing = open ? screen || null : null;
      scrName.value = scrKey.value = scrCurrent.value = '';
      $('scrNameGroup').hidden = !!scrRenewing;
      $('scrCurrentGroup').hidden = !pwSet;
      $('scrRenewing').hidden = !scrRenewing;
      $('scrRenewing').textContent = scrRenewing ? t('webScreenRenewing', { name: scrRenewing.name }) : '';
      scrSave.textContent = t(scrRenewing ? 'webScreenNewCode' : 'webScreenSave');
      if (open) { $('scrShown').hidden = true; scrStatus.textContent = ''; }
      showForm($('scrForm'), $('scrActions'), open);
      if (open) (scrRenewing ? scrKey : scrName).focus();
      syncScreenButtons();
    }
    function screenRow(screen) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'kp-code-name';
      name.textContent = screen.name;
      const info = document.createElement('span');
      info.className = 'kp-code-digits';
      info.textContent = screen.needsPassword ? t('webScreenNeedsPassword')
        : screen.used ? t('webScreenUsed', { date: new Date(screen.used).toLocaleDateString() }) : t('webScreenNotUsed');
      info.classList.toggle('scr-warn', !!screen.needsPassword);
      const about = document.createElement('div');
      about.className = 'scr-info';
      about.append(name, info);
      // Opens on: the dashboard the page goes to after this screen's code (none: the dashboards, or its own address).
      if (scrDashboards.length) {
        const opens = document.createElement('select');
        opens.className = `${skin.select} scr-opens`;
        opens.setAttribute('aria-label', t('webScreenOpensOn'));
        const choices = [{ id: '', name: t('webScreenOpensFront') }, ...scrDashboards];
        // A dashboard deleted since shows as the front page, which is where the screen now goes.
        const current = scrDashboards.some(d => d.id === screen.dashboard) ? screen.dashboard : '';
        for (const d of choices) {
          const option = document.createElement('option');
          option.value = d.id;
          option.textContent = d.id ? t('webScreenOpensDashboard', { name: d.name }) : d.name;
          option.selected = d.id === current;
          opens.append(option);
        }
        opens.addEventListener('change', () => {
          opens.disabled = true;
          Homey.api('PUT', `/web/screens/${encodeURIComponent(screen.id)}/dashboard`, { dashboard: opens.value || null }, (err, res) => {
            opens.disabled = false;
            if (err || !res || !res.ok) {
              opens.value = current;
              scrStatus.textContent = err ? err.message || String(err) : t(res && res.reason === 'dashboard' ? 'webScreenOpensGone' : 'webScreenGone');
              return;
            }
            showScreens(res.screens || []);
          });
        });
        about.append(opens);
      }
      const buttons = document.createElement('div');
      buttons.className = 'scr-buttons';
      row.append(about, buttons);
      // New code: a lost code, or a lost device whose key was deleted in Homey and replaced.
      const renew = newButton('webScreenNewCode');
      renew.addEventListener('click', () => openScreenForm(true, screen));
      // Remove takes a second tap within 3 s: the screen's code stops working. The device keeps the key it was given
      // until it next loads the page with the code, so the status says to delete the key in Homey too.
      const remove = newButton('kpRemove', 'danger');
      let armed = 0;
      remove.addEventListener('click', () => {
        if (Date.now() - armed > 3000) {
          armed = Date.now();
          remove.textContent = t('kpRemoveAgain');
          setTimeout(() => { if (remove.isConnected) remove.textContent = t('kpRemove'); }, 3000);
          return;
        }
        Homey.api('DELETE', `/web/screens/${encodeURIComponent(screen.id)}`, null, (err, res) => {
          if (err) { scrStatus.textContent = err.message || String(err); return; }
          if (scrRenewing && scrRenewing.id === screen.id) openScreenForm(false);
          showScreens((res && res.screens) || []);
          scrStatus.textContent = t('webScreenRemoved');
        });
      });
      buttons.append(renew, remove);
      return row;
    }
    let scrDashboards = []; // the web dashboards, `{id, name}`, for each screen's Opens on
    function showScreens(screens) {
      $('scrList').replaceChildren(...screens.map(screenRow));
    }
    function loadScreens() {
      Homey.api('GET', '/web/screens', null, (err, res) => {
        if (err || !res) return;
        scrDashboards = Array.isArray(res.dashboards) ? res.dashboards : [];
        showScreens(res.screens || []);
      });
    }
    /** The address as a QR code: an SVG of dark modules (qrcode-generator, settings/qrcode.js). */
    function qrSvg(text) {
      if (typeof window.qrcode !== 'function') return null;
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      const n = qr.getModuleCount();
      let d = '';
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
      svg.setAttribute('shape-rendering', 'crispEdges');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', text);
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', '#000000');
      svg.append(path);
      return svg;
    }
    /** A screen just added or given a new code: the code, and the page's addresses with it (#code=), the home one as a QR code. */
    function showCode(name, res, renewed) {
      $('scrShownTitle').textContent = t(renewed ? 'webScreenRenewed' : 'webScreenAdded', { name });
      $('scrCode').textContent = res.code;
      $('scrNoDevices').hidden = res.devices !== false;
      const urls = [['url', 'webAddressHome'], ['remoteUrl', 'webAddressAway']]
        .filter(([key]) => webUrls && webUrls[key] && (key === 'url' || webRemote.checked))
        .map(([key, title]) => [`${webUrls[key].split('#')[0]}#code=${res.code}`, title]);
      // The home address as a QR code, under its heading, so it's clear which one it holds.
      const qr = urls.length ? qrSvg(urls[0][0]) : null;
      $('scrAddresses').replaceChildren(...urls.map(([url, title], i) => {
        const block = document.createElement('div');
        block.className = 'scr-address';
        const head = document.createElement('p');
        head.className = 'sub-title';
        head.textContent = t(title);
        const link = document.createElement('span');
        link.className = 'web-url';
        link.textContent = url;
        const row = document.createElement('div');
        row.className = 'row';
        const copy = newButton('copy');
        copy.addEventListener('click', async () => { scrStatus.textContent = (await copyText(url)) ? t('copied') : ''; });
        row.append(copy);
        block.append(head, link);
        if (i === 0 && qr) {
          const pad = document.createElement('div');
          pad.className = 'scr-qr';
          pad.append(qr);
          block.append(pad);
        }
        block.append(row);
        return block;
      }));
      $('scrShown').hidden = false;
      $('scrActions').hidden = true;
    }
    /** Why the app didn't take it. */
    function screenRefused(res) {
      switch (res && res.reason) {
        case 'name': return t('webScreenNeedName', { max: 40 });
        case 'keyInvalid': return t('webScreenKeyInvalid');
        case 'full': return t('webScreenFull', { max: 20 });
        case 'missing': return t('webScreenGone');
        default: return passwordRefused(res);
      }
    }
    function saveScreen() {
      scrBusy = true;
      syncScreenButtons();
      scrStatus.textContent = t('varChecking');
      const renewing = scrRenewing;
      const name = renewing ? renewing.name : scrName.value.trim();
      const body = { name, key: scrKey.value.trim(), current: scrCurrent.value };
      const done = (err, res) => {
        scrBusy = false;
        syncScreenButtons();
        if (err) { scrStatus.textContent = err.message || String(err); return; }
        if (!res || !res.ok) { scrStatus.textContent = screenRefused(res); return; }
        openScreenForm(false);
        showScreens(res.screens || []);
        scrStatus.textContent = '';
        showCode(name, res, !!renewing);
      };
      if (renewing) Homey.api('PUT', `/web/screens/${encodeURIComponent(renewing.id)}`, { key: body.key, current: body.current }, done);
      else Homey.api('POST', '/web/screens', body, done);
    }
    for (const field of [scrName, scrKey, scrCurrent]) {
      field.addEventListener('input', syncScreenButtons);
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !scrSave.disabled) scrSave.click(); });
    }
    scrSave.addEventListener('click', () => { if (!scrSave.disabled) saveScreen(); });
    $('scrNew').addEventListener('click', () => openScreenForm(true));
    $('scrCancel').addEventListener('click', () => { scrStatus.textContent = ''; openScreenForm(false); });
    // The code isn't shown again: Done clears it from the page.
    $('scrDone').addEventListener('click', () => {
      $('scrCode').textContent = '';
      $('scrAddresses').replaceChildren();
      $('scrShown').hidden = true;
      $('scrActions').hidden = false;
      scrStatus.textContent = '';
    });

    // ---- Diagnostics: read when its card is first shown. ----
    const select = $('device');
    const report = $('report');
    const status = $('status');
    let devicesListed = false;
    let diagLoaded = false;
    function load() {
      diagLoaded = true;
      status.textContent = t('loading');
      const device = select.value;
      Homey.api('GET', `/diagnostics${device ? `?device=${encodeURIComponent(device)}` : ''}`, null, (err, result) => {
        if (err) {
          status.textContent = t('loadFailed', { error: err.message || err });
          return;
        }
        if (!devicesListed && Array.isArray(result.devices)) {
          devicesListed = true;
          for (const d of result.devices) {
            const o = document.createElement('option');
            o.value = d.id;
            o.textContent = d.name;
            select.appendChild(o);
          }
        }
        report.value = JSON.stringify(result, null, 2);
        status.textContent = t('updated', { time: new Date().toLocaleTimeString() });
      });
    }
    const share = $('share');
    if (navigator.share) {
      share.hidden = false;
      share.addEventListener('click', () => {
        navigator.share({ title: t('shareTitle'), text: report.value }).catch(() => {});
      });
    }
    card('diagCard').opened = () => { if (!diagLoaded) load(); };
    select.addEventListener('change', load);
    $('refresh').addEventListener('click', load);
    $('copy').addEventListener('click', async () => {
      if (await copyText(report.value, report)) status.textContent = t('copied');
    });
    return made;
  }

  window.WidgetkeeperAppSettings = { CARDS, HOMEY_SKIN, cards };
})();
