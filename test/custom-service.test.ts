import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeDevice, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import { MAX_INPUTS, MAX_PARTS, allParts, designCharts, designSlots, designVariables, readDesign, readPart, ruleHolds } from '../lib/customDesigns.js';
import CustomWidgetService, {
  CUSTOM_CHOICE_CARD, CUSTOM_DESIGN_EVENT, CUSTOM_DESIGNS_SETTING, CUSTOM_FLOW_EVENT, CUSTOM_FLOW_SETTING, CUSTOM_TAPPED_CARD,
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
        part('t', 'value', { slot: 'd1:measure_temperature', show: 'chart', span: 'nope', min: 3, flowId: 'flow:x', at: { x: 9, y: -2, w: 9, h: 2 } }),
        part('s', 'stepper', { variable: 'v1', step: '0.25', min: 30, max: 10 }),
        part('b', 'button', { flowId: 'advanced:a1', color: 'PURPLE', icon: 'tv' }),
        part('x', 'nonsense'),
        part('c', 'choice', { slot: 'd1:thermostat_mode', choices: [{ label: 'Heat', value: 'heat' }, { value: 'heat' }, { value: '' }, { value: 'off' }] }),
        part('r', 'value', { rules: [{ op: 'above', value: 25, look: 'red' }, { op: 'sideways', value: 1, look: 'red' }, { op: 'is', value: 'x', look: 'hide' }, { op: 'is', value: 'x', look: 'mauve' }] }),
      ],
    })!;
    expect(d.name).toBe('Living room');
    expect(d.parts.map(p => p.kind)).toEqual(['value', 'stepper', 'button', 'choice', 'value']);
    const [t, s, b, c, r] = d.parts;
    // A value's chart span falls back to 24 hours; what a value doesn't use is left out; it stays on the 4-column grid.
    expect(t).toMatchObject({ slot: 'd1:measure_temperature', show: 'chart', span: '24h', at: { x: 3, y: 0, w: 1, h: 2 } });
    expect(t).not.toHaveProperty('min');
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
          part('k', 'value', { at: { x: 90, y: 10, w: 50, h: 20 } }),
          part('inner', 'container'),
        ] }),
      ],
    })!;
    expect(new Set(allParts(d).map(p => p.id)).size).toBe(4);
    const box = d.parts[2];
    expect(box.background).toEqual({ kind: 'gradient', from: '#112233', to: '#445566', angle: 135 });
    // Free-form places are per cent, kept inside the box.
    expect(box.parts!.map(p => [p.kind, p.at])).toEqual([['value', { x: 90, y: 10, w: 10, h: 20 }]]);
    const many = readDesign({ parts: Array.from({ length: MAX_PARTS + 5 }, (_, i) => part(`p${i}`, 'text')) })!;
    expect(many.parts).toHaveLength(MAX_PARTS);
  });

  it("keeps a part's background, and reads one saved as tile: false as none", () => {
    expect(readPart({ kind: 'value', style: 'pill' })!.style).toBe('pill');
    expect(readPart({ kind: 'value', style: 'round' })!.style).toBe('tile');
    expect(readPart({ kind: 'value', tile: false })!.style).toBe('none');
    expect(readPart({ kind: 'text' })!.style).toBe('none');
  });

  it('refuses what is not a design, and a reserved id', () => {
    expect(readDesign(null)).toBeNull();
    expect(readDesign('x')).toBeNull();
    expect(readDesign({ id: '__proto__' }, 'fresh')!.id).toBe('fresh');
    expect(readPart({ kind: 'value', id: 'constructor' })!.id).not.toBe('constructor');
  });

  it("lists a design's values and histories once each", () => {
    const d = readDesign({ parts: [
      part('a', 'value', { slot: 'd1:measure_power', show: 'chart' }),
      part('b', 'chart', { slot: 'd1:measure_power', span: '24h' }),
      part('c', 'gauge', { slot: 'd2:measure_humidity' }),
    ] })!;
    expect(designSlots(d)).toEqual(['d1:measure_power', 'd2:measure_humidity']);
    expect(designCharts(d)).toEqual([{ slot: 'd1:measure_power', span: '24h' }]);
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
    expect([c.op, c.test, c.formula, c.winner, c.decimals, c.sourceOnly]).toEqual(['count', { op: 'isNot', value: 'off' }, undefined, undefined, 3, true]);
    expect(readPart(part('f', 'calc', { op: 'formula', formula: ' (a + b)  / 2 ' }))).toMatchObject({ op: 'formula', formula: '(a + b) / 2' });
    expect(readPart(part('m', 'calc', { op: 'max', winner: true }))).toMatchObject({ op: 'max', winner: true });
    expect(readPart(part('u', 'calc', { op: 'what' }))!.op).toBe('sum');
  });

  it("keeps a time's mode and only that mode's fields", () => {
    const since = readPart(part('t', 'time', { timeMode: 'since', slot: 'd1:alarm_motion', seconds: true }))!;
    expect([since.timeMode, since.slot, 'seconds' in since]).toEqual(['since', 'd1:alarm_motion', false]);
    expect(readPart(part('t', 'time', { timeMode: 'until', until: '25:00' }))!.until).toBe('22:00');
    expect(readPart(part('t', 'time', { timeMode: 'until', until: '06:30' }))!.until).toBe('06:30');
    expect(readPart(part('t', 'time', { timeMode: 'date', dateStyle: 'short' }))!.dateStyle).toBe('short');
    const clock = readPart(part('t', 'time', { slot: 'd1:onoff' }))!;
    expect([clock.timeMode, clock.seconds, 'slot' in clock]).toEqual(['clock', false, false]);
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
});

