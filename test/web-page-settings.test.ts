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

function mount(opts: { syncFails?: boolean } = {}) {
  let part: ((wd: any) => void) | null = null;
  (window as any).WidgetkeeperWeb = { part: (name: string, fn: (wd: any) => void) => { if (name === 'front') part = fn; } };
  runFile('settings/dashboard-front.js');
  let hideSync: (() => void) | null = null;
  const given: Record<string, any> = {
    el, button, t: (s: string) => s, icon: (name: string) => el('i', `icon-${name}`),
    keepAwake: { on: false, how: 'video', set: async () => {} }, dimLevel: () => 0, MAX_DIM: 80,
    storageGet: () => null, storageSet: vi.fn(), dimScheduleOf: () => null, dimFlowLevel: () => null,
    rotateConfig: () => null, goBackConfig: () => null, navInOrder: () => [], dashboards: [], nav: { prefs: { hidden: [] } },
    ownTheme: () => null, choiceGroup: () => el('div'),
    brandSection: () => section('header'),
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
  part!(wd);
  return { wd, failSync: () => hideSync!() };
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
