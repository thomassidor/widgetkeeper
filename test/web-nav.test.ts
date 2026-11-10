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

/** The page's own (settings/dashboard.js): under 4.5:1 against the text of that mode. */
function hardToRead(colour: string, dark: boolean) {
  const luminance = (hex: string) => [1, 3, 5].reduce((sum, at, i) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return sum + [0.2126, 0.7152, 0.0722][i] * (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  }, 0);
  const [a, b] = [luminance(colour), luminance(dark ? '#E4E4E7' : '#1F2029')];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4.5;
}

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

function mount(opts: { stored?: unknown; dashboards?: any[]; sections?: any[]; current?: any; lock?: string; brand?: any } = {}) {
  if (opts.stored !== undefined) localStorage.setItem(KEY, JSON.stringify(opts.stored));
  const root = el('div', 'wd');
  document.body.append(root);
  const wd: Record<string, any> = {
    el, button, root, t: (s: string, tokens?: Record<string, unknown>) => (tokens ? `${s} ${Object.values(tokens).join()}` : s),
    icon: (name: string) => el('i', `icon-${name}`), STAY_STORAGE: 'stay',
    iconNode: (value?: string) => (value ? el('i', `chosen-${value}`) : null),
    storageGet: (k: string) => localStorage.getItem(k),
    storageSet: (k: string, v: string | null) => (v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v)),
    dashboards: opts.dashboards ?? ALL, frontPage: { sections: opts.sections ?? SECTIONS, ...(opts.brand ? { brand: opts.brand } : {}) },
    brand: () => { const h = el('h1', 'wd-brand'); h.append(el('span', 'wd-logo')); return h; },
    current: opts.current === undefined ? { dashboard: HOME } : opts.current,
    lockOf: (d: any) => (d.id === opts.lock ? { digits: 4 } : null),
    askCode: vi.fn((_d: any, then: () => void) => then()),
    hardToRead,
  };
  (window as any).WidgetkeeperWeb = { part: (_name: string, fn: (w: any) => void) => fn(wd) };
  runFile('settings/dashboard-nav.js');
  root.append(wd.navButton());
  wd.showNav();
  const pane = document.querySelector('.wd-nav') as HTMLElement;
  const scrim = document.querySelector('.wd-nav-scrim') as HTMLElement;
  const toggle = root.querySelector('.wd-nav-toggle') as HTMLElement;
  const names = () => [...pane.querySelectorAll('.wd-nav-list > :not(.wd-nav-all) .wd-nav-name')].map(x => x.textContent);
  const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');
  const customize = () => (pane.querySelector('.wd-nav-custom') as HTMLElement).click();
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

  it('opens the folded section holding the current dashboard, without forgetting it\'s folded', () => {
    const { pane, toggle, names, stored } = mount({ current: { dashboard: KITCHEN }, stored: { folded: ['s1'] } });
    toggle.click();
    expect(names()).toContain('Kitchen');
    expect(pane.querySelector('.wd-nav-list [aria-current]')?.textContent).toBe('Kitchen');
    expect(stored() === null || stored().folded.includes('s1')).toBe(true);
    (pane.querySelector('.wd-nav-fold') as HTMLElement).click();
    expect(names()).not.toContain('Kitchen');
    expect(stored().folded).toEqual(['s1']);
  });

  it('lists a hidden dashboard while it\'s the one showing', () => {
    const { pane, names } = mount({ stored: { hidden: ['home'] } });
    expect(names()).toContain('Home');
    expect(pane.querySelector('.wd-nav-list [aria-current]')?.textContent).toBe('Home');
    document.body.textContent = '';
    expect(mount({ current: { dashboard: ENERGY }, stored: { hidden: ['home'] } }).names()).not.toContain('Home');
  });

  it('is titled Dashboards, or with the front page\'s own name and its mark', () => {
    const title = (pane: HTMLElement) => pane.querySelector('.wd-nav-title') as HTMLElement;
    expect(title(mount().pane).textContent).toBe('dashboards');
    document.body.textContent = '';
    const own = title(mount({ brand: { name: 'Lilletoften 3', icon: 'sun' } }).pane);
    expect(own.textContent).toBe('Lilletoften 3');
    expect(own.querySelector('.wd-logo')).not.toBeNull();
  });

  it('marks All dashboards on the front page', () => {
    const { pane } = mount({ current: null });
    expect(pane.querySelector('[aria-current]')?.getAttribute('href')).toBe('#/');
  });

  it('lists All dashboards first, and Customize hides it, but not on the front page itself', () => {
    const { pane, stored, customize } = mount();
    expect(pane.querySelector('.wd-nav-list > .wd-nav-row')?.getAttribute('href')).toBe('#/');
    expect(pane.querySelector('.wd-nav-foot a[href="#/"]')).toBeNull();
    customize();
    (pane.querySelector('[data-nav-key="eye-all"]') as HTMLElement).click();
    expect(stored().allHidden).toBe(true);
    expect(pane.querySelector('.wd-nav-list .wd-nav-all')?.classList.contains('off')).toBe(true);
    document.body.textContent = '';
    expect(mount({ stored: { allHidden: true } }).pane.querySelector('a[href="#/"]')).toBeNull();
    document.body.textContent = '';
    expect(mount({ current: null, stored: { allHidden: true } }).pane.querySelector('[aria-current]')?.getAttribute('href')).toBe('#/');
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

  it('only floats in full screen, and is kept open again after it', () => {
    const { pane, toggle, stored } = mount({ stored: { pinned: true } });
    html.classList.add('wd-full');
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(pane.hidden).toBe(false);
    expect(pane.classList.contains('open')).toBe(false);
    expect(html.classList.contains('wd-nav-pinned')).toBe(false);
    expect((pane.querySelector('.wd-nav-pin') as HTMLElement).hidden).toBe(true);
    toggle.click();
    expect(pane.classList.contains('open')).toBe(true);
    toggle.click();
    expect(stored().pinned).toBe(true);
    html.classList.remove('wd-full');
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(html.classList.contains('wd-nav-pinned')).toBe(true);
  });

  it('is gone in kiosk mode, unless the address asks for it', () => {
    html.classList.add('wd-kiosk');
    const kiosk = mount({ stored: { pinned: true } });
    expect(kiosk.pane.hidden).toBe(true);
    expect(html.classList.contains('wd-nav-pinned')).toBe(false);
    document.body.textContent = '';
    html.classList.add('wd-kiosk-nav');
    const opted = mount({ stored: { pinned: true } });
    expect(opted.pane.hidden).toBe(false);
    expect(html.classList.contains('wd-nav-pinned')).toBe(true);
  });
});

