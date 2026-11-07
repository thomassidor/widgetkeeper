import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// The widget pages' Looks (docs/widgets/<id>.md): the images scripts/render-variants.mjs makes from dev/variants.js.
const PAGES = readdirSync('docs/widgets').filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
const WITHOUT = ['spacer']; // it draws nothing
const images = (id: string) => [...readFileSync(`docs/widgets/${id}.md`, 'utf8').matchAll(/<img src="\.\.\/variants\/([^"]+)"[^>]*alt="([^"]+)"/g)];

type Variant = { key: string, label: string, light?: boolean, opts?: Record<string, unknown>, act?: unknown };
const list = { window: {} as { VARIANTS?: Record<string, Variant[]> } };
runInNewContext(readFileSync('dev/variants-list.js', 'utf8'), list);
const VARIANTS = list.window.VARIANTS as Record<string, Variant[]>;

/** Every option a widget's Looks set, however deep (Chart · Basic's `charts: [{style}]`). */
function optionsUsed(value: unknown, found = new Set<string>()): Set<string> {
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (!Array.isArray(value)) found.add(k);
      optionsUsed(v, found);
    }
  }
  return found;
}

/** An image that only changes colours says little: the Looks are there to show what a widget can do. */
const onlyColours = (x: Variant) => !x.act && Object.keys(x.opts || {}).every(k => k === 'colorStyle' || k === 'color');
/** Widgets with little to show. The others need this many images that do more than change colours. */
const FEW_MODES: Record<string, number> = { shortcuts: 1, webpage: 1, flows: 2, varpresets: 2, clock: 2, cameras: 3, dailyrange: 3, dayssince: 3, popups: 3, sensordots: 3, textline: 3, thermostat: 3, typicalday: 3, variables: 3 };

/**
 * The settings that change how a widget looks (not what it reads or does), each in some image. A new one goes here and
 * on the widget's Looks. The ones a scene shows (Combined Value's `show`, Pollen's kinds) are made up in dev/variants.js.
 */
const SHOWN_SETTINGS: Record<string, string[]> = {
  cameras: ['layout'],
  charts: ['overlay', 'sharedScale', 'plotHeight', 'legend', 'showHeader', 'style', 'span', 'smooth'],
  clock: ['showWeather'],
  combined: ['chart'],
  compare: ['sort', 'showRange', 'legend', 'showHeader', 'span', 'color'],
  curtains: ['showState', 'groupByZone', 'wideLast', 'color'],
  dailyrange: ['average', 'range', 'plotHeight', 'legend', 'color'],
  dayssince: ['units', 'show'],
  electricity: ['layout', 'separateUsage', 'usageColor', 'showUsage', 'showPrices', 'smooth', 'liveWindow', 'nextLow'],
  flows: ['columns'],
  flowtiles: ['tileStyle', 'columns', 'showAge'],
  gauge: ['layout', 'zones', 'scale', 'yellowAt', 'redAt', 'showRange', 'legend', 'color'],
  heatmap: ['color', 'showLegend', 'showScale', 'period', 'step'],
  keypad: ['keypad', 'layout', 'background'],
  lightrooms: ['showMoods', 'palette', 'open'],
  lights: ['groupByZone', 'wideLast', 'palette'],
  lines: ['style', 'plotHeight', 'legend', 'range', 'smooth', 'names'],
  locks: ['view', 'allowUnlock', 'allowOpen'],
  media: ['layout', 'volumeLayout', 'showProgress', 'showShuffle', 'canSwitch', 'buttons', 'color'],
  pollen: ['density', 'showUv'],
  popups: ['popup', 'countdown'],
  price: ['hours', 'tint', 'color'],
  quickactions: ['columns', 'tileStyle', 'activeStyle', 'wideLast', 'color'],
  roomhealth: ['layout', 'columns', 'greenWhenFine'],
  scatter: ['trend', 'fade', 'dots', 'plotHeight', 'legend', 'showHeader', 'color'],
  sensoralarms: ['columns', 'wideLast'],
  sensordots: ['idleColor', 'activeColor'],
  shortcuts: ['columns'],
  sparklines: ['columns', 'smooth', 'color'],
  stack: ['dotsSize', 'dotsPosition', 'showDots'],
  stacked: ['style', 'plotHeight', 'legend', 'total', 'smooth', 'showHeader'],
  textline: ['size', 'align', 'overflow'],
  thermostat: ['layout'],
  timeline: ['showHeader', 'thresholds', 'names', 'span'],
  timers: ['color'],
  totals: ['period', 'compare', 'show', 'plotHeight', 'legend', 'showHeader', 'color'],
  typicalday: ['band', 'smooth', 'usual', 'plotHeight', 'legend', 'showHeader', 'color'],
  valueboard: ['layout', 'groupBy', 'values', 'columns', 'greenWhenFine'],
  valuematrix: ['rows', 'showLegend', 'greenWhenFine'],
  values: ['columns', 'tileStyle', 'percentFill', 'wideLast'],
  variables: ['columns', 'readOnly', 'color'],
  varpresets: ['layout', 'color'],
  weather: ['theme', 'density', 'rows', 'step'],
  webpage: ['onePage'],
};

