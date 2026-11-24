// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeFrame, frameElements } from './helpers/fakeFrame.js';
import { loadMount, loadWidget } from './helpers/loadWidget.js';
import { PART_KINDS, RULE_OPS, ruleHolds } from '../lib/customDesigns.js';

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
        for (const to of op === 'between' ? ['', '26', '-5', 'x'] : [undefined]) {
          for (const v of values) expect([op, rv, to, v, win.customRuleHolds({ op, value: rv, to }, v)]).toEqual([op, rv, to, v, ruleHolds({ op, value: rv, to, look: 'red' }, v)]);
        }
      }
    }
  });

  it('tint a part by the first that holds, or hide it; a Flow wins over both', () => {
    const rules = [{ op: 'above', value: '25', look: 'red' }, { op: 'below', value: '10', look: 'hide' }];
    const s = state([part('t', 'bar', { src: { slot: 'a:t' }, rules })], [value('a:t', 27)]);
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
      part('a', 'text', { text: 'Hi', style: undefined }), part('b', 'switch', { style: 'pill' }), part('c', 'switch', { style: 'none' }),
      part('d', 'switch', { tile: false, style: undefined }), part('e', 'switch', { style: undefined }),
    ]));
    expect(['a', 'b', 'c', 'd', 'e'].map(id => [at(id).classList.contains('wb-tile'), at(id).classList.contains('wb-pill')]))
      .toEqual([[false, false], [true, true], [false, false], [false, false], [true, false]]);
  });

  it("shows a value and its device's name in texts, a Flow's value or text over them, and a gone device marked", () => {
    const { at, w } = widget(state([
      part('t', 'text', { text: '{1} in {2}', refs: [{ slot: 'a:t' }, { slot: 'a:t', show: 'name' }] }),
      part('f', 'text', { text: '–', units: 'kr' }),
      part('g', 'bar', { src: { slot: 'gone:t' } }),
    ], [value('a:t', 21.25), { deviceId: 'gone', capabilityId: 't', missing: true }]));
    expect(at('t').textContent).toBe(`${(21.3).toLocaleString()}°C in Sensor`);
    expect(at('f').textContent).toBe('–');
    w.pushFlow({ part: 'f', values: { value: 42.5, at: 1 } });
    expect(at('f').textContent).toBe(`${(42.5).toLocaleString()} kr`);
    w.pushFlow({ part: 'f', values: { text: 'Paid', at: 1 } });
    expect(at('f').textContent).toBe('Paid');
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

  it("leaves an empty design's message out of the builder's preview", () => {
    const { root } = widget(state([]), { preview: true });
    expect((root.querySelector('.wb-message') as HTMLElement).hidden).toBe(true);
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
    const buttons = [...at('c').querySelectorAll<HTMLElement>('.wb-preset')];
    expect(buttons.map(b => b.classList.contains('active'))).toEqual([true, false]);
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
    // The widget's device goes along, for a design that works with any device.
    expect(Homey.api).toHaveBeenCalledWith('GET', expect.stringMatching(/^\/state\?design=d&device=d1&/));
    expect(Homey.api).toHaveBeenCalledWith('POST', '/set', { design: 'd', part: 's', value: true, device: 'd1' });
    expect(Homey.api).toHaveBeenCalledWith('POST', '/variable', { design: 'd', part: 'v', value: true, device: 'd1' });
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
    // Every kind, by its English name, and every ready-made tile.
    const en = JSON.parse(readFileSync('locales/en.json', 'utf8'));
    expect(Object.keys(en.custom.kinds).sort()).toEqual([...PART_KINDS].sort());
    for (const name of Object.values<string>(en.custom.kinds)) expect([name, page.includes(name)]).toEqual([name, true]);
    for (const [key, name] of Object.entries<string>(en.web)) if (key.startsWith('builderReady_')) expect([name, page.includes(name)]).toEqual([name, true]);
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
    // Read through a text: `{1}` its value, `{2}` its name (the lowest's or highest's input).
    const shown = (o: object) => {
      const { at } = widget(state([part('x', 'calc', { inputs, name: 'Rooms', ...o }), part('t', 'text', { text: '{1}|{2}', refs: [{ part: 'x' }, { part: 'x', show: 'name' }] })], values));
      return at('t').textContent!.split('|');
    };
    expect(shown({ op: 'sum' })[0]).toBe('43.5°C');
    expect(shown({ op: 'avg', decimals: 2 })[0]).toBe('21.75°C');
    expect(shown({ op: 'max' })).toEqual(['23.5°C', 'Office']);
    expect(shown({ op: 'min' })).toEqual(['20°C', 'Kitchen']);
    expect(shown({ op: 'diff', units: 'K' })[0]).toBe('-3.5 K');
    expect(shown({ op: 'formula', formula: 'a * 2 + c' })[0]).toBe('–'); // c is unavailable
    expect(shown({ op: 'formula', formula: 'a * 2 + b' })[0]).toBe('63.5°C');
    expect(shown({ op: 'count', test: { op: 'above', value: '21' } })[0]).toBe('1');
  });

  it('counts the switches that are on as they change', () => {
    const inputs = [{ slot: 'a:onoff' }, { slot: 'b:onoff' }];
    const values = [num('a:onoff', true, {}, { type: 'boolean', units: null }), num('b:onoff', false, {}, { type: 'boolean', units: null })];
    const { w, at } = widget(state([part('x', 'calc', { inputs, op: 'count', test: { op: 'is', value: 'on' } }), part('t', 'text', { text: '{1} on', refs: [{ part: 'x' }] })], values));
    expect(at('t').textContent).toBe('1 on');
    w.pushValue({ deviceId: 'b', capabilityId: 'onoff', value: true });
    expect(at('t').textContent).toBe('2 on');
  });

  it('leaves a calculated value out on a dashboard (it only feeds others), and shows it faint in the builder', () => {
    const s = () => state([part('x', 'calc', { inputs: [{ slot: 'a:t' }] })], [num('a:t', 1)]);
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
      part('v', 'bar', { src: { slot: 'a:p' }, rules: [{ op: 'above', value: '1000', look: 'orange', of: { part: 'sum' } }] }),
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

  it('puts the time (with seconds), the weekday, how long since a value changed and the time until a time of day in a text; minutes since a change is a value for rules', () => {
    vi.useFakeTimers();
    const now = new Date(2026, 10, 21, 21, 30).getTime();
    vi.setSystemTime(now);
    const s = state([
      part('t', 'text', { text: '{1}|{2}|{3}|{4}', refs: [{ time: 'seconds' }, { time: 'weekday' }, { since: 'a:alarm_motion' }, { until: '23:00' }] }),
      part('m', 'calc', { op: 'since', inputs: [{ slot: 'a:alarm_motion' }] }),
      part('dot', 'shape', { rules: [{ op: 'above', value: '30', look: 'orange', of: { part: 'm' } }] }),
    ], [num('a:alarm_motion', false, { name: 'Hall', updatedAt: now - 45 * 60e3 }, { type: 'boolean', units: null })], { language: 'en' });
    const { w, at } = widget(s);
    const parts = () => at('t').textContent!.split('|');
    expect(parts()).toEqual(['21:30:00', 'Saturday', '45 min. ago', 'in 90 min.']);
    expect(at('dot').dataset.wkColor).toBe('orange');
    vi.advanceTimersByTime(1100);
    expect(parts()[0]).toBe('21:30:01');
    w.pushValue({ deviceId: 'a', capabilityId: 'alarm_motion', value: true });
    expect(parts()[2]).toBe('now');
    expect(at('dot').dataset.wkColor).toBeUndefined();
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
    root.querySelectorAll<HTMLElement>('[data-part="st"] .wb-preset')[1].click();
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
    // Flow Buttons' Tap again: tinted red, its name saying so.
    expect(at('b').classList.contains('confirm')).toBe(true);
    expect(at('b').querySelector('.wb-name')!.textContent).toBe('Tap again');
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

  it("calculates a value's change over its history (Trend's), or as a percentage; an icon's rules swap its arrow", () => {
    const hist = { '1h\na:t': [[1, 20], [2, 20.5]], '6h\na:t': [[1, 25], [2, 22]] };
    const s = state([
      part('up', 'calc', { op: 'change', inputs: [{ slot: 'a:t' }], span: '1h' }),
      part('down', 'calc', { op: 'change', inputs: [{ slot: 'a:t' }], span: '6h', percent: true }),
      part('none', 'calc', { op: 'change', inputs: [{ slot: 'a:t' }], span: '24h' }),
      part('t', 'text', { text: '{1}|{2}|{3}', refs: [{ part: 'up' }, { part: 'down' }, { part: 'none' }] }),
      part('arrow', 'icon', { icon: 'moon', rules: [{ op: 'above', value: '0', look: 'same', icon: 'sun', of: { part: 'up' } }] }),
    ], [num('a:t', 21.5)], { histories: hist });
    const { w, at } = widget(s);
    expect(at('t').textContent).toBe('+1.5°C|-14%|–');
    const up = at('arrow').querySelector('.wb-icon')!.innerHTML;
    w.pushValue({ deviceId: 'a', capabilityId: 't', value: 20 });
    expect(at('t').textContent!.split('|')[0]).toBe('0°C');
    expect(at('arrow').querySelector('.wb-icon')!.innerHTML).not.toBe(up);
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
    const { at } = widget(state([part('lv', 'ring', { rings: [{ src: { slot: 'a:t' } }], hide: ['name', 'value'] })], [value('a:t', 50)]));
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
      part('v', 'switch', { slot: 'a:locked', icon: 'lock', rules: [{ op: 'is', value: 'off', look: 'same', icon: 'unlock' }] }),
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

describe('the bare data primitives', () => {
  it('draws a sparkline of a history, an arc and a bar of a value within their range, and a slider with nothing but its bar', () => {
    const s = state([
      part('sp', 'sparkline', { slot: 'a:t', span: '24h' }),
      part('ar', 'arc', { src: { slot: 'a:t' }, min: 0, max: 40, thickness: 12 }),
      part('br', 'bar', { src: { slot: 'a:t' }, min: 10, max: 30, thickness: 6 }),
      part('sl', 'slider', { slot: 'a:dim', name: 'Ceiling' }),
    ], [value('a:t', 20), value('a:dim', 0.25, { units: '%', min: 0, max: 1 })], { histories: { '24h\na:t': [[1, 18], [2, 22], [3, 20]] } });
    const { at } = widget(s);
    expect(at('sp').querySelector('.wb-spark-line')!.getAttribute('d')).toMatch(/^M0\.00,/);
    expect([at('sp').classList.contains('wb-tile'), at('ar').classList.contains('wb-tile')]).toEqual([false, false]);
    expect(at('ar').querySelector('.wb-arc-fill')).toBeTruthy();
    expect(at('ar').querySelector<SVGElement>('.wb-arc-fill')!.style.strokeWidth).toBe('12px');
    expect(at('br').querySelector<HTMLElement>('.wb-level i')!.style.width).toBe('50%');
    expect(at('br').querySelector<HTMLElement>('.wb-level')!.style.height).toBe('6px');
    expect(at('sl').style.getPropertyValue('--wb-x')).toBe('0.25');
    expect([at('sl').querySelector('.wb-track .wb-fill'), at('sl').querySelector('.wb-knob')].every(Boolean)).toBe(true);
    expect([at('sl').querySelector('.wb-name'), at('sl').querySelector('.wb-icon'), at('sl').getAttribute('aria-label')]).toEqual([null, null, 'Ceiling']);
  });
});

describe('the settings closing the review\'s gaps (2026-11-22)', () => {
  it("colours a text in its own colour, and a rule's tint as before", () => {
    const { at } = widget(state([
      part('a', 'text', { text: 'Hi', color: 'red', style: 'none' }),
      part('b', 'text', { text: 'Hi', style: 'none', rules: [{ op: 'is', value: 'on', look: 'blue', of: { slot: 'a:onoff' } }] }),
    ], [value('a:onoff', true, { type: 'boolean', units: null })]));
    expect([at('a').classList.contains('wb-has-color'), at('a').classList.contains('wb-colored'), at('a').dataset.wkColor]).toEqual([true, false, 'red']);
    expect(at('b').classList.contains('wb-colored')).toBe(true);
    const css = readFileSync('widgets/custom/public/widget.css', 'utf8');
    expect(css).toContain('.wb-k-text.wb-has-color:not(.wb-colored) .wb-text { color: var(--wk-c); }');
  });

  it('switches a switch with Tap twice only on the second tap', async () => {
    const onSet = vi.fn(async () => {});
    const { at } = widget(state([part('s', 'switch', { slot: 'a:onoff', press: 'confirm' })], [value('a:onoff', false, { type: 'boolean', units: null })]), { onSet });
    at('s').click();
    expect(onSet).not.toHaveBeenCalled();
    expect(at('s').querySelector('.wb-name')!.textContent).toBe('Tap again');
    expect(at('s').classList.contains('confirm')).toBe(true);
    at('s').click();
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({ id: 's' }), true);
  });

  it("shows a number variable with its own decimals and unit, a slider on one, and keeps a typed number in the range", async () => {
    const sent: unknown[] = [];
    const s = state([
      part('v', 'variable', { variable: 'v1', decimals: 0, units: 'kWh', max: 10 }),
      part('sl', 'slider', { variable: 'v1', min: 0, max: 20 }),
    ], [], { variables: { v1: { id: 'v1', name: 'Use', type: 'number', value: 4.4 } } });
    const { at } = widget(s, { onSet: async (_p: unknown, v: unknown) => { sent.push(v); } });
    expect(at('v').querySelector('.wb-value')!.textContent).toBe('4 kWh');
    expect(Number.parseFloat(at('sl').style.getPropertyValue('--wb-x')) * 100).toBeCloseTo(22);
    at('v').querySelector<HTMLElement>('.wb-value')!.click();
    const input = at('v').querySelector<HTMLInputElement>('.wb-input')!;
    input.value = '50';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(sent).toEqual([10]));
  });

  it('fills a vertical bar from the bottom, grows an icon to its box, and draws a sparkline within its own range', () => {
    const s = state([
      part('b', 'bar', { src: { slot: 'a:t' }, min: 0, max: 40, dir: 'vertical', thickness: 10 }),
      part('i', 'icon', { icon: 'star', grow: true }),
      part('sp', 'sparkline', { slot: 'a:t', span: '24h', min: 0, max: 40 }),
    ], [value('a:t', 20)], { histories: { '24h\na:t': [[1, 20], [2, 20]] } });
    const { at } = widget(s);
    const bar = at('b').querySelector<HTMLElement>('.wb-level')!;
    expect([bar.classList.contains('wb-level-v'), bar.style.width, bar.querySelector('i')!.style.height]).toEqual([true, '10px', '50%']);
    expect(at('i').classList.contains('wb-icon-grow')).toBe(true);
    // A flat 20 between 0 and 40 sits in the middle (y 22 of 40), not at an edge.
    expect(at('sp').querySelector('.wb-spark-line')!.getAttribute('d')).toBe('M0.00,22.00 L100.00,22.00');
  });

  it('reads a web picture again past the cache when it refreshes', () => {
    vi.useFakeTimers();
    const { at } = widget(state([part('u', 'image', { image: { kind: 'url', url: 'https://x.test/a.jpg?s=1' }, refresh: 1 })]));
    const img = at('u').querySelector<HTMLImageElement>('.wb-img')!;
    expect(img.getAttribute('src')).toBe('https://x.test/a.jpg?s=1');
    vi.advanceTimersByTime(60e3);
    expect(img.getAttribute('src')).toMatch(/^https:\/\/x\.test\/a\.jpg\?s=1&wk=\d+$/);
  });

  it('orders a repeater by value and shows at most its limit', () => {
    const bat = (slot: string, v: unknown, name: string) => ({ ...value(slot, v, { units: '%', decimals: 0 }), name });
    const s = state([part('rp', 'repeat', { capability: 'measure_battery', sort: 'up', limit: 2, test: { op: 'between', value: '0', to: '50' } })],
      [bat('a:measure_battery', 40, 'Hall'), bat('b:measure_battery', 9, 'Door'), bat('c:measure_battery', 80, 'Roof'), bat('d:measure_battery', 25, 'Shed')],
      { repeats: { rp: ['a:measure_battery', 'b:measure_battery', 'c:measure_battery', 'd:measure_battery'] } });
    const { at } = widget(s);
    expect([...at('rp').querySelectorAll('.wb-rep-name')].map(n => n.textContent)).toEqual(['Door', 'Shed']);
  });

  it("shows a text's value with its own decimals, with or without its unit", () => {
    const { at } = widget(state([part('t', 'text', { text: '{1} | {2}', refs: [{ slot: 'a:t', decimals: 0 }, { slot: 'a:t', decimals: 2, plain: true }] })], [value('a:t', 21.456)]));
    expect(at('t').textContent).toBe('21°C | 21.46');
  });
});

describe('styles, colours, width, charts and Repeaters (2026-11-24)', () => {
  it("takes away the empty design's note once the design has components", () => {
    const { w, root } = widget(state([]));
    const note = root.querySelector<HTMLElement>('.wb-message')!;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain('no components');
    w.setState({ ...state([part('t', 'text', { text: 'Hi' })]), design: { id: 'd', name: 'D', updatedAt: 2, parts: [part('t', 'text', { text: 'Hi' })] } });
    expect(note.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('.wb-grid')!.hidden).toBe(false);
  });

  it("draws a container's style and background (a palette colour as Muted or Vivid's) and a text colour", () => {
    const { at } = widget(state([
      part('tile', 'container', { style: 'tile', mode: 'grid', background: { kind: 'none' }, parts: [] }),
      part('pill', 'container', { style: 'pill', mode: 'grid', background: { kind: 'color', from: 'teal' }, parts: [] }),
      part('bare', 'container', { style: 'none', mode: 'grid', background: { kind: 'gradient', from: 'blue', to: '#102030', angle: 90 }, parts: [] }),
      part('old', 'container', { mode: 'grid', background: { kind: 'color', from: '#112233' }, parts: [] }),
      part('ink', 'text', { text: 'Hi', textColor: 'red' }),
      part('own', 'switch', { slot: 'a:onoff', textColor: '#123456' }),
    ], [value('a:onoff', true, { type: 'boolean' })]));
    expect(at('tile').classList.contains('wb-tile')).toBe(true);
    expect(at('pill').className).toMatch(/wb-tile.*wb-pill|wb-pill.*wb-tile/);
    expect(at('pill').style.getPropertyValue('--wb-from')).toBe('var(--wk-teal)');
    expect(at('pill').classList.contains('wb-box-bg')).toBe(true);
    expect(at('bare').classList.contains('wb-bare')).toBe(true);
    expect([at('bare').style.getPropertyValue('--wb-from'), at('bare').style.getPropertyValue('--wb-to')]).toEqual(['var(--wk-blue)', '#102030']);
    // A container from before styles: none where it had a background.
    expect(at('old').classList.contains('wb-bare')).toBe(true);
    expect(at('ink').classList.contains('wb-has-ink')).toBe(true);
    expect(at('ink').style.getPropertyValue('--wb-ink')).toBe('var(--wk-red)');
    expect(at('own').style.getPropertyValue('--wb-ink')).toBe('#123456');
  });

  it('gives a design made for more columns four grid columns per column', () => {
    const { root } = widget({ ...state([part('t', 'text')]), design: { id: 'd', name: 'D', updatedAt: 1, span: 2, parts: [part('t', 'text')] } });
    expect(root.querySelector<HTMLElement>('.wb-grid')!.style.getPropertyValue('--wb-cols')).toBe('8');
  });

  it('draws a chart of its series as lines or bars, with its scale, times and a legend for more than one', () => {
    const now = Date.now();
    const pts = (f: (i: number) => number) => Array.from({ length: 13 }, (_, i) => [now - (12 - i) * 3600e3, f(i)]);
    const histories = { '24h\na:t': pts(i => 20 + i / 4), '24h\nb:t': pts(i => 18 - i / 6) };
    const s = state([part('c', 'chart', { series: [{ slot: 'a:t', color: 'red' }, { slot: 'b:t', color: null }], span: '24h', chartStyle: 'line', axis: true, at: { x: 0, y: 0, w: 4, h: 2 } })],
      [{ ...value('a:t', 23), name: 'Living' }, { ...value('b:t', 16), name: 'Bedroom' }], { histories });
    const { at } = widget(s);
    const c = at('c');
    expect(c.querySelectorAll('.wb-chart-line')).toHaveLength(2);
    // Charts' colours: the bright set; each series' chip.
    expect((c.querySelector('.wb-chart-line') as SVGElement).style.getPropertyValue('--wb-series')).toBe('var(--wk-red-bright)');
    expect([...c.querySelectorAll('.wb-chart-chip')].map(k => k.textContent)).toEqual(['Living', 'Bedroom']);
    expect([...c.querySelectorAll('.wb-chart-y span')].map(x => x.textContent)).toEqual(['23°C', '16°C']);
    expect(c.querySelectorAll('.wb-chart-x span')).toHaveLength(2);
    const bars = widget(state([part('b', 'chart', { series: [{ slot: 'a:t', color: null }], span: '24h', chartStyle: 'bars', axis: false })], [value('a:t', 23)], { histories }));
    expect(bars.at('b').querySelectorAll('.wb-chart-bar').length).toBeGreaterThan(10);
    expect(bars.at('b').classList.contains('wb-chart-axis')).toBe(false);
  });

  it("repeats a ready-made component once per device, each with that device's values, its requests naming the copy and device", async () => {
    const ready = part('box', 'container', { mode: 'free', style: 'tile', at: { x: 0, y: 0, w: 2, h: 1 }, parts: [
      part('sw', 'switch', { slot: '@:onoff', at: { x: 0, y: 0, w: 50, h: 100 } }),
      part('n', 'text', { text: '{1}', refs: [{ slot: '@:onoff', show: 'name' }], at: { x: 50, y: 0, w: 50, h: 100 } }),
    ] });
    const onSet = vi.fn(async () => {});
    const { root } = widget(state([part('e', 'each', { ready: 'r', columns: 2, at: { x: 0, y: 0, w: 4, h: 2 } })],
      [{ ...value('l1:onoff', true, { type: 'boolean' }), name: 'Lamp one' }, { ...value('l2:onoff', false, { type: 'boolean' }), name: 'Lamp two' }],
      { each: { e: { part: ready, devices: ['l1', 'l2'] } } }), { onSet });
    const copies = root.querySelectorAll('.wb-each-item');
    expect(copies).toHaveLength(2);
    // The switch's name and the text, both the copy's device's.
    expect([...copies].map(c => c.textContent)).toEqual(['Lamp oneLamp one', 'Lamp twoLamp two']);
    expect(root.querySelector('[data-part="e/sw"]')!.getAttribute('aria-checked')).toBe('true');
    expect([...root.querySelectorAll('[data-part="e/sw"]')][1].getAttribute('aria-checked')).toBe('false');
    ([...root.querySelectorAll<HTMLElement>('[data-part="e/sw"]')][1]).click();
    await Promise.resolve();
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'e/sw', slot: 'l2:onoff', device: 'l2' }), true);
    // Without a ready-made it says so.
    const none = widget(state([part('e', 'each', { at: { x: 0, y: 0, w: 4, h: 1 } })], [], { each: { e: { part: null, devices: [] } } }));
    expect(none.root.textContent).toContain('ready-made');
  });
});

describe("the normal widgets' looks and options (2026-11-24, the user's review of the styles and options)", () => {
  it("draws a button as Flow Buttons' round button and name, only the button where it's narrow", () => {
    const { at } = widget(state([part('b', 'button', { name: 'Night', color: 'green' }), part('n', 'button', { name: 'Go', at: { x: 0, y: 1, w: 1, h: 1 } })]));
    expect([!!at('b').querySelector('.wb-fbtn .wb-icon svg'), at('b').querySelector('.wb-name')!.textContent]).toEqual([true, 'Night']);
    expect([at('n').classList.contains('wb-narrow'), at('n').title]).toEqual([true, 'Go']);
  });

  it("holds a long press's fill and says Hold on a tap, as Quick Actions", async () => {
    vi.useFakeTimers();
    const onSet = vi.fn(async () => {});
    const { at } = widget(state([part('s', 'switch', { slot: 'a:onoff', press: 'long', name: 'Garage' })], [value('a:onoff', false, { type: 'boolean', units: null })]), { onSet });
    at('s').click();
    expect(at('s').querySelector('.wb-name')!.textContent).toBe('Hold');
    await vi.advanceTimersByTimeAsync(1600);
    expect(at('s').querySelector('.wb-name')!.textContent).toBe('Garage');
    expect(onSet).not.toHaveBeenCalled();
  });

  it("lights a switch as a lighter tile, and steps a number variable with − and + within its range, as Variables", async () => {
    vi.useFakeTimers();
    const sent: unknown[] = [];
    const s = state([
      part('sw', 'switch', { slot: 'a:onoff', active: 'lighter' }),
      part('v', 'variable', { variable: 'v1', step: 5, max: 20, at: { x: 0, y: 1, w: 4, h: 1 } }),
    ], [value('a:onoff', true, { type: 'boolean', units: null })], { variables: { v1: { id: 'v1', name: 'Use', type: 'number', value: 10 } } });
    const { at } = widget(s, { onSet: async (_p: unknown, v: unknown) => { sent.push(v); } });
    expect([at('sw').classList.contains('wb-lighter'), at('sw').classList.contains('wb-on')]).toEqual([true, true]);
    expect(at('v').classList.contains('wb-row-layout')).toBe(true);
    const [minus, plus] = [...at('v').querySelectorAll<HTMLElement>('.wb-step')];
    expect([minus.hidden, plus.hidden]).toEqual([false, false]);
    plus.click();
    plus.click();
    expect(at('v').querySelector('.wb-value')!.textContent).toBe('20');
    expect(plus.classList.contains('at-limit')).toBe(true);
    await vi.advanceTimersByTimeAsync(800);
    expect(sent).toEqual([20]);
  });

  it("shows a read-only variable's yes/no as a dot and Yes, and does nothing on a tap", () => {
    const onSet = vi.fn(async () => {});
    const s = state([part('v', 'variable', { variable: 'v1', readOnly: true })], [], { variables: { v1: { id: 'v1', name: 'Away', type: 'boolean', value: true } } });
    const { at } = widget(s, { onSet });
    expect([at('v').querySelector<HTMLElement>('.wb-dot')!.hidden, at('v').querySelector<HTMLElement>('.wb-toggle')!.hidden, at('v').querySelector('.wb-value')!.textContent]).toEqual([false, true, 'Yes']);
    at('v').click();
    expect(onSet).not.toHaveBeenCalled();
  });

  it("draws Notes' sizes (the old ones as the nearest), a Big value's units apart, a Post-it and long text", () => {
    const { at } = widget(state([
      part('a', 'text', { text: 'x', size: 'heading' }),
      part('b', 'text', { text: '{1}', refs: [{ slot: 'a:t' }], size: 'display' }),
      part('c', 'text', { text: 'Milk', style: 'postit', color: 'pink' }),
      part('d', 'text', { text: 'A long line', overflow: 'scroll', muted: true }),
    ], [value('a:t', 21.5)]));
    expect(at('a').classList.contains('wb-size-default')).toBe(true);
    expect([at('b').querySelector('.wb-text')!.firstChild!.textContent, at('b').querySelector('.wb-unit')!.textContent]).toEqual(['21.5', '°C']);
    expect([at('c').classList.contains('wb-postit'), !!at('c').querySelector('.wb-note .wb-paper .wb-text'), at('c').dataset.wkColor]).toEqual([true, true, 'pink']);
    expect([at('d').classList.contains('wb-over-scroll'), at('d').classList.contains('wb-muted')]).toEqual([true, true]);
  });

  it("draws an arc's and a bar's Chart · Gauge zones, the value in its level's colour, and the span's range", () => {
    const s = state([
      part('a', 'arc', { src: { slot: 'm:p' }, min: 0, max: 100, zones: 'rising', yellowAt: 50, redAt: 80, rangeSpan: '1d!' }),
      part('b', 'bar', { src: { slot: 'm:p' }, min: 0, max: 100, zones: 'falling', yellowAt: 40, redAt: 20, rangeSpan: '1d!' }),
    ], [value('m:p', 90, { units: 'W' })], { histories: { '1d!\nm:p': [[1, 30], [2, 60]] } });
    const { at } = widget(s);
    expect([...at('a').querySelectorAll('.wb-arc-zone')].map(z => z.getAttribute('class'))).toEqual(['wb-arc-zone green', 'wb-arc-zone yellow', 'wb-arc-zone red']);
    expect(at('a').querySelector('.wb-arc-fill')!.getAttribute('class')).toBe('wb-arc-fill red');
    expect(at('a').querySelector('.wb-arc-range')).toBeTruthy();
    expect(at('b').querySelector('.wb-level i')!.className).toBe('green');
    expect([at('b').querySelector<HTMLElement>('.wb-level-range')!.style.left, at('b').querySelector<HTMLElement>('.wb-level-range')!.style.width]).toEqual(['30%', '30%']);
  });

  it("draws Chart · Basic's areas, values at the top, chips below, a zero scale and below zero in yellow", () => {
    const now = Date.now();
    const histories = { '24h\na:t': Array.from({ length: 6 }, (_, i) => [now - (5 - i) * 3600e3, i - 2]) };
    const s = state([part('c', 'chart', { series: [{ slot: 'a:t', color: null, title: 'Outside' }], span: '24h', chartStyle: 'area', header: true, chartLegend: 'below', negative: true, chartScale: 'zero', smooth: true, at: { x: 0, y: 0, w: 4, h: 3 } })],
      [{ ...value('a:t', -1.5), name: 'Garden' }], { histories });
    const { at } = widget(s);
    const c = at('c');
    expect(c.querySelector('.wb-chart-hval .v')!.classList.contains('export')).toBe(true);
    expect([c.querySelector('.wb-chart-hsub')!.textContent, c.querySelector('.wb-chart-chip')!.textContent]).toEqual(['Outside', 'Outside']);
    expect(c.lastElementChild!.classList.contains('wb-chart-chips')).toBe(true);
    expect(c.querySelectorAll('.wb-chart-area')).toHaveLength(2);
    expect(c.querySelector('.wb-chart-line.export')).toBeTruthy();
  });

  it("fills a container by a value's level, as Device Values' percentages", () => {
    const { at } = widget(state([part('box', 'container', { mode: 'free', style: 'tile', fillBy: { slot: 'b:bat' }, redBelow: 10, yellowBelow: 20, parts: [] })], [value('b:bat', 15, { units: '%', min: 0, max: 100 })]));
    expect([at('box').classList.contains('wb-filled'), at('box').dataset.level, at('box').style.getPropertyValue('--wb-fill')]).toEqual([true, 'yellow', '15%']);
  });

  it("draws a choice as Presets' buttons and a pages container's dots as the Smart Stack's", () => {
    const { at } = widget(state([part('c', 'choice', { slot: 'a:m', choices: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] })], [value('a:m', 'b', { type: 'enum', units: null })]));
    expect(at('c').querySelector<HTMLElement>('.wb-presets')!.style.getPropertyValue('--wb-count')).toBe('2');
    const css = readFileSync('widgets/custom/public/widget.css', 'utf8');
    expect(css).toContain('.wb-nav-dots .wb-pagebtn.on::before { width: 16px;');
  });
});

describe("a container's fill at its strength (2026-11-24, the user: like the normal tiles)", () => {
  it('draws a palette colour as the normal tiles (Like the widgets), half or full, and a colour of its own solid', () => {
    const box = (id: string, background: object) => part(id, 'container', { mode: 'grid', style: 'tile', background, parts: [] });
    const { at } = widget(state([
      box('w', { kind: 'color', from: 'blue' }), box('h', { kind: 'color', from: 'blue', dim: 'half' }),
      box('f', { kind: 'gradient', from: 'red', to: 'orange', angle: 90, dim: 'full' }), box('x', { kind: 'color', from: '#2d4c7a' }),
    ]));
    expect(['w', 'h', 'f', 'x'].map(id => [...at(id).classList].filter(c => /^wb-(dim|bg)-/.test(c)).join(' '))).toEqual(['wb-dim-widget', 'wb-dim-half', 'wb-dim-full', 'wb-dim-widget wb-bg-hex']);
    expect([at('w').style.getPropertyValue('--wb-from'), at('w').style.getPropertyValue('--wb-on'), at('f').style.getPropertyValue('--wb-to-bright'), at('f').style.getPropertyValue('--wb-angle')])
      .toEqual(['var(--wk-blue)', 'var(--wk-on-blue)', 'var(--wk-orange-bright)', '90deg']);
    expect(at('x').style.getPropertyValue('--wb-on')).toBe('#FFFFFF');
    const css = readFileSync('widgets/custom/public/widget.css', 'utf8');
    expect(css).toContain('.wb.wk-deep .wb-box-bg.wb-dim-widget, .wb-box-bg.wb-dim-widget.wb-bg-hex { --wb-mix: 100%;');
  });
});
