import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeDevice, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import { MAX_INPUTS, MAX_PARTS, allParts, bindDevice, designCharts, designInputs, designRooms, detachUses, inputValue, readInputs, renewIds, designFlows as designFlowsOf, designSlots, designVariables, readDesign, readPart, ruleHolds, usesDevice } from '../lib/customDesigns.js';
import CustomWidgetService, {
  CUSTOM_CHOICE_CARD, CUSTOM_DESIGN_EVENT, CUSTOM_DESIGNS_SETTING, CUSTOM_INPUT_EVENT, CUSTOM_INPUT_VALUES_SETTING, CUSTOM_INPUTS_SETTING, CUSTOM_TAPPED_CARD, spanWindow,
} from '../lib/CustomWidgetService.js';
import { TEMPERATURE_UNIT_SETTING } from '../lib/temperatureUnit.js';

vi.mock('homey-api', () => homeyApiMock);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-20T12:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

const part = (id: string, kind: string, o: Record<string, unknown> = {}) => ({ id, kind, at: { x: 0, y: 0, w: 1, h: 1 }, ...o });

describe('readDesign: a design as kept', () => {
  it('keeps what it knows and drops the rest, each kind with its own fields', () => {
    const d = readDesign({
      id: 'living', name: '  Living   room ', parts: [
        part('t', 'sparkline', { slot: 'd1:measure_temperature', span: 'nope', step: 3, flowId: 'flow:x', at: { x: 9, y: -2, w: 9, h: 2 } }),
        part('s', 'stepper', { variable: 'v1', step: '0.25', min: 30, max: 10 }),
        part('b', 'button', { flowId: 'advanced:a1', color: 'PURPLE', icon: 'tv' }),
        part('x', 'nonsense'),
        part('c', 'choice', { slot: 'd1:thermostat_mode', choices: [{ label: 'Heat', value: 'heat' }, { value: 'heat' }, { value: '' }, { value: 'off' }] }),
        part('r', 'bar', { src: { slot: 'd1:measure_temperature' }, rules: [{ op: 'above', value: 25, look: 'red' }, { op: 'sideways', value: 1, look: 'red' }, { op: 'is', value: 'x', look: 'hide' }, { op: 'is', value: 'x', look: 'mauve' }] }),
      ],
    })!;
    expect(d.name).toBe('Living room');
    expect(d.parts.map(p => p.kind)).toEqual(['sparkline', 'stepper', 'button', 'choice', 'bar']);
    const [t, s, b, c, r] = d.parts;
    // A sparkline's span falls back to 24 hours; what it doesn't use is left out; it stays on the 4-column grid.
    expect(t).toMatchObject({ slot: 'd1:measure_temperature', span: '24h', at: { x: 3, y: 0, w: 1, h: 2 }, style: 'none' });
    expect(t).not.toHaveProperty('step');
    expect(t).not.toHaveProperty('flowId');
    // A range typed the wrong way round is swapped.
    expect(s).toMatchObject({ variable: 'v1', step: 0.25, min: 10, max: 30 });
    expect(b).toMatchObject({ flowId: 'advanced:a1', color: 'purple', icon: 'tv' });
    expect(c.choices).toEqual([{ label: 'Heat', value: 'heat' }, { label: 'off', value: 'off' }]);
    expect(r.rules).toEqual([{ op: 'above', value: '25', look: 'red' }, { op: 'is', value: 'x', look: 'hide' }]);
  });

  it('gives repeated part ids new ones, keeps containers one level deep, and caps the parts', () => {
    const d = readDesign({
      parts: [
        part('a', 'text'), part('a', 'text'),
        part('box', 'container', { mode: 'free', background: { kind: 'gradient', from: '#112233', to: '#445566' }, parts: [
          part('k', 'bar', { at: { x: 90, y: 10, w: 50, h: 20 } }),
          part('inner', 'container'),
        ] }),
      ],
    })!;
    expect(new Set(allParts(d).map(p => p.id)).size).toBe(4);
    const box = d.parts[2];
    expect(box.background).toEqual({ kind: 'gradient', from: '#112233', to: '#445566', angle: 135 });
    // Free-form places are per cent, kept inside the box.
    expect(box.parts!.map(p => [p.kind, p.at])).toEqual([['bar', { x: 90, y: 10, w: 10, h: 20 }]]);
    const many = readDesign({ parts: Array.from({ length: MAX_PARTS + 5 }, (_, i) => part(`p${i}`, 'text')) })!;
    expect(many.parts).toHaveLength(MAX_PARTS);
  });

  it("keeps a part's background, and reads one saved as tile: false as none", () => {
    expect(readPart({ kind: 'switch', style: 'pill' })!.style).toBe('pill');
    expect(readPart({ kind: 'switch', style: 'round' })!.style).toBe('tile');
    expect(readPart({ kind: 'switch', tile: false })!.style).toBe('none');
    for (const kind of ['text', 'icon', 'sparkline', 'arc', 'bar']) expect([kind, readPart({ kind })!.style]).toEqual([kind, 'none']);
    // The tiles that bundled a value, a label and a graph are gone: their kinds aren't read.
    for (const kind of ['value', 'gauge', 'level', 'status', 'flowvalue', 'time', 'trend']) expect(readPart({ kind })).toBeNull();
    // The Mini chart's id is the Chart's now: its value is the Chart's one series.
    expect(readPart({ kind: 'chart', slot: 'a:measure_power' })!.series).toEqual([{ slot: 'a:measure_power', color: null }]);
  });

  it('refuses what is not a design, and a reserved id', () => {
    expect(readDesign(null)).toBeNull();
    expect(readDesign('x')).toBeNull();
    expect(readDesign({ id: '__proto__' }, 'fresh')!.id).toBe('fresh');
    expect(readPart({ kind: 'text', id: 'constructor' })!.id).not.toBe('constructor');
  });

  it("lists a design's values and histories once each", () => {
    const d = readDesign({ parts: [
      part('a', 'sparkline', { slot: 'd1:measure_power' }),
      part('b', 'sparkline', { slot: 'd1:measure_power', span: '24h' }),
      part('c', 'arc', { src: { slot: 'd2:measure_humidity' } }),
      part('t', 'text', { text: '{1} {2} {3}', refs: [{ since: 'd3:alarm_motion' }, { until: '22:30' }, { slot: 'd2:measure_humidity', show: 'name' }] }),
      part('k', 'calc', { op: 'change', span: '6h', inputs: [{ slot: 'd1:measure_power' }] }),
    ] })!;
    expect(designSlots(d)).toEqual(['d1:measure_power', 'd2:measure_humidity', 'd3:alarm_motion']);
    expect(designCharts(d)).toEqual([{ slot: 'd1:measure_power', span: '24h' }, { slot: 'd1:measure_power', span: '6h' }]);
    expect(d.parts[3].refs).toEqual([{ since: 'd3:alarm_motion' }, { until: '22:30' }, { slot: 'd2:measure_humidity', show: 'name' }]);
    expect(designRooms(d)).toBe(false);
  });

  it("keeps a text's room of a device value (not of a variable), and then reads the rooms", () => {
    const d = readDesign({ parts: [
      part('t', 'text', { text: '{1} {2}', refs: [{ slot: 'd1:onoff', show: 'room' }, { variable: 'v', show: 'room' }] }),
    ] })!;
    expect(d.parts[0].refs).toEqual([{ slot: 'd1:onoff', show: 'room' }, { variable: 'v' }]);
    expect(designRooms(d)).toBe(true);
  });

  it('keeps a colour scale on the kinds that take one: 2–3 stops, a source where it has no value of its own, its ends', () => {
    const scale = (kind: string, colorBy: unknown) => readPart(part('x', kind, { colorBy }))!.colorBy;
    expect(scale('shape', { src: { slot: 'd:t' }, stops: ['blue', '#FF0000', 'red', 'green'], min: '10', max: 30 })).toEqual({ src: { slot: 'd:t' }, stops: ['blue', '#ff0000', 'red'], min: 10, max: 30 });
    expect(scale('shape', { stops: ['blue', 'red'] })).toBeUndefined(); // a shape has no value of its own
    expect(scale('bar', { stops: ['blue', 'red'] })).toEqual({ stops: ['blue', 'red'] });
    expect(scale('icon', { stops: ['blue'] })).toBeUndefined();
    expect(scale('switch', { stops: ['blue', 'red'] })).toBeUndefined();
    const d = readDesign({ parts: [part('t', 'text', { text: 'x', colorBy: { src: { slot: 'd:co2' }, stops: ['green', 'red'] } }), part('a', 'arc', { colorBy: { src: { part: 'a' }, stops: ['green', 'red'] } })] })!;
    expect(designSlots(d)).toEqual(['d:co2']);
    expect(d.parts[1].colorBy).toEqual({ stops: ['green', 'red'] }); // itself isn't a source: its own value then
  });

  it("keeps a list's item rules: colours on the item's own value, at most six", () => {
    const list = readPart(part('l', 'repeat', { capability: 'measure_battery', itemRules: [
      { op: 'below', value: '15', look: 'red', of: { slot: 'x:y' }, icon: 'star' }, { op: 'below', value: '30', look: 'hide' }, { op: 'is', value: 'on', look: 'same' },
      { op: 'nope', look: 'red' }, ...Array.from({ length: 8 }, () => ({ op: 'above', value: '90', look: 'green' })),
    ] }))!;
    expect(list.itemRules![0]).toEqual({ op: 'below', value: '15', look: 'red' });
    expect(list.itemRules).toHaveLength(3); // six read, three of them kept
    expect(readPart(part('l', 'repeat', { itemRules: [] }))).not.toHaveProperty('itemRules');
    expect(readPart(part('t', 'text', { itemRules: [{ op: 'below', value: '1', look: 'red' }] }))).not.toHaveProperty('itemRules');
  });

  it("keeps a text's time since a Flow input was set, and reads that input", () => {
    const d = readDesign({ parts: [
      part('t', 'text', { text: '{1} {2}', refs: [{ since: { input: 'w' } }, { since: { input: '__proto__' } }] }),
    ] })!;
    expect(d.parts[0].refs).toEqual([{ since: { input: 'w' } }, null]);
    expect(designInputs(d)).toEqual(['w']);
  });
});

