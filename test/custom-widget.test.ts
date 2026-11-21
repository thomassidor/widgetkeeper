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
