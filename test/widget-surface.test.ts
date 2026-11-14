// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadWidget } from './helpers/loadWidget.js';

/** A web dashboard's Widget background: what reaches a widget's frame, and that every widget's fill follows it. */
const WIDGETS = readdirSync('widgets', { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
const stylesheets = (id: string) => readdirSync(`widgets/${id}/public`).filter(f => f.endsWith('.css')).map(f => readFileSync(`widgets/${id}/public/${f}`, 'utf8'));
const KIT_CSS = readFileSync('widgets/spacer/public/kit.css', 'utf8');

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

describe('the kit: the app\'s Tile shadows (wireTileShadow)', () => {
  const html = document.documentElement;
  beforeEach(() => { html.classList.remove('wk-flat'); localStorage.clear(); });

  /** A Homey whose `GET /tile-shadow` answers `answer`, and whose realtime can be sent. */
  function homey(answer: unknown) {
    const on: Record<string, (data: unknown) => void> = {};
    const paths: string[] = [];
    return {
      paths, on: (event: string, fn: (data: unknown) => void) => { on[event] = fn; },
      api: async (_method: string, path: string) => { paths.push(path); return path === '/tile-shadow' ? answer : {}; },
      send: (data: unknown) => on['tileshadow:state']?.(data),
    };
  }
  const tick = () => new Promise(r => setTimeout(r, 5));

  it('turns the shadow off and on as the app says, and keeps it for the next load', async () => {
    const { WidgetkeeperKit: kit } = loadWidget('spacer');
    const h = homey({ tileShadow: false });
    kit.wireTileShadow(h);
    await tick();
    // Not before the widget's own first request.
    expect(h.paths).toEqual([]);
    expect(html.classList.contains('wk-flat')).toBe(false);
    await h.api('GET', '/state');
    await tick();
    expect(h.paths).toEqual(['/state', '/tile-shadow']);
    await h.api('GET', '/state');
    await tick();
    expect(h.paths).toEqual(['/state', '/tile-shadow', '/state']);
    expect(html.classList.contains('wk-flat')).toBe(true);
    expect(localStorage.getItem('widgetkeeper.tileShadow')).toBe('off');
    h.send({ tileShadow: true });
    expect(html.classList.contains('wk-flat')).toBe(false);
    expect(localStorage.getItem('widgetkeeper.tileShadow')).toBe('on');
  });

  it('draws the last one kept before the app answers, and an answer without one changes nothing', async () => {
    localStorage.setItem('widgetkeeper.tileShadow', 'off');
    const { WidgetkeeperKit: kit } = loadWidget('spacer');
    expect(html.classList.contains('wk-flat')).toBe(true);
    const h = homey({});
    kit.wireTileShadow(h);
    await h.api('GET', '/state');
    await tick();
    expect(html.classList.contains('wk-flat')).toBe(true);
  });

  it('keeps going when Homey fails', async () => {
    const { WidgetkeeperKit: kit } = loadWidget('spacer');
    kit.wireTileShadow({ on() { throw new Error('no'); }, api() { throw new Error('no'); } });
    await tick();
    expect(html.classList.contains('wk-flat')).toBe(false);
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

  it("the widgets with tiles in kit.css's list follow the app's Tile shadows: the route and the mount's call", () => {
    const list = new Set(KIT_CSS.match(/html\[data-wk-surface\] :is\(([^)]*)\)/)?.[1].match(/\.[a-z]+-[a-z]+/g));
    // A widget has tiles when a selector in its own stylesheet names one of the list's classes (Flow Tiles' `.ft .vt-tile`).
    const owns = (id: string) => stylesheets(id).some(css => [...list].some(c => new RegExp(`^[^{}\\n]*\\${c}(?![-\\w])[^{}\\n]*\\{`, 'm').test(css)));
    const withTiles = WIDGETS.filter(id => id !== 'spacer' && owns(id)).sort();
    const routed = WIDGETS.filter(id => /"path": "\/tile-shadow"/.test(readFileSync(`widgets/${id}/widget.compose.json`, 'utf8'))).sort();
    const wired = WIDGETS.filter(id => { try { return /wireTileShadow\(Homey\)/.test(readFileSync(`widgets/${id}/public/mount.js`, 'utf8')); } catch { return false; } }).sort();
    expect(withTiles.length).toBeGreaterThan(20);
    expect(routed).toEqual(withTiles);
    expect(wired).toEqual(withTiles);
    for (const id of withTiles) expect(readFileSync(`widgets/${id}/api.ts`, 'utf8'), id).toMatch(/\.\.\.tileShadowRoutes,/);
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