describe('readDesign: shapes, calculated values, times, texts with values and rules on other values', () => {
  it('keeps a shape\'s form and fill, always without a background', () => {
    expect(readPart(part('s', 'shape', { shape: 'line', thickness: 20, dir: 'vertical', opacity: 5, style: 'tile', background: { kind: 'color', from: '#112233' } }))).toMatchObject({
      shape: 'line', thickness: 8, dir: 'vertical', opacity: 10, style: 'none', background: { kind: 'color', from: '#112233' },
    });
    const rect = readPart(part('r', 'shape', { shape: 'nope', radius: 99 }))!;
    expect([rect.shape, rect.radius, rect.opacity, rect.thickness]).toEqual(['rect', 32, 100, undefined]);
  });

  it("keeps a calculated value's inputs (devices or variables, never parts), its op and only that op's fields", () => {
    const inputs = [{ slot: 'd1:measure_temperature' }, { variable: 'v1' }, { part: 'x' }, { slot: 'bad' }, 'nope', ...Array(20).fill({ slot: 'd2:onoff' })];
    const c = readPart(part('c', 'calc', { inputs, op: 'count', test: { op: 'isNot', value: 'off' }, formula: 'a+b', winner: true, decimals: 7, sourceOnly: true }))!;
    expect(c.inputs!.length).toBe(MAX_INPUTS);
    expect(c.inputs!.slice(0, 3)).toEqual([{ slot: 'd1:measure_temperature' }, { variable: 'v1' }, { slot: 'd2:onoff' }]);
    expect([c.op, c.test, c.formula, c.decimals]).toEqual(['count', { op: 'isNot', value: 'off' }, undefined, 3]);
    // Never drawn: what a drawn component has (its winner's name and source-only, gone) isn't kept.
    expect(c).not.toHaveProperty('winner');
    expect(c).not.toHaveProperty('sourceOnly');
    expect(readPart(part('f', 'calc', { op: 'formula', formula: ' (a + b)  / 2 ' }))).toMatchObject({ op: 'formula', formula: '(a + b) / 2' });
    expect(readPart(part('m', 'calc', { op: 'max', winner: true }))).not.toHaveProperty('winner');
    expect(readPart(part('u', 'calc', { op: 'what' }))!.op).toBe('sum');
  });

  it("keeps a text's times, a calculated change's period, and a bar's or an arc's value and range", () => {
    const t = readPart(part('t', 'text', { refs: [{ time: 'seconds' }, { until: '25:00' }, { since: 'bad' }, { time: 'nope' }] }))!;
    expect(t.refs).toEqual([{ time: 'seconds' }, null, null, null]);
    expect(readPart(part('c', 'calc', { op: 'change', span: 'x', percent: true }))).toMatchObject({ op: 'change', span: '1h', percent: true });
    expect('span' in readPart(part('c', 'calc', { op: 'since', span: '6h' }))!).toBe(false);
    expect(readPart(part('b', 'bar', { src: { variable: 'v' }, min: 9, max: 1, thickness: 99 }))).toMatchObject({ src: { variable: 'v' }, min: 1, max: 9, thickness: 24 });
  });

  it("checks every {part} source against the design's calculated values, and gathers every value a design reads", () => {
    const d = readDesign({ parts: [
      part('c', 'calc', { inputs: [{ slot: 'd1:measure_power' }, { variable: 'v1' }], rules: [{ op: 'above', value: '1', look: 'red', of: { part: 'c' } }] }),
      part('t', 'text', { text: '{1} {2} {3} {4}', refs: [{ part: 'c' }, { part: 'gone' }, { time: 'clock' }, { slot: 'd2:measure_humidity' }, { variable: 'v2' }, {}, { slot: 'd9:x' }] }),
      part('s', 'shape', { rules: [
        { op: 'is', value: 'on', look: 'hide' }, // a shape's rule without `of` checks nothing: left out
        { op: 'is', value: 'on', look: 'green', of: { slot: 'd3:onoff' } },
        { op: 'above', value: '2', look: 'red', of: { part: 't' } }, // not a calculated value
      ] }),
      part('box', 'container', { rules: [{ op: 'above', value: '3', look: 'orange', of: { part: 'c' } }], parts: [] }),
    ] })!;
    const [c, t, s, box] = d.parts;
    expect(c.rules).toEqual([]); // itself
    expect(t.refs).toEqual([{ part: 'c' }, null, { time: 'clock' }, { slot: 'd2:measure_humidity' }, { variable: 'v2' }, null]);
    expect(s.rules).toEqual([{ op: 'is', value: 'on', look: 'green', of: { slot: 'd3:onoff' } }]);
    expect(box.rules).toEqual([{ op: 'above', value: '3', look: 'orange', of: { part: 'c' } }]);
    expect(designSlots(d)).toEqual(['d1:measure_power', 'd2:measure_humidity', 'd3:onoff']);
    expect(designVariables(d)).toEqual(['v1', 'v2']);
  });
});

describe('ruleHolds', () => {
  it('compares numbers above and below, and texts and yes/no as is', () => {
    expect(ruleHolds({ op: 'above', value: '25', look: 'red' }, 25.1)).toBe(true);
    expect(ruleHolds({ op: 'above', value: '25,5', look: 'red' }, 25.1)).toBe(false);
    expect(ruleHolds({ op: 'below', value: '0.1', look: 'hide' }, 0)).toBe(true);
    expect(ruleHolds({ op: 'is', value: 'open', look: 'red' }, true)).toBe(true);
    expect(ruleHolds({ op: 'is', value: 'Off', look: 'red' }, false)).toBe(true);
    expect(ruleHolds({ op: 'isNot', value: 'heat', look: 'red' }, 'auto')).toBe(true);
    expect(ruleHolds({ op: 'is', value: '21', look: 'red' }, 21)).toBe(true);
    expect(ruleHolds({ op: 'above', value: '1', look: 'red' }, null)).toBe(false);
  });

  it('holds between two ends, both included, in either order, an empty end open', () => {
    const between = (value: string, to: string) => ({ op: 'between' as const, value, to, look: 'red' as const });
    expect([19.9, 20, 22, 25, 25.1].map(v => ruleHolds(between('20', '25'), v))).toEqual([false, true, true, true, false]);
    expect(ruleHolds(between('25', '20,5'), 21)).toBe(true);
    expect([ruleHolds(between('', '10'), -40), ruleHolds(between('10', ''), 1e6), ruleHolds(between('10', ''), 9)]).toEqual([true, true, false]);
    expect([ruleHolds(between('0', '1'), true), ruleHolds(between('0', '1'), 'open'), ruleHolds(between('a', '1'), 0)]).toEqual([true, false, false]);
  });
});

describe('readDesign: the settings closing the review\'s gaps (2026-11-22)', () => {
  it('keeps an icon, a rule\'s icon and a Flow input\'s icon only on the kinds that draw one', () => {
    const rules = [{ op: 'above', value: 1, look: 'red', icon: 'bell' }, { op: 'is', value: 'x', look: 'same', icon: 'bell' }];
    const text = readPart(part('t', 'text', { icon: 'star', rules: rules.map(r => ({ ...r, of: { slot: 'a:b' } })), bind: { icon: 'i1', text: 'i2' } }))!;
    expect([text.icon, text.rules, text.bind]).toEqual([null, [{ op: 'above', value: '1', look: 'red', of: { slot: 'a:b' } }], { text: 'i2' }]);
    const sw = readPart(part('s', 'switch', { slot: 'a:onoff', icon: 'star', rules, bind: { icon: 'i1' } }))!;
    expect([sw.icon, sw.rules.map(r => r.icon), sw.bind]).toEqual(['star', ['bell', 'bell'], { icon: 'i1' }]);
  });

  it('gives a calculated value no colour, rules or Flow inputs, as it\'s never drawn', () => {
    const c = readPart(part('c', 'calc', { color: 'red', icon: 'star', rules: [{ op: 'above', value: 1, look: 'red' }], bind: { text: 'i1' } }))!;
    expect([c.color, c.icon, c.rules, c.bind]).toEqual([null, null, [], undefined]);
  });

  it('reads a switch\'s press, a slider\'s variable and step, a variable\'s range and format, a bar\'s direction, a growing icon and a sparkline\'s range', () => {
    expect(readPart(part('s', 'switch', { slot: 'a:onoff', press: 'confirm' }))).toMatchObject({ press: 'confirm' });
    expect(readPart(part('s', 'switch', { slot: 'a:onoff', press: 'tap' }))).not.toHaveProperty('press');
    expect(readPart(part('s', 'switch', { slot: 'a:onoff', press: 'twice' }))).not.toHaveProperty('press');
    expect(readPart(part('sl', 'slider', { variable: 'v1', step: '0.5', min: 30, max: 10 }))).toMatchObject({ variable: 'v1', step: 0.5, min: 10, max: 30 });
    expect(readPart(part('sl', 'slider', { slot: 'a:dim', step: 0 }))).not.toHaveProperty('step');
    expect(readPart(part('v', 'variable', { variable: 'v1', min: 0, max: 10, decimals: 9, units: ' kWh ' }))).toMatchObject({ min: 0, max: 10, decimals: 3, units: 'kWh' });
    expect(readPart(part('b', 'bar', { dir: 'vertical' }))).toMatchObject({ dir: 'vertical' });
    expect(readPart(part('b', 'bar', { dir: 'sideways' }))).not.toHaveProperty('dir');
    expect(readPart(part('i', 'icon', { grow: true }))).toMatchObject({ grow: true });
    expect(readPart(part('sp', 'sparkline', { slot: 'a:t', min: 25, max: 15 }))).toMatchObject({ min: 15, max: 25 });
  });

  it('refreshes a web picture only when asked, a device\'s every 5 minutes as before', () => {
    expect(readPart(part('i', 'image', { image: { kind: 'url', url: 'https://x.test/a.jpg' } }))!.refresh).toBe(0);
    expect(readPart(part('i', 'image', { image: { kind: 'url', url: 'https://x.test/a.jpg' }, refresh: 15 }))!.refresh).toBe(15);
    expect(readPart(part('i', 'image', { image: { kind: 'device', device: 'cam' } }))!.refresh).toBe(5);
  });

  it('reads between\'s upper end in rules and tests, a repeater\'s order and limit, and a text value\'s format', () => {
    const r = readPart(part('b', 'bar', { rules: [{ op: 'between', value: 1, to: 5, look: 'red' }, { op: 'above', value: 1, to: 5, look: 'red' }] }))!;
    expect(r.rules).toEqual([{ op: 'between', value: '1', to: '5', look: 'red' }, { op: 'above', value: '1', look: 'red' }]);
    expect(readPart(part('c', 'calc', { op: 'count', test: { op: 'between', value: '1', to: '2' } }))!.test).toEqual({ op: 'between', value: '1', to: '2' });
    const rep = readPart(part('r', 'repeat', { capability: 'measure_battery', test: { op: 'between', value: 0, to: 20 }, sort: 'up', limit: 99 }))!;
    expect([rep.test, rep.sort, rep.limit]).toEqual([{ op: 'between', value: '0', to: '20' }, 'up', 24]);
    expect(readPart(part('r', 'repeat', { sort: 'random' }))).toMatchObject({ sort: 'name' });
    const t = readPart(part('t', 'text', { text: '{1} {2} {3}', refs: [{ slot: 'a:t', decimals: 7, plain: true }, { variable: 'v', decimals: 'x' }, { slot: 'a:t', show: 'name', decimals: 1 }] }))!;
    expect(t.refs).toEqual([{ slot: 'a:t', decimals: 3, plain: true }, { variable: 'v' }, { slot: 'a:t', show: 'name' }]);
  });
});

