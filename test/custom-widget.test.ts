// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeFrame, frameElements } from './helpers/fakeFrame.js';
import { loadMount, loadWidget } from './helpers/loadWidget.js';
import { RULE_OPS, ruleHolds } from '../lib/customDesigns.js';

let win: any;
beforeAll(() => { win = loadWidget('custom'); loadMount('custom'); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

const cap = (o: object = {}) => ({ title: 'T', type: 'number', units: '°C', decimals: 1, min: null, max: null, values: null, icon: null, ...o });
const value = (slot: string, v: unknown, c: object = {}) => {
  const [deviceId, capabilityId] = slot.split(':');
  return { deviceId, capabilityId, name: 'Sensor', capability: cap(c), value: v };
};
const part = (id: string, kind: string, o: object = {}) => ({ id, kind, name: '', at: { x: 0, y: 0, w: 2, h: 1 }, color: null, icon: null, tile: true, rules: [], flow: {}, reset: 'never', ...o });
const state = (parts: object[], values: object[] = [], extra: object = {}) => ({
  design: { id: 'd', name: 'D', updatedAt: 1, parts },
  values: Object.fromEntries(values.map((v: any) => [`${v.deviceId}:${v.capabilityId}`, v])),
  variables: {}, flows: {}, histories: {}, flow: {}, now: Date.now(), ...extra,
});

function widget(s: object, opts: object = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createCustomWidget(root, opts);
  w.setState(s);
  const at = (id: string) => root.querySelector<HTMLElement>(`[data-part="${id}"]`)!;
  return { w, root, at };
}

describe("the widget's rules", () => {
  it("are lib/customDesigns.ts' rules", () => {
    const values = [true, false, 0, 1, 25, 25.5, -3, 'open', 'Heat', 'auto', null, '', 'on'];
    const ruleValues = ['25', '25,5', 'open', 'off', 'heat', '0', 'true', 'x'];
    for (const op of RULE_OPS) {
      for (const rv of ruleValues) {
        for (const v of values) expect([op, rv, v, win.customRuleHolds({ op, value: rv }, v)]).toEqual([op, rv, v, ruleHolds({ op, value: rv, look: 'red' }, v)]);
      }
    }
  });

  it('tint a part by the first that holds, or hide it; a Flow wins over both', () => {
    const rules = [{ op: 'above', value: '25', look: 'red' }, { op: 'below', value: '10', look: 'hide' }];
    const s = state([part('t', 'value', { slot: 'a:t', rules })], [value('a:t', 27)]);
    const { w, at } = widget(s);
    expect(at('t').classList.contains('wb-colored')).toBe(true);
    expect(at('t').dataset.wkColor).toBe('red');
    w.pushValue({ deviceId: 'a', capabilityId: 't', value: 5 });
    expect(at('t').classList.contains('wb-hidden')).toBe(true);
    w.pushValue({ deviceId: 'a', capabilityId: 't', value: 20 });
    expect(at('t').classList.contains('wb-hidden') || at('t').classList.contains('wb-colored')).toBe(false);
    w.pushFlow({ part: 't', values: { color: '#123456', at: 1 } });
    expect(at('t').style.getPropertyValue('--wk-c')).toBe('#123456');
    w.pushFlow({ part: 't', values: { hidden: true, at: 1 } });
    expect(at('t').classList.contains('wb-hidden')).toBe(true);
  });
});

describe('drawing', () => {
  it('puts parts on the grid and in containers, on the fine grid or free-form', () => {
    const { at } = widget(state([
      part('a', 'text', { text: 'Hello', at: { x: 1, y: 2, w: 3, h: 1 } }),
      part('box', 'container', { mode: 'free', at: { x: 0, y: 0, w: 4, h: 2 }, background: { kind: 'color', from: '#223344' }, parts: [
        part('k', 'text', { text: 'In', at: { x: 10, y: 20, w: 30, h: 40 } }),
      ] }),
    ]));
    expect(at('a').style.gridColumn).toBe('2 / span 3');
    expect(at('a').style.gridRow).toBe('3 / span 1');
    expect(at('a').textContent).toBe('Hello');
    expect(at('box').classList.contains('wb-box-free')).toBe(true);
    expect(at('k').style.left).toBe('10%');
    expect(at('k').style.height).toBe('40%');
  });

  it('draws each component on a tile, a pill or no background, and reads an older tile: false as none', () => {
    const { at } = widget(state([
      part('a', 'text', { text: 'Hi', style: undefined }), part('b', 'switch', { style: 'pill' }), part('c', 'value', { style: 'none' }),
      part('d', 'value', { tile: false, style: undefined }), part('e', 'value', { style: undefined }),
    ]));
    expect(['a', 'b', 'c', 'd', 'e'].map(id => [at(id).classList.contains('wb-tile'), at(id).classList.contains('wb-pill')]))
      .toEqual([[false, false], [true, true], [false, false], [false, false], [true, false]]);
  });

  it('shows values as the tiles do, with a Flow value or text over them, and a gone device marked', () => {
    const { at, w } = widget(state([
      part('t', 'value', { slot: 'a:t', name: 'Room' }),
      part('f', 'flowvalue', { name: 'Cost', units: 'kr' }),
      part('g', 'value', { slot: 'gone:t' }),
    ], [value('a:t', 21.25), { deviceId: 'gone', capabilityId: 't', missing: true }]));
    expect(at('t').querySelector('.wb-value')!.textContent).toBe(`${(21.3).toLocaleString()}°C`);
    expect(at('t').querySelector('.wb-name')!.textContent).toBe('Room');
    expect(at('f').querySelector('.wb-value')!.textContent).toBe('–');
    w.pushFlow({ part: 'f', values: { value: 42.5, at: 1 } });
    expect(at('f').querySelector('.wb-value')!.textContent).toBe(`${(42.5).toLocaleString()} kr`);
    expect(at('g').classList.contains('wk-offline')).toBe(true);
  });

  it('says so for a removed design, an empty one and an answer without one', () => {
    const { w, root } = widget({ missing: true });
    expect(root.querySelector('.wb-message')!.textContent).toBe('This design was removed.');
    w.setState(state([]));
    expect(root.querySelector('.wb-message')!.textContent).toBe('This design has no components yet.');
    w.setState({});
    expect(root.querySelector('.wb-message')!.textContent).toBe('Could not load the design.');
  });
});

describe('controls', () => {
  it('a switch sends the other value and shows it at once; a failure puts it back and says so', async () => {
    const onSet = vi.fn(async () => {});
    const { at, root } = widget(state([part('s', 'switch', { slot: 'a:onoff' })], [value('a:onoff', false, { type: 'boolean', units: null })]), { onSet });
    at('s').click();
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({ id: 's' }), true);
    expect(at('s').getAttribute('aria-checked')).toBe('true');
    onSet.mockRejectedValueOnce(Object.assign(new Error('x'), { reason: 'keyScope' }));
    at('s').click();
    await vi.waitFor(() => expect(root.querySelector('.wb-message')!.textContent).toBe('The API key may not do this (Flows or Variables).'));
  });

  it('a stepper sends a burst of taps once, within its range', async () => {
    vi.useFakeTimers();
    const onSet = vi.fn(async () => {});
    const { at } = widget(state([part('st', 'stepper', { slot: 'a:t', step: 0.5, max: 21 })], [value('a:t', 20)]), { onSet });
    const plus = at('st').querySelectorAll('button')[1];
    for (let i = 0; i < 4; i++) plus.click();
    expect(at('st').querySelector('.wb-value')!.textContent).toBe('21°C');
    expect(onSet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(800);
    expect(onSet).toHaveBeenCalledTimes(1);
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'st' }), 21);
  });

  it('a choice lights the current value and sends another', () => {
    const onSet = vi.fn(async () => {});
    const choices = [{ label: 'Auto', value: 'auto' }, { label: 'Heat', value: 'heat' }];
    const { at } = widget(state([part('c', 'choice', { slot: 'a:mode', choices })], [value('a:mode', 'auto', { type: 'enum', units: null })]), { onSet });
    const buttons = [...at('c').querySelectorAll<HTMLElement>('.wb-choice')];
    expect(buttons.map(b => b.classList.contains('on'))).toEqual([true, false]);
    buttons[1].click();
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }), 'heat');
  });

  it("a button calls onButton, and the builder's preview acts on nothing", async () => {
    const onButton = vi.fn(async () => {});
    const onSet = vi.fn(async () => {});
    const s = state([part('b', 'button', { name: 'Ring' }), part('s', 'switch', { slot: 'a:onoff' })], [value('a:onoff', false, { type: 'boolean' })]);
    const live = widget(s, { onButton });
    live.at('b').click();
    expect(onButton).toHaveBeenCalledTimes(1);
    document.body.innerHTML = '';
    const preview = widget(state([part('b', 'button'), part('s', 'switch', { slot: 'a:onoff' })], [value('a:onoff', false, { type: 'boolean' })]), { onButton, onSet, preview: true });
    preview.at('b').click();
    preview.at('s').click();
    expect(onButton).toHaveBeenCalledTimes(1);
    expect(onSet).not.toHaveBeenCalled();
  });
});

