// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runFile } from './helpers/loadWidget.js';

// The web dashboards' side pane (settings/dashboard-nav.js), with a stand-in for the page's shared object.
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

const HOME = { id: 'home', name: 'Home', columns: [[], [], []] };
const ENERGY = { id: 'energy', name: 'Energy', columns: [[]] };
const KITCHEN = { id: 'kitchen', name: 'Kitchen', section: 's1', columns: [[]] };
const BATH = { id: 'bath', name: 'Bath', section: 's1', columns: [[]] };
const GARDEN = { id: 'garden', name: 'Garden', section: 's2', columns: [[]] };
const SECTIONS = [{ id: 's1', name: 'Rooms' }, { id: 's2', name: 'Outside' }];
const ALL = [HOME, ENERGY, KITCHEN, BATH, GARDEN];
const KEY = 'widgetkeeper.web.nav';

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

function mount(opts: { stored?: unknown; dashboards?: any[]; sections?: any[]; current?: any; lock?: string } = {}) {
  if (opts.stored !== undefined) localStorage.setItem(KEY, JSON.stringify(opts.stored));
  const root = el('div', 'wd');
  document.body.append(root);
  const wd: Record<string, any> = {
    el, button, root, t: (s: string, tokens?: Record<string, unknown>) => (tokens ? `${s} ${Object.values(tokens).join()}` : s),
    icon: (name: string) => el('i', `icon-${name}`), LOGO: '<svg></svg>', STAY_STORAGE: 'stay',
    storageGet: (k: string) => localStorage.getItem(k),
    storageSet: (k: string, v: string | null) => (v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v)),
    dashboards: opts.dashboards ?? ALL, frontPage: { sections: opts.sections ?? SECTIONS },
    current: opts.current === undefined ? { dashboard: HOME } : opts.current,
    lockOf: (d: any) => (d.id === opts.lock ? { digits: 4 } : null),
    askCode: vi.fn((_d: any, then: () => void) => then()),
  };
  (window as any).WidgetkeeperWeb = { part: (_name: string, fn: (w: any) => void) => fn(wd) };
  runFile('settings/dashboard-nav.js');
  root.append(wd.navButton());
  wd.showNav();
  const pane = document.querySelector('.wd-nav') as HTMLElement;
  const scrim = document.querySelector('.wd-nav-scrim') as HTMLElement;
  const toggle = root.querySelector('.wd-nav-toggle') as HTMLElement;
  const names = () => [...pane.querySelectorAll('.wd-nav-list .wd-nav-name')].map(x => x.textContent);
  const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');
  const customize = () => (pane.querySelector('.wd-nav-foot button') as HTMLElement).click();
  return { wd, root, pane, scrim, toggle, names, stored, customize };
}

const html = document.documentElement;
beforeEach(() => { localStorage.clear(); setWidth(1280); location.hash = ''; });
afterEach(() => { document.body.textContent = ''; html.className = ''; });