const thermostat = () => fakeDevice({
  id: 'heat', name: 'Bedroom', caps: {
    target_temperature: { type: 'number', value: 20, units: '°C', min: 5, max: 30 },
    thermostat_mode: { type: 'enum', value: 'auto', values: [{ id: 'auto' }, { id: 'heat' }] },
    onoff: { type: 'boolean', value: false },
  },
});

function setup(designs: unknown[] = [], extra: ReturnType<typeof fakeDevice>[] = [], zones: Record<string, { name: string, parent?: string }> = {}, inputs: unknown[] = INPUTS) {
  const devices = [thermostat(), ...extra];
  const homey = fakeHomey(fakeApi({ devices, zones }));
  if (designs.length) homey.settings.set(CUSTOM_DESIGNS_SETTING, designs);
  if (inputs.length) homey.settings.set(CUSTOM_INPUTS_SETTING, inputs);
  const deps = {
    values: { getState: vi.fn(async (slots: string[]) => slots.map(s => ({ deviceId: s.split(':')[0], capabilityId: s.split(':')[1], name: 'X', capability: {}, value: 1 }))) },
    variables: { getState: vi.fn(async (ids: string[]) => ids.map(id => ({ id, name: 'V', type: 'number', value: 2 }))), set: vi.fn(async () => {}) },
    flows: { getState: vi.fn(async (ids: string[]) => ids.map(id => ({ id, name: 'F' }))), trigger: vi.fn(async () => {}) },
    sparklines: { getState: vi.fn(async (slots: string[]) => slots.map(s => ({ deviceId: s.split(':')[0], capabilityId: s.split(':')[1], points: [[1, 2]] }))) },
  };
  const trigger = vi.fn(async () => {});
  const service = new CustomWidgetService(homey as any, deps as any, vi.fn(), () => {}, trigger);
  const [device] = devices;
  return { homey, deps, service, trigger, device };
}

/** The Flow inputs the tests' designs follow. */
const INPUTS = [
  { id: 'note', name: 'Note', type: 'text', reset: 'hour' },
  { id: 'price', name: 'Price', type: 'number' },
  { id: 'away', name: 'Away', type: 'yesno', perDevice: true },
  { id: 'tint', name: 'Tint', type: 'color' },
];

const DESIGN = {
  id: 'bed', name: 'Bedroom', parts: [
    part('sw', 'switch', { slot: 'heat:onoff' }),
    part('set', 'stepper', { slot: 'heat:target_temperature', min: 15, max: 25 }),
    part('mode', 'choice', { slot: 'heat:thermostat_mode', choices: [{ label: 'Auto', value: 'auto' }, { label: 'Heat', value: 'heat' }] }),
    part('guests', 'variable', { variable: 'v1' }),
    part('movie', 'button', { flowId: 'flow:f1' }),
    part('ring', 'button', { name: 'Ring' }),
    part('msg', 'text', { text: 'Hi', bind: { text: 'note', textColor: 'tint', shown: 'away' } }),
    part('cost', 'text', { text: '–', bind: { text: 'price' } }),
    part('t', 'sparkline', { slot: 'heat:target_temperature', span: '24h' }),
  ],
};

describe('CustomWidgetService: the library', () => {
  it('saves a design (a new one gets an id), tells the widgets, lists, duplicates and removes it', () => {
    const { homey, service } = setup();
    const saved = service.save({ name: 'Hall', parts: [part('a', 'text', { text: 'Hi' })] });
    expect(saved.id).toMatch(/^[a-z0-9]{8}$/);
    expect(homey.settings.get(CUSTOM_DESIGNS_SETTING)).toHaveLength(1);
    expect(homey.api.realtime).toHaveBeenCalledWith(CUSTOM_DESIGN_EVENT, { id: saved.id });
    const copy = service.duplicate(saved.id);
    expect(copy).toMatchObject({ name: 'Hall (copy)' });
    expect(copy.id).not.toBe(saved.id);
    expect(copy.parts[0].id).not.toBe('a');
    expect(service.list().map(d => d.name)).toEqual(['Hall', 'Hall (copy)']);
    expect(service.designItems('cop').map(i => i.name)).toEqual(['Hall (copy)']);
    expect(service.remove(saved.id)).toEqual({ removed: true });
    expect(service.remove(saved.id)).toEqual({ removed: false });
  });

  it('reads the designs saved before, leaving out what is broken', () => {
    const { service } = setup([DESIGN, null, 'x']);
    expect(service.list().map(d => d.id)).toEqual(['bed']);
  });
});

describe('CustomWidgetService: the widget', () => {
  it("gathers a design's values, variables, Flows and histories, and says when it's gone", async () => {
    const { service, deps } = setup([DESIGN]);
    const state: any = await service.getState('bed');
    expect(deps.values.getState).toHaveBeenCalledWith(['heat:onoff', 'heat:target_temperature', 'heat:thermostat_mode'], [], { rooms: false });
    expect(Object.keys(state.values)).toEqual(['heat:onoff', 'heat:target_temperature', 'heat:thermostat_mode']);
    expect(state.variables.v1).toMatchObject({ value: 2 });
    expect(state.flows['flow:f1']).toMatchObject({ name: 'F' });
    expect(state.histories['24h\nheat:target_temperature']).toEqual([[1, 2]]);
    // For its times: Homey's language and the app's time format ride along.
    expect([state.language, state.timeFormat]).toEqual(['en', 'auto']);
    expect(await service.getState('nope')).toMatchObject({ missing: true });
  });

  it("sets only its own part's capability, with a value of its type, within the ranges", async () => {
    const { service, device } = setup([DESIGN]);
    await service.setValue('bed', 'sw', true);
    await service.setValue('bed', 'set', 40); // the part's max, 25
    await service.setValue('bed', 'mode', 'heat');
    expect(device.sent).toEqual(['onoff=true', 'target_temperature=25', 'thermostat_mode="heat"']);
    await expect(service.setValue('bed', 'sw', 'yes')).rejects.toThrow('Invalid value');
    await expect(service.setValue('bed', 'mode', 'cool')).rejects.toThrow('Not one of the choices');
    await expect(service.setValue('bed', 'guests', 1)).rejects.toThrow('No such part');
    await expect(service.setValue('other', 'sw', true)).rejects.toThrow('No such design');
  });

  it('turns a temperature shown in °F back into the device\'s °C', async () => {
    const { homey, service, device } = setup([DESIGN]);
    homey.settings.set(TEMPERATURE_UNIT_SETTING, 'f');
    // The part's range is typed in the unit shown too: 59–77 °F is 15–25 °C.
    service.save({ ...DESIGN, parts: DESIGN.parts.map(p => (p.id === 'set' ? { ...p, min: 59, max: 77 } : p)) });
    await service.setValue('bed', 'set', 68);
    await service.setValue('bed', 'set', 90);
    expect(device.sent).toEqual(['target_temperature=20', 'target_temperature=25']);
  });

  it('fires the choice trigger after a choice is set', async () => {
    const { service, trigger } = setup([DESIGN]);
    await service.setValue('bed', 'mode', 'heat');
    await vi.advanceTimersByTimeAsync(0);
    expect(trigger).toHaveBeenCalledWith(CUSTOM_CHOICE_CARD, { choice: 'Heat', value: 'heat', index: 2 }, { part: 'bed/mode' });
  });

  it('sets a variable, starts a Flow, and fires the tap trigger from a button without one', async () => {
    const { service, deps, trigger } = setup([DESIGN]);
    await service.setVariable('bed', 'guests', 5);
    expect(deps.variables.set).toHaveBeenCalledWith('v1', 5);
    // A slider or a variable on a number variable sets it within its own range.
    service.save({ ...DESIGN, parts: [...DESIGN.parts, part('vs', 'slider', { variable: 'v1', min: 0, max: 10 }), part('vv', 'variable', { variable: 'v1', min: 2 })] });
    await service.setVariable('bed', 'vs', 14);
    await service.setVariable('bed', 'vv', -1);
    expect(deps.variables.set.mock.calls.slice(-2)).toEqual([['v1', 10], ['v1', 2]]);
    await service.startFlow('bed', 'movie');
    expect(deps.flows.trigger).toHaveBeenCalledWith('flow:f1');
    await service.tap('bed', 'ring', 'web-home-w1');
    expect(trigger).toHaveBeenCalledWith(CUSTOM_TAPPED_CARD, { part: 'Ring', design: 'Bedroom', dashboard: 'home' }, { part: 'bed/ring' });
    await expect(service.tap('bed', 'movie')).rejects.toThrow('starts a Flow');
  });
});