describe('mount', () => {
  it('reads its design on a web dashboard, follows its events, and routes each control', async () => {
    vi.useFakeTimers();
    const { frame, root } = frameElements();
    const Homey = fakeFrame({ design: { id: 'd' } }, { instance: 'web-home-w1', api: async (method: string, path: string) => (path.startsWith('/state')
      ? state([part('s', 'switch', { slot: 'a:onoff' }), part('v', 'variable', { variable: 'v1' })], [value('a:onoff', false, { type: 'boolean' })],
        { variables: { v1: { id: 'v1', name: 'V', type: 'boolean', value: false } } })
      : { ok: true }) });
    win.mountCustomWidget(Homey, { root, frame });
    await vi.advanceTimersByTimeAsync(100);
    expect(Homey.api).toHaveBeenCalledWith('GET', expect.stringMatching(/^\/state\?design=d/));
    root.querySelector<HTMLElement>('[data-part="s"]')!.click();
    root.querySelector<HTMLElement>('[data-part="v"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(Homey.api).toHaveBeenCalledWith('POST', '/set', { design: 'd', part: 's', value: true });
    expect(Homey.api).toHaveBeenCalledWith('POST', '/variable', { design: 'd', part: 'v', value: true });
    const reads = () => Homey.api.mock.calls.filter((c: any[]) => String(c[1]).startsWith('/state')).length;
    const before = reads();
    Homey.emit('custom:design', { id: 'other' });
    Homey.emit('custom:design', { id: 'd' });
    await vi.advanceTimersByTimeAsync(0);
    expect(reads()).toBe(before + 1);
  });

  it("says it's for web dashboards on a Homey dashboard, without asking the app", async () => {
    vi.useFakeTimers();
    const { frame, root } = frameElements();
    const Homey = fakeFrame({ design: { id: 'd' } }, { instance: 'w1' });
    win.mountCustomWidget(Homey, { root, frame });
    await vi.advanceTimersByTimeAsync(100);
    expect(Homey.api).not.toHaveBeenCalled();
    expect(root.textContent).toContain('web dashboards');
  });

  it('keeps the README in step with the parts', () => {
    const page = readFileSync('docs/widgets/custom.md', 'utf8');
    for (const name of ['Value', 'Mini chart', 'Gauge', 'Level bar', 'Status', 'Flow value', 'Switch', 'Button', 'Slider', 'Stepper', 'Choice', 'Variable', 'Container', 'Text', 'Icon']) {
      expect(page).toContain(name);
    }
  });
});

describe('calculated values, shapes, times and texts with values', () => {
  const num = (slot: string, v: unknown, o: object = {}, c: object = {}) => ({ ...value(slot, v, c), ...o });

  it("reads formulas with a small parser of its own: the inputs a … l, + - * / % ^, brackets and a few functions", () => {
    const f = (src: string, v: object = {}) => { const fn = win.customFormula(src); return fn ? fn(v) : null; };
    expect(f('(a + b) / 2', { a: 20, b: 23 })).toBe(21.5);
    expect(f('max(a, b) − c', { a: 1, b: 4, c: 1.5 })).toBe(2.5);
    expect(f('round(a / 3; 2)', { a: 10 })).toBe(3.33);
    expect(f('-a ^ 2 + 10 % 4', { a: 3 })).toBe(-7); // −(a²), as written in maths
    expect(f('a × 2 ÷ 4', { a: 6 })).toBe(3);
    expect(f('a + b', { a: 1 })).toBeNaN(); // b isn't known
    for (const bad of ['', 'a +', '(a', 'a b', 'm', 'constructor(a)', 'toString(a)', 'a.b', 'alert(1)', '1,5']) expect([bad, win.customFormula(bad)]).toEqual([bad, null]);
  });

  it('sums, averages, picks the lowest or highest (and names it), subtracts, counts and calculates, leaving out unavailable devices', () => {
    const inputs = [{ slot: 'a:t' }, { slot: 'b:t' }, { slot: 'c:t' }];
    const values = [num('a:t', 20, { name: 'Kitchen' }), num('b:t', 23.5, { name: 'Office' }), num('c:t', 30, { name: 'Attic', offline: true })];
    const shown = (o: object) => {
      const { at } = widget(state([part('x', 'calc', { inputs, name: 'Rooms', ...o })], values));
      return [at('x').querySelector('.wb-value')!.textContent, at('x').querySelector('.wb-name')!.textContent];
    };
    expect(shown({ op: 'sum' })).toEqual(['43.5°C', 'Rooms']);
    expect(shown({ op: 'avg', decimals: 2 })).toEqual(['21.75°C', 'Rooms']);
    expect(shown({ op: 'max', winner: true })).toEqual(['23.5°C', 'Rooms · Office']);
    expect(shown({ op: 'min', winner: true, name: '' })).toEqual(['20°C', 'Kitchen']);
    expect(shown({ op: 'diff', units: 'K' })).toEqual(['-3.5 K', 'Rooms']);
    expect(shown({ op: 'formula', formula: 'a * 2 + c' })[0]).toBe('–'); // c is unavailable
    expect(shown({ op: 'formula', formula: 'a * 2 + b' })[0]).toBe('63.5°C');
    expect(shown({ op: 'count', test: { op: 'above', value: '21' } })[0]).toBe('1');
  });

  it('counts the switches that are on as they change', () => {
    const inputs = [{ slot: 'a:onoff' }, { slot: 'b:onoff' }];
    const values = [num('a:onoff', true, {}, { type: 'boolean', units: null }), num('b:onoff', false, {}, { type: 'boolean', units: null })];
    const { w, at } = widget(state([part('x', 'calc', { inputs, op: 'count', test: { op: 'is', value: 'on' } })], values));
    expect(at('x').querySelector('.wb-value')!.textContent).toBe('1');
    w.pushValue({ deviceId: 'b', capabilityId: 'onoff', value: true });
    expect(at('x').querySelector('.wb-value')!.textContent).toBe('2');
  });

  it("leaves a calculated value that's only a source out on a dashboard, and shows it faint in the builder", () => {
    const s = () => state([part('x', 'calc', { inputs: [{ slot: 'a:t' }], sourceOnly: true })], [num('a:t', 1)]);
    const dash = widget(s());
    expect(dash.at('x').classList.contains('wb-source-only')).toBe(true);
    expect(dash.at('x').classList.contains('wb-hidden')).toBe(true);
    expect(dash.root.classList.contains('wb-preview')).toBe(false);
    const builder = widget(s(), { preview: true });
    expect(builder.at('x').classList.contains('wb-hidden')).toBe(false);
    expect(builder.root.classList.contains('wb-preview')).toBe(true);
  });

  it('colours or hides a shape, a text or a container by rules on other values, a calculated one too', () => {
    const calc = part('sum', 'calc', { inputs: [{ slot: 'a:p' }, { slot: 'b:p' }], op: 'sum' });
    const s = state([
      calc,
      part('s', 'shape', { shape: 'circle', rules: [{ op: 'is', value: 'on', look: 'green', of: { slot: 'a:on' } }, { op: 'is', value: 'off', look: 'hide', of: { slot: 'a:on' } }] }),
      part('box', 'container', { mode: 'grid', parts: [], rules: [{ op: 'above', value: '1000', look: 'red', of: { part: 'sum' } }] }),
      part('v', 'value', { slot: 'a:p', rules: [{ op: 'above', value: '1000', look: 'orange', of: { part: 'sum' } }] }),
    ], [num('a:p', 600, {}, { units: 'W' }), num('b:p', 300, {}, { units: 'W' }), num('a:on', true, {}, { type: 'boolean', units: null })]);
    const { w, at } = widget(s);
    expect(at('s').classList.contains('wb-shape-circle')).toBe(true);
    expect(at('s').dataset.wkColor).toBe('green');
    expect(at('s').querySelector<HTMLElement>('.wb-shape-fill')!.style.background).toBe('var(--wk-c)');
    expect(at('box').classList.contains('wb-colored')).toBe(false);
    w.pushValue({ deviceId: 'b', capabilityId: 'p', value: 500 });
    expect(at('box').classList.contains('wb-colored')).toBe(true);
    expect(at('box').dataset.wkColor).toBe('red');
    expect(at('v').dataset.wkColor).toBe('orange');
    w.pushValue({ deviceId: 'a', capabilityId: 'on', value: false });
    expect(at('s').classList.contains('wb-hidden')).toBe(true);
  });

  it("fills a shape with its own background, else its Style colour, and draws a line's thickness", () => {
    const { at } = widget(state([
      part('g', 'shape', { shape: 'rect', radius: 4, opacity: 50, background: { kind: 'gradient', from: '#112233', to: '#445566', angle: 90 } }),
      part('l', 'shape', { shape: 'line', dir: 'vertical', thickness: 3, color: 'blue', background: { kind: 'none' } }),
    ]));
    const g = at('g').querySelector<HTMLElement>('.wb-shape-fill')!;
    expect(g.style.background).toContain('linear-gradient');
    expect([g.style.borderRadius, g.style.opacity]).toEqual(['4px', '0.5']);
    expect(at('g').classList.contains('wb-tile')).toBe(false);
    const l = at('l');
    expect(l.classList.contains('wb-line-v')).toBe(true);
    expect(l.querySelector<HTMLElement>('.wb-shape-fill')!.style.getPropertyValue('--wb-thick')).toBe('3px');
    expect(l.querySelector<HTMLElement>('.wb-shape-fill')!.style.background).toBe('');
    expect(l.dataset.wkColor).toBe('blue');
  });

  it('fills a text\'s {1} … with its values, the time and calculated ones, – for a missing one; a Flow\'s text replaces it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 21, 14, 5));
    const s = state([
      part('c', 'calc', { inputs: [{ slot: 'a:t' }, { slot: 'b:t' }], op: 'avg', sourceOnly: true }),
      part('x', 'text', { text: 'Inside {1}, average {2} at {3}. {4} {5} {9}', refs: [{ slot: 'a:t' }, { part: 'c' }, { time: 'clock' }, null, { variable: 'v' }] }),
    ], [num('a:t', 21), num('b:t', 23)], { variables: { v: { id: 'v', name: 'Mode', type: 'string', value: 'Away' } } });
    const { w, at } = widget(s);
    expect(at('x').textContent).toBe('Inside 21°C, average 22°C at 14:05. – Away {9}');
    vi.advanceTimersByTime(61e3);
    expect(at('x').textContent).toContain('at 14:06');
    w.pushFlow({ part: 'x', values: { text: 'Gone {1}', at: 1 } });
    expect(at('x').textContent).toBe('Gone {1}');
  });

  it("shows a clock, a date, how long since a value changed and the time until a time of day; its rules compare minutes", () => {
    vi.useFakeTimers();
    const now = new Date(2026, 10, 21, 21, 30).getTime();
    vi.setSystemTime(now);
    const s = state([
      part('clock', 'time', { timeMode: 'clock', seconds: true }),
      part('date', 'time', { timeMode: 'date', dateStyle: 'weekday' }),
      part('since', 'time', { timeMode: 'since', slot: 'a:alarm_motion', rules: [{ op: 'above', value: '30', look: 'orange' }] }),
      part('until', 'time', { timeMode: 'until', until: '23:00', name: 'Bedtime' }),
    ], [num('a:alarm_motion', false, { name: 'Hall', updatedAt: now - 45 * 60e3 }, { type: 'boolean', units: null })], { language: 'en' });
    const { w, at } = widget(s);
    const val = (id: string) => at(id).querySelector('.wb-value')!.textContent;
    expect(val('clock')).toBe('21:30:00');
    expect(val('date')).toBe('Saturday');
    expect(val('since')).toBe('45 min. ago');
    expect(at('since').querySelector('.wb-name')!.textContent).toBe('Hall');
    expect(at('since').dataset.wkColor).toBe('orange');
    expect(val('until')).toBe('in 90 min.');
    vi.advanceTimersByTime(1100);
    expect(val('clock')).toBe('21:30:01');
    w.pushValue({ deviceId: 'a', capabilityId: 'alarm_motion', value: true });
    expect(val('since')).toBe('now');
    expect(at('since').dataset.wkColor).toBeUndefined();
  });
});

