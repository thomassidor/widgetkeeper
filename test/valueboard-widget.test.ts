// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWidget } from './helpers/loadWidget.js';

let win: any;
beforeAll(() => { win = loadWidget('valueboard'); });
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

// Expected numbers in the system locale: CI runs in en-US, a developer's machine maybe not.
const num = (n: number, digits = 0) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });

const v = (capabilityId: string, value: unknown, more: object = {}) => ({
  capabilityId, title: capabilityId, type: typeof value === 'boolean' ? 'boolean' : 'number', units: null, decimals: null, min: null, max: null, values: null, value, ...more,
});
const BED = { id: 'z2', name: 'Bedroom' };
const OFFICE = { id: 'z3', name: 'Office' };
const devices = () => [
  { id: 'air', name: 'Air monitor', zone: BED, values: [v('measure_battery', 8, { units: '%' }), v('measure_co2', 1140, { units: 'ppm', title: 'CO2' }), v('measure_temperature', 19.2, { units: '°C', decimals: 1 })] },
  { id: 'plug', name: 'Desk plug', zone: OFFICE, values: [v('measure_power', 134, { units: 'W' })] },
  { id: 'window', name: 'Window', zone: BED, values: [v('alarm_contact', true)] },
  { id: 'gone', missing: true },
  { id: 'empty', name: 'Remote', zone: OFFICE, values: [] },
];

function widget(list: any[], opts: object = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createValueBoardWidget(root, opts);
  w.setState(list);
  const groups = () => [...root.querySelectorAll<HTMLElement>('.vb-group')];
  const heads = () => groups().map(g => g.querySelector('.vb-head')!.textContent);
  const cells = (sel = '.vb-cell') => [...root.querySelectorAll<HTMLElement>(sel)];
  return { w, root, groups, heads, cells };
}

describe('valueBoardLevel', () => {
  it('judges batteries: an alert under 10 %, a warning under 20 %', () => {
    expect([5, 9.9, 10, 19, 20, 100].map(x => win.valueBoardLevel(v('measure_battery', x)))).toEqual(['alert', 'alert', 'warn', 'warn', 'fine', 'fine']);
  });

  it('judges alarms: on is an alert, an open contact a warning, motion nothing', () => {
    expect(win.valueBoardLevel(v('alarm_smoke', true))).toBe('alert');
    expect(win.valueBoardLevel(v('alarm_water', false))).toBe('fine');
    expect(win.valueBoardLevel(v('alarm_contact', true))).toBe('warn');
    expect(win.valueBoardLevel(v('alarm_contact', false))).toBe('fine');
    expect(win.valueBoardLevel(v('alarm_motion', true))).toBeNull();
    expect(win.valueBoardLevel(v('alarm_smoke', null))).toBeNull();
  });

  it('judges air quality in its own units: over the limit a warning, from 1.5 × it an alert', () => {
    expect([800, 1000, 1001, 1499, 1500].map(x => win.valueBoardLevel(v('measure_co2', x, { units: 'ppm' })))).toEqual(['fine', 'fine', 'warn', 'warn', 'alert']);
    expect(win.valueBoardLevel(v('measure_pm25', 30, { units: 'μg/m³' }))).toBe('alert');
    expect(win.valueBoardLevel(v('measure_radon', 120, { units: 'Bq/m³' }))).toBe('warn');
    expect(win.valueBoardLevel(v('measure_radon', 3, { units: 'pCi/L' }))).toBeNull();
    expect(win.valueBoardLevel(v('measure_voc', 1200, { units: 'ppb' }))).toBe('warn');
  });

  it("leaves the rest alone: a temperature may be a fridge's or the garden's", () => {
    expect(win.valueBoardLevel(v('measure_temperature', 4))).toBeNull();
    expect(win.valueBoardLevel(v('measure_power', 3000, { units: 'W' }))).toBeNull();
    expect(win.valueBoardLevel(v('measure_battery', null))).toBeNull();
  });
});

describe('valueBoardGroups', () => {
  it('groups by room in the order first picked, each device in turn, its values temperature first and the battery last', () => {
    const groups = win.valueBoardGroups(devices(), 'rooms');
    expect(groups.map((g: any) => [g.key, g.name ?? null, g.missing ?? false])).toEqual([
      ['zone:z2', 'Bedroom', false], ['zone:z3', 'Office', false], ['gone', null, true],
    ]);
    expect(groups[0].values.map((x: any) => x.key)).toEqual(['air:measure_temperature', 'air:measure_co2', 'air:measure_battery', 'window:alarm_contact']);
    expect(groups[0].values[0]).toMatchObject({ deviceId: 'air', deviceName: 'Air monitor' });
  });

  it('groups by device, keyed by its id; a device without values is left out', () => {
    const groups = win.valueBoardGroups(devices(), 'devices');
    expect(groups.map((g: any) => [g.key, g.name ?? null])).toEqual([['air', 'Air monitor'], ['plug', 'Desk plug'], ['window', 'Window'], ['gone', null]]);
  });

  it('puts a device without a known room in a group of its own', () => {
    const groups = win.valueBoardGroups([{ id: 'x', name: 'Loose', zone: null, values: [v('measure_power', 1)] }], 'rooms');
    expect(groups).toMatchObject([{ key: 'x', name: 'Loose' }]);
  });
});