describe('Flow inputs: the model', () => {
  it('reads inputs leniently: ids and names unique (case aside), known types, a reset', () => {
    expect(readInputs([
      { id: 'a', name: ' Parcel ', type: 'text' }, { id: 'b', name: 'parcel', type: 'text' }, { id: 'a', name: 'Other', type: 'number' },
      { id: 'c', name: 'Mode', type: 'mood' }, { id: 'd', name: '', type: 'text' }, { id: '__proto__', name: 'X', type: 'text' },
      { id: 'e', name: 'Away', type: 'yesno', perDevice: true, reset: 'midnight' }, null,
    ])).toEqual([{ id: 'a', name: 'Parcel', type: 'text', reset: 'never' }, { id: 'e', name: 'Away', type: 'yesno', perDevice: true, reset: 'midnight' }]);
  });

  it('reads a value as its type', () => {
    expect([inputValue('number', '4,5'), inputValue('number', 'x'), inputValue('yesno', 'Yes'), inputValue('yesno', 'off'), inputValue('yesno', 'maybe')]).toEqual([4.5, undefined, true, false, undefined]);
    expect([inputValue('color', 'RED'), inputValue('color', '#00ff00'), inputValue('color', 'mauve'), inputValue('icon', 'bell'), inputValue('icon', 'none')]).toEqual(['red', '#00ff00', undefined, 'bell', undefined]);
    expect(inputValue('text', '  two   words ')).toBe('two words');
  });

  it('keeps only the bindings a kind has, and gathers every input a design uses', () => {
    const d = readDesign({ parts: [
      part('t', 'text', { bind: { text: 'a', color: 'b', textColor: 'c', fill: 'd', shown: 'e', page: 'f' } }),
      part('box', 'container', { mode: 'pages', bind: { fill: 'g', page: 'h', text: 'x' } }),
      part('ic', 'icon', { bind: { icon: 'i', color: 'j' } }),
      part('ar', 'arc', { src: { input: 'k' } }),
      part('bt', 'button', { actions: [{ do: 'input', input: 'l', value: 'toggle' }, { do: 'input', value: 'x' }] }),
    ] })!;
    const [t, box, ic, ar, bt] = d.parts;
    expect([t.bind, box.bind, ic.bind, ar.src, bt.actions]).toEqual([
      { text: 'a', textColor: 'c', shown: 'e' }, { fill: 'g', shown: undefined, page: 'h' }, { color: 'j', icon: 'i' }, { input: 'k' }, [{ do: 'input', input: 'l', value: 'toggle' }],
    ].map(x => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) : x)));
    expect(designInputs(d).sort()).toEqual(['a', 'c', 'e', 'g', 'h', 'i', 'j', 'k', 'l']);
  });
});