describe('widget states, pages, actions, images, rings and repeaters', () => {
  const num = (slot: string, v: unknown, o: object = {}, c: object = {}) => ({ ...value(slot, v, c), ...o });
  const bool = (slot: string, v: boolean, name: string) => num(slot, v, { name }, { type: 'boolean', units: null });
  afterEach(() => { localStorage.clear(); });

  it("keeps a widget state on this screen, and rules, texts and a pages container follow it", () => {
    const s = () => state([
      part('st', 'state', { stateType: 'choice', initial: 'a', choices: [{ label: 'Alpha', value: 'a' }, { label: 'Beta', value: 'b' }] }),
      part('tg', 'state', { stateType: 'toggle', initial: 'false', name: 'Guests' }),
      part('t', 'text', { text: 'Now {1}', refs: [{ part: 'st' }], rules: [{ op: 'is', value: 'on', look: 'hide', of: { part: 'tg' } }] }),
      part('box', 'container', { mode: 'pages', nav: 'state', pageBy: { part: 'st' }, pages: [{ name: 'A' }, { name: 'B' }], parts: [
        part('p0', 'text', { text: 'zero', page: 0 }), part('p1', 'text', { text: 'one', page: 1 }),
      ] }),
    ]);
    const { at, root } = widget(s(), { storeKey: 'd' });
    expect(at('t').textContent).toBe('Now Alpha');
    expect([at('p0').classList.contains('wb-off-page'), at('p1').classList.contains('wb-off-page')]).toEqual([false, true]);
    root.querySelectorAll<HTMLElement>('[data-part="st"] .wb-choice')[1].click();
    expect(at('t').textContent).toBe('Now Beta');
    expect([at('p0').classList.contains('wb-off-page'), at('p1').classList.contains('wb-off-page')]).toEqual([true, false]);
    at('tg').click();
    expect(at('tg').getAttribute('aria-checked')).toBe('true');
    expect(at('t').classList.contains('wb-hidden')).toBe(true);
    expect([localStorage.getItem('widgetkeeper.custom.d.st'), localStorage.getItem('widgetkeeper.custom.d.tg')]).toEqual(['b', 'true']);
    // Another load on this screen starts where it was left.
    const again = widget(s(), { storeKey: 'd' });
    expect(again.at('t').textContent).toBe('Now Beta');
  });

  it('pages with tabs or dots, and shows the page the builder is editing', () => {
    const s = state([part('box', 'container', { mode: 'pages', nav: 'tabs', pages: [{ name: 'One' }, { name: '' }], parts: [
      part('p0', 'text', { text: 'zero', page: 0 }), part('p1', 'text', { text: 'one', page: 1 }),
    ] })]);
    const { w, at } = widget(s);
    const tabs = at('box').querySelectorAll<HTMLElement>('.wb-pagebtn');
    expect([...tabs].map(b => b.textContent)).toEqual(['One', '2']);
    tabs[1].click();
    expect(at('p0').classList.contains('wb-off-page')).toBe(true);
    expect(tabs[1].classList.contains('on')).toBe(true);
    w.showPage('box', 0);
    expect(at('p0').classList.contains('wb-off-page')).toBe(false);
  });

  it("runs a button's actions in order: the app's one at a time, a dashboard and a widget state itself; a confirm asks first", async () => {
    const calls: string[] = [];
    const s = state([
      part('st', 'state', { stateType: 'toggle', initial: 'false' }),
      part('b', 'button', { name: 'Night', press: 'confirm', actions: [
        { do: 'set', slot: 'a:onoff', value: 'off' }, { do: 'flow', flowId: 'flow:f' }, { do: 'dashboard', dashboard: 'home' }, { do: 'state', part: 'st', value: 'toggle' },
      ] }),
    ]);
    const { at } = widget(s, {
      onAction: async (_p: unknown, i: number, a: any) => { calls.push(`${i}:${a.do}`); },
      onOpen: (id: string) => calls.push(`open:${id}`),
    });
    at('b').click();
    expect(at('b').classList.contains('wb-asking')).toBe(true);
    expect(calls).toEqual([]);
    at('b').click();
    await vi.waitFor(() => expect(calls).toEqual(['0:set', '1:flow', 'open:home']));
    expect(at('st').getAttribute('aria-checked')).toBe('true');
  });

  it("stops a button's actions at the first that fails, with the key's reason", async () => {
    const calls: number[] = [];
    const s = state([part('b', 'button', { actions: [{ do: 'flow', flowId: 'flow:a' }, { do: 'flow', flowId: 'flow:b' }] })]);
    const { root } = widget(s, { onAction: async (_p: unknown, i: number) => { calls.push(i); throw Object.assign(new Error('x'), { reason: 'noKey' }); } });
    root.querySelector<HTMLElement>('[data-part="b"]')!.click();
    await vi.waitFor(() => expect(root.querySelector('.wb-message')!.textContent).toBe('For this, add an API key in the app settings.'));
    expect(calls).toEqual([0]);
  });

  it('fills each ring between its range, the first one\'s value in the middle', () => {
    const s = state([part('r', 'ring', { name: 'Room', rings: [{ src: { slot: 'a:t' }, min: 10, max: 30 }, { src: { slot: 'a:h' }, color: 'teal' }] })],
      [num('a:t', 20), num('a:h', 50, {}, { units: '%', decimals: 0 })]);
    const { at } = widget(s);
    const arcs = at('r').querySelectorAll('.wb-ring-fill');
    const frac = (i: number, r: number) => Number(arcs[i].getAttribute('stroke-dasharray')!.split(' ')[0]) / (2 * Math.PI * r);
    expect(frac(0, 44)).toBeCloseTo(0.5, 2);
    expect(frac(1, 32)).toBeCloseTo(0.5, 2);
    expect((arcs[1] as SVGElement).style.stroke).toBe('var(--wk-teal, var(--wk-c))');
    expect(at('r').querySelector('.wb-value')!.textContent).toBe('20°C');
  });

  it("lists a repeater's devices whose value holds its test, counts them for others, and switches one with Tap to switch", async () => {
    const sent: unknown[] = [];
    const s = state([
      part('rp', 'repeat', { capability: 'alarm_contact', test: { op: 'is', value: 'on' }, control: true, text: 'All closed' }),
      part('n', 'text', { text: '{1} open', refs: [{ part: 'rp' }] }),
    ], [bool('a:alarm_contact', true, 'Back door'), bool('b:alarm_contact', false, 'Shed'), bool('c:alarm_contact', true, 'Garage')],
    { repeats: { rp: ['a:alarm_contact', 'b:alarm_contact', 'c:alarm_contact'] } });
    const { w, at } = widget(s, { onSet: async (...args: unknown[]) => { sent.push(args.slice(1)); } });
    const names = () => [...at('rp').querySelectorAll('.wb-rep-name')].map(n => n.textContent);
    expect(names()).toEqual(['Back door', 'Garage']);
    expect(at('n').textContent).toBe('2 open');
    w.pushValue({ deviceId: 'b', capabilityId: 'alarm_contact', value: true });
    expect(names()).toEqual(['Back door', 'Shed', 'Garage']);
    at('rp').querySelector<HTMLElement>('[data-slot="c:alarm_contact"]')!.click();
    await vi.waitFor(() => expect(sent).toEqual([[false, 'c:alarm_contact']]));
    for (const id of ['a', 'b', 'c']) w.pushValue({ deviceId: id, capabilityId: 'alarm_contact', value: false });
    expect(names()).toEqual([]);
    expect(at('rp').querySelector('.wb-rep-empty')!.textContent).toBe('All closed');
  });

  it("shows a picture from the web as it is, and a device's through the app", async () => {
    const { at } = widget(state([
      part('u', 'image', { image: { kind: 'url', url: 'https://x.test/a.jpg' }, fit: 'contain' }),
      part('d', 'image', { image: { kind: 'device', device: 'cam' } }),
      part('n', 'image', {}),
    ]), { onImage: async () => ({ type: 'image/png', data: 'AAAA' }) });
    const img = (id: string) => at(id).querySelector<HTMLImageElement>('.wb-img')!;
    expect([img('u').getAttribute('src'), img('u').style.objectFit]).toEqual(['https://x.test/a.jpg', 'contain']);
    await vi.waitFor(() => expect(img('d').getAttribute('src')).toBe('data:image/png;base64,AAAA'));
    expect(at('n').classList.contains('wb-img-empty')).toBe(true);
  });
});

