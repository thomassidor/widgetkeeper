// @ts-check
// The web dashboards page: syncing a dashboard with a Homey dashboard (`lib/WebSyncService.ts`,
// `.claude/rules/web-sync.md`): the editor's Sync pill and dialog, the sync icon on linked dashboards' cards and bars,
// the front page Settings' nightly sync, and taking in what a sync changed.
(() => {
  window.WidgetkeeperWeb.part('sync', (wd) => {
    const { button, confirmButton, el, failed, icon, request, t, toast } = wd;

    /** The links by web dashboard id (`LinkStatus`: `{homeyId, prefer, lastSync, syncing}`), from `/web/setup`. */
    wd.syncLinks = {};
    /** When each dashboard's sync last brought in changes the page has taken. */
    const taken = new Map();
    /** How old the last sync may be when a linked dashboard is opened (the app's `ifOlder`). */
    const OPEN_SYNC_S = 600;

    const linkOf = id => (wd.syncLinks && wd.syncLinks[id]) || null;
    const changed = c => !!c && (c.added > 0 || c.removed > 0 || c.updated > 0 || c.moved || c.renamed);

    /** When, in the page's language: today's time alone, else the date and time. */
    function when(at) {
      const date = new Date(at);
      const lang = (wd.setup && wd.setup.language) || undefined;
      const today = new Date().toDateString() === date.toDateString();
      try {
        return today ? date.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
          : date.toLocaleString(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return date.toISOString().slice(0, 16).replace('T', ' ');
      }
    }

    const REASONS = {
      noKey: 'syncNoKey', keyScope: 'syncKeyScope', keyInvalid: 'syncKeyInvalid', homeyGone: 'syncHomeyGone', tooMany: 'syncTooMany',
    };
    const reasonText = r => t(REASONS[r] || 'syncError');
    /** A reason on its own line, as a sentence. */
    const reasonLine = r => { const text = reasonText(r); return text.charAt(0).toUpperCase() + text.slice(1); };

    /** A link's state in a line: syncing, failed and why, synced when (and its conflicts), or not yet. */
    function stateText(link) {
      if (!link) return '';
      if (link.syncing) return t('syncing');
      const last = link.lastSync;
      if (!last) return t('syncNever');
      if (!last.ok) return t('syncFailed', { reason: reasonText(last.reason) });
      const text = t('syncedAt', { time: when(last.at) });
      const n = (last.conflicts || []).length;
      return n ? `${text} · ${t('syncConflicts', { count: n, side: t(link.prefer === 'web' ? 'syncKeepWeb' : 'syncKeepHomey') })}` : text;
    }

    /** The sync icon of a linked dashboard (none for one that isn't): spinning while it syncs, red after a failure. */
    function syncIcon(id, className = 'wd-sync') {
      const link = linkOf(id);
      if (!link) return null;
      const node = el('span', className);
      node.append(icon('sync'));
      paint(node, link);
      node.dataset.syncId = id;
      return node;
    }

    function paint(node, link) {
      const bad = !link.syncing && link.lastSync && !link.lastSync.ok;
      node.classList.toggle('busy', !!link.syncing);
      node.classList.toggle('bad', !!bad);
      const text = stateText(link);
      node.title = text;
      node.setAttribute('aria-label', text);
    }

    /** The viewing bar's: a button that syncs now. */
    function syncBarButton(id) {
      if (!linkOf(id)) return null;
      const b = button('wd-icon wd-sync wd-bar-sync', '', () => syncNow(id), t('syncNow'));
      b.append(icon('sync'));
      b.dataset.syncId = id;
      paint(b, linkOf(id));
      return b;
    }

    /** Every sync icon and line on the page for that dashboard, after its link changed. */
    function repaint(id) {
      const link = linkOf(id);
      for (const node of document.querySelectorAll(`[data-sync-id="${CSS.escape(id)}"]`)) {
        if (node.classList.contains('wd-syncpill')) { node.classList.toggle('on', !!link); continue; }
        if (link) paint(/** @type {HTMLElement} */ (node), link);
        else if (node.classList.contains('wd-sync')) node.remove();
      }
      for (const line of document.querySelectorAll(`[data-sync-line="${CSS.escape(id)}"]`)) line.textContent = stateText(link);
    }

    async function syncNow(id) {
      try {
        await request('POST', `/web/dashboards/${encodeURIComponent(id)}/sync`);
      } catch (err) {
        failed(err);
      }
    }

    /** Opening a linked dashboard syncs it when its last sync is older than ten minutes. */
    function onOpen(id) {
      if (!linkOf(id)) return;
      request('POST', `/web/dashboards/${encodeURIComponent(id)}/sync?ifOlder=${OPEN_SYNC_S}`).catch(() => { /* its icon says so */ });
    }

    /**
     * A sync that changed this side: the dashboards again from the app, and the one on screen redrawn (its editor too:
     * every change there is saved at once, so nothing is lost; after the save under way).
     */
    async function takeIn(id, at) {
      if (taken.get(id) === at) return;
      taken.set(id, at);
      await wd.saving;
      let setup;
      try {
        setup = await request('GET', '/web/setup');
      } catch (err) {
        return;
      }
      wd.setup = Object.assign({}, wd.setup, { dashboards: setup.dashboards, sync: setup.sync });
      wd.dashboards = setup.dashboards || [];
      wd.syncLinks = setup.sync || {};
      const fresh = wd.dashboards.find(d => d.id === id);
      const shown = wd.current && wd.current.dashboard && wd.current.dashboard.id === id;
      if (shown && fresh && !wd.drag && !wd.resizing) {
        wd.renderDashboard(fresh, wd.current.editing);
        toast(t('syncUpdated'));
      } else if (/^(#\/(edit)?)?$/.test(location.hash)) {
        wd.renderList(location.hash === '#/edit');
      }
    }

    // The app's word after every sync and link change.
    {
      const uri = `homey:app:${wd.APP_ID}`;
      const k = wd.listenerKey(uri, 'websync:state');
      if (!wd.listeners.has(k)) wd.listeners.set(k, new Set());
      wd.listeners.get(k).add((data) => {
        if (!data || typeof data.id !== 'string') return;
        const before = linkOf(data.id);
        if (data.link) wd.syncLinks[data.id] = data.link;
        else delete wd.syncLinks[data.id];
        repaint(data.id);
        const last = data.link && data.link.lastSync;
        if (before && before.syncing && data.link && !data.link.syncing && last && last.ok && changed(last.changes && last.changes.web)) takeIn(data.id, last.at);
      });
    }

    // ---- The editor: the Sync pill and its dialog ---------------------------------------------------------

    function syncPill(dashboard) {
      const b = button('wd-btn wd-syncpill', '', () => syncDialog(wd.current.dashboard), t('syncTitle'));
      b.append(icon('sync'), el('span', 'wd-bar-label', t('sync')));
      b.classList.toggle('on', !!linkOf(dashboard.id));
      b.dataset.syncId = dashboard.id;
      return b;
    }

    function syncDialog(dashboard) {
      const id = dashboard.id;
      const { d, body } = wd.dialog(t('syncTitle'));
      d.classList.add('wd-sync-dialog');
      const status = el('p', 'wd-muted wd-sync-status');
      status.setAttribute('role', 'status');
      body.append(el('p', 'wd-muted', t('syncText')), status);
      const card = el('div', 'wd-set-card');
      body.append(card);
      let homeys = null;

      const row = (label, hint, control) => {
        const r = el('div', 'wd-set-row inline');
        const head = el('div', 'wd-set-text');
        head.append(el('span', 'wd-set-label', label));
        if (hint) head.append(el('p', 'wd-hint', hint));
        r.append(head, control);
        return r;
      };
      const sides = () => [{ id: 'homey', title: t('syncKeepHomey') }, { id: 'web', title: t('syncKeepWeb') }];

      async function load() {
        status.textContent = '';
        card.replaceChildren(el('p', 'wd-muted wd-sync-wait', '…'));
        try {
          homeys = await request('GET', '/web/sync/homey');
        } catch (err) {
          homeys = null;
        }
        draw();
      }

      function draw() {
        const link = linkOf(id);
        card.replaceChildren();
        for (const old of body.querySelectorAll('.wd-sync-buttons')) old.remove();
        if (homeys && !homeys.ok) {
          card.append(el('p', 'wd-error wd-sync-key', homeys.reason === 'noKey' || homeys.reason === 'keyScope' || homeys.reason === 'keyInvalid'
            ? `${reasonLine(homeys.reason)}. ${t('syncKeyNeeded')}` : reasonLine('failed')));
          if (!link) return;
        }
        const list = (homeys && homeys.ok && homeys.dashboards) || [];
        if (link) {
          const name = (list.find(h => h.id === link.homeyId) || {}).name;
          const line = el('p', 'wd-muted');
          line.dataset.syncLine = id;
          line.textContent = stateText(link);
          card.append(row(t('syncWith', { name: name || t('untitled') }), null, line));
          card.append(row(t('syncPrefer'), t('syncPreferText'), wd.choiceGroup(null, sides(), link.prefer, async (prefer) => {
            try {
              const res = await request('PUT', `/web/dashboards/${encodeURIComponent(id)}/sync`, { prefer });
              if (res && res.link) wd.syncLinks[id] = res.link;
            } catch (err) {
              failed(err);
            }
          }, false)));
          const now = button('wd-btn primary', t('syncNow'), () => syncNow(id));
          const stop = confirmButton('wd-btn', t('syncStop'), async () => {
            try {
              await request('DELETE', `/web/dashboards/${encodeURIComponent(id)}/sync`);
              delete wd.syncLinks[id];
              repaint(id);
              draw();
            } catch (err) {
              failed(err);
            }
          }, t('tapAgain'));
          const buttons = el('div', 'wd-row wd-sync-buttons');
          buttons.append(now, stop);
          card.after(buttons);
          return;
        }
        // Not linked: pick a Homey dashboard (or a new one), the first time's direction and the side that wins.
        const pick = el('select', 'wd-input wd-sync-pick');
        const fresh = el('option', null, t('syncNew'));
        fresh.value = 'new';
        pick.append(fresh);
        for (const h of list) {
          const o = el('option', null, h.linked && h.linked !== id ? t('syncTaken', { name: h.name || t('untitled') }) : (h.name || t('untitled')));
          o.value = h.id;
          o.disabled = !!h.linked && h.linked !== id;
          pick.append(o);
        }
        let start = 'homey';
        let prefer = 'homey';
        const startRow = row(t('syncStart'), null, wd.choiceGroup(null, [
          { id: 'homey', title: t('syncFromHomey') }, { id: 'web', title: t('syncFromWeb') },
        ], start, (v) => { start = v; }, false));
        const showStart = () => { startRow.hidden = pick.value === 'new'; };
        pick.addEventListener('change', showStart);
        showStart();
        card.append(row(t('syncPick'), null, pick), startRow,
          row(t('syncPrefer'), t('syncPreferText'), wd.choiceGroup(null, sides(), prefer, (v) => { prefer = v; }, false)));
        const go = button('wd-btn primary', t('syncLink'), async () => {
          go.disabled = true;
          status.textContent = t('syncing');
          try {
            await wd.saving; // the dashboard as last saved
            const res = await request('PUT', `/web/dashboards/${encodeURIComponent(id)}/sync`, { homeyId: pick.value, start, prefer });
            if (!res || !res.ok) {
              status.textContent = reasonLine(res && res.reason);
              go.disabled = false;
              return;
            }
            if (res.link) wd.syncLinks[id] = res.link;
            status.textContent = stateText(linkOf(id));
            const pill = document.querySelector('.wd-syncpill');
            if (pill) pill.classList.add('on');
            if (res.lastSync && res.lastSync.ok && changed(res.lastSync.changes && res.lastSync.changes.web)) takeIn(id, res.lastSync.at);
            homeys = null;
            load();
          } catch (err) {
            go.disabled = false;
            status.textContent = '';
            failed(err);
          }
        });
        go.disabled = !(homeys && homeys.ok);
        const buttons = el('div', 'wd-row wd-sync-buttons');
        buttons.append(go);
        card.after(buttons);
      }

      d.showModal();
      load();
    }

    // ---- The front page's Settings: the nightly sync --------------------------------------------------------

    function syncSettingsSection() {
      const section = el('section', 'wd-page-section');
      const card = el('div', 'wd-set-card');
      section.append(el('h3', 'wd-h2', t('syncSettings')), card);
      const setRow = (label, hint, control, idFor) => {
        const r = el('div', 'wd-set-row inline');
        const head = el('div', 'wd-set-text');
        const l = el(idFor ? 'label' : 'span', 'wd-set-label', label);
        if (idFor) /** @type {HTMLLabelElement} */ (l).htmlFor = idFor;
        head.append(l);
        if (hint) head.append(el('p', 'wd-hint', hint));
        r.append(head, control);
        return r;
      };
      const nightly = el('input', 'wd-switch');
      nightly.type = 'checkbox';
      nightly.id = 'wd-sync-nightly';
      nightly.setAttribute('role', 'switch');
      const time = el('input', 'wd-input wd-sync-time');
      time.type = 'time';
      time.id = 'wd-sync-time';
      const all = button('wd-btn', t('syncAll'), async () => {
        all.disabled = true;
        try {
          await request('POST', '/web/sync');
        } catch (err) {
          failed(err);
        }
        all.disabled = false;
      });
      const count = Object.keys(wd.syncLinks || {}).length;
      const nightRow = setRow(t('syncNightly'), t('syncNightlyText'), nightly, nightly.id);
      nightRow.classList.add('switch');
      const timeRow = setRow(t('syncTime'), null, time, time.id);
      card.append(nightRow, timeRow, setRow(t('syncCount', { count }), null, all));
      all.disabled = !count;
      const save = async () => {
        timeRow.hidden = !nightly.checked;
        try {
          const s = await request('PUT', '/web/sync', { nightly: nightly.checked, time: time.value });
          if (s && s.time) time.value = s.time;
        } catch (err) {
          failed(err);
        }
      };
      nightly.addEventListener('change', save);
      time.addEventListener('change', save);
      request('GET', '/web/sync').then((res) => {
        const s = (res && res.schedule) || { nightly: true, time: '03:00' };
        nightly.checked = s.nightly !== false;
        time.value = s.time || '03:00';
        timeRow.hidden = !nightly.checked;
      }, () => { section.hidden = true; });
      return section;
    }

    Object.assign(wd, { onSyncOpen: onOpen, syncBarButton, syncIcon, syncPill, syncSettingsSection });
  });
})();