describe('CustomWidgetService: Flow inputs', () => {
  it('adds, renames and deletes inputs, refusing a name that\'s taken', () => {
    const { homey, service } = setup([DESIGN]);
    const made = service.saveInput({ name: 'Parcel', type: 'text' });
    expect(made).toMatchObject({ name: 'Parcel', type: 'text', reset: 'never' });
    expect(made.id).toMatch(/^[a-z0-9]{8}$/);
    expect(() => service.saveInput({ name: 'note', type: 'text' })).toThrow(expect.objectContaining({ reason: 'taken' }));
    expect(() => service.saveInput({ name: 'X', type: 'mood' })).toThrow('Not a Flow input type');
    service.saveInput({ id: made.id, name: 'Post' });
    expect(service.inputs().find(x => x.id === made.id)).toMatchObject({ name: 'Post', type: 'text' });
    expect(homey.settings.get(CUSTOM_INPUTS_SETTING)).toHaveLength(5);
    // Which designs use each, for the builder's list.
    expect(service.inputSummary().find(x => x.id === 'note')).toMatchObject({ value: null, devices: 0, usedBy: [{ id: 'bed', name: 'Bedroom', ready: false }] });
    homey.api.realtime.mockClear();
    expect(service.removeInput('note')).toEqual({ removed: true });
    expect(homey.api.realtime).toHaveBeenCalledWith(CUSTOM_DESIGN_EVENT, { id: 'bed' });
    expect(service.removeInput('note')).toEqual({ removed: false });
  });

  it('lists a card\'s inputs by type, and the devices with Every device first', async () => {
    const { service } = setup([DESIGN]);
    expect(service.listInputs('', ['color']).map(i => i.id)).toEqual(['tint']);
    expect(service.listInputs('').map(i => i.name)).toEqual(['Away', 'Note', 'Price', 'Tint']);
    expect(service.listInputs('', ['yesno'])[0].description).toContain('per device');
    const devices = await service.listDevices('');
    expect(devices[0]).toMatchObject({ id: '*', name: 'Every device' });
    expect(devices.slice(1).map(d => d.id)).toContain('heat');
  });

  it('sets a value as its type, sends it, keeps it, and serves it in /state', async () => {
    const { homey, service } = setup([DESIGN]);
    service.setInput({ id: 'note' }, 'text', '  Parcel   here ');
    expect(homey.api.realtime).toHaveBeenLastCalledWith(CUSTOM_INPUT_EVENT, {
      input: 'note', entry: { type: 'text', all: { value: 'Parcel here', at: Date.now(), expires: Date.now() + 3600e3 } },
    });
    service.setInput({ id: 'price' }, 'number', '42,5', undefined, 'kr');
    expect(() => service.setInput({ id: 'price' }, 'number', 'lots')).toThrow('Not a number value');
    expect(() => service.setInput({ id: 'note' }, 'number', 3)).toThrow("isn't a number input");
    expect(() => service.setInput({ id: 'gone' }, 'text', 'x')).toThrow('No such Widget Builder Flow input');
    // A device only for an input kept per device.
    expect(() => service.setInput({ id: 'note' }, 'text', 'x', { id: 'heat' })).toThrow("isn't kept per device");
    await vi.advanceTimersByTimeAsync(2100);
    expect(homey.settings.get(CUSTOM_INPUT_VALUES_SETTING)).toMatchObject({ note: { all: { value: 'Parcel here' } }, price: { all: { value: 42.5, units: 'kr' } } });
    const state = await service.getState('bed') as any;
    expect(state.inputs.price).toMatchObject({ type: 'number', all: { value: 42.5, units: 'kr' } });
    expect(Object.keys(state.inputs).sort()).toEqual(['away', 'note', 'price', 'tint']);
  });

  it('keeps a per-device input\'s values per device, the shared one besides', async () => {
    const { service } = setup([DESIGN]);
    service.setInput({ id: 'away' }, 'yesno', true, { id: '*' });
    service.setInput({ id: 'away' }, 'yesno', false, { id: 'heat' });
    const state = await service.getState('bed', 'heat') as any;
    expect(state.device).toBe('heat');
    expect(state.inputs.away).toMatchObject({ type: 'yesno', perDevice: true, all: { value: true }, devices: { heat: { value: false } } });
    // The condition: a device's own, else the shared value.
    expect(service.inputIs({ id: 'away' }, 'no', { id: 'heat' })).toBe(true);
    expect(service.inputIs({ id: 'away' }, 'yes', { id: 'other' })).toBe(true);
    expect(service.inputIs({ id: 'away' }, 'yes')).toBe(true);
    // Cleared for one device, then for all.
    service.resetInput({ id: 'away' }, { id: 'heat' });
    expect(service.inputIs({ id: 'away' }, 'yes', { id: 'heat' })).toBe(true);
    service.resetInput({ id: 'away' });
    expect(((await service.getState('bed')) as any).inputs.away).toEqual({ type: 'yesno', perDevice: true });
    // Per device switched off drops the devices' values; a new type every value.
    service.setInput({ id: 'away' }, 'yesno', true, { id: 'heat' });
    service.setInput({ id: 'away' }, 'yesno', true);
    service.saveInput({ id: 'away', perDevice: false });
    expect(((await service.getState('bed')) as any).inputs.away).toMatchObject({ type: 'yesno', all: { value: true } });
    expect(((await service.getState('bed')) as any).inputs.away.devices).toBeUndefined();
    service.saveInput({ id: 'away', type: 'text' });
    expect(((await service.getState('bed')) as any).inputs.away).toEqual({ type: 'text' });
  });

  it('lets a value go back after its hour, telling the widgets', async () => {
    const { homey, service } = setup([DESIGN]);
    service.start();
    service.setInput({ id: 'note' }, 'text', 'Soon gone');
    homey.api.realtime.mockClear();
    await vi.advanceTimersByTimeAsync(3600e3 + 100);
    expect(homey.api.realtime).toHaveBeenCalledWith(CUSTOM_INPUT_EVENT, { input: 'note', entry: { type: 'text' } });
    expect(((await service.getState('bed')) as any).inputs.note).toEqual({ type: 'text' });
  });

  it('reads the values kept, only of known inputs and of their type', () => {
    const homey = fakeHomey(fakeApi({ devices: [thermostat()] }));
    homey.settings.set(CUSTOM_INPUTS_SETTING, INPUTS);
    homey.settings.set(CUSTOM_INPUT_VALUES_SETTING, {
      note: { all: { value: 'Kept', at: Date.now() } }, price: { all: { value: 'not a number', at: 1 } }, gone: { all: { value: 1, at: 1 } },
      away: { devices: { heat: { value: true, at: 1 }, hall: { value: 'maybe', at: 1 } } },
    });
    const service = new CustomWidgetService(homey as any, {} as any);
    const summary = service.inputSummary();
    expect(summary.find(x => x.id === 'note')!.value).toEqual({ value: 'Kept' });
    expect(summary.find(x => x.id === 'price')!.value).toBeNull();
    expect(summary.find(x => x.id === 'away')!.devices).toBe(1);
  });

  it('sets an input from a button: a value, a yes/no toggled, a number stepped, per device for the widget\'s', async () => {
    const { service } = setup([{ id: 'b', name: 'B', parts: [
      part('a', 'button', { actions: [{ do: 'input', input: 'away', value: 'toggle' }, { do: 'input', input: 'price', value: '+2' }, { do: 'input', input: 'note', value: 'Hello' }, { do: 'input', input: 'price', value: 'x' }] }),
    ] }]);
    await service.runAction('b', 'a', 0, 'input', 'heat');
    await service.runAction('b', 'a', 1, 'input');
    await service.runAction('b', 'a', 1, 'input');
    await service.runAction('b', 'a', 2, 'input');
    await expect(service.runAction('b', 'a', 3, 'input')).rejects.toThrow('Not a number value');
    const state = await service.getState('b', 'heat') as any;
    expect(state.inputs.away.devices.heat.value).toBe(true);
    expect(state.inputs.away.all).toBeUndefined();
    expect([state.inputs.price.all.value, state.inputs.note.all.value]).toEqual([4, 'Hello']);
  });

  it('marks an input set just now from a button\'s now, keeping its value, or a first one of its type', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000);
      const { service } = setup([{ id: 'b', name: 'B', parts: [
        part('a', 'button', { actions: [{ do: 'input', input: 'price', value: 'now' }, { do: 'input', input: 'away', value: 'Now' }, { do: 'input', input: 'tint', value: 'now' }] }),
        part('t', 'text', { text: '{1}', refs: [{ since: { input: 'price' } }] }),
      ] }]);
      await service.runAction('b', 'a', 0, 'input');
      await service.runAction('b', 'a', 1, 'input', 'heat');
      await expect(service.runAction('b', 'a', 2, 'input')).rejects.toThrow('Not a color value: now');
      service.setInput({ id: 'price' }, 'number', 7, undefined, 'kr');
      vi.setSystemTime(5000);
      await service.runAction('b', 'a', 0, 'input');
      const state = await service.getState('b', 'heat') as any;
      expect(state.inputs.price.all).toMatchObject({ value: 7, units: 'kr', at: 5000 });
      expect(state.inputs.away.devices.heat).toMatchObject({ value: true, at: 1000 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('CustomWidgetService: the trigger cards', () => {
  it('lists the buttons without a Flow and the choices, as Design · Part', () => {
    const { service } = setup([DESIGN]);
    expect(service.listParts('', 'tap').map(i => [i.id, i.name])).toEqual([['bed/ring', 'Bedroom · Ring']]);
    expect(service.listParts('', 'choice').map(i => i.id)).toEqual(['bed/mode']);
  });
});

describe('readDesign: widget states, pages, actions, images, rings and repeaters', () => {
  it("keeps a widget state's kind, choices and start, and a pages container's pages and its parts' pages", () => {
    const d = readDesign({ parts: [
      part('st', 'state', { stateType: 'choice', choices: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }], initial: 'zz' }),
      part('on', 'state', { initial: true }),
      part('box', 'container', { mode: 'pages', nav: 'state', pageBy: { part: 'st' }, pages: [{ name: 'One' }, { name: 'Two' }, ...Array(9).fill({})], parts: [
        part('k1', 'text', { page: 1 }), part('k2', 'text', { page: 30 }), part('k3', 'text'),
      ] }),
      part('grid', 'container', { mode: 'grid', pages: [{ name: 'x' }], parts: [part('k4', 'text', { page: 1 })] }),
      part('bad', 'container', { mode: 'pages', nav: 'state', pageBy: { part: 'box' } }),
      part('top', 'text', { page: 2 }),
    ] })!;
    const [st, on, box, grid, bad, top] = d.parts;
    expect([st.stateType, st.initial, on.stateType, on.initial]).toEqual(['choice', 'a', 'toggle', 'true']);
    expect(box.pages!.length).toBe(6);
    expect([box.nav, box.pageBy]).toEqual(['state', { part: 'st' }]);
    expect(box.parts!.map(k => k.page)).toEqual([1, 0, 0]);
    expect(['pages' in grid, 'page' in grid.parts![0], 'page' in top]).toEqual([false, false, false]);
    expect([bad.nav, 'pageBy' in bad]).toEqual(['tabs', false]); // a container isn't a widget state
  });

  it("keeps a button's actions (a state only of the design's own) and how it's pressed", () => {
    const d = readDesign({ parts: [
      part('st', 'state', {}),
      part('b', 'button', { press: 'long', actions: [
        { do: 'set', slot: 'd1:onoff', value: ' toggle ' }, { do: 'variable', variable: 'v1', value: 3 }, { do: 'flow', flowId: 'flow:f' },
        { do: 'dashboard', dashboard: 'home' }, { do: 'state', part: 'st', value: 'on' }, { do: 'state', part: 'b', value: 'on' },
        { do: 'flow', flowId: 'nope' }, { do: 'explode' },
      ] }),
    ] })!;
    expect(d.parts[1].press).toBe('long');
    expect(d.parts[1].actions).toEqual([
      { do: 'set', slot: 'd1:onoff', value: 'toggle' }, { do: 'variable', variable: 'v1', value: '3' }, { do: 'flow', flowId: 'flow:f' },
      { do: 'dashboard', dashboard: 'home' }, { do: 'state', part: 'st', value: 'on' },
    ]);
    expect(designSlots(d)).toEqual(['d1:onoff']);
    expect(designVariables(d)).toEqual(['v1']);
  });

  it('keeps an image from http(s) or a device, a ring\'s rings, and a repeater\'s filter', () => {
    expect(readPart(part('i', 'image', { image: { kind: 'url', url: 'javascript:alert(1)' }, refresh: 7 }))).toMatchObject({ fit: 'cover', refresh: 5 });
    expect(readPart(part('i', 'image', { image: { kind: 'url', url: ' https://x.test/a.jpg ' }, fit: 'contain', refresh: 0 }))).toMatchObject({ image: { kind: 'url', url: 'https://x.test/a.jpg' }, fit: 'contain', refresh: 0 });
    expect(readPart(part('i', 'image', { image: { kind: 'device', device: 'cam' } }))!.image).toEqual({ kind: 'device', device: 'cam' });
    const ring = readPart(part('r', 'ring', { rings: [{ src: { slot: 'd:a' }, min: 9, max: 1, color: 'teal' }, { src: {} }, { src: { variable: 'v' } }, { src: { slot: 'd:b' } }, { src: { slot: 'd:c' } }] }))!;
    expect(ring.rings).toEqual([{ src: { slot: 'd:a' }, min: 1, max: 9, color: 'teal' }, { src: { variable: 'v' }, color: null }]);
    expect(readPart(part('p', 'repeat', { capability: 'alarm_contact', zone: 'z1', test: { op: 'is', value: 'on' }, columns: 9, itemStyle: 'tile', control: true }))).toMatchObject({
      capability: 'alarm_contact', zone: 'z1', test: { op: 'is', value: 'on' }, columns: 4, itemStyle: 'tile', control: true,
    });
    expect(readPart(part('p', 'repeat', { capability: 'bad id!' }))!.capability).toBeUndefined();
  });

  it('lets texts, rules and rings read a widget state or a repeater, as calculated values', () => {
    const d = readDesign({ parts: [
      part('st', 'state', {}), part('rp', 'repeat', { capability: 'onoff' }), part('sh', 'shape', {}),
      part('t', 'text', { text: '{1} {2} {3}', refs: [{ part: 'st' }, { part: 'rp' }, { part: 'sh' }] }),
      part('r', 'ring', { rings: [{ src: { part: 'rp' } }, { src: { part: 'sh' } }] }),
    ] })!;
    expect(d.parts[3].refs).toEqual([{ part: 'st' }, { part: 'rp' }, null]);
    expect(d.parts[4].rings).toEqual([{ src: { part: 'rp' }, color: null }]);
  });
});

describe('CustomWidgetService: actions, repeaters and images', () => {
  const lamp = (id: string, name: string, zone: string, on: boolean) => fakeDevice({ id, name, zone, caps: { onoff: { type: 'boolean', value: on, title: 'On' } } });
  const BUTTONS = { id: 'act', name: 'Night', parts: [
    part('b', 'button', { actions: [
      { do: 'set', slot: 'heat:onoff', value: 'toggle' }, { do: 'variable', variable: 'v1', value: '4,5' }, { do: 'flow', flowId: 'flow:f1' },
      { do: 'set', slot: 'heat:target_temperature', value: '99' }, { do: 'set', slot: 'heat:thermostat_mode', value: 'Heat' },
    ] }),
    part('rp', 'repeat', { capability: 'onoff', zone: 'up', control: true }),
    part('ro', 'repeat', { capability: 'onoff' }),
    part('cam', 'image', { image: { kind: 'device', device: 'nope' } }),
  ] };

  it('runs each action the app runs, of the kind the request names, with the value read as its type', async () => {
    const { service, deps, device } = setup([BUTTONS]);
    await service.runAction('act', 'b', 0, 'set');
    expect(device.sent.at(-1)).toBe('onoff=true'); // toggled from off
    await service.runAction('act', 'b', 1, 'variable');
    expect(deps.variables.set).toHaveBeenCalledWith('v1', 4.5);
    await service.runAction('act', 'b', 2, 'flow');
    expect(deps.flows.trigger).toHaveBeenCalledWith('flow:f1');
    await service.runAction('act', 'b', 3, 'set');
    expect(device.sent.at(-1)).toBe('target_temperature=30'); // within the capability's range
    await service.runAction('act', 'b', 4, 'set');
    expect(device.sent.at(-1)).toBe('thermostat_mode="heat"'); // its id, whatever the case
    await expect(service.runAction('act', 'b', 2, 'set')).rejects.toThrow('No such action'); // not the kind said
    await expect(service.runAction('act', 'b', 9, 'flow')).rejects.toThrow('No such action');
    await expect(service.runAction('act', 'rp', 0, 'set')).rejects.toThrow('No such part');
  });

  it('reads typed values as their type', () => {
    const typed = CustomWidgetService.typedValue;
    expect([typed('boolean', 'Open', false), typed('boolean', 'toggle', true), typed('number', ' 21,5 ', 0), typed('string', ' hi ', '')]).toEqual([true, false, 21.5, 'hi']);
    expect(() => typed('boolean', 'maybe', false)).toThrow();
    expect(() => typed('number', '', 0)).toThrow();
    expect(() => typed('enum', 'x', '', [{ id: 'a', title: 'A' }])).toThrow();
  });

  it("finds a repeater's devices in its room and the rooms in it, by name, and switches only those, with Tap to switch on", async () => {
    const zones = { home: { name: 'Home' }, up: { name: 'Upstairs', parent: 'home' }, bed: { name: 'Bedroom', parent: 'up' }, down: { name: 'Down', parent: 'home' } };
    const { service, deps } = setup([BUTTONS], [lamp('l1', 'Reading lamp', 'bed', true), lamp('l2', 'Attic lamp', 'up', false), lamp('l3', 'Kitchen', 'down', true)], zones);
    const state: any = await service.getState('act');
    expect(state.repeats.rp).toEqual(['l2:onoff', 'l1:onoff']);
    expect(state.repeats.ro).toEqual(['l2:onoff', 'heat:onoff', 'l3:onoff', 'l1:onoff']);
    expect(deps.values.getState.mock.calls.at(-1)![0]).toEqual(expect.arrayContaining(['l1:onoff', 'l2:onoff', 'l3:onoff']));
    await service.setValue('act', 'rp', false, 'l1:onoff');
    await expect(service.setValue('act', 'rp', true, 'l3:onoff')).rejects.toThrow("Not one of the repeater's devices");
    await expect(service.setValue('act', 'ro', true, 'l3:onoff')).rejects.toThrow("can't switch");
    await expect(service.setValue('act', 'rp', 'on', 'l1:onoff')).rejects.toThrow("can't switch");
  });

  it("reads only an image part's own device", async () => {
    const { service } = setup([BUTTONS]);
    await expect(service.image('act', 'b')).rejects.toThrow('No such part');
    await expect(service.image('act', 'cam')).rejects.toThrow();
  });
});

describe('readDesign: segmented bars and trends', () => {
  it("keeps a segmented bar's segments and scale, and a trend's history among the design's charts", () => {
    const d = readDesign({ parts: [
      part('c', 'calc', {}),
      part('s', 'segments', { barStyle: 'donut', scale: 'max', max: -3, legend: false, segments: [
        { src: { slot: 'a:p' }, color: 'teal', label: ' Heat pump ' }, { src: { part: 'c' } }, { src: { part: 's' } }, { src: {} }, ...Array(9).fill({ src: { slot: 'b:p' } }),
      ] }),
      part('t', 'calc', { op: 'change', inputs: [{ slot: 'a:t' }], span: '6h', percent: true }),
      part('u', 'calc', { op: 'change', inputs: [{ slot: 'a:t' }], span: 'nope' }),
    ] })!;
    const [, s, t, u] = d.parts;
    expect(s.segments!.length).toBe(4); // the first six: itself and an empty one left out
    expect(s.segments!.slice(0, 2)).toEqual([{ src: { slot: 'a:p' }, color: 'teal', label: 'Heat pump' }, { src: { part: 'c' }, color: null, label: '' }]);
    expect([s.barStyle, s.scale, s.max, s.legend]).toEqual(['donut', 'max', 100, false]);
    expect([t.span, t.percent, u.span]).toEqual(['6h', true, '1h']);
    expect(designCharts(d)).toEqual([{ slot: 'a:t', span: '6h' }, { slot: 'a:t', span: '1h' }]);
    expect(designSlots(d)).toEqual(['a:p', 'b:p', 'a:t']);
  });
});

describe('readDesign: parts turned off, taps on any component, icons from values and rules, big text', () => {
  it('keeps only the parts a kind can turn off, actions only on components that are no control, and icon-only rules with an icon', () => {
    const d = readDesign({ parts: [
      part('lv', 'ring', { hide: ['name', 'value', 'icon', 'graph', 'x'] }),
      part('sh', 'shape', { actions: [{ do: 'flow', flowId: 'flow:f' }], press: 'confirm' }),
      part('sw', 'switch', { slot: 'a:onoff', actions: [{ do: 'flow', flowId: 'flow:f' }] }),
      part('ic', 'icon', { slot: 'a:locked', rules: [{ op: 'is', value: 'off', look: 'same', icon: 'unlock' }, { op: 'is', value: 'on', look: 'same' }, { op: 'is', value: 'on', look: 'red', icon: 'Bad Icon' }] }),
      part('ic2', 'icon', { rules: [{ op: 'is', value: 'on', look: 'red' }] }),
      part('tx', 'text', { size: 'display', weight: 'bold' }),
      part('tw', 'text', { weight: 'heavy' }),
    ] })!;
    const [lv, sh, sw, ic, ic2, tx, tw] = d.parts;
    expect(lv.hide).toEqual(['name', 'value']);
    expect([sh.actions, sh.press]).toEqual([[{ do: 'flow', flowId: 'flow:f' }], 'confirm']);
    expect('actions' in sw).toBe(false);
    expect(ic.slot).toBe('a:locked');
    expect(ic.rules).toEqual([{ op: 'is', value: 'off', look: 'same', icon: 'unlock' }, { op: 'is', value: 'on', look: 'red' }]);
    expect(ic2.rules).toEqual([]); // an icon without a value: its rules must name one
    expect([tx.size, tx.weight, 'weight' in tw]).toEqual(['display', 'bold', false]);
    expect(designFlowsOf(d)).toEqual(['flow:f']);
  });

  it("runs a tapped component's action as a button's", async () => {
    const { service, deps } = setup([{ id: 'tp', name: 'T', parts: [part('sh', 'shape', { actions: [{ do: 'flow', flowId: 'flow:x' }] })] }]);
    await service.runAction('tp', 'sh', 0, 'flow');
    expect(deps.flows.trigger).toHaveBeenCalledWith('flow:x');
  });
});

describe('readDesign: styles, colours, width, charts, any device and ready-mades (2026-11-24)', () => {
  it("gives a container a style (a tile where it had no background before, else none) and every text kind a text colour", () => {
    expect(readPart({ kind: 'container' })!.style).toBe('tile');
    expect(readPart({ kind: 'container', background: { kind: 'color', from: '#112233' } })!.style).toBe('none');
    expect(readPart({ kind: 'container', style: 'pill', background: { kind: 'color', from: 'teal' } })).toMatchObject({ style: 'pill', background: { kind: 'color', from: 'teal' } });
    // A palette colour in a background or gradient, as Muted or Vivid draws it.
    expect(readPart({ kind: 'shape', background: { kind: 'gradient', from: 'blue', to: '#ABCDEF' } })!.background).toEqual({ kind: 'gradient', from: 'blue', to: '#abcdef', angle: 135 });
    expect(readPart({ kind: 'switch', textColor: 'red' })!.textColor).toBe('red');
    expect(readPart({ kind: 'shape', textColor: 'red' })).not.toHaveProperty('textColor');
    // A Text's own colour was its text's: it's its text colour now.
    expect(readPart({ kind: 'text', color: '#FF0000' })).toMatchObject({ textColor: '#ff0000', color: null });
  });

  it('keeps every design on the one column\'s four grid columns, narrowing one laid out over more before', () => {
    // Before 2026-11-24 a two-column design had eight grid columns; it's narrowed onto four, rows kept.
    const old = readDesign({ span: 2, parts: [part('a', 'text', { at: { x: 6, y: 1, w: 2, h: 1 } }), part('b', 'text', { at: { x: 0, y: 0, w: 4, h: 2 } })] })!;
    expect(old.span).toBe(2);
    expect(old.parts.map(p => p.at)).toEqual([{ x: 3, y: 1, w: 1, h: 1 }, { x: 0, y: 0, w: 2, h: 2 }]);
    // One made since: within four columns, left as it is (the span only shows it stretched).
    const now = readDesign({ span: 3, parts: [part('a', 'text', { at: { x: 1, y: 0, w: 3, h: 1 } })] })!;
    expect(now.parts[0].at).toEqual({ x: 1, y: 0, w: 3, h: 1 });
    expect(readDesign(now)!.parts[0].at).toEqual({ x: 1, y: 0, w: 3, h: 1 });
    expect(readDesign({ span: 9, parts: [] })!.span).toBe(3);
    expect(readDesign({ parts: [] })).not.toHaveProperty('span');
  });

  it("keeps a chart's series (three at most, once each), span, style and edges among the design's values and histories", () => {
    const d = readDesign({ parts: [part('c', 'chart', { series: [{ slot: 'a:measure_power', color: 'red' }, { slot: 'a:measure_power' }, { slot: 'b:measure_power' }, { slot: 'c:x' }, { slot: 'd:x' }, { slot: 'nope' }], span: '7d', chartStyle: 'bars', axis: false })] })!;
    expect(d.parts[0]).toMatchObject({ series: [{ slot: 'a:measure_power', color: 'red' }, { slot: 'b:measure_power', color: null }, { slot: 'c:x', color: null }], span: '7d', chartStyle: 'bars', axis: false });
    expect(designSlots(d)).toEqual(['a:measure_power', 'b:measure_power', 'c:x']);
    expect(designCharts(d).map(c => `${c.span} ${c.slot}`)).toEqual(['7d a:measure_power', '7d b:measure_power', '7d c:x']);
  });

  it("fills in the widget's device (`@`) everywhere a design reads one, and says when a design uses it", () => {
    const d = readDesign({ sample: 'lamp', parts: [
      part('s', 'switch', { slot: '@:onoff', rules: [{ op: 'is', value: 'on', look: 'red', of: { slot: '@:alarm' } }] }),
      part('t', 'text', { text: '{1}', refs: [{ slot: '@:dim', show: 'name' }] }),
      part('i', 'image', { image: { kind: 'device', device: '@' } }),
      part('o', 'text', { text: '{1}', refs: [{ slot: 'other:dim' }] }),
    ] })!;
    expect(d.sample).toBe('lamp');
    expect(usesDevice(d)).toBe(true);
    expect(usesDevice(readDesign({ parts: [part('o', 'text')] })!)).toBe(false);
    const bound = bindDevice(d, 'd7');
    expect(designSlots(bound)).toEqual(['d7:onoff', 'd7:alarm', 'd7:dim', 'other:dim']);
    expect(bound.parts[2].image).toEqual({ kind: 'device', device: 'd7' });
    // The design itself is left as it was; without a device, it's the same object.
    expect(designSlots(d)).toEqual(['@:onoff', '@:alarm', '@:dim', 'other:dim']);
    expect(bindDevice(d, undefined)).toBe(d);
    expect(bindDevice(d, 'a:b')).toBe(d);
  });

  it("keeps a design saved as a ready-made, and a Repeater's ready-made and devices (picked, or by capability)", () => {
    expect(readDesign({ ready: true, parts: [part('box', 'container')] })!.ready).toBe(true);
    expect(readDesign({ ready: 'yes', parts: [] })).not.toHaveProperty('ready');
    const each = readPart({ kind: 'each', ready: 'r1', devices: ['a', 'a', 'b', '@', 'has space'], columns: 9, limit: 99 })!;
    expect(each).toMatchObject({ ready: 'r1', devices: ['a', 'b'], columns: 4, limit: 24, style: 'none' });
    expect(readPart({ kind: 'each', capability: 'onoff', zone: 'z1', devices: ['a'] })).toMatchObject({ capability: 'onoff', zone: 'z1' });
    expect(readPart({ kind: 'each', capability: 'onoff', devices: ['a'] })).not.toHaveProperty('devices');
  });
});

describe('CustomWidgetService: any device, Repeaters and ready-mades (2026-11-24)', () => {
  const lamp = (id: string, name: string, on: boolean) => fakeDevice({ id, name, zone: 'z', caps: { onoff: { type: 'boolean', value: on, title: 'On' } } });
  const READY = { id: 'tile', name: 'Lamp tile', ready: true, parts: [part('box', 'container', { mode: 'free', parts: [part('sw', 'switch', { slot: '@:onoff', at: { x: 0, y: 0, w: 50, h: 50 } })] })] };
  const ANY = { id: 'any', name: 'Any lamp', parts: [
    part('sw', 'switch', { slot: '@:onoff' }),
    part('rep', 'each', { ready: 'tile', devices: ['l1', 'l2'] }),
    part('all', 'each', { ready: 'tile', capability: 'onoff' }),
    part('none', 'each', { ready: 'any' }),
  ] };

  it("reads a design for any device with the widget's device, and a Repeater's ready-made with each of its devices", async () => {
    const { service, deps } = setup([READY, ANY], [lamp('l1', 'Lamp B', true), lamp('l2', 'Lamp A', false)]);
    const state: any = await service.getState('any', 'l2');
    expect(state.design.parts[0].slot).toBe('l2:onoff');
    expect(state.each.rep).toEqual({ part: READY.parts[0] && expect.objectContaining({ id: 'box' }), devices: ['l1', 'l2'] });
    // Every device with the capability, by name; a design that isn't a ready-made repeats nothing.
    expect(state.each.all.devices).toEqual(['heat', 'l2', 'l1']);
    expect(state.each.none).toEqual({ part: null, devices: [] });
    // Each copy's values are read with the design's own.
    expect(deps.values.getState.mock.calls.at(-1)![0]).toEqual(expect.arrayContaining(['l2:onoff', 'l1:onoff', 'heat:onoff']));
    // The ready-mades aren't designs to place.
    expect(service.designItems('').map(i => i.id)).toEqual(['any']);
  });

  it("sends the devices' own icons a design shows (a switch's, an icon's, a List's items'), and only then", async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, text: async () => `<svg>${url}</svg>` })));
    try {
      const own = (id: string, icon: string) => Object.assign(lamp(id, id, true), { iconOverride: icon });
      const ICONS = { id: 'icons', name: 'Icons', parts: [
        part('sw', 'switch', { slot: 'l1:onoff', deviceIcon: true }),
        part('ic', 'icon', { slot: 'l2:onoff', deviceIcon: true }),
        part('plain', 'switch', { slot: 'l3:onoff' }),
        part('list', 'repeat', { capability: 'onoff', deviceIcon: true }),
      ] };
      const { service } = setup([ICONS, ANY], [own('l1', 'wb-test-a'), own('l2', 'wb-test-b'), own('l3', 'wb-test-c')]);
      const state: any = await service.getState('icons');
      const decode = (d: string) => Buffer.from(d.split(',')[1], 'base64').toString();
      expect(decode(state.icons.l1)).toBe('<svg>https://my.homey.app/img/devices/wb-test-a.svg</svg>');
      expect(decode(state.icons.l2)).toBe('<svg>https://my.homey.app/img/devices/wb-test-b.svg</svg>');
      // The List's items: every device with onoff, the thermostat and l3 too.
      expect(Object.keys(state.icons).sort()).toEqual(['heat', 'l1', 'l2', 'l3']);
      expect(await service.getState('any', 'l1')).not.toHaveProperty('icons');
      expect(readPart(part('t', 'text', { deviceIcon: true }))).not.toHaveProperty('deviceIcon');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sorts a Repeater of every device with a capability by its value before the limit, and repeats up to 24', async () => {
    const battery = (id: string, name: string, v: number | null) => fakeDevice({ id, name, zone: 'z', caps: { measure_battery: { type: 'number', value: v, title: 'Battery', units: '%' } } });
    const many = Array.from({ length: 30 }, (_, i) => battery(`b${i}`, `Sensor ${i}`, 50 + i));
    const BAT = { id: 'bat', name: 'Batteries', parts: [
      part('low', 'each', { ready: 'tile', capability: 'measure_battery', sort: 'up', limit: 3 }),
      part('high', 'each', { ready: 'tile', capability: 'measure_battery', sort: 'down', limit: 2 }),
      part('all', 'each', { ready: 'tile', capability: 'measure_battery', sort: 'name' }),
    ] };
    const { service } = setup([READY, BAT], [battery('x', 'Door', 12), battery('y', 'Bell', null), battery('z', 'Window', 8), ...many]);
    const state: any = await service.getState('bat');
    expect(state.each.low.devices).toEqual(['z', 'x', 'b0']);
    expect(state.each.high.devices).toEqual(['b29', 'b28']);
    expect(state.each.all.devices).toHaveLength(24);
    expect(readDesign(BAT)!.parts.map(p => p.sort)).toEqual(['up', 'down', undefined]);
    // Picked devices keep their order: no sort.
    expect(readPart(part('p', 'each', { devices: ['a', 'b'], sort: 'up' }))!.sort).toBeUndefined();
  });

  it("acts on the widget's device, and on a Repeater's copy only for one of its devices", async () => {
    const devices = [lamp('l1', 'Lamp B', true), lamp('l2', 'Lamp A', false)];
    const { service } = setup([READY, ANY], devices);
    await service.setValue('any', 'sw', true, undefined, 'l2');
    expect((devices[1] as any).sent).toEqual(['onoff=true']);
    await service.setValue('any', 'rep/sw', false, undefined, 'l1');
    expect((devices[0] as any).sent).toEqual(['onoff=false']);
    await expect(service.setValue('any', 'rep/sw', true, undefined, 'heat')).rejects.toThrow('No such part');
    await expect(service.setValue('any', 'rep/nope', true, undefined, 'l1')).rejects.toThrow('No such part');
    await expect(service.setValue('any', 'sw/sw', true, undefined, 'l1')).rejects.toThrow('No such part');
  });

  it("shows the builder's preview with its preview device", async () => {
    const { service } = setup([READY], [lamp('l1', 'Lamp', true)]);
    const state: any = await service.previewState({ ...ANY, sample: 'l1' });
    expect(state.design.parts[0].slot).toBe('l1:onoff');
    expect(Object.keys(state.values)).toContain('l1:onoff');
  });
});

