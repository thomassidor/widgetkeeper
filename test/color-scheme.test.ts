// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KIT, loadMount, loadWidget, runFile, type WidgetName } from './helpers/loadWidget.js';

// The Colour style setting (`colorStyle`: Muted or Vivid, kit.css's palette) and the colour pickers it goes with.
const SCHEME_WIDGETS: WidgetName[] = ['quickactions', 'sensoralarms', 'locks', 'values', 'lights', 'lightrooms', 'curtains', 'dayssince', 'textline',
  'timers', 'flows', 'variables', 'varpresets', 'thermostat', 'price', 'heatmap', 'sparklines', 'charts', 'electricity', 'media', 'sensordots', 'roomhealth',
  'valuematrix', 'valueboard', 'shortcuts', 'keypad', 'totals', 'scatter', 'typicalday', 'dailyrange', 'compare', 'timeline', 'stacked', 'lines', 'gauge', 'combined', 'flowtiles'];
// Widgets whose fixed state colour became a `color` setting with Colour style.
const PICKERS: WidgetName[] = ['quickactions', 'variables', 'curtains', 'media', 'timers', 'totals', 'scatter', 'typicalday', 'dailyrange', 'compare', 'gauge'];

type Setting = { id: string, type: string, title: Record<string, string>, hint?: Record<string, string>, value?: unknown, values?: { id: string, title: Record<string, string> }[] };
const settings = (id: string): Setting[] => JSON.parse(readFileSync(`widgets/${id}/widget.compose.json`, 'utf8')).settings;
const setting = (id: string, key: string) => settings(id).find(s => s.id === key);
const css = (id: string) => readFileSync(`widgets/${id}/public/widget.css`, 'utf8');
const mountName = (id: string) => readFileSync(`widgets/${id}/public/mount.js`, 'utf8').match(/window\.(mount\w+Widget) =/)![1];

describe('the Colour style setting', () => {
  const values = setting('values', 'colorStyle')!;

  it('is Muted (soft) or Vivid, the default first', () => {
    expect(values.type).toBe('dropdown');
    expect(values.value).toBe('soft');
    expect(values.values!.map(v => v.id)).toEqual(['soft', 'deep']);
    expect(values.values!.map(v => v.title.en)).toEqual(['Muted', 'Vivid']);
  });

  it.each(SCHEME_WIDGETS)('%s: has it, the same as everywhere', (id) => {
    const s = setting(id, 'colorStyle');
    expect(s).toBeDefined();
    expect({ ...s, hint: undefined }).toEqual({ ...values, hint: undefined });
    expect(Object.keys(s!.hint!).length).toBe(13);
  });

  it('Weather has Vivid (`card`) as a theme of its own Colour style instead', () => {
    expect(setting('weather', 'colorStyle')).toBeUndefined();
    const theme = setting('weather', 'theme')!;
    expect(theme.values!.find(v => v.id === 'card')!.title).toEqual(values.values![1].title);
    expect(readFileSync('widgets/weather/public/widget.js', 'utf8')).toMatch(/const THEMES = \[[^\]]*'card'/);
    expect(css('weather')).toContain('.wf-theme-card');
  });

  it.each(PICKERS)('%s: has a colour setting, Heatmap\'s six colours (blue by default), before Colour style', (id) => {
    const heat = setting('heatmap', 'color')!;
    const color = setting(id, 'color')!;
    expect({ ...color, hint: undefined }).toEqual({ ...heat, hint: undefined });
    expect(color.value).toBe('blue');
    const ids = settings(id).map(s => s.id);
    expect(ids.indexOf('colorStyle')).toBe(ids.indexOf('color') + 1);
  });

  it.each(SCHEME_WIDGETS)('%s: its mount passes the setting on, and its CSS has Vivid rules', (id) => {
    expect(readFileSync(`widgets/${id}/public/mount.js`, 'utf8')).toContain('colorStyle: settings.colorStyle');
    if (PICKERS.includes(id)) expect(readFileSync(`widgets/${id}/public/mount.js`, 'utf8')).toContain('color: settings.color');
    const own = id === 'thermostat' || id === 'varpresets' ? css(id) + readFileSync('widgets/thermostat/public/presets.css', 'utf8') : css(id);
    expect(own).toMatch(/\.wk-deep\b/);
  });
});