describe('Settings in the pane', () => {
  const settings = (pane: HTMLElement) => pane.querySelector('.wd-nav-settings') as HTMLElement;

  it('opens the dialog from a dashboard and closes a floating pane', () => {
    const { wd, pane, toggle } = mount();
    wd.pageSettings = vi.fn();
    toggle.click();
    settings(pane).click();
    expect(wd.pageSettings).toHaveBeenCalledOnce();
    expect(wd.askCode).not.toHaveBeenCalled();
    expect(pane.classList.contains('open')).toBe(false);
  });

  it('leaves a kept-open pane open', () => {
    const { wd, pane } = mount({ stored: { pinned: true } });
    wd.pageSettings = vi.fn();
    settings(pane).click();
    expect(pane.classList.contains('open')).toBe(true);
  });

  it('takes the code on a dashboard that has one', () => {
    const { wd, pane } = mount({ lock: 'home' });
    wd.pageSettings = vi.fn();
    settings(pane).click();
    expect(wd.askCode).toHaveBeenCalledOnce();
    expect(wd.pageSettings).toHaveBeenCalledOnce();
  });

  it('says where there\'s no pane, so the front page can keep its button there', () => {
    const { wd } = mount();
    expect(wd.navBlocked()).toBe(false);
    html.classList.add('wd-kiosk');
    expect(wd.navBlocked()).toBe(true);
    html.classList.add('wd-kiosk-nav');
    expect(wd.navBlocked()).toBe(false);
  });
});