describe('linked ready-mades (2026-11-24, the user: delete your own, and detach an instance from its source)', () => {
  const lamp = (id: string, name: string, on: boolean) => fakeDevice({ id, name, zone: 'z', caps: { onoff: { type: 'boolean', value: on, title: 'On' } } });
  const TILE = part('box', 'container', { mode: 'free', at: { x: 0, y: 0, w: 2, h: 1 }, parts: [
    part('c', 'calc', { op: 'sum', inputs: [{ slot: '@:onoff' }], at: { x: 0, y: 0, w: 50, h: 50 } }),
    part('sw', 'switch', { slot: '@:onoff', rules: [{ of: { part: 'c' }, op: 'above', value: '0', look: 'red' }], at: { x: 50, y: 0, w: 50, h: 50 } }),
  ] });
  const READY = { id: 'tile', name: 'Lamp tile', ready: true, parts: [TILE] };
  const HOST = { id: 'host', name: 'Hall', parts: [
    part('u', 'use', { ready: 'tile', at: { x: 1, y: 2, w: 2, h: 1 } }),
    part('box2', 'container', { mode: 'grid', parts: [part('u2', 'use', { ready: 'tile' })] }),
  ] };

  it('reads a linked instance: only its ready-made', () => {
    expect(readPart({ kind: 'use', ready: 'tile', slot: 'a:onoff', color: 'red' })).toMatchObject({ kind: 'use', ready: 'tile', style: 'none' });
    expect(readPart({ kind: 'use', ready: '__proto__' })).not.toHaveProperty('ready');
  });

  it('copies a component with new ids, its references to its own parts following them', () => {
    const copy = renewIds(readDesign({ parts: [TILE] })!.parts[0]) as any;
    const [c, sw] = copy.parts;
    expect(new Set([copy.id, c.id, sw.id, 'box', 'c', 'sw']).size).toBe(6);
    expect(sw.rules[0].of).toEqual({ part: c.id });
    expect(sw.slot).toBe('@:onoff');
  });

  it("shows a linked instance as its ready-made now, with the widget's device, and acts on it", async () => {
    const devices = [lamp('l1', 'Lamp', true)];
    const { service } = setup([READY, HOST], devices);
    const state: any = await service.getState('host', 'l1');
    expect(state.each.u).toEqual({ part: expect.objectContaining({ id: 'box' }), devices: ['l1'] });
    expect(Object.keys(state.values)).toContain('l1:onoff');
    await service.setValue('host', 'u/sw', false, undefined, 'l1');
    expect((devices[0] as any).sent).toEqual(['onoff=false']);
    // Without a device its values stay the widget's device's, read as nothing.
    expect((await service.getState('host') as any).each.u.devices).toEqual(['@']);
  });

  it('shows a linked ready-made with its own device, and acts only for that one', async () => {
    expect(readPart({ kind: 'use', ready: 'tile', device: '@' })).not.toHaveProperty('device');
    const devices = [lamp('l1', 'Lamp', true), lamp('l2', 'Other', false)];
    const own = { id: 'own', name: 'Own', parts: [part('u', 'use', { ready: 'tile', device: 'l2' })] };
    const { service, deps } = setup([READY, own], devices);
    expect((await service.getState('own', 'l1') as any).each.u.devices).toEqual(['l2']);
    expect(deps.values.getState.mock.calls.at(-1)![0]).toEqual(['l2:onoff']);
    await service.setValue('own', 'u/sw', true, undefined, 'l2');
    expect((devices[1] as any).sent).toEqual(['onoff=true']);
    await expect(service.setValue('own', 'u/sw', true, undefined, 'l1')).rejects.toThrow('No such part');
  });

  it("turns a deleted ready-made's linked instances into copies of their own, except a container inside a container", () => {
    const { service } = setup([READY, HOST]);
    expect(service.remove('tile')).toEqual({ removed: true });
    const host = service.get('host')!;
    expect(host.parts.map(p => p.kind)).toEqual(['container', 'container']);
    expect(host.parts[0]).toMatchObject({ at: { x: 1, y: 2, w: 2, h: 1 } });
    expect(host.parts[0].parts!.map(p => p.kind)).toEqual(['calc', 'switch']);
    expect(host.parts[1].parts).toEqual([]);
    const d = readDesign(HOST)!;
    expect(detachUses(d, 'other', readDesign({ parts: [TILE] })!.parts[0])).toBe(false);
  });
});

