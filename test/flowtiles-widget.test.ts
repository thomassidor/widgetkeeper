// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeFrame, frameElements } from './helpers/fakeFrame.js';
import { loadMount, loadWidget } from './helpers/loadWidget.js';
import { touch } from './helpers/touch.js';
import { flowTileKey } from '../lib/FlowTileService.js';

let win: any;
beforeAll(() => { win = loadWidget('flowtiles'); loadMount('flowtiles'); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

// Numbers follow the screen's locale, so the expected text is formatted the same way.
const num = (n: number, o: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }) => n.toLocaleString(undefined, o);

const tile = (key: string, extra: object = {}) => ({
  key, name: key[0].toUpperCase() + key.slice(1), kind: 'text', text: '', number: null, units: null, decimals: 'auto',
  second: '', icon: null, color: null, fill: null, updatedAt: 0, tappable: false, ...extra,
});
const state = (tiles: object[], key = 'tiles') => ({ now: Date.now(), language: 'en', board: { key, name: key, tiles } });

function widget(tiles: object[], opts: object = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createFlowTilesWidget(root, opts);
  w.setState(state(tiles));
  const tiles_ = () => [...root.querySelectorAll<HTMLElement>('.vt-grid > .vt-tile')];
  const text = (sel: string) => tiles_().map(t => t.querySelector(sel)!.textContent);
  const message = () => root.querySelector<HTMLElement>('.vt-message')!;
  return { w, root, tiles: tiles_, text, message };
}

describe('render', () => {
  it("draws Device Values' tiles: the value over the name, in the order added", () => {
    const { root, text } = widget([tile('bins', { text: 'Paper' }), tile('car', { kind: 'number', number: 214, units: 'km' })]);
    expect(root.classList.contains('vt')).toBe(true);
    expect(text('.vt-name')).toEqual(['Bins', 'Car']);
    expect(text('.vt-value')).toEqual(['Paper', `${num(214)} km`]);
  });

  it('formats numbers in the screen locale: up to 2 decimals, or exactly as the card says, units attached for ° and %', () => {
    const { text } = widget([
      tile('a', { kind: 'number', number: 21.456, units: '°C' }),
      tile('b', { kind: 'number', number: 2.5, units: 'kr', decimals: '2' }),
      tile('c', { kind: 'number', number: 82.4, units: '%', decimals: '0' }),
      tile('d', { kind: 'number', number: 3 }),
    ]);
    expect(text('.vt-value')).toEqual([`${num(21.46)}°C`, `${num(2.5, { minimumFractionDigits: 2 })} kr`, '82%', '3']);
  });

  it('shows the icon (a mask of the kit icon), or none; the second line, or none', () => {
    const { tiles, text } = widget([tile('car', { icon: 'car', second: '82 %' }), tile('bins', { icon: 'bogus' })]);
    const [car, bins] = tiles();
    expect(car.querySelector<HTMLElement>('.vt-icon')!.style.getPropertyValue('--vt-mask')).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(bins.querySelector('.vt-icon')!.classList.contains('ft-none')).toBe(true);
    expect(bins.classList.contains('ft-noicon')).toBe(true);
    expect(text('.vt-second-value')).toEqual(['82 %', '']);
    expect(bins.querySelector<HTMLElement>('.vt-second')!.hidden).toBe(true);
    expect(car.classList.contains('has-second')).toBe(true);
  });

  it('colours and fills from the Flow cards: a known colour only, the fill clamped', () => {
    const { tiles } = widget([tile('a', { color: 'green', fill: 82 }), tile('b', { color: 'magenta', fill: 140 }), tile('c')]);
    const [a, b, c] = tiles();
    expect([a.dataset.color, a.classList.contains('filled'), a.style.getPropertyValue('--vt-fill')]).toEqual(['green', true, '82%']);
    expect([b.dataset.color, b.style.getPropertyValue('--vt-fill')]).toEqual([undefined, '100%']);
    expect([c.classList.contains('filled'), c.style.getPropertyValue('--vt-fill')]).toEqual([false, '']);
  });

  it('draws the ink copy for Vivid fills only', () => {
    expect(widget([tile('a', { fill: 50 })]).root.querySelector('.vt-ink')).toBeNull();
    const { root } = widget([tile('a', { fill: 50, text: 'Hi' })], { colorStyle: 'deep' });
    expect(root.classList.contains('wk-deep')).toBe(true);
    expect(root.querySelector('.vt-ink .vt-value')!.textContent).toBe('Hi');
  });

  it('takes 3, 2 or 1 columns, compact or pill', () => {
    expect(widget([]).root.dataset.columns).toBe('3');
    expect(widget([], { columns: '1' }).root.dataset.columns).toBe('1');
    expect(widget([], { columns: 'x' }).root.dataset.columns).toBe('3');
    expect(widget([], { tileStyle: 'pill' }).root.classList.contains('vt-pill')).toBe(true);
  });

  it('orders by name, or shows only the tiles named, in that order', () => {
    const list = [tile('car'), tile('bins'), tile('alarm')];
    expect(widget(list, { order: 'name' }).text('.vt-name')).toEqual(['Alarm', 'Bins', 'Car']);
    expect(widget(list, { only: ' CAR, nope,alarm,car ', order: 'name' }).text('.vt-name')).toEqual(['Car', 'Alarm']);
  });

  it('says when the board is empty, and when none of Show only is on it', () => {
    expect(widget([]).message().textContent).toBe('No tiles yet. Add one with the Flow card Set Flow Tile.');
    expect(widget([tile('car')], { only: 'bins' }).message().textContent).toBe('None of the tiles in Show only are on this board yet.');
    const { message, tiles } = widget([tile('car')]);
    expect([message().style.display, tiles().length]).toEqual(['none', 1]);
  });

  it('shows when a tile changed, with Show when it changed, where no second line is set', () => {
    const at = new Date(); at.setHours(9, 5, 0, 0);
    const { text } = widget([tile('a', { updatedAt: at.getTime() }), tile('b', { updatedAt: at.getTime(), second: 'Own' })], { showAge: true });
    const [a, b] = text('.vt-second-value');
    expect(a).toMatch(/9.05|09.05/);
    expect(b).toBe('Own');
  });

  it("takes a realtime board only when it's this widget's", () => {
    const { w, text } = widget([tile('a', { text: '1' })]);
    w.pushBoard({ key: 'other', tiles: [tile('a', { text: 'x' })] }, 'tiles');
    expect(text('.vt-value')).toEqual(['1']);
    w.pushBoard({ key: 'tiles', tiles: [tile('a', { text: '2' }), tile('b')] }, 'tiles');
    expect(text('.vt-value')).toEqual(['2', '']);
  });

  it('keys boards and tiles as the app does', () => {
    for (const name of ['Car', ' car ', '', 'ÆBLE', '__proto__', 'Constructor', 'x'.repeat(80)]) {
      expect(win.flowTileKey(name)).toBe(flowTileKey(name));
      expect(win.flowTileKey(name, 'Tiles')).toBe(flowTileKey(name, 'Tiles'));
    }
  });
});

describe('taps', () => {
  const tap = (node: HTMLElement) => { touch(node, 'touchstart', 5, 5); touch(node, 'touchend', 5, 5); };

  it('taps only a tile a Flow listens to, lighting it up unless the effect is None', async () => {
    const onTap = vi.fn(async () => {});
    const { tiles } = widget([tile('car', { tappable: true }), tile('bins')], { onTap });
    const [car, bins] = tiles();
    expect([car.getAttribute('role'), car.tabIndex, bins.getAttribute('role')]).toEqual(['button', 0, null]);
    tap(bins);
    expect(onTap).not.toHaveBeenCalled();
    tap(car);
    expect(onTap).toHaveBeenCalledWith('Car');
    expect(car.classList.contains('ft-flash')).toBe(true);
    const none = widget([tile('car', { tappable: true })], { onTap, tapEffect: 'none' });
    tap(none.tiles()[0]);
    expect(none.tiles()[0].classList.contains('ft-flash')).toBe(false);
  });

  it('shakes the tile and says so when the tap fails, and ignores taps meanwhile', async () => {
    let fail: (e: Error) => void = () => {};
    const onTap = vi.fn(() => new Promise<void>((_, reject) => { fail = reject; }));
    const { tiles, message } = widget([tile('car', { tappable: true })], { onTap });
    tap(tiles()[0]);
    tap(tiles()[0]);
    expect(onTap).toHaveBeenCalledTimes(1);
    fail(new Error('gone'));
    await Promise.resolve(); await Promise.resolve();
    expect(tiles()[0].classList.contains('shake')).toBe(true);
    expect(message().textContent).toBe('Could not tap Car.');
  });
});

describe('mount', () => {
  /** The widget's own reads, without the app's Tile shadows (asked once after the first). */
  const reads = (api: { mock: { calls: unknown[][] } }) => api.mock.calls.filter(c => c[1] !== '/tile-shadow').length;
  it('asks for its board, follows its realtime events and sends a tap with a vibration', async () => {
    vi.useFakeTimers();
    const api = vi.fn(async (method: string, _path: string) => (method === 'GET' ? state([tile('car', { tappable: true, text: 'Full' })], 'car') : { ok: true }));
    const Homey = fakeFrame({ board: { id: 'Car', name: 'Car' }, columns: '2' }, { api });
    const { frame, root } = frameElements();
    win.mountFlowTilesWidget(Homey, { root, frame });
    await vi.advanceTimersByTimeAsync(10);
    expect(api.mock.calls[0][1]).toMatch(/^\/state\?board=Car/);
    expect(root.querySelector('.vt-value')!.textContent).toBe('Full');
    Homey.emit('flowtiles:state', { key: 'car', name: 'Car', tiles: [tile('car', { tappable: true, text: 'Charging' })] });
    expect(root.querySelector('.vt-value')!.textContent).toBe('Charging');
    const node = root.querySelector<HTMLElement>('.vt-tile')!;
    touch(node, 'touchstart', 1, 1); touch(node, 'touchend', 1, 1);
    await vi.advanceTimersByTimeAsync(0);
    expect(Homey.hapticFeedback).toHaveBeenCalled();
    expect(api).toHaveBeenLastCalledWith('POST', '/tap', { board: 'Car', tile: 'Car' });
  });

  it('asks for Tiles without a board picked, and keeps the tiles when a refresh fails', async () => {
    vi.useFakeTimers();
    let ok = true;
    const api = vi.fn(async (_method: string, _path: string) => { if (!ok) throw new Error('offline'); return state([tile('a', { text: '1' })]); });
    const Homey = fakeFrame({}, { api });
    const { frame, root } = frameElements();
    win.mountFlowTilesWidget(Homey, { root, frame });
    await vi.advanceTimersByTimeAsync(10);
    expect(api.mock.calls[0][1]).toMatch(/^\/state\?board=(&|$)/);
    ok = false;
    await vi.advanceTimersByTimeAsync(5 * 60e3);
    expect(root.querySelectorAll('.vt-grid > .vt-tile')).toHaveLength(1);
    expect(root.querySelector('.vt-message')!.textContent).toBe('Could not load the tiles.');
  });

  it('tries a failed read again after 5 s', async () => {
    vi.useFakeTimers();
    let ok = false;
    const api = vi.fn(async (_method: string, _path: string) => { if (!ok) throw new Error('busy'); return state([tile('a', { text: '1' })]); });
    const Homey = fakeFrame({}, { api });
    const { frame, root } = frameElements();
    win.mountFlowTilesWidget(Homey, { root, frame });
    await vi.advanceTimersByTimeAsync(10);
    expect(root.querySelector('.vt-message')!.textContent).toBe('Could not load the tiles.');
    ok = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(root.querySelector('.vt-value')!.textContent).toBe('1');
  });

  it('reads again when the page is back after 30 s hidden', async () => {
    vi.useFakeTimers();
    const api = vi.fn(async (_method: string, _path: string) => state([tile('a', { text: '1' })]));
    const Homey = fakeFrame({}, { api });
    const { frame, root } = frameElements();
    win.mountFlowTilesWidget(Homey, { root, frame });
    await vi.advanceTimersByTimeAsync(10);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(30e3);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    hidden.mockRestore();
    await vi.advanceTimersByTimeAsync(0);
    expect(reads(api)).toBe(2);
  });

  it("doesn't let a read that left before a realtime change undo it", async () => {
    vi.useFakeTimers();
    const answers: ((value: any) => void)[] = [];
    const api = vi.fn((_method: string, path: string) => (path === '/tile-shadow' ? Promise.resolve({}) : new Promise((resolve) => { answers.push(resolve); })));
    const Homey = fakeFrame({}, { api });
    const { frame, root } = frameElements();
    win.mountFlowTilesWidget(Homey, { root, frame });
    await vi.advanceTimersByTimeAsync(0);
    Homey.emit('flowtiles:state', { key: 'tiles', name: 'Tiles', tiles: [tile('a', { text: 'new' })] });
    expect(reads(api)).toBe(2);
    answers[0](state([tile('a', { text: 'old' })]));
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.vt-value')!.textContent).toBe('new');
    answers[1](state([tile('a', { text: 'new' })]));
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.vt-value')!.textContent).toBe('new');
    expect(Homey.ready).toHaveBeenCalled();
    // Nothing on its way: a change is only taken, with no read.
    Homey.emit('flowtiles:state', { key: 'tiles', name: 'Tiles', tiles: [tile('a', { text: 'newer' })] });
    expect(reads(api)).toBe(2);
    // Another board's change is none of its business.
    Homey.emit('flowtiles:state', { key: 'other', name: 'Other', tiles: [] });
    expect(root.querySelector('.vt-value')!.textContent).toBe('newer');
  });
});