describe('in the editors', () => {
  it('stays, kept open and out of use, so the page is laid out at its real width', () => {
    const { wd, pane, scrim } = mount({ stored: { pinned: true } });
    wd.hideNav();
    wd.showNav({ inactive: true });
    expect(html.classList.contains('wd-nav-pinned')).toBe(true);
    expect(pane.hidden).toBe(false);
    expect(pane.classList.contains('inactive')).toBe(true);
    expect((pane as any).inert).toBe(true);
    expect(scrim.hidden).toBe(true);
    wd.hideNav();
    wd.showNav();
    expect(pane.classList.contains('inactive')).toBe(false);
    expect((pane as any).inert).toBe(false);
  });

  it('is gone when it isn\'t kept open, and a floating one closes', () => {
    const { wd, pane, toggle } = mount();
    toggle.click();
    wd.hideNav();
    wd.showNav({ inactive: true });
    expect(pane.hidden).toBe(true);
    wd.hideNav();
    wd.showNav();
    expect(pane.classList.contains('open')).toBe(false);
  });

  it('shows a new name as it\'s typed', () => {
    const { wd, names } = mount({ stored: { pinned: true }, current: { dashboard: { ...HOME, name: 'Renamed' } } });
    wd.redrawNav();
    expect(names()[0]).toBe('Renamed');
  });
});

describe('with the rest of the page', () => {
  it('gives Rotate this browser\'s order, hidden ones included', () => {
    const { wd } = mount({ stored: { hidden: ['energy'], order: ['bath', 'energy', 'home'], sectionOrder: ['s2', 's1'] } });
    expect(wd.navInOrder().map((d: any) => d.id)).toEqual(['energy', 'home', 'garden', 'bath', 'kitchen']);
  });

  it('puts a duplicate after its original in an own order, hidden like it', () => {
    const copy = { id: 'copy', name: 'Bath (copy)', section: 's1', columns: [[]] };
    const { wd, stored } = mount({ stored: { hidden: ['bath'], order: ['bath', 'kitchen', 'home', 'energy', 'garden'] } });
    wd.dashboards = [...ALL, copy];
    wd.navCopied('bath', 'copy');
    expect(stored().order.slice(0, 2)).toEqual(['bath', 'copy']);
    expect(stored().hidden).toEqual(['bath', 'copy']);
  });

  it('leaves no order of its own for a duplicate while it follows the front page', () => {
    const copy = { id: 'copy', name: 'Home (copy)', columns: [[]] };
    const { wd, stored } = mount();
    wd.dashboards = [HOME, copy, ENERGY];
    wd.navCopied('home', 'copy');
    expect(stored().order).toEqual([]);
    expect(stored().hidden).toEqual([]);
  });

  it('keeps what it knows of a dashboard whose delete can still be undone', () => {
    const { wd, pane, customize, stored } = mount({ stored: { hidden: ['energy'], order: ['energy', 'home'] } });
    customize();
    wd.dashboards = ALL.filter(d => d.id !== 'energy');
    wd.pendingDelete = { id: 'energy' };
    (pane.querySelector('[data-nav-key="eye:home"]') as HTMLElement).click();
    expect(stored().hidden).toContain('energy');
    expect(stored().order).toContain('energy');
    wd.pendingDelete = null;
    (pane.querySelector('[data-nav-key="eye:home"]') as HTMLElement).click();
    expect(stored().hidden).toEqual([]);
  });

  it('draws a dashboard back from Undo', () => {
    const { wd, names } = mount({ dashboards: [HOME] });
    wd.dashboards = [HOME, ENERGY];
    wd.redrawNav();
    expect(names()).toEqual(['Home', 'Energy']);
  });

  it('has no logo of its own beside the front page\'s', () => {
    expect(mount().pane.querySelector('.wd-logo')).toBeNull();
  });
});

describe('a dashboard with a code', () => {
  it('says the browser is held there, and that the code is for leaving', () => {
    const { wd, pane } = mount({ lock: 'home' });
    expect(pane.querySelector('.wd-nav-list .wd-nav-note')?.textContent).toBe('navHeld');
    (pane.querySelector('.wd-nav-list a[href="#/d/energy"]') as HTMLElement).click();
    expect(wd.askCode.mock.calls[0][2]).toBe('enterCodeLeave');
  });

  it('says nothing on one without', () => {
    expect(mount({ lock: 'energy' }).pane.querySelector('.wd-nav-list .wd-nav-note')).toBeNull();
  });
});

