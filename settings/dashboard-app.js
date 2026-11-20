/*
 * The web dashboards page — the app's own settings in the Settings dialog: the app settings page's cards (API key,
 * Names, Time format, Temperature, Appearance, Keypad codes, Web dashboards, Updates, Diagnostics) from the same
 * script, `settings/app-settings.js`, each in a tab of its own under the group App settings, in the page's own
 * controls (`SKIN`). Their calls go through `POST /web/app-settings` (`lib/webAppSettings.ts`), which answers only a
 * browser whose own key has full access; for any other, the group never shows. A part of the page
 * (settings/dashboard.js): mountWebDashboards() runs it once with `wd`. Plain browser JS (served as-is).
 */
(function () {
  'use strict';

  /** The page's own controls for the cards: its buttons, fields and switches (`app-settings.js`' skin). */
  const SKIN = {
    button: kind => (kind === 'primary' ? 'wd-btn primary' : kind === 'danger' ? 'wd-btn danger' : 'wd-btn'),
    input: 'wd-input',
    select: 'wd-input',
    group: 'wd-as-group',
    label: 'wd-set-label',
    checkbox: (id, key, cls = '', value = '') => `<label class="wd-as-check">
        <span class="wd-set-label" data-i18n="${key}"></span>
        <input class="wd-switch${cls ? ` ${cls}` : ''}" id="${id}"${value ? ` value="${value}"` : ''} type="checkbox" role="switch" disabled>
      </label>`,
  };

  window.WidgetkeeperWeb.part('app', (wd) => {
    const { AWAY, el, request, t } = wd;

    /** A call of the cards', through the app's gate for them, with this browser's key. */
    const call = (method, path, body) => request('POST', '/web/app-settings', { key: wd.key, method, path, body: body ?? null });

    /** A Homey for the cards, as the settings page's: `api`, `get`/`set` of the app settings read once, and `__`. */
    function homeyFor(values) {
      return {
        __(key, tokens) {
          const strings = (wd.setup && wd.setup.strings && wd.setup.strings.settings) || {};
          const name = key.replace(/^settings\./, '');
          let s = typeof strings[name] === 'string' ? strings[name] : name;
          for (const k in tokens || {}) s = s.split(`__${k}__`).join(String(tokens[k]));
          return s;
        },
        api(method, path, body, cb) { call(method, path, body).then(res => cb(null, res), err => cb(err)); },
        get(name, cb) { cb(null, values[name]); },
        set(name, value, cb) {
          call('PUT', '/settings', { name, value }).then(() => { values[name] = value; cb(null); }, err => cb(err));
        },
      };
    }

    /**
     * The Settings dialog's App settings: the group heading and a tab per card, hidden, with an empty panel each
     * (`tabs`), and `load(showTab)`, which asks the app whether this browser's key may (`GET /settings`, also the
     * values the cards read), then fills the panels and shows the tabs. A key that may not leaves them hidden.
     */
    function appSettingsTabs() {
      const { CARDS } = window.WidgetkeeperAppSettings;
      const titleOf = key => homeyFor({}).__(`settings.${key}`);
      /** @type {Array<{id: string, label: string, panel: HTMLElement, hidden: boolean, shown?: () => void}>} */
      const tabs = CARDS.map(c => ({ id: `app-${c.id}`, label: titleOf(c.title), panel: el('section', 'wd-page-section wd-app-section'), hidden: true }));
      const group = { group: t('appSettings'), id: 'app-group', hidden: true };
      async function load(showTab) {
        let values;
        try {
          values = await call('GET', '/settings');
        } catch (err) {
          return; // not a key with full access (or the Homey didn't answer): no App settings this time
        }
        if (!values || !tabs[0].panel.isConnected) return;
        const cards = window.WidgetkeeperAppSettings.cards(homeyFor(values), { skin: SKIN, web: true, away: AWAY });
        for (const card of cards) {
          const tab = tabs.find(x => x.id === `app-${card.id}`);
          card.line.classList.add('wd-hint');
          const box = el('div', 'wd-set-card wd-app-card');
          box.append(card.body);
          tab.panel.append(el('h3', 'wd-h2', tab.label), card.line, el('p', 'wd-hint wd-browser-only', t('appOnly')), box);
          tab.shown = card.opened;
          showTab(tab.id);
        }
        showTab(group.id);
      }
      return { tabs: [group, ...tabs], load };
    }

    Object.assign(wd, { appSettingsTabs });
  });
})();
