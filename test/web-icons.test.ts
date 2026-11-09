// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runFile } from './helpers/loadWidget.js';

// The web dashboards' chosen icons (settings/dashboard-icons.js), with a stand-in for the page's shared object.
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

const PICTURE = 'data:image/webp;base64,AAAA';
const flush = () => new Promise(resolve => setTimeout(resolve));

function mount(opts: { front?: any; icons?: () => Promise<any> } = {}) {
  document.head.innerHTML = '<link rel="icon" href="data:image/svg+xml,default">';
  (window as any).WidgetkeeperKit = { icons: { home: { d: 'M1 1' }, play: { d: 'M2 2', fill: true } } };
  let part: ((wd: any) => void) | null = null;
  (window as any).WidgetkeeperWeb = { part: (_: string, fn: (wd: any) => void) => { part = fn; } };
  runFile('settings/dashboard-icons.js');
  const wd: Record<string, any> = {
    el, button, t: (s: string) => s, icon: (name: string) => el('i', `icon-${name}`),
    request: vi.fn(opts.icons ?? (async () => [{ id: 'home', name: 'Home' }, { id: 'play', name: 'Play' }, { id: 'gone', name: 'Gone' }])),
    frontPage: opts.front ?? { widgets: true, sections: [] },
    saveFront: vi.fn(), brandChanged: vi.fn(),
    matchesWords: (q: string, text: string) => text.toLowerCase().includes(q.toLowerCase()),
    dialog: () => {
      const d = el('dialog') as any;
      const body = el('div');
      d.append(body);
      document.body.append(d);
      d.showModal = () => { d.open = true; };
      d.close = () => { d.open = false; };
      return { d, body };
    },
  };
  part!(wd);
  return wd;
}
const setRow = (label: string, hint: string, control: HTMLElement) => { const r = el('div', null, label); r.append(control); return r; };
const favicon = () => document.querySelector('link[rel="icon"]')!.getAttribute('href');

afterEach(() => { document.body.innerHTML = ''; });

describe('a chosen icon', () => {
  it('is a picture, a glyph, or nothing for none and for an icon no longer known', () => {
    const wd = mount();
    expect(wd.iconNode(PICTURE).querySelector('img').getAttribute('src')).toBe(PICTURE);
    expect(wd.iconNode('home').querySelector('path').getAttribute('d')).toBe('M1 1');
    expect(wd.iconNode('play').querySelector('path').getAttribute('class')).toBe('filled');
    for (const none of [undefined, '', 'gone', 'constructor']) expect(wd.iconNode(none)).toBeNull();
  });

  it('shows as the browser tab\'s icon, and the app\'s again without one', () => {
    const wd = mount();
    wd.setFavicon(PICTURE);
    expect(favicon()).toBe(PICTURE);
    wd.setFavicon('home');
    expect(decodeURIComponent(favicon()!)).toContain('d="M1 1"');
    wd.setFavicon(undefined);
    expect(favicon()).toBe('data:image/svg+xml,default');
  });
});

describe('the icon picker', () => {
  it('lists the known icons, searches them, and hands back the choice or none', async () => {
    const wd = mount();
    const picked = vi.fn();
    wd.pickIcon({ value: 'play', noneLabel: 'None', picked });
    await flush();
    const items = () => [...document.querySelectorAll('.wd-iconpick-item')];
    expect(items().map(b => b.getAttribute('aria-label'))).toEqual(['Home', 'Play']); // not `gone`, which the kit can't draw
    expect(items()[1].getAttribute('aria-current')).toBe('true');
    const search = document.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'hom';
    search.dispatchEvent(new Event('input'));
    expect(items().map(b => b.getAttribute('aria-label'))).toEqual(['Home']);
    (items()[0] as HTMLElement).click();
    expect(picked).toHaveBeenCalledWith('home');
    wd.pickIcon({ value: 'play', noneLabel: 'None', picked });
    ([...document.querySelectorAll('button')].find(b => b.textContent === 'None') as HTMLElement).click();
    expect(picked).toHaveBeenLastCalledWith(null);
  });

  it('still works when the names can\'t be read', async () => {
    const wd = mount({ icons: async () => { throw new Error('busy'); } });
    wd.pickIcon({ value: null, noneLabel: 'None', picked: vi.fn() });
    await flush();
    expect(document.querySelectorAll('.wd-iconpick-item')).toHaveLength(2);
  });
});

describe('the Header settings', () => {
  it('saves the name with the icon that\'s there, and an emptied name and icon as nothing', () => {
    const wd = mount({ front: { widgets: true, sections: [], brand: { icon: 'home' } } });
    const section = wd.brandSection(setRow);
    const name = section.querySelector('#wd-brand-name');
    name.value = '  Solbakken ';
    name.dispatchEvent(new Event('change'));
    expect(name.value).toBe('Solbakken');
    expect(wd.saveFront).toHaveBeenLastCalledWith({ brand: { icon: 'home', name: 'Solbakken' } });
    expect(wd.brandChanged).toHaveBeenCalledTimes(1);
    name.value = '';
    name.dispatchEvent(new Event('change'));
    expect(wd.saveFront).toHaveBeenLastCalledWith({ brand: { icon: 'home' } });
    expect(wd.frontPage.brand).toEqual({ icon: 'home' });
  });

  it('takes the brand away when neither is left', () => {
    const wd = mount({ front: { widgets: true, sections: [], brand: { name: 'Solbakken' } } });
    const name = wd.brandSection(setRow).querySelector('#wd-brand-name');
    name.value = '';
    name.dispatchEvent(new Event('change'));
    expect(wd.saveFront).toHaveBeenLastCalledWith({ brand: {} });
    expect(wd.frontPage).not.toHaveProperty('brand');
  });
});

describe('the page around them', () => {
  it('loads the part and the icons on every page', () => {
    expect(readFileSync('settings/dashboard.js', 'utf8')).toMatch(/const PARTS = \[[^\]]*'icons'/);
    for (const page of ['settings/dashboard.html', 'dev/web-preview.html', 'dev/web-showcase.html']) {
      const html = readFileSync(page, 'utf8');
      expect(html).toContain('dashboard-icons.js');
      expect(html.indexOf('kit.js')).toBeLessThan(html.indexOf('icons.js'));
    }
    expect(readFileSync('settings/dashboard.html', 'utf8')).toContain('../widgets/spacer/icons.js'); // not public/: a 404 on the Homey
  });

  it('keeps pictures to the size the app takes', () => {
    const page = readFileSync('settings/dashboard-icons.js', 'utf8');
    const service = readFileSync('lib/WebDashboardService.ts', 'utf8');
    expect(page.match(/MAX_PICTURE = (\d+)/)![1]).toBe(service.match(/MAX_ICON_PICTURE = (\d+)/)![1]);
  });
});