describe('Customize', () => {
  it('is a labelled row at the foot with how many are hidden, and only Close is an icon in the head', () => {
    const { pane } = mount({ stored: { hidden: ['energy', 'garden'] } });
    const custom = pane.querySelector('.wd-nav-foot .wd-nav-custom') as HTMLElement;
    expect(custom.querySelector('.wd-nav-name')?.textContent).toBe('navCustomize');
    expect(custom.querySelector('.wd-nav-count')?.textContent).toContain('2');
    expect(pane.querySelector('.wd-nav-foot .wd-nav-pin .wd-nav-name')?.textContent).toBe('navKeepOpen');
    expect([...pane.querySelectorAll('.wd-nav-head button')].map(b => b.className)).toEqual(['wd-icon wd-nav-close']);
  });

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

describe('a dashboard\'s icon in the pane', () => {
  it('shows before the name, and the others keep its place only once one has an icon', () => {
    const rows = (dashboards: any[]) => {
      const { pane } = mount({ dashboards, current: null }); // on the front page: a dashboard being shown is read from `current`
      const out = [...pane.querySelectorAll('a.wd-nav-row[href^="#/d/"]')].map(r => r.firstElementChild!.className);
      document.body.innerHTML = '';
      return out;
    };
    expect(rows([{ ...HOME, icon: 'home' }, ENERGY])).toEqual(['chosen-home', 'wd-chosen-icon']);
    expect(rows([HOME, ENERGY])).toEqual(['wd-nav-name', 'wd-nav-name']);
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

describe('the foot', () => {
  const rows = (pane: HTMLElement) => [...pane.querySelectorAll('.wd-nav-foot > .wd-nav-row')].filter(r => !(r as HTMLElement).hidden).length;

  it('is open at first, and folds its rows away under its handle, remembered', () => {
    const { pane, stored, toggle } = mount();
    toggle.click();
    const fold = () => pane.querySelector('.wd-nav-foot-fold') as HTMLElement;
    expect(fold().getAttribute('aria-expanded')).toBe('true');
    expect(rows(pane)).toBe(3);
    fold().click();
    expect(fold().getAttribute('aria-expanded')).toBe('false');
    expect(fold().getAttribute('aria-label')).toBe('navFootShow');
    expect(rows(pane)).toBe(0);
    expect(stored().footFolded).toBe(true);
    expect(document.activeElement).toBe(fold());
    document.body.textContent = '';
    const again = mount();
    expect(rows(again.pane)).toBe(0);
    (again.pane.querySelector('.wd-nav-foot-fold') as HTMLElement).click();
    expect(rows(again.pane)).toBe(3);
    expect(again.stored().footFolded).toBe(false);
  });

  it('keeps Keep open hidden while folded, as the window widens too', () => {
    setWidth(1280);
    const { pane } = mount({ stored: { footFolded: true } });
    window.dispatchEvent(new Event('resize'));
    expect((pane.querySelector('.wd-nav-pin') as HTMLElement).hidden).toBe(true);
  });
});

describe('Tint', () => {
  const fill = () => html.style.getPropertyValue('--wd-nav-bg');
  afterEach(() => { html.removeAttribute('style'); });

  it('is off at first: the pane keeps its own fill on a coloured dashboard', () => {
    const { wd } = mount();
    wd.tintNav('#E1ECF9', false);
    expect(fill()).toBe('');
  });

  it('is a switch in Customize, stored, that takes some of the backdrop into the pane', () => {
    const { wd, pane, stored, customize } = mount();
    wd.tintNav('#0B1A2E', true);
    customize();
    const box = pane.querySelector('#wd-nav-tint') as HTMLInputElement;
    expect(box.checked).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(stored().tint).toBe(true);
    expect(fill()).toBe('#101a28'); // 60 % of the dark ocean into the dark tile
    expect(html.classList.contains('wd-nav-tinted')).toBe(true); // the current row a shade of the tint, not blue
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(fill()).toBe('');
    expect(html.classList.contains('wd-nav-tinted')).toBe(false);
  });

  it('follows the view: none for Default and the front page, light and dark each their own', () => {
    const { wd } = mount({ stored: { tint: true } });
    wd.tintNav('#E1ECF9', false);
    expect(fill()).toBe('#edf4fb');
    wd.tintNav(null, false);
    expect(fill()).toBe('');
  });

  it('takes less of a bright colour of the user\'s own in dark mode, so the text still reads', () => {
    const { wd } = mount({ stored: { tint: true } });
    wd.tintNav('#ffd400', true);
    expect(fill()).not.toBe('');
    expect(hardToRead(fill(), true)).toBe(false);
  });
});
