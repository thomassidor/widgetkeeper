// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFrame, frameElements, mountName } from './helpers/fakeFrame.js';
import { loadMount, loadWidget } from './helpers/loadWidget.js';

/** A web dashboard's Widget background: what reaches a widget's frame, and that every widget's fill follows it. */
const WIDGETS = readdirSync('widgets', { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
const stylesheets = (id: string) => readdirSync(`widgets/${id}/public`).filter(f => f.endsWith('.css')).map(f => readFileSync(`widgets/${id}/public/${f}`, 'utf8'));
const KIT_CSS = readFileSync('widgets/spacer/public/kit.css', 'utf8');
/** The widgets with a tile in kit.css's list: a selector in their own stylesheet names one (Flow Tiles' `.ft .vt-tile`). */
const TILE_LIST = new Set(KIT_CSS.match(/html\[data-wk-surface\] :is\(([^)]*)\)/)?.[1].match(/\.[a-z]+-[a-z]+/g));
const TILE_WIDGETS = WIDGETS.filter(id => id !== 'spacer'
  && stylesheets(id).some(css => [...TILE_LIST].some(c => new RegExp(`^[^{}\\n]*\\${c}(?![-\\w])[^{}\\n]*\\{`, 'm').test(css)))).sort();

describe('the kit: applySurface()', () => {
  const html = document.documentElement;
  const inFrame = (data: Record<string, string> | null) => Object.defineProperty(window, 'frameElement', { configurable: true, value: data && { dataset: data } });

  beforeEach(() => {
    inFrame(null);
    html.removeAttribute('style');
    html.removeAttribute('data-wk-surface');
  });

  it("sets the frame's fill and line from the iframe, and takes them away again", () => {
    const { WidgetkeeperKit: kit } = loadWidget('spacer');
    inFrame({ wkSurface: '#f8f5f0', wkSurfaceLine: 'rgb(0 0 0 / 0.11)' });
    kit.applySurface();
    expect(html.style.getPropertyValue('--homey-background-color')).toBe('#f8f5f0');
    expect(html.style.getPropertyValue('--wk-surface')).toBe('#f8f5f0');
    expect(html.style.getPropertyValue('--wk-surface-line')).toBe('rgb(0 0 0 / 0.11)');
    expect(html.hasAttribute('data-wk-surface')).toBe(true);
    inFrame({});
    kit.applySurface();
    expect(html.style.getPropertyValue('--homey-background-color')).toBe('');
    expect(html.style.getPropertyValue('--wk-surface')).toBe('');
    expect(html.hasAttribute('data-wk-surface')).toBe(false);
  });

  it("does nothing on Homey's own dashboards, where a frame's parent can't be read", () => {
    const { WidgetkeeperKit: kit } = loadWidget('spacer');
    kit.applySurface();
    expect(html.getAttribute('style') || '').toBe('');
    expect(html.hasAttribute('data-wk-surface')).toBe(false);
  });
});

describe("the kit: the app's Tile shadows (takeTileShadow, wireTileShadow)", () => {
  const html = document.documentElement;
  const flat = () => html.classList.contains('wk-flat');
  beforeEach(() => { html.classList.remove('wk-flat'); localStorage.clear(); });

  /** A Homey whose every answer is `answer`, and whose realtime can be sent. */
  function homey(answer: unknown) {
    const on: Record<string, (data: unknown) => void> = {};
    const paths: string[] = [];
    return {
      paths, on: (event: string, fn: (data: unknown) => void) => { on[event] = fn; },
      api: async (_method: string, path: string) => { paths.push(path); return answer; },
      getWidgetInstanceId: () => 'w1',
      emit: (event: string, data: unknown) => on[event]?.(data),
    };
  }
  const tick = () => new Promise(r => setTimeout(r, 5));

  it('takes it from an answer, keeps it for the next load, and leaves it for an answer without one', () => {
    const { WidgetkeeperKit: kit } = loadWidget('spacer');
    kit.takeTileShadow({ tileShadow: false });
    expect(flat()).toBe(true);
    expect(localStorage.getItem('widgetkeeper.tileShadow')).toBe('off');
    for (const res of [null, [], { state: [] }, { tileShadow: 'no' }]) kit.takeTileShadow(res);
    expect(flat()).toBe(true);
    kit.takeTileShadow({ tileShadow: true });
    expect(flat()).toBe(false);
    expect(localStorage.getItem('widgetkeeper.tileShadow')).toBe('on');
  });

  it('draws the last one kept before any answer', () => {
    localStorage.setItem('widgetkeeper.tileShadow', 'off');
    loadWidget('spacer');
    expect(flat()).toBe(true);
  });

  it('follows the realtime event, and asks nothing', async () => {
    const { WidgetkeeperKit: kit } = loadWidget('spacer');
    const h = homey({});
    kit.wireTileShadow(h);
    await tick();
    expect(h.paths).toEqual([]);
    h.emit('tileshadow:state', { tileShadow: false });
    expect(flat()).toBe(true);
    expect(() => kit.wireTileShadow({ on() { throw new Error('no'); } })).not.toThrow();
  });

  it('comes with the tile names wrapper and with the time format', async () => {
    const { WidgetkeeperKit: kit } = loadWidget('spacer');
    const names = homey({ state: [1], tileNames: {}, tileShadow: false });
    expect(await kit.wireTileNames(names, () => {}).state('/state?x=1')).toEqual([1]);
    expect(flat()).toBe(true);
    const times = homey({ timeFormat: '24', tileShadow: true });
    kit.wireTimeFormat(times, () => {});
    await tick();
    expect(times.paths).toEqual(['/time-format']);
    expect(flat()).toBe(false);
  });
});

/** Settings that make each tile widget read: a device, a slot, a value, a flow, a dashboard, a board. */
const READING = {
  device: { id: 'd1' }, slot1: { id: 'd1:measure_temperature' }, capability: { id: 'measure_temperature' }, flow1: { id: 'flow:f1' },
  dashboard: { id: 'dash1' }, dashboard1: { id: 'dash1' }, col1: { id: 'measure_temperature' }, board: 'Kitchen', source: 'flow', minutes1: 5, counter1: { id: 'Filter' },
};

describe('every widget with tiles follows the Tile shadows with no request of its own', () => {
  afterEach(() => { vi.useRealTimers(); document.documentElement.classList.remove('wk-flat'); localStorage.clear(); document.body.innerHTML = ''; });

  it.each(TILE_WIDGETS)('%s', async (id) => {
    vi.useFakeTimers();
    const win = loadWidget(id as never);
    loadMount(id as never);
    const { frame, root } = frameElements();
    // Every answer carries it, as the app's do: whichever the widget reads first brings it.
    const Homey = fakeFrame(READING, {
      instance: id === 'shortcuts' ? 'web-dash1-w1' : 'w1',
      api: async () => ({ tileShadow: false, tileNames: {}, timeFormat: '24', ok: true, pages: [], requests: [] }),
    });
    win[mountName(id)](Homey, { root, frame });
    await vi.advanceTimersByTimeAsync(2000);
    expect(Homey.on.mock.calls.some(c => c[0] === 'tileshadow:state')).toBe(true);
    expect(Homey.api.mock.calls.length).toBeGreaterThan(0);
    expect(Homey.api.mock.calls.some(c => String(c[1]).startsWith('/tile-shadow'))).toBe(false);
    expect(document.documentElement.classList.contains('wk-flat')).toBe(true);
  });
});

describe("every widget's fill follows it", () => {
  it('no tile or card is a fixed dark colour', () => {
    for (const id of WIDGETS) {
      for (const css of stylesheets(id)) {
        expect(css, id).not.toMatch(/--[a-z]+-(tile|card|bg|base): *#(181920|2B2C36|1F2029)/);
        expect(css, id).not.toMatch(/^ {2}background-color: #181920;/m);
      }
    }
  });

  it("kit.css gives the light-mode tile shadow to the same tiles as the line", () => {
    const list = (re: RegExp) => new Set(KIT_CSS.match(re)?.[1].match(/\.[a-z]+-[a-z]+/g));
    const line = list(/html\[data-wk-surface\] :is\(([^)]*)\)/);
    const shadow = list(/:where\(([^)]*)\) \{\s*box-shadow: var\(--wk-tile-shadow\)/);
    expect(line.size).toBeGreaterThan(20);
    expect([...shadow].sort()).toEqual([...line].sort());
    expect(KIT_CSS).toMatch(/\.homey-dark-mode \{ --wk-tile-shadow: none; \}/);
  });

  it("the widgets with tiles in kit.css's list are the ones that follow the app's Tile shadows", () => {
    const wired = WIDGETS.filter(id => { try { return /wireTileShadow\(Homey\)/.test(readFileSync(`widgets/${id}/public/mount.js`, 'utf8')); } catch { return false; } }).sort();
    expect(TILE_WIDGETS.length).toBeGreaterThan(20);
    expect(wired).toEqual(TILE_WIDGETS);
  });

  it("kit.css takes the shadow away when the app's Tile shadows are off", () => {
    expect(KIT_CSS).toMatch(/html\.wk-flat, html\.wk-flat \* \{ --wk-tile-shadow: none; \}/);
  });

  it("kit.css gives every transparent widget's tiles their line", () => {
    for (const id of WIDGETS) {
      if (!readFileSync(`widgets/${id}/widget.compose.json`, 'utf8').match(/"transparent": *true/)) continue;
      for (const css of stylesheets(id)) {
        // A tile is what paints the widget's fill, or what has the dark rim on it.
        const tiles = [...css.matchAll(/^([^\n{}]*)\{\s*(?:[^{}]*;\s*)?background: var\(--[a-z]+-(?:tile|bg)\)/gm)].flatMap(m => m[1].match(/\.[a-z]+-[a-z]+/g) ?? [])
          .concat([...css.matchAll(/\.homey-dark-mode (\.[a-z]+-[a-z]+)::after/g)].map(m => m[1]));
        for (const tile of new Set(tiles)) {
          if (['.sk-message', '.has-message', '.sk-slide'].includes(tile)) continue; // the Smart Stack's message line, not a tile
          expect(KIT_CSS, `${id}: ${tile}`).toMatch(new RegExp(`\\${tile}[,)]`));
        }
      }
    }
  });
});