describe('createValueBoardWidget', () => {
  it('Tiles: a tile per group with its name on top, a cell per value with the device under it', () => {
    const { heads, cells, groups } = widget(devices());
    expect(heads()).toEqual(['Bedroom', 'Office', 'Unavailable']);
    expect(groups()[2].classList.contains('missing')).toBe(true);
    const c = cells();
    // ° and % attached; another unit small after the number.
    expect(c.map(x => x.querySelector('.vb-num')!.firstChild!.textContent)).toEqual([`${num(19.2, 1)}°C`, num(1140), '8%', 'Open', '134']);
    expect(c.map(x => x.querySelector('.vb-unit')?.textContent ?? null)).toEqual([null, 'ppm', null, null, 'W']);
    expect(c.map(x => x.querySelector('.vb-label')!.textContent)).toEqual(['Air monitor', 'Air monitor', 'Air monitor', 'Window', 'Desk plug']);
    expect(c[1].getAttribute('aria-label')).toBe(`Air monitor · CO2: ${num(1140)} ppm`);
  });

  it('labels each cell with the value grouped by device', () => {
    const { cells } = widget(devices(), { groupBy: 'devices' });
    expect(cells().slice(0, 3).map(x => x.querySelector('.vb-label')!.textContent)).toEqual(['measure_temperature', 'CO2', 'measure_battery']);
  });

  it('tones what is off, and what is fine only with greenWhenFine', () => {
    const tones = (opts: object) => widget(devices(), opts).cells().map(x => x.dataset.tone ?? null);
    expect(tones({})).toEqual([null, 'warn', 'alert', 'warn', null]);
    document.body.innerHTML = '';
    const fine = [{ id: 'b', name: 'B', zone: BED, values: [v('measure_battery', 80), v('measure_temperature', 20)] }];
    expect(widget(fine, { greenWhenFine: true }).cells().map(x => x.dataset.tone ?? null)).toEqual([null, 'fine']);
  });

  it('takes the columns and the Vivid style', () => {
    expect(widget(devices(), { columns: '4', colorStyle: 'deep' }).root.dataset.columns).toBe('4');
    expect(widget(devices(), { columns: 'x' }).root.dataset.columns).toBe('3');
    expect(widget(devices(), { colorStyle: 'deep' }).root.classList.contains('wk-deep')).toBe(true);
  });

  it('Compact: one tile, the values in lines under the names; a tap names a value in the heading for a while', () => {
    const { root, heads, cells } = widget(devices(), { layout: 'compact' });
    expect(root.querySelectorAll('.vb-tile')).toHaveLength(1);
    expect(heads()).toEqual(['Bedroom', 'Office', 'Unavailable']);
    const items = () => cells('.vb-item');
    expect(items()).toHaveLength(5);
    expect(root.querySelector('.vb-label')).toBeNull();
    items()[1].click();
    expect(heads()[0]).toBe('Air monitor · CO2');
    expect(items()[1].classList.contains('named')).toBe(true);
    expect(root.querySelector('.vb-body')!.classList.contains('has-named')).toBe(true);
    items()[1].click(); // the same again puts the room back
    expect(heads()[0]).toBe('Bedroom');
    items()[4].click();
    expect(heads()[1]).toBe('Desk plug · measure_power');
    vi.advanceTimersByTime(4000);
    expect(heads()[1]).toBe('Office');
  });

  it('updates a value from realtime and ignores what it does not show', () => {
    const { w, cells } = widget(devices());
    w.pushChange({ deviceId: 'air', capabilityId: 'measure_battery', value: 50 });
    w.pushChange({ deviceId: 'air', capabilityId: 'onoff', value: true });
    w.pushChange({ deviceId: 'nobody', capabilityId: 'measure_battery', value: 1 });
    expect(cells()[2].querySelector('.vb-num')!.textContent).toBe('50%');
    expect(cells()[2].dataset.tone).toBeUndefined();
  });

  it('says so when the devices have nothing to show, and shows a message in place of the groups', () => {
    const { root, w } = widget([{ id: 'r', name: 'Remote', zone: null, values: [] }]);
    expect(root.querySelector('.vb-message')!.textContent).toBe('These devices have no values to show.');
    w.setMessage('Select devices in the widget settings.');
    expect(root.querySelector('.vb-message')!.textContent).toBe('Select devices in the widget settings.');
    expect(root.querySelectorAll('.vb-group')).toHaveLength(0);
  });

  it('reads booleans in their own words', () => {
    const list = [{ id: 'd', name: 'D', zone: null, values: [v('alarm_motion', false), v('alarm_smoke', true), v('onoff', true)] }];
    const t = (key: string) => ({ 'valueboard.on': 'Tændt' } as Record<string, string>)[key] ?? key;
    const { cells } = widget(list, { t });
    expect(cells().map(x => x.querySelector('.vb-num')!.textContent)).toEqual(['No motion', 'Alarm', 'Tændt']);
  });
});