describe('kit.js colours', () => {
  let kit: any;
  beforeEach(() => {
    runFile(`widgets/${KIT.replace('/', '/public/')}`);
    kit = (window as any).WidgetkeeperKit;
  });

  it('reads Vivid, and Device Values\' old Bright as Vivid; anything else is the default', () => {
    expect(kit.colorStyle('deep')).toBe('deep');
    expect(kit.colorStyle('bright')).toBe('deep');
    for (const v of [undefined, null, '', 'soft', 'Vivid', 42]) expect(kit.colorStyle(v)).toBe('soft');
  });

  it('puts a root on the palette: wk, wk-deep and the colour (else the fallback, or none)', () => {
    const root = document.createElement('div');
    expect(kit.applyColors(root, { style: 'deep', color: 'purple', fallback: 'blue' })).toBe('deep');
    expect([...root.classList]).toEqual(['wk', 'wk-deep']);
    expect(root.dataset.wkColor).toBe('purple');
    expect(kit.applyColors(root, { style: 'soft', color: 'magenta', fallback: 'blue' })).toBe('soft');
    expect([...root.classList]).toEqual(['wk']);
    expect(root.dataset.wkColor).toBe('blue');
    kit.applyColors(root, {});
    expect('wkColor' in root.dataset).toBe(false);
  });

  it('kit.css has both sets of every colour (bright and shade, with the text on each), and the scheme picks one', () => {
    const sheet = readFileSync('widgets/spacer/public/kit.css', 'utf8');
    const deep = sheet.slice(sheet.indexOf('.wk.wk-deep {'));
    for (const c of kit.COLORS) {
      for (const set of ['bright', 'shade']) {
        expect(sheet).toContain(`--wk-${c}-${set}:`);
        expect(sheet).toContain(`--wk-on-${c}-${set}:`);
      }
      expect(sheet).toContain(`--wk-${c}: var(--wk-${c}-bright);`);
      expect(deep).toContain(`--wk-${c}: var(--wk-${c}-shade);`);
      expect(sheet).toContain(`[data-wk-color="${c}"]`);
    }
  });
});

describe('a mounted widget', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  const fakeHomey = (s: object) => ({
    api: vi.fn(async () => { throw new Error('offline'); }), on: vi.fn(), ready: vi.fn(), setHeight: vi.fn(),
    getSettings: () => s, getDeviceIds: () => ['d1'], getWidgetInstanceId: () => 'w1', hapticFeedback: vi.fn(), __: (k: string) => k,
  });
  const mount = (id: WidgetName, s: object) => {
    const win = loadWidget(id);
    loadMount(id);
    const frame = document.createElement('div');
    const root = document.createElement('div');
    frame.append(root);
    document.body.append(frame);
    win[mountName(id)](fakeHomey({ device: { id: 'd1' }, ...s }), { root, frame });
    return root;
  };

  it.each(SCHEME_WIDGETS)('%s: takes Vivid (and a colour) from its settings', (id) => {
    const root = mount(id, { colorStyle: 'deep', color: 'purple' });
    expect(root.classList.contains('wk')).toBe(true);
    expect(root.classList.contains('wk-deep')).toBe(true);
    if (PICKERS.includes(id)) expect(root.dataset.wkColor).toBe('purple');
  });

  it.each(SCHEME_WIDGETS)('%s: is the default without the setting (a widget placed before it)', (id) => {
    const root = mount(id, {});
    expect(root.classList.contains('wk')).toBe(true);
    expect(root.classList.contains('wk-deep')).toBe(false);
    if (PICKERS.includes(id)) expect(root.dataset.wkColor).toBe('blue');
  });
});

describe('the colour dropdowns (1.2.0: teal, cyan, indigo, pink, brown and grey)', () => {
  const kitColors = (): string[] => JSON.parse(readFileSync('widgets/spacer/public/kit.js', 'utf8').match(/const COLORS = (\[[^\]]*\]);/)![1].replace(/'/g, '"'));
  const widgetIds = SCHEME_WIDGETS.filter(id => settings(id).some(s => s.values?.some(v => v.id === 'purple') && s.values.some(v => v.id === 'blue')));

  it.each(widgetIds)("%s: every colour setting offers the kit's whole palette, named alike", (id) => {
    const named = new Map<string, Record<string, string>>();
    for (const s of settings(id).filter(x => x.values?.some(v => v.id === 'purple') && x.values.some(v => v.id === 'blue'))) {
      const ids = s.values!.map(v => v.id);
      for (const c of kitColors()) expect(ids, `${id}.${s.id}`).toContain(c);
      expect(new Set(ids).size).toBe(ids.length);
      for (const v of s.values!) {
        if (!named.has(v.id)) named.set(v.id, v.title);
        expect(v.title, `${id}.${s.id}.${v.id}`).toEqual(named.get(v.id));
      }
    }
  });

  it('every widget CSS that lists purple by name lists the new colours too', () => {
    for (const id of ['values', 'textline', 'flows', 'shortcuts', 'heatmap', 'charts', 'sensordots', 'keypad']) {
      const sheet = css(id);
      for (const c of ['teal', 'cyan', 'indigo', 'pink', 'brown']) expect(sheet, `${id}: ${c}`).toContain(`="${c}"]`);
    }
  });
});
