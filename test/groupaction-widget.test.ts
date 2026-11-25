// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWidget } from './helpers/loadWidget.js';
import { touch as fireTouch } from './helpers/touch.js';

let win: any;
beforeAll(() => { win = loadWidget('groupaction'); });
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

const ROOM = { id: 'z1', name: 'Living room' };
const qa = (capabilityId: string, value: unknown, extra: object = {}) => ({ capabilityId, value, actionable: true, momentary: false, icon: null, ...extra });
const light = (id: string, value: boolean, extra: object = {}) => ({ id, name: `Lamp ${id}`, icon: 'data:image/svg+xml;base64,AA==', zone: ROOM, quickAction: qa('onoff', value), ...extra });
const lock = (id: string, value: boolean) => ({ id, name: `Door ${id}`, icon: null, zone: { id: `z-${id}`, name: `Room ${id}` }, quickAction: qa('locked', value) });

function widget(devices: any[], options: object = {}, onTrigger: any = vi.fn(async () => {})) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createGroupActionWidget(root, { onTrigger, ...options });
  w.setState(devices);
  const tile = root.querySelector<HTMLButtonElement>('.ga-tile')!;
  const text = (cls: string) => root.querySelector(`.${cls}`)!.textContent;
  const dots = () => [...root.querySelectorAll('.ga-dots i')].map(i => i.className || '-').join(' ');
  const level = () => root.querySelector<HTMLElement>('.ga-switch')!.dataset.level;
  return { w, root, tile, text, dots, level, onTrigger };
}

describe('render', () => {
  it('names the tile after the room the devices share, and counts how many are on', () => {
    const { text, dots, level, tile } = widget([light('a', true), light('b', false), light('c', true), light('d', false)]);
    expect(text('ga-name')).toBe('Living room');
    expect(text('ga-state')).toBe('2 of 4 on');
    expect(dots()).toBe('l - l -');
    expect(level()).toBe('mid');
    expect(tile.classList.contains('some')).toBe(true);
    expect(tile.classList.contains('active')).toBe(false);
  });

  it('says All on and All off, with the switch at either end', () => {
    const on = widget([light('a', true), light('b', true)]);
    expect(on.text('ga-state')).toBe('All on');
    expect(on.level()).toBe('on');
    expect(on.tile.classList.contains('active')).toBe(true);
    const off = widget([light('a', false), light('b', false)]);
    expect(off.text('ga-state')).toBe('All off');
    expect(off.level()).toBe('off');
    expect(off.tile.classList.contains('active') || off.tile.classList.contains('some')).toBe(false);
  });

  it('takes a typed name, else the first device and how many more when the rooms differ', () => {
    expect(widget([light('a', true)], { name: ' Downstairs ' }).text('ga-name')).toBe('Downstairs');
    expect(widget([lock('a', true), lock('b', true), lock('c', true)]).text('ga-name')).toBe('Door a and 2 more');
    expect(widget([lock('a', true)]).text('ga-name')).toBe('Door a');
  });

  it('leaves unavailable and deleted devices out of the count, and says how many', () => {
    const { text, dots, tile } = widget([light('a', true), light('b', false), light('c', true, { offline: true }), { id: 'gone', missing: true }]);
    expect(text('ga-state')).toBe('1 of 2 on · 2 unavailable');
    expect(root(tile).querySelector('.ga-state')!.classList.contains('warn')).toBe(true);
    expect(dots()).toBe('l - x x');
  });

  it('words locks by what is open, in orange', () => {
    const { text, tile } = widget([lock('a', true), lock('b', false), lock('c', true)]);
    expect(text('ga-state')).toBe('1 of 3 unlocked');
    expect(root(tile).querySelector('.ga-state')!.classList.contains('warn')).toBe(true);
    expect(widget([lock('a', true), lock('b', true)]).text('ga-state')).toBe('All locked');
  });

  it('leaves out devices with another quick action, and says which', () => {
    const speaker = { id: 's', name: 'Speaker', icon: null, zone: ROOM, quickAction: qa('speaker_playing', true) };
    const { text, dots } = widget([light('a', true), speaker, light('b', false)]);
    expect(text('ga-state')).toBe('1 of 2 on');
    expect(dots()).toBe('l -');
    expect(text('ga-note')).toBe('Left out (another quick action): Speaker');
  });

  it('marks the tile unavailable once every device is', () => {
    const { tile } = widget([light('a', true, { offline: true }), light('b', false, { offline: true })]);
    expect(tile.classList.contains('wk-offline')).toBe(true);
  });

  it('says so when no device has a quick action', () => {
    const { text, tile } = widget([{ id: 'x', name: 'Sensor', icon: null, quickAction: null }]);
    expect(text('ga-state')).toBe('None of these devices has a quick action.');
    expect(tile.disabled).toBe(true);
  });
});

