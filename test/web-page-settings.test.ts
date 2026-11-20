// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runFile } from './helpers/loadWidget.js';

// The web dashboards' Settings dialog (pageSettings() in settings/dashboard-front.js): its vertical tabs, with a
// stand-in for the page's shared object (anything not given here is a stub).
function el(tag: string, className?: string | null, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function button(className: string, text: string | null, onClick: () => void, label?: string) {
  const b = el('button', className, text ?? '');
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}
const section = (id: string) => { const s = el('section', 'wd-page-section'); s.dataset.of = id; return s; };

/**
 * `app`: the App settings too, the real part (settings/dashboard-app.js) with the shared cards (settings/app-settings.js),
 * whose calls `request()` answers: `POST /web/app-settings {method, path, body}` goes to `app(method, path, body)`.
 */
function mount(opts: { app?: (method: string, path: string, body: any) => any, away?: boolean } = {}) {
  let part: ((wd: any) => void) | null = null;
  let appPart: ((wd: any) => void) | null = null;
  (window as any).WidgetkeeperWeb = {
    part: (name: string, fn: (wd: any) => void) => { if (name === 'front') part = fn; if (name === 'app') appPart = fn; },
  };
  runFile('settings/dashboard-front.js');
  const requests: any[] = [];
  if (opts.app) {
    runFile('settings/app-settings.js');
    runFile('settings/dashboard-app.js');
  }
  let hideSync: (() => void) | null = null;
  const given: Record<string, any> = {
    el, button, t: (s: string) => s, icon: (name: string) => el('i', `icon-${name}`),
    keepAwake: { on: false, how: 'video', set: async () => {} }, dimLevel: () => 0, MAX_DIM: 80,
    storageGet: () => null, storageSet: vi.fn(), dimScheduleOf: () => null, dimFlowLevel: () => null,
    rotateConfig: () => null, goBackConfig: () => null, navInOrder: () => [], dashboards: [], nav: { prefs: { hidden: [] } },
    ownTheme: () => null, choiceGroup: () => el('div'),
    brandSection: () => section('header'),
    appSettingsTabs: () => ({ tabs: [], load: async () => {} }),
    key: 'page-key', AWAY: !!opts.away, setup: { strings: { settings: {} } },
    request: async (method: string, path: string, body: any) => {
      requests.push([method, path, body]);
      if (!opts.app || method !== 'POST' || path !== '/web/app-settings') return {};
      return opts.app(body.method, body.path, body.body);
    },
    syncSettingsSection: (unavailable: () => void) => { hideSync = unavailable; return section('sync'); },
    dialog: () => {
      const d = el('dialog') as any;
      const body = el('div', 'wd-dialog-body');
      d.append(body);
      document.body.append(d);
      d.showModal = () => { d.open = true; };
      return { d, body };
    },
  };
  const wd: any = new Proxy(given, { get: (o, k: string) => (k in o ? o[k] : (o[k] = vi.fn())) });
  if (opts.app) delete given.appSettingsTabs;
  part!(wd);
  if (appPart) (appPart as (wd: any) => void)(wd);
  return { wd, requests, failSync: () => hideSync!() };
}
const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const shownPanel = () => [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter(p => !p.hidden);
const press = (key: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

afterEach(() => { document.body.innerHTML = ''; });

describe('the Settings dialog', () => {
  it('is vertical tabs: the Homey\'s settings, then this browser\'s, one panel at a time', () => {
    const { wd } = mount();
    wd.pageSettings();
    const list = document.querySelector('[role="tablist"]')!;
    expect(list.getAttribute('aria-orientation')).toBe('vertical');
    expect([...list.children].map(n => n.textContent)).toEqual(
      ['allBrowsers', 'brandTitle', 'tabSync', 'backupTitle', 'thisBrowser', 'tabScreen', 'tabKiosk', 'tabSignIn']);
    expect(shownPanel()).toHaveLength(1);
    expect(shownPanel()[0].id).toBe('wd-tabpanel-header');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    // Each of this browser's says so; the settings are where they belong.
    tabs()[3].click();
    expect(shownPanel()[0].querySelector('.wd-browser-only')).not.toBeNull();
    expect(shownPanel()[0].querySelector('#wd-keep-awake')).not.toBeNull();
    expect(shownPanel()[0].querySelector('#wd-dim-schedule')).not.toBeNull();
    tabs()[4].click();
    expect(shownPanel()[0].querySelector('#wd-rotate')).not.toBeNull();
    expect(shownPanel()[0].querySelector('#wd-go-back')).not.toBeNull();
    expect(shownPanel()[0].querySelector('.wd-kiosk-help')).not.toBeNull();
    tabs()[5].click();
    expect(shownPanel()[0].textContent).toContain('forgetKey');
    expect(tabs().map(b => b.tabIndex)).toEqual([-1, -1, -1, -1, -1, 0]);
  });

  it('opens on the tab last open, or the one asked for', () => {
    const { wd } = mount();
    wd.pageSettings();
    tabs()[4].click();
    document.body.innerHTML = '';
    wd.pageSettings();
    expect(shownPanel()[0].id).toBe('wd-tabpanel-kiosk');
    document.body.innerHTML = '';
    wd.pageSettings('backup');
    expect(shownPanel()[0].id).toBe('wd-tabpanel-backup');
  });

  it('moves along the tabs with the arrow keys, Home and End, round the ends', () => {
    const { wd } = mount();
    wd.pageSettings();
    tabs()[0].focus();
    press('ArrowDown');
    expect(document.activeElement!.id).toBe('wd-tab-sync');
    expect(shownPanel()[0].id).toBe('wd-tabpanel-sync');
    press('End');
    expect(document.activeElement!.id).toBe('wd-tab-signin');
    press('ArrowDown');
    expect(document.activeElement!.id).toBe('wd-tab-header');
    press('ArrowUp');
    expect(document.activeElement!.id).toBe('wd-tab-signin');
    press('Home');
    expect(shownPanel()[0].id).toBe('wd-tabpanel-header');
  });

  it('drops the Sync tab when its schedule can\'t be read, going to the first if it was open', () => {
    const { wd, failSync } = mount();
    wd.pageSettings('sync');
    failSync();
    expect(document.getElementById('wd-tab-sync')!.hidden).toBe(true);
    expect(shownPanel()[0].id).toBe('wd-tabpanel-header');
    tabs()[0].focus();
    press('ArrowDown');
    expect(document.activeElement!.id).toBe('wd-tab-backup');
  });
});

describe('the Settings dialog: App settings', () => {
  const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); };
  /** The app's answers for a key with full access: the flags, and each card's first read. */
  const full = (calls: any[] = []) => (method: string, path: string, body: any) => {
    calls.push([method, path, body]);
    if (path === '/settings' && method === 'GET') return { webDashboardsEnabled: true, webRemoteAccess: false, timelineUpdates: null, tileShadow: false };
    if (path === '/settings' && method === 'PUT') return { ok: true };
    if (path === '/time-format') return { ok: true, timeFormat: method === 'PUT' ? body.timeFormat : '24' };
    if (path.startsWith('/diagnostics')) return { devices: [] };
    return {};
  };

  it("adds the app settings page's cards as tabs, once the app says this browser's key may", async () => {
    const calls: any[] = [];
    mount({ app: full(calls) }).wd.pageSettings();
    // Hidden until the app answered.
    const appTabs = () => tabs().filter(b => b.id.startsWith('wd-tab-app-'));
    expect(appTabs().every(b => b.hidden)).toBe(true);
    await flush();
    const list = document.querySelector('[role="tablist"]')!;
    expect([...list.children].filter(n => !(n as HTMLElement).hidden).map(n => n.textContent).slice(8)).toEqual(
      ['appSettings', 'varTitle', 'namesTitle', 'timeTitle', 'tempTitle', 'lookTitle', 'kpTitle', 'webTitle', 'updTitle', 'title']);
    // Each panel: its title, its line, that it's for the whole app, then the card in the page's own controls.
    (document.getElementById('wd-tab-app-timeCard') as HTMLButtonElement).click();
    const panel = shownPanel()[0];
    expect([...panel.children].map(n => n.className)).toEqual(['wd-h2', 'card-line wd-hint', 'wd-hint wd-browser-only', 'wd-set-card wd-app-card']);
    expect(panel.querySelector('.card-line')!.textContent).toBe('time24');
    const select = panel.querySelector('#timeFormat') as HTMLSelectElement;
    expect(select.className).toBe('wd-input');
    select.value = '12';
    select.dispatchEvent(new Event('change'));
    await flush();
    expect(calls).toContainEqual(['PUT', '/time-format', { timeFormat: '12' }]);
    // A switch is the page's, and an app setting is saved through the app's gate.
    (document.getElementById('wd-tab-app-lookCard') as HTMLButtonElement).click();
    const shadow = shownPanel()[0].querySelector('#lookShadow') as HTMLInputElement;
    expect([shadow.className, shadow.checked]).toEqual(['wd-switch', false]);
    shadow.checked = true;
    shadow.dispatchEvent(new Event('change'));
    await flush();
    expect(calls).toContainEqual(['PUT', '/settings', { name: 'tileShadow', value: true }]);
    // Web dashboards: no switch to turn them off from here, nor the pointer to the backup (it's on this page).
    (document.getElementById('wd-tab-app-webCard') as HTMLButtonElement).click();
    const web = shownPanel()[0];
    expect((web.querySelector('#webEnabled')!.closest('[hidden]'))).not.toBeNull();
    expect(web.querySelector('[data-i18n="webBackupHelp"]')!.closest('[hidden]')).not.toBeNull();
    expect(web.querySelector('#webRemote')!.closest('[hidden]')).toBeNull();
    // Diagnostics reads its report when its tab is first shown.
    expect(calls.some(([, path]) => path.startsWith('/diagnostics'))).toBe(false);
    (document.getElementById('wd-tab-app-diagCard') as HTMLButtonElement).click();
    await flush();
    expect(calls.some(([, path]) => path === '/diagnostics')).toBe(true);
  });

  it('leaves Remote access out away from home', async () => {
    mount({ app: full(), away: true }).wd.pageSettings();
    await flush();
    expect(document.querySelector('#webRemote')!.closest('[hidden]')).not.toBeNull();
  });

  it("leaves them out for a key that may not, and comes back to an app tab last open", async () => {
    const { wd, requests } = mount({ app: () => { throw new Error("This browser's API key may not change the app's settings (keyScope)"); } });
    wd.pageSettings();
    await flush();
    expect(requests).toEqual([['POST', '/web/app-settings', { key: 'page-key', method: 'GET', path: '/settings', body: null }]]);
    expect(tabs().filter(b => !b.hidden).map(b => b.id)).toEqual(
      ['wd-tab-header', 'wd-tab-sync', 'wd-tab-backup', 'wd-tab-screen', 'wd-tab-kiosk', 'wd-tab-signin']);
    expect(document.querySelector('.wd-tabs-group[hidden]')!.textContent).toBe('appSettings');
    document.body.innerHTML = '';
    // With full access, the dialog opens on an app tab once it shows.
    const second = mount({ app: full() });
    second.wd.settingsTab = 'app-tempCard';
    second.wd.pageSettings();
    expect(shownPanel()[0].id).toBe('wd-tabpanel-header');
    await flush();
    expect(shownPanel()[0].id).toBe('wd-tabpanel-app-tempCard');
  });
});