describe('the pane\'s choices', () => {
  const { wd } = (() => { const m = mount(); return m; })();

  it('reads anything stored as a sane default', () => {
    for (const bad of [null, '', 'not json', '5', '[]', '{"pinned":"yes","hidden":"a","order":[1,"x"]}']) {
      const p = wd.readPrefs(bad);
      expect(p.pinned).toBe(false);
      expect(p.hidden).toEqual([]);
      expect(p.order.every((x: unknown) => typeof x === 'string')).toBe(true);
    }
  });

  it('orders by what\'s stored, ignoring ids that are gone and putting new ones last', () => {
    expect(wd.ordered(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
    expect(wd.ordered(['a', 'b', 'c'], ['c', 'gone', 'a'])).toEqual(['c', 'a', 'b']);
    expect(wd.ordered(['a', 'b'], ['b', 'b'])).toEqual(['b', 'a']);
  });

  it('moves an item to where the other one was, up and down', () => {
    const up = ['a', 'b', 'c'];
    wd.reorder(up, 'c', 'a');
    expect(up).toEqual(['c', 'a', 'b']);
    const down = ['a', 'b', 'c'];
    wd.reorder(down, 'a', 'b');
    expect(down).toEqual(['b', 'a', 'c']);
  });
});

describe('the pane\'s list', () => {
  it('shows every dashboard under its section, loose ones first without a heading', () => {
    const { pane, names } = mount();
    expect(names()).toEqual(['Home', 'Energy', 'Rooms', 'Kitchen', 'Bath', 'Outside', 'Garden']);
    expect(pane.querySelector('[aria-current]')?.getAttribute('href')).toBe('#/d/home');
  });

  it('treats a section that\'s gone as none', () => {
    expect(mount({ dashboards: [HOME, { ...GARDEN, section: 'gone' }], sections: [] }).names()).toEqual(['Home', 'Garden']);
  });

  it('leaves hidden dashboards out, and a section with none left', () => {
    expect(mount({ stored: { hidden: ['garden', 'energy'] } }).names()).toEqual(['Home', 'Rooms', 'Kitchen', 'Bath']);
  });

  it('follows the stored order, and a new dashboard comes last in its section', () => {
    const { names } = mount({ stored: { order: ['bath', 'kitchen', 'energy'], sectionOrder: ['s2', 's1'] } });
    expect(names()).toEqual(['Energy', 'Home', 'Outside', 'Garden', 'Rooms', 'Bath', 'Kitchen']);
  });

  it('folds a section on a tap and remembers it', () => {
    const { pane, names, stored } = mount();
    (pane.querySelector('.wd-nav-fold') as HTMLElement).click();
    expect(names()).toEqual(['Home', 'Energy', 'Rooms', 'Outside', 'Garden']);
    expect(stored().folded).toEqual(['s1']);
  });

  it('marks All dashboards on the front page', () => {
    const { pane } = mount({ current: null });
    expect(pane.querySelector('[aria-current]')?.getAttribute('href')).toBe('#/');
  });

  it('asks the code before leaving a dashboard that has one', () => {
    const { wd, pane } = mount({ lock: 'home' });
    const e = new MouseEvent('click', { cancelable: true, bubbles: true });
    pane.querySelector('a[href="#/d/energy"]')!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(wd.askCode).toHaveBeenCalledOnce();
    expect(location.hash).toBe('#/d/energy');
  });

  it('goes straight on from a dashboard without a code', () => {
    const { pane, wd } = mount();
    const e = new MouseEvent('click', { cancelable: true, bubbles: true });
    pane.querySelector('a[href="#/d/energy"]')!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(wd.askCode).not.toHaveBeenCalled();
  });
});

describe('closed, floating and kept open', () => {
  it('starts closed and out of reach', () => {
    const { pane, scrim } = mount();
    expect(pane.classList.contains('open')).toBe(false);
    expect((pane as any).inert).toBe(true);
    expect(scrim.classList.contains('open')).toBe(false);
  });

  it('floats from the button, and closes on the layer over the widgets and on Escape', () => {
    const { pane, scrim, toggle } = mount();
    toggle.click();
    expect(pane.classList.contains('open')).toBe(true);
    expect(scrim.classList.contains('open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(html.classList.contains('wd-nav-pinned')).toBe(false);
    scrim.click();
    expect(pane.classList.contains('open')).toBe(false);
    toggle.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pane.classList.contains('open')).toBe(false);
  });

  it('keeps open with the pin, across a new view and a reload', () => {
    const first = mount();
    first.toggle.click();
    (first.pane.querySelector('.wd-nav-pin') as HTMLElement).click();
    expect(html.classList.contains('wd-nav-pinned')).toBe(true);
    expect(first.scrim.classList.contains('open')).toBe(false);
    expect(first.stored().pinned).toBe(true);
    first.wd.hideNav();
    expect(html.classList.contains('wd-nav-pinned')).toBe(false); // the editor has the whole width
    first.wd.showNav();
    expect(html.classList.contains('wd-nav-pinned')).toBe(true);
    document.body.textContent = '';
    html.className = '';
    const again = mount();
    expect(html.classList.contains('wd-nav-pinned')).toBe(true);
    expect(again.pane.classList.contains('open')).toBe(true);
  });

  it('floats when the pin is let go, and the button closes a kept-open pane', () => {
    const { pane, scrim, toggle } = mount({ stored: { pinned: true } });
    (pane.querySelector('.wd-nav-pin') as HTMLElement).click();
    expect(html.classList.contains('wd-nav-pinned')).toBe(false);
    expect(scrim.classList.contains('open')).toBe(true);
    (pane.querySelector('.wd-nav-pin') as HTMLElement).click();
    expect(html.classList.contains('wd-nav-pinned')).toBe(true);
    toggle.click();
    expect(pane.classList.contains('open')).toBe(false);
  });

  it('can\'t be kept open under 1000 px, and the pin comes back as the window widens', () => {
    setWidth(999);
    const { pane, toggle } = mount({ stored: { pinned: true } });
    expect(html.classList.contains('wd-nav-pinned')).toBe(false);
    expect(pane.classList.contains('open')).toBe(false);
    toggle.click();
    expect(pane.classList.contains('open')).toBe(true);
    expect((pane.querySelector('.wd-nav-pin') as HTMLElement).hidden).toBe(true);
    setWidth(1000);
    window.dispatchEvent(new Event('resize'));
    expect(html.classList.contains('wd-nav-pinned')).toBe(true);
    expect((pane.querySelector('.wd-nav-pin') as HTMLElement).hidden).toBe(false);
  });

  it('is gone in full screen and in kiosk mode, unless the address asks for it', () => {
    html.classList.add('wd-kiosk');
    const kiosk = mount({ stored: { pinned: true } });
    expect(kiosk.pane.hidden).toBe(true);
    expect(html.classList.contains('wd-nav-pinned')).toBe(false);
    document.body.textContent = '';
    html.classList.add('wd-kiosk-nav');
    const opted = mount({ stored: { pinned: true } });
    expect(opted.pane.hidden).toBe(false);
    expect(html.classList.contains('wd-nav-pinned')).toBe(true);
    html.classList.remove('wd-kiosk', 'wd-kiosk-nav');
    html.classList.add('wd-full');
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(opted.pane.hidden).toBe(true);
    expect(html.classList.contains('wd-nav-pinned')).toBe(false);
  });
});

describe('Customize', () => {
  it('lists hidden ones too, and an eye hides or shows one in this browser', () => {
    const { pane, names, stored, customize } = mount({ stored: { hidden: ['energy'] } });
    expect(names()).not.toContain('Energy');
    customize();
    expect(names()).toContain('Energy');
    const eye = () => pane.querySelector('[data-nav-key="eye:energy"]') as HTMLElement;
    expect(eye().getAttribute('aria-pressed')).toBe('false');
    eye().click();
    expect(stored().hidden).toEqual([]);
    (pane.querySelector('[data-nav-key="eye:home"]') as HTMLElement).click();
    expect(stored().hidden).toEqual(['home']);
  });

  it('hides a whole section, then shows it again', () => {
    const { pane, stored, customize } = mount();
    customize();
    const eye = () => pane.querySelector('[data-nav-key="eye-section:s1"]') as HTMLElement;
    eye().click();
    expect(stored().hidden.sort()).toEqual(['bath', 'kitchen']);
    eye().click();
    expect(stored().hidden).toEqual([]);
  });

  const key = (node: Element, name: string) => node.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));

  it('moves a row with the arrow keys, inside its section only', () => {
    const { pane, stored, customize, names } = mount();
    customize();
    const grip = () => pane.querySelector('[data-nav-key="grip:bath"]')!;
    key(grip(), 'ArrowUp');
    expect(names().slice(3, 5)).toEqual(['Bath', 'Kitchen']);
    expect(stored().order.indexOf('bath')).toBeLessThan(stored().order.indexOf('kitchen'));
    key(grip(), 'ArrowUp'); // already first in its section
    expect(names().slice(3, 5)).toEqual(['Bath', 'Kitchen']);
  });

  it('moves a section among the others', () => {
    const { pane, stored, customize, names } = mount();
    customize();
    key(pane.querySelector('[data-nav-key="grip-section:s2"]')!, 'ArrowUp');
    expect(names().indexOf('Outside')).toBeLessThan(names().indexOf('Rooms'));
    expect(stored().sectionOrder).toEqual(['s2', 's1']);
  });

  it('stores no order once it\'s the front page\'s again', () => {
    const { pane, stored, customize } = mount();
    customize();
    const grip = () => pane.querySelector('[data-nav-key="grip:bath"]')!;
    key(grip(), 'ArrowUp');
    expect(stored().order).not.toEqual([]);
    key(grip(), 'ArrowDown');
    expect(stored().order).toEqual([]);
  });

  it('resets to the front page\'s list and order', () => {
    const { pane, stored, customize, names } = mount({ stored: { hidden: ['energy'], order: ['bath', 'kitchen'], sectionOrder: ['s2', 's1'], folded: ['s1'], pinned: true } });
    customize();
    (pane.querySelector('.wd-nav-reset') as HTMLElement).click();
    expect(stored()).toMatchObject({ hidden: [], order: [], sectionOrder: [], pinned: true, folded: ['s1'] });
    expect(names().slice(0, 5)).toEqual(['Home', 'Energy', 'Rooms', 'Kitchen', 'Bath']);
  });

  it('forgets dashboards that are gone when it saves', () => {
    const { pane, stored, customize } = mount({ stored: { hidden: ['gone', 'energy'] } });
    customize();
    (pane.querySelector('[data-nav-key="eye:home"]') as HTMLElement).click();
    expect(stored().hidden.sort()).toEqual(['energy', 'home']);
  });

  it('takes the code on a dashboard that has one', () => {
    const { wd, pane, customize } = mount({ lock: 'home' });
    customize();
    expect(wd.askCode).toHaveBeenCalledOnce();
    expect(pane.classList.contains('customizing')).toBe(true);
  });

  it('ends with the pane', () => {
    const { pane, toggle, customize } = mount();
    toggle.click();
    customize();
    expect(pane.classList.contains('customizing')).toBe(true);
    toggle.click();
    expect(pane.classList.contains('customizing')).toBe(false);
  });
});

describe('the page around the pane', () => {
  it('is a part every page loads', () => {
    expect(readFileSync('settings/dashboard.js', 'utf8')).toMatch(/const PARTS = \[[^\]]*'nav'\]/);
    for (const page of ['settings/dashboard.html', 'dev/web-preview.html', 'dev/web-showcase.html']) {
      expect(readFileSync(page, 'utf8')).toContain('dashboard-nav.js');
    }
  });

  it('has replaced the title\'s list and the back arrow', () => {
    for (const file of ['settings/dashboard-views.js', 'settings/dashboard.css']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/dashboardJump|wd-jump|wd-back\b/);
    }
  });
});