describe('segmented bars, trends and typing a variable', () => {
  const num = (slot: string, v: unknown, o: object = {}, c: object = {}) => ({ ...value(slot, v, c), ...o });

  it("draws each value's share of their sum, or of a maximum, as a bar or a donut, listed under it", () => {
    const values = [num('a:p', 300, { name: 'Heat pump' }, { units: 'W', decimals: 0 }), num('b:p', 100, { name: 'Oven' }, { units: 'W', decimals: 0 }), num('c:p', -50, { name: 'Solar' }, { units: 'W', decimals: 0 })];
    const segments = [{ src: { slot: 'a:p' }, color: 'orange', label: '' }, { src: { slot: 'b:p' }, color: null, label: 'Cooking' }, { src: { slot: 'c:p' }, color: null, label: '' }];
    const { w, at } = widget(state([
      part('bar', 'segments', { name: 'Power', segments, rules: [{ op: 'above', value: '500', look: 'red' }] }),
      part('max', 'segments', { segments, scale: 'max', max: 800, barStyle: 'donut', legend: false }),
    ], values));
    const widths = [...at('bar').querySelectorAll<HTMLElement>('.wb-seg')].map(x => x.style.width);
    expect(widths).toEqual(['75%', '25%']); // a value below 0 counts as nothing
    expect(at('bar').querySelector('.wb-value')!.textContent).toBe('400 W');
    expect([...at('bar').querySelectorAll('.wb-seg-label')].map(x => x.textContent)).toEqual(['Heat pump', 'Cooking', 'Solar']);
    expect(at('bar').querySelector<HTMLElement>('.wb-seg')!.style.background).toBe('var(--wk-orange, var(--wk-c))');
    const arcs = at('max').querySelectorAll('.wb-seg-arc');
    const len = 2 * Math.PI * 38;
    expect(Number(arcs[0].getAttribute('stroke-dasharray')!.split(' ')[0]) / len).toBeCloseTo(300 / 800, 3);
    expect(Number(arcs[1].getAttribute('stroke-dashoffset')) / len).toBeCloseTo(-300 / 800, 3);
    expect(at('max').querySelector('.wb-seg-legend')).toBeNull();
    w.pushValue({ deviceId: 'b', capabilityId: 'p', value: 300 });
    expect(at('bar').dataset.wkColor).toBe('red');
  });

  it('shows the change since its period began, steady within its margin, or as a percentage; its rules check the change', () => {
    const hist = { '1h\na:t': [[1, 20], [2, 20.5]], '6h\na:t': [[1, 25], [2, 22]] };
    const s = state([
      part('up', 'trend', { slot: 'a:t', span: '1h', name: 'Inside', rules: [{ op: 'above', value: '1', look: 'red' }] }),
      part('down', 'trend', { slot: 'a:t', span: '6h', percent: true }),
      part('flat', 'trend', { slot: 'a:t', span: '1h', flat: 2 }),
      part('none', 'trend', { slot: 'a:t', span: '24h' }),
    ], [num('a:t', 21.5)], { histories: hist });
    const { w, at } = widget(s);
    const val = (id: string) => at(id).querySelector('.wb-value')!.textContent;
    expect([val('up'), at('up').dataset.trend, at('up').querySelector('.wb-sub')!.textContent]).toEqual(['+1.5°C', 'up', '21.5°C']);
    expect(at('up').dataset.wkColor).toBe('red');
    expect([val('down'), at('down').dataset.trend]).toEqual(['−14%', 'down']);
    expect(at('flat').dataset.trend).toBe('flat');
    expect(val('none')).toBe('–');
    w.pushValue({ deviceId: 'a', capabilityId: 't', value: 20 });
    expect([val('up'), at('up').dataset.trend]).toEqual(['0°C', 'flat']);
  });

  it('types a text or number variable in its tile: Enter sets it, Escape leaves it, a number that is not one shakes', async () => {
    const sent: unknown[] = [];
    const s = state([part('n', 'variable', { variable: 'v1' }), part('x', 'variable', { variable: 'v2' })], [], {
      variables: { v1: { id: 'v1', name: 'Guests', type: 'number', value: 4 }, v2: { id: 'v2', name: 'Note', type: 'string', value: 'hi' } },
    });
    const { at } = widget(s, { onSet: async (_p: unknown, v: unknown) => { sent.push(v); } });
    const type = (id: string, text: string, key: string) => {
      at(id).click();
      const input = at(id).querySelector<HTMLInputElement>('.wb-input')!;
      expect(input).toBeTruthy();
      input.value = text;
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    };
    type('n', '5,5', 'Enter');
    await vi.waitFor(() => expect(sent).toEqual([5.5]));
    expect(at('n').querySelector('.wb-input')).toBeNull();
    type('x', 'changed', 'Escape');
    type('n', 'lots', 'Enter');
    type('x', 'bye', 'Enter');
    await vi.waitFor(() => expect(sent).toEqual([5.5, 'bye']));
    expect(at('x').querySelector('.wb-value')!.textContent).toBe('bye');
  });
});

