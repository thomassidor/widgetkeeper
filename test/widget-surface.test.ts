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

describe("every widget's fill follows it", () => {
  it('no tile or card is a fixed dark colour', () => {
    for (const id of WIDGETS) {
      for (const css of stylesheets(id)) {
        expect(css, id).not.toMatch(/--[a-z]+-(tile|card|bg|base): *#(181920|2B2C36|1F2029)/);
        expect(css, id).not.toMatch(/^ {2}background-color: #181920;/m);
      }
    }
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
