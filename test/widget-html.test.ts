import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { DEPS, KIT, type WidgetName } from './helpers/loadWidget.js';

// The widget tests load widget.js but not index.html, whose inline script wires it to Homey. A syntax
// error there leaves the widget on Homey's spinner forever (a raw line break inside a regex did).
const WIDGETS = readdirSync('widgets', { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);

describe('widget index.html', () => {
  it.each(WIDGETS)('%s: the inline scripts parse', (id) => {
    const html = readFileSync(`widgets/${id}/public/index.html`, 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const code of scripts) expect(() => new Script(code)).not.toThrow();
  });
});

// Most shared helpers are in the kit (widgets/spacer/public/kit.js); the copies left must stay equal.
describe('copied widget helpers', () => {
  const read = (id: string, file: string) => readFileSync(`widgets/${id}/public/${file}`, 'utf8').replace(/\r\n/g, '\n');
  /** A function's source, from its `function` line to its closing brace, dedented (copies nest at different depths). */
  const source = (id: string, fn: string, file = 'widget.js') => {
    const m = read(id, file).match(new RegExp(String.raw`\n( *)function ${fn}\([\s\S]*?\n\1}\n`));
    return m ? m[0].replace(new RegExp(`\n${m[1]}`, 'g'), '\n') : null;
  };
  /** Every copy is found and equal to the first, after `normalise`. */
  const expectSame = (copies: (string | null)[], normalise = (s: string) => s) => {
    expect(copies[0]).not.toBeNull();
    for (const c of copies) expect(c === null ? c : normalise(c)).toBe(normalise(copies[0]!));
  };

  it('no widget keeps a copy of a kit helper', () => {
    const kit = ['undoTextZoom', 'el', 'setMask', 'tileNames', 'timeFormatter', 'formatSince', 'baseTitle', 'lowestSlot', 'loadMarks', 'wireTileNames',
      'wireFrame', 'getDeviceIds', 'perfParam', 'bodyHeight', 'frameHeight', 'touchGuard', 'messageLine', 'wireDeviceState',
      'wireBar', 'setBlend', 'swatchList', 'roomTiles', 'optimistic'];
    for (const id of WIDGETS) {
      for (const file of ['widget.js', 'mount.js', 'index.html']) {
        if (!existsSync(`widgets/${id}/public/${file}`)) continue;
        for (const fn of kit) expect(source(id, fn, file), `${id}/${file}: ${fn}()`).toBeNull();
      }
    }
    // Common names: only where the copies were (Room Health and Variables have functions of their own by these names).
    for (const id of ['values', 'sparklines', 'charts']) {
      for (const fn of ['scaled', 'formatNumber', 'formatValue']) expect(source(id, fn), `${id}: ${fn}()`).toBeNull();
    }
  });

  it("every mount.js but the spacer's wires its frame through the kit (a chart widget's through the chart module's wireChart())", () => {
    for (const id of WIDGETS.filter(w => w !== 'spacer')) {
      const mount = read(id, 'mount.js');
      expect(mount, `${id}/mount.js`).toMatch(/wireFrame\(Homey, frame\)|WidgetkeeperChart\.wireChart\(Homey, \{ frame \}/);
      expect(mount, `${id}/mount.js`).not.toMatch(/readySent|Homey\.ready\(|Homey\.setHeight\(/);
    }
  });

  it("taps go through the kit's onTap() (the stack's swipe-aware taps are its own design)", () => {
    for (const id of WIDGETS.filter(w => w !== 'stack')) {
      const js = read(id, 'widget.js');
      expect(js, `${id}: tap logic of its own`).not.toMatch(/TAP_SLOP|lastTouchTap|Math\.hypot\(p\.clientX/);
    }
  });

  it("transient messages go through the kit's messageLine()", () => {
    // The thermostat's panel message is its own.
    for (const id of WIDGETS.filter(w => w !== 'thermostat')) {
      expect(read(id, 'widget.js'), `${id}: a message timer of its own`).not.toMatch(/let message(Text|Timer)\b/);
    }
    expect(read('thermostat', 'presets.js')).not.toMatch(/let message(Text|Timer)\b/);
  });

  it("Flow Tiles builds Device Values' tile as it does (its stylesheet is Device Values')", () => {
    expectSame(['values', 'flowtiles'].map(id => source(id, 'parts')));
  });

  it('nameKeys() is the same in every widget with repeatable slots', () => {
    expectSame(['values', 'sparklines', 'variables'].map(id => source(id, 'nameKeys')));
  });

  it("Light Controls and Lights by Room keep no copy of the kit's light state (lights.model())", () => {
    for (const id of ['lights', 'lightrooms']) {
      for (const fn of ['shown', 'hope', 'isOn', 'brightness', 'itemBrightness', 'colorsOf', 'isCurrent']) expect(source(id, fn), `${id}: ${fn}()`).toBeNull();
      expect(read(id, 'widget.js'), `${id}: an optimistic map of its own`).not.toMatch(/const optimistic = new Map/);
    }
    expect(read('curtains', 'widget.js'), 'curtains: an optimistic map of its own').not.toMatch(/const optimistic = new Map/);
  });



  /** The CSS without comments, with each widget's class prefix (`tw-`, `hm-` …) made `x-`. */
  const css = (id: string, prefix: string, file = 'widget.css') => read(id, file).replace(/\/\*[\s\S]*?\*\//g, '').replace(new RegExp(String.raw`\b${prefix}-`, 'g'), 'x-');

  it("the non-transparent widgets' dark frame is the same", () => {
    const frame = (id: string, prefix: string, file?: string) => {
      const m = css(id, prefix, file).match(/\.homey-dark-mode \.x-frame, \.x-frame\.homey-dark-mode \{[\s\S]*?body\.x-frame\.homey-dark-mode::after \{ position: fixed; \}\n/);
      return m ? m[0].replace(/\n+/g, '\n') : null;
    };
    // Thermostat Presets' is in the presets module, which Variable Presets loads too.
    expectSame([['thermostat', 'tw', 'presets.css'], ['heatmap', 'hm'], ['media', 'mw'], ['weather', 'wf'], ['keypad', 'kp']].map(([id, p, file]) => frame(id, p, file)));
  });

  it("the native tiles' rim is the same everywhere", () => {
    // Every stylesheet of a widget: the shared presets.css has Thermostat Presets' frame.
    const sheets = (id: string) => readdirSync(`widgets/${id}/public`).filter(f => f.endsWith('.css'));
    const rims = WIDGETS.flatMap(id => sheets(id).flatMap(f => [...read(id, f).matchAll(/\{([^{}]*inset 0 1px 0 rgb\(255 255 255[^{}]*)\}/g)].map(m => m[1].trim())));
    expect(rims.length).toBeGreaterThanOrEqual(16);
    // A tile's rim follows its own radius; a frame's (thermostat, heatmap, media, weather) the frame's 10 px.
    const tile = "content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;\n  box-shadow: inset 0 1px 0 rgb(255 255 255 / .05), inset 0 0 0 1px rgb(255 255 255 / .03);";
    for (const r of rims) expect([tile, tile.replace('inherit', '10px')]).toContain(r);
  });
});

describe('the settings\' order', () => {
  const settingsOf = (id: string) => JSON.parse(readFileSync(`widgets/${id}/widget.compose.json`, 'utf8')).settings || [];
  // Rows of a numbered group, or Room Health's ranges (the one unnumbered list kept after Colour style).
  const inGroup = (s: any, id: string) => /\d/.test(s.id) || s.title.en.startsWith('\u2003') || (id === 'roomhealth' && /M(in|ax)$/.test(s.id));
  const ids = WIDGETS.filter(id => existsSync(`widgets/${id}/widget.compose.json`));
  it.each(ids)('%s: Rename tiles first, Colour right before Colour style, only groups after it', (id) => {
    const list = settingsOf(id);
    const at = (k: string) => list.findIndex((s: any) => s.id === k);
    if (at('renameTiles') >= 0) expect(at('renameTiles')).toBe(0);
    if (at('colorStyle') < 0) return;
    if (at('color') >= 0) expect(at('color')).toBe(at('colorStyle') - 1);
    expect(list.slice(at('colorStyle') + 1).filter((s: any) => !inGroup(s, id)).map((s: any) => s.id)).toEqual([]);
  });
});

describe('haptic feedback', () => {
  // A tap that starts, sets or switches something vibrates (the settings review, 2026-11-04: six widgets that act didn't).
  // The rest only show, open a panel or move between pages (the Smart Stack's own).
  const ACTING = ['combined', 'curtains', 'dayssince', 'flows', 'flowtiles', 'keypad', 'lightrooms', 'lights', 'locks', 'media', 'quickactions',
    'shortcuts', 'stack', 'thermostat', 'timers', 'variables', 'varpresets'];
  it('every widget whose taps act calls Homey.hapticFeedback(), in a try', () => {
    for (const id of WIDGETS) {
      if (!existsSync(`widgets/${id}/public/mount.js`)) continue;
      const mount = readFileSync(`widgets/${id}/public/mount.js`, 'utf8');
      expect([id, mount.includes('Homey.hapticFeedback()')]).toEqual([id, ACTING.includes(id)]);
      if (ACTING.includes(id)) expect(mount, id).toMatch(/try \{ if \(Homey\.hapticFeedback\) Homey\.hapticFeedback\(\); \}/);
    }
  });
});

describe('shared files', () => {
  /** The files an index.html loads besides its own widget.*, mount.js and the kit (kit.js, kit.css): `<widget>/<name>` (`../electricity/chart.js` → `electricity/chart.js`). */
  const shared = (id: string, ext: string) => {
    const html = readFileSync(`widgets/${id}/public/index.html`, 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(r => r.endsWith(`.${ext}`));
    return refs.filter(r => !['widget.js', 'widget.css', 'mount.js'].includes(r))
      .map(r => (r.startsWith('../') ? r.slice(3) : `${id}/${r}`))
      .filter(r => r !== KIT && r !== KIT.replace(/.js$/, '.css') && r !== 'spacer/icons.js');
  };

  it.each(WIDGETS)('%s: index.html loads the kit before anything else', (id) => {
    const html = readFileSync(`widgets/${id}/public/index.html`, 'utf8');
    expect([...html.matchAll(/<script src="([^"]+)"/g)][0]?.[1]).toBe('../spacer/kit.js');
    // kit.css (the colour palette, wk / wk-deep) before every other stylesheet, so a widget's own rules can build on it.
    expect([...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)][0]?.[1]).toBe('../spacer/kit.css');
    expect(html).toContain('WidgetkeeperKit.undoTextZoom();');
  });
  it.each(WIDGETS)('%s: index.html loads icons.js right after the kit if it can show an icon setting\'s icon', (id) => {
    const html = readFileSync(`widgets/${id}/public/index.html`, 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    // The Smart Stack for its pages (Media, Days Since, Flow Tiles …), the rest for themselves.
    const shows = ['flows', 'keypad', 'dayssince', 'media', 'shortcuts', 'textline', 'varpresets', 'flowtiles', 'stack'].includes(id);
    if (shows) expect(scripts[1]).toBe('../spacer/icons.js');
    else expect(scripts).not.toContain('../spacer/icons.js');
  });

  it('every widget that draws the kit\'s icons by a setting is in that list', () => {
    const using = WIDGETS.filter((id) => {
      const js = readFileSync(`widgets/${id}/public/widget.js`, 'utf8');
      return /WidgetkeeperKit\.icons/.test(js) || /\bicons\b[^;\n]*=\s*window\.WidgetkeeperKit/.test(js);
    });
    expect(using.filter(id => !readFileSync(`widgets/${id}/public/index.html`, 'utf8').includes('../spacer/icons.js'))).toEqual(['roomhealth']);
  });

  const stackDeps: Record<string, string[]> = new Function(`return ${readFileSync('widgets/stack/public/mount.js', 'utf8')
    .match(/const DEPS = (\{[\s\S]*?\});/)![1]}`)();

  it.each(WIDGETS)('%s: the Smart Stack and the tests load what its index.html loads first', (id) => {
    const js = shared(id, 'js'), css = shared(id, 'css');
    expect(js).toEqual(DEPS[id as WidgetName] || []);
    expect(js.map(f => f.replace(/\.js$/, ''))).toEqual(stackDeps[id] || []);
    expect(css.map(f => f.replace(/\.css$/, ''))).toEqual(stackDeps[id] || []);
    for (const f of [...js, ...css]) expect(existsSync(`widgets/${f.replace('/', '/public/')}`)).toBe(true);
  });

  it("the chart module is loaded by the chart widgets, the presets module by both preset widgets, Device Values' tiles by Flow Tiles", () => {
    expect(Object.keys(stackDeps).sort()).toEqual(['charts', 'compare', 'dailyrange', 'electricity', 'gauge', 'lines', 'scatter', 'stacked', 'thermostat', 'timeline', 'totals', 'typicalday', 'varpresets', 'flowtiles'].sort());
  });
});

describe('fallback strings', () => {
  const en = JSON.parse(readFileSync('locales/en.json', 'utf8'));
  // The stack has no fallback table: it shows the key. The clock has no strings (its text is all Intl's), nor
  // have the spacer and Popups (which draws nothing; its prompt page has its own table, checked below).
  it.each(WIDGETS.filter(id => id !== 'stack' && id !== 'clock' && id !== 'spacer' && id !== 'popups'))("%s: DEFAULT_STRINGS are en.json's", (id) => {
    const js = readFileSync(`widgets/${id}/public/widget.js`, 'utf8').replace(/\r\n/g, '\n');
    const table = js.match(/\n( *)const DEFAULT_STRINGS = (\{[\s\S]*?\n\1\});/);
    // The namespace: `opts.t(`<ns>.${key}`)`, or a chart widget's frame's `prefix: '<ns>'` (the chart module's createFrame()).
    const ns = js.match(/opts\.t\(`(\w+)\.\$\{/) || js.match(/C\.createFrame\(root, \{[^}]*?prefix: '(\w+)'/);
    expect(table && ns).toBeTruthy();
    const strings = new Function(`return ${table![2]}`)();
    for (const [key, value] of Object.entries(strings)) expect([key, value]).toEqual([key, en[ns![1]][key]]);
  });

  it("the popup prompt page's DEFAULT_STRINGS are en.json's popups", () => {
    const js = readFileSync('settings/popup.js', 'utf8').replace(/\r\n/g, '\n');
    const table = js.match(/\n( *)const DEFAULT_STRINGS = (\{[\s\S]*?\n\1\});/);
    expect(table).toBeTruthy();
    expect(new Function(`return ${table![2]}`)()).toEqual(en.popups);
  });
});