describe('parts turned off, taps on any component, icons from values and rules, big text', () => {
  const bool = (slot: string, v: boolean, c: object = {}) => ({ ...value(slot, v, { type: 'boolean', units: null, ...c }), name: 'Front door' });

  it('turns off the parts a design hides', () => {
    const { at } = widget(state([part('lv', 'level', { slot: 'a:t', hide: ['name', 'value'] })], [value('a:t', 50)]));
    expect([at('lv').classList.contains('wb-no-name'), at('lv').classList.contains('wb-no-value'), at('lv').classList.contains('wb-no-icon')]).toEqual([true, true, false]);
  });

  it("runs a tapped component's actions, but a control inside a tappable container is the control's", async () => {
    const calls: string[] = [];
    const sets: unknown[] = [];
    const s = state([
      part('sh', 'shape', { actions: [{ do: 'flow', flowId: 'flow:a' }] }),
      part('box', 'container', { mode: 'grid', actions: [{ do: 'flow', flowId: 'flow:b' }], parts: [part('sw', 'switch', { slot: 'a:onoff', at: { x: 0, y: 0, w: 6, h: 8 } })] }),
    ], [bool('a:onoff', false)]);
    const { at } = widget(s, { onAction: async (p: any, _i: number, a: any) => { calls.push(`${p.id}:${a.flowId}`); }, onSet: async (_p: unknown, v: unknown) => { sets.push(v); } });
    expect(at('sh').getAttribute('role')).toBe('button');
    at('sh').click();
    await vi.waitFor(() => expect(calls).toEqual(['sh:flow:a']));
    at('sw').click();
    await vi.waitFor(() => expect(sets).toEqual([true]));
    expect(calls).toEqual(['sh:flow:a']);
    at('box').click();
    await vi.waitFor(() => expect(calls).toEqual(['sh:flow:a', 'box:flow:b']));
  });

  it("draws an icon that follows a value with the value's glyph, and a rule's icon while it holds, under a Flow's", () => {
    const s = state([
      part('ic', 'icon', { slot: 'a:locked', icon: null }),
      part('v', 'value', { slot: 'a:locked', icon: 'lock', rules: [{ op: 'is', value: 'off', look: 'same', icon: 'unlock' }] }),
    ], [bool('a:locked', true)]);
    const { w, at } = widget(s);
    expect(at('ic').querySelector('.wb-icon')!.classList.contains('wb-glyph')).toBe(true);
    const lockSvg = at('v').querySelector('.wb-icon')!.innerHTML;
    w.pushValue({ deviceId: 'a', capabilityId: 'locked', value: false });
    expect(at('v').querySelector('.wb-icon')!.innerHTML).not.toBe(lockSvg);
    expect(at('v').classList.contains('wb-colored')).toBe(false); // `same` keeps the colour
    w.pushFlow({ part: 'v', values: { icon: 'lock', at: 1 } });
    expect(at('v').querySelector('.wb-icon')!.innerHTML).toBe(lockSvg);
  });

  it('draws a big, bold text', () => {
    const { at } = widget(state([part('t', 'text', { text: '21°', size: 'display', weight: 'bold' })]));
    expect([at('t').classList.contains('wb-size-display'), at('t').classList.contains('wb-weight-bold')]).toEqual([true, true]);
  });
});