/** The widgets with an unavailable device's mark (`markOffline()`, 1.3.0), which a Look of its own shows. */
const SHOWS_OFFLINE = ['curtains', 'lightrooms', 'lights', 'locks', 'quickactions', 'roomhealth', 'sensoralarms', 'sensordots', 'sparklines', 'thermostat', 'valueboard', 'valuematrix', 'values'];

describe('widget pages\' looks', () => {
  it.each(Object.keys(VARIANTS))('%s shows what it can do, not only colours', (id) => {
    expect(VARIANTS[id].filter(x => !onlyColours(x)).length).toBeGreaterThanOrEqual(FEW_MODES[id] ?? 4);
  });

  it.each(Object.entries(SHOWN_SETTINGS))('%s has an image for each setting that changes its look', (id, settings) => {
    const used = optionsUsed(VARIANTS[id].map(x => x.opts));
    expect(settings.filter(s => !used.has(s))).toEqual([]);
  });

  it('every widget with Looks is in the settings\' table', () => {
    expect(Object.keys(SHOWN_SETTINGS).sort()).toEqual(Object.keys(VARIANTS).sort());
  });

  it.each(SHOWS_OFFLINE)('%s shows an unavailable device', (id) => {
    expect(VARIANTS[id].map(x => x.opts?.scene)).toContain('offline');
  });

  it.each(Object.keys(VARIANTS))('%s says on each image what it shows', (id) => {
    const labels = VARIANTS[id].map(x => x.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.length, label).toBeLessThanOrEqual(50); // the image's one line
  });

  it.each(PAGES.filter(id => !WITHOUT.includes(id)))('%s shows a light version and at least another', (id) => {
    const names = images(id).map(m => m[1]);
    expect(names).toContain(`${id}-light.webp`);
    expect(names.length).toBeGreaterThanOrEqual(2);
  });

  it.each(PAGES)('%s links only images that exist, with alt text', (id) => {
    for (const [, file, alt] of images(id)) {
      expect(existsSync(`docs/variants/${file}`), file).toBe(true);
      expect(alt.length).toBeGreaterThan(0);
    }
  });

  it('every image is on its page', () => {
    const shown = new Set(PAGES.flatMap(id => images(id).map(m => m[1])));
    expect(readdirSync('docs/variants').filter(f => !shown.has(f))).toEqual([]);
  });

  it.each(PAGES.filter(id => {
    const manifest = `widgets/${id}/widget.compose.json`;
    return existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).settings?.some((s: { id: string }) => s.id === 'colorStyle');
  }))('%s shows Vivid, as it has the Colour style setting', (id) => {
    expect(images(id).map(m => m[1])).toContain(`${id}-vivid.webp`);
  });
});