const thermostat = () => fakeDevice({
  id: 'heat', name: 'Bedroom', caps: {
    target_temperature: { type: 'number', value: 20, units: '°C', min: 5, max: 30 },
    thermostat_mode: { type: 'enum', value: 'auto', values: [{ id: 'auto' }, { id: 'heat' }] },
    onoff: { type: 'boolean', value: false },
  },
});

function setup(designs: unknown[] = [], extra: ReturnType<typeof fakeDevice>[] = [], zones: Record<string, { name: string, parent?: string }> = {}) {
  const devices = [thermostat(), ...extra];
  const homey = fakeHomey(fakeApi({ devices, zones }));
  if (designs.length) homey.settings.set(CUSTOM_DESIGNS_SETTING, designs);
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

const DESIGN = {
  id: 'bed', name: 'Bedroom', parts: [
    part('sw', 'switch', { slot: 'heat:onoff' }),
    part('set', 'stepper', { slot: 'heat:target_temperature', min: 15, max: 25 }),
    part('mode', 'choice', { slot: 'heat:thermostat_mode', choices: [{ label: 'Auto', value: 'auto' }, { label: 'Heat', value: 'heat' }] }),
    part('guests', 'variable', { variable: 'v1' }),
    part('movie', 'button', { flowId: 'flow:f1' }),
    part('ring', 'button', { name: 'Ring' }),
    part('msg', 'text', { text: 'Hi', flow: { text: true, color: true, hidden: true }, reset: 'hour' }),
    part('cost', 'flowvalue', {}),
    part('t', 'value', { slot: 'heat:target_temperature', show: 'chart', span: '24h' }),
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
    expect(deps.values.getState).toHaveBeenCalledWith(['heat:onoff', 'heat:target_temperature', 'heat:thermostat_mode']);
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
    await service.startFlow('bed', 'movie');
    expect(deps.flows.trigger).toHaveBeenCalledWith('flow:f1');
    await service.tap('bed', 'ring', 'web-home-w1');
    expect(trigger).toHaveBeenCalledWith(CUSTOM_TAPPED_CARD, { part: 'Ring', design: 'Bedroom', dashboard: 'home' }, { part: 'bed/ring' });
    await expect(service.tap('bed', 'movie')).rejects.toThrow('starts a Flow');
  });
});

describe('CustomWidgetService: Flow cards', () => {
  it('lists only the parts open to a change, as Design · Part', () => {
    const { service } = setup([DESIGN]);
    expect(service.listParts('', 'text').map(i => [i.id, i.name])).toEqual([['bed/msg', 'Bedroom · Hi']]);
    expect(service.listParts('', 'value').map(i => i.id)).toEqual(['bed/cost']);
    expect(service.listParts('', 'tap').map(i => i.id)).toEqual(['bed/ring']);
    expect(service.listParts('', 'choice').map(i => i.id)).toEqual(['bed/mode']);
    expect(service.listParts('', 'icon')).toEqual([]);
  });

  it('sets what a part allows, sends it, keeps it, and refuses the rest', async () => {
    const { homey, service } = setup([DESIGN]);
    service.setText({ id: 'bed/msg' }, '  Parcel   here ');
    service.setColor({ id: 'bed/msg' }, 'orange');
    service.setShown({ id: 'bed/msg' }, false);
    expect(homey.api.realtime).toHaveBeenLastCalledWith(CUSTOM_FLOW_EVENT, {
      design: 'bed', part: 'msg', values: { text: 'Parcel here', color: 'orange', hidden: true, at: Date.now(), expires: Date.now() + 3600e3 },
    });
    expect(service.isShown({ id: 'bed/msg' })).toBe(false);
    expect(() => service.setIcon({ id: 'bed/msg' }, 'bell')).toThrow("isn't open to Flows");
    service.setNumber({ id: 'bed/cost' }, 42.5, 'kr');
    await vi.advanceTimersByTimeAsync(2100);
    expect(homey.settings.get(CUSTOM_FLOW_SETTING)).toMatchObject({ bed: { msg: { text: 'Parcel here' }, cost: { value: 42.5, units: 'kr' } } });
    expect(((await service.getState('bed')) as any).flow.cost).toMatchObject({ value: 42.5 });
  });

  it('lets a value go back after its hour, telling the widgets', async () => {
    const { homey, service } = setup([DESIGN]);
    service.start();
    service.setText({ id: 'bed/msg' }, 'Soon gone');
    homey.api.realtime.mockClear();
    await vi.advanceTimersByTimeAsync(3600e3 + 100);
    expect(homey.api.realtime).toHaveBeenCalledWith(CUSTOM_FLOW_EVENT, { design: 'bed', part: 'msg', values: null });
    expect(((await service.getState('bed')) as any).flow).toEqual({});
  });

  it('puts a part back as designed, and forgets what a part no longer allows once saved', async () => {
    const { service } = setup([DESIGN]);
    service.setText({ id: 'bed/msg' }, 'One');
    service.reset({ id: 'bed/msg' });
    expect(((await service.getState('bed')) as any).flow).toEqual({});
    service.setText({ id: 'bed/msg' }, 'Two');
    service.save({ ...DESIGN, parts: DESIGN.parts.map(p => (p.id === 'msg' ? { ...p, flow: {} } : p)) });
    expect(((await service.getState('bed')) as any).flow).toEqual({});
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