const root = (tile: HTMLElement) => tile.parentElement!;

describe('a tap', () => {
  it('turns the ones that are on off when any is on', async () => {
    const { tile, onTrigger, text } = widget([light('a', true), light('b', false), light('c', true)]);
    tile.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(onTrigger.mock.calls).toEqual([['a', false], ['c', false]]);
    expect(text('ga-state')).toBe('All off'); // shown at once, before the devices confirm
  });

  it('turns them all on when none is', async () => {
    const { tile, onTrigger } = widget([light('a', false), light('b', false)]);
    tile.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(onTrigger.mock.calls).toEqual([['a', true], ['b', true]]);
  });

  it('locks the unlocked ones, and unlocks all only when all are locked', async () => {
    const mixed = widget([lock('a', true), lock('b', false)]);
    mixed.tile.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(mixed.onTrigger.mock.calls).toEqual([['b', true]]);
    const locked = widget([lock('a', true), lock('b', true)]);
    locked.tile.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(locked.onTrigger.mock.calls).toEqual([['a', false], ['b', false]]);
  });

  it('still sends to an unavailable device, judging by the others', async () => {
    const { tile, onTrigger } = widget([light('a', false), light('b', true, { offline: true })]);
    tile.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(onTrigger.mock.calls).toEqual([['a', true]]);
  });

  it('presses every button of a momentary group', async () => {
    const button = (id: string) => ({ id, name: id, icon: null, zone: null, quickAction: qa('button', false, { momentary: true }) });
    const { tile, onTrigger, text, root: r } = widget([button('x'), button('y')]);
    expect(text('ga-state')).toBe('2 devices');
    expect(r.querySelector<HTMLElement>('.ga-switch')!.style.display).toBe('none');
    tile.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(onTrigger.mock.calls).toEqual([['x', true], ['y', true]]);
    expect(tile.classList.contains('active')).toBe(true);
    await vi.advanceTimersByTimeAsync(700);
    expect(tile.classList.contains('active')).toBe(false);
  });

  it('shakes and names the devices that failed, and shows their state again', async () => {
    const onTrigger = vi.fn(async (id: string) => { if (id === 'b') throw new Error('nope'); });
    const { tile, text, root: r } = widget([light('a', false), light('b', false)], {}, onTrigger);
    tile.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(tile.classList.contains('shake')).toBe(true);
    expect(text('ga-message')).toBe('Could not change Lamp b.');
    expect(r.querySelector('.ga-message')!.classList.contains('error')).toBe(true);
    expect(text('ga-state')).toBe('1 of 2 on');
  });

  it('follows the devices as they report', () => {
    const { w, text } = widget([light('a', false), light('b', false)]);
    w.pushChange({ deviceId: 'b', capabilityId: 'onoff', value: true });
    expect(text('ga-state')).toBe('1 of 2 on');
    w.pushChange({ deviceId: 'b', capabilityId: 'dim', value: 0.5 }); // another capability: ignored
    expect(text('ga-state')).toBe('1 of 2 on');
  });

  it('vibrates on a tap that sends something', async () => {
    const onHaptic = vi.fn();
    const { tile } = widget([light('a', false)], { onHaptic });
    tile.click();
    expect(onHaptic).toHaveBeenCalledOnce();
  });
});

describe('Activate with', () => {
  it('double: the first tap asks, the second within 3 s acts', async () => {
    const { tile, onTrigger, text } = widget([lock('a', true), lock('b', false)], { press: 'double' });
    tile.click();
    expect(text('ga-name')).toBe('Tap again');
    expect(tile.classList.contains('confirm')).toBe(true);
    expect(onTrigger).not.toHaveBeenCalled();
    tile.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(onTrigger.mock.calls).toEqual([['b', true]]);
  });

  it('double: a change in between asks again', async () => {
    const { w, tile, onTrigger } = widget([light('a', false), light('b', false)], { press: 'double' });
    tile.click();
    w.pushChange({ deviceId: 'a', capabilityId: 'onoff', value: true });
    expect(tile.classList.contains('confirm')).toBe(false);
    tile.click();
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('long: acts once held, says Hold after a short tap', async () => {
    const { tile, onTrigger, text } = widget([light('a', false)], { press: 'long' });
    fireTouch(tile, 'touchstart', 10, 10);
    await vi.advanceTimersByTimeAsync(100);
    fireTouch(tile, 'touchend', 10, 10);
    await vi.advanceTimersByTimeAsync(0);
    expect(text('ga-name')).toBe('Hold');
    expect(onTrigger).not.toHaveBeenCalled();
    fireTouch(tile, 'touchstart', 10, 10);
    await vi.advanceTimersByTimeAsync(650);
    expect(onTrigger).toHaveBeenCalledExactlyOnceWith('a', true);
  });
});