describe("the normal widgets' options (2026-11-24, the user's review of the styles and options)", () => {
  it("reads Notes' text sizes (the old ones as the nearest), long text, a Post-it's paper and secondary text", () => {
    const text = (o: Record<string, unknown>) => readPart(part('t', 'text', o))!;
    expect(['body', 'heading', 'small', 'large', 'display', 'x'].map(size => text({ size }).size)).toEqual(['small', 'default', 'small', 'large', 'display', 'small']);
    expect([text({ overflow: 'scroll' }).overflow, text({ overflow: 'wrap' }).overflow, text({ muted: true }).muted]).toEqual(['scroll', undefined, true]);
    expect([text({ style: 'postit', color: 'pink' }).color, text({ style: 'tile', color: 'pink' }).color]).toEqual(['pink', null]);
    // A Post-it is a Text's only.
    expect(readPart(part('c', 'switch', { style: 'postit' }))!.style).toBe('tile');
  });

  it("reads any of the charts' time spans, smooth lines and Chart · Basic's options", () => {
    expect(['3d!', '1w!-', '90m', '2mo', '24h', 'today', '1h!', '5d-', 'x'].map(span => readPart(part('s', 'sparkline', { span }))!.span))
      .toEqual(['3d!', '1w!-', '90m', '2mo', '24h', 'today', '24h', '24h', '24h']);
    const c = readPart(part('c', 'chart', { series: [{ slot: 'a:t', title: 'Inside' }], chartStyle: 'line', smooth: true, chartScale: 'zero', negative: true, chartLegend: 'below', header: true }))!;
    expect([c.series![0].title, c.chartStyle, c.smooth, c.chartScale, c.negative, c.chartLegend, c.header]).toEqual(['Inside', 'line', true, 'zero', true, 'below', true]);
    expect([readPart(part('c', 'chart', {}))!.chartStyle, readPart(part('c', 'chart', {}))!.chartLegend]).toEqual(['area', 'above']);
  });

  it("reads an arc's and a bar's Chart · Gauge zones and range, their thickness, and asks for the range's history", () => {
    const a = readPart(part('a', 'arc', { src: { slot: 'm:p' }, zones: 'rising', redAt: 90, rangeSpan: '1d!' }))!;
    expect([a.zones, a.yellowAt, a.redAt, a.rangeSpan, a.thickness]).toEqual(['rising', 60, 90, '1d!', 12]);
    expect([readPart(part('b', 'bar', { zones: 'nope' }))!.zones, readPart(part('b', 'bar', {}))!.thickness]).toEqual([undefined, 6]);
    expect(designCharts(readDesign({ id: 'd', parts: [part('a', 'arc', { src: { slot: 'm:p' }, rangeSpan: '1d!' })] })!)).toEqual([{ slot: 'm:p', span: '1d!' }]);
  });

  it("reads a switch's lighter tile, a variable's read only and step, and a container's fill by level", () => {
    expect([readPart(part('s', 'switch', { active: 'lighter' }))!.active, readPart(part('s', 'switch', { active: 'x' }))!.active]).toEqual(['lighter', undefined]);
    const v = readPart(part('v', 'variable', { variable: 'v1', readOnly: true, step: 5 }))!;
    expect([v.readOnly, v.step]).toEqual([true, 5]);
    const d = readDesign({ id: 'd', parts: [part('c', 'container', { fillBy: { slot: 'b:measure_battery' }, redBelow: 15 })] })!;
    expect([d.parts[0].fillBy, d.parts[0].redBelow, d.parts[0].yellowBelow]).toEqual([{ slot: 'b:measure_battery' }, 15, 20]);
    expect(designSlots(d)).toEqual(['b:measure_battery']);
  });

  it("reads a span Sparklines don't name as the window it means now in the Homey's time zone", async () => {
    vi.useFakeTimers({ now: new Date('2026-11-24T10:00:00Z') });
    try {
      expect(spanWindow('3d!', Date.now(), 'Europe/Copenhagen')).toEqual({ from: Date.parse('2026-11-21T23:00:00Z'), end: Date.now(), unit: 'day' });
      expect(spanWindow('1w!-', Date.now(), 'Europe/Copenhagen')).toEqual({ from: Date.parse('2026-11-15T23:00:00Z'), end: Date.parse('2026-11-22T23:00:00Z'), unit: 'week' });
      expect(spanWindow('90m', Date.now(), 'UTC')).toEqual({ from: Date.now() - 90 * 60e3, end: Date.now(), unit: null });
      expect(spanWindow('1h!', Date.now(), 'UTC')).toBeNull();
      const { service, deps } = setup([{ id: 'd', name: 'D', parts: [part('s', 'sparkline', { slot: 'a:t', span: '3d!' }), part('t', 'sparkline', { slot: 'a:t', span: '24h' })] }]);
      (deps.sparklines as any).getWindows = vi.fn(async (list: any[]) => list.map(r => ({ deviceId: 'a', capabilityId: 't', points: [[1, 3]] })));
      const state: any = await service.getState('d');
      expect((deps.sparklines as any).getWindows).toHaveBeenCalledWith([{ slot: 'a:t', from: Date.parse('2026-11-21T23:00:00Z'), end: Date.now(), unit: 'day', span: '3d!' }]);
      expect(deps.sparklines.getState).toHaveBeenCalledWith(['a:t'], '24h');
      expect(state.histories).toMatchObject({ '3d!\na:t': [[1, 3]], '24h\na:t': [[1, 2]] });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a container's fill strength", () => {
  it('keeps half or full on a container, the default unsaid, and none on a shape', () => {
    const fill = (kind: string, dim: unknown) => readPart(part('p', kind, { background: { kind: 'color', from: 'blue', dim } }))!.background;
    expect([fill('container', 'half'), fill('container', 'widget'), fill('container', 'x'), fill('shape', 'full')])
      .toEqual([{ kind: 'color', from: 'blue', dim: 'half' }, { kind: 'color', from: 'blue' }, { kind: 'color', from: 'blue' }, { kind: 'color', from: 'blue' }]);
  });
});
